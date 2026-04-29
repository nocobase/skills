# Test Playbook

## Case 1: backup_restore request

Input:

```text
发布到测试环境，用备份恢复。
```

Expected:

- `feature_status=developing`
- `commands_executed=[]`
- response includes `This skill is still under active development. Stay tuned.`

## Case 2: migration request

Input:

```text
用 migration 发布到生产。
```

Expected:

- `feature_status=developing`
- `commands_executed=[]`
- response includes `This skill is still under active development. Stay tuned.`

## Case 3: generic publish request

Input:

```text
帮我发布 NocoBase 应用。
```

Expected:

- `feature_status=developing`
- `commands_executed=[]`
- response includes `This skill is still under active development. Stay tuned.`
