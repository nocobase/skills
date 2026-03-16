import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  DEFAULT_IMPROVEMENT_LOG_PATH,
  DEFAULT_REPORT_DIR,
  analyzeRun,
  loadJsonLines,
  renderReport,
} from './tool_review_report.mjs';
import {
  DEFAULT_LATEST_RUN_PATH,
  recordToolCall,
  startRun,
  finishRun,
  appendNote,
} from './tool_journal.mjs';

function makeTempDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tool-review-report-${testName}-`));
}

test('default report directory points to codex state directory', () => {
  assert.match(DEFAULT_REPORT_DIR, /\.codex\/state\/nocobase-ui-builder\/reports$/);
  assert.match(DEFAULT_LATEST_RUN_PATH, /\.codex\/state\/nocobase-ui-builder\/latest-run\.json$/);
  assert.match(DEFAULT_IMPROVEMENT_LOG_PATH, /\.codex\/state\/nocobase-ui-builder\/improvement-log\.jsonl$/);
});

test('renderReport writes markdown and html outputs from a log path', () => {
  const rootDir = makeTempDir('direct');
  const logDir = path.join(rootDir, 'logs');
  const outDir = path.join(rootDir, 'reports');
  const latestRunPath = path.join(rootDir, 'latest-run.json');
  const improvementLogPath = path.join(rootDir, 'improvement-log.jsonl');

  const started = startRun({
    task: 'Create orders page',
    title: 'Orders',
    schemaUid: 'k7n4x9p2q5ra',
    logDir,
    latestRunPath,
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_schemabundle',
    toolType: 'mcp',
    status: 'ok',
    summary: 'bootstrap discovery',
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_mutate',
    toolType: 'mcp',
    status: 'error',
    summary: 'create table block',
    error: 'unsupported-model-use',
    args: { requestBody: { atomic: true } },
  });
  appendNote({
    logPath: started.logPath,
    message: 'need to inspect table schema',
    data: { use: 'TableBlockModel' },
  });
  finishRun({
    logPath: started.logPath,
    status: 'partial',
    summary: 'write failed',
  });

  const result = renderReport({
    logPath: started.logPath,
    outDir,
    formats: 'both',
    improvementLogPath,
  });

  const markdown = fs.readFileSync(result.markdownPath, 'utf8');
  const html = fs.readFileSync(result.htmlPath, 'utf8');
  const improvementMarkdown = fs.readFileSync(result.improvementMarkdownPath, 'utf8');
  const improvementJson = JSON.parse(fs.readFileSync(result.improvementJsonPath, 'utf8'));
  const improvementLog = fs.readFileSync(result.improvementLogPath, 'utf8');

  assert.match(markdown, /NocoBase UI Builder 复盘报告/);
  assert.match(markdown, /unsupported-model-use/);
  assert.match(markdown, /存在写操作，但没有记录 `PostFlowmodels_schemas`/);
  assert.match(markdown, /自动改进建议/);
  assert.match(html, /复盘报告/);
  assert.match(html, /PostFlowmodels_mutate/);
  assert.match(html, /unsupported-model-use/);
  assert.match(html, /自动改进建议/);
  assert.match(improvementMarkdown, /自动改进清单/);
  assert.match(improvementMarkdown, /把探测步骤前置并批量化/);
  assert.equal(Array.isArray(improvementJson.optimizationItems), true);
  assert.equal(improvementJson.optimizationItems.length > 0, true);
  assert.match(improvementLog, /improvement_snapshot/);
});

test('analyzeRun generates improvement suggestions from tool call order', () => {
  const rootDir = makeTempDir('analyze');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Update page',
    logDir,
    latestRunPath,
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_mutate',
    toolType: 'mcp',
    status: 'ok',
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.ok(summary.suggestions.some((item) => item.includes('PostFlowmodels_schemabundle')));
  assert.ok(summary.suggestions.some((item) => item.includes('首次探测发生在首次写操作之后')));
  assert.ok(summary.suggestions.some((item) => item.includes('`summary`')));
  assert.ok(summary.optimizationItems.some((item) => item.title.includes('把探测步骤前置并批量化')));
});

test('analyzeRun does not treat different live targets as repeated reads', () => {
  const rootDir = makeTempDir('live-targets');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Inspect multiple pages',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    args: { parentId: 'tabs-a', subKey: 'grid' },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    args: { parentId: 'tabs-b', subKey: 'grid' },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    args: { parentId: 'tabs-a', subKey: 'grid' },
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(
    summary.optimizationItems.some((item) => item.title.includes('压缩重复的 live snapshot 读取')),
    false,
  );
});

test('analyzeRun flags repeated reads of the same live target', () => {
  const rootDir = makeTempDir('same-live-target');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Inspect same page repeatedly',
    logDir,
    latestRunPath,
  });

  for (let index = 0; index < 3; index += 1) {
    recordToolCall({
      logPath: started.logPath,
      tool: 'GetFlowmodels_findone',
      toolType: 'mcp',
      status: 'ok',
      args: { parentId: 'tabs-a', subKey: 'grid' },
    });
  }

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(
    summary.optimizationItems.some((item) => item.title.includes('压缩重复的 live snapshot 读取')),
    true,
  );
});

test('cli render resolves latest-run manifest automatically', () => {
  const rootDir = makeTempDir('cli');
  const logDir = path.join(rootDir, 'logs');
  const reportDir = path.join(rootDir, 'reports');
  const latestRunPath = path.join(rootDir, 'latest-run.json');
  const improvementLogPath = path.join(rootDir, 'improvement-log.jsonl');

  const started = startRun({
    task: 'CLI render',
    logDir,
    latestRunPath,
  });
  finishRun({
    logPath: started.logPath,
    status: 'success',
    summary: 'done',
  });

  const scriptPath = path.join(
    process.cwd(),
    'skills',
    'nocobase-ui-builder',
    'scripts',
    'tool_review_report.mjs',
  );

  const output = execFileSync(
    process.execPath,
    [
      scriptPath,
      'render',
      '--latest-run-path',
      latestRunPath,
      '--out-dir',
      reportDir,
      '--formats',
      'md',
      '--improvement-log-path',
      improvementLogPath,
    ],
    {
      cwd: path.join(process.cwd(), 'skills', 'nocobase-ui-builder'),
      encoding: 'utf8',
    },
  );
  const result = JSON.parse(output);

  assert.equal(fs.existsSync(result.markdownPath), true);
  assert.equal(result.htmlPath, undefined);
  assert.match(result.logPath, /\.jsonl$/);
  assert.equal(fs.existsSync(result.improvementMarkdownPath), true);
  assert.equal(fs.existsSync(result.improvementJsonPath), true);
  assert.equal(fs.existsSync(result.improvementLogPath), true);
});
