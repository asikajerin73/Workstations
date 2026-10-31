/**
 * 路径小工具（纯字符串运算，零依赖、无副作用）。
 * 单独成文件是为了让 glob.ts / manifest-schema.ts 共用同一份尾分隔符规范化逻辑。
 */

/** 去掉尾部分隔符；根路径（长度 1，如 `C` 之外的 `/`）保留。 */
export function stripTrailingSep(p: string): string {
  return p.length > 1 && (p.endsWith('/') || p.endsWith('\\')) ? p.slice(0, -1) : p;
}

/** 归一化分隔符为 Windows 反斜杠（本项目仅 Windows）。 */
export function toWinSep(p: string): string {
  return p.replace(/\//g, '\\');
}

/** 手写的 join：避免 import node:path（web 侧也要能用）。 */
export function joinWin(...parts: string[]): string {
  const filtered = parts.filter((s) => s.length > 0).map(toWinSep);
  if (filtered.length === 0) return '';
  return filtered
    .map((s, i) => (i === 0 ? stripTrailingSep(s) : stripTrailingSep(s).replace(/^\\+/, '')))
    .filter((s) => s.length > 0)
    .join('\\');
}

/** 是否 Windows 盘符绝对路径（`C:\` 或 `C:/`）。 */
export function isAbsoluteWinPath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

/** 取父目录（不含尾分隔符）。无父目录 → 返回空串。 */
export function dirNameWin(p: string): string {
  const s = stripTrailingSep(toWinSep(p));
  const i = s.lastIndexOf('\\');
  return i <= 0 ? '' : s.slice(0, i);
}
