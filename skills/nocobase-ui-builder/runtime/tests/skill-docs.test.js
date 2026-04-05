import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('SKILL.md promotes add* + settings as the default path', () => {
  const text = readText('../../SKILL.md');
  assert.match(text, /`addBlock` \/ `addField` \/ `addAction` \/ `addRecordAction` 默认优先/);
  assert.match(text, /requestBody\.settings/);
  assert.match(text, /不要把 `props` \/ `decoratorProps` \/ `stepParams` \/ `flowRegistry` 当成 `settings`/);
});

test('settings reference provides canonical examples and raw-domain counterexamples', () => {
  const text = readText('../../references/settings.md');
  assert.match(text, /## `settings` 的合法形状/);
  assert.match(text, /"type": "createForm"/);
  assert.match(text, /"fieldPath": "password"/);
  assert.match(text, /"type": "submit"/);
  assert.match(text, /"type": "view"/);
  assert.match(text, /"settings": \{\s+"props"/s);
  assert.match(text, /"settings": \{\s+"stepParams"/s);
});

test('tool-shapes forbids raw domain keys under add* settings', () => {
  const text = readText('../../references/tool-shapes.md');
  assert.match(text, /`settings` 不接受 `props` \/ `decoratorProps` \/ `stepParams` \/ `flowRegistry`/);
  assert.match(text, /`addBlock`/);
  assert.match(text, /`addField`/);
  assert.match(text, /`addAction`/);
  assert.match(text, /`addRecordAction`/);
});

test('agent prompt reinforces public settings guidance', () => {
  const text = readText('../../agents/openai.yaml');
  assert.match(text, /prefer inlining public settings from live catalog\.configureOptions into requestBody\.settings/);
  assert.match(text, /never nest props\/decoratorProps\/stepParams\/flowRegistry under settings/);
});
