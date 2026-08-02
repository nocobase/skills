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

test('discovers the versioned delta capability before Workspace authoring', () => {
  const workspace = read('references/runjs-workspace-source.md');
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');

  for (const [label, text] of [
    ['workspace source', workspace],
    ['default prompt', prompt],
  ]) {
    assert.match(text, /run-js-sources capabilities -j/i, `${label} should discover capabilities`);
    assert.match(text, /authoringContractVersion/i, `${label} should record the contract version`);
  }
  assert.match(workspace, /saveMode:\s*"delta"/i);
  assert.match(workspace, /only changed paths/i);
  assert.match(workspace, /Omitted paths remain unchanged/i);
  assert.match(workspace, /deletion is explicit/i);
});

test('routes capability-backed render and action owners through the Inline Workspace', () => {
  const index = read('references/js-surfaces/index.md');
  const render = read('references/js-surfaces/js-model-render.md');
  const action = read('references/js-surfaces/js-model-action.md');

  assert.match(index, /Every complete JS Model declared by `run-js-sources capabilities`/i);
  assert.match(index, /Host -> canonical locator -> Inline Workspace/i);
  assert.match(render, /complete render Model declared by `run-js-sources capabilities`/i);
  assert.match(render, /Inline Workspace/i);
  assert.match(render, /placement does not make it embedded/i);
  assert.match(action, /complete action-family Model declared by `run-js-sources capabilities`/i);
  assert.match(action, /Inline Workspace/i);
  assert.match(action, /placement does not make it embedded/i);
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
    assert.match(text, /(?:capability|contract support)/i, `${label} should require capability support`);
    assert.match(text, /(?:canonical )?locator/i, `${label} should require a locator`);
    assert.match(text, /\bstop(?: condition)?\b/i, `${label} should stop when required evidence is missing`);
  }
  for (const fallback of ['`settings.code`', 'ordinary JS Block', 'another Surface', 'Light Extension']) {
    assert.match(gate, new RegExp(fallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('embedded owners stay single-surface and multi-file structure never selects Light Extension', () => {
  const js = read('references/js.md');
  const workspace = read('references/runjs-workspace-source.md');
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');

  assert.match(js, /`embedded\/single-surface`/i);
  assert.match(js, /owner is not declared by the complete Workspace contract/i);
  assert.match(prompt, /Embedded.*stays single-surface/i);
  assert.match(workspace, /Multiple files/i);
  assert.match(workspace, /never trigger Light Extension/i);
  assert.match(workspace, /do not silently externalize/i);
  assert.match(prompt, /Multiple files/i);
  assert.match(prompt, /do not trigger Light Extension/i);
});
