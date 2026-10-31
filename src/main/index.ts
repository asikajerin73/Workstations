/**
 * CL-201 启动序列（本任务：第 1-5 步 + M-02 窗口两态接入；热键/热区/主题广播属后续任务）。
 *   1. loadEnvFromDisk
 *   2. requestSingleInstanceLock
 *   3. resolveDataRoot
 *   4. ensureDir(dataRoot) → 失败 E-WIN-002
 *   5. app.whenReady()
 *   6. 创建窗口（CL-210 隐藏态构造，不 show）
 *   7. 注册 IPC（CL-104/CL-105）
 */
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWindowOptions } from '@shared/window-options';
import { resolveDataRoot } from './data-root';
import { registerHiddenAck, registerTestChannels, registerWindowChannels } from './ipc';
import { loadEnvFromDisk } from './load-env';
import { log } from './logger';
import { createWindowApi, type BrowserWindowLike, type WindowApi } from './window';

// package.json 是 "type": "module"，main 产物是 ESM —— 没有 __dirname，必须显式推导
const HERE = dirname(fileURLToPath(import.meta.url));

const MODULE = 'bootstrap';

let windowApi: WindowApi | null = null;

function fatal(code: string, message: string): void {
  log('error', MODULE, message, { code });
  dialog.showErrorBox('ARK 启动失败', `${message}\n(${code})`);
  app.quit();
}

/** CL-210：隐藏态构造；CL-216b：bounds = 光标所在屏（无光标时主屏）workArea。 */
function createMainWindow(opts: ReturnType<typeof buildWindowOptions>): BrowserWindowLike {
  // ★ webPreferences.preload 必须是绝对路径（A7 实测：相对路径会被静默拒绝）
  const win = new BrowserWindow(opts);

  // 外部链接一律交给系统浏览器，窗口内不做导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined && devUrl.length > 0) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(HERE, '../renderer/index.html'));
  }
  // 不再 once('ready-to-show') 自动 show：CL-210 规定构造即隐藏态，
  // 显示只能经 summon()（CL-211）。见报告 ASSUMPTION A-01。
  return win;
}

function bootstrap(): void {
  // 1. .env 必须在读 process.env 之前加载
  loadEnvFromDisk([join(process.cwd(), '.env'), join(app.getAppPath(), '.env')]);

  // 2. 单实例锁
  if (!app.requestSingleInstanceLock()) {
    log('warn', MODULE, '单实例锁获取失败，退出', { code: 'E-WIN-001' });
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    // 二次启动 = 用户要呼出，走完整 summon 序列
    void windowApi?.summon();
  });

  // 3. 数据根
  let dataRoot: string;
  try {
    dataRoot = resolveDataRoot(
      process.env,
      app.isPackaged,
      app.getAppPath(),
      process.execPath,
      app.getPath('userData'),
    );
  } catch (e) {
    fatal('E-WIN-002', e instanceof Error ? e.message : String(e));
    return;
  }

  // 4. 确保目录存在
  try {
    mkdirSync(dataRoot, { recursive: true });
  } catch (e) {
    fatal('E-WIN-002', `数据根创建失败: ${dataRoot} ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  log('info', MODULE, 'DATA_ROOT 就绪', { dataRoot });

  // 5. ready
  void app.whenReady().then(() => {
    const preloadAbs = join(HERE, '../preload/index.js');
    const api = createWindowApi(
      {
        createWindow: createMainWindow,
        getDisplayNearestPoint: (pt) => screen.getDisplayNearestPoint(pt),
        getPrimaryDisplay: () => screen.getPrimaryDisplay(),
        getCursorScreenPoint: () => screen.getCursorScreenPoint(),
        now: () => Date.now(),
        log: (level, msg, extra) => {
          log(level, MODULE, msg, extra);
        },
        // 插件宿主未就绪（T-008）：默认无 flush 目标
        listFlushTargets: () => [],
      },
      preloadAbs,
    );
    windowApi = api;

    // 7. IPC
    registerTestChannels({ ipcMain, api, isPackaged: app.isPackaged, env: process.env });
    registerWindowChannels({ ipcMain, api });
    registerHiddenAck({ ipcMain, api });

    void api.init().then(() => {
      log('info', MODULE, '窗口已创建（隐藏态）', { e2e: process.env['ARK_E2E'] === '1' });
    });
  });
}

app.on('window-all-closed', () => {
  // Windows 无 dock 概念：关窗即退出
  app.quit();
});

bootstrap();
