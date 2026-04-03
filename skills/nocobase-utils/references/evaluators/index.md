---
title: Expression Evaluator Engines
description: Overview of all expression engines available in NocoBase, engine selection guidance, variable syntax, and critical usage rules.
---

# Expression Evaluator Engines

NocoBase provides three built-in expression evaluation engines used across workflows, linkage rules, formula fields, and other places where expressions are configured. The engine is selected via an `engine` configuration field.

## Critical Rules

- **Never invent function names.** Always verify against the function tables in the reference files before using a function in an expression.
- **Engine names are exact strings**: `formula.js`, `math.js`, `string` — use these exact values in `engine` config fields.
- **Case matters in formula.js**: all function names are UPPER_CASE (e.g., `SUM`, `IF`, `TEXT`).
- **Case matters in math.js**: all function names are camelCase (e.g., `round`, `sqrt`, `mean`).
- The `string` engine does **not** evaluate expressions — it only replaces `{{variable}}` placeholders with their values.

## Engine Comparison

| Engine key | Package | Syntax style | Best for |
|---|---|---|---|
| `formula.js` | `@formulajs/formulajs` v4.4.9 | Excel-like `UPPER_CASE(args)` | Business calculations, text manipulation, date arithmetic, financial formulas |
| `math.js` | `mathjs` v15.1.0 | JS/math `camelCase(args)` | Scientific math, matrix/vector operations, unit conversions, complex numbers |
| `string` | built-in | Plain text with `{{var}}` replacement | Simple string templates — **no computation**, just variable substitution |

## Variable Syntax in Expressions

Variables are inserted into expressions using double-brace path expressions (`{{path.to.value}}`). The evaluator substitutes each placeholder before the engine evaluates the expression (or replaces with the literal value for the `string` engine).

Example:
```
ROUND({{price}} * {{qty}}, 2)
```

The concrete variable paths depend on the context where the expression is used (e.g., workflow node context, form linkage rule scope). Refer to the documentation for that specific feature for the available variable paths.

## Choosing an Engine

**Use `formula.js` when:**
- You need Excel-compatible formulas (IF, VLOOKUP, SUMIF, etc.)
- You're doing text formatting (LEFT, RIGHT, MID, TEXT, CONCATENATE)
- You need date calculations (DATEDIF, EDATE, NETWORKDAYS)
- You need financial functions (PMT, NPV, IRR, FV)

**Use `math.js` when:**
- You need operator expressions: `2 ^ 3`, `x mod y`, `sqrt(x)`
- You need matrix/vector operations
- You need unit conversions: `unit(5, 'cm') to 'inch'`
- You need complex number arithmetic
- The expression is more "mathematical" than "spreadsheet-like"

**Use `string` when:**
- You just want to interpolate variable values into a text template
- No computation is needed, e.g.: `"Order {{id}} has been created"`

## Detailed Function References

- [formula.js functions](formulajs.md) — complete categorized function table
- [math.js functions](mathjs.md) — complete categorized function table
