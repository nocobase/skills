import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBatch, validateRunJSSnippet } from '../src/index.js';
import { runTask } from '../src/runner.js';

const testsRoot = fileURLToPath(new URL('.', import.meta.url));
const runtimeRoot = path.resolve(testsRoot, '..');
const skillRoot = path.resolve(runtimeRoot, '..');

function walkJavaScriptFiles(rootDir) {
  const output = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      if (entry.isFile() && /\.(?:m?js|cjs)$/.test(entry.name)) {
        output.push(nextPath);
      }
    }
  }
  return output.sort();
}

function collectNonLocalImportSpecifiers(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const matches = [];
  const patterns = [
    /^\s*import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gm,
    /(?:^|[^\w$.])import\(\s*['"]([^'"]+)['"]\s*\)/gm,
    /(?:^|[^\w$.])require\(\s*['"]([^'"]+)['"]\s*\)/gm,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      const specifier = match[1];
      if (!specifier.startsWith('node:') && !specifier.startsWith('.') && !specifier.startsWith('/')) {
        matches.push(specifier);
      }
      match = pattern.exec(source);
    }
  }

  return [...new Set(matches)].sort();
}

test('validateRunJSSnippet accepts JSX after compat lowering', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      function Banner() {
        return <div>Hello {ctx.record?.nickname}</div>;
      }
      ctx.render('');
      return <Banner />;
    `,
    context: {
      record: { nickname: 'Alice' },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.equal(result.syntaxIssues.length, 0);
  assert.equal(result.execution.returnValue.$$typeof, 'react.element');
  assert.equal(result.execution.returnValue.type, '[Function Banner]');
  assert.equal('preview' in result, false);
});

test('validateRunJSSnippet keeps explicit ctx.render visible after regex literals with quotes', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    surface: 'js-model.render',
    code: `
      const escapeHtml = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      ctx.render(escapeHtml('Alice'));
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.ok(result.usedContextPaths.includes('render'));
  assert.equal(result.policyIssues.some((issue) => issue.ruleId === 'missing-required-ctx-render'), false);
});

test('strict render models reject bare compat access', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      ctx.render(\`\${ctx.record?.username || ''}\${ctx.record?.nickname || ''}\`);
      return \`\${record?.username || ''}\${record?.nickname || ''}\`;
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.ok(result.contextIssues.some((issue) => issue.ruleId === 'bare-compat-access'));
  assert.ok(result.usedContextPaths.includes('record.username'));
  assert.ok(result.usedContextPaths.includes('record.nickname'));
});

test('strict render models allow local variables named like compat members', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      const record = { username: 'A', nickname: 'B' };
      ctx.render(\`\${record.username}\${record.nickname}\`);
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.contextIssues.length, 0);
});

test('static policy blocks literal write requests before execution', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      await ctx.request({ url: 'https://example.com/api', method: 'POST' });
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.policyIssues[0].ruleId, 'blocked-static-side-effect');
  assert.equal(typeof result.execution.runjsInspection?.blockerCount, 'number');
  assert.equal(result.execution.runjsInspection.warningCount, 0);
});

test('static compatibility validation rejects unknown precise members', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSEditableFieldModel',
    code: `
      ctx.render('');
      ctx.form.notRealMethod();
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.contextIssues[0].ruleId, 'unknown-compat-member');
});

test('editable field model updates value through mock form helpers', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSEditableFieldModel',
    code: `
      ctx.render('');
      ctx.setValue('Bob');
      return ctx.getValue();
    `,
    context: {
      value: 'Alice',
      formValues: { nickname: 'Alice' },
      namePath: ['nickname'],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.returnValue, 'Bob');
});

test('mock network responses make ctx.api.request validation repeatable', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      const response = await ctx.api.request('https://example.com/api/users');
      return response.data.nickname;
    `,
    network: {
      mode: 'mock',
      responses: [
        {
          url: 'https://example.com/api/users',
          body: { nickname: 'Alice' },
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.returnValue, 'Alice');
});

test('validateRunJSSnippet canonicalizes resource reads and preserves guard warnings', async () => {
  const result = await validateRunJSSnippet({
    surface: 'event-flow.execute-javascript',
    code: `
      const response = await ctx.request({
        url: 'tasks:list',
        params: {
          pageSize: 5,
        },
      });
      return {
        rows: Array.isArray(response?.data?.data) ? response.data.data.length : 0,
        pageSize: response?.data?.meta?.pageSize ?? null,
      };
    `,
    skillMode: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, 'JSActionModel');
  assert.deepEqual(result.execution.returnValue, {
    rows: 0,
    pageSize: 5,
  });
  assert.ok(result.policyIssues.some((issue) => issue.ruleId === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'));
  assert.equal(result.execution.runjsInspection.warningCount > 0, true);
  assert.equal(result.execution.runjsInspection.autoRewriteCount > 0, true);
  assert.equal(result.execution.runjsInspection.hasAutoRewrite, true);
  assert.equal(result.runtimeIssues.some((issue) => issue.ruleId === 'blocked-side-effect'), false);
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.name === 'resource.refresh' && attempt.status === 'simulated'));
});

test('validateRunJSSnippet canonicalizes string-form list requests and preserves guard warnings', async () => {
  const result = await validateRunJSSnippet({
    surface: 'event-flow.execute-javascript',
    code: `
      const endpoint = 'tasks:list';
      const response = await ctx.request(endpoint, {
        params: {
          pageSize: 6,
        },
      });
      return {
        rows: Array.isArray(response?.data?.data) ? response.data.data.length : 0,
        pageSize: response?.data?.meta?.pageSize ?? null,
      };
    `,
    skillMode: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, 'JSActionModel');
  assert.deepEqual(result.execution.returnValue, {
    rows: 0,
    pageSize: 6,
  });
  assert.ok(result.policyIssues.some((issue) => issue.ruleId === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'));
  assert.equal(result.execution.runjsInspection.warningCount > 0, true);
  assert.equal(result.execution.runjsInspection.autoRewriteCount > 0, true);
  assert.equal(result.execution.runjsInspection.hasAutoRewrite, true);
});

test('validateRunJSSnippet canonicalizes string-form single-record requests', async () => {
  const result = await validateRunJSSnippet({
    surface: 'event-flow.execute-javascript',
    code: `
      const endpoint = 'tasks:get';
      const response = await ctx.request(endpoint, {
        params: {
          filterByTk: 9,
        },
      });
      return {
        id: response?.data?.data?.id ?? null,
        title: response?.data?.data?.title ?? null,
      };
    `,
    skillMode: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.execution.returnValue, {
    id: 9,
    title: 'Sample task',
  });
  assert.ok(result.policyIssues.some((issue) => issue.ruleId === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'));
});

test('runTask simulates string-form local resource reads without preflight rewriting', async () => {
  const result = await runTask({
    model: 'JSActionModel',
    code: `
      const response = await ctx.request('tasks:get', {
        params: {
          filterByTk: 23,
        },
      });
      return {
        id: response?.data?.data?.id ?? null,
        title: response?.data?.data?.title ?? null,
      };
    `,
    skillMode: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.execution.returnValue, {
    id: 23,
    title: 'Sample task',
  });
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.requestKind === 'nocobase-resource-read'));
});

test('mock mode auto-mocks unmatched ctx.request reads', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      const response = await ctx.request('https://example.com/missing');
      return response.data;
    `,
    network: {
      mode: 'mock',
      responses: [],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.deepEqual(result.execution.returnValue, {});
  assert.equal(result.runtimeIssues[0].ruleId, 'auto-mocked-network-request');
  assert.equal(result.sideEffectAttempts[0].status, 'auto-mocked');
  assert.equal(result.sideEffectAttempts[0].mockSource, 'default');
});

test('skillMode blocks live network configuration even when allowHosts are configured', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      await ctx.request('https://example.com/api/users');
    `,
    network: {
      mode: 'live',
      allowHosts: ['example.com'],
    },
    skillMode: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.execution.skillMode, true);
  assert.equal(result.execution.networkMode, 'live');
  assert.ok(result.policyIssues.some((issue) => issue.ruleId === 'blocked-skill-live-network'));
  assert.equal(result.sideEffectAttempts.length, 0);
});

test('static policy blocks direct fetch usage before execution', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      await fetch('https://example.com/api/users');
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.ok(
    result.policyIssues.some((issue) => ['blocked-static-side-effect', 'RUNJS_FORBIDDEN_GLOBAL'].includes(issue.ruleId)),
  );
});

test('static policy blocks constructor-based code generation before execution', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      return this.constructor.constructor('return process.version')();
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.policyIssues[0].ruleId, 'blocked-dynamic-code-generation');
});

test('ChartEventsModel simulates chart bindings and ctx.openView without blocking validation', async () => {
  const result = await validateRunJSSnippet({
    model: 'ChartEventsModel',
    code: `
      chart.on('click', (params) => {
        ctx.openView({ title: String(params?.name || 'Details') });
      });
      ctx.openView({ title: 'Immediate details' });
      chart.setOption({ legend: { show: true } });
      return chart.getOption();
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.equal(result.execution.returnValue.legend.show, true);
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.name === 'chart.on' && attempt.status === 'simulated'));
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.name === 'ctx.openView' && attempt.status === 'simulated'));
});

test('ChartOptionModel accepts direct option returns without ctx.render', async () => {
  const result = await validateRunJSSnippet({
    model: 'ChartOptionModel',
    code: `
      return {
        xAxis: { type: 'category' },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [1, 2, 3] }],
      };
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.equal(result.execution.returnValue.series[0].type, 'bar');
});

test('ChartOptionModel blocks popup side effects', async () => {
  const result = await validateRunJSSnippet({
    model: 'ChartOptionModel',
    code: `
      ctx.openView({ title: 'Details' });
      return {};
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.ok(
    result.policyIssues.some((issue) => ['blocked-static-side-effect', 'RUNJS_FORBIDDEN_GLOBAL'].includes(issue.ruleId)),
  );
});

test('JSRecordActionModel can read record context and simulate messages', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSRecordActionModel',
    code: `
      ctx.message.success('ok');
      return ctx.record?.id;
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.returnValue, 1);
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.name === 'message.success' && attempt.status === 'simulated'));
});

test('surface-first event-flow validation uses the shared fallback action model', async () => {
  const result = await validateRunJSSnippet({
    surface: 'event-flow.execute-javascript',
    code: `
      const tempResource = ctx.makeResource('MultiRecordResource');
      tempResource.setResourceName('tasks');
      tempResource.setPage(2);
      await tempResource.refresh();
      ctx.message.success('ok');
      return {
        recordId: ctx.record?.id ?? null,
        collectionName: tempResource.collectionName,
        metaPage: tempResource.getMeta?.()?.page ?? null,
      };
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, 'JSActionModel');
  assert.equal(result.execution.returnValue.recordId, 1);
  assert.equal(result.execution.returnValue.collectionName, 'tasks');
  assert.equal(result.execution.returnValue.metaPage, 2);
});

test('linkage surface no longer re-applies render requirements for editable-field helpers', async () => {
  const result = await validateRunJSSnippet({
    surface: 'linkage.execute-javascript',
    model: 'JSEditableFieldModel',
    code: `
      ctx.setValue('Bob');
      return ctx.getValue();
    `,
    context: {
      value: 'Alice',
      formValues: { nickname: 'Alice' },
      namePath: ['nickname'],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.equal(result.execution.returnValue, 'Bob');
  assert.equal(result.policyIssues.some((issue) => issue.ruleId === 'missing-required-ctx-render'), false);
});

test('JSRecordActionModel blocks fetch side effects', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSRecordActionModel',
    code: `
      await fetch('https://example.com/api/users');
      return ctx.record?.id;
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.ok(
    result.policyIssues.some((issue) => ['blocked-static-side-effect', 'RUNJS_FORBIDDEN_GLOBAL'].includes(issue.ruleId)),
  );
});

test('JSCollectionActionModel reads selected rows from resource helpers', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSCollectionActionModel',
    code: `
      const rows = ctx.resource.getSelectedRows();
      return rows.length;
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.returnValue, 1);
  assert.ok(result.usedContextPaths.includes('resource.getSelectedRows'));
});

test('JSCollectionActionModel fails when using form-only helpers', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSCollectionActionModel',
    code: `
      return ctx.form.getFieldValue('status');
    `,
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.contextIssues.some((issue) => issue.ruleId === 'unknown-ctx-path')
      || result.policyIssues.some((issue) => issue.ruleId === 'RUNJS_UNKNOWN_CTX_MEMBER'),
  );
  assert.ok(
    result.usedContextPaths.length === 0 || result.usedContextPaths.includes('form.getFieldValue'),
  );
});

test('JSItemActionModel can mutate mock form state with record context', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSItemActionModel',
    code: `
      ctx.form.setFieldValue('status', 'done');
      return {
        id: ctx.record?.id,
        status: ctx.form.getFieldValue('status'),
      };
    `,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.execution.returnValue, {
    id: 1,
    status: 'done',
  });
});

test('JSItemActionModel fails on editable-field-only helpers', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSItemActionModel',
    code: `
      return ctx.setValue('done');
    `,
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.contextIssues.some((issue) => issue.ruleId === 'unknown-ctx-path')
      || result.policyIssues.some((issue) => issue.ruleId === 'RUNJS_UNKNOWN_CTX_MEMBER'),
  );
  assert.ok(
    result.usedContextPaths.length === 0 || result.usedContextPaths.includes('setValue'),
  );
});

test('FormJSFieldItemModel renders and simulates setProps', async () => {
  const result = await validateRunJSSnippet({
    model: 'FormJSFieldItemModel',
    code: `
      ctx.render(String(ctx.formValues?.nickname || ''));
      ctx.setProps({ hidden: true });
      return ctx.form.getFieldValue('nickname');
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.returnValue, 'Alice');
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.name === 'ctx.setProps' && attempt.status === 'simulated'));
});

test('FormJSFieldItemModel requires explicit ctx.render', async () => {
  const result = await validateRunJSSnippet({
    model: 'FormJSFieldItemModel',
    code: `
      ctx.setProps({ hidden: true });
      return ctx.form.getFieldValue('nickname');
    `,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.ok(
    result.policyIssues.some((issue) =>
      ['missing-required-ctx-render', 'RUNJS_RENDER_SURFACE_RENDER_REQUIRED'].includes(issue.ruleId),
    ),
  );
});

test('JSActionModel treats ctx.runjs as a legal simulated helper', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSActionModel',
    code: `
      await ctx.runjs('console.log("hello from nested")');
      ctx.message.info('done');
      return ctx.resource?.collectionName;
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.returnValue, 'users');
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.name === 'ctx.runjs' && attempt.status === 'simulated'));
});

test('JSBlockModel exposes minimal upstream-like libs and requires initResource before ctx.resource exists', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      const React = ctx.libs.React;
      const { Button } = ctx.libs.antd;
      const root = ctx.libs.ReactDOM.createRoot(ctx.element);
      const preboundResourceType = typeof ctx.resource;
      ctx.initResource('MultiRecordResource');
      ctx.resource.setResourceName('users');
      await ctx.resource.refresh();

      function Banner() {
        return <Button>{ctx.resource.collectionName}</Button>;
      }

      root.render(<Banner />);
      ctx.render(<Banner />);
      return {
        hasReactAlias: typeof ctx.React?.createElement === 'function',
        hasReactLib: typeof React?.createElement === 'function',
        hasReactDOM: typeof ctx.ReactDOM?.createRoot === 'function',
        hasRootRender: typeof root?.render === 'function',
        hasAntd: typeof ctx.antd?.Button === 'function',
        hasAntdLib: typeof Button === 'function',
        preboundResourceType,
        resourceName: ctx.resource.collectionName,
      };
    `,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.execution.returnValue, {
    hasReactAlias: true,
    hasReactLib: true,
    hasReactDOM: true,
    hasRootRender: true,
    hasAntd: true,
    hasAntdLib: true,
    preboundResourceType: 'undefined',
    resourceName: 'users',
  });
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.name === 'resource.refresh' && attempt.status === 'simulated'));
});

test('runBatch propagates defaultSkillMode to tasks without explicit skillMode', async () => {
  const batch = await runBatch({
    tasks: [
      {
        id: 'blocked-by-default-skill-mode',
        model: 'JSBlockModel',
        code: `ctx.render('blocked');`,
        network: {
          mode: 'live',
          allowHosts: ['example.com'],
        },
      },
    ],
    defaultSkillMode: true,
  });

  assert.equal(batch.ok, false);
  assert.equal(batch.summary.total, 1);
  assert.equal(batch.summary.failed, 1);
  assert.equal(batch.summary.blocked, 1);
  assert.equal(batch.results[0].id, 'blocked-by-default-skill-mode');
  assert.ok(batch.results[0].policyIssues.some((issue) => issue.ruleId === 'blocked-skill-live-network'));
  assert.equal(batch.results[0].execution.executed, false);
  assert.equal(batch.results[0].execution.skillMode, true);
});

test('runBatch keeps task ids on successful results', async () => {
  const batch = await runBatch({
    tasks: [
      {
        id: 'simple-validate',
        model: 'JSBlockModel',
        code: "ctx.render('ok');",
      },
    ],
  });

  assert.equal(batch.ok, true);
  assert.equal(batch.summary.passed, 1);
  assert.equal(batch.results[0].id, 'simple-validate');
  assert.equal(batch.results[0].execution.executed, true);
});

test('runBatch rejects malformed input early', async () => {
  await assert.rejects(() => runBatch({}), /Batch input must include one tasks array/);
  await assert.rejects(() => runBatch({ tasks: [] }), /Batch tasks must be one non-empty array/);
  await assert.rejects(
    () =>
      runBatch({
        tasks: [
          {
            code: "ctx.render('Hello');",
          },
        ],
      }),
    /Each batch task requires one model/,
  );
  await assert.rejects(
    () =>
      runBatch({
        tasks: [
          {
            model: 'JSBlockModel',
          },
        ],
      }),
    /requires either code or codeFile/,
  );
});

test('validateRunJSSnippet returns timeout for hanging promises', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      await new Promise(() => {});
    `,
    timeoutMs: 50,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, true);
  assert.equal(result.execution.terminated, true);
  assert.equal(result.runtimeIssues[0].ruleId, 'timeout');
});

test('worker path survives parent execArgv that are invalid for Worker threads', () => {
  const runtimeEntry = new URL('../src/index.js', import.meta.url).href;
  const script = `
    import { validateRunJSSnippet } from ${JSON.stringify(runtimeEntry)};
    const result = await validateRunJSSnippet({
      model: 'JSBlockModel',
      code: "ctx.render('ok');",
    });
    console.log(JSON.stringify({ ok: result.ok, executed: result.execution.executed }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(child.status, 0, child.stderr);
  const payload = JSON.parse(child.stdout.trim());
  assert.deepEqual(payload, {
    ok: true,
    executed: true,
  });
});

test('runtime source stays free of external npm imports', () => {
  const roots = [
    path.join(runtimeRoot, 'src'),
    path.join(skillRoot, 'scripts'),
  ];

  for (const rootDir of roots) {
    for (const filePath of walkJavaScriptFiles(rootDir)) {
      const disallowed = collectNonLocalImportSpecifiers(filePath);
      assert.deepEqual(disallowed, [], `${path.relative(skillRoot, filePath)} should only import node: modules or local files`);
    }
  }
});

test('nb-runjs stays self-contained when copied without node_modules', () => {
  const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'nocobase-ui-builder-runtime-'));
  const skillCopyRoot = path.join(sandboxRoot, 'nocobase-ui-builder');

  try {
    cpSync(skillRoot, skillCopyRoot, {
      recursive: true,
      filter: (sourcePath) => path.basename(sourcePath) !== 'node_modules',
    });

    const cliPath = path.join(skillCopyRoot, 'runtime', 'bin', 'nb-runjs.mjs');
    const child = spawnSync(process.execPath, [cliPath, 'validate', '--stdin-json'], {
      cwd: sandboxRoot,
      input: JSON.stringify({
        model: 'JSBlockModel',
        code: "ctx.render('ok');",
      }),
      encoding: 'utf8',
    });

    assert.equal(child.status, 0, child.stderr || child.stdout);
    const payload = JSON.parse(child.stdout.trim());
    assert.equal(payload.ok, true);
    assert.equal(payload.execution.executed, true);
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test('validateRunJSSnippet does not leak parent global window or document', async () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { sentinel: 'parent-window' },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: { sentinel: 'parent-document' },
  });

  try {
    const result = await validateRunJSSnippet({
      model: 'JSBlockModel',
      code: `
        ctx.render(String(window?.location?.host || 'no-window'));
      `,
    });

    assert.equal(result.ok, true);
    assert.equal(globalThis.window.sentinel, 'parent-window');
    assert.equal(globalThis.document.sentinel, 'parent-document');
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    } else {
      delete globalThis.window;
    }
    if (originalDocumentDescriptor) {
      Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
    } else {
      delete globalThis.document;
    }
  }
});

test('log recorder truncates excessive console output', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      for (let index = 0; index < 210; index += 1) {
        console.log('line', index);
      }
    `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.logs.length, 200);
  assert.ok(result.runtimeIssues.some((issue) => issue.ruleId === 'log-output-truncated'));
});
