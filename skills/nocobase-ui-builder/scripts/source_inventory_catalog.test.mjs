import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { collectNocobaseSourceInventory } from './source_inventory_catalog.mjs';
import { buildDynamicValidationScenario } from './validation_scenario_planner.mjs';

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

test('source inventory catalog collects public models and tree roots from nocobase source manifests', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-source-inventory-'));
  writeFile(
    path.join(rootDir, 'packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-schema-manifests/index.ts'),
    `
      const publicFlowModelUses = ['RootPageModel', 'TableBlockModel', 'ChartBlockModel'];
      const coreDescendantModelUses = Array.from(new Set([
        'BlockGridModel',
        'TableColumnModel',
      ])).sort();
    `,
  );
  writeFile(
    path.join(rootDir, 'packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-schema-manifests/shared.ts'),
    `
      export const publicBlockRootUses = ['RootPageModel', 'TableBlockModel', 'ChartBlockModel'];
    `,
  );
  writeFile(
    path.join(rootDir, 'packages/plugins/@nocobase/plugin-block-markdown/src/server/flow-schema-manifests/index.ts'),
    `
      const markdownBlockModelSchemaManifest = {
        use: 'MarkdownBlockModel',
        title: 'Markdown block',
        docs: {
          dynamicHints: [
            {
              kind: 'dynamic-ui-schema',
              path: 'MarkdownBlockModel.stepParams.markdownBlockSettings.editMarkdown.content',
              message: 'Markdown content can contain liquid variables resolved against runtime context.',
              'x-flow': {
                contextRequirements: ['liquid variables', 'markdown renderer'],
                unresolvedReason: 'runtime-markdown-context',
              },
            },
          ],
        },
      };
      export const manifest = {
        inventory: {
          publicModels: ['MarkdownBlockModel'],
          publicTreeRoots: ['MarkdownBlockModel'],
        },
        models: [markdownBlockModelSchemaManifest],
      };
    `,
  );

  const inventory = collectNocobaseSourceInventory({ repoRoot: rootDir });
  assert.equal(inventory.detected, true);
  assert.equal(inventory.publicModels.includes('ChartBlockModel'), true);
  assert.equal(inventory.publicModels.includes('MarkdownBlockModel'), true);
  assert.equal(inventory.publicTreeRoots.includes('MarkdownBlockModel'), true);
  assert.equal(inventory.expectedDescendantModels.includes('TableColumnModel'), true);
  assert.equal(Array.isArray(inventory.publicUseCatalog), true);
  assert.deepEqual(inventory.publicUseCatalog[0].semanticTags, ['docs']);
  assert.equal(inventory.publicUseCatalog[0].hintKinds.includes('dynamic-ui-schema'), true);
  assert.equal(inventory.publicUseCatalog[0].contextRequirements.includes('markdown renderer'), true);
});

test('dynamic scenario planner can pull source-exposed public blocks into planned coverage', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-source-planner-'));
  writeFile(
    path.join(rootDir, 'packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-schema-manifests/index.ts'),
    `
      const publicFlowModelUses = ['RootPageModel', 'TableBlockModel', 'ChartBlockModel'];
      const coreDescendantModelUses = Array.from(new Set(['BlockGridModel'])).sort();
    `,
  );
  writeFile(
    path.join(rootDir, 'packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-schema-manifests/shared.ts'),
    `
      export const publicBlockRootUses = ['RootPageModel', 'TableBlockModel', 'ChartBlockModel'];
    `,
  );
  process.env.NOCOBASE_SOURCE_ROOT = rootDir;
  try {
    const result = buildDynamicValidationScenario({
      caseRequest: '请帮我做一个图表分析看板',
      sessionId: 'chart-dashboard',
      baseSlug: 'dashboard',
      candidatePageUrl: 'http://localhost:23000/admin/dashboard',
      randomSeed: 'chart-seed',
    });
    assert.equal(result.scenario.availableUses.includes('ChartBlockModel'), true);
    assert.equal(result.scenario.plannedCoverage.blocks.includes('ChartBlockModel'), true);
    assert.equal(result.buildSpecInput.layout.blocks.some((item) => item.use === 'ChartBlockModel')
      || result.buildSpecInput.layout.tabs.some((tab) => tab.blocks.some((item) => item.use === 'ChartBlockModel')), true);
  } finally {
    delete process.env.NOCOBASE_SOURCE_ROOT;
  }
});

test('dynamic scenario planner can use source dynamic hints to match sql-query analytics requests', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-source-analytics-'));
  writeFile(
    path.join(rootDir, 'packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-schema-manifests/index.ts'),
    `
      const publicFlowModelUses = ['RootPageModel', 'TableBlockModel'];
      const coreDescendantModelUses = Array.from(new Set(['BlockGridModel'])).sort();
    `,
  );
  writeFile(
    path.join(rootDir, 'packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-schema-manifests/shared.ts'),
    `
      export const publicBlockRootUses = ['RootPageModel', 'TableBlockModel'];
    `,
  );
  writeFile(
    path.join(rootDir, 'packages/plugins/@nocobase/plugin-data-visualization/src/server/flow-schema-manifests/index.ts'),
    `
      const chartBlockModelSchemaManifest = {
        use: 'ChartBlockModel',
        title: 'Chart block',
        docs: {
          dynamicHints: [
            {
              kind: 'dynamic-ui-schema',
              path: 'ChartBlockModel.stepParams.chartSettings.configure.query',
              message: 'Chart query configuration depends on runtime collections, query builders, and optional SQL editors.',
              'x-flow': {
                contextRequirements: ['query builder', 'optional SQL resource'],
                unresolvedReason: 'runtime-chart-query-config',
              },
            },
          ],
        },
      };
      export const flowSchemaManifestContribution = {
        inventory: {
          publicModels: ['ChartBlockModel'],
          publicTreeRoots: ['ChartBlockModel'],
        },
        models: [chartBlockModelSchemaManifest],
      };
    `,
  );

  process.env.NOCOBASE_SOURCE_ROOT = rootDir;
  try {
    const result = buildDynamicValidationScenario({
      caseRequest: '请做一个组织 SQL 查询驾驶舱页面',
      sessionId: 'org-sql-dashboard',
      baseSlug: 'org-sql',
      candidatePageUrl: 'http://localhost:23000/admin/org-sql',
      randomSeed: 'org-sql-seed',
    });
    assert.equal(result.scenario.sourceInventory.publicUseCatalog.some((item) => item.use === 'ChartBlockModel'), true);
    assert.equal(result.scenario.availableUses.includes('ChartBlockModel'), true);
    assert.equal(result.scenario.planningStatus, 'blocked');
    assert.equal(result.scenario.planningBlockers[0].code, 'DYNAMIC_HINTS_REQUIRE_RUNTIME_CONTEXT');
  } finally {
    delete process.env.NOCOBASE_SOURCE_ROOT;
  }
});
