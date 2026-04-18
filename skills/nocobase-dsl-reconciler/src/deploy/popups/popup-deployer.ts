/**
 * Deploy popups — simple, tabbed, and nested.
 *
 * ⚠️ PITFALLS:
 * - compose target for popup tab: use ChildPage TAB uid (not field/action uid)
 * - hasContent check: compare live blockCount vs spec blockCount (not just >0)
 * - popupSettings.uid must point to field itself (NocoBase resolves field → page)
 * - See src/PITFALLS.md for complete list.
 */
import type { DeployContext } from '../deploy-context';
import type { PopupSpec, BlockSpec } from '../../types/spec';
import type { BlockState } from '../../types/state';
import { deploySurface } from '../surface-deployer';

export interface PopupOpts {
  modDir: string;
  popupPath?: string;
  existingPopupBlocks?: Record<string, BlockState>;
  /**
   * Fallback collection name when popupSpec has no coll (and no
   * blocks/tabs[0].coll either). Used for "empty action shell" popups
   * (addNew, send_email, etc.) so the openView still binds to the
   * host page's collection rather than ''.
   */
  pageColl?: string;
}

/**
 * Deploy a single popup onto a target (action, field column, etc.).
 */
export async function deployPopup(
  ctx: DeployContext,
  targetUid: string,
  targetRef: string,
  popupSpec: PopupSpec,
  opts: PopupOpts,
): Promise<Record<string, BlockState>> {
  const { nb, log } = ctx;
  const { modDir, popupPath = '', existingPopupBlocks = {}, pageColl } = opts;
  const mode = popupSpec.mode || 'drawer';
  const tabsSpec = popupSpec.tabs;
  // popupSpec.coll is rarely set explicitly; fall back to the first block's coll
  // (covers both flat blocks[] and tabs[].blocks[]) then the host page's coll.
  // Without this the openView ends up with collectionName='' and renders broken.
  const coll = popupSpec.coll
    || popupSpec.blocks?.[0]?.coll
    || tabsSpec?.[0]?.blocks?.[0]?.coll
    || pageColl
    || '';
  if (!coll) {
    log(`  ⚠ popup [${targetRef}] has no coll — openView.collectionName will be empty`);
  }

  // If popup uses a template reference, just set it — no compose needed
  const popupTemplate = (popupSpec as unknown as Record<string, unknown>).popupTemplate as { uid: string; name?: string } | undefined;
  if (popupTemplate?.uid) {
    log(`  = popup [${targetRef}] (template: ${popupTemplate.name || popupTemplate.uid})`);
    try {
      await nb.updateModel(targetUid, {
        popupSettings: { openView: { popupTemplateUid: popupTemplate.uid, mode } },
        displayFieldSettings: { clickToOpen: { clickToOpen: true } },
      });
    } catch (e) {
      log(`    ! popup template set: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
    return {};
  }

  // Check if popup already has content
  try {
    const data = await nb.get({ uid: targetUid });
    const tree = data.tree;
    const popupPage = tree.subModels?.page;
    if (popupPage && !Array.isArray(popupPage)) {
      const tabs = (popupPage as unknown as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
      const tabList = tabs?.tabs;
      const tabArr = Array.isArray(tabList) ? tabList : tabList ? [tabList] : [];
      // Check if popup has ENOUGH content (matches spec tab/block count)
      const specTabCount = tabsSpec ? tabsSpec.length : 1;
      const specBlockCount = tabsSpec
        ? tabsSpec.reduce((n, t) => n + ((t.blocks || []).length), 0)
        : (popupSpec.blocks || []).length;

      let liveBlockCount = 0;
      for (const t of tabArr) {
        const g = (t as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
        const gridObj = g?.grid as Record<string, unknown>;
        const items = gridObj?.subModels as Record<string, unknown>;
        const itemArr = items?.items;
        if (Array.isArray(itemArr)) liveBlockCount += itemArr.length;
      }

      // Content is sufficient if live has at least as many tabs and blocks as spec
      // But if spec expects reference blocks and live has regular blocks, re-compose is needed
      const specHasRef = (popupSpec.blocks || []).some(b => b.type === 'reference');
      const liveHasRef = tabArr.some(t => {
        const g2 = (t as Record<string, unknown>).subModels as Record<string, unknown>;
        const gi2 = (g2?.grid as Record<string, unknown>)?.subModels as Record<string, unknown>;
        const ia2 = (gi2?.items || []) as { use?: string }[];
        return Array.isArray(ia2) && ia2.some(i => i.use === 'ReferenceBlockModel');
      });
      // If spec wants reference blocks but live has regular blocks, clean up first
      if (specHasRef && !liveHasRef && liveBlockCount > 0) {
        for (const t of tabArr) {
          const g2 = (t as Record<string, unknown>).subModels as Record<string, unknown>;
          const gi2 = (g2?.grid as Record<string, unknown>)?.subModels as Record<string, unknown>;
          const ia2 = (gi2?.items || []) as { uid?: string; use?: string }[];
          for (const item of (Array.isArray(ia2) ? ia2 : [])) {
            if (item.uid && item.use !== 'ReferenceBlockModel') {
              try { await nb.surfaces.removeNode(item.uid); } catch { /* skip */ }
              log(`    - removed default ${item.use} from popup (spec wants reference)`);
            }
          }
        }
      }

      const hasContent = tabArr.length >= specTabCount && liveBlockCount >= specBlockCount && liveBlockCount > 0
        && (!specHasRef || liveHasRef); // reference spec needs reference blocks
      if (hasContent) {
        // Popup exists — sync content only (fillBlock for JS, templateRef, etc.)
        // Do NOT re-compose: just update existing blocks in-place by position
        log(`  = popup [${targetRef}] (exists, sync content)`);
        const blocks = popupSpec.blocks || (tabsSpec ? tabsSpec[0]?.blocks : []) || [];
        const popupLayout = popupSpec.layout || (tabsSpec ? tabsSpec[0]?.layout : undefined);

        if (blocks.length) {
          // Use state-based key→uid mapping, OR extract from live tree
          let blocksState = { ...existingPopupBlocks };
          if (!Object.keys(blocksState).length) {
            // No state — extract block UIDs from live tree
            blocksState = extractLiveBlockState(tabArr, blocks);
          }
          if (Object.keys(blocksState).length) {
            const { fillBlock } = await import('../blocks/block-filler');
            for (const bs of blocks) {
              const key = bs.key || bs.type;
              const existing = blocksState[key];
              if (!existing?.uid) continue;
              await fillBlock(ctx, existing.uid, existing.grid_uid || '', bs, coll, {
                modDir,
                blockState: existing,
                allBlocksState: blocksState,
              });
            }
            // Apply layout
            if (popupLayout) {
              const { parseLayoutSpec, applyLayout } = await import('../../layout/layout-engine');
              const tg0 = (tabArr[0] as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
              const gridUid = (tg0?.grid as Record<string, unknown>)?.uid as string || '';
              if (gridUid) {
                const uidMap: Record<string, string> = {};
                for (const [k, v] of Object.entries(blocksState)) {
                  if (v.uid) uidMap[k] = v.uid;
                }
                const layout = parseLayoutSpec(popupLayout as any[], Object.keys(uidMap));
                await applyLayout(nb, gridUid, layout, uidMap);
              }
            }
            return blocksState;
          }
          // No state → extract live blocks, then sync via deploySurface
          const liveBlocks = extractLiveBlockState(tabArr, blocks);
          const composeTarget = findChildPageTabUid(tree) || targetUid;
          const syncResult = await deploySurface(
            ctx, composeTarget, { blocks, coll, layout: popupLayout } as any, { modDir, existingState: liveBlocks },
          );
          return syncResult;
        }
        return {};
      }
    }
  } catch (e) {
    log(`  ! popup check [${targetRef}]: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }

  // Set click-to-open settings
  // Determine if this popup needs current record context:
  //   - recordActions (edit/view) and field click (name) need filterByTk
  //   - toolbar actions (addNew) don't need it
  const needsRecordContext = targetRef.includes('.recordActions.') || targetRef.includes('.fields.');
  const openViewSettings: Record<string, unknown> = {
    collectionName: coll,
    dataSourceKey: 'main',
    mode,
    size: 'large',
    pageModelClass: 'ChildPageModel',
    uid: targetUid,
  };
  if (needsRecordContext) {
    openViewSettings.filterByTk = '{{ctx.view.inputArgs.filterByTk}}';
  }
  try {
    await nb.updateModel(targetUid, {
      popupSettings: { openView: openViewSettings },
      displayFieldSettings: { clickToOpen: { clickToOpen: true } },
    });
  } catch (e) {
    log(`  ! popup openView set [${targetRef}]: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    return {};
  }

  let result: Record<string, BlockState> = {};
  if (tabsSpec) {
    result = await deployTabbedPopup(ctx, targetUid, targetRef, tabsSpec, coll, modDir, popupPath);
  } else {
    const blocks = popupSpec.blocks || [];
    if (blocks.length) {
      result = await deploySimplePopup(ctx, targetUid, targetRef, popupSpec, coll, modDir);
    }
  }
  return result;
}

async function deploySimplePopup(
  ctx: DeployContext,
  targetUid: string,
  targetRef: string,
  popupSpec: PopupSpec,
  coll: string,
  modDir: string,
): Promise<Record<string, BlockState>> {
  const { nb, log } = ctx;
  // Find ChildPage tab UID — compose can't target column/action wrappers directly
  let composeTarget = targetUid;
  try {
    const data = await nb.get({ uid: targetUid });
    const tabUid = findChildPageTabUid(data.tree);
    if (tabUid) composeTarget = tabUid;
  } catch { /* proceed with targetUid */ }

  // If every block in the popup will be skipped by surfaces.compose — either
  // because the type is not composable (mailMessages, comments, recordHistory,
  // reference) or because it carries a popup association binding (sourceId
  // with template var + associationName), then nothing triggers ChildPage
  // creation and the popup ends up empty. Pre-create the ChildPage scaffold
  // so step 1b's save_model has a grid to attach into.
  const blocks = popupSpec.blocks || [];
  const willCompose = (b: unknown): boolean => {
    const bo = b as { type?: string; resource_binding?: Record<string, unknown> };
    const t = bo.type;
    const legacy = !t || t === 'mailMessages' || t === 'comments' || t === 'recordHistory' || t === 'reference';
    if (legacy) return false;
    const rb = bo.resource_binding || {};
    const sid = rb.sourceId as string | undefined;
    return !(sid && sid.includes('{{') && rb.associationName);
  };
  const allSkipped = blocks.length > 0 && !(blocks as unknown[]).some(willCompose);
  if (allSkipped && composeTarget === targetUid) {
    composeTarget = await ensureChildPageScaffold(ctx, targetUid) || targetUid;
  }

  const spec = {
    coll,
    blocks,
    layout: popupSpec.layout,
  };
  const blocksState = await deploySurface(ctx, composeTarget, spec as any, { modDir });
  log(`  + popup [${targetRef}]: ${Object.keys(blocksState).length} blocks`);
  return blocksState;
}

/**
 * Manually create ChildPage → ChildPageTab → BlockGrid scaffold under a popup
 * host. Returns the tab UID (compose target) so subsequent block deploys can
 * attach into the new grid. Returns undefined on failure (caller falls back to
 * the host UID and the deploy degrades gracefully).
 */
async function ensureChildPageScaffold(
  ctx: DeployContext,
  hostUid: string,
): Promise<string | undefined> {
  const { nb } = ctx;
  try {
    const { generateUid } = await import('../../utils/uid');
    const pageUid = generateUid();
    const tabUid = generateUid();
    const gridUid = generateUid();
    await nb.models.save({
      uid: pageUid, use: 'ChildPageModel',
      parentId: hostUid, subKey: 'page', subType: 'object',
      sortIndex: 0, stepParams: {}, flowRegistry: {},
    });
    await nb.models.save({
      uid: tabUid, use: 'ChildPageTabModel',
      parentId: pageUid, subKey: 'tabs', subType: 'array',
      sortIndex: 0, stepParams: {}, flowRegistry: {},
    });
    await nb.models.save({
      uid: gridUid, use: 'BlockGridModel',
      parentId: tabUid, subKey: 'grid', subType: 'object',
      sortIndex: 0, stepParams: {}, flowRegistry: {},
    });
    return tabUid;
  } catch {
    return undefined;
  }
}

/**
 * Find the first tab UID inside a ChildPage, checking both direct .page and .field.page paths.
 */
function findChildPageTabUid(tree: Record<string, unknown>): string | null {
  const subs = tree.subModels as Record<string, unknown> | undefined;
  if (!subs) return null;

  // Direct: target.subModels.page
  let page = subs.page as Record<string, unknown> | undefined;
  if (!page || Array.isArray(page)) {
    // Table column: target.subModels.field.subModels.page
    const field = subs.field as Record<string, unknown> | undefined;
    if (field && !Array.isArray(field)) {
      page = (field.subModels as Record<string, unknown>)?.page as Record<string, unknown> | undefined;
    }
  }
  if (!page || Array.isArray(page)) return null;

  const pageSubs = page.subModels as Record<string, unknown> | undefined;
  const tabs = pageSubs?.tabs;
  const tabArr = Array.isArray(tabs) ? tabs : tabs ? [tabs] : [];
  if (tabArr.length) {
    return (tabArr[0] as Record<string, unknown>).uid as string || null;
  }
  return null;
}

/**
 * Extract block state from live popup tab tree, mapping by spec keys.
 * Used when popup has content but no saved state (first deploy sync).
 */
function extractLiveBlockState(
  tabArr: unknown[],
  specBlocks: BlockSpec[],
): Record<string, BlockState> {
  const result: Record<string, BlockState> = {};
  if (!tabArr.length) return result;

  const t0 = tabArr[0] as Record<string, unknown>;
  const g = (t0.subModels as Record<string, unknown>)?.grid as Record<string, unknown>;
  const items = (g?.subModels as Record<string, unknown>)?.items;
  const itemArr = (Array.isArray(items) ? items : []) as Record<string, unknown>[];

  // Map items to spec blocks by position (same order as compose creates them)
  for (let i = 0; i < Math.min(itemArr.length, specBlocks.length); i++) {
    const item = itemArr[i];
    const bs = specBlocks[i];
    const key = bs.key || bs.type;
    const entry: BlockState = {
      uid: (item.uid as string) || '',
      type: bs.type,
      grid_uid: '',
    };

    // Extract inner grid UID
    const innerGrid = (item.subModels as Record<string, unknown>)?.grid as Record<string, unknown>;
    if (innerGrid?.uid) entry.grid_uid = (innerGrid.uid as string) || '';

    // Extract field UIDs from columns or grid items
    const cols = (item.subModels as Record<string, unknown>)?.columns;
    const colArr = (Array.isArray(cols) ? cols : []) as Record<string, unknown>[];
    if (colArr.length) {
      entry.fields = {};
      for (const col of colArr) {
        const fp = ((col.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
          ?.init as Record<string, unknown>;
        const fieldPath = (fp?.fieldPath || '') as string;
        if (fieldPath) entry.fields[fieldPath] = { wrapper: (col.uid as string) || '', field: '' };
      }
    }
    // Also check grid items for form fields
    const gridItems = (innerGrid?.subModels as Record<string, unknown>)?.items;
    const gridItemArr = (Array.isArray(gridItems) ? gridItems : []) as Record<string, unknown>[];
    if (gridItemArr.length && !entry.fields) {
      entry.fields = {};
      for (const gi of gridItemArr) {
        const fp = ((gi.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
          ?.init as Record<string, unknown>;
        const fieldPath = (fp?.fieldPath || '') as string;
        if (fieldPath) entry.fields[fieldPath] = { wrapper: (gi.uid as string) || '', field: '' };
      }
    }

    result[key] = entry;
  }
  return result;
}

/**
 * Sync a ChildPageTabModel's title to match DSL. NocoBase stores it in two
 * places (props.title + stepParams.pageTabSettings.tab.title) — both must
 * update, otherwise the UI keeps showing the old one. Reads raw row via
 * flowModels:get to avoid merged-view drift, writes back via flowModels:save.
 * Cheap no-op when title already matches.
 */
async function syncTabTitle(
  ctx: DeployContext,
  tabUid: string,
  desiredTitle: string,
): Promise<void> {
  const { nb, log } = ctx;
  if (!tabUid || !desiredTitle) return;
  try {
    const raw = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: tabUid } });
    const row = raw.data?.data as Record<string, unknown> | undefined;
    if (!row) return;
    const props = ((row.props as Record<string, unknown>) || {}) as Record<string, unknown>;
    const curTitle = props.title as string | undefined;
    if (curTitle === desiredTitle) return;
    props.title = desiredTitle;
    const sp = ((row.stepParams as Record<string, unknown>) || {}) as Record<string, unknown>;
    const pts = ((sp.pageTabSettings as Record<string, unknown>) || {}) as Record<string, unknown>;
    const tab = ((pts.tab as Record<string, unknown>) || {}) as Record<string, unknown>;
    tab.title = desiredTitle;
    pts.tab = tab;
    sp.pageTabSettings = pts;
    await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
      uid: tabUid,
      use: row.use,
      parentId: (row.parentId as string) || undefined,
      subKey: (row.subKey as string) || undefined,
      subType: (row.subType as string) || undefined,
      sortIndex: (row.sortIndex as number) || 0,
      flowRegistry: (row.flowRegistry as Record<string, unknown>) || {},
      props,
      stepParams: sp,
    });
    log(`      ~ tab title: '${curTitle || '(none)'}' → '${desiredTitle}'`);
  } catch (e) {
    log(`      ! tab title sync: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

async function deployTabbedPopup(
  ctx: DeployContext,
  targetUid: string,
  targetRef: string,
  tabsSpec: NonNullable<PopupSpec['tabs']>,
  coll: string,
  modDir: string,
  popupPath: string,
): Promise<Record<string, BlockState>> {
  const { nb, log } = ctx;
  log(`  + popup [${targetRef}]: ${tabsSpec.length} tabs`);
  const allBlocks: Record<string, BlockState> = {};

  // ── Step 1: Find ChildPage + first tab UID ──
  // ChildPage may be on target (.page) or on target.field (.field.page) for table columns
  let existingTabs: { uid: string }[] = [];
  let popupPageUid = '';
  let firstTabUid = '';
  try {
    const data = await nb.get({ uid: targetUid });
    let pp = data.tree.subModels?.page;
    if ((!pp || Array.isArray(pp)) && data.tree.subModels?.field) {
      const field = data.tree.subModels.field;
      if (field && !Array.isArray(field)) {
        pp = ((field as unknown as Record<string, unknown>).subModels as Record<string, unknown>)?.page as typeof pp;
      }
    }
    if (pp && !Array.isArray(pp)) {
      popupPageUid = (pp as unknown as Record<string, unknown>).uid as string || '';
      const subs = (pp as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
      const tl = subs?.tabs;
      existingTabs = (Array.isArray(tl) ? tl : tl ? [tl] : []) as { uid: string }[];
      if (existingTabs.length) {
        firstTabUid = existingTabs[0].uid || '';
      }
    }
  } catch (e) {
    log(`    ! read popup tabs: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }

  // If no ChildPage exists yet, compose to targetUid to trigger creation
  if (!popupPageUid) {
    const firstTabSpec = tabsSpec[0];
    const firstTabBlocks = await deploySurface(
      ctx, targetUid, { ...firstTabSpec, coll } as any, { modDir },
    );
    Object.assign(allBlocks, firstTabBlocks);
    log(`    tab '${firstTabSpec.title || 'Tab0'}': ${Object.keys(firstTabBlocks).length} blocks`);

    if (tabsSpec.length <= 1) return allBlocks;

    // Re-read ChildPage after compose
    try {
      const data = await nb.get({ uid: targetUid });
      let pp = data.tree.subModels?.page;
      if ((!pp || Array.isArray(pp)) && data.tree.subModels?.field) {
        const field = data.tree.subModels.field;
        if (field && !Array.isArray(field)) {
          pp = ((field as unknown as Record<string, unknown>).subModels as Record<string, unknown>)?.page as typeof pp;
        }
      }
      if (pp && !Array.isArray(pp)) {
        popupPageUid = (pp as unknown as Record<string, unknown>).uid as string || '';
        const subs = (pp as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
        const tl = subs?.tabs;
        existingTabs = (Array.isArray(tl) ? tl : tl ? [tl] : []) as { uid: string }[];
        firstTabUid = existingTabs[0]?.uid || '';
      }
    } catch { /* skip */ }

    if (!popupPageUid) {
      log(`    ! popup [${targetRef}]: ChildPage not found — cannot create additional tabs`);
      return allBlocks;
    }
    // Sync first tab's title from DSL. Compose auto-creates the row with a
    // default label; DSL never lands on it otherwise.
    if (firstTabUid && firstTabSpec.title) {
      await syncTabTitle(ctx, firstTabUid, firstTabSpec.title);
    }
  } else {
    // ChildPage already exists — compose first tab to its tab UID (not targetUid)
    const composeTarget = firstTabUid || targetUid;
    const firstTabSpec = tabsSpec[0];
    const firstTabBlocks = await deploySurface(
      ctx, composeTarget, { ...firstTabSpec, coll } as any, { modDir },
    );
    Object.assign(allBlocks, firstTabBlocks);
    log(`    tab '${firstTabSpec.title || 'Tab0'}': ${Object.keys(firstTabBlocks).length} blocks`);
    // Drift repair: sync title even on re-push — DSL may have changed
    // since the tab was created.
    if (firstTabUid && firstTabSpec.title) {
      await syncTabTitle(ctx, firstTabUid, firstTabSpec.title);
    }

    if (tabsSpec.length <= 1) return allBlocks;
  }

  // ── Step 3: Deploy remaining tabs via addPopupTab ──
  for (let i = 1; i < tabsSpec.length; i++) {
    const tabSpec = tabsSpec[i];
    const tabTitle = tabSpec.title || `Tab${i}`;
    let tabUid: string;

    if (i < existingTabs.length) {
      // Use existing tab UID
      tabUid = existingTabs[i].uid;
    } else {
      // Create new popup tab
      try {
        const result = await nb.surfaces.addPopupTab(popupPageUid, tabTitle);
        const r = result as Record<string, unknown>;
        tabUid = (r.popupTabUid || r.tabSchemaUid || r.tabUid || r.uid || '') as string;
        if (!tabUid) {
          log(`    ! tab '${tabTitle}': addPopupTab returned no UID`);
          continue;
        }
      } catch (e) {
        log(`    ! tab '${tabTitle}': ${e instanceof Error ? e.message : e}`);
        continue;
      }
    }

    // Sync title on every pass — addPopupTab sets it at creation, but an
    // existing reused tab needs drift repair, and addPopupTab itself has
    // been observed to not always stick the title on first call.
    await syncTabTitle(ctx, tabUid, tabTitle);

    const tabBlocks = await deploySurface(ctx, tabUid, { ...tabSpec, coll } as any, { modDir });
    Object.assign(allBlocks, tabBlocks);
    log(`    tab '${tabTitle}': ${Object.keys(tabBlocks).length} blocks`);
  }
  return allBlocks;
}
