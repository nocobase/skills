# 设计理念 — DSL Reconciler

> 这份文档说明这套工具**为什么这样设计**。具体怎么用看 `SKILL.md`，
> 怎么改看 `DEVELOPER.md`，常见坑看 `PITFALLS.md`。

## 一句话

**本地 DSL 是真相之源，线上 NocoBase 是渲染产物。**
所有判断尽量发生在本地，API 只用来执行确定的动作。

---

## 三条核心原则

### 1. DSL 是源、线上是产物

| 真相 | 派生 |
|---|---|
| `routes.yaml` `pages/` `popups/` `templates/` | NB 上的菜单、页面、弹窗、模板 |
| 你 `git diff` 看到的 | 你浏览器里看到的 |

`push` 把 DSL 推到 NB；`pull` 把 NB 拉成新 DSL。冲突时 **DSL 永远赢**。
不靠 NB 数据库做复杂判断、不让 NB 的状态反过来影响 DSL 的形状。

### 2. 判断在本地、API 只做执行

NB 的 API 既慢又不稳，越多 API 调用越脆弱。具体表现：

- ❌ 不在 deploy 过程中遍历线上模板树做 "如果存在就引用、否则就转换" 这种循环
- ❌ 不让一个 API 失败就触发分支处理、再触发更多 API
- ❌ 不递归读取在线 flowSurfaces 来推断 DSL 应该长什么样
- ✅ 在 push 前用本地文件算出"该建哪些、该删哪些、该跳过哪些"
- ✅ 把所有需要的 metadata 在本地结构里就表达清楚（`templateRef`、`popupTemplateUid`、`key`）

**踩过的坑**：早期版本有 `convertPopupToTemplate` 这种运行时魔法 —— deploy 时
检测内联弹窗、动态决定是否提升为模板、读取 NB 上已有模板做匹配。结果是
deploy 链路充满 if/else 分支，状态难追、bug 修不完、模板每次部署翻倍增长。
**已删，永不回来**。要复制一份独立的模块？用 `cli duplicate-project` 在
**本地** 重新生成 UID，得到一份新的、干净的 DSL，然后照常 `push`。

### 3. 身份（key）≠ 显示（title）

`routes.yaml` 每个 route 都有 `key` 字段（缺省 `slugify(title)`）。

- `key`：稳定身份。state.yaml 索引用它、NB 路由匹配用它、`pages/` 目录命名用它
- `title`：菜单显示名。可以随时改，不影响身份

为什么需要分开？同一份模块复制成 `Main` / `CCD - Main` 时，title 不同
但功能相同；以前用 title 做身份，duplicate 后 push 老打架（"CCD - Main -
CCD - Other" 这种叠加）。换成 key：duplicate 时只动 key 后缀，title 留给用户。

---

## 心智模型 — 像 git 一样

| git | reconciler | 含义 |
|---|---|---|
| `git pull` | `cli pull <dir>` | 把线上现状拉成 DSL（覆盖本地） |
| `git push` | `cli push <dir>` | 把 DSL 推上线 |
| `git diff` | `git diff` (普通 git!) | 同模块前后差异 — 不依赖工具 |
| 跨 fork diff | `cli diff <a> <b>` | 不同模块归一化对比（这才需要工具） |
| `git clone --bare` | `cli duplicate-project <a> <b> --key-suffix _x` | 复制成独立模块 |

**所有"跨模块复刻"操作都是 DSL → DSL 的离线变换**，不在 NB 上做。
你想复制 CRM 成 CCD？复制目录 → 重新生成 UID + key → push。
不需要 NB 知道这是"复制"。

---

## 几个常被问的问题

**Q：为什么 push 之后还要把 routes.yaml 写回（syncRoutesYaml）？**
A：防止 NB 上手动改了 icon/排序后，下次 pull 才发现冲突。同步只动当前
group 的子树，且按 `key` 匹配，不会误覆盖别的 group。

**Q：为什么 popup 模板要走单独的 templates/ 目录而不是内联？**
A：模板可被多页引用，内联会让"改一处生效多处"成为后处理魔法（违反原则
2）。在 DSL 里用 `templates/popup/X.yaml` 加 `popupTemplateUid` 显式引用，
本地就能 grep 出谁引用了它。

**Q：为什么 export 用 `flowModels:findOne` 不用 `flowSurfaces:get`？**
A：surfaces API 会剥掉 `referenceSettings.useTemplate` 这种"内部"字段，
导致 ReferenceBlockModel 子节点导出后丢失模板绑定。findOne 给的是原始
树。能在本地完整复原才能保证 round-trip。

**Q：为什么不让 deploy 自动清理废弃模板？**
A：自动删除 = 运行时判断 = 违反原则 2。废弃清理走显式 `cli rollback`，
state.yaml 里只记录"上次 deploy 创建了哪些"，按需手动回滚。用户手动建
的 0-usage 模板永远不动。

---

## 当下未尽事项（活的）

- `template-deployer.ts` 还有 1000+ 行，里面"找已有模板再决定建/复用"
  的判断仍然偏 API-heavy，逐步往 "本地算清单 → 一次性下发" 重构
- export 不能恢复 NB 端没有持久化的 metadata（如 `key`）。目前靠
  本地已有 `routes.yaml` 的 `key` 字段保留 —— 第一次 pull 会丢
- 模板的"空 target"（如 `Detail: Leads` 真实在线为空节点）目前导出为
  bare template，需要 DSL 侧表达力（占位、显式 placeholder）来覆盖

## 已知 Gotcha — title 冲突的 "邻居寄生" 问题

**现象**：用 `duplicate-project --key-suffix _ccd` 复制了 CRM 成 CCD，但
没改 routes.yaml 里的 title（仍叫 `Main`/`Other`）。`cli push` 时本地
state.yaml 是空的（duplicate 会清空），deployGroup 找 NB 上有没有同
title 的 group，找到了源 CRM 的 `Main`，**直接挪用了它**。结果两个 DSL
共用同一个 group，CCD 的页面被插进了源 CRM 的菜单。

**为什么不直接报错**：第一次正常 push 也走"按 title 找已有 group"的
路径——这是基础的"幂等部署"语义。区分不了"我自己之前 push 的"和"别
人/别的 DSL 创建的"，因为 NB 端没有"这个 group 属于哪个 DSL"的标签。

**当前缓解**：当 state.group_ids[key] 为空 + NB 上有同 title group 时，
push 会打 `⚠` 警告，提示要么改 title、要么改 key。

**根治方向**（待做）：
- 在 NB route 的 `name` 或 `meta` 字段写入 DSL key，push/pull 都按
  这个隐藏字段匹配，title 完全交给 UI 显示
- 或者：duplicate-project 可选 `--title-prefix` 一并改 title，避免冲突
