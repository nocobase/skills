# Readiness Gate

The BuildPlan must respect PRD readiness. This prevents execution plans from being generated from unresolved business decisions.

## Gate Inputs

Read these fields from `PRD.yaml`:

- `prd.status`
- `build_readiness.status`
- `build_readiness.blockers`
- `open_questions`
- `assumptions`

## Gate Outcomes

### Blocked

Use `build_plan.status: blocked` when:

- `build_readiness.status: blocked`
- any `open_questions[].blocking_level` is `build_blocking` and `status: open`
- core sections needed for execution are missing

Output only:

- `BuildPlan.yaml`
- `BuildPlan.md`
- `tasks/00-readiness.yaml`
- `prompts/00-resolve-prd-blockers.md`
- version snapshot

Do not generate data modeling, UI, workflow, ACL, reporting, or acceptance task groups.

### Needs Review

Use `build_plan.status: needs_review` when:

- PRD is structurally complete, but uses non-blocking defaults that should be reviewed.
- `prd.status` is not `approved`, but `build_readiness.status` is `partial`.

Generate task files only if execution would be unambiguous. Mark warnings in `readiness_gate.warnings`.

### Ready For Agent

Use `build_plan.status: ready_for_agent` when:

- `prd.status: approved`
- `build_readiness.status: ready`
- no build-blocking open questions remain
- task groups can be generated without guessing core business choices

## Blocker Resolution Prompt

For blocked PRDs, generate `prompts/00-resolve-prd-blockers.md`.

The prompt must tell a future agent to use `bside-prd-planner` to resolve blockers and update the PRD version.

Example:

```md
使用 $bside-prd-planner 继续完善 PRD。

PRD 文件：
nocobase_docs/prds/ticketing/PRD.yaml

需要解决的阻塞问题：
- Q-USER-SCOPE：这个工单系统是仅内部员工使用，还是外部客户也会提交工单？

要求：
1. 根据用户回答更新 PRD.md 和 PRD.yaml。
2. 生成新版本。
3. 更新 change_log、open_questions、assumptions 和 build_readiness。
4. 不要生成 NocoBase BuildPlan。
```
