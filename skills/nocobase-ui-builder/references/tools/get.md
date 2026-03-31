# `get`

对应 tool：

- `mcp__nocobase__GetFlowsurfaces_get`

## 用途

- 读取当前 target 树
- 获取 `nodeMap`
- 读取 pageRoute / tabRoute / tabs / popup 相关结构
- 做后续修复、排序、删除的基线

## 调用形状

```json
{
  "uid": "table-block-uid"
}
```

## 硬规则

- 只接受根级 locator。
- 不要写 `target`。
- 读回后优先记录关键 uid：`gridUid`、`actionsColumnUid`、`wrapperUid`、`fieldUid`、popup ids。
- 页面级读回时要同时看 `pageRoute`、`tabs`、`tabTrees`，不要只看 `tree`。
