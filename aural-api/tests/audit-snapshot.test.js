const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { initializeAuditIntegrity, appendOperationLog, verifyAuditSnapshot } = require('../lib/audit-integrity');
const { verifyLiveAuditSnapshot } = require('../lib/audit-snapshot');
const { runSqliteTransaction, runSqliteExclusive, whenSqliteIdle } = require('../lib/sqlite-transaction');

const fixtureRoot = path.resolve(__dirname, '../../logs/step13-20261013/audit-fixtures');
fs.mkdirSync(fixtureRoot, { recursive: true });
const temporary = fs.mkdtempSync(path.join(fixtureRoot, 'run-'));
const template = path.join(temporary, 'template.db');
const migrations = path.resolve(__dirname, '../prisma/migrations');
const auditMigration = '20261012170000_audit_integrity_and_inquiry_scope';
const baselineCount = 1001, entryCount = 1001;
let sequence = 0;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const logData = (summary = '合成快照审计') => ({ action: 'UPDATE', module: 'fixture', summary });
const sql = (file, input) => {
  const result = spawnSync('sqlite3', [file], { input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
function fixture(t) {
  const directory = path.join(temporary, `fixture-${++sequence}`);
  fs.mkdirSync(directory);
  const file = path.join(directory, 'database.db');
  fs.copyFileSync(template, file);
  const db = new PrismaClient({ datasourceUrl: `file:${file}` });
  t.after(() => db.$disconnect());
  return { directory, file, db };
}
before(async () => {
  const names = fs.readdirSync(migrations).filter((name) => fs.statSync(path.join(migrations, name)).isDirectory()).sort();
  const statements = names.flatMap((name) => [
    ...(name === auditMigration ? [`WITH RECURSIVE rows(id) AS (SELECT 1 UNION ALL SELECT id+1 FROM rows WHERE id<${baselineCount})
      INSERT INTO OperationLog(id,action,module,summary) SELECT id,'UPDATE','fixture','合成接手历史 '||id FROM rows;`] : []),
    fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8'),
  ]).join('\n');
  sql(template, statements);
  const db = new PrismaClient({ datasourceUrl: `file:${template}` });
  try {
    await initializeAuditIntegrity(db);
    await runSqliteTransaction(db, async (tx) => {
      for (let n = 0; n < entryCount; n++) await appendOperationLog(tx, logData(`合成链记录 ${n}`));
    }, { maxWait: 10000, timeout: 30000 });
  } finally { await db.$disconnect(); }
});
after(() => fs.rmSync(temporary, { recursive: true, force: true }));

test('private snapshot verifies multiple baseline/chain pages without mutating database or making sidecars', async (t) => {
  const { directory, file } = fixture(t);
  const before = hash(file);
  const result = await verifyAuditSnapshot(file);
  assert.equal(result.ok, true);
  assert.equal(result.baselineCount, baselineCount);
  assert.equal(result.entryCount, entryCount);
  assert.equal(result.logCount, baselineCount + entryCount);
  assert.equal(hash(file), before);
  assert.deepEqual(fs.readdirSync(directory), ['database.db']);
});

test('private snapshot scanning does not enter the live database transaction FIFO', async (t) => {
  const { file, db } = fixture(t);
  const entered = deferred(), release = deferred();
  const held = runSqliteTransaction(db, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  // A regression to the shared FIFO must fail this test rather than deadlock it.
  let timer;
  try {
    const result = await Promise.race([
      verifyAuditSnapshot(template),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('snapshot waited for live FIFO')), 3000); }),
    ]);
    assert.equal(result.logCount, baselineCount + entryCount);
    assert.equal(hash(file), hash(template));
  } finally {
    clearTimeout(timer);
    release.resolve();
    await held;
  }
});

test('snapshot client is query-only and accidental writes fail without changing the seal', async (t) => {
  const { file } = fixture(t);
  const before = hash(file);
  let checked = false;
  // Observe the actual private client rather than assert a source string. The
  // attempted write runs after query_only and before the first baseline page.
  t.mock.method(require('@prisma/client'), 'PrismaClient', function (options) {
    assert.match(options.datasourceUrl, /connection_limit=1$/);
    const client = new PrismaClient(options);
    return client.$extends({ query: { operationLog: { async findMany({ args, query }) {
      if (!checked) {
        const [mode] = await client.$queryRawUnsafe('PRAGMA query_only');
        assert.equal(Number(mode.query_only), 1);
        await assert.rejects(client.operationLog.create({ data: logData('must not write') }), /readonly/i);
        checked = true;
      }
      return query(args);
    } } } });
  });
  assert.equal((await verifyAuditSnapshot(file)).ok, true);
  assert.equal(checked, true);
  assert.equal(hash(file), before);
});

test('snapshot fingerprint rejects a same-size mutation before the final read', async (t) => {
  const { file } = fixture(t);
  const originalStream = fs.createReadStream;
  const before = hash(file);
  let reads = 0;
  t.mock.method(fs, 'createReadStream', function (name, ...args) {
    if (name === file && ++reads === 2) {
      // Mutate after the final identity stat, so neither size nor mtime can be
      // responsible for the rejection: the streamed digest must detect it.
      const bytes = fs.readFileSync(file);
      const offset = bytes.indexOf(Buffer.from('合成链记录 501'));
      assert.ok(offset >= 0);
      Buffer.from('合成链记录 502').copy(bytes, offset);
      fs.writeFileSync(file, bytes);
    }
    return originalStream.call(this, name, ...args);
  });
  await assert.rejects(verifyAuditSnapshot(file), { code: 'AUDIT_INTEGRITY_FAILED' });
  assert.equal(reads, 2);
  assert.notEqual(hash(file), before);
});

test('private snapshot waits for its closing reader sidecars but never deletes persistent sidecars', async (t) => {
  for (const scenario of ['delayed close', 'persistent sidecar', 'replaced while closing']) await t.test(scenario, async (subtest) => {
    const clears = scenario !== 'persistent sidecar';
    const replaces = scenario === 'replaced while closing';
    const { file } = fixture(subtest);
    const before = hash(file);
    let timer;
    subtest.mock.method(require('@prisma/client'), 'PrismaClient', function (options) {
      const client = new PrismaClient(options);
      const disconnect = client.$disconnect.bind(client);
      client.$disconnect = async () => {
        await disconnect();
        fs.writeFileSync(file + '-shm', 'reader close in progress');
        if (clears) timer = setTimeout(() => {
          if (replaces) { fs.copyFileSync(file, file + '.swap'); fs.renameSync(file + '.swap', file); }
          fs.unlinkSync(file + '-shm');
        }, 100);
      };
      return client;
    });
    try {
      if (clears && !replaces) assert.equal((await verifyAuditSnapshot(file)).ok, true);
      else {
        await assert.rejects(verifyAuditSnapshot(file), { code: 'AUDIT_INTEGRITY_FAILED' });
        if (!clears) assert.equal(fs.readFileSync(file + '-shm', 'utf8'), 'reader close in progress');
      }
      assert.equal(hash(file), before);
    } finally { clearTimeout(timer); fs.rmSync(file + '-shm', { force: true }); }
  });
});

test('snapshot rejects changed baseline, chain interior, missing entries and unsigned append across page boundaries', async (t) => {
  const cases = [
    ['baseline', 'OperationLog_no_update', 'UPDATE OperationLog SET summary=\'tampered\' WHERE id=501;'],
    ['chain', 'OperationLog_no_update', `UPDATE OperationLog SET summary='tampered' WHERE id=${baselineCount + 501};`],
    ['missing-chain-entry', 'AuditLogEntry_no_delete', 'DELETE FROM AuditLogEntry WHERE sequence=501;'],
    ['unsigned', null, "INSERT INTO OperationLog(action,module,summary) VALUES('UPDATE','fixture','unsigned');"],
  ];
  for (const [name, guard, mutation] of cases) await t.test(name, async (subtest) => {
    const { file } = fixture(subtest);
    const trigger = guard ? sql(file, `SELECT sql FROM sqlite_master WHERE type='trigger' AND name='${guard}';`).trim() : '';
    sql(file, `${guard ? `DROP TRIGGER "${guard}";` : ''}${mutation}${trigger ? `${trigger};` : ''}`);
    const before = hash(file);
    await assert.rejects(verifyAuditSnapshot(file), { code: 'AUDIT_INTEGRITY_FAILED' });
    assert.equal(hash(file), before, 'verification never repairs or reseals damage');
  });
});

test('snapshot rejects symlinks and SQLite sidecars instead of treating a live database as immutable', async (t) => {
  const { directory, file } = fixture(t);
  const link = path.join(directory, 'linked.db');
  fs.symlinkSync(file, link);
  await assert.rejects(verifyAuditSnapshot(link), { code: 'AUDIT_INTEGRITY_FAILED' });
  for (const suffix of ['-wal', '-shm', '-journal']) {
    fs.writeFileSync(file + suffix, 'fixture');
    await assert.rejects(verifyAuditSnapshot(file), { code: 'AUDIT_INTEGRITY_FAILED' });
    fs.unlinkSync(file + suffix);
  }
  await assert.rejects(verifyAuditSnapshot('relative.db'), TypeError);
});

test('live verification captures committed work in FIFO order and cleans its unique directory', async (t) => {
  const { directory, file, db } = fixture(t);
  const scratchRoot = path.join(directory, 'scratch');
  fs.mkdirSync(scratchRoot);
  fs.writeFileSync(path.join(scratchRoot, 'keep.txt'), 'unrelated');
  const entered = deferred(), release = deferred();
  const held = runSqliteTransaction(db, async (tx) => {
    await appendOperationLog(tx, logData('快照前提交'));
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  let completed = false;
  const checking = verifyLiveAuditSnapshot(file, { scratchRoot }).then((result) => { completed = true; return result; });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(completed, false);
  } finally { release.resolve(); }
  await held;
  const sourceHash = hash(file);
  const result = await checking;
  assert.equal(result.logCount, baselineCount + entryCount + 1);
  assert.ok(Date.parse(result.startedAt) <= Date.parse(result.snapshotAt));
  assert.ok(Date.parse(result.snapshotAt) <= Date.parse(result.completedAt));
  assert.ok(result.durationMs >= 0);
  assert.equal(hash(file), sourceHash);
  assert.deepEqual(fs.readdirSync(scratchRoot), ['keep.txt']);
  await whenSqliteIdle();
});

test('WAL source remains writable while the private snapshot is scanned and its later append is excluded', async (t) => {
  const { directory, file, db } = fixture(t);
  await db.$queryRawUnsafe('PRAGMA journal_mode=WAL');
  await appendOperationLog(db, logData('已提交 WAL 记录'));
  const scratchRoot = path.join(directory, 'scratch');
  let appended = false;
  t.mock.method(require('@prisma/client'), 'PrismaClient', function (options) {
    const client = new PrismaClient(options);
    if (!options.datasourceUrl.includes('.audit-check-')) return client;
    return client.$extends({ query: { operationLog: { async findMany({ args, query }) {
      if (!appended) {
        await appendOperationLog(db, logData('副本扫描期间继续提交'));
        appended = true;
      }
      return query(args);
    } } } });
  });
  const result = await verifyLiveAuditSnapshot(file, { scratchRoot });
  assert.equal(appended, true);
  assert.equal(result.logCount, baselineCount + entryCount + 1, 'snapshot includes committed WAL before capture');
  assert.equal(await db.operationLog.count(), result.logCount + 1, 'later source write is outside the consistent snapshot');
  assert.deepEqual(fs.readdirSync(scratchRoot), []);
});

test('failed live verification cleans snapshots and does not rewrite corrupt source or preexisting scratch files', async (t) => {
  const { directory, file } = fixture(t);
  const scratchRoot = path.join(directory, 'scratch');
  fs.mkdirSync(scratchRoot);
  fs.writeFileSync(path.join(scratchRoot, 'keep.txt'), 'unrelated');
  sql(file, "INSERT INTO OperationLog(action,module,summary) VALUES('UPDATE','fixture','unsigned');");
  const before = hash(file);
  await assert.rejects(verifyLiveAuditSnapshot(file, { scratchRoot }), { code: 'AUDIT_INTEGRITY_FAILED' });
  assert.equal(hash(file), before);
  assert.deepEqual(fs.readdirSync(scratchRoot), ['keep.txt']);
  await assert.rejects(verifyLiveAuditSnapshot(file), TypeError);
  const invalid = path.join(directory, 'invalid.db');
  fs.writeFileSync(invalid, 'not SQLite');
  await assert.rejects(verifyLiveAuditSnapshot(invalid, { scratchRoot }));
  assert.deepEqual(fs.readdirSync(scratchRoot), ['keep.txt']);
});

test('raw exclusive SQLite work shares FIFO, error release, cancellation and idle semantics without replay', async () => {
  const entered = deferred(), release = deferred();
  const order = [];
  let canceled = 0;
  const first = runSqliteExclusive(async () => { order.push('raw'); entered.resolve(); await release.promise; });
  await entered.promise;
  const expired = runSqliteExclusive(() => { canceled++; }, { maxWait: 20 });
  await assert.rejects(expired, { code: 'SQLITE_TRANSACTION_QUEUE_TIMEOUT' });
  const error = new Error('raw fixture failure');
  const failure = runSqliteExclusive(() => { order.push('failure'); throw error; });
  const rejected = assert.rejects(failure, (value) => value === error);
  const transaction = runSqliteTransaction({ $transaction: (action) => action({}) }, () => { order.push('transaction'); });
  let idle = false;
  const waiting = whenSqliteIdle().then(() => { idle = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(idle, false);
  assert.deepEqual(order, ['raw']);
  release.resolve();
  await Promise.all([first, rejected, transaction, waiting]);
  assert.deepEqual(order, ['raw', 'failure', 'transaction']);
  assert.equal(canceled, 0);
});
