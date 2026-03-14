---
title: workflows 资源 HTTP API
description: workflows 资源的增删改查、版本管理与手动执行接口的参数说明与调用示例。
---

# workflows 资源 HTTP API

> 这些端点通过 NocoBase MCP 工具暴露；以下 HTTP 路径用于映射具体资源动作与参数。

## workflows:list

`GET /api/workflows:list`

列出工作流。通常只列出 `current: true` 的版本（每个工作流只显示当前版本）。

| 参数 | 说明 |
|---|---|
| `filter` | 过滤条件，如 `{"current":true}` |
| `sort` | 排序，如 `-createdAt` |
| `appends[]` | 追加关联，如 `stats`、`versionStats` |
| `except[]` | 排除字段，如 `config`（减小响应体积） |
| `page` / `pageSize` | 分页 |

```
GET /api/workflows:list?filter[current]=true&sort=-createdAt&except[]=config&appends[]=stats&appends[]=versionStats
```

---

## workflows:get

`GET /api/workflows:get`

获取单个工作流，检查是否可编辑时需附带 `versionStats`，编排节点时需附带 `nodes`。

| 参数 | 说明 |
|---|---|
| `filterByTk` | 工作流 ID |
| `appends[]` | 追加关联，如 `nodes`、`versionStats` |

```
GET /api/workflows:get?filterByTk=1&appends[]=nodes&appends[]=versionStats
```

---

## workflows:create

`POST /api/workflows:create`

创建工作流。`sync` 字段创建后不可修改，须在此处确定。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string | 是 | 工作流名称 |
| `type` | string | 是 | 触发器类型，见触发器文档 |
| `sync` | boolean | 是 | 同步（true）或异步（false）模式，创建后不可更改 |
| `enabled` | boolean | 否 | 是否启用，建议先设 false，配置完成后再启用 |
| `description` | string | 否 | 描述 |
| `options` | object | 否 | 引擎选项，如 `deleteExecutionOnStatus`、`stackLimit` |

```
POST /api/workflows:create
Body: {
  "title": "新建工作流",
  "type": "collection",
  "sync": false,
  "enabled": false,
  "options": { "deleteExecutionOnStatus": [], "stackLimit": 1 }
}
```

返回新建的 workflow 对象，包含 `id` 和 `key`。

---

## workflows:update

`POST /api/workflows:update`

更新工作流。白名单字段：`title`、`description`、`enabled`、`triggerTitle`、`config`、`options`、`categories`。

**注意：已执行过的版本（`versionStats.executed > 0`）不允许更新 `config`。**

| 参数 | 说明 |
|---|---|
| `filterByTk` | 工作流 ID（Query） |
| Body | 要更新的字段 |

```
# 配置触发器
POST /api/workflows:update?filterByTk=1
Body: {
  "config": {
    "collection": "users",
    "mode": 1,
    "changed": [],
    "condition": { "$and": [] }
  }
}

# 启用工作流
POST /api/workflows:update?filterByTk=1
Body: { "enabled": true }
```

---

## workflows:destroy

`POST /api/workflows:destroy`

删除工作流。若 `filterByTk` 指向的是当前版本，则同 `key` 的所有历史版本也会被删除。

```
POST /api/workflows:destroy?filterByTk=1
```

---

## workflows:revision

`POST /api/workflows:revision`

基于已有版本创建新版本（同一 `key`）。新版本初始为 `enabled: false, current: false`，节点配置与原版本相同。

**适用场景：已执行过的版本需要修改时，必须先通过此接口创建新版本，再在新版本上修改。**

| 参数 | 说明 |
|---|---|
| `filterByTk` | 源版本 workflow ID |
| `filter[key]` | 工作流的 key，确保新版本归属同一 key |

```
POST /api/workflows:revision?filterByTk=1&filter[key]=abc123
```

返回新版本的 workflow 对象，包含新的 `id`。

---

## workflows:execute

`POST /api/workflows:execute`

手动触发工作流执行，通常用于测试。`values` 的结构取决于触发器类型。

| 参数 | 说明 |
|---|---|
| `filterByTk` | workflow ID |
| `autoRevision` | `1` 表示首次执行后自动创建新版本，之后的修改在新版本上进行 |
| Body `values` | 触发器输入数据 |

```
POST /api/workflows:execute?filterByTk=1&autoRevision=1
Body: {
  "values": { "data": { "id": 1, "name": "test" } }
}
```

返回：`{ "execution": { "id": 10, "status": 1 }, "newVersionId": 2 }`
