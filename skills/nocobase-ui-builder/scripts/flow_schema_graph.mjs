#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const FLOW_SCHEMA_GRAPH_VERSION = 'flow-schema-graph/v2';
export const ARTIFACT_KIND_DIR = {
  jsonSchema: 'json-schema',
  minimalExample: 'minimal-example',
  skeleton: 'skeleton',
  examples: 'examples',
};
export const DEFAULT_ENTRY_USES = [
  'PageModel',
  'RootPageModel',
  'RootPageTabModel',
  'PageTabModel',
  'BlockGridModel',
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
  'ActionModel',
  'JSBlockModel',
  'JSColumnModel',
  'JSFieldModel',
  'JSItemModel',
  'JSActionModel',
];

function normalizeNonEmptyString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortJson(value[key])]),
  );
}

function hashJson(value) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify(sortJson(value)))
    .digest('hex')
    .slice(0, 20);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeNonEmptyString(item))
      .filter(Boolean),
  )];
}

function fileNameForUse(use) {
  return `models/${use}.json`;
}

function catalogFileName(ownerUse, slot) {
  return `catalogs/${ownerUse}.${slot}.json`;
}

function artifactFileName(kind, ownerUse, hash) {
  return `artifacts/${ARTIFACT_KIND_DIR[kind]}/${ownerUse}.${hash}.json`;
}

function getDirectSubModelSlots(schema) {
  if (!schema || typeof schema !== 'object') {
    return {};
  }
  const slots = schema?.properties?.subModels?.properties;
  return slots && typeof slots === 'object' ? slots : {};
}

function getSchemaUse(schema) {
  return normalizeNonEmptyString(schema?.properties?.use?.const);
}

function classifySlotSchema(slotSchema) {
  if (!slotSchema || typeof slotSchema !== 'object') {
    return 'opaque';
  }
  if (Array.isArray(slotSchema.items?.anyOf)) {
    return 'items.anyOf';
  }
  if (Array.isArray(slotSchema.items?.oneOf)) {
    return 'items.oneOf';
  }
  if (Array.isArray(slotSchema.anyOf)) {
    return 'anyOf';
  }
  if (Array.isArray(slotSchema.oneOf)) {
    return 'oneOf';
  }
  if (getSchemaUse(slotSchema.items)) {
    return 'items.direct';
  }
  if (getSchemaUse(slotSchema)) {
    return 'direct';
  }
  return 'opaque';
}

function inferSlotType(slotSchema, shape) {
  const explicitType = normalizeNonEmptyString(slotSchema?.type);
  if (explicitType) {
    return explicitType;
  }
  if (shape.startsWith('items.')) {
    return 'array';
  }
  return 'object';
}

function extractCandidateSchemas(slotSchema, shape = classifySlotSchema(slotSchema)) {
  switch (shape) {
    case 'items.anyOf':
      return slotSchema.items.anyOf;
    case 'items.oneOf':
      return slotSchema.items.oneOf;
    case 'anyOf':
      return slotSchema.anyOf;
    case 'oneOf':
      return slotSchema.oneOf;
    case 'items.direct':
      return [slotSchema.items];
    case 'direct':
      return [slotSchema];
    default:
      return [];
  }
}

function stripCandidateSchemas(slotSchema, shape = classifySlotSchema(slotSchema)) {
  const base = cloneJson(slotSchema);
  switch (shape) {
    case 'items.anyOf':
      delete base.items.anyOf;
      return base;
    case 'items.oneOf':
      delete base.items.oneOf;
      return base;
    case 'anyOf':
      delete base.anyOf;
      return base;
    case 'oneOf':
      delete base.oneOf;
      return base;
    case 'items.direct':
      delete base.items;
      return base;
    case 'direct':
      return {};
    default:
      return base;
  }
}

function readRawFlowSchemas(sourceDir) {
  const manifestPath = path.join(sourceDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  const byUseDir = path.join(sourceDir, 'by-use');
  if (!fs.existsSync(byUseDir)) {
    throw new Error(`Raw flow schema snapshot not found under ${byUseDir}`);
  }
  const docsByUse = {};
  const fileNames = fs.readdirSync(byUseDir)
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
  for (const fileName of fileNames) {
    const filePath = path.join(byUseDir, fileName);
    const document = readJson(filePath);
    const use = normalizeNonEmptyString(document.use) || fileName.replace(/\.json$/u, '');
    docsByUse[use] = document;
  }
  return {
    manifest,
    docsByUse,
    uses: Object.keys(docsByUse).sort((left, right) => left.localeCompare(right)),
  };
}

function collectSlotSampleUses(value) {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .filter((item) => item && typeof item === 'object')
        .map((item) => item.use),
    );
  }
  if (value && typeof value === 'object' && normalizeNonEmptyString(value.use)) {
    return [normalizeNonEmptyString(value.use)];
  }
  return [];
}

function collectDefaultUsesBySlot(document) {
  const defaultUsesBySlot = {};
  for (const source of [document.minimalExample, document.skeleton]) {
    const slots = source?.subModels;
    if (!slots || typeof slots !== 'object') {
      continue;
    }
    for (const [slot, value] of Object.entries(slots)) {
      const existing = defaultUsesBySlot[slot] ?? [];
      defaultUsesBySlot[slot] = uniqueStrings([...existing, ...collectSlotSampleUses(value)]);
    }
  }
  return defaultUsesBySlot;
}

function createModelRef(use, artifactKind) {
  return {
    xFlowGraphModelRef: {
      use,
      artifact: artifactKind,
      modelRef: fileNameForUse(use),
    },
  };
}

function normalizeBranchValue(value, artifactKind) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const use = normalizeNonEmptyString(item?.use);
      return use ? createModelRef(use, artifactKind) : cloneJson(item);
    });
  }
  const use = normalizeNonEmptyString(value?.use);
  if (use) {
    return createModelRef(use, artifactKind);
  }
  return cloneJson(value);
}

function normalizeBranchArtifact(document, artifactKind, slotCatalogs) {
  const sourceValue = document?.[artifactKind];
  if (sourceValue == null) {
    return sourceValue;
  }
  if (artifactKind === 'examples' && Array.isArray(sourceValue)) {
    return sourceValue.map((entry) => normalizeBranchArtifact({ examples: entry }, 'examples:item', slotCatalogs));
  }
  if (artifactKind === 'examples:item') {
    const example = document.examples;
    if (!example || typeof example !== 'object') {
      return cloneJson(example);
    }
    const normalized = cloneJson(example);
    const subModels = normalized.subModels;
    if (!subModels || typeof subModels !== 'object') {
      return normalized;
    }
    for (const [slot, catalog] of Object.entries(slotCatalogs)) {
      if (!(slot in subModels)) {
        continue;
      }
      subModels[slot] = normalizeBranchValue(subModels[slot], 'minimalExample');
      if (catalog.defaultUses.length > 0) {
        subModels[slot].xFlowGraphDefaultUses = catalog.defaultUses;
      }
    }
    return normalized;
  }
  if (!sourceValue || typeof sourceValue !== 'object') {
    return cloneJson(sourceValue);
  }
  const normalized = cloneJson(sourceValue);
  const subModels = normalized.subModels;
  if (!subModels || typeof subModels !== 'object') {
    return normalized;
  }
  for (const [slot, catalog] of Object.entries(slotCatalogs)) {
    if (!(slot in subModels)) {
      continue;
    }
    subModels[slot] = normalizeBranchValue(subModels[slot], artifactKind);
    if (!Array.isArray(subModels[slot]) && subModels[slot] && typeof subModels[slot] === 'object' && catalog.defaultUses.length > 0) {
      subModels[slot].xFlowGraphDefaultUses = catalog.defaultUses;
    }
  }
  return normalized;
}

function createSlotCatalog({
  ownerUse,
  slot,
  slotSchema,
  docsByUse,
  defaultUses = [],
}) {
  const shape = classifySlotSchema(slotSchema);
  const slotType = inferSlotType(slotSchema, shape);
  const candidateSchemas = extractCandidateSchemas(slotSchema, shape);
  const candidates = candidateSchemas
    .map((candidateSchema, index) => {
      const use = getSchemaUse(candidateSchema);
      if (!use) {
        return null;
      }
      const document = docsByUse[use];
      return {
        use,
        title: normalizeNonEmptyString(document?.title) || use,
        compatibility: {
          slotType,
          shape,
          source: 'jsonSchema',
        },
        isDefault: defaultUses.includes(use),
        order: index,
        modelRef: fileNameForUse(use),
        skeletonRef: {
          modelRef: fileNameForUse(use),
          artifact: 'skeleton',
        },
      };
    })
    .filter(Boolean);
  const mergedDefaultUses = uniqueStrings([
    ...defaultUses,
    ...candidates.filter((candidate) => candidate.isDefault).map((candidate) => candidate.use),
  ]);
  return {
    format: FLOW_SCHEMA_GRAPH_VERSION,
    kind: 'slot-catalog',
    ownerUse,
    slot,
    slotType,
    shape,
    defaultUses: mergedDefaultUses,
    schemaBase: stripCandidateSchemas(slotSchema, shape),
    candidates,
  };
}

function normalizeJsonSchemaArtifact(ownerUse, jsonSchema, slotCatalogs) {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return jsonSchema;
  }
  const normalized = cloneJson(jsonSchema);
  const slots = normalized?.properties?.subModels?.properties;
  if (!slots || typeof slots !== 'object') {
    return normalized;
  }
  for (const [slot, catalog] of Object.entries(slotCatalogs)) {
    if (!(slot in slots)) {
      continue;
    }
    const schemaBase = cloneJson(catalog.schemaBase);
    schemaBase.xFlowGraphSlotRef = {
      ownerUse,
      slot,
      slotRef: catalogFileName(ownerUse, slot),
      slotType: catalog.slotType,
      shape: catalog.shape,
      defaultUses: catalog.defaultUses,
    };
    slots[slot] = schemaBase;
  }
  return normalized;
}

function createArtifactRegistry() {
  return new Map();
}

function registerArtifact(registry, { kind, ownerUse, value }) {
  const hash = hashJson({ kind, value });
  const artifactKey = `${kind}:${hash}`;
  const existing = registry.get(artifactKey);
  if (existing) {
    existing.ownerUses = uniqueStrings([...existing.ownerUses, ownerUse]);
    return {
      artifactRef: existing.relativePath,
      hash,
    };
  }
  const relativePath = artifactFileName(kind, ownerUse, hash);
  registry.set(artifactKey, {
    format: FLOW_SCHEMA_GRAPH_VERSION,
    kind: 'artifact',
    artifactKind: kind,
    hash,
    relativePath,
    ownerUses: [ownerUse],
    value,
  });
  return {
    artifactRef: relativePath,
    hash,
  };
}

export function createFlowSchemaGraph({ docsByUse, sourceManifest }) {
  const artifactRegistry = createArtifactRegistry();
  const modelsByUse = {};
  const catalogsByFile = {};
  const catalogsByOwner = {};
  const uses = Object.keys(docsByUse).sort((left, right) => left.localeCompare(right));

  for (const use of uses) {
    const document = docsByUse[use];
    const defaultUsesBySlot = collectDefaultUsesBySlot(document);
    const rawSlots = getDirectSubModelSlots(document.jsonSchema);
    const slotCatalogs = {};

    for (const [slot, slotSchema] of Object.entries(rawSlots)) {
      const catalog = createSlotCatalog({
        ownerUse: use,
        slot,
        slotSchema,
        docsByUse,
        defaultUses: defaultUsesBySlot[slot] ?? [],
      });
      const relativePath = catalogFileName(use, slot);
      slotCatalogs[slot] = catalog;
      catalogsByFile[relativePath] = catalog;
      catalogsByOwner[use] ??= {};
      catalogsByOwner[use][slot] = relativePath;
    }

    const normalizedJsonSchema = normalizeJsonSchemaArtifact(use, document.jsonSchema, slotCatalogs);
    const normalizedMinimalExample = normalizeBranchArtifact(document, 'minimalExample', slotCatalogs);
    const normalizedSkeleton = normalizeBranchArtifact(document, 'skeleton', slotCatalogs);
    const normalizedExamples = normalizeBranchArtifact(document, 'examples', slotCatalogs);

    const jsonSchemaRef = registerArtifact(artifactRegistry, {
      kind: 'jsonSchema',
      ownerUse: use,
      value: normalizedJsonSchema,
    });
    const minimalExampleRef = registerArtifact(artifactRegistry, {
      kind: 'minimalExample',
      ownerUse: use,
      value: normalizedMinimalExample,
    });
    const skeletonRef = registerArtifact(artifactRegistry, {
      kind: 'skeleton',
      ownerUse: use,
      value: normalizedSkeleton,
    });
    const examplesRef = registerArtifact(artifactRegistry, {
      kind: 'examples',
      ownerUse: use,
      value: normalizedExamples,
    });

    modelsByUse[use] = {
      format: FLOW_SCHEMA_GRAPH_VERSION,
      kind: 'model',
      use,
      title: document.title,
      coverage: document.coverage,
      source: document.source,
      hash: document.hash,
      dynamicHints: document.dynamicHints,
      commonPatterns: document.commonPatterns,
      antiPatterns: document.antiPatterns,
      refs: {
        jsonSchema: jsonSchemaRef,
        minimalExample: minimalExampleRef,
        skeleton: skeletonRef,
        examples: examplesRef,
        slots: Object.fromEntries(
          Object.keys(slotCatalogs).map((slot) => [
            slot,
            {
              slotRef: catalogFileName(use, slot),
            },
          ]),
        ),
      },
      defaultSubModelUses: Object.fromEntries(
        Object.entries(slotCatalogs).map(([slot, catalog]) => [slot, catalog.defaultUses]),
      ),
    };
  }

  const entryUses = uniqueStrings([
    ...(sourceManifest?.meta?.seedUses ?? []),
    ...DEFAULT_ENTRY_USES,
  ]).filter((use) => uses.includes(use));

  const manifest = {
    meta: {
      source: sourceManifest?.meta?.source ?? 'flowModels:schemas',
      scope: sourceManifest?.meta?.scope ?? 'current snapshot',
      generatedAt: new Date().toISOString(),
      notes: 'checked-in graph reference for nocobase-ui-builder',
      format: FLOW_SCHEMA_GRAPH_VERSION,
      appVersion: sourceManifest?.meta?.appVersion ?? '',
      enabledPlugins: sourceManifest?.meta?.enabledPlugins ?? [],
      seedUses: sourceManifest?.meta?.seedUses ?? ['BlockGridModel', 'PageModel'],
      entryUses,
      useCount: uses.length,
      uses,
    },
    modelsByUse: Object.fromEntries(
      uses.map((use) => [use, fileNameForUse(use)]),
    ),
    catalogsByOwner,
    artifacts: {
      byKind: Object.fromEntries(
        Object.entries(ARTIFACT_KIND_DIR).map(([kind, dirName]) => [
          kind,
          {
            dir: `artifacts/${dirName}`,
            count: [...artifactRegistry.values()].filter((artifact) => artifact.artifactKind === kind).length,
          },
        ]),
      ),
      totalCount: artifactRegistry.size,
    },
  };

  return {
    manifest,
    modelsByUse,
    catalogsByFile,
    artifactsByFile: Object.fromEntries(
      [...artifactRegistry.values()].map((artifact) => [artifact.relativePath, artifact]),
    ),
  };
}

function renderIndexMarkdown(manifest) {
  const entryUses = manifest.meta.entryUses?.length ? manifest.meta.entryUses : manifest.meta.uses.slice(0, 12);
  return `---
title: Flow Schema Graph index
description: Checked-in flowModels:schemas graph/ref reference for the current instance. Choose the use first, then read the model, slot catalog, and only the artifacts you need.
---

# Flow Schema Graph index

This directory stores the graph/ref view of the current instance's \`flowModels:schemas\` result instead of embedding the entire recursive schema tree into one file.

Directory structure:

- [manifest.json](manifest.json)
- \`models/<UseName>.json\`
- \`catalogs/<OwnerUse>.<slot>.json\`
- \`artifacts/json-schema/<UseName>.<hash>.json\`
- \`artifacts/minimal-example/<UseName>.<hash>.json\`
- \`artifacts/skeleton/<UseName>.<hash>.json\`
- \`artifacts/examples/<UseName>.<hash>.json\`

Snapshot notes:

- source: \`flowModels:schemas\`
- shape: \`model + slot catalog + artifact\`
- purpose: reduce \`PostFlowmodels_schemas\` traffic and let the agent follow refs on demand instead of loading the entire recursive tree

## Recommended usage

1. Open [manifest.json](manifest.json) first and confirm the target \`use\`
2. Read \`models/<UseName>.json\`
3. If you need to know what a specific \`subModels.<slot>\` accepts, read \`catalogs/<OwnerUse>.<slot>.json\`
4. Only open artifacts when you truly need JSON Schema, skeleton, or example details
5. If you need to keep drilling into one branch, prefer \`scripts/flow_schema_graph.mjs hydrate-branch\`

## Hard rules

- Do not expand the entire \`artifacts/json-schema/\` tree or multiple large artifacts at once
- In one round, read only 1 to 2 model files plus the necessary 1 to 2 catalogs or artifacts
- \`PostFlowmodels_schemabundle\` is still used for runtime root-block discovery; the local graph mainly replaces routine \`flowModels:schemas\` browsing
- \`materialize-use\` and \`hydrate-branch\` output graph-composed views, not byte-for-byte copies of the older raw snapshot

## Common entry uses

${entryUses.map((use) => `- \`${use}\``).join('\n')}

For the full list, use [manifest.json](manifest.json).
`;
}

export function writeFlowSchemaGraph(graph, outDir) {
  ensureDir(outDir);
  removeIfExists(path.join(outDir, 'by-use'));
  removeIfExists(path.join(outDir, 'models'));
  removeIfExists(path.join(outDir, 'catalogs'));
  removeIfExists(path.join(outDir, 'artifacts'));
  removeIfExists(path.join(outDir, 'manifest.json'));
  removeIfExists(path.join(outDir, 'index.md'));

  writeJson(path.join(outDir, 'manifest.json'), graph.manifest);
  for (const [use, model] of Object.entries(graph.modelsByUse)) {
    writeJson(path.join(outDir, fileNameForUse(use)), model);
  }
  for (const [relativePath, catalog] of Object.entries(graph.catalogsByFile)) {
    writeJson(path.join(outDir, relativePath), catalog);
  }
  for (const [relativePath, artifact] of Object.entries(graph.artifactsByFile)) {
    writeJson(path.join(outDir, relativePath), artifact);
  }
  writeText(path.join(outDir, 'index.md'), renderIndexMarkdown(graph.manifest));
}

export function buildFlowSchemaGraph({ sourceDir, outDir }) {
  const raw = readRawFlowSchemas(sourceDir);
  const graph = createFlowSchemaGraph({
    docsByUse: raw.docsByUse,
    sourceManifest: raw.manifest,
  });
  writeFlowSchemaGraph(graph, outDir);
  return {
    sourceUseCount: raw.uses.length,
    modelCount: Object.keys(graph.modelsByUse).length,
    catalogCount: Object.keys(graph.catalogsByFile).length,
    artifactCount: Object.keys(graph.artifactsByFile).length,
    outDir,
  };
}

function collectArtifactFiles(graphDir) {
  const files = [];
  const rootDir = path.join(graphDir, 'artifacts');
  if (!fs.existsSync(rootDir)) {
    return files;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      if (entry.isFile() && nextPath.endsWith('.json')) {
        files.push(nextPath);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function loadFlowSchemaGraph(graphDir) {
  const manifest = readJson(path.join(graphDir, 'manifest.json'));
  return {
    graphDir,
    manifest,
  };
}

function readRelativeJson(graphDir, relativePath) {
  return readJson(path.join(graphDir, relativePath));
}

export function resolveModel(graphDir, use) {
  const { manifest } = loadFlowSchemaGraph(graphDir);
  const relativePath = manifest.modelsByUse?.[use];
  if (!relativePath) {
    throw new Error(`Unknown model use: ${use}`);
  }
  return readRelativeJson(graphDir, relativePath);
}

export function resolveSlotCatalog(graphDir, ownerUse, slot) {
  const { manifest } = loadFlowSchemaGraph(graphDir);
  const relativePath = manifest.catalogsByOwner?.[ownerUse]?.[slot];
  if (!relativePath) {
    throw new Error(`Unknown slot catalog: ${ownerUse}.${slot}`);
  }
  return readRelativeJson(graphDir, relativePath);
}

export function resolveArtifact(graphDir, artifactRef) {
  const relativePath = normalizeNonEmptyString(artifactRef?.artifactRef ?? artifactRef);
  if (!relativePath) {
    throw new Error('artifactRef is required');
  }
  return readRelativeJson(graphDir, relativePath);
}

export function materializeUse(graphDir, use) {
  const model = resolveModel(graphDir, use);
  return {
    ...model,
    jsonSchema: resolveArtifact(graphDir, model.refs.jsonSchema).value,
    minimalExample: resolveArtifact(graphDir, model.refs.minimalExample).value,
    skeleton: resolveArtifact(graphDir, model.refs.skeleton).value,
    examples: resolveArtifact(graphDir, model.refs.examples).value,
    slots: Object.fromEntries(
      Object.entries(model.refs.slots ?? {}).map(([slot, ref]) => [
        slot,
        resolveSlotCatalog(graphDir, model.use, slot),
      ]),
    ),
  };
}

export function rewriteArtifactNames(graphDir) {
  const { manifest } = loadFlowSchemaGraph(graphDir);
  const artifactRefMap = new Map();
  const artifactFiles = collectArtifactFiles(graphDir);

  for (const filePath of artifactFiles) {
    const relativePath = path.relative(graphDir, filePath);
    const artifact = readJson(filePath);
    const ownerUse = normalizeNonEmptyString(artifact.ownerUses?.[0]) || 'SharedArtifact';
    const newRelativePath = artifactFileName(artifact.artifactKind, ownerUse, artifact.hash);
    artifact.relativePath = newRelativePath;
    artifactRefMap.set(relativePath, newRelativePath);
    writeJson(path.join(graphDir, newRelativePath), artifact);
    if (newRelativePath !== relativePath) {
      fs.rmSync(filePath, { force: true });
    }
  }

  for (const use of Object.keys(manifest.modelsByUse).sort((left, right) => left.localeCompare(right))) {
    const modelPath = path.join(graphDir, manifest.modelsByUse[use]);
    const model = readJson(modelPath);
    for (const key of ['jsonSchema', 'minimalExample', 'skeleton', 'examples']) {
      const oldRef = model.refs?.[key]?.artifactRef;
      const newRef = artifactRefMap.get(oldRef);
      if (newRef) {
        model.refs[key].artifactRef = newRef;
      }
    }
    writeJson(modelPath, model);
  }

  return {
    renamedCount: [...artifactRefMap.entries()].filter(([before, after]) => before !== after).length,
    artifactCount: artifactRefMap.size,
  };
}

function parseBranchPath(pathInput) {
  const normalized = normalizeNonEmptyString(pathInput);
  if (!normalized) {
    return [];
  }
  return normalized.split('/').map((segment) => segment.trim()).filter(Boolean);
}

export function hydrateBranch(graphDir, rootUse, branchPath) {
  const segments = parseBranchPath(branchPath);
  if (segments.length % 2 !== 0) {
    throw new Error('Branch path must alternate slot/use segments, e.g. grid/FormGridModel/items/FormItemModel');
  }
  const hops = [];
  let currentModel = materializeUse(graphDir, rootUse);
  for (let index = 0; index < segments.length; index += 2) {
    const slot = segments[index];
    const selectedUse = segments[index + 1];
    const slotCatalog = resolveSlotCatalog(graphDir, currentModel.use, slot);
    const candidate = slotCatalog.candidates.find((item) => item.use === selectedUse);
    if (!candidate) {
      throw new Error(`Use ${selectedUse} is not a candidate of ${currentModel.use}.${slot}`);
    }
    const nextModel = materializeUse(graphDir, selectedUse);
    hops.push({
      ownerUse: currentModel.use,
      slot,
      slotCatalog,
      selectedUse,
      selectedModel: nextModel,
    });
    currentModel = nextModel;
  }
  return {
    format: FLOW_SCHEMA_GRAPH_VERSION,
    kind: 'hydrated-branch',
    rootUse,
    path: parseBranchPath(branchPath),
    rootModel: materializeUse(graphDir, rootUse),
    hops,
    leafModel: currentModel,
  };
}

function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      continue;
    }
    options[token.slice(2)] = rest[index + 1];
    index += 1;
  }
  return {
    command,
    options,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runCli(argv) {
  const { command, options } = parseCliArgs(argv);
  if (!command) {
    throw new Error('Command is required');
  }
  switch (command) {
    case 'build':
      printJson(buildFlowSchemaGraph({
        sourceDir: options['source-dir'],
        outDir: options['out-dir'],
      }));
      return;
    case 'resolve-use':
      printJson(resolveModel(options['graph-dir'], options.use));
      return;
    case 'resolve-slot':
      printJson(resolveSlotCatalog(options['graph-dir'], options.use, options.slot));
      return;
    case 'materialize-use':
      printJson(materializeUse(options['graph-dir'], options.use));
      return;
    case 'hydrate-branch':
      printJson(hydrateBranch(options['graph-dir'], options['root-use'], options.path));
      return;
    case 'rewrite-artifact-names':
      printJson(rewriteArtifactNames(options['graph-dir']));
      return;
    default:
      throw new Error(`Unsupported command: ${command}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
