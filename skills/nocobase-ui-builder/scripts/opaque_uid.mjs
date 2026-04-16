#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BUILDER_STATE_DIR, resolveSessionPaths } from './session_state.mjs';

export const REGISTRY_VERSION = 1;
export const DEFAULT_REGISTRY_PATH = path.join(
  DEFAULT_BUILDER_STATE_DIR,
  'pages.v1.json',
);

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ALPHANUM = `${LETTERS}0123456789`;
const LOGICAL_KEY_LENGTH = 16;
const OPAQUE_UID_LENGTH = 12;

function usage() {
  return [
    'Usage:',
    '  node scripts/opaque_uid.mjs reserve-page --title <title> [--session-id <id>] [--session-root <path>] [--registry-path <path>]',
    '  node scripts/opaque_uid.mjs rename-page --schemaUid <schemaUid> --title <title> [--session-id <id>] [--session-root <path>] [--registry-path <path>]',
    '  node scripts/opaque_uid.mjs resolve-page (--title <title> | --schemaUid <schemaUid>) [--session-id <id>] [--session-root <path>] [--registry-path <path>]',
    '  node scripts/opaque_uid.mjs reserve-group --title <title> --reservation-key <key> [--session-id <id>] [--session-root <path>] [--registry-path <path>]',
    '  node scripts/opaque_uid.mjs resolve-group (--reservation-key <key> | --schemaUid <schemaUid> | --title <title>) [--session-id <id>] [--session-root <path>] [--registry-path <path>]',
    '  node scripts/opaque_uid.mjs node-uids --page-schema-uid <schemaUid> --specs-json <jsonArray>',
  ].join('\n');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeNonEmpty(value, label) {
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
  return typeof value === 'string' ? value.trim() : '';
}

function resolveRegistryPath(explicitPath, options = {}) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_REGISTRY_PATH;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return resolveSessionPaths(options).registryPath;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJsonAtomic(filePath, value) {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function createEmptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    pages: [],
    groups: [],
  };
}

export function loadRegistry(registryPath, options = {}) {
  const resolvedRegistryPath = resolveRegistryPath(registryPath, options);
  if (!fs.existsSync(resolvedRegistryPath)) {
    return createEmptyRegistry();
  }

  const raw = fs.readFileSync(resolvedRegistryPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (parsed.version !== REGISTRY_VERSION) {
    throw new Error(
      `Unsupported registry version ${parsed.version}; expected ${REGISTRY_VERSION}`,
    );
  }
  if (!Array.isArray(parsed.pages)) {
    throw new Error('Registry is invalid: pages must be an array');
  }
  if (!Array.isArray(parsed.groups)) {
    parsed.groups = [];
  }

  return parsed;
}

export function saveRegistry(registryPath, registry) {
  writeJsonAtomic(registryPath, registry);
}

function hashBytes(seed) {
  return crypto.createHash('sha256').update(seed).digest();
}

function bytesToOpaque(bytes, length = OPAQUE_UID_LENGTH) {
  if (length < 2) {
    throw new Error('Opaque id length must be at least 2');
  }
  let output = LETTERS[bytes[0] % LETTERS.length];
  for (let index = 1; index < length; index += 1) {
    output += ALPHANUM[bytes[index % bytes.length] % ALPHANUM.length];
  }
  return output;
}

export function stableOpaqueId(namespace, seed, length = OPAQUE_UID_LENGTH) {
  const normalizedNamespace = normalizeNonEmpty(namespace, 'namespace');
  const normalizedSeed = normalizeNonEmpty(seed, 'seed');
  return bytesToOpaque(
    hashBytes(`nb-ui-builder:v1|${normalizedNamespace}|${normalizedSeed}`),
    length,
  );
}

function randomOpaqueString(length = LOGICAL_KEY_LENGTH) {
  return bytesToOpaque(crypto.randomBytes(Math.max(length, 32)), length);
}

function findPageBySchemaUid(registry, schemaUid) {
  return registry.pages.find((page) => page.schemaUid === schemaUid) ?? null;
}

function findGroupBySchemaUid(registry, schemaUid) {
  return registry.groups.find((group) => group.schemaUid === schemaUid) ?? null;
}

function findGroupByReservationKey(registry, reservationKey) {
  return registry.groups.find((group) => group.reservationKey === reservationKey) ?? null;
}

function findTitleMatches(registry, title) {
  return registry.pages.filter((page) => page.title === title || page.aliases.includes(title));
}

function ensureTitleAvailable(registry, title, exceptSchemaUid = null) {
  const conflict = registry.pages.find((page) => {
    if (page.schemaUid === exceptSchemaUid) {
      return false;
    }
    return page.title === title || page.aliases.includes(title);
  });
  if (conflict) {
    throw new Error(
      `Title "${title}" is already reserved by schemaUid "${conflict.schemaUid}"`,
    );
  }
}

function buildPageRecord(title, logicalKey, schemaUid) {
  const timestamp = nowIso();
  return {
    logicalKey,
    schemaUid,
    defaultTabSchemaUid: `tabs-${schemaUid}`,
    title,
    aliases: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildGroupRecord(title, logicalKey, schemaUid, reservationKey) {
  const timestamp = nowIso();
  return {
    logicalKey,
    reservationKey,
    schemaUid,
    title,
    aliases: [],
    routeId: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createPageSchemaUid(registry, logicalKey) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? logicalKey : `${logicalKey}|${attempt}`;
    const schemaUid = stableOpaqueId('page-schema', suffix);
    const existing = findPageBySchemaUid(registry, schemaUid);
    if (!existing || existing.logicalKey === logicalKey) {
      return schemaUid;
    }
  }
  throw new Error('Unable to allocate a unique page schemaUid');
}

function createGroupSchemaUid(registry, logicalKey) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? logicalKey : `${logicalKey}|${attempt}`;
    const schemaUid = stableOpaqueId('group-schema', suffix);
    const existing = findGroupBySchemaUid(registry, schemaUid);
    if (!existing || existing.logicalKey === logicalKey) {
      return schemaUid;
    }
  }
  throw new Error('Unable to allocate a unique group schemaUid');
}

export function reservePage({
  title,
  registryPath,
  sessionId,
  sessionRoot,
}) {
  const normalizedTitle = normalizeNonEmpty(title, 'title');
  const resolvedRegistryPath = resolveRegistryPath(registryPath, { sessionId, sessionRoot });
  const registry = loadRegistry(resolvedRegistryPath);
  const existing = registry.pages.find((page) => page.title === normalizedTitle) ?? null;
  if (existing) {
    return {
      created: false,
      registryPath: resolvedRegistryPath,
      page: existing,
    };
  }

  ensureTitleAvailable(registry, normalizedTitle);

  const logicalKey = randomOpaqueString();
  const schemaUid = createPageSchemaUid(registry, logicalKey);
  const page = buildPageRecord(normalizedTitle, logicalKey, schemaUid);
  registry.pages.push(page);
  saveRegistry(resolvedRegistryPath, registry);

  return {
    created: true,
    registryPath: resolvedRegistryPath,
    page,
  };
}

export function renamePage({
  schemaUid,
  title,
  registryPath,
  sessionId,
  sessionRoot,
}) {
  const normalizedSchemaUid = normalizeNonEmpty(schemaUid, 'schemaUid');
  const normalizedTitle = normalizeNonEmpty(title, 'title');
  const resolvedRegistryPath = resolveRegistryPath(registryPath, { sessionId, sessionRoot });
  const registry = loadRegistry(resolvedRegistryPath);
  const page = findPageBySchemaUid(registry, normalizedSchemaUid);
  if (!page) {
    throw new Error(`Page "${normalizedSchemaUid}" was not found in the local registry`);
  }
  if (page.title === normalizedTitle) {
    return {
      updated: false,
      registryPath,
      page,
    };
  }

  ensureTitleAvailable(registry, normalizedTitle, normalizedSchemaUid);

  const nextAliases = new Set(page.aliases);
  nextAliases.delete(normalizedTitle);
  nextAliases.add(page.title);

  page.title = normalizedTitle;
  page.aliases = [...nextAliases].sort();
  page.updatedAt = nowIso();

  saveRegistry(resolvedRegistryPath, registry);

  return {
    updated: true,
    registryPath: resolvedRegistryPath,
    page,
  };
}

export function resolvePage({
  title,
  schemaUid,
  registryPath,
  sessionId,
  sessionRoot,
}) {
  const resolvedRegistryPath = resolveRegistryPath(registryPath, { sessionId, sessionRoot });
  const registry = loadRegistry(resolvedRegistryPath);

  if (schemaUid) {
    const normalizedSchemaUid = normalizeNonEmpty(schemaUid, 'schemaUid');
    const page = findPageBySchemaUid(registry, normalizedSchemaUid);
    if (!page) {
      throw new Error(`Page "${normalizedSchemaUid}" was not found in the local registry`);
    }
    return {
      registryPath: resolvedRegistryPath,
      page,
    };
  }

  const normalizedTitle = normalizeNonEmpty(title, 'title');
  const matches = findTitleMatches(registry, normalizedTitle);
  if (matches.length === 0) {
    throw new Error(
      `Page title "${normalizedTitle}" was not found in the local registry; provide schemaUid explicitly if the registry was lost`,
    );
  }
  if (matches.length > 1) {
    throw new Error(`Page title "${normalizedTitle}" is ambiguous in the local registry`);
  }

  return {
    registryPath: resolvedRegistryPath,
    page: matches[0],
  };
}

export function reserveGroup({
  title,
  reservationKey,
  registryPath,
  sessionId,
  sessionRoot,
}) {
  const normalizedTitle = normalizeNonEmpty(title, 'title');
  const normalizedReservationKey = normalizeNonEmpty(reservationKey, 'reservationKey');
  const resolvedRegistryPath = resolveRegistryPath(registryPath, { sessionId, sessionRoot });
  const registry = loadRegistry(resolvedRegistryPath);
  const existing = findGroupByReservationKey(registry, normalizedReservationKey);

  if (existing) {
    if (existing.title !== normalizedTitle) {
      const aliases = new Set(Array.isArray(existing.aliases) ? existing.aliases : []);
      aliases.delete(normalizedTitle);
      aliases.add(existing.title);
      existing.title = normalizedTitle;
      existing.aliases = [...aliases].sort();
      existing.updatedAt = nowIso();
      saveRegistry(resolvedRegistryPath, registry);
    }
    return {
      created: false,
      registryPath: resolvedRegistryPath,
      group: existing,
    };
  }

  const logicalKey = normalizedReservationKey;
  const schemaUid = createGroupSchemaUid(registry, logicalKey);
  const group = buildGroupRecord(normalizedTitle, logicalKey, schemaUid, normalizedReservationKey);
  registry.groups.push(group);
  saveRegistry(resolvedRegistryPath, registry);

  return {
    created: true,
    registryPath: resolvedRegistryPath,
    group,
  };
}

export function resolveGroup({
  reservationKey,
  schemaUid,
  title,
  registryPath,
  sessionId,
  sessionRoot,
}) {
  const resolvedRegistryPath = resolveRegistryPath(registryPath, { sessionId, sessionRoot });
  const registry = loadRegistry(resolvedRegistryPath);

  if (reservationKey) {
    const normalizedReservationKey = normalizeNonEmpty(reservationKey, 'reservationKey');
    const group = findGroupByReservationKey(registry, normalizedReservationKey);
    if (!group) {
      throw new Error(`Group reservation "${normalizedReservationKey}" was not found in the local registry`);
    }
    return {
      registryPath: resolvedRegistryPath,
      group,
    };
  }

  if (schemaUid) {
    const normalizedSchemaUid = normalizeNonEmpty(schemaUid, 'schemaUid');
    const group = findGroupBySchemaUid(registry, normalizedSchemaUid);
    if (!group) {
      throw new Error(`Group "${normalizedSchemaUid}" was not found in the local registry`);
    }
    return {
      registryPath: resolvedRegistryPath,
      group,
    };
  }

  const normalizedTitle = normalizeNonEmpty(title, 'title');
  const matches = registry.groups.filter((group) => group.title === normalizedTitle || group.aliases.includes(normalizedTitle));
  if (matches.length === 0) {
    throw new Error(`Group title "${normalizedTitle}" was not found in the local registry`);
  }
  if (matches.length > 1) {
    throw new Error(`Group title "${normalizedTitle}" is ambiguous in the local registry`);
  }

  return {
    registryPath: resolvedRegistryPath,
    group: matches[0],
  };
}

export function recordGroupRoute({
  reservationKey,
  schemaUid,
  routeId,
  title,
  registryPath,
  sessionId,
  sessionRoot,
}) {
  const resolvedRegistryPath = resolveRegistryPath(registryPath, { sessionId, sessionRoot });
  const registry = loadRegistry(resolvedRegistryPath);
  const normalizedRouteId = normalizeNonEmpty(String(routeId), 'routeId');
  const group = reservationKey
    ? findGroupByReservationKey(registry, normalizeNonEmpty(reservationKey, 'reservationKey'))
    : findGroupBySchemaUid(registry, normalizeNonEmpty(schemaUid, 'schemaUid'));
  if (!group) {
    throw new Error('Group was not found in the local registry');
  }

  const normalizedTitle = normalizeOptionalText(title);
  if (normalizedTitle && group.title !== normalizedTitle) {
    const aliases = new Set(Array.isArray(group.aliases) ? group.aliases : []);
    aliases.delete(normalizedTitle);
    aliases.add(group.title);
    group.title = normalizedTitle;
    group.aliases = [...aliases].sort();
  }

  group.routeId = normalizedRouteId;
  group.updatedAt = nowIso();
  saveRegistry(resolvedRegistryPath, registry);

  return {
    registryPath: resolvedRegistryPath,
    group,
  };
}

export function nodeUid({
  pageSchemaUid,
  use,
  logicalPath,
}) {
  const normalizedPageSchemaUid = normalizeNonEmpty(pageSchemaUid, 'page schemaUid');
  const normalizedUse = normalizeNonEmpty(use, 'use');
  const normalizedPath = normalizeNonEmpty(logicalPath, 'logical path');
  return {
    uid: stableOpaqueId(
      'node',
      `${normalizedPageSchemaUid}|${normalizedUse}|${normalizedPath}`,
    ),
    pageSchemaUid: normalizedPageSchemaUid,
    use: normalizedUse,
    logicalPath: normalizedPath,
  };
}

function parseJsonFlag(value, label) {
  const normalizedValue = normalizeNonEmpty(value, label);
  try {
    return JSON.parse(normalizedValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

export function nodeUids({
  pageSchemaUid,
  specs,
}) {
  const normalizedPageSchemaUid = normalizeNonEmpty(pageSchemaUid, 'page schemaUid');
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error('specs must be a non-empty array');
  }

  const seenKeys = new Set();
  const items = specs.map((spec, index) => {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new Error(`specs[${index}] must be an object`);
    }

    const result = nodeUid({
      pageSchemaUid: normalizedPageSchemaUid,
      use: spec.use,
      logicalPath: spec.path ?? spec.logicalPath,
    });

    if (spec.key != null) {
      const key = normalizeNonEmpty(spec.key, `specs[${index}].key`);
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate specs key "${key}"`);
      }
      seenKeys.add(key);
      return {
        key,
        ...result,
      };
    }

    return result;
  });

  return {
    pageSchemaUid: normalizedPageSchemaUid,
    items,
  };
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
      throw new Error(`Unexpected argument "${token}"`);
    }
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for "--${key}"`);
    }
    flags[key] = value;
    index += 1;
  }
  return { command, flags };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const sessionOptions = {
    sessionId: flags['session-id'],
    sessionRoot: flags['session-root'],
  };
  const registryPath = resolveRegistryPath(flags['registry-path'], sessionOptions);
  let result;

  switch (command) {
    case 'reserve-page':
      result = reservePage({
        title: flags.title,
        registryPath,
        ...sessionOptions,
      });
      break;
    case 'rename-page':
      result = renamePage({
        schemaUid: flags.schemaUid,
        title: flags.title,
        registryPath,
        ...sessionOptions,
      });
      break;
    case 'resolve-page':
      result = resolvePage({
        title: flags.title,
        schemaUid: flags.schemaUid,
        registryPath,
        ...sessionOptions,
      });
      break;
    case 'reserve-group':
      result = reserveGroup({
        title: flags.title,
        reservationKey: flags['reservation-key'],
        registryPath,
        ...sessionOptions,
      });
      break;
    case 'resolve-group':
      result = resolveGroup({
        title: flags.title,
        reservationKey: flags['reservation-key'],
        schemaUid: flags.schemaUid,
        registryPath,
        ...sessionOptions,
      });
      break;
    case 'node-uids':
      result = nodeUids({
        pageSchemaUid: flags['page-schema-uid'],
        specs: parseJsonFlag(flags['specs-json'], 'specs-json'),
      });
      break;
    default:
      throw new Error(`Unknown command "${command}"`);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  });
}
