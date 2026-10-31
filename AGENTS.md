# AGENTS.md —— 项目宪法

> 本文件在**每个会话/每个子 agent**开始时必读。与其它文档冲突时，以本文件为准。
> 修改本文件视为架构变更，必须记入 `docs/DECISIONS.md`。

## 1. 项目身份

- 项目名：`ARK 工作站（个人智能工作站）`
- 一句话目标：`一个隐形开关唤出的、可插件扩展的个人创作与效率中枢`
- 技术栈：`Electron + React + TypeScript + Vite + Tailwind（详见 docs/ARCHITECTURE-DRAFT.md）`（运行时版本：`Node 20 LTS / Electron 33 / Windows 10-11 x64`）
- 运行/验证命令：`pnpm typecheck && pnpm test && pnpm build`（例：`pnpm test && pnpm build`）

## 2. 文档层级（谁覆盖谁）

1. `AGENTS.md`（本文件）—— 流程与铁律
2. `docs/SDS.md` —— 实现契约（唯一技术真相）
3. `docs/PLAN.md` —— 目标与非目标
4. `tasks/LEDGER.md` —— 状态真相
5. 任务卡 `tasks/T-xxx.md` —— 单任务指令

**代码与 SDS 冲突时：先停下，报告冲突，不要自行"优化"设计。**

## 3. 角色分工（不可混用）

| 角色 | 谁 | 职责 | 禁止 |
|---|---|---|---|
| 调度者 | 主会话 | 拆任务、排序、发派、读报告、裁决冲突、维护 LEDGER/DIGEST | 禁止大段写实现代码；禁止读源码全文 |
| 实施者 | `subagent`（干净上下文） | 按任务卡改代码 + 自测 | 禁止改任务卡外的文件；禁止改 SDS |
| 评审者 | `subagent`（干净上下文） | 按 SDS 条款审 diff，输出结构化 JSON | 禁止改代码；禁止提"风格偏好"级阻塞项 |
| 追问者 | 主会话 + `ask_user_question` | 把模糊需求变成可验收条款 | 禁止一问一答式马拉松 |

## 4. 铁律

1. **单一真相源**：任务状态只存在于 `tasks/LEDGER.md`。对话里说的"做完了"不算。
2. **文件所有权**：每个任务卡声明 `TOUCH: [文件列表]`。实施者只能改这些文件，越界即失败。
3. **摘要优先**：主会话只读 `LEDGER`、`CONTEXT-DIGEST`、评审报告。看代码只读 `git diff -- <path>` 或指定行段。
4. **不改契约**：实施中发现 SDS 有洞 → 提交 `ASSUMPTION:` 声明并继续，同时在报告里列 `CONTRACT_GAP:`，由调度者决定是否回退到设计阶段。
5. **评审必须结构化**：任何评审输出必须是 JSON（schema 见 `docs/REVIEW-PROMPTS.md`），自由文本意见一律退回重写。
6. **每任务一提交**：一个任务卡 = 一次 commit，message 前缀 `T-xxx:`。禁止跨任务混合提交。
7. **不删证据**：评审文件、失败的尝试记录都保留，追加不覆盖。

## 5. 编码约定

- 语言/风格：`pnpm lint` 必须零告警。
- 新增依赖需在任务报告中说明理由，且调度者批准后才可写入 `package.json`。
- 错误处理：所有外部输入必须校验；禁止吞异常。
- 日志：结构化，含 `task_id`。

## 6. 完成定义（DoD）

一个任务算完成，当且仅当：

- [ ] `TOUCH` 列表内的改动已完成
- [ ] `pnpm typecheck && pnpm test && pnpm build` 通过（贴出实际输出尾部 10 行）
- [ ] 任务卡里的 `ACCEPT:` 条目逐条自检通过
- [ ] 生成 `tasks/T-xxx.report.md`
- [ ] LEDGER 状态由调度者改为 `DONE`（实施者不得自己改 LEDGER）

## 7. 会话启动检查清单

新会话/新子 agent 开工前：

1. 读本文件
2. 读 `docs/SDS.md` 中与你任务相关的章节（不要通读全篇）
3. 读你的任务卡
4. 读 `docs/CONTEXT-DIGEST.md` 最后 30 行（了解最近变化）
5. 确认 `git status` 干净，然后开工

