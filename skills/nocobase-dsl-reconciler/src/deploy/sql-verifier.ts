/**
 * SQL verification — test all chart/KPI SQL against live PostgreSQL.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { StructureSpec, BlockSpec } from '../types/spec';
import { loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';
import type { PageInfo } from './page-discovery';

interface SqlSource {
  label: string;
  sql: string;
  filePath: string;
}

/**
 * Verify all SQL in a module by running against live database.
 * Returns { passed, failed } counts.
 */
export async function verifySql(
  modDir: string,
  nb: NocoBaseClient,
  structure?: StructureSpec,
): Promise<{ passed: number; failed: number; results: { label: string; ok: boolean; rows?: number; error?: string }[] }> {
  const mod = path.resolve(modDir);

  if (!structure) {
    structure = loadYaml<StructureSpec>(path.join(mod, 'structure.yaml'));
  }

  const sources = collectSqlSources(mod, structure);
  const results: { label: string; ok: boolean; rows?: number; error?: string }[] = [];

  for (const { label, sql, filePath } of sources) {
    // Clean liquid/jinja templates
    let clean = sql.replace(/\{%\s*if\s+[^%]*%\}.*?\{%\s*endif\s*%\}/gs, '');
    clean = clean.split('\n').filter(l => !l.includes('{{') && !l.includes('{%')).join('\n').trim();

    try {
      const uid = `_verify_${label.replace(/[/. ]/g, '_')}`;
      const resp = await nb.http.post(`${nb.baseUrl}/api/flowSql:run`, {
        type: 'selectRows', uid, dataSourceKey: 'main', sql: clean, bind: {},
      });

      if (resp.status >= 400 || resp.data?.errors?.length) {
        const msg = resp.data?.errors?.[0]?.message || JSON.stringify(resp.data).slice(0, 200);
        results.push({ label, ok: false, error: msg });
      } else {
        const rows = resp.data?.data?.length || 0;
        results.push({ label, ok: rows > 0, rows, ...(rows === 0 ? { error: 'SQL returned 0 rows — check query or insert test data first' } : {}) });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ label, ok: false, error: msg });
    }
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  return { passed, failed, results };
}

function collectSqlSources(mod: string, structure: StructureSpec): SqlSource[] {
  const sources: SqlSource[] = [];

  for (const ps of structure.pages) {
    for (const bs of ps.blocks) {
      // Chart SQL
      const chartFile = bs.chart_config || '';
      if (chartFile) {
        const cfgPath = path.join(mod, chartFile);
        if (fs.existsSync(cfgPath) && (chartFile.endsWith('.yaml') || chartFile.endsWith('.yml'))) {
          try {
            const spec = loadYaml<Record<string, string>>(cfgPath);
            const sqlFile = spec.sql_file || '';
            const sql = (sqlFile && fs.existsSync(path.join(mod, sqlFile)))
              ? fs.readFileSync(path.join(mod, sqlFile), 'utf8')
              : spec.sql || '';
            if (sql) {
              sources.push({ label: `${ps.page}/${chartFile}`, sql, filePath: path.join(mod, sqlFile || chartFile) });
            }
          } catch { /* skip */ }
        }
      }

      // KPI JS embedded SQL
      if (bs.type === 'jsBlock' && bs.file) {
        const jsPath = path.join(mod, bs.file);
        if (fs.existsSync(jsPath)) {
          const code = fs.readFileSync(jsPath, 'utf8');
          const match = code.match(/sql:\s*`([^`]+)`/);
          if (match) {
            sources.push({ label: `${ps.page}/${bs.file}`, sql: match[1], filePath: jsPath });
          }
        }
      }
    }
  }

  return sources;
}

export interface SqlVerifyResult {
  passed: number;
  failed: number;
  results: { label: string; ok: boolean; rows?: number; error?: string }[];
}

/**
 * Verify SQL from project page directories (chart configs + KPI JS blocks).
 */
export async function verifySqlFromPages(
  nb: NocoBaseClient,
  pages: PageInfo[],
): Promise<SqlVerifyResult> {
  const results: { label: string; ok: boolean; rows?: number; error?: string }[] = [];

  for (const p of pages) {
    for (const bs of p.layout.blocks || []) {
      // Chart SQL
      if (bs.chart_config) {
        const cfgPath = path.join(p.dir, bs.chart_config);
        if (fs.existsSync(cfgPath) && (bs.chart_config.endsWith('.yaml') || bs.chart_config.endsWith('.yml'))) {
          try {
            const spec = loadYaml<Record<string, string>>(cfgPath);
            const sqlFile = spec.sql_file || '';
            const sql = (sqlFile && fs.existsSync(path.join(p.dir, sqlFile)))
              ? fs.readFileSync(path.join(p.dir, sqlFile), 'utf8')
              : spec.sql || '';
            if (sql) {
              const clean = sql.replace(/\{%.*?%\}/gs, '').split('\n').filter((l: string) => !l.includes('{{')).join('\n').trim();
              try {
                const uid = `_v_${slugify(p.title)}_${bs.key}`;
                const resp = await nb.http.post(`${nb.baseUrl}/api/flowSql:run`, {
                  type: 'selectRows', uid, dataSourceKey: 'main', sql: clean, bind: {},
                });
                if (resp.status >= 400 || resp.data?.errors?.length) {
                  results.push({ label: `${p.title}/${bs.chart_config}`, ok: false, error: resp.data?.errors?.[0]?.message });
                } else {
                  results.push({ label: `${p.title}/${bs.chart_config}`, ok: true, rows: resp.data?.data?.length });
                }
              } catch (e) { results.push({ label: `${p.title}/${bs.chart_config}`, ok: false, error: String(e) }); }
            }
          } catch { /* skip malformed chart config */ }
        }
      }
      // KPI JS
      if (bs.type === 'jsBlock' && bs.file) {
        const jsPath = path.join(p.dir, bs.file);
        if (fs.existsSync(jsPath)) {
          const code = fs.readFileSync(jsPath, 'utf8');
          const m = code.match(/sql:\s*`([^`]+)`/);
          if (m) {
            try {
              const uid = `_v_${slugify(p.title)}_${bs.key}`;
              const resp = await nb.http.post(`${nb.baseUrl}/api/flowSql:run`, {
                type: 'selectRows', uid, dataSourceKey: 'main', sql: m[1].trim(), bind: {},
              });
              if (resp.status >= 400) {
                results.push({ label: `${p.title}/${bs.file}`, ok: false, error: resp.data?.errors?.[0]?.message });
              } else {
                results.push({ label: `${p.title}/${bs.file}`, ok: true, rows: resp.data?.data?.length });
              }
            } catch (e) { results.push({ label: `${p.title}/${bs.file}`, ok: false, error: String(e) }); }
          }
        }
      }
    }
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  return { passed, failed, results };
}
