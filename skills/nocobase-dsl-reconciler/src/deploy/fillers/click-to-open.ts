/**
 * Deploy clickToOpen popups on table fields.
 *
 * Priority order:
 *   1. Inline popup content (from template export) → deploySurface
 *   2. Popup already deployed (by popup-deployer) → skip
 *   3. Template copy mode → read template → deploySurface
 *   4. Circular reference / max depth → simple details fallback
 *   5. Default details → compose basic details block
 *
 * ⚠️ PITFALLS:
 * - popupSettings.uid must point to FIELD uid (NocoBase resolves field → page)
 * - Must check existing popup blockCount vs spec blockCount to avoid overwriting
 * - See src/PITFALLS.md for complete list.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../../client';
import type { BlockSpec } from '../../types/spec';
import type { BlockState } from '../../types/state';
import type { DeployContext, PopupContext } from './types';
// loadTemplateContent no longer needed — popup templates kept as references

// Per-deploy cache of popup template file paths already promoted to live
// flowModelTemplates. Keyed by the template file path (relative to project
// root). Prevents re-promoting the same template when a second field
// references it — second field just binds by popupTemplateUid via Path 0.
const _promotedPopupCache = new Map<string, { templateUid: string; targetUid: string }>();

export function resetPromotedPopupCache(): void {
  _promotedPopupCache.clear();
}

export async function deployClickToOpen(
  ctx: DeployContext,
  bs: BlockSpec,
  coll: string,
  fieldStates: Record<string, { wrapper: string; field?: string }>,
  modDir: string,
  allBlocksState: Record<string, BlockState>,
  popupContext: PopupContext,
  popupTargetFields?: Set<string>,
): Promise<void> {
  const { nb, log } = ctx;
  if (bs.type !== 'table') return;

  const mod = path.resolve(modDir);

  for (const f of bs.fields || []) {
    if (typeof f !== 'object' || !f.clickToOpen) continue;
    const fp = f.field || f.fieldPath || '';
    const wrapperUid = fieldStates[fp]?.wrapper;
    if (!wrapperUid) continue;

    try {
      const colData = await nb.get({ uid: wrapperUid });
      const fieldSub = colData.tree.subModels?.field;
      if (!fieldSub || Array.isArray(fieldSub)) continue;

      const fieldUid = (fieldSub as { uid: string }).uid;
      const update: Record<string, unknown> = {
        displayFieldSettings: { clickToOpen: { clickToOpen: true } },
      };

      const ps = (f as unknown as Record<string, unknown>).popupSettings as Record<string, unknown>;
      const inlinePopup = (f as unknown as Record<string, unknown>).popup as Record<string, unknown>;

      if (ps || inlinePopup) {
        const popupColl = ((ps?.collectionName || inlinePopup?.collectionName || coll) as string) || coll;

        // ── Path 0: Popup template reference (popupTemplateUid) ──
        if (ps?.popupTemplateUid) {
          // Must use flowModels:save — configure API strips popupTemplateUid
          try {
            const fieldResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: fieldUid } });
            const fieldData = fieldResp.data.data;
            if (fieldData) {
              const sp = fieldData.stepParams || {};
              // Look up template targetUid
              let templateTargetUid = '';
              try {
                const tmplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, {
                  params: { filterByTk: ps.popupTemplateUid },
                });
                templateTargetUid = tmplResp.data.data?.targetUid || '';
              } catch (e) { log(`      ! clickToOpen ${fp} template lookup: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
              sp.popupSettings = { openView: {
                collectionName: popupColl, dataSourceKey: 'main',
                mode: (ps.mode || 'drawer') as string, size: (ps.size || 'large') as string,
                popupTemplateUid: ps.popupTemplateUid,
                ...(templateTargetUid ? { uid: templateTargetUid } : {}),
                popupTemplateHasFilterByTk: false,
                popupTemplateHasSourceId: false,
              }};
              sp.displayFieldSettings = { clickToOpen: { clickToOpen: true } };
              await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
                uid: fieldUid, use: fieldData.use, parentId: fieldData.parentId,
                subKey: fieldData.subKey, subType: fieldData.subType,
                stepParams: sp, sortIndex: fieldData.sortIndex || 0, flowRegistry: fieldData.flowRegistry || {},
              });
              log(`      ~ clickToOpen: ${fp} (popup template: ${ps.popupTemplateUid})`);
            }
          } catch (e) {
            log(`      ! clickToOpen ${fp} popupTemplate: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
          }
          continue;
        }

        // ── Path 1: Inline popup content (highest priority) ──
        if (inlinePopup && (inlinePopup.blocks || inlinePopup.tabs)) {
          // If a prior field this deploy-run already promoted this popup
          // template file to a live flowModelTemplate, skip re-inlining and
          // bind via popupTemplateUid (Path 0 behaviour) — saves duplicate
          // compose work and keeps all references pointing at one template.
          const tplMeta = inlinePopup._templateMeta as Record<string, unknown> | undefined;
          const tplPath = tplMeta?.path as string | undefined;
          const cached = tplPath ? _promotedPopupCache.get(tplPath) : undefined;
          if (cached) {
            try {
              const fieldResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: fieldUid } });
              const fieldData = fieldResp.data.data;
              if (fieldData) {
                const sp = fieldData.stepParams || {};
                sp.popupSettings = { openView: {
                  collectionName: popupColl, dataSourceKey: 'main',
                  mode: (ps?.mode || 'drawer') as string, size: (ps?.size || 'large') as string,
                  popupTemplateUid: cached.templateUid,
                  ...(cached.targetUid ? { uid: cached.targetUid } : {}),
                  popupTemplateHasFilterByTk: false,
                  popupTemplateHasSourceId: false,
                } };
                sp.displayFieldSettings = { clickToOpen: { clickToOpen: true } };
                await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
                  uid: fieldUid, use: fieldData.use, parentId: fieldData.parentId,
                  subKey: fieldData.subKey, subType: fieldData.subType,
                  stepParams: sp, sortIndex: fieldData.sortIndex || 0, flowRegistry: fieldData.flowRegistry || {},
                });
                log(`      ~ clickToOpen: ${fp} (bound to promoted template: ${cached.templateUid.slice(0, 8)})`);
                continue;
              }
            } catch (e) {
              log(`      ! clickToOpen ${fp} cached-promote bind: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
            }
          }
          await deployInlinePopup(ctx, fieldUid, fp, inlinePopup, ps, popupColl, coll, mod, popupContext);
          continue;
        }

        // ── Path 2: Check if popup already deployed ──
        const alreadyDeployed = await checkExistingPopup(nb, fieldUid);
        if (alreadyDeployed) {
          update.popupSettings = makePopupSettings(fieldUid, popupColl, ps);
          log(`      ~ clickToOpen: ${fp} (popup already deployed)`);
          await nb.updateModel(fieldUid, update);
          continue;
        }

        // ── Path 3/4/5: Circular, template, popup file, or default ──
        const isCircular = popupContext.seenColls.has(popupColl);
        // If a popup YAML file handles this field, skip content creation here
        const hasPopupFile = popupTargetFields?.has(fp);

        if (isCircular) {
          // Circular reference → stop recursion
          log(`      ~ clickToOpen: ${fp} (circular: ${popupColl}, stop)`);
          if (!hasPopupFile) await deployDefaultDetails(nb, fieldUid, popupColl);
          update.popupSettings = makePopupSettings(fieldUid, popupColl, ps);
        } else {
          const hasTemplateRef = !!ps?.popupTemplateUid;

          if (hasTemplateRef) {
            // Has popup template → keep as reference (don't expand)
            log(`      ~ clickToOpen: ${fp} (popup template ref)`);
          } else if (hasPopupFile) {
            // Popup YAML file exists → popup deployer handles content
            log(`      ~ clickToOpen: ${fp} (popup file handles content)`);
          } else {
            // No template ref, no popup file → deploy default details
            await deployDefaultDetails(nb, fieldUid, popupColl);
            log(`      ~ clickToOpen: ${fp} (default details)`);
          }
          update.popupSettings = makePopupSettings(fieldUid, popupColl, ps);
        }
      }

      await nb.updateModel(fieldUid, update);
      log(`      ~ clickToOpen: ${fp}`);
    } catch (e) {
      log(`      ! clickToOpen ${fp}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }
}

// ── Internal helpers ──

async function deployInlinePopup(
  ctx: DeployContext,
  fieldUid: string,
  fp: string,
  inlinePopup: Record<string, unknown>,
  ps: Record<string, unknown> | undefined,
  popupColl: string,
  parentColl: string,
  mod: string,
  popupContext: PopupContext,
): Promise<void> {
  const { nb, log } = ctx;
  const childCtx = makeChildContext(popupContext, parentColl);

  // Find correct modDir for template JS files
  let popupModDir = mod;
  const templateName = inlinePopup._template as string;
  if (templateName) {
    popupModDir = resolveTemplateDir(mod, templateName) || mod;
  }

  const popupTabs = inlinePopup.tabs as Record<string, unknown>[];
  const popupBlocks = inlinePopup.blocks as Record<string, unknown>[];

  if (popupTabs?.length) {
    // Multi-tab popup → use deployPopup
    const { deployPopup } = await import('../popup-deployer');
    await deployPopup(ctx, fieldUid, `${fp}.popup`, {
      target: '',
      mode: (inlinePopup.mode || ps?.mode || 'drawer') as 'drawer' | 'dialog',
      coll: popupColl,
      tabs: popupTabs.map(t => ({
        title: t.title as string,
        blocks: (t.blocks || []) as any[],
      })),
    } as any, { modDir: popupModDir });
  } else if (popupBlocks?.length) {
    const { deploySurface } = await import('../surface-deployer');
    try {
      await deploySurface(ctx, fieldUid,
        { blocks: popupBlocks as any[], coll: popupColl } as any,
        { modDir: popupModDir, popupContext: childCtx });
    } catch (e) {
      log(`      ! inline popup ${fp}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }

  const update: Record<string, unknown> = {
    displayFieldSettings: { clickToOpen: { clickToOpen: true } },
    popupSettings: {
      openView: {
        collectionName: popupColl, dataSourceKey: 'main',
        mode: (inlinePopup.mode || ps?.mode || 'drawer') as string,
        size: (inlinePopup.size || ps?.size || 'medium') as string,
        pageModelClass: 'ChildPageModel', uid: fieldUid,
        filterByTk: (ps?.filterByTk || '{{ctx.view.inputArgs.filterByTk}}') as string,
      },
    },
  };
  log(`      ~ clickToOpen: ${fp} (inline popup: ${popupTabs?.length || 0} tabs, ${popupBlocks?.length || 0} blocks)`);
  await nb.updateModel(fieldUid, update);

  // Promote the just-inlined popup into a live flowModelTemplate so
  // defaults.yaml m2o auto-binding can find it (by collection + type=popup)
  // and bind other m2o fields to it. Only fires when the inline popup
  // originated from a `templates/popup/*.yaml` file tagged with _templateMeta
  // by page-discovery. Cached by template path so subsequent fields pointing
  // to the same file skip inline entirely (see Path 1 cache check).
  const meta = inlinePopup._templateMeta as Record<string, unknown> | undefined;
  if (meta?.path && meta.name) {
    const tplPath = meta.path as string;
    if (!_promotedPopupCache.has(tplPath)) {
      try {
        // Check if a template with this name+coll already exists (idempotent re-deploys)
        let templateUid = '';
        let targetUid = '';
        try {
          const existing = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, {
            params: { paginate: false, 'filter[name]': meta.name as string, 'filter[collectionName]': popupColl },
          });
          const row = (existing.data?.data || [])[0] as Record<string, unknown> | undefined;
          if (row?.uid) {
            templateUid = row.uid as string;
            targetUid = (row.targetUid as string) || '';
          }
        } catch { /* fall through to convert */ }

        if (!templateUid) {
          const saveResult = await nb.surfaces.saveTemplate({
            target: { uid: fieldUid },
            name: meta.name as string,
            description: meta.name as string,
            type: 'popup',
            collectionName: popupColl,
            dataSourceKey: 'main',
            saveMode: 'convert',
          }) as Record<string, unknown>;
          templateUid = (saveResult.uid || saveResult.templateUid) as string;
          targetUid = (saveResult.targetUid as string) || '';
          if (templateUid) log(`      + popup template: ${meta.name} (promoted: ${templateUid.slice(0, 8)})`);
        } else {
          log(`      = popup template: ${meta.name} (reused: ${templateUid.slice(0, 8)})`);
        }

        if (templateUid) {
          _promotedPopupCache.set(tplPath, { templateUid, targetUid });
          // Update THIS field to reference the template by uid (stable across redeploys).
          // Also destroy the orphaned inline page underneath the field — clicking
          // openView.uid=targetUid would otherwise still resolve to the stale
          // inline tree (NocoBase looks up ChildPage by the host field's subtree
          // when openView.uid matches).
          try {
            const fieldResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: fieldUid } });
            const fieldData = fieldResp.data.data;
            if (fieldData) {
              const sp = fieldData.stepParams || {};
              sp.popupSettings = { openView: {
                collectionName: popupColl, dataSourceKey: 'main',
                mode: (inlinePopup.mode || ps?.mode || 'drawer') as string,
                size: (inlinePopup.size || ps?.size || 'medium') as string,
                popupTemplateUid: templateUid,
                ...(targetUid ? { uid: targetUid } : {}),
                popupTemplateHasFilterByTk: false,
                popupTemplateHasSourceId: false,
              } };
              sp.displayFieldSettings = { clickToOpen: { clickToOpen: true } };
              await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
                uid: fieldUid, use: fieldData.use, parentId: fieldData.parentId,
                subKey: fieldData.subKey, subType: fieldData.subType,
                stepParams: sp, sortIndex: fieldData.sortIndex || 0, flowRegistry: fieldData.flowRegistry || {},
              });
            }
            // Destroy the stale inline ChildPage (if any) now that the field
            // points at a template's targetUid. Leaving it causes NocoBase to
            // render the inline tree instead of the template on click.
            try {
              const tree = await nb.get({ uid: fieldUid });
              const page = tree.tree.subModels?.page as Record<string, unknown> | undefined;
              const pageUid = page?.uid as string | undefined;
              if (pageUid && pageUid !== targetUid) {
                await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: pageUid } }).catch(() => {});
                log(`      ~ cleared stale inline page ${pageUid.slice(0, 8)}`);
              }
            } catch { /* best-effort */ }
          } catch (e) {
            log(`      ! rebinding ${fp} to promoted template: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
          }
        }
      } catch (e) {
        log(`      ! popup promote ${meta.name}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }
  }
}

async function checkExistingPopup(nb: NocoBaseClient, fieldUid: string): Promise<boolean> {
  try {
    const fieldCheck = await nb.get({ uid: fieldUid });
    const existingPage = fieldCheck.tree.subModels?.page;
    if (!existingPage || Array.isArray(existingPage)) return false;

    const existingTabs = (existingPage as any).subModels?.tabs;
    const tabArr = Array.isArray(existingTabs) ? existingTabs : existingTabs ? [existingTabs] : [];
    let blockCount = 0;
    for (const t of tabArr as any[]) {
      const items = t.subModels?.grid?.subModels?.items;
      blockCount += Array.isArray(items) ? items.length : 0;
    }
    return blockCount > 1; // more than default 1 block
  } catch {
    return false;
  }
}

async function deployDefaultDetails(
  nb: NocoBaseClient,
  fieldUid: string,
  popupColl: string,
): Promise<void> {
  try {
    const meta = await nb.collections.fieldMeta(popupColl);
    const defaultFields = Object.keys(meta)
      .filter(k => !['id', 'createdById', 'updatedById'].includes(k))
      .slice(0, 8)
      .map(k => ({ fieldPath: k }));
    await nb.surfaces.compose(fieldUid, [{
      key: 'details', type: 'details',
      resource: { collectionName: popupColl, dataSourceKey: 'main', binding: 'currentRecord' },
      fields: defaultFields,
    }], 'replace');
  } catch (e) { /* default details is best-effort — log only in debug */
    if (process.env.NB_DEBUG) console.debug(`  [debug] deployDefaultDetails ${popupColl}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

function makePopupSettings(
  fieldUid: string,
  popupColl: string,
  ps?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    openView: {
      collectionName: popupColl,
      dataSourceKey: 'main',
      mode: ps?.mode || 'drawer',
      size: ps?.size || 'medium',
      pageModelClass: 'ChildPageModel',
      uid: fieldUid,
      filterByTk: ps?.filterByTk || '{{ctx.view.inputArgs.filterByTk}}',
    },
  };
}

function makeChildContext(parent: PopupContext, coll: string): PopupContext {
  return {
    seenColls: new Set([...parent.seenColls, coll]),
  };
}

function resolveTemplateDir(mod: string, templateName: string): string | null {
  for (let d = mod; d !== path.dirname(d); d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'templates'))) {
      const slugName = templateName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      for (const tplType of ['popup', 'block']) {
        const candidate = path.join(d, 'templates', tplType, slugName);
        if (fs.existsSync(path.join(candidate, 'js'))) return candidate;
        // Legacy: templates/popup/<slug>_js/ (old format)
        const legacyCandidate = path.join(d, 'templates', tplType, `${slugName}_js`);
        if (fs.existsSync(legacyCandidate)) {
          const jsSubDir = path.join(legacyCandidate, 'js');
          if (!fs.existsSync(jsSubDir)) {
            fs.mkdirSync(jsSubDir, { recursive: true });
            for (const f of fs.readdirSync(legacyCandidate)) {
              if (f.endsWith('.js')) {
                fs.copyFileSync(path.join(legacyCandidate, f), path.join(jsSubDir, f));
              }
            }
          }
          return legacyCandidate;
        }
      }
      return null;
    }
  }
  return null;
}
