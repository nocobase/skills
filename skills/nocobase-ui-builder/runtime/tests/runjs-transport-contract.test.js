import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

test('documents the default delta action and optional preview transport', () => {
  const transport = read('references/runjs-transport.md');

  for (const action of ['open', 'open-latest', 'save-changes', 'compile-preview']) {
    assert.match(transport, new RegExp(`nb api run-js-sources ${action} --body-file`));
  }
  assert.match(
    transport,
    /runJSSources:open[\s\S]*runJSSources:openLatest[\s\S]*runJSSources:saveChanges[\s\S]*runJSSources:compilePreview/,
  );
  assert.match(transport, /canonical [`]?data\.runJSLocator/i);
  assert.match(transport, /Do not construct a locator from `modelUid`/i);
  assert.match(transport, /compile-preview[\s\S]{0,180}optional dry-run/i);
  assert.match(transport, /legacy `runJSSources:save`[\s\S]{0,220}not the ordinary Agent route/i);
  assert.doesNotMatch(transport, /--body\s+['"]\{/);
});

test('documents open file hashes and server-managed manifest evidence', () => {
  const transport = read('references/runjs-transport.md');

  for (const field of [
    'data.locator',
    'data.ownerFingerprint',
    'data.repository.repoId',
    'data.repository.id',
    'data.repository.headCommitId',
    'data.files',
    'blobHash',
    'size',
    'managed',
    'data.settingsDescriptor',
    'data.permissions',
  ]) {
    assert.match(transport, new RegExp(field.replaceAll('.', '\\.')));
  }

  assert.match(transport, /\.nocobase\/runjs-source\.json[\s\S]{0,120}server-managed manifest/i);
  assert.match(transport, /do not upload, edit, or delete/i);
});

test('documents changed-path requests and exact blob concurrency semantics', () => {
  const transport = read('references/runjs-transport.md');

  assert.match(transport, /"changes"\s*:\s*\[/);
  assert.match(transport, /"operation"\s*:\s*"upsert"[\s\S]{0,180}"expectedBlobHash"\s*:\s*"blobHash-from-open"/i);
  assert.match(transport, /NewSummary\.tsx[\s\S]{0,160}"expectedBlobHash"\s*:\s*null/i);
  assert.match(transport, /"operation"\s*:\s*"delete"[\s\S]{0,160}"expectedBlobHash"/i);
  assert.match(transport, /path omitted from `changes` remains unchanged/i);
  assert.match(transport, /deletion requires an explicit `operation: "delete"`/i);
  assert.match(transport, /complete content of that changed file only/i);
  assert.match(transport, /`locator`, `repoId`, `baseCommitId`, `baseOwnerFingerprint`, `message`[\s\S]{0,120}required/i);
  assert.match(transport, /server derives the manifest update/i);
  assert.match(transport, /server materializes the complete candidate[\s\S]{0,220}Agent sends source once/i);
  assert.match(transport, /Inline save has no `expectedHeadCommitId` field/i);
});

test('documents compile rollback and code-specific conflict recovery', () => {
  const transport = read('references/runjs-transport.md');

  for (const code of [
    'RUNJS_COMPILE_FAILED',
    'RUNJS_IMPORT_NOT_ALLOWED',
    'RUNJS_IMPORT_NOT_FOUND',
    'RUNJS_DYNAMIC_IMPORT_UNSUPPORTED',
    'RUNJS_SOURCE_KIND_UNSUPPORTED',
    'RUNJS_SOURCE_LOCATOR_INVALID',
    'RUNJS_COMMIT_MESSAGE_INVALID',
    'RUNJS_SOURCE_READONLY',
    'PERMISSION_DENIED',
    'RUNJS_FILE_CONFLICT',
    'BASE_COMMIT_OUTDATED',
    'RUNJS_SOURCE_OWNER_OUTDATED',
    'NO_CHANGES',
    'RUNJS_SAVE_NO_CHANGES',
    'REPO_ARCHIVED',
  ]) {
    assert.match(transport, new RegExp(`\\b${code}\\b`));
  }

  assert.match(transport, /No Head, tree, artifact, Host, or owner state was committed/i);
  assert.match(transport, /same unchanged base/i);
  assert.match(transport, /RUNJS_FILE_CONFLICT[\s\S]{0,260}details\.path[\s\S]{0,160}details\.expectedBlobHash[\s\S]{0,160}details\.currentBlobHash/i);
  assert.match(transport, /RUNJS_FILE_CONFLICT[\s\S]{0,420}open-latest[\s\S]{0,180}original\/local\/latest[\s\S]{0,220}(?:latest hash and fresh CAS tokens|fresh hashes and CAS tokens)/i);
  assert.match(transport, /Never silently overwrite or replace only tokens/i);
  assert.match(transport, /404[\s\S]{0,240}do not classify this as an unsupported version/i);
  assert.match(transport, /413[\s\S]{0,120}resource limit/i);
  assert.doesNotMatch(transport, /\b(?:207|422)\b/);
});

test('quick routes link to the canonical transport instead of duplicating request shapes', () => {
  const cli = read('references/cli-transport.md');
  const workspace = read('references/runjs-workspace-source.md');
  const createPage = read('references/create-js-page-quick.md');

  for (const document of [cli, workspace, createPage]) {
    assert.match(document, /\[runjs-transport\.md\]\(\.\/runjs-transport\.md\)/i);
    assert.doesNotMatch(document, /--body-file|expectedHeadCommitId/);
  }
  assert.doesNotMatch(workspace, /"changes"\s*:|"expectedBlobHash"\s*:/);
  assert.doesNotMatch(createPage, /"changes"\s*:|"expectedBlobHash"\s*:/);
});
