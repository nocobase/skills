#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { buildInstanceFingerprint, createStableCacheStore, DEFAULT_TTL_MS_BY_KIND } from './stable_cache.mjs';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || '';
}

function normalizeRequiredText(value, label) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function sortUniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === 'help') {
    return { command: 'help', flags: {} };
  }
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
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

function usage() {
  return [
    'Usage:',
    '  node scripts/instance_inventory_probe.mjs probe --candidate-page-url <url> [--url-base <url>] [--token <token>] [--state-dir <dir>] [--no-cache]',
    '  node scripts/instance_inventory_probe.mjs materialize --candidate-page-url <url> (--schema-bundle-json <json> | --schema-bundle-file <path>) [--schemas-json <json> | --schemas-file <path>] [--url-base <url>] [--state-dir <dir>] [--no-cache] [--out-file <path>]',
  ].join('\n');
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

export function deriveUrlBaseFromCandidatePageUrl(candidatePageUrl) {
  const raw = normalizeText(candidatePageUrl);
  if (!raw) {
    return '';
  }

  try {
    const url = new URL(raw);
    const origin = url.origin;
    const path = url.pathname || '';
    if (!path || path === '/') {
      return origin;
    }
    if (path === '/admin' || path.startsWith('/admin/')) {
      return `${origin}/admin`;
    }
    const match = /^(.*\/admin)(?:\/|$)/.exec(path);
    if (match && match[1]) {
      return `${origin}${match[1]}`;
    }
    return origin;
  } catch {
    return '';
  }
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

function parseJson(rawValue, label) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readJsonInput(jsonValue, filePath, label, { required = true } = {}) {
  if (typeof jsonValue === 'string' && jsonValue.trim()) {
    return parseJson(jsonValue, label);
  }
  if (typeof filePath === 'string' && filePath.trim()) {
    return parseJson(fs.readFileSync(path.resolve(filePath), 'utf8'), `${label} file`);
  }
  if (required) {
    throw new Error(`${label} is required`);
  }
  return null;
}

async function requestJson({ method = 'GET', url, token, body }) {
  const headers = {
    Accept: 'application/json',
  };
  const normalizedToken = normalizeOptionalText(token);
  if (normalizedToken) {
    headers.Authorization = `Bearer ${normalizedToken}`;
  }
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

function inferSemanticTags({ use, title, hintMessages, contextRequirements, unresolvedReasons }) {
  const text = [
    use,
    title,
    ...(Array.isArray(hintMessages) ? hintMessages : []),
    ...(Array.isArray(contextRequirements) ? contextRequirements : []),
    ...(Array.isArray(unresolvedReasons) ? unresolvedReasons : []),
  ].join(' ').toLowerCase();

  const tags = new Set();
  const maybeAdd = (tag, patterns) => {
    if (patterns.some((pattern) => text.includes(pattern))) {
      tags.add(tag);
    }
  };

  maybeAdd('analytics', ['chart', 'dashboard', 'sql', 'query', 'builder', 'trend', 'analytics', 'report']);
  maybeAdd('metrics', ['grid card', 'card', 'metric', 'kpi', 'overview', 'summary']);
  maybeAdd('actions', ['action panel', 'action registry', 'shortcut', 'todo', 'scan', 'button']);
  maybeAdd('docs', ['markdown', 'renderer', 'liquid', 'guide', 'help', 'instruction', 'doc']);
  maybeAdd('collaboration', ['comment', 'discussion', 'collaboration', 'activity']);
  maybeAdd('geo', ['map', 'marker', 'geolocation', 'location']);
  maybeAdd('template', ['template', 'reference', 'targetuid', 'existing block uid']);
  maybeAdd('embed', ['iframe', 'html mode', 'external', 'url', 'embed']);
  maybeAdd('feed', ['list block', 'list', 'timeline', 'feed']);

  return [...tags].sort((left, right) => left.localeCompare(right));
}

function buildCatalogEntryFromSchemaDocument(document) {
  if (!isPlainObject(document) || typeof document.use !== 'string') {
    return null;
  }
  const use = document.use.trim();
  const title = normalizeOptionalText(document.title);
  const hints = Array.isArray(document.dynamicHints) ? document.dynamicHints : [];
  const hintKinds = sortUniqueStrings(hints.map((hint) => (typeof hint?.kind === 'string' ? hint.kind : '')));
  const hintPaths = sortUniqueStrings(hints.map((hint) => (typeof hint?.path === 'string' ? hint.path : '')));
  const hintMessages = sortUniqueStrings(hints.map((hint) => (typeof hint?.message === 'string' ? hint.message : '')));
  const contextRequirements = sortUniqueStrings(hints.flatMap((hint) => {
    const xflow = hint && typeof hint === 'object' ? hint['x-flow'] : null;
    return Array.isArray(xflow?.contextRequirements) ? xflow.contextRequirements : [];
  }));
  const unresolvedReasons = sortUniqueStrings(hints.map((hint) => {
    const xflow = hint && typeof hint === 'object' ? hint['x-flow'] : null;
    return typeof xflow?.unresolvedReason === 'string' ? xflow.unresolvedReason : '';
  }));
  const semanticTags = inferSemanticTags({
    use,
    title,
    hintMessages,
    contextRequirements,
    unresolvedReasons,
  });

  return {
    use,
    title,
    hintKinds,
    hintPaths,
    hintMessages,
    contextRequirements,
    unresolvedReasons,
    semanticTags,
  };
}

function normalizeCollectionField(field) {
  if (!isPlainObject(field)) {
    return null;
  }
  const name = normalizeOptionalText(field.name || field.field);
  if (!name) {
    return null;
  }
  const target = normalizeOptionalText(field.target);
  const type = normalizeOptionalText(field.type);
  const interfaceName = normalizeOptionalText(field.interface);
  const relation = Boolean(
    target
      || ['belongsTo', 'hasMany', 'belongsToMany', 'hasOne'].includes(type)
      || ['m2o', 'o2m', 'm2m', 'oho'].includes(interfaceName),
  );
  return {
    name,
    type,
    interface: interfaceName,
    target,
    relation,
  };
}

function normalizeCollectionMeta(collection) {
  if (!isPlainObject(collection)) {
    return null;
  }
  const name = normalizeOptionalText(collection.name);
  if (!name) {
    return null;
  }
  const fields = (Array.isArray(collection.fields) ? collection.fields : [])
    .map(normalizeCollectionField)
    .filter(Boolean);
  return {
    name,
    title: normalizeOptionalText(collection.title),
    titleField: normalizeOptionalText(collection.titleField),
    origin: normalizeOptionalText(collection.origin),
    template: normalizeOptionalText(collection.template),
    tree: normalizeOptionalText(collection.tree),
    fieldNames: sortUniqueStrings(fields.map((field) => field.name)),
    scalarFieldNames: sortUniqueStrings(fields.filter((field) => !field.relation).map((field) => field.name)),
    relationFields: sortUniqueStrings(fields.filter((field) => field.relation).map((field) => field.name)),
  };
}

async function probeCollectionsInventory({ apiBase, token, errors }) {
  const notes = [];
  const collections = {
    detected: false,
    names: [],
    byName: {},
    discoveryNotes: [],
  };

  try {
    const collectionsResp = await requestJson({
      method: 'GET',
      url: `${apiBase}/api/collections:listMeta?pageSize=2000`,
      token,
    });
    const items = Array.isArray(collectionsResp.data) ? collectionsResp.data : [];
    const normalized = items
      .map(normalizeCollectionMeta)
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name));
    collections.names = normalized.map((item) => item.name);
    collections.byName = Object.fromEntries(normalized.map((item) => [item.name, item]));
    collections.detected = normalized.length > 0;
    notes.push(`collections:listMeta returned: ${normalized.length}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  collections.discoveryNotes = notes;
  return collections;
}

async function probeFlowSchemaInventory({ apiBase, token, candidateUses, errors }) {
  const safeUses = sortUniqueStrings(candidateUses);
  const notes = [];
  const flowSchema = {
    detected: false,
    rootPublicUses: [],
    publicUseCatalog: [],
    missingUses: [],
    discoveryNotes: [],
  };

  try {
    const bundleResp = await requestJson({
      method: 'POST',
      url: `${apiBase}/api/flowModels:schemaBundle`,
      token,
      body: { uses: safeUses },
    });
    const items = Array.isArray(bundleResp.data?.items) ? bundleResp.data.items : [];
    const blockGridDoc = items.find((item) => item?.use === 'BlockGridModel') || null;
    const candidates = Array.isArray(blockGridDoc?.subModelCatalog?.items?.candidates)
      ? blockGridDoc.subModelCatalog.items.candidates
      : [];
    flowSchema.rootPublicUses = sortUniqueStrings(
      candidates.map((candidate) => (typeof candidate?.use === 'string' ? candidate.use : '')).filter(Boolean),
    );
    flowSchema.detected = flowSchema.rootPublicUses.length > 0;
    notes.push(`schemaBundle resolved BlockGridModel candidates: ${flowSchema.rootPublicUses.length}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (!flowSchema.detected) {
    flowSchema.discoveryNotes = notes;
    return flowSchema;
  }

  const requestUses = flowSchema.rootPublicUses;
  try {
    const schemasResp = await requestJson({
      method: 'POST',
      url: `${apiBase}/api/flowModels:schemas`,
      token,
      body: { uses: requestUses.slice(0, 60) },
    });
    const docs = Array.isArray(schemasResp.data) ? schemasResp.data : [];
    const catalog = docs
      .map(buildCatalogEntryFromSchemaDocument)
      .filter(Boolean)
      .sort((left, right) => left.use.localeCompare(right.use));
    flowSchema.publicUseCatalog = catalog;
    const returnedUses = new Set(catalog.map((item) => item.use));
    flowSchema.missingUses = requestUses.filter((use) => !returnedUses.has(use));
    notes.push(`schemas returned: ${docs.length}`);
    if (flowSchema.missingUses.length > 0) {
      notes.push(`schemas missing: ${flowSchema.missingUses.length}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  flowSchema.discoveryNotes = notes;
  return flowSchema;
}

export function materializeInstanceInventory({
  candidatePageUrl,
  urlBase,
  schemaBundle,
  schemas = null,
  stateDir,
  allowCache = true,
} = {}) {
  const derivedUrlBase = normalizeText(urlBase) || deriveUrlBaseFromCandidatePageUrl(candidatePageUrl);
  const { apiBase, adminBase } = normalizeUrlBase(derivedUrlBase || 'http://127.0.0.1:23000');

  const errors = [];
  const notes = [];

  const bundleData = unwrapResponseEnvelope(schemaBundle);
  const bundleItems = Array.isArray(bundleData?.items) ? bundleData.items : [];
  const blockGridDoc = bundleItems.find((item) => item?.use === 'BlockGridModel') || null;
  const candidates = Array.isArray(blockGridDoc?.subModelCatalog?.items?.candidates)
    ? blockGridDoc.subModelCatalog.items.candidates
    : [];

  const rootPublicUses = sortUniqueStrings(
    candidates.map((candidate) => (typeof candidate?.use === 'string' ? candidate.use : '')).filter(Boolean),
  );
  const flowSchema = {
    detected: rootPublicUses.length > 0,
    rootPublicUses,
    publicUseCatalog: [],
    missingUses: [],
    discoveryNotes: [],
  };
  notes.push(`schemaBundle resolved BlockGridModel candidates: ${rootPublicUses.length}`);

  const schemasData = schemas ? unwrapResponseEnvelope(schemas) : null;
  const docs = Array.isArray(schemasData) ? schemasData : [];
  if (flowSchema.detected && docs.length > 0) {
    const catalog = docs
      .map(buildCatalogEntryFromSchemaDocument)
      .filter(Boolean)
      .sort((left, right) => left.use.localeCompare(right.use));
    flowSchema.publicUseCatalog = catalog;
    const returnedUses = new Set(catalog.map((item) => item.use));
    flowSchema.missingUses = rootPublicUses.filter((use) => !returnedUses.has(use));
    notes.push(`schemas returned: ${docs.length}`);
    if (flowSchema.missingUses.length > 0) {
      notes.push(`schemas missing: ${flowSchema.missingUses.length}`);
    }
  } else if (flowSchema.detected) {
    flowSchema.discoveryNotes.push('schemas not provided; publicUseCatalog is empty');
  }

  flowSchema.discoveryNotes.push(...notes);

  const instanceFingerprint = buildInstanceFingerprint({
    urlBase: apiBase,
    appVersion: '',
    enabledPluginNames: [],
  });
  const inventory = {
    detected: flowSchema.detected,
    apiBase,
    adminBase,
    appVersion: '',
    enabledPlugins: [],
    enabledPluginsDetected: false,
    instanceFingerprint,
    flowSchema,
    collections: {
      detected: false,
      names: [],
      byName: {},
      discoveryNotes: [],
    },
    notes: [],
    errors,
    cache: {
      hit: false,
      source: 'materialize',
    },
  };

  if (allowCache) {
    const store = createStableCacheStore({ stateDir });
    const ttlMs = 10 * 60 * 1000;
    store.set({
      kind: 'flowSchemaInventory',
      instanceFingerprint,
      identity: 'public-root-uses-v1',
      value: inventory,
      ttlMs,
      metadata: {
        ttlMs,
        materialized: true,
      },
    });
  }

  return inventory;
}

export async function probeInstanceInventory({
  candidatePageUrl,
  urlBase,
  token = process.env.NOCOBASE_API_TOKEN,
  stateDir,
  allowCache = true,
} = {}) {
  const derivedUrlBase = normalizeText(urlBase) || deriveUrlBaseFromCandidatePageUrl(candidatePageUrl);
  const { apiBase, adminBase } = normalizeUrlBase(derivedUrlBase || 'http://127.0.0.1:23000');

  const errors = [];
  const notes = [];
  let appVersion = '';
  let enabledPlugins = [];
  let enabledPluginsDetected = false;

  try {
    const infoResp = await requestJson({
      method: 'GET',
      url: `${apiBase}/api/app:getInfo`,
      token,
    });
    const info = isPlainObject(infoResp.data) ? infoResp.data : {};
    appVersion = normalizeOptionalText(info.version);
    if (appVersion) {
      notes.push(`appVersion: ${appVersion}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const pluginsResp = await requestJson({
      method: 'GET',
      url: `${apiBase}/api/pm:listEnabled`,
      token,
    });
    const plugins = Array.isArray(pluginsResp.data) ? pluginsResp.data : [];
    enabledPlugins = sortUniqueStrings(
      plugins.map((item) => (typeof item?.packageName === 'string' ? item.packageName : '')),
    );
    enabledPluginsDetected = true;
    notes.push(`enabledPlugins: ${enabledPlugins.length}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const instanceFingerprint = buildInstanceFingerprint({
    urlBase: apiBase,
    appVersion,
    enabledPluginNames: enabledPluginsDetected ? enabledPlugins : [],
  });

  const store = createStableCacheStore({ stateDir });
  const cacheKey = {
    kind: 'flowSchemaInventory',
    instanceFingerprint,
    identity: 'public-root-uses-v1',
  };

  if (allowCache) {
    const cached = store.get(cacheKey);
    if (cached.hit) {
      const value = cached.value;
      if (value && typeof value === 'object') {
        return {
          ...value,
          cache: {
            hit: true,
            source: cached.source,
          },
        };
      }
    }
  }

  const flowSchema = await probeFlowSchemaInventory({
    apiBase,
    token,
    candidateUses: ['BlockGridModel'],
    errors,
  });
  const collections = await probeCollectionsInventory({
    apiBase,
    token,
    errors,
  });

  const inventory = {
    detected: flowSchema.detected || collections.detected,
    apiBase,
    adminBase,
    appVersion,
    enabledPlugins,
    enabledPluginsDetected,
    instanceFingerprint,
    flowSchema,
    collections,
    notes,
    errors,
    cache: {
      hit: false,
      source: 'probe',
    },
  };

  if (allowCache) {
    const ttlMs = enabledPluginsDetected
      ? DEFAULT_TTL_MS_BY_KIND.flowSchemaInventory
      : 10 * 60 * 1000;
    store.set({
      ...cacheKey,
      value: inventory,
      ttlMs,
      metadata: {
        ttlMs,
        enabledPluginsDetected,
      },
    });
  }

  return inventory;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help') {
    console.log(usage());
    return;
  }

  if (command === 'materialize') {
    const candidatePageUrl = normalizeRequiredText(flags['candidate-page-url'], '--candidate-page-url');
    const urlBase = typeof flags['url-base'] === 'string' ? flags['url-base'] : '';
    const schemaBundle = readJsonInput(
      flags['schema-bundle-json'],
      flags['schema-bundle-file'],
      'schema bundle',
      { required: true },
    );
    const schemas = readJsonInput(
      flags['schemas-json'],
      flags['schemas-file'],
      'schemas',
      { required: false },
    );
    const stateDir = typeof flags['state-dir'] === 'string' ? flags['state-dir'] : undefined;
    const allowCache = flags['no-cache'] ? false : true;
    const result = materializeInstanceInventory({
      candidatePageUrl,
      urlBase,
      schemaBundle,
      schemas,
      stateDir,
      allowCache,
    });
    const outFile = typeof flags['out-file'] === 'string' ? flags['out-file'] : '';
    if (outFile) {
      fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
      fs.writeFileSync(path.resolve(outFile), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({ ok: true, outFile: path.resolve(outFile) }, null, 2));
      return;
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command !== 'probe') {
    throw new Error(`Unsupported command: ${command}`);
  }

  const candidatePageUrl = normalizeRequiredText(flags['candidate-page-url'], '--candidate-page-url');
  const urlBase = typeof flags['url-base'] === 'string' ? flags['url-base'] : '';
  const token = typeof flags.token === 'string' ? flags.token : process.env.NOCOBASE_API_TOKEN;
  const stateDir = typeof flags['state-dir'] === 'string' ? flags['state-dir'] : undefined;
  const allowCache = flags['no-cache'] ? false : true;

  const result = await probeInstanceInventory({
    candidatePageUrl,
    urlBase,
    token,
    stateDir,
    allowCache,
  });

  console.log(JSON.stringify(result, null, 2));
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('instance_inventory_probe.mjs');
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
