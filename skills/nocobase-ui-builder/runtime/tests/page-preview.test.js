import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { prepareApplyBlueprintRequest, renderPageBlueprintAsciiPreview } from '../src/page-blueprint-preview.js';
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

test('prepareApplyBlueprintRequest unwraps outer requestBody and returns normalized cli body', () => {
  const result = prepareApplyBlueprintRequest({
    requestBody: {
      version: '1',
      mode: 'create',
      navigation: {
        group: { title: 'Workspace' },
        item: { title: 'Employees' },
      },
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['nickname', 'email'],
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /^PAGE: Employees \(create\)/m);
  assert.deepEqual(result.warnings, ['Received outer requestBody wrapper; preview unwrapped the inner page blueprint.']);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.facts, {
    mode: 'create',
    pageTitle: 'Employees',
    menuPath: 'Workspace / Employees',
    outerTabCount: 1,
    expectedOuterTabs: 1,
    targetPageSchemaUid: '',
  });
  assert.deepEqual(result.cliBody, {
    version: '1',
    mode: 'create',
    navigation: {
      group: { title: 'Workspace' },
      item: { title: 'Employees' },
    },
    page: { title: 'Employees' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            fields: ['nickname', 'email'],
          },
        ],
      },
    ],
  });
});

test('prepareApplyBlueprintRequest rejects invalid reaction items before first write', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Employees' },
    reaction: {
      items: [
        {
          type: 'setActionLinkageRules',
          target: 'main.employeeForm.submit',
          rules: [],
          key: 'shouldNotBeHere',
        },
        {
          type: 'setActionLinkageRules',
          target: 'main.employeeForm.submit',
          rules: [],
        },
        {
          type: 'unsupportedReaction',
          target: 'main.employeeForm',
          rules: {},
        },
      ],
    },
    tabs: [
      {
        key: 'main',
        title: 'Overview',
        blocks: [
          {
            key: 'employeeForm',
            type: 'createForm',
            collection: 'employees',
            fields: ['nickname'],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(
    JSON.stringify(result.errors),
    /invalid-reaction-item-key|duplicate-reaction-slot|unsupported-reaction-type|invalid-reaction-rules|unknown-reaction-target/,
  );
});

test('prepareApplyBlueprintRequest rejects high-risk reaction condition operators and sibling formValues paths', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Employees' },
    reaction: {
      items: [
        {
          type: 'setBlockLinkageRules',
          target: 'main.rolesReferenceTable',
          rules: [
            {
              key: 'toggleRolesReference',
              when: {
                logic: '$and',
                items: [
                  {
                    path: 'formValues.username',
                    operator: '$isNotEmpty',
                  },
                ],
              },
              then: [
                {
                  type: 'setBlockState',
                  state: 'visible',
                },
              ],
            },
          ],
        },
        {
          type: 'setActionLinkageRules',
          target: 'main.employeeForm.submitAction',
          rules: [
            {
              key: 'toggleSubmitState',
              when: {
                logic: '$and',
                items: [
                  {
                    path: 'formValues.username',
                    operator: '$notEmpty',
                  },
                ],
              },
              then: [
                {
                  type: 'setActionState',
                  state: 'disabled',
                },
              ],
            },
          ],
        },
      ],
    },
    tabs: [
      {
        key: 'main',
        title: 'Overview',
        blocks: [
          {
            key: 'employeeForm',
            type: 'createForm',
            collection: 'employees',
            fields: ['nickname'],
            actions: [
              {
                type: 'submit',
                key: 'submitAction',
              },
            ],
          },
          {
            key: 'rolesReferenceTable',
            type: 'table',
            collection: 'roles',
            fields: ['name'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'unsupported-reaction-operator'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'invalid-block-action-condition-path'));
});

test('prepareApplyBlueprintRequest requires explicit stable keys for whole-page reaction targets', () => {
  const blockTargetResult = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Employees' },
    reaction: {
      items: [
        {
          type: 'setFieldValueRules',
          target: 'Overview.employeeForm',
          rules: [],
        },
      ],
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'employeeForm',
            type: 'createForm',
            collection: 'employees',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(blockTargetResult.ok, false);
  assert.ok(blockTargetResult.errors.some((issue) => issue.ruleId === 'reaction-target-requires-explicit-key'));

  const actionTargetResult = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Employees' },
    reaction: {
      items: [
        {
          type: 'setActionLinkageRules',
          target: 'main.employeeForm.submit_1',
          rules: [],
        },
      ],
    },
    tabs: [
      {
        key: 'main',
        title: 'Overview',
        blocks: [
          {
            key: 'employeeForm',
            type: 'createForm',
            collection: 'employees',
            fields: ['nickname'],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(actionTargetResult.ok, false);
  assert.ok(actionTargetResult.errors.some((issue) => issue.ruleId === 'reaction-target-requires-explicit-key'));
});

test('prepareApplyBlueprintRequest rejects high-risk first-write blueprint mistakes', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Broken users page' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            layout: { rows: [['usersTable']] },
            fields: ['nickname', 'email'],
          },
        ],
      },
      {
        title: 'Summary',
        pageSchemaUid: 'should-not-be-here',
        blocks: [
          {
            type: 'markdown',
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.cliBody, undefined);
  assert.match(result.ascii, /^PAGE: Broken users page \(create\)/m);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'unexpected-outer-tab-count'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'block-layout-not-allowed'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'illegal-tab-key' && issue.path === 'tabs[1].pageSchemaUid'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'placeholder-tab'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'placeholder-block'));
});

test('prepareApplyBlueprintRequest rejects stringified requestBody payloads', () => {
  const result = prepareApplyBlueprintRequest({
    requestBody: JSON.stringify({
      version: '1',
      mode: 'create',
      tabs: [],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.ascii, '');
  assert.deepEqual(result.errors, [
    {
      path: 'requestBody',
      ruleId: 'stringified-request-body',
      message: 'Outer requestBody must stay an object page blueprint, not a JSON string.',
    },
  ]);
});

test('prepareApplyBlueprintRequest validates custom edit popups and popup layout objects', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            fields: ['nickname', 'email'],
            recordActions: [
              {
                type: 'edit',
                title: 'Edit',
                popup: {
                  title: 'Edit user',
                  layout: 'side-by-side',
                  blocks: [
                    {
                      type: 'details',
                      collection: 'users',
                      fields: ['nickname'],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'invalid-layout-object' && issue.path === 'tabs[0].blocks[0].recordActions[0].popup.layout'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'custom-edit-popup-edit-form-count'));
});

test('page preview cli prepare-write returns normalized cli body json', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'replace',
      target: { pageSchemaUid: 'users-page-schema' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['nickname', 'email'],
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPagePreviewCli(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.facts.expectedOuterTabs, 1);
  assert.equal(payload.cliBody.target.pageSchemaUid, 'users-page-schema');
});

test('page preview cli prepare-write accepts explicit expected outer tab count', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      tabs: [
        {
          title: 'List',
          blocks: [
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['nickname'],
            },
          ],
        },
        {
          title: 'Detail',
          blocks: [
            {
              key: 'usersDetail',
              type: 'details',
              collection: 'users',
              fields: ['nickname'],
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPagePreviewCli(['--stdin-json', '--prepare-write', '--expected-outer-tabs', '2'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.facts.expectedOuterTabs, 2);
  assert.equal(payload.facts.outerTabCount, 2);
});
