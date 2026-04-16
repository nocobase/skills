/**
 * Auto-generate and insert seed data from collection YAML definitions.
 *
 * Reads collections/*.yaml, determines insert order (parent tables first),
 * generates sample data with correct field types, inserts via API,
 * and captures real IDs for FK relationships.
 *
 * Usage: npx tsx cli/cli.ts seed /tmp/myapp --count 5
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NocoBaseClient } from '../client';
import { loadYaml } from '../utils/yaml';
import type { FieldDef, CollectionDef } from '../types/spec';

interface SeedOptions {
  count?: number;  // records per table (default: 5)
}

export async function seedData(
  projectDir: string,
  opts: SeedOptions = {},
  log: (msg: string) => void = console.log,
): Promise<void> {
  const nb = await NocoBaseClient.create();
  const root = path.resolve(projectDir);
  const collDir = path.join(root, 'collections');
  if (!fs.existsSync(collDir)) throw new Error(`No collections/ directory in ${root}`);

  const count = opts.count || 5;

  // 1. Load all collections
  const collections = new Map<string, CollectionDef & { name: string }>();
  for (const f of fs.readdirSync(collDir).filter(f => f.endsWith('.yaml')).sort()) {
    const def = loadYaml<Record<string, unknown>>(path.join(collDir, f));
    if (!def?.name) continue;
    collections.set(def.name as string, {
      name: def.name as string,
      title: (def.title || def.name) as string,
      titleField: def.titleField as string,
      fields: (def.fields || []) as FieldDef[],
    });
  }

  // 2. Topological sort: parent tables (no m2o deps) first
  const SYSTEM = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById']);
  const deps = new Map<string, Set<string>>(); // collName → set of target collNames
  for (const [name, def] of collections) {
    const targets = new Set<string>();
    for (const f of def.fields) {
      if (SYSTEM.has(f.name)) continue;
      if (f.interface === 'm2o' && f.target && f.target !== name) {
        targets.add(f.target);
      }
    }
    deps.set(name, targets);
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    for (const dep of deps.get(name) || []) {
      if (collections.has(dep)) visit(dep);
    }
    sorted.push(name);
  }
  for (const name of collections.keys()) visit(name);

  // 3. Insert data in order, capture real IDs
  const idMap = new Map<string, string[]>(); // collName → [id1, id2, ...]

  for (const collName of sorted) {
    const def = collections.get(collName)!;
    const bizFields = def.fields.filter(f => !SYSTEM.has(f.name) && f.interface !== 'o2m' && f.interface !== 'm2m');
    log(`\n  Seeding ${collName} (${count} records)...`);

    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const record: Record<string, unknown> = {};

      for (const f of bizFields) {
        if (f.interface === 'm2o') {
          // Use real ID from parent table
          const parentIds = idMap.get(f.target || '');
          if (parentIds?.length) {
            const fkName = f.foreignKey || `${f.name}Id`;
            record[fkName] = parentIds[i % parentIds.length];
          }
          continue;
        }

        // Generate sample data based on field type
        record[f.name] = generateSampleValue(f, i, collName);
      }

      try {
        const resp = await nb.http.post(`${nb.baseUrl}/api/${collName}:create`, record);
        const id = resp.data?.data?.id;
        if (id) {
          ids.push(String(id));
          const name = record.name || record.title || `#${i + 1}`;
          log(`    + ${name} (id=${id})`);
        }
      } catch (e) {
        log(`    ! record ${i + 1}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      }
    }
    idMap.set(collName, ids);
  }

  log(`\n  Seed complete: ${sorted.length} collections, ${count} records each.`);
}

function generateSampleValue(f: FieldDef, index: number, collName: string): unknown {
  const i = index + 1;
  const prefix = collName.replace(/^nb_\w+_/, '').replace(/_/g, ' ');

  switch (f.interface) {
    case 'input':
      if (f.name === 'name' || f.name === 'title') return `${capitalize(prefix)} ${i}`;
      if (f.name === 'code') return `${prefix.toUpperCase().replace(/ /g, '-')}-${String(i).padStart(3, '0')}`;
      return `${f.title || f.name} ${i}`;

    case 'textarea':
      return `Sample ${f.title || f.name} for ${prefix} ${i}.`;

    case 'email':
      return `user${i}@example.com`;

    case 'phone':
      return `138${String(10000000 + i * 1111).slice(0, 8)}`;

    case 'url':
      return `https://example.com/${f.name}/${i}`;

    case 'select': {
      const opts = f.options || [];
      if (opts.length) {
        const opt = opts[index % opts.length];
        return typeof opt === 'string' ? opt : opt.value;
      }
      return null;
    }

    case 'multipleSelect': {
      const opts = f.options || [];
      if (opts.length) {
        const opt = opts[index % opts.length];
        return [typeof opt === 'string' ? opt : opt.value];
      }
      return [];
    }

    case 'integer':
      return i * 10;

    case 'number':
    case 'percent':
      return Math.round((i * 17.5 + 10) * 100) / 100;

    case 'checkbox':
      return i % 2 === 0;

    case 'dateOnly': {
      const d = new Date();
      d.setDate(d.getDate() + (i - 1) * 7);
      return d.toISOString().split('T')[0];
    }

    case 'datetime': {
      const d = new Date();
      d.setDate(d.getDate() + (i - 1) * 7);
      return d.toISOString();
    }

    default:
      return null;
  }
}

function capitalize(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
