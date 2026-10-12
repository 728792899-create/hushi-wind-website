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
module.exports = { recordVersionWhere, nextUpdatedAt };
