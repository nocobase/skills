/**
 * Export a single page (or multi-tab page) from live NocoBase → DSL.
 *
 * Entry point: `exportPage(nb, route, parentDir)` — walks the page's flowModel
 * tree, writes layout.yaml + popups/*.yaml + js/*.js + md/*.md for the caller.
 *
 * Internal helpers (not re-exported — they service exportPage only):
 *   exportSingleTab    Turn one tab's grid tree into layout.yaml + sub-blocks
 *   exportPopupsToDir  Serialize each popup target to popups/<key>.yaml
 *   exportGridBlocks   Walk grid items → block specs (calls exportBlock)
 *   exportLayout       Rebuild row/column layout from gridSettings
 *   copyTemplateJsFiles / moveEventFiles  Move JS files into their final
 *                                         locations after extraction.
 *
 * Any function that isn't called outside this file is deliberately not
 * exported. If a caller from elsewhere needs one of them, consider
 * refactoring at that point rather than widening the API surface.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { RouteInfo } from '../client/routes';
import type { FlowModelNode } from '../types/api';
import { exportBlock, lookupTemplateFile, simplifyPopup, TYPE_MAP, type PopupRef } from './block-exporter';
import { dumpYaml, loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';
import { stripDefaults } from '../utils/strip-defaults';
import { catchSwallow } from '../utils/swallow';


/**
 * Export one page to its own directory.
 */
export async function exportPage(
  nb: NocoBaseClient,
  route: RouteInfo,
  parentDir: string,
): Promise<void> {
  const pageTitle = route.title || 'untitled';
  const pageSlug = slugify(pageTitle);
  const pageDir = path.join(parentDir, pageSlug);
  // console.log(`  [exportPage] ${pageTitle} → ${pageDir}`);
  fs.mkdirSync(pageDir, { recursive: true });

  // Find tab schemaUid (child of flowPage with type=tabs)
  const children = route.children || [];
  const tabRoute = children.find(c => c.type === 'tabs');
  const tabUid = tabRoute?.schemaUid;

  if (!tabUid) {
    console.log(`  ! ${pageTitle}: no tab found, skipping`);
    return;
  }

  // page.yaml — metadata
  const pageMeta: Record<string, unknown> = {
    title: pageTitle,
    icon: route.icon || 'fileoutlined',
    route_id: route.id,
    schema_uid: route.schemaUid,
    tab_uid: tabUid,
  };
  fs.writeFileSync(path.join(pageDir, 'page.yaml'), dumpYaml(pageMeta));

  // Check if multi-tab page — read from RootPageModel (route.schemaUid)
  let tabs: { uid: string; title: string; icon?: string }[] = [];
  try {
    const pageData = await nb.get({ uid: route.schemaUid || '' });
    const rawTabs = pageData.tree.subModels?.tabs;
    const tabArr = (Array.isArray(rawTabs) ? rawTabs : rawTabs ? [rawTabs] : []) as FlowModelNode[];
    // Also read tab icons from route children
    const routeTabs = (route.children || []).filter(c => c.type === 'tabs');
    tabs = tabArr.map((t, i) => {
      // NocoBase stores tab title in pageTabSettings.tab.title (current NB).
      // Older builds used pageTabSettings.title.title — we read both as a
      // fallback chain so pulls survive across NB versions.
      const tabSettings = ((t.stepParams as Record<string, unknown>)?.pageTabSettings as Record<string, unknown>) || {};
      const tabBlock = tabSettings.tab as Record<string, unknown> | undefined;
      const titleBlock = tabSettings.title as Record<string, unknown> | undefined;
      const title = (tabBlock?.title as string)
        || (titleBlock?.title as string)
        || ((t as unknown as Record<string, unknown>).props as Record<string, unknown>)?.title as string
        || routeTabs[i]?.title
        || `Tab${i}`;
      const icon = routeTabs[i]?.icon || '';
      return { uid: t.uid, title, icon };
    });
  } catch (e) { catchSwallow(e, 'single tab fallback'); }

  // If only 1 tab, export normally. If multi-tab, export each tab.
  if (tabs.length <= 1) {
    // Single tab — read from tabSchemaUid
    let tree: FlowModelNode;
    try {
      const data = await nb.get({ tabSchemaUid: tabUid });
      tree = data.tree;
    } catch {
      try {
        const data = await nb.get({ uid: tabUid });
        tree = data.tree;
      } catch {
        console.log(`  ! ${pageTitle}: failed to read content`);
        return;
      }
    }

    const grid = tree.subModels?.grid;
    if (!grid || Array.isArray(grid)) {
      console.log(`  ~ ${pageTitle} (empty)`);
      return;
    }

    await exportSingleTab(nb, grid as FlowModelNode, pageDir, pageSlug, pageMeta);
  } else {
    // Multi-tab — export each tab separately
    pageMeta.tabs = tabs.map(t => t.icon ? { title: t.title, icon: t.icon } : t.title);
    fs.writeFileSync(path.join(pageDir, 'page.yaml'), dumpYaml(pageMeta));

    for (let ti = 0; ti < tabs.length; ti++) {
      const tab = tabs[ti];
      const tabSlug = slugify(tab.title);
      const tabDir = path.join(pageDir, `tab_${tabSlug}`);
      fs.mkdirSync(tabDir, { recursive: true });

      try {
        const tabData = await nb.get({ uid: tab.uid });
        const tabGrid = tabData.tree.subModels?.grid;
        if (tabGrid && !Array.isArray(tabGrid)) {
          await exportSingleTab(nb, tabGrid as FlowModelNode, tabDir, `${pageSlug}_${tabSlug}`, { title: tab.title });
        }
      } catch {
        console.log(`    ! tab '${tab.title}': failed to read`);
      }
    }

    console.log(`  + ${pageTitle}: ${tabs.length} tabs`);
    return;
  }

}

/**
 * Export a single tab's grid into a directory (layout.yaml + js/ + charts/ + popups/).
 */
async function exportSingleTab(
  nb: NocoBaseClient,
  gridNode: FlowModelNode,
  outDir: string,
  prefix: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const jsDir = path.join(outDir, 'js');
  const popupsDir = path.join(outDir, 'popups');
  const eventsDir = path.join(outDir, 'events');

  const rawItems = gridNode.subModels?.items;
  let items = (Array.isArray(rawItems) ? rawItems : []) as FlowModelNode[];

  // Sort items by layout display order (gridSettings.grid.rows) for deterministic key assignment
  const gridSettings = (gridNode.stepParams as Record<string, unknown>)?.gridSettings as Record<string, unknown>;
  const gridRows = (gridSettings?.grid as Record<string, unknown>)?.rows as Record<string, string[][]> | undefined;
  if (gridRows) {
    const uidOrder = new Map<string, number>();
    let order = 0;
    for (const rowCells of Object.values(gridRows)) {
      if (Array.isArray(rowCells)) {
        for (const cell of rowCells) {
          if (Array.isArray(cell)) {
            for (const uid of cell) {
              if (typeof uid === 'string') uidOrder.set(uid, order++);
            }
          }
        }
      }
    }
    if (uidOrder.size) {
      items = [...items].sort((a, b) => {
        const oa = uidOrder.get(a.uid) ?? 999;
        const ob = uidOrder.get(b.uid) ?? 999;
        return oa - ob;
      });
    }
  }

  const usedKeys = new Set<string>();

  const blocks: Record<string, unknown>[] = [];
  const blockUidToKey = new Map<string, string>();
  const allPopupRefs: PopupRef[] = [];

  for (let i = 0; i < items.length; i++) {
    const exported = await exportBlock(items[i], jsDir, prefix, i, usedKeys, outDir, nb);
    if (!exported) continue;

    const spec = { ...exported.spec };
    delete spec._popups;

    // ReferenceBlockModel: look up templateUid.
    //
    // Two sources, in order:
    //   1. flowModelTemplateUsages — the normal path.
    //   2. The block's own stepParams.referenceSettings.useTemplate.templateUid
    //      — fallback when usages is missing (NocoBase's cascade bug:
    //      flowModelTemplateUsages rows aren't always in sync with the
    //      ReferenceBlockModel's own useTemplate binding; older bindings
    //      set directly via UI never land in usages). Without this fallback
    //      the exporter writes bare `type: reference` and the downstream
    //      duplicate-project / push roundtrip loses the template pointer,
    //      deploying blank reference blocks.
    if (spec.type === 'reference' && items[i].uid) {
      try {
        let templateUid: string | undefined;
        const usageResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, {
          params: { 'filter[modelUid]': items[i].uid, paginate: 'false' },
        });
        const usages = usageResp.data.data || [];
        if (usages.length) templateUid = usages[0].templateUid as string;
        if (!templateUid) {
          // Fallback: read useTemplate straight from the block's options via
          // flowModels:get (flowSurfaces:get returns a rendered view that
          // doesn't always preserve stepParams literally).
          try {
            const raw = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: items[i].uid } });
            const rawOpts = raw.data?.data as Record<string, unknown> | undefined;
            const rs = ((rawOpts?.stepParams as Record<string, unknown>)?.referenceSettings as Record<string, unknown>) || {};
            const ut = (rs.useTemplate as Record<string, unknown>) || {};
            if (ut.templateUid) templateUid = ut.templateUid as string;
          } catch (e) { catchSwallow(e, 'best effort'); }
        }
        if (templateUid) {
          // Try simplified ref: templates/xxx.yaml
          const tplFile = lookupTemplateFile(templateUid, outDir);
          if (tplFile) {
            // Replace spec with simplified ref
            const blockKey = spec.key;
            for (const k of Object.keys(spec)) delete spec[k];
            spec.ref = tplFile;
            spec.key = blockKey;
          } else {
            // Fallback: keep templateRef
            try {
              const tmplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, {
                params: { filterByTk: templateUid },
              });
              const tmpl = tmplResp.data.data;
              spec.templateRef = {
                templateUid,
                templateName: tmpl?.name || '',
                targetUid: tmpl?.targetUid || '',
                mode: 'reference',
              };
            } catch {
              spec.templateRef = { templateUid, mode: 'reference' };
            }
          }
        }
      } catch (e) { catchSwallow(e, 'best effort'); }
    }

    // Move event flow files from js/ to events/
    const eventFlows = spec.event_flows as Record<string, unknown>[];
    if (eventFlows?.length) {
      fs.mkdirSync(eventsDir, { recursive: true });
      for (const ef of eventFlows) {
        if (ef.file && typeof ef.file === 'string') {
          const fname = (ef.file as string).replace('./js/', '');
          ef.file = `./events/${fname}`;
        }
      }
      moveEventFiles(jsDir, eventsDir);
    }

    blocks.push(spec);
    blockUidToKey.set(items[i].uid, exported.key);
    allPopupRefs.push(...exported.popupRefs);
  }

  // Reference blocks: keep as-is (templateRef preserved from lookup above)
  for (const b of blocks) {
    delete (b as Record<string, unknown>)._reference;
  }

  // Supplement popupTemplateUid from flowModels:get (flowSurfaces:get strips it)
  for (const b of blocks) {
    if ((b as Record<string, unknown>).type !== 'table') continue;
    const blockKey = (b as Record<string, unknown>).key as string;
    const blockUid = [...blockUidToKey.entries()].find(([, k]) => k === blockKey)?.[0];
    const item = items.find(it => it.uid === blockUid);
    if (!item) continue;
    const tblCols = (Array.isArray(item.subModels?.columns) ? item.subModels.columns : []) as FlowModelNode[];
    const fields = (b as Record<string, unknown>).fields as unknown[];
    if (!Array.isArray(fields)) continue;

    for (const col of tblCols) {
      const fp = ((col.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)?.init as Record<string, unknown>;
      const fieldPath = (fp?.fieldPath || '') as string;
      if (!fieldPath) continue;
      const fieldModel = col.subModels?.field;
      if (!fieldModel || Array.isArray(fieldModel)) continue;
      const fieldUid = (fieldModel as FlowModelNode).uid;
      if (!fieldUid) continue;
      try {
        const raw = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: fieldUid } });
        const rawOv = raw.data.data?.stepParams?.popupSettings?.openView;
        if (!rawOv?.popupTemplateUid) continue;
        let fieldSpec = fields.find(f => typeof f === 'object' && (f as Record<string, unknown>).field === fieldPath) as Record<string, unknown> | undefined;
        if (!fieldSpec) {
          const idx = fields.indexOf(fieldPath);
          if (idx >= 0) { fieldSpec = { field: fieldPath, clickToOpen: true }; fields[idx] = fieldSpec; }
          else continue;
        }
        if (!fieldSpec.popupSettings) {
          fieldSpec.clickToOpen = true;
          fieldSpec.popupSettings = { collectionName: rawOv.collectionName || '', mode: rawOv.mode || 'drawer', size: rawOv.size || 'medium', filterByTk: rawOv.filterByTk || '{{ ctx.record.id }}' };
        }
        (fieldSpec.popupSettings as Record<string, unknown>).popupTemplateUid = rawOv.popupTemplateUid;
        // Simplify clickToOpen + popupSettings → popup shorthand
        simplifyPopup(fieldSpec, outDir);
        // Add popup ref
        if (!allPopupRefs.some(r => r.field_uid === fieldUid)) {
          allPopupRefs.push({ field: fieldPath, field_uid: fieldUid, block_key: blockKey, target: `$SELF.${blockKey}.fields.${fieldPath}` });
        }
      } catch (e) { catchSwallow(e, 'skip'); }
    }
  }

  // Fields with popup template: keep as reference (don't inline template content)

  // Enrich filterForm fields with per-target binding (filterPaths + label).
  // The real binding lives on each FilterFormItem's
  //   stepParams.filterFormItemSettings.connectFields.value.targets[]
  // (an array of {targetId, filterPaths}). The page-level grid's
  // filterManager often stays empty in newer NB builds, so reading from
  // there alone produces flat filterPaths that get broadcast to ALL
  // target blocks at deploy time — fine for single-table pages, but
  // breaks multi-table lookups (e.g. leads vs customers vs contacts have
  // different filterable columns).
  try {
    // blockUidToKey is uid→key already (set on line ~620). Use directly to
    // translate connectFields targetIds back to stable DSL block keys.
    for (const b of blocks) {
      const br = b as Record<string, unknown>;
      if (br.type !== 'filterForm') continue;
      const fields = br.fields as unknown[];
      if (!Array.isArray(fields)) continue;

      for (const rawItem of items) {
        if (rawItem.use !== 'FilterFormBlockModel') continue;
        const ffGrid = rawItem.subModels?.grid;
        const ffItems = (ffGrid && !Array.isArray(ffGrid))
          ? ((ffGrid as FlowModelNode).subModels?.items || []) as FlowModelNode[]
          : [];

        const enriched: unknown[] = [];
        for (const f of fields) {
          const fpName = typeof f === 'string' ? f : (f as Record<string, unknown>).field as string || (f as Record<string, unknown>).name as string || '';
          if (!fpName || (typeof f === 'object' && (f as Record<string, unknown>).type === 'custom')) {
            enriched.push(f);
            continue;
          }
          const ffItem = ffItems.find(gi => {
            const giFp = ((gi.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
              ?.init as Record<string, unknown>;
            return (giFp?.fieldPath as string) === fpName;
          });
          const itemSettings = ffItem
            ? ((ffItem.stepParams as Record<string, unknown>)?.filterFormItemSettings as Record<string, unknown>)
            : undefined;

          // Pull per-target paths from connectFields.value.targets[]
          const targetsRaw = ((itemSettings?.connectFields as Record<string, unknown>)?.value as Record<string, unknown>)
            ?.targets as { targetId: string; filterPaths: string[] }[] | undefined;
          const labelText = (itemSettings?.label as Record<string, unknown>)?.label as string || '';

          let perTarget: { block: string; paths: string[] }[] | undefined;
          if (Array.isArray(targetsRaw) && targetsRaw.length) {
            perTarget = [];
            for (const t of targetsRaw) {
              const blockKey = uidToBlockKey.get(t.targetId);
              if (blockKey && t.filterPaths?.length) {
                perTarget.push({ block: blockKey, paths: t.filterPaths });
              }
            }
            if (!perTarget.length) perTarget = undefined;
          }

          if (perTarget || labelText) {
            const entry: Record<string, unknown> = { field: fpName };
            if (labelText) entry.label = labelText;
            if (perTarget) {
              // Single-target: collapse to flat filterPaths for backward compat
              if (perTarget.length === 1) entry.filterPaths = perTarget[0].paths;
              else entry.targets = perTarget;
            }
            enriched.push(entry);
          } else {
            enriched.push(f);
          }
        }
        br.fields = enriched;
        break;
      }
    }
  } catch (e) { catchSwallow(e, 'connectFields read failed — fields stay plain'); }

  // Infer coll for filterForm from sibling table/reference/form blocks
  const pageColl = blocks.find(b => {
    const br = b as Record<string, unknown>;
    return (br.type === 'table' || br.type === 'createForm') && br.coll;
  })
    ?.coll as string || '';
  for (const b of blocks) {
    const br = b as Record<string, unknown>;
    if (br.type === 'filterForm' && !br.coll && pageColl) {
      br.coll = pageColl;
    }
  }

  // Strip default/empty values from all block specs
  const cleanedBlocks = blocks.map(b => stripDefaults(b) as Record<string, unknown>);

  // Layout
  const layout = exportLayout(gridNode, blockUidToKey);
  const layoutSpec: Record<string, unknown> = { blocks: cleanedBlocks };
  // Skip trivial layout (single block, single row) — only export when layout adds info
  const isTrivialLayout = layout.length === 1 && Array.isArray(layout[0]) && (layout[0] as unknown[]).length === 1;
  if (layout.length && !isTrivialLayout) layoutSpec.layout = layout;
  fs.writeFileSync(path.join(outDir, 'layout.yaml'), dumpYaml(layoutSpec));

  // Popups
  if (allPopupRefs.length) {
    fs.mkdirSync(popupsDir, { recursive: true });
    await exportPopupsToDir(nb, allPopupRefs, popupsDir, jsDir, prefix, outDir);
  }

  // Clean empty dirs
  for (const d of [jsDir, path.join(outDir, 'charts'), popupsDir, eventsDir]) {
    try {
      if (fs.existsSync(d) && !fs.readdirSync(d).length) fs.rmdirSync(d);
    } catch (e) { catchSwallow(e, 'skip'); }
  }

  console.log(`  + ${meta.title || prefix}: ${blocks.length} blocks, ${allPopupRefs.length} popups`);
}

/**
 * Export popups to individual files in popups/ directory.
 */
async function exportPopupsToDir(
  nb: NocoBaseClient,
  refs: PopupRef[],
  popupsDir: string,
  jsDir: string,
  prefix: string,
  projectDir: string | null = null,
  exportedUids = new Set<string>(),
  depth = 0,
): Promise<void> {
  if (depth > 8) return;

  for (const ref of refs) {
    if (exportedUids.has(ref.field_uid)) continue;
    exportedUids.add(ref.field_uid);

    try {
      // Use flowModels:findOne (full stepParams) instead of flowSurfaces:get
      // (strips referenceSettings.useTemplate on Reference children).
      const node = await nb.models.findOne(ref.field_uid, true);
      if (!node) continue;
      const tree = node as unknown as FlowModelNode;

      // Check if popup uses a template — if so, read content from template file
      const openView = ((tree.stepParams as Record<string, unknown>)?.popupSettings as Record<string, unknown>)
        ?.openView as Record<string, unknown>;
      const popupTemplateUid = openView?.popupTemplateUid as string;

      if (popupTemplateUid) {
        // Read from template file (already exported to templates/)
        let resolved = false;
        for (let d = path.dirname(popupsDir); d !== path.dirname(d); d = path.dirname(d)) {
          const tplIndexFile = path.join(d, 'templates', '_index.yaml');
          if (!fs.existsSync(tplIndexFile)) continue;
          const tplIndex = loadYaml<Record<string, unknown>[]>(tplIndexFile) || [];
          const tplEntry = tplIndex.find(t => t.uid === popupTemplateUid);
          if (tplEntry?.file) {
            const tplFile = path.join(d, 'templates', tplEntry.file as string);
            if (fs.existsSync(tplFile)) {
              const tplSpec = loadYaml<Record<string, unknown>>(tplFile);
              const content = tplSpec.content as Record<string, unknown>;
              if (content) {
                // Keep as template reference — don't expand content
                const popupSpec: Record<string, unknown> = {
                  target: ref.target || ref.field,
                  mode: (openView?.mode as string) || 'drawer',
                  popupTemplate: {
                    uid: popupTemplateUid,
                    name: (tplEntry as Record<string, unknown>).name || '',
                  },
                };
                const fname = ref.block_key
                  ? `${ref.block_key}.${ref.field}.yaml`
                  : `${ref.field}.yaml`;
                fs.writeFileSync(path.join(popupsDir, fname), dumpYaml(popupSpec));
                resolved = true;
              }
            }
          }
          break;
        }
        if (resolved) continue; // skip live tree reading for this ref
      }

      const popupPage = tree.subModels?.page;
      if (!popupPage || Array.isArray(popupPage)) continue;

      const popupNode = popupPage as FlowModelNode;
      const mode = openView;

      const rawTabs = popupNode.subModels?.tabs;
      const tabs = Array.isArray(rawTabs) ? rawTabs : rawTabs ? [rawTabs] : [];

      const popupSpec: Record<string, unknown> = {
        target: ref.target || ref.field,
        mode: (mode?.mode as string) || 'drawer',
      };

      const nestedPopupRefs: PopupRef[] = [];

      if (tabs.length <= 1) {
        // Single tab
        const tabGrid = tabs.length ? (tabs[0] as FlowModelNode).subModels?.grid : null;
        if (tabGrid && !Array.isArray(tabGrid)) {
          const { blocks, popupRefs: nested, layout: popupLayout } = await exportGridBlocks(nb, tabGrid as FlowModelNode, jsDir, `${prefix}_${ref.field}`, projectDir);
          popupSpec.blocks = blocks;
          const isTrivial = popupLayout?.length === 1 && Array.isArray(popupLayout[0]) && (popupLayout[0] as unknown[]).length === 1;
          if (popupLayout?.length && !isTrivial) popupSpec.layout = popupLayout;
          nestedPopupRefs.push(...nested);
        }
      } else {
        // Multi-tab
        const tabSpecs: Record<string, unknown>[] = [];
        for (let i = 0; i < tabs.length; i++) {
          const tab = tabs[i] as FlowModelNode;
          // Same dual-path fallback as page-level tabs (line ~449):
          // newer NB uses pageTabSettings.tab.title, older builds put it
          // at pageTabSettings.title.title.
          const tabSettings = ((tab.stepParams as Record<string, unknown>)?.pageTabSettings as Record<string, unknown>) || {};
          const tabBlock = tabSettings.tab as Record<string, unknown> | undefined;
          const titleBlock = tabSettings.title as Record<string, unknown> | undefined;
          const title = (tabBlock?.title as string) || (titleBlock?.title as string) || `Tab${i}`;
          const tabGrid = tab.subModels?.grid;
          if (tabGrid && !Array.isArray(tabGrid)) {
            const { blocks, popupRefs: nested, layout: tabLayout } = await exportGridBlocks(nb, tabGrid as FlowModelNode, jsDir, `${prefix}_${ref.field}_tab${i}`, projectDir);
            const tabEntry: Record<string, unknown> = { title, blocks };
            if (tabLayout?.length) tabEntry.layout = tabLayout;
            tabSpecs.push(tabEntry);
            nestedPopupRefs.push(...nested);
          }
        }
        popupSpec.tabs = tabSpecs;
      }

      // Write popup file (with defaults stripped)
      const fname = ref.block_key
        ? `${ref.block_key}.${ref.field}.yaml`
        : `${ref.field}.yaml`;
      fs.writeFileSync(path.join(popupsDir, fname), dumpYaml(stripDefaults(popupSpec)));

      // Recurse into nested popups
      if (nestedPopupRefs.length) {
        await exportPopupsToDir(nb, nestedPopupRefs, popupsDir, jsDir, `${prefix}_${ref.field}`, projectDir, exportedUids, depth + 1);
      }
    } catch {
      // popup read failed
    }
  }
}

async function exportGridBlocks(
  nb: NocoBaseClient,
  grid: FlowModelNode,
  jsDir: string,
  prefix: string,
  projectDir: string | null = null,
): Promise<{ blocks: Record<string, unknown>[]; popupRefs: PopupRef[]; layout: unknown[] }> {
  const rawItems = grid.subModels?.items;
  const items = (Array.isArray(rawItems) ? rawItems : []) as FlowModelNode[];
  const usedKeys = new Set<string>();
  const blocks: Record<string, unknown>[] = [];
  const popupRefs: PopupRef[] = [];
  const blockUidToKey = new Map<string, string>();

  for (let i = 0; i < items.length; i++) {
    const exported = await exportBlock(items[i], jsDir, prefix, i, usedKeys, projectDir, nb);
    if (!exported) continue;
    const spec = { ...exported.spec };
    delete spec._popups;

    // ReferenceBlockModel: look up templateUid. Primary source:
    // flowModelTemplateUsages. Fallback: block's own stepParams.useTemplate
    // (NocoBase's cascade bug leaves usages rows out of sync with the
    // actual ReferenceBlockModel binding). See the tab-level variant
    // above for full context.
    if (spec.type === 'reference' && items[i].uid) {
      try {
        let templateUid: string | undefined;
        const usageResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, {
          params: { 'filter[modelUid]': items[i].uid, paginate: 'false' },
        });
        const usages = usageResp.data.data || [];
        if (usages.length) templateUid = usages[0].templateUid as string;
        if (!templateUid) {
          try {
            const raw = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: items[i].uid } });
            const rawOpts = raw.data?.data as Record<string, unknown> | undefined;
            const rs = ((rawOpts?.stepParams as Record<string, unknown>)?.referenceSettings as Record<string, unknown>) || {};
            const ut = (rs.useTemplate as Record<string, unknown>) || {};
            if (ut.templateUid) templateUid = ut.templateUid as string;
          } catch (e) { catchSwallow(e, 'best effort'); }
        }
        if (templateUid) {
          // Try simplified ref: templates/xxx.yaml
          const tplFile = lookupTemplateFile(templateUid, projectDir || jsDir);
          if (tplFile) {
            const blockKey = spec.key;
            for (const k of Object.keys(spec)) delete spec[k];
            spec.ref = tplFile;
            spec.key = blockKey;
          } else {
            try {
              const tmplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, {
                params: { filterByTk: templateUid },
              });
              const tmpl = tmplResp.data.data;
              spec.templateRef = {
                templateUid, templateName: tmpl?.name || '', targetUid: tmpl?.targetUid || '', mode: 'reference',
              };
            } catch {
              spec.templateRef = { templateUid, mode: 'reference' };
            }
          }
        }
      } catch (e) { catchSwallow(e, 'best effort'); }
    }

    blocks.push(spec);
    popupRefs.push(...exported.popupRefs);
    blockUidToKey.set(items[i].uid, exported.key);
  }

  // Supplement popupTemplateUid from flowModels:get (flowSurfaces:get strips it)
  // Also detect popup template fields that flowSurfaces tree missed
  for (const br of blocks) {
    const b = br as Record<string, unknown>;
    if (b.type !== 'table') continue;
    // Find corresponding item by UID
    const blockKey = b.key as string;
    const blockUid = [...blockUidToKey.entries()].find(([, k]) => k === blockKey)?.[0];
    const item = items.find(it => it.uid === blockUid);
    if (!item) continue;
    const cols = item.subModels?.columns;
    const colArr = (Array.isArray(cols) ? cols : []) as FlowModelNode[];
    const fields = b.fields as unknown[];
    if (!Array.isArray(fields)) continue;

    for (const col of colArr) {
      const fp = ((col.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
        ?.init as Record<string, unknown>;
      const fieldPath = (fp?.fieldPath || '') as string;
      if (!fieldPath) continue;

      const fieldModel = col.subModels?.field;
      if (!fieldModel || Array.isArray(fieldModel)) continue;
      const fieldUid = (fieldModel as FlowModelNode).uid;
      if (!fieldUid) continue;

      // Check flowModels:get for popupTemplateUid
      try {
        const raw = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: fieldUid } });
        const rawSp = raw.data.data?.stepParams || raw.data.data?.options?.stepParams;
        const rawOpenView = rawSp?.popupSettings?.openView;
        if (!rawOpenView?.popupTemplateUid) continue;

        // Find or create field spec with clickToOpen + popupTemplateUid
        let fieldSpec = fields.find(f => typeof f === 'object' && (f as Record<string, unknown>).field === fieldPath) as Record<string, unknown> | undefined;
        if (!fieldSpec) {
          // Field exists in spec as bare string — upgrade to object
          const idx = fields.indexOf(fieldPath);
          if (idx >= 0) {
            fieldSpec = { field: fieldPath, clickToOpen: true };
            fields[idx] = fieldSpec;
          } else {
            fieldSpec = { field: fieldPath, clickToOpen: true };
            fields.push(fieldSpec);
          }
        }
        if (!fieldSpec.popupSettings) {
          fieldSpec.clickToOpen = true;
          fieldSpec.popupSettings = {
            collectionName: rawOpenView.collectionName || '',
            mode: rawOpenView.mode || 'drawer',
            size: rawOpenView.size || 'medium',
            filterByTk: rawOpenView.filterByTk || '{{ ctx.record.id }}',
          };
        }
        (fieldSpec.popupSettings as Record<string, unknown>).popupTemplateUid = rawOpenView.popupTemplateUid;
        // Simplify clickToOpen + popupSettings → popup shorthand
        simplifyPopup(fieldSpec, projectDir);

        // Add popup ref if not already present
        if (!popupRefs.some(r => r.field_uid === fieldUid)) {
          popupRefs.push({
            field: fieldPath,
            field_uid: fieldUid,
            block_key: blockUidToKey.get(item.uid) || '',
            target: `$SELF.${blockUidToKey.get(item.uid) || 'table'}.fields.${fieldPath}`,
          });
        }
      } catch (e) { catchSwallow(e, 'skip'); }
    }
  }

  // Check for ReferenceFormGridModel with missing templateRef (stepParams empty)
  // Look up templateUsages for form grid UIDs
  for (let bi = 0; bi < blocks.length; bi++) {
    const br = blocks[bi] as Record<string, unknown>;
    if (!['createForm', 'editForm'].includes(br.type as string)) continue;
    if (br.templateRef) continue;  // Already has templateRef
    if ((br.fields as unknown[])?.length) continue;  // Already has fields

    // Check if the form's grid is ReferenceFormGridModel
    const item = items[bi];
    if (!item) continue;
    const formGrid = item.subModels?.grid;
    if (!formGrid || Array.isArray(formGrid)) continue;
    if ((formGrid as FlowModelNode).use !== 'ReferenceFormGridModel') continue;

    // Query templateUsages for the form grid UID
    try {
      const usageResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, {
        params: { 'filter[modelUid]': (formGrid as FlowModelNode).uid, paginate: 'false' },
      });
      const usages = usageResp.data.data || [];
      if (usages.length) {
        const templateUid = usages[0].templateUid;
        try {
          const tmplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, {
            params: { filterByTk: templateUid },
          });
          const tmpl = tmplResp.data.data;
          br.templateRef = {
            templateUid, templateName: tmpl?.name || '', targetUid: tmpl?.targetUid || '', mode: 'reference',
          };
        } catch {
          br.templateRef = { templateUid, mode: 'reference' };
        }
      }
    } catch (e) { catchSwallow(e, 'best effort'); }
  }

  // Reference blocks: keep as-is (templateRef preserved from lookup above)
  for (const b of blocks) {
    delete (b as Record<string, unknown>)._reference;
  }

  // Strip default/empty values from all block specs
  const cleanedBlocks = blocks.map(b => stripDefaults(b) as Record<string, unknown>);

  // Extract grid layout (how blocks are arranged in rows/columns)
  const layout = exportLayout(grid, blockUidToKey);

  return { blocks: cleanedBlocks, popupRefs, layout };
}

function exportLayout(
  grid: FlowModelNode,
  blockUidToKey: Map<string, string>,
): unknown[] {
  const gridSettings = (grid.stepParams as Record<string, unknown>)?.gridSettings as Record<string, unknown>;
  const gridInner = (gridSettings?.grid || {}) as Record<string, unknown>;
  const rows = (gridInner.rows || {}) as Record<string, string[][]>;
  const sizes = (gridInner.sizes || {}) as Record<string, number[]>;

  const layout: unknown[] = [];

  for (const [rk, cols] of Object.entries(rows)) {
    const rowSizes = sizes[rk] || [];

    if (cols.length === 1) {
      // Single column — blocks stacked vertically. Emit as separate
      // single-key rows so the DSL stays flat in the common case.
      for (const uid of cols[0]) {
        const key = blockUidToKey.get(uid);
        if (key) layout.push([key]);
      }
    } else {
      // Multiple columns — one row. Must preserve PER-COLUMN stacking via
      // `{col: [...], size: N}` so parseLayoutSpec rebuilds the same grid.
      // A previous flattening bug pushed every block into the outer row as
      // individual items (sizes 16,16,16,16,8,8,8) — that rendered as 7
      // side-by-side blocks overflowing the 24-grid, not 2 stacked columns.
      // See: Leads details popup layout drift after duplicate.
      const row: unknown[] = [];
      for (let i = 0; i < cols.length; i++) {
        const colUids = cols[i];
        const size = rowSizes[i];
        const keys = colUids.map(u => blockUidToKey.get(u)).filter((k): k is string => !!k);
        if (!keys.length) continue;
        const defaultSize = Math.floor(24 / cols.length);
        if (keys.length === 1) {
          if (size && size !== defaultSize) row.push({ [keys[0]]: size });
          else row.push(keys[0]);
        } else {
          row.push({ col: keys, size: size ?? 24 });
        }
      }
      if (row.length) layout.push(row);
    }
  }

  return layout;
}

/**
 * Copy JS files referenced in template content to the page's js dir.
 * Rewrites file paths in-place to point to the page's js directory.
 */
function copyTemplateJsFiles(
  tplDir: string,
  jsDir: string,
  content: Record<string, unknown>,
): void {
  const allBlocks: Record<string, unknown>[] = [];
  if (content.blocks) allBlocks.push(...(content.blocks as Record<string, unknown>[]));
  if (content.tabs) {
    for (const tab of content.tabs as Record<string, unknown>[]) {
      if (tab.blocks) allBlocks.push(...(tab.blocks as Record<string, unknown>[]));
    }
  }

  fs.mkdirSync(jsDir, { recursive: true });

  for (const block of allBlocks) {
    // Block-level JS file (jsBlock)
    if (block.file && typeof block.file === 'string' && block.file.includes('/js/')) {
      const srcPath = path.join(tplDir, block.file);
      if (fs.existsSync(srcPath)) {
        const fname = path.basename(srcPath);
        fs.copyFileSync(srcPath, path.join(jsDir, fname));
        block.file = `./js/${fname}`;
      }
    }
    // JS items
    for (const jsSpec of (block.js_items || []) as Record<string, unknown>[]) {
      if (jsSpec.file && typeof jsSpec.file === 'string' && jsSpec.file.includes('/js/')) {
        const srcPath = path.join(tplDir, jsSpec.file);
        if (fs.existsSync(srcPath)) {
          const fname = path.basename(srcPath);
          fs.copyFileSync(srcPath, path.join(jsDir, fname));
          jsSpec.file = `./js/${fname}`;
        }
      }
    }
    // JS columns
    for (const jsSpec of (block.js_columns || []) as Record<string, unknown>[]) {
      if (jsSpec.file && typeof jsSpec.file === 'string' && jsSpec.file.includes('/js/')) {
        const srcPath = path.join(tplDir, jsSpec.file);
        if (fs.existsSync(srcPath)) {
          const fname = path.basename(srcPath);
          fs.copyFileSync(srcPath, path.join(jsDir, fname));
          jsSpec.file = `./js/${fname}`;
        }
      }
    }
  }
}

function moveEventFiles(jsDir: string, eventsDir: string): void {
  try {
    const files = fs.readdirSync(jsDir);
    for (const f of files) {
      if (f.includes('_event_')) {
        fs.renameSync(path.join(jsDir, f), path.join(eventsDir, f));
      }
    }
  } catch (e) { catchSwallow(e, 'skip'); }
}