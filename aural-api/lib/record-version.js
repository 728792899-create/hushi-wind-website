// Call inside the write transaction. Dates are the revision returned by list/detail APIs.
function recordVersionWhere(req, current) {
  const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
  if (!current) fail(404, 'NOT_FOUND', '记录不存在');
  const expected = req.headers['if-match'] || (current.revision !== undefined ? req.body?.revision : req.body?.updatedAt);
  if (expected === undefined || expected === null || expected === '') fail(428, 'VERSION_REQUIRED', '请重新打开记录后保存；当前输入尚未保存');
  const revision = current.revision !== undefined ? String(current.revision) : new Date(current.updatedAt).toISOString();
  if (String(expected).replace(/^"|"$/g, '') !== revision)
    fail(409, 'RECORD_CHANGED', '其他管理员已更新这条记录，请保留当前输入，重新打开最新记录并核对后再保存');
  return current.revision !== undefined ? { id: current.id, revision: current.revision } : { id: current.id, updatedAt: current.updatedAt };
}
const nextUpdatedAt = current => new Date(Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1));

// The check above and the write happen in one transaction, but a concurrent writer can still
// change the row in between; the conditional where then matches nothing (P2025).
async function updateWithVersion(delegate, where, data) {
  try {
    return await delegate.update({ where, data });
  } catch (error) {
    if (error?.code !== 'P2025') throw error;
    throw Object.assign(new Error('其他管理员已更新这条记录，请保留当前输入，重新打开最新记录并核对后再保存'), { status: 409, code: 'RECORD_CHANGED' });
  }
}

// Every write path to these models (direct save, draft publish, history/recycle restore, resource
// replacement) bumps `revision`, so a form opened earlier cannot silently overwrite it. Inquiry is
// excluded: marking it read must not invalidate the follow-up form; its PUT increments explicitly.
const REVISIONED_MODELS = new Set(['Article', 'Artist', 'SystemConfig', 'SupportFaq', 'SupportDownload', 'AudioSolution', 'AudioStat', 'BrandTimeline', 'EcosystemService', 'QuickGuide', 'PageContent']);
const bump = (data) => ({ ...data, revision: { increment: 1 } });
const withContentRevision = (client) =>
  client.$extends({
    name: 'content-revision',
    query: {
      $allModels: {
        update({ model, args, query }) {
          return query(REVISIONED_MODELS.has(model) ? { ...args, data: bump(args.data) } : args);
        },
        updateMany({ model, args, query }) {
          return query(REVISIONED_MODELS.has(model) ? { ...args, data: bump(args.data) } : args);
        },
        upsert({ model, args, query }) {
          return query(REVISIONED_MODELS.has(model) ? { ...args, update: bump(args.update) } : args);
        },
      },
    },
  });

module.exports = { recordVersionWhere, nextUpdatedAt, updateWithVersion, withContentRevision, REVISIONED_MODELS };
