---
name: nocobase-utils
description: General-purpose NocoBase reference utilities covering cross-cutting topics such as evaluator engines, expression syntax, UID generation, and more. Use when you need authoritative reference information or reusable snippets that apply across multiple NocoBase features.
argument-hint: "[topic: evaluators|formulajs|mathjs|string-template|uid]"
allowed-tools: Read, Glob, Grep
---

# Goal

Provide accurate, authoritative reference information for NocoBase cross-cutting utilities. Content is organized by topic and will grow over time.

# When to Use

Invoke this skill (or its sub-references) when you need authoritative reference material that applies across multiple NocoBase features, such as:
- Expression evaluation engines and available functions
- Generating short opaque UIDs for UI schemas or other configuration payloads
- Other shared utilities (to be added)

# Bundled Scripts

- Reuse [scripts/uid.js](scripts/uid.js) when a UI or schema payload needs a short random UID and there is no existing project helper already in use.
- The script supports both patterns: import `uid()` into target code, or run `node scripts/uid.js 16` to print a UID immediately during agent work.

# Reference Index

| Topic | File |
|---|---|
| Filter condition format — structure, operators, variables | [references/filter/index.md](references/filter/index.md) |
| Evaluator engines — overview, engine selection, critical rules | [references/evaluators/index.md](references/evaluators/index.md) |
| formula.js complete function reference | [references/evaluators/formulajs.md](references/evaluators/formulajs.md) |
| math.js complete function reference | [references/evaluators/mathjs.md](references/evaluators/mathjs.md) |
| UID generation — when to use, guardrails, usage examples | [references/uid/index.md](references/uid/index.md) |
