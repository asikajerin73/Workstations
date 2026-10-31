# T-000 任务卡模板

> 复制本文件为 `tasks/T-xxx-短横线小写标题.md`，填满所有字段。
> **任务卡由调度者写，不由实施者写。** 字段留空 = 这张卡不合格，不许派。

```
TASK_ID: T-000
TITLE: <动词开头的短句，如 "实现 CSV 解析器">
DEPENDS_ON: T-000 | —
TOUCH:
  - src/parser/csv.ts
  - tests/parser.csv.test.ts
SDS_REFS: CL-101, CL-104, §3.2 M-03
SIZE_BUDGET: <200 行
VERIFY: <一条能证明做对了的命令>
ACCEPT:
  - 给定 fixtures/valid.csv（3 行），返回 3 条记录，字段名与表头一致
  - 给定 fixtures/bad-quote.csv，抛 CsvParseError 且 message 含行号
  - 空文件返回空数组，不抛异常
  - 10 万行文件解析耗时 < 3s
NOTES: <实现提示、已知坑；没有就写 "无">
OUT_OF_SCOPE: <明确不要顺手改的东西>
```

## 填写要点

- **TOUCH 越少越好**：> 5 个文件就该拆任务
- **ACCEPT 必须可执行**：每条都能变成一个测试断言
- **VERIFY 是全局的**：一般就是项目的 `pnpm test` / `npm run check`，不要每个任务编一条新命令
- **SDS_REFS 必须精确到条款号**：这是评审 agent 唯一的判据
- **OUT_OF_SCOPE 是防手痒的**：写清"不要顺手重构 X"

## 不合格任务卡的特征（自查）

| 症状 | 后果 |
|---|---|
| TOUCH 写的是目录而不是文件 | 两个 agent 会撞 |
| ACCEPT 里有"正常工作" | 评审无法判定 |
| 依赖三个未完成任务 | 永远 READY 不了 |
| 一句话说不清要干什么 | 子 agent 会自己发明需求 |
| VERIFY 是"人工看看" | 没有可重复证据 |
