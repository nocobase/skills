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
  assert.equal(compiled.compileArtifact.requiredUses.includes('RootPageTabModel'), true);
  assert.equal(compiled.compileArtifact.requiredUses.includes('EditActionModel'), true);
  assert.deepEqual(compiled.compileArtifact.guardRequirements.requiredTabs[0].titles, ['客户概览', '跟进记录']);
  assert.equal(compiled.compileArtifact.guardRequirements.requiredActions[0].collectionName, 'customers');
  assert.deepEqual(compiled.compileArtifact.readbackContract.requiredTabs, [
    {
      pageSignature: '$',
      pageUse: 'RootPageModel',
      titles: ['客户概览', '跟进记录'],
      requireBlockGrid: true,
    },
  ]);
  assert.equal(compiled.compileArtifact.readbackContract.requiredTabCount, 2);
  assert.equal(compiled.compileArtifact.requiredMetadataRefs.collections.includes('customers'), true);
  assert.equal(compiled.compileArtifact.primitiveTree.tabs[0].blocks[0].actions[0].use, 'EditActionModel');
  assert.equal(compiled.compileArtifact.primitiveTree.tabs[0].blocks[0].actions[0].popup, null);
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
                    collectionName: 'orders',
                    fields: ['order_no'],
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
  assert.equal(compiled.compileArtifact.primitiveTree.blocks[0].actions[0].use, 'EditActionModel');
  assert.equal(compiled.compileArtifact.primitiveTree.blocks[0].actions[0].popup.pageUse, 'ChildPageModel');
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

test('validation run helper emits default BuildSpec and VerifySpec artifacts', () => {
  const result = buildValidationSpecsForRun({
    caseRequest: '针对 case9 跑完整流程',
    sessionId: '20260319T075530-case9',
    baseSlug: 'case9',
    candidatePageUrl: 'http://localhost:23000/admin/case9-20260319',
    sessionDir: '/tmp/session',
  });

  assert.equal(result.buildSpec.target.buildPolicy, 'fresh');
  assert.equal(result.verifySpec.entry.requiresAuth, true);
  assert.equal(result.compileArtifact.compileMode, 'primitive-tree');
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
