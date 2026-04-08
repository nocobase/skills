# Skill Lint Checklist

Version: `1.1.0`  
Depends on: [`SKILL_SPEC_v1.md`](./SKILL_SPEC_v1.md)

## 1. Purpose

This checklist defines deterministic lint checks for skill quality gates. It is intended for both CI automation and manual PR review.

## 2. Severity Model

| Severity | Effect |
|---|---|
| `error` | blocks merge |
| `warn` | does not block merge in Phase 1, must be tracked |
| `info` | advisory only |

## 3. CI Decision Policy

Apply this merge decision policy:

- if any `error` exists -> `FAIL`
- if no `error` and any `warn` exists -> `PASS_WITH_WARNINGS`
- if no `error` and no `warn` -> `PASS`

## 4. Target Files

Checks in this document apply to:

- `skills/*/SKILL.md`
- `skills/*/references/**/*.md`
- `skills/*/agents/*.yaml` (for optional invocation policy checks)

## 5. Rule Checklist

### 5.1 Frontmatter Rules

| Rule ID | Severity | Check | Pass Criteria | Fail Message |
|---|---|---|---|---|
| `META-001` | error | Frontmatter fence exists | top section enclosed by `---` | `frontmatter is missing or malformed` |
| `META-002` | error | Required keys present | all required keys exist | `missing required frontmatter key(s)` |
| `META-003` | error | `name` format | `^[a-z0-9-]{3,64}$` | `name must match ^[a-z0-9-]{3,64}$` |
| `META-004` | error | `description` quality | length 20..300 and contains `Use when` | `description must be 20..300 chars and include Use when` |
| `META-005` | error | `version` format | valid semver | `version must use semver x.y.z` |
| `META-006` | error | `risk-level` enum | one of `low|medium|high` | `risk-level must be low, medium, or high` |
| `META-007` | error | `allowed-tools` precision | explicit list, no `All` | `allowed-tools must be least-privilege; All is forbidden` |
| `META-008` | warn | `argument-hint` actionability | has enum or structured hint shape | `argument-hint should include explicit enum/shape` |

Required frontmatter key set for lint:

- `name`
- `description`
- `argument-hint`
- `allowed-tools`
- `owner`
- `version`
- `last-reviewed`
- `risk-level`

### 5.2 Structure Rules

| Rule ID | Severity | Check | Pass Criteria | Fail Message |
|---|---|---|---|---|
| `SIZE-001` | error | Max line count | `SKILL.md` lines <= 500 | `SKILL.md exceeds 500 lines` |
| `SIZE-002` | warn | Pre-warning line count | if lines > 300 then split plan marker exists | `SKILL.md > 300 lines without split plan` |
| `SIZE-003` | error | Mandatory sections present | all required section headers found | `missing required section(s)` |
| `SIZE-004` | warn | Long inline sample control | no inline code block over 15 lines in main file | `long sample should move to references` |
| `SIZE-005` | warn | External link count | <= 10 external links | `too many external links in main file` |

Mandatory sections:

- `# Goal`
- `# Scope`
- `# Non-Goals`
- `# Input Contract`
- `# Workflow`
- `# Reference Loading Map`
- `# Safety Gate`
- `# Verification Checklist`
- `# References`

### 5.3 Clarification and Safety Rules

| Rule ID | Severity | Check | Pass Criteria | Fail Message |
|---|---|---|---|---|
| `CLAR-001` | error | Input contract completeness | required inputs + defaults + validation documented | `Input Contract is incomplete` |
| `CLAR-002` | error | Clarification gate exists | explicit pre-mutation gate section | `Mandatory Clarification Gate is missing` |
| `CLAR-003` | error | Missing-input mutation prevention | documented stop-and-ask rule | `mutation path allows missing required input` |
| `CLAR-004` | warn | Clarification boundedness | max rounds and question limits documented | `clarification bounds are missing` |
| `CLAR-005` | error | Safe defaults for `you decide` | defaults listed for major branches | `missing safe defaults for key branches` |
| `CLAR-006` | error | Secondary confirmation for high risk | if `risk-level: high`, explicit confirmation template exists | `high-risk skill missing secondary confirmation` |

### 5.4 Verification and Evaluation Rules

| Rule ID | Severity | Check | Pass Criteria | Fail Message |
|---|---|---|---|---|
| `EVAL-001` | error | Checklist size | verification list has >= 8 items | `Verification Checklist must contain at least 8 items` |
| `EVAL-002` | error | Readback policy | every write path includes readback | `write path missing readback verification` |
| `EVAL-003` | error | Minimal test scenarios | 5 scenarios exist (2 normal, 2 failure, 1 auth/permission) | `missing minimal scenario coverage` |
| `EVAL-004` | warn | Positive and negative cases | checklist includes allowed + denied case | `positive/negative verification pair missing` |
| `EVAL-005` | error | Rollback readiness | high-impact actions include rollback | `rollback section missing for high-impact operation` |

### 5.5 Governance Rules

| Rule ID | Severity | Check | Pass Criteria | Fail Message |
|---|---|---|---|---|
| `GOV-001` | error | Owner assigned | `owner` is present and non-empty | `owner is required` |
| `GOV-002` | error | Version bump policy | breaking behavior updates version | `breaking change without version bump` |
| `GOV-003` | warn | Review freshness | `last-reviewed` within 90 days | `last-reviewed is stale` |

### 5.6 Reference Rules

| Rule ID | Severity | Check | Pass Criteria | Fail Message |
|---|---|---|---|---|
| `REF-001` | error | References section has links | `# References` exists and contains >=1 Markdown link | `References section missing or empty` |
| `REF-002` | error | Local link style | local links are relative and use `/` path separators | `local references must use relative Markdown links with / separators` |
| `REF-003` | error | Local link validity | local links resolve to existing files | `broken local reference link detected` |
| `REF-004` | warn | Reference depth | reference files avoid deep chain links (`reference -> reference -> reference`) | `reference link depth should be one hop from SKILL.md` |
| `REF-005` | warn | Long reference TOC | `references/*.md` files over 100 lines contain a TOC section | `long reference file should include a table of contents` |
| `REF-006` | warn | Reference filename quality | reference filenames are descriptive kebab-case | `reference filename should be descriptive kebab-case` |
| `REF-007` | warn | External link freshness | external links include freshness marker (`[verified: YYYY-MM-DD]`) or file-level metadata | `external reference missing freshness marker` |
| `REF-008` | error | High-risk reference coverage | `risk-level: high` skills include >=1 official external link and >=1 internal runbook/reference path | `high-risk skill missing official + internal reference coverage` |

## 6. Suggested Lint Output Format

Use this format in CI logs:

```text
[ERROR] META-002 skills/nocobase-foo/SKILL.md: missing required frontmatter key(s): owner,last-reviewed
[WARN ] SIZE-002 skills/nocobase-bar/SKILL.md: line count 341 without split plan marker
[WARN ] REF-005 skills/nocobase-baz/references/http-api.md: long reference file should include a table of contents
[PASS ] CLAR-003 skills/nocobase-baz/SKILL.md
```

## 7. Suggested Exit Codes

| Exit Code | Meaning |
|---|---|
| `0` | pass with no errors |
| `1` | one or more blocking errors |
| `2` | lint runtime failure |

## 8. PR Review Companion Checklist

Use this manual checklist together with CI:

- Does the trigger sentence in `description` clearly define when to invoke this skill?
- Does the skill explicitly state what it does not handle?
- Are all risky actions protected by confirmation and rollback guidance?
- Is there enough verification detail to detect false positives?
- Are reference links stable and actually needed?

## 9. Rollout Plan

Phase 1:

- enforce all `error` rules
- report `warn` rules only

Phase 2:

- turn `SIZE-002`, `GOV-003`, and `REF-005` into blocking checks for new skills
- keep legacy skills under migration exceptions

Phase 3:

- enforce all rules for all skills

## 10. Changelog

- `1.1.0`: added `REF-*` reference lint rules and reference-file scope.
- `1.0.0`: initial lint checklist release.
