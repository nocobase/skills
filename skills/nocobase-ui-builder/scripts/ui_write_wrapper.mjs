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
import {
  buildPageUrlFromCandidatePageUrl,
  cloneJson,
  ensureDir,
  isPlainObject,
  loadArtifactInput,
  loadArtifactValue,
  normalizeOptionalText,
  normalizeRequiredText,
  readJsonInput,
  writeJson,
} from './mcp_artifact_support.mjs';
import {
  augmentReadbackContractWithGridMembership,
  buildReadbackDriftReport,
  validateReadbackContract,
} from './rest_template_clone_runner.mjs';
import { resolveSessionPaths } from './session_state.mjs';
import { remapConflictingDescendantUids } from './template_clone_helpers.mjs';
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
    toolName: 'PostDesktoproutes_createv2',
    requiresGuard: false,
  },
  save: {
    toolName: 'PostFlowmodels_save',
    requiresGuard: true,
  },
  mutate: {
    toolName: 'PostFlowmodels_mutate',
    requiresGuard: true,
  },
  ensure: {
    toolName: 'PostFlowmodels_ensure',
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
    '    [--write-result-json <json> | --write-result-file <path>]',
    '    [--live-topology-json <json> | --live-topology-file <path>]',
    '    [--readback-json <json> | --readback-file <path>]',
    '    [--route-tree-json <json> | --route-tree-file <path>]',
    '    [--page-anchor-json <json> | --page-anchor-file <path>]',
    '    [--grid-anchor-json <json> | --grid-anchor-file <path>]',
    '    [--chart-data-probes-json <json> | --chart-data-probes-file <path>]',
    '    [--candidate-page-url <url>]',
    '',
    'Notes:',
    '  - 这是 nocobase-ui-builder 的统一写入口，但脚本本身不再直接访问 NocoBase API。',
    '  - create-v2 / save / mutate / ensure 的实际写入与 readback 证据应先由 agent 通过 MCP 获取，再以 artifact 形式喂给 wrapper。',
    '  - save/mutate/ensure 会继续执行 canonicalizePayload -> auditPayload -> readback drift/contract，本地只做 guard 与证据汇总。',
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

function normalizeLiveTopologyArtifact(artifact) {
  if (!artifact) {
    return null;
  }
  const data = artifact.data;
  if (isPlainObject(data) && isPlainObject(data.byUid)) {
    const byUid = cloneJson(data.byUid);
    return {
      source: normalizeOptionalText(data.source) || 'artifact',
      nodeCount: Number.isInteger(data.nodeCount) ? data.nodeCount : Object.keys(byUid).length,
      byUid,
    };
  }
  return buildLiveTopology(data);
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

function buildGuardMetadata(normalized) {
  const metadata = cloneJson(normalized.metadata) || {};

  if (normalized.actionDef.requiresGuard && normalized.readbackParentId && normalized.readbackSubKey) {
    metadata.targetAnchor = {
      parentId: normalized.readbackParentId,
      subKey: normalized.readbackSubKey,
      subType: 'object',
    };
  }

  if (normalized.routeTreeArtifact) {
    metadata.routeTree = cloneJson(normalized.routeTreeArtifact.data);
  }

  return metadata;
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

function determineWriteStatus({
  action,
  guardBlocked,
  writeError,
  routeReadyOk,
  pageAnchorOk,
  gridAnchorOk,
  readbackPresent,
  driftOk,
  contractOk,
}) {
  if (guardBlocked || writeError) {
    return 'failed';
  }
  if (action === 'create-v2') {
    if (!routeReadyOk || !pageAnchorOk || !gridAnchorOk) {
      return 'partial';
    }
    return 'success';
  }
  if (!readbackPresent) {
    return 'failed';
  }
  if (driftOk === false || contractOk === false) {
    return 'partial';
  }
  return 'success';
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
    });
  });
  return chartBlocks;
}

function deriveChartProbeStatusFromProbes(probes) {
  const failedProbes = probes.filter((item) => item?.ok === false);
  if (failedProbes.length > 0) {
    return {
      status: 'failed',
      detail: `${failedProbes.length}/${probes.length} 个图表数据探测失败。`,
    };
  }

  const totalRows = probes.reduce(
    (sum, item) => sum + (Number.isInteger(item?.rowCount) ? item.rowCount : 0),
    0,
  );
  const zeroRowCount = probes.filter((item) => item?.rowCount === 0).length;
  const detail = zeroRowCount > 0
    ? `已读取 ${probes.length} 个图表探测 artifact，累计 ${totalRows} 行，其中 ${zeroRowCount} 个图表返回 0 行。`
    : `已读取 ${probes.length} 个图表探测 artifact，累计 ${totalRows} 行。`;
  return {
    status: 'ready',
    detail,
  };
}

function normalizeChartDataProbeResult(artifact, tree) {
  if (artifact) {
    const data = artifact.data;
    if (Array.isArray(data)) {
      return {
        probes: cloneJson(data),
        statusAxis: deriveChartProbeStatusFromProbes(data),
      };
    }
    if (isPlainObject(data)) {
      const probes = Array.isArray(data.probes)
        ? cloneJson(data.probes)
        : (Array.isArray(data.items) ? cloneJson(data.items) : []);
      const statusAxis = isPlainObject(data.statusAxis)
        ? cloneJson(data.statusAxis)
        : deriveChartProbeStatusFromProbes(probes);
      return {
        probes,
        statusAxis,
      };
    }
  }

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

  return {
    probes: chartBlocks.map((item) => ({
      uid: item.uid,
      title: item.title,
      path: item.path,
      ok: null,
      status: 'not-run',
    })),
    statusAxis: {
      status: 'not-run',
      detail: `readback 中发现 ${chartBlocks.length} 个 ChartBlockModel，但未提供 chart data probe artifact。`,
    },
  };
}

function buildDefaultStatusAxes() {
  return {
    browserValidation: {
      status: 'skipped (not requested)',
      detail: '本轮未请求浏览器验证。',
    },
    runtimeUsable: {
      status: 'not-run',
      detail: '本轮未执行 runtime/smoke。',
    },
    dataPreparation: {
      status: 'not-recorded',
      detail: '日志中没有稳定的数据准备信号。',
    },
  };
}

function finalizeStatusAxesForCreateV2({
  routeReady,
  pageAnchor,
  gridAnchor,
  writePresent,
}) {
  return {
    pageShellCreated: writePresent
      ? { status: 'created', detail: 'create-v2 write artifact 已提供。' }
      : { status: 'failed', detail: '缺少 create-v2 write artifact。' },
    routeReady: routeReady?.ok
      ? { status: 'ready', detail: 'route tree 已确认 page route 与默认隐藏 tab。' }
      : { status: 'not-ready', detail: 'route-ready 证据不完整。' },
    readbackMatched: pageAnchor.present && gridAnchor.present
      ? { status: 'matched', detail: 'page/grid anchor 已提供。' }
      : { status: 'evidence-insufficient', detail: 'page/grid anchor 证据不完整。' },
    dataReady: {
      status: 'not-recorded',
      detail: '页面壳创建阶段没有数据 readiness 检查。',
    },
  };
}

function finalizeStatusAxesForFlowWrite({
  readbackPresent,
  readbackDiffResult,
  readbackContractResult,
  chartDataProbeResult,
}) {
  let readbackMatched;
  if (!readbackPresent) {
    readbackMatched = {
      status: 'failed',
      detail: '缺少 readback artifact。',
    };
  } else if (!readbackContractResult.ok) {
    readbackMatched = {
      status: 'mismatch',
      detail: 'readback contract 未通过。',
    };
  } else if (!readbackDiffResult.ok) {
    readbackMatched = {
      status: 'mismatch',
      detail: `readback drift 发现 ${readbackDiffResult.summary?.driftCount || 0} 处漂移。`,
    };
  } else {
    readbackMatched = {
      status: 'matched',
      detail: 'readback drift 与 contract 均通过。',
    };
  }

  return {
    pageShellCreated: {
      status: 'not-recorded',
      detail: '本轮不是 create-v2 页面壳创建。',
    },
    routeReady: {
      status: 'not-recorded',
      detail: '本轮不是 create-v2 route-ready 校验。',
    },
    readbackMatched,
    dataReady: chartDataProbeResult.statusAxis,
  };
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
  const readbackContract = options.readbackContract !== undefined ? cloneJson(options.readbackContract) : {};

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
    candidatePageUrl: normalizeOptionalText(options.candidatePageUrl),
    writeResultArtifact: options.writeResult !== undefined ? loadArtifactValue(options.writeResult, { label: 'write result' }) : null,
    liveTopologyArtifact: options.liveTopology !== undefined ? loadArtifactValue(options.liveTopology, { label: 'live topology' }) : null,
    readbackArtifact: options.readback !== undefined ? loadArtifactValue(options.readback, { label: 'readback' }) : null,
    routeTreeArtifact: options.routeTree !== undefined ? loadArtifactValue(options.routeTree, { label: 'route tree' }) : null,
    pageAnchorArtifact: options.pageAnchor !== undefined ? loadArtifactValue(options.pageAnchor, { label: 'page anchor' }) : null,
    gridAnchorArtifact: options.gridAnchor !== undefined ? loadArtifactValue(options.gridAnchor, { label: 'grid anchor' }) : null,
    chartDataProbesArtifact: options.chartDataProbes !== undefined ? loadArtifactValue(options.chartDataProbes, { label: 'chart data probes' }) : null,
  };
}

function requireArtifact(artifact, label) {
  if (!artifact) {
    throw new Error(`${label} artifact is required`);
  }
  return artifact;
}

function recordConsumedArtifact({ logPath, tool, status = 'ok', summary, args, result, error }) {
  recordToolCall({
    logPath,
    tool,
    toolType: 'node',
    status,
    summary,
    args,
    result,
    error,
  });
}

export async function runUiWriteWrapper(options = {}) {
  const normalized = normalizeWrapperOptions(options);
  const { action, actionDef } = normalized;
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
      transport: 'mcp-artifact',
    },
  });
  const outDir = normalized.outDir
    ? path.resolve(normalized.outDir)
    : buildDefaultOutDir({
      sessionId: run.sessionId,
      sessionRoot: run.sessionRoot,
      runId: run.runId,
    });
  ensureDir(outDir);

  const summary = {
    runId: run.runId,
    logPath: run.logPath,
    action,
    status: 'failed',
    wrapperOnly: true,
    transport: 'mcp-artifact',
    outDir,
    pageUrl: '',
    schemaUid: normalized.schemaUid,
    targetSignature: normalized.targetSignature || '',
    artifactPaths: {},
    statusAxes: buildDefaultStatusAxes(),
    notes: [],
  };

  appendNote({
    logPath: run.logPath,
    message: 'wrapper-only MCP artifact path engaged',
    data: {
      type: 'wrapper_only',
      action,
      transport: 'mcp-artifact',
    },
  });

  recordPhase({
    logPath: run.logPath,
    phase: 'schema_discovery',
    event: 'end',
    status: 'skipped',
    attributes: {
      reason: 'wrapper expects precomputed payload and MCP artifacts',
    },
  });

  let finishStatus = 'failed';
  let finishSummary = `wrapper ${action} failed`;

  try {
    let guardPayload = normalized.payload || normalized.requestBody;
    let requestBody = normalized.requestBody;
    let canonicalizeResult = null;
    let auditResult = null;
    let effectiveMetadata = buildGuardMetadata(normalized);

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

      const payloadDraftPath = path.join(outDir, 'payload.draft.json');
      writeJson(payloadDraftPath, guardPayload);
      summary.artifactPaths.payloadDraft = payloadDraftPath;

      if (requestBody !== null) {
        const requestRawPath = path.join(outDir, 'request.raw.json');
        writeJson(requestRawPath, requestBody);
        summary.artifactPaths.requestRaw = requestRawPath;
      }

      canonicalizeResult = canonicalizePayload({
        payload: guardPayload,
        metadata: effectiveMetadata,
        mode: normalized.mode,
        nocobaseRoot: normalized.nocobaseRoot || undefined,
        snapshotPath: normalized.snapshotFile || undefined,
      });
      const canonicalizePath = path.join(outDir, 'canonicalize-result.json');
      const payloadCanonicalPath = path.join(outDir, 'payload.canonical.json');
      writeJson(canonicalizePath, canonicalizeResult);
      writeJson(payloadCanonicalPath, canonicalizeResult.payload);
      summary.artifactPaths.canonicalizeResult = canonicalizePath;
      summary.artifactPaths.payloadCanonical = payloadCanonicalPath;

      const initialAuditResult = auditPayload({
        payload: canonicalizeResult.payload,
        metadata: effectiveMetadata,
        mode: normalized.mode,
        riskAccept: normalized.riskAccept,
        requirements: normalized.requirements,
        nocobaseRoot: normalized.nocobaseRoot || undefined,
        snapshotPath: normalized.snapshotFile || undefined,
      });
      const auditInitialPath = path.join(outDir, 'audit.initial.json');
      writeJson(auditInitialPath, initialAuditResult);
      summary.artifactPaths.auditInitial = auditInitialPath;

      if (!initialAuditResult.ok) {
        summary.audit = summarizeAudit(initialAuditResult);
        recordConsumedArtifact({
          logPath: run.logPath,
          tool: 'flow_payload_guard.audit-payload',
          status: 'error',
          summary: 'wrapper preflight blocked before live-topology remap',
          args: {
            action,
            stage: 'initial',
          },
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
        const summaryPath = path.join(outDir, 'summary.json');
        writeJson(summaryPath, summary);
        summary.artifactPaths.summary = summaryPath;
        finishStatus = 'failed';
        finishSummary = 'wrapper blocked write on preflight guard';
        return summary;
      }

      const liveTopologyArtifact = normalized.liveTopologyArtifact;
      if (liveTopologyArtifact) {
        const liveTopologyPath = path.join(outDir, 'live-topology.json');
        writeJson(liveTopologyPath, liveTopologyArtifact.raw);
        summary.artifactPaths.liveTopology = liveTopologyPath;

        const liveTopology = normalizeLiveTopologyArtifact(liveTopologyArtifact);
        effectiveMetadata = {
          ...effectiveMetadata,
          liveTopology,
        };
        summary.liveTopology = {
          source: liveTopology.source,
          nodeCount: liveTopology.nodeCount,
        };

        recordConsumedArtifact({
          logPath: run.logPath,
          tool: 'GetFlowmodels_findone',
          summary: 'wrapper consumed live topology artifact before write',
          args: {
            action,
            parentId: normalized.readbackParentId,
            subKey: normalized.readbackSubKey,
            targetSignature: normalized.targetSignature || undefined,
          },
          result: {
            source: liveTopology.source,
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
          const liveRemapPath = path.join(outDir, 'live-topology-remap.json');
          const payloadRemappedPath = path.join(outDir, 'payload.remapped.json');
          writeJson(liveRemapPath, liveRemapResult);
          writeJson(payloadRemappedPath, liveRemapResult.payload);
          summary.artifactPaths.liveTopologyRemap = liveRemapPath;
          summary.artifactPaths.payloadRemapped = payloadRemappedPath;
          summary.liveTopologyRemap = {
            changed: true,
            remappedNodeCount: liveRemapResult.remappedNodes.length,
          };
          summary.notes.push(`live topology remap 已刷新 ${liveRemapResult.remappedNodes.length} 个冲突 descendant uid。`);

          recordConsumedArtifact({
            logPath: run.logPath,
            tool: 'template_clone_helpers.remapConflictingDescendantUids',
            summary: 'wrapper remapped conflicting descendant uids before write',
            args: {
              action,
              targetSignature: normalized.targetSignature || undefined,
            },
            result: {
              changed: true,
              remappedNodeCount: liveRemapResult.remappedNodes.length,
            },
          });
        }
      } else {
        summary.notes.push('未提供 live topology artifact，将跳过 auto-remap。');
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
      const auditPath = path.join(outDir, 'audit.json');
      writeJson(auditPath, auditResult);
      summary.artifactPaths.audit = auditPath;
      summary.audit = summarizeAudit(auditResult);

      recordConsumedArtifact({
        logPath: run.logPath,
        tool: 'flow_payload_guard.audit-payload',
        status: auditResult.ok ? 'ok' : 'error',
        summary: auditResult.ok ? 'wrapper preflight passed' : 'wrapper preflight blocked',
        args: {
          action,
          stage: 'final',
        },
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
        const summaryPath = path.join(outDir, 'summary.json');
        writeJson(summaryPath, summary);
        summary.artifactPaths.summary = summaryPath;
        finishStatus = 'failed';
        finishSummary = 'wrapper blocked write on preflight guard';
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

    const writeResultArtifact = requireArtifact(normalized.writeResultArtifact, 'write result');
    const writeArtifactPath = path.join(outDir, `${action}.result.json`);
    writeJson(writeArtifactPath, writeResultArtifact.raw);
    summary.artifactPaths.writeResult = writeArtifactPath;

    recordConsumedArtifact({
      logPath: run.logPath,
      tool: actionDef.toolName,
      summary: `wrapper consumed ${action} write artifact`,
      args: {
        action,
        targetSignature: normalized.targetSignature || undefined,
        readbackParentId: normalized.readbackParentId || undefined,
        readbackSubKey: normalized.readbackSubKey || undefined,
      },
      result: summarizeNode(writeResultArtifact.data),
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

    if (action === 'create-v2') {
      const schemaUid = normalized.schemaUid
        || normalizeOptionalText(requestBody?.schemaUid)
        || normalizeOptionalText(writeResultArtifact.data?.schemaUid);
      summary.schemaUid = schemaUid;
      summary.pageUrl = buildPageUrlFromCandidatePageUrl(normalized.candidatePageUrl, schemaUid);

      const routeTreeArtifact = normalized.routeTreeArtifact;
      const pageAnchorArtifact = normalized.pageAnchorArtifact;
      const gridAnchorArtifact = normalized.gridAnchorArtifact;

      let routeReady = {
        ok: false,
        pageFound: false,
        defaultTabFound: false,
      };
      if (routeTreeArtifact) {
        const routeTreePath = path.join(outDir, 'route-tree.json');
        writeJson(routeTreePath, routeTreeArtifact.raw);
        summary.artifactPaths.routeTree = routeTreePath;
        routeReady = probeRouteReady(
          Array.isArray(routeTreeArtifact.data) ? routeTreeArtifact.data : [],
          schemaUid,
        );
        recordConsumedArtifact({
          logPath: run.logPath,
          tool: 'GetDesktoproutes_listaccessible',
          summary: routeReady.ok ? 'wrapper route-ready confirmed from artifact' : 'wrapper route-ready partial from artifact',
          args: {
            tree: true,
            schemaUid,
          },
          result: routeReady,
        });
      } else {
        summary.notes.push('缺少 route tree artifact，无法确认 route-ready。');
      }

      let pageAnchor = {
        present: false,
      };
      if (pageAnchorArtifact) {
        const pageAnchorPath = path.join(outDir, 'anchor-page.json');
        writeJson(pageAnchorPath, pageAnchorArtifact.raw);
        summary.artifactPaths.anchorPage = pageAnchorPath;
        pageAnchor = summarizeNode(pageAnchorArtifact.data);
        recordConsumedArtifact({
          logPath: run.logPath,
          tool: 'GetFlowmodels_findone',
          summary: 'wrapper page anchor readback loaded from artifact',
          args: {
            targetSignature: `page:${schemaUid}`,
            parentId: schemaUid,
            subKey: 'page',
          },
          result: pageAnchor,
        });
      } else {
        summary.notes.push('缺少 page anchor artifact。');
      }

      let gridAnchor = {
        present: false,
      };
      if (gridAnchorArtifact) {
        const gridAnchorPath = path.join(outDir, 'anchor-grid.json');
        writeJson(gridAnchorPath, gridAnchorArtifact.raw);
        summary.artifactPaths.anchorGrid = gridAnchorPath;
        gridAnchor = summarizeNode(gridAnchorArtifact.data);
        recordConsumedArtifact({
          logPath: run.logPath,
          tool: 'GetFlowmodels_findone',
          summary: 'wrapper grid anchor readback loaded from artifact',
          args: {
            targetSignature: `grid:tabs-${schemaUid}`,
            parentId: `tabs-${schemaUid}`,
            subKey: 'grid',
          },
          result: gridAnchor,
        });
      } else {
        summary.notes.push('缺少 grid anchor artifact。');
      }

      recordPhase({
        logPath: run.logPath,
        phase: 'readback',
        event: 'end',
        status: routeReady.ok && pageAnchor.present && gridAnchor.present ? 'ok' : 'error',
        attributes: {
          action,
        },
      });

      markSkippedPhase(run.logPath, 'browser_attach', 'browser not requested');
      markSkippedPhase(run.logPath, 'smoke', 'browser not requested');

      summary.routeReady = routeReady;
      summary.pageAnchor = pageAnchor;
      summary.gridAnchor = gridAnchor;
      summary.statusAxes = {
        ...summary.statusAxes,
        ...finalizeStatusAxesForCreateV2({
          routeReady,
          pageAnchor,
          gridAnchor,
          writePresent: true,
        }),
      };
      summary.status = determineWriteStatus({
        action,
        guardBlocked: false,
        writeError: null,
        routeReadyOk: routeReady.ok,
        pageAnchorOk: pageAnchor.present,
        gridAnchorOk: gridAnchor.present,
        readbackPresent: true,
        driftOk: true,
        contractOk: true,
      });
      if (!routeReady.ok) {
        summary.notes.push('create-v2 已执行，但 route-ready 证据仍不完整。');
      }
    } else {
      const readbackArtifact = requireArtifact(normalized.readbackArtifact, 'readback');
      const readbackPath = path.join(outDir, 'readback.json');
      writeJson(readbackPath, readbackArtifact.raw);
      summary.artifactPaths.readback = readbackPath;

      recordConsumedArtifact({
        logPath: run.logPath,
        tool: 'GetFlowmodels_findone',
        summary: 'wrapper write readback loaded from artifact',
        args: {
          targetSignature: normalized.targetSignature || undefined,
          parentId: normalized.readbackParentId,
          subKey: normalized.readbackSubKey,
        },
        result: summarizeNode(readbackArtifact.data),
      });

      const readbackDiffResult = buildReadbackDriftReport(guardPayload, readbackArtifact.data);
      const diffPath = path.join(outDir, 'readback-diff.json');
      writeJson(diffPath, readbackDiffResult);
      summary.artifactPaths.readbackDiff = diffPath;
      summary.readbackDiff = readbackDiffResult.summary;

      const effectiveReadbackContract = augmentReadbackContractWithGridMembership(
        normalized.readbackContract,
        guardPayload,
      );
      const effectiveContractPath = path.join(outDir, 'effective-readback-contract.json');
      writeJson(effectiveContractPath, effectiveReadbackContract);
      summary.artifactPaths.effectiveReadbackContract = effectiveContractPath;

      const readbackContractResult = validateReadbackContract(readbackArtifact.data, effectiveReadbackContract);
      const contractPath = path.join(outDir, 'readback-contract.json');
      writeJson(contractPath, readbackContractResult);
      summary.artifactPaths.readbackContract = contractPath;
      summary.readbackContract = {
        ok: readbackContractResult.ok,
        findingCount: readbackContractResult.findings.length,
      };

      const chartDataProbeResult = normalizeChartDataProbeResult(
        normalized.chartDataProbesArtifact,
        readbackArtifact.data,
      );
      const chartDataProbePath = path.join(outDir, 'chart-data-probes.json');
      writeJson(chartDataProbePath, chartDataProbeResult);
      summary.artifactPaths.chartDataProbes = chartDataProbePath;
      summary.chartDataProbes = chartDataProbeResult.probes;
      summary.statusAxes = {
        ...summary.statusAxes,
        ...finalizeStatusAxesForFlowWrite({
          readbackPresent: true,
          readbackDiffResult,
          readbackContractResult,
          chartDataProbeResult,
        }),
      };

      if (normalized.chartDataProbesArtifact) {
        recordConsumedArtifact({
          logPath: run.logPath,
          tool: 'charts:query',
          summary: 'wrapper consumed chart data probe artifact',
          args: {
            targetSignature: normalized.targetSignature || undefined,
          },
          result: {
            probeCount: chartDataProbeResult.probes.length,
            statusAxis: chartDataProbeResult.statusAxis,
          },
        });
      }

      recordPhase({
        logPath: run.logPath,
        phase: 'readback',
        event: 'end',
        status: readbackDiffResult.ok && readbackContractResult.ok ? 'ok' : 'error',
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
        routeReadyOk: true,
        pageAnchorOk: true,
        gridAnchorOk: true,
        readbackPresent: true,
        driftOk: readbackDiffResult.ok,
        contractOk: readbackContractResult.ok,
      });
      if (!readbackDiffResult.ok) {
        summary.notes.push(`readback diff 发现 ${readbackDiffResult.summary?.driftCount || readbackDiffResult.findings?.length || 0} 处漂移。`);
      }
      if (!readbackContractResult.ok) {
        summary.notes.push('readback contract 未全部通过。');
      }
      if (chartDataProbeResult.statusAxis?.status === 'failed' || chartDataProbeResult.statusAxis?.status === 'not-run') {
        summary.notes.push(chartDataProbeResult.statusAxis.detail);
      }
    }

    const summaryPath = path.join(outDir, 'summary.json');
    writeJson(summaryPath, summary);
    summary.artifactPaths.summary = summaryPath;
    finishStatus = summary.status;
    finishSummary = `wrapper ${action} finished with status ${summary.status}`;
    return summary;
  } catch (error) {
    const serializedError = summarizeError(error);
    const errorPath = path.join(outDir, `${action}.error.json`);
    writeJson(errorPath, serializedError);
    summary.artifactPaths.writeError = errorPath;
    summary.status = 'failed';
    summary.error = serializedError;
    summary.notes.push(serializedError.message);

    recordConsumedArtifact({
      logPath: run.logPath,
      tool: actionDef.toolName,
      status: 'error',
      summary: `wrapper ${action} failed`,
      args: {
        action,
        targetSignature: normalized.targetSignature || undefined,
      },
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
    const summaryPath = path.join(outDir, 'summary.json');
    writeJson(summaryPath, summary);
    summary.artifactPaths.summary = summaryPath;
    finishStatus = 'failed';
    finishSummary = `wrapper ${action} failed`;
    return summary;
  } finally {
    finishRun({
      logPath: run.logPath,
      status: finishStatus,
      summary: finishSummary,
      data: summary,
    });
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
  ) || {};

  const writeResultArtifact = loadArtifactInput({
    jsonValue: flags['write-result-json'],
    fileValue: flags['write-result-file'],
    label: 'write result',
    required: false,
  });
  const liveTopologyArtifact = loadArtifactInput({
    jsonValue: flags['live-topology-json'],
    fileValue: flags['live-topology-file'],
    label: 'live topology',
    required: false,
  });
  const readbackArtifact = loadArtifactInput({
    jsonValue: flags['readback-json'],
    fileValue: flags['readback-file'],
    label: 'readback',
    required: false,
  });
  const routeTreeArtifact = loadArtifactInput({
    jsonValue: flags['route-tree-json'],
    fileValue: flags['route-tree-file'],
    label: 'route tree',
    required: false,
  });
  const pageAnchorArtifact = loadArtifactInput({
    jsonValue: flags['page-anchor-json'],
    fileValue: flags['page-anchor-file'],
    label: 'page anchor',
    required: false,
  });
  const gridAnchorArtifact = loadArtifactInput({
    jsonValue: flags['grid-anchor-json'],
    fileValue: flags['grid-anchor-file'],
    label: 'grid anchor',
    required: false,
  });
  const chartDataProbesArtifact = loadArtifactInput({
    jsonValue: flags['chart-data-probes-json'],
    fileValue: flags['chart-data-probes-file'],
    label: 'chart data probes',
    required: false,
  });

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
    candidatePageUrl: flags['candidate-page-url'],
    writeResult: writeResultArtifact?.raw,
    liveTopology: liveTopologyArtifact?.raw,
    readback: readbackArtifact?.raw,
    routeTree: routeTreeArtifact?.raw,
    pageAnchor: pageAnchorArtifact?.raw,
    gridAnchor: gridAnchorArtifact?.raw,
    chartDataProbes: chartDataProbesArtifact?.raw,
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
