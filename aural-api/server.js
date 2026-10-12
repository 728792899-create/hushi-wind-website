const {
  recordVersionWhere,
  nextUpdatedAt,
  updateWithVersion,
  withContentRevision,
} = require('./lib/record-version');
const { reconcileCatalogSnapshot, contentHistory } = require('./lib/content-history');
require('./scripts/load-env').loadEnvFile();
const { runMaintenance } = require('./lib/maintenance');
const { inquiryScope } = require('./lib/crm-scope');
const { monitorContactAccess } = require('./lib/contact-monitor');
const { appendOperationLog, initializeAuditIntegrity, verifyAuditIntegrity } = require('./lib/audit-integrity');
const { createBackupScheduler } = require('./lib/scheduled-backup');
const express = require('express');
const cors = require('cors');
const { PrismaClient, Prisma } = require('@prisma/client');
const { createUnitOfWork } = require('./lib/unit-of-work');
const {
  registerContentWorkflows,
  initializeCatalog,
  hash: contentHash,
} = require('./lib/content-workflows');
const { createNotificationWorker } = require('./lib/notification-worker');
const {
  resolveDatabaseFile,
  createDatabaseBackup,
} = require('./lib/database-backup');
const { restoreBackupDrill } = require('./lib/restore-drill');
const {
  canonicalUploadUrl,
  uploadFilePath,
  hideContact,
  redactPrivate,
  sanitizeMetadata,
  ExpiringBuckets,
  csvCell,
} = require('./lib/security');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { collectContentReferences } = require('./lib/resource-references');
const { categories: mediaCategories, readMetadata, buildMediaReferences, describeMedia, historicalMediaReferences } = require('./lib/media-library');

const app = express();
app.disable('x-powered-by');
const database = withContentRevision(new PrismaClient());
const {
  prisma,
  handler: writeHandler,
  afterCommit,
  transaction,
} = createUnitOfWork(database);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const createError = (status, code, message) =>
  new HttpError(status, code, message);
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const ADMIN_TOKEN_SECRET =
  process.env.ADMIN_TOKEN_SECRET || 'hushi-local-admin-secret';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const isStrongPassword = (password) => {
  const value = String(password || '');
  const minLength = IS_PRODUCTION ? 12 : 8;
  const baseRules =
    value.length >= minLength &&
    value.length <= 64 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value);
  return IS_PRODUCTION
    ? baseRules &&
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value) &&
        /[^A-Za-z0-9]/.test(value)
    : baseRules;
};
const passwordRequirements = IS_PRODUCTION
  ? '12–64 位，包含大小写字母、数字和符号'
  : '8–64 位，包含字母和数字';
// 绝对时长：自登录起算，续期不能延长；空闲时长：每次续期只顺延这么久，
// 后台仅在用户有操作时续期，因此离开电脑超过空闲时长即需重新登录。
const ADMIN_TOKEN_TTL_MS =
  Number.parseInt(process.env.ADMIN_TOKEN_TTL_MS || '', 10) ||
  1000 * 60 * 60 * 12;
const ADMIN_IDLE_TIMEOUT_MS = Math.min(
  Number.parseInt(process.env.ADMIN_IDLE_TIMEOUT_MS || '', 10) ||
    1000 * 60 * 30,
  ADMIN_TOKEN_TTL_MS,
);
const LOGIN_LOCK_AFTER = 5;
const LOGIN_LOCK_MS = 1000 * 60 * 15;
const API_RATE_WINDOW_MS =
  Number.parseInt(process.env.API_RATE_WINDOW_MS || '', 10) || 1000 * 60;
const API_RATE_LIMIT =
  Number.parseInt(process.env.API_RATE_LIMIT || '', 10) ||
  (IS_PRODUCTION ? 180 : 900);
const PUBLIC_FORM_RATE_WINDOW_MS =
  Number.parseInt(process.env.PUBLIC_FORM_RATE_WINDOW_MS || '', 10) ||
  1000 * 60 * 10;
const PUBLIC_FORM_RATE_LIMIT =
  Number.parseInt(process.env.PUBLIC_FORM_RATE_LIMIT || '', 10) ||
  (IS_PRODUCTION ? 5 : 20);
const PUBLIC_FORM_MIN_ELAPSED_MS =
  Number.parseInt(process.env.PUBLIC_FORM_MIN_ELAPSED_MS || '', 10) || 1800;
const PUBLIC_FORM_MAX_AGE_MS =
  Number.parseInt(process.env.PUBLIC_FORM_MAX_AGE_MS || '', 10) ||
  1000 * 60 * 60 * 24;
const MAX_UPLOAD_BYTES =
  Number.parseInt(process.env.MAX_UPLOAD_BYTES || '', 10) || 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS =
  Number.parseInt(process.env.MAX_IMAGE_PIXELS || '', 10) || 24_000_000;
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || '';
const PUBLIC_ADMIN_URL = process.env.PUBLIC_ADMIN_URL || '';
const API_PUBLIC_URL = process.env.API_PUBLIC_URL || '';
const UPLOAD_PUBLIC_BASE = (process.env.UPLOAD_PUBLIC_BASE || '').replace(
  /\/$/,
  '',
);
const RATE_LIMIT_STORE = process.env.RATE_LIMIT_STORE || 'memory';
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';
const ALERT_WEBHOOK_PROVIDER = String(
  process.env.ALERT_WEBHOOK_PROVIDER || 'generic',
).toLowerCase();
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || '';
const SENSITIVE_CONFIRMATION_TEXT =
  process.env.SENSITIVE_CONFIRMATION_TEXT || '确认执行';
const CLAMAV_SCAN_COMMAND = process.env.CLAMAV_SCAN_COMMAND || '';
const UPLOAD_CACHE_SECONDS =
  Number.parseInt(process.env.UPLOAD_CACHE_SECONDS || '', 10) ||
  60 * 60 * 24 * 365;
const ALERT_COOLDOWN_MS =
  Number.parseInt(process.env.ALERT_COOLDOWN_MINUTES || '', 10) > 0
    ? Number.parseInt(process.env.ALERT_COOLDOWN_MINUTES, 10) * 60 * 1000
    : 10 * 60 * 1000;

const splitEnvList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
const ALERT_DEDUPE_TYPES = new Set(
  splitEnvList(
    process.env.ALERT_DEDUPE_TYPES ||
      [
        'admin_ip_blocked',
        'api_5xx',
        'backup_failed',
        'disk_space_low',
        'form_submit_failed',
        'frontend_error',
        'health_check_failed',
        'login_2fa_failed',
        'login_failed',
        'login_location_changed',
        'login_locked',
        'login_locked_attempt',
        'resource_error',
        'slow_api',
      ].join(','),
  ),
);
const ADMIN_IP_ALLOWLIST = splitEnvList(
  process.env.ADMIN_IP_ALLOWLIST || process.env.ADMIN_ALLOWED_IPS,
).map((item) => item.replace(/^::ffff:/, ''));

const defaultDevOrigins = [
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://127.0.0.1:5175',
  'http://localhost:5175',
];
const configuredOrigins = splitEnvList(
  process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS,
)
  .concat(splitEnvList(process.env.PUBLIC_SITE_URL))
  .concat(splitEnvList(process.env.PUBLIC_ADMIN_URL));
const allowedOrigins = new Set(
  (IS_PRODUCTION
    ? configuredOrigins
    : configuredOrigins.concat(defaultDevOrigins)
  ).filter(Boolean),
);
const isProductionUrl = (value) =>
  /^https:\/\//i.test(String(value || '')) &&
  !/localhost|127\.0\.0\.1/i.test(String(value || ''));

// Legacy true means loopback proxy only; explicit CIDRs configure other trusted gateways.
const trustedProxies = process.env.TRUST_PROXY;
app.set(
  'trust proxy',
  ['true', '1'].includes(trustedProxies)
    ? 'loopback'
    : !trustedProxies || ['false', '0'].includes(trustedProxies)
      ? false
      : splitEnvList(trustedProxies),
);

const HOST = process.env.HOST || (IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1');
const isLoopbackHost = (host) =>
  ['127.0.0.1', 'localhost', '::1'].includes(String(host).trim());
const usingWeakAdminDefaults =
  ADMIN_USERNAME === 'admin' ||
  ADMIN_PASSWORD === '123456' ||
  ADMIN_TOKEN_SECRET === 'hushi-local-admin-secret';
if (!isLoopbackHost(HOST) && usingWeakAdminDefaults) {
  throw new Error(
    '检测到弱默认账号/密钥且监听非本地地址：请设置强 ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_TOKEN_SECRET，或将 HOST 设为 127.0.0.1 仅本机访问',
  );
}

const isLocalDevOrigin = (origin = '') =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = String(origin).replace(/\/$/, '');
    if (
      allowedOrigins.has(normalizedOrigin) ||
      (!IS_PRODUCTION && isLocalDevOrigin(normalizedOrigin))
    ) {
      return callback(null, true);
    }
    return callback(
      createError(403, 'CORS_FORBIDDEN', '当前来源不在允许访问范围内'),
    );
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    "If-Match",
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Sensitive-Confirmation',
    'Idempotency-Key',
  ],
};

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    process.env.CONTENT_SECURITY_POLICY ||
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
  );
  if (req.path.startsWith('/api/')) {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  if (IS_PRODUCTION)
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  next();
};

app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    /\/(products|articles|artists|config|support-faqs|support-downloads|audio-solutions|audio-stats|brand-timelines|ecosystem-services|quick-guides|page-contents|upload|admin\/(content-|recycle-bin|resources))/.test(
      req.originalUrl,
    )
  )
    res.once('finish', () => {
      resourceInventoryEpoch++;
      resourceInventoryCache.expiresAt = 0;
    });
  next();
});
const deploymentPaused = () =>
  Boolean(
    process.env.DEPLOY_WRITE_GATE_FILE &&
      fs.existsSync(process.env.DEPLOY_WRITE_GATE_FILE),
  );
app.use('/api', (req, res, next) => {
  if (
    deploymentPaused() &&
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    !['/auth/login', '/auth/refresh'].includes(req.path)
  ) {
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({
        error: {
          code: 'MAINTENANCE',
          message: '网站正在升级，请稍后重试。当前填写内容请保留。',
        },
      });
  }
  next();
});

if (
  IS_PRODUCTION &&
  (!process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    ADMIN_USERNAME === 'admin' ||
    ADMIN_PASSWORD === '123456' ||
    !isStrongPassword(ADMIN_PASSWORD) ||
    !process.env.ADMIN_TOKEN_SECRET ||
    ADMIN_TOKEN_SECRET === 'hushi-local-admin-secret' ||
    ADMIN_TOKEN_SECRET.length < 32 ||
    /replace|change.?me|placeholder/i.test(ADMIN_TOKEN_SECRET) ||
    /^replace[-_ ]with/i.test(ADMIN_PASSWORD) ||
    allowedOrigins.size === 0 ||
    ![
      PUBLIC_SITE_URL,
      PUBLIC_ADMIN_URL,
      API_PUBLIC_URL,
      UPLOAD_PUBLIC_BASE,
    ].every(isProductionUrl))
) {
  throw new Error(
    '生产环境必须配置 HTTPS 正式域名、CORS 白名单、强管理员密码、上传资源域名和 32 位以上 ADMIN_TOKEN_SECRET',
  );
}

if (IS_PRODUCTION && RATE_LIMIT_STORE === 'memory') {
  console.warn(
    '生产环境当前使用内存限流。多实例部署建议在网关或 Redis 层实现统一限流。',
  );
}

const healthCoreTables = [
  { name: 'Product', minRows: 0, count: () => prisma.product.count() },
  { name: 'Article', minRows: 0, count: () => prisma.article.count() },
  { name: 'AdminUser', minRows: 1, count: () => prisma.adminUser.count() },
  {
    name: 'SystemConfig',
    minRows: 1,
    count: () => prisma.systemConfig.count(),
  },
];
const HEALTH_ALERT_INTERVAL_MS = 1000 * 60 * 10;
let lastHealthAlertAt = 0;

const resolveSqliteDatabaseFile = () => resolveDatabaseFile();

const sqliteDatabaseFileHealth = () => {
  const filePath = resolveSqliteDatabaseFile();
  if (!filePath) return { status: 'skipped' };
  try {
    const stat = fs.statSync(filePath);
    return {
      status: stat.size > 0 ? 'ok' : 'error',
      path: filePath,
      size: stat.size,
    };
  } catch (error) {
    return {
      status: 'error',
      path: filePath,
      size: 0,
      errorCode: error.code || 'FILE_UNAVAILABLE',
    };
  }
};

const parseDfLine = (line) => {
  const parts = String(line || '')
    .trim()
    .split(/\s+/);
  if (parts.length < 6) return null;
  const [filesystem, blocks, used, available, usePercent, ...mountParts] =
    parts;
  return {
    filesystem,
    blocksKb: Number(blocks),
    usedKb: Number(used),
    availableKb: Number(available),
    usedPercent: Number(String(usePercent).replace('%', '')),
    mount: mountParts.join(' '),
  };
};

const resolveExistingPath = (target) => {
  let current = path.resolve(target || __dirname);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return __dirname;
    current = parent;
  }
  return current;
};

const diskStatusForPath = (target) => {
  try {
    const resolved = resolveExistingPath(target);
    if (process.platform === 'win32') {
      const drive = path.parse(resolved).root.replace(/\\$/, '');
      const ps = [
        'Get-CimInstance Win32_LogicalDisk',
        `| Where-Object { $_.DeviceID -eq '${drive.replace(/'/g, "''")}' }`,
        '| Select-Object -First 1 DeviceID,Size,FreeSpace',
        '| ConvertTo-Json -Compress',
      ].join(' ');
      const output = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
        encoding: 'utf8',
        timeout: 5000,
      });
      if (output.status !== 0)
        throw new Error(output.stderr || 'disk query failed');
      const data = JSON.parse(output.stdout || '{}');
      const sizeKb = Math.round(Number(data.Size || 0) / 1024);
      const availableKb = Math.round(Number(data.FreeSpace || 0) / 1024);
      const usedKb = Math.max(0, sizeKb - availableKb);
      return {
        target,
        mount: data.DeviceID || drive,
        filesystem: data.DeviceID || drive,
        usedPercent: sizeKb ? Math.round((usedKb / sizeKb) * 100) : 0,
        freeMb: Math.round(availableKb / 1024),
        totalMb: Math.round(sizeKb / 1024),
        status: 'ok',
      };
    }
    const output = spawnSync('df', ['-Pk', resolved], {
      encoding: 'utf8',
      timeout: 5000,
    });
    if (output.status !== 0) throw new Error(output.stderr || 'df failed');
    const row = parseDfLine(output.stdout.trim().split(/\r?\n/)[1]);
    if (!row) throw new Error('df output parse failed');
    return {
      target,
      mount: row.mount,
      filesystem: row.filesystem,
      usedPercent: row.usedPercent,
      freeMb: Math.round(row.availableKb / 1024),
      totalMb: Math.round(row.blocksKb / 1024),
      status: 'ok',
    };
  } catch (error) {
    return {
      target,
      mount: target,
      usedPercent: 0,
      freeMb: 0,
      totalMb: 0,
      status: 'error',
      error: error.message,
    };
  }
};

const diskHealthSummary = () => {
  const thresholdPercent = Number.parseFloat(
    process.env.DISK_ALERT_THRESHOLD_PERCENT || '85',
  );
  const minFreeMb = Number.parseFloat(
    process.env.DISK_ALERT_MIN_FREE_MB || '1024',
  );
  const targets = splitEnvList(
    process.env.DISK_CHECK_PATHS ||
      [
        '/',
        __dirname,
        path.join(__dirname, 'uploads'),
        path.join(__dirname, 'backups'),
      ].join(','),
  );
  const seen = new Set();
  const mounts = [];
  targets.forEach((target) => {
    const row = diskStatusForPath(target);
    const key = row.mount || target;
    if (seen.has(key)) return;
    seen.add(key);
    const danger =
      row.status === 'error' ||
      row.usedPercent >= thresholdPercent ||
      row.freeMb <= minFreeMb;
    mounts.push({ ...row, danger });
  });
  return {
    status: mounts.some((item) => item.danger) ? 'warning' : 'ok',
    thresholdPercent,
    minFreeMb,
    mounts,
  };
};

const latestBackupFile = () => {
  const candidates = splitEnvList(
    process.env.BACKUP_CHECK_DIRS ||
      [
        path.join(__dirname, 'backups'),
        path.resolve(__dirname, '..', 'backups'),
      ].join(','),
  );
  let latest = null;
  const walk = (dir, depth = 0) => {
    if (!fs.existsSync(dir) || depth > 4) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((item) => {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) return walk(fullPath, depth + 1);
      if (!/\.db$/i.test(item.name)) return;
      const stat = fs.statSync(fullPath);
      if (!stat.isFile() || stat.size <= 0) return;
      if (!latest || stat.mtimeMs > latest.mtimeMs) {
        latest = {
          filename: item.name,
          path: fullPath,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          mtimeMs: stat.mtimeMs,
        };
      }
    });
  };
  candidates.forEach((dir) => walk(path.resolve(dir)));
  return latest;
};

const pm2HealthSummary = () => {
  const expected = splitEnvList(
    process.env.PM2_EXPECTED_PROCESSES || 'shangkong-web,shangkong-api',
  );
  if (!expected.length)
    return { status: 'skipped', expected: [], processes: [] };
  const result = spawnSync('pm2', ['jlist'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.error || result.status !== 0) {
    return {
      status: 'unknown',
      expected,
      processes: [],
      error: result.error?.message || result.stderr || 'pm2 unavailable',
    };
  }
  try {
    const list = JSON.parse(result.stdout || '[]');
    const processes = expected.map((name) => {
      const item = list.find((row) => row.name === name);
      return {
        name,
        status: item?.pm2_env?.status || 'missing',
        restarts: item?.pm2_env?.restart_time || 0,
        uptime: item?.pm2_env?.pm_uptime
          ? Date.now() - item.pm2_env.pm_uptime
          : 0,
      };
    });
    return {
      status: processes.every((item) => item.status === 'online')
        ? 'ok'
        : 'warning',
      expected,
      processes,
    };
  } catch (error) {
    return { status: 'unknown', expected, processes: [], error: error.message };
  }
};

const coreTableHealth = async () =>
  Promise.all(
    healthCoreTables.map(async (table) => {
      try {
        const count = await table.count();
        const ok = count >= table.minRows;
        return {
          name: table.name,
          status: ok ? 'ok' : 'error',
          count,
          minRows: table.minRows,
        };
      } catch (error) {
        return {
          name: table.name,
          status: 'error',
          errorCode: error.code || 'TABLE_CHECK_FAILED',
        };
      }
    }),
  );

const reportHealthFailure = async (details) => {
  if (Date.now() - lastHealthAlertAt < HEALTH_ALERT_INTERVAL_MS) return;
  lastHealthAlertAt = Date.now();
  await createAlert({
    level: 'critical',
    type: 'health_check_failed',
    title: 'API 健康检查失败',
    message: '数据库连接、核心表或 SQLite 文件状态异常',
    metadata: details,
  });
};

const healthHandler = async (req, res) => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const file = sqliteDatabaseFileHealth();
    const tables = await coreTableHealth();
    const ok =
      file.status !== 'error' && tables.every((table) => table.status === 'ok');
    const payload = {
      status: ok ? 'ok' : 'error',
      service: 'hushi-api',
      time: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      database: {
        status: ok ? 'ok' : 'error',
        file,
        coreTables: tables,
      },
      responseMs: Date.now() - startedAt,
    };
    if (!ok) {
      await reportHealthFailure(payload.database);
      return res.status(503).json(payload);
    }
    return res.json(payload);
  } catch (error) {
    const payload = {
      status: 'error',
      service: 'hushi-api',
      time: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      database: {
        status: 'error',
        file: sqliteDatabaseFileHealth(),
      },
      message: IS_PRODUCTION ? 'database unavailable' : error.message,
      responseMs: Date.now() - startedAt,
    };
    await reportHealthFailure({
      ...payload.database,
      errorCode: error.code || 'DATABASE_UNAVAILABLE',
    });
    return res.status(503).json(payload);
  }
};

app.get('/api/auth/policy', (req, res) =>
  res.json({
    minLength: IS_PRODUCTION ? 12 : 8,
    maxLength: 64,
    complex: IS_PRODUCTION,
    description: passwordRequirements,
  }),
);
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

const roleDefinitions = {
  super_admin: {
    label: '超级管理员',
    permissions: ['*'],
  },
  operations: {
    label: '运营管理员',
    permissions: [
      'dashboard:read',
      'products:read',
      'products:write',
      'articles:read',
      'articles:write',
      'cms:read',
      'cms:write',
      'artists:read',
      'artists:write',
      'config:read',
      'config:write',
      'resources:read',
      'resources:write',
      'resources:upload',
      'alerts:write',
      'exports:create',
      'logs:read',
      'backups:create',
    ],
  },
  support: {
    label: '客服',
    permissions: [
      'dashboard:read',
      'crm:read',
      'crm:write',
      'crm:private',
      'exports:create',
    ],
  },
  editor: {
    label: '内容编辑',
    permissions: [
      'dashboard:read',
      'articles:read',
      'articles:write',
      'cms:read',
      'cms:write',
      'artists:read',
      'products:read',
      'resources:read',
      'resources:upload',
      'config:read',
    ],
  },
  readonly: {
    label: '只读观察员',
    permissions: [
      'dashboard:read',
      'products:read',
      'articles:read',
      'cms:read',
      'artists:read',
      'resources:read',
      'crm:read',
      'config:read',
      'logs:read',
    ],
  },
};

const publicAdminUser = (admin) => ({
  id: admin.id,
  username: admin.username,
  displayName: admin.displayName || admin.username,
  role: admin.role,
  roleLabel: roleDefinitions[admin.role]?.label || admin.role,
  status: admin.status,
  permissions: roleDefinitions[admin.role]?.permissions || [],
  totpEnabled: Boolean(admin.totpEnabled),
  lastLoginAt: admin.lastLoginAt,
});

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pick = (source, keys) => {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw createError(400, 'VALIDATION_ERROR', '请求数据必须为对象');
  return keys.reduce((result, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key))
      result[key] = source[key];
    return result;
  }, {});
};

const requiredString = (data, field, label = field) => {
  const value =
    typeof data[field] === 'string' ? data[field].trim() : data[field];
  if (typeof value !== 'string' || !value)
    throw createError(400, 'VALIDATION_ERROR', `${label}必须为非空文本`);
  data[field] = value;
};

const optionalTrim = (data, field) => {
  if (typeof data[field] === 'string') data[field] = data[field].trim();
};

const toId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw createError(400, 'INVALID_ID', '无效的数据 ID');
  return id;
};

const requireAllowed = (value, allowed, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (!allowed.includes(value))
    throw createError(
      400,
      'VALIDATION_ERROR',
      `取值不合法，允许值：${allowed.join('、')}`,
    );
  return value;
};

const modelInput = (model, body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw createError(400, 'VALIDATION_ERROR', '请求数据必须为对象');
  const fields = Prisma.dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === model.toLowerCase(),
  ).fields;
  const data = {};
  for (const f of fields) {
    if (
      f.kind !== 'scalar' ||
      ['id', 'createdAt', 'updatedAt'].includes(f.name) ||
      !Object.hasOwn(body, f.name)
    )
      continue;
    let value = body[f.name];
    if (value === null) {
      if (f.isRequired)
        throw createError(400, 'VALIDATION_ERROR', `${f.name}不能为 null`);
      data[f.name] = null;
      continue;
    }
    if (
      f.type === 'String' &&
      (typeof value !== 'string' || value.length > 200000)
    )
      throw createError(
        400,
        'VALIDATION_ERROR',
        `${f.name}必须为有效文本（不超过 200000 字符）`,
      );
    if (f.type === 'Int' || f.type === 'Float') {
      if (
        !['string', 'number'].includes(typeof value) ||
        value === '' ||
        !Number.isFinite(Number(value)) ||
        (f.type === 'Int' && !Number.isSafeInteger(Number(value)))
      )
        throw createError(400, 'VALIDATION_ERROR', `${f.name}必须为有效数字`);
      value = Number(value);
    }
    if (f.type === 'Boolean' && typeof value !== 'boolean')
      throw createError(400, 'VALIDATION_ERROR', `${f.name}必须为布尔值`);
    if (f.type === 'DateTime') {
      if (value === '' && !f.isRequired) value = null;
      else {
        if (
          !(typeof value === 'string' || value instanceof Date) ||
          Number.isNaN(new Date(value).getTime())
        )
          throw createError(400, 'VALIDATION_ERROR', `${f.name}日期不合法`);
        value = new Date(value);
      }
    }
    data[f.name] = value;
  }
  return data;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const urlPattern = /^(https?:\/\/[^\s]+|\/(?!\/)[^\s\\]*)$/i;
const contactPattern = /^[0-9+()\-\s]{6,30}$/;

const signToken = (payload) =>
  crypto
    .createHmac('sha256', ADMIN_TOKEN_SECRET)
    .update(payload)
    .digest('base64url');

const passwordSalt = () => crypto.randomBytes(16).toString('hex');

const hashPassword = (password, salt = passwordSalt()) => ({
  salt,
  hash: crypto
    .pbkdf2Sync(String(password), salt, 120000, 64, 'sha512')
    .toString('hex'),
});

const verifyPassword = (password, salt, expectedHash) => {
  const { hash } = hashPassword(password, salt);
  const current = Buffer.from(hash, 'hex');
  const expected = Buffer.from(expectedHash || '', 'hex');
  return (
    current.length === expected.length &&
    crypto.timingSafeEqual(current, expected)
  );
};

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32Encode = (buffer) => {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  return bits
    .match(/.{1,5}/g)
    .map((chunk) => base32Alphabet[Number.parseInt(chunk.padEnd(5, '0'), 2)])
    .join('');
};

const base32Decode = (value) => {
  const clean = String(value || '')
    .replace(/=+$/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
  let bits = '';
  for (const char of clean) {
    const index = base32Alphabet.indexOf(char);
    if (index === -1)
      throw createError(400, 'INVALID_TOTP_SECRET', '2FA 密钥格式不正确');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes =
    bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) || [];
  return Buffer.from(bytes);
};

const createTotpSecret = () => base32Encode(crypto.randomBytes(20));

const totpCode = (secret, counter) => {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
};

const verifyTotp = (secret, code) => {
  const normalized = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized) || !secret) return false;
  const counter = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((offset) => {
    const expected = totpCode(secret, counter + offset);
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(normalized),
    );
  });
};

const createAdminToken = (admin, authTime = Date.now()) => {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({
      kind: 'admin-session',
      sub: admin.username,
      uid: admin.id,
      role: admin.role,
      tv: admin.tokenVersion,
      iat: now,
      auth: authTime,
      exp: Math.min(now + ADMIN_IDLE_TIMEOUT_MS, authTime + ADMIN_TOKEN_TTL_MS),
    }),
  ).toString('base64url');
  return `${payload}.${signToken(payload)}`;
};

const adminSessionTiming = (token) => {
  const parsed = parseAdminToken(token).parsed || {};
  const authTime = Number(parsed.auth || parsed.iat) || Date.now();
  return {
    expiresIn: Math.max(0, Math.floor((Number(parsed.exp) - Date.now()) / 1000)),
    idleTimeout: ADMIN_IDLE_TIMEOUT_MS / 1000,
    sessionExpiresAt: new Date(authTime + ADMIN_TOKEN_TTL_MS).toISOString(),
  };
};

const parseAdminToken = (token) => {
  if (!token || typeof token !== 'string' || !token.includes('.'))
    return { ok: false, code: 'TOKEN_MISSING' };
  const [payload, signature] = token.split('.');
  const expected = signToken(payload);
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length)
      return { ok: false, code: 'TOKEN_INVALID' };
    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer))
      return { ok: false, code: 'TOKEN_INVALID' };
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    if (parsed.kind !== 'admin-session')
      return { ok: false, code: 'TOKEN_INVALID' };
    const authTime = Number(parsed.auth || parsed.iat) || 0;
    if (
      !Number(parsed.exp) ||
      Number(parsed.exp) <= Date.now() ||
      authTime + ADMIN_TOKEN_TTL_MS <= Date.now()
    )
      return { ok: false, code: 'TOKEN_EXPIRED', parsed };
    return { ok: true, parsed };
  } catch {
    return { ok: false, code: 'TOKEN_INVALID' };
  }
};

const sessionPayload = (admin, authTime) => {
  const token = createAdminToken(admin, authTime);
  return { token, ...adminSessionTiming(token) };
};

const requestAuthTime = (req) => {
  const parsed = parseAdminToken(adminTokenFromRequest(req)).parsed || {};
  return Number(parsed.auth || parsed.iat) || Date.now();
};

const adminTokenFromRequest = (req) => {
  const rawHeader = req.headers.authorization || '';
  return rawHeader.startsWith('Bearer ') ? rawHeader.slice(7).trim() : '';
};

const isAuthorizedAdmin = (req) => Boolean(req.admin);

const getRequestMeta = (req) => ({
  ip: req.ip || req.socket.remoteAddress || '',
  userAgent: req.headers['user-agent'] || '',
});

const normalizeIp = (value = '') =>
  String(value || '')
    .replace(/^::ffff:/, '')
    .trim();

// 仅用于写入持久日志表时脱敏；限流键和 IP 白名单必须继续使用原始 IP。
const anonymizeIp = (value = '') => {
  const ip = normalizeIp(value);
  if (!ip) return '';
  if (ip.includes(':')) {
    return `${ip.split(':').slice(0, 3).join(':')}::`;
  }
  const parts = ip.split('.');
  if (parts.length === 4) {
    parts[3] = '0';
    return parts.join('.');
  }
  return ip;
};

const isIpAllowed = (ip) => {
  if (!ADMIN_IP_ALLOWLIST.length) return true;
  const normalizedIp = normalizeIp(ip);
  return ADMIN_IP_ALLOWLIST.some((rule) => {
    if (rule.endsWith('*')) return normalizedIp.startsWith(rule.slice(0, -1));
    return normalizedIp === rule;
  });
};

const requireAdminIpAllowed = (req) => {
  const meta = getRequestMeta(req);
  if (isIpAllowed(meta.ip)) return;
  createAlert({
    level: 'critical',
    type: 'admin_ip_blocked',
    title: '后台访问来源被 IP 白名单拦截',
    message: `IP ${meta.ip} 不在后台白名单内`,
    metadata: { ip: meta.ip, path: req.path },
  });
  throw createError(403, 'ADMIN_IP_BLOCKED', '当前 IP 不在后台访问白名单内');
};

const requireSensitiveConfirmation = (req, actionLabel = '敏感操作') => {
  const rawValue = String(
    req.body?.confirmation ||
      req.query?.confirmation ||
      req.headers['x-sensitive-confirmation'] ||
      '',
  ).trim();
  let value = rawValue;
  try {
    value = decodeURIComponent(rawValue);
  } catch {}
  if (value !== SENSITIVE_CONFIRMATION_TEXT) {
    throw createError(
      400,
      'SENSITIVE_CONFIRMATION_REQUIRED',
      `${actionLabel}需要输入确认短语：${SENSITIVE_CONFIRMATION_TEXT}`,
    );
  }
};

const canAdmin = (admin, permission) => {
  if (!admin) return false;
  const permissions = roleDefinitions[admin.role]?.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
};

const loadAdminFromRequest = async (req) => {
  const tokenState = parseAdminToken(adminTokenFromRequest(req));
  if (!tokenState.ok) {
    req.authErrorCode = tokenState.code;
    return null;
  }
  const parsed = tokenState.parsed;
  if (!parsed?.uid) {
    req.authErrorCode = 'TOKEN_INVALID';
    return null;
  }
  const admin = await prisma.adminUser.findUnique({
    where: { id: Number(parsed.uid) },
  });
  if (!admin || admin.status !== 'active') {
    req.authErrorCode = 'ACCOUNT_INACTIVE';
    return null;
  }
  if (Number(admin.tokenVersion) !== Number(parsed.tv)) {
    req.authErrorCode = 'TOKEN_REVOKED';
    return null;
  }
  if (admin.lockedUntil && new Date(admin.lockedUntil).getTime() > Date.now()) {
    req.authErrorCode = 'ACCOUNT_LOCKED';
    return null;
  }
  return { ...publicAdminUser(admin), tokenVersion: admin.tokenVersion };
};

const requireAdmin = asyncHandler(async (req, res, next) => {
  requireAdminIpAllowed(req);
  const admin = await loadAdminFromRequest(req);
  if (!admin)
    throw createError(
      401,
      req.authErrorCode || 'UNAUTHORIZED',
      req.authErrorCode === 'TOKEN_EXPIRED'
        ? '登录已过期，请重新登录后台'
        : '请先登录后台',
    );
  req.admin = admin;
  return next();
});

const requirePermission = (permission) =>
  asyncHandler(async (req, res, next) => {
    requireAdminIpAllowed(req);
    if (!req.admin) req.admin = await loadAdminFromRequest(req);
    if (!req.admin)
      throw createError(
        401,
        req.authErrorCode || 'UNAUTHORIZED',
        req.authErrorCode === 'TOKEN_EXPIRED'
          ? '登录已过期，请重新登录后台'
          : '请先登录后台',
      );
    if (!canAdmin(req.admin, permission))
      throw createError(403, 'FORBIDDEN', '当前账号没有此操作权限');
    return next();
  });

const safeJson = (value) => {
  return JSON.stringify(value ?? null);
};

const auditOperation = async (
  req,
  {
    action,
    module,
    target = '',
    targetId = '',
    summary = '',
    beforeData = null,
    afterData = null,
  },
) => {
  if (!req.admin) return;
  const meta = getRequestMeta(req);
  await appendOperationLog(prisma, {
    adminUserId: req.admin.id,
    operator: req.admin.username,
    role: req.admin.role,
    action,
    module,
    target,
    targetId: String(targetId || ''),
    summary,
    beforeData: beforeData
      ? safeJson(module === 'crm' ? redactPrivate(beforeData) : beforeData)
      : null,
    afterData: afterData
      ? safeJson(module === 'crm' ? redactPrivate(afterData) : afterData)
      : null,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
};

const alertDedupeKey = ({ type, title = '', metadata = null }) => {
  const meta = metadata || {};
  const pathKey =
    meta.path ||
    meta.pagePath ||
    meta.form ||
    meta.username ||
    meta.mount ||
    meta.filename ||
    '';
  return [type, pathKey, title].filter(Boolean).join('|').slice(0, 240);
};

const shouldCreateAlert = async (payload) => {
  if (!ALERT_DEDUPE_TYPES.has(payload.type) || ALERT_COOLDOWN_MS <= 0)
    return true;
  const dedupeKey = alertDedupeKey(payload);
  const since = new Date(Date.now() - ALERT_COOLDOWN_MS);
  const latest = await prisma.alertRecord.findFirst({
    where: {
      type: payload.type,
      title: String(payload.title || payload.type).slice(0, 180),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) return true;
  let latestKey = '';
  try {
    latestKey = alertDedupeKey({
      type: latest.type,
      title: latest.title,
      metadata: latest.metadata ? JSON.parse(latest.metadata) : null,
    });
  } catch {
    latestKey = alertDedupeKey({ type: latest.type, title: latest.title });
  }
  return latestKey !== dedupeKey;
};

const alertLevelLabel = (level) =>
  ({
    critical: '严重',
    error: '错误',
    warning: '警告',
    info: '提醒',
  })[level] ||
  level ||
  '提醒';

const alertPlainText = ({
  level = 'warning',
  type,
  title,
  message = '',
  metadata = null,
  alertId = '',
}) => {
  const meta = metadata || {};
  return [
    `[胡氏管乐] ${alertLevelLabel(level)}报警`,
    `标题：${title || type}`,
    `类型：${type || '-'}`,
    message ? `说明：${message}` : '',
    meta.path || meta.pagePath
      ? `页面/接口：${meta.path || meta.pagePath}`
      : '',
    meta.username ? `账号：${meta.username}` : '',
    meta.ip ? `IP：${meta.ip}` : '',
    alertId ? `报警ID：${alertId}` : '',
    `时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
  ]
    .filter(Boolean)
    .join('\n');
};

const buildWebhookPayload = (payload) => {
  const text = alertPlainText(payload);
  if (
    ALERT_WEBHOOK_PROVIDER === 'wechat' ||
    ALERT_WEBHOOK_PROVIDER === 'wecom' ||
    ALERT_WEBHOOK_PROVIDER === 'qywx'
  ) {
    return { msgtype: 'text', text: { content: text } };
  }
  if (ALERT_WEBHOOK_PROVIDER === 'dingtalk') {
    return { msgtype: 'text', text: { content: text } };
  }
  if (
    ALERT_WEBHOOK_PROVIDER === 'feishu' ||
    ALERT_WEBHOOK_PROVIDER === 'lark'
  ) {
    return { msg_type: 'text', content: { text } };
  }
  return {
    level: payload.level,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    metadata: payload.metadata,
    alertId: payload.alertId,
    text,
    sentAt: new Date().toISOString(),
  };
};

const notificationWorker = createNotificationWorker(prisma, {
  url: ALERT_WEBHOOK_URL,
  provider: ALERT_WEBHOOK_PROVIDER,
  isPaused: deploymentPaused,
});
const enqueueNotification = async (type, payload) => {
  if (!ALERT_WEBHOOK_URL) return;
  await prisma.notificationDelivery.create({
    data: { type, payload: JSON.stringify(payload) },
  });
  afterCommit(() => notificationWorker.run());
};
const sendAlertWebhook = (payload) =>
  enqueueNotification('alert', buildWebhookPayload(payload));

const createAlert = async ({
  level = 'warning',
  type,
  title,
  message = '',
  metadata = null,
}) => {
  try {
    const payload = { level, type, title, message, metadata };
    if (!(await shouldCreateAlert(payload))) return null;
    const record = await prisma.alertRecord.create({
      data: {
        level,
        type,
        title: String(title || type).slice(0, 180),
        message: String(message || '').slice(0, 1000),
        metadata: metadata ? safeJson(metadata) : null,
      },
    });
    await sendAlertWebhook({ ...payload, alertId: record.id });
    if (ALERT_EMAIL_TO && !ALERT_WEBHOOK_URL && !IS_PRODUCTION) {
      console.warn(
        `Alert email target configured but no mail provider is wired: ${ALERT_EMAIL_TO}`,
      );
    }
    return record;
  } catch (error) {
    if (!IS_PRODUCTION) console.warn('Alert record failed:', error.message);
    return null;
  }
};

const notifyWebhook = (type, payload) =>
  enqueueNotification(type, {
    type,
    payload,
    sentAt: new Date().toISOString(),
  });

const saveContentVersion = async (req, module, record) => {
  if (!record?.id) return;
  await prisma.contentVersion.create({
    data: {
      module,
      recordId: record.id,
      title:
        record.title || record.name || record.question || record.slug || '',
      status: record.status || '',
      snapshot: safeJson(record),
      adminUserId: req.admin?.id,
      operator: req.admin?.username || '',
    },
  });
};

const maskContact = hideContact;
const privateCrmRow = (req, row) =>
  canAdmin(req.admin, 'crm:private') ? row : redactPrivate(row);
// 客户联系方式在列表与写入响应中一律隐藏；有 crm:private 的账号逐条调用
// /contact 查看，每次查看先写审计记录，审计失败则不返回联系方式。
const INQUIRY_CONTACT_FIELDS = ['contactInfo'];
const APPLICATION_CONTACT_FIELDS = ['email', 'phone'];
const withHiddenContact = (row, fields) => ({
  ...row,
  ...Object.fromEntries(fields.map((field) => [field, maskContact(row[field])])),
});
const revealContactHandler = (model, fields, nameField, label) => [
  requireAdmin,
  requirePermission('crm:private'),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const row = await transaction(async () => {
      const record = await prisma[model].findFirst({
        where: { id, ...(model === 'inquiry' ? inquiryScope(req.admin) : {}) },
        select: Object.fromEntries(
          ['id', nameField, ...fields].map((field) => [field, true]),
        ),
      });
      if (!record) throw createError(404, 'NOT_FOUND', `${label}不存在或已不在当前处理范围`);
      await auditOperation(req, {
        action: 'VIEW_CONTACT', module: 'crm', target: record[nameField],
        targetId: id, summary: `查看${label}联系方式`,
      });
      // Frequency alerts must not become a new deny rule. Audit failure above
      // still fails closed; monitoring failure is logged without personal data.
      try {
        await monitorContactAccess(prisma, req.admin, createAlert);
      } catch (error) {
        console.warn('Contact monitoring unavailable:', error.code || 'MONITOR_FAILED');
      }
      return record;
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: Object.fromEntries(fields.map((field) => [field, row[field] || ''])),
    });
  }),
];

const normalizePagination = (req, fallbackSize = 20) => {
  const page = Math.max(1, Math.min(10000, toInt(req.query.page, 1)));
  const pageSize = Math.max(
    1,
    Math.min(100, toInt(req.query.pageSize || req.query.perPage, fallbackSize)),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};

const paginatedPayload = (data, total, page, pageSize) => ({
  data,
  meta: {
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  },
});

const imageDimensions = (filePath, ext, suppliedBuffer) => {
  try {
    const buffer =
      suppliedBuffer ||
      (() => {
        const fd = fs.openSync(filePath, 'r');
        try {
          const out = Buffer.alloc(262144);
          return out.subarray(0, fs.readSync(fd, out, 0, out.length, 0));
        } finally {
          fs.closeSync(fd);
        }
      })();
    if (['jpg', 'jpeg'].includes(ext)) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
          return {
            width: buffer.readUInt16BE(offset + 7),
            height: buffer.readUInt16BE(offset + 5),
          };
        }
        offset += 2 + length;
      }
    }
    if (ext === 'png' && buffer.toString('ascii', 1, 4) === 'PNG') {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }
    if (ext === 'webp' && buffer.toString('ascii', 0, 4) === 'RIFF') {
      const chunk = buffer.toString('ascii', 12, 16);
      if (chunk === 'VP8X')
        return {
          width: 1 + buffer.readUIntLE(24, 3),
          height: 1 + buffer.readUIntLE(27, 3),
        };
    }
  } catch {}
  return { width: null, height: null };
};

const fileSignatures = {
  '.jpg': (buffer) =>
    buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  '.jpeg': (buffer) => fileSignatures['.jpg'](buffer),
  '.png': (buffer) => buffer.toString('ascii', 1, 4) === 'PNG',
  '.webp': (buffer) =>
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP',
  '.gif': (buffer) =>
    ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)),
  '.pdf': (buffer) => buffer.toString('ascii', 0, 5) === '%PDF-',
  '.zip': (buffer) => buffer[0] === 0x50 && buffer[1] === 0x4b,
  '.rar': (buffer) => buffer.toString('ascii', 0, 4) === 'Rar!',
  '.mp4': (buffer) => buffer.toString('ascii', 4, 8) === 'ftyp',
  '.mov': (buffer) => buffer.toString('ascii', 4, 8) === 'ftyp',
};

const assertSafeUploadedFile = (file) => {
  if (!file?.path)
    throw createError(400, 'UPLOAD_REQUIRED', '请选择要上传的文件');
  const ext = path
    .extname(file.originalname || file.filename || '')
    .toLowerCase();
  const buffer = fs.readFileSync(file.path);
  const hasDangerousText = buffer
    .slice(0, Math.min(buffer.length, 4096))
    .toString('utf8')
    .match(/<script|javascript:|<iframe|<object|<embed/i);
  if (hasDangerousText)
    throw createError(
      400,
      'DANGEROUS_UPLOAD_CONTENT',
      '上传文件包含高风险脚本内容',
    );
  const signatureCheck = fileSignatures[ext];
  if (signatureCheck && !signatureCheck(buffer))
    throw createError(
      400,
      'INVALID_UPLOAD_SIGNATURE',
      '文件内容与扩展名不匹配',
    );
  if (CLAMAV_SCAN_COMMAND) {
    const result = spawnSync(CLAMAV_SCAN_COMMAND, [file.path], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 30000,
    });
    if (result.error || result.status !== 0) {
      throw createError(
        400,
        'UPLOAD_VIRUS_SCAN_FAILED',
        '上传文件未通过安全扫描，请更换文件后重试',
      );
    }
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const dimensions = imageDimensions(file.path, ext.slice(1));
    if (
      dimensions.width &&
      dimensions.height &&
      dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
    ) {
      throw createError(400, 'IMAGE_TOO_LARGE', '图片尺寸过大，请压缩后再上传');
    }
    file.dimensions = dimensions;
  }
  return true;
};

const rateBuckets = new ExpiringBuckets();
app.use('/api', (req, res, next) => {
  const meta = getRequestMeta(req);
  const key = meta.ip;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || {
    count: 0,
    resetAt: now + API_RATE_WINDOW_MS,
  };
  if (bucket.resetAt < now) {
    bucket.count = 0;
    bucket.resetAt = now + API_RATE_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > API_RATE_LIMIT)
    return next(createError(429, 'RATE_LIMITED', '访问过于频繁，请稍后再试'));
  return next();
});

const publicFormBuckets = new ExpiringBuckets();
const bucketCleanup = setInterval(() => {
  rateBuckets.sweep();
  publicFormBuckets.sweep();
}, 60000);
bucketCleanup.unref();
const publicFormError = '提交校验未通过或过于频繁，请稍后再试';
const analyticsEvents = [
  'page_view',
  'product_view',
  'news_view',
  'search',
  'cta_click',
  'form_open',
  'form_submit',
  'form_submit_failed',
  'faq_click',
  'faq_feedback',
  'frontend_error',
  'resource_error',
  'api_error',
  'performance_metric',
];
const maxAnalyticsMetadataLength = 4000;

const sanitizeText = (value, max = 200) =>
  String(value || '')
    .trim()
    .slice(0, max);

const safeAnalyticsMetadata = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return sanitizeMetadata(value);
};

const parseAnalyticsMetadata = (value) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const normalizeAnalyticsPayload = (body = {}) => {
  const eventType = sanitizeText(body.eventType || body.type, 60);
  if (!analyticsEvents.includes(eventType))
    throw createError(400, 'INVALID_EVENT_TYPE', '无效的埋点事件类型');
  const data = {
    eventType,
    pagePath: sanitizeText(body.pagePath, 500),
    source: sanitizeText(body.source, 120),
    sessionId: sanitizeText(body.sessionId, 120),
    visitorId: sanitizeText(body.visitorId, 120),
    entityType: sanitizeText(body.entityType, 60),
    entityId: sanitizeText(body.entityId, 120),
    entityTitle: sanitizeText(body.entityTitle, 300),
    searchTerm: sanitizeText(body.searchTerm, 200),
    ctaName: sanitizeText(body.ctaName, 160),
    metadata: safeAnalyticsMetadata(body.metadata),
  };
  Object.keys(data).forEach((key) => {
    if (data[key] === '') data[key] = null;
  });
  return data;
};

const monitorAlertLabels = {
  frontend_error: '前端 JS 报错',
  resource_error: '前端资源加载失败',
  api_error: '前端 API 请求失败',
  form_submit_failed: '前台表单提交失败',
};

const recordAnalyticsEvent = async (req, payload) => {
  const meta = getRequestMeta(req);
  const data = normalizeAnalyticsPayload(payload);
  const record = await prisma.analyticsEvent.create({
    data: {
      ...data,
      ip: anonymizeIp(meta.ip),
      userAgent: meta.userAgent,
    },
  });
  if (monitorAlertLabels[data.eventType]) {
    await createAlert({
      level: data.eventType === 'form_submit_failed' ? 'critical' : 'warning',
      type: data.eventType,
      title: monitorAlertLabels[data.eventType],
      message: [data.pagePath, data.ctaName, data.entityTitle]
        .filter(Boolean)
        .join(' / '),
      metadata: {
        pagePath: data.pagePath,
        entityType: data.entityType,
        entityId: data.entityId,
        entityTitle: data.entityTitle,
        ctaName: data.ctaName,
        metadata: parseAnalyticsMetadata(data.metadata),
        ip: meta.ip,
      },
    });
  }
  return record;
};

const recordApiLog = async (req, res, startedAt, error = null) => {
  try {
    if (!req.path?.startsWith('/api') || req.path === '/api/events') return;
    const meta = getRequestMeta(req);
    const durationMs = Math.max(0, Date.now() - startedAt);
    const status = error?.status || res.statusCode || 500;
    await prisma.apiRequestLog.create({
      data: {
        method: req.method,
        path: req.path,
        status,
        durationMs,
        ip: anonymizeIp(meta.ip),
        userAgent: meta.userAgent,
        errorCode: error?.code || null,
        errorMessage: error?.message
          ? String(error.message).slice(0, 500)
          : null,
      },
    });
    if (status >= 500) {
      createAlert({
        level: 'critical',
        type: 'api_5xx',
        title: `API ${status}: ${req.method} ${req.path}`,
        message: error?.message || '服务器接口异常',
        metadata: {
          method: req.method,
          path: req.path,
          status,
          durationMs,
          ip: meta.ip,
        },
      });
    } else if (durationMs >= 2000) {
      createAlert({
        level: 'warning',
        type: 'slow_api',
        title: `慢接口: ${req.method} ${req.path}`,
        message: `${durationMs}ms`,
        metadata: {
          method: req.method,
          path: req.path,
          status,
          durationMs,
          ip: meta.ip,
        },
      });
    }
  } catch (logError) {
    if (!IS_PRODUCTION) console.warn('API log failed:', logError.message);
  }
};

app.use('/api', (req, res, next) => {
  const startedAt = Date.now();
  req.apiStartedAt = startedAt;
  res.on('finish', () => {
    if (res.statusCode < 400) recordApiLog(req, res, startedAt);
  });
  return next();
});

const assertPublicFormGuard = (req, formKey) => {
  const body = req.body || {};
  const traps = ['website', 'company', 'homepage', 'url'];
  if (traps.some((field) => String(body[field] || '').trim())) {
    throw createError(400, 'FORM_GUARD_FAILED', publicFormError);
  }

  const startedAt = Number(body.formStartedAt);
  const elapsed = Date.now() - startedAt;
  if (
    !Number.isFinite(startedAt) ||
    elapsed < PUBLIC_FORM_MIN_ELAPSED_MS ||
    elapsed > PUBLIC_FORM_MAX_AGE_MS
  ) {
    throw createError(400, 'FORM_GUARD_FAILED', publicFormError);
  }

  const meta = getRequestMeta(req);
  const key = `${meta.ip || 'unknown'}:${formKey}`;
  const now = Date.now();
  const bucket = publicFormBuckets.get(key) || {
    count: 0,
    resetAt: now + PUBLIC_FORM_RATE_WINDOW_MS,
  };
  if (bucket.resetAt < now) {
    bucket.count = 0;
    bucket.resetAt = now + PUBLIC_FORM_RATE_WINDOW_MS;
  }
  bucket.count += 1;
  publicFormBuckets.set(key, bucket);
  if (bucket.count > PUBLIC_FORM_RATE_LIMIT) {
    throw createError(429, 'FORM_RATE_LIMITED', '提交次数过多，请稍后再试');
  }
};

app.use(
  '/api',
  asyncHandler(async (req, res, next) => {
    const token = adminTokenFromRequest(req);
    if (token) {
      req.admin = await loadAdminFromRequest(req);
      if (req.admin) requireAdminIpAllowed(req);
    }
    return next();
  }),
);

app.post(
  '/api/events',
  asyncHandler(async (req, res) => {
    await recordAnalyticsEvent(req, req.body);
    res.status(201).json({ success: true });
  }),
);

const productFields = [
  'title',
  'slug',
  'type',
  'categoryName',
  'description',
  'imageUrl',
  'gallery',
  'specs',
  'features',
  'scenes',
  'warranty',
  'series',
  'quantity',
  'price',
  'isFeatured',
  'status',
  'sku',
  'model',
  'color',
  'seoTitle',
  'seoDescription',
  'seoKeywords',
  'ogImageUrl',
  'relatedProductIds',
  'accessories',
  'availableFrom',
  'availableUntil',
  'publishedAt',
  'hiddenAt',
  'lastEditedBy',
];

const articleFields = [
  'title',
  'slug',
  'description',
  'category',
  'imageUrl',
  'date',
  'views',
  'status',
  'seoTitle',
  'seoDescription',
  'seoKeywords',
  'ogImageUrl',
  'publishedAt',
  'hiddenAt',
  'lastEditedBy',
];
const statusValues = ['published', 'active', 'draft', 'hidden', 'inactive'];
const publicStatusWhere = {
  OR: [{ status: 'published' }, { status: 'active' }],
};

const inquiryFields = [
  'customerName',
  'contactInfo',
  'message',
  'inquiryType',
  'productId',
  'productTitle',
  'city',
  'budget',
  'preferredTime',
  'status',
  'priority',
  'internalNote',
  'assigneeId',
  'nextFollowUpAt',
  'serialNumber',
];
const publicInquiryFields = [
  'customerName',
  'contactInfo',
  'message',
  'inquiryType',
  'productId',
  'productTitle',
  'city',
  'budget',
  'preferredTime',
  'serialNumber',
];

const normalizeProductPayload = (body) => {
  const data = pick(modelInput('Product', body), productFields);
  [
    'title',
    'slug',
    'type',
    'categoryName',
    'description',
    'sku',
    'model',
    'color',
    'seoTitle',
    'seoDescription',
    'seoKeywords',
    'ogImageUrl',
    'relatedProductIds',
    'accessories',
    'lastEditedBy',
  ].forEach((field) => optionalTrim(data, field));
  if (Object.prototype.hasOwnProperty.call(data, 'quantity'))
    data.quantity = toInt(data.quantity, 0);
  if (Object.prototype.hasOwnProperty.call(data, 'price'))
    data.price = toFloat(data.price, 0);
  if (Object.prototype.hasOwnProperty.call(data, 'isFeatured'))
    data.isFeatured = Boolean(data.isFeatured);
  ['availableFrom', 'availableUntil', 'publishedAt', 'hiddenAt'].forEach(
    (field) => {
      if (Object.prototype.hasOwnProperty.call(data, field))
        data[field] = data[field] ? new Date(data[field]) : null;
    },
  );
  data.status = requireAllowed(data.status, statusValues, 'draft');
  if (data.status === 'active') data.status = 'published';
  return data;
};

const validateProductPayload = (body) => {
  const data = normalizeProductPayload(body);
  requiredString(data, 'title', '产品名称');
  requiredString(data, 'slug', '产品 URL 后缀');
  requiredString(data, 'type', '系统归类');
  requiredString(data, 'categoryName', '中文分类');
  if (
    !Object.prototype.hasOwnProperty.call(data, 'description') ||
    data.description == null
  )
    data.description = '';
  if (!slugPattern.test(data.slug))
    throw createError(
      400,
      'VALIDATION_ERROR',
      '产品 URL 后缀只能使用小写字母、数字和短横线',
    );
  if (data.price < 0)
    throw createError(400, 'VALIDATION_ERROR', '价格不能小于 0');
  if (data.quantity < 0)
    throw createError(400, 'VALIDATION_ERROR', '库存不能小于 0');
  if (data.imageUrl && !/^(https?:\/\/|\/uploads\/)/i.test(data.imageUrl))
    throw createError(400, 'VALIDATION_ERROR', '主图地址格式不正确');
  if (data.ogImageUrl && !/^(https?:\/\/|\/uploads\/)/i.test(data.ogImageUrl))
    throw createError(400, 'VALIDATION_ERROR', 'OG 图地址格式不正确');
  return data;
};

const statusFilterWhere = (status) => {
  if (!status || status === 'all') return {};
  if (status === 'published') return publicStatusWhere;
  return { status };
};

const normalizeArticlePayload = (body) => {
  const data = pick(modelInput('Article', body), articleFields);
  [
    'title',
    'slug',
    'category',
    'date',
    'description',
    'imageUrl',
    'seoTitle',
    'seoDescription',
    'seoKeywords',
    'ogImageUrl',
    'lastEditedBy',
  ].forEach((field) => optionalTrim(data, field));
  if (Object.prototype.hasOwnProperty.call(data, 'views'))
    data.views = toInt(data.views, 0);
  ['publishedAt', 'hiddenAt'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field))
      data[field] = data[field] ? new Date(data[field]) : null;
  });
  data.status = requireAllowed(data.status, statusValues, 'draft');
  if (data.status === 'active') data.status = 'published';
  return data;
};

const validateArticlePayload = (body) => {
  const data = normalizeArticlePayload(body);
  requiredString(data, 'title', '新闻标题');
  requiredString(data, 'category', '新闻分类');
  requiredString(data, 'date', '发布日期');
  if (data.slug && !slugPattern.test(data.slug))
    throw createError(
      400,
      'VALIDATION_ERROR',
      '新闻 URL 后缀只能使用小写字母、数字和短横线',
    );
  if (data.imageUrl && !/^(https?:\/\/|\/uploads\/)/i.test(data.imageUrl))
    throw createError(400, 'VALIDATION_ERROR', '新闻封面地址格式不正确');
  if (data.ogImageUrl && !/^(https?:\/\/|\/uploads\/)/i.test(data.ogImageUrl))
    throw createError(400, 'VALIDATION_ERROR', 'OG 图地址格式不正确');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date) &&
    Number.isNaN(new Date(data.date).getTime())
  ) {
    throw createError(400, 'VALIDATION_ERROR', '发布日期格式不正确');
  }
  return data;
};

const normalizeInquiryPayload = (body) => {
  const data = pick(modelInput('Inquiry', body), inquiryFields);
  if (
    Object.prototype.hasOwnProperty.call(data, 'productId') &&
    data.productId !== null &&
    data.productId !== ''
  ) {
    data.productId = toInt(data.productId, null);
  } else {
    delete data.productId;
  }
  if (!data.status) data.status = 'new';
  if (!data.priority) data.priority = 'normal';
  return data;
};

const validateInquiryPayload = (body, { publicOnly = true } = {}) => {
  const source = publicOnly ? pick(body, publicInquiryFields) : body;
  const data = normalizeInquiryPayload(source);
  [
    'customerName',
    'contactInfo',
    'message',
    'productTitle',
    'city',
    'budget',
    'preferredTime',
  ].forEach((field) => optionalTrim(data, field));
  requiredString(data, 'customerName', '客户姓名');
  requiredString(data, 'contactInfo', '联系方式');
  requiredString(data, 'message', '需求描述');
  if (data.customerName.length < 2 || data.customerName.length > 40)
    throw createError(400, 'VALIDATION_ERROR', '客户姓名长度不正确');
  if (!contactPattern.test(data.contactInfo))
    throw createError(400, 'VALIDATION_ERROR', '联系方式格式不正确');
  if (data.message.length < 2 || data.message.length > 1000)
    throw createError(400, 'VALIDATION_ERROR', '需求描述长度不正确');
  data.status = requireAllowed(
    data.status,
    ['new', 'contacted', 'quoted', 'processing', 'done', 'closed'],
    'new',
  );
  data.priority = requireAllowed(
    data.priority,
    ['normal', 'high', 'urgent'],
    'normal',
  );
  return data;
};

const inquiryUpdateFields = [
  'status',
  'priority',
  'internalNote',
  'isRead',
  'assigneeId',
  'nextFollowUpAt',
  'serialNumber',
];
const normalizeInquiryUpdatePayload = (body) => {
  const data = pick(modelInput('Inquiry', body), inquiryUpdateFields);
  if (Object.prototype.hasOwnProperty.call(data, 'isRead'))
    data.isRead = Boolean(data.isRead);
  if (Object.prototype.hasOwnProperty.call(data, 'status'))
    data.status = requireAllowed(
      data.status || 'new',
      ['new', 'contacted', 'quoted', 'processing', 'done', 'closed'],
      'new',
    );
  if (Object.prototype.hasOwnProperty.call(data, 'priority'))
    data.priority = requireAllowed(
      data.priority || 'normal',
      ['normal', 'high', 'urgent'],
      'normal',
    );
  if (
    Object.prototype.hasOwnProperty.call(data, 'status') &&
    data.status !== 'new'
  )
    data.followedAt = new Date();
  return data;
};

const isAdminRequest = (req) =>
  (req.query.admin === '1' || req.query.preview === '1') &&
  isAuthorizedAdmin(req);
const cleanQueryValue = (value) =>
  typeof value === 'string' ? value.trim() : '';

const queryDateRangeWhere = (req) => {
  const startDate = cleanQueryValue(req.query.startDate);
  const endDate = cleanQueryValue(req.query.endDate);
  const createdAt = {};
  if (startDate) {
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);
      createdAt.gte = start;
    }
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
  }
  return Object.keys(createdAt).length ? { createdAt } : {};
};
const normalizeDateStart = (value) => {
  const raw = cleanQueryValue(value);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalizeDateEnd = (value) => {
  const raw = cleanQueryValue(value);
  if (!raw) return null;
  const date = new Date(`${raw}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const mergeWhere = (...parts) => {
  const filtered = parts.filter((part) => part && Object.keys(part).length);
  if (!filtered.length) return {};
  if (filtered.length === 1) return filtered[0];
  return { AND: filtered };
};
const normalizeCmsPayload = (body) => {
  const data = { ...body };
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  if (Object.prototype.hasOwnProperty.call(data, 'sortOrder'))
    data.sortOrder = toInt(data.sortOrder, 0);
  data.status = requireAllowed(data.status, statusValues, 'draft');
  if (data.status === 'active') data.status = 'published';
  return data;
};

const analyticsRangeStart = (range = '7d') => {
  const now = new Date();
  const days = range === 'today' ? 0 : range === '30d' ? 29 : 6;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  return start;
};

const dateKey = (date) => {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const rangeDateKeys = (startDate) => {
  const keys = [];
  const current = new Date(startDate);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  while (current <= end) {
    keys.push(dateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return keys;
};

const countBy = (items, keyFn) =>
  items.reduce((map, item) => {
    const key = keyFn(item);
    if (!key) return map;
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});

const topCounts = (items, keyFn, labelFn = keyFn, limit = 8) => {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    const existing = map.get(key) || {
      key,
      label: labelFn(item) || key,
      count: 0,
    };
    existing.count += 1;
    map.set(key, existing);
  });
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
};

const safeParseMetadata = (event) => {
  try {
    return event.metadata ? JSON.parse(event.metadata) : {};
  } catch {
    return {};
  }
};

const pagePathOnly = (value = '') => String(value || '').split('?')[0] || '/';

const percentRate = (part, total) => {
  const numerator = Number(part || 0);
  const denominator = Number(total || 0);
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
};

const analyticsNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const analyticsSummary = async (range = '7d') => {
  const startDate = analyticsRangeStart(range);
  const [events, apiLogs] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: startDate } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    }),
    prisma.apiRequestLog.findMany({
      where: { createdAt: { gte: startDate } },
      orderBy: { createdAt: 'desc' },
      take: 3000,
    }),
  ]);
  const eventCounts = countBy(events, (event) => event.eventType);
  const productViews = events.filter(
    (event) => event.eventType === 'product_view',
  );
  const formOpens = events.filter((event) => event.eventType === 'form_open');
  const formSubmits = events.filter(
    (event) => event.eventType === 'form_submit',
  );
  const faqClickEvents = events.filter(
    (event) => event.eventType === 'faq_click',
  );
  const faqFeedbackEvents = events.filter(
    (event) => event.eventType === 'faq_feedback',
  );
  const frontendErrorEvents = events.filter(
    (event) => event.eventType === 'frontend_error',
  );
  const resourceErrorEvents = events.filter(
    (event) => event.eventType === 'resource_error',
  );
  const apiErrorEvents = events.filter(
    (event) => event.eventType === 'api_error',
  );
  const formFailedEvents = events.filter(
    (event) => event.eventType === 'form_submit_failed',
  );
  const performanceEvents = events.filter(
    (event) => event.eventType === 'performance_metric',
  );
  const dates = rangeDateKeys(startDate);
  const dailyViews = countBy(
    events.filter((event) =>
      ['page_view', 'product_view', 'news_view'].includes(event.eventType),
    ),
    (event) => dateKey(event.createdAt),
  );
  const errorLogs = apiLogs.filter((log) => log.status >= 400);
  const slowLogs = apiLogs.filter((log) => log.durationMs >= 1000);
  const requestCount = apiLogs.length;
  const formOpenCount = formOpens.length;
  const productViewCount = productViews.length;
  const submitCount = formSubmits.length;
  const pageViews = events.filter((event) => event.eventType === 'page_view');
  const ctaClicks = events.filter((event) => event.eventType === 'cta_click');
  const searchEvents = events.filter((event) => event.eventType === 'search');
  const searchClickEvents = ctaClicks.filter((event) => event.searchTerm);
  const deviceRows = events.map((event) => ({
    event,
    device: safeParseMetadata(event).device || 'unknown',
  }));
  const pageStats = new Map();
  pageViews.forEach((event) => {
    const key = pagePathOnly(event.pagePath);
    const existing = pageStats.get(key) || {
      path: key,
      views: 0,
      formOpens: 0,
      formSubmits: 0,
      ctaClicks: 0,
    };
    existing.views += 1;
    pageStats.set(key, existing);
  });
  [...formOpens, ...formSubmits, ...ctaClicks].forEach((event) => {
    const key = pagePathOnly(event.pagePath);
    const existing = pageStats.get(key) || {
      path: key,
      views: 0,
      formOpens: 0,
      formSubmits: 0,
      ctaClicks: 0,
    };
    if (event.eventType === 'form_open') existing.formOpens += 1;
    if (event.eventType === 'form_submit') existing.formSubmits += 1;
    if (event.eventType === 'cta_click') existing.ctaClicks += 1;
    pageStats.set(key, existing);
  });
  const pagesWithConversion = [...pageStats.values()].map((row) => ({
    ...row,
    ctaRate: percentRate(row.ctaClicks, row.views),
    openRate: percentRate(row.formOpens, row.views),
    submitRate: percentRate(row.formSubmits, row.views),
  }));
  const searchStats = new Map();
  searchEvents.forEach((event) => {
    const term = sanitizeText(event.searchTerm, 200);
    if (!term) return;
    const key = term.toLowerCase();
    const metadata = safeParseMetadata(event);
    const existing = searchStats.get(key) || {
      key,
      label: term,
      searches: 0,
      clicks: 0,
      zeroResults: 0,
      maxResultCount: 0,
      scopes: {},
    };
    existing.searches += 1;
    const resultCount = analyticsNumber(metadata.resultCount, 0);
    existing.maxResultCount = Math.max(existing.maxResultCount, resultCount);
    if (resultCount === 0) existing.zeroResults += 1;
    const scope = metadata.scope || 'unknown';
    existing.scopes[scope] = (existing.scopes[scope] || 0) + 1;
    searchStats.set(key, existing);
  });
  searchClickEvents.forEach((event) => {
    const term = sanitizeText(event.searchTerm, 200);
    if (!term) return;
    const key = term.toLowerCase();
    const existing = searchStats.get(key) || {
      key,
      label: term,
      searches: 0,
      clicks: 0,
      zeroResults: 0,
      maxResultCount: 0,
      scopes: {},
    };
    existing.clicks += 1;
    searchStats.set(key, existing);
  });
  const searchRows = [...searchStats.values()].map((row) => ({
    ...row,
    clickRate: percentRate(row.clicks, row.searches),
  }));
  const deviceStats = ['desktop', 'tablet', 'mobile', 'unknown']
    .map((device) => {
      const rows = deviceRows.filter((row) => row.device === device);
      const productRows = rows.filter(
        (row) => row.event.eventType === 'product_view',
      );
      const openRows = rows.filter(
        (row) => row.event.eventType === 'form_open',
      );
      const submitRows = rows.filter(
        (row) => row.event.eventType === 'form_submit',
      );
      return {
        device,
        visits: rows.filter((row) => row.event.eventType === 'page_view')
          .length,
        productViews: productRows.length,
        formOpens: openRows.length,
        formSubmits: submitRows.length,
        submitRate: percentRate(submitRows.length, productRows.length),
      };
    })
    .filter(
      (row) =>
        row.visits || row.productViews || row.formOpens || row.formSubmits,
    );
  const funnelWithRates = (data) => {
    const values = Object.values(data).map((value) => Number(value || 0));
    const first = values[0] || 0;
    const last = values[values.length - 1] || 0;
    return {
      ...data,
      conversionRate: percentRate(last, first),
    };
  };

  return {
    range,
    since: startDate,
    eventCounts,
    funnel: {
      productViews: productViewCount,
      formOpens: formOpenCount,
      formSubmits: submitCount,
      openRate: percentRate(formOpenCount, productViewCount),
      submitRate: percentRate(submitCount, productViewCount),
      formSubmitRate: percentRate(submitCount, formOpenCount),
    },
    funnels: {
      homeToLead: funnelWithRates({
        homeVisits: events.filter(
          (event) => event.eventType === 'page_view' && event.pagePath === '/',
        ).length,
        productViews: productViewCount,
        formOpens: formOpenCount,
        formSubmits: submitCount,
      }),
      productQuote: funnelWithRates({
        catalogViews: events.filter(
          (event) =>
            event.eventType === 'page_view' && event.pagePath === '/products',
        ).length,
        detailViews: productViewCount,
        quoteOpens: formOpens.filter((event) => event.ctaName === 'quote')
          .length,
        quoteSubmits: formSubmits.filter((event) => event.ctaName === 'quote')
          .length,
      }),
      supportTicket: funnelWithRates({
        supportViews: events.filter(
          (event) =>
            event.eventType === 'page_view' && event.pagePath === '/support',
        ).length,
        faqClicks: events.filter((event) => event.eventType === 'faq_click')
          .length,
        ticketSubmits: formSubmits.filter(
          (event) => event.ctaName === 'support-ticket',
        ).length,
      }),
    },
    daily: {
      dates,
      visits: dates.map((key) => dailyViews[key] || 0),
    },
    topProducts: topCounts(
      productViews,
      (event) => event.entityId || event.entityTitle,
      (event) => event.entityTitle || event.entityId,
    ),
    topNews: topCounts(
      events.filter((event) => event.eventType === 'news_view'),
      (event) => event.entityId || event.entityTitle,
      (event) => event.entityTitle || event.entityId,
    ),
    topSearchTerms: topCounts(searchEvents, (event) => event.searchTerm),
    topSearchScopes: topCounts(
      searchEvents,
      (event) => safeParseMetadata(event).scope || 'unknown',
      (event) => safeParseMetadata(event).scope || 'unknown',
    ),
    searchQuality: {
      searches: searchEvents.length,
      searchClicks: searchClickEvents.length,
      clickRate: percentRate(searchClickEvents.length, searchEvents.length),
      zeroResultCount: searchEvents.filter(
        (event) =>
          analyticsNumber(safeParseMetadata(event).resultCount, 0) === 0,
      ).length,
      zeroResultTerms: searchRows
        .filter((row) => row.zeroResults > 0)
        .sort(
          (a, b) => b.zeroResults - a.zeroResults || b.searches - a.searches,
        )
        .slice(0, 8),
      noClickTerms: searchRows
        .filter((row) => row.searches >= 2 && row.clicks === 0)
        .sort((a, b) => b.searches - a.searches)
        .slice(0, 8),
      highIntentTerms: searchRows
        .filter((row) => row.clicks > 0)
        .sort((a, b) => b.clicks - a.clicks || b.clickRate - a.clickRate)
        .slice(0, 8),
    },
    deviceStats,
    topCtas: topCounts(ctaClicks, (event) => event.ctaName || 'unknown'),
    topFaqs: topCounts(
      faqClickEvents,
      (event) => event.entityId || event.entityTitle,
      (event) => event.entityTitle || event.entityId,
    ),
    topSources: topCounts(
      events,
      (event) => event.source || event.pagePath || 'direct',
    ),
    topPages: [...pagesWithConversion]
      .sort((a, b) => b.views - a.views)
      .slice(0, 8),
    lowConversionPages: pagesWithConversion
      .filter((row) => row.views >= 3 && row.formSubmits === 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, 8),
    faq: {
      clicks: faqClickEvents.length,
      resolved: faqFeedbackEvents.filter(
        (event) => safeParseMetadata(event).helpful === true,
      ).length,
      unresolved: faqFeedbackEvents.filter(
        (event) => safeParseMetadata(event).helpful === false,
      ).length,
      unresolvedItems: topCounts(
        faqFeedbackEvents.filter(
          (event) => safeParseMetadata(event).helpful === false,
        ),
        (event) => event.entityId || event.entityTitle,
        (event) => event.entityTitle || event.entityId,
      ),
    },
    monitoring: {
      requestCount,
      errorCount: errorLogs.length,
      errorRate: requestCount
        ? Math.round((errorLogs.length / requestCount) * 100)
        : 0,
      slowCount: slowLogs.length,
      slowRate: requestCount
        ? Math.round((slowLogs.length / requestCount) * 100)
        : 0,
      frontendErrorCount: frontendErrorEvents.length,
      resourceErrorCount: resourceErrorEvents.length,
      apiErrorCount: apiErrorEvents.length,
      formSubmitFailedCount: formFailedEvents.length,
      slowPageCount: performanceEvents.filter(
        (event) => Number(safeParseMetadata(event).durationMs || 0) >= 2500,
      ).length,
      recentErrors: errorLogs.slice(0, 8).map((log) => ({
        path: log.path,
        method: log.method,
        status: log.status,
        errorCode: log.errorCode,
        createdAt: log.createdAt,
      })),
      recentFrontendErrors: [
        ...frontendErrorEvents,
        ...resourceErrorEvents,
        ...apiErrorEvents,
        ...formFailedEvents,
      ]
        .slice(0, 10)
        .map((event) => ({
          type: event.eventType,
          pagePath: event.pagePath,
          title:
            event.entityTitle ||
            event.ctaName ||
            safeParseMetadata(event).message ||
            event.eventType,
          createdAt: event.createdAt,
        })),
      slowPages: topCounts(
        performanceEvents.filter(
          (event) => Number(safeParseMetadata(event).durationMs || 0) >= 2500,
        ),
        (event) => event.pagePath,
        (event) =>
          `${event.pagePath} (${safeParseMetadata(event).durationMs || 0}ms)`,
        8,
      ),
      slowApis: topCounts(
        slowLogs,
        (log) => log.path,
        (log) => log.path,
        8,
      ),
    },
  };
};

const cmsRequiredFields = {
  supportFaq: [
    ['question', '问题'],
    ['category', '分类'],
  ],
  supportDownload: [
    ['name', '资源名称'],
    ['type', '文件类型'],
  ],
  audioSolution: [
    ['title', '中文标题'],
    ['en', '英文副标'],
  ],
  audioStat: [
    ['label', '指标名称'],
    ['value', '指标数值'],
  ],
  brandTimeline: [
    ['year', '年份'],
    ['title', '标题'],
  ],
  ecosystemService: [
    ['icon', '图标短字'],
    ['title', '标题'],
    ['link', '跳转路由'],
  ],
  quickGuide: [
    ['title', '标题'],
    ['duration', '时长'],
    ['category', '所属品类'],
  ],
  pageContent: [
    ['slug', '页面后缀'],
    ['title', '页面标题'],
  ],
};

const validateCmsPayload = (model, body) => {
  const data = normalizeCmsPayload(modelInput(model, body));
  if (data.productIds) {
    let ids;
    try {
      ids = JSON.parse(data.productIds);
    } catch {
      throw createError(400, 'INVALID_PRODUCT_IDS', '关联产品格式不正确');
    }
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      ids.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)
    )
      throw createError(400, 'INVALID_PRODUCT_IDS', '请选择有效产品');
    data.productIds = JSON.stringify([...new Set(ids.map(Number))]);
  }

  Object.keys(data).forEach((field) => optionalTrim(data, field));
  (cmsRequiredFields[model] || []).forEach(([field, label]) =>
    requiredString(data, field, label),
  );
  if (data.slug && !slugPattern.test(data.slug))
    throw createError(
      400,
      'VALIDATION_ERROR',
      '页面后缀只能使用小写字母、数字和短横线',
    );
  if (data.link && !urlPattern.test(data.link))
    throw createError(400, 'VALIDATION_ERROR', '跳转路由格式不正确');
  if (data.fileUrl && !/^(https?:\/\/|\/uploads\/)/i.test(data.fileUrl))
    throw createError(400, 'VALIDATION_ERROR', '文件地址格式不正确');
  if (data.videoUrl && !/^(https?:\/\/|\/uploads\/)/i.test(data.videoUrl))
    throw createError(400, 'VALIDATION_ERROR', '视频地址格式不正确');
  return data;
};

const normalizeArtistPayload = (body) => {
  const data = pick(modelInput('Artist', body), [
    'name',
    'role',
    'imageUrl',
    'bio',
    'equipment',
    'sortOrder',
    'status',
  ]);
  Object.keys(data).forEach((field) => optionalTrim(data, field));
  if (Object.prototype.hasOwnProperty.call(data, 'sortOrder'))
    data.sortOrder = toInt(data.sortOrder, 0);
  return data;
};

const validateArtistPayload = (body) => {
  const data = normalizeArtistPayload(body);
  data.status = requireAllowed(data.status, statusValues, 'draft');
  requiredString(data, 'name', '艺术家姓名');
  requiredString(data, 'role', '头衔/乐器');
  return data;
};

const validateArtistApplicationPayload = (body) => {
  const data = pick(modelInput('ArtistApplication', body), [
    'name',
    'email',
    'phone',
    'portfolioUrl',
    'message',
  ]);
  Object.keys(data).forEach((field) => optionalTrim(data, field));
  requiredString(data, 'name', '姓名/艺名');
  requiredString(data, 'email', '联系邮箱');
  requiredString(data, 'portfolioUrl', '作品集链接');
  if (data.name.length < 2 || data.name.length > 40)
    throw createError(400, 'VALIDATION_ERROR', '姓名/艺名长度不正确');
  if (!emailPattern.test(data.email))
    throw createError(400, 'VALIDATION_ERROR', '邮箱格式不正确');
  if (!/^https?:\/\//i.test(data.portfolioUrl))
    throw createError(
      400,
      'VALIDATION_ERROR',
      '作品集链接必须以 http:// 或 https:// 开头',
    );
  if (data.phone && !contactPattern.test(data.phone))
    throw createError(400, 'VALIDATION_ERROR', '手机号格式不正确');
  if (data.message && data.message.length > 1000)
    throw createError(400, 'VALIDATION_ERROR', '合作意向内容过长');
  data.status = 'pending';
  return data;
};

const validateConfigPayload = (body) => {
  const data = modelInput('SystemConfig', body);
  delete data.id;
  delete data.updatedAt;
  ['contactEmail', 'contactPhone'].forEach((field) =>
    optionalTrim(data, field),
  );
  if (data.contactEmail && !emailPattern.test(data.contactEmail))
    throw createError(400, 'VALIDATION_ERROR', '客服邮箱格式不正确');
  if (data.contactPhone && !contactPattern.test(data.contactPhone))
    throw createError(400, 'VALIDATION_ERROR', '客服电话格式不正确');
  [
    'heroImageUrl',
    'coreTechImageUrl',
    'coreTechBgImageUrl',
    'quoteBgImageUrl',
    'artistHeroImageUrl',
    'audioHeroImageUrl',
    'supportHeroImageUrl',
  ].forEach((field) => {
    if (data[field] && !/^(https?:\/\/|\/uploads\/)/i.test(data[field]))
      throw createError(400, 'VALIDATION_ERROR', `${field} 图片地址格式不正确`);
  });
  return data;
};

const ensureDefaultAdmin = async () => {
  const existing = await prisma.adminUser.findUnique({
    where: { username: ADMIN_USERNAME },
  });
  if (existing) return existing;
  const { salt, hash } = hashPassword(ADMIN_PASSWORD);
  return prisma.adminUser.create({
    data: {
      username: ADMIN_USERNAME,
      displayName: '系统管理员',
      role: 'super_admin',
      status: 'active',
      passwordSalt: salt,
      passwordHash: hash,
    },
  });
};

const requireProductionSafeCredentials = () => {
  if (
    IS_PRODUCTION &&
    (ADMIN_USERNAME === 'admin' ||
      ADMIN_PASSWORD === '123456' ||
      ADMIN_TOKEN_SECRET === 'hushi-local-admin-secret')
  ) {
    throw createError(
      500,
      'UNSAFE_DEFAULT_CREDENTIALS',
      '生产环境必须配置安全的 ADMIN_USERNAME、ADMIN_PASSWORD、ADMIN_TOKEN_SECRET',
    );
  }
};

const assertDefaultAdminCanBeDisabled = async (req, before, data) => {
  const isDisablingDefaultAdmin =
    before.username === 'admin' &&
    before.status === 'active' &&
    data.status !== 'active';
  if (!isDisablingDefaultAdmin) return;

  requireSensitiveConfirmation(req, '停用默认 admin 账号');

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [freshBackup, nonDefaultSuperAdminCount] = await Promise.all([
    prisma.backupRecord.findFirst({
      where: { status: 'success', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.adminUser.count({
      where: {
        username: { not: 'admin' },
        role: 'super_admin',
        status: 'active',
      },
    }),
  ]);

  const missing = [];
  if (!freshBackup) missing.push('7 天内成功数据库备份');
  if (nonDefaultSuperAdminCount < 1)
    missing.push('非 admin 的启用超级管理员账号');
  if (!req.admin?.totpEnabled) missing.push('当前操作账号已启用 2FA');

  if (missing.length) {
    throw createError(
      400,
      'DEFAULT_ADMIN_GUARD_REQUIRED',
      `暂时不能停用默认 admin：请先完成${missing.join('、')}。`,
    );
  }
};

const buildProductionReadiness = ({
  adminUsers = [],
  backup = null,
  alerts = {},
  api = {},
  login = {},
  disk = {},
  databaseOk = false,
}) => {
  const checks = [];
  const addCheck = (key, ok, level, title, detail, action) =>
    checks.push({
      key,
      ok: Boolean(ok),
      level: ok ? 'ok' : level,
      title,
      detail,
      action,
    });
  const activeAdmins = adminUsers.filter((user) => user.status === 'active');
  const defaultAdmin = activeAdmins.find((user) => user.username === 'admin');
  const totpEnabledCount = activeAdmins.filter(
    (user) => user.totpEnabled,
  ).length;
  const backupAgeMs = backup?.createdAt
    ? Date.now() - new Date(backup.createdAt).getTime()
    : Number.POSITIVE_INFINITY;

  addCheck(
    'credentials',
    !defaultAdmin &&
      ADMIN_USERNAME !== 'admin' &&
      ADMIN_PASSWORD !== '123456' &&
      ADMIN_TOKEN_SECRET !== 'hushi-local-admin-secret',
    'critical',
    '默认管理员与密钥',
    defaultAdmin
      ? '仍存在启用状态的 admin 默认管理员账号。'
      : '环境变量或默认账号策略需要确认。',
    '正式上线前改用独立管理员账号、强密码和随机 ADMIN_TOKEN_SECRET。',
  );
  addCheck(
    'two_factor',
    activeAdmins.length > 0 && totpEnabledCount === activeAdmins.length,
    'warning',
    '管理员 2FA 覆盖率',
    `当前 ${totpEnabledCount}/${activeAdmins.length || 0} 个启用管理员已绑定 2FA。`,
    '为所有启用管理员绑定 2FA，至少超级管理员必须启用。',
  );
  addCheck(
    'backup',
    backup?.status === 'success' && backupAgeMs <= 7 * 24 * 60 * 60 * 1000,
    'warning',
    '最近数据库备份',
    backup?.createdAt
      ? `最近备份时间：${new Date(backup.createdAt).toISOString()}，状态：${backup.status}`
      : '未发现可用备份记录。',
    '上线前执行一次备份，并定期做恢复演练。',
  );
  addCheck(
    'database',
    databaseOk,
    'critical',
    '数据库核心表',
    databaseOk
      ? '数据库文件与核心表检查正常。'
      : '数据库文件或核心表检查异常。',
    '先修复数据库连接、文件权限或缺失表。',
  );
  addCheck(
    'open_alerts',
    Number(alerts.openCount || 0) === 0,
    Number(alerts.levels?.critical || 0) > 0 ? 'critical' : 'warning',
    '未处理告警',
    `当前未处理告警 ${alerts.openCount || 0} 条，严重 ${alerts.levels?.critical || 0} 条。`,
    '清理真实异常，误报需标记为已处理。',
  );
  addCheck(
    'api_errors',
    Number(api.errorCount || 0) === 0,
    'critical',
    '近 24 小时 API 500',
    `近 24 小时 ${api.errorCount || 0} 次 500，错误率 ${api.errorRate || 0}%。`,
    '结合审计与 API 日志定位失败接口。',
  );
  addCheck(
    'login_failures',
    Number(login.failedCount || 0) === 0 &&
      Number(login.lockedAdminCount || 0) === 0,
    'warning',
    '后台登录异常',
    `近 24 小时失败登录 ${login.failedCount || 0} 次，锁定账号 ${login.lockedAdminCount || 0} 个。`,
    '检查弱口令、撞库尝试和管理员 IP 白名单。',
  );
  addCheck(
    'disk',
    !disk.status || disk.status === 'ok',
    'warning',
    '服务器磁盘空间',
    disk.status === 'ok'
      ? '磁盘空间检查正常。'
      : '磁盘空间状态未知或达到预警。',
    '清理旧备份、日志和未使用上传资源。',
  );

  const openChecks = checks.filter((item) => !item.ok);
  const criticalCount = openChecks.filter(
    (item) => item.level === 'critical',
  ).length;
  const warningCount = openChecks.filter(
    (item) => item.level === 'warning',
  ).length;
  const score = Math.max(
    0,
    Math.round((checks.filter((item) => item.ok).length / checks.length) * 100),
  );
  return {
    score,
    status: criticalCount ? 'critical' : warningCount ? 'warning' : 'ready',
    summary: criticalCount
      ? `还有 ${criticalCount} 项严重问题需要先处理`
      : warningCount
        ? `还有 ${warningCount} 项上线前建议整改`
        : '生产就绪检查通过',
    criticalCount,
    warningCount,
    checks,
    openChecks,
  };
};

// 1. 静态资源与图片上传

const workflowSpecs = {
  product: {
    model: 'product',
    permission: 'products',
    endpoint: '/api/products',
    wrapped: true,
    validate: validateProductPayload,
  },
  article: {
    model: 'article',
    permission: 'articles',
    endpoint: '/api/articles',
    wrapped: true,
    validate: validateArticlePayload,
  },
  artist: {
    model: 'artist',
    permission: 'artists',
    endpoint: '/api/artists',
    wrapped: true,
    validate: validateArtistPayload,
  },
  config: {
    model: 'systemConfig',
    permission: 'config',
    endpoint: '/api/config',
    validate: validateConfigPayload,
  },
  inquiry: {
    model: 'inquiry',
    permission: 'crm',
    endpoint: '/api/inquiries',
    restore: (body) => modelInput('Inquiry', body),
    validate: (body) => validateInquiryPayload(body, { publicOnly: false }),
  },
  artistApplication: {
    model: 'artistApplication',
    permission: 'crm',
    endpoint: '/api/artist-applications',
    restore: (body) => modelInput('ArtistApplication', body),
    validate: (body) => ({
      ...validateArtistApplicationPayload(body),
      status: requireAllowed(
        body.status,
        ['pending', 'reviewed', 'approved', 'rejected'],
        'pending',
      ),
    }),
  },
  ...Object.fromEntries(
    [
      ['supportFaq', 'support-faqs'],
      ['supportDownload', 'support-downloads'],
      ['audioSolution', 'audio-solutions'],
      ['audioStat', 'audio-stats'],
      ['brandTimeline', 'brand-timelines'],
      ['ecosystemService', 'ecosystem-services'],
      ['quickGuide', 'quick-guides'],
      ['pageContent', 'page-contents'],
    ].map(([model, route]) => [
      model,
      {
        model,
        permission: 'cms',
        endpoint: `/api/${route}`,
        validate: (body) => validateCmsPayload(model, body),
      },
    ]),
  ),
};
const workflows = registerContentWorkflows({
  app,
  prisma,
  read: asyncHandler,
  write: writeHandler,
  requireAdmin,
  requirePermission,
  canAdmin,
  specs: workflowSpecs,
  auditOperation,
  saveContentVersion,
  secret: ADMIN_TOKEN_SECRET,
  createError,
});
app.use('/api', workflows.preview);

const parseSnapshot = (snapshot) => {
  try {
    return JSON.parse(snapshot);
  } catch {
    throw createError(
      422,
      'DAMAGED_VERSION',
      '此历史快照已损坏，不能恢复。当前内容保持不变。',
    );
  }
};
const submissionReceipt = async (req, scope, data) => {
  const raw = req.headers['idempotency-key'] || req.body.submissionId;
  if (
    raw !== undefined &&
    (typeof raw !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(raw))
  )
    throw createError(400, 'INVALID_SUBMISSION_ID', '提交标识不合法');
  // Older clients still get retry protection for an identical submission in a short window.
  const key = crypto
    .createHash('sha256')
    .update(
      scope +
        ':' +
        (raw || contentHash(data) + ':' + Math.floor(Date.now() / 300000)),
    )
    .digest('hex');
  const payloadHash = contentHash(data);
  const receipt = await prisma.submissionReceipt.findUnique({ where: { key } });
  if (receipt && receipt.payloadHash !== payloadHash)
    throw createError(
      409,
      'IDEMPOTENCY_CONFLICT',
      '提交内容已更改，请开始新的提交',
    );
  return { key, payloadHash, scope, existing: receipt };
};

app.get(
  '/api/products/by-key/:key',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    const data = await prisma.product.findFirst({
      where: {
        AND: [
          publicStatusWhere,
          {
            OR: [
              { slug: key },
              ...(/^\d+$/.test(key) ? [{ id: Number(key) }] : []),
            ],
          },
        ],
      },
    });
    if (!data) return res.status(404).json({ data: null });
    res.json({
      data: {
        id: data.id,
        attributes: {
          ...data,
          image: data.imageUrl
            ? { data: { attributes: { url: data.imageUrl } } }
            : null,
        },
      },
    });
  }),
);
app.get(
  '/api/admin/crm/assignees',
  requireAdmin,
  requirePermission('crm:read'),
  asyncHandler(async (req, res) => {
    const rows = await prisma.adminUser.findMany({
      where: { status: 'active', role: { in: ['super_admin', 'support'] },
        ...(req.admin.role === 'support' ? { id: req.admin.id } : {}),
      },
      select: { id: true, displayName: true, username: true },
    });
    res.json({ data: rows });
  }),
);
app.get(
  '/api/inquiries/:id/follow-ups',
  requireAdmin,
  requirePermission('crm:read'),
  asyncHandler(async (req, res) => {
    const rows = await transaction(async () => {
      const inquiryId = toId(req.params.id);
      const inquiry = await prisma.inquiry.findFirst({
        where: { id: inquiryId, ...inquiryScope(req.admin) },
        select: { id: true },
      });
      if (!inquiry) throw createError(404, 'NOT_FOUND', '工单不存在或已不在当前处理范围');
      return prisma.inquiryFollowUp.findMany({
        where: { inquiryId }, orderBy: { createdAt: 'desc' },
      });
    });
    res.json({
      data: canAdmin(req.admin, 'crm:private')
        ? rows
        : rows.map((row) => ({ ...row, note: '已隐藏' })),
    });
  }),
);
app.post(
  '/api/artist-applications/:id/create-artist',
  requireAdmin,
  requirePermission('crm:write'),
  requirePermission('artists:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id),
      application = await prisma.artistApplication.findUnique({
        where: { id },
      });
    if (!application) throw createError(404, 'NOT_FOUND', '申请不存在');
    if (application.artistId)
      return res.json({ data: { id: application.artistId }, existing: true });
    if (application.status !== 'approved')
      throw createError(409, 'NOT_APPROVED', '请先审阅并通过合作申请');
    const artist = await prisma.artist.create({
      data: {
        name: application.name,
        role: '合作艺术家',
        bio: '',
        status: 'draft',
      },
    });
    await prisma.artistApplication.update({
      where: { id },
      data: { artistId: artist.id },
    });
    await auditOperation(req, {
      action: 'CONVERT',
      module: 'crm',
      targetId: id,
      summary: '将通过的申请创建为艺术家草稿',
      afterData: { artistId: artist.id },
    });
    res.status(201).json({ data: artist });
  }),
);
app.get(
  '/api/admin/notifications',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, toInt(req.query.page, 1));
    const [total, rows] = await Promise.all([
      prisma.notificationDelivery.count(),
      prisma.notificationDelivery.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
    ]);
    res.json({
      configured: Boolean(ALERT_WEBHOOK_URL),
      emailSupported: false,
      data: rows.map(({ payload, ...row }) => row),
      meta: { pagination: { page, pageSize: 20, total } },
    });
  }),
);
app.post(
  '/api/admin/notifications/:id/retry',
  requireAdmin,
  requirePermission('alerts:write'),
  writeHandler(async (req, res) => {
    if (!ALERT_WEBHOOK_URL)
      throw createError(409, 'NOT_CONFIGURED', '尚未配置通知接收地址');
    const result = await prisma.notificationDelivery.updateMany({
      where: { id: toId(req.params.id), status: { in: ['failed', 'retry'] } },
      data: { status: 'pending', attempts: 0, nextAttemptAt: new Date() },
    });
    if (!result.count)
      throw createError(409, 'NOT_RETRYABLE', '通知不存在或无需重试');
    afterCommit(() => notificationWorker.run());
    res.json({ success: true });
  }),
);
app.get(
  '/api/admin/maintenance',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    res.json({
      data: await prisma.maintenanceRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    });
  }),
);
const uploadDir = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'),
);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use(
  '/uploads',
  express.static(uploadDir, {
    immutable: true,
    maxAge: UPLOAD_CACHE_SECONDS * 1000,
    setHeaders: (res) => {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${UPLOAD_CACHE_SECONDS}, immutable`,
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeBase =
      path
        .basename(file.originalname || 'asset', ext)
        .replace(/[^a-z0-9_-]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) || 'asset';
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeBase}${ext}`);
  },
});
const allowedUploadExts = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.zip',
  '.rar',
  '.mp4',
  '.mov',
]);
const allowedUploadMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'video/mp4',
  'video/quicktime',
]);
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (
      allowedUploadExts.has(ext) &&
      (allowedUploadMimes.has(file.mimetype) || ext === '.rar')
    )
      return cb(null, true);
    return cb(
      createError(
        400,
        'INVALID_UPLOAD_TYPE',
        '仅支持图片、PDF、ZIP/RAR 和 MP4/MOV 文件',
      ),
    );
  },
});
app.post(
  '/api/upload',
  requireAdmin,
  requirePermission('resources:upload'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      assertSafeUploadedFile(req.file);
      const relativeUrl = `/uploads/${req.file.filename}`;
      invalidateUploadHealth();
      const category=validateMediaCategory(req.body.category || 'auto');
      await transaction(async()=>{
        await prisma.mediaAsset.create({data:{url:relativeUrl,name:req.file.originalname.slice(0,160),type:req.file.mimetype.startsWith('image/')?'image':'file',bytes:req.file.size,metadata:JSON.stringify({nameMode:'auto',category,originalName:req.file.originalname.slice(0,160)})}});
        await auditOperation(req,{action:'UPLOAD',module:'resources',target:req.file.filename,summary:'上传素材'});
      });
      return res.json({
        url: relativeUrl,
        publicUrl: UPLOAD_PUBLIC_BASE
          ? `${UPLOAD_PUBLIC_BASE}${relativeUrl}`
          : relativeUrl,
        dimensions: req.file.dimensions || null,
        size: req.file.size,
      });
    } catch (error) {
      if (req.file?.path && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      invalidateUploadHealth();
      return next(error);
    }
  },
);

const normalizeUploadUrl = canonicalUploadUrl;
const isAssetPath = (value) => Boolean(normalizeUploadUrl(value));
const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const fileSizeLabel = (size) => {
  if (!Number.isFinite(size)) return '-';
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
};
const imageOptimizationHint = ({ ext, bytes, dimensions }) => {
  const normalizedExt = String(ext || '').toLowerCase();
  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);
  const pixels = width && height ? width * height : 0;
  const messages = [];
  const actions = [];
  let score = 0;

  if (bytes > 3 * 1024 * 1024) {
    score = Math.max(score, 2);
    messages.push('图片体积超过 3MB，会明显影响页面打开速度');
    actions.push('建议压缩到 1MB 以内后重新上传');
  } else if (bytes > 1024 * 1024) {
    score = Math.max(score, 1);
    messages.push('图片体积超过 1MB，建议压缩后用于前台页面');
    actions.push('建议压缩到 500KB-1MB 区间');
  }

  if (width > 3200 || height > 2200 || pixels > 7_000_000) {
    score = Math.max(score, 2);
    messages.push('图片像素尺寸偏大，手机和普通桌面端不需要加载这么大的原图');
    actions.push('建议按展示位置裁切到合适尺寸');
  } else if (width > 2400 || height > 1600 || pixels > 4_000_000) {
    score = Math.max(score, 1);
    messages.push('图片分辨率偏高，可按页面展示尺寸降采样');
    actions.push('建议生成 WebP 或较小 JPEG 版本');
  }

  if (['jpg', 'jpeg', 'png'].includes(normalizedExt) && bytes > 600 * 1024) {
    score = Math.max(score, 1);
    messages.push('较大的 JPG/PNG 可考虑转换为 WebP');
    actions.push('建议保留原图备份，并上传压缩后的 WebP 版本');
  }

  return {
    riskLevel: score >= 2 ? 'danger' : score === 1 ? 'warning' : 'ok',
    riskMessages: messages,
    suggestedAction: [...new Set(actions)].join('；'),
  };
};
const uploadRecord = async (filePath) => {
  const relativePath = `/uploads/${path.relative(uploadDir, filePath).replace(/\\/g, '/')}`;
  const stat = await fs.promises.stat(filePath),
    ext = path.extname(filePath).slice(1).toLowerCase();
  const type = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)
    ? 'image'
    : 'file';
  let dimensions = null;
  if (type === 'image') {
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(262144);
      const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
      dimensions = imageDimensions(
        filePath,
        ext,
        buffer.subarray(0, bytesRead),
      );
    } finally {
      await fd.close();
    }
  }
  const optimization =
    type === 'image'
      ? imageOptimizationHint({ ext, bytes: stat.size, dimensions })
      : { riskLevel: 'ok', riskMessages: [], suggestedAction: '' };
  return {
    name: path.basename(filePath),
    url: relativePath,
    ext,
    type,
    size: fileSizeLabel(stat.size),
    bytes: stat.size,
    dimensions,
    optimization,
    ...optimization,
    updatedAt: stat.mtime,
  };
};
const walkUploads = async (dir, result = []) => {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkUploads(target, result);
    else if (entry.isFile())
      try {
        result.push(await uploadRecord(target));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
  }
  return result;
};
let resourceHealthCache = { expiresAt: 0, uploads: [] }, resourceScan = null, resourceScanEpoch = 0;
const invalidateUploadHealth = () => { resourceScanEpoch++; resourceHealthCache.expiresAt = 0; };
const getCachedUploadHealth = async () => {
  if (resourceHealthCache.expiresAt > Date.now()) return resourceHealthCache.uploads;
  if (!resourceScan) resourceScan = (async () => {
    let epoch, uploads;
    do { epoch = resourceScanEpoch; uploads = await walkUploads(uploadDir); } while (epoch !== resourceScanEpoch);
    resourceHealthCache = { expiresAt: Date.now() + 60000, uploads };
    return uploads;
  })().finally(() => { resourceScan = null; });
  return resourceScan;
};
const collectResource = (items, section, title, url, kind = 'image') => {
  const normalizedUrl = normalizeUploadUrl(url);
  if (!normalizedUrl) return;
  items.push({ section, title, url: normalizedUrl, originalUrl: url, kind });
};

const resourceOptimizationLogs = async () => {
  const rows = await prisma.operationLog.findMany({
    where: { module: 'resources', action: 'OPTIMIZE_STATUS' },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const map = new Map();
  rows.forEach((row) => {
    if (!row.target || map.has(row.target)) return;
    let detail = null;
    try {
      detail = row.afterData ? JSON.parse(row.afterData) : null;
    } catch {}
    map.set(row.target, {
      status: detail?.status || 'pending',
      backupUrl: detail?.backupUrl || '',
      note: detail?.note || row.summary || '',
      operator: row.operator || '',
      updatedAt: row.createdAt,
    });
  });
  return map;
};

let resourceInventoryEpoch = 0,
  resourceInventoryCache = { expiresAt: 0, value: null },
  resourceInventoryPromise = null;
const loadResourceInventory = async () => {
  const [
    config,
    products,
    articles,
    artists,
    downloads,
    audioSolutions,
    timelines,
    ecosystem,
    guides,
  ] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.product.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.article.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.artist.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.supportDownload.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.audioSolution.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.brandTimeline.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.ecosystemService.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.quickGuide.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  const [faqs, pages, drafts, recycled, historicalReferences] = await Promise.all([
    prisma.supportFaq.findMany(),
    prisma.pageContent.findMany(),
    prisma.contentDraft.findMany(),
    prisma.recycleEntry.findMany(),
    historicalMediaReferences(prisma),
  ]);
  const usedResources = buildMediaReferences([
    ['product','产品','product',products], ['config','官网设置','brand',[config]],
    ['article','新闻','news',articles], ['artist','艺术家','artist',artists],
    ['supportDownload','支持下载','support',downloads], ['audioSolution','音响方案','brand',audioSolutions],
    ['brandTimeline','品牌历程','brand',timelines], ['ecosystemService','首页入口','brand',ecosystem],
    ['quickGuide','使用指南','support',guides], ['supportFaq','常见问题','support',faqs], ['pageContent','独立页面','brand',pages],
  ], [['修改草稿',drafts], ['回收站',recycled]]);
  usedResources.push(...historicalReferences);
  const usedUrlSet = new Set(usedResources.map((item) => item.url));
  const optimizationLogs = await resourceOptimizationLogs();
  const uploads = (await getCachedUploadHealth())
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const metadata = new Map(
    (await prisma.mediaAsset.findMany()).map((row) => [row.url, row]),
  );
  const referenceMap=new Map();
  for(const ref of usedResources){if(!referenceMap.has(ref.url)) referenceMap.set(ref.url,[]);referenceMap.get(ref.url).push(ref);}
  const uploadsWithState = uploads.map(item => ({...describeMedia(item,metadata.get(item.url),referenceMap.get(item.url)||[]),optimizationState:optimizationLogs.get(item.url)||null}));
  const riskyImages = uploadsWithState.filter(
    (item) => item.type === 'image' && item.riskLevel !== 'ok',
  );
  const pendingRiskImages = riskyImages.filter(
    (item) => item.optimizationState?.status !== 'optimized',
  );
  const heavyImages = uploadsWithState.filter(
    (item) => item.type === 'image' && item.riskLevel === 'danger',
  );
  return {
    usedResources,
    uploads,
    uploadsWithState,
    riskyImages,
    pendingRiskImages,
    heavyImages,
    usedUrlSet,
  };
};
const cachedResourceInventory = async () => {
  if (resourceInventoryCache.expiresAt > Date.now()) return resourceInventoryCache.value;
  if (!resourceInventoryPromise) resourceInventoryPromise = (async()=>{
    let epoch,value;
    do {epoch=resourceInventoryEpoch;value=await loadResourceInventory();}while(epoch!==resourceInventoryEpoch);
    resourceInventoryCache={expiresAt:Date.now()+30000,value};
    return value;
  })().finally(()=>{resourceInventoryPromise=null});
  return resourceInventoryPromise;
};

app.get(
  '/api/admin/resources',
  requireAdmin,
  requirePermission('resources:read'),
  asyncHandler(async (req, res) => {
    const {
      usedResources,
      uploads,
      uploadsWithState,
      riskyImages,
      pendingRiskImages,
      heavyImages,
      usedUrlSet,
    } = await cachedResourceInventory();
    const keyword = cleanQueryValue(req.query.search).toLowerCase(),
      kind = cleanQueryValue(req.query.kind),
      usage = cleanQueryValue(req.query.usage),
      category = cleanQueryValue(req.query.category);
    if(category && category!=='all' && !mediaCategories.some(c=>c.value===category)) throw createError(400,'INVALID_CATEGORY','素材分类不存在');
    const filtered = uploadsWithState.filter(
      (item) =>
        (!keyword ||
          `${item.name} ${item.originalName} ${item.url} ${item.references.map(r=>r.title).join(" ")}`.toLowerCase().includes(keyword)) &&
        (!kind ||
          kind === 'all' ||
          (kind === 'image' ? item.type === 'image' : kind === 'video' ? /\.(mp4|mov)$/i.test(item.url) : kind === 'document' ? item.type !== 'image' && !/\.(mp4|mov)$/i.test(item.url) : item.type !== 'image')) &&
        (!category || category==='all' || item.category===category) &&
        (!usage ||
          usage === 'all' ||
          (usage === 'used' ? item.inUse : !item.inUse)),
    );
    const paging = normalizePagination(req, 24);
    res.json({
      categories: mediaCategories.map(c=>({...c,count:uploadsWithState.filter(item=>item.category===c.value).length})),
      used: usedResources,
      uploads: req.query.page
        ? filtered.slice(paging.skip, paging.skip + paging.take)
        : filtered,
      meta: {
        pagination: {
          page: paging.page,
          pageSize: paging.pageSize,
          total: filtered.length,
          pageCount: Math.max(1, Math.ceil(filtered.length / paging.pageSize)),
        },
      },
      summary: {
        usedCount: usedResources.length,
        uploadCount: uploads.length,
        unusedCount: uploads.filter((item) => !usedUrlSet.has(item.url)).length,
        optimizationCount: riskyImages.length,
        pendingOptimizationCount: pendingRiskImages.length,
        heavyImageCount: heavyImages.length,
        optimizedCount: uploadsWithState.filter(
          (item) =>
            item.type === 'image' &&
            item.optimizationState?.status === 'optimized',
        ).length,
        cachePolicy: {
          path: '/uploads',
          cacheControl: `public, max-age=${UPLOAD_CACHE_SECONDS}, immutable`,
          maxAgeSeconds: UPLOAD_CACHE_SECONDS,
        },
      },
    });
  }),
);

const validateReplacementUrl = (value, label) => {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) throw createError(400, 'VALIDATION_ERROR', `${label}不能为空`);
  if (!/^(https?:\/\/|\/uploads\/)/i.test(url))
    throw createError(
      400,
      'VALIDATION_ERROR',
      `${label}必须是 http(s) 或 /uploads/ 资源地址`,
    );
  return url;
};

app.post(
  '/api/admin/resources/optimization-status',
  requireAdmin,
  requirePermission('resources:write'),
  writeHandler(async (req, res) => {
    const url = validateReplacementUrl(req.body.url, '资源地址');
    const status = ['pending', 'optimized'].includes(req.body.status)
      ? req.body.status
      : 'optimized';
    const backupUrl = String(req.body.backupUrl || '')
      .trim()
      .slice(0, 500);
    const note = String(req.body.note || '')
      .trim()
      .slice(0, 500);
    if (
      backupUrl &&
      !/^(https?:\/\/|\/uploads\/|backups\/|\/var\/www\/|\/home\/|[a-zA-Z0-9_.\-\/]+)$/i.test(
        backupUrl,
      )
    ) {
      throw createError(400, 'VALIDATION_ERROR', '原图备份位置格式不正确');
    }
    await auditOperation(req, {
      action: 'OPTIMIZE_STATUS',
      module: 'resources',
      target: url,
      summary: status === 'optimized' ? '标记图片已优化' : '标记图片待处理',
      afterData: { url, status, backupUrl, note },
    });
    res.json({
      success: true,
      data: {
        status,
        backupUrl,
        note,
        operator: req.admin?.username || '',
        updatedAt: new Date(),
      },
    });
  }),
);

const replaceJsonArrayValue = (value, oldUrl, newUrl) => {
  const list = parseJsonArray(value);
  let changed = false;
  const next = list.map((item) => {
    if (item === oldUrl) {
      changed = true;
      return newUrl;
    }
    return item;
  });
  return changed ? JSON.stringify(next) : null;
};

app.post(
  '/api/admin/resources/replace',
  requireAdmin,
  requirePermission('resources:write'),
  writeHandler(async (req, res) => {
    requireSensitiveConfirmation(req, '批量替换资源引用');
    const oldUrl = validateReplacementUrl(req.body.oldUrl, '旧资源地址');
    const newUrl = validateReplacementUrl(req.body.newUrl, '新资源地址');
    if (oldUrl === newUrl)
      throw createError(400, 'VALIDATION_ERROR', '新旧资源地址不能相同');

    const changed = [];
    const replaceValue = (value) => {
      if (typeof value === 'string') {
        if (value === oldUrl) return newUrl;
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') {
            const next = replaceValue(parsed);
            return JSON.stringify(next) === JSON.stringify(parsed)
              ? value
              : JSON.stringify(next);
          }
        } catch {}
        if (
          canonicalUploadUrl(value) === canonicalUploadUrl(oldUrl) &&
          canonicalUploadUrl(oldUrl)
        )
          return newUrl;
        return value.replace(
          /(?:https?:\/\/|\/uploads\/)[^\s<>"'`\\)\]}]+/g,
          (match) =>
            (match === oldUrl || (canonicalUploadUrl(oldUrl) && canonicalUploadUrl(match) === canonicalUploadUrl(oldUrl)))
              ? newUrl
              : match,
        );
      }
      if (Array.isArray(value)) return value.map(replaceValue);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, replaceValue(v)]),
        );
      return value;
    };
    for (const [module, spec] of Object.entries(workflowSpecs).filter(
      ([, spec]) => spec.permission !== 'crm',
    )) {
      for (const row of await prisma[spec.model].findMany()) {
        const patch = {};
        for (const [key, value] of Object.entries(row))
          if (typeof value === 'string') {
            const next = replaceValue(value);
            if (next !== value) patch[key] = next;
          }
        if (!Object.keys(patch).length) continue;
        await saveContentVersion(req, module, row);
        await prisma[spec.model].update({ where: { id: row.id }, data: patch });
        changed.push({
          label: `${module} #${row.id}`,
          count: Object.keys(patch).length,
        });
      }
    }
    await auditOperation(req, {
      action: 'REPLACE',
      module: 'resources',
      target: oldUrl,
      summary: `替换为 ${newUrl}，影响 ${changed.reduce((sum, item) => sum + item.count, 0)} 处`,
      beforeData: { oldUrl },
      afterData: { newUrl, changed },
    });
    res.json({
      success: true,
      changed,
      total: changed.reduce((sum, item) => sum + item.count, 0),
    });
  }),
);

const validateMediaCategory = value => {
  if (value !== 'auto' && !mediaCategories.some(c=>c.value===value)) throw createError(400,'INVALID_CATEGORY','素材分类不存在');
  return value;
};
const mediaFile = async value => {
  const url=canonicalUploadUrl(value);
  if(!url) throw createError(400,'INVALID_URL','素材地址不合法');
  const file=uploadFilePath(uploadDir,url), stat=await fs.promises.lstat(file).catch(()=>null);
  if(!stat?.isFile() || stat.isSymbolicLink()) throw createError(404,'NOT_FOUND','素材文件不存在');
  return {url,file,stat};
};
app.put('/api/admin/resources/metadata', requireAdmin, requirePermission('resources:write'), writeHandler(async(req,res)=>{
  const {url,file,stat}=await mediaFile(req.body.url);
  const existing=await prisma.mediaAsset.findUnique({where:{url}}), meta=readMetadata(existing);
  const nameMode=req.body.nameMode ?? (req.body.name!==undefined ? 'manual' : meta.nameMode || (existing?'manual':'auto'));
  if(!['auto','manual'].includes(nameMode)) throw createError(400,'VALIDATION_ERROR','命名方式不合法');
  const name=req.body.name===undefined ? existing?.name || path.basename(file) : typeof req.body.name==='string' ? req.body.name.trim() : null;
  const altText=req.body.altText===undefined ? existing?.altText || '' : typeof req.body.altText==='string' ? req.body.altText.trim() : null;
  if(name===null || altText===null || (nameMode==='manual' && !name) || name.length>160 || altText.length>500) throw createError(400,'VALIDATION_ERROR','名称需为1–160字符，替代文字不超过500字符');
  const category=validateMediaCategory(req.body.category ?? meta.category ?? 'auto');
  const metadata=JSON.stringify({...meta,nameMode,category});
  const data=await prisma.mediaAsset.upsert({where:{url},create:{url,name:name||path.basename(file),altText,type:'file',bytes:stat.size,metadata},update:{name:name||path.basename(file),altText,metadata}});
  await auditOperation(req,{action:'UPDATE_METADATA',module:'resources',target:url,summary:'更新素材命名、分类与说明'});
  res.json({data});
}));
app.put('/api/admin/resources/categories',requireAdmin,requirePermission('resources:write'),writeHandler(async(req,res)=>{
  const category=validateMediaCategory(req.body.category);
  if(!Array.isArray(req.body.urls) || req.body.urls.length<1 || req.body.urls.length>100 || req.body.urls.some(u=>typeof u!=='string')) throw createError(400,'VALIDATION_ERROR','请选择1–100个素材');
  const files=await Promise.all(req.body.urls.map(mediaFile));
  if(new Set(files.map(f=>f.url)).size!==files.length) throw createError(400,'VALIDATION_ERROR','素材列表不能重复');
  for(const {url,file,stat} of files){const existing=await prisma.mediaAsset.findUnique({where:{url}}),meta=readMetadata(existing);const metadata=JSON.stringify({...meta,nameMode:meta.nameMode || (existing?'manual':'auto'),category});await prisma.mediaAsset.upsert({where:{url},create:{url,name:path.basename(file),type:'file',bytes:stat.size,metadata},update:{metadata}});}
  await auditOperation(req,{action:'CATEGORIZE',module:'resources',summary:`整理${files.length}个素材分类`,afterData:{category,count:files.length}});
  res.json({success:true,count:files.length});
}));
app.delete(
  '/api/admin/resources',
  requireAdmin,
  requirePermission('resources:write'),
  asyncHandler(async (req, res) => {
    requireSensitiveConfirmation(req, '删除上传资源');
    let fullPath, quarantine;
    try {
      await transaction(async () => {
        const url = canonicalUploadUrl(
          validateReplacementUrl(req.body.url || req.query.url, '资源地址'),
        );
        if (!url)
          throw createError(400, 'INVALID_RESOURCE_PATH', '资源路径不合法');
        if (!url.startsWith('/uploads/'))
          throw createError(400, 'VALIDATION_ERROR', '只能删除本地上传资源');
        const [
          config,
          products,
          articles,
          artists,
          downloads,
          audioSolutions,
          timelines,
          ecosystem,
          guides,
        ] = await Promise.all([
          prisma.systemConfig.findUnique({ where: { id: 1 } }),
          prisma.product.findMany(),
          prisma.article.findMany(),
          prisma.artist.findMany(),
          prisma.supportDownload.findMany(),
          prisma.audioSolution.findMany(),
          prisma.brandTimeline.findMany(),
          prisma.ecosystemService.findMany(),
          prisma.quickGuide.findMany(),
        ]);
        const usedResources = [];
        if (config)
          [
            'heroImageUrl',
            'coreTechBgImageUrl',
            'coreTechImageUrl',
            'quoteBgImageUrl',
            'artistHeroImageUrl',
            'audioHeroImageUrl',
            'supportHeroImageUrl',
          ].forEach((field) =>
            collectResource(usedResources, '全局配置', field, config[field]),
          );
        products.forEach((item) => {
          collectResource(
            usedResources,
            '产品',
            `${item.title} 主图`,
            item.imageUrl,
          );
          parseJsonArray(item.gallery).forEach((itemUrl) =>
            collectResource(
              usedResources,
              '产品',
              `${item.title} 详情图`,
              itemUrl,
            ),
          );
        });
        articles.forEach((item) =>
          collectResource(usedResources, '新闻', item.title, item.imageUrl),
        );
        artists.forEach((item) =>
          collectResource(usedResources, '艺术家', item.name, item.imageUrl),
        );
        downloads.forEach((item) =>
          collectResource(
            usedResources,
            '支持下载',
            item.name,
            item.fileUrl,
            'file',
          ),
        );
        audioSolutions.forEach((item) =>
          collectResource(usedResources, '音响方案', item.title, item.imageUrl),
        );
        timelines.forEach((item) =>
          collectResource(usedResources, '品牌历程', item.title, item.imageUrl),
        );
        ecosystem.forEach((item) =>
          collectResource(
            usedResources,
            '首页生态卡片',
            item.title,
            item.imageUrl,
          ),
        );
        guides.forEach((item) => {
          collectResource(
            usedResources,
            '支持视频',
            `${item.title} 封面`,
            item.coverUrl,
          );
          collectResource(
            usedResources,
            '支持视频',
            `${item.title} 视频`,
            item.videoUrl,
            'file',
          );
        });
        const [faqs, pages, drafts, recycled, versions] = await Promise.all([
          prisma.supportFaq.findMany(),
          prisma.pageContent.findMany(),
          prisma.contentDraft.findMany(),
          prisma.recycleEntry.findMany(),
          prisma.contentVersion.findMany(),
        ]);
        collectContentReferences(usedResources, [
          ['全局配置', [config]],
          ['产品', products],
          ['新闻', articles],
          ['艺术家', artists],
          ['支持下载', downloads],
          ['音响方案', audioSolutions],
          ['品牌历程', timelines],
          ['首页生态卡片', ecosystem],
          ['支持视频', guides],
          ['常见问题', faqs],
          ['页面', pages],
          ['修改草稿', drafts],
          ['回收站', recycled],
          ['历史版本', versions],
        ]);
        const hits = usedResources.filter((item) => item.url === url);
        if (hits.length)
          throw createError(
            409,
            'RESOURCE_IN_USE',
            `该资源仍被 ${hits.length} 处引用，不能删除`,
          );
        fullPath = uploadFilePath(uploadDir, url);
        if (!fullPath.startsWith(uploadDir))
          throw createError(400, 'INVALID_RESOURCE_PATH', '资源路径不合法');
        if (!fs.existsSync(fullPath))
          throw createError(404, 'NOT_FOUND', '资源文件不存在');
        quarantine = path.join(uploadDir, '.deleted', crypto.randomUUID());
        await fs.promises.mkdir(path.dirname(quarantine), { recursive: true });
        await fs.promises.rename(fullPath, quarantine);
        invalidateUploadHealth();
        await prisma.mediaAsset.deleteMany({ where: { url } });
        await auditOperation(req, {
          action: 'DELETE',
          module: 'resources',
          target: url,
          summary: '删除未使用资源',
        });
      });
      if (quarantine)
        await fs.promises
          .rm(quarantine, { force: true })
          .catch((error) => console.warn('Deferred file cleanup:', error.code));
      res.json({ success: true });
    } catch (error) {
      if (quarantine && fs.existsSync(quarantine))
        await fs.promises.rename(quarantine, fullPath);
      invalidateUploadHealth();
      throw error;
    }
  }),
);

const registerLoginFailure = async (id) => {
  const failed = await database.adminUser.update({
    where: { id },
    data: { failedLoginCount: { increment: 1 } },
  });
  if (failed.failedLoginCount >= LOGIN_LOCK_AFTER)
    return database.adminUser.update({
      where: { id },
      data: { lockedUntil: new Date(Date.now() + LOGIN_LOCK_MS) },
    });
  return failed;
};

// 2. 鉴权、权限与仪表盘看板
app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    requireAdminIpAllowed(req);
    requireProductionSafeCredentials();
    await ensureDefaultAdmin();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const meta = getRequestMeta(req);
    const admin = await prisma.adminUser.findUnique({ where: { username } });
    const writeLogin = async (success, message, adminUser = admin) => {
      await prisma.loginRecord.create({
        data: {
          username,
          adminUserId: adminUser?.id || null,
          success,
          message,
          ip: anonymizeIp(meta.ip),
          userAgent: meta.userAgent,
        },
      });
    };

    if (!admin || admin.status !== 'active') {
      await writeLogin(false, '账号不存在或已停用', admin);
      await createAlert({
        level: 'warning',
        type: 'login_failed',
        title: '后台登录失败',
        message: `账号不存在或已停用：${username}`,
        metadata: { username, ip: meta.ip },
      });
      throw createError(401, 'INVALID_CREDENTIALS', '账号或密码错误');
    }
    if (
      admin.lockedUntil &&
      new Date(admin.lockedUntil).getTime() > Date.now()
    ) {
      await writeLogin(false, '账号暂时锁定', admin);
      await createAlert({
        level: 'warning',
        type: 'login_locked_attempt',
        title: '锁定账号仍在尝试登录',
        message: `${username} 在锁定期内继续尝试登录`,
        metadata: { username, lockedUntil: admin.lockedUntil, ip: meta.ip },
      });
      throw createError(
        423,
        'ACCOUNT_LOCKED',
        '登录失败次数过多，账号已暂时锁定',
      );
    }
    if (!verifyPassword(password, admin.passwordSalt, admin.passwordHash)) {
      const { failedLoginCount, lockedUntil } = await registerLoginFailure(
        admin.id,
      );
      await writeLogin(false, lockedUntil ? '触发登录锁定' : '密码错误', admin);
      await createAlert({
        level: lockedUntil ? 'critical' : 'warning',
        type: lockedUntil ? 'login_locked' : 'login_failed',
        title: lockedUntil ? '后台账号触发登录锁定' : '后台登录失败',
        message: `${username} 登录失败 ${failedLoginCount} 次`,
        metadata: { username, failedLoginCount, lockedUntil, ip: meta.ip },
      });
      throw createError(
        401,
        'INVALID_CREDENTIALS',
        lockedUntil ? '登录失败次数过多，账号已暂时锁定' : '账号或密码错误',
      );
    }

    if (admin.totpEnabled && !verifyTotp(admin.totpSecret, req.body.totpCode)) {
      await registerLoginFailure(admin.id);
      await writeLogin(false, '2FA 验证失败', admin);
      await createAlert({
        level: 'warning',
        type: 'login_2fa_failed',
        title: '后台 2FA 验证失败',
        message: `${username} 密码正确但 2FA 验证失败`,
        metadata: { username, ip: meta.ip },
      });
      throw createError(401, 'TOTP_REQUIRED', '请输入正确的 2FA 动态验证码');
    }

    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await writeLogin(true, '登录成功', updated);
    const lastSuccessLogin = await prisma.loginRecord.findFirst({
      where: { adminUserId: admin.id, success: true },
      orderBy: { createdAt: 'desc' },
      skip: 1,
    });
    if (
      lastSuccessLogin?.ip &&
      meta.ip &&
      lastSuccessLogin.ip !== anonymizeIp(meta.ip)
    ) {
      await createAlert({
        level: 'warning',
        type: 'login_location_changed',
        title: '后台账号登录来源变化',
        message: `${username} 从新的 IP 登录`,
        metadata: {
          username,
          currentIp: meta.ip,
          previousIp: lastSuccessLogin.ip,
        },
      });
    }
    res.json({
      success: true,
      ...sessionPayload(updated),
      user: publicAdminUser(updated),
    });
  }),
);

app.get('/api/auth/session', requireAdmin, (req, res) =>
  res.json({
    success: true,
    user: req.admin,
    ...adminSessionTiming(adminTokenFromRequest(req)),
  }),
);

app.post(
  '/api/auth/refresh',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin.id },
    });
    if (!admin || admin.status !== 'active')
      throw createError(401, 'UNAUTHORIZED', '请先登录后台');
    res.json({
      success: true,
      ...sessionPayload(admin, requestAuthTime(req)),
      user: publicAdminUser(admin),
    });
  }),
);

app.post(
  '/api/auth/change-password',
  requireAdmin,
  writeHandler(async (req, res) => {
    const oldPassword = String(req.body.oldPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!isStrongPassword(newPassword))
      throw createError(
        400,
        'WEAK_PASSWORD',
        `新密码须为 ${passwordRequirements}`,
      );
    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin.id },
    });
    if (!verifyPassword(oldPassword, admin.passwordSalt, admin.passwordHash))
      throw createError(400, 'INVALID_PASSWORD', '原密码不正确');
    const { salt, hash } = hashPassword(newPassword);
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordSalt: salt,
        passwordHash: hash,
        tokenVersion: { increment: 1 },
      },
    });
    await auditOperation(req, {
      action: 'CHANGE_PASSWORD',
      module: 'security',
      target: admin.username,
      summary: '修改当前账号密码',
    });
    res.json({ success: true });
  }),
);

app.post(
  '/api/auth/2fa/setup',
  requireAdmin,
  writeHandler(async (req, res) => {
    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin.id },
    });
    if (!admin) throw createError(404, 'NOT_FOUND', '管理员不存在');
    if (admin.totpEnabled)
      throw createError(
        409,
        'TOTP_ALREADY_ENABLED',
        '两步验证已启用。重新绑定前请验证身份并停用现有绑定。',
      );
    const secret = admin.totpSecret || createTotpSecret();
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpSecret: secret },
    });
    const issuer = encodeURIComponent('HUSHI WIND Admin');
    const label = encodeURIComponent(`${admin.username}@hushi`);
    await auditOperation(req, {
      action: 'TOTP_SETUP',
      module: 'security',
      target: admin.username,
      summary: '生成 2FA 绑定密钥',
    });
    res.json({
      success: true,
      secret,
      otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&period=30&digits=6&algorithm=SHA1`,
    });
  }),
);

app.post(
  '/api/auth/2fa/enable',
  requireAdmin,
  writeHandler(async (req, res) => {
    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin.id },
    });
    if (!admin?.totpSecret)
      throw createError(400, 'TOTP_SETUP_REQUIRED', '请先生成并绑定 2FA 密钥');
    if (!verifyTotp(admin.totpSecret, req.body.code))
      throw createError(400, 'INVALID_TOTP_CODE', '2FA 动态验证码不正确');
    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpEnabled: true, tokenVersion: { increment: 1 } },
    });
    await auditOperation(req, {
      action: 'TOTP_ENABLE',
      module: 'security',
      target: admin.username,
      summary: '启用 2FA',
    });
    res.json({
      success: true,
      ...sessionPayload(updated, requestAuthTime(req)),
      user: publicAdminUser(updated),
    });
  }),
);

app.post(
  '/api/auth/2fa/disable',
  requireAdmin,
  writeHandler(async (req, res) => {
    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin.id },
    });
    if (!admin) throw createError(404, 'NOT_FOUND', '管理员不存在');
    if (admin.totpEnabled && !verifyTotp(admin.totpSecret, req.body.code))
      throw createError(400, 'INVALID_TOTP_CODE', '2FA 动态验证码不正确');
    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        totpEnabled: false,
        totpSecret: null,
        tokenVersion: { increment: 1 },
      },
    });
    await auditOperation(req, {
      action: 'TOTP_DISABLE',
      module: 'security',
      target: admin.username,
      summary: '关闭 2FA',
    });
    res.json({
      success: true,
      ...sessionPayload(updated, requestAuthTime(req)),
      user: publicAdminUser(updated),
    });
  }),
);

app.get(
  '/api/admin/users',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: users.map(publicAdminUser), roles: roleDefinitions });
  }),
);

app.post(
  '/api/admin/users',
  requireAdmin,
  requirePermission('admin:write'),
  writeHandler(async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const role = requireAllowed(
      req.body.role,
      Object.keys(roleDefinitions),
      'readonly',
    );
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username))
      throw createError(
        400,
        'VALIDATION_ERROR',
        '账号只能使用 3-32 位字母、数字、下划线或短横线',
      );
    if (!isStrongPassword(password))
      throw createError(
        400,
        'WEAK_PASSWORD',
        `密码须为 ${passwordRequirements}`,
      );
    const { salt, hash } = hashPassword(password);
    const data = await prisma.adminUser.create({
      data: {
        username,
        displayName: String(req.body.displayName || username).trim(),
        role,
        status: requireAllowed(
          req.body.status,
          ['active', 'disabled'],
          'active',
        ),
        passwordSalt: salt,
        passwordHash: hash,
      },
    });
    await auditOperation(req, {
      action: 'CREATE',
      module: 'security',
      target: username,
      summary: '新增管理员账号',
      afterData: publicAdminUser(data),
    });
    res.status(201).json({ data: publicAdminUser(data) });
  }),
);

app.put(
  '/api/admin/users/:id',
  requireAdmin,
  requirePermission('admin:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.adminUser.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '管理员不存在');
    const data = {
      displayName: String(
        req.body.displayName || before.displayName || before.username,
      ).trim(),
      role: requireAllowed(
        req.body.role,
        Object.keys(roleDefinitions),
        before.role,
      ),
      status: requireAllowed(
        req.body.status,
        ['active', 'disabled'],
        before.status,
      ),
    };
    const isSelf = Number(req.admin.id) === Number(id);
    if (
      isSelf &&
      (data.status !== before.status || data.role !== before.role)
    ) {
      throw createError(
        400,
        'SELF_ROLE_STATUS_LOCKED',
        '不能修改当前登录账号的角色或状态，请由其他超级管理员操作',
      );
    }
    if (
      before.role === 'super_admin' &&
      before.status === 'active' &&
      (data.role !== 'super_admin' || data.status !== 'active')
    ) {
      const activeSuperAdminCount = await prisma.adminUser.count({
        where: { role: 'super_admin', status: 'active' },
      });
      if (activeSuperAdminCount <= 1) {
        throw createError(
          400,
          'LAST_SUPER_ADMIN_LOCKED',
          '不能停用或降权最后一个启用中的超级管理员',
        );
      }
    }
    await assertDefaultAdminCanBeDisabled(req, before, data);
    const updated = await prisma.adminUser.update({ where: { id }, data });
    await auditOperation(req, {
      action: 'UPDATE',
      module: 'security',
      target: updated.username,
      targetId: id,
      summary: '更新管理员账号',
      beforeData: publicAdminUser(before),
      afterData: publicAdminUser(updated),
    });
    res.json({ data: publicAdminUser(updated) });
  }),
);

app.post(
  '/api/admin/users/:id/reset-password',
  requireAdmin,
  requirePermission('admin:write'),
  writeHandler(async (req, res) => {
    requireSensitiveConfirmation(req, '重置管理员密码');
    const id = toId(req.params.id);
    const newPassword = String(req.body.newPassword || '');
    if (!isStrongPassword(newPassword))
      throw createError(
        400,
        'WEAK_PASSWORD',
        `新密码须为 ${passwordRequirements}`,
      );
    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) throw createError(404, 'NOT_FOUND', '管理员不存在');
    const { salt, hash } = hashPassword(newPassword);
    await prisma.adminUser.update({
      where: { id },
      data: {
        passwordSalt: salt,
        passwordHash: hash,
        tokenVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await auditOperation(req, {
      action: 'RESET_PASSWORD',
      module: 'security',
      target: target.username,
      targetId: id,
      summary: '重置管理员密码并踢下线',
    });
    res.json({ success: true });
  }),
);

app.get(
  '/api/admin/login-records',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = normalizePagination(req);
    const username = cleanQueryValue(req.query.username);
    const result = cleanQueryValue(req.query.result);
    const where = mergeWhere(
      username ? { username: { contains: username } } : {},
      result === 'success' ? { success: true } : {},
      result === 'failed' ? { success: false } : {},
      queryDateRangeWhere(req),
    );
    const [total, data] = await Promise.all([
      prisma.loginRecord.count({ where }),
      prisma.loginRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json(paginatedPayload(data, total, page, pageSize));
  }),
);

const visibleOperationLog = (req, row) =>
  canAdmin(req.admin, 'crm:private') || row.module !== 'crm'
    ? row
    : { ...row, beforeData: null, afterData: null, target: '客户记录' };

app.get(
  '/api/admin/audit-integrity',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json({ data: await verifyAuditIntegrity(database) });
    } catch (error) {
      if (error.code === 'AUDIT_INTEGRITY_FAILED')
        throw createError(409, error.code, '审计记录完整性校验未通过，请联系管理员检查');
      throw error;
    }
  }),
);

app.get(
  '/api/admin/operation-logs',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = normalizePagination(req);
    const module = cleanQueryValue(req.query.module);
    const action = cleanQueryValue(req.query.action);
    const operator = cleanQueryValue(req.query.operator);
    const where = mergeWhere(
      module && module !== 'all' ? { module } : {},
      action && action !== 'all' ? { action } : {},
      operator ? { operator: { contains: operator } } : {},
      queryDateRangeWhere(req),
    );
    const [total, data] = await Promise.all([
      prisma.operationLog.count({ where }),
      prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json(
      paginatedPayload(
        data.map((row) => visibleOperationLog(req, row)),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

app.get(
  '/api/admin/operation-logs/export',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    requireSensitiveConfirmation(req, '导出审计日志');
    const module = cleanQueryValue(req.query.module);
    const action = cleanQueryValue(req.query.action);
    const operator = cleanQueryValue(req.query.operator);
    const where = mergeWhere(
      module && module !== 'all' ? { module } : {},
      action && action !== 'all' ? { action } : {},
      operator ? { operator: { contains: operator } } : {},
      queryDateRangeWhere(req),
    );
    const total = await prisma.operationLog.count({ where });
    if (total > 5000)
      throw createError(
        400,
        'EXPORT_TOO_LARGE',
        `共 ${total} 条记录，请缩小日期筛选至 5000 条以内再导出`,
      );
    const rows = await prisma.operationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const header = [
      'id',
      'createdAt',
      'operator',
      'role',
      'module',
      'action',
      'target',
      'summary',
      'ip',
    ];
    const escapeCsv = csvCell;
    const csv = [
      header.join(','),
      ...rows.map((row) => {
        const visible = visibleOperationLog(req, row);
        return header.map((key) => escapeCsv(visible[key])).join(',');
      }),
    ].join('\n');
    const filename = `operation-logs.${new Date().toISOString().slice(0, 10)}.csv`;
    await auditOperation(req, {
      action: 'EXPORT_AUDIT_LOGS',
      module: 'security',
      target: filename,
      summary: `导出 ${rows.length} 条审计日志`,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csv}`);
  }),
);

app.get(
  '/api/admin/export-records',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = normalizePagination(req);
    const module = cleanQueryValue(req.query.module);
    const operator = cleanQueryValue(req.query.operator);
    const where = mergeWhere(
      module && module !== 'all' ? { module } : {},
      operator ? { operator: { contains: operator } } : {},
      queryDateRangeWhere(req),
    );
    const [total, data] = await Promise.all([
      prisma.exportRecord.count({ where }),
      prisma.exportRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json(paginatedPayload(data, total, page, pageSize));
  }),
);

app.post(
  '/api/admin/export-records',
  requireAdmin,
  requirePermission('exports:create'),
  writeHandler(async (req, res) => {
    if (
      ['crm', 'inquiries', 'artist-applications'].includes(
        String(req.body.module || '').toLowerCase(),
      )
    ) {
      requireSensitiveConfirmation(req, '导出客户资料');
    }
    const meta = getRequestMeta(req);
    const data = await prisma.exportRecord.create({
      data: {
        adminUserId: req.admin.id,
        operator: req.admin.username,
        module: String(req.body.module || 'unknown').slice(0, 80),
        filters: safeJson(req.body.filters || {}),
        rowCount: toInt(req.body.rowCount, 0),
        filename: String(req.body.filename || '').slice(0, 200),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    await auditOperation(req, {
      action: 'EXPORT',
      module: data.module,
      target: data.filename,
      summary: `导出 ${data.rowCount} 条数据`,
    });
    res.status(201).json({ data });
  }),
);

app.post(
  '/api/admin/backups',
  requireAdmin,
  requirePermission('backups:create'),
  asyncHandler(async (req, res) => {
    requireSensitiveConfirmation(req, '创建数据库备份');
    const backupDir = path.resolve(
      process.env.DATABASE_BACKUP_DIR || path.join(__dirname, 'backups'),
    );
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const source =
      resolveSqliteDatabaseFile() || path.join(__dirname, 'prisma', 'dev.db');
    const filename = `database.manual.${stamp}.${crypto.randomUUID()}.db`;
    const destination = path.join(backupDir, filename);
    try {
      await createDatabaseBackup(source, destination, {
        uploadsRoot: uploadDir,
      });
      const stat = fs.statSync(destination);
      const record = await transaction(async () => {
        const record = await prisma.backupRecord.create({
          data: {
            filename,
            size: stat.size,
            adminUserId: req.admin.id,
            operator: req.admin.username,
            status: 'success',
            message: '手动备份',
          },
        });
        await auditOperation(req, {
          action: 'BACKUP',
          module: 'system',
          target: filename,
          summary: '创建数据库备份',
        });
        return record;
      });
      res.status(201).json({ data: record });
    } catch (error) {
      const record = await prisma.backupRecord.create({
        data: {
          filename,
          size: 0,
          adminUserId: req.admin.id,
          operator: req.admin.username,
          status: 'failed',
          message: String(error.message || '备份失败').slice(0, 500),
        },
      });
      await createAlert({
        level: 'critical',
        type: 'backup_failed',
        title: '数据库备份失败',
        message: record.message,
        metadata: { filename, source },
      });
      throw createError(
        500,
        'BACKUP_FAILED',
        '数据库备份失败，请检查服务器文件权限和数据库路径',
      );
    }
  }),
);

// Reports contain only restoration evidence; no local paths or customer data.
const serializeBackup = (record) => {
  let verificationReport = null;
  try { verificationReport = JSON.parse(record.verificationReport || 'null'); } catch {}
  return { ...record, verificationReport };
};
const activeRestoreDrills = new Set();

app.get(
  '/api/admin/backups',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = normalizePagination(req);
    const status = cleanQueryValue(req.query.status);
    const where = mergeWhere(
      status && status !== 'all' ? { status } : {},
      queryDateRangeWhere(req),
    );
    const [total, data] = await Promise.all([
      prisma.backupRecord.count({ where }),
      prisma.backupRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json(paginatedPayload(data.map(serializeBackup), total, page, pageSize));
  }),
);

app.post(
  '/api/admin/backups/:id/verify-restore',
  requireAdmin,
  requirePermission('backups:create'),
  asyncHandler(async (req, res) => {
    requireSensitiveConfirmation(req, '备份恢复演练');
    const id = toId(req.params.id);
    const backup = await prisma.backupRecord.findUnique({ where: { id } });
    if (!backup || backup.status !== 'success')
      throw createError(404, 'NOT_FOUND', '可验证的备份记录不存在');
    if (activeRestoreDrills.has(id))
      throw createError(409, 'RESTORE_IN_PROGRESS', '该备份正在演练，请稍后刷新');
    activeRestoreDrills.add(id);
    const startedAt = new Date();
    try {
      // Persist an unfinished state first so interruption cannot leave an old pass visible.
      await transaction(async () => {
        await prisma.backupRecord.update({ where: { id }, data: {
          verificationStatus: 'running', verifiedAt: startedAt,
          verificationReport: JSON.stringify({ status: 'running', startedAt: startedAt.toISOString() }),
        } });
        await auditOperation(req, {
          action: 'VERIFY_RESTORE_STARTED', module: 'system', target: backup.filename,
          targetId: id, summary: '开始备份副本恢复演练',
        });
      });
      const backupRoot = path.resolve(
        process.env.DATABASE_BACKUP_DIR || path.join(__dirname, 'backups'),
      );
      const backupPath = path.resolve(backupRoot, path.basename(backup.filename));
      let report;
      let failed = false;
      try {
        if (fs.statSync(backupPath).size !== backup.size)
          throw new Error('BACKUP_SIZE_MISMATCH');
        report = await restoreBackupDrill(backupPath, {
          scratchRoot: path.join(backupRoot, 'restore-checks'),
        });
      } catch {
        failed = true;
        const completedAt = new Date().toISOString();
        report = {
          status: 'failed', startedAt: startedAt.toISOString(), completedAt,
          durationMs: Date.now() - startedAt.getTime(), code: 'RESTORE_VERIFY_FAILED',
          message: '恢复演练未通过，请检查备份、素材及审计完整性。当前数据库未被覆盖。',
        };
      }
      const verifiedAt = new Date(report.completedAt);
      const updatedBackup = await transaction(async () => {
        const updated = await prisma.backupRecord.update({ where: { id }, data: {
          verificationStatus: failed ? 'failed' : 'verified', verifiedAt,
          verificationReport: JSON.stringify(report),
        } });
        await auditOperation(req, {
          action: failed ? 'VERIFY_RESTORE_FAILED' : 'VERIFY_RESTORE',
          module: 'system', target: backup.filename, targetId: id,
          summary: failed ? '备份副本恢复演练失败' : '完成数据库、素材与审计恢复演练',
          afterData: report,
        });
        return updated;
      });
      if (failed) return res.status(500).json({
        success: false, error: { code: report.code, message: report.message },
        data: { report, backup: serializeBackup(updatedBackup) },
      });
      res.json({ success: true, data: {
        filename: backup.filename, size: backup.size, verifiedAt,
        report, backup: serializeBackup(updatedBackup),
      } });
    } finally {
      activeRestoreDrills.delete(id);
    }
  }),
);

app.get(
  '/api/admin/alerts',
  requireAdmin,
  requirePermission('logs:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = normalizePagination(req);
    const type = cleanQueryValue(req.query.type);
    const level = cleanQueryValue(req.query.level);
    const status = cleanQueryValue(req.query.status);
    const where = mergeWhere(
      type && type !== 'all' ? { type } : {},
      level && level !== 'all' ? { level } : {},
      status && status !== 'all' ? { status } : {},
    );
    const [total, data] = await Promise.all([
      prisma.alertRecord.count({ where }),
      prisma.alertRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json(paginatedPayload(data, total, page, pageSize));
  }),
);

app.put(
  '/api/admin/alerts/resolve-batch',
  requireAdmin,
  requirePermission('alerts:write'),
  writeHandler(async (req, res) => {
    const ids = Array.isArray(req.body.ids)
      ? req.body.ids
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0)
      : [];
    if (
      Object.hasOwn(req.body, 'ids') &&
      (!Array.isArray(req.body.ids) ||
        !ids.length ||
        ids.length !== req.body.ids.length)
    )
      throw createError(400, 'INVALID_IDS', '请选择有效的告警记录');
    if (!Object.hasOwn(req.body, 'ids') && req.body.allMatching !== true)
      throw createError(400, 'EXPLICIT_SCOPE_REQUIRED', '请明确选择按筛选处理');
    const type = cleanQueryValue(req.body.type);
    const level = cleanQueryValue(req.body.level);
    const status = cleanQueryValue(req.body.status);
    const where = ids.length
      ? { id: { in: ids }, status: 'new' }
      : mergeWhere(
          type && type !== 'all' ? { type } : {},
          level && level !== 'all' ? { level } : {},
          status && status !== 'all' ? { status } : { status: 'new' },
        );
    const result = await prisma.alertRecord.updateMany({
      where,
      data: { status: 'resolved' },
    });
    await auditOperation(req, {
      action: 'RESOLVE_ALERT_BATCH',
      module: 'monitoring',
      target: ids.length ? `ids:${ids.length}` : 'current-filter',
      summary: `批量处理监控报警 ${result.count} 条`,
      afterData: {
        count: result.count,
        ids: ids.slice(0, 200),
        type,
        level,
        status: status || 'new',
      },
    });
    res.json({ success: true, count: result.count });
  }),
);

app.put(
  '/api/admin/alerts/:id/resolve',
  requireAdmin,
  requirePermission('alerts:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const data = await prisma.alertRecord.update({
      where: { id },
      data: { status: 'resolved' },
    });
    await auditOperation(req, {
      action: 'RESOLVE_ALERT',
      module: 'monitoring',
      target: data.type,
      targetId: id,
      summary: '处理监控报警',
    });
    res.json({ data });
  }),
);

app.get(
  '/api/admin/ops-health',
  requireAdmin,
  requirePermission('dashboard:read'),
  asyncHandler(async (req, res) => {
    const canReadOpsLogs = canAdmin(req.admin, 'logs:read');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const file = sqliteDatabaseFileHealth();
    const coreTables = await coreTableHealth();
    const databaseOk =
      file.status !== 'error' &&
      coreTables.every((table) => table.status === 'ok');
    const uploads = await getCachedUploadHealth();
    const riskyResources = uploads.filter(
      (item) => item.type === 'image' && item.riskLevel !== 'ok',
    );
    const heavyResources = uploads.filter(
      (item) => item.type === 'image' && item.riskLevel === 'danger',
    );

    const [
      apiRequestCount,
      apiErrorCount,
      slowApiCount,
      recentApiErrors,
      loginFailedCount,
      lockedAdminCount,
      recentLoginFailures,
      openAlertCount,
      criticalAlertCount,
      warningAlertCount,
      recentAlerts,
      recentBackup,
      adminUsers,
    ] = await Promise.all([
      prisma.apiRequestLog.count({ where: { createdAt: { gte: since } } }),
      prisma.apiRequestLog.count({
        where: { createdAt: { gte: since }, status: { gte: 500 } },
      }),
      prisma.apiRequestLog.count({
        where: { createdAt: { gte: since }, durationMs: { gte: 1000 } },
      }),
      prisma.apiRequestLog.findMany({
        where: { createdAt: { gte: since }, status: { gte: 500 } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.loginRecord.count({
        where: { createdAt: { gte: since }, success: false },
      }),
      prisma.adminUser.count({ where: { lockedUntil: { gt: new Date() } } }),
      prisma.loginRecord.findMany({
        where: { createdAt: { gte: since }, success: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.alertRecord.count({ where: { status: 'new' } }),
      prisma.alertRecord.count({ where: { status: 'new', level: 'critical' } }),
      prisma.alertRecord.count({ where: { status: 'new', level: 'warning' } }),
      prisma.alertRecord.findMany({
        where: { status: 'new' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.backupRecord.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.adminUser.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
          totpEnabled: true,
          lastLoginAt: true,
        },
      }),
    ]);

    const disk = diskHealthSummary();
    const pm2 = pm2HealthSummary();
    const latestBackup = latestBackupFile();
    const backup =
      recentBackup ||
      (latestBackup
        ? {
            id: null,
            filename: latestBackup.filename,
            size: latestBackup.size,
            status: 'success',
            message: 'file-system backup',
            createdAt: latestBackup.createdAt,
          }
        : null);

    const alertLevels = {
      critical: criticalAlertCount,
      warning: warningAlertCount,
    };
    const apiSummary = {
      requestCount: apiRequestCount,
      errorCount: apiErrorCount,
      slowCount: slowApiCount,
      errorRate: apiRequestCount
        ? Number(((apiErrorCount / apiRequestCount) * 100).toFixed(2))
        : 0,
    };
    const loginSummary = {
      failedCount: loginFailedCount,
      lockedAdminCount,
    };
    const alertsSummary = {
      openCount: openAlertCount,
      levels: alertLevels,
    };
    const productionReadiness = buildProductionReadiness({
      adminUsers,
      backup,
      alerts: alertsSummary,
      api: apiSummary,
      login: loginSummary,
      disk,
      databaseOk,
    });
    const recentRisks = [
      ...(canReadOpsLogs ? recentAlerts : []).map((item) => ({
        id: `alert-${item.id}`,
        level: item.level,
        type: item.type,
        title: item.title,
        detail: item.message || '',
        createdAt: item.createdAt,
      })),
      ...(canReadOpsLogs ? recentApiErrors : []).map((item) => ({
        id: `api-${item.id}`,
        level: 'critical',
        type: 'api_5xx',
        title: `${item.method} ${item.path}`,
        detail: `${item.status} / ${item.durationMs}ms${item.errorMessage ? ` / ${item.errorMessage}` : ''}`,
        createdAt: item.createdAt,
      })),
      ...(canReadOpsLogs ? recentLoginFailures : []).map((item) => ({
        id: `login-${item.id}`,
        level: 'warning',
        type: 'login_failed',
        title: `登录失败：${item.username}`,
        detail: item.message || item.ip || '',
        createdAt: item.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);

    res.json({
      data: {
        since,
        database: {
          status: databaseOk ? 'ok' : 'error',
          file,
          coreTables,
        },
        api: {
          ...apiSummary,
          recentErrors: canReadOpsLogs ? recentApiErrors : [],
        },
        login: {
          ...loginSummary,
          recentFailures: canReadOpsLogs ? recentLoginFailures : [],
        },
        alerts: {
          ...alertsSummary,
          recent: canReadOpsLogs ? recentAlerts : [],
        },
        resources: {
          uploadCount: uploads.length,
          riskyImageCount: riskyResources.length,
          heavyImageCount: heavyResources.length,
          recentRisks: riskyResources.slice(0, 6),
        },
        disk,
        pm2,
        backup,
        productionReadiness,
        latestBackupFile: latestBackup,
        recentRisks,
      },
    });
  }),
);

app.get(
  '/api/dashboard/stats',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const range = cleanQueryValue(req.query.range) || '7d';
    const [
      pCount,
      aCount,
      products,
      unreadInquiries,
      pendingArtists,
      analytics,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.article.count(),
      prisma.product.findMany({ select: { quantity: true, price: true } }),
      prisma.inquiry.count({ where: { isRead: false, ...inquiryScope(req.admin) } }),
      prisma.artistApplication.count({ where: { status: 'pending' } }),
      analyticsSummary(range),
    ]);
    const totalValue = products.reduce(
      (sum, p) => sum + p.quantity * p.price,
      0,
    );
    const chartData = {
      dates: analytics.daily.dates,
      values: analytics.daily.visits,
    };
    res.json({
      products: pCount,
      articles: aCount,
      totalValue: totalValue.toFixed(2),
      unreadInquiries,
      pendingArtists,
      chartData,
      analytics,
    });
  }),
);

app.get(
  '/api/admin/analytics',
  requireAdmin,
  requirePermission('dashboard:read'),
  asyncHandler(async (req, res) => {
    const range = cleanQueryValue(req.query.range) || '7d';
    res.json({ data: await analyticsSummary(range) });
  }),
);

// 3. 核心业务线 (产品、新闻、系统配置、展示名录)
app.get(
  '/api/products',
  asyncHandler(async (req, res) => {
    if (
      (req.query.admin === '1' || req.query.preview === '1') &&
      !isAuthorizedAdmin(req)
    )
      throw createError(401, 'UNAUTHORIZED', '请先登录后台');
    if (isAdminRequest(req) && !canAdmin(req.admin, 'products:read'))
      throw createError(403, 'FORBIDDEN', '当前账号没有产品查看权限');
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type =
      typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const status = cleanQueryValue(req.query.status);
    const { page, pageSize, skip, take } = normalizePagination(
      req,
      isAdminRequest(req) ? 20 : 50,
    );
    const filters = mergeWhere(
      {
        ...(type && type !== 'all' ? { type } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { series: { contains: search } },
                { categoryName: { contains: search } },
                { description: { contains: search } },
                { specs: { contains: search } },
                { features: { contains: search } },
                { scenes: { contains: search } },
              ],
            }
          : {}),
      },
      isAdminRequest(req) ? statusFilterWhere(status) : {},
    );
    const where = mergeWhere(
      isAdminRequest(req) ? {} : publicStatusWhere,
      filters,
    );
    const [total, list] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json(
      paginatedPayload(
        list.map((p) => ({
          id: p.id,
          attributes: {
            ...p,
            image: p.imageUrl
              ? { data: { attributes: { url: p.imageUrl } } }
              : null,
          },
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);
app.get(
  '/api/products/slug-check/:slug',
  requireAdmin,
  requirePermission('products:read'),
  asyncHandler(async (req, res) => {
    const slug = cleanQueryValue(req.params.slug);
    if (!slugPattern.test(slug))
      throw createError(400, 'VALIDATION_ERROR', '产品 URL 后缀格式不正确');
    const excludeId = toInt(req.query.excludeId, 0);
    const row = await prisma.product.findFirst({
      where: mergeWhere({ slug }, excludeId ? { NOT: { id: excludeId } } : {}),
    });
    res.json({ available: !row });
  }),
);
app.get(
  '/api/products/:id/versions',
  requireAdmin,
  requirePermission('products:read'),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    res.json(await contentHistory(prisma, 'product', id, req.query));
  }),
);
app.post(
  '/api/products/:id/restore/:versionId',
  requireAdmin,
  requirePermission('products:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const versionId = toId(req.params.versionId);
    const version = await prisma.contentVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.module !== 'product' || version.recordId !== id)
      throw createError(404, 'NOT_FOUND', '版本不存在');
    const before = await prisma.product.findUnique({ where: { id } });
    const snapshot = parseSnapshot(version.snapshot);
    delete snapshot.id;
    delete snapshot.createdAt;
    delete snapshot.updatedAt;
    const updated = await prisma.product.update({
      where: { id },
      data: validateProductPayload({
        ...await reconcileCatalogSnapshot(prisma, snapshot, before),
        lastEditedBy: req.admin.username,
      }),
    });
    await saveContentVersion(req, 'product', before);
    await auditOperation(req, {
      action: 'RESTORE',
      module: 'products',
      target: updated.title,
      targetId: id,
      summary: `恢复版本 ${versionId}`,
      beforeData: before,
      afterData: updated,
    });
    res.json(updated);
  }),
);
app.post(
  '/api/products',
  requireAdmin,
  requirePermission('products:write'),
  writeHandler(async (req, res) => {
    const data = validateProductPayload({
      ...req.body,
      lastEditedBy: req.admin.username,
    });
    if (data.status === 'published' && !data.publishedAt)
      data.publishedAt = new Date();
    const created = await prisma.product.create({ data });
    await saveContentVersion(req, 'product', created);
    await auditOperation(req, {
      action: 'CREATE',
      module: 'products',
      target: created.title,
      targetId: created.id,
      summary: '创建产品',
      afterData: created,
    });
    res.status(201).json(created);
  }),
);
app.put(
  '/api/products/:id',
  requireAdmin,
  requirePermission('products:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '产品不存在');
    const versionWhere = recordVersionWhere(req, before);
    await saveContentVersion(req, 'product', before);
    const data = validateProductPayload({
      ...before,
      ...req.body,
      lastEditedBy: req.admin.username,
    });
    if (data.status === 'published' && !data.publishedAt)
      data.publishedAt = before.publishedAt || new Date();
    if (data.status === 'hidden' && !data.hiddenAt) data.hiddenAt = new Date();
    const updated = await updateWithVersion(prisma.product, versionWhere, { ...data, updatedAt: nextUpdatedAt(before) });
    await auditOperation(req, {
      action: 'UPDATE',
      module: 'products',
      target: updated.title,
      targetId: id,
      summary: '更新产品',
      beforeData: before,
      afterData: updated,
    });
    res.json(updated);
  }),
);
app.delete(
  '/api/products/:id',
  requireAdmin,
  requirePermission('products:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '产品不存在');
    await saveContentVersion(req, 'product', before);
    await workflows.archive(req, 'product', before);
    await prisma.product.delete({ where: { id } });
    await auditOperation(req, {
      action: 'DELETE',
      module: 'products',
      target: before.title,
      targetId: id,
      summary: '删除产品',
      beforeData: before,
    });
    res.json({ success: true });
  }),
);

app.get(
  '/api/articles',
  asyncHandler(async (req, res) => {
    if (
      (req.query.admin === '1' || req.query.preview === '1') &&
      !isAuthorizedAdmin(req)
    )
      throw createError(401, 'UNAUTHORIZED', '请先登录后台');
    if (isAdminRequest(req) && !canAdmin(req.admin, 'articles:read'))
      throw createError(403, 'FORBIDDEN', '当前账号没有新闻查看权限');
    const status = cleanQueryValue(req.query.status);
    const search = cleanQueryValue(req.query.search);
    const { page, pageSize, skip, take } = normalizePagination(
      req,
      isAdminRequest(req) ? 20 : 50,
    );
    const where = mergeWhere(
      isAdminRequest(req) ? {} : publicStatusWhere,
      isAdminRequest(req) ? statusFilterWhere(status) : {},
      search
        ? {
            OR: [
              { title: { contains: search } },
              { category: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {},
    );
    const [total, list] = await Promise.all([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json(
      paginatedPayload(
        list.map((a) => ({
          id: a.id,
          attributes: {
            ...a,
            image: a.imageUrl
              ? { data: { attributes: { url: a.imageUrl } } }
              : null,
          },
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);
app.get(
  '/api/articles/:id',
  asyncHandler(async (req, res) => {
    if (
      (req.query.admin === '1' || req.query.preview === '1') &&
      !isAuthorizedAdmin(req)
    )
      throw createError(401, 'UNAUTHORIZED', '请先登录后台');
    const id = toId(req.params.id);
    const data = await prisma.article.findUnique({ where: { id } });
    if (isAuthorizedAdmin(req) && !canAdmin(req.admin, 'articles:read'))
      throw createError(403, 'FORBIDDEN', '没有新闻查看权限');
    if (
      !data ||
      (!isAuthorizedAdmin(req) &&
        !['published', 'active'].includes(data.status))
    )
      return res.status(404).json({ data: null });
    return res.json({
      data: {
        id: data.id,
        attributes: {
          ...data,
          image: data.imageUrl
            ? { data: { attributes: { url: data.imageUrl } } }
            : null,
        },
      },
    });
  }),
);
app.get(
  '/api/articles/:id/versions',
  requireAdmin,
  requirePermission('articles:read'),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    res.json(await contentHistory(prisma, 'article', id, req.query));
  }),
);
app.post(
  '/api/articles/:id/restore/:versionId',
  requireAdmin,
  requirePermission('articles:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const versionId = toId(req.params.versionId);
    const version = await prisma.contentVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.module !== 'article' || version.recordId !== id)
      throw createError(404, 'NOT_FOUND', '版本不存在');
    const before = await prisma.article.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '新闻不存在');
    const snapshot = parseSnapshot(version.snapshot);
    delete snapshot.id;
    delete snapshot.createdAt;
    delete snapshot.updatedAt;
    const data = validateArticlePayload({
      ...snapshot,
      lastEditedBy: req.admin.username,
    });
    if (data.status === 'published' && !data.publishedAt)
      data.publishedAt = before.publishedAt || new Date();
    if (data.status === 'hidden' && !data.hiddenAt) data.hiddenAt = new Date();
    const updated = await prisma.article.update({ where: { id }, data });
    await saveContentVersion(req, 'article', before);
    await auditOperation(req, {
      action: 'RESTORE',
      module: 'articles',
      target: updated.title,
      targetId: id,
      summary: `恢复新闻版本 ${versionId}`,
      beforeData: before,
      afterData: updated,
    });
    res.json(updated);
  }),
);
app.post(
  '/api/articles',
  requireAdmin,
  requirePermission('articles:write'),
  writeHandler(async (req, res) => {
    const data = validateArticlePayload({
      ...req.body,
      lastEditedBy: req.admin.username,
    });
    if (data.status === 'published' && !data.publishedAt)
      data.publishedAt = new Date();
    const created = await prisma.article.create({ data });
    await saveContentVersion(req, 'article', created);
    await auditOperation(req, {
      action: 'CREATE',
      module: 'articles',
      target: created.title,
      targetId: created.id,
      summary: '创建新闻',
      afterData: created,
    });
    res.status(201).json(created);
  }),
);
app.put(
  '/api/articles/:id',
  requireAdmin,
  requirePermission('articles:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.article.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '新闻不存在');
    const versionWhere = recordVersionWhere(req, before);
    await saveContentVersion(req, 'article', before);
    const data = validateArticlePayload({
      ...before,
      ...req.body,
      lastEditedBy: req.admin.username,
    });
    if (data.status === 'published' && !data.publishedAt)
      data.publishedAt = before.publishedAt || new Date();
    if (data.status === 'hidden' && !data.hiddenAt) data.hiddenAt = new Date();
    const updated = await updateWithVersion(prisma.article, versionWhere, data);
    await auditOperation(req, {
      action: 'UPDATE',
      module: 'articles',
      target: updated.title,
      targetId: id,
      summary: '更新新闻',
      beforeData: before,
      afterData: updated,
    });
    res.json(updated);
  }),
);
app.delete(
  '/api/articles/:id',
  requireAdmin,
  requirePermission('articles:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.article.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '新闻不存在');
    await saveContentVersion(req, 'article', before);
    await workflows.archive(req, 'article', before);
    await prisma.article.delete({ where: { id } });
    await auditOperation(req, {
      action: 'DELETE',
      module: 'articles',
      target: before.title,
      targetId: id,
      summary: '删除新闻',
      beforeData: before,
    });
    res.json({ success: true });
  }),
);

app.get(
  '/api/config',
  asyncHandler(async (req, res) => {
    let config = await prisma.systemConfig.findUnique({ where: { id: 1 } });
    if (!config) config = await prisma.systemConfig.create({ data: { id: 1 } });
    res.json(config);
  }),
);
app.put(
  '/api/config',
  requireAdmin,
  requirePermission('config:write'),
  writeHandler(async (req, res) => {
    const before = await prisma.systemConfig.findUnique({ where: { id: 1 } });
    const versionWhere = recordVersionWhere(req, before);
    await saveContentVersion(req, 'config', before);
    const updated = await updateWithVersion(
      prisma.systemConfig,
      versionWhere,
      validateConfigPayload(req.body),
    );
    await auditOperation(req, {
      action: 'UPDATE',
      module: 'config',
      target: 'system-config',
      targetId: 1,
      summary: '更新全局配置',
      beforeData: before,
      afterData: updated,
    });
    res.json(updated);
  }),
);

app.get(
  '/api/artists',
  asyncHandler(async (req, res) => {
    if (req.query.admin === '1' && !isAuthorizedAdmin(req))
      throw createError(401, 'UNAUTHORIZED', '请先登录后台');
    if (req.query.admin === '1' && !canAdmin(req.admin, 'artists:read'))
      throw createError(403, 'FORBIDDEN', '当前账号没有艺术家查看权限');
    const { page, pageSize, skip, take } = normalizePagination(
      req,
      req.query.admin === '1' ? 20 : 50,
    );
    const keyword = cleanQueryValue(req.query.search);
    const where = mergeWhere(
      isAdminRequest(req)
        ? statusFilterWhere(cleanQueryValue(req.query.status))
        : publicStatusWhere,
      keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { role: { contains: keyword } },
              { equipment: { contains: keyword } },
            ],
          }
        : {},
    );
    const [total, list] = await Promise.all([
      prisma.artist.count({ where }),
      prisma.artist.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);
    res.json(
      paginatedPayload(
        list.map((a) => ({
          id: a.id,
          attributes: {
            ...a,
            image: a.imageUrl
              ? { data: { attributes: { url: a.imageUrl } } }
              : null,
          },
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);
app.post(
  '/api/artists',
  requireAdmin,
  requirePermission('artists:write'),
  writeHandler(async (req, res) => {
    const created = await prisma.artist.create({
      data: validateArtistPayload(req.body),
    });
    await auditOperation(req, {
      action: 'CREATE',
      module: 'artists',
      target: created.name,
      targetId: created.id,
      summary: '创建艺术家',
      afterData: created,
    });
    res.status(201).json(created);
  }),
);
app.put(
  '/api/artists/:id',
  requireAdmin,
  requirePermission('artists:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.artist.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '艺术家不存在');
    const versionWhere = recordVersionWhere(req, before);
    await saveContentVersion(req, 'artist', before);
    const updated = await updateWithVersion(
      prisma.artist,
      versionWhere,
      validateArtistPayload({ ...before, ...req.body }),
    );
    await auditOperation(req, {
      action: 'UPDATE',
      module: 'artists',
      target: updated.name,
      targetId: id,
      summary: '更新艺术家',
      beforeData: before,
      afterData: updated,
    });
    res.json(updated);
  }),
);
app.delete(
  '/api/artists/:id',
  requireAdmin,
  requirePermission('artists:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.artist.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '艺术家不存在');
    await workflows.archive(req, 'artist', before);
    await prisma.artist.delete({ where: { id } });
    await auditOperation(req, {
      action: 'DELETE',
      module: 'artists',
      target: before.name,
      targetId: id,
      summary: '删除艺术家',
      beforeData: before,
    });
    res.json({ success: true });
  }),
);

// 4. 客户与工单 CRM 中心
app.post(
  '/api/inquiries',
  writeHandler(async (req, res) => {
    try {
      assertPublicFormGuard(req, 'inquiry');
    } catch (error) {
      await createAlert({
        level: 'warning',
        type: 'form_submit_failed',
        title: '公开表单提交被拦截',
        message: error.message,
        metadata: {
          form: 'inquiry',
          pagePath: req.body?.pagePath,
          code: error.code,
          ip: getRequestMeta(req).ip,
        },
      });
      throw error;
    }
    const data = validateInquiryPayload(req.body, { publicOnly: true });
    const receipt = await submissionReceipt(req, 'inquiry', data);
    if (receipt.existing)
      return res
        .status(200)
        .json({
          success: true,
          data: { id: receipt.existing.recordId },
          replayed: true,
        });
    const created = await prisma.inquiry.create({ data });
    await prisma.submissionReceipt.create({
      data: {
        key: receipt.key,
        scope: receipt.scope,
        payloadHash: receipt.payloadHash,
        recordId: created.id,
      },
    });
    await notifyWebhook('inquiry_created', {
      id: created.id,
      type: created.inquiryType,
      priority: created.priority,
      city: created.city,
      productTitle: created.productTitle,
      customerName: created.customerName,
      contactInfo: maskContact(created.contactInfo),
    });
    afterCommit(() =>
      recordAnalyticsEvent(req, {
        eventType: 'form_submit',
        pagePath: req.body.pagePath,
        source: req.body.source,
        sessionId: req.body.sessionId,
        visitorId: req.body.visitorId,
        entityType: data.productId ? 'product' : 'support',
        entityId: data.productId ? String(data.productId) : '',
        entityTitle: data.productTitle,
        ctaName:
          data.inquiryType === 'quote'
            ? 'quote'
            : data.inquiryType === 'appointment'
              ? 'appointment'
              : 'support-ticket',
        metadata: {
          city: data.city,
          budget: data.budget,
          preferredTime: data.preferredTime,
        },
      }),
    );
    res.status(201).json({ success: true, data: { id: created.id } });
  }),
);
app.get(
  '/api/inquiries',
  requireAdmin,
  requirePermission('crm:read'),
  asyncHandler(async (req, res) => {
    const keyword = cleanQueryValue(req.query.keyword);
    const status = cleanQueryValue(req.query.status);
    const priority = cleanQueryValue(req.query.priority);
    const type = cleanQueryValue(req.query.type);
    const city = cleanQueryValue(req.query.city);
    const product = cleanQueryValue(req.query.product);
    const startDate = normalizeDateStart(req.query.startDate);
    const endDate = normalizeDateEnd(req.query.endDate);
    const { page, pageSize, skip, take } = normalizePagination(req);
    const where = mergeWhere(
      inquiryScope(req.admin),
      status && status !== 'all' ? { status } : {},
      req.query.assigneeId ? { assigneeId: toId(req.query.assigneeId) } : {},
      req.query.due === '1'
        ? {
            nextFollowUpAt: { lte: new Date() },
            status: { notIn: ['done', 'closed'] },
          }
        : {},
      priority && priority !== 'all' ? { priority } : {},
      type && type !== 'all'
        ? type === 'general'
          ? {
              OR: [
                { inquiryType: null },
                { inquiryType: '' },
                { inquiryType: 'general' },
              ],
            }
          : { inquiryType: type }
        : {},
      city ? { city: { contains: city } } : {},
      product ? { productTitle: { contains: product } } : {},
      keyword
        ? {
            OR: [
              { customerName: { contains: keyword } },
              ...(canAdmin(req.admin, 'crm:private')
                ? [{ contactInfo: { contains: keyword } }]
                : []),
              { productTitle: { contains: keyword } },
              { city: { contains: keyword } },
              { message: { contains: keyword } },
              ...(canAdmin(req.admin, 'crm:private')
                ? [{ internalNote: { contains: keyword } }]
                : []),
            ],
          }
        : {},
      startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {},
    );
    const [total, rows] = await Promise.all([
      prisma.inquiry.count({ where }),
      prisma.inquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    const data = canAdmin(req.admin, 'crm:private')
      ? rows.map((row) => withHiddenContact(row, INQUIRY_CONTACT_FIELDS))
      : rows.map((row) => ({
          ...row,
          contactInfo: maskContact(row.contactInfo),
          internalNote: row.internalNote ? '已隐藏' : '',
        }));
    res.json(paginatedPayload(data, total, page, pageSize));
  }),
);
app.post(
  '/api/inquiries/:id/contact',
  ...revealContactHandler('inquiry', INQUIRY_CONTACT_FIELDS, 'customerName', '咨询'),
);
app.post(
  '/api/artist-applications/:id/contact',
  ...revealContactHandler('artistApplication', APPLICATION_CONTACT_FIELDS, 'name', '艺术家申请'),
);
app.put(
  '/api/inquiries/:id/read',
  requireAdmin,
  requirePermission('crm:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    await prisma.inquiry.update({ where: { id, ...inquiryScope(req.admin) }, data: { isRead: true } });
    await auditOperation(req, {
      action: 'READ',
      module: 'crm',
      target: 'inquiry',
      targetId: id,
      summary: '标记工单已读',
    });
    res.json({ success: true });
  }),
);
app.put(
  '/api/inquiries/:id',
  requireAdmin,
  requirePermission('crm:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.inquiry.findFirst({ where: { id, ...inquiryScope(req.admin) } });
    if (!before) throw createError(404, 'NOT_FOUND', '工单不存在');
    const patch = normalizeInquiryUpdatePayload(req.body);
    if (Object.hasOwn(patch, 'assigneeId') && patch.assigneeId !== before.assigneeId && req.admin.role !== 'super_admin')
      throw createError(403, 'ASSIGNMENT_FORBIDDEN', '负责人只能由超级管理员分配或调整');
    if (
      patch.assigneeId &&
      !(await prisma.adminUser.findFirst({
        where: {
          id: patch.assigneeId,
          status: 'active',
          role: { in: ['super_admin', 'support'] },
        },
      }))
    )
      throw createError(400, 'INVALID_ASSIGNEE', '负责人账号不可用');
    const versionWhere = { ...recordVersionWhere(req, before), ...inquiryScope(req.admin) };
    const data = await updateWithVersion(prisma.inquiry, versionWhere, { ...patch, revision: { increment: 1 } });
    const note =
      typeof req.body.followUpNote === 'string'
        ? req.body.followUpNote.trim()
        : '';
    if (note.length > 4000)
      throw createError(400, 'VALIDATION_ERROR', '跟进记录不能超过 4000 字符');
    if (note || (patch.status && patch.status !== before.status))
      await prisma.inquiryFollowUp.create({
        data: {
          inquiryId: id,
          note: note || '更新跟进阶段',
          status: data.status,
          operator: req.admin.username,
        },
      });
    await auditOperation(req, {
      action: 'UPDATE',
      module: 'crm',
      target: before.customerName,
      targetId: id,
      summary: '更新工单跟进',
      beforeData: before,
      afterData: data,
    });
    res.json({
      success: true,
      data: withHiddenContact(privateCrmRow(req, data), INQUIRY_CONTACT_FIELDS),
    });
  }),
);
app.delete(
  '/api/inquiries/:id',
  requireAdmin,
  requirePermission('crm:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.inquiry.findFirst({ where: { id, ...inquiryScope(req.admin) } });
    if (!before) throw createError(404, 'NOT_FOUND', '工单不存在');
    await workflows.archive(req, 'inquiry', before);
    await prisma.inquiry.delete({ where: { id, ...inquiryScope(req.admin) } });
    await auditOperation(req, {
      action: 'DELETE',
      module: 'crm',
      target: before.customerName,
      targetId: id,
      summary: '删除工单',
      beforeData: before,
    });
    res.json({ success: true });
  }),
);

app.post(
  '/api/artist-applications',
  writeHandler(async (req, res) => {
    try {
      assertPublicFormGuard(req, 'artist-application');
    } catch (error) {
      await createAlert({
        level: 'warning',
        type: 'form_submit_failed',
        title: '艺术家申请提交被拦截',
        message: error.message,
        metadata: {
          form: 'artist-application',
          pagePath: req.body?.pagePath,
          code: error.code,
          ip: getRequestMeta(req).ip,
        },
      });
      throw error;
    }
    const data = validateArtistApplicationPayload(req.body);
    const receipt = await submissionReceipt(req, 'artistApplication', data);
    if (receipt.existing)
      return res
        .status(200)
        .json({
          success: true,
          data: { id: receipt.existing.recordId },
          replayed: true,
        });
    const created = await prisma.artistApplication.create({ data });
    await prisma.submissionReceipt.create({
      data: {
        key: receipt.key,
        scope: receipt.scope,
        payloadHash: receipt.payloadHash,
        recordId: created.id,
      },
    });
    await notifyWebhook('artist_application_created', {
      id: created.id,
      name: created.name,
      email: created.email,
      phone: maskContact(created.phone),
      portfolioUrl: created.portfolioUrl,
    });
    afterCommit(() =>
      recordAnalyticsEvent(req, {
        eventType: 'form_submit',
        pagePath: req.body.pagePath,
        source: req.body.source,
        sessionId: req.body.sessionId,
        visitorId: req.body.visitorId,
        entityType: 'artist-application',
        entityTitle: data.name,
        ctaName: 'artist-application',
      }),
    );
    res.status(201).json({ success: true, data: { id: created.id } });
  }),
);
app.get(
  '/api/artist-applications',
  requireAdmin,
  requirePermission('crm:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = normalizePagination(req);
    const keyword = cleanQueryValue(req.query.keyword),
      status = cleanQueryValue(req.query.status);
    const where = mergeWhere(
      keyword ? { name: { contains: keyword } } : {},
      status && status !== 'all' ? { status } : {},
    );
    const [total, data] = await Promise.all([
      prisma.artistApplication.count({ where }),
      prisma.artistApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json(
      paginatedPayload(
        data.map((row) =>
          withHiddenContact(privateCrmRow(req, row), APPLICATION_CONTACT_FIELDS),
        ),
        total,
        page,
        pageSize,
      ),
    );
  }),
);
app.put(
  '/api/artist-applications/:id/status',
  requireAdmin,
  requirePermission('crm:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.artistApplication.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '申请不存在');
    const status = requireAllowed(
      req.body.status,
      ['pending', 'reviewed', 'approved', 'rejected'],
      'reviewed',
    );
    const after = await prisma.artistApplication.update({
      where: { id },
      data: { status },
    });
    await auditOperation(req, {
      action: 'UPDATE',
      module: 'crm',
      target: before.name,
      targetId: id,
      summary: '更新艺术家申请状态',
      beforeData: before,
      afterData: after,
    });
    res.json({ success: true });
  }),
);
app.delete(
  '/api/artist-applications/:id',
  requireAdmin,
  requirePermission('crm:write'),
  writeHandler(async (req, res) => {
    const id = toId(req.params.id);
    const before = await prisma.artistApplication.findUnique({ where: { id } });
    if (!before) throw createError(404, 'NOT_FOUND', '申请不存在');
    await workflows.archive(req, 'artistApplication', before);
    await prisma.artistApplication.delete({ where: { id } });
    await auditOperation(req, {
      action: 'DELETE',
      module: 'crm',
      target: before.name,
      targetId: id,
      summary: '删除艺术家申请',
      beforeData: before,
    });
    res.json({ success: true });
  }),
);

// 🌟 5. 极简合并的 CMS 动态路由工厂
const cmsModels = [
  { route: 'support-faqs', model: 'supportFaq' },
  { route: 'support-downloads', model: 'supportDownload' },
  { route: 'audio-solutions', model: 'audioSolution' },
  { route: 'audio-stats', model: 'audioStat' },
  { route: 'brand-timelines', model: 'brandTimeline' },
  { route: 'ecosystem-services', model: 'ecosystemService' },
  { route: 'quick-guides', model: 'quickGuide' },
  { route: 'page-contents', model: 'pageContent', noSort: true },
];

const cmsSearchFields = {
  supportFaq: ['question', 'answer', 'category'],
  supportDownload: ['name', 'type', 'size'],
  audioSolution: ['title', 'en', 'desc'],
  audioStat: ['label', 'value', 'desc'],
  brandTimeline: ['year', 'title', 'desc'],
  ecosystemService: ['icon', 'title', 'desc', 'link'],
  quickGuide: ['title', 'duration', 'category'],
  pageContent: ['slug', 'title', 'content'],
};

cmsModels.forEach(({ route, model, noSort }) => {
  app.get(
    `/api/${route}`,
    asyncHandler(async (req, res) => {
      if (
        (req.query.admin === '1' || req.query.preview === '1') &&
        !isAuthorizedAdmin(req)
      )
        throw createError(401, 'UNAUTHORIZED', '请先登录后台');
      if (isAdminRequest(req) && !canAdmin(req.admin, 'cms:read'))
        throw createError(403, 'FORBIDDEN', '当前账号没有 CMS 查看权限');
      const category =
        route === 'support-faqs' && typeof req.query.category === 'string'
          ? req.query.category.trim()
          : '';
      const status = cleanQueryValue(req.query.status);
      const search = cleanQueryValue(req.query.search);
      const { page, pageSize, skip, take } = normalizePagination(
        req,
        isAdminRequest(req) ? 20 : 50,
      );
      const where = mergeWhere(
        isAdminRequest(req) ? {} : publicStatusWhere,
        category && category !== 'all' ? { category } : {},
        ['supportFaq', 'supportDownload', 'quickGuide'].includes(model) &&
          req.query.productId
          ? {
              OR: [
                { productIds: { equals: null } },
                { productIds: '' },
                { productIds: '[]' },
                { productIds: { contains: `[${toId(req.query.productId)}]` } },
                {
                  productIds: { startsWith: `[${toId(req.query.productId)},` },
                },
                { productIds: { contains: `,${toId(req.query.productId)},` } },
                { productIds: { endsWith: `,${toId(req.query.productId)}]` } },
              ],
            }
          : {},
        ['supportFaq', 'supportDownload', 'quickGuide'].includes(model) &&
          req.query.series
          ? {
              OR: [
                { series: null },
                { series: '' },
                { series: String(req.query.series) },
              ],
            }
          : {},
        isAdminRequest(req) ? statusFilterWhere(status) : {},
        search
          ? {
              OR: (cmsSearchFields[model] || []).map((field) => ({
                [field]: { contains: search },
              })),
            }
          : {},
        model === 'pageContent' && cleanQueryValue(req.query.slug)
          ? { slug: cleanQueryValue(req.query.slug) }
          : {},
      );
      const args = {
        ...(Object.keys(where).length ? { where } : {}),
        ...(noSort ? {} : { orderBy: { sortOrder: 'asc' } }),
        skip,
        take,
      };
      const [total, data] = await Promise.all([
        prisma[model].count({ where }),
        prisma[model].findMany(args),
      ]);
      res.json(paginatedPayload(data, total, page, pageSize));
    }),
  );
  if (noSort) {
    app.get(
      `/api/${route}/:slug`,
      asyncHandler(async (req, res) => {
        if (
          (req.query.admin === '1' || req.query.preview === '1') &&
          !isAuthorizedAdmin(req)
        )
          throw createError(401, 'UNAUTHORIZED', '请先登录后台');
        if (isAdminRequest(req) && !canAdmin(req.admin, 'cms:read'))
          throw createError(403, 'FORBIDDEN', '没有栏目查看权限');
        const data = await prisma[model].findUnique({
          where: { slug: req.params.slug },
        });
        if (
          !data ||
          (!isAdminRequest(req) &&
            !['published', 'active'].includes(data.status))
        )
          return res.json({ data: null });
        res.json({ data });
      }),
    );
  }
  app.get(
    `/api/${route}/:id/versions`,
    requireAdmin,
    requirePermission('cms:read'),
    asyncHandler(async (req, res) => {
      const id = toId(req.params.id);
      res.json(await contentHistory(prisma, model, id, req.query));
    }),
  );
  app.post(
    `/api/${route}/:id/restore/:versionId`,
    requireAdmin,
    requirePermission('cms:write'),
    writeHandler(async (req, res) => {
      const id = toId(req.params.id);
      const versionId = toId(req.params.versionId);
      const version = await prisma.contentVersion.findUnique({
        where: { id: versionId },
      });
      if (!version || version.module !== model || version.recordId !== id)
        throw createError(404, 'NOT_FOUND', '版本不存在');
      const before = await prisma[model].findUnique({ where: { id } });
      const snapshot = parseSnapshot(version.snapshot);
      delete snapshot.id;
      delete snapshot.updatedAt;
      delete snapshot.createdAt;
      const updated = await prisma[model].update({
        where: { id },
        data: validateCmsPayload(model, await reconcileCatalogSnapshot(prisma, snapshot, before)),
      });
      await saveContentVersion(req, model, before);
      await auditOperation(req, {
        action: 'RESTORE',
        module: 'cms',
        target: route,
        targetId: id,
        summary: `恢复 CMS 版本 ${versionId}`,
        beforeData: before,
        afterData: updated,
      });
      res.json(updated);
    }),
  );
  app.post(
    `/api/${route}`,
    requireAdmin,
    requirePermission('cms:write'),
    writeHandler(async (req, res) => {
      const created = await prisma[model].create({
        data: validateCmsPayload(model, req.body),
      });
      await saveContentVersion(req, model, created);
      await auditOperation(req, {
        action: 'CREATE',
        module: 'cms',
        target: route,
        targetId: created.id,
        summary: '创建 CMS 内容',
        afterData: created,
      });
      res.status(201).json(created);
    }),
  );
  app.put(
    `/api/${route}/:id`,
    requireAdmin,
    requirePermission('cms:write'),
    writeHandler(async (req, res) => {
      const id = toId(req.params.id);
      const before = await prisma[model].findUnique({ where: { id } });
      if (!before) throw createError(404, 'NOT_FOUND', 'CMS 内容不存在');
      const versionWhere = recordVersionWhere(req, before);
      await saveContentVersion(req, model, before);
      const updated = await updateWithVersion(
        prisma[model],
        versionWhere,
        validateCmsPayload(model, { ...before, ...req.body }),
      );
      await auditOperation(req, {
        action: 'UPDATE',
        module: 'cms',
        target: route,
        targetId: id,
        summary: '更新 CMS 内容',
        beforeData: before,
        afterData: updated,
      });
      res.json(updated);
    }),
  );
  app.delete(
    `/api/${route}/:id`,
    requireAdmin,
    requirePermission('cms:write'),
    writeHandler(async (req, res) => {
      const id = toId(req.params.id);
      const before = await prisma[model].findUnique({ where: { id } });
      if (!before) throw createError(404, 'NOT_FOUND', 'CMS 内容不存在');
      await saveContentVersion(req, model, before);
      await workflows.archive(req, model, before);
      await prisma[model].delete({ where: { id } });
      await auditOperation(req, {
        action: 'DELETE',
        module: 'cms',
        target: route,
        targetId: id,
        summary: '删除 CMS 内容',
        beforeData: before,
      });
      res.json({ success: true });
    }),
  );
});

app.use('/api', (req, res) => {
  res
    .status(404)
    .json({
      success: false,
      error: { code: 'API_NOT_FOUND', message: '接口不存在' },
    });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || '服务器处理失败';

  if (err instanceof multer.MulterError) {
    status = 400;
    code = err.code || 'UPLOAD_ERROR';
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? '上传文件不能超过 20MB'
        : '上传文件不符合要求';
  } else if (err.code === 'P2025') {
    status = 404;
    code = 'NOT_FOUND';
    message = '要操作的数据不存在';
  } else if (['P2034', 'P2028', 'P1008'].includes(err.code)) {
    status = 409;
    code = 'CONCURRENT_CHANGE';
    message = '数据正在被其他操作更新，请刷新后重试';
  } else if (err.name === 'PrismaClientValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = '字段格式不正确，请检查表单';
  } else if (err.code === 'P2002') {
    status = 409;
    code = 'CONFLICT';
    message = '存在重复的唯一字段，请检查 URL 后缀等内容';
  } else if (status >= 500) {
    console.error(err);
    message = '服务器处理失败';
  }

  if (req.apiStartedAt) {
    recordApiLog(req, res, req.apiStartedAt, { ...err, status, code, message });
  }

  return res.status(status).json({ success: false, error: { code, message } });
});

const PORT = Number.parseInt(process.env.PORT || '', 10) || 1337;
function startBackgroundTasks() {
  const backups = createBackupScheduler(prisma, {source:resolveSqliteDatabaseFile(), uploadsRoot:uploadDir, backupRoot:path.resolve(process.env.DATABASE_BACKUP_DIR || path.join(__dirname,'backups')),isPaused:deploymentPaused});
  const backupTick = () => backups.run().catch(e=>console.warn('Scheduled backup:',e.code || 'BACKUP_FAILED'));
  const backupTimer = setInterval(backupTick,3600000); backupTimer.unref();
  backupTick();
  const maintenanceTimer = setInterval(
    () =>
      !deploymentPaused() &&
      runMaintenance(
        prisma,
        path.resolve(
          process.env.DATABASE_BACKUP_DIR || path.join(__dirname, 'backups'),
        ),
      ).catch((e) => console.warn('Maintenance:', e.code || e.message)),
    3600000,
  );
  maintenanceTimer.unref();
  if (!deploymentPaused())
    runMaintenance(
      prisma,
      path.resolve(
        process.env.DATABASE_BACKUP_DIR || path.join(__dirname, 'backups'),
      ),
    ).catch((e) => console.warn('Maintenance:', e.code || e.message));
  const deliveryTimer = setInterval(
    () =>
      !deploymentPaused() &&
      notificationWorker
        .run()
        .catch((error) =>
          console.warn('Notification worker:', error.code || error.message),
        ),
    30000,
  );
  deliveryTimer.unref();
}
if (require.main === module)
  initializeAuditIntegrity(database)
    .then(() => initializeCatalog(database))
    .then(() => {
      startBackgroundTasks();
      app.listen(PORT, HOST, () =>
        console.log(`🚀 Backend running on http://${HOST}:${PORT}`),
      );
    })
    .catch((error) => {
      console.error('Startup failed:', error.code || error.message);
      process.exitCode = 1;
    });
module.exports = {
  app,
  database,
  prisma,
  createAdminToken,
  hashPassword,
  totpCode,
};
