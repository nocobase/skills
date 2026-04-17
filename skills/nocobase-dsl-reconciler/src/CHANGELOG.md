# Reconciler — 本轮工作沉淀

> 这份文档是**会话级别**的工作记录，方便压缩上下文后下一会话快速接上。
> 长期设计 → [PHILOSOPHY.md](./PHILOSOPHY.md)；操作手册 → [../SKILL.md](../SKILL.md)；常见坑 → [PITFALLS.md](./PITFALLS.md)。

## 本轮主线

把 reconciler 从"复制 CRM 这种已有项目"打磨成"任意小白搭的小项目都能 push/pull/duplicate"。
通过 **5 轮 D（kimi 模拟小白搭新系统）+ 5 轮 E（duplicate 拷贝压测）** 交叉，每轮暴露一个真实 bug 或文档缺口，修一个，下一轮验证。

| 系统 | D（搭建）| E（复制）|
|---|---|---|
| 工单（IT 运维）| R1 — 暴露 SKILL.md 4 大缺口 + template usage=0 | — |
| 请假审批 | R2 — 验证 R1 改进生效 | R1（leave→v2）— 暴露 unscoped pull 拉全集污染 |
| 简单库存 | R3 — workflow + JS column + dataScope 全 spontaneous 用对 | R2（inv→v2）— 暴露 push 不带 workflow + 模板爆炸 |
| 会议室预订 | R4 — datetime + m2m through + sequence + PG trigger 全用对 | R3（meeting→v2）— 严谨证明"trigger 缺失=数据污染" |
| OA 报销 | R5 — 多级审批分支 + attachment + 4 m2o → users，DSL 表达力够 | R4（inv 完整独立）+ R5（OA 完整独立）— 三件套对真实复杂业务全过 |

## 14 个 commit — 按功能领域分组

### 身份模型重构（key vs title）
- **`79f1e7d`** refactor: key-based route identity — `routes.yaml` 加 `key` 字段，state 索引、page dir、NB 匹配全部按 key
- **`cf4c478`** feat: duplicate-project `--key-suffix` + roundtrip key 保留
- **`977e456`** feat: duplicate-project `--title-prefix`（防"邻居寄生"）
- **`b8e9c35`** docs: PHILOSOPHY.md — DSL 为源、本地决策、API 只执行

### Templates 完整性
- **`eecce53`** fix(export): 停止 name-based dedupe，按 uid 区分，重名加 uid 后缀
- **`28d197c`** fix(deploy): push idempotent — 加 Priority 1.5 (按 DSL uid GET 复用) + 删 syncRoutesYaml
- **`47d9f5c`** fix(ref): templateName fallback — 模板文件没 uid 时走 name 解析

### Pull/Push 全量同步
- **`95ee1e5`** feat(pull): `--group <key|title>` 限定范围 + 关系扩 collection + 自动捕获 templateUid + pollution 警告
- **`ec4a2b6`** feat(push/pull): include workflows in full DSL↔NB sync — push 自动带 workflow，pull 自动带 + scope 过滤
- **`a8ee9fa`** fix(pull): expand to m2m through tables — 拉 m2m 中间表

### duplicate-project 三件套完工
- **`10336eb`** fix(duplicate): workflow 处理 — 清 workflow-state、加 title 前缀、共享表双触发警告
- **`eccdbd8`** feat(triggers): DSL 捕获 + 部署 + 复制 PG triggers — `--collection-suffix` 触发 SQL 表名/函数名一并改写

### 文档与防呆
- **`f6b3592`** docs(SKILL): Round1 暴露的 4 项 — 工作目录约定、key/title 分离、template ref 写法、嵌入子表 example
- **`d2350f0`** docs(SKILL): launcher 必须 mkdir+cd 才启动 agent
- **`e56bbdf`** docs+fix: auto-FK trap 显眼化 + dead popup 文件预警

## SKILL.md 累计改进清单

为方便下一轮检查 SKILL.md 是否还需要补充，列出本轮加的所有规则/示例：

### 新增规则
1. **工作目录跟用户给的**，别照搬 `/tmp/myapp/`
2. **key vs title** 二元身份：`key` 是 ascii 标识，`title` 是显示
3. **launcher 必须 mkdir + cd 后才启动 agent**（kimi/Claude Code 等子进程都适用）
4. **禁读 src/*.ts 源码**（手册不够 → 反馈不要 grep）
5. **`key: reference` 是 popup ref 共享的关键**，没它就是 inline
6. **template `name` 是链接**，`uid` 可省（fresh 模板 deploy 时按 name 解析）
7. **detail popup + o2m 子表** canonical example（`resource_binding.sourceId + associationName`）
8. **auto-FK 陷阱**：声明 m2o 就别再声明 `_id` 列
9. **push 是一次性同步全部**（含 workflow/template/collection），无独立 deploy-workflows 步骤

### 新增 CLI 选项
- `cli push <dir> [--group <key>]`
- `cli pull <dir> [--group <key|title>]`（自动剪枝、关系扩、workflow 同步）
- `cli duplicate-project <src> <dst> [--key-suffix _v2] [--title-prefix "V2 - "] [--collection-suffix _v2]`

## 框架新能力清单（DSL 表达力）

| DSL 字段 | 含义 | 部署/拉取 |
|---|---|---|
| `routes[].key` | 稳定身份（默认 slugify(title)）| ✓ |
| `collection.triggers[].sql` | 原生 SQL DDL（trigger/function 等）| ✓ 双向 |
| 已有：collection.fields / blocks / popups / templates / workflows | — | — |

## NB 直连 DB（utils/sql-exec）

新增本地 `psql` 通道，专跑 trigger/function 等 DDL（NocoBase API 没有通用 SQL 端点）。
环境变量：`NB_DB_HOST/PORT/USER/PASSWORD/NAME`，回退 `PG*`，最后 NocoBase docker-compose 默认值。

## 剩余 deferred 任务

- **#52** Refactor `template-deployer.ts`（1000+ 行，长期重构）
- **#89** workflow state 校验 — NB 侧手动删/改 workflow 后，DSL state 没清 → push 跳过 → 永久失同步。修法：push 前 GET workflow id 验证存在；不存在就清 state 走 create
- **#86** scoped pull 工作流过滤还会带 ai-employee/schedule 类型的无关 workflow（trigger 没有 collection 字段时被认为"in scope"）— 小漏洞

## 已知 gotcha（非 bug，DSL 表达力局限）

- workflow 复制到共享 collection 上 → 双触发（已 warn，需要用户手动选择是否 disable 或加 condition）
- attachment 字段 `target: attachments` 是 NB 系统集合，不被 `--collection-suffix` 重命名 — 这是设计正确（v1/v2 共享 attachments 表，存的文件是同一份）
- workflow 已 executed 后不能改 nodes，必须删重建（NB 限制，#89 待修）

## 下一会话快速接上

- **如果继续 D**：换新场景测（多语言 / 数据导入 / 报表导出 / 公告系统都没测过）
- **如果修小坑**：#89 是中等修；#86 是小修；#52 是长期
- **如果再压缩**：本文 + git log + PHILOSOPHY.md 三个文件已能恢复绝大部分上下文
