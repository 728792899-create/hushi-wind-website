import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import semver from 'semver'

export const MANIFEST_NAME = 'audit-manifest.json'
const stages = ['client', 'ssr', 'nitro']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const requireValue = (ok, message) => { if (!ok) throw new Error(`Artifact inventory: ${message}`) }
const sha256 = value => createHash('sha256').update(value).digest('hex')
const safePath = value => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !/[\x00-\x1f]/.test(value) && !path.posix.isAbsolute(value) && !/^[a-z]:/i.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..')
const lockName = (key, entry) => entry.name || key.split('node_modules/').at(-1)

async function readInputs(rootDir) {
  const [lockBytes, packageBytes] = await Promise.all([
    fs.readFile(path.join(rootDir, 'package-lock.json')),
    fs.readFile(path.join(rootDir, 'package.json'))
  ])
  const lock = JSON.parse(lockBytes)
  requireValue(lock.lockfileVersion === 3 && object(lock.packages), 'a v3 package lock is required')
  return { lock, inputs: { lockfileSha256: sha256(lockBytes), packageJsonSha256: sha256(packageBytes) } }
}

function validatePackage(pkg, lock) {
  requireValue(object(pkg) && typeof pkg.name === 'string' && pkg.name.trim().length > 0 && typeof pkg.version === 'string' && semver.valid(pkg.version) === pkg.version && safePath(pkg.lockPath), 'invalid bundled package identity')
  const entry = lock.packages[pkg.lockPath]
  requireValue(pkg.lockPath.includes('node_modules/') && object(entry) && !entry.link && entry.version === pkg.version && lockName(pkg.lockPath, entry) === pkg.name, `bundled package does not match lock: ${pkg.name}@${pkg.version}`)
}

export function validateProvenance(provenance, lock) {
  requireValue(object(provenance) && /^[a-f0-9]{64}$/.test(provenance.lockfileSha256) && object(provenance.stages), 'missing build provenance')
  requireValue(Object.keys(provenance.stages).sort().join(',') === [...stages].sort().join(','), 'all three build stages must be recorded')
  const packages = new Map()
  for (const target of stages) {
    const stage = provenance.stages[target]
    requireValue(object(stage) && Array.isArray(stage.chunks) && stage.chunks.length > 0, `missing ${target} chunks`)
    const files = new Set()
    const recordModules = modules => {
      requireValue(Array.isArray(modules), `missing ${target} module list`)
      const ids = new Set()
      for (const module of modules) {
        requireValue(object(module) && typeof module.id === 'string' && module.id.length > 0 && !/[\x00-\x1f]/.test(module.id) && !path.posix.isAbsolute(module.id) && !/^[a-z]:[/\\]/i.test(module.id) && !ids.has(module.id), `invalid ${target} module identifier`)
        ids.add(module.id)
        requireValue(Object.hasOwn(module, 'package'), `missing attribution for ${module.id}`)
        requireValue(['package', 'project', 'generated', 'virtual'].includes(module.kind) && module.id.startsWith(`${module.kind}/`), `invalid module kind or attribution: ${module.id}`)
        if (module.kind !== 'package') {
          requireValue(module.package === null, `non-package module has package attribution: ${module.id}`)
          continue
        }
        validatePackage(module.package, lock)
        const sourcePath = module.id.slice('package/'.length).split('?')[0]
        requireValue(safePath(sourcePath), `unsafe package module path: ${module.id}`)
        const segments = sourcePath.split('/')
        const start = segments.lastIndexOf('node_modules') + 1
        const end = start + (segments[start]?.startsWith('@') ? 2 : 1)
        requireValue(start > 0 && segments.length > end && segments.slice(0, end).join('/') === module.package.lockPath, `module path does not match package attribution: ${module.id}`)
        const key = module.package.lockPath
        if (!packages.has(key)) packages.set(key, { ...module.package, targets: new Set() })
        packages.get(key).targets.add(target)
      }
    }
    let moduleCount = 0
    for (const chunk of stage.chunks) {
      requireValue(object(chunk) && safePath(chunk.file) && !files.has(chunk.file) && Array.isArray(chunk.modules), `invalid or duplicate ${target} chunk: ${JSON.stringify(chunk?.file)}`)
      files.add(chunk.file)
      recordModules(chunk.modules)
      moduleCount += chunk.modules.length
    }
    requireValue(moduleCount > 0, `empty ${target} module graph`)
    // Rolldown may inline constants and erase their original chunk membership.
    // Retain the loaded build graph too; it is conservative about tree shaking.
    requireValue(Array.isArray(stage.graphModules) && stage.graphModules.length > 0, `missing ${target} loaded module graph`)
    recordModules(stage.graphModules)
  }
  return [...packages.values()].map(pkg => ({ ...pkg, targets: [...pkg.targets].sort() }))
}

async function fileHash(file) {
  const hash = createHash('sha256')
  for await (const block of createReadStream(file)) hash.update(block)
  return hash.digest('hex')
}

// No symlinks: an output inventory must describe the bytes that will be copied,
// without following a link outside the release or allowing a traversal cycle.
export async function snapshotOutput(outputDir) {
  const files = []
  async function visit(relative = '') {
    const dir = path.join(outputDir, relative)
    requireValue((await fs.lstat(dir)).isDirectory(), 'output root must be a real directory')
    for (const name of (await fs.readdir(dir)).sort()) {
      const relativePath = relative ? `${relative}/${name}` : name
      if (relativePath === MANIFEST_NAME) continue
      requireValue(safePath(relativePath), 'unsafe output path')
      const file = path.join(outputDir, relativePath)
      const stat = await fs.lstat(file)
      if (stat.isDirectory()) await visit(relativePath)
      else {
        requireValue(stat.isFile() && !stat.isSymbolicLink(), `unsupported output entry: ${relativePath}`)
        files.push({ path: relativePath, size: stat.size, sha256: await fileHash(file) })
      }
    }
  }
  await visit()
  requireValue(files.some(file => file.path === 'server/index.mjs') && files.some(file => file.path.startsWith('public/')), 'incomplete server/public output')
  return files
}

async function externalPackages(outputDir, lock) {
  const packages = []
  const locked = Object.entries(lock.packages).filter(([key, value]) => key.includes('node_modules/') && !value.link)
  async function visit(relative) {
    const directory = path.join(outputDir, relative)
    for (const name of (await fs.readdir(directory)).sort()) {
      requireValue(!name.startsWith('.'), `unsupported hidden external entry: ${relative}/${name}`)
      const relativePath = `${relative}/${name}`
      if (!(await fs.lstat(path.join(outputDir, relativePath))).isDirectory()) continue
      if (name.startsWith('@')) { await visit(relativePath); continue }
      const pkg = JSON.parse(await fs.readFile(path.join(outputDir, relativePath, 'package.json'), 'utf8'))
      requireValue(typeof pkg.name === 'string' && pkg.name.trim().length > 0 && typeof pkg.version === 'string' && semver.valid(pkg.version) === pkg.version, `invalid external package: ${relativePath}`)
      const lockPaths = locked.filter(([key, entry]) => lockName(key, entry) === pkg.name && entry.version === pkg.version).map(([key]) => key).sort()
      requireValue(lockPaths.length > 0, `external package absent from lock: ${pkg.name}@${pkg.version}`)
      packages.push({ name: pkg.name, version: pkg.version, path: relativePath, lockPaths })
      const nested = `${relativePath}/node_modules`
      try { await fs.access(path.join(outputDir, nested)) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
      await visit(nested)
    }
  }
  await visit('server/node_modules')
  requireValue(packages.length > 0, 'external inventory is empty')
  return packages
}

export async function writeArtifactManifest({ rootDir, outputDir, provenance }) {
  const { lock, inputs } = await readInputs(rootDir)
  requireValue(provenance.lockfileSha256 === inputs.lockfileSha256, 'lockfile changed during build')
  validateProvenance(provenance, lock)
  const files = await snapshotOutput(outputDir)
  const external = await externalPackages(outputDir, lock)
  const manifest = { schemaVersion: 1, inputs, provenance, external, files }
  const destination = path.join(outputDir, MANIFEST_NAME)
  // Replace only this build's own metadata; never write through an old symlink.
  try { requireValue((await fs.lstat(destination)).isFile() && !(await fs.lstat(destination)).isSymbolicLink(), 'invalid previous inventory file') } catch (error) { if (error.code !== 'ENOENT') throw error }
  await fs.writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export async function verifyArtifactManifest({ rootDir, outputDir }) {
  requireValue((await fs.lstat(outputDir)).isDirectory(), 'output root must be a real directory')
  const file = path.join(outputDir, MANIFEST_NAME)
  const stat = await fs.lstat(file)
  requireValue(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 20 * 1024 * 1024, 'invalid inventory file; rebuild the website')
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'))
  const { lock, inputs } = await readInputs(rootDir)
  requireValue(object(manifest) && manifest.schemaVersion === 1 && object(manifest.inputs) && manifest.inputs.lockfileSha256 === inputs.lockfileSha256 && manifest.inputs.packageJsonSha256 === inputs.packageJsonSha256, 'stale or unsupported inventory; rebuild the website')
  requireValue(manifest.provenance?.lockfileSha256 === inputs.lockfileSha256, 'build provenance does not match lock')
  const bundled = validateProvenance(manifest.provenance, lock)
  requireValue(Array.isArray(manifest.files) && manifest.files.length > 0, 'missing artifact checksums')
  const seen = new Set()
  for (const item of manifest.files) {
    requireValue(object(item) && safePath(item.path) && item.path !== MANIFEST_NAME && !seen.has(item.path) && Number.isSafeInteger(item.size) && item.size >= 0 && /^[a-f0-9]{64}$/.test(item.sha256), 'invalid artifact checksum entry')
    seen.add(item.path)
  }
  const actual = await snapshotOutput(outputDir)
  requireValue(JSON.stringify(actual) === JSON.stringify(manifest.files), 'output files changed, missing or added; rebuild the website')
  const external = await externalPackages(outputDir, lock)
  requireValue(JSON.stringify(external) === JSON.stringify(manifest.external), 'external inventory does not match artifact')
  return { manifest, packages: [...bundled, ...external.map(pkg => ({ ...pkg, targets: ['external'] }))] }
}
