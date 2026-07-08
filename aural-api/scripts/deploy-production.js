#!/usr/bin/env node

const { spawnSync } = require('child_process')

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status || 1)
}

run('node', ['scripts/preflight.js'])
run('npx', ['prisma', 'migrate', 'deploy'])
run('npx', ['prisma', 'generate'])
