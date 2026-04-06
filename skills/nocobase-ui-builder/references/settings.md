# Public settings

当你已经知道要创建 block / field / action / record action，并且用户还要求标题、标签、必填、按钮样式这类高频属性时，优先读本文。目标是让 `add*` 直接内联**公开语义 settings**，而不是先创建空节点再机械补一次 `configure`。`catalog` 是否必读，统一看 [normative-contract.md](./normative-contract.md)。

## 目录

1. 核心规则
2. 决策矩阵
3. `settings` 的合法形状
4. 高影响提醒
5. 高频模板
6. 什么时候不要硬塞进 `settings`
7. Readback 心智

## 核心规则

1. 如果本次需要依赖 live `configureOptions` / `settingsContract` 判断公开字段，就先按 [normative-contract.md](./normative-contract.md) 读 `catalog(target)`；判断依据同时包括 target 顶层 `configureOptions` 与 item 级 `configureOptions`。
2. `requestBody.settings` 只写**公开语义 key**，不要写 raw `props / decoratorProps / stepParams / flowRegistry / wrapperProps / fieldProps`。
3. 如果用户需求能完全由 `settings` 表达，就直接 `add* + settings`，不要额外再补 `configure`。
4. 如果只有部分字段能内联，先 `add* + settings`，再 `configure(changes)` 补剩余公开字段。
5. 只有 path-level contract 才回退到 `updateSettings`；布局与事件流仍然使用专用 API。

## 决策矩阵

| 需求类型 | 默认入口 | 什么时候用 |
| --- | --- | --- |
| 创建节点 + 高频公开属性 | `add* + settings` | 目标字段已在现场暴露为公开语义；若需确认，按 normative contract 先读 `catalog` |
| 已创建节点的小改 | `configure(changes)` | 仍然属于公开语义字段，但不必重建节点 |
| path-level 精细 patch | `updateSettings` | 现场只暴露 domain contract，没有公开语义入口 |
| 布局 | `setLayout` | 只有用户明确接受整体布局替换，且当前完整 layout 已读回 |
| 事件流 | `setEventFlows` | 只有用户明确接受实例级 flow 整体替换，且当前完整 flow 已读回 |

## 高影响提醒

- `setLayout` 与 `setEventFlows` 不属于普通 patch；它们都是 high-impact full-replace API。
- 不要因为“只是改一个布局项 / 一个 flow”就默认走这两个接口；如果用户不是在要求整体替换，优先回到 `compose/add*`、`configure` 或 `updateSettings`。
- 一旦使用它们，写前先读完整当前状态，写后按完整状态做 `readback`，不要只看局部 delta。

## `settings` 的合法形状

`settings` 与 `configure(changes)` 共享同一层公开语义，不应该泄露底层树结构。

合法示例：

```json
{
  "settings": {
    "title": "新增用户",
    "displayTitle": true
  }
}
```

```json
{
  "settings": {
    "label": "密码",
    "required": true
  }
}
```

```json
{
  "settings": {
    "title": "提交",
    "type": "primary"
  }
}
```

不合法：

```json
{
  "settings": {
    "props": {
      "title": "新增用户"
    }
  }
}
```

```json
{
  "settings": {
    "stepParams": {
      "buttonSettings": {
        "general": {
          "title": "提交"
        }
      }
    }
  }
}
```

```json
{
  "settings": {
    "rows": {
      "row1": ["a", "b"]
    },
    "flowRegistry": {}
  }
}
```

## 高频模板

### `addBlock`

创建 `createForm` 并直接带标题：

```json
{
  "requestBody": {
    "target": { "uid": "grid-uid" },
    "type": "createForm",
    "resourceInit": {
      "dataSourceKey": "main",
      "collectionName": "users"
    },
    "settings": {
      "title": "新增用户",
      "displayTitle": true
    }
  }
}
```

适合直接内联的高频 block settings：

- `title`
- `displayTitle`
- `height`
- `heightMode`
- 表单类 block 常见还包括 `labelWidth`、`labelWrap`、`layout`、`labelAlign`、`colon`

### `addField`

创建**绑定真实字段**时，`fieldPath` 属于创建必需参数；标签、必填等属于 `settings`：

```json
{
  "requestBody": {
    "target": { "uid": "form-uid" },
    "fieldPath": "password",
    "settings": {
      "label": "密码",
      "required": true
    }
  }
}
```

`addFields` 的批量形状才使用 `fields: []`：

```json
{
  "requestBody": {
    "target": { "uid": "form-uid" },
    "fields": [
      {
        "fieldPath": "password",
        "settings": {
          "label": "密码",
          "required": true
        }
      }
    ]
  }
}
```

如果创建的是 `jsColumn` / `jsItem` 这类 synthetic standalone field，允许不传真实 `fieldPath`；是否允许以 live `catalog` 为准。

适合直接内联的高频 field settings：

- `label`
- `showLabel`
- `required`
- `disabled`
- `tooltip`
- `extra`

### `addAction`

创建提交按钮并直接带标题与类型：

```json
{
  "requestBody": {
    "target": { "uid": "form-uid" },
    "type": "submit",
    "settings": {
      "title": "提交",
      "type": "primary"
    }
  }
}
```

适合直接内联的高频 action settings：

- `title`
- `tooltip`
- `icon`
- `type`
- `color`
- `danger`
- `confirm`

### `addRecordAction`

创建记录级查看动作并直接带标题：

```json
{
  "requestBody": {
    "target": { "uid": "table-uid" },
    "type": "view",
    "settings": {
      "title": "查看"
    }
  }
}
```

## 什么时候不要硬塞进 `settings`

- live `catalog.configureOptions` 没暴露这个字段
- 这是布局数据，如 `rows / sizes / rowOrder`
- 这是事件流或 `flowRegistry`
- 这是明确的 path-level domain patch
- 这是 popup subtree 内容，而不是当前节点的公开属性

## Readback 心智

写入层只关心公开语义；读回层允许检查服务端如何把它镜像到内部结构。

常见现象：

- `required` 可能同时落到 `props` 和 `stepParams`
- 按钮 `title/type` 可能同时落到 `props` 和 `stepParams.buttonSettings.general`
- 区块外层显示配置可能同时落到 `props`、`decoratorProps` 或别的 runtime 域

不要反过来把这些读回出来的内部结构，当成下一次创建时的输入模板。
