# Flow Model 配方

这些配方面向 Modern page (v2) 通过 MCP 构建首批公共区块的工作流。

以下所有配方都默认你已经先运行 `tool_journal.mjs start-run`，并会在每次工具调用后追加 `tool_call` 记录。完成后默认执行 `tool_review_report.mjs render`，输出复盘报告和自动改进清单。

## 1. 初始化探测

先抓取紧凑的 bundle：

```json
{
  "tool": "PostFlowmodels_schemabundle",
  "arguments": {
    "requestBody": {
      "uses": ["PageModel", "TableBlockModel", "CreateFormModel", "EditFormModel", "ActionModel"]
    }
  }
}
```

然后抓取你即将修改的精确模型文档：

```json
{
  "tool": "PostFlowmodels_schemas",
  "arguments": {
    "requestBody": {
      "uses": ["TableBlockModel", "CreateFormModel", "EditFormModel", "ActionModel"]
    }
  }
}
```

如果某个模型仍需要进一步确认：

```json
{
  "tool": "GetFlowmodels_schema",
  "arguments": {
    "use": "TableBlockModel"
  }
}
```

默认按 schema-first 执行：

- 先看 `jsonSchema`、`minimalExample`、`skeleton`、`dynamicHints`
- 如果 `schemas` 已经给出具体 slot schema 和 allowed uses，就直接构造该子树
- 只有当目标 slot 仍停留在泛型节点或运行时未解析状态时，才回退到样板页或稳定壳层

## 2. 创建页面壳

先预留一个 opaque 页面 `schemaUid`：

```bash
node scripts/opaque_uid.mjs reserve-page --title "Orders"
```

辅助脚本输出示例：

```json
{
  "created": true,
  "page": {
    "logicalKey": "p7x2m4q9t1va6r3c",
    "schemaUid": "k7n4x9p2q5ra",
    "defaultTabSchemaUid": "tabs-k7n4x9p2q5ra",
    "title": "Orders",
    "aliases": []
  }
}
```

```json
{
  "tool": "PostDesktoproutes_createv2",
  "arguments": {
    "requestBody": {
      "schemaUid": "k7n4x9p2q5ra",
      "title": "Orders",
      "parentId": null,
      "icon": "TableOutlined"
    }
  }
}
```

然后解析页面根节点和默认网格：

```json
{
  "tool": "GetFlowmodels_findone",
  "arguments": {
    "parentId": "k7n4x9p2q5ra",
    "subKey": "page",
    "includeAsyncNode": true
  }
}
```

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

## 3. 新增表格区块

使用上一步读取返回的网格 uid，例如 `ens_grid_uid`。

用辅助脚本批量生成 opaque 节点 id：

```bash
node scripts/opaque_uid.mjs node-uids \
  --page-schema-uid k7n4x9p2q5ra \
  --specs-json '[{"key":"ordersTable","use":"TableBlockModel","path":"block:table:orders:main"}]'
```

推荐的事务性写法：

```json
{
  "tool": "PostFlowmodels_mutate",
  "arguments": {
    "includeAsyncNode": true,
    "requestBody": {
      "atomic": true,
      "ops": [
        {
          "opId": "upsertTable",
          "type": "upsert",
          "params": {
            "values": {
              "uid": "m6w3t8q2p4za",
              "parentId": "ens_grid_uid",
              "subKey": "items",
              "subType": "array",
              "use": "TableBlockModel",
              "stepParams": {
                "tableSettings": {
                  "pageSize": { "pageSize": 20 },
                  "showRowNumbers": { "showIndex": true },
                  "dataScope": {
                    "filter": {
                      "logic": "$and",
                      "items": []
                    }
                  }
                }
              },
              "subModels": {
                "columns": []
              }
            }
          }
        }
      ],
      "returnModels": ["m6w3t8q2p4za"]
    }
  }
}
```

说明：

- `TableBlockModel.subModels.columns` 是公共字段；如果当前 `schemas` 已经展开到 `TableColumnModel` 和字段渲染子树，就可以直接创建列
- 只有当 `columns` 仍停留在泛型 / 未解析状态时，才先创建区块壳或读取样板页确认列定义

## 4. 新增创建表单区块

用规范逻辑路径批量生成表单区块 uid 和子网格 uid：

```bash
node scripts/opaque_uid.mjs node-uids \
  --page-schema-uid k7n4x9p2q5ra \
  --specs-json '[{"key":"ordersCreateForm","use":"CreateFormModel","path":"block:create-form:orders:main"},{"key":"ordersCreateFormGrid","use":"FormGridModel","path":"block:create-form:orders:main:grid"}]'
```

```json
{
  "tool": "PostFlowmodels_mutate",
  "arguments": {
    "includeAsyncNode": true,
    "requestBody": {
      "atomic": true,
      "ops": [
        {
          "opId": "upsertCreateForm",
          "type": "upsert",
          "params": {
            "values": {
              "uid": "c5v1n8r4y2ka",
              "parentId": "ens_grid_uid",
              "subKey": "items",
              "subType": "array",
              "use": "CreateFormModel",
              "stepParams": {
                "formModelSettings": {
                  "layout": {
                    "layout": "vertical",
                    "colon": true
                  },
                  "assignRules": {
                    "value": []
                  }
                },
                "eventSettings": {
                  "linkageRules": {
                    "value": []
                  }
                }
              },
              "subModels": {
                "grid": {
                  "uid": "f2m7q4x9p3ta",
                  "use": "FormGridModel"
                },
                "actions": []
              }
            }
          }
        }
      ],
      "returnModels": ["c5v1n8r4y2ka"]
    }
  }
}
```

说明：

- `CreateFormModel` 是公共模型
- `FormBlockModel` 是内部模型，不能直接提交
- 如果当前 `schemas` 已经展开到 `FormGridModel`、`FormItemModel`、字段渲染模型和 `FormSubmitActionModel`，就可以直接创建表单字段项和动作
- 只有当 `grid.items` 或 `field` 仍未解析时，才先创建表单壳，或读取样板页补齐结构

## 5. 新增编辑表单区块

```json
{
  "tool": "PostFlowmodels_mutate",
  "arguments": {
    "includeAsyncNode": true,
    "requestBody": {
      "atomic": true,
      "ops": [
        {
          "opId": "upsertEditForm",
          "type": "upsert",
          "params": {
            "values": {
              "uid": "e3r6v1m8q4ta",
              "parentId": "ens_grid_uid",
              "subKey": "items",
              "subType": "array",
              "use": "EditFormModel",
              "stepParams": {
                "formModelSettings": {
                  "layout": {
                    "layout": "vertical",
                    "colon": true
                  },
                  "assignRules": {
                    "value": []
                  }
                },
                "eventSettings": {
                  "linkageRules": {
                    "value": []
                  }
                },
                "formSettings": {
                  "dataScope": {
                    "filter": {
                      "logic": "$and",
                      "items": []
                    }
                  }
                }
              },
              "subModels": {
                "grid": {
                  "uid": "g8p2w5n1q4za",
                  "use": "FormGridModel"
                },
                "actions": []
              }
            }
          }
        }
      ],
      "returnModels": ["e3r6v1m8q4ta"]
    }
  }
}
```

## 6. 补齐缺失的对象子节点

只有在探测结果明确表明某个必需的 object child 本应存在、但当前缺失时，才使用 `PostFlowmodels_ensure`：

```json
{
  "tool": "PostFlowmodels_ensure",
  "arguments": {
    "includeAsyncNode": true,
    "requestBody": {
      "parentId": "tabs-k7n4x9p2q5ra",
      "subKey": "grid",
      "subType": "object",
      "use": "BlockGridModel",
      "async": true
    }
  }
}
```

不要把 `ensure` 当成“先不读当前树、直接补一个”的通用替代方案。

## 7. 更新现有区块

工作流：

1. 读取网格快照
2. 通过 `uid` 找到目标区块
3. 以线上区块 JSON 为基础
4. 只更新用户要求的 `stepParams` 或稳定的 `subModels`
5. 使用原来的 `uid` 保存回去

示例：只更新表格分页大小，而不是重建整个区块：

```json
{
  "tool": "PostFlowmodels_save",
  "arguments": {
    "return": "model",
    "includeAsyncNode": true,
    "requestBody": {
      "uid": "m6w3t8q2p4za",
      "parentId": "ens_grid_uid",
      "subKey": "items",
      "subType": "array",
      "use": "TableBlockModel",
      "stepParams": {
        "tableSettings": {
          "pageSize": { "pageSize": 50 },
          "showRowNumbers": { "showIndex": true },
          "dataScope": {
            "filter": {
              "logic": "$and",
              "items": []
            }
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

必须保留实时快照里已存在、但用户没有要求修改的字段。

## 8. 移动区块

```json
{
  "tool": "PostFlowmodels_move",
  "arguments": {
    "sourceId": "m6w3t8q2p4za",
    "targetId": "e3r6v1m8q4ta",
    "position": "before"
  }
}
```

移动之后一定要重新读取网格。

## 9. 删除区块

```json
{
  "tool": "PostFlowmodels_destroy",
  "arguments": {
    "filterByTk": "m6w3t8q2p4za"
  }
}
```

重新读取网格，并确认该 uid 已消失。

## 10. 删除页面

```json
{
  "tool": "PostDesktoproutes_destroyv2",
  "arguments": {
    "requestBody": {
      "schemaUid": "k7n4x9p2q5ra"
    }
  }
}
```

## V1 默认约束

- 默认目标页签是初始化时自动创建的隐藏页签：`tabs-{schemaUid}`
- 可见 / 自定义页签必须显式提供 `tabSchemaUid`
- 新页面的 `schemaUid` 应来自 `scripts/opaque_uid.mjs reserve-page`
- 新区块 / 子节点的 `uid` 应来自 `scripts/opaque_uid.mjs node-uids`
- 优先直接使用 `schemas` / `schema` 已明确展开的子树，不要再把这些稳定子树一律视为“不能生成”
- 不要自由生成当前 schema 文档尚未展开的 `grid.items`、表格列或字段渲染子树
- 每次请求周期内优先只做一次局部变更，然后重新读取
