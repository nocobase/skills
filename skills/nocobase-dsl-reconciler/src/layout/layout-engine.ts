/**
 * Layout DSL parser + applier.
 *
 * Converts YAML layout spec → gridSettings.rows/sizes format.
 *
 * ⚠️ PITFALLS:
 * - rows format: [[uid1,uid2]] = 1 col stacked, [[uid1],[uid2]] = 2 cols side by side
 * - After setLayout, must moveNode to sync subModels.items order (affects rendering)
 * - See src/PITFALLS.md for complete list.
 */
import type { NocoBaseClient } from '../client';
import type { LayoutRow } from '../types/spec';
import { bestEffort } from '../utils/error-utils';

export interface GridLayout {
  rows: Record<string, string[][]>;
  sizes: Record<string, number[]>;
}

/**
 * Parse YAML layout spec into grid rows + sizes.
 *
 * Input format:
 *   - - filterForm          → single row, full width
 *   - - table               → single row, full width
 *   - - kpi1: 6             → row with 4 items at 6/24 each
 *     - kpi2: 6
 *     - kpi3: 6
 *     - kpi4: 6
 */
export function parseLayoutSpec(
  layoutSpec: LayoutRow[],
  blockKeys: string[],
): GridLayout {
  const rows: Record<string, string[][]> = {};
  const sizes: Record<string, number[]> = {};
  let ri = 0;

  for (const row of layoutSpec) {
    if (!Array.isArray(row)) continue;
    const rk = `row${ri}`;
    const cols: string[][] = [];
    const colSizes: number[] = [];

    for (const cell of row) {
      if (typeof cell === 'string') {
        cols.push([cell]);
        colSizes.push(Math.floor(24 / row.length));
      } else if (typeof cell === 'object' && cell) {
        const obj = cell as Record<string, unknown>;
        if (Array.isArray(obj.col)) {
          // Stacked column: {col: [block1, block2, ...], size: N}
          cols.push(obj.col as string[]);
          colSizes.push((obj.size as number) || 24);
        } else {
          // Simple: {blockKey: size}
          const entries = Object.entries(obj).filter(([k]) => k !== 'col' && k !== 'size');
          if (entries.length) {
            const [key, size] = entries[0] as [string, number];
            cols.push([key]);
            colSizes.push(size ?? Math.floor(24 / row.length));
          }
        }
      }
    }

    if (cols.length) {
      rows[rk] = cols;
      sizes[rk] = colSizes;
      ri++;
    }
  }

  return { rows, sizes };
}

/**
 * Apply layout to a grid, replacing block keys with actual UIDs.
 */
export async function applyLayout(
  nb: NocoBaseClient,
  gridUid: string,
  layout: GridLayout,
  uidMap: Record<string, string>,
): Promise<void> {
  const resolvedRows: Record<string, string[][]> = {};
  const resolvedSizes: Record<string, number[]> = {};

  for (const [rk, cols] of Object.entries(layout.rows)) {
    const resolvedCols: string[][] = [];
    const rSizes: number[] = [];
    const rowSizes = layout.sizes[rk] || [];

    for (let i = 0; i < cols.length; i++) {
      const colKeys = cols[i];
      const resolvedCol: string[] = [];
      for (const key of colKeys) {
        const uid = uidMap[key];
        if (uid) resolvedCol.push(uid);
      }
      if (resolvedCol.length) {
        resolvedCols.push(resolvedCol);
        rSizes.push(rowSizes[i] ?? 24);
      }
    }

    if (resolvedCols.length) {
      resolvedRows[rk] = resolvedCols;
      resolvedSizes[rk] = rSizes;
    }
  }

  if (Object.keys(resolvedRows).length) {
    await bestEffort('setLayout', async () => { await nb.surfaces.setLayout(gridUid, resolvedRows, resolvedSizes); });

    // Sync items order to match rows order via moveNode
    // gridSettings.rows defines layout, but subModels.items order affects rendering
    await bestEffort('syncLayoutOrder', async () => {
      const allUidsInOrder: string[] = [];
      for (const cols of Object.values(resolvedRows)) {
        for (const col of cols) {
          for (const uid of col) allUidsInOrder.push(uid);
        }
      }
      if (allUidsInOrder.length > 1) {
        for (let i = 1; i < allUidsInOrder.length; i++) {
          await nb.surfaces.moveNode(allUidsInOrder[i], allUidsInOrder[i - 1], 'after');
        }
      }
    });
  }
}
