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
import {
  buildDynamicValidationScenario,
  splitValidationRequestIntoPageSpecs,
} from './validation_scenario_planner.mjs';
import { probeInstanceInventory } from './instance_inventory_probe.mjs';
import { stableOpaqueId } from './opaque_uid.mjs';
import {
  getVisualizationCollectionName,
  isVisualizationRuntimeSensitive,
  normalizeVisualizationSpec,
  serializeVisualizationFieldPath,
} from './visualization_contracts.mjs';

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
const MENU_PLACEMENT_STRATEGIES = new Set(['root', 'group']);
const MENU_PLACEMENT_SOURCES = new Set(['auto', 'explicit', 'explicit-reuse']);
const MENU_PLACEMENT_MODES = new Set(['auto', 'group', 'root']);

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
    '  node scripts/spec_contracts.mjs build-validation-specs --case-request <text> --session-id <id> --candidate-page-url <url> [--base-slug <slug>] [--session-dir <path>] [--random-seed <seed>] [--instance-inventory-file <path> | --instance-inventory-json <json>] [--menu-mode <auto|group|root>] [--menu-group-title <title>] [--existing-group-route-id <id>] [--existing-group-title <title>]',
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

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function humanizeSlug(value) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return '';
  }
  if (/[^\x00-\x7F]/.test(normalized)) {
    return normalized;
  }
  return normalized
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function humanizeCollectionTitle(collectionMeta) {
  const rawTitle = normalizeOptionalText(collectionMeta?.title);
  if (!rawTitle) {
    return normalizeOptionalText(collectionMeta?.name);
  }
  const translated = rawTitle.match(/\{\{t\("([^"]+)"\)\}\}/);
  if (translated?.[1]) {
    return translated[1];
  }
  return rawTitle.replace(/[{}]/g, '') || normalizeOptionalText(collectionMeta?.name);
}

function normalizeMenuPlacementMode(value) {
  const normalized = normalizeOptionalText(value) || 'auto';
  return MENU_PLACEMENT_MODES.has(normalized) ? normalized : 'auto';
}

function normalizeMenuPlacementOverride(input) {
  if (!input || typeof input !== 'object') {
    return {
      mode: 'auto',
      groupTitle: '',
      existingGroupRouteId: '',
      existingGroupTitle: '',
    };
  }
  return {
    mode: normalizeMenuPlacementMode(input.mode),
    groupTitle: normalizeOptionalText(input.groupTitle),
    existingGroupRouteId: normalizeOptionalText(input.existingGroupRouteId),
    existingGroupTitle: normalizeOptionalText(input.existingGroupTitle),
  };
}

export function buildMenuGroupReservationKey({
  sessionId,
  groupTitle,
  source = 'auto',
}) {
  return stableOpaqueId(
    'menu-group-reservation',
    `${normalizeNonEmpty(sessionId, 'session id')}|${normalizeNonEmpty(groupTitle, 'group title')}|${normalizeOptionalText(source) || 'auto'}`,
  );
}

export function normalizeMenuPlacement(input, options = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const targetTitle = normalizeOptionalText(options.targetTitle);
  const strategy = MENU_PLACEMENT_STRATEGIES.has(normalizeOptionalText(raw.strategy))
    ? normalizeOptionalText(raw.strategy)
    : 'root';
  const sourceCandidate = normalizeOptionalText(raw.source) || (strategy === 'root' ? 'auto' : 'auto');
  const source = MENU_PLACEMENT_SOURCES.has(sourceCandidate)
    ? sourceCandidate
    : (strategy === 'root' ? 'auto' : 'auto');

  if (strategy === 'root') {
    return {
      strategy: 'root',
      source: source === 'explicit' ? 'explicit' : 'auto',
      groupTitle: '',
      groupReservationKey: '',
      existingGroupRouteId: '',
      existingGroupTitle: '',
    };
  }

  const existingGroupRouteId = normalizeOptionalText(raw.existingGroupRouteId);
  const existingGroupTitle = normalizeOptionalText(raw.existingGroupTitle);
  const groupTitle = normalizeOptionalText(raw.groupTitle) || (source === 'explicit-reuse' ? '' : targetTitle);
  const groupReservationKey = normalizeOptionalText(raw.groupReservationKey);

  if (source === 'explicit-reuse' && !existingGroupRouteId && !existingGroupTitle) {
    throw new Error('target.menuPlacement requires existingGroupRouteId or existingGroupTitle when source is explicit-reuse');
  }
  if (source !== 'explicit-reuse' && !groupTitle) {
    throw new Error('target.menuPlacement.groupTitle must not be empty when strategy is group');
  }

  return {
    strategy: 'group',
    source,
    groupTitle,
    groupReservationKey,
    existingGroupRouteId,
    existingGroupTitle,
  };
}

function pickMenuGroupTitleFromCollections(collectionNames, instanceInventory) {
  const normalizedNames = uniqueStrings(collectionNames);
  const collectionMap = instanceInventory?.collections?.byName && typeof instanceInventory.collections.byName === 'object'
    ? instanceInventory.collections.byName
    : {};
  for (const name of normalizedNames) {
    const collectionMeta = collectionMap[name];
    if (!collectionMeta) {
      continue;
    }
    const title = humanizeCollectionTitle(collectionMeta);
    if (title) {
      return title;
    }
  }
  return normalizedNames[0] || '';
}

function resolveMenuPlacementForRun({
  requestText,
  sessionId,
  baseSlug,
  instanceInventory,
  pageSpecPlan,
  menuPlacementOverride,
}) {
  const override = normalizeMenuPlacementOverride(menuPlacementOverride);
  const pageRequests = Array.isArray(pageSpecPlan?.pageRequests) ? pageSpecPlan.pageRequests : [];
  const pageCount = pageRequests.length;
  const collectionNames = uniqueStrings([
    ...pageRequests.flatMap((pageRequest) => Array.isArray(pageRequest?.explicitCollections) ? pageRequest.explicitCollections : []),
  ]);
  const autoGroupTitle = normalizeOptionalText(pageSpecPlan?.groupTitleHint)
    || pickMenuGroupTitleFromCollections(collectionNames, instanceInventory)
    || humanizeSlug(baseSlug)
    || humanizeSlug(requestText.split(/[\s，。；:：]/)[0])
    || 'System';

  if (override.mode === 'root') {
    return normalizeMenuPlacement({
      strategy: 'root',
      source: 'explicit',
    });
  }

  if (override.mode === 'group') {
    if (override.existingGroupRouteId || override.existingGroupTitle) {
      return normalizeMenuPlacement({
        strategy: 'group',
        source: 'explicit-reuse',
        existingGroupRouteId: override.existingGroupRouteId,
        existingGroupTitle: override.existingGroupTitle,
        groupTitle: override.groupTitle,
      }, {
        targetTitle: autoGroupTitle,
      });
    }
    const groupTitle = override.groupTitle || autoGroupTitle;
    return normalizeMenuPlacement({
      strategy: 'group',
      source: 'explicit',
      groupTitle,
      groupReservationKey: buildMenuGroupReservationKey({
        sessionId,
        groupTitle,
        source: 'explicit',
      }),
    }, {
      targetTitle: groupTitle,
    });
  }

  const shouldGroup = pageCount > 1 || pageSpecPlan?.systemIntent === true;
  if (!shouldGroup) {
    return normalizeMenuPlacement({
      strategy: 'root',
      source: 'auto',
    });
  }

  return normalizeMenuPlacement({
    strategy: 'group',
    source: 'auto',
    groupTitle: autoGroupTitle,
    groupReservationKey: buildMenuGroupReservationKey({
      sessionId,
      groupTitle: autoGroupTitle,
      source: 'auto',
    }),
  }, {
    targetTitle: autoGroupTitle,
  });
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
    visualizationSpec: normalizeVisualizationSpecInput(block.visualizationSpec, {
      blockUse: explicitUse,
      dataSource: typeof block.collectionName === 'string' ? block.collectionName.trim() : '',
    }),
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

function normalizeVisualizationSpecInput(input, options = {}) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const normalized = normalizeVisualizationSpec(input, options);
  return normalized.blockUse ? normalized : null;
}

function normalizeVisualizationSpecList(items, options = {}) {
  if (!Array.isArray(items)) {
    return [];
  }
  const seen = new Set();
  return items
    .map((item) => normalizeVisualizationSpecInput(item, options))
    .filter(Boolean)
    .filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function normalizeDiscardedUsesInput(items) {
  return Array.isArray(items)
    ? items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        use: typeof item.use === 'string' ? item.use.trim() : '',
        title: typeof item.title === 'string' ? item.title.trim() : '',
        contextRequirements: sortUniqueStrings(item.contextRequirements),
        unresolvedReasons: sortUniqueStrings(item.unresolvedReasons),
        families: sortUniqueStrings(item.families),
      }))
      .filter((item) => item.use)
    : [];
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

function normalizePagePlanSection(input, label) {
  const normalizedInput = input && typeof input === 'object' ? input : {};
  return {
    sectionId: typeof normalizedInput.sectionId === 'string' ? normalizedInput.sectionId.trim() : '',
    role: typeof normalizedInput.role === 'string' ? normalizedInput.role.trim() : '',
    title: typeof normalizedInput.title === 'string' ? normalizedInput.title.trim() : '',
    area: typeof normalizedInput.area === 'string' ? normalizedInput.area.trim() : '',
    intent: typeof normalizedInput.intent === 'string' ? normalizedInput.intent.trim() : '',
    blockUseHints: sortUniqueStrings(normalizedInput.blockUseHints),
    resolvedBlockUses: sortUniqueStrings(normalizedInput.resolvedBlockUses),
    resolvedBlocks: Array.isArray(normalizedInput.resolvedBlocks)
      ? normalizedInput.resolvedBlocks
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          use: typeof item.use === 'string' ? item.use.trim() : '',
          kind: typeof item.kind === 'string' ? item.kind.trim() : '',
          title: typeof item.title === 'string' ? item.title.trim() : '',
          collectionName: typeof item.collectionName === 'string' ? item.collectionName.trim() : '',
          fieldCount: Number.isFinite(item.fieldCount) ? item.fieldCount : 0,
        }))
      : [],
  };
}

function normalizePagePlan(input, label = 'pagePlan') {
  const normalizedInput = input && typeof input === 'object' ? input : {};
  return {
    version: typeof normalizedInput.version === 'string' ? normalizedInput.version.trim() : '',
    title: typeof normalizedInput.title === 'string' ? normalizedInput.title.trim() : '',
    structureKind: typeof normalizedInput.structureKind === 'string' ? normalizedInput.structureKind.trim() : '',
    designRationale: uniqueStrings(normalizedInput.designRationale),
    sections: Array.isArray(normalizedInput.sections)
      ? normalizedInput.sections.map((section, index) => normalizePagePlanSection(section, `${label}.sections[${index}]`))
      : [],
    tabs: Array.isArray(normalizedInput.tabs)
      ? normalizedInput.tabs
        .filter((tab) => tab && typeof tab === 'object')
        .map((tab, index) => ({
          tabId: typeof tab.tabId === 'string' ? tab.tabId.trim() : '',
          title: typeof tab.title === 'string' ? tab.title.trim() : '',
          sections: Array.isArray(tab.sections)
            ? tab.sections.map((section, sectionIndex) => normalizePagePlanSection(section, `${label}.tabs[${index}].sections[${sectionIndex}]`))
            : [],
        }))
      : [],
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
    semanticScore: Number.isFinite(entry.semanticScore) ? entry.semanticScore : null,
    creativeScore: Number.isFinite(entry.creativeScore) ? entry.creativeScore : null,
    stabilityScore: Number.isFinite(entry.stabilityScore) ? entry.stabilityScore : null,
    selected: entry.selected === true,
    selectionMode: typeof entry.selectionMode === 'string' ? entry.selectionMode.trim() : '',
    primaryBlockType: typeof entry.primaryBlockType === 'string' ? entry.primaryBlockType.trim() : '',
    targetCollections: sortUniqueStrings(entry.targetCollections),
    requestedFields: sortUniqueStrings(entry.requestedFields),
    resolvedFields: sortUniqueStrings(entry.resolvedFields),
    selectionRationale: uniqueStrings(entry.selectionRationale),
    planningStatus: typeof entry.planningStatus === 'string' ? entry.planningStatus.trim() : '',
    planningBlockers: normalizePlanningBlockersInput(entry.planningBlockers),
    shape: typeof entry.shape === 'string' ? entry.shape.trim() : '',
    families: sortUniqueStrings(entry.families),
    creativeIntent: typeof entry.creativeIntent === 'string' ? entry.creativeIntent.trim() : '',
    selectedInsightStrategy: typeof entry.selectedInsightStrategy === 'string' ? entry.selectedInsightStrategy.trim() : '',
    jsExpansionHints: uniqueStrings(entry.jsExpansionHints),
    actionPlan: normalizeActionPlanInput(entry.actionPlan),
    plannedCoverage: normalizePlannedCoverageInput(entry.plannedCoverage),
    visualizationSpec: normalizeVisualizationSpecList(entry.visualizationSpec),
    pagePlan: normalizePagePlan(entry.pagePlan, `scenario.layoutCandidates[${index}].pagePlan`),
    layout: normalizeLayoutShape(entry.layout, `scenario.layoutCandidates[${index}].layout`),
  };
}

function normalizeScenario(input) {
  const scenarioInput = input && typeof input === 'object' ? input : {};
  const randomPolicyInput = scenarioInput.randomPolicy && typeof scenarioInput.randomPolicy === 'object'
    ? scenarioInput.randomPolicy
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
    planningMode: typeof scenarioInput.planningMode === 'string' && scenarioInput.planningMode.trim()
      ? scenarioInput.planningMode.trim()
      : 'creative-first',
    creativeIntent: typeof scenarioInput.creativeIntent === 'string' ? scenarioInput.creativeIntent.trim() : '',
    selectedInsightStrategy: typeof scenarioInput.selectedInsightStrategy === 'string' ? scenarioInput.selectedInsightStrategy.trim() : '',
    jsExpansionHints: uniqueStrings(scenarioInput.jsExpansionHints),
    selectionMode: typeof scenarioInput.selectionMode === 'string' ? scenarioInput.selectionMode.trim() : '',
    plannerVersion: typeof scenarioInput.plannerVersion === 'string' ? scenarioInput.plannerVersion.trim() : '',
    primaryBlockType: typeof scenarioInput.primaryBlockType === 'string' ? scenarioInput.primaryBlockType.trim() : '',
    planningStatus: typeof scenarioInput.planningStatus === 'string' ? scenarioInput.planningStatus.trim() : '',
    maxNestingDepth: Number.isFinite(scenarioInput.maxNestingDepth) ? scenarioInput.maxNestingDepth : 0,
    requestedSignals: uniqueStrings(scenarioInput.requestedSignals),
    selectionRationale: uniqueStrings(scenarioInput.selectionRationale),
    availableUses: sortUniqueStrings(scenarioInput.availableUses),
    eligibleUses: sortUniqueStrings(scenarioInput.eligibleUses),
    discardedUses: normalizeDiscardedUsesInput(scenarioInput.discardedUses),
    targetCollections: sortUniqueStrings(scenarioInput.targetCollections),
    explicitCollections: sortUniqueStrings(scenarioInput.explicitCollections),
    primaryCollectionExplicit: scenarioInput.primaryCollectionExplicit === true,
    requestedFields: sortUniqueStrings(scenarioInput.requestedFields),
    resolvedFields: sortUniqueStrings(scenarioInput.resolvedFields),
    actionPlan,
    planningBlockers,
    plannedCoverage: normalizePlannedCoverageInput(scenarioInput.plannedCoverage),
    visualizationSpec: normalizeVisualizationSpecList(scenarioInput.visualizationSpec),
    creativeProgram: normalizeCreativeProgram(scenarioInput.creativeProgram),
    layoutCandidates,
    selectedCandidateId,
    candidateScores: scenarioInput.candidateScores && typeof scenarioInput.candidateScores === 'object'
      ? scenarioInput.candidateScores
      : {},
    candidateFamilies: scenarioInput.candidateFamilies && typeof scenarioInput.candidateFamilies === 'object'
      ? scenarioInput.candidateFamilies
      : {},
    candidateShape: scenarioInput.candidateShape && typeof scenarioInput.candidateShape === 'object'
      ? scenarioInput.candidateShape
      : {},
    pagePlan: normalizePagePlan(scenarioInput.pagePlan, 'scenario.pagePlan'),
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
    if (block.visualizationSpec && isVisualizationRuntimeSensitive(block.visualizationSpec)) {
      return true;
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
    target: (() => {
      const normalizedTarget = {
        title: typeof targetInput.title === 'string' && targetInput.title.trim() ? targetInput.title.trim() : '',
        buildPolicy: typeof targetInput.buildPolicy === 'string' && targetInput.buildPolicy.trim()
          ? targetInput.buildPolicy.trim()
          : 'fresh',
        schemaUidCandidate: typeof targetInput.schemaUidCandidate === 'string' ? targetInput.schemaUidCandidate.trim() : '',
        routeSegmentCandidate: typeof targetInput.routeSegmentCandidate === 'string' ? targetInput.routeSegmentCandidate.trim() : '',
        candidatePageUrl: typeof targetInput.candidatePageUrl === 'string' ? targetInput.candidatePageUrl.trim() : '',
        pageUse: layout.pageUse,
      };
      normalizedTarget.menuPlacement = normalizeMenuPlacement(targetInput.menuPlacement, {
        targetTitle: normalizedTarget.title,
      });
      return normalizedTarget;
    })(),
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

  const pushVisualizationPatterns = (block) => {
    const spec = normalizeVisualizationSpecInput(block?.visualizationSpec, {
      blockUse: block?.use,
      dataSource: block?.collectionName,
    });
    if (!spec?.blockUse) {
      return;
    }
    patterns.add('insight-visualization');
    if (spec.blockUse === 'GridCardBlockModel') {
      patterns.add('grid-card-kpi');
      return;
    }
    if (spec.blockUse !== 'ChartBlockModel') {
      return;
    }
    if (spec.queryMode === 'builder') {
      patterns.add('chart-builder');
    }
    if (spec.queryMode === 'sql') {
      patterns.add('chart-sql');
    }
    if (spec.optionMode === 'custom') {
      patterns.add('chart-custom-option');
    }
    if (spec.eventsRaw) {
      patterns.add('chart-events');
    }
  };

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
    pushVisualizationPatterns(block);
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

function collectScopedBlockUses(compiledBlocks) {
  const uses = new Set();
  const visit = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      if (typeof item.use === 'string' && item.use.trim()) {
        uses.add(item.use.trim());
      }
      visit(item.blocks);
    }
  };
  visit(compiledBlocks);
  return [...uses].sort((left, right) => left.localeCompare(right));
}

function collectDirectBlockUses(compiledBlocks) {
  return (Array.isArray(compiledBlocks) ? compiledBlocks : [])
    .map((item) => normalizeOptionalText(item?.use))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function pushReadbackRequiredScope(artifact, descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    return;
  }
  const scopePath = normalizeOptionalText(descriptor.scopePath);
  if (!scopePath) {
    return;
  }
  artifact.readbackContract.requiredScopes.push({
    scopePath,
    scopeKind: normalizeOptionalText(descriptor.scopeKind),
    pageUse: normalizeOptionalText(descriptor.pageUse),
    tabTitle: normalizeOptionalText(descriptor.tabTitle),
    requireBlockGrid: descriptor.requireBlockGrid !== false,
    requiredBlockUses: sortUniqueStrings(descriptor.requiredBlockUses),
  });
}

function pushReadbackRequiredGridMembership(artifact, descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    return;
  }
  const scopePath = normalizeOptionalText(descriptor.scopePath);
  const expectedItemUses = collectDirectBlockUses(descriptor.compiledBlocks);
  const expectedItemCount = Number.isInteger(descriptor.expectedItemCount)
    ? descriptor.expectedItemCount
    : expectedItemUses.length;
  if (!scopePath || expectedItemCount <= 0) {
    return;
  }
  artifact.readbackContract.requiredGridMembership.push({
    scopePath,
    scopeKind: normalizeOptionalText(descriptor.scopeKind),
    gridUse: normalizeOptionalText(descriptor.gridUse) || 'BlockGridModel',
    expectedItemCount,
    expectedItemUses,
    expectedItemUids: [],
    requireBidirectionalLayoutMatch: descriptor.requireBidirectionalLayoutMatch === true,
  });
}

function pushReadbackRequiredDetailsBlock(artifact, descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    return;
  }
  const scopePath = normalizeOptionalText(descriptor.scopePath);
  const collectionName = normalizeOptionalText(descriptor.collectionName);
  const fieldPaths = sortUniqueStrings(descriptor.fieldPaths);
  if (!scopePath || !collectionName || fieldPaths.length === 0) {
    return;
  }
  artifact.readbackContract.requiredDetailsBlocks.push({
    scopePath,
    scopeKind: normalizeOptionalText(descriptor.scopeKind),
    collectionName,
    fieldPaths,
    minItemCount: Number.isFinite(descriptor.minItemCount)
      ? Math.max(1, Number(descriptor.minItemCount))
      : fieldPaths.length,
    requireFilterByTkTemplate: descriptor.requireFilterByTkTemplate === true,
    expectedFilterByTkTemplate: normalizeOptionalText(descriptor.expectedFilterByTkTemplate),
  });
}

function compilePopup(popup, scope, artifact, context) {
  if (!popup) {
    return null;
  }
  const popupContext = {
    pageSignature: `${scope}.popup.page`,
    pageUse: popup.pageUse,
    tabTitle: context?.tabTitle || '',
    scopePath: `${scope}.popup.page`,
    scopeKind: 'popup-page',
  };
  const compiledBlocks = compileBlocks(popup.blocks, `${scope}.popup.page`, artifact, popupContext);
  pushReadbackRequiredScope(artifact, {
    scopePath: popupContext.scopePath,
    scopeKind: popupContext.scopeKind,
    pageUse: popup.pageUse,
    tabTitle: '',
    requireBlockGrid: true,
    requiredBlockUses: collectScopedBlockUses(compiledBlocks),
  });
  pushReadbackRequiredGridMembership(artifact, {
    scopePath: popupContext.scopePath,
    scopeKind: popupContext.scopeKind,
    compiledBlocks,
    gridUse: 'BlockGridModel',
  });
  return {
    title: popup.title,
    pageUse: popup.pageUse,
    blocks: compiledBlocks,
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
    const visualizationSpec = normalizeVisualizationSpecInput(block.visualizationSpec, {
      blockUse: block.use,
      dataSource: block.collectionName,
    });
    if (block.kind === 'Filter') {
      artifact.readbackContract.requireFilterManager = true;
      artifact.readbackContract.requiredFilterManagerEntryCount += block.fields.length;
    }
    if (block.collectionName) {
      artifact.requiredMetadataRefs.collections.add(block.collectionName);
    }
    const visualizationCollectionName = getVisualizationCollectionName(visualizationSpec);
    if (visualizationCollectionName) {
      artifact.requiredMetadataRefs.collections.add(visualizationCollectionName);
    }
    for (const field of block.fields) {
      if (block.collectionName) {
        artifact.requiredMetadataRefs.fields.add(`${block.collectionName}.${field}`);
      }
    }
    if (visualizationCollectionName) {
      for (const field of [
        ...(Array.isArray(visualizationSpec.metricOrDimension) ? visualizationSpec.metricOrDimension : []),
        ...(Array.isArray(visualizationSpec.metrics) ? visualizationSpec.metrics : []),
        ...(Array.isArray(visualizationSpec.measures) ? visualizationSpec.measures.map((item) => item?.field) : []),
        ...(Array.isArray(visualizationSpec.dimensions) ? visualizationSpec.dimensions.map((item) => item?.field) : []),
      ]) {
        const serializedField = serializeVisualizationFieldPath(field);
        if (serializedField) {
          artifact.requiredMetadataRefs.fields.add(`${visualizationCollectionName}.${serializedField}`);
        }
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
      visualizationSpec,
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
    if (block.kind === 'Details') {
      pushReadbackRequiredDetailsBlock(artifact, {
        scopePath: context.scopePath || context.pageSignature || '$.page',
        scopeKind: context.scopeKind || 'root-page',
        collectionName: block.collectionName || compiledBlock.collectionName,
        fieldPaths: compiledBlock.fields,
        minItemCount: compiledBlock.fields.length,
        requireFilterByTkTemplate: String(context.scopeKind || '').startsWith('popup'),
        expectedFilterByTkTemplate: '{{ctx.view.inputArgs.filterByTk}}',
      });
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
      requiredScopes: [],
      requiredGridMembership: [],
      requiredDetailsBlocks: [],
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
      scopePath: '$.page',
      scopeKind: 'root-page',
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
          scopePath: `$.page.tabs[${index}]`,
          scopeKind: 'root-tab',
        }),
      };
    }),
  };

  pushReadbackRequiredScope(artifact, {
    scopePath: '$.page',
    scopeKind: 'root-page',
    pageUse: layout.pageUse,
    tabTitle: '',
    requireBlockGrid: false,
    requiredBlockUses: collectScopedBlockUses(tree.blocks),
  });
  pushReadbackRequiredGridMembership(artifact, {
    scopePath: '$.page',
    scopeKind: 'root-page',
    compiledBlocks: tree.blocks,
    gridUse: 'BlockGridModel',
  });
  tree.tabs.forEach((tab, index) => {
    pushReadbackRequiredScope(artifact, {
      scopePath: `$.page.tabs[${index}]`,
      scopeKind: 'root-tab',
      pageUse: defaultTabUse,
      tabTitle: tab.title,
      requireBlockGrid: true,
      requiredBlockUses: collectScopedBlockUses(tab.blocks),
    });
    pushReadbackRequiredGridMembership(artifact, {
      scopePath: `$.page.tabs[${index}]`,
      scopeKind: 'root-tab',
      compiledBlocks: tab.blocks,
      gridUse: 'BlockGridModel',
    });
  });

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
    menuPlacement: buildSpec.target.menuPlacement,
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
    planningMode: artifact.scenario.planningMode,
    creativeIntent: artifact.scenario.creativeIntent,
    selectedInsightStrategy: artifact.scenario.selectedInsightStrategy,
    jsExpansionHints: artifact.scenario.jsExpansionHints,
    selectionMode: artifact.selectionMode,
    plannerVersion: artifact.plannerVersion,
    primaryBlockType: artifact.primaryBlockType,
    targetCollections: artifact.scenario.targetCollections,
    explicitCollections: artifact.scenario.explicitCollections,
    primaryCollectionExplicit: artifact.scenario.primaryCollectionExplicit === true,
    requestedFields: artifact.scenario.requestedFields,
    resolvedFields: artifact.scenario.resolvedFields,
    eligibleUses: artifact.scenario.eligibleUses,
    discardedUses: artifact.scenario.discardedUses,
    planningStatus: artifact.planningStatus,
    planningBlockers: artifact.planningBlockers,
    maxNestingDepth: artifact.maxNestingDepth,
    actionPlan: artifact.actionPlan,
    selectionRationale: artifact.scenario.selectionRationale,
    creativeProgram: artifact.scenario.creativeProgram,
    layoutCandidates: artifact.scenario.layoutCandidates,
    selectedCandidateId: artifact.scenario.selectedCandidateId,
    candidateScores: artifact.scenario.candidateScores,
    candidateFamilies: artifact.scenario.candidateFamilies,
    candidateShape: artifact.scenario.candidateShape,
    pagePlan: artifact.scenario.pagePlan,
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
    visualizationSpec: artifact.scenario.visualizationSpec,
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
    pagePlan: buildSpec.scenario.pagePlan,
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
      creativeIntent: candidate.creativeIntent || buildSpec.scenario.creativeIntent,
      selectedInsightStrategy: candidate.selectedInsightStrategy || buildSpec.scenario.selectedInsightStrategy,
      jsExpansionHints: candidate.jsExpansionHints.length > 0
        ? candidate.jsExpansionHints
        : buildSpec.scenario.jsExpansionHints,
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
      visualizationSpec: candidate.visualizationSpec.length > 0
        ? candidate.visualizationSpec
        : buildSpec.scenario.visualizationSpec,
      actionPlan: candidate.actionPlan.length > 0 ? candidate.actionPlan : buildSpec.scenario.actionPlan,
      pagePlan: candidate.pagePlan?.sections?.length || candidate.pagePlan?.tabs?.length
        ? candidate.pagePlan
        : buildSpec.scenario.pagePlan,
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
      pagePlan: candidateScenario.pagePlan,
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

function mergeCatalogEntriesByUse(primaryCatalog, secondaryCatalog) {
  const byUse = new Map();
  for (const entry of Array.isArray(secondaryCatalog) ? secondaryCatalog : []) {
    const use = normalizeOptionalText(entry?.use);
    if (!use) {
      continue;
    }
    byUse.set(use, entry);
  }
  for (const entry of Array.isArray(primaryCatalog) ? primaryCatalog : []) {
    const use = normalizeOptionalText(entry?.use);
    if (!use) {
      continue;
    }
    byUse.set(use, entry);
  }
  return [...byUse.values()];
}

function mergeInstanceInventories(primaryValue, secondaryValue) {
  const primary = primaryValue && typeof primaryValue === 'object' ? primaryValue : {};
  const secondary = secondaryValue && typeof secondaryValue === 'object' ? secondaryValue : {};
  const primaryFlowSchema = primary.flowSchema && typeof primary.flowSchema === 'object' ? primary.flowSchema : {};
  const secondaryFlowSchema = secondary.flowSchema && typeof secondary.flowSchema === 'object' ? secondary.flowSchema : {};
  const primaryCollections = primary.collections && typeof primary.collections === 'object' ? primary.collections : {};
  const secondaryCollections = secondary.collections && typeof secondary.collections === 'object' ? secondary.collections : {};

  const collectionNames = sortUniqueStrings([
    ...(Array.isArray(primaryCollections.names) ? primaryCollections.names : []),
    ...(Array.isArray(secondaryCollections.names) ? secondaryCollections.names : []),
  ]);

  return {
    ...secondary,
    ...primary,
    detected: Boolean(primary.detected || secondary.detected),
    apiBase: normalizeOptionalText(primary.apiBase) || normalizeOptionalText(secondary.apiBase),
    adminBase: normalizeOptionalText(primary.adminBase) || normalizeOptionalText(secondary.adminBase),
    appVersion: normalizeOptionalText(primary.appVersion) || normalizeOptionalText(secondary.appVersion),
    enabledPlugins: sortUniqueStrings([
      ...(Array.isArray(primary.enabledPlugins) ? primary.enabledPlugins : []),
      ...(Array.isArray(secondary.enabledPlugins) ? secondary.enabledPlugins : []),
    ]),
    enabledPluginsDetected: Boolean(primary.enabledPluginsDetected || secondary.enabledPluginsDetected),
    instanceFingerprint: normalizeOptionalText(primary.instanceFingerprint) || normalizeOptionalText(secondary.instanceFingerprint),
    flowSchema: {
      ...secondaryFlowSchema,
      ...primaryFlowSchema,
      detected: Boolean(primaryFlowSchema.detected || secondaryFlowSchema.detected),
      rootPublicUses: sortUniqueStrings([
        ...(Array.isArray(primaryFlowSchema.rootPublicUses) ? primaryFlowSchema.rootPublicUses : []),
        ...(Array.isArray(secondaryFlowSchema.rootPublicUses) ? secondaryFlowSchema.rootPublicUses : []),
      ]),
      publicUseCatalog: mergeCatalogEntriesByUse(primaryFlowSchema.publicUseCatalog, secondaryFlowSchema.publicUseCatalog),
      missingUses: sortUniqueStrings([
        ...(Array.isArray(primaryFlowSchema.missingUses) ? primaryFlowSchema.missingUses : []),
        ...(Array.isArray(secondaryFlowSchema.missingUses) ? secondaryFlowSchema.missingUses : []),
      ]),
      discoveryNotes: sortUniqueStrings([
        ...(Array.isArray(primaryFlowSchema.discoveryNotes) ? primaryFlowSchema.discoveryNotes : []),
        ...(Array.isArray(secondaryFlowSchema.discoveryNotes) ? secondaryFlowSchema.discoveryNotes : []),
      ]),
    },
    collections: {
      ...secondaryCollections,
      ...primaryCollections,
      detected: collectionNames.length > 0 && Boolean(primaryCollections.detected || secondaryCollections.detected),
      names: collectionNames,
      byName: Object.fromEntries(collectionNames.map((name) => [
        name,
        (primaryCollections.byName && typeof primaryCollections.byName === 'object' && primaryCollections.byName[name])
          || (secondaryCollections.byName && typeof secondaryCollections.byName === 'object' && secondaryCollections.byName[name])
          || { name },
      ])),
      discoveryNotes: sortUniqueStrings([
        ...(Array.isArray(primaryCollections.discoveryNotes) ? primaryCollections.discoveryNotes : []),
        ...(Array.isArray(secondaryCollections.discoveryNotes) ? secondaryCollections.discoveryNotes : []),
      ]),
    },
    notes: sortUniqueStrings([
      ...(Array.isArray(primary.notes) ? primary.notes : []),
      ...(Array.isArray(secondary.notes) ? secondary.notes : []),
    ]),
    errors: sortUniqueStrings([
      ...(Array.isArray(primary.errors) ? primary.errors : []),
      ...(Array.isArray(secondary.errors) ? secondary.errors : []),
    ]),
    cache: primary.cache && typeof primary.cache === 'object'
      ? primary.cache
      : (secondary.cache && typeof secondary.cache === 'object' ? secondary.cache : {}),
  };
}

function hasUsableCollectionsInventory(instanceInventory) {
  const collections = instanceInventory?.collections;
  const names = sortUniqueStrings(Array.isArray(collections?.names) ? collections.names : []);
  return names.length > 0;
}

function canProbeValidationInstanceInventory() {
  return process.env.NOCOBASE_DISABLE_INSTANCE_PROBE !== 'true'
    && (
      (typeof process.env.NOCOBASE_API_TOKEN === 'string' && process.env.NOCOBASE_API_TOKEN.trim())
      || process.env.NOCOBASE_ENABLE_INSTANCE_PROBE === 'true'
    );
}

async function resolveValidationInstanceInventory({
  candidatePageUrl,
  instanceInventoryInput,
}) {
  const hasProvidedInventory = instanceInventoryInput && typeof instanceInventoryInput === 'object';
  if (hasProvidedInventory && hasUsableCollectionsInventory(instanceInventoryInput)) {
    return {
      ok: true,
      instanceInventory: instanceInventoryInput,
      source: 'provided',
    };
  }

  const canProbe = canProbeValidationInstanceInventory();
  const shouldProbe = !hasProvidedInventory || !hasUsableCollectionsInventory(instanceInventoryInput);
  const probedInventory = shouldProbe && canProbe
    ? await probeInstanceInventory({
      candidatePageUrl,
      token: process.env.NOCOBASE_API_TOKEN || '',
    })
    : null;
  const mergedInventory = hasProvidedInventory
    ? mergeInstanceInventories(instanceInventoryInput, probedInventory)
    : probedInventory;

  if (hasUsableCollectionsInventory(mergedInventory)) {
    return {
      ok: true,
      instanceInventory: mergedInventory,
      source: hasProvidedInventory ? (probedInventory ? 'provided+probed' : 'provided') : 'probed',
    };
  }

  return {
    ok: false,
    instanceInventory: mergedInventory || (hasProvidedInventory ? instanceInventoryInput : null),
    source: hasProvidedInventory ? 'provided-incomplete' : 'missing',
    blocker: {
      code: 'LIVE_COLLECTION_INVENTORY_REQUIRED',
      message: '缺少 live collection inventory，当前请求不能继续进入 planner/build。',
      details: {
        candidatePageUrl: normalizeOptionalText(candidatePageUrl),
        hasProvidedInventory,
        canProbe,
        probeDisabled: process.env.NOCOBASE_DISABLE_INSTANCE_PROBE === 'true',
        hasApiToken: Boolean(typeof process.env.NOCOBASE_API_TOKEN === 'string' && process.env.NOCOBASE_API_TOKEN.trim()),
      },
    },
  };
}

function buildBlockedScenario({
  requestText,
  sessionId,
  candidatePageUrl,
  instanceInventory,
  blocker,
  title = 'Validation blocked',
  selectionMode = 'request-gate',
}) {
  return {
    id: `${selectionMode}:${sessionId || 'session'}:${blocker.code.toLowerCase()}`,
    title,
    summary: blocker.message,
    domainId: '',
    domainLabel: '',
    archetypeId: blocker.code.toLowerCase(),
    archetypeLabel: blocker.code,
    tier: 'request-gate',
    expectedOutcome: 'blocker-expected',
    planningMode: 'creative-first',
    requestedSignals: uniqueStrings([requestText]),
    selectionRationale: [blocker.message],
    availableUses: sortUniqueStrings([
      ...(Array.isArray(instanceInventory?.flowSchema?.rootPublicUses) ? instanceInventory.flowSchema.rootPublicUses : []),
    ]),
    eligibleUses: [],
    discardedUses: [],
    targetCollections: [],
    explicitCollections: [],
    primaryCollectionExplicit: false,
    requestedFields: [],
    resolvedFields: [],
    actionPlan: [],
    planningBlockers: [blocker],
    plannedCoverage: {
      blocks: [],
      patterns: [],
    },
    creativeProgram: {
      id: `${selectionMode}-blocked`,
      strategy: selectionMode,
      prompt: blocker.message,
      selectionPolicy: 'blocked',
      constraints: [blocker.code],
      heuristics: [],
      requiredPatterns: [],
      optionalPatterns: [],
      notes: [],
    },
    layoutCandidates: [],
    selectedCandidateId: '',
    candidateScores: {},
    candidateFamilies: {},
    candidateShape: {},
    instanceInventory: instanceInventory && typeof instanceInventory === 'object' ? instanceInventory : {},
    randomPolicy: {
      mode: 'deterministic',
      seed: '',
      seedSource: 'none',
      sessionId,
      candidatePageUrl: normalizeOptionalText(candidatePageUrl),
    },
    selectionMode,
    plannerVersion: 'primitive-first-v2',
    primaryBlockType: '',
    planningStatus: 'blocked',
    maxNestingDepth: 0,
  };
}

function buildBlockedValidationSpecs({
  requestText,
  sessionId,
  baseSlug,
  candidatePageUrl,
  sessionDir,
  instanceInventory,
  blocker,
  issueCode,
  issueMessage,
  menuPlacement,
  extraCompileArtifact = {},
  extraResult = {},
}) {
  const scenario = buildBlockedScenario({
    requestText,
    sessionId,
    candidatePageUrl,
    instanceInventory,
    blocker,
    title: `${baseSlug || 'validation'} blocked`,
  });
  const buildSpec = normalizeBuildSpec({
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId,
    },
    target: {
      title: `${baseSlug || 'validation'} blocked`,
      buildPolicy: 'fresh',
      routeSegmentCandidate: sessionId,
      candidatePageUrl,
      menuPlacement,
    },
    options: {
      compileMode: DEFAULT_BUILD_COMPILE_MODE,
      allowLegacyFallback: false,
    },
    dataBindings: {
      collections: [],
      relations: [],
    },
    requirements: {
      allowedBusinessBlockUses: sortUniqueStrings([
        ...(Array.isArray(instanceInventory?.flowSchema?.rootPublicUses) ? instanceInventory.flowSchema.rootPublicUses : []),
      ]),
    },
    layout: {
      pageUse: 'RootPageModel',
      blocks: [],
      tabs: [],
    },
    scenario,
  });
  const verifySpec = normalizeVerifySpec({
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId,
    },
    entry: {
      candidatePageUrl,
      requiresAuth: true,
    },
    gatePolicy: {
      stopOnBuildGateFailure: true,
      stopOnPreOpenBlocker: true,
      stopOnStageFailure: true,
    },
  });
  const compiled = compileBuildSpec(buildSpec);
  return {
    buildSpec,
    verifySpec,
    menuPlacement: buildSpec.target.menuPlacement,
    compileArtifact: {
      ...compiled.compileArtifact,
      issues: [
        {
          code: issueCode,
          message: issueMessage,
        },
        ...compiled.compileArtifact.issues,
      ],
      context: {
        sessionDir: sessionDir || '',
      },
      ...extraCompileArtifact,
    },
    ...extraResult,
  };
}

function buildSingleValidationSpecs({
  requestText,
  sessionId,
  baseSlug,
  candidatePageUrl,
  sessionDir,
  randomSeed,
  instanceInventory,
  planningMode,
  pageId = '',
  menuPlacement,
}) {
  const plannedScenario = buildDynamicValidationScenario({
    caseRequest: requestText,
    sessionId,
    baseSlug,
    candidatePageUrl,
    instanceInventory,
    randomSeed,
    planningMode,
  });

  const allowedBusinessBlockUses = sortUniqueStrings([
    'FilterFormBlockModel',
    'TableBlockModel',
    'DetailsBlockModel',
    'CreateFormModel',
    'EditFormModel',
    ...(Array.isArray(instanceInventory?.flowSchema?.rootPublicUses) ? instanceInventory.flowSchema.rootPublicUses : []),
  ]);

  const buildSpec = normalizeBuildSpec({
    ...(plannedScenario.buildSpecInput || {}),
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId,
    },
    target: {
      ...(plannedScenario.buildSpecInput?.target || {}),
      title: plannedScenario?.buildSpecInput?.target?.title || `${baseSlug || 'validation'} fresh build`,
      buildPolicy: 'fresh',
      routeSegmentCandidate: sessionId,
      candidatePageUrl,
      menuPlacement,
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
      sessionId,
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
    pageId,
    pageRequest: requestText,
    menuPlacement: buildSpec.target.menuPlacement,
    buildSpec,
    verifySpec,
    compileArtifact: {
      ...compiled.compileArtifact,
      context: {
        sessionDir: sessionDir || '',
        pageId,
      },
    },
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
  planningMode,
  menuPlacement: menuPlacementOverride,
}) {
  const requestText = normalizeNonEmpty(caseRequest, 'case request');
  const normalizedSessionId = normalizeNonEmpty(sessionId, 'session id');
  const inventoryResolution = await resolveValidationInstanceInventory({
    candidatePageUrl,
    instanceInventoryInput,
  });
  if (!inventoryResolution.ok) {
    const blockedPageSpecPlan = splitValidationRequestIntoPageSpecs({
      caseRequest: requestText,
      collectionsInventory: inventoryResolution.instanceInventory?.collections,
    });
    const blockedMenuPlacement = resolveMenuPlacementForRun({
      requestText,
      sessionId: normalizedSessionId,
      baseSlug,
      instanceInventory: inventoryResolution.instanceInventory,
      pageSpecPlan: blockedPageSpecPlan,
      menuPlacementOverride,
    });
    return buildBlockedValidationSpecs({
      requestText,
      sessionId: normalizedSessionId,
      baseSlug,
      candidatePageUrl,
      sessionDir,
      instanceInventory: inventoryResolution.instanceInventory,
      blocker: inventoryResolution.blocker,
      issueCode: 'LIVE_COLLECTION_INVENTORY_REQUIRED',
      issueMessage: '缺少 live collection inventory，validation request 在 planner 前被阻断。',
      menuPlacement: blockedMenuPlacement,
      extraResult: {
        pageBuilds: [],
        pageLevelPlan: {
          requestedPageCount: 1,
          decompositionMode: 'inventory-gated',
          pageCount: 0,
          blockers: [inventoryResolution.blocker],
        },
      },
    });
  }

  const instanceInventory = inventoryResolution.instanceInventory;
  const pageSpecPlan = splitValidationRequestIntoPageSpecs({
    caseRequest: requestText,
    collectionsInventory: instanceInventory?.collections,
  });
  const resolvedMenuPlacement = resolveMenuPlacementForRun({
    requestText,
    sessionId: normalizedSessionId,
    baseSlug,
    instanceInventory,
    pageSpecPlan,
    menuPlacementOverride,
  });
  if (Array.isArray(pageSpecPlan.blockers) && pageSpecPlan.blockers.length > 0) {
    return buildBlockedValidationSpecs({
      requestText,
      sessionId: normalizedSessionId,
      baseSlug,
      candidatePageUrl,
      sessionDir,
      instanceInventory,
      blocker: pageSpecPlan.blockers[0],
      issueCode: pageSpecPlan.blockers[0].code,
      issueMessage: pageSpecPlan.blockers[0].message,
      menuPlacement: resolvedMenuPlacement,
      extraResult: {
        pageBuilds: [],
        pageLevelPlan: {
          requestedPageCount: pageSpecPlan.requestedPageCount,
          decompositionMode: pageSpecPlan.decompositionMode,
          pageCount: Array.isArray(pageSpecPlan.pageRequests) ? pageSpecPlan.pageRequests.length : 0,
          blockers: pageSpecPlan.blockers,
        },
      },
    });
  }

  if (Array.isArray(pageSpecPlan.pageRequests) && pageSpecPlan.pageRequests.length > 1) {
    const pageBuilds = pageSpecPlan.pageRequests.map((pageRequest, index) => buildSingleValidationSpecs({
      requestText: pageRequest.requestText,
      sessionId: `${normalizedSessionId}-page-${index + 1}`,
      baseSlug: Array.isArray(pageRequest.explicitCollections) && pageRequest.explicitCollections.length > 0
        ? pageRequest.explicitCollections[0]
        : `${baseSlug || 'validation'}-page-${index + 1}`,
      candidatePageUrl,
      sessionDir,
      randomSeed,
      instanceInventory,
      planningMode,
      pageId: pageRequest.pageId || `page-${index + 1}`,
      menuPlacement: resolvedMenuPlacement,
    }));
    const multiPageBlocker = {
      code: 'MULTI_PAGE_REQUEST_REQUIRES_PAGE_LEVEL_EXECUTION',
      message: `请求已拆成 ${pageBuilds.length} 个页面规格，必须逐页执行 build，不能把聚合请求直接送入单页 builder。`,
      details: {
        pageCount: pageBuilds.length,
        pageIds: pageBuilds.map((item, index) => item.compileArtifact?.scenarioId || `page-${index + 1}`),
        splitMode: pageSpecPlan.decompositionMode,
      },
    };
    return buildBlockedValidationSpecs({
      requestText,
      sessionId: normalizedSessionId,
      baseSlug,
      candidatePageUrl,
      sessionDir,
      instanceInventory,
      blocker: multiPageBlocker,
      issueCode: 'MULTI_PAGE_REQUEST_SPLIT_REQUIRED',
      issueMessage: multiPageBlocker.message,
      menuPlacement: resolvedMenuPlacement,
      extraCompileArtifact: {
        multiPageRequest: {
          detected: true,
          pageCount: pageBuilds.length,
          splitMode: pageSpecPlan.decompositionMode,
          pageTitles: pageBuilds.map((item) => item.buildSpec?.target?.title || ''),
          pageScenarioIds: pageBuilds.map((item) => item.compileArtifact?.scenarioId || ''),
        },
      },
      extraResult: {
        pageBuilds,
        pageLevelPlan: {
          requestedPageCount: pageSpecPlan.requestedPageCount,
          decompositionMode: pageSpecPlan.decompositionMode,
          pageCount: pageBuilds.length,
          blockers: [],
        },
      },
    });
  }

  const singleBuild = buildSingleValidationSpecs({
    requestText,
    sessionId: normalizedSessionId,
    baseSlug,
    candidatePageUrl,
    sessionDir,
    randomSeed,
    instanceInventory,
    planningMode,
    menuPlacement: resolvedMenuPlacement,
  });
  return {
    ...singleBuild,
    pageBuilds: [singleBuild],
    pageLevelPlan: {
      requestedPageCount: pageSpecPlan.requestedPageCount,
      decompositionMode: pageSpecPlan.decompositionMode,
      pageCount: 1,
      blockers: [],
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
    const menuPlacement = normalizeMenuPlacementOverride({
      mode: flags['menu-mode'],
      groupTitle: flags['menu-group-title'],
      existingGroupRouteId: flags['existing-group-route-id'],
      existingGroupTitle: flags['existing-group-title'],
    });
    console.log(JSON.stringify(await buildValidationSpecsForRun({
      caseRequest: flags['case-request'],
      sessionId: flags['session-id'],
      baseSlug: typeof flags['base-slug'] === 'string' ? flags['base-slug'] : 'validation',
      candidatePageUrl: flags['candidate-page-url'],
      sessionDir: typeof flags['session-dir'] === 'string' ? flags['session-dir'] : '',
      randomSeed: typeof flags['random-seed'] === 'string' ? flags['random-seed'] : '',
      instanceInventory,
      menuPlacement,
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
