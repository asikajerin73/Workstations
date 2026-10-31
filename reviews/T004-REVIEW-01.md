# T004-REVIEW-01（窄范围代码评审）— PASS → ACCEPT，无阻塞项
1. CL-211 六步 `window.ts:176/177/179/183/205/206` 与 SDS:539-547 逐条一致；`t0`(:179) 在 `show()`(:183) 之前且在 try 之外。
2. CL-212 五步 `window.ts:288/291/309/311/314/315` + `finally`(:317) 与 SDS:552-558 一致；150ms/1000ms 常量(:22/:25)正确。
3. 顺序断言用严格序列比较：`window-sequence.test.ts:193`、`:261` 的 `toEqual` 对比有序 calls 数组（快照含 `now`），另有 `:203-216` 下标断言 `now < show`。
4. `isFlushing` 有 try/finally(:289/:316)；flush 抛错用例 `:289-315`、send 抛错 `:317-324` 齐备；24 条 it，无 skip/todo/only。
5. 越界核对：status 9 行，实施类恰为 TOUCH 七项，`SDS.md`/`LEDGER.md` 属调度者；无 `any`/`eslint-disable`，四处 catch 均留痕或上抛。
6. 非阻塞 5 条：重试不重取 `t0`；`:299` catch 实为不可达防御网；`send` 前 `isDestroyed` 守卫致最坏空等 150ms；`:97` 双重断言；`:281` 墙钟容差。
