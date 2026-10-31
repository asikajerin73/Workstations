/**
 * CL-104 / CL-105：主进程 IPC 通道注册。
 *
 * 本任务涉及三条通道（全部来自 CL-104 的白名单）：
 *   - `test:summon`      E2E 专用；仅 `!isPackaged && ARK_E2E === '1'` 时注册（AC-M02-10）
 *   - `window:summon`    preload `ark.window.summon()` 的落点（CL-218）
 *   - `window:hide`      preload `ark.window.hide()` 的落点（CL-212）
 *   - `window:hidden-ack` renderer 确认退场（CL-219，fire-and-forget）
 *
 * 依赖全部经参数注入（ipcMain / api / isPackaged / env），单测不需要 Electron。
 */
import { err, ok, type ArkErrorCode, type IpcResult } from '../shared/types';
import type { WindowApi } from './window';

export interface IpcMainLike {
  handle(channel: string, fn: (...a: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

export interface IpcMainEventLike {
  on(channel: string, fn: (...a: unknown[]) => void): void;
  removeAllListeners(channel: string): void;
}

export interface RegisterTestChannelsDeps {
  ipcMain: IpcMainLike;
  api: WindowApi;
  isPackaged: boolean;
  env: NodeJS.ProcessEnv;
}

export const CHANNEL_TEST_SUMMON = 'test:summon';
export const CHANNEL_WINDOW_SUMMON = 'window:summon';
export const CHANNEL_WINDOW_HIDE = 'window:hide';
export const CHANNEL_HIDDEN_ACK = 'window:hidden-ack';

/** CL-105 守卫：E2E 通道只在未打包 + 显式开启时存在。 */
export function shouldRegisterTestChannels(isPackaged: boolean, env: NodeJS.ProcessEnv): boolean {
  return !isPackaged && env['ARK_E2E'] === '1';
}

/** 把操作包成 CL-002 的 IpcResult 包络；不吞异常，错误码来自 §4.1。 */
async function envelope(
  op: () => Promise<void>,
  code: ArkErrorCode,
): Promise<IpcResult<void>> {
  try {
    await op();
    return ok(undefined as void);
  } catch (e) {
    return err(code, e instanceof Error ? e.message : String(e));
  }
}

/**
 * 仅注册 `test:summon`。
 * 未满足 CL-105 条件时**不注册任何 handler**，故 invoke 必然 reject（AC-M02-10）。
 */
export function registerTestChannels(deps: RegisterTestChannelsDeps): void {
  if (!shouldRegisterTestChannels(deps.isPackaged, deps.env)) {
    return;
  }
  deps.ipcMain.handle(CHANNEL_TEST_SUMMON, () => envelope(() => deps.api.summon(), 'E-WIN-011'));
}

/**
 * `window:summon` / `window:hide` 的 R→M 落点（SDS §4.2 表内通道）。
 *
 * 为什么单独一个函数：任务卡把 `registerTestChannels` 限定为「只注册 test:summon」，
 * 但 preload 暴露的 `ark.window.summon()/hide()` 必须有 handler 才能工作（A13 实跑）。
 * 见报告 CONTRACT_GAP G-01。
 */
export function registerWindowChannels(deps: { ipcMain: IpcMainLike; api: WindowApi }): void {
  deps.ipcMain.handle(CHANNEL_WINDOW_SUMMON, () => envelope(() => deps.api.summon(), 'E-WIN-011'));
  deps.ipcMain.handle(CHANNEL_WINDOW_HIDE, () => envelope(() => deps.api.hide(), 'E-WIN-012'));
}

/** `window:hidden-ack` 无返回包络（CL-219），用 on 语义。 */
export function registerHiddenAck(deps: { ipcMain: IpcMainEventLike; api: WindowApi }): void {
  deps.ipcMain.on(CHANNEL_HIDDEN_ACK, () => {
    deps.api.notifyRendererExit();
  });
}
