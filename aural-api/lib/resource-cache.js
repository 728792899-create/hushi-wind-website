// One rebuild per cache, with a bounded retry when a committed write overtakes it.
// A result from an older generation is never published as the current snapshot.
function createResourceCache({ load, ttl, now = Date.now, maxAttempts = 2 }) {
  let revision = 0, entry = null, pending = null;
  const invalidate = () => { revision++; entry = null; };
  const get = async () => {
    let status = 'hit';
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (entry && entry.revision === revision && entry.expiresAt > now())
        return { value: entry.value, status };
      status = pending ? 'shared' : 'miss';
      if (!pending) {
        const startedRevision = revision;
        const task = Promise.resolve().then(load).then(value => {
          const result = { revision: startedRevision, value, expiresAt: now() + ttl };
          if (startedRevision === revision) entry = result;
          return result;
        });
        pending = task;
        task.finally(() => { if (pending === task) pending = null; }).catch(() => {});
      }
      let result;
      try { result = await pending; }
      catch (error) {
        if (error.code !== 'RESOURCE_INVENTORY_CHANGED') throw error;
        continue;
      }
      if (result.revision === revision) return { value: result.value, status };
    }
    throw Object.assign(new Error('素材正在更新，请稍后刷新'), {
      status: 503, code: 'RESOURCE_INVENTORY_CHANGED',
    });
  };
  return { get, invalidate };
}

// Parsing image headers is expensive relative to stat. Reuse metadata only when
// the file's identity and modification metadata are unchanged. This cache is
// process-local; a new process always observes the current files.
function createFileRecordCache({ read, stat }) {
  const records = new Map();
  return {
    async get(file) {
      const info = await stat(file);
      const identity = [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':');
      const prior = records.get(file);
      if (prior?.identity === identity) return prior.value;
      const value = await read(file, info);
      records.set(file, { identity, value });
      return value;
    },
    retain(files) {
      const keep = new Set(files);
      for (const file of records.keys()) if (!keep.has(file)) records.delete(file);
    },
  };
}

async function mapLimited(items, concurrency, action) {
  const results = new Array(items.length);
  let next = 0;
  const settled = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await action(items[index], index);
    }
  }));
  const failed = settled.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results;
}

module.exports = { createResourceCache, createFileRecordCache, mapLimited };
