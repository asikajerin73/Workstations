/**
 * Shell 的 contextBridge（sandbox: true 下只能用 electron 的有限 API）。
 * 本任务只暴露 version；后续任务的通道另加。
 */
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('ark', {
  version: process.versions.electron,
});
