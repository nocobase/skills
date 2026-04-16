/**
 * Pre-deploy spec validation — catch bad DSL patterns BEFORE deployment.
 *
 * These are HARD rules that every AI agent must follow.
 * Errors block deployment. Warnings are logged but don't block.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PageSpec, BlockSpec, PopupSpec } from '../types/spec';
import type { PageInfo } from './page-discovery';
import { loadYaml } from '../utils/yaml';

export interface SpecIssue {
  level: 'error' | 'warn';
  page: string;
  block?: string;
  message: string;
}

/**
 * Validate all page specs before deployment.
 * Returns issues found. Errors should block deployment.
 */
export function validatePageSpecs(pages: PageInfo[], projectDir: string): SpecIssue[] {
  const issues: SpecIssue[] = [];

  for (const page of pages) {
    const blocks = page.layout.blocks || [];
    const tabs = page.layout.tabs;
    const allBlocks = tabs
      ? tabs.flatMap(t => t.blocks || [])
      : blocks;

    // Check each block
    for (const bs of allBlocks) {
      validateBlock(bs, page.title, page.popups, issues, projectDir);
    }

    // Check popups
    for (const ps of page.popups) {
      validatePopup(ps, page.title, issues, projectDir);
    }

    // Must have at least addNew popup + detail popup template for main table
    const tableBlocks = allBlocks.filter(b => b.type === 'table');
    for (const tb of tableBlocks) {
      const key = tb.key || 'table';
      const hasAddNew = page.popups.some(p => p.target?.includes(`${key}.actions.addNew`));
      if (!hasAddNew) {
        issues.push({ level: 'error', page: page.title, block: key, message: `table block "${key}" has no addNew popup — create popups/${key}.addNew.yaml` });
      }

      // Must have a detail popup (clickToOpen on some field)
      const fields = tb.fields || [];
      const hasClickToOpen = fields.some(f => {
        if (typeof f === 'object') {
          const fo = f as Record<string, unknown>;
          return fo.clickToOpen || fo.popup;
        }
        return false;
      });
      if (!hasClickToOpen) {
        issues.push({ level: 'error', page: page.title, block: key, message: `table "${key}" has no clickToOpen field — add popup: true to the name/title field` });
      }

      // recordActions should have view + edit
      const recActs = tb.recordActions || [];
      const recTypes = recActs.map(a => typeof a === 'string' ? a : (a as Record<string, unknown>).type as string);
      if (!recTypes.includes('view') && !recTypes.includes('edit')) {
        issues.push({ level: 'warn', page: page.title, block: key, message: `table "${key}" has no view/edit recordActions — add recordActions: [view, edit]` });
      }
    }

    // ── Dashboard validation ──
    const isDashboard = page.title.toLowerCase().includes('dashboard') || page.title.toLowerCase().includes('analytics');
    if (isDashboard) {
      const chartBlocks = allBlocks.filter(b => b.type === 'chart');
      const jsBlocks = allBlocks.filter(b => b.type === 'jsBlock');

      // Must have >= 5 chart blocks
      if (chartBlocks.length < 5) {
        issues.push({ level: 'error', page: page.title, message: `dashboard must have >= 5 chart blocks (has ${chartBlocks.length}). Add more charts with SQL + render config.` });
      }

      // Must have KPI cards (JS blocks) at the top
      if (!jsBlocks.length) {
        issues.push({ level: 'error', page: page.title, message: 'dashboard must have KPI card JS blocks at the top — copy CRM pattern (js: ./js/kpi_xxx.js)' });
      }

      // Validate chart configs
      for (const cb of chartBlocks) {
        const chartConfig = (cb as Record<string, unknown>).chart_config as string;
        if (!chartConfig) {
          issues.push({ level: 'error', page: page.title, block: cb.key, message: 'chart block missing chart_config file reference' });
          continue;
        }
        // Check SQL file exists
        const configPath = path.resolve(page.dir, chartConfig);
        if (fs.existsSync(configPath)) {
          const config = loadYaml<Record<string, unknown>>(configPath);
          const sqlFile = config?.sql_file as string;
          if (sqlFile) {
            const sqlPath = path.resolve(page.dir, sqlFile);
            if (!fs.existsSync(sqlPath)) {
              issues.push({ level: 'error', page: page.title, block: cb.key, message: `chart SQL file not found: ${sqlFile}` });
            }
          } else {
            issues.push({ level: 'error', page: page.title, block: cb.key, message: 'chart config missing sql_file' });
          }
          // Check render JS exists
          const renderFile = config?.render_file as string;
          if (renderFile) {
            const renderPath = path.resolve(page.dir, renderFile);
            if (!fs.existsSync(renderPath)) {
              issues.push({ level: 'error', page: page.title, block: cb.key, message: `chart render file not found: ${renderFile}` });
            }
          }
        } else {
          issues.push({ level: 'error', page: page.title, block: cb.key, message: `chart config not found: ${chartConfig}` });
        }
      }
    }
  }

  return issues;
}

function validateBlock(bs: BlockSpec, pageTitle: string, popups: PopupSpec[], issues: SpecIssue[], projectDir: string): void {
  const key = bs.key || bs.type;

  // ── Rule 1: filterForm MUST have field_layout (grid) ──
  if (bs.type === 'filterForm') {
    if (!bs.field_layout || !bs.field_layout.length) {
      issues.push({ level: 'error', page: pageTitle, block: key, message: 'filterForm MUST have field_layout with grid layout (e.g. [[field1, field2, field3]])' });
    } else {
      // Check layout quality — no single-field rows (except when only 1 field total)
      const fields = bs.fields || [];
      if (fields.length > 1) {
        for (const row of bs.field_layout) {
          if (Array.isArray(row) && row.length === 1 && typeof row[0] === 'string' && !row[0].startsWith('---') && !row[0].startsWith('[JS:')) {
            const fieldName = row[0];
            // Single input field on its own row is bad layout (unless it's the only search field)
            const isSearchField = typeof fields.find(f =>
              typeof f === 'object' && (f as Record<string, unknown>).field === fieldName && (f as Record<string, unknown>).filterPaths
            ) === 'object';
            if (!isSearchField) {
              issues.push({ level: 'warn', page: pageTitle, block: key, message: `filterForm field "${fieldName}" occupies entire row — combine with other fields (max 3-4 per row)` });
            }
          }
        }
      }
    }

    // ── Rule: filterForm max 3 fields ──
    const filterFields = (bs.fields || []).filter(f => typeof f === 'string' || (typeof f === 'object' && (f as Record<string, unknown>).field));
    if (filterFields.length > 3) {
      issues.push({ level: 'error', page: pageTitle, block: key, message: `filterForm 最多 3 个筛选字段（当前 ${filterFields.length} 个），多了影响布局` });
    }

    // ── Rule 2: filterForm MUST have JS stats button group ──
    const jsItems = (bs as Record<string, unknown>).js_items as unknown[];
    if (!Array.isArray(jsItems) || !jsItems.length) {
      issues.push({ level: 'error', page: pageTitle, block: key, message: 'filterForm 必须有 js_items 筛选按钮组，参考 templates/crm/js/customers_filterForm_1_*.js' });
    } else {
      // Check if JS files are just stubs
      for (const ji of jsItems) {
        const file = (ji as Record<string, unknown>).file as string;
        if (file) {
          try {
            const fs = require('fs');
            const path = require('path');
            // Try to resolve from project root (passed via context or relative)
            const content = fs.readFileSync(path.resolve(file), 'utf8').trim();
            if (/ctx\.render\s*\(\s*null\s*\)/.test(content) || content.startsWith('// TODO')) {
              issues.push({ level: 'error', page: pageTitle, block: key, message: `js_items "${file}" 是空占位符，参考 templates/crm/js/ 实现` });
            }
          } catch { /* file not found — will be caught at deploy time */ }
        }
      }
    }
    if (bs.field_layout?.length) {
      const firstRow = bs.field_layout[0];
      const firstRowHasJs = Array.isArray(firstRow)
        ? firstRow.some(item => typeof item === 'string' && item.startsWith('[JS:'))
        : (typeof firstRow === 'string' && firstRow.startsWith('[JS:'));
      if (!firstRowHasJs) {
        issues.push({ level: 'warn', page: pageTitle, block: key, message: 'filterForm JS button group should be on the first row of field_layout (独占一行，放在最上面)' });
      }
    }

    // ── Rule 6: filterForm must have submit + reset actions ──
    const actions = bs.actions || [];
    const actionTypes = actions.map(a => typeof a === 'string' ? a : (a as Record<string, unknown>).type as string);
    // Check for invalid table actions on filterForm
    for (const bad of ['filter', 'refresh', 'addNew']) {
      if (actionTypes.includes(bad)) {
        issues.push({ level: 'error', page: pageTitle, block: key, message: `filterForm has "${bad}" action — this is a table action, not valid on filterForm. Use submit/reset instead.` });
      }
    }
  }

  // ── Rule: chart/jsBlock/markdown must NOT have actions ──
  if (['chart', 'jsBlock', 'markdown'].includes(bs.type)) {
    const actions = bs.actions || [];
    if (actions.length) {
      const actionTypes = actions.map(a => typeof a === 'string' ? a : (a as Record<string, unknown>).type as string);
      issues.push({ level: 'error', page: pageTitle, block: key, message: `${bs.type} does NOT support actions (has: ${actionTypes.join(', ')}). Chart/jsBlock/markdown have no collection data source — adding "filter" causes "Invalid filter" crash.` });
    }
  }

  // ── Rule: chart SQL must not be demo/TODO data ──
  if (bs.type === 'chart' && (bs as Record<string, unknown>).chart_config) {
    const chartConfig = (bs as Record<string, unknown>).chart_config as string;
    if (chartConfig) {
      try {
        const sqlFile = path.resolve(projectDir, path.dirname(chartConfig), loadYaml<Record<string, unknown>>(path.resolve(projectDir, chartConfig))?.sql_file as string || '');
        if (fs.existsSync(sqlFile)) {
          const sql = fs.readFileSync(sqlFile, 'utf8');
          if (sql.includes('TODO:') || sql.includes('Category A') || sql.includes('UNION ALL SELECT')) {
            issues.push({ level: 'error', page: pageTitle, block: key, message: `chart SQL "${sqlFile}" 是 demo 数据，需要替换为真实查询` });
          }
        }
      } catch { /* skip */ }
    }
  }

  // ── Rule 4: createForm/editForm MUST have field_layout with sections ──
  if (['createForm', 'editForm'].includes(bs.type)) {
    if (!bs.field_layout || !bs.field_layout.length) {
      issues.push({ level: 'error', page: pageTitle, block: key, message: `${bs.type} MUST have field_layout with sections (--- Title ---) and grid layout` });
    } else {
      // Check: must have at least one section divider
      const hasDivider = bs.field_layout.some(row => typeof row === 'string' && row.startsWith('---'));
      if (!hasDivider) {
        issues.push({ level: 'error', page: pageTitle, block: key, message: `${bs.type} field_layout must have at least one section divider (--- Section Name ---)` });
      }
      // Check: no more than 4 fields per row
      for (const row of bs.field_layout) {
        if (Array.isArray(row) && row.length > 4) {
          issues.push({ level: 'warn', page: pageTitle, block: key, message: `${bs.type} row has ${row.length} fields — max 4 per row recommended` });
        }
      }
    }
  }

  // ── Rule 3: filterForm search with filterPaths should combine relation fields ──
  if (bs.type === 'filterForm') {
    const fields = bs.fields || [];
    const searchFields = fields.filter(f => typeof f === 'object' && (f as Record<string, unknown>).filterPaths);
    const plainFields = fields.filter(f => typeof f === 'string' || (typeof f === 'object' && !(f as Record<string, unknown>).filterPaths && !(f as Record<string, unknown>).label));
    // If there's a search field AND a plain relation field that could be merged into filterPaths
    for (const pf of plainFields) {
      const pfName = typeof pf === 'string' ? pf : (pf as Record<string, unknown>).field as string;
      // Common relation fields that should be in filterPaths instead of separate filters
      if (searchFields.length && ['project', 'customer', 'lead', 'contact', 'assignee', 'owner', 'member'].includes(pfName)) {
        issues.push({ level: 'warn', page: pageTitle, block: key, message: `filterForm has separate "${pfName}" filter — consider adding ${pfName}.name to Search filterPaths instead` });
      }
    }
  }
}

function validatePopup(ps: PopupSpec, pageTitle: string, issues: SpecIssue[], projectDir: string): void {
  const blocks = ps.blocks || [];
  const tabs = ps.tabs || [];

  // Check popup form blocks — including ref: template content
  for (const bs of blocks) {
    const bAny = bs as unknown as Record<string, unknown>;
    // If block is a ref: to template, validate template content
    if (bAny.ref && typeof bAny.ref === 'string') {
      const tplPath = path.resolve(projectDir, bAny.ref as string);
      if (fs.existsSync(tplPath)) {
        try {
          const tpl = loadYaml<Record<string, unknown>>(tplPath);
          const content = tpl.content as Record<string, unknown>;
          if (content) {
            validateBlock(content as any, `${pageTitle} popup [${tpl.name || bAny.ref}]`, [], issues, projectDir);
          }
        } catch { /* skip malformed */ }
      }
    } else {
      validateBlock(bs, `${pageTitle} popup`, [], issues, projectDir);
    }
  }
  for (const tab of tabs) {
    for (const bs of (tab.blocks || [])) {
      validateBlock(bs, `${pageTitle} popup tab`, [], issues, projectDir);
    }
  }
}
