# `seteventflows`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_seteventflows`

## 用途

全量写入当前节点的实例级 `flowRegistry`。

## 前提

- 先 `catalog(target)` 看 `eventCapabilities`。
- 先确认相关 setting/step 仍然存在。

## 关键规则

- `flowRegistry` 是全量写入，不是局部 patch。
- `eventName`、`flowKey`、`stepKey` 必须和当前节点 contract 匹配。
- 如果先清空了对应的 popup/resource/step 配置，再绑定引用该 step 的 flow，会失败。
