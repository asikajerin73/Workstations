/**
 * CL-001 / CL-002：错误类型与 IPC 响应包络。
 * 本文件在 src/shared/ 下，必须无副作用（CL-102）：不 import electron、不读文件。
 */

/** 错误码集合，必须与 SDS §4.1 完全一致（顺序与分组保留原样）。 */
export type ArkErrorCode =
  | 'E-WIN-001' | 'E-WIN-002' | 'E-WIN-003' | 'E-WIN-010' | 'E-WIN-011' | 'E-WIN-012' | 'E-WIN-020'
  | 'E-PLUGIN-001' | 'E-PLUGIN-002' | 'E-PLUGIN-003' | 'E-PLUGIN-004' | 'E-PLUGIN-005'
  | 'E-PLUGIN-006' | 'E-PLUGIN-007' | 'E-PLUGIN-008'
  | 'E-PERM-001' | 'E-PERM-002' | 'E-PERM-003'
  | 'E-DB-001' | 'E-DB-002' | 'E-DB-003' | 'E-DB-004' | 'E-DB-010' | 'E-DB-011' | 'E-DB-012' | 'E-DB-013'
  | 'E-FS-001' | 'E-FS-002'
  | 'E-NET-001' | 'E-NET-002'
  | 'E-AI-001' | 'E-AI-002' | 'E-AI-003' | 'E-AI-004' | 'E-AI-005'
  | 'E-AI-006' | 'E-AI-007' | 'E-AI-008' | 'E-AI-009'
  | 'E-PALETTE-001' | 'E-PALETTE-002' | 'E-PALETTE-003' | 'E-PALETTE-004'
  | 'E-THEME-001' | 'E-THEME-002';

/** CL-001：禁止裸 throw 字符串，所有错误必须是 ArkError 实例。 */
export class ArkError extends Error {
  constructor(
    public readonly code: ArkErrorCode,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ArkError';
  }
}

/** CL-002：跨 ipcMain.handle 边界的返回值统一包络。 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; code: ArkErrorCode; message: string };

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function err(code: ArkErrorCode, message: string): IpcResult<never> {
  return { ok: false, code, message };
}

export function isArkError(e: unknown): e is ArkError {
  return e instanceof ArkError;
}
