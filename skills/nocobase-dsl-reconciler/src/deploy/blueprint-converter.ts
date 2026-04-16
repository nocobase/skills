/**
 * Convert our DSL (layout.yaml) to flowSurfaces:applyBlueprint document format.
 *
 * Blueprint = one API call to create a complete page:
 *   navigation (group + item) + page settings + tabs + blocks + fields +
 *   actions + recordActions + popups + layout + assets (JS/charts)
 *
 * Our DSL format (PageInfo):
 *   layout.yaml → { blocks, layout, coll, ... }
 *   page.yaml → { title, icon }
 *   popups/*.yaml → PopupSpec[]
 *   js/*.js → JS assets
 *   charts/*.yaml → chart configs
 *
 * This converter handles the mapping between these two formats.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BlockSpec, FieldSpec, PopupSpec, LayoutRow } from '../types/spec';
import type { PageInfo } from './page-discovery';
import { loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';
import { BLOCK_TYPE_TO_MODEL } from '../utils/block-types';

// ── Blueprint document types (matching NocoBase public-types.ts) ──

export interface BlueprintDocument {
  version: '1';
  mode: 'create' | 'replace';
  target?: { pageSchemaUid: string };
  navigation?: {
    group?: { routeId?: number; title?: string; icon?: string };
    item?: { title?: string; icon?: string };
  };
  page?: {
    title?: string;
    icon?: string;
    enableHeader?: boolean;
    enableTabs?: boolean;
    displayTitle?: boolean;
  };
  tabs: BlueprintTab[];
  assets?: {
    scripts?: Record<string, Record<string, unknown>>;
    charts?: Record<string, Record<string, unknown>>;
  };
}

export interface BlueprintTab {
  key: string;
  title?: string;
  icon?: string;
  blocks: BlueprintBlock[];
  layout?: { rows: (string | { key: string; span?: number })[][] };
}

export interface BlueprintBlock {
  key?: string;
  type?: string;
  title?: string;
  collection?: string;
  dataSourceKey?: string;
  binding?: string;
  associationField?: string;
  template?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  fields?: (string | Record<string, unknown>)[];
  actions?: (string | Record<string, unknown>)[];
  recordActions?: (string | Record<string, unknown>)[];
  script?: string;
  chart?: string;
}

// ── Converter ──

/**
 * Convert a PageInfo (our DSL) to a Blueprint document for applyBlueprint.
 *
 * @param page       Parsed page info from discoverPages
 * @param groupId    Existing group route ID (if known)
 * @param groupTitle Group title for creating new group
 * @param mode       'create' for new pages, 'replace' for updating existing
 * @param pageSchemaUid  For replace mode: the existing page's schema UID
 */
export function pageToBlueprint(
  page: PageInfo,
  opts: {
    groupId?: number;
    groupTitle?: string;
    mode?: 'create' | 'replace';
    pageSchemaUid?: string;
  } = {},
): BlueprintDocument {
  const mode = opts.mode || 'create';
  const blocks = page.layout.blocks || [];

  const tabs = page.layout.tabs;
  const isMultiTab = tabs && tabs.length > 1;

  // Collect all blocks across tabs for asset building
  const allBlocks = isMultiTab
    ? tabs.flatMap(t => t.blocks || [])
    : blocks;

  // Resolve tab directories for asset file paths
  const tabDirs = isMultiTab
    ? tabs.map(t => {
        const tabSlug = slugify(t.title || '');
        const tabDir = path.join(page.dir, `tab_${tabSlug}`);
        return fs.existsSync(tabDir) ? tabDir : page.dir;
      })
    : [page.dir];

  // Build assets from all tabs
  let assets: ReturnType<typeof buildAssets> = { scripts: {}, charts: {} };
  for (let ti = 0; ti < (isMultiTab ? tabs.length : 1); ti++) {
    const tabBlks = isMultiTab ? (tabs[ti].blocks || []) : blocks;
    const dir = tabDirs[ti] || page.dir;
    const tabKey = isMultiTab ? `tab${ti}` : 'main';
    const tabAssets = buildAssets(dir, tabBlks, tabKey);
    Object.assign(assets.scripts!, tabAssets.scripts || {});
    Object.assign(assets.charts!, tabAssets.charts || {});
  }

  // Build blueprint tabs
  const blueprintTabs: BlueprintTab[] = [];

  if (isMultiTab) {
    for (let ti = 0; ti < tabs.length; ti++) {
      const tab = tabs[ti];
      const tabKey = `tab${ti}`;
      const dir = tabDirs[ti] || page.dir;
      const tabBlks = (tab.blocks || []).map(bs => blockSpecToBlueprint(bs, dir, tabKey));
      const tabLayout = convertLayout(tab.layout as LayoutRow[] | undefined, tab.blocks || [], tabKey);
      blueprintTabs.push({
        key: tabKey,
        title: tab.title,
        blocks: tabBlks,
        ...(tabLayout ? { layout: tabLayout } : {}),
      });
    }
  } else {
    const tabBlks = blocks.map(bs => blockSpecToBlueprint(bs, page.dir, 'main'));
    const layout = convertLayout(page.layout.layout, blocks, 'main');
    blueprintTabs.push({
      key: 'main',
      title: page.title,
      blocks: tabBlks,
      ...(layout ? { layout } : {}),
    });
  }

  const doc: BlueprintDocument = {
    version: '1',
    mode,
    tabs: blueprintTabs,
    ...(Object.keys(assets.scripts || {}).length || Object.keys(assets.charts || {}).length
      ? { assets }
      : {}),
  };

  // Navigation (create mode)
  if (mode === 'create') {
    doc.navigation = {};
    if (opts.groupId) {
      doc.navigation.group = { routeId: opts.groupId };
    } else if (opts.groupTitle) {
      doc.navigation.group = { title: opts.groupTitle };
    }
    doc.navigation.item = { title: page.title, icon: page.icon };
  }

  // Page settings
  doc.page = {
    title: page.title,
    icon: page.icon,
    ...(isMultiTab ? { enableTabs: true } : {}),
  };

  // Replace mode target
  if (mode === 'replace' && opts.pageSchemaUid) {
    doc.target = { pageSchemaUid: opts.pageSchemaUid };
  }

  // Multi-tab pages (from pageMeta)
  if (page.pageMeta?.tabs && Array.isArray(page.pageMeta.tabs)) {
    // TODO: convert multi-tab layout to multiple BlueprintTab entries
  }

  return doc;
}

/**
 * Convert a BlockSpec to a Blueprint block.
 */
function blockSpecToBlueprint(bs: BlockSpec, pageDir: string, tabKey = 'main'): BlueprintBlock {
  const block: BlueprintBlock = {
    key: bs.key || bs.type,
  };

  // Map block type — validate against known block types from registry
  if (bs.type === 'reference') {
    // Reference block: type comes from template, blueprint infers it
    // Only set template, don't set type
  } else if (bs.type in BLOCK_TYPE_TO_MODEL) {
    block.type = bs.type;
  }

  // Collection
  if (bs.coll) block.collection = bs.coll;

  // Title
  if (bs.title) block.title = bs.title;

  // Template reference (from templateRef or reference block type)
  if (bs.templateRef) {
    block.template = {
      uid: bs.templateRef.templateUid,
      mode: bs.templateRef.mode || 'reference',
    };
  } else if (bs.type === 'reference') {
    // Reference block without templateRef — skip (will fallback to legacy)
    return block;
  }

  // Fields — filter out custom/unsupported fields
  if (bs.fields?.length) {
    const converted = bs.fields.map(convertField).filter(Boolean) as (string | Record<string, unknown>)[];
    if (converted.length) block.fields = converted;
  }

  // Actions — blueprint only accepts: key, type, title, settings, popup, script, chart
  // And only registered action types (link, ai, workflowTrigger etc. are not supported)
  const BLUEPRINT_ACTION_KEYS = new Set(['key', 'type', 'title', 'settings', 'popup', 'script', 'chart']);
  const BLUEPRINT_SUPPORTED_ACTIONS = new Set([
    'filter', 'refresh', 'addNew', 'delete', 'bulkDelete',
    'submit', 'reset', 'export', 'import', 'link',
    'edit', 'view', 'duplicate', 'updateRecord', 'addChild',
  ]);
  if (bs.actions?.length) {
    block.actions = bs.actions
      .filter(a => {
        const t = typeof a === 'string' ? a : (a as Record<string, unknown>).type as string;
        return BLUEPRINT_SUPPORTED_ACTIONS.has(t);
      })
      .map(a => {
        if (typeof a === 'string') return a;
        const src = a as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(src)) {
          if (BLUEPRINT_ACTION_KEYS.has(k)) out[k] = src[k];
        }
        return out;
      });
    if (!block.actions.length) delete block.actions;
  }

  // Record actions
  if (bs.recordActions?.length) {
    block.recordActions = bs.recordActions
      .filter(a => {
        const t = typeof a === 'string' ? a : (a as Record<string, unknown>).type as string;
        return BLUEPRINT_SUPPORTED_ACTIONS.has(t);
      })
      .map(a => {
        if (typeof a === 'string') return a;
        const src = a as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(src)) {
          if (BLUEPRINT_ACTION_KEYS.has(k)) out[k] = src[k];
        }
        return out;
      });
    if (!block.recordActions.length) delete block.recordActions;
  }

  // JS block: script asset reference
  if (bs.type === 'jsBlock' && bs.file) {
    const jsPath = path.resolve(pageDir, bs.file);
    if (fs.existsSync(jsPath)) {
      block.script = `${tabKey}.${bs.key || bs.type}`;
    }
  }

  // Chart: chart asset reference
  if (bs.type === 'chart' && bs.chart_config) {
    block.chart = `${tabKey}.${bs.key || bs.type}`;
  }

  // DataScope → settings (direct FilterGroup format: {logic, items})
  if (bs.dataScope) {
    if (!block.settings) block.settings = {};
    block.settings.dataScope = bs.dataScope;
  }

  // PageSize → settings (flat number)
  if (bs.pageSize) {
    if (!block.settings) block.settings = {};
    block.settings.pageSize = bs.pageSize;
  }

  // Resource binding
  if (bs.resource_binding) {
    block.binding = 'currentRecord';
  }
  if (bs.resource?.binding) {
    block.binding = bs.resource.binding;
  }
  if (bs.resource?.associationName) {
    block.associationField = bs.resource.associationName.split('.').pop();
  }

  return block;
}

/**
 * Convert a FieldSpec to blueprint field format.
 * Blueprint only accepts: key, field, associationPathName, renderer, type, label, target, settings, popup, script, chart
 */
const BLUEPRINT_FIELD_KEYS = new Set(['key', 'field', 'associationPathName', 'renderer', 'type', 'label', 'target', 'settings', 'popup', 'script', 'chart']);

function convertField(f: FieldSpec): string | Record<string, unknown> | null {
  if (typeof f === 'string') return f;
  if (f.field) {
    const result: Record<string, unknown> = { field: f.field };
    if (f.label) result.label = f.label;
    if (f.clickToOpen) result.popup = {};
    return result;
  }
  // Custom/non-standard fields (FilterFormCustomFieldModel etc.) — skip in blueprint
  const obj = f as unknown as Record<string, unknown>;
  if (obj.type === 'custom' || obj.fieldModel) return null;
  // Filter to allowed keys only
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (BLUEPRINT_FIELD_KEYS.has(k)) out[k] = obj[k];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Build assets map from JS and chart files.
 */
function buildAssets(
  pageDir: string,
  blocks: BlockSpec[],
  tabKey = 'main',
): { scripts?: Record<string, Record<string, unknown>>; charts?: Record<string, Record<string, unknown>> } {
  const scripts: Record<string, Record<string, unknown>> = {};
  const charts: Record<string, Record<string, unknown>> = {};

  for (const bs of blocks) {
    const key = `${tabKey}.${bs.key || bs.type}`;

    // JS blocks — script asset format: { code, version }
    if (bs.type === 'jsBlock' && bs.file) {
      const jsPath = path.resolve(pageDir, bs.file);
      if (fs.existsSync(jsPath)) {
        scripts[key] = { code: fs.readFileSync(jsPath, 'utf8') };
      }
    }

    // Charts — resolve sql_file/render_file to inline content
    if (bs.type === 'chart' && bs.chart_config) {
      const chartPath = path.resolve(pageDir, bs.chart_config);
      if (fs.existsSync(chartPath)) {
        try {
          const spec = loadYaml(chartPath) as Record<string, string>;

          // Read SQL
          let sql = spec.sql || '';
          if (spec.sql_file) {
            const sf = path.resolve(pageDir, spec.sql_file);
            if (fs.existsSync(sf)) sql = fs.readFileSync(sf, 'utf8');
          }

          // Read render JS
          let renderJs = spec.render || '';
          if (spec.render_file) {
            const rf = path.resolve(pageDir, spec.render_file);
            if (fs.existsSync(rf)) renderJs = fs.readFileSync(rf, 'utf8');
          }

          // Blueprint chart asset — merged into block configure settings
          charts[key] = {
            configure: {
              query: { mode: 'sql', sql },
              chart: { option: { mode: 'custom', raw: renderJs } },
            },
          };
        } catch { /* skip */ }
      }
    }
  }

  return {
    ...(Object.keys(scripts).length ? { scripts } : {}),
    ...(Object.keys(charts).length ? { charts } : {}),
  };
}

/**
 * Convert our layout DSL to blueprint layout format.
 *
 * Our format: LayoutRow[] = (string | { key: number })[][]
 * Blueprint format: { rows: (string | { key, span })[][] }
 */
function convertLayout(
  layoutSpec: LayoutRow[] | undefined,
  blocks: BlockSpec[],
  tabKey = 'main',
): { rows: (string | { key: string; span?: number })[][] } | undefined {
  if (!layoutSpec?.length) return undefined;

  // Build valid block key set + remap for orphan keys (e.g. "reference" → actual block key)
  const blockKeys = new Set(blocks.map(b => b.key || b.type));
  const keyRemap = new Map<string, string>();

  // If layout references a key not in blocks, try to find a matching block
  // (e.g. "reference" → the block with templateRef)
  for (const row of layoutSpec) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const cellKey = typeof cell === 'string' ? cell : Object.keys(cell)[0];
      if (cellKey && !blockKeys.has(cellKey)) {
        // Try to remap orphan layout keys to actual block keys
        if (cellKey === 'reference') {
          // "reference" in layout = a block with templateRef
          const refBlock = blocks.find(b => b.templateRef);
          if (refBlock) {
            keyRemap.set(cellKey, refBlock.key || refBlock.type);
          } else {
            // Fallback: find first block not yet mapped in layout
            const usedKeys = new Set(keyRemap.values());
            const unmapped = blocks.find(b => {
              const k = b.key || b.type;
              return !usedKeys.has(k) && k !== 'filterForm';
            });
            if (unmapped) keyRemap.set(cellKey, unmapped.key || unmapped.type);
          }
        }
      }
    }
  }

  const resolveKey = (k: string) => `${tabKey}.${keyRemap.get(k) || k}`;

  const rows: (string | { key: string; span?: number })[][] = [];
  for (const row of layoutSpec) {
    if (typeof row === 'string') continue;
    if (!Array.isArray(row)) continue;

    const cells: (string | { key: string; span?: number })[] = [];
    for (const cell of row) {
      if (typeof cell === 'string') {
        cells.push(resolveKey(cell));
      } else if (typeof cell === 'object') {
        for (const [key, span] of Object.entries(cell)) {
          cells.push({ key: resolveKey(key), span: span as number });
        }
      }
    }
    if (cells.length) rows.push(cells);
  }

  return rows.length ? { rows } : undefined;
}
