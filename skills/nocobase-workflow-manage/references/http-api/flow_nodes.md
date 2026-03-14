---
title: flow_nodes 资源 HTTP API
description: flow_nodes 节点的创建、更新、删除、移动、复制与测试接口参数说明与调用示例。
---

# flow_nodes 资源 HTTP API

> 这些端点通过 NocoBase MCP 工具暴露；以下 HTTP 路径用于映射具体资源动作与参数。
>
> **注意：除 `test` 外，所有写操作均要求工作流版本尚未执行（`versionStats.executed == 0`）。已执行的版本须先通过 `workflows:revision` 创建新版本。**

## nodes:create（创建节点）

`POST /api/workflows/<workflowId>/nodes:create`

在指定工作流下创建节点。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `type` | string | 是 | 节点类型，见节点文档。创建后不可更改。 |
| `title` | string | 否 | 节点标题 |
| `upstreamId` | number\|null | 是 | 上游节点 ID；`null` 表示插入为第一个节点 |
| `branchIndex` | number\|null | 是 | 分支序号；主链路使用 `null`；分支头节点使用对应整数 |
| `config` | object | 否 | 节点配置，可在创建后通过 `flow_nodes:update` 更新 |

```
POST /api/workflows/1/nodes:create
Body: {
  "type": "calculation",
  "title": "运算节点",
  "upstreamId": null,
  "branchIndex": null,
  "config": {}
}
```

返回创建的节点对象，包含 `id` 和 `key`。

---

## flow_nodes:update（更新节点）

`POST /api/flow_nodes:update`

更新节点的标题或配置。已执行版本不允许调用。

| 参数 | 说明 |
|---|---|
| `filterByTk` | 节点 ID（Query） |
| Body `title` | 修改节点标题 |
| Body `config` | 修改节点配置 |

```
POST /api/flow_nodes:update?filterByTk=10
Body: {
  "config": {
    "engine": "math.js",
    "expression": "{{$context.data.price}} * 1.1"
  }
}
```

---

## flow_nodes:destroy（删除节点）

`POST /api/flow_nodes:destroy`

删除节点。默认会同时删除其所有分支链路。

| 参数 | 说明 |
|---|---|
| `filterByTk` | 节点 ID（Query） |
| `keepBranch` | 可选，保留某个分支并将其接入主链路（填写 `branchIndex` 值） |

```
# 删除节点，连带删除所有分支
POST /api/flow_nodes:destroy?filterByTk=10

# 删除节点，保留 branchIndex=1 的分支接入主链路
POST /api/flow_nodes:destroy?filterByTk=10&keepBranch=1
```

---

## flow_nodes:destroyBranch（删除分支）

`POST /api/flow_nodes:destroyBranch`

删除分支节点的某条分支（连带删除分支内所有节点）。

| 参数 | 说明 |
|---|---|
| `filterByTk` | 分支父节点 ID（Query） |
| `branchIndex` | 要删除的分支序号 |
| `shift` | `1` 表示删除后将后续分支序号前移（适用于多条件节点） |

```
POST /api/flow_nodes:destroyBranch?filterByTk=5&branchIndex=2&shift=1
```

---

## flow_nodes:move（移动节点）

`POST /api/flow_nodes:move`

将节点移动到新位置（重新接入链路）。

| 参数 | 说明 |
|---|---|
| `filterByTk` | 要移动的节点 ID（Query） |
| Body `values.upstreamId` | 目标上游节点 ID；`null` 表示移动到链路最前面 |
| Body `values.branchIndex` | 目标分支序号；主链路使用 `null` |

约束：
- 工作流版本未被执行
- 不能将节点的上游设为自身
- 上游和分支序号与当前相同时接口会报错（无需移动）

```
# 移动节点到 nodeId=3 之后的主链路
POST /api/flow_nodes:move?filterByTk=10
Body: {
  "values": {
    "upstreamId": 3,
    "branchIndex": null
  }
}

# 移动节点到链路最前面
POST /api/flow_nodes:move?filterByTk=10
Body: {
  "values": {
    "upstreamId": null
  }
}
```

返回移动后的节点对象。

---

## flow_nodes:duplicate（复制节点）

`POST /api/flow_nodes:duplicate`

复制一个节点到指定位置。新节点复制原节点的 `type`、`title` 和 `config`（部分节点类型会通过 `duplicateConfig` 处理配置）。

| 参数 | 说明 |
|---|---|
| `filterByTk` | 要复制的源节点 ID（Query） |
| Body `values.upstreamId` | 新节点插入位置的上游节点 ID |
| Body `values.branchIndex` | 新节点的分支序号；主链路使用 `null` |
| Body `values.config` | 可选，覆盖复制后的节点配置 |

约束：
- 工作流版本未被执行
- 节点总数不超过服务端限制（`WORKFLOW_NODES_LIMIT`）

```
# 复制 nodeId=10 的节点，插入到 nodeId=3 之后的主链路
POST /api/flow_nodes:duplicate?filterByTk=10
Body: {
  "values": {
    "upstreamId": 3,
    "branchIndex": null
  }
}
```

返回新创建的节点对象，包含新的 `id` 和 `key`。

---

## flow_nodes:test（测试节点配置）

`POST /api/flow_nodes:test`

测试节点配置是否有效（仅部分节点类型实现了 `test` 方法，如 `calculation`、`query`、`request`）。

| 字段 | 说明 |
|---|---|
| Body `values.type` | 节点类型 |
| Body `values.config` | 节点配置 |

```
POST /api/flow_nodes:test
Body: {
  "values": {
    "type": "calculation",
    "config": { "engine": "math.js", "expression": "1 + 1" }
  }
}
```

成功时返回执行结果；配置错误时返回 500 及错误信息。
