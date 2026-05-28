import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collectRunJSSnippetCatalogFailures } from './check_runjs_snippet_catalog.mjs';

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

test('collectRunJSSnippetCatalogFailures passes for the real catalog', () => {
  const failures = collectRunJSSnippetCatalogFailures();
  assert.deepEqual(failures, []);
});

test('collectRunJSSnippetCatalogFailures rejects external paths and malformed docs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runjs-snippet-catalog-'));
  const skillRoot = path.join(root, 'skill');
  const catalogPath = path.join(skillRoot, 'references', 'js-snippets', 'catalog.json');
  writeFile(path.join(skillRoot, 'references', 'js-snippets', 'safe', 'global', 'bad.md'), [
    '# bad',
    '',
    '```js',
    "ctx.openView('popup');",
    '```',
    '',
  ].join('\n'));
  writeFile(catalogPath, JSON.stringify({
    version: 1,
    snippets: [
      {
        id: 'global/bad',
        tier: 'safe',
        family: 'global',
        surfaces: ['event-flow.execute-javascript'],
        hostScenes: ['eventFlow'],
        intentTags: ['notify'],
        ctxRoots: ['openView'],
        effectStyle: 'action',
        requiresTopLevelReturn: false,
        forbidsCtxRender: true,
        forbiddenApis: [],
        doc: 'js-snippets/safe/global/bad.md',
        sourcePath: '/tmp/upstream',
        relatedIds: [],
      },
    ],
  }, null, 2));

  const failures = collectRunJSSnippetCatalogFailures({ catalogPath, skillRoot });
  assert.equal(failures.some((item) => item.includes('sourcePath is forbidden')), true);
  assert.equal(failures.some((item) => item.includes('missing required section: Use when')), true);
});

test('collectRunJSSnippetCatalogFailures validates declared modelUse metadata shape', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runjs-snippet-catalog-modeluses-'));
  const skillRoot = path.join(root, 'skill');
  const catalogPath = path.join(skillRoot, 'references', 'js-snippets', 'catalog.json');
  writeFile(path.join(skillRoot, 'references', 'js-snippets', 'safe', 'scene', 'form', 'bad.md'), [
    '# scene/form/bad',
    '',
    '## Use when',
    'Form-like linkage needs to update a field.',
    '',
    '## Do not use when',
    'The host has no form context.',
    '',
    '## Surfaces',
    '- `linkage.execute-javascript`',
    '',
    '## Required ctx roots',
    '- `ctx.form`',
    '',
    '## Contract',
    '- Effect style: `action`',
    '- Top-level `return`: optional',
    '- `ctx.render(...)`: do not use',
    '- Side-effect surface: yes',
    '',
    '## Normalized snippet',
    '',
    '```js',
    "ctx.form?.setFieldsValue?.({ title: 'x' });",
    '```',
    '',
    '## Editable slots',
    '- Replace the field name.',
    '',
    '## Skill-mode notes',
    'Only valid with form context.',
    '',
  ].join('\n'));
  writeFile(catalogPath, JSON.stringify({
    version: 1,
    snippets: [
      {
        id: 'scene/form/bad',
        tier: 'safe',
        family: 'scene/form',
        surfaces: ['linkage.execute-javascript'],
        hostScenes: ['linkage', 'form'],
        intentTags: ['set-field-value'],
        sceneHints: ['linkage', 'form'],
        modelUses: {
          'linkage.execute-javascript': ['JSRecordActionModel'],
        },
        ctxRoots: ['form'],
        effectStyle: 'action',
        requiresTopLevelReturn: false,
        forbidsCtxRender: true,
        offlineSafe: true,
        preferredForIntents: ['set-field-value'],
        forbiddenApis: [],
        doc: 'js-snippets/safe/scene/form/bad.md',
        relatedIds: [],
      },
    ],
  }, null, 2));

  const failures = collectRunJSSnippetCatalogFailures({ catalogPath, skillRoot });
  assert.deepEqual(failures, []);
});

test('collectRunJSSnippetCatalogFailures does not locally block ctx.openView snippets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runjs-snippet-catalog-openview-'));
  const skillRoot = path.join(root, 'skill');
  const catalogPath = path.join(skillRoot, 'references', 'js-snippets', 'catalog.json');
  writeFile(path.join(skillRoot, 'references', 'js-snippets', 'safe', 'global', 'open-view.md'), [
    '# global/open-view',
    '',
    '## Use when',
    'A snippet documents a runtime openView example.',
    '',
    '## Do not use when',
    'The final UI should use configured popup behavior instead.',
    '',
    '## Surfaces',
    '- `event-flow.execute-javascript`',
    '',
    '## Required ctx roots',
    '- `ctx.openView`',
    '',
    '## Contract',
    '- Effect style: `action`',
    '- Top-level `return`: optional',
    '- `ctx.render(...)`: do not use',
    '- Side-effect surface: yes',
    '',
    '## Normalized snippet',
    '',
    '```js',
    "await ctx.openView('popup-action-uid');",
    '```',
    '',
    '## Editable slots',
    '- Replace the target uid.',
    '',
    '## Skill-mode notes',
    'Catalog validation checks structure only.',
    '',
  ].join('\n'));
  writeFile(catalogPath, JSON.stringify({
    version: 1,
    snippets: [
      {
        id: 'global/open-view',
        tier: 'safe',
        family: 'global',
        surfaces: ['event-flow.execute-javascript'],
        hostScenes: ['eventFlow'],
        intentTags: ['open-view'],
        sceneHints: ['eventFlow'],
        modelUses: {
          'event-flow.execute-javascript': ['JSActionModel'],
        },
        ctxRoots: ['openView'],
        effectStyle: 'action',
        requiresTopLevelReturn: false,
        forbidsCtxRender: true,
        offlineSafe: true,
        preferredForIntents: ['open-view'],
        forbiddenApis: [],
        doc: 'js-snippets/safe/global/open-view.md',
        relatedIds: [],
      },
    ],
  }, null, 2));

  const failures = collectRunJSSnippetCatalogFailures({ catalogPath, skillRoot });
  assert.deepEqual(failures, []);
});
