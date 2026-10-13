const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertDemoTarget } = require('../lib/demo-guard');
test('demo scripts reject production, inherited business target and linked databases', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-demo-guard-'));
  try {
    const db = path.join(tmp, 'business.db');
    fs.writeFileSync(db, 'business');
    const link = path.join(tmp, 'hushi-demo.db');
    fs.symlinkSync(db, link);
    assert.throws(() =>
      assertDemoTarget({
        NODE_ENV: 'production',
        HUSHI_DEMO_SEED: '1',
        DATABASE_URL: 'file:' + link,
      }),
    );
    assert.throws(() =>
      assertDemoTarget({ HUSHI_DEMO_SEED: '1', DATABASE_URL: 'file:' + db }),
    );
    assert.throws(() =>
      assertDemoTarget({ HUSHI_DEMO_SEED: '1', DATABASE_URL: 'file:' + link }),
    );
    assert.equal(fs.readFileSync(db, 'utf8'), 'business');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('notification worker marks HTTP failures for retry, success only after acceptance', async () => {
  const { createNotificationWorker } = require('../lib/notification-worker');
  let row = {
    id: 1,
    type: 'test',
    payload: '{}',
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(),
  };
  const db = {
    notificationDelivery: {
      findMany: async () =>
        ['pending', 'retry'].includes(row.status) ? [{ ...row }] : [],
      updateMany: async ({ where, data }) => {
        if (where.id && row.status !== where.status) return { count: 0 };
        if (!where.id) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ data }) => Object.assign(row, data),
    },
  };
  const failure = createNotificationWorker(db, {
    url: 'https://example.invalid',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      body: { cancel: async () => {} },
    }),
  });
  await failure.run();
  assert.equal(row.status, 'retry');
  const success = createNotificationWorker(db, {
    url: 'https://example.invalid',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: { cancel: async () => {} },
    }),
  });
  await success.run();
  assert.equal(row.status, 'sent');
});

test('failed release backup restarts the old service and does not attempt database restoration', async () => {
  const cp = require('node:child_process'),
    originalSpawn = cp.spawnSync;
  const { PrismaClient } = require('@prisma/client');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-release-test-'));
  const oldEnv = { ...process.env },
    oldArg = process.argv[2],
    calls = [];
  try {
    const stage = path.join(tmp, 'stage'),
      releases = path.join(tmp, 'releases'),
      shared = path.join(tmp, 'shared'),
      old = path.join(releases, 'previous');
    fs.mkdirSync(old, { recursive: true });
    fs.mkdirSync(shared);
    for (const name of ['aural-api', 'aural-admin', 'aural-website']) {
      fs.mkdirSync(path.join(stage, name), { recursive: true });
      fs.writeFileSync(path.join(stage, name, 'package-lock.json'), '{}');
    }
    const current = path.join(tmp, 'current');
    fs.symlinkSync(old, current);
    const database = path.join(shared, 'test.db');
    fs.writeFileSync(database, '');
    const db = new PrismaClient({ datasourceUrl: 'file:' + database });
    for (const name of ['Product', 'Inquiry', 'AdminUser'])
      await db.$executeRawUnsafe(
        `CREATE TABLE "${name}" (id INTEGER PRIMARY KEY)`,
      );
    await db.$disconnect();
    Object.assign(process.env, {
      DEPLOY_RELEASES_DIR: releases,
      DEPLOY_CURRENT_LINK: current,
      DATABASE_URL: 'file:' + database,
      UPLOAD_DIR: path.join(shared, 'missing-uploads'),
      DATABASE_BACKUP_DIR: path.join(shared, 'backups'),
      API_PM2_NAME: 'fixture-api',
      WEB_PM2_NAME: 'fixture-web',
      DEPLOY_WRITE_GATE_FILE: path.join(shared, 'gate'),
    });
    process.argv[2] = stage;
    cp.spawnSync = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'pm2' && args[0] === 'jlist') return {status:0,stdout:JSON.stringify(['fixture-api','fixture-web'].map(name=>({name,pm2_env:{kill_timeout:65000,SHUTDOWN_TIMEOUT_MS:60000,pm_exec_path:path.join(current,name,'server.js'),pm_cwd:path.join(current,name)}})))};
      return { status: 0 };
    };
    delete require.cache[require.resolve('../scripts/safe-deploy')];
    const { main } = require('../scripts/safe-deploy');
    await assert.rejects(main);
    assert.ok(
      calls.some(
        (c) => c[0] === 'pm2' && c[1] === 'restart' && c[2] === 'fixture-api',
      ),
    );
    assert.ok(!calls.some((c) => c.includes('migrate')));
    assert.equal(fs.realpathSync(current), fs.realpathSync(old));
    assert.ok(!fs.existsSync(process.env.DEPLOY_WRITE_GATE_FILE));
    assert.ok(!fs.existsSync(path.join(releases, '.deploy-lock')));
  } finally {
    cp.spawnSync = originalSpawn;
    process.argv[2] = oldArg;
    for (const key of Object.keys(process.env))
      if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('notification pause blocks immediate runs and a gate raised during claim prevents sending', async()=>{
  const {createNotificationWorker}=require('../lib/notification-worker');let paused=true,lookups=0,sends=0,restored=false;
  const row={id:1,status:'pending',attempts:0,payload:'{}',nextAttemptAt:new Date()};
  const db={notificationDelivery:{findMany:async()=>{lookups++;return [row]},updateMany:async()=>{paused=true;return {count:1}},update:async({data})=>{restored=data.status==='pending'}}};
  const worker=createNotificationWorker(db,{url:'https://example.invalid',isPaused:()=>paused,fetchImpl:async()=>{sends++;return {ok:true}}});
  await worker.run();assert.equal(lookups,0);assert.equal(sends,0);
  paused=false;await worker.run();assert.equal(sends,0);assert.equal(restored,true);
});

test('post-deploy failure restores the old database and release while holding the write gate',async()=>{
  const cp=require('node:child_process'), backupLib=require('../lib/database-backup');
  const spawnBefore=cp.spawnSync, backupBefore=backupLib.createDatabaseBackup,envBefore={...process.env},argBefore=process.argv[2];
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hushi-rollback-'));
  try {
    const stage=path.join(tmp,'stage'),releases=path.join(tmp,'releases'),old=path.join(releases,'previous'),current=path.join(tmp,'current'),shared=path.join(tmp,'shared');
    fs.mkdirSync(old,{recursive:true});fs.mkdirSync(shared);fs.symlinkSync(old,current);
    for(const name of ['aural-api','aural-admin','aural-website']){fs.mkdirSync(path.join(stage,name),{recursive:true});fs.writeFileSync(path.join(stage,name,'package-lock.json'),'{}')}
    const database=path.join(shared,'live.db'),gate=path.join(shared,'gate');fs.writeFileSync(database,'before migration');
    Object.assign(process.env,{DEPLOY_RELEASES_DIR:releases,DEPLOY_CURRENT_LINK:current,DATABASE_URL:'file:'+database,UPLOAD_DIR:path.join(shared,'uploads'),DATABASE_BACKUP_DIR:path.join(shared,'backups'),API_PM2_NAME:'fixture-api',WEB_PM2_NAME:'fixture-web',DEPLOY_WRITE_GATE_FILE:gate});process.argv[2]=stage;
    let migrated=false,rollbackRestart=false;
    backupLib.createDatabaseBackup=async(source,target)=>{assert.ok(fs.existsSync(gate));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target)};
    cp.spawnSync=(command,args)=>{
      if(command==='pm2'&&args[0]==='jlist')return {status:0,stdout:JSON.stringify(['fixture-api','fixture-web'].map(name=>({name,pm2_env:{kill_timeout:65000,SHUTDOWN_TIMEOUT_MS:60000,pm_exec_path:path.join(current,name,'server.js'),pm_cwd:path.join(current,name)}})))};
      if(args.includes('migrate')){assert.ok(fs.existsSync(gate));fs.writeFileSync(database,'after migration');migrated=true}
      if(args.includes('scripts/post-deploy-check.js')){assert.ok(fs.existsSync(gate));assert.notEqual(fs.realpathSync(current),fs.realpathSync(old));return {status:1}}
      if(migrated && args[0]==='restart' && fs.realpathSync(current)===fs.realpathSync(old)){assert.ok(fs.existsSync(gate));assert.equal(fs.readFileSync(database,'utf8'),'before migration');rollbackRestart=true}
      return {status:0};
    };
    delete require.cache[require.resolve('../scripts/safe-deploy')];await assert.rejects(require('../scripts/safe-deploy').main, /post-deploy-check/);
    assert.ok(rollbackRestart);assert.equal(fs.realpathSync(current),fs.realpathSync(old));assert.equal(fs.existsSync(gate),false);
  }finally{cp.spawnSync=spawnBefore;backupLib.createDatabaseBackup=backupBefore;process.argv[2]=argBefore;for(const key of Object.keys(process.env))if(!(key in envBefore))delete process.env[key];Object.assign(process.env,envBefore);fs.rmSync(tmp,{recursive:true,force:true});}
});

async function withMockedDeployment(auditStatus, check) {
  const cp = require('node:child_process');
  const backupLib = require('../lib/database-backup');
  const envLib = require('../scripts/load-env');
  const before = {
    spawn: cp.spawnSync, backup: backupLib.createDatabaseBackup,
    loadEnv: envLib.loadEnvFile, env: { ...process.env }, argv: [...process.argv],
  };
  const scratch = path.resolve(__dirname, '../../logs/step11-20261013');
  fs.mkdirSync(scratch, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(scratch, 'deployment-gate-test-'));
  const calls = [], events = [];
  let backups = 0;
  try {
    const stage = path.join(tmp, 'stage'), releases = path.join(tmp, 'releases');
    const old = path.join(releases, 'previous'), current = path.join(tmp, 'current');
    const shared = path.join(tmp, 'shared'), database = path.join(shared, 'fixture.db');
    const uploads = path.join(shared, 'uploads'), gate = path.join(shared, 'gate');
    fs.mkdirSync(old, { recursive: true });
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(database, 'fixture database before deployment');
    fs.writeFileSync(path.join(uploads, 'fixture.txt'), 'fixture asset');
    fs.symlinkSync(old, current);
    for (const name of ['aural-api', 'aural-admin', 'aural-website']) {
      fs.mkdirSync(path.join(stage, name), { recursive: true });
      fs.writeFileSync(path.join(stage, name, 'package-lock.json'), '{}');
    }
    Object.assign(process.env, {
      DEPLOY_RELEASES_DIR: releases, DEPLOY_CURRENT_LINK: current,
      DATABASE_URL: 'file:' + database, UPLOAD_DIR: uploads,
      DATABASE_BACKUP_DIR: path.join(shared, 'backups'),
      API_PM2_NAME: 'fixture-api', WEB_PM2_NAME: 'fixture-web',
      DEPLOY_WRITE_GATE_FILE: gate, SHUTDOWN_TIMEOUT_MS: '60000',
      API_PUBLIC_URL: 'https://api.example.invalid', PUBLIC_SITE_URL: 'https://www.example.invalid',
      WEBSITE_OUTPUT_DIR: path.join(tmp, 'unrelated-old-output'),
    });
    process.argv[2] = stage;
    envLib.loadEnvFile = () => false;
    backupLib.createDatabaseBackup = async (source, target) => {
      backups++;
      events.push('backup');
      assert.ok(fs.existsSync(gate));
      assert.equal(fs.realpathSync(current), fs.realpathSync(old));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    };
    cp.spawnSync = (command, args, options = {}) => {
      calls.push({ command, args, cwd: options.cwd });
      if (command === 'pm2' && args[0] === 'jlist') {
        return { status: 0, stdout: JSON.stringify(['fixture-api', 'fixture-web'].map(name => ({
          name, pm2_env: { kill_timeout: 65000, SHUTDOWN_TIMEOUT_MS: 60000,
            pm_exec_path: path.join(current, name, 'server.js'), pm_cwd: path.join(current, name) },
        }))) };
      }
      if (command === 'npm') {
        assert.ok(['ci', 'test'].includes(args[0]) || (args[0] === 'run' && ['build', 'audit:prod'].includes(args[1])));
        if (path.basename(options.cwd) === 'aural-website' && args[0] === 'run') {
          events.push(args[1] === 'build' ? 'website-build' : 'website-audit');
          assert.equal(fs.existsSync(gate), false, 'maintenance cannot start before build and audit');
          assert.equal(fs.realpathSync(current), fs.realpathSync(old));
          assert.equal(backups, 0);
          if (args[1] === 'audit:prod') {
            assert.equal(options.env.NODE_ENV, 'production');
            assert.equal(options.env.NUXT_PUBLIC_API_BASE, 'https://api.example.invalid');
            assert.equal(options.env.WEBSITE_OUTPUT_DIR, path.join(options.cwd, '.output'), 'audit the new release even when a preview override was inherited');
            return { status: auditStatus };
          }
        }
      } else if (command === 'npx') {
        assert.equal(args[0], 'prisma');
        assert.ok(['generate', 'migrate'].includes(args[1]));
        if (args[1] === 'migrate') {
          events.push('migrate');
          assert.ok(fs.existsSync(gate));
          assert.equal(backups, 1);
        }
      } else if (command === 'pm2') {
        assert.ok(['stop', 'restart'].includes(args[0]));
        assert.ok(fs.existsSync(gate));
        events.push(args[0] === 'stop' ? 'stop-api' : `restart-${args[1]}`);
        if (args[0] === 'restart') assert.notEqual(fs.realpathSync(current), fs.realpathSync(old));
      } else {
        assert.equal(command, process.execPath, 'every child process remains mocked');
        assert.ok(['scripts/preflight.js', 'scripts/check-database.js', 'scripts/post-deploy-check.js'].includes(args[0]));
        if (args[0] === 'scripts/check-database.js') events.push('database-check');
        if (args[0] === 'scripts/post-deploy-check.js') {
          events.push('post-check');
          assert.ok(fs.existsSync(gate));
        }
      }
      return { status: 0 };
    };
    delete require.cache[require.resolve('../scripts/safe-deploy')];
    const { main } = require('../scripts/safe-deploy');
    await check({ main, calls, events, releases, current, old, database, uploads, gate, backupCount: () => backups });
  } finally {
    cp.spawnSync = before.spawn;
    backupLib.createDatabaseBackup = before.backup;
    envLib.loadEnvFile = before.loadEnv;
    process.argv.splice(0, process.argv.length, ...before.argv);
    for (const key of Object.keys(process.env)) if (!(key in before.env)) delete process.env[key];
    Object.assign(process.env, before.env);
    delete require.cache[require.resolve('../scripts/safe-deploy')];
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('website audit failure prevents maintenance, process stops, backups, migration and release switching', async () => {
  await withMockedDeployment(1, async ({ main, calls, events, releases, current, old, database, uploads, gate, backupCount }) => {
    await assert.rejects(main, /npm run audit:prod failed/);
    assert.deepEqual(events, ['website-build', 'website-audit']);
    assert.equal(calls.filter(call => call.command === 'pm2' && call.args[0] !== 'jlist').length, 0);
    assert.equal(backupCount(), 0);
    assert.ok(!calls.some(call => call.args.includes('migrate')));
    assert.equal(fs.realpathSync(current), fs.realpathSync(old));
    assert.equal(fs.readFileSync(database, 'utf8'), 'fixture database before deployment');
    assert.equal(fs.readFileSync(path.join(uploads, 'fixture.txt'), 'utf8'), 'fixture asset');
    assert.equal(fs.existsSync(gate), false);
    assert.equal(fs.existsSync(path.join(releases, '.deploy-lock')), false);
    const records = fs.readdirSync(releases).filter(name => name.endsWith('.json'));
    assert.equal(records.length, 1);
    const record = JSON.parse(fs.readFileSync(path.join(releases, records[0]), 'utf8'));
    assert.equal(record.status, 'failed');
    assert.match(record.error, /npm run audit:prod failed/);
    assert.equal(record.backup, undefined);
    assert.equal(record.rollback, undefined);
  });
});

test('website audit success preserves the maintenance, backup, migration and release sequence', async () => {
  await withMockedDeployment(0, async ({ main, events, releases, current, old, gate, backupCount }) => {
    await main();
    assert.deepEqual(events, [
      'website-build', 'website-audit', 'stop-api', 'backup', 'migrate',
      'database-check', 'restart-fixture-api', 'restart-fixture-web', 'post-check',
    ]);
    assert.equal(backupCount(), 1);
    assert.notEqual(fs.realpathSync(current), fs.realpathSync(old));
    assert.equal(fs.existsSync(gate), false);
    assert.equal(fs.existsSync(path.join(releases, '.deploy-lock')), false);
    const records = fs.readdirSync(releases).filter(name => name.endsWith('.json'));
    assert.equal(records.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(releases, records[0]), 'utf8')).status, 'success');
  });
});
