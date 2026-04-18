/**
 * Post-deploy verification — check deployed content is correct.
 */
import type { NocoBaseClient } from '../client';
import type { StructureSpec, EnhanceSpec, PopupSpec, CollectionDef } from '../types/spec';
import type { ModuleState } from '../types/state';
import { slugify } from '../utils/slugify';
import { catchSwallow } from '../utils/swallow';

export interface PostVerifyResult {
  errors: string[];
  warnings: string[];
}

export async function postVerify(
  nb: NocoBaseClient,
  structure: StructureSpec,
  enhance: EnhanceSpec,
  state: ModuleState,
  popups: PopupSpec[],
  resolveUid: (ref: string) => string,
): Promise<PostVerifyResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Block content checks (chart SQL, JS code) ──
  for (const ps of structure.pages) {
    for (const bs of ps.blocks) {
      const pageKey = slugify(ps.page);
      const pageState = state.pages[pageKey];
      if (!pageState) continue;
      const blockUid = pageState.blocks?.[bs.key]?.uid;
      if (!blockUid) continue;

      if (bs.type === 'chart') {
        try {
          const d = await nb.get({ uid: blockUid });
          const cfg = (d.tree.stepParams as Record<string, unknown>)?.chartSettings as Record<string, unknown>;
          const configure = cfg?.configure as Record<string, unknown>;
          const sql = (configure?.query as Record<string, unknown>)?.sql;
          if (!sql) {
            errors.push(`Chart '${bs.key}' deployed but has NO SQL config — redeploy with --force`);
          }
        } catch (e) { catchSwallow(e, 'skip'); }
      }

      if (bs.type === 'jsBlock') {
        try {
          const d = await nb.get({ uid: blockUid });
          const js = (d.tree.stepParams as Record<string, unknown>)?.jsSettings as Record<string, unknown>;
          const code = ((js?.runJs as Record<string, unknown>)?.code || '') as string;
          if (code.length < 100) {
            errors.push(`JS block '${bs.key}' has only ${code.length} chars — likely empty or stub`);
          } else {
            // Validate KPI SQL returns data
            const sqlMatch = code.match(/sql:\s*`([^`]+)`/);
            const uidMatch = code.match(/reportUid:\s*['"]([^'"]+)['"]/);
            if (sqlMatch && uidMatch) {
              try {
                const resp = await nb.http.post(`${nb.baseUrl}/api/flowSql:run`, {
                  type: 'selectRows', uid: uidMatch[1],
                  dataSourceKey: 'main', sql: sqlMatch[1].trim(), bind: {},
                });
                if (resp.status >= 400) {
                  const msg = resp.data?.errors?.[0]?.message || '';
                  errors.push(`KPI '${bs.key}' SQL error: ${msg}`);
                } else {
                  const rows = resp.data?.data || [];
                  if (!rows.length || !rows[0]?.value) {
                    warnings.push(`KPI '${bs.key}' SQL returns empty/zero — insert test data to see results`);
                  }
                }
              } catch (e) { catchSwallow(e, 'skip'); }
            }
          }
        } catch (e) { catchSwallow(e, 'skip'); }
      }
    }
  }

  // ── Popup content checks ──
  for (const ps of popups) {
    const target = ps.target;
    const blocks = ps.blocks || [];
    const isAutoEdit = target.includes('record_actions.edit');

    if (!blocks.length && !isAutoEdit) continue;

    let targetUid: string;
    try {
      targetUid = resolveUid(target);
    } catch {
      if (blocks.length || isAutoEdit) {
        errors.push(`Popup ${target}: ref not found — popup NOT created`);
      }
      continue;
    }

    const hasContent = await checkPopupContent(nb, targetUid);
    if (!hasContent) {
      // Skip known unsupported: tree addChild with self-referencing association
      const isAddChild = target.includes('addChild');
      if (isAutoEdit) {
        errors.push(`Popup ${target}: edit popup is EMPTY (no edit form inside)`);
      } else if (isAddChild) {
        warnings.push(`Popup ${target}: addChild popup skipped (tree association not supported by compose)`);
      } else if (blocks.length) {
        errors.push(`Popup ${target}: popup is EMPTY (no blocks inside)`);
      }
    }
  }

  // ── Duplicate block warning ──
  for (const ps of structure.pages) {
    const pageKey = slugify(ps.page);
    const pageState = state.pages[pageKey];
    const tabUid = pageState?.tab_uid;
    const specCount = ps.blocks.length;
    if (!tabUid || specCount === 0) continue;

    try {
      const d = await nb.get({ uid: tabUid });
      const grid = d.tree.subModels?.grid;
      if (grid && typeof grid === 'object' && !Array.isArray(grid)) {
        const items = (grid as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
        const itemArr = (items?.items || []) as unknown[];
        if (Array.isArray(itemArr) && itemArr.length > specCount) {
          warnings.push(
            `Page '${ps.page}' has ${itemArr.length} blocks on page but spec defines ${specCount} — possible duplicates`,
          );
        }
      }
    } catch (e) { catchSwallow(e, 'skip'); }
  }

  // ── Filter-stats hint ──
  const collDefs = structure.collections || {};
  for (const ps of structure.pages) {
    if (ps.page.toLowerCase().includes('dashboard')) continue;
    const hasTable = ps.blocks.some(b => b.type === 'table');
    const hasFilterJs = ps.blocks.some(
      b => b.type === 'jsBlock' && ((b.key || '') + (b.desc || '')).toLowerCase().includes('filter'),
    );
    if (!hasTable || hasFilterJs) continue;

    const pageColl = ps.coll || '';
    let selectFields: string[] = [];

    // Check from collection defs
    const def = collDefs[pageColl];
    if (def) {
      selectFields = def.fields
        .filter(f => f.interface === 'select')
        .map(f => f.name);
    }

    // Check from live metadata
    if (!selectFields.length && pageColl) {
      try {
        const meta = await nb.collections.fieldMeta(pageColl);
        selectFields = Object.entries(meta)
          .filter(([, v]) => v.interface === 'select')
          .map(([k]) => k);
      } catch (e) { catchSwallow(e, 'skip'); }
    }

    if (selectFields.length) {
      warnings.push(
        `Page '${ps.page}' has select fields (${selectFields.slice(0, 3).join(', ')}) but no filter-stats jsBlock. `
        + `TIP: copy a filter-stats JS from templates/crm/pages/main/customers/tab_customers/js/ and add a jsBlock entry to layout.yaml`,
      );
    }
  }

  return { errors, warnings };
}

async function checkPopupContent(nb: NocoBaseClient, uid: string): Promise<boolean> {
  try {
    const data = await nb.get({ uid });
    // Check direct .page and .field.page paths (table column fields use field.page)
    let page = data.tree.subModels?.page;
    if (!page || Array.isArray(page)) {
      const field = data.tree.subModels?.field;
      if (field && !Array.isArray(field)) {
        page = (field as unknown as Record<string, unknown>).subModels?.page as typeof page;
      }
    }
    if (!page || Array.isArray(page)) return false;
    const tabs = (page as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
    const tabList = tabs?.tabs;
    const tabArr = Array.isArray(tabList) ? tabList : tabList ? [tabList] : [];
    for (const t of tabArr) {
      const grid = (t as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
      const items = grid?.grid as Record<string, unknown>;
      const itemList = items?.subModels as Record<string, unknown>;
      const arr = (itemList?.items || []) as unknown[];
      if (Array.isArray(arr) && arr.length > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}
