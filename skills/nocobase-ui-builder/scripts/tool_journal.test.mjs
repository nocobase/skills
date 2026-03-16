import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  DEFAULT_LATEST_RUN_PATH,
  DEFAULT_RUN_LOG_DIR,
  appendNote,
  finishRun,
  recordToolCall,
  startRun,
} from './tool_journal.mjs';

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

test('default run log directory points to codex state directory', () => {
  assert.match(DEFAULT_RUN_LOG_DIR, /\.codex\/state\/nocobase-ui-builder\/tool-logs$/);
  assert.match(DEFAULT_LATEST_RUN_PATH, /\.codex\/state\/nocobase-ui-builder\/latest-run\.json$/);
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

  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_mutate',
    toolType: 'mcp',
    status: 'ok',
    summary: 'create table block',
    args: { requestBody: { atomic: true } },
    result: { ok: true },
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
  assert.equal(records[1].args.requestBody.atomic, true);
  assert.equal(records[3].status, 'success');
});

test('cli smoke test writes a complete tool journal', () => {
  const logDir = makeLogDir('cli');
  const latestRunPath = makeLatestRunPath('cli');
  const scriptPath = path.join(
    process.cwd(),
    'skills',
    'nocobase-ui-builder',
    'scripts',
    'tool_journal.mjs',
  );

  const startedOutput = execFileSync(
    process.execPath,
    [scriptPath, 'start-run', '--task', 'Smoke test', '--log-dir', logDir, '--latest-run-path', latestRunPath],
    { cwd: path.join(process.cwd(), 'skills', 'nocobase-ui-builder'), encoding: 'utf8' },
  );
  const started = JSON.parse(startedOutput);

  execFileSync(
    process.execPath,
    [
      scriptPath,
      'tool-call',
      '--log-path',
      started.logPath,
      '--tool',
      'GetFlowmodels_findone',
      '--tool-type',
      'mcp',
      '--args-json',
      '{"parentId":"tabs-k7n4x9p2q5ra","subKey":"grid"}',
      '--status',
      'ok',
      '--summary',
      'read grid',
    ],
    { cwd: path.join(process.cwd(), 'skills', 'nocobase-ui-builder'), encoding: 'utf8' },
  );

  execFileSync(
    process.execPath,
    [
      scriptPath,
      'finish-run',
      '--log-path',
      started.logPath,
      '--status',
      'success',
      '--summary',
      'done',
    ],
    { cwd: path.join(process.cwd(), 'skills', 'nocobase-ui-builder'), encoding: 'utf8' },
  );

  const records = readJsonLines(started.logPath);
  assert.equal(records.length, 3);
  assert.equal(records[1].tool, 'GetFlowmodels_findone');
  assert.equal(records[1].args.parentId, 'tabs-k7n4x9p2q5ra');
  assert.equal(records[2].type, 'run_finished');
});
