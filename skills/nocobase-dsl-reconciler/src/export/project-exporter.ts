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
import { buildRoutesTree } from './routes-tree';
import { exportCollections, expandToRelationTargets } from './collection-exporter';
import { exportPage } from './page-exporter';
import { dumpYaml, loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';
import { stripDefaults } from '../utils/strip-defaults';
import { catchSwallow } from '../utils/swallow';

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
    } catch (e) { catchSwallow(e, 'skip'); }
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

  // Pre-write templates/_index.yaml stub so block-exporter's simplifyPopup
  // can resolve `popupSettings.openView.popupTemplateUid` → `clickToOpen:
  // templates/popup/X.yaml` during page export. Full template content is
  // written later by exportAllTemplates, which overwrites _index.yaml with
  // complete entries (including usageCount / targetUid).
  const { writeTemplateIndexStub } = await import('./template-exporter');
  await writeTemplateIndexStub(nb, outDir);

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

  // Prefer the DSL key (from existing routes.yaml) over a fresh slugify(title)
  // for dir names. Without this, re-pulling after a duplicate-project run
  // (whose route key is e.g. `main_copy`) rebuilds the dir as the title-slug
  // `copy_main` — round-trip diffs then look like data loss when it's
  // actually a cosmetic rename.
  const dirSlug = (title: string, fallback: string) =>
    existingKeyByTitle.get(title) || slugify(title || fallback);

  const exportedGroups = new Set<string>();
  for (const route of routes) {
    if (route.type === 'group') {
      if (groupMatches && !groupMatches(route.title || '')) continue;
      if (exportedGroups.has(route.title || '')) continue;
      exportedGroups.add(route.title || '');
      const groupSlug = dirSlug(route.title || '', 'group');
      const groupDir = path.join(pagesDir, groupSlug);
      fs.mkdirSync(groupDir, { recursive: true });

      for (const child of route.children || []) {
        if (child.type === 'flowPage') {
          trackPage(child.schemaUid);
          await exportPage(nb, child, groupDir);
        } else if (child.type === 'group') {
          const subDir = path.join(groupDir, dirSlug(child.title || '', 'sub'));
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
        } catch (e) { catchSwallow(e, 'skip'); }
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
        } catch (e) { catchSwallow(e, 'skip'); }
      }
      if (dropped) console.log(`  + ${kept} workflows (dropped ${dropped} out-of-scope)`);
    }
  } catch (e) {
    console.log(`  ! workflows: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
  }

  console.log(`\n  Exported to ${outDir}`);
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
        } catch (e) { catchSwallow(e, 'skip'); }
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
        } catch (e) { catchSwallow(e, 'skip'); }
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
  } catch (e) { catchSwallow(e, 'skip'); }

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
  } catch (e) { catchSwallow(e, 'best effort'); }
}
