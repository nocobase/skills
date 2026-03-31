# JS Block

`jsBlock` 用于自定义运行时渲染。

## 适用场景

- 需要自定义 UI 而公开 block 无法满足
- 运营 hero、自定义提示卡、自定义组合展示

## 必备输入

不需要 collection resource。

## 高频配置

- `title`
- `description`
- `className`
- `code`
- `version`

## 关键约束

- 默认只在用户明确要求自定义运行时代码时使用。
- 创建后要读回确认 `runJs` 配置已经落盘。
- 需要数据访问时，不能自动假设 collection 资源会被推导出来。
