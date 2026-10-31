/**
 * CL-203：最小 .env 解析（不引入 dotenv）。
 * - 每行：跳过空行与 # 开头；按第一个 = 切分；trim 两侧。
 * - 已存在于 process.env 的 key 不覆盖（外部显式设置优先）。
 * - 不支持引号嵌套、多行值、变量插值。
 * - 文件不存在不抛错。
 */
import { existsSync, readFileSync } from 'node:fs';

export function loadEnvFromDisk(paths: string[]): void {
  for (const path of paths) {
    let text: string;
    try {
      if (!existsSync(path)) continue;
      text = readFileSync(path, 'utf8');
    } catch (e) {
      // E-WIN-003：.env 读不出记 warn 后继续（env 是可选）
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          task_id: process.env['ARK_TASK_ID'] ?? 'dev',
          module: 'load-env',
          msg: `env 读取失败，继续启动: ${path}`,
          reason: e instanceof Error ? e.message : String(e),
        }),
      );
      continue;
    }

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (key.length === 0) continue;
      if (process.env[key] !== undefined) continue; // 外部显式设置优先
      process.env[key] = value;
    }
  }
}
