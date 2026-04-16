#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PAGE_MODEL_USES_SET,
  PAGE_TAB_USES,
  SUPPORTED_POPUP_PAGE_USES,
  SUPPORTED_POPUP_PAGE_USES_SET,
  getAllowedTabUsesForPage as getAllowedTabUsesForPageFromContracts,
  normalizePageUse,
} from './model_contracts.mjs';
import {
  LEGACY_RECORD_CONTEXT_FILTER_BY_TK as RECORD_CONTEXT_FILTER_BY_TK,
  buildRecordContextFilterByTkTemplate,
} from './filter_by_tk_templates.mjs';
import {
  canonicalizeRunJSPayload,
  inspectRunJSPayloadStatic,
  transformFilterGroupToQueryFilter,
} from './runjs_guard.mjs';
import { resolveFilterFieldModelSpec } from './filter_form_field_resolver.mjs';

export const GENERAL_MODE = 'general';
export const VALIDATION_CASE_MODE = 'validation-case';
export const DEFAULT_AUDIT_MODE = VALIDATION_CASE_MODE;
export const BLOCKER_EXIT_CODE = 2;

const NON_RISK_ACCEPTABLE_BLOCKER_CODES = new Set([
  'ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE',
  'DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH',
  'DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH',
  'ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL',
  'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE',
  'TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE',
  'TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT',
  'FILTER_FORM_ASSOCIATION_REQUIRES_EXPLICIT_SCALAR_PATH',
  'BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH',
  'EMPTY_DETAILS_BLOCK',
  'FORM_ACTION_MUST_USE_ACTIONS_SLOT',
  'FORM_BLOCK_EMPTY_GRID',
  'FORM_ITEM_FIELD_SUBMODEL_MISSING',
  'FORM_SUBMIT_ACTION_DUPLICATED',
  'FORM_SUBMIT_ACTION_MISSING',
  'FILTER_FORM_EMPTY_GRID',
  'TABLE_COLLECTION_ACTION_SLOT_USE_INVALID',
  'TABLE_COLUMN_FIELD_BINDING_ENTRY_INVALID',
  'TABLE_COLUMN_FIELD_SUBMODEL_MISSING',
  'TABLE_RECORD_ACTION_SLOT_USE_INVALID',
  'DETAILS_ACTION_SLOT_USE_INVALID',
  'FILTER_FORM_ACTION_SLOT_USE_INVALID',
  'FILTER_FORM_ITEM_FIELD_SUBMODEL_MISSING',
  'FILTER_FORM_ITEM_FILTERFIELD_MISSING',
  'FILTER_FORM_FIELD_MODEL_MISMATCH',
  'FIELD_MODEL_PAGE_SLOT_UNSUPPORTED',
  'POPUP_PAGE_USE_INVALID',
  'POPUP_PAGE_USE_MISMATCH',
  'TAB_SLOT_USE_INVALID',
  'TAB_GRID_MISSING_OR_INVALID',
  'TAB_GRID_ITEM_USE_INVALID',
  'EXISTING_UID_REPARENT_BLOCKED',
  'GRID_ITEM_LAYOUT_MISSING',
  'GRID_LAYOUT_ORPHAN_UID',
  'TAB_SUBTREE_UID_REUSED',
  'REQUIRED_VISIBLE_TABS_MISSING',
  'REQUIRED_TABS_TARGET_PAGE_MISSING',
  'REQUIRED_FILTER_SCOPE_MISSING',
  'REQUIRED_FILTER_FIELDS_MISSING',
  'REQUIRED_FILTER_TARGET_USE_MISMATCH',
  'FILTER_MANAGER_MISSING',
  'FILTER_MANAGER_TARGET_MISSING',
  'FILTER_MANAGER_FILTER_ITEM_UNBOUND',
  'FILTER_MANAGER_FILTER_PATH_UNRESOLVED',
  'CHART_QUERY_MODE_MISSING',
  'CHART_OPTION_MODE_MISSING',
  'CHART_BUILDER_COLLECTION_PATH_MISSING',
  'CHART_COLLECTION_PATH_SHAPE_INVALID',
  'CHART_BUILDER_MEASURES_MISSING',
  'CHART_SQL_DATASOURCE_MISSING',
  'CHART_SQL_TEXT_MISSING',
  'CHART_BASIC_OPTION_BUILDER_MISSING',
  'CHART_CUSTOM_OPTION_RAW_MISSING',
  'CHART_QUERY_CONFIG_MISPLACED_IN_RESOURCE_SETTINGS',
  'CHART_QUERY_ASSOCIATION_FIELD_TARGET_MISSING',
  'CHART_QUERY_RELATION_TARGET_FIELD_UNRESOLVED',
  'CHART_QUERY_FIELD_PATH_SHAPE_UNSUPPORTED',
  'GRID_CARD_ITEM_SUBMODEL_MISSING',
  'GRID_CARD_ITEM_USE_INVALID',
  'GRID_CARD_ITEM_GRID_MISSING_OR_INVALID',
  'GRID_CARD_BLOCK_ACTION_SLOT_USE_INVALID',
  'GRID_CARD_ITEM_ACTION_SLOT_USE_INVALID',
]);

const POPUP_INPUT_ARGS_FILTER_BY_TK = '{{ctx.view.inputArgs.filterByTk}}';

const PAGE_TAB_MODEL_USES = new Set(PAGE_TAB_USES);
const REQUIRED_FILTER_SCOPE_USES = [...PAGE_MODEL_USES_SET, ...PAGE_TAB_MODEL_USES];
const GRID_MODEL_USES = new Set(['BlockGridModel', 'FormGridModel']);
const LAYOUT_GRID_MODEL_USES = new Set([
  'AssignFormGridModel',
  'BlockGridModel',
  'DetailsGridModel',
  'FilterFormGridModel',
  'FormGridModel',
]);
const BUSINESS_BLOCK_MODEL_USES = new Set([
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
  // Common public blocks. Validation runs should pass allowedBusinessBlockUses from
  // the live instance schema inventory; this is a lightweight fallback only.
  'ActionPanelBlockModel',
  'ChartBlockModel',
  'CommentsBlockModel',
  'GridCardBlockModel',
  'IframeBlockModel',
  'ListBlockModel',
  'MapBlockModel',
  'JSBlockModel',
  'MarkdownBlockModel',
  'ReferenceBlockModel',
]);

function resolveBusinessBlockUses(requirements) {
  const declared = Array.isArray(requirements?.allowedBusinessBlockUses)
    ? requirements.allowedBusinessBlockUses
    : [];
  if (declared.length === 0) {
    return BUSINESS_BLOCK_MODEL_USES;
  }
  const set = new Set(
    declared
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  // Ensure core business blocks are always considered blocks for EMPTY_POPUP_GRID etc.
  [
    'FilterFormBlockModel',
    'TableBlockModel',
    'DetailsBlockModel',
    'CreateFormModel',
    'EditFormModel',
  ].forEach((use) => set.add(use));
  return set;
}
const FORM_BLOCK_MODEL_USES = new Set(['CreateFormModel', 'EditFormModel']);
const FORM_BLOCK_ACTION_MODEL_USES = new Set(['FormSubmitActionModel', 'JSFormActionModel']);
const CHART_QUERY_MODES = new Set(['builder', 'sql']);
const CHART_OPTION_MODES = new Set(['basic', 'custom']);
const COLLECTION_ACTION_MODEL_USES = new Set([
  'AddNewActionModel',
  'BulkDeleteActionModel',
  'ExpandCollapseActionModel',
  'FilterActionModel',
  'JSCollectionActionModel',
  'LinkActionModel',
  'PopupCollectionActionModel',
  'RefreshActionModel',
]);
const RECORD_ACTION_MODEL_USES = new Set([
  'AddChildActionModel',
  'DeleteActionModel',
  'EditActionModel',
  'JSRecordActionModel',
  'LinkActionModel',
  'PopupCollectionActionModel',
  'UpdateRecordActionModel',
  'ViewActionModel',
]);
const FILTER_FORM_ACTION_MODEL_USES = new Set([
  'FilterFormSubmitActionModel',
  'FilterFormResetActionModel',
  'FilterFormCollapseActionModel',
  'FilterFormJSActionModel',
]);
const GRID_CARD_ITEM_MODEL_USES = new Set(['GridCardItemModel']);
const ACTION_HOST_MODEL_USES = new Set(['TableBlockModel', 'DetailsBlockModel', 'GridCardBlockModel', 'GridCardItemModel']);
const EDIT_FORM_MODEL_USES = new Set(['EditFormModel']);
const CREATE_FORM_MODEL_USES = new Set(['CreateFormModel']);
const FILTER_CONTAINER_MODEL_USES = new Set(['TableBlockModel', 'DetailsBlockModel', 'CreateFormModel', 'EditFormModel']);
const COLLECTION_RESOURCE_BLOCK_MODEL_USES = new Set([
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
  'GridCardBlockModel',
  'ListBlockModel',
  'MapBlockModel',
  'CommentsBlockModel',
]);
const FIELD_MODELS_REQUIRING_ASSOCIATION_TARGET = new Set([
  'TableColumnModel',
  'FilterFormItemModel',
  'FormItemModel',
  'DetailsItemModel',
  'DisplayTextFieldModel',
  'FilterFormRecordSelectFieldModel',
]);
const DIRECT_ASSOCIATION_TEXT_FIELD_MODEL_USES = new Set(['DisplayTextFieldModel']);
const CLICKABLE_ASSOCIATION_TITLE_FIELD_MODEL_USES = new Set(['DisplayTextFieldModel']);
const JS_RELATION_WORKAROUND_MODEL_USES = new Set(['JSFieldModel', 'JSColumnModel']);
const CANONICALIZE_FOREIGN_KEY_DISPLAY_MODEL_USES = new Set([
  'DetailsItemModel',
  'DisplayTextFieldModel',
  'TableColumnModel',
]);
const CANONICALIZE_FOREIGN_KEY_ASSOCIATION_INPUT_MODEL_USES = new Set([
  'FilterFormItemModel',
  'FormItemModel',
]);
const FILTER_FORM_ASSOCIATION_FIELD_MODEL_USE = 'FilterFormRecordSelectFieldModel';
const FORM_ASSOCIATION_FIELD_MODEL_USE = 'RecordSelectFieldModel';
const DETAILS_LAYOUT_ONLY_MODEL_USES = new Set(['DetailsGridModel', 'BlockGridModel', 'FormGridModel']);
const INVALID_VISIBLE_TAB_ITEM_MODEL_USES = new Set([
  'RootPageModel',
  'PageModel',
  'ChildPageModel',
  'RootPageTabModel',
  'PageTabModel',
  'ChildPageTabModel',
  'BlockGridModel',
  'FormGridModel',
]);
const METADATA_TRUST_LEVELS = new Set([
  'live',
  'stable',
  'cache',
  'artifact',
  'unknown',
  'not-required',
]);
const FILTER_CONTRACT_SELECTOR_KINDS = new Set([
  'any',
  'none',
  'filterByTk',
  'association-context',
]);
const FILTER_CONTRACT_DATASCOPE_MODES = new Set([
  'any',
  'empty',
  'non-empty',
  'relation-derived',
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/flow_payload_guard.mjs build-filter (--condition-json <json> | --path <path> --operator <op> --value-json <json>) [--logic <$and|$or>]',
    '  node scripts/flow_payload_guard.mjs build-query-filter (--condition-json <json> | --path <path> --operator <op> --value-json <json>) [--logic <$and|$or>]',
    '  node scripts/flow_payload_guard.mjs extract-required-metadata (--payload-json <json> | --payload-file <path>) [(--metadata-json <json> | --metadata-file <path>)]',
    '  node scripts/flow_payload_guard.mjs canonicalize-payload (--payload-json <json> | --payload-file <path>) (--metadata-json <json> | --metadata-file <path>) [--mode general|validation-case]',
    '  node scripts/flow_payload_guard.mjs audit-payload (--payload-json <json> | --payload-file <path>) (--metadata-json <json> | --metadata-file <path>) [--mode general|validation-case] [(--requirements-json <json> | --requirements-file <path>)] [--nocobase-root <path>] [--snapshot-file <path>] [--risk-accept <CODE>]',
    '',
    `Default audit mode: ${DEFAULT_AUDIT_MODE}`,
  ].join('\n');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
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
  return typeof value === 'string' && value.trim() ? value.trim() : '';
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
    const resolvedPath = path.resolve(filePath);
    return parseJson(fs.readFileSync(resolvedPath, 'utf8'), `${label} file`);
  }
  throw new Error(`${label} input is required`);
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
    if (key === 'risk-accept') {
      const values = Array.isArray(flags[key]) ? flags[key] : [];
      values.push(next);
      flags[key] = values;
    } else {
      flags[key] = next;
    }
    index += 1;
  }
  return { command, flags };
}

function sortUniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function joinPath(basePath, segment) {
  if (segment === '') {
    return basePath;
  }
  if (typeof segment === 'number') {
    return `${basePath}[${segment}]`;
  }
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
    return `${basePath}.${segment}`;
  }
  return `${basePath}[${JSON.stringify(segment)}]`;
}

function walk(value, visitor, pathValue = '$', context = {}) {
  const nextContext = buildContext(value, context);
  visitor(value, pathValue, nextContext);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, joinPath(pathValue, index), nextContext));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walk(child, visitor, joinPath(pathValue, key), nextContext);
  }
}

function isPopupActionNode(node) {
  if (!isPlainObject(node) || typeof node.use !== 'string' || !node.use.endsWith('ActionModel')) {
    return false;
  }
  const openView = node.stepParams?.popupSettings?.openView;
  return isPlainObject(openView) || Boolean(node.subModels?.page);
}

function buildContext(node, parentContext) {
  const context = {
    ...parentContext,
  };
  if (!isPlainObject(node)) {
    return context;
  }

  const use = typeof node.use === 'string' ? node.use : parentContext.use;
  const resourceCollectionName = node.stepParams?.resourceSettings?.init?.collectionName || parentContext.resourceCollectionName;
  const currentPopupAction = isPopupActionNode(node)
    ? {
        use,
      }
    : null;
  const fieldInit = node.stepParams?.fieldSettings?.init;
  const fieldBinding = parentContext.fieldBinding ? { ...parentContext.fieldBinding } : null;
  if (fieldInit?.fieldPath) {
    context.fieldBinding = {
      collectionName: fieldInit.collectionName || resourceCollectionName || fieldBinding?.collectionName,
      fieldPath: fieldInit.fieldPath,
      associationPathName: fieldInit.associationPathName || fieldBinding?.associationPathName || null,
      path: fieldInit.path,
      sourceUse: use,
    };
  } else if (fieldBinding) {
    context.fieldBinding = fieldBinding;
  } else {
    context.fieldBinding = null;
  }
  context.use = use;
  context.resourceCollectionName = resourceCollectionName;
  context.ancestorPopupAction = parentContext.popupAction || null;
  context.popupAction = currentPopupAction || parentContext.popupAction || null;
  context.inTableColumn = use === 'TableColumnModel' || Boolean(parentContext.inTableColumn);
  return context;
}

function getEffectiveNodeUse(node, contextUse) {
  const bindingUse = typeof node?.stepParams?.fieldBinding?.use === 'string'
    ? node.stepParams.fieldBinding.use.trim()
    : '';
  if (bindingUse) {
    return bindingUse;
  }
  return typeof node?.use === 'string' && node.use.trim() ? node.use.trim() : contextUse;
}

function hasClickToOpenEnabled(node) {
  if (!isPlainObject(node)) {
    return false;
  }
  const clickToOpen = node.stepParams?.displayFieldSettings?.clickToOpen;
  if (clickToOpen === true) {
    return true;
  }
  if (isPlainObject(clickToOpen) && clickToOpen.clickToOpen === true) {
    return true;
  }
  return node.props?.clickToOpen === true;
}

function hasPopupOpenViewConfigured(node) {
  if (!isPlainObject(node)) {
    return false;
  }
  return isPlainObject(node.stepParams?.popupSettings?.openView) || isPlainObject(node.subModels?.page);
}

function hasExplicitJsIntent(requirements) {
  const intentTags = Array.isArray(requirements?.intentTags) ? requirements.intentTags : [];
  return intentTags.includes('js.explicit') || intentTags.includes('explicit-js');
}

function normalizeFilterLogic(logic) {
  const normalized = logic || '$and';
  if (normalized !== '$and' && normalized !== '$or') {
    throw new Error(`Unsupported filter logic "${normalized}"`);
  }
  return normalized;
}

function createUnsupportedFilterLogicFinding({ path: findingPath, mode, logic }) {
  return createFinding({
    severity: 'blocker',
    code: 'FILTER_LOGIC_UNSUPPORTED',
    message: `filter logic "${logic}" 不受支持；只允许 "$and" 或 "$or"。`,
    path: findingPath,
    mode,
    details: {
      logic,
    },
  });
}

function normalizeRequirementKind(value, label) {
  return normalizeNonEmpty(value, label).toLowerCase();
}

function normalizeRequiredActionScope(value, label) {
  const normalized = typeof value === 'string' && value.trim() ? value.trim() : 'either';
  if (
    normalized !== 'block-actions'
    && normalized !== 'row-actions'
    && normalized !== 'details-actions'
    && normalized !== 'either'
  ) {
    throw new Error(`${label} must be one of block-actions, row-actions, details-actions, either`);
  }
  return normalized;
}

function normalizeRequiredAction(entry, index) {
  if (!isPlainObject(entry)) {
    throw new Error(`requirements.requiredActions[${index}] must be an object`);
  }

  const kind = normalizeRequirementKind(entry.kind, `requirements.requiredActions[${index}].kind`);
  const collectionName = normalizeNonEmpty(
    entry.collectionName,
    `requirements.requiredActions[${index}].collectionName`,
  );
  const scope = normalizeRequiredActionScope(entry.scope, `requirements.requiredActions[${index}].scope`);

  if (
    kind !== 'create-popup'
    && kind !== 'view-record-popup'
    && kind !== 'edit-record-popup'
    && kind !== 'delete-record'
    && kind !== 'add-child-record-popup'
    && kind !== 'record-action'
  ) {
    throw new Error(`Unsupported required action kind "${kind}"`);
  }

  return {
    kind,
    collectionName,
    scope,
  };
}

function normalizeRequiredTab(entry, index) {
  if (!isPlainObject(entry)) {
    throw new Error(`requirements.requiredTabs[${index}] must be an object`);
  }

  const titles = Array.isArray(entry.titles)
    ? entry.titles
      .map((title, titleIndex) => normalizeNonEmpty(title, `requirements.requiredTabs[${index}].titles[${titleIndex}]`))
    : null;

  if (!titles || titles.length === 0) {
    throw new Error(`requirements.requiredTabs[${index}].titles must be a non-empty array`);
  }

  return {
    pageSignature: entry.pageSignature == null ? null : normalizeNonEmpty(entry.pageSignature, `requirements.requiredTabs[${index}].pageSignature`),
    pageUse: normalizePageUse(entry.pageUse, `requirements.requiredTabs[${index}].pageUse`, {
      allowNull: true,
    }),
    titles,
    requireBlockGrid: entry.requireBlockGrid !== false,
  };
}

function normalizeRequiredFilter(entry, index) {
  if (!isPlainObject(entry)) {
    throw new Error(`requirements.requiredFilters[${index}] must be an object`);
  }

  return {
    path: entry.path == null ? null : normalizeNonEmpty(entry.path, `requirements.requiredFilters[${index}].path`),
    pageSignature: entry.pageSignature == null
      ? null
      : normalizeNonEmpty(entry.pageSignature, `requirements.requiredFilters[${index}].pageSignature`),
    pageUse: normalizePageUse(entry.pageUse, `requirements.requiredFilters[${index}].pageUse`, {
      allowNull: true,
      supportedUses: REQUIRED_FILTER_SCOPE_USES,
    }),
    tabTitle: typeof entry.tabTitle === 'string' && entry.tabTitle.trim()
      ? entry.tabTitle.trim()
      : '',
    collectionName: typeof entry.collectionName === 'string' && entry.collectionName.trim()
      ? entry.collectionName.trim()
      : '',
    fields: [...new Set(
      (Array.isArray(entry.fields) ? entry.fields : [])
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    )],
    targetUses: [...new Set(
      (Array.isArray(entry.targetUses) ? entry.targetUses : [])
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    )],
  };
}

function normalizeMetadataTrustLevel(value, label, { allowNull = false, fallbackValue = null } = {}) {
  if (value == null || value === '') {
    if (allowNull) {
      return fallbackValue;
    }
    throw new Error(`${label} is required`);
  }
  const normalized = normalizeNonEmpty(value, label);
  if (!METADATA_TRUST_LEVELS.has(normalized)) {
    throw new Error(`${label} must be one of ${[...METADATA_TRUST_LEVELS].join(', ')}`);
  }
  return normalized;
}

function normalizeExpectedFilterContract(entry, index) {
  if (!isPlainObject(entry)) {
    throw new Error(`requirements.expectedFilterContracts[${index}] must be an object`);
  }

  const uid = entry.uid == null ? null : normalizeNonEmpty(entry.uid, `requirements.expectedFilterContracts[${index}].uid`);
  const pathValue = entry.path == null ? null : normalizeNonEmpty(entry.path, `requirements.expectedFilterContracts[${index}].path`);
  const use = entry.use == null ? null : normalizeNonEmpty(entry.use, `requirements.expectedFilterContracts[${index}].use`);
  const collectionName = entry.collectionName == null
    ? null
    : normalizeNonEmpty(entry.collectionName, `requirements.expectedFilterContracts[${index}].collectionName`);
  if (!uid && !pathValue && !use && !collectionName) {
    throw new Error(`requirements.expectedFilterContracts[${index}] must declare at least one matcher: uid/path/use/collectionName`);
  }

  const selectorKind = entry.selectorKind == null
    ? 'any'
    : normalizeNonEmpty(entry.selectorKind, `requirements.expectedFilterContracts[${index}].selectorKind`);
  if (!FILTER_CONTRACT_SELECTOR_KINDS.has(selectorKind)) {
    throw new Error(`requirements.expectedFilterContracts[${index}].selectorKind must be one of ${[...FILTER_CONTRACT_SELECTOR_KINDS].join(', ')}`);
  }

  const dataScopeMode = entry.dataScopeMode == null
    ? 'any'
    : normalizeNonEmpty(entry.dataScopeMode, `requirements.expectedFilterContracts[${index}].dataScopeMode`);
  if (!FILTER_CONTRACT_DATASCOPE_MODES.has(dataScopeMode)) {
    throw new Error(`requirements.expectedFilterContracts[${index}].dataScopeMode must be one of ${[...FILTER_CONTRACT_DATASCOPE_MODES].join(', ')}`);
  }

  return {
    uid,
    path: pathValue,
    use,
    collectionName,
    selectorKind,
    dataScopeMode,
    allowNonEmptyDataScope: entry.allowNonEmptyDataScope === true
      || dataScopeMode === 'non-empty'
      || dataScopeMode === 'relation-derived',
    metadataTrust: entry.metadataTrust == null
      ? null
      : normalizeMetadataTrustLevel(
        entry.metadataTrust,
        `requirements.expectedFilterContracts[${index}].metadataTrust`,
        { allowNull: true, fallbackValue: null },
      ),
  };
}

function normalizeRequirements(rawRequirements = {}) {
  if (rawRequirements == null) {
    return {
      requiredActions: [],
      requiredTabs: [],
      requiredFilters: [],
      expectedFilterContracts: [],
      allowedBusinessBlockUses: [],
      intentTags: [],
      metadataTrust: {
        runtimeSensitive: null,
      },
    };
  }
  if (!isPlainObject(rawRequirements)) {
    throw new Error('requirements must be an object');
  }

  const rawRequiredActions = rawRequirements.requiredActions;
  if (rawRequiredActions != null && !Array.isArray(rawRequiredActions)) {
    throw new Error('requirements.requiredActions must be an array');
  }

  const rawRequiredTabs = rawRequirements.requiredTabs;
  if (rawRequiredTabs != null && !Array.isArray(rawRequiredTabs)) {
    throw new Error('requirements.requiredTabs must be an array');
  }
  const rawRequiredFilters = rawRequirements.requiredFilters;
  if (rawRequiredFilters != null && !Array.isArray(rawRequiredFilters)) {
    throw new Error('requirements.requiredFilters must be an array');
  }
  const rawExpectedFilterContracts = rawRequirements.expectedFilterContracts;
  if (rawExpectedFilterContracts != null && !Array.isArray(rawExpectedFilterContracts)) {
    throw new Error('requirements.expectedFilterContracts must be an array');
  }
  const rawAllowedBusinessBlockUses = rawRequirements.allowedBusinessBlockUses;
  if (rawAllowedBusinessBlockUses != null && !Array.isArray(rawAllowedBusinessBlockUses)) {
    throw new Error('requirements.allowedBusinessBlockUses must be an array');
  }
  const rawIntentTags = rawRequirements.intentTags;
  if (rawIntentTags != null && !Array.isArray(rawIntentTags)) {
    throw new Error('requirements.intentTags must be an array');
  }
  const rawMetadataTrust = rawRequirements.metadataTrust;
  if (
    rawMetadataTrust != null
    && typeof rawMetadataTrust !== 'string'
    && !isPlainObject(rawMetadataTrust)
  ) {
    throw new Error('requirements.metadataTrust must be a string or object');
  }

  const metadataTrust = typeof rawMetadataTrust === 'string'
    ? {
      runtimeSensitive: normalizeMetadataTrustLevel(
        rawMetadataTrust,
        'requirements.metadataTrust',
        { allowNull: true, fallbackValue: null },
      ),
    }
    : {
      runtimeSensitive: rawMetadataTrust?.runtimeSensitive == null
        ? null
        : normalizeMetadataTrustLevel(
          rawMetadataTrust.runtimeSensitive,
          'requirements.metadataTrust.runtimeSensitive',
          { allowNull: true, fallbackValue: null },
        ),
    };

  return {
    requiredActions: Array.isArray(rawRequiredActions)
      ? rawRequiredActions.map((entry, index) => normalizeRequiredAction(entry, index))
      : [],
    requiredTabs: Array.isArray(rawRequiredTabs)
      ? rawRequiredTabs.map((entry, index) => normalizeRequiredTab(entry, index))
      : [],
    requiredFilters: Array.isArray(rawRequiredFilters)
      ? rawRequiredFilters.map((entry, index) => normalizeRequiredFilter(entry, index))
      : [],
    expectedFilterContracts: Array.isArray(rawExpectedFilterContracts)
      ? rawExpectedFilterContracts.map((entry, index) => normalizeExpectedFilterContract(entry, index))
      : [],
    allowedBusinessBlockUses: [...new Set(
      (Array.isArray(rawAllowedBusinessBlockUses) ? rawAllowedBusinessBlockUses : [])
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    )],
    intentTags: [...new Set(
      (Array.isArray(rawIntentTags) ? rawIntentTags : [])
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    )],
    metadataTrust,
  };
}

export function buildFilterGroup({ logic = '$and', condition }) {
  const normalizedLogic = normalizeFilterLogic(logic);
  if (!isPlainObject(condition)) {
    throw new Error('condition must be an object');
  }
  const pathValue = normalizeNonEmpty(condition.path, 'condition.path');
  const operator = normalizeNonEmpty(condition.operator, 'condition.operator');
  return {
    filter: {
      logic: normalizedLogic,
      items: [
        {
          path: pathValue,
          operator,
          value: condition.value,
        },
      ],
    },
  };
}

export function buildQueryFilter({ logic = '$and', condition }) {
  return {
    filter: transformFilterGroupToQueryFilter(buildFilterGroup({ logic, condition }).filter),
  };
}

function createFinding({ severity, code, message, path: findingPath, mode, accepted = false, details, dedupeKey }) {
  return {
    severity,
    code,
    message,
    path: findingPath,
    mode,
    accepted,
    details,
    dedupeKey: dedupeKey || `${code}:${findingPath}`,
  };
}

function pushFinding(target, seen, finding) {
  if (seen.has(finding.dedupeKey)) {
    return;
  }
  seen.add(finding.dedupeKey);
  const sanitized = { ...finding };
  delete sanitized.dedupeKey;
  target.push(sanitized);
}

function pushExternalFinding(target, seen, finding, mode) {
  if (!isPlainObject(finding) || typeof finding.code !== 'string' || typeof finding.path !== 'string') {
    return;
  }
  const dedupeKey = [
    finding.code,
    finding.path,
    finding.modelUse || '',
    finding.line || '',
    finding.column || '',
    finding.message || '',
  ].join(':');
  if (seen.has(dedupeKey)) {
    return;
  }
  seen.add(dedupeKey);
  target.push({
    ...finding,
    mode,
  });
}

function normalizeCollectionField(field) {
  if (!isPlainObject(field)) {
    return null;
  }
  const options = isPlainObject(field.options) ? field.options : {};
  const name = field.name || options.name;
  if (!name) {
    return null;
  }
  return {
    name,
    type: field.type || options.type,
    interface: field.interface || options.interface,
    target: field.target || options.target,
    foreignKey: field.foreignKey || options.foreignKey,
    targetKey: field.targetKey || options.targetKey,
  };
}

function normalizeFlowSubType(value, fallbackValue = '') {
  if (value === 'array' || value === 'object') {
    return value;
  }
  return fallbackValue;
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
      child.forEach((item, index) => {
        walkFlowModelTree(item, visitor, `${pathValue}.subModels.${subKey}[${index}]`, {
          parentUid: currentUid,
          parentUse: currentUse,
          subKey,
          subType: 'array',
        });
      });
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

function normalizeLiveTopology(rawLiveTopology) {
  const byUid = new Map();
  if (!rawLiveTopology) {
    return {
      source: '',
      byUid,
      nodeCount: 0,
    };
  }

  const source = normalizeOptionalText(rawLiveTopology.source);
  const rawEntries = Array.isArray(rawLiveTopology.entries)
    ? rawLiveTopology.entries
    : [];
  const rawByUid = isPlainObject(rawLiveTopology.byUid)
    ? rawLiveTopology.byUid
    : (isPlainObject(rawLiveTopology) ? rawLiveTopology : null);

  const pushEntry = (uidValue, rawEntry) => {
    const uid = normalizeOptionalText(uidValue || rawEntry?.uid);
    if (!uid) {
      return;
    }
    byUid.set(uid, {
      uid,
      path: normalizeOptionalText(rawEntry?.path),
      use: normalizeOptionalText(rawEntry?.use),
      parentId: normalizeOptionalText(rawEntry?.parentId),
      subKey: normalizeOptionalText(rawEntry?.subKey),
      subType: normalizeFlowSubType(rawEntry?.subType, ''),
    });
  };

  rawEntries.forEach((entry) => {
    if (!isPlainObject(entry)) {
      return;
    }
    pushEntry(entry.uid, entry);
  });

  if (rawByUid) {
    Object.entries(rawByUid).forEach(([uid, entry]) => {
      if (!isPlainObject(entry)) {
        return;
      }
      pushEntry(uid, entry);
    });
  }

  return {
    source,
    byUid,
    nodeCount: byUid.size,
  };
}

function normalizeMetadata(rawMetadata = {}) {
  const rawCollections = rawMetadata.collections;
  const collections = {};

  if (Array.isArray(rawCollections)) {
    for (const entry of rawCollections) {
      if (!isPlainObject(entry) || !entry.name) {
        continue;
      }
      collections[entry.name] = entry;
    }
  } else if (isPlainObject(rawCollections)) {
    Object.assign(collections, rawCollections);
  }

  const normalizedCollections = {};
  for (const [collectionName, rawCollection] of Object.entries(collections)) {
    const entry = isPlainObject(rawCollection) ? rawCollection : {};
    const options = isPlainObject(entry.options) ? entry.options : {};
    const values = isPlainObject(entry.values) ? entry.values : {};
    const fields = Array.isArray(entry.fields)
      ? entry.fields.map(normalizeCollectionField).filter(Boolean)
      : [];
    const fieldsByName = new Map(fields.map((field) => [field.name, field]));
    const associationsByForeignKey = new Map();
    for (const field of fields) {
      if (field.foreignKey && field.name !== field.foreignKey) {
        associationsByForeignKey.set(field.foreignKey, field);
      }
    }
    normalizedCollections[collectionName] = {
      name: collectionName,
      titleField: entry.titleField || values.titleField || options.titleField || null,
      filterTargetKey: entry.filterTargetKey ?? values.filterTargetKey ?? options.filterTargetKey ?? null,
      fields,
      fieldsByName,
      associationsByForeignKey,
    };
  }

  return {
    collections: normalizedCollections,
    liveTopology: normalizeLiveTopology(
      rawMetadata.liveTopology
      || rawMetadata.liveFlowTopology
      || rawMetadata.liveTreeTopology,
    ),
  };
}

function cloneJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function resolveFlowNodeLocator(node, parentLink) {
  return {
    uid: normalizeOptionalText(node?.uid),
    use: normalizeOptionalText(node?.use),
    parentId: normalizeOptionalText(node?.parentId) || normalizeOptionalText(parentLink?.parentUid),
    subKey: normalizeOptionalText(node?.subKey) || normalizeOptionalText(parentLink?.subKey),
    subType: normalizeFlowSubType(node?.subType, normalizeFlowSubType(parentLink?.subType, '')),
  };
}

function collectGridLayoutMembership(gridNode) {
  const itemDescriptors = (Array.isArray(gridNode?.subModels?.items) ? gridNode.subModels.items : [])
    .filter((item) => isPlainObject(item))
    .map((item, index) => ({
      index,
      uid: normalizeOptionalText(item.uid),
      use: normalizeOptionalText(item.use),
    }));
  const itemUids = itemDescriptors
    .map((item) => item.uid)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const itemUidSet = new Set(itemUids);

  const rawGridSettings = isPlainObject(gridNode?.stepParams?.gridSettings?.grid)
    ? gridNode.stepParams.gridSettings.grid
    : null;
  const rawRows = isPlainObject(rawGridSettings?.rows) ? rawGridSettings.rows : null;
  const rawRowOrder = Array.isArray(rawGridSettings?.rowOrder) ? rawGridSettings.rowOrder : [];
  const rowOrder = rawRowOrder
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());

  const layoutItemUids = [];
  if (rawRows) {
    Object.values(rawRows).forEach((columns) => {
      if (!Array.isArray(columns)) {
        return;
      }
      columns.forEach((column) => {
        const uidGroup = Array.isArray(column) ? column : [column];
        uidGroup.forEach((value) => {
          const uid = normalizeOptionalText(value);
          if (uid) {
            layoutItemUids.push(uid);
          }
        });
      });
    });
  }

  const sortedLayoutItemUids = layoutItemUids.sort((left, right) => left.localeCompare(right));
  return {
    hasExplicitLayout: Boolean(rawRows),
    itemDescriptors,
    itemUids,
    itemUidSet,
    layoutItemUids: sortedLayoutItemUids,
    layoutUidSet: new Set(sortedLayoutItemUids),
    rowOrder,
  };
}

function getCollectionMeta(metadata, collectionName) {
  if (!collectionName) {
    return null;
  }
  return metadata.collections[collectionName] || null;
}

function inspectRequiredMetadataCoverage(requiredMetadata, metadata, mode, blockers, seen) {
  for (const collectionRef of requiredMetadata.collectionRefs) {
    const collectionMeta = getCollectionMeta(metadata, collectionRef.collectionName);
    if (collectionMeta) {
      continue;
    }
    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'REQUIRED_COLLECTION_METADATA_MISSING',
      message: `payload 依赖 collection "${collectionRef.collectionName}" 的元数据，但当前 metadata 未提供。`,
      path: collectionRef.path,
      mode,
      dedupeKey: `REQUIRED_COLLECTION_METADATA_MISSING:${collectionRef.collectionName}`,
      details: collectionRef,
    }));
  }
}

function isAssociationField(field) {
  if (!field) {
    return false;
  }
  return Boolean(
    field.target
      || field.foreignKey
      || field.type === 'belongsTo'
      || field.type === 'hasMany'
      || field.type === 'hasOne'
      || field.interface === 'm2o'
      || field.interface === 'o2m',
  );
}

function findAssociationFieldToTarget(collectionMeta, targetCollectionName) {
  if (!collectionMeta || !targetCollectionName) {
    return null;
  }
  return collectionMeta.fields.find((field) => isAssociationField(field) && field.target === targetCollectionName) || null;
}

function isBelongsToLikeField(field) {
  if (!field) {
    return false;
  }
  return field.type === 'belongsTo' || field.interface === 'm2o';
}

function isScalarComparisonOperator(operator) {
  return typeof operator === 'string' && operator !== '$exists' && operator !== '$notExists';
}

function getBelongsToScalarPathHints(field) {
  if (!isBelongsToLikeField(field)) {
    return null;
  }

  const foreignKey = typeof field.foreignKey === 'string' && field.foreignKey.trim()
    ? field.foreignKey.trim()
    : null;
  const targetKey = typeof field.targetKey === 'string' && field.targetKey.trim()
    ? field.targetKey.trim()
    : null;
  const suggestedPaths = [];
  if (foreignKey) {
    suggestedPaths.push(foreignKey);
  }
  if (targetKey) {
    suggestedPaths.push(`${field.name}.${targetKey}`);
  }

  return {
    associationField: field.name,
    foreignKey,
    targetCollection: field.target || null,
    targetKey,
    suggestedPaths: [...new Set(suggestedPaths)],
  };
}

function findAssociationFieldByAssociationName(collectionMeta, associationName) {
  if (!collectionMeta || typeof associationName !== 'string') {
    return null;
  }
  const normalized = associationName.trim();
  if (!normalized) {
    return null;
  }

  const directField = collectionMeta.fieldsByName.get(normalized);
  if (directField) {
    return directField;
  }

  const collectionPrefix = `${collectionMeta.name}.`;
  if (normalized.startsWith(collectionPrefix)) {
    return collectionMeta.fieldsByName.get(normalized.slice(collectionPrefix.length)) || null;
  }

  return null;
}

function resolveFieldPathInMetadata(metadata, collectionName, fieldPath) {
  if (!collectionName || typeof fieldPath !== 'string') {
    return null;
  }
  const segments = fieldPath
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  let currentCollection = getCollectionMeta(metadata, collectionName);
  if (!currentCollection) {
    return null;
  }

  let field = null;
  let previousAssociationField = null;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    field = currentCollection.fieldsByName.get(segment) || null;
    if (!field) {
      const expectedTargetKey = previousAssociationField?.targetKey;
      if (
        index === segments.length - 1
        && typeof expectedTargetKey === 'string'
        && expectedTargetKey.trim()
        && expectedTargetKey.trim() === segment
      ) {
        return {
          field: {
            name: segment,
            type: null,
            interface: null,
            target: null,
            foreignKey: null,
            targetKey: null,
          },
          collection: currentCollection,
        };
      }
      return null;
    }
    if (index === segments.length - 1) {
      return {
        field,
        collection: currentCollection,
      };
    }
    if (!field.target) {
      return null;
    }
    previousAssociationField = field;
    currentCollection = getCollectionMeta(metadata, field.target);
    if (!currentCollection) {
      return null;
    }
  }

  return null;
}

function getExpectedAssociationPathName(metadata, collectionName, fieldPath) {
  if (!collectionName || typeof fieldPath !== 'string') {
    return null;
  }
  const segments = fieldPath
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  let currentCollection = getCollectionMeta(metadata, collectionName);
  if (!currentCollection) {
    return null;
  }

  const associationSegments = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const field = currentCollection.fieldsByName.get(segment) || null;
    if (!field || !isAssociationField(field) || !field.target) {
      return null;
    }
    associationSegments.push(segment);
    currentCollection = getCollectionMeta(metadata, field.target);
    if (!currentCollection) {
      return null;
    }
  }

  return associationSegments.join('.');
}

function getStableDisplayFieldBinding(metadata, collectionName) {
  const collectionMeta = getCollectionMeta(metadata, collectionName);
  if (!collectionMeta) {
    return null;
  }

  const candidatePaths = [];
  const pushCandidate = (value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return;
    }
    const normalized = value.trim();
    if (!candidatePaths.includes(normalized)) {
      candidatePaths.push(normalized);
    }
  };

  pushCandidate(collectionMeta.titleField);
  pushCandidate(collectionMeta.filterTargetKey);

  if (candidatePaths.length === 0) {
    const scalarFields = collectionMeta.fields.filter((field) => !isAssociationField(field));
    if (scalarFields.length === 1) {
      pushCandidate(scalarFields[0].name);
    }
  }

  for (const candidatePath of candidatePaths) {
    const resolved = resolveFieldPathInMetadata(metadata, collectionName, candidatePath);
    if (!resolved) {
      continue;
    }
    if (isSimpleFieldName(candidatePath) && isAssociationField(resolved.field)) {
      continue;
    }
    return {
      collectionName,
      fieldPath: candidatePath,
      associationPathName: getExpectedAssociationPathName(metadata, collectionName, candidatePath) || null,
    };
  }

  return null;
}

function getSuggestedScalarFieldPath(metadata, collectionName) {
  const collectionMeta = getCollectionMeta(metadata, collectionName);
  if (!collectionMeta) {
    return null;
  }

  const candidates = [
    collectionMeta.titleField,
    'name',
    'nickname',
    'title',
    'label',
    'code',
    collectionMeta.filterTargetKey,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      continue;
    }
    const resolved = resolveFieldPathInMetadata(metadata, collectionName, candidate);
    if (!resolved || isAssociationField(resolved.field)) {
      continue;
    }
    return candidate;
  }

  return null;
}

function getAssociationInputTitleFallback(metadata, collectionName, fieldPath) {
  if (!collectionName || !isSimpleFieldName(fieldPath)) {
    return null;
  }

  const resolved = resolveFieldPathInMetadata(metadata, collectionName, fieldPath);
  if (!resolved || !isAssociationField(resolved.field) || !resolved.field.target) {
    return null;
  }

  const targetCollectionMeta = getCollectionMeta(metadata, resolved.field.target);
  if (!targetCollectionMeta || targetCollectionMeta.titleField) {
    return null;
  }

  const labelField = getSuggestedScalarFieldPath(metadata, resolved.field.target);
  if (!labelField) {
    return null;
  }

  return {
    targetCollection: resolved.field.target,
    labelField,
    valueField: resolved.field.targetKey || targetCollectionMeta.filterTargetKey || 'id',
  };
}

function getCanonicalFilterPathFromLegacyField(metadata, collectionName, fieldValue) {
  if (!collectionName || typeof fieldValue !== 'string') {
    return null;
  }
  const normalized = fieldValue.trim();
  if (!normalized || hasTemplateExpression(normalized)) {
    return null;
  }
  if (resolveFieldPathInMetadata(metadata, collectionName, normalized)) {
    return normalized;
  }
  const collectionMeta = getCollectionMeta(metadata, collectionName);
  if (collectionMeta && isSimpleFieldName(normalized) && collectionMeta.associationsByForeignKey.has(normalized)) {
    return normalized;
  }
  return null;
}

function getForeignKeyDisplayBinding(metadata, collectionName, foreignKey) {
  if (!collectionName || typeof foreignKey !== 'string' || !isSimpleFieldName(foreignKey)) {
    return null;
  }

  const collectionMeta = getCollectionMeta(metadata, collectionName);
  const associationField = collectionMeta?.associationsByForeignKey.get(foreignKey) || null;
  if (!associationField?.target) {
    return null;
  }

  const targetDisplayBinding = getStableDisplayFieldBinding(metadata, associationField.target);
  if (!targetDisplayBinding) {
    return null;
  }

  const fieldPath = `${associationField.name}.${targetDisplayBinding.fieldPath}`;
  const associationPathName = getExpectedAssociationPathName(metadata, collectionName, fieldPath);
  if (!associationPathName) {
    return null;
  }

  return {
    collectionName,
    fieldPath,
    associationPathName,
    associationField: associationField.name,
    targetCollection: associationField.target,
  };
}

function getForeignKeyAssociationBinding(metadata, collectionName, foreignKey) {
  if (!collectionName || typeof foreignKey !== 'string' || !isSimpleFieldName(foreignKey)) {
    return null;
  }

  const collectionMeta = getCollectionMeta(metadata, collectionName);
  const associationField = collectionMeta?.associationsByForeignKey.get(foreignKey) || null;
  if (!associationField?.target) {
    return null;
  }

  const targetCollectionMeta = getCollectionMeta(metadata, associationField.target);
  return {
    collectionName,
    fieldPath: associationField.name,
    associationField,
    targetCollection: associationField.target,
    targetTitleField: targetCollectionMeta?.titleField || targetCollectionMeta?.filterTargetKey || null,
  };
}

function normalizeFilterTargetKeyValue(value) {
  if (Array.isArray(value)) {
    return normalizeFilterTargetKeyValue(value[0]);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
}

function normalizeRecordContextFilterExpression(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, '');
}

function buildRecordContextFilterByTk(metadata, collectionName) {
  const collectionMeta = getCollectionMeta(metadata, collectionName);
  return buildRecordContextFilterByTkTemplate(collectionMeta?.filterTargetKey, {
    fallback: RECORD_CONTEXT_FILTER_BY_TK,
  });
}

function matchesRecordContextFilterByTk(value, expected) {
  if (typeof expected === 'string') {
    return (
      typeof value === 'string'
      && normalizeRecordContextFilterExpression(value) === normalizeRecordContextFilterExpression(expected)
    );
  }
  if (!isPlainObject(value) || !isPlainObject(expected)) {
    return false;
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    return false;
  }
  return expectedKeys.every((fieldName) => (
    normalizeRecordContextFilterExpression(value[fieldName])
    === normalizeRecordContextFilterExpression(expected[fieldName])
  ));
}

function isLegacyRecordIdFilterByTk(value) {
  return (
    typeof value === 'string'
    && normalizeRecordContextFilterExpression(value) === RECORD_CONTEXT_FILTER_BY_TK
  );
}

function getAssociationFilterTargetKey(metadata, associationField) {
  if (!associationField?.target) {
    return 'id';
  }
  const targetCollectionMeta = getCollectionMeta(metadata, associationField.target);
  return (
    normalizeFilterTargetKeyValue(targetCollectionMeta?.filterTargetKey)
    || normalizeFilterTargetKeyValue(associationField.targetKey)
    || 'id'
  );
}

function resolveFilterManagerFilterPaths(metadata, collectionName, fieldPath) {
  if (!collectionName || typeof fieldPath !== 'string') {
    return null;
  }
  const normalizedFieldPath = fieldPath.trim();
  if (!normalizedFieldPath || hasTemplateExpression(normalizedFieldPath)) {
    return null;
  }

  const resolved = resolveFieldPathInMetadata(metadata, collectionName, normalizedFieldPath);
  if (!resolved) {
    return null;
  }

  if (isSimpleFieldName(normalizedFieldPath) && resolved.field?.target) {
    return [`${normalizedFieldPath}.${getAssociationFilterTargetKey(metadata, resolved.field)}`];
  }

  return [normalizedFieldPath];
}

function normalizeFilterManagerConfigs(filterManager) {
  if (!Array.isArray(filterManager)) {
    return [];
  }

  return filterManager
    .filter((item) => isPlainObject(item))
    .map((item) => ({
      filterId: typeof item.filterId === 'string' ? item.filterId.trim() : '',
      targetId: typeof item.targetId === 'string' ? item.targetId.trim() : '',
      filterPaths: sortUniqueStrings(item.filterPaths),
    }))
    .filter((item) => item.filterId && item.targetId && item.filterPaths.length > 0)
    .sort((left, right) => (
      left.filterId.localeCompare(right.filterId)
      || left.targetId.localeCompare(right.targetId)
      || JSON.stringify(left.filterPaths).localeCompare(JSON.stringify(right.filterPaths))
    ));
}

function collectGridFilterManagerState(gridNode, pathValue, metadata) {
  const directItems = Array.isArray(gridNode?.subModels?.items) ? gridNode.subModels.items : [];
  const targetNodesByUid = new Map();
  const filterItems = [];

  directItems.forEach((itemNode, itemIndex) => {
    if (!isPlainObject(itemNode) || typeof itemNode.use !== 'string') {
      return;
    }

    if (FILTER_CONTAINER_MODEL_USES.has(itemNode.use) && typeof itemNode.uid === 'string' && itemNode.uid.trim()) {
      targetNodesByUid.set(itemNode.uid.trim(), {
        uid: itemNode.uid.trim(),
        use: itemNode.use,
        path: `${pathValue}.subModels.items[${itemIndex}]`,
        collectionName: itemNode.stepParams?.resourceSettings?.init?.collectionName || null,
      });
    }

    if (itemNode.use !== 'FilterFormBlockModel') {
      return;
    }

    const filterFormItems = Array.isArray(itemNode?.subModels?.grid?.subModels?.items)
      ? itemNode.subModels.grid.subModels.items
      : [];

    filterFormItems.forEach((filterItemNode, filterIndex) => {
      if (!isPlainObject(filterItemNode) || filterItemNode.use !== 'FilterFormItemModel') {
        return;
      }

      const itemPath = `${pathValue}.subModels.items[${itemIndex}].subModels.grid.subModels.items[${filterIndex}]`;
      const filterId = typeof filterItemNode.uid === 'string' ? filterItemNode.uid.trim() : '';
      const fieldInit = filterItemNode.stepParams?.fieldSettings?.init;
      const defaultTargetUid = typeof filterItemNode.stepParams?.filterFormItemSettings?.init?.defaultTargetUid === 'string'
        ? filterItemNode.stepParams.filterFormItemSettings.init.defaultTargetUid.trim()
        : '';
      const collectionName = fieldInit?.collectionName || null;
      const fieldPath = typeof fieldInit?.fieldPath === 'string' ? fieldInit.fieldPath.trim() : '';

      filterItems.push({
        uid: filterId,
        path: itemPath,
        defaultTargetUid,
        collectionName,
        fieldPath,
        expectedFilterPaths: resolveFilterManagerFilterPaths(metadata, collectionName, fieldPath),
      });
    });
  });

  return {
    filterItems,
    targetNodesByUid,
    existingConfigs: normalizeFilterManagerConfigs(gridNode?.filterManager),
  };
}

function collectFilterConditions(filter, results = []) {
  if (!isPlainObject(filter) || !Array.isArray(filter.items)) {
    return results;
  }
  for (const item of filter.items) {
    if (!isPlainObject(item)) {
      continue;
    }
    if (typeof item.path === 'string' && typeof item.operator === 'string') {
      results.push(item);
      continue;
    }
    if (typeof item.logic === 'string' && Array.isArray(item.items)) {
      collectFilterConditions(item, results);
    }
  }
  return results;
}

function getFilterContainerDataScopeFilter(node) {
  return node?.stepParams?.tableSettings?.dataScope?.filter
    || node?.stepParams?.detailsSettings?.dataScope?.filter
    || node?.stepParams?.formSettings?.dataScope?.filter
    || null;
}

function hasAssociationContextProtocol(initOptions) {
  return Boolean(
    typeof initOptions?.associationName === 'string'
    && initOptions.associationName.trim()
    && Object.hasOwn(initOptions, 'sourceId')
    && initOptions.sourceId !== undefined
    && initOptions.sourceId !== null
    && String(initOptions.sourceId).trim() !== '',
  );
}

function getFilterContainerSelectorKind(node) {
  const initOptions = isPlainObject(node?.stepParams?.resourceSettings?.init)
    ? node.stepParams.resourceSettings.init
    : {};
  if (hasAssociationContextProtocol(initOptions)) {
    return 'association-context';
  }
  if (Object.hasOwn(initOptions, 'filterByTk') && initOptions.filterByTk !== undefined && initOptions.filterByTk !== null && String(initOptions.filterByTk).trim() !== '') {
    return 'filterByTk';
  }
  return 'none';
}

function findMatchingExpectedFilterContract(node, pathValue, requirements) {
  const contracts = Array.isArray(requirements?.expectedFilterContracts)
    ? requirements.expectedFilterContracts
    : [];
  const uid = typeof node?.uid === 'string' && node.uid.trim() ? node.uid.trim() : null;
  const use = typeof node?.use === 'string' && node.use.trim() ? node.use.trim() : null;
  const collectionName = typeof node?.stepParams?.resourceSettings?.init?.collectionName === 'string'
    && node.stepParams.resourceSettings.init.collectionName.trim()
    ? node.stepParams.resourceSettings.init.collectionName.trim()
    : null;

  return contracts.find((contract) => {
    if (!isPlainObject(contract)) {
      return false;
    }
    if (contract.uid && contract.uid !== uid) {
      return false;
    }
    if (contract.path && contract.path !== pathValue) {
      return false;
    }
    if (contract.use && contract.use !== use) {
      return false;
    }
    if (contract.collectionName && contract.collectionName !== collectionName) {
      return false;
    }
    return true;
  }) || null;
}

function getMetadataTrustLevelWeight(level) {
  switch (level) {
    case 'live':
      return 6;
    case 'stable':
      return 5;
    case 'cache':
      return 4;
    case 'artifact':
      return 3;
    case 'unknown':
      return 2;
    case 'not-required':
      return 1;
    default:
      return 0;
  }
}

function isMetadataTrustSufficient(actualLevel, requiredLevel) {
  if (!requiredLevel || requiredLevel === 'not-required') {
    return true;
  }
  return getMetadataTrustLevelWeight(actualLevel) >= getMetadataTrustLevelWeight(requiredLevel);
}

function getAssociationInputFieldModelNode(node) {
  if (node?.use === FORM_ASSOCIATION_FIELD_MODEL_USE) {
    return node;
  }
  if (isPlainObject(node?.subModels?.field) && node.subModels.field.use === FORM_ASSOCIATION_FIELD_MODEL_USE) {
    return node.subModels.field;
  }
  return null;
}

function getFirstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getAssociationInputRuntimeSelection({
  node,
  associationFieldModelNode,
  fallback,
  targetCollectionMeta,
  targetKeyFallback,
}) {
  const explicitTitleField = getFirstNonEmptyString(
    associationFieldModelNode?.props?.titleField,
    associationFieldModelNode?.props?.fieldNames?.label,
    node?.props?.titleField,
    node?.stepParams?.editItemSettings?.titleField?.titleField,
  );
  const effectiveTitleField = getFirstNonEmptyString(
    explicitTitleField,
    targetCollectionMeta?.titleField,
    fallback?.labelField,
    normalizeFilterTargetKeyValue(targetCollectionMeta?.filterTargetKey),
  );
  const effectiveValueField = getFirstNonEmptyString(
    associationFieldModelNode?.props?.fieldNames?.value,
    targetKeyFallback,
    normalizeFilterTargetKeyValue(targetCollectionMeta?.filterTargetKey),
    'id',
  );

  return {
    explicitTitleField,
    effectiveTitleField,
    effectiveValueField,
    explicitFieldNamesLabel: getFirstNonEmptyString(associationFieldModelNode?.props?.fieldNames?.label),
    explicitFieldNamesValue: getFirstNonEmptyString(associationFieldModelNode?.props?.fieldNames?.value),
  };
}

function usesPopupInputArgsFilterByTk(value) {
  return typeof value === 'string' && value.includes(POPUP_INPUT_ARGS_FILTER_BY_TK);
}

function isSimpleFieldName(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function normalizeChartFieldSegments(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeChartFieldPath(value) {
  if (Array.isArray(value)) {
    return normalizeChartFieldSegments(value).join('.');
  }
  return normalizeOptionalText(value);
}

function formatChartFieldPath(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(normalizeChartFieldSegments(value));
  }
  return normalizeOptionalText(value);
}

function describeChartFieldPath(value) {
  return formatChartFieldPath(value) || '<empty>';
}

function inspectChartFieldPath(value) {
  if (Array.isArray(value)) {
    const segments = normalizeChartFieldSegments(value);
    if (segments.length === 0) {
      return { kind: 'invalid', reason: 'empty-array', segments, normalized: null };
    }
    if (segments.length === 1) {
      return { kind: 'scalar-array', reason: '', segments, normalized: segments[0] };
    }
    if (segments.length === 2) {
      return { kind: 'relation-array', reason: '', segments, normalized: segments };
    }
    return { kind: 'invalid', reason: 'array-segment-count', segments, normalized: null };
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return { kind: 'invalid', reason: 'empty-string', segments: [], normalized: null };
    }
    const segments = normalized.split('.').map((segment) => segment.trim()).filter(Boolean);
    if (segments.length <= 1) {
      return { kind: 'scalar-string', reason: '', segments: [normalized], normalized };
    }
    if (segments.length === 2) {
      return { kind: 'legacy-dotted', reason: '', segments, normalized };
    }
    return { kind: 'invalid', reason: 'dotted-segment-count', segments, normalized: null };
  }

  return { kind: 'invalid', reason: 'unsupported-type', segments: [], normalized: null };
}

function resolveChartRelationField(metadata, collectionName, segments) {
  if (!collectionName || !Array.isArray(segments) || segments.length !== 2) {
    return null;
  }
  const collectionMeta = getCollectionMeta(metadata, collectionName);
  if (!collectionMeta) {
    return null;
  }
  const [associationName, targetFieldName] = segments;
  const associationField = collectionMeta.fieldsByName.get(associationName) || null;
  if (!associationField || !isAssociationField(associationField) || !associationField.target) {
    return {
      collectionMeta,
      associationField,
      targetCollectionMeta: null,
      targetField: null,
    };
  }
  const targetCollectionMeta = getCollectionMeta(metadata, associationField.target);
  const targetField = targetCollectionMeta?.fieldsByName.get(targetFieldName) || null;
  return {
    collectionMeta,
    associationField,
    targetCollectionMeta,
    targetField,
  };
}

function hasTemplateExpression(value) {
  return typeof value === 'string' && value.includes('{{');
}

function isHardcodedFilterValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  if (!normalized || hasTemplateExpression(normalized)) {
    return false;
  }
  return true;
}

function collectStrings(value, results = []) {
  if (typeof value === 'string') {
    results.push(value);
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, results));
    return results;
  }
  if (!isPlainObject(value)) {
    return results;
  }
  Object.values(value).forEach((item) => collectStrings(item, results));
  return results;
}

function countUses(value, useSet) {
  let count = 0;
  walk(value, (node) => {
    if (isPlainObject(node) && typeof node.use === 'string' && useSet.has(node.use)) {
      count += 1;
    }
  });
  return count;
}

function getAllowedTabUsesForPage(pageUse) {
  return new Set(getAllowedTabUsesForPageFromContracts(pageUse));
}

function getTabTitle(tabNode) {
  if (!isPlainObject(tabNode)) {
    return '';
  }
  const title = tabNode.stepParams?.pageTabSettings?.tab?.title;
  return typeof title === 'string' ? title.trim() : '';
}

function pushStructuralUidOccurrence(occurrences, uid, use, pathValue) {
  if (typeof uid !== 'string' || !uid.trim() || typeof use !== 'string' || !use.trim()) {
    return;
  }
  const normalizedUid = uid.trim();
  const list = occurrences.get(normalizedUid) ?? [];
  list.push({
    use,
    path: pathValue,
  });
  occurrences.set(normalizedUid, list);
}

function inspectActionSlotUses({
  hostNode,
  slotPath,
  allowedUses,
  code,
  message,
  mode,
  blockers,
  seen,
}) {
  const actions = Array.isArray(hostNode) ? hostNode : (Array.isArray(hostNode?.subModels?.actions) ? hostNode.subModels.actions : []);
  actions.forEach((actionNode, index) => {
    const actionUse = isPlainObject(actionNode) && typeof actionNode.use === 'string' ? actionNode.use.trim() : '';
    if (actionUse && allowedUses.has(actionUse)) {
      return;
    }
    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code,
      message,
      path: `${slotPath}[${index}]`,
      mode,
      dedupeKey: `${code}:${slotPath}:${index}:${actionUse || 'missing'}`,
      details: {
        hostUse: isPlainObject(hostNode) ? hostNode.use || null : null,
        actualUse: actionUse || null,
        allowedUses: [...allowedUses],
      },
    }));
  });
}

function subtreeReferencesCollection(node, collectionName) {
  let matched = false;
  walk(node, (child) => {
    if (!isPlainObject(child) || matched) {
      return;
    }
    const resourceCollectionName = child.stepParams?.resourceSettings?.init?.collectionName;
    const fieldCollectionName = child.stepParams?.fieldSettings?.init?.collectionName;
    if (resourceCollectionName === collectionName || fieldCollectionName === collectionName) {
      matched = true;
    }
  });
  return matched;
}

function hasPopupActionWithRequirements(actionNode, {
  collectionName,
  titlePattern,
  requireRecordContext,
  requiredFormUses,
  allowedActionUses,
}) {
  if (!isPlainObject(actionNode) || typeof actionNode.use !== 'string' || !allowedActionUses.has(actionNode.use)) {
    return false;
  }

  const openView = actionNode.stepParams?.popupSettings?.openView;
  const pageNode = actionNode.subModels?.page;
  const title = actionNode.stepParams?.buttonSettings?.general?.title || '';
  const strings = collectStrings(actionNode, []);
  const hasPopup = isPlainObject(openView) || isPlainObject(pageNode);
  const hasRecordContext = Boolean(openView?.filterByTk)
    || strings.some(
      (value) => typeof value === 'string'
        && (value.includes('{{ctx.record.id}}') || value.includes(POPUP_INPUT_ARGS_FILTER_BY_TK)),
    );
  const mentionsIntent = titlePattern.test(title)
    || titlePattern.test(actionNode.use)
    || strings.some((value) => typeof value === 'string' && titlePattern.test(value));
  const targetsCollection = openView?.collectionName === collectionName || subtreeReferencesCollection(pageNode, collectionName);
  const hasRequiredForm = requiredFormUses ? countUses(actionNode, requiredFormUses) > 0 : true;

  return hasPopup
    && (!requireRecordContext || hasRecordContext)
    && mentionsIntent
    && targetsCollection
    && hasRequiredForm;
}

function hasRequiredAction(actionNode, requirement, collectionName, businessBlockUses) {
  if (!isPlainObject(actionNode) || typeof actionNode.use !== 'string') {
    return false;
  }

  if (requirement.kind === 'edit-record-popup') {
    return hasPopupActionWithRequirements(actionNode, {
      collectionName,
      titlePattern: /(编辑订单项|编辑|edit)/i,
      requireRecordContext: true,
      requiredFormUses: EDIT_FORM_MODEL_USES,
      allowedActionUses: RECORD_ACTION_MODEL_USES,
    });
  }

  if (requirement.kind === 'view-record-popup') {
    return hasPopupActionWithRequirements(actionNode, {
      collectionName,
      titlePattern: /(查看|详情|view)/i,
      requireRecordContext: true,
      requiredFormUses: null,
      allowedActionUses: RECORD_ACTION_MODEL_USES,
    }) && countUses(actionNode, businessBlockUses) > 0;
  }

  if (requirement.kind === 'create-popup') {
    return hasPopupActionWithRequirements(actionNode, {
      collectionName,
      titlePattern: /(新建|创建|添加|登记|create|add)/i,
      requireRecordContext: false,
      requiredFormUses: CREATE_FORM_MODEL_USES,
      allowedActionUses: COLLECTION_ACTION_MODEL_USES,
    });
  }

  if (requirement.kind === 'add-child-record-popup') {
    return hasPopupActionWithRequirements(actionNode, {
      collectionName,
      titlePattern: /(新增下级|下级|addchild|add child|child)/i,
      requireRecordContext: true,
      requiredFormUses: CREATE_FORM_MODEL_USES,
      allowedActionUses: RECORD_ACTION_MODEL_USES,
    });
  }

  if (requirement.kind === 'delete-record') {
    return actionNode.use === 'DeleteActionModel';
  }

  if (requirement.kind === 'record-action') {
    return RECORD_ACTION_MODEL_USES.has(actionNode.use);
  }

  return false;
}

function findNestedRelationBlocks(pageNode, parentCollectionName) {
  const findings = [];
  function visit(node, pathValue, currentParentCollectionName) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, joinPath(pathValue, index), currentParentCollectionName));
      return;
    }
    if (!isPlainObject(node)) {
      return;
    }

    const use = typeof node.use === 'string' ? node.use : '';
    const resourceCollectionName = node.stepParams?.resourceSettings?.init?.collectionName || currentParentCollectionName;
    const dataScopeFilter = node.stepParams?.tableSettings?.dataScope?.filter
      || node.stepParams?.detailsSettings?.dataScope?.filter
      || node.stepParams?.formSettings?.dataScope?.filter;
    if (
      FILTER_CONTAINER_MODEL_USES.has(use)
      && node.stepParams?.resourceSettings?.init?.collectionName
      && dataScopeFilter
      && Array.isArray(dataScopeFilter.items)
      && dataScopeFilter.items.length === 0
      && currentParentCollectionName
      && node.stepParams.resourceSettings.init.collectionName !== currentParentCollectionName
    ) {
      findings.push({
        path: pathValue,
        use,
        collectionName: node.stepParams.resourceSettings.init.collectionName,
        parentCollectionName: currentParentCollectionName,
      });
    }
    for (const [key, child] of Object.entries(node)) {
      visit(child, joinPath(pathValue, key), resourceCollectionName);
    }
  }

  visit(pageNode, '$.subModels.page', parentCollectionName);
  return findings;
}

function getRequiredActionMissingCode(kind) {
  if (kind === 'create-popup') {
    return 'REQUIRED_CREATE_POPUP_ACTION_MISSING';
  }
  if (kind === 'view-record-popup') {
    return 'REQUIRED_VIEW_RECORD_POPUP_ACTION_MISSING';
  }
  if (kind === 'add-child-record-popup') {
    return 'REQUIRED_ADD_CHILD_RECORD_POPUP_ACTION_MISSING';
  }
  if (kind === 'delete-record') {
    return 'REQUIRED_DELETE_RECORD_ACTION_MISSING';
  }
  if (kind === 'record-action') {
    return 'REQUIRED_RECORD_ACTION_MISSING';
  }
  return 'REQUIRED_EDIT_RECORD_POPUP_ACTION_MISSING';
}

function buildRequiredActionMissingMessage(kind, collectionName, scope) {
  if (kind === 'create-popup') {
    return `显式要求 ${collectionName} 在 ${scope} 提供稳定的新建 popup 动作树，但当前未发现满足条件的 action/page/CreateForm 结构。`;
  }
  if (kind === 'view-record-popup') {
    return `显式要求 ${collectionName} 在 ${scope} 提供稳定的查看 popup 动作树，但当前未发现满足条件的 action/page/Details 结构。`;
  }
  if (kind === 'add-child-record-popup') {
    return `显式要求 ${collectionName} 在 ${scope} 提供稳定的新增下级 popup 动作树，但当前未发现满足条件的 action/page/CreateForm 结构。`;
  }
  if (kind === 'delete-record') {
    return `显式要求 ${collectionName} 在 ${scope} 提供稳定的删除动作，但当前未发现 DeleteActionModel。`;
  }
  if (kind === 'record-action') {
    return `显式要求 ${collectionName} 在 ${scope} 提供 record action，但当前未发现满足条件的记录级动作。`;
  }
  return `显式要求 ${collectionName} 在 ${scope} 提供稳定的记录级编辑 popup 动作树，但当前未发现满足条件的 action/page/EditForm 结构。`;
}

function scopeMatchesRequirement(requirementScope, candidateScope) {
  return requirementScope === 'either' || requirementScope === candidateScope;
}

function listActionSlotsForNode(node, pathValue) {
  const slots = [];
  if (!isPlainObject(node) || typeof node.use !== 'string') {
    return slots;
  }

  if (node.use === 'TableBlockModel') {
    slots.push({
      scope: 'block-actions',
      path: `${pathValue}.subModels.actions`,
      actions: Array.isArray(node.subModels?.actions) ? node.subModels.actions : [],
    });
    const columns = Array.isArray(node.subModels?.columns) ? node.subModels.columns : [];
    columns.forEach((columnNode, columnIndex) => {
      if (!isPlainObject(columnNode) || columnNode.use !== 'TableActionsColumnModel') {
        return;
      }
      slots.push({
        scope: 'row-actions',
        path: `${pathValue}.subModels.columns[${columnIndex}].subModels.actions`,
        actions: Array.isArray(columnNode.subModels?.actions) ? columnNode.subModels.actions : [],
      });
    });
    return slots;
  }

  if (node.use === 'DetailsBlockModel') {
    slots.push({
      scope: 'details-actions',
      path: `${pathValue}.subModels.actions`,
      actions: Array.isArray(node.subModels?.actions) ? node.subModels.actions : [],
    });
    return slots;
  }

  if (node.use === 'GridCardBlockModel') {
    slots.push({
      scope: 'block-actions',
      path: `${pathValue}.subModels.actions`,
      actions: Array.isArray(node.subModels?.actions) ? node.subModels.actions : [],
    });
    return slots;
  }

  if (node.use === 'GridCardItemModel') {
    slots.push({
      scope: 'row-actions',
      path: `${pathValue}.subModels.actions`,
      actions: Array.isArray(node.subModels?.actions) ? node.subModels.actions : [],
    });
  }

  return slots;
}

function inspectRequiredAction(payload, requirement, mode, blockers, seen, businessBlockUses) {
  let matchedBlockCount = 0;

  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !ACTION_HOST_MODEL_USES.has(node.use)) {
      return;
    }
    if (requirement.scope === 'row-actions' && node.use !== 'TableBlockModel' && node.use !== 'GridCardItemModel') {
      return;
    }
    if (requirement.scope === 'details-actions' && node.use !== 'DetailsBlockModel') {
      return;
    }
    if (requirement.scope === 'block-actions' && node.use !== 'TableBlockModel' && node.use !== 'GridCardBlockModel') {
      return;
    }

    const collectionName = node.stepParams?.resourceSettings?.init?.collectionName;
    if (collectionName !== requirement.collectionName) {
      return;
    }

    matchedBlockCount += 1;
    const relevantSlots = listActionSlotsForNode(node, pathValue)
      .filter((slot) => scopeMatchesRequirement(requirement.scope, slot.scope));
    if (relevantSlots.some((slot) => slot.actions.some((actionNode) => hasRequiredAction(actionNode, requirement, collectionName, businessBlockUses)))) {
      return;
    }

    const blockerPath = relevantSlots[0]?.path || `${pathValue}.subModels.actions`;
    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: getRequiredActionMissingCode(requirement.kind),
      message: buildRequiredActionMissingMessage(requirement.kind, collectionName, requirement.scope),
      path: blockerPath,
      mode,
      dedupeKey: `${getRequiredActionMissingCode(requirement.kind)}:${pathValue}:${requirement.scope}`,
      details: {
        collectionName,
        requiredAction: requirement.kind,
        actionScope: requirement.scope,
        slotCount: relevantSlots.length,
      },
    }));
  });

  if (matchedBlockCount > 0) {
    return;
  }

  pushFinding(blockers, seen, createFinding({
    severity: 'blocker',
    code: 'REQUIRED_ACTION_TARGET_BLOCK_MISSING',
    message: `显式要求 ${requirement.collectionName} 提供 ${requirement.kind}，但当前 payload 中未找到对应业务区块。`,
    path: '$',
    mode,
    dedupeKey: `REQUIRED_ACTION_TARGET_BLOCK_MISSING:${requirement.kind}:${requirement.collectionName}`,
    details: {
      collectionName: requirement.collectionName,
      requiredAction: requirement.kind,
    },
  }));
}

function inspectDeclaredRequirements(payload, metadata, mode, requirements, blockers, seen) {
  const businessBlockUses = resolveBusinessBlockUses(requirements);
  for (const requirement of requirements.requiredActions) {
    inspectRequiredAction(payload, requirement, mode, blockers, seen, businessBlockUses);
  }
  for (const requirement of requirements.requiredTabs) {
    inspectRequiredVisibleTabs(payload, requirement, mode, blockers, seen);
  }
  inspectRequiredFilters(payload, metadata, mode, requirements, blockers, seen);
}

function inspectRequiredVisibleTabs(payload, requirement, mode, blockers, seen) {
  let matchedPageCount = 0;

  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !Array.isArray(node.subModels?.tabs)) {
      return;
    }
    if (requirement.pageSignature && pathValue !== requirement.pageSignature) {
      return;
    }
    if (requirement.pageUse && node.use !== requirement.pageUse) {
      return;
    }

    matchedPageCount += 1;
    const tabs = Array.isArray(node.subModels?.tabs) ? node.subModels.tabs : [];
    const tabsByTitle = new Map();
    tabs.forEach((tabNode, tabIndex) => {
      const title = getTabTitle(tabNode);
      if (!title || tabsByTitle.has(title)) {
        return;
      }
      tabsByTitle.set(title, {
        tabNode,
        tabIndex,
      });
    });
    const actualTitles = [...tabsByTitle.keys()];
    const missingTitles = requirement.titles.filter((title) => !tabsByTitle.has(title));
    if (missingTitles.length === 0) {
      if (!requirement.requireBlockGrid) {
        return;
      }

      const titlesMissingGrid = requirement.titles.filter((title) => {
        const matchedTab = tabsByTitle.get(title);
        const gridNode = matchedTab?.tabNode?.subModels?.grid;
        return !isPlainObject(gridNode) || gridNode.use !== 'BlockGridModel';
      });
      if (titlesMissingGrid.length === 0) {
        return;
      }

      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'REQUIRED_VISIBLE_TABS_MISSING',
        message: `显式要求的 tabs 已命中标题，但缺少稳定 BlockGridModel；受影响 tabs：${titlesMissingGrid.join('、')}。`,
        path: `${pathValue}.subModels.tabs`,
        mode,
        dedupeKey: `REQUIRED_VISIBLE_TABS_MISSING:grid:${pathValue}:${titlesMissingGrid.join('|')}`,
        details: {
          pageUse: node.use || null,
          pageSignature: pathValue,
          requiredTitles: requirement.titles,
          actualTitles,
          titlesMissingGrid,
        },
      }));
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'REQUIRED_VISIBLE_TABS_MISSING',
      message: `显式要求的可见 tabs 未完整落入 payload；缺少：${missingTitles.join('、')}。`,
      path: `${pathValue}.subModels.tabs`,
      mode,
      dedupeKey: `REQUIRED_VISIBLE_TABS_MISSING:${pathValue}:${missingTitles.join('|')}`,
      details: {
        pageUse: node.use || null,
        pageSignature: pathValue,
        requiredTitles: requirement.titles,
        actualTitles,
        missingTitles,
      },
    }));
  });

  if (matchedPageCount > 0) {
    return;
  }

  pushFinding(blockers, seen, createFinding({
    severity: 'blocker',
    code: 'REQUIRED_TABS_TARGET_PAGE_MISSING',
    message: '要求显式可见 tabs，但 payload 中未找到目标 page/tabs 结构。',
    path: '$',
    mode,
    dedupeKey: `REQUIRED_TABS_TARGET_PAGE_MISSING:${requirement.pageUse || 'any'}:${requirement.titles.join('|')}`,
    details: {
      pageSignature: requirement.pageSignature,
      pageUse: requirement.pageUse,
      requiredTitles: requirement.titles,
    },
  }));
}

function extractTabIndexFromPageSignature(pageSignature) {
  if (typeof pageSignature !== 'string' || !pageSignature.trim()) {
    return null;
  }
  const match = pageSignature.match(/\.tabs\[(\d+)\](?:$|\.)/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function collectRequiredFilterScopeDescriptors(payload) {
  const descriptors = [];

  if (isPlainObject(payload) && payload.use === 'BlockGridModel') {
    descriptors.push({
      kind: 'root-grid',
      pageUse: null,
      tabUse: null,
      tabTitle: '',
      tabIndex: null,
      gridNode: payload,
      gridPath: '$',
    });
  }

  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !PAGE_MODEL_USES_SET.has(node.use) || !Array.isArray(node.subModels?.tabs)) {
      return;
    }

    node.subModels.tabs.forEach((tabNode, tabIndex) => {
      if (!isPlainObject(tabNode)) {
        return;
      }
      const gridNode = isPlainObject(tabNode.subModels?.grid) && tabNode.subModels.grid.use === 'BlockGridModel'
        ? tabNode.subModels.grid
        : null;
      if (!gridNode) {
        return;
      }
      descriptors.push({
        kind: 'tab',
        pageUse: normalizeOptionalText(node.use),
        tabUse: normalizeOptionalText(tabNode.use),
        tabTitle: getTabTitle(tabNode),
        tabIndex,
        gridNode,
        gridPath: `${pathValue}.subModels.tabs[${tabIndex}].subModels.grid`,
      });
    });
  });

  return descriptors;
}

function matchesRequiredFilterScope(scopeDescriptor, requirement) {
  if (!isPlainObject(scopeDescriptor)) {
    return false;
  }

  const relaxTabTitleMatch = Boolean(
    requirement.tabTitle
    && requirement.pageUse
    && PAGE_MODEL_USES_SET.has(requirement.pageUse),
  );
  const expectedTabIndex = extractTabIndexFromPageSignature(requirement.pageSignature);
  if (expectedTabIndex != null) {
    if (scopeDescriptor.kind !== 'tab' || scopeDescriptor.tabIndex !== expectedTabIndex) {
      return false;
    }
  } else if (requirement.tabTitle && scopeDescriptor.kind !== 'tab') {
    return false;
  }

  if (requirement.tabTitle && !relaxTabTitleMatch && scopeDescriptor.tabTitle !== requirement.tabTitle) {
    return false;
  }

  if (requirement.pageUse) {
    const candidateUses = sortUniqueStrings([scopeDescriptor.pageUse, scopeDescriptor.tabUse]);
    if (!candidateUses.includes(requirement.pageUse)) {
      return false;
    }
  }

  if (
    !requirement.tabTitle
    && expectedTabIndex == null
    && requirement.pageSignature === '$'
    && scopeDescriptor.kind === 'tab'
    && !requirement.pageUse
  ) {
    return false;
  }

  return true;
}

function listRequiredFilterScopeLabels(scopeDescriptors) {
  return scopeDescriptors.map((scopeDescriptor) => {
    if (!isPlainObject(scopeDescriptor)) {
      return '$unknown';
    }
    if (scopeDescriptor.kind === 'root-grid') {
      return '$root';
    }
    return scopeDescriptor.tabTitle || `tab#${scopeDescriptor.tabIndex ?? '?'}`;
  });
}

function listAvailableRequiredFilterFields(filterItems) {
  return sortUniqueStrings(filterItems.map((item) => {
    const collectionName = normalizeOptionalText(item?.collectionName);
    const fieldPath = normalizeOptionalText(item?.fieldPath);
    if (!fieldPath) {
      return '';
    }
    return collectionName ? `${collectionName}.${fieldPath}` : fieldPath;
  }));
}

function evaluateRequiredFilterScope(scopeDescriptor, requirement, metadata) {
  const state = collectGridFilterManagerState(scopeDescriptor.gridNode, scopeDescriptor.gridPath, metadata);
  const collectionName = normalizeOptionalText(requirement.collectionName);
  const requiredFields = sortUniqueStrings(requirement.fields);
  const expectedTargetUses = sortUniqueStrings(requirement.targetUses);
  const availableTargetUses = sortUniqueStrings(
    [...state.targetNodesByUid.values()].map((item) => normalizeOptionalText(item?.use)),
  );
  const missingFields = [];
  const targetUseMismatches = [];
  let matchedFieldCount = 0;

  requiredFields.forEach((fieldName) => {
    const matches = state.filterItems.filter((item) => (
      item.fieldPath === fieldName
      && (!collectionName || item.collectionName === collectionName)
    ));
    if (matches.length === 0) {
      missingFields.push(fieldName);
      return;
    }

    matchedFieldCount += 1;
    if (expectedTargetUses.length === 0) {
      return;
    }

    const matchingTargetItem = matches.find((item) => {
      if (!item.defaultTargetUid || !state.targetNodesByUid.has(item.defaultTargetUid)) {
        return false;
      }
      const targetNode = state.targetNodesByUid.get(item.defaultTargetUid);
      return expectedTargetUses.includes(normalizeOptionalText(targetNode?.use));
    }) || matches[0];

    const actualTargetUse = matchingTargetItem?.defaultTargetUid && state.targetNodesByUid.has(matchingTargetItem.defaultTargetUid)
      ? normalizeOptionalText(state.targetNodesByUid.get(matchingTargetItem.defaultTargetUid)?.use)
      : '';
    if (!actualTargetUse || !expectedTargetUses.includes(actualTargetUse)) {
      targetUseMismatches.push({
        fieldName,
        actualTargetUse: actualTargetUse || null,
        defaultTargetUid: matchingTargetItem?.defaultTargetUid || null,
      });
    }
  });

  return {
    ok: missingFields.length === 0 && targetUseMismatches.length === 0,
    hasFilterItems: state.filterItems.length > 0,
    matchedFieldCount,
    missingFields,
    targetUseMismatches,
    availableFilterFields: listAvailableRequiredFilterFields(state.filterItems),
    availableTargetUses,
    scopeLabel: scopeDescriptor.kind === 'root-grid'
      ? '$root'
      : (scopeDescriptor.tabTitle || `tab#${scopeDescriptor.tabIndex ?? '?'}`),
  };
}

function compareRequiredFilterScopeEvaluations(left, right) {
  return (
    left.result.missingFields.length - right.result.missingFields.length
    || left.result.targetUseMismatches.length - right.result.targetUseMismatches.length
    || right.result.matchedFieldCount - left.result.matchedFieldCount
    || left.result.scopeLabel.localeCompare(right.result.scopeLabel)
  );
}

function inspectRequiredFilters(payload, metadata, mode, requirements, blockers, seen) {
  if (!Array.isArray(requirements.requiredFilters) || requirements.requiredFilters.length === 0) {
    return;
  }

  const scopeDescriptors = collectRequiredFilterScopeDescriptors(payload);
  requirements.requiredFilters.forEach((requirement, index) => {
    const matchingScopes = scopeDescriptors.filter((scopeDescriptor) => matchesRequiredFilterScope(scopeDescriptor, requirement));
    if (matchingScopes.length === 0) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'REQUIRED_FILTER_SCOPE_MISSING',
        message: '显式要求存在筛选区块，但 payload 中未找到匹配的 filter scope。',
        path: '$',
        mode,
        dedupeKey: `REQUIRED_FILTER_SCOPE_MISSING:${requirement.pageSignature || '$'}:${requirement.tabTitle || '$root'}:${requirement.collectionName || '*'}`,
        details: {
          index,
          requirement,
          availableScopes: listRequiredFilterScopeLabels(scopeDescriptors),
        },
      }));
      return;
    }

    const evaluations = matchingScopes
      .map((scopeDescriptor) => ({
        scopeDescriptor,
        result: evaluateRequiredFilterScope(scopeDescriptor, requirement, metadata),
      }))
      .sort(compareRequiredFilterScopeEvaluations);

    if (evaluations.some((item) => item.result.ok)) {
      return;
    }

    const best = evaluations[0];
    if (best.result.missingFields.length > 0 || (!best.result.hasFilterItems && requirement.fields.length === 0)) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'REQUIRED_FILTER_FIELDS_MISSING',
        message: best.result.hasFilterItems
          ? `显式要求的筛选字段未完整落入 scope "${best.result.scopeLabel}"。`
          : `显式要求存在筛选区块，但 scope "${best.result.scopeLabel}" 下没有任何筛选字段。`,
        path: best.scopeDescriptor.gridPath,
        mode,
        dedupeKey: `REQUIRED_FILTER_FIELDS_MISSING:${best.scopeDescriptor.gridPath}:${(requirement.fields || []).join('|')}:${requirement.collectionName || '*'}`,
        details: {
          index,
          requirement,
          missingFields: best.result.missingFields,
          availableFilterFields: best.result.availableFilterFields,
          scopeLabel: best.result.scopeLabel,
        },
      }));
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'REQUIRED_FILTER_TARGET_USE_MISMATCH',
      message: `显式要求的筛选项已存在，但没有连接到 scope "${best.result.scopeLabel}" 中期望的目标区块 use。`,
      path: best.scopeDescriptor.gridPath,
      mode,
      dedupeKey: `REQUIRED_FILTER_TARGET_USE_MISMATCH:${best.scopeDescriptor.gridPath}:${(requirement.targetUses || []).join('|')}`,
      details: {
        index,
        requirement,
        targetUseMismatches: best.result.targetUseMismatches,
        availableTargetUses: best.result.availableTargetUses,
        scopeLabel: best.result.scopeLabel,
      },
    }));
  });
}

function inspectTabTrees(payload, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !PAGE_MODEL_USES_SET.has(node.use) || !Array.isArray(node.subModels?.tabs)) {
      return;
    }

    const tabs = node.subModels.tabs;
    const allowedTabUses = getAllowedTabUsesForPage(node.use);
    const uidOccurrences = new Map();
    pushStructuralUidOccurrence(uidOccurrences, node.uid, node.use, pathValue);

    tabs.forEach((tabNode, tabIndex) => {
      const tabPath = `${pathValue}.subModels.tabs[${tabIndex}]`;
      const tabUse = isPlainObject(tabNode) && typeof tabNode.use === 'string' ? tabNode.use : null;

      if (!tabUse || !allowedTabUses.has(tabUse)) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'TAB_SLOT_USE_INVALID',
          message: `${node.use} 的 tabs 槽位只能放 ${[...allowedTabUses].join(' / ')}，当前收到 ${tabUse || '未知 use'}。`,
          path: tabPath,
          mode,
          dedupeKey: `TAB_SLOT_USE_INVALID:${tabPath}:${tabUse || 'unknown'}`,
          details: {
            pageUse: node.use,
            allowedTabUses: [...allowedTabUses],
            actualTabUse: tabUse,
          },
        }));
        return;
      }

      pushStructuralUidOccurrence(uidOccurrences, tabNode.uid, tabUse, tabPath);
      const gridNode = tabNode.subModels?.grid;
      const gridPath = `${tabPath}.subModels.grid`;
      const gridUse = isPlainObject(gridNode) && typeof gridNode.use === 'string' ? gridNode.use : null;
      if (gridUse !== 'BlockGridModel') {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'TAB_GRID_MISSING_OR_INVALID',
          message: '显式 tab 下必须有稳定的 BlockGridModel，不能缺失或写成其他模型。',
          path: gridPath,
          mode,
          dedupeKey: `TAB_GRID_MISSING_OR_INVALID:${gridPath}:${gridUse || 'missing'}`,
          details: {
            pageUse: node.use,
            tabUse,
            actualGridUse: gridUse,
          },
        }));
        return;
      }

      pushStructuralUidOccurrence(uidOccurrences, gridNode.uid, gridUse, gridPath);
      const gridItems = Array.isArray(gridNode.subModels?.items) ? gridNode.subModels.items : [];
      gridItems.forEach((itemNode, itemIndex) => {
        if (!isPlainObject(itemNode) || typeof itemNode.use !== 'string') {
          return;
        }
        const itemPath = `${gridPath}.subModels.items[${itemIndex}]`;
        pushStructuralUidOccurrence(uidOccurrences, itemNode.uid, itemNode.use, itemPath);
        if (INVALID_VISIBLE_TAB_ITEM_MODEL_USES.has(itemNode.use)) {
          pushFinding(blockers, seen, createFinding({
            severity: 'blocker',
            code: 'TAB_GRID_ITEM_USE_INVALID',
            message: '显式 tab 的 grid.items 槽位必须放业务 block，不能继续塞 page/tab/grid 结构节点。',
            path: itemPath,
            mode,
            dedupeKey: `TAB_GRID_ITEM_USE_INVALID:${itemPath}:${itemNode.use}`,
            details: {
              pageUse: node.use,
              tabUse,
              itemUse: itemNode.use,
            },
          }));
        }
      });
    });

    for (const [uid, occurrences] of uidOccurrences.entries()) {
      if (occurrences.length <= 1) {
        continue;
      }
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'TAB_SUBTREE_UID_REUSED',
        message: `显式 tabs 子树复用了同一个 uid "${uid}"，这会让 page/tab/grid/block 结构塌缩。`,
        path: `${pathValue}.subModels.tabs`,
        mode,
        dedupeKey: `TAB_SUBTREE_UID_REUSED:${pathValue}:${uid}`,
        details: {
          pageUse: node.use,
          uid,
          occurrences,
        },
      }));
    }
  });
}

function inspectExistingUidReparenting(payload, metadata, mode, blockers, seen) {
  const liveTopologyByUid = metadata?.liveTopology?.byUid;
  if (!(liveTopologyByUid instanceof Map) || liveTopologyByUid.size === 0) {
    return;
  }

  walkFlowModelTree(payload, (node, pathValue, parentLink) => {
    const current = resolveFlowNodeLocator(node, parentLink);
    if (!current.uid) {
      return;
    }
    const liveNode = liveTopologyByUid.get(current.uid);
    if (!liveNode) {
      return;
    }

    const hasExplicitLocator = Boolean(
      normalizeOptionalText(node?.parentId)
      || normalizeOptionalText(node?.subKey)
      || normalizeFlowSubType(node?.subType, ''),
    );
    const isImplicitRoot = !parentLink && !hasExplicitLocator;
    if (isImplicitRoot) {
      return;
    }

    if (
      current.parentId === normalizeOptionalText(liveNode.parentId)
      && current.subKey === normalizeOptionalText(liveNode.subKey)
      && current.subType === normalizeFlowSubType(liveNode.subType, '')
    ) {
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'EXISTING_UID_REPARENT_BLOCKED',
      message: `uid "${current.uid}" 已存在于 live tree，不能通过直接复用旧 uid 改变 parent/subKey/subType 挂载关系。`,
      path: pathValue,
      mode,
      dedupeKey: `EXISTING_UID_REPARENT_BLOCKED:${current.uid}:${pathValue}`,
      details: {
        uid: current.uid,
        use: current.use || liveNode.use || null,
        payloadLocator: {
          parentId: current.parentId || null,
          subKey: current.subKey || null,
          subType: current.subType || null,
        },
        liveLocator: {
          parentId: normalizeOptionalText(liveNode.parentId) || null,
          subKey: normalizeOptionalText(liveNode.subKey) || null,
          subType: normalizeFlowSubType(liveNode.subType, '') || null,
        },
        livePath: normalizeOptionalText(liveNode.path) || null,
      },
    }));
  });
}

function inspectGridLayoutMembership(payload, mode, blockers, seen) {
  walkFlowModelTree(payload, (node, pathValue) => {
    const gridUse = normalizeOptionalText(node?.use);
    if (!LAYOUT_GRID_MODEL_USES.has(gridUse)) {
      return;
    }

    const membership = collectGridLayoutMembership(node);
    if (!membership.hasExplicitLayout) {
      return;
    }

    const orphanLayoutUids = membership.layoutItemUids.filter((uid) => !membership.itemUidSet.has(uid));
    if (orphanLayoutUids.length > 0) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'GRID_LAYOUT_ORPHAN_UID',
        message: `${gridUse} 的 gridSettings.rows 引用了不在 subModels.items 中的 uid，readback/runtime 会出现空槽或整块不显示。`,
        path: `${pathValue}.stepParams.gridSettings.grid.rows`,
        mode,
        dedupeKey: `GRID_LAYOUT_ORPHAN_UID:${pathValue}:${orphanLayoutUids.join(',')}`,
        details: {
          gridUse,
          orphanLayoutUids,
          itemUids: membership.itemUids,
          rowOrder: membership.rowOrder,
        },
      }));
    }

    const unplacedItemUids = membership.itemUids.filter((uid) => !membership.layoutUidSet.has(uid));
    if (unplacedItemUids.length > 0) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'GRID_ITEM_LAYOUT_MISSING',
        message: `${gridUse} 的 subModels.items 中有节点没有出现在 gridSettings.rows 里，这类节点不会稳定落到可见布局槽位。`,
        path: `${pathValue}.subModels.items`,
        mode,
        dedupeKey: `GRID_ITEM_LAYOUT_MISSING:${pathValue}:${unplacedItemUids.join(',')}`,
        details: {
          gridUse,
          unplacedItemUids,
          layoutItemUids: membership.layoutItemUids,
          rowOrder: membership.rowOrder,
        },
      }));
    }
  });
}

function findRelationBlocksUsingGenericPopupFilter(pageNode, parentCollectionName, metadata) {
  const findings = [];

  function visit(node, pathValue, currentParentCollectionName) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, joinPath(pathValue, index), currentParentCollectionName));
      return;
    }
    if (!isPlainObject(node)) {
      return;
    }

    const use = typeof node.use === 'string' ? node.use : '';
    const initOptions = node.stepParams?.resourceSettings?.init;
    const resourceCollectionName = initOptions?.collectionName || currentParentCollectionName;
    const dataScopeFilter = node.stepParams?.tableSettings?.dataScope?.filter
      || node.stepParams?.detailsSettings?.dataScope?.filter
      || node.stepParams?.formSettings?.dataScope?.filter;
    const hasAssociationProtocol = Boolean(
      typeof initOptions?.associationName === 'string'
      && initOptions.associationName.trim()
      && Object.hasOwn(initOptions, 'sourceId'),
    );

    if (
      FILTER_CONTAINER_MODEL_USES.has(use)
      && initOptions?.collectionName
      && currentParentCollectionName
      && initOptions.collectionName !== currentParentCollectionName
      && !hasAssociationProtocol
    ) {
      const collectionMeta = getCollectionMeta(metadata, initOptions.collectionName);
      const childRelationField = findAssociationFieldToTarget(collectionMeta, currentParentCollectionName);
      const relationScalarPathHints = getBelongsToScalarPathHints(childRelationField);
      const parentCollectionMeta = getCollectionMeta(metadata, currentParentCollectionName);
      const parentAssociationField = findAssociationFieldToTarget(parentCollectionMeta, initOptions.collectionName);
      const matchedCondition = relationScalarPathHints?.suggestedPaths?.length
        ? collectFilterConditions(dataScopeFilter).find(
          (condition) => (
            isScalarComparisonOperator(condition.operator)
            && relationScalarPathHints.suggestedPaths.includes(condition.path)
            && usesPopupInputArgsFilterByTk(condition.value)
          ),
        )
        : null;

      if (childRelationField && parentAssociationField && matchedCondition) {
        findings.push({
          path: pathValue,
          use,
          collectionName: initOptions.collectionName,
          parentCollectionName: currentParentCollectionName,
          relationField: childRelationField.name,
          targetCollectionName: childRelationField.target,
          matchedConditionPath: matchedCondition.path,
          scalarComparablePaths: relationScalarPathHints.suggestedPaths,
          suggestedProtocol: {
            associationName: `${currentParentCollectionName}.${parentAssociationField.name}`,
            sourceId: POPUP_INPUT_ARGS_FILTER_BY_TK,
          },
        });
      }
    }

    for (const [key, child] of Object.entries(node)) {
      visit(child, joinPath(pathValue, key), resourceCollectionName);
    }
  }

  visit(pageNode, '$.subModels.page', parentCollectionName);
  return findings;
}

function findRelationBlocksUsingAmbiguousAssociationContext(pageNode, parentCollectionName, metadata) {
  const findings = [];

  function visit(node, pathValue, currentParentCollectionName) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, joinPath(pathValue, index), currentParentCollectionName));
      return;
    }
    if (!isPlainObject(node)) {
      return;
    }

    const use = typeof node.use === 'string' ? node.use : '';
    const initOptions = node.stepParams?.resourceSettings?.init;
    const resourceCollectionName = initOptions?.collectionName || currentParentCollectionName;
    const associationName = typeof initOptions?.associationName === 'string' ? initOptions.associationName.trim() : '';
    const sourceId = initOptions?.sourceId;

    if (
      FILTER_CONTAINER_MODEL_USES.has(use)
      && initOptions?.collectionName
      && currentParentCollectionName
      && initOptions.collectionName !== currentParentCollectionName
      && associationName
      && Object.hasOwn(initOptions, 'sourceId')
    ) {
      const collectionMeta = getCollectionMeta(metadata, initOptions.collectionName);
      const directAssociationField = findAssociationFieldByAssociationName(collectionMeta, associationName);
      if (
        directAssociationField
        && isBelongsToLikeField(directAssociationField)
        && directAssociationField.target === currentParentCollectionName
        && usesPopupInputArgsFilterByTk(sourceId)
      ) {
        findings.push({
          path: pathValue,
          use,
          collectionName: initOptions.collectionName,
          parentCollectionName: currentParentCollectionName,
          associationName,
          sourceId,
          relationField: directAssociationField.name,
          targetCollectionName: directAssociationField.target,
        });
      }
    }

    for (const [key, child] of Object.entries(node)) {
      visit(child, joinPath(pathValue, key), resourceCollectionName);
    }
  }

  visit(pageNode, '$.subModels.page', parentCollectionName);
  return findings;
}

function hasMeaningfulDetailsContent(detailsBlock) {
  if (!isPlainObject(detailsBlock?.subModels)) {
    return false;
  }

  let hasContent = false;
  walk(detailsBlock.subModels, (node) => {
    if (hasContent || !isPlainObject(node) || typeof node.use !== 'string') {
      return;
    }
    if (DETAILS_LAYOUT_ONLY_MODEL_USES.has(node.use)) {
      return;
    }
    if (node.use === 'DetailsBlockModel') {
      return;
    }
    hasContent = true;
  });

  return hasContent;
}

function inspectFormBlocks(payload, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !FORM_BLOCK_MODEL_USES.has(node.use)) {
      return;
    }

    const actionNodes = Array.isArray(node.subModels?.actions) ? node.subModels.actions : [];
    const gridItems = Array.isArray(node.subModels?.grid?.subModels?.items) ? node.subModels.grid.subModels.items : [];
    if (gridItems.length === 0) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'FORM_BLOCK_EMPTY_GRID',
        message: `${node.use} 只有空的 FormGridModel，没有任何表单字段。`,
        path: `${pathValue}.subModels.grid.subModels.items`,
        mode,
        dedupeKey: `FORM_BLOCK_EMPTY_GRID:${pathValue}`,
        details: {
          formUse: node.use,
          collectionName: node.stepParams?.resourceSettings?.init?.collectionName || null,
        },
      }));
    }

    gridItems.forEach((item, index) => {
      if (!isPlainObject(item) || !FORM_BLOCK_ACTION_MODEL_USES.has(item.use)) {
        return;
      }

      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FORM_ACTION_MUST_USE_ACTIONS_SLOT',
        message: `${node.use} 的表单动作必须挂在 subModels.actions，不能放进 FormGridModel.subModels.items；否则按钮会渲染到字段区或位置异常。`,
        path: `${pathValue}.subModels.grid.subModels.items[${index}]`,
        mode,
        dedupeKey: `FORM_ACTION_MUST_USE_ACTIONS_SLOT:${pathValue}:${index}`,
        details: {
          formUse: node.use,
          actionUse: item.use,
          expectedSlot: `${pathValue}.subModels.actions`,
        },
      }));
    });

    const submitLikeActions = actionNodes.filter(
      (actionNode) => isPlainObject(actionNode) && FORM_BLOCK_ACTION_MODEL_USES.has(actionNode.use),
    );
    if (submitLikeActions.length > 1) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'FORM_SUBMIT_ACTION_DUPLICATED',
        message: `${node.use} 存在多个 submit-like action，会导致弹窗里出现重复保存按钮。`,
        path: `${pathValue}.subModels.actions`,
        mode,
        dedupeKey: `FORM_SUBMIT_ACTION_DUPLICATED:${pathValue}`,
        details: {
          formUse: node.use,
          actionCount: submitLikeActions.length,
          actionUses: submitLikeActions.map((actionNode) => actionNode.use),
        },
      }));
    }

    const hasSubmitLikeAction = submitLikeActions.length > 0;
    if (!hasSubmitLikeAction) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'FORM_SUBMIT_ACTION_MISSING',
        message: `${node.use} 缺少稳定的表单动作；至少应在 subModels.actions 中放置 FormSubmitActionModel 或 JSFormActionModel。`,
        path: `${pathValue}.subModels.actions`,
        mode,
        dedupeKey: `FORM_SUBMIT_ACTION_MISSING:${pathValue}`,
        details: {
          formUse: node.use,
          actionCount: actionNodes.length,
        },
      }));
    }

    gridItems.forEach((item, index) => {
      if (!isPlainObject(item) || item.use !== 'FormItemModel') {
        return;
      }

      const fieldUse = typeof item.subModels?.field?.use === 'string' ? item.subModels.field.use.trim() : '';
      if (!fieldUse) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FORM_ITEM_FIELD_SUBMODEL_MISSING',
          message: 'FormItemModel 不能只写 fieldSettings.init；必须显式补 subModels.field，并使用当前 schema/field binding 给出的 editable field model。',
          path: `${pathValue}.subModels.grid.subModels.items[${index}]`,
          mode,
          dedupeKey: `FORM_ITEM_FIELD_SUBMODEL_MISSING:${pathValue}:${index}`,
          details: {
            formUse: node.use,
            fieldPath: item.stepParams?.fieldSettings?.init?.fieldPath || null,
            collectionName: item.stepParams?.fieldSettings?.init?.collectionName || null,
          },
        }));
        return;
      }

      const bindingUse = typeof item.subModels?.field?.stepParams?.fieldBinding?.use === 'string'
        ? item.subModels.field.stepParams.fieldBinding.use.trim()
        : '';
      if (fieldUse === 'FieldModel' && bindingUse) {
        return;
      }

      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FORM_ITEM_FIELD_BINDING_ENTRY_INVALID',
        message: 'FormItemModel.subModels.field 必须使用 FieldModel 作为入口，并通过 stepParams.fieldBinding.use 指向具体 editable field model。直接落具体 FieldModel use 会触发 resolveUse circular reference 等 runtime 问题。',
        path: `${pathValue}.subModels.grid.subModels.items[${index}].subModels.field`,
        mode,
        dedupeKey: `FORM_ITEM_FIELD_BINDING_ENTRY_INVALID:${pathValue}:${index}`,
        details: {
          formUse: node.use,
          fieldUse,
          bindingUse: bindingUse || null,
        },
      }));
    });
  });
}

function inspectFilterFormBlocks(payload, metadata, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || node.use !== 'FilterFormBlockModel') {
      return;
    }

    const gridItems = Array.isArray(node.subModels?.grid?.subModels?.items) ? node.subModels.grid.subModels.items : [];
    if (gridItems.length === 0) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'FILTER_FORM_EMPTY_GRID',
        message: 'FilterFormBlockModel 只有空 grid 壳，没有任何筛选字段。',
        path: `${pathValue}.subModels.grid.subModels.items`,
        mode,
        dedupeKey: `FILTER_FORM_EMPTY_GRID:${pathValue}`,
      }));
    }

    gridItems.forEach((item, index) => {
      if (!isPlainObject(item) || item.use !== 'FilterFormItemModel') {
        return;
      }

      const fieldInit = item.stepParams?.fieldSettings?.init;
      const collectionName = normalizeOptionalText(fieldInit?.collectionName);
      const fieldPath = normalizeOptionalText(fieldInit?.fieldPath);
      const fieldUse = typeof item.subModels?.field?.use === 'string' ? item.subModels.field.use.trim() : '';
      if (!fieldUse) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_FORM_ITEM_FIELD_SUBMODEL_MISSING',
          message: 'FilterFormItemModel 不能只写 fieldSettings.init；必须显式补 subModels.field。UI 通过 Fields 添加筛选字段时也会创建这个子模型。',
          path: `${pathValue}.subModels.grid.subModels.items[${index}]`,
          mode,
          dedupeKey: `FILTER_FORM_ITEM_FIELD_SUBMODEL_MISSING:${pathValue}:${index}`,
          details: {
            fieldPath: fieldPath || null,
            collectionName: collectionName || null,
          },
        }));
      }

      if (!isPlainObject(item.stepParams?.filterFormItemSettings?.init?.filterField)) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_FORM_ITEM_FILTERFIELD_MISSING',
          message: 'FilterFormItemModel 缺少 filterFormItemSettings.init.filterField；这种 payload 往往看起来有筛选字段，但运行时不能稳定生成筛选条件。',
          path: `${pathValue}.subModels.grid.subModels.items[${index}].stepParams.filterFormItemSettings.init.filterField`,
          mode,
          dedupeKey: `FILTER_FORM_ITEM_FILTERFIELD_MISSING:${pathValue}:${index}`,
          details: {
            fieldPath: fieldPath || null,
            collectionName: collectionName || null,
          },
        }));
      }

      if (!fieldUse || !collectionName || !fieldPath || hasTemplateExpression(fieldPath)) {
        return;
      }

      const expectedFieldSpec = resolveFilterFieldModelSpec({
        metadata,
        collectionName,
        fieldPath,
      });
      if (
        !Array.isArray(expectedFieldSpec?.preferredUses)
        || expectedFieldSpec.preferredUses.length === 0
        || expectedFieldSpec.preferredUses.includes(fieldUse)
      ) {
        return;
      }

      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FILTER_FORM_FIELD_MODEL_MISMATCH',
        message: 'FilterFormItemModel.subModels.field.use 必须根据字段 metadata 推导；select/date/number/association 等字段不能一律回退成 InputFieldModel。',
        path: `${pathValue}.subModels.grid.subModels.items[${index}].subModels.field`,
        mode,
        dedupeKey: `FILTER_FORM_FIELD_MODEL_MISMATCH:${pathValue}:${index}`,
        details: {
          collectionName,
          fieldPath,
          expectedUse: expectedFieldSpec.use,
          actualUse: fieldUse,
          resolvedFieldInterface: normalizeOptionalText(expectedFieldSpec.resolvedField?.interface) || null,
        },
      }));
    });
  });
}

function inspectFilterManagerBindings(payload, metadata, mode, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || node.use !== 'BlockGridModel') {
      return;
    }

    const {
      filterItems,
      targetNodesByUid,
      existingConfigs,
    } = collectGridFilterManagerState(node, pathValue, metadata);

    if (filterItems.length === 0) {
      return;
    }

    const configsByFilterId = new Map();
    existingConfigs.forEach((config, configIndex) => {
      const list = configsByFilterId.get(config.filterId) ?? [];
      list.push({
        ...config,
        index: configIndex,
      });
      configsByFilterId.set(config.filterId, list);

      if (!targetNodesByUid.has(config.targetId)) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_MANAGER_TARGET_MISSING',
          message: `filterManager 引用了不存在或不可筛选的 targetId "${config.targetId}"。`,
          path: `${pathValue}.filterManager[${configIndex}]`,
          mode,
          dedupeKey: `FILTER_MANAGER_TARGET_MISSING:config:${pathValue}:${config.filterId}:${config.targetId}`,
          details: {
            filterId: config.filterId,
            targetId: config.targetId,
            availableTargetIds: [...targetNodesByUid.keys()],
          },
        }));
      }
    });

    const hasResolvableBinding = filterItems.some((item) => (
      item.defaultTargetUid
      && targetNodesByUid.has(item.defaultTargetUid)
      && Array.isArray(item.expectedFilterPaths)
      && item.expectedFilterPaths.length > 0
    ));

    if (hasResolvableBinding && existingConfigs.length === 0) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FILTER_MANAGER_MISSING',
        message: 'BlockGridModel 同时包含筛选区块与可筛选目标，但缺少顶层 filterManager 持久化配置。',
        path: `${pathValue}.filterManager`,
        mode,
        dedupeKey: `FILTER_MANAGER_MISSING:${pathValue}`,
        details: {
          filterItemCount: filterItems.length,
          availableTargetIds: [...targetNodesByUid.keys()],
        },
      }));
    }

    filterItems.forEach((item) => {
      if (!item.defaultTargetUid) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_MANAGER_FILTER_ITEM_UNBOUND',
          message: 'FilterFormItemModel 缺少 defaultTargetUid，无法建立稳定的筛选联动目标。',
          path: `${item.path}.stepParams.filterFormItemSettings.init.defaultTargetUid`,
          mode,
          dedupeKey: `FILTER_MANAGER_FILTER_ITEM_UNBOUND:missing-target:${item.path}`,
          details: {
            filterId: item.uid || null,
            fieldPath: item.fieldPath || null,
          },
        }));
        return;
      }

      if (!targetNodesByUid.has(item.defaultTargetUid)) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_MANAGER_TARGET_MISSING',
          message: `defaultTargetUid "${item.defaultTargetUid}" 在当前 BlockGridModel 中找不到对应的可筛选目标。`,
          path: `${item.path}.stepParams.filterFormItemSettings.init.defaultTargetUid`,
          mode,
          dedupeKey: `FILTER_MANAGER_TARGET_MISSING:item:${item.path}:${item.defaultTargetUid}`,
          details: {
            filterId: item.uid || null,
            defaultTargetUid: item.defaultTargetUid,
            availableTargetIds: [...targetNodesByUid.keys()],
          },
        }));
        return;
      }

      if (!Array.isArray(item.expectedFilterPaths) || item.expectedFilterPaths.length === 0) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_MANAGER_FILTER_PATH_UNRESOLVED',
          message: '当前 metadata 无法为筛选项解析稳定的 filterPaths，不能安全生成 filterManager。',
          path: item.path,
          mode,
          dedupeKey: `FILTER_MANAGER_FILTER_PATH_UNRESOLVED:missing:${item.path}`,
          details: {
            filterId: item.uid || null,
            collectionName: item.collectionName,
            fieldPath: item.fieldPath,
          },
        }));
        return;
      }

      const matchingConfigs = item.uid ? (configsByFilterId.get(item.uid) ?? []) : [];
      if (matchingConfigs.length === 0) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_MANAGER_FILTER_ITEM_UNBOUND',
          message: 'FilterFormItemModel 已声明 defaultTargetUid，但 filterManager 中没有对应的绑定配置。',
          path: `${pathValue}.filterManager`,
          mode,
          dedupeKey: `FILTER_MANAGER_FILTER_ITEM_UNBOUND:config:${pathValue}:${item.uid || item.path}`,
          details: {
            filterId: item.uid || null,
            defaultTargetUid: item.defaultTargetUid,
            expectedFilterPaths: item.expectedFilterPaths,
          },
        }));
        return;
      }

      const matchingTargetConfig = matchingConfigs.find((config) => config.targetId === item.defaultTargetUid);
      if (!matchingTargetConfig) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_MANAGER_TARGET_MISSING',
          message: 'filterManager 中存在该筛选项的配置，但没有连接到 defaultTargetUid 指向的目标区块。',
          path: `${pathValue}.filterManager`,
          mode,
          dedupeKey: `FILTER_MANAGER_TARGET_MISSING:binding:${pathValue}:${item.uid}:${item.defaultTargetUid}`,
          details: {
            filterId: item.uid,
            defaultTargetUid: item.defaultTargetUid,
            actualTargetIds: matchingConfigs.map((config) => config.targetId),
          },
        }));
        return;
      }

      const actualFilterPaths = sortUniqueStrings(matchingTargetConfig.filterPaths);
      const expectedFilterPaths = sortUniqueStrings(item.expectedFilterPaths);
      if (JSON.stringify(actualFilterPaths) !== JSON.stringify(expectedFilterPaths)) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FILTER_MANAGER_FILTER_PATH_UNRESOLVED',
          message: 'filterManager.filterPaths 与当前筛选项 fieldPath 推导结果不一致，查询动作可能无法命中目标数据。',
          path: `${pathValue}.filterManager[${matchingTargetConfig.index}]`,
          mode,
          dedupeKey: `FILTER_MANAGER_FILTER_PATH_UNRESOLVED:mismatch:${pathValue}:${item.uid}`,
          details: {
            filterId: item.uid,
            defaultTargetUid: item.defaultTargetUid,
            expectedFilterPaths,
            actualFilterPaths,
          },
        }));
      }
    });
  });
}

function inspectCollectionResourceContracts(payload, mode, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !COLLECTION_RESOURCE_BLOCK_MODEL_USES.has(node.use)) {
      return;
    }

    const init = isPlainObject(node.stepParams?.resourceSettings?.init)
      ? node.stepParams.resourceSettings.init
      : null;
    const dataSourceKey = typeof init?.dataSourceKey === 'string' ? init.dataSourceKey.trim() : '';
    const collectionName = typeof init?.collectionName === 'string' ? init.collectionName.trim() : '';
    if (dataSourceKey && collectionName) {
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'COLLECTION_BLOCK_RESOURCE_SETTINGS_MISSING',
      message: `${node.use} 缺少完整的 stepParams.resourceSettings.init.dataSourceKey / collectionName。运行时会直接读取这两个值；缺失时常见症状就是 runtime TypeError、区块空白或整页卡骨架屏。`,
      path: `${pathValue}.stepParams.resourceSettings.init`,
      mode,
      dedupeKey: `COLLECTION_BLOCK_RESOURCE_SETTINGS_MISSING:${pathValue}`,
      details: {
        blockUse: node.use,
        dataSourceKey: dataSourceKey || null,
        collectionName: collectionName || null,
      },
    }));
  });
}

function inspectChartBlocks(payload, metadata, mode, warnings, blockers, warningSeen, blockerSeen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || node.use !== 'ChartBlockModel') {
      return;
    }

    const configure = isPlainObject(node.stepParams?.chartSettings?.configure)
      ? node.stepParams.chartSettings.configure
      : null;
    const query = isPlainObject(configure?.query) ? configure.query : null;
    const chart = isPlainObject(configure?.chart) ? configure.chart : null;
    const option = isPlainObject(chart?.option) ? chart.option : null;
    const events = isPlainObject(chart?.events) ? chart.events : null;
    const resourceInit = isPlainObject(node.stepParams?.resourceSettings?.init)
      ? node.stepParams.resourceSettings.init
      : null;

    const queryMode = normalizeOptionalText(query?.mode);
    const optionMode = normalizeOptionalText(option?.mode);
    const collectionPath = Array.isArray(query?.collectionPath)
      ? query.collectionPath
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
      : [];
    const collectionName = collectionPath[1] || '';
    const measures = Array.isArray(query?.measures)
      ? query.measures
        .filter((item) => isPlainObject(item) && inspectChartFieldPath(item.field).kind !== 'invalid')
      : [];
    const optionBuilder = isPlainObject(option?.builder) ? option.builder : null;

    const validateFieldList = (items, key) => {
      (Array.isArray(items) ? items : []).forEach((item, index) => {
        if (!isPlainObject(item)) {
          return;
        }

        const fieldPath = `${pathValue}.stepParams.chartSettings.configure.query.${key}[${index}].field`;
        const fieldInspection = inspectChartFieldPath(item.field);
        if (fieldInspection.kind === 'invalid') {
          pushFinding(blockers, blockerSeen, createFinding({
            severity: 'blocker',
            code: 'CHART_QUERY_FIELD_PATH_SHAPE_UNSUPPORTED',
            message: `ChartBlockModel 的 ${key}[${index}].field 只允许 scalar string 或 [association, field]；当前值 ${describeChartFieldPath(item.field)} 不受支持。`,
            path: fieldPath,
            mode,
            dedupeKey: `CHART_QUERY_FIELD_PATH_SHAPE_UNSUPPORTED:${fieldPath}`,
            details: {
              field: item.field ?? null,
              reason: fieldInspection.reason || null,
            },
          }));
          return;
        }

        if (fieldInspection.kind === 'legacy-dotted') {
          pushFinding(blockers, blockerSeen, createFinding({
            severity: 'blocker',
            code: 'CHART_QUERY_FIELD_PATH_SHAPE_UNSUPPORTED',
            message: `ChartBlockModel 的 ${key}[${index}].field 不应使用 dotted relation path "${fieldInspection.normalized}"；请改成数组路径 ["${fieldInspection.segments[0]}", "${fieldInspection.segments[1]}"]。`,
            path: fieldPath,
            mode,
            dedupeKey: `CHART_QUERY_FIELD_PATH_SHAPE_UNSUPPORTED:${fieldPath}:legacy-dotted`,
            details: {
              field: item.field,
              suggestedField: fieldInspection.segments,
            },
          }));
          return;
        }

        if (fieldInspection.kind === 'scalar-string' || fieldInspection.kind === 'scalar-array') {
          const collectionMeta = getCollectionMeta(metadata, collectionName);
          const fieldMeta = collectionMeta?.fieldsByName.get(serializeChartFieldPath(fieldInspection.normalized)) || null;
          if (fieldMeta && isAssociationField(fieldMeta)) {
            pushFinding(blockers, blockerSeen, createFinding({
              severity: 'blocker',
              code: 'CHART_QUERY_ASSOCIATION_FIELD_TARGET_MISSING',
              message: `ChartBlockModel 的 ${key}[${index}].field 直接引用了关联字段 "${fieldMeta.name}"，必须显式选择目标字段。`,
              path: fieldPath,
              mode,
              dedupeKey: `CHART_QUERY_ASSOCIATION_FIELD_TARGET_MISSING:${fieldPath}`,
              details: {
                field: item.field,
                targetCollection: fieldMeta.target || null,
              },
            }));
          }
          return;
        }

        if (fieldInspection.kind === 'relation-array') {
          const resolvedRelation = resolveChartRelationField(metadata, collectionName, fieldInspection.segments);
          if (!resolvedRelation?.collectionMeta) {
            return;
          }
          if (!resolvedRelation.associationField || !isAssociationField(resolvedRelation.associationField)) {
            pushFinding(blockers, blockerSeen, createFinding({
              severity: 'blocker',
              code: 'CHART_QUERY_RELATION_TARGET_FIELD_UNRESOLVED',
              message: `ChartBlockModel 的 ${key}[${index}].field 关系前缀 "${fieldInspection.segments[0]}" 在 collection "${collectionName}" 中不可解析为稳定关联字段。`,
              path: fieldPath,
              mode,
              dedupeKey: `CHART_QUERY_RELATION_TARGET_FIELD_UNRESOLVED:${fieldPath}:association`,
              details: {
                field: item.field,
                collectionName,
              },
            }));
            return;
          }
          if (!resolvedRelation.targetField) {
            pushFinding(blockers, blockerSeen, createFinding({
              severity: 'blocker',
              code: 'CHART_QUERY_RELATION_TARGET_FIELD_UNRESOLVED',
              message: `ChartBlockModel 的 ${key}[${index}].field 目标字段 "${fieldInspection.segments[1]}" 在关联 "${fieldInspection.segments[0]}" 的目标 collection 中不可解析。`,
              path: fieldPath,
              mode,
              dedupeKey: `CHART_QUERY_RELATION_TARGET_FIELD_UNRESOLVED:${fieldPath}:target`,
              details: {
                field: item.field,
                targetCollection: resolvedRelation.associationField.target || null,
              },
            }));
          }
        }
      });
    };

    if (!CHART_QUERY_MODES.has(queryMode)) {
      pushFinding(blockers, blockerSeen, createFinding({
        severity: 'blocker',
        code: 'CHART_QUERY_MODE_MISSING',
        message: 'ChartBlockModel 缺少 stepParams.chartSettings.configure.query.mode；skill 只接受 builder 或 sql 两种显式模式。',
        path: `${pathValue}.stepParams.chartSettings.configure.query.mode`,
        mode,
        dedupeKey: `CHART_QUERY_MODE_MISSING:${pathValue}`,
      }));
    }

    if (!CHART_OPTION_MODES.has(optionMode)) {
      pushFinding(blockers, blockerSeen, createFinding({
        severity: 'blocker',
        code: 'CHART_OPTION_MODE_MISSING',
        message: 'ChartBlockModel 缺少 stepParams.chartSettings.configure.chart.option.mode；skill 只接受 basic 或 custom 两种显式模式。',
        path: `${pathValue}.stepParams.chartSettings.configure.chart.option.mode`,
        mode,
        dedupeKey: `CHART_OPTION_MODE_MISSING:${pathValue}`,
      }));
    }

    if (
      resourceInit
      && normalizeOptionalText(resourceInit.collectionName)
      && collectionPath.length === 0
    ) {
      pushFinding(blockers, blockerSeen, createFinding({
        severity: 'blocker',
        code: 'CHART_QUERY_CONFIG_MISPLACED_IN_RESOURCE_SETTINGS',
        message: 'ChartBlockModel 把 collection 放进了 resourceSettings，但图表查询真正读取的是 chartSettings.configure.query；请把 collectionPath 配到 query 下。',
        path: `${pathValue}.stepParams.resourceSettings.init`,
        mode,
        dedupeKey: `CHART_QUERY_CONFIG_MISPLACED_IN_RESOURCE_SETTINGS:${pathValue}`,
        details: {
          collectionName: normalizeOptionalText(resourceInit.collectionName) || null,
        },
      }));
    }

    if (queryMode === 'builder' && collectionPath.length === 0) {
      pushFinding(blockers, blockerSeen, createFinding({
        severity: 'blocker',
        code: 'CHART_BUILDER_COLLECTION_PATH_MISSING',
        message: 'ChartBlockModel 使用 builder 查询时，必须显式提供 chartSettings.configure.query.collectionPath。',
        path: `${pathValue}.stepParams.chartSettings.configure.query.collectionPath`,
        mode,
        dedupeKey: `CHART_BUILDER_COLLECTION_PATH_MISSING:${pathValue}`,
      }));
    }

    if (queryMode === 'builder' && collectionPath.length > 0 && collectionPath.length !== 2) {
      pushFinding(blockers, blockerSeen, createFinding({
        severity: 'blocker',
        code: 'CHART_COLLECTION_PATH_SHAPE_INVALID',
        message: 'ChartBlockModel 使用 builder 查询时，collectionPath 必须是 [dataSourceKey, collectionName] 两段结构。',
        path: `${pathValue}.stepParams.chartSettings.configure.query.collectionPath`,
        mode,
        dedupeKey: `CHART_COLLECTION_PATH_SHAPE_INVALID:${pathValue}`,
        details: {
          collectionPath,
        },
      }));
    }

    if (queryMode === 'builder' && measures.length === 0) {
      pushFinding(blockers, blockerSeen, createFinding({
        severity: 'blocker',
        code: 'CHART_BUILDER_MEASURES_MISSING',
        message: 'ChartBlockModel 使用 builder 查询时，必须显式提供至少一个 query.measures 项，否则运行时不会返回可渲染图表数据。',
        path: `${pathValue}.stepParams.chartSettings.configure.query.measures`,
        mode,
        dedupeKey: `CHART_BUILDER_MEASURES_MISSING:${pathValue}`,
      }));
    }

    if (queryMode === 'builder') {
      validateFieldList(query?.measures, 'measures');
      validateFieldList(query?.dimensions, 'dimensions');
      validateFieldList(query?.orders, 'orders');
    }

    if (queryMode === 'sql') {
      if (!normalizeOptionalText(query?.sqlDatasource)) {
        pushFinding(blockers, blockerSeen, createFinding({
          severity: 'blocker',
          code: 'CHART_SQL_DATASOURCE_MISSING',
          message: 'ChartBlockModel 使用 sql 查询时，必须显式提供 chartSettings.configure.query.sqlDatasource。',
          path: `${pathValue}.stepParams.chartSettings.configure.query.sqlDatasource`,
          mode,
          dedupeKey: `CHART_SQL_DATASOURCE_MISSING:${pathValue}`,
        }));
      }
      if (!normalizeOptionalText(query?.sql)) {
        pushFinding(blockers, blockerSeen, createFinding({
          severity: 'blocker',
          code: 'CHART_SQL_TEXT_MISSING',
          message: 'ChartBlockModel 使用 sql 查询时，必须显式提供 chartSettings.configure.query.sql。',
          path: `${pathValue}.stepParams.chartSettings.configure.query.sql`,
          mode,
          dedupeKey: `CHART_SQL_TEXT_MISSING:${pathValue}`,
        }));
      }
    }

    if (optionMode === 'basic' && !optionBuilder) {
      pushFinding(blockers, blockerSeen, createFinding({
        severity: 'blocker',
        code: 'CHART_BASIC_OPTION_BUILDER_MISSING',
        message: 'ChartBlockModel 使用 basic option 时，必须显式提供 chartSettings.configure.chart.option.builder；仅有 option.mode=basic 不足以生成可渲染配置。',
        path: `${pathValue}.stepParams.chartSettings.configure.chart.option.builder`,
        mode,
        dedupeKey: `CHART_BASIC_OPTION_BUILDER_MISSING:${pathValue}`,
      }));
    }

    if (optionMode === 'custom' && !normalizeOptionalText(option?.raw)) {
      pushFinding(blockers, blockerSeen, createFinding({
        severity: 'blocker',
        code: 'CHART_CUSTOM_OPTION_RAW_MISSING',
        message: 'ChartBlockModel 使用 custom option 时，必须显式提供 chartSettings.configure.chart.option.raw。',
        path: `${pathValue}.stepParams.chartSettings.configure.chart.option.raw`,
        mode,
        dedupeKey: `CHART_CUSTOM_OPTION_RAW_MISSING:${pathValue}`,
      }));
    }

    if (normalizeOptionalText(events?.raw) && !optionMode) {
      pushFinding(warnings, warningSeen, createFinding({
        severity: 'warning',
        code: 'CHART_EVENTS_WITHOUT_OPTION_MODE',
        message: 'ChartBlockModel 提供了 events.raw，但没有显式 option.mode；建议至少固定为 basic 或 custom。',
        path: `${pathValue}.stepParams.chartSettings.configure.chart.events.raw`,
        mode,
        dedupeKey: `CHART_EVENTS_WITHOUT_OPTION_MODE:${pathValue}`,
      }));
    }
  });
}

function inspectGridCardBlocks(payload, mode, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || typeof node.use !== 'string') {
      return;
    }

    if (node.use === 'GridCardBlockModel') {
      const itemNode = isPlainObject(node.subModels?.item) ? node.subModels.item : null;
      if (!itemNode) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'GRID_CARD_ITEM_SUBMODEL_MISSING',
          message: 'GridCardBlockModel 缺少 subModels.item；没有 GridCardItemModel 时，页面通常会落库成功但卡片区域空白。',
          path: `${pathValue}.subModels.item`,
          mode,
          dedupeKey: `GRID_CARD_ITEM_SUBMODEL_MISSING:${pathValue}`,
        }));
        return;
      }
      if (!GRID_CARD_ITEM_MODEL_USES.has(normalizeOptionalText(itemNode.use))) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'GRID_CARD_ITEM_USE_INVALID',
          message: 'GridCardBlockModel.subModels.item 只能使用 GridCardItemModel。',
          path: `${pathValue}.subModels.item.use`,
          mode,
          dedupeKey: `GRID_CARD_ITEM_USE_INVALID:${pathValue}`,
          details: {
            actualUse: normalizeOptionalText(itemNode.use) || null,
          },
        }));
      }
      return;
    }

    if (node.use === 'GridCardItemModel') {
      const gridNode = isPlainObject(node.subModels?.grid) ? node.subModels.grid : null;
      if (!gridNode || normalizeOptionalText(gridNode.use) !== 'DetailsGridModel') {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'GRID_CARD_ITEM_GRID_MISSING_OR_INVALID',
          message: 'GridCardItemModel 必须显式挂接 subModels.grid.use=\'DetailsGridModel\'；否则卡片内容区不会稳定渲染。',
          path: `${pathValue}.subModels.grid`,
          mode,
          dedupeKey: `GRID_CARD_ITEM_GRID_MISSING_OR_INVALID:${pathValue}`,
          details: {
            actualUse: normalizeOptionalText(gridNode?.use) || null,
          },
        }));
      }
    }
  });
}

function inspectActionSlots(payload, mode, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || typeof node.use !== 'string') {
      return;
    }

    if (node.use === 'TableBlockModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: COLLECTION_ACTION_MODEL_USES,
        code: 'TABLE_COLLECTION_ACTION_SLOT_USE_INVALID',
        message: `TableBlockModel 的 actions 槽位只能放 ${[...COLLECTION_ACTION_MODEL_USES].join(' / ')}，不能回退成泛型 ActionModel 或 record action。`,
        mode,
        blockers,
        seen,
      });
      return;
    }

    if (node.use === 'TableActionsColumnModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: RECORD_ACTION_MODEL_USES,
        code: 'TABLE_RECORD_ACTION_SLOT_USE_INVALID',
        message: `TableActionsColumnModel 的 actions 槽位只能放 record action uses，不能回退成泛型 ActionModel 或 collection action。`,
        mode,
        blockers,
        seen,
      });
      return;
    }

    if (node.use === 'DetailsBlockModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: RECORD_ACTION_MODEL_USES,
        code: 'DETAILS_ACTION_SLOT_USE_INVALID',
        message: `DetailsBlockModel 的 actions 槽位只能放 record action uses，不能回退成泛型 ActionModel 或 collection action。`,
        mode,
        blockers,
        seen,
      });
      return;
    }

    if (node.use === 'FilterFormBlockModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: FILTER_FORM_ACTION_MODEL_USES,
        code: 'FILTER_FORM_ACTION_SLOT_USE_INVALID',
        message: `FilterFormBlockModel 的 actions 槽位只能放 filter-form action uses，不能回退成泛型 ActionModel。`,
        mode,
        blockers,
        seen,
      });
      return;
    }

    if (node.use === 'GridCardBlockModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: COLLECTION_ACTION_MODEL_USES,
        code: 'GRID_CARD_BLOCK_ACTION_SLOT_USE_INVALID',
        message: `GridCardBlockModel 的 actions 槽位只能放 collection action uses，不能回退成泛型 ActionModel 或 record action。`,
        mode,
        blockers,
        seen,
      });
      return;
    }

    if (node.use === 'GridCardItemModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: RECORD_ACTION_MODEL_USES,
        code: 'GRID_CARD_ITEM_ACTION_SLOT_USE_INVALID',
        message: `GridCardItemModel 的 actions 槽位只能放 record action uses，不能回退成泛型 ActionModel 或 collection action。`,
        mode,
        blockers,
        seen,
      });
    }
  });
}

function inspectUnsupportedFieldSlots(payload, mode, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || typeof node.use !== 'string' || !node.use.endsWith('FieldModel')) {
      return;
    }
    if (!isPlainObject(node.subModels) || !Object.hasOwn(node.subModels, 'page')) {
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'FIELD_MODEL_PAGE_SLOT_UNSUPPORTED',
      message: `${node.use} 不支持 subModels.page；这类坏树通常来自错误的模板 clone 或 slot 误判，会在服务端 readback 时退化。`,
      path: `${pathValue}.subModels.page`,
      mode,
      dedupeKey: `FIELD_MODEL_PAGE_SLOT_UNSUPPORTED:${pathValue}`,
      details: {
        fieldUse: node.use,
      },
    }));
  });
}

function inspectDetailsBlocks(payload, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || node.use !== 'DetailsBlockModel') {
      return;
    }

    const gridItems = Array.isArray(node.subModels?.grid?.subModels?.items) ? node.subModels.grid.subModels.items : [];
    gridItems.forEach((item, index) => {
      if (!isPlainObject(item) || item.use !== 'DetailsItemModel') {
        return;
      }
      const fieldUse = typeof item.subModels?.field?.use === 'string' ? item.subModels.field.use.trim() : '';
      if (!fieldUse) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'DETAILS_ITEM_FIELD_SUBMODEL_MISSING',
          message: 'DetailsItemModel 不能只写 fieldSettings.init；必须显式补 subModels.field。否则运行时在 titleField 等逻辑里会直接访问 ctx.model.subModels.field 导致 TypeError。',
          path: `${pathValue}.subModels.grid.subModels.items[${index}]`,
          mode,
          dedupeKey: `DETAILS_ITEM_FIELD_SUBMODEL_MISSING:${pathValue}:${index}`,
          details: {
            fieldPath: item.stepParams?.fieldSettings?.init?.fieldPath || null,
            collectionName: item.stepParams?.fieldSettings?.init?.collectionName || null,
          },
        }));
        return;
      }
      const bindingUse = typeof item.subModels?.field?.stepParams?.fieldBinding?.use === 'string'
        ? item.subModels.field.stepParams.fieldBinding.use.trim()
        : '';
      if (fieldUse === 'FieldModel' && bindingUse) {
        return;
      }
      pushFinding(warnings, seen, createFinding({
        severity: 'warning',
        code: 'DETAILS_ITEM_FIELD_BINDING_ENTRY_INVALID',
        message: 'DetailsItemModel.subModels.field 当前建议统一走 FieldModel + stepParams.fieldBinding.use 入口；直接落具体 display field model 仍可能造成 builder/readback/runtime 形态不一致，应视为高风险诊断而非当前硬 blocker。',
        path: `${pathValue}.subModels.grid.subModels.items[${index}].subModels.field`,
        mode,
        dedupeKey: `DETAILS_ITEM_FIELD_BINDING_ENTRY_INVALID:${pathValue}:${index}`,
        details: {
          fieldUse,
          bindingUse: bindingUse || null,
        },
      }));
    });

    if (hasMeaningfulDetailsContent(node)) {
      return;
    }

    const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
    pushFinding(targetList, seen, createFinding({
      severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
      code: 'EMPTY_DETAILS_BLOCK',
      message: 'DetailsBlockModel 只有空 grid 壳，没有任何详情字段、动作或子业务区块。',
      path: pathValue,
      mode,
      dedupeKey: `EMPTY_DETAILS_BLOCK:${pathValue}`,
      details: {
        collectionName: node.stepParams?.resourceSettings?.init?.collectionName || null,
      },
    }));
  });
}

function inspectTableBlocks(payload, mode, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || node.use !== 'TableColumnModel') {
      return;
    }

    const fieldUse = typeof node.subModels?.field?.use === 'string' ? node.subModels.field.use.trim() : '';
    if (!fieldUse) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'TABLE_COLUMN_FIELD_SUBMODEL_MISSING',
        message: 'TableColumnModel 不能只写 fieldSettings.init；必须显式补 subModels.field。运行时渲染单元格与快速编辑都会直接读取这一层子模型。',
        path: pathValue,
        mode,
        dedupeKey: `TABLE_COLUMN_FIELD_SUBMODEL_MISSING:${pathValue}`,
        details: {
          fieldPath: node.stepParams?.fieldSettings?.init?.fieldPath || null,
          collectionName: node.stepParams?.fieldSettings?.init?.collectionName || null,
        },
      }));
      return;
    }

    const bindingUse = typeof node.subModels?.field?.stepParams?.fieldBinding?.use === 'string'
      ? node.subModels.field.stepParams.fieldBinding.use.trim()
      : '';
    if (fieldUse === 'FieldModel' && bindingUse) {
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'TABLE_COLUMN_FIELD_BINDING_ENTRY_INVALID',
      message: 'TableColumnModel.subModels.field 必须使用 FieldModel 作为入口，并通过 stepParams.fieldBinding.use 指向具体 display field model。直接落具体 Display*FieldModel use 会让 builder/runtime 结构不一致。',
      path: `${pathValue}.subModels.field`,
      mode,
      dedupeKey: `TABLE_COLUMN_FIELD_BINDING_ENTRY_INVALID:${pathValue}`,
      details: {
        fieldUse,
        bindingUse: bindingUse || null,
      },
    }));
  });
}

function inspectFilterContainers(payload, metadata, mode, requirements, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !FILTER_CONTAINER_MODEL_USES.has(node.use)) {
      return;
    }

    const expectedContract = findMatchingExpectedFilterContract(node, pathValue, requirements);
    if (!expectedContract) {
      return;
    }

    const selectorKind = getFilterContainerSelectorKind(node);
    if (expectedContract.selectorKind && expectedContract.selectorKind !== 'any' && expectedContract.selectorKind !== selectorKind) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FILTER_SELECTOR_CONTRACT_MISMATCH',
        message: `当前区块的 selector 形态为 "${selectorKind}"，与声明契约要求的 "${expectedContract.selectorKind}" 不一致。`,
        path: pathValue,
        mode,
        dedupeKey: `FILTER_SELECTOR_CONTRACT_MISMATCH:${pathValue}:${expectedContract.selectorKind}:${selectorKind}`,
        details: {
          use: node.use,
          selectorKind,
          expectedContract,
        },
      }));
    }

    if (!isMetadataTrustSufficient(requirements?.metadataTrust?.runtimeSensitive || null, expectedContract.metadataTrust)) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'FILTER_CONTRACT_METADATA_TRUST_INSUFFICIENT',
        message: '当前区块声明了 runtime-sensitive filter 契约，但 metadataTrust 还不够高，不能仅凭低可信 metadata 放行。',
        path: pathValue,
        mode,
        dedupeKey: `FILTER_CONTRACT_METADATA_TRUST_INSUFFICIENT:${pathValue}:${expectedContract.metadataTrust}`,
        details: {
          use: node.use,
          actualMetadataTrust: requirements?.metadataTrust?.runtimeSensitive || null,
          expectedContract,
        },
      }));
    }
  });
}

function inspectPopupActions(payload, metadata, mode, requirements, warnings, blockers, seen) {
  const businessUses = resolveBusinessBlockUses(requirements);
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || typeof node.use !== 'string' || !node.use.endsWith('ActionModel')) {
      return;
    }
    const openView = node.stepParams?.popupSettings?.openView;
    const pageNode = node.subModels?.page;
    const isPopupAction = isPlainObject(openView) || pageNode;
    if (!isPopupAction) {
      return;
    }

    const openViewCollectionName = typeof openView?.collectionName === 'string' ? openView.collectionName.trim() : '';
    const usesFilterByTk = Object.hasOwn(openView || {}, 'filterByTk')
      && openView?.filterByTk !== undefined
      && openView?.filterByTk !== null
      && String(openView.filterByTk).trim() !== '';
    if (openViewCollectionName && usesFilterByTk) {
      const runtimeSensitiveTrust = requirements?.metadataTrust?.runtimeSensitive || null;
      if (runtimeSensitiveTrust && runtimeSensitiveTrust !== 'live' && runtimeSensitiveTrust !== 'not-required') {
        const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'METADATA_TRUST_INSUFFICIENT',
          message: 'popup/openView 依赖 runtime-sensitive 的 filterByTk 解析时，不能只信 artifact/cache metadata；必须先拿到 live metadata。',
          path: `${pathValue}.stepParams.popupSettings.openView.filterByTk`,
          mode,
          dedupeKey: `METADATA_TRUST_INSUFFICIENT:${pathValue}:${runtimeSensitiveTrust}`,
          details: {
            actionUse: node.use,
            collectionName: openViewCollectionName,
            runtimeSensitiveTrust,
          },
        }));
      }

      const openViewCollectionMeta = getCollectionMeta(metadata, openViewCollectionName);
      if (openViewCollectionMeta && !openViewCollectionMeta.filterTargetKey) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'OPEN_VIEW_COLLECTION_FILTER_TARGET_KEY_MISSING',
          message: 'popup/openView 在使用 filterByTk 时，目标 collection 必须声明 filterTargetKey；否则 runtime 会在解析记录操作或弹窗参数时直接报错。',
          path: `${pathValue}.stepParams.popupSettings.openView.filterByTk`,
          mode,
          dedupeKey: `OPEN_VIEW_COLLECTION_FILTER_TARGET_KEY_MISSING:${pathValue}:${openViewCollectionName}`,
          details: {
            actionUse: node.use,
            collectionName: openViewCollectionName,
            filterByTk: openView.filterByTk,
          },
        }));
      }
    }

    const declaredPageUse = typeof openView?.pageModelClass === 'string' ? openView.pageModelClass.trim() : '';
    const actualPageUse = isPlainObject(pageNode) && typeof pageNode.use === 'string' ? pageNode.use.trim() : '';
    if (declaredPageUse && !SUPPORTED_POPUP_PAGE_USES_SET.has(declaredPageUse)) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'POPUP_PAGE_USE_INVALID',
        message: `popup/openView 的 pageModelClass 必须是 ${SUPPORTED_POPUP_PAGE_USES.join(' / ')} 之一。`,
        path: `${pathValue}.stepParams.popupSettings.openView.pageModelClass`,
        mode,
        dedupeKey: `POPUP_PAGE_USE_INVALID:${pathValue}:declared:${declaredPageUse}`,
        details: {
          actionUse: node.use,
          declaredPageUse,
          actualPageUse: actualPageUse || null,
        },
      }));
    }
    if (pageNode && (!actualPageUse || !SUPPORTED_POPUP_PAGE_USES_SET.has(actualPageUse))) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'POPUP_PAGE_USE_INVALID',
        message: `popup/openView 的 subModels.page 必须落成 ${SUPPORTED_POPUP_PAGE_USES.join(' / ')}，不能写成其他结构壳。`,
        path: `${pathValue}.subModels.page`,
        mode,
        dedupeKey: `POPUP_PAGE_USE_INVALID:${pathValue}:actual:${actualPageUse || 'missing'}`,
        details: {
          actionUse: node.use,
          declaredPageUse: declaredPageUse || null,
          actualPageUse: actualPageUse || null,
        },
      }));
    }
    if (declaredPageUse && actualPageUse && declaredPageUse !== actualPageUse) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'POPUP_PAGE_USE_MISMATCH',
        message: 'popup/openView 的 pageModelClass 与 subModels.page.use 必须严格一致，否则很容易出现按钮位置错乱、drawer/form 结构异常或上下文不通。',
        path: `${pathValue}.subModels.page`,
        mode,
        dedupeKey: `POPUP_PAGE_USE_MISMATCH:${pathValue}:${declaredPageUse}:${actualPageUse}`,
        details: {
          actionUse: node.use,
          declaredPageUse,
          actualPageUse,
        },
      }));
    }

    const tabCount = pageNode ? countUses(pageNode, PAGE_TAB_MODEL_USES) : 0;
    const gridCount = pageNode ? countUses(pageNode, GRID_MODEL_USES) : 0;
    const blockCount = pageNode ? countUses(pageNode, businessUses) : 0;
    if (!pageNode || tabCount === 0 || gridCount === 0) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'POPUP_ACTION_MISSING_SUBTREE',
        message: 'popup/openView 动作缺少完整的 page/tab/grid 子树。',
        path: pathValue,
        mode,
        dedupeKey: `POPUP_ACTION_MISSING_SUBTREE:${pathValue}`,
        details: {
          use: node.use,
          hasPage: Boolean(pageNode),
          tabCount,
          gridCount,
        },
      }));
    } else if (blockCount === 0) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'EMPTY_POPUP_GRID',
        message: 'popup/openView 子树只有 page/tab/grid 壳，没有实际业务 block。',
        path: pathValue,
        mode,
        dedupeKey: `EMPTY_POPUP_GRID:${pathValue}`,
        details: {
          use: node.use,
          blockCount,
        },
      }));
    }

    if (pageNode) {
      const subtreeStrings = collectStrings(pageNode);
      const usesInputArgsFilterByTk = subtreeStrings.some((value) => value.includes(POPUP_INPUT_ARGS_FILTER_BY_TK));
      if (usesInputArgsFilterByTk && !openView?.filterByTk) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'POPUP_CONTEXT_REFERENCE_WITHOUT_INPUT_ARG',
          message: 'popup 子树依赖 ctx.view.inputArgs.filterByTk，但动作层没有显式传入 filterByTk。',
          path: pathValue,
          mode,
          dedupeKey: `POPUP_CONTEXT_REFERENCE_WITHOUT_INPUT_ARG:${pathValue}`,
          details: {
            use: node.use,
            collectionName: openView?.collectionName || null,
          },
        }));
      }

      const nestedRelationBlocks = findNestedRelationBlocks(pageNode, openView?.collectionName || null);
      for (const relationBlock of nestedRelationBlocks) {
        const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'RELATION_BLOCK_WITH_EMPTY_FILTER',
          message: 'popup 内关系区块缺少明确的 relation filter，当前只剩空 dataScope.filter。',
          path: relationBlock.path,
          mode,
          dedupeKey: `RELATION_BLOCK_WITH_EMPTY_FILTER:${relationBlock.path}`,
          details: relationBlock,
        }));
      }

      const genericRelationBlocks = findRelationBlocksUsingGenericPopupFilter(
        pageNode,
        openView?.collectionName || null,
        metadata,
      );
      for (const relationBlock of genericRelationBlocks) {
        pushFinding(warnings, seen, createFinding({
          severity: 'warning',
          code: 'RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT',
          message: '当前 child-side relation filter 已可用；若 parent->child association resource 已验证，可进一步收敛成 associationName + sourceId。',
          path: relationBlock.path,
          mode,
          dedupeKey: `RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT:${relationBlock.path}`,
          details: relationBlock,
        }));
      }

      const ambiguousAssociationBlocks = findRelationBlocksUsingAmbiguousAssociationContext(
        pageNode,
        openView?.collectionName || null,
        metadata,
      );
      for (const relationBlock of ambiguousAssociationBlocks) {
        const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE',
          message: 'popup 内关联子表的 associationName 不能只复用子表指向父表的 belongsTo 字段名；先基于稳定 reference 或 live tree 验真。',
          path: relationBlock.path,
          mode,
          dedupeKey: `ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE:${relationBlock.path}`,
          details: relationBlock,
        }));
      }
    }

    if (openView && isHardcodedFilterValue(openView.filterByTk)) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'HARDCODED_FILTER_BY_TK',
        message: 'popup/openView 的 filterByTk 使用了硬编码样本值。',
        path: `${pathValue}.stepParams.popupSettings.openView.filterByTk`,
        mode,
        dedupeKey: `HARDCODED_FILTER_BY_TK:${pathValue}.openView`,
        details: {
          value: openView.filterByTk,
        },
      }));
    }
  });
}

function inspectFilters(payload, metadata, mode, blockers, seen) {
  walk(payload, (node, pathValue, context) => {
    if (!isPlainObject(node) || !pathValue.endsWith('.dataScope.filter')) {
      return;
    }
    validateFilterGroup({
      filter: node,
      path: pathValue,
      collectionName: context.resourceCollectionName,
      metadata,
      mode,
      blockers,
      seen,
    });
  });
}

function validateFilterGroup({ filter, path: filterPath, collectionName, metadata, mode, blockers, seen }) {
  if (!isPlainObject(filter) || !Array.isArray(filter.items) || typeof filter.logic !== 'string') {
    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'FILTER_GROUP_MALFORMED',
      message: 'dataScope.filter 必须包含合法的 logic 和 items。',
      path: filterPath,
      mode,
    }));
    return;
  }

  try {
    normalizeFilterLogic(filter.logic);
  } catch (error) {
    pushFinding(blockers, seen, createUnsupportedFilterLogicFinding({
      path: `${filterPath}.logic`,
      mode,
      logic: filter.logic,
    }));
    return;
  }

  const collectionMeta = getCollectionMeta(metadata, collectionName);
  const validateItem = (item, itemPath) => {
    if (!isPlainObject(item)) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FILTER_GROUP_MALFORMED',
        message: 'filter item 必须是 condition 或 group 对象。',
        path: itemPath,
        mode,
      }));
      return;
    }

    const isCondition = typeof item.path === 'string' && typeof item.operator === 'string';
    const looksLikeGroup = Object.hasOwn(item, 'logic') || Object.hasOwn(item, 'items');
    const looksLikeFieldCondition = typeof item.field === 'string' && typeof item.operator === 'string';

    if (looksLikeFieldCondition && !isCondition) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FILTER_ITEM_USES_FIELD_NOT_PATH',
        message: 'filter condition 只能使用 path，不允许使用 field。',
        path: itemPath,
        mode,
      }));
      return;
    }

    if (isCondition) {
      const isSimplePath = isSimpleFieldName(item.path) && !hasTemplateExpression(item.path);
      const directField = collectionMeta && isSimplePath
        ? collectionMeta.fieldsByName.get(item.path) || null
        : null;
      const associationFromForeignKey = collectionMeta && isSimplePath
        ? collectionMeta.associationsByForeignKey.get(item.path) || null
        : null;

      if (collectionMeta && isSimplePath && !directField && !associationFromForeignKey) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FIELD_PATH_NOT_FOUND',
          message: `filter path "${item.path}" 在 collection "${collectionName}" 中不存在。`,
          path: itemPath,
          mode,
          dedupeKey: `FILTER_FIELD_PATH_NOT_FOUND:${collectionName}:${item.path}`,
          details: {
            collectionName,
            fieldPath: item.path,
          },
        }));
        return;
      }

      if (directField && isBelongsToLikeField(directField) && isScalarComparisonOperator(item.operator)) {
        const scalarPathHints = getBelongsToScalarPathHints(directField);
        const suggestedPaths = scalarPathHints?.suggestedPaths || [];
        const suggestionMessage = suggestedPaths.length > 0
          ? `；请改为可比较的标量路径，例如 ${suggestedPaths.map((value) => `"${value}"`).join(' 或 ')}。`
          : '；当前 metadata 未提供 foreignKey 或 targetKey，不能继续猜字段名。';
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH',
          message: `belongsTo 字段 "${item.path}" 不能直接搭配标量操作符 "${item.operator}"${suggestionMessage}`,
          path: itemPath,
          mode,
          dedupeKey: `BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH:${collectionName}:${item.path}:${item.operator}`,
          details: {
            collectionName,
            fieldPath: item.path,
            operator: item.operator,
            ...(scalarPathHints || {
              associationField: directField.name,
              foreignKey: null,
              targetCollection: directField.target || null,
              targetKey: null,
              suggestedPaths: [],
            }),
          },
        }));
      }
      return;
    }

    if (looksLikeGroup && Array.isArray(item.items) && typeof item.logic === 'string') {
      try {
        normalizeFilterLogic(item.logic);
      } catch (error) {
        pushFinding(blockers, seen, createUnsupportedFilterLogicFinding({
          path: `${itemPath}.logic`,
          mode,
          logic: item.logic,
        }));
        return;
      }
      item.items.forEach((child, index) => validateItem(child, `${itemPath}.items[${index}]`));
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'FILTER_GROUP_MALFORMED',
      message: 'filter item 既不是合法 condition，也不是合法 group。',
      path: itemPath,
      mode,
    }));
  };

  filter.items.forEach((item, index) => validateItem(item, `${filterPath}.items[${index}]`));
}

function inspectFieldBindings(payload, metadata, mode, requirements, warnings, blockers, seen) {
  walk(payload, (node, pathValue, context) => {
    if (
      !isPlainObject(node)
      || typeof node.use !== 'string'
      || !context.fieldBinding?.collectionName
      || !context.fieldBinding.fieldPath
    ) {
      return;
    }
    const collectionMeta = getCollectionMeta(metadata, context.fieldBinding.collectionName);
    if (!collectionMeta) {
      return;
    }

    const { fieldPath, collectionName, associationPathName } = context.fieldBinding;
    const effectiveUse = getEffectiveNodeUse(node, context.use);
    if (hasTemplateExpression(fieldPath)) {
      return;
    }

    const isSimpleBinding = isSimpleFieldName(fieldPath);
    const resolvedFieldBinding = resolveFieldPathInMetadata(metadata, collectionName, fieldPath);
    const associationFromForeignKey = isSimpleBinding ? collectionMeta.associationsByForeignKey.get(fieldPath) || null : null;

    if (associationFromForeignKey && FIELD_MODELS_REQUIRING_ASSOCIATION_TARGET.has(effectiveUse)) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FOREIGN_KEY_USED_AS_FIELD_PATH',
        message: `fieldPath "${fieldPath}" 是关联字段 "${associationFromForeignKey.name}" 的 foreignKey，不应直接作为 UI 字段绑定。`,
        path: pathValue,
        mode,
        dedupeKey: `FOREIGN_KEY_USED_AS_FIELD_PATH:${collectionName}:${fieldPath}:${effectiveUse}`,
        details: {
          collectionName,
          fieldPath,
          associationField: associationFromForeignKey.name,
          use: effectiveUse,
        },
      }));
      return;
    }

    if (!resolvedFieldBinding) {
      if (!associationFromForeignKey) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FIELD_PATH_NOT_FOUND',
          message: `fieldPath "${fieldPath}" 在 collection "${collectionName}" 中不存在。`,
          path: pathValue,
          mode,
          dedupeKey: `FIELD_PATH_NOT_FOUND:${collectionName}:${fieldPath}`,
          details: {
            collectionName,
            fieldPath,
          },
        }));
      }
      return;
    }

    const expectedAssociationPathName = !isSimpleBinding
      ? getExpectedAssociationPathName(metadata, collectionName, fieldPath)
      : null;
    if (expectedAssociationPathName) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      if (!associationPathName) {
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH',
          message: `父 collection 上的 dotted 关联展示字段 "${fieldPath}" 必须显式补 associationPathName="${expectedAssociationPathName}"，否则 runtime 可能拿不到关联 appends。`,
          path: pathValue,
          mode,
          dedupeKey: `DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH:${collectionName}:${fieldPath}`,
          details: {
            collectionName,
            fieldPath,
            expectedAssociationPathName,
          },
        }));
      } else if (associationPathName !== expectedAssociationPathName) {
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH',
          message: `父 collection 上的 dotted 关联展示字段 "${fieldPath}" 必须把 associationPathName 设为 "${expectedAssociationPathName}"，当前为 "${associationPathName}"。`,
          path: pathValue,
          mode,
          dedupeKey: `DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH:${collectionName}:${fieldPath}:${associationPathName}`,
          details: {
            collectionName,
            fieldPath,
            associationPathName,
            expectedAssociationPathName,
          },
        }));
      }

      const clickableTitlePath = context.inTableColumn && (hasClickToOpenEnabled(node) || hasPopupOpenViewConfigured(node));
      if (clickableTitlePath && CLICKABLE_ASSOCIATION_TITLE_FIELD_MODEL_USES.has(effectiveUse)) {
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE',
          message: `表格列 "${fieldPath}" 是关联标题 dotted path，并启用了 click-to-open/popup；默认不要让 dotted path 自己承担打开行为，请改成关系字段 "${expectedAssociationPathName}" 的原生列，再用标题字段展示名称并挂 openView。`,
          path: pathValue,
          mode,
          dedupeKey: `TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE:${collectionName}:${fieldPath}:${effectiveUse}`,
          details: {
            collectionName,
            fieldPath,
            associationPathName: expectedAssociationPathName,
            effectiveUse,
            suggestedFieldPath: expectedAssociationPathName,
            suggestedDisplayFieldPath: fieldPath,
          },
        }));
      }
      if (
        clickableTitlePath
        && JS_RELATION_WORKAROUND_MODEL_USES.has(effectiveUse)
        && !hasExplicitJsIntent(requirements)
      ) {
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT',
          message: `表格列 "${fieldPath}" 当前使用 ${effectiveUse} 承担关联标题 click-to-open/popup，但本轮 requirements 未声明显式 JS 意图；默认应优先改用关系字段 "${expectedAssociationPathName}" 的原生列。`,
          path: pathValue,
          mode,
          dedupeKey: `TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT:${collectionName}:${fieldPath}:${effectiveUse}`,
          details: {
            collectionName,
            fieldPath,
            associationPathName: expectedAssociationPathName,
            effectiveUse,
            requiredIntentTag: 'js.explicit',
            suggestedFieldPath: expectedAssociationPathName,
            suggestedDisplayFieldPath: fieldPath,
          },
        }));
      }
    }

    const directField = resolvedFieldBinding.field;
    const parentCollectionName = context.resourceCollectionName;
    if (
      associationPathName
      && parentCollectionName
      && collectionName !== parentCollectionName
      && isSimpleBinding
    ) {
      const parentAssociationBinding = resolveFieldPathInMetadata(metadata, parentCollectionName, associationPathName);
      if (
        parentAssociationBinding?.field
        && isAssociationField(parentAssociationBinding.field)
        && parentAssociationBinding.field.target === collectionName
      ) {
        const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE',
          message: `关联展示字段不应拆成 target collection "${collectionName}" + associationPathName "${associationPathName}" + simple fieldPath "${fieldPath}"；请改为父 collection 上的完整 dotted path。`,
          path: pathValue,
          mode,
          dedupeKey: `ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE:${parentCollectionName}:${collectionName}:${associationPathName}.${fieldPath}`,
          details: {
            parentCollectionName,
            collectionName,
            associationPathName,
            fieldPath,
            suggestedCollectionName: parentCollectionName,
            suggestedFieldPath: `${associationPathName}.${fieldPath}`,
          },
        }));
      }
    }

    const needsAssociationTarget = FIELD_MODELS_REQUIRING_ASSOCIATION_TARGET.has(effectiveUse);
    const isDirectAssociationField = isSimpleBinding
      && (directField.target || directField.foreignKey || directField.type === 'belongsTo' || directField.interface === 'm2o');
    if (!needsAssociationTarget || !isDirectAssociationField) {
      return;
    }

    const targetCollectionMeta = getCollectionMeta(metadata, directField.target);
    if (!targetCollectionMeta) {
      const targetList = mode === VALIDATION_CASE_MODE
        && (effectiveUse === 'FormItemModel' || effectiveUse === FORM_ASSOCIATION_FIELD_MODEL_USE)
        ? blockers
        : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: targetList === blockers ? 'blocker' : 'warning',
        code: targetList === blockers ? 'ASSOCIATION_INPUT_TARGET_METADATA_INCOMPLETE' : 'ASSOCIATION_TARGET_METADATA_MISSING',
        message: targetList === blockers
          ? `表单关联字段 "${fieldPath}" 的目标 collection "${directField.target}" 缺少 metadata，无法在写前验证 titleField/default binding 契约。`
          : `关联字段 "${fieldPath}" 的目标 collection "${directField.target}" 未提供元数据，无法校验显示字段。`,
        path: pathValue,
        mode,
        dedupeKey: `${targetList === blockers ? 'ASSOCIATION_INPUT_TARGET_METADATA_INCOMPLETE' : 'ASSOCIATION_TARGET_METADATA_MISSING'}:${collectionName}:${fieldPath}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
        },
      }));
      return;
    }

    if (effectiveUse === FILTER_FORM_ASSOCIATION_FIELD_MODEL_USE && !targetCollectionMeta.titleField) {
      const suggestedScalarField = getSuggestedScalarFieldPath(metadata, directField.target);
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FILTER_FORM_ASSOCIATION_REQUIRES_EXPLICIT_SCALAR_PATH',
        message: suggestedScalarField
          ? `筛选里的关联字段 "${fieldPath}" 目标 collection "${directField.target}" 没有 titleField；请改成显式 scalar path（例如 "${fieldPath}.${suggestedScalarField}"），不要直接生成 ${effectiveUse}。`
          : `筛选里的关联字段 "${fieldPath}" 目标 collection "${directField.target}" 没有 titleField；请改成显式 scalar path，不要直接生成 ${effectiveUse}。`,
        path: pathValue,
        mode,
        dedupeKey: `FILTER_FORM_ASSOCIATION_REQUIRES_EXPLICIT_SCALAR_PATH:${collectionName}:${fieldPath}:${directField.target}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          use: effectiveUse,
          suggestedFieldPath: suggestedScalarField ? `${fieldPath}.${suggestedScalarField}` : null,
        },
      }));
      return;
    }

    const targetDisplayField = targetCollectionMeta.titleField || targetCollectionMeta.filterTargetKey;
    const allowAssociationInputFilterTargetFallback =
      (effectiveUse === 'FormItemModel' || effectiveUse === FORM_ASSOCIATION_FIELD_MODEL_USE)
      && Boolean(targetCollectionMeta.filterTargetKey);
    if (DIRECT_ASSOCIATION_TEXT_FIELD_MODEL_USES.has(effectiveUse)) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL',
        message: `关联字段 "${fieldPath}" 不应直接用 ${effectiveUse} 绑定自身；请显式选择目标 collection "${directField.target}" 的稳定显示策略。`,
        path: pathValue,
        mode,
        dedupeKey: `ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL:${collectionName}:${fieldPath}:${pathValue}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          suggestedTitleField: targetDisplayField || null,
        },
      }));
    }
    if (
      !allowAssociationInputFilterTargetFallback
      && (
        !targetDisplayField
        || (targetCollectionMeta.fields.length > 0 && !targetCollectionMeta.fieldsByName.has(targetDisplayField))
      )
    ) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'ASSOCIATION_DISPLAY_TARGET_UNRESOLVED',
        message: `关联字段 "${fieldPath}" 的目标 collection "${directField.target}" 缺少可解析的 title/filterTargetKey 字段。`,
        path: pathValue,
        mode,
        dedupeKey: `ASSOCIATION_DISPLAY_TARGET_UNRESOLVED:${collectionName}:${fieldPath}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          titleField: targetCollectionMeta.titleField,
          filterTargetKey: targetCollectionMeta.filterTargetKey,
        },
      }));
    }

    if (effectiveUse !== 'FormItemModel' && effectiveUse !== FORM_ASSOCIATION_FIELD_MODEL_USE) {
      return;
    }

    if (!Array.isArray(targetCollectionMeta.fields) || targetCollectionMeta.fields.length === 0) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'ASSOCIATION_INPUT_TARGET_METADATA_INCOMPLETE',
        message: `表单关联字段 "${fieldPath}" 的目标 collection "${directField.target}" 缺少字段元数据，无法模拟 titleField -> getField(label) -> default binding 这条 runtime 链路。`,
        path: pathValue,
        mode,
        dedupeKey: `ASSOCIATION_INPUT_TARGET_METADATA_INCOMPLETE:${collectionName}:${fieldPath}:${directField.target}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
        },
      }));
      return;
    }

    const associationFieldModelNode = getAssociationInputFieldModelNode(node);
    const titleFallback = getAssociationInputTitleFallback(metadata, collectionName, fieldPath);
    const associationInputPath = effectiveUse === FORM_ASSOCIATION_FIELD_MODEL_USE
      ? pathValue
      : `${pathValue}.subModels.field`;
    const runtimeSelection = getAssociationInputRuntimeSelection({
      node,
      associationFieldModelNode,
      fallback: titleFallback,
      targetCollectionMeta,
      targetKeyFallback: normalizeFilterTargetKeyValue(directField.targetKey),
    });

    if (
      runtimeSelection.explicitTitleField
      && runtimeSelection.explicitFieldNamesLabel
      && runtimeSelection.explicitTitleField !== runtimeSelection.explicitFieldNamesLabel
    ) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'ASSOCIATION_INPUT_FIELDNAMES_LABEL_MISMATCH',
        message: `关联输入字段 "${fieldPath}" 的 titleField 与 fieldNames.label 不一致，运行时可能在切换显示字段时重建出错误的 binding。`,
        path: associationInputPath,
        mode,
        dedupeKey: `ASSOCIATION_INPUT_FIELDNAMES_LABEL_MISMATCH:${collectionName}:${fieldPath}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          titleField: runtimeSelection.explicitTitleField,
          fieldNamesLabel: runtimeSelection.explicitFieldNamesLabel,
        },
      }));
      return;
    }

    if (!runtimeSelection.effectiveTitleField || !isSimpleFieldName(runtimeSelection.effectiveTitleField)) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'ASSOCIATION_INPUT_TITLE_FIELD_UNRESOLVED',
        message: `关联输入字段 "${fieldPath}" 缺少可解析的目标标题字段；当前无法对齐 targetCollection.getField(label) 这条 runtime 契约。`,
        path: associationInputPath,
        mode,
        dedupeKey: `ASSOCIATION_INPUT_TITLE_FIELD_UNRESOLVED:${collectionName}:${fieldPath}:missing`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          targetTitleField: targetCollectionMeta.titleField,
          filterTargetKey: targetCollectionMeta.filterTargetKey,
          fallback: titleFallback,
        },
      }));
      return;
    }

    const runtimeLabelField = resolveFieldPathInMetadata(
      metadata,
      directField.target,
      runtimeSelection.effectiveTitleField,
    );
    if (!runtimeLabelField || isAssociationField(runtimeLabelField.field)) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'ASSOCIATION_INPUT_TITLE_FIELD_UNRESOLVED',
        message: `关联输入字段 "${fieldPath}" 选择的标题字段 "${runtimeSelection.effectiveTitleField}" 无法在目标 collection "${directField.target}" 中稳定解析。`,
        path: associationInputPath,
        mode,
        dedupeKey: `ASSOCIATION_INPUT_TITLE_FIELD_UNRESOLVED:${collectionName}:${fieldPath}:${runtimeSelection.effectiveTitleField}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          effectiveTitleField: runtimeSelection.effectiveTitleField,
          explicitTitleField: runtimeSelection.explicitTitleField,
          fallback: titleFallback,
        },
      }));
      return;
    }

    if (!runtimeLabelField.field.interface) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'ASSOCIATION_INPUT_DEFAULT_BINDING_UNRESOLVED',
        message: `关联输入字段 "${fieldPath}" 的标题字段 "${runtimeSelection.effectiveTitleField}" 缺少 interface，skill 无法提前判断 default binding。`,
        path: associationInputPath,
        mode,
        dedupeKey: `ASSOCIATION_INPUT_DEFAULT_BINDING_UNRESOLVED:${collectionName}:${fieldPath}:${runtimeSelection.effectiveTitleField}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          effectiveTitleField: runtimeSelection.effectiveTitleField,
          runtimeSelection,
        },
      }));
    }
  });
}

function inspectHardcodedFilterByTk(payload, mode, warnings, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node)) {
      return;
    }

    const detailFilterByTk = node.stepParams?.resourceSettings?.init?.filterByTk;
    if (isHardcodedFilterValue(detailFilterByTk)) {
      pushFinding(warnings, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'HARDCODED_FILTER_BY_TK',
        message: 'resourceSettings.init.filterByTk 使用了硬编码样本值。',
        path: `${pathValue}.stepParams.resourceSettings.init.filterByTk`,
        mode,
        dedupeKey: `HARDCODED_FILTER_BY_TK:${pathValue}.resourceSettings`,
        details: {
          value: detailFilterByTk,
        },
      }));
    }
  });
}

function applyRiskAccept(blockers, warnings, acceptedCodes) {
  if (!acceptedCodes.length) {
    return {
      blockers,
      warnings,
      acceptedRiskCodes: [],
      ignoredRiskAcceptCodes: [],
    };
  }

  const acceptedSet = new Set(acceptedCodes);
  const downgradedWarnings = [...warnings];
  const remainingBlockers = [];
  const appliedCodes = new Set();
  const blockerCountsByCode = new Map();
  for (const blocker of blockers) {
    blockerCountsByCode.set(blocker.code, (blockerCountsByCode.get(blocker.code) ?? 0) + 1);
  }
  const ignoredCodes = new Set(
    [...acceptedSet].filter((code) => (blockerCountsByCode.get(code) ?? 0) > 1),
  );

  for (const blocker of blockers) {
    if (
      acceptedSet.has(blocker.code)
      && !ignoredCodes.has(blocker.code)
      && !NON_RISK_ACCEPTABLE_BLOCKER_CODES.has(blocker.code)
      && !blocker.code.startsWith('RUNJS_')
    ) {
      downgradedWarnings.push({
        ...blocker,
        severity: 'warning',
        accepted: true,
      });
      appliedCodes.add(blocker.code);
      continue;
    }
    remainingBlockers.push(blocker);
  }

  return {
    blockers: remainingBlockers,
    warnings: downgradedWarnings,
    acceptedRiskCodes: [...appliedCodes],
    ignoredRiskAcceptCodes: [...ignoredCodes].sort(),
  };
}

function pushCanonicalizeItem(target, seen, item) {
  const dedupeKey = item.dedupeKey || `${item.code}:${item.path}`;
  if (seen.has(dedupeKey)) {
    return;
  }
  seen.add(dedupeKey);
  const sanitized = { ...item };
  delete sanitized.dedupeKey;
  target.push(sanitized);
}

export function canonicalizePayload({ payload, metadata = {}, mode = DEFAULT_AUDIT_MODE, nocobaseRoot, snapshotPath } = {}) {
  if (mode !== GENERAL_MODE && mode !== VALIDATION_CASE_MODE) {
    throw new Error(`Unsupported mode "${mode}"`);
  }

  const normalizedMetadata = normalizeMetadata(metadata);
  const workingPayload = cloneJsonValue(payload);
  const transforms = [];
  const unresolved = [];
  const transformSeen = new Set();
  const unresolvedSeen = new Set();

  const runjsCanonicalized = canonicalizeRunJSPayload({
    payload: workingPayload,
    nocobaseRoot,
    snapshotPath,
  });
  for (const item of runjsCanonicalized.transforms || []) {
    pushCanonicalizeItem(transforms, transformSeen, item);
  }
  for (const item of runjsCanonicalized.unresolved || []) {
    pushCanonicalizeItem(unresolved, unresolvedSeen, item);
  }

  walk(workingPayload, (node, pathValue, context) => {
    if (!isPlainObject(node)) {
      return;
    }

    if (node.use === 'ChartBlockModel') {
      const stepParams = isPlainObject(node.stepParams) ? node.stepParams : (node.stepParams = {});
      const chartSettings = isPlainObject(stepParams.chartSettings) ? stepParams.chartSettings : (stepParams.chartSettings = {});
      const configure = isPlainObject(chartSettings.configure) ? chartSettings.configure : (chartSettings.configure = {});
      const query = isPlainObject(configure.query) ? configure.query : (configure.query = {});
      const chart = isPlainObject(configure.chart) ? configure.chart : (configure.chart = {});
      const option = isPlainObject(chart.option) ? chart.option : (chart.option = {});
      const collectionPath = Array.isArray(query.collectionPath)
        ? query.collectionPath
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
        : [];
      const collectionName = collectionPath[1] || '';

      const canonicalizeChartFieldList = (items, key) => {
        (Array.isArray(items) ? items : []).forEach((item, index) => {
          if (!isPlainObject(item)) {
            return;
          }

          const fieldPath = `${pathValue}.stepParams.chartSettings.configure.query.${key}[${index}].field`;
          const fieldInspection = inspectChartFieldPath(item.field);

          if (fieldInspection.kind === 'scalar-array') {
            item.field = fieldInspection.normalized;
            pushCanonicalizeItem(transforms, transformSeen, {
              code: 'CHART_QUERY_SCALAR_FIELD_CANONICALIZED',
              path: fieldPath,
              message: `ChartBlockModel 的 ${key}[${index}].field 已从单元素数组归一化为标量字符串。`,
              details: {
                from: fieldInspection.segments,
                to: fieldInspection.normalized,
              },
            });
            return;
          }

          if (fieldInspection.kind !== 'legacy-dotted' || !collectionName) {
            return;
          }

          const resolvedRelation = resolveChartRelationField(normalizedMetadata, collectionName, fieldInspection.segments);
          if (
            !resolvedRelation?.associationField
            || !isAssociationField(resolvedRelation.associationField)
            || !resolvedRelation.targetField
          ) {
            return;
          }

          item.field = fieldInspection.segments;
          pushCanonicalizeItem(transforms, transformSeen, {
            code: 'CHART_QUERY_RELATION_FIELD_CANONICALIZED',
            path: fieldPath,
            message: `ChartBlockModel 的 ${key}[${index}].field 已从 legacy dotted path 归一化为 relation 数组路径。`,
            details: {
              collectionName,
              from: fieldInspection.normalized,
              to: fieldInspection.segments,
              targetCollection: resolvedRelation.associationField.target || null,
            },
          });
        });
      };

      if (!CHART_QUERY_MODES.has(normalizeOptionalText(query.mode))) {
        const previousMode = normalizeOptionalText(query.mode) || null;
        query.mode = 'builder';
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'CHART_QUERY_MODE_DEFAULTED',
          path: `${pathValue}.stepParams.chartSettings.configure.query.mode`,
          message: 'ChartBlockModel 缺少 query.mode，已补成默认值 "builder"。',
          details: {
            from: previousMode,
            to: 'builder',
          },
        });
      }

      if (!CHART_OPTION_MODES.has(normalizeOptionalText(option.mode))) {
        const previousMode = normalizeOptionalText(option.mode) || null;
        option.mode = 'basic';
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'CHART_OPTION_MODE_DEFAULTED',
          path: `${pathValue}.stepParams.chartSettings.configure.chart.option.mode`,
          message: 'ChartBlockModel 缺少 option.mode，已补成默认值 "basic"。',
          details: {
            from: previousMode,
            to: 'basic',
          },
        });
      }

      canonicalizeChartFieldList(query.measures, 'measures');
      canonicalizeChartFieldList(query.dimensions, 'dimensions');
      canonicalizeChartFieldList(query.orders, 'orders');
    }

    if (typeof node.field === 'string' && typeof node.operator === 'string' && !Object.hasOwn(node, 'path')) {
      const collectionName = context.resourceCollectionName;
      const canonicalPath = getCanonicalFilterPathFromLegacyField(normalizedMetadata, collectionName, node.field);
      if (canonicalPath) {
        const previousField = node.field;
        node.path = canonicalPath;
        delete node.field;
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'FILTER_ITEM_FIELD_RENAMED_TO_PATH',
          path: pathValue,
          message: `把 legacy filter 字段 "${previousField}" 归一化为 path。`,
          details: {
            collectionName,
            from: previousField,
            to: canonicalPath,
          },
        });
      } else {
        pushCanonicalizeItem(unresolved, unresolvedSeen, {
          code: 'FILTER_ITEM_FIELD_PATH_UNRESOLVED',
          path: pathValue,
          message: 'legacy filter 使用了 field，但当前 metadata 无法安全推断对应 path。',
          details: {
            collectionName,
            field: node.field,
          },
        });
      }
    }

    const fieldInit = node.stepParams?.fieldSettings?.init;
    if (
      isPlainObject(fieldInit)
      && typeof fieldInit.fieldPath === 'string'
      && !hasTemplateExpression(fieldInit.fieldPath)
    ) {
      const collectionName = fieldInit.collectionName || context.resourceCollectionName;
      const expectedAssociationPathName = getExpectedAssociationPathName(
        normalizedMetadata,
        collectionName,
        fieldInit.fieldPath,
      );
      if (
        expectedAssociationPathName
        && fieldInit.associationPathName !== expectedAssociationPathName
      ) {
        const previousAssociationPathName = fieldInit.associationPathName || null;
        fieldInit.associationPathName = expectedAssociationPathName;
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'ASSOCIATION_PATHNAME_CANONICALIZED',
          path: pathValue,
          message: `为 dotted 关联字段 "${fieldInit.fieldPath}" 补齐 associationPathName="${expectedAssociationPathName}"。`,
          details: {
            collectionName,
            fieldPath: fieldInit.fieldPath,
            from: previousAssociationPathName,
            to: expectedAssociationPathName,
          },
        });
      }
    }

    if (
      isPlainObject(fieldInit)
      && typeof fieldInit.fieldPath === 'string'
      && !hasTemplateExpression(fieldInit.fieldPath)
      && CANONICALIZE_FOREIGN_KEY_DISPLAY_MODEL_USES.has(node.use)
    ) {
      const collectionName = fieldInit.collectionName || context.resourceCollectionName;
      const displayBinding = getForeignKeyDisplayBinding(normalizedMetadata, collectionName, fieldInit.fieldPath);
      if (displayBinding) {
        const previousFieldPath = fieldInit.fieldPath;
        fieldInit.collectionName = displayBinding.collectionName;
        fieldInit.fieldPath = displayBinding.fieldPath;
        fieldInit.associationPathName = displayBinding.associationPathName;
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'FOREIGN_KEY_FIELDPATH_CANONICALIZED',
          path: pathValue,
          message: `把 foreignKey 绑定 "${previousFieldPath}" 归一化为稳定展示字段 "${displayBinding.fieldPath}"。`,
          details: {
            collectionName,
            from: previousFieldPath,
            to: displayBinding.fieldPath,
            associationPathName: displayBinding.associationPathName,
          },
        });
      } else {
        const collectionMeta = getCollectionMeta(normalizedMetadata, collectionName);
        if (collectionMeta?.associationsByForeignKey.has(fieldInit.fieldPath)) {
          pushCanonicalizeItem(unresolved, unresolvedSeen, {
            code: 'FOREIGN_KEY_DISPLAY_BINDING_UNRESOLVED',
            path: pathValue,
            message: 'fieldPath 命中了关联 foreignKey，但当前 metadata 无法安全归一化为稳定展示绑定。',
            details: {
              collectionName,
              fieldPath: fieldInit.fieldPath,
              use: node.use,
            },
          });
        }
      }
    }

    if (
      isPlainObject(fieldInit)
      && typeof fieldInit.fieldPath === 'string'
      && !hasTemplateExpression(fieldInit.fieldPath)
      && CANONICALIZE_FOREIGN_KEY_ASSOCIATION_INPUT_MODEL_USES.has(node.use)
    ) {
      const collectionName = fieldInit.collectionName || context.resourceCollectionName;
      const associationBinding = getForeignKeyAssociationBinding(normalizedMetadata, collectionName, fieldInit.fieldPath);
      if (associationBinding) {
        const previousFieldPath = fieldInit.fieldPath;
        fieldInit.collectionName = associationBinding.collectionName;
        fieldInit.fieldPath = associationBinding.fieldPath;
        delete fieldInit.associationPathName;

        const fieldModelNode = isPlainObject(node.subModels) && isPlainObject(node.subModels.field)
          ? node.subModels.field
          : null;
        if (fieldModelNode) {
          fieldModelNode.use = node.use === 'FilterFormItemModel'
            ? FILTER_FORM_ASSOCIATION_FIELD_MODEL_USE
            : FORM_ASSOCIATION_FIELD_MODEL_USE;

          const fieldModelInit = isPlainObject(fieldModelNode.stepParams?.fieldSettings?.init)
            ? fieldModelNode.stepParams.fieldSettings.init
            : null;
          if (fieldModelInit) {
            fieldModelInit.collectionName = associationBinding.collectionName;
            fieldModelInit.fieldPath = associationBinding.fieldPath;
            delete fieldModelInit.associationPathName;
          }
        }

        const filterField = node.stepParams?.filterFormItemSettings?.init?.filterField;
        if (isPlainObject(filterField)) {
          filterField.name = associationBinding.fieldPath;
          filterField.interface = associationBinding.associationField.interface;
          filterField.type = associationBinding.associationField.type;
        }

        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'FOREIGN_KEY_ASSOCIATION_INPUT_CANONICALIZED',
          path: pathValue,
          message: `把输入型 foreignKey 绑定 "${previousFieldPath}" 归一化为关联字段 "${associationBinding.fieldPath}"。`,
          details: {
            use: node.use,
            collectionName,
            from: previousFieldPath,
            to: associationBinding.fieldPath,
            targetCollection: associationBinding.targetCollection,
            targetTitleField: associationBinding.targetTitleField,
          },
        });
      } else {
        const collectionMeta = getCollectionMeta(normalizedMetadata, collectionName);
        if (collectionMeta?.associationsByForeignKey.has(fieldInit.fieldPath)) {
          pushCanonicalizeItem(unresolved, unresolvedSeen, {
            code: 'FOREIGN_KEY_ASSOCIATION_INPUT_UNRESOLVED',
            path: pathValue,
            message: 'fieldPath 命中了关联 foreignKey，但当前 metadata 无法安全归一化为关联输入绑定。',
            details: {
              collectionName,
              fieldPath: fieldInit.fieldPath,
              use: node.use,
            },
          });
        }
      }
    }

    if (
      node.use === 'FilterFormItemModel'
      && isPlainObject(fieldInit)
      && typeof fieldInit.fieldPath === 'string'
      && !hasTemplateExpression(fieldInit.fieldPath)
    ) {
      const collectionName = fieldInit.collectionName || context.resourceCollectionName;
      const fieldSpec = resolveFilterFieldModelSpec({
        metadata: normalizedMetadata,
        collectionName,
        fieldPath: fieldInit.fieldPath,
      });
      if (Array.isArray(fieldSpec?.preferredUses) && fieldSpec.preferredUses.length > 0) {
        const nextDescriptor = cloneJsonValue(fieldSpec.descriptor);
        let useChanged = false;
        let descriptorChanged = false;

        const filterItemSettings = isPlainObject(node.stepParams?.filterFormItemSettings)
          ? node.stepParams.filterFormItemSettings
          : (node.stepParams.filterFormItemSettings = {});
        const filterItemInit = isPlainObject(filterItemSettings.init)
          ? filterItemSettings.init
          : (filterItemSettings.init = {});
        const previousDescriptor = isPlainObject(filterItemInit.filterField)
          ? cloneJsonValue(filterItemInit.filterField)
          : null;
        if (JSON.stringify(previousDescriptor) !== JSON.stringify(nextDescriptor)) {
          filterItemInit.filterField = nextDescriptor;
          descriptorChanged = true;
        }

        const fieldModelNode = isPlainObject(node.subModels?.field) ? node.subModels.field : null;
        const previousFieldUse = normalizeOptionalText(fieldModelNode?.use) || null;
        if (
          fieldModelNode
          && fieldSpec.use
          && !fieldSpec.preferredUses.includes(normalizeOptionalText(fieldModelNode.use))
        ) {
          fieldModelNode.use = fieldSpec.use;
          useChanged = true;
        }

        if (useChanged || descriptorChanged) {
          pushCanonicalizeItem(transforms, transformSeen, {
            code: 'FILTER_FORM_FIELD_MODEL_CANONICALIZED',
            path: pathValue,
            message: `按字段 metadata 归一化筛选项 "${fieldInit.fieldPath}" 的 field model 和 filterField descriptor。`,
            details: {
              collectionName,
              fieldPath: fieldInit.fieldPath,
              expectedUse: fieldSpec.use,
              actualUse: previousFieldUse,
              useChanged,
              descriptorChanged,
              resolvedFieldInterface: normalizeOptionalText(fieldSpec.resolvedField?.interface) || null,
            },
          });
        }
      }
    }

    if (
      isPlainObject(fieldInit)
      && typeof fieldInit.fieldPath === 'string'
      && !hasTemplateExpression(fieldInit.fieldPath)
      && (node.use === 'FormItemModel' || node.use === FORM_ASSOCIATION_FIELD_MODEL_USE)
    ) {
      const collectionName = fieldInit.collectionName || context.resourceCollectionName;
      const titleFallback = getAssociationInputTitleFallback(normalizedMetadata, collectionName, fieldInit.fieldPath);
      if (titleFallback) {
        if (node.use === 'FormItemModel') {
          const previousTitleField = node.props?.titleField || null;
          if (!isPlainObject(node.props)) {
            node.props = {};
          }
          if (node.props.titleField !== titleFallback.labelField) {
            node.props.titleField = titleFallback.labelField;
            pushCanonicalizeItem(transforms, transformSeen, {
              code: 'FORM_ASSOCIATION_TITLEFIELD_CANONICALIZED',
              path: pathValue,
              message: `为表单关联字段 "${fieldInit.fieldPath}" 补齐 titleField="${titleFallback.labelField}"。`,
              details: {
                collectionName,
                fieldPath: fieldInit.fieldPath,
                targetCollection: titleFallback.targetCollection,
                from: previousTitleField,
                to: titleFallback.labelField,
              },
            });
          }

          if (!isPlainObject(node.stepParams)) {
            node.stepParams = {};
          }
          const editItemSettings = isPlainObject(node.stepParams.editItemSettings)
            ? node.stepParams.editItemSettings
            : (node.stepParams.editItemSettings = {});
          const titleFieldConfig = isPlainObject(editItemSettings.titleField)
            ? editItemSettings.titleField
            : (editItemSettings.titleField = {});
          if (titleFieldConfig.titleField !== titleFallback.labelField) {
            titleFieldConfig.titleField = titleFallback.labelField;
            pushCanonicalizeItem(transforms, transformSeen, {
              code: 'FORM_ASSOCIATION_EDIT_TITLEFIELD_CANONICALIZED',
              path: `${pathValue}.stepParams.editItemSettings.titleField`,
              message: `为表单关联字段 "${fieldInit.fieldPath}" 的 editItemSettings 补齐 titleField="${titleFallback.labelField}"。`,
              details: {
                collectionName,
                fieldPath: fieldInit.fieldPath,
                targetCollection: titleFallback.targetCollection,
                to: titleFallback.labelField,
              },
            });
          }
        }

        const associationFieldModelNode = node.use === FORM_ASSOCIATION_FIELD_MODEL_USE
          ? node
          : (isPlainObject(node.subModels) && isPlainObject(node.subModels.field) ? node.subModels.field : null);
        if (associationFieldModelNode?.use === FORM_ASSOCIATION_FIELD_MODEL_USE) {
          const previousTitleField = associationFieldModelNode.props?.titleField || null;
          const previousFieldNames = cloneJsonValue(associationFieldModelNode.props?.fieldNames) || null;
          if (!isPlainObject(associationFieldModelNode.props)) {
            associationFieldModelNode.props = {};
          }
          associationFieldModelNode.props.titleField = titleFallback.labelField;
          associationFieldModelNode.props.fieldNames = {
            ...(isPlainObject(associationFieldModelNode.props.fieldNames) ? associationFieldModelNode.props.fieldNames : {}),
            label: titleFallback.labelField,
            value: titleFallback.valueField,
          };
          pushCanonicalizeItem(transforms, transformSeen, {
            code: 'FORM_ASSOCIATION_FIELDNAMES_CANONICALIZED',
            path: node.use === FORM_ASSOCIATION_FIELD_MODEL_USE ? pathValue : `${pathValue}.subModels.field`,
            message: `为关联输入字段 "${fieldInit.fieldPath}" 补齐 fieldNames.label="${titleFallback.labelField}" / value="${titleFallback.valueField}"。`,
            details: {
              collectionName,
              fieldPath: fieldInit.fieldPath,
              targetCollection: titleFallback.targetCollection,
              previousTitleField,
              previousFieldNames,
              fieldNames: associationFieldModelNode.props.fieldNames,
            },
          });
        }
      }
    }

    if (FORM_BLOCK_MODEL_USES.has(node.use)) {
      const subModels = isPlainObject(node.subModels) ? node.subModels : (node.subModels = {});
      const actions = Array.isArray(subModels.actions) ? subModels.actions : (subModels.actions = []);
      const hasSubmitLikeAction = actions.some(
        (actionNode) => isPlainObject(actionNode) && FORM_BLOCK_ACTION_MODEL_USES.has(actionNode.use),
      );
      if (!hasSubmitLikeAction) {
        actions.push({ use: 'FormSubmitActionModel' });
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'FORM_SUBMIT_ACTION_INSERTED',
          path: `${pathValue}.subModels.actions`,
          message: `${node.use} 自动补入缺失的 FormSubmitActionModel。`,
          details: {
            formUse: node.use,
          },
        });
      }
    }

    if (node.use === 'DetailsBlockModel' && !hasMeaningfulDetailsContent(node)) {
      const collectionName = node.stepParams?.resourceSettings?.init?.collectionName || context.resourceCollectionName;
      const displayBinding = getStableDisplayFieldBinding(normalizedMetadata, collectionName);
      if (displayBinding) {
        const subModels = isPlainObject(node.subModels) ? node.subModels : (node.subModels = {});
        const grid = isPlainObject(subModels.grid) ? subModels.grid : (subModels.grid = {});
        if (!grid.use) {
          grid.use = 'DetailsGridModel';
        }
        const gridSubModels = isPlainObject(grid.subModels) ? grid.subModels : (grid.subModels = {});
        const items = Array.isArray(gridSubModels.items) ? gridSubModels.items : (gridSubModels.items = []);
        items.push({
          use: 'DetailsItemModel',
          stepParams: {
            fieldSettings: {
              init: {
                collectionName: displayBinding.collectionName,
                fieldPath: displayBinding.fieldPath,
                ...(displayBinding.associationPathName ? { associationPathName: displayBinding.associationPathName } : {}),
              },
            },
          },
          subModels: {
            field: {
              use: 'FieldModel',
              stepParams: {
                fieldBinding: {
                  use: 'DisplayTextFieldModel',
                },
                fieldSettings: {
                  init: {
                    collectionName: displayBinding.collectionName,
                    fieldPath: displayBinding.fieldPath,
                    ...(displayBinding.associationPathName ? { associationPathName: displayBinding.associationPathName } : {}),
                  },
                },
              },
            },
          },
        });
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'DETAILS_BLOCK_DEFAULT_ITEM_INSERTED',
          path: pathValue,
          message: `为空的 DetailsBlockModel 自动补入默认展示字段 "${displayBinding.fieldPath}"。`,
          details: {
            collectionName,
            fieldPath: displayBinding.fieldPath,
            associationPathName: displayBinding.associationPathName,
          },
        });
      } else {
        pushCanonicalizeItem(unresolved, unresolvedSeen, {
          code: 'DETAILS_BLOCK_DEFAULT_ITEM_UNRESOLVED',
          path: pathValue,
          message: 'DetailsBlockModel 为空，但 metadata 无法提供稳定的默认展示字段。',
          details: {
            collectionName,
          },
        });
      }
    }

    const openView = node.stepParams?.popupSettings?.openView;
    if (isPlainObject(openView)) {
      let replacement = null;
      let strategy = null;
      const targetCollectionName = openView.collectionName || context.resourceCollectionName || null;
      if (RECORD_ACTION_MODEL_USES.has(node.use)) {
        replacement = buildRecordContextFilterByTk(metadata, targetCollectionName);
        strategy = 'record-context';
      } else if (context.ancestorPopupAction) {
        replacement = POPUP_INPUT_ARGS_FILTER_BY_TK;
        strategy = 'ancestor-popup-input-args';
      }

      if (isHardcodedFilterValue(openView.filterByTk)) {
        if (replacement) {
          const previousValue = openView.filterByTk;
          openView.filterByTk = replacement;
          pushCanonicalizeItem(transforms, transformSeen, {
            code: 'POPUP_FILTER_BY_TK_CANONICALIZED',
            path: `${pathValue}.stepParams.popupSettings.openView.filterByTk`,
            message: `把硬编码 popup filterByTk "${String(previousValue)}" 归一化为模板变量。`,
            details: {
              from: previousValue,
              to: replacement,
              strategy,
            },
          });
        } else {
          pushCanonicalizeItem(unresolved, unresolvedSeen, {
            code: 'POPUP_FILTER_BY_TK_CONTEXT_UNRESOLVED',
            path: `${pathValue}.stepParams.popupSettings.openView.filterByTk`,
            message: 'popup/openView 的 filterByTk 是硬编码值，但当前上下文无法安全推断替换模板。',
            details: {
              actionUse: node.use,
              value: openView.filterByTk,
            },
          });
        }
      } else if (
        replacement
        && RECORD_ACTION_MODEL_USES.has(node.use)
        && isLegacyRecordIdFilterByTk(openView.filterByTk)
        && !matchesRecordContextFilterByTk(openView.filterByTk, replacement)
      ) {
        const previousValue = openView.filterByTk;
        openView.filterByTk = replacement;
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'POPUP_FILTER_BY_TK_CANONICALIZED',
          path: `${pathValue}.stepParams.popupSettings.openView.filterByTk`,
          message: '把 legacy popup filterByTk 收敛为当前 collection 的 record 上下文模板。',
          details: {
            from: previousValue,
            to: replacement,
            strategy,
            collectionName: targetCollectionName,
          },
        });
      }
    }

    const initOptions = node.stepParams?.resourceSettings?.init;
    if (isPlainObject(initOptions) && isHardcodedFilterValue(initOptions.filterByTk)) {
      if (context.popupAction && !isPopupActionNode(node)) {
        const previousValue = initOptions.filterByTk;
        initOptions.filterByTk = POPUP_INPUT_ARGS_FILTER_BY_TK;
        pushCanonicalizeItem(transforms, transformSeen, {
          code: 'RESOURCE_FILTER_BY_TK_CANONICALIZED',
          path: `${pathValue}.stepParams.resourceSettings.init.filterByTk`,
          message: `把硬编码 resource filterByTk "${String(previousValue)}" 归一化为 popup inputArgs 模板。`,
          details: {
            from: previousValue,
            to: POPUP_INPUT_ARGS_FILTER_BY_TK,
            use: node.use,
          },
        });
      } else {
        pushCanonicalizeItem(unresolved, unresolvedSeen, {
          code: 'RESOURCE_FILTER_BY_TK_CONTEXT_UNRESOLVED',
          path: `${pathValue}.stepParams.resourceSettings.init.filterByTk`,
          message: 'resourceSettings.init.filterByTk 是硬编码值，但当前不在可确认的 popup/inputArgs 上下文中。',
          details: {
            use: node.use,
            value: initOptions.filterByTk,
          },
        });
      }
    }
  });

  walk(workingPayload, (node, pathValue) => {
    if (!isPlainObject(node) || node.use !== 'BlockGridModel') {
      return;
    }

    const {
      filterItems,
      targetNodesByUid,
      existingConfigs,
    } = collectGridFilterManagerState(node, pathValue, normalizedMetadata);

    if (filterItems.length === 0 || targetNodesByUid.size === 0) {
      return;
    }

    const nextConfigs = [];
    filterItems.forEach((item) => {
      if (!item.defaultTargetUid) {
        pushCanonicalizeItem(unresolved, unresolvedSeen, {
          code: 'FILTER_MANAGER_FILTER_ITEM_UNBOUND',
          path: `${item.path}.stepParams.filterFormItemSettings.init.defaultTargetUid`,
          message: 'FilterFormItemModel 缺少 defaultTargetUid，当前无法自动生成 filterManager 绑定。',
          details: {
            filterId: item.uid || null,
            fieldPath: item.fieldPath || null,
          },
        });
        return;
      }

      if (!targetNodesByUid.has(item.defaultTargetUid)) {
        pushCanonicalizeItem(unresolved, unresolvedSeen, {
          code: 'FILTER_MANAGER_TARGET_MISSING',
          path: `${item.path}.stepParams.filterFormItemSettings.init.defaultTargetUid`,
          message: `defaultTargetUid "${item.defaultTargetUid}" 在当前 BlockGridModel 中找不到可筛选目标，无法自动生成 filterManager。`,
          details: {
            filterId: item.uid || null,
            defaultTargetUid: item.defaultTargetUid,
            availableTargetIds: [...targetNodesByUid.keys()],
          },
        });
        return;
      }

      if (!item.uid || !Array.isArray(item.expectedFilterPaths) || item.expectedFilterPaths.length === 0) {
        pushCanonicalizeItem(unresolved, unresolvedSeen, {
          code: 'FILTER_MANAGER_FILTER_PATH_UNRESOLVED',
          path: item.path,
          message: '当前 metadata 无法为筛选项推导稳定的 filterPaths，自动生成 filterManager 已跳过该项。',
          details: {
            filterId: item.uid || null,
            collectionName: item.collectionName,
            fieldPath: item.fieldPath,
          },
        });
        return;
      }

      nextConfigs.push({
        filterId: item.uid,
        targetId: item.defaultTargetUid,
        filterPaths: item.expectedFilterPaths,
      });
    });

    const normalizedNextConfigs = normalizeFilterManagerConfigs(nextConfigs);
    if (
      normalizedNextConfigs.length > 0
      && JSON.stringify(existingConfigs) !== JSON.stringify(normalizedNextConfigs)
    ) {
      node.filterManager = normalizedNextConfigs;
      pushCanonicalizeItem(transforms, transformSeen, {
        code: 'FILTER_MANAGER_CANONICALIZED',
        path: `${pathValue}.filterManager`,
        message: '已为当前 BlockGridModel 自动补齐并归一化 filterManager。',
        details: {
          filterItemCount: filterItems.length,
          connectionCount: normalizedNextConfigs.length,
        },
      });
    }
  });

  const requiredMetadata = extractRequiredMetadata({ payload: workingPayload });
  const missingCollections = [...new Set(
    requiredMetadata.collectionRefs
      .map((item) => item.collectionName)
      .filter((collectionName) => !getCollectionMeta(normalizedMetadata, collectionName)),
  )].sort();

  return {
    mode,
    payload: workingPayload,
    transforms,
    unresolved,
    runjsCanonicalization: runjsCanonicalized.semantic || {
      blockerCount: 0,
      warningCount: 0,
      autoRewriteCount: 0,
    },
    metadataCoverage: {
      collectionCount: Object.keys(normalizedMetadata.collections).length,
      requiredCollectionCount: new Set(requiredMetadata.collectionRefs.map((item) => item.collectionName)).size,
      missingCollectionCount: missingCollections.length,
      missingCollections,
    },
  };
}

function pushRequiredCollectionRef(collectionRefs, seenCollectionRefs, {
  collectionName,
  reason,
  path,
  details,
}) {
  if (typeof collectionName !== 'string' || !collectionName.trim()) {
    return;
  }
  const normalizedCollectionName = collectionName.trim();
  const normalizedReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'unknown';
  const normalizedPath = typeof path === 'string' && path.trim() ? path : '$';
  const dedupeKey = `${normalizedCollectionName}:${normalizedPath}:${normalizedReason}`;
  if (seenCollectionRefs.has(dedupeKey)) {
    return;
  }
  seenCollectionRefs.add(dedupeKey);
  const item = {
    collectionName: normalizedCollectionName,
    reason: normalizedReason,
    path: normalizedPath,
  };
  if (isPlainObject(details) && Object.keys(details).length > 0) {
    item.details = details;
  }
  collectionRefs.push(item);
}

function collectTransitiveAssociationTargetRefs(fieldRefs, metadata, collectionRefs, seenCollectionRefs) {
  const normalizedMetadata = normalizeMetadata(metadata);
  if (Object.keys(normalizedMetadata.collections).length === 0) {
    return;
  }

  for (const fieldRef of fieldRefs) {
    const collectionName = typeof fieldRef?.collectionName === 'string' ? fieldRef.collectionName.trim() : '';
    const fieldPath = typeof fieldRef?.fieldPath === 'string' ? fieldRef.fieldPath.trim() : '';
    const pathValue = typeof fieldRef?.path === 'string' && fieldRef.path.trim() ? fieldRef.path : '$';
    if (!collectionName || !fieldPath) {
      continue;
    }

    const segments = fieldPath
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    let currentCollection = getCollectionMeta(normalizedMetadata, collectionName);
    if (!currentCollection) {
      continue;
    }

    for (const segment of segments) {
      const field = currentCollection.fieldsByName.get(segment) || null;
      if (!field || !isAssociationField(field) || !field.target) {
        break;
      }

      pushRequiredCollectionRef(collectionRefs, seenCollectionRefs, {
        collectionName: field.target,
        reason: 'fieldPath.associationTarget',
        path: pathValue,
        details: {
          sourceCollection: currentCollection.name,
          sourceFieldPath: fieldPath,
          associationField: field.name,
        },
      });

      currentCollection = getCollectionMeta(normalizedMetadata, field.target);
      if (!currentCollection) {
        break;
      }
    }
  }
}

export function extractRequiredMetadata({ payload, metadata = {} }) {
  const collectionRefs = [];
  const fieldRefs = [];
  const popupContextChecks = [];
  const seenCollectionRefs = new Set();
  const seenFieldRefs = new Set();
  const seenPopupChecks = new Set();

  walk(payload, (node, pathValue, context) => {
    if (!isPlainObject(node)) {
      return;
    }

    const resourceCollectionName = node.stepParams?.resourceSettings?.init?.collectionName;
    if (resourceCollectionName) {
      pushRequiredCollectionRef(collectionRefs, seenCollectionRefs, {
        collectionName: resourceCollectionName,
        reason: 'resourceSettings.init.collectionName',
        path: pathValue,
      });
    }

    const fieldInit = node.stepParams?.fieldSettings?.init;
    if (fieldInit?.collectionName) {
      pushRequiredCollectionRef(collectionRefs, seenCollectionRefs, {
        collectionName: fieldInit.collectionName,
        reason: 'fieldSettings.init.collectionName',
        path: pathValue,
      });
    }

    if (context.fieldBinding?.collectionName && context.fieldBinding.fieldPath) {
      const dedupeKey = `${context.fieldBinding.collectionName}:${context.fieldBinding.fieldPath}:${pathValue}`;
      if (!seenFieldRefs.has(dedupeKey)) {
        seenFieldRefs.add(dedupeKey);
        fieldRefs.push({
          collectionName: context.fieldBinding.collectionName,
          fieldPath: context.fieldBinding.fieldPath,
          use: context.use || null,
          path: pathValue,
        });
      }
    }

    const openView = node.stepParams?.popupSettings?.openView;
    const pageNode = node.subModels?.page;
    if ((isPlainObject(openView) || pageNode) && typeof node.use === 'string' && node.use.endsWith('ActionModel')) {
      if (openView?.collectionName) {
        pushRequiredCollectionRef(collectionRefs, seenCollectionRefs, {
          collectionName: openView.collectionName,
          reason: 'popupSettings.openView.collectionName',
          path: pathValue,
        });
      }
      const subtreeStrings = pageNode ? collectStrings(pageNode) : [];
      if (subtreeStrings.some((value) => value.includes(POPUP_INPUT_ARGS_FILTER_BY_TK))) {
        const dedupeKey = `${pathValue}:${node.use}`;
        if (!seenPopupChecks.has(dedupeKey)) {
          seenPopupChecks.add(dedupeKey);
          popupContextChecks.push({
            actionUse: node.use,
            path: pathValue,
            requiresInputArgsFilterByTk: true,
            openViewCollectionName: openView?.collectionName || null,
            hasFilterByTk: Boolean(openView?.filterByTk),
          });
        }
      }
    }
  });

  collectTransitiveAssociationTargetRefs(fieldRefs, metadata, collectionRefs, seenCollectionRefs);

  return {
    collectionRefs,
    fieldRefs,
    popupContextChecks,
  };
}

export function auditPayload({
  payload,
  metadata = {},
  mode = DEFAULT_AUDIT_MODE,
  riskAccept = [],
  requirements = {},
  nocobaseRoot,
  snapshotPath,
}) {
  if (mode !== GENERAL_MODE && mode !== VALIDATION_CASE_MODE) {
    throw new Error(`Unsupported mode "${mode}"`);
  }

  const requiredMetadata = extractRequiredMetadata({ payload });
  const normalizedMetadata = normalizeMetadata(metadata);
  const normalizedRequirements = normalizeRequirements(requirements);
  const blockers = [];
  const warnings = [];
  const blockerSeen = new Set();
  const warningSeen = new Set();
  let runjsInspection = null;

  inspectRequiredMetadataCoverage(requiredMetadata, normalizedMetadata, mode, blockers, blockerSeen);
  inspectFilters(payload, normalizedMetadata, mode, blockers, blockerSeen);
  inspectFilterContainers(payload, normalizedMetadata, mode, normalizedRequirements, warnings, blockers, blockerSeen);
  inspectFieldBindings(payload, normalizedMetadata, mode, normalizedRequirements, warnings, blockers, blockerSeen);
  inspectCollectionResourceContracts(payload, mode, blockers, blockerSeen);
  inspectChartBlocks(payload, normalizedMetadata, mode, warnings, blockers, warningSeen, blockerSeen);
  inspectGridCardBlocks(payload, mode, blockers, blockerSeen);
  inspectFormBlocks(payload, mode, warnings, blockers, blockerSeen);
  inspectFilterFormBlocks(payload, normalizedMetadata, mode, warnings, blockers, blockerSeen);
  inspectTableBlocks(payload, mode, blockers, blockerSeen);
  inspectFilterManagerBindings(payload, normalizedMetadata, mode, blockers, blockerSeen);
  inspectActionSlots(payload, mode, blockers, blockerSeen);
  inspectUnsupportedFieldSlots(payload, mode, blockers, blockerSeen);
  inspectTabTrees(payload, mode, warnings, blockers, blockerSeen);
  inspectExistingUidReparenting(payload, normalizedMetadata, mode, blockers, blockerSeen);
  inspectGridLayoutMembership(payload, mode, blockers, blockerSeen);
  inspectPopupActions(payload, normalizedMetadata, mode, normalizedRequirements, warnings, blockers, blockerSeen);
  inspectDetailsBlocks(payload, mode, warnings, blockers, blockerSeen);
  inspectDeclaredRequirements(payload, normalizedMetadata, mode, normalizedRequirements, blockers, blockerSeen);
  try {
    runjsInspection = inspectRunJSPayloadStatic({
      payload,
      mode,
      nocobaseRoot,
      snapshotPath,
    });
    for (const finding of runjsInspection.blockers || []) {
      pushExternalFinding(blockers, blockerSeen, finding, mode);
    }
    for (const finding of runjsInspection.warnings || []) {
      pushExternalFinding(warnings, warningSeen, finding, mode);
    }
  } catch (error) {
    pushFinding(warnings, warningSeen, createFinding({
      severity: 'warning',
      code: 'RUNJS_GUARD_UNAVAILABLE',
      message: `RunJS static guard could not run: ${error.message}`,
      path: '$',
      mode,
      dedupeKey: 'RUNJS_GUARD_UNAVAILABLE:$',
    }));
  }
  if (mode === VALIDATION_CASE_MODE) {
    inspectHardcodedFilterByTk(payload, mode, blockers, blockerSeen);
  } else {
    inspectHardcodedFilterByTk(payload, mode, warnings, warningSeen);
  }

  const applied = applyRiskAccept(blockers, warnings, riskAccept);
  const finalWarnings = [...applied.warnings];
  finalWarnings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
  const finalBlockers = [...applied.blockers];
  finalBlockers.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));

  return {
    ok: finalBlockers.length === 0,
    mode,
    blockers: finalBlockers,
    warnings: finalWarnings,
    acceptedRiskCodes: applied.acceptedRiskCodes,
    ignoredRiskAcceptCodes: applied.ignoredRiskAcceptCodes,
    runjsInspection: runjsInspection
      ? {
        ok: runjsInspection.ok,
        blockerCount: runjsInspection.blockers.length,
        warningCount: runjsInspection.warnings.length,
        inspectedNodeCount: runjsInspection.inspectedNodes.length,
        contractSource: runjsInspection.contractSource,
        semanticBlockerCount: runjsInspection.execution?.semanticBlockerCount || 0,
        semanticWarningCount: runjsInspection.execution?.semanticWarningCount || 0,
        autoRewriteCount: runjsInspection.execution?.autoRewriteCount || 0,
      }
      : null,
    metadataCoverage: {
      collectionCount: Object.keys(normalizedMetadata.collections).length,
      requiredCollectionCount: new Set(requiredMetadata.collectionRefs.map((item) => item.collectionName)).size,
    },
  };
}

function buildFilterFromFlags(flags) {
  const logic = flags.logic ? normalizeFilterLogic(flags.logic) : '$and';
  const condition = flags['condition-json']
    ? parseJson(flags['condition-json'], 'condition-json')
    : {
      path: normalizeNonEmpty(flags.path, 'path'),
      operator: normalizeNonEmpty(flags.operator, 'operator'),
      value: parseJson(flags['value-json'], 'value-json'),
    };
  return buildFilterGroup({ logic, condition });
}

function buildQueryFilterFromFlags(flags) {
  const logic = flags.logic ? normalizeFilterLogic(flags.logic) : '$and';
  const condition = flags['condition-json']
    ? parseJson(flags['condition-json'], 'condition-json')
    : {
      path: normalizeNonEmpty(flags.path, 'path'),
      operator: normalizeNonEmpty(flags.operator, 'operator'),
      value: parseJson(flags['value-json'], 'value-json'),
    };
  return buildQueryFilter({ logic, condition });
}

function handleBuildFilter(flags) {
  const result = buildFilterFromFlags(flags);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function handleBuildQueryFilter(flags) {
  const result = buildQueryFilterFromFlags(flags);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function handleExtractRequiredMetadata(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const metadata = flags['metadata-json'] || flags['metadata-file']
    ? readJsonInput(flags['metadata-json'], flags['metadata-file'], 'metadata')
    : {};
  const result = extractRequiredMetadata({ payload, metadata });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function handleCanonicalizePayload(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const metadata = readJsonInput(flags['metadata-json'], flags['metadata-file'], 'metadata');
  const mode = flags.mode ? normalizeNonEmpty(flags.mode, 'mode') : DEFAULT_AUDIT_MODE;
  const result = canonicalizePayload({
    payload,
    metadata,
    mode,
    nocobaseRoot: flags['nocobase-root'],
    snapshotPath: flags['snapshot-file'],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function handleAuditPayload(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const metadata = readJsonInput(flags['metadata-json'], flags['metadata-file'], 'metadata');
  const mode = flags.mode ? normalizeNonEmpty(flags.mode, 'mode') : DEFAULT_AUDIT_MODE;
  const riskAccept = Array.isArray(flags['risk-accept']) ? flags['risk-accept'] : [];
  const requirements = flags['requirements-json'] || flags['requirements-file']
    ? readJsonInput(flags['requirements-json'], flags['requirements-file'], 'requirements')
    : {};
  const result = auditPayload({
    payload,
    metadata,
    mode,
    riskAccept,
    requirements,
    nocobaseRoot: flags['nocobase-root'],
    snapshotPath: flags['snapshot-file'],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = BLOCKER_EXIT_CODE;
  }
}

function main(argv) {
  try {
    const { command, flags } = parseArgs(argv);
    if (command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    if (command === 'build-filter') {
      handleBuildFilter(flags);
      return;
    }
    if (command === 'build-query-filter') {
      handleBuildQueryFilter(flags);
      return;
    }
    if (command === 'extract-required-metadata') {
      handleExtractRequiredMetadata(flags);
      return;
    }
    if (command === 'canonicalize-payload') {
      handleCanonicalizePayload(flags);
      return;
    }
    if (command === 'audit-payload') {
      handleAuditPayload(flags);
      return;
    }
    throw new Error(`Unknown command "${command}"`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = path.resolve(fileURLToPath(import.meta.url));
if (executedPath === currentPath) {
  main(process.argv.slice(2));
}
