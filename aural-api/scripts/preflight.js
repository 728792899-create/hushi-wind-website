#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('./load-env').loadEnvFile();
const { resolveDatabaseFile } = require('../lib/database-backup');
const { parseProductionUrl, isProductionUrl } = require('../lib/production-url');
const { deploymentReadinessConfig } = require('../lib/deployment-readiness-config');
const isProduction = process.env.NODE_ENV === 'production';
const required = [
  'DATABASE_URL',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'ADMIN_TOKEN_SECRET',
  'PUBLIC_SITE_URL',
  'PUBLIC_ADMIN_URL',
  'ALLOWED_ORIGINS',
];

const fail = (message) => {
  console.error(`Preflight failed: ${message}`);
  process.exit(1);
};

try { deploymentReadinessConfig(process.env); } catch (error) { fail(error.message); }

const splitEnvList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const isStrongPassword = (value) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,64}$/.test(
    String(value || ''),
  );

if (isProduction) {
  for (const key of required)
    if (
      /change.?me|replace|your[_-]|example|demo|placeholder/i.test(
        process.env[key] || '',
      )
    )
      fail(`${key} contains a placeholder`);
  if (process.env.ALERT_EMAIL_TO)
    fail('ALERT_EMAIL_TO is unsupported; configure ALERT_WEBHOOK_URL');
  if (['true', '1'].includes(process.env.TRUST_PROXY))
    fail('TRUST_PROXY requires explicit trusted proxy addresses');
  required.forEach((key) => {
    if (!process.env[key]) fail(`${key} is required in production`);
  });
  if (process.env.ADMIN_USERNAME === 'admin')
    fail('ADMIN_USERNAME must not be admin');
  if (
    process.env.ADMIN_PASSWORD === '123456' ||
    !isStrongPassword(process.env.ADMIN_PASSWORD)
  )
    fail(
      'ADMIN_PASSWORD must be 12-64 chars and include upper/lower case, number, and symbol',
    );
  if ((process.env.ADMIN_TOKEN_SECRET || '').length < 32)
    fail('ADMIN_TOKEN_SECRET must be at least 32 characters');
  [
    'PUBLIC_SITE_URL',
    'PUBLIC_ADMIN_URL',
    'API_PUBLIC_URL',
    'UPLOAD_PUBLIC_BASE',
  ].forEach((key) => {
    if (!isProductionUrl(process.env[key]))
      fail(`${key} must be an HTTPS production URL`);
  });
  const origins = splitEnvList(process.env.ALLOWED_ORIGINS);
  if (!origins.length || origins.some((origin) => !parseProductionUrl(origin, { originOnly: true })))
    fail('ALLOWED_ORIGINS must contain only HTTPS production origins');
}

if (process.env.DATABASE_URL?.startsWith('file:')) {
  const dbPath = resolveDatabaseFile();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir))
    fail(`database directory does not exist: ${dbDir}`);
}

console.log('Preflight passed.');
console.log(`NODE_ENV=${process.env.NODE_ENV || 'development'}`);
console.log(
  `DEPLOY_ID=${process.env.DEPLOY_ID || crypto.randomBytes(4).toString('hex')}`,
);
