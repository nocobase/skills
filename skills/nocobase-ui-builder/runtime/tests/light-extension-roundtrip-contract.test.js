import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

const roundtrip = read('references/light-extension-roundtrip.md');
const source = read('references/light-extension-source.md');
const verification = read('references/verification.md');
const checklist = read('references/execution-checklist.md');
const normative = read('references/normative-contract.md');

test('routes transport and round-trip intent to separate canonical documents', () => {
  assert.match(source, /This file is the intent router/i);
  assert.match(source, /\[light-extension-transport\.md\]\(\.\/light-extension-transport\.md\)/i);
  assert.match(source, /\[light-extension-roundtrip\.md\]\(\.\/light-extension-roundtrip\.md\)/i);
  assert.match(roundtrip, /one Repository, one Entry,[\s\S]{0,12}two\s+compatible Host bindings/i);
});

test('externalizes only the first Host and reuses the returned binding', () => {
  assert.equal((roundtrip.match(/nb api light-extensions move-source\b/g) || []).length, 1);
  assert.match(roundtrip, /Treat `data\.binding` as the canonical reusable binding/i);
  for (const field of ['type', 'repoId', 'entryId', 'kind']) {
    assert.match(roundtrip, new RegExp(`data\\.binding\\.${field}|"${field}"`));
  }
  assert.match(roundtrip, /list-selectable[\s\S]{0,180}light-extension-entries get/i);
  assert.match(roundtrip, /same `repoId` and `entryId`[\s\S]{0,100}counts remain one/i);
  assert.match(roundtrip, /does not run another[\s\S]{0,80}`moveSource`/i);
  assert.match(roundtrip, /do not[\s\S]{0,80}(?:copy|duplicate)[\s\S]{0,80}Entry/i);
  assert.match(roundtrip, /(?:do not|or) change `entry\.json\.key`|editing `entry\.json\.key` is not/i);
});

test('uses the public Host settings contract and preserves falsy overrides', () => {
  assert.match(roundtrip, /public `settings\.sourceBinding`/i);
  assert.match(roundtrip, /public `configure` request/i);
  assert.match(roundtrip, /"sourceMode": "light-extension"/);
  assert.match(roundtrip, /"enabled": false/);
  assert.match(roundtrip, /"threshold": 0/);
  assert.match(roundtrip, /"label": ""/);
  assert.match(roundtrip, /Host overrides are values, not truthiness flags/i);
  assert.match(roundtrip, /override edit creates no source commit/i);
  assert.match(roundtrip, /Changing Host A's override must not\s+change Host B's override/i);
});

test('moves one Host idempotently from the latest Entry source without affecting the other binding', () => {
  assert.match(roundtrip, /latest reachable dependency closure/i);
  assert.match(roundtrip, /Do not use the retained pre-externalization Inline\s+fallback/i);
  assert.match(roundtrip, /Snapshot freshness is the caller's responsibility/i);
  assert.match(roundtrip, /does not fetch or lock the latest Light Extension Head/i);
  assert.match(roundtrip, /does not accept an expected Head\/compiled commit\s+CAS token/i);
  assert.match(roundtrip, /stable\s+`idempotencyKey`/i);
  assert.match(roundtrip, /entire request is unchanged[\s\S]{0,180}require a\s+new key/i);
  assert.match(roundtrip, /completed replay returns the first `runJSRepoId`[\s\S]{0,180}`ownerFingerprint`[\s\S]{0,120}`sourceRef`/i);
  assert.match(roundtrip, /does not add an expected Head\/compiled commit CAS input/i);
  assert.match(roundtrip, /clears only Host A's external binding and reference/i);
  assert.match(
    roundtrip,
    /preserve Host B's binding\s+and reference, Repository R, Entry E, stable key, Repository Head, source history/i,
  );
});

test('keeps Inline and Repository histories independent after move-back', () => {
  assert.match(roundtrip, /Host A and Entry E have separate histories/i);
  assert.match(roundtrip, /Inline save advances only Host A's RunJS Head/i);
  assert.match(roundtrip, /Repository save advances only Repository R's\s+Head and Entry compiled commit/i);
  assert.match(roundtrip, /Repository save must not overwrite Host A's Inline source/i);
  assert.match(roundtrip, /Host A Inline save must not advance\s+Repository R/i);
});

test('aligns normative, checklist, and completion evidence', () => {
  for (const [label, text] of [
    ['normative contract', normative],
    ['execution checklist', checklist],
    ['verification', verification],
  ]) {
    assert.match(text, /one (?:Light Extension )?Repository|Repository\/Entry counts|one Repository, one Entry/i, label);
    assert.match(text, /settings override|independent overrides/i, label);
    assert.match(text, /reference/i, label);
    assert.match(text, /latest reachable|reachable Inline source/i, label);
    assert.match(text, /history|histories/i, label);
  }
  assert.match(verification, /browser rendering|browser-verification boundary/i);
  assert.match(checklist, /browser-verification boundary/i);
});
