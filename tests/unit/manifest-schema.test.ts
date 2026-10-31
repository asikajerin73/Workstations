import { describe, expect, it } from 'vitest';
import { ArkError } from '../../src/shared/types';
import { PluginManifestSchema, validateManifest, validateManifestSource } from '../../src/shared/manifest-schema';

const DIR = 'F:\\gal\\workstation\\plugins\\notes';

const base = {
  id: 'com.ark.notes',
  name: 'Notes',
  version: '1.0.0',
  entry: 'index.js',
};

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ArkError) return e.code;
    throw e;
  }
  throw new Error('期望抛 ArkError，但没有抛');
}

describe('manifest —— CL-260b 五条错误码', () => {
  it('E-PLUGIN-001：manifest 读不出', () => {
    const code = codeOf(() =>
      validateManifestSource({ ok: false, absPath: `${DIR}\\manifest.json`, reason: 'ENOENT' }, DIR),
    );
    expect(code).toBe('E-PLUGIN-001');
  });

  it('E-PLUGIN-002：schema 校验失败（两段式 version）', () => {
    const code = codeOf(() => validateManifest({ ...base, version: '1.0' }, DIR));
    expect(code).toBe('E-PLUGIN-002');
  });

  it('E-PLUGIN-002：glob 无静态前缀 / 绝对路径字面量', () => {
    expect(
      codeOf(() =>
        validateManifest(
          { ...base, permissions: { fs: { read: ['**\\x'] } } },
          DIR,
          { dataRoot: 'F:\\gal\\workstation\\data' },
        ),
      ),
    ).toBe('E-PLUGIN-002');

    expect(
      codeOf(() =>
        validateManifest(
          { ...base, permissions: { fs: { read: ['C:\\Windows\\**'] } } },
          DIR,
          { dataRoot: 'F:\\gal\\workstation\\data' },
        ),
      ),
    ).toBe('E-PLUGIN-002');
  });

  it('E-PLUGIN-003：id 语义非法', () => {
    const code = codeOf(() => validateManifest({ ...base, id: 'Bad_ID' }, DIR));
    expect(code).toBe('E-PLUGIN-003');
  });

  it('E-PLUGIN-003：id 与其它目录冲突', () => {
    const code = codeOf(() =>
      validateManifest(base, DIR, { takenIds: new Set(['com.ark.notes']) }),
    );
    expect(code).toBe('E-PLUGIN-003');
  });

  it('E-PLUGIN-004：entry 越出插件目录', () => {
    const code = codeOf(() => validateManifest({ ...base, entry: '..\\evil.js' }, DIR));
    expect(code).toBe('E-PLUGIN-004');
  });

  it('E-PLUGIN-005：minAppVersion 高于当前版本', () => {
    const code = codeOf(() =>
      validateManifest({ ...base, minAppVersion: '99.0.0' }, DIR, { currentVersion: '0.1.0' }),
    );
    expect(code).toBe('E-PLUGIN-005');
  });
});

describe('manifest —— 正常路径', () => {
  it('minAppVersion 低于当前版本正常加载（AC-M07-17）', () => {
    const m = validateManifest({ ...base, minAppVersion: '0.0.1' }, DIR, { currentVersion: '0.1.0' });
    expect(m.id).toBe('com.ark.notes');
  });

  it('schema 接受 permissions 缺省（= 无能力）', () => {
    expect(PluginManifestSchema.safeParse(base).success).toBe(true);
  });

  it('<DATA> 展开为 dataRoot，且只展开一次', () => {
    const m = validateManifest(
      { ...base, permissions: { fs: { read: ['<DATA>/notes/**'] } } },
      DIR,
      { dataRoot: 'F:\\gal\\workstation\\data' },
    );
    expect(m.permissions?.fs?.read?.[0]).toBe('F:\\gal\\workstation\\data\\notes\\**');
  });
});
