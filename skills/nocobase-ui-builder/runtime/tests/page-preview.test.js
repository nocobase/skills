import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { renderPageBlueprintAsciiPreview } from '../src/page-blueprint-preview.js';
import { runPagePreviewCli } from '../src/page-preview-cli.js';

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

test('renderPageBlueprintAsciiPreview renders row grouping, block summaries, and one popup layer', () => {
  const result = renderPageBlueprintAsciiPreview({
    version: '1',
    mode: 'create',
    navigation: {
      group: { title: 'Workspace' },
      item: { title: 'Employees' },
    },
    page: {
      title: 'Employees',
    },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [[{ key: 'mainTable', span: 16 }, { key: 'summary', span: 8 }]],
        },
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            collection: 'employees',
            fields: ['nickname', 'email', 'phone', 'status', 'department'],
            recordActions: [
              {
                type: 'view',
                title: 'View',
                popup: {
                  title: 'Employee details',
                  blocks: [
                    {
                      type: 'details',
                      collection: 'employees',
                      fields: [
                        'nickname',
                        {
                          field: 'manager',
                          popup: {
                            title: 'Manager details',
                            blocks: [{ type: 'details', collection: 'employees', fields: ['nickname'] }],
                          },
                        },
                        'email',
                      ],
                    },
                  ],
                },
              },
            ],
          },
          {
            key: 'summary',
            type: 'details',
            collection: 'employees',
            fields: ['nickname', 'status'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /^PAGE: Employees \(create\)/m);
  assert.match(result.ascii, /MENU: Workspace \/ Employees/);
  assert.match(result.ascii, /Row 1: \[mainTable span=16\] \[summary span=8\]/);
  assert.match(result.ascii, /Fields: nickname, email, phone, status, \+1 more/);
  assert.match(result.ascii, /Record actions: \[View\]/);
  assert.match(result.ascii, /Popup: Employee details/);
  assert.match(result.ascii, /Popup from field "manager": nested popup omitted/);
  assert.deepEqual(result.warnings, ['Popup from field "manager" was omitted because preview expands popups only 1 level(s).']);
});

test('renderPageBlueprintAsciiPreview falls back for unknown block types and wrapper inputs', () => {
  const result = renderPageBlueprintAsciiPreview({
    requestBody: {
      version: '1',
      mode: 'replace',
      target: { pageSchemaUid: 'employees-page-schema' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'mystery',
              type: 'customThing',
              title: 'Mystery block',
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /^PAGE: employees-page-schema \(replace\)/m);
  assert.match(result.ascii, /TARGET: employees-page-schema/);
  assert.match(result.ascii, /customThing "Mystery block" \[mystery\]/);
  assert.deepEqual(result.warnings, ['Received outer requestBody wrapper; preview unwrapped the inner page blueprint.']);
});

test('renderPageBlueprintAsciiPreview rejects invalid inputs', () => {
  const result = renderPageBlueprintAsciiPreview({
    mode: 'create',
    page: { title: 'Broken' },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /recognizable inner page blueprint object/i);
  assert.equal(result.ascii, '');
});

test('page preview cli reads stdin json and returns ascii output', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      page: { title: 'Projects' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              type: 'table',
              collection: 'projects',
              fields: ['name', 'status'],
              actions: ['create'],
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPagePreviewCli(['--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.match(payload.ascii, /^PAGE: Projects \(create\)/m);
  assert.match(payload.ascii, /Actions: \[create\]/);
});

test('page preview cli returns ok=false for invalid blueprint payload', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      page: { title: 'Broken' },
    }),
  );

  const exitCode = await runPagePreviewCli(['--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.match(payload.error, /recognizable inner page blueprint object/i);
});
