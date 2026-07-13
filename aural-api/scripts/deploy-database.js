#!/usr/bin/env node

const { spawnSync } = require('child_process')

const isPostgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || '')
const schema = isPostgres ? 'prisma/postgresql/schema.prisma' : 'prisma/schema.prisma'
const run = (args) => {
  const result = spawnSync('npx', ['prisma', ...args, '--schema', schema], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status || 1)
}

run(['migrate', 'deploy'])
run(['generate'])
console.log(`Database deployment completed with ${isPostgres ? 'PostgreSQL' : 'SQLite'} schema.`)
