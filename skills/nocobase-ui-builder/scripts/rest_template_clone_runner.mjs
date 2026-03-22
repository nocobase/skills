#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCKER_EXIT_CODE, VALIDATION_CASE_MODE, auditPayload, canonicalizePayload, extractRequiredMetadata } from './flow_payload_guard.mjs';
import { reservePage } from './opaque_uid.mjs';
import { remapTemplateTreeToTarget, summarizeModelTree } from './template_clone_helpers.mjs';

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
    '    --out-dir <dir>',
    '    [--requirements-file <compile-artifact.json>]',
    '    [--url-base <http://127.0.0.1:23000 | http://127.0.0.1:23000/admin>]',
    '    [--icon <icon>]',
    '    [--parent-id <desktopRouteId>]',
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

function getCollectionMeta(metadata, collectionName) {
  if (!isPlainObject(metadata?.collections) || typeof collectionName !== 'string' || !collectionName.trim()) {
    return null;
  }
  return metadata.collections[collectionName] || null;
}

function getFieldTitle(field) {
  const candidate = field?.uiSchema?.title;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return typeof field?.name === 'string' ? field.name : '';
}

function resolveFieldMeta(metadata, collectionName, fieldPath) {
  if (typeof collectionName !== 'string' || typeof fieldPath !== 'string') {
    return null;
  }
  const segments = fieldPath.split('.').map((item) => item.trim()).filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  let currentCollection = getCollectionMeta(metadata, collectionName);
  let currentField = null;
  for (const segment of segments) {
    if (!currentCollection) {
      return null;
    }
    currentField = Array.isArray(currentCollection.fields)
      ? currentCollection.fields.find((item) => item?.name === segment) || null
      : null;
    if (!currentField) {
      return null;
    }
    if (segment !== segments[segments.length - 1]) {
      currentCollection = getCollectionMeta(metadata, currentField.target);
    }
  }
  return currentField;
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
    if (isPlainObject(filterInit.filterField)) {
      return;
    }

    const fieldMeta = resolveFieldMeta(metadata, fieldInit.collectionName, fieldInit.fieldPath);
    if (!fieldMeta) {
      return;
    }

    filterInit.filterField = {
      name: fieldInit.fieldPath,
      title: getFieldTitle(fieldMeta),
      interface: fieldMeta.interface || '',
      type: fieldMeta.type || '',
      ...(fieldMeta.target ? { target: fieldMeta.target } : {}),
      ...(fieldMeta.foreignKey ? { foreignKey: fieldMeta.foreignKey } : {}),
      ...(fieldMeta.targetKey ? { targetKey: fieldMeta.targetKey } : {}),
    };
    changed += 1;
  });

  return changed;
}

function chooseScalarFilterFieldModelUse(fieldMeta) {
  const interfaceName = normalizeOptionalText(fieldMeta?.interface);
  const fieldType = normalizeOptionalText(fieldMeta?.type);

  if (interfaceName === 'date') {
    return 'DateOnlyFilterFieldModel';
  }
  if (interfaceName === 'datetimeNoTz') {
    return 'DateTimeNoTzFilterFieldModel';
  }
  if (interfaceName === 'datetime' || interfaceName === 'datetimeTz') {
    return 'DateTimeTzFilterFieldModel';
  }
  if (
    interfaceName === 'select'
    || interfaceName === 'radioGroup'
    || interfaceName === 'checkbox'
    || interfaceName === 'checkboxGroup'
    || interfaceName === 'boolean'
    || fieldType === 'boolean'
    || fieldType === 'enum'
  ) {
    return 'SelectFieldModel';
  }
  if (
    interfaceName === 'integer'
    || interfaceName === 'number'
    || interfaceName === 'float'
    || interfaceName === 'double'
    || interfaceName === 'decimal'
    || interfaceName === 'percent'
    || fieldType === 'integer'
    || fieldType === 'bigInt'
    || fieldType === 'float'
    || fieldType === 'double'
    || fieldType === 'decimal'
  ) {
    return 'NumberFieldModel';
  }
  return 'InputFieldModel';
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
    if (!isPlainObject(fieldNode) || fieldNode.use !== 'FilterFormRecordSelectFieldModel') {
      return;
    }

    const fieldInit = node.stepParams?.fieldSettings?.init;
    const collectionName = normalizeOptionalText(fieldInit?.collectionName);
    const fieldPath = normalizeOptionalText(fieldInit?.fieldPath);
    if (!collectionName || !fieldPath) {
      return;
    }

    const fieldMeta = resolveFieldMeta(metadata, collectionName, fieldPath);
    if (!fieldMeta || fieldMeta.target) {
      return;
    }

    const nextUse = chooseScalarFilterFieldModelUse(fieldMeta);
    if (!nextUse || nextUse === fieldNode.use) {
      return;
    }

    fieldNode.use = nextUse;
    changed += 1;
  });

  return changed;
}

async function requestJson({ method = 'GET', url, token, body }) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  let parsed = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = rawText;
  }

  if (!response.ok) {
    const errorMessage = isPlainObject(parsed) && Array.isArray(parsed.errors) && parsed.errors[0]?.message
      ? parsed.errors[0].message
      : `HTTP ${response.status}`;
    const error = new Error(`${errorMessage} (${method} ${url})`);
    error.response = parsed;
    error.status = response.status;
    throw error;
  }

  return {
    status: response.status,
    raw: parsed,
    data: unwrapResponseEnvelope(parsed),
  };
}

async function fetchAccessibleTree({ apiBase, token }) {
  const url = `${apiBase}/api/desktopRoutes:listAccessible?tree=true&sort=sort`;
  return requestJson({ method: 'GET', url, token });
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

async function createPageShell({
  apiBase,
  token,
  schemaUid,
  title,
  icon,
  parentId,
}) {
  const url = `${apiBase}/api/desktopRoutes:createV2`;
  return requestJson({
    method: 'POST',
    url,
    token,
    body: {
      schemaUid,
      title,
      ...(icon ? { icon } : {}),
      parentId: parentId || null,
    },
  });
}

async function fetchAnchorModel({ apiBase, token, parentId, subKey }) {
  const params = new URLSearchParams({
    parentId,
    subKey,
    includeAsyncNode: 'true',
  });
  const url = `${apiBase}/api/flowModels:findOne?${params.toString()}`;
  return requestJson({ method: 'GET', url, token });
}

async function saveFlowModel({ apiBase, token, payload }) {
  const params = new URLSearchParams({
    return: 'model',
    includeAsyncNode: 'true',
  });
  const url = `${apiBase}/api/flowModels:save?${params.toString()}`;
  return requestJson({
    method: 'POST',
    url,
    token,
    body: payload,
  });
}

async function fetchCollectionsMeta({ apiBase, token }) {
  const url = `${apiBase}/api/collections:listMeta?pageSize=2000`;
  return requestJson({ method: 'GET', url, token });
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
  const tabTitle = normalizeOptionalText(binding?.tabTitle);
  if (!tabTitle) {
    return [model];
  }
  return collectTabDescriptors(model)
    .filter((tab) => tab.title === tabTitle)
    .map((tab) => tab.grid || tab.tab);
}

function validateReadbackContract(model, contract = {}) {
  const findings = [];
  const topLevelUses = collectTopLevelUses(model);
  const visibleTabTitles = collectVisibleTabTitles(model);
  const tabDescriptors = collectTabDescriptors(model);
  const requiredTopLevelUses = Array.isArray(contract.requiredTopLevelUses) ? contract.requiredTopLevelUses : [];
  const requiredVisibleTabs = Array.isArray(contract.requiredVisibleTabs) ? contract.requiredVisibleTabs : [];
  const requiredTabCount = Number.isInteger(contract.requiredTabCount) ? contract.requiredTabCount : 0;
  const requiredTabs = Array.isArray(contract.requiredTabs) ? contract.requiredTabs : [];
  const requireFilterManager = contract.requireFilterManager === true;
  const requiredFilterManagerEntryCount = Number.isInteger(contract.requiredFilterManagerEntryCount)
    ? contract.requiredFilterManagerEntryCount
    : 0;
  const requiredFilterBindings = Array.isArray(contract.requiredFilterBindings) ? contract.requiredFilterBindings : [];
  const allScopeNodes = tabDescriptors.length > 0
    ? tabDescriptors.map((item) => item.grid || item.tab)
    : [model];
  const filterManagerEntryCount = allScopeNodes.reduce(
    (count, scopeNode) => count + collectFilterBindingEvidence(scopeNode).filterManagerConfigs.length,
    0,
  );

  for (const requiredUse of requiredTopLevelUses) {
    if (!topLevelUses.includes(requiredUse)) {
      findings.push({
        severity: 'blocker',
        code: 'READBACK_TOP_LEVEL_USE_MISSING',
        message: `readback 缺少顶层 use "${requiredUse}"`,
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
        message: `readback 缺少可见 tab "${title}"`,
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
        message: `readback pageUse 为 "${normalizeOptionalText(model.use)}"，期望 "${requirement.pageUse}"`,
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
        message: `readback 缺少 requiredTabs 指定的 tab: ${missingTitles.join(', ')}`,
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
          message: `readback tab 缺少 BlockGridModel: ${missingGridTitles.join(', ')}`,
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
          message: `readback tab 缺少 required block uses: ${missingBlockUses.join(', ')}`,
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
      message: `readback visible tab 数量为 ${visibleTabTitles.length}，期望 ${requiredTabCount}`,
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
      message: `readback filterManager 条目数为 ${filterManagerEntryCount}，期望至少 ${requiredFilterManagerEntryCount}`,
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
        message: `readback 缺少筛选绑定所在作用域，tab="${normalizeOptionalText(binding.tabTitle) || '$root'}"`,
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
          message: `readback 缺少筛选项 ${collectionName ? `${collectionName}.` : ''}${fieldName}`,
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
          message: `readback 筛选项 ${fieldName} 没有连接到期望 target use`,
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
          message: `readback filterManager 未找到 ${fieldName} 的稳定绑定`,
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

  return {
    ok: findings.length === 0,
    findings,
    summary: {
      topLevelUses,
      visibleTabTitles,
      filterManagerEntryCount,
      tabBlockUses: Object.fromEntries(
        tabDescriptors.map((tab) => [
          tab.title || `#${tab.index}`,
          collectBlockUsesFromScope(tab.grid || tab.tab),
        ]),
      ),
      filterManagerBindings: allScopeNodes.flatMap((scopeNode) => collectFilterBindingEvidence(scopeNode).filterManagerConfigs)
        .map((config) => `${config.filterId}->${config.targetId}:${config.filterPaths.join('|')}`),
    },
  };
}

function reserveFreshPageTitle({ title, registryPath }) {
  const normalizedTitle = normalizeRequiredText(title, 'title');
  const timestampLabel = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidateTitle = attempt === 0
      ? normalizedTitle
      : `${normalizedTitle} ${timestampLabel}${attempt > 1 ? `-${attempt - 1}` : ''}`;
    const result = reservePage({
      title: candidateTitle,
      ...(registryPath ? { registryPath } : {}),
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

async function runBuild(flags) {
  const caseId = normalizeRequiredText(flags['case-id'], 'case id');
  const title = normalizeRequiredText(flags.title, 'title');
  const templateArtifactsDir = normalizeRequiredText(flags['template-artifacts-dir'], 'template artifacts dir');
  const outDir = path.resolve(normalizeRequiredText(flags['out-dir'], 'out dir'));
  const requirementsFile = normalizeOptionalText(flags['requirements-file']);
  const icon = normalizeOptionalText(flags.icon);
  const parentId = normalizeOptionalText(flags['parent-id']);
  const registryPath = normalizeOptionalText(flags['registry-path']);
  const token = normalizeRequiredText(process.env.NOCOBASE_API_TOKEN, 'NOCOBASE_API_TOKEN');
  const { apiBase, adminBase } = normalizeUrlBase(flags['url-base'] || 'http://127.0.0.1:23000');

  ensureDir(outDir);

  const compileArtifact = loadCompileArtifact(requirementsFile);
  const templateFilePath = discoverTemplatePayloadFile({
    templateArtifactsDir,
    caseId,
  });
  const templatePayload = loadTemplatePayload(templateFilePath);
  const cloneTarget = detectCloneTarget({
    sourceModel: templatePayload.payload,
    filePath: templateFilePath,
  });
  const reservedPage = reserveFreshPageTitle({ title, registryPath });
  const schemaUid = reservedPage.page.schemaUid;
  const routeSegment = schemaUid;
  const pageUrl = buildPageUrl(adminBase, routeSegment);

  const summary = {
    caseId,
    requestedTitle: title,
    actualTitle: reservedPage.actualTitle,
    schemaUid,
    routeSegment,
    pageUrl,
    scenarioId: compileArtifact.scenarioId,
    scenarioTitle: compileArtifact.scenarioTitle,
    cloneTarget,
    status: 'failed',
    notes: [],
    artifactPaths: {},
  };

  writeJson(path.join(outDir, 'source-template.raw.json'), templatePayload.raw);
  writeJson(path.join(outDir, 'source-template.payload.json'), templatePayload.payload);
  summary.artifactPaths.sourceTemplateRaw = path.join(outDir, 'source-template.raw.json');
  summary.artifactPaths.sourceTemplatePayload = path.join(outDir, 'source-template.payload.json');

  const createResult = await createPageShell({
    apiBase,
    token,
    schemaUid,
    title: reservedPage.actualTitle,
    icon,
    parentId,
  });
  writeJson(path.join(outDir, 'create-v2.json'), createResult.raw);
  summary.artifactPaths.createV2 = path.join(outDir, 'create-v2.json');
  summary.createV2 = createResult.data;

  const accessibleTreeResult = await fetchAccessibleTree({ apiBase, token });
  writeJson(path.join(outDir, 'route-tree.json'), accessibleTreeResult.raw);
  summary.artifactPaths.routeTree = path.join(outDir, 'route-tree.json');
  const routeReady = probeRouteReady(Array.isArray(accessibleTreeResult.data) ? accessibleTreeResult.data : [], schemaUid);
  summary.routeReady = routeReady;
  if (!routeReady.ok) {
    summary.notes.push('createV2 已创建页面壳，但 accessible route tree 尚未同时读到 page route 与 hidden default tab。');
  }

  const anchorPage = await fetchAnchorModel({
    apiBase,
    token,
    parentId: schemaUid,
    subKey: 'page',
  });
  const anchorGrid = await fetchAnchorModel({
    apiBase,
    token,
    parentId: `tabs-${schemaUid}`,
    subKey: 'grid',
  });
  writeJson(path.join(outDir, 'anchor-page.json'), anchorPage.raw);
  writeJson(path.join(outDir, 'anchor-grid.json'), anchorGrid.raw);
  summary.artifactPaths.anchorPage = path.join(outDir, 'anchor-page.json');
  summary.artifactPaths.anchorGrid = path.join(outDir, 'anchor-grid.json');

  const targetRootModel = cloneTarget === 'page' ? anchorPage.data : anchorGrid.data;
  if (!isPlainObject(targetRootModel) || typeof targetRootModel.uid !== 'string') {
    throw new Error(`target anchor for ${cloneTarget} was not found after createV2`);
  }

  const remapResult = remapTemplateTreeToTarget({
    sourceModel: templatePayload.payload,
    targetRootModel,
    uidSeed: `${caseId}-${schemaUid}`,
  });
  writeJson(path.join(outDir, `${caseId}-remap-result.json`), remapResult);
  writeJson(path.join(outDir, `${caseId}-remap-payload.json`), remapResult.payload);
  summary.artifactPaths.remapResult = path.join(outDir, `${caseId}-remap-result.json`);
  summary.artifactPaths.remapPayload = path.join(outDir, `${caseId}-remap-payload.json`);
  summary.remap = {
    summary: remapResult.summary,
    issues: remapResult.issues,
    canonicalizedFilterItems: remapResult.canonicalizedFilterItems,
    strippedUnsupportedFieldPopupPages: remapResult.strippedUnsupportedFieldPopupPages,
    dedupedFormSubmitActions: remapResult.dedupedFormSubmitActions,
  };

  const liveMetadataStep1 = await resolveLiveMetadata({
    apiBase,
    token,
    payload: remapResult.payload,
    seedCollections: compileArtifact.requiredCollections,
  });
  writeJson(path.join(outDir, 'metadata.live.step1.json'), liveMetadataStep1.metadata);
  summary.artifactPaths.metadataLiveStep1 = path.join(outDir, 'metadata.live.step1.json');

  let canonicalizeResult = canonicalizePayload({
    payload: remapResult.payload,
    metadata: liveMetadataStep1.metadata,
    mode: VALIDATION_CASE_MODE,
  });

  const liveMetadataStep2 = await resolveLiveMetadata({
    apiBase,
    token,
    payload: canonicalizeResult.payload,
    seedCollections: compileArtifact.requiredCollections,
    initialMetadata: liveMetadataStep1.metadata,
  });
  writeJson(path.join(outDir, 'metadata.live.json'), liveMetadataStep2.metadata);
  summary.artifactPaths.metadataLive = path.join(outDir, 'metadata.live.json');
  summary.metadata = {
    missingCollectionsStep1: liveMetadataStep1.missingCollections,
    missingCollectionsStep2: liveMetadataStep2.missingCollections,
    availableCollectionCount: liveMetadataStep2.availableCollectionCount,
  };

  canonicalizeResult = canonicalizePayload({
    payload: remapResult.payload,
    metadata: liveMetadataStep2.metadata,
    mode: VALIDATION_CASE_MODE,
  });
  const synthesizedFilterFieldCount = fillMissingFilterFieldDescriptors(
    canonicalizeResult.payload,
    liveMetadataStep2.metadata,
  );
  const normalizedFilterFieldModelCount = normalizeFilterItemFieldModelUses(
    canonicalizeResult.payload,
    liveMetadataStep2.metadata,
  );
  writeJson(path.join(outDir, 'canonicalize-result.json'), canonicalizeResult);
  writeJson(path.join(outDir, 'canonicalized-payload.json'), canonicalizeResult.payload);
  summary.artifactPaths.canonicalizeResult = path.join(outDir, 'canonicalize-result.json');
  summary.artifactPaths.canonicalizedPayload = path.join(outDir, 'canonicalized-payload.json');
  summary.canonicalize = {
    transformCount: canonicalizeResult.transforms.length,
    unresolvedCount: canonicalizeResult.unresolved.length,
    metadataCoverage: canonicalizeResult.metadataCoverage,
    synthesizedFilterFieldCount,
    normalizedFilterFieldModelCount,
  };

  const guardRequirements = cloneJson(compileArtifact.guardRequirements);
  const runtimeSensitiveTrust = guardRequirements?.metadataTrust?.runtimeSensitive;
  if (
    liveMetadataStep2.missingCollections.length === 0
    && (!runtimeSensitiveTrust || runtimeSensitiveTrust === 'unknown' || runtimeSensitiveTrust === 'artifact' || runtimeSensitiveTrust === 'cache')
  ) {
    guardRequirements.metadataTrust = {
      ...(isPlainObject(guardRequirements.metadataTrust) ? guardRequirements.metadataTrust : {}),
      runtimeSensitive: 'live',
    };
  }

  const auditResult = auditPayload({
    payload: canonicalizeResult.payload,
    metadata: liveMetadataStep2.metadata,
    mode: VALIDATION_CASE_MODE,
    requirements: guardRequirements,
  });
  writeJson(path.join(outDir, 'audit.json'), auditResult);
  summary.artifactPaths.audit = path.join(outDir, 'audit.json');
  summary.audit = {
    ok: auditResult.ok,
    blockerCount: auditResult.blockers.length,
    warningCount: auditResult.warnings.length,
    metadataCoverage: auditResult.metadataCoverage,
  };

  const hardStopCodes = new Set([
    'EMPTY_TEMPLATE_TREE',
    'FORM_SUBMIT_ACTION_DUPLICATED',
    'FORM_BLOCK_EMPTY_GRID',
    'FILTER_FORM_EMPTY_GRID',
    'FIELD_MODEL_PAGE_SLOT_UNSUPPORTED',
  ]);
  const remapHardStopIssues = remapResult.issues.filter((item) => hardStopCodes.has(item.code));
  const auditHardStops = auditResult.blockers.filter((item) => hardStopCodes.has(item.code));

  if (remapHardStopIssues.length > 0 || auditHardStops.length > 0 || !auditResult.ok) {
    summary.status = 'failed';
    summary.guardBlocked = true;
    summary.notes.push('guard 命中 blocker，本轮保留 page shell 与 artifact，但不执行 flowModels:save。');
    if (liveMetadataStep2.missingCollections.length > 0) {
      summary.notes.push(`live metadata 缺失 collection: ${liveMetadataStep2.missingCollections.join(', ')}`);
    }
    writeJson(path.join(outDir, 'summary.json'), summary);
    return summary;
  }

  let saveResult = null;
  let saveError = null;
  try {
    saveResult = await saveFlowModel({
      apiBase,
      token,
      payload: canonicalizeResult.payload,
    });
    writeJson(path.join(outDir, 'save-result.json'), saveResult.raw);
    summary.artifactPaths.saveResult = path.join(outDir, 'save-result.json');
  } catch (error) {
    saveError = {
      message: error instanceof Error ? error.message : String(error),
      status: Number.isInteger(error?.status) ? error.status : null,
      response: error?.response ?? null,
    };
    writeJson(path.join(outDir, 'save-error.json'), saveError);
    summary.artifactPaths.saveError = path.join(outDir, 'save-error.json');
  }

  let readbackResult = null;
  let readbackContractResult = {
    ok: false,
    findings: [{
      severity: 'blocker',
      code: 'READBACK_SKIPPED',
      message: 'save 失败，readback 已跳过',
    }],
    summary: {
      topLevelUses: [],
      visibleTabTitles: [],
      filterManagerEntryCount: 0,
    },
  };
  if (!saveError) {
    readbackResult = await fetchAnchorModel({
      apiBase,
      token,
      parentId: cloneTarget === 'page' ? schemaUid : `tabs-${schemaUid}`,
      subKey: cloneTarget,
    });
    writeJson(path.join(outDir, 'readback.json'), readbackResult.raw);
    summary.artifactPaths.readback = path.join(outDir, 'readback.json');
    readbackContractResult = validateReadbackContract(readbackResult.data, compileArtifact.readbackContract);
    writeJson(path.join(outDir, 'readback-contract.json'), readbackContractResult);
    summary.artifactPaths.readbackContract = path.join(outDir, 'readback-contract.json');
  }

  summary.readback = readbackResult
    ? {
      summary: summarizeModelTree(readbackResult.data),
      contract: readbackContractResult,
    }
    : null;

  summary.status = determineFinalStatus({
    routeReady,
    auditResult,
    saveError,
    readbackContractResult,
  });
  if (summary.status === 'partial') {
    summary.notes.push('save/readback 已完成，但 build gate 尚未全部满足。');
  }
  if (saveError) {
    summary.notes.push(`flowModels:save 失败: ${saveError.message}`);
  }
  if (!readbackContractResult.ok) {
    summary.notes.push('readback contract 未全部通过。');
  }

  writeJson(path.join(outDir, 'summary.json'), summary);
  return summary;
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
  validateReadbackContract,
};
