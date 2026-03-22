#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_POPUP_PAGE_USE,
  getDefaultTabUseForPage,
  getFormUseForMode,
  normalizeFormMode,
  normalizePageUse,
} from './model_contracts.mjs';
import { buildDynamicValidationScenario } from './validation_scenario_planner.mjs';
import { probeInstanceInventory } from './instance_inventory_probe.mjs';

export const BUILD_SPEC_VERSION = '1.0';
export const VERIFY_SPEC_VERSION = '1.0';
export const DEFAULT_BUILD_COMPILE_MODE = 'primitive-tree';

const BLOCK_USE_BY_KIND = {
  Page: 'RootPageModel',
  Tabs: 'RootPageTabModel',
  Grid: 'BlockGridModel',
  Filter: 'FilterFormBlockModel',
  Table: 'TableBlockModel',
  Details: 'DetailsBlockModel',
};

const ACTION_USE_BY_KIND = {
  'create-popup': 'AddNewActionModel',
  'view-record-popup': 'ViewActionModel',
  'edit-record-popup': 'EditActionModel',
  'delete-record': 'DeleteActionModel',
  'add-child-record-popup': 'AddChildActionModel',
  'record-action': 'JSRecordActionModel',
};

const SUPPORTED_BLOCK_KINDS = new Set(['Filter', 'Table', 'Details', 'Form', 'PublicUse']);
const SUPPORTED_REQUIRED_ACTION_SCOPES = new Set(['block-actions', 'row-actions', 'details-actions', 'either']);
const METADATA_TRUST_LEVELS = new Set(['live', 'stable', 'cache', 'artifact', 'unknown', 'not-required']);

function resolveActionUse(kind) {
  const resolvedUse = ACTION_USE_BY_KIND[kind];
  if (!resolvedUse) {
    throw new Error(`Unsupported action kind "${kind}"`);
  }
  return resolvedUse;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/spec_contracts.mjs normalize-build-spec (--input-json <json> | --input-file <path>)',
    '  node scripts/spec_contracts.mjs normalize-verify-spec (--input-json <json> | --input-file <path>)',
    '  node scripts/spec_contracts.mjs compile-build-spec (--input-json <json> | --input-file <path>)',
    '  node scripts/spec_contracts.mjs build-validation-specs --case-request <text> --session-id <id> --candidate-page-url <url> [--base-slug <slug>] [--session-dir <path>] [--random-seed <seed>] [--instance-inventory-file <path> | --instance-inventory-json <json>]',
  ].join('\n');
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
      throw new Error(`Unexpected argument: ${token}`);
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

function parseJson(rawValue, label) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function readJsonInput(jsonValue, filePath, label) {
  if (jsonValue) {
    return parseJson(jsonValue, label);
  }
  if (filePath) {
    return parseJson(fs.readFileSync(path.resolve(filePath), 'utf8'), `${label} file`);
  }
  throw new Error(`${label} input is required`);
}

function readOptionalJsonInput(jsonValue, filePath, label) {
  if (!jsonValue && !filePath) {
    return null;
  }
  return readJsonInput(jsonValue, filePath, label);
}

function sortUniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function normalizeSource(rawSource, fallbackText) {
  if (typeof rawSource === 'string') {
    return {
      kind: 'request',
      text: rawSource.trim(),
    };
  }
  if (rawSource && typeof rawSource === 'object') {
    return {
      kind: typeof rawSource.kind === 'string' && rawSource.kind.trim() ? rawSource.kind.trim() : 'request',
      text: typeof rawSource.text === 'string' && rawSource.text.trim()
        ? rawSource.text.trim()
        : fallbackText,
      sessionId: typeof rawSource.sessionId === 'string' && rawSource.sessionId.trim()
        ? rawSource.sessionId.trim()
        : undefined,
    };
  }
  return {
    kind: 'request',
    text: fallbackText,
  };
}

function normalizeAction(action, index, label = 'actions') {
  if (!action || typeof action !== 'object') {
    throw new Error(`${label}[${index}] must be an object`);
  }
  const kind = normalizeNonEmpty(action.kind, `${label}[${index}].kind`);
  return {
    kind,
    label: typeof action.label === 'string' && action.label.trim() ? action.label.trim() : kind,
    use: resolveActionUse(kind),
    popup: action.popup && typeof action.popup === 'object'
      ? normalizePopup(action.popup, `${label}[${index}].popup`)
      : null,
  };
}

function normalizeActions(actions, label) {
  if (actions == null) {
    return [];
  }
  if (!Array.isArray(actions)) {
    throw new Error(`${label} must be an array`);
  }
  return actions.map((item, index) => normalizeAction(item, index, label));
}

function normalizePopup(popup, label) {
  if (!popup || typeof popup !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  if (popup.tabs !== undefined || popup.layout?.tabs !== undefined) {
    throw new Error(`${label}.tabs is not supported yet; popup currently only supports pageUse + blocks`);
  }
  return {
    title: typeof popup.title === 'string' && popup.title.trim() ? popup.title.trim() : '',
    pageUse: normalizePageUse(popup.pageUse, `${label}.pageUse`, {
      fallbackValue: DEFAULT_POPUP_PAGE_USE,
    }),
    blocks: normalizeBlocks(popup.blocks, `${label}.blocks`),
  };
}

function normalizeBlock(block, index, label = 'blocks') {
  if (!block || typeof block !== 'object') {
    throw new Error(`${label}[${index}] must be an object`);
  }
  const explicitUse = typeof block.use === 'string' && block.use.trim() ? block.use.trim() : '';
  const kind = explicitUse
    ? (typeof block.kind === 'string' && block.kind.trim() ? block.kind.trim() : 'PublicUse')
    : normalizeNonEmpty(block.kind, `${label}[${index}].kind`);
  if (!SUPPORTED_BLOCK_KINDS.has(kind)) {
    throw new Error(`${label}[${index}].kind must be one of ${[...SUPPORTED_BLOCK_KINDS].join(', ')}`);
  }
  if (kind === 'PublicUse' && !explicitUse) {
    throw new Error(`${label}[${index}].use is required when kind=PublicUse`);
  }
  const normalized = {
    kind,
    use: explicitUse,
    title: typeof block.title === 'string' && block.title.trim() ? block.title.trim() : '',
    collectionName: typeof block.collectionName === 'string' && block.collectionName.trim()
      ? block.collectionName.trim()
      : '',
    fields: sortUniqueStrings(block.fields),
    actions: normalizeActions(block.actions, `${label}[${index}].actions`),
    rowActions: normalizeActions(block.rowActions, `${label}[${index}].rowActions`),
    blocks: normalizeBlocks(block.blocks, `${label}[${index}].blocks`),
    relationScope: block.relationScope && typeof block.relationScope === 'object'
      ? {
        sourceCollection: typeof block.relationScope.sourceCollection === 'string' ? block.relationScope.sourceCollection.trim() : '',
        targetCollection: typeof block.relationScope.targetCollection === 'string' ? block.relationScope.targetCollection.trim() : '',
        associationName: typeof block.relationScope.associationName === 'string' ? block.relationScope.associationName.trim() : '',
      }
      : null,
    popup: block.popup && typeof block.popup === 'object'
      ? normalizePopup(block.popup, `${label}[${index}].popup`)
      : null,
    mode: typeof block.mode === 'string' && block.mode.trim() ? normalizeFormMode(block.mode, `${label}[${index}].mode`) : '',
    targetCollectionName: typeof block.targetCollectionName === 'string' && block.targetCollectionName.trim()
      ? block.targetCollectionName.trim()
      : '',
    targetBlock: typeof block.targetBlock === 'string' && block.targetBlock.trim() ? block.targetBlock.trim() : '',
    treeTable: block.treeTable === true,
  };

  if (normalized.kind === 'Form') {
    normalized.mode = normalizeFormMode(normalized.mode, `${label}[${index}].mode`);
  }

  return normalized;
}

function normalizeBlocks(blocks, label = 'blocks') {
  if (blocks == null) {
    return [];
  }
  if (!Array.isArray(blocks)) {
    throw new Error(`${label} must be an array`);
  }
  return blocks.map((item, index) => normalizeBlock(item, index, label));
}

function normalizeTabs(tabs, label = 'layout.tabs') {
  if (tabs == null) {
    return [];
  }
  if (!Array.isArray(tabs)) {
    throw new Error(`${label} must be an array`);
  }
  return tabs.map((tab, index) => {
    if (!tab || typeof tab !== 'object') {
      throw new Error(`${label}[${index}] must be an object`);
    }
    return {
      title: normalizeNonEmpty(tab.title, `${label}[${index}].title`),
      blocks: normalizeBlocks(tab.blocks, `${label}[${index}].blocks`),
    };
  });
}

function normalizeRequiredActions(explicit) {
  if (!Array.isArray(explicit) || explicit.length === 0) {
    return [];
  }
  return explicit.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`requirements.requiredActions[${index}] must be an object`);
    }
    const kind = normalizeNonEmpty(entry.kind, `requirements.requiredActions[${index}].kind`);
    resolveActionUse(kind);
    const collectionName = normalizeNonEmpty(
      entry.collectionName,
      `requirements.requiredActions[${index}].collectionName`,
    );
    const scope = typeof entry.scope === 'string' && entry.scope.trim() ? entry.scope.trim() : 'either';
    if (!SUPPORTED_REQUIRED_ACTION_SCOPES.has(scope)) {
      throw new Error(`requirements.requiredActions[${index}].scope must be one of ${[...SUPPORTED_REQUIRED_ACTION_SCOPES].join(', ')}`);
    }
    return {
      kind,
      collectionName,
      scope,
    };
  });
}

function dedupeRequiredActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = `${action.kind}:${action.collectionName}:${action.scope}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeMetadataTrustLevel(value, label, fallbackValue = null) {
  if (value == null || value === '') {
    return fallbackValue;
  }
  const normalized = normalizeNonEmpty(value, label);
  if (!METADATA_TRUST_LEVELS.has(normalized)) {
    throw new Error(`${label} must be one of ${[...METADATA_TRUST_LEVELS].join(', ')}`);
  }
  return normalized;
}

function normalizeExpectedFilterContracts(explicit) {
  if (!Array.isArray(explicit) || explicit.length === 0) {
    return [];
  }
  return explicit.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`requirements.expectedFilterContracts[${index}] must be an object`);
    }
    const use = entry.use == null ? null : normalizeNonEmpty(entry.use, `requirements.expectedFilterContracts[${index}].use`);
    const collectionName = entry.collectionName == null
      ? null
      : normalizeNonEmpty(entry.collectionName, `requirements.expectedFilterContracts[${index}].collectionName`);
    return {
      use,
      collectionName,
      selectorKind: typeof entry.selectorKind === 'string' && entry.selectorKind.trim()
        ? entry.selectorKind.trim()
        : 'any',
      dataScopeMode: typeof entry.dataScopeMode === 'string' && entry.dataScopeMode.trim()
        ? entry.dataScopeMode.trim()
        : 'any',
      allowNonEmptyDataScope: entry.allowNonEmptyDataScope === true,
      metadataTrust: normalizeMetadataTrustLevel(
        entry.metadataTrust,
        `requirements.expectedFilterContracts[${index}].metadataTrust`,
        null,
      ),
    };
  });
}

function normalizePlanningBlockersInput(items) {
  return Array.isArray(items)
    ? items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        code: typeof item.code === 'string' ? item.code.trim() : '',
        message: typeof item.message === 'string' ? item.message.trim() : '',
        details: item.details && typeof item.details === 'object' ? item.details : {},
      }))
      .filter((item) => item.code || item.message)
    : [];
}

function normalizeActionPlanInput(items) {
  return Array.isArray(items)
    ? items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        hostPath: typeof item.hostPath === 'string' ? item.hostPath.trim() : '',
        hostUse: typeof item.hostUse === 'string' ? item.hostUse.trim() : '',
        scope: typeof item.scope === 'string' ? item.scope.trim() : '',
        kind: typeof item.kind === 'string' ? item.kind.trim() : '',
        label: typeof item.label === 'string' ? item.label.trim() : '',
        popupDepth: Number.isFinite(item.popupDepth) ? item.popupDepth : 0,
        popupBlockKinds: sortUniqueStrings(item.popupBlockKinds),
      }))
    : [];
}

function normalizePlannedCoverageInput(input) {
  const plannedCoverageInput = input && typeof input === 'object' ? input : {};
  return {
    blocks: sortUniqueStrings(plannedCoverageInput.blocks),
    patterns: sortUniqueStrings(plannedCoverageInput.patterns),
  };
}

function normalizeCreativeProgram(input) {
  const creativeProgramInput = input && typeof input === 'object' ? input : {};
  return {
    id: typeof creativeProgramInput.id === 'string' ? creativeProgramInput.id.trim() : '',
    strategy: typeof creativeProgramInput.strategy === 'string' ? creativeProgramInput.strategy.trim() : '',
    prompt: typeof creativeProgramInput.prompt === 'string' ? creativeProgramInput.prompt.trim() : '',
    selectionPolicy: typeof creativeProgramInput.selectionPolicy === 'string'
      ? creativeProgramInput.selectionPolicy.trim()
      : '',
    constraints: uniqueStrings(creativeProgramInput.constraints),
    heuristics: uniqueStrings(creativeProgramInput.heuristics),
    requiredPatterns: uniqueStrings(creativeProgramInput.requiredPatterns),
    optionalPatterns: uniqueStrings(creativeProgramInput.optionalPatterns),
    notes: uniqueStrings(creativeProgramInput.notes),
  };
}

function normalizeLayoutShape(layoutInput, label = 'layout') {
  const normalizedLayoutInput = layoutInput && typeof layoutInput === 'object' ? layoutInput : {};
  return {
    pageUse: normalizePageUse(normalizedLayoutInput.pageUse, `${label}.pageUse`, {
      fallbackValue: 'RootPageModel',
    }),
    blocks: normalizeBlocks(normalizedLayoutInput.blocks, `${label}.blocks`),
    tabs: normalizeTabs(normalizedLayoutInput.tabs, `${label}.tabs`),
  };
}

function normalizeLayoutCandidate(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`scenario.layoutCandidates[${index}] must be an object`);
  }
  const candidateId = typeof entry.candidateId === 'string' && entry.candidateId.trim()
    ? entry.candidateId.trim()
    : `candidate-${index + 1}`;
  return {
    candidateId,
    title: typeof entry.title === 'string' ? entry.title.trim() : '',
    summary: typeof entry.summary === 'string' ? entry.summary.trim() : '',
    score: Number.isFinite(entry.score) ? entry.score : null,
    selected: entry.selected === true,
    selectionMode: typeof entry.selectionMode === 'string' ? entry.selectionMode.trim() : '',
    primaryBlockType: typeof entry.primaryBlockType === 'string' ? entry.primaryBlockType.trim() : '',
    targetCollections: sortUniqueStrings(entry.targetCollections),
    requestedFields: sortUniqueStrings(entry.requestedFields),
    resolvedFields: sortUniqueStrings(entry.resolvedFields),
    selectionRationale: uniqueStrings(entry.selectionRationale),
    planningStatus: typeof entry.planningStatus === 'string' ? entry.planningStatus.trim() : '',
    planningBlockers: normalizePlanningBlockersInput(entry.planningBlockers),
    actionPlan: normalizeActionPlanInput(entry.actionPlan),
    plannedCoverage: normalizePlannedCoverageInput(entry.plannedCoverage),
    layout: normalizeLayoutShape(entry.layout, `scenario.layoutCandidates[${index}].layout`),
  };
}

function normalizeScenario(input) {
  const scenarioInput = input && typeof input === 'object' ? input : {};
  const randomPolicyInput = scenarioInput.randomPolicy && typeof scenarioInput.randomPolicy === 'object'
    ? scenarioInput.randomPolicy
    : {};
  const sourceInventoryInput = scenarioInput.sourceInventory && typeof scenarioInput.sourceInventory === 'object'
    ? scenarioInput.sourceInventory
    : {};
  const instanceInventoryInput = scenarioInput.instanceInventory && typeof scenarioInput.instanceInventory === 'object'
    ? scenarioInput.instanceInventory
    : {};
  const instanceFlowSchemaInput = instanceInventoryInput.flowSchema && typeof instanceInventoryInput.flowSchema === 'object'
    ? instanceInventoryInput.flowSchema
    : {};
  const instanceCollectionsInput = instanceInventoryInput.collections && typeof instanceInventoryInput.collections === 'object'
    ? instanceInventoryInput.collections
    : {};
  const planningBlockers = normalizePlanningBlockersInput(scenarioInput.planningBlockers);
  const actionPlan = normalizeActionPlanInput(scenarioInput.actionPlan);
  const layoutCandidates = Array.isArray(scenarioInput.layoutCandidates)
    ? scenarioInput.layoutCandidates.map((item, index) => normalizeLayoutCandidate(item, index))
    : [];
  const selectedCandidateId = typeof scenarioInput.selectedCandidateId === 'string' && scenarioInput.selectedCandidateId.trim()
    ? scenarioInput.selectedCandidateId.trim()
    : (layoutCandidates.find((item) => item.selected)?.candidateId || layoutCandidates[0]?.candidateId || '');

  return {
    id: typeof scenarioInput.id === 'string' ? scenarioInput.id.trim() : '',
    title: typeof scenarioInput.title === 'string' ? scenarioInput.title.trim() : '',
    summary: typeof scenarioInput.summary === 'string' ? scenarioInput.summary.trim() : '',
    domainId: typeof scenarioInput.domainId === 'string' ? scenarioInput.domainId.trim() : '',
    domainLabel: typeof scenarioInput.domainLabel === 'string' ? scenarioInput.domainLabel.trim() : '',
    archetypeId: typeof scenarioInput.archetypeId === 'string' ? scenarioInput.archetypeId.trim() : '',
    archetypeLabel: typeof scenarioInput.archetypeLabel === 'string' ? scenarioInput.archetypeLabel.trim() : '',
    tier: typeof scenarioInput.tier === 'string' ? scenarioInput.tier.trim() : '',
    expectedOutcome: typeof scenarioInput.expectedOutcome === 'string' ? scenarioInput.expectedOutcome.trim() : '',
    selectionMode: typeof scenarioInput.selectionMode === 'string' ? scenarioInput.selectionMode.trim() : '',
    plannerVersion: typeof scenarioInput.plannerVersion === 'string' ? scenarioInput.plannerVersion.trim() : '',
    primaryBlockType: typeof scenarioInput.primaryBlockType === 'string' ? scenarioInput.primaryBlockType.trim() : '',
    planningStatus: typeof scenarioInput.planningStatus === 'string' ? scenarioInput.planningStatus.trim() : '',
    maxNestingDepth: Number.isFinite(scenarioInput.maxNestingDepth) ? scenarioInput.maxNestingDepth : 0,
    requestedSignals: uniqueStrings(scenarioInput.requestedSignals),
    selectionRationale: uniqueStrings(scenarioInput.selectionRationale),
    availableUses: sortUniqueStrings(scenarioInput.availableUses),
    targetCollections: sortUniqueStrings(scenarioInput.targetCollections),
    requestedFields: sortUniqueStrings(scenarioInput.requestedFields),
    resolvedFields: sortUniqueStrings(scenarioInput.resolvedFields),
    actionPlan,
    planningBlockers,
    plannedCoverage: normalizePlannedCoverageInput(scenarioInput.plannedCoverage),
    creativeProgram: normalizeCreativeProgram(scenarioInput.creativeProgram),
    layoutCandidates,
    selectedCandidateId,
    sourceInventory: {
      detected: Boolean(sourceInventoryInput.detected),
      repoRoot: typeof sourceInventoryInput.repoRoot === 'string' ? sourceInventoryInput.repoRoot.trim() : '',
      publicModels: sortUniqueStrings(sourceInventoryInput.publicModels),
      publicTreeRoots: sortUniqueStrings(sourceInventoryInput.publicTreeRoots),
      expectedDescendantModels: sortUniqueStrings(sourceInventoryInput.expectedDescendantModels),
      evidenceFiles: sortUniqueStrings(sourceInventoryInput.evidenceFiles),
      publicUseCatalog: Array.isArray(sourceInventoryInput.publicUseCatalog)
        ? sourceInventoryInput.publicUseCatalog
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            use: typeof item.use === 'string' ? item.use.trim() : '',
            title: typeof item.title === 'string' ? item.title.trim() : '',
            filePath: typeof item.filePath === 'string' ? item.filePath.trim() : '',
            hintKinds: sortUniqueStrings(item.hintKinds),
            hintPaths: sortUniqueStrings(item.hintPaths),
            hintMessages: sortUniqueStrings(item.hintMessages),
            contextRequirements: sortUniqueStrings(item.contextRequirements),
            unresolvedReasons: sortUniqueStrings(item.unresolvedReasons),
            semanticTags: sortUniqueStrings(item.semanticTags),
          }))
          .filter((item) => item.use)
        : [],
    },
    instanceInventory: {
      detected: Boolean(instanceInventoryInput.detected),
      apiBase: typeof instanceInventoryInput.apiBase === 'string' ? instanceInventoryInput.apiBase.trim() : '',
      adminBase: typeof instanceInventoryInput.adminBase === 'string' ? instanceInventoryInput.adminBase.trim() : '',
      appVersion: typeof instanceInventoryInput.appVersion === 'string' ? instanceInventoryInput.appVersion.trim() : '',
      enabledPlugins: sortUniqueStrings(instanceInventoryInput.enabledPlugins),
      enabledPluginsDetected: Boolean(instanceInventoryInput.enabledPluginsDetected),
      instanceFingerprint: typeof instanceInventoryInput.instanceFingerprint === 'string'
        ? instanceInventoryInput.instanceFingerprint.trim()
        : '',
      flowSchema: {
        detected: Boolean(instanceFlowSchemaInput.detected),
        rootPublicUses: sortUniqueStrings(instanceFlowSchemaInput.rootPublicUses),
        missingUses: sortUniqueStrings(instanceFlowSchemaInput.missingUses),
        discoveryNotes: sortUniqueStrings(instanceFlowSchemaInput.discoveryNotes),
        publicUseCatalog: Array.isArray(instanceFlowSchemaInput.publicUseCatalog)
          ? instanceFlowSchemaInput.publicUseCatalog
            .filter((item) => item && typeof item === 'object')
            .map((item) => ({
              use: typeof item.use === 'string' ? item.use.trim() : '',
              title: typeof item.title === 'string' ? item.title.trim() : '',
              hintKinds: sortUniqueStrings(item.hintKinds),
              hintPaths: sortUniqueStrings(item.hintPaths),
              hintMessages: sortUniqueStrings(item.hintMessages),
              contextRequirements: sortUniqueStrings(item.contextRequirements),
              unresolvedReasons: sortUniqueStrings(item.unresolvedReasons),
              semanticTags: sortUniqueStrings(item.semanticTags),
            }))
            .filter((item) => item.use)
          : [],
      },
      collections: {
        detected: Boolean(instanceCollectionsInput.detected),
        names: sortUniqueStrings(instanceCollectionsInput.names),
        byName: Object.fromEntries(
          sortUniqueStrings(instanceCollectionsInput.names).map((name) => {
            const raw = instanceCollectionsInput.byName && typeof instanceCollectionsInput.byName === 'object'
              ? instanceCollectionsInput.byName[name]
              : {};
            return [name, {
              name,
              title: typeof raw?.title === 'string' ? raw.title.trim() : '',
              titleField: typeof raw?.titleField === 'string' ? raw.titleField.trim() : '',
              origin: typeof raw?.origin === 'string' ? raw.origin.trim() : '',
              template: typeof raw?.template === 'string' ? raw.template.trim() : '',
              tree: typeof raw?.tree === 'string' ? raw.tree.trim() : '',
              fieldNames: sortUniqueStrings(raw?.fieldNames),
              scalarFieldNames: sortUniqueStrings(raw?.scalarFieldNames),
              relationFields: sortUniqueStrings(raw?.relationFields),
            }];
          }),
        ),
        discoveryNotes: sortUniqueStrings(instanceCollectionsInput.discoveryNotes),
      },
      notes: sortUniqueStrings(instanceInventoryInput.notes),
      errors: sortUniqueStrings(instanceInventoryInput.errors),
      cache: instanceInventoryInput.cache && typeof instanceInventoryInput.cache === 'object'
        ? instanceInventoryInput.cache
        : {},
    },
    randomPolicy: {
      mode: typeof randomPolicyInput.mode === 'string' ? randomPolicyInput.mode.trim() : '',
      seed: typeof randomPolicyInput.seed === 'string' ? randomPolicyInput.seed.trim() : '',
      seedSource: typeof randomPolicyInput.seedSource === 'string' ? randomPolicyInput.seedSource.trim() : '',
      sessionId: typeof randomPolicyInput.sessionId === 'string' ? randomPolicyInput.sessionId.trim() : '',
      candidatePageUrl: typeof randomPolicyInput.candidatePageUrl === 'string'
        ? randomPolicyInput.candidatePageUrl.trim()
        : '',
    },
  };
}

function hasRuntimeSensitiveAction(action) {
  if (!action || typeof action !== 'object') {
    return false;
  }
  if (
    action.kind === 'view-record-popup'
    || action.kind === 'edit-record-popup'
    || action.kind === 'add-child-record-popup'
  ) {
    return true;
  }
  return Boolean(action.popup && hasRuntimeSensitiveBlocks(action.popup.blocks));
}

function hasRuntimeSensitiveBlocks(blocks) {
  return blocks.some((block) => {
    if (!block || typeof block !== 'object') {
      return false;
    }
    if (block.blocks.length > 0 && hasRuntimeSensitiveBlocks(block.blocks)) {
      return true;
    }
    if (block.popup && hasRuntimeSensitiveBlocks(block.popup.blocks)) {
      return true;
    }
    return block.actions.some((action) => hasRuntimeSensitiveAction(action))
      || block.rowActions.some((action) => hasRuntimeSensitiveAction(action));
  });
}

function collectRequiredActionsFromBlocks(blocks, scope, actions) {
  for (const block of blocks) {
    const collectionName = block.collectionName;
    if (collectionName) {
      for (const action of block.actions) {
        actions.push({
          kind: action.kind,
          collectionName,
          scope,
        });
      }
      if (block.kind === 'Table') {
        for (const action of block.rowActions) {
          actions.push({
            kind: action.kind,
            collectionName,
            scope: 'row-actions',
          });
        }
      }
    }
    if (block.blocks.length > 0) {
      collectRequiredActionsFromBlocks(
        block.blocks,
        block.kind === 'Details' ? 'details-actions' : scope,
        actions,
      );
    }
  }
}

function deriveRequiredActions(layout) {
  const actions = [];
  collectRequiredActionsFromBlocks(layout.blocks, 'block-actions', actions);
  for (const tab of layout.tabs) {
    collectRequiredActionsFromBlocks(tab.blocks, 'block-actions', actions);
  }
  return dedupeRequiredActions(actions);
}

function collectBlockUsesFromBlocks(blocks) {
  const uses = [];
  const visit = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      uses.push(resolveBlockUse(item));
      if (Array.isArray(item.blocks) && item.blocks.length > 0) {
        visit(item.blocks);
      }
      if (item.popup?.blocks && Array.isArray(item.popup.blocks) && item.popup.blocks.length > 0) {
        visit(item.popup.blocks);
      }
    }
  };
  visit(blocks);
  return sortUniqueStrings(uses);
}

function buildTabBlockUseMap(layout) {
  const map = new Map();
  for (const tab of Array.isArray(layout?.tabs) ? layout.tabs : []) {
    if (!tab?.title) {
      continue;
    }
    map.set(tab.title, collectBlockUsesFromBlocks(tab.blocks));
  }
  return map;
}

function deriveRequiredTabs(layout, explicit) {
  const tabBlockUseMap = buildTabBlockUseMap(layout);
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`requirements.requiredTabs[${index}] must be an object`);
      }
      const titles = sortUniqueStrings(entry.titles);
      if (titles.length === 0) {
        throw new Error(`requirements.requiredTabs[${index}].titles must not be empty`);
      }
      return {
        pageSignature: typeof entry.pageSignature === 'string' && entry.pageSignature.trim() ? entry.pageSignature.trim() : null,
        titles,
        pageUse: normalizePageUse(entry.pageUse, `requirements.requiredTabs[${index}].pageUse`, {
          allowNull: true,
        }),
        requireBlockGrid: entry.requireBlockGrid !== false,
        requiredBlockUses: Array.isArray(entry.requiredBlockUses) && entry.requiredBlockUses.length > 0
          ? sortUniqueStrings(entry.requiredBlockUses)
          : sortUniqueStrings(titles.flatMap((title) => tabBlockUseMap.get(title) || [])),
      };
    });
  }
  if (layout.tabs.length === 0) {
    return [];
  }
  return [
    {
      pageSignature: '$',
      titles: layout.tabs.map((tab) => tab.title),
      pageUse: layout.pageUse,
      requireBlockGrid: true,
      requiredBlockUses: sortUniqueStrings(layout.tabs.flatMap((tab) => tabBlockUseMap.get(tab.title) || [])),
    },
  ];
}

function normalizeRequiredFilters(explicit) {
  if (!Array.isArray(explicit) || explicit.length === 0) {
    return [];
  }
  return explicit.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`requirements.requiredFilters[${index}] must be an object`);
    }
    return {
      path: entry.path == null ? null : normalizeNonEmpty(entry.path, `requirements.requiredFilters[${index}].path`),
      pageSignature: entry.pageSignature == null
        ? null
        : normalizeNonEmpty(entry.pageSignature, `requirements.requiredFilters[${index}].pageSignature`),
      pageUse: normalizePageUse(entry.pageUse, `requirements.requiredFilters[${index}].pageUse`, {
        allowNull: true,
      }),
      tabTitle: typeof entry.tabTitle === 'string' && entry.tabTitle.trim()
        ? entry.tabTitle.trim()
        : '',
      collectionName: typeof entry.collectionName === 'string' && entry.collectionName.trim()
        ? entry.collectionName.trim()
        : '',
      fields: sortUniqueStrings(entry.fields),
      targetUses: sortUniqueStrings(entry.targetUses),
    };
  });
}

export function normalizeBuildSpec(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('build spec input must be an object');
  }

  const source = normalizeSource(input.source, typeof input.request === 'string' ? input.request.trim() : '');
  const targetInput = input.target && typeof input.target === 'object' ? input.target : {};
  const layoutInput = input.layout && typeof input.layout === 'object' ? input.layout : {};
  const requirementsInput = input.requirements && typeof input.requirements === 'object' ? input.requirements : {};
  const optionsInput = input.options && typeof input.options === 'object' ? input.options : {};
  const metadataTrustInput = typeof requirementsInput.metadataTrust === 'string'
    ? requirementsInput.metadataTrust
    : (requirementsInput.metadataTrust && typeof requirementsInput.metadataTrust === 'object'
      ? requirementsInput.metadataTrust
      : null);

  const layout = normalizeLayoutShape(layoutInput, 'layout');

  const scenario = normalizeScenario(input.scenario);

  return {
    version: BUILD_SPEC_VERSION,
    source,
    target: {
      title: typeof targetInput.title === 'string' && targetInput.title.trim() ? targetInput.title.trim() : '',
      buildPolicy: typeof targetInput.buildPolicy === 'string' && targetInput.buildPolicy.trim()
        ? targetInput.buildPolicy.trim()
        : 'fresh',
      schemaUidCandidate: typeof targetInput.schemaUidCandidate === 'string' ? targetInput.schemaUidCandidate.trim() : '',
      routeSegmentCandidate: typeof targetInput.routeSegmentCandidate === 'string' ? targetInput.routeSegmentCandidate.trim() : '',
      candidatePageUrl: typeof targetInput.candidatePageUrl === 'string' ? targetInput.candidatePageUrl.trim() : '',
      pageUse: layout.pageUse,
    },
    layout,
    dataBindings: {
      collections: sortUniqueStrings(input.dataBindings?.collections),
      relations: Array.isArray(input.dataBindings?.relations) ? input.dataBindings.relations : [],
    },
    requirements: {
      requiredTabs: deriveRequiredTabs(layout, requirementsInput.requiredTabs),
      requiredActions: Array.isArray(requirementsInput.requiredActions) && requirementsInput.requiredActions.length > 0
        ? normalizeRequiredActions(requirementsInput.requiredActions)
        : deriveRequiredActions(layout),
      requiredFilters: normalizeRequiredFilters(requirementsInput.requiredFilters),
      expectedFilterContracts: normalizeExpectedFilterContracts(requirementsInput.expectedFilterContracts),
      allowedBusinessBlockUses: sortUniqueStrings(requirementsInput.allowedBusinessBlockUses),
      metadataTrust: {
        runtimeSensitive: normalizeMetadataTrustLevel(
          typeof metadataTrustInput === 'string' ? metadataTrustInput : metadataTrustInput?.runtimeSensitive,
          'requirements.metadataTrust.runtimeSensitive',
          null,
        ),
      },
    },
    options: {
      compileMode: typeof optionsInput.compileMode === 'string' && optionsInput.compileMode.trim()
        ? optionsInput.compileMode.trim()
        : DEFAULT_BUILD_COMPILE_MODE,
      allowLegacyFallback: Boolean(optionsInput.allowLegacyFallback),
    },
    scenario,
  };
}

function normalizeAssertion(assertion, index, label) {
  if (!assertion || typeof assertion !== 'object') {
    throw new Error(`${label}[${index}] must be an object`);
  }
  return {
    kind: normalizeNonEmpty(assertion.kind, `${label}[${index}].kind`),
    label: typeof assertion.label === 'string' && assertion.label.trim() ? assertion.label.trim() : '',
    severity: typeof assertion.severity === 'string' && assertion.severity.trim() ? assertion.severity.trim() : 'blocking',
    values: Array.isArray(assertion.values) ? assertion.values : [],
    value: typeof assertion.value === 'string' ? assertion.value.trim() : '',
  };
}

export function normalizeVerifySpec(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('verify spec input must be an object');
  }

  const source = normalizeSource(input.source, typeof input.request === 'string' ? input.request.trim() : '');
  const entryInput = input.entry && typeof input.entry === 'object' ? input.entry : {};
  const preOpenInput = input.preOpen && typeof input.preOpen === 'object' ? input.preOpen : {};
  const evidencePolicyInput = input.evidencePolicy && typeof input.evidencePolicy === 'object' ? input.evidencePolicy : {};
  const gatePolicyInput = input.gatePolicy && typeof input.gatePolicy === 'object' ? input.gatePolicy : {};

  return {
    version: VERIFY_SPEC_VERSION,
    source,
    entry: {
      pageUrl: typeof entryInput.pageUrl === 'string' ? entryInput.pageUrl.trim() : '',
      candidatePageUrl: typeof entryInput.candidatePageUrl === 'string' ? entryInput.candidatePageUrl.trim() : '',
      requiresAuth: entryInput.requiresAuth !== false,
    },
    preOpen: {
      assertions: Array.isArray(preOpenInput.assertions)
        ? preOpenInput.assertions.map((item, index) => normalizeAssertion(item, index, 'preOpen.assertions'))
        : [],
    },
    stages: Array.isArray(input.stages)
      ? input.stages.map((stage, index) => {
        if (!stage || typeof stage !== 'object') {
          throw new Error(`stages[${index}] must be an object`);
        }
        return {
          id: typeof stage.id === 'string' && stage.id.trim() ? stage.id.trim() : `stage-${index + 1}`,
          title: typeof stage.title === 'string' && stage.title.trim() ? stage.title.trim() : `Stage ${index + 1}`,
          mandatory: stage.mandatory !== false,
          trigger: stage.trigger && typeof stage.trigger === 'object' ? stage.trigger : null,
          waitFor: stage.waitFor && typeof stage.waitFor === 'object' ? stage.waitFor : null,
          assertions: Array.isArray(stage.assertions)
            ? stage.assertions.map((item, assertionIndex) => normalizeAssertion(item, assertionIndex, `stages[${index}].assertions`))
            : [],
        };
      })
      : [],
    evidencePolicy: {
      requireScreenshot: evidencePolicyInput.requireScreenshot !== false,
      requireSummary: evidencePolicyInput.requireSummary !== false,
      requireTables: evidencePolicyInput.requireTables !== false,
    },
    gatePolicy: {
      stopOnBuildGateFailure: gatePolicyInput.stopOnBuildGateFailure !== false,
      stopOnPreOpenBlocker: gatePolicyInput.stopOnPreOpenBlocker !== false,
      stopOnStageFailure: gatePolicyInput.stopOnStageFailure !== false,
    },
  };
}

function resolveBlockUse(block) {
  if (block.use) {
    return block.use;
  }
  if (block.kind === 'Form') {
    return getFormUseForMode(block.mode);
  }
  return BLOCK_USE_BY_KIND[block.kind] || block.kind;
}

function collectRequiredUsesFromAction(action, requiredUses) {
  requiredUses.add(action.use || 'ActionModel');
  if (action.popup) {
    requiredUses.add(action.popup.pageUse);
    requiredUses.add('BlockGridModel');
  }
}

function buildGeneratedCoverageFromTree(tree) {
  const blockUses = new Set();
  const patterns = new Set();

  const visitPopup = (popup) => {
    if (!popup || typeof popup !== 'object') {
      return;
    }
    patterns.add('popup-openview');
    compileBlockList(popup.blocks);
  };

  const visitBlock = (block) => {
    if (!block || typeof block !== 'object') {
      return;
    }
    if (block.use) {
      blockUses.add(block.use);
    }
    if (block.relationScope) {
      patterns.add('relation-context');
    }
    if (block.treeTable) {
      patterns.add('tree-table');
    }
    for (const action of Array.isArray(block.actions) ? block.actions : []) {
      if (action.kind === 'record-action') {
        patterns.add('record-actions');
      }
      if (action.popup) {
        visitPopup(action.popup);
      }
    }
    for (const action of Array.isArray(block.rowActions) ? block.rowActions : []) {
      if (action.kind === 'record-action' || action.kind === 'add-child-record-popup') {
        patterns.add('record-actions');
      }
      if (action.popup) {
        visitPopup(action.popup);
      }
    }
    compileBlockList(block.blocks);
  };

  const compileBlockList = (blocks) => {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      visitBlock(block);
    }
  };

  compileBlockList(tree.blocks);
  if (Array.isArray(tree.tabs) && tree.tabs.length > 0) {
    blockUses.add('RootPageTabModel');
    patterns.add('workspace-tabs');
    for (const tab of tree.tabs) {
      compileBlockList(tab.blocks);
    }
  }

  return {
    blocks: sortUniqueStrings([...blockUses]),
    patterns: sortUniqueStrings([...patterns]),
  };
}

function buildCoverageStatusEntries(generatedCoverage) {
  return [
    ...generatedCoverage.blocks.map((target) => ({
      targetType: 'block',
      target,
      status: 'planned',
    })),
    ...generatedCoverage.patterns.map((target) => ({
      targetType: 'pattern',
      target,
      status: 'planned',
    })),
  ];
}

function collectRequiredUsesFromBlock(block, requiredUses) {
  requiredUses.add(resolveBlockUse(block));
  if (block.kind === 'PublicUse') {
    return;
  }
  if (block.kind === 'Filter') {
    requiredUses.add('FilterFormGridModel');
    requiredUses.add('FilterFormItemModel');
    requiredUses.add('FilterFormSubmitActionModel');
    requiredUses.add('FilterFormResetActionModel');
  }
  if (block.kind === 'Table') {
    requiredUses.add('TableColumnModel');
    if (block.rowActions.length > 0) {
      requiredUses.add('TableActionsColumnModel');
    }
  }
  if (block.kind === 'Details') {
    requiredUses.add('DetailsGridModel');
  }
  if (block.kind === 'Form') {
    requiredUses.add('FormGridModel');
    requiredUses.add('FormItemModel');
    requiredUses.add('FormSubmitActionModel');
  }
  for (const action of block.actions) {
    collectRequiredUsesFromAction(action, requiredUses);
  }
  for (const action of block.rowActions) {
    collectRequiredUsesFromAction(action, requiredUses);
  }
  for (const childBlock of block.blocks) {
    collectRequiredUsesFromBlock(childBlock, requiredUses);
  }
  if (block.popup) {
    requiredUses.add(block.popup.pageUse);
    requiredUses.add('BlockGridModel');
  }
}

function maybeAddVerifyHintForAction(action, hintScope, verifyHints, stageIdPrefix) {
  if (!action.label) {
    return;
  }
  const triggerKind = hintScope === 'row-actions'
    ? 'click-row-action'
    : 'click-action';
  verifyHints.push({
    stageId: `${stageIdPrefix}-${hintScope}-${action.kind}-${verifyHints.length + 1}`,
    title: action.label,
    action: {
      kind: triggerKind,
      text: action.label,
    },
  });
}

function buildDataScopeContract(block) {
  if (block.relationScope) {
    return {
      mode: 'relation-derived',
      relationScope: block.relationScope,
    };
  }
  return {
    mode: 'empty',
    relationScope: null,
  };
}

function buildSelectorContract() {
  return {
    kind: 'any',
  };
}

function buildExpectedFilterContract(block, compiledBlock, selectorContract, dataScopeContract) {
  return {
    path: compiledBlock.path,
    use: compiledBlock.use,
    collectionName: compiledBlock.collectionName || null,
    selectorKind: selectorContract.kind,
    dataScopeMode: dataScopeContract.mode,
    allowNonEmptyDataScope: dataScopeContract.mode !== 'empty',
    metadataTrust: null,
  };
}

function deriveFilterTargetUses(blocks, currentIndex, collectionName) {
  const directTargets = (Array.isArray(blocks) ? blocks : [])
    .filter((candidate, candidateIndex) => candidateIndex !== currentIndex)
    .filter((candidate) => candidate && typeof candidate === 'object' && candidate.kind !== 'Filter')
    .filter((candidate) => !collectionName || !candidate.collectionName || candidate.collectionName === collectionName)
    .map((candidate) => resolveBlockUse(candidate));
  return sortUniqueStrings(directTargets);
}

function buildRequiredFilterDescriptor(block, compiledBlock, context, targetUses) {
  return {
    path: compiledBlock.path,
    pageSignature: context.pageSignature || '$',
    pageUse: context.pageUse || null,
    tabTitle: context.tabTitle || '',
    collectionName: block.collectionName || null,
    fields: [...compiledBlock.fields],
    targetUses: sortUniqueStrings(targetUses),
  };
}

function buildRequiredFilterBinding(block, compiledBlock, context, targetUses) {
  return {
    pageSignature: context.pageSignature || '$',
    pageUse: context.pageUse || null,
    tabTitle: context.tabTitle || '',
    filterPath: compiledBlock.path,
    filterUse: compiledBlock.use,
    collectionName: block.collectionName || null,
    filterFields: [...compiledBlock.fields],
    targetUses: sortUniqueStrings(targetUses),
  };
}

function compilePopup(popup, scope, artifact, context) {
  if (!popup) {
    return null;
  }
  const popupContext = {
    pageSignature: `${scope}.popup`,
    pageUse: popup.pageUse,
    tabTitle: context?.tabTitle || '',
  };
  return {
    title: popup.title,
    pageUse: popup.pageUse,
    blocks: compileBlocks(popup.blocks, `${scope}.popup`, artifact, popupContext),
  };
}

function compileActions(actions, scope, artifact, actionScope, context) {
  return actions.map((action, index) => {
    maybeAddVerifyHintForAction(action, actionScope, artifact.verifyHints, scope.replaceAll('.', '-'));
    return {
      ...action,
      scope: actionScope,
      path: `${scope}.${actionScope}[${index}]`,
      popup: action.popup
        ? compilePopup(action.popup, `${scope}.${actionScope}[${index}]`, artifact, context)
        : null,
    };
  });
}

function compileBlocks(blocks, scope, artifact, context) {
  return blocks.map((block, index) => {
    collectRequiredUsesFromBlock(block, artifact.requiredUses);
    if (block.kind === 'Filter') {
      artifact.readbackContract.requireFilterManager = true;
      artifact.readbackContract.requiredFilterManagerEntryCount += block.fields.length;
    }
    if (block.collectionName) {
      artifact.requiredMetadataRefs.collections.add(block.collectionName);
    }
    for (const field of block.fields) {
      if (block.collectionName) {
        artifact.requiredMetadataRefs.fields.add(`${block.collectionName}.${field}`);
      }
    }
    if (block.relationScope) {
      artifact.requiredMetadataRefs.relations.push({
        sourceCollection: block.relationScope.sourceCollection,
        targetCollection: block.relationScope.targetCollection,
        associationName: block.relationScope.associationName,
      });
    }
    const dataScopeContract = buildDataScopeContract(block);
    const selectorContract = buildSelectorContract(block);
    const compiledBlock = {
      path: `${scope}.blocks[${index}]`,
      kind: block.kind,
      use: resolveBlockUse(block),
      title: block.title,
      collectionName: block.collectionName,
      fields: block.fields,
      actions: compileActions(
        block.actions,
        `${scope}.blocks[${index}]`,
        artifact,
        block.kind === 'Details' ? 'details-actions' : 'block-actions',
        context,
      ),
      rowActions: compileActions(
        block.rowActions,
        `${scope}.blocks[${index}]`,
        artifact,
        'row-actions',
        context,
      ),
      blocks: compileBlocks(block.blocks, `${scope}.blocks[${index}]`, artifact, context),
      popup: compilePopup(block.popup, `${scope}.blocks[${index}]`, artifact, context),
      relationScope: block.relationScope,
      explicitUse: block.use,
      mode: block.mode,
      targetCollectionName: block.targetCollectionName,
      targetBlock: block.targetBlock,
      treeTable: block.treeTable,
      selectorContract,
      dataScopeContract,
    };
    artifact.guardRequirements.expectedFilterContracts.push(
      buildExpectedFilterContract(block, compiledBlock, selectorContract, dataScopeContract),
    );
    if (block.kind === 'Filter') {
      const targetUses = deriveFilterTargetUses(blocks, index, block.collectionName);
      artifact.guardRequirements.requiredFilters.push(
        buildRequiredFilterDescriptor(block, compiledBlock, context, targetUses),
      );
      artifact.readbackContract.requiredFilterBindings.push(
        buildRequiredFilterBinding(block, compiledBlock, context, targetUses),
      );
    }
    return compiledBlock;
  });
}

function createArtifactState(buildSpec, scenarioLike, runtimeSensitiveMetadataTrust, requirements) {
  return {
    compileMode: buildSpec.options.allowLegacyFallback ? 'primitive-tree' : DEFAULT_BUILD_COMPILE_MODE,
    payloadFragment: null,
    requiredUses: new Set([requirements.layoutPageUse]),
    requiredMetadataRefs: {
      collections: new Set(buildSpec.dataBindings.collections),
      fields: new Set(),
      relations: [],
    },
    guardRequirements: {
      ...requirements,
      requiredFilters: [...requirements.requiredFilters],
      expectedFilterContracts: [...requirements.expectedFilterContracts],
      metadataTrust: {
        runtimeSensitive: runtimeSensitiveMetadataTrust,
      },
    },
    scenario: scenarioLike,
    tier: scenarioLike.tier,
    expectedOutcome: scenarioLike.expectedOutcome,
    selectionMode: scenarioLike.selectionMode,
    plannerVersion: scenarioLike.plannerVersion,
    primaryBlockType: scenarioLike.primaryBlockType,
    planningStatus: scenarioLike.planningStatus,
    planningBlockers: scenarioLike.planningBlockers,
    maxNestingDepth: scenarioLike.maxNestingDepth,
    coverage: {
      blocks: scenarioLike.plannedCoverage.blocks,
      patterns: scenarioLike.plannedCoverage.patterns,
    },
    actionPlan: scenarioLike.actionPlan,
    readbackContract: {
      requiredTabs: requirements.requiredTabs.map((item) => ({
        pageSignature: item.pageSignature ?? null,
        pageUse: item.pageUse ?? null,
        titles: [...item.titles],
        requireBlockGrid: item.requireBlockGrid !== false,
        requiredBlockUses: sortUniqueStrings(item.requiredBlockUses),
      })),
      requiredVisibleTabs: requirements.requiredTabs.flatMap((item) => item.titles),
      requiredTabCount: requirements.requiredTabs.reduce((count, item) => count + item.titles.length, 0),
      requiredTopLevelUses: [],
      requireFilterManager: false,
      requiredFilterManagerEntryCount: 0,
      requiredFilterBindings: [],
    },
    verifyHints: [],
    coverageStatus: [],
    issues: [],
    primitiveTree: null,
  };
}

function compileLayoutVariant({
  buildSpec,
  layout,
  targetTitle,
  scenarioLike,
  runtimeSensitiveMetadataTrust,
  requirements,
}) {
  const defaultTabUse = getDefaultTabUseForPage(layout.pageUse);
  const artifact = createArtifactState(buildSpec, scenarioLike, runtimeSensitiveMetadataTrust, {
    ...requirements,
    layoutPageUse: layout.pageUse,
  });

  const tree = {
    path: '$.page',
    kind: 'Page',
    use: layout.pageUse,
    title: targetTitle,
    blocks: compileBlocks(layout.blocks, '$.page', artifact, {
      pageSignature: '$',
      pageUse: layout.pageUse,
      tabTitle: '',
    }),
    tabs: layout.tabs.map((tab, index) => {
      artifact.requiredUses.add(defaultTabUse);
      artifact.requiredUses.add('BlockGridModel');
      artifact.verifyHints.push({
        stageId: `tab-${index + 1}`,
        title: tab.title,
        action: {
          kind: 'click-tab',
          text: tab.title,
        },
      });
      return {
        path: `$.page.tabs[${index}]`,
        kind: 'Tabs',
        use: defaultTabUse,
        title: tab.title,
        blocks: compileBlocks(tab.blocks, `$.page.tabs[${index}]`, artifact, {
          pageSignature: `$.page.tabs[${index}]`,
          pageUse: defaultTabUse,
          tabTitle: tab.title,
        }),
      };
    }),
  };

  artifact.readbackContract.requiredTopLevelUses = sortUniqueStrings([
    ...tree.blocks.map((item) => item.use),
    ...(tree.tabs.length > 0 ? [defaultTabUse] : []),
  ]);
  const generatedCoverage = buildGeneratedCoverageFromTree(tree);
  artifact.payloadFragment = tree;
  artifact.primitiveTree = tree;
  artifact.generatedCoverage = generatedCoverage;
  artifact.coverageStatus = buildCoverageStatusEntries(generatedCoverage);
  if (artifact.coverage.blocks.length === 0 && artifact.coverage.patterns.length === 0) {
    artifact.coverage = generatedCoverage;
  }

  return artifact;
}

function buildCompileArtifactPayload(artifact, buildSpec, extras = {}) {
  return {
    compileMode: artifact.compileMode,
    payloadFragment: artifact.payloadFragment,
    primitiveTree: artifact.primitiveTree,
    scenarioId: artifact.scenario.id,
    scenarioTitle: artifact.scenario.title,
    scenarioSummary: artifact.scenario.summary,
    domainId: artifact.scenario.domainId,
    domainLabel: artifact.scenario.domainLabel,
    archetypeId: artifact.scenario.archetypeId,
    archetypeLabel: artifact.scenario.archetypeLabel,
    selectionMode: artifact.selectionMode,
    plannerVersion: artifact.plannerVersion,
    primaryBlockType: artifact.primaryBlockType,
    targetCollections: artifact.scenario.targetCollections,
    requestedFields: artifact.scenario.requestedFields,
    resolvedFields: artifact.scenario.resolvedFields,
    planningStatus: artifact.planningStatus,
    planningBlockers: artifact.planningBlockers,
    maxNestingDepth: artifact.maxNestingDepth,
    actionPlan: artifact.actionPlan,
    selectionRationale: artifact.scenario.selectionRationale,
    creativeProgram: artifact.scenario.creativeProgram,
    layoutCandidates: artifact.scenario.layoutCandidates,
    selectedCandidateId: artifact.scenario.selectedCandidateId,
    sourceInventory: artifact.scenario.sourceInventory,
    instanceInventory: artifact.scenario.instanceInventory,
    availableUses: artifact.scenario.availableUses,
    selectedUses: artifact.generatedCoverage.blocks,
    generatedCoverage: artifact.generatedCoverage,
    randomPolicy: artifact.scenario.randomPolicy,
    requiredUses: sortUniqueStrings([...artifact.requiredUses]),
    requiredMetadataRefs: {
      collections: sortUniqueStrings([...artifact.requiredMetadataRefs.collections]),
      fields: sortUniqueStrings([...artifact.requiredMetadataRefs.fields]),
      relations: artifact.requiredMetadataRefs.relations,
    },
    guardRequirements: artifact.guardRequirements,
    tier: artifact.tier,
    expectedOutcome: artifact.expectedOutcome,
    coverage: artifact.coverage,
    readbackContract: artifact.readbackContract,
    verifyHints: artifact.verifyHints,
    coverageStatus: artifact.coverageStatus,
    issues: artifact.issues,
    ...extras,
  };
}

export function compileBuildSpec(input) {
  const buildSpec = normalizeBuildSpec(input);
  const runtimeSensitiveMetadataTrust = buildSpec.requirements.metadataTrust.runtimeSensitive
    || (hasRuntimeSensitiveBlocks(buildSpec.layout.blocks)
      || buildSpec.layout.tabs.some((tab) => hasRuntimeSensitiveBlocks(tab.blocks))
      ? 'unknown'
      : 'not-required');
  const artifact = compileLayoutVariant({
    buildSpec,
    layout: buildSpec.layout,
    targetTitle: buildSpec.target.title,
    scenarioLike: buildSpec.scenario,
    runtimeSensitiveMetadataTrust,
    requirements: buildSpec.requirements,
  });

  const selectedCandidateId = buildSpec.scenario.selectedCandidateId || 'selected-primary';
  const candidateBuildMap = new Map();
  const primaryCandidateBuild = {
    candidateId: selectedCandidateId,
    title: buildSpec.scenario.title || buildSpec.target.title,
    summary: buildSpec.scenario.summary,
    score: null,
    selected: true,
    layout: buildSpec.layout,
    compileArtifact: buildCompileArtifactPayload(artifact, buildSpec, {
      candidateId: selectedCandidateId,
    }),
  };
  candidateBuildMap.set(primaryCandidateBuild.candidateId, primaryCandidateBuild);

  for (const candidate of buildSpec.scenario.layoutCandidates) {
    const candidateRequirements = {
      ...buildSpec.requirements,
      requiredTabs: deriveRequiredTabs(candidate.layout, []),
      requiredActions: deriveRequiredActions(candidate.layout),
      requiredFilters: normalizeRequiredFilters(buildSpec.requirements.requiredFilters),
    };
    const candidateScenario = {
      ...buildSpec.scenario,
      title: candidate.title || buildSpec.scenario.title,
      summary: candidate.summary || buildSpec.scenario.summary,
      selectionMode: candidate.selectionMode || buildSpec.scenario.selectionMode,
      primaryBlockType: candidate.primaryBlockType || buildSpec.scenario.primaryBlockType,
      targetCollections: candidate.targetCollections.length > 0
        ? candidate.targetCollections
        : buildSpec.scenario.targetCollections,
      requestedFields: candidate.requestedFields.length > 0
        ? candidate.requestedFields
        : buildSpec.scenario.requestedFields,
      resolvedFields: candidate.resolvedFields.length > 0
        ? candidate.resolvedFields
        : buildSpec.scenario.resolvedFields,
      selectionRationale: candidate.selectionRationale.length > 0
        ? candidate.selectionRationale
        : buildSpec.scenario.selectionRationale,
      planningStatus: candidate.planningStatus || buildSpec.scenario.planningStatus,
      planningBlockers: candidate.planningBlockers.length > 0
        ? candidate.planningBlockers
        : buildSpec.scenario.planningBlockers,
      plannedCoverage: (candidate.plannedCoverage.blocks.length > 0 || candidate.plannedCoverage.patterns.length > 0)
        ? candidate.plannedCoverage
        : buildSpec.scenario.plannedCoverage,
      actionPlan: candidate.actionPlan.length > 0 ? candidate.actionPlan : buildSpec.scenario.actionPlan,
      selectedCandidateId: buildSpec.scenario.selectedCandidateId,
    };
    const candidateArtifact = compileLayoutVariant({
      buildSpec,
      layout: candidate.layout,
      targetTitle: candidate.title || buildSpec.target.title,
      scenarioLike: candidateScenario,
      runtimeSensitiveMetadataTrust,
      requirements: candidateRequirements,
    });
    candidateBuildMap.set(candidate.candidateId, {
      candidateId: candidate.candidateId,
      title: candidate.title,
      summary: candidate.summary,
      score: candidate.score,
      selected: candidate.candidateId === selectedCandidateId || candidate.selected === true,
      layout: candidate.layout,
      compileArtifact: buildCompileArtifactPayload(candidateArtifact, buildSpec, {
        candidateId: candidate.candidateId,
      }),
    });
  }

  const candidateBuilds = Array.from(candidateBuildMap.values());

  return {
    buildSpec,
    compileArtifact: buildCompileArtifactPayload(artifact, buildSpec, {
      candidateBuilds,
      selectedCandidateId,
    }),
  };
}

export async function buildValidationSpecsForRun({
  caseRequest,
  sessionId,
  baseSlug,
  candidatePageUrl,
  sessionDir,
  randomSeed = '',
  instanceInventory: instanceInventoryInput,
}) {
  const requestText = normalizeNonEmpty(caseRequest, 'case request');
  const normalizedSessionId = normalizeNonEmpty(sessionId, 'session id');

  const hasProvidedInventory = instanceInventoryInput && typeof instanceInventoryInput === 'object';
  const shouldProbeInstance = !hasProvidedInventory
    && process.env.NOCOBASE_DISABLE_INSTANCE_PROBE !== 'true'
    && (
      (typeof process.env.NOCOBASE_API_TOKEN === 'string' && process.env.NOCOBASE_API_TOKEN.trim())
      || process.env.NOCOBASE_ENABLE_INSTANCE_PROBE === 'true'
    );
  const instanceInventory = hasProvidedInventory
    ? instanceInventoryInput
    : shouldProbeInstance
      ? await probeInstanceInventory({
        candidatePageUrl,
        token: process.env.NOCOBASE_API_TOKEN || '',
      })
      : null;

  const plannedScenario = buildDynamicValidationScenario({
    caseRequest: requestText,
    sessionId: normalizedSessionId,
    baseSlug,
    candidatePageUrl,
    instanceInventory,
    randomSeed,
  });

  const allowedBusinessBlockUses = sortUniqueStrings([
    'FilterFormBlockModel',
    'TableBlockModel',
    'DetailsBlockModel',
    'CreateFormModel',
    'EditFormModel',
    ...(Array.isArray(instanceInventory?.flowSchema?.rootPublicUses) ? instanceInventory.flowSchema.rootPublicUses : []),
    ...(Array.isArray(plannedScenario?.scenario?.sourceInventory?.publicModels)
      ? plannedScenario.scenario.sourceInventory.publicModels
      : []),
    ...(Array.isArray(plannedScenario?.scenario?.sourceInventory?.publicTreeRoots)
      ? plannedScenario.scenario.sourceInventory.publicTreeRoots
      : []),
  ]);

  const buildSpec = normalizeBuildSpec({
    ...(plannedScenario.buildSpecInput || {}),
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId: normalizedSessionId,
    },
    target: {
      ...(plannedScenario.buildSpecInput?.target || {}),
      title: plannedScenario?.buildSpecInput?.target?.title || `${baseSlug || 'validation'} fresh build`,
      buildPolicy: 'fresh',
      routeSegmentCandidate: normalizedSessionId,
      candidatePageUrl,
    },
    options: {
      compileMode: DEFAULT_BUILD_COMPILE_MODE,
      allowLegacyFallback: false,
      ...(plannedScenario?.buildSpecInput?.options || {}),
    },
    dataBindings: plannedScenario?.buildSpecInput?.dataBindings || {},
    requirements: {
      ...(plannedScenario?.buildSpecInput?.requirements || {}),
      allowedBusinessBlockUses,
    },
    layout: plannedScenario?.buildSpecInput?.layout || {},
    scenario: plannedScenario.scenario,
  });

  const verifySpec = normalizeVerifySpec({
    ...(plannedScenario?.verifySpecInput || {}),
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId: normalizedSessionId,
    },
    entry: {
      candidatePageUrl,
      requiresAuth: true,
      ...(plannedScenario?.verifySpecInput?.entry || {}),
      candidatePageUrl,
      requiresAuth: plannedScenario?.verifySpecInput?.entry?.requiresAuth !== false,
    },
    preOpen: plannedScenario?.verifySpecInput?.preOpen || {
      assertions: [
        {
          kind: 'page-reachable',
          label: 'fresh page should be reachable',
          severity: 'blocking',
        },
      ],
    },
    gatePolicy: {
      stopOnBuildGateFailure: true,
      stopOnPreOpenBlocker: true,
      stopOnStageFailure: true,
      ...(plannedScenario?.verifySpecInput?.gatePolicy || {}),
    },
  });

  const compiled = compileBuildSpec(buildSpec);
  compiled.compileArtifact.issues.push({
    code: plannedScenario.scenario.planningStatus === 'blocked'
      ? 'PRIMITIVE_FIRST_PLANNING_BLOCKED'
      : 'PRIMITIVE_FIRST_SCENARIO_GENERATED',
    message: plannedScenario.scenario.planningStatus === 'blocked'
      ? `已基于请求 "${requestText}" 进入 Primitive-first 规划，但当前规划被阻断：${plannedScenario.scenario.planningBlockers.map((item) => item.code).join(', ') || 'unknown blocker'}。`
      : `已基于请求 "${requestText}" 生成 Primitive-first 场景 ${plannedScenario.scenario.id}，默认先锁定 collection/fields，再规划区块与操作。`,
  });

  return {
    buildSpec,
    verifySpec,
    compileArtifact: {
      ...compiled.compileArtifact,
      context: {
        sessionDir: sessionDir || '',
      },
    },
  };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    console.log(usage());
    return;
  }

  if (command === 'normalize-build-spec') {
    console.log(JSON.stringify(normalizeBuildSpec(readJsonInput(flags['input-json'], flags['input-file'], 'input')), null, 2));
    return;
  }

  if (command === 'normalize-verify-spec') {
    console.log(JSON.stringify(normalizeVerifySpec(readJsonInput(flags['input-json'], flags['input-file'], 'input')), null, 2));
    return;
  }

  if (command === 'compile-build-spec') {
    console.log(JSON.stringify(compileBuildSpec(readJsonInput(flags['input-json'], flags['input-file'], 'input')), null, 2));
    return;
  }

  if (command === 'build-validation-specs') {
    if (typeof flags['case-request'] !== 'string' || typeof flags['session-id'] !== 'string' || typeof flags['candidate-page-url'] !== 'string') {
      throw new Error('--case-request, --session-id and --candidate-page-url are required');
    }
    const instanceInventory = readOptionalJsonInput(
      flags['instance-inventory-json'],
      flags['instance-inventory-file'],
      'instance inventory',
    );
    console.log(JSON.stringify(await buildValidationSpecsForRun({
      caseRequest: flags['case-request'],
      sessionId: flags['session-id'],
      baseSlug: typeof flags['base-slug'] === 'string' ? flags['base-slug'] : 'validation',
      candidatePageUrl: flags['candidate-page-url'],
      sessionDir: typeof flags['session-dir'] === 'string' ? flags['session-dir'] : '',
      randomSeed: typeof flags['random-seed'] === 'string' ? flags['random-seed'] : '',
      instanceInventory,
    }), null, 2));
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
