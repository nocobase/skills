/**
 * Sync — pull latest state from NocoBase back to spec files.
 *
 * Reads state.yaml → fetches each block's current state →
 * updates structure.yaml + enhance.yaml with latest fields, JS, layout.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { FlowModelNode } from '../types/api';
import type { ModuleState } from '../types/state';
import type { StructureSpec, EnhanceSpec } from '../types/spec';

// Sync uses dynamic property access extensively — use loose types internally
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnySpec = Record<string, any>;
type AnyState = Record<string, any>;
import { exportBlock } from '../export/block-exporter';
import { loadYaml, saveYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';
import { extractJsDesc } from '../utils/js-utils';

export async function sync(
  modDir: string,
  nb: NocoBaseClient,
  pageFilter?: string,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const mod = path.resolve(modDir);
  const stateFile = path.join(mod, 'state.yaml');
  if (!fs.existsSync(stateFile)) {
    log('  No state.yaml — run deploy first');
    return;
  }

  const state = loadYaml<ModuleState>(stateFile);
  const structure = loadYaml<StructureSpec>(path.join(mod, 'structure.yaml'));
  let enhance: EnhanceSpec = {};
  const enhancePath = path.join(mod, 'enhance.yaml');
  if (fs.existsSync(enhancePath)) {
    enhance = loadYaml<EnhanceSpec>(enhancePath) || {};
  }

  log(`  Connected to ${nb.baseUrl}`);
  const jsDir = path.join(mod, 'js');
  fs.mkdirSync(jsDir, { recursive: true });

  // Sync each page
  for (const pageSpec of structure.pages) {
    const title = pageSpec.page;
    if (pageFilter && !title.includes(pageFilter)) continue;

    const pageKey = slugify(title);
    const pageState = state.pages[pageKey];
    const tabUid = pageState?.tab_uid;
    if (!tabUid) {
      log(`  ! ${title}: no tab_uid in state`);
      continue;
    }

    log(`  ~ ${title}`);
    await syncPage(nb, tabUid, pageSpec, pageState, mod, jsDir, pageKey);
  }

  // Write back
  saveYaml(path.join(mod, 'structure.yaml'), structure);
  if (enhance.popups?.length) {
    saveYaml(enhancePath, enhance);
  }
  saveYaml(stateFile, state);

  log('\n  Synced. Files updated.');
}

async function syncPage(
  nb: NocoBaseClient,
  tabUid: string,
  pageSpec: AnySpec,
  pageState: AnyState,
  mod: string,
  jsDir: string,
  pageKey: string,
): Promise<void> {
  let data;
  try {
    data = await nb.get({ tabSchemaUid: tabUid });
  } catch {
    try { data = await nb.get({ uid: tabUid }); } catch { return; }
  }

  const tree = data.tree;
  const grid = tree.subModels?.grid;
  if (!grid || Array.isArray(grid)) return;

  const gridNode = grid as FlowModelNode;
  const gridUid = gridNode.uid;
  (pageState as Record<string, unknown>).grid_uid = gridUid;

  const rawItems = gridNode.subModels?.items;
  const items = (Array.isArray(rawItems) ? rawItems : []) as FlowModelNode[];
  const blocksState = ((pageState as Record<string, unknown>).blocks || {}) as AnyState;
  const specBlocks = (pageSpec as Record<string, unknown>).blocks as AnySpec[] || [];

  // UID → spec index mapping
  const uidToSpec = new Map<string, number>();
  for (let i = 0; i < specBlocks.length; i++) {
    const key = specBlocks[i].key || '';
    const bs = blocksState[key];
    if (bs?.uid) uidToSpec.set(bs.uid, i);
  }

  // Sync each live block
  const usedKeys = new Set(specBlocks.map(b => b.key));
  for (const item of items) {
    if (uidToSpec.has(item.uid)) {
      const idx = uidToSpec.get(item.uid)!;
      syncBlock(item, specBlocks[idx], blocksState, jsDir, pageKey);
    } else {
      // Discover new block
      const exported = exportBlock(item, jsDir, pageKey, specBlocks.length, usedKeys);
      if (exported) {
        specBlocks.push(exported.spec as AnySpec);
        blocksState[exported.key] = exported.state as AnyState;
        console.log(`    + discovered: ${exported.key}`);
      }
    }
  }

  // Update layout
  const gridSettings = (gridNode.stepParams as Record<string, unknown>)?.gridSettings as Record<string, unknown>;
  const gridInner = (gridSettings?.grid || {}) as Record<string, unknown>;
  const rows = (gridInner.rows || {}) as Record<string, string[][]>;
  const sizes = (gridInner.sizes || {}) as Record<string, number[]>;
  const uidToKey = new Map<string, string>();
  for (const [key, bs] of Object.entries(blocksState)) {
    if (bs.uid) uidToKey.set(bs.uid, key);
  }

  const layout: unknown[] = [];
  for (const [rk, cols] of Object.entries(rows)) {
    const rowSizes = sizes[rk] || [];
    const row: unknown[] = [];
    for (let i = 0; i < cols.length; i++) {
      for (const uid of cols[i]) {
        const key = uidToKey.get(uid);
        if (!key) continue;
        const size = rowSizes[i];
        if (size && size !== Math.floor(24 / cols.length)) {
          row.push({ [key]: size });
        } else {
          row.push(key);
        }
      }
    }
    if (row.length) layout.push(row);
  }
  if (layout.length) (pageSpec as Record<string, unknown>).layout = layout;

  (pageState as Record<string, unknown>).blocks = blocksState;
}

function syncBlock(
  liveItem: FlowModelNode,
  spec: AnySpec,
  blocksState: AnyState,
  jsDir: string,
  prefix: string,
): void {
  const key = spec.key || '';
  const btype = spec.type;
  const sp = (liveItem.stepParams || {}) as Record<string, unknown>;

  // Sync title
  const cardSettings = sp.cardSettings as Record<string, unknown>;
  const titleDesc = cardSettings?.titleDescription as Record<string, unknown>;
  const title = (titleDesc?.title as string) || '';
  if (title) (spec as Record<string, unknown>).title = title;

  // Sync JS Block code
  if (btype === 'jsBlock') {
    const jsSettings = sp.jsSettings as Record<string, unknown>;
    const code = ((jsSettings?.runJs as Record<string, unknown>)?.code as string) || '';
    if (code && jsDir) {
      const fname = `${prefix}_${key}.js`;
      fs.writeFileSync(path.join(jsDir, fname), code);
      (spec as Record<string, unknown>).file = `./js/${fname}`;
      const desc = extractJsDesc(code);
      if (desc) (spec as Record<string, unknown>).desc = desc;
    }
  }

  // Sync chart config
  if (btype === 'chart') {
    const chartSettings = sp.chartSettings as Record<string, unknown>;
    const configure = (chartSettings?.configure || {}) as Record<string, unknown>;
    const query = configure.query as Record<string, unknown>;
    const sql = (query?.sql as string) || '';
    const chartOpt = configure.chart as Record<string, unknown>;
    const raw = ((chartOpt?.option as Record<string, unknown>)?.raw as string) || '';

    if ((sql || raw) && jsDir) {
      const chartDir = path.join(path.dirname(jsDir), 'charts');
      fs.mkdirSync(chartDir, { recursive: true });
      const base = `${prefix}_${key}`;
      if (sql) fs.writeFileSync(path.join(chartDir, `${base}.sql`), sql);
      if (raw) fs.writeFileSync(path.join(chartDir, `${base}_render.js`), raw);
    }
  }

  // Sync table fields
  if (btype === 'table') {
    const rawCols = liveItem.subModels?.columns;
    const cols = (Array.isArray(rawCols) ? rawCols : []) as FlowModelNode[];
    const fields: string[] = [];
    for (const col of cols) {
      if (col.use?.includes('TableActionsColumn')) continue;
      const fp = (col.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>;
      const fieldPath = ((fp?.init || {}) as Record<string, unknown>).fieldPath as string;
      if (fieldPath) fields.push(fieldPath);
    }
    if (fields.length) (spec as Record<string, unknown>).fields = fields;
  }

  // Sync form/detail fields
  if (['createForm', 'editForm', 'details', 'filterForm'].includes(btype)) {
    const grid = liveItem.subModels?.grid;
    if (grid && !Array.isArray(grid)) {
      const rawItems = (grid as FlowModelNode).subModels?.items;
      const items = (Array.isArray(rawItems) ? rawItems : []) as FlowModelNode[];
      const fields: string[] = [];
      for (const gi of items) {
        const fp = (gi.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>;
        const fieldPath = ((fp?.init || {}) as Record<string, unknown>).fieldPath as string;
        if (fieldPath) fields.push(fieldPath);
      }
      if (fields.length) (spec as Record<string, unknown>).fields = fields;
    }
  }

  // Sync event flows
  const flowRegistry = (liveItem.flowRegistry || {}) as Record<string, unknown>;
  if (Object.keys(flowRegistry).length && ['createForm', 'editForm'].includes(btype)) {
    const eventFlows: Record<string, unknown>[] = [];
    for (const [flowKey, flowDef] of Object.entries(flowRegistry)) {
      if (!flowDef || typeof flowDef !== 'object') continue;
      const fd = flowDef as Record<string, unknown>;
      const steps = (fd.steps || {}) as Record<string, unknown>;
      for (const [stepKey, stepDef] of Object.entries(steps)) {
        if (!stepDef || typeof stepDef !== 'object') continue;
        const sd = stepDef as Record<string, unknown>;
        const code = ((sd.runJs as Record<string, unknown>)?.code as string) || '';
        if (code && jsDir) {
          const fname = `${prefix}_${key}_event_${flowKey}_${stepKey}.js`;
          fs.writeFileSync(path.join(jsDir, fname), code);
          eventFlows.push({
            event: fd.on || 'formValuesChange',
            flow_key: flowKey,
            step_key: stepKey,
            desc: (sd.title as string) || flowKey,
            file: `./js/${fname}`,
          });
        }
      }
    }
    if (eventFlows.length) (spec as Record<string, unknown>).event_flows = eventFlows;
  }
}
