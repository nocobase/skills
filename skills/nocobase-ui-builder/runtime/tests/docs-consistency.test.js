import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function readRelativeMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\]\(((?:\.\/|\.\.\/)[^)]+)\)/g)].map((match) => match[1]);
}

function assertRelativeMarkdownLinksExist(relativePath) {
  const markdown = read(relativePath);
  const fileDir = path.dirname(path.join(skillRoot, relativePath));
  for (const linkPath of new Set(readRelativeMarkdownLinks(markdown))) {
    assert.equal(existsSync(path.resolve(fileDir, linkPath)), true, `${relativePath} -> ${linkPath} should exist`);
  }
}

test('skill docs keep the simplified routing structure', () => {
  const requiredFiles = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/normative-contract.md',
    'references/execution-checklist.md',
    'references/ui-dsl.md',
    'references/page-intent.md',
  ];

  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(path.join(skillRoot, relativePath)), true, `${relativePath} should exist`);
  }

  assert.equal(
    existsSync(path.join(skillRoot, 'references/dsl-execution.md')),
    false,
    'dsl-execution.md should be removed after runbook consolidation',
  );

  const skill = read('SKILL.md');
  assertRelativeMarkdownLinksExist('SKILL.md');
  assert.match(skill, /normative-contract\.md/);
  assert.match(skill, /execution-checklist\.md/);
  assert.match(skill, /ui-dsl\.md/);
  assert.match(skill, /page-intent\.md/);
  assert.match(skill, /Minimum read set/);
  assert.match(skill, /Then choose \*\*one\*\* path/);
  assert.match(skill, /### Always/);
  assert.match(skill, /### Whole-page `executeDsl` path/);
  assert.match(skill, /### Localized low-level path/);
  assert.match(skill, /never use `collections\.fields:list`/i);
  assert.match(skill, /only default field truth/i);
  assert.match(skill, /collections\.fields:get.*single-field follow-up/i);
  assert.match(skill, /prefer `navigation\.group\.routeId`/);
  assert.match(skill, /`layout` belongs only on `tabs\[\]` or inline `popup`/i);
  assert.match(skill, /stale `flow_surfaces_execute_dsl\.requestBody: string` display/i);
  assert.match(skill, /do \*\*not\*\* support generic `form`/i);
  assert.match(skill, /exactly one `editForm`/i);
  assert.match(skill, /never do destructive cleanup/i);
  assert.doesNotMatch(skill, /validateDsl/);
  assert.doesNotMatch(skill, /dsl-execution\.md/);

  assertRelativeMarkdownLinksExist('references/normative-contract.md');
  assertRelativeMarkdownLinksExist('references/execution-checklist.md');
  assertRelativeMarkdownLinksExist('references/ui-dsl.md');
  assertRelativeMarkdownLinksExist('references/page-intent.md');
  assertRelativeMarkdownLinksExist('references/popup.md');
  assertRelativeMarkdownLinksExist('references/verification.md');
  assertRelativeMarkdownLinksExist('references/runtime-playbook.md');
  assertRelativeMarkdownLinksExist('references/templates.md');
  assertRelativeMarkdownLinksExist('references/settings.md');
  assertRelativeMarkdownLinksExist('references/capabilities.md');
  assertRelativeMarkdownLinksExist('references/aliases.md');
  assertRelativeMarkdownLinksExist('references/page-archetypes.md');

  const checklist = read('references/execution-checklist.md');
  assert.match(checklist, /Whole-page Create \/ Replace Path/);
  assert.match(checklist, /Localized Existing-surface Edit Path/);
  assert.match(checklist, /show the DSL draft first/);
  assert.match(checklist, /target\.pageSchemaUid/);
  assert.match(checklist, /stale schema drift and still send the DSL object under `requestBody`/i);
  assert.match(checklist, /route-backed tab slots by index/i);
  assert.match(checklist, /auto-generates a simple top-to-bottom layout/);
  assert.match(checklist, /`field\.target` is only a string block key/i);
  assert.match(checklist, /At block root use `collection`; inside nested `resource` use `collectionName`/);
  assert.match(checklist, /Put `layout` only on `tabs\[\]` or inline `popup`/i);
  assert.match(checklist, /standard `edit` popup, backend default completion is acceptable/i);
  assert.match(checklist, /`clickToOpen` semantics/i);
  assert.match(checklist, /do \*\*not\*\* support generic `form`/i);
  assert.match(checklist, /exactly one `editForm`/i);
  assert.match(checklist, /do not use `uid`, `ref`, or `\$ref`/);
  assert.match(checklist, /prefer `navigation\.group\.routeId`/);
  assert.match(checklist, /title-only unique same-title reuse/i);
  assert.match(checklist, /routeId` is exact targeting only/i);
  assert.match(checklist, /use low-level `updateMenu` separately/i);
  assert.match(checklist, /associatedRecords/);
  assert.match(checklist, /single relation field name/i);
  assert.match(checklist, /recordActions/);
  assert.match(checklist, /Do \*\*not\*\* use `collections\.fields:list`/i);
  assert.match(checklist, /collections\.fields:get.*single-field follow-up/i);
  assert.match(checklist, /interface: null/i);
  assert.match(checklist, /do not perform destructive cleanup/i);

  const pageIntent = read('references/page-intent.md');
  assert.match(pageIntent, /Authoring Heuristics/);
  assert.match(pageIntent, /See Also/);
  assert.match(pageIntent, /canonical public names/i);
  assert.match(pageIntent, /do not leak `uid`, `ref`, `\$ref`/i);
  assert.match(pageIntent, /navigation\.group\.routeId/);
  assert.match(pageIntent, /title-only/i);
  assert.match(pageIntent, /low-level `updateMenu` path/i);
  assert.match(pageIntent, /associatedRecords \+ associationField/i);
  assert.doesNotMatch(pageIntent, /Execution Pattern/);
  assert.doesNotMatch(pageIntent, /collections:get\(appends=\["fields"\]\)/);

  const uiDsl = read('references/ui-dsl.md');
  assert.match(uiDsl, /canonical names/i);
  assert.match(uiDsl, /stale schema drift and still send this document as an object under `requestBody`/i);
  assert.match(uiDsl, /do \*\*not\*\* support generic `form`/i);
  assert.match(uiDsl, /`editForm`/);
  assert.doesNotMatch(uiDsl, /expectedFingerprint/);
  assert.doesNotMatch(uiDsl, /bindRefs/);
  assert.doesNotMatch(uiDsl, /bindKeys/);
  assert.doesNotMatch(uiDsl, /refs \/ keys map/);
  assert.doesNotMatch(uiDsl, /object-style target refs/);
  assert.match(uiDsl, /Tabs are interpreted in array order/);
  assert.match(uiDsl, /route-backed tab slots by index/i);
  assert.match(uiDsl, /navigation\.group\.routeId/);
  assert.match(uiDsl, /exact targeting only/i);
  assert.match(uiDsl, /zero existing groups -> create a new group/i);
  assert.match(uiDsl, /title-only unique same-title reuse/i);
  assert.match(uiDsl, /low-level `updateMenu`/i);
  assert.match(uiDsl, /optional local `key`/i);
  assert.match(uiDsl, /nested `resource\.collectionName`, not `resource\.collection`/i);
  assert.match(uiDsl, /associatedRecords/);
  assert.match(uiDsl, /associationField/);
  assert.match(uiDsl, /single relation field name/i);
  assert.match(uiDsl, /record-capable blocks/i);
  assert.match(uiDsl, /auto-promote/i);
  assert.match(uiDsl, /`field\.target` is only a .*string block key/i);
  assert.match(uiDsl, /`layout` is only allowed on `tabs\[\]` and inline `popup` documents/i);
  assert.match(uiDsl, /layout cells do \*\*not\*\* use `uid`, `ref`, or `\$ref`/i);
  assert.match(uiDsl, /do not use `ref` or `\$ref`/i);

  const normative = read('references/normative-contract.md');
  assert.match(normative, /route-backed tab slots by index/i);
  assert.match(normative, /tab \/ block keys are optional/i);
  assert.match(normative, /navigation\.group\.routeId/);
  assert.match(normative, /exact targeting only/i);
  assert.match(normative, /same-title group/i);
  assert.match(normative, /same-title reuse is title-only/i);
  assert.match(normative, /`layout` itself is only allowed on `tabs\[\]` and inline `popup` documents/i);
  assert.match(normative, /stale schema drift in the surrounding tool presentation/i);
  assert.match(normative, /generic `form` is not a public executeDsl block type/i);
  assert.match(normative, /exactly one `editForm` block/i);
  assert.match(normative, /low-level `updateMenu`/i);
  assert.match(normative, /associatedRecords.*associationField/i);
  assert.match(normative, /single relation field name/i);
  assert.match(normative, /recordActions/);
  assert.match(normative, /`ref` \/ `\$ref`/);
  assert.match(normative, /layout-cell `uid`/);
  assert.match(normative, /nested `block\.resource` uses `collectionName`/i);
  assert.match(normative, /layout cells are only block key strings or `\{ key, span \}`/i);
  assert.match(normative, /Never delete or clean unrelated pages/i);
  assert.match(normative, /only default field truth for UI authoring/i);
  assert.match(normative, /Do \*\*not\*\* use `collections\.fields:list`/i);
  assert.match(normative, /collections\.fields:get` is optional follow-up/i);
  assert.match(normative, /interface` is empty \/ null/i);
  assert.doesNotMatch(normative, /expectedFingerprint/);
  assert.doesNotMatch(normative, /bindKeys/);
  assert.doesNotMatch(normative, /verificationMode/);
  assert.doesNotMatch(normative, /bindRefs/);
  assert.doesNotMatch(normative, /executePlan/);
  assert.doesNotMatch(normative, /validatePlan/);
  assert.doesNotMatch(normative, /validateDsl/);

  const toolShapes = read('references/tool-shapes.md');
  assert.doesNotMatch(toolShapes, /expectedFingerprint/);
  assert.doesNotMatch(toolShapes, /bindKeys/);
  assert.doesNotMatch(toolShapes, /verificationMode/);
  assert.doesNotMatch(toolShapes, /executePlan/);
  assert.doesNotMatch(toolShapes, /validatePlan/);
  assert.doesNotMatch(toolShapes, /validateDsl/);
  assert.match(toolShapes, /route-backed tab slots by array index/i);
  assert.match(toolShapes, /stale schema drift/i);
  assert.match(toolShapes, /do \*\*not\*\* support generic `form`/i);
  assert.match(toolShapes, /exactly one `editForm` block/i);
  assert.match(toolShapes, /"routeId": 12/);
  assert.match(toolShapes, /unique same-title group/i);
  assert.match(toolShapes, /Same-title reuse is title-only/i);
  assert.match(toolShapes, /exact targeting only/i);
  assert.match(toolShapes, /low-level `updateMenu`/i);
  assert.match(toolShapes, /collectionName/);
  assert.match(toolShapes, /fieldPath/);
  assert.match(toolShapes, /resource\.collectionName/);
  assert.match(toolShapes, /associatedRecords/);
  assert.match(toolShapes, /associationField/);
  assert.match(toolShapes, /single relation field name/i);
  assert.match(toolShapes, /recordActions/);
  assert.match(toolShapes, /`layout` is allowed on `tabs\[\]` and inline `popup` documents only/i);
  assert.match(toolShapes, /public `executeDsl` never uses `ref` \/ `\$ref` \/ `uid` selectors/i);
  assert.match(toolShapes, /"resource": \{ "collection": "employees" \}/);
  assert.match(toolShapes, /"resource": \{ "resourceBinding": "currentRecord" \}/);
  assert.match(toolShapes, /"popup": \{ "\$ref": "#\/popup" \}/);
  assert.match(toolShapes, /\{ "uid": "employeesTable" \}/);
  assert.match(toolShapes, /"target": \{ "key": "employeesTable" \}/);

  const popup = read('references/popup.md');
  assert.match(popup, /nested `resource` objects use `collectionName`, not `collection`/i);
  assert.match(popup, /associatedRecords/i);
  assert.match(popup, /single relation field name/i);
  assert.match(popup, /record-capable popup blocks, prefer `recordActions`/i);
  assert.match(popup, /`field\.target` is only a string block key/i);
  assert.match(popup, /never `uid`, `ref`, or `\$ref`/i);
  assert.match(popup, /`layout` belongs to the popup document itself/i);
  assert.match(popup, /clickToOpen/i);
  assert.match(popup, /standard single-form edit popup/i);
  assert.match(popup, /exactly one `editForm` block/i);
  assert.match(popup, /generic `form` is unsupported/i);
  assert.match(popup, /"type": "editForm"/i);
  assert.doesNotMatch(popup, /"type": "form"/i);
  assert.match(popup, /`popup`, not low-level `openView` authoring/i);

  const verification = read('references/verification.md');
  assert.match(verification, /canonical public names are used/i);
  assert.match(verification, /`uid`, `ref`, `\$ref`, or alias fields do not appear/i);

  const runtimePlaybook = read('references/runtime-playbook.md');
  assert.match(runtimePlaybook, /public `executeDsl` is structure-only/i);
  assert.match(runtimePlaybook, /do not author `uid`, `ref`, or `\$ref` selectors there/i);

  const templates = read('references/templates.md');
  assert.match(templates, /public `executeDsl`/i);
  assert.match(templates, /block template -> block `template`/i);
  assert.match(templates, /Do not translate low-level `openView` config shapes into the page DSL/i);

  const settings = read('references/settings.md');
  assert.match(settings, /This file is for \*\*low-level write APIs\*\*/i);
  assert.match(settings, /It is not the authoring guide for the public whole-page `executeDsl` JSON DSL/i);
  assert.match(settings, /Do not copy low-level `requestBody\/settings\/configure` envelopes back into the public page DSL/i);

  const capabilities = read('references/capabilities.md');
  assert.match(capabilities, /public page DSL \/ `executeDsl` path/i);
  assert.match(capabilities, /Do \*\*not\*\* use `collections\.fields:list`/i);
  assert.match(capabilities, /collections\.fields:get.*single-field follow-up/i);
  assert.match(capabilities, /interface: null/i);

  const aliases = read('references/aliases.md');
  assert.match(aliases, /public page-DSL \/ executeDsl authoring/i);
  assert.match(aliases, /Do not jump from ambiguous wording directly into low-level `uid`-driven writes/i);

  const pageArchetypes = read('references/page-archetypes.md');
  assert.match(pageArchetypes, /simplified public page DSL/i);
  assert.match(pageArchetypes, /not low-level mutation plans/i);

  const openaiYaml = read('agents/openai.yaml');
  assert.match(openaiYaml, /executeDsl/);
  assert.match(openaiYaml, /choose exactly one write path per task/i);
  assert.match(openaiYaml, /low-level flow-surfaces APIs/);
  assert.match(openaiYaml, /route-backed tab slots by index/i);
  assert.match(openaiYaml, /only use key when local layout or in-document targeting needs it/i);
  assert.match(openaiYaml, /navigation\.group\.routeId/);
  assert.match(openaiYaml, /exact targeting only/i);
  assert.match(openaiYaml, /low-level updateMenu/i);
  assert.match(openaiYaml, /never use collections\.fields:list/i);
  assert.match(openaiYaml, /collections:get\(appends=.*fields.*\) as the default field truth/i);
  assert.match(openaiYaml, /collections\.fields:get only for known single-field follow-up/i);
  assert.match(openaiYaml, /interface is empty\/null/i);
  assert.match(openaiYaml, /nested resource\.collectionName/i);
  assert.match(openaiYaml, /associatedRecords \+ associationField/i);
  assert.match(openaiYaml, /recordActions/);
  assert.match(openaiYaml, /field\.target as a string block key only/i);
  assert.match(openaiYaml, /Put layout only on tabs\[\] or inline popup documents/i);
  assert.match(openaiYaml, /stale schema drift/i);
  assert.match(openaiYaml, /clickToOpen semantics/i);
  assert.match(openaiYaml, /do not support generic form/i);
  assert.match(openaiYaml, /exactly one editForm block/i);
  assert.match(openaiYaml, /do not author ref\/\$ref or uid-style selectors/i);
  assert.match(openaiYaml, /never do destructive cleanup/i);
  assert.doesNotMatch(openaiYaml, /validateDsl/);
  assert.doesNotMatch(openaiYaml, /fingerprint flow/);
  assert.doesNotMatch(openaiYaml, /removed public patch DSL/);
});
