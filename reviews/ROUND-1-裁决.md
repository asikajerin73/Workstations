# 评审裁决记录 ROUND 1

> 输入：PLAN-REVIEW-01（spec-hawk，12 blocking）、PLAN-REVIEW-02（implementer，18 blocking）
> 裁决：全部 ACCEPTED（30 条全部成立，无一条被驳回）。合并去重后 24 个独立问题。
> 结论：PLAN v1.0 作废，重写 v2.0。**实施者那条"WebContentsView 盖住命令面板"是架构级炸弹，价值最高。**

## 一、裁决表

| 合并ID | 来源 | 问题 | 裁决 | v2.0 处置 |
|---|---|---|---|---|
| C-01 | 02-B01/02-B02 + 01-N05 | 产物目录 out/dist 矛盾，打包器不在依赖表，无 package.json/tsconfig/eslint/目录树 | ACCEPT | §6 锁定 electron-vite 输出 `out/` + electron-builder 出 `release/`；附录 A 给完整 package.json 依赖白名单 |
| C-02 | 02-B03 + 01-N01 | "Alt-Tab 不出现"不可断言；隐藏态/呼出态窗口参数未定义 | ACCEPT | G-2 拆两条：构造参数快照单测 + 人工 Alt-Tab 截图；§11 给两态窗口参数表 |
| C-03 | **02-B05** | **子 WebContentsView 恒在 Shell webContents 之上 → 命令面板被插件遮住** | ACCEPT | 采用方案(b)：呼出模态/命令面板时插件 view `setVisible(false)`，关闭后恢复；§11 给 z 序与焦点表 |
| C-04 | 02-B04 + 02-Q08 | 失焦 800ms × 自动保存 = 丢稿；devtools/子view blur 误判 | ACCEPT | 失焦收起默认**关闭**，改为可配 3s；收起前同步 flush；blur 判据用应用级聚合 |
| C-05 | 02-B06 | Ctrl+K 捕获点未定；模糊匹配算法未定 | ACCEPT | `before-input-event` 吞键（仅窗口可见时）；评分=连续子串>前缀>分词交集>频率 |
| C-06 | 02-B07 + 02-B08 + 01-B08 | 权限网关只有六个字；身份认定/通道串号/绕过面/审计日志全缺；"强杀进程"不可行 | ACCEPT | §12 GATEWAY 契约全文：manifest schema、`plugin:<id>:<api>` 通道、`senderMap` 身份、`partition` 隔离、审计日志路径与字段 |
| C-07 | 02-B09 + 01-B09 | SQLite 无 schema 概念；数据目录硬编码 F: 与"拷走即用"冲突 | ACCEPT | 主库 `ark.db` + 每插件 `plugins/<id>.db` ATTACH；数据根 `ARK_DATA_DIR` → exe 同级 `data/` → 仓库 `data/`；强制单实例 |
| C-08 | 02-B11 + 01-B07 | bigram 只有口号，无 DDL/写入/查询/回退/高亮 | ACCEPT | §13 给完整 DDL + toBigram + buildQuery + 固定语料与期望命中数 |
| C-09 | 02-B10 | better-sqlite3 原生模块打包（asarUnpack）未提 | ACCEPT | G-1 纳入 `asarUnpack: ['**/*.node']` + postinstall electron-rebuild + 打包产物冒烟 |
| C-10 | 02-B12 + 01-B11(部分) | 防截屏零验收；capturePage 自检技术不成立 | ACCEPT | 验收降级为**人工拍屏清单**（明标"人工"）；同时给 DPAPI 加密验收（可自动） |
| C-11 | 02-B13 + 01-B01/B02 | 手势：uiohook 不能吞事件、会被摘钩、$1 是占位符；"Shell 内手势"降级无效 | ACCEPT | **手势整体移出 S0**，改 S1；S0 只做热键 + 热区，并在 G-3 写死降级判据 |
| C-12 | 02-B14 | 边缘热区无机制，轮询与"不常驻"冲突 | ACCEPT | 热区用 50ms 轮询 + 150ms 停留；全屏应用时自动禁用；轮询成本入风险表 |
| C-13 | 02-B15 | 隐私约束零实现零验收（插件可任意 fetch） | ACCEPT | 新增 G-13：CSP + webRequest 白名单 + `E-NET-001` 审计，e2e 断言 |
| C-14 | 02-B16 + 01-B11 | AI Key 主密钥来源未定义；ai.chat 进程归属未定；错误码只有一个 | ACCEPT | `safeStorage`(DPAPI)；ai.chat 只在主进程；错误码 E-AI-001..005 全表 |
| C-15 | 02-B17 + 01-B12 | 里程碑排期不可行，硬串行依赖被并行 | ACCEPT | 重排为 8 个严格串行里程碑，工期 8~10 天，S0 目标从 12 条降为 10 条 |
| C-16 | 02-B18 | Playwright 无法注入 OS 级热键；两处验收口径矛盾 | ACCEPT | 拆"单测验 register/isRegistered" + "e2e 走 `ARK_E2E=1` 的 test:summon 通道，报告注明未覆盖 OS 注入" |
| C-17 | 01-B06 + 02-N01 | 颜色 lint 只能拦 hex，五类写法全绕过 | ACCEPT | 5 类规则 + 5 个负例夹具 + 错误码 ARK-COLOR-1..5；插件侧再注入 `var(--ark-*)` 运行时兜底 |
| C-18 | 01-B10 + 01-N04 | 非目标漏掉终端/文件搜索/截图取字/画布；约束里点名了 S0 不存在的剪贴板 | ACCEPT | 增补 N-11/N-12，并给可执行的反向断言（grep 0 命中） |
| C-19 | 01-N02 | Node 版本口径不一致（20 vs DSH 自带 24） | ACCEPT | 只认 20 LTS；删掉 24 备选 |
| C-20 | 01-N03 | 演示模式"私密插件"无字段载体 | ACCEPT | manifest 增 `ui.private: boolean`（默认 false） |
| C-21 | 01-N06 | lint 不在任何里程碑闸口 | ACCEPT | 并入 G-1 验收命令组 |
| C-22 | 01-N07 | R-8 触发信号与 bigram 方案自相矛盾 | ACCEPT | 改为"2 字词命中率为 0 或命中数与 2-gram 出现次数不符" |
| C-23 | 01-N08 | 玻璃拟态与 contentProtection 黑屏叠加无降级 | ACCEPT | R-4 增"开启防截屏时 blur 降级为 none" |
| C-24 | 02-N04 | 计划违反自己定的"不可验收词"规则 | ACCEPT | 全部替换为阈值（模糊匹配→fzf 子序列 P95<16ms；检索→1000 篇 P95<50ms） |

## 二、被采纳的技术判断（写进 DECISIONS）

| 判断 | 结论 |
|---|---|
| 插件隔离模型 | 每插件独立 `WebContentsView` + 独立 `partition: persist:plugin-<id>`（强制独立 renderer 进程，否则 Chromium process-per-site 会合并） |
| 命令面板层叠 | 方案(b)：开模态前 `pluginView.setVisible(false)`，关闭后恢复。**不选**子窗口（焦点管理复杂）和 iframe（失去进程隔离） |
| 手势 | S0 **不做**。原因：uiohook-napi 不能 suppress，右键菜单必然弹；低级钩子会被 LowLevelHooksTimeout 摘掉。S1 用 helper 进程（C# WH_MOUSE_LL 返回 1）实现 |
| 边缘热区 | 50ms 轮询 `screen.getCursorScreenPoint()`，2px 边带 + 150ms 停留；全屏/演示模式自动禁用 |
| 数据目录 | `ARK_DATA_DIR` → exe 同级 `data/` → 仓库 `data/`；当前机 `.env` 写 `ARK_DATA_DIR=F:\gal\workstation\data` |
| 单实例 | `app.requestSingleInstanceLock()`，失败则聚焦已有实例并退出 |
| 防截屏 | 实现用 `setContentProtection(true)`；**验收只能是人工拍屏**，因为 capturePage 绕开 WDA，desktopCapturer 分不清背景与深色 UI |
| AI Key | `safeStorage.encryptString`（Windows DPAPI），密文 `data/secrets/ai.bin`；ai.chat 只在主进程 |
| 中文检索 | better-sqlite3 无法注册 FTS5 tokenizer → JS 侧 2-gram 预切分写入 `bigram_body` 列，unicode61 索引；查询侧同切分 AND 拼接 |

## 三、留给 owner 的 3 个真·偏好问题（其余我全拍了）

1. 防截屏验收：接受"人工拍屏清单"，还是要我写一个 WGC 采集进程做像素断言？（后者约多 1 天）
2. 视觉：玻璃拟态强度 —— 强（blur 32px，通透但可能拖性能）/ 中（blur 20px）/ 弱（blur 12px，最稳）
3. 呼出后的全屏层：是否允许透出桌面壁纸（`transparent:true` + 半透明底），还是纯不透明深色底（更稳、更省 GPU）
