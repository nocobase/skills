# Relation Leaf Field

关系叶子字段是指类似：

- `roles.title`
- `department.name`

这样的 `fieldPath`。

## 适用场景

- display 场景最常见
- 用于 table/details/list/gridCard 展示关联对象的人类可读字段

## 推荐规则

- 如果用户说“显示部门名”“显示角色标题”，优先映射到关系叶子字段，而不是只放关联 id。
- to-many 关系叶子字段在 display 场景是允许的。
- 调用方不需要自己处理 `associationPathName`、`titleField` 或点击上下文归一化。

## 常见后续配置

关系字段展示后，常见下一步是：

- `clickToOpen = true`
- 配 `openView`

这类配置要先读回拿到 `wrapperUid/fieldUid`。
