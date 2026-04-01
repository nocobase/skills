# Contract Playbook

最后一步默认做“按变更类型的必要读回”；只有涉及 page / tab / popup lifecycle、route 同步或 target 层级变化时，才升级为完整 `get` 校验。

## Playbook 1: 已有页面小改

1. `get`
2. `catalog`
3. `configure`
4. 必要读回

## Playbook 2: 精确追加一个字段或动作

1. `get`
2. `catalog`
3. `addField/addAction/addRecordAction`
4. 如需补配置，`configure`
5. 必要读回

## Playbook 3: 复杂 path 级配置

1. `get`
2. `catalog`
3. 查 `settingsContract`
4. `updateSettings`
5. 必要读回

## Playbook 4: popup 与 event flow

1. `get`
2. `catalog`
3. 先写 popup/openView 相关 settings
4. 再 `setEventFlows`
5. 必要读回

不要颠倒 3 和 4。

## Playbook 5: 布局替换

1. `get`
2. `catalog`
3. 收集 child uid
4. `setLayout`
5. 必要读回
