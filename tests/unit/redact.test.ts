import { describe, expect, it } from 'vitest';
import { redact } from '../../src/shared/redact';

const ctx = { dataRoot: 'F:\\gal\\workstation\\data', username: '16563' };

// CL-302 R4-01 修正后的 6 条验收用例（AC-M11-01 / AC-M11-02 + 兜底与混排）
describe('redact —— CL-302', () => {
  it('Windows 用户名 → <USER>（不得被兜底吞成 <PATH>）', () => {
    expect(redact('C:\\Users\\16563\\AppData\\x.log', ctx)).toBe('<USER>\\AppData\\x.log');
  });

  it('数据根 → <DATA>', () => {
    expect(redact('F:\\gal\\workstation\\data\\notes\\a.md', ctx)).toBe('<DATA>\\notes\\a.md');
  });

  it('IPv4 → <IP>', () => {
    expect(redact('192.168.1.5', ctx)).toBe('<IP>');
  });

  it('兜底：剩余盘符绝对路径 → <PATH>', () => {
    expect(redact('D:\\other\\thing.txt', ctx)).toBe('<PATH>');
  });

  it('POSIX home 用户名同样识别', () => {
    expect(redact('/home/16563/x', ctx)).toBe('<USER>/x');
  });

  it('混排输入各条规则互不吞并', () => {
    const input = 'F:\\gal\\workstation\\data\\a.db from 10.0.0.7 by C:\\Users\\16563\\x';
    expect(redact(input, ctx)).toBe('<DATA>\\a.db from <IP> by <USER>\\x');
  });

  it('空串安全返回', () => {
    expect(redact('', ctx)).toBe('');
  });
});
