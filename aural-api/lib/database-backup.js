const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const { PrismaClient, Prisma } = require('@prisma/client');

function resolveDatabaseFile(
  url = process.env.DATABASE_URL,
  apiRoot = path.resolve(__dirname, '..'),
) {
  if (!url?.startsWith('file:'))
    throw new Error('DATABASE_URL must reference a SQLite file');
  const raw = decodeURIComponent(url.slice(5).split('?')[0]);
  if (!raw || raw === ':memory:')
    throw new Error('A persistent database file is required');
  return path.isAbsolute(raw) ? raw : path.resolve(apiRoot, 'prisma', raw);
}
async function verifyDatabase(file, { requireCurrentSchema = true } = {}) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size === 0)
    throw new Error('Database is empty or missing');
  const db = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    const checks = await db.$queryRawUnsafe('PRAGMA integrity_check');
    if (checks.some((row) => Object.values(row)[0] !== 'ok'))
      throw new Error('SQLite integrity check failed');
    const fk = await db.$queryRawUnsafe('PRAGMA foreign_key_check');
    if (fk.length) throw new Error('Foreign key integrity check failed');
    const tables = await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const names = new Set(tables.map((x) => x.name));
    const result = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      if (!names.has(model.dbName || model.name)) {
        if (requireCurrentSchema)
          throw new Error(`Missing table: ${model.name}`);
        continue;
      }
      const name = model.dbName || model.name;
      const columns = await db.$queryRawUnsafe(`PRAGMA table_info("${name}")`);
      const present = new Set(columns.map((x) => x.name));
      if (requireCurrentSchema)
        for (const field of model.fields.filter((f) => f.kind === 'scalar')) {
          if (!present.has(field.dbName || field.name))
            throw new Error(`Missing field: ${name}.${field.name}`);
        }
      const rows = await db.$queryRawUnsafe(
        `SELECT COUNT(*) AS count FROM "${name}"`,
      );
      result.push({ name, count: Number(rows[0].count), status: 'ok' });
    }
    if (
      !names.has('Product') ||
      !names.has('Inquiry') ||
      !names.has('AdminUser')
    )
      throw new Error('Missing core business tables');
    return result;
  } finally {
    await db.$disconnect();
  }
}
async function hashFile(file) {
  return createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}
async function assetManifest(root, prefix = '') {
  const rows = [];
  for (const entry of await fs.readdir(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const name = path.join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Symbolic links are not supported in upload backups');
    if (entry.isDirectory()) rows.push(...(await assetManifest(root, name)));
    else if (entry.isFile())
      rows.push({
        path: name,
        bytes: (await fs.stat(path.join(root, name))).size,
        sha256: await hashFile(path.join(root, name)),
      });
  }
  return rows;
}
async function verifyAssetReferences(file, assets, assetOrigins) {
  const { extractLocalUploadUrls } = require('./resource-references');
  const names = new Set(
    assets.map((item) => '/uploads/' + item.path.split(path.sep).join('/')),
  );
  const client = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    const existing = new Set(
      (
        await client.$queryRawUnsafe(
          "SELECT name FROM sqlite_master WHERE type='table'",
        )
      ).map((row) => row.name),
    );
    for (const model of [
      'Product',
      'Article',
      'Artist',
      'SystemConfig',
      'SupportDownload',
      'SupportFaq',
      'AudioSolution',
      'BrandTimeline',
      'EcosystemService',
      'QuickGuide',
      'PageContent',
      'ContentDraft',
      'ContentVersion',
      'RecycleEntry',
    ]) {
      if (!existing.has(model)) continue;
      const rows = await client.$queryRawUnsafe(`SELECT * FROM "${model}"`);
      for (const url of extractLocalUploadUrls(rows, assetOrigins))
        if (!names.has(url))
          throw new Error(`Backup references missing upload: ${url}`);
    }
  } finally {
    await client.$disconnect();
  }
}
async function verifyBackupBundle(file, options = {}) {
  const tables = await verifyDatabase(file, options);
  const manifest = JSON.parse(
    await fs.readFile(file + '.manifest.json', 'utf8'),
  );
  if (manifest.sha256 !== (await hashFile(file)))
    throw new Error('Database checksum mismatch');
  if (manifest.assets)
    for (const item of manifest.assets) {
      const target = path.resolve(file + '.assets', item.path);
      if (!target.startsWith(path.resolve(file + '.assets') + path.sep))
        throw new Error('Invalid asset manifest path');
      if ((await hashFile(target)) !== item.sha256)
        throw new Error(`Asset checksum mismatch: ${item.path}`);
    }
  if (manifest.assets) await verifyAssetReferences(file, manifest.assets, manifest.assetOrigins);
  return { tables, assetCount: manifest.assets?.length || 0, includesAssets: Array.isArray(manifest.assets) };
}
async function createDatabaseBackup(source, destination, options = {}) {
  await fs.stat(source);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(
    path.join(path.dirname(destination), '.backup-'),
  );
  const temporary = path.join(staging, 'database.db');
  const lock = await fs
    .open(destination + '.lock', 'wx')
    .catch(async (error) => {
      await fs.rm(staging, { recursive: true, force: true });
      throw error;
    });
  const db = new PrismaClient({ datasourceUrl: `file:${source}` });
  let published = false,
    assetsPublished = false,
    manifestPublished = false;
  try {
    try {
      await fs.access(destination);
      throw new Error('Backup destination already exists');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    await db.$executeRawUnsafe('VACUUM INTO ?', temporary);
    await fs.chmod(temporary, 0o600);
    const tables = await verifyDatabase(temporary, options);
    let assets = null;
    if (options.uploadsRoot) {
      await fs.cp(options.uploadsRoot, temporary + '.assets', {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      assets = await assetManifest(temporary + '.assets');
      await verifyAssetReferences(temporary, assets, options.assetOrigins);
    }
    const manifest = {
      createdAt: new Date().toISOString(),
      sha256: await hashFile(temporary),
      tables,
      assets,
      assetOrigins: options.assetOrigins || require('./resource-references').localAssetOrigins(),
    };
    if (assets) {
      await fs.rename(temporary + '.assets', destination + '.assets');
      assetsPublished = true;
    }
    await fs.writeFile(
      destination + '.manifest.json',
      JSON.stringify(manifest, null, 2),
      { mode: 0o600, flag: 'wx' },
    );
    manifestPublished = true;
    await fs.link(temporary, destination);
    published = true;
    return {
      size: (await fs.stat(destination)).size,
      tables,
      assetCount: assets?.length || 0,
    };
  } catch (error) {
    if (!published) {
      if (manifestPublished)
        await fs.rm(destination + '.manifest.json', { force: true });
      if (assetsPublished)
        await fs.rm(destination + '.assets', { recursive: true, force: true });
    }
    throw error;
  } finally {
    await db.$disconnect();
    await lock.close();
    await fs.rm(destination + '.lock', { force: true });
    await fs.rm(staging, { recursive: true, force: true });
  }
}
async function pruneBackups(root, days = 14) {
  if (!Number.isFinite(days) || days < 1)
    throw new Error('Backup retention days must be at least 1');
  await fs.mkdir(root, { recursive: true });
  const cutoff = Date.now() - days * 86400000;
  const files=[];
  for (const entry of await fs.readdir(root,{withFileTypes:true})) {
    if (!entry.isFile() || !/^(prod\.predeploy|database\.(manual|scheduled))\..+\.db$/.test(entry.name)) continue;
    const file=path.join(root,entry.name); files.push({file,mtime:(await fs.stat(file)).mtimeMs});
  }
  files.sort((a,b)=>b.mtime-a.mtime);
  const retained=new Set();
  for (const {file} of files) {
    try { const verified = await verifyBackupBundle(file,{requireCurrentSchema:false}); if(verified.includesAssets) retained.add(file); } catch { /* Invalid bundles cannot replace a recovery point. */ }
    if(retained.size===2) break;
  }
  // Without two verified recovery points, fail conservatively and retain all.
  if(retained.size<2) return;
  for(const {file,mtime} of files) if(mtime<cutoff && !retained.has(file)) {
    await fs.rm(file);
    await fs.rm(file+'.manifest.json',{force:true});
    await fs.rm(file+'.assets',{recursive:true,force:true});
  }
}
module.exports = {
  resolveDatabaseFile,
  verifyDatabase,
  createDatabaseBackup,
  pruneBackups,
  verifyBackupBundle,
};
