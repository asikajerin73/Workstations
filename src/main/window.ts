/**
 * M-02 window：两态窗口（隐藏/呼出）的 summon / hide 固定序列。
 *
 * 契约：SDS CL-210 / CL-211 / CL-212 / CL-216b / CL-218 / CL-219。
 *
 * ★ 本模块**不在顶层 import { BrowserWindow } 后直接 new**：
 *   所有 Electron 能力经 `WindowDeps` 注入，单测无需启动 Electron（与 T-003 的
 *   createThemeEngine 同一思路）。类型层面只用 `import type`，编译后被擦除。
 */
import type { View } from 'electron';
import { DEFAULT_CHROME_METRICS, type ChromeMetrics } from '../shared/bounds';
import { ArkError } from '../shared/types';
import {
  buildWindowOptions,
  computeWindowBounds,
  type DisplayLike,
  type Rectangle,
  type WindowOptions,
} from '../shared/window-options';

/** CL-212：收起时最多等 renderer 退场的时间。 */
export const RENDERER_EXIT_TIMEOUT_MS = 150;

/** CL-215 / CL-219：单个插件 flush 的预算。 */
export const PLUGIN_FLUSH_TIMEOUT_MS = 1000;

/**
 * BrowserWindow 的最小结构化子集。
 *
 * `destroy?` 是 Electron BrowserWindow 既有方法，任务卡的接口块未列出；E-WIN-011
 * 的「销毁旧窗口」需要它，故作为可选成员补入（见报告 ASSUMPTION A-02）。
 */
export interface BrowserWindowLike {
  setBounds(b: Rectangle): void;
  setAlwaysOnTop(flag: boolean, level?: string): void;
  show(): void;
  hide(): void;
  focus(): void;
  isVisible(): boolean;
  isFocused(): boolean;
  isAlwaysOnTop(): boolean;
  isDestroyed(): boolean;
  setSkipTaskbar(flag: boolean): void;
  destroy?(): void;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
    isDestroyed(): boolean;
  };
  contentView: unknown;
  once(event: 'ready-to-show', cb: () => void): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  removeAllListeners(): void;
}

/** 插件宿主的 flush 目标；T-008 之前默认为空列表。 */
export interface FlushTarget {
  pluginId: string;
  flush(timeoutMs: number): Promise<void>;
}

export interface WindowDeps {
  createWindow(opts: WindowOptions): BrowserWindowLike;
  getDisplayNearestPoint(pt: { x: number; y: number }): DisplayLike | undefined;
  getPrimaryDisplay(): DisplayLike;
  getCursorScreenPoint(): { x: number; y: number };
  now(): number;
  log(level: 'warn' | 'error', msg: string, extra?: Record<string, unknown>): void;
  listFlushTargets(): readonly FlushTarget[];
}

/** CL-218 的接口块（本任务可交付部分 + 两处注入口，见 CONTRACT_GAP G-01/G-02）。 */
export interface WindowApi {
  init(): Promise<void>;
  summon(): Promise<void>;
  hide(): Promise<void>;
  getWindow(): BrowserWindowLike;
  getContentView(): View;
  isVisible(): boolean;
  isFlushing(): boolean;
  flushAllPlugins(opts?: { timeoutMs: number }): Promise<{ ok: string[]; timedOut: string[] }>;
  waitForRendererExit(ms: number): Promise<boolean>;
  /** `window:hidden-ack` 的注入点：renderer 确认退场（CL-219）。 */
  notifyRendererExit(): void;
  setChromeMetrics(m: ChromeMetrics): void;
  getChromeMetrics(): ChromeMetrics;
  recalcAll(): void;
}

const CHANNEL_SUMMONED = 'window:summoned';
const CHANNEL_HIDING = 'window:hiding';

/** 超过预算的 marker：Promise.race 用它区分「完成」与「超时」。 */
const TIMED_OUT = Symbol('ark.flush.timeout');

function delayMs(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms) as unknown as { unref?: () => void };
    timer.unref?.();
  });
}

function isChromeMetrics(m: ChromeMetrics): boolean {
  return (
    Number.isFinite(m.top) &&
    Number.isFinite(m.bottom) &&
    Number.isFinite(m.left) &&
    Number.isFinite(m.right) &&
    m.top >= 0 &&
    m.bottom >= 0 &&
    m.left >= 0 &&
    m.right >= 0
  );
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function createWindowApi(deps: WindowDeps, preloadAbsPath: string): WindowApi {
  let win: BrowserWindowLike | null = null;
  let flushing = false;
  let chromeMetrics: ChromeMetrics = { ...DEFAULT_CHROME_METRICS };
  /** 当前 waitForRendererExit 的 resolver；同一时刻只允许一个等待者。 */
  let exitWaiter: ((value: boolean) => void) | null = null;

  function ensureWindow(): BrowserWindowLike {
    if (win !== null && !win.isDestroyed()) {
      return win;
    }
    const created = deps.createWindow(buildWindowOptions(preloadAbsPath));
    // CL-210：隐藏态 skipTaskbar=true（AC-M02-02 的 spy 断言点）
    created.setSkipTaskbar(true);
    win = created;
    return created;
  }

  /** E-WIN-010：光标所在屏取不到就回退主显示器。 */
  function resolveDisplay(): DisplayLike {
    const point = deps.getCursorScreenPoint();
    const nearest = deps.getDisplayNearestPoint(point);
    if (nearest !== undefined) {
      return nearest;
    }
    deps.log('warn', 'display lookup returned undefined, falling back to primary display', {
      code: 'E-WIN-010',
      point,
    });
    return deps.getPrimaryDisplay();
  }

  /** E-WIN-011 的重建步骤：摘掉旧句柄 → 销毁 → 新建。 */
  function rebuildWindow(old: BrowserWindowLike): BrowserWindowLike {
    old.removeAllListeners();
    if (old.destroy !== undefined) {
      try {
        old.destroy();
      } catch (e) {
        // 旧窗口已不可销毁不影响重建；必须留痕，不能静默
        deps.log('error', 'destroy of stale window failed during E-WIN-011 rebuild', {
          code: 'E-WIN-011',
          message: describe(e),
        });
      }
    }
    if (win === old) {
      win = null;
    }
    return ensureWindow();
  }

  async function summon(): Promise<void> {
    let target = ensureWindow();
    const display = resolveDisplay();

    // CL-211 序列 1、2
    target.setBounds(computeWindowBounds(display));
    target.setAlwaysOnTop(true, 'screen-saver');
    // CL-211 序列 3 ★ 必须在 show() 之前取，renderer 才能算 t1-t0
    const t0 = deps.now();

    try {
      // CL-211 序列 4
      target.show();
    } catch (e) {
      // E-WIN-011：show 抛错 → 销毁旧窗口、重建、重试一次
      deps.log('error', 'show() threw, rebuilding window and retrying once', {
        code: 'E-WIN-011',
        message: describe(e),
      });
      target = rebuildWindow(target);
      target.setBounds(computeWindowBounds(display));
      target.setAlwaysOnTop(true, 'screen-saver');
      // 第二次失败直接抛出（不吞异常），错误码取自 §4.1
      try {
        target.show();
      } catch (retryError) {
        throw new ArkError('E-WIN-011', `show() failed again after rebuild: ${describe(retryError)}`, {
          firstAttempt: describe(e),
          retry: describe(retryError),
        });
      }
    }

    // CL-211 序列 5、6
    target.focus();
    target.webContents.send(CHANNEL_SUMMONED, { t0 });
  }

  async function flushAllPlugins(
    opts?: { timeoutMs: number },
  ): Promise<{ ok: string[]; timedOut: string[] }> {
    const timeoutMs = opts?.timeoutMs ?? PLUGIN_FLUSH_TIMEOUT_MS;
    const targets = deps.listFlushTargets();
    const done: string[] = [];
    const timedOut: string[] = [];

    // CL-215：并发 + 每插件独立超时，任一失败不影响其他
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const raced = await Promise.race<unknown>([
          target.flush(timeoutMs),
          delayMs(timeoutMs).then(() => TIMED_OUT),
        ]);
        return raced;
      }),
    );

    for (let i = 0; i < results.length; i += 1) {
      const target = targets[i];
      const result = results[i];
      if (target === undefined || result === undefined) {
        continue;
      }
      if (result.status === 'fulfilled' && result.value !== TIMED_OUT) {
        done.push(target.pluginId);
        continue;
      }
      // 超时与抛错都不算「已刷盘」，统一进 timedOut 桶并留痕（E-WIN-012）
      timedOut.push(target.pluginId);
      deps.log('warn', 'plugin flush did not complete', {
        code: 'E-WIN-012',
        pluginId: target.pluginId,
        ...(result.status === 'rejected' ? { message: describe(result.reason) } : {}),
      });
    }

    return { ok: done, timedOut };
  }

  function waitForRendererExit(ms: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (value: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (exitWaiter === finish) {
          exitWaiter = null;
        }
        resolve(value);
      };

      exitWaiter = finish;
      // 只做超时兜底：真正的完成信号来自 renderer 的 window:hidden-ack
      timer = setTimeout(() => finish(false), ms);
    });
  }

  function notifyRendererExit(): void {
    const waiter = exitWaiter;
    exitWaiter = null;
    if (waiter !== null) {
      waiter(true);
    }
  }

  async function hide(): Promise<void> {
    const target = ensureWindow();

    // CL-212 序列 1：先刷盘，try/finally 保证 isFlushing 复位（A7）
    flushing = true;
    try {
      try {
        const flushed = await flushAllPlugins({ timeoutMs: PLUGIN_FLUSH_TIMEOUT_MS });
        if (flushed.timedOut.length > 0) {
          deps.log('warn', 'some plugins were not flushed before hiding', {
            code: 'E-WIN-012',
            timedOut: flushed.timedOut,
            ok: flushed.ok,
          });
        }
      } catch (e) {
        // E-WIN-012：flush 出问题也继续收起，用户不该被卡住
        deps.log('error', 'flush phase failed, continuing to hide', {
          code: 'E-WIN-012',
          message: describe(e),
        });
      }

      // CL-212 序列 2、3
      if (!target.webContents.isDestroyed()) {
        target.webContents.send(CHANNEL_HIDING);
      }
      await waitForRendererExit(RENDERER_EXIT_TIMEOUT_MS);

      // CL-212 序列 4、5
      target.setAlwaysOnTop(false);
      target.hide();
    } finally {
      flushing = false;
    }
  }

  const api: WindowApi = {
    init: async (): Promise<void> => {
      ensureWindow();
    },
    summon,
    hide,
    getWindow: () => ensureWindow(),
    getContentView: (): View => ensureWindow().contentView as View,
    isVisible: (): boolean => {
      if (win === null || win.isDestroyed()) {
        return false;
      }
      return win.isVisible();
    },
    isFlushing: () => flushing,
    flushAllPlugins,
    waitForRendererExit,
    notifyRendererExit,
    // CL-217：只缓存；真正的重算依赖插件 view（T-008）→ 见 ASSUMPTION A-03
    setChromeMetrics: (m: ChromeMetrics): void => {
      if (!isChromeMetrics(m)) {
        deps.log('warn', 'ignored invalid chrome metrics from renderer', { chromeMetrics: m });
        return;
      }
      chromeMetrics = { top: m.top, bottom: m.bottom, left: m.left, right: m.right };
      api.recalcAll();
    },
    getChromeMetrics: () => ({ ...chromeMetrics }),
    // CL-251：没有插件 view 时是空操作 → 见 ASSUMPTION A-04
    recalcAll: (): void => {
      // T-008 接入插件 view 后在此重算 computePluginBounds
    },
  };

  return api;
}

