import type { AxiosInstance } from 'axios';
import { deepMerge } from '../utils/deep-merge';
import { generateUid } from '../utils/uid';

/**
 * Legacy flowModels API — save/update/get.
 * NEVER use flowModels:update directly (clears parentId).
 */
export class LegacyModelsApi {
  private parentCache?: Map<string, string>;

  constructor(
    private http: AxiosInstance,
    private baseUrl: string,
  ) {}

  /**
   * flowModels:findOne — fetch a flowModel as a tree with FULL stepParams.
   *
   * Use this in exporters instead of `nb.surfaces.get` (flowSurfaces:get):
   * the surfaces variant returns a "rendered surface" tree that strips fields
   * like `stepParams.referenceSettings.useTemplate`, which makes exporters
   * lose the template binding on ReferenceBlockModel children.
   *
   * Returns the full node tree (subModels nested), or null if not found.
   */
  async findOne(uid: string, includeAsyncNode = true): Promise<Record<string, unknown> | null> {
    const params: Record<string, string> = { uid };
    if (includeAsyncNode) params.includeAsyncNode = 'true';
    const resp = await this.http.get(`${this.baseUrl}/api/flowModels:findOne`, { params });
    return (resp.data?.data as Record<string, unknown>) || null;
  }

  /**
   * flowModels:save — upsert a single FlowModel node.
   */
  async save(node: Record<string, unknown>) {
    const resp = await this.http.post(`${this.baseUrl}/api/flowModels:save`, node);
    if (!resp.data || resp.status >= 400) {
      throw new Error(`flowModels:save → ${resp.status}: ${JSON.stringify(resp.data).slice(0, 200)}`);
    }
    return resp.data.data;
  }

  /**
   * Safe partial stepParams update.
   * Tries flowSurfaces:configure first, falls back to GET → merge → save.
   */
  async update(uid: string, stepParamsPatch: Record<string, unknown>, configureFn?: (uid: string, changes: Record<string, unknown>) => Promise<unknown>) {
    // Try configure first (safest)
    if (configureFn) {
      try {
        return await configureFn(uid, { changes: stepParamsPatch });
      } catch {
        // fall through to manual update
      }
    }

    // Fallback: GET → deep merge → save.
    // Return null (not throw) when the node doesn't exist — callers read
    // UIDs from state.yaml, which can go stale after a NB rollback / manual
    // cleanup. An updateModel on a zombie UID used to crash the whole push
    // via unhandled rejection; now it's a no-op that callers can check.
    // Explicit errors (HTTP 4xx/5xx) still throw via axios.
    const getResp = await this.http.get(`${this.baseUrl}/api/flowModels:get`, {
      params: { filterByTk: uid },
    });
    if (!getResp.data?.data) {
      return null;
    }
    const current = getResp.data.data;

    const sp = deepMerge(
      (current.stepParams || {}) as Record<string, unknown>,
      stepParamsPatch,
    );

    let parentId = current.parentId;
    if (!parentId) {
      parentId = await this.findParent(uid);
    }

    const saveData: Record<string, unknown> = {
      uid,
      use: current.use || '',
      subKey: current.subKey,
      subType: current.subType,
      sortIndex: current.sortIndex ?? 0,
      stepParams: sp,
      flowRegistry: current.flowRegistry || {},
    };
    if (parentId) saveData.parentId = parentId;

    return this.save(saveData);
  }

  /**
   * Find parentId by scanning all models. Cached per session.
   */
  async findParent(uid: string): Promise<string | undefined> {
    if (!this.parentCache) {
      const resp = await this.http.get(`${this.baseUrl}/api/flowModels:list`, {
        params: { paginate: 'false' },
      });
      const models: Record<string, unknown>[] = resp.data.data || [];
      this.parentCache = new Map();
      for (const m of models) {
        const subs = m.subModels as Record<string, unknown> | undefined;
        if (!subs || typeof subs !== 'object') continue;
        for (const v of Object.values(subs)) {
          if (Array.isArray(v)) {
            for (const child of v) {
              if (child && typeof child === 'object' && (child as Record<string, unknown>).uid) {
                this.parentCache.set((child as Record<string, unknown>).uid as string, m.uid as string);
              }
            }
          } else if (v && typeof v === 'object' && (v as Record<string, unknown>).uid) {
            this.parentCache.set((v as Record<string, unknown>).uid as string, m.uid as string);
          }
        }
      }
    }
    return this.parentCache.get(uid);
  }

  /**
   * Insert a DividerItemModel into a form/detail grid.
   */
  async addDivider(gridUid: string, label: string, color = '#1677ff', borderColor = 'rgba(5, 5, 5, 0.06)'): Promise<string> {
    const uid = generateUid();
    await this.save({
      uid,
      use: 'DividerItemModel',
      parentId: gridUid,
      subKey: 'items',
      subType: 'array',
      sortIndex: 0,
      stepParams: {
        markdownItemSetting: {
          title: { label, orientation: 'left', color, borderColor },
        },
      },
      flowRegistry: {},
    });
    return uid;
  }

  clearCache() {
    this.parentCache = undefined;
  }
}
