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

test('renderPageBlueprintAsciiPreview shows template mode for block and popup templates', () => {
  const result = renderPageBlueprintAsciiPreview({
    version: '1',
    mode: 'create',
    page: {
      title: 'Templated page',
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'profileForm',
            type: 'details',
            template: {
              uid: 'employee-form-template',
              mode: 'reference',
              usage: 'fields',
            },
          },
          {
            key: 'employeeTable',
            type: 'table',
            collection: 'employees',
            fields: ['nickname'],
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'Employee details',
                  template: {
                    uid: 'employee-popup-template',
                    mode: 'copy',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /Template: employee-form-template \[mode=reference, usage=fields\]/);
  assert.match(result.ascii, /Template: employee-popup-template \[mode=copy\]/);
});

test('renderPageBlueprintAsciiPreview keeps popup template binding and warns that local popup content is ignored', () => {
  const result = renderPageBlueprintAsciiPreview({
    version: '1',
    mode: 'create',
    page: {
      title: 'Templated page',
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'employeeTable',
            type: 'table',
            collection: 'employees',
            fields: ['nickname'],
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'Employee details',
                  template: {
                    uid: 'employee-popup-template',
                    mode: 'reference',
                  },
                  mode: 'drawer',
                  layout: {
                    rows: [['ignoredPopupBlock']],
                  },
                  blocks: [
                    {
                      key: 'ignoredPopupBlock',
                      type: 'details',
                      title: 'Ignored popup block',
                      collection: 'employees',
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

  assert.equal(result.ok, true);
  assert.match(result.ascii, /Template: employee-popup-template \[mode=reference\]/);
  assert.match(result.ascii, /Ignored local popup keys: mode, blocks, layout/);
  assert.doesNotMatch(result.ascii, /Ignored popup block/);
  assert.deepEqual(result.warnings, ['Popup "Employee details" will ignore local popup keys: mode, blocks, layout.']);
});

test('renderPageBlueprintAsciiPreview does not invent template mode when the blueprint omitted it', () => {
  const result = renderPageBlueprintAsciiPreview({
    version: '1',
    mode: 'create',
    page: {
      title: 'Templated page',
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'profileForm',
            type: 'details',
            template: {
              uid: 'employee-form-template',
              usage: 'fields',
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /Template: employee-form-template \[usage=fields\]/);
  assert.doesNotMatch(result.ascii, /\[mode=/);
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

test('renderPageBlueprintAsciiPreview keeps wrapper warning for prepare-write helper envelope on preview-only path', () => {
  const result = renderPageBlueprintAsciiPreview({
    requestBody: {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['nickname'],
            },
          ],
        },
      ],
    },
    templateDecision: {
      kind: 'discovery-only',
      template: {
        uid: 'employee-popup-template',
      },
      reasonCode: 'missing-live-context',
    },
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /^PAGE: Employees \(create\)/m);
  assert.deepEqual(result.warnings, ['Received outer requestBody wrapper; preview unwrapped the inner page blueprint.']);
  assert.doesNotMatch(result.ascii, /the current opener\/host\/planning context was insufficient/i);
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

test('prepareApplyBlueprintRequest returns normalized templateDecision when provided through options', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
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
              recordActions: [
                {
                  type: 'view',
                  popup: {
                    template: {
                      uid: 'employee-popup-template',
                      mode: 'reference',
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      templateDecision: {
        kind: 'selected-reference',
        template: {
          uid: 'employee-popup-template',
        },
        reasonCode: 'standard-reuse',
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.templateDecision, {
    kind: 'selected-reference',
    mode: 'reference',
    template: {
      uid: 'employee-popup-template',
    },
    reasonCode: 'standard-reuse',
    reason: 'standard reuse',
    summary: 'Template employee-popup-template via reference: standard reuse.',
  });
  assert.doesNotMatch(result.ascii, /standard reuse/i);
});

test('prepareApplyBlueprintRequest rejects selected templateDecision values that do not match a bound blueprint template', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
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
              recordActions: [
                {
                  type: 'view',
                  popup: {
                    template: {
                      uid: 'employee-popup-template',
                      mode: 'copy',
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      templateDecision: {
        kind: 'selected-reference',
        template: {
          uid: 'employee-popup-template',
        },
        reasonCode: 'standard-reuse',
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.templateDecision, undefined);
  assert.equal(result.cliBody, undefined);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'inconsistent-template-decision' && issue.path === 'templateDecision'));
});

test('prepareApplyBlueprintRequest accepts selected templateDecision values on mixed-template pages when the current decision binding exists', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'profileForm',
              type: 'details',
              template: {
                uid: 'employee-form-template',
                mode: 'reference',
              },
            },
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['nickname', 'email'],
              recordActions: [
                {
                  type: 'view',
                  popup: {
                    template: {
                      uid: 'employee-popup-template',
                      mode: 'reference',
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      templateDecision: {
        kind: 'selected-reference',
        template: {
          uid: 'employee-form-template',
        },
        reasonCode: 'standard-reuse',
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.templateDecision, {
    kind: 'selected-reference',
    mode: 'reference',
    template: {
      uid: 'employee-form-template',
    },
    reasonCode: 'standard-reuse',
    reason: 'standard reuse',
    summary: 'Template employee-form-template via reference: standard reuse.',
  });
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest accepts selected templateDecision values when every binding matches the same template uid/mode', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'profileForm',
              type: 'details',
              template: {
                uid: 'employee-shared-template',
                mode: 'reference',
              },
            },
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['nickname', 'email'],
              recordActions: [
                {
                  type: 'view',
                  popup: {
                    template: {
                      uid: 'employee-shared-template',
                      mode: 'reference',
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      templateDecision: {
        kind: 'selected-reference',
        template: {
          uid: 'employee-shared-template',
        },
        reasonCode: 'standard-reuse',
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.templateDecision, {
    kind: 'selected-reference',
    mode: 'reference',
    template: {
      uid: 'employee-shared-template',
    },
    reasonCode: 'standard-reuse',
    reason: 'standard reuse',
    summary: 'Template employee-shared-template via reference: standard reuse.',
  });
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest accepts discovery-only templateDecision on mixed pages with other bound templates', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'profileForm',
              type: 'details',
              template: {
                uid: 'employee-form-template',
                mode: 'reference',
                usage: 'fields',
              },
            },
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
    {
      templateDecision: {
        kind: 'discovery-only',
        template: {
          uid: 'employee-form-template',
        },
        reasonCode: 'missing-live-context',
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.templateDecision, {
    kind: 'discovery-only',
    template: {
      uid: 'employee-form-template',
    },
    reasonCode: 'missing-live-context',
    reason: 'the current opener/host/planning context was insufficient',
    summary: 'Template employee-form-template stayed discovery-only: the current opener/host/planning context was insufficient.',
  });
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest accepts inline-non-template templateDecision on mixed pages with other bound templates', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'profileForm',
              type: 'details',
              template: {
                uid: 'employee-form-template',
                mode: 'reference',
                usage: 'fields',
              },
            },
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['nickname', 'email'],
              recordActions: [
                {
                  type: 'view',
                  popup: {
                    title: 'Employee details',
                    blocks: [
                      {
                        type: 'details',
                        collection: 'users',
                        fields: ['nickname', 'email'],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      templateDecision: {
        kind: 'inline-non-template',
        reasonCode: 'single-occurrence',
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.templateDecision, {
    kind: 'inline-non-template',
    reasonCode: 'single-occurrence',
    reason: 'the scene appeared only once in the current task',
    summary: 'Stayed inline/non-template: the scene appeared only once in the current task.',
  });
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest accepts not-repeat-eligible templateDecision on mixed pages with other bound templates', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'profileForm',
              type: 'details',
              template: {
                uid: 'employee-form-template',
                mode: 'reference',
                usage: 'fields',
              },
            },
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['nickname', 'email'],
              recordActions: [
                {
                  type: 'view',
                  popup: {
                    title: 'Highly customized details',
                    blocks: [
                      {
                        type: 'details',
                        collection: 'users',
                        fields: ['nickname', 'email'],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      templateDecision: {
        kind: 'inline-non-template',
        reasonCode: 'not-repeat-eligible',
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.templateDecision, {
    kind: 'inline-non-template',
    reasonCode: 'not-repeat-eligible',
    reason: 'the scene is too customized or structurally unique for template reuse',
    summary: 'Stayed inline/non-template: the scene is too customized or structurally unique for template reuse.',
  });
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest rejects invalid templateDecision payloads', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
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
    {
      templateDecision: {
        kind: 'selected-reference',
        reasonCode: 'standard-reuse',
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.templateDecision, undefined);
  assert.equal(result.cliBody, undefined);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'invalid-template-decision' && issue.path === 'templateDecision'));
});

test('prepareApplyBlueprintRequest returns normalized templateDecision when the blueprint is recognizable even if other blueprint gates fail', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
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
        {
          title: 'Summary',
          blocks: [
            {
              type: 'markdown',
            },
          ],
        },
      ],
    },
    {
      templateDecision: {
        kind: 'inline-non-template',
        reasonCode: 'single-occurrence',
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.cliBody, undefined);
  assert.deepEqual(result.templateDecision, {
    kind: 'inline-non-template',
    reasonCode: 'single-occurrence',
    reason: 'the scene appeared only once in the current task',
    summary: 'Stayed inline/non-template: the scene appeared only once in the current task.',
  });
  assert.ok(result.errors.some((issue) => issue.ruleId === 'unexpected-outer-tab-count'));
});

test('prepareApplyBlueprintRequest omits normalized templateDecision when the blueprint is not recognizable', () => {
  const result = prepareApplyBlueprintRequest({
    requestBody: JSON.stringify({
      version: '1',
      mode: 'create',
      tabs: [],
    }),
    templateDecision: {
      kind: 'selected-reference',
      template: {
        uid: 'employee-popup-template',
      },
      reasonCode: 'standard-reuse',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.ascii, '');
  assert.equal(result.templateDecision, undefined);
  assert.equal(result.cliBody, undefined);
  assert.deepEqual(result.errors, [
    {
      path: 'requestBody',
      ruleId: 'stringified-request-body',
      message: 'Outer requestBody must stay an object page blueprint, not a JSON string.',
    },
  ]);
});

test('prepareApplyBlueprintRequest rejects root-level control fields inside the inner blueprint', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Employees' },
    requestBody: {
      leaked: true,
    },
    templateDecision: {
      leaked: true,
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.templateDecision, undefined);
  assert.equal(result.cliBody, undefined);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'illegal-blueprint-control-field' && issue.path === 'requestBody'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'illegal-blueprint-control-field' && issue.path === 'templateDecision'));
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

test('prepareApplyBlueprintRequest accepts popup template payloads that also carry ignored local popup keys', () => {
  const result = prepareApplyBlueprintRequest(
    {
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
                    template: {
                      uid: 'user-edit-popup-template',
                      mode: 'reference',
                    },
                    mode: 'drawer',
                    layout: 'side-by-side',
                    blocks: {
                      ignored: true,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      templateDecision: {
        kind: 'selected-reference',
        template: {
          uid: 'user-edit-popup-template',
        },
        reasonCode: 'standard-reuse',
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.match(result.ascii, /Template: user-edit-popup-template \[mode=reference\]/);
  assert.match(result.ascii, /Ignored local popup keys: mode, blocks, layout/);
  assert.deepEqual(result.templateDecision, {
    kind: 'selected-reference',
    mode: 'reference',
    template: {
      uid: 'user-edit-popup-template',
    },
    reasonCode: 'standard-reuse',
    reason: 'standard reuse',
    summary: 'Template user-edit-popup-template via reference: standard reuse.',
  });
  assert.deepEqual(result.warnings, ['Popup "Edit user" will ignore local popup keys: mode, blocks, layout.']);
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

test('page preview cli prepare-write accepts helper envelope with templateDecision', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      requestBody: {
        version: '1',
        mode: 'create',
        page: { title: 'Employees' },
        tabs: [
          {
            title: 'Overview',
            blocks: [
              {
                key: 'usersTable',
                type: 'table',
                collection: 'users',
                fields: ['nickname'],
              },
            ],
          },
        ],
      },
      templateDecision: {
        kind: 'discovery-only',
        template: {
          uid: 'employee-popup-template',
        },
        reasonCode: 'missing-live-context',
      },
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
  assert.deepEqual(payload.warnings, []);
  assert.deepEqual(payload.templateDecision, {
    kind: 'discovery-only',
    template: {
      uid: 'employee-popup-template',
    },
    reasonCode: 'missing-live-context',
    reason: 'the current opener/host/planning context was insufficient',
    summary: 'Template employee-popup-template stayed discovery-only: the current opener/host/planning context was insufficient.',
  });
  assert.doesNotMatch(payload.ascii, /the current opener\/host\/planning context was insufficient/i);
});

test('page preview cli prepare-write accepts bootstrap-before-bind templateDecision without forcing convert', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      requestBody: {
        version: '1',
        mode: 'create',
        page: { title: 'Employees' },
        tabs: [
          {
            title: 'Overview',
            blocks: [
              {
                key: 'usersTable',
                type: 'table',
                collection: 'users',
                fields: ['nickname'],
              },
            ],
          },
        ],
      },
      templateDecision: {
        kind: 'discovery-only',
        template: {
          name: '角色表格',
        },
        reasonCode: 'bootstrap-after-first-write',
      },
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
  assert.deepEqual(payload.warnings, []);
  assert.deepEqual(payload.templateDecision, {
    kind: 'discovery-only',
    template: {
      name: '角色表格',
    },
    reasonCode: 'bootstrap-after-first-write',
    reason: 'the first repeated scene must be written and saved before later instances can bind it; convert is preferred only when supported',
    summary:
      'Template 角色表格 stayed discovery-only: the first repeated scene must be written and saved before later instances can bind it; convert is preferred only when supported.',
  });
  assert.doesNotMatch(payload.ascii, /convert is preferred only when supported/i);
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
