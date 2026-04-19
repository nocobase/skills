import { cloneSerializable, ensureArray, isPlainObject, trimToLength, unique } from './utils.js';
import { summarizeTemplateDecision } from './template-decision-summary.js';

const DEFAULT_MAX_SUMMARY_ITEMS = 4;
const DEFAULT_MAX_POPUP_DEPTH = 1;
const DEFAULT_EXPECTED_OUTER_TABS = 1;
const MAX_LABEL_LENGTH = 24;
const MAX_HEADER_TEXT = 48;
const PLACEHOLDER_TEXT_PATTERN = /^(summary|later|placeholder|todo)$/i;
const PLACEHOLDER_TEXT_CN_PATTERN = /^(备用|待定|稍后)$/;
const PLACEHOLDER_BLOCK_TYPES = new Set(['markdown', 'note', 'banner']);
const BLUEPRINT_ILLEGAL_ROOT_KEYS = new Set(['requestBody', 'templateDecision']);
const TAB_ILLEGAL_KEYS = new Set(['pageSchemaUid', 'requestBody', 'target']);
const EDIT_ACTION_TYPES = new Set(['edit']);
const REAL_TEMPLATE_MODES = new Set(['reference', 'copy']);
const APPLY_BLUEPRINT_REACTION_TYPES = new Set([
  'setFieldValueRules',
  'setFieldLinkageRules',
  'setBlockLinkageRules',
  'setActionLinkageRules',
]);
const APPLY_BLUEPRINT_REACTION_ITEM_KEYS = new Set(['type', 'target', 'rules', 'expectedFingerprint']);
const BLOCK_REACTION_TYPES = new Set([
  'setFieldValueRules',
  'setFieldLinkageRules',
  'setBlockLinkageRules',
]);
const BLOCK_OR_ACTION_LINKAGE_REACTION_TYPES = new Set([
  'setBlockLinkageRules',
  'setActionLinkageRules',
]);
const FILTER_BLOCK_TYPES = new Set(['filterForm']);
const RESOURCE_BLOCK_SHORTHAND_KEYS = new Set([
  'collection',
  'binding',
  'dataSourceKey',
  'associationPathName',
  'associationField',
]);
const ADD_CHILD_RECORD_ACTION_MESSAGE =
  '`addChild` must stay under `recordActions`; whole-page blueprint drafts may still author it there, but final apply only works when the live target `catalog.recordActions` exposes it for a tree collection table with `treeTable` enabled.`';

function normalizeText(value, fallback = '') {
  const source = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const normalized = source.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeApplyBlueprintToken(value, fallback = 'item') {
  const normalized = String(value || '')
    .trim()
    .replace(/[.[\](){}]+/g, '_')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function buildScopedKey(scopePrefix, localKey) {
  return scopePrefix ? `${scopePrefix}.${localKey}` : localKey;
}

function resolveBlueprintLocalKey(rawValue, fallback) {
  const explicit = normalizeText(rawValue);
  return {
    key: explicit || normalizeApplyBlueprintToken(fallback, fallback),
    explicit: !!explicit,
  };
}

function resolveTabLocalKey(tab, index, usedKeys) {
  const fallback = normalizeText(tab?.title) || `tab_${index + 1}`;
  const resolved = resolveBlueprintLocalKey(tab?.key, fallback);
  if (!usedKeys.has(resolved.key)) {
    usedKeys.add(resolved.key);
    return resolved;
  }
  if (resolved.explicit) {
    return resolved;
  }

  let suffix = 2;
  let candidate = `${resolved.key}_${suffix}`;
  while (usedKeys.has(candidate)) {
    suffix += 1;
    candidate = `${resolved.key}_${suffix}`;
  }
  usedKeys.add(candidate);
  return {
    key: candidate,
    explicit: false,
  };
}

function resolveBlockLocalKey(block, index) {
  return resolveBlueprintLocalKey(block?.key, normalizeText(block?.type) || `block_${index + 1}`);
}

function resolveActionLocalKey(action, index) {
  if (typeof action === 'string') {
    const type = normalizeText(action);
    if (!type) return null;
    return resolveBlueprintLocalKey('', `${type}_${index + 1}`);
  }
  if (!isPlainObject(action)) return null;
  const type = normalizeText(action.type) || 'action';
  return resolveBlueprintLocalKey(action.key, `${type}_${index + 1}`);
}

function buildReactionTargetRegistry(blueprint) {
  const blockTargets = new Map();
  const actionTargets = new Map();
  const usedTabKeys = new Set();

  for (const [tabIndex, tab] of ensureArray(blueprint?.tabs).entries()) {
    if (!isPlainObject(tab)) continue;
    const tabInfo = resolveTabLocalKey(tab, tabIndex, usedTabKeys);

    for (const [blockIndex, block] of ensureArray(tab.blocks).entries()) {
      if (!isPlainObject(block)) continue;
      const blockInfo = resolveBlockLocalKey(block, blockIndex);
      const blockTarget = buildScopedKey(tabInfo.key, blockInfo.key);
      blockTargets.set(blockTarget, {
        path: `tabs[${tabIndex}].blocks[${blockIndex}]`,
        requiresExplicitKey: !tabInfo.explicit || !blockInfo.explicit,
      });

      for (const [actionIndex, action] of ensureArray(block.actions).entries()) {
        const actionInfo = resolveActionLocalKey(action, actionIndex);
        if (!actionInfo) continue;
        const actionTarget = buildScopedKey(blockTarget, actionInfo.key);
        actionTargets.set(actionTarget, {
          path: `tabs[${tabIndex}].blocks[${blockIndex}].actions[${actionIndex}]`,
          requiresExplicitKey: !tabInfo.explicit || !blockInfo.explicit || !actionInfo.explicit,
        });
      }

      for (const [actionIndex, action] of ensureArray(block.recordActions).entries()) {
        const actionInfo = resolveActionLocalKey(action, actionIndex);
        if (!actionInfo) continue;
        const actionTarget = buildScopedKey(blockTarget, actionInfo.key);
        actionTargets.set(actionTarget, {
          path: `tabs[${tabIndex}].blocks[${blockIndex}].recordActions[${actionIndex}]`,
          requiresExplicitKey: !tabInfo.explicit || !blockInfo.explicit || !actionInfo.explicit,
        });
      }
    }
  }

  return {
    blockTargets,
    actionTargets,
  };
}

function visitConditionItems(condition, basePath, visitor) {
  if (!isPlainObject(condition) || !Array.isArray(condition.items)) return;

  for (const [index, item] of condition.items.entries()) {
    const itemPath = `${basePath}.items[${index}]`;
    if (!isPlainObject(item)) continue;
    visitor(item, itemPath);
    if (Array.isArray(item.items)) visitConditionItems(item, itemPath, visitor);
  }
}

function trimLabel(value, maxLength = MAX_LABEL_LENGTH) {
  const source = normalizeText(value);
  if (!source) return '';
  if (source.length <= maxLength) return source;
  if (maxLength <= 3) return source.slice(0, maxLength);
  return `${source.slice(0, maxLength - 3)}...`;
}

function padRight(value, width) {
  const source = String(value ?? '');
  return source.length >= width ? source : `${source}${' '.repeat(width - source.length)}`;
}

function indentLines(lines, prefix = '  ') {
  return ensureArray(lines).map((line) => `${prefix}${line}`);
}

function makeBox(title, bodyLines = []) {
  const safeTitle = normalizeText(title, 'Untitled');
  const normalizedBody = ensureArray(bodyLines).map((line) => String(line ?? ''));
  const innerWidth = Math.max(safeTitle.length, ...normalizedBody.map((line) => line.length), 1);
  const border = `+${'-'.repeat(innerWidth + 2)}+`;
  const lines = [border, `| ${padRight(safeTitle, innerWidth)} |`];

  if (normalizedBody.length) {
    lines.push(`|${'-'.repeat(innerWidth + 2)}|`);
    for (const line of normalizedBody) {
      lines.push(`| ${padRight(line, innerWidth)} |`);
    }
  }

  lines.push(border);
  return lines;
}

function summarizeList(labels, { maxItems = DEFAULT_MAX_SUMMARY_ITEMS, formatter = (value) => value } = {}) {
  const normalized = labels.map((label) => formatter(label)).filter(Boolean);
  if (!normalized.length) return '';
  const visible = normalized.slice(0, maxItems);
  const hiddenCount = normalized.length - visible.length;
  return hiddenCount > 0 ? `${visible.join(', ')}, +${hiddenCount} more` : visible.join(', ');
}

function getMenuPath(blueprint) {
  const groupTitle = normalizeText(blueprint?.navigation?.group?.title);
  const groupRouteId = blueprint?.navigation?.group?.routeId;
  const itemTitle = normalizeText(blueprint?.navigation?.item?.title);
  const parts = [];

  if (groupTitle) parts.push(groupTitle);
  else if (typeof groupRouteId !== 'undefined') parts.push(`group#${groupRouteId}`);

  if (itemTitle) parts.push(itemTitle);
  return parts.join(' / ');
}

function getPageTitle(blueprint) {
  return (
    normalizeText(blueprint?.page?.title) ||
    normalizeText(blueprint?.navigation?.item?.title) ||
    normalizeText(blueprint?.target?.pageSchemaUid) ||
    'Untitled page'
  );
}

function getFactsPageTitle(blueprint) {
  if (!isPlainObject(blueprint)) return '';
  return (
    normalizeText(blueprint?.page?.title) ||
    normalizeText(blueprint?.navigation?.item?.title) ||
    normalizeText(blueprint?.target?.pageSchemaUid)
  );
}

function getCollectionLabel(node) {
  return normalizeText(node?.collection) || normalizeText(node?.resource?.collectionName) || normalizeText(node?.resource?.collection);
}

function hasResourceBinding(node) {
  if (!isPlainObject(node)) return false;
  if (isPlainObject(node.resource) && Object.keys(node.resource).length > 0) {
    return true;
  }
  for (const key of RESOURCE_BLOCK_SHORTHAND_KEYS) {
    if (normalizeText(node[key])) {
      return true;
    }
  }
  return false;
}

function isTemplateBackedBlock(block) {
  return hasTemplateDocument(block?.template);
}

function isFilterBlock(block) {
  return FILTER_BLOCK_TYPES.has(normalizeText(block?.type));
}

function isDataBlock(block) {
  return hasResourceBinding(block);
}

function collectLayoutRowKeys(row) {
  return ensureArray(row)
    .map((cell) => {
      if (typeof cell === 'string') return normalizeText(cell);
      if (isPlainObject(cell)) return normalizeText(cell.key);
      return '';
    })
    .filter(Boolean);
}

function describeResource(node) {
  if (!isPlainObject(node?.resource)) return '';
  const binding = normalizeText(node.resource.binding || node.resource.resourceBinding);
  const associationField = normalizeText(node.resource.associationField);
  const collectionName = normalizeText(node.resource.collectionName || node.resource.collection);
  const parts = [];
  if (binding) parts.push(binding);
  if (associationField) parts.push(`assoc=${associationField}`);
  if (collectionName) parts.push(`<${collectionName}>`);
  return parts.length ? `Resource: ${parts.join(' ')}` : '';
}

function describeTemplateReference(template) {
  if (!isPlainObject(template)) return '';
  const uid = normalizeText(template.uid);
  if (!uid) return '';
  const mode = normalizeText(template.mode);
  const usage = normalizeText(template.usage);
  const suffix = [];
  if (mode) suffix.push(`mode=${mode}`);
  if (usage) suffix.push(`usage=${usage}`);
  return suffix.length ? `Template: ${uid} [${suffix.join(', ')}]` : `Template: ${uid}`;
}

function describePopupTryTemplate(popup) {
  return popup?.tryTemplate === true ? 'Template: auto-select [tryTemplate=true]' : '';
}

function describePopupSaveAsTemplate(popup) {
  if (!isPlainObject(popup?.saveAsTemplate)) return '';
  const name = normalizeText(popup.saveAsTemplate.name);
  if (!name) return '';
  const label = trimLabel(name, MAX_HEADER_TEXT);
  return normalizeText(popup.saveAsTemplate.description)
    ? `Template: save as "${label}" [description provided]`
    : `Template: save as "${label}"`;
}

function hasOwn(target, key) {
  return isPlainObject(target) && Object.prototype.hasOwnProperty.call(target, key);
}

function createValidationError(path, ruleId, message) {
  return {
    path,
    ruleId,
    message,
  };
}

function pushValidationError(errors, seen, path, ruleId, message) {
  const key = `${path}::${ruleId}::${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  errors.push(createValidationError(path, ruleId, message));
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function getExpectedOuterTabs(options = {}) {
  return isPositiveInteger(options.expectedOuterTabs) ? options.expectedOuterTabs : DEFAULT_EXPECTED_OUTER_TABS;
}

function hasPlaceholderText(value) {
  const text = normalizeText(value);
  if (!text) return false;
  return PLACEHOLDER_TEXT_PATTERN.test(text) || PLACEHOLDER_TEXT_CN_PATTERN.test(text);
}

function isPlaceholderBlock(block) {
  if (!isPlainObject(block)) return false;
  const type = normalizeLowerText(block.type);
  if (!PLACEHOLDER_BLOCK_TYPES.has(type)) return false;

  const combined = [block.title, block.content, block.text, block.markdown].map((item) => normalizeText(item)).filter(Boolean).join(' ');
  return !combined || hasPlaceholderText(combined);
}

function isPlaceholderTab(tab) {
  if (!isPlainObject(tab)) return false;
  if (hasPlaceholderText(tab.title)) return true;
  const blocks = ensureArray(tab.blocks);
  return blocks.length > 0 && blocks.every((block) => isPlaceholderBlock(block));
}

function countBlocksOfType(blocks, type) {
  const normalizedType = normalizeLowerText(type);
  return ensureArray(blocks).filter(
    (block) => isPlainObject(block) && normalizeLowerText(block.type) === normalizedType,
  ).length;
}

function getRealTemplateBinding(template) {
  if (!isPlainObject(template)) return null;

  const uid = normalizeText(template.uid);
  const mode = normalizeLowerText(template.mode);
  if (!uid || !REAL_TEMPLATE_MODES.has(mode)) return null;

  return { uid, mode };
}

function hasTemplateDocument(template) {
  return !!normalizeText(template?.uid);
}

function getIgnoredPopupLocalKeys(popup) {
  if (!isPlainObject(popup) || !hasTemplateDocument(popup.template)) return [];
  return ['mode', 'blocks', 'layout'].filter((key) => hasOwn(popup, key));
}

function buildIgnoredPopupLocalKeysWarning(popup, keys) {
  const title = normalizeText(popup?.title);
  const prefix = title ? `Popup "${trimLabel(title, MAX_HEADER_TEXT)}"` : 'Popup template binding';
  return `${prefix} will ignore local popup keys: ${keys.join(', ')}.`;
}

function collectTemplateBindingsFromPopup(popup, path, bindings) {
  if (!isPlainObject(popup)) return;

  const templateBinding = getRealTemplateBinding(popup.template);
  if (templateBinding) {
    bindings.push({
      ...templateBinding,
      path: `${path}.template`,
    });
    return;
  }

  for (const [index, block] of ensureArray(popup.blocks).entries()) {
    collectTemplateBindingsFromBlock(block, `${path}.blocks[${index}]`, bindings);
  }
}

function collectTemplateBindingsFromPopupItems(items, path, bindings) {
  for (const [index, item] of ensureArray(items).entries()) {
    if (!isPlainObject(item) || !hasOwn(item, 'popup')) continue;
    collectTemplateBindingsFromPopup(item.popup, `${path}[${index}].popup`, bindings);
  }
}

function collectTemplateBindingsFromBlock(block, path, bindings) {
  if (!isPlainObject(block)) return;

  const templateBinding = getRealTemplateBinding(block.template);
  if (templateBinding) {
    bindings.push({
      ...templateBinding,
      path: `${path}.template`,
    });
  }

  collectTemplateBindingsFromPopupItems(block.fields, `${path}.fields`, bindings);
  collectTemplateBindingsFromPopupItems(block.actions, `${path}.actions`, bindings);
  collectTemplateBindingsFromPopupItems(block.recordActions, `${path}.recordActions`, bindings);
}

function collectBlueprintTemplateBindings(blueprint) {
  const bindings = [];

  for (const [tabIndex, tab] of ensureArray(blueprint?.tabs).entries()) {
    if (!isPlainObject(tab)) continue;
    for (const [blockIndex, block] of ensureArray(tab.blocks).entries()) {
      collectTemplateBindingsFromBlock(block, `tabs[${tabIndex}].blocks[${blockIndex}]`, bindings);
    }
  }

  return bindings;
}

function summarizeTemplateBindings(bindings) {
  return bindings
    .slice(0, DEFAULT_MAX_SUMMARY_ITEMS)
    .map((binding) => `"${binding.uid}" via ${binding.mode} at ${binding.path}`)
    .join(', ');
}

function describeField(field) {
  if (typeof field === 'string') return trimLabel(field);
  if (!isPlainObject(field)) return '';
  return trimLabel(field.field || field.title || field.key || field.type || 'field');
}

function describeAction(action) {
  if (typeof action === 'string') return `[${trimLabel(action)}]`;
  if (!isPlainObject(action)) return '';
  const label = trimLabel(action.title || action.type || action.key || 'action');
  return `[${label}]`;
}

function describePopupTrigger(kind, label) {
  if (kind === 'field') return `Popup from field "${label}"`;
  if (kind === 'recordAction') return `Popup from recordAction [${label}]`;
  if (kind === 'action') return `Popup from action [${label}]`;
  return `Popup from ${kind} "${label}"`;
}

function getPopupTriggers(block) {
  const triggers = [];

  for (const field of ensureArray(block?.fields)) {
    if (isPlainObject(field) && field.popup) {
      triggers.push({
        kind: 'field',
        label: describeField(field) || 'field',
        popup: field.popup,
      });
    }
  }

  for (const action of ensureArray(block?.actions)) {
    if (isPlainObject(action) && action.popup) {
      triggers.push({
        kind: 'action',
        label: trimLabel(action.title || action.type || action.key || 'action'),
        popup: action.popup,
      });
    }
  }

  for (const action of ensureArray(block?.recordActions)) {
    if (isPlainObject(action) && action.popup) {
      triggers.push({
        kind: 'recordAction',
        label: trimLabel(action.title || action.type || action.key || 'record action'),
        popup: action.popup,
      });
    }
  }

  return triggers;
}

function analyzeLayoutDocument(layout, blocks, warnings = []) {
  if (!isPlainObject(layout) || !Array.isArray(layout.rows) || !layout.rows.length) {
    return null;
  }

  const normalizedBlocks = ensureArray(blocks).filter((block) => isPlainObject(block));
  const blocksByKey = new Map();
  const keylessBlocks = [];
  normalizedBlocks.forEach((block, index) => {
    const key = normalizeText(block?.key);
    if (key) {
      blocksByKey.set(key, block);
      return;
    }
    keylessBlocks.push({ index, block });
  });

  const rows = [];
  const unknownRefs = [];
  const unsupportedCells = [];
  const placedKeys = new Set();

  layout.rows.forEach((row, rowIndex) => {
    const cells = [];
    const items = [];

    ensureArray(row).forEach((cell, cellIndex) => {
      if (typeof cell === 'string') {
        const key = normalizeText(cell);
        if (!key) {
          warnings.push(`Layout row ${rowIndex + 1} contains an unsupported cell and was skipped.`);
          unsupportedCells.push({ rowIndex, cellIndex });
          return;
        }
        if (!blocksByKey.has(key)) {
          warnings.push(`Layout row ${rowIndex + 1} references missing block key "${key}".`);
          unknownRefs.push({ rowIndex, cellIndex, key });
        } else {
          placedKeys.add(key);
          items.push({ key });
        }
        cells.push(`[${key}]`);
        return;
      }

      if (isPlainObject(cell) && normalizeText(cell.key)) {
        const key = normalizeText(cell.key);
        const span =
          typeof cell.span === 'number' && Number.isFinite(cell.span) ? String(cell.span) : normalizeText(cell.span);
        if (!blocksByKey.has(key)) {
          warnings.push(`Layout row ${rowIndex + 1} references missing block key "${key}".`);
          unknownRefs.push({ rowIndex, cellIndex, key });
        } else {
          placedKeys.add(key);
          items.push({ key, span });
        }
        cells.push(span ? `[${key} span=${span}]` : `[${key}]`);
        return;
      }

      warnings.push(`Layout row ${rowIndex + 1} contains an unsupported cell and was skipped.`);
      unsupportedCells.push({ rowIndex, cellIndex });
    });

    rows.push({
      label: cells.join(' '),
      items,
    });
  });

  const blockEntries = normalizedBlocks.map((block, index) => ({
    block,
    index,
    key: normalizeText(block?.key),
  }));
  const unplacedBlocks = blockEntries.filter(({ key }) => key && !placedKeys.has(key));
  const filterKeys = blockEntries
    .filter(({ block, key }) => key && isFilterBlock(block))
    .map(({ key }) => key);
  const nonFilterRows = rows
    .map((row) => row.items.map((item) => item.key).filter((key) => !filterKeys.includes(key)))
    .filter((row) => row.length > 0);

  return {
    rows,
    blockMap: blocksByKey,
    keylessBlocks,
    unknownRefs,
    unsupportedCells,
    unplacedBlocks,
    filterKeys,
    nonFilterRows,
    nonFilterBlockCount: countNonFilterBlocks(normalizedBlocks),
  };
}

function collectLayoutOrder(layout, blocks, warnings) {
  const analysis = analyzeLayoutDocument(layout, blocks, warnings);
  return analysis?.rows || null;
}

function buildBlockHeader(block, options = {}) {
  const parts = [normalizeText(block?.type, 'block')];
  const title = trimLabel(normalizeText(block?.title), MAX_HEADER_TEXT);
  const collection = trimLabel(getCollectionLabel(block), MAX_HEADER_TEXT);
  const key = trimLabel(normalizeText(block?.key), MAX_HEADER_TEXT);
  const span = normalizeText(options.span);

  if (title) parts.push(`"${title}"`);
  if (collection) parts.push(`<${collection}>`);
  if (key) parts.push(`[${key}]`);
  if (span) parts.push(`span=${span}`);
  return parts.join(' ');
}

function renderPopupDocument(popup, context) {
  const warnings = context.warnings;
  const body = [];
  const templateLine = describeTemplateReference(popup?.template);
  if (templateLine) body.push(templateLine);
  const tryTemplateLine = describePopupTryTemplate(popup);
  if (tryTemplateLine && !templateLine) body.push(tryTemplateLine);
  const saveAsTemplateLine = describePopupSaveAsTemplate(popup);
  if (saveAsTemplateLine && !templateLine) body.push(saveAsTemplateLine);

  const ignoredLocalKeys = getIgnoredPopupLocalKeys(popup);
  if (ignoredLocalKeys.length) {
    body.push(`Ignored local popup keys: ${ignoredLocalKeys.join(', ')}`);
    warnings.push(buildIgnoredPopupLocalKeysWarning(popup, ignoredLocalKeys));
  }

  if (hasTemplateDocument(popup?.template)) {
    return makeBox(`Popup: ${trimLabel(normalizeText(popup?.title, 'Untitled popup'), MAX_HEADER_TEXT)}`, body);
  }

  const blocks = ensureArray(popup?.blocks).filter((block) => isPlainObject(block));
  const layoutRows = collectLayoutOrder(popup?.layout, blocks, warnings);

  if (layoutRows?.length) {
    const rendered = new Set();
    if (body.length) body.push('');
    for (const [rowIndex, row] of layoutRows.entries()) {
      body.push(`Row ${rowIndex + 1}: ${row.label || '(empty)'}`);
      for (const item of row.items) {
        const block = blocks.find((candidate) => normalizeText(candidate?.key) === item.key);
        if (!block || rendered.has(item.key)) continue;
        rendered.add(item.key);
        body.push(...indentLines(renderBlock(block, { ...context, span: item.span }), '  '));
      }
      if (rowIndex !== layoutRows.length - 1) body.push('');
    }

    const unplaced = blocks.filter((block) => {
      const key = normalizeText(block?.key);
      return !key || !rendered.has(key);
    });

    if (unplaced.length) {
      if (body.length) body.push('');
      body.push('Unplaced blocks:');
      for (const block of unplaced) {
        body.push(...indentLines(renderBlock(block, context), '  '));
      }
    }
  } else if (blocks.length) {
    for (const [index, block] of blocks.entries()) {
      body.push(...indentLines(renderBlock(block, context), '  '));
      if (index !== blocks.length - 1) body.push('');
    }
  } else if (!popup?.template?.uid && popup?.tryTemplate !== true) {
    body.push('Default popup content');
  }

  return makeBox(`Popup: ${trimLabel(normalizeText(popup?.title, 'Untitled popup'), MAX_HEADER_TEXT)}`, body);
}

function renderPopupTriggers(block, context) {
  const lines = [];
  for (const trigger of getPopupTriggers(block)) {
    const lead = describePopupTrigger(trigger.kind, trigger.label);
    if (context.popupDepth >= context.maxPopupDepth) {
      lines.push(`${lead}: nested popup omitted`);
      context.warnings.push(`${lead} was omitted because preview expands popups only ${context.maxPopupDepth} level(s).`);
      continue;
    }

    lines.push(`${lead}:`);
    lines.push(
      ...indentLines(
        renderPopupDocument(trigger.popup, {
          ...context,
          popupDepth: context.popupDepth + 1,
          span: undefined,
        }),
        '  ',
      ),
    );
  }
  return lines;
}

function renderBlock(block, context) {
  const body = [];
  const fields = ensureArray(block?.fields).map(describeField).filter(Boolean);
  const actions = ensureArray(block?.actions).map(describeAction).filter(Boolean);
  const recordActions = ensureArray(block?.recordActions).map(describeAction).filter(Boolean);
  const script = normalizeText(block?.script);
  const chart = normalizeText(block?.chart);
  const resource = describeResource(block);
  const templateLine = describeTemplateReference(block?.template);

  if (templateLine) body.push(templateLine);

  const fieldsSummary = summarizeList(fields, { formatter: (value) => value });
  if (fieldsSummary) body.push(`Fields: ${fieldsSummary}`);

  const actionsSummary = summarizeList(actions, { formatter: (value) => value });
  if (actionsSummary) body.push(`Actions: ${actionsSummary}`);

  const recordActionsSummary = summarizeList(recordActions, { formatter: (value) => value });
  if (recordActionsSummary) body.push(`Record actions: ${recordActionsSummary}`);

  if (resource) body.push(resource);
  if (script) body.push(`Script: ${trimLabel(script, MAX_HEADER_TEXT)}`);
  if (chart) body.push(`Chart: ${trimLabel(chart, MAX_HEADER_TEXT)}`);

  const popupLines = renderPopupTriggers(block, context);
  if (popupLines.length && body.length) body.push('');
  body.push(...popupLines);

  return makeBox(buildBlockHeader(block, context), body);
}

function renderTab(tab, index, context) {
  const blocks = ensureArray(tab?.blocks).filter((block) => isPlainObject(block));
  const body = [];
  const layoutRows = collectLayoutOrder(tab?.layout, blocks, context.warnings);

  if (layoutRows?.length) {
    const rendered = new Set();
    for (const [rowIndex, row] of layoutRows.entries()) {
      body.push(`Row ${rowIndex + 1}: ${row.label || '(empty)'}`);
      for (const item of row.items) {
        const block = blocks.find((candidate) => normalizeText(candidate?.key) === item.key);
        if (!block || rendered.has(item.key)) continue;
        rendered.add(item.key);
        body.push(...indentLines(renderBlock(block, { ...context, span: item.span }), '  '));
      }
      if (rowIndex !== layoutRows.length - 1) body.push('');
    }

    const unplaced = blocks.filter((block) => {
      const key = normalizeText(block?.key);
      return !key || !rendered.has(key);
    });

    if (unplaced.length) {
      if (body.length) body.push('');
      body.push('Unplaced blocks:');
      for (const block of unplaced) {
        body.push(...indentLines(renderBlock(block, context), '  '));
      }
    }
  } else if (blocks.length) {
    for (const [blockIndex, block] of blocks.entries()) {
      body.push(...indentLines(renderBlock(block, context), '  '));
      if (blockIndex !== blocks.length - 1) body.push('');
    }
  } else {
    body.push('No blocks');
  }

  const tabTitle = trimLabel(normalizeText(tab?.title, `Tab ${index + 1}`), MAX_HEADER_TEXT);
  return makeBox(`Tab: ${tabTitle}`, body);
}

function isWrappedBlueprintInput(input) {
  return isPlainObject(input)
    && !Array.isArray(input.tabs)
    && !normalizeText(input.mode)
    && !normalizeText(input.version)
    && hasOwn(input, 'requestBody');
}

function isPrepareHelperEnvelope(input) {
  return isWrappedBlueprintInput(input) && hasOwn(input, 'templateDecision');
}

function normalizeBlueprintInput(input, warnings, errors = [], options = {}) {
  const { suppressLegacyWrapperWarning = false } = options;
  if (!isPlainObject(input)) return null;

  if (isWrappedBlueprintInput(input)) {
    if (isPlainObject(input.requestBody)) {
      if (!suppressLegacyWrapperWarning) {
        warnings.push('Received outer requestBody wrapper; preview unwrapped the inner page blueprint.');
      }
      return input.requestBody;
    }

    if (typeof input.requestBody === 'string') {
      errors.push(
        createValidationError(
          'requestBody',
          'stringified-request-body',
          'Outer requestBody must stay an object page blueprint, not a JSON string.',
        ),
      );
      return null;
    }

    errors.push(
      createValidationError(
        'requestBody',
        'invalid-request-body',
        'Outer requestBody must contain one object page blueprint.',
      ),
    );
    return null;
  }

  return input;
}

function extractPrepareTemplateDecision(input, options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'templateDecision')) {
    return options.templateDecision;
  }

  if (isPrepareHelperEnvelope(input)) {
    return input.templateDecision;
  }

  return undefined;
}

function validateTemplateDecision(decision) {
  if (typeof decision === 'undefined') {
    return {
      errors: [],
      summary: undefined,
    };
  }

  try {
    return {
      errors: [],
      summary: summarizeTemplateDecision(decision),
    };
  } catch (error) {
    return {
      errors: [
        createValidationError(
          'templateDecision',
          'invalid-template-decision',
          error?.message || String(error),
        ),
      ],
      summary: undefined,
    };
  }
}

function validateTemplateDecisionConsistency(templateDecision, blueprint) {
  if (!templateDecision || !isRecognizablePageBlueprint(blueprint)) {
    return [];
  }

  const bindings = collectBlueprintTemplateBindings(blueprint);

  if (templateDecision.kind === 'selected-reference' || templateDecision.kind === 'selected-copy') {
    const expectedUid = normalizeText(templateDecision?.template?.uid);
    const expectedMode = normalizeLowerText(templateDecision.mode);
    const matchedBinding = bindings.find((binding) => binding.uid === expectedUid && binding.mode === expectedMode);

    if (!matchedBinding) {
      const details = bindings.length
        ? ` Found bound templates: ${summarizeTemplateBindings(bindings)}.`
        : ' The blueprint does not bind any template with that uid/mode.';

      return [
        createValidationError(
          'templateDecision',
          'inconsistent-template-decision',
          `templateDecision "${templateDecision.kind}" requires template "${expectedUid}" via ${expectedMode} in the blueprint.${details}`,
        ),
      ];
    }

    return [];
  }

  return [];
}

function isRecognizablePageBlueprint(blueprint) {
  return isPlainObject(blueprint) && Array.isArray(blueprint.tabs) && !!normalizeText(blueprint.mode);
}

function renderRecognizableBlueprintAscii(blueprint, warnings, options = {}) {
  const maxPopupDepth =
    typeof options.maxPopupDepth === 'number' && Number.isFinite(options.maxPopupDepth)
      ? Math.max(0, options.maxPopupDepth)
      : DEFAULT_MAX_POPUP_DEPTH;

  const lines = [];
  const pageTitle = trimLabel(getPageTitle(blueprint), MAX_HEADER_TEXT);
  lines.push(`PAGE: ${pageTitle} (${normalizeText(blueprint.mode, 'draft')})`);

  const menuPath = getMenuPath(blueprint);
  if (menuPath) lines.push(`MENU: ${trimToLength(menuPath, 120)}`);

  const targetPage = normalizeText(blueprint?.target?.pageSchemaUid);
  if (targetPage) lines.push(`TARGET: ${targetPage}`);

  lines.push(`TABS: ${blueprint.tabs.length}`);
  lines.push('');

  const tabContext = {
    warnings,
    popupDepth: 0,
    maxPopupDepth,
    maxSummaryItems: DEFAULT_MAX_SUMMARY_ITEMS,
  };

  for (const [index, tab] of blueprint.tabs.entries()) {
    lines.push(...renderTab(tab, index, tabContext));
    if (index !== blueprint.tabs.length - 1) lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function validateMultiBlockDataTitles(blocks, path, state) {
  const normalizedBlocks = ensureArray(blocks).filter((block) => isPlainObject(block));
  if (normalizedBlocks.length <= 1) {
    return;
  }

  normalizedBlocks.forEach((block, index) => {
    if (!isDataBlock(block) || isTemplateBackedBlock(block) || normalizeText(block.title)) {
      return;
    }
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}[${index}].title`,
      'multi-block-data-title-required',
      'When one tab or popup contains multiple blocks, every data block with a resource must include a title unless it is template-backed.',
    );
  });
}

function countNonFilterBlocks(blocks) {
  return ensureArray(blocks).filter((block) => isPlainObject(block) && !isFilterBlock(block)).length;
}

function hasActionType(actions, expectedType) {
  const normalizedExpectedType = normalizeLowerText(expectedType);
  return ensureArray(actions).some((action) => {
    const actionType =
      typeof action === 'string' ? normalizeLowerText(action) : isPlainObject(action) ? normalizeLowerText(action.type) : '';
    return actionType === normalizedExpectedType;
  });
}

function validateMultiBlockLayoutRequirement(layout, blocks, path, state) {
  if (countNonFilterBlocks(blocks) <= 1) {
    return;
  }
  if (analyzeLayoutDocument(layout, blocks, [])) {
    return;
  }
  if (typeof layout !== 'undefined' && !isPlainObject(layout)) {
    return;
  }
  pushValidationError(
    state.errors,
    state.seenErrors,
    path,
    'multi-block-layout-required',
    'When multiple non-filter blocks share one tab or popup, provide explicit layout instead of relying on the default single-column stacking.',
  );
}

function validateExplicitLayoutRules(layout, blocks, path, blocksPath, state) {
  const analysis = analyzeLayoutDocument(layout, blocks, []);
  if (!analysis) {
    return;
  }

  analysis.keylessBlocks.forEach(({ index }) => {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${blocksPath}[${index}].key`,
      'layout-block-key-required',
      'Every block referenced by explicit layout must include a non-empty key.',
    );
  });

  analysis.unknownRefs.forEach(({ rowIndex, cellIndex, key }) => {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.rows[${rowIndex}][${cellIndex}]`,
      'layout-references-unknown-block',
      `Layout references unknown block key "${key}".`,
    );
  });

  analysis.unsupportedCells.forEach(({ rowIndex, cellIndex }) => {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.rows[${rowIndex}][${cellIndex}]`,
      'layout-contains-unsupported-cell',
      'Each layout cell must be either one block key string or one object containing key/span.',
    );
  });

  analysis.unplacedBlocks.forEach(({ index, key }) => {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${blocksPath}[${index}]`,
      'layout-missing-block-placement',
      `Block "${key}" must appear exactly once in explicit layout rows.`,
    );
  });

  if (analysis.blockMap.size <= 1) {
    return;
  }

  if (analysis.filterKeys.length > 0) {
    const firstRow = analysis.rows[0]?.items.map((item) => item.key) || [];
    const firstRowContainsOnlyFilters = firstRow.length > 0 && firstRow.every((key) => analysis.filterKeys.includes(key));
    const allFiltersPlacedFirst = analysis.filterKeys.every((key) => firstRow.includes(key));
    if (!firstRowContainsOnlyFilters || !allFiltersPlacedFirst) {
      pushValidationError(
        state.errors,
        state.seenErrors,
        `${path}.rows[0]`,
        'filter-layout-must-lead',
        'Filter blocks should occupy the top row alone when an explicit layout is provided.',
      );
    }
  }

  const isSingleColumnMultiBlock =
    analysis.nonFilterBlockCount > 1
    && analysis.nonFilterRows.length >= analysis.nonFilterBlockCount
    && analysis.nonFilterRows.every((row) => row.length <= 1);
  if (isSingleColumnMultiBlock) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.rows`,
      'single-column-multi-block-layout',
      'When multiple non-filter blocks share one tab or popup, the explicit layout must not place every block on its own row.',
    );
  }
}

function validateFilterBlockRules(blocks, path, state) {
  ensureArray(blocks).forEach((block, index) => {
    if (!isPlainObject(block) || !isFilterBlock(block) || isTemplateBackedBlock(block)) {
      return;
    }
    const fieldCount = ensureArray(block.fields).length;
    if (fieldCount < 4 || hasActionType(block.actions, 'collapse')) {
      return;
    }
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}[${index}].actions`,
      'filter-collapse-required',
      'Filter blocks with 4 or more fields must include a collapse action so the default filter area does not stay fully expanded.',
    );
  });
}

function validateCreateMenuIcons(blueprint, state) {
  if (normalizeLowerText(blueprint?.mode) !== 'create') {
    return;
  }
  const group = isPlainObject(blueprint?.navigation?.group) ? blueprint.navigation.group : null;
  if (group && !normalizeText(group.routeId) && !normalizeText(group.icon)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      'navigation.group.icon',
      'missing-menu-group-icon',
      'Creating a new menu group requires navigation.group.icon so the first or second level menu does not render without an icon.',
    );
  }
  const item = isPlainObject(blueprint?.navigation?.item) ? blueprint.navigation.item : null;
  if (item && !normalizeText(item.icon)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      'navigation.item.icon',
      'missing-menu-item-icon',
      'Creating a new menu item requires navigation.item.icon so first and second level menus always carry an icon.',
    );
  }
}

function validatePopupDocument(popup, path, state) {
  if (!isPlainObject(popup)) {
    pushValidationError(state.errors, state.seenErrors, path, 'invalid-popup', 'Popup must be one object.');
    return;
  }

  if (hasOwn(popup, 'tryTemplate') && typeof popup.tryTemplate !== 'boolean') {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.tryTemplate`,
      'invalid-popup-try-template',
      'popup.tryTemplate must stay a boolean when present.',
    );
  }

  const hasSaveAsTemplate = hasOwn(popup, 'saveAsTemplate');
  if (hasSaveAsTemplate && !isPlainObject(popup.saveAsTemplate)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.saveAsTemplate`,
      'invalid-popup-save-as-template',
      'popup.saveAsTemplate must stay one object when present.',
    );
  }
  if (isPlainObject(popup.saveAsTemplate) && !normalizeText(popup.saveAsTemplate.name)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.saveAsTemplate.name`,
      'invalid-popup-save-as-template-name',
      'popup.saveAsTemplate.name must stay a non-empty string.',
    );
  }
  if (isPlainObject(popup.saveAsTemplate) && !normalizeText(popup.saveAsTemplate.description)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.saveAsTemplate.description`,
      'invalid-popup-save-as-template-description',
      'popup.saveAsTemplate.description must stay a non-empty string.',
    );
  }
  if (hasSaveAsTemplate && hasTemplateDocument(popup.template)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.saveAsTemplate`,
      'conflicting-popup-save-as-template',
      'popup.saveAsTemplate cannot be combined with popup.template.',
    );
  }
  if (hasSaveAsTemplate && hasOwn(popup, 'tryTemplate')) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.saveAsTemplate`,
      'conflicting-popup-save-as-template',
      'popup.saveAsTemplate cannot be combined with popup.tryTemplate.',
    );
  }
  if (hasSaveAsTemplate && ensureArray(popup.blocks).length === 0) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.saveAsTemplate`,
      'popup-save-as-template-missing-blocks',
      'popup.saveAsTemplate requires explicit local popup.blocks.',
    );
  }

  if (hasTemplateDocument(popup.template)) {
    return;
  }

  if (hasOwn(popup, 'layout') && !isPlainObject(popup.layout)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.layout`,
      'invalid-layout-object',
      'layout must stay one object when present on a popup document.',
    );
  }

  if (hasOwn(popup, 'blocks') && !Array.isArray(popup.blocks)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.blocks`,
      'invalid-popup-blocks',
      'Popup blocks must stay one array when present.',
    );
  }

  for (const [index, block] of ensureArray(popup.blocks).entries()) {
    validateBlock(block, `${path}.blocks[${index}]`, state);
  }

  validateMultiBlockDataTitles(popup.blocks, `${path}.blocks`, state);
  validateMultiBlockLayoutRequirement(popup.layout, popup.blocks, `${path}.layout`, state);
  validateExplicitLayoutRules(popup.layout, popup.blocks, `${path}.layout`, `${path}.blocks`, state);
  validateFilterBlockRules(popup.blocks, `${path}.blocks`, state);
}

function validateCustomEditPopup(popup, path, state) {
  if (!isPlainObject(popup)) return;
  if (hasTemplateDocument(popup.template)) return;

  const editFormCount = countBlocksOfType(popup.blocks, 'editForm');
  if (editFormCount !== 1) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      path,
      'custom-edit-popup-edit-form-count',
      `Custom edit popup must contain exactly one editForm block; found ${editFormCount}.`,
    );
  }
}

function validateFieldPopups(items, path, state) {
  for (const [index, item] of ensureArray(items).entries()) {
    if (!isPlainObject(item) || !hasOwn(item, 'popup')) continue;
    validatePopupDocument(item.popup, `${path}[${index}].popup`, state);
  }
}

function validateActions(items, path, state, { recordActions = false } = {}) {
  for (const [index, item] of ensureArray(items).entries()) {
    const actionType =
      typeof item === 'string' ? normalizeLowerText(item) : isPlainObject(item) ? normalizeLowerText(item.type) : '';
    if (!recordActions && actionType === 'addchild') {
      pushValidationError(
        state.errors,
        state.seenErrors,
        `${path}[${index}]`,
        'add-child-must-use-record-actions',
        ADD_CHILD_RECORD_ACTION_MESSAGE,
      );
    }
    if (!isPlainObject(item) || !hasOwn(item, 'popup')) continue;
    const popupPath = `${path}[${index}].popup`;
    validatePopupDocument(item.popup, popupPath, state);
    if (EDIT_ACTION_TYPES.has(normalizeLowerText(item.type))) {
      validateCustomEditPopup(item.popup, popupPath, state);
    }
  }
}

function validateBlock(block, path, state) {
  if (!isPlainObject(block)) {
    pushValidationError(state.errors, state.seenErrors, path, 'invalid-block', 'Every block must be one object.');
    return;
  }

  if (hasOwn(block, 'layout')) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.layout`,
      'block-layout-not-allowed',
      'Block-level layout is not allowed; move layout to tab.layout or popup.layout.',
    );
  }

  if (isPlaceholderBlock(block)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      path,
      'placeholder-block',
      'Placeholder markdown/note/banner blocks must be removed before first write.',
    );
  }

  const key = normalizeText(block.key);
  if (key) {
    if (state.blockKeyPaths.has(key)) {
      pushValidationError(
        state.errors,
        state.seenErrors,
        `${path}.key`,
        'duplicate-block-key',
        `Block key "${key}" must be unique within the blueprint; first used at ${state.blockKeyPaths.get(key)}.`,
      );
    } else {
      state.blockKeyPaths.set(key, path);
    }
  }

  validateFieldPopups(block.fields, `${path}.fields`, state);
  validateActions(block.actions, `${path}.actions`, state, { recordActions: false });
  validateActions(block.recordActions, `${path}.recordActions`, state, { recordActions: true });
}

function validateTab(tab, index, state) {
  const path = `tabs[${index}]`;

  if (!isPlainObject(tab)) {
    pushValidationError(state.errors, state.seenErrors, path, 'invalid-tab', 'Every tab must be one object.');
    return;
  }

  for (const key of TAB_ILLEGAL_KEYS) {
    if (!hasOwn(tab, key)) continue;
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.${key}`,
      'illegal-tab-key',
      `Tab objects must not include "${key}". Keep page-level targeting and request envelopes outside tabs.`,
    );
  }

  if (hasOwn(tab, 'layout') && !isPlainObject(tab.layout)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.layout`,
      'invalid-layout-object',
      'layout must stay one object when present on a tab.',
    );
  }

  if (!Array.isArray(tab.blocks) || tab.blocks.length === 0) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      `${path}.blocks`,
      'empty-tab-blocks',
      'Each tab must contain one non-empty blocks array.',
    );
  }

  if (isPlaceholderTab(tab)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      path,
      'placeholder-tab',
      'Placeholder tabs such as Summary/Later/备用 must be removed before first write.',
    );
  }

  for (const [blockIndex, block] of ensureArray(tab.blocks).entries()) {
    validateBlock(block, `${path}.blocks[${blockIndex}]`, state);
  }

  validateMultiBlockDataTitles(tab.blocks, `${path}.blocks`, state);
  validateMultiBlockLayoutRequirement(tab.layout, tab.blocks, `${path}.layout`, state);
  validateExplicitLayoutRules(tab.layout, tab.blocks, `${path}.layout`, `${path}.blocks`, state);
  validateFilterBlockRules(tab.blocks, `${path}.blocks`, state);
}

function validateReaction(blueprint, state) {
  if (!hasOwn(blueprint, 'reaction')) return;

  const reaction = blueprint.reaction;
  if (!isPlainObject(reaction)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      'reaction',
      'invalid-reaction',
      'reaction must stay one object when present.',
    );
    return;
  }

  if (!Array.isArray(reaction.items)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      'reaction.items',
      'invalid-reaction-items',
      'reaction.items must be an array when reaction is present.',
    );
    return;
  }

  for (const [index, item] of reaction.items.entries()) {
    const path = `reaction.items[${index}]`;
    if (!isPlainObject(item)) {
      pushValidationError(
        state.errors,
        state.seenErrors,
        path,
        'invalid-reaction-item',
        'Each reaction item must be one object.',
      );
      continue;
    }

    for (const key of Object.keys(item)) {
      if (APPLY_BLUEPRINT_REACTION_ITEM_KEYS.has(key)) continue;
      pushValidationError(
        state.errors,
        state.seenErrors,
        `${path}.${key}`,
        'invalid-reaction-item-key',
        `reaction item only accepts keys: ${Array.from(APPLY_BLUEPRINT_REACTION_ITEM_KEYS).join(', ')}; unsupported key "${key}".`,
      );
    }

    const type = normalizeText(item.type);
    if (!type) {
      pushValidationError(
        state.errors,
        state.seenErrors,
        `${path}.type`,
        'missing-reaction-type',
        'Each reaction item must include one non-empty type.',
      );
    } else if (!APPLY_BLUEPRINT_REACTION_TYPES.has(type)) {
      pushValidationError(
        state.errors,
        state.seenErrors,
        `${path}.type`,
        'unsupported-reaction-type',
        `reaction item type "${type}" is unsupported; use one of: ${Array.from(APPLY_BLUEPRINT_REACTION_TYPES).join(', ')}.`,
      );
    }

    const target = normalizeText(item.target);
    if (!target) {
      pushValidationError(
        state.errors,
        state.seenErrors,
        `${path}.target`,
        'missing-reaction-target',
        'Each reaction item target must be one same-run local key / bind key string.',
      );
    }

    if (!Array.isArray(item.rules)) {
      pushValidationError(
        state.errors,
        state.seenErrors,
        `${path}.rules`,
        'invalid-reaction-rules',
        'Each reaction item rules value must be an array.',
      );
    }

    for (const [ruleIndex, rule] of ensureArray(item.rules).entries()) {
      if (!isPlainObject(rule)) continue;
      visitConditionItems(rule.when, `${path}.rules[${ruleIndex}].when`, (conditionItem, conditionPath) => {
        const operator = normalizeText(conditionItem.operator);
        const conditionSourcePath = normalizeText(conditionItem.path);

        if (operator === '$isNotEmpty') {
          pushValidationError(
            state.errors,
            state.seenErrors,
            `${conditionPath}.operator`,
            'unsupported-reaction-operator',
            'Use "$notEmpty" instead of "$isNotEmpty" in reaction conditions.',
          );
        }

        if (
          BLOCK_OR_ACTION_LINKAGE_REACTION_TYPES.has(type)
          && conditionSourcePath.startsWith('formValues.')
        ) {
          pushValidationError(
            state.errors,
            state.seenErrors,
            `${conditionPath}.path`,
            'invalid-block-action-condition-path',
            `Whole-page ${type} should not rely on when.items[].path="${conditionSourcePath}" for sibling form values; prefer then.runjs/linkageRunjs reading ctx.formValues instead.`,
          );
        }
      });
    }

    if (type && target) {
      const slotKey = `${type}::${target}`;
      if (state.reactionSlotKeys.has(slotKey)) {
        pushValidationError(
          state.errors,
          state.seenErrors,
          path,
          'duplicate-reaction-slot',
          `reaction.items must not repeat the same slot; duplicated (${type}, ${target}).`,
        );
      } else {
        state.reactionSlotKeys.add(slotKey);
      }

      const registry = BLOCK_REACTION_TYPES.has(type) ? state.reactionTargetRegistry.blockTargets : state.reactionTargetRegistry.actionTargets;
      const targetMeta = registry.get(target);
      if (!targetMeta) {
        pushValidationError(
          state.errors,
          state.seenErrors,
          `${path}.target`,
          'unknown-reaction-target',
          `reaction target "${target}" does not resolve to a keyed same-run ${BLOCK_REACTION_TYPES.has(type) ? 'tab/block' : 'action'} node in this blueprint.`,
        );
      } else if (targetMeta.requiresExplicitKey) {
        pushValidationError(
          state.errors,
          state.seenErrors,
          `${path}.target`,
          'reaction-target-requires-explicit-key',
          `reaction target "${target}" relies on generated fallback keys from ${targetMeta.path}; add explicit key values for the referenced tab/block/action and target that stable key instead.`,
        );
      }
    }
  }
}

function validateBlueprint(blueprint, options = {}) {
  const state = {
    errors: [],
    seenErrors: new Set(),
    blockKeyPaths: new Map(),
    reactionSlotKeys: new Set(),
    reactionTargetRegistry: buildReactionTargetRegistry(blueprint),
  };

  for (const key of BLUEPRINT_ILLEGAL_ROOT_KEYS) {
    if (!hasOwn(blueprint, key)) continue;
    pushValidationError(
      state.errors,
      state.seenErrors,
      key,
      'illegal-blueprint-control-field',
      `Inner page blueprint must not include control field "${key}". Keep helper envelopes outside the blueprint root.`,
    );
  }

  const mode = normalizeLowerText(blueprint.mode);
  if (!['create', 'replace'].includes(mode)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      'mode',
      'invalid-mode',
      'Page blueprint mode must be either "create" or "replace".',
    );
  }

  if (mode === 'replace' && !normalizeText(blueprint?.target?.pageSchemaUid)) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      'target.pageSchemaUid',
      'missing-replace-target',
      'Replace mode requires target.pageSchemaUid.',
    );
  }

  validateCreateMenuIcons(blueprint, state);

  const expectedOuterTabs = getExpectedOuterTabs(options);
  if (!Array.isArray(blueprint.tabs) || blueprint.tabs.length !== expectedOuterTabs) {
    pushValidationError(
      state.errors,
      state.seenErrors,
      'tabs',
      'unexpected-outer-tab-count',
      `Whole-page authoring expected exactly ${expectedOuterTabs} outer tab(s); found ${Array.isArray(blueprint.tabs) ? blueprint.tabs.length : 0}.`,
    );
  }

  for (const [index, tab] of ensureArray(blueprint.tabs).entries()) {
    validateTab(tab, index, state);
  }

  validateReaction(blueprint, state);

  return state.errors;
}

function buildPrepareFacts(blueprint, expectedOuterTabs) {
  return {
    mode: normalizeLowerText(blueprint?.mode),
    pageTitle: getFactsPageTitle(blueprint),
    menuPath: getMenuPath(blueprint),
    outerTabCount: Array.isArray(blueprint?.tabs) ? blueprint.tabs.length : 0,
    expectedOuterTabs,
    targetPageSchemaUid: normalizeText(blueprint?.target?.pageSchemaUid),
  };
}

export function renderPageBlueprintAsciiPreview(input, options = {}) {
  const warnings = [];
  const blueprint = normalizeBlueprintInput(input, warnings);

  if (!isRecognizablePageBlueprint(blueprint)) {
    return {
      ok: false,
      ascii: '',
      warnings,
      error: 'Input must be one recognizable inner page blueprint object with mode and tabs.',
    };
  }

  return {
    ok: true,
    ascii: renderRecognizableBlueprintAscii(blueprint, warnings, options),
    warnings: unique(warnings),
  };
}

export function prepareApplyBlueprintRequest(input, options = {}) {
  const warnings = [];
  const normalizeErrors = [];
  const expectedOuterTabs = getExpectedOuterTabs(options);
  const templateDecisionInput = extractPrepareTemplateDecision(input, options);
  const blueprint = normalizeBlueprintInput(input, warnings, normalizeErrors, {
    suppressLegacyWrapperWarning: isPrepareHelperEnvelope(input),
  });
  const recognizableBlueprint = isRecognizablePageBlueprint(blueprint);
  const facts = buildPrepareFacts(blueprint, expectedOuterTabs);
  const ascii = recognizableBlueprint ? renderRecognizableBlueprintAscii(blueprint, warnings, options) : '';
  const { errors: templateDecisionErrors, summary: templateDecision } = validateTemplateDecision(templateDecisionInput);
  const templateDecisionConsistencyErrors = validateTemplateDecisionConsistency(templateDecision, blueprint);
  const resolvedTemplateDecision = recognizableBlueprint && templateDecision && !templateDecisionConsistencyErrors.length
    ? cloneSerializable(templateDecision)
    : undefined;

  let errors = [...normalizeErrors, ...templateDecisionErrors, ...templateDecisionConsistencyErrors];
  if (!recognizableBlueprint) {
    if (!errors.length) {
      errors = [
        createValidationError(
          '',
          'invalid-blueprint',
          'Input must be one recognizable inner page blueprint object with mode and tabs.',
        ),
      ];
    }
    return {
      ok: false,
      ascii,
      warnings: unique(warnings),
      errors,
      facts,
      ...(resolvedTemplateDecision ? { templateDecision: resolvedTemplateDecision } : {}),
    };
  }

  errors = [...errors, ...validateBlueprint(blueprint, { expectedOuterTabs })];
  const result = {
    ok: errors.length === 0,
    ascii,
    warnings: unique(warnings),
    errors,
    facts,
    ...(resolvedTemplateDecision ? { templateDecision: resolvedTemplateDecision } : {}),
  };

  if (result.ok) {
    result.cliBody = cloneSerializable(blueprint);
  }

  return result;
}
