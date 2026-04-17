/**
 * Workflow exporter — reads workflows from NocoBase API, writes YAML files.
 *
 * For each workflow:
 * 1. Fetch workflow metadata + nodes from API
 * 2. Reconstruct linked-list graph from upstreamId/downstreamId/branchIndex
 * 3. Generate human-readable node names (slugified titles, deduped)
 * 4. Rewrite variable references: random keys → DSL names
 * 5. Emit Mermaid-inspired graph section + flat nodes map
 * 6. Write to workflows/<slug>/workflow.yaml + optional components/
 *
 * See docs/workflow-dsl-design.md for the full format spec.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import { slugify } from '../utils/slugify';
import { dumpYaml, saveYaml } from '../utils/yaml';
import { validateWorkflow, formatValidationResult } from './validator';
import type {
  ApiWorkflow,
  ApiFlowNode,
  WorkflowSpec,
  NodeSpec,
  GraphEdge,
  WorkflowState,
  WorkflowStateFile,
} from './types';

// ── Branch label mapping (branchIndex → human label) ──

const CONDITION_LABELS: Record<number, string> = { 1: 'yes', 0: 'no' };
const APPROVAL_LABELS: Record<number, string> = { 2: 'approved', '-1': 'rejected', 1: 'returned' };
const LOOP_LABELS: Record<number, string> = { 0: 'body' };

function branchLabel(parentType: string, branchIndex: number): string {
  switch (parentType) {
    case 'condition':
      return CONDITION_LABELS[branchIndex] ?? String(branchIndex);
    case 'approval':
      return APPROVAL_LABELS[branchIndex] ?? String(branchIndex);
    case 'loop':
      return LOOP_LABELS[branchIndex] ?? String(branchIndex);
    case 'parallel':
    case 'multi-conditions':
      return String(branchIndex);
    default:
      return String(branchIndex);
  }
}

// ── Name generation ──

function generateNodeName(title: string, usedNames: Set<string>): string {
  let base = slugify(title || 'node');
  if (!base) base = 'node';
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}_${suffix}`;
    suffix++;
  }
  usedNames.add(name);
  return name;
}

// ── Variable rewriting: random keys → DSL names ──

/**
 * Replace `{{$jobsMapByNodeKey.<realKey>...}}` and `{{$scopes.<realKey>...}}`
 * with human-readable DSL names throughout a JSON-serializable value.
 */
function rewriteVariables(
  value: unknown,
  keyToName: Map<string, string>,
): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const [realKey, dslName] of keyToName) {
      // Replace in $jobsMapByNodeKey references
      result = result.replaceAll(
        `$jobsMapByNodeKey.${realKey}`,
        `$jobsMapByNodeKey.${dslName}`,
      );
      // Replace in $scopes references
      result = result.replaceAll(
        `$scopes.${realKey}`,
        `$scopes.${dslName}`,
      );
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(v => rewriteVariables(v, keyToName));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteVariables(v, keyToName);
    }
    return out;
  }
  return value;
}

// ── Graph reconstruction ──

interface NodeInfo {
  node: ApiFlowNode;
  dslName: string;
  children: { node: ApiFlowNode; branchIndex: number }[];  // branch children
  downstream: ApiFlowNode | null;                            // main-chain next
}

function buildNodeMap(nodes: ApiFlowNode[]): Map<number, ApiFlowNode> {
  const map = new Map<number, ApiFlowNode>();
  for (const n of nodes) {
    map.set(n.id, n);
  }
  return map;
}

function findChainHead(nodes: ApiFlowNode[]): ApiFlowNode | null {
  return nodes.find(n => n.upstreamId === null && n.branchIndex === null) ?? null;
}

/**
 * Walk the linked list starting from `head`, collecting graph edges and visiting branches.
 * Returns edges in topological order.
 */
function walkChain(
  head: ApiFlowNode,
  nodeMap: Map<number, ApiFlowNode>,
  allNodes: ApiFlowNode[],
  idToName: Map<number, string>,
  edges: GraphEdge[],
  visited: Set<number>,
): void {
  let current: ApiFlowNode | null = head;

  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);

    const name = idToName.get(current.id)!;

    // Find branch children (nodes whose upstreamId = current.id AND branchIndex != null)
    const branchChildren = allNodes.filter(
      n => n.upstreamId === current!.id && n.branchIndex !== null,
    );
    branchChildren.sort((a, b) => (b.branchIndex ?? 0) - (a.branchIndex ?? 0));

    for (const child of branchChildren) {
      const childName = idToName.get(child.id)!;
      const label = branchLabel(current.type, child.branchIndex!);
      edges.push({ source: name, target: childName, branchLabel: label });
      // Recurse into the branch
      walkChain(child, nodeMap, allNodes, idToName, edges, visited);
    }

    // Follow the main chain (downstream)
    const next: ApiFlowNode | null = current.downstreamId ? nodeMap.get(current.downstreamId) ?? null : null;
    if (next && !visited.has(next.id)) {
      edges.push({ source: name, target: idToName.get(next.id)! });
    }

    current = next;
  }
}

/**
 * Build the graph lines from edges.
 * First line is the bare chain head, then arrows for each edge.
 */
function buildGraphLines(chainHeadName: string, edges: GraphEdge[]): string[] {
  const lines: string[] = [chainHeadName];
  for (const e of edges) {
    if (e.branchLabel) {
      lines.push(`${e.source} --> [${e.branchLabel}] ${e.target}`);
    } else {
      lines.push(`${e.source} --> ${e.target}`);
    }
  }
  return lines;
}

// ── Large config extraction ──

const LARGE_CONFIG_THRESHOLD = 50;  // lines when serialized

function isLargeConfig(config: Record<string, unknown>): boolean {
  const serialized = dumpYaml(config);
  return serialized.split('\n').length > LARGE_CONFIG_THRESHOLD;
}

// ── Main export function ──

export interface ExportWorkflowsOptions {
  outDir: string;
  filter?: {
    enabled?: boolean;
    type?: string;
    titlePattern?: string;
  };
  log?: (msg: string) => void;
}

/**
 * Export all workflows from a NocoBase instance to YAML files.
 *
 * Output structure:
 *   outDir/
 *     workflow-state.yaml              # key registry
 *     <slug>/
 *       workflow.yaml                  # main definition
 *       components/                    # extracted large configs (if any)
 *         <node_name>.yaml
 */
export async function exportWorkflows(
  nb: NocoBaseClient,
  opts: ExportWorkflowsOptions,
): Promise<WorkflowStateFile> {
  const log = opts.log ?? console.log.bind(console);
  const outDir = path.resolve(opts.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  // 1. List all current-version workflows
  const wfResp = await nb.http.get(`${nb.baseUrl}/api/workflows:list`, {
    params: {
      filter: { current: true },
      paginate: false,
    },
  });
  let workflows = (wfResp.data?.data ?? []) as ApiWorkflow[];

  // Apply filters
  if (opts.filter?.enabled !== undefined) {
    workflows = workflows.filter(w => w.enabled === opts.filter!.enabled);
  }
  if (opts.filter?.type) {
    workflows = workflows.filter(w => w.type === opts.filter!.type);
  }
  if (opts.filter?.titlePattern) {
    const re = new RegExp(opts.filter.titlePattern, 'i');
    workflows = workflows.filter(w => re.test(w.title));
  }

  log(`  Found ${workflows.length} workflow(s) to export`);

  const stateFile: WorkflowStateFile = { workflows: {} };

  for (const wf of workflows) {
    const result = await exportSingleWorkflow(nb, wf, outDir, log);
    if (result) {
      stateFile.workflows[result.slug] = result.state;

      // Post-export validation: warn about potential issues in exported YAML
      if (result.spec) {
        const validation = validateWorkflow(result.spec);
        if (validation.errors.length) {
          log(formatValidationResult(validation, wf.title));
        }
      }
    }
  }

  // Write state file
  saveYaml(path.join(outDir, 'workflow-state.yaml'), stateFile);
  log(`  + workflow-state.yaml`);

  return stateFile;
}

/**
 * Export a single workflow. Returns slug + state, or null if the workflow has no nodes.
 */
async function exportSingleWorkflow(
  nb: NocoBaseClient,
  wf: ApiWorkflow,
  outDir: string,
  log: (msg: string) => void,
): Promise<{ slug: string; state: WorkflowState; spec: WorkflowSpec } | null> {
  // Fetch nodes
  const nodeResp = await nb.http.get(`${nb.baseUrl}/api/workflows/${wf.id}/nodes:list`, {
    params: {
      sort: ['id'],
      paginate: false,
    },
  });
  const apiNodes = (nodeResp.data?.data ?? []) as ApiFlowNode[];

  const slug = slugify(wf.title);
  const wfDir = path.join(outDir, slug);
  fs.mkdirSync(wfDir, { recursive: true });

  // Generate DSL names for each node
  const usedNames = new Set<string>();
  const idToName = new Map<number, string>();
  const keyToName = new Map<string, string>();
  const nameToNode = new Map<string, ApiFlowNode>();

  for (const n of apiNodes) {
    const name = generateNodeName(n.title, usedNames);
    idToName.set(n.id, name);
    keyToName.set(n.key, name);
    nameToNode.set(name, n);
  }

  // Build graph
  const nodeMap = buildNodeMap(apiNodes);
  const chainHead = findChainHead(apiNodes);
  const edges: GraphEdge[] = [];
  const visited = new Set<number>();

  if (chainHead) {
    walkChain(chainHead, nodeMap, apiNodes, idToName, edges, visited);
  }

  // Handle orphaned nodes (not reachable from chain head) — walk branch starters
  for (const n of apiNodes) {
    if (!visited.has(n.id)) {
      walkChain(n, nodeMap, apiNodes, idToName, edges, visited);
    }
  }

  // Build graph lines
  const chainHeadName = chainHead ? idToName.get(chainHead.id)! : '';
  const graphLines = chainHeadName ? buildGraphLines(chainHeadName, edges) : [];

  // Build nodes map with rewritten variables
  const nodesMap: Record<string, NodeSpec> = {};
  const componentsDir = path.join(wfDir, 'components');

  for (const [name, apiNode] of nameToNode) {
    const rewrittenConfig = rewriteVariables(apiNode.config, keyToName) as Record<string, unknown>;

    const nodeSpec: NodeSpec = {
      type: apiNode.type,
      title: apiNode.title,
      config: rewrittenConfig,
    };

    // Extract large configs to components/
    if (isLargeConfig(rewrittenConfig)) {
      fs.mkdirSync(componentsDir, { recursive: true });
      saveYaml(path.join(componentsDir, `${name}.yaml`), rewrittenConfig);
      nodeSpec.config = { $ref: `components/${name}.yaml` } as unknown as Record<string, unknown>;
    }

    nodesMap[name] = nodeSpec;
  }

  // Build workflow spec
  const spec: WorkflowSpec = {
    title: wf.title,
    type: wf.type,
    enabled: wf.enabled,
    ...(wf.sync ? { sync: wf.sync } : {}),
    ...(wf.description ? { description: wf.description } : {}),
    ...(wf.options && Object.keys(wf.options).length ? { options: wf.options } : {}),
    trigger: wf.config,
    graph: graphLines,
    nodes: nodesMap,
  };

  // Write workflow.yaml
  saveYaml(path.join(wfDir, 'workflow.yaml'), spec);

  // Clean empty components dir
  try {
    if (fs.existsSync(componentsDir) && !fs.readdirSync(componentsDir).length) {
      fs.rmdirSync(componentsDir);
    }
  } catch { /* skip */ }

  const nodeCount = apiNodes.length;
  log(`  + ${slug}: ${nodeCount} node(s), type=${wf.type}, enabled=${wf.enabled}`);

  // Build state
  const nodeStates: Record<string, { id: number; key: string }> = {};
  for (const [name, apiNode] of nameToNode) {
    nodeStates[name] = { id: apiNode.id, key: apiNode.key };
  }

  const state: WorkflowState = {
    id: wf.id,
    key: wf.key,
    nodes: nodeStates,
  };

  return { slug, state, spec };
}
