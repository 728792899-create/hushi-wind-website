// Test-only observation and IPC barriers around real work in the actual main
// process. No production endpoint, clock override or replacement database I/O.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const apiRoot = path.resolve(__dirname, '../..');
const root = process.env.SHUTDOWN_FIXTURE_ROOT;
if (!root || !process.send) throw new Error('Shutdown preload requires an isolated IPC fixture');
const eventFile = path.join(root, 'events.jsonl');
function event(type, details = {}) {
  const row = { type, ...details };
  fs.appendFileSync(eventFile, JSON.stringify(row) + '\n');
  if (process.connected) process.send(row, () => {});
}
// Fixture environments are explicit; do not inherit an operator's .env file.
require(path.join(apiRoot, 'scripts/load-env')).loadEnvFile = () => false;
let armed = process.env.SHUTDOWN_FIXTURE_GATE || null;
let releaseGate;
async function gate(kind, details = {}) {
  if (armed !== kind) return;
  armed = null;
  await new Promise((resolve, reject) => {
    releaseGate = (fail) => fail
      ? reject(Object.assign(new Error('Synthetic copy failure'), { code: 'FIXTURE_COPY_FAILED' }))
      : resolve();
    event('gate', { kind, ...details });
  });
  event('released', { kind });
}
const intervals = new Map();
const nativeInterval = global.setInterval;
const nativeClear = global.clearInterval;
let timerId = 0;
global.setInterval = (callback, delay, ...args) => {
  const handle = nativeInterval(callback, delay, ...args);
  if ([30000, 60000, 3600000].includes(delay)) {
    intervals.set(handle, { id: ++timerId, delay, callback, args, cleared: false });
    event('timer-created', { id: timerId, delay });
  }
  return handle;
};
global.clearInterval = (handle) => {
  if (intervals.has(handle)) {
    intervals.get(handle).cleared = true;
    event('timer-cleared', { id: intervals.get(handle).id });
  }
  return nativeClear(handle);
};
process.on('message', (message) => {
  if (message?.command === 'arm') armed = message.kind;
  if (message?.command === 'release') { releaseGate?.(message.fail); releaseGate = null; }
  // Simulate a callback already queued when clearInterval ran. The actual
  // scheduler callback must check stopped state before beginning more work.
  if (message?.command === 'tick') {
    for (const timer of intervals.values()) timer.callback(...timer.args);
  }
  if (message?.id) event('ack', { id: message.id });
});
process.channel?.unref();
process.on('exit', (code) => event('exit', {
  code, remainingTimers: [...intervals.values()].filter(timer => !timer.cleared).map(timer => timer.id),
}));

const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  this.once('listening', () => event('listening', { port: this.address().port }));
  return listen.apply(this, args);
};
const close = http.Server.prototype.close;
http.Server.prototype.close = function (...args) {
  event('ingress-closed');
  return close.apply(this, args);
};

const audit = require(path.join(apiRoot, 'lib/audit-integrity'));
const initialize = audit.initializeAuditIntegrity;
audit.initializeAuditIntegrity = async (...args) => {
  event('initializing');
  const result = await initialize(...args);
  await gate('initialization');
  event('initialized');
  return result;
};
const scheduler = require(path.join(apiRoot, 'lib/scheduled-backup'));
const createScheduler = scheduler.createBackupScheduler;
scheduler.createBackupScheduler = (...args) => {
  const instance = createScheduler(...args);
  const run = instance.run;
  instance.run = async (...runArgs) => {
    event('background-start', { task: 'backup' });
    try { return await run(...runArgs); }
    finally { event('background-done', { task: 'backup' }); }
  };
  return instance;
};
const maintenance = require(path.join(apiRoot, 'lib/maintenance'));
const runMaintenance = maintenance.runMaintenance;
maintenance.runMaintenance = async (...args) => {
  event('background-start', { task: 'maintenance' });
  try { return await runMaintenance(...args); }
  finally { event('background-done', { task: 'maintenance' }); }
};

const cp = fsp.cp;
fsp.cp = async (source, destination, ...args) => {
  const target = String(destination);
  const kind = target.includes(`${path.sep}restore-checks${path.sep}`) ? 'restore'
    : target.includes(`${path.sep}.backup-`) ? 'backup' : null;
  if (kind) await gate(kind, { destination: target });
  return cp(source, destination, ...args);
};

const uow = require(path.join(apiRoot, 'lib/unit-of-work'));
const createUnitOfWork = uow.createUnitOfWork;
uow.createUnitOfWork = (client, ...options) => {
  const disconnect = client.$disconnect.bind(client);
  client.$disconnect = async () => {
    event('disconnecting');
    await disconnect();
    event('disconnected');
  };
  const transaction = client.$transaction.bind(client);
  client.$transaction = (action, ...args) => transaction(typeof action !== 'function' ? action : async (tx) => {
    const wrapped = new Proxy(tx, {
      get(target, key) {
        if (key !== 'exportRecord') return Reflect.get(target, key);
        return new Proxy(target.exportRecord, {
          get(delegate, method) {
            if (method !== 'create') return Reflect.get(delegate, method);
            return async (input) => {
              const row = await delegate.create(input);
              await gate('transaction', { filename: row.filename });
              return row;
            };
          },
        });
      },
    });
    return action(wrapped);
  }, ...args);
  const unit = createUnitOfWork(client, ...options);
  const handler = unit.handler;
  unit.handler = (action) => {
    const wrapped = handler(action);
    return (req, res, next) => {
      if (req.path === '/api/admin/export-records') event('write-entered', { filename: req.body?.filename });
      return wrapped(req, res, next);
    };
  };
  return unit;
};
