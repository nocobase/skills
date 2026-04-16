/**
 * Apply field_layout covering ALL grid children.
 *
 * Converts the YAML field_layout DSL (rows of field names + dividers)
 * into gridSettings.rows/sizes for the block's internal grid.
 */
import type { BlockSpec } from '../../types/spec';
import { bestEffort } from '../../utils/error-utils';
import type { DeployContext } from './types';

export async function applyFieldLayout(
  ctx: DeployContext,
  gridUid: string,
  fieldLayout: unknown[],
  bs?: BlockSpec,
): Promise<void> {
  const { nb, log } = ctx;
  if (!fieldLayout.length || !gridUid) return;

  await bestEffort('applyFieldLayout', async () => {
    const live = await nb.get({ uid: gridUid });
    const items = live.tree.subModels?.items;
    const itemArr = (Array.isArray(items) ? items : []) as { uid: string; use?: string; stepParams?: Record<string, unknown> }[];
    if (!itemArr.length) return;

    // Build desc → uid maps from spec (stable, no regex)
    const jsDescToUid = new Map<string, string>();
    const jsItems = bs?.js_items || [];
    const liveJsItems = itemArr.filter(d => d.use?.includes('JSItem'));
    for (let i = 0; i < jsItems.length && i < liveJsItems.length; i++) {
      const desc = jsItems[i].desc || jsItems[i].key;
      if (desc) jsDescToUid.set(`[JS:${desc}]`, liveJsItems[i].uid);
    }

    // Map markdown items by key from fields spec
    const mdKeyToUid = new Map<string, string>();
    const liveMarkdowns = itemArr.filter(d => d.use?.includes('MarkdownItem'));
    const specMdFields = (bs?.fields || []).filter(f => typeof f === 'object' && (f as unknown as Record<string, unknown>).type === 'markdown');
    for (let i = 0; i < specMdFields.length && i < liveMarkdowns.length; i++) {
      const key = (specMdFields[i] as unknown as Record<string, unknown>).key as string;
      if (key) mdKeyToUid.set(`[MD:${key}]`, liveMarkdowns[i].uid);
    }

    // Build uid map: fieldPath/label/[JS:desc] → uid
    const uidMap = new Map<string, string>();
    const allUids = new Set<string>();
    for (const d of itemArr) {
      allUids.add(d.uid);
      const fp = (d.stepParams?.fieldSettings as Record<string, unknown>)?.init as Record<string, unknown>;
      const fieldPath = fp?.fieldPath as string;
      const label = ((d.stepParams?.markdownItemSetting as Record<string, unknown>)?.title as Record<string, unknown>)?.label as string;
      // Custom filter field name (FilterFormCustomFieldModel)
      const customName = ((d.stepParams?.formItemSettings as Record<string, unknown>)
        ?.fieldSettings as Record<string, unknown>)?.name as string;
      if (fieldPath) uidMap.set(fieldPath, d.uid);
      else if (customName) uidMap.set(customName, d.uid);
      else if (label) uidMap.set(label, d.uid);
    }
    // Merge JS + markdown mappings
    for (const [k, v] of jsDescToUid) uidMap.set(k, v);
    for (const [k, v] of mdKeyToUid) uidMap.set(k, v);
    // [JS] fallback → first JSItem (for field_layout entries that use [JS] without desc)
    const firstJs = itemArr.find(d => d.use?.includes('JSItem'));
    if (firstJs && !uidMap.has('[JS]')) {
      uidMap.set('[JS]', firstJs.uid);
    }

    const rows: Record<string, string[][]> = {};
    const sizes: Record<string, number[]> = {};
    let ri = 0;
    const covered = new Set<string>();

    for (const row of fieldLayout) {
      const rk = `r${ri}`;
      if (typeof row === 'string') {
        if (row.startsWith('---')) {
          const label = row.replace(/^-+\s*/, '').replace(/\s*-+$/, '').trim();
          const u = uidMap.get(label);
          if (u && !covered.has(u)) {
            rows[rk] = [[u]]; sizes[rk] = [24];
            covered.add(u); ri++;
          }
        }
      } else if (Array.isArray(row)) {
        const cols: string[][] = [];
        const colSizes: number[] = [];
        for (const item of row) {
          if (typeof item === 'string') {
            // Simple field name
            const u = uidMap.get(item);
            if (u && !covered.has(u)) {
              cols.push([u]); covered.add(u);
              colSizes.push(Math.floor(24 / row.length));
            }
          } else if (item && typeof item === 'object') {
            const obj = item as Record<string, unknown>;
            if (Array.isArray(obj.col)) {
              // {col: ['JS:...', 'field1', 'field2'], size: N} — stacked column
              const colUids: string[] = [];
              for (const name of obj.col as string[]) {
                const u = uidMap.get(name);
                if (u && !covered.has(u)) {
                  colUids.push(u); covered.add(u);
                }
              }
              if (colUids.length) {
                cols.push(colUids);
                colSizes.push((obj.size as number) || 24);
              }
            } else {
              // {fieldName: size} format
              const entries = Object.entries(obj).filter(([k]) => k !== 'col' && k !== 'size');
              if (entries.length) {
                const [name, size] = entries[0];
                const u = uidMap.get(name);
                if (u && !covered.has(u)) {
                  cols.push([u]); covered.add(u);
                  colSizes.push((size as number) || Math.floor(24 / row.length));
                }
              }
            }
          }
        }
        if (cols.length) {
          rows[rk] = cols;
          sizes[rk] = colSizes.length ? colSizes : cols.map(() => Math.floor(24 / cols.length));
          ri++;
        }
      }
    }

    // Append uncovered (safety net — DSL should cover all items)
    for (const u of allUids) {
      if (!covered.has(u)) {
        const rk = `r${ri}`;
        rows[rk] = [[u]]; sizes[rk] = [24]; ri++;
      }
    }

    // Debug: log unmatched field_layout entries
    if (process.env.NB_DEBUG && log) {
      const allNames = new Set<string>();
      for (const row of fieldLayout) {
        if (typeof row === 'string' && row.startsWith('---')) {
          allNames.add(row.replace(/^-+\s*/, '').replace(/\s*-+$/, '').trim());
        } else if (Array.isArray(row)) {
          for (const item of row) {
            if (typeof item === 'string') allNames.add(item);
            else if (item && typeof item === 'object') {
              const obj = item as Record<string, unknown>;
              if (Array.isArray(obj.col)) for (const n of obj.col as string[]) allNames.add(n);
              else for (const k of Object.keys(obj).filter(k => k !== 'col' && k !== 'size')) allNames.add(k);
            }
          }
        }
      }
      const unmatched = [...allNames].filter(n => !uidMap.has(n));
      if (unmatched.length) {
        log(`      [debug] field_layout unmatched: ${unmatched.join(', ')}`);
      }
    }

    if (Object.keys(rows).length) {
      await nb.surfaces.setLayout(gridUid, rows, sizes);
    }
  }, log);
}
