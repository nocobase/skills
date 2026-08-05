import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

const roundtrip = read('references/js-template-roundtrip.md');
const source = read('references/js-template-source.md');
const verification = read('references/verification.md');
const checklist = read('references/execution-checklist.md');
const normative = read('references/normative-contract.md');

test('routes intent, transport, and round-trip lifecycle to canonical documents', () => {
  assert.match(source, /This file is the intent router/i);
  assert.match(source, /\[js-template-transport\.md\]\(\.\/js-template-transport\.md\)/i);
  assert.match(source, /\[js-template-roundtrip\.md\]\(\.\/js-template-roundtrip\.md\)/i);
  assert.match(roundtrip, /one Source Project, one[\s\S]{0,20}Template Entry, two compatible Host bindings/i);
});

test('saves only the first Host and reuses the exact four-field binding', () => {
  assert.equal((roundtrip.match(/nb api js-templates save-as-js-template\b/g) || []).length, 1);
  assert.match(roundtrip, /Treat `data\.binding` as the canonical reusable binding/i);
  for (const field of ['type', 'projectId', 'templateId', 'kind']) {
    assert.match(roundtrip, new RegExp(`data\\.binding\\.${field}|"${field}"`));
  }
  assert.match(roundtrip, /list-selectable[\s\S]{0,180}js-templates get/i);
  assert.match(roundtrip, /same `projectId`\/`templateId`\/`kind`/i);
  assert.match(roundtrip, /Reuse does not run[\s\S]{0,80}Save as JS Template a second time/i);
  assert.match(roundtrip, /does not[\s\S]{0,80}copy Template source[\s\S]{0,80}another Template Entry/i);
  assert.match(roundtrip, /or change `entry\.json\.key`/i);
});

test('keeps the catalog entry-centric and Project management separate', () => {
  assert.match(roundtrip, /primary catalog still has one row for T/i);
  assert.match(roundtrip, /advanced Source Project list still has one row for P/i);
  assert.match(roundtrip, /P also contains another Template Entry[\s\S]{0,140}two Template rows[\s\S]{0,100}one Project row/i);
  assert.match(source, /one Source Project with[\s\S]{0,80}two Template Entries[\s\S]{0,80}two catalog rows/i);
  assert.match(source, /Creating a[\s\S]{0,40}Source Project without creating a Template Entry[\s\S]{0,100}does not complete/i);
});

test('uses the public Host settings contract and preserves falsy overrides', () => {
  assert.match(roundtrip, /public source settings/i);
  assert.match(roundtrip, /flow-surfaces configure/i);
  assert.match(roundtrip, /"sourceMode": "js-template"/);
  assert.match(roundtrip, /"enabled": false/);
  assert.match(roundtrip, /"threshold": 0/);
  assert.match(roundtrip, /"label": ""/);
  assert.match(roundtrip, /Host overrides are values, not truthiness flags/i);
  assert.match(roundtrip, /override-only edit[\s\S]{0,160}remain unchanged/i);
  assert.match(roundtrip, /Changing Host A's override must not change Host B's override/i);
});

test('exposes template-level Usage and non-blocking save impact', () => {
  assert.match(roundtrip, /Immediately after Save as, Host A contributes one effective Usage/i);
  assert.match(roundtrip, /`owner_missing` is excluded/i);
  assert.match(roundtrip, /Hidden owners contribute only to `effectiveCount`\/`hiddenCount`/i);
  assert.match(roundtrip, /Template Usage `effectiveCount` is now two/i);
  assert.match(roundtrip, /localized, non-blocking impact[\s\S]{0,120}used in N locations/i);
  assert.match(roundtrip, /loading, empty, error,[\s\S]{0,100}partially visible states/i);
});

test('detaches one Host with idempotency and current Project Head CAS', () => {
  assert.match(roundtrip, /latest reachable source set/i);
  assert.match(roundtrip, /Never use Host A's retained older Inline fallback/i);
  assert.match(roundtrip, /stable `idempotencyKey`[\s\S]{0,80}`expectedProjectHeadCommitId`/i);
  assert.match(roundtrip, /validates Project Head[\s\S]{0,160}same operation/i);
  assert.match(roundtrip, /stale[\s\S]{0,80}409 `JS_TEMPLATE_SOURCE_OUTDATED`/i);
  assert.match(roundtrip, /leaves Host[\s\S]{0,240}Artifacts unchanged/i);
  assert.match(roundtrip, /never replace only the expected Head/i);
  assert.match(roundtrip, /Equivalent replay returns the first[\s\S]{0,180}`sourceRef`/i);
  assert.match(roundtrip, /clears only Host A's binding/i);
  assert.match(roundtrip, /Host B stays bound to P\/T/i);
});

test('keeps Inline and Source Project histories independent and protects deletion', () => {
  assert.match(roundtrip, /histories are independent/i);
  assert.match(roundtrip, /Host A[\s\S]{0,140}save advances only Host A's generic RunJS Head/i);
  assert.match(roundtrip, /Template T[\s\S]{0,180}save advances only Source Project P's Head/i);
  assert.match(roundtrip, /Template save cannot overwrite Host A's Inline source/i);
  assert.match(roundtrip, /409 `JS_TEMPLATE_USAGE_EXISTS`[\s\S]{0,100}without hidden owner details/i);
  assert.match(roundtrip, /Deletion may then remove only T's source and unreferenced[\s\S]{0,80}artifacts/i);
  assert.match(roundtrip, /does not delete Source Project P or a sibling Template Entry/i);
});

test('aligns normative, checklist, and completion evidence', () => {
  for (const [label, text] of [
    ['normative contract', normative],
    ['execution checklist', checklist],
    ['verification', verification],
  ]) {
    assert.match(text, /one Source Project(?:,| and) one Template Entry/i, label);
    assert.match(text, /settings override|independent overrides/i, label);
    assert.match(text, /Usage/i, label);
    assert.match(text, /reachable/i, label);
    assert.match(text, /history|histories/i, label);
  }
  assert.match(verification, /browser rendering|browser-verification boundary/i);
  assert.match(checklist, /browser-verification boundary/i);
});
