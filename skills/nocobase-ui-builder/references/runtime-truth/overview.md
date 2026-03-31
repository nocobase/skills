# Runtime Truth Overview

这套 skill 的运行时心智模型分四层：

1. 读取层
   - `GetFlowsurfaces_get`
   - `PostFlowsurfaces_catalog`
   - 作用：确认“现在有什么”和“这里允许做什么”。
2. 语义层
   - `createpage`、`compose`、`configure`、`addtab/updatetab/movetab/removetab`
   - 作用：优先用公开语义搭建页面，而不是先碰底层 path。
3. 精确层
   - `addblock/addfield/addaction/addrecordaction`
   - `addblocks/addfields/addactions/addrecordactions`
   - `updatesettings`、`seteventflows`、`setlayout`
   - 作用：补充语义层无法直接表达的精确追加或精确改配。
4. 编排层
   - `apply`
   - `mutate`
   - 作用：多步事务化操作、整段 subtree 替换、复杂修复。

## 默认选择顺序

- 新建完整页面：`createpage -> catalog -> compose -> configure -> get`
- 已有页面小改：`get -> catalog -> configure -> get`
- 已有页面精确追加：`get -> catalog -> add* -> configure -> get`
- 高风险复杂改造：`get -> catalog -> apply/mutate -> get`

## 为什么 `catalog` 是硬前置

`catalog` 是当前 target 的公开 contract 快照。它告诉你：

- 可创建的 block 列表
- 可创建的 field 列表
- 可创建的 action / recordAction 列表
- 当前节点可编辑的 domains
- `settingsSchema`
- `settingsContract`
- `eventCapabilities`
- `layoutCapabilities`

不先读 `catalog`，就容易犯这些错：

- 把 record action 写进 `addAction`
- 在不支持 `renderer: "js"` 的容器里加 JS 字段
- 给不支持 layout 的节点调用 `setLayout`
- 在不支持的 group/path 上调用 `updateSettings`

## 为什么 `get` 是硬前置

`get` 不是只看树，它还是修复和校验的基准：

- 找到真实 `uid`
- 找到 `wrapperUid/fieldUid/innerFieldUid`
- 找到 `actionsColumnUid`
- 找到 popup page/tab/grid uid
- 找到 route / pageRoute / tabRoute
- 获取 `nodeMap` 方便后续定位

## 语义化搭建的核心原则

- 先选对 block，再选 field/action，再补配置。
- 优先生成“可以直接工作”的页面，不生成临时过渡结构。
- 优先公开语义，不优先 raw path。
- 任何自然语言映射都必须回到当前 `catalog` 的能力矩阵上收敛。
