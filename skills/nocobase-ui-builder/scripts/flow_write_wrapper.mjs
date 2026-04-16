#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOCKER_EXIT_CODE,
  VALIDATION_CASE_MODE,
  auditPayload,
  canonicalizePayload,
} from './flow_payload_guard.mjs';
import { remapConflictingDescendantUids } from './template_clone_helpers.mjs';
import {
  augmentReadbackContractWithGridMembership,
  buildReadbackDriftReport,
  normalizeUrlBase,
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
import {
  summarizeFindoneTree,
  summarizePayloadTree,
} from './tree_summary.mjs';

const WRITE_FAILURE_EXIT_CODE = 3;
const DEFAULT_URL_BASE = 'http://127.0.0.1:23000';
const DEFAULT_RUNJS_SNAPSHOT_PATH = fileURLToPath(new URL('./runjs_contract_snapshot.json', import.meta.url));
const SUPPORTED_OPERATIONS = new Set(['save', 'ensure', 'mutate', 'create-v2']);

function usage() {
  return [
    'Usage:',
    '  node scripts/flow_write_wrapper.mjs run',
    '    (--payload-json <json> | --payload-file <path>)',
    '    --operation <save|ensure|mutate|create-v2>',
    '    --task <task>',
    '    [--readback-parent-id <id>]',
    '    [--readback-sub-key <subKey>]',
    '    [--verify-payload-json <json> | --verify-payload-file <path>]',
    '    [--metadata-json <json> | --metadata-file <path>]',
    '    [--requirements-json <json> | --requirements-file <path>]',
    '    [--readback-contract-json <json> | --readback-contract-file <path>]',
    '    [--risk-accept <code> ...]',
    '    [--mode <validation-case|general>]',
    '    [--url-base <http://127.0.0.1:23000 | http://127.0.0.1:23000/admin>]',
    '    [--out-dir <path>]',
    '    [--session-id <id>]',
    '    [--session-root <path>]',
    '    [--title <title>]',
    '    [--schema-uid <schemaUid>]',
    '    [--target-signature <signature>]',
    '    [--snapshot-file <path>]',
    '    [--nocobase-root <path>]',
    '',
    'Notes:',
    '  - 这是 ad-hoc flowModels 写入的统一入口；默认先做严格 guard，再写，再 readback。',
    '  - create-v2 也统一走这里；wrapper 会补 route-ready 与 page/grid anchor 校验。',
    '  - 默认 mode=validation-case。',
    '  - mutate/ensure 若请求体不是最终模型树，应额外提供 --verify-payload-* 作为 guard/readback 基线。',
    '  - 认证使用环境变量 NOCOBASE_API_TOKEN。',
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

function normalizeOperation(value) {
  const normalized = normalizeNonEmpty(value, 'operation');
  if (!SUPPORTED_OPERATIONS.has(normalized)) {
    throw new Error(`Unsupported operation "${normalized}"`);
  }
  return normalized;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
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
  const subModels = isPlainObject(node.subModels) ? node.subModels : {};
  for (const [subKey, child] of Object.entries(subModels)) {
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        walkFlowModelTree(item, visitor, `${pathValue}.subModels.${subKey}[${index}]`, {
          parentUid: currentUid,
          subKey,
          subType: 'array',
        });
      });
      continue;
    }
    walkFlowModelTree(child, visitor, `${pathValue}.subModels.${subKey}`, {
      parentUid: currentUid,
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  ensureDir(path.dirname(resolved));
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
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

async function writeFlowModel({ operation, apiBase, token, requestBody }) {
  const params = new URLSearchParams({
    includeAsyncNode: 'true',
  });
  if (operation === 'save') {
    params.set('return', 'model');
  }
  const url = `${apiBase}/api/flowModels:${operation}?${params.toString()}`;
  return requestJson({
    method: 'POST',
    url,
    token,
    body: requestBody,
  });
}

async function createPageShell({ apiBase, token, requestBody }) {
  const url = `${apiBase}/api/desktopRoutes:createV2`;
  return requestJson({
    method: 'POST',
    url,
    token,
    body: requestBody,
  });
}

async function fetchAnchorModel({ apiBase, token, parentId, subKey }) {
  const params = new URLSearchParams({
    parentId,
    subKey,
    includeAsyncNode: 'true',
  });
  const url = `${apiBase}/api/flowModels:findOne?${params.toString()}`;
  return requestJson({
    method: 'GET',
    url,
    token,
  });
}

async function fetchAccessibleTree({ apiBase, token }) {
  const params = new URLSearchParams({
    tree: 'true',
    sort: 'sort',
  });
  const url = `${apiBase}/api/desktopRoutes:listAccessible?${params.toString()}`;
  return requestJson({
    method: 'GET',
    url,
    token,
  });
}

function probeRouteReady(routeTree, schemaUid) {
  const nodes = Array.isArray(routeTree) ? routeTree : [];
  const flat = [];
  const visit = (items, parent = null) => {
    for (const node of Array.isArray(items) ? items : []) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
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
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function toFindingDigest(findings) {
  return (Array.isArray(findings) ? findings : []).map((item) => ({
    severity: item?.severity || 'unknown',
    code: item?.code || '',
    message: item?.message || '',
  }));
}

function buildSummaryBase({
  operation,
  targetSignature,
  outDir,
  logPath,
  mode,
  verifyPayloadSeparate,
}) {
  return {
    entry: 'flow_write_wrapper',
    operation,
    targetSignature,
    mode,
    verifyPayloadSeparate,
    outDir,
    logPath,
    artifacts: {},
    notes: [],
  };
}

function determineOutcome({ readbackDiffResult, readbackContractResult, writeError, readbackError }) {
  if (writeError || readbackError) {
    return {
      status: 'failed',
      exitCode: WRITE_FAILURE_EXIT_CODE,
      gateStatus: 'failed',
      reasonCode: writeError ? 'WRITE_REQUEST_FAILED' : 'READBACK_REQUEST_FAILED',
    };
  }
  if (!readbackContractResult.ok) {
    return {
      status: 'failed',
      exitCode: WRITE_FAILURE_EXIT_CODE,
      gateStatus: 'failed',
      reasonCode: 'READBACK_CONTRACT_FAILED',
    };
  }
  if (!readbackDiffResult.ok) {
    return {
      status: 'partial',
      exitCode: WRITE_FAILURE_EXIT_CODE,
      gateStatus: 'failed',
      reasonCode: 'READBACK_DRIFT_FOUND',
    };
  }
  return {
    status: 'success',
    exitCode: 0,
    gateStatus: 'passed',
    reasonCode: 'READBACK_MATCHED',
  };
}

function determineCreateV2Outcome({ writeError, readbackError, routeReady, pageAnchorPresent, gridAnchorPresent }) {
  if (writeError || readbackError) {
    return {
      status: 'failed',
      exitCode: WRITE_FAILURE_EXIT_CODE,
      gateStatus: 'failed',
      reasonCode: writeError ? 'CREATE_V2_REQUEST_FAILED' : 'CREATE_V2_READBACK_FAILED',
    };
  }
  if (!routeReady?.ok || !pageAnchorPresent || !gridAnchorPresent) {
    return {
      status: 'partial',
      exitCode: WRITE_FAILURE_EXIT_CODE,
      gateStatus: 'failed',
      reasonCode: 'CREATE_V2_ROUTE_READY_INCOMPLETE',
    };
  }
  return {
    status: 'success',
    exitCode: 0,
    gateStatus: 'passed',
    reasonCode: 'CREATE_V2_ROUTE_READY_CONFIRMED',
  };
}

function summarizeAnchorNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return {
      present: false,
    };
  }
  return {
    present: true,
    uid: typeof node.uid === 'string' ? node.uid : '',
    use: typeof node.use === 'string' ? node.use : '',
  };
}

function buildArtifactPath(outDir, fileName) {
  return path.join(outDir, fileName);
}

async function runFlowWrite(flags) {
  const operation = normalizeOperation(flags.operation || flags.action);
  const mode = normalizeOptionalText(flags.mode) || VALIDATION_CASE_MODE;
  const requestPayload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const schemaUid = normalizeOptionalText(flags['schema-uid']) || normalizeOptionalText(requestPayload?.schemaUid);
  const readbackParentId = operation === 'create-v2'
    ? ''
    : normalizeNonEmpty(flags['readback-parent-id'], 'readback parent id');
  const readbackSubKey = operation === 'create-v2'
    ? ''
    : normalizeNonEmpty(flags['readback-sub-key'], 'readback sub key');
  const verifyPayload = operation === 'create-v2'
    ? requestPayload
    : (readOptionalJsonInput(flags['verify-payload-json'], flags['verify-payload-file']) ?? requestPayload);
  const verifyPayloadSeparate = operation === 'create-v2' ? false : verifyPayload !== requestPayload;
  const metadata = readOptionalJsonInput(flags['metadata-json'], flags['metadata-file']) || {};
  const requirements = readOptionalJsonInput(flags['requirements-json'], flags['requirements-file']) || {};
  const readbackContract = readOptionalJsonInput(flags['readback-contract-json'], flags['readback-contract-file']) || {};
  const riskAccept = normalizeRiskAccept(flags['risk-accept']);
  const targetSignature = normalizeOptionalText(flags['target-signature'])
    || (operation === 'create-v2' ? `page-shell:${schemaUid}` : `${readbackParentId}::${readbackSubKey}`);
  const task = normalizeOptionalText(flags.task) || `flow write wrapper ${operation} ${targetSignature}`;
  const token = normalizeNonEmpty(process.env.NOCOBASE_API_TOKEN, 'NOCOBASE_API_TOKEN');
  const snapshotPath = normalizeOptionalText(flags['snapshot-file']) || DEFAULT_RUNJS_SNAPSHOT_PATH;
  const { apiBase, adminBase } = normalizeUrlBase(flags['url-base'] || DEFAULT_URL_BASE);
  if (operation === 'create-v2' && !schemaUid) {
    throw new Error('schema uid is required for create-v2');
  }
  const sessionOptions = {
    sessionId: flags['session-id'],
    sessionRoot: flags['session-root'],
  };
  const sessionPaths = resolveSessionPaths(sessionOptions);
  const runInfo = startRun({
    task,
    title: flags.title,
    schemaUid,
    sessionId: sessionOptions.sessionId,
    sessionRoot: sessionOptions.sessionRoot,
    metadata: {
      entry: 'flow_write_wrapper',
      operation,
      targetSignature,
    },
  });
  const outDir = path.resolve(
    normalizeOptionalText(flags['out-dir'])
      || path.join(sessionPaths.artifactDir, runInfo.runId, 'flow-write-wrapper'),
  );
  ensureDir(outDir);

  const summary = buildSummaryBase({
    operation,
    targetSignature,
    outDir,
    logPath: runInfo.logPath,
    mode,
    verifyPayloadSeparate,
  });

  const requestPayloadPath = buildArtifactPath(outDir, 'request-payload.json');
  writeJson(requestPayloadPath, requestPayload);
  summary.artifacts.requestPayload = requestPayloadPath;

  const verifyPayloadPath = buildArtifactPath(outDir, 'verify-payload.draft.json');
  writeJson(verifyPayloadPath, verifyPayload);
  summary.artifacts.verifyPayloadDraft = verifyPayloadPath;

  recordPhase({
    logPath: runInfo.logPath,
    phase: 'schema_discovery',
    event: 'end',
    status: 'skipped',
    attributes: {
      reason: 'wrapper expects pre-resolved target tree',
    },
  });
  recordPhase({
    logPath: runInfo.logPath,
    phase: 'stable_metadata',
    event: 'end',
    status: operation === 'create-v2' ? 'skipped' : (Object.keys(metadata).length > 0 ? 'ok' : 'skipped'),
    attributes: {
      guardRequired: operation !== 'create-v2',
      metadataProvided: Object.keys(metadata).length > 0,
    },
  });
  appendNote({
    logPath: runInfo.logPath,
    message: 'browser not requested; wrapper only performs guard/write/readback',
    data: {
      type: 'browser_skip',
    },
  });
  recordPhase({
    logPath: runInfo.logPath,
    phase: 'browser_attach',
    event: 'end',
    status: 'skipped',
    attributes: {
      reason: 'not requested',
    },
  });
  recordPhase({
    logPath: runInfo.logPath,
    phase: 'smoke',
    event: 'end',
    status: 'skipped',
    attributes: {
      reason: 'not requested',
    },
  });

  let finalStatus = 'failed';
  let finalExitCode = WRITE_FAILURE_EXIT_CODE;
  let finishSummary = '';

  try {
    recordPhase({
      logPath: runInfo.logPath,
      phase: 'write',
      event: 'start',
      status: 'running',
      attributes: {
        operation,
        targetSignature,
      },
    });

    if (operation === 'create-v2') {
      let writeError = null;
      let readbackError = null;
      let createResponse = null;
      let routeTreeResponse = null;
      let pageAnchorResponse = null;
      let gridAnchorResponse = null;
      let routeReady = {
        ok: false,
        pageFound: false,
        defaultTabFound: false,
      };

      try {
        createResponse = await createPageShell({
          apiBase,
          token,
          requestBody: requestPayload,
        });
        const createResultPath = buildArtifactPath(outDir, 'create-v2-result.json');
        writeJson(createResultPath, createResponse.raw);
        summary.artifacts.createResult = createResultPath;
        recordToolCall({
          logPath: runInfo.logPath,
          tool: 'PostDesktoproutes_createv2',
          toolType: 'node',
          status: 'ok',
          summary: 'wrapper executed desktopRoutes:createV2',
          args: {
            targetSignature,
            schemaUid,
            operation,
          },
          result: {
            statusCode: createResponse.status,
            schemaUid,
          },
        });
      } catch (error) {
        writeError = {
          message: error instanceof Error ? error.message : String(error),
          status: Number.isInteger(error?.status) ? error.status : null,
          response: error?.response ?? null,
        };
        const createErrorPath = buildArtifactPath(outDir, 'create-v2-error.json');
        writeJson(createErrorPath, writeError);
        summary.artifacts.createError = createErrorPath;
        recordToolCall({
          logPath: runInfo.logPath,
          tool: 'PostDesktoproutes_createv2',
          toolType: 'node',
          status: 'error',
          summary: 'wrapper failed desktopRoutes:createV2',
          args: {
            targetSignature,
            schemaUid,
            operation,
          },
          error: writeError.message,
        });
      }

      recordPhase({
        logPath: runInfo.logPath,
        phase: 'write',
        event: 'end',
        status: writeError ? 'error' : 'ok',
        attributes: {
          operation,
          targetSignature,
        },
      });

      if (!writeError) {
        recordPhase({
          logPath: runInfo.logPath,
          phase: 'readback',
          event: 'start',
          status: 'running',
          attributes: {
            targetSignature,
            schemaUid,
          },
        });

        try {
          routeTreeResponse = await fetchAccessibleTree({
            apiBase,
            token,
          });
          const routeTreePath = buildArtifactPath(outDir, 'route-tree.json');
          writeJson(routeTreePath, routeTreeResponse.raw);
          summary.artifacts.routeTree = routeTreePath;
          routeReady = probeRouteReady(routeTreeResponse.data, schemaUid);
          recordToolCall({
            logPath: runInfo.logPath,
            tool: 'GetDesktoproutes_listaccessible',
            toolType: 'node',
            status: 'ok',
            summary: routeReady.ok ? 'wrapper confirmed route-ready after create-v2' : 'wrapper found incomplete route-ready after create-v2',
            args: {
              tree: true,
              targetSignature,
              schemaUid,
            },
            result: routeReady,
          });

          pageAnchorResponse = await fetchAnchorModel({
            apiBase,
            token,
            parentId: schemaUid,
            subKey: 'page',
          });
          const pageAnchorPath = buildArtifactPath(outDir, 'anchor-page.json');
          writeJson(pageAnchorPath, pageAnchorResponse.raw);
          summary.artifacts.anchorPage = pageAnchorPath;
          recordToolCall({
            logPath: runInfo.logPath,
            tool: 'GetFlowmodels_findone',
            toolType: 'node',
            status: 'ok',
            summary: 'wrapper fetched page anchor after create-v2',
            args: {
              parentId: schemaUid,
              subKey: 'page',
              targetSignature: `page:${schemaUid}`,
            },
            result: {
              statusCode: pageAnchorResponse.status,
              summary: summarizeFindoneTree({
                tree: pageAnchorResponse.data,
                targetSignature: `page:${schemaUid}`,
              }),
            },
          });

          gridAnchorResponse = await fetchAnchorModel({
            apiBase,
            token,
            parentId: `tabs-${schemaUid}`,
            subKey: 'grid',
          });
          const gridAnchorPath = buildArtifactPath(outDir, 'anchor-grid.json');
          writeJson(gridAnchorPath, gridAnchorResponse.raw);
          summary.artifacts.anchorGrid = gridAnchorPath;
          recordToolCall({
            logPath: runInfo.logPath,
            tool: 'GetFlowmodels_findone',
            toolType: 'node',
            status: 'ok',
            summary: 'wrapper fetched default grid anchor after create-v2',
            args: {
              parentId: `tabs-${schemaUid}`,
              subKey: 'grid',
              targetSignature: `grid:tabs-${schemaUid}`,
            },
            result: {
              statusCode: gridAnchorResponse.status,
              summary: summarizeFindoneTree({
                tree: gridAnchorResponse.data,
                targetSignature: `grid:tabs-${schemaUid}`,
              }),
            },
          });
        } catch (error) {
          readbackError = {
            message: error instanceof Error ? error.message : String(error),
            status: Number.isInteger(error?.status) ? error.status : null,
            response: error?.response ?? null,
          };
          const readbackErrorPath = buildArtifactPath(outDir, 'readback-error.json');
          writeJson(readbackErrorPath, readbackError);
          summary.artifacts.readbackError = readbackErrorPath;
          recordToolCall({
            logPath: runInfo.logPath,
            tool: 'GetDesktoproutes_listaccessible',
            toolType: 'node',
            status: 'error',
            summary: 'wrapper failed create-v2 readback checks',
            args: {
              targetSignature,
              schemaUid,
            },
            error: readbackError.message,
          });
        }
      } else {
        summary.notes.push(`desktopRoutes:createV2 失败: ${writeError.message}`);
      }

      const pageAnchor = summarizeAnchorNode(pageAnchorResponse?.data);
      const gridAnchor = summarizeAnchorNode(gridAnchorResponse?.data);
      const outcome = determineCreateV2Outcome({
        writeError,
        readbackError,
        routeReady,
        pageAnchorPresent: pageAnchor.present,
        gridAnchorPresent: gridAnchor.present,
      });
      finalStatus = outcome.status;
      finalExitCode = outcome.exitCode;
      finishSummary = outcome.reasonCode;

      const createV2Findings = [];
      if (!routeReady.ok) {
        createV2Findings.push({
          severity: 'blocker',
          code: 'CREATE_V2_ROUTE_READY_MISSING',
          message: 'create-v2 后未同时确认 page route 与 hidden default tab。',
        });
      }
      if (!pageAnchor.present) {
        createV2Findings.push({
          severity: 'blocker',
          code: 'CREATE_V2_PAGE_ANCHOR_MISSING',
          message: 'create-v2 后未读到 page anchor。',
        });
      }
      if (!gridAnchor.present) {
        createV2Findings.push({
          severity: 'blocker',
          code: 'CREATE_V2_GRID_ANCHOR_MISSING',
          message: 'create-v2 后未读到 default hidden tab grid anchor。',
        });
      }

      recordGate({
        logPath: runInfo.logPath,
        gate: 'write-after-read',
        status: outcome.gateStatus,
        reasonCode: outcome.reasonCode,
        findings: createV2Findings,
        stoppedRemainingWork: outcome.gateStatus === 'failed',
        data: {
          targetSignature,
          schemaUid,
          pageUrl: `${adminBase.replace(/\/+$/, '')}/${encodeURIComponent(schemaUid)}`,
        },
      });

      recordPhase({
        logPath: runInfo.logPath,
        phase: 'readback',
        event: 'end',
        status: readbackError || outcome.gateStatus === 'failed' ? 'error' : 'ok',
        attributes: {
          targetSignature,
          reasonCode: outcome.reasonCode,
        },
      });

      summary.pageUrl = `${adminBase.replace(/\/+$/, '')}/${encodeURIComponent(schemaUid)}`;
      summary.routeReady = routeReady;
      summary.pageAnchor = pageAnchor;
      summary.gridAnchor = gridAnchor;
      summary.write = {
        ok: !writeError,
        operation,
      };
      summary.readback = {
        ok: !readbackError && routeReady.ok && pageAnchor.present && gridAnchor.present,
        routeReady,
        pageAnchor,
        gridAnchor,
      };
      summary.status = finalStatus;
      if (readbackError) {
        summary.notes.push(`create-v2 readback 失败: ${readbackError.message}`);
      } else if (!routeReady.ok || !pageAnchor.present || !gridAnchor.present) {
        summary.notes.push('create-v2 已执行，但 route-ready 或 anchor 证据仍不完整。');
      }

      const summaryPath = buildArtifactPath(outDir, 'summary.json');
      writeJson(summaryPath, summary);
      summary.artifacts.summary = summaryPath;
      return {
        exitCode: finalExitCode,
        summary,
      };
    }

    const canonicalizeResult = canonicalizePayload({
      payload: verifyPayload,
      metadata,
      mode,
      nocobaseRoot: flags['nocobase-root'],
      snapshotPath,
    });
    const canonicalizePath = buildArtifactPath(outDir, 'canonicalize-result.json');
    const canonicalPayloadPath = buildArtifactPath(outDir, 'verify-payload.canonical.json');
    writeJson(canonicalizePath, canonicalizeResult);
    writeJson(canonicalPayloadPath, canonicalizeResult.payload);
    summary.artifacts.canonicalizeResult = canonicalizePath;
    summary.artifacts.verifyPayloadCanonical = canonicalPayloadPath;
    recordToolCall({
      logPath: runInfo.logPath,
      tool: 'flow_payload_guard.canonicalize-payload',
      toolType: 'node',
      status: 'ok',
      summary: 'canonicalized verify payload before flow write',
      args: {
        mode,
        targetSignature,
      },
      result: summarizeCanonicalize(canonicalizeResult),
    });

    const initialAuditResult = auditPayload({
      payload: canonicalizeResult.payload,
      metadata,
      mode,
      riskAccept,
      requirements,
      nocobaseRoot: flags['nocobase-root'],
      snapshotPath,
    });
    const initialAuditPath = buildArtifactPath(outDir, 'audit.initial.json');
    writeJson(initialAuditPath, initialAuditResult);
    summary.artifacts.auditInitial = initialAuditPath;
    recordToolCall({
      logPath: runInfo.logPath,
      tool: 'flow_payload_guard.audit-payload',
      toolType: 'node',
      status: 'ok',
      summary: 'audited verify payload before live-topology probe',
      args: {
        mode,
        riskAccept,
        targetSignature,
      },
      result: initialAuditResult,
    });

    if (!initialAuditResult.ok) {
      summary.status = 'failed';
      summary.guardBlocked = true;
      summary.audit = {
        ok: false,
        blockerCount: initialAuditResult.blockers.length,
        warningCount: initialAuditResult.warnings.length,
      };
      summary.notes.push('guard 命中 blocker，wrapper 已阻止写入。');
      recordGate({
        logPath: runInfo.logPath,
        gate: 'preflight-write',
        status: 'failed',
        reasonCode: 'GUARD_BLOCKED',
        findings: [
          ...toFindingDigest(initialAuditResult.blockers),
          ...toFindingDigest(initialAuditResult.warnings),
        ],
        stoppedRemainingWork: true,
        data: {
          targetSignature,
          blockerCount: initialAuditResult.blockers.length,
          warningCount: initialAuditResult.warnings.length,
        },
      });
      recordPhase({
        logPath: runInfo.logPath,
        phase: 'write',
        event: 'end',
        status: 'error',
        attributes: {
          reasonCode: 'GUARD_BLOCKED',
        },
      });
      recordPhase({
        logPath: runInfo.logPath,
        phase: 'readback',
        event: 'end',
        status: 'skipped',
        attributes: {
          reason: 'guard blocked',
        },
      });
      finalStatus = 'failed';
      finalExitCode = BLOCKER_EXIT_CODE;
      finishSummary = 'guard blocked write';
      const summaryPath = buildArtifactPath(outDir, 'summary.json');
      writeJson(summaryPath, summary);
      summary.artifacts.summary = summaryPath;
      return {
        exitCode: finalExitCode,
        summary,
      };
    }

    let effectiveMetadata = metadata;
    try {
      const liveProbeResponse = await fetchAnchorModel({
        apiBase,
        token,
        parentId: readbackParentId,
        subKey: readbackSubKey,
      });
      const liveProbePath = buildArtifactPath(outDir, 'live-topology.json');
      writeJson(liveProbePath, liveProbeResponse.raw);
      summary.artifacts.liveTopology = liveProbePath;
      const liveTopology = buildLiveTopology(liveProbeResponse.data);
      effectiveMetadata = {
        ...metadata,
        liveTopology,
      };
      summary.liveTopology = {
        source: liveTopology.source,
        nodeCount: liveTopology.nodeCount,
      };
      recordToolCall({
        logPath: runInfo.logPath,
        tool: 'GetFlowmodels_findone',
        toolType: 'node',
        status: 'ok',
        summary: 'wrapper fetched live topology before flow write',
        args: {
          parentId: readbackParentId,
          subKey: readbackSubKey,
          targetSignature,
        },
        result: {
          statusCode: liveProbeResponse.status,
          nodeCount: liveTopology.nodeCount,
        },
      });
    } catch (error) {
      const liveProbeError = {
        message: error instanceof Error ? error.message : String(error),
        status: Number.isInteger(error?.status) ? error.status : null,
        response: error?.response ?? null,
      };
      const liveProbeErrorPath = buildArtifactPath(outDir, 'live-topology-error.json');
      writeJson(liveProbeErrorPath, liveProbeError);
      summary.artifacts.liveTopologyError = liveProbeErrorPath;
      summary.notes.push(`live topology probe 失败，将仅使用本地 payload guard: ${liveProbeError.message}`);
      recordToolCall({
        logPath: runInfo.logPath,
        tool: 'GetFlowmodels_findone',
        toolType: 'node',
        status: 'error',
        summary: 'wrapper failed to fetch live topology before flow write',
        args: {
          parentId: readbackParentId,
          subKey: readbackSubKey,
          targetSignature,
        },
        error: liveProbeError.message,
      });
    }

    const liveRemapResult = remapConflictingDescendantUids({
      model: canonicalizeResult.payload,
      liveTopology: effectiveMetadata.liveTopology,
      uidSeed: targetSignature,
    });
    if (liveRemapResult.changed) {
      canonicalizeResult.payload = liveRemapResult.payload;
      const liveRemapPath = buildArtifactPath(outDir, 'live-topology-remap.json');
      const remappedPayloadPath = buildArtifactPath(outDir, 'verify-payload.remapped.json');
      writeJson(liveRemapPath, liveRemapResult);
      writeJson(remappedPayloadPath, liveRemapResult.payload);
      summary.artifacts.liveTopologyRemap = liveRemapPath;
      summary.artifacts.verifyPayloadRemapped = remappedPayloadPath;
      summary.liveTopologyRemap = {
        changed: true,
        remappedNodeCount: liveRemapResult.remappedNodes.length,
      };
      summary.notes.push(`live topology remap 已刷新 ${liveRemapResult.remappedNodes.length} 个冲突 descendant uid。`);
      recordToolCall({
        logPath: runInfo.logPath,
        tool: 'template_clone_helpers.remapConflictingDescendantUids',
        toolType: 'node',
        status: 'ok',
        summary: 'wrapper remapped conflicting descendant uids before flow write',
        args: {
          targetSignature,
        },
        result: {
          changed: true,
          remappedNodeCount: liveRemapResult.remappedNodes.length,
        },
      });
    }

    const auditResult = auditPayload({
      payload: canonicalizeResult.payload,
      metadata: effectiveMetadata,
      mode,
      riskAccept,
      requirements,
      nocobaseRoot: flags['nocobase-root'],
      snapshotPath,
    });
    const auditPath = buildArtifactPath(outDir, 'audit.json');
    writeJson(auditPath, auditResult);
    summary.artifacts.audit = auditPath;
    recordToolCall({
      logPath: runInfo.logPath,
      tool: 'flow_payload_guard.audit-payload',
      toolType: 'node',
      status: 'ok',
      summary: 'audited verify payload with live-topology metadata before flow write',
      args: {
        mode,
        riskAccept,
        targetSignature,
        liveTopologyNodeCount: effectiveMetadata?.liveTopology?.nodeCount || 0,
      },
      result: auditResult,
    });

    if (!auditResult.ok) {
      summary.status = 'failed';
      summary.guardBlocked = true;
      summary.audit = {
        ok: false,
        blockerCount: auditResult.blockers.length,
        warningCount: auditResult.warnings.length,
      };
      summary.notes.push('guard 命中 blocker，wrapper 已阻止写入。');
      recordGate({
        logPath: runInfo.logPath,
        gate: 'preflight-write',
        status: 'failed',
        reasonCode: 'GUARD_BLOCKED',
        findings: [
          ...toFindingDigest(auditResult.blockers),
          ...toFindingDigest(auditResult.warnings),
        ],
        stoppedRemainingWork: true,
        data: {
          targetSignature,
          blockerCount: auditResult.blockers.length,
          warningCount: auditResult.warnings.length,
        },
      });
      recordPhase({
        logPath: runInfo.logPath,
        phase: 'write',
        event: 'end',
        status: 'error',
        attributes: {
          reasonCode: 'GUARD_BLOCKED',
        },
      });
      recordPhase({
        logPath: runInfo.logPath,
        phase: 'readback',
        event: 'end',
        status: 'skipped',
        attributes: {
          reason: 'guard blocked',
        },
      });
      finalStatus = 'failed';
      finalExitCode = BLOCKER_EXIT_CODE;
      finishSummary = 'guard blocked write';
      const summaryPath = buildArtifactPath(outDir, 'summary.json');
      writeJson(summaryPath, summary);
      summary.artifacts.summary = summaryPath;
      return {
        exitCode: finalExitCode,
        summary,
      };
    }

    recordGate({
      logPath: runInfo.logPath,
      gate: 'preflight-write',
      status: 'passed',
      reasonCode: 'GUARD_PASSED',
      findings: toFindingDigest(auditResult.warnings),
      stoppedRemainingWork: false,
      data: {
        targetSignature,
        blockerCount: 0,
        warningCount: auditResult.warnings.length,
      },
    });

    const writeTree = canonicalizeResult.payload;
    const writeTreeSummary = summarizePayloadTree({
      payload: writeTree,
      targetSignature,
    });
    const effectiveReadbackContract = augmentReadbackContractWithGridMembership(readbackContract, writeTree);
    const effectiveReadbackContractPath = buildArtifactPath(outDir, 'effective-readback-contract.json');
    writeJson(effectiveReadbackContractPath, effectiveReadbackContract);
    summary.artifacts.effectiveReadbackContract = effectiveReadbackContractPath;
    const requestBody = verifyPayloadSeparate ? requestPayload : writeTree;
    let writeError = null;
    let readbackError = null;
    let writeResponse = null;
    let readbackResponse = null;
    let readbackDiffResult = {
      ok: false,
      findings: [],
      summary: {
        driftCount: 0,
      },
    };
    let readbackContractResult = {
      ok: false,
      findings: [],
      summary: {},
    };

    try {
      writeResponse = await writeFlowModel({
        operation,
        apiBase,
        token,
        requestBody,
      });
      const writeResultPath = buildArtifactPath(outDir, `${operation}-result.json`);
      writeJson(writeResultPath, writeResponse.raw);
      summary.artifacts.writeResult = writeResultPath;
      recordToolCall({
        logPath: runInfo.logPath,
        tool: `PostFlowmodels_${operation}`,
        toolType: 'node',
        status: 'ok',
        summary: `wrapper executed flowModels:${operation}`,
        args: {
          targetSignature,
          parentId: readbackParentId,
          subKey: readbackSubKey,
          operation,
        },
        result: {
          statusCode: writeResponse.status,
          summary: writeTreeSummary,
        },
      });
    } catch (error) {
      writeError = {
        message: error instanceof Error ? error.message : String(error),
        status: Number.isInteger(error?.status) ? error.status : null,
        response: error?.response ?? null,
      };
      const writeErrorPath = buildArtifactPath(outDir, `${operation}-error.json`);
      writeJson(writeErrorPath, writeError);
      summary.artifacts.writeError = writeErrorPath;
      recordToolCall({
        logPath: runInfo.logPath,
        tool: `PostFlowmodels_${operation}`,
        toolType: 'node',
        status: 'error',
        summary: `wrapper failed flowModels:${operation}`,
        args: {
          targetSignature,
          parentId: readbackParentId,
          subKey: readbackSubKey,
          operation,
        },
        error: writeError.message,
      });
    }

    recordPhase({
      logPath: runInfo.logPath,
      phase: 'write',
      event: 'end',
      status: writeError ? 'error' : 'ok',
      attributes: {
        operation,
        targetSignature,
      },
    });

    if (writeError) {
      summary.notes.push(`flowModels:${operation} 失败: ${writeError.message}`);
      recordPhase({
        logPath: runInfo.logPath,
        phase: 'readback',
        event: 'end',
        status: 'skipped',
        attributes: {
          reason: 'write failed',
        },
      });
    } else {
      recordPhase({
        logPath: runInfo.logPath,
        phase: 'readback',
        event: 'start',
        status: 'running',
        attributes: {
          targetSignature,
          parentId: readbackParentId,
          subKey: readbackSubKey,
        },
      });

      try {
        readbackResponse = await fetchAnchorModel({
          apiBase,
          token,
          parentId: readbackParentId,
          subKey: readbackSubKey,
        });
        const readbackPath = buildArtifactPath(outDir, 'readback.json');
        writeJson(readbackPath, readbackResponse.raw);
        summary.artifacts.readback = readbackPath;
        const readbackSummary = summarizeFindoneTree({
          tree: readbackResponse.data,
          targetSignature,
        });
        recordToolCall({
          logPath: runInfo.logPath,
          tool: 'GetFlowmodels_findone',
          toolType: 'node',
          status: 'ok',
          summary: 'wrapper fetched readback after flow write',
          args: {
            parentId: readbackParentId,
            subKey: readbackSubKey,
            targetSignature,
          },
          result: {
            statusCode: readbackResponse.status,
            summary: readbackSummary,
          },
        });

        readbackDiffResult = buildReadbackDriftReport(writeTree, readbackResponse.data);
        readbackContractResult = validateReadbackContract(readbackResponse.data, effectiveReadbackContract);
        const readbackDiffPath = buildArtifactPath(outDir, 'readback-diff.json');
        const readbackContractPath = buildArtifactPath(outDir, 'readback-contract.json');
        writeJson(readbackDiffPath, readbackDiffResult);
        writeJson(readbackContractPath, readbackContractResult);
        summary.artifacts.readbackDiff = readbackDiffPath;
        summary.artifacts.readbackContract = readbackContractPath;
      } catch (error) {
        readbackError = {
          message: error instanceof Error ? error.message : String(error),
          status: Number.isInteger(error?.status) ? error.status : null,
          response: error?.response ?? null,
        };
        const readbackErrorPath = buildArtifactPath(outDir, 'readback-error.json');
        writeJson(readbackErrorPath, readbackError);
        summary.artifacts.readbackError = readbackErrorPath;
        recordToolCall({
          logPath: runInfo.logPath,
          tool: 'GetFlowmodels_findone',
          toolType: 'node',
          status: 'error',
          summary: 'wrapper failed to fetch readback after flow write',
          args: {
            parentId: readbackParentId,
            subKey: readbackSubKey,
            targetSignature,
          },
          error: readbackError.message,
        });
      }
    }

    const outcome = determineOutcome({
      readbackDiffResult,
      readbackContractResult,
      writeError,
      readbackError,
    });
    finalStatus = outcome.status;
    finalExitCode = outcome.exitCode;
    finishSummary = outcome.reasonCode;

    const gateFindings = [
      ...toFindingDigest(readbackContractResult.findings),
      ...toFindingDigest(readbackDiffResult.findings),
    ];
    recordGate({
      logPath: runInfo.logPath,
      gate: 'write-after-read',
      status: outcome.gateStatus,
      reasonCode: outcome.reasonCode,
      findings: gateFindings,
      stoppedRemainingWork: outcome.gateStatus === 'failed',
      data: {
        targetSignature,
        driftCount: readbackDiffResult.summary?.driftCount || 0,
        contractOk: readbackContractResult.ok,
      },
    });

    if (!writeError) {
      recordPhase({
        logPath: runInfo.logPath,
        phase: 'readback',
        event: 'end',
        status: readbackError || outcome.gateStatus === 'failed' ? 'error' : 'ok',
        attributes: {
          targetSignature,
          reasonCode: outcome.reasonCode,
        },
      });
    }

    if (readbackError) {
      summary.notes.push(`readback 失败: ${readbackError.message}`);
    } else if (!readbackContractResult.ok) {
      summary.notes.push('readback contract 未通过。');
    } else if (!readbackDiffResult.ok) {
      summary.notes.push(`readback drift 发现 ${readbackDiffResult.summary?.driftCount || 0} 处漂移。`);
    }

    summary.write = {
      ok: !writeError,
      operation,
    };
    summary.readback = {
      ok: !readbackError && readbackContractResult.ok && readbackDiffResult.ok,
      contract: readbackContractResult,
      diff: readbackDiffResult,
    };
    summary.status = finalStatus;

    const summaryPath = buildArtifactPath(outDir, 'summary.json');
    writeJson(summaryPath, summary);
    summary.artifacts.summary = summaryPath;
    return {
      exitCode: finalExitCode,
      summary,
    };
  } finally {
    finishRun({
      logPath: runInfo.logPath,
      status: finalStatus,
      summary: finishSummary,
      data: {
        entry: 'flow_write_wrapper',
        operation,
        targetSignature,
        outDir,
      },
    });
  }
}

async function runCli(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== 'run') {
    throw new Error(`Unknown command "${command}"`);
  }

  const result = await runFlowWrite(flags);
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = path.resolve(fileURLToPath(import.meta.url));
if (executedPath === currentPath) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  DEFAULT_RUNJS_SNAPSHOT_PATH,
  WRITE_FAILURE_EXIT_CODE,
  runCli,
  runFlowWrite,
};
