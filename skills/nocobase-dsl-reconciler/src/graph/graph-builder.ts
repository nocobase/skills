/**
 * Build project graph from exported directory structure.
 *
 * Scans: routes.yaml, collections/, pages/**, templates/
 * Produces: ProjectGraph with all nodes and edges.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectGraph, type GraphNode, type GraphEdge } from './project-graph';
import { loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';

/**
 * Build graph from an exported project directory.
 */
export function buildGraph(projectDir: string): ProjectGraph {
  const graph = new ProjectGraph();
  const root = path.resolve(projectDir);

  // 1. Collections
  const collDir = path.join(root, 'collections');
  if (fs.existsSync(collDir)) {
    for (const f of fs.readdirSync(collDir).filter(f => f.endsWith('.yaml'))) {
      const coll = loadYaml<Record<string, unknown>>(path.join(collDir, f));
      const name = (coll.name as string) || f.replace('.yaml', '');
      graph.addNode({ id: `collection:${name}`, type: 'collection', name, meta: { file: `collections/${f}` } });

      // Field references (m2o → target collection)
      for (const field of (coll.fields || []) as Record<string, unknown>[]) {
        if (field.interface === 'm2o' && field.target) {
          graph.addEdge({
            from: `collection:${name}`,
            to: `collection:${field.target}`,
            type: 'references',
            meta: { field: field.name, relation: 'm2o' },
          });
        }
        if (field.interface === 'o2m' && field.target) {
          graph.addEdge({
            from: `collection:${name}`,
            to: `collection:${field.target}`,
            type: 'references',
            meta: { field: field.name, relation: 'o2m' },
          });
        }
      }
    }
  }

  // 2. Components (templates)
  const tplDir = path.join(root, 'templates');
  if (fs.existsSync(path.join(tplDir, '_index.yaml'))) {
    const index = loadYaml<Record<string, unknown>[]>(path.join(tplDir, '_index.yaml')) || [];
    for (const tpl of index) {
      const id = `component:${tpl.uid}`;
      graph.addNode({
        id,
        type: 'component',
        name: tpl.name as string || tpl.uid as string,
        meta: { uid: tpl.uid, type: tpl.type, collection: tpl.collection, file: `templates/${tpl.file}` },
      });
      // Component → collection
      if (tpl.collection) {
        graph.addEdge({ from: id, to: `collection:${tpl.collection}`, type: 'belongsTo' });
      }
    }
  }

  // 3. Pages (recursive scan)
  const pagesDir = path.join(root, 'pages');
  if (fs.existsSync(pagesDir)) {
    scanPagesDir(graph, pagesDir, root);
  }

  return graph;
}

function scanPagesDir(graph: ProjectGraph, dir: string, root: string, parentGroup?: string): void {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (!fs.statSync(fullPath).isDirectory()) continue;

    const layoutFile = path.join(fullPath, 'layout.yaml');
    const pageFile = path.join(fullPath, 'page.yaml');

    // Check for tab_* subdirs (multi-tab page)
    const tabDirs = fs.readdirSync(fullPath).filter(d => d.startsWith('tab_') && fs.statSync(path.join(fullPath, d)).isDirectory());

    if (fs.existsSync(layoutFile) || tabDirs.length) {
      // It's a page
      const pageName = entry;
      const pageId = `page:${parentGroup ? parentGroup + '/' : ''}${pageName}`;
      graph.addNode({
        id: pageId,
        type: 'page',
        name: pageName,
        meta: { dir: path.relative(root, fullPath), group: parentGroup },
      });

      // Scan layout.yaml
      if (fs.existsSync(layoutFile)) {
        scanLayout(graph, pageId, layoutFile, root);
      }
      // Scan tab layouts
      for (const td of tabDirs) {
        const tabLayout = path.join(fullPath, td, 'layout.yaml');
        if (fs.existsSync(tabLayout)) {
          scanLayout(graph, pageId, tabLayout, root);
        }
        // Scan tab popups
        scanPopupsDir(graph, pageId, path.join(fullPath, td, 'popups'));
      }
      // Scan page-level popups
      scanPopupsDir(graph, pageId, path.join(fullPath, 'popups'));
    } else {
      // It's a group — recurse
      scanPagesDir(graph, fullPath, root, entry);
    }
  }
}

function scanLayout(graph: ProjectGraph, pageId: string, layoutFile: string, root: string): void {
  const layout = loadYaml<Record<string, unknown>>(layoutFile);
  const blocks = (layout.blocks || []) as Record<string, unknown>[];
  scanBlocks(graph, pageId, blocks, 0);
}

function scanBlocks(
  graph: ProjectGraph,
  parentId: string,
  blocks: Record<string, unknown>[],
  depth: number,
): void {
  for (const block of blocks) {
    const blockKey = block.key as string || block.type as string;
    const blockId = `${parentId}/${blockKey}`;

    // Avoid duplicate nodes
    if (!graph.getNode(blockId)) {
      graph.addNode({
        id: blockId,
        type: 'block',
        name: `${blockKey} (${block.type})`,
        meta: { type: block.type, coll: block.coll, depth },
      });
      graph.addEdge({ from: parentId, to: blockId, type: 'contains' });
    }

    // Block → collection
    if (block.coll) {
      const collId = `collection:${block.coll}`;
      if (graph.getNode(collId)) {
        graph.addEdge({ from: blockId, to: collId, type: 'belongsTo' });
      }
    }

    // Scan fields for clickToOpen popups → recursive
    const fields = (block.fields || []) as unknown[];
    for (const f of fields) {
      if (typeof f !== 'object') continue;
      const fo = f as Record<string, unknown>;

      if (fo.clickToOpen) {
        const popup = fo.popup as Record<string, unknown>;
        const ps = fo.popupSettings as Record<string, unknown>;

        // popupTo edge: which collection does this popup show?
        const popupColl = (popup as Record<string, unknown>)?.blocks
          ? findCollInBlocks((popup as Record<string, unknown>).blocks as Record<string, unknown>[])
          : (ps?.collectionName || popup?.collectionName) as string;

        if (popupColl) {
          const pageId = parentId.split('/').slice(0, 1).join('/');
          graph.addEdge({
            from: pageId || parentId,
            to: `collection:${popupColl}`,
            type: 'popupTo',
            meta: { field: fo.field, depth },
          });
        }

        // Template/component reference
        const templateName = (popup as Record<string, unknown>)?._template as string;
        if (templateName) {
          const nodes = (graph as any).nodes as Map<string, GraphNode>;
          for (const [, n] of nodes) {
            if (n.type === 'component' && n.name === templateName) {
              graph.addEdge({ from: blockId, to: n.id, type: 'usesComponent' });
              break;
            }
          }
        }

        // Recurse into popup content blocks
        if (popup && depth < 5) {
          const popupBlocks = (popup as Record<string, unknown>).blocks as Record<string, unknown>[];
          const popupTabs = (popup as Record<string, unknown>).tabs as Record<string, unknown>[];
          if (popupBlocks?.length) {
            scanBlocks(graph, blockId, popupBlocks, depth + 1);
          }
          if (popupTabs?.length) {
            for (const tab of popupTabs) {
              const tabBlocks = (tab.blocks || []) as Record<string, unknown>[];
              if (tabBlocks.length) {
                scanBlocks(graph, blockId, tabBlocks, depth + 1);
              }
            }
          }
        }
      }
    }

    // Chart/KPI → collection (dataSource)
    if ((block.type === 'chart' || block.type === 'jsBlock') && block.coll) {
      graph.addEdge({ from: blockId, to: `collection:${block.coll}`, type: 'dataSource' });
    }
  }
}

/** Find first collection name in a list of blocks. */
function findCollInBlocks(blocks: Record<string, unknown>[]): string | undefined {
  for (const b of blocks) {
    if (b.coll) return b.coll as string;
  }
  return undefined;
}

// Also scan popups/ directory for popup files
function scanPopupsDir(graph: ProjectGraph, pageId: string, popupsDir: string): void {
  if (!fs.existsSync(popupsDir)) return;
  for (const f of fs.readdirSync(popupsDir).filter(f => f.endsWith('.yaml'))) {
    try {
      const ps = loadYaml<Record<string, unknown>>(path.join(popupsDir, f));
      const blocks = (ps.blocks || []) as Record<string, unknown>[];
      const tabs = (ps.tabs || []) as Record<string, unknown>[];

      const allBlocks = [...blocks];
      for (const tab of tabs) {
        allBlocks.push(...((tab.blocks || []) as Record<string, unknown>[]));
      }

      for (const b of allBlocks) {
        if (b.coll) {
          const collId = `collection:${b.coll}`;
          if (graph.getNode(collId)) {
            graph.addEdge({ from: pageId, to: collId, type: 'popupTo', meta: { file: f } });
          }
        }
      }
    } catch { /* skip */ }
  }
}
