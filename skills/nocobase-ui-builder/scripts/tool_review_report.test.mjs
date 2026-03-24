import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_IMPROVEMENT_LOG_PATH,
  DEFAULT_REPORT_DIR,
  analyzeRun,
  loadJsonLines,
  renderReport,
} from './tool_review_report.mjs';
import {
  DEFAULT_LATEST_RUN_PATH,
  recordCacheEvent,
  recordGate,
  recordPhase,
  recordToolCall as recordToolCallBase,
  startRun,
  finishRun,
  appendNote,
} from './tool_journal.mjs';
import { resolveSessionPaths } from './session_state.mjs';

function makeTempDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tool-review-report-${testName}-`));
}

let rawArtifactSequence = 0;
const SCRIPT_PATH = fileURLToPath(new URL('./tool_review_report.mjs', import.meta.url));
const SKILL_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

function writeRawMcpArtifact(logPath, {
  status = 'ok',
  callId,
  execId,
  payload,
} = {}) {
  rawArtifactSequence += 1;
  const resolvedCallId = callId ?? `call-report-${rawArtifactSequence}`;
  const resolvedExecId = execId ?? `exec-report-${rawArtifactSequence}`;
  const artifactPath = path.join(
    path.dirname(logPath),
    `raw-mcp-${rawArtifactSequence}-${status}.json`,
  );
  const artifact = {
    type: 'mcp_tool_call_output',
    call_id: resolvedCallId,
    exec_id: resolvedExecId,
    output: {
      content: payload === undefined
        ? []
        : [{ type: 'text', text: JSON.stringify(payload) }],
      isError: status === 'error',
    },
  };
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return {
    artifactPath,
    callId: resolvedCallId,
    execId: resolvedExecId,
  };
}

function recordToolCall(params) {
  if (params.toolType !== 'mcp' || params.status === 'skipped') {
    return recordToolCallBase(params);
  }

  const status = params.status ?? 'ok';
  const rawEvidence = { ...(params.rawEvidence ?? {}) };
  const needsResultFile = status === 'ok' && !rawEvidence.resultFile;
  const needsErrorFile = status === 'error' && !rawEvidence.errorFile;

  if (needsResultFile || needsErrorFile) {
    const artifact = writeRawMcpArtifact(params.logPath, {
      status,
      payload: status === 'ok'
        ? (params.result ?? { ok: true })
        : { error: params.error ?? params.summary ?? 'error' },
    });
    rawEvidence.execId ??= artifact.execId;
    if (needsResultFile) {
      rawEvidence.resultFile = artifact.artifactPath;
    }
    if (needsErrorFile) {
      rawEvidence.errorFile = artifact.artifactPath;
    }
  }

  return recordToolCallBase({
    ...params,
    rawEvidence,
  });
}

test('default report constants point to agent-neutral state directory', () => {
  assert.match(DEFAULT_REPORT_DIR, /\.nocobase\/state\/nocobase-ui-builder\/reports$/);
  assert.match(DEFAULT_LATEST_RUN_PATH, /\.nocobase\/state\/nocobase-ui-builder\/latest-run\.json$/);
  assert.match(DEFAULT_IMPROVEMENT_LOG_PATH, /\.nocobase\/state\/nocobase-ui-builder\/improvement-log\.jsonl$/);
});

test('renderReport defaults to session-scoped report paths', () => {
  const sessionRoot = makeTempDir('session-root');
  const session = resolveSessionPaths({ sessionRoot });
  const started = startRun({
    task: 'Session scoped report',
    sessionRoot,
  });
  finishRun({
    logPath: started.logPath,
    status: 'success',
    summary: 'done',
  });

  const result = renderReport({
    sessionRoot,
    formats: 'md',
  });

  assert.equal(result.outDir, session.reportDir);
  assert.equal(result.improvementLogPath, session.improvementLogPath);
  assert.equal(result.logPath, started.logPath);
  assert.equal(path.dirname(result.markdownPath), session.reportDir);
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
  recordPhase({
    logPath: started.logPath,
    phase: 'schema_discovery',
    event: 'start',
  });
  recordPhase({
    logPath: started.logPath,
    phase: 'schema_discovery',
    event: 'end',
    status: 'ok',
    attributes: { durationMs: 1800 },
  });
  recordCacheEvent({
    logPath: started.logPath,
    action: 'cache_miss',
    kind: 'schemas',
    identity: 'RootPageModel|TableBlockModel',
    source: 'none',
  });
  recordGate({
    logPath: started.logPath,
    gate: 'build',
    status: 'failed',
    reasonCode: 'WRITE_ERROR',
    findings: [{ code: 'unsupported-model-use' }],
    stoppedRemainingWork: true,
  });
  finishRun({
    logPath: started.logPath,
    status: 'partial',
    summary: 'write failed',
    data: {
      pageUrl: 'http://127.0.0.1:23000/admin/k7n4x9p2q5ra',
    },
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
  assert.match(markdown, /## 结果轴/);
  assert.match(markdown, /browserValidation \| skipped \(not requested\)/);
  assert.match(markdown, /runtimeUsable \| not-run/);
  assert.match(markdown, /http:\/\/127\.0\.0\.1:23000\/admin\/k7n4x9p2q5ra/);
  assert.match(markdown, /unsupported-model-use/);
  assert.match(markdown, /存在写操作，但没有记录 `PostFlowmodels_schemas`/);
  assert.match(markdown, /Guard 摘要/);
  assert.match(markdown, /阶段耗时画像/);
  assert.match(markdown, /Stable Cache 摘要/);
  assert.match(markdown, /Gate 摘要/);
  assert.match(markdown, /缺少 `flow_payload_guard.canonicalize-payload`/);
  assert.match(markdown, /缺少 `flow_payload_guard.audit-payload`/);
  assert.match(markdown, /自动改进建议/);
  assert.match(html, /复盘报告/);
  assert.match(html, /结果轴/);
  assert.match(html, /http:\/\/127\.0\.0\.1:23000\/admin\/k7n4x9p2q5ra/);
  assert.match(html, /阶段耗时画像/);
  assert.match(html, /Stable Cache 摘要/);
  assert.match(html, /Gate 摘要/);
  assert.match(html, /Guard 摘要/);
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
  assert.ok(summary.suggestions.some((item) => item.includes('flow_payload_guard.canonicalize-payload')));
  assert.ok(summary.suggestions.some((item) => item.includes('flow_payload_guard.audit-payload')));
  assert.ok(summary.suggestions.some((item) => item.includes('`summary`')));
  assert.ok(summary.optimizationItems.some((item) => item.title.includes('把探测步骤前置并批量化')));
  assert.ok(summary.optimizationItems.some((item) => item.title.includes('canonicalize')));
  assert.ok(summary.optimizationItems.some((item) => item.title.includes('payload guard')));
});

test('analyzeRun recognizes prefixed MCP tool names and flags missing route-ready evidence after createV2', () => {
  const rootDir = makeTempDir('route-ready');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Create fresh page',
    logDir,
    latestRunPath,
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'mcp__nocobase__PostDesktoproutes_createv2',
    toolType: 'mcp',
    status: 'ok',
    summary: 'create page shell',
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'mcp__nocobase__GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    summary: 'read page anchor',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.ok(summary.suggestions.some((item) => item.includes('accessible route 回读')));
  assert.ok(summary.suggestions.some((item) => item.includes('`pre-open` gate')));
  assert.ok(summary.optimizationItems.some((item) => item.title.includes('route-ready')));
});

test('analyzeRun builds structured status axes for page shell, route-ready and readback', () => {
  const rootDir = makeTempDir('status-axes');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Create orders page',
    schemaUid: 'page-orders',
    logDir,
    latestRunPath,
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostDesktoproutes_createv2',
    toolType: 'mcp',
    status: 'ok',
    summary: 'create page shell',
    args: {
      requestBody: {
        schemaUid: 'page-orders',
      },
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetDesktoproutes_getaccessible',
    toolType: 'mcp',
    status: 'ok',
    summary: 'route-ready check',
    args: {
      filterByTk: 'page-orders',
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'save page root',
    args: {
      targetSignature: 'page.root',
    },
    result: {
      summary: {
        targetSignature: 'page.root',
        pageGroups: [],
      },
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    summary: 'readback page root',
    args: {
      parentId: 'page-orders',
      subKey: 'page',
      targetSignature: 'page.root',
    },
    result: {
      summary: {
        targetSignature: 'page.root',
        pageGroups: [],
      },
    },
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.statusAxes.pageShellCreated.status, 'created');
  assert.equal(summary.statusAxes.routeReady.status, 'ready');
  assert.equal(summary.statusAxes.readbackMatched.status, 'matched');
  assert.equal(summary.statusAxes.browserValidation.status, 'skipped (not requested)');
  assert.equal(summary.statusAxes.runtimeUsable.status, 'not-run');
  assert.equal(summary.statusAxes.dataReady.status, 'not-recorded');
  assert.equal(summary.statusAxes.dataPreparation.status, 'not-recorded');
});

test('analyzeRun keeps route-ready evidence conservative when route reads are not bound to the target page', () => {
  const rootDir = makeTempDir('route-binding');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Create orders page',
    schemaUid: 'page-orders',
    logDir,
    latestRunPath,
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostDesktoproutes_createv2',
    toolType: 'mcp',
    status: 'ok',
    summary: 'create target page shell',
    args: {
      requestBody: {
        schemaUid: 'page-orders',
      },
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetDesktoproutes_getaccessible',
    toolType: 'mcp',
    status: 'ok',
    summary: 'route check for another page',
    args: {
      filterByTk: 'page-other',
    },
  });
  recordGate({
    logPath: started.logPath,
    gate: 'pre_open',
    status: 'passed',
    reasonCode: 'PREOPEN_READY',
    findings: [],
    data: {
      schemaUid: 'page-other',
    },
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.routeReadySummary.routeReadCount, 0);
  assert.equal(summary.routeReadySummary.routeReadEvidenceInsufficient.length, 1);
  assert.equal(summary.statusAxes.routeReady.status, 'evidence-insufficient');
  assert.ok(summary.suggestions.some((item) => item.includes('显式绑定到目标页面')));
});

test('analyzeRun summarizes phase, cache and gate telemetry', () => {
  const rootDir = makeTempDir('telemetry');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Telemetry summary',
    logDir,
    latestRunPath,
  });

  recordPhase({
    logPath: started.logPath,
    phase: 'schema_discovery',
    event: 'start',
  });
  recordPhase({
    logPath: started.logPath,
    phase: 'schema_discovery',
    event: 'end',
    status: 'ok',
  });
  recordCacheEvent({
    logPath: started.logPath,
    action: 'cache_hit',
    kind: 'schemas',
    identity: 'RootPageModel',
    source: 'disk',
  });
  recordCacheEvent({
    logPath: started.logPath,
    action: 'cache_miss',
    kind: 'collectionFields',
    identity: 'customers',
    source: 'none',
  });
  recordGate({
    logPath: started.logPath,
    gate: 'pre_open',
    status: 'failed',
    reasonCode: 'PRE_OPEN_BLOCKER',
    findings: [{ code: 'runtime-exception' }],
    stoppedRemainingWork: true,
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.phaseSummary.totals.length, 1);
  assert.equal(summary.phaseSummary.totals[0].phase, 'schema_discovery');
  assert.equal(summary.cacheSummary.hitRatio, 0.5);
  assert.equal(summary.gateSummary.failed, 1);
  assert.equal(summary.totalPhases, 2);
  assert.equal(summary.totalCacheEvents, 2);
  assert.equal(summary.totalGates, 1);
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

test('analyzeRun detects writes after guard blockers without risk-accept', () => {
  const rootDir = makeTempDir('guard-violation');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Guard violation',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'flow_payload_guard.audit-payload',
    toolType: 'node',
    status: 'ok',
    summary: 'audit payload before write',
    args: { mode: 'general' },
    result: {
      ok: false,
      mode: 'general',
      blockers: [{ code: 'FILTER_ITEM_USES_FIELD_NOT_PATH' }],
      warnings: [],
      acceptedRiskCodes: [],
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_mutate',
    toolType: 'mcp',
    status: 'ok',
    summary: 'write anyway',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.guardSummary.auditCount, 1);
  assert.equal(summary.guardSummary.writeAfterBlockerWithoutRiskAcceptCount, 1);
  assert.ok(summary.suggestions.some((item) => item.includes('guard 已报 blocker')));
  assert.ok(summary.optimizationItems.some((item) => item.title.includes('不要绕过 blocker 直接写入')));
});

test('analyzeRun flags createV2 after guard blockers as a dedicated violation', () => {
  const rootDir = makeTempDir('guard-createv2-violation');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Guard violation before createV2',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'flow_payload_guard.audit-payload',
    toolType: 'node',
    status: 'ok',
    summary: 'audit payload before createV2',
    args: { mode: 'validation-case' },
    result: {
      ok: false,
      mode: 'validation-case',
      blockers: [{ code: 'FORM_SUBMIT_ACTION_MISSING' }],
      warnings: [],
      acceptedRiskCodes: [],
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostDesktoproutes_createv2',
    toolType: 'mcp',
    status: 'ok',
    summary: 'create page shell anyway',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.guardSummary.createPageAfterBlockerCount, 1);
  assert.ok(summary.suggestions.some((item) => item.includes('PostDesktoproutes_createv2')));
  assert.ok(summary.optimizationItems.some((item) => item.title.includes('createV2')));
});

test('analyzeRun requires a re-audit after structured risk-accept before allowing writes', () => {
  const rootDir = makeTempDir('risk-accept');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Risk accept',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'flow_payload_guard.audit-payload',
    toolType: 'node',
    status: 'ok',
    summary: 'audit payload before write',
    args: { mode: 'general' },
    result: {
      ok: false,
      mode: 'general',
      blockers: [{ code: 'EMPTY_POPUP_GRID' }],
      warnings: [],
      acceptedRiskCodes: [],
    },
  });
  appendNote({
    logPath: started.logPath,
    message: 'risk-accept for popup shell',
    data: {
      type: 'risk_accept',
      codes: ['EMPTY_POPUP_GRID'],
      reason: 'temporary shell allowed during migration',
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'flow_payload_guard.audit-payload',
    toolType: 'node',
    status: 'ok',
    summary: 're-audit after accepted risk',
    args: { mode: 'validation-case', riskAccept: ['EMPTY_POPUP_GRID'] },
    result: {
      ok: true,
      mode: 'validation-case',
      blockers: [],
      warnings: [{ code: 'EMPTY_POPUP_GRID', accepted: true }],
      acceptedRiskCodes: ['EMPTY_POPUP_GRID'],
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'write after accepted risk',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.guardSummary.riskAcceptCount, 1);
  assert.equal(summary.guardSummary.writeAfterBlockerWithoutRiskAcceptCount, 0);
  assert.ok(summary.suggestions.some((item) => item.includes('risk-accept')));
});

test('analyzeRun treats structured risk-accept without re-audit as a violation', () => {
  const rootDir = makeTempDir('risk-accept-without-reaudit');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Risk accept without re-audit',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'flow_payload_guard.audit-payload',
    toolType: 'node',
    status: 'ok',
    summary: 'audit payload before write',
    args: { mode: 'validation-case' },
    result: {
      ok: false,
      mode: 'validation-case',
      blockers: [{ code: 'EMPTY_POPUP_GRID' }],
      warnings: [],
      acceptedRiskCodes: [],
    },
  });
  appendNote({
    logPath: started.logPath,
    message: 'risk-accept for popup shell',
    data: {
      type: 'risk_accept',
      codes: ['EMPTY_POPUP_GRID'],
      reason: 'temporary shell allowed during migration',
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'write without re-audit',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.guardSummary.riskAcceptCount, 1);
  assert.equal(summary.guardSummary.writeAfterBlockerWithoutRiskAcceptCount, 1);
  assert.equal(summary.guardSummary.violations[0].violationType, 'risk_accept_without_reaudit');
});

test('analyzeRun flags save/readback mismatches as a high-priority workflow issue', () => {
  const rootDir = makeTempDir('readback-mismatch');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Visible tabs page',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'write visible tabs',
    args: {
      targetSignature: 'page.root',
    },
    result: {
      summary: {
        targetSignature: 'page.root',
        pageGroups: [
          {
            pageSignature: '$',
            pageUse: 'RootPageModel',
            tabCount: 4,
            tabTitles: ['客户概览', '联系人', '商机', '跟进记录'],
            tabs: [
              { title: '客户概览', hasBlockGrid: true },
              { title: '联系人', hasBlockGrid: true },
              { title: '商机', hasBlockGrid: true },
              { title: '跟进记录', hasBlockGrid: true },
            ],
          },
        ],
        tabCount: 4,
        tabTitles: ['客户概览', '联系人', '商机', '跟进记录'],
        topLevelUses: ['RootPageTabModel'],
      },
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    summary: 'read back root page',
    args: {
      parentId: 'wjsktwr1sdzp',
      subKey: 'page',
      targetSignature: 'page.root',
    },
    result: {
      uid: 'ens_root_page',
      summary: {
        targetSignature: 'page.root',
        pageGroups: [
          {
            pageSignature: '$',
            pageUse: 'RootPageModel',
            tabCount: 0,
            tabTitles: [],
            tabs: [],
          },
        ],
        tabCount: 0,
        tabTitles: [],
        topLevelUses: [],
      },
    },
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.readbackMismatches.length, 1);
  assert.equal(summary.readbackMismatches[0].targetSignature, 'page.root');
  assert.ok(summary.readbackMismatches[0].evidence.some((item) => item.includes('page $ tabCount write=4')));
  assert.ok(summary.suggestions.some((item) => item.includes('write 后 readback 不一致')));
  assert.ok(summary.optimizationItems.some((item) => item.title.includes('write 后 readback 不一致')));
});

test('analyzeRun marks legacy unsigned save/findone logs as evidence_insufficient instead of mismatch', () => {
  const rootDir = makeTempDir('legacy-readback');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Legacy mismatch fallback',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'legacy save',
    result: {
      tabCount: 4,
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    summary: 'legacy readback',
    args: {
      parentId: 'page-a',
      subKey: 'page',
    },
    result: {
      tabCount: 0,
    },
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.readbackMismatches.length, 0);
  assert.equal(summary.readbackEvidenceInsufficient.length, 1);
  assert.equal(summary.readbackEvidenceInsufficient[0].reasonCode, 'WRITE_TARGET_SIGNATURE_MISSING');
});

test('analyzeRun marks save and ensure without explicit targetSignature as evidence_insufficient', () => {
  const rootDir = makeTempDir('save-ensure-missing-signature');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Save and ensure without target signature',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'save without explicit signature',
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_ensure',
    toolType: 'mcp',
    status: 'ok',
    summary: 'ensure without explicit signature',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.readbackMismatches.length, 0);
  assert.deepEqual(
    summary.readbackEvidenceInsufficient.map((item) => item.reasonCode),
    ['WRITE_TARGET_SIGNATURE_MISSING', 'WRITE_TARGET_SIGNATURE_MISSING'],
  );
  assert.deepEqual(
    summary.readbackEvidenceInsufficient.map((item) => item.writeTool),
    ['PostFlowmodels_save', 'PostFlowmodels_ensure'],
  );
});

test('analyzeRun marks mutate without explicit targetSignature as evidence_insufficient', () => {
  const rootDir = makeTempDir('mutate-missing-signature');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Mutate without target signature',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_mutate',
    toolType: 'mcp',
    status: 'ok',
    summary: 'mutate without explicit signature',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.readbackMismatches.length, 0);
  assert.equal(summary.readbackEvidenceInsufficient.length, 1);
  assert.equal(summary.readbackEvidenceInsufficient[0].reasonCode, 'WRITE_TARGET_SIGNATURE_MISSING');
});

test('analyzeRun marks writes without follow-up readback as evidence_insufficient', () => {
  const rootDir = makeTempDir('missing-readback');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Write without follow-up readback',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'save with target signature but no readback',
    args: {
      targetSignature: 'page.root',
    },
    result: {
      summary: {
        targetSignature: 'page.root',
        pageGroups: [],
      },
    },
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.readbackMismatches.length, 0);
  assert.equal(summary.readbackEvidenceInsufficient.length, 1);
  assert.equal(summary.readbackEvidenceInsufficient[0].reasonCode, 'READBACK_MISSING');
  assert.equal(summary.readbackEvidenceInsufficient[0].targetSignature, 'page.root');
});

test('analyzeRun ignores non-structured risk-accept notes', () => {
  const rootDir = makeTempDir('non-structured-risk-accept');
  const logDir = path.join(rootDir, 'logs');
  const latestRunPath = path.join(rootDir, 'latest-run.json');

  const started = startRun({
    task: 'Non structured risk accept',
    logDir,
    latestRunPath,
  });

  recordToolCall({
    logPath: started.logPath,
    tool: 'flow_payload_guard.audit-payload',
    toolType: 'node',
    status: 'ok',
    summary: 'audit payload before write',
    args: { mode: 'validation-case' },
    result: {
      ok: false,
      mode: 'validation-case',
      blockers: [{ code: 'EMPTY_POPUP_GRID' }],
      warnings: [],
      acceptedRiskCodes: [],
    },
  });
  appendNote({
    logPath: started.logPath,
    message: 'risk-accept maybe later',
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'write after loose note',
  });

  const summary = analyzeRun(loadJsonLines(started.logPath), started.logPath);
  assert.equal(summary.guardSummary.riskAcceptCount, 0);
  assert.equal(summary.guardSummary.writeAfterBlockerWithoutRiskAcceptCount, 1);
});

test('renderReport keeps timeline records in original event order', () => {
  const rootDir = makeTempDir('timeline-order');
  const logDir = path.join(rootDir, 'logs');
  const outDir = path.join(rootDir, 'reports');
  const latestRunPath = path.join(rootDir, 'latest-run.json');
  const improvementLogPath = path.join(rootDir, 'improvement-log.jsonl');

  const started = startRun({
    task: 'Timeline order',
    logDir,
    latestRunPath,
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    summary: 'first tool',
  });
  appendNote({
    logPath: started.logPath,
    message: 'middle note',
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_schemabundle',
    toolType: 'mcp',
    status: 'ok',
    summary: 'second tool',
  });
  finishRun({
    logPath: started.logPath,
    status: 'success',
    summary: 'done',
  });

  const result = renderReport({
    logPath: started.logPath,
    outDir,
    formats: 'md',
    improvementLogPath,
  });
  const markdown = fs.readFileSync(result.markdownPath, 'utf8');
  const timelineSection = markdown.split('## 时间线')[1];
  const firstToolIndex = timelineSection.indexOf('GetFlowmodels_findone');
  const noteIndex = timelineSection.indexOf('middle note');
  const secondToolIndex = timelineSection.indexOf('PostFlowmodels_schemabundle');

  assert.notEqual(firstToolIndex, -1);
  assert.notEqual(noteIndex, -1);
  assert.notEqual(secondToolIndex, -1);
  assert.equal(firstToolIndex < noteIndex && noteIndex < secondToolIndex, true);
});

test('renderReport includes readback mismatch section', () => {
  const rootDir = makeTempDir('render-readback-mismatch');
  const logDir = path.join(rootDir, 'logs');
  const outDir = path.join(rootDir, 'reports');
  const latestRunPath = path.join(rootDir, 'latest-run.json');
  const improvementLogPath = path.join(rootDir, 'improvement-log.jsonl');

  const started = startRun({
    task: 'Render mismatch report',
    logDir,
    latestRunPath,
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'PostFlowmodels_save',
    toolType: 'mcp',
    status: 'ok',
    summary: 'save tabs',
    args: {
      targetSignature: 'page.root',
    },
    result: {
      summary: {
        targetSignature: 'page.root',
        pageGroups: [
          {
            pageSignature: '$',
            pageUse: 'RootPageModel',
            tabCount: 4,
            tabTitles: ['客户概览', '联系人', '商机', '跟进记录'],
            tabs: [],
          },
        ],
        tabCount: 4,
        tabTitles: ['客户概览', '联系人', '商机', '跟进记录'],
      },
    },
  });
  recordToolCall({
    logPath: started.logPath,
    tool: 'GetFlowmodels_findone',
    toolType: 'mcp',
    status: 'ok',
    summary: 'read back tabs',
    args: {
      parentId: 'page-a',
      subKey: 'page',
      targetSignature: 'page.root',
    },
    result: {
      summary: {
        targetSignature: 'page.root',
        pageGroups: [
          {
            pageSignature: '$',
            pageUse: 'RootPageModel',
            tabCount: 0,
            tabTitles: [],
            tabs: [],
          },
        ],
        tabCount: 0,
        tabTitles: [],
      },
    },
  });
  finishRun({
    logPath: started.logPath,
    status: 'success',
    summary: 'save looked good',
  });

  const result = renderReport({
    logPath: started.logPath,
    outDir,
    formats: 'md',
    improvementLogPath,
  });
  const markdown = fs.readFileSync(result.markdownPath, 'utf8');

  assert.match(markdown, /## 写后回读/);
  assert.match(markdown, /page \$ tabCount write=4，readback=0/);
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

  const output = execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
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
      cwd: SKILL_ROOT,
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
