/**
 * Build a once-per-run snapshot of collection metadata read from
 * collections/*.yaml. Downstream consumers (validator, m2o popup binder,
 * orphan pruner) share the same view instead of each re-parsing every
 * collection YAML.
 *
 * Returned maps are keyed by collection name:
 *   - knownColls        Set of every collection name we saw in YAML
 *   - m2oTargets        coll → (fieldName → targetColl) for m2o fields
 *   - toManyRelations   coll → (fieldName → 'o2m'|'m2m')
 *   - titleFields       coll → titleField (defaults to 'name')
 *   - fkColumnsByColl   coll → Set of foreignKey column names used by m2o
 *                       fields (so callers can detect redundant FK field
 *                       declarations, e.g. category_id next to category m2o)
 *
 * Optional `onIssue` callback surfaces SYS_COLS warnings the parse turns
 * up — lets the spec-validator consume them without metadata being
 * coupled to validator types.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadYaml } from '../utils/yaml';
import { catchSwallow } from '../utils/swallow';

const SYS_COLS = new Set([
  'id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById',
]);

export type RelationKind = 'o2m' | 'm2m';

export interface CollectionMetadata {
  knownColls: Set<string>;
  m2oTargets: Map<string, Map<string, string>>;
  toManyRelations: Map<string, Map<string, RelationKind>>;
  titleFields: Map<string, string>;
  fkColumnsByColl: Map<string, Set<string>>;
}

export interface MetadataIssue {
  collection: string;
  field: string;
  kind: 'system-column' | 'fk-field-conflict';
}

export function buildCollectionMetadata(
  projectDir: string,
  onIssue?: (issue: MetadataIssue) => void,
): CollectionMetadata {
  const knownColls = new Set<string>();
  const m2oTargets = new Map<string, Map<string, string>>();
  const toManyRelations = new Map<string, Map<string, RelationKind>>();
  const titleFields = new Map<string, string>();
  const fkColumnsByColl = new Map<string, Set<string>>();

  const collDir = path.join(projectDir, 'collections');
  if (!fs.existsSync(collDir)) {
    return { knownColls, m2oTargets, toManyRelations, titleFields, fkColumnsByColl };
  }

  for (const f of fs.readdirSync(collDir).filter(f => f.endsWith('.yaml'))) {
    try {
      const c = loadYaml<Record<string, unknown>>(path.join(collDir, f));
      if (!c?.name) continue;
      const collName = c.name as string;
      knownColls.add(collName);
      titleFields.set(collName, (c.titleField || 'name') as string);

      const m2oMap = new Map<string, string>();
      const toManyMap = new Map<string, RelationKind>();
      const fks = new Set<string>();
      const fieldDefs = (c.fields || []) as Record<string, unknown>[];

      for (const fd of fieldDefs) {
        const fname = fd.name as string;
        if (SYS_COLS.has(fname)) {
          onIssue?.({ collection: collName, field: fname, kind: 'system-column' });
        }
        if (fd.interface === 'm2o' && fd.target) {
          m2oMap.set(fname, fd.target as string);
          const fk = (fd.foreignKey as string) || `${fname}Id`;
          fks.add(fk);
        }
        if (fd.interface === 'o2m') toManyMap.set(fname, 'o2m');
        if (fd.interface === 'm2m') toManyMap.set(fname, 'm2m');
      }

      // Flag FK columns that the DSL also declares as plain fields
      // (redundant — NocoBase auto-creates FKs from m2o relations).
      for (const fd of fieldDefs) {
        if (fks.has(fd.name as string) && fd.interface !== 'm2o') {
          onIssue?.({ collection: collName, field: fd.name as string, kind: 'fk-field-conflict' });
        }
      }

      if (m2oMap.size) m2oTargets.set(collName, m2oMap);
      if (toManyMap.size) toManyRelations.set(collName, toManyMap);
      if (fks.size) fkColumnsByColl.set(collName, fks);
    } catch (e) {
      catchSwallow(e, `buildCollectionMetadata: malformed ${f} — skip, others still parsed`);
    }
  }

  return { knownColls, m2oTargets, toManyRelations, titleFields, fkColumnsByColl };
}
