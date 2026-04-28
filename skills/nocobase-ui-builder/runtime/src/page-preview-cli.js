import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCliArgs } from './cli-args.js';
import { prepareApplyBlueprintRequest, renderPageBlueprintAsciiPreview } from './page-blueprint-preview.js';
import { resolveMissingCollectionMetadataForBlueprint } from './collection-metadata-resolver.js';

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

function withoutPrepareCollectionMetadata(payload) {
  if (!isObjectRecord(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'blueprint') && !Object.prototype.hasOwnProperty.call(payload, 'requestBody')) {
    return payload;
  }
  const { collectionMetadata, ...nextPayload } = payload;
  return nextPayload;
}

function hasInvalidCollectionMetadataError(errors) {
  return Array.isArray(errors) && errors.some((issue) => issue?.ruleId === 'invalid-collection-metadata');
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
      payload: withoutPrepareCollectionMetadata(payload),
      resolverErrors: [],
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
    const preparePayload = args['prepare-write']
      ? await resolvePrepareWritePayload(payload, {
          autoCollectionMetadata: !args['no-auto-collection-metadata'],
          cwd,
          ...(io.execFileImpl ? { execFileImpl: io.execFileImpl } : {}),
          ...(io.fetchCollectionMetadata ? { fetchCollectionMetadata: io.fetchCollectionMetadata } : {}),
        })
      : { payload, resolverErrors: [] };
    const result = args['prepare-write']
      ? prepareApplyBlueprintRequest(preparePayload.payload, {
          maxPopupDepth,
          expectedOuterTabs,
        })
      : renderPageBlueprintAsciiPreview(payload, {
          maxPopupDepth,
        });
    if (preparePayload.resolverErrors.length > 0) {
      result.errors = [...preparePayload.resolverErrors, ...(Array.isArray(result.errors) ? result.errors : [])];
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
