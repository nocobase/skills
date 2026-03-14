---
title: 工作流 HTTP API
description: 工作流相关端点的资源列表与调用规范，这些端点通过 NocoBase MCP 工具暴露。
---

# 工作流 HTTP API

## 调用规范

- 这些接口在 MCP 中对应同名资源动作；优先通过 NocoBase MCP 工具调用。
- API 前缀为 `/api`，操作路由格式为 `/api/<resource>:<action>`。
- 关联资源操作格式为 `/api/<resource>/<id>/<association>:<action>`。
- 在 MCP 调用时，通常只需按资源动作和参数组织请求；此处保留 HTTP 路径用于端点映射与排障。

## 资源与接口

### workflows — 工作流

详细参数与示例：[workflows.md](workflows.md)

| 接口 | 说明 |
|---|---|
| `GET /api/workflows:list` | 列出工作流 |
| `GET /api/workflows:get` | 获取单个工作流（可附带节点） |
| `POST /api/workflows:create` | 创建工作流 |
| `POST /api/workflows:update` | 更新工作流（标题、配置、启用状态等） |
| `POST /api/workflows:destroy` | 删除工作流 |
| `POST /api/workflows:revision` | 创建新版本（同 key） |
| `POST /api/workflows:execute` | 手动触发执行 |

---

### flow_nodes — 节点

详细参数与示例：[flow_nodes.md](flow_nodes.md)

| 接口 | 说明 |
|---|---|
| `POST /api/workflows/<workflowId>/nodes:create` | 在指定工作流下创建节点 |
| `POST /api/flow_nodes:update` | 更新节点配置或标题 |
| `POST /api/flow_nodes:destroy` | 删除节点（默认连带删除其分支） |
| `POST /api/flow_nodes:destroyBranch` | 删除指定分支 |
| `POST /api/flow_nodes:move` | 移动节点到新位置 |
| `POST /api/flow_nodes:duplicate` | 复制节点到指定位置 |
| `POST /api/flow_nodes:test` | 测试节点配置（仅部分节点类型支持） |

---

### executions — 执行记录

详细参数与示例：[executions.md](executions.md)

| 接口 | 说明 |
|---|---|
| `GET /api/executions:list` | 列出执行记录 |
| `GET /api/executions:get` | 获取单个执行详情（含 jobs） |
| `POST /api/executions:cancel` | 取消执行中的记录 |
| `POST /api/executions:destroy` | 删除执行记录（运行中不可删除） |

---

### jobs — 节点作业

详细参数与示例：[jobs.md](jobs.md)

| 接口 | 说明 |
|---|---|
| `GET /api/jobs:get` | 获取单个节点作业详情（含完整 result） |
