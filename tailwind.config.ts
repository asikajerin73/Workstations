import type { Config } from 'tailwindcss';

// 颜色不写死：# 由 tokens.css 的 --ark-* 变量提供（CL-230 变量写入点唯一性）
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        ark: {
          bg: 'var(--ark-bg)',
          surface: 'var(--ark-surface)',
          surfaceHi: 'var(--ark-surface-hi)',
          border: 'var(--ark-border)',
          text: 'var(--ark-text)',
          textDim: 'var(--ark-text-dim)',
          accent: 'var(--ark-accent)',
          accentSoft: 'var(--ark-accent-soft)',
          danger: 'var(--ark-danger)',
        },
      },
      borderRadius: {
        ark: 'var(--ark-radius-md)',
      },
    },
  },
  plugins: [],
} satisfies Config;
