---
title: Validation Cases
description: nocobase-ui-builder 的 validation 用例索引。
---

# Validation Cases

## 分层说明

- `core-pass`: 主干 block family 的回归入口，应尽量稳定跑通。
- `composite-pass`: 多区块/多层上下文协同，允许局部能力暴露缺口。
- `edge-detect`: 边界 case，目标是稳定定位 blocker，不是假装通过。

## 用例列表

| 用例 | 分层 | 预期结果 | 主责任 |
| --- | --- | --- | --- |
| [case1.md](case1.md) | `core-pass` | `pass` | `FilterForm + Table + Create/Edit` 主干 happy path |
| [case2.md](case2.md) | `core-pass` | `pass` | `Details + relation tables` |
| [case3.md](case3.md) | `composite-pass` | `partial` | 第一层 `view popup` + popup 内关系表 |
| [case4.md](case4.md) | `core-pass` | `pass` | 综合 CRUD 工作台与多区块协同 |
| [case5.md](case5.md) | `composite-pass` | `partial` | `record actions` 与审批日志链路 |
| [case6.md](case6.md) | `core-pass` | `pass` | 同页多个 popup action + 详情/关系表 |
| [case7.md](case7.md) | `edge-detect` | `partial` | 树表、自关联、`add-child` |
| [case8.md](case8.md) | `edge-detect` | `blocker-expected` | 多对多、through、中间表编辑 |
| [case9.md](case9.md) | `edge-detect` | `partial` | 显式 visible tabs |
| [case10.md](case10.md) | `edge-detect` | `blocker-expected` | 嵌套 popup、多层上下文传递 |

## 覆盖矩阵

- [coverage-matrix.md](coverage-matrix.md)

这些用例既用于验证 skill 的真实可用性，也可以反向作为 block / pattern 文档的证据来源。
