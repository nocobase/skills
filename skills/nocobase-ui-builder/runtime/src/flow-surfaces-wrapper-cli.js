import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runLocalizedWritePreflight } from './localized-write-preflight.js';
import { prepareApplyBlueprintWrite } from './apply-blueprint-prepare.js';
import { getFlowSurfacesCommandPolicy } from './flow-surfaces-command-policy.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

function usage() {
  return {
    command:
      'Run flow-surfaces commands through the UI Builder wrapper. Agent-facing writes should use this entry instead of calling `nb api flow-surfaces` directly.',
    examples: [
      'node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs apply-blueprint --body-file blueprint.json -j',
      'node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs add-block --body-file body.json --collection-metadata metadata.json -j',
      'node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs get --page-schema-uid page-uid -j',
    ],
  };
}

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeText(stream, text) {
  if (typeof text === 'string' && text) {
    stream.write(text);
    if (!text.endsWith('\n')) stream.write('\n');
  }
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function findFlag(args, flagName) {
  const flag = `--${flagName}`;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === flag) {
      const next = args[index + 1];
      if (!normalizeText(next) || String(next).startsWith('--')) {
        throw new Error(`Missing value for ${flag}.`);
      }
      return { index, value: next, consumesNext: true };
    }
    if (typeof token === 'string' && token.startsWith(`${flag}=`)) {
      const value = token.slice(flag.length + 1);
      if (!normalizeText(value)) {
        throw new Error(`Missing value for ${flag}.`);
      }
      return { index, value, consumesNext: false };
    }
  }
  return null;
}

function getFlagValue(args, flagName) {
  const match = findFlag(args, flagName);
  if (match) {
    return match.value;
  }
  return undefined;
}

function getFlagIndexesToRemove(args, flagName) {
  const flag = `--${flagName}`;
  const indexes = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === flag) {
      const next = args[index + 1];
      if (!normalizeText(next) || String(next).startsWith('--')) {
        throw new Error(`Missing value for ${flag}.`);
      }
      indexes.add(index);
      indexes.add(index + 1);
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith(`${flag}=`)) {
      const value = token.slice(flag.length + 1);
      if (!normalizeText(value)) {
        throw new Error(`Missing value for ${flag}.`);
      }
      indexes.add(index);
    }
  }
  return indexes;
}

function removeFlagWithValue(args, flagName) {
  const indexes = getFlagIndexesToRemove(args, flagName);
  if (indexes.size === 0) return [...args];
  return args.filter((_, index) => !indexes.has(index));
}

function hasFlag(args, flagName) {
  const flag = `--${flagName}`;
  return args.some((value) => value === flag || (typeof value === 'string' && value.startsWith(`${flag}=`)));
}

function removeBooleanFlag(args, flagName) {
  const flag = `--${flagName}`;
  return args.filter((value) => value !== flag && !(typeof value === 'string' && value.startsWith(`${flag}=`)));
}

function replaceBodyArg(args, body) {
  let nextArgs = removeFlagWithValue(args, 'body-file');
  nextArgs = removeFlagWithValue(nextArgs, 'body');
  return [...nextArgs, '--body', JSON.stringify(body)];
}

async function loadJsonFile(cwd, filePath) {
  return JSON.parse(await fs.readFile(path.resolve(cwd, filePath), 'utf8'));
}

function parseInlineJson(jsonText, flagName) {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid JSON for --${flagName}: ${error.message}`);
  }
}

function parseOptionalNumberFlag(args, flagName) {
  const value = getFlagValue(args, flagName);
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid --${flagName} "${value}".`);
  }
  return parsed;
}

function parseOptionalPositiveIntegerFlag(args, flagName) {
  const value = getFlagValue(args, flagName);
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${flagName} "${value}".`);
  }
  return parsed;
}

async function loadBodyFromArgs(args, cwd) {
  const inlineBody = getFlagValue(args, 'body');
  if (normalizeText(inlineBody)) {
    return parseInlineJson(inlineBody, 'body');
  }
  const bodyFile = getFlagValue(args, 'body-file');
  if (normalizeText(bodyFile)) {
    return loadJsonFile(cwd, bodyFile);
  }
  throw new Error('Missing required --body or --body-file for this command.');
}

async function loadOptionalCollectionMetadataFromArgs(args, cwd) {
  const metadataFile = getFlagValue(args, 'collection-metadata');
  if (!normalizeText(metadataFile)) return undefined;
  return loadJsonFile(cwd, metadataFile);
}

function buildApplyBlueprintPreparePayload(body, collectionMetadata) {
  if (isObjectRecord(body) && (isObjectRecord(body.blueprint) || isObjectRecord(body.requestBody))) {
    if (typeof collectionMetadata === 'undefined') {
      return body;
    }
    return {
      ...body,
      collectionMetadata,
    };
  }
  if (typeof collectionMetadata === 'undefined') {
    return body;
  }
  return {
    blueprint: body,
    collectionMetadata,
  };
}

function buildLocalizedPreflightPayload(body, collectionMetadata) {
  if (isObjectRecord(body) && Object.prototype.hasOwnProperty.call(body, 'body')) {
    if (typeof collectionMetadata === 'undefined') {
      return {
        body: body.body,
        collectionMetadata: body.collectionMetadata,
      };
    }
    return {
      ...body,
      collectionMetadata,
    };
  }
  return {
    body,
    collectionMetadata,
  };
}

function normalizeExecResult(result) {
  if (typeof result === 'string') {
    return { stdout: result, stderr: '', exitCode: 0 };
  }
  return {
    stdout: result?.stdout || '',
    stderr: result?.stderr || '',
    exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : (Number.isInteger(result?.code) ? result.code : 0),
  };
}

async function execNb(args, options = {}) {
  const { cwd = process.cwd(), execFileImpl } = options;
  if (execFileImpl) {
    return normalizeExecResult(await execFileImpl('nb', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    }));
  }
  try {
    const result = await execFileAsync('nb', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: 0,
    };
  } catch (error) {
    return {
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
      exitCode: Number.isInteger(error?.code) ? error.code : 1,
    };
  }
}

async function runPreparedFlowSurfacesWrite(subcommand, args, io) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const policy = getFlowSurfacesCommandPolicy(subcommand);

  if (policy === 'whole_page_prepare') {
    const body = await loadBodyFromArgs(args, cwd);
    const collectionMetadata = await loadOptionalCollectionMetadataFromArgs(args, cwd);
    const prepareResult = await prepareApplyBlueprintWrite(
      buildApplyBlueprintPreparePayload(body, collectionMetadata),
      {
        cwd,
        autoCollectionMetadata: !hasFlag(args, 'no-auto-collection-metadata'),
        expectedOuterTabs: parseOptionalPositiveIntegerFlag(args, 'expected-outer-tabs'),
        maxPopupDepth: parseOptionalNumberFlag(args, 'max-popup-depth'),
        ...(io.execFileImpl ? { execFileImpl: io.execFileImpl } : {}),
        ...(io.fetchCollectionMetadata ? { fetchCollectionMetadata: io.fetchCollectionMetadata } : {}),
      },
    );
    if (!prepareResult.ok) {
      writeJson(stdout, prepareResult);
      return 1;
    }
    let nextArgs = replaceBodyArg(args, prepareResult.cliBody);
    nextArgs = removeFlagWithValue(nextArgs, 'collection-metadata');
    nextArgs = removeBooleanFlag(nextArgs, 'no-auto-collection-metadata');
    nextArgs = removeFlagWithValue(nextArgs, 'expected-outer-tabs');
    nextArgs = removeFlagWithValue(nextArgs, 'max-popup-depth');
    const execResult = await execNb(['api', 'flow-surfaces', subcommand, ...nextArgs], io);
    writeText(stdout, execResult.stdout);
    writeText(stderr, execResult.stderr);
    return execResult.exitCode;
  }

  if (policy === 'localized_preflight') {
    const body = await loadBodyFromArgs(args, cwd);
    const collectionMetadata = await loadOptionalCollectionMetadataFromArgs(args, cwd);
    const preflightResult = runLocalizedWritePreflight({
      operation: subcommand,
      ...buildLocalizedPreflightPayload(body, collectionMetadata),
    });
    if (!preflightResult.ok) {
      writeJson(stdout, preflightResult);
      return 1;
    }
    let nextArgs = replaceBodyArg(args, preflightResult.cliBody);
    nextArgs = removeFlagWithValue(nextArgs, 'collection-metadata');
    const execResult = await execNb(['api', 'flow-surfaces', subcommand, ...nextArgs], io);
    writeText(stdout, execResult.stdout);
    writeText(stderr, execResult.stderr);
    return execResult.exitCode;
  }

  const execResult = await execNb(['api', 'flow-surfaces', subcommand, ...args], io);
  writeText(stdout, execResult.stdout);
  writeText(stderr, execResult.stderr);
  return execResult.exitCode;
}

export async function runFlowSurfacesWrapperCli(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const [subcommand, ...args] = argv;

  try {
    if (!normalizeText(subcommand) || subcommand === 'help') {
      writeJson(stdout, { ok: true, usage: usage() });
      return 0;
    }
    if (args.includes('--help')) {
      const execResult = await execNb(['api', 'flow-surfaces', subcommand, ...args], io);
      writeText(stdout, execResult.stdout);
      writeText(stderr, execResult.stderr);
      return execResult.exitCode;
    }
    return await runPreparedFlowSurfacesWrite(subcommand, args, io);
  } catch (error) {
    writeJson(stderr, {
      ok: false,
      error: error?.message || String(error),
      usage: usage(),
    });
    return 2;
  }
}
