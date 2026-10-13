const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { createDatabaseBackup, verifyBackupBundle } = require('../lib/database-backup');
const { initializeAuditIntegrity } = require('../lib/audit-integrity');
const apiRoot = path.resolve(__dirname, '..');
const logRoot = path.resolve(apiRoot, '../logs/step13-20261013');
const sizeMigration = '20261013020000_backup_size_safe_integer';
function sqlite(file, sql) {
  return spawnSync('sqlite3', ['-bail', '-json', file], { input: sql, encoding: 'utf8' });
}
async function fixture(t, { beforeSize = false } = {}) {
  await fs.mkdir(logRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(logRoot, 'backup-capacity-'));
  const file = path.join(root, 'source.db');
  const migrations = path.join(apiRoot, 'prisma/migrations');
  const names = (await fs.readdir(migrations)).filter(n => /^\d/.test(n) && (!beforeSize || n < sizeMigration)).sort();
  const sql = (await Promise.all(names.map(n => fs.readFile(path.join(migrations, n, 'migration.sql'), 'utf8')))).join('\n');
  const migrated = sqlite(file, sql); assert.equal(migrated.status, 0, migrated.stderr);
  const db = new PrismaClient({ datasourceUrl: 'file:' + file });
  t.after(async () => { await db.$disconnect(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, file, db, migration: await fs.readFile(path.join(migrations, sizeMigration, 'migration.sql'), 'utf8') };
}

test('size migration preserves every prior field and the deleted AUTOINCREMENT high-water mark', async t => {
  const f = await fixture(t, { beforeSize: true });
  const seeded = sqlite(f.file, `INSERT INTO BackupRecord(id,filename,size,message,verificationStatus,verifiedAt,verificationReport,adminUserId,operator,createdAt)
    VALUES (7,'synthetic.db',2147483647,'original','verified',1700000000000,'{"status":"verified"}',42,'fixture',1699999999999);
    INSERT INTO BackupRecord(id,filename,size,status) VALUES (501,'deleted.db',1,'failed'); DELETE FROM BackupRecord WHERE id=501;
    SELECT * FROM BackupRecord;`);
  assert.equal(seeded.status, 0, seeded.stderr);
  const before = JSON.parse(seeded.stdout);
  const migrated = sqlite(f.file, f.migration); assert.equal(migrated.status, 0, migrated.stderr);
  assert.deepEqual(JSON.parse(sqlite(f.file, 'SELECT * FROM BackupRecord;').stdout), before);
  const row = await f.db.backupRecord.create({ data: { filename: 'synthetic-4GiB.db', size: 4294967296 } });
  assert.equal(row.id, 502);
  assert.equal(row.size, 4294967296);
  assert.equal(JSON.parse(JSON.stringify(await f.db.backupRecord.findUnique({ where: { id: row.id } }))).size, 4294967296);
});

test('backup sizes support exact nonnegative safe bytes beyond 2 GiB and reject fractional/unsafe sizes', async t => {
  const f = await fixture(t);
  for (const size of [0, 2147483647, 2147483648, 4294967296, Number.MAX_SAFE_INTEGER]) {
    const row = await f.db.backupRecord.create({ data: { filename: 'synthetic-boundary.db', size } });
    assert.equal((await f.db.backupRecord.findUnique({ where: { id: row.id } })).size, size);
  }
  const before = await f.db.backupRecord.count();
  for (const size of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(f.db.backupRecord.create({ data: { filename: 'must-not-save.db', size } }));
  assert.equal(await f.db.backupRecord.count(), before);
});

test('a migration with invalid legacy size rolls back without dropping prior records', async t => {
  const f = await fixture(t, { beforeSize: true });
  const seeded = sqlite(f.file, "INSERT INTO BackupRecord(filename,size) VALUES ('invalid-legacy.db',-1);");
  assert.equal(seeded.status, 0, seeded.stderr);
  assert.notEqual(sqlite(f.file, f.migration).status, 0);
  assert.deepEqual(JSON.parse(sqlite(f.file, 'SELECT filename,size FROM BackupRecord;').stdout), [{ filename: 'invalid-legacy.db', size: -1 }]);
  assert.equal(JSON.parse(sqlite(f.file, "SELECT type FROM pragma_table_info('BackupRecord') WHERE name='size';").stdout)[0].type, 'INTEGER');
});

test('content-history reference scanning reaches all keyset pages, negative IDs and gaps', async t => {
  const f = await fixture(t);
  await initializeAuditIntegrity(f.db);
  const uploads = path.join(f.root, 'uploads'), file = path.join(f.root, 'backup.db');
  await fs.mkdir(uploads); await fs.writeFile(path.join(uploads, 'fixture.txt'), 'synthetic');
  const seeded = sqlite(f.file, `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1201)
    INSERT INTO ContentVersion(id,module,recordId,snapshot) SELECT x*3-1503,'fixture',x,'{"imageUrl":"/uploads/fixture.txt"}' FROM n;`);
  assert.equal(seeded.status, 0, seeded.stderr);
  for (const id of [-1500, 0, 2100]) {
    await f.db.contentVersion.update({ where: { id }, data: { snapshot: '{"imageUrl":"/uploads/missing.txt"}' } });
    await assert.rejects(createDatabaseBackup(f.file, file, { uploadsRoot: uploads, requireAssets: true }), /missing upload/);
    assert.equal((await fs.readdir(f.root)).some(n => n.startsWith('.backup-') || n.endsWith('.lock')), false);
    await f.db.contentVersion.update({ where: { id }, data: { snapshot: '{"imageUrl":"/uploads/fixture.txt"}' } });
  }
  await createDatabaseBackup(f.file, file, { uploadsRoot: uploads, requireAssets: true });
  const checked = await verifyBackupBundle(file, { requireAssets: true });
  assert.equal(checked.tables.find(r => r.name === 'ContentVersion').count, 1201);
  assert.equal(checked.assetCount, 1);
});
