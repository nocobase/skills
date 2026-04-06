# Chart

当任务涉及 chart block 的创建、重配、query / visual / events、readback，或 chart contract 回归时，先读本文。

## 分流

- 默认先读 [chart-core.md](./chart-core.md) 收敛运行期搭建、重配与 readback。
- 如果本次 chart 配置涉及 `visual.raw` 或 `events.raw`，再补读 [js.md](./js.md) 和 [runjs-runtime.md](./runjs-runtime.md)。
- 只有在维护 contract case、负例矩阵或回归案例时，才继续读 [chart-validation.md](./chart-validation.md)。
