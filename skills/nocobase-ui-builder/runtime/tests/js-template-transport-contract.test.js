import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));
const transport = readFileSync(path.join(skillRoot, 'references/js-template-transport.md'), 'utf8');

function extractJsonAfter(marker) {
  const markerStart = transport.indexOf(marker);
  assert.notEqual(markerStart, -1, `should find marker ${marker}`);
  const fenceStart = transport.indexOf('```json\n', markerStart);
  assert.notEqual(fenceStart, -1, `should find JSON fence after ${marker}`);
  const jsonStart = fenceStart + '```json\n'.length;
  const fenceEnd = transport.indexOf('\n```', jsonStart);
  assert.notEqual(fenceEnd, -1, `should close JSON fence after ${marker}`);
  return JSON.parse(transport.slice(jsonStart, fenceEnd));
}

test('uses only canonical JS Template transports and body files', () => {
  for (const command of [
    'nb api run-js-sources capabilities -j',
    'nb api js-template-projects list -j',
    'nb api js-templates list-selectable -j',
    'nb api js-templates get --template-id <templateId> -j',
    'nb api js-templates save-as-js-template --body-file /tmp/js-template-save-as.json -j',
    'nb api js-template-usages list-usages --body-file /tmp/js-template-usages.json -j',
    'nb api js-templates detach-to-inline --body-file /tmp/js-template-detach.json -j',
    'nb api js-templates delete --template-id <templateId> -j',
    'nb js-template pull',
    'nb js-template check',
    'nb js-template save',
  ]) {
    assert.match(transport, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(
    transport,
    /runJSSources:capabilities[\s\S]*jsTemplateProjects:list[\s\S]*jsTemplates:listSelectable[\s\S]*jsTemplates:get[\s\S]*jsTemplates:saveAsJsTemplate[\s\S]*jsTemplateUsages:listUsages[\s\S]*jsTemplates:detachToInline[\s\S]*jsTemplates:delete[\s\S]*jsTemplateFiles:pull[\s\S]*jsTemplates:compileWorkspacePreview[\s\S]*jsTemplateFiles:saveSource/,
  );
  assert.match(transport, /root business[\s\S]{0,160}never wrap them in `values`/i);
  assert.match(transport, /externalization\.supportsDetachToInline: true/);
  assert.match(transport, /false or absent support is a stop condition/i);
  assert.doesNotMatch(transport, /--body\s+['"]\{/);
  assert.doesNotMatch(transport, /^```(?:bash|sh)\n(?:curl|fetch)\b/gim);
  assert.doesNotMatch(transport, /^```sql\n/gim);

  const topics = [...transport.matchAll(/\bnb\s+([a-z][a-z-]*)\b/g)].map((match) => match[1]);
  assert.ok(topics.every((topic) => topic === 'api' || topic === 'js-template'));
});

test('documents one canonical Save as request and separates Project from Template identity', () => {
  const request = extractJsonAfter('## Canonical Save as request\n');
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
    'templateName',
    'templateTitle',
  ];
  assert.deepEqual(Object.keys(request).sort(), [...required].sort());
  assert.deepEqual(request.destination, {});
  assert.equal(typeof request.locator, 'object');
  assert.ok(request.files.length >= 4);
  assert.ok(request.files.every((file) => file.path && typeof file.content === 'string'));
  assert.ok(request.files.some((file) => file.path === '.nocobase/runjs-source.json'));
  assert.match(transport, /Replace the complete sample `locator` value[\s\S]{0,180}exact `data\.locator` object/i);
  assert.match(transport, /Do not select or construct its fields individually/i);
  assert.deepEqual(extractJsonAfter('For an existing Source Project, use only:\n'), {
    type: 'existing',
    projectId: 'project-id-selected-from-js-template-projects-list',
  });
  assert.deepEqual(extractJsonAfter('For a new Source Project, use only:\n'), {
    type: 'new',
    name: 'sales-tools',
    title: 'Sales tools',
    description: 'Reusable sales surfaces',
  });
  assert.match(transport, /Source Project selection is[\s\S]{0,180}separate from `templateName` and `templateTitle`/i);
  assert.doesNotMatch(transport, /"type"\s*:\s*"default"/i);
});

test('requires one Inline snapshot and mandatory stable idempotency', () => {
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
  assert.match(transport, /Save as payload is a complete current Workspace[\s\S]{0,180}not the changed-path delta/i);
  assert.match(transport, /Never edit, delete, or synthesize a managed file/i);
  assert.match(transport, /`idempotencyKey` is required, non-empty/i);
  assert.match(transport, /deterministically from the complete[\s\S]{0,80}request/i);
  assert.match(transport, /Reuse the key only[\s\S]{0,180}complete request is equivalent/i);
  assert.match(transport, /JS_TEMPLATE_IDEMPOTENCY_CONFLICT/i);
});

test('persists exactly the four-field binding and keeps generic source metadata separate', () => {
  const binding = extractJsonAfter('## Record the durable result\n');
  assert.deepEqual(Object.keys(binding), ['type', 'projectId', 'templateId', 'kind']);
  assert.equal(binding.type, 'js-template-entry');
  assert.match(transport, /sourceMode: "js-template"/i);
  assert.match(transport, /Do not add Source Project\/Template names, titles,[\s\S]{0,100}paths, or keys/i);
  assert.match(transport, /Do not rename generic Inline\/VSC `repoId`/i);
  assert.match(transport, /source-format `entryPath`\/`entryKey`[\s\S]{0,40}semantics/i);
});

test('keeps the Source Project pull-check-reviewed-delta-save gate explicit', () => {
  assert.match(transport, /nb js-template pull[\s\S]*nb js-template check[\s\S]*nb js-template save/);
  assert.match(transport, /HTTP 207 or 422[\s\S]{0,160}stop condition/i);
  assert.match(transport, /Do not Save after a rejected\/partial check/i);
  assert.match(transport, /`snapshotId`[\s\S]{0,80}`baseHeadCommitId`[\s\S]{0,160}diff/i);
  assert.match(transport, /unchanged `expectedHeadCommitId`[\s\S]{0,140}omitted Source Project paths remain unchanged/i);
  assert.match(
    transport,
    /stale Head[\s\S]{0,220}pull the new Head into a clean workspace[\s\S]{0,160}reapply intended changes path by path/i,
  );
  assert.match(transport, /Never edit CLI state or replace only `expectedHeadCommitId`/i);
  assert.match(transport, /No local changes is a verified no-op/i);
});

test('distinguishes Inline CAS from Source Project Head CAS', () => {
  const casSection = transport.match(/^## Keep Inline and Source Project CAS separate\n([\s\S]*?)^## /m)?.[1];
  assert.ok(casSection, 'should find the CAS comparison section');
  for (const field of ['baseCommitId', 'baseOwnerFingerprint', 'expectedBlobHash', 'changes']) {
    assert.match(casSection, new RegExp(`\\b${field}\\b`));
  }
  assert.match(casSection, /expectedHeadCommitId/);
  assert.match(casSection, /Inline save has no `expectedHeadCommitId`/i);
  assert.match(
    casSection,
    /Source Project save has no `baseCommitId`, `baseOwnerFingerprint`,[\s\S]{0,80}`expectedBlobHash`, or `changes`/i,
  );
  assert.match(casSection, /Repository`, `Commit`, `Tree`, `Blob`, `GitRemote`, and[\s\S]{0,40}`repoId`/i);
});

test('documents visibility-safe Usage, save impact, and server-authoritative deletion protection', () => {
  assert.deepEqual(extractJsonAfter('## Usage and deletion\n'), {
    templateId: 'template-id',
    page: 1,
    pageSize: 20,
  });
  assert.match(transport, /visible effective owner locations/i);
  assert.match(transport, /effectiveCount[\s\S]{0,120}hiddenCount/i);
  assert.match(transport, /`owner_missing` is excluded/i);
  assert.match(transport, /Never[\s\S]{0,80}disclose hidden owner descriptors/i);
  assert.match(transport, /localized non-blocking impact message[\s\S]{0,120}all N locations/i);
  assert.match(transport, /JS_TEMPLATE_USAGE_EXISTS[\s\S]{0,160}effective Usage/i);
  assert.match(transport, /Successful[\s\S]{0,100}removes only that Template's source and unreferenced artifacts/i);
});

test('requires Head CAS and idempotency for Detach to Inline', () => {
  const request = extractJsonAfter('## Detach to Inline\n');
  assert.deepEqual(
    Object.keys(request).sort(),
    [
      'idempotencyKey',
      'locator',
      'projectId',
      'templateId',
      'expectedProjectHeadCommitId',
      'entryPath',
      'kind',
      'version',
      'files',
    ].sort(),
  );
  assert.match(request.idempotencyKey, /^detach-to-inline-/);
  assert.ok(request.files.length >= 3);
  assert.match(transport, /complete reachable file set[\s\S]{0,220}all relative imports/i);
  assert.match(transport, /validates `expectedProjectHeadCommitId` inside the same operation/i);
  assert.match(transport, /stale Project Head returns 409 `JS_TEMPLATE_SOURCE_OUTDATED`/i);
  assert.match(transport, /do not refresh only the Head field/i);
  assert.match(transport, /Equivalent retries return the first[\s\S]{0,180}`sourceRef`/i);
  assert.match(transport, /Success changes only the selected Host to Inline[\s\S]{0,180}other Host bindings/i);
});

test('documents atomic failures and complete canonical handoff evidence', () => {
  for (const marker of [
    'JS_TEMPLATE_INVALID_INPUT',
    'JS_TEMPLATE_PERMISSION_DENIED',
    'JS_TEMPLATE_PROJECT_NOT_FOUND',
    'JS_TEMPLATE_NOT_FOUND',
    'JS_TEMPLATE_PROJECT_DISABLED',
    'JS_TEMPLATE_PROJECT_ARCHIVED',
    'JS_TEMPLATE_BINDING_OUTDATED',
    'JS_TEMPLATE_SOURCE_OUTDATED',
    'JS_TEMPLATE_CONFLICT',
    'JS_TEMPLATE_PROJECT_CONFLICT',
    'JS_TEMPLATE_IDEMPOTENCY_IN_PROGRESS',
    'JS_TEMPLATE_IDEMPOTENCY_CONFLICT',
    'JS_TEMPLATE_USAGE_EXISTS',
    'JS_TEMPLATE_VALIDATION_FAILED',
    'JS_TEMPLATE_SETTINGS_INVALID',
  ]) {
    assert.match(transport, new RegExp(`\\b${marker}\\b`));
  }
  assert.match(transport, /No Head, Template, Artifact, Host binding, or Usage state advances/i);
  for (const evidence of [
    'Source Project id/name',
    'source commit id/message',
    'tree hash/size',
    'Template id/name/title/kind',
    'exact four-field Host binding',
    'Template-level effective Usage count',
    'independent Host Settings overrides',
    'Detach idempotency and Project Head CAS evidence',
  ]) {
    assert.match(transport, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.match(transport, /API\/CLI evidence is not rendered-browser evidence/i);
  assert.match(transport, /browser rendering remains unverified/i);
});
