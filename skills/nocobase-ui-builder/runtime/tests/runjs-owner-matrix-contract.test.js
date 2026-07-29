import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { readYamlScalar } from './helpers/yaml-scalar.js';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function parseCodeValuesAfterPrefix(text, prefix) {
  const line = text.split('\n').find((candidate) => candidate.startsWith(prefix));
  assert.ok(line, `should find ${prefix}`);
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

test('versioned capability guidance carries a consistent owner and model-use matrix', () => {
  const workspace = read('references/runjs-workspace-source.md');
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');
  const ownerKinds = parseCodeValuesAfterPrefix(workspace, '- owner kinds:');
  const modelUses = parseCodeValuesAfterPrefix(workspace, '- model uses:');

  assert.match(workspace, /run-js-sources capabilities -j/i);
  assert.match(workspace, /authoringContractVersion/i);
  assert.match(workspace, /saveMode:\s*"delta"/i);
  assert.match(workspace, /supportsMaterialize:\s*true/i);
  assert.ok(ownerKinds.length > 0, 'workspace guidance should document owner kinds');
  assert.ok(modelUses.length > 0, 'workspace guidance should document model uses');
  assert.equal(new Set(ownerKinds).size, ownerKinds.length, 'owner kinds should not contain duplicates');
  assert.equal(new Set(modelUses).size, modelUses.length, 'model uses should not contain duplicates');
  assert.equal(modelUses.includes('FormJSFieldItemModel'), false, 'menu-only pseudo Host must not be in Contract v1');
  assert.equal(modelUses.includes('JSEditableFieldModel'), true, 'form JS renderer should use JSEditableFieldModel');

  const promptMatrix = prompt.match(/Capability-backed ([\s\S]*?) all use Host -> canonical locator -> Inline Workspace/i)?.[1];
  assert.ok(promptMatrix, 'default prompt should publish one complete capability-backed model-use list');
  assert.deepEqual(promptMatrix.match(/\b[A-Z][A-Za-z]+Model\b/g), modelUses);
  assert.doesNotMatch(prompt, /FormJSFieldItemModel/);
});

test('documented broad owner mapping covers every complete model use exactly once', () => {
  const workspace = read('references/runjs-workspace-source.md');
  const ownerKinds = parseCodeValuesAfterPrefix(workspace, '- owner kinds:');
  const modelUses = parseCodeValuesAfterPrefix(workspace, '- model uses:');
  const tableRows = [...workspace.matchAll(/^\| `(js-[^`]+)` \| ([^\n]+) \|$/gm)];
  const parsed = Object.fromEntries(
    tableRows.map(([, ownerKind, cell]) => [ownerKind, [...cell.matchAll(/`([^`]+Model)`/g)].map((match) => match[1])]),
  );

  assert.deepEqual(Object.keys(parsed).sort(), [...ownerKinds].sort());
  assert.deepEqual(Object.values(parsed).flat().sort(), [...modelUses].sort());
  assert.equal(new Set(Object.values(parsed).flat()).size, modelUses.length, 'each documented model use should appear once');
});

test('all complete render and action models share Host locator and Workspace routing', () => {
  const js = read('references/js.md');
  const index = read('references/js-surfaces/index.md');
  const render = read('references/js-surfaces/js-model-render.md');
  const action = read('references/js-surfaces/js-model-action.md');

  assert.match(js, /complete JS Page, Block, Field, Editable Field, Column, Item, Item Action, and action-family Models/i);
  assert.match(index, /every complete JS Model[\s\S]{0,160}Host -> canonical locator -> Inline Workspace/i);
  assert.match(render, /every complete render Model[\s\S]{0,200}open -> Settings Pass -> save-changes/i);
  assert.match(action, /complete action-family Model[\s\S]{0,220}open -> Settings Pass -> save-changes/i);
  assert.match(render, /field\/item\/column placement does not make it embedded/i);
  assert.match(action, /action placement does not make it embedded/i);
  assert.doesNotMatch(js, /FormJSFieldItemModel/);
  assert.doesNotMatch(render, /FormJSFieldItemModel/);
  assert.match(js, /form\/createForm\/editForm[\s\S]{0,80}`JSEditableFieldModel`/i);
});

test('explicit multi-file intent stops instead of downgrading or externalizing', () => {
  const skill = read('SKILL.md');
  const workspace = read('references/runjs-workspace-source.md');
  const gate = read('references/runjs-capability-gate.md');

  for (const [label, text] of [
    ['SKILL.md', skill],
    ['workspace source', workspace],
    ['capability gate', gate],
  ]) {
    assert.match(text, /explicit(?:ly)? (?:requested|requests?) (?:multiple files|multi-file)/i, `${label} should recognize explicit multi-file intent`);
    assert.match(text, /(?:missing[\s\S]{0,120}(?:capability|contract support)|(?:capability|contract support)[\s\S]{0,120}missing)[\s\S]{0,220}(?:stop|stop condition)/i, `${label} should stop on missing capability`);
    assert.match(text, /(?:missing[\s\S]{0,80})?(?:canonical )?locator[\s\S]{0,220}(?:stop|stop condition)/i, `${label} should stop on missing locator`);
  }
  assert.match(gate, /never[\s\S]{0,160}`settings\.code`[\s\S]{0,160}ordinary JS Block[\s\S]{0,160}another Surface[\s\S]{0,160}Light Extension/i);
});

test('embedded owners stay single-surface and multi-file structure never selects Light Extension', () => {
  const js = read('references/js.md');
  const workspace = read('references/runjs-workspace-source.md');
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');

  for (const token of ['default', 'linkage', 'workflow', 'chart', 'flowRegistry']) {
    assert.match(js, new RegExp(`\\b${token}\\b`, 'i'), `JS routing should keep ${token} embedded`);
    assert.match(prompt, new RegExp(`\\b${token}\\b`, 'i'), `default prompt should keep ${token} embedded`);
  }
  assert.match(workspace, /multiple files[\s\S]{0,240}do not silently externalize|do not silently externalize[\s\S]{0,240}multiple files/i);
  assert.match(prompt, /Multiple files[\s\S]{0,180}do not trigger Light Extension/i);
});
