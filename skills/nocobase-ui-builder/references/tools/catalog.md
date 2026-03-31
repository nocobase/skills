# `catalog`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_catalog`

## 用途

- 查询当前 target 可创建的 block/field/action/recordAction
- 查询 `editableDomains`
- 查询 `settingsSchema` / `settingsContract`
- 查询 `eventCapabilities` / `layoutCapabilities`

## 最小调用

```json
{
  "requestBody": {
    "target": {
      "uid": "table-block-uid"
    }
  }
}
```

## 何时必须先调

- `add*` 前
- `updateSettings` 前
- `setEventFlows` 前
- `setLayout` 前
- 不确定当前 target 是否支持某能力时
