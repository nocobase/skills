# Validation 总览

`nocobase-ui-builder` 的 validation 文档在这里统一收口。先读本页，再按需要进入具体 case。

## 目标

validation 关注的是“页面和交互是否真实可用”，不是只看页面壳是否创建成功，也不是把所有开发态提示都机械地计入失败。

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
2. 再读取 write-after-read / live tree，确认当前 flow model 真实结构
3. 再去源码确认对应 runtime model 的渲染契约：
   - 读哪个 `subModels` slot
   - 读哪些 `stepParams`
   - 允许哪些 child model/use
4. 用源码契约反查当前 readback 是否结构错误
5. 只有当 readback 已满足源码契约时，才继续怀疑 case 数据或平台 runtime

强制规则：

1. 浏览器 smoke 只负责确认现象，不负责给出根修复方案。
2. 对结构型渲染问题，不要先补“多跑一次 smoke”或“多开一次浏览器”当改进建议。
3. 如果源码已经证明当前 payload 违反固定结构契约，优先把改进落在 skill guard / recipe / prompt，而不是继续把问题描述成“运行时偶现”。

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

## 用例目录

| 用例 | 主题 |
| --- | --- |
| [validation-cases/case1.md](validation-cases/case1.md) | 订单中心主页面 |
| [validation-cases/case2.md](validation-cases/case2.md) | 客户 360 工作台 |
| [validation-cases/case3.md](validation-cases/case3.md) | 采购单与明细抽屉 |
| [validation-cases/case4.md](validation-cases/case4.md) | 项目协同工作台 |
| [validation-cases/case5.md](validation-cases/case5.md) | 审批详情与日志 |
| [validation-cases/case6.md](validation-cases/case6.md) | 发票与回款 |
| [validation-cases/case7.md](validation-cases/case7.md) | 组织树与下级部门 |
| [validation-cases/case8.md](validation-cases/case8.md) | 项目成员与中间表 |
| [validation-cases/case9.md](validation-cases/case9.md) | 多标签页 |
| [validation-cases/case10.md](validation-cases/case10.md) | 嵌套弹窗链路 |

这些用例既用于验证 skill 的真实可用性，也可以反向作为 block / pattern 文档的证据来源。
