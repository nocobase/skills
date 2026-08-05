import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));
const requireProductContract =
  process.env.REQUIRE_PRODUCT_CONTRACT === '1' || process.env.npm_lifecycle_event === 'test:product-contract';
const configuredProductRoot = String(process.env.NOCOBASE_REPO || '').trim();

if (requireProductContract && !configuredProductRoot) {
  throw new Error('NOCOBASE_REPO is required for the product contract gate');
}

const productRoot = configuredProductRoot ? path.resolve(configuredProductRoot) : null;
const productTestOptions = productRoot ? {} : { skip: 'Set NOCOBASE_REPO to run the cross-repository contract gate' };

function readSkill(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function readProductManifest() {
  assert.ok(productRoot, 'product checkout should be configured');
  const absolutePath = path.join(
    productRoot,
    'packages/core/runjs-workspace/src/shared/runjs-authoring-contract.v1.json',
  );
  assert.equal(existsSync(absolutePath), true, `missing NocoBase contract file: ${absolutePath}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function parseBacktickValuesAfterPrefix(text, prefix) {
  const line = text.split('\n').find((candidate) => candidate.startsWith(prefix));
  assert.ok(line, `missing documented list: ${prefix}`);
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function assertUniqueStringList(values, label) {
  assert.ok(Array.isArray(values) && values.length > 0, `${label} should be a non-empty array`);
  assert.ok(
    values.every((value) => typeof value === 'string' && value.length > 0),
    `${label} should contain strings`,
  );
  assert.equal(new Set(values).size, values.length, `${label} should not contain duplicates`);
}

function assertDocumentedBoolean(text, property, value) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(text, new RegExp(`${escapedProperty}[:=]\\s*${value}`, 'i'));
}

test('keeps Skills authoring guidance aligned with the product manifest', productTestOptions, () => {
  const manifest = readProductManifest();
  const workspace = readSkill('references/runjs-workspace-source.md');
  const transport = readSkill('references/js-template-transport.md');

  for (const [label, text] of [
    ['Workspace', workspace],
    ['JS Template', transport],
  ]) {
    const documentedVersion = text.match(/Contract version `([^`]+)` publishes/i)?.[1];
    assert.equal(documentedVersion, manifest.authoringContractVersion, `${label} contract version should match`);
  }
  assertDocumentedBoolean(workspace, 'inlineWorkspace.available', manifest.inlineWorkspace.available);
  assert.match(workspace, new RegExp(`saveMode:\\s*"${manifest.inlineWorkspace.saveMode}"`, 'i'));
  assertDocumentedBoolean(
    workspace,
    'inlineWorkspace.supportsMaterialize',
    manifest.inlineWorkspace.supportsMaterialize,
  );
  assert.deepEqual(parseBacktickValuesAfterPrefix(workspace, '- owner kinds:'), manifest.inlineWorkspace.ownerKinds);
  assert.deepEqual(parseBacktickValuesAfterPrefix(workspace, '- model uses:'), manifest.inlineWorkspace.modelUses);
  assertUniqueStringList(manifest.inlineWorkspace.ownerKinds, 'inlineWorkspace.ownerKinds');
  assertUniqueStringList(manifest.inlineWorkspace.modelUses, 'inlineWorkspace.modelUses');

  assert.deepEqual(
    parseBacktickValuesAfterPrefix(transport, '- entry kinds:'),
    manifest.externalization.entryKinds,
  );
  assert.deepEqual(
    parseBacktickValuesAfterPrefix(transport, '- destination types:'),
    manifest.externalization.destinationTypes,
  );
  assertUniqueStringList(manifest.externalization.entryKinds, 'externalization.entryKinds');
  assertUniqueStringList(manifest.externalization.destinationTypes, 'externalization.destinationTypes');
  assertDocumentedBoolean(transport, 'externalization.available', manifest.externalization.available);
  assertDocumentedBoolean(
    transport,
    'externalization.supportsIdempotency',
    manifest.externalization.supportsIdempotency,
  );
  assertDocumentedBoolean(
    transport,
    'externalization.supportsDetachToInline',
    manifest.externalization.supportsDetachToInline,
  );
  const detachSection = transport.match(/^## Detach to Inline\n([\s\S]*?)^## /m)?.[1];
  assert.ok(detachSection, 'JS Template transport should document Detach to Inline');
  assert.match(detachSection, /expectedProjectHeadCommitId/i);
});

test('locks delta, Save as, reuse, and Detach semantics across repositories', productTestOptions, () => {
  const manifest = readProductManifest();
  const workspace = readSkill('references/runjs-workspace-source.md');
  const transport = readSkill('references/js-template-transport.md');
  const roundtrip = readSkill('references/js-template-roundtrip.md');

  assert.equal(manifest.inlineWorkspace.saveMode, 'delta');
  assert.match(workspace, /baseCommitId[\s\S]{0,160}baseOwnerFingerprint/);
  assert.match(workspace, /expectedBlobHash/);
  assert.equal(manifest.externalization.available, true);
  assert.equal(manifest.externalization.supportsIdempotency, true);
  assert.equal(manifest.externalization.supportsDetachToInline, true);
  assert.match(transport, /complete[\s\S]{0,20}semantic request/i);
  assert.match(transport, /`idempotencyKey` is required, non-empty/i);
  assert.match(transport, /Equivalent retries return the first/i);
  assert.match(roundtrip, /one Source Project, one Template Entry, and two effective Usages/i);
  assert.match(roundtrip, /latest reachable source set/i);
  assert.match(roundtrip, /histories are independent/i);
});
