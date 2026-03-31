# Action Panel Block

`actionPanel` 是不绑定 collection block 的工具动作容器。

## 适用场景

- 页面顶部工具栏
- 工作台按钮区
- 触发工作流和自定义 JS 的操作面板

## 必备输入

不需要 collection resource。

## 公开语义

- `actions`
  - 当前公开高频动作主要是 `js`、`triggerWorkflow`

## 高频配置

- `layout`
- `ellipsis`
- `title`
- `displayTitle`

## 关键约束

- 它的 action scope 是 `actionPanel`，不是 collection block。
- 不要把 `addNew`、`refresh` 这类 collection actions 直接套到 `actionPanel`。
