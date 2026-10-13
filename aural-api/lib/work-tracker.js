// Admission control belongs to the HTTP/background entry points. Work already
// accepted may register child tasks while shutdown is draining this tracker.
function createWorkTracker() {
  const labels = new Map();
  const idleWaiters = new Set();
  let total = 0;

  function begin(label) {
    const name = String(label || 'work');
    total++;
    labels.set(name, (labels.get(name) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      total--;
      const count = labels.get(name) - 1;
      if (count) labels.set(name, count);
      else labels.delete(name);
      if (!total) {
        for (const resolve of idleWaiters) resolve();
        idleWaiters.clear();
      }
    };
  }

  function track(label, action) {
    const release = begin(label);
    let promise;
    try { promise = Promise.resolve(action()); }
    catch (error) { promise = Promise.reject(error); }
    // Observe both outcomes without a discarded rejecting finally() promise.
    // Return the original promise so its result/rejection remains available.
    promise.then(release, release);
    return promise;
  }

  async function drain() {
    // A settled parent may have registered more work. Recheck after each wake,
    // rather than waiting for only the promises present at the start of drain.
    while (total) await new Promise((resolve) => idleWaiters.add(resolve));
  }

  const snapshot = () => ({ total, byLabel: Object.fromEntries(labels) });
  return { track, begin, drain, snapshot };
}

module.exports = { createWorkTracker };
