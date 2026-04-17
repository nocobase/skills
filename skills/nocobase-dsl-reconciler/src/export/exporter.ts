/**
 * Page exporter — extract complete page structure from live NocoBase.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { FlowModelNode } from '../types/api';
import { exportBlock, type PopupRef } from './block-exporter';
import { dumpYaml, saveYaml } from '../utils/yaml';
import { stripDefaults } from '../utils/strip-defaults';

const exportedPopupUids = new Set<string>();

/**
 * Export a complete page surface (tab → blocks + layout).
 */
export async function exportPageSurface(
  nb: NocoBaseClient,
  tabUid: string,
  jsDir: string | null = null,
  pageKey = 'page',
): Promise<Record<string, unknown>> {
  const data = await nb.get({ tabSchemaUid: tabUid });
  const tree = data.tree;
  const grid = tree.subModels?.grid;
  if (!grid || Array.isArray(grid)) return { blocks: [], layout: [] };

  const result = exportGrid(grid as FlowModelNode, jsDir, pageKey, true);

  // TODO: export page-level event flows (RootPageModel flowRegistry)

  return result;
}

/**
 * Export a popup surface from a field/action ChildPage.
 */
export async function exportPopupSurface(
  nb: NocoBaseClient,
  fieldUid: string,
  jsDir: string | null = null,
  popupKey = 'popup',
): Promise<Record<string, unknown> | null> {
  const data = await nb.get({ uid: fieldUid });
  const tree = data.tree;
  const popup = tree.subModels?.page;
  if (!popup || Array.isArray(popup)) return null;

  const popupNode = popup as FlowModelNode;
  const mode = ((tree.stepParams as Record<string, unknown>)?.popupSettings as Record<string, unknown>)
    ?.openView as Record<string, unknown>;
  const drawerMode = (mode?.mode as string) || 'drawer';

  const rawTabs = popupNode.subModels?.tabs;
  const tabs = Array.isArray(rawTabs) ? rawTabs : rawTabs ? [rawTabs] : [];

  if (tabs.length <= 1) {
    const grid = tabs.length ? (tabs[0] as FlowModelNode).subModels?.grid : null;
    const result = grid && !Array.isArray(grid) ? exportGrid(grid as FlowModelNode, jsDir, popupKey) : { blocks: [] };
    return { ...result, mode: drawerMode };
  }

  // Multi-tab
  const tabSpecs: Record<string, unknown>[] = [];
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i] as FlowModelNode;
    const tabTitle = ((tab.stepParams as Record<string, unknown>)?.pageTabSettings as Record<string, unknown>)
      ?.title as Record<string, unknown>;
    const title = (tabTitle?.title as string) || `Tab${i}`;
    const grid = tab.subModels?.grid;
    const tabSpec = grid && !Array.isArray(grid) ? exportGrid(grid as FlowModelNode, jsDir, `${popupKey}_tab${i}`) : { blocks: [] };
    tabSpecs.push({ ...tabSpec, title });
  }

  return { mode: drawerMode, tabs: tabSpecs };
}

/**
 * Recursively export all popups.
 */
export async function exportAllPopups(
  nb: NocoBaseClient,
  popupRefs: PopupRef[],
  jsDir: string | null,
  popupsDir: string | null,
  prefix = 'popup',
  depth = 0,
  parentPath = '',
  maxDepth = 8,
): Promise<Record<string, unknown>[]> {
  if (depth === 0) exportedPopupUids.clear();

  const allExported: Record<string, unknown>[] = [];

  for (const p of popupRefs) {
    if (exportedPopupUids.has(p.field_uid)) continue;
    exportedPopupUids.add(p.field_uid);
    if (depth >= maxDepth) continue;

    const popupData = await exportPopupSurface(nb, p.field_uid, jsDir, `${prefix}_${p.field}`);
    if (!popupData) continue;

    const popupSpec: Record<string, unknown> = {};
    if (p.target) popupSpec.target = p.target;
    popupSpec.field = p.field;
    popupSpec.field_uid = p.field_uid;
    if (p.block_key) popupSpec.block_key = p.block_key;
    Object.assign(popupSpec, popupData);
    allExported.push(popupSpec);

    // Save to file
    if (popupsDir) {
      fs.mkdirSync(popupsDir, { recursive: true });
      const namePart = p.block_key ? `${p.block_key}.${p.field}` : p.field;
      const dotPath = parentPath ? `${parentPath}.${namePart}` : namePart;
      fs.writeFileSync(path.join(popupsDir, `${dotPath}.yaml`), dumpYaml(popupSpec));
    }

    // Recursively find nested popups
    const nestedRefs: PopupRef[] = [];
    const tabs = popupData.tabs as Record<string, unknown>[];
    if (tabs) {
      for (const tab of tabs) {
        for (const block of (tab.blocks || []) as Record<string, unknown>[]) {
          nestedRefs.push(...((block._popups || []) as PopupRef[]));
        }
      }
    } else {
      for (const block of (popupData.blocks || []) as Record<string, unknown>[]) {
        nestedRefs.push(...((block._popups || []) as PopupRef[]));
      }
    }

    if (nestedRefs.length) {
      const nested = await exportAllPopups(
        nb, nestedRefs, jsDir, popupsDir,
        `${prefix}_${p.field}`, depth + 1,
        parentPath ? `${parentPath}.${p.field}` : p.field,
        maxDepth,
      );
      allExported.push(...nested);
    }
  }

  return allExported;
}

// ── Internal helpers ──

function exportGrid(
  grid: FlowModelNode,
  jsDir: string | null,
  prefix: string,
  resetKeys = false,
): Record<string, unknown> {
  const items = grid.subModels?.items;
  const itemArr = (Array.isArray(items) ? items : []) as FlowModelNode[];
  const usedKeys = new Set<string>();

  const blocks: Record<string, unknown>[] = [];
  const blockUidToKey = new Map<string, string>();
  const popupRefs: PopupRef[] = [];

  for (let i = 0; i < itemArr.length; i++) {
    const exported = exportBlock(itemArr[i], jsDir, prefix, i, usedKeys);
    if (!exported) continue;
    blocks.push(exported.spec);
    blockUidToKey.set(itemArr[i].uid, exported.key);
    popupRefs.push(...exported.popupRefs);
  }

  // Extract layout from gridSettings
  const layout = exportLayout(grid, blockUidToKey);

  const result: Record<string, unknown> = { blocks };
  if (layout.length) result.layout = layout;
  if (popupRefs.length) result.popups = popupRefs;
  result._state = { grid_uid: grid.uid };

  return result;
}

function exportLayout(
  grid: FlowModelNode,
  blockUidToKey: Map<string, string>,
): unknown[] {
  const gridSettings = (grid.stepParams as Record<string, unknown>)?.gridSettings as Record<string, unknown>;
  const gridInner = (gridSettings?.grid || {}) as Record<string, unknown>;
  const rows = (gridInner.rows || {}) as Record<string, string[][]>;
  const sizes = (gridInner.sizes || {}) as Record<string, number[]>;

  const layout: unknown[] = [];

  for (const [rk, cols] of Object.entries(rows)) {
    const rowSizes = sizes[rk] || [];
    const row: unknown[] = [];
    for (let i = 0; i < cols.length; i++) {
      const colUids = cols[i];
      for (const uid of colUids) {
        const key = blockUidToKey.get(uid);
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

  return layout;
}
