#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BUILDER_STATE_DIR, resolveSessionPaths } from './session_state.mjs';

export const DEFAULT_RUN_LOG_DIR = path.join(
  DEFAULT_BUILDER_STATE_DIR,
  'tool-logs',
);

export const DEFAULT_LATEST_RUN_PATH = path.join(
  DEFAULT_BUILDER_STATE_DIR,
  'latest-run.json',
);

function usage() {
  return [
    'Usage:',
    '  node scripts/tool_journal.mjs start-run --task <task> [--title <title>] [--schemaUid <schemaUid>] [--session-id <id>] [--session-root <path>] [--log-dir <path>] [--latest-run-path <path>] [--metadata-json <json>]',
    '  node scripts/tool_journal.mjs tool-call --log-path <path> --tool <name> [--tool-type <mcp|shell|node|other>] [--args-json <json>] [--status <ok|error|skipped>] [--summary <text>] [--call-id <raw-call-id>] [--exec-id <raw-exec-id>] [--result-file <path>] [--error-file <path>] [--result-json <json>] [--error <text>]',
    '  node scripts/tool_journal.mjs note --log-path <path> --message <text> [--data-json <json>]',
    '  node scripts/tool_journal.mjs phase --log-path <path> --phase <name> --event <start|end> [--status <running|ok|error|skipped>] [--attributes-json <json>]',
    '  node scripts/tool_journal.mjs gate --log-path <path> --gate <name> --status <passed|failed|skipped> --reason-code <code> [--findings-json <json>] [--stopped-remaining-work <true|false>] [--data-json <json>]',
    '  node scripts/tool_journal.mjs cache-event --log-path <path> --action <cache_hit|cache_miss|cache_store|cache_invalidate> --kind <kind> --identity <id> [--source <memory|disk|live|none|expired>] [--ttl-ms <ms>] [--data-json <json>]',
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

function resolveLogDir(explicitPath, options = {}) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_RUN_LOG_DIR;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return resolveSessionPaths(options).runLogDir;
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

export function resolveLatestRunPath(explicitPath, options = {}) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_LATEST_RUN_PATH;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return resolveSessionPaths(options).latestRunPath;
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalString(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return normalizeNonEmpty(String(value), label);
}

function resolveExistingFile(filePath, label) {
  const normalizedPath = normalizeNonEmpty(filePath, label);
  const resolvedPath = path.resolve(normalizedPath);
  let stats;
  try {
    stats = fs.statSync(resolvedPath);
  } catch (error) {
    throw new Error(`${label} "${resolvedPath}" does not exist`);
  }
  if (!stats.isFile()) {
    throw new Error(`${label} "${resolvedPath}" must be a file`);
  }
  return resolvedPath;
}

function readArtifactJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} "${filePath}" must be valid JSON: ${error.message}`);
  }
}

function extractArtifactRef(filePath, label) {
  if (!filePath) {
    return null;
  }
  const resolvedPath = resolveExistingFile(filePath, label);
  const payload = readArtifactJson(resolvedPath, label);
  return {
    filePath: resolvedPath,
    callId: normalizeOptionalString(payload.call_id ?? payload.callId, `${label} call_id`),
    execId: normalizeOptionalString(payload.exec_id ?? payload.execId, `${label} exec_id`),
  };
}

function coalesceUniqueStrings(values, label) {
  const normalizedValues = values.filter(Boolean);
  if (normalizedValues.length === 0) {
    return undefined;
  }
  if (new Set(normalizedValues).size > 1) {
    throw new Error(`${label} mismatch across raw evidence`);
  }
  return normalizedValues[0];
}

function normalizeRawEvidence({ toolType, status, rawEvidence }) {
  const source = isPlainObject(rawEvidence) ? rawEvidence : {};
  const resultArtifact = extractArtifactRef(source.resultFile, 'result-file');
  const errorArtifact = extractArtifactRef(source.errorFile, 'error-file');

  const callId = coalesceUniqueStrings([
    normalizeOptionalString(source.callId, 'call-id'),
    resultArtifact?.callId,
    errorArtifact?.callId,
  ], 'call id');

  const execId = coalesceUniqueStrings([
    normalizeOptionalString(source.execId, 'exec-id'),
    resultArtifact?.execId,
    errorArtifact?.execId,
  ], 'exec id');

  if (toolType === 'mcp' && status !== 'skipped') {
    if (status === 'ok' && !resultArtifact) {
      throw new Error('mcp tool-call with status "ok" requires result-file');
    }
    if (status === 'error' && !errorArtifact) {
      throw new Error('mcp tool-call with status "error" requires error-file');
    }
    if (resultArtifact && !resultArtifact.callId) {
      throw new Error('mcp result-file must contain top-level call_id');
    }
    if (errorArtifact && !errorArtifact.callId) {
      throw new Error('mcp error-file must contain top-level call_id');
    }
    if (!callId) {
      throw new Error('mcp tool-call requires raw call_id; provide --call-id or a result/error artifact with top-level call_id');
    }
  }

  const hasEvidence = Boolean(callId || execId || resultArtifact || errorArtifact);
  if (!hasEvidence) {
    return undefined;
  }

  return {
    callId,
    execId,
    resultFile: resultArtifact?.filePath,
    errorFile: errorArtifact?.filePath,
  };
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
  sessionId,
  sessionRoot,
  logDir,
  latestRunPath,
  metadata,
}) {
  const normalizedTask = normalizeNonEmpty(task, 'task');
  const session = resolveSessionPaths({ sessionId, sessionRoot });
  const resolvedLogDir = resolveLogDir(logDir, session);
  const runId = makeRunId();
  const logPath = buildRunLogPath(resolvedLogDir, runId);
  const startedAt = nowIso();
  const record = {
    type: 'run_started',
    runId,
    startedAt,
    sessionId: session.sessionId,
    task: normalizedTask,
    title: title?.trim() || undefined,
    schemaUid: schemaUid?.trim() || undefined,
    cwd: process.cwd(),
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  };
  appendJsonLine(logPath, record);

  const manifest = {
    runId,
    sessionId: session.sessionId,
    sessionRoot: session.sessionRoot,
    logPath,
    startedAt,
    task: normalizedTask,
    title: record.title,
    schemaUid: record.schemaUid,
  };
  const resolvedLatestRunPath = resolveLatestRunPath(latestRunPath, session);
  writeJsonAtomic(resolvedLatestRunPath, manifest);

  return {
    ...manifest,
    latestRunPath: resolvedLatestRunPath,
  };
}

export function recordToolCall({
  logPath,
  tool,
  toolType = 'mcp',
  status = 'ok',
  summary,
  args,
  rawEvidence,
  result,
  error,
}) {
  const resolvedLogPath = resolveLogPath(logPath);
  const normalizedTool = normalizeNonEmpty(tool, 'tool');
  const runStarted = readRunStartedRecord(resolvedLogPath);
  const normalizedRawEvidence = normalizeRawEvidence({
    toolType,
    status,
    rawEvidence,
  });
  const record = {
    type: 'tool_call',
    timestamp: nowIso(),
    runId: runStarted?.runId,
    tool: normalizedTool,
    toolType,
    status,
    summary: summary?.trim() || undefined,
    args,
    rawEvidence: normalizedRawEvidence,
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

function parseBooleanString(rawValue, label, fallback = false) {
  if (rawValue === undefined) {
    return fallback;
  }
  if (rawValue === 'true') {
    return true;
  }
  if (rawValue === 'false') {
    return false;
  }
  throw new Error(`${label} must be "true" or "false"`);
}

export function recordPhase({
  logPath,
  phase,
  event,
  status = 'running',
  attributes,
}) {
  const resolvedLogPath = resolveLogPath(logPath);
  const normalizedPhase = normalizeNonEmpty(phase, 'phase');
  const normalizedEvent = normalizeNonEmpty(event, 'event');
  if (normalizedEvent !== 'start' && normalizedEvent !== 'end') {
    throw new Error('phase event must be "start" or "end"');
  }
  const runStarted = readRunStartedRecord(resolvedLogPath);
  const record = {
    type: 'phase',
    timestamp: nowIso(),
    runId: runStarted?.runId,
    phase: normalizedPhase,
    event: normalizedEvent,
    status,
    attributes: attributes && Object.keys(attributes).length > 0 ? attributes : undefined,
  };
  appendJsonLine(resolvedLogPath, record);
  return {
    ok: true,
    logPath: resolvedLogPath,
    record,
  };
}

export function recordGate({
  logPath,
  gate,
  status,
  reasonCode,
  findings,
  stoppedRemainingWork = false,
  data,
}) {
  const resolvedLogPath = resolveLogPath(logPath);
  const normalizedGate = normalizeNonEmpty(gate, 'gate');
  const normalizedStatus = normalizeNonEmpty(status, 'status');
  const normalizedReasonCode = normalizeNonEmpty(reasonCode, 'reason code');
  const runStarted = readRunStartedRecord(resolvedLogPath);
  const record = {
    type: 'gate',
    timestamp: nowIso(),
    runId: runStarted?.runId,
    gate: normalizedGate,
    status: normalizedStatus,
    reasonCode: normalizedReasonCode,
    findings: Array.isArray(findings) ? findings : [],
    stoppedRemainingWork: Boolean(stoppedRemainingWork),
    data: data && Object.keys(data).length > 0 ? data : undefined,
  };
  appendJsonLine(resolvedLogPath, record);
  return {
    ok: true,
    logPath: resolvedLogPath,
    record,
  };
}

export function recordCacheEvent({
  logPath,
  action,
  kind,
  identity,
  source,
  ttlMs,
  data,
}) {
  const resolvedLogPath = resolveLogPath(logPath);
  const normalizedAction = normalizeNonEmpty(action, 'action');
  const normalizedKind = normalizeNonEmpty(kind, 'kind');
  const normalizedIdentity = normalizeNonEmpty(identity, 'identity');
  const runStarted = readRunStartedRecord(resolvedLogPath);
  const record = {
    type: 'cache_event',
    timestamp: nowIso(),
    runId: runStarted?.runId,
    action: normalizedAction,
    kind: normalizedKind,
    identity: normalizedIdentity,
    source: source?.trim() || undefined,
    ttlMs: Number.isFinite(ttlMs) ? ttlMs : undefined,
    data: data && Object.keys(data).length > 0 ? data : undefined,
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
        sessionId: flags['session-id'],
        sessionRoot: flags['session-root'],
        logDir: flags['log-dir'],
        latestRunPath: flags['latest-run-path'],
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
        rawEvidence: {
          callId: flags['call-id'],
          execId: flags['exec-id'],
          resultFile: flags['result-file'],
          errorFile: flags['error-file'],
        },
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
    case 'phase':
      result = recordPhase({
        logPath: flags['log-path'],
        phase: flags.phase,
        event: flags.event,
        status: flags.status ?? (flags.event === 'end' ? 'ok' : 'running'),
        attributes: parseOptionalJson(flags['attributes-json'], 'attributes-json'),
      });
      break;
    case 'gate':
      result = recordGate({
        logPath: flags['log-path'],
        gate: flags.gate,
        status: flags.status,
        reasonCode: flags['reason-code'],
        findings: parseOptionalJson(flags['findings-json'], 'findings-json'),
        stoppedRemainingWork: parseBooleanString(flags['stopped-remaining-work'], 'stopped-remaining-work', false),
        data: parseOptionalJson(flags['data-json'], 'data-json'),
      });
      break;
    case 'cache-event':
      result = recordCacheEvent({
        logPath: flags['log-path'],
        action: flags.action,
        kind: flags.kind,
        identity: flags.identity,
        source: flags.source,
        ttlMs: typeof flags['ttl-ms'] === 'string' ? Number.parseInt(flags['ttl-ms'], 10) : undefined,
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
