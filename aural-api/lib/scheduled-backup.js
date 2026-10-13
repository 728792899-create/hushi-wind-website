const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createDatabaseBackup, verifyBackupBundle, pruneBackups } = require('./database-backup');

const FAILURE_MESSAGES = {
  backup: '自动备份失败，请检查磁盘空间、目录权限、素材及审计完整性',
  retention: '自动备份已创建并校验通过，但过期备份清理失败，请检查目录权限及磁盘状态',
};

function createBackupScheduler(db, {
  source, uploadsRoot, backupRoot, isPaused = () => false,
  create = createDatabaseBackup, verify = verifyBackupBundle, prune = pruneBackups,
  onFailure = async () => {},
}) {
  let busy = false;

  async function reportFailure(phase, filename) {
    const message = FAILURE_MESSAGES[phase];
    const reports = [];
    if (phase === 'backup') reports.push(['backup history', () => db.backupRecord.create({ data: {
      filename, size: 0, operator: 'scheduled', status: 'failed', message,
    } })]);
    reports.push(['maintenance history', () => db.maintenanceRun.create({ data: {
      task: phase === 'backup' ? 'scheduled-backup' : 'backup-retention',
      status: 'failed', details: message,
    } })]);
    // Only a generated basename and fixed messages leave this module. Never
    // persist or forward filesystem paths, credentials or raw exception text.
    reports.push(['alert callback', () => onFailure({ phase, filename, message })]);
    for (const [name, report] of reports) {
      try { await report(); }
      catch { console.warn(`Scheduled backup failure reporting unavailable: ${name}`); }
    }
  }

  async function run() {
    if (busy || isPaused()) return { skipped: true };
    busy = true;
    const filename = `database.scheduled.${new Date().toISOString().replace(/[:.]/g, '-')}.${randomUUID()}.db`;
    let phase = 'backup';
    try {
      const last = await db.backupRecord.findFirst({
        where: { status: 'success', operator: 'scheduled' }, orderBy: { createdAt: 'desc' },
      });
      if (last && Date.now() - new Date(last.createdAt).getTime() < 86400000) {
        try {
          await verify(path.join(backupRoot, last.filename), { requireAssets: true });
          return { skipped: true };
        } catch { /* Missing/corrupt recovery point: create a replacement now. */ }
      }
      if (isPaused()) return { skipped: true };
      const destination = path.join(backupRoot, filename);
      const result = await create(source, destination, { uploadsRoot, requireAssets: true });
      await verify(destination, { requireAssets: true });
      await db.backupRecord.create({ data: {
        filename, size: result.size, operator: 'scheduled', status: 'success',
        message: '每日自动备份，数据库与素材校验通过',
      } });
      // Retention is a separate operation: a failure here must not reclassify
      // the recovery point that has already been verified and recorded.
      phase = 'retention';
      if (!isPaused()) await prune(backupRoot, Number(process.env.BACKUP_RETENTION_DAYS) || 14);
      return { filename };
    } catch (error) {
      await reportFailure(phase, filename);
      throw error;
    } finally {
      busy = false;
    }
  }
  return { run };
}

module.exports = { createBackupScheduler };
