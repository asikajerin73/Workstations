/**
 * CL-201 启动序列（本任务只实现第 1-5 步 + 建窗口；第 6/8/9/10 步属后续任务）。
 *   1. loadEnvFromDisk
 *   2. requestSingleInstanceLock
 *   3. resolveDataRoot
 *   4. ensureDir(dataRoot) → 失败 E-WIN-002
 *   5. app.whenReady()
 *   7. 创建窗口
 */
import { app, BrowserWindow, dialog, screen, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWindowOptions, computeWindowBounds } from '@shared/window-options';
import { resolveDataRoot } from './data-root';
import { loadEnvFromDisk } from './load-env';
import { log } from './logger';

// package.json 是 "type": "module"，main 产物是 ESM —— 没有 __dirname，必须显式推导
const HERE = dirname(fileURLToPath(import.meta.url));

const MODULE = 'bootstrap';

let mainWindow: BrowserWindow | null = null;

function fatal(code: string, message: string): void {
  log('error', MODULE, message, { code });
  dialog.showErrorBox('ARK 启动失败', `${message}\n(${code})`);
  app.quit();
}

function createWindow(): BrowserWindow {
  // ★ webPreferences.preload 必须是绝对路径（A7 实测：相对路径会被静默拒绝）
  const preloadAbs = join(HERE, '../preload/index.js');
  const win = new BrowserWindow(buildWindowOptions(preloadAbs));
  win.setBounds(computeWindowBounds(screen.getPrimaryDisplay()));

  win.once('ready-to-show', () => {
    win.show();
  });

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
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
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
    mainWindow = createWindow();
    log('info', MODULE, '窗口已创建');
  });
}

app.on('window-all-closed', () => {
  // Windows 无 dock 概念：关窗即退出
  app.quit();
});

bootstrap();
