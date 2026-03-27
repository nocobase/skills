#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCKER_EXIT_CODE, VALIDATION_CASE_MODE } from './flow_payload_guard.mjs';
import {
  ensureDir,
  loadArtifactInput,
  normalizeOptionalText,
  normalizeRequiredText,
  readJsonFile,
  readJsonInput,
  writeJson,
} from './mcp_artifact_support.mjs';
import { runUiWriteWrapper } from './ui_write_wrapper.mjs';

const WRITE_FAILURE_EXIT_CODE = 3;
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
    '    [--out-dir <path>]',
    '    [--session-id <id>]',
    '    [--session-root <path>]',
    '    [--title <title>]',
    '    [--schema-uid <schemaUid>]',
    '    [--target-signature <signature>]',
    '    [--snapshot-file <path>]',
    '    [--nocobase-root <path>]',
    '    [--candidate-page-url <url>]',
    '    [--write-result-json <json> | --write-result-file <path>]',
    '    [--live-topology-json <json> | --live-topology-file <path>]',
    '    [--readback-json <json> | --readback-file <path>]',
    '    [--route-tree-json <json> | --route-tree-file <path>]',
    '    [--page-anchor-json <json> | --page-anchor-file <path>]',
    '    [--grid-anchor-json <json> | --grid-anchor-file <path>]',
    '    [--chart-data-probes-json <json> | --chart-data-probes-file <path>]',
    '',
    'Notes:',
    '  - 这是 flow-only 兼容入口；实际 guard/readback 逻辑委托给 ui_write_wrapper.mjs。',
    '  - 脚本本身不再直接访问 NocoBase API；写入与 readback 证据必须先由 agent 通过 MCP 获取。',
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

function normalizeOperation(value) {
  const normalized = normalizeRequiredText(value, 'operation');
  if (!SUPPORTED_OPERATIONS.has(normalized)) {
    throw new Error(`Unsupported operation "${normalized}"`);
  }
  return normalized;
}

function copyIfNeeded(sourcePath, targetPath) {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedSource === resolvedTarget) {
    return resolvedTarget;
  }
  ensureDir(path.dirname(resolvedTarget));
  fs.copyFileSync(resolvedSource, resolvedTarget);
  return resolvedTarget;
}

function maybeAliasArtifact(artifacts, key, sourcePath, targetPath) {
  if (!sourcePath) {
    return null;
  }
  const aliasedPath = copyIfNeeded(sourcePath, targetPath);
  artifacts[key] = aliasedPath;
  return aliasedPath;
}

function buildFlowReadbackSummary(operation, uiSummary) {
  if (operation === 'create-v2') {
    return {
      ok: Boolean(uiSummary.routeReady?.ok && uiSummary.pageAnchor?.present && uiSummary.gridAnchor?.present),
      routeReady: uiSummary.routeReady ?? null,
      pageAnchor: uiSummary.pageAnchor ?? null,
      gridAnchor: uiSummary.gridAnchor ?? null,
    };
  }

  const contract = uiSummary.artifactPaths.readbackContract
    ? readJsonFile(uiSummary.artifactPaths.readbackContract)
    : { ok: false, findings: [] };
  const diff = uiSummary.artifactPaths.readbackDiff
    ? readJsonFile(uiSummary.artifactPaths.readbackDiff)
    : { ok: false, findings: [], summary: { driftCount: 0 } };
  return {
    ok: Boolean(uiSummary.artifactPaths.readback && contract.ok && diff.ok),
    contract,
    diff,
  };
}

function buildCompatibilityArtifacts({ uiSummary, outDir, operation }) {
  const artifacts = {};
  const uiArtifacts = uiSummary.artifactPaths || {};

  maybeAliasArtifact(artifacts, 'payloadDraft', uiArtifacts.payloadDraft, path.join(outDir, 'verify-payload.draft.json'));
  maybeAliasArtifact(artifacts, 'requestPayload', uiArtifacts.requestRaw, path.join(outDir, 'request-payload.json'));
  maybeAliasArtifact(artifacts, 'canonicalizeResult', uiArtifacts.canonicalizeResult, path.join(outDir, 'canonicalize-result.json'));
  maybeAliasArtifact(artifacts, 'verifyPayloadCanonical', uiArtifacts.payloadCanonical, path.join(outDir, 'verify-payload.canonical.json'));
  maybeAliasArtifact(artifacts, 'auditInitial', uiArtifacts.auditInitial, path.join(outDir, 'audit.initial.json'));
  maybeAliasArtifact(artifacts, 'liveTopology', uiArtifacts.liveTopology, path.join(outDir, 'live-topology.json'));
  maybeAliasArtifact(artifacts, 'liveTopologyRemap', uiArtifacts.liveTopologyRemap, path.join(outDir, 'live-topology-remap.json'));
  maybeAliasArtifact(artifacts, 'verifyPayloadRemapped', uiArtifacts.payloadRemapped, path.join(outDir, 'verify-payload.remapped.json'));
  maybeAliasArtifact(artifacts, 'audit', uiArtifacts.audit, path.join(outDir, 'audit.json'));
  maybeAliasArtifact(artifacts, 'writeResult', uiArtifacts.writeResult, path.join(outDir, `${operation}-result.json`));
  maybeAliasArtifact(artifacts, 'readback', uiArtifacts.readback, path.join(outDir, 'readback.json'));
  maybeAliasArtifact(artifacts, 'readbackDiff', uiArtifacts.readbackDiff, path.join(outDir, 'readback-diff.json'));
  maybeAliasArtifact(artifacts, 'effectiveReadbackContract', uiArtifacts.effectiveReadbackContract, path.join(outDir, 'effective-readback-contract.json'));
  maybeAliasArtifact(artifacts, 'readbackContract', uiArtifacts.readbackContract, path.join(outDir, 'readback-contract.json'));
  maybeAliasArtifact(artifacts, 'routeTree', uiArtifacts.routeTree, path.join(outDir, 'route-tree.json'));
  maybeAliasArtifact(artifacts, 'anchorPage', uiArtifacts.anchorPage, path.join(outDir, 'anchor-page.json'));
  maybeAliasArtifact(artifacts, 'anchorGrid', uiArtifacts.anchorGrid, path.join(outDir, 'anchor-grid.json'));
  maybeAliasArtifact(artifacts, 'chartDataProbes', uiArtifacts.chartDataProbes, path.join(outDir, 'chart-data-probes.json'));

  if (uiArtifacts.summary) {
    const uiWrapperSummaryPath = path.join(outDir, 'ui-wrapper.summary.json');
    artifacts.uiWrapperSummary = copyIfNeeded(uiArtifacts.summary, uiWrapperSummaryPath);
  }

  return artifacts;
}

async function runFlowWrite(flags) {
  const operation = normalizeOperation(flags.operation || flags.action);
  const mode = normalizeOptionalText(flags.mode) || VALIDATION_CASE_MODE;
  const requestPayload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const verifyPayload = operation === 'create-v2'
    ? requestPayload
    : (readJsonInput(flags['verify-payload-json'], flags['verify-payload-file'], 'verify payload', { required: false }) || requestPayload);
  const verifyPayloadSeparate = operation !== 'create-v2' && verifyPayload !== requestPayload;
  const metadata = readJsonInput(flags['metadata-json'], flags['metadata-file'], 'metadata', { required: false }) || {};
  const requirements = readJsonInput(flags['requirements-json'], flags['requirements-file'], 'requirements', { required: false }) || {};
  const readbackContract = readJsonInput(flags['readback-contract-json'], flags['readback-contract-file'], 'readback contract', { required: false }) || {};

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

  const schemaUid = normalizeOptionalText(flags['schema-uid']) || normalizeOptionalText(requestPayload?.schemaUid);
  const readbackParentId = operation === 'create-v2' ? '' : normalizeRequiredText(flags['readback-parent-id'], 'readback parent id');
  const readbackSubKey = operation === 'create-v2' ? '' : normalizeRequiredText(flags['readback-sub-key'], 'readback sub key');
  const targetSignature = normalizeOptionalText(flags['target-signature'])
    || (operation === 'create-v2' ? `page-shell:${schemaUid}` : `${readbackParentId}::${readbackSubKey}`);
  const outDir = path.resolve(normalizeRequiredText(flags['out-dir'], 'out dir'));

  ensureDir(outDir);

  const uiSummary = await runUiWriteWrapper({
    action: operation,
    task: normalizeRequiredText(flags.task, 'task'),
    title: flags.title,
    schemaUid,
    sessionId: flags['session-id'],
    sessionRoot: flags['session-root'],
    outDir,
    requestBody: requestPayload,
    payload: verifyPayload,
    metadata,
    requirements,
    readbackContract,
    riskAccept: flags['risk-accept'],
    mode,
    nocobaseRoot: flags['nocobase-root'],
    snapshotFile: normalizeOptionalText(flags['snapshot-file']) || DEFAULT_RUNJS_SNAPSHOT_PATH,
    targetSignature,
    readbackParentId,
    readbackSubKey,
    candidatePageUrl: flags['candidate-page-url'],
    writeResult: writeResultArtifact?.raw,
    liveTopology: liveTopologyArtifact?.raw,
    readback: readbackArtifact?.raw,
    routeTree: routeTreeArtifact?.raw,
    pageAnchor: pageAnchorArtifact?.raw,
    gridAnchor: gridAnchorArtifact?.raw,
    chartDataProbes: chartDataProbesArtifact?.raw,
  });

  const artifacts = buildCompatibilityArtifacts({
    uiSummary,
    outDir,
    operation,
  });

  const summary = {
    entry: 'flow_write_wrapper',
    operation,
    targetSignature,
    mode,
    verifyPayloadSeparate,
    outDir,
    logPath: uiSummary.logPath,
    artifacts,
    notes: Array.isArray(uiSummary.notes) ? uiSummary.notes : [],
    status: uiSummary.status,
    guardBlocked: uiSummary.guardBlocked,
    audit: uiSummary.audit,
    liveTopology: uiSummary.liveTopology,
    liveTopologyRemap: uiSummary.liveTopologyRemap,
    routeReady: uiSummary.routeReady,
    pageAnchor: uiSummary.pageAnchor,
    gridAnchor: uiSummary.gridAnchor,
    pageUrl: uiSummary.pageUrl,
    chartDataProbes: uiSummary.chartDataProbes,
    statusAxes: uiSummary.statusAxes,
    write: {
      ok: Boolean(uiSummary.artifactPaths.writeResult),
      operation,
    },
    readback: buildFlowReadbackSummary(operation, uiSummary),
  };

  if (uiSummary.error) {
    summary.error = uiSummary.error;
  }

  const summaryPath = path.join(outDir, 'summary.json');
  writeJson(summaryPath, summary);
  summary.artifacts.summary = summaryPath;

  return {
    exitCode: uiSummary.guardBlocked
      ? BLOCKER_EXIT_CODE
      : (uiSummary.status === 'success' ? 0 : WRITE_FAILURE_EXIT_CODE),
    summary,
  };
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
