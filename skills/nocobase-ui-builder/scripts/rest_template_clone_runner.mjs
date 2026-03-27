#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCKER_EXIT_CODE, VALIDATION_CASE_MODE, auditPayload, canonicalizePayload, extractRequiredMetadata } from './flow_payload_guard.mjs';
import {
  resolveEffectiveMenuPlacement,
  resolveMenuParentRoute,
} from './menu_placement_runtime.mjs';
import { reservePage } from './opaque_uid.mjs';
import { resolveSessionPaths } from './session_state.mjs';
import { remapTemplateTreeToTarget, summarizeModelTree } from './template_clone_helpers.mjs';
import { resolveFilterFieldModelSpec } from './filter_form_field_resolver.mjs';

const PAGE_ROOT_USES = new Set(['RootPageModel', 'PageModel', 'ChildPageModel']);
const GRID_ROOT_USES = new Set([
  'BlockGridModel',
  'FormGridModel',
  'DetailsGridModel',
  'FilterFormGridModel',
  'AssignFormGridModel',
]);
const TEMPLATE_PRIORITY_BUILDERS = [
  (caseId) => `${caseId}-remap-payload.json`,
  (caseId) => `${caseId}-canonicalized-page.json`,
  (caseId) => `${caseId}-canonicalized-grid.json`,
  (caseId) => `${caseId}-remapped-page.json`,
  (caseId) => `${caseId}-remapped-grid.json`,
  () => 'payload-canonical.json',
  () => 'payload-patched.json',
  () => 'draft-after-patch.json',
  (caseId) => `${caseId}-draft-page.json`,
  (caseId) => `${caseId}-draft-grid.json`,
  () => 'source-template.json',
  () => 'source-grid.json',
  () => 'source-page.json',
];

function usage() {
  return [
    'Usage:',
    '  node scripts/rest_template_clone_runner.mjs build',
    '    --case-id <caseId>',
    '    --title <page title>',
    '    --template-artifacts-dir <dir>',
    '    [--session-id <id>]',
    '    [--session-root <path>]',
    '    [--out-dir <dir>]',
    '    [--requirements-file <compile-artifact.json>]',
    '    [--url-base <http://127.0.0.1:23000 | http://127.0.0.1:23000/admin>]',
    '    [--icon <icon>]',
    '    [--parent-id <desktopRouteId>]',
    '    [--menu-mode <auto|group|root>]',
    '    [--menu-group-title <title>]',
    '    [--existing-group-route-id <id>]',
    '    [--existing-group-title <title>]',
    '    [--registry-path <path>]',
  ].join('\n');
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    return { command: 'help', flags: {} };
  }
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { command, flags };
}

function normalizeRequiredText(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeUrlBase(urlBase) {
  const normalized = normalizeRequiredText(urlBase || 'http://127.0.0.1:23000', 'url base')
    .replace(/\/+$/, '');
  if (normalized.endsWith('/admin')) {
    return {
      apiBase: normalized.slice(0, -'/admin'.length),
      adminBase: normalized,
    };
  }
  return {
    apiBase: normalized,
    adminBase: `${normalized}/admin`,
  };
}

function buildPageUrl(adminBase, schemaUid) {
  return `${adminBase.replace(/\/+$/, '')}/${encodeURIComponent(schemaUid)}`;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function walkModel(node, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }
  visit(node);
  const subModels = node.subModels && typeof node.subModels === 'object' ? node.subModels : {};
  for (const value of Object.values(subModels)) {
    if (Array.isArray(value)) {
      value.forEach((child) => walkModel(child, visit));
      continue;
    }
    walkModel(value, visit);
  }
}

function safeBasename(filePath) {
  return filePath ? path.basename(filePath) : '';
}

function uniqueStrings(values) {
  return [...new Set(
    values
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function buildTemplatePriorityList(caseId) {
  return TEMPLATE_PRIORITY_BUILDERS
    .map((builder) => builder(caseId))
    .filter(Boolean);
}

function scoreFallbackTemplateFile(name) {
  const normalized = name.toLowerCase();
  let score = 0;
  if (!normalized.endsWith('.json')) {
    return -1;
  }
  if (normalized.includes('payload')) {
    score += 40;
  }
  if (normalized.includes('template')) {
    score += 25;
  }
  if (normalized.includes('source-page')) {
    score += 20;
  }
  if (normalized.includes('source-grid')) {
    score += 18;
  }
  if (normalized.includes('source-')) {
    score += 12;
  }
  if (normalized.includes('anchor-')) {
    score -= 50;
  }
  if (normalized.includes('metadata')) {
    score -= 40;
  }
  if (normalized.includes('readback') || normalized.includes('save-result')) {
    score -= 30;
  }
  return score;
}

export function discoverTemplatePayloadFile({ templateArtifactsDir, caseId }) {
  const resolvedDir = path.resolve(normalizeRequiredText(templateArtifactsDir, 'template artifacts dir'));
  if (!fileExists(resolvedDir)) {
    throw new Error(`template artifacts dir does not exist: ${resolvedDir}`);
  }

  const entries = fs.readdirSync(resolvedDir);
  for (const candidate of buildTemplatePriorityList(caseId)) {
    if (entries.includes(candidate)) {
      return path.join(resolvedDir, candidate);
    }
  }

  const rankedFallback = entries
    .map((name) => ({ name, score: scoreFallbackTemplateFile(name) }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  if (rankedFallback[0]) {
    return path.join(resolvedDir, rankedFallback[0].name);
  }

  throw new Error(`no template payload candidate was found under ${resolvedDir}`);
}

export function unwrapResponseEnvelope(value) {
  let current = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (!trimmed) {
        return current;
      }
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return current;
      }
    }

    if (!isPlainObject(current)) {
      return current;
    }

    if (current.type === 'mcp_tool_call_output' && Array.isArray(current.output?.content)) {
      const textContent = current.output.content.find((item) => item?.type === 'text' && typeof item.text === 'string');
      if (!textContent) {
        return current;
      }
      current = textContent.text;
      continue;
    }

    if (isPlainObject(current.body)) {
      current = current.body;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data;
      continue;
    }

    return current;
  }

  return current;
}

function loadTemplatePayload(filePath) {
  const raw = readJson(filePath);
  const unwrapped = unwrapResponseEnvelope(raw);
  if (!isPlainObject(unwrapped) || typeof unwrapped.use !== 'string') {
    throw new Error(`template payload is not a flow model snapshot: ${filePath}`);
  }
  return {
    raw,
    payload: cloneJson(unwrapped),
  };
}

export function detectCloneTarget({ sourceModel, filePath = '' }) {
  const normalizedUse = typeof sourceModel?.use === 'string' ? sourceModel.use : '';
  const normalizedSubKey = typeof sourceModel?.subKey === 'string' ? sourceModel.subKey : '';
  const baseName = safeBasename(filePath).toLowerCase();

  if (PAGE_ROOT_USES.has(normalizedUse) || normalizedUse.endsWith('PageModel') || normalizedSubKey === 'page') {
    return 'page';
  }
  if (GRID_ROOT_USES.has(normalizedUse) || normalizedUse.endsWith('GridModel') || normalizedSubKey === 'grid') {
    return 'grid';
  }
  if (baseName.includes('page')) {
    return 'page';
  }
  if (baseName.includes('grid') || baseName.includes('template') || baseName.includes('payload')) {
    return 'grid';
  }
  throw new Error(`unable to detect clone target for use "${normalizedUse}" from ${filePath || 'inline payload'}`);
}

function normalizeCollectionMeta(collection) {
  return {
    name: collection?.name || '',
    titleField: collection?.titleField || collection?.values?.titleField || '',
    filterTargetKey: collection?.filterTargetKey ?? collection?.values?.filterTargetKey ?? '',
    fields: Array.isArray(collection?.fields)
      ? collection.fields.map((field) => ({
        ...field,
      }))
      : [],
  };
}

function buildMetadataMap(collections) {
  const mapped = {};
  for (const collection of collections) {
    if (!collection?.name) {
      continue;
    }
    mapped[collection.name] = normalizeCollectionMeta(collection);
  }
  return {
    collections: mapped,
  };
}

function mergeMetadata(base, extra) {
  const merged = {
    collections: {
      ...(isPlainObject(base?.collections) ? base.collections : {}),
    },
  };
  for (const [collectionName, meta] of Object.entries(isPlainObject(extra?.collections) ? extra.collections : {})) {
    merged.collections[collectionName] = meta;
  }
  return merged;
}

function collectRequiredCollectionNames(payload, metadata = {}, seed = []) {
  const requiredMetadata = extractRequiredMetadata({ payload, metadata });
  return uniqueStrings([
    ...seed,
    ...requiredMetadata.collectionRefs.map((item) => item.collectionName),
  ]).sort((left, right) => left.localeCompare(right));
}

function loadCompileArtifact(filePath) {
  if (!filePath) {
    return {
      raw: {},
      guardRequirements: {},
      readbackContract: {},
      requiredCollections: [],
      scenarioId: '',
      scenarioTitle: '',
    };
  }
  const raw = readJson(filePath);
  return {
    raw,
    guardRequirements: isPlainObject(raw.guardRequirements) ? raw.guardRequirements : {},
    readbackContract: isPlainObject(raw.readbackContract) ? raw.readbackContract : {},
    requiredCollections: Array.isArray(raw.requiredMetadataRefs?.collections) ? raw.requiredMetadataRefs.collections : [],
    scenarioId: normalizeOptionalText(raw.scenarioId),
    scenarioTitle: normalizeOptionalText(raw.scenarioTitle),
  };
}

function fillMissingFilterFieldDescriptors(model, metadata) {
  if (!isPlainObject(model)) {
    return 0;
  }

  let changed = 0;
  walkModel(model, (node) => {
    if (!isPlainObject(node) || node.use !== 'FilterFormItemModel') {
      return;
    }
    const filterInit = node.stepParams?.filterFormItemSettings?.init;
    const fieldInit = node.stepParams?.fieldSettings?.init;
    if (!isPlainObject(filterInit) || !isPlainObject(fieldInit)) {
      return;
    }
    const fieldSpec = resolveFilterFieldModelSpec({
      metadata,
      collectionName: fieldInit.collectionName,
      fieldPath: fieldInit.fieldPath,
    });
    if (!isPlainObject(fieldSpec?.descriptor)) {
      return;
    }

    const nextDescriptor = cloneJson(fieldSpec.descriptor);
    if (JSON.stringify(filterInit.filterField ?? null) !== JSON.stringify(nextDescriptor)) {
      filterInit.filterField = nextDescriptor;
      changed += 1;
    }
  });

  return changed;
}

export function normalizeFilterItemFieldModelUses(model, metadata) {
  if (!isPlainObject(model)) {
    return 0;
  }

  let changed = 0;
  walkModel(model, (node) => {
    if (!isPlainObject(node) || node.use !== 'FilterFormItemModel') {
      return;
    }
    const fieldNode = node.subModels?.field;
    if (!isPlainObject(fieldNode)) {
      return;
    }

    const fieldInit = node.stepParams?.fieldSettings?.init;
    const collectionName = normalizeOptionalText(fieldInit?.collectionName);
    const fieldPath = normalizeOptionalText(fieldInit?.fieldPath);
    if (!collectionName || !fieldPath) {
      return;
    }

    const fieldSpec = resolveFilterFieldModelSpec({
      metadata,
      collectionName,
      fieldPath,
    });
    if (!Array.isArray(fieldSpec?.preferredUses) || fieldSpec.preferredUses.length === 0) {
      return;
    }

    let mutated = false;
    if (fieldSpec.use && !fieldSpec.preferredUses.includes(fieldNode.use)) {
      fieldNode.use = fieldSpec.use;
      mutated = true;
    }

    const filterInit = node.stepParams?.filterFormItemSettings?.init;
    if (isPlainObject(filterInit) && isPlainObject(fieldSpec.descriptor)) {
      const currentDescriptor = isPlainObject(filterInit.filterField) ? filterInit.filterField : null;
      const nextDescriptor = cloneJson(fieldSpec.descriptor);
      if (JSON.stringify(currentDescriptor) !== JSON.stringify(nextDescriptor)) {
        filterInit.filterField = nextDescriptor;
        mutated = true;
      }
    }

    if (mutated) {
      changed += 1;
    }
  });

  return changed;
}

function throwRestExecutionRemoved() {
  throw new Error('rest_template_clone_runner no longer performs direct NocoBase REST writes; use MCP artifacts with ui_write_wrapper instead');
}

async function fetchAccessibleTree() {
  throwRestExecutionRemoved();
}

function findRouteNodeBySchemaUid(nodes, schemaUid) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!isPlainObject(node)) {
      continue;
    }
    if (node.schemaUid === schemaUid) {
      return node;
    }
    const nested = findRouteNodeBySchemaUid(node.children, schemaUid);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function probeRouteReady(routeTree, schemaUid) {
  const pageNode = findRouteNodeBySchemaUid(routeTree, schemaUid);
  const defaultTabSchemaUid = `tabs-${schemaUid}`;
  const defaultTabNode = pageNode
    ? (Array.isArray(pageNode.children) ? pageNode.children.find((item) => item?.schemaUid === defaultTabSchemaUid) ?? null : null)
    : null;
  return {
    ok: Boolean(pageNode && defaultTabNode),
    pageFound: Boolean(pageNode),
    defaultTabFound: Boolean(defaultTabNode),
    pageType: pageNode?.type || '',
    defaultTabType: defaultTabNode?.type || '',
    defaultTabHidden: Boolean(defaultTabNode?.hidden),
  };
}

async function createPageShell() {
  throwRestExecutionRemoved();
}

async function upsertGroupRoute() {
  throwRestExecutionRemoved();
}

async function fetchAnchorModel() {
  throwRestExecutionRemoved();
}

async function saveFlowModel() {
  throwRestExecutionRemoved();
}

async function fetchCollectionsMeta() {
  throwRestExecutionRemoved();
}

async function resolveLiveMetadata({
  apiBase,
  token,
  payload,
  seedCollections = [],
  collectionsMetaList = null,
  initialMetadata = {},
}) {
  const allCollectionsResponse = collectionsMetaList
    ? { data: collectionsMetaList }
    : await fetchCollectionsMeta({ apiBase, token });
  const allCollections = Array.isArray(allCollectionsResponse.data) ? allCollectionsResponse.data : [];
  const collectionIndex = new Map(allCollections.map((item) => [item?.name, item]));

  let metadata = mergeMetadata({ collections: {} }, initialMetadata);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const requiredNames = collectRequiredCollectionNames(payload, metadata, seedCollections);
    const missingNames = requiredNames.filter((name) => !metadata.collections[name]);
    if (missingNames.length === 0) {
      return {
        metadata,
        missingCollections: [],
        availableCollectionCount: allCollections.length,
      };
    }

    const fetched = [];
    for (const name of missingNames) {
      const collectionMeta = collectionIndex.get(name);
      if (collectionMeta) {
        fetched.push(collectionMeta);
      }
    }

    metadata = mergeMetadata(metadata, buildMetadataMap(fetched));

    const unresolvedAfterFetch = collectRequiredCollectionNames(payload, metadata, seedCollections)
      .filter((name) => !metadata.collections[name]);
    if (unresolvedAfterFetch.length === 0 || fetched.length === 0) {
      return {
        metadata,
        missingCollections: unresolvedAfterFetch,
        availableCollectionCount: allCollections.length,
      };
    }
  }

  return {
    metadata,
    missingCollections: collectRequiredCollectionNames(payload, metadata, seedCollections)
      .filter((name) => !metadata.collections[name]),
    availableCollectionCount: Array.isArray(collectionsMetaList) ? collectionsMetaList.length : 0,
  };
}

function collectTopLevelUses(model) {
  const uses = [];
  if (Array.isArray(model?.subModels?.items)) {
    uses.push(...model.subModels.items.map((item) => item?.use).filter(Boolean));
  }
  if (Array.isArray(model?.subModels?.tabs)) {
    uses.push(...model.subModels.tabs.map((item) => item?.use).filter(Boolean));
  }
  return uniqueStrings(uses).sort((left, right) => left.localeCompare(right));
}

function collectVisibleTabTitles(model) {
  return uniqueStrings(
    (Array.isArray(model?.subModels?.tabs) ? model.subModels.tabs : [])
      .map((tab) => tab?.stepParams?.pageTabSettings?.tab?.title)
      .filter(Boolean),
  );
}

function isBlockLikeUse(use) {
  const normalized = normalizeOptionalText(use);
  return normalized.endsWith('BlockModel')
    || normalized === 'CreateFormModel'
    || normalized === 'EditFormModel';
}

function collectTabDescriptors(model) {
  return (Array.isArray(model?.subModels?.tabs) ? model.subModels.tabs : [])
    .map((tab, index) => ({
      index,
      title: normalizeOptionalText(tab?.stepParams?.pageTabSettings?.tab?.title),
      tab,
      grid: isPlainObject(tab?.subModels?.grid) ? tab.subModels.grid : null,
    }));
}

function collectBlockUsesFromScope(scopeNode) {
  const blockUses = [];
  walkModel(scopeNode, (node) => {
    if (!isPlainObject(node)) {
      return;
    }
    const use = normalizeOptionalText(node.use);
    if (!isBlockLikeUse(use)) {
      return;
    }
    blockUses.push(use);
  });
  return uniqueStrings(blockUses).sort((left, right) => left.localeCompare(right));
}

function normalizeFilterManagerConfigs(filterManager) {
  if (!Array.isArray(filterManager)) {
    return [];
  }
  return filterManager
    .filter((item) => isPlainObject(item))
    .map((item) => ({
      filterId: normalizeOptionalText(item.filterId),
      targetId: normalizeOptionalText(item.targetId),
      filterPaths: uniqueStrings(Array.isArray(item.filterPaths) ? item.filterPaths : []),
    }))
    .filter((item) => item.filterId && item.targetId && item.filterPaths.length > 0);
}

function collectFilterBindingEvidence(scopeNode) {
  const filterItems = [];
  const targetBlocks = new Map();
  const filterManagerConfigs = [];

  walkModel(scopeNode, (node) => {
    if (!isPlainObject(node)) {
      return;
    }
    const use = normalizeOptionalText(node.use);
    const uid = normalizeOptionalText(node.uid);
    if (isBlockLikeUse(use) && uid) {
      targetBlocks.set(uid, use);
    }
    if (use === 'FilterFormItemModel') {
      filterItems.push({
        uid,
        collectionName: normalizeOptionalText(node?.stepParams?.fieldSettings?.init?.collectionName),
        fieldPath: normalizeOptionalText(node?.stepParams?.fieldSettings?.init?.fieldPath),
        defaultTargetUid: normalizeOptionalText(node?.stepParams?.filterFormItemSettings?.init?.defaultTargetUid),
      });
    }
    if (Array.isArray(node.filterManager)) {
      filterManagerConfigs.push(...normalizeFilterManagerConfigs(node.filterManager));
    }
  });

  return {
    filterItems,
    targetBlocks,
    filterManagerConfigs,
  };
}

function matchesFilterField(filterPaths, fieldName) {
  return filterPaths.some((item) => item === fieldName || item.startsWith(`${fieldName}.`));
}

function collectScopeNodesForBinding(model, binding) {
  const scopePath = normalizeOptionalText(binding?.scopePath);
  if (scopePath) {
    const scopeNodes = collectStructuredScopes(model)
      .filter((scope) => scope.scopePath === scopePath)
      .map((scope) => scope.gridNode || scope.node)
      .filter(Boolean);
    if (scopeNodes.length > 0) {
      return scopeNodes;
    }
  }
  const tabTitle = normalizeOptionalText(binding?.tabTitle);
  if (!tabTitle) {
    return [model];
  }
  return collectTabDescriptors(model)
    .filter((tab) => tab.title === tabTitle)
    .map((tab) => tab.grid || tab.tab);
}

function isPageLikeUse(use) {
  return normalizeOptionalText(use).endsWith('PageModel');
}

function isTabLikeUse(use) {
  return normalizeOptionalText(use).endsWith('PageTabModel');
}

function collectScopeGridNode(scopeNode) {
  if (!isPlainObject(scopeNode)) {
    return null;
  }
  if (scopeNode.use === 'BlockGridModel') {
    return scopeNode;
  }
  return isPlainObject(scopeNode?.subModels?.grid) ? scopeNode.subModels.grid : null;
}

function collectDirectBlockNodes(scopeNode) {
  const gridNode = collectScopeGridNode(scopeNode);
  return (Array.isArray(gridNode?.subModels?.items) ? gridNode.subModels.items : [])
    .filter((item) => isPlainObject(item) && isBlockLikeUse(item.use));
}

function collectScopeTabDescriptors(scopeNode) {
  return (Array.isArray(scopeNode?.subModels?.tabs) ? scopeNode.subModels.tabs : [])
    .map((tabNode, index) => ({
      index,
      tabNode,
      gridNode: collectScopeGridNode(tabNode),
    }))
    .filter((item) => isPlainObject(item.tabNode) && isTabLikeUse(item.tabNode.use));
}

function collectNestedBlockNodes(blockNode) {
  return (Array.isArray(blockNode?.subModels?.grid?.subModels?.items) ? blockNode.subModels.grid.subModels.items : [])
    .filter((item) => isPlainObject(item) && isBlockLikeUse(item.use));
}

function collectActionDescriptorsFromBlock(blockNode, blockPath) {
  const descriptors = [];
  const directActions = Array.isArray(blockNode?.subModels?.actions) ? blockNode.subModels.actions : [];
  const directActionPath = blockNode?.use === 'DetailsBlockModel' ? 'details-actions' : 'block-actions';
  directActions.forEach((actionNode, index) => {
    if (!isPlainObject(actionNode)) {
      return;
    }
    descriptors.push({
      path: `${blockPath}.${directActionPath}[${index}]`,
      node: actionNode,
      scope: directActionPath,
    });
  });

  if (blockNode?.use === 'TableBlockModel') {
    const rowActionNodes = [];
    const columns = Array.isArray(blockNode?.subModels?.columns) ? blockNode.subModels.columns : [];
    columns.forEach((columnNode) => {
      if (!isPlainObject(columnNode) || columnNode.use !== 'TableActionsColumnModel') {
        return;
      }
      const actions = Array.isArray(columnNode?.subModels?.actions) ? columnNode.subModels.actions : [];
      actions.forEach((actionNode) => {
        if (isPlainObject(actionNode)) {
          rowActionNodes.push(actionNode);
        }
      });
    });
    rowActionNodes.forEach((actionNode, index) => {
      descriptors.push({
        path: `${blockPath}.row-actions[${index}]`,
        node: actionNode,
        scope: 'row-actions',
      });
    });
  }

  return descriptors;
}

function collectDetailsBlockEvidenceFromBlocks(blockNodes) {
  const detailsBlocks = [];
  const visitBlocks = (items) => {
    items.forEach((blockNode) => {
      if (!isPlainObject(blockNode) || !isBlockLikeUse(blockNode.use)) {
        return;
      }
      if (blockNode.use === 'DetailsBlockModel') {
        const detailItems = (Array.isArray(blockNode?.subModels?.grid?.subModels?.items)
          ? blockNode.subModels.grid.subModels.items
          : [])
          .filter((item) => isPlainObject(item) && item.use === 'DetailsItemModel');
        detailsBlocks.push({
          collectionName: normalizeOptionalText(blockNode?.stepParams?.resourceSettings?.init?.collectionName),
          fieldPaths: uniqueStrings(detailItems.map((item) => normalizeOptionalText(item?.stepParams?.fieldSettings?.init?.fieldPath))),
          itemCount: detailItems.length,
          filterByTk: normalizeOptionalText(blockNode?.stepParams?.resourceSettings?.init?.filterByTk),
        });
      }
      visitBlocks(collectNestedBlockNodes(blockNode));
    });
  };
  visitBlocks(Array.isArray(blockNodes) ? blockNodes : []);
  return detailsBlocks;
}

function collectScopeDetailsBlocks(scopeNode) {
  const detailsBlocks = [
    ...collectDetailsBlockEvidenceFromBlocks(collectDirectBlockNodes(scopeNode)),
  ];
  collectScopeTabDescriptors(scopeNode).forEach(({ tabNode }) => {
    detailsBlocks.push(...collectScopeDetailsBlocks(tabNode));
  });
  return detailsBlocks;
}

function scopeHasRequiredBlockGrid(scopeNode) {
  const directGridNode = collectScopeGridNode(scopeNode);
  if (isPlainObject(directGridNode) && directGridNode.use === 'BlockGridModel') {
    return true;
  }
  const tabDescriptors = collectScopeTabDescriptors(scopeNode);
  if (tabDescriptors.length === 0) {
    return false;
  }
  return tabDescriptors.every(({ gridNode }) => isPlainObject(gridNode) && gridNode.use === 'BlockGridModel');
}

function collectStructuredScopes(model) {
  const scopes = [];

  const visitBlocks = (blockNodes, scopePath) => {
    blockNodes.forEach((blockNode, index) => {
      if (!isPlainObject(blockNode) || !isBlockLikeUse(blockNode.use)) {
        return;
      }
      const blockPath = `${scopePath}.blocks[${index}]`;
      collectActionDescriptorsFromBlock(blockNode, blockPath).forEach((actionDescriptor) => {
        const pageNode = isPlainObject(actionDescriptor.node?.subModels?.page) ? actionDescriptor.node.subModels.page : null;
        if (!pageNode || !isPageLikeUse(pageNode.use)) {
          return;
        }
        visitScope(pageNode, `${actionDescriptor.path}.popup.page`, 'popup-page', '');
      });
      const nestedBlocks = collectNestedBlockNodes(blockNode);
      if (nestedBlocks.length > 0) {
        visitBlocks(nestedBlocks, blockPath);
      }
    });
  };

  const visitScope = (scopeNode, scopePath, scopeKind, tabTitle) => {
    if (!isPlainObject(scopeNode)) {
      return;
    }
    const gridNode = collectScopeGridNode(scopeNode);
    const directBlocks = collectDirectBlockNodes(scopeNode);
    scopes.push({
      scopePath,
      scopeKind,
      pageUse: normalizeOptionalText(scopeNode.use),
      tabTitle: normalizeOptionalText(tabTitle),
      node: scopeNode,
      gridNode,
      hasRequiredBlockGrid: scopeHasRequiredBlockGrid(scopeNode),
      directBlocks,
      blockUses: collectBlockUsesFromScope(gridNode || scopeNode),
      detailsBlocks: collectScopeDetailsBlocks(scopeNode),
      visibleTabTitles: collectVisibleTabTitles(scopeNode),
    });
    visitBlocks(directBlocks, scopePath);

    const tabs = Array.isArray(scopeNode?.subModels?.tabs) ? scopeNode.subModels.tabs : [];
    tabs.forEach((tabNode, index) => {
      if (!isPlainObject(tabNode) || !isTabLikeUse(tabNode.use)) {
        return;
      }
      visitScope(
        tabNode,
        `${scopePath}.tabs[${index}]`,
        scopeKind === 'popup-page' || scopeKind === 'popup-tab' ? 'popup-tab' : 'root-tab',
        normalizeOptionalText(tabNode?.stepParams?.pageTabSettings?.tab?.title),
      );
    });
  };

  if (normalizeOptionalText(model?.use) === 'BlockGridModel') {
    visitScope(model, '$', 'root-grid', '');
  } else if (isPageLikeUse(model?.use)) {
    visitScope(model, '$.page', 'root-page', '');
  } else if (isTabLikeUse(model?.use)) {
    visitScope(model, '$.page.tabs[0]', 'root-tab', normalizeOptionalText(model?.stepParams?.pageTabSettings?.tab?.title));
  }

  return scopes;
}

function deriveRequiredFilterManagerEntryCount(requiredFilterBindings) {
  return (Array.isArray(requiredFilterBindings) ? requiredFilterBindings : []).reduce((count, binding) => {
    if (!isPlainObject(binding)) {
      return count;
    }
    const scopeKind = normalizeOptionalText(binding.scopeKind);
    if (scopeKind === 'popup-page' || scopeKind === 'popup-tab') {
      return count;
    }
    return count + uniqueStrings(Array.isArray(binding.filterFields) ? binding.filterFields : []).length;
  }, 0);
}

function collectFieldHostSnapshots(model) {
  const snapshots = new Map();

  const visitBlocks = (blockNodes, scopePath) => {
    blockNodes.forEach((blockNode, index) => {
      if (!isPlainObject(blockNode) || !isBlockLikeUse(blockNode.use)) {
        return;
      }
      const blockPath = `${scopePath}.blocks[${index}]`;
      if (blockNode.use === 'DetailsBlockModel') {
        const detailItems = Array.isArray(blockNode?.subModels?.grid?.subModels?.items) ? blockNode.subModels.grid.subModels.items : [];
        detailItems.forEach((itemNode, itemIndex) => {
          if (!isPlainObject(itemNode) || itemNode.use !== 'DetailsItemModel') {
            return;
          }
          snapshots.set(`${blockPath}.details-items[${itemIndex}]`, {
            hostUse: itemNode.use,
            fieldUse: normalizeOptionalText(itemNode?.subModels?.field?.use),
            bindingUse: normalizeOptionalText(itemNode?.subModels?.field?.stepParams?.fieldBinding?.use),
            fieldPath: normalizeOptionalText(itemNode?.stepParams?.fieldSettings?.init?.fieldPath),
            collectionName: normalizeOptionalText(itemNode?.stepParams?.fieldSettings?.init?.collectionName),
          });
        });
      }
      if (blockNode.use === 'CreateFormModel' || blockNode.use === 'EditFormModel') {
        const formItems = Array.isArray(blockNode?.subModels?.grid?.subModels?.items) ? blockNode.subModels.grid.subModels.items : [];
        formItems.forEach((itemNode, itemIndex) => {
          if (!isPlainObject(itemNode) || itemNode.use !== 'FormItemModel') {
            return;
          }
          snapshots.set(`${blockPath}.form-items[${itemIndex}]`, {
            hostUse: itemNode.use,
            fieldUse: normalizeOptionalText(itemNode?.subModels?.field?.use),
            bindingUse: normalizeOptionalText(itemNode?.subModels?.field?.stepParams?.fieldBinding?.use),
            fieldPath: normalizeOptionalText(itemNode?.stepParams?.fieldSettings?.init?.fieldPath),
            collectionName: normalizeOptionalText(itemNode?.stepParams?.fieldSettings?.init?.collectionName),
          });
        });
      }
      if (blockNode.use === 'TableBlockModel') {
        const columns = Array.isArray(blockNode?.subModels?.columns) ? blockNode.subModels.columns : [];
        columns.forEach((columnNode, columnIndex) => {
          if (!isPlainObject(columnNode) || columnNode.use !== 'TableColumnModel') {
            return;
          }
          snapshots.set(`${blockPath}.columns[${columnIndex}]`, {
            hostUse: columnNode.use,
            fieldUse: normalizeOptionalText(columnNode?.subModels?.field?.use),
            bindingUse: normalizeOptionalText(columnNode?.subModels?.field?.stepParams?.fieldBinding?.use),
            fieldPath: normalizeOptionalText(columnNode?.stepParams?.fieldSettings?.init?.fieldPath),
            collectionName: normalizeOptionalText(columnNode?.stepParams?.fieldSettings?.init?.collectionName),
          });
        });
      }
      collectActionDescriptorsFromBlock(blockNode, blockPath).forEach((actionDescriptor) => {
        const pageNode = isPlainObject(actionDescriptor.node?.subModels?.page) ? actionDescriptor.node.subModels.page : null;
        if (!pageNode || !isPageLikeUse(pageNode.use)) {
          return;
        }
        visitScope(pageNode, `${actionDescriptor.path}.popup.page`, 'popup-page');
      });
      const nestedBlocks = collectNestedBlockNodes(blockNode);
      if (nestedBlocks.length > 0) {
        visitBlocks(nestedBlocks, blockPath);
      }
    });
  };

  const visitScope = (scopeNode, scopePath, scopeKind) => {
    const directBlocks = collectDirectBlockNodes(scopeNode);
    visitBlocks(directBlocks, scopePath);
    const tabs = Array.isArray(scopeNode?.subModels?.tabs) ? scopeNode.subModels.tabs : [];
    tabs.forEach((tabNode, index) => {
      if (!isPlainObject(tabNode) || !isTabLikeUse(tabNode.use)) {
        return;
      }
      visitScope(tabNode, `${scopePath}.tabs[${index}]`, scopeKind === 'popup-page' ? 'popup-tab' : 'root-tab');
    });
  };

  if (isPageLikeUse(model?.use)) {
    visitScope(model, '$.page', 'root-page');
  }

  return snapshots;
}

function resolveFieldHostEquivalentUse(fieldSnapshot) {
  if (!isPlainObject(fieldSnapshot)) {
    return '';
  }
  return normalizeOptionalText(fieldSnapshot.bindingUse) || normalizeOptionalText(fieldSnapshot.fieldUse);
}

function compareStringLists(left, right) {
  return JSON.stringify(uniqueStrings(left).sort((a, b) => a.localeCompare(b)))
    === JSON.stringify(uniqueStrings(right).sort((a, b) => a.localeCompare(b)));
}

function normalizeSortedStringList(values) {
  return (Array.isArray(values) ? values : [])
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .sort((left, right) => left.localeCompare(right));
}

function collectContractRootScopeEntries(contract = {}) {
  const entries = [];
  const appendEntry = (scopePath, scopeKind) => {
    const normalizedPath = normalizeOptionalText(scopePath);
    const normalizedKind = normalizeOptionalText(scopeKind);
    if (!normalizedPath || !normalizedKind.startsWith('root-')) {
      return;
    }
    entries.push({
      scopePath: normalizedPath,
      scopeKind: normalizedKind,
    });
  };
  (Array.isArray(contract.requiredScopes) ? contract.requiredScopes : []).forEach((item) => appendEntry(item?.scopePath, item?.scopeKind));
  (Array.isArray(contract.requiredGridMembership) ? contract.requiredGridMembership : []).forEach((item) => appendEntry(item?.scopePath, item?.scopeKind));
  (Array.isArray(contract.requiredDetailsBlocks) ? contract.requiredDetailsBlocks : []).forEach((item) => appendEntry(item?.scopePath, item?.scopeKind));
  (Array.isArray(contract.requiredFilterBindings) ? contract.requiredFilterBindings : []).forEach((item) => appendEntry(item?.scopePath, item?.scopeKind));
  return entries.sort((left, right) => left.scopePath.length - right.scopePath.length);
}

function rebaseContractPath(pathValue, anchorScopePath) {
  const normalizedPath = normalizeOptionalText(pathValue);
  const normalizedAnchor = normalizeOptionalText(anchorScopePath);
  if (!normalizedPath || !normalizedAnchor || normalizedAnchor === '$') {
    return normalizedPath;
  }
  if (normalizedPath === normalizedAnchor) {
    return '$';
  }
  if (normalizedPath.startsWith(`${normalizedAnchor}.`)) {
    return `$${normalizedPath.slice(normalizedAnchor.length)}`;
  }
  return normalizedPath;
}

function rebaseScopeDescriptor(entry, anchorScopePath) {
  if (!isPlainObject(entry)) {
    return null;
  }
  const scopePath = rebaseContractPath(entry.scopePath, anchorScopePath);
  if (!scopePath) {
    return null;
  }
  const isRootScope = scopePath === '$' && normalizeOptionalText(entry.scopeKind).startsWith('root-');
  return {
    ...entry,
    scopePath,
    scopeKind: isRootScope ? 'root-grid' : normalizeOptionalText(entry.scopeKind),
    pageUse: isRootScope ? null : (normalizeOptionalText(entry.pageUse) || null),
    tabTitle: isRootScope ? '' : normalizeOptionalText(entry.tabTitle),
  };
}

function rebaseContractList(entries, anchorScopePath, mapper = (item) => item) {
  const dedupe = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => mapper(entry, anchorScopePath))
    .filter(Boolean)
    .filter((entry) => {
      const key = JSON.stringify(entry);
      if (dedupe.has(key)) {
        return false;
      }
      dedupe.add(key);
      return true;
    });
}

export function alignReadbackContractToModel(contract = {}, model) {
  const merged = isPlainObject(contract) ? cloneJson(contract) : {};
  if (normalizeOptionalText(model?.use) !== 'BlockGridModel') {
    return merged;
  }
  const anchorScopePath = collectContractRootScopeEntries(merged)[0]?.scopePath || '';
  merged.requiredTabs = [];
  merged.requiredVisibleTabs = [];
  merged.requiredTabCount = 0;
  merged.requiredTopLevelUses = normalizeSortedStringList(collectTopLevelUses(model));
  if (!anchorScopePath || anchorScopePath === '$') {
    return merged;
  }
  merged.requiredScopes = rebaseContractList(merged.requiredScopes, anchorScopePath, (entry, anchor) => rebaseScopeDescriptor(entry, anchor));
  merged.requiredGridMembership = rebaseContractList(merged.requiredGridMembership, anchorScopePath, (entry, anchor) => {
    const rebased = rebaseScopeDescriptor(entry, anchor);
    return rebased ? { ...entry, ...rebased } : null;
  });
  merged.requiredDetailsBlocks = rebaseContractList(merged.requiredDetailsBlocks, anchorScopePath, (entry, anchor) => {
    const rebased = rebaseScopeDescriptor(entry, anchor);
    return rebased ? { ...entry, ...rebased } : null;
  });
  merged.requiredFilterBindings = rebaseContractList(merged.requiredFilterBindings, anchorScopePath, (entry, anchor) => {
    const rebased = rebaseScopeDescriptor(entry, anchor);
    if (!rebased) {
      return null;
    }
    return {
      ...entry,
      ...rebased,
      filterPath: rebaseContractPath(entry?.filterPath, anchor),
      pageSignature: rebaseContractPath(entry?.pageSignature, anchor) || entry?.pageSignature || null,
    };
  });
  return merged;
}

function compareStringListsWithDuplicates(left, right) {
  return JSON.stringify(normalizeSortedStringList(left)) === JSON.stringify(normalizeSortedStringList(right));
}

function collectGridMembershipSummaryFromGrid(gridNode) {
  if (!isPlainObject(gridNode)) {
    return null;
  }

  const items = (Array.isArray(gridNode?.subModels?.items) ? gridNode.subModels.items : [])
    .filter((item) => isPlainObject(item));
  const itemUids = normalizeSortedStringList(items.map((item) => normalizeOptionalText(item.uid)));
  const itemUses = normalizeSortedStringList(items.map((item) => normalizeOptionalText(item.use)));
  const rawGridSettings = isPlainObject(gridNode?.stepParams?.gridSettings?.grid)
    ? gridNode.stepParams.gridSettings.grid
    : null;
  const rawRows = isPlainObject(rawGridSettings?.rows) ? rawGridSettings.rows : null;
  const layoutItemUids = [];

  if (rawRows) {
    Object.values(rawRows).forEach((columns) => {
      if (!Array.isArray(columns)) {
        return;
      }
      columns.forEach((column) => {
        const uidGroup = Array.isArray(column) ? column : [column];
        uidGroup.forEach((value) => {
          const uid = normalizeOptionalText(value);
          if (uid) {
            layoutItemUids.push(uid);
          }
        });
      });
    });
  }

  const sortedLayoutItemUids = normalizeSortedStringList(layoutItemUids);
  return {
    gridUse: normalizeOptionalText(gridNode.use),
    itemCount: items.length,
    itemUids,
    itemUidSet: new Set(itemUids),
    itemUses,
    hasExplicitLayout: Boolean(rawRows),
    layoutItemUids: sortedLayoutItemUids,
    layoutUidSet: new Set(sortedLayoutItemUids),
  };
}

function collectGridMembershipSnapshots(model) {
  const snapshots = new Map();
  const visit = (node, pathValue) => {
    if (!isPlainObject(node)) {
      return;
    }
    if (normalizeOptionalText(node.use).endsWith('GridModel')) {
      const summary = collectGridMembershipSummaryFromGrid(node);
      if (summary) {
        snapshots.set(pathValue, summary);
      }
    }

    const subModels = isPlainObject(node.subModels) ? node.subModels : {};
    Object.entries(subModels).forEach(([subKey, child]) => {
      if (Array.isArray(child)) {
        child.forEach((item, index) => visit(item, `${pathValue}.subModels.${subKey}[${index}]`));
        return;
      }
      visit(child, `${pathValue}.subModels.${subKey}`);
    });
  };
  visit(model, '$');
  return snapshots;
}

function buildGridMembershipRequirementFromScope(scope) {
  if (!isPlainObject(scope?.gridNode)) {
    return null;
  }
  const directBlocks = Array.isArray(scope.directBlocks) ? scope.directBlocks.filter((item) => isPlainObject(item)) : [];
  if (directBlocks.length === 0) {
    return null;
  }

  const gridSummary = collectGridMembershipSummaryFromGrid(scope.gridNode);
  return {
    scopePath: normalizeOptionalText(scope.scopePath),
    scopeKind: normalizeOptionalText(scope.scopeKind),
    gridUse: normalizeOptionalText(scope.gridNode.use),
    expectedItemCount: directBlocks.length,
    expectedItemUses: normalizeSortedStringList(directBlocks.map((item) => normalizeOptionalText(item.use))),
    expectedItemUids: normalizeSortedStringList(directBlocks.map((item) => normalizeOptionalText(item.uid))),
    requireBidirectionalLayoutMatch: gridSummary?.hasExplicitLayout === true,
  };
}

export function augmentReadbackContractWithModelDefaults(contract = {}, model) {
  const merged = isPlainObject(contract) ? cloneJson(contract) : {};
  const requiredTopLevelUses = Array.isArray(merged.requiredTopLevelUses)
    ? normalizeSortedStringList(merged.requiredTopLevelUses)
    : [];
  if (requiredTopLevelUses.length === 0) {
    merged.requiredTopLevelUses = normalizeSortedStringList(collectTopLevelUses(model));
  } else {
    merged.requiredTopLevelUses = requiredTopLevelUses;
  }

  if (merged.requireFilterManager === true || (Array.isArray(merged.requiredFilterBindings) && merged.requiredFilterBindings.length > 0)) {
    merged.requireFilterManager = true;
    if (!Number.isInteger(merged.requiredFilterManagerEntryCount) || merged.requiredFilterManagerEntryCount <= 0) {
      merged.requiredFilterManagerEntryCount = deriveRequiredFilterManagerEntryCount(merged.requiredFilterBindings);
    }
  }

  return merged;
}

export function augmentReadbackContractWithGridMembership(contract = {}, model) {
  const merged = isPlainObject(contract) ? cloneJson(contract) : {};
  const requiredGridMembership = Array.isArray(merged.requiredGridMembership)
    ? merged.requiredGridMembership.filter((item) => isPlainObject(item)).map((item) => cloneJson(item))
    : [];
  const indexByScopePath = new Map(
    requiredGridMembership
      .map((item, index) => [normalizeOptionalText(item.scopePath), index])
      .filter(([scopePath]) => Boolean(scopePath)),
  );

  collectStructuredScopes(model)
    .map((scope) => buildGridMembershipRequirementFromScope(scope))
    .filter(Boolean)
    .forEach((derived) => {
      const scopePath = derived.scopePath;
      if (!scopePath) {
        return;
      }
      if (!indexByScopePath.has(scopePath)) {
        requiredGridMembership.push(derived);
        indexByScopePath.set(scopePath, requiredGridMembership.length - 1);
        return;
      }

      const index = indexByScopePath.get(scopePath);
      const existing = isPlainObject(requiredGridMembership[index]) ? requiredGridMembership[index] : {};
      requiredGridMembership[index] = {
        ...existing,
        scopePath,
        scopeKind: normalizeOptionalText(existing.scopeKind) || derived.scopeKind,
        gridUse: normalizeOptionalText(existing.gridUse) || derived.gridUse,
        expectedItemCount: Number.isInteger(existing.expectedItemCount)
          ? existing.expectedItemCount
          : derived.expectedItemCount,
        expectedItemUses: normalizeSortedStringList([
          ...(Array.isArray(existing.expectedItemUses) ? existing.expectedItemUses : []),
          ...derived.expectedItemUses,
        ]),
        expectedItemUids: normalizeSortedStringList([
          ...(Array.isArray(existing.expectedItemUids) ? existing.expectedItemUids : []),
          ...derived.expectedItemUids,
        ]),
        requireBidirectionalLayoutMatch: existing.requireBidirectionalLayoutMatch === true
          || derived.requireBidirectionalLayoutMatch === true,
      };
    });

  merged.requiredGridMembership = requiredGridMembership;
  return merged;
}

export function buildReadbackDriftReport(writeModel, readbackModel) {
  const findings = [];
  const writeScopes = collectStructuredScopes(writeModel);
  const readbackScopes = collectStructuredScopes(readbackModel);
  const writePopupScopes = new Map(writeScopes
    .filter((item) => item.scopeKind === 'popup-page' || item.scopeKind === 'popup-tab')
    .map((item) => [item.scopePath, item]));
  const readbackPopupScopes = new Map(readbackScopes
    .filter((item) => item.scopeKind === 'popup-page' || item.scopeKind === 'popup-tab')
    .map((item) => [item.scopePath, item]));

  const popupScopePaths = uniqueStrings([...writePopupScopes.keys(), ...readbackPopupScopes.keys()]);
  popupScopePaths.forEach((scopePath) => {
    const writeScope = writePopupScopes.get(scopePath) || null;
    const readbackScope = readbackPopupScopes.get(scopePath) || null;
    if (!writeScope || !readbackScope) {
      findings.push({
        severity: 'warning',
        code: 'READBACK_POPUP_SCOPE_DRIFT',
        message: `Popup scope "${scopePath}" is inconsistent between write and readback.`,
        details: {
          scopePath,
          writePresent: Boolean(writeScope),
          readbackPresent: Boolean(readbackScope),
        },
      });
      return;
    }
    if (
      writeScope.pageUse !== readbackScope.pageUse
      || writeScope.tabTitle !== readbackScope.tabTitle
      || !compareStringLists(writeScope.blockUses, readbackScope.blockUses)
      || !compareStringLists(writeScope.visibleTabTitles, readbackScope.visibleTabTitles)
    ) {
      findings.push({
        severity: 'warning',
        code: 'READBACK_POPUP_SCOPE_DRIFT',
        message: `Popup scope "${scopePath}" drifted structurally in readback.`,
        details: {
          scopePath,
          write: {
            pageUse: writeScope.pageUse,
            tabTitle: writeScope.tabTitle,
            blockUses: writeScope.blockUses,
            visibleTabTitles: writeScope.visibleTabTitles,
          },
          readback: {
            pageUse: readbackScope.pageUse,
            tabTitle: readbackScope.tabTitle,
            blockUses: readbackScope.blockUses,
            visibleTabTitles: readbackScope.visibleTabTitles,
          },
        },
      });
    }
  });

  const writeFields = collectFieldHostSnapshots(writeModel);
  const readbackFields = collectFieldHostSnapshots(readbackModel);
  const fieldPaths = uniqueStrings([...writeFields.keys(), ...readbackFields.keys()]);
  fieldPaths.forEach((fieldPath) => {
    const writeField = writeFields.get(fieldPath) || null;
    const readbackField = readbackFields.get(fieldPath) || null;
    if (!writeField || !readbackField) {
      findings.push({
        severity: 'warning',
        code: 'READBACK_FIELD_MODEL_SHAPE_DRIFT',
        message: `Runtime-sensitive field host "${fieldPath}" is inconsistent between write and readback.`,
        details: {
          fieldPath,
          writePresent: Boolean(writeField),
          readbackPresent: Boolean(readbackField),
        },
      });
      return;
    }
    if (
      writeField.hostUse !== readbackField.hostUse
      || resolveFieldHostEquivalentUse(writeField) !== resolveFieldHostEquivalentUse(readbackField)
      || writeField.collectionName !== readbackField.collectionName
      || writeField.fieldPath !== readbackField.fieldPath
    ) {
      findings.push({
        severity: 'warning',
        code: 'READBACK_FIELD_MODEL_SHAPE_DRIFT',
        message: `The field subtree of runtime-sensitive field host "${fieldPath}" drifted in readback.`,
        details: {
          fieldPath,
          write: {
            ...writeField,
            resolvedFieldUse: resolveFieldHostEquivalentUse(writeField),
          },
          readback: {
            ...readbackField,
            resolvedFieldUse: resolveFieldHostEquivalentUse(readbackField),
          },
        },
      });
    }
  });

  const writeGridSnapshots = collectGridMembershipSnapshots(writeModel);
  const readbackGridSnapshots = collectGridMembershipSnapshots(readbackModel);
  const gridSnapshotPaths = uniqueStrings([...writeGridSnapshots.keys(), ...readbackGridSnapshots.keys()]);
  gridSnapshotPaths.forEach((gridPath) => {
    const writeGrid = writeGridSnapshots.get(gridPath) || null;
    const readbackGrid = readbackGridSnapshots.get(gridPath) || null;
    if (!writeGrid || !readbackGrid) {
      findings.push({
        severity: 'warning',
        code: 'READBACK_GRID_SCOPE_DRIFT',
        message: `Grid scope "${gridPath}" is inconsistent between write and readback.`,
        details: {
          gridPath,
          writePresent: Boolean(writeGrid),
          readbackPresent: Boolean(readbackGrid),
        },
      });
      return;
    }

    if (
      writeGrid.gridUse !== readbackGrid.gridUse
      || writeGrid.itemCount !== readbackGrid.itemCount
      || !compareStringListsWithDuplicates(writeGrid.itemUses, readbackGrid.itemUses)
      || writeGrid.hasExplicitLayout !== readbackGrid.hasExplicitLayout
      || (writeGrid.hasExplicitLayout && writeGrid.layoutItemUids.length !== readbackGrid.layoutItemUids.length)
    ) {
      findings.push({
        severity: 'warning',
        code: 'READBACK_GRID_MEMBERSHIP_DRIFT',
        message: `The items/layout of grid scope "${gridPath}" drifted in readback.`,
        details: {
          gridPath,
          write: {
            gridUse: writeGrid.gridUse,
            itemCount: writeGrid.itemCount,
            itemUses: writeGrid.itemUses,
            hasExplicitLayout: writeGrid.hasExplicitLayout,
            layoutItemCount: writeGrid.layoutItemUids.length,
          },
          readback: {
            gridUse: readbackGrid.gridUse,
            itemCount: readbackGrid.itemCount,
            itemUses: readbackGrid.itemUses,
            hasExplicitLayout: readbackGrid.hasExplicitLayout,
            layoutItemCount: readbackGrid.layoutItemUids.length,
          },
        },
      });
    }
  });

  return {
    ok: findings.length === 0,
    findings,
    summary: {
      writePopupScopeCount: writePopupScopes.size,
      readbackPopupScopeCount: readbackPopupScopes.size,
      writeFieldSnapshotCount: writeFields.size,
      readbackFieldSnapshotCount: readbackFields.size,
      writeGridSnapshotCount: writeGridSnapshots.size,
      readbackGridSnapshotCount: readbackGridSnapshots.size,
      driftCount: findings.length,
    },
  };
}

export function validateReadbackContract(model, contract = {}) {
  const findings = [];
  const topLevelUses = collectTopLevelUses(model);
  const visibleTabTitles = collectVisibleTabTitles(model);
  const tabDescriptors = collectTabDescriptors(model);
  const structuredScopes = collectStructuredScopes(model);
  const structuredScopeByPath = new Map(structuredScopes.map((item) => [item.scopePath, item]));
  const requiredTopLevelUses = Array.isArray(contract.requiredTopLevelUses) ? contract.requiredTopLevelUses : [];
  const requiredVisibleTabs = Array.isArray(contract.requiredVisibleTabs) ? contract.requiredVisibleTabs : [];
  const requiredTabCount = Number.isInteger(contract.requiredTabCount) ? contract.requiredTabCount : 0;
  const requiredTabs = Array.isArray(contract.requiredTabs) ? contract.requiredTabs : [];
  const requiredScopes = Array.isArray(contract.requiredScopes) ? contract.requiredScopes : [];
  const requiredGridMembership = Array.isArray(contract.requiredGridMembership) ? contract.requiredGridMembership : [];
  const requiredDetailsBlocks = Array.isArray(contract.requiredDetailsBlocks) ? contract.requiredDetailsBlocks : [];
  const requireFilterManager = contract.requireFilterManager === true;
  const requiredFilterManagerEntryCount = Number.isInteger(contract.requiredFilterManagerEntryCount)
    ? contract.requiredFilterManagerEntryCount
    : 0;
  const requiredFilterBindings = Array.isArray(contract.requiredFilterBindings) ? contract.requiredFilterBindings : [];
  const filterManagerScopes = collectStructuredScopes(model)
    .map((scope) => scope.gridNode)
    .filter((scopeNode) => isPlainObject(scopeNode));
  const filterManagerEntryCount = (filterManagerScopes.length > 0 ? filterManagerScopes : [model]).reduce(
    (count, scopeNode) => count + normalizeFilterManagerConfigs(scopeNode?.filterManager).length,
    0,
  );

  for (const requiredUse of requiredTopLevelUses) {
    if (!topLevelUses.includes(requiredUse)) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_TOP_LEVEL_USE_MISSING',
        message: `Readback is missing top-level use "${requiredUse}".`,
        details: {
          requiredUse,
          topLevelUses,
        },
      });
    }
  }

  for (const title of requiredVisibleTabs) {
    if (!visibleTabTitles.includes(title)) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_VISIBLE_TAB_MISSING',
        message: `Readback is missing visible tab "${title}".`,
        details: {
          title,
          visibleTabTitles,
        },
      });
    }
  }

  requiredTabs.forEach((requirement, index) => {
    if (!isPlainObject(requirement)) {
      return;
    }
    if (requirement.pageUse && normalizeOptionalText(model?.use) && normalizeOptionalText(model.use) !== requirement.pageUse) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_REQUIRED_TAB_PAGE_USE_MISMATCH',
        message: `Readback pageUse is "${normalizeOptionalText(model.use)}", expected "${requirement.pageUse}".`,
        details: {
          index,
          expectedPageUse: requirement.pageUse,
          actualPageUse: normalizeOptionalText(model.use),
        },
      });
    }

    const expectedTitles = Array.isArray(requirement.titles) ? requirement.titles : [];
    const matchedTabs = tabDescriptors.filter((tab) => expectedTitles.includes(tab.title));
    if (expectedTitles.length > 0 && matchedTabs.length !== expectedTitles.length) {
      const missingTitles = expectedTitles.filter((title) => !matchedTabs.some((tab) => tab.title === title));
      findings.push({
        severity: 'blocker',
        code: 'READBACK_REQUIRED_TAB_MISSING',
        message: `Readback is missing tabs required by requiredTabs: ${missingTitles.join(', ')}.`,
        details: {
          index,
          missingTitles,
          visibleTabTitles,
        },
      });
      return;
    }

    if (requirement.requireBlockGrid !== false) {
      const missingGridTitles = matchedTabs
        .filter((tab) => !isPlainObject(tab.grid) || tab.grid.use !== 'BlockGridModel')
        .map((tab) => tab.title || `#${tab.index}`);
      if (missingGridTitles.length > 0) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_REQUIRED_TAB_BLOCK_GRID_MISSING',
          message: `Readback tabs are missing BlockGridModel: ${missingGridTitles.join(', ')}.`,
          details: {
            index,
            missingGridTitles,
          },
        });
      }
    }

    const requiredBlockUses = Array.isArray(requirement.requiredBlockUses) ? requirement.requiredBlockUses : [];
    if (requiredBlockUses.length > 0) {
      const actualBlockUses = uniqueStrings(
        matchedTabs.flatMap((tab) => collectBlockUsesFromScope(tab.grid || tab.tab)),
      ).sort((left, right) => left.localeCompare(right));
      const missingBlockUses = requiredBlockUses.filter((use) => !actualBlockUses.includes(use));
      if (missingBlockUses.length > 0) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_REQUIRED_TAB_BLOCK_USE_MISSING',
          message: `Readback tabs are missing required block uses: ${missingBlockUses.join(', ')}.`,
          details: {
            index,
            expectedTitles,
            requiredBlockUses,
            actualBlockUses,
          },
        });
      }
    }
  });

  if (requiredTabCount > 0 && visibleTabTitles.length !== requiredTabCount) {
    findings.push({
      severity: 'blocker',
      code: 'READBACK_TAB_COUNT_MISMATCH',
      message: `Readback visible-tab count is ${visibleTabTitles.length}, expected ${requiredTabCount}.`,
      details: {
        requiredTabCount,
        actualTabCount: visibleTabTitles.length,
        visibleTabTitles,
      },
    });
  }

  if (requireFilterManager && filterManagerEntryCount < requiredFilterManagerEntryCount) {
    findings.push({
      severity: 'blocker',
      code: 'READBACK_FILTER_MANAGER_MISMATCH',
      message: `Readback filterManager entry count is ${filterManagerEntryCount}, expected at least ${requiredFilterManagerEntryCount}.`,
      details: {
        requiredFilterManagerEntryCount,
        actualFilterManagerEntryCount: filterManagerEntryCount,
      },
    });
  }

  requiredFilterBindings.forEach((binding, index) => {
    if (!isPlainObject(binding)) {
      return;
    }
    const scopeNodes = collectScopeNodesForBinding(model, binding).filter(Boolean);
    if (scopeNodes.length === 0) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_FILTER_SCOPE_MISSING',
        message: `Readback is missing the scope that should contain the filter binding, tab="${normalizeOptionalText(binding.tabTitle) || '$root'}".`,
        details: {
          index,
          binding,
        },
      });
      return;
    }

    const evidence = scopeNodes.reduce((acc, scopeNode) => {
      const current = collectFilterBindingEvidence(scopeNode);
      acc.filterItems.push(...current.filterItems);
      current.targetBlocks.forEach((use, uid) => acc.targetBlocks.set(uid, use));
      acc.filterManagerConfigs.push(...current.filterManagerConfigs);
      return acc;
    }, {
      filterItems: [],
      targetBlocks: new Map(),
      filterManagerConfigs: [],
    });

    const collectionName = normalizeOptionalText(binding.collectionName);
    const expectedTargetUses = uniqueStrings(Array.isArray(binding.targetUses) ? binding.targetUses : []);
    const filterFields = uniqueStrings(Array.isArray(binding.filterFields) ? binding.filterFields : []);

    filterFields.forEach((fieldName) => {
      const matchedItem = evidence.filterItems.find((item) => (
        item.fieldPath === fieldName
        && (!collectionName || item.collectionName === collectionName)
      ));
      if (!matchedItem) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_FILTER_ITEM_MISSING',
          message: `Readback is missing filter item ${collectionName ? `${collectionName}.` : ''}${fieldName}.`,
          details: {
            index,
            fieldName,
            collectionName,
          },
        });
        return;
      }

      const targetUse = matchedItem.defaultTargetUid
        ? evidence.targetBlocks.get(matchedItem.defaultTargetUid) || ''
        : '';
      if (expectedTargetUses.length > 0 && (!targetUse || !expectedTargetUses.includes(targetUse))) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_FILTER_TARGET_MISMATCH',
          message: `Readback filter item ${fieldName} is not connected to the expected target use.`,
          details: {
            index,
            fieldName,
            expectedTargetUses,
            actualTargetUse: targetUse || null,
            defaultTargetUid: matchedItem.defaultTargetUid || null,
          },
        });
      }

      const matchedConfig = evidence.filterManagerConfigs.find((config) => (
        config.filterId === matchedItem.uid
        && config.targetId === matchedItem.defaultTargetUid
        && matchesFilterField(config.filterPaths, fieldName)
      ));
      if (!matchedConfig) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_FILTER_BINDING_MISSING',
          message: `Readback filterManager did not find a stable binding for ${fieldName}.`,
          details: {
            index,
            fieldName,
            filterItemUid: matchedItem.uid || null,
            targetUid: matchedItem.defaultTargetUid || null,
            availableBindings: evidence.filterManagerConfigs,
          },
        });
      }
    });
  });

  requiredScopes.forEach((scopeRequirement, index) => {
    if (!isPlainObject(scopeRequirement)) {
      return;
    }
    const scopePath = normalizeOptionalText(scopeRequirement.scopePath);
    if (!scopePath) {
      return;
    }
    const matchedScope = structuredScopeByPath.get(scopePath) || null;
    if (!matchedScope) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_SCOPE_MISSING',
        message: `Readback is missing scope "${scopePath}".`,
        details: {
          index,
          scopePath,
        },
      });
      return;
    }
    if (normalizeOptionalText(scopeRequirement.pageUse) && matchedScope.pageUse !== normalizeOptionalText(scopeRequirement.pageUse)) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_SCOPE_PAGE_USE_MISMATCH',
        message: `Scope "${scopePath}" has a mismatched pageUse.`,
        details: {
          index,
          scopePath,
          expectedPageUse: normalizeOptionalText(scopeRequirement.pageUse),
          actualPageUse: matchedScope.pageUse,
        },
      });
    }
    if (normalizeOptionalText(scopeRequirement.tabTitle) && matchedScope.tabTitle !== normalizeOptionalText(scopeRequirement.tabTitle)) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_SCOPE_TAB_TITLE_MISMATCH',
        message: `Scope "${scopePath}" has a mismatched tabTitle.`,
        details: {
          index,
          scopePath,
          expectedTabTitle: normalizeOptionalText(scopeRequirement.tabTitle),
          actualTabTitle: matchedScope.tabTitle,
        },
      });
    }
    if (scopeRequirement.requireBlockGrid !== false && matchedScope.hasRequiredBlockGrid !== true) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_SCOPE_BLOCK_GRID_MISSING',
        message: `Scope "${scopePath}" is missing BlockGridModel.`,
        details: {
          index,
          scopePath,
        },
      });
    }
    const requiredBlockUses = uniqueStrings(Array.isArray(scopeRequirement.requiredBlockUses) ? scopeRequirement.requiredBlockUses : []);
    if (requiredBlockUses.length > 0) {
      const missingBlockUses = requiredBlockUses.filter((use) => !matchedScope.blockUses.includes(use));
      if (missingBlockUses.length > 0) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_SCOPE_BLOCK_USE_MISSING',
          message: `Scope "${scopePath}" is missing required block uses: ${missingBlockUses.join(', ')}.`,
          details: {
            index,
            scopePath,
            requiredBlockUses,
            actualBlockUses: matchedScope.blockUses,
          },
        });
      }
    }
  });

  requiredGridMembership.forEach((gridRequirement, index) => {
    if (!isPlainObject(gridRequirement)) {
      return;
    }
    const scopePath = normalizeOptionalText(gridRequirement.scopePath);
    if (!scopePath) {
      return;
    }
    const matchedScope = structuredScopeByPath.get(scopePath) || null;
    if (!matchedScope) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_GRID_SCOPE_MISSING',
        message: `Readback is missing the scope that should contain grid membership "${scopePath}".`,
        details: {
          index,
          scopePath,
        },
      });
      return;
    }

    const actualGrid = collectGridMembershipSummaryFromGrid(matchedScope.gridNode);
    if (!actualGrid) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_GRID_NODE_MISSING',
        message: `Scope "${scopePath}" has no readable grid node.`,
        details: {
          index,
          scopePath,
        },
      });
      return;
    }

    const expectedGridUse = normalizeOptionalText(gridRequirement.gridUse);
    if (expectedGridUse && actualGrid.gridUse !== expectedGridUse) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_GRID_USE_MISMATCH',
        message: `Scope "${scopePath}" has a mismatched grid use.`,
        details: {
          index,
          scopePath,
          expectedGridUse,
          actualGridUse: actualGrid.gridUse,
        },
      });
    }

    const expectedItemCount = Number.isInteger(gridRequirement.expectedItemCount) ? gridRequirement.expectedItemCount : null;
    if (expectedItemCount !== null && actualGrid.itemCount !== expectedItemCount) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_GRID_ITEM_COUNT_MISMATCH',
        message: `Scope "${scopePath}" has a mismatched grid-item count.`,
        details: {
          index,
          scopePath,
          expectedItemCount,
          actualItemCount: actualGrid.itemCount,
        },
      });
    }

    const expectedItemUses = normalizeSortedStringList(gridRequirement.expectedItemUses);
    if (expectedItemUses.length > 0 && !compareStringListsWithDuplicates(expectedItemUses, actualGrid.itemUses)) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_GRID_ITEM_USE_MISMATCH',
        message: `Scope "${scopePath}" has mismatched grid-item uses.`,
        details: {
          index,
          scopePath,
          expectedItemUses,
          actualItemUses: actualGrid.itemUses,
        },
      });
    }

    const expectedItemUids = normalizeSortedStringList(gridRequirement.expectedItemUids);
    if (expectedItemUids.length > 0) {
      const missingExpectedUids = expectedItemUids.filter((uid) => !actualGrid.itemUidSet.has(uid));
      if (missingExpectedUids.length > 0) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_GRID_ITEM_UID_MISSING',
          message: `Scope "${scopePath}" grid is missing an expected item uid.`,
          details: {
            index,
            scopePath,
            expectedItemUids,
            actualItemUids: actualGrid.itemUids,
            missingExpectedUids,
          },
        });
      }
    }

    if (gridRequirement.requireBidirectionalLayoutMatch === true) {
      const orphanLayoutUids = actualGrid.layoutItemUids.filter((uid) => !actualGrid.itemUidSet.has(uid));
      if (orphanLayoutUids.length > 0) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_GRID_LAYOUT_ORPHAN_UID',
          message: `Scope "${scopePath}" layout references an item uid that does not exist.`,
          details: {
            index,
            scopePath,
            orphanLayoutUids,
            actualItemUids: actualGrid.itemUids,
          },
        });
      }

      const unplacedItemUids = actualGrid.itemUids.filter((uid) => !actualGrid.layoutUidSet.has(uid));
      if (unplacedItemUids.length > 0) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_GRID_ITEM_UNPLACED',
          message: `A grid item in scope "${scopePath}" did not land in layout rows.`,
          details: {
            index,
            scopePath,
            unplacedItemUids,
            layoutItemUids: actualGrid.layoutItemUids,
          },
        });
      }
    }
  });

  requiredDetailsBlocks.forEach((detailsRequirement, index) => {
    if (!isPlainObject(detailsRequirement)) {
      return;
    }
    const scopePath = normalizeOptionalText(detailsRequirement.scopePath);
    const matchedScope = structuredScopeByPath.get(scopePath) || null;
    if (!matchedScope) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_DETAILS_BLOCK_MISSING',
        message: `The scope "${scopePath}" for the details block does not exist.`,
        details: {
          index,
          scopePath,
        },
      });
      return;
    }

    const collectionName = normalizeOptionalText(detailsRequirement.collectionName);
    const requiredFieldPaths = uniqueStrings(Array.isArray(detailsRequirement.fieldPaths) ? detailsRequirement.fieldPaths : []);
    const matchingBlocks = matchedScope.detailsBlocks.filter((item) => item.collectionName === collectionName);
    if (matchingBlocks.length === 0) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_DETAILS_BLOCK_MISSING',
        message: `Scope "${scopePath}" is missing DetailsBlockModel for ${collectionName}.`,
        details: {
          index,
          scopePath,
          collectionName,
        },
      });
      return;
    }

    const matchingItemCountBlock = matchingBlocks.find((item) => item.itemCount >= Math.max(1, Number(detailsRequirement.minItemCount) || 1)) || null;
    if (!matchingItemCountBlock) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_DETAILS_ITEM_COUNT_MISMATCH',
        message: `Scope "${scopePath}" does not contain enough details items.`,
        details: {
          index,
          scopePath,
          collectionName,
          expectedMinItemCount: Math.max(1, Number(detailsRequirement.minItemCount) || 1),
          actualItemCounts: matchingBlocks.map((item) => item.itemCount),
        },
      });
      return;
    }

    const matchingFieldBlock = matchingBlocks.find((item) => requiredFieldPaths.every((fieldPath) => item.fieldPaths.includes(fieldPath))) || null;
    if (!matchingFieldBlock) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_DETAILS_FIELD_MISSING',
        message: `The details fields in scope "${scopePath}" are incomplete.`,
        details: {
          index,
          scopePath,
          collectionName,
          requiredFieldPaths,
          actualFieldPaths: matchingBlocks.flatMap((item) => item.fieldPaths),
        },
      });
      return;
    }

    if (detailsRequirement.requireFilterByTkTemplate === true) {
      const expectedFilterByTkTemplate = normalizeOptionalText(detailsRequirement.expectedFilterByTkTemplate);
      if (matchingFieldBlock.filterByTk !== expectedFilterByTkTemplate) {
        findings.push({
          severity: 'blocker',
          code: 'READBACK_DETAILS_FILTER_BY_TK_MISMATCH',
          message: `The details block filterByTk in scope "${scopePath}" does not match the expected template.`,
          details: {
            index,
            scopePath,
            collectionName,
            expectedFilterByTkTemplate,
            actualFilterByTk: matchingFieldBlock.filterByTk || null,
          },
        });
      }
    }
  });

  const filterManagerSummaryScopes = filterManagerScopes.length > 0 ? filterManagerScopes : [model];
  const filterManagerBindings = filterManagerSummaryScopes
    .flatMap((scopeNode) => collectFilterBindingEvidence(scopeNode).filterManagerConfigs)
    .map((config) => `${config.filterId}->${config.targetId}:${config.filterPaths.join('|')}`);

  return {
    ok: findings.length === 0,
    findings,
    summary: {
      topLevelUses,
      visibleTabTitles,
      filterManagerEntryCount,
      structuredScopeCount: structuredScopes.length,
      requiredGridMembershipCount: requiredGridMembership.length,
      tabBlockUses: Object.fromEntries(
        tabDescriptors.map((tab) => [
          tab.title || `#${tab.index}`,
          collectBlockUsesFromScope(tab.grid || tab.tab),
        ]),
      ),
      filterManagerBindings,
    },
  };
}

function reserveFreshPageTitle({
  title,
  registryPath,
  sessionId,
  sessionRoot,
}) {
  const normalizedTitle = normalizeRequiredText(title, 'title');
  const timestampLabel = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidateTitle = attempt === 0
      ? normalizedTitle
      : `${normalizedTitle} ${timestampLabel}${attempt > 1 ? `-${attempt - 1}` : ''}`;
    const result = reservePage({
      title: candidateTitle,
      ...(registryPath ? { registryPath } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(sessionRoot ? { sessionRoot } : {}),
    });
    if (result.created) {
      return {
        ...result,
        requestedTitle: normalizedTitle,
        actualTitle: candidateTitle,
      };
    }
  }

  throw new Error(`unable to reserve a fresh page title for "${normalizedTitle}"`);
}

function determineFinalStatus({
  routeReady,
  auditResult,
  saveError,
  readbackContractResult,
}) {
  if (!auditResult.ok) {
    return 'failed';
  }
  if (saveError) {
    return 'failed';
  }
  if (!routeReady.ok || !readbackContractResult.ok) {
    return 'partial';
  }
  return 'success';
}

async function runBuild() {
  throwRestExecutionRemoved();
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    console.log(usage());
    return;
  }

  if (command !== 'build') {
    throw new Error(`Unsupported command "${command}"`);
  }

  const summary = await runBuild(flags);
  console.log(JSON.stringify(summary, null, 2));
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  buildTemplatePriorityList,
  collectRequiredCollectionNames,
  normalizeUrlBase,
  runBuild,
};
