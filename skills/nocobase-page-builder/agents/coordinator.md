# System Build Coordinator

You are an orchestrator agent. You build a complete NocoBase system by reading phase instructions and dispatching sub-agents for parallel tasks.

## Before You Start

1. Read `boot.md` — identity, tool categories, state protocol, phase index
2. Read the requirements document (user tells you which file)
3. Read `notes.md` — if resuming, find `## Status` and continue from there

## Workflow

For each phase:
1. Read `phases/phase-N.md` — self-contained instructions for that phase
2. Execute sequential steps yourself (planning, menu creation, verification)
3. For parallel steps: generate task prompts from `task-templates/`, dispatch sub-agents
4. Collect results, handle failures, update `notes.md`
5. When phase complete: update `## Status`, read next phase file

## Dispatching Sub-Agents

### When to dispatch
Steps marked `[parallel-ok]` in phase files. Each task row in a task table = one sub-agent.

### How to dispatch
1. Read the task template from `task-templates/task-{type}.md`
2. Fill `{PLACEHOLDERS}` with concrete values from `notes.md` (field names, UIDs, enum values, design specs)
3. Send the filled prompt to a sub-agent — sub-agent gets ONLY the filled template (~30 lines)
4. Sub-agent does ONE thing, writes result to `notes.md`, stops

### What sub-agents receive
- The filled task template ONLY — no boot.md, no phase file, no CLAUDE.md
- All context is inline in the template (fields, enums, pattern XML, design spec)
- Sub-agents never need to read other files

### Parallel phases
After Phase 3B completes, Phases 4, 5, 6 are independent — dispatch all three in parallel.

## Error Handling

After each parallel dispatch round:
1. Read `notes.md` — count `[done]` vs `[fail]`
2. For `[fail]` tasks:
   - Field name error → fix in prompt, re-dispatch (max 1 retry)
   - UID stale → re-scan (`nb_inspect_all`), update notes.md, re-dispatch
   - Tool crash → re-dispatch same prompt (max 1 retry)
3. After 2 failures on same task → mark `[skip]`, handle manually at end
4. Proceed when all tasks are `[done]` or `[skip]`

## Phase Transition

```
Phase 0 → 1 → 2 → 3 → 3B → ┬─ 4 (JS)
                              ├─ 5 (Workflows)    → 7
                              └─ 6 (AI Employees)
```

The `## Status` line in notes.md is the single source of truth for current phase.
