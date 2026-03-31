# Tool Shapes

## 运行时必须区分两种 tool 形状

### 1. `GetFlowsurfaces_get`

当前 MCP tool：

- `mcp__nocobase__GetFlowsurfaces_get`

调用形状：

```json
{
  "uid": "table-block-uid"
}
```

或者：

```json
{
  "pageSchemaUid": "employees-page-schema"
}
```

规则：

- 只接受根级定位字段。
- 不接受 `requestBody`。
- 不接受 `target` 包装。
- 至少给出一个：`uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`。

### 2. 其余 `PostFlowsurfaces_*`

当前 MCP tool 统一是：

- `mcp__nocobase__PostFlowsurfaces_*`

调用形状统一为：

```json
{
  "requestBody": {
    "target": {
      "uid": "..."
    }
  }
}
```

也就是：

- `target` 是业务 payload 的一部分。
- MCP 层再包一层 `requestBody`。

## 当前会话已确认的 flowSurfaces tools

- `mcp__nocobase__GetFlowsurfaces_get`
- `mcp__nocobase__PostFlowsurfaces_catalog`
- `mcp__nocobase__PostFlowsurfaces_createpage`
- `mcp__nocobase__PostFlowsurfaces_compose`
- `mcp__nocobase__PostFlowsurfaces_configure`
- `mcp__nocobase__PostFlowsurfaces_addtab`
- `mcp__nocobase__PostFlowsurfaces_updatetab`
- `mcp__nocobase__PostFlowsurfaces_movetab`
- `mcp__nocobase__PostFlowsurfaces_removetab`
- `mcp__nocobase__PostFlowsurfaces_destroypage`
- `mcp__nocobase__PostFlowsurfaces_addblock`
- `mcp__nocobase__PostFlowsurfaces_addfield`
- `mcp__nocobase__PostFlowsurfaces_addaction`
- `mcp__nocobase__PostFlowsurfaces_updatesettings`
- `mcp__nocobase__PostFlowsurfaces_seteventflows`
- `mcp__nocobase__PostFlowsurfaces_setlayout`
- `mcp__nocobase__PostFlowsurfaces_movenode`
- `mcp__nocobase__PostFlowsurfaces_removenode`
- `mcp__nocobase__PostFlowsurfaces_mutate`
- `mcp__nocobase__PostFlowsurfaces_apply`

## 对齐 swagger 的目标公开 tools

这些名字已经在 `flowSurfaces` 的公开设计里成立；如果当前会话尚未出现，按同一命名规则理解并在运行时按需降级：

- `mcp__nocobase__PostFlowsurfaces_addblocks`
- `mcp__nocobase__PostFlowsurfaces_addfields`
- `mcp__nocobase__PostFlowsurfaces_addactions`
- `mcp__nocobase__PostFlowsurfaces_addrecordaction`
- `mcp__nocobase__PostFlowsurfaces_addrecordactions`

## 常见错误形状

错误：

```json
{
  "requestBody": {
    "target": {
      "uid": "table-uid"
    }
  }
}
```

这是错误的 `get` 调用形状。

正确：

```json
{
  "uid": "table-uid"
}
```

另一个错误：

```json
{
  "requestBody": {
    "uid": "table-uid",
    "type": "view"
  }
}
```

这里少了 `target`。

正确：

```json
{
  "requestBody": {
    "target": {
      "uid": "table-uid"
    },
    "type": "view"
  }
}
```
