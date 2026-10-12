// This application uses one SQLite database per process. SQLite permits one
// writer, so enter interactive transactions in one process-wide FIFO, shared by
// every Prisma client (including API instances and audit verification). Otherwise
// blocking SQLite busy waits can occupy all Prisma engine workers on small hosts
// while the transaction holding the lock needs those same workers to commit.
// The database lock remains authoritative across processes. Never replay a
// callback: it may have performed non-database work before a transaction failed.
const pending = [];
const MAX_PENDING = 256;
let active = false;

function queueError(code) {
  const error = new Error('数据库操作繁忙，请稍后重试');
  error.code = code;
  error.status = 503;
  return error;
}
function drain() {
  if (active || !pending.length) return;
  const job = pending.shift();
  clearTimeout(job.timer);
  active = true;
  const finish = (settle, value) => {
    active = false;
    settle(value);
    drain();
  };
  Promise.resolve()
    .then(() => job.db.$transaction(job.action, job.options))
    .then((value) => finish(job.resolve, value), (error) => finish(job.reject, error));
}
function runSqliteTransaction(db, action, options = {}) {
  // Prisma transaction clients omit $transaction. Reuse the current transaction
  // without queuing behind itself; unit-of-work scopes retain their own tasks.
  if (typeof db.$transaction !== 'function') return Promise.resolve().then(() => action(db));
  if (pending.length >= MAX_PENDING)
    return Promise.reject(queueError('SQLITE_TRANSACTION_QUEUE_FULL'));
  const waitMs = Number.isFinite(options.maxWait) && options.maxWait >= 0
    ? options.maxWait : 10000;
  return new Promise((resolve, reject) => {
    const job = { db, action, options, resolve, reject, timer: null };
    job.timer = setTimeout(() => {
      const index = pending.indexOf(job);
      if (index === -1) return;
      pending.splice(index, 1);
      reject(queueError('SQLITE_TRANSACTION_QUEUE_TIMEOUT'));
    }, waitMs);
    pending.push(job);
    drain();
  });
}

module.exports = { runSqliteTransaction };
