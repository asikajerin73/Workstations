/**
 * CL-006：应用日志（结构化）。task_id 从 ARK_TASK_ID 取，缺省 'dev'。
 * no-console 只允许 warn/error（ESLint 配置），因此 info 级走 console.warn 会有语义污染 —— 
 * 这里统一用 console.error 输出会误导，故对 info 级使用 stderr 直写。
 */
export type Level = 'info' | 'warn' | 'error';

export interface LogRecord {
  ts: string;
  level: Level;
  task_id: string;
  module: string;
  msg: string;
  [key: string]: unknown;
}

function taskId(): string {
  return process.env['ARK_TASK_ID'] ?? 'dev';
}

export function log(level: Level, module: string, msg: string, extra?: Record<string, unknown>): void {
  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    task_id: taskId(),
    module,
    msg,
    ...extra,
  };
  const line = JSON.stringify(record);
  if (level === 'info') {
    // stderr 直写：避免 console.log（no-console 为 warn）与 console.error 的语义混淆
    process.stderr.write(line + '\n');
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.error(line);
}
