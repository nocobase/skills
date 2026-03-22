---
title: Flow Schema Graph 索引
description: 当前实例的 flowModels:schemas graph/ref 参考。先定 use，再读 model、slot catalog 和必要 artifact。
---

# Flow Schema Graph 索引

这份目录保存的是当前实例 `flowModels:schemas` 的 graph/ref 版本，不再把整棵递归 schema 直接内嵌到单个文件里。

文件结构：

- [manifest.json](manifest.json)
- `models/<UseName>.json`
- `catalogs/<OwnerUse>.<slot>.json`
- `artifacts/json-schema/<UseName>.<hash>.json`
- `artifacts/minimal-example/<UseName>.<hash>.json`
- `artifacts/skeleton/<UseName>.<hash>.json`
- `artifacts/examples/<UseName>.<hash>.json`

当前 snapshot 要点：

- 来源：`flowModels:schemas`
- 形态：`model + slot catalog + artifact`
- 作用：减少 `PostFlowmodels_schemas` 请求，并让 agent 能按需沿 ref 查具体模型，而不是一次性吃下整棵递归树

## 推荐用法

1. 先打开 [manifest.json](manifest.json)，确认目标 `use`
2. 读取 `models/<UseName>.json`
3. 如果要看某个 `subModels.<slot>` 能接什么，再打开 `catalogs/<OwnerUse>.<slot>.json`
4. 只有在确实要看具体 JSON Schema 或 skeleton 细节时，再按 `artifactRef` 继续读对应 artifact
5. 如果要沿某条路径继续下钻，优先用 `scripts/flow_schema_graph.mjs hydrate-branch`

## 强规则

- 不要一次性展开整个 `artifacts/json-schema/` 或多个大 artifact
- 默认一轮只读取当前任务相关的 1 到 2 个 model 文件，以及必要的 1 到 2 个 catalog / artifact
- `PostFlowmodels_schemabundle` 仍用于运行时 root block 发现；本地 graph 主要替代 `flowModels:schemas` 的常规查阅
- `materialize-use` / `hydrate-branch` 输出的是 graph 拼装视图，不要求字节级等同旧版 raw snapshot

## 常见入口 use

- `BlockGridModel`
- `PageModel`
- `RootPageModel`
- `RootPageTabModel`
- `PageTabModel`
- `FilterFormBlockModel`
- `TableBlockModel`
- `DetailsBlockModel`
- `CreateFormModel`
- `EditFormModel`
- `ActionModel`
- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSItemModel`
- `JSActionModel`

其余完整清单以 [manifest.json](manifest.json) 为准。
