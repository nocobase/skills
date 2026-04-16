/**
 * Generate stable semantic keys for actions.
 *
 * Rules:
 *   - Simple actions (filter, refresh) → key = type
 *   - Configured actions → key = type_<semantic_suffix>
 *     updateRecord → updateRecord_done (from tooltip/title)
 *     ai → ai_viz (from employee)
 *     popup → popup_schedule (from button title)
 *     workflowTrigger → workflowTrigger_merge (from button title)
 */
import { slugify } from './slugify';

/**
 * Generate a semantic key for an action spec.
 * Used in both export (as `key` field) and deploy (for state matching).
 */
export function actionKey(aspec: unknown): string {
  if (typeof aspec === 'string') return aspec;

  const spec = aspec as Record<string, unknown>;
  const atype = (spec.type as string) || 'unknown';

  // AI → ai_<employee>
  if (atype === 'ai' && spec.employee) {
    return `ai_${slugify(spec.employee as string)}`;
  }

  // Extract semantic suffix from stepParams
  const sp = (spec.stepParams || {}) as Record<string, unknown>;
  const buttonSettings = sp.buttonSettings as Record<string, unknown>;
  const general = (buttonSettings?.general || {}) as Record<string, unknown>;

  // Use tooltip or title as suffix
  const tooltip = (general.tooltip as string) || '';
  const title = (general.title as string) || '';
  const suffix = tooltip || title;

  if (suffix) {
    return `${atype}_${slugify(suffix)}`;
  }

  // workflowTrigger with custom title in buttonSettings
  if (atype === 'workflowTrigger' && title) {
    return `workflowTrigger_${slugify(title)}`;
  }

  // Popup with button title
  if (atype === 'popup' && (general.title || general.tooltip)) {
    return `popup_${slugify((general.title || general.tooltip) as string)}`;
  }

  // Fallback: just type
  return atype;
}

/**
 * Deduplicate action keys. Appends _2, _3, etc. for collisions.
 */
export function deduplicateKey(key: string, usedKeys: Set<string>): string {
  if (!usedKeys.has(key)) {
    usedKeys.add(key);
    return key;
  }
  let idx = 2;
  while (usedKeys.has(`${key}_${idx}`)) idx++;
  const unique = `${key}_${idx}`;
  usedKeys.add(unique);
  return unique;
}
