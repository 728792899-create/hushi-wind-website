const { AsyncLocalStorage } = require('node:async_hooks');

// Helpers and route handlers share the same transaction without a global mutable client.
function createUnitOfWork(client) {
  const scope = new AsyncLocalStorage();
  const prisma = new Proxy(client, {
    get(target, key) {
      const current = scope.getStore()?.tx || target;
      const value = current[key];
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
      await client.$transaction(
        async (tx) => {
          await scope.run({ tx, tasks }, () => action(req, staged));
          if (!response)
            throw new Error('Transactional handler did not produce a response');
        },
        { maxWait: 10000, timeout: 15000 },
      );
      res.status(response.status).json(response.body);
      for (const task of tasks) afterCommit(task);
    } catch (error) {
      next(error);
    }
  };
  const transaction = async (action) => {
    const tasks = [];
    const result = await client.$transaction(
      (tx) => scope.run({ tx, tasks }, action),
      { maxWait: 10000, timeout: 15000 },
    );
    for (const task of tasks) afterCommit(task);
    return result;
  };
  return { prisma, handler, afterCommit, transaction };
}
module.exports = { createUnitOfWork };
