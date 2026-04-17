/**
 * Export V2 templates (flowModelTemplates) — both popup and block templates.
 *
 * Templates are shared across pages. Export to templates/ directory:
 *   templates/
 *     _index.yaml              # all templates with metadata
 *     popup/
 *       activity_view.yaml     # popup template with content blocks
 *     block/
 *       form_add_leads.yaml    # block template with content
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { FlowModelNode } from '../types/api';
import { exportBlock } from './block-exporter';
import { dumpYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';

interface TemplateRecord {
  uid: string;
  name: string;
  type: 'popup' | 'block';
  collectionName: string;
  dataSourceKey: string;
  targetUid: string;
  description?: string;
  associationName?: string;
  useModel?: string;
  usageCount?: number;
}

/**
 * Export all V2 templates from flowModelTemplates API.
 */
export async function exportAllTemplates(
  nb: NocoBaseClient,
  outDir: string,
): Promise<void> {
  const tplDir = path.join(outDir, 'templates');

  // Fetch all templates
  const resp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, {
    params: { paginate: false },
  });
  const allTemplates = (resp.data?.data || []) as TemplateRecord[];
  if (!allTemplates.length) {
    console.log('  No templates found');
    return;
  }

  // Dedupe by (type, name, collectionName). The live DB can hold multiple
  // duplicates from prior copy-mode deploys; we keep the highest-usage one
  // and let the rollback / manual cleanup remove the rest.
  const bestByKey = new Map<string, TemplateRecord>();
  for (const t of allTemplates) {
    const key = `${t.type}|${t.name}|${t.collectionName || ''}`;
    const cur = bestByKey.get(key);
    if (!cur || (t.usageCount || 0) > (cur.usageCount || 0)) {
      bestByKey.set(key, t);
    }
  }
  const templates = Array.from(bestByKey.values());
  if (templates.length < allTemplates.length) {
    console.log(`  templates: ${allTemplates.length} live, ${templates.length} unique (skipped ${allTemplates.length - templates.length} duplicates)`);
  }

  // Create directories
  const popupDir = path.join(tplDir, 'popup');
  const blockDir = path.join(tplDir, 'block');
  fs.mkdirSync(popupDir, { recursive: true });
  fs.mkdirSync(blockDir, { recursive: true });

  const index: Record<string, unknown>[] = [];

  for (const tpl of templates) {
    const tplSlug = slugify(tpl.name || tpl.uid);
    const typeDir = tpl.type === 'popup' ? popupDir : blockDir;
    const jsDir = path.join(typeDir, tplSlug, 'js');

    try {
      // Read template content via targetUid
      let contentSpec: Record<string, unknown> = {};
      if (tpl.targetUid) {
        contentSpec = await exportTemplateContent(nb, tpl.targetUid, jsDir, tplSlug, tpl.type);
      }

      const tplSpec: Record<string, unknown> = {
        uid: tpl.uid,
        name: tpl.name,
        type: tpl.type,
        collectionName: tpl.collectionName || undefined,
        dataSourceKey: tpl.dataSourceKey || 'main',
        targetUid: tpl.targetUid,
        ...(tpl.associationName ? { associationName: tpl.associationName } : {}),
        ...(tpl.description ? { description: tpl.description } : {}),
        ...contentSpec,
      };

      fs.writeFileSync(path.join(typeDir, `${tplSlug}.yaml`), dumpYaml(tplSpec));

      index.push({
        uid: tpl.uid,
        name: tpl.name,
        type: tpl.type,
        collection: tpl.collectionName,
        targetUid: tpl.targetUid,
        file: `${tpl.type}/${tplSlug}.yaml`,
        usageCount: tpl.usageCount || 0,
      });

      // Clean up empty js dir
      try {
        if (fs.existsSync(jsDir) && !fs.readdirSync(jsDir).length) fs.rmdirSync(jsDir);
      } catch { /* skip */ }

    } catch (e) {
      console.log(`  ! template ${tpl.name}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
  }

  // Write index
  fs.writeFileSync(path.join(tplDir, '_index.yaml'), dumpYaml(index));

  const popupCount = templates.filter(t => t.type === 'popup').length;
  const blockCount = templates.filter(t => t.type === 'block').length;
  console.log(`  + ${templates.length} templates (${popupCount} popup, ${blockCount} block)`);
}

/**
 * Export template content by reading the targetUid's flowModel tree.
 */
async function exportTemplateContent(
  nb: NocoBaseClient,
  targetUid: string,
  jsDir: string,
  prefix: string,
  templateType: 'popup' | 'block',
): Promise<Record<string, unknown>> {
  // Use flowModels:findOne, NOT flowSurfaces:get — the surfaces variant
  // strips stepParams.referenceSettings.useTemplate (and other internal
  // surface metadata), which makes ReferenceBlockModel children export as
  // bare `type: reference` with no templateRef. findOne returns the raw
  // tree with full stepParams.
  let tree: FlowModelNode;
  try {
    const node = await nb.models.findOne(targetUid, true);
    if (!node) return {};
    tree = node as unknown as FlowModelNode;
  } catch {
    return {};
  }

  if (templateType === 'popup') {
    // Popup template: targetUid → field model → subModels.page → ChildPage → tabs → blocks
    const page = tree.subModels?.page;
    if (!page || Array.isArray(page)) {
      // Maybe targetUid IS the ChildPage directly
      if (tree.use === 'ChildPageModel') {
        return exportChildPageContent(nb, tree, jsDir, prefix);
      }
      return {};
    }
    return exportChildPageContent(nb, page as FlowModelNode, jsDir, prefix);
  } else {
    // Block template: targetUid → the actual block model (form/table/details/etc.)
    const usedKeys = new Set<string>();
    const exported = await exportBlock(tree, jsDir, prefix, 0, usedKeys);
    if (!exported) return {};
    const spec = { ...exported.spec };
    delete spec._popups;
    return { content: spec };
  }
}

async function exportChildPageContent(
  nb: NocoBaseClient,
  pageNode: FlowModelNode,
  jsDir: string,
  prefix: string,
): Promise<Record<string, unknown>> {
  const rawTabs = pageNode.subModels?.tabs;
  const tabs = (Array.isArray(rawTabs) ? rawTabs : rawTabs ? [rawTabs] : []) as FlowModelNode[];

  if (tabs.length <= 1) {
    const tabGrid = tabs.length ? tabs[0].subModels?.grid : null;
    if (!tabGrid || Array.isArray(tabGrid)) return { content: { blocks: [] } };

    const { blocks, layout } = await exportGridItems(tabGrid as FlowModelNode, jsDir, prefix);
    const content: Record<string, unknown> = { blocks };
    if (layout.length) content.layout = layout;
    return { content };
  }

  // Multi tab
  const tabSpecs: Record<string, unknown>[] = [];
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const title = ((tab.stepParams as Record<string, unknown>)?.pageTabSettings as Record<string, unknown>)
      ?.title as Record<string, unknown>;
    const tabTitle = (title?.title as string) || `Tab${i}`;
    const tabGrid = tab.subModels?.grid;
    if (tabGrid && !Array.isArray(tabGrid)) {
      const { blocks, layout } = await exportGridItems(tabGrid as FlowModelNode, jsDir, `${prefix}_tab${i}`);
      const tabEntry: Record<string, unknown> = { title: tabTitle, blocks };
      if (layout.length) tabEntry.layout = layout;
      tabSpecs.push(tabEntry);
    } else {
      tabSpecs.push({ title: tabTitle, blocks: [] });
    }
  }
  return { content: { tabs: tabSpecs } };
}

async function exportGridItems(
  grid: FlowModelNode,
  jsDir: string,
  prefix: string,
): Promise<{ blocks: Record<string, unknown>[]; layout: unknown[] }> {
  const rawItems = grid.subModels?.items;
  const items = (Array.isArray(rawItems) ? rawItems : []) as FlowModelNode[];
  const usedKeys = new Set<string>();
  const blocks: Record<string, unknown>[] = [];
  const blockUidToKey = new Map<string, string>();

  for (let i = 0; i < items.length; i++) {
    const exported = await exportBlock(items[i], jsDir, prefix, i, usedKeys);
    if (exported) {
      const spec = { ...exported.spec };
      delete spec._popups;
      blocks.push(spec);
      blockUidToKey.set(items[i].uid, exported.key);
    }
  }

  // Extract grid layout (rows/sizes → layout DSL)
  const layout = extractTemplateGridLayout(grid, blockUidToKey);

  return { blocks, layout };
}

/**
 * Extract grid layout from gridSettings.rows → layout DSL.
 * Same logic as project-exporter's exportLayout but standalone.
 */
function extractTemplateGridLayout(
  grid: FlowModelNode,
  blockUidToKey: Map<string, string>,
): unknown[] {
  const gs = (grid.stepParams as Record<string, unknown>)?.gridSettings as Record<string, unknown>;
  const gridInner = (gs?.grid || {}) as Record<string, unknown>;
  const rows = (gridInner.rows || {}) as Record<string, string[][]>;
  const sizes = (gridInner.sizes || {}) as Record<string, number[]>;
  const rowOrder = (gridInner.rowOrder || Object.keys(rows)) as string[];

  if (!Object.keys(rows).length) return [];
  const layout: unknown[] = [];

  for (const rk of rowOrder) {
    const cols = rows[rk];
    if (!cols) continue;
    const sz = sizes[rk] || [];
    const nCols = cols.length;
    const defaultSize = nCols > 0 ? Math.floor(24 / nCols) : 24;
    const row: unknown[] = [];

    for (let j = 0; j < cols.length; j++) {
      const colUids = cols[j];
      const names = colUids.map(u => blockUidToKey.get(u) || u.slice(0, 8));
      const s = j < sz.length ? sz[j] : defaultSize;

      if (names.length === 1) {
        if (s === defaultSize && new Set(sz).size <= 1) {
          row.push(names[0]);
        } else {
          row.push({ [names[0]]: s });
        }
      } else {
        row.push({ col: names, size: s });
      }
    }
    if (row.length) layout.push(row);
  }
  return layout;
}

/**
 * Fetch template usages (which fields/blocks reference each template).
 */
export async function exportTemplateUsages(
  nb: NocoBaseClient,
  outDir: string,
): Promise<void> {
  const resp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, {
    params: { paginate: false },
  });
  const usages = (resp.data?.data || []) as { uid: string; templateUid: string; modelUid: string }[];
  if (!usages.length) return;

  fs.writeFileSync(
    path.join(outDir, 'templates', '_usages.yaml'),
    dumpYaml(usages.map(u => ({
      templateUid: u.templateUid,
      modelUid: u.modelUid,
    }))),
  );
  console.log(`  + ${usages.length} template usages`);
}
