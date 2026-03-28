---
title: 可点击关联列
description: 表格中的关联标题字段如何稳定展示、点击打开 popup，以及何时禁止默认走 JS workaround。
---

# 可点击关联列

## 适用场景

- 列里显示 `publisher.name`、`customer.name` 这类关联标题
- 用户要求“点击这一列打开详情弹窗 / dialog / drawer”
- 同时涉及表格列渲染与 popup/openView

## 默认优先级

1. 如果只是展示关联标题，不带点击打开：
   - 允许用父 collection 上的 dotted path，例如 `customer.name`
   - 必须显式补 `associationPathName=customer`
2. 如果要求“点击标题打开关联详情弹窗”：
   - 默认不要让 `customer.name` 这种 dotted path 列自己承担 click-to-open
   - 优先改成“关系字段列”方案：绑定 `customer` 这类关系字段本身，让 runtime/title display 负责显示名称，再把 `clickToOpen + popupSettings.openView` 挂在这个原生关系列上
3. 只有用户明确要求 RunJS / JS 自定义交互时，才允许进入 `JSFieldModel` / `JSColumnModel`

## 默认处理

当需求同时命中以下信号时：

- 表格列
- 关联标题字段
- 点击打开 / popup / dialog / drawer

默认执行：

1. 不直接生成 `dotted path + click-to-open`
2. 不直接生成 `JSFieldModel` / `JSColumnModel`
3. 先回到原生关系列方案
4. 如果当前 reference 无法证明该原生方案稳定，再报 `partial/unverified`，不要静默切 JS

## 显式 JS 例外

只有在用户明确说“用 JS column / JS field / RunJS 做这个交互”时，才允许保留 JS 方案。

这类场景在 `audit-payload` 阶段要显式传：

```json
{
  "intentTags": ["js.explicit"]
}
```

没有这个 intent tag，guard 会把“关联标题列点击 popup 的 JS workaround”视为高风险误判。

## 常见误区

- 把 `customer.name` 当成稳定只读路径后，顺手再给它挂 click-to-open
- 为了避开 dotted path 风险，直接切成 `JSFieldModel` / `JSColumnModel`
- 用户只说“点列打开弹窗”，却自动理解成“要自定义 JS 单元格”

## 关联文档

- [table-column-rendering.md](table-column-rendering.md)
- [popup-openview.md](popup-openview.md)
- [payload-guard.md](payload-guard.md)
- [../js-models/js-column.md](../js-models/js-column.md)
