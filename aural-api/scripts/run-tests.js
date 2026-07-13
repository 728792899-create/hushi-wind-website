#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const databaseFile = path.join(root, 'prisma', 'test.db');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./test.db',
  ADMIN_USERNAME: 'demo_admin',
  ADMIN_PASSWORD: 'DemoPass_2026!',
  ADMIN_TOKEN_SECRET: 'hushi-test-token-secret-2026-at-least-32-characters',
  PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
  PUBLIC_ADMIN_URL: 'http://127.0.0.1:5175',
  API_PUBLIC_URL: 'http://127.0.0.1:1337',
  UPLOAD_PUBLIC_BASE: 'http://127.0.0.1:1337/uploads',
  ALLOWED_ORIGINS: 'http://127.0.0.1:3000,http://127.0.0.1:5175',
  PUBLIC_FORM_MIN_ELAPSED_MS: '25',
  PUBLIC_FORM_RATE_LIMIT: '100'
};

const run = (label, command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
};

fs.rmSync(databaseFile, { force: true });
fs.closeSync(fs.openSync(databaseFile, 'a'));
run('Prisma test database', 'npx', ['prisma', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate', '--accept-data-loss']);
run('Demo seed', 'node', ['scripts/seed-demo.js']);
run('Catalog seed', 'node', ['scripts/content-cleanup.js']);
run('API tests', 'npx', ['vitest', 'run', ...(process.argv.includes('--integration-only') ? ['tests/integration'] : [])]);
