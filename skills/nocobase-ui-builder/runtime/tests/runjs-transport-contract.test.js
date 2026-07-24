import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

test('documents the four executable RunJS CLI actions and body-file transport', () => {
  const transport = read('references/runjs-transport.md');

  for (const action of ['open', 'open-latest', 'compile-preview', 'save']) {
    assert.match(transport, new RegExp(`nb api run-js-sources ${action} --body-file`));
  }
  assert.match(transport, /runJSSources:open[\s\S]*runJSSources:openLatest[\s\S]*runJSSources:compilePreview[\s\S]*runJSSources:save/);
  assert.match(transport, /canonical [`]?data\.runJSLocator/i);
  assert.match(transport, /Do not construct a locator from `modelUid`/i);
  assert.doesNotMatch(transport, /--body\s+['"]\{/);
});

test('documents open response state and complete-snapshot CAS requests', () => {
  const transport = read('references/runjs-transport.md');

  for (const field of [
    'data.locator',
    'data.ownerFingerprint',
    'data.repository.repoId',
    'data.repository.id',
    'data.repository.headCommitId',
    'data.files',
    'data.settingsDescriptor',
    'data.permissions',
  ]) {
    assert.match(transport, new RegExp(field.replaceAll('.', '\\.')));
  }

  assert.match(transport, /files[`]? is the complete target Workspace snapshot/i);
  assert.match(transport, /omitted[\s\S]{0,80}deleted/i);
  assert.match(transport, /Preview and save[\s\S]{0,100}same complete candidate snapshot/i);
  assert.match(transport, /baseCommitId[\s\S]{0,180}baseOwnerFingerprint[\s\S]{0,220}same[\s\S]{0,80}(?:open|open-latest)/i);
  assert.match(transport, /Inline save has no `expectedHeadCommitId` field/i);
});

test('documents diagnostics and code-specific recovery instead of status-only handling', () => {
  const transport = read('references/runjs-transport.md');

  assert.match(transport, /compile-preview[`]? \+ 200[\s\S]{0,100}artifact\.diagnostics\[\]\.severity = "error"/i);
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
    'BASE_COMMIT_OUTDATED',
    'RUNJS_SOURCE_OWNER_OUTDATED',
    'NO_CHANGES',
    'RUNJS_SAVE_NO_CHANGES',
    'REPO_ARCHIVED',
  ]) {
    assert.match(transport, new RegExp(`\\b${code}\\b`));
  }
  assert.match(transport, /open-latest[\s\S]{0,160}original[\s\S]{0,80}local[\s\S]{0,80}latest[\s\S]{0,180}preview[\s\S]{0,100}save/i);
  assert.match(transport, /same-path conflict[\s\S]{0,80}stop/i);
  assert.match(transport, /404[\s\S]{0,240}do not classify this as an unsupported version/i);
  assert.match(transport, /413[\s\S]{0,120}resource limit/i);
  assert.doesNotMatch(transport, /\b(?:207|422)\b/);
  assert.match(transport, /Do not import[\s\S]{0,120}reviewed delta save/i);
});

test('quick routes link to the canonical transport instead of duplicating request shapes', () => {
  const cli = read('references/cli-transport.md');
  const workspace = read('references/runjs-workspace-source.md');
  const createPage = read('references/create-js-page-quick.md');

  for (const document of [cli, workspace, createPage]) {
    assert.match(document, /\[runjs-transport\.md\]\(\.\/runjs-transport\.md\)/i);
    assert.doesNotMatch(document, /--body-file|RUNJS_[A-Z_]+|expectedHeadCommitId/);
  }
  assert.doesNotMatch(workspace, /"files"\s*:|"baseCommitId"\s*:|"baseOwnerFingerprint"\s*:/);
  assert.doesNotMatch(createPage, /"files"\s*:|"baseCommitId"\s*:|"baseOwnerFingerprint"\s*:/);
});
