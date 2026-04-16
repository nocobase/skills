---
name: nocobase-dsl-reconciler
description: >-
  Build NocoBase applications from YAML DSL + JS specs using the TypeScript reconciler.
  Trigger: user wants to build, create, scaffold, export, or replicate a NocoBase system/module.
argument-hint: "[system-name] [operation: build|scaffold|deploy|export]"
allowed-tools: shell, local file reads, local file writes
---

# NocoBase DSL Reconciler

> **Reconciler 位置**: `/home/albert/prj/vscodes/nocobase-reconciler`
> **参考模板**: `templates/crm/` — CRM 完整示例（collections + pages + JS + charts）

## 响应方式

| 用户说 | 做什么 |
|--------|--------|
| "搭建 XXX 系统" | 设计确认 → scaffold → 编辑 YAML → deploy |
| "修改字段/布局" | 改 YAML → `deploy --force` |
| "导出" | `export-project "Group" outdir/` |

## 搭建流程

### 第零轮：数据建模

> **由 `nocobase-data-modeling` skill 负责。** 先用该 skill 完成集合和字段设计。

完成后，同步数据表到本地作为 scaffold 的输入：

```bash
cd /home/albert/prj/vscodes/nocobase-reconciler/src
NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000 \
  npx tsx cli/cli.ts sync-collections /tmp/myapp
```

这会把 NocoBase 上已有的数据表结构拉到 `/tmp/myapp/collections/*.yaml`。

### 第一轮：Scaffold + 页面部署

```bash
# 1. Scaffold（自动从 collections/ 推导页面 + Dashboard）
npx tsx cli/cli.ts scaffold /tmp/myapp MyApp \
  --collections nb_app_coll1,nb_app_coll2,nb_app_coll3

# 2. 编辑生成的文件：
#    collections/*.yaml   — 检查字段、补 select enum
#    pages/*/layout.yaml  — 调整 filterForm 搜索字段 + table 列
#    templates/block/*.yaml — 调整表单 field_layout 分组
#    routes.yaml           — 调整菜单顺序和图标

# 3. Deploy
NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000 \
  npx tsx cli/cli.ts deploy-project /tmp/myapp --group "MyApp" --force

# 4. 插入测试数据（每表 5-8 条）— 见下方"种子数据"
```

### 第二轮：弹窗 + 详情

- 编辑 `templates/popup/*.yaml` 加 tabs + 关联表格
- 编辑 `pages/*/popups/*.yaml` 配置弹窗触发
- `deploy --force`

### 第三轮：JS 区块 + 图表

**必须从 `templates/crm/js/` 复制再改，不要自己写：**
- KPI：复制 `analytics_jsBlock_6~9.js`，改 CONFIG 的 SQL
- Stats Filter：复制 `customers_filterForm_1_*.js`

### 第四轮：ACL 权限

定义角色 → 配置数据范围 → 配置菜单可见性 → deploy-acl

---

## 文件结构

```
/tmp/myapp/
├── collections/*.yaml      # 数据表定义
├── templates/
│   ├── block/*.yaml         # 表单/详情模板（field_layout）
│   └── popup/*.yaml         # 弹窗模板
├── pages/<group>/<page>/
│   ├── layout.yaml          # 页面布局（blocks + layout）
│   ├── js/*.js              # JS 区块
│   ├── charts/*.yaml        # 图表配置
│   └── popups/*.yaml        # 弹窗绑定
├── routes.yaml              # 菜单树
├── defaults.yaml            # m2o 自动弹窗绑定
└── state.yaml               # 部署状态（自动管理，不要手编）
```

---

## Collection YAML 完整示例

```yaml
name: nb_pm_tasks
title: Tasks
titleField: name           # 关联下拉框显示的字段
fields:
  - name: name
    interface: input
    title: Task Name
    required: true

  - name: description
    interface: textarea
    title: Description

  - name: status
    interface: select
    title: Status
    options:                # select 必须有 options
      - value: todo
        label: To Do
      - value: in_progress
        label: In Progress
      - value: done
        label: Done

  - name: priority
    interface: select
    title: Priority
    options:
      - { value: high, label: High, color: red }
      - { value: medium, label: Medium, color: orange }
      - { value: low, label: Low, color: green }

  - name: due_date
    interface: dateOnly
    title: Due Date

  - name: budget
    interface: number
    title: Budget

  - name: progress
    interface: integer
    title: Progress (%)

  - name: project
    interface: m2o           # 多对一：任务属于项目
    title: Project
    target: nb_pm_projects   # 目标集合名

  - name: assignee
    interface: m2o
    title: Assignee
    target: nb_pm_members

  - name: email
    interface: email
    title: Email

  - name: phone
    interface: phone
    title: Phone
```

### 字段类型速查

| interface | 用途 | 必填参数 |
|-----------|------|---------|
| input | 短文本 | — |
| textarea | 长文本 | — |
| select | 下拉选择 | `options: [{value, label}]` |
| number | 小数 | — |
| integer | 整数 | — |
| dateOnly | 日期 | — |
| datetime | 日期时间 | — |
| m2o | 多对一关系 | `target: 集合名` |
| o2m | 一对多关系 | `target: 集合名` |
| email | 邮箱 | — |
| phone | 电话 | — |
| percent | 百分比 | — |
| checkbox | 布尔 | — |
| url | URL | — |

---

## 页面 layout.yaml 完整示例

```yaml
coll: nb_pm_tasks
blocks:
  - key: filterForm
    type: filterForm
    fields:
      - field: name
        label: Search
        filterPaths: [name, description]  # 搜索字段必须有 filterPaths
      - status                             # select 字段直接写名字

  - key: table
    type: table
    fields:
      - field: name
        popup: templates/popup/task_view.yaml  # 点击打开弹窗
      - status
      - priority
      - project          # m2o 字段自动显示关联名称
      - assignee
      - due_date
      - createdAt
    # actions 和 recordActions 会自动填充，不需要写
    # 默认: actions=[filter,refresh,addNew] recordActions=[edit,delete]

  - js: ./js/dashboard_kpi.js       # JS 区块 sugar
    key: kpi_block                   # 可选：指定 key（layout 引用用）

layout:                              # 必须有 layout
  - - filterForm                     # 每行一个数组
  - - table
```

### 多列布局

```yaml
layout:
  - - kpi_1: 6                # 一行四等分（6+6+6+6=24）
    - kpi_2: 6
    - kpi_3: 6
    - kpi_4: 6
  - - chart_1: 15             # 一行两列（15+9=24）
    - chart_2: 9
  - - table                   # 独占一行（默认 24）
```

---

## Block 模板 (templates/block/*.yaml)

```yaml
name: 'Form (Add new): Tasks'
type: block
collectionName: nb_pm_tasks
content:
  type: createForm
  fields:
    - name
    - status
    - priority
    - project
    - assignee
    - due_date
    - description
  field_layout:                      # 必须有分组
    - '--- Task Info ---'
    - - name
      - status
    - - priority
      - due_date
    - - project
      - assignee
    - '--- Details ---'
    - - description
  actions:
    - submit
```

---

## Popup 模板 (templates/popup/*.yaml)

```yaml
name: Task View
type: popup
collectionName: nb_pm_tasks
content:
  tabs:
    - title: Details
      blocks:
        - ref: templates/block/detail_nb_pm_tasks.yaml
    - title: Sub-Tasks
      blocks:
        - key: subtasks
          type: table
          coll: nb_pm_subtasks
          fields: [name, status, assignee]
```

---

## 种子数据

```bash
# 获取 token
TOKEN=$(curl -s http://localhost:14000/api/auth:signIn \
  -H 'Content-Type: application/json' \
  -d '{"account":"admin@nocobase.com","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 插入记录（先插父表，再插子表）
curl -s -X POST "http://localhost:14000/api/nb_pm_projects:create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Project Alpha","status":"active","budget":50000}'

# 批量插入
for i in 1 2 3 4 5; do
  curl -s -X POST "http://localhost:14000/api/nb_pm_tasks:create" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Task $i\",\"status\":\"todo\",\"projectId\":1}"
done
```

> **注意**：m2o 外键字段名默认是 `{字段名}Id`（如 `project` → `projectId`）

---

## JS 区块

**不要自己写 JS，从 `templates/crm/js/` 复制再改。**

### SQL 规范

```javascript
// ✅ 正确：两步走
const sqlUid = 'unique_id_here';
await ctx.sql.save({ uid: sqlUid, sql: 'SELECT count(*) as cnt FROM "nb_pm_tasks"' });
const result = await ctx.sql.runById(sqlUid);

// ❌ 错误：直接调用
const result = ctx.sql('SELECT ...');  // 不存在这个 API
```

### SQL 语法（PostgreSQL）

```sql
-- 字段名用双引号 camelCase
SELECT count(*) FROM "nb_pm_tasks" WHERE "status" = 'active'

-- 日期用 interval
WHERE "createdAt" >= NOW() - '30 days'::interval

-- 格式化
TO_CHAR("createdAt", 'YYYY-MM')
```

---

## 命令参考

```bash
RECONCILER=/home/albert/prj/vscodes/nocobase-reconciler
cd $RECONCILER/src

# 环境变量
export NB_USER=admin@nocobase.com
export NB_PASSWORD=admin123
export NB_URL=http://localhost:14000

# Scaffold
npx tsx cli/cli.ts scaffold /tmp/myapp MyApp \
  --collections nb_app_coll1,nb_app_coll2

# Deploy（首次 + 增量更新）
npx tsx cli/cli.ts deploy-project /tmp/myapp --group "MyApp" --force

# Export
npx tsx cli/cli.ts export-project "MyApp" /tmp/export

# 同步数据表定义到本地
npx tsx cli/cli.ts sync-collections /tmp/myapp
```

---

## 关键规则

1. **数据建模由 `nocobase-data-modeling` skill 负责**，本 skill 只管页面搭建
2. **select 必须有 options** — `options: [{value, label}]`
3. **collection 必须有 titleField** — 字段里有 `name` 或 `title` 会自动设置
4. **filterForm 必须有搜索框** — `filterPaths: [name, description]`
5. **field_layout 必须有分组** — `'--- Section Name ---'`
6. **默认 actions 自动加** — 不需要显式声明
7. **JS 不能直接 ctx.sql()** — 必须 `ctx.sql.save() + ctx.sql.runById()` 两步
8. **layout 必须声明** — 超过 1 个 block 的页面必须有 `layout:`
9. **先父表后子表** — 插入测试数据时先插无依赖的表

## 参考

- `templates/crm/` — 完整 CRM 系统（20+ 页面、JS、charts）
- `templates/crm/collections/` — 所有集合定义示例
- `templates/crm/js/` — KPI / filter / chart JS 示例
