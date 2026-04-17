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

如果当前列是 `JSColumnModel`，先读 [../js-models/js-column.md](../js-models/js-column.md) 和 [../js-models/rendering-contract.md](../js-models/rendering-contract.md)。本文默认处理的是普通 `TableColumnModel + subModels.field` 数据列，不替代 RunJS 自定义列文档。

它解决的问题是：

- 列壳已创建，但页面不显示真实值
- `TableColumnModel` 已落库，但 `subModels.field` 缺失
- 不同字段类型该选哪个 display field model
- `customer.name` 这类关联路径列为什么容易不稳
- 关联标题列为什么不应默认自己承担 click-to-open

优先参考动态场景：

- 订单履约主表工作台
- 多标签业务工作台里的主表或关系表

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
        "fieldPath": "customer.name",
        "associationPathName": "customer"
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
            "fieldPath": "customer.name",
            "associationPathName": "customer"
          }
        }
      }
    }
  }
}
```

这里的 `associationPathName` 不是让你把绑定拆成 target collection + simple `fieldPath`。
它只是告诉 runtime：这个 dotted path 依赖哪一段关联前缀，需要把对应 relation append 进来。

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

1. 如果只是展示，保留 dotted path + `associationPathName`
2. 如果还要求点击打开 popup，直接退回到更稳定的“关系字段列 + title display + openView”方案
3. 或明确记录“关联路径列未稳定落库”

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
- 直接把 `customer.name` 当稳定路径使用，却漏掉 `associationPathName`
- 直接把 `customer.name` 当稳定路径使用，而不核对元数据与 schema
- 把 `customer.name` 这种 dotted path 列继续挂 click-to-open，再让它负责打开关联详情弹窗
- 发现 dotted path 列点开不稳后，默认切去 `JSFieldModel` / `JSColumnModel`

## 关联文档

- [../blocks/table.md](../blocks/table.md)
- [clickable-relation-column.md](clickable-relation-column.md)
- [popup-openview.md](popup-openview.md)
- [relation-context.md](relation-context.md)
