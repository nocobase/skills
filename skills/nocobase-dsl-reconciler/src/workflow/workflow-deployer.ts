/**
 * Workflow deployer — reads YAML workflow specs and deploys to NocoBase.
 *
 * Idempotent: running twice produces the same result.
 * - New workflows: create shell → create nodes in topological order → enable
 * - Existing workflows (matched by title): revision-if-frozen → update trigger
 *   config + upsert nodes
 *
 * Format + authoring guide: see ./DSL.md
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import { loadYaml, saveYaml } from '../utils/yaml';
import { validateWorkflow, formatValidationResult } from './validator';
import { applySpecDefaults, applyNodeDefaults } from './normalize';
import type {
  WorkflowSpec,
  NodeSpec,
  ApiWorkflow,
  ApiFlowNode,
  WorkflowState,
  WorkflowStateFile,
} from './types';

// ── Graph parsing ──

/** Branch label → branchIndex */
const LABEL_TO_INDEX: Record<string, number> = {
  yes: 1, true: 1,
  no: 0, false: 0,
  otherwise: 0, default: 0,
  body: 0, loop: 0,
  approved: 2,
  rejected: -1,
  returned: 1,
};

function resolveBranchIndex(label: string): number {
  const lower = label.toLowerCase();
  return LABEL_TO_INDEX[lower] ?? Number(label);
}

interface ParsedEdge {
  source: string;
  target: string;
  branchIndex: number | null;
}

/**
 * Parse the graph section into edges with resolved branchIndex.
 * Returns { edges, chainHead } where chainHead is the first bare name.
 */
function parseGraph(graphLines: string[]): { edges: ParsedEdge[]; chainHead: string } {
  let chainHead = '';
  const edges: ParsedEdge[] = [];

  for (const line of graphLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Arrow pattern: source --> [label] target  OR  source --> target
    const arrowMatch = trimmed.match(/^(\S+)\s*-->\s*(?:\[([^\]]+)\]\s*)?(\S+)$/);
    if (arrowMatch) {
      const [, source, label, target] = arrowMatch;
      const branchIndex = label !== undefined ? resolveBranchIndex(label) : null;
      edges.push({ source, target, branchIndex });
    } else if (!trimmed.includes('-->')) {
      // Bare name — chain head
      if (!chainHead) {
        chainHead = trimmed;
      }
    }
  }

  return { edges, chainHead };
}

/**
 * Topological sort of node names based on graph edges.
 * Ensures that every node's upstream is created before it.
 * Returns names in creation order.
 */
function topologicalSort(
  chainHead: string,
  edges: ParsedEdge[],
  nodeNames: string[],
): string[] {
  const nameSet = new Set(nodeNames);
  const order: string[] = [];
  const visited = new Set<string>();

  // Build adjacency: source → [target]
  const adj = new Map<string, { target: string; branchIndex: number | null }[]>();
  for (const e of edges) {
    let list = adj.get(e.source);
    if (!list) {
      list = [];
      adj.set(e.source, list);
    }
    list.push({ target: e.target, branchIndex: e.branchIndex });
  }

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    order.push(name);

    // Visit main-chain targets first (branchIndex === null), then branches
    const children = adj.get(name) ?? [];
    const mainChain = children.filter(c => c.branchIndex === null);
    const branches = children.filter(c => c.branchIndex !== null);

    // Branches first so their chains are created before the main-chain downstream
    for (const b of branches) {
      visit(b.target);
    }
    for (const m of mainChain) {
      visit(m.target);
    }
  }

  // Start from chain head
  if (chainHead && nameSet.has(chainHead)) {
    visit(chainHead);
  }

  // Handle any orphans
  for (const name of nodeNames) {
    if (!visited.has(name)) {
      visit(name);
    }
  }

  return order;
}

// ── Variable rewriting: DSL names → real keys ──

function rewriteVariablesToKeys(
  value: unknown,
  nameToKey: Map<string, string>,
): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const [dslName, realKey] of nameToKey) {
      result = result.replaceAll(
        `$jobsMapByNodeKey.${dslName}`,
        `$jobsMapByNodeKey.${realKey}`,
      );
      result = result.replaceAll(
        `$scopes.${dslName}`,
        `$scopes.${realKey}`,
      );
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(v => rewriteVariablesToKeys(v, nameToKey));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteVariablesToKeys(v, nameToKey);
    }
    return out;
  }
  return value;
}

// ── Config resolution ($ref) ──

function resolveConfig(
  nodeSpec: NodeSpec,
  wfDir: string,
): Record<string, unknown> {
  const config = nodeSpec.config;
  if (config && typeof config === 'object' && '$ref' in config) {
    const refPath = config.$ref as string;
    const fullPath = path.resolve(wfDir, refPath);
    if (fs.existsSync(fullPath)) {
      const loaded = loadYaml<Record<string, unknown>>(fullPath);
      // $ref contents bypass the earlier applySpecDefaults pass; re-apply
      // node-type defaults here so refactored-into-$ref specs still deploy
      // with the same boilerplate fill-in as inline specs.
      const normalized = applyNodeDefaults({ ...nodeSpec, config: loaded });
      return normalized.config;
    }
  }
  return config;
}

// ── Deploy functions ──

export interface DeployWorkflowsOptions {
  log?: (msg: string) => void;
  /** Skip pre-deploy validation (not recommended) */
  skipValidation?: boolean;
  /** Collection metadata for field-level validation */
  collections?: Record<string, { fields: string[] }>;
}

/**
 * Deploy all workflows found in projectDir/workflows/ to NocoBase.
 *
 * Reads workflow.yaml files, creates/updates workflows and nodes,
 * writes back workflow-state.yaml for state tracking.
 */
/**
 * Re-export the canonical WorkflowKeyMap type so workflow callers don't have
 * to reach into deploy/. Definition lives with the rewrite helper that
 * actually consumes it.
 */
export type { WorkflowKeyMap } from '../deploy/rewrite-workflow-keys';
import type { WorkflowKeyMap } from '../deploy/rewrite-workflow-keys';

export async function deployWorkflows(
  nb: NocoBaseClient,
  projectDir: string,
  opts: DeployWorkflowsOptions = {},
): Promise<WorkflowKeyMap> {
  const log = opts.log ?? console.log.bind(console);
  const wfBaseDir = path.join(projectDir, 'workflows');
  const keyMap: WorkflowKeyMap = new Map();

  if (!fs.existsSync(wfBaseDir)) {
    log('  No workflows/ directory found, skipping workflow deploy');
    return keyMap;
  }

  // Find all workflow.yaml files
  const entries = fs.readdirSync(wfBaseDir, { withFileTypes: true });
  const wfDirs = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => fs.existsSync(path.join(wfBaseDir, name, 'workflow.yaml')));

  if (!wfDirs.length) {
    log('  No workflow.yaml files found');
    return keyMap;
  }

  // Load existing state if any
  const stateFilePath = path.join(wfBaseDir, 'workflow-state.yaml');
  let stateFile: WorkflowStateFile = { workflows: {} };
  if (fs.existsSync(stateFilePath)) {
    stateFile = loadYaml<WorkflowStateFile>(stateFilePath);
  }

  // Fetch existing workflows for matching by title. Pull versionStats so the
  // deployer can detect frozen versions (executed > 0) and revision them.
  // The workflow row's own `executed` column is usually in sync with
  // versionStats.executed, but we append versionStats to match upstream's
  // documented convention.
  const existingResp = await nb.http.get(`${nb.baseUrl}/api/workflows:list`, {
    params: { filter: { current: true }, paginate: false, appends: ['versionStats'] },
  });
  const existingWfs = (existingResp.data?.data ?? []) as ApiWorkflow[];
  const titleToExisting = new Map<string, ApiWorkflow>();
  for (const wf of existingWfs) {
    titleToExisting.set(wf.title, wf);
  }

  log(`  Deploying ${wfDirs.length} workflow(s)...`);

  // Pre-deploy validation (unless skipped)
  if (!opts.skipValidation) {
    let hasErrors = false;
    for (const slug of wfDirs) {
      const wfDir = path.join(wfBaseDir, slug);
      const spec = loadYaml<WorkflowSpec>(path.join(wfDir, 'workflow.yaml'));
      const result = validateWorkflow(spec, opts.collections);

      if (result.errors.length) {
        log(formatValidationResult(result, spec.title));
      }
      if (!result.valid) {
        hasErrors = true;
      }
    }
    if (hasErrors) {
      throw new Error('Workflow validation failed — fix errors above before deploying');
    }
  }

  for (const slug of wfDirs) {
    const wfDir = path.join(wfBaseDir, slug);
    const rawSpec = loadYaml<WorkflowSpec>(path.join(wfDir, 'workflow.yaml'));
    // Expand user-minimal spec into full NB shape (boilerplate defaults filled).
    // User-provided keys always win.
    const spec = applySpecDefaults(rawSpec);

    // Wrap per-workflow so one bad workflow (e.g. dangling approvalUid,
    // unknown trigger type) doesn't tank the remaining 9 — we still want
    // the keymap built for whatever DOES deploy, and we want page deploy
    // to proceed.
    try {
      const state = await deploySingleWorkflow(
        nb, spec, wfDir, slug, titleToExisting, stateFile.workflows[slug], log,
      );
      stateFile.workflows[slug] = state;

      // Build cross-reference map: spec.key (DSL identity) → state.key (live NB
      // key). Identity for source CRM redeploys; rewrite-only for Copy pushes
      // where source key carries through but Copy gets a fresh key.
      if (spec.key && state.key) {
        keyMap.set(spec.key, state.key);
      }
    } catch (e) {
      log(`  ✗ ${slug}: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
    }
  }

  // Write updated state
  saveYaml(stateFilePath, stateFile);
  log(`  + workflow-state.yaml updated`);
  return keyMap;
}

/**
 * Deploy a single workflow spec to NocoBase.
 * Idempotent: matches existing workflow by title, creates if new.
 */
async function deploySingleWorkflow(
  nb: NocoBaseClient,
  spec: WorkflowSpec,
  wfDir: string,
  slug: string,
  titleToExisting: Map<string, ApiWorkflow>,
  existingState: WorkflowState | undefined,
  log: (msg: string) => void,
): Promise<WorkflowState> {
  // Deploy approval-style UI subtrees from ui/*.yaml BEFORE saving the
  // workflow. After duplicate-project, workflow.config.approvalUid /
  // taskCardUid point at NEW UIDs that don't exist on NB yet — we have
  // to create those FlowModel trees first or the workflow's references
  // dangle. No-op when no ui/ dir exists (= non-approval workflow or
  // workflows authored before this feature).
  const uiDeployed = await deployApprovalUIs(nb, wfDir, log);
  if (uiDeployed) log(`    deployed ${uiDeployed} approval UI node(s) from ui/`);

  let existing = titleToExisting.get(spec.title);

  // Revision guard — frozen versions (executed > 0) can't be mutated in place.
  // NB's workflows:revision clones the workflow + nodes into a new row with the
  // same `key`; passing body `{current: true}` flips `current` atomically so the
  // new version becomes the live one (old becomes disabled + current=false).
  // Without `current: true`, the new row stays inactive and the old keeps
  // serving — which means every subsequent push would re-revision the same old
  // frozen row, multiplying versions.
  // versionStats and the workflow row's own `executed` column are normally in
  // sync; fall back to the row value if versionStats is missing (older NB
  // versions, or an append that didn't resolve).
  const executedCount = existing?.versionStats?.executed ?? (existing as { executed?: number } | undefined)?.executed ?? 0;
  if (existing && executedCount > 0) {
    const revResp = await nb.http.post(`${nb.baseUrl}/api/workflows:revision`, { current: true }, {
      params: { filterByTk: existing.id, filter: { key: existing.key } },
    });
    const revived = revResp.data?.data;
    if (!revived?.id) {
      throw new Error(`Failed to revision frozen workflow "${spec.title}" (${existing.id})`);
    }
    log(`  * ${slug}: frozen (executed=${executedCount}) — created revision #${revived.id} (now current)`);
    // The new revision shares the same key; operate on it instead of the old row.
    existing = { ...existing, id: revived.id, key: revived.key ?? existing.key, versionStats: { executed: 0 } };
  }

  let workflowId: number;
  let workflowKey: string;

  if (existing) {
    // Update existing workflow trigger config
    workflowId = existing.id;
    workflowKey = existing.key;

    await nb.http.post(`${nb.baseUrl}/api/workflows:update`, {
      title: spec.title,
      config: spec.trigger,
      sync: spec.sync ?? false,
      ...(spec.description !== undefined ? { description: spec.description } : {}),
      ...(spec.options ? { options: spec.options } : {}),
    }, {
      params: { filterByTk: existing.id },
    });
    log(`  ~ ${slug}: updated workflow #${workflowId}`);
  } else {
    // Create new workflow (disabled initially)
    const createResp = await nb.http.post(`${nb.baseUrl}/api/workflows:create`, {
      title: spec.title,
      type: spec.type,
      sync: spec.sync ?? false,
      enabled: false,
      config: spec.trigger,
      ...(spec.description ? { description: spec.description } : {}),
      ...(spec.options ? { options: spec.options } : {}),
    });
    const created = createResp.data?.data;
    if (!created?.id) {
      throw new Error(`Failed to create workflow "${spec.title}"`);
    }
    workflowId = created.id;
    workflowKey = created.key;
    log(`  + ${slug}: created workflow #${workflowId}`);
  }

  // Parse graph to determine creation order and upstream relationships
  const { edges, chainHead } = parseGraph(spec.graph);
  const nodeNames = Object.keys(spec.nodes);
  const creationOrder = topologicalSort(chainHead, edges, nodeNames);

  // Build upstream/branchIndex info from edges.
  // NB's model only allows one upstream per node (linked list + branchIndex),
  // so merge-style graphs ("A -->X; B -->X") can't express rejoin in this
  // DSL. Warn loudly so users route convergence via post-branch nodes instead
  // of silently losing edges.
  const nodeUpstream = new Map<string, { upstream: string; branchIndex: number | null }>();
  const dropped: string[] = [];
  for (const e of edges) {
    if (!nodeUpstream.has(e.target)) {
      nodeUpstream.set(e.target, { upstream: e.source, branchIndex: e.branchIndex });
    } else {
      dropped.push(`${e.source}-->${e.target}`);
    }
  }
  if (dropped.length) {
    log(`  ⚠ ${slug}: merge-point edges dropped (NB has one upstream per node): ${dropped.join(', ')}`);
  }

  // Fetch existing nodes if updating
  let existingNodes: ApiFlowNode[] = [];
  if (existing) {
    const nodesResp = await nb.http.get(`${nb.baseUrl}/api/workflows/${workflowId}/nodes:list`, {
      params: { sort: ['id'], paginate: false },
    });
    existingNodes = (nodesResp.data?.data ?? []) as ApiFlowNode[];
  }
  // Prefer a position-based key so duplicate titles don't collapse. The DSL
  // produces a unique (upstream-title, branchIndex, title) triple per node
  // when the graph is well-formed; fall back to title-only for legacy nodes.
  const existingByPosition = new Map<string, ApiFlowNode>();
  const existingByTitle = new Map<string, ApiFlowNode[]>();
  const existingById = new Map<number, ApiFlowNode>();
  for (const n of existingNodes) existingById.set(n.id, n);
  for (const n of existingNodes) {
    const upTitle = n.upstreamId ? existingById.get(n.upstreamId)?.title ?? '' : '';
    const posKey = `${upTitle}\t${n.branchIndex ?? ''}\t${n.title}`;
    existingByPosition.set(posKey, n);
    const bucket = existingByTitle.get(n.title) ?? [];
    bucket.push(n);
    existingByTitle.set(n.title, bucket);
  }

  // Create/update nodes in topological order
  const nameToId = new Map<string, number>();
  const nameToKey = new Map<string, string>();

  // If we have existing state, pre-populate mappings
  if (existingState?.nodes) {
    for (const [name, ns] of Object.entries(existingState.nodes)) {
      nameToId.set(name, ns.id);
      nameToKey.set(name, ns.key);
    }
  }

  for (const name of creationOrder) {
    const nodeSpec = spec.nodes[name];
    if (!nodeSpec) continue;

    // Resolve $ref configs
    const rawConfig = resolveConfig(nodeSpec, wfDir);

    // Rewrite DSL variable names to real keys (for nodes already created)
    const config = rewriteVariablesToKeys(rawConfig, nameToKey) as Record<string, unknown>;

    // Determine upstream linkage
    const upInfo = nodeUpstream.get(name);
    const upstreamId = upInfo ? (nameToId.get(upInfo.upstream) ?? null) : null;
    const branchIndex = upInfo?.branchIndex ?? null;

    // Match an existing node by (upstream-title, branchIndex, title) so that
    // two nodes sharing a title but on different branches don't collide.
    // Fall back to title-only when the title is unique.
    const title = nodeSpec.title ?? name;
    const upInfoEx = nodeUpstream.get(name);
    const upstreamTitle = upInfoEx
      ? (spec.nodes[upInfoEx.upstream]?.title ?? upInfoEx.upstream)
      : '';
    const posKey = `${upstreamTitle}\t${upInfoEx?.branchIndex ?? ''}\t${title}`;
    const byTitle = existingByTitle.get(title) ?? [];
    const existingNode = existingByPosition.get(posKey)
      ?? (byTitle.length === 1 ? byTitle[0] : undefined);

    if (existingNode) {
      // Update existing node config
      await nb.http.post(`${nb.baseUrl}/api/flow_nodes:update`, {
        config,
        title: nodeSpec.title ?? name,
      }, {
        params: { filterByTk: existingNode.id },
      });
      nameToId.set(name, existingNode.id);
      nameToKey.set(name, existingNode.key);
    } else {
      // Create new node
      const createBody: Record<string, unknown> = {
        type: nodeSpec.type,
        title: nodeSpec.title ?? name,
        config,
        workflowId,
      };
      if (upstreamId !== null) {
        createBody.upstreamId = upstreamId;
      }
      if (branchIndex !== null) {
        createBody.branchIndex = branchIndex;
      }

      const nodeResp = await nb.http.post(
        `${nb.baseUrl}/api/workflows/${workflowId}/nodes:create`,
        createBody,
      );
      const createdNode = nodeResp.data?.data;
      if (!createdNode?.id) {
        throw new Error(`Failed to create node "${name}" in workflow "${spec.title}"`);
      }
      nameToId.set(name, createdNode.id);
      nameToKey.set(name, createdNode.key);
    }
  }

  // Second pass: rewrite variables in all node configs now that all keys are known
  // This handles forward references that couldn't be resolved in the first pass
  for (const name of creationOrder) {
    const nodeSpec = spec.nodes[name];
    if (!nodeSpec) continue;
    const nodeId = nameToId.get(name);
    if (!nodeId) continue;

    const rawConfig = resolveConfig(nodeSpec, wfDir);
    const fullyRewritten = rewriteVariablesToKeys(rawConfig, nameToKey) as Record<string, unknown>;

    // Only update if the config had variable references that might have changed
    const serialized = JSON.stringify(fullyRewritten);
    if (serialized.includes('$jobsMapByNodeKey') || serialized.includes('$scopes')) {
      await nb.http.post(`${nb.baseUrl}/api/flow_nodes:update`, {
        config: fullyRewritten,
      }, {
        params: { filterByTk: nodeId },
      });
    }
  }

  // Enable/disable based on spec
  const targetEnabled = spec.enabled ?? false;
  if (existing) {
    // Only toggle if changed
    if (existing.enabled !== targetEnabled) {
      await nb.http.post(`${nb.baseUrl}/api/workflows:update`, {
        enabled: targetEnabled,
      }, {
        params: { filterByTk: workflowId },
      });
      log(`  ${targetEnabled ? '>' : '||'} ${slug}: ${targetEnabled ? 'enabled' : 'disabled'}`);
    }
  } else if (targetEnabled) {
    await nb.http.post(`${nb.baseUrl}/api/workflows:update`, {
      enabled: true,
    }, {
      params: { filterByTk: workflowId },
    });
    log(`  > ${slug}: enabled`);
  }

  // Build node state
  const nodeStates: Record<string, { id: number; key: string }> = {};
  for (const name of creationOrder) {
    const id = nameToId.get(name);
    const key = nameToKey.get(name);
    if (id !== undefined && key !== undefined) {
      nodeStates[name] = { id, key };
    }
  }

  return {
    id: workflowId,
    key: workflowKey,
    nodes: nodeStates,
  };
}

/**
 * Deploy approval-style UI subtrees to NocoBase before saving the
 * workflow. Walks workflows/<slug>/ui/*.yaml; for each tree, recursively
 * upserts every FlowModel node via flowModels:save preserving the DSL's
 * UIDs (so `workflow.config.approvalUid: <uid>` resolves to the model
 * we just created).
 *
 * Idempotent: re-running upserts the same nodes by uid.
 * Returns the total node count saved across all ui files.
 */
async function deployApprovalUIs(
  nb: NocoBaseClient,
  wfDir: string,
  log: (msg: string) => void,
): Promise<number> {
  const uiDir = path.join(wfDir, 'ui');
  if (!fs.existsSync(uiDir)) return 0;
  const files = fs.readdirSync(uiDir).filter(f => f.endsWith('.yaml'));
  if (!files.length) return 0;

  let total = 0;
  for (const file of files) {
    const tree = loadYaml<Record<string, unknown>>(path.join(uiDir, file));
    if (!tree?.uid) continue;
    try {
      total += await saveFlowModelTree(nb, tree, undefined, log);
    } catch (e) {
      log(`    ✗ ui/${file}: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
    }
  }
  return total;
}

/**
 * Recursively flowModels:save a tree. parentUid threads down so each child
 * gets its parent linkage set. Walks subModels (object or array form).
 */
async function saveFlowModelTree(
  nb: NocoBaseClient,
  node: Record<string, unknown>,
  parentUid: string | undefined,
  log: (msg: string) => void,
): Promise<number> {
  const uid = node.uid as string;
  if (!uid) return 0;

  // findOne tree returns subKey/subType/stepParams/etc. at the TOP level of
  // each node (not under .options) — NB needs them at the same place when
  // we save, otherwise nested children hit a 500 from null subKey.
  const saveData: Record<string, unknown> = {
    uid,
    use: (node.use || '') as string,
    sortIndex: (node.sortIndex ?? 0) as number,
    stepParams: (node.stepParams || {}) as Record<string, unknown>,
    flowRegistry: (node.flowRegistry || {}) as Record<string, unknown>,
  };
  if (node.subKey) saveData.subKey = node.subKey;
  if (node.subType) saveData.subType = node.subType;
  if (parentUid) saveData.parentId = parentUid;

  await nb.models.save(saveData);

  let count = 1;
  const subs = (node.subModels || {}) as Record<string, unknown>;
  for (const childList of Object.values(subs)) {
    if (Array.isArray(childList)) {
      for (const child of childList) {
        if (child && typeof child === 'object') {
          count += await saveFlowModelTree(nb, child as Record<string, unknown>, uid, log);
        }
      }
    } else if (childList && typeof childList === 'object') {
      count += await saveFlowModelTree(nb, childList as Record<string, unknown>, uid, log);
    }
  }
  return count;
}
