/**
 * Data verification — check record completeness and FK integrity.
 *
 * Run AFTER inserting data to catch:
 * - Empty collections (no records)
 * - Ghost records (all business fields null)
 * - Broken FK references (projectId=1 but real ID is snowflake)
 * - Missing required fields
 *
 * Usage: npx tsx cli/cli.ts verify-data /tmp/myapp
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NocoBaseClient } from '../client';
import { loadYaml } from '../utils/yaml';
import type { FieldDef, CollectionDef } from '../types/spec';

export interface DataIssue {
  collection: string;
  level: 'error' | 'warn';
  message: string;
}

export async function verifyData(
  projectDir: string,
  log: (msg: string) => void = console.log,
): Promise<{ passed: number; failed: number; issues: DataIssue[] }> {
  const nb = await NocoBaseClient.create();
  const root = path.resolve(projectDir);
  const collDir = path.join(root, 'collections');
  if (!fs.existsSync(collDir)) throw new Error(`No collections/ directory in ${root}`);

  const SYSTEM = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById']);
  const issues: DataIssue[] = [];
  let passed = 0;

  // Load collections
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

  log(`\n  ── Data Verification: ${collections.size} collections ──`);

  for (const [collName, collDef] of collections) {
    const bizFields = collDef.fields.filter(f => !SYSTEM.has(f.name));

    // 1. Check record count
    let rows: Record<string, unknown>[];
    try {
      const r = await nb.http.get(`${nb.baseUrl}/api/${collName}:list`, { params: { pageSize: 5 } });
      rows = r.data?.data || [];
    } catch {
      issues.push({ collection: collName, level: 'error', message: 'collection not accessible' });
      continue;
    }

    if (!rows.length) {
      issues.push({ collection: collName, level: 'error', message: 'no records — insert test data first' });
      continue;
    }

    // 2. Check field completeness (sample first 3 records)
    let emptyCount = 0;
    for (const row of rows.slice(0, 3)) {
      const filled = Object.entries(row).filter(([k, v]) => !SYSTEM.has(k) && v !== null && v !== undefined);
      if (!filled.length) emptyCount++;
    }
    if (emptyCount === rows.slice(0, 3).length) {
      const fieldNames = bizFields.map(f => f.name).slice(0, 5).join(', ');
      issues.push({ collection: collName, level: 'error', message: `all records have empty fields — fields to populate: ${fieldNames}` });
      continue;
    }
    if (emptyCount > 0) {
      issues.push({ collection: collName, level: 'warn', message: `${emptyCount}/${rows.slice(0, 3).length} sampled records have all fields empty` });
    }

    // 3. Check FK integrity for m2o fields
    const m2oFields = bizFields.filter(f => f.interface === 'm2o' && f.target);
    for (const fd of m2oFields) {
      const fkName = fd.foreignKey || `${fd.name}Id`;
      let brokenCount = 0;
      let totalWithFK = 0;

      for (const row of rows) {
        const fkVal = row[fkName];
        if (fkVal === null || fkVal === undefined) continue;
        totalWithFK++;

        try {
          const related = await nb.http.get(`${nb.baseUrl}/api/${fd.target}:get`, { params: { filterByTk: fkVal } });
          if (!related.data?.data?.id) brokenCount++;
        } catch {
          brokenCount++;
        }
      }

      if (brokenCount > 0) {
        issues.push({
          collection: collName,
          level: 'error',
          message: `${fkName}: ${brokenCount}/${totalWithFK} FK values point to non-existent ${fd.target} records. `
            + `NocoBase uses snowflake IDs (e.g. 359285912895488), not 1/2/3. `
            + `Fix: query GET /api/${fd.target}:list to get real IDs, then update your records.`,
        });
      } else if (totalWithFK > 0) {
        passed++;
      }
    }

    // 4. Check select field values match options
    const selectFields = bizFields.filter(f => f.interface === 'select' && f.options?.length);
    for (const fd of selectFields) {
      const validValues = new Set(fd.options!.map(o => typeof o === 'string' ? o : o.value));
      for (const row of rows.slice(0, 3)) {
        const val = row[fd.name];
        if (val !== null && val !== undefined && !validValues.has(val as string)) {
          issues.push({
            collection: collName,
            level: 'warn',
            message: `${fd.name}="${val}" is not a valid option. Valid: ${[...validValues].join(', ')}`,
          });
          break;
        }
      }
    }

    if (!m2oFields.length) passed++;
  }

  // Report
  const errors = issues.filter(i => i.level === 'error');
  const warns = issues.filter(i => i.level === 'warn');

  if (errors.length) {
    for (const i of errors) log(`  ✗ ${i.collection}: ${i.message}`);
  }
  if (warns.length) {
    for (const i of warns) log(`  ⚠ ${i.collection}: ${i.message}`);
  }
  if (!issues.length) {
    log(`  ✓ All ${collections.size} collections passed data verification`);
  }

  return { passed, failed: errors.length, issues };
}
