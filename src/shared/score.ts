/**
 * CL-280 / CL-281：命令面板评分（纯函数，可单测，无库依赖）。
 */

export interface ScoreCandidate {
  title: string;
  subtitle?: string;
  keywords?: string[];
}

/**
 * CL-281 分词：CJK 按单字切；拉丁/数字按整词切（/[a-z0-9]+/）；丢弃标点。返回小写数组。
 */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[a-zA-Z0-9]+/g;
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    out.push(m[0].toLowerCase());
    m = re.exec(s);
  }
  return out;
}

/** 双指针：q 的每个字符按序在 haystack 中出现即通过。 */
export function isSubsequence(q: string, haystack: string): boolean {
  if (q.length === 0) return true;
  let i = 0;
  for (let j = 0; j < haystack.length && i < q.length; j++) {
    if (haystack.charAt(j) === q.charAt(i)) i++;
  }
  return i === q.length;
}

/**
 * 连续命中字节数：q 在 haystack 中按序命中的位置里，最长连续段长度。
 * 连续命中时 result === q.length（CL-280 的常态分支）。
 */
function longestContiguousHit(q: string, haystack: string): number {
  let best = 0;
  let run = 0;
  let i = 0;
  for (let j = 0; j < haystack.length && i < q.length; j++) {
    if (haystack.charAt(j) === q.charAt(i)) {
      run += 1;
      i += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function scoreOne(haystack: string, q: string): number | null {
  const idx = haystack.indexOf(q);
  if (idx >= 0) {
    let s = 100 + Math.min(q.length, 20); // 命中即 100 起，越长越信（上限 +20）
    if (idx === 0) s += 30;               // 前缀命中
    if (haystack === q) s += 50;          // 完全相等
    return s;
  }
  const tokens = tokenize(q);
  if (tokens.length > 0 && tokens.every((t) => haystack.includes(t))) {
    return 30 + tokens.length;
  }
  if (isSubsequence(q, haystack)) {
    const matched = longestContiguousHit(q, haystack);
    return 10 + (matched / haystack.length) * 5;
  }
  return null;
}

/**
 * CL-280：`score(cmd, q)`。
 * 空查询（trim 后为空）→ null，表示「不过滤，全量按频率排序」。
 * 全 haystack 都不命中 → null，该命令被排除。
 */
export function score(cmd: ScoreCandidate, q: string): number | null {
  const query = q.trim().toLowerCase();
  if (query.length === 0) return null;

  const haystacks = [cmd.title, cmd.subtitle ?? '', ...(cmd.keywords ?? [])].map((h) => h.toLowerCase());

  let best: number | null = null;
  for (const h of haystacks) {
    const s = scoreOne(h, query);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

export interface RankableCommand extends ScoreCandidate {
  id: string;
  usageCount?: number;
}

/** CL-280 排序键：[score desc, usageCount desc, id asc]（id 走字典序字符串比较，保证确定性）。 */
export function rankCommands<T extends RankableCommand>(cmds: T[], q: string): T[] {
  const scored: { cmd: T; s: number }[] = [];
  for (const cmd of cmds) {
    const s = score(cmd, q);
    if (s === null && q.trim().length > 0) continue;
    scored.push({ cmd, s: s ?? 0 });
  }
  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    const ua = a.cmd.usageCount ?? 0;
    const ub = b.cmd.usageCount ?? 0;
    if (ub !== ua) return ub - ua;
    return a.cmd.id < b.cmd.id ? -1 : a.cmd.id > b.cmd.id ? 1 : 0;
  });
  return scored.map((x) => x.cmd);
}
