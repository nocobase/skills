/**
 * Strip default/empty values from export output to produce cleaner YAML.
 *
 * Removes:
 *   - noValue: false                    — always false, never needed
 *   - noValue: true                     — when operator implies no value
 *   - searchParams: []                  — empty array
 *   - apply: { apply: { requestConfig: { params: {} } } }  — default empty config
 *   - assignedValues: {}                — empty assignments
 *   - key: <random>  in linkageRules    — deployer generates new ones
 *   - flowRegistry: {}                  — empty
 */

/** Operators that naturally imply no value (noValue: true is redundant). */
const NO_VALUE_OPERATORS = new Set([
  '$isTruly', '$isFalsy', '$empty', '$notEmpty',
]);

function isEmptyObject(v: unknown): v is Record<string, never> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0;
}

/**
 * Check if a key looks like a random NocoBase-generated key (e.g. "b3sslz489mz").
 * Must be 8+ chars, all lowercase alphanumeric, AND contain both letters and digits.
 */
function isRandomKey(key: string): boolean {
  if (key.length < 8 || !/^[a-z0-9]+$/.test(key)) return false;
  return /[a-z]/.test(key) && /[0-9]/.test(key);
}

/**
 * Check if a value is the default empty apply structure:
 * { apply: { requestConfig: { params: {} } } }
 */
function isDefaultApply(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1 || keys[0] !== 'apply') return false;
  const inner = obj.apply as Record<string, unknown>;
  if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) return false;
  const innerKeys = Object.keys(inner);
  if (innerKeys.length !== 1 || innerKeys[0] !== 'requestConfig') return false;
  const rc = inner.requestConfig as Record<string, unknown>;
  return isEmptyObject(rc);
}

/**
 * Recursively strip default/empty values from an object.
 * Returns a new object (does not mutate input).
 */
export function stripDefaults(obj: unknown, parentKey = ''): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    const result = obj
      .map(item => stripDefaults(item, parentKey))
      .filter(item => item !== undefined);
    return result;
  }

  if (typeof obj !== 'object') return obj;

  const input = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    // noValue: false — always strip
    if (key === 'noValue' && value === false) continue;

    // noValue: true — strip when operator implies no value
    if (key === 'noValue' && value === true) {
      // Check sibling 'operator' field
      const operator = input.operator as string;
      if (operator && NO_VALUE_OPERATORS.has(operator)) continue;
    }

    // searchParams: [] — empty array
    if (key === 'searchParams' && Array.isArray(value) && value.length === 0) continue;

    // apply: { apply: { requestConfig: { params: {} } } }
    if (key === 'apply' && isDefaultApply(value)) continue;

    // assignedValues: {} — empty object
    if (key === 'assignedValues' && isEmptyObject(value)) continue;

    // flowRegistry: {} — empty object
    if (key === 'flowRegistry' && isEmptyObject(value)) continue;

    // key: <random> inside linkageRules
    if (key === 'key' && typeof value === 'string'
        && isRandomKey(value) && parentKey === 'linkageRules') {
      continue;
    }

    // Recurse into children
    const childKey = (key === 'linkageRules' || parentKey === 'linkageRules') ? 'linkageRules' : key;
    const stripped = stripDefaults(value, childKey);
    if (stripped !== undefined) {
      result[key] = stripped;
    }
  }

  return result;
}
