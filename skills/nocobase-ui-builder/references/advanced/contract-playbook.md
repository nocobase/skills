# Contract Playbook

## Playbook 1: 已有页面小改

1. `get`
2. `catalog`
3. `configure`
4. `get`

## Playbook 2: 精确追加一个字段或动作

1. `get`
2. `catalog`
3. `addfield/addaction/addrecordaction`
4. 如需补配置，`configure`
5. `get`

## Playbook 3: 复杂 path 级配置

1. `get`
2. `catalog`
3. 查 `settingsContract`
4. `updatesettings`
5. `get`

## Playbook 4: popup 与 event flow

1. `get`
2. `catalog`
3. 先写 popup/openView 相关 settings
4. 再 `seteventflows`
5. `get`

不要颠倒 3 和 4。

## Playbook 5: 布局替换

1. `get`
2. `catalog`
3. 收集 child uid
4. `setlayout`
5. `get`
