#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { loadEnvFile } = require('./load-env');
function readDeploymentHistory(env = process.env, root = path.resolve(__dirname, '..')) {
  const rows = [];
  const parse = (text, file) => { try { const value = JSON.parse(text); if (value && typeof value === 'object' && !Array.isArray(value)) rows.push(value); } catch { console.warn(`Skipped invalid deployment record: ${file}`); } };
  const legacy = path.join(env.DEPLOY_LOG_DIR || path.join(root, 'logs', 'deployments'), 'history.jsonl');
  if (fs.existsSync(legacy)) for (const line of fs.readFileSync(legacy, 'utf8').split(/\r?\n/).filter(Boolean)) parse(line, legacy);
  if (env.DEPLOY_RELEASES_DIR && fs.existsSync(env.DEPLOY_RELEASES_DIR))
    for (const entry of fs.readdirSync(env.DEPLOY_RELEASES_DIR, { withFileTypes: true }))
      if (entry.isFile() && entry.name.endsWith('.json')) {
        const file = path.join(env.DEPLOY_RELEASES_DIR, entry.name);
        parse(fs.readFileSync(file, 'utf8'), file);
      }
  const unique = new Map();
  for (const row of rows) unique.set(row.id || JSON.stringify(row), row);
  return [...unique.values()].sort((a, b) => (Date.parse(b.startedAt || b.finishedAt) || 0) - (Date.parse(a.startedAt || a.finishedAt) || 0));
}
if (require.main === module) {
  loadEnvFile(path.join(__dirname, '..', '.env'));
  const limit = Math.max(1, Math.min(1000, Number.parseInt(process.argv[2] || process.env.DEPLOY_HISTORY_LIMIT || '10', 10) || 10));
  const rows = readDeploymentHistory().slice(0, limit);
  if (!rows.length) console.log('No deployment history found.');
  else console.table(rows.map(item => ({ id: item.id, status: item.status, startedAt: item.startedAt,
    duration: item.durationMs ? `${Math.round(item.durationMs / 1000)}s` : '-',
    release: item.release || item.stageRoot || item.stage || '', rollback: item.rollback || '', error: item.error || '' })));
}
module.exports = { readDeploymentHistory };
