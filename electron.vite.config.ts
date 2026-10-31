import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

// 说明：@vitejs/plugin-react 不在 T-002 的 17 个 devDependencies 白名单内。
// renderer 走 Vite 5 内置的 esbuild JSX 转换（automatic runtime），本任务只用最基础 JSX。
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/shell.ts') },
        // sandbox: true 下 preload 只能是 CJS：显式锁格式，扩展名保持 index.js（ACCEPT A6）
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: { '@shared': resolve('src/shared') } },
    esbuild: { jsx: 'automatic' },
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } },
    },
  },
});
