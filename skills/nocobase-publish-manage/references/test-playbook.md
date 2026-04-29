# Test Playbook (v2)

## Case 1: backup_restore direct execution when command missing

```bash
Blocked on current CLI: `nb backup list` is not available.
```

Expected:

- if `Unknown command` appears, output `feature_status=developing`
- subsequent publish mutation is blocked

## Case 2: migration direct execution when command missing

```bash
Blocked on current CLI: `nb migration rule add` is not available.
```

Expected:

- if `Unknown command` appears, output `feature_status=developing`
- subsequent publish mutation is blocked

## Case 3: backup_restore publish happy path (future-supported)

```bash
Blocked on current CLI: `nb backup list` / `nb restore` are not available.
```

Expected:

- requires `confirm=confirm` before restore

## Case 4: migration publish happy path (future-supported)

```bash
Blocked on current CLI: `nb migration rule add` / `generate` / `run` are not available.
```

Expected:

- requires `confirm=confirm` before migration run

## Case 5: ambiguous method

Input: generic publish request without method.

Expected:

- do not execute publish
- ask user to choose `backup_restore` or `migration`
