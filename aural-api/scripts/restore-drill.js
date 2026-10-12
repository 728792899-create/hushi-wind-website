#!/usr/bin/env node
// No .env loading, default database, deployment action, timer or network client.
const { restoreBackupDrill } = require('../lib/restore-drill');

async function main(args = process.argv.slice(2)) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!['--backup', '--scratch-root'].includes(key) || !value || values[key])
      throw Object.assign(new Error('Explicit --backup ABS and --scratch-root ABS are required'), { code: 'RESTORE_DRILL_PATH_REQUIRED' });
    values[key] = value;
  }
  const result = await restoreBackupDrill(values['--backup'], { scratchRoot: values['--scratch-root'] });
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', error: {
    code: error.code?.startsWith('RESTORE_DRILL_') ? error.code : 'RESTORE_DRILL_FAILED',
    message: '隔离恢复演练未通过；未替换业务数据库。请核对显式路径、备份完整性与审计封存状态。',
  } }));
  process.exitCode = 1;
});
module.exports = { main };
