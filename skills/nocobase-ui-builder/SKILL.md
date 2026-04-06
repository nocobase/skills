---
name: nocobase-ui-builder
description: 当用户要检查、创建、修改、重排或删除 NocoBase Modern page (v2) 的菜单、页面、页签、弹窗、布局，以及其中的 block / field / action 配置时使用；不处理 ACL、数据建模、workflow 编排、浏览器复现、页面报错复盘或非 Modern page 导航。
---

# Start Here

- 跨专题规范真相：先看 [normative-contract.md](./references/normative-contract.md)。
- 默认执行入口：先看 [execution-checklist.md](./references/execution-checklist.md)。
- 本文件只保留触发边界、跨专题硬规则、术语与 reference map。
- live MCP schema，以及现场 `get` / `catalog` / `context` / `readback`，始终优先于本地文档。

## Operating Model

- `agents/openai.yaml` 只负责 skill 唤起与最小护栏，不重复维护详细规则。
- `SKILL.md` 维护触发边界、scope、跨专题硬规则与 reference map。
- [normative-contract.md](./references/normative-contract.md) 维护 `catalog`、popup shell fallback、schema drift / recovery 的唯一规范真相。
- [execution-checklist.md](./references/execution-checklist.md) 是默认执行入口，负责快速执行链，不再回跳本文件。
- 各 `references/*.md` 维护各自专题 contract；若与概览描述粒度不同，以专题 reference 和 live MCP schema 为准。

## Scope & Handoff

- 只处理与 Modern page (v2) 直接相关的 `group / flowPage / page / tab / popup / content` surface，以及内容区里的 block / field / action / layout / configuration。
- 不处理非 Modern page 的 desktop routes、工作台其它导航结构、浏览器 validation case 复现、页面报错复盘，以及 workflow / ACL / 数据建模细节。
- 显式转交：
  - ACL / 路由权限 / 角色权限 → `nocobase-acl-manage`
  - collection / association / field schema authoring → `nocobase-data-modeling`
  - 消费现有 schema 做 UI resource binding → 保留在本 skill
  - workflow create / update / revision / execution path → `nocobase-workflow-manage`

## Key Terms

- `target family`：当前目标属于哪类 surface；统一用 `menu-group`、`menu-item`、`page`、`outer-tab`、`route-content`、`popup-page`、`popup-tab`、`popup-content`、`node`。
- `pre-init ids`：`createMenu(type="item")` 返回、但尚未完成 `createPage(menuRouteId=...)` 初始化的 page / tab / route 相关 id；它们还不是 page/tab lifecycle 的 write-ready target。
- `已初始化页面`：已经执行过 `createPage(menuRouteId=...)`，可以继续使用 page/tab lifecycle API 的页面。
- `readback`：写入后的最小必要读回，用来确认结构、路由、popup subtree 或配置是否真的落盘。

## Cross-cutting Guardrails

1. `inspect` 默认只读；只有用户明确要求创建、修改、重排、删除或修复时才进入写流程。
2. UI structure mutation 只走 `flow_surfaces_*`；允许的发现 / 读取入口只有 `flow_surfaces_get`、`flow_surfaces_catalog`、`flow_surfaces_context`、`desktop_routes_list_accessible(tree=true)`；不要用 `resource_*`、`collections_*`、`workflows_*`、`flow_nodes_*`、`roles_*` 或底层 route 记录写入替代 UI mutation。
3. 写入前 MCP 必须可达且已认证；MCP 不可用、未认证、schema 未刷新，或现场缺少关键 tool / capability / guard 时，停止猜测写入；恢复动作统一看 [normative-contract.md](./references/normative-contract.md) 的 `Schema Drift / Recovery Contract`。
4. `desktop_routes_list_accessible(tree=true)` 只代表**当前角色可见菜单树**，不是系统全量菜单真相；“没看到”不能直接推断为“系统不存在”。
5. 定位不唯一不猜；菜单标题只接受唯一命中的 `group`；如果 target 只能靠 sibling 相对位置推断，就先收敛唯一 target；`createMenu(type="item")` 之后必须先 `createPage(menuRouteId=...)`，其返回前的 `pre-init ids` 不是 page/tab lifecycle 的 write-ready target。
6. 已有 target 的写入默认走 `get -> [按 normative contract 决定是否追加 catalog] -> write -> readback`；只有刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`。
7. 批量写任一子项失败就停，并分别报告成功项与失败项；不自动 rollback，也不继续执行依赖“全部成功”的后续写入。服务端 contract / validation error 若指向 drift / capability gap，按 [normative-contract.md](./references/normative-contract.md) 收口，不定义抽象 refresh retry。
8. 任何 JS 写入都必须先通过本地 validator gate；若 validator 不可运行、Node 版本不满足、结果不可判定，统一停止，不允许跳过 validator 直接调用 MCP。

## Reference Map

- [normative-contract.md](./references/normative-contract.md)：`catalog`、popup shell fallback、schema drift / recovery 的唯一规范真相。
- [execution-checklist.md](./references/execution-checklist.md)：默认执行入口；覆盖 preflight、intent、read/write path、risk gate、topic gate 与 stop/handoff。
- [verification.md](./references/verification.md)：`inspect`、写后 `readback`、batch / high-impact / destructive 的验收标准。
- [runtime-playbook.md](./references/runtime-playbook.md)：`target family`、locator、`pre-init ids`、write target 与 lifecycle 心智。
- [capabilities.md](./references/capabilities.md)：block / form / action / field 选型，以及 display vs association field 的默认设计。
- [settings.md](./references/settings.md)：`add* + settings`、`configure`、`updateSettings` 的唯一选择规则。
- [tool-shapes.md](./references/tool-shapes.md)：flow surfaces 请求 envelope、canonical payload，以及高风险 API 的请求形状。
- [popup.md](./references/popup.md)：`currentRecord`、association popup、`associatedRecords`、`openView` 与 popup opener 规则。
- [chart.md](./references/chart.md)：chart 专题总入口与分流说明。
- [chart-core.md](./references/chart-core.md)：chart 运行期搭建、重配、context 收敛与 readback 主链路。
- [chart-validation.md](./references/chart-validation.md)：chart contract、负例与回归矩阵。
- [js.md](./references/js.md)：RunJS validator gate、model mapping、上下文语义与代码风格。
- [runjs-runtime.md](./references/runjs-runtime.md)：RunJS CLI 入口、cwd 假设、runtime 内开发命令与 `--skill-mode` 约束。
- [aliases.md](./references/aliases.md)：高歧义自然语言表达如何先收敛到对象语义或能力。
