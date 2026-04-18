/**
 * Temp page lifecycle for template creation.
 *
 * saveTemplate('block') requires an existing block on a page to snapshot.
 * We create a hidden route → page → tab, compose the candidate block on
 * its grid, call saveTemplate, then destroy the route (cascades to page
 * content). The template's targetUid lives in its own tree afterwards
 * and survives the temp page delete.
 */
import type { NocoBaseClient } from '../../client';
import { generateUid } from '../../utils/uid';
import { catchSwallow } from '../../utils/swallow';

export interface TempPage {
  routeId: number;
  pageUid: string;
  tabUid: string;
  gridUid: string;
}

/**
 * Create a hidden menu → page → tab → grid. Returns the routeId +
 * every UID the caller needs for compose / saveTemplate. Returns
 * undefined on failure; callers treat that as "template creation
 * not attempted this run".
 */
export async function createTempPage(nb: NocoBaseClient): Promise<TempPage | undefined> {
  try {
    const menu = await nb.surfaces.createMenu({
      title: `_tpl_temp_${generateUid(6)}`,
      type: 'item',
      icon: 'fileoutlined',
    });
    const page = await nb.surfaces.createPage(menu.routeId);

    return {
      routeId: menu.routeId,
      pageUid: page.pageUid,
      tabUid: page.tabSchemaUid,
      gridUid: page.gridUid,
    };
  } catch {
    return undefined;
  }
}

/** Delete the temp route (and its page/grid via cascade). Best-effort. */
export async function deleteTempPage(nb: NocoBaseClient, tempPage: TempPage): Promise<void> {
  try {
    await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:destroy`, {
      filterByTk: tempPage.routeId,
    });
  } catch {
    // Route destroy failed — try falling back to page destroy directly
    try {
      await nb.surfaces.destroyPage(tempPage.pageUid);
    } catch (e) { catchSwallow(e, 'temp page destroy fallback — orphan cleanup will sweep'); }
  }
}
