import type { AxiosInstance } from 'axios';
import type { ComposeResult, FlowModelTree } from '../types/api';

/**
 * flowSurfaces API — the primary UI manipulation surface.
 */
export class FlowSurfacesApi {
  constructor(
    private http: AxiosInstance,
    private baseUrl: string,
  ) {}

  private async call<T = Record<string, unknown>>(
    action: string,
    body?: Record<string, unknown>,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<T> {
    const url = `${this.baseUrl}/api/flowSurfaces:${action}`;
    const resp = method === 'GET'
      ? await this.http.get(url, { params: body })
      : await this.http.post(url, body);

    const data = resp.data;
    if (data.errors?.length) {
      throw new Error(`flowSurfaces:${action} → ${data.errors[0].message || '?'}`);
    }
    return (data.data ?? data) as T;
  }

  // ── Read ──

  async get(params: Record<string, string>): Promise<FlowModelTree> {
    return this.call<FlowModelTree>('get', params, 'GET');
  }

  async catalog(targetUid?: string) {
    const body = targetUid ? { target: { uid: targetUid } } : {};
    return this.call('catalog', body);
  }

  async context(targetUid: string, contextPath?: string) {
    const body: Record<string, unknown> = { target: { uid: targetUid } };
    if (contextPath) body.path = contextPath;
    return this.call('context', body);
  }

  // ── Menu / Page lifecycle ──

  async createMenu(opts: { title: string; type: 'group' | 'item'; icon?: string; parentMenuRouteId?: number }) {
    return this.call<{ routeId: number }>('createMenu', opts);
  }

  async createPage(menuRouteId: number) {
    return this.call<{ routeId: number; pageUid: string; tabSchemaUid: string; gridUid: string }>('createPage', { menuRouteId });
  }

  async destroyPage(uid: string) {
    return this.call('destroyPage', { uid });
  }

  // ── Compose ──

  async compose(tabUid: string, blocks: Record<string, unknown>[], mode: 'replace' | 'append' = 'replace'): Promise<ComposeResult> {
    return this.call<ComposeResult>('compose', {
      target: { uid: tabUid },
      mode,
      blocks,
    });
  }

  // ── Incremental operations ──

  async addBlock(gridUid: string, blockType: string, resource?: Record<string, unknown>) {
    const body: Record<string, unknown> = { target: { uid: gridUid }, type: blockType };
    if (resource) body.resource = resource;
    return this.call('addBlock', body);
  }

  async addField(targetUid: string, fieldPath: string) {
    return this.call<{ wrapperUid: string; fieldUid: string; uid: string }>('addField', {
      target: { uid: targetUid },
      fieldPath,
    });
  }

  async addAction(targetUid: string, actionType: string) {
    return this.call('addAction', { target: { uid: targetUid }, type: actionType });
  }

  async addRecordAction(targetUid: string, actionType: string) {
    return this.call('addRecordAction', { target: { uid: targetUid }, type: actionType });
  }

  async configure(targetUid: string, changes: Record<string, unknown>) {
    return this.call('configure', { target: { uid: targetUid }, ...changes });
  }

  async updateSettings(targetUid: string, settings: Record<string, unknown>) {
    return this.call('updateSettings', { target: { uid: targetUid }, ...settings });
  }

  async setLayout(gridUid: string, rows: Record<string, string[][]>, sizes: Record<string, number[]>) {
    return this.call('setLayout', { target: { uid: gridUid }, rows, sizes });
  }

  async setEventFlows(targetUid: string, eventFlows: Record<string, unknown>) {
    return this.call('setEventFlows', { target: { uid: targetUid }, ...eventFlows });
  }

  // ── Popup / Tab ──

  async addPopupTab(popupUid: string, title?: string) {
    const body: Record<string, unknown> = { target: { uid: popupUid } };
    if (title) body.title = title;
    return this.call('addPopupTab', body);
  }

  async addTab(pageUid: string, title?: string) {
    const body: Record<string, unknown> = { target: { uid: pageUid } };
    if (title) body.title = title;
    return this.call('addTab', body);
  }

  // ── Blueprint (whole-page deploy in one call) ──

  async applyBlueprint(document: Record<string, unknown>) {
    return this.call('applyBlueprint', document);
  }

  async describeSurface(locator: Record<string, unknown>, bindKeys?: Record<string, unknown>[]) {
    const body: Record<string, unknown> = { locator };
    if (bindKeys) body.bindKeys = bindKeys;
    return this.call('describeSurface', body);
  }

  // ── Templates ──

  async listTemplates(filter?: Record<string, unknown>) {
    return this.call('listTemplates', filter || {});
  }

  async getTemplate(uid: string) {
    return this.call('getTemplate', { uid });
  }

  async saveTemplate(template: Record<string, unknown>) {
    return this.call('saveTemplate', template);
  }

  // ── Linkage / reaction rules ──

  async setFieldValueRules(targetUid: string, rules: Record<string, unknown>[]) {
    return this.call('setFieldValueRules', { target: { uid: targetUid }, rules });
  }

  async setFieldLinkageRules(targetUid: string, rules: Record<string, unknown>[]) {
    return this.call('setFieldLinkageRules', { target: { uid: targetUid }, rules });
  }

  async setBlockLinkageRules(targetUid: string, rules: Record<string, unknown>[]) {
    return this.call('setBlockLinkageRules', { target: { uid: targetUid }, rules });
  }

  async setActionLinkageRules(targetUid: string, rules: Record<string, unknown>[]) {
    return this.call('setActionLinkageRules', { target: { uid: targetUid }, rules });
  }

  async getReactionMeta(targetUid: string) {
    return this.call('getReactionMeta', { target: { uid: targetUid } });
  }

  // ── Node operations ──

  async removeNode(uid: string) {
    return this.call('removeNode', { target: { uid } });
  }

  async moveNode(sourceUid: string, targetUid: string, position: 'before' | 'after' = 'after') {
    return this.call('moveNode', { sourceUid, targetUid, position });
  }
}
