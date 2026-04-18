/**
 * Grid layout extraction utilities — shared across exporters.
 *
 * Two flavors:
 *   - extractBlockGridLayout: maps block UIDs → block keys for page/popup layout
 *   - extractFieldGridLayout: maps field UIDs → field names for form field_layout
 */
import type { FlowModelNode } from '../types/api';

/**
 * Parse gridSettings out of a FlowModelNode.
 */
function parseGrid(grid: FlowModelNode): {
  rows: Record<string, string[][]>;
  sizes: Record<string, number[]>;
  rowOrder: string[];
} {
  const gs = (grid.stepParams as Record<string, unknown>)?.gridSettings as Record<string, unknown>;
  const gridInner = (gs?.grid || {}) as Record<string, unknown>;
  const rows = (gridInner.rows || {}) as Record<string, string[][]>;
  const sizes = (gridInner.sizes || {}) as Record<string, number[]>;
  const rowOrder = (gridInner.rowOrder || Object.keys(rows)) as string[];
  return { rows, sizes, rowOrder };
}

/**
 * Extract block-level grid layout (page / popup / template grids).
 *
 * Supports:
 *  - rowOrder-based iteration (falls back to Object.keys)
 *  - single-column stacking (one block per row)
 *  - multi-column rows with {col: names, size} format
 *
 * Returns a layout DSL array compatible with layout.yaml.
 */
export function extractBlockGridLayout(
  grid: FlowModelNode,
  blockUidToKey: Map<string, string>,
): unknown[] {
  const { rows, sizes, rowOrder } = parseGrid(grid);
  if (!Object.keys(rows).length) return [];

  const layout: unknown[] = [];

  for (const rk of rowOrder) {
    const cols = rows[rk];
    if (!cols) continue;
    const sz = sizes[rk] || [];
    const nCols = cols.length;
    const defaultSize = nCols > 0 ? Math.floor(24 / nCols) : 24;

    if (nCols === 1) {
      // Single column — blocks stacked vertically, one row per block
      for (const uid of cols[0]) {
        const key = blockUidToKey.get(uid);
        if (key) layout.push([key]);
      }
    } else {
      // Multiple columns — blocks side by side. NocoBase grid is 24-wide; if
      // the raw NB row's sizes sum > 24 (legacy data with one-cell-per-block
      // overflow), regroup consecutive same-size cells into vertical col
      // stacks so the row sums to ≤ 24 and renders correctly. Single-block
      // rows of mixed sizes still emit the flat `{key: size}` form so the
      // validator can flag them — we only auto-restructure when there's a
      // clear grouping signal (consecutive equal sizes).
      const totalSize = sz.slice(0, nCols).reduce((a, b) => a + b, 0);
      if (totalSize > 24) {
        const grouped: { names: string[]; size: number }[] = [];
        let cursor: { names: string[]; size: number } | null = null;
        for (let i = 0; i < cols.length; i++) {
          const colUids = cols[i];
          const names = colUids.map(u => blockUidToKey.get(u)).filter(Boolean) as string[];
          const s = i < sz.length ? sz[i] : defaultSize;
          if (!names.length) continue;
          if (cursor && cursor.size === s) {
            cursor.names.push(...names);
          } else {
            cursor = { names: [...names], size: s };
            grouped.push(cursor);
          }
        }
        const groupedTotal = grouped.reduce((a, g) => a + g.size, 0);
        if (groupedTotal <= 24 && grouped.some(g => g.names.length > 1)) {
          const row: unknown[] = [];
          for (const g of grouped) {
            row.push(g.names.length === 1 ? { [g.names[0]]: g.size } : { col: g.names, size: g.size });
          }
          layout.push(row);
          continue;
        }
        // Couldn't group cleanly → fall back to one-block-per-row stacks so
        // the deployed UI is at least readable. Loses the side-by-side
        // intent but avoids the >24 overflow.
        for (const c of cols) {
          for (const uid of c) {
            const key = blockUidToKey.get(uid);
            if (key) layout.push([key]);
          }
        }
        continue;
      }

      const row: unknown[] = [];
      for (let i = 0; i < cols.length; i++) {
        const colUids = cols[i];
        const names = colUids.map(u => blockUidToKey.get(u)).filter(Boolean) as string[];
        const s = i < sz.length ? sz[i] : defaultSize;

        if (names.length === 1) {
          if (s === defaultSize && new Set(sz).size <= 1) {
            row.push(names[0]);
          } else {
            row.push({ [names[0]]: s });
          }
        } else if (names.length > 1) {
          row.push({ col: names, size: s });
        }
      }
      if (row.length) layout.push(row);
    }
  }

  return layout;
}

/**
 * Extract field-level grid layout (form / detail / filterForm grids).
 *
 * Handles: single items, equal-width rows, complex rows (different sizes, stacked cols),
 * divider strings ("--- label ---").
 *
 * Returns a field_layout DSL array.
 */
export function extractFieldGridLayout(
  grid: FlowModelNode,
  uidToName: Map<string, string>,
): unknown[] {
  const { rows, sizes, rowOrder } = parseGrid(grid);
  if (!Object.keys(rows).length) return [];

  const layout: unknown[] = [];

  for (const rk of rowOrder) {
    const cols = rows[rk];
    if (!cols) continue;
    const sz = sizes[rk] || [];
    const nCols = cols.length;
    const defaultSize = nCols > 0 ? Math.floor(24 / nCols) : 24;

    const allSingle = cols.every(col => col.length === 1);
    const equalSize = new Set(sz).size <= 1;

    if (nCols === 1 && cols[0].length === 1) {
      // Single item row
      const name = uidToName.get(cols[0][0]) || cols[0][0].slice(0, 8);
      if (name.startsWith('--- ')) {
        layout.push(name); // divider as string
      } else {
        layout.push([name]);
      }
    } else if (allSingle && equalSize && sz.every(s => s === defaultSize)) {
      // Simple equal-width row
      const names = cols.map(col => uidToName.get(col[0]) || col[0].slice(0, 8));
      layout.push(names);
    } else {
      // Complex row (different sizes or stacked items)
      const rowItems: unknown[] = [];
      for (let j = 0; j < cols.length; j++) {
        const s = j < sz.length ? sz[j] : defaultSize;
        const names = cols[j].map(u => uidToName.get(u) || u.slice(0, 8));

        if (names.length === 1) {
          if (s === defaultSize && equalSize) {
            rowItems.push(names[0]);
          } else {
            rowItems.push({ [names[0]]: s });
          }
        } else {
          // Stacked column
          rowItems.push({ col: names, size: s });
        }
      }
      layout.push(rowItems);
    }
  }

  return layout;
}
