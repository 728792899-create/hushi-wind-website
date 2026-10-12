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
      if (command === 'pm2' && args[0] === 'jlist') return {status:0,stdout:JSON.stringify(['fixture-api','fixture-web'].map(name=>({name,pm2_env:{pm_exec_path:path.join(current,name,'server.js'),pm_cwd:path.join(current,name)}})))};
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
      if(command==='pm2'&&args[0]==='jlist')return {status:0,stdout:JSON.stringify(['fixture-api','fixture-web'].map(name=>({name,pm2_env:{pm_exec_path:path.join(current,name,'server.js'),pm_cwd:path.join(current,name)}})))};
      if(args.includes('migrate')){assert.ok(fs.existsSync(gate));fs.writeFileSync(database,'after migration');migrated=true}
      if(args.includes('scripts/post-deploy-check.js')){assert.ok(fs.existsSync(gate));assert.notEqual(fs.realpathSync(current),fs.realpathSync(old));return {status:1}}
      if(migrated && args[0]==='restart' && fs.realpathSync(current)===fs.realpathSync(old)){assert.ok(fs.existsSync(gate));assert.equal(fs.readFileSync(database,'utf8'),'before migration');rollbackRestart=true}
      return {status:0};
    };
    delete require.cache[require.resolve('../scripts/safe-deploy')];await assert.rejects(require('../scripts/safe-deploy').main, /post-deploy-check/);
    assert.ok(rollbackRestart);assert.equal(fs.realpathSync(current),fs.realpathSync(old));assert.equal(fs.existsSync(gate),false);
  }finally{cp.spawnSync=spawnBefore;backupLib.createDatabaseBackup=backupBefore;process.argv[2]=argBefore;for(const key of Object.keys(process.env))if(!(key in envBefore))delete process.env[key];Object.assign(process.env,envBefore);fs.rmSync(tmp,{recursive:true,force:true});}
});
