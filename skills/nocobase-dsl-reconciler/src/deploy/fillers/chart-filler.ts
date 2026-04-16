/**
 * Deploy chart configuration: SQL template + render JS.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BlockSpec } from '../../types/spec';
import type { DeployContext } from './types';
import { loadYaml } from '../../utils/yaml';

export async function deployChart(
  ctx: DeployContext,
  blockUid: string,
  bs: BlockSpec,
  modDir: string,
): Promise<void> {
  const { nb, log } = ctx;
  if (bs.type !== 'chart' || !bs.chart_config) return;

  const cfgPath = path.join(modDir, bs.chart_config);
  if (!fs.existsSync(cfgPath)) return;

  let config: Record<string, unknown>;

  if (bs.chart_config.endsWith('.yaml') || bs.chart_config.endsWith('.yml')) {
    const spec = loadYaml<Record<string, string>>(cfgPath);
    let sql = spec.sql || '';
    if (spec.sql_file) {
      const sf = path.join(modDir, spec.sql_file);
      if (fs.existsSync(sf)) sql = fs.readFileSync(sf, 'utf8');
    }
    let renderJs = spec.render || '';
    if (spec.render_file) {
      const rf = path.join(modDir, spec.render_file);
      if (fs.existsSync(rf)) renderJs = fs.readFileSync(rf, 'utf8');
    }
    config = {
      query: { mode: 'sql', sql },
      chart: { option: { mode: 'custom', raw: renderJs } },
    };
  } else {
    config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }

  await nb.updateModel(blockUid, { chartSettings: { configure: config } });

  const sql = (config.query as Record<string, unknown>)?.sql as string;
  if (sql) {
    // Save SQL template
    await nb.http.post(`${nb.baseUrl}/api/flowSql:save`, {
      type: 'selectRows', uid: blockUid,
      dataSourceKey: 'main', sql, bind: {},
    });

    // Try to run — report errors
    try {
      const clean = sql
        .replace(/\{%\s*if\s+[^%]*%\}.*?\{%\s*endif\s*%\}/gs, '')
        .split('\n').filter(l => !l.includes('{{') && !l.includes('{%')).join('\n');
      const resp = await nb.http.post(`${nb.baseUrl}/api/flowSql:run`, {
        type: 'selectRows', uid: blockUid,
        dataSourceKey: 'main', sql: clean, bind: {},
      });
      if (resp.status >= 400 || resp.data?.errors?.length) {
        const errMsg = resp.data?.errors?.[0]?.message || '';
        log(`    ! chart SQL error (${bs.chart_config}): ${errMsg}`);
      } else {
        log(`      + chart: ${bs.chart_config} (SQL verified)`);
      }
    } catch {
      log(`      + chart: ${bs.chart_config}`);
    }
  }
}
