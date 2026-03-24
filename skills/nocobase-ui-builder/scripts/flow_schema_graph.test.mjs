import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFlowSchemaGraph,
  hydrateBranch,
  loadFlowSchemaGraph,
  materializeUse,
  resolveModel,
  resolveSlotCatalog,
  rewriteArtifactNames,
} from './flow_schema_graph.mjs';

const FIXTURE_GRAPH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'references', 'flow-schemas');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeRawSnapshot(rootDir, docsByUse, {
  appVersion = 'test-version',
  seedUses = ['ParentModel'],
} = {}) {
  const uses = Object.keys(docsByUse).sort((left, right) => left.localeCompare(right));
  writeJson(path.join(rootDir, 'manifest.json'), {
    meta: {
      source: 'flowModels:schemas',
      scope: 'test snapshot',
      generatedAt: '2026-03-22T00:00:00.000Z',
      notes: 'test fixture',
      format: 'per-use raw',
      appVersion,
      enabledPlugins: [],
      seedUses,
      useCount: uses.length,
      uses,
    },
    filesByUse: Object.fromEntries(uses.map((use) => [use, `by-use/${use}.json`])),
  });
  for (const [use, document] of Object.entries(docsByUse)) {
    writeJson(path.join(rootDir, 'by-use', `${use}.json`), document);
  }
}

function makeModelDoc({
  use,
  title = use,
  slotSchemas = {},
  minimalExampleSubModels = {},
  skeletonSubModels = {},
  dynamicHints = [],
}) {
  return {
    use,
    title,
    jsonSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        uid: { type: 'string' },
        use: { const: use },
        stepParams: { type: 'object', additionalProperties: true },
        subModels: {
          type: 'object',
          properties: slotSchemas,
        },
      },
      required: ['uid', 'use'],
      additionalProperties: true,
    },
    coverage: {
      status: 'stable',
    },
    dynamicHints,
    examples: [],
    minimalExample: {
      uid: `${use}-example`,
      use,
      subModels: minimalExampleSubModels,
    },
    commonPatterns: [],
    antiPatterns: [],
    skeleton: {
      uid: `${use}-skeleton`,
      use,
      subModels: skeletonSubModels,
    },
    hash: `${use}-hash`,
    source: {
      plugin: 'test-plugin',
    },
  };
}

function directSlotSchema(use) {
  return {
    type: 'object',
    properties: {
      uid: { type: 'string' },
      use: { const: use },
      stepParams: { type: 'object', additionalProperties: true },
      subModels: {
        type: 'object',
        properties: {},
      },
    },
    required: ['uid', 'use'],
    additionalProperties: true,
  };
}

function arrayAnyOfSlotSchema(uses) {
  return {
    type: 'array',
    items: {
      anyOf: uses.map((use) => directSlotSchema(use)),
    },
  };
}

test('buildFlowSchemaGraph rewrites raw snapshot into model/catalog/artifact graph', () => {
  const sourceDir = makeTempDir('nb-flow-graph-raw');
  const outDir = makeTempDir('nb-flow-graph-out');

  writeRawSnapshot(sourceDir, {
    FieldModel: makeModelDoc({
      use: 'FieldModel',
      title: 'Field',
    }),
    GridModel: makeModelDoc({
      use: 'GridModel',
      title: 'Grid',
      slotSchemas: {
        items: arrayAnyOfSlotSchema(['FieldModel']),
      },
      minimalExampleSubModels: {
        items: [
          {
            uid: 'field-example',
            use: 'FieldModel',
          },
        ],
      },
      skeletonSubModels: {
        items: [
          {
            uid: 'field-skeleton',
            use: 'FieldModel',
          },
        ],
      },
    }),
    ParentModel: makeModelDoc({
      use: 'ParentModel',
      title: 'Parent',
      slotSchemas: {
        grid: directSlotSchema('GridModel'),
        actions: arrayAnyOfSlotSchema(['FieldModel']),
      },
      minimalExampleSubModels: {
        grid: {
          uid: 'grid-example',
          use: 'GridModel',
        },
        actions: [
          {
            uid: 'action-example',
            use: 'FieldModel',
          },
        ],
      },
      skeletonSubModels: {
        grid: {
          uid: 'grid-skeleton',
          use: 'GridModel',
        },
      },
    }),
  });

  const summary = buildFlowSchemaGraph({
    sourceDir,
    outDir,
  });

  assert.equal(summary.modelCount, 3);
  assert.equal(summary.catalogCount, 3);

  const parentModel = resolveModel(outDir, 'ParentModel');
  assert.equal(parentModel.refs.jsonSchema.artifactRef.startsWith('artifacts/json-schema/'), true);
  assert.match(parentModel.refs.jsonSchema.artifactRef, /ParentModel\.[a-z0-9]+\.json$/);
  assert.deepEqual(Object.keys(parentModel.refs.slots), ['grid', 'actions']);

  const parentGrid = resolveSlotCatalog(outDir, 'ParentModel', 'grid');
  assert.equal(parentGrid.shape, 'direct');
  assert.deepEqual(parentGrid.defaultUses, ['GridModel']);
  assert.deepEqual(parentGrid.candidates.map((item) => item.use), ['GridModel']);

  const materializedParent = materializeUse(outDir, 'ParentModel');
  assert.equal(materializedParent.jsonSchema.properties.subModels.properties.grid.xFlowGraphSlotRef.slot, 'grid');
  assert.equal(materializedParent.minimalExample.subModels.grid.xFlowGraphModelRef.use, 'GridModel');
  assert.equal(materializedParent.minimalExample.subModels.actions[0].xFlowGraphModelRef.use, 'FieldModel');
  assert.equal(materializedParent.slots.actions.candidates[0].use, 'FieldModel');

  const branch = hydrateBranch(outDir, 'ParentModel', 'grid/GridModel/items/FieldModel');
  assert.equal(branch.hops.length, 2);
  assert.equal(branch.leafModel.use, 'FieldModel');

  const rewriteSummary = rewriteArtifactNames(outDir);
  assert.equal(rewriteSummary.renamedCount, 0);
});

test('generated repo graph exposes common models through refs and branch hydration', () => {
  const graph = loadFlowSchemaGraph(FIXTURE_GRAPH_DIR);

  assert.equal(graph.manifest.meta.format, 'flow-schema-graph/v2');
  assert.equal(graph.manifest.meta.useCount >= 100, true);
  assert.equal(typeof graph.manifest.modelsByUse.TableBlockModel === 'string', true);

  const tableModel = materializeUse(FIXTURE_GRAPH_DIR, 'TableBlockModel');
  assert.equal(tableModel.use, 'TableBlockModel');
  assert.equal(tableModel.jsonSchema.properties.subModels.properties.columns.xFlowGraphSlotRef.slot, 'columns');
  assert.deepEqual(
    tableModel.slots.columns.candidates.map((item) => item.use),
    ['TableColumnModel', 'TableActionsColumnModel', 'JSColumnModel', 'TableCustomColumnModel'],
  );

  const detailsModel = materializeUse(FIXTURE_GRAPH_DIR, 'DetailsBlockModel');
  assert.equal(detailsModel.jsonSchema.properties.subModels.properties.grid.xFlowGraphSlotRef.slot, 'grid');
  assert.equal(detailsModel.slots.actions.candidates.some((item) => item.use === 'ViewActionModel'), true);

  const createFormBranch = hydrateBranch(FIXTURE_GRAPH_DIR, 'CreateFormModel', 'grid/FormGridModel/items/FormItemModel');
  assert.equal(createFormBranch.leafModel.use, 'FormItemModel');
  assert.equal(createFormBranch.hops[0].slot, 'grid');
  assert.equal(createFormBranch.hops[1].slot, 'items');
});
