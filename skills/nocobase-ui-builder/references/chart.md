# Chart

当任务涉及 chart block 的创建、重配、query / visual / events、readback，或 chart contract 回归时，先读本文。

## 分流

- 运行期搭建 / 重配 / readback：看 [chart-core.md](./chart-core.md)
- chart contract 验证矩阵 / 负例 / 回归案例：看 [chart-validation.md](./chart-validation.md)
- `visual.raw` / `events.raw` 的 JS validator、RunJS model 选择与 CLI：看 [js.md](./js.md) 和 [runjs-runtime.md](./runjs-runtime.md)

## 默认执行顺序

1. 先按主 skill 的执行表进入 `chart` gate。
2. 默认先读 [chart-core.md](./chart-core.md) 收敛运行期搭建与 readback。
3. 如果本次 chart 配置涉及 `visual.raw` 或 `events.raw`，再补读 [js.md](./js.md)。
4. 只有在维护 contract case、负例矩阵或回归案例时，才继续读 [chart-validation.md](./chart-validation.md)。
