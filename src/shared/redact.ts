/**
 * CL-302：脱敏（纯函数，零依赖，上下文靠参数注入）。
 * 放在 shared/ 是为了消除 M-07 gateway → M-11 privacy 的循环依赖（SDS v1.1 决定）。
 *
 * ★ R4-01 修正：用户名不再保留 `C:\Users\` 前缀，且第 4 步兜底正则必须带前视守卫，
 *   否则 `C:\Users\<USER>\...` 会被兜底整段吞成 `<PATH>`，AC-M11-01 的 `<USER>` 永不出现。
 */

export interface RedactCtx {
  dataRoot: string;
  username: string;
}

export function redact(text: string, ctx: RedactCtx): string {
  if (!text) return text;
  let s = text;

  // 1. 数据根（先替换最长者，避免被后续规则切碎）
  if (ctx.dataRoot) s = s.split(ctx.dataRoot).join('<DATA>');

  // 2. 用户名 → 直接替换成 <USER>，不带盘符前缀（关键：避免被第 4 步整体吞掉）
  if (ctx.username) {
    s = s.split(`C:\\Users\\${ctx.username}`).join('<USER>');
    s = s.split(`/Users/${ctx.username}`).join('<USER>');
    s = s.split(`/home/${ctx.username}`).join('<USER>');
  }

  // 3. IPv4
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<IP>');

  // 4. 兜底：剩余任意盘符绝对路径（前视守卫避免吃掉已生成的 <USER>/<DATA> 标记）
  s = s.replace(/(?<![<\w])[A-Za-z]:\\[^\s"']+/g, '<PATH>');

  return s;
}
