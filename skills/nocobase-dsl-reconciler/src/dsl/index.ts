/**
 * DSL builder API — fluent functions that produce typed intermediate nodes.
 *
 * Design principles:
 * - Minimal boilerplate — common cases are 1 line
 * - Full power — raw stepParams escape hatch
 * - Type-safe — IDE autocomplete for field names, action types, etc.
 * - Compiles to existing spec — output is PageSpec/BlockSpec/PopupSpec
 *
 * All builder functions return plain objects (tagged with __kind for compile).
 */

import type { ActionType } from '../types/spec';
import type {
  FieldInput,
  FieldDefNode,
  FieldOpts,
  ActionInput,
  ActionDefNode,
  LinkOpts,
  AiOpts,
  UpdateRecordOpts,
  BlockDefNode,
  BlockInput,
  PopupDefNode,
  PopupOpts,
  TabDefNode,
  PageDefNode,
  RouteDefNode,
  AppDefNode,
  DataScopeInput,
  DataScopeItem,
  JsColumnInput,
  JsItemInput,
  EventFlowInput,
  LayoutRow,
  ResourceInput,
  ResourceBindingInput,
} from './types';

// Re-export types for consumers
export type {
  FieldInput,
  FieldDefNode,
  FieldOpts,
  ActionInput,
  ActionDefNode,
  BlockDefNode,
  BlockInput,
  PopupDefNode,
  PopupOpts,
  TabDefNode,
  PageDefNode,
  RouteDefNode,
  AppDefNode,
  DataScopeInput,
  DataScopeItem,
  JsColumnInput,
  JsItemInput,
  EventFlowInput,
  LayoutRow,
  ResourceInput,
  ResourceBindingInput,
} from './types';

// ─── Field builders ───

/**
 * Create a field reference with options.
 *
 * @example
 *   field('name')                              // same as bare 'name'
 *   field('name', { clickToOpen: true })        // with popup on click
 *   field('name', { width: 200, ellipsis: false })
 *   field('status', { width: 100 })
 */
export function field(name: string, opts: FieldOpts = {}): FieldDefNode {
  return { __kind: 'field', name, opts };
}

// ─── Action builders ───

/**
 * Create a link action (navigate to URL).
 *
 * @example
 *   link('View All', '/admin/xyz', { icon: 'arrowrightoutlined' })
 */
export function link(title: string, url: string, opts: Omit<LinkOpts, 'url'> = {}): ActionDefNode {
  const stepParams = opts.stepParams ?? {};
  return {
    __kind: 'action',
    type: 'link',
    config: {
      key: opts.key ?? `link_${title.toLowerCase().replace(/\s+/g, '_')}`,
      stepParams: {
        buttonSettings: {
          general: {
            title,
            icon: opts.icon,
          },
        },
        linkButtonSettings: {
          editLink: {
            searchParams: [],
            url,
          },
        },
        ...stepParams,
      },
    },
  };
}

/**
 * Create an AI employee action.
 *
 * @example
 *   ai('viz')
 *   ai('viz', './ai/tasks.yaml')
 */
export function ai(employee: string, tasksFile?: string, key?: string): ActionDefNode {
  return {
    __kind: 'action',
    type: 'ai',
    config: {
      employee,
      tasks_file: tasksFile,
      key: key ?? `ai_${employee}`,
    },
  };
}

/**
 * Create an updateRecord action.
 *
 * @example
 *   updateRecord('done', {
 *     icon: 'borderoutlined',
 *     tooltip: 'Done',
 *     style: 'link',
 *     assign: { is_completed: true },
 *     hiddenWhen: filter({ '{{ ctx.record.is_completed }}': { $isTruly: true } }),
 *   })
 */
export function updateRecord(key: string, config: UpdateRecordOpts): ActionDefNode {
  const linkageRules = config.hiddenWhen
    ? {
        value: [
          {
            key: `lr_${key}`,
            title: 'Linkage rule',
            enable: true,
            condition: config.hiddenWhen,
            actions: [
              {
                key: `la_${key}`,
                name: 'linkageSetActionProps',
                params: { value: 'hidden' },
              },
            ],
          },
        ],
      }
    : undefined;

  const stepParams: Record<string, unknown> = {
    buttonSettings: {
      general: {
        type: config.style ?? 'link',
        icon: config.icon,
        title: '',
        tooltip: config.tooltip,
        ...(linkageRules ? { linkageRules } : {}),
      },
    },
    apply: {
      apply: {
        requestConfig: {
          params: {},
        },
      },
    },
    assignSettings: {
      assignFieldValues: {
        assignedValues: config.assign,
      },
    },
    ...(config.stepParams ?? {}),
  };

  return {
    __kind: 'action',
    type: 'updateRecord',
    config: {
      key: config.key ?? `updateRecord_${key}`,
      stepParams,
    },
  };
}

/**
 * Create a raw action with explicit type and config.
 *
 * @example
 *   action('workflowTrigger', { key: 'trigger_approval', stepParams: {...} })
 */
export function action(type: ActionType, config: Record<string, unknown> = {}): ActionDefNode {
  return { __kind: 'action', type, config };
}

// ─── Block builders ───

/** Common block config shared by most block types. */
interface CommonBlockConfig {
  title?: string;
  desc?: string;
  fields?: FieldInput[];
  actions?: ActionInput[];
  recordActions?: ActionInput[];
  jsColumns?: JsColumnInput[];
  jsItems?: JsItemInput[];
  fieldLayout?: (LayoutRow | string)[];
  columnOrder?: string[];
  eventFlows?: EventFlowInput[];
  resource?: ResourceInput;
  resourceBinding?: ResourceBindingInput;
  dataScope?: DataScopeInput | Record<string, unknown>;
  pageSize?: number;
  sort?: Record<string, unknown>;
  tableSettings?: Record<string, unknown>;
  popups?: PopupDefNode[];
  tabs?: TabDefNode[];
  stepParams?: Record<string, unknown>;
}

/**
 * Create a table block.
 *
 * @example
 *   table('leads', 'nb_crm_leads', {
 *     fields: [field('name', { clickToOpen: true }), 'status', 'owner'],
 *     actions: ['filter', 'refresh', 'addNew'],
 *     pageSize: 20,
 *   })
 */
export function table(key: string, coll: string, config: CommonBlockConfig = {}): BlockDefNode {
  return makeBlock('table', key, coll, config);
}

/**
 * Create a filter form block.
 *
 * @example
 *   filterForm('filter', 'nb_crm_leads', {
 *     fields: [field('name', { label: 'Search', filterPaths: ['name','email','phone'] })],
 *   })
 */
export function filterForm(key: string, coll: string, config: CommonBlockConfig = {}): BlockDefNode {
  return makeBlock('filterForm', key, coll, config);
}

/**
 * Create a create-form block.
 *
 * @example
 *   form('addLead', 'nb_crm_leads', {
 *     fields: ['name', 'email', 'phone', 'source'],
 *     actions: ['submit'],
 *   })
 */
export function form(key: string, coll: string, config: CommonBlockConfig = {}): BlockDefNode {
  return makeBlock('createForm', key, coll, config);
}

/**
 * Create an edit-form block.
 *
 * @example
 *   editForm('edit', 'nb_crm_leads', {
 *     fields: ['status', 'converted_customer'],
 *     actions: ['submit'],
 *   })
 */
export function editForm(key: string, coll: string, config: CommonBlockConfig = {}): BlockDefNode {
  return makeBlock('editForm', key, coll, config);
}

/**
 * Create a details block.
 *
 * @example
 *   details('info', 'nb_crm_leads', {
 *     fields: ['name', 'status', 'email', 'phone'],
 *   })
 */
export function details(key: string, coll: string, config: CommonBlockConfig = {}): BlockDefNode {
  return makeBlock('details', key, coll, config);
}

/**
 * Create a list block.
 */
export function list(key: string, coll: string, config: CommonBlockConfig = {}): BlockDefNode {
  return makeBlock('list', key, coll, config);
}

/**
 * Create a grid-card block.
 */
export function gridCard(key: string, coll: string, config: CommonBlockConfig = {}): BlockDefNode {
  return makeBlock('gridCard', key, coll, config);
}

/**
 * Create a JS block.
 *
 * @example
 *   jsBlock('./js/overview.js')
 *   jsBlock('./js/calendar.js', { key: 'calendar', desc: 'Activity Calendar' })
 */
export function jsBlock(file: string, opts: { key?: string; desc?: string } = {}): BlockDefNode {
  const key = opts.key ?? file.replace(/^.*\//, '').replace(/\.js$/, '');
  return {
    __kind: 'block',
    key,
    type: 'jsBlock',
    file,
    desc: opts.desc,
  };
}

/**
 * Create a chart block.
 *
 * @example
 *   chart('./charts/sales.json', { key: 'sales_chart', title: 'Sales Trends' })
 */
export function chart(configFile: string, opts: { key?: string; title?: string } = {}): BlockDefNode {
  const key = opts.key ?? configFile.replace(/^.*\//, '').replace(/\.\w+$/, '');
  return {
    __kind: 'block',
    key,
    type: 'chart',
    chartConfig: configFile,
    title: opts.title,
  };
}

/**
 * Create a markdown block.
 */
export function markdown(key: string, opts: { title?: string; stepParams?: Record<string, unknown> } = {}): BlockDefNode {
  return {
    __kind: 'block',
    key,
    type: 'markdown',
    title: opts.title,
    stepParams: opts.stepParams,
  };
}

/**
 * Create a reference block (template reference).
 *
 * @example
 *   reference('Form (Add new): nb_crm_leads', {
 *     templateUid: '3d77445kyzp',
 *     targetUid: 'bd7f0823f37',
 *   })
 */
export function reference(
  templateName: string,
  ref: { templateUid: string; targetUid: string; mode?: string },
): BlockDefNode {
  return {
    __kind: 'block',
    key: 'reference',
    type: 'reference',
    templateRef: {
      templateUid: ref.templateUid,
      templateName,
      targetUid: ref.targetUid,
      mode: ref.mode ?? 'reference',
    },
  };
}

/** Internal helper to construct a BlockDefNode. */
function makeBlock(type: BlockDefNode['type'], key: string, coll: string, config: CommonBlockConfig): BlockDefNode {
  return {
    __kind: 'block',
    key,
    type,
    coll,
    title: config.title,
    desc: config.desc,
    fields: config.fields,
    actions: config.actions,
    recordActions: config.recordActions,
    jsColumns: config.jsColumns,
    jsItems: config.jsItems,
    fieldLayout: config.fieldLayout,
    columnOrder: config.columnOrder,
    eventFlows: config.eventFlows,
    resource: config.resource,
    resourceBinding: config.resourceBinding,
    dataScope: config.dataScope,
    pageSize: config.pageSize,
    sort: config.sort,
    tableSettings: config.tableSettings,
    popups: config.popups,
    tabs: config.tabs,
    stepParams: config.stepParams,
  };
}

// ─── Popup builder ───

/**
 * Create a popup definition.
 *
 * @example
 *   popup('$SELF.table.actions.addNew', {
 *     mode: 'drawer',
 *     blocks: [form('addLead', 'nb_crm_leads', { ... })],
 *   })
 *
 *   popup('$SELF.details.actions.popup_convert', {
 *     mode: 'dialog',
 *     blocks: [editForm('convert', 'nb_crm_leads', { ... })],
 *   })
 */
export function popup(target: string, config: PopupOpts): PopupDefNode {
  return {
    __kind: 'popup',
    target,
    mode: config.mode,
    coll: config.coll,
    blocks: config.blocks,
    layout: config.layout,
    tabs: config.tabs,
  };
}

// ─── Tab builder ───

/**
 * Create a tab definition for multi-tab pages or popups.
 *
 * @example
 *   tab('Details', {
 *     blocks: [details('info', 'nb_crm_leads', { ... })],
 *   })
 */
export function tab(
  title: string,
  config: { coll?: string; blocks: BlockInput[]; layout?: LayoutRow[]; popups?: PopupDefNode[] },
): TabDefNode {
  return {
    __kind: 'tab',
    title,
    coll: config.coll,
    blocks: config.blocks,
    layout: config.layout,
    popups: config.popups,
  };
}

// ─── Page builder ───

export interface PageConfig {
  icon?: string;
  coll?: string;
  blocks: BlockInput[];
  layout?: LayoutRow[];
  tabs?: TabDefNode[];
  popups?: PopupDefNode[];
  pageEventFlows?: EventFlowInput[];
}

/**
 * Create a page definition.
 *
 * @example
 *   page('Overview', {
 *     icon: 'calendaroutlined',
 *     blocks: [jsBlock('./js/overview.js'), table('leads', ...)],
 *     layout: [['jsBlock'], [{ leads: 16 }, { tasks: 8 }]],
 *   })
 */
export function page(title: string, config: PageConfig): PageDefNode {
  return {
    __kind: 'page',
    title,
    icon: config.icon,
    coll: config.coll,
    blocks: config.blocks,
    layout: config.layout,
    tabs: config.tabs,
    popups: config.popups,
    pageEventFlows: config.pageEventFlows,
  };
}

// ─── Route / App builders ───

/**
 * Create a route group (menu folder).
 *
 * @example
 *   group('CRM', 'dashboardoutlined', [
 *     route('Overview', 'calendaroutlined', overviewPage),
 *     route('Leads', 'useraddoutlined', leadsPage),
 *   ])
 */
export function group(title: string, icon: string, children: RouteDefNode[]): RouteDefNode {
  return {
    __kind: 'route',
    title,
    type: 'group',
    icon,
    children,
  };
}

/**
 * Create a route entry for a page.
 *
 * @example
 *   route('Overview', 'calendaroutlined', overviewPage)
 */
export function route(title: string, icon: string, pageDef: PageDefNode): RouteDefNode {
  return {
    __kind: 'route',
    title,
    type: 'flowPage',
    icon,
    page: pageDef,
  };
}

/**
 * Create an app definition (top-level routes).
 *
 * @example
 *   app('CRM', {
 *     routes: [
 *       group('CRM', 'dashboardoutlined', [
 *         route('Overview', 'calendaroutlined', overviewPage),
 *       ]),
 *     ],
 *   })
 */
export function app(title: string, opts: { icon?: string; routes: RouteDefNode[] }): AppDefNode {
  return {
    __kind: 'app',
    title,
    icon: opts.icon,
    routes: opts.routes,
  };
}

// ─── Filter / DataScope shorthand ───

/**
 * Create a dataScope filter from a shorthand object.
 *
 * Supports two formats:
 *
 * 1. Simple equality: `{ field: value }` → `$eq` operator
 * 2. Operator object: `{ field: { $op: value } }` → specified operator
 *
 * @example
 *   filter({ status: { $in: ['new', 'working'] }, ai_score: { $gte: '75' } })
 *   // → { logic: '$and', items: [...] }
 *
 *   filter({ status: 'active' })
 *   // → { logic: '$and', items: [{ path: 'status', operator: '$eq', value: 'active' }] }
 */
export function filter(
  conditions: Record<string, unknown>,
  logic: '$and' | '$or' = '$and',
): DataScopeInput {
  const items: DataScopeItem[] = [];

  for (const [path, val] of Object.entries(conditions)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Operator object: { $in: [...] }
      const opObj = val as Record<string, unknown>;
      for (const [op, opVal] of Object.entries(opObj)) {
        const noValue = op === '$isTruly' || op === '$isFalsy' || op === '$empty' || op === '$notEmpty';
        items.push({ path, operator: op, value: opVal, noValue });
      }
    } else {
      // Simple equality
      items.push({ path, operator: '$eq', value: val, noValue: false });
    }
  }

  return { logic, items };
}

// ─── JS column/item shorthand ───

/**
 * Create a JS column definition.
 *
 * @example
 *   jsColumn('ai_score', './js/col_ai_score.js', { title: 'AI Score' })
 */
export function jsColumn(key: string, file: string, opts: { field?: string; title?: string; desc?: string } = {}): JsColumnInput {
  return {
    key,
    field: opts.field ?? '',
    file,
    title: opts.title,
    desc: opts.desc,
  };
}

/**
 * Create a JS item definition (for filter forms, details, etc).
 *
 * @example
 *   jsItem('stats_block', './js/stats.js', { desc: 'Stats Block' })
 */
export function jsItem(key: string, file: string, opts: { desc?: string } = {}): JsItemInput {
  return { key, file, desc: opts.desc };
}

// ─── Event flow shorthand ───

/**
 * Create an event flow definition.
 *
 * @example
 *   eventFlow('submit_flow', 'submit:success', './flows/on_submit.js')
 */
export function eventFlow(
  flowKey: string,
  event: string | Record<string, unknown>,
  file: string,
  opts: { stepKey?: string; desc?: string } = {},
): EventFlowInput {
  return {
    flow_key: flowKey,
    event,
    file,
    step_key: opts.stepKey,
    desc: opts.desc,
  };
}
