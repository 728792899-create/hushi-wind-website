const {notificationPayload,assertWebhookAccepted}=require('./webhook-protocol');
function createNotificationWorker(db, { url = '', provider = 'generic', fetchImpl = fetch, isPaused = () => false } = {}) {
  let busy = false;
  async function run() {
    if (busy || !url || isPaused()) return;
    busy = true;
    try {
      const rows = await db.notificationDelivery.findMany({
        where: {
          status: { in: ['pending', 'retry'] },
          nextAttemptAt: { lte: new Date() },
        },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });
      for (const row of rows) {
        if (isPaused()) break;
        const claim = await db.notificationDelivery.updateMany({
          where: { id: row.id, status: row.status, attempts: row.attempts },
          data: {
            status: 'sending',
            attempts: { increment: 1 },
            nextAttemptAt: new Date(Date.now() + 60000),
          },
        });
        if (!claim.count) continue;
        if (isPaused()) { await db.notificationDelivery.update({ where: { id: row.id }, data: { status: row.status, attempts: row.attempts, nextAttemptAt: row.nextAttemptAt } }); break; }
        try {
          const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(notificationPayload(provider, JSON.parse(row.payload))),
            signal: AbortSignal.timeout(10000),
          });
          await assertWebhookAccepted(response, provider);
          await db.notificationDelivery.update({
            where: { id: row.id },
            data: { status: 'sent', error: null },
          });
        } catch (error) {
          const attempts = row.attempts + 1;
          await db.notificationDelivery.update({
            where: { id: row.id },
            data: {
              status: attempts >= 5 ? 'failed' : 'retry',
              error: String(error.message).slice(0, 300),
              nextAttemptAt: new Date(
                Date.now() + Math.min(3600000, 30000 * 2 ** attempts),
              ),
            },
          });
        }
      }
      await db.notificationDelivery.updateMany({
        where: { status: 'sending', nextAttemptAt: { lt: new Date() } },
        data: { status: 'retry' },
      });
    } finally {
      busy = false;
    }
  }
  return { run };
}
module.exports = { createNotificationWorker };
