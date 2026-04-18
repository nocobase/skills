/**
 * Rewrite template UIDs across a page tree before it deploys.
 *
 * Templates live in templates/ with UIDs minted at authoring / duplicate
 * time. At deploy time those UIDs may be remapped:
 *   - duplicate-project mints fresh UIDs, so the DSL UID ≠ live UID
 *   - template-deployer may reuse an existing template (name match) whose
 *     live UID differs from what the YAML declares
 *
 * This module walks every place in a page spec that holds a templateUid
 * reference and applies the uid/name maps. Caller contract: run this
 * BEFORE the page deployer starts composing, so all references it sees
 * point at live UIDs.
 *
 * Three lookup phases, in order:
 *   1. uidMap         exact UID remap (strongest)
 *   2. nameMap        by templateName (live templates by name)
 *   3. nameToTarget   fill missing targetUid from live template's own target
 */
import type { PageInfo } from '../page-discovery';
import type { TemplateUidMap } from './template-deployer';

type BlockLike = Record<string, unknown> & {
  templateRef?: { templateUid?: string; templateName?: string; targetUid?: string };
  _refName?: string;
  _refColl?: string;
  fields?: unknown[];
  blocks?: BlockLike[];
  tabs?: { blocks?: BlockLike[] }[];
  popupTemplate?: { uid?: string };
};

/**
 * Walk every page (+ tabs + popups) and remap template refs in-place.
 * Mutates the input — pages that already pointed at live UIDs are no-ops.
 */
export function rewriteTemplateUids(
  pages: PageInfo[],
  uidMap: TemplateUidMap,
  nameMap: Map<string, string> = new Map(),
  nameToTarget: Map<string, string> = new Map(),
): void {
  for (const page of pages) {
    rewriteInBlocks((page.layout.blocks || []) as BlockLike[], uidMap, nameMap, nameToTarget);
    if (page.layout.tabs) {
      for (const tab of page.layout.tabs) {
        rewriteInBlocks(((tab as Record<string, unknown>).blocks || []) as BlockLike[], uidMap, nameMap, nameToTarget);
      }
    }
    for (const popup of page.popups) {
      rewriteInBlocks(((popup as Record<string, unknown>).blocks || []) as BlockLike[], uidMap, nameMap, nameToTarget);
      if ((popup as Record<string, unknown>).tabs) {
        for (const tab of ((popup as Record<string, unknown>).tabs as Record<string, unknown>[])) {
          rewriteInBlocks((tab.blocks || []) as BlockLike[], uidMap, nameMap, nameToTarget);
        }
      }
    }
  }
}

function rewriteInBlocks(
  blocks: BlockLike[],
  uidMap: TemplateUidMap,
  nameMap: Map<string, string> = new Map(),
  nameToTarget: Map<string, string> = new Map(),
): void {
  for (const block of blocks) {
    // Case 1: templateRef (reference blocks)
    if (block.templateRef) {
      const ref = block.templateRef;
      // Phase 1: exact UID remap
      if (ref.templateUid) {
        const newUid = uidMap.get(ref.templateUid);
        if (newUid) ref.templateUid = newUid;
      }
      // Phase 2: fill templateUid by name when DSL declared only a name
      if (!ref.templateUid && ref.templateName) {
        const byName = nameMap.get(ref.templateName);
        if (byName) ref.templateUid = byName;
      }
      // Phase 2b: legacy _refName fallback
      if (!ref.templateUid && block._refName) {
        const byName = nameMap.get(block._refName);
        if (byName) ref.templateUid = byName;
      }
      // Phase 1b: same for targetUid (DSL-declared)
      if (ref.targetUid) {
        const newTarget = uidMap.get(ref.targetUid);
        if (newTarget) ref.targetUid = newTarget;
      }
      // Phase 3: fill missing targetUid from live template's own target.
      // Required for fresh ref blocks (no uid in DSL): the reference
      // block needs a targetUid to mirror, otherwise NocoBase shows
      // an empty card.
      if (!ref.targetUid && ref.templateName) {
        const byName = nameToTarget.get(ref.templateName);
        if (byName) ref.targetUid = byName;
      }
      delete block._refName;
      delete block._refColl;
    }

    // Case 2: fields with popupSettings.popupTemplateUid
    if (Array.isArray(block.fields)) {
      for (const f of block.fields) {
        if (typeof f !== 'object' || !f) continue;
        const ps = (f as Record<string, unknown>).popupSettings as { popupTemplateUid?: string } | undefined;
        if (ps?.popupTemplateUid) {
          const newUid = uidMap.get(ps.popupTemplateUid);
          if (newUid) ps.popupTemplateUid = newUid;
        }
      }
    }

    // Case 3: popupTemplate on blocks (e.g. popup-deployer path)
    if (block.popupTemplate?.uid) {
      const newUid = uidMap.get(block.popupTemplate.uid);
      if (newUid) block.popupTemplate.uid = newUid;
    }

    // Recurse into nested blocks (tabs, popups)
    if (Array.isArray(block.blocks)) {
      rewriteInBlocks(block.blocks, uidMap, nameMap, nameToTarget);
    }
    if (Array.isArray(block.tabs)) {
      for (const tab of block.tabs) {
        rewriteInBlocks((tab.blocks || []) as BlockLike[], uidMap);
      }
    }
  }
}
