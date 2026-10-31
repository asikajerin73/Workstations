/**
 * CL-262：glob 匹配、静态前缀、越权拦截。
 * 纯函数，无副作用（CL-102）。
 *
 * 本项目仅支持 Windows（SDS 0.5 / PLAN 目标平台），因此手写分隔符常量 SEP = '\\'，
 * 不 import node:path —— 这样 renderer（web 侧）也能直接复用本模块。
 */
import { stripTrailingSep, toWinSep } from './path-utils';

/** Windows 路径分隔符。仅 Windows 支持，故写死。 */
const SEP = '\\';

export { stripTrailingSep };

/** Windows 路径比较统一走：分隔符归一为 `\` + 小写（大小写不敏感）。 */
function normalize(p: string): string {
  return p.replace(/\//g, SEP).toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.+()\[\]{}^$|\\]/g, '\\$&');
}

/**
 * 把 glob 编译为正则：
 *   `**` → `.*`
 *   `*`  → `[^/\\]*`（不跨分隔符）
 *   `?`  → `[^/\\]`
 */
function globToRegExp(pattern: string): RegExp {
  const src = normalize(pattern);
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (c === SEP && src.charAt(i + 1) === '*' && src.charAt(i + 2) === '*') {
      // 分隔符 + `**`：匹配「零层」也匹配任意层级
      // 例：<DATA>\** 必须同时命中 <DATA> 本身与 <DATA>\a\b（CL-262「含零层」）
      out += '(?:\\\\[\\s\\S]*)?';
      i += 2;
    } else if (c === '*' && src.charAt(i + 1) === '*') {
      out += '.*';
      i++;
    } else if (c === '*') {
      out += '[^/\\\\]*';
    } else if (c === '?') {
      out += '[^/\\\\]';
    } else {
      out += escapeRegex(c);
    }
  }
  return new RegExp(`^${out}$`);
}

/** `matchGlob(pattern, absPath)` —— 两边都 path.resolve 后由调用方传入；此处大小写不敏感比较。 */
export function matchGlob(pattern: string, absPath: string): boolean {
  if (pattern.length === 0 || absPath.length === 0) return false;
  return globToRegExp(pattern).test(normalize(absPath));
}

/**
 * `staticPrefix(pattern)`：取到第一个通配符之前，再截到最后一个分隔符为止，最后 stripTrailingSep。
 * 以通配符开头（无静态前缀）→ 返回 ''，由 manifest 校验判为非法（E-PLUGIN-002）。
 */
export function staticPrefix(pattern: string): string {
  const firstWild = pattern.search(/[*?]/);
  const head = firstWild === -1 ? pattern : pattern.slice(0, firstWild);
  const lastSep = Math.max(head.lastIndexOf('/'), head.lastIndexOf(SEP));
  if (lastSep < 0) return '';
  // 归一到反斜杠，保证日志/错误消息里的路径形态一致（比较侧另有 normalize）
  return toWinSep(stripTrailingSep(head.slice(0, lastSep)));
}

/**
 * `isUnder(real, realPrefix)`：必须以 `prefix + SEP` 为前缀，
 * 否则 `C:\data\ok-evil\x` 会通过 `C:\data\ok/**`（CL-262 越权绕过 / AC-M07-11）。
 */
export function isUnder(real: string, realPrefix: string): boolean {
  const p = stripTrailingSep(normalize(realPrefix));
  const r = normalize(real);
  if (p.length === 0) return false;
  return r === p || r.startsWith(p + SEP);
}
