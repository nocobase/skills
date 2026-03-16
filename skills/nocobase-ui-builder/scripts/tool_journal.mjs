#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_RUN_LOG_DIR = path.join(
  os.homedir(),
  '.codex',
  'state',
  'nocobase-ui-builder',
  'tool-logs',
);

export const DEFAULT_LATEST_RUN_PATH = path.join(
  os.homedir(),
  '.codex',
  'state',
  'nocobase-ui-builder',
  'latest-run.json',
);

function usage() {
  return [
    'Usage:',
    '  node scripts/tool_journal.mjs start-run --task <task> [--title <title>] [--schemaUid <schemaUid>] [--log-dir <path>] [--metadata-json <json>]',
    '  node scripts/tool_journal.mjs tool-call --log-path <path> --tool <name> [--tool-type <mcp|shell|node|other>] [--args-json <json>] [--status <ok|error|skipped>] [--summary <text>] [--result-json <json>] [--error <text>]',
    '  node scripts/tool_journal.mjs note --log-path <path> --message <text> [--data-json <json>]',
    '  node scripts/tool_journal.mjs finish-run --log-path <path> [--status <success|partial|failed>] [--summary <text>] [--data-json <json>]',
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

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJsonAtomic(filePath, value) {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function appendJsonLine(filePath, value) {
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function resolveLogDir(explicitPath) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_RUN_LOG_DIR;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return DEFAULT_RUN_LOG_DIR;
}

function resolveLogPath(explicitPath) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_RUN_LOG_PATH;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  throw new Error('log path is required');
}

function parseOptionalJson(rawValue, label) {
  if (!rawValue) {
    return undefined;
  }
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function makeRunId() {
  const timestamp = nowIso().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z');
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${timestamp}-${suffix}`;
}

function buildRunLogPath(logDir, runId) {
  return path.join(logDir, `${runId}.jsonl`);
}

function readRunStartedRecord(logPath) {
  if (!fs.existsSync(logPath)) {
    return null;
  }
  const content = fs.readFileSync(logPath, 'utf8');
  const firstLine = content.split('\n').find((line) => line.trim());
  if (!firstLine) {
    return null;
  }
  const record = JSON.parse(firstLine);
  if (record.type !== 'run_started') {
    return null;
  }
  return record;
}

export function startRun({
  task,
  title,
  schemaUid,
  logDir = DEFAULT_RUN_LOG_DIR,
  metadata,
}) {
  const normalizedTask = normalizeNonEmpty(task, 'task');
  const resolvedLogDir = resolveLogDir(logDir);
  const runId = makeRunId();
  const logPath = buildRunLogPath(resolvedLogDir, runId);
  const startedAt = nowIso();
  const record = {
    type: 'run_started',
    runId,
    startedAt,
    task: normalizedTask,
    title: title?.trim() || undefined,
    schemaUid: schemaUid?.trim() || undefined,
    cwd: process.cwd(),
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  };
  appendJsonLine(logPath, record);

  const manifest = {
    runId,
    logPath,
    startedAt,
    task: normalizedTask,
    title: record.title,
    schemaUid: record.schemaUid,
  };
  writeJsonAtomic(DEFAULT_LATEST_RUN_PATH, manifest);

  return {
    ...manifest,
    latestRunPath: DEFAULT_LATEST_RUN_PATH,
  };
}

export function recordToolCall({
  logPath,
  tool,
  toolType = 'mcp',
  status = 'ok',
  summary,
  args,
  result,
  error,
}) {
  const resolvedLogPath = resolveLogPath(logPath);
  const normalizedTool = normalizeNonEmpty(tool, 'tool');
  const runStarted = readRunStartedRecord(resolvedLogPath);
  const record = {
    type: 'tool_call',
    timestamp: nowIso(),
    runId: runStarted?.runId,
    tool: normalizedTool,
    toolType,
    status,
    summary: summary?.trim() || undefined,
    args,
    result,
    error: error?.trim() || undefined,
  };
  appendJsonLine(resolvedLogPath, record);
  return {
    ok: true,
    logPath: resolvedLogPath,
    record,
  };
}

export function appendNote({
  logPath,
  message,
  data,
}) {
  const resolvedLogPath = resolveLogPath(logPath);
  const normalizedMessage = normalizeNonEmpty(message, 'message');
  const runStarted = readRunStartedRecord(resolvedLogPath);
  const record = {
    type: 'note',
    timestamp: nowIso(),
    runId: runStarted?.runId,
    message: normalizedMessage,
    data,
  };
  appendJsonLine(resolvedLogPath, record);
  return {
    ok: true,
    logPath: resolvedLogPath,
    record,
  };
}

export function finishRun({
  logPath,
  status = 'success',
  summary,
  data,
}) {
  const resolvedLogPath = resolveLogPath(logPath);
  const runStarted = readRunStartedRecord(resolvedLogPath);
  const record = {
    type: 'run_finished',
    timestamp: nowIso(),
    runId: runStarted?.runId,
    status,
    summary: summary?.trim() || undefined,
    data,
  };
  appendJsonLine(resolvedLogPath, record);
  return {
    ok: true,
    logPath: resolvedLogPath,
    record,
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

  let result;
  switch (command) {
    case 'start-run':
      result = startRun({
        task: flags.task,
        title: flags.title,
        schemaUid: flags.schemaUid,
        logDir: flags['log-dir'],
        metadata: parseOptionalJson(flags['metadata-json'], 'metadata-json'),
      });
      break;
    case 'tool-call':
      result = recordToolCall({
        logPath: flags['log-path'],
        tool: flags.tool,
        toolType: flags['tool-type'] ?? 'mcp',
        status: flags.status ?? 'ok',
        summary: flags.summary,
        args: parseOptionalJson(flags['args-json'], 'args-json'),
        result: parseOptionalJson(flags['result-json'], 'result-json'),
        error: flags.error,
      });
      break;
    case 'note':
      result = appendNote({
        logPath: flags['log-path'],
        message: flags.message,
        data: parseOptionalJson(flags['data-json'], 'data-json'),
      });
      break;
    case 'finish-run':
      result = finishRun({
        logPath: flags['log-path'],
        status: flags.status ?? 'success',
        summary: flags.summary,
        data: parseOptionalJson(flags['data-json'], 'data-json'),
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
