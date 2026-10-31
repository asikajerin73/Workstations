#!/usr/bin/env node
/**
 * PLAN G-1 三条断言（任一失败 exit 1）：
 *   1. dependencies key 集合 === ALLOWED_DEPENDENCIES（集合相等，双向）
 *   2. devDependencies key 集合 ⊆ ALLOWED_DEV_DEPENDENCIES（子集）
 *   3. node_modules 顶层直接子目录数（排除 .bin/.cache）≤ 60（防传递膨胀）
 * 输出两行，便于人工核对：
 *   dependencies: 11 / 11 [EXACT]
 *   devDependencies: <n> / 17 [SUBSET]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED_DEPENDENCIES = [           // 恰好 11 个，集合相等
  "electron", "react", "react-dom", "better-sqlite3", "zustand",
  "framer-motion", "@tanstack/react-virtual", "monaco-editor",
  "marked", "dompurify", "zod"
];
const ALLOWED_DEV_DEPENDENCIES = [       // 17 个，子集即可
  "typescript", "electron-vite", "electron-builder", "@electron/rebuild",
  "eslint", "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin",
  "tailwindcss", "postcss", "autoprefixer", "vitest", "@playwright/test",
  "@types/react", "@types/react-dom", "@types/better-sqlite3", "@types/marked", "vite"
];

const MAX_TOP_LEVEL_DIRS = 60;

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const deps = Object.keys(pkg.dependencies ?? {});
const devDeps = Object.keys(pkg.devDependencies ?? {});

let failed = false;

// 断言 1：集合相等（双向）
const allowedDeps = new Set(ALLOWED_DEPENDENCIES);
const missing = ALLOWED_DEPENDENCIES.filter((d) => !deps.includes(d));
const extra = deps.filter((d) => !allowedDeps.has(d));
if (missing.length > 0 || extra.length > 0 || deps.length !== ALLOWED_DEPENDENCIES.length) {
  failed = true;
  console.error('FAIL dependencies 集合不相等');
  if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`);
  if (extra.length > 0) console.error(`  extra: ${extra.join(', ')}`);
  if (deps.length !== ALLOWED_DEPENDENCIES.length) {
    console.error(`  count: ${deps.length} != ${ALLOWED_DEPENDENCIES.length}`);
  }
}

// 断言 2：devDependencies 子集
const allowedDev = new Set(ALLOWED_DEV_DEPENDENCIES);
const devExtra = devDeps.filter((d) => !allowedDev.has(d));
if (devExtra.length > 0) {
  failed = true;
  console.error('FAIL devDependencies 含白名单外依赖');
  console.error(`  extra: ${devExtra.join(', ')}`);
}

// 断言 3：node_modules 顶层目录数
let topLevelDirs = 0;
try {
  topLevelDirs = readdirSync(join(ROOT, 'node_modules'), { withFileTypes: true }).filter(
    (e) => e.isDirectory() && e.name !== '.bin' && e.name !== '.cache' && e.name !== '.pnpm',
  ).length;
} catch {
  console.error('FAIL node_modules 不存在，请先 pnpm install');
  failed = true;
}
if (topLevelDirs > MAX_TOP_LEVEL_DIRS) {
  failed = true;
  console.error(`FAIL node_modules 顶层目录 ${topLevelDirs} > ${MAX_TOP_LEVEL_DIRS}（疑似传递膨胀）`);
}

console.log(`dependencies: ${deps.length} / ${ALLOWED_DEPENDENCIES.length} [EXACT]`);
console.log(`devDependencies: ${devDeps.length} / ${ALLOWED_DEV_DEPENDENCIES.length} [SUBSET]`);

process.exit(failed ? 1 : 0);
