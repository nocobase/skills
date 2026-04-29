# Intent Routing

## Goal

Route publish-like requests to an unsupported capability response.

## Publish Intent Signals

- publish / 发布 / 上线
- backup / restore / 备份 / 还原 / 恢复
- migration / 迁移
- release between environments

## Routing Rule

If the request is about NocoBase publish, backup/restore release, or migration release:

1. Do not execute CLI commands.
2. Return `feature_status=developing`.
3. Return message `This skill is still under active development. Stay tuned.`
