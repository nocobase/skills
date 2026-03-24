import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_LATEST_RUN_PATH,
  DEFAULT_RUN_LOG_DIR,
  appendNote,
  finishRun,
  recordCacheEvent,
  recordGate,
  recordPhase,
  recordToolCall,
  startRun,
} from './tool_journal.mjs';
import { resolveSessionPaths } from './session_state.mjs';

let artifactSequence = 0;
const SCRIPT_PATH = fileURLToPath(new URL('./tool_journal.mjs', import.meta.url));
const SKILL_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

function makeLogDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tool-journal-${testName}-`));
}

function makeLatestRunPath(testName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tool-journal-latest-${testName}-`));
  return path.join(dir, 'latest-run.json');
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeRawMcpArtifact(dir, {
  status = 'ok',
  callId,
  execId,
  payload,
} = {}) {
  artifactSequence += 1;
  const resolvedCallId = callId ?? `call-${artifactSequence}`;
  const filePath = path.join(dir, `artifact-${artifactSequence}-${status}.json`);
  const artifact = {
    type: 'mcp_tool_call_output',
    call_id: resolvedCallId,
    ...(execId ? { exec_id: execId } : {}),
    output: {
      content: payload === undefined
        ? []
        : [{ type: 'text', text: JSON.stringify(payload) }],
      isError: status === 'error',
    },
  };
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return {
    filePath,
    callId: resolvedCallId,
    execId,
  };
}

test('default run log constants point to agent-neutral state directory', () => {
  assert.match(DEFAULT_RUN_LOG_DIR, /\.nocobase\/state\/nocobase-ui-builder\/tool-logs$/);
  assert.match(DEFAULT_LATEST_RUN_PATH, /\.nocobase\/state\/nocobase-ui-builder\/latest-run\.json$/);
});

test('start-run defaults to session-scoped log paths when session root is provided', () => {
  const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-journal-session-root-'));
  const started = startRun({
    task: 'Create session scoped run',
    sessionRoot,
  });
  const session = resolveSessionPaths({ sessionRoot });
  const manifest = JSON.parse(fs.readFileSync(started.latestRunPath, 'utf8'));

  assert.equal(started.sessionId, session.sessionId);
  assert.equal(started.latestRunPath, session.latestRunPath);
  assert.equal(path.dirname(started.logPath), session.runLogDir);
  assert.equal(manifest.sessionRoot, session.sessionRoot);
  assert.equal(manifest.logPath, started.logPath);
});

test('start-run creates a jsonl log with a run_started record', () => {
  const logDir = makeLogDir('start');
  const latestRunPath = makeLatestRunPath('start');
  const started = startRun({
    task: 'Create orders page',
    title: 'Orders',
    schemaUid: 'k7n4x9p2q5ra',
    logDir,
    latestRunPath,
    metadata: { source: 'test' },
  });

  const records = readJsonLines(started.logPath);

  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'run_started');
  assert.equal(records[0].sessionId, started.sessionId);
  assert.equal(records[0].task, 'Create orders page');
  assert.equal(records[0].title, 'Orders');
  assert.equal(records[0].schemaUid, 'k7n4x9p2q5ra');
  assert.equal(records[0].metadata.source, 'test');
});

test('tool-call, note, and finish-run append ordered records', () => {
  const logDir = makeLogDir('append');
  const latestRunPath = makeLatestRunPath('append');
  const started = startRun({
    task: 'Add table block',
    logDir,
    latestRunPath,
  });
  const rawResult = writeRawMcpArtifact(logDir, {
    status: 'ok',
    callId: 'call-append-ok',
    execId: 'exec-append-ok',
    payload: { data: { results: [{ ok: true }] } },
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_mutate',
    toolType: 'mcp',
    status: 'ok',
    summary: 'create table block',
    args: {
      targetSignature: 'page.root',
      requestBody: { atomic: true },
    },
    rawEvidence: {
      resultFile: rawResult.filePath,
      execId: rawResult.execId,
    },
    result: {
      ok: true,
      summary: {
        targetSignature: 'page.root',
        pageGroups: [],
      },
    },
  });
  appendNote({
    logPath: started.logPath,
    message: 'grid re-read complete',
    data: { blockCount: 1 },
  });
  finishRun({
    logPath: started.logPath,
    status: 'success',
    summary: 'completed',
    data: { createdBlockUid: 'm6w3t8q2p4za' },
  });

  const records = readJsonLines(started.logPath);

  assert.deepEqual(
    records.map((record) => record.type),
    ['run_started', 'tool_call', 'note', 'run_finished'],
  );
  assert.equal(records[1].tool, 'PostFlowmodels_mutate');
  assert.equal(records[1].args.targetSignature, 'page.root');
  assert.equal(records[1].args.requestBody.atomic, true);
  assert.equal(records[1].rawEvidence.callId, 'call-append-ok');
  assert.equal(records[1].rawEvidence.execId, 'exec-append-ok');
  assert.equal(records[1].rawEvidence.resultFile, rawResult.filePath);
  assert.equal(records[1].result.summary.targetSignature, 'page.root');
  assert.equal(records[3].status, 'success');
});

test('mcp tool-call rejects free-text error records without raw artifact binding', () => {
  const logDir = makeLogDir('reject-free-text');
  const latestRunPath = makeLatestRunPath('reject-free-text');
  const started = startRun({
    task: 'Reject unverified failure records',
    logDir,
    latestRunPath,
  });

  assert.throws(
    () => recordToolCall({
      logPath: started.logPath,
      tool: 'PostFlowmodels_mutate',
      toolType: 'mcp',
      status: 'error',
      summary: 'manual failure note',
      error: 'INVALID_FLOW_MODEL_SCHEMA',
    }),
    /requires error-file/,
  );
});

test('phase, gate and cache-event append structured runtime records', () => {
  const logDir = makeLogDir('runtime-records');
  const latestRunPath = makeLatestRunPath('runtime-records');
  const started = startRun({
    task: 'Runtime instrumentation',
    logDir,
    latestRunPath,
  });

  recordPhase({
    logPath: started.logPath,
    phase: 'schema_discovery',
    event: 'start',
    attributes: { source: 'stable-cache' },
  });
  recordPhase({
    logPath: started.logPath,
    phase: 'schema_discovery',
    event: 'end',
    status: 'ok',
    attributes: { durationMs: 320 },
  });
  recordGate({
    logPath: started.logPath,
    gate: 'pre_open',
    status: 'failed',
    reasonCode: 'PRE_OPEN_BLOCKER',
    findings: [{ code: 'runtime-exception' }],
    stoppedRemainingWork: true,
  });
  recordCacheEvent({
    logPath: started.logPath,
    action: 'cache_hit',
    kind: 'schemas',
    identity: 'RootPageModel|TableBlockModel',
    source: 'disk',
    ttlMs: 86_400_000,
  });

  const records = readJsonLines(started.logPath);
  assert.deepEqual(
    records.map((record) => record.type),
    ['run_started', 'phase', 'phase', 'gate', 'cache_event'],
  );
  assert.equal(records[1].phase, 'schema_discovery');
  assert.equal(records[2].event, 'end');
  assert.equal(records[3].reasonCode, 'PRE_OPEN_BLOCKER');
  assert.equal(records[3].stoppedRemainingWork, true);
  assert.equal(records[4].kind, 'schemas');
  assert.equal(records[4].source, 'disk');
});

test('cli smoke test writes a complete tool journal', () => {
  const logDir = makeLogDir('cli');
  const latestRunPath = makeLatestRunPath('cli');

  const startedOutput = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'start-run', '--task', 'Smoke test', '--log-dir', logDir, '--latest-run-path', latestRunPath],
    { cwd: SKILL_ROOT, encoding: 'utf8' },
  );
  const started = JSON.parse(startedOutput);

  execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'phase',
      '--log-path',
      started.logPath,
      '--phase',
      'schema_discovery',
      '--event',
      'start',
      '--attributes-json',
      '{"source":"disk"}',
    ],
    { cwd: SKILL_ROOT, encoding: 'utf8' },
  );

  execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'tool-call',
      '--log-path',
      started.logPath,
      '--tool',
      'GetFlowmodels_findone',
      '--tool-type',
      'mcp',
      '--args-json',
      '{"parentId":"tabs-k7n4x9p2q5ra","subKey":"grid","targetSignature":"page.root"}',
      '--status',
      'ok',
      '--summary',
      'read grid',
      '--call-id',
      'call-cli-read-grid',
      '--exec-id',
      'exec-cli-read-grid',
      '--result-file',
      writeRawMcpArtifact(logDir, {
        status: 'ok',
        callId: 'call-cli-read-grid',
        execId: 'exec-cli-read-grid',
        payload: { data: { uid: 'grid-1' } },
      }).filePath,
      '--result-json',
      '{"summary":{"targetSignature":"page.root","pageGroups":[]}}',
    ],
    { cwd: SKILL_ROOT, encoding: 'utf8' },
  );

  execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'gate',
      '--log-path',
      started.logPath,
      '--gate',
      'build',
      '--status',
      'passed',
      '--reason-code',
      'OK',
      '--findings-json',
      '[]',
      '--stopped-remaining-work',
      'false',
    ],
    { cwd: SKILL_ROOT, encoding: 'utf8' },
  );

  execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'cache-event',
      '--log-path',
      started.logPath,
      '--action',
      'cache_store',
      '--kind',
      'schemaBundle',
      '--identity',
      'root-page',
      '--source',
      'live',
      '--ttl-ms',
      '86400000',
    ],
    { cwd: SKILL_ROOT, encoding: 'utf8' },
  );

  execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'finish-run',
      '--log-path',
      started.logPath,
      '--status',
      'success',
      '--summary',
      'done',
    ],
    { cwd: SKILL_ROOT, encoding: 'utf8' },
  );

  const records = readJsonLines(started.logPath);
  assert.equal(records.length, 6);
  assert.equal(records[1].type, 'phase');
  assert.equal(records[2].tool, 'GetFlowmodels_findone');
  assert.equal(records[2].args.parentId, 'tabs-k7n4x9p2q5ra');
  assert.equal(records[2].args.targetSignature, 'page.root');
  assert.equal(records[2].rawEvidence.callId, 'call-cli-read-grid');
  assert.equal(records[2].rawEvidence.execId, 'exec-cli-read-grid');
  assert.equal(records[2].result.summary.targetSignature, 'page.root');
  assert.equal(records[3].type, 'gate');
  assert.equal(records[4].type, 'cache_event');
  assert.equal(records[5].type, 'run_finished');
});
