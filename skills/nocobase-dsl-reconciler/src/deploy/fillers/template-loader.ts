/**
 * @deprecated No longer used — popup templates are kept as references, not expanded.
 * Retained for potential future use.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DeployContext } from './types';
import { loadYaml } from '../../utils/yaml';

export async function loadTemplateContent(
  ctx: DeployContext,
  modDir: string,
  popupTemplateUid: string | undefined,
  collectionName: string,
): Promise<Record<string, unknown>[]> {
  const { nb } = ctx;
  if (!popupTemplateUid) return [];

  // Try local templates/_index.yaml first
  const mod = path.resolve(modDir);
  // Walk up to find templates/ (might be in project root, not page dir)
  for (let dir = mod; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const indexFile = path.join(dir, 'templates', '_index.yaml');
    if (fs.existsSync(indexFile)) {
      try {
        const index = loadYaml<Record<string, unknown>[]>(indexFile);
        const entry = index.find(t => t.uid === popupTemplateUid);
        if (entry?.file) {
          const tplFile = path.join(dir, 'templates', entry.file as string);
          if (fs.existsSync(tplFile)) {
            const tplSpec = loadYaml<Record<string, unknown>>(tplFile);
            const content = tplSpec.content as Record<string, unknown>;
            if (content?.blocks) return content.blocks as Record<string, unknown>[];
            if (content?.tabs) {
              // Multi-tab: return first tab's blocks
              const tabs = content.tabs as Record<string, unknown>[];
              return (tabs[0]?.blocks || []) as Record<string, unknown>[];
            }
          }
        }
      } catch { /* index parse error — fallback to API */ }
      break;
    }
  }

  // Fallback: read from live API
  try {
    const tplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, {
      params: { filter: { uid: popupTemplateUid }, pageSize: 1 },
    });
    const tplData = tplResp.data?.data?.[0];
    if (tplData?.targetUid) {
      const d = await nb.get({ uid: tplData.targetUid });
      const page = d.tree.subModels?.page;
      if (page && !Array.isArray(page)) {
        const tabs = (page as unknown as Record<string, unknown>).subModels as Record<string, unknown>;
        const tabList = tabs?.tabs;
        const tabArr = (Array.isArray(tabList) ? tabList : tabList ? [tabList] : []) as Record<string, unknown>[];
        if (tabArr.length) {
          const grid = (tabArr[0].subModels as Record<string, unknown>)?.grid as Record<string, unknown>;
          const items = (grid?.subModels as Record<string, unknown>)?.items;
          if (Array.isArray(items)) {
            // Convert live items to compose-compatible spec
            return items.map(item => {
              const use = (item as Record<string, unknown>).use as string || '';
              const sp = (item as Record<string, unknown>).stepParams as Record<string, unknown> || {};
              const resColl = ((sp.resourceSettings as Record<string, unknown>)?.init as Record<string, unknown>)?.collectionName as string;
              return {
                key: 'details',
                type: use.includes('Edit') ? 'editForm' : use.includes('Create') ? 'createForm' : 'details',
                coll: resColl || collectionName,
                resource_binding: { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' },
              };
            });
          }
        }
      }
    }
  } catch { /* API fallback failed — return empty */ }

  return [];
}
