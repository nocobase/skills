# Preflight Checklist

## Purpose

No mandatory manual preflight by this skill.

Execution follows direct `nb` command behavior and CLI-native checks.

## Optional Diagnostics (only when user explicitly asks)

```bash
nb --help
nb env list -s project
nb init --help
nb upgrade --help
nb stop --help
nb start --help
```

## Rule

- Do not block task execution with extra precheck gates.
- Run requested command first, then surface CLI response.
