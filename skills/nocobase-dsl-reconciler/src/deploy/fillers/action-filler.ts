/**
 * Deploy ALL actions — unified single-pass, matching Python deployer pattern.
 *
 * Flow: check state → check live → create if missing → prune stale.
 * Compose creates standard actions → state tracks them → this loop skips.
 * Only creates actions that compose missed (save_model path, non-compose types).
 *
 * Pruning (stale actions): any action recorded in state.yaml under this block
 * whose key no longer appears in the DSL is destroyed on the NB side and
 * removed from state. state.yaml is the "this-tool deployed" ledger, so
 * manually-authored NB actions (never in state) are left alone — safe.
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

  // Compute desired-key sets up-front. Mirror the main loop's dedup: one
  // shared `usedStateKeys` counter across actions + recordActions, iterated
  // in that same order so the keys we compute here match the ones the main
  // loop will assign.
  const desiredActionKeys = new Set<string>();
  const desiredRecordActionKeys = new Set<string>();
  {
    const shared = new Set<string>();
    for (const aspec of bs.actions || []) {
      const k = (typeof aspec === 'object' ? (aspec as Record<string, unknown>).key as string : undefined) || genActionKey(aspec);
      desiredActionKeys.add(deduplicateKey(k, shared));
    }
    for (const aspec of bs.recordActions || []) {
      const k = (typeof aspec === 'object' ? (aspec as Record<string, unknown>).key as string : undefined) || genActionKey(aspec);
      desiredRecordActionKeys.add(deduplicateKey(k, shared));
    }
  }

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

    // AI button shorthand: { type: ai, employee: viz, tasks_file: ./path }
    if (atype === 'ai' && typeof aspec === 'object') {
      const spec = aspec as Record<string, unknown>;
      // Accept `tasks` as alias for `tasks_file`
      if (spec.tasks && !spec.tasks_file) spec.tasks_file = spec.tasks;
      if (spec.employee && !Object.keys(actionSp).length) {
        const { sp, props } = buildAiButton(spec, blockUid, modDir);
        actionSp = sp;
        actionProps = props;
      }
    }

    // Link button shorthand: { type: link, title: ..., url: ... }
    if (atype === 'link' && typeof aspec === 'object') {
      const spec = aspec as Record<string, unknown>;
      if (!Object.keys(actionSp).length && (spec.title || spec.url)) {
        actionSp = buildLinkStepParams(spec);
      }
    }

    // UpdateRecord shorthand: { type: updateRecord, assign: {...}, hiddenWhen: {...} }
    if (atype === 'updateRecord' && typeof aspec === 'object') {
      const spec = aspec as Record<string, unknown>;
      if (!Object.keys(actionSp).length && (spec.assign || spec.title || spec.icon)) {
        actionSp = buildUpdateRecordStepParams(spec);
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

  // Reorder actions to match DSL declaration order (sortIndex)
  await reorderActions(nb, blockState, bs, actColUid);

  // Prune: destroy live actions whose keys are no longer in DSL, then drop
  // from state. Only touches entries state.yaml tracked — user-authored NB
  // actions (not in state) are left alone.
  for (const [stateKey, desired] of [
    ['actions', desiredActionKeys],
    ['record_actions', desiredRecordActionKeys],
  ] as const) {
    const group = blockState[stateKey];
    if (!group) continue;
    for (const key of Object.keys(group)) {
      if (desired.has(key)) continue;
      const uid = group[key]?.uid;
      if (uid) {
        try {
          await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: uid } });
          log(`      - removed ${stateKey} "${key}" (uid=${uid})`);
        } catch (e) {
          log(`      ! destroy ${stateKey} "${key}": ${e instanceof Error ? e.message.slice(0, 60) : e}`);
        }
      }
      delete group[key];
    }
  }
}

async function reorderActions(
  nb: NocoBaseClient,
  blockState: BlockState,
  bs: BlockSpec,
  actColUid: string,
): Promise<void> {
  const reorder = async (specs: (string | Record<string, unknown>)[], stateGroup: Record<string, { uid: string }>) => {
    // Build key→uid from state, then match by DSL order
    const usedKeys = new Set<string>();
    for (let i = 0; i < specs.length; i++) {
      const aspec = specs[i];
      const stateKey = deduplicateKey(
        (typeof aspec === 'object' ? (aspec as Record<string, unknown>).key as string : undefined) || genActionKey(aspec),
        usedKeys,
      );
      const uid = stateGroup[stateKey]?.uid;
      if (uid) {
        try { await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, { uid, sortIndex: i }); } catch { /* best effort */ }
      }
    }
  };

  if (bs.actions?.length) await reorder(bs.actions as any[], blockState.actions || {});
  if (bs.recordActions?.length) await reorder(bs.recordActions as any[], blockState.record_actions || {});
}

// ── Compact action format builders ──

function buildLinkStepParams(spec: Record<string, unknown>): Record<string, unknown> {
  const title = (spec.title || '') as string;
  const icon = spec.icon as string | undefined;
  const url = (spec.url || '') as string;
  return {
    buttonSettings: {
      general: { title, ...(icon ? { icon } : {}) },
    },
    linkButtonSettings: { editLink: { url } },
  };
}

function buildUpdateRecordStepParams(spec: Record<string, unknown>): Record<string, unknown> {
  const style = spec.style as string | undefined;
  const icon = spec.icon as string | undefined;
  const title = spec.title as string | undefined;
  const tooltip = spec.tooltip as string | undefined;
  const assign = spec.assign as Record<string, unknown> | undefined;
  const hiddenWhen = spec.hiddenWhen as Record<string, unknown> | undefined;
  const disabledWhen = spec.disabledWhen as Record<string, unknown> | undefined;

  const general: Record<string, unknown> = {};
  if (style) general.type = style;
  if (icon) general.icon = icon;
  if (title !== undefined) general.title = title;
  else general.title = '';
  if (tooltip) general.tooltip = tooltip;

  // Build linkageRules: from hiddenWhen/disabledWhen shorthand, or pass through raw linkageRules.
  // NB reads buttonSettings.linkageRules as a FLAT array (see
  // plugin-flow-engine/server/flow-surfaces/catalog.ts: `linkageRules: ARRAY_SCHEMA`
  // and core/client/flow/actions/linkageRulesRefresh.tsx: getStepParams(flowKey, stepKey)
  // returns the array directly). If the DSL wraps rules in `{value: [...]}` (legacy
  // export shape), unwrap here before writing to NB — otherwise the runtime receives
  // an object and treats it as "no rules", so hide/disable conditions never fire.
  const builtRules = buildLinkageRules(hiddenWhen, disabledWhen);
  const rawRules = spec.linkageRules as unknown;
  const rulesArray = builtRules || normaliseRulesArray(rawRules);
  const stepParams: Record<string, unknown> = {
    buttonSettings: { general, ...(rulesArray?.length ? { linkageRules: rulesArray } : {}) },
  };
  if (assign && Object.keys(assign).length) {
    stepParams.assignSettings = { assignFieldValues: { assignedValues: assign } };
  }
  return stepParams;
}

function normaliseRulesArray(raw: unknown): Record<string, unknown>[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).value)) {
    return (raw as Record<string, unknown>).value as Record<string, unknown>[];
  }
  return null;
}

function buildLinkageRules(
  hiddenWhen?: Record<string, unknown>,
  disabledWhen?: Record<string, unknown>,
): Record<string, unknown>[] | null {
  const rules: Record<string, unknown>[] = [];
  if (hiddenWhen && Object.keys(hiddenWhen).length) {
    rules.push({
      title: 'Linkage rule', enable: true,
      condition: buildCondition(hiddenWhen),
      actions: [{ name: 'linkageSetActionProps', params: { value: 'hidden' } }],
    });
  }
  if (disabledWhen && Object.keys(disabledWhen).length) {
    rules.push({
      title: 'Linkage rule', enable: true,
      condition: buildCondition(disabledWhen),
      actions: [{ name: 'linkageSetActionProps', params: { value: 'disabled' } }],
    });
  }
  return rules.length ? rules : null;
}

function buildCondition(when: Record<string, unknown>): Record<string, unknown> {
  const items: Record<string, unknown>[] = [];
  for (const [field, value] of Object.entries(when)) {
    if (value === true) {
      items.push({ path: `{{ ctx.record.${field} }}`, operator: '$isTruly', value: true, noValue: true });
    } else if (value === false) {
      items.push({ path: `{{ ctx.record.${field} }}`, operator: '$isFalsy', value: false, noValue: true });
    } else {
      items.push({ path: `{{ ctx.record.${field} }}`, operator: '$eq', value });
    }
  }
  return { logic: '$and', items };
}
