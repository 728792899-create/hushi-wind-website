#!/usr/bin/env node
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadEnvFile } = require('./load-env');
const {
  resolveDatabaseFile,
  createDatabaseBackup,
  pruneBackups,
} = require('../lib/database-backup');
loadEnvFile();
(async () => {
  const root = path.resolve(
    process.env.DATABASE_BACKUP_DIR || path.join(__dirname, '../backups'),
  );
  const destination = path.join(
    root,
    `prod.predeploy.${Date.now()}.${randomUUID()}.db`,
  );
  const result = await createDatabaseBackup(
    resolveDatabaseFile(),
    destination,
    {
      requireCurrentSchema: false,
      uploadsRoot: path.resolve(
        process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'),
      ),
    },
  );
  await pruneBackups(root, Number(process.env.BACKUP_RETENTION_DAYS) || 14);
  console.log(JSON.stringify({ backup: destination, ...result }));
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
