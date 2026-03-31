# Iframe Block

`iframe` 用于嵌入外部 URL 或 HTML 内容。

## 适用场景

- 嵌入第三方页面
- 内嵌 HTML 说明块
- 内部系统跳转容器

## 必备输入

不需要 collection resource。

## 高频配置

- `mode`
- `url`
- `html`
- `params`
- `allow`
- `htmlId`
- `height`

## 关键约束

- `mode` 通常是 `url` 或 `html`。
- 如果用户要嵌网页，优先它，不要滥用 `markdown`。
- 如果配置切换了 `mode`，读回时要确认旧字段是否已清空或被覆盖。
