import { createCompatDayjs } from './compat-dayjs.js';
import { MAX_LOG_ENTRIES, READ_ONLY_HTTP_METHODS } from './constants.js';
import {
  DEFAULT_RESOURCE_DATA,
  DEFAULT_SINGLE_RECORD_DATA,
  parseRunJSRequestTarget,
} from './runjs-request-target.js';
import {
  cloneSerializable,
  getByPath,
  interpolate,
  isDomNodeLike,
  isPlainObject,
  isReactElementLike,
  mergeDeep,
  normalizeMethod,
  serializeError,
  setByPath,
  withDefault,
} from './utils.js';

export class CompatBlockedError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'CompatBlockedError';
    this.detail = detail;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripTags(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '');
}

function createIssue(ruleId, message, severity = 'error', detail = {}) {
  return {
    type: 'runtime',
    severity,
    ruleId,
    message,
    ...detail,
  };
}

function pushSideEffect(state, detail) {
  state.sideEffectAttempts.push(detail);
  return detail;
}

function pushRuntimeIssue(state, ruleId, message, severity = 'warning', detail = {}) {
  state.runtimeIssues.push(createIssue(ruleId, message, severity, detail));
}

function throwBlockedSideEffect(state, name, detail = {}) {
  const nextDetail = pushSideEffect(state, {
    name,
    status: 'blocked',
    ...detail,
  });
  throw new CompatBlockedError(`Blocked side effect "${name}".`, nextDetail);
}

function createLogRecorder(state) {
  const api = {
    log(level, args) {
      if (state.logs.length >= MAX_LOG_ENTRIES) {
        if (!state.logOverflow) {
          state.logOverflow = true;
          pushRuntimeIssue(
            state,
            'log-output-truncated',
            `Console output exceeded ${MAX_LOG_ENTRIES} entries; additional logs were omitted.`,
            'warning',
          );
        }
        return;
      }
      state.logs.push({
        level,
        message: args
          .map((item) => {
            if (typeof item === 'string') return item;
            try {
              return JSON.stringify(item);
            } catch {
              return String(item);
            }
          })
          .join(' '),
      });
    },
  };
  return api;
}

class SimpleEvent {
  constructor(type, options = {}) {
    this.type = String(type || '');
    this.bubbles = Boolean(options.bubbles);
    this.cancelable = Boolean(options.cancelable);
    this.composed = Boolean(options.composed);
    this.defaultPrevented = false;
    this.detail = undefined;
    this.target = null;
    this.currentTarget = null;
    this.timeStamp = Date.now();
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
}

class SimpleCustomEvent extends SimpleEvent {
  constructor(type, options = {}) {
    super(type, options);
    this.detail = options.detail;
  }
}

class SimpleNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.__nbCompatDomNode = true;
    this.ownerDocument = null;
    this.parentNode = null;
    this.__listeners = new Map();
  }

  addEventListener(type, listener) {
    if (typeof listener !== 'function') return;
    const current = this.__listeners.get(type) || new Set();
    current.add(listener);
    this.__listeners.set(type, current);
  }

  removeEventListener(type, listener) {
    this.__listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    if (!event || typeof event.type !== 'string') return true;
    event.target = event.target || this;
    event.currentTarget = this;
    const listeners = [...(this.__listeners.get(event.type) || [])];
    for (const listener of listeners) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }
}

class SimpleTextNode extends SimpleNode {
  constructor(text = '') {
    super(3, '#text');
    this.__text = String(text ?? '');
  }

  get textContent() {
    return this.__text;
  }

  set textContent(value) {
    this.__text = String(value ?? '');
  }

  get outerHTML() {
    return escapeHtml(this.__text);
  }
}

class SimpleHtmlChunk {
  constructor(html = '') {
    this.html = String(html ?? '');
  }

  get textContent() {
    return stripTags(this.html);
  }

  get outerHTML() {
    return this.html;
  }
}

class SimpleDocumentFragmentNode extends SimpleNode {
  constructor() {
    super(11, '#document-fragment');
    this.__children = [];
  }

  append(...nodes) {
    this.__children.push(...nodes.map((node) => node instanceof SimpleNode || node instanceof SimpleHtmlChunk ? node : new SimpleTextNode(node)));
  }

  replaceChildren(...nodes) {
    this.__children = [];
    this.append(...nodes);
  }

  get textContent() {
    return this.__children.map((node) => node.textContent || '').join('');
  }

  set textContent(value) {
    this.__children = [new SimpleTextNode(value)];
  }

  get outerHTML() {
    return this.__children.map((node) => node.outerHTML || '').join('');
  }
}

class SimpleElementNode extends SimpleNode {
  constructor(tagName = 'div') {
    super(1, String(tagName || 'div').toUpperCase());
    this.tagName = this.nodeName;
    this.attributes = {};
    this.__children = [];
  }

  setAttribute(name, value) {
    this.attributes[String(name)] = String(value ?? '');
  }

  getAttribute(name) {
    return this.attributes[String(name)];
  }

  append(...nodes) {
    this.__children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.__children = [...nodes];
  }

  get innerHTML() {
    return this.__children.map((node) => node.outerHTML || '').join('');
  }

  set innerHTML(value) {
    this.__children = [new SimpleHtmlChunk(value)];
  }

  get textContent() {
    return this.__children.map((node) => node.textContent || '').join('');
  }

  set textContent(value) {
    this.__children = [new SimpleTextNode(value)];
  }

  get outerHTML() {
    const attrs = Object.entries(this.attributes)
      .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
      .join('');
    return `<${this.tagName.toLowerCase()}${attrs}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;
  }
}

function coerceNode(value, documentRef) {
  if (value instanceof SimpleHtmlChunk || value instanceof SimpleNode) return value;
  if (typeof value === 'string') return new SimpleHtmlChunk(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return new SimpleTextNode(String(value ?? ''));
  if (Array.isArray(value)) {
    const fragment = new SimpleDocumentFragmentNode();
    fragment.ownerDocument = documentRef;
    fragment.append(...value.map((item) => coerceNode(item, documentRef)));
    return fragment;
  }
  return new SimpleTextNode(JSON.stringify(value, null, 2));
}

class CompatElementProxy {
  constructor(element, state) {
    this.__el = element;
    this.__state = state;
  }

  append(...nodes) {
    if (nodes.some((node) => isDomNodeLike(node))) {
      pushRuntimeIssue(this.__state, 'dom-render-unsupported', 'DOM node render output is unsupported in zero-dependency mode.');
      return;
    }
    this.__el.append(...nodes.map((node) => coerceNode(node, this.__el.ownerDocument)));
  }

  replaceChildren(...nodes) {
    if (nodes.some((node) => isDomNodeLike(node))) {
      pushRuntimeIssue(this.__state, 'dom-render-unsupported', 'DOM node render output is unsupported in zero-dependency mode.');
      return;
    }
    this.__el.replaceChildren(...nodes.map((node) => coerceNode(node, this.__el.ownerDocument)));
  }

  querySelector(selector) {
    pushRuntimeIssue(this.__state, 'selector-unsupported', `querySelector("${selector}") is unsupported in zero-dependency runtime.`);
    return null;
  }

  querySelectorAll(selector) {
    pushRuntimeIssue(this.__state, 'selector-unsupported', `querySelectorAll("${selector}") is unsupported in zero-dependency runtime.`);
    return [];
  }

  addEventListener(...args) {
    return this.__el.addEventListener(...args);
  }

  removeEventListener(...args) {
    return this.__el.removeEventListener(...args);
  }

  dispatchEvent(event) {
    return this.__el.dispatchEvent(event);
  }

  get innerHTML() {
    return this.__el.innerHTML;
  }

  set innerHTML(value) {
    this.__el.innerHTML = String(value ?? '');
  }

  get textContent() {
    return this.__el.textContent;
  }

  set textContent(value) {
    this.__el.textContent = String(value ?? '');
  }
}

function createSimpleDocument(locationRef) {
  const root = new SimpleElementNode('div');
  root.id = 'nb-runjs-root';
  const documentRef = {
    nodeType: 9,
    nodeName: '#document',
    location: locationRef,
    defaultView: null,
    parentWindow: null,
    body: {
      append() {},
    },
    getElementById(id) {
      return id === 'nb-runjs-root' ? root : null;
    },
    querySelector(selector) {
      return selector === '#nb-runjs-root' ? root : null;
    },
    querySelectorAll(selector) {
      return selector === '#nb-runjs-root' ? [root] : [];
    },
    createElement(tagName) {
      const element = new SimpleElementNode(tagName);
      element.ownerDocument = documentRef;
      return element;
    },
    createTextNode(text) {
      const node = new SimpleTextNode(text);
      node.ownerDocument = documentRef;
      return node;
    },
    createDocumentFragment() {
      const fragment = new SimpleDocumentFragmentNode();
      fragment.ownerDocument = documentRef;
      return fragment;
    },
  };
  root.ownerDocument = documentRef;
  return {
    documentRef,
    root,
  };
}

function normalizeNetworkConfig(network = {}, options = {}) {
  return {
    mode: network?.mode === 'live' ? 'live' : 'mock',
    skillMode: Boolean(options?.skillMode),
    allowHosts: [...new Set((network?.allowHosts || []).map((item) => String(item).trim()).filter(Boolean))],
    responses: (network?.responses || []).map((entry) => ({
      method: normalizeMethod(entry?.method || 'GET'),
      url: String(entry?.url || ''),
      status: Number.isFinite(Number(entry?.status)) ? Number(entry.status) : 200,
      headers: isPlainObject(entry?.headers) ? { ...entry.headers } : {},
      body: typeof entry?.text === 'string' ? undefined : entry?.body,
      text: typeof entry?.text === 'string' ? entry.text : undefined,
    })),
  };
}

function createMockFetchResponse(entry) {
  const headers = new Headers(entry.headers || {});
  let text = typeof entry.text === 'string' ? entry.text : '';
  if (typeof entry.text !== 'string' && typeof entry.body !== 'undefined') {
    text = JSON.stringify(entry.body);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }
  return new Response(text, {
    status: entry.status || 200,
    headers,
  });
}

function createAutoMockFetchResponse() {
  return new Response('{}', {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function createNetworkController(state, network, options = {}) {
  const config = normalizeNetworkConfig(network, options);
  const responseMap = new Map(config.responses.map((entry) => [`${entry.method} ${entry.url}`, entry]));

  const blockNetwork = (detail, ruleId, message, extra = {}) => {
    Object.assign(detail, {
      status: 'blocked',
      ruleId,
      ...extra,
    });
    throw new CompatBlockedError(message, detail);
  };

  const assertUrlAllowed = (kind, method, url, detail) => {
    if (!/^https?:\/\//i.test(String(url || ''))) {
      blockNetwork(detail, 'blocked-side-effect', `Only http/https ${kind} URLs are allowed: ${url || '<unknown url>'}.`);
    }

    if (config.mode === 'mock') {
      const responseEntry = responseMap.get(`${method} ${url}`);
      if (!responseEntry) {
        Object.assign(detail, {
          status: 'auto-mocked',
          ruleId: undefined,
          mockSource: 'default',
        });
        pushRuntimeIssue(
          state,
          'auto-mocked-network-request',
          `No explicit mock matched ${method} ${url || '<unknown url>'}; returned the default mock response instead.`,
          'warning',
        );
        return {
          mode: 'mock',
          response: createAutoMockFetchResponse(),
        };
      }
      Object.assign(detail, {
        status: 'mocked',
        ruleId: undefined,
      });
      return {
        mode: 'mock',
        response: createMockFetchResponse(responseEntry),
      };
    }

    if (config.skillMode) {
      blockNetwork(detail, 'blocked-skill-live-network', `Skill mode blocks live network for ${method} ${url}. Use mock responses instead.`);
    }

    const host = new URL(url).host;
    if (config.allowHosts.length === 0) {
      blockNetwork(detail, 'blocked-network-host', `Live network mode requires at least one allowHosts entry for ${method} ${url}.`);
    }
    if (!config.allowHosts.includes(host)) {
      blockNetwork(detail, 'blocked-network-host', `Blocked network host "${host}" for ${method} ${url}.`, { host });
    }
    Object.assign(detail, {
      status: 'allowed',
      ruleId: undefined,
      host,
    });

    return {
      mode: 'live',
      host,
    };
  };

  return {
    config,
    async fetch(kind, url, method, init = {}, detail) {
      const resolution = assertUrlAllowed(kind, method, url, detail);
      if (resolution.mode === 'mock') return resolution.response;
      return fetch(url, {
        ...init,
        method,
      });
    },
  };
}

function createCompatResourceReadResult(target, requestLike = {}) {
  const page = Number.isFinite(Number(requestLike?.params?.page)) ? Number(requestLike.params.page) : 1;
  const pageSize = Number.isFinite(Number(requestLike?.params?.pageSize)) ? Number(requestLike.params.pageSize) : 20;
  const payload = target.action === 'get'
    ? {
        data: {
          ...cloneSerializable(DEFAULT_SINGLE_RECORD_DATA),
          ...(typeof requestLike?.params?.filterByTk !== 'undefined'
            ? { id: requestLike.params.filterByTk }
            : {}),
        },
        meta: null,
      }
    : {
        data: cloneSerializable(DEFAULT_RESOURCE_DATA),
        meta: {
          page,
          pageSize,
          total: DEFAULT_RESOURCE_DATA.length,
        },
      };
  const text = JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    data: payload,
    text,
    json: async () => payload,
  };
}

function createRequestShim(state, networkController) {
  return async function compatRequest(input, options = {}) {
    const requestLike =
      typeof input === 'string'
        ? {
            url: input,
            ...(options || {}),
          }
        : {
            ...(input || {}),
          };
    const url = requestLike.url || requestLike.path || requestLike.href;
    const method = normalizeMethod(requestLike.method || 'GET');
    const detail = {
      name: 'request',
      method,
      url,
      status: 'pending',
    };
    state.sideEffectAttempts.push(detail);

    if (!READ_ONLY_HTTP_METHODS.has(method)) {
      detail.status = 'blocked';
      detail.ruleId = 'blocked-side-effect';
      throw new CompatBlockedError(`Blocked HTTP method "${method}" for ${url || '<unknown url>'}.`, detail);
    }

    const requestTarget = parseRunJSRequestTarget(url);
    if (requestTarget?.kind === 'resource-read') {
      Object.assign(detail, {
        status: 'simulated',
        ruleId: undefined,
        requestKind: 'nocobase-resource-read',
        resourceName: requestTarget.resourceName,
        action: requestTarget.action,
      });
      return createCompatResourceReadResult(requestTarget, requestLike);
    }

    const response = await networkController.fetch('request', url, method, {
      headers: requestLike.headers,
    }, detail);
    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // keep text
    }
    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
      text,
      json: async () => data,
    };
  };
}

function createFeedbackApi(state, name, methods) {
  return Object.fromEntries(
    methods.map((method) => [
      method,
      (...args) => {
        state.sideEffectAttempts.push({
          name: `${name}.${method}`,
          status: 'simulated',
          args: cloneSerializable(args),
        });
        return undefined;
      },
    ]),
  );
}

function createBlockedApi(state, name, methods) {
  return Object.fromEntries(
    methods.map((method) => [
      method,
      (...args) => {
        throwBlockedSideEffect(state, `${name}.${method}`, {
          args: cloneSerializable(args),
        });
      },
    ]),
  );
}

function createCompatLocation(state, currentUrl) {
  const block = (target, detail = {}) => {
    throwBlockedSideEffect(state, target, detail);
  };

  return {
    get hash() {
      return currentUrl.hash;
    },
    set hash(value) {
      block('window.location.hash', { value });
    },
    get host() {
      return currentUrl.host;
    },
    set host(value) {
      block('window.location.host', { value });
    },
    get hostname() {
      return currentUrl.hostname;
    },
    set hostname(value) {
      block('window.location.hostname', { value });
    },
    get href() {
      return currentUrl.href;
    },
    set href(url) {
      block('window.location.href', { url });
    },
    get origin() {
      return currentUrl.origin;
    },
    get pathname() {
      return currentUrl.pathname;
    },
    set pathname(value) {
      block('window.location.pathname', { value });
    },
    get port() {
      return currentUrl.port;
    },
    set port(value) {
      block('window.location.port', { value });
    },
    get protocol() {
      return currentUrl.protocol;
    },
    set protocol(value) {
      block('window.location.protocol', { value });
    },
    get search() {
      return currentUrl.search;
    },
    set search(value) {
      block('window.location.search', { value });
    },
    assign(url) {
      block('window.location.assign', { url });
    },
    replace(url) {
      block('window.location.replace', { url });
    },
    reload() {
      block('window.location.reload');
    },
    toString() {
      return currentUrl.toString();
    },
  };
}

function createCompatHistory(state) {
  let currentState = null;
  const block = (target, detail = {}) => {
    throwBlockedSideEffect(state, target, detail);
  };

  return {
    get length() {
      return 1;
    },
    get state() {
      return cloneSerializable(currentState);
    },
    back() {
      block('window.history.back');
    },
    forward() {
      block('window.history.forward');
    },
    go(delta) {
      block('window.history.go', { delta });
    },
    pushState(data, unused, url) {
      currentState = cloneSerializable(data);
      block('window.history.pushState', {
        data: currentState,
        unused,
        url,
      });
    },
    replaceState(data, unused, url) {
      currentState = cloneSerializable(data);
      block('window.history.replaceState', {
        data: currentState,
        unused,
        url,
      });
    },
  };
}

function createCompatDocument(state, documentRef, compatLocation, getWindow) {
  return {
    get location() {
      return compatLocation;
    },
    set location(value) {
      throwBlockedSideEffect(state, 'document.location', {
        value: cloneSerializable(value),
      });
    },
    get defaultView() {
      return getWindow();
    },
    get parentWindow() {
      return getWindow();
    },
    get body() {
      return documentRef.body;
    },
    getElementById: documentRef.getElementById.bind(documentRef),
    querySelector: documentRef.querySelector.bind(documentRef),
    querySelectorAll: documentRef.querySelectorAll.bind(documentRef),
    createElement: documentRef.createElement.bind(documentRef),
    createTextNode: documentRef.createTextNode.bind(documentRef),
    createDocumentFragment: documentRef.createDocumentFragment.bind(documentRef),
  };
}

function createCompatWindow({ documentRef, feedbackMessage, feedbackModal, compatLocation, compatHistory, blockedOpen }) {
  const compatWindow = {
    get self() {
      return compatWindow;
    },
    get window() {
      return compatWindow;
    },
    get top() {
      return compatWindow;
    },
    get parent() {
      return compatWindow;
    },
    document: documentRef,
    navigator: {
      userAgent: 'nb-runjs/zero-dep',
    },
    open: blockedOpen,
    alert: (...args) => feedbackMessage.info(...args),
    confirm: (...args) => {
      feedbackModal.confirm(...args);
      return false;
    },
    prompt: (...args) => {
      feedbackModal.info(...args);
      return '';
    },
    location: compatLocation,
    history: compatHistory,
    Event: SimpleEvent,
    CustomEvent: SimpleCustomEvent,
    Node: SimpleNode,
    Element: SimpleElementNode,
    HTMLElement: SimpleElementNode,
    DocumentFragment: SimpleDocumentFragmentNode,
    URL: globalThis.URL,
    Blob: globalThis.Blob,
    FormData: globalThis.FormData,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
  return compatWindow;
}

function createFormApi(formValues) {
  return {
    getFieldValue(path) {
      return getByPath(formValues, path);
    },
    setFieldValue(path, value) {
      return setByPath(formValues, path, value);
    },
    getFieldsValue() {
      return cloneSerializable(formValues);
    },
    setFieldsValue(patch) {
      if (!isPlainObject(patch)) return formValues;
      for (const [key, value] of Object.entries(patch)) {
        setByPath(formValues, [key], cloneSerializable(value));
      }
      return formValues;
    },
  };
}

function createCompatReactElement(type, props, ...children) {
  const normalizedChildren = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false);
  const nextProps = isPlainObject(props) ? { ...props } : {};
  if (normalizedChildren.length === 1) {
    nextProps.children = normalizedChildren[0];
  } else if (normalizedChildren.length > 1) {
    nextProps.children = normalizedChildren;
  }
  return {
    $$typeof: Symbol.for('react.element'),
    type,
    props: nextProps,
  };
}

function createCompatReactApi(state) {
  return {
    Fragment: 'Fragment',
    createElement: createCompatReactElement,
    useState(initialValue) {
      let current = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [
        current,
        (nextValue) => {
          current = typeof nextValue === 'function' ? nextValue(current) : nextValue;
          state.sideEffectAttempts.push({
            name: 'React.useState.setState',
            status: 'simulated',
            args: cloneSerializable([current]),
          });
          return current;
        },
      ];
    },
    useEffect(effect) {
      state.sideEffectAttempts.push({
        name: 'React.useEffect',
        status: 'simulated',
        args: [],
      });
      if (typeof effect === 'function') {
        try {
          return effect();
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
    useMemo(factory) {
      return typeof factory === 'function' ? factory() : factory;
    },
    useCallback(callback) {
      return callback;
    },
    useRef(initialValue) {
      return { current: initialValue };
    },
    memo(component) {
      return component;
    },
    forwardRef(render) {
      return render;
    },
  };
}

function createComponentLibrary(prefix) {
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== 'string') return undefined;
        const component = function CompatComponent(props) {
          return createCompatReactElement(`${prefix}.${key}`, props);
        };
        Object.defineProperty(component, 'name', {
          configurable: true,
          value: key,
        });
        return component;
      },
    },
  );
}

function createResourceApi(resource = {}, selectedRows, state, options = {}) {
  const initialData = cloneSerializable(withDefault(resource.data, Array.isArray(resource.rows) ? resource.rows : []));
  const initialCount = Array.isArray(initialData) ? initialData.length : initialData ? 1 : 0;
  const current = {
    kind: options.kind || resource.kind || resource.type || 'BoundResource',
    dataSourceKey: resource.dataSourceKey || 'main',
    collectionName: resource.collectionName || 'unknown',
    associationName: resource.associationName,
    sourceId: resource.sourceId,
    filterByTk: resource.filterByTk,
    filter: cloneSerializable(resource.filter),
    sort: cloneSerializable(withDefault(resource.sort, [])),
    fields: cloneSerializable(withDefault(resource.fields, [])),
    appends: cloneSerializable(withDefault(resource.appends, [])),
    except: cloneSerializable(withDefault(resource.except, [])),
    selectedRows,
    data: initialData,
    page: Number.isFinite(Number(resource.page)) ? Number(resource.page) : 1,
    pageSize: Number.isFinite(Number(resource.pageSize)) ? Number(resource.pageSize) : 20,
    meta: cloneSerializable(
      withDefault(resource.meta, {
        page: Number.isFinite(Number(resource.page)) ? Number(resource.page) : 1,
        pageSize: Number.isFinite(Number(resource.pageSize)) ? Number(resource.pageSize) : 20,
        count: initialCount,
        totalPage: 1,
      }),
    ),
    runActionOptions: cloneSerializable(withDefault(resource.runActionOptions, {})),
  };
  const listeners = new Map();
  const emit = (eventName, payload) => {
    for (const listener of listeners.get(eventName) || []) {
      try {
        listener(payload);
      } catch {
        // best effort only
      }
    }
  };
  const api = {
    get kind() {
      return current.kind;
    },
    set kind(nextValue) {
      current.kind = nextValue;
    },
    get dataSourceKey() {
      return current.dataSourceKey;
    },
    get collectionName() {
      return current.collectionName;
    },
    get associationName() {
      return current.associationName;
    },
    get sourceId() {
      return current.sourceId;
    },
    get filterByTk() {
      return current.filterByTk;
    },
    get selectedRows() {
      return current.selectedRows;
    },
    getData() {
      return cloneSerializable(current.data);
    },
    getMeta() {
      return cloneSerializable(current.meta);
    },
    setData(value) {
      current.data = cloneSerializable(value);
      return current.data;
    },
    setDataSourceKey(nextValue) {
      current.dataSourceKey = String(nextValue || 'main');
      return api;
    },
    setResourceName(nextValue) {
      current.collectionName = String(nextValue || 'unknown');
      return api;
    },
    setAssociationName(nextValue) {
      current.associationName = typeof nextValue === 'undefined' ? undefined : String(nextValue || '');
      return api;
    },
    setFilterByTk(nextValue) {
      current.filterByTk = nextValue;
      return api;
    },
    setFilter(nextValue) {
      current.filter = cloneSerializable(nextValue);
      return api;
    },
    getFilter() {
      return cloneSerializable(current.filter);
    },
    setSort(nextValue) {
      current.sort = cloneSerializable(withDefault(nextValue, []));
      return api;
    },
    getSort() {
      return cloneSerializable(current.sort);
    },
    setFields(nextValue) {
      current.fields = cloneSerializable(withDefault(nextValue, []));
      return api;
    },
    setAppends(nextValue) {
      current.appends = cloneSerializable(withDefault(nextValue, []));
      return api;
    },
    setExcept(nextValue) {
      current.except = cloneSerializable(withDefault(nextValue, []));
      return api;
    },
    setPage(nextValue) {
      current.page = Number.isFinite(Number(nextValue)) ? Number(nextValue) : current.page;
      return api;
    },
    getPage() {
      return current.page;
    },
    setPageSize(nextValue) {
      current.pageSize = Number.isFinite(Number(nextValue)) ? Number(nextValue) : current.pageSize;
      return api;
    },
    getPageSize() {
      return current.pageSize;
    },
    setRunActionOptions(actionName, optionsValue = {}) {
      current.runActionOptions[String(actionName || '')] = cloneSerializable(optionsValue);
      return api;
    },
    getSelectedRows() {
      return current.selectedRows;
    },
    getSourceId() {
      return current.sourceId;
    },
    async refresh() {
      state?.sideEffectAttempts.push({
        name: 'resource.refresh',
        status: 'simulated',
        args: cloneSerializable([
          {
            kind: current.kind,
            dataSourceKey: current.dataSourceKey,
            collectionName: current.collectionName,
            filterByTk: current.filterByTk,
            filter: current.filter,
            sort: current.sort,
            page: current.page,
            pageSize: current.pageSize,
          },
        ]),
      });
      if (current.kind === 'SingleRecordResource' && Array.isArray(current.data)) {
        current.data = {
          ...cloneSerializable(DEFAULT_SINGLE_RECORD_DATA),
          ...(typeof current.filterByTk !== 'undefined' ? { id: current.filterByTk } : {}),
        };
      }
      if (typeof current.filterByTk !== 'undefined' && !isPlainObject(current.data) && !Array.isArray(current.data)) {
        current.data = { id: current.filterByTk };
      }
      const count = Array.isArray(current.data) ? current.data.length : current.data ? 1 : 0;
      current.meta = {
        ...current.meta,
        page: current.page,
        pageSize: current.pageSize,
        count,
        totalPage: 1,
      };
      emit('refresh', cloneSerializable(current.data));
      return cloneSerializable(current.data);
    },
    async runAction(actionName, payload = {}) {
      const response = {
        action: String(actionName || ''),
        ok: true,
        data: cloneSerializable(payload?.data),
      };
      state?.sideEffectAttempts.push({
        name: 'resource.runAction',
        status: 'simulated',
        args: cloneSerializable([actionName, payload, current.runActionOptions[String(actionName || '')] || null]),
      });
      emit('saved', cloneSerializable(response));
      return response;
    },
    on(eventName, listener) {
      if (typeof listener !== 'function') return () => {};
      const key = String(eventName || '');
      const currentListeners = listeners.get(key) || new Set();
      currentListeners.add(listener);
      listeners.set(key, currentListeners);
      return () => currentListeners.delete(listener);
    },
    off(eventName, listener) {
      const key = String(eventName || '');
      const currentListeners = listeners.get(key);
      if (!currentListeners) return;
      if (typeof listener === 'function') currentListeners.delete(listener);
      else currentListeners.clear();
    },
  };
  return api;
}

function createChartApi(state, inputChart = {}) {
  let currentOption = cloneSerializable(inputChart?.option || {});
  const listeners = new Map();

  return {
    on(...args) {
      const [eventName, maybeQuery, maybeHandler] = args;
      const handler = typeof maybeQuery === 'function' ? maybeQuery : maybeHandler;
      const key = String(eventName || '').trim() || 'unknown';
      const current = listeners.get(key) || new Set();
      if (typeof handler === 'function') {
        current.add(handler);
      }
      listeners.set(key, current);
      state.sideEffectAttempts.push({
        name: 'chart.on',
        status: 'simulated',
        args: cloneSerializable(args),
      });
      return undefined;
    },
    off(...args) {
      const [eventName, maybeQuery, maybeHandler] = args;
      const handler = typeof maybeQuery === 'function' ? maybeQuery : maybeHandler;
      const key = String(eventName || '').trim() || 'unknown';
      const current = listeners.get(key);
      if (current && typeof handler === 'function') {
        current.delete(handler);
      } else if (current) {
        current.clear();
      }
      state.sideEffectAttempts.push({
        name: 'chart.off',
        status: 'simulated',
        args: cloneSerializable(args),
      });
      return undefined;
    },
    dispatchAction(payload) {
      state.sideEffectAttempts.push({
        name: 'chart.dispatchAction',
        status: 'simulated',
        args: cloneSerializable([payload]),
      });
      return cloneSerializable(payload);
    },
    setOption(nextOption) {
      const patch = cloneSerializable(nextOption || {});
      currentOption =
        isPlainObject(currentOption) && isPlainObject(patch) ? mergeDeep(currentOption, patch) : cloneSerializable(patch);
      state.sideEffectAttempts.push({
        name: 'chart.setOption',
        status: 'simulated',
        args: cloneSerializable([nextOption]),
      });
      return cloneSerializable(currentOption);
    },
    getOption() {
      return cloneSerializable(currentOption);
    },
    resize(...args) {
      state.sideEffectAttempts.push({
        name: 'chart.resize',
        status: 'simulated',
        args: cloneSerializable(args),
      });
      return undefined;
    },
  };
}

async function settleRenderCycle() {
  await delay(0);
  await delay(0);
}

function createTaskState(profile) {
  return {
    logs: [],
    logOverflow: false,
    runtimeIssues: [],
    sideEffectAttempts: [],
    execution: {
      mode: 'validate',
      model: profile.model,
      executed: false,
      returnValue: undefined,
    },
  };
}

export function createRuntimeEnvironment(profile, inputContext = {}, network, options = {}) {
  const state = createTaskState(profile);
  const currentUrl = new URL('https://runtime.local/');
  const compatLocation = createCompatLocation(state, currentUrl);
  const { documentRef, root } = createSimpleDocument(compatLocation);
  const elementProxy = new CompatElementProxy(root, state);
  const feedbackMessage = createFeedbackApi(state, 'message', ['success', 'info', 'warning', 'error']);
  const feedbackNotification = createFeedbackApi(state, 'notification', ['open', 'success', 'info', 'warning', 'error']);
  const feedbackModal = createFeedbackApi(state, 'modal', ['info', 'success', 'warning', 'error', 'confirm']);
  const blockedViewer = createBlockedApi(state, 'viewer', ['popover', 'dialog', 'drawer']);
  const networkController = createNetworkController(state, network, options);
  const request = createRequestShim(state, networkController);
  const selectedRows = cloneSerializable(
    withDefault(inputContext.selectedRows, inputContext.resource?.selectedRows || profile.defaultContextShape.selectedRows || []),
  );
  const formValues = cloneSerializable(withDefault(inputContext.formValues, profile.defaultContextShape.formValues || {}));
  const chartData = mergeDeep(profile.defaultContextShape.data || {}, inputContext.data || {});
  const chartApi = createChartApi(state, inputContext.chart || profile.defaultContextShape.chart || {});
  const currentValue = {
    value: cloneSerializable(withDefault(inputContext.value, profile.defaultContextShape.value)),
  };
  const namePath = cloneSerializable(withDefault(inputContext.namePath, profile.defaultContextShape.namePath || []));
  const compatDayjs = createCompatDayjs();
  const restoreGlobals = [];
  state.execution.networkMode = networkController.config.mode;
  state.execution.skillMode = networkController.config.skillMode;
  state.execution.networkAllowHosts = [...networkController.config.allowHosts];

  const logRecorder = createLogRecorder(state);
  const compatConsole = {
    log: (...args) => logRecorder.log('log', args),
    info: (...args) => logRecorder.log('info', args),
    warn: (...args) => logRecorder.log('warn', args),
    error: (...args) => logRecorder.log('error', args),
  };

  const blockedOpen = (...args) => {
    throwBlockedSideEffect(state, 'window.open', {
      args: cloneSerializable(args),
    });
  };
  const compatHistory = createCompatHistory(state);
  let compatWindow;
  const compatDocument = createCompatDocument(state, documentRef, compatLocation, () => compatWindow);
  compatWindow = createCompatWindow({
    documentRef: compatDocument,
    feedbackMessage,
    feedbackModal,
    compatLocation,
    compatHistory,
    blockedOpen,
  });
  documentRef.defaultView = compatWindow;
  documentRef.parentWindow = compatWindow;

  const installGlobal = (key, value) => {
    restoreGlobals.push({
      key,
      hadOwn: Object.prototype.hasOwnProperty.call(globalThis, key),
      descriptor: Object.getOwnPropertyDescriptor(globalThis, key),
    });
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  };

  for (const [key, value] of [
    ['window', compatWindow],
    ['self', compatWindow],
    ['document', compatDocument],
    ['navigator', compatWindow.navigator],
    ['location', compatLocation],
    ['history', compatHistory],
    ['open', blockedOpen],
    ['HTMLElement', SimpleElementNode],
    ['Element', SimpleElementNode],
    ['Node', SimpleNode],
    ['DocumentFragment', SimpleDocumentFragmentNode],
    ['Event', SimpleEvent],
    ['CustomEvent', SimpleCustomEvent],
    ['Blob', globalThis.Blob],
    ['FormData', globalThis.FormData],
    ['URL', globalThis.URL],
  ]) {
    installGlobal(key, value);
  }

  const renderAsHtml = profile.scene !== 'chart';
  const pushRenderNotice = (ruleId, message) => {
    pushRuntimeIssue(state, ruleId, message, 'warning');
  };
  const render = async (vnode, customContainer) => {
    const target = customContainer?.__el || customContainer || root;

    if (typeof vnode === 'string') {
      if (renderAsHtml) {
        target.innerHTML = vnode;
      } else {
        target.textContent = vnode;
      }
      await settleRenderCycle();
      return null;
    }

    if (isReactElementLike(vnode)) {
      pushRenderNotice('react-unsupported', `React render output is unsupported in zero-dependency mode for profile ${profile.model}.`);
      return null;
    }

    if (isDomNodeLike(vnode)) {
      pushRenderNotice('dom-render-unsupported', `DOM node render output is unsupported in zero-dependency mode for profile ${profile.model}.`);
      return null;
    }

    const serialized = JSON.stringify(vnode, null, 2);
    if (renderAsHtml) {
      target.innerHTML = `<pre data-compat-render="json">${escapeHtml(serialized)}</pre>`;
    } else {
      target.textContent = serialized;
    }
    await settleRenderCycle();
    return null;
  };

  const compatReact = createCompatReactApi(state);
  const compatAntd = createComponentLibrary('antd');
  const compatAntdIcons = createComponentLibrary('antdIcons');
  const compatReactDOM = {
    createRoot(container) {
      return {
        render(vnode) {
          return render(vnode, container);
        },
        unmount() {
          state.sideEffectAttempts.push({
            name: 'ReactDOM.createRoot.unmount',
            status: 'simulated',
            args: [],
          });
        },
      };
    },
  };

  const ctx = {};
  let simulatedProps = {};
  const initialResource = withDefault(inputContext.resource, profile.defaultContextShape.resource);
  let resourceApi =
    typeof initialResource === 'undefined' ? undefined : createResourceApi(initialResource, selectedRows, state);
  const compatActionResponse = (actionName, payload = {}) => ({
    action: String(actionName || ''),
    ok: true,
    data: cloneSerializable(payload?.data),
  });
  const fullCtxMembers = {
    t(key, variables) {
      return interpolate(key, variables);
    },
    render,
    async runjs(code, variables = {}, runOptions = {}) {
      state.sideEffectAttempts.push({
        name: 'ctx.runjs',
        status: 'simulated',
        args: cloneSerializable([code, variables, runOptions]),
      });
      return undefined;
    },
    request,
    api: {
      request,
    },
    getVar(path) {
      const source = String(path || '').startsWith('ctx.') ? String(path).slice(4) : String(path || '');
      return getByPath(ctx, source);
    },
    getVarInfos({ path = '', maxDepth = 2 } = {}) {
      const rootValue = path ? getByPath(ctx, path) : ctx;
      const visit = (value, depth) => {
        if (depth < 0 || value == null) return undefined;
        if (Array.isArray(value)) return { type: 'array', size: value.length };
        if (!isPlainObject(value)) return { type: typeof value };
        return {
          type: 'object',
          keys: Object.fromEntries(
            Object.keys(value)
              .slice(0, 20)
              .map((key) => [key, visit(value[key], depth - 1)]),
          ),
        };
      };
      return visit(rootValue, maxDepth);
    },
    importAsync: async (...args) => {
      const detail = {
        name: 'ctx.importAsync',
        status: 'blocked',
        args: cloneSerializable(args),
      };
      state.sideEffectAttempts.push(detail);
      throw new CompatBlockedError('Blocked ctx.importAsync.', detail);
    },
    requireAsync: async (...args) => {
      const detail = {
        name: 'ctx.requireAsync',
        status: 'blocked',
        args: cloneSerializable(args),
      };
      state.sideEffectAttempts.push(detail);
      throw new CompatBlockedError('Blocked ctx.requireAsync.', detail);
    },
    loadCSS: async (...args) => {
      const detail = {
        name: 'ctx.loadCSS',
        status: 'blocked',
        args: cloneSerializable(args),
      };
      state.sideEffectAttempts.push(detail);
      throw new CompatBlockedError('Blocked ctx.loadCSS.', detail);
    },
    initResource(type = 'MultiRecordResource') {
      if (!resourceApi) {
        resourceApi = createResourceApi(
          {
            dataSourceKey: 'main',
            collectionName: 'unknown',
          },
          selectedRows,
          state,
          { kind: type },
        );
      }
      resourceApi.kind = String(type || resourceApi.kind || 'MultiRecordResource');
      ctx.resource = resourceApi;
      return resourceApi;
    },
    makeResource(type = 'MultiRecordResource') {
      return createResourceApi(
        {
          dataSourceKey: resourceApi?.dataSourceKey || 'main',
          collectionName: resourceApi?.collectionName || 'unknown',
          selectedRows,
        },
        selectedRows,
        state,
        { kind: type },
      );
    },
    React: compatReact,
    ReactDOM: compatReactDOM,
    antd: compatAntd,
    antdIcons: compatAntdIcons,
    dayjs: compatDayjs,
    libs: {
      React: compatReact,
      ReactDOM: compatReactDOM,
      antd: compatAntd,
      antdIcons: compatAntdIcons,
      dayjs: compatDayjs,
    },
    element: elementProxy,
    console: compatConsole,
    acl: cloneSerializable(withDefault(inputContext.acl, profile.defaultContextShape.acl || {})),
    message: feedbackMessage,
    notification: feedbackNotification,
    modal: feedbackModal,
    logger: typeof inputContext.logger === 'object' && inputContext.logger ? inputContext.logger : compatConsole,
    viewer: blockedViewer,
    openView: (...args) => {
      const detail = {
        name: 'ctx.openView',
        status: profile.simulatedCompatCalls?.includes('openView') ? 'simulated' : 'blocked',
        args: cloneSerializable(args),
      };
      state.sideEffectAttempts.push(detail);
      if (detail.status === 'simulated') {
        return undefined;
      }
      throw new CompatBlockedError('Blocked ctx.openView.', detail);
    },
    inputArgs: cloneSerializable(withDefault(inputContext.inputArgs, profile.defaultContextShape.inputArgs || {})),
    popup: cloneSerializable(withDefault(inputContext.popup, profile.defaultContextShape.popup || {})),
    record: cloneSerializable(withDefault(inputContext.record, profile.defaultContextShape.record)),
    data: cloneSerializable(chartData),
    chart: chartApi,
    auth: cloneSerializable(withDefault(inputContext.auth, profile.defaultContextShape.auth)),
    engine: cloneSerializable(withDefault(inputContext.engine, profile.defaultContextShape.engine)),
    dataSourceManager: cloneSerializable(
      withDefault(inputContext.dataSourceManager, profile.defaultContextShape.dataSourceManager),
    ),
    date: cloneSerializable(withDefault(inputContext.date, profile.defaultContextShape.date)),
    model: cloneSerializable(withDefault(inputContext.model, profile.defaultContextShape.model)),
    user: cloneSerializable(withDefault(inputContext.user, profile.defaultContextShape.user)),
    role: cloneSerializable(withDefault(inputContext.role, profile.defaultContextShape.role)),
    value: currentValue.value,
    formValues,
    form: createFormApi(formValues),
    resource: resourceApi,
    collection: cloneSerializable(withDefault(inputContext.collection, profile.defaultContextShape.collection)),
    collectionField: cloneSerializable(
      withDefault(inputContext.collectionField, profile.defaultContextShape.collectionField),
    ),
    selectedRows,
    namePath,
    disabled: Boolean(withDefault(inputContext.disabled, profile.defaultContextShape.disabled)),
    readOnly: Boolean(withDefault(inputContext.readOnly, profile.defaultContextShape.readOnly)),
    getValue() {
      return currentValue.value;
    },
    setValue(nextValue) {
      currentValue.value = nextValue;
      if (Object.prototype.hasOwnProperty.call(ctx, 'value')) {
        ctx.value = nextValue;
      }
      if (namePath.length > 0) setByPath(formValues, namePath, cloneSerializable(nextValue));
      elementProxy.dispatchEvent(new SimpleCustomEvent('js-field:value-change', { detail: nextValue }));
      return nextValue;
    },
    setProps(patch) {
      state.sideEffectAttempts.push({
        name: 'ctx.setProps',
        status: 'simulated',
        args: cloneSerializable([patch]),
      });
      simulatedProps = { ...simulatedProps, ...(patch || {}) };
      return simulatedProps;
    },
    async runAction(actionName, payload = {}) {
      state.sideEffectAttempts.push({
        name: 'ctx.runAction',
        status: 'simulated',
        args: cloneSerializable([actionName, payload]),
      });
      return compatActionResponse(actionName, payload);
    },
  };

  for (const key of Object.keys(profile.contract || {})) {
    if (!Object.prototype.hasOwnProperty.call(fullCtxMembers, key)) continue;
    ctx[key] = fullCtxMembers[key];
  }

  const sandboxGlobals = {
    window: compatWindow,
    self: compatWindow,
    document: compatDocument,
    navigator: compatWindow.navigator,
    location: compatLocation,
    history: compatHistory,
    open: blockedOpen,
    console: compatConsole,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    URL: globalThis.URL,
    Blob: globalThis.Blob,
    FormData: globalThis.FormData,
    HTMLElement: SimpleElementNode,
    Element: SimpleElementNode,
    Node: SimpleNode,
    DocumentFragment: SimpleDocumentFragmentNode,
    Event: SimpleEvent,
    CustomEvent: SimpleCustomEvent,
  };

  for (const alias of profile.topLevelAliases || []) {
    if (alias === 'ctx') continue;
    if (!Object.prototype.hasOwnProperty.call(ctx, alias)) continue;
    sandboxGlobals[alias] = ctx[alias];
  }

  return {
    ctx,
    state,
    sandboxGlobals,
    finalize: async () => {
      try {
        await settleRenderCycle();
      } finally {
        for (const entry of restoreGlobals.reverse()) {
          if (entry.hadOwn && entry.descriptor) {
            Object.defineProperty(globalThis, entry.key, entry.descriptor);
          } else {
            delete globalThis[entry.key];
          }
        }
      }
      return state;
    },
  };
}

export function normalizeRuntimeError(error) {
  if (error instanceof CompatBlockedError) {
    return createIssue(error.detail?.ruleId || 'blocked-side-effect', error.message, 'error', {
      detail: error.detail,
    });
  }
  return createIssue('runtime-error', error?.message || String(error), 'error', {
    detail: serializeError(error),
  });
}
