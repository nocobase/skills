---
name: nocobase-utils
description: General-purpose NocoBase reference utilities covering filter conditions and field-specific operators, evaluator engines, expression syntax, UID generation, and more. Use when you need authoritative reference information or reusable snippets that apply across multiple NocoBase features.
argument-hint: "[topic: filter|evaluators|formulajs|mathjs|string-template|uid]"
allowed-tools: Read, Glob, Grep
---

# Goal

Provide accurate, authoritative reference information for NocoBase cross-cutting utilities. Content is organized by topic and will grow over time.

# When to Use

Invoke this skill (or its sub-references) when you need authoritative reference material that applies across multiple NocoBase features, such as:
- Constructing any persisted or UI-displayable NocoBase filter condition, especially when choosing an operator from natural-language intent
- Expression evaluation engines and available functions
- Generating short opaque UIDs for UI schemas or other configuration payloads
- Other shared utilities (to be added)

For filter authoring, invoke this skill with topic `filter`; reading the Filter reference is a hard prerequisite, not optional background material. Before emitting an operator, resolve the terminal field's live interface/type and select the operator from that field group's allowlist. Do not translate words such as “before”, “less than”, “at least”, or “not later than” directly into a generic comparison operator from model knowledge.

# Bundled Scripts

- Reuse [scripts/uid.js](scripts/uid.js) when a UI or schema payload needs a short random UID and there is no existing project helper already in use.
- The script supports both patterns: import `uid()` into target code, or resolve the script path in the current workspace and run `node <resolved-path-to-uid.js> 16` to print a UID during agent work.

# Reference Index

| Topic | File |
|---|---|
| Filter condition format — structure, operators, variables | [references/filter/index.md](references/filter/index.md) |
| Evaluator engines — overview, engine selection, critical rules | [references/evaluators/index.md](references/evaluators/index.md) |
| formula.js complete function reference | [references/evaluators/formulajs.md](references/evaluators/formulajs.md) |
| math.js complete function reference | [references/evaluators/mathjs.md](references/evaluators/mathjs.md) |
| UID generation — when to use, guardrails, usage examples | [references/uid/index.md](references/uid/index.md) |
