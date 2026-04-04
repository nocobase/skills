import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewEnvironment } from '../src/context.js';
import { describeProfile, findProfile, listProfiles, previewRunJSSnippet, runBatch, validateRunJSSnippet } from '../src/index.js';
import { createWorkerFailureResult } from '../src/runner.js';

test('previewRunJSSnippet renders HTML string for JSBlockModel', async () => {
  const result = await previewRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('<div class="ok">Hello ' + ctx.record?.nickname + '</div>');
    `,
    context: {
      record: { nickname: 'Alice' },
    },
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.match(result.preview.html, /Hello Alice/);
  assert.equal(result.preview.fidelity, 'compatible');
  assert.equal(result.execution.executed, true);
});

test('previewRunJSSnippet rejects missing explicit ctx.render for JSBlockModel', async () => {
  const result = await previewRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      return '<strong>Hello ' + ctx.record.nickname + '</strong>';
    `,
    context: {
      record: { nickname: 'Alice' },
    },
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.policyIssues[0].ruleId, 'missing-required-ctx-render');
  assert.ok(result.usedContextPaths.includes('record.nickname'));
});

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
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.equal(result.syntaxIssues.length, 0);
  assert.equal(result.execution.returnValue.$$typeof, 'react.element');
  assert.equal(result.execution.returnValue.type, '[Function Banner]');
});

test('static policy blocks literal write requests before execution', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      await ctx.request({ url: 'https://example.com/api', method: 'POST' });
    `,
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.policyIssues[0].ruleId, 'blocked-static-side-effect');
});

test('static compatibility validation rejects unknown precise members', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSEditableFieldModel',
    code: `
      ctx.render('');
      ctx.form.notRealMethod();
    `,
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.contextIssues[0].ruleId, 'unknown-compat-member');
});

test('precise compatibility validation rejects property access after function leaves', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      return ctx.message.success.foo;
    `,
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.contextIssues[0].ruleId, 'unknown-compat-member');
});

test('JSEditableFieldModel updates value through mock form helpers', async () => {
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
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.returnValue, 'Bob');
});

test('mock network responses make compat request validation repeatable', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      const response = await ctx.request('https://example.com/api/users');
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
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.returnValue, 'Alice');
});

test('mock mode blocks unmatched network reads', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      await ctx.fetch('https://example.com/missing');
    `,
    network: {
      mode: 'mock',
      responses: [],
    },
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, true);
  assert.equal(result.runtimeIssues[0].ruleId, 'unmocked-network-request');
  assert.equal(result.sideEffectAttempts[0].status, 'blocked');
  assert.equal(result.sideEffectAttempts[0].ruleId, 'unmocked-network-request');
});

test('strict render models reject bare compat access like record in JSColumnModel', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      ctx.render(\`\${ctx.record?.username || ''}\${ctx.record?.nickname || ''}\`);
      return \`\${record?.username || ''}\${record?.nickname || ''}\`;
    `,
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.ok(result.contextIssues.some((issue) => issue.ruleId === 'bare-compat-access'));
  assert.ok(result.usedContextPaths.includes('record.username'));
  assert.ok(result.usedContextPaths.includes('record.nickname'));
});

test('strict render models still allow local variables named like compat members', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      const record = { username: 'A', nickname: 'B' };
      ctx.render(\`\${record.username}\${record.nickname}\`);
    `,
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.contextIssues.length, 0);
});

test('strict render models normalize runtime undefined compat roots into contract errors', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      if (true) { const record = { username: 'inner' }; }
      ctx.render(String(ctx.record?.username || ''));
      return String(record?.username || '');
    `,
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.ok(result.contextIssues.some((issue) => issue.ruleId === 'bare-compat-access'));
  assert.ok(!result.runtimeIssues.some((issue) => issue.ruleId === 'runtime-error'));
});

test('strict render models allow common destructuring and function-param shadowing', async () => {
  const destructuringResult = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      const { record } = { record: { username: 'local' } };
      ctx.render(String(record.username));
    `,
    isolate: false,
  });
  assert.equal(destructuringResult.ok, true);

  const functionParamResult = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      function show({ record }) { return record.username; }
      ctx.render(show({ record: { username: 'local' } }));
    `,
    isolate: false,
  });
  assert.equal(functionParamResult.ok, true);

  const nestedDestructuringResult = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      const { outer: { record } } = { outer: { record: { username: 'local' } } };
      ctx.render(record.username);
    `,
    isolate: false,
  });
  assert.equal(nestedDestructuringResult.ok, true);

  const aliasDestructuringResult = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      const { record: localRecord } = { record: { username: 'local' } };
      ctx.render(localRecord.username);
    `,
    isolate: false,
  });
  assert.equal(aliasDestructuringResult.ok, true);

  const catchDestructuringResult = await validateRunJSSnippet({
    model: 'JSColumnModel',
    code: `
      try {
        throw { record: { username: 'local' } };
      } catch ({ record }) {
        ctx.render(record.username);
      }
    `,
    isolate: false,
  });
  assert.equal(catchDestructuringResult.ok, true);
});

test('preview returns degraded JSON rendering for structured values', async () => {
  const result = await previewRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render({ nickname: ctx.record.nickname, status: ctx.record.status });
    `,
    context: {
      record: { nickname: 'Alice', status: 'active' },
    },
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.preview.rendered, true);
  assert.equal(result.preview.fidelity, 'degraded');
  assert.match(result.preview.html, /Alice/);
});

test('ChartOptionModel allows dataset access patterns like ctx.data.objects.map', async () => {
  const result = await previewRunJSSnippet({
    model: 'ChartOptionModel',
    code: `
      return {
        xAxis: { type: 'category', data: (ctx.data.objects || []).map((row) => row.department) },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: (ctx.data.objects || []).map((row) => row.employeeCount) }],
      };
    `,
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.equal(result.preview.rendered, true);
  assert.match(result.preview.text, /Sales/);
  assert.match(result.preview.text, /"type": "bar"/);
});

test('ChartEventsModel simulates chart bindings and ctx.openView without blocking validation', async () => {
  const result = await validateRunJSSnippet({
    model: 'ChartEventsModel',
    code: `
      chart.on('click', (params) => {
        ctx.openView({ title: String(params?.name || 'Details') });
      });
      chart.setOption({ legend: { show: true } });
      return chart.getOption();
    `,
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.equal(result.execution.returnValue.legend.show, true);
  assert.ok(result.sideEffectAttempts.some((attempt) => attempt.name === 'chart.on' && attempt.status === 'simulated'));
  assert.ok(
    !result.policyIssues.some((issue) => issue.ruleId === 'blocked-static-side-effect' && /openView/.test(issue.message)),
  );
});

test('previewRunJSSnippet executes JSX even when preview fidelity stays unsupported', async () => {
  const result = await previewRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render(<div className="banner">Hello {ctx.record?.nickname}</div>);
    `,
    context: {
      record: { nickname: 'Alice' },
    },
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution.executed, true);
  assert.equal(result.preview.rendered, false);
  assert.equal(result.preview.fidelity, 'unsupported');
  assert.equal(result.runtimeIssues[0].ruleId, 'react-unsupported');
});

test('preview flags React-like values as unsupported', async () => {
  const result = await previewRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render({
        $$typeof: Symbol.for('react.element'),
        type: 'div',
        props: { children: 'Hello' },
      });
    `,
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.preview.rendered, false);
  assert.equal(result.preview.fidelity, 'unsupported');
  assert.equal(result.runtimeIssues[0].ruleId, 'react-unsupported');
});

test('preview degrades plain structured values that only look like DOM nodes', async () => {
  const result = await previewRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render({ nodeType: 1, nodeName: 'DIV', textContent: 'Hello' });
    `,
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.preview.rendered, true);
  assert.equal(result.preview.fidelity, 'degraded');
  assert.match(result.preview.html, /nodeType/);
});

test('ctx.element does not provide a DOM-node preview side channel', async () => {
  const environment = createPreviewEnvironment(findProfile('JSBlockModel'), 'preview', {}, undefined);
  let finalized = false;

  try {
    const node = environment.sandboxGlobals.document.createElement('div');
    node.textContent = 'Hello';
    environment.ctx.element.append(node);
    const state = await environment.finalize();
    finalized = true;

    assert.equal(state.preview.rendered, false);
    assert.equal(state.runtimeIssues[0].ruleId, 'dom-preview-unsupported');
  } finally {
    if (!finalized) await environment.finalize();
  }
});

test('runtime only exposes contract members for the current profile', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      return {
        libsKeys: Object.keys(ctx.libs).sort(),
        getValueType: typeof getValue,
        collectionFieldType: typeof collectionField,
        ctxCollectionFieldType: typeof ctx.collectionField,
        selectedRowsType: typeof selectedRows,
      };
    `,
    isolate: false,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.execution.returnValue)), {
    libsKeys: ['dayjs'],
    getValueType: 'undefined',
    collectionFieldType: 'undefined',
    ctxCollectionFieldType: 'undefined',
    selectedRowsType: 'undefined',
  });
});

test('feedback APIs only expose methods declared by the compat contract', async () => {
  const profile = findProfile('JSBlockModel');
  const environment = createPreviewEnvironment(profile, 'validate', {}, undefined);

  try {
    assert.deepEqual(Object.keys(environment.ctx.message).sort(), ['error', 'info', 'success', 'warning']);
    assert.deepEqual(Object.keys(environment.ctx.notification).sort(), ['error', 'info', 'open', 'success', 'warning']);
    assert.deepEqual(Object.keys(environment.ctx.modal).sort(), ['confirm', 'error', 'info', 'success', 'warning']);
    assert.equal('confirm' in environment.ctx.message, false);
    assert.equal('confirm' in environment.ctx.notification, false);
    assert.equal('open' in environment.ctx.modal, false);
  } finally {
    await environment.finalize();
  }
});

test('static policy blocks window.open before execution', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      window.open('https://example.com');
    `,
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.policyIssues[0].ruleId, 'blocked-static-side-effect');
});

test('static policy blocks location search mutation before execution', async () => {
  const result = await validateRunJSSnippet({
    model: 'JSBlockModel',
    code: `
      ctx.render('');
      location.search = '?keyword=alice';
    `,
    isolate: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.execution.executed, false);
  assert.equal(result.policyIssues[0].ruleId, 'blocked-static-side-effect');
});

test('preview capabilities participate in fidelity decisions', async () => {
  const profile = {
    ...findProfile('JSBlockModel'),
    previewCapabilities: {
      html: false,
      react: false,
      dom: false,
      text: true,
    },
  };
  const environment = createPreviewEnvironment(profile, 'preview', {}, undefined);
  await environment.ctx.render('<div>Compat</div>');
  const state = await environment.finalize();

  assert.equal(state.preview.fidelity, 'degraded');
  assert.equal(state.preview.text, '<div>Compat</div>');
  assert.equal(state.runtimeIssues[0].ruleId, 'preview-capability-degraded');
});

test('structured preview falls back to text when html capability is disabled', async () => {
  const profile = {
    ...findProfile('JSBlockModel'),
    previewCapabilities: {
      html: false,
      react: false,
      dom: false,
      text: true,
    },
  };
  const environment = createPreviewEnvironment(profile, 'preview', {}, undefined);
  await environment.ctx.render({ nickname: 'Alice' });
  const state = await environment.finalize();

  assert.equal(state.preview.fidelity, 'degraded');
  assert.match(state.preview.text, /"nickname": "Alice"/);
});

test('default profile capabilities disable react and dom preview', () => {
  const profile = describeProfile('JSBlockModel');
  assert.deepEqual(profile.previewCapabilities, {
    html: true,
    react: false,
    dom: false,
    text: true,
  });
  assert.equal(profile.enforceCtxQualifiedAccess, true);
  assert.equal(profile.requireExplicitCtxRender, true);
  assert.deepEqual(profile.topLevelAliases, ['ctx']);
  assert.ok(!profile.topLevelAliases.includes('React'));
  assert.ok(!profile.topLevelAliases.includes('ReactDOM'));
  assert.ok(!profile.topLevelAliases.includes('antd'));
  assert.ok(!profile.topLevelAliases.includes('antdIcons'));
});

test('preview environment only exposes zero-dependency shared libs', async () => {
  const profile = findProfile('JSBlockModel');
  const environment = createPreviewEnvironment(profile, 'validate', {}, undefined);

  try {
    assert.deepEqual(Object.keys(environment.ctx.libs).sort(), ['dayjs']);
    assert.equal('React' in environment.ctx, false);
    assert.equal('antd' in environment.ctx, false);
    assert.equal('ReactDOM' in environment.sandboxGlobals, false);
  } finally {
    await environment.finalize();
  }
});

test('worker failure result defaults execution.executed to false', () => {
  const result = createWorkerFailureResult(
    {
      model: 'JSBlockModel',
      mode: 'validate',
    },
    'worker-failed',
    'boom',
  );

  assert.equal(result.execution.executed, false);
  assert.equal(result.runtimeIssues[0].ruleId, 'worker-failed');
});

test('runBatch aggregates blocked and degraded counts', async () => {
  const batch = await runBatch({
    tasks: [
      {
        mode: 'preview',
        model: 'JSBlockModel',
        code: `ctx.render('<div>OK</div>');`,
      },
      {
        mode: 'validate',
        model: 'JSBlockModel',
        code: `
          ctx.render('');
          await ctx.request({ url: 'https://example.com', method: 'POST' });
        `,
      },
    ],
    isolate: false,
  });

  assert.equal(batch.summary.total, 2);
  assert.equal(batch.summary.failed, 1);
  assert.equal(batch.summary.blocked, 1);
});

test('describeProfile exposes contract and root behaviors for JSColumnModel', async () => {
  const profile = describeProfile('jsColumn');
  assert.equal(profile.model, 'JSColumnModel');
  assert.ok(profile.availableContextKeys.includes('recordIndex'));
  assert.equal(profile.enforceCtxQualifiedAccess, true);
  assert.equal(profile.requireExplicitCtxRender, true);
  assert.equal(profile.rootBehaviors.record, 'opaque');
  assert.equal(profile.rootBehaviors.libs, 'precise');
});

test('describeProfile exposes chart-specific runtime affordances', async () => {
  const optionProfile = describeProfile('ChartOptionModel');
  assert.equal(optionProfile.rootBehaviors.data, 'opaque');
  assert.equal(optionProfile.requireExplicitCtxRender, false);

  const eventsProfile = describeProfile('ChartEventsModel');
  assert.equal(eventsProfile.rootBehaviors.chart, 'precise');
  assert.deepEqual(eventsProfile.simulatedCompatCalls, ['openView']);
  assert.ok(eventsProfile.topLevelAliases.includes('chart'));
});

test('all built-in profiles pass basic validate and preview smoke tasks', async () => {
  for (const profile of listProfiles()) {
    const described = describeProfile(profile.model);
    const validateCode = described.requireExplicitCtxRender ? `ctx.render('<div>${profile.model}</div>'); return true;` : 'return true;';
    const validateResult = await validateRunJSSnippet({
      model: profile.model,
      code: validateCode,
      isolate: false,
    });
    assert.equal(validateResult.ok, true, `${profile.model} validate smoke should pass`);

    const previewCode = described.requireExplicitCtxRender
      ? `ctx.render('<div>${profile.model}</div>');`
      : `return '<div>${profile.model}</div>';`;
    const previewResult = await previewRunJSSnippet({
      model: profile.model,
      code: previewCode,
      isolate: false,
    });
    assert.equal(previewResult.ok, true, `${profile.model} preview smoke should pass`);
    assert.equal(previewResult.preview.rendered, true, `${profile.model} preview should render`);
  }
});
