---
title: Opaque UID 规则
description: 使用 opaque_uid.mjs 生成页面与节点 uid，避免手写语义化标识。
---

# Opaque UID 规则

所有页面和节点 uid 都应通过 `scripts/opaque_uid.mjs` 生成或解析，不要手写语义化 id。

## 默认路径

- 默认会按当前 session 解析 registry；通常不需要手动指定路径。
- 需要显式覆盖时，可传 `--registry-path <path>` 或设置 `NOCOBASE_UI_BUILDER_REGISTRY_PATH`。
- 需要固定 session 目录时，可设置 `NOCOBASE_UI_BUILDER_SESSION_ROOT` 或 `NOCOBASE_UI_BUILDER_STATE_DIR`。

## 常用命令

预留页面：

```bash
node scripts/opaque_uid.mjs reserve-page --title "Orders"
```

解析已有页面：

```bash
node scripts/opaque_uid.mjs resolve-page --title "Orders"
node scripts/opaque_uid.mjs resolve-page --schemaUid "k7n4x9p2q5ra"
```

重命名本地 registry 记录：

```bash
node scripts/opaque_uid.mjs rename-page \
  --schemaUid "k7n4x9p2q5ra" \
  --title "Orders Admin"
```

批量生成稳定节点 uid：

```bash
node scripts/opaque_uid.mjs node-uids \
  --page-schema-uid "k7n4x9p2q5ra" \
  --specs-json '[{"key":"ordersTable","use":"TableBlockModel","path":"block:table:orders:main"}]'
```

## 硬规则

1. `createV2` 模式下，页面 `schemaUid` 必须来自 `reserve-page`
2. 隐藏默认页签路由固定为 `tabs-{schemaUid}`
3. 页面根节点和默认 `grid` flow model 的 uid 仍由服务端生成，不要尝试覆盖
4. 新区块、列、表单项、动作都应通过 `node-uids` 批量生成
5. 即使这次只需要一个 uid，也统一传单元素数组给 `node-uids`
6. 如果 registry 缺失，且用户没有提供 `schemaUid`，不要靠猜标题恢复，直接停下索取 `schemaUid`

## 逻辑路径模式

- 区块壳：
  - `block:table:{collection}:{slot}`
  - `block:create-form:{collection}:{slot}`
  - `block:edit-form:{collection}:{slot}`
- 表格子节点：
  - `block:table:{collection}:{slot}:column:{field}`
  - `block:table:{collection}:{slot}:action:{action}`
- 新建表单子节点：
  - `block:create-form:{collection}:{slot}:grid`
  - `block:create-form:{collection}:{slot}:item:{field}`
  - `block:create-form:{collection}:{slot}:action:{action}`
- 编辑表单子节点：
  - `block:edit-form:{collection}:{slot}:grid`
  - `block:edit-form:{collection}:{slot}:item:{field}`
  - `block:edit-form:{collection}:{slot}:action:{action}`

不要从自然语言描述临时拼接路径。路径必须稳定、可重算、可复用。
