const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runSqliteTransaction } = require('./sqlite-transaction');

const VERSION = 1;
const BATCH_SIZE = 500;
const FIELDS = [
  'id', 'adminUserId', 'operator', 'role', 'action', 'module', 'target',
  'targetId', 'summary', 'beforeData', 'afterData', 'ip', 'userAgent', 'createdAt',
];
const migration = fs.readFileSync(path.join(__dirname,
  '../prisma/migrations/20261012170000_audit_integrity_and_inquiry_scope/migration.sql'), 'utf8');
const guards = [...migration.matchAll(/CREATE TRIGGER "([^"]+)"[\s\S]*? END;/g)]
  .map(([sql, name]) => ({ name, sql }));
const normalizeSql = (value) => value.trim().replace(/;$/, '').replace(/\s+/g, ' ');

function integrityError(reason) {
  const error = new Error(`Audit integrity verification failed: ${reason}`);
  error.code = 'AUDIT_INTEGRITY_FAILED';
  return error;
}
function ensure(condition, reason) {
  if (!condition) throw integrityError(reason);
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const rowPayload = (row) => JSON.stringify(FIELDS.map((key) =>
  row[key] instanceof Date ? row[key].toISOString() : row[key] ?? null));
const rowDigest = (row) => sha256(`hushi-audit-row-v1\n${rowPayload(row)}`);
const entryDigest = (entry) => sha256(JSON.stringify([
  'hushi-audit-chain-v1', entry.sequence, entry.operationLogId,
  entry.previousHash, entry.rowHash,
]));

// The unit-of-work proxy exposes the current transaction client. Prisma's
// transaction client has no $transaction, so nested business writes stay atomic.
async function inTransaction(db, action) {
  return runSqliteTransaction(db, action, { maxWait: 10000, timeout: 30000 });
}
async function lockState(db) {
  // Acquire SQLite's writer lock before any reads; two writers cannot derive
  // the same chain head. A no-op update does not change the persisted baseline.
  const count = await db.$executeRaw`UPDATE "AuditIntegrityState" SET "id" = "id" WHERE "id" = 1`;
  ensure(count === 1, 'state is missing; do not recreate or reseal it');
  return db.auditIntegrityState.findUnique({ where: { id: 1 } });
}
async function checkGuards(db) {
  const rows = await db.$queryRaw`SELECT name, sql FROM sqlite_master WHERE type = 'trigger'`;
  const byName = new Map(rows.map((row) => [row.name, normalizeSql(row.sql)]));
  for (const guard of guards)
    ensure(byName.get(guard.name) === normalizeSql(guard.sql), `database guard missing or changed: ${guard.name}`);
}
async function baselineDigest(db, state) {
  const digest = createHash('sha256').update(JSON.stringify([
    'hushi-audit-baseline-v1', state.version, state.baselineCount,
    state.baselineMaxId, state.sealedAt.toISOString(),
  ]) + '\n');
  let lastId = 0, count = 0;
  while (true) {
    const rows = await db.operationLog.findMany({
      where: { id: { gt: lastId, lte: state.baselineMaxId } },
      orderBy: { id: 'asc' }, take: BATCH_SIZE,
    });
    if (!rows.length) break;
    for (const row of rows) digest.update(rowPayload(row) + '\n');
    count += rows.length;
    lastId = rows.at(-1).id;
  }
  ensure(count === state.baselineCount && lastId === state.baselineMaxId,
    'historical row count or boundary changed');
  return digest.digest('hex');
}
async function sealBaseline(db, state) {
  ensure(state?.version === VERSION, 'state missing or unsupported version');
  if (state.baselineHash !== null) {
    ensure(state.sealedAt && state.headHash, 'incomplete seal');
    return state;
  }
  ensure(!state.sealedAt && !state.headHash && state.entryCount === 0 &&
    state.lastLogId === state.baselineMaxId, 'invalid unsealed state');
  ensure(await db.auditLogEntry.count() === 0, 'chain exists without its seal');
  ensure(await db.operationLog.count() === state.baselineCount,
    'unsigned rows were added after the migration boundary');
  const sealed = { ...state, sealedAt: new Date() };
  const baselineHash = await baselineDigest(db, sealed);
  return db.auditIntegrityState.update({
    where: { id: 1 }, data: { sealedAt: sealed.sealedAt, baselineHash, headHash: baselineHash },
  });
}

async function checkHead(db, state, { checkCounts = true } = {}) {
  ensure(state && state.version === VERSION && state.baselineHash && state.sealedAt,
    'baseline is not sealed');
  const [lastLog, lastEntry] = await Promise.all([
    db.operationLog.findFirst({ orderBy: { id: 'desc' } }),
    db.auditLogEntry.findFirst({ orderBy: { sequence: 'desc' } }),
  ]);
  if (checkCounts) {
    const [count, entryCount] = await Promise.all([db.operationLog.count(), db.auditLogEntry.count()]);
    ensure(count === state.baselineCount + state.entryCount, 'log count changed or unsigned rows exist');
    ensure(entryCount === state.entryCount, 'chain entries missing or unexpected');
  }
  ensure((lastLog?.id || 0) === state.lastLogId, 'log tail changed');
  if (!state.entryCount) {
    ensure(!lastEntry && state.lastLogId === state.baselineMaxId && state.headHash === state.baselineHash,
      'baseline head changed');
    return;
  }
  ensure(lastEntry?.sequence === state.entryCount && lastEntry.operationLogId === state.lastLogId &&
    lastEntry.hash === state.headHash, 'chain head changed');
  ensure(lastEntry.rowHash === rowDigest(lastLog) && lastEntry.hash === entryDigest(lastEntry),
    'latest log or entry changed');
}

async function verifyInTransaction(db, { checkDatabaseGuards = true } = {}) {
  if (checkDatabaseGuards) await checkGuards(db);
  const state = await db.auditIntegrityState.findUnique({ where: { id: 1 } });
  await checkHead(db, state);
  ensure(await baselineDigest(db, state) === state.baselineHash, 'historical baseline digest mismatch');
  let previousHash = state.baselineHash, lastId = state.baselineMaxId, sequence = 0;
  while (sequence < state.entryCount) {
    const entries = await db.auditLogEntry.findMany({
      where: { sequence: { gt: sequence } }, orderBy: { sequence: 'asc' }, take: BATCH_SIZE,
    });
    ensure(entries.length, 'chain is truncated');
    const rows = await db.operationLog.findMany({ where: { id: { in: entries.map((entry) => entry.operationLogId) } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const entry of entries) {
      const row = byId.get(entry.operationLogId);
      ensure(entry.sequence === sequence + 1 && entry.operationLogId > lastId && row,
        'chain order or referenced log changed');
      ensure(entry.previousHash === previousHash && entry.rowHash === rowDigest(row) &&
        entry.hash === entryDigest(entry), `digest mismatch at entry ${entry.sequence}`);
      sequence = entry.sequence;
      lastId = entry.operationLogId;
      previousHash = entry.hash;
    }
  }
  ensure(previousHash === state.headHash && lastId === state.lastLogId, 'final head mismatch');
  return {
    ok: true, version: state.version, baselineCount: state.baselineCount,
    baselineMaxId: state.baselineMaxId, sealedAt: state.sealedAt.toISOString(),
    entryCount: state.entryCount, logCount: state.baselineCount + state.entryCount,
    headHash: state.headHash,
  };
}

async function initializeAuditIntegrity(db) {
  return inTransaction(db, async (tx) => {
    const state = await lockState(tx);
    await checkGuards(tx);
    await sealBaseline(tx, state);
    return verifyInTransaction(tx, { checkDatabaseGuards: false });
  });
}
// This operation is read-only; the transaction supplies a consistent snapshot
// while another process appends. It never seals/reseals or repairs any data.
async function verifyAuditIntegrity(db) {
  return inTransaction(db, verifyInTransaction);
}
async function appendOperationLog(db, data) {
  return inTransaction(db, async (tx) => {
    let state = await lockState(tx);
    if (state?.baselineHash === null) {
      await checkGuards(tx);
      state = await sealBaseline(tx, state);
    }
    // Full historical verification belongs at startup/explicit checks. Append
    // checks the indexed tails without scanning COUNT(*) or re-hashing history.
    // Interior tampering after privileged trigger removal is detected by full
    // verification at startup or on demand, not by this bounded append check.
    await checkHead(tx, state, { checkCounts: false });
    const row = await tx.operationLog.create({ data });
    const entry = {
      sequence: state.entryCount + 1, operationLogId: row.id,
      previousHash: state.headHash, rowHash: rowDigest(row),
    };
    ensure(row.id > state.lastLogId, 'new log ID must increase');
    entry.hash = entryDigest(entry);
    await tx.auditLogEntry.create({ data: entry });
    await tx.auditIntegrityState.update({
      where: { id: 1 },
      data: { entryCount: entry.sequence, lastLogId: row.id, headHash: entry.hash },
    });
    return row;
  });
}

module.exports = { appendOperationLog, initializeAuditIntegrity, verifyAuditIntegrity };
