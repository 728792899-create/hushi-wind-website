import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHooks } from 'hookable'
import { createProvenanceCollector, installProvenance } from '../scripts/provenance-module.mjs'

const websiteRoot = fileURLToPath(new URL('../', import.meta.url))
const evidenceRoot = fileURLToPath(new URL('../../logs/step11-20261013/', import.meta.url))

async function fixture(t) {
  await fs.mkdir(evidenceRoot, { recursive: true })
  const rootDir = await fs.mkdtemp(path.join(evidenceRoot, 'provenance-test-'))
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }))
  const packages = {
    'node_modules/provenance-fixture': { name: 'provenance-fixture', version: '1.0.0', code: 'export function used(value) { return value * 7 }; export const unused = 9' },
    'node_modules/provenance-fixture/node_modules/@fixture/second': { name: '@fixture/second', version: '2.0.0', code: 'module.exports = { nested: 3 }' },
    'node_modules/@fixture/second': { name: '@fixture/second', version: '1.0.0', code: 'export function rootVersion(value) { return value + 4 }' },
    'node_modules/constant-package': { name: 'constant-package', version: '1.0.0', code: 'export const folded = 123' },
    'node_modules/not-bundled': { name: 'not-bundled', version: '8.0.0', code: 'export const neverImported = 100' }
  }
  const lock = { name: 'provenance-test', version: '1.0.0', lockfileVersion: 3, packages: {} }
  for (const [lockPath, { name, version, code }] of Object.entries(packages)) {
    const directory = path.join(rootDir, lockPath)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version, main: 'index.js', sideEffects: false }))
    await fs.writeFile(path.join(directory, 'index.js'), code)
    lock.packages[lockPath] = { version }
  }
  await fs.writeFile(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'provenance-test', type: 'module' }))
  await fs.writeFile(path.join(rootDir, 'package-lock.json'), JSON.stringify(lock))
  await fs.writeFile(path.join(rootDir, 'entry.js'), `
    import { used } from './node_modules/provenance-fixture/index.js';
    import second from './node_modules/provenance-fixture/node_modules/@fixture/second/index.js';
    import { rootVersion } from './node_modules/@fixture/second/index.js';
    import { folded } from './node_modules/constant-package/index.js';
    export function result(value) { return used(value) + second.nested + rootVersion(value) + folded };
  `)
  return { rootDir, lock }
}

const allModules = stage => stage.chunks.flatMap(chunk => chunk.modules)
const graphContext = ids => ({ getModuleIds: () => ids.values(), getModuleInfo: () => ({ code: 'fixture' }) })
const emit = (plugin, id, fileName = 'entry.mjs', renderedLength = 1) => plugin.generateBundle.handler.call(graphContext([id]), {}, {
  [fileName]: { type: 'chunk', fileName, modules: { [id]: { renderedLength } } }
})

test('real Vite client/SSR and Rollup output retain exact nested package versions and chunk membership', async t => {
  const originalNodeEnv = process.env.NODE_ENV
  t.after(() => { if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv })
  const { rootDir } = await fixture(t)
  const generated = path.join(rootDir, 'generated')
  const collector = await createProvenanceCollector({ rootDir, generatedDirs: [generated] })
  const { build } = await import('vite')
  const options = stage => ({
    configFile: false, root: rootDir, logLevel: 'silent',
    plugins: [collector.plugin(stage)],
    ssr: { noExternal: true },
    build: {
      ssr: stage === 'ssr', minify: false, sourcemap: false,
      outDir: path.join(generated, stage),
      lib: { entry: path.join(rootDir, 'entry.js'), formats: ['es'], fileName: () => 'entry.mjs' },
      rolldownOptions: { output: { entryFileNames: 'entry.mjs' } }
    }
  })
  await build(options('client'))
  await build(options('ssr'))
  const { rollup } = await import('rollup')
  const bundle = await rollup({ input: path.join(generated, 'ssr/entry.mjs'), plugins: [collector.plugin('nitro')] })
  try { await bundle.write({ dir: path.join(generated, 'nitro'), format: 'es' }) } finally { await bundle.close() }
  const provenance = collector.snapshot()
  for (const stage of ['client', 'ssr']) {
    const packages = allModules(provenance.stages[stage]).flatMap(module => module.package ? [module.package] : [])
    assert.ok(packages.some(pkg => pkg.name === '@fixture/second' && pkg.version === '1.0.0' && pkg.lockPath === 'node_modules/@fixture/second'), `${stage}: ${JSON.stringify(packages)}`)
    assert.ok(packages.some(pkg => pkg.name === '@fixture/second' && pkg.version === '2.0.0' && pkg.lockPath === 'node_modules/provenance-fixture/node_modules/@fixture/second'))
    assert.ok(packages.some(pkg => pkg.name === 'provenance-fixture'))
    assert.equal(packages.some(pkg => pkg.name === 'not-bundled'), false)
    assert.equal(packages.some(pkg => pkg.name === 'constant-package'), false, 'the real constant-folding regression must occur')
    assert.ok(provenance.stages[stage].graphModules.some(module => module.package?.name === 'constant-package'), 'loaded graph must retain folded constant provenance')
    assert.equal(provenance.stages[stage].graphModules.some(module => module.package?.name === 'not-bundled'), false)
    assert.ok(allModules(provenance.stages[stage]).every(module => Number.isInteger(module.renderedLength)))
  }
  // Nitro sees the already bundled SSR file, not the original package modules.
  // Dropping the SSR stage would therefore silently lose their provenance.
  assert.ok(allModules(provenance.stages.nitro).some(module => module.kind === 'generated'))
  assert.equal(allModules(provenance.stages.nitro).some(module => module.package), false)
  assert.equal(JSON.stringify(provenance).includes(rootDir), false)
  assert.equal(JSON.stringify(provenance).includes('\u0000'), false)
})

test('CommonJS wrappers, query modules and virtual IDs preserve attribution without host paths', async t => {
  const { rootDir } = await fixture(t)
  const collector = await createProvenanceCollector({ rootDir })
  const physical = path.join(rootDir, 'node_modules/provenance-fixture/index.js')
  const ids = [physical, `\0${physical}?commonjs-proxy`, `\0virtual:${rootDir}/internal.js`, `${path.join(rootDir, 'entry.js')}?vue&type=script`]
  await collector.plugin('client').generateBundle.handler.call(graphContext(ids), {}, {
    'bundle.mjs': { type: 'chunk', fileName: 'bundle.mjs', modules: {
      [physical]: { renderedLength: 20 },
      [`\0${physical}?commonjs-proxy`]: { renderedLength: 0 },
      [`\0virtual:${rootDir}/internal.js`]: { renderedLength: 1 },
      [`${path.join(rootDir, 'entry.js')}?vue&type=script`]: { renderedLength: 4 }
    } }
  })
  await emit(collector.plugin('ssr'), path.join(rootDir, 'entry.js'))
  await emit(collector.plugin('nitro'), path.join(rootDir, 'entry.js'))
  const modules = allModules(collector.snapshot().stages.client)
  assert.equal(modules.filter(module => module.package?.name === 'provenance-fixture').length, 2)
  assert.ok(modules.some(module => module.kind === 'package' && module.renderedLength === 0))
  assert.ok(modules.some(module => module.kind === 'virtual' && module.package === null))
  assert.ok(modules.some(module => module.kind === 'project'))
  assert.equal(JSON.stringify(modules).includes(rootDir), false)
})

test('unlocked package identity, package symlinks and incomplete or duplicate stages fail closed', async t => {
  const { rootDir } = await fixture(t)
  const collector = await createProvenanceCollector({ rootDir })
  assert.throws(() => collector.snapshot(), /missing client output/)
  const physical = path.join(rootDir, 'node_modules/provenance-fixture/index.js')
  await fs.writeFile(path.join(rootDir, 'node_modules/provenance-fixture/package.json'), JSON.stringify({ name: 'provenance-fixture', version: '9.9.9' }))
  await assert.rejects(emit(collector.plugin('client'), physical), /does not match lock/)
  const second = await createProvenanceCollector({ rootDir })
  await emit(second.plugin('client'), path.join(rootDir, 'entry.js'))
  await assert.rejects(emit(second.plugin('client'), path.join(rootDir, 'entry.js')), /more than once/)
  assert.throws(() => second.snapshot(), /missing ssr output/)
  const linked = path.join(rootDir, 'node_modules/linked-package')
  await fs.symlink(path.join(rootDir, 'node_modules/@fixture/second'), linked, 'junction')
  await assert.rejects(emit(second.plugin('ssr'), path.join(linked, 'index.js')), /symlinked package/)
  await assert.rejects(second.plugin('ssr').generateBundle.handler({}, {}), /module graph API is unavailable/)
  const invalidContext = { getModuleIds: () => ['bad'].values(), getModuleInfo: () => ({ code: undefined }) }
  await assert.rejects(second.plugin('ssr').generateBundle.handler.call(invalidContext, {}, {
    'entry.mjs': { type: 'chunk', fileName: 'entry.mjs', modules: { [path.join(rootDir, 'entry.js')]: { renderedLength: 0 } } }
  }), /unsupported module graph entry/)
})

test('Nitro route chunk separators normalize without allowing traversal or absolute paths', async t => {
  const { rootDir } = await fixture(t)
  const collector = await createProvenanceCollector({ rootDir })
  const id = path.join(rootDir, 'entry.js')
  await assert.rejects(emit(collector.plugin('client'), id, '../outside.mjs'), /unsafe chunk filename/)
  await assert.rejects(emit(collector.plugin('client'), id, '/outside.mjs'), /unsafe chunk filename/)
  await emit(collector.plugin('client'), id)
  await emit(collector.plugin('ssr'), id)
  await emit(collector.plugin('nitro'), id, 'chunks/routes//renderer.mjs')
  assert.equal(collector.snapshot().stages.nitro.chunks[0].file, 'chunks/routes/renderer.mjs')
})

test('Nuxt seals only after the original Nitro build and its final callbacks, with fresh stages', async t => {
  const { rootDir } = await fixture(t)
  const hooks = createHooks()
  const nuxt = { hook: hooks.hook.bind(hooks), options: { rootDir, buildDir: path.join(rootDir, 'generated'), experimental: { buildCache: true } } }
  const order = []
  let recorded
  await installProvenance(nuxt, async options => { order.push('seal'); recorded = options })
  assert.equal(nuxt.options.experimental.buildCache, false)
  const nitro = { hooks: createHooks(), options: { preset: 'node-server', buildDir: path.join(rootDir, 'nitro'), output: { dir: path.join(rootDir, 'output') } } }
  await hooks.callHook('nitro:init', nitro)
  nitro.hooks.hook('compiled', async () => { await Promise.resolve(); order.push('preset-final-files') })
  for (const stage of ['client', 'ssr']) {
    const config = {}
    await hooks.callHook('vite:extendConfig', config, { isClient: stage === 'client' })
    assert.equal(config.plugins[0].apply, 'build')
    assert.equal(config.plugins[0].applyToEnvironment({ name: stage }), true)
    assert.equal(config.plugins[0].applyToEnvironment({ name: stage === 'client' ? 'ssr' : 'client' }), false)
    await emit(config.plugins[0], path.join(rootDir, 'entry.js'))
  }
  hooks.hook('build:done', async () => {
    const prerender = { hooks: createHooks() }
    await prerender.hooks.callHook('compiled', prerender)
    assert.equal(recorded, undefined)
    order.push('prerender-and-compress')
    const config = {}
    await nitro.hooks.callHook('rollup:before', nitro, config)
    await emit(config.plugins[0], path.join(rootDir, 'entry.js'))
    await nitro.hooks.callHook('compiled', nitro)
    order.push('nitro-build-returned')
  })
  await hooks.callHook('ready')
  await hooks.callHook('build:done')
  assert.deepEqual(order, ['prerender-and-compress', 'preset-final-files', 'nitro-build-returned', 'seal'])
  assert.deepEqual(Object.keys(recorded.provenance.stages).sort(), ['client', 'nitro', 'ssr'])

  const skippedHooks = createHooks()
  await installProvenance({ ...nuxt, hook: skippedHooks.hook.bind(skippedHooks) }, () => assert.fail('must not seal cached output'))
  await skippedHooks.callHook('ready')
  await assert.rejects(skippedHooks.callHook('build:done'), /Nitro did not complete/)
})

test('static generation skips Node-only collection and explicitly warns instead of writing a manifest', async t => {
  const warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  for (const options of [{ _generate: true }, { nitro: { static: true } }]) {
    await installProvenance({ options, hook: () => assert.fail('static output must not install a Node audit hook') }, () => assert.fail('static output must not be sealed'))
  }
  assert.equal(warnings.length, 2)
  assert.ok(warnings.every(message => message.includes('does not produce a Node server audit manifest')))
})

test('the real Nuxt configuration installs the production provenance module', async t => {
  const environment = { NODE_ENV: 'test', NUXT_PUBLIC_API_BASE: 'https://api.example.invalid', NUXT_PUBLIC_SITE_URL: 'https://www.example.invalid', NUXT_TELEMETRY_DISABLED: '1', JITI_FS_CACHE: '0' }
  const original = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]))
  Object.assign(process.env, environment)
  await fs.mkdir(evidenceRoot, { recursive: true })
  const scratch = await fs.mkdtemp(path.join(evidenceRoot, 'nuxt-config-'))
  let nuxt
  t.after(async () => {
    try { await nuxt?.close(); await fs.rm(scratch, { recursive: true, force: true }) } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
  const { loadNuxt } = await import('nuxt')
  nuxt = await loadNuxt({
    cwd: websiteRoot, dotenv: false, globalRc: false, rcFile: false,
    overrides: {
      dev: false, test: true, telemetry: false, _prepare: true,
      devtools: { enabled: false }, buildDir: path.join(scratch, 'nuxt'),
      nitro: { buildDir: path.join(scratch, 'nitro'), output: { dir: path.join(scratch, 'output'), serverDir: path.join(scratch, 'output/server'), publicDir: path.join(scratch, 'output/public') } }
    }
  })
  assert.ok(nuxt.options._installedModules.some(module => module.meta.name === 'hushi-build-provenance'))
  await nuxt.close()
  nuxt = undefined
  const warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  nuxt = await loadNuxt({
    cwd: websiteRoot, dotenv: false, globalRc: false, rcFile: false,
    overrides: {
      dev: false, test: true, telemetry: false, _generate: true,
      devtools: { enabled: false }, buildDir: path.join(scratch, 'static-nuxt'),
      nitro: { static: true, buildDir: path.join(scratch, 'static-nitro'), output: { dir: path.join(scratch, 'static-output'), serverDir: path.join(scratch, 'static-output/server'), publicDir: path.join(scratch, 'static-output/public') } }
    }
  })
  const config = { plugins: [] }
  await nuxt.callHook('vite:extendConfig', config, { isClient: true, isServer: false })
  assert.equal(config.plugins.some(plugin => plugin?.name?.startsWith('hushi:provenance:')), false)
  assert.ok(warnings.some(message => message.includes('does not produce a Node server audit manifest')))
})
