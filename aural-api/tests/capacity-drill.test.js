const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { parseArgs, validateScratchRoot, isolatedEnv, profiles } = require('../scripts/drill-capacity');
const repo = path.resolve(__dirname, '../..');
const scratch = path.join(repo, 'logs/step13-20261013/test-scratch');

test('capacity CLI only accepts explicit repository-log roots and fixed bounded profiles', () => {
  assert.deepEqual(parseArgs(['--scratch-root', scratch, '--profile', 'empty']), { scratchRoot: scratch, profile: 'empty' });
  for (const args of [[], ['--profile', 'large'], ['--scratch-root', 'relative', '--profile', 'empty'],
    ['--scratch-root', repo, '--profile', 'empty'], ['--scratch-root', path.join(repo, 'logs/../aural-api'), '--profile', 'large'],
    ['--scratch-root', scratch, '--profile', 'huge'], ['--scratch-root', scratch, '--profile', 'empty', '--profile', 'large'],
    ['--scratch-root', scratch, '--profile', 'empty', '--database', '/unapproved.db']]) assert.throws(() => parseArgs(args));
  assert.deepEqual(profiles.large, { auditRows: 100000, historyRows: 100000, assetMiB: 128 });
});

test('capacity scratch validation rejects symlink redirection and preserves neighboring data', async t => {
  const parent = path.join(repo, 'logs/step13-20261013'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'capacity-path-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const actual = path.join(root, 'actual'); await fs.mkdir(actual);
  await fs.writeFile(path.join(actual, 'keep.txt'), 'neighbor');
  const link = path.join(root, 'redirect'); await fs.symlink(actual, link);
  await assert.rejects(validateScratchRoot(path.join(link, 'child')), { code: 'CAPACITY_SCRATCH_PATH' });
  assert.equal(await fs.readFile(path.join(actual, 'keep.txt'), 'utf8'), 'neighbor');
  assert.deepEqual(await fs.readdir(actual), ['keep.txt']);
  const valid = path.join(root, 'new'); assert.equal(await validateScratchRoot(valid), valid);
});

test('capacity child environment excludes ambient application settings and missing CLI input fails before creating data', async () => {
  const before = process.env.DATABASE_URL, webhook = process.env.ALERT_WEBHOOK_URL;
  process.env.DATABASE_URL = 'file:/unapproved.db'; process.env.ALERT_WEBHOOK_URL = 'https://example.invalid/private';
  try {
    const env = isolatedEnv(scratch);
    assert.equal(env.DATABASE_URL, `file:${path.join(scratch, 'source.db')}`);
    assert.equal(env.ALERT_WEBHOOK_URL, ''); assert.equal(env.TOKIO_WORKER_THREADS, '2'); assert.equal(env.NODE_OPTIONS, '');
    assert.equal(env.ADMIN_TOKEN_SECRET, undefined);
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/drill-capacity.js')], { cwd: repo, env, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /CAPACITY_SCRATCH_PATH/);
  } finally {
    if (before === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = before;
    if (webhook === undefined) delete process.env.ALERT_WEBHOOK_URL; else process.env.ALERT_WEBHOOK_URL = webhook;
  }
});


// Preload only this real CLI parent. Its workers receive the CLI's own isolated
// environment, so every phase and all three server drains still run unchanged.
const finalizationPreload = String.raw`
const fs = require('node:fs');
const promises = require('node:fs/promises');
const path = require('node:path');
const children = require('node:child_process');
const active = new Set();
const spawn = children.spawn;
children.spawn = (...args) => {
  const child = spawn(...args); active.add(child.pid);
  child.once('exit', () => active.delete(child.pid));
  return child;
};
let finalRoot, armed = true;
const emit = process.emit;
process.emit = function(type, ...args) {
  const result = emit.call(this, type, ...args);
  if (['SIGINT', 'SIGTERM'].includes(type) && process.connected)
    process.send({ type: 'signal-observed', signal: type });
  return result;
};
async function gate(stage) {
  if (!armed || process.env.CAPACITY_TEST_STAGE !== stage) return;
  armed = false;
  await new Promise(resolve => {
    const release = message => {
      if (message?.command !== 'release') return;
      process.off('message', release);
      if (message.expireBudget) {
        const now = Date.now; Date.now = () => now() + 21 * 60 * 1000;
      }
      process.disconnect();
      resolve();
    };
    process.on('message', release);
    process.send({ type: 'finalization-gate', stage, active: [...active], root: finalRoot });
  });
}
const write = promises.writeFile;
promises.writeFile = async (file, data, ...args) => {
  const result = await write(file, data, ...args);
  if (path.basename(String(file)) === 'report.json') {
    const report = JSON.parse(String(data));
    if (Object.keys(report.shutdown || {}).length === 3) finalRoot = path.dirname(file);
    if (report.status === 'passed') await gate('report');
  }
  return result;
};
const read = fs.createReadStream;
fs.createReadStream = (file, ...args) => {
  const stream = read(file, ...args);
  if (finalRoot && file === path.join(finalRoot, 'source.db')) {
    const iterate = stream[Symbol.asyncIterator].bind(stream);
    stream[Symbol.asyncIterator] = async function*() {
      await gate('source');
      yield* iterate();
    };
  }
  return stream;
};
const rm = promises.rm;
promises.rm = async (file, ...args) => {
  if (finalRoot && path.dirname(file) === finalRoot) await gate('cleanup');
  return rm(file, ...args);
};
`;

const interruptions = ['source', 'cleanup', 'report'].flatMap(stage => ['SIGINT', 'SIGTERM'].map(signal => ({ stage, signal })));
interruptions.push({ stage: 'cleanup', signal: null });
for (const { stage, signal } of interruptions) {
  test(`capacity CLI records failure for ${signal || 'deadline expiry'} during final ${stage} with no active child`, { timeout: 120000 }, async t => {
    const parent = path.join(repo, 'logs/step13-20261013'); await fs.mkdir(parent, { recursive: true });
    const fixture = await fs.mkdtemp(path.join(parent, 'capacity-signal-test-'));
    const preload = path.join(fixture, 'finalization-preload.cjs'); await fs.writeFile(preload, finalizationPreload);
    const child = spawn(process.execPath, ['--require', preload, path.resolve(__dirname, '../scripts/drill-capacity.js'),
      '--scratch-root', fixture, '--profile', 'empty'], {
      cwd: repo, env: { ...isolatedEnv(fixture), CAPACITY_TEST_STAGE: stage }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let output = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const messages = [], waiting = new Set();
    let ended;
    const exited = new Promise(resolve => child.once('exit', (code, exitSignal) => {
      ended = { code, signal: exitSignal };
      for (const waiter of waiting) waiter.resolve({ type: 'exit', ...ended });
      waiting.clear(); resolve(ended);
    }));
    child.on('message', message => {
      messages.push(message);
      for (const waiter of waiting) if (waiter.matches(message)) { waiting.delete(waiter); waiter.resolve(message); }
    });
    const wait = matches => {
      const found = messages.find(matches);
      if (found) return Promise.resolve(found);
      if (ended) return Promise.resolve({ type: 'exit', ...ended });
      return new Promise(resolve => waiting.add({ matches, resolve }));
    };
    const timeout = setTimeout(() => child.kill('SIGKILL'), 110000);
    t.after(async () => {
      clearTimeout(timeout);
      if (!ended) { child.kill('SIGKILL'); await exited; }
      await fs.rm(fixture, { recursive: true, force: true });
    });
    const gate = await wait(message => message.type === 'finalization-gate');
    assert.equal(gate.type, 'finalization-gate', output);
    assert.equal(gate.stage, stage);
    assert.deepEqual(gate.active, [], 'the interrupted process must be the parent after all children exited');
    if (signal) {
      assert.ok(child.kill(signal));
      const observed = await wait(message => message.type === 'signal-observed');
      if (observed.type !== 'exit') child.send({ command: 'release' });
    } else child.send({ command: 'release', expireBudget: true });
    const exit = await exited;
    const report = JSON.parse(await fs.readFile(path.join(gate.root, 'report.json'), 'utf8'));
    assert.equal(report.status, 'failed', `signal must not leave a passed report: ${JSON.stringify(exit)} ${output}`);
    assert.equal(report.error.code, signal ? 'CAPACITY_INTERRUPTED' : 'CAPACITY_DEADLINE');
    if (signal) assert.match(report.error.message, new RegExp(signal));
    assert.equal(exit.code, 1, output);
    assert.equal(exit.signal, null);
    assert.equal(report.sourceUnchanged, true);
    assert.equal(report.stableCore, true);
    const retained = await fs.readdir(gate.root);
    assert.ok(retained.every(name => name === 'report.json' || name.endsWith('.log')), 'generated databases and assets are cleaned before the final report');
    assert.equal(Object.keys(report.shutdown).length, 3);
  });
}
