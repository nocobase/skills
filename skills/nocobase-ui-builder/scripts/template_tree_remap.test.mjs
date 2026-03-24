import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { remapTemplateTree } from './template_tree_remap.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./template_tree_remap.mjs', import.meta.url));
const SKILL_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

test('remapTemplateTree rewrites node uids, parentId, and defaultTargetUid for a fresh page', () => {
  const payload = {
    uid: 'grid-old',
    parentId: 'tabs-old',
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          uid: 'table-old',
          parentId: 'grid-old',
          use: 'TableBlockModel',
          subModels: {
            columns: [
              {
                uid: 'column-old',
                parentId: 'table-old',
                use: 'TableColumnModel',
              },
            ],
            actions: [
              {
                uid: 'action-old',
                parentId: 'table-old',
                use: 'ViewActionModel',
                stepParams: {
                  actionSettings: {
                    defaultTargetUid: 'popup-old',
                  },
                },
              },
            ],
          },
        },
        {
          uid: 'popup-old',
          parentId: 'grid-old',
          use: 'ChildPageModel',
        },
      ],
    },
  };

  const result = remapTemplateTree({
    payload,
    pageSchemaUid: 'k7n4x9p2q5ra',
    rootUid: 'fresh-grid',
    rootParentId: 'tabs-k7n4x9p2q5ra',
    logicalPathPrefix: 'case4',
  });

  assert.equal(result.payload.uid, 'fresh-grid');
  assert.equal(result.payload.parentId, 'tabs-k7n4x9p2q5ra');
  assert.equal(result.payload.subModels.items[0].parentId, 'fresh-grid');
  assert.notEqual(result.payload.subModels.items[0].uid, 'table-old');
  assert.match(result.payload.subModels.items[0].uid, /^[a-z][a-z0-9]{11}$/);
  assert.equal(
    result.payload.subModels.items[0].subModels.actions[0].stepParams.actionSettings.defaultTargetUid,
    result.payload.subModels.items[1].uid,
  );
  assert.equal(result.uidMappings['grid-old'], 'fresh-grid');
  assert.equal(result.uidMappings['popup-old'], result.payload.subModels.items[1].uid);
  assert.equal(
    result.rewrittenReferences.some((item) => item.key === 'defaultTargetUid' && item.from === 'popup-old'),
    true,
  );
});

test('remapTemplateTree rewrites filterManager filterId and targetId bindings', () => {
  const payload = {
    uid: 'grid-old',
    parentId: 'tabs-old',
    use: 'BlockGridModel',
    filterManager: [
      {
        filterId: 'filter-old',
        targetId: 'table-old',
        filterPaths: ['name'],
      },
    ],
    subModels: {
      items: [
        {
          uid: 'filter-old',
          parentId: 'grid-old',
          use: 'FilterFormItemModel',
        },
        {
          uid: 'table-old',
          parentId: 'grid-old',
          use: 'TableBlockModel',
        },
      ],
    },
  };

  const result = remapTemplateTree({
    payload,
    pageSchemaUid: 'k7n4x9p2q5ra',
    rootUid: 'fresh-grid',
    rootParentId: 'tabs-k7n4x9p2q5ra',
    logicalPathPrefix: 'case10',
  });

  const [filterNode, targetNode] = result.payload.subModels.items;
  assert.equal(result.payload.filterManager[0].filterId, filterNode.uid);
  assert.equal(result.payload.filterManager[0].targetId, targetNode.uid);
  assert.equal(
    result.rewrittenReferences.some((item) => item.key === 'filterId' && item.from === 'filter-old' && item.to === filterNode.uid),
    true,
  );
  assert.equal(
    result.rewrittenReferences.some((item) => item.key === 'targetId' && item.from === 'table-old' && item.to === targetNode.uid),
    true,
  );
});

test('template_tree_remap CLI prints remapped payload', () => {
  const payload = {
    uid: 'grid-old',
    parentId: 'tabs-old',
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          uid: 'details-old',
          parentId: 'grid-old',
          use: 'DetailsBlockModel',
        },
      ],
    },
  };

  const output = execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'remap-tree',
      '--payload-json',
      JSON.stringify(payload),
      '--page-schema-uid',
      'k7n4x9p2q5ra',
      '--root-uid',
      'fresh-grid',
      '--root-parent-id',
      'tabs-k7n4x9p2q5ra',
      '--logical-path-prefix',
      'case9',
    ],
    {
      cwd: SKILL_ROOT,
      encoding: 'utf8',
    },
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.payload.uid, 'fresh-grid');
  assert.equal(parsed.payload.parentId, 'tabs-k7n4x9p2q5ra');
  assert.equal(parsed.payload.subModels.items[0].parentId, 'fresh-grid');
  assert.match(parsed.payload.subModels.items[0].uid, /^[a-z][a-z0-9]{11}$/);
});
