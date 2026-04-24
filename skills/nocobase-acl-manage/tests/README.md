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
nb env list -s project
nb env update <ENV_NAME>  # use current env from the `*` row
nb api acl --help
nb api acl roles --help
```

2. If env context is missing, recover through direct CLI:

```bash
nb env list -s project
# add env when missing
nb env add <ENV_NAME> --scope project --api-base-url <BASE_URL>/api --auth-type oauth
# or switch to existing env
nb env use <ENV_NAME> -s project
```

If needed, follow with add/use actions before continuing ACL tests.

3. Execute the full serial suite from `./test-playbook.md` (TC01, TC02, TC04-TC20; TC03 removed).

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
