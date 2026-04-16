#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveEffectiveMenuPlacement,
  resolveMenuParentRoute,
} from './menu_placement_runtime.mjs';
import { reservePage, stableOpaqueId } from './opaque_uid.mjs';
import {
  buildRecordContextFilterByTkTemplate,
  normalizeFilterTargetKeyList,
} from './filter_by_tk_templates.mjs';
import { VALIDATION_CASE_MODE, auditPayload, canonicalizePayload } from './flow_payload_guard.mjs';
import { getDefaultTabUseForPage } from './model_contracts.mjs';
import {
  augmentReadbackContractWithGridMembership,
  buildReadbackDriftReport,
  validateReadbackContract,
} from './rest_template_clone_runner.mjs';
import { resolveSessionPaths } from './session_state.mjs';
import { collectExplicitCollectionMatches } from './validation_scenario_planner.mjs';
import { resolveFilterFieldModelSpec } from './filter_form_field_resolver.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/rest_validation_builder.mjs build',
    '    --session-dir <dir>',
    '    [--session-id <id>]',
    '    [--session-root <path>]',
    '    [--out-dir <dir>]',
    '    [--url-base <http://127.0.0.1:23000 | http://127.0.0.1:23000/admin>]',
    '    [--icon <icon>]',
    '    [--parent-id <desktopRouteId>]',
    '    [--menu-mode <auto|group|root>]',
    '    [--menu-group-title <title>]',
    '    [--existing-group-route-id <id>]',
    '    [--existing-group-title <title>]',
    '    [--registry-path <path>]',
    '',
    'Notes:',
    '  - 本脚本不会复用历史 template；所有区块均来自实例 flow schema manifest 的 skeleton。',
    '  - 默认读取 <session-dir>/build-spec.json 与 <session-dir>/compile-artifact.json。',
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

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
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

function unwrapResponseEnvelope(value) {
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

    if (Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data;
      continue;
    }

    return current;
  }
  return current;
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
    const error = new Error(`HTTP ${response.status} ${method} ${url}`);
    error.status = response.status;
    error.response = parsed;
    throw error;
  }

  return {
    status: response.status,
    raw: parsed,
    data: unwrapResponseEnvelope(parsed),
  };
}

async function createPageShell({ apiBase, token, schemaUid, title, icon, parentId }) {
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

async function upsertGroupRoute({ apiBase, token, schemaUid, title, parentId }) {
  const params = new URLSearchParams();
  params.append('filterKeys[]', 'schemaUid');
  const url = `${apiBase}/api/desktopRoutes:updateOrCreate?${params.toString()}`;
  return requestJson({
    method: 'POST',
    url,
    token,
    body: {
      type: 'group',
      schemaUid,
      title,
      parentId: parentId || null,
    },
  });
}

async function fetchAccessibleTree({ apiBase, token }) {
  const url = `${apiBase}/api/desktopRoutes:listAccessible?tree=true&sort=sort`;
  return requestJson({ method: 'GET', url, token });
}

function probeRouteReady(routeTree, schemaUid) {
  const nodes = Array.isArray(routeTree) ? routeTree : [];
  const flat = [];
  const visit = (items, parent = null) => {
    for (const node of Array.isArray(items) ? items : []) {
      if (!isPlainObject(node)) {
        continue;
      }
      flat.push({ node, parent });
      visit(node.children, node);
    }
  };
  visit(nodes);

  const pageNode = flat.find((entry) => entry.node?.schemaUid === schemaUid)?.node || null;
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

function buildCollectionsMetaIndex(collections) {
  const list = Array.isArray(collections) ? collections : [];
  const byName = new Map();
  for (const item of list) {
    if (!isPlainObject(item) || typeof item.name !== 'string' || !item.name.trim()) {
      continue;
    }
    const fields = Array.isArray(item.fields) ? item.fields : [];
    const fieldsByName = new Map();
    const fieldNames = [];
    const scalarFieldNames = [];
    for (const field of fields) {
      const fieldName = normalizeOptionalText(field?.name);
      if (!fieldName) {
        continue;
      }
      fieldNames.push(fieldName);
      fieldsByName.set(fieldName, field);
      if (!isAssociationFieldMeta(field)) {
        scalarFieldNames.push(fieldName);
      }
    }
    byName.set(item.name.trim(), {
      ...item,
      fieldsByName,
      fieldNames,
      scalarFieldNames,
    });
  }
  return byName;
}

function buildCollectionsInventoryFromMeta(collections) {
  const collectionIndex = buildCollectionsMetaIndex(collections);
  const names = [...collectionIndex.keys()].sort((left, right) => left.localeCompare(right));
  return {
    detected: names.length > 0,
    names,
    byName: Object.fromEntries(names.map((name) => {
      const collectionMeta = collectionIndex.get(name);
      return [name, {
        name,
        title: normalizeOptionalText(collectionMeta?.title),
        titleField: normalizeOptionalText(collectionMeta?.titleField),
        fieldNames: Array.isArray(collectionMeta?.fieldNames) ? collectionMeta.fieldNames : [],
        scalarFieldNames: Array.isArray(collectionMeta?.scalarFieldNames) ? collectionMeta.scalarFieldNames : [],
        relationFields: Array.isArray(collectionMeta?.fields)
          ? collectionMeta.fields
            .filter((field) => isAssociationFieldMeta(field))
            .map((field) => normalizeOptionalText(field?.name))
            .filter(Boolean)
          : [],
      }];
    })),
    discoveryNotes: [],
  };
}

function resolveExplicitPrimaryCollectionRequest({ buildSpec, compileArtifact, collectionsMeta }) {
  const sourceText = normalizeOptionalText(buildSpec?.source?.text);
  const artifactExplicitCollections = uniqueStrings(compileArtifact?.explicitCollections);
  const scenarioExplicitCollections = uniqueStrings(buildSpec?.scenario?.explicitCollections);
  const explicitCollectionNames = uniqueStrings([
    ...artifactExplicitCollections,
    ...scenarioExplicitCollections,
  ]);
  const primaryCollectionExplicit = compileArtifact?.primaryCollectionExplicit === true
    || buildSpec?.scenario?.primaryCollectionExplicit === true
    || explicitCollectionNames.length > 0;
  if (!sourceText) {
    return {
      expectedCollectionName: primaryCollectionExplicit && explicitCollectionNames.length === 1
        ? explicitCollectionNames[0]
        : '',
      explicitMatches: explicitCollectionNames.map((name) => ({ name, signals: [] })),
      source: explicitCollectionNames.length > 0 ? 'artifact' : '',
    };
  }

  const collectionsInventory = buildCollectionsInventoryFromMeta(collectionsMeta);
  const explicitMatches = collectExplicitCollectionMatches(sourceText, collectionsInventory);
  const explicitNames = uniqueStrings([
    ...explicitMatches.map((item) => item.name),
    ...explicitCollectionNames,
  ]);
  const dataBindingCollections = uniqueStrings(buildSpec?.dataBindings?.collections);
  const scenarioCollections = uniqueStrings(buildSpec?.scenario?.targetCollections);
  const compileCollections = uniqueStrings(compileArtifact?.targetCollections);

  const bindingGroundedCollection = dataBindingCollections.find((name) => explicitNames.includes(name));
  if (bindingGroundedCollection) {
    return {
      expectedCollectionName: bindingGroundedCollection,
      explicitMatches,
      source: 'dataBindings+request',
    };
  }

  const scenarioGroundedCollection = scenarioCollections.find((name) => explicitNames.includes(name));
  if (scenarioGroundedCollection) {
    return {
      expectedCollectionName: scenarioGroundedCollection,
      explicitMatches,
      source: 'scenario+request',
    };
  }

  if (explicitMatches.length === 1) {
    return {
      expectedCollectionName: explicitMatches[0].name,
      explicitMatches,
      source: 'request',
    };
  }

  const compileGroundedCollection = compileCollections.find((name) => explicitNames.includes(name));
  if (compileGroundedCollection) {
    return {
      expectedCollectionName: compileGroundedCollection,
      explicitMatches,
      source: 'compile+request',
    };
  }

  return {
    expectedCollectionName: '',
    explicitMatches,
    source: '',
  };
}

function isAssociationFieldMeta(fieldMeta) {
  const type = normalizeOptionalText(fieldMeta?.type).toLowerCase();
  const fieldInterface = normalizeOptionalText(fieldMeta?.interface).toLowerCase();
  return Boolean(normalizeOptionalText(fieldMeta?.target))
    || type === 'belongsto'
    || type === 'belongstomany'
    || type === 'hasmany'
    || type === 'hasone'
    || fieldInterface === 'm2o'
    || fieldInterface === 'm2m'
    || fieldInterface === 'o2m'
    || fieldInterface === 'oho'
    || fieldInterface === 'obo'
    || fieldInterface === 'o2o';
}

function getCollectionMeta(collectionIndex, collectionName) {
  return collectionIndex.get(normalizeOptionalText(collectionName)) || null;
}

function resolveRecordPopupFilterByTkTemplateFromIndex(collectionIndex, collectionName) {
  const normalizedCollectionName = normalizeOptionalText(collectionName);
  const collectionMeta = getCollectionMeta(collectionIndex, normalizedCollectionName);
  const filterTargetKeys = normalizeFilterTargetKeyList(collectionMeta?.filterTargetKey);
  if (filterTargetKeys.length === 0) {
    throw new Error(
      `collection "${normalizedCollectionName || 'unknown'}" missing filterTargetKey; cannot derive stable popup record filterByTk`,
    );
  }
  return buildRecordContextFilterByTkTemplate(collectionMeta.filterTargetKey);
}

export function resolveRecordPopupFilterByTkTemplate({ collectionsMeta, collectionName }) {
  return resolveRecordPopupFilterByTkTemplateFromIndex(
    buildCollectionsMetaIndex(collectionsMeta),
    collectionName,
  );
}

function resolveStableScalarFieldPath(collectionIndex, collectionName) {
  const collectionMeta = getCollectionMeta(collectionIndex, collectionName);
  if (!collectionMeta) {
    return '';
  }

  const candidates = uniqueStrings([
    normalizeOptionalText(collectionMeta.titleField),
    'name',
    'nickname',
    'title',
    'label',
    'code',
    normalizeOptionalText(collectionMeta.filterTargetKey),
  ]);
  for (const candidate of candidates) {
    const fieldMeta = collectionMeta.fieldsByName?.get(candidate) || null;
    if (fieldMeta && !isAssociationFieldMeta(fieldMeta)) {
      return candidate;
    }
  }

  if (Array.isArray(collectionMeta.scalarFieldNames) && collectionMeta.scalarFieldNames.length === 1) {
    return collectionMeta.scalarFieldNames[0];
  }

  return '';
}

function resolveDisplayFieldBinding(collectionIndex, collectionName, fieldPath) {
  const normalizedFieldPath = normalizeOptionalText(fieldPath);
  if (!normalizedFieldPath || normalizedFieldPath.includes('.')) {
    return {
      collectionName,
      fieldPath: normalizedFieldPath,
      associationPathName: '',
    };
  }

  const fieldMeta = findFieldMeta(collectionIndex, collectionName, normalizedFieldPath);
  if (!isAssociationFieldMeta(fieldMeta)) {
    return {
      collectionName,
      fieldPath: normalizedFieldPath,
      associationPathName: '',
    };
  }

  const targetCollection = normalizeOptionalText(fieldMeta?.target);
  const targetFieldPath = resolveStableScalarFieldPath(collectionIndex, targetCollection);
  if (!targetCollection || !targetFieldPath) {
    return {
      collectionName,
      fieldPath: normalizedFieldPath,
      associationPathName: '',
    };
  }

  return {
    collectionName,
    fieldPath: `${normalizedFieldPath}.${targetFieldPath}`,
    associationPathName: normalizedFieldPath,
  };
}

function findFieldMeta(collectionIndex, collectionName, fieldPath) {
  const normalizedCollectionName = normalizeOptionalText(collectionName);
  const normalizedFieldPath = normalizeOptionalText(fieldPath);
  if (!normalizedCollectionName || !normalizedFieldPath) {
    return null;
  }
  const collectionMeta = collectionIndex.get(normalizedCollectionName);
  if (!collectionMeta || !Array.isArray(collectionMeta.fields)) {
    return null;
  }
  const topLevelField = normalizedFieldPath.split('.')[0];
  return collectionMeta.fields.find((field) => normalizeOptionalText(field?.name) === topLevelField) || null;
}

function resolveBuildFilterFieldSpecFromIndex({
  collectionIndex,
  collectionName,
  fieldPath,
  allowedUses,
}) {
  return resolveFilterFieldModelSpec({
    metadata: collectionIndex,
    collectionName,
    fieldPath,
    allowedUses,
  });
}

export function resolveBuildFilterFieldSpec({
  collectionsMeta,
  collectionName,
  fieldPath,
  filterItemCandidate,
  allowedUses,
}) {
  const collectionIndex = collectionsMeta instanceof Map
    ? collectionsMeta
    : buildCollectionsMetaIndex(collectionsMeta);
  const effectiveAllowedUses = allowedUses
    || filterItemCandidate?.subModelCatalog?.field?.candidates
    || [];
  return resolveBuildFilterFieldSpecFromIndex({
    collectionIndex,
    collectionName,
    fieldPath,
    allowedUses: effectiveAllowedUses,
  });
}

export function evaluateBuildPreflight({ buildSpec, compileArtifact, collectionsMeta }) {
  const blockers = [];
  const warnings = [];
  const collectionIndex = buildCollectionsMetaIndex(collectionsMeta);

  const multiPageRequest = compileArtifact?.multiPageRequest && typeof compileArtifact.multiPageRequest === 'object'
    ? compileArtifact.multiPageRequest
    : null;
  if (multiPageRequest?.detected && Number.isFinite(multiPageRequest.pageCount) && multiPageRequest.pageCount > 1) {
    blockers.push({
      code: 'PREFLIGHT_MULTI_PAGE_REQUEST_REQUIRES_PAGE_LEVEL_EXECUTION',
      message: `预检失败：当前请求已拆成 ${multiPageRequest.pageCount} 个页面规格，必须逐页执行 fresh build。`,
      details: {
        pageCount: multiPageRequest.pageCount,
        splitMode: normalizeOptionalText(multiPageRequest.splitMode),
        pageTitles: Array.isArray(multiPageRequest.pageTitles) ? multiPageRequest.pageTitles : [],
      },
    });
  }

  if (compileArtifact?.planningStatus === 'blocked') {
    for (const blocker of Array.isArray(compileArtifact.planningBlockers) ? compileArtifact.planningBlockers : []) {
      blockers.push({
        code: blocker?.code || 'PLANNING_BLOCKED',
        message: blocker?.message || 'planning blocked',
        details: blocker?.details && typeof blocker.details === 'object' ? blocker.details : {},
      });
    }
  }

  const requiredCollections = Array.isArray(compileArtifact?.requiredMetadataRefs?.collections)
    ? compileArtifact.requiredMetadataRefs.collections
    : [];
  for (const collectionName of requiredCollections) {
    if (!collectionIndex.has(collectionName)) {
      blockers.push({
        code: 'PREFLIGHT_COLLECTION_MISSING',
        message: `预检失败：collection "${collectionName}" 不存在，不能继续 fresh build。`,
        details: { collectionName },
      });
    }
  }

  const requiredFields = Array.isArray(compileArtifact?.requiredMetadataRefs?.fields)
    ? compileArtifact.requiredMetadataRefs.fields
    : [];
  for (const fieldRef of requiredFields) {
    if (typeof fieldRef !== 'string' || !fieldRef.includes('.')) {
      continue;
    }
    const [collectionName, ...rest] = fieldRef.split('.');
    const fieldPath = rest.join('.');
    const collectionMeta = collectionIndex.get(collectionName);
    if (!collectionMeta) {
      continue;
    }
    const topLevelField = fieldPath.split('.')[0];
    if (!collectionMeta.fieldNames.includes(topLevelField)) {
      blockers.push({
        code: 'PREFLIGHT_FIELD_MISSING',
        message: `预检失败：${collectionName}.${topLevelField} 在 live metadata 中不存在。`,
        details: {
          collectionName,
          fieldPath: topLevelField,
        },
      });
    }
  }

  const requestedFields = Array.isArray(compileArtifact?.requestedFields) ? compileArtifact.requestedFields : [];
  const resolvedFields = Array.isArray(compileArtifact?.resolvedFields) ? compileArtifact.resolvedFields : [];
  if (requestedFields.length > 0 && resolvedFields.length === 0) {
    blockers.push({
      code: 'PREFLIGHT_REQUESTED_FIELDS_UNRESOLVED',
      message: '预检失败：请求显式提到了字段，但当前规划没有任何已解析字段。',
      details: { requestedFields },
    });
  }

  const primaryBlockType = normalizeOptionalText(compileArtifact?.primaryBlockType);
  const availableUses = Array.isArray(compileArtifact?.availableUses) ? compileArtifact.availableUses : [];
  if (primaryBlockType && primaryBlockType.endsWith('BlockModel') && ![
    'TableBlockModel',
    'DetailsBlockModel',
    'CreateFormModel',
    'EditFormModel',
  ].includes(primaryBlockType) && !availableUses.includes(primaryBlockType)) {
    blockers.push({
      code: 'PREFLIGHT_PRIMARY_BLOCK_UNAVAILABLE',
      message: `预检失败：实例当前未公开 ${primaryBlockType}。`,
      details: { primaryBlockType },
    });
  }

  const explicitCollectionRequest = resolveExplicitPrimaryCollectionRequest({
    buildSpec,
    compileArtifact,
    collectionsMeta,
  });
  const targetCollections = uniqueStrings(compileArtifact?.targetCollections);
  if (explicitCollectionRequest.expectedCollectionName && targetCollections.length === 0) {
    blockers.push({
      code: 'EXPLICIT_COLLECTION_TARGET_MISSING',
      message: `预检失败：请求显式指定了主 collection "${explicitCollectionRequest.expectedCollectionName}"，但 compile artifact 没有任何 targetCollections。`,
      details: {
        expectedCollectionName: explicitCollectionRequest.expectedCollectionName,
        source: explicitCollectionRequest.source,
        explicitMatches: explicitCollectionRequest.explicitMatches,
      },
    });
  } else if (
    explicitCollectionRequest.expectedCollectionName
    && targetCollections.length > 0
    && !targetCollections.includes(explicitCollectionRequest.expectedCollectionName)
  ) {
    blockers.push({
      code: 'EXPLICIT_COLLECTION_TARGET_MISMATCH',
      message: `预检失败：请求显式指定主 collection "${explicitCollectionRequest.expectedCollectionName}"，但 compile artifact 指向了 ${targetCollections.join(', ')}。`,
      details: {
        expectedCollectionName: explicitCollectionRequest.expectedCollectionName,
        actualTargetCollections: targetCollections,
        source: explicitCollectionRequest.source,
        explicitMatches: explicitCollectionRequest.explicitMatches,
      },
    });
  }

  if (Array.isArray(buildSpec?.layout?.blocks) && buildSpec.layout.blocks.length === 0 && blockers.length === 0) {
    warnings.push({
      code: 'PREFLIGHT_EMPTY_LAYOUT',
      message: '当前布局没有任何 root blocks。',
    });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    checkedCollections: requiredCollections,
  };
}

function reserveFreshPageTitle({
  title,
  registryPath,
  sessionId,
  sessionRoot,
}) {
  const normalizedTitle = normalizeRequiredText(title, 'title');
  const timestampLabel = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
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

function buildPageUrl(adminBase, schemaUid) {
  return `${adminBase.replace(/\/+$/, '')}/${encodeURIComponent(schemaUid)}`;
}

function createUidAllocator(seed) {
  let counter = 0;
  return (label) => {
    counter += 1;
    const safeLabel = typeof label === 'string' && label.trim() ? label.trim() : 'node';
    return stableOpaqueId('flow-node', `${seed}|${counter}|${safeLabel}`);
  };
}

function walkJson(value, visit) {
  function inner(node, parent, key) {
    visit(node, parent, key);
    if (Array.isArray(node)) {
      node.forEach((child, index) => inner(child, node, index));
      return;
    }
    if (isPlainObject(node)) {
      for (const [childKey, childValue] of Object.entries(node)) {
        inner(childValue, node, childKey);
      }
    }
  }
  inner(value, null, null);
}

function remapUidsInPlace(value, allocateUid) {
  walkJson(value, (node) => {
    if (!isPlainObject(node) || typeof node.uid !== 'string' || !node.uid.trim()) {
      return;
    }
    node.uid = allocateUid(node.use || node.uid);
  });
}

function firstScalarFieldPath(values) {
  const fields = Array.isArray(values) ? values : [];
  const scalar = fields.find((item) => typeof item === 'string' && item.trim() && !item.includes('.'));
  if (scalar) {
    return scalar.trim();
  }
  const fallback = fields.find((item) => typeof item === 'string' && item.trim());
  return fallback ? fallback.trim().split('.')[0] : '';
}

function normalizeFieldPaths(values, fallback = 'id', limit = 6) {
  const normalized = uniqueFieldPaths(values).slice(0, limit);
  return normalized.length > 0 ? normalized : [fallback];
}

function uniqueFieldPaths(values) {
  return uniqueStrings(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.split('.')[0]),
  );
}

const ACTION_USE_BY_KIND = {
  'create-popup': 'AddNewActionModel',
  'view-record-popup': 'ViewActionModel',
  'edit-record-popup': 'EditActionModel',
  'delete-record': 'DeleteActionModel',
  'add-child-record-popup': 'AddChildActionModel',
  'record-action': 'JSRecordActionModel',
};

const ACTION_USE_ALIASES = {
  'add-child-record-popup': ['AddChildActionModel', 'PopupCollectionActionModel'],
};

function findBundleBlockGridDoc(schemaBundle) {
  const bundle = unwrapResponseEnvelope(schemaBundle);
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const blockGrid = items.find((item) => item?.use === 'BlockGridModel') || null;
  if (!blockGrid) {
    throw new Error('schemaBundle missing BlockGridModel');
  }
  return blockGrid;
}

function findRootCandidate(blockGridDoc, use) {
  const candidates = Array.isArray(blockGridDoc?.subModelCatalog?.items?.candidates)
    ? blockGridDoc.subModelCatalog.items.candidates
    : [];
  return candidates.find((candidate) => candidate?.use === use) || null;
}

function findCandidateRecursive(node, use) {
  let matched = null;
  const visit = (current) => {
    if (matched || current == null) {
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item);
        if (matched) {
          return;
        }
      }
      return;
    }
    if (!isPlainObject(current)) {
      return;
    }
    if (current.use === use && isPlainObject(current.skeleton)) {
      matched = current;
      return;
    }
    for (const value of Object.values(current)) {
      visit(value);
      if (matched) {
        return;
      }
    }
  };
  visit(node);
  return matched;
}

function cloneCandidateSkeleton(candidate, fallbackUse, allocator) {
  const node = isPlainObject(candidate?.skeleton)
    ? cloneJson(candidate.skeleton)
    : {
      uid: allocator(fallbackUse),
      use: fallbackUse,
      stepParams: {},
      subModels: {},
    };
  remapUidsInPlace(node, allocator);
  if (!node.uid) {
    node.uid = allocator(node.use || fallbackUse);
  }
  if (!node.use) {
    node.use = fallbackUse;
  }
  return node;
}

function resolveActionUse(actionSpec) {
  const explicitUse = normalizeOptionalText(actionSpec?.use);
  if (explicitUse) {
    return explicitUse;
  }
  return ACTION_USE_BY_KIND[actionSpec?.kind] || '';
}

function resolveActionCandidates(actionSpec) {
  const explicitUse = normalizeOptionalText(actionSpec?.use);
  if (explicitUse) {
    return [explicitUse];
  }
  const kind = normalizeOptionalText(actionSpec?.kind);
  const aliases = Array.isArray(ACTION_USE_ALIASES[kind]) ? ACTION_USE_ALIASES[kind] : [];
  return uniqueStrings([ACTION_USE_BY_KIND[kind], ...aliases]);
}

const COLLECTION_BOUND_PUBLIC_USES = new Set([
  'GridCardBlockModel',
  'ListBlockModel',
  'MapBlockModel',
  'CommentsBlockModel',
]);

function findFormItemCandidate(blockGridDoc, formUse) {
  const formCandidate = findRootCandidate(blockGridDoc, formUse);
  const formGridCandidate = Array.isArray(formCandidate?.subModelCatalog?.grid?.candidates)
    ? formCandidate.subModelCatalog.grid.candidates.find((item) => item?.use === 'FormGridModel') || null
    : null;
  const formItemCandidate = Array.isArray(formGridCandidate?.subModelCatalog?.items?.candidates)
    ? formGridCandidate.subModelCatalog.items.candidates.find((item) => item?.use === 'FormItemModel') || null
    : null;
  return {
    formCandidate,
    formGridCandidate,
    formItemCandidate,
  };
}

function ensureChildArray(parent, key) {
  if (!isPlainObject(parent.subModels)) {
    parent.subModels = {};
  }
  if (!Array.isArray(parent.subModels[key])) {
    parent.subModels[key] = [];
  }
  return parent.subModels[key];
}

function ensureChildObject(parent, key) {
  if (!isPlainObject(parent.subModels)) {
    parent.subModels = {};
  }
  if (!isPlainObject(parent.subModels[key])) {
    parent.subModels[key] = {};
  }
  return parent.subModels[key];
}

function patchResourceCollectionName(node, collectionName) {
  if (!isPlainObject(node.stepParams)) {
    node.stepParams = {};
  }
  if (!isPlainObject(node.stepParams.resourceSettings)) {
    node.stepParams.resourceSettings = {};
  }
  if (!isPlainObject(node.stepParams.resourceSettings.init)) {
    node.stepParams.resourceSettings.init = {};
  }
  node.stepParams.resourceSettings.init.dataSourceKey = node.stepParams.resourceSettings.init.dataSourceKey || 'main';
  node.stepParams.resourceSettings.init.collectionName = collectionName;
}

function patchPopupOpenView(actionNode, { collectionName, filterByTk }) {
  if (!isPlainObject(actionNode.stepParams)) {
    actionNode.stepParams = {};
  }
  if (!isPlainObject(actionNode.stepParams.popupSettings)) {
    actionNode.stepParams.popupSettings = {};
  }
  if (!isPlainObject(actionNode.stepParams.popupSettings.openView)) {
    actionNode.stepParams.popupSettings.openView = {};
  }
  const openView = actionNode.stepParams.popupSettings.openView;
  openView.dataSourceKey = openView.dataSourceKey || 'main';
  openView.collectionName = collectionName;
  if (filterByTk) {
    openView.filterByTk = filterByTk;
  }
  openView.pageModelClass = openView.pageModelClass || 'ChildPageModel';
}

function patchButtonTitle(actionNode, title) {
  if (!isPlainObject(actionNode.stepParams)) {
    actionNode.stepParams = {};
  }
  if (!isPlainObject(actionNode.stepParams.buttonSettings)) {
    actionNode.stepParams.buttonSettings = {};
  }
  if (!isPlainObject(actionNode.stepParams.buttonSettings.general)) {
    actionNode.stepParams.buttonSettings.general = {};
  }
  actionNode.stepParams.buttonSettings.general.title = title;
  actionNode.stepParams.buttonSettings.general.type = actionNode.stepParams.buttonSettings.general.type || 'default';
}

function patchCollectionBlockRuntimeContract(node, collectionName) {
  if (!isPlainObject(node) || !COLLECTION_BOUND_PUBLIC_USES.has(node.use)) {
    return;
  }
  if (!collectionName) {
    return;
  }
  patchResourceCollectionName(node, collectionName);
}

function patchFirstTabTitle(actionNode, title) {
  const tabNode = actionNode?.subModels?.page?.subModels?.tabs?.[0];
  if (!isPlainObject(tabNode)) {
    return;
  }
  if (!isPlainObject(tabNode.stepParams)) {
    tabNode.stepParams = {};
  }
  if (!isPlainObject(tabNode.stepParams.pageTabSettings)) {
    tabNode.stepParams.pageTabSettings = {};
  }
  if (!isPlainObject(tabNode.stepParams.pageTabSettings.tab)) {
    tabNode.stepParams.pageTabSettings.tab = {};
  }
  tabNode.stepParams.pageTabSettings.tab.title = title;
}

function patchTabTitle(tabNode, title) {
  if (!isPlainObject(tabNode)) {
    return;
  }
  if (!isPlainObject(tabNode.stepParams)) {
    tabNode.stepParams = {};
  }
  if (!isPlainObject(tabNode.stepParams.pageTabSettings)) {
    tabNode.stepParams.pageTabSettings = {};
  }
  if (!isPlainObject(tabNode.stepParams.pageTabSettings.tab)) {
    tabNode.stepParams.pageTabSettings.tab = {};
  }
  tabNode.stepParams.pageTabSettings.tab.title = title;
}

function buildFallbackPageTabModel({ pageUse, allocator }) {
  const tabUse = getDefaultTabUseForPage(pageUse || 'RootPageModel');
  return {
    uid: allocator(tabUse),
    use: tabUse,
    stepParams: {},
    subModels: {
      grid: {
        uid: allocator('BlockGridModel'),
        use: 'BlockGridModel',
        stepParams: {},
        subModels: {
          items: [],
        },
      },
    },
  };
}

function pickEditableFieldCandidate(formItemCandidate, fieldMeta) {
  const candidates = Array.isArray(formItemCandidate?.subModelCatalog?.field?.candidates)
    ? formItemCandidate.subModelCatalog.field.candidates.filter((item) => isPlainObject(item?.skeleton))
    : [];
  if (candidates.length === 0) {
    return null;
  }
  if (isAssociationFieldMeta(fieldMeta)) {
    return candidates.find((candidate) => candidate?.use === 'RecordSelectFieldModel') || candidates[0];
  }
  const preferredUses = [
    'InputFieldModel',
    'TextareaFieldModel',
    'NumberFieldModel',
    'DateOnlyFieldModel',
  ];
  for (const use of preferredUses) {
    const matched = candidates.find((candidate) => candidate?.use === use);
    if (matched) {
      return matched;
    }
  }
  return candidates[0];
}

function buildEditableFieldSubModel({
  formItemCandidate,
  allocator,
  collectionName,
  fieldPath,
  collectionIndex,
}) {
  const fieldMeta = findFieldMeta(collectionIndex, collectionName, fieldPath);
  const fieldCandidate = pickEditableFieldCandidate(formItemCandidate, fieldMeta);
  const targetUse = normalizeOptionalText(fieldCandidate?.use) || 'InputFieldModel';
  const node = {
    uid: allocator('FieldModel'),
    use: 'FieldModel',
    stepParams: {},
    subModels: {},
  };
  if (!isPlainObject(node.stepParams)) {
    node.stepParams = {};
  }
  node.stepParams.fieldBinding = {
    use: targetUse,
  };
  if (!isPlainObject(node.stepParams.fieldSettings)) {
    node.stepParams.fieldSettings = {};
  }
  node.stepParams.fieldSettings.init = {
    dataSourceKey: 'main',
    collectionName,
    fieldPath,
  };
  return node;
}

function pickDisplayFieldCandidate(displayItemCandidate) {
  const candidates = Array.isArray(displayItemCandidate?.subModelCatalog?.field?.candidates)
    ? displayItemCandidate.subModelCatalog.field.candidates.filter((item) => isPlainObject(item?.skeleton))
    : [];
  if (candidates.length === 0) {
    return null;
  }
  const preferredUses = [
    'DisplayTextFieldModel',
    'DisplayNumberFieldModel',
    'DisplayDateTimeFieldModel',
    'DisplayCheckboxFieldModel',
  ];
  for (const use of preferredUses) {
    const matched = candidates.find((candidate) => candidate?.use === use);
    if (matched) {
      return matched;
    }
  }
  return candidates[0];
}

function buildDisplayFieldSubModel({
  displayItemCandidate,
  allocator,
  collectionName,
  fieldPath,
  collectionIndex,
}) {
  const binding = resolveDisplayFieldBinding(collectionIndex, collectionName, fieldPath);
  const fieldCandidate = pickDisplayFieldCandidate(displayItemCandidate);
  const targetUse = normalizeOptionalText(fieldCandidate?.use) || 'DisplayTextFieldModel';
  const node = {
    uid: allocator('FieldModel'),
    use: 'FieldModel',
    stepParams: {},
    subModels: {},
  };
  if (!isPlainObject(node.stepParams)) {
    node.stepParams = {};
  }
  node.stepParams.fieldBinding = {
    use: targetUse,
  };
  if (!isPlainObject(node.stepParams.fieldSettings)) {
    node.stepParams.fieldSettings = {};
  }
  node.stepParams.fieldSettings.init = {
    dataSourceKey: 'main',
    collectionName: binding.collectionName,
    fieldPath: binding.fieldPath,
    ...(binding.associationPathName ? { associationPathName: binding.associationPathName } : {}),
  };
  return node;
}

function patchFormItemModel(formItemNode, {
  collectionName,
  fieldPath,
  allocator,
  formItemCandidate,
  collectionIndex,
}) {
  if (!isPlainObject(formItemNode) || formItemNode.use !== 'FormItemModel') {
    return;
  }
  if (!isPlainObject(formItemNode.stepParams)) {
    formItemNode.stepParams = {};
  }
  if (!isPlainObject(formItemNode.stepParams.fieldSettings)) {
    formItemNode.stepParams.fieldSettings = {};
  }
  const prev = isPlainObject(formItemNode.stepParams.fieldSettings.init)
    ? formItemNode.stepParams.fieldSettings.init
    : {};
  formItemNode.stepParams.fieldSettings.init = {
    ...prev,
    dataSourceKey: prev.dataSourceKey || 'main',
    collectionName,
    fieldPath,
  };
  if (!isPlainObject(formItemNode.subModels)) {
    formItemNode.subModels = {};
  }
  formItemNode.subModels.field = buildEditableFieldSubModel({
    formItemCandidate,
    allocator,
    collectionName,
    fieldPath,
    collectionIndex,
  });
}

function findDetailsItemCandidate(blockGridDoc) {
  const detailsCandidate = findRootCandidate(blockGridDoc, 'DetailsBlockModel');
  const detailsGridCandidate = Array.isArray(detailsCandidate?.subModelCatalog?.grid?.candidates)
    ? detailsCandidate.subModelCatalog.grid.candidates.find((item) => item?.use === 'DetailsGridModel') || null
    : null;
  const detailsItemCandidate = Array.isArray(detailsGridCandidate?.subModelCatalog?.items?.candidates)
    ? detailsGridCandidate.subModelCatalog.items.candidates.find((item) => item?.use === 'DetailsItemModel') || null
    : null;
  return {
    detailsCandidate,
    detailsGridCandidate,
    detailsItemCandidate,
  };
}

function patchDetailsItemModel(detailsItemNode, {
  collectionName,
  fieldPath,
  allocator,
  detailsItemCandidate,
  collectionIndex,
}) {
  if (!isPlainObject(detailsItemNode) || detailsItemNode.use !== 'DetailsItemModel') {
    return;
  }
  if (!isPlainObject(detailsItemNode.stepParams)) {
    detailsItemNode.stepParams = {};
  }
  if (!isPlainObject(detailsItemNode.stepParams.fieldSettings)) {
    detailsItemNode.stepParams.fieldSettings = {};
  }
  const binding = resolveDisplayFieldBinding(collectionIndex, collectionName, fieldPath);
  detailsItemNode.stepParams.fieldSettings.init = {
    dataSourceKey: 'main',
    collectionName: binding.collectionName,
    fieldPath: binding.fieldPath,
    ...(binding.associationPathName ? { associationPathName: binding.associationPathName } : {}),
  };
  if (!isPlainObject(detailsItemNode.subModels)) {
    detailsItemNode.subModels = {};
  }
  detailsItemNode.subModels.field = buildDisplayFieldSubModel({
    displayItemCandidate: detailsItemCandidate,
    allocator,
    collectionName,
    fieldPath,
    collectionIndex,
  });
}

function patchFormModel(formNode, {
  collectionName,
  fieldPaths,
  allocator,
  blockGridDoc,
  collectionIndex,
  includeFilterByTk = false,
  submitTitle = '提交',
}) {
  if (!isPlainObject(formNode) || (formNode.use !== 'CreateFormModel' && formNode.use !== 'EditFormModel')) {
    return;
  }
  patchResourceCollectionName(formNode, collectionName);
  if (includeFilterByTk) {
    formNode.stepParams.resourceSettings.init.filterByTk = '{{ctx.view.inputArgs.filterByTk}}';
  }

  const gridNode = ensureChildObject(formNode, 'grid');
  if (!gridNode.use) {
    gridNode.use = 'FormGridModel';
  }
  if (!isPlainObject(gridNode.subModels)) {
    gridNode.subModels = { items: [] };
  }
  if (!Array.isArray(gridNode.subModels.items)) {
    gridNode.subModels.items = [];
  }

  const { formItemCandidate } = findFormItemCandidate(blockGridDoc, formNode.use);
  const resolvedFieldPaths = normalizeFieldPaths(fieldPaths, 'id');

  if (gridNode.subModels.items.length === 0) {
    const formItemSkeleton = formItemCandidate?.skeleton;
    gridNode.subModels.items = resolvedFieldPaths.map((fieldPath) => {
      const formItem = isPlainObject(formItemSkeleton) ? cloneJson(formItemSkeleton) : {
        uid: allocator('FormItemModel'),
        use: 'FormItemModel',
        stepParams: {},
        subModels: {},
      };
      formItem.uid = allocator(formItem.use);
      patchFormItemModel(formItem, {
        collectionName,
        fieldPath,
        allocator,
        formItemCandidate,
        collectionIndex,
      });
      return formItem;
    });
  } else {
    gridNode.subModels.items = resolvedFieldPaths.map((fieldPath, index) => {
      const currentItem = gridNode.subModels.items[index];
      const formItem = isPlainObject(currentItem)
        ? cloneJson(currentItem)
        : {
          uid: allocator('FormItemModel'),
          use: 'FormItemModel',
          stepParams: {},
          subModels: {},
        };
      formItem.uid = allocator(formItem.use || 'FormItemModel');
      patchFormItemModel(formItem, {
        collectionName,
        fieldPath,
        allocator,
        formItemCandidate,
        collectionIndex,
      });
      return formItem;
    });
  }

  const actions = ensureChildArray(formNode, 'actions');
  if (actions.length === 0) {
    const createFormCandidate = findRootCandidate(blockGridDoc, 'CreateFormModel');
    const submitSkeleton = createFormCandidate?.subModelCatalog?.actions?.candidates?.find((item) => item?.use === 'FormSubmitActionModel')?.skeleton;
    const submitAction = isPlainObject(submitSkeleton) ? cloneJson(submitSkeleton) : {
      uid: allocator('FormSubmitActionModel'),
      use: 'FormSubmitActionModel',
      stepParams: {},
      subModels: {},
    };
    submitAction.uid = allocator(submitAction.use);
    patchButtonTitle(submitAction, submitTitle);
    actions.push(submitAction);
  }
}

function patchDetailsBlock(detailsNode, {
  collectionName,
  fieldPaths,
  allocator,
  blockGridDoc,
  collectionIndex,
}) {
  if (!isPlainObject(detailsNode) || detailsNode.use !== 'DetailsBlockModel') {
    return;
  }
  patchResourceCollectionName(detailsNode, collectionName);
  detailsNode.stepParams.resourceSettings.init.filterByTk = '{{ctx.view.inputArgs.filterByTk}}';

  const gridNode = ensureChildObject(detailsNode, 'grid');
  if (!gridNode.use) {
    gridNode.use = 'DetailsGridModel';
  }
  if (!isPlainObject(gridNode.subModels)) {
    gridNode.subModels = { items: [] };
  }
  if (!Array.isArray(gridNode.subModels.items)) {
    gridNode.subModels.items = [];
  }

  const { detailsItemCandidate } = findDetailsItemCandidate(blockGridDoc);
  const resolvedFieldPaths = normalizeFieldPaths(fieldPaths, 'id');

  if (gridNode.subModels.items.length === 0) {
    const detailsCandidate = findRootCandidate(blockGridDoc, 'DetailsBlockModel');
    const detailsItemSkeleton = detailsCandidate?.subModelCatalog?.grid?.candidates?.find((item) => item?.use === 'DetailsGridModel')
      ?.subModelCatalog?.items?.candidates?.find((item) => item?.use === 'DetailsItemModel')?.skeleton;
    gridNode.subModels.items = resolvedFieldPaths.map((fieldPath) => {
      const detailsItem = isPlainObject(detailsItemSkeleton) ? cloneJson(detailsItemSkeleton) : {
        uid: allocator('DetailsItemModel'),
        use: 'DetailsItemModel',
        stepParams: {},
        subModels: {},
      };
      detailsItem.uid = allocator(detailsItem.use);
      patchDetailsItemModel(detailsItem, {
        collectionName,
        fieldPath,
        allocator,
        detailsItemCandidate,
        collectionIndex,
      });
      return detailsItem;
    });
  } else {
    gridNode.subModels.items = resolvedFieldPaths.map((fieldPath, index) => {
      const currentItem = gridNode.subModels.items[index];
      const detailsItem = isPlainObject(currentItem)
        ? cloneJson(currentItem)
        : {
          uid: allocator('DetailsItemModel'),
          use: 'DetailsItemModel',
          stepParams: {},
          subModels: {},
        };
      detailsItem.uid = allocator(detailsItem.use || 'DetailsItemModel');
      patchDetailsItemModel(detailsItem, {
        collectionName,
        fieldPath,
        allocator,
        detailsItemCandidate,
        collectionIndex,
      });
      return detailsItem;
    });
  }
}

function buildPublicUseModel({ blockGridDoc, allocator, use, title, mainCollection, jsCode }) {
  const candidate = findRootCandidate(blockGridDoc, use);
  if (!candidate?.skeleton) {
    return null;
  }
  if (COLLECTION_BOUND_PUBLIC_USES.has(use) && !mainCollection) {
    return null;
  }
  const node = cloneCandidateSkeleton(candidate, use, allocator);
  patchCollectionBlockRuntimeContract(node, mainCollection);
  if (use === 'MarkdownBlockModel' && title) {
    if (!isPlainObject(node.stepParams)) {
      node.stepParams = {};
    }
    if (!isPlainObject(node.stepParams.markdownBlockSettings)) {
      node.stepParams.markdownBlockSettings = {};
    }
    if (!isPlainObject(node.stepParams.markdownBlockSettings.editMarkdown)) {
      node.stepParams.markdownBlockSettings.editMarkdown = {};
    }
    node.stepParams.markdownBlockSettings.editMarkdown.content = `# ${title}\n\n- 本区块由 validation planner 按实例可用 blocks 自动选入。`;
  }
  if (use === 'JSBlockModel' && normalizeOptionalText(jsCode)) {
    if (!isPlainObject(node.stepParams)) {
      node.stepParams = {};
    }
    if (!isPlainObject(node.stepParams.jsSettings)) {
      node.stepParams.jsSettings = {};
    }
    node.stepParams.jsSettings.runJs = {
      version: 'v2',
      code: normalizeOptionalText(jsCode),
    };
  }
  return node;
}

function findTableColumnCandidates(tableCandidate) {
  const candidates = Array.isArray(tableCandidate?.subModelCatalog?.columns?.candidates)
    ? tableCandidate.subModelCatalog.columns.candidates
    : [];
  return {
    fieldColumnCandidate: candidates.find((item) => item?.use === 'TableColumnModel') || null,
    jsColumnCandidate: candidates.find((item) => item?.use === 'JSColumnModel') || null,
    actionsColumnCandidate: candidates.find((item) => item?.use === 'TableActionsColumnModel') || null,
  };
}

function buildFieldColumnModel({ fieldColumnCandidate, allocator, collectionName, fieldPath, collectionIndex }) {
  const binding = resolveDisplayFieldBinding(collectionIndex, collectionName, fieldPath);
  const fieldColumn = cloneCandidateSkeleton(fieldColumnCandidate, 'TableColumnModel', allocator);
  if (!isPlainObject(fieldColumn.stepParams)) {
    fieldColumn.stepParams = {};
  }
  if (!isPlainObject(fieldColumn.stepParams.fieldSettings)) {
    fieldColumn.stepParams.fieldSettings = {};
  }
  fieldColumn.stepParams.fieldSettings.init = {
    dataSourceKey: 'main',
    collectionName: binding.collectionName,
    fieldPath: binding.fieldPath,
    ...(binding.associationPathName ? { associationPathName: binding.associationPathName } : {}),
  };
  if (!isPlainObject(fieldColumn.stepParams.tableColumnSettings)) {
    fieldColumn.stepParams.tableColumnSettings = {};
  }
  if (!isPlainObject(fieldColumn.stepParams.tableColumnSettings.title)) {
    fieldColumn.stepParams.tableColumnSettings.title = {};
  }
  fieldColumn.stepParams.tableColumnSettings.title.title = fieldPath;
  if (!isPlainObject(fieldColumn.subModels)) {
    fieldColumn.subModels = {};
  }
  fieldColumn.subModels.field = buildDisplayFieldSubModel({
    displayItemCandidate: fieldColumnCandidate,
    allocator,
    collectionName,
    fieldPath,
    collectionIndex,
  });
  return fieldColumn;
}

function buildJsColumnModel({ jsColumnCandidate, allocator, title, code, width }) {
  const jsColumn = cloneCandidateSkeleton(jsColumnCandidate, 'JSColumnModel', allocator);
  if (!isPlainObject(jsColumn.stepParams)) {
    jsColumn.stepParams = {};
  }
  if (!isPlainObject(jsColumn.stepParams.tableColumnSettings)) {
    jsColumn.stepParams.tableColumnSettings = {};
  }
  if (!isPlainObject(jsColumn.stepParams.tableColumnSettings.title)) {
    jsColumn.stepParams.tableColumnSettings.title = {};
  }
  jsColumn.stepParams.tableColumnSettings.title.title = title || 'JS column';
  if (Number.isFinite(width)) {
    if (!isPlainObject(jsColumn.stepParams.tableColumnSettings.width)) {
      jsColumn.stepParams.tableColumnSettings.width = {};
    }
    jsColumn.stepParams.tableColumnSettings.width.width = width;
  }
  if (!isPlainObject(jsColumn.stepParams.jsSettings)) {
    jsColumn.stepParams.jsSettings = {};
  }
  jsColumn.stepParams.jsSettings.runJs = {
    version: 'v2',
    code: normalizeOptionalText(code) || '',
  };
  return jsColumn;
}

function patchDeleteActionAppearance(actionNode) {
  if (!isPlainObject(actionNode.stepParams)) {
    actionNode.stepParams = {};
  }
  if (!isPlainObject(actionNode.stepParams.buttonSettings)) {
    actionNode.stepParams.buttonSettings = {};
  }
  if (!isPlainObject(actionNode.stepParams.buttonSettings.general)) {
    actionNode.stepParams.buttonSettings.general = {};
  }
  actionNode.stepParams.buttonSettings.general.type = 'default';
  actionNode.stepParams.buttonSettings.general.danger = true;
  if (!isPlainObject(actionNode.stepParams.actionSettings)) {
    actionNode.stepParams.actionSettings = {};
  }
  actionNode.stepParams.actionSettings.confirm = true;
  if (!isPlainObject(actionNode.stepParams.confirmSettings)) {
    actionNode.stepParams.confirmSettings = {};
  }
  actionNode.stepParams.confirmSettings.enabled = true;
  actionNode.stepParams.confirmSettings.title = actionNode.stepParams.confirmSettings.title || '确认删除';
}

function findFilterFormCandidates(blockGridDoc) {
  const filterCandidate = findRootCandidate(blockGridDoc, 'FilterFormBlockModel');
  return {
    filterCandidate,
    filterGridCandidate: findCandidateRecursive(filterCandidate, 'FilterFormGridModel'),
    filterItemCandidate: findCandidateRecursive(filterCandidate, 'FilterFormItemModel'),
    submitActionCandidate: findCandidateRecursive(filterCandidate, 'FilterFormSubmitActionModel'),
    resetActionCandidate: findCandidateRecursive(filterCandidate, 'FilterFormResetActionModel'),
  };
}

function patchFilterItemModel(filterItemNode, {
  collectionName,
  fieldPath,
  fieldSpec,
  defaultTargetUid,
  allocator,
}) {
  if (!isPlainObject(filterItemNode)) {
    return;
  }
  filterItemNode.uid = allocator('FilterFormItemModel');
  filterItemNode.use = filterItemNode.use || 'FilterFormItemModel';
  if (!isPlainObject(filterItemNode.stepParams)) {
    filterItemNode.stepParams = {};
  }
  if (!isPlainObject(filterItemNode.stepParams.fieldSettings)) {
    filterItemNode.stepParams.fieldSettings = {};
  }
  filterItemNode.stepParams.fieldSettings.init = {
    dataSourceKey: 'main',
    collectionName,
    fieldPath,
  };
  if (!isPlainObject(filterItemNode.stepParams.filterFormItemSettings)) {
    filterItemNode.stepParams.filterFormItemSettings = {};
  }
  if (!isPlainObject(filterItemNode.stepParams.filterFormItemSettings.init)) {
    filterItemNode.stepParams.filterFormItemSettings.init = {};
  }
  filterItemNode.stepParams.filterFormItemSettings.init.defaultTargetUid = defaultTargetUid || '';
  filterItemNode.stepParams.filterFormItemSettings.init.filterField = cloneJson(
    isPlainObject(fieldSpec?.descriptor)
      ? fieldSpec.descriptor
      : {
        name: normalizeOptionalText(fieldPath),
        title: normalizeOptionalText(fieldPath),
        interface: 'input',
        type: 'string',
      },
  );
  if (!isPlainObject(filterItemNode.subModels)) {
    filterItemNode.subModels = {};
  }
  const fieldUse = normalizeOptionalText(fieldSpec?.use) || 'InputFieldModel';
  const existingFieldNode = isPlainObject(filterItemNode.subModels.field) ? filterItemNode.subModels.field : {};
  filterItemNode.subModels.field = {
    ...existingFieldNode,
    uid: normalizeOptionalText(existingFieldNode.uid) || allocator(fieldUse),
    use: fieldUse,
  };
}

function buildFilterBlockModel({
  blockSpec,
  blockGridDoc,
  allocator,
  collectionIndex,
}) {
  const { filterCandidate, filterGridCandidate, filterItemCandidate, submitActionCandidate, resetActionCandidate } = findFilterFormCandidates(blockGridDoc);
  if (!filterCandidate?.skeleton) {
    throw new Error('schemaBundle missing FilterFormBlockModel skeleton');
  }
  const collectionName = normalizeRequiredText(blockSpec.collectionName, 'filter.collectionName');
  const filterNode = cloneCandidateSkeleton(filterCandidate, 'FilterFormBlockModel', allocator);
  patchResourceCollectionName(filterNode, collectionName);

  const gridNode = ensureChildObject(filterNode, 'grid');
  if (!gridNode.uid) {
    gridNode.uid = allocator('FilterFormGridModel');
  }
  gridNode.use = gridNode.use || 'FilterFormGridModel';
  if (!isPlainObject(gridNode.subModels)) {
    gridNode.subModels = {};
  }
  const fieldPaths = normalizeFieldPaths(blockSpec.fields, firstScalarFieldPath(blockSpec.fields) || 'id');
  const filterItemSkeleton = filterItemCandidate?.skeleton;
  const allowedFilterFieldUses = Array.isArray(filterItemCandidate?.subModelCatalog?.field?.candidates)
    ? filterItemCandidate.subModelCatalog.field.candidates
    : [];
  gridNode.subModels.items = fieldPaths.map((fieldPath) => {
    const filterItemNode = isPlainObject(filterItemSkeleton)
      ? cloneJson(filterItemSkeleton)
      : {
        uid: allocator('FilterFormItemModel'),
        use: 'FilterFormItemModel',
        stepParams: {},
        subModels: {},
      };
    patchFilterItemModel(filterItemNode, {
      collectionName,
      fieldPath,
      fieldSpec: resolveBuildFilterFieldSpecFromIndex({
        collectionIndex,
        collectionName,
        fieldPath,
        allowedUses: allowedFilterFieldUses,
      }),
      defaultTargetUid: '',
      allocator,
    });
    return filterItemNode;
  });

  const actions = ensureChildArray(filterNode, 'actions');
  if (actions.length === 0) {
    const submitNode = isPlainObject(submitActionCandidate?.skeleton)
      ? cloneJson(submitActionCandidate.skeleton)
      : {
        uid: allocator('FilterFormSubmitActionModel'),
        use: 'FilterFormSubmitActionModel',
        stepParams: {},
      };
    submitNode.uid = allocator('FilterFormSubmitActionModel');
    submitNode.use = submitNode.use || 'FilterFormSubmitActionModel';
    patchButtonTitle(submitNode, '查询');

    const resetNode = isPlainObject(resetActionCandidate?.skeleton)
      ? cloneJson(resetActionCandidate.skeleton)
      : {
        uid: allocator('FilterFormResetActionModel'),
        use: 'FilterFormResetActionModel',
        stepParams: {},
      };
    resetNode.uid = allocator('FilterFormResetActionModel');
    resetNode.use = resetNode.use || 'FilterFormResetActionModel';
    patchButtonTitle(resetNode, '重置');
    actions.push(submitNode, resetNode);
  }

  return filterNode;
}

function collectFilterTargetCandidates(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => isPlainObject(item))
    .filter((item) => ['TableBlockModel', 'DetailsBlockModel', 'CreateFormModel', 'EditFormModel'].includes(item.use))
    .map((item) => ({
      uid: normalizeOptionalText(item.uid),
      use: normalizeOptionalText(item.use),
      collectionName: normalizeOptionalText(item?.stepParams?.resourceSettings?.init?.collectionName),
    }))
    .filter((item) => item.uid && item.use);
}

function bindFilterBlocksToTargets(items) {
  const targetCandidates = collectFilterTargetCandidates(items);
  if (targetCandidates.length === 0) {
    return;
  }
  for (const item of Array.isArray(items) ? items : []) {
    if (!isPlainObject(item) || item.use !== 'FilterFormBlockModel') {
      continue;
    }
    const collectionName = normalizeOptionalText(item?.stepParams?.resourceSettings?.init?.collectionName);
    const target = targetCandidates.find((candidate) => candidate.collectionName === collectionName)
      || targetCandidates[0];
    if (!target) {
      continue;
    }
    const filterItems = Array.isArray(item?.subModels?.grid?.subModels?.items)
      ? item.subModels.grid.subModels.items
      : [];
    for (const filterItem of filterItems) {
      if (!isPlainObject(filterItem) || filterItem.use !== 'FilterFormItemModel') {
        continue;
      }
      if (!isPlainObject(filterItem.stepParams)) {
        filterItem.stepParams = {};
      }
      if (!isPlainObject(filterItem.stepParams.filterFormItemSettings)) {
        filterItem.stepParams.filterFormItemSettings = {};
      }
      if (!isPlainObject(filterItem.stepParams.filterFormItemSettings.init)) {
        filterItem.stepParams.filterFormItemSettings.init = {};
      }
      filterItem.stepParams.filterFormItemSettings.init.defaultTargetUid = target.uid;
    }
  }
}

function buildBlocksFromSpecs({
  blockSpecs,
  blockGridDoc,
  allocator,
  mainCollection = '',
  collectionIndex,
}) {
  const items = [];
  for (const blockSpec of Array.isArray(blockSpecs) ? blockSpecs : []) {
    if (!isPlainObject(blockSpec)) {
      continue;
    }
    const model = buildBlockModelFromSpec({
      blockSpec,
      blockGridDoc,
      allocator,
      mainCollection,
      collectionIndex,
    });
    if (model) {
      items.push(model);
    }
  }
  bindFilterBlocksToTargets(items);
  return items;
}

function replacePopupBlocks({
  actionNode,
  popupSpec,
  collectionName,
  allocator,
  blockGridDoc,
  collectionIndex,
}) {
  const pageUse = normalizeOptionalText(popupSpec?.pageUse)
    || normalizeOptionalText(actionNode?.subModels?.page?.use)
    || 'ChildPageModel';
  const pageNode = ensureChildObject(actionNode, 'page');
  if (!pageNode.uid) {
    pageNode.uid = allocator(pageUse);
  }
  pageNode.use = pageUse;

  const tabs = ensureChildArray(pageNode, 'tabs');
  const firstTab = isPlainObject(tabs[0])
    ? cloneJson(tabs[0])
    : buildFallbackPageTabModel({ pageUse, allocator });
  remapUidsInPlace(firstTab, allocator);
  firstTab.use = firstTab.use || getDefaultTabUseForPage(pageUse);
  if (!firstTab.uid) {
    firstTab.uid = allocator(firstTab.use);
  }
  patchTabTitle(firstTab, popupSpec?.title || '');

  const gridNode = ensureChildObject(firstTab, 'grid');
  if (!gridNode.uid) {
    gridNode.uid = allocator('BlockGridModel');
  }
  if (!gridNode.use) {
    gridNode.use = 'BlockGridModel';
  }
  if (!isPlainObject(gridNode.subModels)) {
    gridNode.subModels = {};
  }
  gridNode.subModels.items = buildBlocksFromSpecs({
    blockSpecs: popupSpec?.blocks,
    blockGridDoc,
    allocator,
    mainCollection: collectionName,
    collectionIndex,
  });

  tabs.splice(0, tabs.length, firstTab);
  patchFirstTabTitle(actionNode, popupSpec?.title || '');
}

function buildActionModel({
  actionSpec,
  actionCandidateRoot,
  collectionName,
  fieldPaths,
  allocator,
  blockGridDoc,
  actionScope,
  collectionIndex,
}) {
  const actionUse = resolveActionUse(actionSpec);
  if (!actionUse) {
    throw new Error(`Unsupported action kind "${normalizeOptionalText(actionSpec?.kind) || 'unknown'}"`);
  }
  const candidateUses = resolveActionCandidates(actionSpec);
  const actionCandidate = candidateUses
    .map((use) => findCandidateRecursive(actionCandidateRoot, use) || findCandidateRecursive(blockGridDoc, use))
    .find(Boolean);
  if (!actionCandidate?.skeleton) {
    throw new Error(`schemaBundle missing ${actionUse} skeleton`);
  }

  const actionNode = cloneCandidateSkeleton(actionCandidate, actionUse, allocator);
  const title = normalizeOptionalText(actionSpec?.label)
    || normalizeOptionalText(actionSpec?.popup?.title)
    || normalizeOptionalText(actionSpec?.kind)
    || actionUse;
  patchButtonTitle(actionNode, title);

  if (actionSpec.kind === 'delete-record') {
    patchDeleteActionAppearance(actionNode);
    return actionNode;
  }

  if (actionSpec?.popup) {
    const filterByTk = actionSpec.kind === 'create-popup'
      ? ''
      : (
        actionScope === 'row-actions' || actionScope === 'details-actions' || actionSpec.kind === 'add-child-record-popup'
          ? resolveRecordPopupFilterByTkTemplateFromIndex(collectionIndex, collectionName)
          : ''
      );
    patchPopupOpenView(actionNode, {
      collectionName,
      filterByTk,
    });
    if (isPlainObject(actionNode?.stepParams?.popupSettings?.openView) && normalizeOptionalText(actionSpec.popup.pageUse)) {
      actionNode.stepParams.popupSettings.openView.pageModelClass = actionSpec.popup.pageUse;
    }
    replacePopupBlocks({
      actionNode,
      popupSpec: actionSpec.popup,
      collectionName,
      allocator,
      blockGridDoc,
      collectionIndex,
    });
  }

  const normalizedFieldPaths = normalizeFieldPaths(fieldPaths, 'id');
  const firstBlock = actionNode?.subModels?.page?.subModels?.tabs?.[0]?.subModels?.grid?.subModels?.items?.[0];
  if (actionSpec.kind === 'edit-record-popup' && isPlainObject(firstBlock) && firstBlock.use === 'EditFormModel') {
    patchFormModel(firstBlock, {
      collectionName,
      fieldPaths: normalizedFieldPaths,
      allocator,
      blockGridDoc,
      collectionIndex,
      includeFilterByTk: true,
      submitTitle: '保存',
    });
  } else if (actionSpec.kind === 'view-record-popup' && isPlainObject(firstBlock) && firstBlock.use === 'DetailsBlockModel') {
    patchDetailsBlock(firstBlock, {
      collectionName,
      fieldPaths: normalizedFieldPaths,
      allocator,
      blockGridDoc,
      collectionIndex,
    });
  } else if (actionSpec.kind === 'add-child-record-popup' && isPlainObject(firstBlock) && firstBlock.use === 'CreateFormModel') {
    patchFormModel(firstBlock, {
      collectionName,
      fieldPaths: normalizedFieldPaths,
      allocator,
      blockGridDoc,
      collectionIndex,
      includeFilterByTk: false,
      submitTitle: '提交',
    });
  }

  return actionNode;
}

function buildStandaloneFormModel({ blockSpec, blockGridDoc, allocator, collectionIndex }) {
  const use = blockSpec.mode === 'edit' ? 'EditFormModel' : 'CreateFormModel';
  const formCandidate = findRootCandidate(blockGridDoc, use);
  if (!formCandidate?.skeleton) {
    throw new Error(`schemaBundle missing ${use} skeleton`);
  }
  const formNode = cloneCandidateSkeleton(formCandidate, use, allocator);
  patchFormModel(formNode, {
    collectionName: normalizeRequiredText(blockSpec.collectionName, `${use}.collectionName`),
    fieldPaths: blockSpec.fields,
    allocator,
    blockGridDoc,
    collectionIndex,
    includeFilterByTk: use === 'EditFormModel',
    submitTitle: use === 'EditFormModel' ? '保存' : '提交',
  });
  return formNode;
}

function buildDetailsBlockModel({ blockSpec, blockGridDoc, allocator, collectionIndex }) {
  const detailsCandidate = findRootCandidate(blockGridDoc, 'DetailsBlockModel');
  if (!detailsCandidate?.skeleton) {
    throw new Error('schemaBundle missing DetailsBlockModel skeleton');
  }
  const collectionName = normalizeRequiredText(blockSpec.collectionName, 'details.collectionName');
  const detailsNode = cloneCandidateSkeleton(detailsCandidate, 'DetailsBlockModel', allocator);
  patchDetailsBlock(detailsNode, {
    collectionName,
    fieldPaths: blockSpec.fields,
    allocator,
    blockGridDoc,
    collectionIndex,
  });

  const detailsActions = (Array.isArray(blockSpec.actions) ? blockSpec.actions : [])
    .map((actionSpec) => buildActionModel({
      actionSpec,
      actionCandidateRoot: detailsCandidate,
      collectionName,
      fieldPaths: blockSpec.fields,
      allocator,
      blockGridDoc,
      actionScope: 'details-actions',
      collectionIndex,
    }))
    .filter(Boolean);
  if (detailsActions.length > 0) {
    detailsNode.subModels = isPlainObject(detailsNode.subModels) ? detailsNode.subModels : {};
    detailsNode.subModels.actions = detailsActions;
  }
  return detailsNode;
}

function buildTableBlockModel({ blockSpec, blockGridDoc, allocator, collectionIndex }) {
  const tableCandidate = findRootCandidate(blockGridDoc, 'TableBlockModel');
  if (!tableCandidate?.skeleton) {
    throw new Error('schemaBundle missing TableBlockModel skeleton');
  }
  const tableNode = cloneCandidateSkeleton(tableCandidate, 'TableBlockModel', allocator);
  const collectionName = normalizeRequiredText(blockSpec.collectionName, 'table.collectionName');
  patchResourceCollectionName(tableNode, collectionName);

  const fieldPaths = normalizeFieldPaths(blockSpec.fields, firstScalarFieldPath(blockSpec.fields) || 'id');
  const { fieldColumnCandidate, jsColumnCandidate, actionsColumnCandidate } = findTableColumnCandidates(tableCandidate);
  if (!fieldColumnCandidate?.skeleton) {
    throw new Error('schemaBundle missing TableColumnModel skeleton');
  }

  const columns = fieldPaths.map((fieldPath) => buildFieldColumnModel({
    fieldColumnCandidate,
    allocator,
    collectionName,
    fieldPath,
    collectionIndex,
  }));

  const jsColumns = Array.isArray(blockSpec.jsColumns) ? blockSpec.jsColumns : [];
  if (jsColumns.length > 0) {
    if (!jsColumnCandidate?.skeleton) {
      throw new Error('schemaBundle missing JSColumnModel skeleton');
    }
    columns.push(...jsColumns.map((columnSpec, index) => buildJsColumnModel({
      jsColumnCandidate,
      allocator,
      title: normalizeOptionalText(columnSpec?.title) || `JS Column ${index + 1}`,
      code: normalizeOptionalText(columnSpec?.code),
      width: Number.isFinite(columnSpec?.width) ? columnSpec.width : undefined,
    })));
  }

  const rowActionNodes = (Array.isArray(blockSpec.rowActions) ? blockSpec.rowActions : [])
    .map((actionSpec) => buildActionModel({
      actionSpec,
      actionCandidateRoot: actionsColumnCandidate,
      collectionName,
      fieldPaths,
      allocator,
      blockGridDoc,
      actionScope: 'row-actions',
      collectionIndex,
    }))
    .filter(Boolean);

  if (rowActionNodes.length > 0 && actionsColumnCandidate?.skeleton) {
    const actionsCol = cloneCandidateSkeleton(actionsColumnCandidate, 'TableActionsColumnModel', allocator);
    if (!isPlainObject(actionsCol.stepParams)) {
      actionsCol.stepParams = {};
    }
    if (!isPlainObject(actionsCol.stepParams.tableColumnSettings)) {
      actionsCol.stepParams.tableColumnSettings = {};
    }
    if (!isPlainObject(actionsCol.stepParams.tableColumnSettings.title)) {
      actionsCol.stepParams.tableColumnSettings.title = {};
    }
    actionsCol.stepParams.tableColumnSettings.title.title = actionsCol.stepParams.tableColumnSettings.title.title || '操作';
    actionsCol.subModels = isPlainObject(actionsCol.subModels) ? actionsCol.subModels : {};
    actionsCol.subModels.actions = rowActionNodes;
    columns.push(actionsCol);
  }

  const blockActions = (Array.isArray(blockSpec.actions) ? blockSpec.actions : [])
    .map((actionSpec) => buildActionModel({
      actionSpec,
      actionCandidateRoot: tableCandidate,
      collectionName,
      fieldPaths,
      allocator,
      blockGridDoc,
      actionScope: 'block-actions',
      collectionIndex,
    }))
    .filter(Boolean);

  tableNode.subModels = isPlainObject(tableNode.subModels) ? tableNode.subModels : {};
  tableNode.subModels.columns = columns;
  tableNode.subModels.actions = blockActions;
  return tableNode;
}

function pickMainCollectionName(blockSpecs) {
  for (const blockSpec of Array.isArray(blockSpecs) ? blockSpecs : []) {
    const collectionName = normalizeOptionalText(blockSpec?.collectionName);
    if (collectionName) {
      return collectionName;
    }
  }
  return '';
}

function buildBlockModelFromSpec({
  blockSpec,
  blockGridDoc,
  allocator,
  mainCollection = '',
  collectionIndex,
}) {
  if (blockSpec.kind === 'PublicUse' && typeof blockSpec.use === 'string') {
    return buildPublicUseModel({
      blockGridDoc,
      allocator,
      use: blockSpec.use.trim(),
      title: normalizeOptionalText(blockSpec.title),
      mainCollection: normalizeOptionalText(blockSpec.collectionName) || mainCollection,
      jsCode: normalizeOptionalText(blockSpec.jsCode),
    });
  }
  if (blockSpec.kind === 'Table') {
    return buildTableBlockModel({ blockSpec, blockGridDoc, allocator, collectionIndex });
  }
  if (blockSpec.kind === 'Details') {
    return buildDetailsBlockModel({ blockSpec, blockGridDoc, allocator, collectionIndex });
  }
  if (blockSpec.kind === 'Form') {
    return buildStandaloneFormModel({ blockSpec, blockGridDoc, allocator, collectionIndex });
  }
  if (blockSpec.kind === 'Filter') {
    return buildFilterBlockModel({
      blockSpec,
      blockGridDoc,
      allocator,
      collectionIndex,
    });
  }
  throw new Error(`Unsupported fresh block kind "${normalizeOptionalText(blockSpec.kind) || 'unknown'}"`);
}

function buildGridPayload({
  anchorGridModel,
  buildSpec,
  schemaBundle,
  schemaUid,
  collectionIndex,
}) {
  const blockGridDoc = findBundleBlockGridDoc(schemaBundle);
  const uidSeed = `${schemaUid}|${crypto.randomBytes(6).toString('hex')}`;
  const allocateUid = createUidAllocator(uidSeed);

  const root = cloneJson(anchorGridModel);
  if (!isPlainObject(root.subModels)) {
    root.subModels = {};
  }
  const layout = buildSpec?.layout && typeof buildSpec.layout === 'object' ? buildSpec.layout : {};
  const layoutBlocks = Array.isArray(layout.blocks) ? layout.blocks : [];

  root.subModels.items = buildBlocksFromSpecs({
    blockSpecs: layoutBlocks,
    blockGridDoc,
    allocator: allocateUid,
    mainCollection: pickMainCollectionName(layoutBlocks),
    collectionIndex,
  });
  return root;
}

function buildPagePayload({
  anchorPageModel,
  buildSpec,
  schemaBundle,
  schemaUid,
  collectionIndex,
}) {
  const blockGridDoc = findBundleBlockGridDoc(schemaBundle);
  const uidSeed = `${schemaUid}|page|${crypto.randomBytes(6).toString('hex')}`;
  const allocateUid = createUidAllocator(uidSeed);

  const root = cloneJson(anchorPageModel);
  if (!isPlainObject(root.subModels)) {
    root.subModels = {};
  }
  const layout = buildSpec?.layout && typeof buildSpec.layout === 'object' ? buildSpec.layout : {};
  const layoutTabs = Array.isArray(layout.tabs) ? layout.tabs : [];
  const pageUse = normalizeOptionalText(layout.pageUse) || normalizeOptionalText(root.use) || 'RootPageModel';
  const tabTemplate = Array.isArray(root.subModels.tabs) && root.subModels.tabs.length > 0
    ? root.subModels.tabs[0]
    : null;

  root.use = pageUse;
  root.subModels.tabs = layoutTabs.map((tabSpec, index) => {
    const tabNode = isPlainObject(tabTemplate)
      ? cloneJson(tabTemplate)
      : buildFallbackPageTabModel({ pageUse, allocator: allocateUid });
    remapUidsInPlace(tabNode, allocateUid);
    tabNode.use = tabNode.use || getDefaultTabUseForPage(pageUse);
    if (!tabNode.uid) {
      tabNode.uid = allocateUid(tabNode.use);
    }
    patchTabTitle(tabNode, normalizeOptionalText(tabSpec?.title) || `Tab ${index + 1}`);

    const gridNode = ensureChildObject(tabNode, 'grid');
    if (!gridNode.uid) {
      gridNode.uid = allocateUid('BlockGridModel');
    }
    if (!gridNode.use) {
      gridNode.use = 'BlockGridModel';
    }
    if (!isPlainObject(gridNode.subModels)) {
      gridNode.subModels = {};
    }
    gridNode.subModels.items = buildBlocksFromSpecs({
      blockSpecs: Array.isArray(tabSpec?.blocks) ? tabSpec.blocks : [],
      blockGridDoc,
      allocator: allocateUid,
      mainCollection: pickMainCollectionName(tabSpec?.blocks),
      collectionIndex,
    });
    return tabNode;
  });
  return root;
}

export function selectBuildCandidate({ buildSpec, compileArtifact, collectionsMeta }) {
  const requestedSelectedCandidateId = normalizeOptionalText(compileArtifact?.selectedCandidateId) || 'selected-primary';
  const scenarioLayoutCandidates = Array.isArray(buildSpec?.scenario?.layoutCandidates)
    ? buildSpec.scenario.layoutCandidates
    : [];
  const layoutCandidatesById = new Map(
    scenarioLayoutCandidates
      .map((item) => [normalizeOptionalText(item?.candidateId), item])
      .filter(([candidateId]) => candidateId),
  );
  const compileCandidatesById = new Map(
    (Array.isArray(compileArtifact?.candidateBuilds) ? compileArtifact.candidateBuilds : [])
      .map((item) => [normalizeOptionalText(item?.candidateId), item])
      .filter(([candidateId]) => candidateId),
  );
  const candidateIds = uniqueStrings([
    requestedSelectedCandidateId,
    ...compileCandidatesById.keys(),
    ...layoutCandidatesById.keys(),
  ]);
  const rawCandidates = candidateIds.length > 0
    ? candidateIds.map((candidateId) => {
      const compileCandidate = compileCandidatesById.get(candidateId) || null;
      const layoutCandidate = layoutCandidatesById.get(candidateId) || null;
      return {
        candidateId,
        title: normalizeOptionalText(compileCandidate?.title)
          || normalizeOptionalText(layoutCandidate?.title)
          || buildSpec?.target?.title
          || '',
        summary: normalizeOptionalText(compileCandidate?.summary) || normalizeOptionalText(layoutCandidate?.summary),
        layout: layoutCandidate?.layout && typeof layoutCandidate.layout === 'object'
          ? cloneJson(layoutCandidate.layout)
          : (candidateId === requestedSelectedCandidateId ? cloneJson(buildSpec?.layout || {}) : null),
        compileArtifact: compileCandidate?.compileArtifact && typeof compileCandidate.compileArtifact === 'object'
          ? cloneJson(compileCandidate.compileArtifact)
          : (candidateId === requestedSelectedCandidateId ? cloneJson(compileArtifact) : null),
        selected: compileCandidate?.selected === true || layoutCandidate?.selected === true || candidateId === requestedSelectedCandidateId,
        score: Number.isFinite(layoutCandidate?.score)
          ? layoutCandidate.score
          : (Number.isFinite(compileCandidate?.score) ? compileCandidate.score : null),
      };
    })
    : [
      {
        candidateId: requestedSelectedCandidateId,
        title: buildSpec?.target?.title || '',
        layout: cloneJson(buildSpec?.layout || {}),
        compileArtifact: cloneJson(compileArtifact),
        selected: true,
        score: null,
      },
    ];

  const evaluations = rawCandidates.map((candidate, index) => {
    const candidateId = normalizeOptionalText(candidate?.candidateId) || `candidate-${index + 1}`;
    const candidateLayout = candidate?.layout && typeof candidate.layout === 'object'
      ? cloneJson(candidate.layout)
      : cloneJson(buildSpec?.layout || {});
    const candidateBuildSpec = cloneJson(buildSpec);
    candidateBuildSpec.layout = candidateLayout;
    candidateBuildSpec.target = {
      ...(candidateBuildSpec.target && typeof candidateBuildSpec.target === 'object' ? candidateBuildSpec.target : {}),
      title: normalizeOptionalText(candidate?.title) || candidateBuildSpec?.target?.title || '',
      pageUse: normalizeOptionalText(candidateLayout?.pageUse) || candidateBuildSpec?.target?.pageUse || '',
    };
    const candidateCompileArtifact = candidate?.compileArtifact && typeof candidate.compileArtifact === 'object'
      ? cloneJson(candidate.compileArtifact)
      : cloneJson(compileArtifact);
    const preflight = evaluateBuildPreflight({
      buildSpec: candidateBuildSpec,
      compileArtifact: candidateCompileArtifact,
      collectionsMeta,
    });
    return {
      candidateId,
      requested: candidateId === requestedSelectedCandidateId,
      selectedHint: candidate?.selected === true,
      score: Number.isFinite(candidate?.score) ? candidate.score : null,
      title: candidateBuildSpec?.target?.title || '',
      buildSpec: candidateBuildSpec,
      compileArtifact: candidateCompileArtifact,
      preflight,
    };
  });

  const winner = evaluations.find((item) => item.requested && item.preflight.ok)
    || evaluations.find((item) => item.selectedHint && item.preflight.ok)
    || [...evaluations]
      .filter((item) => item.preflight.ok)
      .sort((left, right) => (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY))[0]
    || evaluations.find((item) => item.preflight.ok)
    || evaluations.find((item) => item.requested)
    || evaluations[0];

  return {
    requestedSelectedCandidateId,
    winner,
    evaluations: evaluations.map((item) => ({
      candidateId: item.candidateId,
      title: item.title,
      requested: item.requested,
      selectedHint: item.selectedHint,
      score: item.score,
      preflight: {
        ok: item.preflight.ok,
        blockers: item.preflight.blockers,
        warnings: item.preflight.warnings,
      },
    })),
  };
}

function collectBundleUses(compileArtifact, buildSpec) {
  return uniqueStrings([
    'BlockGridModel',
    normalizeOptionalText(buildSpec?.layout?.pageUse),
    ...(Array.isArray(compileArtifact?.requiredUses) ? compileArtifact.requiredUses : []),
    normalizeOptionalText(compileArtifact?.primaryBlockType),
  ]);
}

function determineBuildTarget(buildSpec) {
  const layout = buildSpec?.layout && typeof buildSpec.layout === 'object' ? buildSpec.layout : {};
  const layoutTabs = Array.isArray(layout.tabs) ? layout.tabs : [];
  return layoutTabs.length > 0 ? 'page' : 'grid';
}

function determineFinalStatus({ routeReady, auditResult, saveError, readbackContractResult }) {
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
  const sessionDir = path.resolve(normalizeRequiredText(flags['session-dir'], 'session dir'));
  const session = resolveSessionPaths({
    sessionId: flags['session-id'],
    sessionRoot: flags['session-root'],
  });
  const outDir = path.resolve(normalizeOptionalText(flags['out-dir']) || path.join(sessionDir, 'rest-builder'));
  const icon = normalizeOptionalText(flags.icon);
  const parentId = normalizeOptionalText(flags['parent-id']);
  const registryPath = normalizeOptionalText(flags['registry-path']) || session.registryPath;
  const token = normalizeRequiredText(process.env.NOCOBASE_API_TOKEN, 'NOCOBASE_API_TOKEN');
  const { apiBase, adminBase } = normalizeUrlBase(flags['url-base'] || 'http://127.0.0.1:23000');

  ensureDir(outDir);

  const buildSpecPath = path.join(sessionDir, 'build-spec.json');
  const compileArtifactPath = path.join(sessionDir, 'compile-artifact.json');
  const buildSpec = readJson(buildSpecPath);
  const compileArtifact = readJson(compileArtifactPath);
  let effectiveBuildSpec = buildSpec;
  let effectiveCompileArtifact = compileArtifact;
  let buildTarget = determineBuildTarget(buildSpec);

  const summary = {
    sessionDir,
    outDir,
    sessionId: session.sessionId,
    requestedTitle: buildSpec?.target?.title || '',
    actualTitle: '',
    schemaUid: '',
    routeSegment: '',
    pageUrl: '',
    buildTarget,
    scenarioId: compileArtifact.scenarioId || '',
    scenarioTitle: compileArtifact.scenarioTitle || '',
    expectedOutcome: compileArtifact.expectedOutcome || 'pass',
    status: 'failed',
    notes: [],
    guardBlocked: false,
    artifactPaths: {},
    menuPlacement: null,
  };

  const collectionsMetaResp = await fetchCollectionsMeta({ apiBase, token });
  writeJson(path.join(outDir, 'collections.meta.json'), collectionsMetaResp.raw);
  summary.artifactPaths.collectionsMeta = path.join(outDir, 'collections.meta.json');

  const collectionsMeta = Array.isArray(collectionsMetaResp.data) ? collectionsMetaResp.data : [];
  const candidateSelection = selectBuildCandidate({
    buildSpec,
    compileArtifact,
    collectionsMeta,
  });
  writeJson(path.join(outDir, 'candidate-preflight.json'), candidateSelection);
  summary.artifactPaths.candidatePreflight = path.join(outDir, 'candidate-preflight.json');
  summary.candidateSelection = {
    requestedSelectedCandidateId: candidateSelection.requestedSelectedCandidateId,
    winnerCandidateId: candidateSelection.winner?.candidateId || '',
    evaluationCount: Array.isArray(candidateSelection.evaluations) ? candidateSelection.evaluations.length : 0,
  };
  if (candidateSelection.winner) {
    effectiveBuildSpec = candidateSelection.winner.buildSpec;
    effectiveCompileArtifact = candidateSelection.winner.compileArtifact;
    buildTarget = determineBuildTarget(effectiveBuildSpec);
    summary.requestedTitle = effectiveBuildSpec?.target?.title || summary.requestedTitle;
    summary.buildTarget = buildTarget;
    summary.scenarioId = effectiveCompileArtifact?.scenarioId || summary.scenarioId;
    summary.scenarioTitle = effectiveCompileArtifact?.scenarioTitle || summary.scenarioTitle;
    summary.expectedOutcome = effectiveCompileArtifact?.expectedOutcome || summary.expectedOutcome;
    summary.selectedCandidateId = candidateSelection.winner.candidateId;
    if (candidateSelection.winner.candidateId !== candidateSelection.requestedSelectedCandidateId) {
      summary.notes.push(`candidate winner 已从 ${candidateSelection.requestedSelectedCandidateId} 切换到 ${candidateSelection.winner.candidateId}。`);
    }
  }

  const effectiveMenuPlacement = resolveEffectiveMenuPlacement({
    buildMenuPlacement: effectiveBuildSpec?.target?.menuPlacement,
    compileMenuPlacement: effectiveCompileArtifact?.menuPlacement,
    menuPlacementOverride: flags,
    fallbackGroupTitle: effectiveBuildSpec?.target?.title || buildSpec?.target?.title || 'validation page',
    sessionId: session.sessionId,
  });
  summary.menuPlacement = effectiveMenuPlacement;

  const preflightResult = candidateSelection.winner?.preflight || evaluateBuildPreflight({
    buildSpec: effectiveBuildSpec,
    compileArtifact: effectiveCompileArtifact,
    collectionsMeta,
  });
  writeJson(path.join(outDir, 'preflight.json'), preflightResult);
  summary.artifactPaths.preflight = path.join(outDir, 'preflight.json');
  summary.preflight = {
    ok: preflightResult.ok,
    blockerCount: Array.isArray(preflightResult.blockers) ? preflightResult.blockers.length : 0,
    warningCount: Array.isArray(preflightResult.warnings) ? preflightResult.warnings.length : 0,
    requestedSelectedCandidateId: candidateSelection.requestedSelectedCandidateId,
    winnerCandidateId: candidateSelection.winner?.candidateId || '',
  };

  if (!preflightResult.ok) {
    summary.notes.push('preflight 未通过，fresh build 已在 createV2 前终止。');
    writeJson(path.join(outDir, 'summary.json'), summary);
    return summary;
  }

  const schemaBundleResp = await requestJson({
    method: 'POST',
    url: `${apiBase}/api/flowModels:schemaBundle`,
    token,
    body: { uses: collectBundleUses(effectiveCompileArtifact, effectiveBuildSpec) },
  });
  writeJson(path.join(outDir, 'schema-bundle.json'), schemaBundleResp.raw);
  summary.artifactPaths.schemaBundle = path.join(outDir, 'schema-bundle.json');

  const reservedPage = reserveFreshPageTitle({
    title: effectiveBuildSpec?.target?.title || 'validation page',
    registryPath,
    sessionId: session.sessionId,
    sessionRoot: session.sessionRoot,
  });
  const menuParentResolution = await resolveMenuParentRoute({
    menuPlacement: effectiveMenuPlacement,
    requestedParentId: parentId,
    registryPath,
    sessionId: session.sessionId,
    sessionRoot: session.sessionRoot,
    upsertGroupRoute: ({ schemaUid, title: groupTitle, parentId: groupParentId }) => upsertGroupRoute({
      apiBase,
      token,
      schemaUid,
      title: groupTitle,
      parentId: groupParentId,
    }),
    fetchAccessibleTree: () => fetchAccessibleTree({ apiBase, token }),
  });
  if (menuParentResolution.groupUpsertResult) {
    writeJson(path.join(outDir, 'menu-group-upsert.json'), menuParentResolution.groupUpsertResult.raw);
    summary.artifactPaths.menuGroupUpsert = path.join(outDir, 'menu-group-upsert.json');
  }
  if (menuParentResolution.accessibleTreeResult) {
    writeJson(path.join(outDir, 'menu-placement-route-tree.json'), menuParentResolution.accessibleTreeResult.raw);
    summary.artifactPaths.menuPlacementRouteTree = path.join(outDir, 'menu-placement-route-tree.json');
  }
  if (menuParentResolution.groupRoute) {
    summary.menuGroup = {
      id: menuParentResolution.groupRoute.id ?? null,
      schemaUid: menuParentResolution.groupRoute.schemaUid || '',
      title: menuParentResolution.groupRoute.title || '',
      parentId: menuParentResolution.groupRoute.parentId ?? null,
    };
  }
  const schemaUid = reservedPage.page.schemaUid;
  const routeSegment = schemaUid;
  const pageUrl = buildPageUrl(adminBase, routeSegment);
  summary.actualTitle = reservedPage.actualTitle;
  summary.schemaUid = schemaUid;
  summary.routeSegment = routeSegment;
  summary.pageUrl = pageUrl;
  summary.pageParentId = menuParentResolution.pageParentId;

  const createResult = await createPageShell({
    apiBase,
    token,
    schemaUid,
    title: reservedPage.actualTitle,
    icon,
    parentId: menuParentResolution.pageParentId,
  });
  writeJson(path.join(outDir, 'create-v2.json'), createResult.raw);
  summary.artifactPaths.createV2 = path.join(outDir, 'create-v2.json');

  const accessibleTreeResult = await fetchAccessibleTree({ apiBase, token });
  writeJson(path.join(outDir, 'route-tree.json'), accessibleTreeResult.raw);
  summary.artifactPaths.routeTree = path.join(outDir, 'route-tree.json');
  const routeReady = probeRouteReady(Array.isArray(accessibleTreeResult.data) ? accessibleTreeResult.data : [], schemaUid);
  summary.routeReady = routeReady;
  if (!routeReady.ok) {
    summary.notes.push('createV2 已创建页面壳，但 accessible route tree 尚未同时读到 page route 与 hidden default tab。');
  }

  let targetRootModel = null;
  if (buildTarget === 'page') {
    const anchorPage = await fetchAnchorModel({
      apiBase,
      token,
      parentId: schemaUid,
      subKey: 'page',
    });
    writeJson(path.join(outDir, 'anchor-page.json'), anchorPage.raw);
    summary.artifactPaths.anchorPage = path.join(outDir, 'anchor-page.json');
    if (!isPlainObject(anchorPage.data) || typeof anchorPage.data.uid !== 'string') {
      throw new Error('unable to fetch page anchor model after createV2');
    }
    targetRootModel = anchorPage.data;
  } else {
    const anchorGrid = await fetchAnchorModel({
      apiBase,
      token,
      parentId: `tabs-${schemaUid}`,
      subKey: 'grid',
    });
    writeJson(path.join(outDir, 'anchor-grid.json'), anchorGrid.raw);
    summary.artifactPaths.anchorGrid = path.join(outDir, 'anchor-grid.json');
    if (!isPlainObject(anchorGrid.data) || typeof anchorGrid.data.uid !== 'string') {
      throw new Error('unable to fetch grid anchor model after createV2');
    }
    targetRootModel = anchorGrid.data;
  }

  const payload = buildTarget === 'page'
    ? buildPagePayload({
      anchorPageModel: targetRootModel,
      buildSpec: effectiveBuildSpec,
      schemaBundle: schemaBundleResp.raw,
      schemaUid,
      collectionIndex: buildCollectionsMetaIndex(collectionsMeta),
    })
    : buildGridPayload({
      anchorGridModel: targetRootModel,
      buildSpec: effectiveBuildSpec,
      schemaBundle: schemaBundleResp.raw,
      schemaUid,
      collectionIndex: buildCollectionsMetaIndex(collectionsMeta),
    });
  writeJson(path.join(outDir, 'payload.draft.json'), payload);
  summary.artifactPaths.payloadDraft = path.join(outDir, 'payload.draft.json');

  const guardRequirements = cloneJson(effectiveCompileArtifact.guardRequirements || {});
  if (buildTarget === 'grid' && Array.isArray(guardRequirements.requiredFilters)) {
    guardRequirements.requiredFilters = guardRequirements.requiredFilters.map((entry) => ({
      ...entry,
      pageSignature: null,
      pageUse: null,
      tabTitle: '',
    }));
  }
  guardRequirements.metadataTrust = {
    ...(isPlainObject(guardRequirements.metadataTrust) ? guardRequirements.metadataTrust : {}),
    runtimeSensitive: 'live',
  };

  const canonicalizeResult = canonicalizePayload({
    payload,
    metadata: { collections: collectionsMeta },
    mode: VALIDATION_CASE_MODE,
  });
  writeJson(path.join(outDir, 'canonicalize-result.json'), canonicalizeResult);
  writeJson(path.join(outDir, 'payload.canonical.json'), canonicalizeResult.payload);
  summary.artifactPaths.canonicalizeResult = path.join(outDir, 'canonicalize-result.json');
  summary.artifactPaths.payloadCanonical = path.join(outDir, 'payload.canonical.json');

  const auditResult = auditPayload({
    payload: canonicalizeResult.payload,
    metadata: { collections: collectionsMeta },
    mode: VALIDATION_CASE_MODE,
    requirements: guardRequirements,
  });
  writeJson(path.join(outDir, 'audit.json'), auditResult);
  summary.artifactPaths.audit = path.join(outDir, 'audit.json');
  summary.audit = {
    ok: auditResult.ok,
    blockerCount: auditResult.blockers.length,
    warningCount: auditResult.warnings.length,
  };

  if (!auditResult.ok) {
    summary.status = 'failed';
    summary.guardBlocked = true;
    summary.notes.push('guard 命中 blocker，本轮保留 page shell 与 artifact，但不执行 flowModels:save。');
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
  let readbackDiffResult = null;
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
      parentId: buildTarget === 'page' ? schemaUid : `tabs-${schemaUid}`,
      subKey: buildTarget === 'page' ? 'page' : 'grid',
    });
    writeJson(path.join(outDir, 'readback.json'), readbackResult.raw);
    summary.artifactPaths.readback = path.join(outDir, 'readback.json');
    readbackDiffResult = buildReadbackDriftReport(canonicalizeResult.payload, readbackResult.data);
    writeJson(path.join(outDir, 'readback-diff.json'), readbackDiffResult);
    summary.artifactPaths.readbackDiff = path.join(outDir, 'readback-diff.json');
    const effectiveReadbackContract = augmentReadbackContractWithGridMembership(
      effectiveCompileArtifact.readbackContract || {},
      canonicalizeResult.payload,
    );
    writeJson(path.join(outDir, 'effective-readback-contract.json'), effectiveReadbackContract);
    summary.artifactPaths.effectiveReadbackContract = path.join(outDir, 'effective-readback-contract.json');
    readbackContractResult = validateReadbackContract(readbackResult.data, effectiveReadbackContract);
    writeJson(path.join(outDir, 'readback-contract.json'), readbackContractResult);
    summary.artifactPaths.readbackContract = path.join(outDir, 'readback-contract.json');
  }

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
  if (readbackDiffResult && !readbackDiffResult.ok) {
    summary.notes.push(`readback diff 发现 ${readbackDiffResult.summary?.driftCount || readbackDiffResult.findings?.length || 0} 处 runtime-sensitive 漂移。`);
  }

  writeJson(path.join(outDir, 'summary.json'), summary);
  return summary;
}

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== 'build') {
    throw new Error(`Unsupported command "${command}"`);
  }
  const summary = await runBuild(flags);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  });
}
