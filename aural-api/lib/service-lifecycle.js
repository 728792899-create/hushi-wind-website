const http = require('node:http');
const { whenSqliteIdle } = require('./sqlite-transaction');

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 60000;
function shutdownTimeout(value = DEFAULT_SHUTDOWN_TIMEOUT_MS) {
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300000)
    throw new Error('SHUTDOWN_TIMEOUT_MS must be an integer from 1 to 300000');
  return timeout;
}

// Stop producers first. Accepted work may still register logs, afterCommit
// callbacks and compensating writes while drain is waiting for its parents.
function createServiceLifecycle({ app, work, initialize, startBackground,
  disconnect, port, host, timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  report = () => {} }) {
  const budget = shutdownTimeout(timeoutMs);
  let state = 'starting', binding, stopping, stopBackground = () => {};
  const server = http.createServer((req, res) => {
    if (state !== 'ready') {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': '5', Connection: 'close', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ success: false, error: {
        code: state === 'starting' ? 'SERVICE_STARTING' : 'SERVICE_STOPPING',
        message: '服务正在启动或停止，请稍后重试',
      } }));
    }
    const release = work.begin('http');
    // finish listeners synchronously register response-following work.
    res.once('finish', release);
    res.once('close', release);
    app(req, res);
  });

  const stop = (reason = 'shutdown') => {
    if (stopping) return stopping;
    state = 'draining';
    report('draining', { reason });
    let stopError;
    try { stopBackground(); } catch (error) { stopError = error; }
    let deadline;
    const cleanup = async () => {
      // A signal can arrive before the asynchronous listening event.
      if (binding) await binding.catch(() => {});
      const closed = new Promise((resolve, reject) => {
        server.close((error) => error && error.code !== 'ERR_SERVER_NOT_RUNNING'
          ? reject(error) : resolve());
        server.closeIdleConnections();
      });
      await Promise.all([closed, work.drain()]);
      await whenSqliteIdle();
      await disconnect();
      if (stopError) throw stopError;
    };
    stopping = Promise.race([
      cleanup(),
      new Promise((_, reject) => {
        deadline = setTimeout(() => {
          const error = new Error('Graceful shutdown deadline exceeded; work was not fully drained');
          error.code = 'SHUTDOWN_TIMEOUT';
          reject(error);
        }, budget);
      }),
    ]).then(() => {
      state = 'stopped';
      report('stopped');
    }, (error) => {
      state = 'failed';
      server.closeAllConnections();
      report('shutdown_failed', { code: error.code || 'SHUTDOWN_FAILED', work: work.snapshot() });
      throw error;
    }).finally(() => clearTimeout(deadline));
    return stopping;
  };

  const start = async () => {
    try {
      binding = new Promise((resolve, reject) => {
        const failed = (error) => { server.off('listening', ready); reject(error); };
        const ready = () => { server.off('error', failed); resolve(); };
        server.once('error', failed);
        server.once('listening', ready);
        server.listen(port, host);
      });
      await binding;
      if (state !== 'starting') return;
      await work.track('initialization', initialize);
      if (state !== 'starting') return;
      stopBackground = startBackground();
      state = 'ready';
      report('ready', { port: server.address().port });
    } catch (error) {
      await stop('startup_failed');
      throw error;
    }
  };
  return { server, start, stop, get state() { return state; } };
}

module.exports = { createServiceLifecycle, shutdownTimeout, DEFAULT_SHUTDOWN_TIMEOUT_MS };
