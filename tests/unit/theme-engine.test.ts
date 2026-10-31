import { beforeEach, describe, expect, it } from 'vitest';
import { ArkError } from '../../src/shared/types';
import { deepSpace, themeToCssVars, type Theme } from '../../src/shared/tokens';
import { applyTheme, createThemeEngine, getCurrentThemeId, type ThemeTarget } from '../../src/renderer/theme-engine';

class FakeTarget implements ThemeTarget {
  readonly values = new Map<string, string>();
  calls = 0;

  setProperty(name: string, value: string): void {
    this.calls += 1;
    this.values.set(name, value);
  }
}

const blurZeroTheme: Theme = {
  ...deepSpace,
  id: 'high-contrast',
  name: 'test blur zero',
  color: { ...deepSpace.color, accent: '#ff0000' },
  surfaceBlur: 0,
};

function targetFor(theme: Theme): ThemeTarget {
  const vars = themeToCssVars(theme);
  return { setProperty: (name, value) => { vars[name as keyof typeof vars] = value; } };
}

beforeEach(() => {
  applyTheme(targetFor(deepSpace), deepSpace.id);
});

describe('renderer theme engine', () => {
  it('applies every deep-space generated variable and returns its theme', () => {
    const target = new FakeTarget();
    const result = applyTheme(target, 'deep-space');
    expect(result).toBe(deepSpace);
    expect(Object.fromEntries(target.values)).toEqual(themeToCssVars(deepSpace));
    expect(target.values.size).toBe(46);
    expect(target.calls).toBe(46);
  });

  it('changes accent and serializes zero blur as 0px for an independent theme', () => {
    const vars = themeToCssVars(blurZeroTheme);
    const before = themeToCssVars(deepSpace);
    const engine = createThemeEngine([deepSpace, blurZeroTheme]);
    const target = new FakeTarget();
    engine.applyTheme(target, deepSpace.id);
    expect(target.values.get('--ark-accent')).toBe(before['--ark-accent']);
    expect(engine.getCurrentThemeId()).toBe(deepSpace.id);
    engine.applyTheme(target, blurZeroTheme.id);
    expect(vars['--ark-accent']).toBe('#ff0000');
    expect(target.values.get('--ark-accent')).toBe('#ff0000');
    expect(target.values.get('--ark-accent')).not.toBe(before['--ark-accent']);
    expect(target.values.get('--ark-surface-blur')).toBe('0px');
    expect(engine.getCurrentThemeId()).toBe(blurZeroTheme.id);
  });

  it('rejects unknown ids before any writes and preserves current theme', () => {
    const target = new FakeTarget();
    applyTheme(target, 'deep-space');
    const previous = getCurrentThemeId();
    const previousVars = new Map(target.values);
    const previousCalls = target.calls;
    let thrown: unknown;
    try {
      applyTheme(target, 'unknown');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ArkError);
    expect((thrown as ArkError).code).toBe('E-THEME-001');
    expect(target.calls).toBe(previousCalls);
    expect(target.values).toEqual(previousVars);
    expect(getCurrentThemeId()).toBe(previous);
  });

  it('records current id only after a successful variable application', () => {
    const target = new FakeTarget();
    expect(getCurrentThemeId()).toBe('deep-space');
    applyTheme(target, 'deep-space');
    expect(getCurrentThemeId()).toBe('deep-space');
    expect(target.values.get('--ark-bg')).toBe(themeToCssVars(deepSpace)['--ark-bg']);
  });
});
