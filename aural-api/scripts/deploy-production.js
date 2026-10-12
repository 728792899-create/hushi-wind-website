#!/usr/bin/env node
// Keep the legacy command on the same guarded release path.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,[path.join(__dirname,'safe-deploy.js'),...process.argv.slice(2)],{stdio:'inherit',env:process.env});
if (result.error) console.error('Deployment failed to start:', result.error.message);
if (result.signal) console.error('Deployment interrupted:', result.signal);
process.exitCode = result.error || result.signal ? 1 : (Number.isInteger(result.status) ? result.status : 1);
