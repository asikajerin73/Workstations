#!/usr/bin/env node
/**
 * `pnpm lint:fixtures` —— G-5 的负样本断言入口。
 *
 * 口径（T-002 v1.1 明确，允许「本任务无 fixture」但不许静默空过）：
 *   | plugins/fixtures/ 不存在            | 打印 NO FIXTURES YET (expected at M6)，exit 0 |
 *   | 目录存在但没有任何 fixture 文件      | 同上，exit 0                                  |
 *   | 有 fixture 文件                     | 收集 ruleId，与 {ARK-COLOR-1..5} 比对          |
 *
 * 为什么允许 exit 0：本任务确实还没有 fixture，这是事实而不是漏检。
 * 但必须打印醒目提示，让人一眼看出「这里还没在断言」，而不是伪装成「已通过」。
 * M6 引入 fixture 后，同一份脚本自动升级为实质断言，调用方式不变。
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = join(ROOT, 'plugins', 'fixtures');

/** G-5 期望的规则集合：hardcoded-color fixture 恰好 5 条。 */
const EXPECTED_RULE_IDS = ['ARK-COLOR-1', 'ARK-COLOR-2', 'ARK-COLOR-3', 'ARK-COLOR-4', 'ARK-COLOR-5'];
const EXPECTED_ERROR_COUNT = 5;

const FIXTURE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html']);

function noFixtures(reason) {
  console.log('');
  console.log('========================================================');
  console.log('  NO FIXTURES YET (expected at M6)');
  console.log(`  ${reason}`);
  console.log('  → 本脚本当前只完成「结构就绪」，尚未执行任何实质断言。');
  console.log('  → M6 放入 plugins/fixtures/ 负样本后，同一命令自动变实质断言。');
  console.log('========================================================');
  console.log('');
  process.exit(0);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs));
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot < 0 ? '' : entry.name.slice(dot).toLowerCase();
      if (FIXTURE_EXTENSIONS.has(ext)) out.push(abs);
    }
  }
  return out;
}

if (!existsSync(FIXTURES_DIR) || !statSync(FIXTURES_DIR).isDirectory()) {
  noFixtures(`目录不存在: plugins/fixtures/`);
}

const files = walk(FIXTURES_DIR);
if (files.length === 0) {
  noFixtures('目录存在但没有任何 fixture 文件');
}

// —— 有 fixture 文件：真跑 lint，收集 ruleId
let ESLint;
try {
  ({ ESLint } = await import('eslint'));
} catch (e) {
  console.error('FAIL 无法加载 eslint: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
}

// ignore:false —— eslint.config.js 里 plugins/fixtures/** 被 ignore（G-5 要求），
// 但本脚本的职责恰恰是去 lint 这些负样本，所以必须绕开该 ignore。
const eslint = new ESLint({ cwd: ROOT, ignore: false });

let results;
try {
  results = await eslint.lintFiles(files.map((f) => relative(ROOT, f)));
} catch (e) {
  console.error('FAIL lint 执行失败: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
}

const entries = [];
for (const r of results) {
  for (const m of r.messages) {
    entries.push({ file: relative(ROOT, r.filePath), ruleId: m.ruleId ?? '(fatal)', severity: m.severity });
  }
}

const actualIds = entries.map((e) => e.ruleId).sort();
const expectedIds = [...EXPECTED_RULE_IDS].sort();
const totalErrors = entries.filter((e) => e.severity === 2).length;

console.log(`fixtures: ${files.length} 个文件，${entries.length} 条诊断，其中 error ${totalErrors} 条`);
for (const e of entries) console.log(`  ${e.file}  ${e.ruleId}`);

let failed = false;
if (totalErrors !== EXPECTED_ERROR_COUNT) {
  failed = true;
  console.error(`FAIL error 条数 ${totalErrors} != 期望 ${EXPECTED_ERROR_COUNT}（G-5）`);
}
if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
  failed = true;
  console.error('FAIL ruleId 集合不符（G-5）');
  const missing = expectedIds.filter((id) => !actualIds.includes(id));
  const extra = actualIds.filter((id) => !expectedIds.includes(id));
  if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`);
  if (extra.length > 0) console.error(`  extra: ${extra.join(', ')}`);
}

if (failed) process.exit(1);
console.log('OK fixtures ruleId 集合恰好等于 {ARK-COLOR-1..5}');
process.exit(0);
