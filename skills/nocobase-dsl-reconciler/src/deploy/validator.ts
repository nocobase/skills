/**
 * Pre-flight validation — check all specs before any API calls.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { StructureSpec, EnhanceSpec, BlockSpec, PageSpec, CollectionDef } from '../types/spec';
import { loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  plan: {
    collections: { name: string; status: 'new' | 'exists' }[];
    pages: { name: string; blocks: number; types: string[] }[];
    popups: { target: string; blocks: number }[];
  };
  structure: StructureSpec;
  enhance: EnhanceSpec;
}

// SQL patterns that indicate syntax errors
const SQL_PATTERNS: [RegExp, string][] = [
  [/DATE\s*\(\s*'now'/i, "DATE('now',...) is SQLite. FIX: use NOW() - '7 days'::interval"],
  [/strftime\s*\(/i, "strftime() is SQLite. FIX: use TO_CHAR(col, 'YYYY-MM')"],
  [/datetime\s*\(\s*'now'/i, "datetime('now') is SQLite. FIX: use NOW()"],
  [/GROUP_CONCAT\s*\(/i, "GROUP_CONCAT() is MySQL/SQLite. FIX: use STRING_AGG(col, ',')"],
  [/IFNULL\s*\(/i, "IFNULL() is SQLite. FIX: use COALESCE()"],
  [/\bcreated_at\b/, 'created_at is snake_case. FIX: use "createdAt" (NocoBase uses camelCase)'],
  [/\bupdated_at\b/, 'updated_at is snake_case. FIX: use "updatedAt" (NocoBase uses camelCase)'],
];

const SQL_KEYWORDS = new Set([
  'select', 'where', 'group', 'order', 'having', 'limit', 'union',
  'as', 'on', 'and', 'or', 'not', 'case', 'when', 'then', 'else',
  'end', 'with', 'true', 'false', 'null',
]);

export async function validate(
  modDir: string,
  nb?: NocoBaseClient,
): Promise<ValidationResult> {
  const mod = path.resolve(modDir);
  const errors: string[] = [];
  const warnings: string[] = [];
  const plan: ValidationResult['plan'] = { collections: [], pages: [], popups: [] };

  // ── Parse specs ──
  const structPath = path.join(mod, 'structure.yaml');
  if (!fs.existsSync(structPath)) {
    throw new Error(`structure.yaml not found in ${mod}`);
  }
  const structure = loadYaml<StructureSpec>(structPath);

  let enhance: EnhanceSpec = {};
  const enhancePath = path.join(mod, 'enhance.yaml');
  if (fs.existsSync(enhancePath)) {
    enhance = loadYaml<EnhanceSpec>(enhancePath) || {};
  }

  const collDefs = structure.collections || {};

  // ── Collection validation ──
  const allColls = new Set<string>();
  for (const ps of structure.pages) {
    if (ps.coll) allColls.add(ps.coll);
    for (const bs of ps.blocks) {
      if (bs.coll) allColls.add(bs.coll);
    }
  }

  if (nb) {
    for (const collName of allColls) {
      const exists = await nb.collections.exists(collName);
      const hasDef = collName in collDefs;
      plan.collections.push({ name: collName, status: exists ? 'exists' : 'new' });
      if (!exists && !hasDef) {
        errors.push(`Collection '${collName}' not found and no definition in structure.yaml`);
      }
    }
    for (const collName of Object.keys(collDefs)) {
      if (!allColls.has(collName)) {
        plan.collections.push({ name: collName, status: 'new' });
      }
    }
  }

  // ── Field validation ──
  if (nb) {
    for (const ps of structure.pages) {
      const pageColl = ps.coll || '';
      for (const bs of ps.blocks) {
        const bcoll = bs.coll || pageColl;
        if (!bcoll || ['jsBlock', 'chart', 'markdown', 'iframe', 'reference'].includes(bs.type)) continue;

        let meta: Record<string, { interface: string }> = {};
        try { meta = await nb.collections.fieldMeta(bcoll); } catch { continue; }

        for (const f of bs.fields || []) {
          const fp = typeof f === 'string' ? f : (f.field || f.fieldPath || '');
          if (!fp || fp.startsWith('[') || ['createdAt', 'updatedAt', 'id'].includes(fp)) continue;
          if (!(fp in meta) && !(bcoll in collDefs)) {
            errors.push(`Field '${bcoll}.${fp}' not found (page: ${ps.page})`);
          }
        }
      }
    }
  }

  // ── filterForm validation ──
  for (const ps of structure.pages) {
    for (const bs of ps.blocks) {
      if (bs.type !== 'filterForm') continue;
      const fields = bs.fields || [];
      if (fields.length > 3) {
        errors.push(`filterForm on page '${ps.page}' has ${fields.length} fields (max 3)`);
      }
    }
  }

  // ── Dashboard validation ──
  for (const ps of structure.pages) {
    if (!ps.page.toLowerCase().includes('dashboard')) continue;
    const types = ps.blocks.map(b => b.type);
    if (!types.includes('jsBlock')) {
      errors.push(
        `Dashboard page has no KPI cards (jsBlock). `
        + `FIX: run 'deployer --new' to scaffold, or add jsBlock with file: ./js/kpi_*.js`
      );
    }
    if (!types.includes('chart')) {
      errors.push(
        `Dashboard page has no chart blocks. `
        + `FIX: add chart blocks with chart_config: ./charts/*.yaml`
      );
    }
  }

  // ── Layout validation (>2 items must have explicit layout) ──
  for (const ps of structure.pages) {
    if (ps.blocks.length > 2 && !ps.layout) {
      errors.push(`Page '${ps.page}' has ${ps.blocks.length} blocks but no layout`);
    }
    for (const bs of ps.blocks) {
      if (['createForm', 'editForm', 'details'].includes(bs.type)) {
        const fields = bs.fields || [];
        if (fields.length > 2 && !bs.field_layout) {
          errors.push(`Block '${bs.key}' on '${ps.page}' has ${fields.length} fields but no field_layout`);
        }
      }
    }
  }

  // Popup form field_layout
  for (const ps of enhance.popups || []) {
    for (const bs of ps.blocks || []) {
      if (['createForm', 'editForm', 'details'].includes(bs.type)) {
        const fields = bs.fields || [];
        if (fields.length > 2 && !bs.field_layout) {
          errors.push(`Popup '${ps.target}' form has ${fields.length} fields but no field_layout`);
        }
      }
    }
  }

  // ── Chart validation ──
  for (const ps of structure.pages) {
    for (const bs of ps.blocks) {
      const chartFile = bs.chart_config || '';

      if (bs.type === 'chart' && !chartFile) {
        errors.push(`Chart block '${bs.key}' on page '${ps.page}' has no chart_config`);
        continue;
      }

      if (bs.type === 'chart' && chartFile) {
        const cfgPath = path.join(mod, chartFile);
        if (!fs.existsSync(cfgPath)) {
          errors.push(`Chart config not found: ${chartFile} (block '${bs.key}' on '${ps.page}')`);
          continue;
        }

        if (chartFile.endsWith('.yaml') || chartFile.endsWith('.yml')) {
          const spec = loadYaml<Record<string, string>>(cfgPath);
          const renderFile = spec.render_file || '';
          const hasRender = (renderFile && fs.existsSync(path.join(mod, renderFile))) || !!spec.render;
          if (!hasRender) {
            errors.push(
              `Chart '${chartFile}' has no render_file. `
              + `FIX: add render_file, copy a working render from templates/crm/pages/main/analytics/charts/`
            );
          }
          const sqlFile = spec.sql_file || '';
          const hasSql = (sqlFile && fs.existsSync(path.join(mod, sqlFile))) || !!spec.sql;
          if (!hasSql) {
            errors.push(`Chart '${chartFile}' has no sql_file or sql`);
          }

          // Validate SQL content
          const sql = sqlFile && fs.existsSync(path.join(mod, sqlFile))
            ? fs.readFileSync(path.join(mod, sqlFile), 'utf8')
            : spec.sql || '';
          if (sql) validateSql(sql, `chart ${chartFile}`, errors, allColls, collDefs);
        }
      }

      // KPI JS validation
      if (bs.type === 'jsBlock' && bs.file) {
        const jsPath = path.join(mod, bs.file);
        if (fs.existsSync(jsPath)) {
          const code = fs.readFileSync(jsPath, 'utf8');
          if (!code.includes('ctx.render') && !code.includes('ctx.React.createElement')) {
            errors.push(`JS block '${bs.file}' missing ctx.render(). FIX: copy a working KPI JS from templates/crm/pages/main/overview/js/`);
          }
          if (!code.includes('ctx.sql') && !code.includes('ctx.request')) {
            errors.push(`JS block '${bs.file}' has no data fetch (ctx.sql/ctx.request). FIX: copy a working KPI JS from templates/crm/pages/main/overview/js/`);
          }
          // Validate embedded SQL
          const sqlMatch = code.match(/sql:\s*`([^`]+)`/);
          if (sqlMatch) {
            validateSql(sqlMatch[1], `KPI ${bs.file}`, errors, allColls, collDefs);
          }
        }
      }
    }
  }

  // ── JS file references ──
  for (const ps of structure.pages) {
    for (const bs of ps.blocks) {
      if (bs.file && !fs.existsSync(path.join(mod, bs.file))) {
        errors.push(`JS file not found: ${bs.file} (page: ${ps.page})`);
      }
    }
  }

  // ── Build plan summary ──
  for (const ps of structure.pages) {
    plan.pages.push({
      name: ps.page,
      blocks: ps.blocks.length,
      types: ps.blocks.map(b => b.type),
    });
  }

  return { errors, warnings, plan, structure, enhance };
}

function validateSql(
  sql: string,
  source: string,
  errors: string[],
  allTables: Set<string>,
  collDefs: Record<string, CollectionDef>,
) {
  // Check SQLite syntax
  for (const [pattern, msg] of SQL_PATTERNS) {
    if (pattern.test(sql)) {
      errors.push(`SQL syntax error in ${source}: ${msg}`);
    }
  }

  // Check table references
  const tables = new Set([...allTables, ...Object.keys(collDefs)]);
  const tableRefs = sql.match(/(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi) || [];
  for (const ref of tableRefs) {
    const tbl = ref.replace(/^(FROM|JOIN)\s+/i, '');
    if (SQL_KEYWORDS.has(tbl.toLowerCase())) continue;
    if (!tables.has(tbl)) {
      errors.push(`SQL references non-existent table '${tbl}' (${source})`);
    }
  }
}
