/**
 * Workflow DSL types — workflow.yaml spec and API response shapes.
 *
 * Follows the design in docs/workflow-dsl-design.md:
 * - WorkflowSpec is the top-level YAML structure (human-authored or exported)
 * - NodeSpec describes a single node in the `nodes` map
 * - API types mirror NocoBase's workflows:list and flow_nodes:list responses
 */

// ── YAML DSL types ──

export interface WorkflowSpec {
  title: string;
  type: string;                         // trigger type: collection, schedule, action, etc.
  /**
   * Source NB-runtime key — captured at pull time, becomes the DSL identity
   * for cross-references (page actions' `workflowKey:` use this value).
   * Deploy maps `spec.key → state.key` to rewrite references when the
   * runtime key changes (e.g. duplicate-project creates a fresh workflow).
   */
  key?: string;
  sync?: boolean;
  enabled?: boolean;
  description?: string;
  options?: Record<string, unknown>;
  trigger: Record<string, unknown>;     // trigger config (varies by type)
  graph: string[];                      // Mermaid-inspired flow graph
  nodes: Record<string, NodeSpec>;      // human-readable name → node definition
}

export interface NodeSpec {
  type: string;
  title?: string;
  config: Record<string, unknown>;
  branches?: Record<string, NodeSpec[]>;  // only used in nested YAML output format
}

// ── Workflow state (mapping DSL names ↔ runtime IDs/keys) ──

export interface WorkflowNodeState {
  id: number;
  key: string;
}

export interface WorkflowState {
  id: number;
  key: string;
  version?: number;
  nodes: Record<string, WorkflowNodeState>;   // dslName → { id, key }
}

export interface WorkflowStateFile {
  workflows: Record<string, WorkflowState>;   // slugified workflow title → state
}

// ── NocoBase API response types ──

export interface ApiWorkflow {
  id: number;
  key: string;
  type: string;
  title: string;
  description?: string;
  config: Record<string, unknown>;
  sync: boolean;
  enabled: boolean;
  current: boolean;
  options?: Record<string, unknown>;
  allExecuted?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiFlowNode {
  id: number;
  key: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  workflowId: number;
  upstreamId: number | null;
  downstreamId: number | null;
  branchIndex: number | null;
}

// ── Internal types for graph building ──

export interface GraphEdge {
  source: string;           // DSL node name
  target: string;           // DSL node name
  branchLabel?: string;     // e.g. 'yes', 'no', '1', 'body'
}
