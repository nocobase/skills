import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
  prepareApplyBlueprintRequest as rawPrepareApplyBlueprintRequest,
  renderPageBlueprintAsciiPreview,
} from '../src/page-blueprint-preview.js';
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

const collectionMetadata = {
  collections: {
    users: {
      titleField: 'nickname',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'username', type: 'string', interface: 'input' },
        { name: 'nickname', type: 'string', interface: 'input' },
        { name: 'email', type: 'string', interface: 'input' },
        { name: 'phone', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
        { name: 'bio', type: 'text', interface: 'textarea' },
        { name: 'department', type: 'belongsTo', interface: 'm2o', target: 'departments', foreignKey: 'department_id', targetKey: 'id' },
        { name: 'roles', type: 'belongsToMany', interface: 'm2m', target: 'roles' },
      ],
    },
    departments: {
      titleField: 'title',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'title', type: 'string', interface: 'input' },
      ],
    },
    roles: {
      titleField: 'name',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'name', type: 'string', interface: 'input' },
        { name: 'title', type: 'string', interface: 'input' },
        { name: 'description', type: 'string', interface: 'textarea' },
        { name: 'scope', type: 'string', interface: 'select' },
        { name: 'priority', type: 'integer', interface: 'number' },
        { name: 'status', type: 'string', interface: 'select' },
        { name: 'category', type: 'string', interface: 'input' },
        { name: 'color', type: 'string', interface: 'input' },
        { name: 'code', type: 'string', interface: 'input' },
        { name: 'sort', type: 'integer', interface: 'number' },
        { name: 'notes', type: 'string', interface: 'textarea' },
      ],
    },
  },
};

const emptyPrepareCollectionMetadata = { collections: {} };
const defaultPrepareCollectionMetadata = collectionMetadata;

function defaultFilterAction(fieldNames = ['nickname', 'email', 'status']) {
  const normalizedFieldNames = fieldNames.filter(Boolean);
  return {
    type: 'filter',
    settings: {
      filterableFieldNames: normalizedFieldNames,
      defaultFilter: {
        logic: '$and',
        items: normalizedFieldNames.map((path) => ({
          path,
          operator: ['status', 'scope', 'priority', 'sort'].includes(path) ? '$eq' : '$includes',
          value: '',
        })),
      },
    },
  };
}

function prepareApplyBlueprintRequest(input, options) {
  return rawPrepareApplyBlueprintRequest(input, options);
}

function isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildFixedCollectionPopupDefaults(collectionName) {
  return {
    view: {
      name: `View ${collectionName}`,
      description: `View one ${collectionName} record.`,
    },
    addNew: {
      name: `Create ${collectionName}`,
      description: `Create one ${collectionName} record.`,
    },
    edit: {
      name: `Edit ${collectionName}`,
      description: `Edit one ${collectionName} record.`,
    },
  };
}

function getPrepareCollectionEntry(rawCollectionMetadata, collectionName) {
  const rawCollections =
    isObjectRecord(rawCollectionMetadata) && isObjectRecord(rawCollectionMetadata.collections)
      ? rawCollectionMetadata.collections
      : rawCollectionMetadata;
  if (!isObjectRecord(rawCollections)) return null;
  return isObjectRecord(rawCollections[collectionName]) ? rawCollections[collectionName] : null;
}

function buildDefaultCollectionFieldGroups(rawCollectionMetadata, collectionName) {
  const collectionEntry = getPrepareCollectionEntry(rawCollectionMetadata, collectionName);
  const fieldNames = Array.from(
    new Set(
      (Array.isArray(collectionEntry?.fields) ? collectionEntry.fields : [])
        .map((field) => (typeof field?.name === 'string' ? field.name.trim() : ''))
        .filter(Boolean),
    ),
  );
  if (fieldNames.length === 0) return undefined;
  return [
    {
      title: 'Primary fields',
      fields: fieldNames,
    },
  ];
}

function prepareWithDirectCollectionDefaults(blueprint, options = {}) {
  const {
    collections = ['users'],
    collectionMetadata: providedCollectionMetadata = defaultPrepareCollectionMetadata,
    ...prepareOptions
  } = options;
  const nextBlueprint = structuredClone(blueprint);
  const existingDefaults = isObjectRecord(nextBlueprint.defaults) ? nextBlueprint.defaults : {};
  const existingCollections = isObjectRecord(existingDefaults.collections) ? existingDefaults.collections : {};
  const nextCollections = { ...existingCollections };
  const probe = prepareApplyBlueprintRequest(nextBlueprint, {
    collectionMetadata: providedCollectionMetadata,
    ...prepareOptions,
  });
  const collectionRequirements = Array.isArray(probe.defaultsRequirements?.collections)
    ? probe.defaultsRequirements.collections
    : [];
  const associationRequirements = Array.isArray(probe.defaultsRequirements?.associations)
    ? probe.defaultsRequirements.associations
    : [];
  const collectionRequirementByName = new Map(collectionRequirements.map((entry) => [entry.collection, entry]));
  const collectionNames = Array.from(
    new Set([
      ...collections,
      ...collectionRequirements.map((entry) => entry.collection),
      ...associationRequirements.map((entry) => entry.sourceCollection),
    ].filter(Boolean)),
  );

  for (const collectionName of collectionNames) {
    if (!collectionName) continue;
    const existingCollectionDefaults = isObjectRecord(nextCollections[collectionName]) ? nextCollections[collectionName] : {};
    const existingPopups = isObjectRecord(existingCollectionDefaults.popups) ? existingCollectionDefaults.popups : {};
    const nextCollectionDefaults = {
      ...existingCollectionDefaults,
      popups: {
        ...buildFixedCollectionPopupDefaults(collectionName),
        ...existingPopups,
      },
    };
    const collectionRequirement = collectionRequirementByName.get(collectionName);
    if (collectionRequirement?.requiresFieldGroups && !Array.isArray(existingCollectionDefaults.fieldGroups)) {
      const fieldGroups = buildDefaultCollectionFieldGroups(providedCollectionMetadata, collectionName);
      if (fieldGroups) {
        nextCollectionDefaults.fieldGroups = fieldGroups;
      }
    }
    nextCollections[collectionName] = nextCollectionDefaults;
  }

  for (const associationRequirement of associationRequirements) {
    const sourceCollection = associationRequirement.sourceCollection;
    const associationField = associationRequirement.associationField;
    if (!sourceCollection || !associationField) continue;
    const existingCollectionDefaults = isObjectRecord(nextCollections[sourceCollection]) ? nextCollections[sourceCollection] : {};
    const existingPopups = isObjectRecord(existingCollectionDefaults.popups) ? existingCollectionDefaults.popups : {};
    const existingAssociations = isObjectRecord(existingPopups.associations) ? existingPopups.associations : {};
    const existingAssociationDefaults = isObjectRecord(existingAssociations[associationField])
      ? existingAssociations[associationField]
      : {};
    nextCollections[sourceCollection] = {
      ...existingCollectionDefaults,
      popups: {
        ...existingPopups,
        associations: {
          ...existingAssociations,
          [associationField]: {
            ...buildFixedCollectionPopupDefaults(associationRequirement.targetCollection || associationField),
            ...existingAssociationDefaults,
          },
        },
      },
    };
  }

  nextBlueprint.defaults = {
    ...existingDefaults,
    collections: nextCollections,
  };

  return prepareApplyBlueprintRequest(nextBlueprint, {
    collectionMetadata: providedCollectionMetadata,
    ...prepareOptions,
  });
}

function buildFieldNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

function buildFourBlockPopupBlocks() {
  return [
    {
      key: 'profile',
      type: 'details',
      title: 'Profile',
      collection: 'users',
      fields: ['nickname'],
    },
    {
      key: 'contact',
      type: 'details',
      title: 'Contact',
      collection: 'users',
      fields: ['email'],
    },
    {
      key: 'roles',
      type: 'table',
      title: 'Roles',
      collection: 'roles',
      fields: ['name'],
      actions: [defaultFilterAction(['name', 'title', 'scope'])],
    },
    {
      key: 'activity',
      type: 'table',
      title: 'Activity',
      collection: 'users',
      fields: ['status'],
      actions: [defaultFilterAction(['nickname', 'email', 'status'])],
    },
  ];
}

function buildFourBlockPopupLayout() {
  return {
    rows: [
      [{ key: 'profile', span: 12 }, { key: 'contact', span: 12 }],
      ['roles'],
      ['activity'],
    ],
  };
}

function buildPopupModeBlueprint(popup) {
  return {
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
            title: 'Users table',
            collection: 'users',
            fields: ['nickname', 'email'],
            actions: [defaultFilterAction(['nickname', 'email', 'status'])],
            recordActions: [
              {
                type: 'view',
                title: 'View',
                popup,
              },
            ],
          },
        ],
      },
    ],
  };
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

test('renderPageBlueprintAsciiPreview shows popup.tryTemplate auto-selection intent when no explicit template is bound', () => {
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
                  tryTemplate: true,
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /Template: auto-select \[tryTemplate=true\]/);
  assert.doesNotMatch(result.ascii, /Default popup content/);
});

test('renderPageBlueprintAsciiPreview shows popup.saveAsTemplate intent for explicit local popup content', () => {
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
                  blocks: [
                    {
                      key: 'employeePopupDetails',
                      type: 'details',
                      collection: 'employees',
                      fields: ['nickname'],
                    },
                  ],
                  saveAsTemplate: {
                    name: 'employee-popup-template',
                    description: 'Save this popup as a reusable template.',
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
  assert.match(result.ascii, /Template: save as "employee-popup-template" \[description provided\]/);
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
              actions: [defaultFilterAction(['nickname', 'email', 'status'])],
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

test('page preview cli returns a stable JSON error when --input is missing its value', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const exitCode = await runPagePreviewCli(['--input'], {
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
      command:
        'Render one page blueprint ASCII preview or prepare one local applyBlueprint payload result that includes sendable cliBody. Required: --stdin-json or --input <path>. Optional: --prepare-write --expected-outer-tabs <n> --max-popup-depth <n>.',
    },
  });
});

test('prepareApplyBlueprintRequest unwraps outer requestBody and returns normalized cli body', () => {
  const result = prepareApplyBlueprintRequest({
    requestBody: {
      version: '1',
      mode: 'create',
      navigation: {
        group: { title: 'Workspace', icon: 'AppstoreOutlined' },
        item: { title: 'Employees', icon: 'TeamOutlined' },
      },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
            },
          },
        },
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
              actions: [defaultFilterAction(['nickname', 'email', 'status'])],
            },
          ],
        },
      ],
    },
    collectionMetadata,
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /^PAGE: Employees \(create\)/m);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
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
      group: { title: 'Workspace', icon: 'AppstoreOutlined' },
      item: { title: 'Employees', icon: 'TeamOutlined' },
    },
    defaults: {
      collections: {
        users: {
          popups: {
            view: { name: 'User details', description: 'View one user record.' },
            addNew: { name: 'Create user', description: 'Create one user record.' },
            edit: { name: 'Edit user', description: 'Edit one user record.' },
          },
        },
      },
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
            actions: [defaultFilterAction(['nickname', 'email', 'status'])],
          },
        ],
      },
    ],
  });
});

test('prepareApplyBlueprintRequest keeps data-surface filter settings optional', () => {
  const missing = rawPrepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            type: 'table',
            title: 'Users table',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });
  assert.equal(missing.ok, true);

  const shorthand = rawPrepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            type: 'list',
            title: 'Users list',
            collection: 'users',
            fields: ['nickname'],
            actions: ['filter'],
          },
        ],
      },
    ],
  });
  assert.equal(shorthand.ok, true);

  const objectWithoutSettings = rawPrepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            type: 'gridCard',
            title: 'Users grid',
            collection: 'users',
            fields: ['nickname'],
            actions: [{ type: 'filter' }],
          },
        ],
      },
    ],
  });
  assert.equal(objectWithoutSettings.ok, true);

  const incomplete = rawPrepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            type: 'gridCard',
            title: 'Users grid',
            collection: 'users',
            fields: ['nickname'],
            actions: [
              {
                type: 'filter',
                settings: {
                  filterableFieldNames: ['nickname', 'email'],
                  defaultFilter: {
                    logic: '$and',
                    items: [{ path: 'nickname', operator: '$includes', value: '' }],
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-items-incomplete'));

  const invalidSettingsShape = rawPrepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            type: 'table',
            title: 'Users table',
            collection: 'users',
            fields: ['nickname'],
            actions: [{ type: 'filter', settings: 'invalid' }],
          },
        ],
      },
    ],
  });
  assert.equal(invalidSettingsShape.ok, false);
  assert.ok(invalidSettingsShape.errors.some((issue) => issue.ruleId === 'data-surface-filter-settings-invalid'));
});

test('prepareApplyBlueprintRequest accepts default filter settings and validates metadata fields', () => {
  const valid = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              type: 'table',
              title: 'Users table',
              collection: 'users',
              fields: ['nickname'],
              actions: [defaultFilterAction(['nickname', 'email', 'status'])],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(valid.ok, true);

  const unknown = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              type: 'table',
              title: 'Users table',
              collection: 'users',
              fields: ['nickname'],
              actions: [defaultFilterAction(['nickname', 'missingField'])],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-unknown-field'));
});

test('prepareApplyBlueprintRequest accepts collection defaults and summarizes them', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            fieldGroups: [
              {
                key: 'basic',
                title: 'Basic info',
                fields: ['username', 'nickname', 'email', 'phone', 'status', 'bio'],
              },
              {
                key: 'assignments',
                title: 'Assignments',
                fields: ['department.title', 'role.name', 'manager.nickname', 'owner.nickname', 'createdBy.nickname'],
              },
            ],
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
              associations: {
                roles: {
                  view: { name: 'User role details', description: 'View one related user role.' },
                  addNew: { name: 'Add user role', description: 'Create one related user role.' },
                  edit: { name: 'Edit user role', description: 'Edit one related user role.' },
                },
              },
            },
          },
          roles: {
            fieldGroups: [
              {
                key: 'basic',
                title: 'Basic info',
                fields: ['name', 'title', 'description', 'scope', 'priority', 'status', 'category', 'color', 'code', 'sort', 'createdAt'],
              },
            ],
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: ['username'],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.match(result.ascii, /^DEFAULTS: users\(fieldGroups,popups\), roles\(fieldGroups\)$/m);
  assert.equal(result.cliBody.defaults.collections.users.popups.associations.roles.edit.name, 'Edit user role');
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
  assert.deepEqual(result.warnings, []);
});

test('prepareApplyBlueprintRequest rejects collection default fieldGroups when they cover ten or fewer fields', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    defaults: {
      collections: {
        users: {
          fieldGroups: [
            {
              key: 'basic',
              title: 'Basic info',
              fields: ['username', 'nickname', 'email', 'phone', 'status'],
            },
          ],
          popups: {
            view: { name: 'User details', description: 'View one user record.' },
          },
        },
      },
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            fields: ['username'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'default-field-groups-only-for-large-generated-popups'
        && issue.path === 'defaults.collections.users.fieldGroups',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects invalid collection defaults shapes', () => {
  const buildBlueprint = (defaults) => ({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    defaults,
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            fields: ['username'],
          },
        ],
      },
    ],
  });

  const cases = [
    {
      label: 'defaults.blocks',
      defaults: { blocks: [] },
      ruleId: 'unsupported-defaults-key',
      path: 'defaults.blocks',
    },
    {
      label: 'popups.view.blocks',
      defaults: {
        collections: {
          users: {
            popups: {
              view: {
                name: 'User details',
                blocks: [],
              },
            },
          },
        },
      },
      ruleId: 'unsupported-default-popup-key',
      path: 'defaults.collections.users.popups.view.blocks',
    },
    {
      label: 'popups.associations.roles.view.fieldGroups',
      defaults: {
        collections: {
          users: {
            popups: {
              associations: {
                roles: {
                  view: {
                    name: 'User role details',
                    fieldGroups: [],
                  },
                },
              },
            },
          },
        },
      },
      ruleId: 'unsupported-default-popup-key',
      path: 'defaults.collections.users.popups.associations.roles.view.fieldGroups',
    },
    {
      label: 'popups.relations',
      defaults: {
        collections: {
          users: {
            popups: {
              relations: {
                roles: {
                  view: { name: 'User role details' },
                },
              },
            },
          },
        },
      },
      ruleId: 'unsupported-default-popup-action-key',
      path: 'defaults.collections.users.popups.relations',
    },
  ];

  for (const item of cases) {
    const result = prepareApplyBlueprintRequest(buildBlueprint(item.defaults));
    assert.equal(result.ok, false, item.label);
    assert.ok(
      result.errors.some((issue) => issue.ruleId === item.ruleId && issue.path === item.path),
      `${item.label} should fail with ${item.ruleId} at ${item.path}`,
    );
  }
});

test('prepareApplyBlueprintRequest requires description on defaults popup values', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    defaults: {
      collections: {
        users: {
          popups: {
            view: { name: 'User details' },
          },
        },
      },
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
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'default-popup-description-required' && issue.path === 'defaults.collections.users.popups.view.description',
    ),
  );
});

test('prepareApplyBlueprintRequest marks defaults completeness as skipped when current-record field popups need collectionMetadata', () => {
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
            fields: [
              {
                field: 'nickname',
                popup: {
                  title: 'User details',
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.defaultsRequirements, {
    skipped: true,
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
  assert.notEqual(result.cliBody, undefined);
});

test('prepareApplyBlueprintRequest marks defaults completeness as skipped when table defaults completeness is needed but collectionMetadata is missing', () => {
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
            fields: ['nickname'],
            recordActions: ['view'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.defaultsRequirements, {
    skipped: true,
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
  assert.notEqual(result.cliBody, undefined);
});

test('prepareApplyBlueprintRequest treats empty collectionMetadata like missing metadata and skips defaults completeness', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
            },
          },
        },
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
              recordActions: ['view'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: emptyPrepareCollectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.notEqual(result.cliBody, undefined);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.defaultsRequirements, {
    skipped: true,
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
});

test('prepareApplyBlueprintRequest skips defaults completeness without inventing association targets when collectionMetadata is missing', () => {
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
            fields: ['nickname'],
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'Roles',
                  blocks: [
                    {
                      key: 'userRoles',
                      type: 'table',
                      title: 'Roles table',
                      resource: {
                        binding: 'associatedRecords',
                        associationField: 'roles',
                      },
                      fields: ['name'],
                      recordActions: ['view'],
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
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.defaultsRequirements, {
    skipped: true,
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
  assert.notEqual(result.cliBody, undefined);
});

test('prepareApplyBlueprintRequest validates current-record field popup defaults completeness against collectionMetadata', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details' },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: [
                {
                  field: 'nickname',
                  popup: {
                    title: 'User details',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-popup-description' && issue.path === 'defaults.collections.users.popups.view.description',
    ),
  );
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-popup' && issue.path === 'defaults.collections.users.popups.addNew',
    ),
  );
});

test('prepareApplyBlueprintRequest validates defaults completeness against collectionMetadata', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
              associations: {
                roles: {
                  view: { name: 'Role details', description: 'View one related role.' },
                },
              },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersTable',
              type: 'table',
              collection: 'users',
              fields: [
                'nickname',
                {
                  field: 'roles.name',
                  popup: {
                    title: 'Role details',
                  },
                },
              ],
              recordActions: ['view', 'edit'],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'roles',
        popupActions: [],
        requiresFieldGroups: true,
        fieldGroupActions: ['addNew', 'edit', 'view'],
      },
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [
      {
        sourceCollection: 'users',
        associationField: 'roles',
        targetCollection: 'roles',
        popupActions: ['addNew', 'edit', 'view'],
      },
    ],
  });
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-collection' && issue.path === 'defaults.collections.roles',
    ),
  );
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-popup' && issue.path === 'defaults.collections.users.popups.addNew',
    ),
  );
});

test('prepareApplyBlueprintRequest reports each missing default collection path only once when direct and association scopes overlap', () => {
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
              key: 'usersDetails',
              type: 'details',
              collection: 'users',
              fields: ['roles.name'],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(
    result.errors.filter(
      (issue) => issue.ruleId === 'missing-default-collection' && issue.path === 'defaults.collections.users',
    ).length,
    1,
  );
});

test('prepareApplyBlueprintRequest surfaces users fieldGroups defaults errors once collectionMetadata is supplied', () => {
  const largeUsersCollectionMetadata = {
    collections: {
      users: {
        titleField: 'nickname',
        filterTargetKey: 'id',
        fields: [
          { name: 'nickname', type: 'string', interface: 'input' },
          { name: 'email', type: 'string', interface: 'input' },
          { name: 'phone', type: 'string', interface: 'input' },
          { name: 'status', type: 'string', interface: 'select' },
          { name: 'bio', type: 'text', interface: 'textarea' },
          { name: 'employeeCode', type: 'string', interface: 'input' },
          { name: 'realName', type: 'string', interface: 'input' },
          { name: 'city', type: 'string', interface: 'input' },
          { name: 'country', type: 'string', interface: 'input' },
          { name: 'postalCode', type: 'string', interface: 'input' },
          { name: 'timezone', type: 'string', interface: 'input' },
        ],
      },
    },
  };

  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
            },
          },
        },
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
              actions: [defaultFilterAction(['nickname', 'email', 'status'])],
            },
          ],
        },
      ],
    },
    { collectionMetadata: largeUsersCollectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: true,
        fieldGroupActions: ['addNew', 'edit', 'view'],
      },
    ],
    associations: [],
  });
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-field-groups' && issue.path === 'defaults.collections.users.fieldGroups',
    ),
  );
});

test('prepareApplyBlueprintRequest reports missing popup values for the fixed defaults trio', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              edit: { name: 'Edit user' },
            },
          },
        },
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
              recordActions: ['view', 'edit'],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-popup-description' && issue.path === 'defaults.collections.users.popups.edit.description',
    ),
  );
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-popup' && issue.path === 'defaults.collections.users.popups.addNew',
    ),
  );
});

test('prepareApplyBlueprintRequest keeps fixed association defaults when popup.blocks is explicit and still recurses nested popup blocks', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersDetails',
              type: 'details',
              collection: 'users',
              fields: [
                {
                  field: 'nickname',
                  popup: {
                    title: 'User details',
                    blocks: [
                      {
                        key: 'nestedUserDetails',
                        type: 'details',
                        collection: 'users',
                        fields: [
                          'nickname',
                          {
                            field: 'department.title',
                            popup: {
                              title: 'Department details',
                            },
                          },
                        ],
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
    { collectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [
      {
        sourceCollection: 'users',
        associationField: 'department',
        targetCollection: 'departments',
        popupActions: ['addNew', 'edit', 'view'],
      },
    ],
  });
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'missing-default-association-popup'
        && issue.path === 'defaults.collections.users.popups.associations.department.addNew',
    ),
  );
  assert.equal(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-collection' && issue.path === 'defaults.collections.departments',
    ),
    false,
  );
});

test('prepareApplyBlueprintRequest does not upgrade relation popup child blocks without collection into direct collection defaults', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
              associations: {
                department: {
                  view: { name: 'Department details', description: 'View one related department.' },
                  addNew: { name: 'Create department', description: 'Create one related department.' },
                  edit: { name: 'Edit department', description: 'Edit one related department.' },
                },
              },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersDetails',
              type: 'details',
              collection: 'users',
              fields: [
                {
                  field: 'department.title',
                  popup: {
                    title: 'Department details',
                    blocks: [
                      {
                        key: 'departmentNote',
                        type: 'markdown',
                        content: 'Department note',
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
    { collectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [
      {
        sourceCollection: 'users',
        associationField: 'department',
        targetCollection: 'departments',
        popupActions: ['addNew', 'edit', 'view'],
      },
    ],
  });
});

test('prepareApplyBlueprintRequest normalizes deep associatedRecords defaults keys to the first relation segment', () => {
  const deepAssociationCollectionMetadata = {
    collections: {
      ...collectionMetadata.collections,
      departments: {
        ...collectionMetadata.collections.departments,
        fields: [
          ...collectionMetadata.collections.departments.fields,
          { name: 'manager', type: 'belongsTo', interface: 'm2o', target: 'users' },
        ],
      },
    },
  };

  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
              associations: {
                'department.manager': {
                  view: { name: 'Department manager details', description: 'View one related department manager.' },
                  addNew: { name: 'Create department manager', description: 'Create one related department manager.' },
                  edit: { name: 'Edit department manager', description: 'Edit one related department manager.' },
                },
              },
            },
          },
        },
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
              recordActions: [
                {
                  type: 'view',
                  popup: {
                    title: 'Department manager users',
                    blocks: [
                      {
                        key: 'managerUsers',
                        type: 'table',
                        resource: {
                          binding: 'associatedRecords',
                          associationField: 'department.manager',
                        },
                        fields: ['nickname'],
                        recordActions: ['view'],
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
    { collectionMetadata: deepAssociationCollectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [
      {
        sourceCollection: 'users',
        associationField: 'department',
        targetCollection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
      },
    ],
  });
  assert.equal(
    result.cliBody.defaults.collections.users.popups.associations.department.view.name,
    'Department manager details',
  );
  assert.equal(
    Object.hasOwn(result.cliBody.defaults.collections.users.popups.associations, 'department.manager'),
    false,
  );
});

test('prepareApplyBlueprintRequest keeps the canonical first-segment association defaults when deep aliases also exist', () => {
  const deepAssociationCollectionMetadata = {
    collections: {
      ...collectionMetadata.collections,
      departments: {
        ...collectionMetadata.collections.departments,
        fields: [
          ...collectionMetadata.collections.departments.fields,
          { name: 'manager', type: 'belongsTo', interface: 'm2o', target: 'users' },
        ],
      },
    },
  };

  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
              associations: {
                'department.manager': {
                  view: { name: 'Alias manager details', description: 'View one related alias manager.' },
                  addNew: { name: 'Alias create manager', description: 'Create one related alias manager.' },
                  edit: { name: 'Alias edit manager', description: 'Edit one related alias manager.' },
                },
                department: {
                  view: { name: 'Canonical department details', description: 'View one related canonical department.' },
                  addNew: { name: 'Canonical create department', description: 'Create one related canonical department.' },
                  edit: { name: 'Canonical edit department', description: 'Edit one related canonical department.' },
                },
              },
            },
          },
        },
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
              recordActions: [
                {
                  type: 'view',
                  popup: {
                    title: 'Department manager users',
                    blocks: [
                      {
                        key: 'managerUsers',
                        type: 'table',
                        resource: {
                          binding: 'associatedRecords',
                          associationField: 'department.manager',
                        },
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
    },
    { collectionMetadata: deepAssociationCollectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.cliBody.defaults.collections.users.popups.associations.department.view.name,
    'Canonical department details',
  );
  assert.equal(
    result.cliBody.defaults.collections.users.popups.associations.department.addNew.name,
    'Canonical create department',
  );
  assert.equal(
    Object.hasOwn(result.cliBody.defaults.collections.users.popups.associations, 'department.manager'),
    false,
  );
});

test('prepareApplyBlueprintRequest does not invent self-associations when nested popup blocks contain associatedRecords tables', () => {
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
              fields: [
                {
                  field: 'roles',
                  popup: {
                    title: 'Roles popup',
                    blocks: [
                      {
                        key: 'rolesTable',
                        type: 'table',
                        collection: 'roles',
                        resource: {
                          binding: 'associatedRecords',
                          associationField: 'roles',
                        },
                        fields: ['name'],
                        recordActions: ['view'],
                      },
                    ],
                  },
                },
              ],
              recordActions: ['view'],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'roles',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: true,
        fieldGroupActions: ['addNew', 'edit', 'view'],
      },
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [
      {
        sourceCollection: 'users',
        associationField: 'roles',
        targetCollection: 'roles',
        popupActions: ['addNew', 'edit', 'view'],
      },
    ],
  });
});

test('prepareApplyBlueprintRequest keeps fixed association defaults when popup.template is explicit', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersDetails',
              type: 'details',
              collection: 'users',
              fields: [
                {
                  field: 'roles.name',
                  popup: {
                    title: 'Role details',
                    template: {
                      uid: 'role-details-template',
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
    { collectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'roles',
        popupActions: [],
        requiresFieldGroups: true,
        fieldGroupActions: ['addNew', 'edit', 'view'],
      },
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [
      {
        sourceCollection: 'users',
        associationField: 'roles',
        targetCollection: 'roles',
        popupActions: ['addNew', 'edit', 'view'],
      },
    ],
  });
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-collection' && issue.path === 'defaults.collections.roles',
    ),
  );
});

test('prepareApplyBlueprintRequest keeps fixed association defaults when popup.tryTemplate is explicit', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'usersDetails',
              type: 'details',
              collection: 'users',
              fields: [
                {
                  field: 'roles.name',
                  popup: {
                    title: 'Role details',
                    tryTemplate: true,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'roles',
        popupActions: [],
        requiresFieldGroups: true,
        fieldGroupActions: ['addNew', 'edit', 'view'],
      },
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [
      {
        sourceCollection: 'users',
        associationField: 'roles',
        targetCollection: 'roles',
        popupActions: ['addNew', 'edit', 'view'],
      },
    ],
  });
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-collection' && issue.path === 'defaults.collections.roles',
    ),
  );
});

test('prepareApplyBlueprintRequest does not require fieldGroups for small table collections without explicit addNew', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
            },
          },
        },
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
              actions: [defaultFilterAction(['nickname', 'email', 'status'])],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
});

test('prepareApplyBlueprintRequest requires fieldGroups for large table collections without explicit addNew', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Roles' },
      defaults: {
        collections: {
          roles: {
            popups: {
              view: { name: 'Role details', description: 'View one role record.' },
              addNew: { name: 'Create role', description: 'Create one role record.' },
              edit: { name: 'Edit role', description: 'Edit one role record.' },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'rolesTable',
              type: 'table',
              collection: 'roles',
              fields: ['name'],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'roles',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: true,
        fieldGroupActions: ['addNew', 'edit', 'view'],
      },
    ],
    associations: [],
  });
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-field-groups' && issue.path === 'defaults.collections.roles.fieldGroups',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects dotted collection default fieldGroups paths', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Roles' },
      defaults: {
        collections: {
          roles: {
            fieldGroups: [
              {
                key: 'basic',
                title: 'Basic info',
                fields: ['id', 'name', 'name.title', 'title', 'description', 'scope', 'priority', 'status', 'category', 'color', 'code', 'sort', 'notes'],
              },
            ],
            popups: {
              view: { name: 'Role details', description: 'View one role record.' },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'rolesTable',
              type: 'table',
              collection: 'roles',
              fields: ['name'],
              recordActions: ['view'],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'default-field-group-unknown-field'
        && issue.path === 'defaults.collections.roles.fieldGroups[0].fields[2]',
    ),
  );
});

test('prepareApplyBlueprintRequest returns normalized templateDecision when provided through options', () => {
  const result = prepareWithDirectCollectionDefaults(
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
              title: 'Employees table',
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
      collections: ['users'],
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
              title: 'Employees table',
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
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          layout: {
            rows: [[{ key: 'profileForm', span: 12 }, { key: 'usersTable', span: 12 }]],
          },
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
              title: 'Employees table',
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
      collections: ['users'],
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
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          layout: {
            rows: [[{ key: 'profileForm', span: 12 }, { key: 'usersTable', span: 12 }]],
          },
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
              title: 'Employees table',
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
      collections: ['users'],
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
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          layout: {
            rows: [[{ key: 'profileForm', span: 12 }, { key: 'usersTable', span: 12 }]],
          },
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
              title: 'Employees table',
              collection: 'users',
              fields: ['nickname', 'email'],
            },
          ],
        },
      ],
    },
    {
      collections: ['users'],
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
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          layout: {
            rows: [[{ key: 'profileForm', span: 12 }, { key: 'usersTable', span: 12 }]],
          },
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
              title: 'Employees table',
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
      collections: ['users'],
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
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Employees' },
      tabs: [
        {
          title: 'Overview',
          layout: {
            rows: [[{ key: 'profileForm', span: 12 }, { key: 'usersTable', span: 12 }]],
          },
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
              title: 'Employees table',
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
      collections: ['users'],
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

test('prepareApplyBlueprintRequest requires icons for newly created menu group and item writes', () => {
  const result = prepareApplyBlueprintRequest({
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
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'missing-menu-group-icon'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'missing-menu-item-icon'));
});

test('prepareApplyBlueprintRequest rejects menu icons that are not valid Ant Design icon names', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    navigation: {
      group: { title: 'Workspace', icon: 'NotARealIconOutlined' },
      item: { title: 'Employees', icon: 'StillFakeOutlined' },
    },
    page: {
      title: 'Employees',
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'invalid-menu-group-icon'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'invalid-menu-item-icon'));
});

test('prepareApplyBlueprintRequest tolerates missing item icon when attaching under one existing menu group route', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    navigation: {
      group: { routeId: 12 },
      item: { title: 'Employees' },
    },
    page: {
      title: 'Employees',
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest rejects explicit single-column multi-block layouts and missing data titles', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    navigation: {
      item: { title: 'Employees', icon: 'TeamOutlined' },
    },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['mainTable'], ['summaryDetails']],
        },
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'multi-block-data-title-required' && issue.path === 'tabs[0].blocks[0].title'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'multi-block-data-title-required' && issue.path === 'tabs[0].blocks[1].title'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'single-column-multi-block-layout'));
});

test('prepareApplyBlueprintRequest requires explicit layout when multiple non-filter blocks share one tab', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            title: 'Employee summary',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'multi-block-layout-required' && issue.path === 'tabs[0].layout'));
});

test('prepareApplyBlueprintRequest rejects explicit layout rows that reference unknown block keys', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['bogus']],
        },
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            title: 'Employee summary',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'layout-references-unknown-block' && issue.path === 'tabs[0].layout.rows[0][0]'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'layout-missing-block-placement' && issue.path === 'tabs[0].blocks[0]'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'layout-missing-block-placement' && issue.path === 'tabs[0].blocks[1]'));
});

test('prepareApplyBlueprintRequest rejects explicit layout rows that place one block more than once', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['mainTable', 'mainTable'], ['summaryDetails']],
        },
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            title: 'Employee summary',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((issue) => issue.ruleId === 'layout-duplicate-block-placement' && issue.path === 'tabs[0].layout.rows[0][1]'),
  );
});

test('prepareApplyBlueprintRequest requires block keys whenever explicit layout is provided', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['mainTable']],
        },
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            type: 'details',
            title: 'Employee summary',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'layout-block-key-required' && issue.path === 'tabs[0].blocks[1].key'));
});

test('prepareApplyBlueprintRequest rejects unsupported layout cells and requires every keyed block to be placed', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [[{ uid: 'mainTable' }]],
        },
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            title: 'Employee summary',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'layout-contains-unsupported-cell' && issue.path === 'tabs[0].layout.rows[0][0]'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'layout-missing-block-placement' && issue.path === 'tabs[0].blocks[0]'));
  assert.ok(result.errors.some((issue) => issue.ruleId === 'layout-missing-block-placement' && issue.path === 'tabs[0].blocks[1]'));
});

test('prepareApplyBlueprintRequest accepts fieldsLayout on field-grid blocks and keeps it in the normalized cli body', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'createUserForm',
            type: 'createForm',
            title: 'Create employee',
            collection: 'users',
            fields: [
              { key: 'nicknameField', field: 'nickname' },
              { key: 'statusField', field: 'status' },
              { key: 'phoneField', field: 'phone' },
            ],
            fieldsLayout: {
              rows: [['nicknameField'], [{ key: 'statusField', span: 12 }, { key: 'phoneField', span: 12 }]],
            },
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].fieldsLayout, {
    rows: [['nicknameField'], [{ key: 'statusField', span: 12 }, { key: 'phoneField', span: 12 }]],
  });
});

test('prepareApplyBlueprintRequest synthesizes compact fieldsLayout for createForm when omitted', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'createUserForm',
            type: 'createForm',
            title: 'Create employee',
            collection: 'users',
            fields: [
              { key: 'nicknameField', field: 'nickname' },
              { key: 'statusField', field: 'status' },
              { key: 'phoneField', field: 'phone' },
            ],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].fieldsLayout, {
    rows: [
      [{ key: 'nicknameField', span: 12 }, { key: 'statusField', span: 12 }],
      [{ key: 'phoneField', span: 24 }],
    ],
  });
});

test('prepareApplyBlueprintRequest synthesizes compact fieldsLayout for filterForm when omitted', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'filters',
            type: 'filterForm',
            title: 'Filters',
            collection: 'users',
            fields: ['nickname', 'email', 'phone'],
            actions: ['submit', 'reset'],
          },
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].fieldsLayout, {
    rows: [[{ key: 'nickname', span: 8 }, { key: 'email', span: 8 }, { key: 'phone', span: 8 }]],
  });
});

test('prepareApplyBlueprintRequest rejects fieldsLayout on blocks without an inner field grid', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
            fieldsLayout: {
              rows: [['nickname']],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'unsupported-fields-layout-host' && issue.path === 'tabs[0].blocks[0].fieldsLayout',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects fieldsLayout rows that place one field more than once and omit another field', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'createUserForm',
            type: 'createForm',
            title: 'Create employee',
            collection: 'users',
            fields: [
              { key: 'nicknameField', field: 'nickname' },
              { key: 'statusField', field: 'status' },
            ],
            fieldsLayout: {
              rows: [['nicknameField', 'nicknameField']],
            },
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'fields-layout-duplicate-field-placement'
        && issue.path === 'tabs[0].blocks[0].fieldsLayout.rows[0][1]',
    ),
  );
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'fields-layout-missing-field-placement' && issue.path === 'tabs[0].blocks[0].fields[1]',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects non-numeric fieldsLayout spans', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'createUserForm',
            type: 'createForm',
            title: 'Create employee',
            collection: 'users',
            fields: [
              { key: 'nicknameField', field: 'nickname' },
              { key: 'statusField', field: 'status' },
            ],
            fieldsLayout: {
              rows: [[{ key: 'nicknameField', span: '12' }, { key: 'statusField', span: 12 }]],
            },
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'fields-layout-invalid-span'
        && issue.path === 'tabs[0].blocks[0].fieldsLayout.rows[0][0].span',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects fieldsLayout without sibling fields[]', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'createUserForm',
            type: 'createForm',
            title: 'Create employee',
            collection: 'users',
            fieldsLayout: {
              rows: [['nicknameField']],
            },
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'fields-layout-requires-fields' && issue.path === 'tabs[0].blocks[0].fieldsLayout',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects empty fieldsLayout rows', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'createUserForm',
            type: 'createForm',
            title: 'Create employee',
            collection: 'users',
            fields: [
              { key: 'nicknameField', field: 'nickname' },
              { key: 'statusField', field: 'status' },
            ],
            fieldsLayout: {
              rows: [[]],
            },
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'fields-layout-invalid-row' && issue.path === 'tabs[0].blocks[0].fieldsLayout.rows[0]',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects explicit single-column fieldsLayout on multi-field grids', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'filters',
            type: 'filterForm',
            title: 'Filters',
            collection: 'users',
            fields: ['nickname', 'email', 'phone'],
            fieldsLayout: {
              rows: [['nickname'], ['email'], ['phone']],
            },
            actions: ['submit', 'reset'],
          },
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'fields-layout-single-column' && issue.path === 'tabs[0].blocks[0].fieldsLayout.rows',
    ),
  );
});

test('prepareApplyBlueprintRequest allows filter plus one business block without explicit layout', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'filters',
            type: 'filterForm',
            title: 'Filters',
            collection: 'users',
            fields: ['nickname', 'email', 'phone'],
            actions: ['submit', 'reset'],
          },
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].fieldsLayout, {
    rows: [[{ key: 'nickname', span: 8 }, { key: 'email', span: 8 }, { key: 'phone', span: 8 }]],
  });
});

test('prepareApplyBlueprintRequest requires filter blocks to occupy the first explicit layout row alone', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    navigation: {
      item: { title: 'Employees', icon: 'TeamOutlined' },
    },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['mainTable'], ['filters', 'summaryDetails']],
        },
        blocks: [
          {
            key: 'filters',
            type: 'filterForm',
            title: 'Filters',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            title: 'Employee summary',
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'filter-layout-must-lead'));
});

test('prepareApplyBlueprintRequest accepts multiple filter blocks in the first explicit layout row when each targets its own same-run table', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    navigation: {
      item: { title: 'Employees', icon: 'TeamOutlined' },
    },
    tabs: [
      {
        key: 'main',
        title: 'Overview',
        layout: {
          rows: [
            [{ key: 'usersFilter', span: 12 }, { key: 'rolesFilter', span: 12 }],
            [{ key: 'usersTable', span: 12 }, { key: 'rolesTable', span: 12 }],
            [{ key: 'usersForm', span: 12 }, { key: 'rolesForm', span: 12 }],
          ],
        },
        blocks: [
          {
            key: 'usersFilter',
            type: 'filterForm',
            title: 'Users filters',
            collection: 'users',
            fields: [
              { key: 'usernameFilter', field: 'username', target: 'usersTable' },
              { key: 'nicknameFilter', field: 'nickname', target: 'usersTable' },
            ],
            actions: ['submit', 'reset'],
          },
          {
            key: 'rolesFilter',
            type: 'filterForm',
            title: 'Roles filters',
            collection: 'roles',
            fields: [
              { key: 'titleFilter', field: 'title', target: 'rolesTable' },
              { key: 'nameFilter', field: 'name', target: 'rolesTable' },
            ],
            actions: ['submit', 'reset'],
          },
          {
            key: 'usersTable',
            type: 'table',
            title: 'Users table',
            collection: 'users',
            fields: ['username'],
          },
          {
            key: 'rolesTable',
            type: 'table',
            title: 'Roles table',
            collection: 'roles',
            fields: ['title'],
          },
          {
            key: 'usersForm',
            type: 'createForm',
            title: 'Users form',
            collection: 'users',
            fields: ['username'],
            actions: ['submit'],
          },
          {
            key: 'rolesForm',
            type: 'createForm',
            title: 'Roles form',
            collection: 'roles',
            fields: ['title'],
            actions: ['submit'],
          },
        ],
      },
    ],
  }, { collections: ['users', 'roles'] });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest requires collapse action on filter blocks with four or more fields', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'filters',
            type: 'filterForm',
            title: 'Filters',
            collection: 'users',
            fields: ['nickname', 'email', 'phone', 'department.title'],
            actions: ['submit', 'reset'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'filter-collapse-required' && issue.path === 'tabs[0].blocks[0].actions'));
});

test('renderPageBlueprintAsciiPreview shows field group summaries on large field-grid blocks', () => {
  const result = renderPageBlueprintAsciiPreview({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'userCreateForm',
            type: 'createForm',
            collection: 'users',
            fieldGroups: [
              {
                title: 'Basic info',
                fields: ['username', 'nickname', 'email', 'phone', 'status', 'bio'],
              },
              {
                title: 'Assignments',
                fields: ['department.title', 'role.name', 'manager.nickname', 'owner.nickname', 'createdBy.nickname'],
              },
            ],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /Field groups: Basic info \(6\), Assignments \(5\)/);
  assert.match(result.ascii, /Fields: username, nickname, email, phone, \+7 more/);
});

test('prepareApplyBlueprintRequest rejects large createForm blocks that skip fieldGroups', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'userCreateForm',
            type: 'createForm',
            collection: 'users',
            fields: [
              'username',
              'nickname',
              'email',
              'phone',
              'status',
              'bio',
              'department.title',
              'role.name',
              'manager.nickname',
              'owner.nickname',
              'createdBy.nickname',
            ],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'large-field-grid-requires-field-groups' && issue.path === 'tabs[0].blocks[0].fieldGroups',
    ),
  );
});

test('prepareApplyBlueprintRequest keeps flat fields valid when createForm has exactly ten real fields', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'userCreateForm',
            type: 'createForm',
            collection: 'users',
            fields: [
              'username',
              'nickname',
              'email',
              'phone',
              'status',
              'bio',
              'department.title',
              'role.name',
              'manager.nickname',
              'owner.nickname',
            ],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.cliBody.tabs[0].blocks[0].fields.length, 10);
  assert.ok(result.cliBody.tabs[0].blocks[0].fieldsLayout);
});

test('prepareApplyBlueprintRequest accepts fieldGroups on large details blocks and keeps them in cliBody', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'userDetails',
            type: 'details',
            collection: 'users',
            fieldGroups: [
              {
                title: 'Basic info',
                fields: ['username', 'nickname', 'email', 'phone', 'status', 'bio'],
              },
              {
                title: 'Assignments',
                fields: ['department.title', 'role.name', 'manager.nickname', 'owner.nickname', 'createdBy.nickname'],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.cliBody.tabs[0].blocks[0].fieldGroups.length, 2);
  assert.equal(result.cliBody.tabs[0].blocks[0].fieldGroups[0].title, 'Basic info');
  assert.equal(result.cliBody.tabs[0].blocks[0].fieldsLayout, undefined);
});

test('prepareApplyBlueprintRequest accepts fieldGroups on large editForm blocks and keeps grouped write shape', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'userEditForm',
            type: 'editForm',
            collection: 'users',
            fieldGroups: [
              {
                title: 'Basic info',
                fields: ['username', 'nickname', 'email', 'phone', 'status', 'bio'],
              },
              {
                title: 'Assignments',
                fields: ['department.title', 'role.name', 'manager.nickname', 'owner.nickname', 'createdBy.nickname'],
              },
            ],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.cliBody.tabs[0].blocks[0].fieldGroups.length, 2);
  assert.equal(result.cliBody.tabs[0].blocks[0].fieldGroups[1].title, 'Assignments');
  assert.equal(result.cliBody.tabs[0].blocks[0].fieldsLayout, undefined);
});

test('prepareApplyBlueprintRequest preserves grouped field popups in preview and cliBody', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'userDetails',
            type: 'details',
            collection: 'users',
            fieldGroups: [
              {
                title: 'Basic info',
                fields: [
                  'username',
                  {
                    field: 'manager.nickname',
                    popup: {
                      title: 'Manager details',
                      blocks: [
                        {
                          key: 'managerDetails',
                          type: 'details',
                          collection: 'users',
                          fields: ['nickname', 'email'],
                        },
                      ],
                    },
                  },
                  'email',
                  'phone',
                  'status',
                  'bio',
                ],
              },
              {
                title: 'Assignments',
                fields: ['department.title', 'role.name', 'owner.nickname', 'createdBy.nickname', 'updatedBy.nickname'],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.match(result.ascii, /Popup from field "manager\.nickname":/);
  assert.match(result.ascii, /Popup: Manager details/);
  assert.equal(result.cliBody.tabs[0].blocks[0].fieldGroups[0].fields[1].popup.title, 'Manager details');
  assert.equal(result.cliBody.tabs[0].blocks[0].fieldGroups[0].fields[1].popup.blocks[0].key, 'managerDetails');
});

test('prepareApplyBlueprintRequest does not treat manual divider fields as a valid grouping substitute', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'userEditForm',
            type: 'editForm',
            collection: 'users',
            fields: [
              { type: 'divider', title: 'Basic info' },
              'username',
              'nickname',
              'email',
              'phone',
              'status',
              'bio',
              { type: 'divider', title: 'Assignments' },
              'department.title',
              'role.name',
              'manager.nickname',
              'owner.nickname',
              'createdBy.nickname',
            ],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'large-field-grid-requires-field-groups' && issue.path === 'tabs[0].blocks[0].fieldGroups',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects fieldGroups when fieldsLayout is also present on the same block', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'userCreateForm',
            type: 'createForm',
            collection: 'users',
            fieldGroups: [
              {
                title: 'Basic info',
                fields: ['username', 'nickname', 'email', 'phone', 'status', 'bio'],
              },
              {
                title: 'Assignments',
                fields: ['department.title', 'role.name', 'manager.nickname', 'owner.nickname', 'createdBy.nickname'],
              },
            ],
            fieldsLayout: {
              rows: [['username', 'nickname']],
            },
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'field-groups-conflicts-with-fields-layout' && issue.path === 'tabs[0].blocks[0].fieldGroups',
    ),
  );
});

test('prepareApplyBlueprintRequest accepts whole-page submit guards when the form submit action has an explicit key', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    reaction: {
      items: [
        {
          type: 'setActionLinkageRules',
          target: 'main.usersCreateForm.submitAction',
          rules: [
            {
              key: 'disableSubmitUntilReady',
              when: {
                logic: '$or',
                items: [
                  {
                    path: 'formValues.username',
                    operator: '$empty',
                  },
                  {
                    path: 'formValues.email',
                    operator: '$empty',
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
            key: 'usersCreateForm',
            type: 'createForm',
            collection: 'users',
            fields: ['username', 'email'],
            actions: [
              {
                key: 'submitAction',
                type: 'submit',
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest keys string submit actions targeted by whole-page submit guards', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    reaction: {
      items: [
        {
          type: 'setActionLinkageRules',
          target: 'main.usersCreateForm.submitAction',
          rules: [
            {
              key: 'disableSubmitUntilReady',
              when: {
                logic: '$or',
                items: [
                  {
                    path: 'formValues.username',
                    operator: '$empty',
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
            key: 'usersCreateForm',
            type: 'createForm',
            collection: 'users',
            fields: ['username'],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].actions, [
    {
      key: 'submitAction',
      type: 'submit',
    },
  ]);
});

test('prepareApplyBlueprintRequest inserts missing submit actions targeted by whole-page submit guards', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    reaction: {
      items: [
        {
          type: 'setActionLinkageRules',
          target: 'main.usersCreateForm.submitAction',
          rules: [
            {
              key: 'disableSubmitUntilReady',
              when: {
                logic: '$or',
                items: [
                  {
                    path: 'formValues.username',
                    operator: '$empty',
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
            key: 'usersCreateForm',
            type: 'createForm',
            collection: 'users',
            fields: ['username'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].actions, [
    {
      key: 'submitAction',
      type: 'submit',
    },
  ]);
});

test('prepareApplyBlueprintRequest still rejects unknown custom action targets on form guards', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    reaction: {
      items: [
        {
          type: 'setActionLinkageRules',
          target: 'main.usersCreateForm.customSubmitAction',
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
            key: 'usersCreateForm',
            type: 'createForm',
            collection: 'users',
            fields: ['username'],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'unknown-reaction-target'));
});

test('prepareApplyBlueprintRequest does not rewrite explicitly keyed submit actions for submitAction guards', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    reaction: {
      items: [
        {
          type: 'setActionLinkageRules',
          target: 'main.usersCreateForm.submitAction',
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
            key: 'usersCreateForm',
            type: 'createForm',
            collection: 'users',
            fields: ['username'],
            actions: [
              {
                key: 'saveAction',
                type: 'submit',
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'unknown-reaction-target'));
});

test('prepareApplyBlueprintRequest normalizes field-state shorthand and adds referenced form fields', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    reaction: {
      items: [
        {
          type: 'setFieldLinkageRules',
          target: 'main.usersCreateForm',
          rules: [
            {
              key: 'requirePrivilegedContact',
              when: {
                logic: '$or',
                items: [
                  {
                    path: 'formValues.roles.name',
                    operator: '$includes',
                    value: 'admin',
                  },
                ],
              },
              then: [
                {
                  type: 'setFieldState',
                  targetPath: 'phone',
                  state: { required: true },
                },
                {
                  key: 'showPassword',
                  type: 'setFieldState',
                  targetPath: 'password',
                  state: { visible: true, required: true },
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
            key: 'usersCreateForm',
            type: 'createForm',
            collection: 'users',
            fields: ['username', 'roles'],
            actions: [
              {
                key: 'submitAction',
                type: 'submit',
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].fields, ['username', 'roles', 'phone', 'password']);
  assert.deepEqual(result.cliBody.reaction.items[0].rules[0].then, [
    {
      type: 'setFieldState',
      fieldPaths: ['phone'],
      state: 'required',
    },
    {
      key: 'showPassword-visible',
      type: 'setFieldState',
      fieldPaths: ['password'],
      state: 'visible',
    },
    {
      key: 'showPassword-required',
      type: 'setFieldState',
      fieldPaths: ['password'],
      state: 'required',
    },
  ]);
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

test('prepareApplyBlueprintRequest requires explicit layout when multiple non-filter blocks share one popup', () => {
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
            title: 'Users table',
            collection: 'users',
            fields: ['nickname', 'email'],
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'User details',
                  blocks: [
                    {
                      key: 'userDetails',
                      type: 'details',
                      title: 'User profile',
                      collection: 'users',
                      fields: ['nickname'],
                    },
                    {
                      key: 'userRoles',
                      type: 'table',
                      title: 'Roles',
                      resource: {
                        binding: 'associatedRecords',
                        associationField: 'roles',
                        collectionName: 'roles',
                      },
                      fields: ['title'],
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
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'multi-block-layout-required' && issue.path === 'tabs[0].blocks[0].recordActions[0].popup.layout',
    ),
  );
});

test('prepareApplyBlueprintRequest accepts popup.tryTemplate and keeps it in the normalized cli body', () => {
  const result = prepareWithDirectCollectionDefaults({
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
            fields: [
              {
                field: 'department.title',
                popup: {
                  title: 'Department details',
                  tryTemplate: true,
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.match(result.ascii, /Template: auto-select \[tryTemplate=true\]/);
  assert.equal(result.cliBody.tabs[0].blocks[0].fields[0].popup.tryTemplate, true);
});

test('prepareApplyBlueprintRequest defaults inline create-time popups to popup.tryTemplate=true when no explicit template decision is present', () => {
  const result = prepareWithDirectCollectionDefaults({
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
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'User details',
                  blocks: [
                    {
                      key: 'userPopupDetails',
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

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.match(result.ascii, /Template: auto-select \[tryTemplate=true\]/);
  assert.match(result.ascii, /Template: save as "User details popup template" \[description provided\]/);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.tryTemplate, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.blocks[0].key, 'userPopupDetails');
  assert.equal(
    result.cliBody.tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate.name,
    'User details popup template',
  );
  assert.match(
    result.cliBody.tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate.description,
    /Reusable popup template for record action "view" on users/i,
  );
});

test('prepareApplyBlueprintRequest defaults first-layer popups with more than three direct blocks to page mode', () => {
  const result = prepareApplyBlueprintRequest(
    buildPopupModeBlueprint({
      title: 'User details',
      blocks: buildFourBlockPopupBlocks(),
      layout: buildFourBlockPopupLayout(),
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, 'page');
  assert.match(result.ascii, /Popup: User details[\s\S]*Mode: page/);
});

test('prepareApplyBlueprintRequest defaults first-layer popups with more than twenty direct effective fields to page mode', () => {
  const result = prepareApplyBlueprintRequest(
    buildPopupModeBlueprint({
      title: 'User data explorer',
      blocks: [
        {
          key: 'userDataExplorer',
          type: 'table',
          title: 'User data explorer',
          collection: 'users',
          fields: buildFieldNames('field_', 21),
        },
      ],
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, 'page');
  assert.match(result.ascii, /Popup: User data explorer[\s\S]*Mode: page/);
});

test('prepareApplyBlueprintRequest keeps popup mode unset at the auto-page thresholds', () => {
  const exactBlockThreshold = prepareApplyBlueprintRequest(
    buildPopupModeBlueprint({
      title: 'User details',
      blocks: buildFourBlockPopupBlocks().slice(0, 3),
      layout: {
        rows: [
          [{ key: 'profile', span: 12 }, { key: 'contact', span: 12 }],
          ['roles'],
        ],
      },
    }),
  );
  assert.equal(exactBlockThreshold.ok, true);
  assert.equal(exactBlockThreshold.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);

  const exactFieldThreshold = prepareApplyBlueprintRequest(
    buildPopupModeBlueprint({
      title: 'User data explorer',
      blocks: [
        {
          key: 'userDataExplorer',
          type: 'table',
          title: 'User data explorer',
          collection: 'users',
          fields: buildFieldNames('field_', 20),
        },
      ],
    }),
  );
  assert.equal(exactFieldThreshold.ok, true);
  assert.equal(exactFieldThreshold.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);
});

test('prepareApplyBlueprintRequest does not auto-upgrade nested popups to page mode', () => {
  const result = prepareApplyBlueprintRequest(
    buildPopupModeBlueprint({
      title: 'User details',
      blocks: [
        {
          key: 'userDetails',
          type: 'details',
          title: 'User profile',
          collection: 'users',
          fields: [
            'nickname',
            {
              field: 'email',
              popup: {
                title: 'Email details',
                blocks: buildFourBlockPopupBlocks(),
                layout: buildFourBlockPopupLayout(),
              },
            },
          ],
        },
      ],
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);
  assert.equal(
    result.cliBody.tabs[0].blocks[0].recordActions[0].popup.blocks[0].fields[1].popup.mode,
    undefined,
  );
});

test('prepareApplyBlueprintRequest preserves explicit popup modes on complex first-layer popups', () => {
  for (const explicitMode of ['drawer', 'dialog', 'page']) {
    const result = prepareApplyBlueprintRequest(
      buildPopupModeBlueprint({
        title: `User details ${explicitMode}`,
        mode: explicitMode,
        blocks: buildFourBlockPopupBlocks(),
        layout: buildFourBlockPopupLayout(),
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, explicitMode);
  }
});

test('prepareApplyBlueprintRequest does not auto-add page mode when a popup template is already bound', () => {
  const result = prepareApplyBlueprintRequest(
    buildPopupModeBlueprint({
      title: 'User details',
      template: {
        uid: 'user-details-template',
        mode: 'reference',
      },
      blocks: buildFourBlockPopupBlocks(),
      layout: buildFourBlockPopupLayout(),
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);
  assert.deepEqual(result.warnings, ['Popup "User details" will ignore local popup keys: blocks, layout.']);
});

test('prepareApplyBlueprintRequest preserves an explicit popup.tryTemplate=false override on create-time inline popups', () => {
  const result = prepareWithDirectCollectionDefaults({
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
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'User details',
                  tryTemplate: false,
                  blocks: [
                    {
                      key: 'userPopupDetails',
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

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.doesNotMatch(result.ascii, /Template: auto-select \[tryTemplate=true\]/);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.tryTemplate, false);
  assert.equal(
    result.cliBody.tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate.name,
    'User details popup template',
  );
});

test('prepareApplyBlueprintRequest accepts popup.saveAsTemplate and keeps it in the normalized cli body', () => {
  const result = prepareWithDirectCollectionDefaults({
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
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'User details',
                  blocks: [
                    {
                      key: 'userPopupDetails',
                      type: 'details',
                      collection: 'users',
                      fields: ['nickname'],
                    },
                  ],
                  saveAsTemplate: {
                    name: 'user-popup-template',
                    description: 'Save this popup as a reusable template.',
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
  assert.equal(result.errors.length, 0);
  assert.match(result.ascii, /Template: auto-select \[tryTemplate=true\]/);
  assert.match(result.ascii, /Template: save as "user-popup-template" \[description provided\]/);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.tryTemplate, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate.name, 'user-popup-template');
  assert.equal(
    result.cliBody.tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate.description,
    'Save this popup as a reusable template.',
  );
});

test('prepareApplyBlueprintRequest auto-generates popup.saveAsTemplate metadata for Chinese explicit local popups', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: '用户页' },
    tabs: [
      {
        title: '概览',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            recordActions: [
              {
                title: '详情',
                type: 'view',
                popup: {
                  title: '用户详情',
                  blocks: [
                    {
                      key: 'userPopupDetails',
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

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.tryTemplate, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate.name, '用户详情弹窗模板');
  assert.match(
    result.cliBody.tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate.description,
    /复用弹窗模板。宿主：users；触发器：记录操作“详情”；内容：/u,
  );
});

test('prepareApplyBlueprintRequest rejects non-boolean popup.tryTemplate values', () => {
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
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'User details',
                  tryTemplate: 'yes',
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'invalid-popup-try-template' &&
        issue.path === 'tabs[0].blocks[0].recordActions[0].popup.tryTemplate',
    ),
  );
});

test('prepareApplyBlueprintRequest rejects invalid popup.saveAsTemplate payloads and conflicts', () => {
  const invalidShape = prepareWithDirectCollectionDefaults({
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
            recordActions: [
              {
                type: 'view',
                popup: {
                  blocks: [
                    {
                      key: 'userPopupDetails',
                      type: 'details',
                      collection: 'users',
                      fields: ['nickname'],
                    },
                  ],
                  saveAsTemplate: 'bad',
                },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(invalidShape.ok, false);
  assert.ok(
    invalidShape.errors.some(
      (issue) =>
        issue.ruleId === 'invalid-popup-save-as-template' &&
        issue.path === 'tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate',
    ),
  );

  const missingBlocks = prepareWithDirectCollectionDefaults({
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
            recordActions: [
              {
                type: 'view',
                popup: {
                  tryTemplate: false,
                  saveAsTemplate: {
                    name: 'user-popup-template',
                    description: 'Save this popup as a reusable template.',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(missingBlocks.ok, false);
  assert.ok(
    missingBlocks.errors.some(
      (issue) =>
        issue.ruleId === 'popup-save-as-template-missing-blocks' &&
        issue.path === 'tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate',
    ),
  );

  const combined = prepareWithDirectCollectionDefaults({
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
            recordActions: [
              {
                type: 'view',
                popup: {
                  tryTemplate: true,
                  saveAsTemplate: {
                    name: 'user-popup-template',
                    description: 'Save this popup as a reusable template.',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(combined.ok, true);
  assert.equal(combined.errors.length, 0);
  assert.equal(combined.cliBody.tabs[0].blocks[0].recordActions[0].popup.tryTemplate, true);

  const conflict = prepareWithDirectCollectionDefaults({
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
            recordActions: [
              {
                type: 'view',
                popup: {
                  template: {
                    uid: 'popup-template-uid',
                    mode: 'reference',
                  },
                  saveAsTemplate: {
                    name: 'user-popup-template',
                    description: 'Save this popup as a reusable template.',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(conflict.ok, false);
  assert.ok(
    conflict.errors.some(
      (issue) =>
        issue.ruleId === 'conflicting-popup-save-as-template' &&
        issue.path === 'tabs[0].blocks[0].recordActions[0].popup.saveAsTemplate',
    ),
  );
});

test('prepareApplyBlueprintRequest ignores local popup blocks for write shape when a popup template is bound but still collects their defaults scope', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: {
              view: { name: 'User details', description: 'View one user record.' },
              addNew: { name: 'Create user', description: 'Create one user record.' },
              edit: { name: 'Edit user', description: 'Edit one user record.' },
            },
          },
        },
      },
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
                    blocks: [
                      {
                        key: 'rolesTable',
                        type: 'table',
                        collection: 'roles',
                        fields: ['name'],
                        recordActions: ['view'],
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
      collectionMetadata,
      templateDecision: {
        kind: 'selected-reference',
        template: {
          uid: 'user-edit-popup-template',
        },
        reasonCode: 'standard-reuse',
      },
    },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-default-collection' && issue.path === 'defaults.collections.roles',
    ),
  );
  assert.deepEqual(result.defaultsRequirements, {
    collections: [
      {
        collection: 'roles',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: true,
        fieldGroupActions: ['addNew', 'edit', 'view'],
      },
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
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

test('page preview cli prepare-write returns skipped defaultsRequirements when collectionMetadata is missing', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
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
              fields: ['nickname'],
              actions: [defaultFilterAction(['nickname', 'email', 'status'])],
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
  assert.deepEqual(payload.warnings, []);
  assert.deepEqual(payload.errors, []);
  assert.deepEqual(payload.defaultsRequirements, {
    skipped: true,
    collections: [
      {
        collection: 'users',
        popupActions: ['addNew', 'edit', 'view'],
        requiresFieldGroups: false,
        fieldGroupActions: [],
      },
    ],
    associations: [],
  });
  assert.equal(payload.cliBody?.tabs?.[0]?.blocks?.[0]?.collection, 'users');
});

test('page preview cli prepare-write returns normalized cli body json', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      requestBody: {
        version: '1',
        mode: 'replace',
        target: { pageSchemaUid: 'users-page-schema' },
        defaults: {
          collections: {
            users: {
              popups: {
                view: { name: 'User details', description: 'View one user record.' },
                addNew: { name: 'Create user', description: 'Create one user record.' },
                edit: { name: 'Edit user', description: 'Edit one user record.' },
              },
            },
          },
        },
        tabs: [
          {
            title: 'Overview',
            blocks: [
              {
                key: 'usersTable',
                type: 'table',
                collection: 'users',
                fields: ['nickname', 'email'],
                actions: [defaultFilterAction(['nickname', 'email', 'status'])],
              },
            ],
          },
        ],
      },
      collectionMetadata,
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
        defaults: {
          collections: {
            users: {
              popups: {
                view: { name: 'User details', description: 'View one user record.' },
                addNew: { name: 'Create user', description: 'Create one user record.' },
                edit: { name: 'Edit user', description: 'Edit one user record.' },
              },
            },
          },
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
                actions: [defaultFilterAction(['nickname', 'email', 'status'])],
              },
            ],
          },
        ],
      },
      collectionMetadata,
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
        defaults: {
          collections: {
            users: {
              popups: {
                view: { name: 'User details', description: 'View one user record.' },
                addNew: { name: 'Create user', description: 'Create one user record.' },
                edit: { name: 'Edit user', description: 'Edit one user record.' },
              },
            },
          },
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
                actions: [defaultFilterAction(['nickname', 'email', 'status'])],
              },
            ],
          },
        ],
      },
      collectionMetadata,
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
      requestBody: {
        version: '1',
        mode: 'create',
        page: { title: 'Users' },
        defaults: {
          collections: {
            users: {
              popups: {
                view: { name: 'User details', description: 'View one user record.' },
                addNew: { name: 'Create user', description: 'Create one user record.' },
                edit: { name: 'Edit user', description: 'Edit one user record.' },
              },
            },
          },
        },
        tabs: [
          {
            title: 'List',
            blocks: [
              {
                key: 'usersTable',
                type: 'table',
                collection: 'users',
                fields: ['nickname'],
                actions: [defaultFilterAction(['nickname', 'email', 'status'])],
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
      },
      collectionMetadata,
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
