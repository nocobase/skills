/**
 * Export collections from NocoBase to YAML.
 *
 * Three public entry points:
 *   - exportCollections(nb, outDir, keepNames?)
 *       Writes collections/*.yaml. When keepNames is given the export is
 *       scoped — but relation targets are always transitively followed so
 *       the output is self-contained.
 *   - expandToRelationTargets(nb, names)
 *       Utility used before scoped export: grows a set of collection names
 *       by following m2o/o2m/m2m target + through references until stable.
 *       Without this, a duplicated module would have dangling relations.
 *   - captureTriggersForTable(tableName)
 *       Dumps user-defined Postgres triggers + their trigger functions via
 *       psql, in a form that deploy can replay. We deliberately avoid
 *       pg_dump — only triggers + their immediate function are captured.
 *
 * NocoBase quirks handled here:
 *   - `interface` vs `type` can diverge (e.g. interface=snowflakeId on a
 *     bigInt column). We coerce interface to match `type` so deploy
 *     reproduces the live SQL type instead of creating a varchar that
 *     breaks m2o ("operator does not exist: bigint = character varying").
 *   - Collection template: only emit non-default ('general') so YAML
 *     stays clean and plugin-specific blocks bind correctly after push.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import { dumpYaml } from '../utils/yaml';
import { catchSwallow } from '../utils/swallow';

/**
 * Seed set grows by following relation targets transitively. Without this
 * a scoped export of module A may reference module B's tables and leave
 * the o2m side dangling in duplicate / push.
 *
 * Loops until stable (safety capped at 10 iterations).
 */
export async function expandToRelationTargets(nb: NocoBaseClient, names: Set<string>): Promise<void> {
  const seen = new Set<string>();
  let changed = true;
  let safety = 0;
  while (changed && safety < 10) {
    changed = false;
    safety++;
    for (const name of Array.from(names)) {
      if (seen.has(name)) continue;
      seen.add(name);
      try {
        const r = await nb.http.get(`${nb.baseUrl}/api/collections/${name}/fields:list`, { params: { paginate: false } });
        const fields = (r.data?.data || []) as Record<string, unknown>[];
        for (const f of fields) {
          // Follow both target (m2o/o2m/m2m → other side) AND through (m2m
          // join table). Without `through`, a duplicated module would have
          // m2m fields pointing at a join table that was never pulled.
          for (const refKey of ['target', 'through'] as const) {
            const ref = f[refKey] as string;
            if (ref && !names.has(ref)) {
              names.add(ref);
              changed = true;
            }
          }
        }
      } catch (e) { catchSwallow(e, 'expandToRelationTargets: fields:list failed for one collection — skip, others still get followed'); }
    }
  }
}

export async function exportCollections(
  nb: NocoBaseClient,
  outDir: string,
  keepNames?: Set<string>,
): Promise<void> {
  const collDir = path.join(outDir, 'collections');
  fs.mkdirSync(collDir, { recursive: true });

  const resp = await nb.http.get(`${nb.baseUrl}/api/collections:list`, { params: { paginate: 'false' } });
  const colls = (resp.data.data || []) as Record<string, unknown>[];

  // When scoped, expand the keep set to include relation targets (m2o, o2m,
  // m2m). Otherwise a child block referencing the o2m would resolve to a
  // collection we never exported, leaving the duplicate broken. We fetch
  // fields per collection on demand because /api/collections:list returns
  // them as an empty array.
  const expandedKeep = keepNames ? new Set(keepNames) : null;
  if (expandedKeep) {
    const fieldsCache = new Map<string, Record<string, unknown>[]>();
    const fetchFields = async (name: string) => {
      if (fieldsCache.has(name)) return fieldsCache.get(name)!;
      try {
        const r = await nb.http.get(`${nb.baseUrl}/api/collections/${name}/fields:list`, { params: { paginate: false } });
        const f = (r.data?.data || []) as Record<string, unknown>[];
        fieldsCache.set(name, f);
        return f;
      } catch { fieldsCache.set(name, []); return []; }
    };
    let changed = true;
    let safety = 0;
    while (changed && safety < 10) {
      changed = false;
      safety++;
      for (const name of Array.from(expandedKeep)) {
        const fields = await fetchFields(name);
        for (const f of fields) {
          const target = f.target as string;
          if (target && !expandedKeep.has(target)) {
            expandedKeep.add(target);
            changed = true;
          }
        }
      }
    }
  }

  let count = 0;
  for (const c of colls) {
    const name = c.name as string;
    if (!name || name.startsWith('_') || (!name.startsWith('nb_') && !expandedKeep?.has(name))) continue;
    if (expandedKeep && !expandedKeep.has(name)) continue;

    // Fetch full field definitions (not just interface) for rich export
    let fields: Record<string, unknown>[];
    try {
      const fResp = await nb.http.get(`${nb.baseUrl}/api/collections/${name}/fields:list`, { params: { paginate: false } });
      const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById']);
      fields = ((fResp.data?.data || []) as Record<string, unknown>[])
        .filter((f: Record<string, unknown>) => f.interface && !SYSTEM_FIELDS.has(f.name as string))
        .map((f: Record<string, unknown>) => {
          // NB stores `interface` (UI hint) and `type` (actual DB column type)
          // separately and lets them diverge — e.g. interface=snowflakeId on a
          // bigInt column. When they disagree, the deploy side trusts interface
          // and recreates the column with the WRONG SQL type, breaking m2o
          // relations (varchar FK against bigint id → "operator does not
          // exist: bigint = character varying"). Coerce interface to match
          // the live `type` so a fresh push reproduces the actual schema.
          let iface = f.interface as string;
          const dbType = (f.type as string) || '';
          if (dbType === 'bigInt' && (iface === 'snowflakeId' || iface === 'uuid' || iface === 'nanoid')) {
            iface = 'integer';
          }
          const entry: Record<string, unknown> = {
            name: f.name,
            interface: iface,
          };
          if (f.title) entry.title = f.title;
          // Relations
          if (f.target) entry.target = f.target;
          if (f.foreignKey) entry.foreignKey = f.foreignKey;
          if (f.through) entry.through = f.through;
          // Select options
          const enumArr = (f.uiSchema as Record<string, unknown> | undefined)?.enum as Record<string, unknown>[] | undefined;
          if (Array.isArray(enumArr) && enumArr.length) {
            entry.options = enumArr.map((e) => {
              const opt: Record<string, string> = { value: e.value as string, label: e.label as string };
              if (e.color) opt.color = e.color as string;
              return opt;
            });
          }
          if (f.required) entry.required = true;
          return entry;
        });
    } catch {
      // Fallback to basic fieldMeta
      const meta = await nb.collections.fieldMeta(name);
      fields = Object.entries(meta).map(([fname, fmeta]) => ({
        name: fname,
        interface: fmeta.interface,
      }));
    }

    const collDef: Record<string, unknown> = {
      name,
      title: c.title || name,
    };
    // NocoBase collection template — picks plugin behaviour beyond plain
    // CRUD. Only emit when not the default ('general') so YAML stays clean.
    // Without this, duplicates land as 'general' and plugin blocks
    // (CommentsBlock / CalendarBlock / TreeBlock) refuse to bind:
    // "current collection is not a comment collection".
    const tpl = c.template as string | undefined;
    if (tpl && tpl !== 'general') collDef.template = tpl;
    if (c.titleField) collDef.titleField = c.titleField;
    collDef.fields = fields;

    // Capture user-defined triggers / functions for this table so they
    // travel with the collection in pull → push → duplicate flows.
    // Without this, a kimi-installed conflict-detection trigger gets left
    // behind on the source DB and the duplicate has no enforcement.
    try {
      const triggers = await captureTriggersForTable(name);
      if (triggers.length) collDef.triggers = triggers;
    } catch (e) { catchSwallow(e, 'psql not available — triggers not captured, can be re-pulled later'); }

    fs.writeFileSync(path.join(collDir, `${name}.yaml`), dumpYaml(collDef));
    count++;
  }
  console.log(`  + ${count} collections`);
}

/** Query Postgres for user triggers + their backing functions on `tableName`.
 *  Returns SqlObjectDef[] suitable for round-tripping back into the table.
 *  We deliberately avoid pg_dump complexity — only triggers + their immediate
 *  trigger-function are captured. Other DDL (views, custom indexes) can be
 *  added later if a real use case appears. */
export async function captureTriggersForTable(tableName: string): Promise<unknown[]> {
  const { execSql, singleValue } = await import('../utils/sql-exec');
  const out: Record<string, unknown>[] = [];
  const safe = tableName.replace(/'/g, "''");
  // Step 1 — list trigger names (one per line, single column, no separator confusion).
  const trigNames = execSql(
    `SELECT t.tgname
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = '${safe}' AND NOT t.tgisinternal
      ORDER BY t.tgname`,
    { select: true },
  ).split('\n').map(s => s.trim()).filter(Boolean);

  for (const name of trigNames) {
    const safeName = name.replace(/'/g, "''");
    // Step 2 — fetch the CREATE TRIGGER body (single-row single-column, multi-line OK).
    let createTrigger = '';
    try {
      createTrigger = singleValue(execSql(
        `SELECT pg_get_triggerdef(t.oid, true)
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = '${safe}' AND t.tgname = '${safeName}' AND NOT t.tgisinternal`,
        { select: true },
      )).trim();
    } catch (e) { catchSwallow(e, 'trigger body fetch — skip this trigger, continue with next'); }
    if (!createTrigger) continue;
    // Step 3 — find the trigger's function name from the trigger def.
    const fnMatch = createTrigger.match(/EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/i);
    const fnName = fnMatch?.[1];
    let createFn = '';
    if (fnName) {
      try {
        createFn = singleValue(execSql(
          `SELECT pg_get_functiondef(p.oid)
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = '${fnName.replace(/'/g, "''")}'`,
          { select: true },
        )).trim();
      } catch (e) { catchSwallow(e, 'trigger fn fetch — embed CREATE TRIGGER without function body'); }
    }
    const sql = createFn ? `${createFn};\n${createTrigger};` : `${createTrigger};`;
    out.push({ name, kind: 'trigger', sql });
  }
  return out;
}
