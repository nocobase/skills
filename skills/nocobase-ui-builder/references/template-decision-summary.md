# Template Decision Summary

Read this file when the skill needs to state the final template path to the user after selection is already done. This file does **not** define template selection. Selection semantics stay in [templates.md](./templates.md).

Use this contract for final user-visible preview/summary lines that claim a template outcome.

For local runtime enforcement, this contract is also the normalized `templateDecision` shape returned by `prepareApplyBlueprintRequest(...)` / `nb-page-preview --prepare-write` when helper input includes template decision data.

Use the official helper envelope `{ requestBody, templateDecision }` for that path. A valid `templateDecision` may still be returned when other blueprint gates fail after the blueprint is already recognizable, but it must stay semantically consistent with the blueprint's real template bindings. If the blueprint is not recognizable yet, the helper should omit the normalized summary. If the summary claims `selected-reference` / `selected-copy`, the blueprint must bind at least one matching template uid/mode for that current decision. `discovery-only` / `inline-non-template` only describe that this decision did not bind a template; mixed pages may still contain other bound templates elsewhere. If this consistency check fails, runtime validation should surface `inconsistent-template-decision`.

## Contract

- Use exactly one `kind`:
  - `selected-reference`
  - `selected-copy`
  - `discovery-only`
  - `inline-non-template`
- `selected-reference` and `selected-copy` must include:
  - `mode`
  - `template.uid`
  - one short controlled `reason`
- `selected-reference` and `selected-copy` describe the current template decision, not the entire page. Mixed pages may still contain other bound templates elsewhere.
- Current runtime consistency checking is still page-level: it only verifies that the blueprint contains at least one matching template uid/mode for the current decision, and it does not yet prove node-level scope/path identity on mixed pages.
- `discovery-only` and `inline-non-template` must say that the template was **not** bound. Do not imply that the backend or the skill silently picked one.
- `discovery-only` and `inline-non-template` do **not** mean the whole blueprint is unbound. They only summarize the current decision.
- Keep `reason` short and controlled. Do not generate free-form explanations when one of the reason codes below already fits.
- If future validation needs node-level precision, add scope/path data first instead of inferring whole-page meaning from this summary.

## Allowed Reason Codes

- `selected-reference`
  - `standard-reuse`
- `selected-copy`
  - `local-customization`
- `discovery-only`
  - `missing-live-context`
  - `explicit-template-unavailable`
  - `multiple-discovered-not-bound`
- `inline-non-template`
  - `not-template-first`
  - `no-usable-template`

## Preview Boundary

- The default ASCII preview should expose template identity + `mode` only when the blueprint already contains them.
- The ASCII preview does not need to invent a reason.
- The final user-visible summary should use this contract whenever it says a template ended as `reference`, `copy`, discovery-only, or non-template.

## Output Pattern

Use short stable sentences such as:

- `Template employee-popup-template via reference: standard reuse.`
- `Template employee-form-template via copy: local customization.`
- `Template employee-popup-template stayed discovery-only: the current opener/host/planning context was insufficient.`
- `Stayed inline/non-template: no usable template was available.`
