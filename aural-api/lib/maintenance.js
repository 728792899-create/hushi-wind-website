const days = (value, fallback) =>
  Number.isFinite(Number(value)) && Number(value) >= 1
    ? Math.floor(Number(value))
    : fallback;
const cutoff = (n) => new Date(Date.now() - n * 86400000);
async function runMaintenance(db, backupRoot) {
  const latest = await db.maintenanceRun.findFirst({
    where: { task: 'retention', status: 'success' },
    orderBy: { createdAt: 'desc' },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < 86400000)
    return { skipped: true };
  try {
    const result = await db.$transaction(async (tx) => {
      const out = {};
      for (const [model, n, extra] of [
        ['analyticsEvent', days(process.env.ANALYTICS_RETENTION_DAYS, 180), {}],
        ['apiRequestLog', days(process.env.API_LOG_RETENTION_DAYS, 90), {}],
        ['loginRecord', 180, {}],
        ['alertRecord', 180, { status: 'resolved' }],
        ['submissionReceipt', 30, {}],
        ['notificationDelivery', 90, { status: 'sent' }],
      ]) {
        out[model] = (
          await tx[model].deleteMany({
            where: { createdAt: { lt: cutoff(n) }, ...extra },
          })
        ).count;
      }
      return out;
    });
    await db.maintenanceRun.create({
      data: {
        task: 'retention',
        status: 'success',
        details: JSON.stringify(result),
      },
    });
    return result;
  } catch (error) {
    await db.maintenanceRun.create({
      data: {
        task: 'retention',
        status: 'failed',
        details: String(error.code || error.message).slice(0, 400),
      },
    });
    throw error;
  }
}
module.exports = { runMaintenance };
