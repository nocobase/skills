# 区块增删改移 recipe

适用于现有页面或新页面 anchor 上的区块创建、更新、移动、删除与局部补丁。

## 先读

- [../page-first-planning.md](../page-first-planning.md)
- [../ui-api-overview.md](../ui-api-overview.md)
- [../patterns/payload-guard.md](../patterns/payload-guard.md)
- [../flow-schemas/index.md](../flow-schemas/index.md)

## 默认步骤

1. 先 `start-run`。
2. 先看本地 graph；只在 graph 不够时再补 `PostFlowmodels_schemabundle` / `PostFlowmodels_schemas`。
3. 对目标 page / tab / grid / slot 做一次写前 live snapshot。
4. 组装 draft payload。
5. 固定执行 guard 流水线：
   - `extract-required-metadata`
   - `canonicalize-payload`
   - `audit-payload`
6. 选择写入工具：
   - 单树、结构明确：`PostFlowmodels_save`
   - 多步事务或 `$ref` 串联：`PostFlowmodels_mutate`
   - 缺 object child 且 schema 已证明应存在：`PostFlowmodels_ensure`
   - 排序：`PostFlowmodels_move`
   - 删除：`PostFlowmodels_destroy`
7. 写后立刻做同目标 `GetFlowmodels_findone` readback，对账必须带 `args.targetSignature`。

## 关键规则

- 默认做局部 patch，不要为局部改动重建整棵页面树。
- 没有 guard 通过或结构化 `risk_accept` + 重新审计，不得继续写入。
- `save` / `mutate` 返回 `ok` 不等于已成功落库；必须以后续 readback 为准。
- 自动对账依赖 `args.targetSignature` 和 `result.summary`；缺一项时只能报 `evidence-insufficient`。

## 最小可执行示例

向页面默认 grid 追加一个最小表格区块：

```json
{
  "tool": "PostFlowmodels_save",
  "arguments": {
    "includeAsyncNode": true,
    "return": "model",
    "requestBody": {
      "uid": "m6w3t8q2p4za",
      "parentId": "tabs-k7n4x9p2q5ra",
      "subKey": "items",
      "subType": "array",
      "use": "TableBlockModel",
      "stepParams": {
        "resourceSettings": {
          "init": {
            "dataSourceKey": "main",
            "collectionName": "orders"
          }
        },
        "tableSettings": {
          "pageSize": {
            "pageSize": 20
          }
        }
      },
      "subModels": {
        "columns": []
      }
    }
  }
}
```

写后回读同一个 grid：

```json
{
  "tool": "GetFlowmodels_findone",
  "arguments": {
    "parentId": "tabs-k7n4x9p2q5ra",
    "subKey": "grid",
    "includeAsyncNode": true
  }
}
```

## 往下钻

- block 细节看 [../blocks/index.md](../blocks/index.md)
- popup / relation / tree / many-to-many 看 [../patterns/index.md](../patterns/index.md)
- JS / RunJS 看 [../js-models/index.md](../js-models/index.md)
