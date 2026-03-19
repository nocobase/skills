# Coverage Matrix

validation case 不再只按业务页面浏览，而是按公开 block family 和复杂 pattern 做覆盖。

## Block Coverage

| Block / Family | Primary | Secondary |
| --- | --- | --- |
| `FilterFormBlockModel` | `case1` | `case4` `case5` |
| `TableBlockModel` | `case4` | `case1` `case3` `case6` `case7` `case8` `case10` |
| `DetailsBlockModel` | `case2` | `case3` `case5` `case10` |
| `CreateFormModel` | `case1` | `case4` `case6` `case8` |
| `EditFormModel` | `case6` | `case1` `case4` `case8` `case10` |
| `RootPageTabModel` / visible tabs | `case9` | `case10` |

## Pattern Coverage

| Pattern | Primary | Secondary |
| --- | --- | --- |
| `table-column-rendering` | `case1` | `case10` |
| `popup-openview` | `case3` | `case4` `case6` `case10` |
| `relation-context` | `case2` | `case3` `case5` `case6` `case8` `case10` |
| `record-actions` | `case5` | `case7` `case8` `case10` |
| `tree-table` | `case7` | 无 |
| `many-to-many-and-through` | `case8` | 无 |

## 使用方式

- 日常回归优先跑 `core-pass`。
- 需要验证多区块协同时，加跑 `composite-pass`。
- 要确认边界能力是否回归或 blocker 是否被修复，再跑 `edge-detect`。
- 报告里应把声明的 coverage 与实际结果并排展示，至少标成 `proven`、`partial`、`blocked` 或 `unverified`。
