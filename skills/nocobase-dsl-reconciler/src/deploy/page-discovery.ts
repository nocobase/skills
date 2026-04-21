/**
 * Discover pages from directory tree based on routes.yaml.
 *
 * Pure filesystem functions — no NocoBase API calls.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PageSpec, BlockSpec, PopupSpec } from '../types/spec';
import { loadYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';

export interface RouteEntry {
  /** Identity. Stable across title changes. Default: slugify(title). */
  key?: string;
  title: string;
  type?: 'group' | 'flowPage';  // default: flowPage
  icon?: string;
  hidden?: boolean;
  children?: RouteEntry[];
}

/** Identity of a route. Use this for state lookups, NB matching, dir resolution. */
export function routeKey(r: { key?: string; title: string }): string {
  return r.key || slugify(r.title);
}

export interface PageInfo {
  /** Stable identity (= route.key || slugify(title)). */
  key: string;
  title: string;
  icon: string;
  slug: string;
  dir: string;          // absolute path to page directory
  layout: PageSpec;      // parsed layout.yaml (blocks + layout)
  popups: PopupSpec[];   // parsed popups/*.yaml
  pageMeta: Record<string, unknown>;
}

/**
 * Discover all pages from directory tree, guided by routes.yaml structure.
 *
 * Directory layout follows route keys (= route.key || slugify(title)). Falls
 * back to slugify(title) for backward compat when key-named dir doesn't exist.
 *
 * `filterGroup` matches against routeKey, not title.
 */
export function discoverPages(
  pagesDir: string,
  routes: RouteEntry[],
  filterGroup?: string,
): PageInfo[] {
  const pages: PageInfo[] = [];
  if (!fs.existsSync(pagesDir)) return pages;

  const resolveDir = (parent: string, r: RouteEntry): string => {
    const byKey = path.join(parent, routeKey(r));
    if (fs.existsSync(byKey)) return byKey;
    const byTitle = path.join(parent, slugify(r.title));
    return byTitle;
  };

  for (const routeEntry of routes) {
    const rtype = routeEntry.type || (routeEntry.children ? 'group' : 'flowPage');
    if (rtype === 'group') {
      if (filterGroup && routeKey(routeEntry) !== filterGroup) continue;
      const groupDir = resolveDir(pagesDir, routeEntry);
      if (!fs.existsSync(groupDir)) continue;

      for (const child of routeEntry.children || []) {
        const ctype = child.type || (child.children ? 'group' : 'flowPage');
        if (ctype === 'flowPage') {
          const p = readPageDir(resolveDir(groupDir, child), child.title, child.icon, routeKey(child));
          if (p) pages.push(p);
        } else if (ctype === 'group') {
          const subDir = resolveDir(groupDir, child);
          for (const sc of child.children || []) {
            const stype = sc.type || 'flowPage';
            if (stype === 'flowPage') {
              const p = readPageDir(resolveDir(subDir, sc), sc.title, sc.icon, routeKey(sc));
              if (p) pages.push(p);
            }
          }
        }
      }
    } else if (rtype === 'flowPage' && !filterGroup) {
      const p = readPageDir(resolveDir(pagesDir, routeEntry), routeEntry.title, routeEntry.icon, routeKey(routeEntry));
      if (p) pages.push(p);
    }
  }

  return pages;
}

/**
 * Read a single page directory and parse its spec files.
 *
 * `key` is the stable identity (defaults to slugify(title)) used for state
 * indexing and NB matching. `slug` is always slugify(title) for legacy use.
 */
export function readPageDir(pageDir: string, title: string, icon?: string, key?: string): PageInfo | null {
  if (!fs.existsSync(pageDir)) return null;

  const pageMeta = fs.existsSync(path.join(pageDir, 'page.yaml'))
    ? loadYaml<Record<string, unknown>>(path.join(pageDir, 'page.yaml'))
    : {};

  // Find project root (where routes.yaml or templates/ lives) for ref: resolution
  let projRoot = pageDir;
  for (let d = pageDir; d !== path.dirname(d); d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'routes.yaml')) || fs.existsSync(path.join(d, 'templates'))) { projRoot = d; break; }
  }

  const layoutFile = path.join(pageDir, 'layout.yaml');

  // Check for multi-tab page (has tab_* subdirs but no layout.yaml)
  let tabDirs = fs.existsSync(pageDir)
    ? fs.readdirSync(pageDir).filter(d => d.startsWith('tab_') && fs.statSync(path.join(pageDir, d)).isDirectory())
    : [];

  // Sort by page.yaml tabs order (not alphabetical)
  const pageTabsOrder = ((pageMeta.tabs || []) as unknown[]).map(t =>
    'tab_' + slugify(typeof t === 'string' ? t : (t as Record<string, string>).title || ''),
  );
  if (pageTabsOrder.length) {
    tabDirs.sort((a, b) => {
      const ai = pageTabsOrder.indexOf(a);
      const bi = pageTabsOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  } else {
    tabDirs.sort();
  }

  let layout: PageSpec;

  if (fs.existsSync(layoutFile)) {
    // Single tab page
    const layoutRaw = loadYaml<Record<string, unknown>>(layoutFile);
    layout = {
      page: title,
      icon: icon || (pageMeta.icon as string) || 'fileoutlined',
      coll: layoutRaw.coll as string || '',
      blocks: resolveBlockRefs(layoutRaw.blocks as unknown[] || [], projRoot) as BlockSpec[],
      layout: layoutRaw.layout as PageSpec['layout'],
    };
  } else if (tabDirs.length) {
    // Multi-tab page — first tab becomes the main layout, others become tabs
    // Read tab metadata from page.yaml if available (title, icon)
    const pageTabsMeta = (pageMeta.tabs as unknown[]) || [];
    const tabMetaMap = new Map<string, { title: string; icon?: string }>();
    for (const tm of pageTabsMeta) {
      if (typeof tm === 'string') {
        tabMetaMap.set(slugify(tm), { title: tm });
      } else if (tm && typeof tm === 'object') {
        const t = tm as Record<string, string>;
        tabMetaMap.set(slugify(t.title || ''), { title: t.title, icon: t.icon });
      }
    }

    const tabs: { title: string; icon?: string; blocks: BlockSpec[]; layout?: PageSpec['layout'] }[] = [];
    for (const td of tabDirs) {
      const tabLayout = path.join(pageDir, td, 'layout.yaml');
      if (!fs.existsSync(tabLayout)) continue;
      const tabRaw = loadYaml<Record<string, unknown>>(tabLayout);
      const dirSlug = td.replace('tab_', '');
      const meta = tabMetaMap.get(dirSlug);
      const tabTitle = meta?.title || dirSlug.replace(/_/g, ' ');
      const tabIcon = meta?.icon;
      tabs.push({
        title: tabTitle,
        icon: tabIcon,
        blocks: resolveBlockRefs(tabRaw.blocks as unknown[] || [], projRoot) as BlockSpec[],
        layout: tabRaw.layout as PageSpec['layout'],
      });
    }
    if (!tabs.length) return null;

    // Use first tab as main page blocks
    layout = {
      page: title,
      icon: icon || (pageMeta.icon as string) || 'fileoutlined',
      blocks: tabs[0].blocks,
      layout: tabs[0].layout,
      tabs: tabs.length > 1 ? tabs.map(t => ({
        title: t.title,
        blocks: t.blocks,
        layout: t.layout,
      })) : undefined,
    };
  } else {
    return null;
  }

  // Resolve clickToOpen: "path" → clickToOpen: true + inline popup content
  resolveClickToOpenPaths(layout.blocks, projRoot);
  if (layout.tabs) {
    for (const tab of layout.tabs) resolveClickToOpenPaths(tab.blocks || [], projRoot);
  }

  // Read popups (from page dir and all tab dirs)
  const popups: PopupSpec[] = [];
  const popupDirs = [path.join(pageDir, 'popups')];
  for (const td of tabDirs) {
    popupDirs.push(path.join(pageDir, td, 'popups'));
  }
  for (const popupsDir of popupDirs) {
    if (!fs.existsSync(popupsDir)) continue;
    for (const f of fs.readdirSync(popupsDir).filter(f => f.endsWith('.yaml')).sort()) {
      try {
        const raw = loadYaml<Record<string, unknown>>(path.join(popupsDir, f));

        // Resolve ref: in popup blocks
        if (Array.isArray(raw.blocks)) {
          raw.blocks = resolveBlockRefs(raw.blocks, projRoot);
          // Also convert clickToOpen: "path" → true + inline popup on popup
          // fields. Without this, a field inside a popup details block that
          // points at a shared template (e.g. leads email on contact_information)
          // stays as a bare string and the deployer can't materialise it.
          resolveClickToOpenPaths(raw.blocks as BlockSpec[], projRoot);
        }
        if (Array.isArray(raw.tabs)) {
          for (const tab of raw.tabs as Record<string, unknown>[]) {
            if (Array.isArray(tab.blocks)) {
              tab.blocks = resolveBlockRefs(tab.blocks as unknown[], projRoot);
              resolveClickToOpenPaths(tab.blocks as BlockSpec[], projRoot);
            }
          }
        }

        // Auto-resolve empty popups: if target exists but no blocks, find matching template
        if (raw.target && !raw.blocks && !raw.tabs) {
          autoResolvePopupBlocks(raw, layout.blocks as Record<string, unknown>[], projRoot);
        }

        const ps = raw as unknown as PopupSpec;
        if (ps.target) popups.push(ps);
      } catch { /* skip malformed popup file */ }
    }
  }

  return {
    key: key || slugify(title),
    title,
    icon: icon || (pageMeta.icon as string) || 'fileoutlined',
    slug: slugify(title),
    dir: pageDir,
    layout,
    popups,
    pageMeta,
  };
}

/**
 * Resolve clickToOpen: "path" on field specs.
 * Reads the template file and converts to clickToOpen: true + inline popup content.
 */
function resolveClickToOpenPaths(blocks: BlockSpec[], projRoot: string): void {
  for (const bs of blocks) {
    if (!Array.isArray(bs.fields)) continue;
    for (const f of bs.fields) {
      if (typeof f !== 'object') continue;
      const fo = f as Record<string, unknown>;
      if (typeof fo.clickToOpen !== 'string') continue;

      const refPath = fo.clickToOpen as string;
      const absPath = path.resolve(projRoot, refPath);
      fo.clickToOpen = true;  // normalize to boolean
      fo._clickToOpenPath = refPath;  // preserve for validator

      if (!fs.existsSync(absPath)) {
        fo._clickToOpenError = `Not found: ${refPath}`;
        continue;
      }
      try {
        const tpl = loadYaml<Record<string, unknown>>(absPath);
        // If the file is a POPUP template (type: popup with uid), bind by
        // popupTemplateUid instead of inlining its content. Inlining loses the
        // template's tab structure (tabs gets wrapped as a single block) and
        // creates a duplicate template on every deploy.
        if (tpl.type === 'popup' && tpl.uid) {
          fo.popupSettings = fo.popupSettings || {};
          (fo.popupSettings as Record<string, unknown>).popupTemplateUid = tpl.uid;
          continue;
        }
        // Fresh popup template (type: popup, no uid) — inline content directly
        // as the popup spec (NOT wrapped as a single block) and preserve the
        // template metadata so click-to-open can promote the inlined popup
        // into a live flowModelTemplate after deploy (enabling defaults.yaml
        // m2o auto-binding to find it).
        if (tpl.type === 'popup') {
          const popupContent = (tpl.content && typeof tpl.content === 'object')
            ? tpl.content as Record<string, unknown>
            : {};
          fo.popup = {
            ...popupContent,
            // Surface the template's target collection so click-to-open binds
            // the inline popup to the correct collection (otherwise it falls
            // back to the host block's collection — wrong for m2o → users).
            collectionName: tpl.collectionName || popupContent.collectionName || popupContent.coll,
            _templateMeta: {
              name: tpl.name,
              collectionName: tpl.collectionName,
              path: refPath,
            },
          };
          continue;
        }
        const content = (tpl.content && typeof tpl.content === 'object')
          ? tpl.content as Record<string, unknown>
          : tpl;
        fo.popup = { blocks: [content] };  // inline popup for click-to-open filler
      } catch {
        fo._clickToOpenError = `Failed to parse: ${refPath}`;
      }
    }
  }
}

/**
 * Auto-resolve popup blocks when only target is specified.
 * Looks for matching template block files by collection + action type.
 *
 * Example: target=$SELF.table.actions.addNew + table.coll=nb_pm_tasks
 *   → looks for templates/block/form_add_new_nb_pm_tasks.yaml
 */
function autoResolvePopupBlocks(
  raw: Record<string, unknown>,
  layoutBlocks: Record<string, unknown>[],
  projRoot: string,
): void {
  const target = raw.target as string;
  if (!target) return;

  // Parse target: $SELF.<blockKey>.actions.<actionType> or $SELF.<blockKey>.recordActions.<actionType>
  const m = target.match(/\$SELF\.(\w+)\.(actions|recordActions)\.(\w+)/);
  if (!m) return;
  const [, blockKey, , actionType] = m;

  // Find block collection
  const block = layoutBlocks.find(b => (b.key || b.type) === blockKey);
  const coll = (block?.coll || '') as string;
  if (!coll) return;

  // Map action type → template file prefix
  const prefix = actionType === 'addNew' ? 'form_add_new' : actionType === 'edit' ? 'form_edit' : null;
  if (!prefix) return;

  const tplFile = path.join(projRoot, `templates/block/${prefix}_${coll}.yaml`);
  if (!fs.existsSync(tplFile)) return;

  try {
    const tpl = loadYaml<Record<string, unknown>>(tplFile);
    const content = (tpl.content && typeof tpl.content === 'object')
      ? tpl.content as Record<string, unknown>
      : tpl;
    raw.blocks = [content];
  } catch { /* skip */ }
}

/**
 * Resolve ref: file references in block arrays.
 * Reads the referenced YAML file and inlines its block content.
 * This is a file reference mechanism, not sugar — the file content IS the block spec.
 */
function resolveBlockRefs(blocks: unknown[], projectRoot: string): unknown[] {
  return (blocks || []).map(b => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
    const block = b as Record<string, unknown>;
    if (!('ref' in block) || 'type' in block) return block;

    const { ref, ...extra } = block;
    const refPath = ref as string;
    if (!refPath) return block;

    const absPath = path.resolve(projectRoot, refPath);
    if (!fs.existsSync(absPath)) return { ...extra, _refError: `Not found: ${refPath}` };

    try {
      const template = loadYaml<Record<string, unknown>>(absPath);

      // When the ref'd file is a template definition (type: block/popup at top
      // level) AND the block declared key === 'reference', produce a templateRef
      // instead of inlining the content. Inlining a template that was originally
      // exported from a popup context (binding: currentRecord) into a regular page
      // tab causes NocoBase to 400 on compose ("resource.binding only works on
      // popup collection blocks").
      //
      // The uid is optional: a freshly authored template (e.g. created by an
      // agent from scratch) has only `name + type + collectionName + content`.
      // We carry the templateName so the deploy-side rewriter can resolve to a
      // live template uid by name. Without this, missing-uid templates were
      // silently inlined (Round1 kimi build hit this) and `usage` stayed at 0.
      const extraKey = (extra as Record<string, unknown>).key;
      if (extraKey === 'reference' && template.type === 'block') {
        const templateUid = (template.uid as string) || '';
        const templateName = (template.name as string) || '';
        // targetUid is required for the rebind path: ReferenceBlockModel
        // mirrors the template's TARGET tree, so without it useTemplate
        // gets templateUid + a stale targetUid (whatever was already on the
        // live block) and the user sees old template content despite the
        // rebind log saying "rebound A → B".
        const targetUid = (template.targetUid as string) || '';
        const ref: Record<string, unknown> = { mode: 'reference' };
        if (templateUid) ref.templateUid = templateUid;
        if (templateName) ref.templateName = templateName;
        if (targetUid) ref.targetUid = targetUid;
        // Stash the template's field list + layout so downstream
        // (popup-expander) can derive edit/detail popups with the same
        // fields when only addNew is authored as a ref.
        const content = (template.content && typeof template.content === 'object')
          ? template.content as Record<string, unknown>
          : {};
        return {
          type: 'reference',
          key: 'reference',
          templateRef: ref,
          coll: (template.collectionName as string) || undefined,
          _fromRef: refPath,
          _refContent: {
            fields: content.fields,
            field_layout: content.field_layout,
          },
        };
      }

      const content = (template.content && typeof template.content === 'object')
        ? template.content as Record<string, unknown>
        : template;
      // Mark as ref-derived — validator skips per-page popup checks (popups live on template)
      return { ...content, ...extra, _fromRef: refPath };
    } catch {
      return { ...extra, _refError: `Failed to parse: ${refPath}` };
    }
  });
}
