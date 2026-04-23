# Test Playbook (v2)

## Case 1: backup_restore direct execution when command missing

```bash
nb backup list --env dev
```

Expected:

- if `Unknown command` appears, output `feature_status=developing`
- subsequent publish mutation is blocked

## Case 2: migration direct execution when command missing

```bash
nb migration rule add --env dev
```

Expected:

- if `Unknown command` appears, output `feature_status=developing`
- subsequent publish mutation is blocked

## Case 3: backup_restore publish happy path (future-supported)

```bash
nb backup list --env dev
nb restore <backup_file> --env test
```

Expected:

- requires `confirm=confirm` before restore

## Case 4: migration publish happy path (future-supported)

```bash
nb migration rule add --env dev
nb migration generate <rule_id> --env dev
nb migration run <migration_file> --env test
```

Expected:

- requires `confirm=confirm` before migration run

## Case 5: ambiguous method

Input: generic publish request without method.

Expected:

- do not execute publish
- ask user to choose `backup_restore` or `migration`
