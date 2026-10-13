const DEFAULT_AUDIT_VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TASK = 'scheduled-audit';
const FAILURE_MESSAGE = '周期审计完整性核验未完成或未通过，请检查审计记录、磁盘空间及数据库状态；未自动重签记录';

function auditVerifyInterval(value = DEFAULT_AUDIT_VERIFY_INTERVAL_MS) {
  const interval = Number(value);
  if (!Number.isSafeInteger(interval) || interval < 1000 || interval > 7 * 86400000)
    throw new Error('AUDIT_VERIFY_INTERVAL_MS must be an integer from 1000 to 604800000');
  return interval;
}

function createAuditScheduler(db, { verify, intervalMs = DEFAULT_AUDIT_VERIFY_INTERVAL_MS,
  isPaused = () => false, onFailure = async () => {}, now = Date.now }) {
  const interval = auditVerifyInterval(intervalMs);
  let busy = false;
  async function run() {
    if (busy || isPaused()) return { skipped: true };
    busy = true;
    let record;
    const started = now();
    try {
      const last = await db.maintenanceRun.findFirst({ where: { task: TASK }, orderBy: { id: 'desc' } });
      // A completed attempt survives restarts. An interrupted run is retained
      // as unfinished evidence and retried; it must never masquerade as a pass.
      if (last && last.status !== 'running' && started - new Date(last.createdAt).getTime() < interval)
        return { skipped: true };
      if (isPaused()) return { skipped: true };
      record = await db.maintenanceRun.create({ data: {
        task: TASK, status: 'running', details: '周期审计核验进行中或尚未完成', createdAt: new Date(started),
      } });
      const result = await verify();
      const durationMs = Math.max(0, now() - started);
      await db.maintenanceRun.update({ where: { id: record.id }, data: {
        status: 'success', details: `周期审计通过：${result.logCount} 条记录（历史 ${result.baselineCount}、链 ${result.entryCount}）；耗时 ${durationMs} 毫秒。仅核验快照时点，未自动重签。`,
      } });
      return { ...result, durationMs };
    } catch (error) {
      const details = FAILURE_MESSAGE;
      try {
        if (record) await db.maintenanceRun.update({ where: { id: record.id }, data: { status: 'failed', details } });
        else await db.maintenanceRun.create({ data: { task: TASK, status: 'failed', details, createdAt: new Date(started) } });
      } catch { console.warn('Scheduled audit result persistence unavailable'); }
      try { await onFailure({ message: details }); }
      catch { console.warn('Scheduled audit alert persistence unavailable'); }
      throw error;
    } finally { busy = false; }
  }
  return { run, intervalMs: interval };
}

module.exports = { createAuditScheduler, auditVerifyInterval, DEFAULT_AUDIT_VERIFY_INTERVAL_MS };
