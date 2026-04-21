import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  canonicalizeRunJSCode,
  collectRunJSNodes,
  inspectRunJSCode,
  inspectRunJSPayloadStatic,
  inspectRunJSStaticCode,
  loadRunJSContract,
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
    nodes.map((item) => ({ path: item.path, modelUse: item.modelUse, version: item.version, surface: item.surface })),
    [
      {
        path: '$.subModels.items[0].stepParams.jsSettings.runJs',
        modelUse: 'JSBlockModel',
        version: 'v1',
        surface: 'js-model.render',
      },
      {
        path: '$.subModels.items[1].stepParams.jsSettings.runJs',
        modelUse: 'JSFieldModel',
        version: 'v2',
        surface: 'js-model.render',
      },
      {
        path: '$.subModels.items[2].clickSettings.runJs',
        modelUse: 'JSActionModel',
        version: 'v1',
        surface: 'js-model.action',
      },
    ],
  );
});

test('collectRunJSNodes discovers event-flow, linkage, value-return and custom-variable surfaces', () => {
  const payload = {
    use: 'TableBlockModel',
    flowRegistry: {
      clickSettings: {
        steps: {
          runjsStep: {
            name: 'runjs',
            params: {
              code: "ctx.message.success(String(ctx.record?.title ?? 'ok'));",
            },
          },
        },
      },
    },
    rules: [
      {
        key: 'deriveName',
        then: [
          {
            type: 'assignField',
            items: [
              {
                targetPath: 'name',
                value: {
                  source: 'runjs',
                  version: 'v2',
                  code: "return String(ctx.formValues?.title || '').trim();",
                },
              },
            ],
          },
          {
            name: 'linkageRunjs',
            params: {
              value: {
                script: "ctx.setValue?.(String(ctx.formValues?.title || ''));",
              },
            },
          },
        ],
      },
    ],
    variables: [
      {
        type: 'runjs',
        runjs: {
          code: 'return ctx.record?.id ?? null;',
          version: 'v2',
        },
      },
    ],
  };

  const nodes = collectRunJSNodes(payload);
  assert.deepEqual(
    nodes.map((item) => ({ path: item.path, surface: item.surface, modelUse: item.modelUse })),
    [
      {
        path: '$.flowRegistry.clickSettings.steps.runjsStep.params.code',
        surface: 'event-flow.execute-javascript',
        modelUse: 'TableBlockModel',
      },
      {
        path: '$.rules[0].then[0].items[0].value',
        surface: 'reaction.value-runjs',
        modelUse: 'TableBlockModel',
      },
      {
        path: '$.rules[0].then[1].params.value.script',
        surface: 'linkage.execute-javascript',
        modelUse: 'TableBlockModel',
      },
      {
        path: '$.variables[0].runjs',
        surface: 'custom-variable.runjs',
        modelUse: 'TableBlockModel',
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
    code: "ctx.render(''); await ctx.request({ url: 'users:list' })",
  });
  assert.equal(requestResult.ok, true);
  assert.equal(requestResult.execution.attempted, true);
  assert.equal(requestResult.warnings.some((item) => item.code === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'), true);
  assert.equal(
    requestResult.warnings.find((item) => item.code === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST')?.details?.repairClass,
    'switch-to-resource-api',
  );
  assert.equal(requestResult.execution.semanticWarningCount > 0, true);

  const jsxResult = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: 'return ctx.render(<div>ok</div>)',
  });
  assert.equal(jsxResult.ok, true);
  assert.equal(Array.isArray(jsxResult.execution.logs), true);
});

test('inspectRunJSCode uses broader action-surface ctx roots for JSFormActionModel', async () => {
  const result = await inspectRunJSCode({
    modelUse: 'JSFormActionModel',
    code: `ctx.form.setFieldsValue({ title: String(ctx.formValues?.title || '') });
ctx.message.success('saved');`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
});

test('inspectRunJSCode rejects form-only ctx roots on event-flow surface', async () => {
  const result = await inspectRunJSCode({
    modelUse: null,
    surface: 'event-flow.execute-javascript',
    code: "ctx.form?.setFieldsValue?.({ title: 'x' });",
  });

  assert.equal(result.ok, false);
  const blocker = result.blockers.find((item) => item.code === 'RUNJS_UNKNOWN_CTX_MEMBER');
  assert.equal(Boolean(blocker), true);
  assert.equal(blocker.details.repairClass, 'ctx-root-mismatch-stop');
});

test('inspectRunJSCode respects explicit modelUse on linkage surface validation', async () => {
  const okResult = await inspectRunJSCode({
    surface: 'linkage.execute-javascript',
    modelUse: 'JSItemModel',
    code: "ctx.form?.setFieldsValue?.({ title: 'x' });",
  });
  assert.equal(okResult.ok, true);

  const badResult = await inspectRunJSCode({
    surface: 'linkage.execute-javascript',
    modelUse: 'JSRecordActionModel',
    code: "ctx.form?.setFieldsValue?.({ title: 'x' });",
  });
  assert.equal(badResult.ok, false);
  assert.equal(badResult.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_CTX_MEMBER'), true);
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

test('inspectRunJSPayloadStatic validates value-return, linkage and event-flow surfaces without guessing JSBlockModel', () => {
  const result = inspectRunJSPayloadStatic({
    payload: {
      use: 'TableBlockModel',
      flowRegistry: {
        clickSettings: {
          steps: {
            runjsStep: {
              name: 'runjs',
              params: {
                code: "ctx.message.success(ctx.t('ok'));",
              },
            },
          },
        },
      },
      rules: [
        {
          then: [
            {
              type: 'assignField',
              items: [
                {
                  targetPath: 'slug',
                  value: {
                    source: 'runjs',
                    version: 'v2',
                    code: "return String(ctx.formValues?.title || '').trim().toLowerCase();",
                  },
                },
              ],
            },
            {
              name: 'linkageRunjs',
              params: {
                value: {
                  script: "ctx.setValue?.(String(ctx.formValues?.title || ''));",
                },
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.inspectedNodes.map((item) => item.surface),
    ['event-flow.execute-javascript', 'reaction.value-runjs', 'linkage.execute-javascript'],
  );
  assert.equal(result.surfaceSummary['event-flow.execute-javascript'].nodeCount, 1);
});

test('inspectRunJSPayloadStatic blocks nested RunJS values with unknown surface', () => {
  const result = inspectRunJSPayloadStatic({
    payload: {
      use: 'TableBlockModel',
      misc: {
        run: {
          code: "ctx.message.success('lost');",
          version: 'v1',
        },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.inspectedNodes.length, 1);
  assert.equal(result.inspectedNodes[0].surface, 'runjs.unknown');
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_SURFACE_UNRESOLVED'), true);
});

test('inspectRunJSCode does not mark resource API usage as runtime uncertain', async () => {
  const result = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: `ctx.render('');
const taskResource = ctx.makeResource('MultiRecordResource');
taskResource.setResourceName('task');
taskResource.setSort(['due_date']);
taskResource.setFilter({ owner_id: { $eq: 1 } });
await taskResource.refresh();`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((item) => item.code === 'RUNJS_RUNTIME_UNCERTAIN'), false);
});

test('inspectRunJSCode enforces render-style semantics for render surfaces', async () => {
  const result = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'JSBlockModel',
    code: "const title = String(ctx.record?.title || '');",
  });

  assert.equal(result.ok, false);
  const blocker = result.blockers.find((item) => item.code === 'RUNJS_RENDER_SURFACE_RENDER_REQUIRED');
  assert.equal(Boolean(blocker), true);
  assert.equal(blocker.details.repairClass, 'replace-innerhtml-with-render');
});

test('bundled snapshot contains one-time extracted form/item action model contracts', () => {
  const { contract, source } = loadRunJSContract({ snapshotPath: SNAPSHOT_PATH });

  assert.equal(source, 'snapshot');
  assert.equal(Object.prototype.hasOwnProperty.call(contract, 'sourceHashes'), false);
  assert.equal(Object.values(contract.models).some((item) => Object.prototype.hasOwnProperty.call(item, 'sourceFile')), false);
  assert.equal(contract.runtime.registeredModelContexts.includes('FormJSFieldItemModel'), true);
  assert.equal(contract.runtime.registeredModelContexts.includes('JSItemActionModel'), true);
  assert.deepEqual(contract.models.FormJSFieldItemModel.properties, ['element', 'formValues', 'record', 'value']);
  assert.deepEqual(contract.models.FormJSFieldItemModel.methods, ['onRefReady', 'setProps']);
  assert.deepEqual(contract.models.JSItemActionModel.properties, ['element', 'formValues', 'record', 'resource']);
  assert.deepEqual(contract.models.JSItemActionModel.methods, ['onRefReady']);
});

test('inspectRunJSCode supports extracted render/action model contracts', async () => {
  const renderResult = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'FormJSFieldItemModel',
    code: "ctx.render(String(ctx.formValues?.nickname || '')); ctx.setProps?.({ hidden: false });",
  });
  assert.equal(renderResult.ok, true);

  const actionResult = await inspectRunJSCode({
    surface: 'js-model.action',
    modelUse: 'JSItemActionModel',
    code: "ctx.form?.setFieldsValue?.({ status: String(ctx.record?.status || '') });",
  });
  assert.equal(actionResult.ok, true);
});

test('inspectRunJSCode blocks unknown modelUse instead of falling back to JSBlockModel', async () => {
  const result = await inspectRunJSCode({
    modelUse: 'TableBlockModel',
    code: 'return 1;',
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_MODEL_USE'), true);
});

test('inspectRunJSCode requires explicit action modelUse instead of falling back to JSActionModel', async () => {
  const explicitResult = await inspectRunJSCode({
    surface: 'js-model.action',
    modelUse: 'JSActionModel',
    code: "ctx.message.success('ok');",
  });
  assert.equal(explicitResult.ok, true);

  const missingResult = await inspectRunJSCode({
    surface: 'js-model.action',
    modelUse: null,
    code: "ctx.message.success('ok');",
  });
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_MODEL_USE'), true);

  const incompatibleResult = await inspectRunJSCode({
    surface: 'js-model.action',
    modelUse: 'TableBlockModel',
    code: "ctx.message.success('ok');",
  });
  assert.equal(incompatibleResult.ok, false);
  const blocker = incompatibleResult.blockers.find((item) => item.code === 'RUNJS_UNKNOWN_MODEL_USE');
  assert.equal(Boolean(blocker), true);
  assert.equal(blocker.details.repairClass, 'unknown-model-stop');
});

test('inspectRunJSCode enforces return-style semantics for value surfaces', async () => {
  const okResult = await inspectRunJSCode({
    modelUse: null,
    surface: 'reaction.value-runjs',
    code: "return String(ctx.formValues?.title || '').trim();",
  });
  assert.equal(okResult.ok, true);

  const badResult = await inspectRunJSCode({
    modelUse: null,
    surface: 'reaction.value-runjs',
    code: `ctx.render('bad');
const title = String(ctx.formValues?.title || '').trim();`,
  });
  assert.equal(badResult.ok, false);
  assert.equal(badResult.blockers.some((item) => item.code === 'RUNJS_VALUE_SURFACE_RETURN_REQUIRED'), true);
  assert.equal(badResult.blockers.some((item) => item.code === 'RUNJS_VALUE_SURFACE_CTX_RENDER_FORBIDDEN'), true);
  assert.equal(
    badResult.blockers.find((item) => item.code === 'RUNJS_VALUE_SURFACE_RETURN_REQUIRED')?.details?.repairClass,
    'missing-top-level-return',
  );
  assert.equal(
    badResult.blockers.find((item) => item.code === 'RUNJS_VALUE_SURFACE_CTX_RENDER_FORBIDDEN')?.details?.repairClass,
    'value-surface-forbids-render',
  );
});

test('inspectRunJSCode blocks skill-mode ctx.openView and returns reroute repair metadata', async () => {
  const result = await inspectRunJSCode({
    modelUse: 'JSActionModel',
    code: "await ctx.openView('detailPopup');",
  });

  assert.equal(result.ok, false);
  const blocker = result.blockers.find((item) => item.code === 'RUNJS_BLOCKED_CTX_CAPABILITY');
  assert.equal(Boolean(blocker), true);
  assert.equal(blocker.details.repairClass, 'blocked-capability-reroute');
  assert.equal(blocker.details.reroute, 'popup-action-or-field-popup');
});

test('inspectRunJSCode blocks computed ctx.openView and unresolved dynamic ctx access', async () => {
  const computedResult = await inspectRunJSCode({
    modelUse: 'JSActionModel',
    code: "const method = 'openView'; await ctx[method]('detailPopup');",
  });

  assert.equal(computedResult.ok, false);
  assert.equal(computedResult.blockers.some((item) => item.code === 'RUNJS_BLOCKED_CTX_CAPABILITY'), true);

  const dynamicResult = await inspectRunJSCode({
    modelUse: 'JSActionModel',
    code: "await ctx[methodName]('detailPopup');",
  });

  assert.equal(dynamicResult.ok, false);
  const blocker = dynamicResult.blockers.find((item) => item.code === 'RUNJS_DYNAMIC_CTX_MEMBER_UNRESOLVED');
  assert.equal(Boolean(blocker), true);
  assert.equal(blocker.details.repairClass, 'ctx-root-mismatch-stop');
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

test('inspectRunJSStaticCode uses the bundled snapshot contract without nocobase source access', () => {
  const result = inspectRunJSStaticCode({
    modelUse: 'JSBlockModel',
    code: "await fetch('/api/auth:check')",
    snapshotPath: SNAPSHOT_PATH,
  });

  assert.equal(result.ok, false);
  assert.equal(result.contractSource, 'snapshot');
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_FORBIDDEN_GLOBAL'), true);
});
