/**
 * CL-210 / CL-216 / CL-216b：窗口构造参数与窗口 bounds（纯函数，可单测）。
 *
 * 为什么不用 BrowserWindowConstructorOptions：
 * vitest 在非 Electron 环境下没有 electron 类型可依赖，且 PLAN G-2(a) 明确要求
 * "把参数生成抽成纯函数，断言函数返回值的 deep equal"。
 * 这里声明结构化子集类型，主进程 `new BrowserWindow(buildWindowOptions())` 直接可用。
 */

/**
 * 覆盖层内缩量。**必须是 0**（CL-216b：覆盖层 = workArea 全屏，不内缩）。
 * AC-M02-06 断言 bounds 严格等于 display.workArea。
 */
export const OVERLAY_INSET = 0;

/** 只声明用到的字段，避免依赖 Electron 运行时的类型包。 */
export interface DisplayLike {
  workArea: { x: number; y: number; width: number; height: number };
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 窗口覆盖层 = 光标所在屏的 workArea 全屏（CL-216b）。
 * 返回屏幕绝对 DIP 坐标，可直接给 win.setBounds。
 * 不做 DPI 换算（screen API 已是 DIP）；用 Math.round 而非 Math.floor。
 */
export function computeWindowBounds(display: DisplayLike): Rectangle {
  const wa = display.workArea;
  return {
    x: Math.round(wa.x + OVERLAY_INSET),
    y: Math.round(wa.y + OVERLAY_INSET),
    width: Math.round(wa.width - OVERLAY_INSET * 2),
    height: Math.round(wa.height - OVERLAY_INSET * 2),
  };
}

export interface WebPreferences {
  preload: string;
  contextIsolation: boolean;
  nodeIntegration: boolean;
  sandbox: boolean;
  webSecurity: boolean;
  spellcheck: boolean;
  webviewTag: boolean;
  devTools: boolean;
}

export interface WindowOptions {
  show: boolean;
  frame: boolean;
  transparent: boolean;
  skipTaskbar: boolean;
  alwaysOnTop: boolean;
  focusable: boolean;
  resizable: boolean;
  hasShadow: boolean;
  backgroundColor: string;
  webPreferences: WebPreferences;
}

/**
 * 隐藏态构造参数（CL-210 参数表左列）。
 * 安全基线 CL-005：contextIsolation:true、nodeIntegration:false、sandbox:true。
 *
 * ★ A7 实测：Electron 的 webPreferences.preload **必须是绝对路径**，相对路径会被
 *   `web_contents_preferences.cc` 直接拒绝且 preload 静默不加载（renderer 里 window.ark 恒为
 *   undefined）。本模块是纯函数（CL-102，不能碰 __dirname/process），故绝对路径由调用方注入。
 */
export function buildWindowOptions(preloadAbsPath: string): WindowOptions {
  return {
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: false,
    focusable: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadAbsPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      webviewTag: false,
      devTools: true,
    },
  };
}
