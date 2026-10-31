/**
 * CL-204：数据根解析。
 * 顺序：
 *   1. env.ARK_DATA_DIR 非空 → path.resolve
 *   2. !isPackaged → <appPath>/data
 *   3. isPackaged && isWritable(<exeDir>/data) → 该路径
 *   4. 回退 → <userDataPath>/data
 *
 * 「可写探测」以可选参数注入，便于纯函数单测；默认实现用 fs.accessSync。
 */
import { accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ArkError } from '@shared/types';

export type IsWritable = (p: string) => boolean;

export function defaultIsWritable(p: string): boolean {
  try {
    accessSync(p, constants.W_OK);
    return true;
  } catch {
    // 不可写是正常分支（触发回退），不是需要上报的异常
    return false;
  }
}

export function resolveDataRoot(
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
  appPath: string,
  exePath: string,
  userDataPath: string,
  isWritable: IsWritable = defaultIsWritable,
): string {
  const explicit = env['ARK_DATA_DIR'];
  if (explicit !== undefined && explicit.trim().length > 0) {
    return resolve(explicit.trim());
  }

  if (!isPackaged) {
    return join(appPath, 'data');
  }

  const exeData = join(dirname(exePath), 'data');
  if (isWritable(exeData)) {
    return exeData;
  }

  const userData = join(userDataPath, 'data');
  if (isWritable(userData)) {
    return userData;
  }

  // AC-M01-05：所有候选都不可写 → E-WIN-002
  throw new ArkError('E-WIN-002', `数据根不可写: ${userData}`, { exeData, userData });
}
