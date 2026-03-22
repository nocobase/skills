---
title: JSBlockModel 参考
description: 面向 builder 的 JSBlockModel 约束、stepParams 路径与默认代码模板。
---

# JSBlockModel

## 什么时候用

当页面需要一个独立、自定义展示区块，而普通区块不适合时使用：

- 横幅
- 统计卡
- 说明面板
- 第三方可视化容器

## builder 需要记住的结构

最关键的持久化路径：

```json
{
  "use": "JSBlockModel",
  "stepParams": {
    "jsSettings": {
      "runJs": {
        "version": "v2",
        "code": "ctx.render('<div/>');"
      }
    }
  }
}
```

约束：

- `code` 写在 `stepParams.jsSettings.runJs.code`
- `version` 默认 `v2`
- `runJs` 使用 raw params，不要把 `code` 当模板字段再二次结构化

## 默认写法

```js
ctx.render('<div style="padding:12px">Custom block</div>');
```

或：

```jsx
const { Card } = ctx.libs.antd;
ctx.render(
  <Card title={ctx.t('Summary')}>
    <div>{ctx.t('Content')}</div>
  </Card>
);
```

## 不要默认这么写

```js
ctx.element.innerHTML = '<div>...</div>';
```

## 何时再看别的文档

- 要加载外部库：回看 [runjs-overview.md](runjs-overview.md)
- 需要更明确的渲染规则：回看 [rendering-contract.md](rendering-contract.md)
