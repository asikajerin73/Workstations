import { describe, expect, it } from 'vitest';
import type { DisplayLike, Rectangle, WindowOptions } from '../../src/shared/window-options';
import {
  CHANNEL_HIDDEN_ACK,
  CHANNEL_TEST_SUMMON,
  CHANNEL_WINDOW_HIDE,
  CHANNEL_WINDOW_SUMMON,
  registerHiddenAck,
  registerTestChannels,
  registerWindowChannels,
  shouldRegisterTestChannels,
  type IpcMainEventLike,
  type IpcMainLike,
} from '../../src/main/ipc';
import {
  createWindowApi,
  PLUGIN_FLUSH_TIMEOUT_MS,
  RENDERER_EXIT_TIMEOUT_MS,
  type BrowserWindowLike,
  type FlushTarget,
  type WindowApi,
  type WindowDeps,
} from '../../src/main/window';
import type { ChromeMetrics } from '../../src/shared/bounds';
import { ArkError } from '../../src/shared/types';

/** 有序调用记录。A5/A6 与该数组做严格序列比较，顺序错必然红。 */
type Call = string;

interface FakeWindow extends BrowserWindowLike {
  readonly calls: Call[];
}

const PRIMARY: DisplayLike = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
const SECONDARY: DisplayLike = { workArea: { x: 1920, y: 0, width: 2560, height: 1440 } };

interface WindowBehavior {
  /** 共享预算：全局第 N 次 show 抛错（跨重建共享，用于 E-WIN-011 只重试一次） */
  showBudget: { left: number };
  sendThrowsOn?: string;
  onSend?: (channel: string) => void;
}

function makeWindow(calls: Call[], behavior: WindowBehavior): FakeWindow {
  const state = { visible: false, focused: false, alwaysOnTop: false, destroyed: false };

  const win: FakeWindow = {
    calls,
    setBounds: (b: Rectangle): void => {
      calls.push(`setBounds:${String(b.x)},${String(b.y)},${String(b.width)},${String(b.height)}`);
    },
    setAlwaysOnTop: (flag: boolean, level?: string): void => {
      calls.push(
        level === undefined
          ? `setAlwaysOnTop:${String(flag)}`
          : `setAlwaysOnTop:${String(flag)},${level}`,
      );
      state.alwaysOnTop = flag;
    },
    show: (): void => {
      calls.push('show');
      if (behavior.showBudget.left > 0) {
        behavior.showBudget.left -= 1;
        throw new Error('show boom');
      }
      state.visible = true;
    },
    hide: (): void => {
      calls.push('hide');
      state.visible = false;
    },
    focus: (): void => {
      calls.push('focus');
      state.focused = true;
    },
    isVisible: (): boolean => state.visible,
    isFocused: (): boolean => state.focused,
    isAlwaysOnTop: (): boolean => state.alwaysOnTop,
    isDestroyed: (): boolean => state.destroyed,
    setSkipTaskbar: (flag: boolean): void => {
      calls.push(`setSkipTaskbar:${String(flag)}`);
    },
    destroy: (): void => {
      calls.push('destroy');
      state.destroyed = true;
      state.visible = false;
    },
    webContents: {
      send: (channel: string, ...args: unknown[]): void => {
        if (behavior.sendThrowsOn === channel) {
          throw new Error(`send ${channel} boom`);
        }
        calls.push(
          args.length === 0 ? `send:${channel}` : `send:${channel}:${JSON.stringify(args[0])}`,
        );
        behavior.onSend?.(channel);
      },
      isDestroyed: (): boolean => state.destroyed,
    },
    contentView: { kind: 'fake-view' },
    once: (): void => undefined,
    on: (): void => undefined,
    removeAllListeners: (): void => {
      calls.push('removeAllListeners');
    },
  };
  return win;
}

interface Harness {
  api: WindowApi;
  calls: Call[];
  windows: FakeWindow[];
  logs: { level: string; msg: string; extra?: Record<string, unknown> }[];
  setDisplay: (d: DisplayLike | undefined) => void;
  setOnSend: (fn: ((channel: string) => void) | undefined) => void;
}

function makeHarness(opts?: {
  display?: DisplayLike | undefined;
  flushTargets?: readonly FlushTarget[];
  showThrowsTimes?: number;
  nowValue?: number;
  sendThrowsOn?: string;
}): Harness {
  const calls: Call[] = [];
  const windows: FakeWindow[] = [];
  const logs: { level: string; msg: string; extra?: Record<string, unknown> }[] = [];
  let display: DisplayLike | undefined =
    opts !== undefined && 'display' in opts ? opts.display : SECONDARY;
  let onSend: ((channel: string) => void) | undefined;
  const behavior: WindowBehavior = { showBudget: { left: opts?.showThrowsTimes ?? 0 } };
  if (opts?.sendThrowsOn !== undefined) {
    behavior.sendThrowsOn = opts.sendThrowsOn;
  }

  const deps: WindowDeps = {
    createWindow: (o: WindowOptions): BrowserWindowLike => {
      calls.push(`createWindow:${o.webPreferences.preload}`);
      const win = makeWindow(calls, behavior);
      windows.push(win);
      return win;
    },
    getDisplayNearestPoint: (): DisplayLike | undefined => display,
    getPrimaryDisplay: (): DisplayLike => PRIMARY,
    getCursorScreenPoint: (): { x: number; y: number } => ({ x: 2500, y: 300 }),
    now: (): number => {
      calls.push('now');
      return opts?.nowValue ?? 1000;
    },
    log: (level, msg, extra): void => {
      logs.push(extra === undefined ? { level, msg } : { level, msg, extra });
    },
    listFlushTargets: (): readonly FlushTarget[] => opts?.flushTargets ?? [],
  };

  const api = createWindowApi(deps, 'C:\\fake\\preload.js');
  return {
    api,
    calls,
    windows,
    logs,
    setDisplay: (d): void => {
      display = d;
    },
    setOnSend: (fn): void => {
      onSend = fn;
      behavior.onSend = fn === undefined ? undefined : (c): void => fn(c);
    },
  };
}

function deferredVoid(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
  let resolveFn: () => void = () => undefined;
  let rejectFn: (e: Error) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

// ───────────────────────── A5 summon ─────────────────────────

describe('A5 summon 序列（CL-211）', () => {
  it('调用顺序严格等于 setBounds → setAlwaysOnTop(true,screen-saver) → now → show → focus → send', async () => {
    const h = makeHarness({ display: SECONDARY });
    await h.api.init();
    h.calls.length = 0;

    await h.api.summon();

    expect(h.calls).toEqual([
      'setBounds:1920,0,2560,1440',
      'setAlwaysOnTop:true,screen-saver',
      'now',
      'show',
      'focus',
      'send:window:summoned:{"t0":1000}',
    ]);
  });

  it('t0 在 show() 之前取值（有序数组下标）', async () => {
    const h = makeHarness({ nowValue: 4242 });
    await h.api.init();
    h.calls.length = 0;

    await h.api.summon();

    const nowIndex = h.calls.indexOf('now');
    const showIndex = h.calls.indexOf('show');
    expect(nowIndex).toBeGreaterThan(-1);
    expect(showIndex).toBeGreaterThan(-1);
    expect(nowIndex).toBeLessThan(showIndex);
    expect(h.calls[h.calls.length - 1]).toBe('send:window:summoned:{"t0":4242}');
  });

  it('每次 summon 重新按当前光标屏计算 bounds（换屏后取新 workArea）', async () => {
    const h = makeHarness({ display: SECONDARY });
    await h.api.init();
    h.calls.length = 0;

    await h.api.summon();
    h.setDisplay(PRIMARY);
    await h.api.summon();

    expect(h.calls.filter((c) => c.startsWith('setBounds:'))).toEqual([
      'setBounds:1920,0,2560,1440',
      'setBounds:0,0,1920,1080',
    ]);
  });
});

// ───────────────────────── A6 hide ─────────────────────────

describe('A6 hide 序列（CL-212）', () => {
  it('调用顺序严格等于 flush → send(window:hiding) → 等 ack → setAlwaysOnTop(false) → hide', async () => {
    const flushTarget: FlushTarget = {
      pluginId: 'notes',
      flush: async (): Promise<void> => {
        h.calls.push('flush:notes');
      },
    };
    const h = makeHarness({ flushTargets: [flushTarget] });
    await h.api.init();
    await h.api.summon();
    h.calls.length = 0;
    // renderer 收到 window:hiding 后立刻回 ack —— 作为「等待段」的有序标记
    // renderer 的 ack 经 IPC 异步到达，因此在下一个宏任务里回
    h.setOnSend((channel): void => {
      if (channel === 'window:hiding') {
        setTimeout(() => {
          h.calls.push('hiddenAck');
          h.api.notifyRendererExit();
        }, 0);
      }
    });

    await h.api.hide();

    expect(h.calls).toEqual([
      'flush:notes',
      'send:window:hiding',
      'hiddenAck',
      'setAlwaysOnTop:false',
      'hide',
    ]);
  });

  it('无 ack 时走 150ms 超时，仍在 send 之后才 setAlwaysOnTop(false)/hide', async () => {
    const h = makeHarness();
    await h.api.init();
    await h.api.summon();
    h.calls.length = 0;

    const started = Date.now();
    await h.api.hide();
    const elapsed = Date.now() - started;

    expect(h.calls).toEqual(['send:window:hiding', 'setAlwaysOnTop:false', 'hide']);
    expect(elapsed).toBeGreaterThanOrEqual(RENDERER_EXIT_TIMEOUT_MS - 60);
    expect(elapsed).toBeLessThan(1000);
  });
});

// ───────────────────────── A7 isFlushing ─────────────────────────

describe('A7 isFlushing 复位（try/finally）', () => {
  it('hide 期间为 true，flush 抛错后仍复位为 false', async () => {
    const gate = deferredVoid();
    const flushTarget: FlushTarget = {
      pluginId: 'boom',
      flush: async (): Promise<void> => {
        await gate.promise;
        throw new Error('flush exploded');
      },
    };
    const h = makeHarness({ flushTargets: [flushTarget] });
    await h.api.init();
    await h.api.summon();

    expect(h.api.isFlushing()).toBe(false);
    const running = h.api.hide();
    await Promise.resolve();
    expect(h.api.isFlushing()).toBe(true);

    gate.reject(new Error('flush exploded'));
    await running;

    expect(h.api.isFlushing()).toBe(false);
    // E-WIN-012：flush 出问题也继续收起
    expect(h.calls).toContain('send:window:hiding');
    expect(h.calls).toContain('hide');
    expect(h.logs.some((l) => l.level === 'warn' || l.level === 'error')).toBe(true);
  });

  it('send(window:hiding) 抛错时 isFlushing 也复位为 false（异常不被吞掉）', async () => {
    const h = makeHarness({ sendThrowsOn: 'window:hiding' });
    await h.api.init();
    await h.api.summon();

    await expect(h.api.hide()).rejects.toThrow('send window:hiding boom');
    expect(h.api.isFlushing()).toBe(false);
  });
});

// ───────────────────────── A8 waitForRendererExit ─────────────────────────

describe('A8 waitForRendererExit 是 ack 驱动，不是固定 sleep', () => {
  it('收到 ack 时 resolve(true)，且远早于超时值返回', async () => {
    const h = makeHarness();
    await h.api.init();

    const started = Date.now();
    const waiting = h.api.waitForRendererExit(5000);
    setTimeout(() => {
      h.api.notifyRendererExit();
    }, 10);

    await expect(waiting).resolves.toBe(true);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(1000);
  });

  it('无 ack 时超时 resolve(false)，耗时约等于 ms 且 < 1000ms', async () => {
    const h = makeHarness();
    await h.api.init();

    const started = Date.now();
    const result = await h.api.waitForRendererExit(120);
    const elapsed = Date.now() - started;

    expect(result).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(1000);
  });
});

// ───────────────────────── A9 E-WIN-010 ─────────────────────────

describe('A9 E-WIN-010 回退主显示器', () => {
  it('getDisplayNearestPoint 返回 undefined 时用 getPrimaryDisplay 的 workArea，四字段严格相等', async () => {
    const h = makeHarness({ display: undefined });
    await h.api.init();
    h.calls.length = 0;

    await h.api.summon();

    const boundsCall = h.calls.find((c) => c.startsWith('setBounds:'));
    expect(boundsCall).toBe(`setBounds:${String(PRIMARY.workArea.x)},${String(PRIMARY.workArea.y)},${String(PRIMARY.workArea.width)},${String(PRIMARY.workArea.height)}`);
    expect(boundsCall).toBe('setBounds:0,0,1920,1080');
    // 回退必须留痕（结构化 log，含 E-WIN-010）
    expect(h.logs.some((l) => l.extra?.['code'] === 'E-WIN-010')).toBe(true);
  });
});

// ───────────────────────── A10 E-WIN-011 ─────────────────────────

describe('A10 E-WIN-011 show 抛错后重建重试一次', () => {
  it('第一次 show 抛错 → 销毁旧窗口、重建、重试成功', async () => {
    const h = makeHarness({ showThrowsTimes: 1 });
    await h.api.init();
    h.calls.length = 0;

    await h.api.summon();

    expect(h.windows).toHaveLength(2);
    expect(h.calls).toContain('destroy');
    expect(h.calls.filter((c) => c === 'show')).toHaveLength(2);
    expect(h.calls).toContain('send:window:summoned:{"t0":1000}');
    expect(h.api.isVisible()).toBe(true);
    expect(h.api.getWindow().isAlwaysOnTop()).toBe(true);
    expect(h.api.getWindow()).toBe(h.windows[1]);
    // destroy 必须在第二次 createWindow 之前
    expect(h.calls.indexOf('destroy')).toBeLessThan(
      h.calls.indexOf('createWindow:C:\\fake\\preload.js'),
    );
  });

  it('连续两次 show 抛错 → 最终抛出 ArkError(E-WIN-011)，不吞异常', async () => {
    const h = makeHarness({ showThrowsTimes: 2 });
    await h.api.init();

    let thrown: unknown;
    try {
      await h.api.summon();
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ArkError);
    expect((thrown as ArkError).code).toBe('E-WIN-011');
    expect(h.calls.filter((c) => c === 'show')).toHaveLength(2);
    // 第二次失败后不得继续走 focus / send —— 异常必须真的中断序列
    expect(h.calls).not.toContain('focus');
    expect(h.calls).not.toContain('send:window:summoned:{"t0":1000}');
  });
});

// ───────────────────────── A11 flushAllPlugins ─────────────────────────

describe('A11 flushAllPlugins 返回值语义（CL-215/CL-219）', () => {
  it('无插件时返回 {ok:[],timedOut:[]}', async () => {
    const h = makeHarness();
    expect(await h.api.flushAllPlugins({ timeoutMs: 50 })).toEqual({ ok: [], timedOut: [] });
  });

  it('2 个目标、其一超时 → ok 含 1 项、timedOut 含 1 项', async () => {
    const never = deferredVoid();
    const h = makeHarness({
      flushTargets: [
        { pluginId: 'fast', flush: async (): Promise<void> => undefined },
        {
          pluginId: 'slow',
          flush: async (): Promise<void> => {
            await never.promise;
          },
        },
      ],
    });

    const result = await h.api.flushAllPlugins({ timeoutMs: 60 });
    never.resolve();

    expect(result.ok).toEqual(['fast']);
    expect(result.timedOut).toEqual(['slow']);
    expect(h.logs.some((l) => l.extra?.['code'] === 'E-WIN-012')).toBe(true);
  });

  it('抛出异常的目标不影响其他目标（allSettled）', async () => {
    const h = makeHarness({
      flushTargets: [
        { pluginId: 'ok1', flush: async (): Promise<void> => undefined },
        {
          pluginId: 'bad',
          flush: async (): Promise<void> => {
            throw new Error('plugin down');
          },
        },
        { pluginId: 'ok2', flush: async (): Promise<void> => undefined },
      ],
    });

    const result = await h.api.flushAllPlugins({ timeoutMs: 60 });
    expect(result.ok).toEqual(['ok1', 'ok2']);
    expect(result.timedOut).toEqual(['bad']);
  });

  it('默认超时为 CL-219 的 1000ms', () => {
    expect(PLUGIN_FLUSH_TIMEOUT_MS).toBe(1000);
    expect(RENDERER_EXIT_TIMEOUT_MS).toBe(150);
  });
});

// ───────────────────────── A12 test:summon 通道守卫 ─────────────────────────

interface FakeIpc extends IpcMainLike, IpcMainEventLike {
  handlers: Map<string, (...a: unknown[]) => unknown>;
  listeners: Map<string, (...a: unknown[]) => void>;
}

function makeIpc(): FakeIpc {
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  const listeners = new Map<string, (...a: unknown[]) => void>();
  return {
    handlers,
    listeners,
    handle: (channel, fn): void => {
      handlers.set(channel, fn);
    },
    removeHandler: (channel): void => {
      handlers.delete(channel);
    },
    on: (channel, fn): void => {
      listeners.set(channel, fn);
    },
    removeAllListeners: (channel): void => {
      listeners.delete(channel);
    },
  };
}

describe('A12 CL-105 test:summon 注册守卫', () => {
  it('仅 ARK_E2E=1 且 isPackaged=false 时注册，其余三种组合都不注册', () => {
    const cases: { isPackaged: boolean; env: NodeJS.ProcessEnv; expected: boolean }[] = [
      { isPackaged: false, env: { ARK_E2E: '1' }, expected: true },
      { isPackaged: false, env: {}, expected: false },
      { isPackaged: true, env: { ARK_E2E: '1' }, expected: false },
      { isPackaged: true, env: {}, expected: false },
      { isPackaged: false, env: { ARK_E2E: '0' }, expected: false },
    ];

    for (const c of cases) {
      expect(shouldRegisterTestChannels(c.isPackaged, c.env)).toBe(c.expected);
      const ipc = makeIpc();
      registerTestChannels({
        ipcMain: ipc,
        api: makeHarness().api,
        isPackaged: c.isPackaged,
        env: c.env,
      });
      expect([...ipc.handlers.keys()]).toEqual(c.expected ? [CHANNEL_TEST_SUMMON] : []);
    }
  });

  it('注册后 test:summon 触发 api.summon()', async () => {
    const h = makeHarness();
    await h.api.init();
    h.calls.length = 0;
    const ipc = makeIpc();
    registerTestChannels({ ipcMain: ipc, api: h.api, isPackaged: false, env: { ARK_E2E: '1' } });

    const handler = ipc.handlers.get(CHANNEL_TEST_SUMMON);
    expect(handler).toBeTypeOf('function');
    await handler?.();

    expect(h.calls).toContain('show');
    expect(h.calls).toContain('send:window:summoned:{"t0":1000}');
  });

  it('window:hidden-ack 监听器把 ack 转给 api.notifyRendererExit()', () => {
    const h = makeHarness();
    const ipc = makeIpc();
    registerHiddenAck({ ipcMain: ipc, api: h.api });

    const listener = ipc.listeners.get(CHANNEL_HIDDEN_ACK);
    expect(listener).toBeTypeOf('function');

    const waiting = h.api.waitForRendererExit(5000);
    listener?.();
    return expect(waiting).resolves.toBe(true);
  });

  it('window:summon / window:hide 通道分别驱动 summon/hide', async () => {
    const h = makeHarness();
    await h.api.init();
    const ipc = makeIpc();
    registerWindowChannels({ ipcMain: ipc, api: h.api });

    expect([...ipc.handlers.keys()]).toEqual([CHANNEL_WINDOW_SUMMON, CHANNEL_WINDOW_HIDE]);
    h.calls.length = 0;
    await ipc.handlers.get(CHANNEL_WINDOW_SUMMON)?.();
    expect(h.calls).toContain('show');

    h.calls.length = 0;
    await ipc.handlers.get(CHANNEL_WINDOW_HIDE)?.();
    expect(h.calls).toEqual(['send:window:hiding', 'setAlwaysOnTop:false', 'hide']);
  });
});

// ───────────────────────── 其余：getContentView / chromeMetrics ─────────────────────────

describe('CL-218 其余成员', () => {
  it('getContentView 返回窗口的 contentView（同一引用，无 any 转换）', async () => {
    const h = makeHarness();
    await h.api.init();
    const win = h.api.getWindow();
    expect(h.api.getContentView()).toBe(win.contentView);
  });

  it('init 创建窗口但不 show（CL-210 隐藏态）', async () => {
    const h = makeHarness();
    await h.api.init();

    expect(h.calls).toEqual(['createWindow:C:\\fake\\preload.js', 'setSkipTaskbar:true']);
    expect(h.api.isVisible()).toBe(false);
  });

  it('setChromeMetrics 缓存值并可读回；recalcAll 无插件时为空操作', async () => {
    const h = makeHarness();
    await h.api.init();
    const metrics: ChromeMetrics = { top: 48, bottom: 72, left: 0, right: 0 };

    h.api.setChromeMetrics(metrics);
    expect(h.api.getChromeMetrics()).toEqual(metrics);
    expect(() => {
      h.api.recalcAll();
    }).not.toThrow();
  });

  it('setChromeMetrics 拒绝非法数值（不写入缓存）', async () => {
    const h = makeHarness();
    await h.api.init();
    h.api.setChromeMetrics({ top: 48, bottom: 72, left: 0, right: 0 });

    h.api.setChromeMetrics({ top: Number.NaN, bottom: 0, left: 0, right: 0 });
    expect(h.api.getChromeMetrics()).toEqual({ top: 48, bottom: 72, left: 0, right: 0 });
    expect(h.logs.some((l) => l.level === 'warn')).toBe(true);
  });
});
