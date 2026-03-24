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
5. 把 draft payload、metadata、readback target 交给 `ui_write_wrapper.mjs`。
6. 由 wrapper 内部固定执行 guard、选择底层写法、完成写后 readback。
7. 只有排序或删除这类不在 wrapper 覆盖范围内的动作，才单独走 `PostFlowmodels_move` / `PostFlowmodels_destroy`。

## 关键规则

- 默认做局部 patch，不要为局部改动重建整棵页面树。
- 没有 guard 通过或结构化 `risk_accept` + 重新审计，不得继续写入。
- `save` / `mutate` 返回 `ok` 不等于已成功落库；必须以后续 readback 为准。
- 自动对账依赖 `args.targetSignature` 和 `result.summary`；缺一项时只能报 `evidence-insufficient`。

## 最小可执行示例

向页面默认 grid 追加一个最小表格区块时，默认执行入口应是：

```bash
node scripts/ui_write_wrapper.mjs run \
  --action save \
  --task "append orders table block" \
  --payload-file "<payload.json>" \
  --metadata-file "<metadata.json>" \
  --readback-parent-id "tabs-k7n4x9p2q5ra" \
  --readback-sub-key "grid" \
  --target-signature "tabs-k7n4x9p2q5ra:grid"
```

其中 `<payload.json>` 里的底层 payload 仍然可以长这样，但这只是 wrapper 的输入，不再是直接执行指南：

```json
{
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
```

## 往下钻

- block 细节看 [../blocks/index.md](../blocks/index.md)
- popup / relation / tree / many-to-many 看 [../patterns/index.md](../patterns/index.md)
- JS / RunJS 看 [../js-models/index.md](../js-models/index.md)
