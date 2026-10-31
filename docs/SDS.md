# SDS —— ARK 工作站 软件设计说明书

> 版本：**v1.3**｜对应 PLAN：**v3.2**｜日期：2026-10-31
> **自足性标准**：一个没有参与规划的工程师（或干净上下文 agent），只读本文件 + 一张任务卡，就能写出符合预期的代码，不需要回来问任何问题。
> 每条可被代码引用的规则都有编号 `CL-xxx`，任务卡的 `SDS_REFS` 只引用编号。
> 技术验证依据：`docs/SPIKE-01-技术验证.md`、`docs/TECH-VERIFY.md`（实测结论，优先级高于任何"通常如此"的说法）
>
> **v1.3 修订**（T-002 实施期间实测发现，共 4 条）：
> ⑰ **R5-01 `E-PLUGIN-003` 原始规则不可达**：§4.3 schema 的 `id` 带同一正则，非法 id 会先落 002 → `validateManifest` 在 zod 前对字符串 id 做语义预检并映射到 003；schema 正则保留作第二道校验
> ⑱ **R5-02 preload 必须绝对路径**：相对路径被 Electron 拒绝且**静默不加载**，`window.ark` 恒 undefined，而 typecheck/lint/test/build 四条全抓不到 → `buildWindowOptions(preloadAbsPath)` 改必填，新增 AC-M02-01b「实跑断言 `window.ark`」
> ⑲ **R5-03 工具链钉版本**：新增 §10.1（Node `20.18.1`、`@typescript-eslint` 锁 `8.18.2`）
> ⑳ **R5-04 启动清单**：新增 §10.2 七条（含 `ELECTRON_RUN_AS_NODE`、`ELECTRON_MIRROR`、`types: []`、ESM 无 `__dirname`）
>
> **v1.2 修订**（依据 `reviews/SDS-REVIEW-02.json` 的 16 条 blocking + 一次抽检）：
> ① 补完整文件树（CL-103）② 重写 CL-312/313（v1.0 伪码与样例自相矛盾，bigram 分支是死代码）③ CL-250 加失败回滚 `rollback()` + 泄漏断言 ④ CL-262 定 `<DATA>` 展开时机、修尾分隔符、加 `isUnder` 防 `ok-evil` 越权 ⑤ CL-271 内联 netguard 完整实现（不再外链）⑥ CL-311b 加 ESLint 规则机器化拦截 REPLACE ⑦ `redact` 移入 `shared/` 消除循环依赖 ⑧ 补 `ark://` 协议设计（CL-256）⑨ 补插件命令执行通道（CL-257）⑩ 补 bounds 算式与坐标系（CL-216/217）⑪ 重写评分公式（CL-280）⑫ 热区 tick 改闭包（CL-221）⑬ CL-301 补退出失败容忍（CL-303）
>
> **v1.2 抽检再修 3 条**（`reviews/AUDIT-01.md`）：
> ⑭ **CL-271 的 `onBeforeRedirect` 取消写法是空操作**（listener 无 callback、`details` 无 `cancel` 字段）→ 改为单靠 `onBeforeRequest` 拦截重定向后的新请求，`onBeforeRedirect` 只做审计 ⑮ **CL-250 缺 `registry.set()` 登记**（第 5 步失败时 `rollback` 拿不到 entry，view 泄漏且泄漏断言恒绿）→ 登记提前到建视图之后、任何 `try` 之前，三状态布尔紧随各步骤赋值 ⑯ **CL-312 的 cjk 分支从不赋 `source`、`isEmpty` 从不赋值** → 补齐并给出实测通过的完整参考实现
>
> **另修**：`isCJK` 正则的 `\u3000-\u303F` 是全角标点区，会把 `工、作` 吞成单个 run → 收紧为 `[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]`，并补 3 条标点用例

---

## 0. 术语与全局约定

| 术语 | 定义 |
|---|---|
| Shell | 主 BrowserWindow 内由 React 渲染的那层 UI（桌面、Dock、命令面板、设置） |
| 插件 | 独立 `WebContentsView` 承载的第三方 UI + 可选 main 侧代码 |
| 宿主态 | 窗口隐藏，只有热键/热区在监听 |
| 呼出态 | 窗口可见、置顶、持有焦点 |
| DIP | device-independent pixel，Electron `screen` API 的坐标单位 |
| 契约缺口 | SDS 未定义、实施者必须自行假设的地方，用 `CONTRACT_GAP:` 上报 |

### 0.1 命名约定

| 对象 | 规则 | 例 |
|---|---|---|
| 文件（TS/TSX） | kebab-case | `plugin-host.ts`、`command-palette.tsx` |
| React 组件 | PascalCase，文件名 kebab-case | `CommandPalette` in `command-palette.tsx` |
| 函数/变量 | camelCase | `computePluginBounds` |
| 常量 | SCREAMING_SNAKE | `MAX_ATTACHED` |
| 类型/接口 | PascalCase，前缀无语义 | `PluginManifest` |
| IPC 通道 | 冒号分隔，见 CL-261 | `plugin:com.ark.notes:fs.read` |
| SQL 表/列 | snake_case | `bigram_all`、`updated_at` |
| 错误码 | `E-<域>-<三位数>` | `E-PERM-001` |
| 主题变量 | `--ark-<名>` | `--ark-accent` |

### 0.2 时间与时区

- **存储**：一律存 UTC epoch 毫秒（`INTEGER`）。
- **展示**：渲染时才转本地时区，用 `Intl.DateTimeFormat`。
- **禁止**：任何地方存本地时间字符串。

### 0.3 数值

- 金额：`decimal` 以整数分存储（本项目 S0 无金额，此条为预留规范）。
- 尺寸/坐标：一律 DIP（number）。**禁止**混用物理像素。
- FTS 检索性能阈值：毫秒整数。

### 0.4 错误码段位

| 段 | 领域 |
|---|---|
| `E-PLUGIN-0xx` | manifest 与插件加载 |
| `E-PERM-0xx` | 权限网关 |
| `E-DB-0xx` | 数据层 |
| `E-FS-0xx` | 文件访问 |
| `E-NET-0xx` | 网络出口 |
| `E-AI-0xx` | AI 门面 |
| `E-PALETTE-0xx` | 命令面板 |
| `E-THEME-0xx` | 主题 |
| `E-WIN-0xx` | 窗口 |

### 0.5 全局硬规则

- **CL-001** 禁止裸 `throw` 字符串。所有错误必须是 `ArkError` 实例（见 §4.1）。
- **CL-002** 所有 **IPC handler** 必须 try/catch，并返回统一包络 `IpcResult<T> = {ok:true,data:T} | {ok:false,code:ArkErrorCode,message:string}`（§4.2），**禁止**让异常穿透到 Electron。
  - **例外：纯内存/纯函数的服务层返回值**（如 `AiApi.chat` 返回 `{ok:true,content} | {ok:false,code}`、`flushAllPlugins` 返回 `{ok:string[],timedOut:string[]}`）**不属于 IPC 包络**，它们是模块内部 API，由调用它的 handler 负责包装成 `IpcResult` 再出境。**判据：跨 `ipcMain.handle` 边界的才是 IPC，其余不是。**
- **CL-003** 所有外部输入（manifest、IPC 参数、文件内容、API 响应）必须经 zod 校验后才使用。
- **CL-004** 主进程禁止同步阻塞 >50ms 的操作（除 SQLite 同步查询，其天然 <10ms）。
- **CL-005** 渲染进程禁止直接 `require` Node 模块；`nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`。
- **CL-006** 两类日志，字段**不同**，不要混：
  - **应用日志**（`logs/app-YYYYMMDD.log`）：`{ts, level, task_id, module, msg, ...extra}`，`ts` 为 ISO8601。
  - **审计日志**（`logs/audit-YYYYMMDD.ndjson`）：`{ts, level, task_id, pluginId, api, decision, code, argsHash, path?}`（见 CL-263）。审计日志**不需要** `module`/`msg`——它的 `api` + `decision` + `code` 已构成完整语义。
  - 两者共用 `ts`/`level`/`task_id` 三个字段，其余各自定义。
- **CL-007** 禁止吞异常。catch 块要么处理、要么记 log 后重抛、要么显式注释为何忽略。

---

## 1. 架构总览

```
┌──────────────────────── 主进程 (main) ────────────────────────┐
│  M-01 bootstrap  启动顺序、单实例、load-env、resolveDataRoot    │
│  M-02 window     两态窗口（隐藏/呼出）、bounds、z 序            │
│  M-03 trigger    热键注册、边缘热区轮询                         │
│  M-04 theme      tokens → CSS 变量、主题广播                    │
│  M-05 db         ark.db + 插件库 ATTACH(LRU)、迁移、单实例     │
│  M-06 host       WebContentsView 生命周期、崩溃恢复             │
│  M-07 gateway    manifest 校验、senderMap、glob、审计          │
│  M-08 netguard   per-session 白名单（default + 每 partition）   │
│  M-09 palette    命令注册表、模糊匹配、执行                    │
│  M-10 ai         safeStorage、ai.chat、错误码                  │
│  M-11 privacy    防截屏、演示模式、路径脱敏                    │
└───────────────┬───────────────────────────────┬───────────────┘
                │ IPC (contextBridge)           │ 直接调用
┌───────────────▼──────────────┐   ┌────────────▼──────────────┐
│ Shell renderer (React)        │   │ 插件 WebContentsView       │
│  桌面 / Dock / 命令面板 / 设置 │   │  (独立 partition)          │
└───────────────────────────────┘   └───────────────────────────┘
```

**依赖方向（强制）**：

```
shared/ ← 任何层都可 import（纯类型与纯函数，无副作用）
main/   → 只能 import shared/，禁止 import renderer/
preload/→ 只能 import shared/，禁止 import main/
renderer/→ 只能 import shared/，禁止 import main/ 或 preload/
```

- **CL-101** 违反依赖方向 = 构建失败。用 `eslint-plugin-boundaries` 或自写 lint 规则强制。
- **CL-102** `shared/` 内所有模块必须无副作用（不读文件、不发请求、不碰全局），可用纯函数单测。

---

## 2. 模块清单

### 2.0 文件布局（实现时必须严格按此建目录）

```
workstation/
├─ .env                     ARK_DATA_DIR=...（不入库）
├─ .env.example
├─ .npmrc                   registry + electron 镜像
├─ package.json
├─ tsconfig.json  tsconfig.node.json  tsconfig.web.json
├─ electron.vite.config.ts
├─ tailwind.config.ts  postcss.config.js
├─ eslint.config.js
├─ scripts/
│   ├─ check-deps.mjs       依赖三条断言
│   ├─ gen-tokens.mjs       tokens.ts → tokens.css
│   └─ gen-css-color-names.mjs   CSS Color 4 148 色 → src/shared/css-color-names.ts
├─ src/
│   ├─ shared/              纯类型与纯函数（无副作用）
│   │   ├─ types.ts         ArkError、IpcResult、PluginManifest
│   │   ├─ manifest-schema.ts
│   │   ├─ tokens.ts        Theme、themeToCssVars
│   │   ├─ window-options.ts buildWindowOptions、computeWindowBounds
│   │   ├─ bounds.ts        computePluginBounds
│   │   ├─ grams.ts         planGrams、buildQuery、matchRuns
│   │   ├─ score.ts         score、tokenize、isSubsequence
│   │   ├─ glob.ts          matchGlob、staticPrefix
│   │   ├─ redact.ts
│   │   └─ css-color-names.ts  （生成产物，不手改）
│   ├─ main/
│   │   ├─ index.ts         bootstrap 入口（F-01）
│   │   ├─ load-env.ts
│   │   ├─ data-root.ts
│   │   ├─ window.ts        M-02
│   │   ├─ trigger.ts       M-03
│   │   ├─ theme.ts         M-04
│   │   ├─ db.ts            M-05
│   │   ├─ db-migrations.ts
│   │   ├─ host.ts          M-06
│   │   ├─ gateway.ts       M-07
│   │   ├─ audit.ts         M-07 审计
│   │   ├─ netguard.ts      M-08
│   │   ├─ palette.ts       M-09
│   │   ├─ ai.ts            M-10
│   │   ├─ privacy.ts       M-11
│   │   ├─ input-hook.ts    attachInputHook（M-09 用，M-06 调）
│   │   ├─ ipc.ts           IPC 注册总表
│   │   └─ logger.ts
│   ├─ preload/
│   │   ├─ shell.ts         Shell 的 contextBridge
│   │   └─ plugin.ts        插件 view 的 contextBridge（ark.fs/db/ai/flush）
│   └─ renderer/
│       ├─ index.html
│       ├─ styles/tokens.css  （生成产物）
│       ├─ App.tsx
│       ├─ components/       Desktop、Dock、CommandPalette、Settings、ErrorCard
│       └─ plugins/notes/    笔记插件 renderer（Monaco 编辑器）
├─ plugins/
│   ├─ notes/manifest.json
│   └─ fixtures/{evil-fixture,no-perm,net-escape,hardcoded-color}/
├─ tests/
│   ├─ unit/                 纯函数单测
│   ├─ integration/
│   └─ e2e/
└─ data/                     ★ 运行时生成，不入库（.gitignore）
```

**CL-103** 上表之外的顶层目录不得新增。新增需改 SDS 并记 ADR。

### 2.1 模块清单

| ID | 名称 | 职责（一句话） | 依赖 | PLAN 目标 |
|---|---|---|---|---|
| M-01 | bootstrap | 启动顺序、单实例、env、数据根 | M-05 | G-8 |
| M-02 | window | 两态窗口、bounds、z 序、焦点 | M-04 | G-2、G-4 |
| M-03 | trigger | 热键、边缘热区 | M-02 | G-3 |
| M-04 | theme | tokens、CSS 变量、主题广播 | — | G-5 |
| M-05 | db | 库连接、迁移、ATTACH LRU | — | G-8 |
| M-06 | host | 插件 view 生命周期、崩溃 | M-02、M-05、M-07、M-08 | G-7 |
| M-07 | gateway | manifest、权限、审计 | M-05 | G-7 |
| M-08 | netguard | 网络白名单 | — | G-12 |
| M-09 | palette | 命令注册表、匹配、执行 | M-06 | G-6a/b |
| M-10 | ai | 密钥、chat、错误映射 | M-05 | G-10 |
| M-11 | privacy | 防截屏、演示模式、脱敏 | M-02、M-06 | G-11 |
| M-12 | notes | 笔记插件（检索、双链） | M-05、M-07 | G-9 |

---

## 3. 接口契约

### 3.0 IPC 通道总表（`src/main/ipc.ts` 一次性注册，禁止散落注册）

| 通道 | 方向 | 参数 | 返回 | 所属模块 |
|---|---|---|---|---|
| `window:summon` | R→M | — | `IpcResult<void>` | M-02 |
| `window:hide` | R→M | — | `IpcResult<void>` | M-02 |
| `window:summoned` | M→R | `{t0:number}` | — | M-02 |
| `window:hiding` | M→R | — | — | M-02 |
| `window:hidden-ack` | R→M | — | — | M-02 |
| `window:chrome-metrics` | R→M | `{top,bottom,left,right}` | `IpcResult<void>` | M-02 |
| `theme:get` | R→M | — | `IpcResult<Theme>` | M-04 |
| `theme:set` | R→M | `{id:string}` | `IpcResult<void>` | M-04 |
| `theme:changed` | M→R(全部) | `{id:string; vars:Record<string,string>}` | — | M-04 |
| `palette:search` | R→M | `{q:string; limit:number}` | `IpcResult<Command[]>` | M-09 |
| `palette:execute` | R→M | `{id:string}` | `IpcResult<void>` | M-09 |
| `palette:close` | R→M | — | `IpcResult<void>` | M-09 |
| `settings:get` | R→M | `{key:string}` | `IpcResult<string\|null>` | M-05 |
| `settings:set` | R→M | `{key:string; value:string}` | `IpcResult<void>` | M-05 |
| `ai:setKey` | R→M | `{key:string}` | `IpcResult<void>` | M-10 |
| `ai:hasKey` | R→M | — | `IpcResult<boolean>` | M-10 |
| `ai:chat` | R→M | `{messages; model}` | `IpcResult<{content:string}>` | M-10 |
| `net:setAllowlist` | R→M | `{hosts:string[]}` | `IpcResult<void>` | M-08 |
| `privacy:setContentProtection` | R→M | `{on:boolean}` | `IpcResult<void>` | M-11 |
| `privacy:setDemoMode` | R→M | `{on:boolean}` | `IpcResult<void>` | M-11 |
| `plugin:<id>:fs.read` | P→M | `{path:string}` | `IpcResult<string>` | M-07 |
| `plugin:<id>:fs.write` | P→M | `{path:string; data:string}` | `IpcResult<void>` | M-07 |
| `plugin:<id>:db.query` | P→M | `{sql:string; params:unknown[]}` | `IpcResult<unknown[]>` | M-07 |
| `plugin:<id>:db.exec` | P→M | `{sql:string; params:unknown[]}` | `IpcResult<void>` | M-07 |
| `plugin:<id>:ai.chat` | P→M | `{messages; model}` | `IpcResult<{content:string}>` | M-07 |
| `plugin:flush` | M→P(全部) | — | `void` | M-06 |
| `plugin:cmd.invoke` | M→P | `{commandId:string; requestId:string}` | `void` | M-09 |
| `plugin:cmd.result` | P→M | `{requestId:string; ok:boolean; error?:string}` | — | M-09 |
| `test:summon` | R→M | — | `IpcResult<void>` | 仅 dev+ARK_E2E=1 |

- **CL-104** 上表之外不得新增通道。新增需改 SDS。
- **CL-105** `test:summon` 仅在 `!app.isPackaged && process.env.ARK_E2E === '1'` 时注册；打包产物中该通道 invoke 必须返回 rejected（回归用例 AC-M02-10）。

### M-01 bootstrap

**职责**：定义并保证启动顺序；解析数据根；单实例锁。
**不负责**：窗口创建（M-02）、插件加载（M-06）。

```ts
// shared/types.ts
export type BootstrapResult =
  | { ok: true; dataRoot: string; isPackaged: boolean }
  | { ok: false; code: 'E-WIN-001' | 'E-WIN-002'; message: string };
```

**启动顺序（CL-201，顺序不可换）**：

```
1. loadEnvFromDisk()          // 见 M-01.2，必须在读 process.env 之前
2. app.requestSingleInstanceLock() → 失败则 app.quit() 并 return
3. resolveDataRoot()          // CL-202，可能抛错
4. ensureDir(dataRoot)         // 失败 → E-WIN-002，退出
5. app.whenReady()
6. 打开 ark.db + 迁移 (M-05)
7. 创建窗口 (M-02)
8. 挂触发器 (M-03)
9. 加载插件 (M-06)
10. 挂 netguard 到 defaultSession (M-08)
```

**错误路径**：

| 码 | 触发条件 | 行为 | 可重试 |
|---|---|---|---|
| `E-WIN-001` | 单实例锁获取失败 | `app.quit()`，无 UI（避免打扰） | 否 |
| `E-WIN-002` | 数据根创建/写入失败 | 弹 `dialog.showErrorBox` 显示实际路径与错误，退出 | 用户修权限后重启 |
| `E-WIN-003` | `.env` 解析失败 | 记 warn，**继续**启动（env 是可选） | — |

**M-01.2 `loadEnvFromDisk()`（CL-203）**

```ts
// src/main/load-env.ts —— 约 15 行，不引入 dotenv
export function loadEnvFromDisk(paths: string[]): void
```
- 对每个 path：若文件存在，按行读，跳过空行与 `#` 开头，按第一个 `=` 切分，trim 两侧。
- **已存在于 `process.env` 的 key 不覆盖**（外部显式设置优先）。
- 不支持引号嵌套、多行值、变量插值。
- 单测 3 条：正常解析 / 注释忽略 / 已有 env 不被覆盖 / 文件不存在不抛。

**M-01.3 `resolveDataRoot()`（CL-204）**

```ts
export function resolveDataRoot(
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
  appPath: string,
  exePath: string,
  userDataPath: string,
): string
```
解析顺序：
1. `env.ARK_DATA_DIR` 非空 → 直接返回（规范化 `path.resolve`）
2. `!isPackaged` → `path.join(appPath, 'data')`
3. `isPackaged && isWritable(path.join(dirname(exePath), 'data'))` → 该路径
4. 回退 → `path.join(userDataPath, 'data')`

**验收用例**：

| 用例 | 输入 | 期望 | 类型 |
|---|---|---|---|
| AC-M01-01 | env 设了 | 返回该值 | 正常 |
| AC-M01-02 | env 空 + dev | `<appPath>/data`，**不含** `node_modules` | 正常 |
| AC-M01-03 | env 空 + packaged + 可写 | `<exeDir>/data` | 正常 |
| AC-M01-04 | env 空 + packaged + 不可写 | `<userData>/data` | 边界 |
| AC-M01-05 | 所有目录都不可写 | 抛 `E-WIN-002` | 异常 |

---

### M-02 window

**职责**：创建/显示/隐藏窗口；计算 bounds；维护 z 序与焦点；播放入场动画并上报耗时。
**不负责**：插件 view 的创建（M-06，但 M-02 提供 `getContentView()` 和 bounds 计算）。

**两态参数表（CL-210，PLAN §11 的实现依据）**：

| 参数 | 隐藏态（构造时） | 呼出态（show 后设置） | 收起时恢复 |
|---|---|---|---|
| `show` | `false` | — | — |
| `frame` | `false` | 不变 | — |
| `transparent` | `true` | 不变 | — |
| `skipTaskbar` | `true`（spy 断言） | 不变 | — |
| `alwaysOnTop` | `false` | `setAlwaysOnTop(true,'screen-saver')` | `setAlwaysOnTop(false)` |
| `focusable` | `true` | 不变 | — |
| `resizable` | `false` | 不变 | — |
| `hasShadow` | `false` | 不变 | — |
| `backgroundColor` | `'#00000000'` | 不变 | — |
| `bounds` | 不设（默认小窗） | `computeWindowBounds(display)` | 不恢复（每次呼出重算） |

```ts
// shared/window-options.ts —— 纯函数，可单测
//
// ★ R5-02（T-002 的 A7 实测发现）：preload 必须是**绝对路径**，由调用方注入。
//   Electron 对相对路径只打一条 `ERROR: preload script must have absolute path`
//   然后**静默不加载** preload —— renderer 里 window.ark 恒为 undefined，
//   而 typecheck / lint / test / build 四条命令**全都抓不到**（它们不启动 Electron）。
//   所以签名必须是必填参数，不允许有"相对路径默认值"。
export function buildWindowOptions(preloadAbsPath: string): WindowOptions

// 调用侧（main/index.ts）：
//   const HERE = dirname(fileURLToPath(import.meta.url));   // "type":"module" 下没有 __dirname
//   const preloadAbs = join(HERE, '../preload/index.js');
//   new BrowserWindow(buildWindowOptions(preloadAbs))

/** 窗口覆盖层 = 光标所在屏的 workArea 全屏（不减任何内缩） */
export function computeWindowBounds(display: Electron.Display): Electron.Rectangle {
  const { x, y, width, height } = display.workArea;   // 已是 DIP
  return { x, y, width, height };
}

/** 插件 view 占满窗口内除了 Shell chrome 之外的区域 */
export interface ChromeMetrics {
  top: number;      // 顶栏高度（DIP）
  bottom: number;   // Dock 高度（DIP）
  left: number;
  right: number;
}
export function computePluginBounds(
  display: Electron.Display,
  chrome: ChromeMetrics,
): Electron.Rectangle {
  const w = computeWindowBounds(display);
  return {
    x: chrome.left,
    y: chrome.top,
    width: Math.max(0, w.width - chrome.left - chrome.right),
    height: Math.max(0, w.height - chrome.top - chrome.bottom),
  };
}
```

- **CL-216 坐标系（R1-B-02/B-04 采纳 —— v1.0 未定，导致 AC-M02-06 与视觉内缩冲突）**：
  - `computeWindowBounds` 返回**屏幕绝对 DIP 坐标**（可直接给 `win.setBounds`）。
  - `computePluginBounds` 返回**相对窗口内容的 DIP 坐标**（直接给 `view.setBounds`）。**不**含 `display.x/y` 偏移。
  - 两者**不是**同一个坐标系。

**★ CL-216b `computeWindowBounds` 的像素级算式（R1-B-02 采纳 —— v1.0 只有签名，实施者会猜错）**

```ts
const OVERLAY_INSET = 0;   // 覆盖层 = workArea 全屏，不内缩

export function computeWindowBounds(display: Electron.Display): Electron.Rectangle {
  const wa = display.workArea;          // 已是 DIP 整数
  return {
    x: Math.round(wa.x + OVERLAY_INSET),
    y: Math.round(wa.y + OVERLAY_INSET),
    width:  Math.round(wa.width  - OVERLAY_INSET * 2),
    height: Math.round(wa.height - OVERLAY_INSET * 2),
  };
}
```
- **`OVERLAY_INSET = 0`**：这是"完整工作环境"的产品决定，不是居中浮窗。AC-M02-06 断言 **`bounds` 严格等于 `display.workArea`**（四字段全等）。
- **不做 DPI 换算**：Electron 的 `screen` API 全部返回 DIP，`setBounds` 也接受 DIP。**禁止**乘 `scaleFactor`（乘了会在 4K 屏上超界）。
- **不用 `Math.floor`**：用 `Math.round`，因为 `workArea` 本身已是整数，round 只是防浮点误差。
- **不居中、不内缩、不设最大尺寸**。

**CL-217 `chromeMetrics` 来源**：由 Shell renderer 在布局完成后通过 `window:chrome-metrics` 上报（`top = 顶栏高 + 安全区`，`bottom = Dock 高`），主进程缓存；未收到前用默认 `{top:0,bottom:0,left:0,right:0}`（插件 view 暂时铺满，收到后重算）。
  - 新增通道：`window:chrome-metrics` R→M `{top,bottom,left,right}` → `IpcResult<void>`。
  - `chromeMetrics` 变化 → 调 `recalcAll()`（CL-251）。

**CL-218 M-02 的完整接口块（R1-B-03 采纳 —— v1.0 只有两个函数签名，其余只有调用没有定义）**

```ts
// src/main/window.ts
export interface WindowApi {
  init(): Promise<void>;                                  // 创建窗口，不 show
  summon(): Promise<void>;                                // CL-211
  hide(): Promise<void>;                                  // CL-212
  getWindow(): BrowserWindow;
  getContentView(): Electron.View;                        // ★ 返回 View，不是 WebContentsView
  isVisible(): boolean;
  isFlushing(): boolean;                                  // ★ flush 进行中标志的持有者
  flushAllPlugins(): Promise<{ ok: string[]; timedOut: string[] }>;   // ★ 返回值语义
  waitForRendererExit(ms: number): Promise<boolean>;      // ★ 靠 IPC ack，不是固定 sleep
  setChromeMetrics(m: ChromeMetrics): void;               // CL-217
  recalcAll(): void;                                      // CL-251
}
```

**CL-219 三个易混函数的确切语义（R1-B-03 采纳）**

| 函数 | 实现 | 语义 |
|---|---|---|
| `getContentView(): Electron.View` | `return win.contentView` | 返回 `View` 基类（Electron 33 的类型）。M-06 调 `addChildView(view)` 是合法签名，**不需要 any** |
| `waitForRendererExit(ms): Promise<boolean>` | 发 `window:hiding` 后等 renderer 回 `window:hidden-ack`；超时 `ms` 则 resolve(false) | **不是** `setTimeout(ms)` 的纯 sleep。resolve(true)=renderer 确认退场完成；resolve(false)=超时强退 |
| `flushAllPlugins()` | `Promise.allSettled` 并发，每个插件 1000ms 超时 | 返回 `{ok: [...已刷盘插件id], timedOut: [...超时插件id]}`。**调用方必须检查 `timedOut` 并记 warn** |
| `isFlushing` | M-02 内的私有布尔，`hide()` 进入时置 true、结束置 false | CL-214 的失焦判据读它，避免 flush 中误收起 |

**新增通道**：`window:hidden-ack` R→M `void` → `void`（仅 fire-and-forget，不需返回包络）。

**CL-211 呼出序列（顺序固定）**：
```ts
async function summon(): Promise<void> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds(computeWindowBounds(display));   // 1
  win.setAlwaysOnTop(true, 'screen-saver');       // 2
  const t0 = Date.now();                          // 3 ★ 必须在 show 之前取
  win.show();                                     // 4
  win.focus();                                    // 5
  win.webContents.send('window:summoned', { t0 });// 6 renderer 据此播动画
}
```

**CL-212 收起序列**：
```ts
async function hide(): Promise<void> {
  await flushAllPlugins({ timeoutMs: 1000 });     // 1 见 CL-215
  win.webContents.send('window:hiding');          // 2 renderer 播退场
  await waitForRendererExit(150);                 // 3 最多等 150ms
  win.setAlwaysOnTop(false);                      // 4
  win.hide();                                     // 5
}
```

**CL-213 动效计时（★ 修复 PLAN B-02 的恒真断言）**

- `t0`：主进程 `show()` **之前**取的 `Date.now()`，经 IPC 下发。
- `t1`：renderer 在 framer-motion `onAnimationComplete` 里取 `Date.now()`。
- **两端必须用 `Date.now()`**（同一 epoch）。**禁止** renderer 用 `performance.now()` 与主进程 `Date.now()` 相减——那是恒真断言（差值恒为约 -1.7e12）。
- 断言：连续 5 次 summon，每次 `t1 - t0 <= 320`。
- 冷启动后第一次**打印** `t1-t0`，不参与断言。

**CL-214 失焦收起判据（默认关闭，开启后 3000ms）**
```ts
function shouldAutoHide(): boolean {
  if (!settings.autoHideOnBlur) return false;
  if (win.isFocused()) return false;
  if (win.webContents.isDevToolsFocused()) return false;
  if (BrowserWindow.getFocusedWindow() !== null) return false;   // 本应用其他窗口
  if (isFlushing) return false;                                   // flush 中不收起
  return true;
}
```
- 用 3000ms 定时器 + 每 200ms 复查，满足条件才真正 hide。
- **不使用** `win.on('blur')` 直接触发（devtools/系统对话框会误触发）。

**CL-215 `flushAllPlugins()`**
```ts
async function flushAllPlugins(opts: { timeoutMs: number }): Promise<void>
```
- 向所有插件 view 发 `plugin:flush`，插件 preload 调用其注册的 flush 回调。
- 总预算 `timeoutMs`，超时未回 → 记 `warn`，**继续**（不阻塞用户）。
- 用 `Promise.allSettled`，任一插件抛错不影响其他。

**错误路径**：

| 码 | 条件 | 行为 |
|---|---|---|
| `E-WIN-010` | `summon` 时 `screen.getDisplayNearestPoint` 返回 undefined | 回退到 `screen.getPrimaryDisplay()` |
| `E-WIN-011` | `win.show()` 抛错（窗口已销毁） | catch → 重建窗口 → 重试一次 |
| `E-WIN-012` | flush 超时 | 记 warn，继续 hide |

**验收用例**：

| 用例 | 输入 | 期望 | 类型 |
|---|---|---|---|
| AC-M02-01 | `buildWindowOptions('C:\\fake\\preload.js')` | deep equal 快照（见参数表），且 `webPreferences.preload` **等于传入的绝对路径** | 正常 |
| AC-M02-01b | **实跑**应用后从 renderer 读 `typeof window.ark` | `'object'`（preload 真的加载了）；**只跑 typecheck/lint/test/build 不算通过**（R5-02） | 安全 |
| AC-M02-02 | 构造后 | `spyOnSetSkipTaskbar` 被以 `true` 调用；`win.isVisible()===false` | 正常 |
| AC-M02-03 | summon 后 | `isAlwaysOnTop()===true` 且 `isFocused()===true` | 正常 |
| AC-M02-04 | hide 后 | `isAlwaysOnTop()===false` 且 `isVisible()===false` | 正常 |
| AC-M02-05 | 5 次 summon | 每次 `t1-t0 <= 320` | 正常 |
| AC-M02-06 | 双屏，光标在副屏 | bounds 等于副屏 workArea | 边界 |
| AC-M02-07 | 失焦收起关 | 点其他窗口 5s 后仍 `isVisible()===true` | 边界 |
| AC-M02-08 | 失焦收起开 + 插件 view 聚焦 | 不收起 | 异常 |
| AC-M02-09 | 笔记输入中触发 hide | flush 被调用，内容不丢 | 异常 |
| AC-M02-10 | 打包产物里 invoke `test:summon` | rejected（CL-105） | 安全 |

---

### M-03 trigger

**职责**：注册全局热键；轮询边缘热区；向上报"用户要呼出"。
**不负责**：执行 summon（M-02）。

```ts
export interface TriggerConfig {
  hotkey: { enabled: boolean; accelerator: string };  // 默认 'Ctrl+Alt+Space'
  edge:   { enabled: boolean; edgePx: number; dwellMs: number; cooldownMs: number; pollMs: number };
}
// 默认：hotkey.enabled=true, edge.enabled=false, edgePx=2, dwellMs=150, cooldownMs=1000, pollMs=50
```

**CL-220 热键**
- `globalShortcut.register(cfg.hotkey.accelerator, onSummon)`。
- 返回 `false` → 派发 `E-WIN-020` 事件，Shell 显示"快捷键被占用"并提供改键入口（**不静默失败**）。
- 退出时 `globalShortcut.unregisterAll()`。

**CL-221 边缘热区（仅 enable 时启动 timer）**

状态**必须封装在闭包内**（禁止模块级可变变量，否则多次 `start()` 会串状）：
```ts
export function createEdgeWatcher(cfg, onSummon, isSuppressed): { start(): void; stop(): void } {
  let timer: NodeJS.Timeout | null = null;
  let startedAt = 0;        // 本次进入边带的起始时刻
  let lastFiredAt = 0;      // 上次触发时刻

  function tick() {
    if (isSuppressed()) { startedAt = 0; return; }
    const pt = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(pt);
    const wa = display.workArea;
    const inBand =
      (pt.x - wa.x <= cfg.edgePx) ||
      (wa.x + wa.width - pt.x <= cfg.edgePx) ||
      (pt.y - wa.y <= cfg.edgePx) ||
      (wa.y + wa.height - pt.y <= cfg.edgePx);
    if (inBand) {
      if (startedAt === 0) startedAt = Date.now();
      else if (Date.now() - startedAt >= cfg.dwellMs && Date.now() - lastFiredAt >= cfg.cooldownMs) {
        lastFiredAt = Date.now(); startedAt = 0; onSummon();
      }
    } else startedAt = 0;
  }

  return {
    start() { if (timer) return; timer = setInterval(tick, cfg.pollMs); },
    stop()  { if (timer) { clearInterval(timer); timer = null; } startedAt = 0; },
  };
}
```
- 全部用 DIP 比较。
- **多屏共边**：只判定光标所在 display 的 workArea 边。共边处两屏都可能判中，但 `cooldownMs` 保证只触发一次。
- **CL-222 CPU 预算**：开启状态下 60s 内主进程 CPU 增量 < 0.5s。测法：`process.getCPUUsage()` 采样前后 `cpuUsage` 累计差值。
- **CL-223 抑制条件**：`isSuppressed()` = 演示模式开启 || 窗口已可见 || 插件 view 正在全屏（S0 不做跨应用检测）。
- **CL-224 全屏检测（近似实现）**：S0 只用"窗口已可见"与"演示模式"两个条件；**不做**跨应用前台全屏检测（需 Win32 `GetForegroundWindow` 原生调用，超出 S0）。README 必须声明该局限。

**验收用例**：

| 用例 | 输入 | 期望 | 类型 |
|---|---|---|---|
| AC-M03-01 | 注册热键 | `isRegistered` true；反注册后 false | 正常 |
| AC-M03-02 | 注册一个非法 accelerator | 返回 false 且派发 `E-WIN-020` | 异常 |
| AC-M03-03 | 热区关 + 光标划四边 | 2s 内 10 次 `isVisible()` 恒 false | 正常 |
| AC-M03-04 | 热区开 + 光标屏内自由移动 2s | 不呼出 | 边界 |
| AC-M03-05 | 热区开 + 光标停左边带 200ms | 1000ms 内可见 | 正常 |
| AC-M03-06 | 热区开 + 两屏共边来回 | 只触发一次 | 边界 |
| AC-M03-07 | 已可见时触发 | 不重复 summon | 边界 |

---

### M-04 theme

**职责**：tokens 定义、生成 CSS 变量、主题切换广播。
**不负责**：组件样式、颜色 lint 规则实现（属工程配置）。

```ts
// shared/tokens.ts
export interface Theme {
  id: 'deep-space' | 'parchment' | 'high-contrast';
  name: string;
  color: Record<'bg'|'surface'|'surfaceHi'|'border'|'text'|'textDim'|'accent'|'accentSoft'|'danger', string>;
  radius: Record<'sm'|'md'|'lg'|'xl', number>;
  space: number[];                       // [4,8,12,16,24,32,48]
  type: Record<'display'|'h1'|'h2'|'body'|'caption'|'mono', { size: number; weight: number; lineHeight: number }>;
  shadow: Record<'card'|'float'|'modal', string>;
  motion: { fast: number; base: number; slow: number; spring: string };
  surfaceBlur: number;                   // px，防截屏时降级为 0
}
export function themeToCssVars(t: Theme): Record<`--ark-${string}`, string>  // 纯函数
```

**CL-230 变量写入点唯一性**
- `tokens.css` 由构建期 `scripts/gen-tokens.mjs` 生成，**只提供初始值**。
- **运行期唯一写入点**：`document.documentElement.style.setProperty('--ark-*', v)`。
- 优先级：内联 > tokens.css。
- 插件 view 由 preload 在 `document-start` 注入 `<style id="ark-tokens">`，内容为同一份变量；主题切换时主进程广播 `theme:changed`，preload 重写该 style 的 textContent。

**CL-231 主题切换流程**
```
Shell: ark.theme.set('parchment')
  → main: 校验 id 存在 (否则 E-THEME-001)
  → 持久化到 ark.db settings 表 key='theme.id'
  → 广播 'theme:changed' 给 Shell + 所有插件 view
  → 各端重写 CSS 变量
```

**错误路径**：

| 码 | 条件 | 行为 |
|---|---|---|
| `E-THEME-001` | 主题 id 不存在 | 返回错误，**不切换**，当前主题不变 |
| `E-THEME-002` | tokens 生成的变量数量 != 期望数量 | 构建期失败 |

**验收用例**：

| 用例 | 期望 | 类型 |
|---|---|---|
| AC-M04-01 | `themeToCssVars(deepSpace)` 快照匹配 | 正常 |
| AC-M04-02 | 切换主题后 `getPropertyValue('--ark-accent')` 变化 | 正常 |
| AC-M04-03 | 切换不存在的主题 | 返回 `E-THEME-001`，变量不变 | 异常 |
| AC-M04-04 | 插件 view 收到 `theme:changed` 后变量更新 | 正常 |
| AC-M04-05 | `surfaceBlur` 为 0 时 `--ark-surface-blur` 为 `0px` | 边界 |

---

### M-05 db

**职责**：打开/关闭数据库；迁移；插件库 ATTACH 的 LRU 管理。
**不负责**：业务表设计（属各插件）。

```ts
export interface DbApi {
  main(): Database.Database;                                  // ark.db
  attachPlugin(pluginId: string): string;                     // 返回 alias，如 "p_notes"
  detachPlugin(pluginId: string): void;
  migrate(db: Database.Database, target: number, stmts: string[]): number;
  closeAll(): void;
}
```

**CL-240 库文件布局**
```
<DATA_ROOT>/ark.db                主库（插件元数据、settings、command_usage）
<DATA_ROOT>/plugins/<id>.db       每插件独立库
<DATA_ROOT>/logs/audit-YYYYMMDD.ndjson
<DATA_ROOT>/secrets/ai.bin
```

**CL-241 连接参数（打开即设，顺序固定）**
```ts
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('recursive_triggers = OFF');   // ★ 我们靠 UPSERT，不靠 REPLACE
```

**CL-242 迁移**
```ts
function migrate(db, target: number, stmts: string[]): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current >= target) return current;        // 幂等
  const tx = db.transaction(() => {
    for (const s of stmts) db.exec(s);
    db.pragma(`user_version = ${target}`);
  });
  tx();
  return target;
}
```
- 幂等语义：`current >= target` 直接返回，**不执行任何语句**。
- 连续启动 3 次，`user_version` 不变，无 error 日志。

**CL-243 ATTACH LRU（≤3 个，上限 10）**
- **实测（2026-10-31，`probe-t001`）**：`ATTACH` 连续成功 **10 次**，第 11 次报 `too many attached databases - max 10`。即 `SQLITE_MAX_ATTACHED = 10` 指**附加库**数量，**不含** `main` → 总连接数上限 11，插件库最多 **10** 个。
  - ⚠️ **v1.0/v1.1 写"含 main 共 10 → 最多 9 个插件库"是错的**（差一）。虽然本设计实际只用 3 个，不影响行为，但风险登记与断言都写错了数字。
- 策略：**同时最多 ATTACH 3 个**，LRU 淘汰时 `DETACH`。
- alias 格式：`p_<id 去掉点与非法字符，截断 20 字符>`，冲突时加数字后缀。
- 第 10 个（理论不可达，因上限 3）→ `E-DB-001`。

**错误路径**：

| 码 | 条件 | 行为 |
|---|---|---|
| `E-DB-001` | ATTACH 失败（超限或文件损坏） | 返回错误，插件降级为"不可用"卡片 |
| `E-DB-002` | SQL 执行错误 | 透传 `message`（先脱敏路径），不暴露栈 |
| `E-DB-003` | 迁移失败 | 回滚事务，**不升级** `user_version`，启动失败并提示 |
| `E-DB-004` | 库文件被其他进程锁住（busy_timeout 耗尽） | 提示"另一个实例正在使用"，退出 |

**验收用例**：

| 用例 | 期望 | 类型 |
|---|---|---|
| AC-M05-01 | 启动后 `journal_mode === 'wal'` | 正常 |
| AC-M05-02 | 连续启动 3 次 | `user_version` 不变，无 error | 正常 |
| AC-M05-03 | ATTACH 4 个插件 | 第 1 个被 detach，仍 ≤3 | 边界 |
| AC-M05-04 | 单实例 | 第二次启动 3s 内退出，`second-instance` 事件 +1 | 正常 |
| AC-M05-05 | 迁移语句中途抛错 | `user_version` 未变 | 异常 |

---

### M-06 host

**职责**：`ark://` 协议注册；插件 view 的创建/销毁/显示/隐藏；崩溃恢复；bounds 重算；挂 input hook 与 netguard。
**不负责**：权限判定（M-07）、白名单逻辑（M-08）。

**CL-256 `ark://` 协议注册（★ R1-B-16 采纳 —— v1.0 完全没设计，导致 `entry` 校验成死代码 + 目录穿越）**

```ts
// 必须在 app.whenReady() 之前调用
protocol.registerSchemesAsPrivileged([{
  scheme: 'ark',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);
```

```ts
// app.whenReady() 之后
protocol.handle('ark', async (req) => {
  const u = new URL(req.url);                 // ark://plugin/<id>/<relPath>
  if (u.host !== 'plugin') return new Response('not found', { status: 404 });
  const segs = u.pathname.split('/').filter(Boolean);   // ['<id>', ..., 'file']
  const id = decodeURIComponent(segs[0] ?? '');
  const rel = decodeURIComponent(segs.slice(1).join('/')) || 'index.html';

  const manifest = manifests.get(id);
  if (!manifest) return new Response('unknown plugin', { status: 404 });

  // ★ 关键：路径必须锚定在插件目录内，且必须等于 manifest.entry（首次加载）
  const pluginDir = path.resolve(PLUGINS_DIR, id);
  const target = path.resolve(pluginDir, rel);
  if (!isUnder(target, pluginDir)) return new Response('forbidden', { status: 403 });

  const entryAbs = path.resolve(pluginDir, manifest.entry);
  if (!isUnder(entryAbs, pluginDir)) return new Response('bad entry', { status: 400 });

  try {
    const data = await fs.promises.readFile(target);
    return new Response(data, { headers: { 'content-type': mimeOf(target) } });
  } catch {
    return new Response('not found', { status: 404 });
  }
});
```

- **`entry` 不再是死代码**：只在 `loadURL('ark://plugin/<id>/' + manifest.entry)` 里使用 `manifest.entry`，**不**硬编码 `index.html`。R1-B-16 指出 v1.0 在步骤 10 写死 `index.html`，使 `E-PLUGIN-004` 的 entry 校验永远不生效。
- **目录穿越**：`isUnder(target, pluginDir)`（带分隔符，见 CL-262 的 `isUnder`）拦 `..%2f`、`%00`、双重编码。
- **`ark://` 在 netguard 里放行（`isInternal`）是安全的**，因为协议 handler 自身做了路径锚定——放行的是协议，不是文件系统。
- **验收**：

| 用例 | 期望 |
|---|---|
| AC-M06-10 | `ark://plugin/notes/index.html` | 200，返回 HTML |
| AC-M06-11 | `ark://plugin/notes/../../../secret.txt` | 403 |
| AC-M06-12 | `ark://plugin/notes/%2e%2e%2f%2e%2e%2fsecret.txt` | 403 |
| AC-M06-13 | `ark://plugin/unknown/index.html` | 404 |
| AC-M06-14 | `ark://evil/x`（host 不是 plugin） | 404 |
| AC-M06-15 | `manifest.entry = '../evil.html'` | 加载时 `E-PLUGIN-004`，不注册协议路径 |

**CL-257 插件命令执行通道（★ R1-B-14 采纳 —— v1.0 的 manifest.commands 无 run()，插件命令根本无法执行）**

manifest 声明的 `commands` 只有 `{id,title,keys}`，没有实现体。执行时主进程必须向插件 view 发一条请求，由插件自己执行。

- **新增通道**（补入 §3.0 总表）：
  ```
  plugin:cmd.invoke   M→P   { commandId: string }   → Promise<{ok:boolean; error?:string}>
  ```
- **超时**：5000ms。超时 → `E-PALETTE-004`，面板显示"命令无响应"，**不挂起 UI**。
- **实现**：`palette.register()` 为插件命令包一层 `run()`：
  ```ts
  run: () => withTimeout(view.webContents.send('plugin:cmd.invoke', { commandId: cmd.id }), 5000)
  ```
  插件 preload 收到后调用其注册的 handler，结果经 `plugin:cmd.result` 回传（带 `requestId` 关联）。
- **插件 view 已销毁** → `E-PALETTE-003`。

| 用例 | 期望 |
|---|---|
| AC-M09-07 | 插件命令正常执行 | 返回 ok，面板关闭 |
| AC-M09-08 | 插件命令 6s 不返回 | `E-PALETTE-004`，面板不挂起 |
| AC-M09-09 | 插件 view 已销毁时执行其命令 | `E-PALETTE-003` |

**CL-250 创建序列（顺序不可换，失败必须回滚）**

```ts
async function load(manifest: PluginManifest, dir: string): Promise<void> {
  // 1. 校验 manifest（M-07 validateManifest 内部完成 001..005 判定）
  //    失败 → 抛 ArkError，无资源需回滚
  try { validateManifest(manifest, dir); } catch (e) { log.err(e); return; }

  // 2. 取 Session
  const sess = session.fromPartition(`persist:plugin-${manifest.id}`);

  // 3. 装网络闸（必须在 loadURL 之前）
  ensureNetGuard(sess);

  // 4. 建视图
  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:plugin-${manifest.id}`,
      preload: PLUGIN_PRELOAD_PATH,
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });

  // ★★ 关键：立刻登记到 registry，此后任一步失败，rollback 都能拿到 view 做清理
  //    （v1.1 缺这一步，导致第 5 步失败时 rollback 的 if(e) 拿不到 entry，view 泄漏）
  const entry: PluginEntry = { view, attached: false, hooksAttached: false, channels: false };
  registry.set(manifest.id, entry);

  try {
    // 5. 挂到窗口
    win.contentView.addChildView(view);
    entry.attached = true;                                     // ★

    // 6. 布局
    view.setBounds(computePluginBounds(currentDisplay(), chromeMetrics));

    // 7. 输入钩子
    attachInputHook(view.webContents);
    entry.hooksAttached = true;                                // ★

    // 8. 身份映射（双向）
    senderMap.set(view.webContents.id, manifest.id);
    reverseSenderMap.set(manifest.id, view.webContents.id);

    // 9. IPC 通道
    registerChannels(view, manifest);
    entry.channels = true;                                     // ★

    // 10. 加载（必须用 manifest.entry）
    await view.webContents.loadURL(`ark://plugin/${manifest.id}/${manifest.entry}`);
  } catch (e) {
    // 步骤 5-9 任一失败 → 清理；步骤 10 失败 → 保留 view 供重试
    if (isLoadUrlFailure(e)) {
      showErrorCard(manifest.id, e);     // 保留 view，用户可点"重载"
    } else {
      rollback(manifest.id);
      throw new ArkError('E-PLUGIN-006', `插件 ${manifest.id} 加载失败: ${e.message}`);
    }
  }
}
```

**`rollback(id)` 必须做的事（幂等，按逆序）**：
```ts
interface PluginEntry {
  view: WebContentsView;
  attached: boolean;          // 是否已 addChildView
  hooksAttached: boolean;     // 是否已 attachInputHook
  channels: boolean;          // 是否已注册 IPC 通道
}

function rollback(pluginId: string): void {
  const e = registry.get(pluginId);
  if (!e) return;                                   // 幂等：已清理过

  if (e.channels) unregisterChannels(pluginId);     // 9
  const wcId = e.view.webContents.id;
  senderMap.delete(wcId);                           // 8
  reverseSenderMap.delete(pluginId);
  if (e.hooksAttached && !e.view.webContents.isDestroyed()) {
    detachInputHook(e.view.webContents);            // 7
  }
  if (e.attached) win.contentView.removeChildView(e.view);   // 5（只有真挂过才 remove）
  if (!e.view.webContents.isDestroyed()) e.view.webContents.close();  // 4
  registry.delete(pluginId);                        // ★ 最后删登记
}
```
- **CL-254 幂等性**：`rollback` 必须可重复调用而不抛错。关键在 `attached` / `hooksAttached` 两个布尔——**不能**无条件 `removeChildView`（未挂载的 view 会抛"不是子视图"）。
- **CL-255 泄漏断言**：`AC-M06-08` —— 故意让第 5 步抛错，断言 `registry.size` 未增加、`senderMap` 无该插件条目、`contentView.children.length` 未变。
- **注册表设计（CL-258）**：`registry: Map<string, PluginEntry>` 是唯一真相；`views` / `senderMap` / `reverseSenderMap` 都是它的派生物，**不得**独立维护可见性判断。

**CL-251 bounds 重算事件（缺一不可）**
```ts
win.on('resize', recalcAll);
screen.on('display-metrics-changed', recalcAll);
screen.on('display-added', recalcAll);
screen.on('display-removed', recalcAll);
// chromeMetrics 变化（Dock 显示/隐藏）也调 recalcAll
```
`computePluginBounds(display, chrome)` 返回**相对窗口内容**的 DIP 矩形，算式见 CL-216。

**CL-252 崩溃处理**
```ts
view.webContents.on('render-process-gone', (_e, details) => {
  if (details.reason === 'clean-exit') return;
  // 1. 记 log
  // 2. 从 contentView 移除旧 view
  // 3. 在该位置渲染错误卡片（Shell 层覆盖，或用一个专用 WebContentsView）
  // 4. 提供"重载"按钮 → host.reload(id)
});
```

**CL-253 模态层叠**
- 打开命令面板/设置时：`hideAll()` → 所有插件 view `setVisible(false)`。
- 关闭时：`restoreAll()` → 恢复之前可见的那个 view 并 `webContents.focus()`。
- **必须记录"模态前哪些 view 可见"**，不是无脑全恢复。

**错误路径**：

| 码 | 条件 | 行为 |
|---|---|---|
| `E-PLUGIN-006` | view 创建失败 | 该插件标记不可用，其他插件不受影响 |
| `E-PLUGIN-007` | loadURL 失败（file 不存在） | 显示错误卡片，含实际 URL |
| `E-PLUGIN-008` | reload 次数 > 3 次/分钟 | 停止自动重载，提示手动 |

**验收用例**：

| 用例 | 期望 | 类型 |
|---|---|---|
| AC-M06-01 | 加载两插件 | 两 view 的 `getOSProcessId()` **不相等** | 正常 |
| AC-M06-02 | kill 插件 A 的 pid | A 崩溃卡片；B 仍可 evaluate；Shell 可呼出 | 异常 |
| AC-M06-03 | 打开命令面板 | 插件 view `isVisible()===false` | 正常 |
| AC-M06-04 | 关闭命令面板 | 原可见 view 恢复可见且获焦点 | 正常 |
| AC-M06-05 | 笔记 view 内按 Ctrl+K | 命令面板打开，编辑器未插入 "k" | 异常 |
| AC-M06-06 | 窗口 resize | 所有 view bounds 重算 | 边界 |
| AC-M06-07 | 演示模式 destroy | view 从 map 移除，`webContents.isDestroyed()===true` | 正常 |
| AC-M06-08 | 故意让 `addChildView` 抛错 | `registry.size` 未增、`senderMap` 无该 id、`children.length` 未变（CL-255 泄漏断言） | 异常 |
| AC-M06-09 | `rollback` 连调两次 | 第二次不抛错（CL-254 幂等） | 异常 |

---

### M-07 gateway

**职责**：manifest 校验；调用方身份认定；能力与路径判定；审计日志。
**不负责**：网络白名单（M-08）、业务能力实现。

```ts
export interface GatewayApi {
  validateManifest(raw: unknown, dir: string): PluginManifest;   // 抛 ArkError
  registerChannels(view: WebContentsView, manifest: PluginManifest): void;
  resolveCaller(senderId: number, expectedPluginId: string): string; // 返 pluginId 或抛
  checkPath(manifest: PluginManifest, kind: 'read'|'write', absPath: string): void;
  audit(entry: AuditEntry): void;
}
```

**CL-260 manifest zod schema**：见 §4.3。必填 `id/name/version/entry`；`permissions` 可缺省（= 无能力）。

**CL-260b 五条 manifest 错误码的条件与文案（R1-B-10 采纳 —— v1.0 只说"见 PLAN"，SDS 自身无法实现）**

| 码 | 触发条件（按此顺序判定，一个 manifest 只报第一个命中的码） | message 模板 |
|---|---|---|
| `E-PLUGIN-001` | manifest 文件不存在 / 读不出 / `JSON.parse` 抛错 | `manifest 无法读取: ${absPath} (${reason})` |
| `E-PLUGIN-002` | `JSON.parse` 成功但 zod `safeParse` 失败；**或** glob 含绝对路径字面量；**或** glob 无静态前缀 | `manifest 校验失败: ${zodIssues.map(i=>i.path.join('.')+':'+i.message).join('; ')}` |
| `E-PLUGIN-003` | `id` 是字符串但语义非法（**在 zod 前优先判定，见下方 ★ R5-01**）；**或** zod 通过且该 id 已被另一目录占用 | `plugin id 非法或重复: ${id}` |
| `E-PLUGIN-004` | `path.resolve(pluginDir, entry)` 不在 `pluginDir` 之下 | `entry 越出插件目录: ${entry}` |
| `E-PLUGIN-005` | `minAppVersion` 存在且**严格大于**当前 app 版本 | `需要 ARK >= ${minAppVersion}，当前 ${current}` |

**判定顺序固定**：001（读文件）→ 002（schema/glob 合法性）→ 003（id 语义）→ 004（entry 越界）→ 005（版本）。

**★ R5-01 修正（T-002 实施发现 —— v1.2 的 003 按字面不可达）**

v1.2 的 003 写「zod 通过但 `id` 不匹配 `^[a-z0-9]+(\.[a-z0-9-]+)+$`」，但 §4.3 的 `PluginManifestSchema` 里 `id` 字段**带着同一个正则**：

```ts
id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
```

结果：非法 id 必然先在 `safeParse` 阶段失败 → 归 `E-PLUGIN-002`，**003 的第一个分支永远不可达**，AC-M07-16（`id: "Bad_ID"`）必红。

**修法（保留 schema 正则，在 schema 前加窄范围语义判定）**：CL-260b 的外部错误码顺序仍为 001→002→003→004→005；但对 `id` 字段使用以下优先规则，确保 AC-M07-16 的错误码可达：

```ts
// M-07 validateManifest：JSON.parse 成功后、zod safeParse 之前
// 仅当 raw 是对象且 id 是字符串时，先执行 id 语义判断。
// 非字符串 id（如 123/null/缺失）仍交给 zod，归 E-PLUGIN-002。
const ID_SEMANTIC = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
if (typeof raw === 'object' && raw !== null && 'id' in raw) {
  const id = (raw as { id: unknown }).id;
  if (typeof id === 'string' && !ID_SEMANTIC.test(id)) {
    throw new ArkError('E-PLUGIN-003', `plugin id 非法或重复: ${id}`);
  }
}
const parsed = PluginManifestSchema.safeParse(raw);
if (!parsed.success) throw new ArkError('E-PLUGIN-002', ...);
```

§4.3 的 schema 保留语义正则作为第二道校验：

```ts
id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
```

这样：
- `id: "Bad_ID"` → 字符串语义预检 → **003** ✅（在 zod 前返回）
- `id: ""` → 字符串语义预检 → **003**（空字符串属于语义非法）
- `id: 123` / `id` 缺失 → 预检跳过，zod → **002** ✅
- schema 在语义预检之后仍保留正则，防止其它入口绕过 `validateManifest` 直接使用 schema。

**安全理由**：`PluginManifestSchema` 仍然拒绝任何不匹配 id 的值；M-07 只负责把 SDS 规定的 `Bad_ID` 错误码映射到 003。所有生产入口必须调用 `validateManifest`，不直接把 `safeParse` 错误向外暴露。

| 用例 | 期望 |
|---|---|
| AC-M07-14 | manifest 文件不存在 | `E-PLUGIN-001` |
| AC-M07-15 | `version: "1.0"`（两段） | `E-PLUGIN-002` |
| AC-M07-16 | `id: "Bad_ID"` | `E-PLUGIN-003` |

**`minAppVersion` 比较规则**：
- 只支持**三段式精确版本**（`^\d+\.\d+\.\d+$`），**不支持** `^`、`~`、范围、`*`。
- 逐段数字比较，`current < minAppVersion` → `E-PLUGIN-005`。
- 非三段式 → 归入 `E-PLUGIN-002`（schema 层拒绝）。

| 用例 | 期望 |
|---|---|
| AC-M07-14 | manifest 文件不存在 | `E-PLUGIN-001` |
| AC-M07-15 | `version: "1.0"`（两段） | `E-PLUGIN-002` |
| AC-M07-16 | `id: "Bad_ID"` | `E-PLUGIN-003` |
| AC-M07-17 | `minAppVersion: "0.0.1"` | 正常加载 |
| AC-M07-18 | `minAppVersion: "99.0.0"` | `E-PLUGIN-005` |

**CL-261 通道命名（防串号）**
```
plugin:<pluginId>:fs.read
plugin:<pluginId>:fs.write
plugin:<pluginId>:db.query
plugin:<pluginId>:db.exec
plugin:<pluginId>:ai.chat
```
每个 handler 首行必须：
```ts
const caller = senderMap.get(event.sender.id);
if (caller !== pluginId) return err('E-PERM-002');
if (event.senderFrame !== event.sender.mainFrame) return err('E-PERM-003');  // iframe 子帧拒绝
```

**CL-262 glob 与 realpath**

**`<DATA>` 展开时机（R1-B-09 采纳 —— v1.0 未定，是越权根因）**

- `manifest.permissions.fs.*` 里的 glob **必须**用字面量 `<DATA>` 作为根占位。
- **在 `validateManifest()` 返回前一次性替换**：`g.replace('<DATA>', dataRoot)`，然后对结果做 `path.resolve`（消除尾分隔符、`.`、`..`）。
- 替换**只做一次**，结果缓存在 `manifest.__resolved`（内部字段，不写回磁盘）。
- manifest 中**出现绝对路径字面量**（`/^[A-Za-z]:\\/` 或 `^/`）→ `E-PLUGIN-002`。
- manifest 中**未出现 `<DATA>` 且不是相对路径** → `E-PLUGIN-002`。

**`staticPrefix` 的尾分隔符规范化（R1-B-09 的第二处坑）**

v1.0 写 `real.startsWith(realPrefix + sep)`，若 `realPrefix` 已以 `sep` 结尾（如 `C:\data\ok\`），拼出 `C:\data\ok\\` 恒不匹配 → **全部 deny**。修正：

```ts
function stripTrailingSep(p: string): string {
  return p.length > 1 && (p.endsWith('/') || p.endsWith('\\')) ? p.slice(0, -1) : p;
}
function isUnder(real: string, realPrefix: string): boolean {
  const p = stripTrailingSep(realPrefix);
  return real === p || real.startsWith(p + path.sep);
}
```

**必须补分隔符（R1-B-09 的越权绕过）**

朴素 `real.startsWith(realPrefix)` 会让 `C:\data\ok-evil\x` 通过 `C:\data\ok/**`。上面的 `isUnder` 加了 `+ path.sep` 后，`C:\data\ok-evil\x` 不再匹配 `C:\data\ok`。**AC-M07-11 专门测这一条**（v1.0 的 AC-M07-01 恰好会照绿通过这个绕过）。

**glob 语法（只支持这三种，实现为约 40 行纯函数 `matchGlob(pattern, absPath)`）**：

| 记号 | 含义 | 例 |
|---|---|---|
| `*` | 匹配任意字符，**不跨**路径分隔符 | `<DATA>/notes/*.md` 匹配 `<DATA>/notes/a.md`，不匹配 `<DATA>/notes/x/a.md` |
| `**` | 匹配任意层级（含零层） | `<DATA>/**` 匹配 `<DATA>` 下任意深度 |
| `?` | 匹配恰好一个非分隔符字符 | `<DATA>/a?.md` |

编译方式：转义正则元字符（`. + ( ) [ ] { } ^ $ | \`），`**` → `.*`，`*` → `[^/\\]*`，`?` → `[^/\\]`。
- **路径比较前必须 `path.resolve`**；Windows 下两边 `toLowerCase()` 后比较（大小写不敏感）。

**静态前缀（`staticPrefix(pattern)`）**：从 pattern 左端取到**第一个**通配符之前，再截到最后一个分隔符为止，最后 `stripTrailingSep`。
- `<DATA>/notes/**` → `<DATA>/notes`
- `<DATA>/*.md` → `<DATA>`
- pattern 以通配符开头（无静态前缀）→ **判定为非法 manifest**（`E-PLUGIN-002`），因为无法 realpath 锚定。

**判定流程（`checkPath`）**：
```
1. absPath = path.resolve(pluginDir, arg)
2. real    = fs.realpathSync(absPath)      // 不存在 → E-FS-001
3. st      = fs.statSync(real)             // 非普通文件 → E-FS-002
4. for each resolved glob g in permissions.fs[kind]:
     prefix     = staticPrefix(g)
     realPrefix = fs.realpathSync(prefix)  // 前缀不存在 → 跳过该 g
     if (isUnder(real, realPrefix) && matchGlob(g, real)) → allow
5. 否则 deny → E-PERM-001 + 审计
```
- **`..` 越界**：`path.resolve` 规范化 + `isUnder` 带分隔符二次拦截 + `realpath` 解析符号链接，三重。

**CL-263 审计日志**
- 路径：`<DATA_ROOT>/logs/audit-YYYYMMDD.ndjson`（同一天写满 10MB → `audit-YYYYMMDD.1.ndjson`，序号递增）。
- 保留：全局最新 5 个文件（按 mtime）。
- 每行字段（**固定**）：
```json
{"ts":"2026-10-31T01:00:00.000Z","level":"warn","task_id":"T-006","pluginId":"com.x","api":"fs.read","decision":"deny","code":"E-PERM-001","argsHash":"sha256:abcd...","path":"<DATA>/x.txt"}
```
- `argsHash` = `sha256(JSON.stringify(args))` 前 16 位。
- **日志中的路径必须先过脱敏（M-11 的 `redact()`）**。

**错误路径**：

| 码 | 条件 |
|---|---|
| `E-PERM-001` | 能力未声明 / 路径不在 glob 内 / 越界 |
| `E-PERM-002` | senderMap 身份不符 |
| `E-PERM-003` | 非主帧调用 |
| `E-FS-001` | 目标路径不存在（`realpathSync` 抛 ENOENT） |
| `E-FS-002` | 目标路径存在但不是普通文件（是目录、符号链接指向越界、或设备文件）→ 拒绝，**不**回退到 glob 再判 |
| `E-PLUGIN-001` | manifest 文件缺失或 JSON 解析失败 |
| `E-PLUGIN-002` | 必填字段缺失或类型错（zod 校验失败） |
| `E-PLUGIN-003` | `id` 格式非法（不匹配 `^[a-z0-9]+(\.[a-z0-9-]+)+$`）**或** id 已被另一个目录占用（重复） |
| `E-PLUGIN-004` | `entry` 解析后越出插件目录 |
| `E-PLUGIN-005` | `minAppVersion` 高于当前 app 版本 |

**验收用例**：

| 用例 | 期望 | 类型 |
|---|---|---|
| AC-M07-01 | `evil-fixture` 声明 `fs.read: ["<DATA>/ok/**"]` 却读 `<DATA>/secret/x` | `E-PERM-001` + 审计 deny | 异常 |
| AC-M07-02 | `no-perm` 未声明 fs | `E-PERM-001`（**不是** TypeError） | 异常 |
| AC-M07-03 | 插件 A 调 `plugin:B:fs.read` | `E-PERM-002` | 异常 |
| AC-M07-04 | iframe 子帧调任意通道 | `E-PERM-003` | 异常 |
| AC-M07-05 | manifest 缺 `id` | `E-PLUGIN-002`，跳过加载，不崩 | 异常 |
| AC-M07-06 | manifest `entry` 为 `../../evil.html` | `E-PLUGIN-004` | 异常 |
| AC-M07-07 | 审计日志写入 6 个文件后 | 最旧的被删除，保留 5 个 | 边界 |
| AC-M07-08 | 两个目录声明同一 `id` | `E-PLUGIN-003`，只加载先扫描到的 | 异常 |
| AC-M07-09 | 请求路径是目录而非文件 | `E-FS-002`，不读 | 异常 |
| AC-M07-10 | 请求路径是符号链接指向 glob 外 | `E-FS-002`（realpath 后越界） | 异常 |
| **AC-M07-11** | **`<DATA>/ok-evil/x` 对各自 glob `<DATA>/ok/**`** | **`E-PERM-001`（★ v1.0 的朴素 startsWith 会通过，是真实越权）** | 安全 |
| **AC-M07-12** | glob 是 `<DATA>/notes/`（带尾分隔符） | 能正常匹配 `<DATA>/notes/a.md`（CL-262 的 stripTrailingSep） | 边界 |
| **AC-M07-13** | manifest 写绝对路径 `F:\gal\x` | `E-PLUGIN-002` | 异常 |

---

### M-08 netguard

**职责**：对每个 Session 安装出网白名单；维护 allowlist；审计拦截。
**不负责**：CSP（在 HTML/renderer 侧配置）、AI 请求本身（M-10）。

```ts
export interface NetGuardApi {
  ensure(sess: Electron.Session): void;
  setAllowlist(hosts: string[]): void;   // 校验后同步到内存 Set
  getAllowlist(): string[];
}
```

**CL-270 白名单规格**
- 存储：`ark.db` 的 `settings` 表，key `net.allowlist`，值 `string[]`。
- 校验：只允许 `https` 语义的 host（不含协议、不含路径、不含通配）；拒绝 IP 字面量（正则 `^\d+\.\d+\.\d+\.\d+$` 与 IPv6）。非法 → `E-NET-002`。
- 生效：`setAllowlist` 后同步更新内存 `Set`，**下一次请求立即生效**，无需重启。
- 默认：`[]`。

**CL-271 拦截逻辑（★ v1.2 修正 —— v1.1 的 `onBeforeRedirect` 取消写法是空操作）**

> **v1.1 的错误**：写了 `sess.webRequest.onBeforeRedirect((d) => { d.cancel = true })`，还配注释"语义不同不可混用"。实际上 Electron 的 `onBeforeRedirect` **只有监听语义**——listener 只收到 `details`，无 callback，`details` 上无 `cancel` 字段。赋值是空操作，**重定向拦截根本不生效**，AC-M08-07 必红。
>
> **正确原理**：`onBeforeRequest` 对**每一次**网络请求触发，**包括重定向后的新请求**。因此拦截重定向不需要 `onBeforeRedirect`，只需 `onBeforeRequest` 的判定对重定向目标同样生效即可（它天然生效，因为新请求 URL 就是重定向目标）。

```ts
// src/main/netguard.ts
const allow = new Set<string>();
const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$|:/;

export function ensure(sess: Electron.Session): void {
  // ★ 唯一拦截点。重定向后的新请求会再次进入这里，因此不需要额外拦截器。
  sess.webRequest.onBeforeRequest((details, cb) => {
    if (isInternal(details.url)) return cb({ cancel: false });
    const host = safeHost(details.url);
    if (host && allow.has(host)) return cb({ cancel: false });
    auditDeny(details.url);
    cb({ cancel: true });
  });

  // 仅审计可观测性，不承担拦截职责
  sess.webRequest.onBeforeRedirect((details) => {
    audit.log({ api: 'net', decision: 'info', event: 'redirect',
                from: redact(details.url, REDACT_CTX),
                to: redact(details.redirectURL, REDACT_CTX) });
  });
}

function isInternal(url: string): boolean {
  return url.startsWith('file://') || url.startsWith('ark://') ||
         url.startsWith('devtools://') || url.startsWith('chrome-extension://');
}
function safeHost(url: string): string | null {
  try { return new URL(url).host; } catch { return null; }
}
function auditDeny(url: string): void {
  audit.log({ api: 'net', decision: 'deny', code: 'E-NET-001', url: redact(url, REDACT_CTX) });
}

export function setAllowlist(hosts: string[]): void {
  for (const h of hosts) {
    if (!h || IP_LITERAL.test(h) || h.includes('/') || h.includes('*')) {
      throw new ArkError('E-NET-002', `invalid allowlist host: ${h}`);
    }
  }
  allow.clear(); for (const h of hosts) allow.add(h);
  // 持久化由调用方（ipc.ts）写 settings，netguard 只管内存
}
export function getAllowlist(): string[] { return [...allow]; }
```

- `onBeforeRequest` 的 `cb({cancel:true})` 与 `onBeforeRedirect` 的 `details.cancel = true` **语义不同**，实现时不可混用。
- 白名单**默认空**。AI 端点由用户在设置页填写后经 `net:setAllowlist` 加入。
- **禁止**任何 `if (!app.isPackaged) return` 之类的开发放行分支（R1-B-11 指出的"我会加 dev 后门"）。回归用例 AC-M08-08 专门检查：打包与开发两种模式下 non-allowlisted 请求都被 cancel。

**CL-272 调用点（缺一不可）**
| # | Session | 时机 |
|---|---|---|
| 1 | `session.defaultSession` | `whenReady` 后、创建窗口前 |
| 2 | `session.fromPartition('persist:plugin:<id>')` | **每个插件 view 创建之前**（M-06 步骤 3） |
| 3 | 同上 | 演示模式重建 view 时（重新走 M-06） |

**错误路径**：

| 码 | 条件 |
|---|---|
| `E-NET-001` | 请求 host 不在白名单（审计 deny） |
| `E-NET-002` | `setAllowlist` 收到非法 host（含 IP/协议/通配） |

**验收用例**：

| 用例 | 期望 | 类型 |
|---|---|---|
| AC-M08-01 | Shell 内 `fetch('https://example.com')` | reject（CSP 拦）+ 审计**无** `E-NET-001` | 正常 |
| AC-M08-02 | 主进程 `net.request('https://example.com')` | cancel + 审计**有** `E-NET-001` | 正常 |
| AC-M08-03 | 插件 partition 内（CSP 临时关闭的 fixture）请求 | cancel + 审计有记录 | 异常 |
| AC-M08-04 | 白名单加 `api.deepseek.com` 后请求该域 | 放行 | 正常 |
| AC-M08-05 | `setAllowlist(['http://x.com'])` | `E-NET-002`，白名单不变 | 异常 |
| AC-M08-06 | `setAllowlist(['1.2.3.4'])` | `E-NET-002` | 异常 |
| AC-M08-07 | 白名单 `a.com` 上的资源 302 跳到 `evil.com` | **`onBeforeRequest` 对重定向后的 `evil.com` 请求 cancel**（第二次进入拦截器）+ 审计有 `E-NET-001`（url 为 evil.com）+ 审计有 `event:'redirect'` 记录 | 异常 |
| AC-M08-08 | 开发模式（`!app.isPackaged`）下请求非白名单域 | **同样** cancel（无 dev 后门） | 安全 |
| AC-M08-09 | `file://` 与 `ark://` 请求 | 放行（`isInternal`） | 正常 |
| AC-M08-10 | `setAllowlist(['*.x.com'])` | `E-NET-002`（不接受通配） | 异常 |

---

### M-09 palette

**职责**：命令注册表；模糊匹配与排序；执行；使用频率统计。
**不负责**：面板 UI 渲染（renderer 层组件）。

```ts
export interface Command {
  id: string;            // 'notes.new'
  title: string;         // '新建笔记'
  subtitle?: string;
  keywords?: string[];
  keys?: string;
  source: 'shell' | 'plugin';
  pluginId?: string;
  run(): Promise<void>;
}

export interface PaletteApi {
  register(cmd: Command): void;
  unregisterSource(sourceId: string): void;
  search(query: string, limit: number): Command[];
  execute(id: string): Promise<void>;
}
```

**CL-280 评分算法（无库，纯函数 `score(cmd, q): number | null`，可单测）**

`q` 先规范化：`q = query.trim().toLowerCase()`；空则返回 `null`（表示"不过滤，全量按频率排序"）。

```
候选 haystacks = [title, subtitle ?? '', ...(keywords ?? [])].map(toLowerCase)

对每个 haystack 计算 s，取最大：
  s = null
  idx = haystack.indexOf(q)
  if idx >= 0:
     s = 100 + min(q.length, 20)          // 命中即 100 起，长度越长越信（上限 +20）
     if idx === 0: s += 30                // 前缀命中额外加成
     if haystack === q: s += 50           // 完全相等再额外
  else:
     tokens = tokenize(q)                 // CL-281
     if tokens.every(t => haystack.includes(t)): s = 30 + tokens.length
     else if isSubsequence(q, haystack):  s = 10 + (连续命中字节数 / haystack.length) * 5
     // isSubsequence: 双指针，q 的每个字符按序在 haystack 中出现即通过

finalScore = max(所有 haystack 的 s)；全为 null → 该命令不匹配，排除
```

**CL-281 分词 `tokenize(s)`**：CJK 按单字切；拉丁/数字按整词切（`/[a-z0-9]+/`）；丢弃标点。返回小写数组。

**排序键（确定性，必须）**：
```
sort by [score desc, usageCount desc, id asc]
```
- `id asc` 是字典序字符串比较（不是数值），保证同分同频时结果**恒定**（可重复验证）。
- `usageCount` 来自 `command_usage` 表，测试可注入固定表。

**CL-282 性能**：1000 条命令内 `search` P95 < 16ms。
- **测法（可执行）**：单测里生成 1000 条合成命令（`id: cmd-0000..0999`，`title: 命令0000..0999` + 随机中文关键词），循环调用 `search('命令', 20)` 100 次，用 `performance.now()` 记录每次耗时，取排序后第 95 百分位，断言 `< 16`。
- 首次调用前预热 1 次（排除 JIT）。

**CL-283 Ctrl+K 挂载**
- `attachInputHook(wc)` 必须被调用在：主 renderer 的 webContents + 每个插件 view 的 webContents（M-06 步骤 7）。
- handler 内 `if (!win.isVisible()) return;`，命中则 `preventDefault()` + `openPalette()`。

**错误路径**：

| 码 | 条件 | 行为 |
|---|---|---|
| `E-PALETTE-001` | 命令 id 重复注册 | 后者覆盖，记 warn |
| `E-PALETTE-002` | 命令 run() 抛错 | 面板显示错误 toast，记 log，**面板不关闭** |
| `E-PALETTE-003` | 命令所属插件已卸载或 view 已销毁 | 执行时返回"插件不可用"，从列表移除 |
| `E-PALETTE-004` | 插件命令 5000ms 未返回 | 超时，面板显示"命令无响应"，**不挂起 UI** |

**验收用例**：

| 用例 | 期望 | 类型 |
|---|---|---|
| AC-M09-01 | 1000 条命令，查询 100 次 | P95 < 16ms | 正常 |
| AC-M09-02 | 输入「新建」，fixture 数据 | 首项 `id === 'fixture.new'` | 正常 |
| AC-M09-03 | 输入「新建」 | 首项 `id === 'notes.new'`（M8 后） | 正常 |
| AC-M09-04 | 同分两条 | 按 id 字典序，结果稳定（跑 10 次一致） | 边界 |
| AC-M09-05 | 命令 run 抛错 | toast 显示，面板仍开 | 异常 |
| AC-M09-06 | 笔记 view 聚焦按 Ctrl+K | 面板打开，编辑器无 "k" | 异常 |

---

### M-10 ai

**职责**：密钥加密存储；`chat` 调用；错误码映射；超时与重试。
**不负责**：UI 配置界面（renderer 层）。

```ts
export interface AiApi {
  setKey(key: string): Promise<void>;        // 校验 + safeStorage 加密 + 落盘
  hasKey(): boolean;
  clearKey(): void;
  chat(req: { messages: ChatMessage[]; model: string }): Promise<ChatResult>;
}
export type ChatResult = { ok: true; content: string } | { ok: false; code: AiErrorCode };
```

**CL-290 密钥存储**
- **调用时机**：只在 `app.whenReady()` 之后（`safeStorage` 依赖 app ready）。
- 流程：
```ts
if (!safeStorage.isEncryptionAvailable()) throw ArkError('E-AI-008');  // 拒绝保存，绝不落明文
if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) throw ArkError('E-AI-009');
const enc = safeStorage.encryptString(key);
fs.writeFileSync(path.join(dataRoot,'secrets','ai.bin'), enc, { mode: 0o600 });
```
- 读取：`safeStorage.decryptString(buf)`，失败 → `E-AI-002`。
- **禁止**：任何硬编码密钥常量；任何明文落盘；把 key 传给 renderer。

**CL-291 `chat` 调用**
- 只在主进程实现。preload 暴露 `ark.ai.chat({messages, model})`。
- 端点：`settings.ai.baseUrl`（默认 `https://api.deepseek.com`）+ `/v1/chat/completions`。
- 请求体：`{ model, messages, stream: false }`。
- 超时 30000ms（`AbortController`）。
- 重试：仅 `E-AI-005`（网络）与 `E-AI-007`（5xx）各重试 **1 次**，指数退避 500ms。
- 返回值**不含** key、不含原始 header、不含上游 body 全量（只取 `choices[0].message.content`）。

**CL-292 错误码映射**

| 码 | 触发 | 重试 |
|---|---|---|
| `E-AI-001` | 未配置 Key（`hasKey()===false`） | 否 |
| `E-AI-002` | `decryptString` 抛错（换机器/换用户） | 否 |
| `E-AI-003` | HTTP 401 | 否 |
| `E-AI-004` | HTTP 429 | 否 |
| `E-AI-005` | 网络不可达（ECONNREFUSED/ENOTFOUND/断网） | 1 次 |
| `E-AI-006` | 超时（>30s） | 否 |
| `E-AI-007` | HTTP 5xx，重试后仍失败 | 已重试 |
| `E-AI-008` | `isEncryptionAvailable()===false` | 否 |
| `E-AI-009` | Key 格式非法（不匹配 `^sk-[A-Za-z0-9_-]{16,}$`） | 否 |

**验收用例**（每条一个 mock server 用例）：

| 用例 | 输入 | 期望 | 类型 |
|---|---|---|---|
| AC-M10-01 | 正常 200 | `{ok:true, content}`，请求体 `{model,messages,stream:false}` | 正常 |
| AC-M10-02 | 无 Key | `E-AI-001` | 异常 |
| AC-M10-03 | `decryptString` mock 抛错 | `E-AI-002`，Shell 不崩 | 异常 |
| AC-M10-04 | 401 | `E-AI-003` | 异常 |
| AC-M10-05 | 429 | `E-AI-004` | 异常 |
| AC-M10-06 | ECONNREFUSED | `E-AI-005`，共 2 次请求 | 异常 |
| AC-M10-07 | 永不响应 | `E-AI-006`（30s） | 异常 |
| AC-M10-08 | 500 两次 | `E-AI-007`，共 2 次请求 | 异常 |
| AC-M10-09 | `isEncryptionAvailable` false | `E-AI-008`，**无文件写入** | 异常 |
| AC-M10-10 | Key=`abc` | `E-AI-009` | 异常 |
| AC-M10-11 | 落盘后 grep `sk-` | 0 命中 | 正常 |
| AC-M10-12 | 跨用户解密（人工） | `E-AI-002` | 异常 |

---

### M-11 privacy

**职责**：防截屏开关；演示模式；路径脱敏。
**不负责**：窗口参数（M-02）、插件销毁（M-06）。

```ts
export interface PrivacyApi {
  setContentProtection(on: boolean): void;
  setDemoMode(on: boolean): Promise<void>;
}
// 注意：redact 不在这里，它是 shared/redact.ts 的纯函数（CL-302）
```

**CL-300 防截屏**
- `win.setContentProtection(on)`。
- 开启时**同时**把 `--ark-surface-blur` 降为 `0px`（避免分层窗口 + blur 的已知冲突）。
- 持久化到 settings `privacy.contentProtection`。
- **验收只能人工**（`capturePage` 绕开 WDA，见 TECH-VERIFY C-05）。
- README 必须写：挡 DWM/WDA 与 DXGI 复制；不挡采集卡与手机拍屏；透明窗口下可能静默失效。

**CL-301 演示模式**
```
进入：
  1. await flushAllPlugins({timeoutMs:1000})
  2. 对所有 manifest.ui.private === true 的插件执行 host.destroy(pluginId)
  3. 从命令面板移除其命令（unregisterSource）
  4. 打开 redact 全局开关
  5. 持久化 settings privacy.demoMode = true
退出：
  1. 关闭 redact 开关
  2. 逐个重新加载私密插件（走完整 M-06 创建序列）
     单个失败 → 记 E-PLUGIN-006/007，该插件显示"不可用"卡片，其余继续
     ★ 不因一个插件失败而中断整个退出流程
  3. 重新注册命令（只注册加载成功的）
  4. 持久化 privacy.demoMode = false
```
- **CL-303 演示模式下的失败容忍**：退出演示模式时，用 `Promise.allSettled`，失败插件记录到 `demoModeFailedPlugins`，Shell 顶部显示一条提示"N 个插件未能恢复"。

**CL-302 `redact(text, ctx): string`（★ v1.1 改为 shared/ 纯函数 + 注入上下文，消除 M-07→M-11 循环依赖）**

**R1-B-13 指出的问题**：v1.0 让 M-07 gateway 调 M-11 privacy 的 `redact`，而 M-11 又依赖 M-06 host、M-06 又依赖 M-07 → 循环。实施者的自然反应是"复制一份 redact 实现"，结果审计日志用了一份不完整的脱敏（漏真实用户名），而测试全绿。

**修法：`redact` 放在 `src/shared/redact.ts`，无任何 import，上下文靠参数注入。**

```ts
// src/shared/redact.ts —— 纯函数，零依赖
export interface RedactCtx { dataRoot: string; username: string }

export function redact(text: string, ctx: RedactCtx): string {
  if (!text) return text;
  let s = text;

  // 1. 数据根（先替换最长者，避免被后续规则切碎）
  if (ctx.dataRoot) s = s.split(ctx.dataRoot).join('<DATA>');

  // 2. 用户名（Windows 与 POSIX 两种形态）→ 直接替换成 <USER>，不带盘符前缀
  if (ctx.username) {
    s = s.split(`C:\\Users\\${ctx.username}`).join('<USER>');
    s = s.split(`/Users/${ctx.username}`).join('<USER>');
    s = s.split(`/home/${ctx.username}`).join('<USER>');
  }

  // 3. IPv4
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<IP>');

  // 4. 兜底：剩余任意盘符绝对路径 → <PATH>
  //    ★ 前视守卫必须加，否则已生成的标记会被再吞一次
  s = s.replace(/(?<![<\w])[A-Za-z]:\\[^\s"']+/g, '<PATH>');

  return s;
}
```

**★ R4-01 修正（v1.2 抽检发现 —— v1.1 的写法让第 2 步永久失效）**

v1.1 第 2 步生成 `C:\Users\<USER>`，而第 4 步的 `\b[A-Za-z]:\\[^\s"']+` 会把这个结果**整体再替换成 `<PATH>`**。实测：

```
输入: C:\Users\16563\AppData\x.log
v1.1 输出: <PATH>          ← <USER> 永远不会出现，AC-M11-01 必红
```

修法两条（缺一不可）：
1. 第 2 步**直接替换成 `<USER>`**（不带 `C:\Users\` 前缀），盘符正则根本匹配不到它。
2. 第 4 步加 `(?<![<\w])` 守卫，避免匹配 `<` 或字母/数字之后的位置。

**为什么不降低安全性**：两种写法的输出都**不含真实用户名**，安全等价。但 `<USER>` 是**可辨识的语义标记**（一眼看出"这里原来是用户名"），而 `<PATH>` 会让人误以为是任意路径。审计可读性有实质差别。

- `ctx` 由调用方构造一次并缓存：`const REDACT_CTX = { dataRoot, username: os.userInfo().username }`（在 M-01 bootstrap 里生成，通过参数或模块级常量传给 M-07/M-11）。
- **M-11 的 `PrivacyApi` 只剩两个方法**：`setContentProtection`、`setDemoMode`。`redact` 不再是 M-11 的一部分。
- **依赖方向**：`shared/redact.ts` ← M-07；`shared/redact.ts` ← M-11。**无环**。

**验收用例（脱敏，并入 M-07 的用例表）**：

| 用例 | 期望 |
|---|---|
| `redact('C:\\Users\\16563\\AppData\\x.log', ctx)` | `<USER>\\AppData\\x.log`（含 `<USER>`，**不含** `<PATH>`） |
| `redact('<dataRoot>\\a\\b', ctx)` | 含 `<DATA>` |
| `redact('192.168.1.5', ctx)` | `<IP>` |
| `redact('D:\\other\\thing.txt', ctx)` | `<PATH>` |
| `redact('F:\\gal\\workstation\\data\\a.db from 10.0.0.1 by C:\\Users\\16563', ctx)` | 同时含 `<DATA>` / `<IP>` / `<USER>` |
| 审计日志落盘后 grep 真实用户名 | 0 命中 |

**验收用例**：

| 用例 | 期望 | 类型 |
|---|---|---|
| AC-M11-01 | `redact('C:\\Users\\16563\\x')` | `<USER>\\x`（或含 `<USER>`） | 正常 |
| AC-M11-02 | `redact('F:\\gal\\workstation\\data\\a')` | 含 `<DATA>` | 正常 |
| AC-M11-03 | 进入演示模式 | 私密插件 view `isDestroyed()===true`；命令面板不含其命令 | 正常 |
| AC-M11-04 | 退出演示模式 | 私密插件重新加载，内容与进入前一致 | 正常 |
| AC-M11-05 | 进入演示模式时笔记有未保存内容 | flush 被调用，内容不丢 | 异常 |
| AC-M11-06 | 防截屏开启 | `--ark-surface-blur === '0px'` | 正常 |

---

### M-12 notes（第一插件）

**职责**：笔记 CRUD；bigram 索引维护；两阶段检索；双链补全与反链；自动保存。
**不负责**：编辑器 UI 细节（Monaco 配置属 renderer 层）、通用权限（M-07）。

**CL-310 表结构（DDL，逐字照抄）**

```sql
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  bigram_all TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  bigram_all, content='notes', content_rowid='id', tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, bigram_all) VALUES (new.id, new.bigram_all);
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, bigram_all) VALUES ('delete', old.id, old.bigram_all);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, bigram_all) VALUES ('delete', old.id, old.bigram_all);
  INSERT INTO notes_fts(rowid, bigram_all) VALUES (new.id, new.bigram_all);
END;
CREATE TABLE IF NOT EXISTS links (
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_id);
```

**CL-311 写语句白名单（★ 关键，实测依据 TECH-VERIFY C-09）**

| 场景 | 允许的语句 | 禁止 |
|---|---|---|
| 新建/更新 | `INSERT ... ON CONFLICT(id) DO UPDATE SET ...` | `INSERT OR REPLACE`（不触发 delete 触发器 → FTS 残留旧词） |
| 删除 | `DELETE FROM notes WHERE id=?` | — |
| 批量导入 | 先 `DELETE FROM notes` 再逐条 `INSERT` | `INSERT OR IGNORE`（冲突时不更新 FTS） |

**唯一的 upsert 语句**：
```sql
INSERT INTO notes(id, title, body, updated_at, bigram_all)
VALUES(@id, @title, @body, @updated_at, @bigram_all)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, body=excluded.body,
  updated_at=excluded.updated_at, bigram_all=excluded.bigram_all;
```

**CL-311b 机器化拦截（不靠人记，必须实现）**

ESLint 自定义规则 `ark/no-replace-on-notes`：
- 匹配 `CallExpression` 且 `callee.property.name` 为 `run`/`get`/`all`/`prepare` 的实参字符串、
  或 `db.exec(...)` 的实参字符串。
- 若字符串**同时**含 `INSERT OR REPLACE`（或 `REPLACE INTO`）**且**含 `notes`，或含
  `INSERT OR IGNORE` 且含 `notes` → 报错 `ARK-SQL-1`。
- 作用域：`src/main/**`、`src/renderer/plugins/**`。
- 负例夹具：`tests/fixtures/sql-negative/replace.ts`，含 2 处违规 → `pnpm lint:fixtures` 断言恰好 2 条 `ARK-SQL-1`。
- **运行时兜底**：`M-12` 的 `save()` 内对 SQL 做一次断言（开发期）：
  ```ts
  if (process.env.NODE_ENV !== 'production' && /INSERT\s+OR\s+(REPLACE|IGNORE)/i.test(sql)) {
    throw new ArkError('E-DB-013', 'forbidden statement on notes');
  }
  ```

**CL-312 `planGrams(s): GramPlan`（★ v1.1 重写：v1.0 伪码与样例自相矛盾）**

> v1.0 的伪码把每个 CJK 字符单独 push 成 token，于是 `allCJK(t) && len(t)>=2` 分支**永远不成立**（bigram 是死代码），实际输出 `["工","作","站"]`，与第 1179 行样例和 CL-317 的 8 条期望全部冲突。照伪码实现，AC-M12-01 必红。以下为正确版本。

```ts
export interface GramRun {
  kind: 'cjk' | 'latin';
  source: string;        // run 的原文（cjk = 原 CJK 子串；latin = 小写化整词）
  grams: string[];       // cjk: 相邻 2-gram（长度 1 时退化为单字）；latin: [整词]
}
export interface GramPlan {
  runs: GramRun[];
  isEmpty: boolean;
}
```

**第一步：切成 run（不是切成单字）**
```
runs = []; cur = null
for ch of s:
  if CJK(ch):
     if cur?.kind === 'cjk': cur.text += ch
     else { flush(cur); cur = {kind:'cjk', text: ch} }
  elif isAlnum(ch):
     if cur?.kind === 'latin': cur.text += ch
     else { flush(cur); cur = {kind:'latin', text: ch} }
  else:
     flush(cur); cur = null          // 空白/标点：断开 run
flush(cur)

function flush(r): if r: runs.push(r)
```

**第二步：每个 run 同时生成 `source` 与 `grams`（★ v1.2 修正：v1.1 的 cjk 分支从未赋 `source`）**
```
for r of runs:
  if r.kind === 'cjk':
     r.source = r.text                       // ★ cjk 的 source = 原文子串，原样保留（不做小写）
     if r.text.length === 1: r.grams = [r.text]
     else: r.grams = [ r.text[i..i+2] for i in 0..len-2 ]
  else:
     r.source = r.text.toLowerCase()          // ★ latin 的 source = 小写整词
     r.grams  = [r.source]
```

**第三步：构造返回值（★ v1.2 修正：v1.1 的 `isEmpty` 从未赋值）**
```
return { runs, isEmpty: runs.length === 0 }
```

**完整可执行参考实现（照抄即可，已实测）**：

```ts
export interface GramRun { kind: 'cjk' | 'latin'; source: string; grams: string[] }
export interface GramPlan { runs: GramRun[]; isEmpty: boolean }

export function planGrams(s: string): GramPlan {
  const isCJK = (c: string) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(c);
  const isAlnum = (c: string) => /[a-zA-Z0-9]/.test(c);

  const runs: GramRun[] = [];
  let kind: 'cjk' | 'latin' | null = null;
  let text = '';
  const flush = () => {
    if (!kind) return;
    if (kind === 'cjk') {
      const grams: string[] = [];
      if (text.length === 1) grams.push(text);
      else for (let i = 0; i < text.length - 1; i++) grams.push(text.slice(i, i + 2));
      runs.push({ kind: 'cjk', source: text, grams });
    } else {
      const low = text.toLowerCase();
      runs.push({ kind: 'latin', source: low, grams: [low] });
    }
    kind = null; text = '';
  };

  for (const ch of s) {
    if (isCJK(ch)) {
      if (kind === 'cjk') text += ch;
      else { flush(); kind = 'cjk'; text = ch; }
    } else if (isAlnum(ch)) {
      if (kind === 'latin') text += ch;
      else { flush(); kind = 'latin'; text = ch; }
    } else { flush(); }
  }
  flush();

  return { runs, isEmpty: runs.length === 0 };
}
```

**实测样例（与 SPIKE-2 一致，必须逐条通过单测）**：

| 输入 | runs[].source | runs[].grams |
|---|---|---|
| `工作站架构` | `工作站架构` | `["工作","作站","站架","架构"]` |
| `贴图工作站 v2` | `贴图工作站`, `v2` | `["贴图","图工","工作","作站"]`, `["v2"]` |
| `工` | `工` | `["工"]` |
| `xyz` | `xyz` | `["xyz"]` |
| `工 作 站` | `工`,`作`,`站` | `["工"]`,`["作"]`,`["站"]` |
| `工、作` | `工`,`作` | `["工"]`,`["作"]` |
| `工作，站` | `工作`,`站` | `["工作"]`,`["站"]` |
| `工作站。` | `工作站` | `["工作","作站"]` |

> **注意倒数第三行**：带空格输入会被切成 3 个单字 run，**不再等价于**「工作站」。v1.0 的 GAP-02 说法错误，已更正为 GAP-02b。
>
> **注意最后两行（全角标点必须断开 run）**：`isCJK` 的正则**必须**是 `[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]`（CJK 扩展 A + 基本区 + 兼容区）。**禁止**写成 `[\u3000-\u9fff...]`——`\u3000-\u303F` 是全角标点区（`、。，！？「」`），会把标点吞进 CJK run，导致 `工、作` 变成单个 run、grams 变成 `["工、","、作"]`，检索与高亮全错。

**CL-313 `buildQuery(plan): string` 与两阶段检索**

```
phase1（粗召回）:
  if plan.isEmpty → return []
  // 每个 run 用短语查询约束"该 run 内部相邻"，多个 run 之间用 AND
  // （跨 run 不要求相邻，因为 run 之间本来就有空格/标点）
  parts = plan.runs.map(r =>
     r.kind === 'cjk'
       ? '"' + r.grams.join(' ') + '"'        // 短语：gram 必须按序相邻
       : r.grams[0] + '*'                    // 拉丁：前缀匹配
  )
  MATCH = parts.join(' AND ')

  单 run 且为单字 CJK → 不走 FTS，走 LIKE 分支：
     SELECT * FROM notes WHERE title LIKE '%'||?||'%' OR body LIKE '%'||?||'%'
     ORDER BY updated_at DESC

  否则：
     SELECT notes.* FROM notes_fts JOIN notes ON notes.id = notes_fts.rowid
     WHERE notes_fts MATCH ? ORDER BY notes.updated_at DESC LIMIT 100

phase2（精确过滤，必做）:
  对每条命中，回表取 title 与 body：
     candidate = (title + '\n' + body)
     对每个 run：candidate.includes(run.source) 必须**全部为真**
     归一化：拉丁比较前两边 toLowerCase()；CJK 直接 includes
  任一 run 不命中 → 丢弃该条
```

**CL-314 为什么不再需要 `verifyContiguous` 字符滑窗**

v1.0 的 `verifyContiguous(text, grams)` 假设 all grams 属于**同一个**连续片段。中英混排查询（`贴图工作站 v2` → 4 个 CJK gram + 1 个 latin gram）下，它会要求 `text.slice(i+3, i+5) === 'v2'`，即把 `v2` 紧贴 CJK 之后——而原文里两者之间有空格，必然误判为不命中。

改法：**直接对每个 run 的 `source` 原文做 `includes`**。这比 gram 滑窗更强（是原文级精确子串校验），且天然处理混排与间断。gram 只用于 FTS 的粗召回，不再用于校验。

- **CL-315 候选上限**：phase2 只对前 100 条候选执行；超出按 phase1 排序截断。
- **CL-316 性能**：1000 篇内 P95 < 80ms。测法：批量插入 1000 篇固定语料（CL-317 的 4 篇 + 996 篇合成），跑 100 次混合查询，取 P95。

**CL-317 固定语料与期望（验收必用，逐条断言）**

| 笔记 | title | body | updated_at |
|---|---|---|---|
| N1 | 工作台 | 工作台 | 1000 |
| N2 | 工作站架构 | 工作站架构 | 2000 |
| N3 | 无关内容 | 无关内容 | 3000 |
| N4 | 干扰项 | `今天工作 作站很久` | 4000 |

| 查询 | 期望 id 序列 | 说明 |
|---|---|---|
| `工作` | `[4,2,1]` | N4 确实含"工作" |
| `工作站` | `[2]` | **★ 必须排除 N4**（短语 + 位置校验） |
| `作站` | `[4,2]` | N4 原文含"作站"字面 |
| `工作台` | `[1]` | |
| `无关` | `[3]` | |
| `工` | `[4,2,1]` | LIKE 回退 |
| `架构` | `[2]` | |
| `xyz` | `[]` | |

> **★ 已实测通过（2026-10-31）**：按本文件 CL-312/313/314 的实现，`F:\gal\probe\sds-v12-probe.cjs` 对上述 8 条查询 **8/8 全部匹配期望**，混排查询 `贴图工作站 v2` 也正确返回。实施者可直接照 CL-312 的 run 切分逻辑实现，无需自行调整。

**CL-318 双链**

- **触发**：光标前文本匹配 `/(?:^|[^\[\]])\[\[([^\[\]\n]{0,50})$/`。
- **候选查询**：
```sql
SELECT id, title FROM notes
WHERE title LIKE '%' || ? || '%'
ORDER BY CASE WHEN title = ? THEN 0 WHEN title LIKE ? || '%' THEN 1 ELSE 2 END,
         updated_at DESC
LIMIT 20
```
- **插入格式**：默认 `[[标题]]`；若标题重名（>1 条）→ `[[id:123|标题]]`。
- **解析正则**：`/\[\[(?:id:(\d+)\|)?([^\[\]|]+)\]\]/g`
  - 有 `id:` → 按 id
  - 否则按 title **精确匹配**（trim、大小写敏感）
  - 匹配不到 → 失效链接，UI 虚线 + 警示色，**不报错**
- **反链**：解析 body 得到出链 → 写 `links(from_id,to_id)`；反链查询 `SELECT from_id FROM links WHERE to_id=?`。

**CL-319 自动保存**
- 输入 debounce 800ms → upsert。
- 收起前由 `plugin:flush` 触发**立即** upsert（同步，不等 debounce）。
- upsert 后重新解析 links（同一事务内）。

**错误路径**：

| 码 | 条件 | 行为 |
|---|---|---|
| `E-DB-010` | upsert 失败 | 保留内存草稿，下次 flush 重试；UI 显示"未保存"标记 |
| `E-DB-011` | FTS MATCH 语法错误 | 回退到 LIKE 全表扫，记 warn |
| `E-DB-012` | `integrity-check` 失败 | 启动时 `rebuild`，记 warn |

**验收用例**：

| 用例 | 期望 | 类型 |
|---|---|---|
| AC-M12-01 | 插入 CL-317 语料，跑 8 条查询 | 全部匹配期望 | 正常 |
| AC-M12-02 | 写入后改正文（移除旧词） | 旧词命中 0，新词命中 1 | 异常 |
| AC-M12-03 | 1000 篇 + 100 次查询 | P95 < 80ms | 正常 |
| AC-M12-04 | N1→N2→N3→N1 成环 | 每篇反链 1 条 | 正常 |
| AC-M12-05 | 输入 `[[工` | 候选含 N1、N2；回车后文本 `[[工作台]]` | 正常 |
| AC-M12-06 | 两篇同名「测试」 | 插入 `[[id:xxx|测试]]` | 边界 |
| AC-M12-07 | `[[不存在的标题]]` | 显示为失效链接，不报错 | 异常 |
| AC-M12-08 | 输入后立即收起 | 内容完整（flush 生效） | 异常 |
| AC-M12-09 | 重启后 | `integrity-check` 通过 | 正常 |

---

## 4. 数据结构

### 4.1 `ArkError`（CL-001）

```ts
export class ArkError extends Error {
  constructor(
    public readonly code: ArkErrorCode,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) { super(message); this.name = 'ArkError'; }
}
export type ArkErrorCode =
  | 'E-WIN-001' | 'E-WIN-002' | 'E-WIN-003' | 'E-WIN-010' | 'E-WIN-011' | 'E-WIN-012' | 'E-WIN-020'
  | 'E-PLUGIN-001' | 'E-PLUGIN-002' | 'E-PLUGIN-003' | 'E-PLUGIN-004' | 'E-PLUGIN-005'
  | 'E-PLUGIN-006' | 'E-PLUGIN-007' | 'E-PLUGIN-008'
  | 'E-PERM-001' | 'E-PERM-002' | 'E-PERM-003'
  | 'E-DB-001' | 'E-DB-002' | 'E-DB-003' | 'E-DB-004' | 'E-DB-010' | 'E-DB-011' | 'E-DB-012' | 'E-DB-013'
  | 'E-FS-001' | 'E-FS-002'
  | 'E-NET-001' | 'E-NET-002'
  | 'E-AI-001' | 'E-AI-002' | 'E-AI-003' | 'E-AI-004' | 'E-AI-005'
  | 'E-AI-006' | 'E-AI-007' | 'E-AI-008' | 'E-AI-009'
  | 'E-PALETTE-001' | 'E-PALETTE-002' | 'E-PALETTE-003' | 'E-PALETTE-004'
  | 'E-THEME-001' | 'E-THEME-002';
```

### 4.2 IPC 响应包络（CL-002）

```ts
export type IpcResult<T> = { ok: true; data: T } | { ok: false; code: ArkErrorCode; message: string };
```

### 4.3 `PluginManifest`

> ★ **R5-01（T-002 实施发现）**：`id` 保留语义正则作为 schema 的第二道校验；但 `validateManifest` 必须先对字符串 id 做语义预检并映射到 `E-PLUGIN-003`，详见 CL-260b 的 R5-01。生产入口不得绕过 `validateManifest` 直接对外返回 zod 错误码。

```ts
export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
  name: z.string().min(1).max(32),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  entry: z.string().min(1),
  icon: z.string().optional(),
  ui: z.object({ private: z.boolean().default(false) }).optional(),
  permissions: z.object({
    fs: z.object({
      read: z.array(z.string()).optional(),
      write: z.array(z.string()).optional(),
    }).optional(),
    db: z.boolean().optional(),
    ai: z.array(z.enum(['chat'])).optional(),
    clipboard: z.boolean().default(false).optional(),
  }).optional(),
  commands: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    keys: z.string().optional(),
  })).optional(),
  minAppVersion: z.string().optional(),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
```

### 4.4 `ark.db` 主库表

```sql
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY, version TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, installed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS command_usage (
  id TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, last_at INTEGER
);
```

### 4.5 索引与查询模式（最常用的 3 个）

1. `SELECT value FROM settings WHERE key=?` — 主键，O(1)
2. `SELECT * FROM notes_fts JOIN notes ... WHERE notes_fts MATCH ?` — FTS5
3. `SELECT from_id FROM links WHERE to_id=?` — 索引 `idx_links_to`

### 4.6 迁移策略

- 当前 `user_version = 1`（首个版本）。
- 每次 schema 变更 → 加一条 migration（`{version: n, stmts: [...]}`），永不修改历史 migration。

---

## 5. 关键流程

### F-01 启动

```
loadEnvFromDisk([exeDir/.env, repoRoot/.env])
  → requestSingleInstanceLock() 失败? → quit
  → dataRoot = resolveDataRoot(...)
  → ensureDir(dataRoot) 失败? → E-WIN-002 退出
  → app.whenReady()
  → openDb(dataRoot/ark.db) + migrate(1)
  → settings 读出 theme / privacy / net.allowlist
  → ensureNetGuard(defaultSession)
  → createWindow(buildWindowOptions(preloadAbs))   // preloadAbs 绝对路径，见 R5-02
  → theme.broadcast()
  → trigger.register()
  → scan plugins/ → 逐个 host.load()
```
失败点：任一步抛 `ArkError` → 记 log → `dialog.showErrorBox` → `app.quit()`（`E-WIN-003` 例外，只 warn 继续）。

### F-02 呼出

```
用户热键/热区
  → trigger.onSummon()
  → if (win.isVisible()) return
  → display = getDisplayNearestPoint(cursor)
  → win.setBounds(computeWindowBounds(display))
  → win.setAlwaysOnTop(true,'screen-saver')
  → t0 = Date.now()
  → win.show(); win.focus()
  → send('window:summoned', {t0})
  → renderer 播入场 → onAnimationComplete 时取 t1 = Date.now()
  → 若 t1-t0 > 320 → log warn（不阻断）
```

### F-03 打开命令面板

```
Ctrl+K（任意 WebContents）
  → attachInputHook handler → preventDefault
  → openPalette()
  → host.hideAll()                      // 记录"模态前可见集合"
  → shellRenderer 显示面板，win.webContents.focus()
  → 用户选择命令 → palette.execute(id)
      → if 插件命令: host.restoreAll() 先恢复? 否：先执行，再关面板
      → 命令 run()
  → 关闭面板 → host.restoreAll() → 恢复焦点
```

### F-04 插件加载

见 CL-250 的 10 步。

### F-05 笔记保存

```
编辑器 onChange → debounce 800ms → save()
  → bigram_all = planGrams(title+'\n'+body).runs.flatMap(r => r.grams).join(' ')
  → tx:
      upsert(notes)
      DELETE FROM links WHERE from_id=?
      解析 body 出链 → INSERT links
  → 失败 → 保留草稿，标"未保存"
```

### F-06 演示模式切换

见 CL-301。

---

## 6. 横切关注点

| 关注点 | 方案 | 条款 |
|---|---|---|
| 配置 | `settings` 表 + `.env`（仅 `ARK_DATA_DIR`）；启动时校验必填项，缺则退出 | CL-203、CL-204 |
| 日志 | 结构化 `{ts,level,task_id,module,msg,...}`，开发期 console，生产写 `logs/app-YYYYMMDD.log` | CL-006 |
| 审计 | 独立 ndjson，10MB 轮转，保留 5 份，路径脱敏 | CL-263 |
| 错误 | `ArkError` + `IpcResult` 包络，禁止裸 throw string | CL-001、CL-002 |
| 鉴权 | 插件走 `senderMap` + `plugin:<id>:*` 通道 + mainFrame 校验 | CL-261 |
| 限流 | S0 无（单用户本地应用） | — |
| 幂等 | 迁移 `user_version`；笔记 upsert | CL-242、CL-311 |
| 可观测 | 启动打印 `DATA_ROOT` 与 `journal_mode`；崩溃卡片 | CL-204、CL-240 |
| 安全 | 输入 zod 校验；路径 realpath + glob；CSP；per-session 白名单 | CL-003、CL-262、M-08 |
| 脱敏 | 所有日志/审计/UI 路径输出前过 `redact()` | CL-302 |
| 时区 | 存 UTC ms，展示转本地 | 0.2 |
| 并发 | 单实例锁；SQLite 同步 API；插件各自独立进程 | CL-242、M-06 |

---

## 7. 非功能设计

### 7.1 性能

| 指标 | 目标 | 手段 |
|---|---|---|
| 呼出动效 | ≤320ms（每次） | `Date.now()` 双端；隐隐藏态预热（窗口常驻不销毁） |
| 命令面板搜索 | 1000 条 P95 <16ms | 纯函数评分 + 预计算小写 haystack |
| 笔记检索 | 1000 篇 P95 <80ms | FTS5 粗召回 + 前 100 条精确过滤 |
| 热区轮询 CPU | 60s 增量 <0.5s | 50ms 间隔 + 默认关闭 |
| 启动到可呼出 | 记录实测（不设上限） | — |

### 7.2 容量

- 笔记：设计目标 10 万篇；超过 1 万篇时 phase2 候选上限 100 保证延迟。
- 插件库：同时 ATTACH ≤3（LRU）。
- 审计日志：5 份 × 10MB = 50MB 上限。

### 7.3 可靠性

- 单点：SQLite 单文件（WAL 保证崩溃一致性）。
- 崩溃隔离：插件独立进程；`render-process-gone` 显示卡片可重载。
- 备份：`data/` 整目录拷走即完整备份。
- 恢复演练：删 `data/` 重建后能启动（新库）。

### 7.4 兼容

- 版本策略：`user_version` 单向升级；不支持降级（降级时提示"数据版本更高"并拒绝启动）。
- 插件 `minAppVersion`：高于当前 → `E-PLUGIN-005` 跳过。

---

## 8. 技术选型与取舍

| 决策 | 选择 | 备选 | 理由 | 何时重新评估 |
|---|---|---|---|---|
| better-sqlite3 版本 | **11.10.0 精确** | 13.x | 13.x 本机崩溃 `0xC0000005`（SPIKE-1 实测） | 升级 Electron 时重测 |
| 文档检索 | bigram + FTS5 短语 + 位置校验 | trigram、LIKE 全扫 | 实测有效；trigram 索引体积 3× | 笔记 >10 万篇且 P95 超 80ms |
| 插件隔离 | WebContentsView + partition | iframe、子窗口 | 进程隔离 + 可用 `setVisible` 解决层叠 | — |
| 模态层叠 | `setVisible(false)` | 子窗口、iframe | 见 ROUND-2 裁决（方案 b） | — |
| 命令面板 | Shell 层 React 路由 | 独立 view | 焦点简单、无层叠问题 | — |
| 密钥存储 | `safeStorage`(DPAPI) | 自实现 AES + 主密码 | 无主密钥管理问题 | 需要跨机器同步时 |
| 手势 | S0 不做 | uiohook-napi | 不能 suppress，会与宿主应用冲突 | S1 用 C# helper |
| 边缘热区 | 轮询 50ms | 透明置顶窗口 | 置顶窗口会进别人录屏 | — |
| `.env` 解析 | 自写 15 行 | dotenv | 保持依赖 11 个 | — |

---

## 9. 测试策略

| 层级 | 范围 | 工具 | 覆盖要求 |
|---|---|---|---|
| 单元 | `shared/` 纯函数（planGrams、buildQuery、score、themeToCssVars、buildWindowOptions、resolveDataRoot、redact） | vitest | 每个函数的分支全覆盖，含边界 |
| 集成 | 模块间（db+migrate、gateway+manifest、netguard+session） | vitest（node 环境） | 每接口 ≥1 条正常 + 1 条异常 |
| 端到端 | Electron 主流程 | Playwright（Electron 驱动） | 每个 PLAN G-x ≥1 条 |
| 回归 | 已修复缺陷 | vitest | 一条 bug 一个用例 |

**测试数据**：
- `tests/fixtures/notes/*.json`（CL-317 语料）
- `plugins/fixtures/evil-fixture/`（越权）
- `plugins/fixtures/no-perm/`（无声明）
- `plugins/fixtures/net-escape/`（出网）
- `plugins/fixtures/hardcoded-color/`（5 个颜色负例）

**本地跑**：`pnpm test` / `pnpm test:e2e`

**已知测试盲区（必须写进 README）**：
- Playwright **无法注入 OS 级全局热键**（TECH-VERIFY C-16）→ e2e 走 `ARK_E2E=1 && !app.isPackaged` 的 `test:summon` 通道，报告注明未覆盖 OS 注入。
- `setContentProtection` **无法自动断言**（capturePage 绕开 WDA）→ 人工手机拍屏。
- 跨 Windows 用户解密 → 人工。

---

## 10. 部署与运行

- 构建：`pnpm build` → `out/{main,preload,renderer}`
- 打包：`pnpm package` → `release/ARK-<ver>-x64.exe`（NSIS **per-user**，`oneClick:false, perMachine:false`）
- 闸 A（不依赖 NSIS 下载）：`electron-builder --dir` → `release/win-unpacked/`
- 启动：安装后运行 exe；dev 用 `pnpm dev`
- 必需环境变量：无强制项；`ARK_DATA_DIR` 可选
- 配置样例：`.env.example` 含 `ARK_DATA_DIR=F:\gal\workstation\data`
- 回滚：删除 `release/` 与 `out/` 重新构建；数据不受影响（在 `data/`）

### 10.1 工具链精确版本（★ R5-03，T-002 实测确定）

| 项 | 精确值 | 为什么必须钉死 |
|---|---|---|
| Node | **20.18.1** | `engines.node` 写的是 `>=20 <21`，但 `@typescript-eslint` 的新小版本已要求 `^20.19.0`；本机是 20.18.1，配合 `.npmrc` 的 `engine-strict=true`，一旦某个包升到需要 20.19 就直接装不上 |
| pnpm | 9.15.9 | — |
| `@typescript-eslint/parser` / `eslint-plugin` | **`8.18.2`（不带 `^`）** | 带 `^` 会解析到 8.72.1，其传递依赖 `eslint-visitor-keys@5.0.1` 要求 Node ≥20.19 → `ERR_PNPM_UNSUPPORTED_ENGINE` |

**从零复现时不要写"Node 20 LTS"，要写 `20.18.1`。** 这是 T-016 的硬要求。

### 10.2 开发/测试启动清单

| # | 步骤 | 不做会怎样 |
|---|---|---|
| 1 | `$env:Path = "<node>;<npm-global>;" + $env:Path` | pnpm/electron postinstall 找不到 `node` |
| 2 | `$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"` | 从官方源下载，10 分钟无进展 |
| 3 | `Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue` | Electron 退化为纯 Node，`app` 是 undefined |
| 4 | `tsconfig.node.json` 用 `"types": []`，**不要**写 `["node"]` | `@types/node` 是传递依赖未提升 → `TS2688` |
| 5 | preload 路径必须**绝对**，由 main 注入 | Electron 拒绝且**静默不加载**，`window.ark` 恒 undefined |
| 6 | `"type":"module"` 下没有 `__dirname`，用 `fileURLToPath(import.meta.url)` | 运行期 `ReferenceError`（typecheck 抓不到） |
| 7 | **启动类任务必须实跑一次并断言 `window.ark !== undefined`** | 四条静态命令全绿但应用是坏的（R5-02 就是这么发现的） |

---

## 11. 契约缺口登记

| ID | 发现时间 | 描述 | 处置 | 状态 |
|---|---|---|---|---|
| GAP-01 | 2026-10-31 | FTS5 短语查询对 2 字词仍会命中字面（如 `作站` 命中「今天工作 作站很久」）——这是**正确行为**，但需在 UI 上说明"按字匹配" | 接受；README 说明 | CLOSED |
| GAP-02 | 2026-10-31 | 带空格输入「工作 站」与「工作站」产生相同 gram 序列，视为同一查询 | 接受；SDS 已写明 | CLOSED |
| GAP-03 | 2026-10-31 | 跨应用前台全屏检测无 Electron API | S0 只判"窗口已可见 + 演示模式"；README 声明 | CLOSED |
| GAP-04 | 2026-10-31 | ATTACH 上限实测：附加库 10 个，第 11 个失败（不含 main）→ 最多 10 插件库。**v1.0 写"含 main 共 10 → 最多 9"是差一错误** | LRU 保 3 个，与上限无关 | CLOSED |
| GAP-05 | 2026-10-31 | `setContentProtection` 在透明窗口可能静默失效 | M10 前置实验 + 降级不透明 | OPEN（实测后定） |
| GAP-06 | 2026-10-31 | 边缘热区在多屏共边可能双向命中 | cooldown 1000ms 兜底 | CLOSED |
| GAP-07 | 2026-10-31 | **`E-PLUGIN-003` 按原文不可达**：§4.3 的 `PluginManifestSchema.id` 带同一正则，非法字符串 id 必先落 `E-PLUGIN-002`（T-002 实施发现） | 改 SDS（R5-01）：schema 正则保留；`validateManifest` 在 zod 前对字符串 id 做语义预检并映射 003，缺失/非字符串仍归 002 | **FIXED**（v1.3） |
| GAP-08 | 2026-10-31 | **`webPreferences.preload` 相对路径被 Electron 拒绝并静默不加载**；typecheck/lint/test/build 四条全抓不到（T-002 的 A7 实跑发现） | 改 SDS（R5-02）：`buildWindowOptions(preloadAbsPath)` 必填；新增 AC-M02-01b「实跑断言 `window.ark`」；升为 §10.2 第 5、7 条铁律 | **FIXED**（v1.3） |
| GAP-09 | 2026-10-31 | `@types/node` 不在 17 个 devDeps 白名单，但 `types:["node"]` 需要它 → TS2688 | 不扩白名单；`types: []` 靠模块解析拾取。§10.2 第 4 条 | CLOSED |
| GAP-10 | 2026-10-31 | 工具链版本漂移：`@typescript-eslint ^8.18.2` → 8.72.1 需 Node ≥20.19，本机 20.18.1 + `engine-strict` 装不上 | 锁字面 `8.18.2`；§10.1 钉死 Node `20.18.1`；T-016 复现文档必须写精确版本 | CLOSED |
| GAP-02b | 2026-10-31 | ~~带空格输入「工作 站」与「工作站」视为同一查询~~ —— v1.0 说法错误。v1.2 的 run 切分下，`工 作 站` 被切成 3 个单字 run，**不再等价于** `工作站` | 已更正 CL-312 样例表与 AC-M12-05 | CLOSED |

---

## 12. 契约缺口与假设的上报协议（实施者必读）

**任何实施者在本文件找不到答案时，按下面做，不要停下来问人，也不要自己发明后不记录。**

### 12.1 两种情况

| 情况 | 标记 | 做法 |
|---|---|---|
| 缺口**不影响可测行为**（例如某个内部函数怎么命名、某个常量用什么值） | `ASSUMPTION:` | 自己定，写进报告，继续做完 |
| 缺口**会导致验收无法判定**或**两种实现都说得通但行为不同** | `CONTRACT_GAP:` | 选一个最保守的实现做完，同时在报告里详细写清"我缺什么/我选了什么/为什么/影响哪些 AC" |

### 12.2 报告格式（追加到 `tasks/T-xxx.report.md`）

```markdown
## ASSUMPTION
- A-01: <哪一处> —— 我假设 <具体取值>，因为 <理由>。影响：<无 / 影响 AC-xxx>

## CONTRACT_GAP
- G-01: SDS 的 <条款号> 没有规定 <具体问题>。
  我选择：<实现方式>
  理由：<为什么这是最保守的选择>
  影响：<哪些 AC 无法判定，或哪些行为可能不符预期>
  建议：<SDS 应补一条什么条款>
```

### 12.3 调度者的处置

- `ASSUMPTION` 合理 → 记入 `docs/CONTEXT-DIGEST.md`，不回退。
- `CONTRACT_GAP` 影响验收 → 调度者补 SDS 条款，重发任务卡（该任务回到 `IN_PROGRESS`）。
- `CONTRACT_GAP` 不影响验收 → 记入本文件 §11 的缺口登记表，标 `CLOSED`。

### 12.4 严禁

- ❌ 发现缺口后跳过不做，等别人问
- ❌ 自己发明一个错误码（必须从 §4.1 选，或报 GAP）
- ❌ 改动 SDS 本身（实施者无权改 SDS，见 AGENTS.md §2）

---

## 附：给实施者的五条铁律

1. **所有错误码必须从 §4.1 的联合类型里选**，不许自创。缺码 → 报 `CONTRACT_GAP`（协议见 §12）。
2. **所有 SQL 写 notes 表必须用 CL-311 的白名单语句**。`INSERT OR REPLACE` 会静默污染索引，且测试全绿（实测过的陷阱）。机器化拦截见 CL-311b。
3. **所有时间测量必须两端同基准**。主进程 `Date.now()` 不能减 renderer `performance.now()`——那是恒真断言。
4. **任何"看起来能通过但不可能失败"的断言都是 bug**。写完一条验收，先问自己："如果实现是错的，这条会失败吗？"答不上来就重写。
5. **实施者无权改 SDS**（AGENTS.md §2）。发现契约有洞 → 按 §12 报 `CONTRACT_GAP`，不要自行"优化设计"。
