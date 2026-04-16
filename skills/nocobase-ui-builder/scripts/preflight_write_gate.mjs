#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOCKER_EXIT_CODE,
  DEFAULT_AUDIT_MODE,
  auditPayload,
  canonicalizePayload,
} from './flow_payload_guard.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/preflight_write_gate.mjs run',
    '    (--payload-json <json> | --payload-file <path>)',
    '    [--metadata-json <json> | --metadata-file <path>]',
    '    [--requirements-json <json> | --requirements-file <path>]',
    '    [--risk-accept <code> ...]',
    '    [--mode <general|validation-case>]',
    '    [--nocobase-root <path>]',
    '    [--snapshot-file <path>]',
    '    [--out-file <path>]',
    '    [--print-payload]',
    '',
    'Notes:',
    '  - 这是给临时/直接 MCP 写入准备的统一写前 gate。',
    '  - 固定顺序：canonicalizePayload -> auditPayload。',
    '  - 出现 blocker 时退出码为 2。',
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
      if (Object.prototype.hasOwnProperty.call(flags, key)) {
        if (!Array.isArray(flags[key])) {
          flags[key] = [flags[key]];
        }
        flags[key].push(true);
      } else {
        flags[key] = true;
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(flags, key)) {
      if (!Array.isArray(flags[key])) {
        flags[key] = [flags[key]];
      }
      flags[key].push(next);
    } else {
      flags[key] = next;
    }
    index += 1;
  }
  return { command, flags };
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeNonEmpty(value, label) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function readJsonInput(jsonValue, fileValue, label) {
  if (jsonValue && fileValue) {
    throw new Error(`${label} accepts either inline json or file, not both`);
  }
  if (jsonValue) {
    return JSON.parse(jsonValue);
  }
  if (fileValue) {
    return JSON.parse(fs.readFileSync(path.resolve(fileValue), 'utf8'));
  }
  throw new Error(`${label} is required`);
}

function readOptionalJsonInput(jsonValue, fileValue) {
  if (!jsonValue && !fileValue) {
    return null;
  }
  return readJsonInput(jsonValue, fileValue, 'json input');
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function summarizeCanonicalize(result) {
  return {
    ok: result.ok,
    changed: Boolean(result.changed),
    transformCodes: (result.transforms || []).map((item) => item.code),
    unresolvedCodes: (result.unresolved || []).map((item) => item.code),
    blockerCount: result.semantic?.blockerCount || 0,
    warningCount: result.semantic?.warningCount || 0,
    autoRewriteCount: result.semantic?.autoRewriteCount || 0,
  };
}

function normalizeRiskAccept(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : (typeof value === 'string' ? [value] : []);
}

export function runPreflightWriteGate({
  payload,
  metadata = {},
  requirements = {},
  mode = DEFAULT_AUDIT_MODE,
  riskAccept = [],
  nocobaseRoot,
  snapshotPath,
  outFile,
}) {
  const canonicalizeResult = canonicalizePayload({
    payload,
    metadata,
    mode,
    nocobaseRoot,
    snapshotPath,
  });
  const finalPayload = canonicalizeResult.payload;
  const auditResult = auditPayload({
    payload: finalPayload,
    metadata,
    mode,
    riskAccept,
    requirements,
    nocobaseRoot,
    snapshotPath,
  });

  if (outFile) {
    writeJson(outFile, finalPayload);
  }

  return {
    ok: auditResult.ok,
    mode,
    canonicalize: summarizeCanonicalize(canonicalizeResult),
    audit: auditResult,
    payload: finalPayload,
    ...(outFile ? { outFile: path.resolve(outFile) } : {}),
  };
}

function handleRun(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const metadata = flags['metadata-json'] || flags['metadata-file']
    ? readJsonInput(flags['metadata-json'], flags['metadata-file'], 'metadata')
    : {};
  const requirements = flags['requirements-json'] || flags['requirements-file']
    ? readJsonInput(flags['requirements-json'], flags['requirements-file'], 'requirements')
    : {};
  const mode = normalizeOptionalText(flags.mode) || DEFAULT_AUDIT_MODE;
  const riskAccept = normalizeRiskAccept(flags['risk-accept']);

  const response = runPreflightWriteGate({
    payload,
    metadata,
    requirements,
    mode,
    riskAccept,
    nocobaseRoot: flags['nocobase-root'],
    snapshotPath: flags['snapshot-file'],
    outFile: flags['out-file'],
  });
  const printableResponse = flags['print-payload'] ? response : { ...response };
  if (!flags['print-payload']) {
    delete printableResponse.payload;
  }
  process.stdout.write(`${JSON.stringify(printableResponse, null, 2)}\n`);
  if (!response.ok) {
    process.exitCode = BLOCKER_EXIT_CODE;
  }
}

function main(argv) {
  try {
    const { command, flags } = parseArgs(argv);
    if (command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    if (command === 'run') {
      handleRun(flags);
      return;
    }
    throw new Error(`Unknown command "${command}"`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = path.resolve(fileURLToPath(import.meta.url));
if (executedPath === currentPath) {
  main(process.argv.slice(2));
}
