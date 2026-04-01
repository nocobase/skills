# Comments Block

`comments` 当前可读回、可看 contract，但不应作为默认创建能力。

## 用途

- 维护已有 comments surface
- 读取已有评论区块的配置
- 在现场 `catalog` 允许时做保守改配

## 高频关注点

- `pageSize`
- `dataScope`

## 关键约束

- 不要在 `compose` 或 `addBlock` 的默认方案里创建它。
- 如果用户明确要求新建评论区，先看现场 `catalog` 是否暴露创建能力，再决定是否继续。
