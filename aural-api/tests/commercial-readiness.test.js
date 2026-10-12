const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {notificationPayload,assertWebhookAccepted}=require('../lib/webhook-protocol');
const {createBackupScheduler}=require('../lib/scheduled-backup');
const {checkAuthBoundary}=require('../lib/deployment-auth-check');

test('bot payloads adapt business reminders without disclosing customer details',()=>{
  const original={type:'inquiry_created',customerName:'private-name',contactInfo:'private-phone'};
  for(const provider of ['wecom','dingtalk','feishu']){
    const payload=notificationPayload(provider,original);
    assert.equal(payload.msgtype||payload.msg_type,'text');
    assert.match(JSON.stringify(payload),/新客户咨询/);
    assert.doesNotMatch(JSON.stringify(payload),/private/);
  }
  const alert={msgtype:'text',text:{content:'existing alert'}};
  assert.deepEqual(notificationPayload('wecom',alert),alert);
  assert.deepEqual(notificationPayload('generic',original),original);
});
test('bot business failures and invalid JSON fail even with HTTP 200',async()=>{
  for(const provider of ['wecom','dingtalk','feishu']) {
    const field=provider==='feishu'?'code':'errcode';
    await assertWebhookAccepted(new Response(JSON.stringify({[field]:0})),provider);
    await assert.rejects(assertWebhookAccepted(new Response(JSON.stringify({[field]:400})),provider));
    await assert.rejects(assertWebhookAccepted(new Response('invalid JSON'),provider));
    await assert.rejects(assertWebhookAccepted(new Response('{}',{status:503}),provider));
  }
  await assertWebhookAccepted(new Response(''),'generic');
  await assertWebhookAccepted(new Response('{"StatusCode":0}'),'feishu');
});
test('provider rejection is retried by the durable notification worker',async()=>{
  const {createNotificationWorker}=require('../lib/notification-worker');
  let row={id:3,type:'inquiry',payload:'{"type":"inquiry"}',status:'pending',attempts:0,nextAttemptAt:new Date()};
  const db={notificationDelivery:{findMany:async()=>[{...row}],updateMany:async({where,data})=>{if(!where.id)return {count:0};Object.assign(row,{...data,attempts:data.attempts?.increment?row.attempts+data.attempts.increment:row.attempts});return {count:1}},update:async({data})=>Object.assign(row,data)}};
  await createNotificationWorker(db,{url:'https://example.invalid',provider:'wecom',fetchImpl:async()=>new Response('{"errcode":40013}')} ).run();
  assert.equal(row.status,'retry');assert.equal(row.attempts,1);
  await createNotificationWorker(db,{url:'https://example.invalid',provider:'wecom',fetchImpl:async()=>new Response('{"errcode":0}')} ).run();
  assert.equal(row.status,'sent');
});
function schedulerFixture(overrides={}) {
  const events=[];
  const db={backupRecord:{findFirst:async()=>null,create:async()=>events.push('record')},maintenanceRun:{create:async()=>events.push('failure')}};
  const options={source:'/fixture/live.db',uploadsRoot:'/fixture/uploads',backupRoot:'/fixture/backups',create:async()=>{events.push('create');return {size:100}},verify:async()=>events.push('verify'),prune:async()=>events.push('prune'),...overrides};
  return {events,db,options};
}
test('scheduled backups verify and record before pruning; failures never prune',async()=>{
  const f=schedulerFixture();await createBackupScheduler(f.db,f.options).run();
  assert.deepEqual(f.events,['create','verify','record','prune']);
  const bad=schedulerFixture({verify:async()=>{throw Error('corrupt')}});
  await assert.rejects(createBackupScheduler(bad.db,bad.options).run(),/corrupt/);
  assert.deepEqual(bad.events,['create','failure']);
});
test('scheduled backups honor pause and concurrency and replace a missing recent backup',async()=>{
  const paused=schedulerFixture({isPaused:()=>true});
  await createBackupScheduler(paused.db,paused.options).run();assert.deepEqual(paused.events,[]);
  let release;const pending=new Promise(resolve=>release=resolve);
  const f=schedulerFixture({create:async()=>{await pending;return {size:1}}});
  const scheduler=createBackupScheduler(f.db,f.options);const first=scheduler.run();
  assert.equal((await scheduler.run()).skipped,true);release();await first;
  const missing=schedulerFixture();missing.db.backupRecord.findFirst=async()=>({createdAt:new Date(),filename:'missing.db'});
  missing.options.verify=async file=>{if(file.endsWith('missing.db'))throw Error('missing');missing.events.push('verify')};
  await createBackupScheduler(missing.db,missing.options).run();
  assert.deepEqual(missing.events,['create','verify','record','prune']);
});
test('retention keeps two verified database-and-asset bundles despite newer corruption',async()=>{
  const {PrismaClient}=require('@prisma/client');
  const {createDatabaseBackup,pruneBackups}=require('../lib/database-backup');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hushi-retention-'));
  try {
    const source=path.join(root,'source.db');const db=new PrismaClient({datasourceUrl:'file:'+source});
    try {for(const table of ['Product','Inquiry','AdminUser'])await db.$executeRawUnsafe(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY)`);}finally{await db.$disconnect()}
    const uploads=path.join(root,'uploads');await fs.mkdir(uploads);await fs.writeFile(path.join(uploads,'fixture.txt'),'preserve');
    const backups=path.join(root,'backups');
    for(let i=0;i<3;i++){
      const file=path.join(backups,`database.scheduled.${i}.db`);
      await createDatabaseBackup(source,file,{requireCurrentSchema:false,uploadsRoot:uploads});
      const date=new Date(Date.now()-(40-i)*86400000);await fs.utimes(file,date,date);
    }
    const bad=path.join(backups,'database.scheduled.corrupt.db');await fs.writeFile(bad,'corrupt');
    await pruneBackups(backups,14);
    await assert.rejects(fs.access(path.join(backups,'database.scheduled.0.db')));
    for(const i of [1,2]){await fs.access(path.join(backups,`database.scheduled.${i}.db`));assert.equal(await fs.readFile(path.join(backups,`database.scheduled.${i}.db.assets/fixture.txt`),'utf8'),'preserve')}
    await fs.writeFile(path.join(backups,'database.scheduled.2.db'),'now corrupt');
    await pruneBackups(backups,14);await fs.access(path.join(backups,'database.scheduled.1.db'));
  }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('unattended deployment validates the real private-session boundary without credentials',async()=>{
  let requested;
  const result=await checkAuthBoundary(async url=>{requested=url;return new Response('{"success":false}',{status:401})},'http://fixture');
  assert.equal(requested,'http://fixture/api/auth/session');assert.equal(result.ok,true);
  for(const status of [200,404,500])assert.equal((await checkAuthBoundary(async()=>new Response('{"success":false}',{status}),'http://fixture')).ok,false);
});

test('complete backup ignores external upload paths but validates owned URLs and media body lines', async () => {
  const { PrismaClient } = require('@prisma/client');
  const { createDatabaseBackup, verifyBackupBundle } = require('../lib/database-backup');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hushi-origin-backup-'));
  const source = path.join(root, 'source.db'), uploads = path.join(root, 'uploads');
  const db = new PrismaClient({ datasourceUrl: 'file:' + source });
  try {
    await fs.mkdir(uploads);
    for (const table of ['Inquiry', 'AdminUser']) await db.$executeRawUnsafe(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY)`);
    await db.$executeRawUnsafe('CREATE TABLE "Product" (id INTEGER PRIMARY KEY, imageUrl TEXT, description TEXT)');
    await db.$executeRawUnsafe('INSERT INTO "Product" VALUES (1, ?, ?)', 'https://external.invalid/uploads/missing.jpg', '正文提及 /uploads/not-an-asset.jpg 请勿删除');
    const options = { requireCurrentSchema: false, uploadsRoot: uploads, assetOrigins: ['https://owned.invalid'] };
    const external = path.join(root, 'external.db');
    await createDatabaseBackup(source, external, options);
    await verifyBackupBundle(external, { requireCurrentSchema: false });
    await db.$executeRawUnsafe('UPDATE "Product" SET imageUrl = ?', 'https://owned.invalid/uploads/missing.jpg');
    await assert.rejects(createDatabaseBackup(source, path.join(root, 'missing.db'), options), /missing upload/);
    await fs.writeFile(path.join(uploads, 'missing.jpg'), 'fixture');
    await db.$executeRawUnsafe('UPDATE "Product" SET description = ?', '正文\n/uploads/clip.webm 视频说明');
    await assert.rejects(createDatabaseBackup(source, path.join(root, 'body-missing.db'), options), /clip.webm/);
    await fs.writeFile(path.join(uploads, 'clip.webm'), 'fixture video');
    await fs.writeFile(path.join(uploads, 'a b.jpg'), 'fixture spaced name');
    await db.$executeRawUnsafe('UPDATE "Product" SET imageUrl = ?', '/uploads/a b.jpg');
    const good = path.join(root, 'good.db');
    await createDatabaseBackup(source, good, options);
    assert.equal((await verifyBackupBundle(good, { requireCurrentSchema: false })).assetCount, 3);
  } finally { await db.$disconnect(); await fs.rm(root, { recursive: true, force: true }); }
});

test('deployment wrapper fails for process errors and signals, preserves explicit exit status', async () => {
  const vm = require('node:vm');
  const source = await fs.readFile(path.join(__dirname, '../scripts/deploy-production.js'), 'utf8');
  for (const [result, expected] of [[{ status: 0 }, 0], [{ status: 7 }, 7], [{ status: null, signal: 'SIGTERM' }, 1], [{ status: null, error: Error('spawn failed') }, 1]]) {
    const fakeProcess = { execPath: process.execPath, argv: ['node', 'script'], env: {} };
    vm.runInNewContext(source, { __dirname, process: fakeProcess, console: { error() {} }, require: name => name === 'node:child_process' ? { spawnSync: () => result } : require(name) });
    assert.equal(fakeProcess.exitCode, expected);
  }
});

test('deployment history merges current release records with legacy logs, newest first', async () => {
  const { readDeploymentHistory } = require('../scripts/deploy-history');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hushi-deploy-history-'));
  try {
    const legacy = path.join(root, 'logs'), releases = path.join(root, 'releases');
    await fs.mkdir(legacy); await fs.mkdir(releases);
    await fs.writeFile(path.join(legacy, 'history.jsonl'), JSON.stringify({ id: 'old', status: 'success', startedAt: '2026-01-01' }) + '\n');
    await fs.writeFile(path.join(releases, 'new.json'), JSON.stringify({ id: 'new', status: 'failed', startedAt: '2026-02-01', rollback: 'restored' }));
    const rows = readDeploymentHistory({ DEPLOY_LOG_DIR: legacy, DEPLOY_RELEASES_DIR: releases });
    assert.deepEqual(rows.map(row => row.id), ['new', 'old']); assert.equal(rows[0].rollback, 'restored');
    assert.deepEqual(readDeploymentHistory({}, root), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
