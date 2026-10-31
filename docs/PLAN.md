# PLAN —— ARK 工作站

> 阶段：P1 计划｜版本：**v3.2**｜最后修改：2026-10-31
> 变更依据：`reviews/ROUND-1-裁决.md`（30 条）+ `PLAN-REVIEW-03.json`（16 条）+ `PLAN-REVIEW-04.json`（18 条）+ `PLAN-REVIEW-05.json`（3 条）+ `docs/TECH-VERIFY.md`（18 项技术核验）
> **v3.x 修完三轮共 ~50 条 blocking**。v3.0 新增 §11 视图层、§12 插件契约两章；v3.1 修 CSP/webRequest 短路、worker-src、数据根、UPSERT 写路径；v3.2 修 N-12 与 G-12 互斥、per-partition 断言触发手段、G-2 恒真快照。
> 一句话：一个隐形开关唤出的、可插件扩展的个人创作与效率中枢。

---

## 1. 问题与背景

创作与效率工具散落成十几个独立软件，各有各的快捷键、主题、数据目录。切换成本高、视觉割裂、互相不联通。

需要一个"打开就是完整工作环境"的东西，且只属于我——不常驻、不弹窗、不打扰，只有我知道怎么唤出。

不做的后果：继续在 10 个窗口间 Alt-Tab；个人数据散在多家云服务，无法统一检索。

## 2. 目标（可验收）

> **S0 承诺 13 条**（G-1..G-13）。`[自动]` 表示有可执行断言，`[人工]` 表示必须填「操作→期望→实测+时间戳→证据路径」三列清单。
> **G-1..G-13 是唯一 DoD 表**；§9 不另列清单，只引用本表。

### G-1 构建基线 `[自动]`

**八条命令全部退出码 0**（G-1 是唯一权威命令组，§9 直接引用本表）：

```powershell
pnpm install      # 依赖安装；postinstall 完成 electron-rebuild
pnpm typecheck    # tsc --noEmit 零错误
pnpm lint         # eslint src/ plugins/ 零 error 零 warning（fixtures 目录被 ignore）
pnpm lint:fixtures # 对 plugins/fixtures/hardcoded-color 恰好 5 条错误（见 G-5）
pnpm test         # vitest 单测全绿
pnpm test:e2e     # playwright electron e2e 全绿
pnpm build        # out/main/index.js + out/preload/index.js + out/renderer/index.html
pnpm package      # release/ARK-<version>-x64.exe（NSIS per-user）
```

- 产物口径唯一：**`out/` = electron-vite 产物；`release/` = electron-builder 产物**。不存在 `dist/`。
- `engines.node` = `">=20 <21"`。
- **原生模块冒烟**（不许只验 `require`）：启动后 `new Database(':memory:')` 成功 + `CREATE VIRTUAL TABLE x USING fts5(a)` 成功 + `PRAGMA journal_mode` 在文件库上为 `wal`。
- **版本锁死**（SPIKE-1 实测）：`better-sqlite3@11.10.0`（精确，不带 `^`/`~`）。**13.x 在本机崩溃（exit 0xC0000005）**，见 `docs/SPIKE-01-技术验证.md`。
- `asarUnpack: ["**/*.node"]`。
- **NSIS 配置**：`oneClick: false, perMachine: false`（per-user 安装到 `%LOCALAPPDATA%\Programs\ARK`，保证 exe 同级目录可写）。

**依赖约束（B-08 采纳，集合相等，不用计数）**：

```js
// scripts/check-deps.mjs —— 三条断言，任一失败即非零退出（exit 1）
const ALLOWED_DEPENDENCIES = [           // 恰好 11 个，集合相等
  "electron", "react", "react-dom", "better-sqlite3", "zustand",
  "framer-motion", "@tanstack/react-virtual", "monaco-editor",
  "marked", "dompurify", "zod"
];
const ALLOWED_DEV_DEPENDENCIES = [       // 17 个，子集即可
  "typescript", "electron-vite", "electron-builder", "@electron/rebuild",
  "eslint", "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin",
  "tailwindcss", "postcss", "autoprefixer", "vitest", "@playwright/test",
  "@types/react", "@types/react-dom", "@types/better-sqlite3", "@types/marked", "vite"
];
// 断言1（集合相等，双向）：deps 的 key 集合 === ALLOWED_DEPENDENCIES 集合
//     → 少一个或多一个都失败。不存在"≤20"这种可绕过的口径。
// 断言2（子集）：devDeps 的 key 集合 ⊆ ALLOWED_DEV_DEPENDENCIES
// 断言3（防传递膨胀）：node_modules 顶层直接子目录数（排除 .bin/.cache）≤ 60
// 输出格式（两行，便于人工核对）：
//   dependencies: 11 / 11 [EXACT]
//   devDependencies: <n> / 17 [SUBSET]
```

- **不做"≤20 计数"**：计数口径永远可绕过（把库塞进 devDeps、依赖传递膨胀）。用集合相等，判断无歧义。
- **已删除 `electron-updater`**（B-08/N-13 采纳：无目标使用，且给"唯一出网"留口子）。
- **Tailwind 明确在 devDependencies**（构建期工具，不进运行时包）；其色板数据由 `scripts/gen-css-color-names.mjs` 生成到 `src/shared/css-color-names.ts`，运行时不依赖 tailwind。
- **不引入 dotenv**（`.env` 由自写 15 行 `load-env.ts` 处理，见 G-8）。
- 新增任一依赖 → 必须同时改 `check-deps.mjs` 白名单 + 记 ADR + 在任务报告写理由。三者缺一，CI 红。

### G-2 启动即隐形与呼出置顶 `[自动 + 人工]`

**(a) 构造参数快照 `[自动]`**

**★ R3-B-03 采纳：v3.0 写 `expect(new BrowserWindow(opts)).toMatchSnapshot()` 是恒真断言** —— `BrowserWindow` 实例序列化后是 `BrowserWindow {}` 之类，与 `opts` 无关；且 vitest 非 Electron 环境下 `new BrowserWindow()` 直接抛错。这条"九字段精确等于"实际从未生效。

**正确写法：把参数生成抽成纯函数，断言函数返回值的 deep equal。**

```ts
// src/shared/window-options.ts —— 无 Electron 依赖，可在 node 环境单测
export function buildWindowOptions(): Electron.BrowserWindowConstructorOptions {
  return {
    show: false, frame: false, transparent: true, skipTaskbar: true,
    alwaysOnTop: false, focusable: true, resizable: false,
    hasShadow: false, backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: PRELOAD_SHELL_PATH,
    },
  };
}
```
```ts
// tests/unit/window-options.test.ts
expect(buildWindowOptions()).toEqual({
  show: false, frame: false, transparent: true, skipTaskbar: true,
  alwaysOnTop: false, focusable: true, resizable: false,
  hasShadow: false, backgroundColor: '#00000000',
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
                    preload: expect.any(String) },
});
```
- `toEqual` 是**双向深比较**：多一个字段或少一个字段都失败 → 真正的"精确等于"。
- **`skipTaskbar` 只断言在构造参数里**。v3.0 那段"用 spy 断言 `setSkipTaskbar(true)` 被调用"已删除——构造参数已传 `skipTaskbar: true`，呼出序列里不会调用 `setSkipTaskbar`，spy 断言必然假失败（R3-N-05）。

**集成层只断言存在的 API**：`win.isVisible() === false`（`isSkipTaskbar()` 不存在）。

**(b) 呼出置顶与焦点 `[自动]`**（B-16 采纳，v2.0 缺这段，导致快照 `alwaysOnTop:false` 与"覆盖层"语义冲突）：

呼出序列固定为（写进单测的调用快照）：
```
1. win.setBounds(displayWorkArea)     // 见 §11 bounds 计算
2. win.setAlwaysOnTop(true, 'screen-saver')
3. win.show()
4. win.focus()
5. renderer: 播放入场动画
```
收起序列：
```
1. await flushAll()                   // 上限 1000ms
2. renderer: 播放退场动画
3. win.setAlwaysOnTop(false)
4. win.hide()
```
- 断言：呼出后 `win.isAlwaysOnTop() === true` 且 `win.isFocused() === true`。
- 断言：收起后 `win.isAlwaysOnTop() === false` 且 `win.isVisible() === false`。
- 说明：构造参数 `alwaysOnTop: false` 与呼出时 `setAlwaysOnTop(true)` **不矛盾**——前者是"启动瞬间不置顶"，后者是"呼出时才置顶"。这正是快照与序列两条断言并存的原因。

**(c) Alt-Tab 与任务栏 `[人工]`** —— 启动后按 `Alt+Tab` 截图，图中不含 ARK；任务栏无图标。记录时间戳与截图路径。

### G-3 呼出触发源：热键 + 边缘热区 `[自动 + 人工]`

> **手势移出 S0**（N-11）：uiohook-napi 只能观察不能吞事件；低级钩子受 `LowLevelHooksTimeout` 约束会被摘钩。S1 用 C# helper 进程 `WH_MOUSE_LL` 返回 1 实现。

**热键 `Ctrl+Alt+Space`**：

- 自动：`globalShortcut.register('Ctrl+Alt+Space', fn) === true` 且 `isRegistered(...) === true`；反注册后 false。
- 自动 e2e：`ARK_E2E=1` 且 **`app.isPackaged === false`** 时注册 `test:summon` IPC（B-14/N-14 采纳）。报告**必须**注明"未覆盖 OS 层按键注入"。
- **打包冒烟断言该通道不存在**：`pnpm package` 后 `invoke('test:summon')` 必须 reject。
- 注册失败 → 主界面显示"快捷键被占用"并提供改键入口，不静默失败。

**边缘热区**（默认关）：

- 实现：`setInterval(50ms)`（**与 R-6 统一为 50ms**，v2.0 的 220ms 是笔误）轮询 `screen.getCursorScreenPoint()`。
- 命中条件：光标距 `screen.getDisplayNearestPoint(pt).workArea` 任一边 **≤ 2px（DIP）** 且持续 **150ms** → 触发；触发后冷却 1000ms。
- 多屏：逐屏用各自 workArea；DPI 用 `display.scaleFactor` 换算，全用 DIP 比较。
- **抑制**：前台有全屏应用或演示模式开启时禁用。
- **四条断言**（B-03 + N-06 采纳）：
  1. 关闭开关 → 光标沿四边各划 1 次 → 2s 内轮询 10 次 `isVisible()` 恒 false
  2. 开关开启、光标在屏内自由移动 2s → 不呼出
  3. 开关开启、光标在**相邻两屏共边处**来回 → 不误判为边带（共边双向命中是 2px 边带的高危区）
  4. 开关开启、光标移到左边带停留 200ms → 1000ms 内 `isVisible()===true`
- CPU 预算（R-6 可测化）：热区开启状态下 60s 内主进程 CPU 时间增量 < 0.5s。

### G-4 覆盖层动效与自动收起 `[自动]`

**动效预算（B-02 采纳 —— 统一时间基准）**：

- `t0`：主进程 `win.show()` **返回后立即**取 `Date.now()`，通过 IPC 传给 renderer。
- `t1`：renderer 在 `onAnimationComplete` 里取 `Date.now()`。
- **两者都用 `Date.now()`**（同机、同 epoch，可跨进程比较）。v2.0 用 renderer `performance.now()` 是**恒真断言**（相对时基远小于 epoch，差值恒为巨额负数），这是假通过，已修正。
- 断言：连续 5 次呼出，**每一次** `t1 - t0 ≤ 320ms`（上界，不是 P50）。
- 冷启动后第一次单独打印、不参与断言。

**自动收起（B-04 采纳）**：

- `Esc` → 立即收起。
- 失焦收起**默认关闭**，开启后延迟 **3000ms**。
- 判据（N-11 采纳，v2.0 的"焦点在系统对话框"无 API 可判，已删）：
  ```js
  !win.isFocused()
    && !win.webContents.isDevToolsFocused()
    && BrowserWindow.getFocusedWindow() === null
  ```
  系统对话框场景用"失焦 ≥3s 后再判"规避。
- 收起前 `await flushAll()`，上限 1000ms；超时也收起但记 warn。
- e2e：呼出 → Ctrl+K → 打开笔记 → 在输入框连续输入 3s → 断言 `isVisible()===true`（验证插件 view 抢焦点不误触发收起）。

### G-5 主题引擎 `[自动]`

- `src/shared/tokens.ts` 是**唯一权威源**。构建期 `scripts/gen-tokens.mjs` 生成 `src/renderer/styles/tokens.css`（仅作**初始值**）。
- **运行期唯一写入点**（N-07 采纳）：`document.documentElement.style.setProperty('--ark-*', ...)`。`tokens.css` 与内联变量的权威关系：**内联优先，tokens.css 只提供初始值**。插件 view 由 preload 注入同一份内联变量（`<style id="ark-tokens">`），主题切换时主进程广播 `theme:changed` 重写。
- 单测：token 对象 → CSS 变量快照；`getPropertyValue('--ark-accent')` 在主题切换后变化。
- **颜色硬编码禁令**（5 类，B-06 采纳）：

| 码 | 拦截对象 | 数据来源 |
|---|---|---|
| `ARK-COLOR-1` | hex（`#rgb`/`#rrggbb`/`#rrggbbaa`） | 正则 |
| `ARK-COLOR-2` | `rgb()/rgba()/hsl()/hsla()/oklch()/lab()` | 正则 |
| `ARK-COLOR-3` | **CSS Color 4 全量 148 个命名色**（v2.0 写"140"是错的，会漏拦 8 个；`slate` 不是 CSS 具名色，属 Tailwind） | 脚本从规范全量表生成 `src/shared/css-color-names.ts` |
| `ARK-COLOR-4` | Tailwind 非 token 色阶 utility（`bg-slate-900`） | allowlist 反查 |
| `ARK-COLOR-5` | JSX 内联 `style` 里的颜色字面量 | AST |

- **命令拆两条**（B-09 采纳，v2.0 让 `pnpm lint` 既零错误又恰好 5 条错误，互斥）：
  - `pnpm lint` → 全仓零 error 零 warning，**fixtures 目录在 eslintignore 中**
  - `pnpm lint:fixtures` → 对 `plugins/fixtures/hardcoded-color/` 用 `--format json` 断言 `ruleId` 集合恰好 = `{ARK-COLOR-1..5}`

### G-6 命令面板 `[自动]`

**拆 6a / 6b**（B-06 采纳：v2.0 让 M7 验收依赖 M8 才交付的笔记插件，排期不可达）：

- **G-6a 匹配与交互**（M7 验收，用 fixture 命令集，不依赖任何真实插件）
- **G-6b 跨插件端到端**（M8 之后验收，`notes.new` 真实命令）

**捕获点（B-05 采纳 —— v2.0 只挂主 webContents，收不到插件 view 内的按键）**：

```js
// 统一 handler，挂到【所有】WebContents
function attachInputHook(wc) {
  wc.on('before-input-event', (event, input) => {
    if (!win.isVisible()) return;
    if (input.type === 'keyDown' && input.control && input.alt === false
        && input.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommandPalette();
    }
  });
}
// 调用点：主 renderer 创建后 + 每个插件 view 的 webContents 创建后（§11.5 生命周期）
```
- **e2e 必须包含**：焦点在插件 view 内按 Ctrl+K 仍能唤起面板。

**评分规则（N-12 采纳，消歧）**：
1. 连续子串（100）→ 2. 前缀（60）→ 3. 分词交集（30）→ 4. 使用频率（`command_usage` 表，测试可注入）→ 5. **id 字典序**
- 分词固定为「**CJK 单字 + 拉丁整词**」，不引入分词库。
- 性能：1000 条命令内 P95 < 16ms（单测）。

**层叠**：见 §11。命令面板是 **shell 层内的 React 路由**（不是 WebContentsView），打开时 `pluginView.setVisible(false)`，关闭恢复。

**G-6a 验收**：输入「新建」→ 断言首项 `id === 'fixture.new'`（fixture 命令）→ 回车 → 断言 fixture handler 被调用 1 次。
**G-6b 验收**：输入「新建」→ 首项 `notes.new` → 回车 → 断言笔记已创建（依赖 M8）。

### G-7 插件宿主与权限网关 `[自动]`

- **隔离**：每插件一个 `WebContentsView` + **独立 `partition: persist:plugin-<id>`**。
- **机制陈述修正**（B-07 rejected_claims 采纳）：partition 是**存储分区**；"独立 renderer 进程"是"一个渲染进程只服务一个 StoragePartition"这一实现约束的**副作用**，不是 Electron 文档契约。
- **因此必须显式断言进程隔离**：
  ```js
  const [a, b] = [viewA.webContents.getOSProcessId(), viewB.webContents.getOSProcessId()];
  expect(a).not.toBe(b);   // ← 这条才是"隔离"的判据
  ```
- **崩溃隔离**（A 死 B 活，v2.0 只 kill 一个，证明不了隔离）：
  ```
  1. kill viewA 的 pid
  2. 断言主进程收到 render-process-gone (reason=crash) 且 webContentsId === A
  3. 断言 viewB 仍可 evaluate（B 活着）
  4. 断言 Shell 仍可呼出、可执行命令
  5. 断言 A 的位置显示"插件已崩溃，点击重载"卡片
  ```
- manifest 校验与权限网关：**见 §12 全文**。
- 审计日志：`data/logs/audit-YYYYMMDD.ndjson`，字段 `{ts, level, pluginId, api, decision:"allow|deny", argsHash, task_id}`；10MB 轮转保留 5 份。

### G-8 数据层 `[自动]`

**结构**：`data/ark.db`（插件元数据 + 迁移版本）+ 每插件 `data/plugins/<id>.db`（ATTACH）。

**ATTACH 上限（实测）**：附加库上限 10 个（不含 main），第 11 个报 `too many attached databases`，故**同时最多 ATTACH 10 个插件库**。策略：LRU 保留最近 3 个，超出 detach；切换插件时 attach。单测断言第 11 个 attach 抛错且被优雅处理。

**数据根解析（B-15 + 04-B-14 采纳 —— v3.0 有两个致命 bug）**：

v3.0 的错误：①依赖 `.env` 但没人加载它；②顺位 2（exe 同级）优先于 3，而 **dev 模式下 `process.execPath` 是 `node_modules/electron/dist/electron.exe`**，于是数据被建到 `node_modules` 里，`pnpm install` 一重装就全丢。

修正版：
```js
function resolveDataRoot() {
  // 顺位 1：显式环境变量（最高优先级，本机 .env 会设它）
  if (process.env.ARK_DATA_DIR) return process.env.ARK_DATA_DIR;

  // 顺位 2：★ 按打包状态分流，不是按"exe 同级"分流
  if (!app.isPackaged) {
    // dev 模式 → 仓库根，绝不放 node_modules
    return path.join(app.getAppPath(), 'data');
  }
  // 打包后 → exe 同级（per-user 安装，%LOCALAPPDATA%\Programs\ARK，可写）
  const exeSibling = path.join(path.dirname(app.getPath('exe')), 'data');
  if (isWritable(exeSibling)) return exeSibling;

  // 顺位 3：最终回退，永远可写
  return path.join(app.getPath('userData'), 'data');
}
function isWritable(dir) {
  try { fs.mkdirSync(dir, {recursive:true}); fs.accessSync(dir, fs.constants.W_OK); return true; }
  catch { return false; }
}
```
- **启动时打印实际生效的数据根**（日志一行 `DATA_ROOT=<path>`），并在启动自检里断言：
  - dev 模式下路径**不含** `node_modules`
  - 路径不存在则创建；创建失败**直接报错退出**（不静默回落到别的目录）
- 单测：①`ARK_DATA_DIR` 未设 + dev → 解析到仓库根；②`ARK_DATA_DIR` 未设 + 模拟 `isPackaged=true` → 解析到 exe 同级；③设了 `ARK_DATA_DIR` → 直接用它。

**`.env` 加载（B-15 采纳 —— v3.0 无任何加载器）**：
- 自写 `src/main/load-env.ts`，**约 15 行**，只支持 `KEY=VALUE` 与 `#` 注释，不支持引号嵌套/多行。
- 调用时机：`app.whenReady()` **之前**，从「exe 同级 `.env`」与「仓库根 `.env`」读取；**已存在的 `process.env` 优先，不覆盖**。
- **不引入 dotenv**（保持依赖白名单 11 个）。
- 单测 3 条：正常解析、注释忽略、已有 env 不被覆盖。
- 本机 `.env`：`ARK_DATA_DIR=F:\gal\workstation\data`。

**单实例（N-08 采纳 —— "不产生第二个 WAL 写入者"不可观测）**：
- `app.requestSingleInstanceLock()`，失败 → `app.quit()`。
- 断言改为：第二次启动进程在 3s 内退出，主进程收到 `second-instance` 事件，且 `db` 未被重新打开（用打开计数 spy）。

**迁移**：`migrate(db, targetVersion, statements[])`，版本存 `PRAGMA user_version`。幂等验收：连续启动 3 次，`user_version` 不变，日志无 error。

**备份清单**：`data/` 整目录（`ark.db` + `plugins/*.db` + `logs/` + `secrets/`）。

### G-9 笔记插件 `[自动]`

**功能**：Markdown 编辑（Monaco）+ `[[双链]]` 自动补全 + 反向链接面板 + 全文检索 + 自动保存（debounce 800ms，收起前强制 flush）。

#### G-9.1 检索（B-04 采纳 —— 两阶段，位置校验为**必做**不是条件项）

**表结构**：

```sql
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  bigram_all TEXT NOT NULL          -- toGrams(title + "\n" + body).join(" ")
);
CREATE VIRTUAL TABLE notes_fts USING fts5(
  bigram_all, content='notes', content_rowid='id', tokenize='unicode61'
);
-- 三个触发器（SPIKE-2 实测语法正确）
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, bigram_all) VALUES (new.id, new.bigram_all);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, bigram_all) VALUES ('delete', old.id, old.bigram_all);
END;
CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, bigram_all) VALUES ('delete', old.id, old.bigram_all);
  INSERT INTO notes_fts(rowid, bigram_all) VALUES (new.id, new.bigram_all);
END;
```

**索引自愈**（N-01 采纳）：启动时若 `notes` 行数与 `notes_fts` 不一致，执行 `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')`；迁移脚本回填 `bigram_all`。

**★ 写路径（04-B-12 采纳 —— v3.0 只给触发器没给写语句，是个数据污染陷阱）**

**禁止使用 `INSERT OR REPLACE`**。原因：REPLACE 的内部删除阶段**不触发 DELETE 触发器**（`recursive_triggers` 默认 OFF），会导致 `notes_fts` 里残留旧词 → 检索返回已删除内容，且这种脏数据只在用户改过正文后才出现，极难复现。

**唯一允许的写语句**：
```sql
INSERT INTO notes(id, title, body, updated_at, bigram_all)
VALUES (@id, @title, @body, @updated_at, @bigram_all)
ON CONFLICT(id) DO UPDATE SET
  title      = excluded.title,
  body       = excluded.body,
  updated_at = excluded.updated_at,
  bigram_all = excluded.bigram_all;
```
- `ON CONFLICT DO UPDATE` 走 UPDATE 路径 → **`notes_au` 触发器正常触发** → FTS 旧行被 `'delete'` 掉、新行插入。
- 连接打开时显式设置：`db.pragma('recursive_triggers = OFF')`（保持默认，因为我们要靠 UPSERT 而非 REPLACE）。
- **完整性自检**（每次启动）：`INSERT INTO notes_fts(notes_fts) VALUES('integrity-check')`，失败则 `... VALUES('rebuild')` 并记 warn。
- **必须有的单测**：写入 → 检索命中 → **改正文（旧词移除）** → 断言**旧词命中数为 0**、新词命中数为 1。这条测例专杀 REPLACE 陷阱。

**`toGrams(s)`**：

```
逐字符扫描，累积三类 token：
  CJK 段：每个字符独立成 token（"工作站" → ["工","作","站"]）
  拉丁/数字段：整词一个小写 token（"v2" → ["v2"]）
  其他：丢弃（空格、标点）
对每个 token：
  CJK 且长度 ≥ 2 → 生成相邻 2-gram（"工","作","站" → ["工作","作站"]）
  CJK 且长度 == 1 → 保留单字（用于单字查询与 LIKE 回退判定）
  拉丁 → 保留整词
返回 grams 数组
```
示例（SPIKE-2 实测）：`"工作站架构"` → `["工作","作站","站架","架构"]`；`"贴图工作站 v2"` → `["贴图","图工","工作","作站","v2"]`。

**`buildQuery(q)` 与两阶段检索**（B-04 + N-02 + 04-B-11 采纳）：

> **★ 单列设计消除了 title/body 布尔结构的歧义**：因为我们只建一个 `bigram_all`（= title + `\n` + body 的 2-gram），查询只对**一列**做短语匹配，不存在 v2.0 那种 `(t:a OR b:a) AND (t:b OR b:b)` 的括号不确定问题。

```
阶段 1（粗召回）：FTS5 短语查询，要求 gram 顺序且相邻
  const match = '"' + grams.join(' ') + '"'
  SELECT notes.* FROM notes_fts JOIN notes ON notes.id = notes_fts.rowid
  WHERE notes_fts MATCH ? ORDER BY notes.updated_at DESC
  -- 注意：无论多少 gram，都只查 bigram_all 一列，绝不写成 col:a AND col:b

阶段 2（精确过滤，必做）：回表取 title + "\n" + body，校验查询串在原文中连续出现
  verifyContiguous(text, grams)：
    从 text 中找 grams[0] 的每个出现位置 i
    检查 text.slice(i+k, i+k+grams[k].length) === grams[k] 对所有 k 成立
    任一位置连续成立 → 保留；否则丢弃

单字 CJK 查询：直接走 LIKE（bigram 无法表达单字）
纯拉丁查询：前缀匹配 g + '*'，再按 includes 过滤

FTS5 查询串转义规则（04-B-11 采纳）：
  - grams 里每个元素两侧加双引号：'"工作 作站"'
  - gram 内部若含双引号（不可能，因为只含中日韩/字母/数字）→ 无需转义
  - 若某个 gram 为空串 → 直接返回空结果（不构造 MATCH）
```

**性能预算（Q-05 采纳，因加精确过滤放宽）**：1000 篇笔记内 P95 < **80ms**（v2.0 是 50ms）。

**固定语料与期望值（含 B-04 要求的负例 N4）**：

测试用显式 `updated_at`（1000/2000/3000/4000/5000）插入，消除排序抖动（N-03 采纳）。

| 笔记 | title | body | updated_at |
|---|---|---|---|
| N1 | 工作台 | 工作台 | 1000 |
| N2 | 工作站架构 | 工作站架构 | 2000 |
| N3 | 无关内容 | 无关内容 | 3000 |
| **N4（负例）** | 干扰项 | `今天工作 作站很久` | 4000 |

| 查询 | 期望（updated_at desc） | 验证点 |
|---|---|---|
| `工作` | `[N4, N2, N1]` | 2 字词命中 3 篇（N4 确实含"工作"） |
| **`工作站`** | **`[N2]`** | **★必须排除 N4 —— 这是 v2.0 的验收盲区，SPIKE-2 实测 AND 会误命中 `[N2,N4]`，短语+位置校验返回 `[N2]`** |
| `作站` | `[N4, N2]` | N4 原文确实含"作站"字面，正确命中 |
| `工作台` | `[N1]` | 3 字词 |
| `无关` | `[N3]` | 2 字词 |
| `工`（单字） | `[N4, N2, N1]` | LIKE 回退 |
| `架构` | `[N2]` | 2 字词 |
| `xyz` | `[]` | 不存在 |

> **SPIKE-2 已实测**：AND 查询 `工作站` → `[2,4]`（误命中）；短语查询 → `[2]`（排除）；短语+位置校验 → `[2]`（双重保险）。见 `docs/SPIKE-01-技术验证.md` 与 `F:\gal\probe\final2.cjs`。

**高亮**：不用 `snippet()`（返回带空格的二元串，偏移对不上原文）。应用层在原文 `indexOf` 匹配后渲染 `<mark>`。

#### G-9.2 `[[双链]]` 自动补全（B-13 采纳 —— v2.0 零条款）

**触发规则**：
- 在 Monaco 编辑器中，检测光标前文本匹配 `/(?:^|[^\[\]])\[\[([^\[\]\n]{0,50})$/` → 触发补全。
- 查询串 = 第二个 `[[` 之后到光标的文本。
- 取消：`Esc`、光标移出该 `[[` 范围、输入 `]]`。

**候选来源与排序**：
```sql
SELECT id, title FROM notes
WHERE title LIKE '%' || ? || '%'
ORDER BY
  CASE WHEN title = ? THEN 0            -- 完全相等优先
       WHEN title LIKE ? || '%' THEN 1  -- 前缀
       ELSE 2 END,                      -- 包含
  updated_at DESC
LIMIT 20
```
- 空查询串 → 返回最近更新的 20 篇。

**插入格式**：`[[标题]]`（按标题链接，可读性优先）。
- 若存在**重名标题**：插入 `[[id:123|标题]]` 消歧。
- **链接解析**：正则 `/\[\[(?:id:(\d+)\|)?([^\[\]|]+)\]\]/g`；有 `id:` 前缀按 id 解析，否则按 title 精确匹配（大小写敏感、去首尾空格）；匹配不到 → 视为**失效链接**，UI 用虚线+警示色显示，不报错。

**验收（2 条）**：
1. 在空笔记输入 `[[工` → 候选中含 N1「工作台」与 N2「工作站架构」→ 回车选中 N1 → 断言文档文本含 `[[工作台]]`，且 N1 的反向链接面板出现本条。
2. 创建两篇同名「测试」笔记 → 在第三篇输入 `[[测` → 选中第二个 → 断言插入的是 `[[id:xxx|测试]]` 形式。

**反向链接验收**：N1/N2/N3 互相链接成环（N1→N2→N3→N1），断言每篇反向链接面板各显示 **1** 条。

#### G-9.3 自动保存 `[自动]`
- debounce 800ms 写库。
- 收起前由 `flushAll()` 强制同步写。
- 断言：输入 → 立即触发收起 → 重新打开 → 内容完整（覆盖 G-4 的丢稿风险）。

### G-10 AI 门面 `[自动]`

**Key 存储（B-11 采纳 —— v2.0 只写 true 分支）**：
```js
if (!safeStorage.isEncryptionAvailable()) throw new AiError('E-AI-008');
const enc = safeStorage.encryptString(key);
fs.writeFileSync(secretsPath, enc);   // data/secrets/ai.bin
```
- **不可用时拒绝保存，绝不落明文**（E-AI-008）。
- Windows 上 safeStorage 走 DPAPI（绑定当前用户 SID + 本机）。**换机器或换 Windows 用户都会解密失败** → `E-AI-002`。

**调用边界**：`ai.chat()` 只在主进程实现；preload 只暴露 `ark.ai.chat({messages, model})`；返回值不含 key 与原始 header。

**错误码全表（9 个，B-11 采纳补 3 个）**：

| 码 | 条件 | 重试 |
|---|---|---|
| `E-AI-001` | 未配置 Key | — |
| `E-AI-002` | 解密失败（换机器/换用户） | — |
| `E-AI-003` | 上游 401 认证失败 | — |
| `E-AI-004` | 上游 429 限流 | — |
| `E-AI-005` | 网络不可达 | 重试 1 次 |
| `E-AI-006` | 超时（30s） | — |
| `E-AI-007` | **上游 5xx（重试 1 次后仍失败）** | 已重试 |
| `E-AI-008` | **safeStorage 不可用（拒绝保存）** | — |
| `E-AI-009` | **Key 为空或格式非法（不以 `sk-` 开头或长度 < 20）** | — |

**验收**（每条一个 mock 用例）：
- 请求体 `{model, messages}` 正确
- 9 个错误码各自映射正确，含「5xx 两次后返回 007」
- `Select-String -Path data/secrets/* -Pattern 'sk-'` 期望 0 命中
- 把 `ai.bin` 拷到另一 Windows 用户下解密 → `E-AI-002` 且 Shell 不崩

### G-11 隐匿三件套 `[自动 + 人工]`

**不进任务栏/Alt-Tab**：见 G-2。

**防截屏**：`win.setContentProtection(true)`，可开关，状态持久化。

- **行为说明修正**（B-12/N-04 rejected_claims 采纳）：Win10 2004+ 使用 `WDA_EXCLUDEFROMCAPTURE`，对 DWM 合成与 **DXGI Desktop Duplication（OBS 显示器捕获默认路径）都生效**，被捕获区域为黑。v2.0 写"OBS 不受约束"**是错的**。
- **真实局限**：①采集卡、手机拍屏（硬件路径）确实不受约束；②`transparent: true` 属**分层窗口**，`SetWindowDisplayAffinity` 在部分驱动/环境下**静默不生效**，且 `setContentProtection` 无返回值可判。
- **验收 `[人工]`**：开启后用**手机拍屏**（不用 capturePage，它走 Chromium 合成器绕开 WDA，必然假阳性），确认窗口区域为黑；关闭后恢复。记录照片路径。
- **M10 前置实验**：透明窗口下开启防截屏后，用外部截图工具（Win+Shift+S）验证；失败则提示"关闭透明背景或降级为不透明"。

**演示模式**：
- `manifest.json` 字段 **`ui.private: boolean`（默认 false）**。
- 开启后：私密插件在命令面板与列表均不出现；`WebContentsView` 被 **destroy**（不是仅隐藏）。
- 路径脱敏：`<DATA_DIR>`→`<DATA>`、`C:\Users\<用户名>`→`<USER>`、IPv4→`<IP>`。

### G-12 网络出口白名单 `[自动]`

**CSP（所有窗口与插件 view）**（N-05 采纳补 worker-src / font-src）：
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
worker-src 'self' blob:;
connect-src 'self'
```
- `worker-src` 必须含 `blob:`：Monaco 的语言服务 worker 在 Vite/Electron 下以 blob URL 创建，只写 `'self'` 会让补全/语法检查静默失效（editor 能显示但不能用）。
- 放宽 blob: 不构成出网风险：worker 仍受 `connect-src 'self'` 约束。
- 断言：打开笔记 → 编辑器内 `Ctrl+Space` 出现补全 → DevTools console **无 CSP 违规**。

**★ 两条防线不是串联短路（B-10 采纳，v3.0 的验收断言互斥，已修正）**

v3.0 写「插件 fetch 必须 reject **且** 审计出现 E-NET-001」——这是**不可能同时成立**的：CSP 先拦，请求根本没发出，webRequest 不被调用，审计不会有记录。改为**两段独立、可区分**的断言：

| 段 | 触发手段 | 断言 | 证明什么 |
|---|---|---|---|
| **CSP 段**（renderer 侧） | `plugins/fixtures/net-escape` 里 `fetch('https://example.com')` | ① fetch 抛 `TypeError` ② console 有 `Refused to connect` CSP 违规 ③ **审计日志无 `E-NET-001`** | CSP 是第一道防线，且确实生效 |
| **webRequest 段**（主进程侧） | 主进程用 `net.request({url:'https://example.com'})`（不受 CSP 约束） | ① 请求被 `cancel` ② 审计日志**有** `E-NET-001` | 第二道防线独立生效，覆盖 CSP 拦不到的路径 |

**白名单规格（B-10 采纳，v3.0 缺失）**：
- **存储**：`ark.db` 的 `settings` 表，key = `net.allowlist`，值为 host 数组（JSON）。
- **写入 IPC**：`net:setAllowlist`（仅 Shell 可调，插件不可）。
- **生效时机**：写入后**下一次请求立即生效**，无需重启（`netGuard` 是内存 Set，写入后同步更新）。
- **校验**：只允许 `https://`；只允许精确 host（含端口），不接受通配与 IP 字面量（`169.254.169.254`、`127.0.0.1` 一律拒绝）。
- **重定向**：`onBeforeRedirect` 对目标 host 再过一次闸，不在白名单则 cancel。
- **默认值**：空。用户配置 AI 端点后加入（如 `api.deepseek.com`）。

**webRequest 白名单（B-14 采纳 —— per-session，必须挂到每个 partition）**：
```js
const netGuard = new Set();   // 用户配置后填充，默认空
const ALLOW_LOOPBACK = false; // IP 字面量一律拒绝

function ensureNetGuard(sess) {
  sess.webRequest.onBeforeRequest((details, cb) => {
    // file:// 与 ark:// 是内部资源，放行
    if (details.url.startsWith('file://') || details.url.startsWith('ark://')) {
      return cb({ cancel: false });
    }
    let host;
    try { host = new URL(details.url).host; } catch { 
      audit.log({ api:'net', decision:'deny', code:'E-NET-001', url:details.url });
      return cb({ cancel: true }); 
    }
    if (netGuard.has(host)) return cb({ cancel: false });
    audit.log({ api:'net', decision:'deny', code:'E-NET-001', url:details.url });
    cb({ cancel: true });
  });
  // 重定向再过一次闸（B-10 采纳）
  sess.webRequest.onBeforeRedirect((details) => {
    try {
      const h = new URL(details.redirectURL).host;
      if (!netGuard.has(h)) {
        audit.log({ api:'net', decision:'deny', code:'E-NET-001', url:details.redirectURL, phase:'redirect' });
        details.cancel = true;
      }
    } catch { details.cancel = true; }
  });
}

// ★ 调用点清单（缺一不可，B-14 采纳）
//   1. defaultSession（Shell 自己）
//   2. 每个插件 view 创建【之前】：
//        ensureNetGuard(session.fromPartition(`persist:plugin-${id}`))
//   3. 每次新增 partition（插件安装 / 首次加载 / 从演示模式重建）
```
- **v3.0 的缺陷**：只写了"主进程 session"，而插件在独立 partition（独立 Session），请求根本不经过 defaultSession → 白名单形同虚设。

**★ 触发手段必须绕开 CSP（R3-B-02 采纳 —— 否则与上面 CSP 段的"审计无 E-NET-001"互斥）**

| 段 | 触发手段 | 为何不被 CSP 短路 | 断言 |
|---|---|---|---|
| **A. 插件 partition 内被拦** | 在主进程用 `session.fromPartition('persist:plugin:fixture').net.request('https://example.com')` 发请求 | 主进程的 `net.request` 走该 Session 的网络栈，**不经过任何 renderer 的 CSP** | 请求 error/cancel + 审计有 `E-NET-001` |
| **B. 插件 renderer 侧被 CSP 拦** | 插件 fixture 里 `fetch('https://example.com')` | 被 CSP `connect-src 'self'` 拦在渲染进程 | fetch 抛 TypeError + **审计无** `E-NET-001` + console 有 CSP 违规 |

两段**分开跑、分开断言**。A 证明 webRequest 闸在插件 partition 上生效，B 证明 CSP 是第一道防线。**禁止**要求同一次请求同时满足两者。

- `setPermissionRequestHandler` **全部拒绝**（S0 不读剪贴板，无任何例外）。此条与 N-12 的反向断言（`rg 'clipboard\.readText'` 期望 0 命中）一致：代码里**不会**出现 clipboard 读取实现。

### G-13 文档与从零复现 `[人工 + 自动]`

- README：环境要求、`pnpm install` 可能耗时（首次下载 Electron ~100MB + 编译原生模块）、`.env` 样例、启动/呼出/退出/备份、已知局限（防截屏只防软件采集、手势 S1 才有、热区默认关）。
- ADR 必须含 6 条：①窗口两态参数 ②插件隔离（partition + pid 断言）③数据层（ATTACH，最多 10 库，LRU 保 3）④FTS bigram 两阶段检索 ⑤AI 密钥（DPAPI，换机失效）⑥隐匿三件套及局限。
- **验收**：同一台机器新建目录 clone + install + `pnpm dev`，**记录实测耗时**（不设上限，因网络与编译不可控）。

## 3. 非目标

- N-1 不自己实现视频编解码、图像算法、音频合成引擎
- N-2 不做账号系统、云同步、多用户
- N-3 不做在线插件市场
- N-4 不做移动端、网页版
- N-5 不做 3D 建模引擎、多轨视频特效
- N-6 不做本地大模型（RTX 3050 Laptop 4GB 显存）
- N-7 不做插件热更新
- N-8 不做开机自启
- N-9 不做多语言
- N-10 不做跨平台
- N-11 S0 不做鼠标手势（S1 用 C# helper）
- **N-12 S0 不做终端、文件搜索、截图取字、画布、剪贴板读取**
  - **可执行反向断言（B-10 + R3-B-01 采纳 —— 三处修正）**：
    1. v2.0 用 PowerShell 不支持的 `**` 通配 → 改 `rg`（真正递归，且无命中时退出码为 1，可直接断言）
    2. v2.0 的 Pattern 含 `clipboard` 与 G-12 的 `clipboard-read` 例外互斥 → **已彻底删除 G-12 的 `clipboard-read` 例外**（§12.5 同步），S0 权限处理器**全部拒绝**，故 `clipboard` 可以安全地留在 Pattern 里
    3. `canvas` / `screenshot` 这类词会误命中 Monaco 的类型引用与防截屏注释 → 收紧为能力级写法，并**排除注释行与 .d.ts**

    ```bash
    # rg 真正递归；--glob 排除注释密集区；命中即退出码 0 → 断言失败
    rg -n --glob '!node_modules' --glob '!.git' --glob '!*.d.ts' \
       -e 'xterm' -e 'node-pty' -e 'desktopCapturer' \
       -e 'clipboard\.readText' -e 'screen\.capture' \
       -e 'filesearch' -e 'node-ocr' \
       src plugins
    # 期望：命中数 0，退出码 1
    ```
    - 若某处确需出现上述字符串（例如 README 局限说明），必须写在该文件顶部的 `/* ark-boundary-allow */` 区块之后，且 rg 命令加 `--glob '!docs/**'`。
    - **断言脚本**：`scripts/check-boundaries.mjs` 以 `spawnSync` 调 rg，`status === 1 && stdout === ''` 为通过；否则打印命中并退出 1。

## 4. 用户与场景

| 场景 | 频次 | 关键诉求 |
|---|---|---|
| 写代码时呼出，切 workspace | 每天多次 | 快、不打断、视觉统一 |
| 记想法，`[[链接]]` 到已有笔记 | 每天 | 双链 + 检索（1000 篇 P95 < 80ms） |
| 录屏/投屏时不出现在画面 | 偶发 | 防截屏（软件采集路径）+ 演示模式 |
| 换电脑搬走 | 一年几次 | `data/` 拷走即用 |

## 5. 约束

- **技术**：Electron 33.x + React 18.x + TS 5.x + Vite 5.x + electron-vite 2.x + electron-builder 25.x + Tailwind 3.x（devDependency）；pnpm 9.x
- **Node**：只认 20 LTS（`>=20 <21`）
- **better-sqlite3**：**精确 11.10.0**（SPIKE-1 实测 13.x 崩溃）
- **环境**：Win11 家庭中文版；Ryzen 7 5800H；16GB；RTX 3050 Laptop 4GB；C 盘 46GB / F 盘 291GB
- **数据根**：`ARK_DATA_DIR` → （`app.isPackaged` ? exe 同级 `data/` 若可写 : 仓库根 `data/`）→ `%APPDATA%\ARK\data`；本机 `.env` 设 `F:\gal\workstation\data`
- **依赖**：见 G-1 三条断言（dependencies **集合相等 11 个** + devDependencies ⊆ 17 个名单 + 顶层目录 ≤ 60）。**不用计数口径**。
- **隐私**：笔记/文件内容不出网；唯一出网路径是主进程 AI 调用（受 G-12 白名单约束，per-session 全挂）
- **工期**：S0 **15 个工作日**（§8 人日加总 14.5，单人串行无重叠）。双人并行 M6/M8 可压到约 11 天。

## 6. 外部接口与依赖

| 依赖 | 版本 | 用途 | 风险 | 备选 |
|---|---|---|---|---|
| Node.js | 20.x LTS | 构建 | 低 | 无 |
| pnpm | 9.x | 包管理 | 低 | npm |
| Electron | 33.x | 桌面壳 | 中 | Tauri（不选） |
| electron-vite | 2.x | 构建 → `out/` | 低 | 手写 esbuild |
| electron-builder | 25.x | NSIS per-user → `release/` | 中 | electron-forge |
| **better-sqlite3** | **11.10.0 精确** | 本地库 | **已确认：13.x 崩溃** | sql.js（WASM，FTS5 支持不全） |
| @electron/rebuild | 3.x | ABI 重建 | 中 | 预编译二进制 |
| zod | 3.x | manifest 校验 | 低 | 手写 |
| Framer Motion | 11.x | 动效 | 低 | CSS |
| Monaco Editor | 0.52.x | 笔记编辑器 | 中（体积） | CodeMirror 6 |
| OpenAI 兼容 API | — | AI | 中 | 任一兼容端点 |
| Playwright | 1.4x | e2e | 低 | 手工 |

> 本机 **MSVC 工具链完整**（`D:\vc\MSBuild`，toolset 14.44.35207），编译 better-sqlite3 用时 57s，**不需要 Windows 10 SDK**。

## 7. 风险登记

| ID | 风险 | 概率 | 影响 | 缓解 | 触发信号 |
|---|---|---|---|---|---|
| R-1 | 功能贪多、烂尾 | 高 | 致命 | S0 只 13 条 + N-11/N-12 可执行边界（rg 断言） | 任一任务卡 > 300 行 |
| R-2 | 热键被占用 | 中 | 中 | 注册失败显式提示 + 可改键 | `register()` false |
| R-3 | better-sqlite3 ABI 不匹配 | **已确认发生** | 高 | **锁定 11.10.0**（13.x 实测崩溃）+ 运行时冒烟（不只 require） | `0xC0000005` 或 `NODE_MODULE_VERSION` |
| R-4 | `setContentProtection` 在透明窗口下静默失效 | 中 | 中 | 默认关；M10 前置实验；失败降级为不透明背景 | Win+Shift+S 能拍到内容 |
| R-5 | 插件 view 层叠遮住模态 | **已消除** | — | §11 定义视图树 + `setVisible(false)` | — |
| R-6 | 热区 50ms 轮询 CPU 占用 | 中 | 低 | 默认关；仅开关开启时起 timer；CPU 预算断言 < 0.5s/60s | 空闲 CPU > 1% |
| R-7 | 多屏/高 DPI 定位错误 | 中 | 中 | 逐屏 workArea + scaleFactor；含共边负向用例；**本机有虚拟显示器要测** | 覆盖不全/黑边 |
| R-8 | bigram 跨词误命中 | **已证实必然发生** | **中**（v2.0 标"低"是错的） | 语料含负例 N4 + **短语查询 + 位置校验为必做**（SPIKE-2 实测有效） | 2 字词命中数与 2-gram 出现次数不符 |
| R-9 | 插件 view 抢焦点误触发收起 | **已消除** | — | 判据用 `getFocusedWindow()===null` + 失焦收起默认关 | — |
| R-10 | 首次 install 慢（~1MB/min） | 高 | 低 | README 标明；G-13 只记录不设上限 | 安装 > 15 分钟 |
| **R-11** | ATTACH 超 10 个库失败 | 中 | 中 | LRU 保留 3 个；单测断言第 11 个被优雅处理 | `too many attached databases` |
| **R-12** | **排期 14.5 人日无缓冲** | **高** | **中** | 里程碑滑期时**砍范围不砍验收**：优先砍 G-12 的自定义端点动态白名单（S0 只留内置 DeepSeek 静态白名单）、砍 G-3 边缘热区（只留热键）、砍 G-11 演示模式（只留防截屏）。**绝不**把验收降级为"实现了但没验收" | 任一里程碑超期 ≥1.5 人日 |

## 8. 里程碑（严格串行，半日粒度，无重叠）

| 里程碑 | 内容 | 出口条件 | 日（半日槽） | 人日 |
|---|---|---|---|---|
| M0 | 环境就绪 | `node -v`=v20.x；`pnpm -v`=9.x；`electron-rebuild` 冒烟通过 | D1 上午 | 0.5 |
| M1 | 计划定稿 | 本 PLAN v3.1 通过 round-3 评审（blocking 清零） | D1 下午 | 0.5 |
| M2 | SDS 定稿 | 每模块接口+错误路径+验收用例齐备；自足性测试通过 | D2 AM – D3 PM | 2.0 |
| M3 | 骨架可构建 | G-1 全绿（含 `--dir` 闸 A + NSIS 闸 B + 原生模块冒烟） | D4 AM – D5 AM | 1.5 |
| M4 | 窗口层 | G-2、G-4、G-5 全绿 | D5 PM – D7 AM | 2.0 |
| M5 | 数据层 | G-8 全绿（ABI 冒烟、单实例、迁移幂等、ATTACH LRU） | D7 PM – D8 AM | 1.0 |
| M6 | 插件宿主与网关 | G-7 + G-12 全绿（双插件 pid 断言、崩溃 A 死 B 活、per-partition 白名单、CSP 双段验收） | D8 PM – D10 AM | 2.0 |
| M7 | 命令面板 6a | G-6a 全绿（fixture 命令集，不依赖笔记） | D10 PM | 0.5 |
| M8 | 笔记插件 | G-9 全绿（双链补全、两阶段检索、负例 N4、UPSERT 写路径） | D11 AM – D12 PM | 2.0 |
| M9 | 命令面板 6b + AI | G-6b（notes.new 端到端）+ G-10 全绿 | D13 AM – D13 PM | 1.0 |
| M10 | 隐匿三件套 | G-3（热键+热区）、G-11 全绿（含防截屏前置实验） | D14 AM – D14 PM | 1.0 |
| M11 | 文档与终审 | G-13 通过；G-1..G-13 全部验证通过 | D15 AM | 0.5 |

**硬串行依赖链**：`骨架 → 窗口层 → 数据层 → 插件宿主 → 命令面板6a → 笔记 → 命令面板6b+AI → 隐匿 → 文档`

**算术校验**：`0.5+0.5+2.0+1.5+2.0+1.0+2.0+0.5+2.0+1.0+1.0+0.5 = 14.5 人日`
**工期**：14.5 人日 → **15 个工作日**（D1–D15），单人串行，无重叠，无缓冲（缓冲见 R-12）。

> 若需压缩：M6 与 M8 是唯二可拆给第二人并行的（文件不重叠），双人可压到约 11 天。

## 9. 验收总表

**唯一命令组**：见 G-1（八条命令）。§9 不重复列举，避免两处集合不一致（N-15 采纳）。

**自动验收**：G-1、G-2(a)(b)、G-3（四条断言）、G-4、G-5、G-6a、G-6b、G-7、G-8、G-9、G-10、G-12
**人工清单**（操作→期望→实测+时间戳→证据路径）：G-2(c) Alt-Tab 截图、G-11 防截屏拍照、G-13 从零复现计时、G-3 热区手工复核

> **共 13 条（G-1..G-13）**：其中 **9 条纯自动**（G-1、G-4、G-5、G-6、G-7、G-8、G-9、G-10、G-12）、**0 条纯人工**、**4 条混合**（G-2、G-3、G-11、G-13 各有自动段 + 人工段）。9 + 4 = 13。M11 的出口判据是这 13 条逐条通过，不是子集。

## 10. 开放问题

| ID | 问题 | 结论 | 状态 |
|---|---|---|---|
| Q-1 | 呼出方式 | S0：热键（开）+ 热区（关）；手势 S1 | CLOSED |
| Q-2 | AI 通道 | 纯云端 OpenAI 兼容，默认 DeepSeek；safeStorage | CLOSED |
| Q-3 | 桌面形态 | 全屏覆盖层，按光标屏 workArea | CLOSED |
| Q-4 | 第一插件 | 笔记（Markdown + 双链 + 两阶段检索） | CLOSED |
| Q-5 | 数据目录 | 三级解析 + `.env` 自写加载器；本机 F 盘 | CLOSED |
| Q-6 | 主题 | 深空暗色 + 玻璃拟态；内联变量为运行期唯一写入点 | CLOSED |
| Q-7 | Node | 20 LTS + pnpm 9 | CLOSED |
| Q-8 | 插件隔离 | 独立 WebContentsView + partition + **显式 pid 不等断言** | CLOSED |
| Q-9 | 中文分词 | 2-gram 预切分 + FTS5 + **短语查询 + 位置校验两阶段** | CLOSED |
| Q-10 | 产物目录 | `out/` + `release/`（NSIS per-user） | CLOSED |
| Q-11 | 模态层叠 | §11 视图树；命令面板是 shell 层 React 路由 | CLOSED |
| Q-12 | 权限语法 | §12 全文 | CLOSED |
| Q-13 | 防截屏验收 | 人工手机拍屏（capturePage 绕开 WDA） | CLOSED |
| Q-14 | 失焦收起 | 默认关；开启 3s；flush 上限 1s | CLOSED |
| Q-15 | 手势 | S0 不做 | CLOSED |
| Q-16 | §11/§12 归属 | **已作为正式章节写入本 PLAN**（不再"以 SDS 为准"） | CLOSED |
| Q-17 | 依赖口径 | dependencies 集合相等（11 个）+ devDependencies ⊆ 名单 | CLOSED |
| Q-18 | 命令面板承载层 | shell 层 React 路由（不是 WebContentsView） | CLOSED |
| Q-19 | M7/M8 是否合并 | 不合并，拆 G-6a（M7）/G-6b（M9） | CLOSED |
| Q-20 | 检索精确过滤 | 短语查询+位置校验为 **S0 必做**；P95 放宽到 80ms | CLOSED |
| Q-21 | 安装模式 | NSIS per-user（`perMachine: false`） | CLOSED |

**留给你定的 3 个（不阻塞 PLAN，SDS 前给答案）**：
- **P-1** 防截屏验收接受"人工手机拍屏"吗？（替代：写 WGC 采集进程做像素断言，+1 天）
- **P-2** 玻璃拟态强度：强 blur 32px / 中 20px / 弱 12px
- **P-3** 呼出后是否透出桌面壁纸（`transparent` + 半透明底）还是纯不透明深色底

---

## 11. 视图层契约（v3.0 新增）

### 11.1 视图树

```
BrowserWindow (root)
├── webContents = Shell renderer（React）
│   ├── 桌面/图标网格
│   ├── Dock
│   ├── 命令面板（React 路由，模态层）
│   ├── 设置页（React 路由，模态层）
│   └── Toast/通知（React 层）
└── contentView (BaseWindow.contentView)
    └── pluginView: WebContentsView   ← 每插件一个，z 序在 Shell webContents 之上
```

**关键事实**：`WebContentsView` 是 `contentView` 的子视图，**恒画在 BrowserWindow 自带 webContents 之上**。所以 Shell 的 React 模态会被插件 view 遮住——这就是 v1.0 的架构炸弹。

### 11.2 z 序与模态规则

| 状态 | 插件 view | 说明 |
|---|---|---|
| 桌面态（无插件打开） | 无 view 或 `setVisible(false)` | 只有 Shell 层可见 |
| 正常使用插件 | `setVisible(true)`，bounds = 内容区 | Shell 的 Dock/标题栏可见（它们在插件 view 之外的边距区） |
| **打开命令面板 / 设置 / 任何模态** | **`setVisible(false)`** | 关闭模态后恢复 `setVisible(true)` 并 `focus()` |
| 演示模式隐藏私密插件 | **`destroy()`** | 不是隐藏，防内存残留被截 |

### 11.3 bounds 计算

```ts
// 唯一入口，任何尺寸变化都必须走它
function computePluginBounds(display: Electron.Display, chrome: ChromeMetrics): Electron.Rectangle
// display: screen.getDisplayNearestPoint(cursorPoint)
// chrome: 由 Shell 测得的顶部栏高度 + 底部 Dock 高度（DIP）
// 返回 DIP 矩形：{x: workArea.x, y: workArea.y + chrome.top,
//                width: workArea.width, height: workArea.height - chrome.top - chrome.bottom}
```
- **坐标基准**：`display.workArea`（DIP），**不是** 窗口相对坐标。
- **重算事件**（缺一不可）：`win.on('resize')`、`screen.on('display-metrics-changed')`、`screen.on('display-added')`、`screen.on('display-removed')`、Shell 的 chrome 高度变化（Dock 显示/隐藏）。

### 11.4 焦点流转

| 从 | 到 | 触发 | 处理 |
|---|---|---|---|
| Shell | 插件 view | 点击插件区 | `pluginView.webContents.focus()` |
| 插件 view | Shell | Ctrl+K / Esc | `win.webContents.focus()`（模态打开时） |
| 任意 | 命令面板 | Ctrl+K | 隐藏插件 view → Shell 获焦点 → 面板显示 |
| 命令面板 | 原插件 | Esc / 执行完毕 | 面板关闭 → 恢复 view → `view.webContents.focus()` |

**Ctrl+K 必须在所有 WebContents 上都挂 handler**（G-6 的 `attachInputHook`），否则插件 view 内按键收不到。

### 11.5 生命周期

| 时机 | 动作 |
|---|---|
| 插件加载 | `view = new WebContentsView({webPreferences:{partition, preload}})` → `win.contentView.addChildView(view)` → `view.setBounds(computePluginBounds(...))` → `attachInputHook(view.webContents)` → `ensureNetGuard(session.fromPartition(...))` → `loadURL` |
| 切换到另一插件 | 旧 view `setVisible(false)`（不 destroy，保留状态） |
| 模态打开 | `setVisible(false)` |
| 演示模式隐藏 | `destroy()` + 从 map 移除 |
| 插件崩溃 | 显示错误卡片，提供"重载"按钮（重新走加载流程） |
| 窗口关闭 | 全部 `destroy()` |

## 12. 插件契约（v3.0 新增）

### 12.1 manifest.json 字段表

```jsonc
{
  "id": "com.ark.notes",              // 必填，反向域名，唯一，正则 ^[a-z0-9]+(\.[a-z0-9-]+)+$
  "name": "笔记",                      // 必填，1-32 字符
  "version": "1.0.0",                 // 必填，semver
  "entry": "index.html",              // 必填，相对路径，必须在插件目录内
  "icon": "icon.svg",                 // 可选
  "ui": {
    "private": false                  // 可选，默认 false，演示模式据此隐藏
  },
  "permissions": {                    // 可选，缺省 = 无任何能力
    "fs": {
      "read": ["<DATA>/**"],          // glob 数组，见 12.3
      "write": ["<DATA>/notes/**"]
    },
    "db": true,                       // 允许使用自己的 data/plugins/<id>.db
    "ai": ["chat"],                   // 允许的 AI 能力子集
    "clipboard": false                // S0 一律 false
  },
  "commands": [                       // 可选，自动进命令面板
    { "id": "notes.new", "title": "新建笔记", "keys": "Ctrl+Alt+N" }
  ],
  "minAppVersion": "0.1.0"            // 可选
}
```

**zod schema 校验失败 → 错误码并跳过**：
| 码 | 条件 |
|---|---|
| `E-PLUGIN-001` | manifest 文件缺失或 JSON 解析失败 |
| `E-PLUGIN-002` | 必填字段缺失或类型错 |
| `E-PLUGIN-003` | id 格式非法或重复 |
| `E-PLUGIN-004` | entry 越出插件目录 |
| `E-PLUGIN-005` | minAppVersion 高于当前版本 |

### 12.2 能力枚举与 IPC 通道命名

**能力清单**（S0 只有这 4 类）：
| 能力 | API | 说明 |
|---|---|---|
| `fs.read` | `ark.fs.read(path) → string` | 只读，受 glob 限制 |
| `fs.write` | `ark.fs.write(path, data)` | 受 glob 限制 |
| `db` | `ark.db.query(sql, params)` / `ark.db.exec(sql)` | 只能访问自己的库 |
| `ai.chat` | `ark.ai.chat({messages, model})` | 走主进程 |

**通道命名（B-07 采纳 —— 防串号）**：
```
plugin:<pluginId>:fs.read
plugin:<pluginId>:fs.write
plugin:<pluginId>:db.query
plugin:<pluginId>:db.exec
plugin:<pluginId>:ai.chat
```
**每个插件注册自己的通道，A 无法调用 B 的通道**（因为通道名含 pluginId，且 handler 校验 `senderMap.get(event.sender.id) === pluginId`）。

### 12.3 权限匹配语义

- **glob 支持**：`*`（不跨目录）、`**`（跨目录）、`?`（单字符）。
- **路径解析**：`realpathSync(arg)` 后与 `realpathSync(glob前缀)` 比较，**禁止 `..` 越界**。
- **拒绝规则**：未声明能力、或路径不匹配、或 realpath 越出 → 返回 `E-PERM-001`。
- **拒绝也要写审计**：`{ts, pluginId, api, decision:"deny", argsHash, code:"E-PERM-001"}`。

### 12.4 身份认定

```js
// 创建 view 时建立映射
const senderMap = new Map();  // webContents.id → pluginId
senderMap.set(view.webContents.id, pluginId);

ipcMain.handle('plugin:' + pluginId + ':fs.read', (event, args) => {
  const caller = senderMap.get(event.sender.id);
  if (caller !== pluginId) return deny('E-PERM-002');   // 身份不符
  // ... 权限检查
});
```

### 12.5 绕过面封堵（B-07 采纳）

| 绕过手法 | 封堵 |
|---|---|
| `will-navigate` 跳转外站 | `wc.on('will-navigate', (e, url) => { if (!url.startsWith('ark://')) e.preventDefault(); })` |
| `window.open` | `wc.setWindowOpenHandler(() => ({action:'deny'}))` |
| 自定义协议 | 只注册 `ark://`，handler 校验路径在插件目录内 |
| `<iframe>` 子帧 | `wc.on('did-frame-navigate')` 校验；子帧一律 deny IPC（校验 `event.senderFrame === event.sender.mainFrame`） |
| 拖放文件 | `wc.on('will-navigate')` + 禁用 `webContents.setWindowOpenHandler`；拖放事件在 preload 侧拦截 |
| 剪贴板 | S0 **全部能力拒绝**（`setPermissionRequestHandler(() => cb(false))`，无任何例外分支），manifest 的 `permissions.clipboard` 一律 false |
| 网络出网 | G-12 per-partition webRequest 白名单 |

### 12.6 错误码表

| 码 | 条件 |
|---|---|
| `E-PERM-001` | 能力未声明 / 路径不匹配 / 越界 |
| `E-PERM-002` | 调用方身份不符（senderMap 不匹配） |
| `E-PERM-003` | 非主帧调用（iframe 子帧） |
| `E-PLUGIN-001..005` | manifest 校验失败（见 12.1） |
| `E-DB-001` | ATTACH 超限 |
| `E-DB-002` | SQL 执行错误（透传 message，去敏） |
| `E-FS-001` | 文件不存在 |
| `E-FS-002` | 编码错误（非 UTF-8） |
| `E-NET-001` | 出网被白名单拦截 |
| `E-AI-001..009` | 见 G-10 |

### 12.7 flush 契约（G-4 依赖）

```ts
// 每个插件可注册 flush 回调（保存未落盘内容）
ark.lifecycle.onFlush(async () => { await saveNow(); });
// 主进程 flushAll(): Promise<void>
//   - 向所有插件 view 发 'ark:flush'
//   - 每个插件有 1000ms 总预算
//   - 超时记录 warn，继续收起（不阻塞用户）
```
