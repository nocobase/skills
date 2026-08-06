import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseMarkedJson } from './helpers/js-template-contract.js';
import { readYamlScalar } from './helpers/yaml-scalar.js';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

test('global contract splits Host, Inline source, and reusable JS Template routes', () => {
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
    assert.match(text, /JS Template/i, `${label} should expose reusable source routing`);
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

  assert.match(prompt, /Multiple files[\s\S]{0,180}do not trigger JS Template/i);
  assert.match(prompt, /explicit multi-file intent[\s\S]{0,220}never downgrade/i);
  assert.match(prompt, /JS Page capability failure[\s\S]{0,120}never fake/i);
  assert.match(prompt, /complete JS Block[\s\S]{0,240}minimal safe `?settings\.code`? placeholder[\s\S]{0,240}final business source[\s\S]{0,120}Workspace/i);
  assert.match(prompt, /Inline:[\s\S]{0,100}save-changes succeeds[\s\S]{0,160}new commit and owner fingerprint/i);
});

test('business reuse intent selects JS Template without requiring transport terminology', () => {
  const skill = read('SKILL.md');
  const source = read('references/js-template-source.md');
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');

  for (const [label, text] of [
    ['SKILL.md', skill],
    ['JS Template intent router', source],
    ['OpenAI prompt', prompt],
  ]) {
    assert.match(text, /multiple compatible Hosts|multiple Hosts/i, label);
    assert.match(text, /(?:share|sharing)[\s\S]{0,180}(?:one maintained )?JS implementation/i, label);
    assert.match(text, /maintain(?:ed)?(?: once)?[\s\S]{0,100}(?:without|no) copied code/i, label);
    assert.match(text, /JS Template/i, label);
  }

  assert.match(source, /single-Host implementation stays Inline/i);
  assert.match(source, /Git storage[\s\S]{0,220}do not select JS Template/i);
  assert.match(prompt, /one Host[\s\S]{0,100}exclusively owns[\s\S]{0,100}Inline RunJS/i);
  assert.match(prompt, /Single-Host Git storage\/ownership[\s\S]{0,100}stays Inline/i);
  assert.match(prompt, /Multiple files[\s\S]{0,160}do not trigger JS Template/i);
});

test('active Skill and prompt apply the four-way solution gate', () => {
  const skill = read('SKILL.md');
  const js = read('references/js.md');
  const source = read('references/js-template-source.md');
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');

  for (const [label, text] of [
    ['SKILL.md', skill],
    ['JS router', js],
    ['JS Template router', source],
    ['OpenAI prompt', prompt],
  ]) {
    assert.match(
      text,
      /one Host[\s\S]{0,100}exclusively own(?:s|ing)[\s\S]{0,120}Inline RunJS/i,
      `${label} should route Host-owned JS to Inline RunJS`,
    );
    assert.match(text, /reusable\s+UI\/Flow structure/i, `${label} should cover reusable UI structure`);
    assert.match(text, /without (?:a |one )?shared JS/i, `${label} should separate UI structure from shared JS`);
    assert.match(text, /UI Template/i, `${label} should expose UI Template`);
    assert.match(text, /JS Template/i, `${label} should expose JS Template`);
    assert.match(text, /multiple(?: compatible)? Hosts/i, `${label} should cover multiple Hosts`);
    assert.match(text, /share|sharing/i, `${label} should cover shared implementation intent`);
    assert.match(
      text,
      /backend API[\s\S]{0,240}(?:ACL|permission)[\s\S]{0,180}(?:server capability|server capabilities)[\s\S]{0,160}(?:full )?NocoBase Plugin/i,
      `${label} should route server requirements to a full NocoBase Plugin`,
    );
    assert.match(
      text,
      /reusable\s+UI\/Flow structure[\s\S]{0,120}without (?:a |one )?shared JS[\s\S]{0,80}(?:uses|->)[\s\S]{0,20}UI Template/i,
      `${label} should route UI structure reuse to UI Template`,
    );
  }

  assert.match(skill, /requested JS feature itself[\s\S]{0,180}full \*\*NocoBase Plugin\*\*/i);
  assert.match(skill, /Existing-app ACL administration[\s\S]{0,120}specialist handoffs/i);
  assert.match(skill, /Hand off ACL[\s\S]{0,80}`nocobase-acl-manage`/i);
  assert.match(skill, /Hand off collection[\s\S]{0,80}`nocobase-data-modeling`/i);
  assert.match(prompt, /new backend API[\s\S]{0,180}NocoBase Plugin/i);
  assert.match(prompt, /Existing ACL\/data-model admin[\s\S]{0,80}specialist skills/i);
  const promptGate = prompt.split('\n').find((line) => line.startsWith('Four-way gate:'));
  assert.ok(promptGate, 'OpenAI prompt should contain the four-way gate line');
  const orderedRoutes = ['NocoBase Plugin', 'JS Template', 'UI Template', 'Inline RunJS'];
  const routePositions = orderedRoutes.map((route) => promptGate.indexOf(route));
  assert.ok(routePositions.every((position) => position >= 0), 'OpenAI prompt should name every solution route');
  assert.deepEqual(routePositions, [...routePositions].sort((left, right) => left - right));
  assert.equal(parseMarkedJson(prompt).match, 'first');
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
  assert.match(verification, /no Source Project or JS Template was automatically created/i);
  assert.match(verification, /Host Preview is not required/i);
});
