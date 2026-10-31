# 评审裁决记录 ROUND 2 & 3

> 承接 `ROUND-1-裁决.md`。本文记录第二轮（16 条 blocking）与第三轮（技术核验）的裁决。

---

## ROUND 2 裁决：PLAN v2.0 → v3.0

来源：`PLAN-REVIEW-03.json`（契约审计员，16 条）+ `PLAN-REVIEW-04.json`（实施者，18 条）

### 最严重的一条：引用不存在的章节

v2.0 里 G-6 写「见 §11 z 序表」、G-7 写「见 §12 全文」，但文档只到 §10。**所有依赖这两章的验收条款都是空引用。**

这是"文档看似完整、实际缺块"的典型——两条独立评审都抓到了。裁决：**把 §11 视图层、§12 插件契约作为正式章节写进 PLAN**，不降级为"以 SDS 为准"。

### 6 条修复本身是错的（越修越坏）

这是本轮最有价值的发现——**第一轮我采纳建议时，引入了新的假通过**：

| 原问题 | 我的"修复" | 为什么错 | v3.0 正确做法 |
|---|---|---|---|
| B-05 动效无计时 | t0 用主进程 `Date.now()`，t1 用 renderer `performance.now()` | 两者时间基准不同（epoch vs 相对时基），`t1-t0` 恒为约 -1.7e12，**断言永远通过** | 两端都用 `Date.now()` |
| B-03 Alt-Tab 不可断言 | 加断言 `win.isSkipTaskbar()` | Electron 33 的 BrowserWindow **没有这个 getter**，执行即 TypeError | 用 spy 断言 `setSkipTaskbar` 被以 `true` 调用 |
| B-08 依赖无判据 | 写"白名单恰好 12 个…脚本输出必须 ≤ 20" | 两句互斥：≤20 允许加白名单外的依赖，「白名单」无判据 | dependencies 集合相等 + devDependencies ⊆ 名单 |
| B-06 Ctrl+K 捕获点 | 写"主进程 webContents.on(...)" | `before-input-event` 是 per-WebContents；插件是独立 view，主窗口收不到 | `attachInputHook()` 挂到**所有** WebContents |
| B-14 网络白名单 | 写"主进程 session.webRequest" | 插件用独立 partition（独立 Session），挂 defaultSession 拦不到 | `ensureNetGuard()` 对**每个** partition 各挂一份 |
| B-10 CSP 与审计 | 写"fetch 必须 reject **且** 审计出现 E-NET-001" | CSP 先拦，请求不出网络层，`onBeforeRequest` 不触发 → **两条断言互斥，必有一条永远红** | 拆成 CSP 段（断言 fetch reject + 审计**无**记录）与 webRequest 段（主进程 net.request，断言审计**有**记录） |

> **教训**：评审建议不是配方。采纳"应该能测"的断言前，必须先问"这条断言有可能失败吗"。恒真断言比没有断言更危险——它给人虚假的安全感。

### 其他关键裁决

| # | 问题 | 裁决 |
|---|---|---|
| R2-01 | G-9 缺负例，跨词误命中被掩盖 | **加 N4 负例 + 位置校验列为必做**（SPIKE-2 实测证实 AND 会误命中） |
| R2-02 | G-9 写路径未定，`INSERT OR REPLACE` 会污染 FTS | **实测确认**：REPLACE 后旧词仍命中；改 `ON CONFLICT DO UPDATE`。见 `F:\gal\probe\upsert-probe.cjs` |
| R2-03 | dev 模式数据根落到 `node_modules/electron/dist/data` | 按 `app.isPackaged` 分流，dev → 仓库根 |
| R2-04 | `.env` 无加载器（白名单无 dotenv） | 自写 15 行 `load-env.ts`，不引入依赖 |
| R2-05 | `pnpm lint` 既要求零错误又要求恰好 5 条错误 | 拆 `lint` / `lint:fixtures` |
| R2-06 | CSP 缺 `worker-src`，Monaco worker 被掐 | 加 `worker-src 'self' blob:` |
| R2-07 | §2 说 10 条实际 13 条；§9 清单漏 G-3/G-11 | 统一为 13 条，§9 只引用 G-1 命令组 |
| R2-08 | 里程碑表头"严格串行无重叠"但日期重叠 | 重排为半日槽，逐段无重叠，加算术校验行 |
| R2-09 | ATTACH 上限未提 | 实测 max 10（含 main），LRU 保 3 个 |
| R2-10 | N-12 反向断言用 PowerShell `**` 通配（不递归） | 改用 `rg`，期望退出码 1 |
| R2-11 | G-10 缺 3 个错误码（5xx 重试后、safeStorage 不可用、Key 格式非法） | 补 E-AI-007/008/009 |
| R2-12 | G-9 双链补全零条款 | 补触发规则、候选 SQL、插入格式、重名消歧、失效链接、2 条验收 |

---

## ROUND 3 裁决：技术核验

子 agent 两次中断（任务过重），改由调度会话自验。产物：`docs/TECH-VERIFY.md`。

18 项技术声称：**14 项成立，3 项表述错误已修正，1 项不确定**。

### 修正的 3 项

| 原表述 | 错在哪 | 已改为 |
|---|---|---|
| "`setContentProtection` 不挡 OBS 显示器捕获" | Win10 2004+ 的 `WDA_EXCLUDEFROMCAPTURE` 对 DXGI Desktop Duplication 同样生效 | "挡 DWM/WDA 与 DXGI 复制，不挡采集卡与手机拍屏" |
| CSP 只写 `worker-src 'self'` | Monaco 的 blob: worker 仍被拦 | `worker-src 'self' blob:` |
| CSP 与 webRequest 串联验收 | 两条断言互斥 | 拆两段独立断言 |

### 新增到 SDS 的 3 条（不影响 PLAN 验收口径）

1. **notes 表写语句白名单**：只允许 `INSERT ... ON CONFLICT DO UPDATE`、`DELETE`、批量导入前的清空 `INSERT`。禁止 `REPLACE`（静默污染 FTS）、禁止 `INSERT OR IGNORE`（冲突时不更新 FTS）。
2. **带空格输入的语义**：「工作 站」与「工作站」产生相同 gram 序列，视为同一查询。SDS 写明。
3. **两阶段检索的候选上限**：阶段 2 的 `indexOf` 只对前 100 条候选执行，超出按粗召回排序截断。

---

## 三轮累计

| 轮次 | 来源 | blocking | 处理结果 |
|---|---|---|---|
| 1 | spec-hawk + 实现者 | 30（合并 24） | 全部采纳 → v2.0 |
| 2 | 契约审计员 + 实现者 | 34（合并 16） | 16 全部采纳，其中 6 条是 R1 修复引入的新错 → v3.0 |
| 3 | 技术核验（自验） | 3 项表述错误 | 已修正 → v3.1 |
| **合计** | | **~50 条** | **v3.1 定稿** |

## 一个失败的教训（关于评审 agent）

第 3 轮派出的两个评审 agent **都中断了**：一个读到一半开始做交叉引用核对时超时，另一个没留下任何信息。

原因：任务里同时要求"读 889 行文档 + 核对 16 项 + 做 20 项机械检查 + 输出完整 JSON"，上下文与输出都过载。

**修正做法**（已应用于重派的 agent）：
- 明确分工："用 write 工具把 JSON 写到文件，回复只给 10 行摘要，不要粘贴完整 JSON"
- 缩小范围：只核对"声称已修复的 16 项"，不要求重新发明问题
- 允许自验：机械检查（章节引用是否存在、算术是否对）用 `grep`/`Select-String` 自己做，比交给 agent 更可靠

---

## ROUND 3 裁决（PLAN 终审 + SDS round-1）

### PLAN v3.1 → v3.2：3 条 blocking

| # | 问题 | 类型 | 裁决 |
|---|---|---|---|
| B-01 | N-12 的 `rg` pattern 含 `clipboard` 期望 0 命中，而 G-12 要求 `setPermissionRequestHandler` 拒绝 `clipboard-read` → 两条验收**不可能同时通过** | 矛盾 | **彻底删除 `clipboard-read` 例外**（S0 全拒），§12.5 同步；pattern 收紧为能力级（`clipboard\.readText`），排除 `.d.ts` |
| B-02 | G-12 的 per-partition 断言"在插件 partition 内发起请求"未指定触发手段 → 若走插件 renderer fetch，CSP 先拦，与"审计无 E-NET-001"互斥（B-10 的矛盾在此复发） | 矛盾 | 拆成 **A 段**（主进程 `session.fromPartition().net.request`，绕开 CSP，断言审计**有** E-NET-001）与 **B 段**（插件 renderer fetch，断言审计**无** E-NET-001） |
| B-03 | G-2(a) 对 `new BrowserWindow(opts)` 做 `toMatchSnapshot()` → 序列化结果是 `BrowserWindow {}`，与 opts 无关，**恒真**；且 vitest 非 Electron 环境直接抛错 | 恒真断言 | 抽纯函数 `buildWindowOptions()`，断言其返回值 `toEqual` 快照（双向深比较，多/少字段都失败） |

附带修的算术/引用错误：G-1"七条"→"八条"；§9"13 = 12+0+4"（=16）→"9 纯自动 + 4 混合 = 13"；`§12 生命周期表`→`§11.5`；文件头 v3.0→v3.2；删除无调用点的 skipTaskbar spy 断言。

### SDS v1.1 → v1.2：16 条 blocking（实现者视角）

关键的一条是 **B-07：CL-312 伪码与自己的样例自相矛盾**——伪码把每个 CJK 字符单独 push 成 token，于是 bigram 分支成了死代码，实际输出 `["工","作","站"]`，而样例表和 8 条验收期望全都依赖 bigram。照伪码实现，AC-M12-01 大面积红。

修法：切成 **run**（连续 CJK 段 / 连续拉丁段），每个 run 生成自己的 grams 与 source。

**实测验证**：重写后的 `planGrams` 在 `F:\gal\probe\sds-v12-probe.cjs` 上对 CL-317 的 8 条查询 **8/8 通过**，混排查询 `贴图工作站 v2` 也正确返回。参考实现（`F:\gal\probe\plangrams-exact.cjs`）对 5 行样例表 **5/5 通过**。

其余 15 条：文件树、CL-250 回滚、`<DATA>` 展开时机、`isUnder` 防 `ok-evil` 越权、netguard 内联、CL-311b lint 拦截、redact 移 shared、ark:// 协议、插件命令通道、bounds 算式、评分公式、tick 闭包、演示模式失败容忍、manifest 错误码表、M-02 完整接口。

### 抽检发现的 3 条（v1.2 内自查再修）

| # | 问题 | 为什么严重 |
|---|---|---|
| S-01 | `onBeforeRedirect` 的 listener 没有 callback，`details` 也无 `cancel` 字段 → `details.cancel = true` 是**空操作** | 安全防护写了但挡不住它声称要挡的东西。修法：靠 `onBeforeRequest` 对重定向后的新请求再次触发来拦截（这是 Electron 的实际行为），`onBeforeRedirect` 只留作审计 |
| S-02 | CL-250 十步序列里从未 `registry.set(pluginId, entry)`，而 `rollback` 的入口是 `registry.get()` → 第 5 步失败时 entry 为 undefined，整个清理块被跳过，view 泄漏；且泄漏断言恒绿 | 资源泄漏 + 验证盲区 |
| S-03 | CL-312 的 cjk 分支从未赋 `source`，`isEmpty` 从未赋值 → 照抄 TS 报错，强转则 phase2 全量丢结果 | "可直接照抄"的说法不成立 |

**这三条都是"写在文档里看起来对、实际跑起来错"的典型。** 共同教训：**文档里的代码必须真的跑一遍。**

### 一次并发改写的教训

抽检 agent 指出："抽检期间 SDS.md 正在被并发改写（1816 → 1950 行），结论基于最新版本，定稿后建议复检。"

这是真实风险：评审者读到的版本与作者以为的版本不是同一个。**正确做法是先冻结文档再送审**。本轮因为修改是增量的（只加不删），影响可控，但流程上应避免。
