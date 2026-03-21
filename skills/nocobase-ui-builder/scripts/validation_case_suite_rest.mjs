#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { exportLiveTemplate } from './live_template_catalog.mjs';
import { discoverTemplatePayloadFile, runBuild, unwrapResponseEnvelope } from './rest_template_clone_runner.mjs';
import {
  adaptCasePayload,
  getCaseAdapter,
  remapCaseCollectionName,
  remapCaseFieldPath,
} from './validation_case_adapter.mjs';
import { provisionValidationCaseDataset } from './validation_dataset_provisioner.mjs';
import { getValidationCaseById } from './validation_case_registry.mjs';

const HOME = os.homedir();
const DEFAULT_VALIDATION_REVIEW_SKILL_PATH = path.join(HOME, '.codex', 'skills', 'nocobase-ui-validation-review');
const DEFAULT_PREPARE_SCRIPT_PATH = path.join(DEFAULT_VALIDATION_REVIEW_SKILL_PATH, 'scripts', 'prepare_validation_run.mjs');

const DEFAULT_CASE_SOURCES = {
  case1: {
    type: 'file',
    file: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260320T085949-case1', 'evidence', '18-alt-canonicalized-payload.json'),
  },
  case2: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260320T115835-case10-case8-case9-case2-case6-rerun-after-guard-r2', 'cases', 'case2', 'builder-artifacts'),
    browseQuery: 'filterByTk=1',
  },
  case3: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260319T230229-case3-suite-20260319t230229', 'builder-artifacts'),
  },
  case4: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260319T230229-case4-suite-20260319t230229', 'builder-artifacts'),
  },
  case5: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260319T230229-case5-suite-20260319t230229', 'builder-artifacts'),
  },
  case6: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260320T115835-case10-case8-case9-case2-case6-rerun-after-guard-r2', 'cases', 'case6', 'builder-artifacts'),
  },
  case7: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260319T230229-case7-suite-20260319t230229', 'builder-artifacts'),
  },
  case8: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260320T115835-case10-case8-case9-case2-case6-rerun-after-guard-r2', 'cases', 'case8', 'builder-artifacts'),
  },
  case9: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260320T115835-case10-case8-case9-case2-case6-rerun-after-guard-r2', 'cases', 'case9', 'builder-artifacts'),
    browseQuery: 'filterByTk=1',
  },
  case10: {
    type: 'artifacts',
    dir: path.join(HOME, '.codex', 'state', 'nocobase-ui-validation-review', 'sessions', '20260320T115835-case10-case8-case9-case2-case6-rerun-after-guard-r2', 'cases', 'case10', 'builder-artifacts'),
  },
};

const COMPILE_ARTIFACT_COLLECTION_MAPS = {
  case1: {
    customers: 'account',
    order_items: 'order',
    orders: 'order',
    products: 'product',
  },
  case2: {
    activities: 'event',
    contacts: 'contact',
    customers: 'account',
    opportunities: 'opportunity',
  },
  case3: {
    materials: 'val03217_c3_materials',
    purchase_order_items: 'val03217_c3_purchase_order_items',
    purchase_orders: 'val03217_c3_purchase_orders',
    suppliers: 'val03217_c3_suppliers',
  },
  case4: {
    projects: 'projects',
    tasks: 'tasks',
    users: 'users',
  },
  case6: {
    customers: 'val03217_c6_customers',
    invoices: 'val03217_c6_invoices',
    orders: 'val03217_c6_orders',
    payments: 'val03217_c6_payments',
  },
  case7: {
    departments: 'departments',
    users: 'users',
  },
  case8: {
    project_members: 'team_members',
    projects: 'projects',
    users: 'users',
  },
  case9: {
    activities: 'event',
    contacts: 'contact',
    customers: 'account',
    opportunities: 'opportunity',
  },
};

function usage() {
  return [
    'Usage:',
    '  node scripts/validation_case_suite_rest.mjs run [--cases case1,case2,...] [--suite-slug <slug>] [--out-dir <dir>] [--workspace-root <dir>] [--builder-skill-path <dir>] [--prepare-script <path>] [--url-base <url>]',
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
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { command, flags };
}

function normalizeRequiredText(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeCaseIds(rawValue) {
  const rawText = normalizeOptionalText(rawValue) || 'case1,case2,case3,case4,case5,case6,case7,case8,case9,case10';
  const caseIds = rawText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (caseIds.length === 0) {
    throw new Error('at least one case id is required');
  }
  return [...new Set(caseIds)];
}

function appendBrowseQuery(pageUrl, browseQuery) {
  const normalizedPageUrl = normalizeRequiredText(pageUrl, 'page url');
  const normalizedBrowseQuery = normalizeOptionalText(browseQuery);
  if (!normalizedBrowseQuery) {
    return normalizedPageUrl;
  }
  const url = new URL(normalizedPageUrl);
  for (const [key, value] of new URLSearchParams(normalizedBrowseQuery).entries()) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildProvisionedCollectionOverrides(provisionSummary) {
  const overrides = {};
  for (const plan of Array.isArray(provisionSummary?.collectionPlans) ? provisionSummary.collectionPlans : []) {
    const logicalName = normalizeOptionalText(plan?.logicalName);
    const collectionName = normalizeOptionalText(plan?.collectionName);
    if (!logicalName || !collectionName) {
      continue;
    }
    overrides[logicalName] = collectionName;
  }
  return overrides;
}

function mapCompileArtifactCollectionName(caseId, collectionName, collectionOverrides = null) {
  const normalizedCollectionName = normalizeOptionalText(collectionName);
  if (!normalizedCollectionName) {
    return normalizedCollectionName;
  }
  if (collectionOverrides && collectionOverrides[normalizedCollectionName]) {
    return collectionOverrides[normalizedCollectionName];
  }
  const mappedByAdapter = remapCaseCollectionName({
    caseId,
    collectionName: normalizedCollectionName,
  });
  if (mappedByAdapter && mappedByAdapter !== normalizedCollectionName) {
    return mappedByAdapter;
  }
  const caseMap = COMPILE_ARTIFACT_COLLECTION_MAPS[caseId] || {};
  return caseMap[normalizedCollectionName] || normalizedCollectionName;
}

function mapCompileArtifactFieldRef(caseId, fieldRef, { collectionOverrides = null, remapFields = true } = {}) {
  if (typeof fieldRef !== 'string') {
    return fieldRef;
  }
  const normalized = fieldRef.trim();
  const firstDotIndex = normalized.indexOf('.');
  if (firstDotIndex <= 0) {
    return normalized;
  }
  const collectionName = normalized.slice(0, firstDotIndex);
  const fieldPath = normalized.slice(firstDotIndex + 1);
  const mappedCollectionName = mapCompileArtifactCollectionName(caseId, collectionName, collectionOverrides);
  const mappedFieldPath = remapFields
    ? remapCaseFieldPath({
      caseId,
      collectionName,
      fieldPath,
    })
    : fieldPath;
  return `${mappedCollectionName}.${mappedFieldPath || fieldPath}`;
}

function patchCompileArtifactForInstance({
  caseId,
  compileArtifactPath,
  collectionOverrides = null,
  remapToCurrentInstance = true,
}) {
  const compileArtifact = readJson(compileArtifactPath);
  const mappedRequiredCollections = Array.isArray(compileArtifact.requiredCollections)
    ? compileArtifact.requiredCollections.map((item) => mapCompileArtifactCollectionName(caseId, item, collectionOverrides))
    : [];
  compileArtifact.requiredCollections = mappedRequiredCollections;

  if (Array.isArray(compileArtifact.requiredMetadataRefs?.collections)) {
    compileArtifact.requiredMetadataRefs.collections = compileArtifact.requiredMetadataRefs.collections
      .map((item) => mapCompileArtifactCollectionName(caseId, item, collectionOverrides));
  }

  if (Array.isArray(compileArtifact.requiredMetadataRefs?.fields)) {
    compileArtifact.requiredMetadataRefs.fields = compileArtifact.requiredMetadataRefs.fields
      .map((item) => mapCompileArtifactFieldRef(caseId, item, {
        collectionOverrides,
        remapFields: remapToCurrentInstance,
      }));
  }

  if (Array.isArray(compileArtifact.requiredMetadataRefs?.associations)) {
    compileArtifact.requiredMetadataRefs.associations = compileArtifact.requiredMetadataRefs.associations.map((item) => ({
      ...item,
      sourceCollection: item.sourceCollection
        ? mapCompileArtifactCollectionName(caseId, item.sourceCollection, collectionOverrides)
        : item.sourceCollection,
      targetCollection: item.targetCollection
        ? mapCompileArtifactCollectionName(caseId, item.targetCollection, collectionOverrides)
        : item.targetCollection,
    }));
  }

  if (Array.isArray(compileArtifact.guardRequirements?.requiredActions)) {
    compileArtifact.guardRequirements.requiredActions = compileArtifact.guardRequirements.requiredActions.map((item) => ({
      ...item,
      collectionName: mapCompileArtifactCollectionName(caseId, item.collectionName, collectionOverrides),
    }));
  }

  if (Array.isArray(compileArtifact.guardRequirements?.expectedFilterContracts)) {
    compileArtifact.guardRequirements.expectedFilterContracts = compileArtifact.guardRequirements.expectedFilterContracts.map((item) => ({
      ...item,
      collectionName: item.collectionName
        ? mapCompileArtifactCollectionName(caseId, item.collectionName, collectionOverrides)
        : item.collectionName,
    }));
  }

  compileArtifact.guardRequirements = {
    ...(compileArtifact.guardRequirements || {}),
    metadataTrust: {
      ...(compileArtifact.guardRequirements?.metadataTrust || {}),
      runtimeSensitive: 'live',
    },
  };

  if (remapToCurrentInstance && compileArtifact.payloadFragment && getCaseAdapter(caseId)) {
    compileArtifact.payloadFragment = adaptCasePayload({
      caseId,
      payload: compileArtifact.payloadFragment,
    }).payload;
  }

  if (remapToCurrentInstance && compileArtifact.primitiveTree && getCaseAdapter(caseId)) {
    compileArtifact.primitiveTree = adaptCasePayload({
      caseId,
      payload: compileArtifact.primitiveTree,
    }).payload;
  }

  if ((caseId === 'case1' || caseId === 'case7') && remapToCurrentInstance) {
    compileArtifact.guardRequirements.requiredActions = [];
  }

  writeJson(compileArtifactPath, compileArtifact);
  return compileArtifact;
}

function runJsonScript(scriptPath, args) {
  const output = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: path.dirname(scriptPath),
    encoding: 'utf8',
    env: process.env,
  });
  return JSON.parse(output);
}

function resolveCaseTitle(caseId) {
  const caseDefinition = getValidationCaseById(caseId);
  if (!caseDefinition) {
    throw new Error(`validation case not found: ${caseId}`);
  }
  return caseDefinition.title;
}

async function resolveTemplateArtifactsDir({ caseId, suiteCaseDir, urlBase }) {
  const source = DEFAULT_CASE_SOURCES[caseId];
  if (!source) {
    throw new Error(`no default template source configured for ${caseId}`);
  }
  if (source.type === 'file') {
    const sourceFile = path.resolve(normalizeRequiredText(source.file, `${caseId} source file`));
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`source file does not exist for ${caseId}: ${sourceFile}`);
    }
    const exportDir = path.join(suiteCaseDir, 'file-template');
    const rawTemplate = readJson(sourceFile);
    const candidatePayload = isPlainObject(rawTemplate?.payload) ? rawTemplate.payload : rawTemplate;
    const unwrappedPayload = unwrapResponseEnvelope(candidatePayload);
    if (!isPlainObject(unwrappedPayload) || typeof unwrappedPayload.use !== 'string') {
      throw new Error(`source file does not contain a valid flow payload for ${caseId}: ${sourceFile}`);
    }
    ensureDir(exportDir);
    writeJson(path.join(exportDir, 'source-template.json'), unwrappedPayload);
    return {
      sourceType: source.type,
      templateArtifactsDir: exportDir,
      browseQuery: normalizeOptionalText(source.browseQuery),
      sourceDetails: {
        ...source,
        sourceFile,
      },
    };
  }
  if (source.type === 'artifacts') {
    if (!fs.existsSync(source.dir)) {
      throw new Error(`artifact dir does not exist for ${caseId}: ${source.dir}`);
    }
    return {
      sourceType: source.type,
      templateArtifactsDir: source.dir,
      browseQuery: normalizeOptionalText(source.browseQuery),
      sourceDetails: source,
    };
  }
  if (source.type === 'live-template') {
    const exportDir = path.join(suiteCaseDir, 'live-template');
    const exported = await exportLiveTemplate({
      schemaUid: source.schemaUid,
      title: source.title,
      target: source.target || 'grid',
      outDir: exportDir,
      urlBase,
    });
    return {
      sourceType: source.type,
      templateArtifactsDir: exportDir,
      browseQuery: normalizeOptionalText(source.browseQuery),
      sourceDetails: {
        ...source,
        exported,
      },
    };
  }
  throw new Error(`unsupported source type for ${caseId}: ${source.type}`);
}

function resolveAdaptedTemplateArtifactsDir({ caseId, templateArtifactsDir, suiteCaseDir }) {
  if (!getCaseAdapter(caseId)) {
    return {
      templateArtifactsDir,
      adapterSummary: null,
    };
  }

  const templateFilePath = discoverTemplatePayloadFile({
    templateArtifactsDir,
    caseId,
  });
  const rawTemplate = readJson(templateFilePath);
  const unwrappedPayload = unwrapResponseEnvelope(rawTemplate);
  const adapted = adaptCasePayload({
    caseId,
    payload: unwrappedPayload,
  });
  const adaptedDir = path.join(suiteCaseDir, 'adapted-template');
  ensureDir(adaptedDir);
  writeJson(path.join(adaptedDir, `${caseId}-remap-payload.json`), adapted.payload);
  writeJson(path.join(adaptedDir, 'adapter-summary.json'), {
    caseId,
    sourceTemplateFile: templateFilePath,
    changeCount: adapted.changes.length,
    changes: adapted.changes,
  });
  return {
    templateArtifactsDir: adaptedDir,
    adapterSummary: {
      sourceTemplateFile: templateFilePath,
      adaptedDir,
      changeCount: adapted.changes.length,
      changes: adapted.changes,
    },
  };
}

async function runSuite(flags) {
  const caseIds = normalizeCaseIds(flags.cases);
  const suiteSlug = normalizeOptionalText(flags['suite-slug']) || `suite-${Date.now()}`;
  const workspaceRoot = path.resolve(normalizeOptionalText(flags['workspace-root']) || process.cwd());
  const builderSkillPath = path.resolve(normalizeOptionalText(flags['builder-skill-path']) || path.join(workspaceRoot, 'skills', 'nocobase-ui-builder'));
  const outDir = path.resolve(normalizeOptionalText(flags['out-dir']) || path.join(workspaceRoot, '.tmp', 'validation-suite', suiteSlug));
  const prepareScriptPath = path.resolve(normalizeOptionalText(flags['prepare-script']) || DEFAULT_PREPARE_SCRIPT_PATH);
  const urlBase = normalizeOptionalText(flags['url-base']) || 'http://127.0.0.1:23000';
  const suiteSummary = {
    generatedAt: new Date().toISOString(),
    suiteSlug,
    workspaceRoot,
    builderSkillPath,
    prepareScriptPath,
    urlBase,
    cases: [],
  };

  ensureDir(outDir);

  for (const caseId of caseIds) {
    const suiteCaseDir = path.join(outDir, caseId);
    ensureDir(suiteCaseDir);

    const prepareResult = runJsonScript(prepareScriptPath, [
      'prepare',
      '--case-request',
      caseId,
      '--base-slug',
      `${caseId}-${suiteSlug}`,
      '--workspace-root',
      workspaceRoot,
      '--builder-skill-path',
      builderSkillPath,
      '--out-dir',
      suiteCaseDir,
      '--url-base',
      urlBase,
    ]);

    const { templateArtifactsDir: rawTemplateArtifactsDir, browseQuery, sourceType, sourceDetails } = await resolveTemplateArtifactsDir({
      caseId,
      suiteCaseDir,
      urlBase,
    });
    const provisionSummary = await provisionValidationCaseDataset({
      caseId,
      templateArtifactsDir: rawTemplateArtifactsDir,
      outDir: path.join(suiteCaseDir, 'dataset-provision'),
      urlBase,
    });
    const shouldAdaptTemplate = Boolean(getCaseAdapter(caseId));
    const useNativeTemplate = Boolean(provisionSummary.nativeTemplateReady);
    const {
      templateArtifactsDir,
      adapterSummary,
    } = shouldAdaptTemplate && !useNativeTemplate
      ? resolveAdaptedTemplateArtifactsDir({
        caseId,
        templateArtifactsDir: rawTemplateArtifactsDir,
        suiteCaseDir,
      })
      : {
        templateArtifactsDir: rawTemplateArtifactsDir,
        adapterSummary: null,
      };
    const usingAdaptedTemplate = Boolean(adapterSummary);
    const provisionedCollectionOverrides = buildProvisionedCollectionOverrides(provisionSummary);

    patchCompileArtifactForInstance({
      caseId,
      compileArtifactPath: prepareResult.artifactPaths.compileArtifactPath,
      collectionOverrides: !usingAdaptedTemplate
        ? provisionedCollectionOverrides
        : null,
      remapToCurrentInstance: usingAdaptedTemplate,
    });

    const title = resolveCaseTitle(caseId);
    const buildArtifactsDir = path.join(suiteCaseDir, 'builder-artifacts');
    ensureDir(buildArtifactsDir);

    const buildSummary = await runBuild({
      'case-id': caseId,
      title,
      'template-artifacts-dir': templateArtifactsDir,
      'out-dir': buildArtifactsDir,
      'requirements-file': prepareResult.artifactPaths.compileArtifactPath,
      'url-base': urlBase,
    });

    const browseUrl = appendBrowseQuery(buildSummary.pageUrl, browseQuery);
    const recordBuildResult = runJsonScript(prepareScriptPath, [
      'record-build',
      '--session-manifest',
      prepareResult.manifestPath,
      '--status',
      buildSummary.status,
      '--task',
      `validation suite rest clone for ${caseId}`,
      '--schema-uid',
      buildSummary.schemaUid,
      '--route-segment',
      buildSummary.routeSegment,
      '--page-urls-json',
      JSON.stringify([browseUrl]),
      '--notes-json',
      JSON.stringify([
        `templateSourceType=${sourceType}`,
        `templateArtifactsDir=${templateArtifactsDir}`,
        `nativeTemplateReady=${useNativeTemplate}`,
        `datasetReady=${provisionSummary.datasetReady}`,
        `browseUrl=${browseUrl}`,
        adapterSummary ? `adapterChanges=${adapterSummary.changeCount}` : '',
      ]),
      '--reused-artifacts-json',
      JSON.stringify([]),
      '--is-fresh-build',
      'true',
    ]);

    const compileArtifact = readJson(prepareResult.artifactPaths.compileArtifactPath);
    const caseSummary = {
      caseId,
      title,
      expectedOutcome: compileArtifact.expectedOutcome || '',
      tier: compileArtifact.tier || '',
      sessionDir: prepareResult.sessionDir,
      sessionManifestPath: prepareResult.manifestPath,
      reportJsonPath: prepareResult.reportJsonPath,
      buildSpecPath: prepareResult.artifactPaths.buildSpecPath,
      verifySpecPath: prepareResult.artifactPaths.verifySpecPath,
      compileArtifactPath: prepareResult.artifactPaths.compileArtifactPath,
      templateArtifactsDir,
      sourceType,
      sourceDetails,
      provisionSummary,
      adapterSummary,
      buildArtifactsDir,
      buildSummaryPath: path.join(buildArtifactsDir, 'summary.json'),
      buildStatus: buildSummary.status,
      guardBlocked: buildSummary.guardBlocked === true,
      pageUrl: buildSummary.pageUrl,
      browseUrl,
      recordBuildResult,
    };
    suiteSummary.cases.push(caseSummary);
    writeJson(path.join(suiteCaseDir, 'case-summary.json'), caseSummary);
  }

  const suiteSummaryPath = path.join(outDir, 'suite-build-summary.json');
  writeJson(suiteSummaryPath, suiteSummary);
  return {
    outDir,
    suiteSummaryPath,
    cases: suiteSummary.cases.map((item) => ({
      caseId: item.caseId,
      buildStatus: item.buildStatus,
      pageUrl: item.pageUrl,
      browseUrl: item.browseUrl,
    })),
  };
}

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === 'run') {
    const result = await runSuite(flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error(`Unsupported command "${command}"`);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  });
}
