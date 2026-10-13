const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runSqliteTransaction, whenSqliteIdle } = require('../lib/sqlite-transaction');
const { createUnitOfWork } = require('../lib/unit-of-work');
const { createWorkTracker } = require('../lib/work-tracker');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { withContentRevision } = require('../lib/record-version');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('SQLite transaction FIFO is shared across clients and never overlaps engine transactions', async () => {
  const entered = deferred(), release = deferred(), order = [];
  let active = 0, peak = 0;
  const client = (name) => ({
    async $transaction(action, options) {
      active++;
      peak = Math.max(peak, active);
      order.push(`begin-${name}`);
      assert.deepEqual(options, { maxWait: 1000, timeout: 2000 });
      try { return await action({ name }); }
      finally { order.push(`end-${name}`); active--; }
    },
  });
  const first = runSqliteTransaction(client('one'), async () => {
    entered.resolve();
    await release.promise;
    return 1;
  }, { maxWait: 1000, timeout: 2000 });
  await entered.promise;
  const second = runSqliteTransaction(client('two'), async () => 2, { maxWait: 1000, timeout: 2000 });
  const third = runSqliteTransaction(client('three'), async () => 3, { maxWait: 1000, timeout: 2000 });
  await settle();
  assert.deepEqual(order, ['begin-one']);
  release.resolve();
  assert.deepEqual(await Promise.all([first, second, third]), [1, 2, 3]);
  assert.equal(peak, 1);
  assert.deepEqual(order, ['begin-one', 'end-one', 'begin-two', 'end-two', 'begin-three', 'end-three']);
});

test('queue timeout removes work permanently and a failed transaction does not block the next one', async () => {
  const entered = deferred(), release = deferred();
  let canceledCalls = 0, failingCalls = 0, successfulCalls = 0;
  const db = { $transaction: (action) => action({}) };
  const first = runSqliteTransaction(db, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const canceled = runSqliteTransaction(db, async () => { canceledCalls++; }, { maxWait: 20 });
  await assert.rejects(canceled, { code: 'SQLITE_TRANSACTION_QUEUE_TIMEOUT', status: 503 });
  const failure = runSqliteTransaction(db, async () => { failingCalls++; throw new Error('fixture failure'); });
  const rejected = assert.rejects(failure, /fixture failure/);
  const success = runSqliteTransaction(db, async () => { successfulCalls++; return 'next'; });
  release.resolve();
  await first;
  await rejected;
  assert.equal(await success, 'next');
  assert.equal(canceledCalls, 0, 'expired queued action never runs later');
  assert.equal(failingCalls, 1, 'callbacks are not retried');
  assert.equal(successfulCalls, 1);
});

test('existing transaction is reused without entering the queue behind its own outer transaction', async () => {
  const tx = { fixture: true };
  let begins = 0;
  const db = { async $transaction(action) { begins++; return action(tx); } };
  const result = await runSqliteTransaction(db, (current) => runSqliteTransaction(current, async (same) => {
    assert.equal(same, tx);
    return 'nested';
  }));
  assert.equal(result, 'nested');
  assert.equal(begins, 1);
});

test('queue capacity is bounded and overflowing work never enters the engine', async () => {
  const entered = deferred(), release = deferred();
  let calls = 0;
  const db = { async $transaction(action) { calls++; return action({}); } };
  const first = runSqliteTransaction(db, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const queued = Array.from({ length: 256 }, (_, n) => runSqliteTransaction(db, async () => n));
  await assert.rejects(runSqliteTransaction(db, async () => 'must-not-run'), {
    code: 'SQLITE_TRANSACTION_QUEUE_FULL', status: 503,
  });
  assert.equal(calls, 1);
  release.resolve();
  await first;
  assert.equal((await Promise.all(queued)).length, 256);
  assert.equal(calls, 257);
});

test('SQLite idle barrier waits for active, queued and immediately chained work without altering errors', async () => {
  const entered = deferred(), firstGate = deferred(), finalGate = deferred(), finalEntered = deferred();
  const db = { $transaction: (action) => action({}) };
  const first = runSqliteTransaction(db, async () => { entered.resolve(); await firstGate.promise; });
  await entered.promise;
  const original = new Error('queued fixture error');
  const failure = runSqliteTransaction(db, async () => { throw original; });
  const rejected = assert.rejects(failure, (error) => error === original);
  const chained = failure.catch(() => runSqliteTransaction(db, async () => {
    finalEntered.resolve();
    await finalGate.promise;
  }));
  let idle = false;
  const waiting = whenSqliteIdle().then(() => { idle = true; });
  await settle();
  assert.equal(idle, false);
  firstGate.resolve();
  await finalEntered.promise;
  await settle();
  assert.equal(idle, false);
  finalGate.resolve();
  await Promise.all([first, rejected, chained, waiting]);
  await whenSqliteIdle();
  assert.equal(idle, true);
});

test('unit-of-work nested writes commit once and afterCommit runs once only after commit', async () => {
  const events = [];
  const tx = { marker: 'transaction-client' };
  const db = { async $transaction(action) {
    events.push('begin');
    try { const result = await action(tx); events.push('commit'); return result; }
    catch (error) { events.push('rollback'); throw error; }
  } };
  const unit = createUnitOfWork(db);
  await unit.transaction(async () => {
    assert.equal(unit.prisma.marker, tx.marker);
    unit.afterCommit(() => events.push('outer-task'));
    await unit.transaction(async () => {
      assert.equal(unit.prisma.marker, tx.marker);
      unit.afterCommit(() => events.push('inner-task'));
    });
    assert.deepEqual(events, ['begin']);
  });
  await settle();
  assert.deepEqual(events, ['begin', 'commit', 'outer-task', 'inner-task']);
  events.length = 0;
  await assert.rejects(unit.transaction(async () => {
    unit.afterCommit(() => events.push('must-not-run'));
    throw new Error('rollback fixture');
  }), /rollback fixture/);
  await settle();
  assert.deepEqual(events, ['begin', 'rollback']);
});

test('unit-of-work handlers stage responses until commit and discard responses/tasks on rollback', async () => {
  const events = [];
  const db = { async $transaction(action) {
    events.push('begin');
    try { const result = await action({}); events.push('commit'); return result; }
    catch (error) { events.push('rollback'); throw error; }
  } };
  const unit = createUnitOfWork(db);
  const res = { status(code) { events.push(`status-${code}`); return this; }, json(body) { events.push(body); } };
  const next = (error) => events.push(error.message);
  await unit.handler(async (_req, staged) => {
    unit.afterCommit(() => events.push('after-commit'));
    staged.status(201).json('created');
    assert.deepEqual(events, ['begin']);
  })({}, res, next);
  await settle();
  assert.deepEqual(events, ['begin', 'commit', 'status-201', 'created', 'after-commit']);
  events.length = 0;
  await unit.handler(async (_req, staged) => {
    staged.json('must-not-send');
    unit.afterCommit(() => events.push('must-not-run'));
    throw new Error('handler failed');
  })({}, res, next);
  await settle();
  assert.deepEqual(events, ['begin', 'rollback', 'handler failed']);
});

test('real SQLite standalone background writes share the transaction queue while reads and revision extensions keep working', async (t) => {
  const fixtureRoot = path.resolve(__dirname, '../../logs/step8-20261013/sqlite-fixtures');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const temp = fs.mkdtempSync(path.join(fixtureRoot, 'run-'));
  const filename = path.join(temp, 'fixture.db');
  const migrations = path.resolve(__dirname, '../prisma/migrations');
  const sql = fs.readdirSync(migrations)
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory()).sort()
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  const result = spawnSync('sqlite3', [filename], { input: sql, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const db = withContentRevision(new PrismaClient({ datasourceUrl: `file:${filename}` }));
  const backgroundDb = withContentRevision(new PrismaClient({ datasourceUrl: `file:${filename}` }));
  t.after(async () => {
    await Promise.all([db.$disconnect(), backgroundDb.$disconnect()]);
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const work = createWorkTracker();
  const unit = createUnitOfWork(db, { work }), background = createUnitOfWork(backgroundDb, { work });
  const row = await unit.prisma.article.create({ data: { title: 'fixture', category: 'fixture', date: '2026-10-13' } });
  assert.equal(row.revision, 0);
  const savedDelegate = unit.prisma.article;
  const savedCreate = unit.prisma.loginRecord.create;
  const savedExecuteRaw = unit.prisma.$executeRaw;
  const entered = deferred(), release = deferred();
  const completed = [];
  const business = unit.transaction(async () => {
    await savedDelegate.update({ where: { id: row.id }, data: { title: 'business' } });
    await unit.transaction(async () => {
      await unit.prisma.article.updateMany({ where: { id: row.id }, data: { category: 'nested' } });
    });
    await savedCreate({ data: { username: 'captured-inside-transaction', success: true } });
    await savedExecuteRaw`UPDATE "Article" SET "category" = ${'captured-raw'} WHERE "id" = ${row.id}`;
    entered.resolve();
    await release.promise;
    assert.equal((await unit.prisma.article.findUnique({ where: { id: row.id } })).revision, 2);
  });
  await entered.promise;
  const writes = [
    background.prisma.loginRecord.create({ data: { username: 'fixture', success: true } }),
    background.prisma.analyticsEvent.create({ data: { eventType: 'fixture' } }),
    background.prisma.notificationDelivery.create({ data: { type: 'fixture', payload: '{}' } }),
    background.prisma.article.upsert({
      where: { id: row.id }, create: { title: 'never', category: 'fixture', date: '2026-10-13' },
      update: { title: 'background' },
    }),
    background.prisma.$executeRaw`UPDATE "Article" SET "category" = ${'raw-tagged'} WHERE "id" = ${row.id}`,
    background.prisma.$executeRawUnsafe('UPDATE "Article" SET "category" = ? WHERE "id" = ?', 'raw-unsafe', row.id),
  ].map((write, index) => write.then((value) => { completed.push(index); return value; }));
  let drained = false;
  const waiting = work.drain().then(() => { drained = true; });
  try {
    assert.equal(await background.prisma.loginRecord.count(), 0, 'reads are not queued behind the held transaction');
    await settle();
    assert.deepEqual(completed, [], 'standalone writes wait before entering the engine');
    assert.equal(drained, false, 'work drain includes the accepted transaction and its queued writes');
    assert.deepEqual(work.snapshot(), { total: 7, byLabel: { transaction: 1, 'sqlite-write': 6 } });
  } finally {
    release.resolve();
  }
  await business;
  await Promise.all(writes);
  await waiting;
  await whenSqliteIdle();
  assert.equal(work.snapshot().total, 0);
  assert.deepEqual(completed, [0, 1, 2, 3, 4, 5]);
  const current = await unit.prisma.article.findUnique({ where: { id: row.id } });
  assert.equal(current.revision, 3, 'update/updateMany/upsert each bump revision once');
  assert.equal(current.title, 'background');
  assert.equal(current.category, 'raw-unsafe');
  assert.equal(await unit.prisma.loginRecord.count(), 2);
  assert.equal(await unit.prisma.analyticsEvent.count(), 1);
  assert.equal(await unit.prisma.notificationDelivery.count(), 1);
  await assert.rejects(unit.transaction(async () => {
    await unit.prisma.article.update({ where: { id: row.id }, data: { title: 'must-roll-back' } });
    throw new Error('fixture rollback');
  }), /fixture rollback/);
  assert.equal((await unit.prisma.article.findUnique({ where: { id: row.id } })).revision, 3);
});
