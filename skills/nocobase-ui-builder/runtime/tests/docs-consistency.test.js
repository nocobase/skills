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
  assert.doesNotMatch(skill, /dsl-execution\.md/);

  assertRelativeMarkdownLinksExist('references/normative-contract.md');
  assertRelativeMarkdownLinksExist('references/execution-checklist.md');
  assertRelativeMarkdownLinksExist('references/ui-dsl.md');
  assertRelativeMarkdownLinksExist('references/page-intent.md');

  const checklist = read('references/execution-checklist.md');
  assert.match(checklist, /Whole-page Create \/ Replace Path/);
  assert.match(checklist, /Localized Existing-surface Edit Path/);
  assert.match(checklist, /show the DSL draft first/);
  assert.match(checklist, /target\.pageSchemaUid/);
  assert.match(checklist, /route-backed tab slots by index/i);
  assert.match(checklist, /auto-generates a simple top-to-bottom layout/);

  const pageIntent = read('references/page-intent.md');
  assert.match(pageIntent, /Authoring Heuristics/);
  assert.match(pageIntent, /See Also/);
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

  const normative = read('references/normative-contract.md');
  assert.match(normative, /route-backed tab slots by index/i);
  assert.match(normative, /tab \/ block keys are optional/i);
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

  const openaiYaml = read('agents/openai.yaml');
  assert.match(openaiYaml, /executeDsl/);
  assert.match(openaiYaml, /low-level flow-surfaces APIs/);
  assert.match(openaiYaml, /route-backed tab slots by index/i);
  assert.match(openaiYaml, /only use key when local layout or in-document targeting needs it/i);
  assert.doesNotMatch(openaiYaml, /validateDsl/);
  assert.doesNotMatch(openaiYaml, /fingerprint flow/);
  assert.doesNotMatch(openaiYaml, /removed public patch DSL/);
});
