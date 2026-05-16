import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  canonicalizeRunJSCode,
  canonicalizeRunJSPayload,
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
            use: 'runjs',
            defaultParams: {
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
        path: '$.flowRegistry.clickSettings.steps.runjsStep.defaultParams.code',
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

test('collectRunJSNodes still discovers legacy event-flow params shape', () => {
  const payload = {
    use: 'TableBlockModel',
    flowRegistry: {
      clickSettings: {
        steps: {
          runjsStep: {
            name: 'runjs',
            params: {
              code: "ctx.message.success(ctx.t('legacy'));",
            },
          },
        },
      },
    },
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

  const stringRequestResult = await inspectRunJSCode({
    modelUse: 'JSBlockModel',
    code: "ctx.render(''); await ctx.request('users:list', { params: { pageSize: 3 } })",
  });
  assert.equal(stringRequestResult.ok, true);
  assert.equal(stringRequestResult.warnings.some((item) => item.code === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'), true);

  const authCheckResult = await inspectRunJSCode({
    modelUse: 'JSActionModel',
    code: "await ctx.request('auth:check')",
  });
  assert.equal(authCheckResult.ok, true);
  assert.equal(authCheckResult.warnings.some((item) => item.code === 'RUNJS_AUTH_CHECK_REDUNDANT'), true);

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

test('inspectRunJSCode accepts event-flow record roots and independent resources', async () => {
  const result = await inspectRunJSCode({
    modelUse: null,
    surface: 'event-flow.execute-javascript',
    code: `
      const tempResource = ctx.makeResource('MultiRecordResource');
      tempResource.setResourceName('tasks');
      await tempResource.refresh();
      return ctx.record?.id ?? null;
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
});

test('inspectRunJSStaticCode accepts surface-only event-flow inspection without defaulting modelUse', () => {
  const result = inspectRunJSStaticCode({
    surface: 'event-flow.execute-javascript',
    code: 'return ctx.record?.id ?? null;',
  });

  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.inspectedNode.surface, 'event-flow.execute-javascript');
});

test('inspectRunJSCode accepts surface-only event-flow inspection without defaulting modelUse', async () => {
  const result = await inspectRunJSCode({
    surface: 'event-flow.execute-javascript',
    code: 'return ctx.record?.id ?? null;',
  });

  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.inspectedNode.surface, 'event-flow.execute-javascript');
});

test('inspectRunJSCode distinguishes linkage host-model validation from surface-only validation', async () => {
  const surfaceOnlyResult = await inspectRunJSCode({
    surface: 'linkage.execute-javascript',
    code: "ctx.form?.setFieldsValue?.({ title: 'x' });",
  });
  assert.equal(surfaceOnlyResult.ok, true);

  const okResult = await inspectRunJSCode({
    surface: 'linkage.execute-javascript',
    modelUse: 'JSItemModel',
    code: "ctx.form?.setFieldsValue?.({ title: 'x' });",
  });
  assert.equal(okResult.ok, true);

  const unsupportedFallbackResult = await inspectRunJSCode({
    surface: 'linkage.execute-javascript',
    modelUse: 'JSFormActionModel',
    code: "ctx.form?.setFieldsValue?.({ title: 'x' });",
  });
  assert.equal(unsupportedFallbackResult.ok, false);
  assert.equal(unsupportedFallbackResult.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_MODEL_USE'), true);

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
              use: 'runjs',
              defaultParams: {
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

test('inspectRunJSCode keeps helper-only render code on the missing render blocker', async () => {
  const result = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'JSBlockModel',
    code: "const helper = (value) => String(value || '');",
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_RENDER_SURFACE_RENDER_REQUIRED'), true);
  assert.equal(
    result.blockers.some((item) => item.code === 'RUNJS_RENDER_TOP_LEVEL_FUNCTION_WRAPPER_FORBIDDEN'),
    false,
  );
});

test('inspectRunJSCode blocks top-level function wrappers on render surfaces', async () => {
  const declarationResult = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'JSBlockModel',
    code: `
      function main() {
        ctx.render('wrapped only');
      }
    `,
  });

  assert.equal(declarationResult.ok, false);
  const declarationBlocker = declarationResult.blockers.find(
    (item) => item.code === 'RUNJS_RENDER_TOP_LEVEL_FUNCTION_WRAPPER_FORBIDDEN',
  );
  assert.equal(Boolean(declarationBlocker), true);
  assert.match(declarationBlocker.message, /top-level script/i);
  assert.match(declarationBlocker.details.preferredFix, /Move the function body to the top level/i);

  for (const code of [
    "(function () { ctx.render('nested only'); });",
    "(() => { ctx.render('nested only'); });",
    "(async () => { ctx.render('nested only'); });",
  ]) {
    const expressionResult = await inspectRunJSCode({
      surface: 'js-model.render',
      modelUse: 'JSBlockModel',
      code,
    });

    assert.equal(expressionResult.ok, false, `${code} should be blocked`);
    assert.equal(
      expressionResult.blockers.some((item) => item.code === 'RUNJS_RENDER_TOP_LEVEL_FUNCTION_WRAPPER_FORBIDDEN'),
      true,
      `${code} should use the wrapper blocker`,
    );
  }

  const result = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'JSBlockModel',
    code: `
      const renderLater = () => {
        ctx.render('nested only');
      };
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.blockers.some((item) => item.code === 'RUNJS_RENDER_TOP_LEVEL_FUNCTION_WRAPPER_FORBIDDEN'),
    true,
  );
});

test('inspectRunJSCode blocks unreachable nested ctx.render calls on render surfaces', async () => {
  const result = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'JSBlockModel',
    code: "const helpers = { ['x']() { ctx.render('nested only'); } };",
  });

  assert.equal(result.ok, false);
  const blocker = result.blockers.find((item) => item.code === 'RUNJS_RENDER_UNREACHABLE_RENDER_CALL');
  assert.equal(Boolean(blocker), true);
  assert.match(blocker.message, /top-level execution path/i);
  assert.match(blocker.details.preferredFix, /Move ctx.render/i);
});

test('inspectRunJSCode accepts immediately executed render helpers on render surfaces', async () => {
  const samples = [
    "function main() { ctx.render('called'); }\nmain();",
    "{ function helper() { ctx.render('called'); } }\nhelper();",
    "if (true) { function helper() { ctx.render('called'); } }\nhelper();",
    "switch (1) { case 1: function helper() { ctx.render('called'); } }\nhelper();",
    "const main = () => { ctx.render('called'); };\nmain();",
    "let main = () => { ctx.render('called'); };\nmain();\nmain = () => {};",
    "let main;\nmain = () => { ctx.render('called'); };\nmain();\nmain = () => {};",
    "let main = 0;\nmain ||= () => { ctx.render('called'); };\nmain();",
    "let main = null;\nmain ??= () => { ctx.render('called'); };\nmain();",
    "let main = () => {};\nmain &&= () => { ctx.render('called'); };\nmain();",
    "const helpers = { main: null };\nhelpers.main ??= () => { ctx.render('called'); };\nhelpers.main();",
    "let main = null;\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { main ??= () => { ctx.render('called'); }; }\nif (flag) { main ??= 1; }\nmain();",
    "const helpers = { main: null };\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { helpers.main ??= () => { ctx.render('called'); }; }\nif (flag) { helpers.main ??= 1; }\nhelpers.main();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { main = 0; }\nmain ||= () => { ctx.render('called'); };\nmain();",
    "(() => { ctx.render('called'); })();",
    "function main() { function inner() { ctx.render('called'); } inner(); }\nmain();",
    "function main() { const inner = () => { ctx.render('called'); }; inner(); }\nmain();",
    "function main() { if (true) { const inner = () => { ctx.render('called'); }; inner(); } }\nmain();",
    "function main() { if (true) { var inner = () => { ctx.render('called'); }; } inner(); }\nmain();",
    "(() => { const inner = () => { ctx.render('called'); }; inner(); })();",
    "(() => { if (true) { const inner = () => { ctx.render('called'); }; inner(); } })();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => { ctx.render('called'); };\nif (flag) { main = 1; }\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => { ctx.render('called'); };\nflag && (main = 1);\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => { ctx.render('called'); };\nflag ? (main = 1) : null;\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => { ctx.render('called'); };\nswitch (flag) { case 'disable': main = 1; break; }\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => { ctx.render('called'); };\nwhile (flag) { main = 1; break; }\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => { ctx.render('called'); };\nfor (; flag; main = 1) { break; }\nmain();",
    "let main = () => { ctx.render('called'); };\ndo { break; } while (main = 1);\nmain();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nflag && (main = () => { ctx.render('called'); });\n!flag && (main = 1);\nmain();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nconst other = await ctx.getVar('ctx.record.other');\nif (flag) { main = () => { ctx.render('called'); }; }\nif (flag && other) { main = () => {}; }\nmain();",
    "let main = () => {};\nlet flag = await ctx.getVar('ctx.record.flag');\nif (flag) { main = () => { ctx.render('called'); }; }\nflag = await ctx.getVar('ctx.record.other');\nif (flag) { main = () => {}; }\nmain();",
    "let main = () => {};\nconst state = {};\nstate.flag = await ctx.getVar('ctx.record.flag');\nif (state.flag) { main = () => { ctx.render('called'); }; }\nstate.flag = await ctx.getVar('ctx.record.other');\nif (state.flag) { main = () => {}; }\nmain();",
    "for (const helper = () => { ctx.render('called'); }; true;) { helper(); break; }",
    "for (const helper of [() => { ctx.render('called'); }]) { helper(); break; }",
    "for (const helper of [() => {}, () => { ctx.render('called'); }]) { helper(); }",
    "let helper;\nfor (helper of [() => { ctx.render('called'); }]) { helper(); }",
    "for (const { main } of [{ main: () => { ctx.render('called'); } }]) { main(); }",
    "for (const [main] of [[() => { ctx.render('called'); }]]) { main(); }",
    "const pushedItems = [];\npushedItems.push(1);\nfor (const item of pushedItems) { ctx.render('called'); break; }",
    "const pushedHelpers = [];\npushedHelpers.push(() => { ctx.render('called'); });\nfor (const helper of pushedHelpers) { helper(); break; }",
    "const assignedKeys = {};\nObject.assign(assignedKeys, { name: 1 });\nfor (const key in assignedKeys) { ctx.render('called'); break; }",
    "const assignedHelpers = [];\nObject.assign(assignedHelpers, { 0: () => { ctx.render('called'); } });\nfor (const helper of assignedHelpers) { helper(); break; }",
    "const replacedHelpers = [() => {}];\nObject.assign(replacedHelpers, { 0: () => { ctx.render('called'); } });\nfor (const helper of replacedHelpers) { helper(); break; }",
    "const helperList = [() => { ctx.render('called'); }];\nfor (const helper of helperList) { helper(); }",
    "const helperGroup = { list: [() => { ctx.render('called'); }] };\nconst { list } = helperGroup;\nfor (const helper of list) { helper(); }",
    "const helpers = { main() { ctx.render('called'); } };\nhelpers.main();",
    "const helpers = { main: () => { ctx.render('called'); } };\nhelpers.main();",
    "const helpers = { ['main']() { ctx.render('called'); } };\nhelpers.main();",
    "const helpers = { nested: { main() { ctx.render('called'); } } };\nhelpers.nested.main();",
    "({ main() { ctx.render('called'); } }).main();",
    "([() => { ctx.render('called'); }][0])();",
    "const mainFromLiteral = [() => { ctx.render('called'); }][0];\nmainFromLiteral();",
    "const aliasFromLiteral = ({ nested: { main() { ctx.render('called'); } } }).nested;\naliasFromLiteral.main();",
    "const helpers = { main() { ctx.render('called'); } };\nconst alias = helpers;\nalias.main();",
    "const helpers = [() => { ctx.render('called'); }];\nconst alias = helpers;\nalias[0]();",
    "const helpers = [() => {}];\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { helpers[0] = () => { ctx.render('called'); }; }\nfor (const helper of helpers) { helper(); }",
    "const helpers = [() => {}, () => { ctx.render('called'); }];\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { helpers.reverse(); }\nhelpers[0]();",
    "const helpers = [() => {}];\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { helpers.splice(0, 1, () => { ctx.render('called'); }); }\nfor (const helper of helpers) { helper(); }",
    "const helpers = { main: { nested() { ctx.render('called'); } } };\nfunction outer() { const alias = helpers.main; alias.nested(); }\nouter();",
    "const helpers = { list: [() => { ctx.render('called'); }] };\nfunction outer() { const alias = helpers.list; alias[0](); }\nouter();",
    "const helpers = { main: { nested() { ctx.render('called'); } } };\nconst { main } = helpers;\nmain.nested();",
    "const helpers = [{ nested() { ctx.render('called'); } }];\nconst [group] = helpers;\ngroup.nested();",
    "const helpers = { main: () => { ctx.render('called'); } };\nconst main = helpers.main;\nmain();",
    "const helpers = { nested: { main() { ctx.render('called'); } } };\nconst main = helpers.nested.main;\nmain();",
    "const helpers = { main() { ctx.render('called'); } };\nconst main = helpers.main;\nhelpers.main = 1;\nmain();",
    "let helpers = {};\nconst alias = helpers;\nhelpers.main = () => { ctx.render('called'); };\nalias.main();",
    "let helpers = {};\nconst alias = helpers;\nalias.main = () => { ctx.render('called'); };\nhelpers.main();",
    "let helpers = [];\nconst alias = helpers;\nhelpers[0] = () => { ctx.render('called'); };\nalias[0]();",
    "let helpers = [];\nconst alias = helpers;\nalias[0] = () => { ctx.render('called'); };\nhelpers[0]();",
    "let helpers = {};\nfunction setup() { const render = () => { ctx.render('called'); }; helpers.main = render; }\nsetup();\nhelpers.main();",
    "let helpers = {};\nconst alias = helpers;\nfunction setup() { const render = () => { ctx.render('called'); }; alias.main = render; }\nsetup();\nhelpers.main();",
    "let alias;\nconst helpers = { main() { ctx.render('called'); } };\nfunction setup() { alias = helpers; }\nsetup();\nalias.main();",
    "let helpers = {};\nfunction setup() { const local = { nested() { ctx.render('called'); } }; helpers.main = local; }\nsetup();\nhelpers.main.nested();",
    "let helpers = {};\nfunction setup() { const local = {}; helpers.main = local; local.nested = () => { ctx.render('called'); }; }\nsetup();\nhelpers.main.nested();",
    "let alias;\nfunction setup() { const local = {}; alias = local; local.main = () => { ctx.render('called'); }; }\nsetup();\nalias.main();",
    "let main;\nfunction setup() { [main] = [() => { ctx.render('called'); }]; }\nsetup();\nmain();",
    "let helpers;\nfunction setup() { ({ helpers } = { helpers: { main() { ctx.render('called'); } } }); }\nsetup();\nhelpers.main();",
    "let group;\nconst helperGroups = [{ nested() { ctx.render('called'); } }];\nfunction setup() { [group] = helperGroups; }\nsetup();\ngroup.nested();",
    "let helpers = {};\nhelpers.main = { nested() { ctx.render('called'); } };\nhelpers.main.nested();",
    "let helpers = {};\nhelpers.list = [() => { ctx.render('called'); }];\nhelpers.list[0]();",
    "let helpers = {};\nhelpers.main = { nested() { ctx.render('called'); } };\nconst alias = helpers.main;\nalias.nested();",
    "let helpers = {};\nhelpers.main = {};\nconst alias = helpers.main;\nhelpers.main.nested = () => { ctx.render('called'); };\nalias.nested();",
    "let helpers = {};\nhelpers.main = {};\nconst alias = helpers.main;\nalias.nested = () => { ctx.render('called'); };\nhelpers.main.nested();",
    "let helpers = {};\nhelpers.list = [() => { ctx.render('called'); }];\nconst alias = helpers.list;\nalias[0]();",
    "let helpers = {};\nhelpers.main = { nested() { ctx.render('called'); } };\nconst nested = helpers.main.nested;\nnested();",
    "let helpers = {};\nhelpers.main = { nested() { ctx.render('called'); } };\nconst { nested } = helpers.main;\nnested();",
    "let helpers = {};\nhelpers.main = { nested() { ctx.render('called'); } };\nconst alias = helpers.main;\nconst { nested } = alias;\nnested();",
    "let helpers = {};\nhelpers.list = [() => { ctx.render('called'); }];\nconst [main] = helpers.list;\nmain();",
    "const helpers = { main: { nested() { ctx.render('called'); } } };\nconst { main } = helpers;\nmain.nested();",
    "const helpers = { list: [() => { ctx.render('called'); }] };\nconst { list } = helpers;\nlist[0]();",
    "const groups = [{ main() { ctx.render('called'); } }];\nconst [group] = groups;\ngroup.main();",
    "const { main = () => { ctx.render('called'); } } = {};\nmain();",
    "const { main = { nested() { ctx.render('called'); } } } = {};\nmain.nested();",
    "const [main = () => { ctx.render('called'); }] = [];\nmain();",
    "const helpers = {};\nconst { main = () => { ctx.render('called'); } } = helpers;\nmain();",
    "const helpers = { main: undefined };\nconst { main = () => { ctx.render('called'); } } = helpers;\nmain();",
    "let helpers = {};\nhelpers.main = undefined;\nconst { main = () => { ctx.render('called'); } } = helpers;\nmain();",
    "let helpers = { main: 1 };\ndelete helpers.main;\nconst { main = () => { ctx.render('called'); } } = helpers;\nmain();",
    "let helpers = { main: { nested: 1 } };\ndelete helpers.main.nested;\nconst { nested = () => { ctx.render('called'); } } = helpers.main;\nnested();",
    "let helpers = { main: { nested() { ctx.render('called'); } } };\nconst alias = helpers.main;\ndelete helpers.main;\nalias.nested();",
    "let helpers = { main: undefined };\nhelpers.main = () => { ctx.render('called'); };\nconst { main = () => {} } = helpers;\nmain();",
    "function main(render = () => { ctx.render('called'); }) { render(); }\nmain();",
    "function main(render) { render(); }\nmain(() => { ctx.render('called'); });",
    "const renderNow = () => { ctx.render('called'); };\nfunction main(render) { render(); }\nmain(renderNow);",
    "function main(render = renderNow) { render(); }\nconst renderNow = () => { ctx.render('called'); };\nmain();",
    "function main({ render = () => { ctx.render('called'); } } = {}) { render(); }\nmain();",
    "function main({ render }) { render(); }\nmain({ render: () => { ctx.render('called'); } });",
    "const main = (render = () => { ctx.render('called'); }) => render();\nmain();",
    "const [main] = [() => { ctx.render('called'); }];\nmain();",
    "const { main } = { main: () => { ctx.render('called'); } };\nmain();",
    "const helpers = [() => { ctx.render('called'); }];\nconst [main] = helpers;\nmain();",
    "const helpers = { main: () => { ctx.render('called'); } };\nconst { main } = helpers;\nmain();",
    "let main;\n[main] = [() => { ctx.render('called'); }];\nmain();",
  ];

  for (const code of samples) {
    const result = await inspectRunJSCode({
      surface: 'js-model.render',
      modelUse: 'JSBlockModel',
      code,
    });

    assert.equal(result.ok, true, `${code} should be accepted`);
  }
});

test('inspectRunJSCode blocks render helpers called before initialization', async () => {
  const samples = [
    "main();\nconst main = () => { ctx.render('too late'); };",
    "main();\nlet main = () => { ctx.render('too late'); };",
    "main();\nvar main = () => { ctx.render('too late'); };",
    "let main;\nmain();\nmain = () => { ctx.render('too late'); };",
  ];

  for (const code of samples) {
    const result = await inspectRunJSCode({
      surface: 'js-model.render',
      modelUse: 'JSBlockModel',
      code,
    });

    assert.equal(result.ok, false, `${code} should be blocked`);
    assert.equal(
      result.blockers.some((item) => item.code === 'RUNJS_RENDER_UNREACHABLE_RENDER_CALL'),
      true,
      `${code} should use the unreachable render blocker`,
    );
  }
});

test('inspectRunJSCode blocks dead or shadowed nested render paths', async () => {
  const samples = [
    "function outer() { ctx.render('shadowed'); }\nfunction main() { if (true) { const outer = () => {}; outer(); } }\nmain();",
    "'use strict';\n{ function helper() { ctx.render('too late'); } }\nhelper();",
    "function main() { return; ctx.render('too late'); }\nmain();",
    "(() => { throw new Error('stop'); ctx.render('too late'); })();",
    "if (false) { ctx.render('too late'); }",
    "throw new Error('stop');\nctx.render('too late');",
    "function main() { if (false) { ctx.render('too late'); } }\nmain();",
    "function main() { ctx.render('too late'); }\nfalse && main();",
    "function main() { ctx.render('too late'); }\ntrue || main();",
    "let main = () => { ctx.render('too late'); }; main = 1; main();",
    "let main = () => { ctx.render('too late'); }; main = null; main?.();",
    "let main = () => { ctx.render('too late'); }; if (true) { main = 1; } main();",
    "let main = () => {};\nmain ||= () => { ctx.render('too late'); };\nmain();",
    "let main = () => {};\nmain ??= () => { ctx.render('too late'); };\nmain();",
    "let main = 0;\nmain &&= () => { ctx.render('too late'); };\nmain();",
    "const helpers = { main: () => {} };\nhelpers.main ||= () => { ctx.render('too late'); };\nhelpers.main();",
    "const helpers = { main: () => {} };\nhelpers.main ??= () => { ctx.render('too late'); };\nhelpers.main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); if (flag) { main = () => { ctx.render('too late'); }; main = 1; } main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); if (flag) { main = () => { ctx.render('too late'); }; } if (flag) { main = () => {}; } main();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nflag && (main = () => { ctx.render('too late'); });\nflag && (main = 1);\nmain();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nflag ? (main = () => { ctx.render('too late'); }) : null;\nflag ? (main = 1) : null;\nmain();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nconst other = await ctx.getVar('ctx.record.other');\nif (flag && other) { main = () => { ctx.render('too late'); }; }\nif (flag && other) { main = () => {}; }\nmain();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nconst other = await ctx.getVar('ctx.record.other');\nif (flag && other) { main = () => { ctx.render('too late'); }; }\nif (flag) { main = () => {}; }\nmain();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nconst other = await ctx.getVar('ctx.record.other');\n(flag && other) && (main = () => { ctx.render('too late'); });\n(flag && other) && (main = 1);\nmain();",
    "let main = () => {};\nconst flag = await ctx.getVar('ctx.record.flag');\nconst other = await ctx.getVar('ctx.record.other');\nflag && other ? (main = () => { ctx.render('too late'); }) : null;\nflag && other ? (main = 1) : null;\nmain();",
    "let main = null;\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { main ??= 1; }\nif (flag) { main ??= () => { ctx.render('too late'); }; }\nmain();",
    "let main = null;\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { ({ main } = { main: 1 }); }\nif (flag) { main ??= () => { ctx.render('too late'); }; }\nmain();",
    "let main = null;\nconst source = { main: 1 };\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { ({ main } = source); }\nif (flag) { main ??= () => { ctx.render('too late'); }; }\nmain();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main = () => { ctx.render('too late'); }; throw 1; } } catch (error) { main = 1; } main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main = () => { ctx.render('too late'); }; throw 1; } } catch {} if (flag) { main = () => {}; } main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main = () => { ctx.render('too late'); }; throw 1; } } finally {} if (flag) { main = () => {}; } main();",
    "let main = null; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main ??= 1; throw 1; } } catch { main ??= () => { ctx.render('too late'); }; } main();",
    "let main = 0; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main ||= 1; throw 1; } } catch { main ||= () => { ctx.render('too late'); }; } main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main &&= 0; throw 1; } } catch { main &&= () => { ctx.render('too late'); }; } main();",
    "let main = () => {}; let flag = await ctx.getVar('ctx.record.flag'); if (flag) { main = () => { ctx.render('too late'); }; } flag = flag; if (flag) { main = () => {}; } main();",
    "let main = () => {}; const state = {}; state.flag = await ctx.getVar('ctx.record.flag'); if (state.flag) { main = () => { ctx.render('too late'); }; } state.flag = state.flag; if (state.flag) { main = () => {}; } main();",
    "let main = () => { ctx.render('too late'); }; main++; main();",
    "let main = () => { ctx.render('too late'); }; [main] = [1]; main();",
    "let main = () => { ctx.render('too late'); }; ({ main } = { main: 1 }); main();",
    "let helpers = { main() { ctx.render('too late'); } }; helpers = {}; helpers.main();",
    "let helpers = { main() { ctx.render('too late'); } }; helpers.main = 1; helpers.main();",
    "let helpers = { main() { ctx.render('too late'); } }; const alias = helpers; helpers.main = 1; alias.main();",
    "let helpers = { main() { ctx.render('too late'); } }; const alias = helpers; alias.main = 1; helpers.main();",
    "const objectFlag = await ctx.getVar('ctx.record.flag'); const objectHelpers = { main: () => {} }; if (objectFlag) { objectHelpers.main = () => { ctx.render('too late'); }; } if (objectFlag) { objectHelpers.main = () => {}; } objectHelpers.main();",
    "const objectFlag = await ctx.getVar('ctx.record.flag'); const objectOther = await ctx.getVar('ctx.record.other'); const objectHelpers = { main: () => {} }; if (objectFlag && objectOther) { objectHelpers.main = () => { ctx.render('too late'); }; } if (objectFlag && objectOther) { objectHelpers.main = () => {}; } objectHelpers.main();",
    "const objectFlag = await ctx.getVar('ctx.record.flag'); const objectHelpers = { main: () => {} }; try { if (objectFlag) { objectHelpers.main = () => { ctx.render('too late'); }; throw 1; } } catch {} if (objectFlag) { objectHelpers.main = () => {}; } objectHelpers.main();",
    "const nullishFlag = await ctx.getVar('ctx.record.flag'); const nullishHelpers = { main: null }; if (nullishFlag) { nullishHelpers.main ??= 1; } if (nullishFlag) { nullishHelpers.main ??= () => { ctx.render('too late'); }; } nullishHelpers.main();",
    "let wholeHelpers = { main: null };\nconst wholeFlag = await ctx.getVar('ctx.record.flag');\nif (wholeFlag) { wholeHelpers = { main: 1 }; }\nif (wholeFlag) { wholeHelpers.main ??= () => { ctx.render('too late'); }; }\nwholeHelpers.main();",
    "let wholeArrayHelpers = [null];\nconst wholeArrayFlag = await ctx.getVar('ctx.record.flag');\nif (wholeArrayFlag) { wholeArrayHelpers = [1]; }\nif (wholeArrayFlag) { wholeArrayHelpers[0] ??= () => { ctx.render('too late'); }; }\nwholeArrayHelpers[0]();",
    "let helpers = { main: { nested() { ctx.render('too late'); } } }; const alias = helpers.main; helpers.main.nested = 1; alias.nested();",
    "let helpers = [() => { ctx.render('too late'); }]; const alias = helpers; alias[0] = 1; helpers[0]();",
    "const arrayFlag = await ctx.getVar('ctx.record.flag'); const arrayHelpers = [() => {}]; if (arrayFlag) { arrayHelpers[0] = () => { ctx.render('too late'); }; } if (arrayFlag) { arrayHelpers[0] = () => {}; } arrayHelpers[0]();",
    "const arrayFlag = await ctx.getVar('ctx.record.flag'); const arrayOther = await ctx.getVar('ctx.record.other'); const arrayHelpers = [() => {}]; if (arrayFlag && arrayOther) { arrayHelpers[0] = () => { ctx.render('too late'); }; } if (arrayFlag && arrayOther) { arrayHelpers[0] = () => {}; } arrayHelpers[0]();",
    "const arrayFlag = await ctx.getVar('ctx.record.flag'); const arrayHelpers = [() => {}]; try { if (arrayFlag) { arrayHelpers[0] = () => { ctx.render('too late'); }; throw 1; } } catch {} if (arrayFlag) { arrayHelpers[0] = () => {}; } arrayHelpers[0]();",
    "let helpers = { main: { nested() { ctx.render('too late'); } } }; const { main } = helpers; helpers.main.nested = 1; main.nested();",
    "let helpers = [{ nested() { ctx.render('too late'); } }]; const [group] = helpers; helpers[0].nested = 1; group.nested();",
    "let helpers = { main() { ctx.render('too late'); } }; delete helpers.main; helpers.main?.();",
    "let helpers = { main() { ctx.render('too late'); } }; const alias = helpers; delete alias.main; helpers.main?.();",
    "let helpers = { main: { nested() { ctx.render('too late'); } } }; const alias = helpers.main; delete helpers.main.nested; alias.nested?.();",
    "let helpers = {}; function setup() { const local = { nested() { ctx.render('too late'); } }; helpers.main = local; local.nested = 1; } setup(); helpers.main.nested();",
    "let alias; function setup() { const local = { main() { ctx.render('too late'); } }; alias = local; local.main = 1; } setup(); alias.main();",
    "let alias; function setup() { const local = {}; alias = local; alias = 1; local.main = () => { ctx.render('too late'); }; } setup(); alias.main();",
    "let helpers = {}; function setup() { const local = {}; helpers.main = local; helpers.main = 1; local.nested = () => { ctx.render('too late'); }; } setup(); helpers.main.nested();",
    "let main = () => { ctx.render('too late'); };\nfunction setup() { [main] = [1]; }\nsetup();\nmain();",
    "let helpers = { main() { ctx.render('too late'); } };\nfunction setup() { ({ helpers } = { helpers: {} }); }\nsetup();\nhelpers.main();",
    "let group = { nested() { ctx.render('too late'); } };\nfunction setup() { [group] = [{}]; }\nsetup();\ngroup.nested();",
    "const helpers = [() => { ctx.render('too late'); }, () => {}];\nhelpers.sort(() => -1);\nhelpers[0]();",
    "const helpers = [() => { ctx.render('too late'); }];\nObject.assign(helpers, { 0: () => {} });\nfor (const helper of helpers) { helper(); }",
    "const helpers = [() => { ctx.render('too late'); }];\nhelpers[0] += 1;\nfor (const helper of helpers) { helper(); }",
    "const helpers = [() => { ctx.render('too late'); }];\nhelpers[0]++;\nfor (const helper of helpers) { helper(); }",
    "const helpers = [() => { ctx.render('too late'); }];\nhelpers.length = 0;\nhelpers[0]?.();",
    "const helpers = [() => { ctx.render('too late'); }];\nhelpers.length = 0;\nfor (const helper of helpers) { helper(); }",
    "const helpers = [() => {}, () => { ctx.render('too late'); }];\nhelpers.length = 1;\nfor (const helper of helpers) { helper(); }",
    "const helpers = [() => { ctx.render('too late'); }];\nconst alias = helpers;\nalias.length = 0;\nhelpers[0]?.();",
    "const helpers = { main: 1 }; const { main = () => { ctx.render('too late'); } } = helpers; main();",
    "const helpers = { main: { nested: 1 } }; const { main = { nested() { ctx.render('too late'); } } } = helpers; main.nested();",
    "const helpers = { list: [1] }; const { list = [() => { ctx.render('too late'); }] } = helpers; list[0]();",
    "let helpers = { main: undefined };\nhelpers.main = () => {};\nconst { main = () => { ctx.render('too late'); } } = helpers;\nmain();",
    "function main(render = () => { ctx.render('too late'); }) { render(); }\nmain(() => {});",
    "const main = 'x'; const helpers = { [main]() { ctx.render('too late'); } }; helpers.main();",
    "const key = 'main'; ({ [key]() { ctx.render('too late'); } }).main();",
    "const helpers = { main() { ctx.render('too late'); } }; function main() { const helpers = {}; helpers.main(); } main();",
    "const overwrittenHelpers = { main() { ctx.render('too late'); } };\nObject.assign(overwrittenHelpers, { main: 1 });\noverwrittenHelpers.main();",
    "const helpers = { main() { ctx.render('too late'); } }; function main(helpers) { helpers.main(); } main({});",
    "const helpers = { nested: { main() { ctx.render('too late'); } } }; function main() { const helpers = { nested: {} }; helpers.nested.main(); } main();",
    "const helpers = { main: { nested() { ctx.render('too late'); } } }; function main() { const helpers = { main: {} }; const alias = helpers.main; alias.nested(); } main();",
    "function outer() { ctx.render('too late'); } function main(outer) { outer(); } main(1);",
    "function outer() { ctx.render('too late'); } function main(...outer) { outer(); } main(1);",
    "function outer() { ctx.render('too late'); } function main({ outer }) { outer(); } main({ outer: 1 });",
    "function outer() { ctx.render('too late'); } ((outer) => { outer(); })(1);",
    "function outer() { ctx.render('too late'); } function main() { outer(); if (true) { var { outer } = { outer: 1 }; } } main();",
    "function outer() { ctx.render('too late'); } function main() { outer(); if (true) { var [outer] = [1]; } } main();",
    "function main() { main(); ctx.render('too late'); } main();",
    "function first() { second(); ctx.render('too late'); } function second() { first(); } first();",
    "function e() { ctx.render('too late'); } try { throw 1; } catch (e) { e(); }",
    "function main() { ctx.render('too late'); }\nfor (let main = 1; main < 2; main += 1) { main(); break; }",
    "function key() { ctx.render('too late'); }\nfor (const key in { name: 1 }) { key(); break; }",
    "function main() { try {} catch (error) { ctx.render('too late'); } }\nmain();",
    "function main() { while (false) { ctx.render('too late'); } }\nmain();",
    "function main() { while (true) { return; } ctx.render('too late'); }\nmain();",
    "function main() { for (;;) { throw new Error('stop'); } ctx.render('too late'); }\nmain();",
    "function main() { do { return; } while (false); ctx.render('too late'); }\nmain();",
    "let helper = () => { ctx.render('too late'); };\nfor (helper of [1]) { helper(); }",
    "function main() { switch (0) { case 1: ctx.render('too late'); break; } }\nmain();",
    "function main() { switch (0) { case 0: return; } ctx.render('too late'); }\nmain();",
    "function main() { switch (null) { case 1: ctx.render('too late'); break; } }\nmain();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { case 'x': main = () => { ctx.render('too late'); }; break; } switch (flag) { case 'x': main = () => {}; break; } main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { default: main = () => { ctx.render('too late'); }; } switch (flag) { default: main = () => {}; } main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { case 'skip': break; default: main = () => { ctx.render('too late'); }; } switch (flag) { default: main = () => {}; } main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { case 'x': main = () => { ctx.render('too late'); }; break; } switch (flag) { default: main = () => {}; } main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); if (flag === 'y') { switch (flag) { case 'skip': break; default: main = () => { ctx.render('too late'); }; } switch (flag) { case 'y': main = () => {}; break; } main(); }",
    "const helpers = { main: () => {} }; const flag = await ctx.getVar('ctx.record.flag'); if (flag === 'y') { switch (flag) { case 'skip': break; default: helpers.main = () => { ctx.render('too late'); }; } switch (flag) { case 'y': helpers.main = () => {}; break; } helpers.main(); }",
    "let main = null; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { default: main ??= 1; } switch (flag) { case 'x': main ??= () => { ctx.render('too late'); }; break; } main();",
    "let main = null; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { default: main ??= 1; } switch (flag) { case 'x': break; default: main ??= () => { ctx.render('too late'); }; } main();",
    "let main = 1; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { default: main ||= 1; } switch (flag) { case 'x': main ||= () => { ctx.render('too late'); }; break; } main();",
    "let main = 0; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { default: main &&= 0; } switch (flag) { case 'x': main &&= () => { ctx.render('too late'); }; break; } main();",
    "const helpers = { main: null }; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { default: helpers.main ??= 1; } switch (flag) { case 'x': helpers.main ??= () => { ctx.render('too late'); }; break; } helpers.main();",
    "const keys = { main: 1 };\ndelete keys.main;\nfor (const key in keys) { ctx.render('too late'); }",
    "const keys = { main: 1 };\nconst alias = keys;\ndelete alias.main;\nfor (const key in keys) { ctx.render('too late'); }",
    "const items = [];\ndelete items[0];\nfor (const item of items) { ctx.render('too late'); }",
    "if (1 === 2) { ctx.render('too late'); }",
    "while (1 < 2) { return; } ctx.render('too late');",
    "switch ('a' + 'b') { case 'c': ctx.render('too late'); break; }",
    "const DISABLED = false; if (DISABLED) { ctx.render('too late'); }",
    "const KEY = 'ab'; switch (KEY) { case 'c': ctx.render('too late'); break; }",
    "const NEVER = 1 === 2; while (NEVER) { ctx.render('too late'); }",
    "let disabled = false; if (disabled) { ctx.render('too late'); }",
    "var hidden = false; if (hidden) { ctx.render('too late'); }",
    "let key = 'c'; switch (key) { case 'x': ctx.render('too late'); break; }",
    "let never = 1 === 2; while (never) { ctx.render('too late'); }",
    "const [item] = [0]; if (item) { ctx.render('too late'); }",
    "const { item } = { item: 0 }; if (item) { ctx.render('too late'); }",
    "for (const item of [false]) { if (item) { ctx.render('too late'); } }",
    "for (const item of []) { ctx.render('too late'); }",
    "const items = [];\nfor (const item of items) { ctx.render('too late'); }",
    "const helpers = { items: [] };\nconst { items } = helpers;\nfor (const item of items) { ctx.render('too late'); }",
    "let items;\nfunction setup() { const local = []; items = local; }\nsetup();\nfor (const item of items) { ctx.render('too late'); }",
    "const laterHelpers = [() => {}, () => { ctx.render('too late'); }];\nfor (const helper of laterHelpers) { helper(); break; }",
    "const reversedLaterHelpers = [() => { ctx.render('too late'); }, () => {}];\nreversedLaterHelpers.reverse();\nfor (const helper of reversedLaterHelpers) { helper(); break; }",
    "const poppedHelpers = [() => { ctx.render('too late'); }];\npoppedHelpers.pop();\nfor (const helper of poppedHelpers) { helper(); }",
    "const shiftedHelpers = [() => { ctx.render('too late'); }, () => {}];\nshiftedHelpers.shift();\nfor (const helper of shiftedHelpers) { helper(); }",
    "for (const key in {}) { ctx.render('too late'); }",
    "const keys = {};\nfor (const key in keys) { ctx.render('too late'); }",
    "let keys;\nfunction setup() { const local = {}; keys = local; }\nsetup();\nfor (const key in keys) { ctx.render('too late'); }",
    "const reorderedItems = [() => { ctx.render('too late'); }, () => {}];\ntry { throw new Error('x'); } catch { reorderedItems.reverse(); }\nreorderedItems[0]();",
    "const splicedItems = [() => { ctx.render('too late'); }];\ntry { throw new Error('x'); } catch { splicedItems.splice(0, 1, () => {}); }\nsplicedItems[0]();",
    "function loop() { loop(); } switch (loop()) { default: break; } ctx.render('too late');",
    "function loop() { loop(); } let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); switch (flag) { case loop(): break; case 'enable': main = () => { ctx.render('too late'); }; case 'run': main(); break; }",
    "function loop() { loop(); }\nswitch ('run') { case loop(): break; case 'run': ctx.render('too late'); break; }",
    "function loop() { loop(); }\nswitch ('missing') { default: ctx.render('too late'); case loop(): break; }",
    "function main() { while (true) { break; ctx.render('too late'); } }\nmain();",
    "function main() { for (let index = 0; index < 1; index += 1) { continue; ctx.render('too late'); } }\nmain();",
  ];

  for (const code of samples) {
    const result = await inspectRunJSCode({
      surface: 'js-model.render',
      modelUse: 'JSBlockModel',
      code,
    });

    assert.equal(result.ok, false, `${code} should be blocked`);
    assert.equal(
      result.blockers.some((item) => item.code === 'RUNJS_RENDER_UNREACHABLE_RENDER_CALL'),
      true,
      `${code} should use the unreachable render blocker`,
    );
  }
});

test('inspectRunJSCode blocks compound-condition overwrites on all render model surfaces', async () => {
  const renderModelUses = [
    'JSBlockModel',
    'JSFieldModel',
    'JSEditableFieldModel',
    'JSItemModel',
    'FormJSFieldItemModel',
    'JSColumnModel',
    'JSItemActionModel',
  ];
  const code = `
    const flag = await ctx.getVar('ctx.record.flag');
    const other = await ctx.getVar('ctx.record.other');
    let main = () => {};
    if (flag && other) {
      main = () => { ctx.render('too late'); };
    }
    if (flag && other) {
      main = () => {};
    }
    main();
  `;

  for (const modelUse of renderModelUses) {
    const result = await inspectRunJSCode({
      surface: 'js-model.render',
      modelUse,
      code,
    });

    assert.equal(result.ok, false, `${modelUse} should block unreachable compound-condition render`);
    assert.equal(
      result.blockers.some((item) => item.code === 'RUNJS_RENDER_UNREACHABLE_RENDER_CALL'),
      true,
      `${modelUse} should use the unreachable render blocker`,
    );
  }
});

test('inspectRunJSCode accepts top-level control-flow ctx.render calls on render surfaces', async () => {
  const samples = [
    `
      if (ctx.record?.title) {
        ctx.render(String(ctx.record.title));
      } else {
        ctx.render('-');
      }
    `,
    "try { throw new Error('recoverable'); } catch (error) {}\nctx.render('ok');",
    "switch (null) { case null: ctx.render('ok'); break; default: break; }",
    "const ready = await ctx.getVar('ctx.record.ready');\nwhile (ready) { return; }\nctx.render('ok');",
    "const items = (await ctx.getVar('ctx.record.items')) || [];\nfor (const item of items) { return; }\nctx.render('ok');",
    "try { try { throw new Error('nested'); } catch (error) { throw error; } } catch (error) { ctx.render('ok'); }",
    "function main() { try { try { throw new Error('nested'); } catch (error) { throw error; } } catch (error) { ctx.render('ok'); } }\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\ntry { if (flag) throw new Error('recoverable'); } catch (error) { ctx.render('ok'); }",
    "async function main() { const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) throw new Error('recoverable'); } catch (error) { ctx.render('ok'); } }\nawait main();",
    "try { await ctx.getVar('ctx.record.title'); } catch (error) { ctx.render('ok'); }",
    "try { await ctx.makeResource('MultiRecordResource').refresh(); } catch (error) { ctx.render('ok'); }",
    "try { JSON.parse('not-json'); } catch (error) { ctx.render('ok'); }",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main = () => { ctx.render('ok'); }; throw 1; } } catch (error) {} main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { switch (flag) { case 'ready': main = () => { ctx.render('ok'); }; throw 1; } } catch (error) {} main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { flag && (main = () => { ctx.render('ok'); }, (() => { throw 1; })()); } catch (error) {} main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { while (flag) { main = () => { ctx.render('ok'); }; throw 1; } } catch (error) {} main();",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main = () => { ctx.render('ok'); }; throw 1; } } catch (error) { main(); }",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { switch (flag) { case 'ready': main = () => { ctx.render('ok'); }; throw 1; } } catch (error) { main(); }",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { flag && (main = () => { ctx.render('ok'); }, (() => { throw 1; })()); } catch (error) { main(); }",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { while (flag) { main = () => { ctx.render('ok'); }; throw 1; } } catch (error) { main(); }",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { if (flag) { main = () => { ctx.render('ok'); }; throw 1; } } finally { main(); }",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { switch (flag) { case 'ready': main = () => { ctx.render('ok'); }; throw 1; } } finally { main(); }",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { flag && (main = () => { ctx.render('ok'); }, (() => { throw 1; })()); } finally { main(); }",
    "let main = () => {}; const flag = await ctx.getVar('ctx.record.flag'); try { while (flag) { main = () => { ctx.render('ok'); }; throw 1; } } finally { main(); }",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => {};\nswitch (flag) { case 'enable': main = () => { ctx.render('ok'); }; case 'run': main(); break; }",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => {};\nif (flag) { main = () => { ctx.render('ok'); }; }\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => {};\nflag && (main = () => { ctx.render('ok'); });\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => {};\nswitch (flag) { case 'enable': main = () => { ctx.render('ok'); }; break; }\nmain();",
    "function fail() { throw new Error('recoverable'); }\ntry { do {} while (fail()); } catch (error) { ctx.render('ok'); }",
    "let main = () => {};\ntry { throw 1; } catch (error) { main = () => { ctx.render('ok'); }; }\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => {};\ntry { if (flag) throw 1; } catch (error) { main = () => { ctx.render('ok'); }; }\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => {};\nwhile (flag) { main = () => { ctx.render('ok'); }; break; }\nmain();",
    "const flag = await ctx.getVar('ctx.record.flag');\nlet main = () => {};\nfor (; flag;) { main = () => { ctx.render('ok'); }; break; }\nmain();",
    "let main = () => {};\nfor (const item of [1]) { main = () => { ctx.render('ok'); }; break; }\nmain();",
    "let main = () => {};\nfor (const key in { value: 1 }) { main = () => { ctx.render('ok'); }; break; }\nmain();",
    "let main = () => {};\nwhile (true) { try { throw 1; } catch (error) { main = () => { ctx.render('ok'); }; break; } }\nmain();",
    "let disabled = false;\ndisabled = true;\nif (disabled) { ctx.render('ok'); }",
    "let disabled = false;\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) disabled = true;\nif (disabled) { ctx.render('ok'); }",
    "const items = [];\nitems[0] = 1;\nfor (const item of items) { ctx.render('ok'); }",
    "const items = [1];\nitems[0] += 1;\nfor (const key in items) { ctx.render('ok'); }",
    "const items = [1];\nitems[0]++;\nfor (const key in items) { ctx.render('ok'); }",
    "const keys = {};\nkeys.main = 1;\nfor (const key in keys) { ctx.render('ok'); }",
    "const keys = {};\nconst alias = keys;\nalias.main = 1;\nfor (const key in keys) { ctx.render('ok'); }",
    "const keys = {};\nconst flag = await ctx.getVar('ctx.record.flag');\nif (flag) { keys.main = 1; }\nfor (const key in keys) { ctx.render('ok'); }",
    "const flag = await ctx.getVar('ctx.record.flag');\nconst helpers = [() => {}];\nif (flag) { helpers[0] = () => { ctx.render('ok'); }; }\nfor (const helper of helpers) { helper(); }",
    "const flag = await ctx.getVar('ctx.record.flag');\nconst helpers = [() => {}];\nconst alias = helpers;\nif (flag) { alias[0] = () => { ctx.render('ok'); }; }\nfor (const helper of helpers) { helper(); }",
    "const flag = await ctx.getVar('ctx.record.flag');\nconst helpers = [() => {}];\nconst { list } = { list: helpers };\nif (flag) { list[0] = () => { ctx.render('ok'); }; }\nfor (const helper of helpers) { helper(); }",
  ];

  for (const code of samples) {
    const result = await inspectRunJSCode({
      surface: 'js-model.render',
      modelUse: 'JSBlockModel',
      code,
    });

    assert.equal(result.ok, true, `${code} should be accepted`);
  }
});

test('inspectRunJSCode accepts regex quote literals before a top-level ctx.render call', async () => {
  const result = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'JSBlockModel',
    code: `
      const escapeHtml = (value) => String(value)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      ctx.render(escapeHtml('Alice'));
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
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
  assert.equal(contract.models.JSItemActionModel.flowKey, 'jsSettings');
  assert.equal(contract.models.JSItemActionModel.flowPath, 'stepParams.jsSettings.runJs');
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

  const itemActionRenderResult = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'JSItemActionModel',
    code: "ctx.form?.setFieldsValue?.({ status: String(ctx.record?.status || '') }); ctx.render(null);",
  });
  assert.equal(itemActionRenderResult.ok, true);

  const actionResult = await inspectRunJSCode({
    surface: 'js-model.action',
    modelUse: 'JSRecordActionModel',
    code: "ctx.message.success(String(ctx.record?.status || 'ok'));",
  });
  assert.equal(actionResult.ok, true);
});

test('inspectRunJSCode treats JSItemActionModel as a render model', async () => {
  const missingRenderResult = await inspectRunJSCode({
    surface: 'js-model.render',
    modelUse: 'JSItemActionModel',
    code: "ctx.form?.setFieldsValue?.({ status: String(ctx.record?.status || '') });",
  });
  assert.equal(missingRenderResult.ok, false);
  assert.equal(
    missingRenderResult.blockers.some((item) => item.code === 'RUNJS_RENDER_SURFACE_RENDER_REQUIRED'),
    true,
  );

  const actionSurfaceResult = await inspectRunJSCode({
    surface: 'js-model.action',
    modelUse: 'JSItemActionModel',
    code: 'ctx.render(null);',
  });
  assert.equal(actionSurfaceResult.ok, false);
  assert.equal(actionSurfaceResult.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_MODEL_USE'), true);
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

test('inspectRunJSStaticCode still requires explicit action modelUse when surface-only validation is ambiguous', () => {
  const result = inspectRunJSStaticCode({
    surface: 'js-model.action',
    code: "ctx.message.success('ok');",
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_MODEL_USE'), true);
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

test('inspectRunJSCode ignores nested-only returns when value surfaces require a top-level return', async () => {
  const result = await inspectRunJSCode({
    modelUse: null,
    surface: 'reaction.value-runjs',
    code: `
      function computeTitle() {
        return String(ctx.formValues?.title || '').trim();
      }
      const title = computeTitle();
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_VALUE_SURFACE_RETURN_REQUIRED'), true);
});

test('inspectRunJSCode ignores object keys named return when value surfaces require a top-level return', async () => {
  const result = await inspectRunJSCode({
    modelUse: null,
    surface: 'reaction.value-runjs',
    code: "const shape = { return: 'not a statement' };",
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_VALUE_SURFACE_RETURN_REQUIRED'), true);
});

test('inspectRunJSCode ignores class computed methods when value surfaces require a top-level return', async () => {
  const result = await inspectRunJSCode({
    modelUse: null,
    surface: 'reaction.value-runjs',
    code: "class Example { ['x']() { return 1; } }",
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_VALUE_SURFACE_RETURN_REQUIRED'), true);
});

test('inspectRunJSCode accepts top-level control-flow returns on value surfaces', async () => {
  const result = await inspectRunJSCode({
    modelUse: null,
    surface: 'reaction.value-runjs',
    code: `
      if (ctx.formValues?.title) {
        return String(ctx.formValues.title).trim();
      }
      return 'fallback';
    `,
  });

  assert.equal(result.ok, true);
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

  const stringAuthResult = canonicalizeRunJSCode({
    modelUse: 'JSActionModel',
    code: "const currentUser = await ctx.request('auth:check');",
  });
  assert.equal(stringAuthResult.changed, true);
  assert.equal(stringAuthResult.code.includes('ctx.user ?? ctx.auth?.user ?? null'), true);
  assert.equal(stringAuthResult.transforms.some((item) => item.code === 'RUNJS_AUTH_CHECK_TO_CTX_USER'), true);

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

  const getResult = canonicalizeRunJSCode({
    modelUse: 'JSActionModel',
    code: `const response = await ctx.request('task:get', {
  params: {
    filterByTk: currentTaskId,
  },
  skipNotify: true,
});`,
  });
  assert.equal(getResult.changed, true);
  assert.equal(getResult.code.includes("ctx.makeResource('SingleRecordResource')"), true);
  assert.equal(getResult.code.includes('__runjsResource.setFilterByTk(currentTaskId);'), true);
  assert.equal(getResult.transforms.some((item) => item.code === 'RUNJS_REQUEST_GET_TO_SINGLE_RECORD_RESOURCE'), true);

  const regexPrefixResult = canonicalizeRunJSCode({
    modelUse: 'JSBlockModel',
    code: `const escapeHtml = (value) => String(value)
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const response = await ctx.request({
  url: 'task:list',
  method: 'get',
});`,
  });
  assert.equal(regexPrefixResult.changed, true);
  assert.equal(regexPrefixResult.code.includes("ctx.makeResource('MultiRecordResource')"), true);
  assert.equal(regexPrefixResult.transforms.some((item) => item.code === 'RUNJS_REQUEST_LIST_TO_MULTI_RECORD_RESOURCE'), true);
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

test('canonicalizeRunJSPayload normalizes literal escaped newlines in write payloads', () => {
  const payload = {
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          use: 'JSBlockModel',
          stepParams: {
            jsSettings: {
              runJs: {
                code: 'const title = String(ctx.formValues?.title || "");\\nreturn title.trim();',
                version: 'v2',
              },
            },
          },
        },
      ],
    },
  };

  const result = canonicalizeRunJSPayload({ payload });
  assert.equal(result.transforms.some((item) => item.code === 'RUNJS_NEWLINE_LITERAL_NORMALIZED'), true);
  assert.equal(payload.subModels.items[0].stepParams.jsSettings.runJs.code.includes('\\n'), false);
  assert.equal(payload.subModels.items[0].stepParams.jsSettings.runJs.code.includes('\n'), true);
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
