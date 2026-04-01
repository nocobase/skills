# Linkage Rules And Event Flows

## `linkageRules`

- 属于 `stepParams` 内的具体设置
- 常见出现在 action button settings、details settings 等 group 内
- 本质是联动规则配置

## `flowRegistry`

- 统一视为节点实例级事件流配置域
- 默认标准入口是 `setEventFlows`
- 只有当前节点的公开 contract 明确暴露同域配置时，才按 contract 使用 `updateSettings`
- 必须符合当前节点的 `eventCapabilities` 和 `eventBindings`

## 不要混淆

- `linkageRules` 不是 `flowRegistry`
- `flowRegistry` 不是可以脱离 contract 猜 path 的普通 settings group patch
- 先有可绑定的 settings/step，后有能引用它们的 event flow

## 推荐顺序

1. `get`
2. `catalog`
3. 写 settings 或 `linkageRules`
4. `setEventFlows`
5. 按变更做必要读回
