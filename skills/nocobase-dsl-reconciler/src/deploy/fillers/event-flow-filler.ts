/**
 * Deploy event flows (form change listeners, etc.) from spec to flowRegistry.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BlockSpec } from '../../types/spec';
import type { DeployContext } from './types';

export async function deployEventFlows(
  ctx: DeployContext,
  blockUid: string,
  bs: BlockSpec,
  modDir: string,
): Promise<void> {
  const { nb, log } = ctx;
  const eventFlows = bs.event_flows || [];
  if (!eventFlows.length) return;

  const flowRegistry: Record<string, unknown> = {};
  for (const ef of eventFlows) {
    if (!ef.file) continue;
    const efPath = path.join(modDir, ef.file);
    if (!fs.existsSync(efPath)) continue;
    const code = fs.readFileSync(efPath, 'utf8');
    const flowKey = ef.flow_key || `custom_${Object.keys(flowRegistry).length}`;
    const stepKey = ef.step_key || 'runJs';
    flowRegistry[flowKey] = {
      key: flowKey,
      on: ef.event || 'formValuesChange',
      title: ef.desc || flowKey,
      steps: {
        [stepKey]: {
          key: stepKey, use: 'runjs', sort: 1, flowKey,
          runJs: { code },
        },
      },
    };
  }

  if (!Object.keys(flowRegistry).length) return;

  try {
    await nb.models.save({ uid: blockUid, flowRegistry });
  } catch (e) {
    // DO NOT fallback to flowModels:update — it clears parentId (PITFALL!)
    log(`      ! event flows: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}
