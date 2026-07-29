import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));
const transport = readFileSync(path.join(skillRoot, 'references/light-extension-transport.md'), 'utf8');

function extractJsonAfterHeading(heading) {
  const sectionStart = transport.indexOf(`## ${heading}\n`);
  assert.notEqual(sectionStart, -1, `should find heading ${heading}`);
  const fenceStart = transport.indexOf('```json\n', sectionStart);
  assert.notEqual(fenceStart, -1, `should find JSON fence after ${heading}`);
  const jsonStart = fenceStart + '```json\n'.length;
  const fenceEnd = transport.indexOf('\n```', jsonStart);
  assert.notEqual(fenceEnd, -1, `should close JSON fence after ${heading}`);
  return JSON.parse(transport.slice(jsonStart, fenceEnd));
}

test('uses only published nb transports and body files for migration requests', () => {
  for (const command of [
    'nb api run-js-sources capabilities -j',
    'nb api light-extension-repos list -j',
    'nb api light-extension-entries list-selectable -j',
    'nb api light-extensions move-source --body-file /tmp/light-move-source.json -j',
    'nb light pull',
    'nb light check',
    'nb light save',
    'nb api light-extensions move-to-inline --body-file /tmp/light-move-inline.json -j',
  ]) {
    assert.match(transport, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(
    transport,
    /runJSSources:capabilities[\s\S]*lightExtensionRepos:list[\s\S]*lightExtensionEntries:listSelectable[\s\S]*lightExtensions:moveSource[\s\S]*lightExtensionFiles:pull[\s\S]*lightExtensions:compileWorkspacePreview[\s\S]*lightExtensionFiles:saveSource[\s\S]*lightExtensions:moveToInline/,
  );
  assert.match(transport, /root business payloads[\s\S]{0,160}never wrapped in\s+`values`/i);
  assert.doesNotMatch(transport, /--body\s+['"]\{/);
  assert.doesNotMatch(transport, /^```(?:bash|sh)\n(?:curl|fetch)\b/gim);
  assert.doesNotMatch(transport, /^```sql\n/gim);
});

test('documents one canonical moveSource body with only Existing and New destination fragments', () => {
  const request = extractJsonAfterHeading('Canonical moveSource request');
  const required = [
    'idempotencyKey',
    'locator',
    'expectedOwnerFingerprint',
    'sourceRepoId',
    'sourceHeadCommitId',
    'entryPath',
    'version',
    'files',
    'destination',
    'entryName',
    'entryTitle',
  ];
  assert.deepEqual(Object.keys(request).sort(), [...required].sort());
  assert.deepEqual(request.destination, {});
  assert.equal(typeof request.locator, 'object');
  assert.ok(request.files.length >= 4);
  assert.ok(request.files.every((file) => file.path && typeof file.content === 'string'));
  assert.ok(request.files.some((file) => file.path === '.nocobase/runjs-source.json'));
  assert.match(transport, /Replace the entire sample `locator` object[\s\S]{0,180}exact normalized `data\.locator`/i);
  assert.match(transport, /never fill, remove, or construct[\s\S]{0,80}fields individually/i);
  assert.deepEqual(extractJsonAfterHeading('Existing destination'), {
    type: 'existing',
    repoId: 'repoId-selected-from-light-extension-repos-list',
  });
  assert.deepEqual(extractJsonAfterHeading('New destination'), {
    type: 'new',
    name: 'sales-tools',
    title: 'Sales tools',
    description: 'Reusable sales surfaces',
  });
  assert.doesNotMatch(transport, /Default Repository request/i);
  assert.doesNotMatch(transport, /"type"\s*:\s*"default"/i);
  assert.match(transport, /first move without an explicit or already-known Repository[\s\S]{0,180}business-meaningful/i);
  assert.match(transport, /Entry's current Repository[\s\S]{0,120}user-selected[\s\S]{0,120}same task/i);
});

test('requires one Inline snapshot and stable idempotency semantics', () => {
  for (const field of [
    'data.locator',
    'data.ownerFingerprint',
    'data.repository.repoId',
    'data.repository.headCommitId',
    'data.source.runtimeVersion',
    'data.files',
    'data.settingsDescriptor',
  ]) {
    assert.match(transport, new RegExp(field.replaceAll('.', '\\.')));
  }
  assert.match(transport, /same response/i);
  assert.match(transport, /\.nocobase\/runjs-source\.json[\s\S]{0,180}`entry`[\s\S]{0,180}`entryPath`/i);
  assert.match(transport, /Never mix locator[\s\S]{0,240}files across responses/i);
  assert.match(transport, /complete snapshot[\s\S]{0,180}not the changed-path delta/i);
  assert.match(transport, /managed: true[\s\S]{0,220}never edit, delete,\s+or synthesize/i);
  assert.match(transport, /derive `idempotencyKey` deterministically from the complete semantic request/i);
  assert.match(transport, /Reuse that key only to replay[\s\S]{0,120}equivalent semantic request/i);
  assert.match(
    transport,
    /Changing the destination, Host\/locator, Entry name\/title, source Head, source files, version, owner fingerprint, or\s+origin binding[\s\S]{0,100}requires a new key/i,
  );
});

test('keeps the Repository pull-check-reviewed-delta-save gate and conflict recovery explicit', () => {
  assert.match(transport, /nb light pull[\s\S]*nb light check[\s\S]*nb light save/);
  assert.match(transport, /HTTP 207[\s\S]{0,100}HTTP 422[\s\S]{0,160}stop conditions/i);
  assert.match(transport, /Never run `save` after a 207\/422 result/i);
  assert.match(transport, /review's `snapshotId`, `baseHeadCommitId`[\s\S]{0,120}diff/i);
  assert.match(transport, /`expectedHeadCommitId`[\s\S]{0,80}`files` delta/i);
  assert.match(transport, /omitted Repository paths stay unchanged and deletion is explicit/i);
  assert.match(
    transport,
    /stale[- ]Head[\s\S]{0,260}pull the new Head into a clean workspace[\s\S]{0,180}reapply the intended changes path-by-path/i,
  );
  assert.match(transport, /Do not edit CLI state or replace only `expectedHeadCommitId`/i);
  assert.match(transport, /no local source changes[\s\S]{0,180}no-op\/already-current[\s\S]{0,100}do not manufacture/i);
});

test('distinguishes Inline delta CAS from Repository Head CAS and managed files', () => {
  const casSection = transport.match(/^## Do not mix the two CAS protocols\n([\s\S]*?)^## /m)?.[1];
  assert.ok(casSection, 'should find the CAS comparison section');
  for (const field of ['baseCommitId', 'baseOwnerFingerprint', 'expectedBlobHash', 'changes']) {
    assert.match(casSection, new RegExp(`\\b${field}\\b`));
  }
  assert.match(casSection, /expectedHeadCommitId/);
  assert.match(casSection, /Inline `saveChanges` has no `expectedHeadCommitId`/i);
  assert.match(
    casSection,
    /Repository `saveSource` has no `baseCommitId`,\s+`baseOwnerFingerprint`, `expectedBlobHash`, or `changes`/i,
  );
  assert.match(casSection, /managed: true[\s\S]{0,140}server derives the manifest/i);
  assert.match(casSection, /CLI `.nocobase`\/generated local metadata/i);
});

test('documents idempotent move-back from current reachable files without extra caller CAS', () => {
  const request = extractJsonAfterHeading('Move the current Entry back Inline');
  assert.deepEqual(
    Object.keys(request).sort(),
    ['idempotencyKey', 'locator', 'repoId', 'entryId', 'entryPath', 'kind', 'version', 'files'].sort(),
  );
  assert.match(request.idempotencyKey, /^move-to-inline-/);
  assert.ok(request.files.length >= 3);
  assert.match(transport, /complete reachable file set[\s\S]{0,220}every relative\s+import/i);
  assert.match(transport, /Do not use an older pull or omit a\s+transitive relative import/i);
  assert.match(transport, /Reuse the key only[\s\S]{0,260}entire request is unchanged/i);
  assert.match(transport, /Any body change requires a new key/i);
  assert.match(transport, /completed replay returns the same first[\s\S]{0,180}`commitId`[\s\S]{0,160}`sourceRef`/i);
  assert.match(transport, /adds no expected[\s\S]{0,160}Head[\s\S]{0,160}compiled commit[\s\S]{0,160}CAS input/i);
  for (const field of ['data.runJSRepoId', 'data.commitId', 'data.ownerFingerprint', 'data.sourceRef']) {
    assert.match(transport, new RegExp(field.replaceAll('.', '\\.')));
  }
});

test('documents failure rollback and complete handoff evidence', () => {
  for (const marker of [
    'LIGHT_EXTENSION_PERMISSION_DENIED',
    'LIGHT_EXTENSION_REPO_NOT_FOUND',
    'LIGHT_EXTENSION_ENTRY_NOT_FOUND',
    'LIGHT_EXTENSION_REPO_ARCHIVED',
    'LIGHT_EXTENSION_BINDING_OUTDATED',
    'LIGHT_EXTENSION_SOURCE_OUTDATED',
    'LIGHT_EXTENSION_ENTRY_CONFLICT',
    'LIGHT_EXTENSION_IDEMPOTENCY_IN_PROGRESS',
    'LIGHT_EXTENSION_IDEMPOTENCY_CONFLICT',
    'LIGHT_EXTENSION_VALIDATION_FAILED',
    'LIGHT_EXTENSION_SETTINGS_INVALID',
  ]) {
    assert.match(transport, new RegExp(`\\b${marker}\\b`));
  }
  assert.match(transport, /No Head, commit, tree, artifact, Host binding, or reference state is advanced/i);
  for (const evidence of [
    'Repository id/name plus old and new Head',
    'source commit id/message',
    'tree hash/size',
    'Entry stable `entry.json.key`/`entryName`',
    'exact Host binding and post-write owner fingerprint',
    'reference readback',
    'Settings descriptor schema and defaults',
    'Host-local override',
    'resolved/effective',
  ]) {
    assert.match(transport, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.match(transport, /API\/CLI evidence is not rendered-browser evidence/i);
  assert.match(transport, /browser verification remains unperformed/i);
});

test('reference readback does not confuse RunJS and Light Extension owner locators', () => {
  const section = transport.match(/^## Record externalization evidence\n([\s\S]*?)^## /m)?.[1];
  assert.ok(section, 'should find externalization evidence section');
  assert.match(section, /exact Repository and Entry identity/i);
  assert.match(section, /different public schema/i);
  assert.doesNotMatch(section, /"ownerLocator"/);
  assert.doesNotMatch(section, /"flowKey"|"stepKey"|"paramPath"/);
});
