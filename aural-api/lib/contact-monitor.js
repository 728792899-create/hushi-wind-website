const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// Counts committed audit events, shared across sessions, IPs and API processes.
// Called in the reveal transaction after the audit append obtains the write lock.
async function monitorContactAccess(db, admin, createAlert, now = new Date()) {
  const windowMs = positiveInteger(process.env.CONTACT_VIEW_WINDOW_MS, 600000);
  const threshold = positiveInteger(process.env.CONTACT_VIEW_ALERT_THRESHOLD, 30);
  const since = new Date(now.getTime() - windowMs);
  const count = await db.operationLog.count({
    where: { adminUserId: admin.id, action: 'VIEW_CONTACT', createdAt: { gte: since } },
  });
  if (count < threshold) return;
  const title = `联系方式查看频繁（账号 ${admin.id}）`;
  const recent = await db.alertRecord.findFirst({
    where: { type: 'contact_view_frequency', title, createdAt: { gte: since } },
    select: { id: true },
  });
  if (recent) return;
  await createAlert({
    level: 'warning', type: 'contact_view_frequency', title,
    message: `账号 ${admin.username} 在最近 ${Math.ceil(windowMs / 60000)} 分钟查看了 ${count} 次联系方式；仅告警，未阻断查看。`,
    metadata: { adminUserId: admin.id, username: admin.username, count, windowMs, threshold },
  });
}

module.exports = { monitorContactAccess };
