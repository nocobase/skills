# Adapter: nocobase-data-analysis

Use for PRD slices involving:

- metric verification
- current business data summaries
- grouped analysis
- dashboard data validation

Do not include:

- page/dashboard authoring
- collection creation
- ACL writes
- workflow writes

## Required Prompt Shape

```md
使用 $nocobase-data-analysis 完成数据分析或指标验证任务。

Skill lock:
Use only $nocobase-data-analysis for this task. Do not use other NocoBase skills, generic fallback commands, or unrelated tooling for this task. If another skill is needed, stop and report that a separate task group is required.

Source PRD:
<prd path>

Task file:
<task file path>

目标：
根据 PRD metrics 验证或汇总当前业务数据。

输入：
- metrics: ...
- related objects: ...
- grouping dimensions: ...

边界：
- 不创建页面或图表。
- 不修改数据模型。
- 不配置 ACL 或 workflow。
- 遵守 $nocobase-data-analysis 的 MCP 数据源发现、query contract 和 cross-check 规则。

验收：
...

证据要求：
- data source used
- collection used
- query or manual cross-check summary
- metric result summary
```

## Prompt Guardrails

- Tell the executor to inspect the main data source first.
- Tell the executor to verify collection and fields before querying.
- Tell the executor to cross-check suspicious aggregates.
