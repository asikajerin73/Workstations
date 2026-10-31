# 任务台账 LEDGER

> **唯一状态真相源。** 只有调度者（主会话）能改这个文件。
> 对话里说"做完了"不算，这张表才算。

## 状态图例

`PENDING` 未就绪｜`READY` 依赖已满足｜`IN_PROGRESS` 派发中｜`REVIEW` 待评审｜`DONE`｜`BLOCKED`｜`REJECTED`

## 当前阶段

- 阶段：**S0 实施**
- 契约版本：`PLAN v3.2` / `SDS v1.2`（唯一技术真相：`docs/SDS.md`）
- 起始日期：待定（T-001 环境闸口通过后）

## 台账

| ID | 标题 | 依赖 | 里程碑 | 人日 | TOUCH（文件） | 状态 | 轮次 | 评审 | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| T-001 | 环境与工具链闸口 | — | M0 | 0.5 | `.tools/`, `.npmrc`, `package.json` | **DONE** | 1 | 调度者自验 | 2026-10-31 完成，见 `T-001.report.md`。推翻 ATTACH 上限旧结论 |
| T-002 | 仓库骨架与构建基线 | T-001 | M3 | 1.5 | 见卡 | **DONE** | 1 | 独立终审 PASS | 2026-10-31 A1–A10 全绿；调度者与独立评审均复验；SDS 升至 v1.3 |
| T-003 | 主题引擎 | T-002 | M4 | 0.5 | 见卡 | **DONE** | 1 | 独立评审 PASS_WITH_RISK（0 blocking） | A1–A10 通过、70 tests；A8 Electron 实跑通过；仅 deep-space 有 palette 数据；setter 中途异常可导致 CSS 部分写入，列非阻断风险 |
| T-004 | 窗口两态序列（主进程） | T-002,T-003 | M4 | 0.5 | 见卡 | **DONE** | 1 | 独立评审 PASS（0 blocking，5 nonblocking） | A1–A14 通过、94 tests；A13 真实 Electron 实测；调度者亲自复现变异测试（t0 后移 → 10 红）与探针；产出 4 条 CONTRACT_GAP→SDS v1.4 |
| T-004b | 失焦自动收起 | T-004 | M4 | 0.25 | 待补 | PENDING | 0 | — | G-4 后半；依赖 settings 层 |
| T-004c | 动效计时与入场动画 | T-004 | M4 | 0.25 | 待补 | PENDING | 0 | — | G-4 前半；AC-M02-05；**必须处理 NB-01**：E-WIN-011 重试分支未重取 t0 |
| T-005 | 数据层 | T-002 | M5 | 1.0 | 见卡 | PENDING | 0 | — | G-8 |
| T-006 | 网络出口白名单 | T-002 | M6 | 0.5 | 见卡 | PENDING | 0 | — | G-12 |
| T-007 | 权限网关与审计 | T-005,T-006 | M6 | 1.0 | 见卡 | PENDING | 0 | — | G-7 |
| T-008 | 插件宿主与协议 | T-004,T-005,T-007 | M6 | 1.0 | 见卡 | PENDING | 0 | — | G-7 |
| T-009 | 命令面板 | T-004 | M7 | 0.5 | 见卡 | PENDING | 0 | — | G-6a |
| T-010 | 笔记插件·数据与检索 | T-005,T-007 | M8 | 1.0 | 见卡 | PENDING | 0 | — | G-9 前半 |
| T-011 | 笔记插件·编辑器与双链 | T-010 | M8 | 1.0 | 见卡 | PENDING | 0 | — | G-9 后半 |
| T-012 | 命令面板跨插件端到端 | T-008,T-009,T-011 | M9 | 0.5 | 见卡 | PENDING | 0 | — | G-6b |
| T-013 | AI 门面 | T-005 | M9 | 0.5 | 见卡 | PENDING | 0 | — | G-10 |
| T-014 | 热键与边缘热区 | T-004 | M10 | 0.5 | 见卡 | PENDING | 0 | — | G-3 |
| T-015 | 隐匿三件套 | T-004,T-008 | M10 | 0.5 | 见卡 | PENDING | 0 | — | G-11 |
| T-016 | 文档与从零复现 | 全部 | M11 | 0.5 | 见卡 | PENDING | 0 | — | G-13 |

**合计 12.5 人日**。与 PLAN §8 的 14.5 差额 = M1 计划定稿 0.5 + M2 SDS 定稿 2.0（已完成）。

## 阻塞登记

| ID | 阻塞原因 | 解除条件 | 登记时间 |
|---|---|---|---|
| — | 无 | — | — |

## 已证实的环境陷阱（T-002 起必须遵守）

| # | 陷阱 | 必须做的事 |
|---|---|---|
| E-01 | 会话环境带 `ELECTRON_RUN_AS_NODE=1`，Electron 退化为纯 Node，`require('electron')` 返回字符串，报 `reading 'whenReady'` | 所有启动 Electron 的脚本/命令**先** `Remove-Item env:ELECTRON_RUN_AS_NODE` |
| E-02 | Electron postinstall 用 `node` 这个名字 spawn 子进程，PATH 里没 Node 就失败 | 执行 pnpm 命令前把 Node 目录加进 `$env:Path` |
| E-03 | 不设 `ELECTRON_MIRROR` 时从官方源下载，10 分钟无进展 | `$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"` |
| E-04 | `electron-rebuild` 在 pnpm 符号链接结构下找不到 Electron 版本 | `pnpm exec electron-rebuild -f -w better-sqlite3 -v 33.4.11`（显式 `-v`） |
| E-05 | **`webPreferences.preload` 传相对路径时，Electron 只打一条 `ERROR: preload script must have absolute path`，然后静默不加载 preload**；typecheck/lint/test/build **全部抓不到** | 任何建 `BrowserWindow` 的任务卡：preload 必传**绝对路径**；且必须**实跑**并断言 `window.ark !== undefined`。只跑四条静态命令不算验过 |
| E-06 | `package.json` 是 `"type": "module"` 时，main 产物是 **ESM**，**没有 `__dirname`** | 用 `dirname(fileURLToPath(import.meta.url))` 推导；不要用 `__dirname`（typecheck 抓不到，运行期 `ReferenceError`） |
| E-07 | pnpm 严格模式**不提升**传递依赖到顶层 `node_modules`；`tsconfig` 的 `"types": ["node"]` 是**显式入口**，找不到未提升的 `@types/node` | `types: []`，靠模块解析自动拾取；不要把 `@types/node` 加进白名单 |
| E-08 | Vite 5 **不加** `@vitejs/plugin-react` 也能编译 `.tsx`（esbuild 内置 JSX），实测 30 modules 通过 | 代价是无 Fast Refresh。若确需 HMR，走 CONTRACT_GAP 申请白名单，不要擅加依赖 |

## 契约缺口（CONTRACT_GAP 汇总）

| GAP | 来源任务 | 描述 | 处置 | 状态 |
|---|---|---|---|---|
| GAP-05 | — | `setContentProtection` 在 `transparent:true` 下可能静默失效 | T-015 开工前做前置实验，失败则降级为不透明背景 | OPEN |
| GAP-06 | T-002 | `@types/node` 不在 17 个 devDeps 白名单里，但 `"types": ["node"]` 需要它（pnpm 严格模式不提升传递依赖）→ TS2688 | **裁决：不扩白名单**。`tsconfig.node.json` 用 `"types": []`，靠模块解析路径自动拾取。**理由**：`@types/node` 只影响类型层，不影响运行；扩白名单会让 A2 的"集合相等于 17"失效，代价大于收益 | CLOSED（改文档） |
| GAP-07 | T-002 | **CL-260b 的 `E-PLUGIN-003` 原始规则不可达**：§4.3 的 schema id 正则令非法字符串 id 必先落 002 | **裁决：改 SDS**（R5-01）：保留 schema 正则；`validateManifest` 在 zod 前对字符串 id 做语义预检并映射 003，缺失/非字符串仍归 002；独立复审 PASS | **FIXED**（SDS v1.3） |
| GAP-08 | T-002 | **A7 实测：`webPreferences.preload` 相对路径被 Electron 拒绝且 preload 静默不加载**，`window.ark` 恒 `undefined`；typecheck/lint/test/build 四条全抓不到 | **裁决：改 SDS + 加验收铁律**。已修：`buildWindowOptions(preloadAbsPath)` 改为必填参数；SDS 补注「preload 路径由调用方注入绝对路径」；**后续涉及 preload 的任务卡一律强制「实跑一次 + 断言 `window.ark` 存在」** | **FIXED**（SDS v1.3） |
| GAP-09 | T-002 | `@typescript-eslint/*: ^8.18.2` 会解析到 8.72.1，其依赖需 Node ≥20.19，本机 20.18.1 + `engine-strict=true` 装不上 | **裁决：锁字面版本 8.18.2**（不带 `^`），不改白名单集合。同时记录：`engines.node: ">=20 <21"` 与 npm 生态 20.19+ 趋势存在长期张力，**T-016（文档与从零复现）必须写明精确 Node 版本 `20.18.1`**，不要只写 `>=20` | CLOSED（改文档） |

### GAP 裁决记录（T-002 轮）

- **GAP-06**：不扩白名单。`types: []` 是正解，SDS §10 需补一句说明。
- **GAP-07**：**这是真契约缺陷**，不是实施者理解错。SDS R5-01 保留 schema 正则，在 `validateManifest` zod 前预检字符串 id 并映射到 003；独立复审已确认一致。
- **GAP-08**：**这是最有价值的发现**——四条验证命令全绿但应用实际是坏的。已修代码 + SDS，并把"实跑 + 断言 `window.ark`"升为后续铁律。
- **GAP-09**：锁版本，接受长期张力，转给 T-016 写清精确版本。

## 今日统计

- 派发：0 ／ 完成：0 ／ 返工：0 ／ 升级：0
- 主会话今日读入 token 估算：~0
