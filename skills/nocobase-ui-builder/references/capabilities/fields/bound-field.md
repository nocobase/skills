# Bound Field

最常见的字段能力就是绑定字段。

## 典型写法

简单写法：

```json
"nickname"
```

显式写法：

```json
{
  "fieldPath": "nickname"
}
```

## 适用容器

- `table`
- `details`
- `list`
- `gridCard`
- `form`
- `createForm`
- `editForm`
- `filterForm`

## 高频配置

wrapper 侧：

- `label`
- `showLabel`
- `tooltip`
- `extra`
- `width`
- `fixed`

field node 侧：

- `titleField`
- `clickToOpen`
- `openView`
- `allowClear`
- `multiple`

## 读回定位

大多数绑定字段都要区分：

- `wrapperUid`
- `fieldUid`
- `innerFieldUid`

后续给关系字段加 popup/openView 时，通常需要其中一个具体 uid。
