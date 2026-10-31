# 环境探测报告 ENV-PROBE

> 探测时间：2026-10-31｜探测者：调度会话
> 用途：所有任务卡的 `VERIFY` 命令必须基于这份实测结果，不许假设。

## 1. 硬件

| 项 | 实测值 | 影响 |
|---|---|---|
| OS | Windows 11 家庭中文版 | 仅 Win 目标，符合 N-10 |
| CPU | AMD Ryzen 7 5800H (8C/16T) | 够用；并行 3~4 个 pnpm 任务不会卡 |
| RAM | 15.9 GB | 够；但开 Electron + VS Code + 浏览器后余量约 4-6GB |
| GPU | NVIDIA RTX 3050 Laptop, 4GB VRAM | 跑不动本地大模型 → N-6 成立；Blender 只做轻场景 |
| GPU2 | GameViewer Virtual Display Adapter | **虚拟显示器适配器**，多屏 DPI 测试要注意；可能影响 R-7 |
| 磁盘 | C: 46.6GB 可用 / D: 73GB / E: 88.9GB / F: 291.1GB | 数据放 F 盘正确；C 盘紧张，避免把 node_modules 放 C |

## 2. 开发工具链（关键发现）

| 工具 | 状态 | 处置 |
|---|---|---|
| Node | **原本没有** | 已装 20.18.1 到 `F:\gal\workstation\.tools\node-v20.18.1-win-x64` |
| npm | 随 Node 附带 10.8.2 | — |
| pnpm | **原本没有** | 已装 9.15.9 到 `F:\gal\workstation\.tools\npm-global` |
| Git | ✅ `C:\Program Files\Git\cmd\git.exe` | 可用 |
| Python | ✅ 3.12.12 (`F:\manage\Miniconda3\python.exe`) | node-gyp 可用 |
| MSVC | ✅ VS 2022 Community，toolset 14.44.35207，另有 `D:\vc` | **编译器就绪** |
| **Windows 10 SDK** | ❌ **缺失**（只有 Windows Kits 8.1） | **关键障碍**，见下 |
| ffmpeg | ❌ 未装 | S4 才需要 |
| Blender | ❌ 未装 | S5 才需要 |
| winget | ✅ 但有卡死现象（实测 10 分钟无进展） | **不使用 winget**，改直连下载 |

### Windows SDK 缺失的影响与对策

`better-sqlite3` 是原生模块。两条路：

1. **编译**：需要 Windows 10/11 SDK 的 `windows.h` 等头文件。当前只有 8.1 SDK，`node-gyp` 会报 `MSB8036: The Windows SDK version 10.0.x was not found`。
2. **预编译二进制**（推荐）：`better-sqlite3` 官方提供 `prebuild-install` 的 Windows x64 二进制。但 Electron 需要匹配其 ABI（NODE_MODULE_VERSION），官方 prebuild 只覆盖 Node 运行时，Electron 需 `@electron/rebuild` 从源码编译。

**因此必须二选一**：

- **方案 A（推荐）**：装 Windows 10 SDK（约 2-3GB，或用 `vs_buildtools.exe --add Microsoft.VisualStudio.Component.Windows11SDK.22621`）。一次性成本，之后 `@electron/rebuild` 正常。
- **方案 B**：换掉 `better-sqlite3`，改用**纯 JS 的 SQLite**（如 `sql.js`，WASM）或 `node:sqlite`（Node 22+ 内置，Electron 33 的 Node 是 20，不含）。
  - `sql.js` 缺点：整个库加载进内存、无 WAL、大库性能差。对笔记场景（几千篇）可接受。
- **方案 C**：用 Electron 33 自带的 `node:sqlite`？—— **不存在**，Electron 33 的 Node 20 没有 `node:sqlite`。

> **建议采用方案 A**：装 SDK。理由：`better-sqlite3` 的同步 API + WAL + FTS5 是 G-9 方案的基石，换 WASM 会推翻 G-9 的整个设计（`sql.js` 对 FTS5 支持不完整）。

## 3. 网络与镜像

| 项 | 状态 |
|---|---|
| npm registry | 已设 `https://registry.npmmirror.com`（全局） |
| `ELECTRON_MIRROR` | 已设 `https://npmmirror.com/mirrors/electron/`（用户环境变量） |
| 直连 nodejs.org | ✅ 可用（29.6MB 下载成功，约 30 分钟——**慢**） |
| winget | ❌ 卡死，弃用 |

> 下载速度约 1MB/min 级别，**Electron 首次安装（~100MB）预计 30-60 分钟**。这是 R-10 的实测依据。

## 4. 已完成的 M0 事项

```powershell
# Node 20.18.1 解压式安装（免管理员）
F:\gal\workstation\.tools\node-v20.18.1-win-x64\node.exe   → v20.18.1

# pnpm 9.15.9（用户级全局）
F:\gal\workstation\.tools\npm-global\pnpm.cmd            → 9.15.9

# 用户 PATH 已追加：
#   F:\gal\workstation\.tools\node-v20.18.1-win-x64
#   F:\gal\workstation\.tools\npm-global
```

验证（新开终端应直接可用）：

```powershell
node -v      # v20.18.1
pnpm -v      # 9.15.9
```

## 5. 对 PLAN 的修订需求（递给 SDS 阶段）

| PLAN 条款 | 需要修订 |
|---|---|
| §6 依赖表 | 增加风险说明：`better-sqlite3` 需 Windows 10 SDK；若 SDK 安装失败，降级为 `sql.js` 并改 G-9 检索实现 |
| G-1 验收 | `pnpm install` 前必须确认 SDK 就绪；增加前置检查命令 |
| R-3 | 概率从"高"改"已确认受阻"——SDK 缺失是**确定**的，不是概率 |
| §8 M0 | 增加"安装 Windows 10 SDK"作为独立子任务 |
| 新增风险 | R-11：镜像下载慢（Electron 100MB 预计 30-60 分钟），首次安装可能超时 |

## 6. 多屏注意

系统里有 `GameViewer Virtual Display Adapter` —— 这是虚拟显示器。**R-7（多屏/DPI）的测试必须包含"虚拟显示器存在时"这一场景**，否则真实环境可能出问题。
