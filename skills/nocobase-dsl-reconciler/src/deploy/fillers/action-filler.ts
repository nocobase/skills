/**
 * Deploy ALL actions — unified single-pass, matching Python deployer pattern.
 *
 * Flow: check state → check live → create if missing. Never delete.
 * Compose creates standard actions → state tracks them → this loop skips.
 * Only creates actions that compose missed (save_model path, non-compose types).
 */
import type { BlockSpec } from '../../types/spec';
import type { BlockState } from '../../types/state';
import type { DeployContext } from './types';
import { generateUid } from '../../utils/uid';
import { buildAiButton } from './ai-button';
import { actionKey as genActionKey, deduplicateKey } from '../../utils/action-key';
import {
  FILLABLE_ACTION_TYPE_TO_MODEL,
  NON_COMPOSE_ACTION_TYPE_TO_MODEL as NON_COMPOSE_ACTION_MAP,
  MODEL_TO_ACTION_TYPE,
} from '../../utils/block-types';

// All action types we can create (fillable + non-compose)
const ALL_ACTION_MAP: Record<string, string> = {
  ...FILLABLE_ACTION_TYPE_TO_MODEL,
  ...NON_COMPOSE_ACTION_MAP,
};

export async function deployActions(
  ctx: DeployContext,
  blockUid: string,
  bs: BlockSpec,
  blockState: BlockState,
  modDir: string,
  actColUid = '',
  isRecordActionBlock = false,
): Promise<void> {
  const { nb, log } = ctx;
  // Read live actions once for dedup (compose/blueprint may have created some)
  const liveActionsByUse = new Map<string, string>(); // use → uid
  try {
    const blockData = await nb.get({ uid: blockUid });
    for (const subKey of ['actions', 'recordActions'] as const) {
      const raw = blockData.tree.subModels?.[subKey];
      const arr = (Array.isArray(raw) ? raw : []) as { uid: string; use: string }[];
      for (const a of arr) {
        if (a.use && a.uid) liveActionsByUse.set(a.use, a.uid);
      }
    }
    // Also check actCol actions (table row-level)
    if (actColUid) {
      const cols = blockData.tree.subModels?.columns;
      const colArr = (Array.isArray(cols) ? cols : []) as { uid: string; use?: string; subModels?: Record<string, unknown> }[];
      const actCol = colArr.find(c => c.uid === actColUid);
      if (actCol) {
        const actColActs = actCol.subModels?.actions;
        for (const a of (Array.isArray(actColActs) ? actColActs : []) as { uid: string; use: string }[]) {
          if (a.use && a.uid) liveActionsByUse.set(a.use, a.uid);
        }
      }
    }
  } catch { /* skip */ }

  const allActions = [...(bs.actions || []), ...(bs.recordActions || [])];
  const usedStateKeys = new Set<string>();

  for (const aspec of allActions) {
    const atype = typeof aspec === 'string' ? aspec : (aspec as Record<string, unknown>).type as string;
    const amodel = ALL_ACTION_MAP[atype];
    if (!amodel) continue;

    let actionSp = typeof aspec === 'object' ? (aspec as Record<string, unknown>).stepParams as Record<string, unknown> || {} : {};
    let actionProps = typeof aspec === 'object' ? (aspec as Record<string, unknown>).props as Record<string, unknown> || {} : {};

    // AI button shorthand
    if (atype === 'ai' && typeof aspec === 'object') {
      const spec = aspec as Record<string, unknown>;
      if (spec.employee && !Object.keys(actionSp).length) {
        const { sp, props } = buildAiButton(spec, blockUid, modDir);
        actionSp = sp;
        actionProps = props;
      }
    }

    const isRecordAction = (bs.recordActions || []).includes(aspec);
    const stateKey = isRecordAction ? 'record_actions' : 'actions';
    if (!blockState[stateKey]) blockState[stateKey] = {};
    const existingGroup = blockState[stateKey]!;

    const specKey = typeof aspec === 'object' ? (aspec as Record<string, unknown>).key as string : undefined;
    const stateActionKey = deduplicateKey(specKey || genActionKey(aspec), usedStateKeys);

    // ① Already in state → update config if needed, skip creation
    if (existingGroup[stateActionKey]?.uid) {
      const existingUid = existingGroup[stateActionKey].uid;
      if (Object.keys(actionSp).length || Object.keys(actionProps).length) {
        const update: Record<string, unknown> = { uid: existingUid };
        if (Object.keys(actionSp).length) update.stepParams = actionSp;
        if (Object.keys(actionProps).length) update.props = actionProps;
        await nb.models.save(update);
      }
      continue;
    }

    // ② Found in live tree → track + update config
    const existingLiveUid = liveActionsByUse.get(amodel);
    if (existingLiveUid) {
      if (Object.keys(actionSp).length || Object.keys(actionProps).length) {
        const update: Record<string, unknown> = { uid: existingLiveUid };
        if (Object.keys(actionSp).length) update.stepParams = actionSp;
        update.props = Object.keys(actionProps).length ? actionProps : {};
        await nb.models.save(update);
      }
      existingGroup[stateActionKey] = { uid: existingLiveUid };
      liveActionsByUse.delete(amodel);
      continue;
    }

    // ③ Create new — fillable types try addAction first, others use save_model
    const isFillable = atype in FILLABLE_ACTION_TYPE_TO_MODEL;
    let uid = '';

    if (isFillable) {
      try {
        const result = (isRecordAction || isRecordActionBlock)
          ? await nb.surfaces.addRecordAction(blockUid, atype) as Record<string, unknown>
          : await nb.surfaces.addAction(blockUid, atype) as Record<string, unknown>;
        uid = (result?.uid as string) || '';
      } catch {
        // Fallback to save_model below
      }
    }

    if (!uid) {
      // save_model creation
      const parentId = (isRecordAction && actColUid) ? actColUid : blockUid;
      const desiredSubKey = (isRecordAction && actColUid) ? 'actions' : (isRecordAction ? 'recordActions' : 'actions');
      uid = generateUid();
      try {
        await nb.models.save({
          uid, use: amodel,
          parentId, subKey: desiredSubKey, subType: 'array',
          sortIndex: 0, stepParams: actionSp, props: actionProps, flowRegistry: {},
        });
      } catch (e) {
        log(`      ! action ${atype}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
        uid = '';
      }
    }

    if (uid) {
      existingGroup[stateActionKey] = { uid };
    }
  }
}
