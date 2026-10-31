/**
 * CL-312 / CL-313 / CL-314：检索的 gram 规划与两阶段过滤。
 * 纯函数，无副作用（CL-102）。逐字照抄 SDS CL-312 的参考实现（已实测 8/8 通过）。
 */

export interface GramRun {
  kind: 'cjk' | 'latin';
  source: string;
  grams: string[];
}

export interface GramPlan {
  runs: GramRun[];
  isEmpty: boolean;
}

export function planGrams(s: string): GramPlan {
  // ★ isCJK 必须是这个范围：CJK 扩展A + 基本区 + 兼容区。
  // 写成 [\u3000-\u9fff] 会把全角标点（、。，）吞进 CJK run，检索与高亮全错。
  const isCJK = (c: string) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(c);
  const isAlnum = (c: string) => /[a-zA-Z0-9]/.test(c);

  const runs: GramRun[] = [];
  let kind: 'cjk' | 'latin' | null = null;
  let text = '';
  const flush = () => {
    if (!kind) return;
    if (kind === 'cjk') {
      const grams: string[] = [];
      if (text.length === 1) grams.push(text);
      else for (let i = 0; i < text.length - 1; i++) grams.push(text.slice(i, i + 2));
      runs.push({ kind: 'cjk', source: text, grams });
    } else {
      const low = text.toLowerCase();
      runs.push({ kind: 'latin', source: low, grams: [low] });
    }
    kind = null; text = '';
  };

  for (const ch of s) {
    if (isCJK(ch)) {
      if (kind === 'cjk') text += ch;
      else { flush(); kind = 'cjk'; text = ch; }
    } else if (isAlnum(ch)) {
      if (kind === 'latin') text += ch;
      else { flush(); kind = 'latin'; text = ch; }
    } else { flush(); }
  }
  flush();

  return { runs, isEmpty: runs.length === 0 };
}

/**
 * CL-313 phase1：把 plan 编成一个 FTS5 MATCH 字符串。
 * 每个 run 用短语查询约束 run 内部相邻；run 之间用 AND（跨 run 不要求相邻）。
 * 返回 '' 表示「不该走 FTS」：空查询由调用方直接 return []；单 run 单字 CJK 走 LIKE 分支。
 */
export function buildQuery(plan: GramPlan): string {
  if (plan.isEmpty) return '';
  if (plan.runs.length === 1) {
    const only = plan.runs[0];
    if (only !== undefined && only.kind === 'cjk' && only.source.length === 1) return '';
  }
  return plan.runs
    .map((r) => (r.kind === 'cjk' ? `"${r.grams.join(' ')}"` : `${r.grams[0] ?? ''}*`))
    .join(' AND ');
}

/** CL-313：单 run 且为单字 CJK → 必须走 LIKE 回退，而不是 FTS。 */
export function shouldUseLike(plan: GramPlan): boolean {
  if (plan.isEmpty || plan.runs.length !== 1) return false;
  const only = plan.runs[0];
  return only !== undefined && only.kind === 'cjk' && only.source.length === 1;
}

/**
 * CL-314 phase2：原文级精确过滤（不再做 gram 字符滑窗）。
 * 对每个 run 的 source 做 includes；拉丁侧两边 toLowerCase；全部命中才算匹配。
 */
export function matchRuns(candidate: string, plan: GramPlan): boolean {
  if (plan.isEmpty) return true;
  const lowered = candidate.toLowerCase();
  return plan.runs.every((r) =>
    r.kind === 'cjk' ? candidate.includes(r.source) : lowered.includes(r.source),
  );
}

/** 便捷入口：一步完成「切分 + 精确过滤」。 */
export function matchesQuery(candidate: string, query: string): boolean {
  return matchRuns(candidate, planGrams(query));
}
