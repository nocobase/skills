# Normative Contract

本页是 `nocobase-ui-builder` 的**唯一规范真相**。涉及 `catalog`、popup shell fallback、schema drift / recovery 的规则，只在这里定义一次；其它文档只引用，不再重复定义。

## 1. Precedence

规则优先级统一如下：

1. live MCP schema / 现场 `get` / `catalog` / `context` / `readback`
2. 本页 `Normative Contract`
3. topic references（`popup` / `settings` / `verification` / `runtime-playbook` 等）
4. 示例 payload / 经验性说明

如果低优先级文档与高优先级现场事实冲突，以高优先级为准。

## 2. Catalog Contract

### 默认原则

- `catalog` **不是全局必读**。
- 已有 surface 默认先 `get`；只有命中特定 contract 时，才追加 `catalog`。
- 生命周期 API、固定 payload shape、以及不依赖 live capability 的简单写入，不要因为习惯而机械补一次 `catalog`。

### 何时必须读 `catalog`

出现以下任一情况时，必须先读 `catalog(target)`：

- 需要判断当前 target 是否真的支持创建某类 block / field / action
- 需要依赖 live `configureOptions` / `settingsContract`
- 需要判定 popup 内 `resourceBindings`，例如是否暴露 `currentRecord`
- 需要为 JS / chart / relation popup / filterForm multi-target 等场景收敛 live capability
- 仅靠 `get` 无法确定容器公开能力、配置入口或语义 guard

### 何时可以跳过 `catalog`

以下情况通常可以不读 `catalog`：

- 纯 `inspect`，且 `get` / 菜单树已经足够回答用户问题
- `createMenu` / `updateMenu` / `createPage` / `moveTab` / `removeTab` 这类 lifecycle API，且 payload 不依赖 live capability
- 已明确 target、且本次只是执行固定形状的小型 lifecycle 变更

### 输出与措辞要求

- 不要把“没读 `catalog`”说成“能力已确认”。
- 如果因为没有读 `catalog` 而只能确认结构，结果表述必须停留在结构层，不要提升为语义确认。

## 3. Popup Shell Fallback Contract

### 术语

- `shell-only popup`：只创建 opener / popup subtree，本次**不**补 `details`、`editForm`、`submit` 等内容。
- `completed popup`：本次既创建 opener，也完成用户所要求的 popup 内容语义。

### 允许条件

只有在用户意图明确是“先建入口 / 按钮 / 壳子 / popup shell”，而**不是**要求完成内容时，才允许 `shell-only popup`。

典型允许表达：

- “先加一个弹窗按钮”
- “先把 popup 入口建出来”
- “先只做壳子，内容后面再配”

### 禁止条件

以下情况**禁止**退化成 `shell-only popup`：

- 用户要求“查看当前记录 / 编辑当前记录 / 本条记录 / 这一行”
- 用户明确要求 `details`、`editForm`、`submit`、record popup 内容
- 场景语义已经是“完成一个可用 popup”，只是 live guard / binding 不满足

遇到这些场景时，要么完成用户要求的 popup 内容，要么停止并报告 guard / capability gap；不要静默降级成空壳。

### 输出与验收要求

- `shell-only popup` 只能表述为“已创建入口 / popup shell”，不能表述为“popup 已完成”。
- `shell-only popup` 的成功等级最多是 `structural-confirmed`，不是 `semantic-confirmed`。

## 4. Schema Drift / Recovery Contract

### 触发信号

以下情况按 schema drift / recovery 处理：

- MCP 不可达或未认证
- 关键 tool 缺失
- schema 未刷新
- live capability / contract / guard 与本地文档不一致
- 服务端 validation error 暗示当前 payload shape 与现场 schema 漂移

### 统一处理

- 遇到上述信号时，停止猜测写入。
- 当前 skill **不定义**抽象 `refresh -> retry` 自动链路。
- 当前 skill **不允许** agent 在没有标准化工具的前提下，自行执行所谓 schema refresh。

### 当前允许的恢复动作

只能给出以下恢复建议：

- 刷新当前 MCP 连接
- 重新认证当前 NocoBase MCP
- 走 `nocobase-mcp-setup`

用户完成外部恢复后，再从读链重新开始（通常从 `get`，必要时再补 `catalog`）。

### 明确禁止

- 不要在文档里继续写 `refresh/get/catalog/context -> 重算 payload -> 重试`
- 不要把“抽象 refresh”描述成当前 agent 已有的可执行能力
