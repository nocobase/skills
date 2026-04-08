# SKILL Spec v1

Version: `1.1.0`  
Status: `active`  
Applies to: all skills under `skills/*/SKILL.md`

## 1. Purpose

This specification defines hard standards for authoring and reviewing skill files so that team members can produce consistent, safe, and testable skills even when different developers own different modules.

## 2. Scope

This specification governs:

- skill metadata (frontmatter)
- skill file structure
- reference architecture and loading strategy
- user-input and clarification flow
- safety gates for risky actions
- verification and testability
- PR review and release gates

This specification does not replace product requirements. It standardizes how requirements are expressed and enforced in skill files.

## 3. Core Principles and Hard Standards

The following standards are mandatory. Each includes hard constraints and merge-block conditions.

### 3.1 Principle A: Metadata Must Be Short and Precise

| Rule ID | Severity | Hard Standard | Pass Criteria | Block Condition |
|---|---|---|---|---|
| `META-001` | error | Frontmatter must exist with opening and closing `---`. | Frontmatter parsed successfully. | Missing or malformed frontmatter. |
| `META-002` | error | Required keys: `name`, `description`, `argument-hint`, `allowed-tools`, `owner`, `version`, `last-reviewed`, `risk-level`. | All required keys are present. | Any required key is missing. |
| `META-003` | error | `name` must match `^[a-z0-9-]{3,64}$`. | Regex match passes. | Name invalid or too long. |
| `META-004` | error | `description` length must be 20 to 300 chars and include `Use when`. | Length and phrase checks pass. | Too short/too long or missing trigger phrase. |
| `META-005` | error | `version` must use semver (`x.y.z`). | Semver parse passes. | Invalid version format. |
| `META-006` | error | `risk-level` must be one of `low`, `medium`, `high`. | Enum check passes. | Value outside allowed set. |
| `META-007` | error | `allowed-tools` must be explicit and least-privilege. `All` is forbidden. | Tools list contains specific scopes only. | `All` is used or tool scope is ambiguous. |
| `META-008` | warn | `argument-hint` should include at least one explicit enum or structured argument shape. | Hint is actionable. | Hint is free-form only. |

### 3.2 Principle B: Keep `SKILL.md` Compact, Move Details to References

| Rule ID | Severity | Hard Standard | Pass Criteria | Block Condition |
|---|---|---|---|---|
| `SIZE-001` | error | `SKILL.md` line count must be `<= 500`. | Line count within limit. | Line count exceeds 500. |
| `SIZE-002` | warn | Line count over 300 requires a split plan into `references/`. | Split plan is documented in PR. | No split plan when over 300 lines. |
| `SIZE-003` | error | Required sections must exist: `Goal`, `Scope`, `Non-Goals`, `Input Contract`, `Workflow`, `Reference Loading Map`, `Safety Gate`, `Verification Checklist`, `References`. | All section headers found. | Any required section missing. |
| `SIZE-004` | warn | Long examples (`>15` lines each) should live in `references/*.md`. | Long samples moved to references. | Long inline samples remain in main file. |
| `SIZE-005` | warn | External links should be limited to 10 per `SKILL.md`. | Link count <= 10. | Link count > 10 without justification. |

### 3.3 Principle C: Clarification Gate Must Be Explicit

| Rule ID | Severity | Hard Standard | Pass Criteria | Block Condition |
|---|---|---|---|---|
| `CLAR-001` | error | `Input Contract` must list required inputs, defaults, and validation constraints. | All required input definitions present. | Missing required input contract fields. |
| `CLAR-002` | error | Skill must define a mandatory clarification gate before mutation. | Gate section exists and is enforceable. | Mutation path exists without gate. |
| `CLAR-003` | error | Mutation cannot run if required input is missing. | Stop-and-ask behavior is documented. | Skill allows write with missing required input. |
| `CLAR-004` | warn | Clarification should be bounded to max 2 rounds and max 3 questions per round. | Round/question caps are documented. | No cap documented. |
| `CLAR-005` | error | For `you decide` user input, safe defaults must be defined. | Default strategy is listed for all required branching inputs. | No default strategy for key branches. |
| `CLAR-006` | error | `risk-level: high` must include explicit secondary confirmation before risky actions. | Confirmation sentence template exists. | No explicit secondary confirmation rule. |

### 3.4 Principle D: Define Verification Before Execution

| Rule ID | Severity | Hard Standard | Pass Criteria | Block Condition |
|---|---|---|---|---|
| `EVAL-001` | error | `Verification Checklist` must include at least 8 items. | Checklist item count >= 8. | Fewer than 8 checklist items. |
| `EVAL-002` | error | Every write action must define readback verification. | Readback step exists per mutation path. | Write path without readback. |
| `EVAL-003` | error | Skill must define minimal test set: 5 scenarios. | Scenarios include normal, missing-input, auth/permission failure. | Missing scenario coverage. |
| `EVAL-004` | warn | Checklist should include one allowed and one denied case. | Positive and negative case entries exist. | Missing either case type. |
| `EVAL-005` | error | High-impact operations must include rollback guidance. | Rollback conditions and steps documented. | No rollback section for high-impact operations. |

### 3.5 Cross-Cutting Contract: References Must Be Structured and Actionable

| Rule ID | Severity | Hard Standard | Pass Criteria | Block Condition |
|---|---|---|---|---|
| `REF-001` | error | `# References` must exist and contain at least one link entry in the skill file. | Section exists and includes link entries. | Missing section or empty references. |
| `REF-002` | error | Local file references must use relative Markdown links with `/` separators. | Relative links parse and use normalized path style. | Bare filenames, absolute local paths, or `\` separators. |
| `REF-003` | error | Every local reference link must resolve to an existing file. | All local links are valid targets. | Any broken local reference link. |
| `REF-004` | warn | Avoid deep link chains. Keep reference depth to one hop from `SKILL.md`. | Skill links directly to needed references. | Habitual `SKILL.md -> reference A -> reference B` dependency chains. |
| `REF-005` | warn | Reference files over 100 lines should include a table of contents. | TOC section exists for long files. | Missing TOC on long reference files. |
| `REF-006` | warn | Reference files should be single-topic and named in descriptive kebab-case. | Filename and content are topic-focused and readable. | Generic filenames or mixed-topic reference files. |
| `REF-007` | warn | External references should include freshness metadata in line (`[verified: YYYY-MM-DD]`) or in file-level metadata. | Freshness marker exists for external links. | External links without freshness marker. |
| `REF-008` | error | For `risk-level: high`, references must include at least one official external source and one internal runbook/reference path. | Both source types are present and explicit. | High-risk skill lacks official + internal reference coverage. |

## 4. Required Frontmatter Template

Use this template for all new skills.

```yaml
---
name: example-skill
description: Use when users need ...
argument-hint: "[action: inspect|create|update] [target]"
allowed-tools: MCP, Read
owner: team-or-person
version: 1.0.0
last-reviewed: 2026-04-07
risk-level: medium
---
```

## 5. Required Section Skeleton

Use this skeleton for all new `SKILL.md` files.

```md
# Goal

# Scope

# Non-Goals

# Input Contract

# Mandatory Clarification Gate

# Workflow

# Reference Loading Map

# Safety Gate

# Verification Checklist

# References
```

## 6. Risk Level Guidance

| Risk Level | Typical Actions | Mandatory Controls |
|---|---|---|
| `low` | inspect, list, read-only analysis | input validation + result sanity checks |
| `medium` | create/update without destructive effects | clarification gate + readback |
| `high` | delete, overwrite, publish, migration, permission elevation | clarification gate + secondary confirmation + rollback plan |

## 7. Governance and Review Policy

| Rule ID | Severity | Hard Standard | Pass Criteria | Block Condition |
|---|---|---|---|---|
| `GOV-001` | error | Every skill must declare `owner`. | Owner field set and valid. | Missing owner. |
| `GOV-002` | error | Every PR touching skills must have reviewer sign-off. | Reviewer approval present. | No reviewer approval. |
| `GOV-003` | warn | `last-reviewed` should be refreshed at least every 90 days. | Date freshness <= 90 days. | Stale review date. |
| `GOV-004` | error | Breaking behavior changes require version bump. | Version increment documented. | Behavior changes without bump. |

## 8. Exceptions Process

Exceptions are allowed only when all conditions below are met:

- a documented technical reason exists
- risk and impact are explicitly described
- compensating controls are documented
- an expiration date is set
- owner and reviewer both approve

Exception record format:

```md
Exception ID: EXC-YYYYMMDD-01
Rule IDs: SIZE-003, CLAR-004
Reason:
Risk:
Compensating Controls:
Expiry Date:
Owner Approval:
Reviewer Approval:
```

## 9. Adoption Plan for Existing Repository

Phase 1 (new skills only):

- enforce all `error` rules
- keep `warn` as non-blocking

Phase 2 (existing skills migration):

- migrate top-priority skills first (`install-start`, `acl-manage`, `workflow-manage`)
- convert repeated long content into `references/`
- add missing sections and metadata

Phase 3 (full enforcement):

- turn selected warning rules into blocking rules
- enforce stale-review and size discipline
- enforce reference quality and freshness discipline

## 10. Changelog

- `1.1.0`: added `REF-*` reference architecture and quality standards.
- `1.0.0`: initial hard-standard release.
