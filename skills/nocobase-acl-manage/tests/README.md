# ACL Test Notes

This folder tracks runtime verification for `nocobase-acl-manage` v2.

## Primary Test Assets

- `./capability-test-plan.md`: capability matrix and assertions
- `./test-playbook.md`: prompt-first acceptance cases (default execution entry)

## Recommended Verification Flow

1. Run baseline CLI/env readiness checks in one locked base-dir:

```bash
cd <BASE_DIR>
nb --help
nb env -s project
nb env update <ENV_NAME>
nb api acl --help
nb api acl roles --help
```

2. If env context is missing, recover through bootstrap skill:

```text
Use $nocobase-env-bootstrap task=app-manage app_env_action=current app_scope=project target_dir=<BASE_DIR>
```

If needed, follow with add/use actions before continuing ACL tests.

3. Execute the full serial suite from `./test-playbook.md` (TC01-TC20).

4. Capture command evidence and expected assertions for each case.

## Safety Requirements

- execute through CLI only
- no direct ACL REST fallback
- no ad-hoc script fallback (`*.js`, `*.ps1`, `*.sh`)
- keep high-impact writes gated and reversible
- restore global role mode when modified
- cleanup temporary test role when run completes

## Report Guidance

For each case, record:

- case id
- command(s) executed
- status (`pass/warn/fail`)
- concise evidence
- mitigation or rerun guidance when `warn/fail`
