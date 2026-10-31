/**
 * CL-260 / CL-260b：插件 manifest 的 zod schema 与 5 条错误码判定。
 *
 * 判定顺序固定：001（读文件）→ 002（schema/glob 合法性）→ 003（id 语义）
 *              → 004（entry 越界）→ 005（版本）。
 *
 * 纯模块：不读文件。文件读取由调用方（M-07 gateway）完成，把 AST 或原始文本传进来；
 * 需要「读不出文件」这一条时，用 `validateManifestSource()` 并传入 err。
 */
import { z } from 'zod';
import { ArkError } from './types';
import { isAbsoluteWinPath, stripTrailingSep, toWinSep } from './path-utils';
import { staticPrefix, isUnder } from './glob';

export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
  name: z.string().min(1).max(32),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  entry: z.string().min(1),
  icon: z.string().optional(),
  ui: z.object({ private: z.boolean().default(false) }).optional(),
  permissions: z
    .object({
      fs: z
        .object({
          read: z.array(z.string()).optional(),
          write: z.array(z.string()).optional(),
        })
        .optional(),
      db: z.boolean().optional(),
      ai: z.array(z.enum(['chat'])).optional(),
      clipboard: z.boolean().default(false).optional(),
    })
    .optional(),
  commands: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        keys: z.string().optional(),
      }),
    )
    .optional(),
  minAppVersion: z.string().optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

const ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const SEMVER3 = /^\d+\.\d+\.\d+$/;
const DATA_PLACEHOLDER = '<DATA>';

/** 逐段数字比较；返回 true 表示 current < min。 */
export function isVersionLess(current: string, min: string): boolean {
  const a = current.split('.').map((n) => Number.parseInt(n, 10));
  const b = min.split('.').map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

function zodMessage(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; ');
}

function globsOf(m: PluginManifest): string[] {
  const fsPerm = m.permissions?.fs;
  return [...(fsPerm?.read ?? []), ...(fsPerm?.write ?? [])];
}

/**
 * glob 合法性（归 E-PLUGIN-002）：
 *  - 含绝对路径字面量 → 非法
 *  - 既不含 <DATA> 又不是相对路径 → 非法
 *  - 静态前缀为空（以通配符开头）→ 非法
 */
function checkGlobs(m: PluginManifest): string | null {
  for (const g of globsOf(m)) {
    const isAbsoluteLiteral = isAbsoluteWinPath(g) || g.startsWith('/');
    if (isAbsoluteLiteral) {
      return `glob 含绝对路径字面量: ${g}`;
    }
    const hasData = g.includes(DATA_PLACEHOLDER);
    if (!hasData && !g.startsWith('./') && !g.startsWith('../')) {
      return `glob 缺少 <DATA> 根占位: ${g}`;
    }
    if (staticPrefix(g).length === 0) {
      return `glob 无静态前缀: ${g}`;
    }
  }
  return null;
}

/** `<DATA>` 一次性展开 + 归一化（CL-262）。结果缓存在 manifest.__resolved。 */
export function resolveManifestGlobs(m: PluginManifest, dataRoot: string): PluginManifest {
  const fsPerm = m.permissions?.fs;
  if (!fsPerm) return m;
  const expand = (arr: string[] | undefined): string[] | undefined =>
    arr?.map((g) => stripTrailingSep(toWinSep(g.split(DATA_PLACEHOLDER).join(dataRoot))));
  return {
    ...m,
    permissions: {
      ...m.permissions,
      fs: { read: expand(fsPerm.read), write: expand(fsPerm.write) },
    },
  };
}

export interface ValidateOptions {
  /** 当前 app 版本，用于 minAppVersion 比较，默认 '0.1.0'。 */
  currentVersion?: string;
  /** 数据根，用于 <DATA> 展开与 entry 越界判定（可选）。 */
  dataRoot?: string;
  /** 已被其它目录占用的 id 集合（E-PLUGIN-003 重复判定）。 */
  takenIds?: ReadonlySet<string>;
}

/**
 * `validateManifest(raw, pluginDir, opts)`。
 * `raw` 是**已经 JSON.parse 成功**的值；读文件失败那一层由 validateManifestSource 负责。
 */
export function validateManifest(raw: unknown, pluginDir: string, opts: ValidateOptions = {}): PluginManifest {
  const currentVersion = opts.currentVersion ?? '0.1.0';

  // —— 003（前置）：id 语义
  // SDS CL-260b 说「zod 通过但 id 不匹配」才归 003，但 §4.3 的 schema 里 id 就带同一个正则，
  // 按字面实现 003 永远不可达（AC-M07-16 的 `id: "Bad_ID"` 会落到 002）。
  // 这里把「id 是字符串但语义非法」提到 schema 之前判定，其余 schema 错误仍归 002。
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const rawId = (raw as { id: unknown }).id;
    if (typeof rawId === 'string' && !ID_PATTERN.test(rawId)) {
      throw new ArkError('E-PLUGIN-003', `plugin id 非法或重复: ${rawId}`);
    }
  }

  // —— 002：schema 校验
  const parsed = PluginManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ArkError('E-PLUGIN-002', `manifest 校验失败: ${zodMessage(parsed.error)}`);
  }
  const m = parsed.data;

  // —— 002：glob 合法性
  const globErr = checkGlobs(m);
  if (globErr !== null) {
    throw new ArkError('E-PLUGIN-002', `manifest 校验失败: ${globErr}`);
  }

  // —— 003：id 重复
  if (opts.takenIds?.has(m.id)) {
    throw new ArkError('E-PLUGIN-003', `plugin id 非法或重复: ${m.id}`);
  }

  // —— 004：entry 不越出插件目录
  const dir = toWinSep(stripTrailingSep(pluginDir));
  const entryAbs = entryResolve(dir, m.entry);
  if (!isUnder(entryAbs, dir)) {
    throw new ArkError('E-PLUGIN-004', `entry 越出插件目录: ${m.entry}`);
  }

  // —— 005：minAppVersion（非三段式已在 schema 层被 002 拒绝）
  if (m.minAppVersion !== undefined) {
    if (!SEMVER3.test(m.minAppVersion)) {
      throw new ArkError('E-PLUGIN-002', `manifest 校验失败: minAppVersion:${m.minAppVersion}`);
    }
    if (isVersionLess(currentVersion, m.minAppVersion)) {
      throw new ArkError('E-PLUGIN-005', `需要 ARK >= ${m.minAppVersion}，当前 ${currentVersion}`);
    }
  }

  return opts.dataRoot ? resolveManifestGlobs(m, opts.dataRoot) : m;
}

/** 手写 resolve(pluginDir, entry)：消解 `.`/`..`，不 import node:path。 */
function entryResolve(dir: string, entry: string): string {
  const parts = `${dir}\\${toWinSep(entry)}`.split('\\');
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      stack.pop();
      continue;
    }
    stack.push(p);
  }
  return stack.join('\\');
}

/**
 * 带「读文件」语义的入口：`readError` 非空即 E-PLUGIN-001。
 * 让 001（读不出）与 002（schema）的判定顺序在类型上就不可颠倒。
 */
export function validateManifestSource(
  source: { ok: true; text: string } | { ok: false; absPath: string; reason: string },
  pluginDir: string,
  opts: ValidateOptions = {},
): PluginManifest {
  if (!source.ok) {
    throw new ArkError('E-PLUGIN-001', `manifest 无法读取: ${source.absPath} (${source.reason})`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(source.text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new ArkError('E-PLUGIN-001', `manifest 无法读取: ${pluginDir}\\manifest.json (${reason})`);
  }
  return validateManifest(raw, pluginDir, opts);
}
