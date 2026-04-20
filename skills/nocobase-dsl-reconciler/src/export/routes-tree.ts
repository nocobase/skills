/**
 * Convert the live NocoBase routes tree (`desktopRoutes:list?tree=true`)
 * into routes.yaml entries.
 *
 * Subtleties handled here:
 *   - NB returns children in insertion order, NOT sort order — we re-sort
 *     every level by `sort` ASC to match what the UI actually renders.
 *   - `tabs` children are the hidden "tab host" nodes; always skipped.
 *   - When `filterGroup` is set, non-matching top-level groups still emit
 *     as stubs (title + type, no children) so routes.yaml keeps them as
 *     placeholders without having to re-export their pages.
 *   - `existingKeyByTitle` preserves author-assigned route `key:` values
 *     across a re-pull — otherwise every pull would rewrite keys and
 *     break duplicate-project's identity.
 */
import type { RouteInfo } from '../client/routes';

export function buildRoutesTree(
  routes: RouteInfo[],
  filterGroup?: string,
  existingKeyByTitle: Map<string, string> = new Map(),
): Record<string, unknown>[] {
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
