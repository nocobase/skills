# Chart validation

当你要维护 chart skill contract、设计验证矩阵，或补充 chart 负例回归时，读本文。运行期 DSL、query / visual / events 与 readback 规则看 [chart-core.md](./chart-core.md)。

## 目录

1. 推荐 contract 验证 case
2. 更复杂的 contract 验证矩阵

## 推荐 contract 验证 case

skill 在完成 chart 配置后，至少按下面顺序做 contract / readback 级验证：

1. **builder + basic 基础图**
   - `query.mode = "builder"`
   - `visual.mode = "basic"`
   - `readback` 应看到 `query.collectionPath`

2. **sql chart 持久化**
   - `query.mode = "sql"`
   - 不只看 `stepParams.query.sql`
   - 还要确认 SQL 已经落到 `flowSql`
   - 最好再读一次 `context(path="chart")`，确认 `queryOutputs` 与 mappings 一致

3. **builder / SQL 的 filter target 边界**
   - builder chart 可作为 filter-form target
   - 切到 SQL 后，filter target 应失效 / 解绑
   - 切回 builder 后，filter target 应重新可用

4. **custom `visual.raw`**
   - 写入前先做 `ChartOptionModel` 兼容检查
   - 写入后确认 compat 检查通过，且相关 option 配置已落盘

5. **负例**
   - 混用 `configure` 与 `query / visual / events`
   - `heightMode` 非法
   - `visual.mappings.*` 引用不存在的 query 输出
   - builder 聚合 measure / 自定义 alias 排序
   - 预期都应返回 400，而不是留下半残配置

## 更复杂的 contract 验证矩阵

除了上面的基础 5 组，还建议补这几组：

6. **builder collection switch**
   - 先用 `employees`
   - 再切到 `departments`
   - 同次写入里同时更新 `query` 和 `visual.mappings`
   - 预期旧 `measures / dimensions / sorting / filter` 不会把新 collection 污染脏

7. **builder 聚合 / alias 排序负例**
   - `measures = [{ field: "amount", aggregation: "sum", alias: "totalAmount" }]`
   - `sorting = [{ field: "totalAmount", direction: "desc" }]`
   - 预期 400
   - `sorting.field = "amount"` 也预期 400
   - 这类 case 现在属于 contract 明确不支持，而不是“高概率可用”

8. **chart filter target roundtrip**
   - builder chart 绑定 filter-form
   - 切到 sql 后确认 filter target 解绑
   - 再切回 builder 后确认 filter target 重新可绑定

9. **custom + events 组合**
   - `visual.mode = "custom"`
   - 同时配置 `events.raw`
   - 验证事件代码与配置都已落盘

10. **SQL durable**
   - SQL chart 创建后必须确认 `flowSql` 已持久化
   - 不要只根据首次写入响应里的内存态字段判断成功

11. **SQL alias case sensitivity**
   - SQL 里分别测试：
     - `count(*) as employeecount`
     - `count(*) as "employeeCount"`
   - 对比 `context(path="chart").chart.queryOutputs`
   - `visual.mappings` 必须严格引用 readback / context 返回的真实输出名

12. **SQL runtime-context risky path**
   - SQL 含模板变量 / `ctx` / liquid bind
   - 预期 `context(path="chart").chart.riskyPatterns` 给出 preview 风险提示
   - skill 不应在没有 `queryOutputs` 依据时臆造 `visual.mappings`
   - 预期只能通过 `readback` 收口，或停在 query 阶段

13. **SQL runtime-context preview unavailable**
   - SQL 含模板变量、liquid bind 或 `ctx.*`
   - 预期 `context(path="chart")` 没有稳定 `queryOutputs`，但会出现对应 `riskyPatterns`
   - skill 不应在没有输出依据时盲配 `visual.mappings`
