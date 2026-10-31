# 任务报告 T-000（模板）

> 实施者产出，写在 `tasks/T-xxx.report.md`。
> **这是主会话唯一会读的实施期文件，必须 ≤ 30 行。** 超长视为不合格。

```
TASK: T-000
STATUS: DONE | BLOCKED
FILES:
  - src/parser/csv.ts (新增)
  - tests/parser.csv.test.ts (新增)
VERIFY: pnpm test → PASS
  ... 最后 3 行输出 ...
ASSUMPTION:
  - SDS 未定义 \r\n 换行处理，按 \n 统一处理
CONTRACT_GAP:
  - CL-104 没说明空表头的行为，需补
DEPENDENCY_REQUEST: 无
SUMMARY: 实现了流式 CSV 解析，支持引号转义与行号错误定位。
NEXT_HINT: M-03 的 writer 侧可直接复用同一 tokenizer。
```

## 报告质量红线

1. 不贴完整代码（代码在 gi 里）
2. 不贴完整日志（只贴最后 3 行）
3. 有问题必写 `ASSUMPTION` 和 `CONTRACT_GAP`，不许默默猜
4. `STATUS: DONE` 但 `VERIFY: FAIL` = 撒谎，评审会抓到
