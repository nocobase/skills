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

  // Build defaults.yaml popup-binding set: every target collection with a
  // `popups:` entry is considered "globally bound" — m2o fields pointing at
  // it don't need explicit clickToOpen. Without either, clicking the cell
  // 400s at runtime.
  const defaultsPopupColls = new Set<string>();
  const defaultsPopupPaths = new Map<string, string>(); // targetColl → popupTemplateRelPath
  const defaultsPath = path.join(projectDir, 'defaults.yaml');
  if (fs.existsSync(defaultsPath)) {
    try {
      const d = loadYaml<Record<string, unknown>>(defaultsPath);
      const popups = (d?.popups || {}) as Record<string, unknown>;
      for (const [coll, tplPath] of Object.entries(popups)) {
        defaultsPopupColls.add(coll);
        if (typeof tplPath === 'string') defaultsPopupPaths.set(coll, tplPath);
      }
    } catch { /* malformed defaults caught elsewhere */ }
  }

  // Collect every `clickToOpen: <string-path>` value across pages + popups.
  // Popup templates referenced by defaults.yaml must ALSO be inlined by at
  // least one clickToOpen somewhere — the deployer only materialises popup
  // templates by inlining them during page deploy. Without an inline usage
  // the template stays deferred and defaults.yaml m2o auto-binding can't
  // find it at runtime (silent 400).
  const inlinedPopupPaths = new Set<string>();
  const scanFieldsForClickToOpen = (fields: unknown) => {
    if (!Array.isArray(fields)) return;
    for (const f of fields) {
      if (!f || typeof f !== 'object') continue;
      const fo = f as Record<string, unknown>;
      const click = fo.clickToOpen;
      const rawPath = fo._clickToOpenPath;
      if (typeof click === 'string') inlinedPopupPaths.add(click);
      if (typeof rawPath === 'string') inlinedPopupPaths.add(rawPath);
    }
  };
  for (const page of pages) {
    for (const b of page.layout.blocks || []) scanFieldsForClickToOpen((b as Record<string, unknown>).fields);
    for (const t of page.layout.tabs || []) {
      for (const b of t.blocks || []) scanFieldsForClickToOpen((b as Record<string, unknown>).fields);
    }
    for (const p of page.popups || []) {
      for (const b of (p.blocks || []) as Record<string, unknown>[]) scanFieldsForClickToOpen(b.fields);
    }
  }

  // Build collection metadata: known names + m2o target map
  const collDir = path.join(projectDir, 'collections');
  const knownColls = new Set<string>();
  const collM2oTargets = new Map<string, Map<string, string>>(); // coll → { fieldName → targetColl }
  const collTitleFields = new Map<string, string>(); // coll → titleField name
  if (fs.existsSync(collDir)) {
    for (const f of fs.readdirSync(collDir).filter(f => f.endsWith('.yaml'))) {
      try {
        const c = loadYaml<Record<string, unknown>>(path.join(collDir, f));
        if (!c?.name) continue;
        const collName = c.name as string;
        knownColls.add(collName);
        collTitleFields.set(collName, (c.titleField || 'name') as string);
        const m2oMap = new Map<string, string>();
        const fks = new Set<string>();
        // Rule: collection YAML must not declare NocoBase's auto-managed system
        // columns. The deployer silently filters them, but callers benefit from
        // knowing the YAML is polluted — these entries are often copy-paste
        // residue from pulled specs that forgot to strip them.
        const SYS_COLS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById']);
        for (const fd of ((c.fields || []) as Record<string, unknown>[])) {
          if (SYS_COLS.has(fd.name as string)) {
            issues.push({ level: 'warn', page: `collection "${collName}"`, message: `field "${fd.name}" is a NocoBase system column — remove from YAML (auto-managed)` });
          }
          if (fd.interface === 'm2o' && fd.target) {
            m2oMap.set(fd.name as string, fd.target as string);
            const fk = (fd.foreignKey as string) || `${fd.name}Id`;
            fks.add(fk);
          }
        }
        // Rule: don't redefine auto-created FK columns (e.g. category_id alongside category m2o)
        // Downgraded to warning — NocoBase tolerates the duplicate column (the
        // m2o relation continues to work via its own FK), and existing CRM
        // exports include both forms. Blocking deploy on this is too strict.
        for (const fd of ((c.fields || []) as Record<string, unknown>[])) {
          if (fks.has(fd.name as string) && fd.interface !== 'm2o') {
            issues.push({ level: 'warn', page: `collection "${collName}"`, message: `field "${fd.name}" conflicts with m2o's foreignKey — safe to remove (FK is auto-created by NocoBase)` });
          }
        }
        if (m2oMap.size) collM2oTargets.set(collName, m2oMap);
      } catch { /* skip */ }
    }
  }

  // Error: defaults.yaml popup templates with no inline usage. The deployer's
  // template pipeline leaves them as "deferred" forever — they're never
  // materialised as live templates, so defaults.yaml m2o auto-binding fails
  // silently. Fix: add `clickToOpen: <same-path>` on at least one field so
  // the template gets inlined, promoted, and bindable.
  for (const [coll, tplPath] of defaultsPopupPaths) {
    if (!inlinedPopupPaths.has(tplPath)) {
      issues.push({
        level: 'error',
        page: `defaults.yaml`,
        message: `popup template "${tplPath}" (popups.${coll}) is never inlined — the deployer only materialises popup templates when a field uses them. Add "clickToOpen: ${tplPath}" on a field of any block displaying ${coll} records.`,
      });
    }
  }

  for (const page of pages) {
    const blocks = page.layout.blocks || [];
    const tabs = page.layout.tabs;
    const allBlocks = tabs
      ? tabs.flatMap(t => t.blocks || [])
      : blocks;

    // ── Hint: data-list pages should use multi-tab format ──
    // Flat layout.yaml with a single table + filterForm is OK for 1-entity
    // pages, but pages listing records benefit from tabs (All / Mine /
    // Archive / etc.) once they have any status/ownership slicing. The CRM
    // customers page shows this pattern. Warn only — single-tab is valid.
    const isListPage = !tabs && blocks.some(b => b.type === 'table');
    const hasFilterSelects = blocks.some(b =>
      b.type === 'filterForm' && (b.fields || []).some(f =>
        typeof f === 'object' && ['status', 'stage', 'state'].some(k =>
          ((f as Record<string, unknown>).field as string || '').toLowerCase().includes(k),
        ),
      ),
    );
    if (isListPage && hasFilterSelects) {
      issues.push({
        level: 'warn',
        page: page.title,
        message: `single-tab page with a status/stage filter — consider tabs (tab_active, tab_archived, ...). See templates/crm/pages/main/customers/ for the page.yaml + tab_*/layout.yaml pattern.`,
      });
    }

    // Check each block
    for (const bs of allBlocks) {
      validateBlock(bs, page.title, page.popups, issues, projectDir, knownColls);
    }

    // Check resource_binding.associationName format across all blocks + popup
    // blocks on this page. Must be "<full-collection-name>.<o2m-field>" — a
    // common mistake is using the short reverse-name ("project.tasks" instead
    // of "nb_pm_projects.tasks"), which NocoBase can't resolve at runtime
    // ("Collection project not found in data source main"). Accept any
    // collection in knownColls + NocoBase system collections.
    const SYS_COLLS = new Set(['users', 'roles', 'dataSources', 'collections', 'uiSchemas', 'applicationPlugins', 'mailMessages']);
    const scanAssoc = (blks: unknown[] | undefined, blockKeyFallback = ''): void => {
      if (!Array.isArray(blks)) return;
      for (const b of blks) {
        if (!b || typeof b !== 'object') continue;
        const bo = b as Record<string, unknown>;
        const rb = (bo.resource_binding || {}) as Record<string, unknown>;
        const assoc = rb.associationName;
        if (typeof assoc !== 'string' || !assoc.includes('.')) continue;
        const [prefix] = assoc.split('.');
        if (!knownColls.has(prefix) && !SYS_COLLS.has(prefix)) {
          issues.push({
            level: 'error',
            page: page.title,
            block: (bo.key as string) || blockKeyFallback,
            message: `associationName "${assoc}" uses short name "${prefix}" — must be the full collection name. If the o2m field lives on collection "nb_xxx_yyy", use "nb_xxx_yyy.${assoc.split('.').slice(1).join('.')}".`,
          });
        }
      }
    };
    scanAssoc(allBlocks as unknown[]);
    for (const p of page.popups) scanAssoc((p.blocks || []) as unknown[], p.target || '');

    // Validate the page/tab-level `layout:` specs
    if ((page.layout as { layout?: unknown[] }).layout) {
      validateLayoutSpec((page.layout as { layout: unknown[] }).layout, page.title, 'page', issues);
    }
    if (tabs) {
      for (const t of tabs) {
        const tLayout = (t as { layout?: unknown[] }).layout;
        if (tLayout) validateLayoutSpec(tLayout, page.title, `tab "${(t as { title?: string }).title || ''}"`, issues);
      }
    }

    // Check popups
    for (const ps of page.popups) {
      validatePopup(ps, page.title, issues, projectDir, knownColls);
      // Catch dead popup files: target=$SELF.<block>.fields.<field> where the
      // block doesn't declare that field. The deploy would log "ref not found
      // — popup NOT created" buried in the post-deploy errors. Surface it
      // pre-deploy so the user can either remove the popup file or add the
      // missing field. This was a recurring kimi-build trap (writing
      // table.fields.name.yaml when the table has no `name` field).
      const tgt = ps.target || '';
      const fieldsMatch = tgt.match(/\$(?:SELF|[a-z0-9_]+)\.([a-z0-9_]+)\.fields\.([a-z0-9_]+)/i);
      if (fieldsMatch) {
        const [, blockKey, fieldName] = fieldsMatch;
        const block = allBlocks.find(b => (b.key || b.type) === blockKey);
        if (block) {
          const blockFields = (block.fields || []).map(f => typeof f === 'string' ? f : (f.field || ''));
          if (blockFields.length && !blockFields.includes(fieldName)) {
            issues.push({
              level: 'warn',
              page: page.title,
              message: `popup "${tgt}" targets field "${fieldName}" but block "${blockKey}" doesn't declare it. Either add the field, or delete the popup file.`,
            });
          }
        }
      }
    }

    // Must have at least addNew popup + detail popup template for main table
    // Skip ref-derived blocks (popups live on the template, not the page)
    const tableBlocks = allBlocks.filter(b => b.type === 'table' && !(b as Record<string, unknown>)._fromRef);
    for (const tb of tableBlocks) {
      const key = tb.key || 'table';
      // Opt-in: only require addNew popup if the DSL declares addNew in actions
      const hasAddNewAction = (tb.actions || []).some(a =>
        (typeof a === 'string' ? a : (a as Record<string, unknown>).type) === 'addNew',
      );
      const hasAddNewPopup = page.popups.some(p => p.target?.includes(`${key}.actions.addNew`));
      if (hasAddNewAction && !hasAddNewPopup) {
        issues.push({ level: 'error', page: page.title, block: key, message: `table "${key}" has addNew action but no addNew popup — create popups/${key}.addNew.yaml` });
      }

      // Must have a detail popup (clickToOpen on some field)
      const blockColl = tb.coll || '';
      const m2oMap = collM2oTargets.get(blockColl);
      const fields = tb.fields || [];
      let hasClickToOpen = false;
      for (const f of fields) {
        if (typeof f !== 'object') continue;
        const fo = f as Record<string, unknown>;
        const fieldName = (fo.field || fo.fieldPath || '') as string;

        // Reject deprecated popup: syntax
        if ('popup' in fo && !fo.clickToOpen) {
          issues.push({ level: 'error', page: page.title, block: key, message: `field "${fieldName}": use "clickToOpen: true" instead of "popup:"` });
          continue;
        }

        if (!fo.clickToOpen) continue;
        hasClickToOpen = true;

        // Validate clickToOpen: path — check template collection matches expected
        const clickPath = (fo._clickToOpenPath || (typeof fo.clickToOpen === 'string' ? fo.clickToOpen : '')) as string;
        if (clickPath) {
          const tplPath = path.resolve(projectDir, clickPath);
          if (!fs.existsSync(tplPath)) {
            issues.push({ level: 'error', page: page.title, block: key, message: `field "${fieldName}": clickToOpen file not found: ${clickPath}` });
          } else {
            try {
              const tpl = loadYaml<Record<string, unknown>>(tplPath);
              const content = (tpl.content || tpl) as Record<string, unknown>;
              const tplColl = (content.coll || tpl.collectionName || '') as string;
              const isM2o = m2oMap?.has(fieldName);
              const expectedColl = isM2o ? m2oMap!.get(fieldName)! : blockColl;
              if (tplColl && expectedColl && tplColl !== expectedColl) {
                const context = isM2o ? `m2o field → target "${expectedColl}"` : `row field → own "${expectedColl}"`;
                issues.push({ level: 'error', page: page.title, block: key, message: `field "${fieldName}": clickToOpen template is for "${tplColl}" but field expects ${context}` });
              }
            } catch { /* skip parse errors — caught at deploy */ }
          }
        }
      }
      // Rule: every displayed m2o field must resolve to a popup at runtime.
      // Either the field itself has `clickToOpen: <path>`, or defaults.yaml
      // `popups:` has an entry for the target collection. Otherwise clicking
      // the cell 400s silently post-deploy.
      if (m2oMap) {
        for (const f of fields) {
          const fo = (typeof f === 'object' ? f : { field: f }) as Record<string, unknown>;
          const fieldName = (fo.field || fo.fieldPath || '') as string;
          if (!fieldName || !m2oMap.has(fieldName)) continue;
          const targetColl = m2oMap.get(fieldName)!;
          const hasExplicitPath = typeof fo.clickToOpen === 'string' || typeof fo._clickToOpenPath === 'string';
          const hasDefaultsBinding = defaultsPopupColls.has(targetColl);
          if (!hasExplicitPath && !hasDefaultsBinding) {
            issues.push({
              level: 'error',
              page: page.title,
              block: key,
              message: `m2o field "${fieldName}" (→ ${targetColl}) has no popup binding — clicking the cell will 400 at runtime. Either set "clickToOpen: templates/popup/<x>.yaml" on the field, or add "popups:\n  ${targetColl}: templates/popup/<x>.yaml" in defaults.yaml.`,
            });
          }
        }
      }

      // Only require clickToOpen if the table has no other record-level nav (no recordActions at all).
      // Tables with explicit recordActions (e.g. `type: link` custom detail buttons) don't need clickToOpen.
      const hasRecordActions = Array.isArray(tb.recordActions) && tb.recordActions.length > 0;
      if (!hasClickToOpen && !hasRecordActions) {
        const titleField = collTitleFields.get(blockColl) || 'name';
        issues.push({ level: 'error', page: page.title, block: key, message: `table "${key}" has no clickToOpen field and no recordActions — add "clickToOpen: true" to field "${titleField}" (opens ${blockColl} detail)` });
      }

      // recordActions are opt-in — no warning for tables without them
      // (dashboard tables intentionally have no row-level actions)

      // ── Rule: updateRecord with assign but no linkageRules ──
      // Toggle actions (Mark Done / Mark Achieved / etc.) that write a
      // target state SHOULD hide themselves once the record reaches that
      // state. Without linkageRules, the button stays visible on already-
      // toggled rows — clicks are idempotent but the UI is misleading.
      // Exception: if the block has a filter: that already excludes the
      // target state (e.g. tab_upcoming filters out achieved records),
      // the rule is technically redundant — but still encouraged so the
      // NB UI's "Linkage rules" panel shows authoring intent.
      for (const ra of (tb.recordActions || [])) {
        if (typeof ra !== 'object') continue;
        const raObj = ra as Record<string, unknown>;
        if (raObj.type !== 'updateRecord') continue;
        const assign = raObj.assign as Record<string, unknown> | undefined;
        if (!assign || !Object.keys(assign).length) continue;
        const rules = raObj.linkageRules;
        const hasRules = Array.isArray(rules)
          ? rules.length > 0
          : (rules && typeof rules === 'object' && Array.isArray((rules as Record<string, unknown>).value)
            ? ((rules as Record<string, unknown>).value as unknown[]).length > 0
            : false);
        if (!hasRules && !raObj.hiddenWhen && !raObj.disabledWhen) {
          const fieldName = Object.keys(assign)[0];
          const targetValue = assign[fieldName];
          issues.push({
            level: 'warn',
            page: page.title,
            block: key,
            message: `recordActions[${raObj.key || 'updateRecord'}] sets "${fieldName}: ${JSON.stringify(targetValue)}" but has no linkageRules — button will stay visible on rows already in that state. See templates/crm/pages/main/overview/layout.yaml (Done/Undone pattern) for the hide-when-already-${targetValue} shape.`,
          });
        }
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

/**
 * Sanity-check a page/tab/popup-level `layout:` spec.
 *
 * Catches the flat-vs-col authoring bug that produced the "Leads details
 * popup crammed into one horizontal row" symptom: a single row carrying
 * multiple `{key: size}` entries whose sizes total > 24 is almost always
 * a mis-authored `col: [...], size: N` — the user meant side-by-side
 * columns with internal vertical stacking, but wrote every block as its
 * own flat cell, so NocoBase's 24-grid overflows into a cramped strip.
 *
 * Shape: layout is an array of rows; each row is an array of cells;
 * each cell is either a string (full-width), `{key: size}`, or
 * `{col: [...], size}`. We flag rows where cells are ALL `{key: size}`
 * (no `col:`) and size-sum > 24.
 */
function validateLayoutSpec(
  layoutSpec: unknown,
  pageTitle: string,
  where: string,
  issues: SpecIssue[],
): void {
  if (!Array.isArray(layoutSpec)) return;
  for (let ri = 0; ri < layoutSpec.length; ri++) {
    const row = layoutSpec[ri];
    if (!Array.isArray(row) || row.length < 2) continue;
    let hasCol = false;
    let sizeSum = 0;
    let mappedCells = 0;
    for (const cell of row) {
      if (typeof cell === 'string') continue;
      if (cell && typeof cell === 'object') {
        const obj = cell as Record<string, unknown>;
        if (Array.isArray(obj.col)) { hasCol = true; break; }
        const entries = Object.entries(obj).filter(([k]) => k !== 'col' && k !== 'size');
        if (entries.length === 1) {
          const size = entries[0][1];
          if (typeof size === 'number' && size > 0) { sizeSum += size; mappedCells++; }
        }
      }
    }
    if (!hasCol && mappedCells >= 2 && sizeSum > 24) {
      issues.push({
        level: 'error', page: pageTitle,
        message: `${where} layout row ${ri + 1} has ${mappedCells} flat {key:size} cells summing to ${sizeSum} (>24) — must use \`col: [...], size: N\` to stack blocks vertically in side-by-side columns. Flat format renders as a cramped horizontal strip.`,
      });
    }
  }
}

function validateBlock(bs: BlockSpec, pageTitle: string, popups: PopupSpec[], issues: SpecIssue[], projectDir: string, knownColls?: Set<string>): void {
  const key = bs.key || bs.type;

  // ── Rule: ref: resolution failed ──
  if ('_refError' in bs) {
    issues.push({ level: 'error', page: pageTitle, block: key, message: `ref: failed — ${(bs as any)._refError}` });
    return;
  }

  // ── Rule: reference block must declare a template binding ──
  // A `- key: reference, type: reference` with no templateRef/ref deploys as
  // an orphan ReferenceBlockModel with null useTemplate — renders blank.
  // We hit this across Orders, Opportunities>Table, Emails after a copy
  // roundtrip. The exporter now has a fallback to block.stepParams.useTemplate,
  // but bare authoring still needs to be blocked so the UI never ships blank.
  if (bs.type === 'reference') {
    const tplUid = bs.templateRef?.templateUid;
    const hasTplName = !!bs.templateRef?.templateName;
    const fromRef = '_fromRef' in bs;
    if (!tplUid && !hasTplName && !fromRef) {
      issues.push({
        level: 'error', page: pageTitle, block: key,
        message: 'reference block requires `ref: templates/block/<file>.yaml` OR `templateRef: {templateUid, templateName, targetUid}`. A bare `type: reference` deploys an empty ReferenceBlockModel (visually blank).',
      });
    }
  }

  // ── Rule: field-bearing blocks MUST declare at least one field ──
  // Table / list / details / createForm / editForm with `fields: []` (or no
  // `fields:` at all) deploys as an empty shell — no columns visible, UI
  // just shows "No data" without even column headers. Happens most often
  // on nested popup blocks where the author forgot to copy fields from a
  // reference layout. Surface pre-deploy.
  const FIELD_BEARING_BLOCKS = new Set(['table', 'list', 'gridCard', 'details', 'createForm', 'editForm']);
  if (FIELD_BEARING_BLOCKS.has(bs.type)) {
    const hasFields = Array.isArray(bs.fields) && bs.fields.length > 0;
    // templateRef (reference block) is exempt — fields come from the template
    const isRef = bs.templateRef?.templateUid || (bs as Record<string, unknown>)._reference;
    if (!hasFields && !isRef) {
      issues.push({
        level: 'error',
        page: pageTitle,
        block: key,
        message: `${bs.type} block "${key}" has no fields declared — deploys as an empty shell. Add "fields: [<name>, ...]" (matching the block's collection).`,
      });
    }
  }

  // ── Rule: block coll must reference a known collection ──
  // Error when the block references a collection that's neither in
  // collections/*.yaml nor a NocoBase/plugin built-in. The deploy would
  // otherwise create a dangling block whose UI shows "Collection ... may
  // have been deleted" (NocoBase resolves coll at render time, not
  // deploy time). If the collection genuinely lives elsewhere (SQL view,
  // plugin table), add it to BLOCK_COLL_ALLOWLIST below.
  const BLOCK_COLL_ALLOWLIST = new Set([
    'users', 'roles', 'dataSources', 'collections', 'uiSchemas',
    'applicationPlugins', 'mailMessages', 'workflows', 'usersJobs',
    'attachments', 'files', 'storages',
  ]);
  if (bs.coll && knownColls?.size && !knownColls.has(bs.coll) && !BLOCK_COLL_ALLOWLIST.has(bs.coll)) {
    issues.push({
      level: 'error',
      page: pageTitle,
      block: key,
      message: `collection "${bs.coll}" not found — no collections/${bs.coll}.yaml and not a known built-in. Either create the collection YAML, remove the block, or add "${bs.coll}" to BLOCK_COLL_ALLOWLIST in spec-validator.ts if it's a plugin/view.`,
    });
  }

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
      issues.push({ level: 'error', page: pageTitle, block: key, message: `filterForm has too many filter fields (${filterFields.length}) — max 3 recommended for layout` });
    }

    // ── Rule 2: filterForm MUST have JS stats button group ──
    const jsItems = (bs as Record<string, unknown>).js_items as unknown[];
    if (!Array.isArray(jsItems) || !jsItems.length) {
      issues.push({ level: 'warn', page: pageTitle, block: key, message: 'filterForm has no js_items filter button group — see templates/crm/js/ for examples' });
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
              issues.push({ level: 'error', page: pageTitle, block: key, message: `js_items "${file}" is a placeholder — see templates/crm/js/ for implementation` });
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
        issues.push({ level: 'warn', page: pageTitle, block: key, message: 'filterForm JS button group should be on the first row of field_layout (full-width, topmost row)' });
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
            issues.push({ level: 'error', page: pageTitle, block: key, message: `chart SQL "${sqlFile}" contains demo data — replace with real queries` });
          }
        }
      } catch { /* skip */ }
    }
  }

  // SQL validation is done post-deploy by verifySqlFromPages (actual execution against DB)
  // No need for pattern matching here

  // ── Rule 4: createForm/editForm/details should have field_layout with sections ──
  // Quality rule — warn if missing (AI-authored DSL) but don't block (exported content
  // or legacy forms may lack sections; deploy still works).
  if (['createForm', 'editForm', 'details'].includes(bs.type)) {
    if (!bs.field_layout || !bs.field_layout.length) {
      issues.push({ level: 'warn', page: pageTitle, block: key, message: `${bs.type} should have field_layout with sections (--- Title ---) and grid layout` });
    } else {
      // Check: should have at least one section divider
      const hasDivider = bs.field_layout.some(row => typeof row === 'string' && row.startsWith('---'));
      if (!hasDivider) {
        issues.push({ level: 'warn', page: pageTitle, block: key, message: `${bs.type} field_layout should have at least one section divider (--- Section Name ---)` });
      }
      // Check: no more than 4 fields per row
      for (const row of bs.field_layout) {
        if (Array.isArray(row) && row.length > 4) {
          issues.push({ level: 'warn', page: pageTitle, block: key, message: `${bs.type} row has ${row.length} fields — max 4 per row recommended` });
        }
      }
      // Check: empty sections (divider followed by another divider or end)
      for (let i = 0; i < bs.field_layout.length; i++) {
        const row = bs.field_layout[i];
        if (typeof row === 'string' && row.startsWith('---')) {
          const next = bs.field_layout[i + 1];
          if (!next || (typeof next === 'string' && next.startsWith('---'))) {
            issues.push({ level: 'error', page: pageTitle, block: key, message: `${bs.type} field_layout has empty section "${row}" — add fields or remove the divider` });
          }
        }
      }
    }
  }

  // ── Rule 3: filterForm m2o fields need FK-based filterPaths ──
  // m2o fields in filterForm are valid (dropdown selector), but filterPaths
  // must use the FK column (assigneeId) not the relation name (assignee)
}

function validatePopup(ps: PopupSpec, pageTitle: string, issues: SpecIssue[], projectDir: string, knownColls?: Set<string>): void {
  // Reject deprecated popup: template path syntax
  if ('popup' in (ps as Record<string, unknown>)) {
    issues.push({ level: 'error', page: pageTitle, message: `popup "${ps.target}": use "blocks: [ref: ...]" instead of "popup: <path>"` });
  }

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
            validateBlock(content as any, `${pageTitle} popup [${tpl.name || bAny.ref}]`, [], issues, projectDir, knownColls);
          }
        } catch { /* skip malformed */ }
      }
    } else {
      validateBlock(bs, `${pageTitle} popup`, [], issues, projectDir, knownColls);
    }
  }
  for (const tab of tabs) {
    for (const bs of (tab.blocks || [])) {
      validateBlock(bs, `${pageTitle} popup tab`, [], issues, projectDir, knownColls);
    }
    const tLayout = (tab as { layout?: unknown[] }).layout;
    if (tLayout) validateLayoutSpec(tLayout, pageTitle, `popup [${ps.target}] tab "${tab.title || ''}"`, issues);
  }
  // Non-tabbed popups can also carry a top-level `layout:`
  const psLayout = (ps as { layout?: unknown[] }).layout;
  if (psLayout) validateLayoutSpec(psLayout, pageTitle, `popup [${ps.target}]`, issues);
}
