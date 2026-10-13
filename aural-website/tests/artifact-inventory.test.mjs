import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { auditWebsite } from '../scripts/audit-runtime.js'
import {
  MANIFEST_NAME,
  snapshotOutput,
  validateProvenance,
  verifyArtifactManifest,
  writeArtifactManifest
} from '../scripts/artifact-inventory.mjs'

const scratchRoot = fileURLToPath(new URL('../../logs/step11-20261013/', import.meta.url))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => `${JSON.stringify(value, null, 2)}\n`
const identity = (name, version, lockPath = `node_modules/${name}`) => ({ name, version, lockPath })
const bundledModule = (pkg, suffix = 'index.js') => ({ id: `package/${pkg.lockPath}/${suffix}`, kind: 'package', package: pkg })

async function withFixture(action) {
  await fs.mkdir(scratchRoot, { recursive: true })
  const rootDir = await fs.mkdtemp(path.join(scratchRoot, 'artifact-inventory-'))
  const outputDir = path.join(rootDir, '.output')
  const manifestPath = path.join(outputDir, MANIFEST_NAME)
  const packageJson = {
    name: 'artifact-fixture', version: '1.0.0', private: true,
    dependencies: { safe: '1.0.0', shared: '1.0.0', parent: '1.0.0' },
    devDependencies: { 'dev-client': '2.0.0' }
  }
  const lock = {
    name: packageJson.name, version: packageJson.version, lockfileVersion: 3, requires: true,
    packages: {
      '': { ...packageJson },
      'node_modules/safe': { version: '1.0.0' },
      'node_modules/shared': { version: '1.0.0' },
      'node_modules/parent': { version: '1.0.0', dependencies: { shared: '2.0.0' } },
      'node_modules/parent/node_modules/shared': { version: '2.0.0' },
      'node_modules/dev-client': { version: '2.0.0', dev: true }
    }
  }
  const lockBytes = json(lock)
  const provenance = {
    lockfileSha256: hash(lockBytes),
    stages: {
      client: { chunks: [{ file: 'foo.js', modules: [
        { id: 'project/pages/index.vue', kind: 'project', package: null },
        bundledModule(identity('shared', '1.0.0')),
        bundledModule(identity('dev-client', '2.0.0'))
      ] }] },
      ssr: { chunks: [{ file: 'entry.mjs', modules: [
        bundledModule(identity('shared', '2.0.0', 'node_modules/parent/node_modules/shared')),
        bundledModule(identity('safe', '1.0.0'))
      ] }] },
      nitro: { chunks: [{ file: 'index.mjs', modules: [bundledModule(identity('safe', '1.0.0'))] }] }
    }
  }
  for (const stage of Object.values(provenance.stages)) {
    stage.graphModules = structuredClone(stage.chunks.flatMap(chunk => chunk.modules))
  }
  const files = {
    'server/index.mjs': 'export const server = "fixture";\n',
    'public/foo.js': 'globalThis.fixture = "你好";\n',
    'server/node_modules/safe/package.json': json({ name: 'safe', version: '1.0.0', type: 'module' }),
    'server/node_modules/safe/index.js': 'export const safe = true;\n'
  }
  try {
    await fs.writeFile(path.join(rootDir, 'package.json'), json(packageJson))
    await fs.writeFile(path.join(rootDir, 'package-lock.json'), lockBytes)
    for (const [relative, contents] of Object.entries(files)) {
      const file = path.join(outputDir, relative)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, contents)
    }
    await action({ rootDir, outputDir, manifestPath, packageJson, lock, provenance, files })
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true })
  }
}

async function changeManifest(fixture, change) {
  const manifest = JSON.parse(await fs.readFile(fixture.manifestPath, 'utf8'))
  change(manifest)
  await fs.writeFile(fixture.manifestPath, json(manifest))
}

test('real output seals and verifies every byte, retaining nested versions and client dev dependencies', async () => {
  await withFixture(async fixture => {
    const manifest = await writeArtifactManifest(fixture)
    const result = await verifyArtifactManifest(fixture)
    assert.deepEqual(result.manifest, manifest)
    assert.equal(manifest.schemaVersion, 1)
    assert.deepEqual(manifest.files, await snapshotOutput(fixture.outputDir))
    assert.equal(manifest.files.length, Object.keys(fixture.files).length)
    for (const item of manifest.files) {
      const original = fixture.files[item.path]
      assert.equal(item.size, Buffer.byteLength(original))
      assert.equal(item.sha256, hash(original))
    }
    assert.equal(manifest.files.some(item => item.path === MANIFEST_NAME), false)
    assert.deepEqual(result.packages.filter(pkg => pkg.name === 'shared'), [
      { ...identity('shared', '1.0.0'), targets: ['client'] },
      { ...identity('shared', '2.0.0', 'node_modules/parent/node_modules/shared'), targets: ['ssr'] }
    ])
    assert.deepEqual(result.packages.find(pkg => pkg.name === 'dev-client'), {
      ...identity('dev-client', '2.0.0'), targets: ['client']
    })
    assert.deepEqual(result.packages.filter(pkg => pkg.name === 'safe'), [
      { ...identity('safe', '1.0.0'), targets: ['nitro', 'ssr'] },
      { name: 'safe', version: '1.0.0', path: 'server/node_modules/safe', lockPaths: ['node_modules/safe'], targets: ['external'] }
    ])
    assert.deepEqual(await writeArtifactManifest(fixture), manifest, 'resealing unchanged output must not include its own previous manifest')
  })
})

test('verification rejects missing, malformed and unsupported inventory metadata', async t => {
  const cases = [
    ['missing file', async fixture => fs.unlink(fixture.manifestPath), /ENOENT/],
    ['invalid JSON', async fixture => fs.writeFile(fixture.manifestPath, '{'), /JSON/],
    ['unknown schema', async fixture => changeManifest(fixture, value => { value.schemaVersion = 2 }), /unsupported inventory/],
    ['missing inputs', async fixture => changeManifest(fixture, value => { delete value.inputs }), /unsupported inventory/],
    ['missing checksums', async fixture => changeManifest(fixture, value => { value.files = [] }), /missing artifact checksums/],
    ['wrong provenance digest', async fixture => changeManifest(fixture, value => { value.provenance.lockfileSha256 = '0'.repeat(64) }), /provenance does not match lock/]
  ]
  for (const [name, mutate, error] of cases) await t.test(name, () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    await mutate(fixture)
    await assert.rejects(verifyArtifactManifest(fixture), error)
  }))
})

test('all three provenance stages require nonempty, attributed module graphs', async t => {
  const cases = [
    ['missing SSR stage', value => { delete value.stages.ssr }, /all three build stages/],
    ['unknown stage', value => { value.stages.extra = value.stages.client }, /all three build stages/],
    ['empty client chunks', value => { value.stages.client.chunks = [] }, /missing client chunks/],
    ['empty Nitro modules', value => { value.stages.nitro.chunks[0].modules = [] }, /empty nitro module graph/],
    ['missing package attribution', value => { delete value.stages.client.chunks[0].modules[0].package }, /missing attribution/],
    ['duplicate chunks', value => { value.stages.ssr.chunks.push(value.stages.ssr.chunks[0]) }, /duplicate ssr chunk/],
    ['duplicate modules', value => { value.stages.nitro.chunks[0].modules.push(value.stages.nitro.chunks[0].modules[0]) }, /module identifier/],
    ['traversal chunk', value => { value.stages.client.chunks[0].file = '../foo.js' }, /invalid or duplicate client chunk/],
    ...['client', 'ssr', 'nitro'].flatMap(stage => [
      [`missing ${stage} loaded graph`, value => { delete value.stages[stage].graphModules }, new RegExp(`missing ${stage} loaded module graph`)],
      [`empty ${stage} loaded graph`, value => { value.stages[stage].graphModules = [] }, new RegExp(`missing ${stage} loaded module graph`)]
    ])
  ]
  for (const [name, mutate, error] of cases) await t.test(name, () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    await changeManifest(fixture, manifest => mutate(manifest.provenance))
    await assert.rejects(verifyArtifactManifest(fixture), error)
  }))
})

test('bundled package identity must bind exact name, version and nested lock location', async t => {
  const cases = [
    ['wrong name', pkg => { pkg.name = 'other' }],
    ['wrong version', pkg => { pkg.version = '1.0.1' }],
    ['wrong nested location', pkg => { pkg.lockPath = 'node_modules/parent/node_modules/shared' }],
    ['absent lock entry', pkg => { pkg.lockPath = 'node_modules/missing' }],
    ['traversal lock location', pkg => { pkg.lockPath = '../node_modules/shared' }],
    ['noncanonical version', pkg => { pkg.version = 'v1.0.0' }]
  ]
  for (const [name, mutate] of cases) await t.test(name, () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    await changeManifest(fixture, manifest => mutate(manifest.provenance.stages.client.chunks[0].modules[1].package))
    await assert.rejects(verifyArtifactManifest(fixture), /bundled package/)
  }))
})

test('chunk and loaded graph modules must bind kind, identifier and package attribution', async t => {
  const cases = [
    ['null package identity', module => { module.package = null }],
    ['unknown kind', module => { module.kind = 'unclassified' }],
    ['identifier prefix differs from kind', module => { module.id = 'project/local.js' }],
    ['identifier points at a different lock entry', module => { module.id = 'package/node_modules/parent/node_modules/shared/index.js' }],
    ['virtual module carries a package', module => { module.kind = 'virtual'; module.id = 'virtual/fixture' }],
    ['nested dependency attributed to its outer package', module => {
      module.id = 'package/node_modules/parent/node_modules/shared/index.js'
      module.package = identity('parent', '1.0.0')
    }],
    ['package identifier traverses outside its package', module => {
      module.id = 'package/node_modules/dev-client/../shared/index.js'
    }]
  ]
  for (const collection of ['chunk', 'graph']) {
    for (const [name, mutate] of cases) await t.test(`${collection}: ${name}`, () => withFixture(async fixture => {
      await writeArtifactManifest(fixture)
      await changeManifest(fixture, manifest => {
        const stage = manifest.provenance.stages.client
        const modules = collection === 'chunk' ? stage.chunks[0].modules : stage.graphModules
        mutate(modules.find(module => module.package?.name === 'dev-client'))
      })
      await assert.rejects(verifyArtifactManifest(fixture), /kind|module|package|attribution/)
    }))
  }
})

test('null or non-string package versions cannot match equally malformed lock entries', async t => {
  for (const version of [null, 100, {}, ['1.0.0']]) await t.test(JSON.stringify(version), () => withFixture(async fixture => {
    const pkg = fixture.provenance.stages.client.chunks[0].modules[2].package
    pkg.version = version
    fixture.lock.packages[pkg.lockPath].version = version
    assert.throws(() => validateProvenance(fixture.provenance, fixture.lock), /bundled package/)
  }))
})

test('blank package names cannot match equally malformed lock metadata', async () => {
  await withFixture(async fixture => {
    const pkg = fixture.provenance.stages.client.chunks[0].modules[2].package
    pkg.name = '  '
    fixture.lock.packages[pkg.lockPath].name = pkg.name
    assert.throws(() => validateProvenance(fixture.provenance, fixture.lock), /invalid bundled package identity/)
  })
})

test('lock metadata and provenance cannot change between build collection and sealing', async t => {
  for (const version of [2, 3]) await t.test(`lock v${version}`, () => withFixture(async fixture => {
    fixture.lock.lockfileVersion = version
    fixture.lock.packages['node_modules/safe'].version = '1.0.1'
    await fs.writeFile(path.join(fixture.rootDir, 'package-lock.json'), json(fixture.lock))
    await assert.rejects(writeArtifactManifest(fixture), /v3 package lock|lockfile changed during build/)
    await assert.rejects(fs.access(fixture.manifestPath), /ENOENT/)
  }))
})

test('changed, missing or added output is rejected even outside known entrypoints', async t => {
  const cases = [
    ['modified client file', fixture => fs.appendFile(path.join(fixture.outputDir, 'public/foo.js'), '// changed')],
    ['missing external code', fixture => fs.unlink(path.join(fixture.outputDir, 'server/node_modules/safe/index.js'))],
    ['added hidden server file', fixture => fs.writeFile(path.join(fixture.outputDir, 'server/.extra'), 'extra')],
    ['added public asset', fixture => fs.writeFile(path.join(fixture.outputDir, 'public/extra.json'), '{}')]
  ]
  for (const [name, mutate] of cases) await t.test(name, () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    await mutate(fixture)
    await assert.rejects(verifyArtifactManifest(fixture), /output files changed, missing or added/)
  }))
})

test('package and lock bytes are bound to the output even for metadata-only changes', async t => {
  for (const file of ['package.json', 'package-lock.json']) await t.test(file, () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    await fs.appendFile(path.join(fixture.rootDir, file), '\n')
    await assert.rejects(verifyArtifactManifest(fixture), /stale or unsupported inventory/)
  }))
})

test('checksum entries reject duplicates, unsafe paths and invalid size or hash fields', async t => {
  const cases = [
    ['duplicate path', files => files.push({ ...files[0] })],
    ['parent path', files => { files[0].path = '../escaped.js' }],
    ['absolute path', files => { files[0].path = '/escaped.js' }],
    ['Windows drive', files => { files[0].path = 'C:/escaped.js' }],
    ['backslash', files => { files[0].path = 'public\\escaped.js' }],
    ['self reference', files => { files[0].path = MANIFEST_NAME }],
    ['negative size', files => { files[0].size = -1 }],
    ['fractional size', files => { files[0].size = 1.5 }],
    ['invalid hash', files => { files[0].sha256 = 'invalid' }]
  ]
  for (const [name, mutate] of cases) await t.test(name, () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    await changeManifest(fixture, manifest => mutate(manifest.files))
    await assert.rejects(verifyArtifactManifest(fixture), /invalid artifact checksum entry/)
  }))
})

test('invented external inventory is rejected independently of valid file checksums', async () => {
  await withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    await changeManifest(fixture, manifest => { manifest.external[0].version = '9.9.9' })
    await assert.rejects(verifyArtifactManifest(fixture), /external inventory does not match artifact/)
  })
})

test('sealing refuses external packages absent from lock or with malformed metadata', async t => {
  const cases = [
    ['unknown version', json({ name: 'safe', version: '9.9.9' }), /external package absent from lock/],
    ['missing version', json({ name: 'safe' }), /invalid external package/],
    ['null version', json({ name: 'safe', version: null }), /invalid external package/],
    ['blank name', json({ name: '  ', version: '1.0.0' }), /invalid external package/],
    ['empty metadata', '{}', /invalid external package/],
    ['broken JSON', '{', /JSON/]
  ]
  for (const [name, contents, error] of cases) await t.test(name, () => withFixture(async fixture => {
    await fs.writeFile(path.join(fixture.outputDir, 'server/node_modules/safe/package.json'), contents)
    await assert.rejects(writeArtifactManifest(fixture), error)
    await assert.rejects(fs.access(fixture.manifestPath), /ENOENT/)
  }))
})

test('hidden external entries cannot silently disappear from package attribution', async t => {
  for (const kind of ['file', 'directory']) await t.test(kind, () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    const hidden = path.join(fixture.outputDir, 'server/node_modules/.hidden')
    if (kind === 'directory') {
      await fs.mkdir(hidden)
      await fs.writeFile(path.join(hidden, 'unattributed.js'), 'export default "hidden"')
    } else await fs.writeFile(hidden, 'hidden bytes')
    // Even correct checksums must not allow unattributed hidden external packages.
    const actualFiles = await snapshotOutput(fixture.outputDir)
    await changeManifest(fixture, manifest => { manifest.files = actualFiles })
    await assert.rejects(verifyArtifactManifest(fixture), /unsupported hidden external entry/)
    await assert.rejects(writeArtifactManifest(fixture), /unsupported hidden external entry/)
  }))
})

test('file and directory symlink escapes are refused during sealing and later verification', async t => {
  for (const kind of ['file', 'directory']) await t.test(kind, () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    const outside = path.join(fixture.rootDir, 'outside-output')
    await fs.mkdir(outside)
    const target = path.join(outside, 'external.js')
    await fs.writeFile(target, 'external fixture bytes')
    await fs.symlink(kind === 'file' ? target : outside, path.join(fixture.outputDir, 'public/escape'))
    await assert.rejects(snapshotOutput(fixture.outputDir), /unsupported output entry/)
    await assert.rejects(verifyArtifactManifest(fixture), /unsupported output entry/)
    await assert.rejects(writeArtifactManifest(fixture), /unsupported output entry/)
    assert.equal(await fs.readFile(target, 'utf8'), 'external fixture bytes')
  }))
})

test('an output root symlink cannot supply otherwise valid output bytes', async () => {
  await withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    const linkedOutput = path.join(fixture.rootDir, 'linked-output')
    await fs.symlink(fixture.outputDir, linkedOutput)
    await assert.rejects(snapshotOutput(linkedOutput), /output root must be a real directory/)
    await assert.rejects(verifyArtifactManifest({ ...fixture, outputDir: linkedOutput }), /output root must be a real directory/)
    await assert.rejects(writeArtifactManifest({ ...fixture, outputDir: linkedOutput }), /output root must be a real directory/)
  })
})

test('a manifest symlink is neither trusted nor overwritten through its target', async () => {
  await withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    const original = await fs.readFile(fixture.manifestPath, 'utf8')
    const target = path.join(fixture.rootDir, 'outside-manifest.json')
    await fs.writeFile(target, original)
    await fs.unlink(fixture.manifestPath)
    await fs.symlink(target, fixture.manifestPath)
    await assert.rejects(verifyArtifactManifest(fixture), /invalid inventory file/)
    await assert.rejects(writeArtifactManifest(fixture), /invalid previous inventory file/)
    assert.equal(await fs.readFile(target, 'utf8'), original)
    assert.equal((await fs.lstat(fixture.manifestPath)).isSymbolicLink(), true)
  })
})

test('audit orchestration includes dev, optional and peer packages and blocks a shipped dev advisory despite a valid exception', async t => {
  const cases = [
    { name: 'clean report', vulnerable: false },
    { name: 'affected client dev package', vulnerable: true },
    { name: 'affected dev package only in loaded graph after constant inlining', vulnerable: true, graphOnly: true }
  ]
  for (const { name, vulnerable, graphOnly } of cases) await t.test(name, () => withFixture(async fixture => {
    if (graphOnly) {
      for (const stage of Object.values(fixture.provenance.stages)) {
        for (const chunk of stage.chunks) chunk.modules = chunk.modules.filter(module => module.package?.name !== 'dev-client')
      }
      assert.equal(Object.values(fixture.provenance.stages).flatMap(stage => stage.chunks.flatMap(chunk => chunk.modules)).some(module => module.package?.name === 'dev-client'), false)
      assert.equal(fixture.provenance.stages.client.graphModules.some(module => module.package?.name === 'dev-client'), true)
    }
    await writeArtifactManifest(fixture)
    const advisoryUrl = 'https://github.com/advisories/GHSA-test-dev-client'
    const today = new Date().toISOString().slice(0, 10)
    await fs.writeFile(path.join(fixture.rootDir, 'audit-exceptions.json'), json({ exceptions: vulnerable ? [{
      package: 'dev-client', advisory: advisoryUrl, path: 'artifact-fixture > dev-client',
      reason: 'Synthetic reviewed toolchain exception must not exempt shipped client code.',
      reviewed: today, expires: today
    }] : [] }))
    const report = {
      auditReportVersion: 2,
      vulnerabilities: vulnerable ? {
        'dev-client': { name: 'dev-client', severity: 'high', via: [{
          name: 'dev-client', severity: 'high', title: 'Synthetic client dev dependency vulnerability',
          range: '<=2.0.0', url: advisoryUrl
        }] }
      } : {},
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: Number(vulnerable), critical: 0, total: Number(vulnerable) } }
    }
    const calls = []
    const run = (...args) => {
      calls.push(args)
      return { status: Number(vulnerable), signal: null, stdout: JSON.stringify(report), stderr: '' }
    }
    if (vulnerable) await assert.rejects(auditWebsite({ ...fixture, run }), error => {
      assert.match(error.message, /affected package in build\/artifact inventory: high dev-client@<=2\.0\.0/)
      assert.match(error.message, /dev-client@2\.0\.0 \[client\]/)
      assert.doesNotMatch(error.message, /not reviewed|exception expired|exception package mismatch/)
      return true
    })
    else {
      const result = await auditWebsite({ ...fixture, run })
      assert.equal(result.advisories.size, 0)
      assert.deepEqual(result.stale, [])
      assert.equal(result.packages.some(pkg => pkg.name === 'dev-client' && pkg.targets.includes('client')), true)
    }
    assert.equal(calls.length, 1)
    assert.equal(calls[0][0], 'npm')
    assert.deepEqual(calls[0][1], ['audit', '--include=dev', '--include=optional', '--include=peer', '--json'])
    assert.equal(calls[0][2].cwd, fixture.rootDir)
  }))
})

test('audit orchestration rejects missing or tampered output before invoking npm', async t => {
  for (const missing of [true, false]) await t.test(missing ? 'missing output' : 'tampered output', () => withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    if (missing) await fs.rm(fixture.outputDir, { recursive: true })
    else await fs.appendFile(path.join(fixture.outputDir, 'public/foo.js'), '// unexpected bytes')
    let calls = 0
    const run = () => { calls++; throw new Error('npm must not run before output verification') }
    await assert.rejects(auditWebsite({ ...fixture, run }), missing ? /ENOENT/ : /output files changed, missing or added/)
    assert.equal(calls, 0)
  }))
})

test('audit orchestration fails closed on a registry error after verifying the artifact', async () => {
  await withFixture(async fixture => {
    await writeArtifactManifest(fixture)
    await fs.writeFile(path.join(fixture.rootDir, 'audit-exceptions.json'), json({ exceptions: [] }))
    let calls = 0
    const run = () => {
      calls++
      return { status: 1, signal: null, stdout: JSON.stringify({ error: { code: 'ENOAUDIT', summary: 'Synthetic registry error' } }), stderr: '' }
    }
    await assert.rejects(auditWebsite({ ...fixture, run }), /npm audit returned an invalid v2 report/)
    assert.equal(calls, 1)
  })
})
