/**
 * Stub graph builder — satisfies project-deployer imports.
 */

export interface GraphNode {
  id: string;
  type: string;
  meta?: Record<string, unknown>;
}

export interface GraphBuilder {
  stats: () => { nodes: number; edges: number; cycles: number };
  pageRefs: (pageId: string) => Record<string, unknown>;
  nodes: Map<string, GraphNode>;
  toJSON: () => Record<string, unknown>;
}

export function buildGraph(root: string): GraphBuilder {
  return {
    stats: () => ({ nodes: 0, edges: 0, cycles: 0 }),
    pageRefs: () => ({}),
    nodes: new Map(),
    toJSON: () => ({}),
  };
}
