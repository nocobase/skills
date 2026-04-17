# 表单与动作 recipe

适用于 filter、create、edit、details、popup/openView、record actions 以及相关动作树。

## 先读

- [../blocks/filter-form.md](../blocks/filter-form.md)
- [../blocks/create-form.md](../blocks/create-form.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [../blocks/details.md](../blocks/details.md)
- [../patterns/index.md](../patterns/index.md)

## 默认步骤

1. 先确认页面骨架和 section；不要跳过 page planning 直接拼动作树。
2. 用本地 graph / `schemas` 明确：
   - 当前 block 的 `actions` 槽位允许哪些 use
   - popup / openView 对应 page subtree 的稳定结构
   - selector、`filterByTk`、`dataScope.filter` 该落在哪一层
3. 关系筛选或 query filter 统一用 `flow_payload_guard.mjs build-filter` / `build-query-filter` 生成。
4. 动作/表单树真正落库时，统一交给 `ui_write_wrapper.mjs run --action save|mutate|ensure`；不要自己手动跑完 guard 再裸写。

## 关键规则

- 不能把泛型 `ActionModel` 当作所有 action slot 的最终结构。
- “关联标题列点击弹窗”优先原生关系列方案；不要默认退回 `JSFieldModel` / `JSColumnModel`。
- popup / openView 的 page subtree 需要和对应 `pageModelClass`、slot 契约对齐。
- 未经验证时，不要猜 `associationName`、relation path、through 结构。
- 下面的 JSON 只作为 wrapper 输入 payload 参考，不再是直接执行入口。

## 最小可执行示例

最小创建表单区块时，默认执行入口应是：

```bash
node scripts/ui_write_wrapper.mjs run \
  --action save \
  --task "append create form block" \
  --payload-file "<create-form-payload.json>" \
  --metadata-file "<metadata.json>" \
  --readback-parent-id "tabs-k7n4x9p2q5ra" \
  --readback-sub-key "grid"
```

对应的 payload 参考仍然可以是：

```json
{
  "tool": "PostFlowmodels_save",
  "arguments": {
    "includeAsyncNode": true,
    "return": "model",
    "requestBody": {
      "uid": "c5v1n8r4y2ka",
      "parentId": "tabs-k7n4x9p2q5ra",
      "subKey": "items",
      "subType": "array",
      "use": "CreateFormModel",
      "subModels": {
        "grid": {
          "uid": "f2m7q4x9p3ta",
          "use": "FormGridModel",
          "subModels": {
            "items": []
          }
        },
        "actions": [
          {
            "uid": "f2m7q4x9p3tb",
            "use": "FormSubmitActionModel"
          }
        ]
      }
    }
  }
}
```

最小编辑弹窗动作时，依然是同一个 wrapper 入口；下面只保留底层 payload 参考：

```json
{
  "tool": "PostFlowmodels_save",
  "arguments": {
    "includeAsyncNode": true,
    "return": "model",
    "requestBody": {
      "uid": "e7p4m9q2r6ta",
      "parentId": "table-actions-k7n4x9p2q5ra",
      "subKey": "actions",
      "subType": "array",
      "use": "EditActionModel",
      "stepParams": {
        "buttonSettings": {
          "general": {
            "title": "编辑成员",
            "type": "default"
          }
        },
        "popupSettings": {
          "openView": {
            "mode": "dialog",
            "size": "medium",
            "dataSourceKey": "main",
            "collectionName": "project_members",
            "pageModelClass": "ChildPageModel",
            "filterByTk": {
              "project_id": "{{ctx.record.project_id}}",
              "user_id": "{{ctx.record.user_id}}"
            }
          }
        }
      },
      "subModels": {
        "page": {
          "uid": "e7p4m9q2r6tb",
          "use": "ChildPageModel",
          "subModels": {
            "tabs": [
              {
                "uid": "e7p4m9q2r6tc",
                "use": "ChildPageTabModel",
                "stepParams": {
                  "pageTabSettings": {
                    "tab": {
                      "title": "编辑成员"
                    }
                  }
                },
                "subModels": {
                  "grid": {
                    "uid": "e7p4m9q2r6td",
                    "use": "BlockGridModel",
                    "subModels": {
                      "items": [
                        {
                          "uid": "e7p4m9q2r6te",
                          "use": "EditFormModel",
                          "stepParams": {
                            "resourceSettings": {
                              "init": {
                                "dataSourceKey": "main",
                                "collectionName": "project_members",
                                "filterByTk": "{{ctx.view.inputArgs.filterByTk}}"
                              }
                            }
                          },
                          "subModels": {
                            "grid": {
                              "uid": "e7p4m9q2r6tf",
                              "use": "FormGridModel",
                              "subModels": {
                                "items": [
                                  {
                                    "uid": "e7p4m9q2r6tg",
                                    "use": "FormItemModel",
                                    "stepParams": {
                                      "fieldSettings": {
                                        "init": {
                                          "collectionName": "project_members",
                                          "fieldPath": "role"
                                        }
                                      }
                                    },
                                    "subModels": {
                                      "field": {
                                        "uid": "e7p4m9q2r6th",
                                        "use": "InputFieldModel",
                                        "stepParams": {
                                          "fieldSettings": {
                                            "init": {
                                              "collectionName": "project_members",
                                              "fieldPath": "role"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                ]
                              }
                            },
                            "actions": [
                              {
                                "uid": "e7p4m9q2r6ti",
                                "use": "FormSubmitActionModel",
                                "stepParams": {
                                  "buttonSettings": {
                                    "general": {
                                      "title": "提交",
                                      "type": "primary"
                                    }
                                  }
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

补充：

- `openView.filterByTk` 必须按目标 collection 的 `filterTargetKey` 展开：单键是 `{{ctx.record.<filterTargetKey>}}`，复合键是对象模板；上面的示例演示复合键。
- 把 `parentId` 换成目标 `TableBlockModel` / `DetailsBlockModel` / `TableActionsColumnModel` 的 action 槽宿主 uid。
- 如果需要关系筛选或 query filter，仍用 `node scripts/flow_payload_guard.mjs build-filter` / `build-query-filter` 生成片段，再回填到对应的 `dataScope.filter` 或 selector 上。

## validation 提醒

只有用户明确要求浏览器验证时，才继续做：

- popup / drawer 是否真的可打开
- record action 是否真的可触发
- details / relation block 是否在真实数据下可用

否则只汇报结构已落库、readback 是否匹配，以及 `runtimeUsable=not-run`。
