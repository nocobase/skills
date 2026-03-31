# Create Form Block

`createForm` 用于新增记录，是默认新增表单 block。

## 适用场景

- 新建记录
- table/list/gridCard 的 `addNew` popup
- 独立录入页

## 必备输入

通常至少需要：

```json
{
  "type": "createForm",
  "resource": {
    "dataSourceKey": "main",
    "collectionName": "users"
  }
}
```

## 公开语义

- `fields`
  - 表单项
- `actions`
  - 表单动作，通常是 `submit`

## 高频配置

- `layout`
- `labelAlign`
- `labelWidth`
- `labelWrap`
- `colon`
- `assignRules`

## 关键约束

- 必须绑定 collection resource。
- 默认优先它，而不是通用 `form`。
- 记录级动作不属于 `createForm`；它只有 form actions。
- `jsItem` 只在表单类容器里可用。
