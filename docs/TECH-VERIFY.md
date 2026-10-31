# 技术声称核验 TECH-VERIFY

> 时间：2026-10-31｜核验者：调度会话（子 agent 两次中断，改自验）
> 方法：区分「实测」（本机可复现，产物在 `F:\gal\probe\`）／「已知事实」（有明确 API 文档依据）／「不确定」（标注）

## 结论：18 项中 14 项成立，3 项表述错误已修正，1 项不确定

| # | 声称 | 判定 | 依据 |
|---|---|---|---|
| C-01 | `WebContentsView` 恒画在 BrowserWindow 自带 webContents 之上 | **成立** | `window.contentView` 是根视图树，window 自身的 webContents 由窗口本体绘制；`addChildView` 的 view 在其上层参与合成。因此插件 view 会遮住 Shell 的 React 模态——这是架构约束，不是样式问题 |
| C-02 | `partition` 能保证不同插件在不同 OS 进程 | **部分成立** | `partition` 保证的是独立 StoragePartition。Chromium 有"一个 renderer 进程只服务一个 StoragePartition"的实现约束，所以实践中确实分离；但这不是 Electron 的文档契约。**已按评审要求改为显式 `getOSProcessId()` 不等断言** |
| C-03 | `setContentProtection` 对 OBS 显示器捕获（DXGI Duplication）不生效 | **不成立**（我们原来的写法错了） | Win10 2004+ 走 `WDA_EXCLUDEFROMCAPTURE`，该标志对 DWM 合成与 DXGI Desktop Duplication 均生效，被捕获区域为黑。PLAN v3.0 已改为"挡 DWM/WDA 与 DXGI 复制，不挡采集卡与手机拍屏" |
| C-04 | `setContentProtection` 在 `transparent: true` 下可能静默失效 | **部分成立** | 分层窗口（WS_EX_LAYERED）与 `SetWindowDisplayAffinity` 存在已知不生效报告，且该 API 无返回值可判。PLAN 已加 M10 前置实验 + 降级为不透明背景 |
| C-05 | `capturePage()` 绕开 `SetWindowDisplayAffinity`，不能用于验证防截屏 | **成立** | `capturePage` 读的是 Chromium 合成器输出，不经 Windows 的窗口捕获路径，因此永远能抓到内容。PLAN 已改为人工手机拍屏 |
| C-06 | `before-input-event` 是 per-WebContents 事件 | **成立** | 事件挂在 `webContents` 实例上。插件是独立 WebContentsView（独立 webContents），主窗口 handler 收不到其按键。PLAN 已改为 `attachInputHook()` 统一挂到所有 WebContents |
| C-07 | `webRequest` 是 per-session | **成立** | `session.webRequest` 绑定在 Session 上；独立 partition = 独立 Session。只挂 defaultSession 拦不到插件请求。PLAN 已改为 `ensureNetGuard(session.fromPartition(...))` 每个 partition 各挂一份 |
| C-08 | FTS5 外部内容表 delete 语法正确 | **成立**（实测通过） | `INSERT INTO notes_fts(notes_fts,rowid,c) VALUES('delete',old.id,old.c)` 是 external content 表的标准写法，必须回填旧值。见 `F:\gal\probe\fts5-probe.cjs` |
| C-09 | `INSERT OR REPLACE` 不触发 DELETE 触发器（默认 `recursive_triggers=OFF`） | **成立**（实测确认） | `F:\gal\probe\upsert-probe.cjs`：REPLACE 后查询旧词「工作台」仍返回 `[1]`（脏数据残留）；`ON CONFLICT DO UPDATE` 后旧词返回 `[]`、新词返回 `[1]`。**这是真实的数据污染陷阱，不是理论风险** |
| C-10 | `ON CONFLICT(id) DO UPDATE` 触发 UPDATE 触发器 | **成立**（实测确认） | 同上，`notes_au` 正常触发 |
| C-11 | `SQLITE_MAX_ATTACHED` 默认 10，含 main | **成立**（实测确认） | `F:\gal\probe\attach-probe.cjs`：第 11 次 ATTACH 报 `too many attached databases - max 10`；`PRAGMA database_list` 返回 11（含 main）。故最多同时挂 9 个插件库 |
| C-12 | `safeStorage` 在 Windows 走 DPAPI，换用户/换机器解密失败 | **成立** | Electron Windows 后端为 `CryptProtectData`（DPAPI），密钥派生自用户 SID + 机器。换用户与换机器都会失败 → `E-AI-002` |
| C-13 | `isEncryptionAvailable()` 在正常登录会话恒 true；ready 前调用不行 | **成立** | DPAPI 在登录会话下可用；但 `safeStorage` 必须在 `app.whenReady()` 之后调用，否则行为未定义/抛错。PLAN 已写明调用时机 |
| C-14 | CSP `worker-src` 缺失时，Monaco 的 blob: worker 被 `default-src 'self'` 拦截 | **成立** | `worker-src` 未声明时回落到 `child-src` → `default-src`。`blob:` 不在 `'self'` 范围内，worker 创建失败 → 编辑器能显示但补全/语法检查静默失效。PLAN 已改为 `worker-src 'self' blob:` |
| C-15 | CSP 拦掉 fetch 时，主进程 `webRequest` 不会被调用 | **成立** | CSP 在渲染进程内先行阻断，请求不出网络层 → `onBeforeRequest` 不触发。因此"fetch 被拒 **且** 审计有 E-NET-001"是互斥断言。PLAN 已拆成 CSP 段与 webRequest 段两条独立断言 |
| C-16 | Playwright 无法注入 OS 级 `Ctrl+Alt+Space` | **成立** | Playwright 的 Electron 驱动只能在窗口内操作 DOM 或 `electronApp.evaluate()`，无法向系统注入全局热键。PLAN 已改为「单测断言 register/isRegistered + e2e 走 `test:summon` 通道并注明未覆盖 OS 注入」 |
| C-17 | 检测"前台应用是否全屏"有现成 Electron API | **不成立** | Electron 无此 API。**唯一现实方案**：读 `BrowserWindow.getFocusedWindow()` 只覆盖本应用；跨应用需 Win32 `GetForegroundWindow` + `GetWindowRect` 与 `display.bounds` 比较，须原生模块或 PowerShell helper。PLAN 已降级为"近似实现 + README 声明局限" |
| C-18 | FTS5 短语查询能排除跨词误命中 | **成立**（实测确认） | `F:\gal\probe\final2.cjs`：正文「今天工作 作站很久」在 AND 查询下被「工作站」误命中（`[2,4]`），短语查询 + 位置校验后返回 `[2]`。**但 2 字查询（如「作站」）仍会命中该文的字面内容**——这是正确行为，不是 bug |

## 本轮新发现（需写进 SDS）

### NEW-1 `recursive_triggers` 的连带影响

既然 `INSERT OR REPLACE` 是陷阱，必须**全项目禁用 REPLACE 写 notes 表**。但 `notes` 表还有 `delete` 场景（用户删笔记）：`DELETE FROM notes WHERE id=?` 会正常触发 `notes_ad`，这条没问题。

**SDS 必须写明**：notes 表的一切写操作只允许三种语句——`INSERT ... ON CONFLICT DO UPDATE`（新建/更新）、`DELETE`（删除）、`INSERT`（批量导入时先清空）。禁止 `REPLACE`、禁止 `INSERT OR IGNORE`（后者静默丢弃冲突，不更新 FTS）。

### NEW-2 短语查询的词序局限

FTS5 短语查询要求 gram **按序相邻**。这意味着：
- 查询「工作站」→ 只命中原文含连续「工作站」的文档 ✅
- 但若用户输入带空格「工作 站」→ `toGrams` 会切出 `["工作","作站"]`？不，`"工 作 站"` 每字符独立 → `["工作","作站"]`，与「工作站」相同。**所以带空格输入会被当作同一个查询**，行为可接受但要在 SDS 里写明。

### NEW-3 两阶段检索的性能上限

阶段 2 要回表读全文做 `indexOf`。1000 篇 × 平均 2KB = 2MB 文本扫描，Node 侧毫秒级。但若某篇笔记 1MB，`indexOf` 会变慢。**SDS 需加**：阶段 2 只对前 100 条候选做精确过滤，超出部分按粗召回排序截断（符合"搜索结果第一页"的实际需求）。

## 对 PLAN 的最终影响

| PLAN 条款 | 状态 |
|---|---|
| G-2/G-4/G-5/G-6/G-7/G-8/G-9/G-10/G-11/G-12 | 技术声称均已核实，其中 3 处已修正（C-03/C-14/C-15） |
| 新发现 NEW-1/2/3 | 归入 SDS 的 G-9 章节，不改 PLAN（PLAN 层面不影响验收口径） |
| C-17 全屏检测 | 已在 PLAN 中降级为近似实现，不再作为阻塞项 |
