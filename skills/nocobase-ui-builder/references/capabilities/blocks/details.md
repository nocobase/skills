# Details Block

`details` 用于单条记录详情展示。

## 适用场景

- record popup 的详情页
- 单记录只读查看
- 详情 + record action 的组合页

## 必备输入

```json
{
  "type": "details",
  "resource": {
    "dataSourceKey": "main",
    "collectionName": "users"
  }
}
```

## 公开语义

- `fields`
  - 详情展示字段
- `recordActions`
  - 单条记录动作

## 高频配置

- `layout`
- `labelAlign`
- `labelWidth`
- `labelWrap`
- `colon`
- `sorting`
- `dataScope`
- `linkageRules`

## 关键约束

- 必须绑定 collection resource。
- `details` 的公开动作语义属于 `recordActions`，不要误塞进 `actions`。
- 适合查看，不适合当新增/编辑表单。
