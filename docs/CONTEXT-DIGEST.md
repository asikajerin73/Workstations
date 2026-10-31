# CONTEXT-DIGEST —— 滚动摘要

> **主会话唯一允许的"记忆"。** 只追加，不修改历史行；每 5 个任务压缩一次。
> 规则：一行 ≤ 60 字。写"发生了什么变化"，不写"做了什么细节"（细节在任务报告里）。

## 格式

```
[DATE] [TASK] [一句话变化] → [影响]
```

## 记录

```
2026-10-30  SETUP   项目骨架与验证命令就位（pnpm test 可用）→ T-001 可开工
2026-10-31  PLAN    三轮评审 ~50 条 blocking 清零，定稿 v3.2 → 进入 SDS
2026-10-31  SDS    v1.2 定稿，16 条 blocking 修完；检索规格实测 8/8 → 可实施
2026-10-31  ENV    Node20.18.1/pnpm9.15.9 装好；better-sqlite3 锁 11.10.0 → T-001 已就绪
2026-10-31  TASKS  T-001..T-016 拆解完成，LEDGER 就位 → 待启动 T-001
2026-10-31  T-001  环境闸口 DONE：Electron 33.4.11 + better-sqlite3 11.10.0 全绿 → T-002 可开工
2026-10-31  T-001  实测推翻旧结论：ATTACH 附加库上限 10（不含 main）→ 最多 10 插件库，非 9
2026-10-31  T-001  抓到 4 个环境陷阱（ELECTRON_RUN_AS_NODE 等）→ 已记入 LEDGER §已证实陷阱
2026-10-31  T-002  A1–A10 通过、61 测试全绿，实跑修复 preload 路径缺陷 → T-002 DONE
2026-10-31  SDS    v1.3 修复 manifest 003 可达性与启动契约 → 后续实现按新契约
2026-10-31  T-003  主题引擎 A1–A10 通过、70 测试；独立评审零阻断 → T-003 DONE
2026-10-31  T-004  窗口两态序列 A1–A14 通过、94 测试；变异测试有牙齿 → T-004 DONE
2026-10-31  SDS    v1.4：通道分函数注册、ack 落点、getWindow 子集、flush 抛错语义
2026-10-31  T-002  骨架与基线 A1–A10 通过；实跑抓到 preload 相对路径缺陷并修复 → 待独立复审
2026-10-31  SDS    升至 v1.3：修 manifest 003 可达性、preload 绝对路径与工具链基线 → 后续卡按新契约
```

## 已锁定的关键技术结论（不要再讨论）

| 结论 | 依据 |
|---|---|
| `better-sqlite3` **必须精确 11.10.0** | 13.0.3 本机 `new Database(':memory:')` 崩溃 `0xC0000005` |
| notes 表**禁止** `INSERT OR REPLACE` | 实测：旧词残留命中；`ON CONFLICT DO UPDATE` 正确清除 |
| 检索 = bigram 短语查询 + 每 run 原文 `includes` 校验 | 实测 8/8 通过；混排查询正确 |
| `SQLITE_MAX_ATTACHED` = 10（含 main）→ 插件库 LRU 保 3 | 实测第 11 次 ATTACH 报错 |
| 动效计时两端必须都用 `Date.now()` | 混用 `performance.now()` 是恒真断言 |
| CSP 与 webRequest 必须分段断言 | CSP 先拦则 webRequest 不触发，`E-NET-001` 永不出现 |
| 白名单必须挂到**每个插件 partition** | 插件独立 Session，挂 defaultSession 拦不到 |
| Ctrl+K 必须挂到**所有 WebContents** | `before-input-event` 是 per-WebContents |
| `setContentProtection` 挡 DXGI 复制，不挡采集卡/手机拍屏 | Win10 2004+ 走 `WDA_EXCLUDEFROMCAPTURE` |
| `capturePage` 绕开 WDA，不能验证防截屏 | 只能人工手机拍屏 |
| Playwright 无法注入 OS 级热键 | e2e 走 `test:summon` 通道，报告声明未覆盖 |

## 当前状态快照（每次压缩时重写这一段）

- 已完成里程碑：`M0 环境就绪`、`M1 计划定稿`、`M2 SDS v1.4`、`M3 仓库骨架基线`、`M4 主题引擎`、`M4 窗口两态`
- 进行中：`—`
- 下一个关键任务：`T-004b 失焦自动收起` / `T-004c 动效计时`（卡待补）或 `T-005 数据层`
- 当前已知风险：`R4 防截屏透明窗可能失效`、`R7 虚拟显示器多屏 bounds`、`主题 setter 中途异常部分写入`、`E-WIN-011 重试分支未重取 t0`、`排期无缓冲`、`C 盘仅剩 32 GB`
- 待决问题：`P-1/P-2/P-3 三个审美与验证方式问题（非阻塞，T-015 前定）`、`parchment/high-contrast 缺 palette 值`

## 压缩规则

把连续 5 条同模块的记录合成 1 条，例如：

```
（压缩前 5 条：csv 解析器 → 引号转义 → 行号错误 → 流式读取 → 大文件测试）
2026-10-30  M-03     CSV 解析模块完成，含流式/转义/行号错误 → 可被 writer 复用
```
