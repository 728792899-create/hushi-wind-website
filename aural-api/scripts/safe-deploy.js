#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { loadEnvFile } = require('./load-env')

const root = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(root, '..')
loadEnvFile(path.join(root, '.env'))

const stageRoot = path.resolve(process.argv[2] || process.env.DEPLOY_STAGE_DIR || '')
const apiTarget = path.resolve(process.env.API_TARGET_DIR || root)
const adminTarget = path.resolve(process.env.ADMIN_TARGET_DIR || path.join(workspaceRoot, 'aural-admin'))
const websiteTarget = path.resolve(process.env.WEBSITE_TARGET_DIR || path.join(workspaceRoot, 'aural-website'))
const apiSource = path.join(stageRoot, 'aural-api')
const adminSource = path.join(stageRoot, 'aural-admin')
const websiteSource = path.join(stageRoot, 'aural-website')
const deployLogDir = path.resolve(process.env.DEPLOY_LOG_DIR || path.join(root, 'logs', 'deployments'))
const deployId = process.env.DEPLOY_ID || new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
const deployStartedAt = new Date()
const deployedModules = [
  fs.existsSync(apiSource) ? 'aural-api' : '',
  fs.existsSync(adminSource) ? 'aural-admin' : '',
  fs.existsSync(websiteSource) ? 'aural-website' : ''
].filter(Boolean)
const deployRecord = {
  id: deployId,
  status: 'running',
  startedAt: deployStartedAt.toISOString(),
  finishedAt: '',
  durationMs: 0,
  stageRoot,
  modules: deployedModules,
  operator: process.env.USER || process.env.USERNAME || '',
  host: process.env.HOSTNAME || '',
  steps: [],
  error: ''
}

fs.mkdirSync(deployLogDir, { recursive: true })

const writeDeployRecord = () => {
  const file = path.join(deployLogDir, `${deployId}.json`)
  fs.writeFileSync(file, JSON.stringify(deployRecord, null, 2))
}

const appendDeployHistory = () => {
  const historyFile = path.join(deployLogDir, 'history.jsonl')
  fs.appendFileSync(historyFile, `${JSON.stringify(deployRecord)}\n`)
}

const run = (command, args, options = {}) => {
  const printable = [command].concat(args).join(' ')
  console.log(`\n$ ${printable}`)
  const step = { command: printable, cwd: options.cwd || process.cwd(), startedAt: new Date().toISOString(), finishedAt: '', status: 'running' }
  deployRecord.steps.push(step)
  writeDeployRecord()
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  })
  step.finishedAt = new Date().toISOString()
  step.status = result.status === 0 ? 'success' : 'failed'
  step.exitCode = result.status || 0
  writeDeployRecord()
  if (result.status !== 0) {
    deployRecord.status = 'failed'
    deployRecord.error = `command failed: ${printable}`
    deployRecord.finishedAt = new Date().toISOString()
    deployRecord.durationMs = Date.now() - deployStartedAt.getTime()
    writeDeployRecord()
    appendDeployHistory()
    process.exit(result.status || 1)
  }
}

const fail = (message) => {
  console.error(`Safe deploy failed: ${message}`)
  deployRecord.status = 'failed'
  deployRecord.error = message
  deployRecord.finishedAt = new Date().toISOString()
  deployRecord.durationMs = Date.now() - deployStartedAt.getTime()
  writeDeployRecord()
  appendDeployHistory()
  process.exit(1)
}

const requiredUrl = (label, ...values) => {
  const value = values.find((item) => String(item || '').trim())
  if (!value) fail(`${label} is required. Set it in .env or export it before deployment.`)
  return String(value).trim().replace(/\/$/, '')
}

const rsync = (source, target, excludes) => {
  if (!fs.existsSync(source)) return
  fs.mkdirSync(target, { recursive: true })
  const src = source.endsWith(path.sep) ? source : `${source}${path.sep}`
  run('rsync', ['-av', '--delete', ...excludes.flatMap((item) => [`--exclude=${item}`]), src, `${target}${path.sep}`])
}

writeDeployRecord()

if (!stageRoot || !fs.existsSync(stageRoot)) fail(`stage directory does not exist: ${stageRoot}`)

run('node', [path.join(root, 'scripts', 'deploy-guard.js'), stageRoot], { cwd: root })
run('node', [path.join(root, 'scripts', 'check-database.js')], { cwd: root })
run('node', [path.join(root, 'scripts', 'backup-database.js')], { cwd: root })

const apiExcludes = ['.env', '*.db', 'prisma/*.db', 'prisma/*.db-*', 'uploads', 'backups', 'logs', 'node_modules', 'dist', '.output', '.nuxt', '.git', '.vscode']
const frontendExcludes = ['.env', '.env.local', 'node_modules', 'dist', '.output', '.nuxt', 'logs', '.git', '.vscode']

rsync(apiSource, apiTarget, apiExcludes)
rsync(adminSource, adminTarget, frontendExcludes)
rsync(websiteSource, websiteTarget, frontendExcludes)

if (fs.existsSync(apiSource)) {
  run('npm', ['run', 'check'], { cwd: apiTarget })
  run('node', [path.join(apiTarget, 'scripts', 'check-database.js')], { cwd: apiTarget })
}

if (fs.existsSync(adminSource)) {
  const apiPublicUrl = requiredUrl('API_PUBLIC_URL or VITE_API_BASE', process.env.API_PUBLIC_URL, process.env.VITE_API_BASE)
  const publicSiteUrl = requiredUrl('PUBLIC_SITE_URL or VITE_SITE_URL', process.env.PUBLIC_SITE_URL, process.env.VITE_SITE_URL)
  run('npm', ['run', 'build'], {
    cwd: adminTarget,
    env: {
      ...process.env,
      VITE_API_BASE: apiPublicUrl,
      VITE_SITE_URL: publicSiteUrl,
      ADMIN_EXPECTED_API_BASE: process.env.ADMIN_EXPECTED_API_BASE || apiPublicUrl,
      ADMIN_EXPECTED_SITE_URL: process.env.ADMIN_EXPECTED_SITE_URL || publicSiteUrl
    }
  })
  run('npm', ['run', 'verify:dist'], { cwd: adminTarget })
}

if (fs.existsSync(websiteSource)) {
  const apiPublicUrl = requiredUrl('API_PUBLIC_URL or NUXT_PUBLIC_API_BASE', process.env.API_PUBLIC_URL, process.env.NUXT_PUBLIC_API_BASE)
  const publicSiteUrl = requiredUrl('PUBLIC_SITE_URL or NUXT_PUBLIC_SITE_URL', process.env.PUBLIC_SITE_URL, process.env.NUXT_PUBLIC_SITE_URL)
  run('npm', ['run', 'build'], {
    cwd: websiteTarget,
    env: {
      ...process.env,
      NUXT_PUBLIC_API_BASE: apiPublicUrl,
      NUXT_PUBLIC_SITE_URL: publicSiteUrl,
      EXPECTED_API_BASE: process.env.EXPECTED_API_BASE || apiPublicUrl,
      EXPECTED_SITE_URL: process.env.EXPECTED_SITE_URL || publicSiteUrl
    }
  })
  run('npm', ['run', 'verify:public'], {
    cwd: websiteTarget,
    env: {
      ...process.env,
      EXPECTED_API_BASE: process.env.EXPECTED_API_BASE || apiPublicUrl,
      EXPECTED_SITE_URL: process.env.EXPECTED_SITE_URL || publicSiteUrl
    }
  })
}

if (process.env.SKIP_PM2_RESTART !== '1') {
  if (fs.existsSync(apiSource)) run('pm2', ['restart', process.env.API_PM2_NAME || 'shangkong-api', '--update-env'])
  if (fs.existsSync(websiteSource)) run('pm2', ['restart', process.env.WEB_PM2_NAME || 'shangkong-web', '--update-env'])
}

if (process.env.SKIP_POST_DEPLOY_CHECK !== '1') {
  run('node', [path.join(apiTarget, 'scripts', 'post-deploy-check.js')], { cwd: apiTarget })
}

deployRecord.status = 'success'
deployRecord.finishedAt = new Date().toISOString()
deployRecord.durationMs = Date.now() - deployStartedAt.getTime()
writeDeployRecord()
appendDeployHistory()

console.log('\nSafe deploy completed.')
console.log(`deployId=${deployId}`)
console.log(`deployLog=${path.join(deployLogDir, `${deployId}.json`)}`)
