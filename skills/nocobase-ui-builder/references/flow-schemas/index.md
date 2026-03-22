---
title: Flow Schema Snapshot 索引
description: 当前实例的 flowModels:schemas 本地 snapshot。优先按 use 打开单个 JSON，减少 PostFlowmodels_schemas 请求。
---

# Flow Schema Snapshot 索引

这份目录保存的是当前实例的 `flowModels:schemas` 本地 snapshot，供 `nocobase-ui-builder` 优先查阅。

文件结构：

- [manifest.json](manifest.json)
- `by-use/<UseName>.json`

说明：

- `by-use/*.json` 保留完整 schema 文档，但为了控制仓库体积，采用 minified JSON 形态保存
- 日常查阅时依赖文件名和 `manifest.json.filesByUse` 精确定位，不要把整个目录展开阅读

当前 snapshot 要点：

- 来源：`flowModels:schemas`
- 形态：按 `use` 拆分的完整 JSON 文档
- 作用：减少 `PostFlowmodels_schemas` 请求；让 agent 能直接按文件定位具体 flow model schema

## 推荐用法

1. 先打开 [manifest.json](manifest.json)，查看 `meta.uses` 和 `filesByUse`
2. 定位目标 `use`
3. 只打开对应的 `by-use/<UseName>.json`
4. 只有本地缺少目标 `use`、或本地 schema 与当前实例明显冲突时，才回退到 `PostFlowmodels_schemas` / `GetFlowmodels_schema`

## 强规则

- 不要一次性展开整个 `by-use/` 目录或多个大 JSON 文件
- 默认一次只读取当前任务相关的 1 到 2 个 `use`
- `PostFlowmodels_schemabundle` 仍用于运行时 root block 发现；本地 snapshot 主要替代 `flowModels:schemas` 的常规查阅
- 这份 snapshot 是“当前快照”，不是任意实例的实时真相

## 常见入口 use

- `PageModel`
- `RootPageModel`
- `RootPageTabModel`
- `PageTabModel`
- `BlockGridModel`
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
