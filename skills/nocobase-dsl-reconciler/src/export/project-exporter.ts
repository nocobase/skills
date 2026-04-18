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
  group?: string;       // route key OR title (exact or prefix match) to scope export
  includeCollections?: boolean;
}

/** Match a route against the group filter. Tries (in order): route key (when
 *  available — pulled from existing routes.yaml), exact title, title prefix.
 *  This lets `--group hr_approval` (key) and `--group "人事审批"` (title) both
 *  work. */
function makeGroupMatcher(filter: string, keyByTitle: Map<string, string>) {
  return (routeTitle: string): boolean => {
    if (!routeTitle) return false;
    if (routeTitle === filter) return true;
    if (routeTitle.startsWith(filter + ' - ')) return true;
    const key = keyByTitle.get(routeTitle);
    if (key === filter) return true;
    return false;
  };
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

  // Preserve any existing route keys from the local routes.yaml so a pull
  // after a key-suffixed duplicate doesn't lose identity.
  const existingRoutesFile = path.join(outDir, 'routes.yaml');
  const existingKeyByTitle = new Map<string, string>();
  if (fs.existsSync(existingRoutesFile)) {
    try {
      const prior = loadYaml<Record<string, unknown>[]>(existingRoutesFile) || [];
      const collect = (entries: Record<string, unknown>[]) => {
        for (const e of entries) {
          if (typeof e?.title === 'string' && typeof e?.key === 'string') {
            existingKeyByTitle.set(e.title, e.key);
          }
          if (Array.isArray(e?.children)) collect(e.children as Record<string, unknown>[]);
        }
      };
      collect(prior);
    } catch { /* skip */ }
  }

  // Build the matcher (knows about route keys, falls back to title).
  const groupMatches = opts.group ? makeGroupMatcher(opts.group, existingKeyByTitle) : null;

  // Export routes.yaml. When --group is set, keep only the matching subtree
  // (top-level groups whose title or key matches). Without scope, everything.
  const scopedRoutes = groupMatches
    ? routes.filter(r => groupMatches(r.title || ''))
    : routes;
  const routesTree = buildRoutesTree(scopedRoutes, opts.group, existingKeyByTitle);
  fs.writeFileSync(path.join(outDir, 'routes.yaml'), dumpYaml(routesTree));
  console.log(`  + routes.yaml`);

  // Export pages FIRST when group-scoped, so we can collect the set of
  // referenced collections + flowModel UIDs and pass them to the template /
  // collection exporters as a filter. Without this, a small project that
  // shares a NocoBase instance with a large one would pull every unrelated
  // template/collection, defeating the point of `--group`.
  const pagesDir = path.join(outDir, 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });

  const usedColls = new Set<string>();
  const usedFlowModelUids = new Set<string>();
  const trackPage = (uid: string | undefined) => { if (uid) usedFlowModelUids.add(uid); };

  const exportedGroups = new Set<string>();
  for (const route of routes) {
    if (route.type === 'group') {
      if (groupMatches && !groupMatches(route.title || '')) continue;
      if (exportedGroups.has(route.title || '')) continue;
      exportedGroups.add(route.title || '');
      const groupSlug = slugify(route.title || 'group');
      const groupDir = path.join(pagesDir, groupSlug);
      fs.mkdirSync(groupDir, { recursive: true });

      for (const child of route.children || []) {
        if (child.type === 'flowPage') {
          trackPage(child.schemaUid);
          await exportPage(nb, child, groupDir);
        } else if (child.type === 'group') {
          const subDir = path.join(groupDir, slugify(child.title || 'sub'));
          fs.mkdirSync(subDir, { recursive: true });
          for (const sc of child.children || []) {
            if (sc.type === 'flowPage') {
              trackPage(sc.schemaUid);
              await exportPage(nb, sc, subDir);
            }
          }
        }
      }
    } else if (route.type === 'flowPage') {
      if (!groupMatches || groupMatches(route.title || '')) {
        trackPage(route.schemaUid);
        await exportPage(nb, route, pagesDir);
      }
    }
  }

  // Walk the just-written page YAML to harvest referenced collection names.
  if (groupMatches) {
    collectCollNamesFromDir(pagesDir, usedColls);
    // Expand to relation targets so a child o2m/m2o block has its target
    // collection's templates pulled too.
    await expandToRelationTargets(nb, usedColls);
  }

  // Resolve which template UIDs the scoped pages reference by scanning the
  // just-written page YAML for `templateUid:` and `popupTemplateUid:` values.
  // This is local-first (no API call needed) and catches every reference the
  // page actually carries — including popup blocks that aren't nested under
  // the page in the parentId tree.
  let usedTemplateUids: Set<string> | undefined;
  if (groupMatches) {
    usedTemplateUids = collectTemplateUidsFromDir(pagesDir);
  }

  // Export V2 templates first when scoped. Filter by templateUid (explicit
  // refs) AND collectionName (auto-templates NB creates on compose). Loop
  // until the kept set stops growing — each newly-pulled template can
  // surface additional templateUids and collection names that the previous
  // pass missed (e.g. a popup template referencing another popup template,
  // or a child block in a popup mentioning a sibling collection).
  if (groupMatches) {
    const tplDir = path.join(outDir, 'templates');
    let prevTplCount = -1;
    let prevCollCount = -1;
    let pass = 0;
    while ((usedTemplateUids?.size ?? 0) !== prevTplCount || usedColls.size !== prevCollCount) {
      prevTplCount = usedTemplateUids?.size ?? 0;
      prevCollCount = usedColls.size;
      await exportAllTemplates(nb, outDir, usedTemplateUids ?? new Set(), usedColls);
      // Refresh sets from what got written
      const moreUids = collectTemplateUidsFromDir(tplDir);
      for (const u of moreUids) usedTemplateUids?.add(u);
      collectCollNamesFromDir(tplDir, usedColls);
      pass++;
      if (pass > 5) break;  // safety: prevent runaway
    }
  } else {
    await exportAllTemplates(nb, outDir);
  }
  await exportTemplateUsages(nb, outDir, groupMatches ? (usedTemplateUids ?? new Set()) : undefined);

  if (groupMatches) {
    collectCollNamesFromDir(path.join(outDir, 'templates'), usedColls);
  }

  // Export collections (filtered when scoped). When --group is given the
  // filter is the gathered usedColls set (possibly empty — that's intentional,
  // an empty set means "no pages matched, so no collections needed").
  if (opts.includeCollections !== false) {
    await exportCollections(nb, outDir, groupMatches ? usedColls : undefined);
  }

  // Generate defaults.yaml from high-usage popup templates
  await exportDefaults(nb, outDir);

  // Workflows are part of "everything pullable" — the symmetric pair to push.
  // When --group is set, filter workflows whose trigger collection is in the
  // scoped collection set; otherwise pull all.
  try {
    const { exportWorkflows } = await import('../workflow/workflow-exporter');
    const wfDir = path.join(outDir, 'workflows');
    const wfFilter = groupMatches && usedColls.size
      ? { titlePattern: undefined as string | undefined }
      : undefined;
    await exportWorkflows(nb, { outDir: wfDir, filter: wfFilter, log: () => {} });
    // Post-filter: when scoped, drop workflows whose trigger.collection is
    // not in usedColls. exportWorkflows itself doesn't have a collection
    // filter so we prune the directory after it writes.
    if (groupMatches && fs.existsSync(wfDir)) {
      let kept = 0; let dropped = 0;
      for (const e of fs.readdirSync(wfDir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const wfFile = path.join(wfDir, e.name, 'workflow.yaml');
        if (!fs.existsSync(wfFile)) continue;
        try {
          const wf = loadYaml<Record<string, unknown>>(wfFile);
          const trig = (wf.trigger || {}) as Record<string, unknown>;
          const coll = trig.collection as string | undefined;
          if (coll && !usedColls.has(coll)) {
            fs.rmSync(path.join(wfDir, e.name), { recursive: true, force: true });
            dropped++;
          } else { kept++; }
        } catch { /* skip */ }
      }
      // Also rewrite workflow-state.yaml to keep only kept workflows
      const stateFile = path.join(wfDir, 'workflow-state.yaml');
      if (fs.existsSync(stateFile)) {
        try {
          const st = loadYaml<Record<string, unknown>>(stateFile) || {};
          const ws = (st.workflows || {}) as Record<string, unknown>;
          for (const slug of Object.keys(ws)) {
            if (!fs.existsSync(path.join(wfDir, slug))) delete ws[slug];
          }
          st.workflows = ws;
          fs.writeFileSync(stateFile, dumpYaml(st));
        } catch { /* skip */ }
      }
      if (dropped) console.log(`  + ${kept} workflows (dropped ${dropped} out-of-scope)`);
    }
  } catch (e) {
    console.log(`  ! workflows: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
  }

  console.log(`\n  Exported to ${outDir}`);
}

/** Expand a set of collection names to include their relation targets
 *  (m2o/o2m/m2m). A scoped pull that pulls leave_requests but not
 *  leave_approvals would leave the o2m references dangling. We fetch fields
 *  per collection on demand because the bulk list endpoint returns them as
 *  empty arrays. Loops until stable so transitive relations are followed. */
async function expandToRelationTargets(nb: NocoBaseClient, names: Set<string>): Promise<void> {
  const seen = new Set<string>();
  let changed = true;
  let safety = 0;
  while (changed && safety < 10) {
    changed = false;
    safety++;
    for (const name of Array.from(names)) {
      if (seen.has(name)) continue;
      seen.add(name);
      try {
        const r = await nb.http.get(`${nb.baseUrl}/api/collections/${name}/fields:list`, { params: { paginate: false } });
        const fields = (r.data?.data || []) as Record<string, unknown>[];
        for (const f of fields) {
          // Follow both target (m2o/o2m/m2m → other side) AND through (m2m
          // join table). Without `through`, a duplicated module would have
          // m2m fields pointing at a join table that was never pulled.
          for (const refKey of ['target', 'through'] as const) {
            const ref = f[refKey] as string;
            if (ref && !names.has(ref)) {
              names.add(ref);
              changed = true;
            }
          }
        }
      } catch { /* skip */ }
    }
  }
}

/** Walk a directory of YAML files and collect every `coll: <name>` value into
 *  the given set. Used to discover which collections a scoped page set
 *  actually references, so we don't drag the whole NocoBase collection list. */
function collectCollNamesFromDir(dir: string, into: Set<string>): void {
  if (!fs.existsSync(dir)) return;
  const COLL_RE = /(?:^|\n)\s*coll:\s*([a-zA-Z0-9_]+)/g;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml'))) {
        try {
          const text = fs.readFileSync(p, 'utf8');
          let m;
          while ((m = COLL_RE.exec(text))) into.add(m[1]);
        } catch { /* skip */ }
      }
    }
  };
  walk(dir);
}

/** Walk a directory of YAML files and collect every `templateUid:` /
 *  `popupTemplateUid:` value into a set. The page exporter has already
 *  inlined the references it needs, so scanning the written files captures
 *  the exact set of templates the scoped pages consume — including popup
 *  blocks that don't appear as descendants of the page in NocoBase's
 *  parentId tree. */
function collectTemplateUidsFromDir(dir: string): Set<string> {
  const out = new Set<string>();
  if (!fs.existsSync(dir)) return out;
  const RE = /(?:templateUid|popupTemplateUid):\s*([a-z0-9]{8,12})\b/g;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml'))) {
        try {
          const text = fs.readFileSync(p, 'utf8');
          let m;
          while ((m = RE.exec(text))) out.add(m[1]);
        } catch { /* skip */ }
      }
    }
  };
  walk(dir);
  return out;
}

/** [legacy, unused — kept for reference] For each scoped page root flowModel
 *  uid, descend via parentId chains and collect uids; then look up template
 *  usages. Doesn't catch popup blocks (which aren't parented under pages). */
async function _resolveScopedTemplateUidsViaApi(
  nb: NocoBaseClient,
  pageRootUids: Set<string>,
): Promise<Set<string>> {
  const allDescendants = new Set<string>();
  // Cheap path: list ALL flowModels once and walk parentId chains. With a
  // moderate-size NB this is one network call and pure local work.
  let allModels: Record<string, unknown>[] = [];
  try {
    const r = await nb.http.get(`${nb.baseUrl}/api/flowModels:list`, { params: { paginate: 'false' } });
    allModels = (r.data?.data || []) as Record<string, unknown>[];
  } catch { return new Set(); }
  // Build child → parent map from the flat list (parentId carried per row).
  const parentByChild = new Map<string, string>();
  const uidToModel = new Map<string, Record<string, unknown>>();
  for (const m of allModels) {
    const uid = m.uid as string;
    if (!uid) continue;
    uidToModel.set(uid, m);
    const pid = m.parentId as string | undefined;
    if (pid) parentByChild.set(uid, pid);
  }
  // For each model, walk up to root; if any ancestor is in pageRootUids, the
  // model is in scope.
  for (const m of allModels) {
    const uid = m.uid as string;
    if (!uid) continue;
    let cursor: string | undefined = uid;
    let depth = 0;
    while (cursor && depth < 30) {
      if (pageRootUids.has(cursor)) { allDescendants.add(uid); break; }
      cursor = parentByChild.get(cursor);
      depth++;
    }
  }
  // Also include the pageRootUids themselves
  for (const u of pageRootUids) allDescendants.add(u);

  // Look up template usages for any modelUid in scope.
  const tplUids = new Set<string>();
  try {
    const r = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, { params: { paginate: 'false' } });
    const usages = (r.data?.data || []) as { templateUid?: string; modelUid?: string }[];
    for (const u of usages) {
      if (u.modelUid && allDescendants.has(u.modelUid) && u.templateUid) tplUids.add(u.templateUid);
    }
  } catch { /* skip */ }

  // ALSO: any block referencing a template via stepParams.referenceSettings
  // shows up as a usage row, but if a template was deployed without a usage
  // row (e.g., legacy), we'd miss it. Belt + suspenders: sweep stepParams.
  const REF_RE = /"templateUid"\s*:\s*"([a-z0-9]{8,12})"/g;
  for (const m of allModels) {
    const uid = m.uid as string;
    if (!uid || !allDescendants.has(uid)) continue;
    const sp = m.stepParams ? JSON.stringify(m.stepParams) : '';
    if (!sp) continue;
    let mt;
    while ((mt = REF_RE.exec(sp))) tplUids.add(mt[1]);
  }
  return tplUids;
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
  } catch { /* connectFields read failed — fields stay plain */ }

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

function buildRoutesTree(
  routes: RouteInfo[],
  filterGroup?: string,
  existingKeyByTitle: Map<string, string> = new Map(),
): Record<string, unknown>[] {
  // NocoBase's desktopRoutes:list?tree=true returns children in insertion
  // order, NOT in `sort` ASC. The UI re-sorts client-side, so the user sees
  // a different order than the API array produces. If we export in API
  // array order, routes.yaml records the WRONG order — and any downstream
  // consumer (duplicate-project, push's sort assignment) propagates the
  // error. Sort every level by `sort` ASC before iterating.
  const sortBySort = (list: RouteInfo[] | undefined): RouteInfo[] => {
    if (!Array.isArray(list) || !list.length) return list || [];
    const copy = [...list].sort((a, b) => (a.sort ?? Infinity) - (b.sort ?? Infinity));
    for (const n of copy) {
      if (Array.isArray(n.children) && n.children.length) n.children = sortBySort(n.children);
    }
    return copy;
  };
  routes = sortBySort(routes);
  const result: Record<string, unknown>[] = [];
  const seenTitles = new Set<string>();

  const buildEntry = (r: RouteInfo): Record<string, unknown> => {
    const entry: Record<string, unknown> = {};
    const declaredKey = existingKeyByTitle.get(r.title || '');
    if (declaredKey) entry.key = declaredKey;
    entry.title = r.title || r.schemaUid;
    if (r.type === 'group') entry.type = 'group'; // flowPage is default, omit
    if (r.icon) entry.icon = r.icon;
    if (r.hidden) entry.hidden = true;
    return entry;
  };

  for (const r of routes) {
    if (r.type === 'tabs') continue;
    // Export all routes for global view; only filter pages (not groups) when filterGroup is set
    if (filterGroup && r.type === 'group' && !(r.title === filterGroup || (r.title || '').startsWith(filterGroup + ' - '))) {
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

    // Sort keys alphabetically for stable diffs
    const sortKeys = (m: Record<string, string>): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const k of Object.keys(m).sort()) out[k] = m[k];
      return out;
    };

    if (Object.keys(popups).length || Object.keys(forms).length) {
      const defaults: Record<string, unknown> = {};
      if (Object.keys(popups).length) defaults.popups = sortKeys(popups);
      if (Object.keys(forms).length) defaults.forms = sortKeys(forms);
      fs.writeFileSync(path.join(outDir, 'defaults.yaml'), dumpYaml(defaults));
    }
  } catch { /* best effort */ }
}

async function exportCollections(
  nb: NocoBaseClient,
  outDir: string,
  keepNames?: Set<string>,
): Promise<void> {
  const collDir = path.join(outDir, 'collections');
  fs.mkdirSync(collDir, { recursive: true });

  const resp = await nb.http.get(`${nb.baseUrl}/api/collections:list`, { params: { paginate: 'false' } });
  const colls = (resp.data.data || []) as Record<string, unknown>[];

  // When scoped, expand the keep set to include relation targets (m2o, o2m,
  // m2m). Otherwise a child block referencing the o2m would resolve to a
  // collection we never exported, leaving the duplicate broken. We fetch
  // fields per collection on demand because /api/collections:list returns
  // them as an empty array.
  const expandedKeep = keepNames ? new Set(keepNames) : null;
  if (expandedKeep) {
    const fieldsCache = new Map<string, Record<string, unknown>[]>();
    const fetchFields = async (name: string) => {
      if (fieldsCache.has(name)) return fieldsCache.get(name)!;
      try {
        const r = await nb.http.get(`${nb.baseUrl}/api/collections/${name}/fields:list`, { params: { paginate: false } });
        const f = (r.data?.data || []) as Record<string, unknown>[];
        fieldsCache.set(name, f);
        return f;
      } catch { fieldsCache.set(name, []); return []; }
    };
    let changed = true;
    let safety = 0;
    while (changed && safety < 10) {
      changed = false;
      safety++;
      for (const name of Array.from(expandedKeep)) {
        const fields = await fetchFields(name);
        for (const f of fields) {
          const target = f.target as string;
          if (target && !expandedKeep.has(target)) {
            expandedKeep.add(target);
            changed = true;
          }
        }
      }
    }
  }

  let count = 0;
  for (const c of colls) {
    const name = c.name as string;
    if (!name || name.startsWith('_') || (!name.startsWith('nb_') && !expandedKeep?.has(name))) continue;
    if (expandedKeep && !expandedKeep.has(name)) continue;

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

    // Capture user-defined triggers / functions for this table so they
    // travel with the collection in pull → push → duplicate flows.
    // Without this, a kimi-installed conflict-detection trigger gets left
    // behind on the source DB and the duplicate has no enforcement.
    try {
      const triggers = await captureTriggersForTable(name);
      if (triggers.length) collDef.triggers = triggers;
    } catch { /* psql not available — skip silently, can be re-pulled later */ }

    fs.writeFileSync(path.join(collDir, `${name}.yaml`), dumpYaml(collDef));
    count++;
  }
  console.log(`  + ${count} collections`);
}

/** Query Postgres for user triggers + their backing functions on `tableName`.
 *  Returns SqlObjectDef[] suitable for round-tripping back into the table.
 *  We deliberately avoid pg_dump complexity — only triggers + their immediate
 *  trigger-function are captured. Other DDL (views, custom indexes) can be
 *  added later if a real use case appears. */
async function captureTriggersForTable(tableName: string): Promise<unknown[]> {
  const { execSql, singleValue } = await import('../utils/sql-exec');
  const out: Record<string, unknown>[] = [];
  const safe = tableName.replace(/'/g, "''");
  // Step 1 — list trigger names (one per line, single column, no separator confusion).
  const trigNames = execSql(
    `SELECT t.tgname
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = '${safe}' AND NOT t.tgisinternal
      ORDER BY t.tgname`,
    { select: true },
  ).split('\n').map(s => s.trim()).filter(Boolean);

  for (const name of trigNames) {
    const safeName = name.replace(/'/g, "''");
    // Step 2 — fetch the CREATE TRIGGER body (single-row single-column, multi-line OK).
    let createTrigger = '';
    try {
      createTrigger = singleValue(execSql(
        `SELECT pg_get_triggerdef(t.oid, true)
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = '${safe}' AND t.tgname = '${safeName}' AND NOT t.tgisinternal`,
        { select: true },
      )).trim();
    } catch { /* skip */ }
    if (!createTrigger) continue;
    // Step 3 — find the trigger's function name from the trigger def.
    const fnMatch = createTrigger.match(/EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/i);
    const fnName = fnMatch?.[1];
    let createFn = '';
    if (fnName) {
      try {
        createFn = singleValue(execSql(
          `SELECT pg_get_functiondef(p.oid)
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = '${fnName.replace(/'/g, "''")}'`,
          { select: true },
        )).trim();
      } catch { /* skip */ }
    }
    const sql = createFn ? `${createFn};\n${createTrigger};` : `${createTrigger};`;
    out.push({ name, kind: 'trigger', sql });
  }
  return out;
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
