/**
 * Project graph — DAG of all entities and their relationships.
 *
 * Nodes: collection, page, block, component (template), field
 * Edges: contains, references, popupTo, usesComponent
 *
 * Used for: circular ref detection, deploy ordering, impact analysis,
 * _refs.yaml generation, AI context hints.
 */

export type NodeType = 'collection' | 'page' | 'block' | 'component' | 'field';

export type EdgeType =
  | 'contains'        // page contains block, block contains field
  | 'references'      // field references collection (m2o/o2m)
  | 'popupTo'         // field click opens popup for collection
  | 'usesComponent'   // block/popup uses a component (template)
  | 'belongsTo'       // block belongs to collection
  | 'dataSource';     // chart/kpi queries collection

export interface GraphNode {
  id: string;          // unique: "collection:nb_crm_leads", "page:leads", "component:activity_view"
  type: NodeType;
  name: string;        // human-readable
  meta?: Record<string, unknown>;  // extra data (coll name, file path, etc.)
}

export interface GraphEdge {
  from: string;        // node id
  to: string;          // node id
  type: EdgeType;
  meta?: Record<string, unknown>;
}

/**
 * In-memory project graph. Build once, query many.
 */
export class ProjectGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private outEdges = new Map<string, GraphEdge[]>();   // from → edges
  private inEdges = new Map<string, GraphEdge[]>();    // to → edges

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
    const out = this.outEdges.get(edge.from) || [];
    out.push(edge);
    this.outEdges.set(edge.from, out);
    const inp = this.inEdges.get(edge.to) || [];
    inp.push(edge);
    this.inEdges.set(edge.to, inp);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /** All edges going out from a node. */
  outgoing(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    const all = this.outEdges.get(nodeId) || [];
    return edgeType ? all.filter(e => e.type === edgeType) : all;
  }

  /** All edges coming into a node. */
  incoming(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    const all = this.inEdges.get(nodeId) || [];
    return edgeType ? all.filter(e => e.type === edgeType) : all;
  }

  /** Detect circular references: collection A → popupTo → B → popupTo → A */
  findCycles(startNode: string, edgeType: EdgeType = 'popupTo'): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[]) => {
      if (path.includes(current)) {
        // Found cycle
        const cycleStart = path.indexOf(current);
        cycles.push(path.slice(cycleStart).concat(current));
        return;
      }
      if (visited.has(current)) return;

      path.push(current);
      for (const edge of this.outgoing(current, edgeType)) {
        dfs(edge.to, [...path]);
      }
      visited.add(current);
    };

    dfs(startNode, []);
    return cycles;
  }

  /** Get all collections reachable from a page via popup chains. */
  popupChain(pageId: string, maxDepth = 5): { collection: string; depth: number; path: string[] }[] {
    const result: { collection: string; depth: number; path: string[] }[] = [];
    const seen = new Set<string>();

    const walk = (nodeId: string, depth: number, path: string[]) => {
      if (depth > maxDepth || seen.has(nodeId)) return;
      seen.add(nodeId);

      for (const edge of this.outgoing(nodeId, 'popupTo')) {
        const target = this.getNode(edge.to);
        if (target) {
          const newPath = [...path, target.name];
          result.push({ collection: target.name, depth, path: newPath });
          walk(edge.to, depth + 1, newPath);
        }
      }
    };

    walk(pageId, 0, []);
    return result;
  }

  /** Impact analysis: what pages/blocks would be affected if a component changes? */
  impactOf(componentId: string): string[] {
    return this.incoming(componentId, 'usesComponent').map(e => e.from);
  }

  /** Get deploy order (topological sort). */
  deployOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) return; // cycle, skip
      visiting.add(nodeId);

      // Visit dependencies first
      for (const edge of this.outgoing(nodeId)) {
        if (['references', 'usesComponent', 'belongsTo'].includes(edge.type)) {
          visit(edge.to);
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      order.push(nodeId);
    };

    for (const nodeId of this.nodes.keys()) {
      visit(nodeId);
    }

    return order;
  }

  /** Stats summary. */
  stats(): { nodes: number; edges: number; collections: number; pages: number; components: number; cycles: number } {
    let cycles = 0;
    const colls = [...this.nodes.values()].filter(n => n.type === 'collection');
    for (const c of colls) {
      const found = this.findCycles(c.id, 'popupTo');
      cycles += found.length;
    }
    return {
      nodes: this.nodes.size,
      edges: this.edges.length,
      collections: colls.length,
      pages: [...this.nodes.values()].filter(n => n.type === 'page').length,
      components: [...this.nodes.values()].filter(n => n.type === 'component').length,
      cycles,
    };
  }

  /** Export as _refs.yaml for a specific page. */
  pageRefs(pageId: string): Record<string, unknown> {
    const page = this.getNode(pageId);
    if (!page) return {};

    // Collections used by this page
    const collections = new Set<string>();
    for (const edge of this.outgoing(pageId)) {
      if (edge.type === 'contains') {
        for (const blockEdge of this.outgoing(edge.to)) {
          if (blockEdge.type === 'belongsTo') {
            collections.add(this.getNode(blockEdge.to)?.name || blockEdge.to);
          }
        }
      }
    }

    // Components used
    const components: string[] = [];
    const walkComponents = (nodeId: string) => {
      for (const edge of this.outgoing(nodeId, 'usesComponent')) {
        const comp = this.getNode(edge.to);
        if (comp) components.push(comp.name);
      }
      for (const edge of this.outgoing(nodeId, 'contains')) {
        walkComponents(edge.to);
      }
    };
    walkComponents(pageId);

    // Popup chain
    const chain = this.popupChain(pageId);

    // Deduplicate popup chain by collection name
    const seenChain = new Set<string>();
    const dedupedChain = chain.filter(c => {
      if (seenChain.has(c.collection)) return false;
      seenChain.add(c.collection);
      return true;
    });

    return {
      collections: [...collections],
      components: [...new Set(components)],
      popup_chain: dedupedChain.map(c => ({
        collection: c.collection,
        depth: c.depth,
        path: c.path.join(' → '),
      })),
    };
  }

  /** Serialize full graph (for debug/export). */
  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: [...this.nodes.values()],
      edges: this.edges,
    };
  }
}
