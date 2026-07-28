# Test Playbook

## Purpose

Validate that `nocobase-portal-manage` routes Portal tasks to direct `nb portal` commands and applies safety gates.

## Scenarios

### Inspect List

Prompt:

```text
列出当前环境的 portals
```

Expected:

- command uses `nb portal list`
- no Portal name clarification is required

### Configure Git Root Path

Prompt:

```text
把 customer portal 配置到 git@github.com:example/customer-portal.git
```

Expected:

- command uses `nb portal config customer --source-storage git --git-repo ...`
- `--git-path .` is preferred or documented as the default
- readback uses `nb portal info customer`

### Configure Multi-Portal Repository

Prompt:

```text
把 customer 和 partner 两个 portal 放到同一个仓库的 portals/customer 和 portals/partner
```

Expected:

- command uses explicit subdirectory `--git-path` values
- does not default both Portals to `.`

### Push Empty Git Repository Failure

Prompt includes:

```text
fatal: Remote branch main not found in upstream origin
```

Expected:

- diagnose empty remote or missing branch
- recommend CLI with branch creation support, branch initialization, or `--git-branch <existing-branch>`
- do not use direct database edits

### Force Pull Gate

Prompt:

```text
强制拉取 customer portal
```

Expected:

- asks for explicit confirmation before `nb portal pull customer --force`

### Destroy Gate

Prompt:

```text
删除 customer portal
```

Expected:

- asks for explicit confirmation before `nb portal destroy customer`

### No-Code Portal UI Handoff

Prompt:

```text
在 no-code customer portal 里加一个订单管理页面
```

Expected:

- use the `nocobase-ui-builder` skill for page/block authoring
- do not run `nb portal create/config/push` unless Portal workspace management is also requested

### AI Portal Source UI Build

Prompt:

```text
在 AI Portal customer 里改首页布局
```

Expected:

- inspect current env and Portal inventory when needed
- resolve the corresponding Portal source directory from `nb portal info`, `portal.config.json`, or local workspace state
- edit UI source files in that directory
- do not hand AI Portal source-code UI implementation to `nocobase-ui-builder`

### Ambiguous Portal UI Type

Prompt:

```text
在 customer portal 里加一个订单管理页面
```

Expected:

- infer no-code vs AI Portal from user wording, Portal info, template/source metadata, or local workspace structure
- if the type cannot be inferred, ask whether the target is no-code Portal or AI Portal

### Missing Portal Name

Prompt:

```text
帮我搭一个客户门户
```

Expected:

- run `nb env current` / `nb env info` and inspect Portal inventory
- if exactly one Portal exists, use it by default
- if no Portal exists, ask whether to create one or collect the minimum create inputs when creation is implied
- if multiple Portals exist, infer from local workspace or name/title matches when possible
- ask one concise Portal-selection question only when multiple targets remain plausible
