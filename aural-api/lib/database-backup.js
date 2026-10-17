const path = require('node:path');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const { PrismaClient, Prisma } = require('@prisma/client');
const { verifyAuditSnapshot, snapshotFileIdentity, waitForSnapshotClose } = require('./audit-integrity');
const CHECKPOINT_FIELDS = ['version', 'baselineCount', 'baselineMaxId', 'entryCount', 'logCount', 'headHash', 'sealedAt'];
const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
async function regularFile(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular file; symbolic links are not supported');
  return stat;
}

function resolveDatabaseFile(
  url = process.env.DATABASE_URL,
  apiRoot = path.resolve(__dirname, '..'),
) {
  if (!url?.startsWith('file:'))
    throw new Error('DATABASE_URL must reference a SQLite file');
  const raw = decodeURIComponent(url.slice(5).split('?')[0]);
  if (!raw || raw === ':memory:')
    throw new Error('A persistent database file is required');
  return path.isAbsolute(raw) ? raw : path.resolve(apiRoot, 'prisma', raw);
}
async function verifyDatabase(file, { requireCurrentSchema = true } = {}) {
  const stat = await regularFile(file);
  if (!stat.isFile() || stat.size === 0)
    throw new Error('Database is empty or missing');
  const db = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    const checks = await db.$queryRawUnsafe('PRAGMA integrity_check');
    if (checks.some((row) => Object.values(row)[0] !== 'ok'))
      throw new Error('SQLite integrity check failed');
    const fk = await db.$queryRawUnsafe('PRAGMA foreign_key_check');
    if (fk.length) throw new Error('Foreign key integrity check failed');
    const tables = await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const names = new Set(tables.map((x) => x.name));
    const result = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      if (!names.has(model.dbName || model.name)) {
        if (requireCurrentSchema)
          throw new Error(`Missing table: ${model.name}`);
        continue;
      }
      const name = model.dbName || model.name;
      const columns = await db.$queryRawUnsafe(`PRAGMA table_info("${name}")`);
      const present = new Set(columns.map((x) => x.name));
      if (requireCurrentSchema)
        for (const field of model.fields.filter((f) => f.kind === 'scalar')) {
          if (!present.has(field.dbName || field.name))
            throw new Error(`Missing field: ${name}.${field.name}`);
        }
    }
    if (
      !names.has('Product') ||
      !names.has('Inquiry') ||
      !names.has('AdminUser')
    )
      throw new Error('Missing core business tables');
    for (const name of [...names].sort()) {
      const rows = await db.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${name.replace(/"/g, '""')}"`);
      result.push({ name, count: Number(rows[0].count), status: 'ok' });
    }
    return result;
  } finally {
    await db.$disconnect();
  }
}
// verifyDatabase also checks live databases. Keep its behavior unchanged and
// apply the disconnect barrier only to our private, standalone snapshots.
async function verifySnapshotDatabase(file, options) {
  const identity = await snapshotFileIdentity(file);
  try { return await verifyDatabase(file, options); }
  finally { await waitForSnapshotClose(file, identity); }
}

async function hashFile(file) {
  await regularFile(file);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function assetManifest(root, prefix = '') {
  const directory = await fs.lstat(path.join(root, prefix));
  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new Error('Asset directory must not be a symbolic link');
  const rows = [];
  for (const entry of await fs.readdir(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const name = path.join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Symbolic links are not supported in upload backups');
    if (entry.isDirectory()) rows.push(...(await assetManifest(root, name)));
    else if (entry.isFile())
      rows.push({
        path: name.split(path.sep).join('/'),
        bytes: (await fs.stat(path.join(root, name))).size,
        sha256: await hashFile(path.join(root, name)),
      });
    else throw new Error('Unsupported asset file type');
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
async function auditSnapshot(file, { requireCurrentSchema = true } = {}) {
  const identity = await snapshotFileIdentity(file);
  const db = new PrismaClient({ datasourceUrl: `file:${file}` });
  let names;
  try {
    const rows = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table'");
    names = new Set(rows.map((row) => row.name));
  } finally { await db.$disconnect(); await waitForSnapshotClose(file, identity); }
  const hasState = names.has('AuditIntegrityState'), hasEntries = names.has('AuditLogEntry');
  if (!hasState && !hasEntries) {
    if (requireCurrentSchema) throw new Error('Audit schema is missing');
    return { status: 'legacy', reason: 'missing-audit-schema' };
  }
  if (!hasState || !hasEntries || !names.has('OperationLog'))
    throw new Error('Incomplete audit schema');
  const checked = await verifyAuditSnapshot(file);
  return { status: 'verified', ...Object.fromEntries(CHECKPOINT_FIELDS.map((key) => [key, checked[key]])) };
}
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      !isHash(manifest.sha256) || typeof manifest.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('Invalid backup manifest');
  if (manifest.schemaVersion !== undefined && manifest.schemaVersion !== 2)
    throw new Error('Unsupported backup manifest version');
  if ((manifest.schemaVersion === 2 || manifest.databaseBytes !== undefined) &&
      (!isCount(manifest.databaseBytes) || manifest.databaseBytes === 0))
    throw new Error('Invalid database size in manifest');
  if (!Array.isArray(manifest.tables)) throw new Error('Invalid manifest tables');
  const tables = new Set();
  for (const row of manifest.tables) {
    if (!row || typeof row.name !== 'string' || !row.name || !isCount(row.count) || tables.has(row.name))
      throw new Error('Invalid or duplicate table in manifest');
    tables.add(row.name);
  }
  if (manifest.assets != null && !Array.isArray(manifest.assets)) throw new Error('Invalid manifest assets');
  const assets = new Set();
  for (const item of manifest.assets || []) {
    if (!item || typeof item.path !== 'string' || !item.path || item.path.includes('\\') ||
        item.path.includes('\0') || path.posix.isAbsolute(item.path) ||
        item.path.split('/').some((part) => !part || part === '.' || part === '..') ||
        /^[a-z]:/i.test(item.path) || !isCount(item.bytes) || !isHash(item.sha256) || assets.has(item.path))
      throw new Error('Invalid or duplicate asset in manifest');
    assets.add(item.path);
  }
  if (manifest.assetOrigins !== undefined && (!Array.isArray(manifest.assetOrigins) ||
      manifest.assetOrigins.some((value) => {
        try { return typeof value !== 'string' || !/^https?:\/\//.test(value) || new URL(value).origin !== value; }
        catch { return true; }
      })))
    throw new Error('Invalid asset origins in manifest');
  if (manifest.schemaVersion === 2 && !manifest.audit) throw new Error('Missing audit checkpoint');
}
async function verifyAssetReferences(file, assets, assetOrigins) {
  const identity = await snapshotFileIdentity(file);
  const { extractLocalUploadUrls } = require('./resource-references');
  const names = new Set(
    assets.map((item) => '/uploads/' + item.path.split(path.sep).join('/')),
  );
  const client = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    const existing = new Set(
      (
        await client.$queryRawUnsafe(
          "SELECT name FROM sqlite_master WHERE type='table'",
        )
      ).map((row) => row.name),
    );
    for (const model of [
      'MediaAsset',
      'Product',
      'Article',
      'Artist',
      'SystemConfig',
      'SupportDownload',
      'SupportFaq',
      'AudioSolution',
      'BrandTimeline',
      'EcosystemService',
      'QuickGuide',
      'PageContent',
      'ContentDraft',
      'ContentVersion',
      'RecycleEntry',
    ]) {
      if (!existing.has(model)) continue;
      // These content tables all have an integer primary key. A restored file
      // is immutable here; keyset pages bound retained payloads even when
      // version/recycle history grows. Do not assume IDs start at one or have
      // no gaps, and keep scanning after a page contains no upload references.
      let lastId;
      while (true) {
        const rows = lastId === undefined
          ? await client.$queryRawUnsafe(`SELECT * FROM "${model}" ORDER BY "id" LIMIT 500`)
          : await client.$queryRawUnsafe(`SELECT * FROM "${model}" WHERE "id" > ? ORDER BY "id" LIMIT 500`, lastId);
        if (!rows.length) break;
        for (const url of extractLocalUploadUrls(rows, assetOrigins))
          if (!names.has(url))
            throw new Error(`Backup references missing upload: ${url}`);
        lastId = rows.at(-1).id;
      }
    }
  } finally {
    await client.$disconnect();
    await waitForSnapshotClose(file, identity);
  }
}
async function verifyBackupBundle(file, options = {}) {
  const stat = await regularFile(file);
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { await fs.lstat(file + suffix); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error('Standalone backup must not contain SQLite sidecar files');
  }
  await regularFile(file + '.manifest.json');
  const manifest = JSON.parse(
    await fs.readFile(file + '.manifest.json', 'utf8'),
  );
  validateManifest(manifest);
  if (manifest.databaseBytes !== undefined && manifest.databaseBytes !== stat.size)
    throw new Error('Database size mismatch');
  if (manifest.sha256 !== (await hashFile(file)))
    throw new Error('Database checksum mismatch');
  const tables = await verifySnapshotDatabase(file, options);
  const actualTables = new Map(tables.map((row) => [row.name, row.count]));
  if (manifest.tables.some((row) => actualTables.get(row.name) !== row.count) ||
      (manifest.schemaVersion === 2 && manifest.tables.length !== tables.length))
    throw new Error('Database table counts mismatch');
  const audit = await auditSnapshot(file, options);
  if (manifest.audit) {
    if (manifest.audit.status !== audit.status || (audit.status === 'verified' &&
        CHECKPOINT_FIELDS.some((key) => manifest.audit[key] !== audit[key])))
      throw new Error('Audit checkpoint mismatch');
  } else audit.metadata = 'legacy';
  const includesAssets = Array.isArray(manifest.assets);
  if (options.requireAssets && !includesAssets) throw new Error('Complete backup requires an asset manifest and directory');
  if (includesAssets) {
    const actual = await assetManifest(file + '.assets');
    const byPath = new Map(actual.map((row) => [row.path, row]));
    if (actual.length !== manifest.assets.length) throw new Error('Asset set mismatch');
    for (const item of manifest.assets) {
      const row = byPath.get(item.path);
      if (!row || row.bytes !== item.bytes || row.sha256 !== item.sha256)
        throw new Error('Asset checksum or size mismatch');
    }
    await verifyAssetReferences(file, manifest.assets, manifest.assetOrigins);
  }
  return { tables, assetCount: manifest.assets?.length || 0, includesAssets, audit,
    snapshotAt: manifest.createdAt, databaseSha256: manifest.sha256,
    manifestSha256: await hashFile(file + '.manifest.json') };
}
async function createDatabaseBackup(source, destination, options = {}) {
  await regularFile(source);
  if (options.requireAssets && !options.uploadsRoot) throw new Error('Complete backup requires uploadsRoot');
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(
    path.join(path.dirname(destination), '.backup-'),
  );
  const temporary = path.join(staging, 'database.db');
  const lock = await fs
    .open(destination + '.lock', 'wx')
    .catch(async (error) => {
      await fs.rm(staging, { recursive: true, force: true });
      throw error;
    });
  const db = new PrismaClient({ datasourceUrl: `file:${source}` });
  let published = false,
    assetsPublished = false,
    manifestPublished = false;
  try {
    try {
      for (const target of [destination, destination + '.manifest.json', destination + '.assets']) {
        try { await fs.lstat(target); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        throw new Error('Backup destination already exists');
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    await db.$executeRawUnsafe('VACUUM INTO ?', temporary);
    await fs.chmod(temporary, 0o600);
    const tables = await verifySnapshotDatabase(temporary, options);
    const audit = await auditSnapshot(temporary, options);
    let assets = null;
    if (options.uploadsRoot) {
      await fs.cp(options.uploadsRoot, temporary + '.assets', {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      assets = await assetManifest(temporary + '.assets');
      await verifyAssetReferences(temporary, assets, options.assetOrigins);
    }
    const manifest = {
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      databaseBytes: (await fs.stat(temporary)).size,
      sha256: await hashFile(temporary),
      audit,
      tables,
      assets,
      assetOrigins: options.assetOrigins || require('./resource-references').localAssetOrigins(),
    };
    await fs.writeFile(temporary + '.manifest.json', JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
    await verifyBackupBundle(temporary, options);
    if (assets) {
      await fs.rename(temporary + '.assets', destination + '.assets');
      assetsPublished = true;
    }
    await fs.writeFile(
      destination + '.manifest.json',
      JSON.stringify(manifest, null, 2),
      { mode: 0o600, flag: 'wx' },
    );
    manifestPublished = true;
    await fs.link(temporary, destination);
    published = true;
    return {
      size: (await fs.stat(destination)).size,
      tables,
      assetCount: assets?.length || 0,
      audit,
    };
  } catch (error) {
    if (!published) {
      if (manifestPublished)
        await fs.rm(destination + '.manifest.json', { force: true });
      if (assetsPublished)
        await fs.rm(destination + '.assets', { recursive: true, force: true });
    }
    throw error;
  } finally {
    await db.$disconnect();
    await lock.close();
    await fs.rm(destination + '.lock', { force: true });
    await fs.rm(staging, { recursive: true, force: true });
  }
}
async function pruneBackups(root, days = 14) {
  if (!Number.isFinite(days) || days < 1)
    throw new Error('Backup retention days must be at least 1');
  await fs.mkdir(root, { recursive: true });
  const cutoff = Date.now() - days * 86400000;
  const files=[];
  for (const entry of await fs.readdir(root,{withFileTypes:true})) {
    if (!entry.isFile() || !/^(prod\.predeploy|database\.(manual|scheduled))\..+\.db$/.test(entry.name)) continue;
    const file=path.join(root,entry.name); files.push({file,mtime:(await fs.stat(file)).mtimeMs});
  }
  files.sort((a,b)=>b.mtime-a.mtime);
  const retained=new Set();
  for (const {file} of files) {
    try {
      const checked=await verifyBackupBundle(file,{requireCurrentSchema:false,requireAssets:true});
      if(checked.audit.status==='verified') retained.add(file);
    } catch { /* Invalid bundles cannot replace a recovery point. */ }
    if(retained.size===2) break;
  }
  // Legacy backups cannot replace an audit-verifiable point. Without two
  // verified recovery points, fail conservatively and retain all.
  if(retained.size<2) return;
  for(const {file,mtime} of files) if(mtime<cutoff && !retained.has(file)) {
    await fs.rm(file);
    await fs.rm(file+'.manifest.json',{force:true});
    await fs.rm(file+'.assets',{recursive:true,force:true});
  }
}
module.exports = {
  resolveDatabaseFile,
  verifyDatabase,
  createDatabaseBackup,
  pruneBackups,
  verifyBackupBundle,
};
