#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { buildInstanceFingerprint, createStableCacheStore, DEFAULT_TTL_MS_BY_KIND } from './stable_cache.mjs';
import { readJsonInput, unwrapResponseEnvelope } from './mcp_artifact_support.mjs';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalText(value) {
  return normalizeText(value) || '';
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

const PLUGIN_HINTED_ROOT_USES = {
  '@nocobase/plugin-block-grid-card': ['GridCardBlockModel'],
  '@nocobase/plugin-charts': ['ChartBlockModel'],
  '@nocobase/plugin-data-visualization': ['ChartBlockModel'],
  '@nocobase/plugin-data-visualization-echarts': ['ChartBlockModel'],
};

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
    '  node scripts/instance_inventory_probe.mjs probe --candidate-page-url <url> --schema-bundle-file <path> [--schemas-file <path>] [--collections-meta-file <path>] [--app-info-file <path>] [--enabled-plugins-file <path>] [--state-dir <dir>] [--no-cache] [--out-file <path>]',
    '  node scripts/instance_inventory_probe.mjs materialize --candidate-page-url <url> --schema-bundle-file <path> [--schemas-file <path>] [--collections-meta-file <path>] [--app-info-file <path>] [--enabled-plugins-file <path>] [--state-dir <dir>] [--no-cache] [--out-file <path>]',
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
    const pathname = url.pathname || '';
    if (!pathname || pathname === '/') {
      return origin;
    }
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return `${origin}/admin`;
    }
    const match = /^(.*\/admin)(?:\/|$)/.exec(pathname);
    if (match && match[1]) {
      return `${origin}${match[1]}`;
    }
    return origin;
  } catch {
    return '';
  }
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

function isRecognizedPublicRootUse(use) {
  const normalizedUse = normalizeOptionalText(use);
  return Boolean(
    normalizedUse
    && (
      normalizedUse.endsWith('BlockModel')
      || normalizedUse === 'CreateFormModel'
      || normalizedUse === 'EditFormModel'
    )
  );
}

function collectSchemaDocumentRootUses(docs) {
  const uses = [];
  for (const document of Array.isArray(docs) ? docs : []) {
    if (!isPlainObject(document)) {
      continue;
    }
    const publicTreeRoots = Array.isArray(document.publicTreeRoots)
      ? document.publicTreeRoots.map((item) => normalizeOptionalText(item)).filter(Boolean)
      : [];
    uses.push(...publicTreeRoots);
    const use = normalizeOptionalText(document.use);
    if (isRecognizedPublicRootUse(use)) {
      uses.push(use);
    }
  }
  return sortUniqueStrings(uses);
}

function collectPluginHintedRootUses(enabledPluginNames) {
  const hintedUses = [];
  for (const pluginName of Array.isArray(enabledPluginNames) ? enabledPluginNames : []) {
    hintedUses.push(...(PLUGIN_HINTED_ROOT_USES[normalizeOptionalText(pluginName)] || []));
  }
  return sortUniqueStrings(hintedUses);
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
    filterTargetKey: collection.filterTargetKey ?? null,
    origin: normalizeOptionalText(collection.origin),
    template: normalizeOptionalText(collection.template),
    tree: normalizeOptionalText(collection.tree),
    fieldNames: sortUniqueStrings(fields.map((field) => field.name)),
    scalarFieldNames: sortUniqueStrings(fields.filter((field) => !field.relation).map((field) => field.name)),
    relationFields: sortUniqueStrings(fields.filter((field) => field.relation).map((field) => field.name)),
  };
}

function materializeCollectionsInventory(collectionsMeta) {
  const items = Array.isArray(unwrapResponseEnvelope(collectionsMeta))
    ? unwrapResponseEnvelope(collectionsMeta)
    : [];
  const normalized = items
    .map(normalizeCollectionMeta)
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    detected: normalized.length > 0,
    names: normalized.map((item) => item.name),
    byName: Object.fromEntries(normalized.map((item) => [item.name, item])),
    discoveryNotes: normalized.length > 0
      ? [`collections inventory provided: ${normalized.length}`]
      : ['collections inventory not provided'],
  };
}

function materializeFlowSchemaInventory({ schemaBundle, schemas, enabledPluginNames = [] }) {
  const notes = [];
  const bundleData = unwrapResponseEnvelope(schemaBundle);
  const bundleItems = Array.isArray(bundleData?.items) ? bundleData.items : [];
  const blockGridDoc = bundleItems.find((item) => item?.use === 'BlockGridModel') || null;
  const candidates = Array.isArray(blockGridDoc?.subModelCatalog?.items?.candidates)
    ? blockGridDoc.subModelCatalog.items.candidates
    : [];

  const bundleRootUses = sortUniqueStrings(
    candidates.map((candidate) => (typeof candidate?.use === 'string' ? candidate.use : '')).filter(Boolean),
  );
  const schemasData = schemas ? unwrapResponseEnvelope(schemas) : null;
  const docs = Array.isArray(schemasData) ? schemasData : [];
  const schemaDocumentRootUses = collectSchemaDocumentRootUses(docs);
  const pluginHintedRootUses = collectPluginHintedRootUses(enabledPluginNames);
  const rootPublicUses = sortUniqueStrings([
    ...bundleRootUses,
    ...schemaDocumentRootUses,
    ...pluginHintedRootUses,
  ]);
  const flowSchema = {
    detected: rootPublicUses.length > 0,
    rootPublicUses,
    publicUseCatalog: [],
    missingUses: [],
    discoveryNotes: [],
  };
  notes.push(`schemaBundle resolved BlockGridModel candidates: ${bundleRootUses.length}`);
  if (schemaDocumentRootUses.length > 0) {
    notes.push(`schemas root-use hints: ${schemaDocumentRootUses.length}`);
  }
  if (pluginHintedRootUses.length > 0) {
    notes.push(`plugin-hinted root uses: ${pluginHintedRootUses.join(', ')}`);
  }

  if (docs.length > 0) {
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
    notes.push('schemas not provided; publicUseCatalog is empty');
  }

  flowSchema.discoveryNotes = notes;
  return flowSchema;
}

function materializeEnabledPlugins(enabledPluginsArtifact) {
  const items = Array.isArray(unwrapResponseEnvelope(enabledPluginsArtifact))
    ? unwrapResponseEnvelope(enabledPluginsArtifact)
    : [];
  return sortUniqueStrings(
    items.map((item) => (typeof item?.packageName === 'string' ? item.packageName : '')),
  );
}

function materializeAppVersion(appInfoArtifact) {
  const info = unwrapResponseEnvelope(appInfoArtifact);
  return isPlainObject(info) ? normalizeOptionalText(info.version) : '';
}

export function materializeInstanceInventory({
  candidatePageUrl,
  urlBase,
  schemaBundle,
  schemas = null,
  collectionsMeta = null,
  appInfo = null,
  enabledPlugins = null,
  stateDir,
  allowCache = true,
} = {}) {
  const derivedUrlBase = normalizeText(urlBase) || deriveUrlBaseFromCandidatePageUrl(candidatePageUrl);
  const { apiBase, adminBase } = normalizeUrlBase(derivedUrlBase || 'http://127.0.0.1:23000');

  const appVersion = appInfo ? materializeAppVersion(appInfo) : '';
  const enabledPluginNames = enabledPlugins ? materializeEnabledPlugins(enabledPlugins) : [];
  const enabledPluginsDetected = enabledPlugins !== null && enabledPlugins !== undefined;
  const flowSchema = schemaBundle
    ? materializeFlowSchemaInventory({ schemaBundle, schemas, enabledPluginNames })
    : {
      detected: false,
      rootPublicUses: [],
      publicUseCatalog: [],
      missingUses: [],
      discoveryNotes: ['schemaBundle not provided'],
    };
  const collections = collectionsMeta
    ? materializeCollectionsInventory(collectionsMeta)
    : {
      detected: false,
      names: [],
      byName: {},
      discoveryNotes: ['collections inventory not provided'],
    };

  const instanceFingerprint = buildInstanceFingerprint({
    urlBase: apiBase,
    appVersion,
    enabledPluginNames: enabledPluginsDetected ? enabledPluginNames : [],
  });

  const inventory = {
    detected: flowSchema.detected || collections.detected,
    apiBase,
    adminBase,
    appVersion,
    enabledPlugins: enabledPluginNames,
    enabledPluginsDetected,
    instanceFingerprint,
    flowSchema,
    collections,
    notes: [],
    errors: [],
    cache: {
      hit: false,
      source: 'materialize',
    },
  };

  if (allowCache) {
    const store = createStableCacheStore({ stateDir });
    const ttlMs = enabledPluginsDetected
      ? DEFAULT_TTL_MS_BY_KIND.flowSchemaInventory
      : 10 * 60 * 1000;
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
  schemaBundle,
  schemas = null,
  collectionsMeta = null,
  appInfo = null,
  enabledPlugins = null,
  stateDir,
  allowCache = true,
} = {}) {
  return materializeInstanceInventory({
    candidatePageUrl,
    urlBase,
    schemaBundle,
    schemas,
    collectionsMeta,
    appInfo,
    enabledPlugins,
    stateDir,
    allowCache,
  });
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help') {
    console.log(usage());
    return;
  }

  if (command !== 'materialize' && command !== 'probe') {
    throw new Error(`Unsupported command: ${command}`);
  }

  const candidatePageUrl = normalizeRequiredText(flags['candidate-page-url'], '--candidate-page-url');
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
  const collectionsMeta = readJsonInput(
    flags['collections-meta-json'],
    flags['collections-meta-file'],
    'collections meta',
    { required: false },
  );
  const appInfo = readJsonInput(
    flags['app-info-json'],
    flags['app-info-file'],
    'app info',
    { required: false },
  );
  const enabledPlugins = readJsonInput(
    flags['enabled-plugins-json'],
    flags['enabled-plugins-file'],
    'enabled plugins',
    { required: false },
  );
  const stateDir = typeof flags['state-dir'] === 'string' ? flags['state-dir'] : undefined;
  const allowCache = flags['no-cache'] ? false : true;
  const outFile = typeof flags['out-file'] === 'string' ? flags['out-file'] : '';

  const result = await probeInstanceInventory({
    candidatePageUrl,
    schemaBundle,
    schemas,
    collectionsMeta,
    appInfo,
    enabledPlugins,
    stateDir,
    allowCache,
  });

  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(path.resolve(outFile), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ok: true, outFile: path.resolve(outFile) }, null, 2));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('instance_inventory_probe.mjs');
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
