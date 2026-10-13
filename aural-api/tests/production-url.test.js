const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const apiRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.resolve(apiRoot, '../logs/step14-20261013');

function runEntry(entry, overrides = {}, origins = []) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(evidenceRoot, 'production-url-'));
  const database = path.join(directory, 'unopened.db');
  try {
    const result = spawnSync(process.execPath, ['-e', `
      require('./scripts/load-env').loadEnvFile = () => {};
      require('node:net').Server.prototype.listen = () => { throw new Error('TEST_FORBIDS_LISTEN'); };
      global.setInterval = () => { throw new Error('TEST_FORBIDS_BACKGROUND'); };
      (async () => {
        if (process.env.TEST_ENTRY === 'preflight') require('./scripts/preflight');
        else {
          const api = require('./server');
          const cors = api.app.router.stack.find(layer => layer.handle.name === 'corsMiddleware').handle;
          for (const origin of JSON.parse(process.env.TEST_ORIGINS)) {
            const headers = {};
            await new Promise((resolve, reject) => cors({ method: 'GET', headers: { origin } }, {
              setHeader(name, value) { headers[name] = value; },
              getHeader(name) { return headers[name]; },
            }, error => error ? reject(error) : resolve()));
            require('node:assert/strict').equal(headers['Access-Control-Allow-Origin'], origin);
          }
          await api.database.$disconnect();
        }
        console.log('ENTRY_ACCEPTED');
      })().catch(error => { console.error(error.message); process.exitCode = 1; });
    `], {
      cwd: apiRoot,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        TOKIO_WORKER_THREADS: '2',
        DATABASE_URL: `file:${database}`,
        UPLOAD_DIR: path.join(directory, 'uploads'),
        DATABASE_BACKUP_DIR: path.join(directory, 'backups'),
        ADMIN_USERNAME: 'url_acceptance',
        ADMIN_PASSWORD: 'LocalUrlAcceptance9!',
        ADMIN_TOKEN_SECRET: '1f38a9ab506cbb795a7d53e73188fd6302cda4cb',
        PUBLIC_SITE_URL: 'https://site.hushi.test',
        PUBLIC_ADMIN_URL: 'https://admin.hushi.test',
        API_PUBLIC_URL: 'https://api.hushi.test',
        UPLOAD_PUBLIC_BASE: 'https://assets.hushi.test/uploads',
        ALLOWED_ORIGINS: 'https://site.hushi.test,https://admin.hushi.test',
        ...overrides,
        TEST_ENTRY: entry,
        TEST_ORIGINS: JSON.stringify(origins),
      },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null, result.stderr);
    assert.equal(fs.existsSync(database), false, 'entry validation must not open or create the database');
    assert.doesNotMatch(result.stderr, /TEST_FORBIDS_/);
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('production URL parser accepts canonical HTTPS domains, public IPs and upload subpaths', () => {
  const { parseProductionUrl, isProductionUrl } = require('../lib/production-url');
  for (const value of [
    'https://site.hushi.test', 'https://site.hushi.test:8443',
    'https://8.8.8.8', 'https://[2606:4700:4700::1111]',
    'https://localhost.hushi.test', 'https://127.hushi.test', 'https://cdn.hushi.test/uploads/乐器/',
    'https://cdn.hushi.test/uploads?version=2#download',
  ]) assert.equal(isProductionUrl(value), true, value);
  assert.equal(parseProductionUrl('HTTPS://SITE.HUSHI.TEST:443').href, 'https://site.hushi.test/');
  assert.equal(parseProductionUrl('https://乐器.test').hostname, 'xn--fjq20r.test');
  for (const value of ['https://site.hushi.test', 'https://site.hushi.test/', 'HTTPS://SITE.HUSHI.TEST:443'])
    assert.equal(parseProductionUrl(value, { originOnly: true }).origin, 'https://site.hushi.test');
});

test('production URL parser rejects malformed authority, credentials, insecure protocols and loopback aliases', () => {
  const { isProductionUrl } = require('../lib/production-url');
  for (const value of [
    undefined, '', 'https://', 'https:///hushi.test', 'https:site.hushi.test',
    '//site.hushi.test', 'http://site.hushi.test', 'javascript:alert(1)',
    'https://name:secret@site.hushi.test', 'https://@site.hushi.test',
    'https://site.hushi.test:bad', 'https://[broken]',
    'https://site.hushi.test\\path', 'https://site.\nhushi.test',
    'https://site.hushi.test\t',
    'https://localhost', 'https://LOCALHOST.', 'https://sub.localhost',
    'https://localhost:443', 'https://127.0.0.1', 'https://127.1',
    'https://127.255.255.254', 'https://2130706433', 'https://0177.0.0.1',
    'https://0x7f000001', 'https://[::1]', 'https://[0:0:0:0:0:0:0:1]',
    'https://[::ffff:127.0.0.1]', 'https://[::ffff:7f7f:ffff]',
  ]) assert.equal(isProductionUrl(value), false, String(value));
});

test('CORS origins reject paths, queries and fragments before normalization', () => {
  const { parseProductionUrl } = require('../lib/production-url');
  for (const suffix of ['/path', '//', '/./', '/a/..', '?a=1', '?', '#part', '#', '/?#'])
    assert.equal(parseProductionUrl(`https://site.hushi.test${suffix}`, { originOnly: true }), null, suffix);
});

for (const entry of ['preflight', 'server']) {
  test(`production entry rejects invalid URLs independently: ${entry}`, async (t) => {
    const cases = [
      ['PUBLIC_SITE_URL', 'https://'],
      ['PUBLIC_ADMIN_URL', 'https://127.1'],
      ['API_PUBLIC_URL', 'https://[::1]'],
      ['UPLOAD_PUBLIC_BASE', 'https://user:private-token@assets.hushi.test/uploads'],
      ['ALLOWED_ORIGINS', 'https://site.hushi.test,https://2130706433'],
      ['ALLOWED_ORIGINS', 'https://user:private-token@site.hushi.test'],
      ['ALLOWED_ORIGINS', 'https://site.hushi.test/path'],
      ['ALLOWED_ORIGINS', 'https://site.hushi.test//'],
      ['ALLOWED_ORIGINS', 'https://site.hushi.test?'],
      ['ALLOWED_ORIGINS', 'https://site.hushi.test#fragment'],
    ];
    for (const [key, value] of cases) {
      await t.test(`${key}: ${value}`, () => {
        const result = runEntry(entry, { [key]: value });
        assert.equal(result.status, 1, `${entry} unexpectedly accepted ${key}: ${value}\n${result.stdout}${result.stderr}`);
        assert.doesNotMatch(result.stdout, /ENTRY_ACCEPTED/);
        assert.doesNotMatch(result.stderr, /private-token/);
        assert.match(result.stderr, entry === 'preflight' ? /Preflight failed:/ : /生产环境必须配置/);
      });
    }
  });

  test(`production entry preserves legal HTTPS configuration: ${entry}`, () => {
    const result = runEntry(entry, {
      PUBLIC_SITE_URL: 'HTTPS://SITE.HUSHI.TEST:443/catalog',
      PUBLIC_ADMIN_URL: 'https://admin.hushi.test/',
      API_PUBLIC_URL: 'https://8.8.8.8:443',
      UPLOAD_PUBLIC_BASE: 'https://[2606:4700:4700::1111]/uploads/instruments',
      ALLOWED_ORIGINS: 'HTTPS://SHOP.HUSHI.TEST:443/,https://admin.hushi.test/',
    }, ['https://site.hushi.test', 'https://shop.hushi.test', 'https://admin.hushi.test']);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /ENTRY_ACCEPTED/);
  });
}

test('direct server preserves the CORS_ORIGINS alias and validates its origins', () => {
  const allowed = runEntry('server', { ALLOWED_ORIGINS: '', CORS_ORIGINS: 'HTTPS://SHOP.HUSHI.TEST:443/' }, ['https://shop.hushi.test']);
  assert.equal(allowed.status, 0, allowed.stderr);
  const denied = runEntry('server', { ALLOWED_ORIGINS: '', CORS_ORIGINS: 'https://[::ffff:127.0.0.1]' });
  assert.equal(denied.status, 1, denied.stderr);
  assert.match(denied.stderr, /生产环境必须配置/);
});
