import { describe, expect, it } from 'vitest';
import { planGrams, buildQuery, matchRuns } from '../../src/shared/grams';

// SDS CL-312 实测样例表（逐条断言）
describe('planGrams —— CL-312 样例表', () => {
  it('工作站架构 → 4 个 bigram', () => {
    const p = planGrams('工作站架构');
    expect(p.runs.map((r) => r.source)).toEqual(['工作站架构']);
    expect(p.runs[0]?.grams).toEqual(['工作', '作站', '站架', '架构']);
    expect(p.isEmpty).toBe(false);
  });

  it('贴图工作站 v2 → CJK run + latin run', () => {
    const p = planGrams('贴图工作站 v2');
    expect(p.runs.map((r) => r.source)).toEqual(['贴图工作站', 'v2']);
    expect(p.runs[0]?.grams).toEqual(['贴图', '图工', '工作', '作站']);
    expect(p.runs[1]?.grams).toEqual(['v2']);
  });

  it('单字 工 → 退化为单字 gram', () => {
    const p = planGrams('工');
    expect(p.runs[0]?.source).toBe('工');
    expect(p.runs[0]?.grams).toEqual(['工']);
  });

  it('纬度 xyz → 小写整词', () => {
    const p = planGrams('xyz');
    expect(p.runs[0]?.source).toBe('xyz');
    expect(p.runs[0]?.grams).toEqual(['xyz']);
  });

  it('带空格 工 作 站 → 3 个单字 run（不等价于 工作站）', () => {
    const p = planGrams('工 作 站');
    expect(p.runs.map((r) => r.source)).toEqual(['工', '作', '站']);
    expect(p.runs.map((r) => r.grams)).toEqual([['工'], ['作'], ['站']]);
  });

  it('全角顿号 工、作 → 必须断开 run（isCJK 不得吞全角标点）', () => {
    const p = planGrams('工、作');
    expect(p.runs.map((r) => r.source)).toEqual(['工', '作']);
    expect(p.runs.map((r) => r.grams)).toEqual([['工'], ['作']]);
  });

  it('全角逗号 工作，站 → 两个 run', () => {
    const p = planGrams('工作，站');
    expect(p.runs.map((r) => r.source)).toEqual(['工作', '站']);
    expect(p.runs.map((r) => r.grams)).toEqual([['工作'], ['站']]);
  });

  it('全角句号 工作站。 → 尾标点被丢弃', () => {
    const p = planGrams('工作站。');
    expect(p.runs.map((r) => r.source)).toEqual(['工作站']);
    expect(p.runs[0]?.grams).toEqual(['工作', '作站']);
  });
});

describe('buildQuery / shouldUseLike —— CL-313', () => {
  it('CJK run 用短语查询', () => {
    expect(buildQuery(planGrams('工作站'))).toBe('"工作 作站"');
  });

  it('混排 run 之间用 AND，latin 用前缀通配', () => {
    expect(buildQuery(planGrams('贴图工作站 v2'))).toBe('"贴图 图工 工作 作站" AND v2*');
  });

  it('单 run 单字 CJK 返回空串（应走 LIKE 回退）', () => {
    expect(buildQuery(planGrams('工'))).toBe('');
  });

  it('空查询 isEmpty 且 buildQuery 为空串', () => {
    const p = planGrams('   ');
    expect(p.isEmpty).toBe(true);
    expect(buildQuery(p)).toBe('');
  });
});

describe('matchRuns —— CL-314 原文级过滤', () => {
  it('工作站 命中 工作站架构，但不命中「今天工作 作站很久」同串相邻要求', () => {
    const p = planGrams('工作站');
    expect(matchRuns('工作站架构', p)).toBe(true);
    // N4 原文含「工作」「作站」但不相邻，source 级 includes 判 false —— CL-317 要求排除
    expect(matchRuns('今天工作 作站很久', p)).toBe(false);
  });

  it('作站 命中 N4 字面', () => {
    expect(matchRuns('今天工作 作站很久', planGrams('作站'))).toBe(true);
  });

  it('混排：拉丁侧大小写不敏感', () => {
    expect(matchRuns('贴图工作站 V2 版本', planGrams('贴图工作站 v2'))).toBe(true);
  });

  it('空 plan 视为不过滤', () => {
    expect(matchRuns('任意内容', planGrams(''))).toBe(true);
  });
});
