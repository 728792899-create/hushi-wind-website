import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { defineNuxtModule } from '@nuxt/kit'
import { writeArtifactManifest } from './artifact-inventory.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const slash = value => value.split(path.sep).join('/')
const within = (root, file) => file === root || file.startsWith(`${root}${path.sep}`)
const requireValue = (value, message) => { if (!value) throw new Error(`Build provenance: ${message}`) }
const stageNames = ['client', 'ssr', 'nitro']

// Capture output membership plus each bundler's loaded graph. Zero-length
// entries remain deliberately conservative across Rollup and Rolldown.
export async function createProvenanceCollector({ rootDir, generatedDirs = [] }) {
  rootDir = await fs.realpath(rootDir)
  const lockBytes = await fs.readFile(path.join(rootDir, 'package-lock.json'))
  const lock = JSON.parse(lockBytes)
  requireValue(lock.lockfileVersion === 3 && lock.packages, 'a v3 package lock is required')
  const stages = {}
  const packageCache = new Map()
  const generated = generatedDirs.map(dir => path.resolve(dir))

  async function identify(rawId) {
    requireValue(typeof rawId === 'string' && rawId.length > 0, 'module identifier is missing')
    let candidate = rawId.replace(/^\0+/, '')
    if (candidate.startsWith('file://')) candidate = fileURLToPath(new URL(candidate))
    if (candidate.startsWith('/@fs/')) candidate = candidate.slice(4)
    const queryIndex = candidate.indexOf('?')
    const suffix = queryIndex < 0 ? '' : `?query-${sha256(candidate.slice(queryIndex))}`
    if (queryIndex >= 0) candidate = candidate.slice(0, queryIndex)
    if (!path.isAbsolute(candidate)) {
      // Opaque virtual IDs may themselves contain paths. A digest is portable
      // metadata, not an invented package attribution for generated code.
      const portable = rawId.split(rootDir).join('<root>')
      return { id: `virtual/${sha256(portable)}`, kind: 'virtual', package: null }
    }
    candidate = path.normalize(candidate)
    const generatedIndex = generated.findIndex(dir => within(dir, candidate))
    if (generatedIndex >= 0) {
      return { id: `generated/${generatedIndex}/${slash(path.relative(generated[generatedIndex], candidate))}${suffix}`, kind: 'generated', package: null }
    }
    requireValue(within(rootDir, candidate), 'a physical module is outside the locked project')
    const relative = slash(path.relative(rootDir, candidate))
    requireValue(relative && !/[\x00-\x1f]/.test(relative), 'unsafe physical module identifier')
    const segments = relative.split('/')
    const nodeModulesIndex = segments.lastIndexOf('node_modules')
    if (nodeModulesIndex < 0) return { id: `project/${relative}${suffix}`, kind: 'project', package: null }

    const packageStart = nodeModulesIndex + 1
    const packageEnd = packageStart + (segments[packageStart]?.startsWith('@') ? 2 : 1)
    const lockPath = segments.slice(0, packageEnd).join('/')
    if (!packageCache.has(lockPath)) packageCache.set(lockPath, (async () => {
      const directory = path.join(rootDir, lockPath)
      requireValue(await fs.realpath(directory) === directory, `symlinked package is not supported: ${lockPath}`)
      const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
      const locked = lock.packages[lockPath]
      const lockedName = locked?.name || lockPath.split('node_modules/').at(-1)
      requireValue(locked && !locked.link && pkg.name === lockedName && pkg.version === locked.version,
        `installed package does not match lock: ${lockPath}`)
      return { name: pkg.name, version: pkg.version, lockPath }
    })())
    const pkg = await packageCache.get(lockPath)
    const physicalFile = await fs.realpath(candidate)
    requireValue(within(path.join(rootDir, lockPath), physicalFile), `module escaped its package: ${lockPath}`)
    return { id: `package/${relative}${suffix}`, kind: 'package', package: { ...pkg } }
  }

  return {
    addGeneratedDirectory(dir) { generated.push(path.resolve(dir)) },
    plugin(stage) {
      requireValue(stageNames.includes(stage), 'unknown build stage')
      return {
        name: `hushi:provenance:${stage}`,
        generateBundle: {
          order: 'post',
          async handler(_options, bundle) {
            requireValue(!stages[stage], `${stage} was generated more than once`)
            requireValue(typeof this.getModuleIds === 'function' && typeof this.getModuleInfo === 'function', 'bundler module graph API is unavailable')
            const chunks = []
            const chunkFiles = new Set()
            for (const chunk of Object.values(bundle).filter(item => item.type === 'chunk').sort((a, b) => a.fileName.localeCompare(b.fileName))) {
              requireValue(!path.isAbsolute(chunk.fileName) && !chunk.fileName.split('/').includes('..'), 'unsafe chunk filename')
              const file = path.posix.normalize(chunk.fileName)
              requireValue(file && file !== '.' && !/[\\\x00-\x1f]/.test(file), 'unsafe normalized chunk filename')
              requireValue(!chunkFiles.has(file), `duplicate ${stage} chunk: ${file}`)
              chunkFiles.add(file)
              const modules = []
              // Copy primitive data now: Rolldown's output object has native
              // lazy getters whose lifetime must not escape this hook.
              for (const [id, info] of Object.entries(chunk.modules)) {
                const module = await identify(id)
                const renderedLength = info.renderedLength
                requireValue(Number.isSafeInteger(renderedLength) && renderedLength >= 0, 'invalid rendered module length')
                modules.push({ ...module, renderedLength })
              }
              modules.sort((a, b) => a.id.localeCompare(b.id))
              requireValue(new Set(modules.map(module => module.id)).size === modules.length, 'module identifiers collided')
              chunks.push({ file, modules })
            }
            requireValue(chunks.length && chunks.some(chunk => chunk.modules.length), `${stage} has no rendered modules`)
            // Rolldown can fold a package's constants into its importer and
            // omit that source from chunk.modules. Preserve this build's loaded
            // graph as a conservative supplement, including later shaken code.
            // This is not the installed dependency tree or plugin tool graph.
            const graphModules = []
            for (const id of this.getModuleIds()) {
              const info = this.getModuleInfo(id)
              requireValue(info && (info.code === null || typeof info.code === 'string'), 'bundler returned an unsupported module graph entry')
              if (info.code === null) continue // external, not loaded by this bundler
              graphModules.push(await identify(id))
            }
            graphModules.sort((a, b) => a.id.localeCompare(b.id))
            requireValue(graphModules.length && new Set(graphModules.map(module => module.id)).size === graphModules.length, 'empty or duplicate module graph')
            stages[stage] = { chunks, graphModules }
          }
        }
      }
    },
    snapshot() {
      for (const stage of stageNames) requireValue(stages[stage], `missing ${stage} output; cached builds cannot supply provenance`)
      return structuredClone({ lockfileSha256: sha256(lockBytes), stages })
    }
  }
}

export async function installProvenance(nuxt, writeManifest = writeArtifactManifest) {
  if (nuxt.options.dev || nuxt.options._prepare) return
  if (nuxt.options._generate || nuxt.options.nitro?.static) {
    console.warn('[build provenance] Static generation does not produce a Node server audit manifest; audit:prod will reject it.')
    return
  }
  // A restored Vue build skips output hooks. Every release must collect fresh
  // client, SSR and Nitro membership in this same Nuxt instance.
  nuxt.options.experimental.buildCache = false
  const collector = await createProvenanceCollector({ rootDir: nuxt.options.rootDir, generatedDirs: [nuxt.options.buildDir] })
  let originalNitro
  let compiled = false
  nuxt.hook('vite:extendConfig', (config, { isClient }) => {
    const stage = isClient ? 'client' : 'ssr'
    const plugin = collector.plugin(stage)
    config.plugins ||= []
    config.plugins.push({ ...plugin, apply: 'build', enforce: 'post', applyToEnvironment: environment => environment.name === stage })
  })
  nuxt.hook('nitro:init', nitro => {
    requireValue(!originalNitro, 'multiple primary Nitro instances are unsupported')
    originalNitro = nitro
    collector.addGeneratedDirectory(nitro.options.buildDir)
    // Instance hooks are not copied into the separate prerender Nitro build.
    nitro.hooks.hook('rollup:before', (instance, config) => {
      requireValue(instance === originalNitro && instance.options.preset !== 'nitro-prerender', 'unexpected Nitro build instance')
      config.plugins ||= []
      config.plugins.push(collector.plugin('nitro'))
    })
    nitro.hooks.hook('compiled', instance => {
      requireValue(instance === originalNitro, 'unexpected compiled Nitro instance')
      compiled = true
    })
  })
  // Nuxt registers Nitro's build:done during bundleServer, before ready. This
  // awaited hook therefore follows prerender, public compression, all Nitro
  // compiled callbacks and symlinkDist. afterEach cannot be used: it is sync.
  nuxt.hook('ready', () => {
    requireValue(!nuxt.options.experimental.buildCache, 'build cache must remain disabled')
    nuxt.hook('build:done', async () => {
      requireValue(compiled && originalNitro, 'Nitro did not complete')
      await writeManifest({ rootDir: nuxt.options.rootDir, outputDir: originalNitro.options.output.dir, provenance: collector.snapshot() })
    })
  })
}

export default defineNuxtModule({
  meta: { name: 'hushi-build-provenance' },
  setup: (_options, nuxt) => installProvenance(nuxt)
})
