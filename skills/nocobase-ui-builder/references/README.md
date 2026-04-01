# References

这里是 `nocobase-ui-builder` 的运行时参考总索引。按“先主链、后细节”的顺序读，不要一次性把所有叶子文档都当成主入口。

## 主链入口

- canonical runtime truth：
  - [runtime-truth/overview.md](./runtime-truth/overview.md)
  - [runtime-truth/tool-shapes.md](./runtime-truth/tool-shapes.md)
- 按职责选 tool：
  - [tools/README.md](./tools/README.md)

## 何时继续往下读

- 需要能力矩阵、批量/事务语义：
  - [runtime-truth/capability-matrix.md](./runtime-truth/capability-matrix.md)
  - [runtime-truth/transaction-semantics.md](./runtime-truth/transaction-semantics.md)
- 需要复杂 popup、事件流、contract 决策：
  - [advanced/README.md](./advanced/README.md)
- 需要只读校验或写后验收：
  - [contracts/README.md](./contracts/README.md)
- 需要按 block/field/action 做细分选择：
  - [capabilities/blocks/README.md](./capabilities/blocks/README.md)
  - [capabilities/fields/README.md](./capabilities/fields/README.md)
  - [capabilities/actions/collection/README.md](./capabilities/actions/collection/README.md)
  - [capabilities/actions/record/README.md](./capabilities/actions/record/README.md)
  - [capabilities/actions/form/README.md](./capabilities/actions/form/README.md)
- 需要把自然语言收敛成 capability：
  - [lexicon/aliases.md](./lexicon/aliases.md)

## 读取原则

- `overview.md` 和 `tool-shapes.md` 是运行时主入口。
- 其他文档只补充场景规则、能力细节或校验方法，不再另起一套基础流程。
- 如果文档与现场 `get/catalog` 不一致，以现场读回为准。
