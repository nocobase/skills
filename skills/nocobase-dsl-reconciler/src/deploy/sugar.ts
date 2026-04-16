/**
 * Expand YAML sugar syntax to full spec format.
 * Called once during spec loading, before deploy pipeline.
 *
 * Sugar is backwards-compatible: full format passes through unchanged.
 * Idempotent: expanding already-expanded spec produces the same result.
 *
 * Sugar rules:
 *   1. Block sugar: `js:` and `ref:` shorthand for jsBlock/reference blocks
 *   2. Field sugar: `popup:` shorthand for clickToOpen + popupSettings
 *   3. Action sugar: `link:`, `ai:`, `updateRecord:` shorthand
 *   4. Filter sugar: `filter:` shorthand for dataScope
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';

// ── Defaults ──

export interface ProjectDefaults {
  popups?: Record<string, string>;  // collectionName → template file path
  forms?: Record<string, string>;   // collectionName → template file path
}

/** Load defaults.yaml from project root (cached per root). */
const defaultsCache = new Map<string, ProjectDefaults>();
function loadDefaults(projectRoot: string): ProjectDefaults {
  if (defaultsCache.has(projectRoot)) return defaultsCache.get(projectRoot)!;
  // Walk up to find defaults.yaml
  let dir = projectRoot;
  for (let i = 0; i < 10; i++) {
    const f = path.join(dir, 'defaults.yaml');
    if (fs.existsSync(f)) {
      const d = loadYaml<ProjectDefaults>(f);
      defaultsCache.set(projectRoot, d || {});
      return d || {};
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  defaultsCache.set(projectRoot, {});
  return {};
}

// ── Public API ──

/** Expand all sugar in a page spec. */
export function expandPageSugar(
  spec: Record<string, unknown>,
  projectRoot: string,
): Record<string, unknown> {
  const result = { ...spec };
  const defaults = loadDefaults(projectRoot);

  // Expand blocks
  if (Array.isArray(result.blocks)) {
    result.blocks = expandBlockList(result.blocks, projectRoot, result.coll as string | undefined, defaults);
  }

  // Expand tabs
  if (Array.isArray(result.tabs)) {
    result.tabs = (result.tabs as Record<string, unknown>[]).map(tab => {
      const t = { ...tab };
      if (Array.isArray(t.blocks)) {
        t.blocks = expandBlockList(t.blocks, projectRoot, (t.coll || result.coll) as string | undefined, defaults);
      }
      // Expand popups inside tabs
      if (Array.isArray(t.popups)) {
        t.popups = (t.popups as Record<string, unknown>[]).map(p =>
          expandPopupSugar(p, projectRoot),
        );
      }
      return t;
    });
  }

  return result;
}

/** Expand all sugar in a popup spec. */
export function expandPopupSugar(
  spec: Record<string, unknown>,
  projectRoot: string,
): Record<string, unknown> {
  let result = { ...spec };

  const defaults = loadDefaults(projectRoot);

  // popup: templates/popup/xxx.yaml → read template, inline its content
  if (typeof result.popup === 'string') {
    const absPath = path.resolve(projectRoot, result.popup as string);
    if (fs.existsSync(absPath)) {
      try {
        const tpl = loadYaml<Record<string, unknown>>(absPath);
        const content = tpl.content as Record<string, unknown>;
        if (content) {
          // Merge template content into this popup spec (blocks, tabs, mode, etc.)
          // User-specified properties (mode, size) take precedence over template content
          const { popup: _, target, ...rest } = result;
          result = {
            target,
            ...content,               // template provides defaults
            ...rest,                   // user overrides take precedence
            mode: rest.mode || (content as Record<string, unknown>).mode || 'drawer',
            _popupTemplateName: tpl.name,
            _popupTemplateColl: tpl.collectionName,
          };
        }
      } catch { /* fall through */ }
    }
    delete result.popup;
  }

  // Expand blocks — popup context: ref: expands to inline content (not ReferenceBlockModel)
  if (Array.isArray(result.blocks)) {
    result.blocks = expandBlockList(result.blocks, projectRoot, result.coll as string | undefined, defaults, true);
  }

  // Expand tabs
  if (Array.isArray(result.tabs)) {
    result.tabs = (result.tabs as Record<string, unknown>[]).map(tab => {
      const t = { ...tab };
      if (Array.isArray(t.blocks)) {
        t.blocks = expandBlockList(t.blocks, projectRoot, (t.coll || result.coll) as string | undefined, defaults, true);
      }
      return t;
    });
  }

  return result;
}

// ── Block list expansion ──

function expandBlockList(
  blocks: unknown[],
  projectRoot: string,
  parentColl?: string,
  defaults?: ProjectDefaults,
  isPopupContext = false,
): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const b of blocks) {
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      const block = b as Record<string, unknown>;
      const expanded = expandSingleBlock(block, projectRoot, parentColl, isPopupContext);
      // Apply defaults to expanded blocks
      if (defaults) {
        for (const eb of expanded) {
          applyFieldDefaults(eb, projectRoot, defaults);
        }
      }
      result.push(...expanded);
    } else {
      result.push(b as Record<string, unknown>);
    }
  }
  return result;
}

/**
 * Apply default popup templates to fields that match defaults.popups.
 * For table fields that are plain strings (no popup config), if the field's
 * target collection has a default popup template, auto-add `popup:` setting.
 *
 * This requires knowing which fields are relation fields. We infer from:
 * - Field names that match collection names (e.g. 'customer' → nb_crm_customers)
 * - Or fields listed in defaults.popups keys
 */
function applyFieldDefaults(
  block: Record<string, unknown>,
  projectRoot: string,
  defaults: ProjectDefaults,
): void {
  if (!defaults.popups || !Object.keys(defaults.popups).length) return;
  if (!['table', 'details', 'list', 'gridCard'].includes(block.type as string)) return;

  const fields = block.fields as unknown[];
  if (!Array.isArray(fields)) return;

  // Build a lookup: field name patterns → popup template path
  // defaults.popups is collectionName → templatePath
  // A field named 'customer' likely points to collection containing 'customer'
  const popupMap = defaults.popups;

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    // Skip fields that already have popup config
    if (typeof f === 'object' && f !== null) {
      const fo = f as Record<string, unknown>;
      if (fo.popup || fo.clickToOpen || fo.popupSettings) continue;
      // Check if field name matches a default
      const fieldName = (fo.field || fo.fieldPath || '') as string;
      if (!fieldName) continue;
      const templatePath = findDefaultPopup(fieldName, popupMap, projectRoot);
      if (templatePath) {
        fo.popup = templatePath;
      }
    } else if (typeof f === 'string') {
      // Bare field name — check if it matches a default
      const templatePath = findDefaultPopup(f, popupMap, projectRoot);
      if (templatePath) {
        fields[i] = { field: f, popup: templatePath };
      }
    }
  }
}

/**
 * Find default popup template for a field name.
 * Matches field name against collection names in defaults.popups.
 * E.g. field 'customer' matches 'nb_crm_customers' or 'customers'.
 */
function findDefaultPopup(
  fieldName: string,
  popupMap: Record<string, string>,
  projectRoot: string,
): string | null {
  const fn = fieldName.toLowerCase();
  for (const [coll, templatePath] of Object.entries(popupMap)) {
    const collLower = coll.toLowerCase();
    // Direct match: field name = collection name
    if (fn === collLower) return templatePath;
    // Singular match: 'customer' matches 'nb_crm_customers'
    if (collLower.endsWith(fn) || collLower.endsWith(`${fn}s`)) return templatePath;
    // Suffix match: 'lead' matches 'nb_crm_leads'
    const collParts = collLower.split('_');
    const lastPart = collParts[collParts.length - 1];
    if (lastPart === fn || lastPart === `${fn}s`) return templatePath;
    // Singular of last part: 'nb_crm_leads' → 'lead' matches 'lead'
    if (lastPart.endsWith('s') && lastPart.slice(0, -1) === fn) return templatePath;
  }
  return null;
}

/**
 * Expand a single block entry. May return 1 block (normal) or 1 block
 * from sugar expansion.
 */
function expandSingleBlock(
  block: Record<string, unknown>,
  projectRoot: string,
  parentColl?: string,
  isPopupContext = false,
): Record<string, unknown>[] {
  // ── Sugar 1: js: shorthand ──
  if ('js' in block && !('type' in block)) {
    return [expandJsSugar(block)];
  }

  // ── Sugar 1: ref: shorthand ──
  if ('ref' in block && !('type' in block)) {
    return [expandRefSugar(block, projectRoot, isPopupContext)];
  }

  // Otherwise, process the block normally — expand its internals
  const result = { ...block };

  // Determine block collection for field popup expansion
  const blockColl = (result.coll || parentColl || '') as string;

  // Expand field sugar (popup:)
  if (Array.isArray(result.fields)) {
    result.fields = expandFieldList(result.fields, projectRoot, blockColl);
  }

  // ── Default actions by block type (only if not declared in DSL) ──
  const btype = result.type as string;
  if (!result.actions && !['chart', 'jsBlock', 'markdown', 'iframe'].includes(btype)) {
    const defaults: Record<string, string[]> = {
      table: ['filter', 'refresh', 'addNew'],
      filterForm: ['submit', 'reset'],
      createForm: ['submit'],
      editForm: ['submit'],
    };
    if (defaults[btype]) result.actions = defaults[btype];
  }
  if (!result.recordActions && !['chart', 'jsBlock', 'markdown', 'iframe'].includes(btype)) {
    const defaults: Record<string, string[]> = {
      table: ['edit', 'delete'],
      details: ['edit'],
    };
    if (defaults[btype]) result.recordActions = defaults[btype];
  }

  // Expand action sugar (link:, ai:, updateRecord:)
  if (Array.isArray(result.actions)) {
    result.actions = expandActionList(result.actions);
  }
  if (Array.isArray(result.recordActions)) {
    result.recordActions = expandActionList(result.recordActions);
  }

  // ── filterForm: strip invalid action types ──
  if (result.type === 'filterForm' && result.actions) {
    const validFilterActions = new Set(['submit', 'reset', 'collapse']);
    result.actions = (result.actions as unknown[]).filter(a => {
      const t = typeof a === 'string' ? a : (a as Record<string, unknown>).type as string;
      return validFilterActions.has(t) || t === 'ai';
    });
    if (!(result.actions as unknown[]).length) delete result.actions;
  }

  // ── chart / jsBlock / markdown: no actions ──
  if (['chart', 'jsBlock', 'markdown', 'iframe'].includes(btype)) {
    delete result.actions;
    delete result.recordActions;
  }

  // Expand filter sugar
  if (result.filter && !result.dataScope) {
    result.dataScope = expandFilterSugar(result.filter as Record<string, unknown>);
    delete result.filter;
  }

  // Recurse into popups
  if (Array.isArray(result.popups)) {
    result.popups = (result.popups as Record<string, unknown>[]).map(p =>
      expandPopupSugar(p, projectRoot),
    );
  }

  // Recurse into tabs
  if (Array.isArray(result.tabs)) {
    result.tabs = (result.tabs as Record<string, unknown>[]).map(tab => {
      const t = { ...tab };
      if (Array.isArray(t.blocks)) {
        t.blocks = expandBlockList(t.blocks, projectRoot, (t.coll || blockColl) as string | undefined);
      }
      return t;
    });
  }

  return [result];
}

// ── Sugar 1: js: shorthand ──

function expandJsSugar(block: Record<string, unknown>): Record<string, unknown> {
  const jsVal = block.js;
  // Preserve all extra properties from the original block (title, coll, desc, etc.)
  const { js: _, ...extra } = block;

  if (typeof jsVal === 'string') {
    // js: ./js/overview_header.js
    const filename = path.basename(jsVal, path.extname(jsVal));
    return {
      key: slugify(filename),
      type: 'jsBlock',
      file: jsVal,
      ...extra,  // merge original properties (key, title, etc.)
    };
  }

  if (jsVal && typeof jsVal === 'object' && !Array.isArray(jsVal)) {
    // js: { file: ./js/xxx.js, desc: Calendar Block }
    const jsObj = jsVal as Record<string, unknown>;
    const file = jsObj.file as string || '';
    const desc = jsObj.desc as string || '';
    const filename = path.basename(file, path.extname(file));
    const key = desc ? slugify(desc) : slugify(filename);
    return {
      key,
      type: 'jsBlock',
      desc: desc || undefined,
      file,
      ...extra,  // merge original properties
    };
  }

  // Fallback: pass through
  return block;
}

// ── Sugar 1: ref: shorthand ──

function expandRefSugar(
  block: Record<string, unknown>,
  projectRoot: string,
  isPopupContext = false,
): Record<string, unknown> {
  const refPath = block.ref as string;
  if (!refPath) return block;
  // Preserve all extra properties from the original block (key, title, coll, etc.)
  const { ref: _, ...extra } = block;

  const absPath = path.resolve(projectRoot, refPath);
  if (!fs.existsSync(absPath)) {
    return {
      key: 'reference',
      type: 'reference',
      _refError: `Template file not found: ${absPath}`,
      ...extra,
    };
  }

  try {
    const template = loadYaml<Record<string, unknown>>(absPath);

    // Popup context: expand ref to inline content (real block with resource_binding)
    // so compose creates a proper block with binding:'currentRecord', not ReferenceBlockModel.
    // The block will later be detached as a template by convertPopupToTemplate.
    if (isPopupContext && template.content && typeof template.content === 'object') {
      const expanded = { ...(template.content as Record<string, unknown>), ...extra };
      const btype = expanded.type as string;
      if (['details', 'editForm', 'list', 'gridCard'].includes(btype)) {
        expanded.resource_binding = {
          filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
        };
      }
      return expanded;
    }

    // Page context: use ReferenceBlockModel (normal template reference)
    const tplName = (template.templateName || template.name || '') as string;
    const tplUid = (template.templateUid || template.uid || '') as string;
    return {
      key: (template.key as string) || 'reference',
      type: 'reference',
      templateRef: {
        templateUid: tplUid,
        templateName: tplName,
        targetUid: (template.targetUid || '') as string,
        mode: (template.mode || 'reference') as string,
      },
      ...((!tplUid && tplName) ? { _refName: tplName, _refColl: template.collectionName || '' } : {}),
      ...extra,  // user overrides (key, etc.) take precedence
    };
  } catch {
    return {
      key: 'reference',
      type: 'reference',
      _refError: `Failed to parse template file: ${absPath}`,
      ...extra,
    };
  }
}

// ── Sugar 2: Field popup: shorthand ──

function expandFieldList(
  fields: unknown[],
  projectRoot: string,
  blockColl: string,
): unknown[] {
  return fields.map(f => {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
    const field = f as Record<string, unknown>;
    if (!('popup' in field)) return field;

    return expandPopupFieldSugar(field, projectRoot, blockColl);
  });
}

function expandPopupFieldSugar(
  field: Record<string, unknown>,
  projectRoot: string,
  blockColl: string,
): Record<string, unknown> {
  const popupVal = field.popup;
  const result = { ...field };
  delete result.popup;

  result.clickToOpen = true;

  if (popupVal === true) {
    // popup: true → default popup settings
    result.popupSettings = {
      collectionName: blockColl || undefined,
      mode: 'drawer',
      size: 'large',
      filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
    };
    return result;
  }

  if (typeof popupVal === 'string') {
    // popup: templates/popup/leads_view.yaml → popup template ref or inline content
    const absPath = path.resolve(projectRoot, popupVal);
    if (fs.existsSync(absPath)) {
      try {
        const template = loadYaml<Record<string, unknown>>(absPath);
        const tplUid = (template.templateUid || template.uid || '') as string;

        // If UID looks like a real NocoBase UID (short alphanumeric), use as template ref
        // If it's a fake/placeholder UID (long, has underscores, etc.), inline the content
        const isRealUid = tplUid && /^[a-z0-9]{8,15}$/.test(tplUid);

        if (isRealUid) {
          result.popupSettings = {
            popupTemplateUid: tplUid,
            collectionName: (template.collectionName || template.coll || blockColl) as string || undefined,
            mode: 'drawer',
            size: 'large',
          };
          return result;
        }

        // Inline the popup template content — will be deployed as inline popup,
        // then converted to a real template post-deploy
        const content = template.content as Record<string, unknown>;
        if (content) {
          result.popup = {
            ...content,
            _templateName: template.name, // Track for post-deploy conversion
            _templateColl: template.collectionName || blockColl,
          };
          return result;
        }
      } catch {
        // Fall through to default
      }
    }
    // Path didn't resolve — treat as template UID directly
    result.popupSettings = {
      popupTemplateUid: popupVal,
      collectionName: blockColl || undefined,
      mode: 'drawer',
      size: 'large',
    };
    return result;
  }

  if (popupVal && typeof popupVal === 'object' && !Array.isArray(popupVal)) {
    // popup: { mode: dialog, size: medium }
    const popupObj = popupVal as Record<string, unknown>;
    result.popupSettings = {
      collectionName: (popupObj.collectionName || blockColl) as string || undefined,
      mode: popupObj.mode || 'drawer',
      size: popupObj.size || 'large',
      filterByTk: (popupObj.filterByTk || '{{ctx.view.inputArgs.filterByTk}}') as string,
    };
    return result;
  }

  // Fallback
  return result;
}

// ── Sugar 3: Action sugar ──

function expandActionList(actions: unknown[]): unknown[] {
  return actions.map(a => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return a;
    const action = a as Record<string, unknown>;

    // Already has type → pass through (full format)
    if ('type' in action) return action;

    // link: shorthand
    if ('link' in action) return expandLinkSugar(action);

    // ai: shorthand
    if ('ai' in action) return expandAiSugar(action);

    // updateRecord: shorthand
    if ('updateRecord' in action) return expandUpdateRecordSugar(action);

    return action;
  });
}

function expandLinkSugar(action: Record<string, unknown>): Record<string, unknown> {
  const linkVal = action.link as Record<string, unknown>;
  if (!linkVal || typeof linkVal !== 'object') return action;

  const title = (linkVal.title || '') as string;
  const icon = (linkVal.icon || '') as string;
  const url = (linkVal.url || '') as string;

  const keySuffix = title ? slugify(title) : 'link';

  return {
    type: 'link',
    key: `link_${keySuffix}`,
    stepParams: {
      buttonSettings: {
        general: {
          title,
          ...(icon ? { icon } : {}),
        },
      },
      linkButtonSettings: {
        editLink: {
          url,
        },
      },
    },
  };
}

function expandAiSugar(action: Record<string, unknown>): Record<string, unknown> {
  const aiVal = action.ai;

  if (typeof aiVal === 'string') {
    // ai: viz
    return {
      type: 'ai',
      employee: aiVal,
      key: `ai_${slugify(aiVal)}`,
    };
  }

  if (aiVal && typeof aiVal === 'object' && !Array.isArray(aiVal)) {
    // ai: { employee: viz, tasks: ./ai/tasks.yaml }
    const aiObj = aiVal as Record<string, unknown>;
    const employee = (aiObj.employee || '') as string;
    const tasks = aiObj.tasks as string | undefined;
    return {
      type: 'ai',
      employee,
      ...(tasks ? { tasks_file: tasks } : {}),
      key: `ai_${slugify(employee)}`,
    };
  }

  return action;
}

function expandUpdateRecordSugar(action: Record<string, unknown>): Record<string, unknown> {
  const spec = action.updateRecord as Record<string, unknown>;
  if (!spec || typeof spec !== 'object') return action;

  const key = (spec.key || 'updateRecord') as string;
  const icon = spec.icon as string | undefined;
  const tooltip = spec.tooltip as string | undefined;
  const title = spec.title as string | undefined;
  const style = spec.style as string | undefined; // 'link' → type: 'link'
  const assign = spec.assign as Record<string, unknown> | undefined;
  const hiddenWhen = spec.hiddenWhen as Record<string, unknown> | undefined;
  const disabledWhen = spec.disabledWhen as Record<string, unknown> | undefined;

  // Build buttonSettings.general
  const general: Record<string, unknown> = {};
  if (style) general.type = style;
  if (icon) general.icon = icon;
  if (title !== undefined) general.title = title;
  else general.title = '';
  if (tooltip) general.tooltip = tooltip;

  // Build linkageRules from hiddenWhen / disabledWhen
  const linkageRules = buildLinkageRules(hiddenWhen, disabledWhen);

  // Build stepParams
  const stepParams: Record<string, unknown> = {
    buttonSettings: {
      general,
      ...(linkageRules ? { linkageRules } : {}),
    },
  };

  // Build assignSettings
  if (assign && Object.keys(assign).length) {
    stepParams.assignSettings = {
      assignFieldValues: {
        assignedValues: assign,
      },
    };
  }

  return {
    type: 'updateRecord',
    key: `updateRecord_${slugify(key)}`,
    stepParams,
  };
}

function buildLinkageRules(
  hiddenWhen?: Record<string, unknown>,
  disabledWhen?: Record<string, unknown>,
): Record<string, unknown> | null {
  const rules: Record<string, unknown>[] = [];

  if (hiddenWhen && Object.keys(hiddenWhen).length) {
    rules.push({
      title: 'Linkage rule',
      enable: true,
      condition: buildCondition(hiddenWhen),
      actions: [{ name: 'linkageSetActionProps', params: { value: 'hidden' } }],
    });
  }

  if (disabledWhen && Object.keys(disabledWhen).length) {
    rules.push({
      title: 'Linkage rule',
      enable: true,
      condition: buildCondition(disabledWhen),
      actions: [{ name: 'linkageSetActionProps', params: { value: 'disabled' } }],
    });
  }

  if (!rules.length) return null;
  return { value: rules };
}

function buildCondition(when: Record<string, unknown>): Record<string, unknown> {
  const items: Record<string, unknown>[] = [];

  for (const [field, value] of Object.entries(when)) {
    // Boolean truthy check
    if (value === true) {
      items.push({
        path: `{{ ctx.record.${field} }}`,
        operator: '$isTruly',
        value: true,
        noValue: true,
      });
    } else if (value === false) {
      items.push({
        path: `{{ ctx.record.${field} }}`,
        operator: '$isFalsy',
        value: false,
        noValue: true,
      });
    } else {
      // Direct value comparison
      items.push({
        path: `{{ ctx.record.${field} }}`,
        operator: '$eq',
        value,
      });
    }
  }

  return { logic: '$and', items };
}

// ── Sugar 4: Filter sugar ──

export function expandFilterSugar(filter: Record<string, unknown>): Record<string, unknown> {
  const items: Record<string, unknown>[] = [];

  for (const [rawKey, value] of Object.entries(filter)) {
    // Parse "field.$operator" or just "field" (defaults to $eq)
    const dotIdx = rawKey.indexOf('.$');
    let fieldPath: string;
    let operator: string;

    if (dotIdx !== -1) {
      fieldPath = rawKey.slice(0, dotIdx);
      operator = rawKey.slice(dotIdx + 1); // includes the $
    } else {
      fieldPath = rawKey;
      operator = '$eq';
    }

    items.push({
      path: fieldPath,
      operator,
      value,
    });
  }

  return {
    logic: '$and',
    items,
  };
}
