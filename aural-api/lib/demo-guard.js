const path = require('node:path');
const fs = require('node:fs');
const { resolveDatabaseFile } = require('./database-backup');
function assertDemoTarget(env = process.env) {
  if (env.NODE_ENV === 'production')
    throw new Error('Demo scripts cannot run in production');
  if (env.HUSHI_DEMO_SEED !== '1')
    throw new Error('Use npm run seed:demo with a dedicated demo database');
  const target = resolveDatabaseFile(env.DATABASE_URL);
  if (path.basename(target) !== 'hushi-demo.db')
    throw new Error(
      'Demo scripts only support hushi-demo.db; business databases are protected',
    );
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (
      stat.isSymbolicLink() ||
      stat.nlink > 1 ||
      path.basename(fs.realpathSync(target)) !== 'hushi-demo.db'
    )
      throw new Error('Demo target cannot be a link');
  }
  return target;
}
module.exports = { assertDemoTarget };
