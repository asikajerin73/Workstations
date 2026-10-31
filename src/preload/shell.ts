/**
 * Shell 的 contextBridge（sandbox: true 下只能用 electron 的有限 API）。
 *
 * CL-218 / CL-219：`ark.window.summon/hide` 走 invoke；`window:summoned` /
 * `window:hiding` 是主进程 → renderer 的单向下发；`ackHidden()` 回 `window:hidden-ack`。
 */
import { contextBridge, ipcRenderer } from 'electron';

export interface SummonedPayload {
  t0: number;
}

export interface ArkWindowBridge {
  summon(): Promise<void>;
  hide(): Promise<void>;
}

export interface ArkBridge {
  version: string;
  window: ArkWindowBridge;
  onSummoned(cb: (p: SummonedPayload) => void): () => void;
  onHiding(cb: () => void): () => void;
  ackHidden(): void;
}

/** 主进程下发值的运行时校验：外部输入不信任（AGENTS §5）。 */
function toSummonedPayload(raw: unknown): SummonedPayload {
  if (typeof raw === 'object' && raw !== null) {
    const t0 = (raw as { t0?: unknown }).t0;
    if (typeof t0 === 'number' && Number.isFinite(t0)) {
      return { t0 };
    }
  }
  return { t0: Number.NaN };
}

const ark: ArkBridge = {
  version: process.versions.electron,
  window: {
    summon: async (): Promise<void> => {
      await ipcRenderer.invoke('window:summon');
    },
    hide: async (): Promise<void> => {
      await ipcRenderer.invoke('window:hide');
    },
  },
  onSummoned: (cb: (p: SummonedPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: unknown): void => {
      cb(toSummonedPayload(payload));
    };
    ipcRenderer.on('window:summoned', listener);
    return () => {
      ipcRenderer.removeListener('window:summoned', listener);
    };
  },
  onHiding: (cb: () => void): (() => void) => {
    const listener = (): void => {
      cb();
    };
    ipcRenderer.on('window:hiding', listener);
    return () => {
      ipcRenderer.removeListener('window:hiding', listener);
    };
  },
  ackHidden: (): void => {
    ipcRenderer.send('window:hidden-ack');
  },
};

contextBridge.exposeInMainWorld('ark', ark);
