# References

这里是 `nocobase-ui-builder` 的发布版运行时参考总索引。按“主链 -> 场景 -> 细分能力”的顺序读，不要一次性把所有叶子文档都当成主入口。

## 主链入口

- canonical runtime truth：
  - [runtime-truth/overview.md](./runtime-truth/overview.md)
  - [runtime-truth/tool-shapes.md](./runtime-truth/tool-shapes.md)
  - [runtime-truth/capability-matrix.md](./runtime-truth/capability-matrix.md)
  - [runtime-truth/transaction-semantics.md](./runtime-truth/transaction-semantics.md)
- 读回与验收：
  - [contracts/readback-checklist.md](./contracts/readback-checklist.md)

## 按职责选 tool

- [tools/README.md](./tools/README.md)

## 场景补充

- [advanced/README.md](./advanced/README.md)

## 能力选型

- [capabilities/blocks/README.md](./capabilities/blocks/README.md)
- [capabilities/actions/README.md](./capabilities/actions/README.md)
- [capabilities/fields/README.md](./capabilities/fields/README.md)
- [capabilities/js.md](./capabilities/js.md)
- [lexicon/aliases.md](./lexicon/aliases.md)

## 读取原则

- `overview.md` 是 lifecycle / locator / target role / 默认 playbook 的唯一 owner。
- `tool-shapes.md` 是 request shape 的唯一 owner。
- `capability-matrix.md` 是默认可创建 / 兼容使用 / 保守维护策略的唯一 owner。
- 其他文档只补充场景 delta、能力细节或验收方法，不再另起一套基础规则。
- 如果文档与现场 `get/catalog` 不一致，以现场读回为准。
