#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeNonEmpty,
  readJsonFile,
  removeFileIfExists,
  resolveStableCacheDir,
  sha256,
  sortUniqueStrings,
  writeJsonAtomic,
} from './runtime_state.mjs';

export const STABLE_CACHE_SCHEMA_VERSION = 'v1';
export const STABLE_CACHE_KINDS = new Set([
  'schemaBundle',
  'schemas',
  'collectionFields',
  'relationMetadata',
  'flowSchemaInventory',
]);

export const DEFAULT_TTL_MS_BY_KIND = {
  schemaBundle: 24 * 60 * 60 * 1000,
  schemas: 24 * 60 * 60 * 1000,
  collectionFields: 10 * 60 * 1000,
  relationMetadata: 10 * 60 * 1000,
  flowSchemaInventory: 24 * 60 * 60 * 1000,
};

const MEMORY_CACHE = globalThis.__NOCOBASE_UI_STABLE_CACHE__
  || new Map();
globalThis.__NOCOBASE_UI_STABLE_CACHE__ = MEMORY_CACHE;

function usage() {
  return [
    'Usage:',
    '  node scripts/stable_cache.mjs fingerprint --url-base <url> [--app-version <version>] [--plugins-json <jsonArray>]',
    '  node scripts/stable_cache.mjs get --kind <kind> --instance-fingerprint <fingerprint> --identity <identity> [--state-dir <dir>] [--schema-version <version>] [--summary-only] [--value-file-out <path>]',
    '  node scripts/stable_cache.mjs set --kind <kind> --instance-fingerprint <fingerprint> --identity <identity> (--value-json <json> | --value-file <path>) [--state-dir <dir>] [--schema-version <version>] [--ttl-ms <number>] [--metadata-json <json>] [--summary-only]',
    '  node scripts/stable_cache.mjs invalidate --kind <kind> --instance-fingerprint <fingerprint> [--identity <identity>] [--identity-prefix <prefix>] [--state-dir <dir>] [--schema-version <version>]',
    '  node scripts/stable_cache.mjs invalidate-collections --instance-fingerprint <fingerprint> --collections-json <jsonArray> [--state-dir <dir>]',
  ].join('\n');
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

function parseJson(rawValue, label) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function readJsonInput(jsonValue, filePath, label) {
  if (jsonValue) {
    return parseJson(jsonValue, label);
  }
  if (filePath) {
    return parseJson(fs.readFileSync(path.resolve(filePath), 'utf8'), `${label} file`);
  }
  throw new Error(`${label} input is required`);
}

function normalizeKind(kind) {
  const normalized = normalizeNonEmpty(kind, 'kind');
  if (!STABLE_CACHE_KINDS.has(normalized)) {
    throw new Error(`Unsupported cache kind "${normalized}"`);
  }
  return normalized;
}

function normalizeSchemaVersion(schemaVersion) {
  return schemaVersion ? normalizeNonEmpty(schemaVersion, 'schema version') : STABLE_CACHE_SCHEMA_VERSION;
}

function normalizeIdentity(identity) {
  return normalizeNonEmpty(identity, 'identity');
}

function nowIso(now = () => Date.now()) {
  return new Date(now()).toISOString();
}

function memoryCacheKeyToString(cacheDir, key) {
  return JSON.stringify({
    cacheDir: path.resolve(cacheDir),
    ...key,
  });
}

function summarizeValue(value) {
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
    };
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    return {
      type: 'object',
      keyCount: keys.length,
      keys: keys.slice(0, 20),
    };
  }
  if (value === null) {
    return {
      type: 'null',
      value: null,
    };
  }
  return {
    type: typeof value,
    value,
  };
}

function summarizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }
  const summary = { ...entry };
  if (Object.prototype.hasOwnProperty.call(summary, 'value')) {
    summary.valueSummary = summarizeValue(summary.value);
    delete summary.value;
  }
  return summary;
}

function buildSummaryOnlyResponse(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }
  const summary = { ...result };
  if (Object.prototype.hasOwnProperty.call(summary, 'entry')) {
    summary.entry = summarizeEntry(summary.entry);
  }
  if (Object.prototype.hasOwnProperty.call(summary, 'value')) {
    summary.valueSummary = summarizeValue(summary.value);
    delete summary.value;
  }
  return summary;
}

function writeValueFileIfNeeded(filePath, value) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return undefined;
  }
  const resolvedPath = path.resolve(filePath.trim());
  writeJsonAtomic(resolvedPath, value);
  return resolvedPath;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export function buildInstanceFingerprint({
  urlBase,
  appVersion,
  enabledPluginNames,
}) {
  return sha256(JSON.stringify({
    urlBase: normalizeNonEmpty(urlBase, 'url base').replace(/\/+$/g, ''),
    appVersion: typeof appVersion === 'string' ? appVersion.trim() : '',
    enabledPluginNames: sortUniqueStrings(enabledPluginNames),
  }));
}

export function buildStableCacheKey({
  kind,
  instanceFingerprint,
  identity,
  schemaVersion,
}) {
  return {
    kind: normalizeKind(kind),
    instanceFingerprint: normalizeNonEmpty(instanceFingerprint, 'instance fingerprint'),
    identity: normalizeIdentity(identity),
    schemaVersion: normalizeSchemaVersion(schemaVersion),
  };
}

function buildExactFilePath(cacheDir, key) {
  return path.join(
    cacheDir,
    key.kind,
    key.instanceFingerprint,
    `${key.schemaVersion}-${sha256(key.identity)}.json`,
  );
}

function isExpired(entry, now = () => Date.now()) {
  return Number.isFinite(entry?.expiresAtMs) && entry.expiresAtMs <= now();
}

function readEntryFromDisk(filePath) {
  return readJsonFile(filePath, null);
}

function listCacheEntryFiles(cacheDir, kind, instanceFingerprint) {
  const targetDir = path.join(cacheDir, kind, instanceFingerprint);
  if (!fs.existsSync(targetDir)) {
    return [];
  }
  return fs.readdirSync(targetDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => path.join(targetDir, fileName));
}

function emitEvent(onEvent, event) {
  if (typeof onEvent === 'function') {
    onEvent(event);
  }
}

export function createStableCacheStore({
  stateDir,
  now = () => Date.now(),
  onEvent,
} = {}) {
  const cacheDir = resolveStableCacheDir(stateDir);

  function getFromMemory(key) {
    const memoryKey = memoryCacheKeyToString(cacheDir, key);
    const memoryEntry = MEMORY_CACHE.get(memoryKey);
    if (!memoryEntry) {
      return null;
    }
    if (isExpired(memoryEntry, now)) {
      MEMORY_CACHE.delete(memoryKey);
      return null;
    }
    return memoryEntry;
  }

  function get(params) {
    const key = buildStableCacheKey(params);
    const memoryEntry = getFromMemory(key);
    if (memoryEntry) {
      emitEvent(onEvent, {
        action: 'cache_hit',
        kind: key.kind,
        identity: key.identity,
        source: 'memory',
      });
      return {
        hit: true,
        source: 'memory',
        entry: memoryEntry,
        value: memoryEntry.value,
      };
    }

    const filePath = buildExactFilePath(cacheDir, key);
    const diskEntry = readEntryFromDisk(filePath);
    if (!diskEntry) {
      emitEvent(onEvent, {
        action: 'cache_miss',
        kind: key.kind,
        identity: key.identity,
        source: 'none',
      });
      return {
        hit: false,
        source: 'miss',
        entry: null,
        value: null,
      };
    }
    if (isExpired(diskEntry, now)) {
      removeFileIfExists(filePath);
      emitEvent(onEvent, {
        action: 'cache_miss',
        kind: key.kind,
        identity: key.identity,
        source: 'expired',
      });
      return {
        hit: false,
        source: 'expired',
        entry: null,
        value: null,
      };
    }

    MEMORY_CACHE.set(memoryCacheKeyToString(cacheDir, key), diskEntry);
    emitEvent(onEvent, {
      action: 'cache_hit',
      kind: key.kind,
      identity: key.identity,
      source: 'disk',
    });
    return {
      hit: true,
      source: 'disk',
      entry: diskEntry,
      value: diskEntry.value,
    };
  }

  function set({
    kind,
    instanceFingerprint,
    identity,
    schemaVersion,
    ttlMs,
    value,
    metadata,
  }) {
    const key = buildStableCacheKey({
      kind,
      instanceFingerprint,
      identity,
      schemaVersion,
    });
    const effectiveTtlMs = Number.isFinite(ttlMs) ? ttlMs : DEFAULT_TTL_MS_BY_KIND[key.kind];
    const createdAtMs = now();
    const entry = {
      version: key.schemaVersion,
      kind: key.kind,
      instanceFingerprint: key.instanceFingerprint,
      identity: key.identity,
      createdAt: new Date(createdAtMs).toISOString(),
      createdAtMs,
      expiresAtMs: createdAtMs + effectiveTtlMs,
      ttlMs: effectiveTtlMs,
      valueDigest: sha256(JSON.stringify(value)),
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
      value,
    };
    const filePath = buildExactFilePath(cacheDir, key);
    writeJsonAtomic(filePath, entry);
    MEMORY_CACHE.set(memoryCacheKeyToString(cacheDir, key), entry);
    emitEvent(onEvent, {
      action: 'cache_store',
      kind: key.kind,
      identity: key.identity,
      source: 'disk',
      ttlMs: effectiveTtlMs,
    });
    return {
      ok: true,
      filePath,
      entry,
    };
  }

  function invalidate({
    kind,
    instanceFingerprint,
    identity,
    identityPrefix,
    schemaVersion,
  }) {
    const normalizedKind = normalizeKind(kind);
    const normalizedInstanceFingerprint = normalizeNonEmpty(instanceFingerprint, 'instance fingerprint');
    const normalizedSchemaVersion = normalizeSchemaVersion(schemaVersion);
    const normalizedIdentity = identity ? normalizeIdentity(identity) : null;
    const normalizedIdentityPrefix = identityPrefix ? normalizeNonEmpty(identityPrefix, 'identity prefix') : null;

    if (!normalizedIdentity && !normalizedIdentityPrefix) {
      throw new Error('invalidate requires --identity or --identity-prefix');
    }

    let removed = 0;
    if (normalizedIdentity) {
      const key = buildStableCacheKey({
        kind: normalizedKind,
        instanceFingerprint: normalizedInstanceFingerprint,
        identity: normalizedIdentity,
        schemaVersion: normalizedSchemaVersion,
      });
      removeFileIfExists(buildExactFilePath(cacheDir, key));
      MEMORY_CACHE.delete(memoryCacheKeyToString(cacheDir, key));
      removed += 1;
    } else {
      for (const filePath of listCacheEntryFiles(cacheDir, normalizedKind, normalizedInstanceFingerprint)) {
        const entry = readEntryFromDisk(filePath);
        if (!entry || typeof entry.identity !== 'string') {
          continue;
        }
        if (!entry.identity.startsWith(normalizedIdentityPrefix)) {
          continue;
        }
        const key = buildStableCacheKey({
          kind: normalizedKind,
          instanceFingerprint: normalizedInstanceFingerprint,
          identity: entry.identity,
          schemaVersion: entry.version,
        });
        removeFileIfExists(filePath);
        MEMORY_CACHE.delete(memoryCacheKeyToString(cacheDir, key));
        removed += 1;
      }
    }

    emitEvent(onEvent, {
      action: 'cache_invalidate',
      kind: normalizedKind,
      identity: normalizedIdentity ?? normalizedIdentityPrefix,
      source: 'disk',
      removed,
    });
    return {
      ok: true,
      removed,
    };
  }

  function invalidateCollectionMetadata({
    instanceFingerprint,
    collectionNames,
  }) {
    const normalizedCollections = sortUniqueStrings(collectionNames);
    let removed = 0;
    for (const collectionName of normalizedCollections) {
      removed += invalidate({
        kind: 'collectionFields',
        instanceFingerprint,
        identityPrefix: `${collectionName}::`,
      }).removed;
      removed += invalidate({
        kind: 'relationMetadata',
        instanceFingerprint,
        identityPrefix: `${collectionName}::`,
      }).removed;
    }
    return {
      ok: true,
      removed,
      collections: normalizedCollections,
    };
  }

  return {
    cacheDir,
    get,
    set,
    invalidate,
    invalidateCollectionMetadata,
  };
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    console.log(usage());
    return;
  }

  if (command === 'fingerprint') {
    if (typeof flags['url-base'] !== 'string') {
      throw new Error('--url-base is required');
    }
    const value = buildInstanceFingerprint({
      urlBase: flags['url-base'],
      appVersion: typeof flags['app-version'] === 'string' ? flags['app-version'] : '',
      enabledPluginNames: flags['plugins-json']
        ? parseJson(flags['plugins-json'], 'plugins-json')
        : [],
    });
    printJson({ instanceFingerprint: value });
    return;
  }

  const store = createStableCacheStore({
    stateDir: typeof flags['state-dir'] === 'string' ? flags['state-dir'] : undefined,
  });

  if (command === 'get') {
    if (typeof flags.kind !== 'string' || typeof flags['instance-fingerprint'] !== 'string' || typeof flags.identity !== 'string') {
      throw new Error('--kind, --instance-fingerprint and --identity are required');
    }
    const result = store.get({
      kind: flags.kind,
      instanceFingerprint: flags['instance-fingerprint'],
      identity: flags.identity,
      schemaVersion: typeof flags['schema-version'] === 'string' ? flags['schema-version'] : undefined,
    });
    const valueFile = result.hit
      ? writeValueFileIfNeeded(flags['value-file-out'], result.value)
      : undefined;
    const payload = flags['summary-only']
      ? buildSummaryOnlyResponse(result)
      : result;
    if (valueFile) {
      payload.valueFile = valueFile;
    }
    printJson(payload);
    return;
  }

  if (command === 'set') {
    if (typeof flags.kind !== 'string' || typeof flags['instance-fingerprint'] !== 'string' || typeof flags.identity !== 'string') {
      throw new Error('--kind, --instance-fingerprint and --identity are required');
    }
    const result = store.set({
      kind: flags.kind,
      instanceFingerprint: flags['instance-fingerprint'],
      identity: flags.identity,
      schemaVersion: typeof flags['schema-version'] === 'string' ? flags['schema-version'] : undefined,
      ttlMs: typeof flags['ttl-ms'] === 'string' ? Number.parseInt(flags['ttl-ms'], 10) : undefined,
      value: readJsonInput(flags['value-json'], flags['value-file'], 'value'),
      metadata: flags['metadata-json'] ? parseJson(flags['metadata-json'], 'metadata-json') : undefined,
    });
    printJson(flags['summary-only'] ? buildSummaryOnlyResponse(result) : result);
    return;
  }

  if (command === 'invalidate') {
    if (typeof flags.kind !== 'string' || typeof flags['instance-fingerprint'] !== 'string') {
      throw new Error('--kind and --instance-fingerprint are required');
    }
    printJson(store.invalidate({
      kind: flags.kind,
      instanceFingerprint: flags['instance-fingerprint'],
      identity: typeof flags.identity === 'string' ? flags.identity : undefined,
      identityPrefix: typeof flags['identity-prefix'] === 'string' ? flags['identity-prefix'] : undefined,
      schemaVersion: typeof flags['schema-version'] === 'string' ? flags['schema-version'] : undefined,
    }));
    return;
  }

  if (command === 'invalidate-collections') {
    if (typeof flags['instance-fingerprint'] !== 'string' || typeof flags['collections-json'] !== 'string') {
      throw new Error('--instance-fingerprint and --collections-json are required');
    }
    printJson(store.invalidateCollectionMetadata({
      instanceFingerprint: flags['instance-fingerprint'],
      collectionNames: parseJson(flags['collections-json'], 'collections-json'),
    }));
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
