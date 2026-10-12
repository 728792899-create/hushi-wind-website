const { AsyncLocalStorage } = require('node:async_hooks');
const { runSqliteTransaction } = require('./sqlite-transaction');
const WRITE_METHODS = new Set([
  'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany',
  'updateManyAndReturn', 'upsert', 'delete', 'deleteMany',
]);
const WRITE_RAW_METHODS = new Set(['$executeRaw', '$executeRawUnsafe']);
const TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 15000 };

// Helpers and route handlers share the same transaction without a global mutable client.
function createUnitOfWork(client) {
  const scope = new AsyncLocalStorage();
  const delegates = new Map();
  const prisma = new Proxy(client, {
    get(target, key) {
      const tx = scope.getStore()?.tx;
      const current = tx || target;
      const value = current[key];
      if (!tx && WRITE_RAW_METHODS.has(key))
        return (...args) => {
          const scoped = scope.getStore()?.tx;
          if (scoped) return scoped[key](...args);
          return runSqliteTransaction(client,
            (transactionClient) => transactionClient[key](...args), TRANSACTION_OPTIONS);
        };
      if (!tx && value && typeof value === 'object' &&
          typeof value.findMany === 'function' && typeof value.create === 'function') {
        if (!delegates.has(key)) delegates.set(key, new Proxy(value, {
          get(_delegate, method) {
            // Resolve scope at method access too: a delegate saved outside a
            // transaction must use that transaction when called within it.
            const scoped = scope.getStore()?.tx;
            const delegate = (scoped || client)[key];
            if (!scoped && WRITE_METHODS.has(method))
              return (...args) => {
                // A saved method may be invoked later inside a transaction.
                const activeTx = scope.getStore()?.tx;
                if (activeTx) return activeTx[key][method](...args);
                return runSqliteTransaction(client,
                  (transactionClient) => transactionClient[key][method](...args), TRANSACTION_OPTIONS);
              };
            const operation = delegate[method];
            return typeof operation === 'function' ? operation.bind(delegate) : operation;
          },
        }));
        return delegates.get(key);
      }
      return typeof value === 'function' ? value.bind(current) : value;
    },
  });
  const afterCommit = (task) => {
    const state = scope.getStore();
    if (state) state.tasks.push(task);
    else
      Promise.resolve()
        .then(task)
        .catch((error) =>
          console.warn('Background task failed:', error.code || error.message),
        );
  };
  const handler = (action) => async (req, res, next) => {
    const tasks = [];
    let response;
    const staged = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        response = { status: this.statusCode, body };
        return this;
      },
    };
    try {
      await runSqliteTransaction(client,
        async (tx) => {
          await scope.run({ tx, tasks }, () => action(req, staged));
          if (!response)
            throw new Error('Transactional handler did not produce a response');
        },
        TRANSACTION_OPTIONS,
      );
      res.status(response.status).json(response.body);
      for (const task of tasks) afterCommit(task);
    } catch (error) {
      next(error);
    }
  };
  const transaction = async (action) => {
    if (scope.getStore()) return action();
    const tasks = [];
    const result = await runSqliteTransaction(client,
      (tx) => scope.run({ tx, tasks }, action),
      TRANSACTION_OPTIONS,
    );
    for (const task of tasks) afterCommit(task);
    return result;
  };
  return { prisma, handler, afterCommit, transaction };
}
module.exports = { createUnitOfWork };
