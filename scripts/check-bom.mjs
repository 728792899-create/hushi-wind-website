import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// U+FEFF in source breaks Nuxt auto-import injection (Vite then leaves a bare `vue`
// import in the browser and hydration never starts). Applied Prisma migrations keep
// theirs: rewriting them changes the checksum `prisma migrate deploy` verifies.
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE = /\.(?:[cm]?js|ts|vue|html|css|json|md|ya?ml)$/;
const EXEMPT = /^aural-api\/prisma\/migrations\//;
const BOM = String.fromCharCode(0xfeff);

const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
  .split("\0")
  .filter((file) => SOURCE.test(file) && !EXEMPT.test(file));

const offenders = files.filter((file) => readFileSync(path.join(ROOT, file), "utf8").includes(BOM));

if (offenders.length) {
  console.error(`BOM check failed: remove U+FEFF from ${offenders.length} file(s):`);
  offenders.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log(`BOM check passed: ${files.length} tracked source files.`);
