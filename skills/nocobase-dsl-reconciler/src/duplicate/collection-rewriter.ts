/**
 * Rewrite collection-name references across a duplicated project.
 *
 * When duplicate-project is run with `--collection-suffix`, every reference
 * to an old collection name must become the new name. The places those
 * references live are scattered across YAML shapes:
 *
 *   - `name`, `target`, `through`, `collection`, `collectionName`
 *       Direct field-name values on collections / fields / workflow triggers
 *
 *   - `coll` on page blocks
 *       The block's bound collection
 *
 *   - `associationName`, `associationField` (value `<coll>.<field>`)
 *       m2o/o2m references — prefix must be remapped, suffix preserved
 *
 *   - `sql` bodies (freestanding SELECT / UPDATE strings)
 *       Word-boundary substitution
 *
 *   - `triggers` (array of SqlObjectDef)
 *       Both the trigger name AND the SQL body (CREATE FUNCTION / CREATE TRIGGER
 *       / EXECUTE FUNCTION) get the collection suffix so v1/v2 coexist on
 *       different tables without Postgres identifier collisions.
 *
 *   - defaults.yaml `popups:` / `forms:` map keys
 *       Keys are collection names; values are template file paths.
 *       rewriteCollectionRefs walks values but not keys — that's why
 *       rewriteDefaultsKeys is a separate pass.
 */

/** defaults.yaml has `popups:` / `forms:` sections keyed BY collection name.
 *  rewriteCollectionRefs only touches values at the known key names
 *  (name/target/through/…) — so defaults.yaml's map keys would stay unchanged
 *  without this dedicated rewriter. */
export function rewriteDefaultsKeys(
  obj: unknown,
  collMap: Map<string, string>,
): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const o = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [section, inner] of Object.entries(o)) {
    if ((section === 'popups' || section === 'forms') && inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const remapped: Record<string, unknown> = {};
      for (const [collName, tplFile] of Object.entries(inner as Record<string, unknown>)) {
        const newKey = collMap.get(collName) || collName;
        remapped[newKey] = tplFile;
      }
      out[section] = remapped;
    } else {
      out[section] = inner;
    }
  }
  return out;
}

export function rewriteCollectionRefs(
  obj: unknown,
  collMap: Map<string, string>,
  filePath: string,
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // String-level rewrites only happen for SQL bodies (handled inline below).
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(x => rewriteCollectionRefs(x, collMap, filePath));
  if (typeof obj !== 'object') return obj;
  const o = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    // Direct name fields
    if ((k === 'name' || k === 'target' || k === 'through' || k === 'collection' || k === 'collectionName') && typeof v === 'string' && collMap.has(v)) {
      out[k] = collMap.get(v);
      continue;
    }
    // Block.coll on page YAML
    if (k === 'coll' && typeof v === 'string' && collMap.has(v)) {
      out[k] = collMap.get(v);
      continue;
    }
    // Association references like `nb_crm_leads.comments` — the value is
    // `<collectionName>.<fieldName>`. Rewrite the prefix when collMap has the
    // collection. Without this comments / mailMessages / o2m blocks in a
    // duplicate still point at the source's collection (e.g. the duplicate
    // CommentsBlock for nb_crm_leads_copy ends up bound to nb_crm_leads).
    if ((k === 'associationName' || k === 'associationField') && typeof v === 'string' && v.includes('.')) {
      const [head, ...rest] = v.split('.');
      if (collMap.has(head)) {
        out[k] = `${collMap.get(head)}.${rest.join('.')}`;
        continue;
      }
    }
    // SQL bodies — substitute table names (word-boundary match) AND auto-suffix trigger names
    if (k === 'sql' && typeof v === 'string') {
      let sql = v;
      for (const [oldName, newName] of collMap) {
        sql = sql.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
      }
      out[k] = sql;
      continue;
    }
    // Trigger object: rename its `name` (so v1/v2 triggers coexist on
    // different tables — but PG also requires unique trigger names per
    // table, which is fine since they're on different tables now), and
    // rewrite collection names + function names inside the SQL body so
    // v2's CREATE OR REPLACE doesn't clobber v1's function.
    if (k === 'triggers' && Array.isArray(v)) {
      // We need a suffix. Derive it from the first collMap entry
      // (e.g. 'bookings' → 'bookings_v2' → suffix '_v2').
      const firstEntry = collMap.entries().next().value;
      const suffix = firstEntry ? firstEntry[1].slice(firstEntry[0].length) : '';
      out[k] = v.map((t: Record<string, unknown>) => {
        if (!t || typeof t !== 'object') return t;
        const newT: Record<string, unknown> = { ...t };
        if (typeof newT.name === 'string' && suffix) {
          newT.name = `${newT.name as string}${suffix}`;
        }
        for (const field of ['sql', 'drop'] as const) {
          if (typeof newT[field] !== 'string') continue;
          let s = newT[field] as string;
          // 1. Rename table refs.
          for (const [oldName, newName] of collMap) {
            s = s.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
          }
          // 2. Rename function names declared/referenced in this DDL.
          //    Match `CREATE [OR REPLACE] FUNCTION [schema.]<name>(`
          //    and `EXECUTE FUNCTION [schema.]<name>` and `EXECUTE PROCEDURE …`.
          if (suffix) {
            s = s.replace(
              /\b(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:[a-zA-Z0-9_]+\.)?)([a-zA-Z0-9_]+)\s*\(/gi,
              (_m, p1, fn) => `${p1}${fn}${suffix}(`,
            );
            s = s.replace(
              /\b(EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:[a-zA-Z0-9_]+\.)?)([a-zA-Z0-9_]+)/gi,
              (_m, p1, fn) => `${p1}${fn}${suffix}`,
            );
            // Also rename CREATE TRIGGER <name> so the trigger name itself gets the suffix.
            s = s.replace(
              /\b(CREATE\s+TRIGGER\s+)([a-zA-Z0-9_]+)/gi,
              (_m, p1, tn) => `${p1}${tn}${suffix}`,
            );
          }
          newT[field] = s;
        }
        return newT;
      });
      continue;
    }
    out[k] = rewriteCollectionRefs(v, collMap, filePath);
  }
  return out;
}
