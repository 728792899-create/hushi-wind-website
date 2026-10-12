import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const API_DIR = path.join(ROOT, "aural-api");
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "development",
  HUSHI_DEMO_SEED: "1",
  DATABASE_URL: process.env.DEMO_DATABASE_URL || "file:./hushi-demo.db",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "demo_admin",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "DemoPass_2026!",
};

// Prisma 6.19 may fail with an empty "Schema engine error" when db push targets
// a SQLite file that does not exist yet. The datasource path is resolved relative
// to schema.prisma, so create only the empty local file before Prisma owns it.
function ensureLocalSqliteFile(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) return;
  const rawPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]);
  const databasePath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(API_DIR, "prisma", rawPath);
  if(existsSync(databasePath)){const stat=lstatSync(databasePath);if(stat.isSymbolicLink()||stat.nlink>1||path.basename(realpathSync(databasePath))!=='hushi-demo.db')throw new Error('Demo target cannot be a link');}
  mkdirSync(path.dirname(databasePath), { recursive: true });
  closeSync(openSync(databasePath, "a"));
}

function run(label, command, args, cwd = API_DIR) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

if(process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production');
if(path.basename(decodeURIComponent(env.DATABASE_URL.slice(5))) !== 'hushi-demo.db') throw new Error('DEMO_DATABASE_URL must target hushi-demo.db');
if(process.env.DATABASE_URL && process.env.DATABASE_URL !== env.DATABASE_URL) throw new Error('Refusing inherited DATABASE_URL; run in a clean demo environment');
ensureLocalSqliteFile(env.DATABASE_URL);
run("prisma db push", "npx", ["prisma", "db", "push", "--schema", "prisma/schema.prisma"]);
run("base seed", "node", ["scripts/seed-demo.js"]);
run("fictional catalog seed", "node", ["scripts/content-cleanup.js"]);
run("curated asset mapping", "node", ["scripts/real-assets-upgrade.js"]);
