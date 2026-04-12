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

function readYamlDoubleQuotedScalar(yamlText, key) {
  const match = yamlText.match(new RegExp(`${key}: "((?:[^"\\\\]|\\\\.)*)"`, 'm'));
  assert.ok(match, `${key} should be present`);
  return JSON.parse(`"${match[1]}"`);
}

test('skill docs keep the simplified routing structure', () => {
  const requiredFiles = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/normative-contract.md',
    'references/execution-checklist.md',
    'references/ascii-preview.md',
    'references/page-blueprint.md',
    'references/page-intent.md',
  ];

  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(path.join(skillRoot, relativePath)), true, `${relativePath} should exist`);
  }


  const skill = read('SKILL.md');
  assertRelativeMarkdownLinksExist('SKILL.md');
  assert.match(skill, /normative-contract\.md/);
  assert.match(skill, /execution-checklist\.md/);
  assert.match(skill, /ascii-preview\.md/);
  assert.match(skill, /page-blueprint\.md/);
  assert.match(skill, /page-intent\.md/);
  assert.match(skill, /Minimum read set/);
  assert.match(skill, /Then choose \*\*one\*\* path/);
  assert.match(skill, /### Always/);
  assert.match(skill, /### Whole-page `applyBlueprint` path/);
  assert.match(skill, /### Localized low-level path/);
  assert.match(skill, /never use `collections\.fields:list`/i);
  assert.match(skill, /only default field truth/i);
  assert.match(skill, /collections\.fields:get.*single-field follow-up/i);
  assert.match(skill, /prefer `navigation\.group\.routeId`/);
  assert.match(skill, /`layout` belongs only on `tabs\[\]` or inline `popup`/i);
  assert.match(skill, /requestBody` must stay an \*\*object\*\*/i);
  assert.match(skill, /default to exactly \*\*one tab\*\*/i);
  assert.match(skill, /any second tab is wrong/i);
  assert.match(skill, /Summary.*Later.*备用.*tabs/i);
  assert.match(skill, /markdown` \/ note \/ banner blocks/i);
  assert.match(skill, /Field entries default to simple strings/i);
  assert.match(skill, /field object only when .*popup.*target.*renderer.*type/i);
  assert.match(skill, /Before the first `applyBlueprint`, finish .* authoring self-check/i);
  assert.match(skill, /every `tab\.blocks` is non-empty/i);
  assert.match(skill, /no empty tab exists/i);
  assert.match(skill, /no placeholder `markdown` \/ note \/ banner block exists/i);
  assert.match(skill, /no block object contains `layout`/i);
  assert.match(skill, /block `key` values are unique/i);
  assert.match(skill, /rewrite the blueprint before writing/i);
  assert.match(skill, /For any whole-page `applyBlueprint` task, before the first `applyBlueprint`, output one concise .*ASCII-first.* prewrite preview/i);
  assert.match(skill, /ASCII-first/i);
  assert.match(skill, /ASCII wireframe/i);
  assert.match(skill, /one level deep/i);
  assert.match(skill, /show the preview and continue/i);
  assert.match(skill, /never create another same-title group/i);
  assert.match(skill, /chosen routeId in the prewrite preview/i);
  assert.match(skill, /prefer a field popup \/ clickable field/i);
  assert.match(skill, /do \*\*not\*\* support generic `form`/i);
  assert.match(skill, /exactly one `editForm`/i);
  assert.match(skill, /never do destructive cleanup/i);

  assertRelativeMarkdownLinksExist('references/normative-contract.md');
  assertRelativeMarkdownLinksExist('references/execution-checklist.md');
  assertRelativeMarkdownLinksExist('references/ascii-preview.md');
  assertRelativeMarkdownLinksExist('references/page-blueprint.md');
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
  assert.match(checklist, /show one ASCII wireframe/i);
  assert.match(checklist, /ASCII prewrite preview and stop without writing/i);
  assert.match(checklist, /ASCII-first/i);
  assert.match(checklist, /ASCII wireframe/i);
  assert.match(checklist, /target\.pageSchemaUid/);
  assert.match(checklist, /never send `requestBody` as a JSON string/i);
  assert.match(checklist, /default to exactly \*\*one tab\*\*/i);
  assert.match(checklist, /Summary.*Later.*备用.*tabs/i);
  assert.match(checklist, /markdown` \/ note \/ banner blocks/i);
  assert.match(checklist, /Before the \*\*first\*\* `applyBlueprint`, run the authoring self-check/i);
  assert.match(checklist, /every `tab\.blocks` is a non-empty array/i);
  assert.match(checklist, /no empty \/ placeholder tab/i);
  assert.match(checklist, /no placeholder `markdown` \/ note \/ banner block/i);
  assert.match(checklist, /no block object contains `layout`/i);
  assert.match(checklist, /`tab\.layout` \/ `popup\.layout` is an object/i);
  assert.match(checklist, /rewrite the blueprint before the first write/i);
  assert.match(checklist, /Before the \*\*first\*\* `applyBlueprint` on any whole-page task, show one ASCII wireframe/i);
  assert.match(checklist, /Otherwise continue immediately to `applyBlueprint`/i);
  assert.match(checklist, /mandatory even when execution will continue immediately afterward/i);
  assert.match(checklist, /do \*\*not\*\* create another same-title group/i);
  assert.match(checklist, /state that chosen routeId in the prewrite preview/i);
  assert.match(checklist, /block `key` values are unique within the document/i);
  assert.match(checklist, /field entry .* simple string unless .*popup.*target.*renderer.*type/i);
  assert.match(checklist, /route-backed tab slots by index/i);
  assert.match(checklist, /auto-generates a simple top-to-bottom layout/);
  assert.match(checklist, /popup expansion depth .* exactly \*\*1\*\*/i);
  assert.match(checklist, /`field\.target` is only a string block key/i);
  assert.match(checklist, /At block root use `collection`; inside nested `resource` use `collectionName`/);
  assert.match(checklist, /Put `layout` only on `tabs\[\]` or inline `popup`/i);
  assert.match(checklist, /prefer a field-level popup \/ clickable-field path/i);
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
  assert.doesNotMatch(checklist, /`draft-page-blueprint`.*stop for confirmation/i);

  const pageIntent = read('references/page-intent.md');
  assert.match(pageIntent, /Authoring Heuristics/);
  assert.match(pageIntent, /Prewrite Output Pattern/);
  assert.match(pageIntent, /See Also/);
  assert.match(pageIntent, /canonical public names/i);
  assert.match(pageIntent, /default to exactly \*\*one tab\*\*/i);
  assert.match(pageIntent, /deep popup chains are layout inside one tab/i);
  assert.match(pageIntent, /Summary.*Later.*备用.*tabs/i);
  assert.match(pageIntent, /markdown` \/ note \/ banner blocks/i);
  assert.match(pageIntent, /run the authoring self-check/i);
  assert.match(pageIntent, /ASCII-first/i);
  assert.match(pageIntent, /ASCII wireframe/i);
  assert.match(pageIntent, /Before the first `applyBlueprint` on any whole-page task, show one ASCII-first prewrite preview/i);
  assert.match(pageIntent, /continue immediately/i);
  assert.match(pageIntent, /do \*\*not\*\* create another same-title group/i);
  assert.match(pageIntent, /chosen routeId in the prewrite preview/i);
  assert.match(pageIntent, /block `key` values are unique/i);
  assert.match(pageIntent, /empty \/ placeholder tabs/i);
  assert.match(pageIntent, /Default blueprint `fields\[\]` entries to simple strings/i);
  assert.match(pageIntent, /field object with inline `popup`/i);
  assert.match(pageIntent, /omit it rather than inventing a string or block-level `layout`/i);
  assert.match(pageIntent, /rewrite the blueprint before the first write/i);
  assert.match(pageIntent, /do not leak `uid`, `ref`, `\$ref`/i);
  assert.match(pageIntent, /navigation\.group\.routeId/);
  assert.match(pageIntent, /title-only/i);
  assert.match(pageIntent, /low-level `updateMenu` path/i);
  assert.match(pageIntent, /associatedRecords \+ associationField/i);
  assert.doesNotMatch(pageIntent, /Execution Pattern/);
  assert.doesNotMatch(pageIntent, /Draft Output Pattern/);
  assert.doesNotMatch(pageIntent, /collections:get\(appends=\["fields"\]\)/);

  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(pageBlueprint, /canonical names/i);
  assert.match(pageBlueprint, /put this document under `requestBody` as an \*\*object\*\*/i);
  assert.match(pageBlueprint, /Keep `requestBody` out of the inner blueprint itself/i);
  assert.match(pageBlueprint, /default to exactly \*\*one tab\*\*/i);
  assert.match(pageBlueprint, /Do not add empty \/ placeholder tabs/i);
  assert.match(pageBlueprint, /Summary.*Later.*备用.*tabs/i);
  assert.match(pageBlueprint, /markdown` \/ note \/ banner blocks/i);
  assert.match(pageBlueprint, /nested popups normally stay inside that one tab/i);
  assert.match(pageBlueprint, /Single-tab Deep-popup Skeleton/i);
  assert.match(pageBlueprint, /High-frequency Wrong vs Right/i);
  assert.match(pageBlueprint, /`tab\.layout` must be an object/i);
  assert.match(pageBlueprint, /Do not keep an empty second tab/i);
  assert.match(pageBlueprint, /Default `fields\[\]` entries to simple strings/i);
  assert.match(pageBlueprint, /do \*\*not\*\* support generic `form`/i);
  assert.match(pageBlueprint, /`editForm`/);
  assert.doesNotMatch(pageBlueprint, /expectedFingerprint/);
  assert.doesNotMatch(pageBlueprint, /bindRefs/);
  assert.doesNotMatch(pageBlueprint, /bindKeys/);
  assert.doesNotMatch(pageBlueprint, /refs \/ keys map/);
  assert.doesNotMatch(pageBlueprint, /object-style target refs/);
  assert.match(pageBlueprint, /Tabs are interpreted in array order/);
  assert.match(pageBlueprint, /route-backed tab slots by index/i);
  assert.match(pageBlueprint, /navigation\.group\.routeId/);
  assert.match(pageBlueprint, /exact targeting only/i);
  assert.match(pageBlueprint, /zero existing groups -> create a new group/i);
  assert.match(pageBlueprint, /title-only unique same-title reuse/i);
  assert.match(pageBlueprint, /low-level `updateMenu`/i);
  assert.match(pageBlueprint, /optional local `key`/i);
  assert.match(pageBlueprint, /nested `resource\.collectionName`, not `resource\.collection`/i);
  assert.match(pageBlueprint, /associatedRecords/);
  assert.match(pageBlueprint, /associationField/);
  assert.match(pageBlueprint, /single relation field name/i);
  assert.match(pageBlueprint, /record-capable blocks/i);
  assert.match(pageBlueprint, /auto-promote/i);
  assert.match(pageBlueprint, /`field\.target` is only a .*string block key/i);
  assert.match(pageBlueprint, /prefer a field object with inline `popup`/i);
  assert.match(pageBlueprint, /clickable-field \/ `clickToOpen` semantics/i);
  assert.match(pageBlueprint, /`layout` is only allowed on `tabs\[\]` and inline `popup` documents/i);
  assert.match(pageBlueprint, /layout cells do \*\*not\*\* use `uid`, `ref`, or `\$ref`/i);
  assert.match(pageBlueprint, /do not use `ref` or `\$ref`/i);
  assert.match(pageBlueprint, /Keep `requestBody`, `ref`, `\$ref`, block-level `layout`/i);
  const createExample = pageBlueprint.match(/## 3\. Create Example[\s\S]*?```json\n([\s\S]*?)\n```/);
  assert.ok(createExample, 'page-blueprint create example should exist');
  assert.doesNotMatch(createExample[1], /"title": "Summary"/);
  assert.doesNotMatch(createExample[1], /overviewBanner/);

  const normative = read('references/normative-contract.md');
  assert.match(normative, /route-backed tab slots by index/i);
  assert.match(normative, /tab \/ block keys are optional/i);
  assert.match(normative, /navigation\.group\.routeId/);
  assert.match(normative, /exact targeting only/i);
  assert.match(normative, /same-title group/i);
  assert.match(normative, /same-title reuse is title-only/i);
  assert.match(normative, /do \*\*not\*\* create another same-title group for disambiguation/i);
  assert.match(normative, /disclose that chosen routeId in the prewrite preview/i);
  assert.match(normative, /`layout` itself is only allowed on `tabs\[\]` and inline `popup` documents/i);
  assert.match(normative, /`layout` is present, it must be an object/i);
  assert.match(normative, /exactly one real tab/i);
  assert.match(normative, /Summary.*Later.*备用.*tabs/i);
  assert.match(normative, /markdown` \/ note \/ banner blocks/i);
  assert.match(normative, /field entries default to simple string field names/i);
  assert.match(normative, /field-level inline `popup`/i);
  assert.match(normative, /`requestBody` must be the final business \*\*object\*\*/i);
  assert.match(normative, /do \*\*not\*\* leak tool-envelope fields such as `requestBody`/i);
  assert.match(normative, /generic `form` is not a public applyBlueprint block type/i);
  assert.match(normative, /exactly one `editForm` block/i);
  assert.match(normative, /low-level `updateMenu`/i);
  assert.match(normative, /associatedRecords.*associationField/i);
  assert.match(normative, /single relation field name/i);
  assert.match(normative, /recordActions/);
  assert.match(normative, /preview is mandatory even when execution continues immediately afterward/i);
  assert.match(normative, /`ref` \/ `\$ref`/);
  assert.match(normative, /layout-cell `uid`/);
  assert.match(normative, /nested `block\.resource` uses `collectionName`/i);
  assert.match(normative, /layout cells are only block key strings or `\{ key, span \}`/i);
  assert.match(normative, /no empty \/ placeholder tab/i);
  assert.match(normative, /no placeholder `markdown` \/ note \/ banner block/i);
  assert.match(normative, /no block object contains `layout`/i);
  assert.match(normative, /Never delete or clean unrelated pages/i);
  assert.match(normative, /only default field truth for UI authoring/i);
  assert.match(normative, /Do \*\*not\*\* use `collections\.fields:list`/i);
  assert.match(normative, /collections\.fields:get` is optional follow-up/i);
  assert.match(normative, /interface` is empty \/ null/i);
  assert.match(normative, /show one ASCII-first preview from the same blueprint before the first write/i);
  assert.match(normative, /Direct execution after the preview is allowed/i);
  assert.doesNotMatch(normative, /expectedFingerprint/);
  assert.doesNotMatch(normative, /bindKeys/);
  assert.doesNotMatch(normative, /verificationMode/);
  assert.doesNotMatch(normative, /bindRefs/);
  assert.doesNotMatch(normative, /executePlan/);
  assert.doesNotMatch(normative, /validatePlan/);

  const toolShapes = read('references/tool-shapes.md');
  assert.doesNotMatch(toolShapes, /bindKeys/);
  assert.doesNotMatch(toolShapes, /verificationMode/);
  assert.doesNotMatch(toolShapes, /executePlan/);
  assert.doesNotMatch(toolShapes, /validatePlan/);
  assert.match(toolShapes, /getReactionMeta/);
  assert.match(toolShapes, /expectedFingerprint/);
  assert.match(toolShapes, /setFieldValueRules/);
  assert.match(toolShapes, /route-backed tab slots by array index/i);
  assert.match(toolShapes, /For `applyBlueprint`, `requestBody` is the page blueprint object itself/i);
  assert.match(toolShapes, /do \*\*not\*\* support generic `form`/i);
  assert.match(toolShapes, /exactly one `editForm` block/i);
  assert.match(toolShapes, /keep exactly one real tab/i);
  assert.match(toolShapes, /Summary.*Later.*备用.*tabs/i);
  assert.match(toolShapes, /markdown` \/ note \/ banner blocks/i);
  assert.match(toolShapes, /simple string field names/i);
  assert.match(toolShapes, /`layout` belongs only on `tabs\[\]` or inline `popup`/i);
  assert.match(toolShapes, /prefer a field popup rather than inventing a new action button/i);
  assert.match(toolShapes, /clickable-field \/ `clickToOpen` semantics/i);
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
  assert.match(toolShapes, /public `applyBlueprint` never uses `ref` \/ `\$ref` \/ `uid` selectors/i);
  assert.match(toolShapes, /"resource": \{ "collection": "employees" \}/);
  assert.match(toolShapes, /"resource": \{ "resourceBinding": "currentRecord" \}/);
  assert.match(toolShapes, /"popup": \{ "\$ref": "#\/popup" \}/);
  assert.match(toolShapes, /\{ "uid": "employeesTable" \}/);
  assert.match(toolShapes, /"target": \{ "key": "employeesTable" \}/);

  const popup = read('references/popup.md');
  assert.match(popup, /nested `resource` objects use `collectionName`, not `collection`/i);
  assert.match(popup, /associatedRecords/i);
  assert.match(popup, /single relation field name/i);
  assert.match(popup, /field object with inline `popup`/i);
  assert.match(popup, /clickable-field \/ `clickToOpen` semantics/i);
  assert.match(popup, /button \/ action column/i);
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
  assert.match(verification, /ASCII-first/i);
  assert.match(verification, /ASCII wireframe/i);
  assert.match(verification, /before the first write/i);
  assert.match(verification, /execution proceeded immediately/i);
  assert.match(verification, /Inspect \/ Prewrite Verification/i);
  assert.doesNotMatch(verification, /Inspect \/ Draft Verification/i);
  assert.match(verification, /canonical public names are used/i);
  assert.match(verification, /`uid`, `ref`, `\$ref`, or alias fields do not appear/i);

  const asciiPreview = read('references/ascii-preview.md');
  assert.match(asciiPreview, /whole-page `applyBlueprint` authoring before the first write/i);
  assert.match(asciiPreview, /create runs/i);
  assert.match(asciiPreview, /replace runs/i);
  assert.match(asciiPreview, /ASCII-first/i);
  assert.match(asciiPreview, /JSON blueprint unless/i);
  assert.match(asciiPreview, /continue/i);
  assert.match(asciiPreview, /rather than skipping the preview/i);
  assert.doesNotMatch(asciiPreview, /Whole-page Draft Confirmation/i);
  assert.match(asciiPreview, /popup expansion depth is exactly \*\*1\*\*/i);
  assert.match(asciiPreview, /renderPageBlueprintAsciiPreview/);
  assert.match(asciiPreview, /nb-page-preview\.mjs/);

  const runtimePlaybook = read('references/runtime-playbook.md');
  assert.match(runtimePlaybook, /public `applyBlueprint` is key-oriented and structure-first/i);
  assert.match(runtimePlaybook, /author `uid`, `ref`, or `\$ref` selectors there/i);

  const templates = read('references/templates.md');
  assert.match(templates, /public `applyBlueprint`/i);
  assert.match(templates, /block template -> block `template`/i);
  assert.match(templates, /Do not translate low-level `openView` config shapes into the page blueprint/i);

  const settings = read('references/settings.md');
  assert.match(settings, /This file is for \*\*low-level write APIs\*\*/i);
  assert.match(settings, /It is not the authoring guide for the public whole-page `applyBlueprint` JSON blueprint/i);
  assert.match(settings, /Do not copy low-level `requestBody\/settings\/configure` envelopes back into the public page blueprint/i);

  const capabilities = read('references/capabilities.md');
  assert.match(capabilities, /public page blueprint \/ `applyBlueprint` path/i);
  assert.match(capabilities, /Do \*\*not\*\* use `collections\.fields:list`/i);
  assert.match(capabilities, /collections\.fields:get.*single-field follow-up/i);
  assert.match(capabilities, /interface: null/i);

  const aliases = read('references/aliases.md');
  assert.match(aliases, /public page-blueprint \/ applyBlueprint authoring/i);
  assert.match(aliases, /Do not jump from ambiguous wording directly into low-level `uid`-driven writes/i);

  const pageArchetypes = read('references/page-archetypes.md');
  assert.match(pageArchetypes, /simplified public page blueprint/i);
  assert.match(pageArchetypes, /not low-level mutation plans/i);

  const openaiYaml = read('agents/openai.yaml');
  assert.match(openaiYaml, /applyBlueprint/);
  assert.match(openaiYaml, /Write path/i);
  assert.match(openaiYaml, /low-level .*APIs/);
  assert.match(openaiYaml, /collections:get\(appends=.*fields.*\)/i);
  assert.match(openaiYaml, /non-empty interface/i);
  assert.match(openaiYaml, /associatedRecords \+ associationField/i);
  assert.match(openaiYaml, /string field\.target/i);
  assert.match(openaiYaml, /requestBody must be an object/i);
  assert.match(openaiYaml, /no generic form/i);
  assert.match(openaiYaml, /one editForm per custom edit popup/i);
  assert.match(openaiYaml, /Single-page.*1 real tab/i);
  assert.match(openaiYaml, /placeholder tabs/i);
  assert.match(openaiYaml, /markdown\/note\/banner blocks/i);
  assert.match(openaiYaml, /fields\[\] default to string/i);
  assert.match(openaiYaml, /layout only on tabs.*inline popup/i);
  assert.match(openaiYaml, /Before first applyBlueprint, self-check/i);
  assert.match(openaiYaml, /Whole-page applyBlueprint must show one ASCII wireframe before .*write/i);
  assert.match(openaiYaml, /one .*wireframe/i);
  assert.match(openaiYaml, /popup depth 1/i);
  assert.match(openaiYaml, /JSON on request/i);
  assert.match(openaiYaml, /unless review is needed, continue in the same run/i);
  assert.match(openaiYaml, /never create another same-title group/i);
  assert.match(openaiYaml, /mention routeId in preview/i);
  assert.match(openaiYaml, /Prefer field popup for click-to-open/i);
  assert.match(openaiYaml, /Before first applyBlueprint, self-check: .*tab\.blocks non-empty.*no block layout/i);
  assert.match(openaiYaml, /no destructive cleanup unless asked/i);
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.ok(defaultPrompt.length < 950, 'openai default_prompt should stay below 950 chars to leave loader headroom');
  assert.doesNotMatch(openaiYaml, /fingerprint flow/);
  assert.doesNotMatch(openaiYaml, /removed public patch blueprint/);
});
