/**
 * Compile DSL builder nodes to existing spec types (PageSpec, BlockSpec, etc.).
 *
 * This is the bridge between the fluent TS builder API and the deployer pipeline.
 */

import type {
  PageSpec,
  BlockSpec,
  PopupSpec,
  TabSpec,
  FieldSpec,
  FieldRef,
  ActionSpec,
  JsColumnSpec,
  JsItemSpec,
  EventFlowSpec,
  LayoutRow as SpecLayoutRow,
} from '../types/spec';
import type { RouteEntry } from '../deploy/page-discovery';
import type {
  FieldInput,
  FieldDefNode,
  ActionInput,
  ActionDefNode,
  BlockDefNode,
  PopupDefNode,
  TabDefNode,
  PageDefNode,
  RouteDefNode,
  AppDefNode,
} from './types';

// ─── Field compilation ───

function compileField(f: FieldInput): FieldSpec {
  if (typeof f === 'string') {
    return f;
  }
  // FieldDefNode
  const node = f as FieldDefNode;
  const hasOpts =
    node.opts.width !== undefined ||
    node.opts.ellipsis !== undefined ||
    node.opts.clickToOpen !== undefined ||
    node.opts.label !== undefined ||
    node.opts.filterPaths !== undefined ||
    node.opts.popupSettings !== undefined ||
    node.opts.popup !== undefined;

  if (!hasOpts) {
    // Bare field name — just return the string
    return node.name;
  }

  const ref: FieldRef = {
    field: node.name,
  };

  if (node.opts.width !== undefined) ref.width = node.opts.width;
  if (node.opts.ellipsis !== undefined) ref.ellipsis = node.opts.ellipsis;
  if (node.opts.clickToOpen !== undefined) ref.clickToOpen = node.opts.clickToOpen;
  if (node.opts.label !== undefined) ref.label = node.opts.label;
  if (node.opts.filterPaths !== undefined) ref.filterPaths = node.opts.filterPaths;
  if (node.opts.popupSettings !== undefined) ref.popupSettings = node.opts.popupSettings;

  // popup shorthand → popupSettings
  if (node.opts.popup !== undefined && ref.popupSettings === undefined) {
    if (node.opts.popup === true) {
      ref.clickToOpen = true;
    } else if (typeof node.opts.popup === 'string') {
      ref.clickToOpen = true;
      ref.popupSettings = { popupTemplateUid: node.opts.popup };
    } else {
      // PopupOpts — this is for inline popup definition, handled at page level
      ref.clickToOpen = true;
    }
  }

  return ref;
}

// ─── Action compilation ───

function compileAction(a: ActionInput): string | ActionSpec {
  if (typeof a === 'string') {
    return a;
  }

  const node = a as ActionDefNode;
  const spec: ActionSpec = {
    type: node.type,
    ...node.config,
  };
  return spec;
}

// ─── Block compilation ───

function compileBlock(b: BlockDefNode): BlockSpec {
  const spec: BlockSpec = {
    key: b.key,
    type: b.type,
  };

  if (b.coll !== undefined) spec.coll = b.coll;
  if (b.title !== undefined) spec.title = b.title;
  if (b.desc !== undefined) spec.desc = b.desc;
  if (b.file !== undefined) spec.file = b.file;
  if (b.chartConfig !== undefined) spec.chart_config = b.chartConfig;
  if (b.templateRef !== undefined) spec.templateRef = b.templateRef;

  // Fields
  if (b.fields?.length) {
    spec.fields = b.fields.map(compileField);
  }

  // Actions
  if (b.actions?.length) {
    spec.actions = b.actions.map(compileAction);
  }
  if (b.recordActions?.length) {
    spec.recordActions = b.recordActions.map(compileAction);
  }

  // JS columns / items
  if (b.jsColumns?.length) {
    spec.js_columns = b.jsColumns.map(
      (jc): JsColumnSpec => ({
        key: jc.key,
        field: jc.field ?? '',
        file: jc.file,
        title: jc.title,
        desc: jc.desc,
      }),
    );
  }
  if (b.jsItems?.length) {
    spec.js_items = b.jsItems.map(
      (ji): JsItemSpec => ({
        key: ji.key,
        file: ji.file,
        desc: ji.desc,
      }),
    );
  }

  // Layout & order
  if (b.fieldLayout?.length) spec.field_layout = b.fieldLayout as BlockSpec['field_layout'];
  if (b.columnOrder?.length) {
    // column_order is used in YAML but not declared in BlockSpec — set via index access
    (spec as unknown as Record<string, unknown>).column_order = b.columnOrder;
  }

  // Event flows
  if (b.eventFlows?.length) {
    spec.event_flows = b.eventFlows.map(
      (ef): EventFlowSpec => ({
        flow_key: ef.flow_key,
        event: ef.event,
        file: ef.file,
        step_key: ef.step_key,
        desc: ef.desc,
      }),
    );
  }

  // Resource
  if (b.resource !== undefined) spec.resource = b.resource;
  if (b.resourceBinding !== undefined) spec.resource_binding = b.resourceBinding;

  // Data scope
  if (b.dataScope !== undefined) spec.dataScope = b.dataScope as Record<string, unknown>;

  // Table settings
  if (b.pageSize !== undefined) spec.pageSize = b.pageSize;
  if (b.sort !== undefined) spec.sort = b.sort;
  if (b.tableSettings !== undefined) spec.tableSettings = b.tableSettings;

  // Nested popups
  if (b.popups?.length) {
    spec.popups = b.popups.map(compilePopup);
  }

  // Nested tabs
  if (b.tabs?.length) {
    spec.tabs = b.tabs.map(compileTab);
  }

  return spec;
}

// ─── Popup compilation ───

function compilePopup(p: PopupDefNode): PopupSpec {
  const spec: PopupSpec = {
    target: p.target,
  };

  if (p.mode !== undefined) spec.mode = p.mode;
  if (p.coll !== undefined) spec.coll = p.coll;

  if (p.blocks?.length) {
    spec.blocks = p.blocks.map(compileBlock);
  }

  if (p.layout?.length) {
    spec.layout = p.layout as SpecLayoutRow[];
  }

  if (p.tabs?.length) {
    spec.tabs = p.tabs.map(compileTab);
  }

  return spec;
}

// ─── Tab compilation ───

function compileTab(t: TabDefNode): TabSpec {
  const spec: TabSpec = {};

  if (t.title !== undefined) spec.title = t.title;
  if (t.coll !== undefined) spec.coll = t.coll;

  if (t.blocks?.length) {
    spec.blocks = t.blocks.map(compileBlock);
  }

  if (t.layout?.length) {
    spec.layout = t.layout as SpecLayoutRow[];
  }

  if (t.popups?.length) {
    spec.popups = t.popups.map(compilePopup);
  }

  return spec;
}

// ─── Page compilation ───

/**
 * Compile a PageDefNode to a PageSpec.
 *
 * @example
 *   const spec = compilePage(myPage);
 *   // spec is a valid PageSpec ready for the deployer
 */
export function compilePage(p: PageDefNode): PageSpec {
  const spec: PageSpec = {
    page: p.title,
    blocks: p.blocks.map(compileBlock),
  };

  if (p.icon !== undefined) spec.icon = p.icon;
  if (p.coll !== undefined) spec.coll = p.coll;

  if (p.layout?.length) {
    spec.layout = p.layout as SpecLayoutRow[];
  }

  if (p.tabs?.length) {
    spec.tabs = p.tabs.map(compileTab);
  }

  if (p.pageEventFlows?.length) {
    spec.page_event_flows = p.pageEventFlows.map(
      (ef): EventFlowSpec => ({
        flow_key: ef.flow_key,
        event: ef.event,
        file: ef.file,
        step_key: ef.step_key,
        desc: ef.desc,
      }),
    );
  }

  return spec;
}

// ─── Route compilation ───

function compileRoute(r: RouteDefNode): RouteEntry {
  const entry: RouteEntry = {
    title: r.title,
  };

  if (r.type === 'group') {
    entry.type = 'group';
  }

  if (r.icon !== undefined) entry.icon = r.icon;
  if (r.hidden !== undefined) entry.hidden = r.hidden;

  if (r.children?.length) {
    entry.children = r.children.map(compileRoute);
  }

  return entry;
}

/**
 * Compile a RouteDefNode tree to RouteEntry array.
 */
export function compileRoutes(routes: RouteDefNode[]): RouteEntry[] {
  return routes.map(compileRoute);
}

// ─── App compilation ───

export interface CompiledApp {
  routes: RouteEntry[];
  pages: Map<string, PageSpec>;
  popups: PopupSpec[];
}

/**
 * Compile an AppDefNode to routes + pages.
 *
 * Walks the route tree, collects all flowPage definitions, and produces:
 * - A RouteEntry[] for routes.yaml
 * - A Map<slug, PageSpec> for each page
 * - A PopupSpec[] collecting all page-level popups
 */
export function compileApp(appDef: AppDefNode): CompiledApp {
  const pages = new Map<string, PageSpec>();
  const popups: PopupSpec[] = [];

  function collectPages(routes: RouteDefNode[]): void {
    for (const r of routes) {
      if (r.type === 'flowPage' && r.page) {
        const pageSpec = compilePage(r.page);
        const slug = slugify(r.title);
        pages.set(slug, pageSpec);

        // Collect page-level popups
        if (r.page.popups?.length) {
          for (const p of r.page.popups) {
            popups.push(compilePopup(p));
          }
        }
      }
      if (r.children?.length) {
        collectPages(r.children);
      }
    }
  }

  collectPages(appDef.routes);

  return {
    routes: compileRoutes(appDef.routes),
    pages,
    popups,
  };
}

// ─── Utility ───

/** Simple slugify matching the project's existing convention. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
