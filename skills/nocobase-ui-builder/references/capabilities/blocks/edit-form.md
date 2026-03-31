# Edit Form Block

`editForm` 用于编辑已有记录，是默认编辑表单 block。

## 适用场景

- 编辑弹窗
- 单记录编辑页
- record action `edit` 的 popup 内容

## 必备输入

```json
{
  "type": "editForm",
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
- `dataScope`

## 关键约束

- 必须绑定 collection resource。
- 只有 `editForm` 额外支持 `dataScope`。
- 记录级动作不属于 `editForm`；它只有 form actions。
- 如果只是查看，不要用 `editForm` 伪装详情页，优先 `details`。
