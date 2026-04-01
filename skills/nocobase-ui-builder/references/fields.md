# Fields

字段选择顺序：**先看容器，再看字段类型，再看是否需要 JS、关系叶子或 openView。** block 选型看 [blocks.md](./blocks.md)，JS 能力矩阵看 [js.md](./js.md)。

规则强度：

- `Hard rule`：不能违背
- `Default heuristic`：默认偏好
- `Fallback`：前两者不适用时再用

## 容器心智

- `table/details/list/gridCard`：以 display 字段为主
- `form/createForm/editForm`：以 editable 字段为主
- `filterForm`：以 filter 字段为主

## 绑定字段

最常见写法：

```json
"nickname"
```

或显式写法：

```json
{ "fieldPath": "nickname" }
```

常见 wrapper 配置：

- `label`
- `showLabel`
- `tooltip`
- `extra`
- `width`
- `fixed`

常见 field 配置：

- `titleField`
- `clickToOpen`
- `openView`
- `allowClear`
- `multiple`

## 关系叶子字段

典型 `fieldPath`：

- `roles.title`
- `department.name`

规则：

- `Default heuristic`：用户说“显示部门名 / 角色标题”时，优先映射到关系叶子字段，而不是只放关联 id
- `Default heuristic`：to-many 关系叶子字段在 display 场景允许使用
- `Default heuristic`：关系字段展示后，常见下一步是 `clickToOpen = true` 和 `openView`
- `Fallback`：这类后续配置通常要先读回拿到 `wrapperUid/fieldUid/innerFieldUid`

## `filterForm` 特殊点

- `Hard rule`：字段本质是筛选项，不是展示字段
- `Hard rule`：多目标时，优先使用 contract 明确暴露的 target 绑定字段，尤其是 `defaultTargetUid`
- `Hard rule`：不支持 `renderer: "js"`、`jsColumn`、`jsItem`

## JS 字段能力

- `Hard rule`：`renderer: "js"` 是绑定字段的 JS 变体，不是 standalone field type
- `Hard rule`：`jsColumn` 只允许在 `table`
- `Hard rule`：`jsItem` 只允许在 `form/createForm/editForm`

## 读回定位

大多数后续精确改配都要区分：

- `wrapperUid`
- `fieldUid`
- `innerFieldUid`

关系字段加 popup/openView、或对字段做更细粒度配置时，通常需要其中一个具体 uid。
