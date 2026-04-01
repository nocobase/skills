# Contracts

这里放“怎么验”的规范。它既用于写后读回，也用于用户只要求 review / audit / 校验时的只读检查。

## 主入口

- 读回与验收清单：
  - [readback-checklist.md](./readback-checklist.md)

## 使用原则

- 只读校验请求默认 `get`，必要时再 `catalog`，然后按清单断言。
- 写入请求完成后，不是机械地每次做全量检查，而是按变更类型选择最小必要读回。
- 只有 page / tab / popup target 层级变化、route 同步或生命周期变更时，才升级为完整 route/tree 校验。
