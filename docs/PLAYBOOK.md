# 流程卡：从零到跑起来（贴在显示器上）

## 阶段 0 · 立项（30 分钟）

```
1. 复制 skeleton/ 到项目根
2. 填 AGENTS.md 的 4 个 [占位符]：项目名/目标/技术栈/VERIFY_CMD
3. 跑一次 VERIFY_CMD —— 空项目也要先有一条能跑的命令
```

## 阶段 1 · 计划（1~2 小时，别省）

```
4. 起草 docs/PLAN.md（用模板，能填多少填多少，空着的标 OPEN）
5. 让 DS4.1 用 docs/GRILL-QUESTIONS.md 问你：
   "按 GRILL-QUESTIONS.md 的 A-E 组，用 ask_user_question 一次问我 5 个问题，每题给选项"
6. 拿到答案 → 让模型回填 PLAN → 再问 F/G 组一轮
7. 起评审 1：subagent + 提示词1（spec-hawk）
8. 改 → 起评审 2：subagent + 提示词2（实现者视角）
9. 直到连续 1 轮 PASS，PLAN 定稿打 v1.0
```

**出口检查**：非目标写下 ≥3 条；每个 G-x 都有可执行验证命令。

## 阶段 2 · SDS（2~4 小时，最重要）

```
10. 让模型按 docs/SDS.template.md 写 SDS（要求：每模块必须有错误路径表 + 验收用例表）
11. 起评审 3：subagent + 提示词3（契约完备性）
12. 起评审 4：subagent + 提示词4（可测试性专项）—— 可以和 11 并行
13. 合并两个评审的 blocking 项，逐条改
14. 重复 11~13 直到 PASS
```

**出口检查（"自足性测试"）**：拿 SDS 的某一章 + 一个虚构任务卡，起一个干净 agent 试写 50 行。它如果需要回来问，SDS 不合格。

## 阶段 3 · 拆任务（30 分钟）

```
15. 让模型读 SDS，输出任务列表（每个 ≤ 30 分钟 / ≤ 5 文件 / 有 VERIFY）
16. 人工过一遍：文件冲突的排成串行，其余并行
17. 填 tasks/LEDGER.md
```

## 阶段 4 · 实施（一天）

```
18. 按 docs/ORCHESTRATION.md 的调度循环跑
19. 每完成一个任务：派评审 agent（提示词5）→ 读 verdict → 改 LEDGER
20. 每 5 个任务压缩 CONTEXT-DIGEST
21. 遇到升级清单里的情况就停下来问人
```

## 阶段 5 · 终审

```
22. 起终审 agent（提示词6）→ 完整验收命令 → 发布结论
```

---

## 给 DS4.1 的启动语（直接复制）

**开计划会话：**
```
我们要做一个项目：<一句话>。
按这个流程来：先写 docs/PLAN.md（用 docs/PLAN.template.md），
然后用 docs/GRILL-QUESTIONS.md 的 A-E 组，通过 ask_user_question 一次问我 5 个问题。
重复直到 A-G 组问完，把答案回填 PLAN。
不要在这一步写任何代码。不要开始设计 SDS。
```

**开评审会话（每个评审一次）：**
```
你是独立评审员，没参与讨论。
读 docs/REVIEW-PROMPTS.md 的"提示词1"，严格按它执行。
被审文件：docs/PLAN.md
输出到：reviews/PLAN-REVIEW-01.json
不要修改任何文件，只输出评审结果。
```

**开实施会话：**
```
按 docs/ORCHESTRATION.md 执行。你是调度者，不是实施者。
现在读 tasks/LEDGER.md，把 READY 的任务按文件冲突分组，
用 subagent 并发派发（每批 2~4 个），提示词见 ORCHESTRATION.md 第五节。
每批回来后派评审 subagent（REVIEW-PROMPTS.md 提示词5），只读 verdict。
不要自己写实现代码。
```

---

## 一句话自检

> 如果一个新人（或新 agent）只拿到你的仓库，能不能在不问任何问题的情况下，知道现在该干什么、干完怎么算对？

能 → 流程成立。不能 → 回去补文档，别写代码。
