const fs = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { runSqliteExclusive } = require('./sqlite-transaction');
const { verifyAuditSnapshot } = require('./audit-integrity');

// The caller supplies its existing private backup/scratch root. There is no
// production path default and no reuse or overwrite of a previous snapshot.
async function verifyLiveAuditSnapshot(source, { scratchRoot } = {}) {
  if (typeof source !== 'string' || !path.isAbsolute(source) ||
      typeof scratchRoot !== 'string' || !path.isAbsolute(scratchRoot))
    throw new TypeError('Audit source and scratch root must be absolute paths');
  const sourceStat = await fs.lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink())
    throw new Error('Audit source must be a regular SQLite file');
  await fs.mkdir(scratchRoot, { recursive: true, mode: 0o700 });
  const rootStat = await fs.lstat(scratchRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error('Audit scratch root must be a real directory');
  const directory = await fs.mkdtemp(path.join(scratchRoot, '.audit-check-'));
  const snapshot = path.join(directory, 'database.db');
  const startedAt = new Date().toISOString();
  try {
    await fs.chmod(directory, 0o700);
    await runSqliteExclusive(async () => {
      const db = new PrismaClient({ datasourceUrl: `file:${source}?connection_limit=1` });
      try { await db.$executeRawUnsafe('VACUUM INTO ?', snapshot); }
      finally { await db.$disconnect(); }
    });
    await fs.chmod(snapshot, 0o600);
    const snapshotAt = new Date().toISOString();
    const checked = await verifyAuditSnapshot(snapshot);
    const completedAt = new Date().toISOString();
    return { ...checked, startedAt, snapshotAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt) };
  } finally {
    // Includes any SQLite sidecars left by an unsuccessful local scan.
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { verifyLiveAuditSnapshot };
