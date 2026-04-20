/**
 * Workflow spec normalization — fills in NocoBase-native boilerplate so agents
 * can write specs that hold only core params (trigger type + collection/field
 * + each node's decision-making config), and the deployer expands them into
 * the full API shape.
 *
 * Rule: NB-native field names only, no invented sugar. We only supply defaults
 * for fields that are *always* the same across workflows (e.g. query pagination,
 * workflow-level stackLimit). Anything that expresses intent stays in the spec.
 *
 * Export applies defaults in reverse — strips boilerplate fields whose value
 * matches our default, so a round-trip pull writes minimal YAML too.
 */
import type { WorkflowSpec, NodeSpec } from './types';

// ── Defaults ──

const WORKFLOW_OPTIONS_DEFAULTS: Record<string, unknown> = {
  stackLimit: 1,
  deleteExecutionOnStatus: [],
};

// Per-node-type defaults applied to `config`. Keys with nested `params` object
// are deep-merged — user-provided params keep priority.
const NODE_CONFIG_DEFAULTS: Record<string, Record<string, unknown>> = {
  query: {
    dataSource: 'main',
    multiple: false,
    params: { filter: {}, sort: [], page: 1, pageSize: 20, appends: [] },
  },
  create: {
    dataSource: 'main',
    params: { individualHooks: false },
  },
  update: {
    dataSource: 'main',
    params: { individualHooks: false },
  },
  destroy: {
    dataSource: 'main',
    params: { individualHooks: false },
  },
  sql: {
    dataSource: 'main',
  },
  aggregate: {
    dataSource: 'main',
  },
  condition: {
    rejectOnFalse: false,
    engine: 'basic',
  },
  'multi-condition': {
    engine: 'basic',
  },
  calculation: {
    engine: 'math.js',
  },
};

// Trigger defaults keyed by trigger type.
const TRIGGER_DEFAULTS: Record<string, Record<string, unknown>> = {
  collection: { appends: [] },
  schedule: { appends: [] },
};

// ── Helpers ──

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Shallow-merge with nested merge for `params`. User wins for every key they
 * provided; defaults only fill gaps.
 */
function mergeConfig(
  defaults: Record<string, unknown>,
  user: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...defaults, ...user };
  // Deep-merge `params` one level (enough for query/update/destroy/create)
  if (isPlainObject(defaults.params) && isPlainObject(user.params)) {
    out.params = { ...(defaults.params as Record<string, unknown>), ...(user.params as Record<string, unknown>) };
  }
  return out;
}

// ── Apply defaults (used at deploy time) ──

export function applySpecDefaults(spec: WorkflowSpec): WorkflowSpec {
  const out: WorkflowSpec = { ...spec };

  // Workflow-level options
  out.options = { ...WORKFLOW_OPTIONS_DEFAULTS, ...(spec.options ?? {}) };

  // Trigger
  const triggerDefaults = TRIGGER_DEFAULTS[spec.type] ?? {};
  out.trigger = { ...triggerDefaults, ...(spec.trigger ?? {}) };

  // Nodes
  const newNodes: Record<string, NodeSpec> = {};
  for (const [name, node] of Object.entries(spec.nodes ?? {})) {
    newNodes[name] = applyNodeDefaults(node);
  }
  out.nodes = newNodes;

  return out;
}

export function applyNodeDefaults(node: NodeSpec): NodeSpec {
  const defaults = NODE_CONFIG_DEFAULTS[node.type];
  if (!defaults) return node;
  // $ref configs: deployer resolves them separately, defaults apply post-resolve
  if (isPlainObject(node.config) && '$ref' in node.config) return node;
  return { ...node, config: mergeConfig(defaults, node.config ?? {}) };
}

// ── Strip defaults (used at export time) ──
// After pull, any field whose value equals our default is dropped so the
// round-tripped YAML stays minimal.

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => isEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => isEqual(a[k], b[k]));
  }
  return false;
}

function stripDefaultKeys(
  value: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const d = defaults[k];
    if (isPlainObject(d) && isPlainObject(v)) {
      const stripped = stripDefaultKeys(v, d);
      if (Object.keys(stripped).length) out[k] = stripped;
    } else if (d !== undefined && isEqual(d, v)) {
      // drop
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function stripSpecDefaults(spec: WorkflowSpec): WorkflowSpec {
  const out: WorkflowSpec = { ...spec };

  // Workflow options: drop entirely if all values match defaults
  if (spec.options) {
    const stripped = stripDefaultKeys(spec.options as Record<string, unknown>, WORKFLOW_OPTIONS_DEFAULTS);
    if (Object.keys(stripped).length) out.options = stripped; else delete out.options;
  }

  // Trigger: drop default-valued keys for this trigger type
  const triggerDefaults = TRIGGER_DEFAULTS[spec.type];
  if (triggerDefaults && spec.trigger) {
    out.trigger = stripDefaultKeys(spec.trigger as Record<string, unknown>, triggerDefaults);
  }

  // Nodes
  const newNodes: Record<string, NodeSpec> = {};
  for (const [name, node] of Object.entries(spec.nodes ?? {})) {
    newNodes[name] = stripNodeDefaults(node);
  }
  out.nodes = newNodes;

  return out;
}

export function stripNodeDefaults(node: NodeSpec): NodeSpec {
  const defaults = NODE_CONFIG_DEFAULTS[node.type];
  if (!defaults || !node.config) return node;
  if (isPlainObject(node.config) && '$ref' in node.config) return node;
  const stripped = stripDefaultKeys(node.config as Record<string, unknown>, defaults);
  return { ...node, config: stripped };
}
