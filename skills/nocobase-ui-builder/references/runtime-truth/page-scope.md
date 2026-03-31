# Page Scope

## “页面与菜单”在本 skill 里的准确含义

这里只处理 NocoBase Modern page(v2) 的 route-backed 页面子集：

- page route：`type = flowPage`
- tab route：`type = tabs`
- page 对应 persisted page model
- tab 对应 route-backed synthetic tab anchor
- tab 下默认有 `BlockGridModel`

因此这里的“菜单”指的是：

- 页面路由本身是否出现在桌面菜单中
- 页面标题、图标、header、tab 等 route-backed 配置

不是：

- 任意菜单系统
- 任意 desktop route 类型
- 任意前端导航树编辑器

## 页面生命周期

1. `createpage`
   - 创建 page route
   - 创建默认 tab route
   - 创建 page model
   - 创建 tab 对应 grid anchor
2. `addtab`
   - 在同一 page 下新增 tab route 与 tab grid
3. `updatetab/movetab/removetab`
   - 修改或调整同页 tab
4. `destroypage`
   - 删除 page route
   - 删除 tab route
   - 删除对应 flow models

## 页面配置与 tab 配置

页面级常见配置：

- `title`
- `documentTitle`
- `displayTitle`
- `enableTabs`
- `icon`
- `enableHeader`

tab 级常见配置：

- `title`
- `icon`
- `documentTitle`
- `flowRegistry`

## popup 不是顶层 page

popup 会生成 child page / child tab / popup grid，但它不是桌面菜单页面，不应混同于 page menu。
