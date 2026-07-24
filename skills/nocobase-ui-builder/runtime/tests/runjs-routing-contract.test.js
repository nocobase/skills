import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

test('global contract splits Host, Inline source, and externalized source routes', () => {
  const skill = read('SKILL.md');
  const normative = read('references/normative-contract.md');
  const prompt = read('agents/openai.yaml');

  for (const [label, text] of [
    ['SKILL.md', skill],
    ['normative contract', normative],
    ['OpenAI prompt', prompt],
  ]) {
    assert.match(text, /flow-surfaces/i, `${label} should retain the Host/UI route`);
    assert.match(text, /run-js-sources/i, `${label} should expose the Inline source route`);
    assert.match(text, /Light Extension|nb light/i, `${label} should expose explicit externalization`);
  }

  assert.doesNotMatch(skill, /Agent-facing write path is `nb api flow-surfaces <action>`/);
  assert.doesNotMatch(skill, /For nb writes, use `nb api flow-surfaces <action>`/);
  assert.doesNotMatch(normative, /Agent-facing write path: `nb api flow-surfaces <action>`/);
});

test('complete Workspace errors repair source without switching to single-file code', () => {
  const skill = read('SKILL.md');
  const normative = read('references/normative-contract.md');

  assert.match(skill, /complete Workspace[\s\S]{0,260}repair source files[\s\S]{0,260}do not switch to `settings\.code`/i);
  assert.match(normative, /Complete Inline Workspace JS writes[\s\S]{0,260}run-js-sources[\s\S]{0,260}without falling back to `settings\.code`/i);
  assert.match(skill, /embedded[\s\S]{0,180}single-file[\s\S]{0,220}`settings\.code`/i);
});

test('helpers and verification expose source-specific evidence', () => {
  const helpers = read('references/helper-contracts.md');
  const verification = read('references/verification.md');

  assert.match(helpers, /Host\/UI write path:[\s\S]{0,120}flow-surfaces/i);
  assert.match(helpers, /Inline Workspace source write path:[\s\S]{0,120}run-js-sources/i);
  assert.match(verification, /run-js-sources open` succeeded/i);
  assert.match(verification, /no diagnostic with `severity: "error"`/i);
  assert.match(verification, /new commit, `artifact\.filesHash`, and the updated owner fingerprint/i);
  assert.match(verification, /Host Preview is not required/i);
});
