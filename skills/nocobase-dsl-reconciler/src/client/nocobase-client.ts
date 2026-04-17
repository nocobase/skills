/**
 * NocoBase API client.
 *
 * ⚠️ PITFALLS — read before modifying:
 * - desktopRoutes:update must use POST (not PUT). PUT returns 200 but doesn't persist.
 * - flowModels:update clears parentId → NEVER call directly. Use updateModel() or configure().
 * - enableTabs lives on route (POST desktopRoutes:update), NOT on flowModel stepParams.
 * - See src/PITFALLS.md for complete list.
 */
import axios, { type AxiosInstance } from 'axios';
import { resolveToken, resolveCredentials } from './auth';
import { FlowSurfacesApi } from './flow-surfaces';
import { CollectionsApi } from './collections';
import { RoutesApi } from './routes';
import { LegacyModelsApi } from './legacy-models';

export interface NocoBaseClientOptions {
  baseUrl?: string;
  token?: string;
  timeout?: number;
}

/**
 * NocoBase API client — composes all API surfaces.
 *
 * Usage:
 *   const nb = await NocoBaseClient.create();
 *   const result = await nb.surfaces.compose(tabUid, blocks);
 */
export class NocoBaseClient {
  readonly baseUrl: string;
  readonly http: AxiosInstance;
  readonly surfaces: FlowSurfacesApi;
  readonly collections: CollectionsApi;
  readonly routes: RoutesApi;
  readonly models: LegacyModelsApi;

  private constructor(baseUrl: string, http: AxiosInstance) {
    this.baseUrl = baseUrl;
    this.http = http;
    this.surfaces = new FlowSurfacesApi(http, baseUrl);
    this.collections = new CollectionsApi(http, baseUrl);
    this.routes = new RoutesApi(http, baseUrl);
    this.models = new LegacyModelsApi(http, baseUrl);
  }

  /**
   * Create and authenticate a client.
   * Auth priority: opts.token → env token → MCP config → signIn.
   */
  static async create(opts: NocoBaseClientOptions = {}): Promise<NocoBaseClient> {
    const timeout = opts.timeout ?? 30_000;

    // Resolve base URL
    const auth = resolveToken();
    const baseUrl = opts.baseUrl
      || process.env.NB_URL
      || auth.baseUrl
      || 'http://localhost:14000';

    const http = axios.create({
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    // Resolve token
    const token = opts.token || auth.token;
    if (token) {
      http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      // signIn
      const { account, password } = resolveCredentials();
      const resp = await http.post(`${baseUrl}/api/auth:signIn`, { account, password });
      const signInToken = resp.data?.data?.token;
      if (!signInToken) throw new Error('signIn failed: no token returned');
      http.defaults.headers.common['Authorization'] = `Bearer ${signInToken}`;
    }

    const client = new NocoBaseClient(baseUrl, http);
    return client;
  }

  /**
   * Convenience: update model stepParams safely.
   * Uses flowSurfaces:configure with fallback to flowModels:save.
   */
  async updateModel(uid: string, stepParamsPatch: Record<string, unknown>) {
    return this.models.update(
      uid,
      stepParamsPatch,
      (u, changes) => this.surfaces.configure(u, changes),
    );
  }

  /**
   * Get flow model tree by UID or other params.
   */
  async get(params: Record<string, string>) {
    return this.surfaces.get(params);
  }

  /**
   * Create a menu group. Returns { routeId }.
   */
  async createGroup(title: string, icon = 'appstoreoutlined', parentId?: number) {
    return this.surfaces.createMenu({ title, type: 'group', icon, parentMenuRouteId: parentId });
  }

  /**
   * Create a menu item + page (two-step). Returns { routeId, pageUid, tabSchemaUid, gridUid }.
   */
  async createPage(title: string, parentRouteId?: number, icon = 'fileoutlined') {
    const menu = await this.surfaces.createMenu({ title, type: 'item', icon, parentMenuRouteId: parentRouteId });
    return this.surfaces.createPage(menu.routeId);
  }
}
