# Preflight Checklist

## Purpose

No mandatory manual preflight by this skill.

Execution follows direct `nb` command behavior and CLI-native checks.

## Optional Diagnostics (only when user explicitly asks)

```bash
nb --help
nb env list
nb env info
nb init --help
nb app --help
nb app upgrade --help
nb app stop --help
nb app start --help
```

## Rule

- Do not block task execution with extra precheck gates.
- Run requested command first, then surface CLI response.
