import type { AxiosInstance } from 'axios';
import type { FieldDef } from '../types/spec';

/**
 * Collection / field CRUD — raw REST API, not flowSurfaces.
 */
export class CollectionsApi {
  private fieldMetaCache = new Map<string, Record<string, { interface: string }>>();

  constructor(
    private http: AxiosInstance,
    private baseUrl: string,
  ) {}

  /**
   * Upsert a collection via collections:apply (high-level modeling API).
   * Creates if new, updates if exists. Handles fields in one call.
   */
  async apply(definition: {
    name: string;
    title?: string;
    fields?: Record<string, unknown>[];
    [key: string]: unknown;
  }) {
    const resp = await this.http.post(`${this.baseUrl}/api/collections:apply`, definition);
    return resp.data.data;
  }

  /**
   * Upsert a single field via fields:apply.
   */
  async applyField(collectionName: string, field: Record<string, unknown>) {
    const resp = await this.http.post(`${this.baseUrl}/api/fields:apply`, {
      collectionName,
      ...field,
    });
    return resp.data.data;
  }

  async exists(name: string): Promise<boolean> {
    const resp = await this.http.get(`${this.baseUrl}/api/collections:list`, {
      params: { paginate: 'false' },
    });
    const colls: { name: string }[] = resp.data.data || [];
    return colls.some(c => c.name === name);
  }

  async create(name: string, title: string) {
    const resp = await this.http.post(`${this.baseUrl}/api/collections:create`, {
      name, title, logging: true,
      autoGenId: true, createdAt: true, updatedAt: true,
      createdBy: true, updatedBy: true, sortable: true,
    });
    return resp.data.data;
  }

  async destroy(name: string) {
    return this.http.delete(`${this.baseUrl}/api/collections:destroy`, {
      params: { filterByTk: name },
    });
  }

  async createField(coll: string, def: FieldDef) {
    const typeMap: Record<string, string> = {
      input: 'string', textarea: 'text', integer: 'bigInt',
      number: 'double', select: 'string', multipleSelect: 'array',
      checkbox: 'boolean', datetime: 'date', date: 'dateOnly',
      time: 'time', email: 'string', phone: 'string',
      url: 'string', percent: 'float', sequence: 'string',
      attachment: 'belongsToMany',
    };

    let body: Record<string, unknown>;

    if (def.interface === 'm2o') {
      if (!def.target) throw new Error(`m2o field "${def.name}" requires target collection`);
      body = {
        name: def.name, type: 'belongsTo', interface: 'm2o',
        target: def.target, foreignKey: def.foreignKey || `${def.name}_id`,
        targetKey: 'id', onDelete: 'SET NULL',
        uiSchema: {
          type: 'object', title: def.title,
          'x-component': 'AssociationField',
          'x-component-props': { multiple: false },
        },
      };
    } else if (def.interface === 'o2m') {
      if (!def.target) return null;
      body = {
        name: def.name, type: 'hasMany', interface: 'o2m',
        target: def.target, foreignKey: def.foreignKey || `${coll.split('.').pop()}_id`,
        uiSchema: {
          title: def.title, 'x-component': 'AssociationField',
          'x-component-props': { multiple: true },
        },
      };
    } else if (def.interface === 'm2m') {
      if (!def.target) return null;
      body = {
        name: def.name, type: 'belongsToMany', interface: 'm2m',
        target: def.target,
        ...(def.through ? { through: def.through } : {}),
        ...(def.foreignKey ? { foreignKey: def.foreignKey } : {}),
        uiSchema: {
          title: def.title, 'x-component': 'AssociationField',
          'x-component-props': { multiple: true },
        },
      };
    } else if (def.interface === 'o2o') {
      if (!def.target) return null;
      body = {
        name: def.name, type: 'hasOne', interface: 'o2o',
        target: def.target,
        ...(def.foreignKey ? { foreignKey: def.foreignKey } : {}),
        uiSchema: {
          title: def.title, 'x-component': 'AssociationField',
          'x-component-props': { multiple: false },
        },
      };
    } else {
      body = {
        name: def.name, type: typeMap[def.interface] || 'string',
        interface: def.interface,
        uiSchema: { title: def.title, 'x-component': 'Input' },
      };
    }

    // Merge uiSchema from DSL (enum, component overrides, etc.)
    if (def.uiSchema && typeof def.uiSchema === 'object') {
      body.uiSchema = { ...(body.uiSchema as Record<string, unknown>), ...def.uiSchema };
    }

    // Legacy: select options via def.options
    if (def.options) {
      const enumVal = def.options.map(o =>
        typeof o === 'string' ? { value: o, label: o } : o,
      );
      (body.uiSchema as Record<string, unknown>).enum = enumVal;
    }

    const resp = await this.http.post(
      `${this.baseUrl}/api/collections/${coll}/fields:create`,
      body,
    );
    return resp.data.data;
  }

  async fieldMeta(coll: string): Promise<Record<string, { interface: string }>> {
    const cached = this.fieldMetaCache.get(coll);
    if (cached) return cached;

    const resp = await this.http.get(
      `${this.baseUrl}/api/collections/${coll}/fields:list`,
      { params: { pageSize: '200' } },
    );
    const fields: { name: string; interface?: string }[] = resp.data.data || [];
    const meta: Record<string, { interface: string }> = {};
    for (const f of fields) {
      meta[f.name] = { interface: f.interface || 'input' };
    }
    this.fieldMetaCache.set(coll, meta);
    return meta;
  }

  clearCache() {
    this.fieldMetaCache.clear();
  }
}
