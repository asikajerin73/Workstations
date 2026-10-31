/**
 * CL-216 / CL-217：插件视图 bounds。
 * 纯函数，无副作用（CL-102）。
 *
 * CL-216 坐标系：computeWindowBounds 返回**屏幕绝对** DIP 坐标（给 win.setBounds）；
 * computePluginBounds 返回**相对窗口内容**的 DIP 坐标（给 view.setBounds），
 * **不含** display.x/y。两者不是同一个坐标系。
 */
import { computeWindowBounds, type DisplayLike, type Rectangle } from './window-options';

export { computeWindowBounds, OVERLAY_INSET } from './window-options';
export type { DisplayLike, Rectangle } from './window-options';

export interface ChromeMetrics {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * 插件 view 占满窗口内除 Shell chrome 之外的区域。
 * top = 顶栏高 + 安全区，bottom = Dock 高（CL-217 由 Shell 上报）。
 */
export function computePluginBounds(display: DisplayLike, chrome: ChromeMetrics): Rectangle {
  const w = computeWindowBounds(display);
  return {
    x: chrome.left,
    y: chrome.top,
    width: Math.max(0, w.width - chrome.left - chrome.right),
    height: Math.max(0, w.height - chrome.top - chrome.bottom),
  };
}

/** CL-217：shell 未上报前使用的默认空 chrome（插件 view 暂时铺满）。 */
export const DEFAULT_CHROME_METRICS: ChromeMetrics = { top: 0, bottom: 0, left: 0, right: 0 };
