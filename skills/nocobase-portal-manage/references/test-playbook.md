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

### UI Handoff

Prompt:

```text
在 customer portal 里加一个订单管理页面
```

Expected:

- hand off page/block authoring to `nocobase-ui-builder`
- do not run `nb portal create/config/push` unless Portal workspace management is also requested
