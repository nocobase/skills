import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCliArgs } from './cli-args.js';
import { prepareApplyBlueprintRequest, renderPageBlueprintAsciiPreview } from './page-blueprint-preview.js';
import { resolveMissingCollectionMetadataForBlueprint } from './collection-metadata-resolver.js';

function normalizeText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

async function readStreamText(stream) {
  let output = '';
  for await (const chunk of stream) {
    output += chunk.toString('utf8');
  }
  return output;
}

async function loadJsonFromStdin(stream) {
  if (!stream || stream.isTTY) throw new Error('Missing JSON stdin payload.');
  const raw = await readStreamText(stream);
  if (!raw.trim()) throw new Error('Missing JSON stdin payload.');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON stdin payload: ${error.message}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('JSON stdin payload must be one object.');
  }
  return payload;
}

async function loadJsonFromFile(cwd, filePath) {
  const resolved = path.resolve(cwd, filePath);
  return JSON.parse(await fs.readFile(resolved, 'utf8'));
}

function usage() {
  return {
    command:
      'Render one page blueprint ASCII preview or prepare one local applyBlueprint payload result that includes sendable cliBody. Required: --stdin-json or --input <path>. Optional: --prepare-write --no-auto-collection-metadata --expected-outer-tabs <n> --max-popup-depth <n>.',
  };
}

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())));
}

function parseOptionalNumber(value, label) {
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} "${value}".`);
  return parsed;
}

function parseOptionalInteger(value, label) {
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label} "${value}".`);
  return parsed;
}

function isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractPrepareBlueprint(payload) {
  if (!isObjectRecord(payload)) return payload;
  if (isObjectRecord(payload.blueprint)) return payload.blueprint;
  if (isObjectRecord(payload.requestBody)) return payload.requestBody;
  return payload;
}

function extractPrepareCollectionMetadata(payload) {
  return isObjectRecord(payload) && Object.prototype.hasOwnProperty.call(payload, 'collectionMetadata')
    ? payload.collectionMetadata
    : undefined;
}

function withResolvedCollectionMetadata(payload, metadata) {
  if (!isObjectRecord(payload)) return payload;
  if (Object.prototype.hasOwnProperty.call(payload, 'blueprint') || Object.prototype.hasOwnProperty.call(payload, 'requestBody')) {
    return {
      ...payload,
      collectionMetadata: metadata,
    };
  }
  return {
    blueprint: payload,
    collectionMetadata: metadata,
  };
}

function hasInvalidCollectionMetadataError(errors) {
  return Array.isArray(errors) && errors.some((issue) => issue?.ruleId === 'invalid-collection-metadata');
}

function hasResolvedCollectionMetadata(metadata) {
  return isObjectRecord(metadata?.collections) && Object.keys(metadata.collections).length > 0;
}

function createAutoCollectionMetadataMissingError(resolution) {
  const missingCollections = Array.isArray(resolution?.missingCollections) ? resolution.missingCollections.filter(Boolean) : [];
  const suffix = missingCollections.length > 0 ? ` Missing collections: ${missingCollections.join(', ')}.` : '';
  return {
    path: 'collectionMetadata',
    ruleId: 'missing-collection-metadata',
    message: `collectionMetadata is required for prepare-write when automatic collection metadata resolution cannot complete.${suffix}`,
  };
}

function parseCurrentNbEnvBaseUrl(output) {
  const currentLine = normalizeText(output)
    ? String(output).split(/\r?\n/).find((line) => /^\s*\*(?:\s|$)/.test(line))
    : '';
  if (!currentLine) return '';
  const match = currentLine.match(/https?:\/\/[^\s|]+/i);
  return normalizeText(match?.[0]);
}

async function execNbText(args, options = {}) {
  const { execFileImpl, cwd = process.cwd() } = options;
  if (!execFileImpl) {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const result = await execFileAsync('nb', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout || '';
  }
  const result = await execFileImpl('nb', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return typeof result === 'string' ? result : result?.stdout || '';
}

async function execNbJson(args, options = {}) {
  const stdout = await execNbText(args, options);
  return JSON.parse(stdout || '{}');
}

function getPrepareNavigationGroupTitle(payload) {
  const blueprint = extractPrepareBlueprint(payload);
  const group = isObjectRecord(blueprint?.navigation?.group) ? blueprint.navigation.group : null;
  if (!group || normalizeText(group.routeId) || !normalizeText(group.title)) return '';
  return normalizeText(group.title);
}

function groupHasMetadataFields(group) {
  return ['icon', 'tooltip', 'hideInMenu'].some((key) => Object.prototype.hasOwnProperty.call(group, key));
}

function withResolvedNavigationGroup(payload, routeId) {
  if (!isObjectRecord(payload)) return payload;
  const wrappedKey = isObjectRecord(payload.blueprint) ? 'blueprint' : isObjectRecord(payload.requestBody) ? 'requestBody' : '';
  const blueprint = wrappedKey ? payload[wrappedKey] : payload;
  if (!isObjectRecord(blueprint)) return payload;
  const nextBlueprint = {
    ...blueprint,
    navigation: {
      ...(blueprint.navigation || {}),
      group: { routeId },
    },
  };
  return wrappedKey ? { ...payload, [wrappedKey]: nextBlueprint } : nextBlueprint;
}

function extractDesktopRouteRows(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function resolvePrepareNavigationGroup(payload, options = {}) {
  if (options.autoNavigationGroup === false) {
    return { payload, resolverErrors: [] };
  }
  const groupTitle = getPrepareNavigationGroupTitle(payload);
  if (!groupTitle) {
    return { payload, resolverErrors: [] };
  }
  const blueprint = extractPrepareBlueprint(payload);
  const group = blueprint.navigation.group;
  let baseUrl = '';
  try {
    baseUrl = parseCurrentNbEnvBaseUrl(await execNbText(['env', 'list'], options));
  } catch {
    return { payload, resolverErrors: [] };
  }
  if (!baseUrl) {
    return { payload, resolverErrors: [] };
  }

  let rows = [];
  try {
    const response = await execNbJson([
      'api',
      'resource',
      'list',
      '--resource',
      'desktopRoutes',
      '--filter',
      JSON.stringify({ title: groupTitle, type: 'group' }),
      '--base-url',
      baseUrl,
      '-j',
    ], options);
    rows = extractDesktopRouteRows(response).filter((row) => normalizeText(row?.title) === groupTitle && normalizeText(row?.type) === 'group');
  } catch {
    return { payload, resolverErrors: [] };
  }

  if (rows.length === 0) {
    return { payload, resolverErrors: [] };
  }
  if (rows.length > 1) {
    return {
      payload,
      resolverErrors: [
        {
          path: 'navigation.group.routeId',
          ruleId: 'navigation-group-title-ambiguous',
          message: `navigation.group.title "${groupTitle}" matches ${rows.length} existing menu groups; pass navigation.group.routeId explicitly before applyBlueprint.`,
        },
      ],
    };
  }
  const routeId = rows[0]?.id;
  if (!normalizeText(routeId)) {
    return {
      payload,
      resolverErrors: [
        {
          path: 'navigation.group.routeId',
          ruleId: 'navigation-group-route-id-missing',
          message: `Existing navigation group "${groupTitle}" is missing route id; pass navigation.group.routeId explicitly before applyBlueprint.`,
        },
      ],
    };
  }
  return {
    payload: withResolvedNavigationGroup(payload, routeId),
    resolverErrors: [],
    warnings: groupHasMetadataFields(group)
      ? [`Resolved existing menu group "${groupTitle}" to routeId ${routeId}; title/icon metadata was removed because same-title reuse is title-only.`]
      : [`Resolved existing menu group "${groupTitle}" to routeId ${routeId}.`],
  };
}

async function resolvePrepareWritePayload(payload, options = {}) {
  if (options.autoCollectionMetadata === false) {
    return {
      payload,
      resolverErrors: [],
    };
  }

  const resolution = await resolveMissingCollectionMetadataForBlueprint(
    extractPrepareBlueprint(payload),
    extractPrepareCollectionMetadata(payload),
    options,
  );
  if (!resolution.ok && !hasInvalidCollectionMetadataError(resolution.errors)) {
    return {
      payload: withResolvedCollectionMetadata(payload, resolution.metadata),
      resolverErrors: hasResolvedCollectionMetadata(resolution.metadata)
        ? [createAutoCollectionMetadataMissingError(resolution)]
        : [],
    };
  }
  return {
    payload: withResolvedCollectionMetadata(payload, resolution.metadata),
    resolverErrors: resolution.errors || [],
  };
}

export async function runPagePreviewCli(argv, io = {}) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const stdin = io.stdin || process.stdin;

  try {
    const args = parseCliArgs(argv, {
      valueFlags: ['input', 'expected-outer-tabs', 'max-popup-depth'],
      booleanFlags: ['help', 'stdin-json', 'prepare-write', 'no-auto-collection-metadata'],
    });
    if (args.help) {
      writeJson(stdout, { ok: true, usage: usage() });
      return 0;
    }

    const payload = args['stdin-json']
      ? await loadJsonFromStdin(stdin)
      : args.input
        ? await loadJsonFromFile(cwd, args.input)
        : (() => {
            throw new Error('Missing required --stdin-json or --input.');
          })();

    const maxPopupDepth = parseOptionalNumber(args['max-popup-depth'], '--max-popup-depth');
    const expectedOuterTabs = parseOptionalInteger(args['expected-outer-tabs'], '--expected-outer-tabs');
    const collectionPreparePayload = args['prepare-write']
      ? await resolvePrepareWritePayload(payload, {
          autoCollectionMetadata: !args['no-auto-collection-metadata'],
          cwd,
          ...(io.execFileImpl ? { execFileImpl: io.execFileImpl } : {}),
          ...(io.fetchCollectionMetadata ? { fetchCollectionMetadata: io.fetchCollectionMetadata } : {}),
        })
      : { payload, resolverErrors: [] };
    const navigationPreparePayload = args['prepare-write']
      ? await resolvePrepareNavigationGroup(collectionPreparePayload.payload, {
          cwd,
          ...(io.execFileImpl ? { execFileImpl: io.execFileImpl } : {}),
        })
      : { payload: collectionPreparePayload.payload, resolverErrors: [], warnings: [] };
    const result = args['prepare-write']
      ? prepareApplyBlueprintRequest(navigationPreparePayload.payload, {
          maxPopupDepth,
          expectedOuterTabs,
        })
      : renderPageBlueprintAsciiPreview(payload, {
          maxPopupDepth,
        });
    const resolverErrors = [
      ...(collectionPreparePayload.resolverErrors || []),
      ...(navigationPreparePayload.resolverErrors || []),
    ];
    if (navigationPreparePayload.warnings?.length) {
      result.warnings = uniqueStrings([...(Array.isArray(result.warnings) ? result.warnings : []), ...navigationPreparePayload.warnings]);
    }
    if (resolverErrors.length > 0) {
      result.errors = [...resolverErrors, ...(Array.isArray(result.errors) ? result.errors : [])];
      result.ok = false;
      delete result.cliBody;
    }

    writeJson(stdout, result);
    return result.ok ? 0 : 1;
  } catch (error) {
    writeJson(stderr, {
      ok: false,
      error: error?.message || String(error),
      usage: usage(),
    });
    return 2;
  }
}
