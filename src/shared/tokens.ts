/**
 * M-04 / CL-230：主题 token 与 CSS 变量生成（纯函数，无副作用）。
 * token 数据放在 tokens.data.json，这样 scripts/gen-tokens.mjs 与 TS 侧共用同一份数据源，
 * 不需要用正则解析 TypeScript（Node 20 不能直接 import .ts）。
 */
import data from './tokens.data.json';

export interface Theme {
  id: 'deep-space' | 'parchment' | 'high-contrast';
  name: string;
  color: Record<
    'bg' | 'surface' | 'surfaceHi' | 'border' | 'text' | 'textDim' | 'accent' | 'accentSoft' | 'danger',
    string
  >;
  radius: Record<'sm' | 'md' | 'lg' | 'xl', number>;
  space: number[];
  type: Record<'display' | 'h1' | 'h2' | 'body' | 'caption' | 'mono', { size: number; weight: number; lineHeight: number }>;
  shadow: Record<'card' | 'float' | 'modal', string>;
  motion: { fast: number; base: number; slow: number; spring: string };
  surfaceBlur: number;
}

/**
 * JSON 里 `id` 被推断为 string，不满足 Theme 的字面量联合；
 * 这里用一次显式断言收口（不让它退化成 any）。
 */
export const deepSpace: Theme = (data as unknown as { deepSpace: Theme }).deepSpace;

/** camelCase / 数字键 → kebab-case：surfaceHi → surface-hi。 */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** CL-230 / AC-M04-05：主题 → CSS 变量表。surfaceBlur 为 0 时必须输出 `0px`。 */
export function themeToCssVars(t: Theme): Record<`--ark-${string}`, string> {
  const vars: Record<`--ark-${string}`, string> = {};

  for (const [k, v] of Object.entries(t.color)) vars[`--ark-${kebab(k)}`] = v;

  for (const [k, v] of Object.entries(t.radius)) vars[`--ark-radius-${kebab(k)}`] = `${v}px`;

  t.space.forEach((v, i) => {
    vars[`--ark-space-${i + 1}`] = `${v}px`;
  });

  for (const [k, v] of Object.entries(t.type)) {
    vars[`--ark-font-${kebab(k)}-size`] = `${v.size}px`;
    vars[`--ark-font-${kebab(k)}-weight`] = String(v.weight);
    vars[`--ark-font-${kebab(k)}-line-height`] = String(v.lineHeight);
  }

  for (const [k, v] of Object.entries(t.shadow)) vars[`--ark-shadow-${kebab(k)}`] = v;

  vars['--ark-motion-fast'] = `${t.motion.fast}ms`;
  vars['--ark-motion-base'] = `${t.motion.base}ms`;
  vars['--ark-motion-slow'] = `${t.motion.slow}ms`;
  vars['--ark-motion-spring'] = t.motion.spring;

  vars['--ark-surface-blur'] = `${t.surfaceBlur}px`;

  return vars;
}

/**
 * E-THEME-002 的期望数量不硬编码：由 `themeToCssVars(deepSpace)` 运行时计算，
 * 与 gen-tokens.mjs 实际写出的 `--ark-*` 行数比对（见 scripts/gen-tokens.mjs）。
 * 硬编码数字会随 token 增删而过期失配。
 */
export function tokenVarCount(t: Theme): number {
  return Object.keys(themeToCssVars(t)).length;
}
