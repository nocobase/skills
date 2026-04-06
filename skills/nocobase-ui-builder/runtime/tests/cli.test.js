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
  assert.ok(payload.policyIssues.some((issue) => issue.ruleId === 'missing-required-ctx-render'));
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
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName('users');
        await ctx.resource.refresh();
        ctx.render(<Button>{ctx.resource.collectionName}</Button>);
        return {
          hasReact: typeof ctx.libs.React?.createElement === 'function',
          hasReactDOM: typeof ctx.libs.ReactDOM?.createRoot === 'function',
          hasAntd: typeof Button === 'function',
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
