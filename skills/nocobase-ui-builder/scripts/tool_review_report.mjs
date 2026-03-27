#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BUILDER_STATE_DIR, resolveSessionPaths } from './session_state.mjs';
import {
  resolveLatestRunPath,
} from './tool_journal.mjs';

export const DEFAULT_REPORT_DIR = path.join(
  DEFAULT_BUILDER_STATE_DIR,
  'reports',
);

export const DEFAULT_IMPROVEMENT_LOG_PATH = path.join(
  DEFAULT_BUILDER_STATE_DIR,
  'improvement-log.jsonl',
);

const WRITE_SIDE_EFFECT_TOOLS = new Set([
  'PostDesktoproutes_createv2',
  'PostDesktoproutes_destroyv2',
  'PostFlowmodels_save',
  'PostFlowmodels_ensure',
  'PostFlowmodels_mutate',
  'PostFlowmodels_move',
  'PostFlowmodels_destroy',
  'PostFlowmodels_attach',
  'PostFlowmodels_duplicate',
]);

const AUTO_MISMATCH_TOOLS = new Set([
  'PostFlowmodels_save',
  'PostFlowmodels_ensure',
  'PostFlowmodels_mutate',
]);

const DISCOVERY_TOOL_NAMES = new Set([
  'PostFlowmodels_schemabundle',
  'PostFlowmodels_schemas',
  'GetFlowmodels_schema',
  'GetFlowmodels_findone',
]);

const GUARD_AUDIT_TOOL_NAME = 'flow_payload_guard.audit-payload';
const GUARD_CANONICALIZE_TOOL_NAME = 'flow_payload_guard.canonicalize-payload';
const ROUTE_READY_TOOL_NAMES = new Set([
  'GetDesktoproutes_getaccessible',
  'GetDesktoproutes_listaccessible',
]);
const BROWSER_PHASE_NAMES = new Set([
  'browser_attach',
  'smoke',
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/tool_review_report.mjs render [--log-path <path>] [--latest-run-path <path>] [--session-id <id>] [--session-root <path>] [--out-dir <path>] [--basename <name>] [--formats <md|html|both>] [--improvement-log-path <path>]',
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

function writeTextFile(filePath, content) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
}

function appendJsonLine(filePath, value) {
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function resolveReportDir(explicitPath, options = {}) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_REPORT_DIR;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return resolveSessionPaths(options).reportDir;
}

function resolveImprovementLogPath(explicitPath, options = {}) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_IMPROVEMENT_LOG_PATH;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return resolveSessionPaths(options).improvementLogPath;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeToolName(toolName) {
  if (typeof toolName !== 'string') {
    return '';
  }
  const normalized = toolName.trim();
  if (!normalized) {
    return '';
  }
  const parts = normalized.split('__').filter(Boolean);
  return parts.at(-1) ?? normalized;
}

function matchesToolName(recordOrToolName, expectedToolName) {
  const actualToolName = typeof recordOrToolName === 'string' ? recordOrToolName : recordOrToolName?.tool;
  return normalizeToolName(actualToolName) === expectedToolName;
}

export function loadJsonLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function resolveRunLogPath({
  logPath,
  latestRunPath,
  sessionId,
  sessionRoot,
}) {
  if (logPath) {
    return path.resolve(logPath);
  }
  const sessionOptions = { sessionId, sessionRoot };
  const resolvedLatestRunPath = resolveLatestRunPath(latestRunPath, sessionOptions);
  const manifestPath = fs.existsSync(resolvedLatestRunPath)
    ? resolvedLatestRunPath
    : '';
  if (!manifestPath) {
    throw new Error(
      `Latest run manifest was not found at "${resolvedLatestRunPath}"; provide --log-path explicitly`,
    );
  }
  const manifest = readJsonFile(manifestPath);
  if (!manifest.logPath) {
    throw new Error(`Latest run manifest "${manifestPath}" does not contain logPath`);
  }
  return path.resolve(manifest.logPath);
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatDuration(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) {
    return 'unknown';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds} s`;
  }
  return `${minutes}m ${seconds}s`;
}

function truncateText(value, limit = 280) {
  if (typeof value !== 'string') {
    return '';
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function compactJson(value, limit = 400) {
  if (value === undefined) {
    return '';
  }
  const text = JSON.stringify(value, null, 2);
  return truncateText(text, limit);
}

function normalizeItem(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (isPlainObject(value)) {
    return Object.entries(value)
      .filter(([, inner]) => inner !== undefined && inner !== null && inner !== '')
      .map(([key, inner]) => `${key}: ${inner}`)
      .join(' | ');
  }
  return '';
}

function normalizeUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }
  return normalized;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizeGateName(value) {
  return normalizeOptionalString(value)?.replaceAll('_', '-') ?? '';
}

function buildStatusAxis(status, detail) {
  return {
    status,
    detail,
  };
}

function formatCountLabel(count, noun) {
  return `${count} ${noun}`;
}

function normalizeAxisStatusInput(value, { truthyStatus = 'ready', falsyStatus = 'failed' } = {}) {
  if (typeof value === 'boolean') {
    return value ? truthyStatus : falsyStatus;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (isPlainObject(value) && typeof value.status === 'string' && value.status.trim()) {
    return value.status.trim();
  }
  return null;
}

function resolveExplicitAxisStatus(records, axisKey, options = {}) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    const containers = [record?.data, record?.result, record?.summary];
    for (const container of containers) {
      if (!isPlainObject(container)) {
        continue;
      }
      const fromStatusAxes = normalizeAxisStatusInput(container.statusAxes?.[axisKey], options);
      if (fromStatusAxes) {
        return buildStatusAxis(fromStatusAxes, `from ${record.type}`);
      }
      const directValue = normalizeAxisStatusInput(container[axisKey], options);
      if (directValue) {
        return buildStatusAxis(directValue, `from ${record.type}`);
      }
    }
  }
  return null;
}

function resultMentionsSchemaUid(value, schemaUid, { maxDepth = 6 } = {}) {
  const normalizedSchemaUid = normalizeOptionalString(schemaUid);
  if (!normalizedSchemaUid) {
    return false;
  }

  const queue = [{ value, depth: 0 }];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.depth > maxDepth) {
      continue;
    }
    if (typeof current.value === 'string') {
      if (current.value === normalizedSchemaUid || current.value === `tabs-${normalizedSchemaUid}`) {
        return true;
      }
      continue;
    }
    if (!current.value || typeof current.value !== 'object') {
      continue;
    }
    if (visited.has(current.value)) {
      continue;
    }
    visited.add(current.value);

    if (Array.isArray(current.value)) {
      current.value.forEach((item) => queue.push({ value: item, depth: current.depth + 1 }));
      continue;
    }

    for (const [key, inner] of Object.entries(current.value)) {
      if ((key === 'schemaUid' || key === 'filterByTk') && typeof inner === 'string') {
        if (inner === normalizedSchemaUid || inner === `tabs-${normalizedSchemaUid}`) {
          return true;
        }
      }
      queue.push({ value: inner, depth: current.depth + 1 });
    }
  }
  return false;
}

function extractCallSchemaUid(call, { includeFilterByTk = false } = {}) {
  const candidates = [
    call?.args?.requestBody?.schemaUid,
    call?.args?.schemaUid,
  ];
  if (includeFilterByTk) {
    candidates.push(call?.args?.filterByTk);
    candidates.push(call?.args?.requestBody?.filterByTk);
  }
  for (const candidate of candidates) {
    const normalized = normalizeOptionalString(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractRecordSchemaUid(record) {
  return normalizeOptionalString(record?.data?.schemaUid)
    ?? normalizeOptionalString(record?.schemaUid)
    ?? null;
}

function resolveRouteTarget(records, { start, finish, toolCalls, gateRecords }) {
  const candidates = new Map();

  const addCandidate = (schemaUid, source) => {
    const normalized = normalizeOptionalString(schemaUid);
    if (!normalized) {
      return;
    }
    const current = candidates.get(normalized) ?? new Set();
    current.add(source);
    candidates.set(normalized, current);
  };

  addCandidate(start?.schemaUid, 'start.schemaUid');
  addCandidate(finish?.data?.schemaUid, 'run_finished.data.schemaUid');

  for (const call of toolCalls) {
    if (matchesToolName(call, 'PostDesktoproutes_createv2')) {
      addCandidate(extractCallSchemaUid(call), 'createv2.args.schemaUid');
      continue;
    }
    if (ROUTE_READY_TOOL_NAMES.has(normalizeToolName(call.tool))) {
      addCandidate(extractCallSchemaUid(call, { includeFilterByTk: true }), `${normalizeToolName(call.tool)}.args`);
    }
  }

  for (const record of gateRecords) {
    addCandidate(extractRecordSchemaUid(record), `gate:${normalizeGateName(record.gate)}`);
  }

  for (const record of records) {
    if (record.type === 'note') {
      addCandidate(extractRecordSchemaUid(record), 'note.data.schemaUid');
    }
  }

  if (candidates.size === 1) {
    const [schemaUid, sources] = [...candidates.entries()][0];
    return {
      status: 'resolved',
      schemaUid,
      sources: [...sources].sort((left, right) => left.localeCompare(right)),
    };
  }

  if (candidates.size === 0) {
    return {
      status: 'missing',
      schemaUid: null,
      sources: [],
    };
  }

  return {
    status: 'ambiguous',
    schemaUid: null,
    sources: [...candidates.entries()]
      .map(([schemaUid, sources]) => `${schemaUid} <- ${[...sources].sort((left, right) => left.localeCompare(right)).join(', ')}`)
      .sort((left, right) => left.localeCompare(right)),
  };
}

function buildAbsolutePageUrl(adminBase, schemaUid) {
  const normalizedAdminBase = normalizeUrl(adminBase)?.replace(/\/+$/g, '');
  const normalizedSchemaUid = normalizeOptionalString(schemaUid);
  if (!normalizedAdminBase || !normalizedSchemaUid) {
    return null;
  }
  return `${normalizedAdminBase}/${encodeURIComponent(normalizedSchemaUid)}`;
}

function findFirstDerivedAdminBase(records) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    const containers = [record?.data, record?.result, record?.summary, record?.metadata];
    for (const container of containers) {
      if (!isPlainObject(container)) {
        continue;
      }
      const direct = normalizeUrl(container.adminBase);
      if (direct) {
        return direct;
      }
      const nested = normalizeUrl(container.instanceInventory?.adminBase);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function resolvePageUrl(records, { start, finish, routeReadySummary }) {
  const candidates = [];
  const pushCandidate = (url, source) => {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return;
    }
    if (!candidates.some((item) => item.url === normalized)) {
      candidates.push({ url: normalized, source });
    }
  };

  const inspectContainer = (container, source) => {
    if (!isPlainObject(container)) {
      return;
    }
    pushCandidate(container.pageUrl, `${source}.pageUrl`);
    if (isPlainObject(container.summary)) {
      pushCandidate(container.summary.pageUrl, `${source}.summary.pageUrl`);
    }
    if (isPlainObject(container.result)) {
      pushCandidate(container.result.pageUrl, `${source}.result.pageUrl`);
    }
  };

  inspectContainer(start?.metadata, 'run_started.metadata');
  inspectContainer(finish?.data, 'run_finished.data');

  for (const record of records) {
    inspectContainer(record?.data, `${record.type}.data`);
    inspectContainer(record?.result, `${record.type}.result`);
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  const adminBase = findFirstDerivedAdminBase(records);
  const derived = buildAbsolutePageUrl(adminBase, routeReadySummary?.targetSchemaUid ?? start?.schemaUid ?? finish?.data?.schemaUid);
  if (derived) {
    return {
      url: derived,
      source: 'derived from adminBase + schemaUid',
    };
  }

  return null;
}

function buildCountsByTool(toolCalls) {
  const counts = new Map();
  for (const call of toolCalls) {
    const current = counts.get(call.tool) ?? { total: 0, ok: 0, error: 0, skipped: 0 };
    current.total += 1;
    if (call.status === 'error') {
      current.error += 1;
    } else if (call.status === 'skipped') {
      current.skipped += 1;
    } else {
      current.ok += 1;
    }
    counts.set(call.tool, current);
  }
  return [...counts.entries()]
    .map(([tool, count]) => ({ tool, ...count }))
    .sort((left, right) => right.total - left.total || left.tool.localeCompare(right.tool));
}

function normalizeTargetSignature(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getExplicitTargetSignature(call) {
  return normalizeTargetSignature(call.args?.targetSignature);
}

function getWeakReadTargetSignature(call) {
  if (!matchesToolName(call, 'GetFlowmodels_findone')) {
    return null;
  }
  const parentId = call.args?.parentId ?? 'unknown-parent';
  const subKey = call.args?.subKey ?? 'unknown-subKey';
  return `${parentId}::${subKey}`;
}

function detectRepeatedRuns(toolCalls) {
  const repeated = [];
  let currentKey = null;
  let currentLabel = null;
  let currentCount = 0;
  for (const call of toolCalls) {
    const signature = getWeakReadTargetSignature(call);
    const key = signature ? `${call.tool}::${signature}` : call.tool;
    const label = signature ? `${call.tool} (${signature})` : call.tool;
    if (key === currentKey) {
      currentCount += 1;
      continue;
    }
    if (currentLabel && currentCount >= 3) {
      repeated.push({ tool: currentLabel, count: currentCount });
    }
    currentKey = key;
    currentLabel = label;
    currentCount = 1;
  }
  if (currentLabel && currentCount >= 3) {
    repeated.push({ tool: currentLabel, count: currentCount });
  }
  return repeated;
}

function countTool(toolCalls, toolName) {
  return toolCalls.filter((record) => matchesToolName(record, toolName)).length;
}

function buildFindoneTargetCounts(toolCalls) {
  const counts = new Map();
  for (const call of toolCalls) {
    const signature = getWeakReadTargetSignature(call);
    if (!signature) {
      continue;
    }
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return [...counts.entries()].map(([target, count]) => ({ target, count }));
}

function getGuardAuditResult(call) {
  if (!matchesToolName(call, GUARD_AUDIT_TOOL_NAME) || !isPlainObject(call.result)) {
    return null;
  }
  return {
    blockers: Array.isArray(call.result.blockers) ? call.result.blockers : [],
    warnings: Array.isArray(call.result.warnings) ? call.result.warnings : [],
    acceptedRiskCodes: Array.isArray(call.result.acceptedRiskCodes) ? call.result.acceptedRiskCodes : [],
    mode: call.result.mode ?? call.args?.mode ?? 'unknown',
  };
}

function getRiskAcceptInfo(note) {
  const data = isPlainObject(note.data) ? note.data : {};
  const codes = Array.isArray(data.codes)
    ? data.codes.filter((value) => typeof value === 'string' && value.trim())
    : [];
  if (data.type === 'risk_accept' && codes.length > 0) {
    return {
      codes,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    };
  }
  return null;
}

function buildGuardSummary(records) {
  const summary = {
    hasCanonicalize: false,
    hasGuardAudit: false,
    canonicalizeCount: 0,
    auditCount: 0,
    blockerCount: 0,
    warningCount: 0,
    acceptedRiskCodeCount: 0,
    riskAcceptCount: 0,
    violations: [],
    createPageAfterBlockerCount: 0,
  };

  let pendingBlockerAudit = null;
  let pendingRiskAccept = null;

  for (const record of records) {
    if (record.type === 'tool_call' && matchesToolName(record, GUARD_CANONICALIZE_TOOL_NAME)) {
      summary.hasCanonicalize = true;
      summary.canonicalizeCount += 1;
      continue;
    }

    if (record.type === 'tool_call' && matchesToolName(record, GUARD_AUDIT_TOOL_NAME)) {
      const result = getGuardAuditResult(record);
      summary.hasGuardAudit = true;
      summary.auditCount += 1;
      if (result) {
        summary.blockerCount += result.blockers.length;
        summary.warningCount += result.warnings.length;
        summary.acceptedRiskCodeCount += result.acceptedRiskCodes.length;
        pendingRiskAccept = null;
        pendingBlockerAudit = result.blockers.length > 0
          ? {
            timestamp: record.timestamp,
            blockerCodes: result.blockers.map((item) => item.code).filter(Boolean),
          }
          : null;
      } else {
        pendingRiskAccept = null;
        pendingBlockerAudit = null;
      }
      continue;
    }

    if (record.type === 'note') {
      const riskAccept = getRiskAcceptInfo(record);
      if (riskAccept) {
        summary.riskAcceptCount += 1;
        if (pendingBlockerAudit && riskAccept.codes.some((code) => pendingBlockerAudit.blockerCodes.includes(code))) {
          pendingRiskAccept = {
            timestamp: record.timestamp,
            codes: riskAccept.codes,
          };
        }
      }
      continue;
    }

    if (record.type === 'tool_call' && WRITE_SIDE_EFFECT_TOOLS.has(normalizeToolName(record.tool)) && pendingBlockerAudit) {
      summary.violations.push({
        auditTimestamp: pendingBlockerAudit.timestamp,
        writeTimestamp: record.timestamp,
        writeTool: normalizeToolName(record.tool),
        blockerCodes: pendingBlockerAudit.blockerCodes,
        riskAcceptTimestamp: pendingRiskAccept?.timestamp,
        violationType: pendingRiskAccept ? 'risk_accept_without_reaudit' : 'write_after_blocker',
      });
      pendingRiskAccept = null;
      pendingBlockerAudit = null;
    }
  }

  summary.writeAfterBlockerWithoutRiskAcceptCount = summary.violations.length;
  summary.createPageAfterBlockerCount = summary.violations.filter((item) => item.writeTool === 'PostDesktoproutes_createv2').length;
  return summary;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
}

function getStructuredTreeSummary(call) {
  const summary = call?.result?.summary;
  return isPlainObject(summary) ? summary : null;
}

function buildPageGroupMap(summary) {
  const map = new Map();
  const pageGroups = Array.isArray(summary?.pageGroups) ? summary.pageGroups : [];
  pageGroups.forEach((pageGroup) => {
    if (!isPlainObject(pageGroup)) {
      return;
    }
    const key = typeof pageGroup.pageSignature === 'string' && pageGroup.pageSignature.trim()
      ? pageGroup.pageSignature.trim()
      : null;
    if (!key || map.has(key)) {
      return;
    }
    map.set(key, pageGroup);
  });
  return map;
}

function compareStructuredSummaries(writeSummary, readSummary) {
  const evidence = [];
  const writePageGroups = buildPageGroupMap(writeSummary);
  const readPageGroups = buildPageGroupMap(readSummary);

  for (const [pageSignature, writePageGroup] of writePageGroups.entries()) {
    const readPageGroup = readPageGroups.get(pageSignature);
    if (!readPageGroup) {
      evidence.push(`write.pageGroups[${pageSignature}] exists, readback missing`);
      continue;
    }

    if (
      typeof writePageGroup.pageUse === 'string'
      && typeof readPageGroup.pageUse === 'string'
      && writePageGroup.pageUse !== readPageGroup.pageUse
    ) {
      evidence.push(`page ${pageSignature} use write=${writePageGroup.pageUse}, readback=${readPageGroup.pageUse}`);
    }

    const writeTabCount = Number.isFinite(writePageGroup.tabCount) ? writePageGroup.tabCount : null;
    const readTabCount = Number.isFinite(readPageGroup.tabCount) ? readPageGroup.tabCount : null;
    if (writeTabCount !== null && readTabCount !== null && writeTabCount !== readTabCount) {
      evidence.push(`page ${pageSignature} tabCount write=${writeTabCount}, readback=${readTabCount}`);
    }

    const writeTabTitles = normalizeStringList(writePageGroup.tabTitles);
    const readTabTitles = normalizeStringList(readPageGroup.tabTitles);
    if (
      writeTabTitles.length > 0
      && readTabTitles.length > 0
      && JSON.stringify(writeTabTitles) !== JSON.stringify(readTabTitles)
    ) {
      evidence.push(`page ${pageSignature} tabTitles write=${writeTabTitles.join(' / ')}, readback=${readTabTitles.join(' / ')}`);
    }

    const readTabsByTitle = new Map();
    normalizeArray(readPageGroup.tabs).forEach((tab, tabIndex) => {
      const title = typeof tab?.title === 'string' && tab.title.trim() ? tab.title.trim() : `#${tabIndex}`;
      if (!readTabsByTitle.has(title)) {
        readTabsByTitle.set(title, tab);
      }
    });

    normalizeArray(writePageGroup.tabs).forEach((tab, tabIndex) => {
      const title = typeof tab?.title === 'string' && tab.title.trim() ? tab.title.trim() : `#${tabIndex}`;
      const readTab = readTabsByTitle.get(title);
      if (!readTab) {
        evidence.push(`page ${pageSignature} tab ${title} exists, readback missing`);
        return;
      }
      if (tab.hasBlockGrid !== readTab.hasBlockGrid) {
        evidence.push(`page ${pageSignature} tab ${title} hasBlockGrid write=${String(tab.hasBlockGrid)}, readback=${String(readTab.hasBlockGrid)}`);
      }
    });
  }

  for (const [pageSignature] of readPageGroups.entries()) {
    if (!writePageGroups.has(pageSignature)) {
      evidence.push(`readback.pageGroups[${pageSignature}] exists, write missing`);
    }
  }

  const writeTopLevelUses = normalizeStringList(writeSummary?.topLevelUses);
  const readTopLevelUses = normalizeStringList(readSummary?.topLevelUses);
  if (
    writeTopLevelUses.length > 0
    && readTopLevelUses.length > 0
    && JSON.stringify(writeTopLevelUses) !== JSON.stringify(readTopLevelUses)
  ) {
    evidence.push(`write.topLevelUses=${writeTopLevelUses.join(' / ')}, readback.topLevelUses=${readTopLevelUses.join(' / ')}`);
  }

  return evidence;
}

function buildEvidenceInsufficientItem({
  writeCall,
  readbackCall = null,
  targetSignature = null,
  reasonCode,
  detail,
}) {
  return {
    writeTool: writeCall.tool,
    writeTimestamp: writeCall.timestamp,
    writeSummary: writeCall.summary,
    readTool: readbackCall?.tool,
    readbackTimestamp: readbackCall?.timestamp,
    readbackSummary: readbackCall?.summary,
    targetSignature,
    reasonCode,
    detail,
  };
}

function buildPostWriteReadbackAnalysis(toolCalls) {
  const mismatches = [];
  const evidenceInsufficient = [];
  const matched = [];

  for (let index = 0; index < toolCalls.length; index += 1) {
    const writeCall = toolCalls[index];
    if (!AUTO_MISMATCH_TOOLS.has(normalizeToolName(writeCall.tool))) {
      continue;
    }

    const writeTargetSignature = getExplicitTargetSignature(writeCall);
    if (!writeTargetSignature) {
      evidenceInsufficient.push(buildEvidenceInsufficientItem({
        writeCall,
        reasonCode: 'WRITE_TARGET_SIGNATURE_MISSING',
        detail: `${writeCall.tool} needs an explicit args.targetSignature before it can join automatic write-after-read reconciliation.`,
      }));
      continue;
    }

    let readbackCall = null;
    let unsignedFindoneSeen = false;
    for (let cursor = index + 1; cursor < toolCalls.length; cursor += 1) {
      const candidate = toolCalls[cursor];
      if (WRITE_SIDE_EFFECT_TOOLS.has(normalizeToolName(candidate.tool))) {
        break;
      }
      if (!matchesToolName(candidate, 'GetFlowmodels_findone')) {
        continue;
      }
      const readTargetSignature = getExplicitTargetSignature(candidate);
      if (!readTargetSignature) {
        unsignedFindoneSeen = true;
        continue;
      }
      if (readTargetSignature === writeTargetSignature) {
        readbackCall = candidate;
        break;
      }
    }

    if (!readbackCall) {
      if (unsignedFindoneSeen) {
        evidenceInsufficient.push(buildEvidenceInsufficientItem({
          writeCall,
          targetSignature: writeTargetSignature,
          reasonCode: 'READBACK_TARGET_SIGNATURE_MISSING',
          detail: 'A later GetFlowmodels_findone exists, but it has no explicit args.targetSignature, so the matching-target readback cannot be paired safely.',
        }));
      } else {
        evidenceInsufficient.push(buildEvidenceInsufficientItem({
          writeCall,
          targetSignature: writeTargetSignature,
          reasonCode: 'READBACK_MISSING',
          detail: 'No same-target GetFlowmodels_findone readback was found before the next side-effect write or the end of the run.',
        }));
      }
      continue;
    }

    const writeSummary = getStructuredTreeSummary(writeCall);
    const readSummary = getStructuredTreeSummary(readbackCall);
    if (!writeSummary || !readSummary) {
      evidenceInsufficient.push(buildEvidenceInsufficientItem({
        writeCall,
        readbackCall,
        targetSignature: writeTargetSignature,
        reasonCode: 'SUMMARY_MISSING',
        detail: 'At least one side of the write/readback pair is missing result.summary, so structured reconciliation cannot run.',
      }));
      continue;
    }

    if (
      normalizeTargetSignature(writeSummary.targetSignature) !== writeTargetSignature
      || normalizeTargetSignature(readSummary.targetSignature) !== writeTargetSignature
    ) {
      evidenceInsufficient.push(buildEvidenceInsufficientItem({
        writeCall,
        readbackCall,
        targetSignature: writeTargetSignature,
        reasonCode: 'SUMMARY_TARGET_SIGNATURE_MISMATCH',
        detail: 'result.summary.targetSignature does not match tool_call.args.targetSignature, so the reconciliation target cannot be confirmed.',
      }));
      continue;
    }

    const evidence = compareStructuredSummaries(writeSummary, readSummary);
    if (evidence.length === 0) {
      matched.push({
        writeTool: normalizeToolName(writeCall.tool),
        readTool: normalizeToolName(readbackCall.tool),
        targetSignature: writeTargetSignature,
      });
      continue;
    }

    mismatches.push({
      writeTool: normalizeToolName(writeCall.tool),
      writeTimestamp: writeCall.timestamp,
      writeSummary: writeCall.summary,
      readTool: normalizeToolName(readbackCall.tool),
      readbackTimestamp: readbackCall.timestamp,
      readbackSummary: readbackCall.summary,
      targetSignature: writeTargetSignature,
      evidence,
    });
  }

  return {
    mismatches,
    evidenceInsufficient,
    matched,
  };
}

function buildPhaseSummary(records) {
  const phaseRecords = records.filter((record) => record.type === 'phase');
  const pendingStarts = new Map();
  const spans = [];

  for (const record of phaseRecords) {
    if (record.event === 'start') {
      const queue = pendingStarts.get(record.phase) ?? [];
      queue.push(record);
      pendingStarts.set(record.phase, queue);
      continue;
    }
    if (record.event !== 'end') {
      continue;
    }
    const queue = pendingStarts.get(record.phase) ?? [];
    const startRecord = queue.shift() ?? null;
    pendingStarts.set(record.phase, queue);
    const startedAt = toDate(startRecord?.timestamp);
    const endedAt = toDate(record.timestamp);
    const durationMs = startedAt && endedAt ? endedAt.getTime() - startedAt.getTime() : null;
    spans.push({
      phase: record.phase,
      startedAt: startRecord?.timestamp ?? null,
      finishedAt: record.timestamp ?? null,
      durationMs,
      durationLabel: formatDuration(durationMs),
      status: record.status ?? startRecord?.status ?? 'unknown',
      attributes: {
        ...(isPlainObject(startRecord?.attributes) ? startRecord.attributes : {}),
        ...(isPlainObject(record.attributes) ? record.attributes : {}),
      },
    });
  }

  const totals = new Map();
  for (const span of spans) {
    const current = totals.get(span.phase) ?? {
      phase: span.phase,
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
    current.count += 1;
    if (typeof span.durationMs === 'number' && !Number.isNaN(span.durationMs)) {
      current.totalDurationMs += span.durationMs;
      current.maxDurationMs = Math.max(current.maxDurationMs, span.durationMs);
    }
    totals.set(span.phase, current);
  }

  const orderedTotals = [...totals.values()]
    .map((item) => ({
      ...item,
      totalDurationLabel: formatDuration(item.totalDurationMs),
      maxDurationLabel: formatDuration(item.maxDurationMs),
    }))
    .sort((left, right) => right.totalDurationMs - left.totalDurationMs || left.phase.localeCompare(right.phase));

  return {
    spans,
    totals: orderedTotals,
  };
}

function buildCacheSummary(records) {
  const cacheEvents = records.filter((record) => record.type === 'cache_event');
  const summary = {
    total: cacheEvents.length,
    hitCount: 0,
    missCount: 0,
    storeCount: 0,
    invalidateCount: 0,
    byKind: {},
  };

  for (const record of cacheEvents) {
    if (record.action === 'cache_hit') {
      summary.hitCount += 1;
    } else if (record.action === 'cache_miss') {
      summary.missCount += 1;
    } else if (record.action === 'cache_store') {
      summary.storeCount += 1;
    } else if (record.action === 'cache_invalidate') {
      summary.invalidateCount += 1;
    }

    const key = record.kind ?? 'unknown';
    const current = summary.byKind[key] ?? {
      total: 0,
      hits: 0,
      misses: 0,
      stores: 0,
      invalidates: 0,
    };
    current.total += 1;
    if (record.action === 'cache_hit') current.hits += 1;
    if (record.action === 'cache_miss') current.misses += 1;
    if (record.action === 'cache_store') current.stores += 1;
    if (record.action === 'cache_invalidate') current.invalidates += 1;
    summary.byKind[key] = current;
  }

  const attempts = summary.hitCount + summary.missCount;
  summary.hitRatio = attempts > 0 ? Number((summary.hitCount / attempts).toFixed(3)) : null;
  return summary;
}

function buildGateSummaryRecords(records) {
  const gateRecords = records
    .filter((record) => record.type === 'gate')
    .map((record) => ({
      ...record,
      gate: normalizeGateName(record.gate),
    }));
  return {
    total: gateRecords.length,
    passed: gateRecords.filter((record) => record.status === 'passed').length,
    failed: gateRecords.filter((record) => record.status === 'failed').length,
    stopped: gateRecords.filter((record) => record.stoppedRemainingWork).length,
    records: gateRecords,
  };
}

function buildRouteReadySummary(records, { start, finish, toolCalls, gateRecords }) {
  const target = resolveRouteTarget(records, {
    start,
    finish,
    toolCalls,
    gateRecords,
  });
  const createCalls = toolCalls.filter((record) => matchesToolName(record, 'PostDesktoproutes_createv2'));
  const targetSchemaUid = target.schemaUid;

  const createSuccessCalls = createCalls.filter((record) => {
    if (target.status === 'resolved') {
      return extractCallSchemaUid(record) === targetSchemaUid && record.status !== 'error' && record.status !== 'skipped';
    }
    return record.status !== 'error' && record.status !== 'skipped';
  });
  const createErrorCalls = createCalls.filter((record) => {
    if (target.status === 'resolved') {
      return extractCallSchemaUid(record) === targetSchemaUid && record.status === 'error';
    }
    return record.status === 'error';
  });

  const routeReadCalls = [];
  const routeReadTools = new Set();
  const routeReadEvidenceInsufficient = [];
  const routeReadCandidates = toolCalls.filter((record) => ROUTE_READY_TOOL_NAMES.has(normalizeToolName(record.tool)));
  for (const record of routeReadCandidates) {
    if (target.status !== 'resolved') {
      routeReadEvidenceInsufficient.push(`${normalizeToolName(record.tool)}: target schemaUid ${target.status}`);
      continue;
    }
    const boundSchemaUid = extractCallSchemaUid(record, { includeFilterByTk: true });
    const isExplicitMatch = boundSchemaUid === targetSchemaUid;
    const mentionsTargetInResult = resultMentionsSchemaUid(record.result, targetSchemaUid);
    if ((isExplicitMatch || mentionsTargetInResult) && record.status !== 'error' && record.status !== 'skipped') {
      routeReadCalls.push(record);
      routeReadTools.add(normalizeToolName(record.tool));
      continue;
    }
    routeReadEvidenceInsufficient.push(`${normalizeToolName(record.tool)}: no explicit target binding for ${targetSchemaUid}`);
  }

  const preOpenGateRecords = [];
  const preOpenEvidenceInsufficient = [];
  for (const record of gateRecords.filter((item) => item.gate === 'pre-open')) {
    if (target.status !== 'resolved') {
      preOpenEvidenceInsufficient.push(`pre-open: target schemaUid ${target.status}`);
      continue;
    }
    const gateSchemaUid = extractRecordSchemaUid(record);
    if (!gateSchemaUid || gateSchemaUid === targetSchemaUid) {
      preOpenGateRecords.push(record);
      continue;
    }
    preOpenEvidenceInsufficient.push(`pre-open: schemaUid ${gateSchemaUid} does not match ${targetSchemaUid}`);
  }

  return {
    target,
    targetSchemaUid,
    createPageCount: createCalls.length,
    createSuccessCount: createSuccessCalls.length,
    createErrorCount: createErrorCalls.length,
    routeReadCount: routeReadCalls.length,
    routeReadTotalCount: routeReadCandidates.length,
    preOpenGateCount: preOpenGateRecords.length,
    preOpenGateTotalCount: gateRecords.filter((record) => record.gate === 'pre-open').length,
    routeReadTools: [...routeReadTools].sort((left, right) => left.localeCompare(right)),
    routeReadEvidenceInsufficient,
    preOpenEvidenceInsufficient,
  };
}

function buildOptimizationItems({
  toolCalls,
  hasWrites,
  hasSchemaBundle,
  hasSchemas,
  hasFindone,
  guardSummary,
  firstWriteIndex,
  firstDiscoveryIndex,
  errors,
  readbackMismatches,
  readbackEvidenceInsufficient,
  repeatedRuns,
  missingSummaryCount,
  cacheSummary,
  phaseSummary,
  gateRecords,
  routeReadySummary,
}) {
  const items = [];
  const schemaReadCount = countTool(toolCalls, 'GetFlowmodels_schema');
  const repeatedFindoneTargets = buildFindoneTargetCounts(toolCalls).filter((item) => item.count >= 3);

  if (hasWrites && (!hasSchemaBundle || !hasSchemas || (firstDiscoveryIndex > firstWriteIndex && firstDiscoveryIndex !== -1))) {
    items.push({
      priority: 'high',
      title: 'Move discovery earlier and batch it',
      reason: 'Discovery was incomplete before the first write, or it started after the first write, which increases guesswork and rework.',
      fasterPath: 'Run one `PostFlowmodels_schemabundle` plus one `PostFlowmodels_schemas` before the first write. Only add `GetFlowmodels_schema` if the target model is still ambiguous.',
      evidence: [
        !hasSchemaBundle ? 'missing `PostFlowmodels_schemabundle`' : null,
        !hasSchemas ? 'missing `PostFlowmodels_schemas`' : null,
        firstDiscoveryIndex > firstWriteIndex && firstDiscoveryIndex !== -1 ? 'first discovery happened after the first write' : null,
      ].filter(Boolean),
    });
  }

  if (hasWrites && !guardSummary.hasGuardAudit) {
    items.push({
      priority: 'high',
      title: 'Run payload guard before the first write',
      reason: 'Writes happened without any recorded `flow_payload_guard.audit-payload` result, so a broken payload could reach persistence directly.',
      fasterPath: 'Before each write round, run `flow_payload_guard.extract-required-metadata` and `flow_payload_guard.audit-payload`. Stop immediately when a blocker appears.',
      evidence: ['missing `flow_payload_guard.audit-payload`'],
    });
  }

  if (hasWrites && !guardSummary.hasCanonicalize) {
    items.push({
      priority: 'high',
      title: 'Canonicalize before guard audit',
      reason: 'Writes happened without any recorded `flow_payload_guard.canonicalize-payload`, so legacy shapes and sample values could flow straight into audit or write stages.',
      fasterPath: 'Use a consistent `extract-required-metadata -> canonicalize-payload -> audit-payload -> write` pipeline so locally fixable issues converge before the final audit.',
      evidence: ['missing `flow_payload_guard.canonicalize-payload`'],
    });
  }

  if (guardSummary.writeAfterBlockerWithoutRiskAcceptCount > 0) {
    items.push({
      priority: 'high',
      title: 'Do not write past a blocker',
      reason: `${guardSummary.writeAfterBlockerWithoutRiskAcceptCount} invalid flows wrote even after guard reported a blocker.`,
      fasterPath: 'After guard reports a blocker, fix the payload first by default. Only continue when the risk is intentionally accepted, a risk-accept note is added, and the payload is re-audited.',
      evidence: guardSummary.violations.map((item) => `${item.writeTool} <- ${item.blockerCodes.join(', ')}`),
    });
  }

  if (guardSummary.createPageAfterBlockerCount > 0) {
    items.push({
      priority: 'high',
      title: 'Apply the same guard stop to createV2',
      reason: `${guardSummary.createPageAfterBlockerCount} runs still executed \`PostDesktoproutes_createv2\` after a guard blocker.`,
      fasterPath: 'Do not treat page-shell creation as a low-risk probe. When guard reports a blocker, createV2 must stop as well until the payload is fixed or re-audited.',
      evidence: guardSummary.violations
        .filter((item) => item.writeTool === 'PostDesktoproutes_createv2')
        .map((item) => `${item.writeTool} <- ${item.blockerCodes.join(', ')}`),
    });
  }

  if (routeReadySummary.createPageCount > 0 && (routeReadySummary.routeReadCount === 0 || routeReadySummary.preOpenGateCount === 0)) {
    items.push({
      priority: 'high',
      title: 'Complete route-ready and pre-open checks after createV2',
      reason: 'createV2 only means the page shell was persisted. It does not prove the new page is ready for first-open validation.',
      fasterPath: 'After createV2, read back the accessible route tree, confirm the page route and hidden tab are in sync, then run one pre-open gate. Without both signals, do not mark the page as success.',
      evidence: [
        routeReadySummary.routeReadCount === 0 ? 'missing `GetDesktoproutes_getaccessible/listaccessible`' : null,
        routeReadySummary.preOpenGateCount === 0 ? 'missing `pre-open` gate' : null,
      ].filter(Boolean),
    });
  }

  if (readbackMismatches.length > 0) {
    items.push({
      priority: 'high',
      title: 'Treat post-write readback mismatches as failures',
      reason: `${readbackMismatches.length} post-write readback mismatches were found, so optimistic save/mutate responses are not enough.`,
      fasterPath: 'Run same-target readback immediately after each write, and make `run_finished`, review copy, and final status follow readback facts. Downgrade directly to partial/failed when counts or titles differ.',
      evidence: readbackMismatches.flatMap((item) => item.evidence).slice(0, 4),
    });
  }

  if (readbackEvidenceInsufficient.length > 0) {
    items.push({
      priority: 'medium',
      title: 'Add targetSignature and summary for automatic reconciliation',
      reason: `${readbackEvidenceInsufficient.length} post-write pairs lacked enough evidence, so the automated flow could not confirm the write target or structural snapshot.`,
      fasterPath: 'Have both the write call and the matching GetFlowmodels_findone log args.targetSignature explicitly, and write the structured tree snapshot into result.summary. Do not keep reusing old logs for automatic mismatch detection.',
      evidence: readbackEvidenceInsufficient.slice(0, 4).map((item) => `${item.writeTool}:${item.reasonCode}`),
    });
  }

  if (schemaReadCount >= 3) {
    items.push({
      priority: 'high',
      title: 'Reduce repeated single-model schema reads',
      reason: `\`GetFlowmodels_schema\` was called ${schemaReadCount} times, which usually means too much single-model deep diving.`,
      fasterPath: 'Prefer one batched `PostFlowmodels_schemas`, and only fall back to a standalone `GetFlowmodels_schema` for the last still-unclear models.',
      evidence: [`GetFlowmodels_schema x${schemaReadCount}`],
    });
  }

  if (cacheSummary.total === 0 && (hasSchemaBundle || hasSchemas || schemaReadCount > 0)) {
    items.push({
      priority: 'high',
      title: 'Add cross-run caching for stable discovery results',
      reason: 'This run already performed schema/metadata discovery, but no cache hit or write-back was recorded.',
      fasterPath: 'Cache only schemaBundle, schemas, collection fields, and relation metadata. Keep live tree and runtime reads real-time.',
      evidence: [
        hasSchemaBundle ? 'ran `PostFlowmodels_schemabundle`' : null,
        hasSchemas ? 'ran `PostFlowmodels_schemas`' : null,
        schemaReadCount > 0 ? `GetFlowmodels_schema x${schemaReadCount}` : null,
      ].filter(Boolean),
    });
  }

  if (cacheSummary.total > 0 && cacheSummary.hitRatio !== null && cacheSummary.hitRatio < 0.5 && cacheSummary.missCount >= 2) {
    items.push({
      priority: 'medium',
      title: 'Improve stable-cache hit rate',
      reason: `The current cache hit rate is only ${Math.round(cacheSummary.hitRatio * 100)}%, so many stable discovery steps still use live reads.`,
      fasterPath: 'Reuse the stable metadata cache keyed by instanceFingerprint, and only invalidate selectively after collection/field writes.',
      evidence: [`cache_hit=${cacheSummary.hitCount}`, `cache_miss=${cacheSummary.missCount}`],
    });
  }

  const slowPhase = phaseSummary.totals[0] ?? null;
  if (slowPhase && slowPhase.totalDurationMs >= 20_000) {
    items.push({
      priority: 'medium',
      title: `Shrink the slowest phase: ${slowPhase.phase}`,
      reason: `The slowest phase took ${slowPhase.totalDurationLabel} in this run and is now the critical path.`,
      fasterPath: slowPhase.phase === 'browser_attach'
        ? 'Stabilize the main browser-attach path and reduce repeated attach/fallback attempts.'
        : slowPhase.phase === 'schema_discovery' || slowPhase.phase === 'stable_metadata'
          ? 'Prioritize stable-cache hits and batch schema/metadata discovery.'
          : 'Normalize the inputs of this phase earlier and reduce repeated reasoning or repeated reads.',
      evidence: [`${slowPhase.phase}=${slowPhase.totalDurationLabel}`],
    });
  }

  if (gateRecords.failed > 0) {
    items.push({
      priority: 'medium',
      title: 'Move gate decisions earlier',
      reason: `${gateRecords.failed} gates already failed in this run. If execution still continued afterward, the back half of the run became unnecessarily expensive.`,
      fasterPath: 'Stop immediately after write-after-read mismatches, pre-open blockers, or mandatory-stage failures.',
      evidence: gateRecords.records
        .filter((item) => item.status === 'failed')
        .map((item) => `${item.gate}:${item.reasonCode}`)
        .slice(0, 4),
    });
  }

  if (repeatedFindoneTargets.length > 0) {
    items.push({
      priority: 'medium',
      title: 'Reduce repeated live snapshot reads',
      reason: 'The same live target was read 3 or more times, which usually means some discovery steps could have been merged.',
      fasterPath: 'Default to one read before writing the target page and one read after writing. Use template pages only as a fallback when schema-first discovery cannot disambiguate.',
      evidence: repeatedFindoneTargets.map((item) => `${item.target} x${item.count}`),
    });
  }

  if (repeatedRuns.length > 0) {
    items.push({
      priority: 'medium',
      title: 'Merge consecutive duplicate calls',
      reason: 'Back-to-back duplicate reads usually mean the flow could be more direct, or some results were not reused.',
      fasterPath: 'Prefer caching or merging consecutive duplicate tool calls, or combine adjacent operations into one transactional write.',
      evidence: repeatedRuns.map((item) => `${item.tool} x${item.count}`),
    });
  }

  if (errors.length > 0) {
    items.push({
      priority: 'high',
      title: 'Capture the smallest successful template before failure',
      reason: `${errors.length} calls failed in this run, and repeated trial-and-error directly extends completion time.`,
      fasterPath: 'Turn the most recent successful schema/request body before each failure into a template. Next time, start from that template and change the minimum number of fields instead of guessing from an empty payload.',
      evidence: errors.slice(0, 3).map((item) => `${item.tool}: ${item.error ?? item.status ?? 'error'}`),
    });
  }

  if (hasWrites && !hasFindone) {
    items.push({
      priority: 'medium',
      title: 'Add pre-write live reads to reduce invalid rollbacks',
      reason: 'No live snapshot read was recorded before writing, so the current state may have been misread.',
      fasterPath: 'Before each change round, read the target page/grid once, then decide between patch and append. That reduces post-write repair work.',
      evidence: ['missing `GetFlowmodels_findone`'],
    });
  }

  if (missingSummaryCount > 0) {
    items.push({
      priority: 'low',
      title: 'Add a short summary to every tool call',
      reason: 'This does not directly reduce call count, but it makes removable steps much easier to spot.',
      fasterPath: 'Write a one-line summary for every `tool_call` so review can locate redundant steps faster.',
      evidence: [`records missing summary: ${missingSummaryCount}`],
    });
  }

  if (items.length === 0) {
    items.push({
      priority: 'low',
      title: 'Keep the current flow and keep watching for transaction merge opportunities',
      reason: 'No obvious detours were found in this run.',
      fasterPath: 'Keep watching for chances to compress adjacent create/update steps into a single `PostFlowmodels_mutate`.',
      evidence: ['no obvious detour pattern found'],
    });
  }

  return items;
}

function describeRouteTarget(target) {
  if (target.status === 'resolved') {
    return `schemaUid=${target.schemaUid}`;
  }
  if (target.sources.length > 0) {
    return target.sources.join('; ');
  }
  return 'schemaUid not recorded';
}

function summarizeStatusAxes({
  records,
  hasWrites,
  phaseRecords,
  gateSummary,
  routeReadySummary,
  readbackAnalysis,
}) {
  const pageShellExplicit = resolveExplicitAxisStatus(records, 'pageShellCreated', {
    truthyStatus: 'created',
    falsyStatus: 'failed',
  });
  const routeReadyExplicit = resolveExplicitAxisStatus(records, 'routeReady');
  const readbackExplicit = resolveExplicitAxisStatus(records, 'readbackMatched');
  const dataReadyExplicit = resolveExplicitAxisStatus(records, 'dataReady');
  const runtimeExplicit = resolveExplicitAxisStatus(records, 'runtimeUsable');
  const browserExplicit = resolveExplicitAxisStatus(records, 'browserValidation');
  const dataPreparationExplicit = resolveExplicitAxisStatus(records, 'dataPreparation', {
    truthyStatus: 'done',
    falsyStatus: 'failed',
  });

  const pageShellCreated = pageShellExplicit ?? (() => {
    if (routeReadySummary.createPageCount === 0) {
      return buildStatusAxis('not-recorded', '`PostDesktoproutes_createv2` was not recorded.');
    }
    if (routeReadySummary.target.status === 'ambiguous') {
      return buildStatusAxis('evidence-insufficient', `createV2 target is ambiguous: ${describeRouteTarget(routeReadySummary.target)}`);
    }
    if (routeReadySummary.createSuccessCount > 0) {
      return buildStatusAxis(
        'created',
        `${describeRouteTarget(routeReadySummary.target)}; createV2 succeeded ${formatCountLabel(routeReadySummary.createSuccessCount, 'times')}`,
      );
    }
    if (routeReadySummary.createErrorCount > 0) {
      return buildStatusAxis('failed', `${describeRouteTarget(routeReadySummary.target)}; createV2 failed ${formatCountLabel(routeReadySummary.createErrorCount, 'times')}`);
    }
    return buildStatusAxis('not-recorded', 'createV2 was detected, but no successful outcome could be confirmed.');
  })();

  const routeReady = routeReadyExplicit ?? (() => {
    if (routeReadySummary.createPageCount === 0 && routeReadySummary.routeReadTotalCount === 0) {
      return buildStatusAxis('not-recorded', 'No route-ready-related tool calls were recorded.');
    }
    if (routeReadySummary.target.status !== 'resolved' && (routeReadySummary.createPageCount > 0 || routeReadySummary.routeReadTotalCount > 0)) {
      return buildStatusAxis('evidence-insufficient', `route-ready target is unclear: ${describeRouteTarget(routeReadySummary.target)}`);
    }
    if (routeReadySummary.routeReadCount > 0) {
      return buildStatusAxis(
        'ready',
        `${describeRouteTarget(routeReadySummary.target)}; ${routeReadySummary.routeReadTools.join(' / ')} x${routeReadySummary.routeReadCount}`,
      );
    }
    if (routeReadySummary.routeReadTotalCount > 0 || routeReadySummary.routeReadEvidenceInsufficient.length > 0) {
      return buildStatusAxis(
        'evidence-insufficient',
        [...routeReadySummary.routeReadEvidenceInsufficient].slice(0, 2).join('; ') || 'Route-ready calls existed, but none was explicitly bound to the target page.',
      );
    }
    if (routeReadySummary.createSuccessCount > 0) {
      return buildStatusAxis('not-ready', `${describeRouteTarget(routeReadySummary.target)}; no route-ready evidence was recorded after createV2.`);
    }
    return buildStatusAxis('not-recorded', 'No route-ready conclusion was recorded.');
  })();

  const readbackMatched = readbackExplicit ?? (() => {
    if (readbackAnalysis.mismatches.length > 0) {
      return buildStatusAxis(
        'mismatch',
        `${formatCountLabel(readbackAnalysis.mismatches.length, 'pairs')} write-after-read mismatches`,
      );
    }
    if (readbackAnalysis.evidenceInsufficient.length > 0) {
      const detail = [
        readbackAnalysis.matched.length > 0 ? `matched ${readbackAnalysis.matched.length} pairs` : null,
        `evidence insufficient for ${readbackAnalysis.evidenceInsufficient.length} pairs`,
      ].filter(Boolean).join('; ');
      return buildStatusAxis('evidence-insufficient', detail);
    }
    if (readbackAnalysis.matched.length > 0) {
      return buildStatusAxis('matched', `${formatCountLabel(readbackAnalysis.matched.length, 'pairs')} matched readback`);
    }
    if (hasWrites) {
      return buildStatusAxis('not-recorded', 'Writes existed, but no decisive readback conclusion was produced.');
    }
    return buildStatusAxis('not-recorded', 'No write-after-read reconciliation was recorded.');
  })();

  const dataPreparation = dataPreparationExplicit ?? buildStatusAxis('not-recorded', 'No stable data-preparation signal was recorded in the log.');
  const dataReady = dataReadyExplicit ?? buildStatusAxis('not-recorded', 'No stable data-readiness signal was recorded in the log.');

  const browserPhaseRecords = phaseRecords.filter((record) => BROWSER_PHASE_NAMES.has(record.phase));
  const browserEndRecords = browserPhaseRecords.filter((record) => record.event === 'end');
  const browserGateRecords = gateSummary.records.filter((record) => record.gate === 'pre-open' || record.gate.startsWith('stage:'));
  const browserFailed = browserGateRecords.some((record) => record.status === 'failed')
    || browserEndRecords.some((record) => record.status === 'error');
  const browserPassed = browserGateRecords.some((record) => record.status === 'passed')
    || browserEndRecords.some((record) => record.status === 'ok');
  const browserSkippedOnly = browserEndRecords.length > 0
    && browserEndRecords.every((record) => record.status === 'skipped')
    && browserGateRecords.length === 0;
  const hasBrowserEvidence = browserPhaseRecords.length > 0 || browserGateRecords.length > 0;

  const browserValidation = browserExplicit ?? (() => {
    if (!hasBrowserEvidence) {
      return buildStatusAxis('skipped (not requested)', 'No browser_attach / smoke / pre-open / stage gate was recorded.');
    }
    if (browserFailed) {
      return buildStatusAxis('failed', `${formatCountLabel(browserGateRecords.filter((record) => record.status === 'failed').length, 'browser gates')} failed`);
    }
    if (browserSkippedOnly) {
      return buildStatusAxis('skipped', 'Browser phases were explicitly skipped.');
    }
    if (browserPassed) {
      return buildStatusAxis('passed', `${formatCountLabel(browserGateRecords.filter((record) => record.status === 'passed').length, 'browser gates')} passed`);
    }
    return buildStatusAxis('not-recorded', 'Browser-related phases were entered, but no decisive conclusion was produced.');
  })();

  const runtimeUsable = runtimeExplicit ?? (() => {
    if (!hasBrowserEvidence) {
      return buildStatusAxis('not-run', 'No browser-validation evidence exists.');
    }
    if (browserFailed) {
      return buildStatusAxis('failed', 'A browser gate or smoke phase failed.');
    }
    const runtimePassCount = browserGateRecords.filter((record) => record.gate.startsWith('stage:') && record.status === 'passed').length;
    const smokeOkCount = browserEndRecords.filter((record) => record.phase === 'smoke' && record.status === 'ok').length;
    if (runtimePassCount > 0 || smokeOkCount > 0) {
      return buildStatusAxis('usable', `stage pass ${runtimePassCount}; smoke ok ${smokeOkCount}`);
    }
    return buildStatusAxis('not-recorded', 'Only pre-open or attach evidence exists, which is not enough to confirm runtime usability.');
  })();

  return {
    pageShellCreated,
    routeReady,
    readbackMatched,
    dataReady,
    runtimeUsable,
    browserValidation,
    dataPreparation,
  };
}

export function analyzeRun(records, sourceLogPath) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('run log is empty');
  }

  const start = records.find((record) => record.type === 'run_started') ?? null;
  const finishCandidates = records.filter((record) => record.type === 'run_finished');
  const finish = finishCandidates.at(-1) ?? null;
  const toolCalls = records.filter((record) => record.type === 'tool_call');
  const notes = records.filter((record) => record.type === 'note');
  const phaseRecords = records.filter((record) => record.type === 'phase');
  const gateEvents = records.filter((record) => record.type === 'gate');
  const cacheEvents = records.filter((record) => record.type === 'cache_event');
  const errors = toolCalls.filter((record) => record.status === 'error' || record.error);
  const skipped = toolCalls.filter((record) => record.status === 'skipped');
  const timelineRecords = records.filter((record) => ['tool_call', 'note', 'phase', 'gate', 'cache_event'].includes(record.type));

  const startedAt = toDate(start?.startedAt);
  const finishedAt = toDate(finish?.timestamp);
  const lastEventAt = toDate(records.at(-1)?.timestamp ?? records.at(-1)?.startedAt);
  const durationMs = startedAt
    ? ((finishedAt ?? lastEventAt)?.getTime() ?? startedAt.getTime()) - startedAt.getTime()
    : null;

  const firstWriteIndex = toolCalls.findIndex((record) => WRITE_SIDE_EFFECT_TOOLS.has(normalizeToolName(record.tool)));
  const firstDiscoveryIndex = toolCalls.findIndex((record) => DISCOVERY_TOOL_NAMES.has(normalizeToolName(record.tool)));
  const hasWrites = firstWriteIndex >= 0;
  const hasSchemaBundle = toolCalls.some((record) => matchesToolName(record, 'PostFlowmodels_schemabundle'));
  const hasSchemas = toolCalls.some((record) => matchesToolName(record, 'PostFlowmodels_schemas'));
  const schemaReadCount = countTool(toolCalls, 'GetFlowmodels_schema');
  const hasFindone = toolCalls.some((record) => matchesToolName(record, 'GetFlowmodels_findone'));
  const guardSummary = buildGuardSummary(records);
  const readbackAnalysis = buildPostWriteReadbackAnalysis(toolCalls);
  const readbackMismatches = readbackAnalysis.mismatches;
  const readbackEvidenceInsufficient = readbackAnalysis.evidenceInsufficient;
  const repeatedRuns = detectRepeatedRuns(toolCalls);
  const missingSummaryCount = toolCalls.filter((record) => !record.summary).length;
  const phaseSummary = buildPhaseSummary(records);
  const cacheSummary = buildCacheSummary(records);
  const gateSummary = buildGateSummaryRecords(records);
  const routeReadySummary = buildRouteReadySummary(records, {
    start,
    finish,
    toolCalls,
    gateRecords: gateSummary.records,
  });
  const pageUrl = resolvePageUrl(records, {
    start,
    finish,
    routeReadySummary,
  });
  const statusAxes = summarizeStatusAxes({
    records,
    hasWrites,
    phaseRecords,
    gateSummary,
    routeReadySummary,
    readbackAnalysis,
  });

  const suggestions = [];
  if (!finish) {
    suggestions.push('This log has no `run_finished` record, so execution did not close cleanly.');
  }
  if (errors.length > 0) {
    suggestions.push(`${errors.length} calls failed. Check the failed args, error, and surrounding context first.`);
  }
  if (hasWrites && !hasSchemaBundle) {
    suggestions.push('Writes existed, but `PostFlowmodels_schemabundle` was not recorded. Add the missing discovery cold start.');
  }
  if (hasWrites && !hasSchemas) {
    suggestions.push('Writes existed, but `PostFlowmodels_schemas` was not recorded. Read the precise model documents before persistence.');
  }
  if (hasWrites && !hasFindone) {
    suggestions.push('Writes existed, but `GetFlowmodels_findone` was not recorded. Capture a live snapshot before and after every change.');
  }
  if (hasWrites && !guardSummary.hasGuardAudit) {
    suggestions.push('Writes existed, but `flow_payload_guard.audit-payload` was not recorded. Add one payload audit before the first write.');
  }
  if (hasWrites && !guardSummary.hasCanonicalize) {
    suggestions.push('Writes existed, but `flow_payload_guard.canonicalize-payload` was not recorded. Canonicalize locally before the final audit.');
  }
  if (guardSummary.writeAfterBlockerWithoutRiskAcceptCount > 0) {
    suggestions.push(`${guardSummary.writeAfterBlockerWithoutRiskAcceptCount} invalid flows kept writing after guard reported a blocker. Fix the payload first or record an explicit risk-accept.`);
  }
  if (guardSummary.createPageAfterBlockerCount > 0) {
    suggestions.push(`${guardSummary.createPageAfterBlockerCount} runs still executed \`PostDesktoproutes_createv2\` after a guard blocker. Page-shell creation must obey the same guard gate.`);
  }
  if (guardSummary.riskAcceptCount > 0) {
    suggestions.push(`This run used risk-accept ${guardSummary.riskAcceptCount} times. Review whether those exemptions can be reduced further.`);
  }
  if (readbackMismatches.length > 0) {
    suggestions.push(`${readbackMismatches.length} post-write readback mismatches were found. Do not keep treating save/mutate responses as final success evidence.`);
  }
  if (readbackEvidenceInsufficient.length > 0) {
    suggestions.push(`${readbackEvidenceInsufficient.length} post-write pairs lacked enough reconciliation evidence. Safe automation needs explicit args.targetSignature and result.summary.`);
  }
  if (hasWrites && firstDiscoveryIndex > firstWriteIndex && firstDiscoveryIndex !== -1) {
    suggestions.push('The first discovery happened after the first write. Move discovery earlier.');
  }
  if (repeatedRuns.length > 0) {
    suggestions.push(
      `Consecutive duplicate calls were found: ${repeatedRuns.map((item) => `${item.tool} x${item.count}`).join(', ')}. Consider merging steps or reducing repeated reads.`,
    );
  }
  if (missingSummaryCount > 0) {
    suggestions.push(`${missingSummaryCount} tool_call records are missing ` + '`summary`' + ', which reduces review readability.');
  }
  if (phaseSummary.spans.length === 0) {
    suggestions.push('No phase span was recorded in this run, so the critical path cannot be determined. At minimum, record schema_discovery, write, readback, browser_attach, and smoke.');
  }
  if (cacheSummary.total === 0 && (hasSchemaBundle || hasSchemas || schemaReadCount > 0)) {
    suggestions.push('No stable-cache event was recorded in this run, so schema/metadata discovery may still be repeating live requests.');
  }
  if (gateSummary.failed > 0) {
    suggestions.push(`${gateSummary.failed} gates failed in this run. Confirm that later actions really stopped afterward.`);
  }
  if (routeReadySummary.createPageCount > 0 && routeReadySummary.routeReadCount === 0) {
    suggestions.push('`PostDesktoproutes_createv2` exists, but no accessible-route readback was recorded. Confirm that the new page and hidden tab have entered the route tree before first open.');
  }
  if (routeReadySummary.createPageCount > 0 && routeReadySummary.preOpenGateCount === 0) {
    suggestions.push('`PostDesktoproutes_createv2` exists, but no `pre-open` gate was recorded. Treat “page can open for the first time, is not blank, and is not stuck on skeleton loading” as an independent blocking condition.');
  }
  if (routeReadySummary.routeReadEvidenceInsufficient.length > 0 || routeReadySummary.preOpenEvidenceInsufficient.length > 0) {
    suggestions.push('Some route-ready / pre-open evidence was not explicitly bound to the target page. Record schemaUid in the log to avoid cross-page or cross-session confusion.');
  }
  if (suggestions.length === 0) {
    suggestions.push('The log structure is complete. Keep optimizing from three angles: failure rate, repeated calls, and discovery order.');
  }

  const optimizationItems = buildOptimizationItems({
    toolCalls,
    hasWrites,
    hasSchemaBundle,
    hasSchemas,
    hasFindone,
    guardSummary,
    readbackMismatches,
    readbackEvidenceInsufficient,
    firstWriteIndex,
    firstDiscoveryIndex,
    errors,
    repeatedRuns,
    missingSummaryCount,
    cacheSummary,
    phaseSummary,
    gateRecords: gateSummary,
    routeReadySummary,
  });

  return {
    sourceLogPath,
    generatedAt: nowIso(),
    start,
    finish,
    pageUrl,
    durationMs,
    durationLabel: formatDuration(durationMs),
    totalEvents: records.length,
    totalToolCalls: toolCalls.length,
    totalNotes: notes.length,
    totalPhases: phaseRecords.length,
    totalGates: gateEvents.length,
    totalCacheEvents: cacheEvents.length,
    errorCount: errors.length,
    skippedCount: skipped.length,
    timelineRecords,
    toolCalls,
    notes,
    errors,
    guardSummary,
    phaseSummary,
    cacheSummary,
    gateSummary,
    routeReadySummary,
    pageUrl,
    statusAxes,
    readbackMismatches,
    readbackEvidenceInsufficient,
    countsByTool: buildCountsByTool(toolCalls),
    suggestions,
    optimizationItems,
  };
}

function getStatusAxisEntries(summary) {
  return Object.entries(summary.statusAxes ?? {}).map(([axis, value]) => ({
    axis,
    status: value?.status ?? 'not-recorded',
    detail: value?.detail ?? '',
  }));
}

function renderImprovementMarkdown(summary) {
  const lines = [
    '# NocoBase UI Builder Improvement List',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Log file: \`${summary.sourceLogPath}\``,
    `- Task: ${summary.start?.task ?? 'unknown'}`,
    `- Run ID: \`${summary.start?.runId ?? 'unknown'}\``,
    '',
    '## Priority Improvements',
    '',
  ];

  for (const [index, item] of summary.optimizationItems.entries()) {
    lines.push(`### ${index + 1}. [${item.priority}] ${item.title}`);
    lines.push('');
    lines.push(`- Reason: ${item.reason}`);
    lines.push(`- Faster path: ${item.fasterPath}`);
    if (item.evidence?.length) {
      lines.push(`- Evidence: ${item.evidence.join('; ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildImprovementSnapshot(summary, improvementLogPath) {
  return {
    type: 'improvement_snapshot',
    generatedAt: summary.generatedAt,
    runId: summary.start?.runId,
    task: summary.start?.task,
    logPath: summary.sourceLogPath,
    improvementLogPath,
    optimizationItems: summary.optimizationItems.map((item) => ({
      priority: item.priority,
      title: item.title,
      reason: item.reason,
      fasterPath: item.fasterPath,
      evidence: item.evidence,
    })),
  };
}

function renderMarkdownReport(summary) {
  const statusAxisEntries = getStatusAxisEntries(summary);
  const header = [
    '# NocoBase UI Builder Review Report',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Log file: \`${summary.sourceLogPath}\``,
    `- Task: ${summary.start?.task ?? 'unknown'}`,
    `- Run ID: \`${summary.start?.runId ?? 'unknown'}\``,
    `- Page title: ${summary.start?.title ?? 'not provided'}`,
    `- schemaUid: ${summary.start?.schemaUid ?? 'not provided'}`,
    `- Page URL: ${summary.pageUrl ? `[${summary.pageUrl.url}](${summary.pageUrl.url})` : 'not recorded'}`,
    `- Status: ${summary.finish?.status ?? 'unfinished'}`,
    `- Duration: ${summary.durationLabel}`,
    '',
  ];

  const statusAxes = [
    '## Status Axes',
    '',
    '| Axis | Status | Detail |',
    '| --- | --- | --- |',
    ...statusAxisEntries.map((item) => `| ${escapeMarkdownCell(item.axis)} | ${escapeMarkdownCell(item.status)} | ${escapeMarkdownCell(item.detail || '—')} |`),
    '',
  ];

  const overview = [
    '## Overview',
    '',
    `- Total events: ${summary.totalEvents}`,
    `- Tool calls: ${summary.totalToolCalls}`,
    `- Notes: ${summary.totalNotes}`,
    `- Phase events: ${summary.totalPhases}`,
    `- Gate events: ${summary.totalGates}`,
    `- Cache events: ${summary.totalCacheEvents}`,
    `- Failed calls: ${summary.errorCount}`,
    `- Skipped calls: ${summary.skippedCount}`,
    '',
  ];

  const phases = [
    '## Phase Duration Profile',
    '',
  ];
  if (summary.phaseSummary.totals.length === 0) {
    phases.push('- No phase span was recorded.');
    phases.push('');
  } else {
    phases.push('| Phase | Count | Total Duration | Longest Single Run |');
    phases.push('| --- | ---: | ---: | ---: |');
    phases.push(...summary.phaseSummary.totals.map((item) => `| ${escapeMarkdownCell(item.phase)} | ${item.count} | ${item.totalDurationLabel} | ${item.maxDurationLabel} |`));
    phases.push('');
  }

  const cache = [
    '## Stable Cache Summary',
    '',
    `- Total events: ${summary.cacheSummary.total}`,
    `- Hits: ${summary.cacheSummary.hitCount}`,
    `- Misses: ${summary.cacheSummary.missCount}`,
    `- Stores: ${summary.cacheSummary.storeCount}`,
    `- Invalidates: ${summary.cacheSummary.invalidateCount}`,
    `- Hit rate: ${summary.cacheSummary.hitRatio === null ? 'unknown' : `${Math.round(summary.cacheSummary.hitRatio * 100)}%`}`,
    '',
  ];

  const gates = [
    '## Gate Summary',
    '',
    `- Total gates: ${summary.gateSummary.total}`,
    `- Passed: ${summary.gateSummary.passed}`,
    `- Failed: ${summary.gateSummary.failed}`,
    `- Stopped remaining flow: ${summary.gateSummary.stopped}`,
    '',
  ];
  if (summary.gateSummary.records.length > 0) {
    gates.push(...summary.gateSummary.records.map((item) => `- ${item.gate}: ${item.status} / ${item.reasonCode}`));
    gates.push('');
  }

  const guard = [
    '## Guard Summary',
    '',
    `- Canonicalize calls: ${summary.guardSummary.canonicalizeCount}`,
    `- Audit calls: ${summary.guardSummary.auditCount}`,
    `- Total blockers: ${summary.guardSummary.blockerCount}`,
    `- Total warnings: ${summary.guardSummary.warningCount}`,
    `- Risk-accept count: ${summary.guardSummary.riskAcceptCount}`,
    `- Writes continued after blocker: ${summary.guardSummary.writeAfterBlockerWithoutRiskAcceptCount}`,
    '',
  ];
  if (summary.guardSummary.violations.length > 0) {
    guard.push(...summary.guardSummary.violations.map(
      (item, index) => `- Violation ${index + 1}: ${item.writeTool} kept writing after blocker [${item.blockerCodes.join(', ')}]${item.violationType === 'risk_accept_without_reaudit' ? ' (risk-accept note exists, but no re-audit ran)' : ''}`,
    ));
    guard.push('');
  }

  const readback = [
    '## Post-write Readback',
    '',
  ];
  if (summary.readbackMismatches.length === 0) {
    readback.push('- No mismatch was found between save/mutate and the immediately following readback.');
    readback.push('');
  } else {
    readback.push(...summary.readbackMismatches.flatMap((item, index) => [
      `### ${index + 1}. ${item.writeTool} -> ${item.readTool}`,
      '',
      ...(item.targetSignature ? [`- Target signature: \`${item.targetSignature}\``] : []),
      `- Write time: ${item.writeTimestamp ?? 'unknown'}`,
      `- Write summary: ${item.writeSummary ?? 'not provided'}`,
      `- Readback time: ${item.readbackTimestamp ?? 'unknown'}`,
      `- Readback summary: ${item.readbackSummary ?? 'not provided'}`,
      `- Evidence: ${item.evidence.join('; ')}`,
      '',
    ]));
  }
  if (summary.readbackEvidenceInsufficient.length > 0) {
    readback.push('### Evidence Insufficient');
    readback.push('');
    readback.push(...summary.readbackEvidenceInsufficient.map(
      (item, index) => `- ${index + 1}. ${item.writeTool}${item.targetSignature ? ` (\`${item.targetSignature}\`)` : ''}: ${item.reasonCode}; ${item.detail}`,
    ));
    readback.push('');
  }

  const suggestions = [
    '## Improvement Points',
    '',
    ...summary.suggestions.map((item) => `- ${item}`),
    '',
  ];

  const optimization = [
    '## Automatic Improvement Suggestions',
    '',
    ...summary.optimizationItems.flatMap((item, index) => [
      `### ${index + 1}. [${item.priority}] ${item.title}`,
      '',
      `- Reason: ${item.reason}`,
      `- Faster path: ${item.fasterPath}`,
      ...(item.evidence?.length ? [`- Evidence: ${item.evidence.join('; ')}`] : []),
      '',
    ]),
  ];

  const toolStats = [
    '## Tool Statistics',
    '',
    '| Tool | Total | Success | Failure | Skipped |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...summary.countsByTool.map((item) => `| ${escapeMarkdownCell(item.tool)} | ${item.total} | ${item.ok} | ${item.error} | ${item.skipped} |`),
    '',
  ];

  const failures = ['## Failed Calls', ''];
  if (summary.errors.length === 0) {
    failures.push('- None');
    failures.push('');
  } else {
    for (const [index, item] of summary.errors.entries()) {
      failures.push(`### ${index + 1}. ${item.tool}`);
      failures.push('');
      failures.push(`- Time: ${item.timestamp ?? 'unknown'}`);
      failures.push(`- Type: ${item.toolType ?? 'unknown'}`);
      failures.push(`- Status: ${item.status ?? 'unknown'}`);
      if (item.summary) {
        failures.push(`- Summary: ${item.summary}`);
      }
      if (item.error) {
        failures.push(`- Error: ${item.error}`);
      }
      if (item.args !== undefined) {
        failures.push('- Args:');
        failures.push('');
        failures.push('```json');
        failures.push(compactJson(item.args, 1200));
        failures.push('```');
      }
      failures.push('');
    }
  }

  const timeline = [
    '## Timeline',
    '',
    '| # | Time | Event | Name / Message | Status | Summary |',
    '| --- | --- | --- | --- | --- | --- |',
    ...summary.timelineRecords.map((item, index) => (
      item.type === 'tool_call'
        ? `| ${index + 1} | ${escapeMarkdownCell(item.timestamp ?? '')} | tool_call | ${escapeMarkdownCell(item.tool)} | ${escapeMarkdownCell(item.status ?? '')} | ${escapeMarkdownCell(item.summary ?? '')} |`
        : item.type === 'note'
          ? `| ${index + 1} | ${escapeMarkdownCell(item.timestamp ?? '')} | note | ${escapeMarkdownCell(item.message)} |  | ${escapeMarkdownCell(compactJson(item.data, 160))} |`
          : item.type === 'phase'
            ? `| ${index + 1} | ${escapeMarkdownCell(item.timestamp ?? '')} | phase | ${escapeMarkdownCell(`${item.phase}:${item.event}`)} | ${escapeMarkdownCell(item.status ?? '')} | ${escapeMarkdownCell(compactJson(item.attributes, 160))} |`
            : item.type === 'gate'
              ? `| ${index + 1} | ${escapeMarkdownCell(item.timestamp ?? '')} | gate | ${escapeMarkdownCell(item.gate)} | ${escapeMarkdownCell(item.status ?? '')} | ${escapeMarkdownCell(item.reasonCode ?? '')} |`
              : `| ${index + 1} | ${escapeMarkdownCell(item.timestamp ?? '')} | cache_event | ${escapeMarkdownCell(`${item.action}:${item.kind}`)} | ${escapeMarkdownCell(item.source ?? '')} | ${escapeMarkdownCell(item.identity ?? '')} |`
    )),
    '',
  ];

  return [
    ...header,
    ...statusAxes,
    ...overview,
    ...phases,
    ...cache,
    ...gates,
    ...guard,
    ...readback,
    ...suggestions,
    ...optimization,
    ...toolStats,
    ...failures,
    ...timeline,
  ].join('\n');
}

function renderHtmlReport(summary) {
  const statusAxisCards = getStatusAxisEntries(summary).map((item) => `
      <article class="card">
        <strong>${escapeHtml(item.axis)}</strong><br>
        <span class="badge">${escapeHtml(item.status)}</span>
        <p class="muted">${escapeHtml(item.detail || '—')}</p>
      </article>
    `).join('\n');
  const failureBlocks = summary.errors.length === 0
    ? '<p class="muted">No failed calls.</p>'
    : summary.errors.map((item, index) => `
        <section class="card">
          <h3>${index + 1}. ${escapeHtml(item.tool)}</h3>
          <p><strong>Time:</strong> ${escapeHtml(item.timestamp ?? 'unknown')}</p>
          <p><strong>Type:</strong> ${escapeHtml(item.toolType ?? 'unknown')}</p>
          <p><strong>Status:</strong> ${escapeHtml(item.status ?? 'unknown')}</p>
          ${item.summary ? `<p><strong>Summary:</strong> ${escapeHtml(item.summary)}</p>` : ''}
          ${item.error ? `<p><strong>Error:</strong> ${escapeHtml(item.error)}</p>` : ''}
          ${item.args !== undefined ? `<pre>${escapeHtml(compactJson(item.args, 1600))}</pre>` : ''}
        </section>
      `).join('\n');

  const toolRows = summary.countsByTool.length === 0
    ? '<tr><td colspan="5" class="muted">No tool calls were recorded.</td></tr>'
    : summary.countsByTool.map((item) => `
        <tr>
          <td>${escapeHtml(item.tool)}</td>
          <td>${item.total}</td>
          <td>${item.ok}</td>
          <td>${item.error}</td>
          <td>${item.skipped}</td>
        </tr>
      `).join('\n');

  const phaseRows = summary.phaseSummary.totals.length === 0
    ? '<tr><td colspan="4" class="muted">No phase span was recorded.</td></tr>'
    : summary.phaseSummary.totals.map((item) => `
        <tr>
          <td>${escapeHtml(item.phase)}</td>
          <td>${item.count}</td>
          <td>${escapeHtml(item.totalDurationLabel)}</td>
          <td>${escapeHtml(item.maxDurationLabel)}</td>
        </tr>
      `).join('\n');

  const cacheKindRows = Object.entries(summary.cacheSummary.byKind).length === 0
    ? '<tr><td colspan="5" class="muted">No stable-cache event was recorded.</td></tr>'
    : Object.entries(summary.cacheSummary.byKind)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, value]) => `
        <tr>
          <td>${escapeHtml(kind)}</td>
          <td>${value.total}</td>
          <td>${value.hits}</td>
          <td>${value.misses}</td>
          <td>${value.stores + value.invalidates}</td>
        </tr>
      `).join('\n');

  const gateBlocks = summary.gateSummary.records.length === 0
    ? '<p class="muted">No gate decision was recorded.</p>'
    : summary.gateSummary.records.map((item, index) => `
        <section class="card">
          <h3>${index + 1}. ${escapeHtml(item.gate)}</h3>
          <p><strong>Status:</strong> ${escapeHtml(item.status ?? 'unknown')}</p>
          <p><strong>Reason:</strong> ${escapeHtml(item.reasonCode ?? 'unknown')}</p>
          <p><strong>Stopped remaining flow:</strong> ${escapeHtml(String(Boolean(item.stoppedRemainingWork)))}</p>
          ${Array.isArray(item.findings) && item.findings.length > 0
            ? `<p><strong>Findings:</strong> ${escapeHtml(item.findings.map((finding) => normalizeItem(finding)).filter(Boolean).join('; '))}</p>`
            : '<p class="muted">No findings were recorded.</p>'}
        </section>
      `).join('\n');

  const timelineRows = summary.timelineRecords.map((item, index) => {
    if (item.type === 'tool_call') {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.timestamp ?? '')}</td>
          <td>tool_call</td>
          <td>${escapeHtml(item.tool)}</td>
          <td>${escapeHtml(item.status ?? '')}</td>
          <td>${escapeHtml(item.summary ?? '')}</td>
        </tr>
      `;
    }
    if (item.type === 'note') {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.timestamp ?? '')}</td>
          <td>note</td>
          <td>${escapeHtml(item.message)}</td>
          <td></td>
          <td>${escapeHtml(compactJson(item.data, 160))}</td>
        </tr>
      `;
    }
    if (item.type === 'phase') {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.timestamp ?? '')}</td>
          <td>phase</td>
          <td>${escapeHtml(`${item.phase}:${item.event}`)}</td>
          <td>${escapeHtml(item.status ?? '')}</td>
          <td>${escapeHtml(compactJson(item.attributes, 160))}</td>
        </tr>
      `;
    }
    if (item.type === 'gate') {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.timestamp ?? '')}</td>
          <td>gate</td>
          <td>${escapeHtml(item.gate)}</td>
          <td>${escapeHtml(item.status ?? '')}</td>
          <td>${escapeHtml([item.reasonCode, compactJson(item.findings, 120)].filter(Boolean).join(' | '))}</td>
        </tr>
      `;
    }
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.timestamp ?? '')}</td>
        <td>cache_event</td>
        <td>${escapeHtml(`${item.action}:${item.kind}`)}</td>
        <td>${escapeHtml(item.source ?? '')}</td>
        <td>${escapeHtml([item.identity, item.ttlMs ? `ttl=${item.ttlMs}` : '', compactJson(item.data, 100)].filter(Boolean).join(' | '))}</td>
      </tr>
    `;
  }).join('\n');

  const suggestionItems = summary.suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n');
  const readbackBlocks = summary.readbackMismatches.length === 0
    ? '<p class="muted">No mismatch was found between save/mutate and the immediately following readback.</p>'
    : summary.readbackMismatches.map((item, index) => `
      <section class="card">
        <h3>${index + 1}. ${escapeHtml(item.writeTool)} -&gt; ${escapeHtml(item.readTool)}</h3>
        ${item.targetSignature ? `<p><strong>Target signature:</strong> <code>${escapeHtml(item.targetSignature)}</code></p>` : ''}
        <p><strong>Write time:</strong> ${escapeHtml(item.writeTimestamp ?? 'unknown')}</p>
        <p><strong>Write summary:</strong> ${escapeHtml(item.writeSummary ?? 'not provided')}</p>
        <p><strong>Readback time:</strong> ${escapeHtml(item.readbackTimestamp ?? 'unknown')}</p>
        <p><strong>Readback summary:</strong> ${escapeHtml(item.readbackSummary ?? 'not provided')}</p>
        <p><strong>Evidence:</strong> ${escapeHtml(item.evidence.join('; '))}</p>
      </section>
    `).join('\n');
  const readbackEvidenceInsufficientBlocks = summary.readbackEvidenceInsufficient.length === 0
    ? ''
    : `
      <div class="card">
        <h3>Evidence Insufficient</h3>
        <ul>
          ${summary.readbackEvidenceInsufficient.map((item) => `<li>${escapeHtml(`${item.writeTool}${item.targetSignature ? ` (${item.targetSignature})` : ''}: ${item.reasonCode}; ${item.detail}`)}</li>`).join('\n')}
        </ul>
      </div>
    `;
  const optimizationBlocks = summary.optimizationItems.map((item, index) => `
      <section class="card">
        <h3>${index + 1}. [${escapeHtml(item.priority)}] ${escapeHtml(item.title)}</h3>
        <p><strong>Reason:</strong> ${escapeHtml(item.reason)}</p>
        <p><strong>Faster path:</strong> ${escapeHtml(item.fasterPath)}</p>
        ${item.evidence?.length ? `<p><strong>Evidence:</strong> ${escapeHtml(item.evidence.join('; '))}</p>` : ''}
      </section>
    `).join('\n');
  const guardViolationItems = summary.guardSummary.violations.length === 0
    ? '<p class="muted">No flow kept writing after a blocker.</p>'
    : `<ul>${summary.guardSummary.violations.map((item) => `<li>${escapeHtml(`${item.writeTool} kept writing after blocker [${item.blockerCodes.join(', ')}]`)}</li>`).join('\n')}</ul>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NocoBase UI Builder Review Report</title>
  <style>
    :root {
      --bg: #f5f2ea;
      --card: #fffdf8;
      --text: #1f2328;
      --muted: #6b7280;
      --line: #d8d0c2;
      --accent: #9f3a2c;
      --accent-soft: #f5ddd8;
      --ok: #276749;
      --err: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Helvetica Neue", sans-serif;
      background:
        radial-gradient(circle at top left, #f9ead7 0%, transparent 35%),
        linear-gradient(180deg, #f7f3ec 0%, var(--bg) 100%);
      color: var(--text);
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 20px 64px;
    }
    h1, h2, h3 { margin: 0 0 12px; }
    h1 { font-size: 36px; }
    h2 {
      margin-top: 32px;
      font-size: 24px;
      border-top: 1px solid var(--line);
      padding-top: 24px;
    }
    .meta, .stats {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px 18px;
      box-shadow: 0 10px 30px rgba(31, 35, 40, 0.05);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
    }
    .muted { color: var(--muted); }
    ul { margin: 0; padding-left: 20px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 12px 10px;
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }
    th {
      background: #f0e8da;
      font-weight: 700;
    }
    pre {
      overflow-x: auto;
      background: #1e1e1e;
      color: #f8f8f2;
      padding: 12px;
      border-radius: 12px;
      font-size: 12px;
      line-height: 1.5;
    }
    .ok { color: var(--ok); }
    .err { color: var(--err); }
  </style>
</head>
<body>
  <main>
    <div class="badge">NocoBase UI Builder</div>
    <h1>Review Report</h1>
    <p class="muted">Generated at: ${escapeHtml(summary.generatedAt)}</p>

    <section class="meta">
      <article class="card"><strong>Task</strong><br>${escapeHtml(summary.start?.task ?? 'unknown')}</article>
      <article class="card"><strong>Run ID</strong><br><code>${escapeHtml(summary.start?.runId ?? 'unknown')}</code></article>
      <article class="card"><strong>Status</strong><br>${escapeHtml(summary.finish?.status ?? 'unfinished')}</article>
      <article class="card"><strong>Duration</strong><br>${escapeHtml(summary.durationLabel)}</article>
      <article class="card"><strong>Page title</strong><br>${escapeHtml(summary.start?.title ?? 'not provided')}</article>
      <article class="card"><strong>schemaUid</strong><br>${escapeHtml(summary.start?.schemaUid ?? 'not provided')}</article>
      <article class="card"><strong>Page URL</strong><br>${summary.pageUrl ? `<a href="${escapeHtml(summary.pageUrl.url)}">${escapeHtml(summary.pageUrl.url)}</a>` : 'not recorded'}</article>
    </section>

    <h2>Status Axes</h2>
    <section class="stats">
      ${statusAxisCards}
    </section>

    <h2>Overview</h2>
    <section class="stats">
      <article class="card"><strong>Total events</strong><br>${summary.totalEvents}</article>
      <article class="card"><strong>Tool calls</strong><br>${summary.totalToolCalls}</article>
      <article class="card"><strong>Notes</strong><br>${summary.totalNotes}</article>
      <article class="card"><strong>Phase events</strong><br>${summary.totalPhases}</article>
      <article class="card"><strong>Gate events</strong><br>${summary.totalGates}</article>
      <article class="card"><strong>Cache events</strong><br>${summary.totalCacheEvents}</article>
      <article class="card"><strong class="err">Failed calls</strong><br>${summary.errorCount}</article>
      <article class="card"><strong>Skipped calls</strong><br>${summary.skippedCount}</article>
    </section>

    <h2>Phase Duration Profile</h2>
    <section class="stats">
      <article class="card"><strong>Phase count</strong><br>${summary.phaseSummary.totals.length}</article>
      <article class="card"><strong>Closed spans</strong><br>${summary.phaseSummary.spans.length}</article>
      <article class="card"><strong>Slowest phase</strong><br>${escapeHtml(summary.phaseSummary.totals[0]?.phase ?? 'not recorded')}</article>
      <article class="card"><strong>Slowest total duration</strong><br>${escapeHtml(summary.phaseSummary.totals[0]?.totalDurationLabel ?? 'unknown')}</article>
    </section>
    <table>
      <thead>
        <tr><th>Phase</th><th>Count</th><th>Total Duration</th><th>Longest Single Run</th></tr>
      </thead>
      <tbody>${phaseRows}</tbody>
    </table>

    <h2>Stable Cache Summary</h2>
    <section class="stats">
      <article class="card"><strong>Total events</strong><br>${summary.cacheSummary.total}</article>
      <article class="card"><strong>Hits</strong><br>${summary.cacheSummary.hitCount}</article>
      <article class="card"><strong>miss</strong><br>${summary.cacheSummary.missCount}</article>
      <article class="card"><strong>store</strong><br>${summary.cacheSummary.storeCount}</article>
      <article class="card"><strong>invalidate</strong><br>${summary.cacheSummary.invalidateCount}</article>
      <article class="card"><strong>Hit rate</strong><br>${escapeHtml(summary.cacheSummary.hitRatio === null ? 'unknown' : `${Math.round(summary.cacheSummary.hitRatio * 100)}%`)}</article>
    </section>
    <table>
      <thead>
        <tr><th>Kind</th><th>Total Events</th><th>Hit</th><th>Miss</th><th>Store / Invalidate</th></tr>
      </thead>
      <tbody>${cacheKindRows}</tbody>
    </table>

    <h2>Gate Summary</h2>
    <section class="stats">
      <article class="card"><strong>Total gates</strong><br>${summary.gateSummary.total}</article>
      <article class="card"><strong class="ok">Passed</strong><br>${summary.gateSummary.passed}</article>
      <article class="card"><strong class="err">Failed</strong><br>${summary.gateSummary.failed}</article>
      <article class="card"><strong>Stopped remaining flow</strong><br>${summary.gateSummary.stopped}</article>
    </section>
    ${gateBlocks}

    <h2>Guard Summary</h2>
    <section class="stats">
      <article class="card"><strong>canonicalize</strong><br>${summary.guardSummary.canonicalizeCount}</article>
      <article class="card"><strong>Audit calls</strong><br>${summary.guardSummary.auditCount}</article>
      <article class="card"><strong>blocker</strong><br>${summary.guardSummary.blockerCount}</article>
      <article class="card"><strong>warning</strong><br>${summary.guardSummary.warningCount}</article>
      <article class="card"><strong>risk-accept</strong><br>${summary.guardSummary.riskAcceptCount}</article>
      <article class="card"><strong class="err">Writes past blocker</strong><br>${summary.guardSummary.writeAfterBlockerWithoutRiskAcceptCount}</article>
    </section>
    <section class="card">
      ${guardViolationItems}
    </section>

    <h2>Post-write Readback</h2>
    ${readbackBlocks}
    ${readbackEvidenceInsufficientBlocks}

    <h2>Improvement Points</h2>
    <section class="card">
      <ul>${suggestionItems}</ul>
    </section>

    <h2>Automatic Improvement Suggestions</h2>
    ${optimizationBlocks}

    <h2>Tool Statistics</h2>
    <table>
      <thead>
        <tr><th>Tool</th><th>Total</th><th>Success</th><th>Failure</th><th>Skipped</th></tr>
      </thead>
      <tbody>${toolRows}</tbody>
    </table>

    <h2>Failed Calls</h2>
    ${failureBlocks}

    <h2>Timeline</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Time</th><th>Event</th><th>Name / Message</th><th>Status</th><th>Summary</th></tr>
      </thead>
      <tbody>${timelineRows}</tbody>
    </table>

    <h2>Source Log</h2>
    <section class="card">
      <code>${escapeHtml(summary.sourceLogPath)}</code>
    </section>
  </main>
</body>
</html>`;
}

export function renderReport({
  logPath,
  latestRunPath,
  sessionId,
  sessionRoot,
  outDir,
  basename,
  formats = 'both',
  improvementLogPath,
}) {
  const sessionOptions = { sessionId, sessionRoot };
  const resolvedLogPath = resolveRunLogPath({ logPath, latestRunPath, ...sessionOptions });
  const records = loadJsonLines(resolvedLogPath);
  const summary = analyzeRun(records, resolvedLogPath);
  const resolvedOutDir = resolveReportDir(outDir, sessionOptions);
  const base = basename?.trim() || path.basename(resolvedLogPath, path.extname(resolvedLogPath));
  const requestedFormats = normalizeNonEmpty(formats, 'formats');
  const writeMarkdown = requestedFormats === 'md' || requestedFormats === 'both';
  const writeHtml = requestedFormats === 'html' || requestedFormats === 'both';
  if (!writeMarkdown && !writeHtml) {
    throw new Error(`Unsupported formats "${requestedFormats}"`);
  }

  const output = {
    logPath: resolvedLogPath,
    outDir: resolvedOutDir,
    generatedAt: summary.generatedAt,
  };

  if (writeMarkdown) {
    const markdownPath = path.join(resolvedOutDir, `${base}.review.md`);
    writeTextFile(markdownPath, `${renderMarkdownReport(summary)}\n`);
    output.markdownPath = markdownPath;
  }
  if (writeHtml) {
    const htmlPath = path.join(resolvedOutDir, `${base}.review.html`);
    writeTextFile(htmlPath, renderHtmlReport(summary));
    output.htmlPath = htmlPath;
  }

  const improvementMarkdownPath = path.join(resolvedOutDir, `${base}.improve.md`);
  const improvementJsonPath = path.join(resolvedOutDir, `${base}.improve.json`);
  const resolvedImprovementLogPath = resolveImprovementLogPath(improvementLogPath, sessionOptions);
  const improvementSnapshot = buildImprovementSnapshot(summary, resolvedImprovementLogPath);
  writeTextFile(improvementMarkdownPath, `${renderImprovementMarkdown(summary)}\n`);
  writeTextFile(improvementJsonPath, `${JSON.stringify(improvementSnapshot, null, 2)}\n`);
  appendJsonLine(resolvedImprovementLogPath, improvementSnapshot);
  output.improvementMarkdownPath = improvementMarkdownPath;
  output.improvementJsonPath = improvementJsonPath;
  output.improvementLogPath = resolvedImprovementLogPath;

  return output;
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
  if (command !== 'render') {
    throw new Error(`Unknown command "${command}"`);
  }

  const result = renderReport({
    logPath: flags['log-path'],
    latestRunPath: flags['latest-run-path'],
    sessionId: flags['session-id'],
    sessionRoot: flags['session-root'],
    outDir: flags['out-dir'],
    basename: flags.basename,
    formats: flags.formats ?? 'both',
    improvementLogPath: flags['improvement-log-path'],
  });
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
