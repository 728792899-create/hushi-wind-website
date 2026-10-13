const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { createBackupScheduler } = require('../lib/scheduled-backup');
const { initializeAuditIntegrity } = require('../lib/audit-integrity');
const { verifyBackupBundle } = require('../lib/database-backup');

const apiRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.resolve(apiRoot, '../logs/step7-20261013/scheduler-fixtures');

async function sqliteFixture(t) {
  await fs.mkdir(fixtureRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(fixtureRoot, 'run-'));
  const source = path.join(root, 'source.db');
  const uploadsRoot = path.join(root, 'uploads');
  const backupRoot = path.join(root, 'backups');
  const migrations = path.join(apiRoot, 'prisma/migrations');
  const names = (await fs.readdir(migrations)).filter((name) => /^\d/.test(name)).sort();
  const sql = (await Promise.all(names.map((name) => fs.readFile(path.join(migrations, name, 'migration.sql'), 'utf8')))).join('\n');
  const migrated = spawnSync('sqlite3', [source], { input: sql, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stderr);
  const db = new PrismaClient({ datasourceUrl: 'file:' + source });
  t.after(async () => { await db.$disconnect(); await fs.rm(root, { recursive: true, force: true }); });
  await fs.mkdir(uploadsRoot);
  await fs.writeFile(path.join(uploadsRoot, 'fixture.txt'), 'synthetic asset');
  await db.product.create({ data: {
    title: '虚构调度测试', slug: 'scheduled-fixture', type: 'fixture', categoryName: 'fixture',
    description: 'isolated fixture', imageUrl: '/uploads/fixture.txt',
  } });
  await initializeAuditIntegrity(db);
  return { root, db, source, uploadsRoot, backupRoot };
}

function fakeFixture(overrides = {}) {
  const records = [], maintenance = [], alerts = [];
  const db = {
    backupRecord: { findFirst: async () => null, create: async ({ data }) => { records.push(data); return data; } },
    maintenanceRun: { create: async ({ data }) => { maintenance.push(data); return data; } },
  };
  const options = {
    source: '/fixture/source.db', uploadsRoot: '/fixture/uploads', backupRoot: '/fixture/backups',
    create: async () => ({ size: 100 }), verify: async () => {}, prune: async () => {},
    onFailure: async (failure) => { alerts.push(failure); }, ...overrides,
  };
  return { db, records, maintenance, alerts, options };
}

test('automatic failure persists a fresh failed result and alert without pruning the previous valid SQLite bundle', async (t) => {
  const f = await sqliteFixture(t), alerts = [];
  let pruned = 0;
  const scheduler = createBackupScheduler(f.db, { ...f, prune: async () => { pruned++; }, onFailure: async (failure) => { alerts.push(failure); } });
  const first = await scheduler.run();
  const oldFile = path.join(f.backupRoot, first.filename);
  const oldBundle = await verifyBackupBundle(oldFile, { requireAssets: true });
  await f.db.backupRecord.updateMany({ data: { createdAt: new Date('2000-01-01T00:00:00Z') } });
  await fs.rm(path.join(f.uploadsRoot, 'fixture.txt'));
  await assert.rejects(scheduler.run(), /missing upload/);
  const latest = await f.db.backupRecord.findFirst({ orderBy: { id: 'desc' } });
  assert.equal(latest.status, 'failed');
  assert.equal(latest.operator, 'scheduled');
  assert.equal(latest.size, 0);
  assert.equal((await f.db.maintenanceRun.findFirst()).task, 'scheduled-backup');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].phase, 'backup');
  assert.equal(alerts[0].filename, latest.filename);
  assert.equal(latest.message, alerts[0].message);
  assert.ok(!JSON.stringify({ latest, alerts }).includes(f.root));
  assert.equal(pruned, 1, 'failed replacement never starts retention');
  assert.deepEqual(await verifyBackupBundle(oldFile, { requireAssets: true }), oldBundle);
  await fs.writeFile(path.join(f.uploadsRoot, 'fixture.txt'), 'synthetic asset');
  assert.ok((await scheduler.run()).filename, 'failure releases the busy flag');
  assert.equal(pruned, 2);
});

test('post-create verification failure records only a sanitized message before invoking its alert callback', async () => {
  const original = new Error('private /internal/db/path credential=fixture-secret');
  const events = [];
  const f = fakeFixture({ verify: async () => { throw original; }, prune: async () => { assert.fail('failure must not prune'); } });
  f.db.backupRecord.create = async ({ data }) => { events.push('backup'); f.records.push(data); };
  f.db.maintenanceRun.create = async ({ data }) => { events.push('maintenance'); f.maintenance.push(data); };
  f.options.onFailure = async (failure) => { events.push('callback'); f.alerts.push(failure); };
  await assert.rejects(createBackupScheduler(f.db, f.options).run(), (error) => error === original);
  assert.deepEqual(events, ['backup', 'maintenance', 'callback']);
  assert.equal(f.records[0].status, 'failed');
  assert.equal(f.maintenance[0].status, 'failed');
  assert.doesNotMatch(JSON.stringify([f.records, f.maintenance, f.alerts]), /private|internal|credential|fixture-secret/);
});

test('failed history and alert writes never replace the original error or prevent the next backup attempt', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  const original = new Error('original failure'), attempts = [];
  let broken = true;
  const f = fakeFixture({
    create: async () => { if (broken) throw original; return { size: 100 }; },
    onFailure: async () => { attempts.push('callback'); throw new Error('callback failure /private'); },
  });
  f.db.backupRecord.create = async ({ data }) => { attempts.push('backup'); if (broken) throw new Error('history failure /private'); f.records.push(data); };
  f.db.maintenanceRun.create = async () => { attempts.push('maintenance'); throw new Error('maintenance failure /private'); };
  const scheduler = createBackupScheduler(f.db, f.options);
  await assert.rejects(scheduler.run(), (error) => error === original);
  assert.deepEqual(attempts, ['backup', 'maintenance', 'callback']);
  assert.doesNotMatch(JSON.stringify(warnings), /private/);
  broken = false;
  assert.ok((await scheduler.run()).filename);
  assert.equal(f.records[0].status, 'success');
});

test('retention failure preserves the verified success record and reports a separate maintenance phase', async () => {
  const original = new Error('retention /private failure');
  let broken = true;
  const f = fakeFixture({ prune: async () => { if (broken) throw original; } });
  const scheduler = createBackupScheduler(f.db, f.options);
  await assert.rejects(scheduler.run(), (error) => error === original);
  assert.equal(f.records.length, 1);
  assert.equal(f.records[0].status, 'success');
  assert.equal(f.maintenance[0].task, 'backup-retention');
  assert.equal(f.alerts[0].phase, 'retention');
  assert.equal(f.alerts[0].filename, f.records[0].filename);
  assert.doesNotMatch(JSON.stringify([f.maintenance, f.alerts]), /private/);
  broken = false;
  assert.ok((await scheduler.run()).filename);
});
