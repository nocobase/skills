# Benchmark Workspace Instructions

- This workspace is a minimal plugin-eval fixture, not a source repository to inspect.
- Do not enumerate installed skill directories with `rg --files`, `find`, or `ls`.
- If a scenario says to use `nocobase-ui-builder`, read the installed skill `SKILL.md` directly, then at most the named quick-route doc.
- For artifact-only scenarios, write only the requested files under `.artifacts/nocobase-ui-builder/<scenario-id>/` and run `scripts/verify-plugin-eval-artifacts.mjs`.
