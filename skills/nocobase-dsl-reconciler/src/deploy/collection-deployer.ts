/**
 * Create/update collections and fields using collections:apply API.
 *
 * collections:apply is a high-level upsert API that:
 * - Creates collection if new, updates if exists
 * - Handles fields in one call (auto-derives type, uiSchema from interface)
 * - Validates field definitions server-side
 */
import type { NocoBaseClient } from '../client';
import type { CollectionDef, FieldDef } from '../types/spec';

/**
 * Convert our DSL FieldDef to collections:apply field format.
 *
 * collections:apply accepts compact fields: { name, interface, title, target, foreignKey, enum }
 * Server auto-derives: type, uiSchema, component, etc.
 */
function toApplyField(fd: FieldDef): Record<string, unknown> {
  const field: Record<string, unknown> = {
    name: fd.name,
    interface: fd.interface,
    title: fd.title,
  };

  // Relation fields — skip if missing required target
  const RELATION_INTERFACES = new Set(['m2o', 'o2m', 'm2m', 'o2o']);
  if (RELATION_INTERFACES.has(fd.interface) && !fd.target) return field;
  if (fd.target) field.target = fd.target;
  if (fd.foreignKey) field.foreignKey = fd.foreignKey;
  if (fd.targetField) field.targetKey = fd.targetField;
  if (fd.through) field.through = fd.through;

  // Required
  if (fd.required) field.required = true;

  // Default value
  if (fd.default !== undefined) field.defaultValue = fd.default;

  // Select/enum options (support both fd.options and fd.uiSchema.enum)
  if (fd.options) {
    field.enum = fd.options.map(o =>
      typeof o === 'string' ? { value: o, label: o } : o,
    );
  } else if (fd.uiSchema?.enum?.length) {
    field.uiSchema = { ...(field.uiSchema || {}), enum: fd.uiSchema.enum };
  }

  // Description
  if (fd.description) field.description = fd.description;

  return field;
}

/**
 * Ensure a collection exists with all specified fields.
 * Uses collections:apply for idempotent upsert.
 */
export async function ensureCollection(
  nb: NocoBaseClient,
  name: string,
  def: CollectionDef,
  log: (msg: string) => void = console.log,
): Promise<void> {
  // Skip system columns — NocoBase auto-creates these
  const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById']);

  // Coerce FK fields away from string-backed interfaces (snowflakeId, uuid,
  // nanoid). When a field is referenced as foreignKey by a relation whose
  // target is `id` (always bigint by NB convention), the FK column MUST be
  // bigint or runtime queries fail with `bigint = character varying`. The
  // pull side sometimes captures wrong interfaces (Products' parentId came
  // back as snowflakeId despite source DB being bigint), so we fix it here
  // at deploy time rather than chase every pull bug.
  const fkNames = new Set<string>();
  for (const fd of def.fields) {
    if (['m2o', 'o2m', 'o2o'].includes(fd.interface) && fd.foreignKey) {
      const targetKey = fd.targetField || 'id';
      if (targetKey === 'id') fkNames.add(fd.foreignKey);
    }
  }
  const STRING_BACKED = new Set(['snowflakeId', 'uuid', 'nanoid']);
  for (const fd of def.fields) {
    if (fkNames.has(fd.name) && STRING_BACKED.has(fd.interface)) {
      log(`  ⚠ ${name}.${fd.name}: interface=${fd.interface} would create varchar — coercing to integer (FK to bigint id)`);
      fd.interface = 'integer';
    }
  }

  const fields = def.fields.filter(f => !SYSTEM_FIELDS.has(f.name)).map(toApplyField);

  // Auto-detect titleField: first 'name' or 'title' field, or explicit from def
  const titleField = def.titleField
    || (def.fields.some(f => f.name === 'name') ? 'name' : undefined)
    || (def.fields.some(f => f.name === 'title') ? 'title' : undefined);

  try {
    await nb.collections.apply({
      name,
      title: def.title,
      fields,
      autoGenId: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      updatedBy: true,
      sortable: true,
      filterTargetKey: 'id',
      ...(titleField ? { titleField } : {}),
      // Template ('comment' / 'tree' / 'calendar' / etc.) controls which
      // NocoBase plugin blocks the collection unlocks. Default 'general'
      // is fine for plain CRUD; without the right template,
      // CommentsBlock / CalendarBlock / TreeBlock refuse to bind to
      // duplicated collections ("not a comment collection" error).
      ...(def.template ? { template: def.template } : {}),
    });
    if (!titleField) {
      log(`  ⚠ collection ${name}: no titleField (add a name/title field, or set titleField explicitly)`);
    }
    log(`  = collection: ${name}${titleField ? ` (titleField: ${titleField})` : ''}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Fallback: if apply fails (404=older NocoBase, 500=upsert issue), use legacy.
    // Catch the fallback's errors too so one bad collection doesn't kill the entire
    // push — log and continue to the next collection.
    if (msg.includes('404') || msg.includes('500') || msg.includes('Not Found')) {
      try {
        await ensureCollectionLegacy(nb, name, def, log);
      } catch (le) {
        const lmsg = le instanceof Error ? le.message : String(le);
        log(`  ! collection ${name} (legacy fallback): ${lmsg.slice(0, 200)}`);
      }
    } else {
      log(`  ! collection ${name}: ${msg}`);
    }
  }
}

/**
 * Legacy fallback: create collection + fields individually.
 */
async function ensureCollectionLegacy(
  nb: NocoBaseClient,
  name: string,
  def: CollectionDef,
  log: (msg: string) => void,
): Promise<void> {
  const exists = await nb.collections.exists(name);
  if (exists) {
    log(`  = collection: ${name}`);
  } else {
    await nb.collections.create(name, def.title);
    log(`  + collection: ${name}`);
  }

  // Set titleField
  const tf = def.titleField
    || (def.fields.some(f => f.name === 'name') ? 'name' : undefined)
    || (def.fields.some(f => f.name === 'title') ? 'title' : undefined);
  if (tf) {
    try {
      await nb.http.post(`${nb.baseUrl}/api/collections:update?filterByTk=${name}`, { titleField: tf });
      log(`  = collection: ${name} (titleField: ${tf})`);
    } catch { /* best effort */ }
  } else {
    log(`  ⚠ collection ${name}: no titleField (add a name or title field, or set titleField in YAML)`);
  }

  for (const fd of def.fields) {
    try {
      const meta = await nb.collections.fieldMeta(name);
      if (fd.name in meta) {
        // Update select enum if DSL defines it but live is empty
        if (fd.interface === 'select' && fd.uiSchema?.enum?.length) {
          try {
            const liveField = await nb.http.get(`${nb.baseUrl}/api/collections/${name}/fields:get`, { params: { filterByTk: fd.name } });
            const liveEnum = liveField.data?.data?.uiSchema?.enum || [];
            if (!liveEnum.length) {
              await nb.http.post(`${nb.baseUrl}/api/collections/${name}/fields:update`, {
                uiSchema: { ...liveField.data.data.uiSchema, enum: fd.uiSchema.enum },
              }, { params: { filterByTk: fd.name } });
              log(`    ~ ${name}.${fd.name} enum updated`);
            }
          } catch { /* skip */ }
        }
        continue;
      }
      await nb.collections.createField(name, fd);
      log(`    + ${name}.${fd.name}`);
    } catch (e) {
      log(`    ! ${name}.${fd.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  nb.collections.clearCache();
}

/**
 * Ensure all collections from structure.yaml exist.
 * After creation, validates that m2o target collections have titleField set.
 */
export async function ensureAllCollections(
  nb: NocoBaseClient,
  collections: Record<string, CollectionDef>,
  log: (msg: string) => void = console.log,
  /** When set, only operate on collections whose name is in this set. */
  onlyNames?: Set<string>,
): Promise<void> {
  const filterFn = onlyNames
    ? (entry: [string, CollectionDef]) => onlyNames.has(entry[0])
    : (_: [string, CollectionDef]) => true;
  const entries = Object.entries(collections).filter(filterFn);
  for (const [name, def] of entries) {
    // Robust: don't let one collection's failure terminate the whole deploy.
    // ensureCollection has its own per-step try/catch for apply + legacy
    // fallback, but a runaway exception (network, undefined access) would
    // otherwise kill ensureAllCollections + the rest of project deploy.
    try {
      await ensureCollection(nb, name, def, log);
    } catch (e) {
      log(`  ✗ collection ${name}: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
    }
  }

  // Post-create validation + repair for m2o fields
  for (const [name, def] of entries) {
    for (const fd of def.fields) {
      if (fd.interface !== 'm2o' || !fd.target) continue;

      // Ensure FK field is registered in metadata (collections:apply may not auto-create it)
      const fkName = fd.foreignKey || `${fd.name}Id`;
      try {
        const fieldsResp = await nb.http.get(`${nb.baseUrl}/api/collections/${name}/fields:list`, { params: { paginate: false } });
        const existingFields = ((fieldsResp.data?.data || []) as Record<string, unknown>[]).map(f => f.name as string);
        if (!existingFields.includes(fkName)) {
          await nb.http.post(`${nb.baseUrl}/api/collections/${name}/fields:create`, {
            name: fkName, type: 'bigInt', interface: 'integer', isForeignKey: true,
            uiSchema: { title: fkName, 'x-component': 'InputNumber' },
          });
          log(`    + ${name}.${fkName} (auto-created FK for ${fd.name})`);
        }
      } catch { /* best effort */ }

      // Validate target collection has titleField
      try {
        const resp = await nb.http.get(`${nb.baseUrl}/api/collections:list`, { params: { 'filter[name]': fd.target } });
        const coll = ((resp.data?.data || []) as Record<string, unknown>[])[0];
        if (coll && !coll.titleField) {
          log(`    ⚠ ${name}.${fd.name} → ${fd.target} has no titleField (relation will show ID)`);
        }
      } catch { /* skip */ }
    }
  }

  // Apply collection.triggers — raw SQL DDL that travels with the collection.
  // We do this AFTER all collections+fields exist so the SQL can reference
  // any column. drop+create per object so reruns are idempotent.
  for (const [name, def] of entries) {
    if (!def.triggers?.length) continue;
    log(`    triggers on ${name}: applying ${def.triggers.length}`);
    const { execSql, dropSqlObject } = await import('../utils/sql-exec');
    for (const t of def.triggers) {
      try {
        if (t.drop) {
          execSql(t.drop);
        } else {
          dropSqlObject(t.name, name, t.kind);
        }
        execSql(t.sql);
        log(`      + ${t.name} (${t.kind || 'sql'})`);
      } catch (e) {
        log(`      ✗ ${t.name}: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
      }
    }
  }
}
