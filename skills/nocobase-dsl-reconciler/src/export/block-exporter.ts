/**
 * Export a single block node from live NocoBase tree.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { FlowModelNode } from '../types/api';
import { slugify } from '../utils/slugify';
import { dumpYaml, loadYaml } from '../utils/yaml';
import { extractJsDesc, stripAutoHeader } from '../utils/js-utils';
import { actionKey as genActionKey } from '../utils/action-key';
import { stripDefaults } from '../utils/strip-defaults';
import {
  MODEL_TO_BLOCK_TYPE as TYPE_MAP,
  MODEL_TO_ACTION_TYPE as ACTION_TYPE_MAP,
  SIMPLE_ACTION_TYPES,
} from '../utils/block-types';

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function safeWrite(filePath: string, content: string) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, content);
}

export { TYPE_MAP };

/**
 * Look up a template UID in templates/_index.yaml, walking up from a given directory.
 * Returns the file path (e.g. "templates/popup/leads_view.yaml") or null.
 */
export function lookupTemplateFile(templateUid: string, fromDir: string): string | null {
  for (let d = fromDir; d !== path.dirname(d); d = path.dirname(d)) {
    const indexFile = path.join(d, 'templates', '_index.yaml');
    if (!fs.existsSync(indexFile)) continue;
    const index = loadYaml<Record<string, unknown>[]>(indexFile) || [];
    const entry = index.find(t => t.uid === templateUid);
    if (entry?.file) return `templates/${entry.file}`;
    break;
  }
  return null;
}

/**
 * Simplify clickToOpen + popupSettings into canonical format.
 *
 * - With popup template → clickToOpen: templates/popup/xxx.yaml (explicit path)
 * - No template → clickToOpen: true (auto-detect)
 */
export function simplifyPopup(
  fieldSpec: Record<string, unknown>,
  projectDir: string | null,
): void {
  if (!fieldSpec.clickToOpen && !fieldSpec.popupSettings) return;

  const ps = fieldSpec.popupSettings as Record<string, unknown> | undefined;
  const templateUid = ps?.popupTemplateUid as string | undefined;
  delete fieldSpec.popupSettings;

  if (templateUid && projectDir) {
    const tplFile = lookupTemplateFile(templateUid, projectDir);
    if (tplFile) {
      fieldSpec.clickToOpen = tplFile;
      return;
    }
  }

  fieldSpec.clickToOpen = true;
}

/**
 * Simplify a link action from full stepParams into canonical format.
 * Output: { type: link, title, icon, url }
 */
function simplifyLinkAction(actionSpec: Record<string, unknown>): Record<string, unknown> {
  const sp = actionSpec.stepParams as Record<string, unknown> | undefined;
  const result: Record<string, unknown> = { type: 'link' };
  if (!sp) return result;

  const buttonSettings = sp.buttonSettings as Record<string, unknown> | undefined;
  const general = (buttonSettings?.general || {}) as Record<string, unknown>;
  const linkSettings = sp.linkButtonSettings as Record<string, unknown> | undefined;
  const editLink = (linkSettings?.editLink || {}) as Record<string, unknown>;

  if (general.title) result.title = general.title;
  if (general.icon) result.icon = general.icon;
  if (editLink.url) result.url = editLink.url;

  return result;
}

/**
 * Simplify an AI action into canonical format.
 * Output: { type: ai, employee: viz, tasks_file: ./ai/xxx.yaml }
 */
function simplifyAiAction(actionSpec: Record<string, unknown>): Record<string, unknown> {
  const employee = actionSpec.employee as string || '';
  const tasksFile = actionSpec.tasks_file as string | undefined;
  const result: Record<string, unknown> = { type: 'ai', employee };
  if (tasksFile) result.tasks_file = tasksFile;
  return result;
}

/**
 * Simplify a reference block into shorthand.
 * - ref: templates/block/xxx.yaml
 */
function simplifyReference(spec: Record<string, unknown>, projectDir: string | null): Record<string, unknown> | null {
  const tplRef = spec.templateRef as Record<string, unknown> | undefined;
  if (!tplRef?.templateUid) return null;

  const templateUid = tplRef.templateUid as string;
  if (projectDir) {
    const tplFile = lookupTemplateFile(templateUid, projectDir);
    if (tplFile) {
      return { ref: tplFile };
    }
  }
  // Fallback: keep templateRef as-is
  return null;
}

/**
 * Simplify a jsBlock into canonical format.
 * Output: { type: jsBlock, key, file, desc }
 */
function simplifyJsBlock(spec: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { type: 'jsBlock' };
  if (spec.key) result.key = spec.key;
  if (spec.file) result.file = spec.file;
  if (spec.desc) result.desc = spec.desc;
  return result;
}

/**
 * Simplify dataScope { logic: $and, items: [{path, operator, value}] }
 * into filter: { path.$op: value } shorthand.
 * Only simplifies flat $and conditions. Complex nested logic keeps original format.
 */
/**
 * Replace field UIDs with field paths in linkage rule arrays.
 * Walks the rule tree replacing any UID string found in the map.
 */
function resolveRuleFieldUids(
  rules: Record<string, unknown>[],
  uidMap: Map<string, string>,
): Record<string, unknown>[] {
  if (!uidMap.size) return rules;
  const resolve = (obj: unknown): unknown => {
    if (typeof obj === 'string') return uidMap.get(obj) || obj;
    if (Array.isArray(obj)) return obj.map(resolve);
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (k === 'fields' && Array.isArray(v)) {
          result[k] = v.map(uid => typeof uid === 'string' ? (uidMap.get(uid) || uid) : uid);
        } else {
          result[k] = resolve(v);
        }
      }
      return result;
    }
    return obj;
  };
  return rules.map(r => resolve(r) as Record<string, unknown>);
}

export function simplifyDataScope(dataScope: Record<string, unknown>): Record<string, unknown> | null {
  const logic = dataScope.logic as string;
  const items = dataScope.items as Record<string, unknown>[] | undefined;
  if (logic !== '$and' || !Array.isArray(items)) return null;

  const filter: Record<string, unknown> = {};
  for (const item of items) {
    const p = item.path as string;
    const op = item.operator as string;
    const val = item.value;
    if (!p || !op) return null; // can't simplify
    if (item.logic) return null; // nested condition — bail
    filter[`${p}.${op}`] = val;
  }
  return filter;
}

/**
 * Simplify an updateRecord action from full stepParams into shorthand.
 */
function simplifyUpdateRecord(actionSpec: Record<string, unknown>): Record<string, unknown> {
  const sp = actionSpec.stepParams as Record<string, unknown> | undefined;
  if (!sp) return actionSpec;

  const buttonSettings = sp.buttonSettings as Record<string, unknown> | undefined;
  const general = (buttonSettings?.general || {}) as Record<string, unknown>;
  // assignSettings.assignFieldValues.assignedValues is the correct path
  const assignSettings = sp.assignSettings as Record<string, unknown> | undefined;
  const assignFieldValues = (assignSettings?.assignFieldValues || {}) as Record<string, unknown>;
  const rawAssigned = assignFieldValues.assignedValues as Record<string, unknown> | undefined;
  const triggerWorkflows = (sp.apply as Record<string, unknown>)?.triggerWorkflows;
  const linkageRules = (buttonSettings?.linkageRules as Record<string, unknown> | undefined);

  const result: Record<string, unknown> = {};

  // Key
  if (actionSpec.key) result.key = actionSpec.key;

  // Button appearance
  if (general.icon) result.icon = general.icon;
  if (general.tooltip) result.tooltip = general.tooltip;
  if (general.title) result.title = general.title;
  const style = (general.type || general.buttonStyle) as string | undefined;
  if (style && style !== 'default') result.style = style;
  const danger = general.danger as boolean | undefined;
  if (danger) result.danger = true;

  // Assigned values — direct key:value map
  if (rawAssigned && Object.keys(rawAssigned).length) {
    result.assign = rawAssigned;
  }

  // Trigger workflows
  if (triggerWorkflows) result.triggerWorkflows = triggerWorkflows;

  // Linkage rules → hiddenWhen shorthand (simplified)
  if (linkageRules) {
    const rules = ((linkageRules as Record<string, unknown>).value || (linkageRules as Record<string, unknown>).rules) as Array<Record<string, unknown>> | undefined;
    if (rules?.length) {
      const hiddenWhen = extractHiddenWhen(rules);
      if (hiddenWhen) result.hiddenWhen = hiddenWhen;
      else result.linkageRules = stripDefaults(linkageRules);
    }
  }

  // Secondary confirmation
  const confirm = (general.secondConfirmation || general.confirm) as Record<string, unknown> | undefined;
  if (confirm) result.confirm = confirm;

  return { type: 'updateRecord', ...result };
}

/**
 * Try to extract simple hiddenWhen from linkageRules.
 * Returns simplified shorthand or null if too complex.
 */
function extractHiddenWhen(rules: Array<Record<string, unknown>>): Record<string, unknown> | null {
  // Only handle single rule with 'visible' property = false
  if (rules.length !== 1) return null;
  const rule = rules[0];
  const properties = rule.properties as Array<Record<string, unknown>> | undefined;
  if (!properties?.length) return null;

  // Check for single property with visible=false (= hidden when condition is true)
  const visibleProp = properties.find(p => p.type === 'visible' && p.value === false);
  if (!visibleProp) return null;

  const condition = rule.condition as Record<string, unknown> | undefined;
  if (!condition) return null;

  // Try to extract simple field conditions
  const allOp = condition.$and as Array<Record<string, unknown>> | undefined;
  const conditions = allOp || [condition];
  const result: Record<string, unknown> = {};

  for (const cond of conditions) {
    // Each condition: { field: { operator: value } }
    const entries = Object.entries(cond);
    if (entries.length !== 1) return null;
    const [field, ops] = entries[0];
    if (field.startsWith('$')) return null;  // complex condition
    if (typeof ops !== 'object' || ops === null) return null;
    const opEntries = Object.entries(ops as Record<string, unknown>);
    if (opEntries.length !== 1) return null;
    const [op, val] = opEntries[0];
    if (op === '$isTruly') {
      result[field] = true;
    } else if (op === '$isFalsy') {
      result[field] = false;
    } else {
      result[field] = { [op]: val };
    }
  }

  return Object.keys(result).length ? result : null;
}

export interface PopupRef {
  field: string;
  field_uid: string;
  block_key?: string;
  target?: string;
}

export interface ExportedBlock {
  spec: Record<string, unknown>;
  key: string;
  state: Record<string, unknown>;
  popupRefs: PopupRef[];
}

/**
 * Export a single block from a FlowModel tree node.
 *
 * @param projectDir - Project root directory for template lookups (optional).
 *                     When provided, enables popup/reference shorthand with template file paths.
 */
export function exportBlock(
  item: FlowModelNode,
  jsDir: string | null,
  prefix: string,
  index: number,
  usedKeys: Set<string>,
  projectDir: string | null = null,
): ExportedBlock | null {
  const use = item.use || '';
  const uid = item.uid;
  const sp = (item.stepParams || {}) as Record<string, unknown>;

  const btype = TYPE_MAP[use];
  if (!btype) return null;

  // Block title
  const cardSettings = sp.cardSettings as Record<string, unknown>;
  const titleDesc = cardSettings?.titleDescription as Record<string, unknown>;
  const title = (titleDesc?.title as string) || '';

  // Generate key
  let key: string;
  if (title) {
    key = slugify(title);
  } else if (btype === 'jsBlock') {
    const jsSettings = sp.jsSettings as Record<string, unknown>;
    const code = ((jsSettings?.runJs as Record<string, unknown>)?.code as string) || '';
    const desc = extractJsDesc(code);
    key = desc ? slugify(desc) : btype;
  } else {
    key = btype;
  }

  // Deduplicate
  if (usedKeys.has(key)) {
    let counter = 2;
    while (usedKeys.has(`${key}_${counter}`)) counter++;
    key = `${key}_${counter}`;
  }
  usedKeys.add(key);

  const spec: Record<string, unknown> = { key, type: btype };
  if (title) spec.title = title;

  // Collection + resource
  const resSettings = sp.resourceSettings as Record<string, unknown>;
  const resInit = (resSettings?.init || {}) as Record<string, unknown>;
  const coll = resInit.collectionName as string || '';
  if (coll && btype !== 'reference') {
    spec.coll = coll;
  } else if (btype === 'filterForm') {
    // Infer coll from field's collectionName (filterForm may not have own resource)
    const gridNode = item.subModels?.grid;
    if (gridNode && !Array.isArray(gridNode)) {
      const gridItems = ((gridNode as FlowModelNode).subModels?.items || []) as FlowModelNode[];
      for (const gi of gridItems) {
        const fieldColl = ((gi.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
          ?.init as Record<string, unknown>;
        if (fieldColl?.collectionName) {
          spec.coll = fieldColl.collectionName as string;
          break;
        }
      }
    }
  }

  // Resource binding
  const binding: Record<string, unknown> = {};
  if (resInit.filterByTk) binding.filterByTk = resInit.filterByTk;
  if (resInit.associationName) binding.associationName = resInit.associationName;
  if (resInit.sourceId) binding.sourceId = resInit.sourceId;
  if (Object.keys(binding).length) spec.resource_binding = binding;

  // Table settings
  const tableSettings = sp.tableSettings as Record<string, unknown>;
  if (tableSettings) {
    const ds = tableSettings.dataScope as Record<string, unknown>;
    if (ds?.filter) {
      const simplified = simplifyDataScope(ds.filter as Record<string, unknown>);
      if (simplified) {
        spec.filter = simplified;
      } else {
        spec.dataScope = ds.filter;
      }
    } else if (ds && !ds.filter && ds.logic) {
      // dataScope is directly {logic, items} without .filter wrapper
      const simplified = simplifyDataScope(ds);
      if (simplified) {
        spec.filter = simplified;
      } else {
        spec.dataScope = ds;
      }
    }
    const ps = tableSettings.pageSize as Record<string, unknown>;
    const pageSize = typeof ps === 'object' ? ps?.pageSize : ps;
    if (pageSize && pageSize !== 20) spec.pageSize = pageSize;
    if (tableSettings.sort) spec.sort = tableSettings.sort;
  }

  const popupRefs: PopupRef[] = [];

  // ── JS Block ──
  if (btype === 'jsBlock') {
    const jsSettings = sp.jsSettings as Record<string, unknown>;
    const code = ((jsSettings?.runJs as Record<string, unknown>)?.code as string) || '';
    if (code) {
      const desc = extractJsDesc(code);
      if (desc) spec.desc = desc;
      if (jsDir) {
        const fname = prefix ? `${prefix}_${key}.js` : `${key}.js`;
        safeWrite(path.join(jsDir, fname), stripAutoHeader(code));
        spec.file = `./js/${fname}`;
      }
    }
  }

  // ── Chart ──
  if (btype === 'chart') {
    const chartSettings = sp.chartSettings as Record<string, unknown>;
    const configure = (chartSettings?.configure || {}) as Record<string, unknown>;
    if (Object.keys(configure).length && jsDir) {
      const chartDir = path.join(path.dirname(jsDir), 'charts');
      fs.mkdirSync(chartDir, { recursive: true });
      const base = prefix ? `${prefix}_${key}` : key;

      const query = configure.query as Record<string, unknown>;
      const chartOpt = configure.chart as Record<string, unknown>;
      const sql = (query?.sql as string) || '';
      const raw = ((chartOpt?.option as Record<string, unknown>)?.raw as string) || '';

      const chartSpec: Record<string, string> = {};
      if (sql) {
        const sqlFname = `${base}.sql`;
        safeWrite(path.join(chartDir, sqlFname), sql);
        chartSpec.sql_file = `./charts/${sqlFname}`;
      }
      if (raw) {
        const renderFname = `${base}_render.js`;
        safeWrite(path.join(chartDir, renderFname), raw);
        chartSpec.render_file = `./charts/${renderFname}`;
      }
      const yamlFname = `${base}.yaml`;
      safeWrite(path.join(chartDir, yamlFname), dumpYaml(chartSpec));
      spec.chart_config = `./charts/${yamlFname}`;
    }
  }

  // ── Reference block — extract template info from stepParams if present ──
  // (templateRef is also set by project-exporter via flowModelTemplateUsages lookup)
  if (btype === 'reference') {
    const refSettings = sp.referenceSettings as Record<string, unknown>;
    const useTemplate = refSettings?.useTemplate as Record<string, unknown>;
    if (useTemplate) {
      spec.templateRef = {
        templateUid: useTemplate.templateUid,
        templateName: useTemplate.templateName,
        targetUid: useTemplate.targetUid,
        mode: useTemplate.mode || 'reference',
      };
    }
    // Simplify: ref: templates/block/xxx.yaml
    const simplified = simplifyReference(spec, projectDir);
    if (simplified) {
      // Replace spec contents with simplified version
      for (const k of Object.keys(spec)) delete spec[k];
      Object.assign(spec, simplified);
      // Re-add key for state tracking
      spec.key = key;
    }
  }

  // ── Table fields + columns ──
  if (btype === 'table') {
    const { fields, jsCols, columnOrder, fieldPopups, hasActionsColumn, actColActions, actColPopups } = exportTableContents(item, jsDir, prefix, key, projectDir);
    if (fields.length) spec.fields = fields;
    if (jsCols.length) {
      spec.js_columns = jsCols;
      // Export interleaved column order when JS columns are mixed with fields
      if (columnOrder.length && columnOrder.some((c: string) => c.startsWith('[JS:'))) {
        spec.column_order = columnOrder;
      }
    }
    // actCol record actions (edit/view/updateRecord buttons inside TableActionsColumn)
    if (actColActions.length) {
      spec.recordActions = actColActions;
    }
    popupRefs.push(...fieldPopups, ...actColPopups);
  }

  // ── Form/detail fields ──
  if (['createForm', 'editForm', 'details', 'filterForm'].includes(btype)) {
    const { fields, jsItems, fieldLayout, fieldPopups, templateRef } = exportFormContents(item, jsDir, prefix, key);
    if (fields.length) spec.fields = fields;
    if (jsItems.length) spec.js_items = jsItems;
    if (fieldLayout.length) spec.field_layout = fieldLayout;
    if (templateRef) spec.templateRef = templateRef;
    popupRefs.push(...fieldPopups);
  }

  // ── List/GridCard item fields (list.subModels.item.subModels.grid) ──
  if (['list', 'gridCard'].includes(btype)) {
    const listItem = item.subModels?.item;
    if (listItem && !Array.isArray(listItem)) {
      // Treat the ListItemModel's grid like a form grid
      const fakeItem = { ...listItem, subModels: { ...listItem.subModels } } as FlowModelNode;
      // ListItemModel has grid in subModels.grid (same as form blocks)
      const { fields, jsItems, fieldLayout, fieldPopups } = exportFormContents(fakeItem, jsDir, prefix, key);
      if (fields.length) spec.fields = fields;
      if (jsItems.length) spec.js_items = jsItems;
      if (fieldLayout.length) spec.field_layout = fieldLayout;
      popupRefs.push(...fieldPopups);
    }
  }

  // ── Actions ──
  const { actions, recordActions, actionPopups } = exportActions(item, key, jsDir, prefix);
  if (actions.length) spec.actions = actions;
  // Merge block-level recordActions with actCol recordActions (from table export)
  // Deduplicate: if actCol already has a type with config, skip the simplified block-level version
  const existingRecActs = (spec.recordActions as unknown[]) || [];
  const actColTypes = new Set(existingRecActs
    .filter(a => typeof a === 'object' && a !== null)
    .map(a => (a as Record<string, unknown>).type as string));
  const deduped = recordActions.filter(a => {
    // Keep block-level action only if actCol doesn't already have a configured version
    const atype = typeof a === 'string' ? a : (a as Record<string, unknown>).type as string;
    return !actColTypes.has(atype);
  });
  const mergedRecActs = [...existingRecActs, ...deduped];
  if (mergedRecActs.length) spec.recordActions = mergedRecActs;
  popupRefs.push(...actionPopups);

  // ── Event flows (flowRegistry → JS files) ──
  const flowRegistry = (item.flowRegistry || {}) as Record<string, unknown>;
  const gridNode = item.subModels?.grid;
  const gridFr = (gridNode && !Array.isArray(gridNode))
    ? ((gridNode as FlowModelNode).flowRegistry || {}) as Record<string, unknown>
    : {};
  const allFlows = { ...flowRegistry, ...gridFr };
  if (Object.keys(allFlows).length && jsDir) {
    const eventFlows: Record<string, unknown>[] = [];
    for (const [flowKey, flowDef] of Object.entries(allFlows)) {
      if (!flowDef || typeof flowDef !== 'object') continue;
      const fd = flowDef as Record<string, unknown>;
      const steps = (fd.steps || {}) as Record<string, unknown>;
      for (const [stepKey, stepDef] of Object.entries(steps)) {
        if (!stepDef || typeof stepDef !== 'object') continue;
        const sd = stepDef as Record<string, unknown>;
        const code = ((sd.runJs as Record<string, unknown>)?.code as string)
          || ((sd.defaultParams as Record<string, unknown>)?.code as string)
          || '';
        if (code) {
          const eventsDir = path.join(path.dirname(jsDir), 'events');
          fs.mkdirSync(eventsDir, { recursive: true });
          const fname = `${prefix}_${key}_event_${flowKey}_${stepKey}.js`;
          safeWrite(path.join(eventsDir, fname), stripAutoHeader(code));
          eventFlows.push({
            event: fd.on || 'formValuesChange',
            flow_key: flowKey,
            step_key: stepKey,
            desc: (sd.title as string) || flowKey,
            file: `./events/${fname}`,
          });
        }
      }
    }
    if (eventFlows.length) spec.event_flows = eventFlows;
  }

  // ── Linkage / reaction rules ──
  // blockLinkage: stored on block stepParams.cardSettings.linkageRules
  const blockLinkageRules = (sp.cardSettings as Record<string, unknown>)?.linkageRules;
  if (Array.isArray(blockLinkageRules) && blockLinkageRules.length) {
    spec.blockLinkageRules = blockLinkageRules;
  }

  // fieldValueRules + fieldLinkageRules: different storage depending on block type.
  // Forms: fieldValue + fieldLinkage stored on the grid node.
  // Details: fieldLinkage stored on the block node itself.

  // Build UID → fieldPath map for resolving linkage rule field references
  const uidToFieldPath = new Map<string, string>();
  const formGrid = item.subModels?.grid;
  if (formGrid && !Array.isArray(formGrid)) {
    const gridItems = (formGrid as FlowModelNode).subModels?.items;
    for (const gi of (Array.isArray(gridItems) ? gridItems : []) as FlowModelNode[]) {
      const fp = ((gi.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
        ?.init as Record<string, unknown>;
      const fieldPath = (fp?.fieldPath || '') as string;
      if (fieldPath && gi.uid) uidToFieldPath.set(gi.uid, fieldPath);
    }
  }

  if (['createForm', 'editForm'].includes(btype)) {
    const gridNode = item.subModels?.grid;
    if (gridNode && !Array.isArray(gridNode)) {
      const gridSp = ((gridNode as FlowModelNode).stepParams || {}) as Record<string, unknown>;
      // fieldValueRules: grid.stepParams.formModelSettings.assignRules.value
      const formModelSettings = gridSp.formModelSettings as Record<string, unknown> | undefined;
      const assignRules = formModelSettings?.assignRules as Record<string, unknown> | undefined;
      const fieldValueRules = assignRules?.value;
      if (Array.isArray(fieldValueRules) && fieldValueRules.length) {
        spec.fieldValueRules = resolveRuleFieldUids(fieldValueRules, uidToFieldPath);
      }
      // fieldLinkageRules: grid.stepParams.eventSettings.linkageRules.value
      const eventSettings = gridSp.eventSettings as Record<string, unknown> | undefined;
      const linkageRulesContainer = eventSettings?.linkageRules as Record<string, unknown> | undefined;
      const fieldLinkageRules = linkageRulesContainer?.value;
      if (Array.isArray(fieldLinkageRules) && fieldLinkageRules.length) {
        spec.fieldLinkageRules = resolveRuleFieldUids(fieldLinkageRules, uidToFieldPath);
      }
    }
  } else if (btype === 'details') {
    // fieldLinkageRules: block.stepParams.detailsSettings.linkageRules.value
    const detailsSettings = sp.detailsSettings as Record<string, unknown> | undefined;
    const linkageRulesContainer = detailsSettings?.linkageRules as Record<string, unknown> | undefined;
    const fieldLinkageRules = linkageRulesContainer?.value;
    if (Array.isArray(fieldLinkageRules) && fieldLinkageRules.length) {
      spec.fieldLinkageRules = resolveRuleFieldUids(fieldLinkageRules, uidToFieldPath);
    }
  }

  // ── Apply block-level simplifications ──

  // jsBlock → js shorthand
  if (btype === 'jsBlock' && spec.file) {
    const jsSimplified = simplifyJsBlock(spec);
    for (const k of Object.keys(spec)) delete spec[k];
    Object.assign(spec, jsSimplified);
    spec.key = key;
  }

  // Strip default/empty values from stepParams embedded in actions/recordActions
  if (spec.actions) {
    spec.actions = (spec.actions as unknown[]).map(a => {
      if (typeof a === 'object' && a !== null) {
        const ao = a as Record<string, unknown>;
        if (ao.stepParams) ao.stepParams = stripDefaults(ao.stepParams);
      }
      return a;
    });
  }
  if (spec.recordActions) {
    spec.recordActions = (spec.recordActions as unknown[]).map(a => {
      if (typeof a === 'object' && a !== null) {
        const ao = a as Record<string, unknown>;
        if (ao.stepParams) ao.stepParams = stripDefaults(ao.stepParams);
      }
      return a;
    });
  }

  // State
  const state: Record<string, unknown> = { uid, type: btype };

  return { spec: { ...spec, _popups: popupRefs }, key, state, popupRefs };
}

// ── Table contents ──

function exportTableContents(
  item: FlowModelNode,
  jsDir: string | null,
  prefix: string,
  blockKey: string,
  projectDir: string | null = null,
): { fields: unknown[]; jsCols: unknown[]; columnOrder: string[]; fieldPopups: PopupRef[]; hasActionsColumn: boolean; actColActions: unknown[]; actColPopups: PopupRef[] } {
  const cols = item.subModels?.columns;
  const colArr = (Array.isArray(cols) ? cols : []) as FlowModelNode[];
  const fields: unknown[] = [];
  const jsCols: unknown[] = [];
  const fieldPopups: PopupRef[] = [];

  // Extract actCol buttons (edit/view/delete/updateRecord in TableActionsColumn)
  let hasActionsColumn = false;
  const actColActions: unknown[] = [];
  const actColPopups: PopupRef[] = [];
  for (const col of colArr) {
    if (!col.use?.includes('TableActionsColumn')) continue;
    hasActionsColumn = true;
    const actColItems = col.subModels?.actions;
    const actArr = (Array.isArray(actColItems) ? actColItems : []) as FlowModelNode[];
    const actColUsedKeys = new Set<string>();
    for (const act of actArr) {
      const atype = ACTION_TYPE_MAP[act.use || ''];
      if (!atype) continue;
      const sp = (act.stepParams || {}) as Record<string, unknown>;
      const props = (act as unknown as Record<string, unknown>).props as Record<string, unknown>;
      const hasConfig = Object.keys(sp).length > 0 || (props && Object.keys(props).length > 0);
      if (hasConfig) {
        const actionSpec: Record<string, unknown> = { type: atype };
        if (Object.keys(sp).length) actionSpec.stepParams = sp;
        if (props && Object.keys(props).length) actionSpec.props = props;
        // Generate semantic key
        const key = genActionKey(actionSpec);
        const uniqueKey = actColUsedKeys.has(key) ? (() => { let i = 2; while (actColUsedKeys.has(`${key}_${i}`)) i++; return `${key}_${i}`; })() : key;
        actColUsedKeys.add(uniqueKey);
        actionSpec.key = uniqueKey;
        // Apply type-specific simplification
        if (atype === 'updateRecord') {
          actColActions.push(simplifyUpdateRecord(actionSpec));
        } else if (atype === 'link') {
          actColActions.push(simplifyLinkAction(actionSpec));
        } else {
          // Apply stripDefaults to stepParams
          if (actionSpec.stepParams) actionSpec.stepParams = stripDefaults(actionSpec.stepParams);
          actColActions.push(actionSpec);
        }
      } else {
        actColUsedKeys.add(atype);
        actColActions.push(atype);
      }
      // Check for popup on action
      const actKey = actColUsedKeys.size > 0 ? [...actColUsedKeys].pop()! : atype;
      if (act.subModels?.page) {
        actColPopups.push({
          field: actKey, field_uid: act.uid, block_key: blockKey,
          target: `$SELF.${blockKey}.recordActions.${actKey}`,
        });
      }
    }
  }

  // Track interleaved column order (fields + JS columns in visual order)
  const columnOrder: string[] = [];

  for (const col of colArr) {
    if (col.use?.includes('TableActionsColumn')) continue;

    const fp = (col.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>;
    const fieldPath = ((fp?.init || {}) as Record<string, unknown>).fieldPath as string;

    if (col.use === 'JSColumnModel') {
      const js = (col.stepParams as Record<string, unknown>)?.jsSettings as Record<string, unknown>;
      const code = ((js?.runJs as Record<string, unknown>)?.code as string) || '';
      const colTitle = ((col.stepParams as Record<string, unknown>)?.tableColumnSettings as Record<string, unknown>)
        ?.title as Record<string, unknown>;
      const title = (colTitle?.title as string) || '';
      const desc = code ? extractJsDesc(code) : '';
      if (code && jsDir) {
        const safe = slugify(title || desc || `col_${jsCols.length}`);
        const fname = `${prefix}_${blockKey}_col_${safe}.js`;
        safeWrite(path.join(jsDir, fname), stripAutoHeader(code));
        jsCols.push({
          key: safe, field: fieldPath || '',
          file: `./js/${fname}`,
          ...(title ? { title } : {}),
          ...(desc ? { desc } : {}),
        });
        columnOrder.push(`[JS:${safe}]`);
      }
    } else if (fieldPath) {
      // Check if field has clickToOpen (default detail popup on click)
      const fieldModel = col.subModels?.field;
      const clickToOpen = fieldModel && !Array.isArray(fieldModel)
        ? ((fieldModel as FlowModelNode).stepParams as Record<string, unknown>)
          ?.displayFieldSettings as Record<string, unknown>
        : null;
      const isClickable = (clickToOpen?.clickToOpen as Record<string, unknown>)?.clickToOpen === true;

      if (isClickable) {
        const popupSettings = ((fieldModel as FlowModelNode).stepParams as Record<string, unknown>)
          ?.popupSettings as Record<string, unknown>;
        const openView = popupSettings?.openView as Record<string, unknown>;
        const fieldSpec: Record<string, unknown> = { field: fieldPath, clickToOpen: true };
        // Export popup config (collection, mode, filterByTk)
        if (openView) {
          fieldSpec.popupSettings = {
            collectionName: openView.collectionName,
            mode: openView.mode || 'drawer',
            size: openView.size || 'medium',
            filterByTk: openView.filterByTk || '{{ ctx.record.id }}',
            ...(openView.popupTemplateUid ? { popupTemplateUid: openView.popupTemplateUid } : {}),
          };
        }
        // Simplify clickToOpen + popupSettings → popup shorthand
        simplifyPopup(fieldSpec, projectDir);
        fields.push(fieldSpec);
        columnOrder.push(fieldPath);
      } else {
        // Check for non-default column settings (width, ellipsis)
        const colSettings = (col.stepParams as Record<string, unknown>)?.tableColumnSettings as Record<string, unknown>;
        const colWidth = (colSettings?.width as Record<string, unknown>)?.width as number | undefined;
        const colEllipsis = (colSettings?.ellipsis as Record<string, unknown>)?.ellipsis as boolean | undefined;
        const hasCustomSettings = (colWidth !== undefined && colWidth !== 150) || colEllipsis === false;

        if (hasCustomSettings) {
          const fieldSpec: Record<string, unknown> = { field: fieldPath };
          if (colWidth !== undefined && colWidth !== 150) fieldSpec.width = colWidth;
          if (colEllipsis === false) fieldSpec.ellipsis = false;
          fields.push(fieldSpec as any);
        } else {
          fields.push(fieldPath);
        }
        columnOrder.push(fieldPath);
      }
    }

    // Check for popup on column's display field (col → field → page OR popupTemplateUid)
    const fieldModel2 = col.subModels?.field;
    if (fieldModel2 && !Array.isArray(fieldModel2)) {
      const fmNode = fieldModel2 as FlowModelNode;
      const popupPage = fmNode.subModels?.page;
      const hasPopupPage = popupPage && !Array.isArray(popupPage) && (popupPage as FlowModelNode).uid;
      const hasPopupTemplate = ((fmNode.stepParams as Record<string, unknown>)?.popupSettings as Record<string, unknown>)
        ?.openView as Record<string, unknown>;
      const hasPopupTemplateUid = !!(hasPopupTemplate?.popupTemplateUid);

      if (hasPopupPage || hasPopupTemplateUid) {
        fieldPopups.push({
          field: fieldPath || col.uid,
          field_uid: fmNode.uid || col.uid,
          block_key: blockKey,
          target: `$SELF.${blockKey}.fields.${fieldPath || col.uid}`,
        });
      }
    }
    // Also check direct popup on column (fallback)
    if (!fieldModel2 && col.subModels?.page) {
      fieldPopups.push({
        field: fieldPath || col.uid, field_uid: col.uid, block_key: blockKey,
        target: `$SELF.${blockKey}.fields.${fieldPath || col.uid}`,
      });
    }
  }

  return { fields, jsCols, columnOrder, fieldPopups, hasActionsColumn, actColActions, actColPopups };
}

// ── Form/detail contents ──

function exportFormContents(
  item: FlowModelNode,
  jsDir: string | null,
  prefix: string,
  blockKey: string,
): { fields: unknown[]; jsItems: unknown[]; fieldLayout: unknown[]; fieldPopups: PopupRef[]; templateRef?: Record<string, unknown> } {
  const grid = item.subModels?.grid;
  if (!grid || Array.isArray(grid)) return { fields: [], jsItems: [], fieldLayout: [], fieldPopups: [] };

  const gridNode = grid as FlowModelNode;

  // Check for ReferenceFormGridModel — fields are proxied from template
  let templateRef: Record<string, unknown> | undefined;
  const refSettings = (gridNode.stepParams as Record<string, unknown>)?.referenceSettings as Record<string, unknown>;
  const useTemplate = refSettings?.useTemplate as Record<string, unknown>;
  if (useTemplate?.targetUid && gridNode.use === 'ReferenceFormGridModel') {
    templateRef = {
      templateUid: useTemplate.templateUid,
      templateName: useTemplate.templateName,
      targetUid: useTemplate.targetUid,
      mode: useTemplate.mode || 'reference',
    };
  }

  const rawItems = gridNode.subModels?.items;
  const items = (Array.isArray(rawItems) ? rawItems : []) as FlowModelNode[];
  const fields: unknown[] = [];
  const jsItems: unknown[] = [];
  const fieldPopups: PopupRef[] = [];

  // Build uid → name map for layout extraction
  const uidToName = new Map<string, string>();

  for (const gi of items) {
    const sp = (gi.stepParams || {}) as Record<string, unknown>;

    if (gi.use?.includes('JSItem')) {
      const js = sp.jsSettings as Record<string, unknown>;
      const code = ((js?.runJs as Record<string, unknown>)?.code as string) || '';
      const desc = code ? extractJsDesc(code) : '';
      const jsName = desc ? slugify(desc) : `js_${jsItems.length}`;

      if (code && jsDir) {
        const fname = `${prefix}_${blockKey}_${jsName}.js`;
        safeWrite(path.join(jsDir, fname), stripAutoHeader(code));
        jsItems.push({ key: jsName, file: `./js/${fname}`, desc });
      }
      uidToName.set(gi.uid, desc ? `[JS:${desc}]` : '[JS]');

    } else if (gi.use === 'FilterFormCustomFieldModel') {
      // Custom filter field (date range, etc.) — not a collection field
      const fmSettings = (sp.formItemSettings as Record<string, unknown>)
        ?.fieldSettings as Record<string, unknown>;
      const customName = (fmSettings?.name as string) || `custom_${fields.length}`;
      const customTitle = (fmSettings?.title as string) || customName;
      fields.push({
        type: 'custom',
        name: customName,
        title: customTitle,
        fieldModel: fmSettings?.fieldModel,
        fieldModelProps: fmSettings?.fieldModelProps,
        source: fmSettings?.source,
      });
      uidToName.set(gi.uid, customName);

    } else if (gi.use?.includes('DividerItem') || gi.use?.includes('MarkdownItem')) {
      const label = ((sp.markdownItemSetting as Record<string, unknown>)
        ?.title as Record<string, unknown>)?.label as string || '';
      const mdContent = ((sp.markdownBlockSettings as Record<string, unknown>)
        ?.editMarkdown as Record<string, unknown>)?.content as string || '';

      if (mdContent) {
        // MarkdownItem with template content (e.g. {{ ctx.popup.record.name }})
        const mdKey = `_md_${fields.length}`;
        fields.push({ type: 'markdown', key: mdKey, content: mdContent });
        uidToName.set(gi.uid, `[MD:${mdKey}]`);
      } else {
        uidToName.set(gi.uid, label ? `--- ${label} ---` : '---');
      }

    } else {
      const fpInit = (sp.fieldSettings as Record<string, unknown>)?.init as Record<string, unknown>;
      const fieldPath = (fpInit?.fieldPath as string) || '';
      if (fieldPath) {
        fields.push(fieldPath);
        uidToName.set(gi.uid, fieldPath);

        // Check for popup on field (in subModels.field.subModels.page)
        const fieldSub = gi.subModels?.field;
        if (fieldSub && !Array.isArray(fieldSub)) {
          const fpage = (fieldSub as FlowModelNode).subModels?.page;
          if (fpage && !Array.isArray(fpage) && (fpage as FlowModelNode).uid) {
            fieldPopups.push({
              field: fieldPath,
              field_uid: (fieldSub as FlowModelNode).uid || gi.uid,
              block_key: blockKey,
              target: `$SELF.${blockKey}.fields.${fieldPath}`,
            });
          }
        }
      }
      // Also check direct popup on the item itself
      if (gi.subModels?.page && !gi.use?.includes('JSItem')) {
        const existsAlready = fieldPopups.some(p => p.field_uid === gi.uid);
        if (!existsAlready) {
          const fieldPath2 = (fpInit?.fieldPath as string) || gi.uid;
          fieldPopups.push({
            field: fieldPath2, field_uid: gi.uid, block_key: blockKey,
            target: `$SELF.${blockKey}.fields.${fieldPath2}`,
          });
        }
      }
    }
  }

  // Extract field_layout from gridSettings.rows
  let fieldLayout = extractGridLayout(gridNode, uidToName);

  // If no gridSettings.rows, generate field_layout from items order
  // (ensures all forms export with explicit grid layout for consistent deploy)
  if (!fieldLayout.length && uidToName.size > 0) {
    const rawItems = gridNode.subModels?.items;
    const orderedItems = (Array.isArray(rawItems) ? rawItems : []) as FlowModelNode[];
    for (const oi of orderedItems) {
      const name = uidToName.get(oi.uid);
      if (name) {
        fieldLayout.push([name]); // each item as single full-width row
      }
    }
  }

  return { fields, jsItems, fieldLayout, fieldPopups, templateRef };
}

/**
 * Convert gridSettings.rows back to field_layout DSL.
 * Handles: single items, equal-width rows, complex rows (different sizes, stacked cols).
 */
function extractGridLayout(
  grid: FlowModelNode,
  uidToName: Map<string, string>,
): unknown[] {
  const gs = (grid.stepParams as Record<string, unknown>)?.gridSettings as Record<string, unknown>;
  const gridInner = (gs?.grid || {}) as Record<string, unknown>;
  const rows = (gridInner.rows || {}) as Record<string, string[][]>;
  const sizes = (gridInner.sizes || {}) as Record<string, number[]>;
  const rowOrder = (gridInner.rowOrder || Object.keys(rows)) as string[];

  if (!Object.keys(rows).length) return [];

  const layout: unknown[] = [];

  for (const rk of rowOrder) {
    const cols = rows[rk];
    if (!cols) continue;
    const sz = sizes[rk] || [];
    const nCols = cols.length;
    const defaultSize = nCols > 0 ? Math.floor(24 / nCols) : 24;

    const allSingle = cols.every(col => col.length === 1);
    const equalSize = new Set(sz).size <= 1;

    if (nCols === 1 && cols[0].length === 1) {
      // Single item row
      const name = uidToName.get(cols[0][0]) || cols[0][0].slice(0, 8);
      if (name.startsWith('--- ')) {
        layout.push(name); // divider as string
      } else {
        layout.push([name]);
      }
    } else if (allSingle && equalSize && sz.every(s => s === defaultSize)) {
      // Simple equal-width row
      const names = cols.map(col => uidToName.get(col[0]) || col[0].slice(0, 8));
      layout.push(names);
    } else {
      // Complex row (different sizes or stacked items)
      const rowItems: unknown[] = [];
      for (let j = 0; j < cols.length; j++) {
        const s = j < sz.length ? sz[j] : defaultSize;
        const names = cols[j].map(u => uidToName.get(u) || u.slice(0, 8));

        if (names.length === 1) {
          if (s === defaultSize && equalSize) {
            rowItems.push(names[0]);
          } else {
            rowItems.push({ [names[0]]: s });
          }
        } else {
          // Stacked column
          rowItems.push({ col: names, size: s });
        }
      }
      layout.push(rowItems);
    }
  }

  return layout;
}

// ── Actions ──
// ACTION_TYPE_MAP is imported from utils/block-types (MODEL_TO_ACTION_TYPE)

function exportActions(
  item: FlowModelNode,
  blockKey: string,
  jsDir: string | null = null,
  prefix = '',
): { actions: unknown[]; recordActions: unknown[]; actionPopups: PopupRef[] } {
  const actions: unknown[] = [];
  const recordActions: unknown[] = [];
  const actionPopups: PopupRef[] = [];

  for (const subKey of ['actions', 'recordActions'] as const) {
    const raw = item.subModels?.[subKey];
    const arr = (Array.isArray(raw) ? raw : []) as FlowModelNode[];
    const target = subKey === 'actions' ? actions : recordActions;

    for (const act of arr) {
      const atype = ACTION_TYPE_MAP[act.use || ''];
      if (!atype) continue;

      // Complex actions — export as shorthand + files
      if (atype === 'ai') {
        const actProps = (act as unknown as Record<string, unknown>).props as Record<string, unknown>;
        const employee = (actProps?.aiEmployee as Record<string, unknown>)?.username as string || '';
        const sp = (act.stepParams || {}) as Record<string, unknown>;
        const tasks = ((sp.shortcutSettings as Record<string, unknown>)?.editTasks as Record<string, unknown>)?.tasks;

        const actionSpec: Record<string, unknown> = { type: 'ai', employee, key: `ai_${slugify(employee)}` };

        // Extract tasks to file if jsDir available
        if (tasks && Array.isArray(tasks) && jsDir) {
          const aiDir = path.join(path.dirname(jsDir), 'ai');
          const tasksFname = `${prefix || 'page'}_${blockKey}_tasks.yaml`;
          // Simplify tasks: extract system prompts to separate files
          const simplifiedTasks: Record<string, unknown>[] = [];
          for (let ti = 0; ti < tasks.length; ti++) {
            const t = tasks[ti] as Record<string, unknown>;
            const msg = t.message as Record<string, unknown> || {};
            const system = msg.system as string || '';
            const user = msg.user as string || '';
            const taskTitle = t.title as string || `Task ${ti}`;

            const taskEntry: Record<string, unknown> = { title: taskTitle };
            if (user) taskEntry.user = user;
            if (system) {
              const sysFname = `${prefix || 'page'}_${blockKey}_task${ti}.md`;
              safeWrite(path.join(aiDir, sysFname), system);
              taskEntry.system_file = `./ai/${sysFname}`;
            }
            taskEntry.autoSend = t.autoSend ?? true;
            simplifiedTasks.push(taskEntry);
          }
          safeWrite(path.join(aiDir, tasksFname), dumpYaml({ tasks: simplifiedTasks }));
          actionSpec.tasks_file = `./ai/${tasksFname}`;
        }
        // Simplify: ai: viz or ai: { employee: viz, tasks: ./ai/xxx.yaml }
        target.push(simplifyAiAction(actionSpec));
      } else if (atype === 'link') {
        // Simplify: link: { title, icon, url }
        const sp = (act.stepParams || {}) as Record<string, unknown>;
        const actionSpec: Record<string, unknown> = { type: atype, stepParams: sp };
        actionSpec.key = genActionKey(actionSpec);
        target.push(simplifyLinkAction(actionSpec));
      } else if (atype === 'updateRecord') {
        // Simplify: updateRecord: { key, icon, tooltip, assign, hiddenWhen }
        const sp = (act.stepParams || {}) as Record<string, unknown>;
        const actionSpec: Record<string, unknown> = { type: atype };
        if (Object.keys(sp).length) actionSpec.stepParams = sp;
        actionSpec.key = genActionKey(actionSpec);
        target.push(simplifyUpdateRecord(actionSpec));
      } else if (atype === 'workflowTrigger') {
        const actionSpec: Record<string, unknown> = { type: atype };
        if (act.stepParams && Object.keys(act.stepParams).length) {
          actionSpec.stepParams = stripDefaults(act.stepParams) as Record<string, unknown>;
        }
        actionSpec.key = genActionKey(actionSpec);
        target.push(actionSpec);
      } else {
        // For actions with stepParams (popup buttons, etc.)
        const sp = (act.stepParams || {}) as Record<string, unknown>;
        const props = (act as unknown as Record<string, unknown>).props as Record<string, unknown>;
        const hasConfig = Object.keys(sp).length > 0 || (props && Object.keys(props).length > 0);

        // Actions with config: export stepParams. Only simple actions go as bare strings.
        if (hasConfig && !SIMPLE_ACTION_TYPES.has(atype)) {
          const actionSpec: Record<string, unknown> = { type: atype };
          if (Object.keys(sp).length) actionSpec.stepParams = stripDefaults(sp);
          if (props && Object.keys(props).length) actionSpec.props = props;
          actionSpec.key = genActionKey(actionSpec);
          target.push(actionSpec);
        } else {
          target.push(atype);
        }
      }

      // Check for popup (ChildPage under action)
      if (act.subModels?.page) {
        // Use the semantic key for the target ref
        const lastPushed = target[target.length - 1];
        let refKey: string;
        if (typeof lastPushed === 'object' && lastPushed) {
          const lo = lastPushed as Record<string, unknown>;
          // For simplified actions (link/ai/updateRecord), extract key from nested structure
          refKey = (lo.key as string)
            || ((lo.updateRecord as Record<string, unknown>)?.key as string)
            || ((lo.link as Record<string, unknown>)?.key as string)
            || atype;
        } else {
          refKey = atype;
        }
        actionPopups.push({
          field: refKey,
          field_uid: act.uid,
          block_key: blockKey,
          target: `$SELF.${blockKey}.${subKey === 'recordActions' ? 'recordActions' : 'actions'}.${refKey}`,
        });
      }
    }

    // Also check TableActionsColumn for record actions
    if (subKey === 'recordActions') {
      const cols = item.subModels?.columns;
      const colArr = (Array.isArray(cols) ? cols : []) as FlowModelNode[];
      for (const col of colArr) {
        if (!col.use?.includes('TableActionsColumn')) continue;
        const colActs = col.subModels?.actions;
        const colActArr = (Array.isArray(colActs) ? colActs : []) as FlowModelNode[];
        for (const act of colActArr) {
          const atype = ACTION_TYPE_MAP[act.use || ''];
          if (!atype) continue;
          if (!recordActions.includes(atype)) recordActions.push(atype);
          if (act.subModels?.page) {
            actionPopups.push({ field: atype, field_uid: act.uid, block_key: blockKey });
          }
        }
      }
    }
  }

  return { actions, recordActions, actionPopups };
}
