# Validation 总览

`nocobase-ui-builder` 的 validation 关注“页面和交互是否真实可用”，不是只看页面壳是否创建成功。

默认入口统一走动态场景规划，先识别业务领域，再决定页面原型和区块组合。详细规则见 [validation-scenarios.md](validation-scenarios.md)。

## 目标

- 同一个 validation 请求不再总是复用同一套固定区块模板
- 不同业务默认生成不同页面结构，而不是把所有页面都压成“筛选 + 表格 + 弹窗”
- 把 tabs、详情联动、关系表、record actions、树形结构和源码公开区块纳入主路径

## 动态规划规则

validation 默认按下面链路生成：

1. 业务语义识别：
   - 订单履约
   - 客户增长
   - 项目交付
   - 审批运营
   - 组织运营
2. 页面原型选择：
   - 主表工作台
   - 360 详情工作台
   - 多标签业务工作台
   - 审批处理台
   - 树形运维页面
3. 区块组合：
   - 主干 block 由 `Filter / Table / Details / Form / popup / record actions` 组成
   - 扩展 block 优先从运行实例的 flow schema manifest 中选（实例感知）
     - 通过 `PostFlowmodels_schemabundle`（`uses=['BlockGridModel']`）的候选清单得到“实例真实可用的 root blocks”
     - 再用 `PostFlowmodels_schemas`（`uses=<root blocks>`）拉回动态 hints（contextRequirements 等）辅助语义匹配
   - 只有当无法探测实例清单、且显式配置 `NOCOBASE_SOURCE_ROOT` 时，才回退到源码 inventory 的 `publicTreeRoots`
4. 结果落库：
   - `compileArtifact.json` 会记录 `scenarioId / selectedUses / generatedCoverage / instanceInventory / sourceInventory`

## 判定规则

### 基本原则

1. 页面壳创建成功不等于 validation 通过，还要验证在真实业务数据下是否可读、可筛选、可进入详情、可触发关系区块与弹窗动作。
2. 最终结论应优先基于真实故障信号，而不是开发态噪声。
3. 如果页面能稳定完成目标交互，就不要因为无关噪声把结果降级成失败或 warning。

### 控制台噪声规则

validation 阶段不要把浏览器控制台里的 React warning 当成失败信号。这里的 React warning 包括 React / React DOM 开发态输出的 `Warning:` 类消息，即使它是通过 `console.error` 打出来，也仍然按噪声处理。

强制规则：

1. 仅凭 React warning 不能把页面判为失败，也不能记成 `warning` 结果。
2. 仅凭 React warning 不能阻断 validation，也不能覆盖“页面实际可用”的结论。
3. 如果同一步里既出现 React warning，又出现真实运行时错误，忽略前者，只记录后者。
4. 如果页面唯一异常就是 React warning，最终结论应按“通过或无异常”处理，而不是“部分通过”或“warning”。

### 真正计入 validation 的故障信号

以下情况应继续按真实失败或风险处理：

- 运行时异常
- 未处理 Promise rejection
- error boundary
- 网络失败
- 白屏或区块空白
- 页面长时间停在骨架屏 / 首屏 skeleton 不消失
- 关键动作不可用
- 数据链路不通
- 因 payload、schema、上下文或数据问题导致的页面行为错误

### 渲染问题判定顺序

对下列渲染异常，validation 不应停在“页面看起来不对”这一层：

- 列有壳但值为空
- 字段有壳但不可编辑
- 动作按钮显示了，但位置明显不对
- drawer / dialog / details / table 只有结构壳，没有真实字段或数据

处理顺序固定为：

1. 先记录浏览器症状，确认是 `pre-open` 还是 `post-open`
   - fresh page 首开为空白或卡骨架屏时，优先记为 `pre-open`
2. 再读取 write-after-read / live tree，确认当前 flow model 真实结构
3. 如果刚执行过 `createV2`，先补一次 route-ready 校验：
   - page route 是否已进入 accessible route tree
   - hidden tab route 是否已出现在 page children 中
   - 没有这层证据时，不要把问题直接归到 payload
4. 再去源码确认对应 runtime model 的渲染契约：
   - 读哪个 `subModels` slot
   - 读哪些 `stepParams`
   - 允许哪些 child model/use
   - popup/openView 的 `pageModelClass` 是否与 `subModels.page.use` 一致
5. 用源码契约反查当前 readback 是否结构错误
6. 只有当 readback 已满足源码契约时，才继续怀疑 case 数据或平台 runtime

特别注意两类已被源码证实的高频结构错误：

1. `CollectionBlockModel` 派生区块缺少 `stepParams.resourceSettings.init.dataSourceKey / collectionName`
   - 典型症状：页面或区块卡骨架屏、Map/List/GridCard 一打开就空白
   - 已知至少影响：`MapBlockModel`、`ListBlockModel`、`GridCardBlockModel`、`CommentsBlockModel`
2. `FormItemModel` / `DetailsItemModel` 直接把具体字段模型落到 `subModels.field.use`
   - 源码期望入口其实是 `use=FieldModel`，再用 `stepParams.fieldBinding.use` 指向 `InputFieldModel` / `DisplayTextFieldModel` 等目标模型
   - 典型症状：`resolveUse circular reference`、字段子树行为不稳定

强制规则：

1. 浏览器 smoke 只负责确认现象，不负责给出根修复方案。
2. 对结构型渲染问题，不要先补“多跑一次 smoke”或“多开一次浏览器”当改进建议。
3. 如果源码已经证明当前 payload 违反固定结构契约，优先把改进落在 skill guard / recipe / prompt，而不是继续把问题描述成“运行时偶现”。
4. 对动作区渲染问题，优先检查 slot 级 `allowedUses` 是否匹配；`DetailsBlockModel.actions`、`TableActionsColumnModel.actions`、`FilterFormBlockModel.actions`、`TableBlockModel.actions` 都不能把泛型 `ActionModel` 当成“结构正确”。
5. 如果问题发生在 fresh page 首开，且尚未完成 route-ready 校验，优先把结论落在 skill 的 page-ready gate，而不是直接修改平台源码。
6. browser smoke 不得在点击合法 action 后立即发送 `Escape` 或通用“关闭弹窗”动作，否则会把刚打开的 drawer/dialog 当成噪声误关，导致 validation 结论失真。

## 数据前置与造数

validation 不应该只验证“页面壳有没有搭起来”，还必须验证页面在存在真实业务数据时是否可读、可筛选、可进入详情、可触发关系区块与弹窗动作。

### 执行顺序

1. 先创建或校验前置数据模型，包括字段和关系。
2. 再准备前置模拟数据。
3. 用查询或列表接口校验主表和关系表都已有数据，再开始 UI 搭建。
4. 完成 UI 后，至少基于一组已插入的数据验证列表、筛选、详情或关系区块不是空壳。

### 造数策略

- validation 的重点是页面在真实业务数据下是否可用，所以造数本身应被视为标准步骤，而不是附属动作。
- 如果当前场景和 NocoBase 系统里已有的 local-based 示例接近，可以复用其业务对象设计、字段命名或样本风格，但不要把造数写成依赖 local-based 才能进行。
- 造数可以通过当前可用的系统能力完成，但不能被静默跳过。
- 不论使用哪条路径，最终都要在结果里输出一份简短的数据摘要，包括每张主表的记录数和关键关系覆盖情况。

### 最低造数标准

- 每个主表至少准备 3 到 6 条记录，避免列表和筛选只有单条样本。
- 每个关系表至少准备 6 到 10 条记录，且要分布到不止一个父记录上。
- 至少覆盖 2 到 4 种常见状态、枚举值或业务阶段，便于验证筛选与标签渲染。
- 至少准备 1 个“富样本”主记录，使其拥有多条关联数据，便于验证详情页、关系区块或嵌套弹窗。
- 至少准备 1 个可精确命中的唯一标识，如订单号、发票号、采购单号，便于验证搜索与筛选。

### 输出要求

- 最终说明里必须单独交代“数据准备”结果，而不只是页面搭建结果。
- 如果 UI 已创建但没有完成造数或造数校验，这次 validation 应视为未完整完成。
- 如果因为系统能力、权限限制或当前实现缺口导致未能造数，必须明确指出具体阻塞点。

## 动态场景目录

| 业务领域 | 常见页面原型 | 常见区块差异 |
| --- | --- | --- |
| 订单履约 | 主表工作台 / 多标签工作台 | 筛选、主表、详情联动、经营分析、地图视图 |
| 客户增长 | 360 工作台 / 多标签工作台 | 客户详情、联系人/商机/跟进、评论流、引用区块 |
| 项目交付 | 多标签工作台 / 主表工作台 | 项目总览、任务/迭代/风险、评论流、指标卡 |
| 审批运营 | 审批处理台 / 360 工作台 | 待处理主表、审批日志、record actions、快捷处理 |
| 组织运营 | 树形运维页面 | tree table、新增下级、组织说明、地图或运维面板 |
