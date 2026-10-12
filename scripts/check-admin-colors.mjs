import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 后台颜色只能来自 aural-admin/src/style.css 的第一个 :root 设计令牌块，
// 其余样式一律使用 var(--admin-*) / var(--el-*)。<script> 不在检查范围：那里的颜色可能是业务数据。
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC = path.join(ROOT, "aural-admin", "src");
// rgba(var(--admin-*-rgb), alpha) 由令牌派生，允许
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\((?!\s*var\(--)/g;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const findings = [];
const scan = (file, text, offset = 0) => {
  for (const match of text.matchAll(COLOR))
    findings.push(`${path.relative(ROOT, file)}:${lineOf(text, match.index) + offset}  ${match[0]}`);
};

for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".css")) {
    const tokens = /^:root\s*\{[\s\S]*?^\}/m.exec(source);
    const masked = tokens ? source.replace(tokens[0], tokens[0].replace(/[^\n]/g, " ")) : source;
    scan(file, masked);
  } else if (file.endsWith(".vue")) {
    // 保留换行，以便报告真实行号
    const masked = source.replace(/<script\b[\s\S]*?<\/script>/g, (block) => block.replace(/[^\n]/g, " "));
    for (const block of masked.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g))
      scan(file, block[1], lineOf(masked, block.index + block[0].indexOf(block[1])) - 1);
    for (const attr of masked.matchAll(/\s:?style="([^"]*)"/g))
      scan(file, attr[1], lineOf(masked, attr.index) - 1);
  }
}

if (findings.length) {
  console.error(`Admin color check failed: use design tokens from aural-admin/src/style.css :root instead of ${findings.length} literal(s):`);
  findings.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("Admin color check passed: no color literals outside the :root design tokens.");
