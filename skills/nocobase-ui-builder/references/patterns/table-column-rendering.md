---
title: 表格列渲染
description: 真实可见数据列的完成标准、字段类型到 display model 的默认映射，以及关联路径列的边界。
---

# 表格列渲染

## 适用区块与问题

适用于所有 `TableBlockModel` 场景，尤其是：

- 主列表页
- 详情内关系表
- popup page 内的子表

它解决的问题是：

- 列壳已创建，但页面不显示真实值
- `TableColumnModel` 已落库，但 `subModels.field` 缺失
- 不同字段类型该选哪个 display field model
- `customer.name` 这类关联路径列为什么容易不稳

优先参考：

- [case1](../validation-cases/case1.md)
- [case10](../validation-cases/case10.md)

## 决策规则

当用户要求“表格展示真实数据”时，`TableColumnModel` 只有同时满足下面两点，才算完成：

1. 列本身存在
2. `subModels.field` 存在，且 `use` 是一个稳定的 display field model

只有列壳、没有 `subModels.field`，最多只能算“列结构已创建”，不能算“数据列已完成”。

## 最小 flow tree 形状

最小可见数据列应至少具备：

```json
{
  "use": "TableColumnModel",
  "stepParams": {
    "fieldSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "orders",
        "fieldPath": "order_no"
      }
    }
  },
  "subModels": {
    "field": {
      "use": "DisplayTextFieldModel"
    }
  }
}
```

## 默认映射

当 schema 已明确允许对应 display model 时，默认优先按下面映射：

| 字段类型 / 展示目标 | 默认 display model |
| --- | --- |
| 普通字符串、文本、标题、编号、关联标签文本 | `DisplayTextFieldModel` |
| `select` / enum / 状态字段 | `DisplayEnumFieldModel` |
| `integer` / `bigInt` / `float` / `decimal` / 数值金额 | `DisplayNumberFieldModel` |
| `date` / `datetime` / 时间类字段 | 优先选当前 schema 允许的日期/时间显示模型，常见为 `DisplayDateTimeFieldModel` |
| 布尔值 | `DisplayCheckboxFieldModel` |

如果 schema 没明确展开某个 display model，不要硬猜。

## 关联路径与 dotted path

像 `customer.name` 这类路径，必须单独谨慎处理：

- 先确认 `fieldPath` 在当前 collection 元数据与 schema 下是可解析的
- 再确认选择的 display model 是否适合这个路径
- 如果只知道 `customer` 关系存在，但无法稳定确认 `customer.name` 的渲染绑定，不要静默创建一个列壳然后报成功

表格/详情要展示关联标题字段时，优先保留父 collection，并直接写完整 dotted path。例如：

```json
{
  "use": "TableColumnModel",
  "stepParams": {
    "fieldSettings": {
      "init": {
        "collectionName": "orders",
        "fieldPath": "customer.name"
      }
    }
  },
  "subModels": {
    "field": {
      "use": "DisplayTextFieldModel",
      "stepParams": {
        "fieldSettings": {
          "init": {
            "collectionName": "orders",
            "fieldPath": "customer.name"
          }
        }
      }
    }
  }
}
```

不要改成下面这种拆分绑定：

```json
{
  "use": "TableColumnModel",
  "stepParams": {
    "fieldSettings": {
      "init": {
        "collectionName": "customers",
        "associationPathName": "customer",
        "fieldPath": "name"
      }
    }
  }
}
```

这类写法会让取值逻辑退化成在父记录上读取 `name`，很容易静默空值。

在这种场景里，允许的降级顺序是：

1. 退回到更稳定的关联字段展示方式
2. 或明确记录“关联路径列未稳定落库”

如果当前只确认了 `customer` / `product` 这类关联字段存在，而没有稳定的 relation-display 模式，不要直接写：

```json
{
  "use": "DisplayTextFieldModel",
  "stepParams": {
    "fieldSettings": {
      "init": {
        "fieldPath": "customer"
      }
    }
  }
}
```

这类写法在 validation case 下默认视为不稳定，需要先明确目标 titleField 或其他已验证的展示模板。

## 写后验收

回读表格后，至少检查：

- 每个目标列都有 `use=TableColumnModel`
- 每个目标列都有 `subModels.field.use`
- `subModels.field.stepParams.fieldSettings.init.fieldPath` 与列目标一致

如果缺任一项，最终结果必须写成“列壳已创建，数据列未完整完成”。

## 常见误区

- 只写 `TableColumnModel`，不写 `subModels.field`
- 只在 `tableColumnSettings.model.use` 里写 display model，却不创建实际 `subModels.field`
- 因为 popup/action 更复杂，就先牺牲主列表的真实可见列
- 把关联字段本身直接交给 `DisplayTextFieldModel(fieldPath=<relationField>)`，却没有验证实际可见值
- 直接把 `customer.name` 当稳定路径使用，而不核对元数据与 schema

## 关联文档

- [../blocks/table.md](../blocks/table.md)
- [popup-openview.md](popup-openview.md)
- [relation-context.md](relation-context.md)
