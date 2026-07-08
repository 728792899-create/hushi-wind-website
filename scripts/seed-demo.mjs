import { spawnSync } from "node:child_process";
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

run("prisma db push", "npx", ["prisma", "db", "push", "--schema", "prisma/schema.prisma"]);
run("demo seed", "node", ["scripts/seed-demo.js"]);
