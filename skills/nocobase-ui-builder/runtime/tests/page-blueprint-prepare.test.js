import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
  prepareApplyBlueprintRequest as rawPrepareApplyBlueprintRequest,
} from '../src/page-blueprint-prepare.js';
import { prepareApplyBlueprintWrite } from '../src/apply-blueprint-prepare.js';
import { buildSuggestedDefaultFilterGroup } from '../src/default-filter-candidates.js';
import { fetchCollectionMetadata } from '../src/collection-metadata-resolver.js';

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

async function readStreamText(stream) {
  let output = '';
  for await (const chunk of stream) {
    output += chunk.toString('utf8');
  }
  return output;
}

function parseFlagValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => String(arg).startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

function hasBooleanFlag(args, name) {
  return args.some((arg) => arg === `--${name}` || arg === `--${name}=true`);
}

async function runPrepareWriteForTest(args, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  try {
    const rawInput = await readStreamText(io.stdin || process.stdin);
    const payload = JSON.parse(rawInput || '{}');
    const expectedOuterTabs = parseFlagValue(args, 'expected-outer-tabs');
    const result = await prepareApplyBlueprintWrite(payload, {
      cwd: io.cwd || process.cwd(),
      autoCollectionMetadata: !hasBooleanFlag(args, 'no-auto-collection-metadata'),
      ...(expectedOuterTabs ? { expectedOuterTabs: Number(expectedOuterTabs) } : {}),
      ...(io.execFileImpl ? { execFileImpl: io.execFileImpl } : {}),
      ...(io.fetchCollectionMetadata ? { fetchCollectionMetadata: io.fetchCollectionMetadata } : {}),
    });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  } catch (error) {
    stderr.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2)}\n`);
    return 2;
  }
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
const calendarCollectionMetadata = {
  collections: {
    users: {
      titleField: 'nickname',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'nickname', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
        { name: 'createdAt', type: 'date', interface: 'datetime' },
        { name: 'updatedAt', type: 'date', interface: 'datetime' },
      ],
    },
  },
};
const largeCalendarCollectionMetadata = {
  collections: {
    users: {
      ...calendarCollectionMetadata.collections.users,
      fields: [
        ...calendarCollectionMetadata.collections.users.fields,
        { name: 'username', type: 'string', interface: 'input' },
        { name: 'email', type: 'string', interface: 'input' },
        { name: 'phone', type: 'string', interface: 'input' },
        { name: 'bio', type: 'text', interface: 'textarea' },
        { name: 'city', type: 'string', interface: 'input' },
        { name: 'address', type: 'string', interface: 'input' },
        { name: 'title', type: 'string', interface: 'input' },
        { name: 'timezone', type: 'string', interface: 'select' },
        { name: 'locale', type: 'string', interface: 'select' },
      ],
    },
  },
};

const oneCandidateCollectionMetadata = {
  collections: {
    users: {
      titleField: 'nickname',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'nickname', type: 'string', interface: 'input' },
        { name: 'createdAt', type: 'date', interface: 'datetime' },
        { name: 'roles', type: 'belongsToMany', interface: 'm2m', target: 'roles' },
      ],
    },
  },
};

const zeroCandidateCollectionMetadata = {
  collections: {
    users: {
      titleField: 'id',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'createdAt', type: 'date', interface: 'datetime' },
        { name: 'updatedAt', type: 'date', interface: 'datetime' },
        { name: 'roles', type: 'belongsToMany', interface: 'm2m', target: 'roles' },
      ],
    },
  },
};
const intelligenceTreeCollectionMetadata = {
  collections: {
    intelligenceEntries: {
      titleField: 'title',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'bigInt', interface: 'integer' },
        { name: 'title', type: 'string', interface: 'input' },
        { name: 'intelType', type: 'string', interface: 'select' },
      ],
    },
  },
};
const minimalUserCollectionMetadata = {
  collections: {
    users: {
      titleField: 'nickname',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'nickname', type: 'string', interface: 'input' },
      ],
    },
  },
};
const minimalRoleCollectionMetadata = {
  collections: {
    roles: {
      titleField: 'name',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
  },
};
const userDepartmentAssociationMetadata = {
  collections: {
    users: {
      titleField: 'nickname',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'nickname', type: 'string', interface: 'input' },
        { name: 'department', type: 'belongsTo', interface: 'm2o', target: 'departments' },
      ],
    },
  },
};
const minimalDepartmentCollectionMetadata = {
  collections: {
    departments: {
      titleField: 'title',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'title', type: 'string', interface: 'input' },
      ],
    },
  },
};
const departmentManagerAssociationMetadata = {
  collections: {
    departments: {
      titleField: 'title',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'title', type: 'string', interface: 'input' },
        { name: 'manager', type: 'belongsTo', interface: 'm2o', target: 'employees' },
      ],
    },
  },
};
const minimalEmployeeCollectionMetadata = {
  collections: {
    employees: {
      titleField: 'name',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
  },
};
const dataSurfaceBlockTypes = new Set(['table', 'list', 'gridCard', 'calendar', 'kanban']);
const commonUserDefaultFilterFieldNames = ['nickname', 'username', 'email'];
const commonCalendarDefaultFilterFieldNames = ['nickname', 'status'];

function buildChartAsset(overrides = {}) {
  return {
    query: {
      mode: 'builder',
      resource: { dataSourceKey: 'main', collectionName: 'users' },
      measures: [{ field: 'id', aggregation: 'count', alias: 'userCount' }],
      dimensions: [{ field: 'nickname' }],
      ...(isObjectRecord(overrides.query) ? overrides.query : {}),
    },
    visual: {
      mode: 'basic',
      type: 'bar',
      mappings: { x: 'nickname', y: 'userCount' },
      ...(isObjectRecord(overrides.visual) ? overrides.visual : {}),
    },
    ...(isObjectRecord(overrides.root) ? overrides.root : {}),
  };
}

function buildChartBlueprint({ asset = buildChartAsset(), block = {} } = {}) {
  return {
    version: '1',
    mode: 'create',
    navigation: {
      group: { title: 'Workspace', icon: 'AppstoreOutlined' },
      item: { title: 'Dashboard', icon: 'DashboardOutlined' },
    },
    page: { title: 'Dashboard' },
    defaults: {
      collections: {
        users: {
          popups: buildFixedCollectionPopupDefaults('users'),
        },
      },
    },
    assets: {
      charts: {
        statusChart: asset,
      },
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'statusChart',
            type: 'chart',
            title: 'Status chart',
            chart: 'statusChart',
            ...block,
          },
        ],
      },
    ],
  };
}

function prepareChartBlueprint(options = {}) {
  return rawPrepareApplyBlueprintRequest(
    buildChartBlueprint(options),
    { collectionMetadata: minimalUserCollectionMetadata },
  );
}

function assertRejectsChartBlueprint(options, expectedRuleIds) {
  const result = prepareChartBlueprint(options);
  assert.equal(result.ok, false);
  for (const ruleId of expectedRuleIds) {
    assert.ok(result.errors.some((issue) => issue.ruleId === ruleId), `expected ${ruleId}`);
  }
  assert.equal(result.cliBody, undefined);
  return result;
}

function defaultFilterGroup(fieldNames = commonUserDefaultFilterFieldNames) {
  const normalizedFieldNames = fieldNames.filter(Boolean);
  return {
    logic: '$and',
    items: normalizedFieldNames.map((path) => ({
      path,
      operator: ['status', 'scope', 'priority', 'sort'].includes(path) ? '$eq' : '$includes',
      value: '',
    })),
  };
}

function defaultFilterAction(fieldNames = commonUserDefaultFilterFieldNames) {
  const normalizedFieldNames = fieldNames.filter(Boolean);
  return {
    type: 'filter',
    settings: {
      filterableFieldNames: normalizedFieldNames,
      defaultFilter: defaultFilterGroup(normalizedFieldNames),
    },
  };
}

function assertMissingCollectionMetadata(result, expectedPath) {
  assert.equal(result.ok, false);
  assert.equal(result.cliBody, undefined);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'missing-collection-metadata'
        && issue.path === 'collectionMetadata'
        && (!expectedPath || issue.message.includes(expectedPath)),
    ),
  );
}

function resolvePublicBlockCollectionName(block) {
  if (!isObjectRecord(block)) return '';
  if (typeof block.collection === 'string' && block.collection.trim()) return block.collection.trim();
  if (isObjectRecord(block.resource) && typeof block.resource.collectionName === 'string' && block.resource.collectionName.trim()) {
    return block.resource.collectionName.trim();
  }
  if (isObjectRecord(block.resourceInit) && typeof block.resourceInit.collectionName === 'string' && block.resourceInit.collectionName.trim()) {
    return block.resourceInit.collectionName.trim();
  }
  return '';
}

function buildDefaultBlockDefaultFilter(rawCollectionMetadata, collectionName) {
  const collectionEntry = getPrepareCollectionEntry(rawCollectionMetadata, collectionName);
  const suggestedGroup = buildSuggestedDefaultFilterGroup(collectionEntry);
  return {
    logic: '$and',
    items: suggestedGroup.items.length > 0 ? suggestedGroup.items : [{ path: 'nickname', operator: '$includes', value: '' }],
  };
}

function injectDefaultFiltersIntoBlockSpecs(blocks, rawCollectionMetadata) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (!isObjectRecord(block)) continue;
    const normalizedType = typeof block.type === 'string' ? block.type.trim() : '';
    const templateBacked = isObjectRecord(block.template) && typeof block.template.uid === 'string' && block.template.uid.trim();
    if (dataSurfaceBlockTypes.has(normalizedType) && !templateBacked && !Object.prototype.hasOwnProperty.call(block, 'defaultFilter')) {
      block.defaultFilter = buildDefaultBlockDefaultFilter(rawCollectionMetadata, resolvePublicBlockCollectionName(block));
    }

    if (isObjectRecord(block.popup)) {
      injectDefaultFiltersIntoBlockSpecs(block.popup.blocks, rawCollectionMetadata);
    }

    for (const actionListKey of ['actions', 'recordActions']) {
      if (!Array.isArray(block[actionListKey])) continue;
      for (const action of block[actionListKey]) {
        if (isObjectRecord(action?.popup)) {
          injectDefaultFiltersIntoBlockSpecs(action.popup.blocks, rawCollectionMetadata);
        }
      }
    }

    for (const fieldContainerKey of ['fields', 'fieldGroups']) {
      const container = block[fieldContainerKey];
      if (!Array.isArray(container)) continue;
      const fields = fieldContainerKey === 'fieldGroups'
        ? container.flatMap((group) => Array.isArray(group?.fields) ? group.fields : [])
        : container;
      for (const field of fields) {
        if (isObjectRecord(field?.popup)) {
          injectDefaultFiltersIntoBlockSpecs(field.popup.blocks, rawCollectionMetadata);
        }
      }
    }
  }
}

function prepareApplyBlueprintRequest(input, options = {}) {
  const { injectDataSurfaceDefaultFilter = true, ...prepareOptions } = options || {};
  if (!injectDataSurfaceDefaultFilter || !isObjectRecord(input)) {
    return rawPrepareApplyBlueprintRequest(input, prepareOptions);
  }

  const nextInput = structuredClone(input);
  const rawCollectionMetadata = prepareOptions.collectionMetadata
    || (isObjectRecord(nextInput.collectionMetadata) ? nextInput.collectionMetadata : undefined);
  const blueprint = isObjectRecord(nextInput.requestBody) ? nextInput.requestBody : nextInput;
  if (isObjectRecord(blueprint)) {
    injectDefaultFiltersIntoBlockSpecs(
      Array.isArray(blueprint.tabs)
        ? blueprint.tabs.flatMap((tab) => Array.isArray(tab?.blocks) ? tab.blocks : [])
        : [],
      rawCollectionMetadata,
    );
    injectDefaultFiltersIntoBlockSpecs(Array.isArray(blueprint.blocks) ? blueprint.blocks : [], rawCollectionMetadata);
    const templateBacked = isObjectRecord(blueprint.template) && typeof blueprint.template.uid === 'string' && blueprint.template.uid.trim();
    if (dataSurfaceBlockTypes.has(String(blueprint.type || '').trim()) && !templateBacked && !Object.prototype.hasOwnProperty.call(blueprint, 'defaultFilter')) {
      blueprint.defaultFilter = buildDefaultBlockDefaultFilter(rawCollectionMetadata, resolvePublicBlockCollectionName(blueprint));
    }
  }

  return rawPrepareApplyBlueprintRequest(nextInput, prepareOptions);
}

function isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

test('prepareApplyBlueprintRequest accepts flat relation fieldType objects and rejects internal field keys', () => {
  const collectionMetadata = {
    collections: {
      users: {
        name: 'users',
        fields: [{ name: 'roles', interface: 'm2m', target: 'roles' }],
      },
      roles: {
        name: 'roles',
        titleField: 'name',
        fields: [
          { name: 'title', interface: 'input' },
          { name: 'name', interface: 'input' },
        ],
      },
    },
  };
  const valid = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Relation fieldType page' },
    tabs: [
      {
        title: 'Main',
        blocks: [
          {
            key: 'form',
            type: 'createForm',
            resource: { dataSourceKey: 'main', collectionName: 'users' },
            fields: [
              {
                key: 'rolesField',
                field: 'roles',
                fieldType: 'popupSubTable',
                fields: ['title', 'name'],
              },
            ],
          },
        ],
      },
    ],
    defaults: { collections: { users: { popups: buildFixedCollectionPopupDefaults('users') } } },
  }, { collectionMetadata });
  assert.equal(valid.ok, true);
  assert.equal(valid.cliBody.tabs[0].blocks[0].fields[0].fieldType, 'popupSubTable');

  const invalid = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Invalid relation fieldType page' },
    tabs: [
      {
        title: 'Main',
        blocks: [
          {
            key: 'form',
            type: 'createForm',
            resource: { dataSourceKey: 'main', collectionName: 'users' },
            fields: [{ field: 'roles', fieldComponent: 'PopupSubTableFieldModel' }],
          },
        ],
      },
    ],
    defaults: { collections: { users: { popups: buildFixedCollectionPopupDefaults('users') } } },
  }, { collectionMetadata });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some((item) => item.ruleId === 'internal-field-keys-not-public'), true);
});

test('prepareApplyBlueprintRequest requires explicit titleField for relation fieldType objects when target collection titleField is id', () => {
  const collectionMetadata = {
    collections: {
      users: {
        name: 'users',
        titleField: 'nickname',
        fields: [
          { name: 'nickname', interface: 'input' },
          { name: 'roles', interface: 'm2m', target: 'roles' },
        ],
      },
      roles: {
        name: 'roles',
        titleField: 'id',
        fields: [
          { name: 'id', interface: 'number' },
          { name: 'name', interface: 'input' },
          { name: 'code', interface: 'input' },
        ],
      },
    },
  };

  const missing = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Relation titleField required page' },
    tabs: [
      {
        title: 'Main',
        blocks: [
          {
            key: 'form',
            type: 'createForm',
            resource: { dataSourceKey: 'main', collectionName: 'users' },
            fields: [
              {
                key: 'rolesField',
                field: 'roles',
                fieldType: 'popupSubTable',
                fields: ['name', 'code'],
              },
            ],
          },
        ],
      },
    ],
    defaults: { collections: { users: { popups: buildFixedCollectionPopupDefaults('users') } } },
  }, { collectionMetadata });

  assert.equal(missing.ok, false);
  assert.equal(
    missing.errors.some(
      (item) =>
        item.ruleId === 'relation-field-title-field-required-when-collection-title-is-id'
        && item.path === 'tabs[0].blocks[0].fields[0].titleField'
        && /roles/.test(item.message)
        && /"id"/.test(item.message)
        && /name/.test(item.message)
        && /title/.test(item.message)
        && /code/.test(item.message),
    ),
    true,
  );

  const explicitReadable = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Relation titleField explicit page' },
    tabs: [
      {
        title: 'Main',
        blocks: [
          {
            key: 'form',
            type: 'createForm',
            resource: { dataSourceKey: 'main', collectionName: 'users' },
            fields: [
              {
                key: 'rolesField',
                field: 'roles',
                fieldType: 'popupSubTable',
                titleField: 'name',
                fields: ['name', 'code'],
              },
            ],
          },
        ],
      },
    ],
    defaults: { collections: { users: { popups: buildFixedCollectionPopupDefaults('users') } } },
  }, { collectionMetadata });

  assert.equal(explicitReadable.ok, true, JSON.stringify(explicitReadable.errors));

  const explicitId = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Relation titleField explicit id page' },
    tabs: [
      {
        title: 'Main',
        blocks: [
          {
            key: 'form',
            type: 'createForm',
            resource: { dataSourceKey: 'main', collectionName: 'users' },
            fields: [
              {
                key: 'rolesField',
                field: 'roles',
                fieldType: 'popupSubTable',
                titleField: 'id',
                fields: ['name', 'code'],
              },
            ],
          },
        ],
      },
    ],
    defaults: { collections: { users: { popups: buildFixedCollectionPopupDefaults('users') } } },
  }, { collectionMetadata });

  assert.equal(explicitId.ok, true, JSON.stringify(explicitId.errors));
});

test('prepareApplyBlueprintRequest requires explicit titleField for relation fieldType objects when target collection titleField falls back to id', () => {
  const collectionMetadata = {
    collections: {
      users: {
        name: 'users',
        titleField: 'nickname',
        fields: [
          { name: 'nickname', interface: 'input' },
          { name: 'roles', interface: 'm2m', target: 'roles' },
        ],
      },
      roles: {
        name: 'roles',
        fields: [
          { name: 'id', interface: 'number' },
          { name: 'name', interface: 'input' },
          { name: 'code', interface: 'input' },
        ],
      },
    },
  };

  const missing = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Relation titleField implicit id page' },
    tabs: [
      {
        title: 'Main',
        blocks: [
          {
            key: 'form',
            type: 'createForm',
            resource: { dataSourceKey: 'main', collectionName: 'users' },
            fields: [
              {
                key: 'rolesField',
                field: 'roles',
                fieldType: 'popupSubTable',
                fields: ['name', 'code'],
              },
            ],
          },
        ],
      },
    ],
    defaults: { collections: { users: { popups: buildFixedCollectionPopupDefaults('users') } } },
  }, { collectionMetadata });

  assert.equal(missing.ok, false);
  assert.equal(
    missing.errors.some(
      (item) =>
        item.ruleId === 'relation-field-title-field-required-when-collection-title-is-id'
        && item.path === 'tabs[0].blocks[0].fields[0].titleField',
    ),
    true,
  );

  const explicitId = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Relation titleField implicit explicit id page' },
    tabs: [
      {
        title: 'Main',
        blocks: [
          {
            key: 'form',
            type: 'createForm',
            resource: { dataSourceKey: 'main', collectionName: 'users' },
            fields: [
              {
                key: 'rolesField',
                field: 'roles',
                fieldType: 'popupSubTable',
                titleField: 'id',
                fields: ['name', 'code'],
              },
            ],
          },
        ],
      },
    ],
    defaults: { collections: { users: { popups: buildFixedCollectionPopupDefaults('users') } } },
  }, { collectionMetadata });

  assert.equal(explicitId.ok, true, JSON.stringify(explicitId.errors));
});

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
      title: `${collectionName} generated popup fields`,
      fields: fieldNames,
    },
  ];
}

function prepareWithDirectCollectionDefaults(blueprint, options = {}) {
  const {
    collections = ['users'],
    collectionMetadata: providedCollectionMetadata = defaultPrepareCollectionMetadata,
    injectDataSurfaceDefaultFilter = true,
    ...prepareOptions
  } = options;
  const nextBlueprint = structuredClone(blueprint);
  if (injectDataSurfaceDefaultFilter) {
    injectDefaultFiltersIntoBlockSpecs(nextBlueprint.tabs?.flatMap((tab) => Array.isArray(tab?.blocks) ? tab.blocks : []) || [], providedCollectionMetadata);
  }
  const existingDefaults = isObjectRecord(nextBlueprint.defaults) ? nextBlueprint.defaults : {};
  const existingCollections = isObjectRecord(existingDefaults.collections) ? existingDefaults.collections : {};
  const nextCollections = { ...existingCollections };
  const probe = prepareApplyBlueprintRequest(nextBlueprint, {
    collectionMetadata: providedCollectionMetadata,
    injectDataSurfaceDefaultFilter,
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
    injectDataSurfaceDefaultFilter,
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
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
            },
          ],
        },
      ],
    },
    collectionMetadata,
  });

  assert.equal(result.ok, true);
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
            defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
            actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
          },
        ],
      },
    ],
  });
});

test('prepareApplyBlueprintRequest normalizes literal escaped newlines in JS code before write', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Employees' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'jsBlock',
            type: 'js',
            use: 'JSBlockModel',
            stepParams: {
              jsSettings: {
                runJs: {
                  version: 'v2',
                  code: 'const title = String(ctx.formValues?.title || "");\\nreturn title.trim();',
                },
              },
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].stepParams.jsSettings.runJs.code.includes('\\n'), false);
  assert.equal(result.cliBody.tabs[0].blocks[0].stepParams.jsSettings.runJs.code.includes('\n'), true);
});

test('prepareApplyBlueprintRequest accepts public blueprint envelope with metadata', () => {
  const result = prepareApplyBlueprintRequest({
    blueprint: {
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
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
            },
          ],
        },
      ],
    },
    collectionMetadata,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.cliBody.page.title, 'Employees');
});

test('prepareApplyBlueprintRequest requires block-level defaultFilter on data-surface blocks while keeping filter actions optional', () => {
  const missing = prepareWithDirectCollectionDefaults(
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
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((issue) => issue.ruleId === 'data-surface-block-default-filter-required'));

  const shorthand = prepareWithDirectCollectionDefaults(
    {
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
    },
    { collectionMetadata },
  );
  assert.equal(shorthand.ok, true);

  const objectWithoutSettings = prepareWithDirectCollectionDefaults(
    {
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
    },
    { collectionMetadata },
  );
  assert.equal(objectWithoutSettings.ok, true);

  const actionLevelOnly = prepareWithDirectCollectionDefaults(
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
              actions: [defaultFilterAction(['nickname', 'email'])],
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(actionLevelOnly.ok, false);
  assert.ok(actionLevelOnly.errors.some((issue) => issue.ruleId === 'data-surface-block-default-filter-required'));

  const templateBackedWithoutDefaultFilter = prepareWithDirectCollectionDefaults(
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
              template: { uid: 'users-table-template', mode: 'reference' },
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(templateBackedWithoutDefaultFilter.ok, true);

  const templateBackedWithDefaultFilter = prepareWithDirectCollectionDefaults(
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
              template: { uid: 'users-table-template', mode: 'reference' },
              defaultFilter: {},
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(templateBackedWithDefaultFilter.ok, false);
  assert.ok(templateBackedWithDefaultFilter.errors.some((issue) => issue.ruleId === 'data-surface-block-default-filter-template-unsupported'));

  const templateBackedWithDefaultActionSettings = prepareWithDirectCollectionDefaults(
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
              template: { uid: 'users-table-template', mode: 'reference' },
              defaultActionSettings: {
                filter: {
                  filterableFieldNames: ['nickname', 'status'],
                },
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(templateBackedWithDefaultActionSettings.ok, false);
  assert.ok(
    templateBackedWithDefaultActionSettings.errors.some(
      (issue) => issue.ruleId === 'data-surface-block-default-action-settings-template-unsupported',
    ),
  );

  const invalidSecondFilterAction = prepareWithDirectCollectionDefaults(
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
              actions: ['filter', { type: 'filter', settings: 'invalid' }],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(invalidSecondFilterAction.ok, false);
  assert.ok(invalidSecondFilterAction.errors.some((issue) => issue.ruleId === 'data-surface-filter-settings-invalid'));

  const missingCommonFields = prepareWithDirectCollectionDefaults(
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
              defaultFilter: defaultFilterGroup(['nickname']),
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(missingCommonFields.ok, false);
  assert.ok(
    missingCommonFields.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-common-fields-incomplete'),
  );

  const emptyObjectDefaultFilter = prepareWithDirectCollectionDefaults(
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
              defaultFilter: {},
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(emptyObjectDefaultFilter.ok, false);
  assert.ok(emptyObjectDefaultFilter.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-empty'));

  const nullDefaultFilter = prepareWithDirectCollectionDefaults(
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
              defaultFilter: null,
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(nullDefaultFilter.ok, false);
  assert.ok(nullDefaultFilter.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-empty'));

  const emptyGroupDefaultFilter = prepareWithDirectCollectionDefaults(
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
              defaultFilter: { logic: '$and', items: [] },
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(emptyGroupDefaultFilter.ok, false);
  assert.ok(emptyGroupDefaultFilter.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-empty'));

  const defaultFilterOnlyUnknownPath = prepareWithDirectCollectionDefaults(
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
              defaultFilter: defaultFilterGroup(['missingField']),
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(defaultFilterOnlyUnknownPath.ok, false);
  assert.ok(defaultFilterOnlyUnknownPath.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-unknown-field'));

  const exactTwoCandidateCoverage = prepareWithDirectCollectionDefaults(
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
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(exactTwoCandidateCoverage.ok, true);

  const exactOneCandidateCoverage = prepareWithDirectCollectionDefaults(
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
              defaultFilter: defaultFilterGroup(['nickname']),
            },
          ],
        },
      ],
    },
    { collectionMetadata: oneCandidateCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(exactOneCandidateCoverage.ok, true);

  const zeroCandidateStillAllowsNonEmptyDefaultFilter = prepareWithDirectCollectionDefaults(
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
              fields: ['id'],
              defaultFilter: defaultFilterGroup(['createdAt']),
            },
          ],
        },
      ],
    },
    { collectionMetadata: zeroCandidateCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(zeroCandidateStillAllowsNonEmptyDefaultFilter.ok, true);

  const incomplete = prepareWithDirectCollectionDefaults(
    {
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
    },
    { collectionMetadata },
  );
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-items-incomplete'));

  const blockLevelIncomplete = prepareWithDirectCollectionDefaults(
    {
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
              defaultFilter: defaultFilterGroup(['nickname']),
              actions: [
                {
                  type: 'filter',
                  settings: {
                    filterableFieldNames: ['nickname', 'email'],
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
  assert.equal(blockLevelIncomplete.ok, false);
  assert.ok(blockLevelIncomplete.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-items-incomplete'));

  const actionDefaultFilterOverridesBlockLevelCoverage = prepareWithDirectCollectionDefaults(
    {
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
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              actions: [
                {
                  type: 'filter',
                  settings: {
                    filterableFieldNames: ['nickname', 'email'],
                    defaultFilter: defaultFilterGroup(['nickname', 'email']),
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
  assert.equal(actionDefaultFilterOverridesBlockLevelCoverage.ok, true);

  const invalidSettingsShape = prepareWithDirectCollectionDefaults(
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
              actions: [{ type: 'filter', settings: 'invalid' }],
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(invalidSettingsShape.ok, false);
  assert.ok(invalidSettingsShape.errors.some((issue) => issue.ruleId === 'data-surface-filter-settings-invalid'));

  const invalidLogic = prepareWithDirectCollectionDefaults(
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
              defaultFilter: {
                logic: '$bad',
                items: [{ path: 'nickname', operator: '$includes', value: '' }],
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(invalidLogic.ok, false);
  assert.ok(invalidLogic.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-logic-invalid'));

  const emptyNestedGroup = prepareWithDirectCollectionDefaults(
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
              defaultFilter: {
                logic: '$and',
                items: [{ logic: '$or', items: [] }],
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(emptyNestedGroup.ok, false);
  assert.ok(emptyNestedGroup.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-empty'));
});

test('prepareApplyBlueprintRequest accepts gridCard settings.columns and rejects unsupported gridCard setting keys', () => {
  const responsiveColumns = { xs: 1, sm: 1, md: 2, lg: 3, xl: 3, xxl: 4 };
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
              type: 'gridCard',
              title: 'Users grid',
              collection: 'users',
              fields: ['nickname'],
              settings: {
                columns: responsiveColumns,
                rowCount: 3,
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
  assert.deepEqual(valid.cliBody.tabs[0].blocks[0].settings.columns, responsiveColumns);
  assert.equal(valid.cliBody.tabs[0].blocks[0].settings.rowCount, 3);

  const unsupportedKey = ['column', 'Count'].join('');
  const invalid = prepareWithDirectCollectionDefaults(
    {
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
              settings: {
                [unsupportedKey]: { xs: 1, md: 2 },
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(invalid.ok, false);
  assert.ok(
    invalid.errors.some(
      (issue) => issue.ruleId === 'grid-card-settings-unsupported'
        && issue.path === `tabs[0].blocks[0].settings.${unsupportedKey}`,
    ),
  );
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

  const nested = prepareWithDirectCollectionDefaults(
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
              actions: [
                {
                  type: 'filter',
                  settings: {
                    filterableFieldNames: ['nickname', 'email'],
                    defaultFilter: {
                      logic: '$and',
                      items: [
                        {
                          logic: '$or',
                          items: [
                            { path: 'nickname', operator: '$includes', value: '' },
                            { path: 'email', operator: '$includes', value: '' },
                          ],
                        },
                      ],
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
  assert.equal(nested.ok, true);

  const emptyActionDefaultFilter = prepareWithDirectCollectionDefaults(
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
              actions: [
                {
                  type: 'filter',
                  settings: {
                    filterableFieldNames: ['nickname'],
                    defaultFilter: {},
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
  assert.equal(emptyActionDefaultFilter.ok, false);
  assert.ok(emptyActionDefaultFilter.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-empty'));

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

  const nestedMissingCoverage = prepareWithDirectCollectionDefaults(
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
              actions: [
                {
                  type: 'filter',
                  settings: {
                    filterableFieldNames: ['nickname', 'email'],
                    defaultFilter: {
                      logic: '$and',
                      items: [
                        {
                          logic: '$or',
                          items: [{ path: 'nickname', operator: '$includes', value: '' }],
                        },
                      ],
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
  assert.equal(nestedMissingCoverage.ok, false);
  assert.ok(nestedMissingCoverage.errors.some((issue) => issue.ruleId === 'data-surface-default-filter-items-incomplete'));

  const actionDefaultFilterMissingCommonFields = prepareWithDirectCollectionDefaults(
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
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              actions: [
                {
                  type: 'filter',
                  settings: {
                    defaultFilter: defaultFilterGroup(['nickname']),
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(actionDefaultFilterMissingCommonFields.ok, false);
  assert.ok(
    actionDefaultFilterMissingCommonFields.errors.some(
      (issue) => issue.ruleId === 'data-surface-default-filter-common-fields-incomplete',
    ),
  );

  const actionDefaultFilterSkipsCommonFieldCoverageWhenFilterableFieldNamesIsExplicitButEmpty = prepareWithDirectCollectionDefaults(
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
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              actions: [
                {
                  type: 'filter',
                  settings: {
                    filterableFieldNames: [],
                    defaultFilter: defaultFilterGroup(['nickname']),
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(actionDefaultFilterSkipsCommonFieldCoverageWhenFilterableFieldNamesIsExplicitButEmpty.ok, false);
  assert.ok(
    actionDefaultFilterSkipsCommonFieldCoverageWhenFilterableFieldNamesIsExplicitButEmpty.errors.some(
      (issue) => issue.ruleId === 'data-surface-default-filter-fields-required',
    ),
  );
  assert.equal(
    actionDefaultFilterSkipsCommonFieldCoverageWhenFilterableFieldNamesIsExplicitButEmpty.errors.some(
      (issue) => issue.ruleId === 'data-surface-default-filter-common-fields-incomplete',
    ),
    false,
  );

  const actionDefaultFilterExactTwoCandidateCoverage = prepareWithDirectCollectionDefaults(
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
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              actions: [
                {
                  type: 'filter',
                  settings: {
                    defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(actionDefaultFilterExactTwoCandidateCoverage.ok, true);
});

test('prepareApplyBlueprintRequest accepts tree connectFields targets', () => {
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users tree connect' },
      tabs: [
        {
          key: 'main',
          title: 'Overview',
          blocks: [
            {
              key: 'usersTree',
              type: 'tree',
              title: 'Users tree',
              collection: 'users',
              settings: {
                title: 'Users tree',
                connectFields: {
                  targets: [{ target: 'usersTable' }],
                },
              },
            },
            {
              key: 'usersTable',
              type: 'table',
              title: 'Users table',
              collection: 'users',
              fields: ['nickname'],
              actions: ['filter'],
            },
          ],
          layout: {
            rows: [[{ key: 'usersTree', span: 8 }, { key: 'usersTable', span: 16 }]],
          },
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].settings.connectFields, {
    targets: [{ target: 'usersTable' }],
  });

  const mapAndComments = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users tree connect to map and comments' },
      tabs: [
        {
          key: 'main',
          title: 'Overview',
          blocks: [
            {
              key: 'usersTree',
              type: 'tree',
              title: 'Users tree',
              collection: 'users',
              settings: {
                connectFields: {
                  targets: [{ target: 'usersMap' }, { target: 'usersComments' }],
                },
              },
            },
            {
              key: 'usersMap',
              type: 'map',
              title: 'Users map',
              collection: 'users',
            },
            {
              key: 'usersComments',
              type: 'comments',
              title: 'Users comments',
              collection: 'users',
            },
          ],
          layout: {
            rows: [[{ key: 'usersTree', span: 8 }, { key: 'usersMap', span: 8 }, { key: 'usersComments', span: 8 }]],
          },
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(mapAndComments.ok, true);

  const duplicateTarget = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users tree duplicate connect' },
      tabs: [
        {
          key: 'main',
          title: 'Overview',
          blocks: [
            {
              key: 'usersTree',
              type: 'tree',
              collection: 'users',
              settings: {
                connectFields: {
                  targets: [{ target: 'usersTable' }, { target: 'usersTable', filterPaths: ['id'] }],
                },
              },
            },
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
    { collectionMetadata },
  );

  assert.equal(duplicateTarget.ok, false);
  assert.equal(
    duplicateTarget.errors.some((issue) => issue.ruleId === 'tree-connect-target-duplicate'),
    true,
  );
});

test('prepareApplyBlueprintRequest validates tree connectFields target metadata', () => {
  const missingFilterPaths = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Department tree connect' },
      tabs: [
        {
          key: 'main',
          title: 'Overview',
          blocks: [
            {
              key: 'departmentsTree',
              type: 'tree',
              title: 'Departments tree',
              collection: 'departments',
              settings: {
                connectFields: {
                  targets: [{ target: 'usersTable' }],
                },
              },
            },
            {
              key: 'usersTable',
              type: 'table',
              title: 'Users table',
              collection: 'users',
              fields: ['nickname', 'department.title'],
              actions: ['filter'],
            },
          ],
          layout: {
            rows: [[{ key: 'departmentsTree', span: 8 }, { key: 'usersTable', span: 16 }]],
          },
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(missingFilterPaths.ok, false);
  assert.ok(missingFilterPaths.errors.some((issue) => issue.ruleId === 'tree-connect-filter-paths-required'));

  const withFilterPaths = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Department tree connect' },
      tabs: [
        {
          key: 'main',
          title: 'Overview',
          blocks: [
            {
              key: 'departmentsTree',
              type: 'tree',
              title: 'Departments tree',
              collection: 'departments',
              settings: {
                connectFields: {
                  targets: [{ target: 'usersTable', filterPaths: ['department.id'] }],
                },
              },
            },
            {
              key: 'usersTable',
              type: 'table',
              title: 'Users table',
              collection: 'users',
              fields: ['nickname', 'department.title'],
              actions: ['filter'],
            },
          ],
          layout: {
            rows: [[{ key: 'departmentsTree', span: 8 }, { key: 'usersTable', span: 16 }]],
          },
        },
      ],
    },
    { collectionMetadata },
  );

  assert.equal(withFilterPaths.ok, true);
});

test('prepareApplyBlueprintRequest rejects tree connectFields whose filterPaths type does not match the tree key', () => {
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Intel entries' },
      tabs: [
        {
          key: 'main',
          title: 'Overview',
          blocks: [
            {
              key: 'intelTypeTree',
              type: 'tree',
              title: 'By type',
              collection: 'intelligenceEntries',
              settings: {
                titleField: 'intelType',
                connectFields: {
                  targets: [{ target: 'entriesTable', filterPaths: ['intelType'] }],
                },
              },
            },
            {
              key: 'entriesTable',
              type: 'table',
              title: 'Entries',
              collection: 'intelligenceEntries',
              fields: ['title', 'intelType'],
              actions: ['filter'],
            },
          ],
          layout: {
            rows: [[{ key: 'intelTypeTree', span: 8 }, { key: 'entriesTable', span: 16 }]],
          },
        },
      ],
    },
    { collectionMetadata: intelligenceTreeCollectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'tree-connect-filter-path-type-mismatch'), true);
  assert.equal(
    result.errors.some((issue) => /titleField/i.test(issue.message) && /intelType/.test(issue.message) && /id/.test(issue.message)),
    true,
  );
});

test('prepareApplyBlueprintRequest validates tree connectFields filterTargetKey metadata shapes', () => {
  const metadata = {
    collections: {
      users: {
        titleField: 'nickname',
        filterTargetKey: ['nickname'],
        fields: [
          { name: 'id', type: 'integer', interface: 'number' },
          { name: 'nickname', type: 'string', interface: 'input' },
        ],
      },
      departments: {
        titleField: 'title',
        options: {
          filterTargetKey: ['slug'],
        },
        fields: [
          { name: 'id', type: 'integer', interface: 'number' },
          { name: 'title', type: 'string', interface: 'input' },
        ],
      },
    },
  };
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Tree filter target key metadata' },
      tabs: [
        {
          key: 'main',
          title: 'Overview',
          blocks: [
            {
              key: 'departmentsTree',
              type: 'tree',
              title: 'Departments tree',
              collection: 'departments',
              settings: {
                connectFields: {
                  targets: [{ target: 'departmentsTable', filterPaths: ['slug'] }],
                },
              },
            },
            {
              key: 'departmentsTable',
              type: 'table',
              title: 'Departments table',
              collection: 'departments',
              fields: ['title'],
              actions: ['filter'],
            },
          ],
          layout: {
            rows: [[{ key: 'departmentsTree', span: 8 }, { key: 'departmentsTable', span: 16 }]],
          },
        },
      ],
    },
    { collectionMetadata: metadata },
  );

  assert.equal(result.ok, true);
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

test('prepareApplyBlueprintRequest defaults heightMode to specifyValue when block settings include height', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Dashboard' },
      assets: {
        charts: {
          heightChart: {
            query: {
              mode: 'builder',
              resource: { dataSourceKey: 'main', collectionName: 'users' },
              measures: [{ field: 'id', aggregation: 'count', alias: 'userCount' }],
              dimensions: [{ field: 'nickname' }],
            },
            visual: {
              mode: 'basic',
              type: 'bar',
              mappings: { x: 'nickname', y: 'userCount' },
            },
          },
        },
      },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'mainChart',
              type: 'chart',
              title: 'Main chart',
              chart: 'heightChart',
              settings: { height: 500 },
              actions: [
                {
                  type: 'popup',
                  title: 'Details',
                  popup: {
                    title: 'Chart details',
                    blocks: [
                      {
                        key: 'popupChart',
                        type: 'chart',
                        title: 'Popup chart',
                        chart: 'heightChart',
                        settings: { height: 360 },
                      },
                    ],
                  },
                },
              ],
            },
            {
              key: 'fullHeightChart',
              type: 'chart',
              title: 'Full height chart',
              chart: 'heightChart',
              settings: { height: 500, heightMode: 'fullHeight' },
            },
          ],
          layout: {
            rows: [['mainChart', 'fullHeightChart']],
          },
        },
      ],
    },
    { injectDataSurfaceDefaultFilter: false, collectionMetadata: minimalUserCollectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].settings.heightMode, 'specifyValue');
  assert.equal(result.cliBody.tabs[0].blocks[0].actions[0].popup.blocks[0].settings.heightMode, 'specifyValue');
  assert.equal(result.cliBody.tabs[0].blocks[1].settings.heightMode, 'fullHeight');
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

test('prepareApplyBlueprintRequest requires collectionMetadata when field popups contain data-bound blocks', () => {
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
            defaultFilter: defaultFilterGroup(['nickname']),
            fields: [
              {
                field: 'nickname',
                popup: {
                  title: 'User details',
                  blocks: [
                    {
                      key: 'userDetails',
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

  assertMissingCollectionMetadata(result, 'tabs[0].blocks[0]');
  assert.ok(result.errors[0].message.includes('tabs[0].blocks[0].fields[0].popup.blocks[0]'));
  assert.equal(result.defaultsRequirements, undefined);
});

test('prepareApplyBlueprintRequest requires collectionMetadata when table defaults completeness is needed', () => {
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
            defaultFilter: defaultFilterGroup(['nickname']),
            fields: ['nickname'],
            recordActions: ['view'],
          },
        ],
      },
    ],
  });

  assertMissingCollectionMetadata(result, 'tabs[0].blocks[0]');
  assert.equal(result.defaultsRequirements, undefined);
});

test('prepareApplyBlueprintRequest treats empty collectionMetadata like missing metadata for data-bound blocks', () => {
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
              defaultFilter: defaultFilterGroup(['nickname']),
              fields: ['nickname'],
              recordActions: ['view'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: emptyPrepareCollectionMetadata },
  );

  assertMissingCollectionMetadata(result, 'tabs[0].blocks[0]');
  assert.equal(result.defaultsRequirements, undefined);
});

test('prepareApplyBlueprintRequest requires collectionMetadata before resolving associated-record blocks', () => {
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
            defaultFilter: defaultFilterGroup(['nickname']),
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

  assertMissingCollectionMetadata(result, 'tabs[0].blocks[0]');
  assert.ok(result.errors[0].message.includes('tabs[0].blocks[0].recordActions[0].popup.blocks[0]'));
  assert.equal(result.defaultsRequirements, undefined);
});

test('prepareApplyBlueprintRequest accepts non-data-bound pages without collectionMetadata', () => {
  const result = prepareApplyBlueprintRequest({
    version: '1',
    mode: 'create',
    page: { title: 'Info' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'intro',
            type: 'markdown',
            content: 'Static launch notes',
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.notEqual(result.cliBody, undefined);
  assert.equal(result.defaultsRequirements, undefined);
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

test('prepareApplyBlueprintRequest rejects missing large generated-popup fieldGroups once collectionMetadata is supplied', () => {
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
              defaultFilter: defaultFilterGroup(['nickname', 'email', 'status']),
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
  assert.equal(result.cliBody, undefined);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'missing-default-field-groups'
        && issue.path === 'defaults.collections.users.fieldGroups',
    ),
  );
});

test('prepareApplyBlueprintRequest accepts explicit collection default fieldGroups for large generated popups', () => {
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
  const fieldGroups = [
    {
      key: 'profile',
      title: 'Profile',
      fields: ['nickname', 'email', 'phone', 'status', 'bio', 'employeeCode'],
    },
    {
      key: 'location',
      title: 'Location',
      fields: ['realName', 'city', 'country', 'postalCode', 'timezone'],
    },
  ];

  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            fieldGroups,
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
              defaultFilter: defaultFilterGroup(['nickname', 'email', 'status']),
              fields: ['nickname'],
              actions: [defaultFilterAction(['nickname', 'email', 'status'])],
            },
          ],
        },
      ],
    },
    { collectionMetadata: largeUsersCollectionMetadata },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.cliBody.defaults.collections.users.fieldGroups, fieldGroups);
});

test('prepareApplyBlueprintRequest rejects malformed collection default fieldGroups', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Roles' },
      defaults: {
        collections: {
          roles: {
            fieldGroups: 'invalid-field-groups',
            popups: buildFixedCollectionPopupDefaults('roles'),
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
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'invalid-default-field-groups'
        && issue.path === 'defaults.collections.roles.fieldGroups',
    ),
  );
  assert.equal(result.cliBody, undefined);
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
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              fields: ['nickname'],
              actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
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

test('prepareApplyBlueprintRequest rejects missing fieldGroups for large table collections without explicit addNew', () => {
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
  assert.equal(result.cliBody, undefined);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'missing-default-field-groups'
        && issue.path === 'defaults.collections.roles.fieldGroups',
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

test('prepareApplyBlueprintRequest does not require a title when one tab has only one non-filter block', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
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
            collection: 'users',
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'multi-block-data-title-required'), false);
});

test('prepareApplyBlueprintRequest strips root and settings titles from a single data block scope', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
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
            settings: {
              title: 'Employees settings title',
              description: 'Keep this description',
              height: 480,
            },
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const block = result.cliBody.tabs[0].blocks[0];
  assert.equal(Object.hasOwn(block, 'title'), false);
  assert.equal(Object.hasOwn(block.settings, 'title'), false);
  assert.equal(block.settings.description, 'Keep this description');
  assert.equal(block.settings.height, 480);
  assert.equal(block.settings.heightMode, 'specifyValue');
  assert.equal(result.cliBody.page.title, 'Employees');
  assert.equal(result.cliBody.tabs[0].title, 'Overview');
});

test('prepareApplyBlueprintRequest removes empty settings after stripping single data block settings title', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
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
            collection: 'users',
            settings: {
              title: 'Settings-only title',
            },
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(Object.hasOwn(result.cliBody.tabs[0].blocks[0], 'settings'), false);
});

test('prepareApplyBlueprintRequest does not require block titles when filterForm is the only companion block', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: {
      title: 'Employees',
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'filters',
            type: 'filterForm',
            collection: 'users',
            fields: ['nickname', 'email'],
            actions: ['submit', 'reset'],
          },
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

  assert.equal(result.ok, true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'multi-block-data-title-required'), false);
});

test('prepareApplyBlueprintRequest strips titles when filterForm is the only companion block', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: {
      title: 'Employees',
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'filters',
            type: 'filterForm',
            title: 'Filters',
            collection: 'users',
            settings: {
              title: 'Filter settings title',
            },
            fields: ['nickname', 'email'],
            actions: ['submit', 'reset'],
          },
          {
            key: 'usersTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            settings: {
              title: 'Employees settings title',
            },
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const [filterBlock, dataBlock] = result.cliBody.tabs[0].blocks;
  assert.equal(filterBlock.title, 'Filters');
  assert.equal(filterBlock.settings.title, 'Filter settings title');
  assert.equal(Object.hasOwn(dataBlock, 'title'), false);
  assert.equal(Object.hasOwn(dataBlock, 'settings'), false);
});

test('prepareApplyBlueprintRequest does not require titles on template-backed blocks in multi-block scopes', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: {
      title: 'Employees',
    },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['usersTable', 'summaryDetails']],
        },
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            fields: ['nickname'],
            template: { uid: 'tpl-users-table', mode: 'reference' },
          },
          {
            key: 'summaryDetails',
            type: 'details',
            collection: 'users',
            fields: ['nickname'],
            template: { uid: 'tpl-users-details', mode: 'reference' },
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.some((issue) => issue.ruleId === 'multi-block-data-title-required'), false);
});

test('prepareApplyBlueprintRequest preserves normal titles when mixed with a template-backed data block', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: {
      title: 'Employees',
    },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['usersTable', 'summaryDetails']],
        },
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            settings: {
              title: 'Employees settings title',
            },
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            collection: 'users',
            fields: ['nickname'],
            template: { uid: 'tpl-users-details', mode: 'reference' },
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const [normalBlock, templateBackedBlock] = result.cliBody.tabs[0].blocks;
  assert.equal(normalBlock.title, 'Employees table');
  assert.equal(normalBlock.settings.title, 'Employees settings title');
  assert.equal(Object.hasOwn(templateBackedBlock, 'title'), false);
});

test('prepareApplyBlueprintRequest requires normal data titles when mixed with a template-backed data block', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: {
      title: 'Employees',
    },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['usersTable', 'summaryDetails']],
        },
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            collection: 'users',
            fields: ['nickname'],
            template: { uid: 'tpl-users-details', mode: 'reference' },
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'multi-block-data-title-required' && issue.path === 'tabs[0].blocks[0].title',
    ),
  );
  assert.equal(
    result.errors.some(
      (issue) => issue.ruleId === 'multi-block-data-title-required' && issue.path === 'tabs[0].blocks[1].title',
    ),
    false,
  );
});

test('prepareApplyBlueprintRequest strips titles from a single popup data block scope', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
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
            title: 'Users table',
            collection: 'users',
            fields: ['nickname'],
            actions: [defaultFilterAction()],
            recordActions: [
              {
                type: 'view',
                title: 'View',
                popup: {
                  title: 'User details',
                  blocks: [
                    {
                      key: 'userDetails',
                      type: 'details',
                      title: 'Profile',
                      collection: 'users',
                      settings: {
                        title: 'Profile settings title',
                        description: 'Keep popup block description',
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
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const popup = result.cliBody.tabs[0].blocks[0].recordActions[0].popup;
  const popupBlock = popup.blocks[0];
  assert.equal(popup.title, 'User details');
  assert.equal(Object.hasOwn(popupBlock, 'title'), false);
  assert.equal(Object.hasOwn(popupBlock.settings, 'title'), false);
  assert.equal(popupBlock.settings.description, 'Keep popup block description');
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

test('prepareApplyBlueprintRequest preserves titles when multiple data blocks share one scope', () => {
  const result = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        layout: {
          rows: [['mainTable', 'summaryDetails']],
        },
        blocks: [
          {
            key: 'mainTable',
            type: 'table',
            title: 'Employees table',
            collection: 'users',
            settings: {
              title: 'Employees settings title',
            },
            fields: ['nickname'],
          },
          {
            key: 'summaryDetails',
            type: 'details',
            title: 'Employee summary',
            collection: 'users',
            settings: {
              title: 'Summary settings title',
            },
            fields: ['nickname'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.cliBody.tabs[0].blocks[0].title, 'Employees table');
  assert.equal(result.cliBody.tabs[0].blocks[0].settings.title, 'Employees settings title');
  assert.equal(result.cliBody.tabs[0].blocks[1].title, 'Employee summary');
  assert.equal(result.cliBody.tabs[0].blocks[1].settings.title, 'Summary settings title');
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

test('prepareApplyBlueprintRequest accepts field groups on large field-grid blocks without ascii output', () => {
  const result = prepareApplyBlueprintRequest({
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
                view: { name: 'Department details', description: 'View one department record.' },
                addNew: { name: 'Create department', description: 'Create one department record.' },
                edit: { name: 'Edit department', description: 'Edit one department record.' },
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
  }, { collectionMetadata });

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result, 'ascii'), false);
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

test('prepareApplyBlueprintRequest preserves grouped field popups in cliBody', () => {
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

test('prepareApplyBlueprintRequest rejects one-level relation shorthand fields on table display blocks without popup', () => {
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
            fields: ['nickname', 'roles'],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'display-association-field-popup-required'
        && issue.path === 'tabs[0].blocks[0].fields[1]'
        && issue.message.includes('"roles"'),
    ),
  );
});

test('prepareApplyBlueprintRequest does not treat collectionName metadata as a relation target', () => {
  const productCollectionMetadata = {
    collections: {
      products: {
        titleField: 'name',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', type: 'integer', interface: 'number', collectionName: 'products' },
          { name: 'name', type: 'string', interface: 'input', collectionName: 'products' },
          { name: 'website', type: 'string', interface: 'url', collectionName: 'products' },
          { name: 'category', type: 'string', interface: 'select', collectionName: 'products' },
          { name: 'legacyTargetCode', type: 'string', interface: 'input', target: 'legacyTargets', collectionName: 'products' },
          { name: 'product', type: 'belongsTo', interface: 'm2o', target: 'products', collectionName: 'products' },
        ],
      },
    },
  };

  const ordinaryFields = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Products' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'productsTable',
              type: 'table',
              collection: 'products',
              fields: ['name', 'website', 'category', 'legacyTargetCode'],
              actions: [defaultFilterAction(['name', 'website', 'category'])],
            },
          ],
        },
      ],
    },
    { collections: ['products'], collectionMetadata: productCollectionMetadata },
  );

  assert.equal(ordinaryFields.ok, true);
  assert.equal(
    ordinaryFields.errors.some((issue) => issue.ruleId === 'display-association-field-popup-required'),
    false,
  );
  assert.deepEqual(ordinaryFields.cliBody.tabs[0].blocks[0].fields, ['name', 'website', 'category', 'legacyTargetCode']);
  assert.deepEqual(ordinaryFields.defaultsRequirements?.associations || [], []);

  const relationField = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Products' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'productsTable',
              type: 'table',
              collection: 'products',
              fields: ['name', 'product'],
              actions: [defaultFilterAction(['name', 'website', 'category'])],
            },
          ],
        },
      ],
    },
    { collections: ['products'], collectionMetadata: productCollectionMetadata },
  );

  assert.equal(relationField.ok, false);
  assert.ok(
    relationField.errors.some(
      (issue) =>
        issue.ruleId === 'display-association-field-popup-required'
        && issue.path === 'tabs[0].blocks[0].fields[1]'
        && issue.message.includes('"product"'),
    ),
  );
});

test('prepareApplyBlueprintRequest treats o2o and mbm metadata fields as relations', () => {
  const relationCollectionMetadata = {
    collections: {
      users: {
        titleField: 'nickname',
        filterTargetKey: 'id',
        fields: [
          { name: 'nickname', type: 'string', interface: 'input' },
          { name: 'profile', type: 'string', interface: 'o2o' },
          { name: 'teams', type: 'string', interface: 'mbm' },
        ],
      },
    },
  };

  for (const fieldName of ['profile', 'teams']) {
    const result = prepareWithDirectCollectionDefaults(
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
                fields: ['nickname', fieldName],
                actions: [defaultFilterAction(['nickname'])],
              },
            ],
          },
        ],
      },
      { collectionMetadata: relationCollectionMetadata },
    );

    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some(
        (issue) =>
          issue.ruleId === 'display-association-field-popup-required'
          && issue.path === 'tabs[0].blocks[0].fields[1]'
          && issue.message.includes(`"${fieldName}"`),
      ),
    );
  }
});

test('prepareApplyBlueprintRequest rejects one-level relation field objects on details blocks when popup is omitted', () => {
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
            fields: [
              {
                field: 'roles',
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
        issue.ruleId === 'display-association-field-popup-required'
        && issue.path === 'tabs[0].blocks[0].fields[0]'
        && issue.message.includes('"roles"'),
    ),
  );
});

test('prepareApplyBlueprintRequest rejects inherited currentRecord relation fields when popup is omitted', () => {
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
            fields: ['nickname'],
            actions: [defaultFilterAction()],
            recordActions: [
              {
                type: 'view',
                popup: {
                  title: 'User details',
                  blocks: [
                    {
                      key: 'userDetails',
                      type: 'details',
                      resource: { binding: 'currentRecord' },
                      fields: ['roles'],
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
      (issue) =>
        issue.ruleId === 'display-association-field-popup-required'
        && issue.path === 'tabs[0].blocks[0].recordActions[0].popup.blocks[0].fields[0]'
        && issue.message.includes('"roles"'),
    ),
  );
});

test('prepareApplyBlueprintRequest rejects one-level relation fieldGroups entries on details blocks when popup is omitted', () => {
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
                title: 'Assignments',
                fields: [
                  {
                    field: 'roles',
                  },
                ],
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
        issue.ruleId === 'display-association-field-popup-required'
        && issue.path === 'tabs[0].blocks[0].fieldGroups[0].fields[0]'
        && issue.message.includes('"roles"'),
    ),
  );
});

test('prepareApplyBlueprintRequest allows one-level relation fields on editForm blocks without popup', () => {
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
            fields: ['username', 'roles'],
            actions: ['submit'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].fields, ['username', 'roles']);
});

test('prepareApplyBlueprintRequest accepts canonical relation field details popup binding', () => {
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
              'nickname',
              {
                field: 'roles',
                popup: {
                  title: 'Role details',
                  blocks: [
                    {
                      key: 'roleDetails',
                      type: 'details',
                      resource: { binding: 'currentRecord', collectionName: 'roles' },
                      fields: ['title', 'name'],
                    },
                  ],
                },
              },
            ],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.cliBody.tabs[0].blocks[0].fields[1].popup.blocks[0].resource.binding, 'currentRecord');
});

test('prepareApplyBlueprintRequest normalizes legacy relation field details popup to currentRecord', () => {
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
              'nickname',
              {
                field: 'roles',
                popup: {
                  title: 'Role details',
                  blocks: [
                    {
                      key: 'roleDetails',
                      type: 'details',
                      collection: 'roles',
                      fields: ['title', 'name'],
                    },
                  ],
                },
              },
            ],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.cliBody.tabs[0].blocks[0].fields[1].popup.blocks[0].resource.binding, 'currentRecord');
  assert.equal(result.cliBody.tabs[0].blocks[0].fields[1].popup.blocks[0].collection, 'roles');
});

test('prepareApplyBlueprintRequest rejects relation field details popup with mismatched target collection', () => {
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
                field: 'roles',
                popup: {
                  title: 'Role details',
                  blocks: [
                    {
                      key: 'departmentDetails',
                      type: 'details',
                      collection: 'departments',
                      fields: ['title'],
                    },
                  ],
                },
              },
            ],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'relation-popup-current-record-target-mismatch'
        && issue.path === 'tabs[0].blocks[0].fields[0].popup.blocks[0].resource.collectionName',
    ),
  );
});

test('prepareApplyBlueprintRequest keeps relation titleField guard inside inherited relation popup surface context when target titleField falls back to id', () => {
  const nestedRelationCollectionMetadata = {
    collections: {
      users: {
        titleField: 'nickname',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', type: 'integer', interface: 'number' },
          { name: 'nickname', type: 'string', interface: 'input' },
          { name: 'roles', type: 'belongsToMany', interface: 'm2m', target: 'roles' },
        ],
      },
      roles: {
        titleField: 'name',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', type: 'integer', interface: 'number' },
          { name: 'name', type: 'string', interface: 'input' },
          { name: 'department', type: 'belongsTo', interface: 'm2o', target: 'departments' },
        ],
      },
      departments: {
        filterTargetKey: 'id',
        fields: [
          { name: 'id', type: 'integer', interface: 'number' },
          { name: 'title', type: 'string', interface: 'input' },
        ],
      },
    },
  };

  const missing = prepareWithDirectCollectionDefaults({
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
                  title: 'Role details',
                  blocks: [
                    {
                      key: 'roleDetails',
                      type: 'details',
                      resource: { binding: 'currentRecord' },
                      fields: [
                        {
                          field: 'department',
                          fieldType: 'popupSubTable',
                          fields: ['title'],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  }, { collectionMetadata: nestedRelationCollectionMetadata });

  assert.equal(missing.ok, false);
  assert.ok(
    missing.errors.some(
      (issue) => issue.ruleId === 'relation-field-title-field-required-when-collection-title-is-id'
        && issue.path === 'tabs[0].blocks[0].fields[0].popup.blocks[0].fields[0].titleField',
    ),
  );
});

test('prepareApplyBlueprintRequest accepts relation field popup table with associatedRecords binding', () => {
  const relationPopupCollectionMetadata = {
    collections: {
      ...collectionMetadata.collections,
      roles: minimalRoleCollectionMetadata.collections.roles,
    },
  };
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
                field: 'roles',
                popup: {
                  title: 'Role links',
                  blocks: [
                    {
                      key: 'rolesTable',
                      type: 'table',
                      resource: {
                        binding: 'associatedRecords',
                        associationField: 'roles',
                        collectionName: 'roles',
                      },
                      fields: ['name'],
                      actions: [defaultFilterAction(['name'])],
                      defaultFilter: defaultFilterGroup(['name']),
                    },
                  ],
                },
              },
            ],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  }, { collectionMetadata: relationPopupCollectionMetadata });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.cliBody.tabs[0].blocks[0].fields[0].popup.blocks[0].resource.binding, 'associatedRecords');
  assert.equal(result.cliBody.tabs[0].blocks[0].fields[0].popup.blocks[0].resource.associationField, 'roles');
});

test('prepareApplyBlueprintRequest rejects relation field popup table without associatedRecords binding', () => {
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
                field: 'roles',
                popup: {
                  title: 'Role links',
                  blocks: [
                    {
                      key: 'rolesTable',
                      type: 'table',
                      collection: 'roles',
                      fields: ['title'],
                      actions: [defaultFilterAction(['title'])],
                      defaultFilter: defaultFilterGroup(['title']),
                    },
                  ],
                },
              },
            ],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'relation-popup-associated-records-binding-required'
        && issue.path === 'tabs[0].blocks[0].fields[0].popup.blocks[0].resource.binding',
    ),
  );
});

test('prepareApplyBlueprintRequest does not apply relation popup binding rules to scalar field popups', () => {
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
                field: 'nickname',
                popup: {
                  title: 'Nickname details',
                  blocks: [
                    {
                      key: 'userDetails',
                      type: 'details',
                      collection: 'users',
                      fields: ['nickname'],
                    },
                  ],
                },
              },
            ],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.length, 0);
});

test('prepareApplyBlueprintRequest allows dotted relation display fields without popup', () => {
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
            fields: ['nickname', 'department.title'],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].fields, ['nickname', 'department.title']);
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

test('prepareApplyBlueprintRequest normalizes settings.sort alias to settings.sorting', () => {
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
            settings: { sort: ['-createdAt', 'nickname'] },
            fields: ['nickname'],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(Object.hasOwn(result.cliBody.tabs[0].blocks[0].settings, 'sort'), false);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].settings.sorting, [
    { field: 'createdAt', direction: 'desc' },
    { field: 'nickname', direction: 'asc' },
  ]);
});

test('prepareApplyBlueprintRequest rejects conflicting settings.sort and settings.sorting', () => {
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
            settings: {
              sort: ['-createdAt'],
              sorting: [{ field: 'nickname', direction: 'asc' }],
            },
            fields: ['nickname'],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.ruleId === 'settings-sort-sorting-conflict'
        && issue.path === 'tabs[0].blocks[0].settings.sort',
    ),
  );
});

test('prepareApplyBlueprintRequest removes settings.sort when it matches settings.sorting', () => {
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
            settings: {
              sort: ['-createdAt'],
              sorting: [{ field: 'createdAt', direction: 'desc' }],
            },
            fields: ['nickname'],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(Object.hasOwn(result.cliBody.tabs[0].blocks[0].settings, 'sort'), false);
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].settings.sorting, [{ field: 'createdAt', direction: 'desc' }]);
});

test('prepareApplyBlueprintRequest replaces invalid tree table dragSortBy with a compatible sort field', () => {
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Roles' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'rolesTable',
              type: 'table',
              collection: 'roles',
              settings: { treeTable: true, dragSort: true, dragSortBy: 'sortOrder' },
              fields: ['name'],
              actions: [defaultFilterAction(['name'])],
            },
          ],
        },
      ],
    },
    {
      collections: ['roles'],
      collectionMetadata: {
        collections: {
          roles: {
            titleField: 'name',
            filterTargetKey: 'id',
            fields: [
              { name: 'id', type: 'integer', interface: 'number' },
              { name: 'name', type: 'string', interface: 'input' },
              { name: 'sortOrder', type: 'integer', interface: 'integer' },
              { name: 'sort', type: 'integer', interface: 'sort' },
            ],
          },
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].settings.dragSortBy, 'sort');
  assert.equal(result.cliBody.tabs[0].blocks[0].settings.dragSort, true);
  assert.ok(result.warnings.includes('Replaced tree table dragSortBy "sortOrder" with sort field "sort".'));
});

test('prepareApplyBlueprintRequest removes invalid tree table dragSortBy when no compatible sort field exists', () => {
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Roles' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'rolesTable',
              type: 'table',
              collection: 'roles',
              settings: { treeTable: true, dragSort: true, dragSortBy: 'sortOrder' },
              fields: ['name'],
              actions: [defaultFilterAction(['name'])],
            },
          ],
        },
      ],
    },
    {
      collections: ['roles'],
      collectionMetadata: {
        collections: {
          roles: {
            titleField: 'name',
            filterTargetKey: 'id',
            fields: [
              { name: 'id', type: 'integer', interface: 'number' },
              { name: 'name', type: 'string', interface: 'input' },
              { name: 'sortOrder', type: 'integer', interface: 'integer' },
            ],
          },
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.cliBody.tabs[0].blocks[0].settings, 'dragSortBy'), false);
  assert.equal(result.cliBody.tabs[0].blocks[0].settings.dragSort, true);
  assert.ok(
    result.warnings.includes(
      'Removed tree table dragSortBy "sortOrder" because no compatible interface=sort field exists.',
    ),
  );
});

test('prepareApplyBlueprintRequest keeps valid tree table dragSortBy sort fields', () => {
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Roles' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'rolesTable',
              type: 'table',
              collection: 'roles',
              settings: { treeTable: true, dragSort: true, dragSortBy: 'sort' },
              fields: ['name'],
              actions: [defaultFilterAction(['name'])],
            },
          ],
        },
      ],
    },
    {
      collections: ['roles'],
      collectionMetadata: {
        collections: {
          roles: {
            titleField: 'name',
            filterTargetKey: 'id',
            fields: [
              { name: 'id', type: 'integer', interface: 'number' },
              { name: 'name', type: 'string', interface: 'input' },
              { name: 'sort', type: 'integer', interface: 'sort' },
            ],
          },
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].settings.dragSortBy, 'sort');
  assert.equal(result.warnings.some((warning) => warning.includes('tree table dragSortBy')), false);
});

test('prepareApplyBlueprintRequest does not rewrite invalid dragSortBy on ordinary tables', () => {
  const result = prepareWithDirectCollectionDefaults(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Roles' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'rolesTable',
              type: 'table',
              collection: 'roles',
              settings: { dragSort: true, dragSortBy: 'sortOrder' },
              fields: ['name'],
              actions: [defaultFilterAction(['name'])],
            },
          ],
        },
      ],
    },
    {
      collections: ['roles'],
      collectionMetadata: {
        collections: {
          roles: {
            titleField: 'name',
            filterTargetKey: 'id',
            fields: [
              { name: 'id', type: 'integer', interface: 'number' },
              { name: 'name', type: 'string', interface: 'input' },
              { name: 'sortOrder', type: 'integer', interface: 'integer' },
              { name: 'sort', type: 'integer', interface: 'sort' },
            ],
          },
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].settings.dragSortBy, 'sortOrder');
  assert.equal(result.warnings.some((warning) => warning.includes('tree table dragSortBy')), false);
});

test('prepareApplyBlueprintRequest normalizes settings.sort on sortable non-table blocks and strips unsupported calendar sort', () => {
  for (const { type, settings, expected } of [
    {
      type: 'details',
      settings: { sort: ['-createdAt'] },
      expected: [{ field: 'createdAt', direction: 'desc' }],
    },
    {
      type: 'tree',
      settings: { sort: [{ field: 'nickname', direction: 'descending' }] },
      expected: [{ field: 'nickname', direction: 'desc' }],
    },
    {
      type: 'map',
      settings: { sort: ['nickname'] },
      expected: [{ field: 'nickname', direction: 'asc' }],
    },
    {
      type: 'gridCard',
      settings: { sort: ['-createdAt'] },
      expected: [{ field: 'createdAt', direction: 'desc' }],
    },
  ]) {
    const result = prepareWithDirectCollectionDefaults({
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: `${type}Block`,
              type,
              collection: 'users',
              settings,
              fields: ['nickname'],
            },
          ],
        },
      ],
    });

    assert.equal(result.ok, true, `${type}: ${JSON.stringify(result.errors)}`);
    assert.equal(Object.hasOwn(result.cliBody.tabs[0].blocks[0].settings, 'sort'), false);
    assert.deepEqual(result.cliBody.tabs[0].blocks[0].settings.sorting, expected);
  }

  const calendar = prepareWithDirectCollectionDefaults({
    version: '1',
    mode: 'create',
    page: { title: 'Events' },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'eventsCalendar',
            type: 'calendar',
            collection: 'calendar_events',
            settings: { sort: ['-createdAt'] },
            defaultFilter: defaultFilterGroup(['title', 'status', 'startAt']),
          },
        ],
      },
    ],
  }, { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false });

  assert.equal(calendar.ok, true, JSON.stringify(calendar.errors));
  assert.equal(calendar.cliBody.tabs[0].blocks[0].settings.sort, undefined);
  assert.equal(calendar.cliBody.tabs[0].blocks[0].settings.sorting, undefined);
  assert.equal(calendar.cliBody.tabs[0].blocks[0].settings.quickCreatePopup.tryTemplate, true);
  assert.equal(calendar.cliBody.tabs[0].blocks[0].settings.eventPopup.tryTemplate, true);
});

test('prepareApplyBlueprintRequest strips top-level pagination and sorting compatibility keys from cliBody', () => {
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
            pageSize: 50,
            sort: ['nickname'],
            sorting: [{ field: 'createdAt', direction: 'desc' }],
            settings: {
              pageSize: 20,
              sorting: [{ field: 'updatedAt', direction: 'desc' }],
            },
            fields: ['nickname'],
            actions: [defaultFilterAction()],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const block = result.cliBody.tabs[0].blocks[0];
  assert.equal(Object.hasOwn(block, 'pageSize'), false);
  assert.equal(Object.hasOwn(block, 'sort'), false);
  assert.equal(Object.hasOwn(block, 'sorting'), false);
  assert.equal(block.settings.pageSize, 20);
  assert.deepEqual(block.settings.sorting, [{ field: 'updatedAt', direction: 'desc' }]);
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
  const result = prepareWithDirectCollectionDefaults(
    buildPopupModeBlueprint({
      title: 'User details',
      blocks: buildFourBlockPopupBlocks(),
      layout: buildFourBlockPopupLayout(),
    }),
    { collections: ['users', 'roles'] },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, 'page');
});

test('prepareApplyBlueprintRequest defaults first-layer popups with more than twenty direct effective fields to page mode', () => {
  const result = prepareWithDirectCollectionDefaults(
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
    { collections: ['users', 'roles'] },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, 'page');
});

test('prepareApplyBlueprintRequest keeps popup mode unset at the auto-page thresholds', () => {
  const exactBlockThreshold = prepareWithDirectCollectionDefaults(
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
    { collections: ['users', 'roles'] },
  );
  assert.equal(exactBlockThreshold.ok, true);
  assert.equal(exactBlockThreshold.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);

  const exactFieldThreshold = prepareWithDirectCollectionDefaults(
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
    { collections: ['users', 'roles'] },
  );
  assert.equal(exactFieldThreshold.ok, true);
  assert.equal(exactFieldThreshold.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);
});

test('prepareApplyBlueprintRequest does not auto-upgrade nested popups to page mode', () => {
  const result = prepareWithDirectCollectionDefaults(
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
    { collections: ['users', 'roles'] },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);
  assert.equal(
    result.cliBody.tabs[0].blocks[0].recordActions[0].popup.blocks[0].fields[1].popup.mode,
    undefined,
  );
});

test('prepareApplyBlueprintRequest does not auto-upgrade nested calendar hidden popups to page mode', () => {
  const nestedCalendarCollectionMetadata = {
    collections: {
      users: {
        ...calendarCollectionMetadata.collections.users,
        fields: [
          ...calendarCollectionMetadata.collections.users.fields,
          { name: 'email', type: 'string', interface: 'input' },
        ],
      },
    },
  };
  const nestedCalendarPopupBlocks = [
    {
      key: 'profile',
      type: 'details',
      title: 'Profile',
      collection: 'users',
      fields: ['nickname'],
    },
    {
      key: 'status',
      type: 'details',
      title: 'Status',
      collection: 'users',
      fields: ['status'],
    },
    {
      key: 'created',
      type: 'details',
      title: 'Created',
      collection: 'users',
      fields: ['createdAt'],
    },
    {
      key: 'updated',
      type: 'details',
      title: 'Updated',
      collection: 'users',
      fields: ['updatedAt'],
    },
  ];
  const result = prepareWithDirectCollectionDefaults(
    buildPopupModeBlueprint({
      title: 'User details',
      blocks: [
        {
          key: 'userCalendar',
          type: 'calendar',
          title: 'User calendar',
          collection: 'users',
          defaultFilter: defaultFilterGroup(['nickname', 'email', 'status']),
          settings: {
            titleField: 'nickname',
            startField: 'createdAt',
            eventPopup: {
              title: 'Nested calendar event',
              blocks: nestedCalendarPopupBlocks,
              layout: {
                rows: [
                  [{ key: 'profile', span: 12 }, { key: 'status', span: 12 }],
                  [{ key: 'created', span: 12 }, { key: 'updated', span: 12 }],
                ],
              },
            },
          },
        },
      ],
    }),
    { collections: ['users'], collectionMetadata: nestedCalendarCollectionMetadata },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);
  assert.equal(
    result.cliBody.tabs[0].blocks[0].recordActions[0].popup.blocks[0].settings.eventPopup.mode,
    undefined,
  );
});

test('prepareApplyBlueprintRequest preserves explicit popup modes on complex first-layer popups', () => {
  for (const explicitMode of ['drawer', 'dialog', 'page']) {
    const result = prepareWithDirectCollectionDefaults(
      buildPopupModeBlueprint({
        title: `User details ${explicitMode}`,
        mode: explicitMode,
        blocks: buildFourBlockPopupBlocks(),
        layout: buildFourBlockPopupLayout(),
      }),
      { collections: ['users', 'roles'] },
    );

    assert.equal(result.ok, true);
    assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, explicitMode);
  }
});

test('prepareApplyBlueprintRequest does not auto-add page mode when a popup template is already bound', () => {
  const result = prepareWithDirectCollectionDefaults(
    buildPopupModeBlueprint({
      title: 'User details',
      template: {
        uid: 'user-details-template',
        mode: 'reference',
      },
      blocks: buildFourBlockPopupBlocks(),
      layout: buildFourBlockPopupLayout(),
    }),
    { collections: ['users', 'roles'] },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].recordActions[0].popup.mode, undefined);
  assert.deepEqual(result.warnings, []);
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
  assert.deepEqual(result.warnings, []);
});

test('prepare-write fails when data-bound blocks are missing collectionMetadata', async () => {
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
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              fields: ['nickname'],
              actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write', '--no-auto-collection-metadata'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.warnings, []);
  assert.equal(payload.defaultsRequirements, undefined);
  assert.equal(payload.cliBody, undefined);
  assert.ok(
    payload.errors.some(
      (issue) => issue.ruleId === 'missing-collection-metadata'
        && issue.path === 'collectionMetadata'
        && issue.message.includes('tabs[0].blocks[0]'),
    ),
  );
});

test('prepare-write auto-resolves collectionMetadata when it is missing', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
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
              defaultFilter: defaultFilterGroup(['nickname']),
              fields: ['nickname'],
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      assert.equal(collectionName, 'users');
      return minimalUserCollectionMetadata;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['users']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.cliBody.collectionMetadata, undefined);
  assert.equal(payload.cliBody.page.title, 'Users');
});

test('prepareApplyBlueprintRequest rejects chart displayTitle before remote applyBlueprint', () => {
  const result = rawPrepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      navigation: {
        group: { title: 'Workspace', icon: 'AppstoreOutlined' },
        item: { title: 'Dashboard', icon: 'DashboardOutlined' },
      },
      page: { title: 'Dashboard' },
      tabs: [
        {
          title: 'Overview',
          blocks: [
            {
              key: 'statusChart',
              type: 'chart',
              title: 'Status chart',
              settings: {
                title: 'Status chart',
                displayTitle: true,
                query: {
                  mode: 'builder',
                  resource: { dataSourceKey: 'main', collectionName: 'users' },
                  measures: [{ field: 'id', aggregation: 'count', alias: 'userCount' }],
                },
                visual: {
                  mode: 'basic',
                  type: 'bar',
                  mappings: { x: 'userCount', y: 'userCount' },
                },
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata: minimalUserCollectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'chart-display-title-unsupported'));
  assert.equal(result.cliBody, undefined);
});

test('prepareApplyBlueprintRequest rejects legacy chart visual builder field keys in assets', () => {
  assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        visual: {
          type: 'bar',
          xField: 'nickname',
          yField: 'userCount',
        },
      }),
    },
    ['chart-visual-legacy-builder-keys-unsupported'],
  );
});

test('prepareApplyBlueprintRequest rejects chart assets missing required visual mappings', () => {
  assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        visual: {
          mode: 'basic',
          type: 'pie',
          mappings: {
            category: 'nickname',
          },
        },
      }),
    },
    ['chart-visual-required-mappings-missing'],
  );
});

test('prepareApplyBlueprintRequest rejects builder chart query without canonical collectionName', () => {
  assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        query: {
          resource: { dataSourceKey: 'main', collection: 'users' },
        },
      }),
    },
    ['chart-builder-query-resource-missing'],
  );
});

test('prepareApplyBlueprintRequest rejects builder chart relation field paths before remote queryData', () => {
  const result = assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        query: {
          measures: [{ field: 'id', aggregation: 'count', alias: 'userCount' }],
          dimensions: [{ field: ['department', 'title'], alias: 'department_title' }],
        },
        visual: {
          mappings: { x: 'department_title', y: 'userCount' },
        },
      }),
    },
    ['chart-builder-relation-field-runtime-unsupported'],
  );

  assert.deepEqual(
    result.errors.find((issue) => issue.ruleId === 'chart-builder-relation-field-runtime-unsupported')?.path,
    'assets.charts.statusChart.query.dimensions[0].field',
  );
});

test('prepareApplyBlueprintRequest keeps scalar builder chart dimensions valid', () => {
  const result = rawPrepareApplyBlueprintRequest(
    buildChartBlueprint({
      asset: buildChartAsset({
        query: {
          dimensions: [{ field: 'department_id', alias: 'department_id' }],
        },
        visual: {
          mappings: { x: 'department_id', y: 'userCount' },
        },
      }),
    }),
    { collectionMetadata: minimalUserCollectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.assets.charts.statusChart.query.dimensions, [
    { field: 'department_id', alias: 'department_id' },
  ]);
});

test('prepareApplyBlueprintRequest rejects chart asset entries that are not objects', () => {
  assertRejectsChartBlueprint(
    {
      asset: 'statusChart',
    },
    ['chart-asset-invalid'],
  );
});

test('prepareApplyBlueprintRequest rejects chart blocks that use internal stepParams or missing chart asset references', () => {
  assertRejectsChartBlueprint(
    {
      block: {
        chart: 'missingChart',
        stepParams: {
          chartSettings: {
            configure: {},
          },
        },
      },
    },
    ['chart-block-step-params-unsupported', 'chart-block-asset-reference-missing'],
  );
});

test('prepareApplyBlueprintRequest rejects basic chart assets without visual type or mappings object', () => {
  assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        visual: { mode: 'basic', type: undefined, mappings: undefined },
      }),
    },
    ['chart-visual-type-missing', 'chart-visual-mappings-missing'],
  );
});

test('prepareApplyBlueprintRequest accepts chart assets with public semantic visual mappings', () => {
  const result = rawPrepareApplyBlueprintRequest(
    buildChartBlueprint({
      asset: buildChartAsset({
        visual: {
          mode: 'basic',
          type: 'pie',
          mappings: {
            category: 'nickname',
            value: 'userCount',
          },
        },
      }),
    }),
    { collectionMetadata: minimalUserCollectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.assets.charts.statusChart.visual.mappings, {
    category: 'nickname',
    value: 'userCount',
  });
});

test('prepareApplyBlueprintRequest rejects custom chart visual without raw option code', () => {
  assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        visual: { mode: 'custom', raw: '' },
      }),
    },
    ['chart-custom-visual-raw-missing'],
  );
});

test('prepareApplyBlueprintRequest rejects custom chart visual mixed with basic visual keys', () => {
  assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        visual: {
          mode: 'custom',
          raw: 'return { series: [] };',
          type: 'bar',
          mappings: { x: 'nickname', y: 'userCount' },
        },
      }),
    },
    ['chart-custom-visual-public-keys-unsupported'],
  );
});

test('prepareApplyBlueprintRequest rejects sql chart query without SQL text', () => {
  assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        query: {
          mode: 'sql',
          resource: undefined,
          measures: undefined,
          dimensions: undefined,
          sql: '',
        },
      }),
    },
    ['chart-sql-query-text-missing'],
  );
});

test('prepareApplyBlueprintRequest rejects sql chart query mixed with builder query keys', () => {
  assertRejectsChartBlueprint(
    {
      asset: buildChartAsset({
        query: {
          mode: 'sql',
          sql: 'select status, count(*) as count_orders from orders group by status',
        },
      }),
    },
    ['chart-sql-query-forbidden-builder-keys'],
  );
});

test('prepare-write resolves unique existing navigation group to routeId', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      navigation: {
        group: { title: 'Workspace', icon: 'AppstoreOutlined' },
        item: { title: 'Users', icon: 'TeamOutlined' },
      },
      page: { title: 'Users' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
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
              defaultFilter: defaultFilterGroup(['nickname']),
              fields: ['nickname'],
            },
          ],
        },
      ],
    }),
  );
  const calls = [];

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      assert.equal(collectionName, 'users');
      return minimalUserCollectionMetadata;
    },
    async execFileImpl(command, args) {
      calls.push([command, ...args]);
      if (args[0] === 'api' && args[1] === 'resource' && args[2] === 'list' && args.includes('desktopRoutes')) {
        return {
          stdout: JSON.stringify({
            data: [{ id: 42, title: 'Workspace', type: 'group' }],
          }),
        };
      }
      throw new Error(`unexpected command: ${[command, ...args].join(' ')}`);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.cliBody.navigation.group, { routeId: 42 });
  assert.ok(payload.warnings.some((warning) => /Resolved existing menu group "Workspace" to routeId 42/.test(warning)));
  assert.ok(calls.some((call) => call.includes('desktopRoutes')));
  assert.equal(calls.some((call) => call[1] === 'env' && call[2] === 'list'), false);
  assert.equal(calls.some((call) => call.includes('--base-url')), false);
});

test('prepare-write ignores navigation group metadata when routeId is present', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      navigation: {
        group: {
          routeId: 42,
          title: 'Ignored workspace title',
          icon: 'NotARealIcon',
          tooltip: 'Ignored tooltip',
          hideInMenu: true,
        },
        item: { title: 'Users', icon: 'TeamOutlined' },
      },
      page: { title: 'Users' },
      tabs: [
        {
          title: 'Overview',
          blocks: [{ key: 'note', type: 'markdown', content: 'Hello' }],
        },
      ],
    },
    { collectionMetadata: minimalUserCollectionMetadata },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.navigation.group, { routeId: 42 });
  assert.equal(result.errors.some((issue) => issue.ruleId === 'invalid-menu-group-icon'), false);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'missing-menu-group-icon'), false);
  assert.ok(
    result.warnings.some((warning) =>
      /navigation\.group\.routeId has highest priority; title\/icon\/tooltip\/hideInMenu are ignored/.test(warning),
    ),
  );
});

test('prepare-write fails before applyBlueprint for ambiguous navigation group title', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      navigation: {
        group: { title: 'Workspace', icon: 'AppstoreOutlined' },
        item: { title: 'Users', icon: 'TeamOutlined' },
      },
      page: { title: 'Users' },
      tabs: [
        {
          title: 'Overview',
          blocks: [{ key: 'note', type: 'markdown', content: 'Hello' }],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      if (args[0] === 'api' && args[1] === 'resource' && args[2] === 'list' && args.includes('desktopRoutes')) {
        return {
          stdout: JSON.stringify({
            data: [
              { id: 42, title: 'Workspace', type: 'group' },
              { id: 43, title: 'Workspace', type: 'group' },
            ],
          }),
        };
      }
      throw new Error(`unexpected command: ${[command, ...args].join(' ')}`);
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(payload.errors.some((issue) => issue.ruleId === 'navigation-group-title-ambiguous'));
});

test('prepare-write resolves navigation group even when auto collection metadata is disabled', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      navigation: {
        group: { title: 'Workspace', icon: 'AppstoreOutlined' },
        item: { title: 'Notes', icon: 'FileTextOutlined' },
      },
      page: { title: 'Notes' },
      tabs: [
        {
          title: 'Overview',
          blocks: [{ key: 'note', type: 'markdown', content: 'Hello' }],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write', '--no-auto-collection-metadata'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      if (args[0] === 'api' && args[1] === 'resource' && args[2] === 'list' && args.includes('desktopRoutes')) {
        return {
          stdout: JSON.stringify({
            data: [{ id: 42, title: 'Workspace', type: 'group' }],
          }),
        };
      }
      throw new Error(`unexpected command: ${[command, ...args].join(' ')}`);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.cliBody.navigation.group, { routeId: 42 });
});

test('prepare-write does not fetch when complete collectionMetadata is supplied', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Users' },
        defaults: {
          collections: {
            users: {
              popups: buildFixedCollectionPopupDefaults('users'),
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
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname'],
              },
            ],
          },
        ],
      },
      collectionMetadata: minimalUserCollectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      throw new Error(`unexpected fetch for ${collectionName}`);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, []);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.cliBody.collectionMetadata, undefined);
});

test('prepare-write only fetches missing collectionMetadata entries', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Users and roles' },
        defaults: {
          collections: {
            users: {
              popups: buildFixedCollectionPopupDefaults('users'),
            },
            roles: {
              popups: buildFixedCollectionPopupDefaults('roles'),
            },
          },
        },
        tabs: [
          {
            title: 'Overview',
            layout: {
              rows: [['usersTable', 'rolesTable']],
            },
            blocks: [
              {
                key: 'usersTable',
                type: 'table',
                title: 'Users',
                collection: 'users',
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname'],
              },
              {
                key: 'rolesTable',
                type: 'table',
                title: 'Roles',
                collection: 'roles',
                defaultFilter: defaultFilterGroup(['name']),
                fields: ['name'],
              },
            ],
          },
        ],
      },
      collectionMetadata: minimalUserCollectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      assert.equal(collectionName, 'roles');
      return minimalRoleCollectionMetadata;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['roles']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
});

test('prepare-write fetches missing metadata from calendar hidden popup blocks', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Calendar popup metadata' },
        defaults: {
          collections: {
            users: {
              popups: buildFixedCollectionPopupDefaults('users'),
            },
            roles: {
              popups: buildFixedCollectionPopupDefaults('roles'),
            },
          },
        },
        tabs: [
          {
            title: 'Schedule',
            blocks: [
              {
                key: 'usersCalendar',
                type: 'calendar',
                collection: 'users',
                defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
                settings: {
                  titleField: 'nickname',
                  startField: 'createdAt',
                  quickCreatePopup: {
                    title: 'Create role from calendar',
                    blocks: [
                      {
                        key: 'roleCreateForm',
                        type: 'createForm',
                        collection: 'roles',
                        fields: ['name'],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      collectionMetadata: calendarCollectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      assert.equal(collectionName, 'roles');
      return minimalRoleCollectionMetadata;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['roles']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.cliBody.tabs[0].blocks[0].settings.quickCreatePopup.blocks[0].collection, 'roles');
});

test('prepare-write fetches missing metadata from calendar event popup blocks', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Calendar event popup metadata' },
        defaults: {
          collections: {
            users: {
              popups: buildFixedCollectionPopupDefaults('users'),
            },
            roles: {
              popups: buildFixedCollectionPopupDefaults('roles'),
            },
          },
        },
        tabs: [
          {
            title: 'Schedule',
            blocks: [
              {
                key: 'usersCalendar',
                type: 'calendar',
                collection: 'users',
                defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
                settings: {
                  titleField: 'nickname',
                  startField: 'createdAt',
                  eventPopup: {
                    title: 'Role details from event',
                    blocks: [
                      {
                        key: 'roleDetails',
                        type: 'details',
                        collection: 'roles',
                        fields: ['name'],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      collectionMetadata: calendarCollectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      assert.equal(collectionName, 'roles');
      return minimalRoleCollectionMetadata;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['roles']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.cliBody.tabs[0].blocks[0].settings.eventPopup.blocks[0].collection, 'roles');
  assert.deepEqual(
    payload.defaultsRequirements.collections.map((entry) => entry.collection),
    ['roles', 'users'],
  );
});

test('prepare-write reports missing metadata from calendar hidden popup blocks when auto metadata is disabled', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      page: { title: 'Calendar popup metadata required' },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                eventPopup: {
                  title: 'Role details from event',
                  blocks: [
                    {
                      key: 'roleDetails',
                      type: 'details',
                      collection: 'roles',
                      fields: ['name'],
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write', '--no-auto-collection-metadata'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(
    payload.errors.some(
      (issue) => issue.ruleId === 'missing-collection-metadata'
        && issue.path === 'collectionMetadata'
        && issue.message.includes('tabs[0].blocks[0].settings.eventPopup.blocks[0]'),
    ),
  );
});

test('prepare-write fetches missing metadata from kanban hidden popup blocks', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Kanban popup metadata' },
        defaults: {
          collections: {
            users: {
              popups: buildFixedCollectionPopupDefaults('users'),
            },
            roles: {
              popups: buildFixedCollectionPopupDefaults('roles'),
            },
          },
        },
        tabs: [
          {
            title: 'Pipeline',
            blocks: [
              {
                key: 'usersKanban',
                type: 'kanban',
                collection: 'users',
                fields: ['nickname', 'status'],
                defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
                settings: {
                  cardPopup: {
                    title: 'Role details from card',
                    blocks: [
                      {
                        key: 'roleDetails',
                        type: 'details',
                        collection: 'roles',
                        fields: ['name'],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      collectionMetadata: {
        collections: {
          users: collectionMetadata.collections.users,
        },
      },
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      assert.equal(collectionName, 'roles');
      return minimalRoleCollectionMetadata;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['roles']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.cliBody.tabs[0].blocks[0].settings.cardPopup.blocks[0].collection, 'roles');
  assert.deepEqual(
    payload.defaultsRequirements.collections.map((entry) => entry.collection),
    ['roles', 'users'],
  );
});

test('prepare-write reports missing metadata from kanban hidden popup blocks when auto metadata is disabled', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      version: '1',
      mode: 'create',
      page: { title: 'Kanban popup metadata required' },
      tabs: [
        {
          title: 'Pipeline',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              collection: 'users',
              fields: ['nickname', 'status'],
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              settings: {
                cardPopup: {
                  title: 'Role details from card',
                  blocks: [
                    {
                      key: 'roleDetails',
                      type: 'details',
                      collection: 'roles',
                      fields: ['name'],
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write', '--no-auto-collection-metadata'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(
    payload.errors.some(
      (issue) => issue.ruleId === 'missing-collection-metadata'
        && issue.path === 'collectionMetadata'
        && issue.message.includes('tabs[0].blocks[0].settings.cardPopup.blocks[0]'),
    ),
  );
});

test('prepare-write resolves data-bound collections inside popups', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Users popup' },
        defaults: {
          collections: {
            users: {
              popups: buildFixedCollectionPopupDefaults('users'),
            },
            roles: {
              popups: buildFixedCollectionPopupDefaults('roles'),
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
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname'],
                recordActions: [
                  {
                    type: 'view',
                    popup: {
                      title: 'User roles',
                      blocks: [
                        {
                          key: 'rolesTable',
                          type: 'table',
                          title: 'Roles',
                          collection: 'roles',
                          defaultFilter: defaultFilterGroup(['name']),
                          fields: ['name'],
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
      collectionMetadata: minimalUserCollectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      assert.equal(collectionName, 'roles');
      return minimalRoleCollectionMetadata;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['roles']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
});

test('prepare-write recursively resolves association target collection metadata', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Users departments' },
        defaults: {
          collections: {
            users: {
              popups: {
                ...buildFixedCollectionPopupDefaults('users'),
                associations: {
                  department: buildFixedCollectionPopupDefaults('department'),
                },
              },
            },
            departments: {
              popups: buildFixedCollectionPopupDefaults('departments'),
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
                  'nickname',
                  {
                    field: 'department',
                    popup: {
                      title: 'Department',
                      blocks: [
                        {
                          key: 'departmentDetails',
                          type: 'details',
                          collection: 'departments',
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
      },
      collectionMetadata: userDepartmentAssociationMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      assert.equal(collectionName, 'departments');
      return minimalDepartmentCollectionMetadata;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['departments']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
});

test('prepare-write resolves associatedRecords targets over multiple metadata rounds', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Users roles' },
        defaults: {
          collections: {
            users: {
              popups: {
                ...buildFixedCollectionPopupDefaults('users'),
                associations: {
                  roles: buildFixedCollectionPopupDefaults('roles'),
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
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname'],
                recordActions: [
                  {
                    type: 'view',
                    popup: {
                      title: 'User roles',
                      blocks: [
                        {
                          key: 'userRoles',
                          type: 'table',
                          title: 'Roles',
                          resource: {
                            binding: 'associatedRecords',
                            associationField: 'roles',
                          },
                          defaultFilter: defaultFilterGroup(['name']),
                          fields: ['name'],
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
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      if (collectionName === 'users') return oneCandidateCollectionMetadata;
      if (collectionName === 'roles') return minimalRoleCollectionMetadata;
      throw new Error(`unexpected fetch for ${collectionName}`);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['users', 'roles']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
});

test('prepare-write resolves multi-hop association field paths over multiple metadata rounds', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Users department managers' },
        defaults: {
          collections: {
            users: {
              popups: {
                ...buildFixedCollectionPopupDefaults('users'),
                associations: {
                  department: buildFixedCollectionPopupDefaults('department'),
                },
              },
            },
            departments: {
              popups: {
                ...buildFixedCollectionPopupDefaults('departments'),
                associations: {
                  manager: buildFixedCollectionPopupDefaults('manager'),
                },
              },
            },
            employees: {
              popups: buildFixedCollectionPopupDefaults('employees'),
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
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname', 'department.manager.name'],
              },
            ],
          },
        ],
      },
      collectionMetadata: userDepartmentAssociationMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      if (collectionName === 'departments') return departmentManagerAssociationMetadata;
      if (collectionName === 'employees') return minimalEmployeeCollectionMetadata;
      throw new Error(`unexpected fetch for ${collectionName}`);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['departments', 'employees']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
});

test('prepare-write resolves associatedRecords targets from associationPathName', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Users roles' },
        defaults: {
          collections: {
            users: {
              popups: {
                ...buildFixedCollectionPopupDefaults('users'),
                associations: {
                  roles: buildFixedCollectionPopupDefaults('roles'),
                },
              },
            },
            roles: {
              popups: buildFixedCollectionPopupDefaults('roles'),
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
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname'],
                recordActions: [
                  {
                    type: 'view',
                    popup: {
                      title: 'User roles',
                      blocks: [
                        {
                          key: 'userRoles',
                          type: 'table',
                          title: 'Roles',
                          resource: {
                            binding: 'associatedRecords',
                            associationPathName: 'roles',
                          },
                          defaultFilter: defaultFilterGroup(['name']),
                          fields: ['name'],
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
      collectionMetadata: oneCandidateCollectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      if (collectionName === 'roles') return minimalRoleCollectionMetadata;
      throw new Error(`unexpected fetch for ${collectionName}`);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, ['roles']);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.cliBody.collectionMetadata, undefined);
});

test('prepare-write keeps fail-closed behavior with no-auto metadata flag', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const fetched = [];
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
              defaultFilter: defaultFilterGroup(['nickname']),
              fields: ['nickname'],
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write', '--no-auto-collection-metadata'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      throw new Error(`unexpected command: ${[command, ...args].join(' ')}`);
    },
    async fetchCollectionMetadata(collectionName) {
      fetched.push(collectionName);
      return minimalUserCollectionMetadata;
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  assert.deepEqual(fetched, []);
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(payload.errors.some((issue) => issue.ruleId === 'missing-collection-metadata'));
});

test('prepare-write falls back to missing collectionMetadata when auto metadata fetch fails', async () => {
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
              defaultFilter: defaultFilterGroup(['nickname']),
              fields: ['nickname'],
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      assert.deepEqual([command, ...args].slice(0, 5), ['nb', 'api', 'data-modeling', 'collections', 'get']);
      throw new Error('metadata fetch unavailable');
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(payload.errors.some((issue) => issue.ruleId === 'missing-collection-metadata'));
  assert.equal(payload.errors.some((issue) => issue.ruleId === 'collection-metadata-fetch-failed'), false);
});

test('prepare-write falls back to missing collectionMetadata when explicit empty metadata cannot be auto-filled', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
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
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname'],
              },
            ],
          },
        ],
      },
      collectionMetadata: emptyPrepareCollectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata() {
      throw new Error('metadata fetch unavailable');
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(payload.errors.some((issue) => issue.ruleId === 'missing-collection-metadata'));
  assert.equal(payload.errors.some((issue) => issue.ruleId === 'collection-metadata-fetch-failed'), false);
});

test('prepare-write falls back to missing collectionMetadata when partial metadata cannot be auto-filled', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
        version: '1',
        mode: 'create',
        page: { title: 'Users and roles' },
        defaults: {
          collections: {
            users: {
              popups: buildFixedCollectionPopupDefaults('users'),
            },
            roles: {
              popups: buildFixedCollectionPopupDefaults('roles'),
            },
          },
        },
        tabs: [
          {
            title: 'Overview',
            layout: {
              rows: [['usersTable', 'rolesTable']],
            },
            blocks: [
              {
                key: 'usersTable',
                type: 'table',
                title: 'Users',
                collection: 'users',
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname'],
              },
              {
                key: 'rolesTable',
                type: 'table',
                title: 'Roles',
                collection: 'roles',
                defaultFilter: defaultFilterGroup(['name']),
                fields: ['name'],
              },
            ],
          },
        ],
      },
      collectionMetadata: minimalUserCollectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata(collectionName) {
      assert.equal(collectionName, 'roles');
      throw new Error('metadata fetch unavailable');
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(payload.errors.some((issue) => issue.ruleId === 'missing-collection-metadata'));
  assert.equal(payload.errors.some((issue) => issue.ruleId === 'collection-metadata-fetch-failed'), false);
  assert.ok(
    payload.defaultsRequirements?.collections?.some((entry) => entry.collection === 'users'),
    'resolved user metadata should still participate in later prepare-write validation',
  );
});

test('prepare-write preserves invalid explicit collectionMetadata errors', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      blueprint: {
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
                defaultFilter: defaultFilterGroup(['nickname']),
                fields: ['nickname'],
              },
            ],
          },
        ],
      },
      collectionMetadata: 'invalid metadata',
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata() {
      throw new Error('unexpected metadata fetch');
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(payload.errors.some((issue) => issue.ruleId === 'invalid-collection-metadata'));
  assert.equal(payload.errors.some((issue) => issue.ruleId === 'collection-metadata-fetch-failed'), false);
});

test('fetchCollectionMetadata falls back to resource list when data-modeling collection get fails', async () => {
  const calls = [];
  const metadata = await fetchCollectionMetadata('users', {
    cwd: process.cwd(),
    async execFileImpl(command, args) {
      calls.push([command, ...args]);
      if (args.includes('data-modeling')) {
        throw new Error('data-modeling unavailable');
      }
      return {
        stdout: JSON.stringify({
          data: [
            {
              name: 'users',
              titleField: 'nickname',
              fields: [
                { name: 'id', type: 'integer', interface: 'number' },
                { name: 'nickname', type: 'string', interface: 'input' },
              ],
            },
          ],
        }),
      };
    },
  });

  assert.deepEqual(calls[0].slice(0, 5), ['nb', 'api', 'data-modeling', 'collections', 'get']);
  assert.equal(calls[0].includes('--base-url'), false);
  assert.deepEqual(calls[1].slice(0, 5), ['nb', 'api', 'resource', 'list', '--resource']);
  assert.equal(calls[1].includes('--base-url'), false);
  assert.equal(metadata.collections.users.fieldsByName.get('nickname').interface, 'input');
});

test('fetchCollectionMetadata uses current nb env without explicit Base URL flag', async () => {
  const calls = [];
  const metadata = await fetchCollectionMetadata('users', {
    cwd: process.cwd(),
    async execFileImpl(command, args) {
      calls.push([command, ...args]);
      return {
        stdout: JSON.stringify({
          data: {
            name: 'users',
            titleField: 'nickname',
            fields: [
              { name: 'id', type: 'integer', interface: 'number' },
              { name: 'nickname', type: 'string', interface: 'input' },
            ],
          },
        }),
      };
    },
  });

  assert.deepEqual(calls[0].slice(0, 5), ['nb', 'api', 'data-modeling', 'collections', 'get']);
  assert.equal(calls[0].includes('--base-url'), false);
  assert.equal(metadata.collections.users.fieldsByName.get('nickname').interface, 'input');
});

test('fetchCollectionMetadata fails when nb responses do not include the requested collection', async () => {
  const calls = [];
  await assert.rejects(
    fetchCollectionMetadata('users', {
      cwd: process.cwd(),
      async execFileImpl(command, args) {
        calls.push([command, ...args]);
        if (args.includes('data-modeling')) {
          return { stdout: JSON.stringify({ data: [] }) };
        }
        return { stdout: JSON.stringify({ rows: [] }) };
      },
    }),
    /collection metadata for "users" was not found/i,
  );

  assert.deepEqual(calls[0].slice(0, 5), ['nb', 'api', 'data-modeling', 'collections', 'get']);
  assert.equal(calls[0].includes('--base-url'), false);
  assert.deepEqual(calls[1].slice(0, 5), ['nb', 'api', 'resource', 'list', '--resource']);
  assert.equal(calls[1].includes('--base-url'), false);
});

test('prepare-write falls back to missing collectionMetadata when auto metadata fetch returns no collection entry', async () => {
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
              defaultFilter: defaultFilterGroup(['nickname']),
              fields: ['nickname'],
            },
          ],
        },
      ],
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async fetchCollectionMetadata() {
      return { collections: {} };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, false);
  assert.equal(payload.cliBody, undefined);
  assert.ok(payload.errors.some((issue) => issue.ruleId === 'missing-collection-metadata'));
  assert.equal(payload.errors.some((issue) => issue.ruleId === 'collection-metadata-fetch-failed'), false);
});

test('prepare-write returns normalized cli body json', async () => {
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
                defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
                fields: ['nickname', 'email'],
                actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
              },
            ],
          },
        ],
      },
      collectionMetadata,
    }),
  );

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
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

test('prepare-write accepts helper envelope with templateDecision', async () => {
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
                defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
                fields: ['nickname'],
                actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
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

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
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
});

test('prepare-write accepts bootstrap-before-bind templateDecision without forcing convert', async () => {
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
                defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
                fields: ['nickname'],
                actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
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

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write'], {
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
});

test('prepare-write accepts explicit expected outer tab count', async () => {
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
                defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
                fields: ['nickname'],
                actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
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

  const exitCode = await runPrepareWriteForTest(['--stdin-json', '--prepare-write', '--expected-outer-tabs', '2'], {
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

test('prepare-write accepts inline equals flags for numeric options', async () => {
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
                defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
                fields: ['nickname'],
                actions: [defaultFilterAction(commonUserDefaultFilterFieldNames)],
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

  const exitCode = await runPrepareWriteForTest([
    '--stdin-json',
    '--prepare-write',
    '--expected-outer-tabs=2',
    '--max-popup-depth=1',
  ], {
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

test('prepareApplyBlueprintRequest requires and accepts block-level defaultFilter on calendar blocks', () => {
  const missing = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar page' },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              collection: 'users',
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                endField: 'updatedAt',
              },
              actions: ['today', 'turnPages', 'title', 'selectView', 'filter', 'addNew'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.some((issue) => issue.ruleId === 'data-surface-block-default-filter-required'), true);

  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(['nickname', 'status']),
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                endField: 'updatedAt',
              },
              actions: ['today', 'turnPages', 'title', 'selectView', 'filter', 'addNew'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.tabs[0].blocks[0].type, 'calendar');
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].defaultFilter, defaultFilterGroup(['nickname', 'status']));
});

test('prepareApplyBlueprintRequest preserves calendar popup settings for hidden popup hosts', () => {
  const quickCreatePopup = {
    mode: 'dialog',
    size: 'large',
  };
  const eventPopup = {
    mode: 'drawer',
    size: 'small',
    template: {
      uid: 'calendar-event-popup-template',
      mode: 'reference',
    },
  };
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                endField: 'updatedAt',
                quickCreatePopup,
                eventPopup,
              },
              actions: ['today', 'turnPages', 'title', 'selectView', 'filter'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].settings.quickCreatePopup, {
    ...quickCreatePopup,
    tryTemplate: true,
  });
  assert.deepEqual(result.cliBody.tabs[0].blocks[0].settings.eventPopup, eventPopup);
});

test('prepareApplyBlueprintRequest normalizes calendar settings to backend-supported keys', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                titleField: 'nickname',
                colorField: 'status',
                startField: 'createdAt',
                endField: 'updatedAt',
                quickCreateEnabled: false,
                quickCreatePopup: {
                  tryTemplate: true,
                },
                eventPopup: {
                  tryTemplate: true,
                },
                cardPopup: {
                  tryTemplate: true,
                },
                enableCardClick: true,
                groupField: 'workMode',
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const settings = result.cliBody.tabs[0].blocks[0].settings;
  assert.equal(settings.quickCreateEnabled, undefined);
  assert.equal(settings.quickCreateEvent, false);
  assert.equal(settings.cardPopup, undefined);
  assert.equal(settings.enableCardClick, undefined);
  assert.equal(settings.groupField, undefined);
  assert.equal(settings.colorField, 'status');
  assert.deepEqual(settings.quickCreatePopup, { tryTemplate: true });
  assert.deepEqual(settings.eventPopup, { tryTemplate: true });
});

test('prepareApplyBlueprintRequest moves top-level calendar field bindings into settings before write', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              collection: 'users',
              titleField: 'nickname',
              colorField: 'nickname',
              startField: 'createdAt',
              endField: 'updatedAt',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                colorField: 'status',
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const calendarBlock = result.cliBody.tabs[0].blocks[0];
  assert.equal(calendarBlock.titleField, undefined);
  assert.equal(calendarBlock.colorField, undefined);
  assert.equal(calendarBlock.startField, undefined);
  assert.equal(calendarBlock.endField, undefined);
  assert.equal(calendarBlock.settings.titleField, 'nickname');
  assert.equal(calendarBlock.settings.colorField, 'status');
  assert.equal(calendarBlock.settings.startField, 'createdAt');
  assert.equal(calendarBlock.settings.endField, 'updatedAt');
});

test('prepareApplyBlueprintRequest auto-adds hidden popup template fallback for calendar and kanban create blocks', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar and kanban page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Work',
          layout: {
            rows: [['usersCalendar', 'usersKanban']],
          },
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              title: 'User schedule',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                endField: 'updatedAt',
              },
              actions: ['today', 'turnPages', 'title', 'selectView', 'filter'],
            },
            {
              key: 'usersKanban',
              type: 'kanban',
              title: 'User board',
              collection: 'users',
              fields: ['nickname', 'status'],
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              actions: ['filter', 'addNew', 'popup', 'refresh'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const [calendarBlock, kanbanBlock] = result.cliBody.tabs[0].blocks;
  assert.equal(calendarBlock.settings.quickCreatePopup.tryTemplate, true);
  assert.equal(calendarBlock.settings.eventPopup.tryTemplate, true);
  assert.equal(calendarBlock.settings.titleField, 'nickname');
  assert.equal(kanbanBlock.settings.quickCreatePopup.tryTemplate, true);
  assert.equal(kanbanBlock.settings.cardPopup.tryTemplate, true);
  assert.equal(kanbanBlock.settings.quickCreateEnabled, true);
  assert.equal(kanbanBlock.settings.enableCardClick, true);
});

test('prepareApplyBlueprintRequest allows kanban blocks without groupField when the collection has no grouping candidates', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Kanban page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Work',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              title: 'User board',
              collection: 'users',
              fields: ['nickname'],
              defaultFilter: defaultFilterGroup(['nickname']),
              actions: ['filter', 'addNew', 'popup', 'refresh'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: minimalUserCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.cliBody.tabs[0].blocks[0].settings.groupField, undefined);
});

test('prepareApplyBlueprintRequest materializes prompt-like users calendar and kanban hidden popups', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: '日历测试12:34:56' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: '日历测试12:34:56',
          layout: {
            rows: [['usersCalendar', 'usersKanban']],
          },
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              title: 'Users calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                endField: 'updatedAt',
              },
            },
            {
              key: 'usersKanban',
              type: 'kanban',
              title: 'Users kanban',
              collection: 'users',
              fields: ['nickname', 'status'],
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const [calendarBlock, kanbanBlock] = result.cliBody.tabs[0].blocks;
  assert.deepEqual(calendarBlock.settings.quickCreatePopup, { tryTemplate: true });
  assert.deepEqual(calendarBlock.settings.eventPopup, { tryTemplate: true });
  assert.deepEqual(kanbanBlock.settings.quickCreatePopup, { tryTemplate: true });
  assert.deepEqual(kanbanBlock.settings.cardPopup, { tryTemplate: true });
  assert.equal(kanbanBlock.settings.quickCreateEnabled, true);
  assert.equal(kanbanBlock.settings.enableCardClick, true);
  assert.deepEqual(
    result.defaultsRequirements.collections.map((entry) => entry.collection),
    ['users'],
  );
});

test('prepareApplyBlueprintRequest rejects unsupported prompt-like calendar and kanban grouping fields', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: '日历测试12:34:56' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: '日历测试12:34:56',
          layout: {
            rows: [['usersCalendar', 'usersKanban']],
          },
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              title: 'Users calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(['nickname', 'accountLevel', 'username']),
              settings: {
                titleField: 'nickname',
                colorField: 'country',
                startField: 'hireDate',
                endField: 'lastLoginAt',
              },
            },
            {
              key: 'usersKanban',
              type: 'kanban',
              title: 'Users kanban',
              collection: 'users',
              fields: ['nickname', 'workMode', 'country'],
              defaultFilter: defaultFilterGroup(['nickname', 'accountLevel', 'username']),
              settings: {
                titleField: 'nickname',
                groupField: 'workMode',
              },
            },
          ],
        },
      ],
    },
    {
      collectionMetadata: {
        collections: {
          users: {
            titleField: 'nickname',
            filterTargetKey: 'id',
            fields: [
              { name: 'id', type: 'integer', interface: 'number' },
              { name: 'nickname', type: 'string', interface: 'input' },
              { name: 'username', type: 'string', interface: 'input' },
              { name: 'accountLevel', type: 'string', interface: 'select' },
              { name: 'workMode', type: 'string', interface: 'radioGroup' },
              { name: 'country', type: 'string', interface: 'input' },
              { name: 'hireDate', type: 'datetime', interface: 'datetime' },
              { name: 'lastLoginAt', type: 'datetime', interface: 'datetime' },
            ],
          },
        },
      },
      injectDataSurfaceDefaultFilter: false,
    },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'calendar-field-binding-invalid'
        && issue.path === 'tabs[0].blocks[0].settings.colorField',
    ),
  );
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'kanban-group-field-invalid'
        && issue.path === 'tabs[0].blocks[1].settings.groupField',
    ),
  );
  assert.equal(result.cliBody, undefined);
});

test('prepareApplyBlueprintRequest rejects large prompt-like calendar and kanban defaults without fieldGroups', () => {
  const result = rawPrepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: '日历测试12:34:56' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: '日历测试12:34:56',
          layout: {
            rows: [['usersCalendar', 'usersKanban']],
          },
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              title: 'Users calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(['nickname', 'title', 'username']),
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                endField: 'updatedAt',
              },
            },
            {
              key: 'usersKanban',
              type: 'kanban',
              title: 'Users kanban',
              collection: 'users',
              fields: ['nickname', 'status'],
              defaultFilter: defaultFilterGroup(['nickname', 'title', 'username']),
            },
          ],
        },
      ],
    },
    { collectionMetadata: largeCalendarCollectionMetadata },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.defaultsRequirements.collections.find((entry) => entry.collection === 'users'),
    {
      collection: 'users',
      popupActions: ['addNew', 'edit', 'view'],
      requiresFieldGroups: true,
      fieldGroupActions: ['addNew', 'edit', 'view'],
    },
  );
  assert.equal(result.cliBody, undefined);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.ruleId === 'missing-default-field-groups'
        && issue.path === 'defaults.collections.users.fieldGroups',
    ),
  );
});

test('prepareApplyBlueprintRequest applies popup template defaults to calendar hidden popup hosts', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              title: 'User schedule',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                endField: 'updatedAt',
                quickCreatePopup: {
                  mode: 'dialog',
                  size: 'large',
                  title: 'Create calendar user',
                  blocks: [
                    {
                      key: 'calendarQuickCreateForm',
                      type: 'createForm',
                      collection: 'users',
                      fields: ['nickname', 'status'],
                    },
                  ],
                },
                eventPopup: {
                  mode: 'drawer',
                  size: 'small',
                  title: 'Calendar user details',
                  template: {
                    uid: 'calendar-event-popup-template',
                    mode: 'reference',
                  },
                },
              },
              actions: ['today', 'turnPages', 'title', 'selectView', 'filter'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const { quickCreatePopup, eventPopup } = result.cliBody.tabs[0].blocks[0].settings;
  assert.equal(quickCreatePopup.mode, 'dialog');
  assert.equal(quickCreatePopup.size, 'large');
  assert.equal(quickCreatePopup.tryTemplate, true);
  assert.equal(quickCreatePopup.saveAsTemplate.name, 'Create calendar user popup template');
  assert.match(
    quickCreatePopup.saveAsTemplate.description,
    /Reusable popup template for action "quick create" on User schedule/i,
  );
  assert.equal(quickCreatePopup.blocks[0].fieldsLayout.rows[0][0].key, 'nickname');
  assert.equal(eventPopup.mode, 'drawer');
  assert.equal(eventPopup.size, 'small');
  assert.deepEqual(eventPopup.template, {
    uid: 'calendar-event-popup-template',
    mode: 'reference',
  });
  assert.equal(Object.hasOwn(eventPopup, 'tryTemplate'), false);
  assert.equal(Object.hasOwn(eventPopup, 'saveAsTemplate'), false);
});

test('prepareApplyBlueprintRequest preserves explicit hidden popup settings and kanban triggers', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Explicit popup page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Work',
          layout: {
            rows: [['usersCalendar', 'usersKanban']],
          },
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              title: 'User schedule',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                titleField: 'nickname',
                startField: 'createdAt',
                quickCreatePopup: {
                  tryTemplate: false,
                  size: 'small',
                },
                eventPopup: {
                  template: {
                    uid: 'calendar-event-popup-template',
                    mode: 'reference',
                  },
                },
              },
            },
            {
              key: 'usersKanban',
              type: 'kanban',
              title: 'User board',
              collection: 'users',
              fields: ['nickname', 'status'],
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              settings: {
                quickCreateEnabled: false,
                enableCardClick: false,
                quickCreatePopup: {
                  tryTemplate: false,
                  mode: 'dialog',
                },
                cardPopup: {
                  template: {
                    uid: 'kanban-card-popup-template',
                    mode: 'reference',
                  },
                },
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const [calendarBlock, kanbanBlock] = result.cliBody.tabs[0].blocks;
  assert.deepEqual(calendarBlock.settings.quickCreatePopup, { tryTemplate: false, size: 'small' });
  assert.deepEqual(calendarBlock.settings.eventPopup, {
    template: {
      uid: 'calendar-event-popup-template',
      mode: 'reference',
    },
  });
  assert.equal(kanbanBlock.settings.quickCreateEnabled, false);
  assert.equal(kanbanBlock.settings.enableCardClick, false);
  assert.deepEqual(kanbanBlock.settings.quickCreatePopup, { tryTemplate: false, mode: 'dialog' });
  assert.deepEqual(kanbanBlock.settings.cardPopup, {
    template: {
      uid: 'kanban-card-popup-template',
      mode: 'reference',
    },
  });
});

test('prepareApplyBlueprintRequest applies popup template defaults to kanban hidden popup hosts', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Kanban popup page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Pipeline',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              title: 'User board',
              collection: 'users',
              fields: ['nickname', 'status'],
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              settings: {
                quickCreatePopup: {
                  mode: 'dialog',
                  size: 'large',
                  title: 'Create kanban user',
                  blocks: [
                    {
                      key: 'kanbanQuickCreateForm',
                      type: 'createForm',
                      collection: 'users',
                      fields: ['nickname', 'status'],
                    },
                  ],
                },
                cardPopup: {
                  mode: 'drawer',
                  size: 'small',
                  title: 'Kanban user details',
                  blocks: [
                    {
                      key: 'kanbanCardDetails',
                      type: 'details',
                      collection: 'users',
                      fields: ['nickname', 'email'],
                    },
                  ],
                },
              },
              actions: ['filter', 'addNew', 'popup', 'refresh'],
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const { quickCreatePopup, cardPopup } = result.cliBody.tabs[0].blocks[0].settings;
  assert.equal(quickCreatePopup.tryTemplate, true);
  assert.equal(quickCreatePopup.saveAsTemplate.name, 'Create kanban user popup template');
  assert.match(
    quickCreatePopup.saveAsTemplate.description,
    /Reusable popup template for action "quick create" on User board/i,
  );
  assert.equal(quickCreatePopup.blocks[0].fieldsLayout.rows[0][0].key, 'nickname');
  assert.equal(cardPopup.tryTemplate, true);
  assert.equal(cardPopup.saveAsTemplate.name, 'Kanban user details popup template');
  assert.match(
    cardPopup.saveAsTemplate.description,
    /Reusable popup template for action "card click\/view" on User board/i,
  );
  assert.equal(cardPopup.blocks[0].fieldsLayout.rows[0][1].key, 'email');
});

test('prepareApplyBlueprintRequest validates calendar hidden popup host template contract', () => {
  const baseBlueprint = (popupSettings) => ({
    version: '1',
    mode: 'create',
    page: { title: 'Calendar page' },
    tabs: [
      {
        title: 'Schedule',
        blocks: [
          {
            key: 'usersCalendar',
            type: 'calendar',
            collection: 'users',
            defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
            settings: {
              titleField: 'nickname',
              startField: 'createdAt',
              endField: 'updatedAt',
              ...popupSettings,
            },
            actions: ['today', 'turnPages', 'title', 'selectView', 'filter'],
          },
        ],
      },
    ],
  });
  const prepareCalendar = (popupSettings) =>
    prepareApplyBlueprintRequest(baseBlueprint(popupSettings), {
      collectionMetadata: calendarCollectionMetadata,
      injectDataSurfaceDefaultFilter: false,
    });

  const invalidTryTemplate = prepareCalendar({
    quickCreatePopup: {
      title: 'Create user',
      tryTemplate: 'yes',
    },
  });
  assert.equal(invalidTryTemplate.ok, false);
  assert.ok(
    invalidTryTemplate.errors.some(
      (issue) =>
        issue.ruleId === 'invalid-popup-try-template' &&
        issue.path === 'tabs[0].blocks[0].settings.quickCreatePopup.tryTemplate',
    ),
  );

  const invalidSaveAsTemplate = prepareCalendar({
    eventPopup: {
      title: 'Calendar user details',
      blocks: [
        {
          key: 'calendarEventDetails',
          type: 'details',
          collection: 'users',
          fields: ['nickname'],
        },
      ],
      saveAsTemplate: {
        name: '',
        description: 'Save this popup as a reusable template.',
      },
    },
  });
  assert.equal(invalidSaveAsTemplate.ok, false);
  assert.ok(
    invalidSaveAsTemplate.errors.some(
      (issue) =>
        issue.ruleId === 'invalid-popup-save-as-template-name' &&
        issue.path === 'tabs[0].blocks[0].settings.eventPopup.saveAsTemplate.name',
    ),
  );

  const conflict = prepareCalendar({
    eventPopup: {
      title: 'Calendar user details',
      template: {
        uid: 'calendar-event-popup-template',
        mode: 'reference',
      },
      saveAsTemplate: {
        name: 'calendar-event-popup',
        description: 'Save this popup as a reusable template.',
      },
    },
  });
  assert.equal(conflict.ok, false);
  assert.ok(
    conflict.errors.some(
      (issue) =>
        issue.ruleId === 'conflicting-popup-save-as-template' &&
        issue.path === 'tabs[0].blocks[0].settings.eventPopup.saveAsTemplate',
    ),
  );
});

test('prepareApplyBlueprintRequest includes calendar hidden popup blocks in defaults requirements', () => {
  const baseBlueprint = (defaults) => ({
    version: '1',
    mode: 'create',
    page: { title: 'Calendar page' },
    defaults,
    tabs: [
      {
        title: 'Schedule',
        blocks: [
          {
            key: 'usersCalendar',
            type: 'calendar',
            collection: 'users',
            defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
            settings: {
              titleField: 'nickname',
              startField: 'createdAt',
              quickCreatePopup: {
                title: 'Create role from calendar',
                blocks: [
                  {
                    key: 'roleCreateForm',
                    type: 'createForm',
                    collection: 'roles',
                    fields: ['name'],
                  },
                ],
              },
            },
            actions: ['today', 'turnPages', 'title', 'selectView', 'filter'],
          },
        ],
      },
    ],
  });
  const collectionMetadata = {
    collections: {
      ...calendarCollectionMetadata.collections,
      ...minimalRoleCollectionMetadata.collections,
    },
  };
  const usersOnly = prepareApplyBlueprintRequest(
    baseBlueprint({
      collections: {
        users: {
          popups: buildFixedCollectionPopupDefaults('users'),
        },
      },
    }),
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(usersOnly.ok, false);
  assert.ok(
    usersOnly.errors.some(
      (issue) =>
        issue.ruleId === 'missing-default-collection' &&
        issue.path === 'defaults.collections.roles',
    ),
  );

  const complete = prepareApplyBlueprintRequest(
    baseBlueprint({
      collections: {
        users: {
          popups: buildFixedCollectionPopupDefaults('users'),
        },
        roles: {
          popups: buildFixedCollectionPopupDefaults('roles'),
        },
      },
    }),
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(complete.ok, true, JSON.stringify(complete.errors));
  assert.deepEqual(
    complete.defaultsRequirements.collections.map((entry) => entry.collection),
    ['roles', 'users'],
  );
});

test('prepareApplyBlueprintRequest includes kanban hidden popup blocks in defaults requirements', () => {
  const popupCollectionMetadata = {
    collections: {
      users: collectionMetadata.collections.users,
      roles: minimalRoleCollectionMetadata.collections.roles,
    },
  };
  const baseBlueprint = (defaults) => ({
    version: '1',
    mode: 'create',
    page: { title: 'Kanban page' },
    defaults,
    tabs: [
      {
        title: 'Pipeline',
        blocks: [
          {
            key: 'usersKanban',
            type: 'kanban',
            title: 'User board',
            collection: 'users',
            fields: ['nickname', 'status'],
            defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
            settings: {
              cardPopup: {
                title: 'Role details from card',
                blocks: [
                  {
                    key: 'roleDetails',
                    type: 'details',
                    collection: 'roles',
                    fields: ['name'],
                  },
                ],
              },
            },
            actions: ['filter', 'addNew', 'popup', 'refresh'],
          },
        ],
      },
    ],
  });
  const usersOnly = prepareApplyBlueprintRequest(
    baseBlueprint({
      collections: {
        users: {
          popups: buildFixedCollectionPopupDefaults('users'),
        },
      },
    }),
    { collectionMetadata: popupCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(usersOnly.ok, false);
  assert.ok(
    usersOnly.errors.some(
      (issue) =>
        issue.ruleId === 'missing-default-collection' &&
        issue.path === 'defaults.collections.roles',
    ),
  );

  const complete = prepareApplyBlueprintRequest(
    baseBlueprint({
      collections: {
        users: {
          popups: buildFixedCollectionPopupDefaults('users'),
        },
        roles: {
          popups: buildFixedCollectionPopupDefaults('roles'),
        },
      },
    }),
    { collectionMetadata: popupCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(complete.ok, true, JSON.stringify(complete.errors));
  assert.deepEqual(
    complete.defaultsRequirements.collections.map((entry) => entry.collection),
    ['roles', 'users'],
  );
});

test('prepareApplyBlueprintRequest rejects fields fieldGroups and recordActions on calendar main blocks', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar page' },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonCalendarDefaultFilterFieldNames),
              fields: ['nickname'],
              fieldGroups: [
                {
                  title: 'Main',
                  fields: ['email'],
                },
              ],
              recordActions: ['view'],
            },
          ],
        },
      ],
    },
    { collectionMetadata: calendarCollectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'calendar-main-fields-unsupported'), true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'calendar-main-field-groups-unsupported'), true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'calendar-main-record-actions-unsupported'), true);
});

test('prepareApplyBlueprintRequest rejects unsupported actions and invalid field bindings on calendar blocks', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Calendar page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Schedule',
          blocks: [
            {
              key: 'usersCalendar',
              type: 'calendar',
              collection: 'users',
              defaultFilter: defaultFilterGroup(['nickname', 'status']),
              settings: {
                titleField: 'roles',
                startField: 'nickname',
                endField: 'missingField',
              },
              actions: ['bulkDelete'],
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'calendar-action-unsupported'), true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'calendar-field-binding-invalid' && issue.path.endsWith('.titleField')), true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'calendar-field-binding-invalid' && issue.path.endsWith('.startField')), true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'calendar-field-binding-invalid' && issue.path.endsWith('.endField')), true);
});

test('prepareApplyBlueprintRequest requires and accepts block-level defaultFilter on kanban blocks', () => {
  const missing = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Kanban page' },
      tabs: [
        {
          title: 'Pipeline',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              collection: 'users',
              fields: ['nickname', 'status'],
              actions: ['filter', 'addNew', 'popup', 'refresh', 'js'],
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.some((issue) => issue.ruleId === 'data-surface-block-default-filter-required'), true);

  const valid = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Kanban page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Pipeline',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              collection: 'users',
              fields: ['nickname', 'status'],
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              actions: ['filter', 'addNew', 'popup', 'refresh', 'js'],
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(valid.ok, true);
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.cliBody.tabs[0].blocks[0].type, 'kanban');
  assert.deepEqual(valid.cliBody.tabs[0].blocks[0].fields, ['nickname', 'status']);
  assert.deepEqual(valid.cliBody.tabs[0].blocks[0].defaultFilter, defaultFilterGroup(commonUserDefaultFilterFieldNames));

  const templateBackedWithDefaultFilter = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Kanban page' },
      tabs: [
        {
          title: 'Pipeline',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              collection: 'users',
              template: { uid: 'users-kanban-template', mode: 'reference' },
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(templateBackedWithDefaultFilter.ok, false);
  assert.equal(
    templateBackedWithDefaultFilter.errors.some(
      (issue) => issue.ruleId === 'data-surface-block-default-filter-template-unsupported',
    ),
    true,
  );

  const templateBackedWithDefaultActionSettings = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Kanban page' },
      tabs: [
        {
          title: 'Pipeline',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              collection: 'users',
              template: { uid: 'users-kanban-template', mode: 'reference' },
              defaultActionSettings: {
                filter: {
                  filterableFieldNames: ['nickname', 'status'],
                },
              },
            },
          ],
        },
      ],
    },
    { collectionMetadata },
  );
  assert.equal(templateBackedWithDefaultActionSettings.ok, false);
  assert.equal(
    templateBackedWithDefaultActionSettings.errors.some(
      (issue) => issue.ruleId === 'data-surface-block-default-action-settings-template-unsupported',
    ),
    true,
  );
});

test('prepareApplyBlueprintRequest rejects fieldGroups fieldsLayout and recordActions on kanban main blocks', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Kanban page' },
      tabs: [
        {
          title: 'Pipeline',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              fields: ['nickname', 'status'],
              fieldGroups: [
                {
                  title: 'Main',
                  fields: ['nickname'],
                },
              ],
              fieldsLayout: {
                rows: [['nickname']],
              },
              recordActions: ['view'],
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'kanban-main-field-groups-unsupported'), true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'kanban-main-fields-layout-unsupported'), true);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'kanban-main-record-actions-unsupported'), true);
});

test('prepareApplyBlueprintRequest rejects unsupported actions on kanban blocks', () => {
  const result = prepareApplyBlueprintRequest(
    {
      version: '1',
      mode: 'create',
      page: { title: 'Kanban page' },
      defaults: {
        collections: {
          users: {
            popups: buildFixedCollectionPopupDefaults('users'),
          },
        },
      },
      tabs: [
        {
          title: 'Pipeline',
          blocks: [
            {
              key: 'usersKanban',
              type: 'kanban',
              collection: 'users',
              defaultFilter: defaultFilterGroup(commonUserDefaultFilterFieldNames),
              fields: ['nickname', 'status'],
              actions: ['today', 'turnPages', 'triggerWorkflow', 'view'],
            },
          ],
        },
      ],
    },
    { collectionMetadata, injectDataSurfaceDefaultFilter: false },
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.ruleId === 'kanban-action-unsupported'), true);
});

test('prepareApplyBlueprintRequest validates update action assignValues against collection metadata', () => {
  const buildBlueprint = (actionPatch = {}, recordActionPatch = {}) => ({
    version: '1',
    mode: 'create',
    page: { title: 'Assignment actions' },
    tabs: [
      {
        title: 'Users',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            collection: 'users',
            fields: ['nickname', 'status'],
            actions: [
              {
                type: 'bulkUpdate',
                settings: {
                  assignValues: { status: 'inactive' },
                },
                ...actionPatch,
              },
            ],
            recordActions: [
              {
                type: 'updateRecord',
                settings: {
                  assignValues: { status: 'active' },
                },
                ...recordActionPatch,
              },
            ],
          },
        ],
      },
    ],
  });

  const valid = prepareWithDirectCollectionDefaults(buildBlueprint(), {
    collectionMetadata,
  });
  assert.equal(valid.ok, true);

  const unknownField = prepareWithDirectCollectionDefaults(
    buildBlueprint({
      settings: {
        assignValues: { missingField: 'x' },
      },
    }),
    { collectionMetadata },
  );
  assert.equal(unknownField.ok, false);
  assert.equal(unknownField.errors.some((issue) => issue.ruleId === 'assign-values-field-unknown'), true);

  const nonObject = prepareWithDirectCollectionDefaults(
    buildBlueprint({
      settings: {
        assignValues: ['status'],
      },
    }),
    { collectionMetadata },
  );
  assert.equal(nonObject.ok, false);
  assert.equal(nonObject.errors.some((issue) => issue.ruleId === 'assign-values-must-be-object'), true);

  const emptyClear = prepareWithDirectCollectionDefaults(
    buildBlueprint({
      settings: {
        assignValues: {},
      },
    }, {
      settings: {
        assignValues: {},
      },
    }),
    { collectionMetadata },
  );
  assert.equal(emptyClear.ok, true);

  const misplacedBulkUpdate = prepareWithDirectCollectionDefaults(
    buildBlueprint({}, {
      type: 'bulkUpdate',
      settings: {
        assignValues: { status: 'active' },
      },
    }),
    { collectionMetadata },
  );
  assert.equal(misplacedBulkUpdate.ok, false);
  assert.equal(misplacedBulkUpdate.errors.some((issue) => issue.ruleId === 'bulk-update-must-use-actions'), true);

  const misplacedUpdateRecord = prepareWithDirectCollectionDefaults(
    buildBlueprint({
      type: 'updateRecord',
      settings: {
        assignValues: { status: 'inactive' },
      },
    }),
    { collectionMetadata },
  );
  assert.equal(misplacedUpdateRecord.ok, false);
  assert.equal(
    misplacedUpdateRecord.errors.some((issue) => issue.ruleId === 'update-record-must-use-record-actions'),
    true,
  );
});
