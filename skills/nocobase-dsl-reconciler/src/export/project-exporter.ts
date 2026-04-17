/**
 * Project-level exporter — exports entire NocoBase app as a code project.
 *
 * Output structure:
 *   myapp/
 *     routes.yaml                  # Menu tree
 *     collections/                 # One file per collection
 *       nb_crm_leads.yaml
 *     pages/
 *       main/                      # Group directory
 *         overview/                # Page directory
 *           page.yaml              # Page metadata
 *           layout.yaml            # Blocks + layout (core)
 *           popups/
 *             addnew.yaml
 *             name.yaml
 *           js/
 *             kpi_total.js
 *           charts/
 *             by_status.yaml
 *             by_status.sql
 *           events/
 *             form_auto_fill.js
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { RouteInfo } from '../client/routes';
import type { FlowModelNode } from '../types/api';
import { exportBlock, lookupTemplateFile, simplifyPopup, TYPE_MAP, type PopupRef } from './block-exporter';
import { exportAllTemplates, exportTemplateUsages } from './template-exporter';
import { dumpYaml, loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';
import { stripDefaults } from '../utils/strip-defaults';

interface ExportOptions {
  outDir: string;
  group?: string;       // only export pages under this group
  includeCollections?: boolean;
}

/**
 * Export entire app (or a group) as a project directory.
 */
export async function exportProject(
  nb: NocoBaseClient,
  opts: ExportOptions,
): Promise<void> {
  const outDir = path.resolve(opts.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  // Get routes (tree structure with children)
  const routes = await nb.routes.list();

  // Export routes.yaml
  const routesTree = buildRoutesTree(routes, opts.group);
  fs.writeFileSync(path.join(outDir, 'routes.yaml'), dumpYaml(routesTree));
  console.log(`  + routes.yaml`);

  // Export collections
  if (opts.includeCollections !== false) {
    await exportCollections(nb, outDir);
  }

  // Export V2 templates (popup + block)
  await exportAllTemplates(nb, outDir);
  await exportTemplateUsages(nb, outDir);

  // Generate defaults.yaml from high-usage popup templates
  await exportDefaults(nb, outDir);

  // Export pages by traversing route tree
  const pagesDir = path.join(outDir, 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });

  const exportedGroups = new Set<string>();
  for (const route of routes) {
    if (route.type === 'group') {
      if (opts.group && route.title !== opts.group) continue;
      // Skip duplicate groups (same title)
      if (exportedGroups.has(route.title || '')) continue;
      exportedGroups.add(route.title || '');
      const groupSlug = slugify(route.title || 'group');
      const groupDir = path.join(pagesDir, groupSlug);
      fs.mkdirSync(groupDir, { recursive: true });

      for (const child of route.children || []) {
        if (child.type === 'flowPage') {
          await exportPage(nb, child, groupDir);
        } else if (child.type === 'group') {
          const subDir = path.join(groupDir, slugify(child.title || 'sub'));
          fs.mkdirSync(subDir, { recursive: true });
          for (const sc of child.children || []) {
            if (sc.type === 'flowPage') {
              await exportPage(nb, sc, subDir);
            }
          }
        }
      }
    } else if (route.type === 'flowPage' && !opts.group) {
      await exportPage(nb, route, pagesDir);
    }
  }

  console.log(`\n  Exported to ${outDir}`);
}

/**
 * Export one page to its own directory.
 */
async function exportPage(
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
      const titleSetting = ((t.stepParams as Record<string, unknown>)?.pageTabSettings as Record<string, unknown>)
        ?.title as Record<string, unknown>;
      const title = (titleSetting?.title as string)
        || ((t as unknown as Record<string, unknown>).props as Record<string, unknown>)?.title as string
        || routeTabs[i]?.title
        || `Tab${i}`;
      const icon = routeTabs[i]?.icon || '';
      return { uid: t.uid, title, icon };
    });
  } catch { /* single tab fallback */ }

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

    // ReferenceBlockModel: look up templateUid from flowModelTemplateUsages
    if (spec.type === 'reference' && items[i].uid) {
      try {
        const usageResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, {
          params: { 'filter[modelUid]': items[i].uid, paginate: 'false' },
        });
        const usages = usageResp.data.data || [];
        if (usages.length) {
          const templateUid = usages[0].templateUid;
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
      } catch { /* best effort */ }
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
      } catch { /* skip */ }
    }
  }

  // Fields with popup template: keep as reference (don't inline template content)

  // Enrich filterForm fields with filterManager data (filterPaths, label)
  // filterManager lives on the PAGE-LEVEL grid, not filterForm's own grid
  try {
    const pgResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, {
      params: { filterByTk: gridNode.uid },
    });
    const filterManager = pgResp.data?.data?.filterManager as { filterId: string; targetId: string; filterPaths: string[] }[] || [];
    if (filterManager.length) {
      const filterPathsMap = new Map<string, string[]>();
      for (const entry of filterManager) {
        if (entry.filterId && entry.filterPaths?.length) {
          filterPathsMap.set(entry.filterId, entry.filterPaths);
        }
      }

      for (const b of blocks) {
        const br = b as Record<string, unknown>;
        if (br.type !== 'filterForm') continue;
        const fields = br.fields as unknown[];
        if (!Array.isArray(fields)) continue;

        // Find filterForm grid items to map fieldPath → UID
        const ffBlock = items.find(it => it.uid === blockUidToKey.entries().next().value?.[0]);
        // Actually find the filterForm block in the raw items
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
            // Find UID of this field in filterForm grid
            const ffItem = ffItems.find(gi => {
              const giFp = ((gi.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
                ?.init as Record<string, unknown>;
              return (giFp?.fieldPath as string) === fpName;
            });
            const filterPaths = ffItem ? filterPathsMap.get(ffItem.uid) : undefined;
            const label = ffItem
              ? ((ffItem.stepParams as Record<string, unknown>)?.filterFormItemSettings as Record<string, unknown>)
                  ?.label as Record<string, unknown>
              : undefined;
            const labelText = label?.label as string || '';

            if (filterPaths || labelText) {
              const entry: Record<string, unknown> = { field: fpName };
              if (labelText) entry.label = labelText;
              if (filterPaths) entry.filterPaths = filterPaths;
              enriched.push(entry);
            } else {
              enriched.push(f);
            }
          }
          br.fields = enriched;
          break;
        }
      }
    }
  } catch { /* filterManager read failed — fields stay plain */ }

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
    } catch { /* skip */ }
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
      const data = await nb.get({ uid: ref.field_uid });
      const tree = data.tree;

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
          const title = ((tab.stepParams as Record<string, unknown>)?.pageTabSettings as Record<string, unknown>)
            ?.title as Record<string, unknown>;
          const tabGrid = tab.subModels?.grid;
          if (tabGrid && !Array.isArray(tabGrid)) {
            const { blocks, popupRefs: nested, layout: tabLayout } = await exportGridBlocks(nb, tabGrid as FlowModelNode, jsDir, `${prefix}_${ref.field}_tab${i}`, projectDir);
            const tabEntry: Record<string, unknown> = { title: (title?.title as string) || `Tab${i}`, blocks };
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

    // ReferenceBlockModel: look up templateUid from flowModelTemplateUsages
    if (spec.type === 'reference' && items[i].uid) {
      try {
        const usageResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, {
          params: { 'filter[modelUid]': items[i].uid, paginate: 'false' },
        });
        const usages = usageResp.data.data || [];
        if (usages.length) {
          const templateUid = usages[0].templateUid;
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
      } catch { /* best effort */ }
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
      } catch { /* skip */ }
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
    } catch { /* best effort */ }
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
      // Single column — blocks are stacked vertically → one row per block
      // Single column — blocks are stacked vertically
      for (const uid of cols[0]) {
        const key = blockUidToKey.get(uid);
        if (key) layout.push([key]);
      }
    } else {
      // Multiple columns — blocks side by side in one row
      const row: unknown[] = [];
      for (let i = 0; i < cols.length; i++) {
        // Each column may have multiple stacked blocks
        for (const uid of cols[i]) {
          const key = blockUidToKey.get(uid);
          if (!key) continue;
          const size = rowSizes[i];
          if (size && size !== Math.floor(24 / cols.length)) {
            row.push({ [key]: size });
          } else {
            row.push(key);
          }
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

function buildRoutesTree(
  routes: RouteInfo[],
  filterGroup?: string,
): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const seenTitles = new Set<string>();

  const buildEntry = (r: RouteInfo): Record<string, unknown> => {
    const entry: Record<string, unknown> = { title: r.title || r.schemaUid };
    if (r.type === 'group') entry.type = 'group'; // flowPage is default, omit
    if (r.icon) entry.icon = r.icon;
    if (r.hidden) entry.hidden = true;
    return entry;
  };

  for (const r of routes) {
    if (r.type === 'tabs') continue;
    // Export all routes for global view; only filter pages (not groups) when filterGroup is set
    if (filterGroup && r.type === 'group' && r.title !== filterGroup) {
      // Still export non-target groups as stubs (title + type only, no children pages to export)
      if (!seenTitles.has(r.title || '')) {
        seenTitles.add(r.title || '');
        const stub = buildEntry(r);
        const childEntries = (r.children || []).filter(c => c.type !== 'tabs').map(buildEntry);
        if (childEntries.length) stub.children = childEntries;
        result.push(stub);
      }
      continue;
    }
    if (r.type === 'group' && seenTitles.has(r.title || '')) continue;
    if (r.type === 'group') seenTitles.add(r.title || '');

    const entry = buildEntry(r);
    const seenChildren = new Set<string>();
    const childEntries = (r.children || [])
      .filter(c => {
        if (c.type === 'tabs') return false;
        if (seenChildren.has(c.title || '')) return false;
        seenChildren.add(c.title || '');
        return true;
      })
      .map(c => {
        const ce = buildEntry(c);
        const seenSub = new Set<string>();
        const subEntries = (c.children || [])
          .filter(s => {
            if (s.type === 'tabs') return false;
            if (seenSub.has(s.title || '')) return false;
            seenSub.add(s.title || '');
            return true;
          })
          .map(buildEntry);
        if (subEntries.length) ce.children = subEntries;
        return ce;
      });
    if (childEntries.length) entry.children = childEntries;
    result.push(entry);
  }
  return result;
}

/**
 * Generate defaults.yaml from popup templates with 2+ usages.
 * Maps collection → template file path for auto-popup-binding.
 */
async function exportDefaults(nb: NocoBaseClient, outDir: string): Promise<void> {
  try {
    const resp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { pageSize: 200 } });
    const templates = (resp.data.data || []) as Record<string, unknown>[];

    const popups: Record<string, string> = {};
    const forms: Record<string, string> = {};

    // Read _index.yaml for file paths
    const indexFile = path.join(outDir, 'templates', '_index.yaml');
    const index = fs.existsSync(indexFile) ? loadYaml<Record<string, unknown>[]>(indexFile) || [] : [];
    const uidToFile = new Map<string, string>();
    for (const entry of index) {
      if (entry.uid && entry.file) uidToFile.set(entry.uid as string, entry.file as string);
    }

    // Sort by usageCount descending — pick highest-usage template per collection
    const sorted = [...templates].sort((a, b) => ((b.usageCount as number) || 0) - ((a.usageCount as number) || 0));
    for (const t of sorted) {
      const coll = t.collectionName as string;
      if (!coll) continue;
      const file = uidToFile.get(t.uid as string);
      if (!file) continue;

      if (t.type === 'popup') {
        if (!popups[coll]) popups[coll] = `templates/${file}`;
      } else if (t.type === 'block' && (t.name as string)?.startsWith('Form (Add new)')) {
        if (!forms[coll]) forms[coll] = `templates/${file}`;
      }
    }

    if (Object.keys(popups).length || Object.keys(forms).length) {
      const defaults: Record<string, unknown> = {};
      if (Object.keys(popups).length) defaults.popups = popups;
      if (Object.keys(forms).length) defaults.forms = forms;
      fs.writeFileSync(path.join(outDir, 'defaults.yaml'), dumpYaml(defaults));
    }
  } catch { /* best effort */ }
}

async function exportCollections(nb: NocoBaseClient, outDir: string): Promise<void> {
  const collDir = path.join(outDir, 'collections');
  fs.mkdirSync(collDir, { recursive: true });

  const resp = await nb.http.get(`${nb.baseUrl}/api/collections:list`, { params: { paginate: 'false' } });
  const colls = (resp.data.data || []) as Record<string, unknown>[];

  let count = 0;
  for (const c of colls) {
    const name = c.name as string;
    if (!name || name.startsWith('_') || !name.startsWith('nb_')) continue;

    // Fetch full field definitions (not just interface) for rich export
    let fields: Record<string, unknown>[];
    try {
      const fResp = await nb.http.get(`${nb.baseUrl}/api/collections/${name}/fields:list`, { params: { paginate: false } });
      const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById']);
      fields = ((fResp.data?.data || []) as Record<string, unknown>[])
        .filter((f: any) => f.interface && !SYSTEM_FIELDS.has(f.name as string))
        .map((f: any) => {
          const entry: Record<string, unknown> = {
            name: f.name,
            interface: f.interface,
          };
          if (f.title) entry.title = f.title;
          // Relations
          if (f.target) entry.target = f.target;
          if (f.foreignKey) entry.foreignKey = f.foreignKey;
          if (f.through) entry.through = f.through;
          // Select options
          const enumArr = f.uiSchema?.enum;
          if (Array.isArray(enumArr) && enumArr.length) {
            entry.options = enumArr.map((e: any) => {
              const opt: Record<string, string> = { value: e.value, label: e.label };
              if (e.color) opt.color = e.color;
              return opt;
            });
          }
          if (f.required) entry.required = true;
          return entry;
        });
    } catch {
      // Fallback to basic fieldMeta
      const meta = await nb.collections.fieldMeta(name);
      fields = Object.entries(meta).map(([fname, fmeta]) => ({
        name: fname,
        interface: fmeta.interface,
      }));
    }

    const collDef: Record<string, unknown> = {
      name,
      title: c.title || name,
    };
    if (c.titleField) collDef.titleField = c.titleField;
    collDef.fields = fields;

    fs.writeFileSync(path.join(collDir, `${name}.yaml`), dumpYaml(collDef));
    count++;
  }
  console.log(`  + ${count} collections`);
}

function moveEventFiles(jsDir: string, eventsDir: string): void {
  try {
    const files = fs.readdirSync(jsDir);
    for (const f of files) {
      if (f.includes('_event_')) {
        fs.renameSync(path.join(jsDir, f), path.join(eventsDir, f));
      }
    }
  } catch { /* skip */ }
}
