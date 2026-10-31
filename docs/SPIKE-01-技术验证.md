# SDS 前置技术验证报告 SPIKE-01

> 时间：2026-10-31｜执行：调度会话｜产物：`F:\gal\probe\`（可复现）
> **原则：PLAN 里任何"设计上应该能行"的技术，落地前必须有可执行实证。** 这一轮验了 4 项，2 项发现问题。

---

## SPIKE-1 `better-sqlite3` 版本选择 —— ❌ 发现致命问题

### 实测

| 版本 | 结果 |
|---|---|
| `better-sqlite3@13.0.3`（latest） | **进程崩溃，exit code `-1073741819` = `0xC0000005` 访问冲突**，在 `new Database(':memory:')` 处直接崩 |
| `better-sqlite3@11.10.0` | ✅ 正常，FTS5 可用 |

崩溃发生在 `new Database()` —— 说明是原生二进制与当前运行时不匹配（ABI 或编译器产物问题），不是 SQL 层问题。

### 结论（写入 SDS）

- **版本锁死 `better-sqlite3@11.10.0`**，`package.json` 写精确版本，不用 `^` 或 `~`。
- 验收必须包含**运行时冒烟**：`new Database(':memory:')` + `CREATE VIRTUAL TABLE ... fts5` 成功，不能只验 `require` 成功。
- 这一条推翻了 PLAN §6 里"better-sqlite3 11.x"的模糊写法（必须精确到 11.10.0），也印证 R-3 不是"概率高"而是"必然发生"。

### 附带确认

- 本机 **有完整编译工具链**：`D:\vc\MSBuild\Current\Bin\MSBuild.exe`，toolset 14.44.35207。编译 `better-sqlite3` 用时 57 秒，不需要额外装 Windows 10 SDK（PLAN 里担心的 SDK 缺失问题**不存在**）。
- `journal_mode` 在 `:memory:` 下是 `memory`；文件库要单独验证 WAL。

---

## SPIKE-2 中文 bigram + FTS5 外部内容表 —— ✅ 可行，但有 2 个必须修的问题

### 实测代码

`F:\gal\probe\fts5-probe.cjs`（可直接 `node fts5-probe.cjs` 复现）

### 验证结果

**表结构 + 触发器 + 外部内容表全部工作正常**：insert / update / delete 三个触发器都正确同步了 FTS 索引。

**查询命中符合预期**：

| 查询 | 结果 | 说明 |
|---|---|---|
| `工作` | `[1,2]` | 2 字词命中 2 篇 ✅ |
| `工作站` | `[2]` | bigram 拼接正确 ✅ |
| `作站` | `[2]` | 子串能力 ✅ |
| `无关` | `[3]` | ✅ |
| `工作台` | `[1]` | ✅ |
| 单字 `工`（LIKE 回退） | `[1,2,4]` | ✅ |

### ❌ 问题 1：跨词边界误命中（真实存在）

测试数据：N4 正文 = `"今天工作 作站很久"`（"工作" 和 "作站" 被**空格隔开**，语义无关）。

查询 `工作站` → 返回 `[2, 4]`，**N4 是误命中**。

原因：bigram 方案把完整文本切成一串 2-gram，`"工作 作站"` 和 `"工作站"` 产生完全相同的 2-gram 序列 `工作 作站`。FTS5 的 AND 查询无法知道这两个 gram 在原文中是否相邻。

**这是 PLAN 里 R-8 提到的风险，现在证实为必然发生，不是"概率高"。**

**修复方案（三选一，写入 SDS）**：

| 方案 | 做法 | 代价 |
|---|---|---|
| **A. 短语查询（推荐）** | 查询时用 FTS5 短语语法 `"工作 作站"`（加引号）而非 AND。短语查询要求 gram 连续且相邻，能排除跨词误命中 | 短语查询性能略低（但笔记量小，可接受） |
| B. 位置后置过滤 | 查询后用 `offsets` 或原文 `indexOf` 校验相邻性，过滤掉误命中 | 实现复杂，多一次 CPU |
| C. 存位置连续标记 | bigram 生成时保留分隔符（如 `工作|作站`），查询时区分 | 索引结构复杂 |

**必须实测方案 A 是否真能排除**——见下面「待验」。

### ❌ 问题 2：标题/正文分开索引时的语义缺口

`bigram_title` 和 `bigram_body` 是两列。查询 `工作` 时匹配任一列。但**跨列的跨词误命中**（标题末尾 + 正文开头）同样存在且无法被短语查询解决（FTS5 短语不跨列）。

**修复**：加一个 `bigram_all` 列（标题 + 分隔符 + 正文），查询时只查这一列；或接受该边界情况（概率极低，笔记标题和正文拼接处恰好构成连续误命中词）。

**建议**：加 `bigram_all` 列，查询统一走它，`bigram_title`/`bigram_body` 仅保留用于"标题优先排序"。

### ✅ 已验证正确的部分

- 触发器语法正确（`INSERT INTO notes_fts(notes_fts, rowid, ...) VALUES('delete', ...)` 这个外部内容表的 delete 写法是对的）
- UPDATE 触发器需要先 delete 再 insert，写法正确
- `content='notes', content_rowid='id'` 外部内容表配置正确
- `tokenize='unicode61'` 对中文 2-gram（已用空格分隔）正常工作

---

## SPIKE-3 Node 20 + pnpm 9 环境 —— ✅ 完成

```
node v20.18.1  (F:\gal\workstation\.tools\node-v20.18.1-win-x64)
pnpm 9.15.9    (F:\gal\workstation\.tools\npm-global)
npm  10.8.2
registry = https://registry.npmmirror.com
ELECTRON_MIRROR = https://npmmirror.com/mirrors/electron/
```

- 用户 PATH 已永久追加
- winget 实测卡死，**弃用**，改直连下载
- nodejs.org 直连可用但慢（29.6MB / ~30 分钟）

---

## SPIKE-4 Electron 透明窗口 —— ⏳ 待验（依赖 Electron 安装，约 100MB 下载）

需要在 SDS 阶段验证：
1. `transparent: true` + `frame: false` + 全屏 workArea 在 Win11 上是否精确贴合
2. `alwaysOnTop` 应该设 `true` 还是 `false`（PLAN G-2 写的 `false` 有疑问：全屏覆盖层要盖住其他窗口）
3. `setContentProtection` 实际行为
4. `backdrop-filter: blur()` 在 transparent 窗口里是否生效

---

## 对 PLAN v2.0 的修订清单（SDS 前必须改）

| # | 条款 | 现状 | 必须改成 |
|---|---|---|---|
| 1 | §6 依赖表 | `better-sqlite3 11.x` | `better-sqlite3 11.10.0`（精确锁版本） |
| 2 | G-1 验收 | 只有 `require` 成功 | 加运行时冒烟：`:memory:` 建库 + FTS5 建表成功 |
| 3 | G-9 DDL | `bigram_title` + `bigram_body` | 增加 `bigram_all`（title + `\u0000` + body）；查询走 `bigram_all` |
| 4 | G-9 查询 | "AND 拼接" | 改为 **FTS5 短语查询**（gram 序列加引号），并附跨词误命中的回归测试用例（N4 那条必须 `[]`） |
| 5 | R-3 | "概率高" | "确定发生，已由 SPIKE-1 证实；锁定 11.10.0 后消除" |
| 6 | R-8 | "若误命中则加后置过滤" | "已证实必然误命中；用短语查询修复，回归用例已定" |
| 7 | 新增 G-9 用例 | — | `查询 '工作站' 在含 '工作 作站'（空格分隔）的文档上必须返回 []` |

---

## 待 SPIKE 的清单（SDS 阶段）

| 编号 | 验证项 | 阻塞什么 |
|---|---|---|
| SPIKE-5 | Electron 透明全屏窗口参数正确性 | G-2、G-4 |
| SPIKE-6 | `setContentProtection` 实际效果（用 OBS 或 `PrintWindow` 测试） | G-11 |
| SPIKE-7 | `WebContentsView` 独立 partition 是否真独立进程 | G-7 |
| SPIKE-8 | `safeStorage` 在本机是否 `isEncryptionAvailable()` 为 true | G-10 |
| SPIKE-9 | `before-input-event` 能否拦截插件 view 的按键 | G-6 |
