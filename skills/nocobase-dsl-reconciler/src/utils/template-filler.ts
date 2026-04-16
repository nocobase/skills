/**
 * Fill {{PARAM}} and {{PARAM||default}} placeholders in JS template strings.
 *
 * Usage:
 *   fillTemplate(code, { COLLECTION: 'nb_erp_products', LABEL: 'Total Products' })
 *
 * Rules:
 *   {{PARAM}}          → replaced by params[PARAM], error if missing
 *   {{PARAM||default}} → replaced by params[PARAM] or "default" if not provided
 */
export function fillTemplate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)(?:\|\|([^}]*))?\}\}/g, (_match, key, defaultVal) => {
    if (key in params) return params[key];
    if (defaultVal !== undefined) return defaultVal;
    return `{{${key}}}`; // leave unresolved
  });
}
