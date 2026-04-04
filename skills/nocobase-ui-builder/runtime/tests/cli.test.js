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

test('models command prints supported profiles', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const exitCode = await runCli(['models'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.read());
  assert.ok(payload.models.some((item) => item.model === 'JSBlockModel'));
  assert.ok(payload.models.some((item) => item.model === 'ChartOptionModel'));
  assert.ok(payload.models.some((item) => item.model === 'ChartEventsModel'));
});

test('contexts command prints root behaviors for one profile', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const exitCode = await runCli(['contexts', '--model', 'JSColumnModel'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.rootBehaviors.record, 'opaque');
});

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
      isolate: false,
    }),
  );

  const exitCode = await runCli(['validate', '--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.execution.executed, true);
  assert.ok(payload.usedContextPaths.includes('record.nickname'));
});

test('preview command fails stdin json payload without ctx.render on strict render model', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      model: 'JSColumnModel',
      code: "return String(ctx.record?.nickname || '');",
      context: {
        record: { nickname: 'Alice' },
      },
      isolate: false,
    }),
  );

  const exitCode = await runCli(['preview', '--stdin-json'], {
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

test('batch command resolves task file paths relative to the input file', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const batchFixture = fileURLToPath(new URL('../fixtures/batch.json', import.meta.url));
  const exitCode = await runCli(
    ['batch', '--input', batchFixture],
    {
      cwd: process.cwd(),
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
  );

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.total, 1);
  assert.equal(payload.results[0].preview.rendered, true);
});
