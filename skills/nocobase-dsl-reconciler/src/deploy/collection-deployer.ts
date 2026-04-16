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

  // Relation fields — warn if m2o missing target (skip field, don't crash)
  if (fd.interface === 'm2o' && !fd.target) return field; // skip — field may already exist in NocoBase
  if ((fd.interface === 'o2m') && !fd.target) return field; // skip — NocoBase manages reverse relations
  if (fd.target) field.target = fd.target;
  if (fd.foreignKey) field.foreignKey = fd.foreignKey;
  if (fd.targetField) field.targetKey = fd.targetField;

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
  const fields = def.fields.map(toApplyField);

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
    });
    if (!titleField) {
      log(`  ✗ collection ${name}: 没有 titleField（需要 name/title 字段，或显式设置 titleField）`);
    }
    log(`  = collection: ${name}${titleField ? ` (titleField: ${titleField})` : ''}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Fallback: if apply fails (404=older NocoBase, 500=upsert issue), use legacy
    if (msg.includes('404') || msg.includes('500') || msg.includes('Not Found')) {
      await ensureCollectionLegacy(nb, name, def, log);
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
    log(`  ✗ collection ${name}: 没有 titleField（需要 name 或 title 字段，或在 YAML 中显式设置 titleField）`);
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
): Promise<void> {
  for (const [name, def] of Object.entries(collections)) {
    await ensureCollection(nb, name, def, log);
  }

  // Post-create validation + repair for m2o fields
  for (const [name, def] of Object.entries(collections)) {
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
}
