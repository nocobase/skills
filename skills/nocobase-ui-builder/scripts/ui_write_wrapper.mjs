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
import { remapConflictingDescendantUids } from './template_clone_helpers.mjs';
import {
  augmentReadbackContractWithGridMembership,
  buildReadbackDriftReport,
  validateReadbackContract,
} from './rest_template_clone_runner.mjs';
import { resolveSessionPaths } from './session_state.mjs';
import {
  appendNote,
  finishRun,
  recordGate,
  recordPhase,
  recordToolCall,
  startRun,
} from './tool_journal.mjs';

const WRITE_ACTIONS = {
  'create-v2': {
    endpointPath: '/api/desktopRoutes:createV2',
    method: 'POST',
    toolName: 'PostDesktoproutes_createv2',
    requiresGuard: false,
  },
  save: {
    endpointPath: '/api/flowModels:save',
    method: 'POST',
    toolName: 'PostFlowmodels_save',
    query: {
      return: 'model',
      includeAsyncNode: 'true',
    },
    requiresGuard: true,
  },
  mutate: {
    endpointPath: '/api/flowModels:mutate',
    method: 'POST',
    toolName: 'PostFlowmodels_mutate',
    query: {
      includeAsyncNode: 'true',
    },
    requiresGuard: true,
  },
  ensure: {
    endpointPath: '/api/flowModels:ensure',
    method: 'POST',
    toolName: 'PostFlowmodels_ensure',
    query: {
      includeAsyncNode: 'true',
    },
    requiresGuard: true,
  },
};

function usage() {
  return [
    'Usage:',
    '  node scripts/ui_write_wrapper.mjs run',
    '    --action <create-v2|save|mutate|ensure>',
    '    --task <task>',
    '    [--title <title>]',
    '    [--schema-uid <schemaUid>]',
    '    [--session-id <id>]',
    '    [--session-root <path>]',
    '    [--log-dir <path>]',
    '    [--latest-run-path <path>]',
    '    [--out-dir <path>]',
    '    [--url-base <http://127.0.0.1:23000 | http://127.0.0.1:23000/admin>]',
    '    [--token <token>]',
    '    [--request-json <json> | --request-file <path>]',
    '    [--payload-json <json> | --payload-file <path>]',
    '    [--metadata-json <json> | --metadata-file <path>]',
    '    [--requirements-json <json> | --requirements-file <path>]',
    '    [--readback-contract-json <json> | --readback-contract-file <path>]',
    '    [--risk-accept <code> ...]',
    '    [--mode <general|validation-case>]',
    '    [--nocobase-root <path>]',
    '    [--snapshot-file <path>]',
    '    [--target-signature <signature>]',
    '    [--readback-parent-id <id>]',
    '    [--readback-sub-key <subKey>]',
    '',
    'Notes:',
    '  - 这是 nocobase-ui-builder 的统一写入口；默认禁止裸 PostFlowmodels_save/mutate/ensure/createV2。',
    '  - create-v2 会自动补 route-ready 与 page/grid anchor 读取。',
    '  - save/mutate/ensure 会先跑 canonicalizePayload -> auditPayload，再执行写入与 readback。',
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

function normalizeRequiredText(value, label) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function readJsonInput(jsonValue, fileValue, label, { required = true } = {}) {
  if (jsonValue && fileValue) {
    throw new Error(`${label} accepts either inline json or file, not both`);
  }
  if (jsonValue) {
    return JSON.parse(jsonValue);
  }
  if (fileValue) {
    return JSON.parse(fs.readFileSync(path.resolve(fileValue), 'utf8'));
  }
  if (required) {
    throw new Error(`${label} is required`);
  }
  return null;
}

function writeJson(filePath, value) {
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFlowModelNode(value) {
  return isPlainObject(value) && (
    typeof value.use === 'string'
    || typeof value.uid === 'string'
    || isPlainObject(value.subModels)
  );
}

function walkFlowModelTree(node, visitor, pathValue = '$', parentLink = null) {
  if (!isFlowModelNode(node)) {
    return;
  }
  visitor(node, pathValue, parentLink);
  const currentUid = normalizeOptionalText(node.uid);
  const currentUse = normalizeOptionalText(node.use);
  const subModels = isPlainObject(node.subModels) ? node.subModels : {};
  for (const [subKey, child] of Object.entries(subModels)) {
    if (Array.isArray(child)) {
      child.forEach((item, index) => walkFlowModelTree(item, visitor, `${pathValue}.subModels.${subKey}[${index}]`, {
        parentUid: currentUid,
        parentUse: currentUse,
        subKey,
        subType: 'array',
      }));
      continue;
    }
    walkFlowModelTree(child, visitor, `${pathValue}.subModels.${subKey}`, {
      parentUid: currentUid,
      parentUse: currentUse,
      subKey,
      subType: 'object',
    });
  }
}

function buildLiveTopology(tree) {
  const byUid = {};
  walkFlowModelTree(tree, (node, pathValue, parentLink) => {
    const uid = normalizeOptionalText(node.uid);
    if (!uid) {
      return;
    }
    byUid[uid] = {
      uid,
      path: pathValue,
      use: normalizeOptionalText(node.use),
      parentId: normalizeOptionalText(node.parentId) || normalizeOptionalText(parentLink?.parentUid),
      subKey: normalizeOptionalText(node.subKey) || normalizeOptionalText(parentLink?.subKey),
      subType: normalizeOptionalText(node.subType) || normalizeOptionalText(parentLink?.subType),
    };
  });
  return {
    source: 'findOne',
    nodeCount: Object.keys(byUid).length,
    byUid,
  };
}

function normalizeUrlBase(urlBase) {
  const normalized = normalizeRequiredText(urlBase || 'http://127.0.0.1:23000', 'url base')
    .replace(/\/+$/, '');
  if (normalized.endsWith('/admin')) {
    return {
      apiBase: normalized.slice(0, -'/admin'.length),
      adminBase: normalized,
    };
  }
  return {
    apiBase: normalized,
    adminBase: `${normalized}/admin`,
  };
}

function buildPageUrl(adminBase, schemaUid) {
  return `${adminBase.replace(/\/+$/, '')}/${encodeURIComponent(schemaUid)}`;
}

function unwrapResponseEnvelope(value) {
  let current = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (!trimmed) {
        return current;
      }
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return current;
      }
    }
    if (!isPlainObject(current)) {
      return current;
    }
    if (Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data;
      continue;
    }
    return current;
  }
  return current;
}

function buildRequestUrl(apiBase, endpointPath, query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(isPlainObject(query) ? query : {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return `${apiBase}${endpointPath}${suffix ? `?${suffix}` : ''}`;
}

async function requestJson({ method = 'GET', url, token, body }) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawText = await response.text();
  let parsed = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = rawText;
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${method} ${url}`);
    error.status = response.status;
    error.response = parsed;
    throw error;
  }
  return {
    status: response.status,
    raw: parsed,
    data: unwrapResponseEnvelope(parsed),
  };
}

async function fetchAnchorModel({ apiBase, token, parentId, subKey }) {
  const url = buildRequestUrl(apiBase, '/api/flowModels:findOne', {
    parentId,
    subKey,
    includeAsyncNode: 'true',
  });
  return requestJson({ method: 'GET', url, token });
}

async function fetchAccessibleTree({ apiBase, token }) {
  const url = buildRequestUrl(apiBase, '/api/desktopRoutes:listAccessible', {
    tree: 'true',
    sort: 'sort',
  });
  return requestJson({ method: 'GET', url, token });
}

function normalizeChartProbeField(value) {
  if (Array.isArray(value)) {
    const segments = value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (segments.length === 0) {
      return '';
    }
    if (segments.length === 1) {
      return segments[0];
    }
    return segments;
  }
  return normalizeOptionalText(value);
}

function serializeChartProbeField(value) {
  if (Array.isArray(value)) {
    return value.join('.');
  }
  return normalizeOptionalText(value);
}

function normalizeChartProbeMeasures(values) {
  return (Array.isArray(values) ? values : [])
    .filter((item) => isPlainObject(item))
    .map((item) => {
      const field = normalizeChartProbeField(item.field);
      if (!field) {
        return null;
      }
      const alias = normalizeOptionalText(item.alias)
        || (normalizeOptionalText(item.aggregation) ? serializeChartProbeField(field) : '');
      return {
        ...item,
        field,
        ...(alias ? { alias } : {}),
      };
    })
    .filter(Boolean);
}

function normalizeChartProbeDimensions(values) {
  return (Array.isArray(values) ? values : [])
    .filter((item) => isPlainObject(item))
    .map((item) => {
      const field = normalizeChartProbeField(item.field);
      if (!field) {
        return null;
      }
      const alias = normalizeOptionalText(item.alias)
        || (normalizeOptionalText(item.format) ? serializeChartProbeField(field) : '');
      return {
        ...item,
        field,
        ...(alias ? { alias } : {}),
      };
    })
    .filter(Boolean);
}

function normalizeChartProbeOrders(values) {
  return (Array.isArray(values) ? values : [])
    .filter((item) => isPlainObject(item))
    .map((item) => {
      const field = normalizeChartProbeField(item.field);
      if (!field) {
        return null;
      }
      const alias = normalizeOptionalText(item.alias) || serializeChartProbeField(field);
      return {
        ...item,
        field,
        ...(alias ? { alias } : {}),
      };
    })
    .filter(Boolean);
}

function collectChartBlocks(tree) {
  const chartBlocks = [];
  walkFlowModelTree(tree, (node, pathValue) => {
    if (normalizeOptionalText(node.use) !== 'ChartBlockModel') {
      return;
    }
    chartBlocks.push({
      uid: normalizeOptionalText(node.uid),
      title: normalizeOptionalText(node.title),
      path: pathValue,
      query: cloneJson(node.stepParams?.chartSettings?.configure?.query ?? null),
    });
  });
  return chartBlocks;
}

function getProbeRowCount(data) {
  if (Array.isArray(data)) {
    return data.length;
  }
  if (isPlainObject(data) && Array.isArray(data.data)) {
    return data.data.length;
  }
  if (data === null || data === undefined) {
    return 0;
  }
  return 1;
}

async function runChartDataProbe({ chartBlock, apiBase, token, logPath }) {
  const query = isPlainObject(chartBlock.query) ? chartBlock.query : {};
  const queryMode = normalizeOptionalText(query.mode) || (normalizeOptionalText(query.sql) ? 'sql' : 'builder');

  try {
    if (queryMode === 'sql') {
      const requestBody = {
        sql: normalizeOptionalText(query.sql),
        dataSourceKey: normalizeOptionalText(query.sqlDatasource) || 'main',
        type: 'selectRows',
      };
      const response = await requestJson({
        method: 'POST',
        url: buildRequestUrl(apiBase, '/api/flowSql:run'),
        token,
        body: requestBody,
      });
      const rowCount = getProbeRowCount(response.data);
      const probe = {
        uid: chartBlock.uid,
        title: chartBlock.title,
        path: chartBlock.path,
        mode: 'sql',
        ok: true,
        rowCount,
        dataSourceKey: requestBody.dataSourceKey,
      };
      recordToolCall({
        logPath,
        tool: 'flowSql:run',
        toolType: 'node',
        status: 'ok',
        args: {
          uid: chartBlock.uid || undefined,
          mode: 'sql',
        },
        summary: 'wrapper chart data probe completed',
        result: {
          rowCount,
          dataSourceKey: requestBody.dataSourceKey,
        },
      });
      return probe;
    }

    const collectionPath = Array.isArray(query.collectionPath)
      ? query.collectionPath
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
      : [];
    const [dataSource = 'main', collection = ''] = collectionPath;
    const requestBody = {
      uid: chartBlock.uid || undefined,
      dataSource,
      collection,
      mode: 'builder',
      filter: query.filter,
      orders: normalizeChartProbeOrders(query.orders),
      limit: query.limit,
      offset: query.offset,
      measures: normalizeChartProbeMeasures(query.measures),
      dimensions: normalizeChartProbeDimensions(query.dimensions),
    };
    const response = await requestJson({
      method: 'POST',
      url: buildRequestUrl(apiBase, '/api/charts:query'),
      token,
      body: requestBody,
    });
    const rowCount = getProbeRowCount(response.data);
    const probe = {
      uid: chartBlock.uid,
      title: chartBlock.title,
      path: chartBlock.path,
      mode: 'builder',
      ok: true,
      rowCount,
      dataSource,
      collection,
    };
    recordToolCall({
      logPath,
      tool: 'charts:query',
      toolType: 'node',
      status: 'ok',
      args: {
        uid: chartBlock.uid || undefined,
        mode: 'builder',
        dataSource,
        collection,
      },
      summary: 'wrapper chart data probe completed',
      result: {
        rowCount,
        dataSource,
        collection,
      },
    });
    return probe;
  } catch (error) {
    const serializedError = summarizeError(error);
    const probe = {
      uid: chartBlock.uid,
      title: chartBlock.title,
      path: chartBlock.path,
      mode: queryMode,
      ok: false,
      error: serializedError,
    };
    recordToolCall({
      logPath,
      tool: queryMode === 'sql' ? 'flowSql:run' : 'charts:query',
      toolType: 'node',
      status: 'error',
      args: {
        uid: chartBlock.uid || undefined,
        mode: queryMode,
      },
      summary: 'wrapper chart data probe failed',
      error: serializedError.message,
      result: serializedError.response ?? undefined,
    });
    return probe;
  }
}

async function probeChartDataReadiness({ tree, apiBase, token, logPath }) {
  const chartBlocks = collectChartBlocks(tree);
  if (chartBlocks.length === 0) {
    return {
      probes: [],
      statusAxis: {
        status: 'not-recorded',
        detail: '本次 readback 未发现 ChartBlockModel。',
      },
    };
  }

  const probes = [];
  for (const chartBlock of chartBlocks) {
    probes.push(await runChartDataProbe({
      chartBlock,
      apiBase,
      token,
      logPath,
    }));
  }

  const failedProbes = probes.filter((item) => item.ok === false);
  if (failedProbes.length > 0) {
    return {
      probes,
      statusAxis: {
        status: 'failed',
        detail: `${failedProbes.length}/${probes.length} 个图表数据探测失败。`,
      },
    };
  }

  const zeroRowCount = probes.filter((item) => item.rowCount === 0).length;
  const totalRows = probes.reduce((sum, item) => sum + (Number.isInteger(item.rowCount) ? item.rowCount : 0), 0);
  const detail = zeroRowCount > 0
    ? `已验证 ${probes.length} 个图表查询，累计返回 ${totalRows} 行，其中 ${zeroRowCount} 个图表返回 0 行。`
    : `已验证 ${probes.length} 个图表查询，累计返回 ${totalRows} 行。`;
  return {
    probes,
    statusAxis: {
      status: 'ready',
      detail,
    },
  };
}

function probeRouteReady(routeTree, schemaUid) {
  const nodes = Array.isArray(routeTree) ? routeTree : [];
  const flat = [];
  const visit = (items, parent = null) => {
    for (const node of Array.isArray(items) ? items : []) {
      if (!isPlainObject(node)) {
        continue;
      }
      flat.push({ node, parent });
      visit(node.children, node);
    }
  };
  visit(nodes);
  const pageNode = flat.find((entry) => entry.node?.schemaUid === schemaUid)?.node || null;
  const defaultTabSchemaUid = `tabs-${schemaUid}`;
  const defaultTabNode = pageNode
    ? (Array.isArray(pageNode.children)
      ? pageNode.children.find((item) => item?.schemaUid === defaultTabSchemaUid) ?? null
      : null)
    : null;
  return {
    ok: Boolean(pageNode && defaultTabNode),
    pageFound: Boolean(pageNode),
    defaultTabFound: Boolean(defaultTabNode),
    pageType: pageNode?.type || '',
    defaultTabType: defaultTabNode?.type || '',
    defaultTabHidden: Boolean(defaultTabNode?.hidden),
  };
}

function summarizeNode(node) {
  if (!isPlainObject(node)) {
    return {
      present: false,
    };
  }
  return {
    present: true,
    uid: normalizeOptionalText(node.uid),
    use: normalizeOptionalText(node.use),
    title: normalizeOptionalText(node.title),
  };
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

function summarizeAudit(auditResult) {
  return {
    ok: auditResult.ok,
    blockerCount: Array.isArray(auditResult.blockers) ? auditResult.blockers.length : 0,
    warningCount: Array.isArray(auditResult.warnings) ? auditResult.warnings.length : 0,
    metadataCoverage: auditResult.metadataCoverage ?? null,
  };
}

function summarizeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    status: Number.isInteger(error?.status) ? error.status : null,
    response: error?.response ?? null,
  };
}

function buildDefaultOutDir({ sessionId, sessionRoot, runId }) {
  const sessionPaths = resolveSessionPaths({ sessionId, sessionRoot });
  return path.join(sessionPaths.artifactDir, 'ui-write-wrapper', runId);
}

function toRiskAcceptList(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function markSkippedPhase(logPath, phase, reason) {
  recordPhase({
    logPath,
    phase,
    event: 'end',
    status: 'skipped',
    attributes: reason ? { reason } : undefined,
  });
}

function determineWriteStatus({ action, guardBlocked, writeError, routeReadyOk, pageAnchorOk, gridAnchorOk, readbackResult, driftOk, contractOk }) {
  if (guardBlocked || writeError) {
    return 'failed';
  }
  if (action === 'create-v2') {
    if (!routeReadyOk || !pageAnchorOk || !gridAnchorOk) {
      return 'partial';
    }
    return 'success';
  }
  if (!isPlainObject(readbackResult?.data)) {
    return 'failed';
  }
  if (driftOk === false || contractOk === false) {
    return 'partial';
  }
  return 'success';
}

async function executeWrapperAction({
  action,
  apiBase,
  token,
  requestBody,
}) {
  const actionDef = WRITE_ACTIONS[action];
  const url = buildRequestUrl(apiBase, actionDef.endpointPath, actionDef.query);
  return requestJson({
    method: actionDef.method,
    url,
    token,
    body: requestBody,
  });
}

function normalizeWrapperOptions(options = {}) {
  const action = normalizeRequiredText(options.action, 'action');
  const actionDef = WRITE_ACTIONS[action];
  if (!actionDef) {
    throw new Error(`Unsupported action "${action}"`);
  }

  const requestProvided = options.requestBody !== undefined;
  const requestBody = requestProvided ? cloneJson(options.requestBody) : null;
  const payload = options.payload !== undefined ? cloneJson(options.payload) : null;
  const metadata = options.metadata !== undefined ? cloneJson(options.metadata) : {};
  const requirements = options.requirements !== undefined ? cloneJson(options.requirements) : {};
  const readbackContract = options.readbackContract !== undefined ? cloneJson(options.readbackContract) : null;

  if (action === 'create-v2' && !requestBody) {
    throw new Error('action "create-v2" requires request body');
  }
  if (actionDef.requiresGuard && !payload && !requestBody) {
    throw new Error(`action "${action}" requires payload or request body`);
  }

  return {
    action,
    actionDef,
    task: normalizeRequiredText(options.task, 'task'),
    title: normalizeOptionalText(options.title),
    schemaUid: normalizeOptionalText(options.schemaUid),
    urlBase: normalizeOptionalText(options.urlBase) || 'http://127.0.0.1:23000',
    token: normalizeRequiredText(options.token ?? process.env.NOCOBASE_API_TOKEN, 'NOCOBASE_API_TOKEN'),
    requestBody,
    payload,
    requestProvided,
    metadata,
    requirements,
    readbackContract,
    riskAccept: toRiskAcceptList(options.riskAccept),
    mode: normalizeOptionalText(options.mode) || DEFAULT_AUDIT_MODE,
    nocobaseRoot: normalizeOptionalText(options.nocobaseRoot),
    snapshotFile: normalizeOptionalText(options.snapshotFile),
    targetSignature: normalizeOptionalText(options.targetSignature),
    readbackParentId: normalizeOptionalText(options.readbackParentId),
    readbackSubKey: normalizeOptionalText(options.readbackSubKey),
    sessionId: normalizeOptionalText(options.sessionId),
    sessionRoot: normalizeOptionalText(options.sessionRoot),
    logDir: normalizeOptionalText(options.logDir),
    latestRunPath: normalizeOptionalText(options.latestRunPath),
    outDir: normalizeOptionalText(options.outDir),
  };
}

export async function runUiWriteWrapper(options = {}) {
  const normalized = normalizeWrapperOptions(options);
  const { action, actionDef } = normalized;
  const { apiBase, adminBase } = normalizeUrlBase(normalized.urlBase);
  const run = startRun({
    task: normalized.task,
    title: normalized.title || undefined,
    schemaUid: normalized.schemaUid || undefined,
    sessionId: normalized.sessionId || undefined,
    sessionRoot: normalized.sessionRoot || undefined,
    logDir: normalized.logDir || undefined,
    latestRunPath: normalized.latestRunPath || undefined,
    metadata: {
      wrapperOnly: true,
      action,
    },
  });
  const outDir = normalized.outDir
    ? path.resolve(normalized.outDir)
    : buildDefaultOutDir({
      sessionId: run.sessionId,
      sessionRoot: run.sessionRoot,
      runId: run.runId,
    });
  fs.mkdirSync(outDir, { recursive: true });

  const summary = {
    runId: run.runId,
    logPath: run.logPath,
    action,
    status: 'failed',
    wrapperOnly: true,
    outDir,
    pageUrl: '',
    schemaUid: normalized.schemaUid,
    targetSignature: normalized.targetSignature || '',
    artifactPaths: {},
    statusAxes: {},
    notes: [],
  };

  appendNote({
    logPath: run.logPath,
    message: 'wrapper-only write path engaged',
    data: {
      type: 'wrapper_only',
      action,
    },
  });

  recordPhase({
    logPath: run.logPath,
    phase: 'schema_discovery',
    event: 'end',
    status: 'skipped',
    attributes: {
      reason: 'wrapper expects precomputed target metadata or explicit request payload',
    },
  });

  let guardPayload = normalized.payload || normalized.requestBody;
  let requestBody = normalized.requestBody;
  let canonicalizeResult = null;
  let auditResult = null;
  let effectiveMetadata = normalized.metadata;
  let initialAuditResult = null;

  try {
    if (actionDef.requiresGuard) {
      if (!normalized.readbackParentId || !normalized.readbackSubKey) {
        throw new Error(`action "${action}" requires --readback-parent-id and --readback-sub-key`);
      }

      recordPhase({
        logPath: run.logPath,
        phase: 'stable_metadata',
        event: 'start',
        status: 'running',
      });

      writeJson(path.join(outDir, 'payload.draft.json'), guardPayload);
      summary.artifactPaths.payloadDraft = path.join(outDir, 'payload.draft.json');
      if (requestBody !== null) {
        writeJson(path.join(outDir, 'request.raw.json'), requestBody);
        summary.artifactPaths.requestRaw = path.join(outDir, 'request.raw.json');
      }

      canonicalizeResult = canonicalizePayload({
        payload: guardPayload,
        metadata: normalized.metadata,
        mode: normalized.mode,
        nocobaseRoot: normalized.nocobaseRoot || undefined,
        snapshotPath: normalized.snapshotFile || undefined,
      });
      writeJson(path.join(outDir, 'canonicalize-result.json'), canonicalizeResult);
      writeJson(path.join(outDir, 'payload.canonical.json'), canonicalizeResult.payload);
      summary.artifactPaths.canonicalizeResult = path.join(outDir, 'canonicalize-result.json');
      summary.artifactPaths.payloadCanonical = path.join(outDir, 'payload.canonical.json');

      initialAuditResult = auditPayload({
        payload: canonicalizeResult.payload,
        metadata: normalized.metadata,
        mode: normalized.mode,
        riskAccept: normalized.riskAccept,
        requirements: normalized.requirements,
        nocobaseRoot: normalized.nocobaseRoot || undefined,
        snapshotPath: normalized.snapshotFile || undefined,
      });
      writeJson(path.join(outDir, 'audit.initial.json'), initialAuditResult);
      summary.artifactPaths.auditInitial = path.join(outDir, 'audit.initial.json');
      if (!initialAuditResult.ok) {
        summary.audit = summarizeAudit(initialAuditResult);

        recordToolCall({
          logPath: run.logPath,
          tool: 'node scripts/preflight_write_gate.mjs',
          toolType: 'node',
          status: 'error',
          args: {
            action,
          },
          summary: 'wrapper preflight blocked before live-topology probe',
          result: {
            mode: normalized.mode,
            canonicalize: summarizeCanonicalize(canonicalizeResult),
            audit: summarizeAudit(initialAuditResult),
          },
        });

        recordPhase({
          logPath: run.logPath,
          phase: 'stable_metadata',
          event: 'end',
          status: 'error',
          attributes: {
            blockerCount: initialAuditResult.blockers.length,
            warningCount: initialAuditResult.warnings.length,
          },
        });

        recordGate({
          logPath: run.logPath,
          gate: 'preflight_write',
          status: 'failed',
          reasonCode: 'WRAPPER_GUARD_BLOCKED',
          findings: initialAuditResult.blockers,
          stoppedRemainingWork: true,
          data: {
            blockerCount: initialAuditResult.blockers.length,
            warningCount: initialAuditResult.warnings.length,
          },
        });

        summary.status = 'failed';
        summary.guardBlocked = true;
        summary.notes.push('guard 命中 blocker，wrapper 已阻断实际写入。');
        markSkippedPhase(run.logPath, 'write', 'guard blocked');
        markSkippedPhase(run.logPath, 'readback', 'write blocked by guard');
        markSkippedPhase(run.logPath, 'browser_attach', 'browser not requested');
        markSkippedPhase(run.logPath, 'smoke', 'browser not requested');
        writeJson(path.join(outDir, 'summary.json'), summary);
        summary.artifactPaths.summary = path.join(outDir, 'summary.json');
        finishRun({
          logPath: run.logPath,
          status: 'failed',
          summary: 'wrapper blocked write on preflight guard',
          data: summary,
        });
        return summary;
      }

      try {
        const liveProbeResult = await fetchAnchorModel({
          apiBase,
          token: normalized.token,
          parentId: normalized.readbackParentId,
          subKey: normalized.readbackSubKey,
        });
        writeJson(path.join(outDir, 'live-topology.json'), liveProbeResult.raw);
        summary.artifactPaths.liveTopology = path.join(outDir, 'live-topology.json');
        const liveTopology = buildLiveTopology(liveProbeResult.data);
        effectiveMetadata = {
          ...normalized.metadata,
          liveTopology,
        };
        summary.liveTopology = {
          source: liveTopology.source,
          nodeCount: liveTopology.nodeCount,
        };
        recordToolCall({
          logPath: run.logPath,
          tool: 'GetFlowmodels_findone',
          toolType: 'node',
          status: 'ok',
          args: {
            action,
            parentId: normalized.readbackParentId,
            subKey: normalized.readbackSubKey,
            targetSignature: normalized.targetSignature || undefined,
          },
          summary: 'wrapper fetched live topology before write',
          result: {
            nodeCount: liveTopology.nodeCount,
          },
        });

        const liveRemapResult = remapConflictingDescendantUids({
          model: canonicalizeResult.payload,
          liveTopology,
          uidSeed: normalized.targetSignature || normalized.readbackParentId,
        });
        if (liveRemapResult.changed) {
          canonicalizeResult.payload = liveRemapResult.payload;
          writeJson(path.join(outDir, 'live-topology-remap.json'), liveRemapResult);
          writeJson(path.join(outDir, 'payload.remapped.json'), liveRemapResult.payload);
          summary.artifactPaths.liveTopologyRemap = path.join(outDir, 'live-topology-remap.json');
          summary.artifactPaths.payloadRemapped = path.join(outDir, 'payload.remapped.json');
          summary.liveTopologyRemap = {
            changed: true,
            remappedNodeCount: liveRemapResult.remappedNodes.length,
          };
          summary.notes.push(`live topology remap 已刷新 ${liveRemapResult.remappedNodes.length} 个冲突 descendant uid。`);
          recordToolCall({
            logPath: run.logPath,
            tool: 'template_clone_helpers.remapConflictingDescendantUids',
            toolType: 'node',
            status: 'ok',
            args: {
              action,
              targetSignature: normalized.targetSignature || undefined,
            },
            summary: 'wrapper remapped conflicting descendant uids before write',
            result: {
              changed: true,
              remappedNodeCount: liveRemapResult.remappedNodes.length,
            },
          });
        }
      } catch (error) {
        const liveProbeError = {
          message: error instanceof Error ? error.message : String(error),
          status: Number.isInteger(error?.status) ? error.status : null,
          response: error?.response ?? null,
        };
        writeJson(path.join(outDir, 'live-topology-error.json'), liveProbeError);
        summary.artifactPaths.liveTopologyError = path.join(outDir, 'live-topology-error.json');
        summary.notes.push(`live topology probe 失败，将跳过 auto-remap: ${liveProbeError.message}`);
        recordToolCall({
          logPath: run.logPath,
          tool: 'GetFlowmodels_findone',
          toolType: 'node',
          status: 'error',
          args: {
            action,
            parentId: normalized.readbackParentId,
            subKey: normalized.readbackSubKey,
            targetSignature: normalized.targetSignature || undefined,
          },
          summary: 'wrapper failed to fetch live topology before write',
          error: liveProbeError.message,
        });
      }

      auditResult = auditPayload({
        payload: canonicalizeResult.payload,
        metadata: effectiveMetadata,
        mode: normalized.mode,
        riskAccept: normalized.riskAccept,
        requirements: normalized.requirements,
        nocobaseRoot: normalized.nocobaseRoot || undefined,
        snapshotPath: normalized.snapshotFile || undefined,
      });
      writeJson(path.join(outDir, 'audit.json'), auditResult);
      summary.artifactPaths.audit = path.join(outDir, 'audit.json');
      summary.audit = summarizeAudit(auditResult);

      recordToolCall({
        logPath: run.logPath,
        tool: 'node scripts/preflight_write_gate.mjs',
        toolType: 'node',
        status: auditResult.ok ? 'ok' : 'error',
        args: {
          action,
        },
        summary: auditResult.ok ? 'wrapper preflight passed' : 'wrapper preflight blocked',
        result: {
          mode: normalized.mode,
          canonicalize: summarizeCanonicalize(canonicalizeResult),
          audit: summarizeAudit(auditResult),
        },
      });

      recordPhase({
        logPath: run.logPath,
        phase: 'stable_metadata',
        event: 'end',
        status: auditResult.ok ? 'ok' : 'error',
        attributes: {
          blockerCount: auditResult.blockers.length,
          warningCount: auditResult.warnings.length,
        },
      });

      recordGate({
        logPath: run.logPath,
        gate: 'preflight_write',
        status: auditResult.ok ? 'passed' : 'failed',
        reasonCode: auditResult.ok ? 'WRAPPER_GUARD_PASSED' : 'WRAPPER_GUARD_BLOCKED',
        findings: auditResult.ok ? auditResult.warnings : auditResult.blockers,
        stoppedRemainingWork: !auditResult.ok,
        data: {
          blockerCount: auditResult.blockers.length,
          warningCount: auditResult.warnings.length,
        },
      });

      if (!auditResult.ok) {
        summary.status = 'failed';
        summary.guardBlocked = true;
        summary.notes.push('guard 命中 blocker，wrapper 已阻断实际写入。');
        markSkippedPhase(run.logPath, 'write', 'guard blocked');
        markSkippedPhase(run.logPath, 'readback', 'write blocked by guard');
        markSkippedPhase(run.logPath, 'browser_attach', 'browser not requested');
        markSkippedPhase(run.logPath, 'smoke', 'browser not requested');
        writeJson(path.join(outDir, 'summary.json'), summary);
        summary.artifactPaths.summary = path.join(outDir, 'summary.json');
        finishRun({
          logPath: run.logPath,
          status: 'failed',
          summary: 'wrapper blocked write on preflight guard',
          data: summary,
        });
        return summary;
      }

      guardPayload = canonicalizeResult.payload;
      if (!normalized.requestProvided) {
        requestBody = guardPayload;
      }
    } else {
      markSkippedPhase(run.logPath, 'stable_metadata', 'guard not required for create-v2');
    }

    recordPhase({
      logPath: run.logPath,
      phase: 'write',
      event: 'start',
      status: 'running',
    });

    const writeResult = await executeWrapperAction({
      action,
      apiBase,
      token: normalized.token,
      requestBody: requestBody ?? normalized.requestBody,
    });
    const writeArtifactPath = path.join(outDir, `${action}.result.json`);
    writeJson(writeArtifactPath, writeResult.raw);
    summary.artifactPaths.writeResult = writeArtifactPath;

    recordToolCall({
      logPath: run.logPath,
      tool: actionDef.toolName,
      toolType: 'node',
      status: 'ok',
      args: {
        action,
        targetSignature: normalized.targetSignature || undefined,
        readbackParentId: normalized.readbackParentId || undefined,
        readbackSubKey: normalized.readbackSubKey || undefined,
      },
      summary: `wrapper ${action} completed`,
      result: {
        status: writeResult.status,
        summary: summarizeNode(writeResult.data),
      },
    });

    recordPhase({
      logPath: run.logPath,
      phase: 'write',
      event: 'end',
      status: 'ok',
      attributes: {
        action,
      },
    });

    recordPhase({
      logPath: run.logPath,
      phase: 'readback',
      event: 'start',
      status: 'running',
    });

    let routeReady = null;
    let pageAnchor = null;
    let gridAnchor = null;
    let readbackResult = null;
    let readbackDiffResult = null;
    let readbackContractResult = null;
    let chartDataProbeResult = null;

    if (action === 'create-v2') {
      const schemaUid = normalized.schemaUid || normalizeOptionalText(requestBody?.schemaUid);
      summary.schemaUid = schemaUid;
      summary.pageUrl = schemaUid ? buildPageUrl(adminBase, schemaUid) : '';

      const routeTreeResult = await fetchAccessibleTree({
        apiBase,
        token: normalized.token,
      });
      const routeTreePath = path.join(outDir, 'route-tree.json');
      writeJson(routeTreePath, routeTreeResult.raw);
      summary.artifactPaths.routeTree = routeTreePath;
      routeReady = probeRouteReady(Array.isArray(routeTreeResult.data) ? routeTreeResult.data : [], schemaUid);
      summary.routeReady = routeReady;

      recordToolCall({
        logPath: run.logPath,
        tool: 'GetDesktoproutes_listaccessible',
        toolType: 'node',
        status: 'ok',
        args: {
          tree: true,
          schemaUid,
        },
        summary: routeReady.ok ? 'wrapper route-ready confirmed' : 'wrapper route-ready partial',
        result: routeReady,
      });

      pageAnchor = await fetchAnchorModel({
        apiBase,
        token: normalized.token,
        parentId: schemaUid,
        subKey: 'page',
      });
      const pageAnchorPath = path.join(outDir, 'anchor-page.json');
      writeJson(pageAnchorPath, pageAnchor.raw);
      summary.artifactPaths.anchorPage = pageAnchorPath;

      gridAnchor = await fetchAnchorModel({
        apiBase,
        token: normalized.token,
        parentId: `tabs-${schemaUid}`,
        subKey: 'grid',
      });
      const gridAnchorPath = path.join(outDir, 'anchor-grid.json');
      writeJson(gridAnchorPath, gridAnchor.raw);
      summary.artifactPaths.anchorGrid = gridAnchorPath;

      recordToolCall({
        logPath: run.logPath,
        tool: 'GetFlowmodels_findone',
        toolType: 'node',
        status: 'ok',
        args: {
          targetSignature: `page:${schemaUid}`,
          parentId: schemaUid,
          subKey: 'page',
        },
        summary: 'wrapper page anchor readback completed',
        result: summarizeNode(pageAnchor.data),
      });
      recordToolCall({
        logPath: run.logPath,
        tool: 'GetFlowmodels_findone',
        toolType: 'node',
        status: 'ok',
        args: {
          targetSignature: `grid:tabs-${schemaUid}`,
          parentId: `tabs-${schemaUid}`,
          subKey: 'grid',
        },
        summary: 'wrapper grid anchor readback completed',
        result: summarizeNode(gridAnchor.data),
      });
    } else {
      readbackResult = await fetchAnchorModel({
        apiBase,
        token: normalized.token,
        parentId: normalized.readbackParentId,
        subKey: normalized.readbackSubKey,
      });
      const readbackPath = path.join(outDir, 'readback.json');
      writeJson(readbackPath, readbackResult.raw);
      summary.artifactPaths.readback = readbackPath;

      recordToolCall({
        logPath: run.logPath,
        tool: 'GetFlowmodels_findone',
        toolType: 'node',
        status: 'ok',
        args: {
          targetSignature: normalized.targetSignature || undefined,
          parentId: normalized.readbackParentId,
          subKey: normalized.readbackSubKey,
        },
        summary: 'wrapper write readback completed',
        result: summarizeNode(readbackResult.data),
      });

      readbackDiffResult = buildReadbackDriftReport(guardPayload, readbackResult.data);
      const diffPath = path.join(outDir, 'readback-diff.json');
      writeJson(diffPath, readbackDiffResult);
      summary.artifactPaths.readbackDiff = diffPath;
      summary.readbackDiff = readbackDiffResult.summary;

      if (normalized.readbackContract) {
        const effectiveReadbackContract = augmentReadbackContractWithGridMembership(
          normalized.readbackContract,
          guardPayload,
        );
        const effectiveContractPath = path.join(outDir, 'effective-readback-contract.json');
        writeJson(effectiveContractPath, effectiveReadbackContract);
        summary.artifactPaths.effectiveReadbackContract = effectiveContractPath;
        readbackContractResult = validateReadbackContract(readbackResult.data, effectiveReadbackContract);
        const contractPath = path.join(outDir, 'readback-contract.json');
        writeJson(contractPath, readbackContractResult);
        summary.artifactPaths.readbackContract = contractPath;
        summary.readbackContract = {
          ok: readbackContractResult.ok,
          findingCount: readbackContractResult.findings.length,
        };
      }

      chartDataProbeResult = await probeChartDataReadiness({
        tree: readbackResult.data,
        apiBase,
        token: normalized.token,
        logPath: run.logPath,
      });
      const chartDataProbePath = path.join(outDir, 'chart-data-probes.json');
      writeJson(chartDataProbePath, chartDataProbeResult);
      summary.artifactPaths.chartDataProbes = chartDataProbePath;
      summary.chartDataProbes = chartDataProbeResult.probes;
      summary.statusAxes.dataReady = chartDataProbeResult.statusAxis;
    }

    recordPhase({
      logPath: run.logPath,
      phase: 'readback',
      event: 'end',
      status: 'ok',
      attributes: {
        action,
      },
    });

    markSkippedPhase(run.logPath, 'browser_attach', 'browser not requested');
    markSkippedPhase(run.logPath, 'smoke', 'browser not requested');

    summary.status = determineWriteStatus({
      action,
      guardBlocked: false,
      writeError: null,
      routeReadyOk: routeReady?.ok,
      pageAnchorOk: summarizeNode(pageAnchor?.data).present,
      gridAnchorOk: summarizeNode(gridAnchor?.data).present,
      readbackResult,
      driftOk: readbackDiffResult?.ok,
      contractOk: readbackContractResult?.ok,
    });

    if (action === 'create-v2') {
      summary.pageAnchor = summarizeNode(pageAnchor?.data);
      summary.gridAnchor = summarizeNode(gridAnchor?.data);
      if (!routeReady?.ok) {
        summary.notes.push('create-v2 已执行，但 route-ready 证据仍不完整。');
      }
    } else {
      if (readbackDiffResult && !readbackDiffResult.ok) {
        summary.notes.push(`readback diff 发现 ${readbackDiffResult.summary?.driftCount || readbackDiffResult.findings?.length || 0} 处漂移。`);
      }
      if (readbackContractResult && !readbackContractResult.ok) {
        summary.notes.push('readback contract 未全部通过。');
      }
      if (chartDataProbeResult?.statusAxis?.status === 'failed') {
        summary.notes.push(chartDataProbeResult.statusAxis.detail);
      }
    }

    writeJson(path.join(outDir, 'summary.json'), summary);
    summary.artifactPaths.summary = path.join(outDir, 'summary.json');

    finishRun({
      logPath: run.logPath,
      status: summary.status,
      summary: `wrapper ${action} finished with status ${summary.status}`,
      data: summary,
    });

    return summary;
  } catch (error) {
    const serializedError = summarizeError(error);
    const errorPath = path.join(outDir, `${action}.error.json`);
    writeJson(errorPath, serializedError);
    summary.artifactPaths.writeError = errorPath;
    summary.status = 'failed';
    summary.error = serializedError;
    summary.notes.push(serializedError.message);

    recordToolCall({
      logPath: run.logPath,
      tool: actionDef.toolName,
      toolType: 'node',
      status: 'error',
      args: {
        action,
        targetSignature: normalized.targetSignature || undefined,
      },
      summary: `wrapper ${action} failed`,
      error: serializedError.message,
      result: serializedError.response ?? undefined,
    });

    recordPhase({
      logPath: run.logPath,
      phase: 'write',
      event: 'end',
      status: 'error',
      attributes: {
        action,
      },
    });
    markSkippedPhase(run.logPath, 'readback', 'write failed');
    markSkippedPhase(run.logPath, 'browser_attach', 'browser not requested');
    markSkippedPhase(run.logPath, 'smoke', 'browser not requested');
    writeJson(path.join(outDir, 'summary.json'), summary);
    summary.artifactPaths.summary = path.join(outDir, 'summary.json');
    finishRun({
      logPath: run.logPath,
      status: 'failed',
      summary: `wrapper ${action} failed`,
      data: summary,
    });
    return summary;
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== 'run') {
    throw new Error(`Unknown command "${command}"`);
  }

  const requestBody = readJsonInput(flags['request-json'], flags['request-file'], 'request', {
    required: false,
  });
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload', {
    required: false,
  });
  const metadata = readJsonInput(flags['metadata-json'], flags['metadata-file'], 'metadata', {
    required: false,
  }) || {};
  const requirements = readJsonInput(flags['requirements-json'], flags['requirements-file'], 'requirements', {
    required: false,
  }) || {};
  const readbackContract = readJsonInput(
    flags['readback-contract-json'],
    flags['readback-contract-file'],
    'readback contract',
    { required: false },
  );

  const summary = await runUiWriteWrapper({
    action: flags.action,
    task: flags.task,
    title: flags.title,
    schemaUid: flags['schema-uid'],
    sessionId: flags['session-id'],
    sessionRoot: flags['session-root'],
    logDir: flags['log-dir'],
    latestRunPath: flags['latest-run-path'],
    outDir: flags['out-dir'],
    urlBase: flags['url-base'],
    token: flags.token,
    requestBody,
    payload,
    metadata,
    requirements,
    readbackContract,
    riskAccept: flags['risk-accept'],
    mode: flags.mode,
    nocobaseRoot: flags['nocobase-root'],
    snapshotFile: flags['snapshot-file'],
    targetSignature: flags['target-signature'],
    readbackParentId: flags['readback-parent-id'],
    readbackSubKey: flags['readback-sub-key'],
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.guardBlocked) {
    process.exitCode = BLOCKER_EXIT_CODE;
    return;
  }
  if (summary.status !== 'success') {
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  });
}
