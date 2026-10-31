# AUDIT-01 —— SDS v1.2 抽检报告

> 目的：SDS-REVIEW-02 的 16 条 blocking 修完后，做一次**不重跑全流程**的定点抽检，专查"写在文档里看起来对、实际跑起来错"的段落。
> 方法：8 个抽检点，只读指定行段，不做交叉引用核对、不统计。
> 时间：2026-10-31

## 结论

**首轮 FAIL，3 条 blocking；修复后定点复检 PASS，0 条 blocking。**

## 首轮抽检 8 点

| # | 抽检点 | 首轮结论 |
|---|---|---|
| 1 | CL-250 回滚覆盖 | **缺口** —— 十步序列里没有 `registry.set` / `attached=true` / `hooksAttached=true`，`rollback` 的 `if (e)` 块在第 5 步失败时被整体跳过，view 既不 remove 也不 close，泄漏且 AC-M06-08 照绿 |
| 2 | `ark://` 协议 | 瑕疵 —— `entry` 只在 handler 内自检、从不与 target 比对；仅字符串 `isUnder` 无 realpath，插件目录内符号链接可外读；AC-M06-11 的 403 实际是 URL 规范化后 id 变 `secret.txt` → 404 |
| 3 | `planGrams` | **缺口** —— cjk run 从不赋 `source`、`isEmpty` 从不赋值，与样例表和 CL-313 的 `includes(run.source)` 不符，"可直接照抄"不成立 |
| 4 | `netguard` | **缺口** —— `onBeforeRedirect` 的 listener 无 callback、`details` 无 `cancel`，`details.cancel = true` 是空操作，重定向拦截不生效，AC-M08-07 必红 |
| 5 | `isUnder` | OK —— `stripTrailingSep` + `p + path.sep` 正确挡 `<DATA>/ok-evil/x` |
| 6 | 硬规则矛盾 | 有 —— CL-006 固定日志字段 vs CL-263 审计行；CL-002 统一 IPC 包络 vs CL-257 / `AiApi.chat` 的返回形状 |
| 7 | 末尾铁律 | 一致（五条） |
| 8 | CONTRACT_GAP 机制 | 有（§12.1 两档标记 + 12.2 模板 + 12.3 处置 + 12.4 严禁） |

## 三条 blocking 的修法

### S-01 netguard 重定向（安全防护写了但挡不住）

**错误写法**：
```ts
sess.webRequest.onBeforeRedirect((details) => {
  details.cancel = true;   // ← 空操作
});
```
Electron 的 `onBeforeRedirect` **只有监听语义**：listener 只收到 `details`，没有 callback，`details` 上也没有 `cancel` 字段。

**正确原理**：`onBeforeRequest` 对**每一次**网络请求触发，**包括重定向后的新请求**。重定向目标本身就是一次新请求，会再次进入 `onBeforeRequest`，判定天然生效。

**修法**：`ensure()` 只保留一个拦截点 `onBeforeRequest`；`onBeforeRedirect` 降级为纯审计（记录 `event:'redirect'`）。AC-M08-07 改为断言"`onBeforeRequest` 对重定向后的 `evil.com` 请求 cancel + 审计有 `E-NET-001` + 有 `event:'redirect'` 记录"。

### S-02 registry 登记时机（资源泄漏 + 验证盲区）

**错误**：十步序列里从未 `registry.set(pluginId, entry)`，而 `rollback` 的入口是 `registry.get(pluginId)`。第 5 步 `addChildView` 失败时 entry 为 `undefined`，整个清理块被跳过——已创建的 `WebContentsView` / `webContents` 既不 `removeChildView` 也不 `close`，泄漏且无引用可回收。同时 AC-M06-08 只断言 `registry.size` / `senderMap` / `children.length`，在这条路径上**全部照绿**。

**修法**：
1. `registry.set(manifest.id, entry)` **提前**到 `new WebContentsView()` 之后、任何可能抛错的步骤之前。
2. `PluginEntry` 增加 `attached` / `hooksAttached` / `channels` 三个状态布尔，各自**紧随**对应步骤成功后立即赋值。
3. `rollback` 用这三个布尔判断"该步是否真的执行过"，只回滚已发生的。
4. 第 10 步 `loadURL` 失败**不**走 rollback（保留 view 供重试），改走 `showErrorCard`。

### S-03 planGrams 不完整（照抄即错）

**错误**：`GramRun.source` 在 cjk 分支从未赋值，`GramPlan.isEmpty` 从未赋值。TS 直接报错；若强转，CL-313 phase2 的 `candidate.includes(run.source)` 全量失效，检索返回空。

**修法**：伪码补第二步 cjk 分支 `r.source = r.text`（原样，不小写）、第三步 `return { runs, isEmpty: runs.length === 0 }`；并给出完整可执行参考实现。

**实测**（`F:\gal\probe\plangrams-exact.cjs`）：样例表 **5/5 通过**，`isEmpty` 对空串/空白/纯标点/单字均正确。

## 额外发现（非 blocking，已修）

`isCJK` 正则写成 `/[\u3000-\u9fff\uf900-\ufaff]/`——`\u3000-\u303F` 是**全角标点区**（`、。，！？「」`），会把标点吞进 CJK run：

```
"工、作" -> runs=[{source:'工、作', grams:['工、','、作']}]   ← 错
```

收紧为 `/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/`（CJK 扩展 A + 基本区 + 兼容区）后：

```
"工、作"   -> runs=工|作        grams=[["工"],["作"]]        ← 对
"工作，站" -> runs=工作|站      grams=[["工作"],["站"]]      ← 对
"工作站。" -> runs=工作站       grams=[["工作","作站"]]      ← 对
```

已补 3 条标点用例进 CL-317 样例表，并在正文写明"禁止写成 `\u3000-\u9fff`"。

## 过程教训

1. **文档里的代码必须真的跑一遍。** 这 3 条 blocking 全部是"读起来通顺、跑起来错"的类型。凡 SDS 中出现可执行代码，都要有对应的 probe 脚本。
2. **"安全防护"段落要反向问一句：它真的挡得住吗？** S-01 的写法看起来很像回事（还配了"语义不同不可混用"的注释），实际是空操作。注释越像行家，越要验。
3. **泄漏断言要问：在失败路径上它会红吗？** S-02 的 AC-M06-08 在正常路径能过，在它本该覆盖的失败路径上恒绿——这是最坏的断言：有名字、有位置、永远不报警。
4. **不要并发改稿送审。** 抽检期间 SDS 从 1816 行涨到 1950 行，评审者读到的版本与作者以为的不是同一个。本轮因为只做增量添加，影响可控，但流程上应先冻结再送审。
