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
    return '未知';
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
        return buildStatusAxis(fromStatusAxes, `来自 ${record.type}`);
      }
      const directValue = normalizeAxisStatusInput(container[axisKey], options);
      if (directValue) {
        return buildStatusAxis(directValue, `来自 ${record.type}`);
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
      evidence.push(`write.pageGroups[${pageSignature}] exists，readback missing`);
      continue;
    }

    if (
      typeof writePageGroup.pageUse === 'string'
      && typeof readPageGroup.pageUse === 'string'
      && writePageGroup.pageUse !== readPageGroup.pageUse
    ) {
      evidence.push(`page ${pageSignature} use write=${writePageGroup.pageUse}，readback=${readPageGroup.pageUse}`);
    }

    const writeTabCount = Number.isFinite(writePageGroup.tabCount) ? writePageGroup.tabCount : null;
    const readTabCount = Number.isFinite(readPageGroup.tabCount) ? readPageGroup.tabCount : null;
    if (writeTabCount !== null && readTabCount !== null && writeTabCount !== readTabCount) {
      evidence.push(`page ${pageSignature} tabCount write=${writeTabCount}，readback=${readTabCount}`);
    }

    const writeTabTitles = normalizeStringList(writePageGroup.tabTitles);
    const readTabTitles = normalizeStringList(readPageGroup.tabTitles);
    if (
      writeTabTitles.length > 0
      && readTabTitles.length > 0
      && JSON.stringify(writeTabTitles) !== JSON.stringify(readTabTitles)
    ) {
      evidence.push(`page ${pageSignature} tabTitles write=${writeTabTitles.join(' / ')}，readback=${readTabTitles.join(' / ')}`);
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
        evidence.push(`page ${pageSignature} tab ${title} exists，readback missing`);
        return;
      }
      if (tab.hasBlockGrid !== readTab.hasBlockGrid) {
        evidence.push(`page ${pageSignature} tab ${title} hasBlockGrid write=${String(tab.hasBlockGrid)}，readback=${String(readTab.hasBlockGrid)}`);
      }
    });
  }

  for (const [pageSignature] of readPageGroups.entries()) {
    if (!writePageGroups.has(pageSignature)) {
      evidence.push(`readback.pageGroups[${pageSignature}] exists，write missing`);
    }
  }

  const writeTopLevelUses = normalizeStringList(writeSummary?.topLevelUses);
  const readTopLevelUses = normalizeStringList(readSummary?.topLevelUses);
  if (
    writeTopLevelUses.length > 0
    && readTopLevelUses.length > 0
    && JSON.stringify(writeTopLevelUses) !== JSON.stringify(readTopLevelUses)
  ) {
    evidence.push(`write.topLevelUses=${writeTopLevelUses.join(' / ')}，readback.topLevelUses=${readTopLevelUses.join(' / ')}`);
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
        detail: `${writeCall.tool} 需要显式 args.targetSignature 才能参与自动 write-after-read 对账。`,
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
          detail: '后续存在 GetFlowmodels_findone，但没有显式 args.targetSignature，无法安全配对同目标 readback。',
        }));
      } else {
        evidenceInsufficient.push(buildEvidenceInsufficientItem({
          writeCall,
          targetSignature: writeTargetSignature,
          reasonCode: 'READBACK_MISSING',
          detail: '在下一个 side-effect write 或 run 结束前，没有发现同目标 GetFlowmodels_findone readback。',
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
        detail: 'write/readback 至少有一侧缺少 result.summary，无法进行结构化对账。',
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
        detail: 'result.summary.targetSignature 与 tool_call.args.targetSignature 不一致，无法确认对账目标。',
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
      title: '把探测步骤前置并批量化',
      reason: '写入发生前未完成完整探测，或者探测顺序晚于第一次写入，会增加试错和返工。',
      fasterPath: '在第一次写入前先执行一次 `PostFlowmodels_schemabundle` + 一次 `PostFlowmodels_schemas`；只有目标模型仍有歧义时，再补 `GetFlowmodels_schema`。',
      evidence: [
        !hasSchemaBundle ? '缺少 `PostFlowmodels_schemabundle`' : null,
        !hasSchemas ? '缺少 `PostFlowmodels_schemas`' : null,
        firstDiscoveryIndex > firstWriteIndex && firstDiscoveryIndex !== -1 ? '首次探测晚于首次写入' : null,
      ].filter(Boolean),
    });
  }

  if (hasWrites && !guardSummary.hasGuardAudit) {
    items.push({
      priority: 'high',
      title: '把 payload guard 放到首次写入前',
      reason: '存在写操作，但没有记录任何 `flow_payload_guard.audit-payload` 审计结果，坏 payload 可能直接落库。',
      fasterPath: '每轮写入前先执行一次 `flow_payload_guard.extract-required-metadata` 和 `flow_payload_guard.audit-payload`；命中 blocker 时立即停止写入。',
      evidence: ['缺少 `flow_payload_guard.audit-payload`'],
    });
  }

  if (hasWrites && !guardSummary.hasCanonicalize) {
    items.push({
      priority: 'high',
      title: '把 canonicalize 放到 guard 审计前',
      reason: '存在写操作，但没有记录任何 `flow_payload_guard.canonicalize-payload`；legacy 结构和样本值会直接进入 audit 或写入阶段。',
      fasterPath: '统一采用 `extract-required-metadata -> canonicalize-payload -> audit-payload -> write` 流水线，让能自动收敛的问题先在本地归一化。',
      evidence: ['缺少 `flow_payload_guard.canonicalize-payload`'],
    });
  }

  if (guardSummary.writeAfterBlockerWithoutRiskAcceptCount > 0) {
    items.push({
      priority: 'high',
      title: '不要绕过 blocker 直接写入',
      reason: `本次出现 ${guardSummary.writeAfterBlockerWithoutRiskAcceptCount} 次“guard 已报 blocker 但仍继续写入”的违规流程。`,
      fasterPath: 'guard 报 blocker 后，默认先修 payload；只有确实接受风险时，才追加 risk-accept note 并重新审计后再写入。',
      evidence: guardSummary.violations.map((item) => `${item.writeTool} <- ${item.blockerCodes.join(', ')}`),
    });
  }

  if (guardSummary.createPageAfterBlockerCount > 0) {
    items.push({
      priority: 'high',
      title: '把 createV2 也纳入 guard 阻断',
      reason: `本次有 ${guardSummary.createPageAfterBlockerCount} 次在 guard blocker 之后仍继续执行 \`PostDesktoproutes_createv2\`。`,
      fasterPath: '不要把 page shell 创建当成“低风险探路”；guard 报 blocker 时，连 createV2 也必须暂停，先修 payload 或重新审计。',
      evidence: guardSummary.violations
        .filter((item) => item.writeTool === 'PostDesktoproutes_createv2')
        .map((item) => `${item.writeTool} <- ${item.blockerCodes.join(', ')}`),
    });
  }

  if (routeReadySummary.createPageCount > 0 && (routeReadySummary.routeReadCount === 0 || routeReadySummary.preOpenGateCount === 0)) {
    items.push({
      priority: 'high',
      title: '把 createV2 后的 route-ready 与首开 gate 补齐',
      reason: 'createV2 只代表页面壳已写库，不代表新页面已经进入可首开验证状态。',
      fasterPath: 'createV2 后先回读 accessible route tree，确认 page route 与隐藏 tab 已同步，再执行一次 pre-open gate；缺任一证据都不能把页面记为 success。',
      evidence: [
        routeReadySummary.routeReadCount === 0 ? '缺少 `GetDesktoproutes_getaccessible/listaccessible`' : null,
        routeReadySummary.preOpenGateCount === 0 ? '缺少 `pre-open` gate' : null,
      ].filter(Boolean),
    });
  }

  if (readbackMismatches.length > 0) {
    items.push({
      priority: 'high',
      title: '把 write 后 readback 不一致直接判为失败',
      reason: `本次发现 ${readbackMismatches.length} 组写后回读矛盾，说明不能只看 save/mutate 的乐观返回值。`,
      fasterPath: '每次写入后立即做同目标 readback，并让 run_finished、review 文案和最终状态都以 readback 事实为准；发现计数或标题不一致时直接降级成 partial/failed。',
      evidence: readbackMismatches.flatMap((item) => item.evidence).slice(0, 4),
    });
  }

  if (readbackEvidenceInsufficient.length > 0) {
    items.push({
      priority: 'medium',
      title: '给自动对账补齐 targetSignature 和 summary',
      reason: `本次有 ${readbackEvidenceInsufficient.length} 组写后对账证据不足，自动流程无法确认写入目标或结构快照。`,
      fasterPath: '写操作与对应 GetFlowmodels_findone 都显式记录 args.targetSignature，并把结构化树摘要写入 result.summary；旧日志不要继续拿来做自动 mismatch。',
      evidence: readbackEvidenceInsufficient.slice(0, 4).map((item) => `${item.writeTool}:${item.reasonCode}`),
    });
  }

  if (schemaReadCount >= 3) {
    items.push({
      priority: 'high',
      title: '减少多次单模型 schema 读取',
      reason: `本次出现 ${schemaReadCount} 次 \`GetFlowmodels_schema\`，通常说明单模型深挖过多。`,
      fasterPath: '优先一次性拉取 `PostFlowmodels_schemas`，只对最后仍不清楚的模型再补单独 `GetFlowmodels_schema`。',
      evidence: [`GetFlowmodels_schema x${schemaReadCount}`],
    });
  }

  if (cacheSummary.total === 0 && (hasSchemaBundle || hasSchemas || schemaReadCount > 0)) {
    items.push({
      priority: 'high',
      title: '为稳定探测结果接入跨 run 缓存',
      reason: '本次已经有 schema/metadata 探测，但没有记录任何缓存命中或回写。',
      fasterPath: '只缓存 schemaBundle、schemas、collection fields、relation metadata；live tree 与 runtime 结果继续实时读取。',
      evidence: [
        hasSchemaBundle ? '执行了 `PostFlowmodels_schemabundle`' : null,
        hasSchemas ? '执行了 `PostFlowmodels_schemas`' : null,
        schemaReadCount > 0 ? `GetFlowmodels_schema x${schemaReadCount}` : null,
      ].filter(Boolean),
    });
  }

  if (cacheSummary.total > 0 && cacheSummary.hitRatio !== null && cacheSummary.hitRatio < 0.5 && cacheSummary.missCount >= 2) {
    items.push({
      priority: 'medium',
      title: '提高稳定缓存命中率',
      reason: `当前缓存命中率仅 ${Math.round(cacheSummary.hitRatio * 100)}%，大量稳定探测仍走了实时读取。`,
      fasterPath: '复用 instanceFingerprint 下的 stable metadata cache，并在 collection/field 写操作后只做选择性失效。',
      evidence: [`cache_hit=${cacheSummary.hitCount}`, `cache_miss=${cacheSummary.missCount}`],
    });
  }

  const slowPhase = phaseSummary.totals[0] ?? null;
  if (slowPhase && slowPhase.totalDurationMs >= 20_000) {
    items.push({
      priority: 'medium',
      title: `压缩最慢阶段：${slowPhase.phase}`,
      reason: `本次最慢阶段耗时 ${slowPhase.totalDurationLabel}，已经成为关键路径。`,
      fasterPath: slowPhase.phase === 'browser_attach'
        ? '固定浏览器 attach 主路径，并减少多次 attach / fallback。'
        : slowPhase.phase === 'schema_discovery' || slowPhase.phase === 'stable_metadata'
          ? '优先命中稳定缓存，并把 schema/metadata 探测批量化。'
          : '优先把该阶段的输入归一化并减少重复推理或重复读取。',
      evidence: [`${slowPhase.phase}=${slowPhase.totalDurationLabel}`],
    });
  }

  if (gateRecords.failed > 0) {
    items.push({
      priority: 'medium',
      title: '把 gate 决策前置到更早阶段',
      reason: `本次已有 ${gateRecords.failed} 个 gate 失败，如果失败后仍继续执行，整体耗时会被后半段放大。`,
      fasterPath: 'write-after-read mismatch、pre-open blocker、mandatory stage 失败都要直接截停后续动作。',
      evidence: gateRecords.records
        .filter((item) => item.status === 'failed')
        .map((item) => `${item.gate}:${item.reasonCode}`)
        .slice(0, 4),
    });
  }

  if (repeatedFindoneTargets.length > 0) {
    items.push({
      priority: 'medium',
      title: '压缩重复的 live snapshot 读取',
      reason: '同一个 live target 被读取了 3 次或更多次，通常意味着中间有可合并的重复探测。',
      fasterPath: '默认保持“目标页面写前一次、写后一次”的读取节奏；样板页只在 schema-first 无法消歧时再作为 fallback。',
      evidence: repeatedFindoneTargets.map((item) => `${item.target} x${item.count}`),
    });
  }

  if (repeatedRuns.length > 0) {
    items.push({
      priority: 'medium',
      title: '合并连续重复调用',
      reason: '连续重复读取通常意味着流程可以更直接，或某些结果没有被复用。',
      fasterPath: '对连续重复工具调用优先缓存结果、合并成一次调用，或把多个相邻操作合并进一次事务写入。',
      evidence: repeatedRuns.map((item) => `${item.tool} x${item.count}`),
    });
  }

  if (errors.length > 0) {
    items.push({
      priority: 'high',
      title: '把失败前的最小成功模板固化下来',
      reason: `本次有 ${errors.length} 次失败调用，重复试错会直接拉长完成时间。`,
      fasterPath: '把失败调用前最近一次成功的 schema/请求体整理成模板，下次优先从模板改最少字段，而不是从空 payload 开始猜。',
      evidence: errors.slice(0, 3).map((item) => `${item.tool}: ${item.error ?? item.status ?? 'error'}`),
    });
  }

  if (hasWrites && !hasFindone) {
    items.push({
      priority: 'medium',
      title: '补上写前 live 读取，减少无效回滚',
      reason: '写入前没有记录 live snapshot 读取，容易对现状判断错误。',
      fasterPath: '每轮改动前先读一次目标页面 / grid，再决定 patch 还是 append，能减少写后修补。',
      evidence: ['缺少 `GetFlowmodels_findone`'],
    });
  }

  if (missingSummaryCount > 0) {
    items.push({
      priority: 'low',
      title: '为每条工具调用补上简短 summary',
      reason: '虽然这不会直接减少调用次数，但能更快识别哪些步骤可以删减。',
      fasterPath: '每次 `tool_call` 都写一个一句话 summary，复盘时能更快定位冗余步骤。',
      evidence: [`缺少 summary 的记录数：${missingSummaryCount}`],
    });
  }

  if (items.length === 0) {
    items.push({
      priority: 'low',
      title: '维持当前流程，继续关注事务合并机会',
      reason: '本次没有明显的流程绕路迹象。',
      fasterPath: '后续优先观察是否能把相邻的新增/更新步骤继续压缩到一次 `PostFlowmodels_mutate` 中。',
      evidence: ['未发现明显绕路模式'],
    });
  }

  return items;
}

function describeRouteTarget(target) {
  if (target.status === 'resolved') {
    return `schemaUid=${target.schemaUid}`;
  }
  if (target.sources.length > 0) {
    return target.sources.join('；');
  }
  return '未记录 schemaUid';
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
      return buildStatusAxis('not-recorded', '未记录 `PostDesktoproutes_createv2`。');
    }
    if (routeReadySummary.target.status === 'ambiguous') {
      return buildStatusAxis('evidence-insufficient', `createV2 目标不唯一：${describeRouteTarget(routeReadySummary.target)}`);
    }
    if (routeReadySummary.createSuccessCount > 0) {
      return buildStatusAxis(
        'created',
        `${describeRouteTarget(routeReadySummary.target)}；createV2 成功 ${formatCountLabel(routeReadySummary.createSuccessCount, '次')}`,
      );
    }
    if (routeReadySummary.createErrorCount > 0) {
      return buildStatusAxis('failed', `${describeRouteTarget(routeReadySummary.target)}；createV2 失败 ${formatCountLabel(routeReadySummary.createErrorCount, '次')}`);
    }
    return buildStatusAxis('not-recorded', '检测到 createV2，但无法确认成功结果。');
  })();

  const routeReady = routeReadyExplicit ?? (() => {
    if (routeReadySummary.createPageCount === 0 && routeReadySummary.routeReadTotalCount === 0) {
      return buildStatusAxis('not-recorded', '未记录 route-ready 相关工具调用。');
    }
    if (routeReadySummary.target.status !== 'resolved' && (routeReadySummary.createPageCount > 0 || routeReadySummary.routeReadTotalCount > 0)) {
      return buildStatusAxis('evidence-insufficient', `route-ready 目标不明确：${describeRouteTarget(routeReadySummary.target)}`);
    }
    if (routeReadySummary.routeReadCount > 0) {
      return buildStatusAxis(
        'ready',
        `${describeRouteTarget(routeReadySummary.target)}；${routeReadySummary.routeReadTools.join(' / ')} x${routeReadySummary.routeReadCount}`,
      );
    }
    if (routeReadySummary.routeReadTotalCount > 0 || routeReadySummary.routeReadEvidenceInsufficient.length > 0) {
      return buildStatusAxis(
        'evidence-insufficient',
        [...routeReadySummary.routeReadEvidenceInsufficient].slice(0, 2).join('；') || '存在 route-ready 调用，但没有显式绑定到目标页面。',
      );
    }
    if (routeReadySummary.createSuccessCount > 0) {
      return buildStatusAxis('not-ready', `${describeRouteTarget(routeReadySummary.target)}；createV2 后没有 route-ready 证据。`);
    }
    return buildStatusAxis('not-recorded', '未记录 route-ready 结论。');
  })();

  const readbackMatched = readbackExplicit ?? (() => {
    if (readbackAnalysis.mismatches.length > 0) {
      return buildStatusAxis(
        'mismatch',
        `${formatCountLabel(readbackAnalysis.mismatches.length, '组')} write-after-read mismatch`,
      );
    }
    if (readbackAnalysis.evidenceInsufficient.length > 0) {
      const detail = [
        readbackAnalysis.matched.length > 0 ? `matched ${readbackAnalysis.matched.length} 组` : null,
        `证据不足 ${readbackAnalysis.evidenceInsufficient.length} 组`,
      ].filter(Boolean).join('；');
      return buildStatusAxis('evidence-insufficient', detail);
    }
    if (readbackAnalysis.matched.length > 0) {
      return buildStatusAxis('matched', `${formatCountLabel(readbackAnalysis.matched.length, '组')} readback matched`);
    }
    if (hasWrites) {
      return buildStatusAxis('not-recorded', '存在写操作，但没有形成可判定的 readback 结论。');
    }
    return buildStatusAxis('not-recorded', '未记录 write-after-read 对账。');
  })();

  const dataPreparation = dataPreparationExplicit ?? buildStatusAxis('not-recorded', '日志中没有稳定的数据准备信号。');
  const dataReady = dataReadyExplicit ?? buildStatusAxis('not-recorded', '日志中没有稳定的数据 readiness 信号。');

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
      return buildStatusAxis('skipped (not requested)', '未记录 browser_attach / smoke / pre-open / stage gate。');
    }
    if (browserFailed) {
      return buildStatusAxis('failed', `${formatCountLabel(browserGateRecords.filter((record) => record.status === 'failed').length, '个')} browser gate 失败`);
    }
    if (browserSkippedOnly) {
      return buildStatusAxis('skipped', '浏览器阶段被显式跳过。');
    }
    if (browserPassed) {
      return buildStatusAxis('passed', `${formatCountLabel(browserGateRecords.filter((record) => record.status === 'passed').length, '个')} browser gate 通过`);
    }
    return buildStatusAxis('not-recorded', '进入了浏览器相关阶段，但没有形成可判定结论。');
  })();

  const runtimeUsable = runtimeExplicit ?? (() => {
    if (!hasBrowserEvidence) {
      return buildStatusAxis('not-run', '没有浏览器验证证据。');
    }
    if (browserFailed) {
      return buildStatusAxis('failed', '浏览器 gate 或 smoke 阶段存在失败。');
    }
    const runtimePassCount = browserGateRecords.filter((record) => record.gate.startsWith('stage:') && record.status === 'passed').length;
    const smokeOkCount = browserEndRecords.filter((record) => record.phase === 'smoke' && record.status === 'ok').length;
    if (runtimePassCount > 0 || smokeOkCount > 0) {
      return buildStatusAxis('usable', `stage pass ${runtimePassCount}；smoke ok ${smokeOkCount}`);
    }
    return buildStatusAxis('not-recorded', '只有 pre-open 或 attach 证据，尚不足以确认 runtime usable。');
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
    suggestions.push('本次日志没有 `run_finished` 记录，说明执行没有正常收尾。');
  }
  if (errors.length > 0) {
    suggestions.push(`有 ${errors.length} 次失败调用，先检查失败调用的 args、error 和前后文。`);
  }
  if (hasWrites && !hasSchemaBundle) {
    suggestions.push('存在写操作，但没有记录 `PostFlowmodels_schemabundle`，建议补齐探测冷启动。');
  }
  if (hasWrites && !hasSchemas) {
    suggestions.push('存在写操作，但没有记录 `PostFlowmodels_schemas`，建议在落盘前读取精确模型文档。');
  }
  if (hasWrites && !hasFindone) {
    suggestions.push('存在写操作，但没有记录 `GetFlowmodels_findone`，建议在每次变更前后都记录 live snapshot 读取。');
  }
  if (hasWrites && !guardSummary.hasGuardAudit) {
    suggestions.push('存在写操作，但没有记录 `flow_payload_guard.audit-payload`，建议在首次写入前加一轮 payload 审计。');
  }
  if (hasWrites && !guardSummary.hasCanonicalize) {
    suggestions.push('存在写操作，但没有记录 `flow_payload_guard.canonicalize-payload`，建议先做一次本地归一化，再进入最终审计。');
  }
  if (guardSummary.writeAfterBlockerWithoutRiskAcceptCount > 0) {
    suggestions.push(`发现 ${guardSummary.writeAfterBlockerWithoutRiskAcceptCount} 次“guard 已报 blocker 但仍继续写入”的违规流程，建议先修 payload 或显式记录 risk-accept。`);
  }
  if (guardSummary.createPageAfterBlockerCount > 0) {
    suggestions.push(`发现 ${guardSummary.createPageAfterBlockerCount} 次在 guard blocker 后仍继续 \`PostDesktoproutes_createv2\`；page shell 创建也必须服从同一 guard gate。`);
  }
  if (guardSummary.riskAcceptCount > 0) {
    suggestions.push(`本次使用了 ${guardSummary.riskAcceptCount} 次 risk-accept，建议复盘这些豁免是否还能继续缩减。`);
  }
  if (readbackMismatches.length > 0) {
    suggestions.push(`发现 ${readbackMismatches.length} 组 write 后 readback 不一致，不能再把 save/mutate 的返回值当成最终成功依据。`);
  }
  if (readbackEvidenceInsufficient.length > 0) {
    suggestions.push(`有 ${readbackEvidenceInsufficient.length} 组写后对账证据不足；需要显式 args.targetSignature 和 result.summary 才能安全自动对账。`);
  }
  if (hasWrites && firstDiscoveryIndex > firstWriteIndex && firstDiscoveryIndex !== -1) {
    suggestions.push('首次探测发生在首次写操作之后，建议把探测顺序前置。');
  }
  if (repeatedRuns.length > 0) {
    suggestions.push(
      `发现连续重复调用：${repeatedRuns.map((item) => `${item.tool} x${item.count}`).join('，')}。可考虑合并步骤或减少重复读取。`,
    );
  }
  if (missingSummaryCount > 0) {
    suggestions.push(`有 ${missingSummaryCount} 条 tool_call 没有 ` + '`summary`' + '，复盘时可读性会变差。');
  }
  if (phaseSummary.spans.length === 0) {
    suggestions.push('本次没有记录任何 phase span，无法判断关键路径。建议至少记录 schema_discovery、write、readback、browser_attach 和 smoke 阶段。');
  }
  if (cacheSummary.total === 0 && (hasSchemaBundle || hasSchemas || schemaReadCount > 0)) {
    suggestions.push('本次没有记录任何 stable cache 事件，schema/metadata 探测仍可能重复走实时请求。');
  }
  if (gateSummary.failed > 0) {
    suggestions.push(`本次有 ${gateSummary.failed} 个 gate 失败，建议确认失败后是否已经真正截停后续动作。`);
  }
  if (routeReadySummary.createPageCount > 0 && routeReadySummary.routeReadCount === 0) {
    suggestions.push('存在 `PostDesktoproutes_createv2`，但没有记录任何 accessible route 回读；建议在首开前先确认新 page 与隐藏 tab 已进入 route tree。');
  }
  if (routeReadySummary.createPageCount > 0 && routeReadySummary.preOpenGateCount === 0) {
    suggestions.push('存在 `PostDesktoproutes_createv2`，但没有记录 `pre-open` gate；建议把“页面可首开、非空白、非卡骨架屏”作为独立阻断条件。');
  }
  if (routeReadySummary.routeReadEvidenceInsufficient.length > 0 || routeReadySummary.preOpenEvidenceInsufficient.length > 0) {
    suggestions.push('部分 route-ready / pre-open 证据没有显式绑定到目标页面；建议在日志中记录 schemaUid，避免串页或串 session。');
  }
  if (suggestions.length === 0) {
    suggestions.push('本次日志结构完整，可继续从失败率、重复调用和探测顺序三个角度优化。');
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
    '# NocoBase UI Builder 自动改进清单',
    '',
    `- 生成时间：${summary.generatedAt}`,
    `- 日志文件：\`${summary.sourceLogPath}\``,
    `- 任务：${summary.start?.task ?? '未知'}`,
    `- 运行 ID：\`${summary.start?.runId ?? '未知'}\``,
    '',
    '## 优先改进项',
    '',
  ];

  for (const [index, item] of summary.optimizationItems.entries()) {
    lines.push(`### ${index + 1}. [${item.priority}] ${item.title}`);
    lines.push('');
    lines.push(`- 原因：${item.reason}`);
    lines.push(`- 更快路径：${item.fasterPath}`);
    if (item.evidence?.length) {
      lines.push(`- 证据：${item.evidence.join('；')}`);
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
    '# NocoBase UI Builder 复盘报告',
    '',
    `- 生成时间：${summary.generatedAt}`,
    `- 日志文件：\`${summary.sourceLogPath}\``,
    `- 任务：${summary.start?.task ?? '未知'}`,
    `- 运行 ID：\`${summary.start?.runId ?? '未知'}\``,
    `- 页面标题：${summary.start?.title ?? '未提供'}`,
    `- schemaUid：${summary.start?.schemaUid ?? '未提供'}`,
    `- 页面地址：${summary.pageUrl ? `[${summary.pageUrl.url}](${summary.pageUrl.url})` : '未记录'}`,
    `- 状态：${summary.finish?.status ?? '未完成'}`,
    `- 耗时：${summary.durationLabel}`,
    '',
  ];

  const statusAxes = [
    '## 结果轴',
    '',
    '| 轴 | 状态 | 说明 |',
    '| --- | --- | --- |',
    ...statusAxisEntries.map((item) => `| ${escapeMarkdownCell(item.axis)} | ${escapeMarkdownCell(item.status)} | ${escapeMarkdownCell(item.detail || '—')} |`),
    '',
  ];

  const overview = [
    '## 概览',
    '',
    `- 事件总数：${summary.totalEvents}`,
    `- 工具调用数：${summary.totalToolCalls}`,
    `- 备注数：${summary.totalNotes}`,
    `- phase 事件数：${summary.totalPhases}`,
    `- gate 事件数：${summary.totalGates}`,
    `- cache 事件数：${summary.totalCacheEvents}`,
    `- 失败调用数：${summary.errorCount}`,
    `- 跳过调用数：${summary.skippedCount}`,
    '',
  ];

  const phases = [
    '## 阶段耗时画像',
    '',
  ];
  if (summary.phaseSummary.totals.length === 0) {
    phases.push('- 未记录 phase span。');
    phases.push('');
  } else {
    phases.push('| 阶段 | 次数 | 总耗时 | 最长单次 |');
    phases.push('| --- | ---: | ---: | ---: |');
    phases.push(...summary.phaseSummary.totals.map((item) => `| ${escapeMarkdownCell(item.phase)} | ${item.count} | ${item.totalDurationLabel} | ${item.maxDurationLabel} |`));
    phases.push('');
  }

  const cache = [
    '## Stable Cache 摘要',
    '',
    `- 事件总数：${summary.cacheSummary.total}`,
    `- 命中：${summary.cacheSummary.hitCount}`,
    `- miss：${summary.cacheSummary.missCount}`,
    `- store：${summary.cacheSummary.storeCount}`,
    `- invalidate：${summary.cacheSummary.invalidateCount}`,
    `- 命中率：${summary.cacheSummary.hitRatio === null ? '未知' : `${Math.round(summary.cacheSummary.hitRatio * 100)}%`}`,
    '',
  ];

  const gates = [
    '## Gate 摘要',
    '',
    `- gate 总数：${summary.gateSummary.total}`,
    `- 通过：${summary.gateSummary.passed}`,
    `- 失败：${summary.gateSummary.failed}`,
    `- 截停后续流程：${summary.gateSummary.stopped}`,
    '',
  ];
  if (summary.gateSummary.records.length > 0) {
    gates.push(...summary.gateSummary.records.map((item) => `- ${item.gate}: ${item.status} / ${item.reasonCode}`));
    gates.push('');
  }

  const guard = [
    '## Guard 摘要',
    '',
    `- canonicalize 调用数：${summary.guardSummary.canonicalizeCount}`,
    `- 审计调用数：${summary.guardSummary.auditCount}`,
    `- blocker 总数：${summary.guardSummary.blockerCount}`,
    `- warning 总数：${summary.guardSummary.warningCount}`,
    `- risk-accept 次数：${summary.guardSummary.riskAcceptCount}`,
    `- 带 blocker 继续写入次数：${summary.guardSummary.writeAfterBlockerWithoutRiskAcceptCount}`,
    '',
  ];
  if (summary.guardSummary.violations.length > 0) {
    guard.push(...summary.guardSummary.violations.map(
      (item, index) => `- 违规 ${index + 1}：${item.writeTool} 在 blocker [${item.blockerCodes.join(', ')}] 之后继续写入${item.violationType === 'risk_accept_without_reaudit' ? '（已写 risk-accept note，但没有重新审计）' : ''}`,
    ));
    guard.push('');
  }

  const readback = [
    '## 写后回读',
    '',
  ];
  if (summary.readbackMismatches.length === 0) {
    readback.push('- 未发现 save/mutate 与紧随其后的 readback 矛盾。');
    readback.push('');
  } else {
    readback.push(...summary.readbackMismatches.flatMap((item, index) => [
      `### ${index + 1}. ${item.writeTool} -> ${item.readTool}`,
      '',
      ...(item.targetSignature ? [`- 目标签名：\`${item.targetSignature}\``] : []),
      `- 写入时间：${item.writeTimestamp ?? '未知'}`,
      `- 写入摘要：${item.writeSummary ?? '未提供'}`,
      `- 回读时间：${item.readbackTimestamp ?? '未知'}`,
      `- 回读摘要：${item.readbackSummary ?? '未提供'}`,
      `- 证据：${item.evidence.join('；')}`,
      '',
    ]));
  }
  if (summary.readbackEvidenceInsufficient.length > 0) {
    readback.push('### 证据不足');
    readback.push('');
    readback.push(...summary.readbackEvidenceInsufficient.map(
      (item, index) => `- ${index + 1}. ${item.writeTool}${item.targetSignature ? ` (\`${item.targetSignature}\`)` : ''}: ${item.reasonCode}；${item.detail}`,
    ));
    readback.push('');
  }

  const suggestions = [
    '## 可改进点',
    '',
    ...summary.suggestions.map((item) => `- ${item}`),
    '',
  ];

  const optimization = [
    '## 自动改进建议',
    '',
    ...summary.optimizationItems.flatMap((item, index) => [
      `### ${index + 1}. [${item.priority}] ${item.title}`,
      '',
      `- 原因：${item.reason}`,
      `- 更快路径：${item.fasterPath}`,
      ...(item.evidence?.length ? [`- 证据：${item.evidence.join('；')}`] : []),
      '',
    ]),
  ];

  const toolStats = [
    '## 工具统计',
    '',
    '| 工具 | 总次数 | 成功 | 失败 | 跳过 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...summary.countsByTool.map((item) => `| ${escapeMarkdownCell(item.tool)} | ${item.total} | ${item.ok} | ${item.error} | ${item.skipped} |`),
    '',
  ];

  const failures = ['## 失败调用', ''];
  if (summary.errors.length === 0) {
    failures.push('- 无');
    failures.push('');
  } else {
    for (const [index, item] of summary.errors.entries()) {
      failures.push(`### ${index + 1}. ${item.tool}`);
      failures.push('');
      failures.push(`- 时间：${item.timestamp ?? '未知'}`);
      failures.push(`- 类型：${item.toolType ?? '未知'}`);
      failures.push(`- 状态：${item.status ?? '未知'}`);
      if (item.summary) {
        failures.push(`- 摘要：${item.summary}`);
      }
      if (item.error) {
        failures.push(`- 错误：${item.error}`);
      }
      if (item.args !== undefined) {
        failures.push('- 参数：');
        failures.push('');
        failures.push('```json');
        failures.push(compactJson(item.args, 1200));
        failures.push('```');
      }
      failures.push('');
    }
  }

  const timeline = [
    '## 时间线',
    '',
    '| # | 时间 | 事件 | 名称/消息 | 状态 | 摘要 |',
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
    ? '<p class="muted">无失败调用。</p>'
    : summary.errors.map((item, index) => `
        <section class="card">
          <h3>${index + 1}. ${escapeHtml(item.tool)}</h3>
          <p><strong>时间：</strong>${escapeHtml(item.timestamp ?? '未知')}</p>
          <p><strong>类型：</strong>${escapeHtml(item.toolType ?? '未知')}</p>
          <p><strong>状态：</strong>${escapeHtml(item.status ?? '未知')}</p>
          ${item.summary ? `<p><strong>摘要：</strong>${escapeHtml(item.summary)}</p>` : ''}
          ${item.error ? `<p><strong>错误：</strong>${escapeHtml(item.error)}</p>` : ''}
          ${item.args !== undefined ? `<pre>${escapeHtml(compactJson(item.args, 1600))}</pre>` : ''}
        </section>
      `).join('\n');

  const toolRows = summary.countsByTool.length === 0
    ? '<tr><td colspan="5" class="muted">未记录工具调用。</td></tr>'
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
    ? '<tr><td colspan="4" class="muted">未记录 phase span。</td></tr>'
    : summary.phaseSummary.totals.map((item) => `
        <tr>
          <td>${escapeHtml(item.phase)}</td>
          <td>${item.count}</td>
          <td>${escapeHtml(item.totalDurationLabel)}</td>
          <td>${escapeHtml(item.maxDurationLabel)}</td>
        </tr>
      `).join('\n');

  const cacheKindRows = Object.entries(summary.cacheSummary.byKind).length === 0
    ? '<tr><td colspan="5" class="muted">未记录 stable cache 事件。</td></tr>'
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
    ? '<p class="muted">未记录 gate 决策。</p>'
    : summary.gateSummary.records.map((item, index) => `
        <section class="card">
          <h3>${index + 1}. ${escapeHtml(item.gate)}</h3>
          <p><strong>状态：</strong>${escapeHtml(item.status ?? 'unknown')}</p>
          <p><strong>原因：</strong>${escapeHtml(item.reasonCode ?? 'unknown')}</p>
          <p><strong>截停后续流程：</strong>${escapeHtml(String(Boolean(item.stoppedRemainingWork)))}</p>
          ${Array.isArray(item.findings) && item.findings.length > 0
            ? `<p><strong>发现：</strong>${escapeHtml(item.findings.map((finding) => normalizeItem(finding)).filter(Boolean).join('；'))}</p>`
            : '<p class="muted">未记录 findings。</p>'}
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
    ? '<p class="muted">未发现 save/mutate 与紧随其后的 readback 矛盾。</p>'
    : summary.readbackMismatches.map((item, index) => `
      <section class="card">
        <h3>${index + 1}. ${escapeHtml(item.writeTool)} -&gt; ${escapeHtml(item.readTool)}</h3>
        ${item.targetSignature ? `<p><strong>目标签名：</strong><code>${escapeHtml(item.targetSignature)}</code></p>` : ''}
        <p><strong>写入时间：</strong>${escapeHtml(item.writeTimestamp ?? '未知')}</p>
        <p><strong>写入摘要：</strong>${escapeHtml(item.writeSummary ?? '未提供')}</p>
        <p><strong>回读时间：</strong>${escapeHtml(item.readbackTimestamp ?? '未知')}</p>
        <p><strong>回读摘要：</strong>${escapeHtml(item.readbackSummary ?? '未提供')}</p>
        <p><strong>证据：</strong>${escapeHtml(item.evidence.join('；'))}</p>
      </section>
    `).join('\n');
  const readbackEvidenceInsufficientBlocks = summary.readbackEvidenceInsufficient.length === 0
    ? ''
    : `
      <div class="card">
        <h3>证据不足</h3>
        <ul>
          ${summary.readbackEvidenceInsufficient.map((item) => `<li>${escapeHtml(`${item.writeTool}${item.targetSignature ? ` (${item.targetSignature})` : ''}: ${item.reasonCode}；${item.detail}`)}</li>`).join('\n')}
        </ul>
      </div>
    `;
  const optimizationBlocks = summary.optimizationItems.map((item, index) => `
      <section class="card">
        <h3>${index + 1}. [${escapeHtml(item.priority)}] ${escapeHtml(item.title)}</h3>
        <p><strong>原因：</strong>${escapeHtml(item.reason)}</p>
        <p><strong>更快路径：</strong>${escapeHtml(item.fasterPath)}</p>
        ${item.evidence?.length ? `<p><strong>证据：</strong>${escapeHtml(item.evidence.join('；'))}</p>` : ''}
      </section>
    `).join('\n');
  const guardViolationItems = summary.guardSummary.violations.length === 0
    ? '<p class="muted">未发现带 blocker 继续写入的流程。</p>'
    : `<ul>${summary.guardSummary.violations.map((item) => `<li>${escapeHtml(`${item.writeTool} 在 blocker [${item.blockerCodes.join(', ')}] 之后继续写入`)}</li>`).join('\n')}</ul>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NocoBase UI Builder 复盘报告</title>
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
    <h1>复盘报告</h1>
    <p class="muted">生成时间：${escapeHtml(summary.generatedAt)}</p>

    <section class="meta">
      <article class="card"><strong>任务</strong><br>${escapeHtml(summary.start?.task ?? '未知')}</article>
      <article class="card"><strong>运行 ID</strong><br><code>${escapeHtml(summary.start?.runId ?? '未知')}</code></article>
      <article class="card"><strong>状态</strong><br>${escapeHtml(summary.finish?.status ?? '未完成')}</article>
      <article class="card"><strong>耗时</strong><br>${escapeHtml(summary.durationLabel)}</article>
      <article class="card"><strong>页面标题</strong><br>${escapeHtml(summary.start?.title ?? '未提供')}</article>
      <article class="card"><strong>schemaUid</strong><br>${escapeHtml(summary.start?.schemaUid ?? '未提供')}</article>
      <article class="card"><strong>页面地址</strong><br>${summary.pageUrl ? `<a href="${escapeHtml(summary.pageUrl.url)}">${escapeHtml(summary.pageUrl.url)}</a>` : '未记录'}</article>
    </section>

    <h2>结果轴</h2>
    <section class="stats">
      ${statusAxisCards}
    </section>

    <h2>概览</h2>
    <section class="stats">
      <article class="card"><strong>事件总数</strong><br>${summary.totalEvents}</article>
      <article class="card"><strong>工具调用</strong><br>${summary.totalToolCalls}</article>
      <article class="card"><strong>备注</strong><br>${summary.totalNotes}</article>
      <article class="card"><strong>phase 事件</strong><br>${summary.totalPhases}</article>
      <article class="card"><strong>gate 事件</strong><br>${summary.totalGates}</article>
      <article class="card"><strong>cache 事件</strong><br>${summary.totalCacheEvents}</article>
      <article class="card"><strong class="err">失败调用</strong><br>${summary.errorCount}</article>
      <article class="card"><strong>跳过调用</strong><br>${summary.skippedCount}</article>
    </section>

    <h2>阶段耗时画像</h2>
    <section class="stats">
      <article class="card"><strong>阶段数</strong><br>${summary.phaseSummary.totals.length}</article>
      <article class="card"><strong>已闭合 span</strong><br>${summary.phaseSummary.spans.length}</article>
      <article class="card"><strong>最慢阶段</strong><br>${escapeHtml(summary.phaseSummary.totals[0]?.phase ?? '未记录')}</article>
      <article class="card"><strong>最慢耗时</strong><br>${escapeHtml(summary.phaseSummary.totals[0]?.totalDurationLabel ?? '未知')}</article>
    </section>
    <table>
      <thead>
        <tr><th>阶段</th><th>次数</th><th>总耗时</th><th>最长单次</th></tr>
      </thead>
      <tbody>${phaseRows}</tbody>
    </table>

    <h2>Stable Cache 摘要</h2>
    <section class="stats">
      <article class="card"><strong>事件总数</strong><br>${summary.cacheSummary.total}</article>
      <article class="card"><strong>命中</strong><br>${summary.cacheSummary.hitCount}</article>
      <article class="card"><strong>miss</strong><br>${summary.cacheSummary.missCount}</article>
      <article class="card"><strong>store</strong><br>${summary.cacheSummary.storeCount}</article>
      <article class="card"><strong>invalidate</strong><br>${summary.cacheSummary.invalidateCount}</article>
      <article class="card"><strong>命中率</strong><br>${escapeHtml(summary.cacheSummary.hitRatio === null ? '未知' : `${Math.round(summary.cacheSummary.hitRatio * 100)}%`)}</article>
    </section>
    <table>
      <thead>
        <tr><th>Kind</th><th>总事件</th><th>Hit</th><th>Miss</th><th>Store/Invalidate</th></tr>
      </thead>
      <tbody>${cacheKindRows}</tbody>
    </table>

    <h2>Gate 摘要</h2>
    <section class="stats">
      <article class="card"><strong>gate 总数</strong><br>${summary.gateSummary.total}</article>
      <article class="card"><strong class="ok">通过</strong><br>${summary.gateSummary.passed}</article>
      <article class="card"><strong class="err">失败</strong><br>${summary.gateSummary.failed}</article>
      <article class="card"><strong>截停后续流程</strong><br>${summary.gateSummary.stopped}</article>
    </section>
    ${gateBlocks}

    <h2>Guard 摘要</h2>
    <section class="stats">
      <article class="card"><strong>canonicalize</strong><br>${summary.guardSummary.canonicalizeCount}</article>
      <article class="card"><strong>审计调用</strong><br>${summary.guardSummary.auditCount}</article>
      <article class="card"><strong>blocker</strong><br>${summary.guardSummary.blockerCount}</article>
      <article class="card"><strong>warning</strong><br>${summary.guardSummary.warningCount}</article>
      <article class="card"><strong>risk-accept</strong><br>${summary.guardSummary.riskAcceptCount}</article>
      <article class="card"><strong class="err">违规继续写入</strong><br>${summary.guardSummary.writeAfterBlockerWithoutRiskAcceptCount}</article>
    </section>
    <section class="card">
      ${guardViolationItems}
    </section>

    <h2>写后回读</h2>
    ${readbackBlocks}
    ${readbackEvidenceInsufficientBlocks}

    <h2>可改进点</h2>
    <section class="card">
      <ul>${suggestionItems}</ul>
    </section>

    <h2>自动改进建议</h2>
    ${optimizationBlocks}

    <h2>工具统计</h2>
    <table>
      <thead>
        <tr><th>工具</th><th>总次数</th><th>成功</th><th>失败</th><th>跳过</th></tr>
      </thead>
      <tbody>${toolRows}</tbody>
    </table>

    <h2>失败调用</h2>
    ${failureBlocks}

    <h2>时间线</h2>
    <table>
      <thead>
        <tr><th>#</th><th>时间</th><th>事件</th><th>名称/消息</th><th>状态</th><th>摘要</th></tr>
      </thead>
      <tbody>${timelineRows}</tbody>
    </table>

    <h2>源日志</h2>
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
