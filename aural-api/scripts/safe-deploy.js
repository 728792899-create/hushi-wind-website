#!/usr/bin/env node
// Versioned release deployment. Configure the web server and PM2 to use DEPLOY_CURRENT_LINK.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { loadEnvFile } = require('./load-env');
const { shutdownTimeout } = require('../lib/service-lifecycle');
const { deploymentReadinessConfig } = require('../lib/deployment-readiness-config');
const {
  createDatabaseBackup,
  resolveDatabaseFile,
} = require('../lib/database-backup');
loadEnvFile();
const run = (command, args, cwd, env = process.env) => {
  const r = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
};
const canonical = (value) => {
  let next = path.resolve(value),
    tail = [];
  while (!fs.existsSync(next)) {
    tail.unshift(path.basename(next));
    const parent = path.dirname(next);
    if (parent === next) throw new Error('Invalid path');
    next = parent;
  }
  return path.join(fs.realpathSync(next), ...tail);
};
const overlaps = (a, b) =>
  a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
function validateLayout(env, source) {
  for (const key of [
    'DEPLOY_RELEASES_DIR',
    'DEPLOY_CURRENT_LINK',
    'DATABASE_URL',
    'UPLOAD_DIR',
    'DATABASE_BACKUP_DIR',
    'API_PM2_NAME',
    'WEB_PM2_NAME',
    'DEPLOY_WRITE_GATE_FILE',
  ])
    if (!env[key]) throw new Error(`${key} is required`);
  const releases = path.resolve(env.DEPLOY_RELEASES_DIR),
    current = path.resolve(env.DEPLOY_CURRENT_LINK),
    stage = path.resolve(source || '');
  if (
    !source ||
    stage === releases ||
    stage.startsWith(releases + path.sep) ||
    releases.startsWith(stage + path.sep)
  )
    throw new Error('Stage and releases must be separate directories');
  if (
    !env.DATABASE_URL.startsWith('file:/') ||
    !path.isAbsolute(env.UPLOAD_DIR)
  )
    throw new Error('Database and uploads must use absolute shared paths');
  for (const target of [
    resolveDatabaseFile(env.DATABASE_URL),
    env.UPLOAD_DIR,
    env.DATABASE_BACKUP_DIR,
  ])
    if (path.resolve(target).startsWith(releases + path.sep))
      throw new Error('Persistent data must live outside releases');
  for (const value of [
    env.UPLOAD_DIR,
    env.DATABASE_BACKUP_DIR,
    env.DEPLOY_WRITE_GATE_FILE,
  ])
    if (!path.isAbsolute(value))
      throw new Error('Shared paths must be absolute');
  for (const value of [
    resolveDatabaseFile(env.DATABASE_URL),
    env.UPLOAD_DIR,
    env.DATABASE_BACKUP_DIR,
    env.DEPLOY_WRITE_GATE_FILE,
  ])
    if (overlaps(canonical(value), canonical(releases)))
      throw new Error('Shared paths overlap release storage');
  if (fs.existsSync(current) && !fs.lstatSync(current).isSymbolicLink())
    throw new Error(
      'Current path must be a release symlink; existing directories will never be overwritten',
    );
  for (const name of ['aural-api', 'aural-admin', 'aural-website'])
    if (!fs.existsSync(path.join(stage, name, 'package-lock.json')))
      throw new Error(`Complete stage and lockfile required: ${name}`);
  return { releases, current, stage };
}
function validateProcessLinks(current, env = process.env) {
  const result = spawnSync('pm2', ['jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error('Cannot inspect PM2 process configuration');
  let processes;
  try { processes = JSON.parse(result.stdout); } catch { throw new Error('Invalid PM2 process listing'); }
  for (const name of [env.API_PM2_NAME, env.WEB_PM2_NAME]) {
    const entry = processes.find(p => p.name === name)?.pm2_env;
    if (!entry || ![entry.pm_exec_path, entry.pm_cwd].every(p => typeof p === 'string' && (p === current || p.startsWith(current + path.sep))))
      throw new Error(`PM2 ${name} must use the current symlink for both script and cwd before safe deployment`);
    if (name === env.API_PM2_NAME) {
      // The running API may have loaded a different budget from its .env.
      // PM2 cannot prove that value unless it explicitly owns the setting.
      const runningBudget = entry.SHUTDOWN_TIMEOUT_MS ?? entry.env?.SHUTDOWN_TIMEOUT_MS;
      if (runningBudget === undefined)
        throw new Error(`PM2 ${name} must explicitly record SHUTDOWN_TIMEOUT_MS before safe deployment`);
      const required = Math.max(shutdownTimeout(env.SHUTDOWN_TIMEOUT_MS),
        shutdownTimeout(runningBudget)) + 5000;
      if (!Number.isFinite(Number(entry.kill_timeout)) || Number(entry.kill_timeout) < required)
        throw new Error(`PM2 ${name} kill_timeout must be at least ${required}ms to allow API draining`);
    }
  }
}
async function main() {
  deploymentReadinessConfig(process.env);
  const { releases, current, stage } = validateLayout(
    process.env,
    process.argv[2],
  );
  const id = `${Date.now()}-${randomUUID()}`,
    release = path.join(releases, id),
    old = fs.existsSync(current) ? fs.realpathSync(current) : null;
  fs.mkdirSync(releases, { recursive: true });
  if (!old)
    throw new Error(
      'Existing release symlink required; initialize the service layout before deploying',
    );
  validateProcessLinks(current);
  const lock = fs.openSync(path.join(releases, '.deploy-lock'), 'wx');
  const record = {
    id,
    release,
    previous: old,
    status: 'preparing',
    startedAt: new Date().toISOString(),
  };
  let stopped = false,
    switched = false,
    backup,
    backupReady = false,
    migrationStarted = false;
  const gate = path.resolve(process.env.DEPLOY_WRITE_GATE_FILE);
  const apiName = process.env.API_PM2_NAME,
    webName = process.env.WEB_PM2_NAME;
  const switchTo = (target) => {
    const tmp = current + '.' + id;
    fs.symlinkSync(target, tmp);
    fs.renameSync(tmp, current);
  };
  try {
    fs.mkdirSync(release);
    for (const name of ['aural-api', 'aural-admin', 'aural-website']) {
      fs.cpSync(path.join(stage, name), path.join(release, name), {
        recursive: true,
        filter: (p) =>
          !/(^|[/\\])(node_modules|\.git|\.env(?:\..*)?|uploads|backups|logs|dist|\.output|\.nuxt)([/\\]|$)/.test(
            p,
          ) && !/\.db(?:-wal|-shm)?$/.test(p),
      });
      run('npm', ['ci', '--include=dev'], path.join(release, name));
    }
    const api = path.join(release, 'aural-api'),
      admin = path.join(release, 'aural-admin'),
      website = path.join(release, 'aural-website');
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      VITE_API_BASE: process.env.API_PUBLIC_URL,
      VITE_SITE_URL: process.env.PUBLIC_SITE_URL,
      NUXT_PUBLIC_API_BASE: process.env.API_PUBLIC_URL,
      NUXT_PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
    };
    run(process.execPath, ['scripts/preflight.js'], api, env);
    run('npx', ['prisma', 'generate'], api, env);
    run('npm', ['test'], api, env);
    run('npm', ['run', 'audit:prod'], api, env);
    run('npm', ['test'], admin, env);
    run('npm', ['run', 'audit:prod'], admin, env);
    run('npm', ['test'], website, env);
    run('npm', ['run', 'build'], admin, env);
    run('npm', ['run', 'build'], website, env);
    run('npm', ['run', 'audit:prod'], website, {
      ...env,
      WEBSITE_OUTPUT_DIR: path.join(website, '.output'),
    });
    // Stop all database writers before the migration; backup contains the final committed state.
    fs.writeFileSync(gate, id, { flag: 'wx', mode: 0o600 });
    run('pm2', ['stop', apiName], release);
    stopped = true;
    backup = path.join(
      process.env.DATABASE_BACKUP_DIR,
      `prod.predeploy.${id}.db`,
    );
    await createDatabaseBackup(resolveDatabaseFile(), backup, {
      requireCurrentSchema: false,
      uploadsRoot: process.env.UPLOAD_DIR,
    });
    record.backup = backup;
    backupReady = true;
    migrationStarted = true;
    run('npx', ['prisma', 'migrate', 'deploy'], api, env);
    run(process.execPath, ['scripts/check-database.js'], api, env);
    switchTo(release);
    switched = true;
    run('pm2', ['restart', apiName, '--update-env'], release, env);
    run('pm2', ['restart', webName, '--update-env'], release, env);
    run(process.execPath, ['scripts/post-deploy-check.js'], api, {
      ...env, ADMIN_DIST_DIR: path.join(admin, 'dist'),
    });
    fs.rmSync(gate);
    record.status = 'success';
  } catch (error) {
    record.status = 'failed';
    record.error = error.message;
    if (stopped) {
      // The old process stays stopped until its database and release pointer are restored.
      try {
        run('pm2', ['stop', apiName], release);
        if (backupReady && migrationStarted) {
          const target = resolveDatabaseFile();
          fs.copyFileSync(backup, target + '.rollback');
          fs.renameSync(target + '.rollback', target);
          for (const suffix of ['-wal', '-shm'])
            fs.rmSync(target + suffix, { force: true });
        }
        if (switched && old) switchTo(old);
        if (old) {
          run('pm2', ['restart', apiName, '--update-env'], old);
          run('pm2', ['restart', webName, '--update-env'], old);
          // Use the prepared verifier: the old release may predate bounded readiness checks.
          run(process.execPath, [path.join(release, 'aural-api/scripts/post-deploy-check.js')], path.join(old, 'aural-api'), {
            ...process.env, NODE_ENV: 'production', ADMIN_DIST_DIR: path.join(old, 'aural-admin/dist'),
          });
          record.rollback = 'restored';
          fs.rmSync(gate, { force: true });
        } else record.rollback = 'manual-start-required';
      } catch (rollbackError) {
        record.rollback = 'failed';
        record.rollbackError = rollbackError.message;
      }
    }
    throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      path.join(releases, `${id}.json`),
      JSON.stringify(record, null, 2),
    );
    if (!stopped && fs.existsSync(gate) && fs.readFileSync(gate, 'utf8') === id)
      fs.rmSync(gate);
    fs.closeSync(lock);
    fs.rmSync(path.join(releases, '.deploy-lock'), { force: true });
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { validateLayout, validateProcessLinks, main };
