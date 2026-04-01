# Boundaries

当现场信息不足、用户表述高歧义、或能力未公开暴露时，优先停止猜测，而不是继续“补完”写入。popup / openView / event flow 的顺序看 [popup-and-event-flow.md](./popup-and-event-flow.md)。

## 通用停止条件

遇到以下任一情况，应先收敛或说明边界：

- `catalog` 没有明确暴露目标 block / field / action 能力
- `configureOptions` 与 `settingsContract` 都没有明确暴露目标配置域
- 在读回 `tree.use` 之后，仍无法判断目标是 outer tab 还是 popup child tab
- target 只能靠同一 `parent/subKey` 下多个相同 `use/type` sibling 的相对位置来猜
- 用户只说“新增/列表/弹窗/页面头”这类高歧义词，却没给对象与动作

## block 选型边界

- block 选型不确定时，先收敛到用户的展示/交互目标，再用 `catalog.blocks` 验证
- “列表”默认不是直接映射 `list`；需先判断用户要的是 `table`、`list` 还是 `gridCard`
- 用户只要静态说明时，优先 `markdown`；只有明确要求运行时代码时才优先 `jsBlock`

## 高级配置边界

- 先看 `configureOptions`；只有公开配置不够时，才查 `settingsContract` 再决定是否用 `updateSettings`
- 事件流不确定时，先确认相关 step 是否还存在
- JS 字段或动作能力冲突时，先看现场 `catalog.fields/actions` 和实际可写 contract

## 多目标筛选边界

- `filterForm` 同页如果有多个目标，字段必须显式绑定当前 contract 暴露的 target 绑定字段，优先 `defaultTargetUid`
- `chart` 不是默认 filter target；只有现场读回确认它带可解析 target resource 时，才把它算进候选集合
- 删除、移动或替换目标 block 后，要重新 `get/catalog`，不要假设旧的 filter target 仍然有效

## `apply` / `mutate` 边界

- `apply` 只接受 `catalog` 或主链文档已公开、且有稳定 contract 的 `type/use`
- `apply` 如果目标选择仍依赖 sibling 顺序猜测，必须先收敛唯一 target，再继续
- `mutate` 只在确实需要跨多步原子化编排时使用

## 非默认创建能力边界

- `map/comments` 默认不创建；只有用户明确要求且现场 `catalog` 暴露创建能力时才继续
- `form` 只是兼容能力，不是默认新增表单路径
- 如果现场没有明确暴露目标能力、target 绑定字段或 settings contract，应停止猜测并向用户说明
