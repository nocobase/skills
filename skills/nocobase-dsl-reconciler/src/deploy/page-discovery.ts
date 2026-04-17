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
import { expandPageSugar, expandPopupSugar } from './sugar';

export interface RouteEntry {
  title: string;
  type?: 'group' | 'flowPage';  // default: flowPage
  icon?: string;
  hidden?: boolean;
  children?: RouteEntry[];
}

export interface PageInfo {
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
 */
export function discoverPages(
  pagesDir: string,
  routes: RouteEntry[],
  filterGroup?: string,
): PageInfo[] {
  const pages: PageInfo[] = [];
  if (!fs.existsSync(pagesDir)) return pages;

  for (const routeEntry of routes) {
    const rtype = routeEntry.type || (routeEntry.children ? 'group' : 'flowPage');
    if (rtype === 'group') {
      if (filterGroup && routeEntry.title !== filterGroup) continue;
      const groupSlug = slugify(routeEntry.title);
      const groupDir = path.join(pagesDir, groupSlug);
      if (!fs.existsSync(groupDir)) continue;

      for (const child of routeEntry.children || []) {
        const ctype = child.type || (child.children ? 'group' : 'flowPage');
        if (ctype === 'flowPage') {
          const p = readPageDir(path.join(groupDir, slugify(child.title)), child.title, child.icon);
          if (p) pages.push(p);
        } else if (ctype === 'group') {
          const subDir = path.join(groupDir, slugify(child.title));
          for (const sc of child.children || []) {
            const stype = sc.type || 'flowPage';
            if (stype === 'flowPage') {
              const p = readPageDir(path.join(subDir, slugify(sc.title)), sc.title, sc.icon);
              if (p) pages.push(p);
            }
          }
        }
      }
    } else if (rtype === 'flowPage' && !filterGroup) {
      const p = readPageDir(path.join(pagesDir, slugify(routeEntry.title)), routeEntry.title, routeEntry.icon);
      if (p) pages.push(p);
    }
  }

  return pages;
}

/**
 * Read a single page directory and parse its spec files.
 */
export function readPageDir(pageDir: string, title: string, icon?: string): PageInfo | null {
  if (!fs.existsSync(pageDir)) return null;

  const pageMeta = fs.existsSync(path.join(pageDir, 'page.yaml'))
    ? loadYaml<Record<string, unknown>>(path.join(pageDir, 'page.yaml'))
    : {};

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
    const layoutRaw = expandPageSugar(
      loadYaml<Record<string, unknown>>(layoutFile),
      pageDir,
    );
    layout = {
      page: title,
      icon: icon || (pageMeta.icon as string) || 'fileoutlined',
      coll: layoutRaw.coll as string || '',
      blocks: (layoutRaw.blocks || []) as BlockSpec[],
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
      const tabRaw = expandPageSugar(
        loadYaml<Record<string, unknown>>(tabLayout),
        path.join(pageDir, td),
      );
      const dirSlug = td.replace('tab_', '');
      const meta = tabMetaMap.get(dirSlug);
      const tabTitle = meta?.title || dirSlug.replace(/_/g, ' ');
      const tabIcon = meta?.icon;
      tabs.push({
        title: tabTitle,
        icon: tabIcon,
        blocks: (tabRaw.blocks || []) as BlockSpec[],
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
        // Use project root (not popupsDir) so ref: templates/... resolves correctly
        // Walk up from pageDir to find project root (where templates/ lives)
        let projRoot = pageDir;
        for (let d = pageDir; d !== path.dirname(d); d = path.dirname(d)) {
          if (fs.existsSync(path.join(d, 'routes.yaml')) || fs.existsSync(path.join(d, 'templates'))) { projRoot = d; break; }
        }
        const ps = expandPopupSugar(raw, projRoot) as unknown as PopupSpec;
        if (ps.target) popups.push(ps);
      } catch { /* skip malformed popup file */ }
    }
  }

  return {
    title,
    icon: icon || (pageMeta.icon as string) || 'fileoutlined',
    slug: slugify(title),
    dir: pageDir,
    layout,
    popups,
    pageMeta,
  };
}
