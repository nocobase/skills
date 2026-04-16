import type { AxiosInstance } from 'axios';

export interface RouteInfo {
  id: number;
  title?: string;
  type: string;
  parentId?: number | null;
  schemaUid?: string;
  icon?: string;
  children?: RouteInfo[];
}

/**
 * Desktop routes (menu / page structure).
 */
export class RoutesApi {
  private cache?: RouteInfo[];

  constructor(
    private http: AxiosInstance,
    private baseUrl: string,
  ) {}

  async list(): Promise<RouteInfo[]> {
    if (this.cache) return this.cache;
    const resp = await this.http.get(`${this.baseUrl}/api/desktopRoutes:list`, {
      params: { paginate: 'false', tree: 'true' },
    });
    this.cache = resp.data.data || [];
    return this.cache!;
  }

  async destroy(id: number) {
    return this.http.delete(`${this.baseUrl}/api/desktopRoutes:destroy`, {
      params: { filterByTk: id },
    });
  }

  clearCache() {
    this.cache = undefined;
  }
}
