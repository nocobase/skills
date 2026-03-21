#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const DEFAULT_MANIFEST_FILES = [
  path.join(HOME, '.codex', 'state', 'nocobase-ui-builder', 'tmp', 'provision-manifest-cases1-5.json'),
  path.join(HOME, '.codex', 'state', 'nocobase-ui-builder', 'tmp', 'provision-manifest-cases6-10.json'),
];

const SPECIAL_RESOURCES = new Set([
  'collections',
  'collections.fields',
]);

const RELATION_FIELD_TYPES = new Set([
  'belongsTo',
  'belongsToMany',
  'hasMany',
  'hasOne',
]);

const TITLE_FIELD_CANDIDATES = [
  'name',
  'title',
  'nickname',
  'project_code',
  'customer_code',
  'order_no',
  'invoice_no',
  'po_no',
  'opp_no',
  'contact_no',
  'sku',
  'code',
  'dept_code',
  'employee_no',
  'email',
];

function usage() {
  return [
    'Usage:',
    '  node scripts/validation_dataset_provisioner.mjs provision',
    '    --case-id <caseId>',
    '    [--manifest-files <file1,file2,...>]',
    '    [--template-artifacts-dir <dir>]',
    '    [--out-dir <dir>]',
    '    [--url-base <http://127.0.0.1:23000 | http://127.0.0.1:23000/admin>]',
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

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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

function normalizeCaseId(caseId) {
  return normalizeOptionalText(caseId).toLowerCase();
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

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringList(value) {
  return normalizeList(value)
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(normalizeStringList(values))];
}

function parseManifestFiles(rawValue) {
  const configured = normalizeOptionalText(rawValue)
    ? normalizeOptionalText(rawValue).split(',').map((item) => item.trim()).filter(Boolean)
    : DEFAULT_MANIFEST_FILES;
  return uniqueStrings(configured.map((item) => path.resolve(item)));
}

function normalizeRecordFilterValue(value) {
  if (isPlainObject(value) && Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, '$eq')) {
    return value.$eq;
  }
  return value;
}

function isAlreadyExistsError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists/i.test(message) || /duplicate/i.test(message);
}

function valuesEqual(left, right) {
  if (left === right) {
    return true;
  }
  const normalizedLeft = normalizeRecordFilterValue(left);
  const normalizedRight = normalizeRecordFilterValue(right);
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  const leftNumber = Number(normalizedLeft);
  const rightNumber = Number(normalizedRight);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber) {
    return true;
  }
  return String(normalizedLeft) === String(normalizedRight);
}

function matchesRecordFilter(record, filter) {
  if (!isPlainObject(filter)) {
    return true;
  }
  return Object.entries(filter).every(([key, expected]) => valuesEqual(record?.[key], expected));
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

async function listCollectionsMeta({ apiBase, token }) {
  const response = await requestJson({
    method: 'GET',
    url: `${apiBase}/api/collections:listMeta?pageSize=2000`,
    token,
  });
  return Array.isArray(response.data) ? response.data : [];
}

async function createCollection({ apiBase, token, requestBody }) {
  return requestJson({
    method: 'POST',
    url: `${apiBase}/api/collections:create`,
    token,
    body: requestBody,
  });
}

async function createCollectionField({ apiBase, token, collectionName, requestBody }) {
  return requestJson({
    method: 'POST',
    url: `${apiBase}/api/collections/${encodeURIComponent(collectionName)}/fields:create`,
    token,
    body: requestBody,
  });
}

async function updateCollectionOptions({ apiBase, token, collectionName, values }) {
  return requestJson({
    method: 'POST',
    url: `${apiBase}/api/collections:update?filterByTk=${encodeURIComponent(collectionName)}`,
    token,
    body: {
      values,
    },
  });
}

async function createRecord({ apiBase, token, collectionName, requestBody }) {
  return requestJson({
    method: 'POST',
    url: `${apiBase}/api/${encodeURIComponent(collectionName)}:create`,
    token,
    body: requestBody,
  });
}

async function listRecords({ apiBase, token, collectionName, pageSize = 2000 }) {
  const response = await requestJson({
    method: 'GET',
    url: `${apiBase}/api/${encodeURIComponent(collectionName)}:list?pageSize=${pageSize}`,
    token,
  });
  return {
    rows: Array.isArray(response.raw?.data) ? response.raw.data : (Array.isArray(response.data) ? response.data : []),
    meta: isPlainObject(response.raw?.meta) ? response.raw.meta : {},
  };
}

function loadManifestIndex(manifestFiles) {
  const caseIndex = new Map();
  manifestFiles
    .filter((filePath) => fs.existsSync(filePath))
    .forEach((filePath) => {
      const document = readJson(filePath);
      normalizeList(document.cases).forEach((caseEntry) => {
        const normalizedCaseId = normalizeCaseId(caseEntry?.caseId);
        if (!normalizedCaseId) {
          return;
        }
        caseIndex.set(normalizedCaseId, {
          manifestPath: filePath,
          manifestDocument: document,
          caseEntry,
        });
      });
    });
  return caseIndex;
}

function caseHasSufficientDatasetEvidence(caseEntry) {
  if (typeof caseEntry?.rawEvidenceReplay?.sufficient === 'boolean') {
    return caseEntry.rawEvidenceReplay.sufficient;
  }
  if (typeof caseEntry?.replayEvidence?.datasetReplaySufficient === 'boolean') {
    return caseEntry.replayEvidence.datasetReplaySufficient;
  }
  return false;
}

function collectCaseLogPaths(caseEntry) {
  const logPaths = [];
  normalizeList(caseEntry?.evidence).forEach((item) => {
    if (!isPlainObject(item)) {
      return;
    }
    if ((item.kind === 'tool-log' || item.kind === 'log') && typeof item.path === 'string' && item.path.endsWith('.jsonl')) {
      logPaths.push(path.resolve(item.path));
    }
  });
  if (isPlainObject(caseEntry?.evidence)) {
    Object.entries(caseEntry.evidence).forEach(([key, value]) => {
      if (!key.endsWith('LogPath')) {
        return;
      }
      if (typeof value === 'string' && value.endsWith('.jsonl')) {
        logPaths.push(path.resolve(value));
      }
    });
  }
  return uniqueStrings(logPaths.filter((filePath) => fs.existsSync(filePath)));
}

function normalizeManifestCollections(caseEntry) {
  const collections = Array.isArray(caseEntry?.collections)
    ? caseEntry.collections
    : (Array.isArray(caseEntry?.evidencedCollections) ? caseEntry.evidencedCollections : []);

  const collectionNameByLogicalName = {};
  collections.forEach((item) => {
    const logicalName = normalizeOptionalText(item?.logicalName);
    const collectionName = normalizeOptionalText(item?.collectionName || item?.evidencedName);
    if (logicalName && collectionName) {
      collectionNameByLogicalName[logicalName] = collectionName;
    }
  });

  return {
    collections: collections
      .map((item) => {
        const logicalName = normalizeOptionalText(item?.logicalName);
        const collectionName = normalizeOptionalText(item?.collectionName || item?.evidencedName);
        if (!collectionName) {
          return null;
        }
        return {
          logicalName,
          collectionName,
          title: normalizeOptionalText(item?.title),
          fields: normalizeList(item?.fields),
        };
      })
      .filter(Boolean),
    collectionNameByLogicalName,
  };
}

function defaultInterfaceForType(type) {
  switch (type) {
    case 'belongsTo':
      return 'm2o';
    case 'belongsToMany':
      return 'm2m';
    case 'hasMany':
      return 'o2m';
    case 'hasOne':
      return 'o2o';
    case 'text':
      return 'textarea';
    case 'date':
      return 'datetime';
    case 'integer':
    case 'bigInt':
    case 'float':
    case 'double':
    case 'decimal':
      return 'number';
    case 'string':
    default:
      return 'input';
  }
}

function normalizeFieldDefinition(field, collectionNameByLogicalName = {}) {
  if (!isPlainObject(field)) {
    return null;
  }
  const name = normalizeOptionalText(field.name);
  const type = normalizeOptionalText(field.type);
  if (!name || !type) {
    return null;
  }
  const normalized = {
    name,
    type,
    interface: normalizeOptionalText(field.interface) || defaultInterfaceForType(type),
  };
  if (typeof field.primaryKey === 'boolean') {
    normalized.primaryKey = field.primaryKey;
  }
  if (typeof field.isForeignKey === 'boolean') {
    normalized.isForeignKey = field.isForeignKey;
  }
  const target = normalizeOptionalText(field.targetCollection || field.target);
  if (target) {
    normalized.target = collectionNameByLogicalName[target] || target;
  }
  const foreignKey = normalizeOptionalText(field.foreignKey);
  if (foreignKey) {
    normalized.foreignKey = foreignKey;
  }
  const otherKey = normalizeOptionalText(field.otherKey);
  if (otherKey) {
    normalized.otherKey = otherKey;
  }
  const through = normalizeOptionalText(field.through);
  if (through) {
    normalized.through = collectionNameByLogicalName[through] || through;
  }
  const targetKey = normalizeOptionalText(field.targetKey);
  if (targetKey) {
    normalized.targetKey = targetKey;
  }
  const sourceKey = normalizeOptionalText(field.sourceKey);
  if (sourceKey) {
    normalized.sourceKey = sourceKey;
  }
  if (isPlainObject(field.uiSchema)) {
    normalized.uiSchema = cloneJson(field.uiSchema);
  }
  return normalized;
}

function extractCountRequirements(caseEntry, collectionNameByLogicalName) {
  const countByCollectionName = {};

  const addCounts = (counts) => {
    if (!isPlainObject(counts)) {
      return;
    }
    Object.entries(counts).forEach(([logicalName, rawCount]) => {
      const collectionName = collectionNameByLogicalName[logicalName] || logicalName;
      if (!collectionName || !Number.isFinite(rawCount)) {
        return;
      }
      const count = Number(rawCount);
      const current = countByCollectionName[collectionName] ?? 0;
      countByCollectionName[collectionName] = Math.max(current, count);
    });
  };

  addCounts(caseEntry?.samplePlan?.counts);
  addCounts(caseEntry?.sampleRequirements?.evidencedCounts);
  addCounts(caseEntry?.sampleRequirements?.specMinimumCounts);

  return countByCollectionName;
}

function extractKeySampleChecks(caseEntry, collectionNameByLogicalName) {
  const checks = [];

  normalizeList(caseEntry?.samplePlan?.keySampleFilters).forEach((item) => {
    if (!isPlainObject(item)) {
      return;
    }
    const collectionName = normalizeOptionalText(item.collectionName);
    if (!collectionName) {
      return;
    }
    checks.push({
      label: normalizeOptionalText(item.label) || collectionName,
      collectionName,
      filter: isPlainObject(item.filter) ? cloneJson(item.filter) : null,
      filterByTk: item.filterByTk,
      expected: isPlainObject(item.expected) ? cloneJson(item.expected) : {},
    });
  });

  normalizeList(caseEntry?.sampleRequirements?.criticalFilters).forEach((item) => {
    if (!isPlainObject(item)) {
      return;
    }
    const collectionName = collectionNameByLogicalName[normalizeOptionalText(item.collection)] || normalizeOptionalText(item.collection);
    if (!collectionName) {
      return;
    }
    checks.push({
      label: normalizeOptionalText(item.purpose) || collectionName,
      collectionName,
      filter: isPlainObject(item.filter) ? cloneJson(item.filter) : null,
      filterByTk: item.filterByTk,
      expected: {
        ...(Number.isFinite(item.expectedCount) ? { count: Number(item.expectedCount) } : {}),
        ...(Number.isFinite(item.expectedCountAtLeast) ? { countAtLeast: Number(item.expectedCountAtLeast) } : {}),
      },
    });
  });

  return checks;
}

function normalizeToolCallRequestValue(event) {
  if (!isPlainObject(event?.args)) {
    return null;
  }
  if (isPlainObject(event.args.requestBody)) {
    return cloneJson(event.args.requestBody);
  }
  if (isPlainObject(event.args.values)) {
    return cloneJson(event.args.values);
  }
  return null;
}

function eventActionAndResource(event) {
  const action = normalizeOptionalText(event?.args?.action).toLowerCase();
  const resource = normalizeOptionalText(event?.args?.resource);
  return { action, resource };
}

function isCollectionCreateEvent(event) {
  const { action, resource } = eventActionAndResource(event);
  return event?.tool === 'PostCollections_create' || (action === 'create' && resource === 'collections');
}

function isFieldCreateEvent(event) {
  const { action, resource } = eventActionAndResource(event);
  return event?.tool === 'PostCollectionsFields_create' || (action === 'create' && resource === 'collections.fields');
}

function isRecordCreateEvent(event) {
  if (event?.tool === 'PostCollectionname__create') {
    return true;
  }
  const { action, resource } = eventActionAndResource(event);
  if (action !== 'create' || !resource || SPECIAL_RESOURCES.has(resource)) {
    return false;
  }
  return !resource.includes(':') && !resource.startsWith('dataSources/');
}

function buildOperationKey(collectionName, value) {
  return `${collectionName}::${JSON.stringify(value)}`;
}

function extractReplayPlanFromLogs(logPaths) {
  const collectionCreates = new Map();
  const fieldCreates = new Map();
  const recordCreates = new Map();
  const collectionCreateKeys = new Set();
  const fieldCreateKeys = new Set();
  const recordCreateKeys = new Set();

  logPaths.forEach((logPath) => {
    readJsonLines(logPath).forEach((event) => {
      if (event?.type !== 'tool_call' || event?.status !== 'ok') {
        return;
      }

      if (isCollectionCreateEvent(event)) {
        const requestBody = normalizeToolCallRequestValue(event);
        const collectionName = normalizeOptionalText(requestBody?.name);
        if (!collectionName) {
          return;
        }
        const key = buildOperationKey(collectionName, requestBody);
        if (collectionCreateKeys.has(key)) {
          return;
        }
        collectionCreateKeys.add(key);
        if (!collectionCreates.has(collectionName)) {
          collectionCreates.set(collectionName, requestBody);
        }
        return;
      }

      if (isFieldCreateEvent(event)) {
        const requestBody = normalizeToolCallRequestValue(event);
        const collectionName = normalizeOptionalText(event?.args?.collectionName || event?.args?.sourceId || requestBody?.collectionName);
        const fieldName = normalizeOptionalText(requestBody?.name);
        if (!collectionName || !fieldName) {
          return;
        }
        const key = buildOperationKey(`${collectionName}.${fieldName}`, requestBody);
        if (fieldCreateKeys.has(key)) {
          return;
        }
        fieldCreateKeys.add(key);
        if (!fieldCreates.has(collectionName)) {
          fieldCreates.set(collectionName, []);
        }
        fieldCreates.get(collectionName).push(requestBody);
        return;
      }

      if (isRecordCreateEvent(event)) {
        const requestBody = normalizeToolCallRequestValue(event);
        const { resource } = eventActionAndResource(event);
        const collectionName = normalizeOptionalText(event?.args?.collectionName || resource);
        if (!collectionName || !isPlainObject(requestBody)) {
          return;
        }
        const key = buildOperationKey(collectionName, requestBody);
        if (recordCreateKeys.has(key)) {
          return;
        }
        recordCreateKeys.add(key);
        if (!recordCreates.has(collectionName)) {
          recordCreates.set(collectionName, []);
        }
        recordCreates.get(collectionName).push(requestBody);
      }
    });
  });

  return {
    collectionCreates,
    fieldCreates,
    recordCreates,
  };
}

function mergeFieldIntoMap(fieldMap, field) {
  const normalizedField = normalizeFieldDefinition(field) || field;
  if (!isPlainObject(normalizedField)) {
    return;
  }
  const fieldName = normalizeOptionalText(normalizedField.name);
  if (!fieldName) {
    return;
  }
  const previous = fieldMap.get(fieldName) || {};
  fieldMap.set(fieldName, {
    ...cloneJson(previous),
    ...cloneJson(normalizedField),
  });
}

function loadTemplateMetadata(templateArtifactsDir) {
  const candidates = [
    path.join(templateArtifactsDir, 'metadata.json'),
    path.join(templateArtifactsDir, 'metadata.live.json'),
    path.join(templateArtifactsDir, 'metadata.live.step1.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const parsed = readJson(candidate);
      if (isPlainObject(parsed?.collections)) {
        return {
          metadataPath: candidate,
          metadata: parsed,
        };
      }
    }
  }

  return {
    metadataPath: '',
    metadata: { collections: {} },
  };
}

function guessTitleField(fields) {
  const normalizedFields = normalizeList(fields)
    .map((field) => normalizeFieldDefinition(field))
    .filter(Boolean);
  const byName = new Map(normalizedFields.map((field) => [field.name, field]));
  for (const candidate of TITLE_FIELD_CANDIDATES) {
    const matched = byName.get(candidate);
    if (matched) {
      return candidate;
    }
  }
  const fallback = normalizedFields.find((field) => (
    !RELATION_FIELD_TYPES.has(field.type)
    && !field.name.endsWith('_id')
    && ['string', 'text'].includes(field.type)
  ));
  return fallback?.name || '';
}

function normalizeFilterTargetKeyOption(value) {
  if (Array.isArray(value)) {
    const normalized = uniqueStrings(value);
    if (normalized.length === 0) {
      return '';
    }
    if (normalized.length === 1) {
      return normalized[0];
    }
    return normalized;
  }
  return normalizeOptionalText(value);
}

function filterTargetKeyOptionsEqual(left, right) {
  const normalizedLeft = normalizeFilterTargetKeyOption(left);
  const normalizedRight = normalizeFilterTargetKeyOption(right);
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function inferFilterTargetKey({ fields, metadataCollection, collectionCreateRequest }) {
  const normalizedFields = normalizeList(fields)
    .map((field) => normalizeFieldDefinition(field))
    .filter(Boolean);
  const fieldNames = new Set(normalizedFields.map((field) => field.name));
  const relationForeignKeys = uniqueStrings(
    normalizedFields
      .filter((field) => field.type === 'belongsTo' && normalizeOptionalText(field.foreignKey))
      .map((field) => field.foreignKey),
  );
  const explicitThroughCollection = Boolean(metadataCollection?.isThrough || collectionCreateRequest?.isThrough);
  const inferredThroughCollection = relationForeignKeys.length > 1
    && relationForeignKeys.every((fieldName) => fieldNames.has(fieldName));
  const isThroughCollection = explicitThroughCollection || inferredThroughCollection;
  const configuredFilterTargetKey = normalizeFilterTargetKeyOption(metadataCollection?.filterTargetKey);
  if (configuredFilterTargetKey) {
    if (
      configuredFilterTargetKey === 'id'
      && !fieldNames.has('id')
      && isThroughCollection
      && relationForeignKeys.length > 0
    ) {
      return relationForeignKeys.length === 1 ? relationForeignKeys[0] : relationForeignKeys;
    }
    return configuredFilterTargetKey;
  }

  const primaryKeyFields = uniqueStrings(
    normalizedFields
      .filter((field) => field.primaryKey === true)
      .map((field) => field.name),
  );
  if (primaryKeyFields.length === 1) {
    return primaryKeyFields[0];
  }
  if (primaryKeyFields.length > 1) {
    return primaryKeyFields;
  }

  if (isThroughCollection && relationForeignKeys.length === 1) {
    return relationForeignKeys[0];
  }
  if (isThroughCollection && relationForeignKeys.length > 1) {
    return relationForeignKeys;
  }

  const autoGenId = metadataCollection?.autoGenId ?? collectionCreateRequest?.autoGenId;
  if (fieldNames.has('id') || autoGenId !== false) {
    return 'id';
  }

  return '';
}

function resolveDesiredCollectionOptions({ fields, metadataCollection, collectionCreateRequest }) {
  const normalizedFields = normalizeList(fields)
    .map((field) => normalizeFieldDefinition(field))
    .filter(Boolean);
  const titleField = normalizeOptionalText(metadataCollection?.titleField) || guessTitleField(normalizedFields);
  const filterTargetKey = inferFilterTargetKey({
    fields: normalizedFields,
    metadataCollection,
    collectionCreateRequest,
  });
  return {
    titleField,
    filterTargetKey,
  };
}

function mergeCollectionPlanFields({
  collectionCreateRequest,
  extraFieldCreates,
  manifestCollection,
  collectionNameByLogicalName,
}) {
  const fieldMap = new Map();

  normalizeList(collectionCreateRequest?.fields).forEach((field) => {
    mergeFieldIntoMap(fieldMap, field);
  });
  normalizeList(extraFieldCreates).forEach((field) => {
    mergeFieldIntoMap(fieldMap, field);
  });

  const manifestFields = normalizeList(manifestCollection?.fields)
    .map((field) => normalizeFieldDefinition(field, collectionNameByLogicalName))
    .filter(Boolean);
  const relationForeignKeys = new Set(
    manifestFields
      .filter((field) => RELATION_FIELD_TYPES.has(field.type) && normalizeOptionalText(field.foreignKey))
      .map((field) => field.foreignKey),
  );
  manifestFields.forEach((field) => {
    if (!fieldMap.has(field.name) && relationForeignKeys.has(field.name)) {
      return;
    }
    mergeFieldIntoMap(fieldMap, field);
  });

  return [...fieldMap.values()];
}

function buildCollectionPlans({ caseEntry, templateMetadata }) {
  const { collections: manifestCollections, collectionNameByLogicalName } = normalizeManifestCollections(caseEntry);
  const countRequirements = extractCountRequirements(caseEntry, collectionNameByLogicalName);
  const sampleChecks = extractKeySampleChecks(caseEntry, collectionNameByLogicalName);
  const replayPlan = extractReplayPlanFromLogs(collectCaseLogPaths(caseEntry));
  const collectionNames = uniqueStrings([
    ...manifestCollections.map((item) => item.collectionName),
    ...[...replayPlan.collectionCreates.keys()],
    ...[...replayPlan.fieldCreates.keys()],
    ...[...replayPlan.recordCreates.keys()],
  ]);

  const manifestCollectionMap = new Map(manifestCollections.map((item) => [item.collectionName, item]));
  const collectionPlans = collectionNames.map((collectionName) => {
    const manifestCollection = manifestCollectionMap.get(collectionName) || null;
    const collectionCreateRequest = replayPlan.collectionCreates.get(collectionName) || {
      name: collectionName,
      title: manifestCollection?.title || collectionName,
      template: 'general',
    };
    const fields = mergeCollectionPlanFields({
      collectionCreateRequest,
      extraFieldCreates: replayPlan.fieldCreates.get(collectionName) || [],
      manifestCollection,
      collectionNameByLogicalName,
    });
    const metadataCollection = isPlainObject(templateMetadata?.collections?.[collectionName])
      ? templateMetadata.collections[collectionName]
      : {};
    const options = resolveDesiredCollectionOptions({
      fields,
      metadataCollection,
      collectionCreateRequest,
    });

    return {
      collectionName,
      logicalName: manifestCollection?.logicalName || '',
      collectionCreateRequest: {
        ...cloneJson(collectionCreateRequest),
        fields: normalizeList(collectionCreateRequest.fields).length > 0 ? cloneJson(collectionCreateRequest.fields) : [],
      },
      fields,
      records: normalizeList(replayPlan.recordCreates.get(collectionName)).map((item) => cloneJson(item)),
      requiredCount: countRequirements[collectionName] ?? 0,
      options,
      metadataCollection: cloneJson(metadataCollection),
      sampleChecks: sampleChecks.filter((item) => item.collectionName === collectionName),
    };
  });

  return {
    replayPlan,
    collectionPlans,
    countRequirements,
    sampleChecks,
  };
}

async function provisionCollection({ apiBase, token, collectionPlan, currentCollectionMeta }) {
  const summary = {
    collectionName: collectionPlan.collectionName,
    createdCollection: false,
    createdFieldNames: [],
    createdRecordCount: 0,
    updatedOptions: {},
    notes: [],
  };

  if (!currentCollectionMeta) {
    const createRequestBody = cloneJson(collectionPlan.collectionCreateRequest);
    if (normalizeList(createRequestBody.fields).length === 0) {
      delete createRequestBody.fields;
    }
    try {
      await createCollection({
        apiBase,
        token,
        requestBody: createRequestBody,
      });
      summary.createdCollection = true;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      summary.notes.push('collection already exists, continue with refresh');
    }
  }

  const refreshedCollections = await listCollectionsMeta({ apiBase, token });
  const refreshedCollectionMeta = refreshedCollections.find((item) => item?.name === collectionPlan.collectionName) || null;
  const existingFieldNames = new Set(
    normalizeList(refreshedCollectionMeta?.fields)
      .map((field) => normalizeOptionalText(field?.name))
      .filter(Boolean),
  );

  for (const field of collectionPlan.fields) {
    if (!isPlainObject(field) || !field.name || existingFieldNames.has(field.name)) {
      continue;
    }
    try {
      await createCollectionField({
        apiBase,
        token,
        collectionName: collectionPlan.collectionName,
        requestBody: field,
      });
      summary.createdFieldNames.push(field.name);
      existingFieldNames.add(field.name);
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      summary.notes.push(`field already exists: ${field.name}`);
      existingFieldNames.add(field.name);
    }
  }

  const collectionMetaAfterFields = (await listCollectionsMeta({ apiBase, token }))
    .find((item) => item?.name === collectionPlan.collectionName) || null;
  const nextOptions = {};
  const currentTitleField = normalizeOptionalText(collectionMetaAfterFields?.titleField);
  const currentFilterTargetKey = normalizeFilterTargetKeyOption(
    collectionMetaAfterFields?.filterTargetKey
      ?? collectionMetaAfterFields?.values?.filterTargetKey
      ?? collectionMetaAfterFields?.options?.filterTargetKey,
  );
  if (collectionPlan.options.titleField && currentTitleField !== collectionPlan.options.titleField) {
    nextOptions.titleField = collectionPlan.options.titleField;
  }
  if (
    collectionPlan.options.filterTargetKey
    && !filterTargetKeyOptionsEqual(currentFilterTargetKey, collectionPlan.options.filterTargetKey)
  ) {
    nextOptions.filterTargetKey = collectionPlan.options.filterTargetKey;
  }
  if (Object.keys(nextOptions).length > 0) {
    await updateCollectionOptions({
      apiBase,
      token,
      collectionName: collectionPlan.collectionName,
      values: nextOptions,
    });
    summary.updatedOptions = nextOptions;
  }

  const recordListBefore = await listRecords({
    apiBase,
    token,
    collectionName: collectionPlan.collectionName,
  });
  const existingCount = Number.isFinite(recordListBefore.meta?.count)
    ? Number(recordListBefore.meta.count)
    : recordListBefore.rows.length;
  const desiredRecordCount = collectionPlan.requiredCount || collectionPlan.records.length;
  if (existingCount < desiredRecordCount) {
    const recordPayloads = collectionPlan.records.slice(existingCount);
    for (const recordPayload of recordPayloads) {
      await createRecord({
        apiBase,
        token,
        collectionName: collectionPlan.collectionName,
        requestBody: recordPayload,
      });
      summary.createdRecordCount += 1;
    }
    if (summary.createdRecordCount < desiredRecordCount - existingCount) {
      summary.notes.push(`raw record evidence only covers ${summary.createdRecordCount + existingCount}/${desiredRecordCount}`);
    }
  }

  return summary;
}

async function verifyProvisionedCollections({ apiBase, token, collectionPlans }) {
  const verification = [];
  for (const collectionPlan of collectionPlans) {
    const result = await listRecords({
      apiBase,
      token,
      collectionName: collectionPlan.collectionName,
    });
    const rows = result.rows;
    const count = Number.isFinite(result.meta?.count) ? Number(result.meta.count) : rows.length;
    const checkResults = collectionPlan.sampleChecks.map((check) => {
      if (check.filterByTk !== undefined && check.filterByTk !== null) {
        const matched = rows.find((item) => valuesEqual(item?.id, check.filterByTk));
        return {
          label: check.label,
          ok: Boolean(matched),
          mode: 'filterByTk',
          expected: check.expected,
        };
      }
      const matchedRows = rows.filter((item) => matchesRecordFilter(item, check.filter));
      const expectedCount = Number.isFinite(check.expected?.count) ? Number(check.expected.count) : null;
      const expectedCountAtLeast = Number.isFinite(check.expected?.countAtLeast) ? Number(check.expected.countAtLeast) : null;
      const ok = (
        (expectedCount === null || matchedRows.length === expectedCount)
        && (expectedCountAtLeast === null || matchedRows.length >= expectedCountAtLeast)
      );
      return {
        label: check.label,
        ok,
        mode: 'filter',
        matchedCount: matchedRows.length,
        expected: check.expected,
      };
    });
    verification.push({
      collectionName: collectionPlan.collectionName,
      count,
      requiredCount: collectionPlan.requiredCount,
      countOk: collectionPlan.requiredCount > 0 ? count >= collectionPlan.requiredCount : true,
      checks: checkResults,
    });
  }
  return verification;
}

export async function provisionValidationCaseDataset({
  caseId,
  manifestFiles = DEFAULT_MANIFEST_FILES,
  templateArtifactsDir = '',
  outDir = '',
  urlBase = 'http://127.0.0.1:23000',
}) {
  const normalizedCaseId = normalizeCaseId(caseId);
  if (!normalizedCaseId) {
    throw new Error('case id is required');
  }

  const caseIndex = loadManifestIndex(manifestFiles);
  const matched = caseIndex.get(normalizedCaseId);
  if (!matched) {
    throw new Error(`case manifest not found for ${normalizedCaseId}`);
  }

  const token = normalizeRequiredText(process.env.NOCOBASE_API_TOKEN, 'NOCOBASE_API_TOKEN');
  const { apiBase } = normalizeUrlBase(urlBase);
  const { metadataPath, metadata } = templateArtifactsDir && fs.existsSync(templateArtifactsDir)
    ? loadTemplateMetadata(path.resolve(templateArtifactsDir))
    : { metadataPath: '', metadata: { collections: {} } };
  const plan = buildCollectionPlans({
    caseEntry: matched.caseEntry,
    templateMetadata: metadata,
  });

  const beforeCollections = await listCollectionsMeta({ apiBase, token });
  const beforeCollectionMap = new Map(beforeCollections.map((item) => [item?.name, item]));
  const provisionResults = [];

  for (const collectionPlan of plan.collectionPlans) {
    provisionResults.push(await provisionCollection({
      apiBase,
      token,
      collectionPlan,
      currentCollectionMeta: beforeCollectionMap.get(collectionPlan.collectionName) || null,
    }));
  }

  const verification = await verifyProvisionedCollections({
    apiBase,
    token,
    collectionPlans: plan.collectionPlans,
  });
  const countsSatisfied = verification.every((item) => item.countOk);
  const summary = {
    caseId: normalizedCaseId,
    manifestPath: matched.manifestPath,
    templateArtifactsDir: templateArtifactsDir ? path.resolve(templateArtifactsDir) : '',
    templateMetadataPath: metadataPath,
    datasetEvidenceSufficient: caseHasSufficientDatasetEvidence(matched.caseEntry),
    usedLogPaths: collectCaseLogPaths(matched.caseEntry),
    collectionPlans: plan.collectionPlans.map((item) => ({
      collectionName: item.collectionName,
      logicalName: item.logicalName,
      requiredCount: item.requiredCount,
      plannedFieldCount: item.fields.length,
      plannedRecordCount: item.records.length,
      options: item.options,
    })),
    provisionResults,
    verification,
    datasetReady: countsSatisfied,
    nativeTemplateReady: caseHasSufficientDatasetEvidence(matched.caseEntry) && countsSatisfied,
  };

  if (outDir) {
    const resolvedOutDir = path.resolve(outDir);
    ensureDir(resolvedOutDir);
    writeJson(path.join(resolvedOutDir, 'summary.json'), summary);
  }

  return summary;
}

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== 'provision') {
    throw new Error(`Unsupported command "${command}"`);
  }

  const result = await provisionValidationCaseDataset({
    caseId: flags['case-id'],
    manifestFiles: parseManifestFiles(flags['manifest-files']),
    templateArtifactsDir: normalizeOptionalText(flags['template-artifacts-dir']),
    outDir: normalizeOptionalText(flags['out-dir']),
    urlBase: normalizeOptionalText(flags['url-base']) || 'http://127.0.0.1:23000',
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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

export {
  buildCollectionPlans,
  caseHasSufficientDatasetEvidence,
  extractReplayPlanFromLogs,
  guessTitleField,
  inferFilterTargetKey,
  loadManifestIndex,
  normalizeManifestCollections,
  resolveDesiredCollectionOptions,
};
