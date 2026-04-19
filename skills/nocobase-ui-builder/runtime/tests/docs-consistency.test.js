import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = path.resolve(skillRoot, '..', '..');

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function assertFileDoesNotContain(relativePath, pattern, message) {
  assert.doesNotMatch(read(relativePath), pattern, message || `${relativePath} should not contain ${pattern}`);
}

function readRelativeMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\]\(((?:\.\/|\.\.\/)[^)]+)\)/g)].map((match) => match[1]);
}

function readRootRelativeMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\]\((\/[^)]+)\)/g)].map((match) => match[1]);
}

function assertRelativeMarkdownLinksExist(relativePath) {
  const markdown = read(relativePath);
  const fileDir = path.dirname(path.join(skillRoot, relativePath));
  for (const linkPath of new Set(readRelativeMarkdownLinks(markdown))) {
    assert.equal(existsSync(path.resolve(fileDir, linkPath)), true, `${relativePath} -> ${linkPath} should exist`);
  }
}

function assertNoRootRelativeMarkdownLinks(relativePath) {
  const markdown = read(relativePath);
  assert.deepEqual(
    [...new Set(readRootRelativeMarkdownLinks(markdown))],
    [],
    `${relativePath} should not keep root-relative markdown links inside the local snapshot`,
  );
}

function walkMarkdownFiles(relativeDir) {
  const rootDir = path.join(skillRoot, relativeDir);
  const results = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.relative(skillRoot, fullPath));
      }
    }
  }
  return results.sort();
}

function extractFirstJsFenceAfterHeading(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^###\\s+${escaped}\\s*$([\\s\\S]*?)^\\\`\\\`\\\`js\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, 'm'));
  assert.ok(match, `should find js fence after heading "${heading}"`);
  return match[2];
}

function validateRunjsSnippet(model, code) {
  const cliPath = path.join(skillRoot, 'runtime/bin/nb-runjs.mjs');
  const result = spawnSync(process.execPath, [cliPath, 'validate', '--stdin-json', '--skill-mode'], {
    cwd: repoRoot,
    input: JSON.stringify({ model, code }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `runjs validator should exit 0 for ${model}: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, `runjs validator should accept ${model}: ${result.stdout}`);
  return parsed;
}

function readYamlDoubleQuotedScalar(yamlText, key) {
  const match = yamlText.match(new RegExp(`${key}: "((?:[^"\\\\]|\\\\.)*)"`, 'm'));
  assert.ok(match, `${key} should be present`);
  return JSON.parse(`"${match[1]}"`);
}

function assertPointsToTemplates(text, sourceLabel) {
  assert.match(text, /\[templates\.md\]/i, `${sourceLabel} should point to templates.md`);
}

function assertNoTemplateDecisionMatrix(text, sourceLabel) {
  assert.doesNotMatch(text, /## Decision Table/i, `${sourceLabel} should not redefine the template decision table`);
  assert.doesNotMatch(
    text,
    /## Automatic Selection Rule/i,
    `${sourceLabel} should not redefine the automatic template-selection router`,
  );
}

function assertTemplateDocMinimumContract(text, sourceLabel) {
  assert.match(text, /entire page/i, `${sourceLabel} should keep page-vs-scene boundary guidance`);
  assert.match(text, /template type/i, `${sourceLabel} should keep page-vs-scene boundary guidance`);
  assert.match(text, /`reference`/i, `${sourceLabel} should mention reference mode`);
  assert.match(text, /`copy`/i, `${sourceLabel} should mention copy mode`);
  assert.match(text, /saveMode=.*convert|save-template\(saveMode/i, `${sourceLabel} should mention convert-capable save flow`);
  assert.match(text, /conversation language/i, `${sourceLabel} should keep language-aware naming guidance`);
  assert.match(text, /description/i, `${sourceLabel} should keep description guidance`);
  assert.match(text, /name/i, `${sourceLabel} should keep name guidance`);
}

function assertContextualTemplateProbeGuardrails(text, sourceLabel) {
  assert.match(
    text,
    /repeat-eligible[\s\S]{0,260}contextual `?list-templates`?/i,
    `${sourceLabel} should require contextual list-templates for repeat-eligible scenes`,
  );
  assert.match(text, /hard gate|mandatory|must/i, `${sourceLabel} should make the contextual probe non-optional`);
  assert.match(
    text,
    /keyword-only search[\s\S]{0,80}discovery-only|loose text search alone/i,
    `${sourceLabel} should keep keyword-only search as discovery-only`,
  );
}

function assertTryTemplateWriteFallback(text, sourceLabel) {
  assert.match(text, /popup\.tryTemplate\s*=\s*true|`popup\.tryTemplate=true`|`popup\.tryTemplate`/i, `${sourceLabel} should mention popup.tryTemplate`);
  assert.match(
    text,
    /no explicit `?popup\.template`?|without `?popup\.template`?|when `?popup\.template`? is absent/i,
    `${sourceLabel} should scope popup.tryTemplate to the no-explicit-template case`,
  );
  assert.match(
    text,
    /no local popup content|no explicit local popup content|without local popup content|without inline popup content|local popup content[\s\S]{0,40}fallback|fallback[\s\S]{0,40}local popup/i,
    `${sourceLabel} should describe either the no-local-popup-content guard or the local-popup fallback`,
  );
}

function assertSaveAsTemplateWritePath(text, sourceLabel) {
  assert.match(
    text,
    /popup\.saveAsTemplate\s*=\s*\{\s*name,\s*description\s*\}|`popup\.saveAsTemplate=\{ name, description \}`|`popup\.saveAsTemplate`/i,
    `${sourceLabel} should mention popup.saveAsTemplate`,
  );
  assert.match(
    text,
    /explicit(?: local)? `?popup\.blocks`?|requires `?popup\.blocks`?|requires explicit local popup\.blocks/i,
    `${sourceLabel} should require explicit popup.blocks for popup.saveAsTemplate`,
  );
  assert.match(
    text,
    /cannot be combined with `?popup\.template`?[\s\S]{0,60}`?popup\.tryTemplate`?|cannot be combined with `?popup\.tryTemplate`?[\s\S]{0,60}`?popup\.template`?/i,
    `${sourceLabel} should forbid combining popup.saveAsTemplate with popup.template and popup.tryTemplate`,
  );
}

function assertExistingReferenceEditMatrix(text, sourceLabel) {
  assert.match(text, /Existing-reference Edit Routing/i, `${sourceLabel} should define existing-reference edit routing`);
  for (const outcome of ['edit-template-source', 'edit-host-local-config', 'switch-template-reference', 'detach-to-copy']) {
    assert.match(text, new RegExp(outcome, 'i'), `${sourceLabel} should include ${outcome}`);
  }
  assert.match(text, /template-owned content/i, `${sourceLabel} should define template-owned content`);
  assert.match(text, /Host-local defaults/i, `${sourceLabel} should define host-local defaults`);
  assert.match(text, /does \*\*not\*\* decide localized existing-reference edit routing|does not decide localized existing-reference edit routing/i, `${sourceLabel} should keep helper scope explicit`);
  assert.match(
    text,
    /page-scoped wording[\s\S]{0,160}(?:not local-only intent|mean local-only behavior)|this page[\s\S]{0,80}not local-only|direct page URL[\s\S]{0,160}(?:not local-only intent|mean local-only behavior)/i,
    `${sourceLabel} should say page-scoped wording does not imply local-only intent`,
  );
  assert.match(
    text,
    /do not use `?copy` as a safety fallback|stop and clarify instead of auto-detaching|clarify instead of auto-detaching/i,
    `${sourceLabel} should forbid auto-copy fallback for existing references`,
  );
}

function assertExistingReferenceRoutingBridge(text, sourceLabel) {
  assertPointsToTemplates(text, sourceLabel);
  assert.match(text, /template[- ]source/i, `${sourceLabel} should mention template-source edits`);
  assert.match(
    text,
    /page-scoped wording[\s\S]{0,160}(?:not|mean)|page wording[\s\S]{0,120}(?:not|mean)|explicit local-only|do not default to `?copy`?|do not auto-detach|ask, not `?copy`?/i,
    `${sourceLabel} should keep the no-auto-copy bridge visible`,
  );
}

function assertExistingReferenceReadbackBridge(text, sourceLabel) {
  assertPointsToTemplates(text, sourceLabel);
  assert.match(text, /template[- ]source/i, `${sourceLabel} should keep template-source readback visible`);
}

function assertSkillKeepsTemplateRulesMinimal(text) {
  assertPointsToTemplates(text, 'SKILL.md');
  assertNoTemplateDecisionMatrix(text, 'SKILL.md');
  assert.match(text, /existing template reference/i, 'SKILL.md should keep the top-level existing-reference rule');
  assert.match(text, /template source/i, 'SKILL.md should keep template-source editing visible');
  assert.match(text, /host\/openView config edits local|host-local/i, 'SKILL.md should keep host-local boundary visible');
  assert.match(
    text,
    /page-scoped wording[\s\S]{0,160}(?:not local-only intent|mean local-only behavior)/i,
    'SKILL.md should say page-scoped wording is not enough for local-only routing',
  );
  assert.match(
    text,
    /clarify before writing|do not auto-detach/i,
    'SKILL.md should block automatic detach on unresolved existing-reference scope',
  );
  assert.doesNotMatch(text, /popup\.tryTemplate/i, 'SKILL.md should not restate popup.tryTemplate details');
  assert.doesNotMatch(text, /popup\.saveAsTemplate/i, 'SKILL.md should not restate popup.saveAsTemplate details');
  assert.doesNotMatch(text, /keyword-only search/i, 'SKILL.md should not restate template search heuristics');
  assert.doesNotMatch(text, /backend returned order|stable best-candidate/i, 'SKILL.md should not restate template ranking heuristics');
}

function assertSkillKeepsIntentFirst(text) {
  assert.match(text, /intent-first/i, 'SKILL.md should keep intent-first routing visible');
  assert.match(
    text,
    /whole-page authoring[\s\S]{0,160}`applyBlueprint`[\s\S]{0,120}\[whole-page-quick\.md\]/i,
    'SKILL.md should route whole-page authoring through applyBlueprint and whole-page-quick.md',
  );
  assert.match(
    text,
    /localized existing-surface edits[\s\S]{0,160}(?:low-level )?`flow-surfaces`[\s\S]{0,120}\[local-edit-quick\.md\]/i,
    'SKILL.md should route localized edits through low-level flow-surfaces commands and local-edit-quick.md',
  );
  assert.match(
    text,
    /reaction work[\s\S]{0,160}`get-reaction-meta`[\s\S]{0,120}`set\*Rules`[\s\S]{0,120}\[reaction-quick\.md\]/i,
    'SKILL.md should keep reaction work routing visible through reaction-quick.md',
  );
  assert.match(
    text,
    /partial-match or boundary-only requests[\s\S]{0,120}\[boundary-quick\.md\]/i,
    'SKILL.md should route boundary-only requests through boundary-quick.md',
  );
  assert.match(
    text,
    /After that route is clear[\s\S]{0,140}\[template-quick\.md\][\s\S]{0,120}\[templates\.md\]/i,
    'SKILL.md should route template-specific decisions through template-quick.md before templates.md',
  );
  assert.match(
    text,
    /Do not enumerate the skill directory just to rediscover docs/i,
    'SKILL.md should keep known-route tasks from re-enumerating the skill directory',
  );
  assert.match(
    text,
    /partial-match or handoff-only request[\s\S]{0,160}Do not inspect runtime, scripts, or helper docs/i,
    'SKILL.md should keep boundary-only tasks off runtime/script exploration',
  );
  assert.match(
    text,
    /Do not open \[tool-shapes\.md\][\s\S]{0,40}or \[helper-contracts\.md\][\s\S]{0,220}(real CLI body|prewrite gate|prepared write body)/i,
    'SKILL.md should keep tool-shapes and helper-contracts behind the real-write stage',
  );
  assert.doesNotMatch(text, /popup\.tryTemplate/i, 'SKILL.md intent-first rule should not absorb popup.tryTemplate details');
  assert.doesNotMatch(text, /popup\.saveAsTemplate/i, 'SKILL.md intent-first rule should not absorb popup.saveAsTemplate details');
}

function assertOpenAIGuardrails(text) {
  assert.match(
    text,
    /localized edits[\s\S]{0,80}(?:low-level )?`flow-surfaces`/i,
    'openai prompt should keep localized low-level flow-surfaces routing visible',
  );
  assert.match(text, /routeId/i, 'openai prompt should keep routeId guidance for existing groups');
  assert.match(
    text,
    /routeId[\s\S]{0,80}pageSchemaUid|never pass a desktop route id as `?target\.uid`?/i,
    'openai prompt should keep routeId-to-pageSchemaUid normalization visible',
  );
  assert.match(text, /field popup/i, 'openai prompt should keep field-popup guidance');
  assert.match(
    text,
    /associatedRecords(?:\+| \+ )associationField/i,
    'openai prompt should keep associatedRecords+associationField guidance',
  );
  assert.match(text, /(?:exactly )?one `?editForm`?/i, 'openai prompt should keep one-editForm guidance');
  assert.match(
    text,
    /repeat-eligible[\s\S]{0,80}(?:must|mandatory)[\s\S]{0,80}contextual `?list-templates`?/i,
    'openai prompt should require contextual template probing for repeat-eligible scenes',
  );
  assert.match(text, /keyword-only search[\s\S]{0,40}discovery-only/i, 'openai prompt should keep keyword-only guardrail');
  assert.match(
    text,
    /backend order|first compatible row|first result|first returned row/i,
    'openai prompt should keep backend-order tie-break guidance',
  );
  assert.match(text, /popup\.tryTemplate/i, 'openai prompt should mention popup.tryTemplate fallback');
  assert.match(text, /popup\.saveAsTemplate/i, 'openai prompt should mention popup.saveAsTemplate');
  assert.match(text, /openView\.tryTemplate|apply .*popup/i, 'openai prompt should mention existing-opener tryTemplate guidance');
  assert.match(text, /template source/i, 'openai prompt should mention template-source editing for existing references');
  assert.match(text, /local-only intent|local customization/i, 'openai prompt should mention explicit local-only intent before copy');
  assert.match(
    text,
    /page-scoped wording[\s\S]{0,80}not local-only intent|page wording[\s\S]{0,80}not local-only intent/i,
    'openai prompt should block page-scoped wording from implying local-only edits',
  );
  assert.match(
    text,
    /ask, not `?copy`?|unresolved scope[\s\S]{0,80}ask/i,
    'openai prompt should route unresolved existing-reference scope to clarification instead of copy',
  );
}

test('required docs and relative links stay valid', () => {
  const docs = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/ascii-preview.md',
    'references/boundary-quick.md',
    'references/chart-core.md',
    'references/cli-command-surface.md',
    'references/cli-transport.md',
    'references/execution-checklist.md',
    'references/helper-contracts.md',
    'references/index.md',
    'references/js.md',
    'references/js-reference-index.md',
    'references/local-edit-quick.md',
    'references/normative-contract.md',
    'references/page-archetypes.md',
    'references/page-blueprint.md',
    'references/page-intent.md',
    'references/popup.md',
    'references/reaction.md',
    'references/reaction-quick.md',
    'references/runjs-runtime.md',
    'references/runtime-playbook.md',
    'references/settings.md',
    'references/template-decision-summary.md',
    'references/template-quick.md',
    'references/templates.md',
    'references/tool-shapes.md',
    'references/transport-crosswalk.md',
    'references/verification.md',
    'references/whole-page-quick.md',
  ];

  for (const relativePath of docs) {
    assert.equal(existsSync(path.join(skillRoot, relativePath)), true, `${relativePath} should exist`);
    if (relativePath.endsWith('.md')) assertRelativeMarkdownLinksExist(relativePath);
  }
});

test('upstream js snapshot relative links stay valid', () => {
  for (const relativePath of walkMarkdownFiles('runtime/reference-assets/upstream-js')) {
    assertRelativeMarkdownLinksExist(relativePath);
    assertNoRootRelativeMarkdownLinks(relativePath);
  }
});

test('docs keep canonical CLI-first envelope boundaries', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /Canonical transport is `nocobase-ctl flow-surfaces`/);
  assert.match(skill, /nocobase-ctl flow-surfaces apply-blueprint/);
  assert.match(skill, /nocobase-ctl flow-surfaces get-reaction-meta/);
  assert.match(skill, /prepare-write/i);
  assert.doesNotMatch(skill, /flow_surfaces_apply_blueprint\.requestBody/);
  assert.doesNotMatch(skill, /normalized \{ requestBody: <blueprint> \}/i);

  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(pageBlueprint, /Canonical front door is `nocobase-ctl flow-surfaces apply-blueprint`/);
  assert.match(pageBlueprint, /raw JSON body|raw JSON request body|CLI raw body/i);
  assert.match(pageBlueprint, /Only in MCP fallback should that same object be wrapped under `requestBody`/i);

  const toolShapes = read('references/tool-shapes.md');
  assert.match(toolShapes, /Only in MCP fallback should that same business object be wrapped under `requestBody`/i);
  assert.match(toolShapes, /`nocobase-ctl flow-surfaces get` is the common exception: it uses top-level locator flags and no JSON body/i);

  const asciiPreview = read('references/ascii-preview.md');
  assert.match(asciiPreview, /\{ requestBody, templateDecision \}/i);
  assert.match(asciiPreview, /normalized `templateDecision`/i);
  assert.doesNotMatch(asciiPreview, /return the normalized \{ requestBody: <blueprint> \} tool-call envelope/i);
});

test('js reference routing keeps snapshot-vs-skill boundary clear', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /\[js-reference-index\.md\]/i, 'SKILL.md should expose the JS snapshot bridge');

  const js = read('references/js.md');
  assert.match(js, /\[js-reference-index\.md\]/i, 'references/js.md should route capability lookup to js-reference-index.md');
  assert.match(js, /Upstream snapshot|Source-doc snapshot/i, 'references/js.md should describe the upstream snapshot layer');
  assert.match(js, /\[reaction\.md\]/i, 'references/js.md should point reaction work back to reaction.md');

  const index = read('references/js-reference-index.md');
  assert.match(index, /upstream snapshot/i, 'js-reference-index should describe the snapshot layer');
  assert.match(index, /does \*\*not\*\* replace the skill write contract|does not replace the skill write contract/i);
  assert.match(index, /\[js\.md\]/i, 'js-reference-index should route model/validator work back to js.md');
  assert.match(index, /\[runjs-runtime\.md\]/i, 'js-reference-index should route runtime validation back to runjs-runtime.md');
  assert.match(index, /\[reaction\.md\]/i, 'js-reference-index should route linkage writes back to reaction.md');
  assert.match(index, /Execute JavaScript/i, 'js-reference-index should cover event-flow Execute JavaScript');
  assert.match(index, /ctx\.\*/i, 'js-reference-index should expose ctx API routing');
});

test('key upstream js snapshot pages route back to skill contracts', () => {
  const eventFlow = read('runtime/reference-assets/upstream-js/interface-builder/event-flow.md');
  assert.match(eventFlow, /settings\.md/i, 'event-flow snapshot should route writes back to settings.md');
  assert.match(eventFlow, /set-event-flows/i, 'event-flow snapshot should mention set-event-flows');
  assert.match(eventFlow, /js\.md/i, 'event-flow snapshot should keep JS validator boundary visible');

  for (const relativePath of [
    'runtime/reference-assets/upstream-js/interface-builder/linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/blocks/block-settings/field-linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/blocks/block-settings/block-linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/actions/action-settings/linkage-rule.md',
  ]) {
    const text = read(relativePath);
    assert.match(text, /reaction\.md/i, `${relativePath} should route writes back to reaction.md`);
    assert.match(text, /js\.md/i, `${relativePath} should keep JS validator boundary visible`);
  }

  const openView = read('runtime/reference-assets/upstream-js/runjs/context/open-view.md');
  assert.match(openView, /skill-mode validator/i, 'open-view snapshot should mention skill-mode validator boundary');
  assert.match(openView, /do not|不要|不接受/i, 'open-view snapshot should explicitly warn against direct final output');
  assert.match(openView, /ctx\.openView\(\.\.\.\)|ctx\.openView/i, 'open-view snapshot should keep the warned API explicit');
  assert.match(openView, /js-reference-index\.md/i, 'open-view snapshot should route back to js-reference-index.md');
  assert.match(openView, /js\.md/i, 'open-view snapshot should route back to js.md');

  const requestDoc = read('runtime/reference-assets/upstream-js/runjs/context/request.md');
  assert.match(requestDoc, /http\/https/i, 'request snapshot should mention http/https guardrail for skill-mode');
  assert.match(requestDoc, /ctx\.initResource|ctx\.makeResource/i, 'request snapshot should redirect NocoBase resource access to resource APIs');
});

test('canonical patched JS examples satisfy skill-mode minimum contracts', () => {
  const jsBlock = read('runtime/reference-assets/upstream-js/interface-builder/blocks/other-blocks/js-block.md');
  validateRunjsSnippet('JSBlockModel', extractFirstJsFenceAfterHeading(jsBlock, '2) API Request Template'));
  validateRunjsSnippet('JSBlockModel', extractFirstJsFenceAfterHeading(jsBlock, '4) Skill-mode Feedback'));

  const jsField = read('runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-field.md');
  validateRunjsSnippet('JSFieldModel', extractFirstJsFenceAfterHeading(jsField, '1) Basic Rendering (Reading Field Value)'));

  const jsAction = read('runtime/reference-assets/upstream-js/interface-builder/actions/types/js-action.md');
  validateRunjsSnippet('JSActionModel', extractFirstJsFenceAfterHeading(jsAction, '1) API Request and Feedback'));
});

test('event-flow JS write contract stays discoverable across routing docs', () => {
  const cli = read('references/cli-command-surface.md');
  assert.match(cli, /set-event-flows/i, 'cli-command-surface should route event-flow replacement to set-event-flows');

  const runtime = read('references/runtime-playbook.md');
  assert.match(runtime, /set-event-flows/i, 'runtime-playbook should route event-flow replacement to set-event-flows');
  assert.match(
    runtime,
    /desktop-route `?id`?[\s\S]{0,80}not flow-surface `?uid`?|not flow-surface `?uid`?/i,
    'runtime-playbook should keep route ids separate from flow-surface uids',
  );
  assert.match(
    runtime,
    /pageSchemaUid[\s\S]{0,160}(catalog|context|get-reaction-meta|compose|configure|add\*|remove\*)/i,
    'runtime-playbook should require pageSchemaUid/live uid normalization before localized follow-up reads and writes',
  );

  const crosswalk = read('references/transport-crosswalk.md');
  assert.match(crosswalk, /flow_surfaces_set_event_flows/i, 'transport-crosswalk should expose MCP fallback for set-event-flows');

  const settings = read('references/settings.md');
  assert.match(settings, /Event-flow Replacement/i, 'settings.md should document event-flow replacement explicitly');
  assert.match(settings, /flowRegistry/i, 'settings.md should describe flowRegistry shape');
  assert.match(settings, /params\.code/i, 'settings.md should explain how Execute JavaScript code is written back');
  assert.match(settings, /\[js\.md\]/i, 'settings.md should route JS validation back to js.md');

  const shapes = read('references/tool-shapes.md');
  assert.match(shapes, /### `set-event-flows`/i, 'tool-shapes should contain a set-event-flows section');
  assert.match(shapes, /flowRegistry/i, 'tool-shapes should show flowRegistry body shape');
  assert.match(shapes, /params\.code/i, 'tool-shapes should mention Execute JavaScript step code location');
});

test('template selection stays centralized and prompt keeps minimum guardrails', () => {
  const skill = read('SKILL.md');
  assertSkillKeepsIntentFirst(skill);
  assert.match(skill, /read \[template-quick\.md\].*\[templates\.md\].*full decision matrix/i);
  assertSkillKeepsTemplateRulesMinimal(skill);

  const templates = read('references/templates.md');
  assertTemplateDocMinimumContract(templates, 'references/templates.md');
  assertContextualTemplateProbeGuardrails(templates, 'references/templates.md');
  assertTryTemplateWriteFallback(templates, 'references/templates.md');
  assertSaveAsTemplateWritePath(templates, 'references/templates.md');
  assertExistingReferenceEditMatrix(templates, 'references/templates.md');

  for (const relativePath of [
    'references/execution-checklist.md',
    'references/page-blueprint.md',
    'references/page-intent.md',
    'references/popup.md',
    'references/tool-shapes.md',
    'references/template-decision-summary.md',
  ]) {
    const text = read(relativePath);
    assertPointsToTemplates(text, relativePath);
    assertNoTemplateDecisionMatrix(text, relativePath);
    if (relativePath !== 'references/template-decision-summary.md') {
      assertContextualTemplateProbeGuardrails(text, relativePath);
    }
    if (relativePath !== 'references/template-decision-summary.md') {
      assertTryTemplateWriteFallback(text, relativePath);
      assertSaveAsTemplateWritePath(text, relativePath);
    }
  }

  const templateDecisionSummary = read('references/template-decision-summary.md');
  assert.match(templateDecisionSummary, /current template decision/i);
  assert.match(templateDecisionSummary, /entire page/i);

  const verification = read('references/verification.md');
  assertNoTemplateDecisionMatrix(verification, 'references/verification.md');
  assert.match(verification, /\[template-decision-summary\.md\]/i);
  assertExistingReferenceReadbackBridge(verification, 'references/verification.md');
  assert.match(
    verification,
    /desktop-route `?id`?[\s\S]{0,120}schemaUid[\s\S]{0,120}pageSchemaUid/i,
    'verification should map menu-tree ids to routeId context and schemaUid/pageSchemaUid for page readback',
  );

  for (const relativePath of [
    'references/execution-checklist.md',
    'references/popup.md',
    'references/runtime-playbook.md',
  ]) {
    assertExistingReferenceRoutingBridge(read(relativePath), relativePath);
  }

  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.match(defaultPrompt, /Canonical front door: `nocobase-ctl flow-surfaces`/);
  assert.match(defaultPrompt, /Intent-first/i);
  assert.match(defaultPrompt, /Repeat-eligible scenes/i);
  assert.match(defaultPrompt, /local customization/i);
  assert.match(defaultPrompt, /apply-blueprint/);
  assert.match(defaultPrompt, /get-reaction-meta/);
  assertOpenAIGuardrails(defaultPrompt);
  assert.ok(defaultPrompt.length <= 890, 'openai default_prompt should stay at or below 890 chars');
});

test('quick route docs stay discoverable and point to the deeper references', () => {
  const index = read('references/index.md');
  for (const relativePath of [
    'references/whole-page-quick.md',
    'references/local-edit-quick.md',
    'references/reaction-quick.md',
    'references/boundary-quick.md',
    'references/template-quick.md',
    'references/helper-contracts.md',
  ]) {
    assert.match(index, new RegExp(path.basename(relativePath).replace(/\./g, '\\.'), 'i'), `${relativePath} should be listed in references/index.md`);
    assertRelativeMarkdownLinksExist(relativePath);
  }
  assert.doesNotMatch(index, /## Full References/i, 'references/index.md should avoid dumping the whole reference tree up front');

  const wholePageQuick = read('references/whole-page-quick.md');
  assert.match(wholePageQuick, /\[page-blueprint\.md\]/i);
  assert.match(wholePageQuick, /\[helper-contracts\.md\]/i);
  assert.match(wholePageQuick, /\[template-quick\.md\]/i);
  assert.match(wholePageQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(wholePageQuick, /blueprint\.json/i);
  assert.match(wholePageQuick, /prewrite-preview\.txt/i);
  assert.match(wholePageQuick, /readback-checklist\.md/i);
  assert.match(
    wholePageQuick,
    /artifact-only tasks|normal local drafting|do not enumerate the skill directory/i,
    'whole-page-quick should keep common-case drafting on the quick route',
  );
  assert.match(
    wholePageQuick,
    /helper-contracts[\s\S]{0,120}(real write|prewrite gate)/i,
    'whole-page-quick should keep helper-contracts behind real-write or prewrite-gate needs',
  );
  assert.match(
    wholePageQuick,
    /Complex Whole-page Guardrails|complex whole-page/i,
    'whole-page-quick should describe complex pages as guardrails, not as a separate route',
  );
  assert.match(
    wholePageQuick,
    /one `applyBlueprint`|same blueprint[\s\S]{0,120}reaction\.items\[\]/i,
    'whole-page-quick should prefer one whole-page blueprint that keeps structure and reactions together',
  );
  assert.match(
    wholePageQuick,
    /explicit `key`|same-run public path|string block key/i,
    'whole-page-quick should require stable keys and public paths for complex whole-page requests',
  );
  assert.match(
    wholePageQuick,
    /target[\s\S]{0,160}same-blueprint table key|string block key/i,
    'whole-page-quick should keep filter-form bindings on public same-blueprint target keys',
  );
  assert.match(
    wholePageQuick,
    /prove[s]? the public whole-page contract cannot satisfy|public whole-page contract cannot satisfy/i,
    'whole-page-quick should keep low-level fallback behind a verified whole-page contract gap',
  );
  assert.match(
    wholePageQuick,
    /routeId[\s\S]{0,120}pageSchemaUid[\s\S]{0,260}never pass a desktop-route `?id`? as `?target\.uid`?/i,
    'whole-page-quick should normalize route ids into pageSchemaUid/live uid before follow-up writes',
  );

  const localEditQuick = read('references/local-edit-quick.md');
  assert.match(localEditQuick, /\[runtime-playbook\.md\]/i);
  assert.match(localEditQuick, /\[reaction-quick\.md\]/i);
  assert.match(localEditQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(localEditQuick, /mutation-plan\.json/i);
  assert.match(localEditQuick, /readback-checklist\.md/i);

  const reactionQuick = read('references/reaction-quick.md');
  assert.match(reactionQuick, /get-reaction-meta/i);
  assert.match(reactionQuick, /\[reaction\.md\]/i);
  assert.match(reactionQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(
    reactionQuick,
    /artifact-only localized reaction drafting|do not enumerate the skill directory/i,
    'reaction-quick should keep common artifact-only localized work on the quick route',
  );
  assert.match(
    reactionQuick,
    /reaction-plan\.json/i,
    'reaction-quick should name the JSON artifact directly',
  );
  assert.match(
    reactionQuick,
    /readback-checklist\.md/i,
    'reaction-quick should name the markdown checklist artifact directly',
  );
  assert.match(
    reactionQuick,
    /do not scan the current workspace|do not scan the current workspace or existing `?\.artifacts`?/i,
    'reaction-quick should avoid workspace and artifact scans for common drafting tasks',
  );
  assert.match(
    reactionQuick,
    /do not open \[reaction\.md\][\s\S]{0,140}(payload uncertainty|common `fieldValue` \/ `fieldLinkage` work)/i,
    'reaction-quick should keep reaction.md behind real payload uncertainty',
  );
  assert.match(
    reactionQuick,
    /do not open upstream-js snapshot docs|upstream-js snapshot docs/i,
    'reaction-quick should keep upstream-js snapshots out of ordinary localized reaction drafting',
  );
  assert.match(
    reactionQuick,
    /Whole-page-first rule|for whole-page create \/ replace, prefer top-level `?reaction\.items\[\]`?/i,
    'reaction-quick should treat first-pass whole-page reactions as the default route',
  );
  assert.match(
    reactionQuick,
    /value"\s*:\s*\{\s*"source"\s*:\s*"literal"/i,
    'reaction-quick should keep static default-value examples on literal source objects',
  );
  assert.match(
    reactionQuick,
    /existing live page[\s\S]{0,240}get-reaction-meta/i,
    'reaction-quick should require concrete live action targets before action guards',
  );

  const pageArchetypes = read('references/page-archetypes.md');
  assert.match(pageArchetypes, /Multi-Workbench Whole-page/i);
  assert.match(
    pageArchetypes,
    /same whole-page route|pattern, not a separate staged workflow/i,
    'page-archetypes should keep richer multi-workbench pages on the same whole-page route',
  );
  assert.match(
    pageArchetypes,
    /top-level `?reaction\.items\[\]`?/i,
    'page-archetypes should keep reactions in the same whole-page blueprint',
  );

  const filterForm = read('references/blocks/filter-form.md');
  assert.match(filterForm, /whole-page 默认配方/i);
  assert.match(filterForm, /Localized low-level 配方/i);
  assert.match(filterForm, /target: "<table-key>"|`target`/i);
  assert.match(filterForm, /字符串 block key|string block key/i);
  assert.match(filterForm, /defaultTargetUid/i);
  assert.match(filterForm, /same-run key|same-blueprint table/i);
  assert.match(filterForm, /FilterFormSubmitActionModel/i);
  assert.match(filterForm, /FilterFormResetActionModel/i);
  assert.match(filterForm, /filterManager/i);
  assert.match(filterForm, /public whole-page contract|能力不足时如何降级/i);
  assert.match(
    filterForm,
    /自动补齐|归一化|canonical/i,
    'filter-form should describe canonicalized filterManager wiring for stable same-run targets',
  );

  const boundaryQuick = read('references/boundary-quick.md');
  assert.match(boundaryQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(boundaryQuick, /boundary-report\.md/i);
  assert.match(boundaryQuick, /Do not inspect runtime, scripts, helper docs, or a live workspace/i);
  assert.match(boundaryQuick, /nocobase-acl-manage/i);
  assert.match(boundaryQuick, /nocobase-data-modeling/i);
  assert.match(boundaryQuick, /nocobase-workflow-manage/i);

  const templateQuick = read('references/template-quick.md');
  assert.match(templateQuick, /\[templates\.md\]/i);
  assert.match(templateQuick, /page-scoped wording/i);

  const helperContracts = read('references/helper-contracts.md');
  assert.match(helperContracts, /real write|prewrite-validation/i);
  assert.match(helperContracts, /common-case drafting|not the default first stop/i);
  assert.match(helperContracts, /prepare-write/i);
  assert.match(helperContracts, /prepareApplyBlueprintRequest/i);
  assert.match(helperContracts, /nb-runjs/i);
});

test('general skill docs stay env-neutral while helper scripts avoid fixed local server defaults', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/boundary-quick.md',
    'references/verification.md',
    'references/whole-page-quick.md',
    'references/reaction-quick.md',
    'references/reaction.md',
    'references/js-models/js-item.md',
  ]) {
    assertFileDoesNotContain(relativePath, /nblocal/i, `${relativePath} should not bind the general skill to nblocal`);
  }

  for (const relativePath of [
    'SKILL.md',
    'references/boundary-quick.md',
    'references/reaction-quick.md',
    'references/verification.md',
    'references/whole-page-quick.md',
  ]) {
    assertFileDoesNotContain(
      relativePath,
      /runtime\/benchmarks\/real-build|\.artifacts\/nocobase-ui-builder-real-build|real-build benchmark/i,
      `${relativePath} should not depend on the private real-build benchmark pack`,
    );
  }

  for (const relativePath of [
    'scripts/rest_template_clone_runner.mjs',
    'scripts/live_template_catalog.mjs',
    'scripts/validation_browser_smoke.mjs',
  ]) {
    assertFileDoesNotContain(
      relativePath,
      /127\.0\.0\.1:23000/,
      `${relativePath} should require explicit runtime URL input instead of using a fixed localhost default`,
    );
  }
});
