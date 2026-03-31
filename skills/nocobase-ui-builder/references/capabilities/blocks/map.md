# Map Block

`map` 当前可读回、可看 contract，但不应作为默认创建能力。

## 用途

- 维护已有 map surface
- 读取已有地图区块的配置
- 在现场 `catalog` 允许时做保守改配

## 高频关注点

- `mapField`
- `marker`
- `dataScope`
- `lineSort`
- `zoom`

## 关键约束

- 当前 `createSupported = false`。
- 不要在 `compose` 或 `addBlock` 的默认方案里创建它。
- 如果用户明确要求新建地图，应先说明当前 flowSurfaces 默认不支持创建。
