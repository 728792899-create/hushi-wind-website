import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const API_DIR = path.join(ROOT, "aural-api");
const env = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
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

ensureLocalSqliteFile(env.DATABASE_URL);
run("prisma db push", "npx", ["prisma", "db", "push", "--schema", "prisma/schema.prisma"]);
run("demo seed", "node", ["scripts/seed-demo.js"]);
