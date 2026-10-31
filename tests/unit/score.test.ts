import { describe, expect, it } from 'vitest';
import { isSubsequence, rankCommands, score, tokenize } from '../../src/shared/score';

describe('score —— CL-280', () => {
  it('子串命中：100 + min(len,20)，完全相等再加 50', () => {
    // haystack === q：100 + 4 + 30(前缀) + 50(相等) = 184
    expect(score({ title: '新建笔记' }, '新建笔记')).toBe(184);
    // 前缀命中：100 + 2 + 30 = 132
    expect(score({ title: '新建笔记' }, '新建')).toBe(132);
  });

  it('非前缀子串不得前缀加成（SDS 无位置衰减，中段命中只拿基础分）', () => {
    // 100 + 2 = 102，无 +30（idx!==0），也无任何 idx/10 衰减
    expect(score({ title: 'abc新建' }, '新建')).toBe(102);
  });

  it('子序列命中：10 + (连续命中字节数 / haystack.length) * 5', () => {
    // 'xin' 在 'xian' 中是子序列：x→x 连续，i→i 连续（run=2），a 断了 n 只能从后续找
    // 最长连续命中 = 2 → 10 + (2 / 4) * 5 = 12.5
    const s = score({ title: 'xian' }, 'xin');
    expect(s).toBeCloseTo(10 + (2 / 4) * 5, 10);
  });

  it('无命中返回 null', () => {
    expect(score({ title: '新建笔记' }, 'zzz')).toBeNull();
  });

  it('空查询返回 null（表示不过滤，全量按频率排序）', () => {
    expect(score({ title: '新建笔记' }, '   ')).toBeNull();
  });

  it('多 haystack 取最大分；keywords 参与评分', () => {
    const withKw = score({ title: '无关', keywords: ['新建笔记'] }, '新建');
    expect(withKw).toBe(132);
  });

  it('tokenize：CJK 单字 + 拉丁整词，丢弃标点', () => {
    expect(tokenize('新建 Note-01，好')).toEqual(['新', '建', 'note', '01', '好']);
  });

  it('isSubsequence 双指针', () => {
    expect(isSubsequence('abc', 'a1b2c3')).toBe(true);
    expect(isSubsequence('abc', 'acb')).toBe(false);
  });

  it('排序键：score desc → usageCount desc → id asc', () => {
    const cmds = [
      { id: 'b.cmd', title: '新建笔记', usageCount: 1 },
      { id: 'a.cmd', title: '新建笔记', usageCount: 1 },
      { id: 'c.cmd', title: '新建笔记', usageCount: 9 },
      { id: 'd.cmd', title: '无关内容', usageCount: 99 },
    ];
    expect(rankCommands(cmds, '新建').map((c) => c.id)).toEqual(['c.cmd', 'a.cmd', 'b.cmd']);
  });

  it('同分同频结果稳定（跑 10 次一致）', () => {
    const cmds = [
      { id: 'z.cmd', title: '新建', usageCount: 0 },
      { id: 'a.cmd', title: '新建', usageCount: 0 },
    ];
    const first = rankCommands(cmds, '新建').map((c) => c.id).join(',');
    for (let i = 0; i < 10; i++) {
      expect(rankCommands(cmds, '新建').map((c) => c.id).join(',')).toBe(first);
    }
  });
});
