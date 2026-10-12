#!/usr/bin/env node
const { loadEnvFile } = require('./load-env');
const {
  resolveDatabaseFile,
  verifyDatabase,
} = require('../lib/database-backup');
loadEnvFile();
verifyDatabase(resolveDatabaseFile())
  .then((tables) => console.log(JSON.stringify({ status: 'ok', tables })))
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
