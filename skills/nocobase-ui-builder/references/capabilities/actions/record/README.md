# Record Actions

record action 作用于单条记录或单个 item。

## 高频 action

- `view`
- `edit`
- `popup`
- `delete`
- `updateRecord`
- `duplicate`
- `addChild`
- `composeEmail`
- `templatePrint`
- `triggerWorkflow`
- `js`

## 作用速查

| action | 作用 |
| --- | --- |
| `view` | 查看单条记录 |
| `edit` | 编辑单条记录 |
| `popup` | 打开自定义 popup |
| `delete` | 删除当前记录 |
| `updateRecord` | 就地更新当前记录字段 |
| `duplicate` | 复制当前记录 |
| `addChild` | 新增子级记录 |
| `composeEmail` | 针对当前记录发邮件 |
| `templatePrint` | 打印当前记录 |
| `triggerWorkflow` | 针对当前记录触发工作流 |
| `js` | 自定义记录动作 |

## 容器分布

- table
- details
- list
- gridCard

其中：

- `duplicate`、`addChild` 主要是 table 行级动作
- `composeEmail` 当前主要在 table/details 更常见

## 关键规则

- 通过 `addRecordAction` 或 `recordActions` 创建。
- 不要塞进 `addAction`。
- table 的 record action 实际会挂在 actions column 容器下，读回时留意 `parentUid` 和 `actionsColumnUid`。
