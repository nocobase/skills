# Tools

按职责选 tool，不按“我记得某个底层接口可能能干这事”来选。

## 读取

- [get.md](./get.md)
- [catalog.md](./catalog.md)

## 页面与 tab

- [createpage.md](./createpage.md)
- [addtab.md](./addtab.md)
- [updatetab.md](./updatetab.md)
- [movetab.md](./movetab.md)
- [removetab.md](./removetab.md)
- [destroypage.md](./destroypage.md)

## 语义化搭建

- [compose.md](./compose.md)
- [configure.md](./configure.md)

## 精确追加

- [addblock.md](./addblock.md)
- [addblocks.md](./addblocks.md)
- [addfield.md](./addfield.md)
- [addfields.md](./addfields.md)
- [addaction.md](./addaction.md)
- [addactions.md](./addactions.md)
- [addrecordaction.md](./addrecordaction.md)
- [addrecordactions.md](./addrecordactions.md)

## 精确改配与结构调整

- [updatesettings.md](./updatesettings.md)
- [seteventflows.md](./seteventflows.md)
- [setlayout.md](./setlayout.md)
- [movenode.md](./movenode.md)
- [removenode.md](./removenode.md)

## 编排

- [apply.md](./apply.md)
- [mutate.md](./mutate.md)

## 默认决策

- 新页面：`createpage -> catalog -> compose -> configure -> get`
- 已有页面小改：`get -> catalog -> configure -> get`
- 精确追加：`get -> catalog -> add* -> get`
- 复杂改造：`get -> catalog -> apply/mutate -> get`
