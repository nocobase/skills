/**
 * NocoBase filter validator — validates filter JSON against collection field metadata.
 *
 * Reusable across all NocoBase filter contexts:
 *   - ACL scopes (role permissions) — allows {{$user}}, {{$nRole}} variables
 *   - Block dataScope (UI data range) — static only, no variables
 *   - Linkage rules (form interaction) — may use context variables
 *   - Workflow conditions — allows {{$context}}, {{$jobsMapByNodeKey}} variables
 *
 * NocoBase filter spec (from skills/nocobase-utils/references/filter/index.md):
 *   - Top-level MUST be $and or $or wrapper
 *   - Field conditions: { "field": { "$op": value } }
 *   - Relation traversal: { "relation": { "subField": { "$op": value } } }
 *   - Dot notation also valid: { "relation.subField": { "$op": value } }
 *   - Variables: {{ $user.id }}, {{ $nDate.today }}, etc.
 *
 * Two filter pipelines on the server (both use same JSON format):
 *   1. ACL scope → parseJsonTemplate() (resolves variables) → FilterParser → SQL
 *   2. dataScope → directly to FilterParser → SQL (no variable resolution)
 *   When both exist, merged with $and: [ aclFilter, dataScopeFilter ]
 */

// ── Filter context ──

/**
 * Filter context determines validation rules.
 *
 * - 'acl-scope': ACL permission scope — allows variables, requires $and/$or wrapper
 * - 'data-scope': Block dataScope — NO variables, static filter
 * - 'workflow': Workflow node condition — allows workflow-specific variables
 * - 'linkage': Form linkage rule condition — may use context variables
 */
export type FilterContext = 'acl-scope' | 'data-scope' | 'workflow' | 'linkage';

/** Variables allowed per context. */
const CONTEXT_VARIABLES: Record<FilterContext, Set<string>> = {
  'acl-scope': new Set(['$user', '$nRole', '$nToken', '$nDate', '$nExactDate']),
  'data-scope': new Set(),  // No variables allowed — static config
  'workflow': new Set(['$context', '$jobsMapByNodeKey', '$scopes', '$system', '$nDate']),
  'linkage': new Set(['$user', '$nRole', '$nDate', '$nExactDate', '$system']),
};

// ── Field type classification ──

/** Relation field interfaces — filter must use nested traversal { relation: { field: { $op } } }. */
export const RELATION_INTERFACES = new Set([
  'oho', 'obo', 'o2o', 'o2m', 'm2o', 'm2m',
  'belongsTo', 'hasOne', 'hasMany', 'belongsToMany',
  'linkTo', 'subTable', 'updatedBy', 'createdBy',
]);

/** Operators valid per field category. */
const OPERATORS_BY_CATEGORY: Record<string, Set<string>> = {
  string: new Set([
    '$eq', '$ne', '$includes', '$notIncludes',
    '$startsWith', '$notStartsWith', '$endWith', '$notEndWith',
    '$empty', '$notEmpty',
  ]),
  number: new Set([
    '$eq', '$ne', '$gt', '$gte', '$lt', '$lte',
    '$in', '$notIn', '$empty', '$notEmpty',
  ]),
  boolean: new Set(['$isTruly', '$isFalsy', '$empty', '$notEmpty']),
  date: new Set([
    '$dateOn', '$dateNotOn', '$dateBefore', '$dateAfter',
    '$dateNotBefore', '$dateNotAfter', '$dateBetween',
    '$empty', '$notEmpty',
  ]),
  time: new Set(['$eq', '$neq', '$empty', '$notEmpty']),
  select: new Set(['$eq', '$ne', '$in', '$notIn', '$empty', '$notEmpty']),
  multipleSelect: new Set([
    '$match', '$notMatch', '$anyOf', '$noneOf',
    '$empty', '$notEmpty',
  ]),
  array: new Set([
    '$match', '$notMatch', '$anyOf', '$noneOf',
    '$arrayEmpty', '$arrayNotEmpty',
  ]),
  id: new Set(['$eq', '$ne', '$exists', '$notExists']),
  relation: new Set(['$eq', '$ne', '$in', '$notIn', '$exists', '$notExists', '$empty', '$notEmpty']),
};

/** Map field interface to operator category. */
const INTERFACE_TO_CATEGORY: Record<string, string> = {
  // String-like
  input: 'string', textarea: 'string', email: 'string', phone: 'string',
  url: 'string', color: 'string', icon: 'string', nanoid: 'string',
  uuid: 'string', password: 'string', markdown: 'string', richText: 'string',
  // Number-like
  integer: 'number', number: 'number', percent: 'number', float: 'number',
  double: 'number', bigInt: 'number', decimal: 'number',
  // Boolean
  checkbox: 'boolean', boolean: 'boolean',
  // Date/time
  date: 'date', datetime: 'date', createdAt: 'date', updatedAt: 'date',
  time: 'time', unixTimestamp: 'date',
  // Select
  select: 'select', radioGroup: 'select',
  multipleSelect: 'multipleSelect', checkboxGroup: 'multipleSelect',
  // Array/JSON
  array: 'array', json: 'array', jsonb: 'array',
  // ID
  id: 'id',
  // Relations
  m2o: 'relation', o2m: 'relation', m2m: 'relation',
  oho: 'relation', obo: 'relation', o2o: 'relation',
  belongsTo: 'relation', hasOne: 'relation', hasMany: 'relation', belongsToMany: 'relation',
  linkTo: 'relation', createdBy: 'relation', updatedBy: 'relation',
};

// ── Field metadata type ──

export interface FieldMeta {
  name: string;
  interface: string;
  type: string;
  foreignKey?: string;
  target?: string;
}

export type CollectionFields = Map<string, FieldMeta>;
export type CollectionsMap = Map<string, CollectionFields>;

// ── Validation result ──

export interface FilterIssue {
  path: string;
  level: 'error' | 'warning';
  message: string;
}

export interface ValidateFilterOptions {
  /** Max relation traversal depth (default: 2). */
  maxDepth?: number;
  /** Path prefix for issue messages (e.g. "scope 'my_scope'"). */
  context?: string;
  /** Filter context — determines variable and structure rules. */
  filterContext?: FilterContext;
}

// ── Main validation function ──

/**
 * Validate a NocoBase filter object against collection metadata.
 */
export function validateFilter(
  filter: Record<string, unknown>,
  collection: string,
  collections: CollectionsMap,
  opts: ValidateFilterOptions = {},
): FilterIssue[] {
  const maxDepth = opts.maxDepth ?? 2;
  const prefix = opts.context ? `${opts.context}: ` : '';
  const filterCtx = opts.filterContext ?? 'acl-scope';
  const allowedVars = CONTEXT_VARIABLES[filterCtx];
  const issues: FilterIssue[] = [];

  // Check top-level structure: must be $and or $or
  const topKeys = Object.keys(filter);
  const hasLogicWrapper = topKeys.length === 1 && (topKeys[0] === '$and' || topKeys[0] === '$or');
  if (!hasLogicWrapper && topKeys.length > 0) {
    // Check if there are field conditions at root level (not wrapped)
    const hasFieldAtRoot = topKeys.some(k => !k.startsWith('$'));
    if (hasFieldAtRoot) {
      issues.push({
        path: `${prefix}(root)`,
        level: 'warning',
        message: 'filter should be wrapped in $and or $or at top level',
      });
    }
  }

  const fields = collections.get(collection);
  if (!fields) return issues;

  validateFilterNode(filter, fields, collections, issues, prefix, 0, maxDepth, allowedVars);
  return issues;
}

function validateFilterNode(
  filter: Record<string, unknown>,
  fields: CollectionFields,
  collections: CollectionsMap,
  issues: FilterIssue[],
  pathPrefix: string,
  depth: number,
  maxDepth: number,
  allowedVars: Set<string>,
): void {
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and' || key === '$or') {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (value[i] && typeof value[i] === 'object') {
            validateFilterNode(
              value[i] as Record<string, unknown>,
              fields, collections, issues,
              `${pathPrefix}${key}[${i}].`, depth, maxDepth, allowedVars,
            );
          }
        }
      }
      continue;
    }

    if (key.startsWith('$')) continue;

    // Parse field path: dot notation (field.subfield) or (field.$op)
    const parts = key.split('.');
    const fieldName = parts[0];
    const fieldMeta = fields.get(fieldName);

    if (!fieldMeta) {
      issues.push({
        path: `${pathPrefix}${fieldName}`,
        level: 'error',
        message: `field '${fieldName}' not found`,
      });
      continue;
    }

    const isRelation = RELATION_INTERFACES.has(fieldMeta.interface) || RELATION_INTERFACES.has(fieldMeta.type);

    // Dot-notation operator: field.$operator
    if (parts.length === 2 && parts[1].startsWith('$')) {
      validateOperator(fieldMeta, parts[1], `${pathPrefix}${key}`, issues);
      validateValue(value, parts[1], `${pathPrefix}${key}`, issues, allowedVars);
      continue;
    }

    // Dot-notation relation traversal: field.subfield.$op
    if (parts.length > 1 && isRelation) {
      if (depth < maxDepth && fieldMeta.target) {
        const targetFields = collections.get(fieldMeta.target);
        if (targetFields) {
          const subField = parts[1];
          if (!subField.startsWith('$') && !targetFields.has(subField)) {
            issues.push({
              path: `${pathPrefix}${fieldName}.${subField}`,
              level: 'error',
              message: `field '${subField}' not found in target '${fieldMeta.target}'`,
            });
          }
        }
      }
      continue;
    }

    // Value-based check for relation fields
    if (isRelation) {
      const isPrimitive = value === null || typeof value !== 'object';
      if (isPrimitive) {
        const hint = fieldMeta.foreignKey ? ` (use '${fieldMeta.foreignKey}' instead)` : '';
        issues.push({
          path: `${pathPrefix}${fieldName}`,
          level: 'error',
          message: `relation field '${fieldName}' (${fieldMeta.interface || fieldMeta.type}) used with primitive value${hint}`,
        });
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Nested object — validate sub-fields against target (level 2)
        if (depth < maxDepth && fieldMeta.target) {
          const targetFields = collections.get(fieldMeta.target);
          if (targetFields) {
            const subObj = value as Record<string, unknown>;
            for (const subKey of Object.keys(subObj)) {
              if (subKey.startsWith('$')) continue;
              if (!targetFields.has(subKey)) {
                issues.push({
                  path: `${pathPrefix}${fieldName}.${subKey}`,
                  level: 'error',
                  message: `field '${subKey}' not found in target '${fieldMeta.target}'`,
                });
              }
            }
          }
        }
      }
      continue;
    }

    // Non-relation scalar field with object value — check operators
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      for (const opKey of Object.keys(ops)) {
        if (opKey.startsWith('$')) {
          validateOperator(fieldMeta, opKey, `${pathPrefix}${fieldName}`, issues);
          validateValue(ops[opKey], opKey, `${pathPrefix}${fieldName}`, issues, allowedVars);
        }
      }
    }
  }
}

// ── Operator validation ──

function validateOperator(
  field: FieldMeta,
  operator: string,
  path: string,
  issues: FilterIssue[],
): void {
  const category = INTERFACE_TO_CATEGORY[field.interface]
    || INTERFACE_TO_CATEGORY[field.type]
    || 'string';
  const validOps = OPERATORS_BY_CATEGORY[category];
  if (validOps && !validOps.has(operator)) {
    issues.push({
      path,
      level: 'warning',
      message: `operator '${operator}' may not be valid for field type '${field.interface || field.type}' (${category})`,
    });
  }
}

// ── Value validation ──

function validateValue(
  value: unknown,
  operator: string,
  path: string,
  issues: FilterIssue[],
  allowedVars: Set<string>,
): void {
  // Check variable template
  if (typeof value === 'string' && value.includes('{{')) {
    if (allowedVars.size === 0) {
      // Context forbids variables (e.g. data-scope)
      issues.push({
        path,
        level: 'error',
        message: `variable templates not allowed in this context (dataScope is static)`,
      });
    } else {
      const varMatch = value.match(/\{\{\s*(\$\w+)/);
      if (varMatch) {
        const varName = varMatch[1];
        if (!allowedVars.has(varName)) {
          issues.push({
            path,
            level: 'warning',
            message: `unknown variable '${varName}' in template '${value}'`,
          });
        }
      }
    }
  }

  // Date operators need string or array value
  if (operator === '$dateBetween' && !Array.isArray(value)) {
    issues.push({
      path,
      level: 'warning',
      message: `'$dateBetween' expects an array of two dates, got ${typeof value}`,
    });
  }
}

// ── Helper: build CollectionsMap from YAML data ──

export function collectionsFromYaml(
  yaml: Record<string, { fields: Record<string, { interface: string; type: string; foreignKey?: string; target?: string }> }>,
): CollectionsMap {
  const map: CollectionsMap = new Map();
  for (const [name, coll] of Object.entries(yaml)) {
    const fields: CollectionFields = new Map();
    for (const [fname, finfo] of Object.entries(coll.fields)) {
      fields.set(fname, { name: fname, ...finfo });
    }
    map.set(name, fields);
  }
  return map;
}
