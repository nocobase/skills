import type { ModuleState } from '../types/state';

/**
 * Resolve $-prefixed semantic paths against state.yaml.
 *
 *   $products.table.fields.name        → { wrapper: 'xxx', field: 'yyy' }
 *   $products.table.actions.addNew.uid → 'xxx'
 */
export class RefResolver {
  private index = new Map<string, unknown>();

  constructor(state: ModuleState) {
    this.buildIndex(state);
  }

  private buildIndex(state: ModuleState) {
    const pages = state.pages || {};
    for (const [pageKey, pageVal] of Object.entries(pages)) {
      this.walk(pageVal, pageKey);
    }
  }

  private walk(obj: unknown, prefix: string) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      this.index.set(prefix, obj);
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        this.walk(v, `${prefix}.${k}`);
      }
    } else if (typeof obj === 'string' || typeof obj === 'number') {
      this.index.set(prefix, obj);
    }
  }

  /**
   * Resolve a $path to its value.
   * Auto-inserts 'blocks.' if needed, supports fuzzy matching (table → table_0).
   */
  resolve(ref: string): unknown {
    const path = ref.replace(/^\$/, '').trim()
      // Normalize camelCase to snake_case for state keys
      .replace(/recordActions/g, 'record_actions');

    // Direct match
    if (this.index.has(path)) return this.index.get(path);

    // Auto-insert "blocks." after page name
    const dotIdx = path.indexOf('.');
    if (dotIdx > 0) {
      const pageName = path.slice(0, dotIdx);
      const rest = path.slice(dotIdx + 1);

      if (!rest.startsWith('blocks.')) {
        // Search in page-level blocks
        const withBlocks = `${pageName}.blocks.${rest}`;
        if (this.index.has(withBlocks)) return this.index.get(withBlocks);

        // Search in tab_states blocks (multi-tab pages)
        for (const key of this.index.keys()) {
          if (key.startsWith(`${pageName}.tab_states.`) && key.includes('.blocks.')) {
            // e.g., opportunities.tab_states.table.blocks.table.actions.addNew.uid
            // Check if the tail matches: blocks.{rest}
            const blocksIdx = key.indexOf('.blocks.');
            const tail = key.slice(blocksIdx + 8); // after ".blocks."
            if (tail === rest || tail.startsWith(rest + '.')) {
              const tabPath = `${key.slice(0, blocksIdx + 8)}${rest}`;
              if (this.index.has(tabPath)) return this.index.get(tabPath);
            }
          }
        }

        // Search in popup blocks: $page.details.actions.edit
        // → pages.page.popups.*.blocks.details.actions.edit
        for (const key of this.index.keys()) {
          if (key.startsWith(`${pageName}.popups.`) && key.includes('.blocks.')) {
            const blocksIdx = key.indexOf('.blocks.');
            const tail = key.slice(blocksIdx + 8);
            if (tail === rest || tail.startsWith(rest + '.')) {
              const popupPath = `${key.slice(0, blocksIdx + 8)}${rest}`;
              if (this.index.has(popupPath)) return this.index.get(popupPath);
            }
          }
        }

        // Fuzzy: "table" matches "table_0", "table_1", etc.
        const restDot = rest.indexOf('.');
        if (restDot > 0) {
          const blockPrefix = rest.slice(0, restDot);
          const blockRest = rest.slice(restDot + 1);
          for (const key of this.index.keys()) {
            if (key.startsWith(`${pageName}.blocks.${blockPrefix}_`) ||
                key.startsWith(`${pageName}.blocks.${blockPrefix}.`)) {
              const actualBlock = key.split('.')[2];
              const fuzzyPath = `${pageName}.blocks.${actualBlock}.${blockRest}`;
              if (this.index.has(fuzzyPath)) return this.index.get(fuzzyPath);
            }
          }
        }
      }
    }

    throw new Error(`Ref not found: ${ref}\n  Available: ${this.suggest(path)}`);
  }

  /**
   * Resolve to a single UID string.
   * If path points to a dict, extracts uid/popup_grid/field/wrapper in priority order.
   */
  resolveUid(ref: string): string {
    const val = this.resolve(ref);

    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);

    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      for (const key of ['popup_grid', 'uid', 'field', 'wrapper', 'popup_page', 'popup_tab']) {
        if (obj[key]) return String(obj[key]);
      }
      throw new Error(`Ref '${ref}' resolved to dict but no UID key found: ${Object.keys(obj).join(', ')}`);
    }

    return String(val);
  }

  /**
   * Recursively resolve all $-prefixed strings in a nested object/array.
   */
  resolveAll(obj: unknown): unknown {
    if (typeof obj === 'string' && obj.startsWith('$')) {
      return this.resolveUid(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveAll(item));
    }
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = this.resolveAll(v);
      }
      return result;
    }
    return obj;
  }

  /**
   * List all available paths (for AI discovery).
   */
  listPaths(page?: string): string[] {
    const paths: string[] = [];
    for (const [p, v] of this.index) {
      if (page && !p.startsWith(page)) continue;
      if (typeof v === 'string' || typeof v === 'number') {
        paths.push(`$${p}`);
      }
    }
    return paths.sort();
  }

  private suggest(partial: string): string {
    const matches = [...this.index.keys()].filter(p => p.includes(partial)).slice(0, 5);
    return matches.length ? matches.join(', ') : '(no matches)';
  }
}
