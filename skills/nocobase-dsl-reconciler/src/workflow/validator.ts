/**
 * Workflow spec validator — validates WorkflowSpec before deploy.
 *
 * Checks:
 * 1. Required fields (title, type, trigger, nodes, graph)
 * 2. Trigger type-specific validation (collection mode, schedule config)
 * 3. Node validation (type, title, required config per type)
 * 4. Variable reference syntax ({{$context.data.xxx}}, {{$jobsMapByNodeKey.xxx}})
 * 5. Collection/field existence (optional, requires collections map)
 * 6. Graph structure (orphan detection, graph ↔ nodes consistency)
 */
import type { WorkflowSpec, NodeSpec } from './types';

// ── Result types ──

export interface ValidationIssue {
  level: 'error' | 'warn';
  path: string;
  message: string;
}

export interface WorkflowValidationResult {
  errors: ValidationIssue[];
  valid: boolean;
}

// ── Known sets ──

const KNOWN_TRIGGER_TYPES = new Set([
  'collection', 'schedule', 'action',
  // Less common but valid
  'form-event', 'approval',
]);

const KNOWN_NODE_TYPES = new Set([
  'condition', 'multi-conditions',
  'create', 'update', 'destroy', 'query',
  'sql',
  'manual', 'approval',
  'notification',
  'loop', 'parallel',
  'delay', 'aggregate',
  'request',
  'calculation',
  'output',
]);

/** Valid mode bitmask values for collection trigger: 1,2,3,4,5,6,7 */
const VALID_COLLECTION_MODES = new Set([1, 2, 3, 4, 5, 6, 7]);

// Node types that require a collection reference in config
const COLLECTION_NODE_TYPES = new Set(['create', 'update', 'destroy', 'query']);

// Node types that must have at least one branch
const BRANCHING_NODE_TYPES = new Set(['condition', 'multi-conditions']);

// ── Variable extraction ──

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

interface VariableRef {
  raw: string;       // full match including {{ }}
  expression: string; // inner expression
}

function extractVariables(value: unknown): VariableRef[] {
  const refs: VariableRef[] = [];

  function walk(v: unknown): void {
    if (typeof v === 'string') {
      let match: RegExpExecArray | null;
      VARIABLE_PATTERN.lastIndex = 0;
      while ((match = VARIABLE_PATTERN.exec(v)) !== null) {
        refs.push({ raw: match[0], expression: match[1].trim() });
      }
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else if (v !== null && typeof v === 'object') {
      for (const val of Object.values(v as Record<string, unknown>)) {
        walk(val);
      }
    }
  }

  walk(value);
  return refs;
}

// ── Graph parsing (lightweight, for validation only) ──

interface GraphInfo {
  chainHead: string;
  edgeSources: Set<string>;       // all nodes that appear as source
  edgeTargets: Set<string>;       // all nodes that appear as target
  allGraphNodes: Set<string>;     // all node names mentioned in graph
  edges: { source: string; target: string; label?: string }[];
}

function parseGraphForValidation(graphLines: string[]): GraphInfo {
  let chainHead = '';
  const edgeSources = new Set<string>();
  const edgeTargets = new Set<string>();
  const allGraphNodes = new Set<string>();
  const edges: { source: string; target: string; label?: string }[] = [];

  for (const line of graphLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const arrowMatch = trimmed.match(/^(\S+)\s*-->\s*(?:\[([^\]]+)\]\s*)?(\S+)$/);
    if (arrowMatch) {
      const [, source, label, target] = arrowMatch;
      edgeSources.add(source);
      edgeTargets.add(target);
      allGraphNodes.add(source);
      allGraphNodes.add(target);
      edges.push({ source, target, label });
    } else if (!trimmed.includes('-->')) {
      if (!chainHead) chainHead = trimmed;
      allGraphNodes.add(trimmed);
    }
  }

  return { chainHead, edgeSources, edgeTargets, allGraphNodes, edges };
}

// ── Collection reference extraction from node configs ──

function extractCollectionFromConfig(config: Record<string, unknown>): string | undefined {
  // Direct collection field
  if (typeof config.collection === 'string') return config.collection;
  // Nested in params
  if (config.params && typeof config.params === 'object') {
    const params = config.params as Record<string, unknown>;
    if (typeof params.collection === 'string') return params.collection;
  }
  return undefined;
}

function extractFieldsFromConfig(config: Record<string, unknown>): string[] {
  const fields: string[] = [];

  function collectFields(obj: unknown, depth: number): void {
    if (depth > 10) return;
    if (obj === null || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (const item of obj) collectFields(item, depth + 1);
      return;
    }

    const record = obj as Record<string, unknown>;

    // values: { fieldName: value }
    if (record.values && typeof record.values === 'object' && !Array.isArray(record.values)) {
      for (const key of Object.keys(record.values as Record<string, unknown>)) {
        fields.push(key);
      }
    }

    // filter: { fieldName: value }
    if (record.filter && typeof record.filter === 'object' && !Array.isArray(record.filter)) {
      for (const key of Object.keys(record.filter as Record<string, unknown>)) {
        if (!key.startsWith('$')) fields.push(key);
      }
    }

    // changed: [fieldName, ...]
    if (Array.isArray(record.changed)) {
      for (const item of record.changed) {
        if (typeof item === 'string') fields.push(item);
      }
    }

    // appends: [fieldName, ...]
    if (Array.isArray(record.appends)) {
      for (const item of record.appends) {
        if (typeof item === 'string') fields.push(item);
      }
    }

    // Recurse into all object children to find nested values/filter/etc.
    for (const val of Object.values(record)) {
      if (val !== null && typeof val === 'object') {
        collectFields(val, depth + 1);
      }
    }
  }

  collectFields(config, 0);
  return fields;
}

// ── Main validation function ──

/**
 * Validate a WorkflowSpec before deployment.
 *
 * @param spec          The workflow spec to validate
 * @param collections   Optional map of collection name → { fields: string[] }
 *                      for verifying collection/field references
 * @returns             Validation result with errors/warnings and valid flag
 */
export function validateWorkflow(
  spec: WorkflowSpec,
  collections?: Record<string, { fields: string[] }>,
): WorkflowValidationResult {
  const issues: ValidationIssue[] = [];

  // ─── 1. Required fields ───

  if (!spec.title || typeof spec.title !== 'string' || !spec.title.trim()) {
    issues.push({ level: 'error', path: 'title', message: 'title is required and must be a non-empty string' });
  }

  if (!spec.type || typeof spec.type !== 'string') {
    issues.push({ level: 'error', path: 'type', message: 'type (trigger type) is required' });
  } else if (!KNOWN_TRIGGER_TYPES.has(spec.type)) {
    issues.push({
      level: 'warn',
      path: 'type',
      message: `unknown trigger type "${spec.type}" (known: ${[...KNOWN_TRIGGER_TYPES].join(', ')})`,
    });
  }

  if (!spec.trigger || typeof spec.trigger !== 'object') {
    issues.push({ level: 'error', path: 'trigger', message: 'trigger config is required' });
  }

  if (!spec.nodes || typeof spec.nodes !== 'object' || !Object.keys(spec.nodes).length) {
    issues.push({ level: 'error', path: 'nodes', message: 'nodes map is required and must contain at least one node' });
  }

  if (!spec.graph || !Array.isArray(spec.graph) || !spec.graph.length) {
    issues.push({ level: 'error', path: 'graph', message: 'graph is required and must contain at least one entry' });
  }

  // ─── 2. Trigger validation ───

  if (spec.trigger && spec.type) {
    validateTrigger(spec, issues, collections);
  }

  // ─── 3. Node validation ───

  if (spec.nodes && typeof spec.nodes === 'object') {
    const nodeNames = Object.keys(spec.nodes);
    const nodeTitles = new Set<string>();

    for (const [name, nodeSpec] of Object.entries(spec.nodes)) {
      validateNode(name, nodeSpec, issues, collections);

      // Check for duplicate titles (would cause update ambiguity)
      const title = nodeSpec.title ?? name;
      if (nodeTitles.has(title)) {
        issues.push({
          level: 'warn',
          path: `nodes.${name}.title`,
          message: `duplicate node title "${title}" — deploy will match nodes by title, so duplicates cause ambiguity`,
        });
      }
      nodeTitles.add(title);
    }
  }

  // ─── 4. Variable reference validation ───

  if (spec.nodes) {
    validateVariables(spec, issues);
  }

  // ─── 5. Graph structure validation ───

  if (spec.graph && spec.nodes) {
    validateGraphStructure(spec, issues);
  }

  return {
    errors: issues,
    valid: !issues.some(i => i.level === 'error'),
  };
}

// ── Trigger validation ──

function validateTrigger(
  spec: WorkflowSpec,
  issues: ValidationIssue[],
  collections?: Record<string, { fields: string[] }>,
): void {
  const trigger = spec.trigger;

  switch (spec.type) {
    case 'collection': {
      // Must have collection name
      if (!trigger.collection || typeof trigger.collection !== 'string') {
        issues.push({
          level: 'error',
          path: 'trigger.collection',
          message: 'collection trigger requires a collection name',
        });
      } else if (collections && !collections[trigger.collection as string]) {
        issues.push({
          level: 'warn',
          path: 'trigger.collection',
          message: `collection "${trigger.collection}" not found in known collections`,
        });
      }

      // Mode must be valid bitmask
      if (trigger.mode !== undefined) {
        const mode = Number(trigger.mode);
        if (!Number.isInteger(mode) || !VALID_COLLECTION_MODES.has(mode)) {
          issues.push({
            level: 'error',
            path: 'trigger.mode',
            message: `invalid collection trigger mode ${trigger.mode} (valid: 1=create, 2=update, 3=both, 4=delete, 7=all)`,
          });
        }
      }

      // Validate watched fields if collections map available
      if (collections && trigger.collection && Array.isArray(trigger.changed)) {
        const collInfo = collections[trigger.collection as string];
        if (collInfo) {
          for (const field of trigger.changed as string[]) {
            if (typeof field === 'string' && !collInfo.fields.includes(field)) {
              issues.push({
                level: 'warn',
                path: `trigger.changed`,
                message: `watched field "${field}" not found in collection "${trigger.collection}"`,
              });
            }
          }
        }
      }
      break;
    }

    case 'schedule': {
      // Must have either cron or dateField config
      const hasMode = trigger.mode !== undefined;
      const hasCron = typeof trigger.cron === 'string';
      const hasStartsOn = trigger.startsOn !== undefined;
      const hasCollection = typeof trigger.collection === 'string';

      if (!hasMode && !hasCron && !hasStartsOn) {
        issues.push({
          level: 'error',
          path: 'trigger',
          message: 'schedule trigger requires mode (0=cron, 1=dateField) or cron/startsOn config',
        });
      }

      // mode=0 (cron) should have cron expression
      if (Number(trigger.mode) === 0 && !hasCron) {
        issues.push({
          level: 'warn',
          path: 'trigger.cron',
          message: 'schedule cron mode (mode=0) should have a cron expression',
        });
      }

      // mode=1 (dateField) should have collection + startsOn
      if (Number(trigger.mode) === 1) {
        if (!hasCollection) {
          issues.push({
            level: 'error',
            path: 'trigger.collection',
            message: 'schedule dateField mode (mode=1) requires a collection',
          });
        }
        if (!hasStartsOn) {
          issues.push({
            level: 'warn',
            path: 'trigger.startsOn',
            message: 'schedule dateField mode (mode=1) should have startsOn config',
          });
        }
      }
      break;
    }

    case 'action': {
      // Action trigger — minimal validation, config is flexible
      break;
    }
  }
}

// ── Node validation ──

function validateNode(
  name: string,
  nodeSpec: NodeSpec,
  issues: ValidationIssue[],
  collections?: Record<string, { fields: string[] }>,
): void {
  const prefix = `nodes.${name}`;

  // Type is required
  if (!nodeSpec.type || typeof nodeSpec.type !== 'string') {
    issues.push({
      level: 'error',
      path: `${prefix}.type`,
      message: `node "${name}" must have a type`,
    });
  } else if (!KNOWN_NODE_TYPES.has(nodeSpec.type)) {
    issues.push({
      level: 'warn',
      path: `${prefix}.type`,
      message: `node "${name}" has unknown type "${nodeSpec.type}" (may be a plugin-provided type)`,
    });
  }

  // Config is required
  if (!nodeSpec.config || typeof nodeSpec.config !== 'object') {
    // Allow $ref configs (they'll be resolved at deploy time)
    if (!nodeSpec.config || !('$ref' in (nodeSpec.config as Record<string, unknown> || {}))) {
      issues.push({
        level: 'error',
        path: `${prefix}.config`,
        message: `node "${name}" must have a config object`,
      });
    }
  }

  // Type-specific validation
  if (nodeSpec.type && nodeSpec.config && typeof nodeSpec.config === 'object') {
    const config = nodeSpec.config as Record<string, unknown>;

    // Skip $ref configs (can't validate without resolving)
    if ('$ref' in config) return;

    // create/update/destroy/query must reference a collection
    if (COLLECTION_NODE_TYPES.has(nodeSpec.type)) {
      const coll = extractCollectionFromConfig(config);
      if (!coll) {
        issues.push({
          level: 'warn',
          path: `${prefix}.config.collection`,
          message: `${nodeSpec.type} node "${name}" should specify a target collection`,
        });
      } else if (collections && !collections[coll]) {
        issues.push({
          level: 'warn',
          path: `${prefix}.config.collection`,
          message: `node "${name}" references unknown collection "${coll}"`,
        });
      } else if (collections && coll && collections[coll]) {
        // Validate field references
        const fields = extractFieldsFromConfig(config);
        const collInfo = collections[coll];
        for (const field of fields) {
          // Skip variable references — they're validated separately
          if (field.includes('{{')) continue;
          if (!collInfo.fields.includes(field)) {
            issues.push({
              level: 'warn',
              path: `${prefix}.config`,
              message: `node "${name}" references field "${field}" not found in collection "${coll}"`,
            });
          }
        }
      }
    }
  }
}

// ── Variable validation ──

function validateVariables(
  spec: WorkflowSpec,
  issues: ValidationIssue[],
): void {
  const nodeNames = new Set(Object.keys(spec.nodes));

  for (const [name, nodeSpec] of Object.entries(spec.nodes)) {
    if (!nodeSpec.config || typeof nodeSpec.config !== 'object') continue;
    if ('$ref' in (nodeSpec.config as Record<string, unknown>)) continue;

    const vars = extractVariables(nodeSpec.config);

    for (const v of vars) {
      const expr = v.expression;

      // Check $context.data references are syntactically valid
      if (expr.startsWith('$context.')) {
        // $context.data.xxx — should have at least one field after data
        if (expr.startsWith('$context.data') && expr === '$context.data') {
          // bare $context.data is ok (references the whole record)
        } else if (expr.startsWith('$context.') && !expr.startsWith('$context.data')) {
          // Other $context sub-paths are valid but unusual
          issues.push({
            level: 'warn',
            path: `nodes.${name}.config`,
            message: `unusual variable reference "${v.raw}" — expected $context.data.xxx`,
          });
        }
      }

      // Check $jobsMapByNodeKey references point to valid node names
      if (expr.startsWith('$jobsMapByNodeKey.')) {
        const parts = expr.split('.');
        if (parts.length >= 2) {
          const referencedNode = parts[1];
          if (!nodeNames.has(referencedNode)) {
            issues.push({
              level: 'warn',
              path: `nodes.${name}.config`,
              message: `variable "${v.raw}" references node "${referencedNode}" which does not exist in nodes map`,
            });
          }
        }
      }

      // Check $scopes references point to valid node names
      if (expr.startsWith('$scopes.')) {
        const parts = expr.split('.');
        if (parts.length >= 2) {
          const referencedNode = parts[1];
          if (!nodeNames.has(referencedNode)) {
            issues.push({
              level: 'warn',
              path: `nodes.${name}.config`,
              message: `variable "${v.raw}" references scope node "${referencedNode}" which does not exist in nodes map`,
            });
          }
        }
      }

      // Check for obviously broken variable syntax
      if (expr.includes('{{') || expr.includes('}}')) {
        issues.push({
          level: 'error',
          path: `nodes.${name}.config`,
          message: `malformed variable "${v.raw}" contains nested braces`,
        });
      }
    }
  }
}

// ── Graph structure validation ──

function validateGraphStructure(
  spec: WorkflowSpec,
  issues: ValidationIssue[],
): void {
  const graphInfo = parseGraphForValidation(spec.graph);
  const nodeNames = new Set(Object.keys(spec.nodes));

  // 1. Check chain head exists
  if (!graphInfo.chainHead) {
    issues.push({
      level: 'error',
      path: 'graph',
      message: 'graph must have a chain head (a bare node name as the first entry)',
    });
  } else if (!nodeNames.has(graphInfo.chainHead)) {
    issues.push({
      level: 'error',
      path: 'graph',
      message: `chain head "${graphInfo.chainHead}" is not defined in nodes map`,
    });
  }

  // 2. Check all graph node references exist in nodes map
  for (const graphNode of graphInfo.allGraphNodes) {
    if (!nodeNames.has(graphNode)) {
      issues.push({
        level: 'error',
        path: 'graph',
        message: `graph references node "${graphNode}" which is not defined in nodes map`,
      });
    }
  }

  // 3. Check for orphan nodes (defined in nodes but not referenced in graph)
  for (const nodeName of nodeNames) {
    if (!graphInfo.allGraphNodes.has(nodeName)) {
      issues.push({
        level: 'warn',
        path: `nodes.${nodeName}`,
        message: `node "${nodeName}" is defined but not referenced in graph — it will be unreachable`,
      });
    }
  }

  // 4. Check for nodes that are only targets but never sources or chain head
  //    (leaf nodes are fine, but nodes that are sources but not targets and not chain head are suspicious)
  for (const source of graphInfo.edgeSources) {
    if (source !== graphInfo.chainHead && !graphInfo.edgeTargets.has(source)) {
      issues.push({
        level: 'warn',
        path: 'graph',
        message: `node "${source}" appears as edge source but is never a target of any edge and is not the chain head — possible graph disconnect`,
      });
    }
  }

  // 5. Validate branching nodes have branches in graph
  for (const [name, nodeSpec] of Object.entries(spec.nodes)) {
    if (BRANCHING_NODE_TYPES.has(nodeSpec.type)) {
      const hasBranches = graphInfo.edges.some(e => e.source === name && e.label);
      if (!hasBranches) {
        issues.push({
          level: 'warn',
          path: `nodes.${name}`,
          message: `condition node "${name}" has no branch edges in graph (expected --> [yes]/[no] edges)`,
        });
      }
    }
  }
}

// ── Utility: format validation result for logging ──

export function formatValidationResult(
  result: WorkflowValidationResult,
  workflowTitle?: string,
): string {
  if (!result.errors.length) {
    return workflowTitle
      ? `  ✓ ${workflowTitle}: validation passed`
      : '  ✓ validation passed';
  }

  const prefix = workflowTitle ? `  ${workflowTitle}:` : ' ';
  const lines: string[] = [];

  const errors = result.errors.filter(e => e.level === 'error');
  const warnings = result.errors.filter(e => e.level === 'warn');

  if (errors.length) {
    lines.push(`${prefix} ${errors.length} error(s):`);
    for (const e of errors) {
      lines.push(`    ✗ [${e.path}] ${e.message}`);
    }
  }

  if (warnings.length) {
    lines.push(`${prefix} ${warnings.length} warning(s):`);
    for (const w of warnings) {
      lines.push(`    ⚠ [${w.path}] ${w.message}`);
    }
  }

  return lines.join('\n');
}
