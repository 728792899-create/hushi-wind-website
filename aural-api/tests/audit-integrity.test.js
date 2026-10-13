const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { createUnitOfWork } = require('../lib/unit-of-work');
const { runSqliteTransaction } = require('../lib/sqlite-transaction');
const { appendOperationLog, initializeAuditIntegrity, verifyAuditIntegrity } = require('../lib/audit-integrity');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-audit-integrity-'));
const template = path.join(temp, 'template.db');
const migrations = path.join(root, 'prisma/migrations');
const auditMigration = '20261012170000_audit_integrity_and_inquiry_scope';
let nextFixture = 0;
const logData = (summary = '虚构审计测试') => ({
  adminUserId: 42, operator: 'fixture_admin', role: 'super_admin', action: 'UPDATE',
  module: 'fixture', target: '测试对象', targetId: '7', summary,
  beforeData: '{"status":"before"}', afterData: '{"status":"after"}',
  ip: '127.0.0.1', userAgent: 'fixture-only',
});
const rejectsIntegrity = (action) => assert.rejects(action, { code: 'AUDIT_INTEGRITY_FAILED' });

before(() => {
  const names = fs.readdirSync(migrations).filter((name) => fs.statSync(path.join(migrations, name)).isDirectory()).sort();
  const oldSql = names.filter((name) => name < auditMigration).map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  const fixtureSql = `
    INSERT INTO "OperationLog" (id, action, module, summary) VALUES
      (1, 'UPDATE', 'fixture', '接手前历史一'), (4, 'CREATE', 'fixture', '接手前历史二');
    INSERT INTO "RecycleEntry" (module, recordId, payload, title, operator) VALUES
      ('inquiry', 1, '{"assigneeId":12}', '虚构咨询', 'fixture'),
      ('inquiry', 2, '{"assigneeId":"12"}', '旧字符串', 'fixture'),
      ('inquiry', 3, 'invalid JSON', '损坏快照', 'fixture'),
      ('articles', 4, '{"assigneeId":12}', '非咨询', 'fixture');
  `;
  const result = spawnSync('sqlite3', [template], {
    input: oldSql + '\n' + fixtureSql + '\n' + fs.readFileSync(path.join(migrations, auditMigration, 'migration.sql'), 'utf8'), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});
after(() => fs.rmSync(temp, { recursive: true, force: true }));
async function fixture(t) {
  const filename = path.join(temp, `fixture-${++nextFixture}.db`);
  fs.copyFileSync(template, filename);
  const db = new PrismaClient({ datasourceUrl: `file:${filename}` });
  t.after(() => db.$disconnect());
  return { db, filename };
}
async function bypassGuard(db, name, action) {
  // Pin temporary schema changes and their action to one connection. A failing
  // fixture must roll back both its data changes and the temporary guard removal.
  return runSqliteTransaction(db, async (tx) => {
    const [{ sql }] = await tx.$queryRawUnsafe('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?', 'trigger', name);
    await tx.$executeRawUnsafe(`DROP TRIGGER "${name}"`);
    try { return await action(tx); } finally { await tx.$executeRawUnsafe(sql); }
  });
}

test('migration preserves historical log fields and safely backfills only inquiry integer owners', async (t) => {
  const { db } = await fixture(t);
  const before = await db.operationLog.findMany({ orderBy: { id: 'asc' } });
  const result = await initializeAuditIntegrity(db);
  assert.equal(result.baselineCount, 2);
  assert.equal(result.baselineMaxId, 4);
  assert.equal(result.entryCount, 0);
  assert.deepEqual(await db.operationLog.findMany({ orderBy: { id: 'asc' } }), before);
  assert.deepEqual((await db.recycleEntry.findMany({ orderBy: { id: 'asc' } })).map((row) => row.inquiryAssigneeId), [12, null, null, null]);
  assert.deepEqual(await initializeAuditIntegrity(db), result, 'initialization is idempotent without resealing');
});

test('append lazily seals once and creates a verifiable ordered chain across client instances', async (t) => {
  const { db, filename } = await fixture(t);
  const second = new PrismaClient({ datasourceUrl: `file:${filename}` });
  t.after(() => second.$disconnect());
  await Promise.all(Array.from({ length: 8 }, (_, n) => appendOperationLog(n % 2 ? db : second, logData(`并发${n}`))));
  const result = await verifyAuditIntegrity(db);
  assert.equal(result.entryCount, 8);
  assert.equal(result.logCount, 10);
  assert.deepEqual((await db.auditLogEntry.findMany({ orderBy: { sequence: 'asc' } })).map((row) => row.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('business, original log, chain and head commit or roll back together inside unit-of-work', async (t) => {
  const { db } = await fixture(t);
  await initializeAuditIntegrity(db);
  const unit = createUnitOfWork(db);
  await unit.transaction(async () => {
    assert.equal(typeof unit.prisma.$transaction, 'undefined', 'proxy resolves to current transaction');
    await unit.prisma.inquiry.create({ data: { customerName: '虚构客户', contactInfo: 'fixture', message: '一起提交' } });
    await appendOperationLog(unit.prisma, logData('第一条'));
    await appendOperationLog(unit.prisma, logData('第二条'));
  });
  const before = await verifyAuditIntegrity(db);
  await assert.rejects(unit.transaction(async () => {
    await unit.prisma.inquiry.create({ data: { customerName: '虚构回滚', contactInfo: 'fixture', message: '应撤销' } });
    await appendOperationLog(unit.prisma, logData('应撤销'));
    throw new Error('fixture failure after audit');
  }), /fixture failure/);
  assert.equal(await db.inquiry.count(), 1);
  assert.deepEqual(await verifyAuditIntegrity(db), before);
  await db.$executeRawUnsafe("CREATE TRIGGER fixture_chain_failure BEFORE INSERT ON AuditLogEntry BEGIN SELECT RAISE(ABORT, 'fixture chain unavailable'); END");
  await assert.rejects(unit.transaction(async () => {
    await unit.prisma.inquiry.create({ data: { customerName: '虚构失败', contactInfo: 'fixture', message: '应撤销' } });
    await appendOperationLog(unit.prisma, logData());
  }));
  assert.equal(await db.inquiry.count(), 1);
  assert.deepEqual(await verifyAuditIntegrity(db), before);
});

test('database guards reject update, delete and INSERT OR REPLACE while LoginRecord retention still works', async (t) => {
  const { db } = await fixture(t);
  const row = await appendOperationLog(db, logData());
  await assert.rejects(db.operationLog.update({ where: { id: 1 }, data: { summary: 'tampered' } }));
  await assert.rejects(db.operationLog.delete({ where: { id: row.id } }));
  await assert.rejects(db.$executeRawUnsafe('INSERT OR REPLACE INTO OperationLog (id,action,module) VALUES (?, ?, ?)', row.id, 'REPLACE', 'fixture'));
  await assert.rejects(db.auditLogEntry.update({ where: { sequence: 1 }, data: { hash: 'tampered' } }));
  await assert.rejects(db.auditLogEntry.delete({ where: { sequence: 1 } }));
  await assert.rejects(db.$executeRawUnsafe("INSERT OR REPLACE INTO AuditLogEntry (sequence,operationLogId,previousHash,rowHash,hash) VALUES (2,?,'x','x','x')", row.id));
  await assert.rejects(db.auditIntegrityState.update({ where: { id: 1 }, data: { baselineHash: 'tampered' } }));
  await assert.rejects(db.auditIntegrityState.delete({ where: { id: 1 } }));
  await assert.rejects(db.$executeRawUnsafe('INSERT OR REPLACE INTO AuditIntegrityState (id,baselineCount,baselineMaxId,lastLogId) VALUES (1,0,0,0)'));
  await db.loginRecord.create({ data: { username: 'fixture', success: true } });
  assert.equal((await db.loginRecord.deleteMany()).count, 1);
  assert.equal((await verifyAuditIntegrity(db)).ok, true);
});

test('guard bypass rolls back tampering when its callback fails and preserves database protection', async (t) => {
  const { db } = await fixture(t);
  const row = await appendOperationLog(db, logData('must survive fixture failure'));
  const before = await verifyAuditIntegrity(db);
  const guardSql = await db.$queryRawUnsafe("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'OperationLog_no_update'");
  const failure = new Error('fixture callback failure');
  await assert.rejects(bypassGuard(db, 'OperationLog_no_update', async (tx) => {
    await tx.operationLog.update({ where: { id: row.id }, data: { summary: 'must roll back' } });
    throw failure;
  }), (error) => error === failure);
  assert.deepEqual(await db.$queryRawUnsafe("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'OperationLog_no_update'"), guardSql);
  await assert.rejects(db.operationLog.update({ where: { id: row.id }, data: { summary: 'must remain blocked' } }));
  assert.deepEqual(await db.operationLog.findUnique({ where: { id: row.id } }), row);
  assert.deepEqual(await verifyAuditIntegrity(db), before);
});

test('full verification detects historical and interior signed-row changes and refuses resealing', async (t) => {
  for (const target of ['history', 'interior']) {
    const { db } = await fixture(t);
    const row = await appendOperationLog(db, logData('original'));
    await appendOperationLog(db, logData('tail'));
    const state = await db.auditIntegrityState.findUnique({ where: { id: 1 } });
    await bypassGuard(db, 'OperationLog_no_update', (tx) => tx.operationLog.update({
      where: { id: target === 'history' ? 1 : row.id }, data: { summary: '特权绕过触发器后的修改' },
    }));
    await rejectsIntegrity(verifyAuditIntegrity(db));
    await rejectsIntegrity(initializeAuditIntegrity(db));
    assert.deepEqual(await db.auditIntegrityState.findUnique({ where: { id: 1 } }), state, 'never rewrites the existing seal');
  }
});

test('independent head detects both interior deletion and jointly removed trailing log/chain rows', async (t) => {
  for (const position of [1, 2]) {
    const { db } = await fixture(t);
    const one = await appendOperationLog(db, logData('one'));
    const two = await appendOperationLog(db, logData('two'));
    await bypassGuard(db, 'OperationLog_no_delete', (tx) => tx.operationLog.delete({ where: { id: position === 1 ? one.id : two.id } }));
    await bypassGuard(db, 'AuditLogEntry_no_delete', (tx) => tx.auditLogEntry.delete({ where: { sequence: position } }));
    await rejectsIntegrity(verifyAuditIntegrity(db));
    await rejectsIntegrity(initializeAuditIntegrity(db));
    if (position === 2) await rejectsIntegrity(appendOperationLog(db, logData('must fail')));
  }
});

test('unsigned additions are detected and refuse subsequent append without partial new rows', async (t) => {
  const { db } = await fixture(t);
  await appendOperationLog(db, logData('signed'));
  await db.operationLog.create({ data: logData('unsigned bypass') });
  const count = await db.operationLog.count();
  await rejectsIntegrity(verifyAuditIntegrity(db));
  await rejectsIntegrity(appendOperationLog(db, logData('must fail')));
  await rejectsIntegrity(initializeAuditIntegrity(db));
  assert.equal(await db.operationLog.count(), count);
});

test('post-migration unsigned rows cannot be silently accepted into the first historical baseline', async (t) => {
  const { db } = await fixture(t);
  await db.operationLog.create({ data: logData('old binary wrote after migration') });
  await rejectsIntegrity(initializeAuditIntegrity(db));
  assert.equal((await db.auditIntegrityState.findUnique({ where: { id: 1 } })).baselineHash, null);
});

test('missing or replaced guards and missing state fail verification without recreating state', async (t) => {
  const { db } = await fixture(t);
  await appendOperationLog(db, logData());
  await bypassGuard(db, 'OperationLog_no_update', async (tx) => {
    await rejectsIntegrity(verifyAuditIntegrity(tx));
    await tx.$executeRawUnsafe('CREATE TRIGGER OperationLog_no_update BEFORE UPDATE ON OperationLog BEGIN SELECT 1; END');
    await rejectsIntegrity(verifyAuditIntegrity(tx));
    await tx.$executeRawUnsafe('DROP TRIGGER OperationLog_no_update');
  });
  await bypassGuard(db, 'AuditIntegrityState_no_delete', (tx) => tx.auditIntegrityState.delete({ where: { id: 1 } }));
  await rejectsIntegrity(initializeAuditIntegrity(db));
  await rejectsIntegrity(appendOperationLog(db, logData()));
  assert.equal(await db.auditIntegrityState.count(), 0);
});

test('read-only verification obtains a consistent snapshot during concurrent append', async (t) => {
  const { db, filename } = await fixture(t);
  await appendOperationLog(db, logData());
  const reader = new PrismaClient({ datasourceUrl: `file:${filename}` });
  t.after(() => reader.$disconnect());
  const results = await Promise.all([
    ...Array.from({ length: 5 }, () => verifyAuditIntegrity(reader)),
    ...Array.from({ length: 5 }, (_, n) => appendOperationLog(db, logData(`writer ${n}`))),
  ]);
  assert.ok(results.slice(0, 5).every((result) => result.ok));
  assert.equal((await verifyAuditIntegrity(db)).entryCount, 6);
});

test('verification CLI is read-only and exits nonzero for corruption', async (t) => {
  const { db, filename } = await fixture(t);
  await appendOperationLog(db, logData());
  const state = await db.auditIntegrityState.findUnique({ where: { id: 1 } });
  const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/verify-audit-integrity.js')], {
    cwd: root, env: { ...process.env, DATABASE_URL: `file:${filename}`, NODE_ENV: 'test' }, encoding: 'utf8',
  });
  const success = run();
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).logCount, 3);
  assert.deepEqual(await db.auditIntegrityState.findUnique({ where: { id: 1 } }), state);
  await db.operationLog.create({ data: logData('unsigned') });
  const failure = run();
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /AUDIT_INTEGRITY_FAILED/);
  assert.deepEqual(await db.auditIntegrityState.findUnique({ where: { id: 1 } }), state);
});
