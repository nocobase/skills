# Inspect

本文档是 `inspect` 任务的主参考文档，只定义只读检查流程与断言；写后验证统一看 [readback.md](./readback.md)。live MCP tool schema 与现场 `desktop_routes_list_accessible/get/catalog` 优先于本文。

如果用户是在问“现在是什么结构 / 有哪些能力 / 卡在哪一步”，而不是让你写入，先看这里，不要跳去 `readback.md`。

## 核心规则

- `inspect` 只做只读检查，不调用任何写接口。
- 已初始化 surface 默认先 `get`；菜单标题发现链路默认先 `desktop_routes_list_accessible(tree=true)`。
- 只有在用户明确要求 capability / contract / 可创建能力，或仅靠 `get` 无法判断目标语义时，才继续 `catalog`。
- 菜单标题命中 0 个、多个，或命中的不是本 skill 支持的菜单类型时，停止猜测并说明。
- `inspect` 输出应聚焦“当前现场是什么、有哪些关键 uid / route / capability、哪里有阻塞”，不要混用写后验证里的“落盘/写入成功”等措辞。

## 最小读链

| 目标 family | 默认读取顺序 | 何时需要 `catalog` |
| --- | --- | --- |
| `menu-group` | `desktop_routes_list_accessible(tree=true)` | 不需要；除非现场显式把它暴露成可继续配置的 surface |
| `menu-item` | `desktop_routes_list_accessible(tree=true)`；必要时再用 `routeId/pageSchemaUid` 做 `get` | 只有用户要看页面内部 capability，且该菜单项已经初始化为 `flowPage` 时 |
| `page` / `outer-tab` / `route-content` | `get` | 需要看 capability / contract / configureOptions / settingsContract 时 |
| `popup-page` / `popup-tab` / `popup-content` | `get` | 需要看 popup 内可创建能力、`resourceBindings` 或 event/settings contract 时 |
| `node` | `get` | 需要精确判断容器公开能力或 path-level contract 时 |

## 只读断言

### 菜单

- 是否命中唯一菜单节点
- `routeId`、`type`、`parentMenuRouteId` 是否清晰
- `menu-item` 是否已初始化为可继续操作的 `flowPage`
- 如果用户问“这个页面在哪个菜单下/这个菜单下面有什么”，菜单树层级是否清晰

### 页面 / `outer-tab`

- `pageSchemaUid` / `tabSchemaUid` / `routeId` 是否可定位
- `outer-tab` 与 `popup-tab` 是否已区分清楚
- 页面、tab 的标题 / 图标 / documentTitle / 顺序等当前状态是否清晰
- 如果用户问能不能继续搭内容，是否已拿到对应 `gridUid`

### `route-content` / popup subtree / 普通节点

- `tree` / `nodeMap` 是否包含用户关心的 block / field / action
- popup subtree 是否已存在 `popupPageUid` / `popupTabUid` / `popupGridUid`
- record popup 场景下，如果用户关心“当前记录”，是否真的从 live `catalog.blocks[].resourceBindings` 看到了 `currentRecord`
- 如果用户关心后续改配能力，是否已确认 `configureOptions` / `settingsContract` / block/action/field catalog 能力

## 与其它文档的关系

- target family、locator 与写目标心智：看 [runtime-playbook.md](./runtime-playbook.md)
- request shape：看 [tool-shapes.md](./tool-shapes.md)
- popup / `currentRecord` / openView / event flow：看 [popup-and-event-flow.md](./popup-and-event-flow.md)
- 写后验证：看 [readback.md](./readback.md)
