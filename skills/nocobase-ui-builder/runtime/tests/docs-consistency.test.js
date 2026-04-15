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

function assertOpenAIGuardrails(text) {
  assert.match(text, /routeId/i, 'openai prompt should keep routeId guidance for existing groups');
  assert.match(text, /field popup/i, 'openai prompt should keep field-popup guidance');
  assert.match(
    text,
    /associatedRecords(?:\+| \+ )associationField/i,
    'openai prompt should keep associatedRecords+associationField guidance',
  );
  assert.match(text, /(?:exactly )?one `?editForm`?/i, 'openai prompt should keep one-editForm guidance');
}

test('required docs and relative links stay valid', () => {
  const docs = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/ascii-preview.md',
    'references/chart-core.md',
    'references/cli-command-surface.md',
    'references/cli-transport.md',
    'references/execution-checklist.md',
    'references/normative-contract.md',
    'references/page-archetypes.md',
    'references/page-blueprint.md',
    'references/page-intent.md',
    'references/popup.md',
    'references/reaction.md',
    'references/runtime-playbook.md',
    'references/settings.md',
    'references/template-decision-summary.md',
    'references/templates.md',
    'references/tool-shapes.md',
    'references/transport-crosswalk.md',
    'references/verification.md',
  ];

  for (const relativePath of docs) {
    assert.equal(existsSync(path.join(skillRoot, relativePath)), true, `${relativePath} should exist`);
    if (relativePath.endsWith('.md')) assertRelativeMarkdownLinksExist(relativePath);
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

test('template selection stays centralized and prompt keeps minimum guardrails', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /read \[templates\.md\].*before deciding inline vs template/i);

  const templates = read('references/templates.md');
  assertTemplateDocMinimumContract(templates, 'references/templates.md');

  for (const relativePath of [
    'references/execution-checklist.md',
    'references/page-intent.md',
    'references/popup.md',
    'references/template-decision-summary.md',
  ]) {
    const text = read(relativePath);
    assertPointsToTemplates(text, relativePath);
    assertNoTemplateDecisionMatrix(text, relativePath);
  }

  const templateDecisionSummary = read('references/template-decision-summary.md');
  assert.match(templateDecisionSummary, /current template decision/i);
  assert.match(templateDecisionSummary, /entire page/i);

  const verification = read('references/verification.md');
  assertNoTemplateDecisionMatrix(verification, 'references/verification.md');
  assert.match(verification, /\[template-decision-summary\.md\]/i);

  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.match(defaultPrompt, /Canonical front door: `nocobase-ctl flow-surfaces`/);
  assert.match(defaultPrompt, /Intent-first routing/i);
  assert.match(defaultPrompt, /structure-repeat-first/i);
  assert.match(defaultPrompt, /final tie/i);
  assert.match(defaultPrompt, /local customization/i);
  assert.match(defaultPrompt, /apply-blueprint/);
  assert.match(defaultPrompt, /get-reaction-meta/);
  assertOpenAIGuardrails(defaultPrompt);
  assert.ok(defaultPrompt.length <= 890, 'openai default_prompt should stay at or below 890 chars');
});
