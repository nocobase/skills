/**
 * Live-flowModel → DSL shorthand simplifiers.
 *
 * Every simplifier takes a raw NB stepParams/action record and collapses
 * it into the canonical short form used in layout.yaml. These are the
 * reason pulled DSL reads like a hand-authored YAML instead of a literal
 * API dump.
 *
 * Families:
 *   - Click-to-open + popup (simplifyPopup)
 *   - Actions (link / ai / updateRecord)
 *   - Reference blocks (templateRef → ref: shorthand)
 *   - jsBlock (strip everything except key/file/desc)
 *   - dataScope ($and filter → {path.$op: value})
 *   - Linkage rules (extractHiddenWhen, resolveRuleFieldUids)
 *
 * All functions are called from block-exporter; none take NB client or
 * mutate disk — pure transformations. Kept in one module so every future
 * simplifier lands in a predictable place.
 */
import { stripDefaults } from '../utils/strip-defaults';
import { lookupTemplateFile } from '../utils/template-lookup';

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
export function simplifyLinkAction(actionSpec: Record<string, unknown>): Record<string, unknown> {
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
export function simplifyAiAction(actionSpec: Record<string, unknown>): Record<string, unknown> {
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
export function simplifyReference(spec: Record<string, unknown>, projectDir: string | null): Record<string, unknown> | null {
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
export function simplifyJsBlock(spec: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { type: 'jsBlock' };
  if (spec.key) result.key = spec.key;
  if (spec.file) result.file = spec.file;
  if (spec.desc) result.desc = spec.desc;
  return result;
}

/**
 * Replace field UIDs with field paths in linkage rule arrays.
 * Walks the rule tree replacing any UID string found in the map.
 */
export function resolveRuleFieldUids(
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

/**
 * Simplify dataScope { logic: $and, items: [{path, operator, value}] }
 * into filter: { path.$op: value } shorthand.
 * Only simplifies flat $and conditions. Complex nested logic keeps original format.
 */
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
export function simplifyUpdateRecord(actionSpec: Record<string, unknown>): Record<string, unknown> {
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
export function extractHiddenWhen(rules: Array<Record<string, unknown>>): Record<string, unknown> | null {
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
