import { cloneSerializable, ensureArray, isPlainObject, trimToLength, unique } from './utils.js';

const DEFAULT_MAX_SUMMARY_ITEMS = 4;
const DEFAULT_MAX_POPUP_DEPTH = 1;
const DEFAULT_EXPECTED_OUTER_TABS = 1;
const MAX_LABEL_LENGTH = 24;
const MAX_HEADER_TEXT = 48;
const PLACEHOLDER_TEXT_PATTERN = /^(summary|later|placeholder|todo)$/i;
const PLACEHOLDER_TEXT_CN_PATTERN = /^(备用|待定|稍后)$/;
const PLACEHOLDER_BLOCK_TYPES = new Set(['markdown', 'note', 'banner']);
const TAB_ILLEGAL_KEYS = new Set(['pageSchemaUid', 'requestBody', 'target']);
const EDIT_ACTION_TYPES = new Set(['edit']);

function normalizeText(value, fallback = '') {
  const source = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const normalized = source.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
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

function getLayoutRowDescriptor(row, rowIndex, blocksByKey, warnings) {
  const cells = [];
  const renderedKeys = [];

  for (const cell of ensureArray(row)) {
    if (typeof cell === 'string') {
      const key = normalizeText(cell);
      if (!key) continue;
      if (!blocksByKey.has(key)) warnings.push(`Layout row ${rowIndex + 1} references missing block key "${key}".`);
      cells.push(`[${key}]`);
      renderedKeys.push({ key });
      continue;
    }

    if (isPlainObject(cell) && normalizeText(cell.key)) {
      const key = normalizeText(cell.key);
      const span =
        typeof cell.span === 'number' && Number.isFinite(cell.span) ? String(cell.span) : normalizeText(cell.span);
      if (!blocksByKey.has(key)) warnings.push(`Layout row ${rowIndex + 1} references missing block key "${key}".`);
      cells.push(span ? `[${key} span=${span}]` : `[${key}]`);
      renderedKeys.push({ key, span });
      continue;
    }

    warnings.push(`Layout row ${rowIndex + 1} contains an unsupported cell and was skipped.`);
  }

  return {
    label: cells.join(' '),
    items: renderedKeys,
  };
}

function collectLayoutOrder(layout, blocks, warnings) {
  const blocksByKey = new Map();
  for (const block of ensureArray(blocks)) {
    const key = normalizeText(block?.key);
    if (key) blocksByKey.set(key, block);
  }

  if (!isPlainObject(layout) || !Array.isArray(layout.rows) || !layout.rows.length || !blocksByKey.size) {
    return null;
  }

  return layout.rows.map((row, rowIndex) => getLayoutRowDescriptor(row, rowIndex, blocksByKey, warnings));
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
  const blocks = ensureArray(popup?.blocks).filter((block) => isPlainObject(block));
  const body = [];
  const layoutRows = collectLayoutOrder(popup?.layout, blocks, warnings);

  if (popup?.template?.uid) {
    const usage = normalizeText(popup?.template?.usage);
    body.push(usage ? `Template: ${popup.template.uid} (${usage})` : `Template: ${popup.template.uid}`);
  }

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
  } else if (!popup?.template?.uid) {
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

function normalizeBlueprintInput(input, warnings, errors = []) {
  if (!isPlainObject(input)) return null;

  if (!Array.isArray(input.tabs) && !normalizeText(input.mode) && !normalizeText(input.version) && hasOwn(input, 'requestBody')) {
    if (isPlainObject(input.requestBody)) {
      warnings.push('Received outer requestBody wrapper; preview unwrapped the inner page blueprint.');
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

function validatePopupDocument(popup, path, state) {
  if (!isPlainObject(popup)) {
    pushValidationError(state.errors, state.seenErrors, path, 'invalid-popup', 'Popup must be one object.');
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
}

function validateCustomEditPopup(popup, path, state) {
  if (!isPlainObject(popup)) return;
  if (popup.template && !Array.isArray(popup.blocks)) return;

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

function validateActions(items, path, state) {
  for (const [index, item] of ensureArray(items).entries()) {
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
  validateActions(block.actions, `${path}.actions`, state);
  validateActions(block.recordActions, `${path}.recordActions`, state);
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
}

function validateBlueprint(blueprint, options = {}) {
  const state = {
    errors: [],
    seenErrors: new Set(),
    blockKeyPaths: new Map(),
  };

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
  const blueprint = normalizeBlueprintInput(input, warnings, normalizeErrors);
  const facts = buildPrepareFacts(blueprint, expectedOuterTabs);
  const ascii = isRecognizablePageBlueprint(blueprint) ? renderRecognizableBlueprintAscii(blueprint, warnings, options) : '';

  let errors = normalizeErrors;
  if (!isRecognizablePageBlueprint(blueprint)) {
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
    };
  }

  errors = [...errors, ...validateBlueprint(blueprint, { expectedOuterTabs })];
  const result = {
    ok: errors.length === 0,
    ascii,
    warnings: unique(warnings),
    errors,
    facts,
  };

  if (result.ok) {
    result.toolCall = {
      requestBody: cloneSerializable(blueprint),
    };
  }

  return result;
}
