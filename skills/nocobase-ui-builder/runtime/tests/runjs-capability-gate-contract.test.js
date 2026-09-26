import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

test('capability gate consumes Host, command, and operation evidence', () => {
  const gate = read('references/runjs-capability-gate.md');

  for (const signal of [
    'run-js-sources capabilities -j',
    'authoringContractVersion',
    'inlineWorkspace.ownerKinds',
    'inlineWorkspace.modelUses',
    'inlineWorkspace.saveMode',
    'externalization.available',
    'runJSLocator',
    'workspaceStatus',
    'workspaceRetryable',
    'workspaceError.code/message',
    'run-js-sources',
    'save-changes',
    'errors[].code',
  ]) {
    assert.match(gate, new RegExp(signal.replaceAll(/[.[\]]/g, '\\$&'), 'i'));
  }
  assert.match(gate, /generic 404[\s\S]{0,180}not proof/i);
  assert.match(gate, /Do not use `nb js-template`[\s\S]{0,120}ordinary Inline Workspace capability/i);
  assert.match(gate, /explicit multi-file request[\s\S]{0,260}no single-file fallback/i);
  assert.match(gate, /never[\s\S]{0,180}`settings\.code`[\s\S]{0,180}ordinary JS Block[\s\S]{0,180}JS Template/i);
});

test('only the two explicit JS Block capability failures allow single-file fallback', () => {
  const gate = read('references/runjs-capability-gate.md');

  for (const code of [
    'FLOW_SURFACE_RUNJS_BOOTSTRAP_PROVIDER_UNAVAILABLE',
    'RUNJS_SOURCE_KIND_UNSUPPORTED',
  ]) {
    assert.match(gate, new RegExp(`JS Block[^\n]*${code}[^\n]*\n?[^|]*\\| Yes \\|`, 'i'));
  }
  assert.equal(gate.match(/\| Yes \|/g)?.length, 2, 'only two matrix rows may permit fallback');
  assert.match(gate, /only when the user did not explicitly request multiple files/i);
  assert.match(gate, /add-block[\s\S]{0,160}settings:\s*\{ code, version \}/i);
  assert.match(gate, /configure[\s\S]{0,160}changes:\s*\{ code, version \}/i);
  assert.match(gate, /JS Page[\s\S]{0,220}Never substitute an ordinary page \+ JS Block[\s\S]{0,80}\| No \|/i);
  assert.match(gate, /JS Page public configure[\s\S]{0,160}metadata only[\s\S]{0,120}stop/i);
});

test('ordinary failures remain repair or stop conditions', () => {
  const gate = read('references/runjs-capability-gate.md');

  for (const token of [
    '401 or 403',
    'owner, Repository, or base commit 404',
    'artifact.diagnostics',
    'RUNJS_FILE_CONFLICT',
    'BASE_COMMIT_OUTDATED',
    'RUNJS_SOURCE_OWNER_OUTDATED',
    'RUNJS_SAVE_NO_CHANGES',
    'REPO_ARCHIVED',
    'RUNJS_COMPILE_FAILED',
    '413',
    'network error or 5xx',
  ]) {
    assert.match(gate, new RegExp(token.replaceAll(/[.[\]]/g, '\\$&'), 'i'));
  }
  assert.match(gate, /error diagnostics[\s\S]{0,180}No state was committed/i);
  assert.match(gate, /open-latest -> read latest file\/hash -> merge by path -> save-changes/i);
  assert.match(gate, /never replace tokens alone/i);
});

test('quick routes preserve JS Page and business reuse boundaries', () => {
  const wholePage = read('references/whole-page-quick.md');
  const localEdit = read('references/local-edit-quick.md');
  const jsTemplate = read('references/js-template-source.md');
  const checklist = read('references/execution-checklist.md');

  for (const text of [wholePage, localEdit, jsTemplate, checklist]) {
    assert.match(text, /runjs-capability-gate\.md/i);
  }
  assert.match(wholePage, /JS Page Workspace capability[\s\S]{0,100}ordinary page \+ JS Block/i);
  assert.match(jsTemplate, /canonical capability is unavailable[\s\S]{0,180}do not silently substitute/i);
  assert.match(checklist, /multi-file Workspace capability is unavailable[\s\S]{0,160}single-file Inline[\s\S]{0,180}no Source Project or JS Template/i);
  assert.ok(wholePage.split('\n').length - 1 <= 220, 'whole-page-quick.md must stay within 220 lines');
});
