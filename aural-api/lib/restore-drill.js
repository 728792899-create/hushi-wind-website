const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { verifyBackupBundle } = require('./database-backup');
const { appendOperationLog, verifyAuditSnapshot, snapshotFileIdentity, waitForSnapshotClose } = require('./audit-integrity');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep);
async function canonicalDestination(value) {
  let current = path.resolve(value);
  const missing = [];
  while (true) {
    try { return path.join(await fs.realpath(current), ...missing); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.unshift(path.basename(current));
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}
async function restoreBackupDrill(file, { scratchRoot } = {}) {
  if (!path.isAbsolute(file || '') || !path.isAbsolute(scratchRoot || ''))
    throw Object.assign(new Error('Backup and scratch root must be explicit absolute paths'), { code: 'RESTORE_DRILL_PATH_REQUIRED' });
  const startedAt = new Date(), startedMs = Date.now();
  const options = { requireCurrentSchema: false, requireAssets: true };
  let workspace, client, report;
  try {
    const source = await verifyBackupBundle(file, options);
    if (source.audit.status !== 'verified')
      throw Object.assign(new Error('Legacy backup has no verifiable audit chain; full restore drill is unavailable'), { code: 'RESTORE_DRILL_LEGACY_AUDIT' });
    const assetRoot = await fs.realpath(file + '.assets');
    if (within(await canonicalDestination(scratchRoot), assetRoot))
      throw new Error('Scratch root must be outside the source asset directory');
    await fs.mkdir(scratchRoot, { recursive: true, mode: 0o700 });
    const rootStat = await fs.lstat(scratchRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Scratch root must be a regular directory');
    const scratch = await fs.realpath(scratchRoot);
    if (within(scratch, assetRoot)) throw new Error('Scratch root must be outside the source asset directory');
    workspace = await fs.mkdtemp(path.join(scratch, 'restore-drill-'));
    await fs.chmod(workspace, 0o700);
    const target = path.join(workspace, 'database.db');
    await fs.copyFile(file, target, constants.COPYFILE_EXCL);
    await fs.copyFile(file + '.manifest.json', target + '.manifest.json', constants.COPYFILE_EXCL);
    await fs.cp(file + '.assets', target + '.assets', { recursive: true, force: false, errorOnExist: true });
    const restored = await verifyBackupBundle(target, options);
    if (!same(source.tables, restored.tables) || source.assetCount !== restored.assetCount ||
        !same(source.audit, restored.audit) || source.databaseSha256 !== restored.databaseSha256 ||
        source.manifestSha256 !== restored.manifestSha256) throw new Error('Restored snapshot differs from the source bundle');
    const identity = await snapshotFileIdentity(target);
    client = new PrismaClient({ datasourceUrl: `file:${target}` });
    await appendOperationLog(client, {
      operator: 'local-restore-drill', action: 'RESTORE_DRILL', module: 'security',
      summary: '隔离恢复副本的虚构审计追加验证',
    });
    // The continuation is committed. Close its writer before the isolated,
    // read-only full scan; never reserve the live business write queue here.
    await client.$disconnect();
    client = null;
    await waitForSnapshotClose(target, identity);
    const appended = await verifyAuditSnapshot(target);
    if (appended.entryCount !== restored.audit.entryCount + 1 ||
        appended.logCount !== restored.audit.logCount + 1 ||
        appended.baselineCount !== restored.audit.baselineCount ||
        appended.sealedAt !== restored.audit.sealedAt) throw new Error('Restored audit continuation mismatch');
    // The source is only read. Reverify its database, manifest and every asset
    // after the copy/append exercise so no source change can be reported as success.
    const unchanged = await verifyBackupBundle(file, options);
    if (!same(source, unchanged)) throw new Error('Source bundle changed during restore drill');
    report = {
      status: 'verified', startedAt: startedAt.toISOString(),
      snapshotAt: source.snapshotAt, isolated: true, sourceUnchanged: true,
      database: { tableCount: source.tables.length, tableCountsVerified: true },
      assets: { count: source.assetCount, verified: true },
      audit: { ...source.audit, appendVerified: true, appendEntryCount: appended.entryCount, appendHeadHash: appended.headHash },
    };
  } catch (error) {
    if (!error.code?.startsWith('RESTORE_DRILL_')) error.code = 'RESTORE_DRILL_FAILED';
    throw error;
  } finally {
    try { if (client) await client.$disconnect(); }
    finally { if (workspace) await fs.rm(workspace, { recursive: true, force: true }); }
  }
  return { ...report, completedAt: new Date().toISOString(), durationMs: Math.max(0, Date.now() - startedMs), cleanupVerified: true };
}

module.exports = { restoreBackupDrill };
