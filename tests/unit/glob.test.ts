import { describe, expect, it } from 'vitest';
import { isUnder, matchGlob, staticPrefix, stripTrailingSep } from '../../src/shared/glob';

const DATA = 'F:\\gal\\workstation\\data';

describe('matchGlob —— CL-262', () => {
  it('* 不跨分隔符', () => {
    expect(matchGlob(`${DATA}\\notes\\*.md`, `${DATA}\\notes\\a.md`)).toBe(true);
    expect(matchGlob(`${DATA}\\notes\\*.md`, `${DATA}\\notes\\x\\a.md`)).toBe(false);
  });

  it('** 跨任意层级（含零层）', () => {
    expect(matchGlob(`${DATA}\\**`, `${DATA}\\notes\\x\\a.md`)).toBe(true);
    expect(matchGlob(`${DATA}\\**`, DATA)).toBe(true);
  });

  it('? 匹配恰好一个非分隔符字符', () => {
    expect(matchGlob(`${DATA}\\a?.md`, `${DATA}\\ab.md`)).toBe(true);
    expect(matchGlob(`${DATA}\\a?.md`, `${DATA}\\a\\b.md`)).toBe(false);
  });

  it('大小写不敏感（Windows）', () => {
    expect(matchGlob(`${DATA}\\Notes\\*.MD`, `${DATA}\\notes\\a.md`)).toBe(true);
  });
});

describe('isUnder —— 越权拦截', () => {
  it('ok-evil 不得通过 ok/**（缺 +SEP 就会越权）', () => {
    expect(isUnder('F:\\gal\\workstation\\data\\ok-evil\\x', 'F:\\gal\\workstation\\data\\ok')).toBe(false);
  });

  it('正常子路径通过', () => {
    expect(isUnder('F:\\gal\\workstation\\data\\ok\\x', 'F:\\gal\\workstation\\data\\ok')).toBe(true);
    expect(isUnder('F:\\gal\\workstation\\data\\ok', 'F:\\gal\\workstation\\data\\ok')).toBe(true);
  });

  it('前缀带尾分隔符时不失配（全部 deny 的旧坑）', () => {
    expect(isUnder(`${DATA}\\notes\\a.md`, `${DATA}\\notes\\`)).toBe(true);
  });
});

describe('staticPrefix / stripTrailingSep', () => {
  it('取到第一个通配符前，再截到最后一个分隔符', () => {
    expect(staticPrefix(`${DATA}\\notes\\**`)).toBe(`${DATA}\\notes`);
    expect(staticPrefix(`${DATA}\\*.md`)).toBe(DATA);
  });

  it('以通配符开头 → 无静态前缀（返回空串，manifest 判 E-PLUGIN-002）', () => {
    expect(staticPrefix('**\\x')).toBe('');
    expect(staticPrefix('*.md')).toBe('');
  });

  it('stripTrailingSep 只去一层尾部，根路径保留', () => {
    expect(stripTrailingSep(`${DATA}\\`)).toBe(DATA);
    expect(stripTrailingSep('/')).toBe('/');
  });
});
