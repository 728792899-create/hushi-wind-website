import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import postcss from 'postcss'

const websiteRoot = fileURLToPath(new URL('../', import.meta.url))
const evidenceRoot = fileURLToPath(new URL('../../logs/step10-20261013/', import.meta.url))

test('the configured Nuxt PostCSS pipeline compiles Tailwind-compatible nesting', async (t) => {
  const fixtureEnv = {
    NODE_ENV: 'test',
    NUXT_PUBLIC_API_BASE: 'https://api.example.invalid',
    NUXT_PUBLIC_SITE_URL: 'https://www.example.invalid',
    NUXT_TELEMETRY_DISABLED: '1',
    JITI_FS_CACHE: '0'
  }
  const originalEnv = Object.fromEntries(Object.keys(fixtureEnv).map(key => [key, process.env[key]]))
  await fs.mkdir(evidenceRoot, { recursive: true })
  const scratch = await fs.mkdtemp(path.join(evidenceRoot, 'postcss-'))
  let nuxt
  t.after(async () => {
    try {
      await nuxt?.close()
    } finally {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      await fs.rm(scratch, { recursive: true, force: true })
    }
  })
  Object.assign(process.env, fixtureEnv)

  // The generated Tailwind config imports its module. Keep that resolution and
  // all disposable build metadata inside this test's own directory.
  await fs.symlink(path.join(websiteRoot, 'node_modules'), path.join(scratch, 'node_modules'), 'junction')
  const { loadNuxt } = await import('nuxt')
  nuxt = await loadNuxt({
    cwd: websiteRoot,
    dotenv: false,
    globalRc: false,
    rcFile: false,
    ready: false,
    overrides: {
      dev: false,
      test: true,
      telemetry: false,
      devtools: { enabled: false },
      _prepare: true,
      buildDir: path.join(scratch, 'nuxt'),
      nitro: {
        buildDir: path.join(scratch, 'nitro'),
        output: {
          dir: path.join(scratch, 'output'),
          serverDir: path.join(scratch, 'output/server'),
          publicDir: path.join(scratch, 'output/public')
        }
      }
    }
  })
  await nuxt.ready()
  assert.ok(nuxt.options._installedModules.some(module => module.meta.name === '@nuxtjs/tailwindcss'))

  // Render only the config registered by the real module, without build/listen
  // or touching the shared .nuxt directory used by local development.
  const tailwindConfig = nuxt.options.postcss.plugins.tailwindcss
  if (typeof tailwindConfig === 'string') {
    const template = nuxt.options.build.templates.find(entry => entry.dst === tailwindConfig)
    assert.ok(template?.getContents, 'the installed module must supply its Tailwind config')
    assert.ok(tailwindConfig.startsWith(`${scratch}${path.sep}`))
    await fs.mkdir(path.dirname(tailwindConfig), { recursive: true })
    await fs.writeFile(tailwindConfig, await template.getContents({ nuxt }), 'utf8')
  }

  // Use the same kit instance as the installed Vite builder. The module has a
  // separate older kit dependency whose resolver would hide this regression.
  const require = createRequire(import.meta.url)
  const builderRequire = createRequire(require.resolve('@nuxt/vite-builder'))
  const { tryImportModule, directoryToURL } = await import(pathToFileURL(builderRequire.resolve('@nuxt/kit')))
  const { plugins, order } = nuxt.options.postcss
  const names = typeof order === 'function' ? order(Object.keys(plugins)) : (order || Object.keys(plugins))
  const loaded = []
  const unresolved = []
  for (const name of names) {
    if (!plugins[name]) continue
    const factory = await tryImportModule(name, {
      url: nuxt.options.modulesDir.map(dir => directoryToURL(dir.replace(/\/node_modules\/?$/, '')))
    })
    if (typeof factory === 'function') loaded.push({ name, plugin: factory(plugins[name]) })
    else unresolved.push(name)
  }

  await t.test('nested selectors, Tailwind apply and responsive screen rules compile to ordinary CSS', async () => {
    const result = await postcss(loaded.map(entry => entry.plugin)).process(`
      .pipeline-probe {
        @apply p-4;
        &:hover { @apply font-bold; }
        > .label { @apply block; }
        @screen md { @apply p-8; }
      }
    `, { from: path.join(scratch, 'probe.css') })
    assert.deepEqual(result.warnings(), [])
    const rules = []
    result.root.walkRules(rule => {
      let ancestor = rule.parent
      while (ancestor && ancestor.type !== 'root') {
        assert.notEqual(ancestor.type, 'rule', `uncompiled nested selector: ${rule.selector}`)
        ancestor = ancestor.parent
      }
      assert.equal(rule.selector.includes('&'), false)
      rules.push(rule)
    })
    const declaration = (selector, property, media = false) => rules
      .filter(rule => rule.selector.replace(/\s*>\s*/g, '>') === selector)
      .filter(rule => (rule.parent.type === 'atrule') === media)
      .flatMap(rule => rule.nodes.filter(node => node.type === 'decl' && node.prop === property).map(node => node.value))
    assert.deepEqual(declaration('.pipeline-probe', 'padding'), ['1rem'])
    assert.deepEqual(declaration('.pipeline-probe:hover', 'font-weight'), ['700'])
    assert.deepEqual(declaration('.pipeline-probe>.label', 'display'), ['block'])
    assert.deepEqual(declaration('.pipeline-probe', 'padding', true), ['2rem'])
    const media = rules.find(rule => rule.parent.type === 'atrule')?.parent
    assert.equal(media?.name, 'media')
    assert.equal(media?.params.replace(/\s/g, ''), '(min-width:768px)')
    result.root.walkAtRules(rule => assert.equal(['apply', 'screen', 'tailwind'].includes(rule.name), false))
    result.root.walkDecls(decl => assert.notEqual(decl.prop, '__apply'))
  })

  await t.test('every enabled plugin loads and the compatibility wrapper runs once before Tailwind', () => {
    assert.deepEqual(unresolved, [], 'an enabled PostCSS plugin must not be silently skipped')
    const nesting = loaded.map((entry, index) => ({ ...entry, index }))
      .filter(entry => entry.plugin.postcssPlugin === 'tailwindcss/nesting')
    assert.equal(nesting.length, 1)
    const tailwindIndex = loaded.findIndex(entry => entry.name === 'tailwindcss')
    assert.ok(tailwindIndex > nesting[0].index)
    for (const name of ['autoprefixer', 'cssnano']) {
      assert.ok(loaded.findIndex(entry => entry.name === name) > tailwindIndex, `${name} must follow Tailwind`)
    }
  })
})
