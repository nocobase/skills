# Capabilities

当你已经确定要往内容区搭东西，但还没决定该选什么 block / form / action / field 时，读本文。family / target 先看 [runtime-playbook.md](./runtime-playbook.md)，popup 与 `currentRecord` 语义看 [popup.md](./popup.md)，chart 专题入口看 [chart.md](./chart.md)，JS 规则看 [js.md](./js.md)。是否允许 `shell-only popup`，统一看 [normative-contract.md](./normative-contract.md)。

## 目录

1. 选型顺序
2. Block 选型
3. Form 选型
4. Action scope
5. FilterForm 通用能力
6. Field 规则

## 选型顺序

1. 先判断用户要的是 block、form、action 还是 field。
2. 再按容器与 scope 收敛：`table/details/list/gridCard/filterForm/actionPanel/form/createForm/editForm`。
3. 最后才看 JS、关系叶子字段、`openView`、layout 等专题配置。

下文中的 block / action 能力都是常见值，不是穷尽列表；最终以 live `catalog` 为准。

## Block 选型

### 默认创建能力

- 默认可创建：`table`、`details`、`list`、`gridCard`、`filterForm`、`markdown`、`iframe`、`chart`、`actionPanel`、`jsBlock`。
- `map`、`comments` 仅在现场 `catalog` 明确允许时才创建或小范围改配。
- 用户显式点名区块类型时，优先按这个 block 选型；区块语境里的 `Grid` 默认按 `gridCard` 处理。

### 常见 block 选择

| 用户目标 | 优先 block | 关键点 |
| --- | --- | --- |
| 数据表格操作、批量操作、树表、固定列 | `table` | 需要 collection resource；`fields` 是列，`actions` 是 block 级动作，`recordActions` 是行级动作 |
| 单条记录只读详情 | `details` | 必须绑定 collection resource；动作只能走 `recordActions` |
| 轻量条目浏览、移动端友好 | `list` | 以 item 展示字段与 item 级动作为主 |
| 卡片墙、宫格、缩略图浏览 | `gridCard` | `fields` 是卡片展示字段，`recordActions` 是单卡动作 |
| 筛选条件输入 | `filterForm` | 只负责筛选输入，不负责数据展示 |
| 静态说明、帮助文案 | `markdown` | 不要为简单文案启用 `jsBlock` |
| 嵌入网页 / HTML | `iframe` | 明确是嵌入内容时使用 |
| 趋势图 / 报表图 | `chart` | 主要配置走 `query / visual / events`；只有兼容或极端高级场景才回退 `configure` |
| 工具按钮区 | `actionPanel` | 不继承 collection block action 列表 |
| 明确要求运行时代码 | `jsBlock` | 创建后要读回确认相关 JS 配置已落盘 |

### 高频 block 提醒

- `table`：读回重点是 `actionsColumnUid`、字段 uid、关系字段 `clickToOpen/openView`。
- `details`：查看场景优先它，不要用 `editForm` 或 `form` 伪装详情页。
- `filterForm`：它是通用数据筛选输入区块，不是 chart 专属能力；多目标时优先使用 contract 明确暴露的 target 绑定字段，尤其是 `defaultTargetUid`。
- block / field / action 的公开属性如何内联进 `settings`，统一看 [settings.md](./settings.md)。

## Form 选型

- 默认优先 `createForm`、`editForm`；`form` 只作为兼容历史 `FormBlockModel` 的 fallback。
- 用户要“新建记录 / 录入页 / addNew popup”时，优先 `createForm`。
- 用户要“编辑弹窗 / 编辑页 / record action edit popup”时，优先 `editForm`。
- 表单类 block 的公开语义是 `fields` + `actions`，只承载 form actions，不承载 `recordActions`。
- 查看场景优先 `details`；只有现场已存在 `FormBlockModel` 或用户明确要求“通用表单”时，才考虑 `form`。

## Action scope

### Scope 速查

| scope | 典型容器 | 典型入口 | 什么时候用 |
| --- | --- | --- | --- |
| `block` | `table`、`list`、`gridCard` | `addAction` / `actions` | 对整块数据集生效 |
| `record` | `table`、`details`、`list`、`gridCard` | `addRecordAction` / `recordActions` | 对单条记录或单个 item 生效 |
| `form` | `form`、`createForm`、`editForm` | `addAction` / `actions` | 表单提交类动作 |
| `filterForm` | `filterForm` | `addAction` / `actions` | 筛选提交 / 重置 / 折叠 |
| `actionPanel` | `actionPanel` | `addAction` / `actions` | 工具面板动作 |

### 入口规则

- `addAction` / `actions` 只放非 `recordActions`；`addRecordAction` / `recordActions` 只放记录级动作。
- `details` 虽然是 block，但公开动作能力属于 `recordActions`。
- `table` 的记录级动作实际挂在 actions column 容器下，读回时留意 `actionsColumnUid`。

### 高频动作

- block actions：`filter`、`addNew`、`popup`、`refresh`、`expandCollapse`、`bulkDelete`、`bulkEdit`、`bulkUpdate`、`export`、`import`、`upload`、`triggerWorkflow`、`js`
- record actions：`view`、`edit`、`popup`、`delete`、`updateRecord`、`duplicate`、`addChild`、`triggerWorkflow`、`js`
- form actions：`submit`、`triggerWorkflow`、`js`
- filter-form actions：`submit`、`reset`、`collapse`、`js`
- action-panel actions：`js`、`triggerWorkflow`

### 关键约束

- `view/edit/popup` 如果会打开 popup，只创建 action 不算完成；后续 popup 内容统一看 [popup.md](./popup.md)。
- “查看当前记录 / 编辑当前记录 / 本条记录 / 这一行”优先按 record popup 处理。
- 是否允许只创建 `popup` shell，统一按 [normative-contract.md](./normative-contract.md) 的 `Popup Shell Fallback Contract` 判断；这里只记住：只创建 action 不算完成 popup 内容。
- `submit` 在普通 form 和 `filterForm` 是两个不同 scope 的公开能力；`collapse` 只属于 `filterForm`。
- 动作标题、tooltip、按钮类型这类公开属性的内联策略，统一看 [settings.md](./settings.md)。
- `triggerWorkflow` 在本 skill 中只负责把**已有 workflow 的 UI action 壳**挂到 surface；一旦需要创建 workflow、挑选 workflow key/id、改 trigger/node/execution path，立即转交 `nocobase-workflow-manage`。

## FilterForm 通用能力

- 一个 `filterForm` 可以服务多个数据区块；不要把它理解成 chart 特例。它可以服务于某些数据区块的筛选联动，最终以 live `catalog` 和 target contract 为准。
- 多目标场景下，绑定粒度优先按**字段级**理解；不要默认整块 `filterForm` 只绑定一个 block，也不要假设所有字段会自动继承同一个 target。
- 如果现场 contract 暴露 `defaultTargetUid`，优先在字段创建时显式填写，用它声明该字段的默认作用目标。
- collection schema 里“有这个字段”，不等于当前 `filterForm` 就一定能 `addField`；字段是否可加，以 live `catalog.fields` / 当前 target 的 field capability 为准。
- 写后接线确认看 [verification.md](./verification.md) 的 `Write Readback`；不要把写后断言混进 capability 选型规则。

示意片段：

```json
[
  {
    "fieldPath": "createdAt",
    "defaultTargetUid": "users-table-uid"
  },
  {
    "fieldPath": "status",
    "defaultTargetUid": "users-list-uid"
  }
]
```

上面表达的是：同一个 `filterForm` 里的不同字段，可以各自声明默认作用目标；精确 envelope 仍以 live tool schema（`addField` vs `addFields`）为准。

## Field 规则

### 容器心智

- `table/details/list/gridCard`：以 display 字段为主。
- `form/createForm/editForm`：以 editable 字段为主。
- `filterForm`：以 filter 字段为主，不是展示字段。

### 绑定字段与常见配置

- `compose(...).fields` 的最常见 shorthand 写法是字符串字段名，例如 `"nickname"`。
- 在 `addField/addFields`，或需要显式声明字段路径时，统一用 `{ "fieldPath": "nickname" }`。
- 绑定真实字段时，`fieldPath` 属于创建必需参数，不属于 `settings`；`jsColumn` / `jsItem` 这类 synthetic standalone field 则允许不传真实 `fieldPath`。
- 字段标签、必填、禁用等公开属性的内联策略，统一看 [settings.md](./settings.md)。
- 常见 wrapper 配置：`label`、`showLabel`、`tooltip`、`extra`、`width`。
- `fixed` 只在 table column / action column / `jsColumn` 这类列语义里常见；不要把它当成所有 field wrapper 的通用设置。
- 常见 field 配置：`titleField`、`clickToOpen`、`openView`、`allowClear`、`multiple`。

### 关系叶子字段

- 典型 `fieldPath`：`roles.title`、`department.name`。
- 用户说“显示部门名 / 角色标题”时，优先映射到关系叶子字段，而不是只放关联 id。
- to-many 关系叶子字段在 display 场景允许使用；常见下一步是 `clickToOpen = true` 和 `openView`。
- 在 `details/list/gridCard` 里，直接 to-many relation 字段（例如 `users.roles`）默认也按这套 display 语义处理：应归一到目标表 `titleField` 的文本展示，而不是默认子表格。`roles` 与 `roles.title` 这类输入，如果 live `catalog` 已收敛成同一条 display field，就按 display field 处理；只有用户明确要求子表格/关联明细区块时，才改走 block 级方案。

### `filterForm` 特殊点

- 多目标绑定与字段可加性规则看上一节 `FilterForm 通用能力`。
- 不支持 `renderer: "js"`、`jsColumn`、`jsItem`。
- 需要 JS 时，换 block 或动作设计，不要强行塞进 filter 字段。

### 读回定位

大多数精确改配都要区分 `wrapperUid`、`fieldUid`、`innerFieldUid`；关系字段加 popup/openView、或对字段做更细粒度配置时，通常需要其中一个具体 uid。
