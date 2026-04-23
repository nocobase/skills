import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collectRunJSSnippetManifestFailures } from './check_runjs_snippet_manifest.mjs';

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

test('collectRunJSSnippetManifestFailures passes for the real manifest', () => {
  const failures = collectRunJSSnippetManifestFailures();
  assert.deepEqual(failures, []);
});

test('collectRunJSSnippetManifestFailures reports invalid first-hop recommendations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runjs-snippet-manifest-'));
  const skillRoot = path.join(root, 'skill');
  const manifestPath = path.join(skillRoot, 'references', 'js-surfaces', 'snippet-manifest.json');
  const catalogPath = path.join(skillRoot, 'references', 'js-snippets', 'catalog.json');

  writeFile(path.join(skillRoot, 'references', 'js-surfaces', 'index.md'), '# index\n');
  writeFile(path.join(skillRoot, 'references', 'js-snippets', 'safe', 'global', 'guarded.md'), '# guarded\n');
  writeFile(catalogPath, JSON.stringify({
    version: 1,
    snippets: [
      {
        id: 'global/guarded',
        tier: 'guarded',
        surfaces: ['linkage.execute-javascript'],
      },
    ],
  }, null, 2));
  writeFile(manifestPath, JSON.stringify({
    version: 1,
    surfaces: [
      {
        id: 'event-flow.execute-javascript',
        entryDoc: 'js-surfaces/missing.md',
        recommendedSnippetIds: [
          'global/missing',
          'global/guarded',
        ],
      },
    ],
  }, null, 2));

  const failures = collectRunJSSnippetManifestFailures({
    manifestPath,
    catalogPath,
    skillRoot,
  });

  assert.deepEqual(failures, [
    'surfaces[0].entryDoc does not exist: js-surfaces/missing.md',
    'surfaces[0].recommendedSnippetIds[0] references missing catalog snippet: global/missing',
    'surfaces[0].recommendedSnippetIds[1] must reference a safe-tier snippet: global/guarded',
    'surfaces[0].recommendedSnippetIds[1] snippet global/guarded does not declare surface event-flow.execute-javascript',
  ]);
});

test('collectRunJSSnippetManifestFailures validates scene-aware recommendations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runjs-snippet-manifest-scenehint-'));
  const skillRoot = path.join(root, 'skill');
  const manifestPath = path.join(skillRoot, 'references', 'js-surfaces', 'snippet-manifest.json');
  const catalogPath = path.join(skillRoot, 'references', 'js-snippets', 'catalog.json');

  writeFile(path.join(skillRoot, 'references', 'js-surfaces', 'js-model-render.md'), '# render\n');
  writeFile(catalogPath, JSON.stringify({
    version: 1,
    snippets: [
      {
        id: 'render/text',
        tier: 'safe',
        surfaces: ['js-model.render'],
        sceneHints: ['block'],
      },
    ],
  }, null, 2));
  writeFile(manifestPath, JSON.stringify({
    version: 1,
    surfaces: [
      {
        id: 'js-model.render',
        entryDoc: 'js-surfaces/js-model-render.md',
        recommendedSnippetIds: ['render/text'],
        recommendedBySceneHint: {
          detail: ['render/text'],
        },
      },
    ],
  }, null, 2));

  const failures = collectRunJSSnippetManifestFailures({
    manifestPath,
    catalogPath,
    skillRoot,
  });

  assert.deepEqual(failures, [
    'surfaces[0].recommendedBySceneHint.detail[0] snippet render/text does not declare sceneHint detail',
  ]);
});
