import { describe, expect, it } from 'vitest';
import { buildWindowOptions, computeWindowBounds, OVERLAY_INSET } from '../../src/shared/window-options';
import { computePluginBounds } from '../../src/shared/bounds';

const display = {
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};

const PRELOAD = 'C:\\fake\\workstation\\out\\preload\\index.js';

describe('buildWindowOptions —— AC-M02-01 / CL-210', () => {
  it('隐藏态九字段 deep equal（含安全基线 webPreferences）', () => {
    expect(buildWindowOptions(PRELOAD)).toEqual({
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
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
        webviewTag: false,
        devTools: true,
      },
    });
  });

  it('注入的 preload 绝对路径必须原样出现在 webPreferences.preload', () => {
    expect(buildWindowOptions(PRELOAD).webPreferences.preload).toBe(PRELOAD);
  });

  it('CL-005 安全基线三项必须成立', () => {
    const wp = buildWindowOptions(PRELOAD).webPreferences;
    expect(wp.contextIsolation).toBe(true);
    expect(wp.nodeIntegration).toBe(false);
    expect(wp.sandbox).toBe(true);
  });
});

describe('computeWindowBounds —— CL-216b', () => {
  it('OVERLAY_INSET 必须为 0', () => {
    expect(OVERLAY_INSET).toBe(0);
  });

  it('bounds 严格等于 workArea 四字段（不内缩不居中）', () => {
    expect(computeWindowBounds(display)).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
  });

  it('副屏 workArea 带偏移时原样透传，不做 DPI 换算', () => {
    expect(computeWindowBounds({ workArea: { x: -1920, y: 120, width: 1920, height: 1040 } })).toEqual({
      x: -1920,
      y: 120,
      width: 1920,
      height: 1040,
    });
  });
});

describe('computePluginBounds —— CL-216 / CL-217', () => {
  it('返回相对窗口内容坐标（不含 display.x/y）', () => {
    const b = computePluginBounds(display, { top: 48, bottom: 72, left: 0, right: 0 });
    expect(b).toEqual({ x: 0, y: 48, width: 1920, height: 1040 - 48 - 72 });
  });

  it('chrome 超过窗口尺寸时宽高钳到 0，不出现负数', () => {
    const b = computePluginBounds(display, { top: 2000, bottom: 2000, left: 0, right: 0 });
    expect(b.width).toBe(1920);
    expect(b.height).toBe(0);
  });
});
