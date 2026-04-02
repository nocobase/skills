import { createCompatDayjs } from './compat-dayjs.js';
import { READ_ONLY_HTTP_METHODS } from './constants.js';
import {
  cloneSerializable,
  getByPath,
  interpolate,
  isDomNodeLike,
  isPlainObject,
  isReactElementLike,
  normalizeMethod,
  serializeError,
  setByPath,
  summarizeHtml,
  summarizeText,
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
  return {
    log(level, args) {
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
      pushRuntimeIssue(this.__state, 'dom-preview-unsupported', 'DOM node preview is unsupported in zero-dependency mode.');
      return;
    }
    this.__el.append(...nodes.map((node) => coerceNode(node, this.__el.ownerDocument)));
  }

  replaceChildren(...nodes) {
    if (nodes.some((node) => isDomNodeLike(node))) {
      pushRuntimeIssue(this.__state, 'dom-preview-unsupported', 'DOM node preview is unsupported in zero-dependency mode.');
      return;
    }
    this.__el.replaceChildren(...nodes.map((node) => coerceNode(node, this.__el.ownerDocument)));
  }

  querySelector(selector) {
    pushRuntimeIssue(this.__state, 'selector-unsupported', `querySelector("${selector}") is unsupported in zero-dependency preview.`);
    return null;
  }

  querySelectorAll(selector) {
    pushRuntimeIssue(this.__state, 'selector-unsupported', `querySelectorAll("${selector}") is unsupported in zero-dependency preview.`);
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

function normalizeNetworkConfig(network = {}) {
  return {
    mode: network?.mode === 'live' ? 'live' : 'mock',
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

function createNetworkController(state, network) {
  const config = normalizeNetworkConfig(network);
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
        blockNetwork(detail, 'unmocked-network-request', `No mock response matched ${method} ${url || '<unknown url>'}.`);
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

function createFetchShim(state, networkController) {
  return async function compatFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url;
    const method = normalizeMethod(init.method || input?.method || 'GET');
    const detail = {
      name: 'fetch',
      method,
      url,
      status: 'pending',
    };
    state.sideEffectAttempts.push(detail);
    if (!READ_ONLY_HTTP_METHODS.has(method)) {
      detail.status = 'blocked';
      detail.ruleId = 'blocked-side-effect';
      throw new CompatBlockedError(`Blocked fetch method "${method}" for ${url || '<unknown url>'}.`, detail);
    }
    return networkController.fetch('fetch', url, method, init, detail);
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

function createCompatWindow({ documentRef, compatFetch, feedbackMessage, feedbackModal, compatLocation, compatHistory, blockedOpen }) {
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
    fetch: compatFetch,
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

function createResourceApi(resource = {}, selectedRows) {
  const current = {
    dataSourceKey: resource.dataSourceKey || 'main',
    collectionName: resource.collectionName || 'unknown',
    associationName: resource.associationName,
    sourceId: resource.sourceId,
    selectedRows,
  };
  return {
    ...current,
    getSelectedRows() {
      return current.selectedRows;
    },
    getSourceId() {
      return current.sourceId;
    },
  };
}

async function settlePreview() {
  await delay(0);
  await delay(0);
}

export function createTaskState(profile, mode) {
  return {
    profile,
    mode,
    logs: [],
    runtimeIssues: [],
    sideEffectAttempts: [],
    preview: {
      rendered: false,
      html: '',
      text: '',
      renderCount: 0,
      degraded: false,
      fidelity: 'unsupported',
    },
    execution: {
      mode,
      model: profile.model,
      executed: false,
      returnValue: undefined,
    },
  };
}

export function createPreviewEnvironment(profile, mode, inputContext = {}, network) {
  const state = createTaskState(profile, mode);
  const currentUrl = new URL('https://preview.local/');
  const compatLocation = createCompatLocation(state, currentUrl);
  const { documentRef, root } = createSimpleDocument(compatLocation);
  const elementProxy = new CompatElementProxy(root, state);
  const feedbackMessage = createFeedbackApi(state, 'message', ['success', 'info', 'warning', 'error']);
  const feedbackNotification = createFeedbackApi(state, 'notification', ['open', 'success', 'info', 'warning', 'error']);
  const feedbackModal = createFeedbackApi(state, 'modal', ['info', 'success', 'warning', 'error', 'confirm']);
  const blockedViewer = createBlockedApi(state, 'viewer', ['popover', 'dialog', 'drawer']);
  const networkController = createNetworkController(state, network);
  const request = createRequestShim(state, networkController);
  const compatFetch = createFetchShim(state, networkController);
  const selectedRows = cloneSerializable(
    withDefault(inputContext.selectedRows, inputContext.resource?.selectedRows || profile.defaultContextShape.selectedRows || []),
  );
  const formValues = cloneSerializable(withDefault(inputContext.formValues, profile.defaultContextShape.formValues || {}));
  const currentValue = {
    value: cloneSerializable(withDefault(inputContext.value, profile.defaultContextShape.value)),
  };
  const namePath = cloneSerializable(withDefault(inputContext.namePath, profile.defaultContextShape.namePath || []));
  const compatDayjs = createCompatDayjs();
  const restoreGlobals = [];
  state.execution.networkMode = networkController.config.mode;
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
    compatFetch,
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

  const previewCapabilities = {
    html: profile.previewCapabilities?.html !== false,
    react: profile.previewCapabilities?.react !== false,
    dom: profile.previewCapabilities?.dom !== false,
    text: profile.previewCapabilities?.text !== false,
  };
  const pushPreviewNotice = (ruleId, message) => {
    pushRuntimeIssue(state, ruleId, message, 'warning');
  };
  const render = async (vnode, customContainer) => {
    const target = customContainer?.__el || customContainer || root;
    state.preview.renderCount += 1;

    if (typeof vnode === 'string') {
      if (previewCapabilities.html) {
        target.innerHTML = vnode;
        state.preview.rendered = true;
        state.preview.fidelity = 'compatible';
        await settlePreview();
        return null;
      }
      if (previewCapabilities.text) {
        target.textContent = vnode;
        state.preview.rendered = true;
        state.preview.degraded = true;
        state.preview.fidelity = 'degraded';
        pushPreviewNotice('preview-capability-degraded', `HTML preview is disabled for profile ${profile.model}; rendered as text.`);
        await settlePreview();
        return null;
      }
      state.preview.rendered = false;
      state.preview.degraded = true;
      state.preview.fidelity = 'unsupported';
      pushPreviewNotice('preview-unsupported', `HTML preview is unsupported for profile ${profile.model}.`);
      return null;
    }

    if (isReactElementLike(vnode)) {
      state.preview.rendered = false;
      state.preview.degraded = true;
      state.preview.fidelity = 'unsupported';
      pushPreviewNotice('react-unsupported', `React preview is unsupported in zero-dependency mode for profile ${profile.model}.`);
      return null;
    }

    if (isDomNodeLike(vnode)) {
      state.preview.rendered = false;
      state.preview.degraded = true;
      state.preview.fidelity = 'unsupported';
      pushPreviewNotice('dom-preview-unsupported', `DOM node preview is unsupported in zero-dependency mode for profile ${profile.model}.`);
      return null;
    }

    const serialized = JSON.stringify(vnode, null, 2);
    if (!previewCapabilities.html && !previewCapabilities.text) {
      state.preview.rendered = false;
      state.preview.degraded = true;
      state.preview.fidelity = 'unsupported';
      pushPreviewNotice('preview-unsupported', `Structured value preview is unsupported for profile ${profile.model}.`);
      return null;
    }
    if (previewCapabilities.html) {
      target.innerHTML = `<pre data-compat-render="json">${escapeHtml(serialized)}</pre>`;
    } else {
      target.textContent = serialized;
    }
    state.preview.rendered = true;
    state.preview.degraded = true;
    state.preview.fidelity = 'degraded';
    await settlePreview();
    return null;
  };

  const ctx = {};
  let previewProps = {};
  const fullCtxMembers = {
    t(key, variables) {
      return interpolate(key, variables);
    },
    render,
    request,
    fetch: compatFetch,
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
    dayjs: compatDayjs,
    libs: {
      dayjs: compatDayjs,
    },
    element: elementProxy,
    message: feedbackMessage,
    notification: feedbackNotification,
    modal: feedbackModal,
    viewer: blockedViewer,
    openView: (...args) => {
      const detail = {
        name: 'ctx.openView',
        status: 'blocked',
        args: cloneSerializable(args),
      };
      state.sideEffectAttempts.push(detail);
      throw new CompatBlockedError('Blocked ctx.openView.', detail);
    },
    inputArgs: cloneSerializable(withDefault(inputContext.inputArgs, profile.defaultContextShape.inputArgs || {})),
    popup: cloneSerializable(withDefault(inputContext.popup, profile.defaultContextShape.popup || {})),
    record: cloneSerializable(withDefault(inputContext.record, profile.defaultContextShape.record)),
    value: currentValue.value,
    formValues,
    form: createFormApi(formValues),
    resource: createResourceApi(
      withDefault(inputContext.resource, profile.defaultContextShape.resource || {}),
      selectedRows,
    ),
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
      previewProps = { ...previewProps, ...(patch || {}) };
      return previewProps;
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
    fetch: compatFetch,
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
        await settlePreview();
        state.preview.html = summarizeHtml(root.innerHTML);
        state.preview.text = summarizeText(root.textContent || '');
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
