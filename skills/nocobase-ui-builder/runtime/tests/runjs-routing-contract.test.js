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

test('global contract splits Host, Inline source, and externalized source routes', () => {
  const skill = read('SKILL.md');
  const normative = read('references/normative-contract.md');
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');

  for (const [label, text] of [
    ['SKILL.md', skill],
    ['normative contract', normative],
    ['OpenAI prompt', prompt],
  ]) {
    assert.match(text, /flow-surfaces/i, `${label} should retain the Host/UI route`);
    assert.match(text, /run-js-sources/i, `${label} should expose the Inline source route`);
    assert.match(text, /Light Extension|nb light/i, `${label} should expose reusable source routing`);
  }

  assert.doesNotMatch(skill, /Agent-facing write path is `nb api flow-surfaces <action>`/);
  assert.doesNotMatch(skill, /For nb writes, use `nb api flow-surfaces <action>`/);
  assert.doesNotMatch(normative, /Agent-facing write path: `nb api flow-surfaces <action>`/);
});

test('real default prompt carries the complete RunJS route without relying on YAML comments', () => {
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');

  for (const token of [
    'flow-surfaces',
    'run-js-sources capabilities -j',
    'authoringContractVersion',
    'ownerKinds/modelUses/saveMode',
    'canonical runJSLocator',
    'Settings Pass',
    'save-changes',
    'Omitted paths remain unchanged',
    'explicit delete',
    'server-managed',
    'expectedBlobHash',
    'RUNJS_FILE_CONFLICT',
    'BASE_COMMIT_OUTDATED',
    'Host Preview',
  ]) {
    assert.match(prompt, new RegExp(token.replaceAll(/[.[\]]/g, '\\$&'), 'i'));
  }

  assert.match(prompt, /Multiple files[\s\S]{0,180}do not trigger Light Extension/i);
  assert.match(prompt, /explicit multi-file intent[\s\S]{0,220}never downgrade/i);
  assert.match(prompt, /JS Page capability failure[\s\S]{0,120}never fake/i);
  assert.match(prompt, /complete JS Block[\s\S]{0,240}minimal safe `?settings\.code`? placeholder[\s\S]{0,240}final business source[\s\S]{0,120}Workspace/i);
  assert.match(prompt, /save-changes success[\s\S]{0,200}new commit and owner fingerprint/i);
});

test('business reuse intent selects Light Extension without requiring transport terminology', () => {
  const skill = read('SKILL.md');
  const source = read('references/light-extension-source.md');
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');

  for (const [label, text] of [
    ['SKILL.md', skill],
    ['Light Extension intent router', source],
    ['OpenAI prompt', prompt],
  ]) {
    assert.match(text, /one implementation[\s\S]{0,180}(?:multiple|across) Hosts/i, label);
    assert.match(text, /maintain(?:ed)? once[\s\S]{0,100}(?:without|no) copied code/i, label);
    assert.match(text, /independent(?:ly)? Git[- ]owned|independent Git ownership/i, label);
    assert.match(text, /user (?:does not|need not)[\s\S]{0,160}(?:Light Extension|transport)/i, label);
  }

  assert.match(source, /used only by its current Host stays Inline/i);
  assert.match(prompt, /Current-Host[\s\S]{0,80}stays Inline/i);
  assert.match(prompt, /Multiple files[\s\S]{0,160}do not trigger Light Extension/i);
});

test('transport serializes the Host-returned locator without teaching a hand-shaped locator', () => {
  const transport = read('references/runjs-transport.md');

  assert.match(transport, /exact[\s\S]{0,80}`data\.runJSLocator` object returned by Host create\/get/i);
  assert.match(transport, /exact serialized `data\.locator`/i);
  assert.doesNotMatch(transport, /"locator"\s*:\s*\{/i);
  assert.doesNotMatch(transport, /"flowKey"|"stepKey"|"paramPath"/i);
});

test('default prompt extraction ignores comments outside the scalar', () => {
  const prompt = readYamlScalar(
    [
      'interface:',
      '  default_prompt: |-',
      '    Real prompt without the route.',
      '# save-changes RUNJS_FILE_CONFLICT server-managed canonical runJSLocator',
    ].join('\n'),
    'default_prompt',
  );

  assert.equal(prompt, 'Real prompt without the route.');
  assert.doesNotMatch(prompt, /save-changes|RUNJS_FILE_CONFLICT|server-managed|runJSLocator/);
});

test('complete Workspace errors repair source without switching to single-file code', () => {
  const skill = read('SKILL.md');
  const normative = read('references/normative-contract.md');

  assert.match(skill, /complete Workspace[\s\S]{0,260}repair the changed source files[\s\S]{0,260}do not switch to `settings\.code`/i);
  assert.match(normative, /Complete Inline Workspace JS writes[\s\S]{0,260}run-js-sources[\s\S]{0,260}without falling back to `settings\.code`/i);
  assert.match(skill, /embedded[\s\S]{0,180}single-file[\s\S]{0,220}`settings\.code`/i);
});

test('helpers and verification expose source-specific evidence', () => {
  const helpers = read('references/helper-contracts.md');
  const verification = read('references/verification.md');

  assert.match(helpers, /Host\/UI write path:[\s\S]{0,120}flow-surfaces/i);
  assert.match(helpers, /Inline Workspace source write path:[\s\S]{0,120}run-js-sources/i);
  assert.match(verification, /run-js-sources open` succeeded/i);
  assert.match(verification, /save-changes` succeeded/i);
  assert.match(verification, /no diagnostic with `severity: "error"`/i);
  assert.match(verification, /new commit, `artifact\.filesHash`, and the updated owner fingerprint/i);
  assert.match(verification, /no Light Extension Repository was automatically created/i);
  assert.match(verification, /Host Preview is not required/i);
});
