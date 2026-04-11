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
  assert.match(checklist, /route-backed tab slots by index/i);
  assert.match(checklist, /auto-generates a simple top-to-bottom layout/);
  assert.match(checklist, /`field\.target` is only a string block key/i);
  assert.match(checklist, /At block root use `collection`; inside nested `resource` use `collectionName`/);
  assert.match(checklist, /do not use `uid`, `ref`, or `\$ref`/);

  const pageIntent = read('references/page-intent.md');
  assert.match(pageIntent, /Authoring Heuristics/);
  assert.match(pageIntent, /See Also/);
  assert.match(pageIntent, /canonical public names/i);
  assert.match(pageIntent, /do not leak `uid`, `ref`, `\$ref`/i);
  assert.doesNotMatch(pageIntent, /Execution Pattern/);
  assert.doesNotMatch(pageIntent, /collections:get\(appends=\["fields"\]\)/);

  const uiDsl = read('references/ui-dsl.md');
  assert.match(uiDsl, /canonical names/i);
  assert.doesNotMatch(uiDsl, /expectedFingerprint/);
  assert.doesNotMatch(uiDsl, /bindRefs/);
  assert.doesNotMatch(uiDsl, /bindKeys/);
  assert.doesNotMatch(uiDsl, /refs \/ keys map/);
  assert.doesNotMatch(uiDsl, /object-style target refs/);
  assert.match(uiDsl, /Tabs are interpreted in array order/);
  assert.match(uiDsl, /route-backed tab slots by index/i);
  assert.match(uiDsl, /optional local `key`/i);
  assert.match(uiDsl, /nested `resource\.collectionName`, not `resource\.collection`/i);
  assert.match(uiDsl, /`field\.target` is only a .*string block key/i);
  assert.match(uiDsl, /layout cells do \*\*not\*\* use `uid`, `ref`, or `\$ref`/i);
  assert.match(uiDsl, /do not use `ref` or `\$ref`/i);

  const normative = read('references/normative-contract.md');
  assert.match(normative, /route-backed tab slots by index/i);
  assert.match(normative, /tab \/ block keys are optional/i);
  assert.match(normative, /`ref` \/ `\$ref`/);
  assert.match(normative, /layout-cell `uid`/);
  assert.match(normative, /nested `block\.resource` uses `collectionName`/i);
  assert.match(normative, /layout cells are only block key strings or `\{ key, span \}`/i);
  assert.doesNotMatch(normative, /expectedFingerprint/);
  assert.doesNotMatch(normative, /bindKeys/);
  assert.doesNotMatch(normative, /verificationMode/);
  assert.doesNotMatch(normative, /bindRefs/);

  const toolShapes = read('references/tool-shapes.md');
  assert.doesNotMatch(toolShapes, /expectedFingerprint/);
  assert.doesNotMatch(toolShapes, /bindKeys/);
  assert.doesNotMatch(toolShapes, /verificationMode/);
  assert.match(toolShapes, /route-backed tab slots by array index/i);
  assert.match(toolShapes, /collectionName/);
  assert.match(toolShapes, /fieldPath/);
  assert.match(toolShapes, /resource\.collectionName/);
  assert.match(toolShapes, /public `executeDsl` never uses `ref` \/ `\$ref` \/ `uid` selectors/i);
  assert.match(toolShapes, /"resource": \{ "collection": "employees" \}/);
  assert.match(toolShapes, /"resource": \{ "resourceBinding": "currentRecord" \}/);
  assert.match(toolShapes, /"popup": \{ "\$ref": "#\/popup" \}/);
  assert.match(toolShapes, /\{ "uid": "employeesTable" \}/);
  assert.match(toolShapes, /"target": \{ "key": "employeesTable" \}/);

  const popup = read('references/popup.md');
  assert.match(popup, /nested `resource` objects use `collectionName`, not `collection`/i);
  assert.match(popup, /`field\.target` is only a string block key/i);
  assert.match(popup, /never `uid`, `ref`, or `\$ref`/i);
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
  assert.match(openaiYaml, /nested resource\.collectionName/i);
  assert.match(openaiYaml, /field\.target as a string block key only/i);
  assert.match(openaiYaml, /do not author ref\/\$ref or uid-style selectors/i);
  assert.doesNotMatch(openaiYaml, /validateDsl/);
  assert.doesNotMatch(openaiYaml, /fingerprint flow/);
  assert.doesNotMatch(openaiYaml, /removed public patch DSL/);
});
