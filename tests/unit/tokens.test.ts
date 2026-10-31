import { describe, expect, it } from 'vitest';
import { deepSpace, themeToCssVars, tokenVarCount } from '../../src/shared/tokens';

describe('shared theme tokens', () => {
  it('exposes deep-space as the authoritative theme id', () => {
    expect(deepSpace.id).toBe('deep-space');
    expect(deepSpace.color.accent).toBe('#4c8dff');
  });

  it('generates 46 CSS variables from the shared token data', () => {
    expect(tokenVarCount(deepSpace)).toBe(46);
    expect(Object.keys(themeToCssVars(deepSpace))).toHaveLength(46);
  });

  it('converts camelCase token names to kebab-case CSS properties', () => {
    const vars = themeToCssVars(deepSpace);
    expect(vars['--ark-surface-hi']).toBe(deepSpace.color.surfaceHi);
    expect(vars['--ark-font-display-line-height']).toBe(String(deepSpace.type.display.lineHeight));
  });

  it('preserves units for radius, spacing, font size, and motion tokens', () => {
    const vars = themeToCssVars(deepSpace);
    expect(vars['--ark-radius-md']).toBe(`${deepSpace.radius.md}px`);
    expect(vars['--ark-space-1']).toBe(`${deepSpace.space[0]}px`);
    expect(vars['--ark-font-body-size']).toBe(`${deepSpace.type.body.size}px`);
    expect(vars['--ark-motion-fast']).toBe(`${deepSpace.motion.fast}ms`);
  });

  it('serializes zero surface blur without losing the zero value', () => {
    expect(themeToCssVars({ ...deepSpace, surfaceBlur: 0 })['--ark-surface-blur']).toBe('0px');
  });
});
