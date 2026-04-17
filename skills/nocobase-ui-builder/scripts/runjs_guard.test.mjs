import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  canonicalizeRunJSCode,
  collectRunJSNodes,
  inspectRunJSCode,
  inspectRunJSPayloadStatic,
  inspectRunJSStaticCode,
} from './runjs_guard.mjs';

const SNAPSHOT_PATH = fileURLToPath(new URL('./runjs_contract_snapshot.json', import.meta.url));

test('collectRunJSNodes discovers JS block, field and action RunJS payloads', () => {
  const payload = {
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          use: 'JSBlockModel',
          stepParams: {
            jsSettings: {
              runJs: {
                code: 'return 1',
                version: 'v1',
              },
            },
          },
        },
        {
          use: 'JSFieldModel',
          stepParams: {
            jsSettings: {
              runJs: {
                code: 'return ctx.value',
                version: 'v2',
              },
            },
          },
        },
        {
          use: 'JSActionModel',
          clickSettings: {
            runJs: {
              code: 'await ctx.request({ url: "tasks:list" })',
              version: 'v1',
            },
          },
        },
      ],
    },
  };

  const nodes = collectRunJSNodes(payload);
  assert.deepEqual(
    nodes.map((item) => ({ path: item.path, modelUse: item.modelUse, version: item.version })),
    [
      {
        path: '$.subModels.items[0].stepParams.jsSettings.runJs',
        modelUse: 'JSBlockModel',
        version: 'v1',
      },
      {
        path: '$.subModels.items[1].stepParams.jsSettings.runJs',
        modelUse: 'JSFieldModel',
        version: 'v2',
      },
      {
        path: '$.subModels.items[2].clickSettings.runJs',
        modelUse: 'JSActionModel',
        version: 'v1',
      },
    ],
  );
});

test('inspectRunJSCode blocks forbidden globals and unknown ctx members', async () => {
  const fetchResult = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: "await fetch('/api/auth:check')",
  });
  assert.equal(fetchResult.ok, false);
  assert.equal(fetchResult.blockers.some((item) => item.code === 'RUNJS_FORBIDDEN_GLOBAL'), true);

  const windowFetchResult = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: "await window.fetch('/api/tasks:list')",
  });
  assert.equal(windowFetchResult.ok, false);
  assert.equal(windowFetchResult.blockers.some((item) => item.code === 'RUNJS_FORBIDDEN_WINDOW_PROPERTY'), true);

  const unknownCtxResult = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: 'await ctx.foobar()',
  });
  assert.equal(unknownCtxResult.ok, false);
  assert.equal(unknownCtxResult.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_CTX_MEMBER'), true);
});

test('inspectRunJSCode warns on resource reads left on ctx.request and still allows JSX render', async () => {
  const requestResult = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: "await ctx.request({ url: 'users:list' })",
  });
  assert.equal(requestResult.ok, true);
  assert.equal(requestResult.execution.attempted, true);
  assert.equal(requestResult.warnings.some((item) => item.code === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'), true);
  assert.equal(requestResult.execution.semanticWarningCount > 0, true);

  const jsxResult = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: 'return ctx.render(<div>ok</div>)',
  });
  assert.equal(jsxResult.ok, true);
  assert.equal(Array.isArray(jsxResult.execution.logs), true);
});

test('inspectRunJSPayloadStatic reports payload blockers without runtime execution', () => {
  const result = inspectRunJSPayloadStatic({
    payload: {
      use: 'JSRecordActionModel',
      clickSettings: {
        runJs: {
          code: 'await ctx.unknownMethod()',
          version: 'v1',
        },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_CTX_MEMBER'), true);
  assert.equal(result.execution.runtimeAttempted, false);
  assert.equal(result.inspectedNodes.length, 1);
});

test('inspectRunJSCode does not mark resource API usage as runtime uncertain', async () => {
  const result = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: `const taskResource = ctx.makeResource('MultiRecordResource');
taskResource.setResourceName('task');
taskResource.setSort(['due_date']);
taskResource.setFilter({ owner_id: { $eq: 1 } });
await taskResource.refresh();`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((item) => item.code === 'RUNJS_RUNTIME_UNCERTAIN'), false);
});

test('canonicalizeRunJSCode rewrites auth check and list requests to stable resource patterns', () => {
  const authResult = canonicalizeRunJSCode({
    modelUse: 'JSBlockModel',
    code: "const response = await ctx.request({ url: '/api/auth:check', method: 'get' });",
  });
  assert.equal(authResult.changed, true);
  assert.equal(authResult.code.includes('ctx.user ?? ctx.auth?.user ?? null'), true);
  assert.equal(authResult.transforms.some((item) => item.code === 'RUNJS_AUTH_CHECK_TO_CTX_USER'), true);

  const listResult = canonicalizeRunJSCode({
    modelUse: 'JSBlockModel',
    code: `const filter = {
  logic: '$and',
  items: [{ path: 'owner_id', operator: '$eq', value: currentUserId }],
};
const response = await ctx.request({
  url: 'task:list',
  method: 'get',
  params: {
    pageSize: 100,
    sort: ['due_date'],
    filter,
  },
  skipNotify: true,
});`,
  });

  assert.equal(listResult.changed, true);
  assert.equal(listResult.code.includes("ctx.makeResource('MultiRecordResource')"), true);
  assert.equal(listResult.code.includes('__runjsResource.setFilter'), true);
  assert.equal(listResult.code.includes('current.logic'), true);
  assert.equal(listResult.transforms.some((item) => item.code === 'RUNJS_REQUEST_FILTER_GROUP_TO_QUERY_FILTER'), true);
  assert.equal(listResult.transforms.some((item) => item.code === 'RUNJS_REQUEST_LIST_TO_MULTI_RECORD_RESOURCE'), true);
});

test('inspectRunJSCode accepts JSColumnModel and JSEditableFieldModel specific context members', async () => {
  const columnResult = await inspectRunJSCode({
    modelUse: 'JSColumnModel',
    code: `ctx.render(String(ctx.recordIndex ?? 0));
await ctx.viewer.drawer({ title: String(ctx.collection?.name ?? 'tasks') });`,
  });
  assert.equal(columnResult.ok, true);
  assert.equal(columnResult.blockers.length, 0);

  const editableResult = await inspectRunJSCode({
    modelUse: 'JSEditableFieldModel',
    code: `const nextValue = String(ctx.getValue?.() ?? ctx.value ?? '');
ctx.setValue?.(nextValue);
ctx.render('<span>' + nextValue + '</span>');`,
  });
  assert.equal(editableResult.ok, true);
  assert.equal(editableResult.blockers.length, 0);
});

test('canonicalizeRunJSCode rewrites innerHTML assignments to ctx.render for render models', () => {
  const directResult = canonicalizeRunJSCode({
    modelUse: 'JSColumnModel',
    code: `ctx.element.innerHTML = '<span>' + String(ctx.record?.status ?? '-') + '</span>';`,
  });
  assert.equal(directResult.changed, true);
  assert.equal(directResult.code.includes('ctx.render('), true);
  assert.equal(directResult.transforms.some((item) => item.code === 'RUNJS_ELEMENT_INNERHTML_TO_CTX_RENDER'), true);

  const aliasResult = canonicalizeRunJSCode({
    modelUse: 'JSBlockModel',
    code: `const root = ctx.element;
root.innerHTML = '<div>Preview</div>';`,
  });
  assert.equal(aliasResult.changed, true);
  assert.equal(aliasResult.code.includes("ctx.render('<div>Preview</div>');"), true);

  const refReadyResult = canonicalizeRunJSCode({
    modelUse: 'JSFieldModel',
    code: `ctx.onRefReady(ctx.ref, (el) => {
  const html = '<strong>' + String(ctx.value ?? '') + '</strong>';
  el.innerHTML = html;
});`,
  });
  assert.equal(refReadyResult.changed, true);
  assert.equal(refReadyResult.code.includes('ctx.render(html);'), true);
});

test('inspectRunJSCode blocks innerHTML writes that still depend on DOM after rendering', async () => {
  const result = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: `ctx.element.innerHTML = '<a>Open</a>';
ctx.element.querySelector('a')?.addEventListener('click', () => {
  console.log('open');
});`,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_ELEMENT_INNERHTML_FORBIDDEN'), true);
});

test('inspectRunJSStaticCode falls back to snapshot when nocobase source root is unavailable', () => {
  const result = inspectRunJSStaticCode({
    modelUse: 'JSBlockModel',
    code: "await fetch('/api/auth:check')",
    nocobaseRoot: '/tmp/nonexistent-nocobase-root',
    snapshotPath: SNAPSHOT_PATH,
  });

  assert.equal(result.ok, false);
  assert.equal(result.contractSource, 'snapshot');
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_FORBIDDEN_GLOBAL'), true);
});
