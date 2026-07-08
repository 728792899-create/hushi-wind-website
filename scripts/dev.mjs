import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const apiOnly = process.argv.includes("--api-only");
const children = [];

function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (!signal && code && !shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 800).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const apiEnv = {
  NODE_ENV: "development",
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  PORT: process.env.PORT || "1337",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "demo_admin",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "DemoPass_2026!",
  ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET || "hushi-demo-local-token-secret-2026-change-me",
  PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  PUBLIC_ADMIN_URL: "http://127.0.0.1:5175",
  API_PUBLIC_URL: "http://127.0.0.1:1337",
  UPLOAD_PUBLIC_BASE: "http://127.0.0.1:1337/uploads",
  ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:5175,http://localhost:5175",
};

run("api", "npm", ["--prefix", "aural-api", "start"], { env: apiEnv });

if (!apiOnly) {
  run("website", "npm", ["--prefix", "aural-website", "run", "dev", "--", "--host", "127.0.0.1", "--port", "3000"], {
    env: {
      NUXT_PUBLIC_API_BASE: "http://127.0.0.1:1337",
      NUXT_API_INTERNAL_BASE: "http://127.0.0.1:1337",
      NUXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
      NUXT_PUBLIC_BRAND_IMAGE_BASE: "http://127.0.0.1:1337/uploads/real-assets",
    },
  });
  run("admin", "npm", ["--prefix", "aural-admin", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5175"], {
    env: {
      VITE_API_BASE: "http://127.0.0.1:1337",
      VITE_SITE_URL: "http://127.0.0.1:3000",
    },
  });
}
