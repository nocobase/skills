import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { runCli } from '../src/cli.js';

function createMemoryStream() {
  const stream = new PassThrough();
  let output = '';
  stream.on('data', (chunk) => {
    output += chunk.toString('utf8');
  });
  return {
    stream,
    read() {
      return output;
    },
  };
}

function createInputStream(text) {
  const stream = new PassThrough();
  stream.end(text);
  return stream;
}

test('validate command accepts stdin json payload', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      model: 'JSBlockModel',
      code: "ctx.render('Hello ' + ctx.record?.nickname);",
      context: {
        record: { nickname: 'Alice' },
      },
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.execution.executed, true);
  assert.ok(payload.usedContextPaths.includes('record.nickname'));
  assert.equal('preview' in payload, false);
});

test('validate command accepts stdin json payload with regex quote literals before ctx.render', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      model: 'JSBlockModel',
      surface: 'js-model.render',
      code: `
        const escapeHtml = (value) => String(value)
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

        ctx.render(escapeHtml('Alice'));
      `,
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.ok(payload.usedContextPaths.includes('render'));
  assert.equal(payload.policyIssues.some((issue) => issue.ruleId === 'missing-required-ctx-render'), false);
});

test('validate command rejects strict render snippets without explicit ctx.render', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      model: 'JSColumnModel',
      code: "return String(ctx.record?.nickname || '');",
      context: {
        record: { nickname: 'Alice' },
      },
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.ok(
    payload.policyIssues.some((issue) =>
      ['missing-required-ctx-render', 'RUNJS_RENDER_SURFACE_RENDER_REQUIRED'].includes(issue.ruleId),
    ),
  );
});

test('validate command accepts value-return surface without render-model ctx.render requirement', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      surface: 'reaction.value-runjs',
      code: "return String(ctx.formValues?.nickname || '').trim();",
      context: {
        formValues: { nickname: 'Alice' },
      },
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json', '--skill-mode'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.surface, 'reaction.value-runjs');
  assert.equal(payload.model, 'JSEditableFieldModel');
  assert.equal(payload.execution.returnValue, 'Alice');
});

test('validate command accepts event-flow surface with the shared fallback action model', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      surface: 'event-flow.execute-javascript',
      code: `
        const tempResource = ctx.makeResource('MultiRecordResource');
        tempResource.setResourceName('tasks');
        tempResource.setPage(3);
        await tempResource.refresh();
        ctx.message.success('ok');
        return {
          recordId: ctx.record?.id ?? null,
          collectionName: tempResource.collectionName,
          metaPage: tempResource.getMeta?.()?.page ?? null,
        };
      `,
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json', '--skill-mode'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.model, 'JSActionModel');
  assert.equal(payload.execution.returnValue.recordId, 1);
  assert.equal(payload.execution.returnValue.collectionName, 'tasks');
  assert.equal(payload.execution.returnValue.metaPage, 3);
});

test('validate command preserves RunJS guard warnings after canonicalizing resource reads', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      surface: 'event-flow.execute-javascript',
      code: `
        const response = await ctx.request({
          url: 'tasks:list',
          params: {
            pageSize: 7,
          },
        });
        return {
          rows: Array.isArray(response?.data?.data) ? response.data.data.length : 0,
          pageSize: response?.data?.meta?.pageSize ?? null,
        };
      `,
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json', '--skill-mode'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.ok(payload.policyIssues.some((issue) => issue.ruleId === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'));
  assert.deepEqual(payload.execution.returnValue, {
    rows: 0,
    pageSize: 7,
  });
  assert.equal(payload.execution.runjsInspection.warningCount > 0, true);
  assert.equal(payload.execution.runjsInspection.autoRewriteCount > 0, true);
  assert.equal(payload.execution.runjsInspection.hasAutoRewrite, true);
});

test('validate command canonicalizes string-form single-record resource reads', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      surface: 'event-flow.execute-javascript',
      code: `
        const target = 'tasks:get';
        const response = await ctx.request(target, {
          params: {
            filterByTk: 12,
          },
        });
        return {
          id: response?.data?.data?.id ?? null,
          title: response?.data?.data?.title ?? null,
        };
      `,
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json', '--skill-mode'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.ok(payload.policyIssues.some((issue) => issue.ruleId === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'));
  assert.deepEqual(payload.execution.returnValue, {
    id: 12,
    title: 'Sample task',
  });
  assert.equal(payload.execution.runjsInspection.warningCount > 0, true);
  assert.equal(payload.execution.runjsInspection.autoRewriteCount > 0, true);
});

test('validate command blocks value-return surface without top-level return', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      surface: 'reaction.value-runjs',
      code: "const value = String(ctx.formValues?.nickname || '').trim();",
      context: {
        formValues: { nickname: 'Alice' },
      },
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json', '--skill-mode'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.ok(payload.policyIssues.some((issue) => issue.ruleId === 'RUNJS_VALUE_SURFACE_RETURN_REQUIRED'));
  assert.equal(payload.execution.executed, false);
  assert.equal(payload.execution.runjsInspection.blockerCount > 0, true);
  assert.equal(payload.execution.runjsInspection.warningCount, 0);
});

test('validate command blocks js-model action surface when host model is missing', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      surface: 'js-model.action',
      code: "ctx.message.success('ok');",
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json', '--skill-mode'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.ok(payload.policyIssues.some((issue) => issue.ruleId === 'RUNJS_UNKNOWN_MODEL_USE'));
});

test('validate command blocks live network in skill mode', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      model: 'JSBlockModel',
      code: "ctx.render(''); await ctx.request('https://example.com/api/users');",
      network: {
        mode: 'live',
        allowHosts: ['example.com'],
      },
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json', '--skill-mode'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.execution.executed, false);
  assert.equal(payload.execution.skillMode, true);
  assert.ok(payload.policyIssues.some((issue) => issue.ruleId === 'blocked-skill-live-network'));
});

test('validate command accepts upstream-style libs and initResource helpers', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      model: 'JSBlockModel',
      code: `
        const { Button } = ctx.libs.antd;
        const preboundResourceType = typeof ctx.resource;
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName('users');
        await ctx.resource.refresh();
        ctx.render(<Button>{ctx.resource.collectionName}</Button>);
        return {
          hasReact: typeof ctx.libs.React?.createElement === 'function',
          hasReactDOM: typeof ctx.libs.ReactDOM?.createRoot === 'function',
          hasAntd: typeof Button === 'function',
          preboundResourceType,
          resourceName: ctx.resource.collectionName,
        };
      `,
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.execution.returnValue, {
    hasReact: true,
    hasReactDOM: true,
    hasAntd: true,
    preboundResourceType: 'undefined',
    resourceName: 'users',
  });
});

test('batch command resolves task file paths relative to the input file and keeps task id', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const batchFixture = fileURLToPath(new URL('../fixtures/batch.json', import.meta.url));

  const exitCode = await runCli(['batch', '--input', batchFixture], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.total, 1);
  assert.equal(payload.summary.passed, 1);
  assert.equal(payload.results[0].id, 'block-validate');
  assert.equal(payload.results[0].execution.executed, true);
  assert.equal('preview' in payload.results[0], false);
});

test('batch command returns a stable JSON error when --input is missing its value', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const exitCode = await runCli(['batch', '--input'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout.read(), '');
  assert.deepEqual(JSON.parse(stderr.read()), {
    ok: false,
    error: 'Missing value for --input.',
    usage: {
      commands: {
        validate:
          'Validate one trusted snippet. Required: ((--model <model> | --surface <surface>) --code-file <path>) or (--stdin-json). Optional: --context-file <path> --network-file <path> --skill-mode --timeout <ms> --version <version>.',
        batch: 'Run multiple validate tasks from one JSON file. Required: --input <path>. Optional: --skill-mode.',
      },
    },
  });
});

test('validate command returns a stable JSON error when --model is missing its value', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const exitCode = await runCli(['validate', '--model', '--code-file', 'snippet.js'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout.read(), '');
  assert.match(JSON.parse(stderr.read()).error, /Missing value for --model\./);
});

test('validate command returns a stable JSON error when --code-file is missing its value', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const exitCode = await runCli(['validate', '--model', 'JSBlockModel', '--code-file'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout.read(), '');
  assert.match(JSON.parse(stderr.read()).error, /Missing value for --code-file\./);
});

test('batch command applies --skill-mode to tasks and counts blocked results', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const batchFixture = fileURLToPath(new URL('../fixtures/batch-skill-mode-blocked.json', import.meta.url));

  const exitCode = await runCli(['batch', '--input', batchFixture, '--skill-mode'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.summary.total, 1);
  assert.equal(payload.summary.failed, 1);
  assert.equal(payload.summary.blocked, 1);
  assert.equal(payload.results[0].id, 'skill-mode-live-network');
  assert.ok(payload.results[0].policyIssues.some((issue) => issue.ruleId === 'blocked-skill-live-network'));
});
