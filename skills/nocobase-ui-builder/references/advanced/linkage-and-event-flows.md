# Linkage Rules And Event Flows

## `linkageRules`

- 属于 `stepParams` 内的具体设置
- 常见出现在 action button settings、details settings 等 group 内
- 本质是联动规则配置

## `flowRegistry`

- 属于节点实例级事件流定义
- 通过 `seteventflows` 或 `updatesettings(flowRegistry)` 处理
- 必须符合当前节点的 `eventCapabilities` 和 `eventBindings`

## 不要混淆

- `linkageRules` 不是 `flowRegistry`
- `flowRegistry` 不是某个 settings group 的 patch
- 先有可绑定的 settings/step，后有能引用它们的 event flow

## 推荐顺序

1. `catalog`
2. 写 settings 或 `linkageRules`
3. `seteventflows`
4. `get`
