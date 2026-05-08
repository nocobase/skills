import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveSessionPaths } from '../../scripts/session_state.mjs';
import {
  upsertPageIdentityRecord,
} from '../../scripts/opaque_uid.mjs';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;
const LEGACY_WRITE_GATE_FLAGS = new Set([
  'collection-metadata',
  'expected-outer-tabs',
  'max-popup-depth',
  'no-auto-collection-metadata',
]);

function usage() {
  return {
    command:
      'Legacy UI Builder helper for flow-surfaces commands. Agent-facing writes should call `nb api flow-surfaces` directly; this helper is a thin compatibility pass-through.',
    examples: [
      'nb api flow-surfaces apply-blueprint --body-file blueprint.json -j',
      'nb api flow-surfaces add-block --body-file body.json -j',
      'nb api flow-surfaces get --page-schema-uid page-uid -j',
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

function extractPrepareBlueprint(payload) {
  if (!isObjectRecord(payload)) return payload;
  if (isObjectRecord(payload.blueprint)) return payload.blueprint;
  if (isObjectRecord(payload.requestBody)) return payload.requestBody;
  return payload;
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

function getLongFlagName(token) {
  if (typeof token !== 'string' || !token.startsWith('--') || token === '--') return '';
  const withoutPrefix = token.slice(2);
  const equalsIndex = withoutPrefix.indexOf('=');
  return equalsIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, equalsIndex);
}

function assertNoLegacyWriteGateFlags(args) {
  for (const token of args) {
    const flagName = getLongFlagName(token);
    if (!LEGACY_WRITE_GATE_FLAGS.has(flagName)) continue;
    throw new Error(
      `Legacy UI Builder helper flag --${flagName} is no longer supported. `
      + 'Call `nb api flow-surfaces` directly with the raw business payload; backend authoring now owns validation/defaulting.',
    );
  }
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

function extractApplyBlueprintPageIdentity(preparedBody, responseBody, fallbackTitle = '') {
  const title = normalizeText(
    responseBody?.page?.pageTitle
    || responseBody?.pageTitle
    || preparedBody?.page?.title
    || preparedBody?.navigation?.item?.title
    || fallbackTitle,
  );
  const pageSchemaUid = normalizeText(
    responseBody?.target?.pageSchemaUid
    || responseBody?.page?.pageSchemaUid
    || preparedBody?.target?.pageSchemaUid,
  );
  const pageUid = normalizeText(
    responseBody?.target?.pageUid
    || responseBody?.page?.pageUid,
  );
  const menuGroupTitle = normalizeText(
    responseBody?.page?.menuGroupTitle
    || responseBody?.menuGroupTitle
    || preparedBody?.navigation?.group?.title,
  );
  const groupRouteId = normalizeText(
    responseBody?.page?.menuGroupRouteId
    || responseBody?.page?.routeId
    || preparedBody?.navigation?.group?.routeId,
  );

  if (!pageSchemaUid || !title || !groupRouteId) {
    return null;
  }

  return {
    pageSchemaUid,
    pageUid,
    title,
    menuGroupTitle,
    groupRouteId,
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

async function runFlowSurfacesCommand(subcommand, args, io) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;

  const execResult = await execNb(['api', 'flow-surfaces', subcommand, ...args], io);
  writeText(stdout, execResult.stdout);
  writeText(stderr, execResult.stderr);
  if (subcommand === 'apply-blueprint' && execResult.exitCode === 0) {
    try {
      const requestBody = await loadBodyFromArgs(args, cwd);
      const blueprint = extractPrepareBlueprint(requestBody);
      const responseBody = JSON.parse(execResult.stdout || '{}');
      const pageIdentity = extractApplyBlueprintPageIdentity(
        blueprint,
        responseBody,
        normalizeText(blueprint?.page?.title),
      );
      if (pageIdentity) {
        const sessionPaths = resolveSessionPaths({
          cwd,
          sessionId: io.sessionId,
          sessionRoot: io.sessionRoot,
        });
        upsertPageIdentityRecord(pageIdentity, {
          registryPath: sessionPaths.registryPath,
          sessionId: sessionPaths.sessionId,
          sessionRoot: sessionPaths.sessionRoot,
        });
      }
    } catch {
      // best-effort registry writeback only
    }
  }
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
    assertNoLegacyWriteGateFlags(args);
    return await runFlowSurfacesCommand(subcommand, args, io);
  } catch (error) {
    writeJson(stderr, {
      ok: false,
      error: error?.message || String(error),
      usage: usage(),
    });
    return 2;
  }
}
