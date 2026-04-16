---
name: nocobase-dsl-reconciler
description: >-
  Build NocoBase applications from YAML DSL + JS specs.
  Trigger: user wants to build, create, scaffold, or deploy a NocoBase system/module.
argument-hint: "[system-name]"
allowed-tools: shell, local file reads, local file writes
---

# NocoBase 应用搭建

## ⚠️ 禁止事项

**绝对不要读 reconciler 源码。** 不要 grep/cat/ReadFile 任何 `nocobase-reconciler/src/` 下的 `.ts` 文件。
本文件包含你需要的所有信息。遇到报错，看下方"常见报错"段落。

## 环境

```bash
# 所有命令都在这个目录下执行
RECONCILER=/home/albert/prj/vscodes/nocobase-reconciler
cd $RECONCILER/src

# 环境变量（每次 shell 都要设）
export NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000
```

## 搭建流程

### 第零轮：设计（必须先确认）

列出数据表、字段、关系，等用户确认后再动手：

```
数据表：
  nb_pm_projects: name, status(select), start_date(dateOnly), budget(number), manager(m2o→members)
  nb_pm_tasks: name, status(select), priority(select), project(m2o→projects), assignee(m2o→members)
  nb_pm_members: name, email, role(select)
页面：Dashboard + Projects, Tasks, Members
确认后开始搭建？
```

### 第一轮：创建文件 + 部署

**注意**：不要用 scaffold 命令，直接手写文件更可控。

1. 创建工作目录 `/tmp/myapp/`
2. 写 `collections/*.yaml`（见下方完整示例）
3. 写 `routes.yaml`
4. 写 `pages/<group>/<page>/layout.yaml`
5. 写 `templates/block/*.yaml`
6. 部署 + 插入测试数据

```bash
cd $RECONCILER/src
npx tsx cli/cli.ts deploy-project /tmp/myapp --group "MyApp" --force
```

**⚠️ 关键：routes.yaml 的 title 必须和 pages/ 目录名一致。**
比如 routes 里写 `title: Projects`，pages 目录必须是 `pages/myapp/projects/layout.yaml`（小写）。

### 第二轮：弹窗 + 详情

编辑 `templates/popup/*.yaml` 和 `pages/*/popups/*.yaml`，然后 `deploy --force`。

### 第三轮：JS + 图表（可选）

从 `$RECONCILER/templates/crm/js/` 复制 JS 文件再改。不要自己从零写 JS。

---

## 完整文件示例

### routes.yaml

```yaml
- title: PM                    # 菜单分组名
  type: group
  icon: projectoutlined
  children:
    - title: Dashboard
      icon: dashboardoutlined
    - title: Projects           # ← 必须和 pages/pm/projects/ 目录名匹配（小写）
      icon: fileoutlined
    - title: Tasks
      icon: fileoutlined
    - title: Members
      icon: teamoutlined
```

### collections/nb_pm_projects.yaml

```yaml
name: nb_pm_projects
title: Projects
titleField: name                # 必须有，关联下拉框显示这个字段
fields:
  - name: name
    interface: input
    title: Project Name
    required: true

  - name: status
    interface: select
    title: Status
    options:                    # ← select 必须有 options
      - value: planning
        label: Planning
      - value: active
        label: Active
      - value: completed
        label: Completed

  - name: start_date
    interface: dateOnly
    title: Start Date

  - name: budget
    interface: number
    title: Budget

  - name: manager
    interface: m2o             # ← 多对一关系
    title: Manager
    target: nb_pm_members      # ← 目标集合名
```

### 字段类型速查

| interface | 用途 | 必填参数 |
|-----------|------|---------|
| input | 短文本 | — |
| textarea | 长文本 | — |
| select | 下拉 | `options: [{value, label}]` |
| number | 小数 | — |
| integer | 整数 | — |
| dateOnly | 日期 | — |
| datetime | 日期时间 | — |
| m2o | 多对一 | `target: 集合名` |
| o2m | 一对多 | `target: 集合名` |
| email | 邮箱 | — |
| phone | 电话 | — |
| percent | 百分比 | — |
| checkbox | 布尔 | — |

### pages/pm/projects/layout.yaml

```yaml
coll: nb_pm_projects
blocks:
  - key: filterForm
    type: filterForm
    fields:
      - field: name
        label: Search
        filterPaths: [name]     # ← 搜索字段必须有 filterPaths
      - status                  # select 字段直接写名字

  - key: table
    type: table
    fields:
      - field: name
        popup: true             # 点击打开默认详情弹窗
      - status
      - start_date
      - budget
      - manager
      - createdAt

layout:                         # ← 必须有
  - - filterForm
  - - table
```

### templates/block/form_add_new_nb_pm_projects.yaml

```yaml
name: 'Form (Add new): Projects'
type: block
collectionName: nb_pm_projects
content:
  type: createForm
  fields: [name, status, start_date, budget, manager]
  field_layout:                 # ← 必须有分组
    - '--- Project Info ---'
    - - name
      - status
    - - start_date
      - budget
    - '--- Team ---'
    - - manager
  actions:
    - submit
```

### templates/block/detail_nb_pm_projects.yaml

```yaml
name: 'Detail: Projects'
type: block
collectionName: nb_pm_projects
content:
  type: details
  fields: [name, status, start_date, budget, manager, createdAt]
  field_layout:
    - '--- Project Info ---'
    - - name
      - status
    - - start_date
      - budget
    - '--- Team ---'
    - - manager
      - createdAt
```

### templates/popup/projects_view.yaml

```yaml
name: Projects View
type: popup
collectionName: nb_pm_projects
content:
  tabs:
    - title: Details
      blocks:
        - ref: templates/block/detail_nb_pm_projects.yaml
    - title: Tasks
      blocks:
        - key: tasks_table
          type: table
          coll: nb_pm_tasks
          fields: [name, status, priority, assignee]
```

### defaults.yaml

```yaml
nb_pm_projects: templates/popup/projects_view.yaml
nb_pm_tasks: templates/popup/tasks_view.yaml
nb_pm_members: templates/popup/members_view.yaml
```

### 多列布局（Dashboard 示例）

```yaml
# pages/pm/dashboard/layout.yaml
coll: nb_pm_projects
blocks:
  - js: ./js/kpi_1.js
    key: kpi_1
  - js: ./js/kpi_2.js
    key: kpi_2
  - js: ./js/kpi_3.js
    key: kpi_3
  - js: ./js/kpi_4.js
    key: kpi_4
  - key: chart_1
    type: chart
    chart: ./charts/chart_1.yaml

layout:
  - - kpi_1: 6
    - kpi_2: 6
    - kpi_3: 6
    - kpi_4: 6
  - - chart_1
```

---

## 种子数据

```bash
# 获取 token（每次都要重新获取）
TOKEN=$(curl -s http://localhost:14000/api/auth:signIn \
  -H 'Content-Type: application/json' \
  -d '{"account":"admin@nocobase.com","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 插入（先父表再子表）
curl -s -X POST "http://localhost:14000/api/nb_pm_members:create" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@test.com","role":"manager"}'

curl -s -X POST "http://localhost:14000/api/nb_pm_projects:create" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Project Alpha","status":"active","budget":50000,"managerId":1}'

# 批量
for i in 1 2 3 4 5; do
  curl -s -X POST "http://localhost:14000/api/nb_pm_tasks:create" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"Task $i\",\"status\":\"todo\",\"priority\":\"medium\",\"projectId\":1,\"assigneeId\":1}"
done
```

> **m2o 外键**：字段名 + `Id`。如 `project` → `projectId`，`manager` → `managerId`。

---

## 常见报错

| 报错 | 原因 | 修复 |
|------|------|------|
| `fields not in collection` | collection YAML 里的字段名和 NocoBase 不一致 | 检查 collection YAML，字段名必须精确匹配 |
| `没有 titleField` | collection 没有 name 或 title 字段 | 加 `titleField: name` 到 collection YAML |
| 只部署了 Dashboard | routes.yaml title 和 pages 目录名不匹配 | routes 写 `title: Projects`，目录必须是 `pages/xxx/projects/` |
| `filterTargetKey is not defined` | 老 bug，已修复 | 重新 deploy --force |
| `Request failed 400` | 集合字段不存在或格式错 | 检查 collection YAML 的字段定义 |
| chart SQL 验证失败 | 表里没数据或字段名错 | 先插测试数据，字段用双引号 camelCase |
| `Block "xxx" references fields not in` | layout.yaml 里引用了不存在的字段 | 检查 fields 列表，去掉不存在的字段 |

---

## 关键规则

1. **绝对不要读 reconciler 源码** — 本文件是唯一参考
2. **select 必须有 options** — `options: [{value, label}]`
3. **collection 必须有 titleField** — 有 `name` 字段会自动设置，否则显式加
4. **filterForm 搜索字段必须有 filterPaths** — `filterPaths: [name, description]`
5. **field_layout 必须有分组** — `'--- Section Name ---'`
6. **actions 自动填充** — 不需要显式写 actions/recordActions
7. **layout 必须声明** — 超过 1 个 block 就必须有 `layout:`
8. **routes title = 目录名** — `title: Projects` → `pages/xxx/projects/`
9. **先父表后子表** — 插种子数据时先插无外键依赖的表
10. **JS 从模板复制** — 不要自己写，从 `$RECONCILER/templates/crm/js/` 复制再改

## 命令速查

```bash
cd /home/albert/prj/vscodes/nocobase-reconciler/src
export NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000

# 部署（首次 + 增量）
npx tsx cli/cli.ts deploy-project /tmp/myapp --group "MyApp" --force

# 导出
npx tsx cli/cli.ts export-project "MyApp" /tmp/export
```
