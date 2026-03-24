import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildInstanceFingerprint,
  createStableCacheStore,
} from './stable_cache.mjs';
import {
  classifyNoiseMessages,
  loadNoiseBaseline,
  matchNoiseFamily,
  recordNoiseRun,
  summarizeNoiseMessages,
} from './noise_baseline.mjs';
import {
  buildValidationSpecsForRun,
  compileBuildSpec,
  normalizeBuildSpec,
  normalizeVerifySpec,
} from './spec_contracts.mjs';
import {
  compareReadbackContract,
  evaluateBuildGate,
  evaluatePreOpenGate,
  evaluateStageGate,
  summarizeGateDecisions,
} from './gate_engine.mjs';
import {
  summarizePayloadTree,
} from './tree_summary.mjs';

function makeTempDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `runtime-engine-${testName}-`));
}

const STABLE_CACHE_CLI_PATH = fileURLToPath(new URL('./stable_cache.mjs', import.meta.url));

function makePrimitiveFirstInventory() {
  return {
    detected: true,
    flowSchema: {
      detected: true,
      rootPublicUses: ['TableBlockModel', 'DetailsBlockModel', 'CreateFormModel', 'EditFormModel', 'JSBlockModel', 'ChartBlockModel', 'GridCardBlockModel'],
      publicUseCatalog: [],
      missingUses: [],
      discoveryNotes: [],
    },
    collections: {
      detected: true,
      names: ['approvals'],
      byName: {
        approvals: {
          name: 'approvals',
          title: '审批单',
          titleField: 'title',
          fieldNames: ['title', 'status', 'applicant', 'createdAt'],
          scalarFieldNames: ['title', 'status', 'applicant', 'createdAt'],
          relationFields: [],
        },
      },
      discoveryNotes: [],
    },
  };
}

function makeFlowOnlyInventory() {
  return {
    detected: true,
    flowSchema: {
      detected: true,
      rootPublicUses: ['TableBlockModel', 'DetailsBlockModel', 'CreateFormModel', 'EditFormModel'],
      publicUseCatalog: [],
      missingUses: [],
      discoveryNotes: [],
    },
    collections: {
      detected: false,
      names: [],
      byName: {},
      discoveryNotes: [],
    },
  };
}

test('stable cache supports memory hits, disk hits and targeted invalidation', () => {
  const rootDir = makeTempDir('stable-cache');
  let nowMs = Date.UTC(2026, 2, 19, 0, 0, 0);
  const events = [];
  const store = createStableCacheStore({
    stateDir: rootDir,
    now: () => nowMs,
    onEvent: (event) => events.push(event),
  });
  const instanceFingerprint = buildInstanceFingerprint({
    urlBase: 'http://localhost:23000',
    appVersion: '1.0.0',
    enabledPluginNames: ['workflow', 'ui'],
  });

  const writeResult = store.set({
    kind: 'schemas',
    instanceFingerprint,
    identity: 'RootPageModel|TableBlockModel',
    value: { uses: 2 },
  });
  assert.equal(writeResult.entry.kind, 'schemas');

  const memoryRead = store.get({
    kind: 'schemas',
    instanceFingerprint,
    identity: 'RootPageModel|TableBlockModel',
  });
  assert.equal(memoryRead.hit, true);
  assert.equal(memoryRead.source, 'memory');

  nowMs += 1;
  const secondStore = createStableCacheStore({
    stateDir: rootDir,
    now: () => nowMs,
  });
  const diskRead = secondStore.get({
    kind: 'schemas',
    instanceFingerprint,
    identity: 'RootPageModel|TableBlockModel',
  });
  assert.equal(diskRead.hit, true);
  assert.equal(['memory', 'disk'].includes(diskRead.source), true);

  const invalidateResult = secondStore.invalidate({
    kind: 'schemas',
    instanceFingerprint,
    identity: 'RootPageModel|TableBlockModel',
  });
  assert.equal(invalidateResult.ok, true);

  const miss = secondStore.get({
    kind: 'schemas',
    instanceFingerprint,
    identity: 'RootPageModel|TableBlockModel',
  });
  assert.equal(miss.hit, false);
  assert.equal(events.some((event) => event.action === 'cache_store'), true);
});

test('stable cache does not reuse memory entries across different state directories', () => {
  const firstRootDir = makeTempDir('stable-cache-first');
  const secondRootDir = makeTempDir('stable-cache-second');
  const instanceFingerprint = buildInstanceFingerprint({
    urlBase: 'http://localhost:23000',
    appVersion: '1.0.0',
    enabledPluginNames: ['workflow', 'ui'],
  });

  const firstStore = createStableCacheStore({ stateDir: firstRootDir });
  const secondStore = createStableCacheStore({ stateDir: secondRootDir });

  firstStore.set({
    kind: 'schemas',
    instanceFingerprint,
    identity: 'RootPageModel|TableBlockModel',
    value: { uses: 2 },
  });

  const secondRead = secondStore.get({
    kind: 'schemas',
    instanceFingerprint,
    identity: 'RootPageModel|TableBlockModel',
  });

  assert.equal(secondRead.hit, false);
  assert.equal(secondRead.source, 'miss');
});

test('stable cache CLI supports summary-only mode and value-file-out for large payloads', () => {
  const rootDir = makeTempDir('stable-cache-cli');
  const instanceFingerprint = buildInstanceFingerprint({
    urlBase: 'http://localhost:23000',
    appVersion: '1.0.0',
    enabledPluginNames: ['workflow', 'ui'],
  });
  const largeValue = {
    data: Array.from({ length: 64 }, (_, index) => ({
      uid: `schema-${index}`,
      source: 'x'.repeat(2048),
    })),
  };
  const inputFile = path.join(rootDir, 'input.json');
  const outputFile = path.join(rootDir, 'cached-value.json');
  fs.writeFileSync(inputFile, JSON.stringify(largeValue), 'utf8');

  const setResult = JSON.parse(execFileSync('node', [
    STABLE_CACHE_CLI_PATH,
    'set',
    '--state-dir', rootDir,
    '--kind', 'schemas',
    '--instance-fingerprint', instanceFingerprint,
    '--identity', 'RootPageModel|TableBlockModel',
    '--value-file', inputFile,
    '--summary-only',
  ], { encoding: 'utf8' }));
  assert.equal(setResult.ok, true);
  assert.equal(setResult.entry.kind, 'schemas');
  assert.equal(Object.prototype.hasOwnProperty.call(setResult.entry, 'value'), false);
  assert.equal(setResult.entry.valueSummary.type, 'object');

  const getResult = JSON.parse(execFileSync('node', [
    STABLE_CACHE_CLI_PATH,
    'get',
    '--state-dir', rootDir,
    '--kind', 'schemas',
    '--instance-fingerprint', instanceFingerprint,
    '--identity', 'RootPageModel|TableBlockModel',
    '--summary-only',
    '--value-file-out', outputFile,
  ], { encoding: 'utf8' }));
  assert.equal(getResult.hit, true);
  assert.equal(getResult.source, 'disk');
  assert.equal(getResult.valueSummary.type, 'object');
  assert.equal(typeof getResult.valueFile, 'string');
  assert.deepEqual(JSON.parse(fs.readFileSync(outputFile, 'utf8')), largeValue);
});

test('noise baseline promotes repeated known warnings to baseline and keeps runtime exceptions blocking', () => {
  const rootDir = makeTempDir('noise-baseline');
  const instanceFingerprint = 'demo-fingerprint';
  const repeatedMessages = [
    'Warning: React does not recognize the `overflowMode` prop on a DOM element.',
    '[NocoBase] @nocobase/plugin-mobile is deprecated and may be removed in future versions.',
  ];

  assert.equal(matchNoiseFamily(repeatedMessages[0]).familyId, 'react-invalid-dom-prop');

  for (let index = 0; index < 3; index += 1) {
    recordNoiseRun({
      stateDir: rootDir,
      instanceFingerprint,
      runId: `run-${index}`,
      sessionId: `session-${index < 2 ? index : 0}`,
      summaries: summarizeNoiseMessages(repeatedMessages),
      success: true,
    });
  }

  const classified = classifyNoiseMessages({
    stateDir: rootDir,
    instanceFingerprint,
    messages: [
      ...repeatedMessages,
      'TypeError: Cannot read properties of undefined',
    ],
  });

  assert.equal(classified.baseline.length >= 1, true);
  assert.equal(classified.blocking.length, 1);
  assert.equal(classified.blocking[0].familyId, 'runtime-exception');
});

test('noise baseline rejects unsafe instance fingerprint paths', () => {
  const rootDir = makeTempDir('noise-baseline-invalid-fingerprint');

  assert.throws(
    () => recordNoiseRun({
      stateDir: rootDir,
      instanceFingerprint: '../escape',
      runId: 'run-1',
      sessionId: 'session-1',
      summaries: summarizeNoiseMessages([
        'Warning: React does not recognize the `overflowMode` prop on a DOM element.',
      ]),
      success: true,
    }),
    /must not contain ".."|must not contain path separators/,
  );

  assert.throws(
    () => classifyNoiseMessages({
      stateDir: rootDir,
      instanceFingerprint: '../escape',
      messages: ['TypeError: Cannot read properties of undefined'],
    }),
    /must not contain ".."|must not contain path separators/,
  );

  assert.throws(
    () => loadNoiseBaseline({
      stateDir: rootDir,
      instanceFingerprint: '../escape',
    }),
    /must not contain ".."|must not contain path separators/,
  );
});

test('spec normalization and compile derive guard requirements and readback contracts from primitives', () => {
  const normalized = normalizeBuildSpec({
    source: '构建客户工作台',
    target: {
      title: '客户工作台',
      candidatePageUrl: 'http://localhost:23000/admin/customer',
    },
    layout: {
      tabs: [
        {
          title: '客户概览',
          blocks: [
            {
              kind: 'Table',
              collectionName: 'customers',
              fields: ['code', 'name'],
              actions: [{ kind: 'edit-record-popup' }],
            },
          ],
        },
        {
          title: '跟进记录',
          blocks: [
            {
              kind: 'Details',
              collectionName: 'activities',
              fields: ['content'],
            },
          ],
        },
      ],
    },
  });

  const compiled = compileBuildSpec(normalized);
  assert.deepEqual(normalized.target.menuPlacement, {
    strategy: 'root',
    source: 'auto',
    groupTitle: '',
    groupReservationKey: '',
    existingGroupRouteId: '',
    existingGroupTitle: '',
  });
  assert.equal(compiled.compileArtifact.requiredUses.includes('RootPageTabModel'), true);
  assert.equal(compiled.compileArtifact.requiredUses.includes('EditActionModel'), true);
  assert.deepEqual(compiled.compileArtifact.guardRequirements.requiredTabs[0].titles, ['客户概览', '跟进记录']);
  assert.equal(compiled.compileArtifact.guardRequirements.requiredActions[0].collectionName, 'customers');
  assert.equal(compiled.compileArtifact.guardRequirements.metadataTrust.runtimeSensitive, 'unknown');
  assert.equal(
    compiled.compileArtifact.guardRequirements.expectedFilterContracts.some(
      (item) => item.use === 'TableBlockModel' && item.collectionName === 'customers' && item.dataScopeMode === 'empty',
    ),
    true,
  );
  assert.deepEqual(compiled.compileArtifact.readbackContract.requiredTabs, [
    {
      pageSignature: '$',
      pageUse: 'RootPageModel',
      titles: ['客户概览', '跟进记录'],
      requireBlockGrid: true,
      requiredBlockUses: ['TableBlockModel', 'DetailsBlockModel'],
    },
  ]);
  assert.deepEqual(compiled.compileArtifact.readbackContract.requiredScopes, [
    {
      scopePath: '$.page',
      scopeKind: 'root-page',
      pageUse: 'RootPageModel',
      tabTitle: '',
      requireBlockGrid: false,
      requiredBlockUses: [],
    },
    {
      scopePath: '$.page.tabs[0]',
      scopeKind: 'root-tab',
      pageUse: 'RootPageTabModel',
      tabTitle: '客户概览',
      requireBlockGrid: true,
      requiredBlockUses: ['TableBlockModel'],
    },
    {
      scopePath: '$.page.tabs[1]',
      scopeKind: 'root-tab',
      pageUse: 'RootPageTabModel',
      tabTitle: '跟进记录',
      requireBlockGrid: true,
      requiredBlockUses: ['DetailsBlockModel'],
    },
  ]);
  assert.deepEqual(compiled.compileArtifact.readbackContract.requiredGridMembership, [
    {
      scopePath: '$.page.tabs[0]',
      scopeKind: 'root-tab',
      gridUse: 'BlockGridModel',
      expectedItemCount: 1,
      expectedItemUses: ['TableBlockModel'],
      expectedItemUids: [],
      requireBidirectionalLayoutMatch: false,
    },
    {
      scopePath: '$.page.tabs[1]',
      scopeKind: 'root-tab',
      gridUse: 'BlockGridModel',
      expectedItemCount: 1,
      expectedItemUses: ['DetailsBlockModel'],
      expectedItemUids: [],
      requireBidirectionalLayoutMatch: false,
    },
  ]);
  assert.deepEqual(compiled.compileArtifact.readbackContract.requiredDetailsBlocks, [
    {
      scopePath: '$.page.tabs[1]',
      scopeKind: 'root-tab',
      collectionName: 'activities',
      fieldPaths: ['content'],
      minItemCount: 1,
      requireFilterByTkTemplate: false,
      expectedFilterByTkTemplate: '{{ctx.view.inputArgs.filterByTk}}',
    },
  ]);
  assert.equal(compiled.compileArtifact.readbackContract.requiredTabCount, 2);
  assert.equal(compiled.compileArtifact.selectedCandidateId, 'selected-primary');
  assert.equal(compiled.compileArtifact.candidateBuilds.length, 1);
  assert.equal(compiled.compileArtifact.requiredMetadataRefs.collections.includes('customers'), true);
  assert.equal(compiled.compileArtifact.primitiveTree.tabs[0].blocks[0].actions[0].use, 'EditActionModel');
  assert.equal(compiled.compileArtifact.primitiveTree.tabs[0].blocks[0].selectorContract.kind, 'any');
  assert.equal(compiled.compileArtifact.primitiveTree.tabs[0].blocks[0].dataScopeContract.mode, 'empty');
  assert.equal(compiled.compileArtifact.primitiveTree.tabs[0].blocks[0].actions[0].popup, null);
});

test('spec normalization preserves explicit grouped menu placement', () => {
  const normalized = normalizeBuildSpec({
    source: '构建审批工作台',
    target: {
      title: '审批工作台',
      menuPlacement: {
        strategy: 'group',
        source: 'explicit',
        groupTitle: '审批工作台',
        groupReservationKey: 'group-key-1',
      },
    },
    layout: {
      blocks: [
        {
          kind: 'Table',
          collectionName: 'approvals',
          fields: ['title', 'status'],
        },
      ],
    },
  });

  const compiled = compileBuildSpec(normalized);
  assert.deepEqual(normalized.target.menuPlacement, {
    strategy: 'group',
    source: 'explicit',
    groupTitle: '审批工作台',
    groupReservationKey: 'group-key-1',
    existingGroupRouteId: '',
    existingGroupTitle: '',
  });
  assert.deepEqual(compiled.compileArtifact.menuPlacement, normalized.target.menuPlacement);
});

test('spec normalization supports filter blocks, row actions and nested details blocks', () => {
  const compiled = compileBuildSpec({
    source: '构建综合工作台',
    target: {
      title: '综合工作台',
    },
    layout: {
      blocks: [
        {
          kind: 'Filter',
          collectionName: 'orders',
          fields: ['order_no', 'status'],
        },
        {
          kind: 'Table',
          collectionName: 'orders',
          fields: ['order_no', 'customer.name'],
          actions: [
            {
              kind: 'create-popup',
              popup: {
                blocks: [
                  {
                    kind: 'Form',
                    mode: 'create',
                    collectionName: 'orders',
                    fields: ['order_no'],
                  },
                ],
              },
            },
          ],
          rowActions: [
            {
              kind: 'view-record-popup',
              popup: {
                blocks: [
                  {
                    kind: 'Details',
                    collectionName: 'orders',
                    fields: ['order_no'],
                    blocks: [
                      {
                        kind: 'Table',
                        collectionName: 'order_items',
                        fields: ['quantity'],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(compiled.compileArtifact.requiredUses.includes('FilterFormBlockModel'), true);
  assert.equal(compiled.compileArtifact.requiredUses.includes('FilterFormItemModel'), true);
  assert.equal(compiled.compileArtifact.requiredUses.includes('TableActionsColumnModel'), true);
  assert.equal(compiled.compileArtifact.requiredUses.includes('AddNewActionModel'), true);
  assert.equal(compiled.compileArtifact.requiredUses.includes('ViewActionModel'), true);
  assert.equal(compiled.compileArtifact.requiredUses.includes('CreateFormModel'), true);
  assert.equal(compiled.compileArtifact.readbackContract.requireFilterManager, true);
  assert.equal(compiled.compileArtifact.readbackContract.requiredFilterManagerEntryCount, 2);
  assert.deepEqual(compiled.compileArtifact.guardRequirements.requiredFilters, [
    {
      path: '$.page.blocks[0]',
      pageSignature: '$',
      pageUse: 'RootPageModel',
      tabTitle: '',
      collectionName: 'orders',
      fields: ['order_no', 'status'],
      targetUses: ['TableBlockModel'],
    },
  ]);
  assert.deepEqual(compiled.compileArtifact.readbackContract.requiredFilterBindings, [
    {
      pageSignature: '$',
      pageUse: 'RootPageModel',
      tabTitle: '',
      filterPath: '$.page.blocks[0]',
      filterUse: 'FilterFormBlockModel',
      collectionName: 'orders',
      filterFields: ['order_no', 'status'],
      targetUses: ['TableBlockModel'],
    },
  ]);
  assert.equal(compiled.compileArtifact.readbackContract.requiredScopes.some((item) => item.scopePath === '$.page'), true);
  assert.equal(
    compiled.compileArtifact.readbackContract.requiredScopes.some(
      (item) => item.scopePath === '$.page.blocks[1].row-actions[0].popup.page'
        && item.scopeKind === 'popup-page'
        && item.requiredBlockUses.includes('DetailsBlockModel'),
    ),
    true,
  );
  assert.deepEqual(compiled.compileArtifact.readbackContract.requiredDetailsBlocks, [
    {
      scopePath: '$.page.blocks[1].row-actions[0].popup.page',
      scopeKind: 'popup-page',
      collectionName: 'orders',
      fieldPaths: ['order_no'],
      minItemCount: 1,
      requireFilterByTkTemplate: true,
      expectedFilterByTkTemplate: '{{ctx.view.inputArgs.filterByTk}}',
    },
  ]);
  assert.equal(compiled.compileArtifact.primitiveTree.blocks[1].rowActions[0].use, 'ViewActionModel');
  assert.equal(compiled.compileArtifact.primitiveTree.blocks[1].rowActions[0].popup.blocks[0].use, 'DetailsBlockModel');
  assert.equal(compiled.compileArtifact.primitiveTree.blocks[1].rowActions[0].popup.blocks[0].blocks[0].use, 'TableBlockModel');
});

test('tree summary captures BlockGridModel filterManager bindings', () => {
  const summary = summarizePayloadTree({
    targetSignature: 'page.grid',
    payload: {
      use: 'BlockGridModel',
      filterManager: [
        {
          filterId: 'customer-filter',
          targetId: 'orders-table',
          filterPaths: ['customer.id'],
        },
        {
          filterId: 'order-no-filter',
          targetId: 'orders-table',
          filterPaths: ['order_no'],
        },
      ],
      subModels: {
        items: [
          { use: 'FilterFormBlockModel' },
          { use: 'TableBlockModel' },
        ],
      },
    },
  });

  assert.deepEqual(summary.topLevelUses, ['FilterFormBlockModel', 'TableBlockModel']);
  assert.equal(summary.filterManagerEntryCount, 2);
  assert.deepEqual(summary.filterManagerBindings, [
    'customer-filter->orders-table:customer.id',
    'order-no-filter->orders-table:order_no',
  ]);
  assert.equal(summary.filterContainers.length, 1);
  assert.equal(summary.filterContainers[0].use, 'TableBlockModel');
  assert.equal(summary.filterContainers[0].dataScopeNonEmpty, false);
});

test('tree summary captures duplicate tabs and filter container hashes', () => {
  const summary = summarizePayloadTree({
    targetSignature: 'page.root',
    payload: {
      use: 'RootPageModel',
      subModels: {
        tabs: [
          {
            use: 'RootPageTabModel',
            stepParams: {
              pageTabSettings: {
                tab: {
                  title: '客户概览',
                },
              },
            },
            subModels: {
              grid: {
                use: 'BlockGridModel',
                subModels: {
                  items: [
                    {
                      uid: 'customer-details',
                      use: 'DetailsBlockModel',
                      stepParams: {
                        resourceSettings: {
                          init: {
                            collectionName: 'customers',
                            filterByTk: '{{ctx.record.id}}',
                          },
                        },
                        detailsSettings: {
                          dataScope: {
                            filter: {
                              logic: '$and',
                              items: [
                                {
                                  path: 'name',
                                  operator: '$notNull',
                                  value: true,
                                },
                              ],
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          {
            use: 'RootPageTabModel',
            stepParams: {
              pageTabSettings: {
                tab: {
                  title: '客户概览',
                },
              },
            },
            subModels: {
              grid: {
                use: 'BlockGridModel',
                subModels: {
                  items: [],
                },
              },
            },
          },
        ],
      },
    },
  });

  assert.deepEqual(summary.pageGroups[0].duplicateTabTitles, ['客户概览']);
  assert.equal(summary.filterContainers.length, 1);
  assert.equal(summary.filterContainers[0].blockSignature, 'uid:customer-details');
  assert.equal(summary.filterContainers[0].hasFilterByTk, true);
  assert.equal(summary.filterContainers[0].dataScopeNonEmpty, true);
  assert.match(summary.filterContainers[0].dataScopeHash, /"\$notNull"/);
});

test('spec normalization defaults popup pages to ChildPageModel instead of generic PageModel', () => {
  const compiled = compileBuildSpec({
    source: '构建订单查看弹窗',
    target: {
      title: '订单工作台',
    },
    layout: {
      blocks: [
        {
          kind: 'Table',
          collectionName: 'orders',
          fields: ['order_no'],
          actions: [
            {
              kind: 'edit-record-popup',
              popup: {
                blocks: [
                  {
                    kind: 'Details',
                    collectionName: 'order_items',
                    fields: ['id'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(compiled.compileArtifact.requiredUses.includes('ChildPageModel'), true);
  assert.equal(compiled.compileArtifact.requiredUses.includes('DetailsBlockModel'), true);
  assert.equal(compiled.compileArtifact.primitiveTree.blocks[0].actions[0].use, 'EditActionModel');
  assert.equal(compiled.compileArtifact.primitiveTree.blocks[0].actions[0].popup.pageUse, 'ChildPageModel');
  assert.equal(compiled.compileArtifact.primitiveTree.blocks[0].actions[0].popup.blocks[0].use, 'DetailsBlockModel');
  assert.equal(
    compiled.compileArtifact.primitiveTree.blocks[0].actions[0].popup.blocks[0].path,
    '$.page.blocks[0].block-actions[0].popup.page.blocks[0]',
  );
  assert.equal(compiled.compileArtifact.requiredMetadataRefs.collections.includes('order_items'), true);
  assert.equal(compiled.compileArtifact.requiredMetadataRefs.fields.includes('order_items.id'), true);
});

test('spec normalization maps Form.mode to the correct concrete form model and rejects unknown mode', () => {
  const compiled = compileBuildSpec({
    source: '构建编辑表单',
    target: {
      title: '编辑订单',
    },
    layout: {
      blocks: [
        {
          kind: 'Form',
          mode: 'edit',
          collectionName: 'orders',
          fields: ['status'],
        },
      ],
    },
  });

  assert.equal(compiled.compileArtifact.primitiveTree.blocks[0].use, 'EditFormModel');
  assert.throws(() => normalizeBuildSpec({
    source: '构建未知表单',
    target: {
      title: '未知表单',
    },
    layout: {
      blocks: [
        {
          kind: 'Form',
          mode: 'preview',
          collectionName: 'orders',
        },
      ],
    },
  }), /mode must be one of create, edit/);
});

test('spec normalization rejects popup tabs DSL for now', () => {
  assert.throws(() => normalizeBuildSpec({
    source: '构建多 tab popup',
    target: {
      title: '订单工作台',
    },
    layout: {
      blocks: [
        {
          kind: 'Table',
          collectionName: 'orders',
          actions: [
            {
              kind: 'edit-record-popup',
              popup: {
                tabs: [
                  {
                    title: '详情',
                    blocks: [],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  }), /tabs is not supported yet/);
});

test('spec normalization rejects unsupported generic action kinds instead of silently falling back to ActionModel', () => {
  assert.throws(() => normalizeBuildSpec({
    source: '构建未知动作',
    target: {
      title: '未知动作页面',
    },
    layout: {
      blocks: [
        {
          kind: 'Table',
          collectionName: 'orders',
          actions: [
            {
              kind: 'custom-action',
            },
          ],
        },
      ],
    },
  }), /Unsupported action kind "custom-action"/);
});

test('spec normalization supports source-exposed public block uses', () => {
  const compiled = compileBuildSpec({
    source: '生成图表看板',
    target: {
      title: '图表看板',
    },
    layout: {
      blocks: [
        {
          kind: 'PublicUse',
          use: 'ChartBlockModel',
          title: '趋势图',
        },
      ],
    },
  });

  assert.equal(compiled.compileArtifact.requiredUses.includes('ChartBlockModel'), true);
  assert.equal(compiled.compileArtifact.generatedCoverage.blocks.includes('ChartBlockModel'), true);
});

test('validation run helper emits primitive-first ready specs when live inventory is provided', async () => {
  const result = await buildValidationSpecsForRun({
    caseRequest: '请生成 approvals 审批流程 validation 页面，展示 status applicant',
    sessionId: '20260319T075530-approval',
    baseSlug: 'approvals',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-20260319',
    sessionDir: '/tmp/session',
    randomSeed: 'approval-seed',
    instanceInventory: makePrimitiveFirstInventory(),
  });

  assert.equal(result.buildSpec.target.buildPolicy, 'fresh');
  assert.equal(result.verifySpec.entry.requiresAuth, true);
  assert.equal(result.compileArtifact.compileMode, 'primitive-tree');
  assert.equal(result.compileArtifact.planningMode, 'creative-first');
  assert.match(result.compileArtifact.scenarioId, /^creative-first:approvals:/);
  assert.equal(result.compileArtifact.selectionMode, 'creative-first');
  assert.equal(typeof result.compileArtifact.primaryBlockType === 'string' && result.compileArtifact.primaryBlockType.length > 0, true);
  assert.equal(result.compileArtifact.generatedCoverage.blocks.includes('GridCardBlockModel'), true);
  assert.equal(result.compileArtifact.generatedCoverage.patterns.includes('popup-openview'), true);
  assert.equal(result.compileArtifact.issues[0].code, 'PRIMITIVE_FIRST_SCENARIO_GENERATED');
  assert.equal(result.compileArtifact.actionPlan.some((item) => item.kind === 'delete-record'), true);
  assert.equal(typeof result.compileArtifact.selectedCandidateId === 'string' && result.compileArtifact.selectedCandidateId.length > 0, true);
  assert.equal(result.compileArtifact.layoutCandidates.length, 5);
  assert.equal(result.compileArtifact.candidateBuilds.length, 5);
  assert.equal(Array.isArray(result.compileArtifact.eligibleUses), true);
  assert.equal(typeof result.compileArtifact.candidateScores['keyword-anchor']?.score === 'number', true);
  assert.equal(typeof result.compileArtifact.candidateShape['tabbed-multi-surface'] === 'string', true);
  assert.equal(typeof result.compileArtifact.pagePlan?.structureKind === 'string', true);
  assert.equal(Array.isArray(result.compileArtifact.pagePlan?.sections), true);
  assert.equal(
    result.compileArtifact.pagePlan.sections.some((section) => section.role === 'primary')
      || result.compileArtifact.pagePlan.tabs.some((tab) => tab.sections.some((section) => section.role === 'primary')),
    true,
  );
  assert.equal(result.compileArtifact.candidateBuilds.every((item) => item.pagePlan && typeof item.pagePlan.structureKind === 'string'), true);
  assert.equal(result.compileArtifact.guardRequirements.allowedBusinessBlockUses.includes('TableBlockModel'), true);
  assert.equal(result.verifySpec.stages.length >= 1, true);
  assert.deepEqual(result.menuPlacement, {
    strategy: 'root',
    source: 'auto',
    groupTitle: '',
    groupReservationKey: '',
    existingGroupRouteId: '',
    existingGroupTitle: '',
  });
});

test('validation run helper auto-groups system-level single-page requests', async () => {
  const result = await buildValidationSpecsForRun({
    caseRequest: '基于 approvals 创建一个审批工作台，展示 status applicant，并带筛选。',
    sessionId: '20260322T120000-approval-system',
    baseSlug: 'approvals',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-system',
    sessionDir: '/tmp/session',
    randomSeed: 'approval-seed',
    instanceInventory: makePrimitiveFirstInventory(),
  });

  assert.equal(result.menuPlacement.strategy, 'group');
  assert.equal(result.menuPlacement.source, 'auto');
  assert.equal(result.menuPlacement.groupTitle, '审批工作台');
  assert.match(result.menuPlacement.groupReservationKey, /^[a-z][a-z0-9]{11}$/);
  assert.deepEqual(result.compileArtifact.menuPlacement, result.menuPlacement);
});

test('validation run helper lets explicit root placement override system-level auto grouping', async () => {
  const result = await buildValidationSpecsForRun({
    caseRequest: '基于 approvals 创建一个审批工作台，展示 status applicant，并带筛选。',
    sessionId: '20260322T120000-approval-root',
    baseSlug: 'approvals',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-root',
    sessionDir: '/tmp/session',
    randomSeed: 'approval-seed',
    instanceInventory: makePrimitiveFirstInventory(),
    menuPlacement: {
      mode: 'root',
    },
  });

  assert.equal(result.menuPlacement.strategy, 'root');
  assert.equal(result.menuPlacement.source, 'explicit');
});

test('validation run helper probes missing collection inventory before planning when only flow schema inventory is provided', async () => {
  const previousToken = process.env.NOCOBASE_API_TOKEN;
  process.env.NOCOBASE_API_TOKEN = 'demo-token';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/api/app:getInfo')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ data: { version: '2.0.0' } });
        },
      };
    }
    if (String(url).endsWith('/api/pm:listEnabled')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ data: [] });
        },
      };
    }
    if (String(url).endsWith('/api/flowModels:schemaBundle')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            data: {
              items: [
                {
                  use: 'BlockGridModel',
                  subModelCatalog: {
                    items: {
                      type: 'array',
                      candidates: [
                        { use: 'TableBlockModel' },
                        { use: 'DetailsBlockModel' },
                      ],
                    },
                  },
                },
              ],
            },
          });
        },
      };
    }
    if (String(url).endsWith('/api/flowModels:schemas')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ data: [] });
        },
      };
    }
    if (String(url).includes('/api/collections:listMeta')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            data: [
              {
                name: 'approvals',
                title: '审批单',
                titleField: 'title',
                fields: [
                  { name: 'title', type: 'string', interface: 'input' },
                  { name: 'status', type: 'string', interface: 'select' },
                  { name: 'applicant', type: 'string', interface: 'input' },
                ],
              },
            ],
          });
        },
      };
    }
    return {
      ok: false,
      status: 404,
      async text() {
        return JSON.stringify({ errors: [{ message: 'not found' }] });
      },
    };
  };

  try {
    const result = await buildValidationSpecsForRun({
      caseRequest: '请生成 approvals 审批流程 validation 页面，展示 status applicant',
      sessionId: '20260322T120000-approval-probe',
      baseSlug: 'approvals',
      candidatePageUrl: 'http://localhost:23000/admin/approvals-probe',
      sessionDir: '/tmp/session',
      randomSeed: 'approval-seed',
      instanceInventory: makeFlowOnlyInventory(),
    });

    assert.equal(result.compileArtifact.planningStatus, 'ready');
    assert.equal(result.compileArtifact.instanceInventory.collections.detected, true);
    assert.deepEqual(result.compileArtifact.instanceInventory.collections.names, ['approvals']);
    assert.deepEqual(result.compileArtifact.targetCollections, ['approvals']);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) {
      delete process.env.NOCOBASE_API_TOKEN;
    } else {
      process.env.NOCOBASE_API_TOKEN = previousToken;
    }
  }
});

test('validation run helper blocks before planning when collection inventory is missing and probing is unavailable', async () => {
  const previousDisableProbe = process.env.NOCOBASE_DISABLE_INSTANCE_PROBE;
  const previousToken = process.env.NOCOBASE_API_TOKEN;
  process.env.NOCOBASE_DISABLE_INSTANCE_PROBE = 'true';
  delete process.env.NOCOBASE_API_TOKEN;

  try {
    const result = await buildValidationSpecsForRun({
      caseRequest: '请生成 approvals 审批流程 validation 页面，展示 status applicant',
      sessionId: '20260322T120000-approval-blocked',
      baseSlug: 'approvals',
      candidatePageUrl: 'http://localhost:23000/admin/approvals-blocked',
      sessionDir: '/tmp/session',
      randomSeed: 'approval-seed',
      instanceInventory: makeFlowOnlyInventory(),
    });

    assert.equal(result.compileArtifact.planningStatus, 'blocked');
    assert.equal(result.compileArtifact.issues[0].code, 'LIVE_COLLECTION_INVENTORY_REQUIRED');
    assert.deepEqual(result.compileArtifact.targetCollections, []);
    assert.equal(result.compileArtifact.layoutCandidates.length, 0);
  } finally {
    if (previousDisableProbe === undefined) {
      delete process.env.NOCOBASE_DISABLE_INSTANCE_PROBE;
    } else {
      process.env.NOCOBASE_DISABLE_INSTANCE_PROBE = previousDisableProbe;
    }
    if (previousToken === undefined) {
      delete process.env.NOCOBASE_API_TOKEN;
    } else {
      process.env.NOCOBASE_API_TOKEN = previousToken;
    }
  }
});

test('validation run helper splits explicit multi-page requests into page-level specs and blocks aggregate build', async () => {
  const result = await buildValidationSpecsForRun({
    caseRequest: '基于 approvals 创建两个页面：1. 审批列表页，展示 status applicant，并带筛选；2. 审批详情页，展示 title status createdAt。',
    sessionId: '20260322T120000-approval-multi',
    baseSlug: 'approvals',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-multi',
    sessionDir: '/tmp/session',
    randomSeed: 'approval-seed',
    instanceInventory: makePrimitiveFirstInventory(),
  });

  assert.equal(result.compileArtifact.issues[0].code, 'MULTI_PAGE_REQUEST_SPLIT_REQUIRED');
  assert.equal(result.compileArtifact.planningStatus, 'blocked');
  assert.equal(result.compileArtifact.multiPageRequest.detected, true);
  assert.equal(result.compileArtifact.multiPageRequest.pageCount, 2);
  assert.equal(Array.isArray(result.pageBuilds), true);
  assert.equal(result.pageBuilds.length, 2);
  assert.deepEqual(result.pageBuilds[0].compileArtifact.targetCollections, ['approvals']);
  assert.deepEqual(result.pageBuilds[1].compileArtifact.targetCollections, ['approvals']);
  assert.equal(result.pageBuilds.every((item) => item.compileArtifact.planningStatus === 'ready'), true);
  assert.equal(result.menuPlacement.strategy, 'group');
  assert.equal(result.menuPlacement.groupTitle, '审批单');
  assert.equal(result.pageBuilds.every((item) => item.menuPlacement.strategy === 'group'), true);
  assert.equal(
    result.pageBuilds.every((item) => item.menuPlacement.groupReservationKey === result.pageBuilds[0].menuPlacement.groupReservationKey),
    true,
  );
});

test('validation run helper blocks immediately when no collection inventory source is available at all', async () => {
  const previousProbe = process.env.NOCOBASE_DISABLE_INSTANCE_PROBE;
  const previousToken = process.env.NOCOBASE_API_TOKEN;
  process.env.NOCOBASE_DISABLE_INSTANCE_PROBE = 'true';
  delete process.env.NOCOBASE_API_TOKEN;

  try {
    const result = await buildValidationSpecsForRun({
      caseRequest: '搭一个完全新的未知场景',
      sessionId: '20260319T075530-custom',
      baseSlug: 'unknown-demo',
      candidatePageUrl: 'http://localhost:23000/admin/unknown-demo',
      sessionDir: '/tmp/session',
      randomSeed: 'unknown-seed',
    });

    assert.equal(Boolean(result.compileArtifact.scenarioId), true);
    assert.equal(result.compileArtifact.selectionMode, 'request-gate');
    assert.equal(result.compileArtifact.planningStatus, 'blocked');
    assert.equal(result.compileArtifact.generatedCoverage.blocks.length, 0);
    assert.equal(Array.isArray(result.compileArtifact.availableUses), true);
    assert.equal(result.compileArtifact.issues[0].code, 'LIVE_COLLECTION_INVENTORY_REQUIRED');
    assert.equal(result.verifySpec.stages.length, 0);
  } finally {
    if (previousProbe === undefined) {
      delete process.env.NOCOBASE_DISABLE_INSTANCE_PROBE;
    } else {
      process.env.NOCOBASE_DISABLE_INSTANCE_PROBE = previousProbe;
    }
    if (previousToken === undefined) {
      delete process.env.NOCOBASE_API_TOKEN;
    } else {
      process.env.NOCOBASE_API_TOKEN = previousToken;
    }
  }
});

test('verify spec normalization preserves stages and pre-open assertions', () => {
  const spec = normalizeVerifySpec({
    source: '验证 tabs',
    entry: {
      pageUrl: 'http://localhost:23000/admin/demo',
    },
    preOpen: {
      assertions: [
        {
          kind: 'bodyTextIncludesAll',
          values: ['客户概览'],
        },
      ],
    },
    stages: [
      {
        id: 'contacts',
        title: '联系人',
        trigger: { kind: 'click-tab', text: '联系人' },
        waitFor: { kind: 'bodyTextIncludesAll', values: ['李晨'] },
      },
    ],
  });

  assert.equal(spec.preOpen.assertions.length, 1);
  assert.equal(spec.stages[0].id, 'contacts');
});

test('gate engine fails fast on guard blockers, readback mismatch and pre-open blockers', () => {
  const buildDecision = evaluateBuildGate({
    guardResult: {
      blockers: [{ code: 'REQUIRED_VISIBLE_TABS_MISSING' }],
    },
    writeResult: { ok: true },
    readbackContract: {},
    readbackResult: {},
  });
  assert.equal(buildDecision.status, 'failed');
  assert.equal(buildDecision.reasonCode, 'GUARD_BLOCKERS');

  const mismatch = compareReadbackContract({
    requiredTabs: [
      {
        pageSignature: '$',
        pageUse: 'RootPageModel',
        titles: ['客户概览'],
        requireBlockGrid: true,
      },
    ],
    requiredVisibleTabs: ['客户概览'],
    requiredTabCount: 1,
  }, {
    summary: summarizePayloadTree({
      targetSignature: 'root.page',
      payload: {
        use: 'RootPageModel',
        subModels: {
          tabs: [
            {
              use: 'RootPageTabModel',
              stepParams: {
                pageTabSettings: {
                  tab: {
                    title: '联系人',
                  },
                },
              },
              subModels: {
                grid: {
                  use: 'BlockGridModel',
                  subModels: {
                    items: [],
                  },
                },
              },
            },
          ],
        },
      },
    }),
    tabTitles: ['联系人'],
    tabCount: 1,
  });
  assert.equal(mismatch.length, 1);

  const topLevelUsesSubsetMismatch = compareReadbackContract({
    requiredTopLevelUses: ['DetailsBlockModel'],
  }, {
    topLevelUses: ['DetailsBlockModel', 'TableBlockModel'],
  });
  assert.deepEqual(topLevelUsesSubsetMismatch, []);

  const filterMismatch = compareReadbackContract({
    requireFilterManager: true,
    requiredFilterManagerEntryCount: 2,
  }, {
    summary: summarizePayloadTree({
      targetSignature: 'default-grid',
      payload: {
        use: 'BlockGridModel',
        subModels: {
          items: [
            { use: 'FilterFormBlockModel' },
            { use: 'TableBlockModel' },
          ],
        },
        filterManager: [
          {
            filterId: 'order-no-filter',
            targetId: 'orders-table',
            filterPaths: ['order_no'],
          },
        ],
      },
    }),
  });
  assert.deepEqual(filterMismatch, [
    'requiredFilterManagerEntryCount expected=2 actual=1',
  ]);

  const structuredEnvelopeMismatch = compareReadbackContract({
    requiredVisibleTabs: ['联系人'],
    requiredTopLevelUses: ['RootPageTabModel'],
    requiredTabCount: 1,
    requiredFilterManagerEntryCount: 1,
  }, {
    ok: true,
    data: {
      summary: summarizePayloadTree({
        targetSignature: 'page.root',
        payload: {
          use: 'RootPageModel',
          subModels: {
            tabs: [
              {
                use: 'RootPageTabModel',
                stepParams: {
                  pageTabSettings: {
                    tab: {
                      title: '联系人',
                    },
                  },
                },
              },
            ],
          },
          filterManager: [
            {
              filterId: 'contact-filter',
              targetId: 'contacts-table',
              filterPaths: ['name'],
            },
          ],
        },
      }),
    },
  });
  assert.deepEqual(structuredEnvelopeMismatch, []);

  const writeSummary = summarizePayloadTree({
    targetSignature: 'customer-details',
    payload: {
      use: 'BlockGridModel',
      subModels: {
        items: [
          {
            uid: 'customer-details',
            use: 'DetailsBlockModel',
            stepParams: {
              resourceSettings: {
                init: {
                  collectionName: 'customers',
                  filterByTk: '{{ctx.record.id}}',
                },
              },
              detailsSettings: {
                dataScope: {
                  filter: {
                    logic: '$and',
                    items: [],
                  },
                },
              },
            },
          },
        ],
      },
    },
  });
  const readbackSummary = summarizePayloadTree({
    targetSignature: 'customer-details',
    payload: {
      use: 'BlockGridModel',
      subModels: {
        items: [
          {
            uid: 'customer-details',
            use: 'DetailsBlockModel',
            stepParams: {
              resourceSettings: {
                init: {
                  collectionName: 'customers',
                  filterByTk: '{{ctx.record.id}}',
                },
              },
              detailsSettings: {
                dataScope: {
                  filter: {
                    logic: '$and',
                    items: [
                      {
                        path: 'name',
                        operator: '$notNull',
                        value: true,
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    },
  });
  const filterDriftMismatch = compareReadbackContract({}, { summary: readbackSummary }, { summary: writeSummary });
  assert.equal(
    filterDriftMismatch.some((item) => item.startsWith('READBACK_UNEXPECTED_FILTER_DRIFT block=uid:customer-details')),
    true,
  );

  const duplicateTabsDecision = evaluateBuildGate({
    guardResult: {
      blockers: [],
    },
    writeResult: {
      ok: true,
      summary: summarizePayloadTree({
        targetSignature: 'page.root',
        payload: {
          use: 'RootPageModel',
          subModels: {
            tabs: [
              {
                use: 'RootPageTabModel',
                stepParams: {
                  pageTabSettings: {
                    tab: {
                      title: '客户概览',
                    },
                  },
                },
                subModels: {
                  grid: {
                    use: 'BlockGridModel',
                    subModels: {
                      items: [],
                    },
                  },
                },
              },
            ],
          },
        },
      }),
    },
    readbackContract: {},
    readbackResult: {
      summary: summarizePayloadTree({
        targetSignature: 'page.root',
        payload: {
          use: 'RootPageModel',
          subModels: {
            tabs: [
              {
                use: 'RootPageTabModel',
                stepParams: {
                  pageTabSettings: {
                    tab: {
                      title: '客户概览',
                    },
                  },
                },
                subModels: {
                  grid: {
                    use: 'BlockGridModel',
                    subModels: {
                      items: [],
                    },
                  },
                },
              },
              {
                use: 'RootPageTabModel',
                stepParams: {
                  pageTabSettings: {
                    tab: {
                      title: '客户概览',
                    },
                  },
                },
                subModels: {
                  grid: {
                    use: 'BlockGridModel',
                    subModels: {
                      items: [],
                    },
                  },
                },
              },
            ],
          },
        },
      }),
    },
  });
  assert.equal(duplicateTabsDecision.reasonCode, 'READBACK_DUPLICATE_TABS');
  assert.equal(duplicateTabsDecision.findings[0].startsWith('READBACK_DUPLICATE_TABS'), true);

  const preOpenDecision = evaluatePreOpenGate({
    reachable: true,
    redirected: false,
    blockingFindings: ['runtime-exception'],
    assertions: [],
  });
  assert.equal(preOpenDecision.status, 'failed');
  assert.equal(preOpenDecision.stoppedRemainingWork, true);

  const stageDecision = evaluateStageGate({
    stageId: 'contacts',
    actionOk: true,
    waitOk: false,
    assertions: [],
  });
  assert.equal(stageDecision.reasonCode, 'STAGE_WAIT_FAILED');

  const summary = summarizeGateDecisions([buildDecision, preOpenDecision, stageDecision]);
  assert.equal(summary.failed, 3);
  assert.equal(summary.stopped, 3);
});
