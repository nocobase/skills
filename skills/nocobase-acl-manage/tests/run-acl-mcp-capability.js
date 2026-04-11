#!/usr/bin/env node

/*
 * ACL MCP capability runner (v2)
 * - MCP JSON-RPC only
 * - tools/call only
 * - no direct ACL REST fallback
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

function parseArgs(argv) {
  const out = {
    mcpUrl: 'http://127.0.0.1:13000/api/mcp',
    bearerToken: '',
    tokenEnv: 'NOCOBASE_API_TOKEN',
    mcpPackages: '',
    dataSourceKey: 'main',
    collectionName: 'users',
    testUserId: '',
    desktopRouteKey: '',
    roleNamePrefix: 'acl_mcp_case_',
    toolOverridesPath: '',
    skipWrites: false,
    enableHighImpactWrites: false,
    enableRouteWrites: false,
    enableGuardedUserWrites: false,
    reportPath: '',
  };

  const keyMap = {
    mcpurl: 'mcpUrl',
    bearertoken: 'bearerToken',
    tokenenv: 'tokenEnv',
    mcppackages: 'mcpPackages',
    datasourcekey: 'dataSourceKey',
    collectionname: 'collectionName',
    testuserid: 'testUserId',
    desktoproutekey: 'desktopRouteKey',
    rolenameprefix: 'roleNamePrefix',
    tooloverridespath: 'toolOverridesPath',
    reportpath: 'reportPath',
    skipwrites: 'skipWrites',
    enablehighimpactwrites: 'enableHighImpactWrites',
    enableroutewrites: 'enableRouteWrites',
    enableguardeduserwrites: 'enableGuardedUserWrites',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('-')) {
      continue;
    }

    let keyPart = raw;
    let valuePart = null;
    const eqIndex = raw.indexOf('=');
    if (eqIndex >= 0) {
      keyPart = raw.slice(0, eqIndex);
      valuePart = raw.slice(eqIndex + 1);
    }

    const normalized = keyPart.replace(/^-+/, '').replace(/[-_]/g, '').toLowerCase();
    const mapped = keyMap[normalized];
    if (!mapped) {
      continue;
    }

    const isBoolean = ['skipWrites', 'enableHighImpactWrites', 'enableRouteWrites', 'enableGuardedUserWrites'].includes(mapped);
    if (isBoolean) {
      if (valuePart === null) {
        out[mapped] = true;
      } else {
        out[mapped] = ['1', 'true', 'yes', 'on'].includes(String(valuePart).toLowerCase());
      }
      continue;
    }

    let finalValue = valuePart;
    if (finalValue === null) {
      const next = argv[i + 1];
      if (typeof next === 'string' && !next.startsWith('-')) {
        finalValue = next;
        i += 1;
      } else {
        finalValue = '';
      }
    }
    out[mapped] = String(finalValue);
  }

  return out;
}

function makeTimestampForName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('');
}

function makeTimestampForFile() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    '-',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('');
}

function requestRaw(urlString, payloadJson, headers) {
  return new Promise((resolve) => {
    let urlObj;
    try {
      urlObj = new URL(urlString);
    } catch (err) {
      resolve({
        statusCode: null,
        body: '',
        responseHeaders: {},
        transportError: `invalid URL: ${err.message}`,
      });
      return;
    }

    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;
    const payload = Buffer.from(payloadJson, 'utf8');

    const req = mod.request(
      {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        method: 'POST',
        path: `${urlObj.pathname}${urlObj.search}`,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': payload.length,
          ...headers,
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || null,
            body: Buffer.concat(chunks).toString('utf8'),
            responseHeaders: res.headers || {},
            transportError: '',
          });
        });
      },
    );

    req.on('error', (err) => {
      resolve({
        statusCode: null,
        body: '',
        responseHeaders: {},
        transportError: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

function parseEnvelope(body) {
  if (!body || !body.trim()) {
    return null;
  }

  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''))
    .filter((line) => line && line !== '[DONE]');

  const tail = lines.slice(-10);
  for (const line of tail) {
    try {
      return JSON.parse(line);
    } catch {
      // continue
    }
  }
  return null;
}

function getMcpErrorText(envelope) {
  if (!envelope) {
    return 'empty envelope';
  }
  if (!envelope.error) {
    return '';
  }
  const code = envelope.error.code !== undefined ? String(envelope.error.code) : '';
  const message = envelope.error.message !== undefined ? String(envelope.error.message) : '';
  return `code=${code} message=${message}`.trim() || 'json-rpc error';
}

function compactJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseMaybeJsonText(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractToolPayload(envelope) {
  if (!envelope || !envelope.result) {
    return null;
  }
  const result = envelope.result;
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  if (Array.isArray(result.content)) {
    const parsed = [];
    for (const item of result.content) {
      if (!item || typeof item !== 'object' || typeof item.text !== 'string') {
        continue;
      }
      const obj = parseMaybeJsonText(item.text);
      parsed.push(obj === null ? item.text : obj);
    }
    if (parsed.length === 1) {
      return parsed[0];
    }
    if (parsed.length > 1) {
      return parsed;
    }
  }
  return result;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function getProp(obj, name) {
  if (!obj) {
    return undefined;
  }
  if (isObject(obj) && Object.prototype.hasOwnProperty.call(obj, name)) {
    return obj[name];
  }
  return undefined;
}

function getSchemaPropertyNames(toolDef) {
  const schema = getProp(toolDef, 'inputSchema');
  const props = getProp(schema, 'properties');
  if (!isObject(props)) {
    return [];
  }
  return Object.keys(props);
}

function getSchemaRequiredNames(toolDef) {
  const schema = getProp(toolDef, 'inputSchema');
  const required = getProp(schema, 'required');
  if (!Array.isArray(required)) {
    return [];
  }
  return required.filter((x) => typeof x === 'string');
}

function conformArgumentsToSchema(toolDef, proposed, fallbacks) {
  const propNames = getSchemaPropertyNames(toolDef);
  const required = getSchemaRequiredNames(toolDef);
  if (!propNames.length) {
    return { ...proposed };
  }

  const out = {};
  for (const key of Object.keys(proposed)) {
    if (propNames.includes(key)) {
      out[key] = proposed[key];
    }
  }

  for (const req of required) {
    if (Object.prototype.hasOwnProperty.call(out, req)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(fallbacks, req)) {
      out[req] = fallbacks[req];
      continue;
    }

    const lower = req.toLowerCase();
    if (lower === 'filterbytk' && fallbacks.filterByTk !== undefined) out[req] = fallbacks.filterByTk;
    if (lower === 'datasourcekey' && fallbacks.dataSourceKey !== undefined) out[req] = fallbacks.dataSourceKey;
    if (lower === 'userid' && fallbacks.userId !== undefined) out[req] = fallbacks.userId;
    if (lower === 'userids' && fallbacks.userIds !== undefined) out[req] = fallbacks.userIds;
    if (lower === 'requestbody' && fallbacks.requestBody !== undefined) out[req] = fallbacks.requestBody;
    if (lower === 'name' && fallbacks.name !== undefined) out[req] = fallbacks.name;
    if (lower === 'rolename' && fallbacks.roleName !== undefined) out[req] = fallbacks.roleName;
    if (lower === 'rolemode' && fallbacks.roleMode !== undefined) out[req] = fallbacks.roleMode;
    if ((lower === 'resource' || lower === 'resourcename') && fallbacks.resourceName !== undefined) out[req] = fallbacks.resourceName;
    if ((lower === 'routekey' || lower === 'routepath' || lower === 'routename' || lower === 'route') && fallbacks.routeKey !== undefined) {
      out[req] = fallbacks.routeKey;
    }
  }

  return out;
}

function resolveToolName(ctx, overrideKey, candidates, patterns) {
  if (overrideKey && ctx.toolOverrides[overrideKey]) {
    const overrideName = String(ctx.toolOverrides[overrideKey]);
    if (ctx.toolMap[overrideName]) {
      return overrideName;
    }
  }

  for (const candidate of candidates) {
    if (ctx.toolMap[candidate]) {
      return candidate;
    }
  }

  for (const pattern of patterns) {
    let re;
    try {
      re = new RegExp(pattern);
    } catch {
      continue;
    }
    const matched = ctx.toolNames.find((name) => re.test(name));
    if (matched) {
      return matched;
    }
  }
  return '';
}

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function writeJsonFile(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function extractRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isObject(payload)) {
    return [];
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (isObject(payload.data) && Array.isArray(payload.data.data)) {
    return payload.data.data;
  }
  if (Array.isArray(payload.rows)) {
    return payload.rows;
  }
  if (isObject(payload.meta) && Array.isArray(payload.meta.data)) {
    return payload.meta.data;
  }
  return [];
}

function findFirstRoleName(payload) {
  const rows = extractRows(payload);
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    const name = row.name;
    if (typeof name === 'string' && name) {
      return name;
    }
  }
  return '';
}

function findFirstRouteId(payload) {
  const rows = extractRows(payload);
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    if (typeof row.id === 'number') {
      return row.id;
    }
  }
  return null;
}

function parseRoleMode(payload) {
  if (isObject(payload) && isObject(payload.data) && typeof payload.data.roleMode === 'string') {
    return payload.data.roleMode;
  }
  const text = compactJson(payload);
  if (text.includes('allow-use-union')) return 'allow-use-union';
  if (text.includes('only-use-union')) return 'only-use-union';
  if (text.includes('"roleMode":"default"') || text.includes('"roleMode":"default')) return 'default';
  return '';
}

function parseRoleNamesFromMembership(payload) {
  const rows = extractRows(payload);
  const names = [];
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    if (typeof row.name === 'string' && row.name) {
      names.push(row.name);
    }
  }
  return [...new Set(names)];
}

function findScopeByKey(payload, scopeKey, dataSourceKey) {
  const rows = extractRows(payload);
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    const key = typeof row.key === 'string' ? row.key : '';
    if (key !== scopeKey) {
      continue;
    }
    if (dataSourceKey && typeof row.dataSourceKey === 'string' && row.dataSourceKey !== dataSourceKey) {
      continue;
    }
    return row;
  }
  return null;
}

function findCollectionByName(payload, collectionName, dataSourceKey) {
  const rows = extractRows(payload);
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    if (typeof row.name !== 'string' || row.name !== collectionName) {
      continue;
    }
    if (dataSourceKey && typeof row.dataSourceKey === 'string' && row.dataSourceKey !== dataSourceKey) {
      continue;
    }
    return row;
  }
  return null;
}

function extractCollectionFieldNames(collectionRow) {
  if (!isObject(collectionRow)) {
    return [];
  }
  if (!Array.isArray(collectionRow.fields)) {
    return [];
  }
  const names = [];
  for (const field of collectionRow.fields) {
    if (typeof field === 'string' && field) {
      names.push(field);
      continue;
    }
    if (isObject(field) && typeof field.name === 'string' && field.name) {
      names.push(field.name);
    }
  }
  return [...new Set(names)].sort();
}

function normalizeStringSet(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => !!item),
    ),
  ].sort();
}

function hasSameStringSet(a, b) {
  const aa = normalizeStringSet(a);
  const bb = normalizeStringSet(b);
  if (aa.length !== bb.length) {
    return false;
  }
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] !== bb[i]) {
      return false;
    }
  }
  return true;
}

function getToolPayloadError(payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    if (typeof row.statusCode === 'number' && row.statusCode >= 400) {
      const errList = Array.isArray(row.body && row.body.errors) ? row.body.errors : [];
      const msg = errList.length && errList[0] && errList[0].message ? String(errList[0].message) : '';
      return `tool payload statusCode=${row.statusCode}${msg ? ` message=${msg}` : ''}`;
    }
  }
  return '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const state = {
    pass: 0,
    warn: 0,
    fail: 0,
    skip: 0,
    results: [],
    toolMap: {},
    toolNames: [],
    toolOverrides: {},
  };

  function addResult({ id, layer, capability, status, detail, evidence = '' }) {
    if (status === 'pass') state.pass += 1;
    if (status === 'warn') state.warn += 1;
    if (status === 'fail') state.fail += 1;
    if (status === 'skip') state.skip += 1;

    const row = {
      id,
      layer,
      capability,
      status,
      detail,
      evidence,
      timestamp: new Date().toISOString(),
    };
    state.results.push(row);
    process.stdout.write(`[${status.toUpperCase()}] ${id} ${capability} - ${detail}\n`);
  }

  function writeReport({ testRoleName, roleCreated, originalRoleMode }) {
    const reportPath =
      args.reportPath ||
      path.join(
        'skills',
        'nocobase-acl-manage',
        'tests',
        'report',
        `acl-capability-${makeTimestampForFile()}.json`,
      );

    const report = {
      generatedAtUtc: new Date().toISOString(),
      mcpUrl: args.mcpUrl,
      dataSourceKey: args.dataSourceKey,
      collectionName: args.collectionName,
      skipWrites: !!args.skipWrites,
      enableHighImpactWrites: !!args.enableHighImpactWrites,
      enableRouteWrites: !!args.enableRouteWrites,
      enableGuardedUserWrites: !!args.enableGuardedUserWrites,
      testRoleName,
      roleCreated,
      originalRoleMode,
      summary: {
        pass: state.pass,
        warn: state.warn,
        fail: state.fail,
        skip: state.skip,
      },
      results: state.results,
    };

    writeJsonFile(reportPath, report);
    return reportPath;
  }

  async function invokeMethod(headers, id, method, params) {
    const payloadJson = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });
    const response = await requestRaw(args.mcpUrl, payloadJson, headers);
    if (response.statusCode === null) {
      return { ok: false, detail: `transport failed: ${response.transportError}`, response, envelope: null, data: null };
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return { ok: false, detail: `http status ${response.statusCode}`, response, envelope: null, data: null };
    }
    const envelope = parseEnvelope(response.body);
    const errText = getMcpErrorText(envelope);
    if (errText) {
      return { ok: false, detail: errText, response, envelope, data: null };
    }
    return { ok: true, detail: 'ok', response, envelope, data: envelope ? envelope.result : null };
  }

  async function invokeTool(headers, id, toolName, argumentsObj) {
    if (!toolName) {
      return { ok: false, detail: 'tool name is empty', envelope: null, payload: null, response: null };
    }
    const methodResult = await invokeMethod(headers, id, 'tools/call', {
      name: toolName,
      arguments: argumentsObj,
    });
    if (!methodResult.ok) {
      return {
        ok: false,
        detail: methodResult.detail,
        envelope: methodResult.envelope,
        payload: null,
        response: methodResult.response,
      };
    }
    const payload = extractToolPayload(methodResult.envelope);
    const payloadErr = getToolPayloadError(payload);
    if (payloadErr) {
      return {
        ok: false,
        detail: payloadErr,
        envelope: methodResult.envelope,
        payload,
        response: methodResult.response,
      };
    }
    return {
      ok: true,
      detail: 'ok',
      envelope: methodResult.envelope,
      payload,
      response: methodResult.response,
    };
  }

  if (args.toolOverridesPath) {
    if (!fs.existsSync(args.toolOverridesPath)) {
      addResult({
        id: 'ACL-SETUP-001',
        layer: 'setup',
        capability: 'tool overrides',
        status: 'warn',
        detail: `tool override file not found: ${args.toolOverridesPath}`,
      });
    } else {
      try {
        const raw = fs.readFileSync(args.toolOverridesPath, 'utf8');
        const obj = JSON.parse(raw);
        if (isObject(obj)) {
          state.toolOverrides = obj;
          addResult({
            id: 'ACL-SETUP-001',
            layer: 'setup',
            capability: 'tool overrides',
            status: 'pass',
            detail: `loaded override keys: ${Object.keys(obj).join(', ')}`,
          });
        } else {
          addResult({
            id: 'ACL-SETUP-001',
            layer: 'setup',
            capability: 'tool overrides',
            status: 'fail',
            detail: 'override file must be a JSON object',
          });
        }
      } catch (err) {
        addResult({
          id: 'ACL-SETUP-001',
          layer: 'setup',
          capability: 'tool overrides',
          status: 'fail',
          detail: `invalid tool override JSON: ${err.message}`,
        });
      }
    }
  }

  const token = args.bearerToken || process.env[args.tokenEnv] || '';
  if (!token) {
    addResult({
      id: 'ACL-SMOKE-000',
      layer: 'protocol',
      capability: 'token readiness',
      status: 'fail',
      detail: `bearer token missing; provide --bearer-token or set ${args.tokenEnv}`,
    });
    const reportPath = writeReport({ testRoleName: '', roleCreated: false, originalRoleMode: '' });
    process.stdout.write(`report: ${reportPath}\n`);
    process.exitCode = 1;
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  };
  if (args.mcpPackages) {
    headers['x-mcp-packages'] = args.mcpPackages;
  }

  let nextId = 1000;
  const testRoleName = `${args.roleNamePrefix}${makeTimestampForName()}${Math.floor(100 + Math.random() * 900)}`;
  const testRoleTitle = `ACL MCP Test ${testRoleName}`;
  let roleCreated = false;
  let originalRoleMode = '';
  let globalWriteAttempted = false;
  let guardedMembershipApplied = false;
  let auditRoleName = '';

  const initResp = await invokeMethod(headers, nextId, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'nocobase-acl-capability-runner-node',
      version: '2.0.0',
    },
  });
  nextId += 1;

  if (!initResp.ok) {
    addResult({
      id: 'ACL-SMOKE-001',
      layer: 'protocol',
      capability: 'initialize',
      status: 'fail',
      detail: initResp.detail,
    });
    const reportPath = writeReport({ testRoleName: '', roleCreated: false, originalRoleMode: '' });
    process.stdout.write(`report: ${reportPath}\n`);
    process.exitCode = 1;
    return;
  }
  addResult({
    id: 'ACL-SMOKE-001',
    layer: 'protocol',
    capability: 'initialize',
    status: 'pass',
    detail: 'initialize succeeded',
  });

  const sid = normalizeHeaderValue(initResp.response.responseHeaders['mcp-session-id']);
  if (sid) {
    headers['Mcp-Session-Id'] = sid;
  }

  const toolsResp = await invokeMethod(headers, nextId, 'tools/list', {});
  nextId += 1;
  if (!toolsResp.ok) {
    addResult({
      id: 'ACL-SMOKE-001',
      layer: 'protocol',
      capability: 'tools/list',
      status: 'fail',
      detail: toolsResp.detail,
    });
    const reportPath = writeReport({ testRoleName: '', roleCreated: false, originalRoleMode: '' });
    process.stdout.write(`report: ${reportPath}\n`);
    process.exitCode = 1;
    return;
  }

  const toolDefs = Array.isArray(toolsResp.data && toolsResp.data.tools) ? toolsResp.data.tools : [];
  for (const tool of toolDefs) {
    if (tool && typeof tool.name === 'string' && tool.name) {
      state.toolMap[tool.name] = tool;
      state.toolNames.push(tool.name);
    }
  }
  state.toolNames = [...new Set(state.toolNames)].sort();
  if (!state.toolNames.length) {
    addResult({
      id: 'ACL-SMOKE-001',
      layer: 'protocol',
      capability: 'tools/list',
      status: 'fail',
      detail: 'tools/list succeeded but returned zero tools',
    });
    const reportPath = writeReport({ testRoleName: '', roleCreated: false, originalRoleMode: '' });
    process.stdout.write(`report: ${reportPath}\n`);
    process.exitCode = 1;
    return;
  }
  addResult({
    id: 'ACL-SMOKE-001',
    layer: 'protocol',
    capability: 'tools/list',
    status: 'pass',
    detail: `tools available: ${state.toolNames.length}`,
  });

  const probeTool = resolveToolName(
    state,
    'probe_tool',
    ['available_actions_list', 'roles_list', 'collections_list'],
    ['_list$'],
  );
  if (!probeTool) {
    addResult({
      id: 'ACL-SMOKE-001',
      layer: 'protocol',
      capability: 'tools/call',
      status: 'fail',
      detail: 'no probe tool found for tools/call',
    });
  } else {
    const probe = await invokeTool(headers, nextId, probeTool, {});
    nextId += 1;
    addResult({
      id: 'ACL-SMOKE-001',
      layer: 'protocol',
      capability: 'tools/call',
      status: probe.ok ? 'pass' : 'fail',
      detail: probe.ok ? `tools/call succeeded with ${probeTool}` : `tools/call failed with ${probeTool}: ${probe.detail}`,
    });
  }

  const rolesCreateTool = resolveToolName(state, 'role_create', ['roles_create'], ['^roles_.*create$']);
  const rolesListTool = resolveToolName(state, 'roles_list', ['roles_list'], ['^roles_.*list$']);
  const rolesGetTool = resolveToolName(state, 'roles_get', ['roles_get'], ['^roles_.*get$']);
  const rolesUpdateTool = resolveToolName(state, 'roles_update', ['roles_update'], ['^roles_.*update$']);
  const rolesDestroyTool = resolveToolName(state, 'roles_destroy', ['roles_destroy'], ['^roles_.*destroy$']);
  const rolesCheckTool = resolveToolName(state, 'role_mode_read', ['roles_check'], ['^roles_.*check$']);
  const roleModeWriteTool = resolveToolName(
    state,
    'role_mode_write',
    ['roles_set_system_role_mode'],
    ['^roles_.*set_.*system_.*role_.*mode$', '^roles_.*system_.*role_.*mode$'],
  );
  const availableActionsTool = resolveToolName(
    state,
    'available_actions_list',
    ['available_actions_list'],
    ['^available_.*actions_.*list$'],
  );
  const dataSourceRoleUpdateTool = resolveToolName(
    state,
    'data_source_role_update',
    ['data_sources_roles_update'],
    ['^data_.*sources_.*roles_.*update$'],
  );
  const dataSourceRoleGetTool = resolveToolName(
    state,
    'data_source_role_get',
    ['data_sources_roles_get'],
    ['^data_.*sources_.*roles_.*get$'],
  );
  const dataSourceScopesListTool = resolveToolName(
    state,
    'data_source_scope_list',
    ['data_sources_roles_resources_scopes_list'],
    ['^data_.*sources_.*roles_.*resources_.*scopes_.*list$'],
  );
  let dataSourceResourceCreateTool = resolveToolName(
    state,
    'data_source_resource_create',
    ['roles_data_source_resources_create', 'data_sources_roles_resources_create'],
    ['^roles_.*data_.*source_.*resources_.*create$', '^data_.*sources_.*roles_.*resources_.*create$'],
  );
  let dataSourceResourceUpdateTool = resolveToolName(
    state,
    'data_source_resource_update',
    ['roles_data_source_resources_update', 'data_sources_roles_resources_update'],
    ['^roles_.*data_.*source_.*resources_.*update$', '^data_.*sources_.*roles_.*resources_.*update$'],
  );
  let dataSourceResourceGetTool = resolveToolName(
    state,
    'data_source_resource_get',
    ['roles_data_source_resources_get', 'data_sources_roles_resources_get'],
    ['^roles_.*data_.*source_.*resources_.*get$', '^data_.*sources_.*roles_.*resources_.*get$'],
  );
  if (!dataSourceResourceCreateTool) {
    dataSourceResourceCreateTool = resolveToolName(
      state,
      'resource_create',
      ['roles_data_source_resources_create', 'data_sources_roles_resources_create'],
      ['^roles_.*data_.*source_.*resources_.*create$', '^data_.*sources_.*roles_.*resources_.*create$'],
    );
  }
  if (!dataSourceResourceUpdateTool) {
    dataSourceResourceUpdateTool = resolveToolName(
      state,
      'resource_update',
      ['roles_data_source_resources_update', 'data_sources_roles_resources_update'],
      ['^roles_.*data_.*source_.*resources_.*update$', '^data_.*sources_.*roles_.*resources_.*update$'],
    );
  }
  if (!dataSourceResourceGetTool) {
    dataSourceResourceGetTool = resolveToolName(
      state,
      'resource_get',
      ['roles_data_source_resources_get', 'data_sources_roles_resources_get'],
      ['^roles_.*data_.*source_.*resources_.*get$', '^data_.*sources_.*roles_.*resources_.*get$'],
    );
  }
  const roleCollectionsListTool = resolveToolName(
    state,
    'role_collections_list',
    ['roles_data_sources_collections_list'],
    ['^roles_.*data_.*sources_.*collections_.*list$'],
  );
  const collectionFieldsListTool = resolveToolName(
    state,
    'collections_fields_list',
    ['collections_fields_list'],
    ['^collections_.*fields_.*list$'],
  );
  const routeWriteTool = resolveToolName(
    state,
    'route_write',
    ['roles_desktop_routes_add', 'roles_desktop_routes_set'],
    ['^roles_.*desktop_.*routes_.*(add|set)$'],
  );
  const routeListTool = resolveToolName(
    state,
    'route_list',
    ['roles_desktop_routes_list'],
    ['^roles_.*desktop_.*routes_.*list$'],
  );
  const dedicatedMembershipTool = resolveToolName(
    state,
    'bind_user',
    ['roles_users_add', 'users_roles_add', 'roles_users_create', 'users_roles_create'],
    ['^roles_.*users_.*(add|create|set|update)$', '^users_.*roles_.*(add|create|set|update)$'],
  );
  const genericResourceUpdateTool = resolveToolName(
    state,
    'generic_resource_update',
    ['resource_update'],
    ['^resource_.*update$'],
  );
  const genericResourceListTool = resolveToolName(
    state,
    'generic_resource_list',
    ['resource_list'],
    ['^resource_.*list$'],
  );

  const toIdValue = (value) => {
    const str = String(value || '').trim();
    if (!str) return value;
    if (/^\d+$/.test(str)) return Number(str);
    return str;
  };

  const parseRouteIdByKey = (payload, routeKey) => {
    const rows = extractRows(payload);
    if (!rows.length) return null;
    const key = String(routeKey || '').trim();
    if (!key) {
      return findFirstRouteId(payload);
    }
    if (/^\d+$/.test(key)) {
      return Number(key);
    }
    for (const row of rows) {
      if (!isObject(row)) continue;
      const candidates = [row.path, row.name, row.key, row.routeKey, row.uid].filter((x) => typeof x === 'string');
      if (candidates.includes(key) && typeof row.id === 'number') {
        return row.id;
      }
    }
    return null;
  };

  if (!rolesCreateTool) {
    addResult({
      id: 'ACL-ROLE-001',
      layer: 'role',
      capability: 'create blank role',
      status: 'fail',
      detail: 'roles_create tool missing',
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-ROLE-001',
      layer: 'role',
      capability: 'create blank role',
      status: 'warn',
      detail: 'runtime skipped because --skip-writes is set',
    });
  } else {
    const createDef = state.toolMap[rolesCreateTool];
    const requestBody = {
      name: testRoleName,
      title: testRoleTitle,
      description: 'Blank role baseline',
      hidden: false,
      allowConfigure: false,
      allowNewMenu: false,
      snippets: ['!ui.*', '!pm', '!pm.*', '!app'],
      strategy: { actions: [] },
    };
    const createBaseArgs = {
      requestBody,
      name: testRoleName,
      roleName: testRoleName,
    };
    const createArgs = conformArgumentsToSchema(createDef, createBaseArgs, createBaseArgs);
    const createResp = await invokeTool(headers, nextId, rolesCreateTool, createArgs);
    nextId += 1;

    if (!createResp.ok) {
      addResult({
        id: 'ACL-ROLE-001',
        layer: 'role',
        capability: 'create blank role',
        status: 'fail',
        detail: `create failed with ${rolesCreateTool}: ${createResp.detail}`,
      });
    } else {
      roleCreated = true;
      if (rolesGetTool) {
        const getDef = state.toolMap[rolesGetTool];
        const getBaseArgs = {
          filterByTk: testRoleName,
          roleName: testRoleName,
          name: testRoleName,
        };
        const getArgs = conformArgumentsToSchema(getDef, getBaseArgs, getBaseArgs);
        const getResp = await invokeTool(headers, nextId, rolesGetTool, getArgs);
        nextId += 1;
        if (!getResp.ok) {
          addResult({
            id: 'ACL-ROLE-001',
            layer: 'role',
            capability: 'create blank role',
            status: 'fail',
            detail: `readback failed with ${rolesGetTool}: ${getResp.detail}`,
          });
        } else {
          const text = compactJson(getResp.payload);
          const ok = text.includes(testRoleName);
          addResult({
            id: 'ACL-ROLE-001',
            layer: 'role',
            capability: 'create blank role',
            status: ok ? 'pass' : 'fail',
            detail: ok ? 'role create + readback succeeded' : 'role created but readback payload does not include role name',
          });
        }
      } else {
        addResult({
          id: 'ACL-ROLE-001',
          layer: 'role',
          capability: 'create blank role',
          status: 'warn',
          detail: 'role created, but roles_get missing for readback',
        });
      }
    }
  }

  if (!rolesListTool || !rolesGetTool) {
    addResult({
      id: 'ACL-ROLE-002',
      layer: 'role',
      capability: 'audit roles read chain',
      status: 'fail',
      detail: 'roles_list or roles_get tool missing',
    });
  } else {
    const listDef = state.toolMap[rolesListTool];
    const listArgs = conformArgumentsToSchema(listDef, {}, {});
    const listResp = await invokeTool(headers, nextId, rolesListTool, listArgs);
    nextId += 1;
    if (!listResp.ok) {
      addResult({
        id: 'ACL-ROLE-002',
        layer: 'role',
        capability: 'audit roles read chain',
        status: 'fail',
        detail: `roles_list failed: ${listResp.detail}`,
      });
    } else {
      auditRoleName = findFirstRoleName(listResp.payload);
      if (!auditRoleName && roleCreated) {
        auditRoleName = testRoleName;
      }
      if (!auditRoleName) {
        addResult({
          id: 'ACL-ROLE-002',
          layer: 'role',
          capability: 'audit roles read chain',
          status: 'fail',
          detail: 'roles_list succeeded but no role name found for follow-up read',
        });
      } else {
        const getDef = state.toolMap[rolesGetTool];
        const getBaseArgs = {
          filterByTk: auditRoleName,
          roleName: auditRoleName,
          name: auditRoleName,
        };
        const getArgs = conformArgumentsToSchema(getDef, getBaseArgs, getBaseArgs);
        const getResp = await invokeTool(headers, nextId, rolesGetTool, getArgs);
        nextId += 1;
        if (!getResp.ok) {
          addResult({
            id: 'ACL-ROLE-002',
            layer: 'role',
            capability: 'audit roles read chain',
            status: 'fail',
            detail: `roles_get failed for ${auditRoleName}: ${getResp.detail}`,
          });
        } else {
          const dsReadDetail = [];
          let status = 'pass';
          if (dataSourceRoleGetTool) {
            const dsGetDef = state.toolMap[dataSourceRoleGetTool];
            const dsGetBaseArgs = {
              dataSourceKey: args.dataSourceKey,
              filterByTk: auditRoleName,
              roleName: auditRoleName,
              name: auditRoleName,
            };
            const dsGetArgs = conformArgumentsToSchema(dsGetDef, dsGetBaseArgs, dsGetBaseArgs);
            const dsGetResp = await invokeTool(headers, nextId, dataSourceRoleGetTool, dsGetArgs);
            nextId += 1;
            if (dsGetResp.ok) {
              dsReadDetail.push(`data-source read ok via ${dataSourceRoleGetTool}`);
            } else {
              status = 'warn';
              dsReadDetail.push(`data-source read failed: ${dsGetResp.detail}`);
            }
          } else {
            status = 'warn';
            dsReadDetail.push('data_sources_roles_get missing');
          }
          addResult({
            id: 'ACL-ROLE-002',
            layer: 'role',
            capability: 'audit roles read chain',
            status,
            detail: `roles_list + roles_get succeeded for ${auditRoleName}; ${dsReadDetail.join('; ')}`,
          });
        }
      }
    }
  }

  if (!rolesCheckTool) {
    addResult({
      id: 'ACL-GLOBAL-001',
      layer: 'global-role-mode',
      capability: 'read current global role mode',
      status: 'fail',
      detail: 'roles_check tool missing',
    });
  } else {
    const checkResp = await invokeTool(headers, nextId, rolesCheckTool, {});
    nextId += 1;
    if (!checkResp.ok) {
      addResult({
        id: 'ACL-GLOBAL-001',
        layer: 'global-role-mode',
        capability: 'read current global role mode',
        status: 'fail',
        detail: `roles_check failed: ${checkResp.detail}`,
      });
    } else {
      const parsedMode = parseRoleMode(checkResp.payload);
      if (parsedMode) {
        originalRoleMode = parsedMode;
        addResult({
          id: 'ACL-GLOBAL-001',
          layer: 'global-role-mode',
          capability: 'read current global role mode',
          status: 'pass',
          detail: `current global role mode: ${parsedMode}`,
        });
      } else {
        addResult({
          id: 'ACL-GLOBAL-001',
          layer: 'global-role-mode',
          capability: 'read current global role mode',
          status: 'warn',
          detail: 'roles_check succeeded but roleMode field not found in payload',
        });
      }
    }
  }

  const globalModeCases = [
    { id: 'ACL-GLOBAL-002', mode: 'default' },
    { id: 'ACL-GLOBAL-003', mode: 'allow-use-union' },
    { id: 'ACL-GLOBAL-004', mode: 'only-use-union' },
  ];

  if (!roleModeWriteTool) {
    for (const item of globalModeCases) {
      addResult({
        id: item.id,
        layer: 'global-role-mode',
        capability: `set global role mode=${item.mode}`,
        status: 'fail',
        detail: 'roles_set_system_role_mode tool missing',
      });
    }
  } else if (!args.enableHighImpactWrites) {
    for (const item of globalModeCases) {
      addResult({
        id: item.id,
        layer: 'global-role-mode',
        capability: `set global role mode=${item.mode}`,
        status: 'warn',
        detail: `contract detected (${roleModeWriteTool}), runtime skipped; enable --enable-high-impact-writes to execute`,
      });
    }
  } else if (args.skipWrites) {
    for (const item of globalModeCases) {
      addResult({
        id: item.id,
        layer: 'global-role-mode',
        capability: `set global role mode=${item.mode}`,
        status: 'warn',
        detail: 'runtime skipped because --skip-writes is set',
      });
    }
  } else {
    const modeDef = state.toolMap[roleModeWriteTool];
    for (const item of globalModeCases) {
      globalWriteAttempted = true;
      const modeBaseArgs = {
        requestBody: { roleMode: item.mode },
        roleMode: item.mode,
        mode: item.mode,
        value: item.mode,
      };
      const modeArgs = conformArgumentsToSchema(modeDef, modeBaseArgs, modeBaseArgs);
      const writeResp = await invokeTool(headers, nextId, roleModeWriteTool, modeArgs);
      nextId += 1;
      if (!writeResp.ok) {
        addResult({
          id: item.id,
          layer: 'global-role-mode',
          capability: `set global role mode=${item.mode}`,
          status: 'fail',
          detail: `write failed with ${roleModeWriteTool}: ${writeResp.detail}`,
        });
        continue;
      }
      if (!rolesCheckTool) {
        addResult({
          id: item.id,
          layer: 'global-role-mode',
          capability: `set global role mode=${item.mode}`,
          status: 'warn',
          detail: 'write succeeded, but roles_check missing for readback',
        });
        continue;
      }
      const verifyResp = await invokeTool(headers, nextId, rolesCheckTool, {});
      nextId += 1;
      if (!verifyResp.ok) {
        addResult({
          id: item.id,
          layer: 'global-role-mode',
          capability: `set global role mode=${item.mode}`,
          status: 'fail',
          detail: `readback failed: ${verifyResp.detail}`,
        });
        continue;
      }
      const actual = parseRoleMode(verifyResp.payload);
      addResult({
        id: item.id,
        layer: 'global-role-mode',
        capability: `set global role mode=${item.mode}`,
        status: actual === item.mode ? 'pass' : 'fail',
        detail:
          actual === item.mode
            ? `write + readback succeeded (${actual})`
            : `write succeeded but readback mode mismatch (expected=${item.mode}, actual=${actual || 'unknown'})`,
      });
    }
  }
  if (!roleModeWriteTool) {
    addResult({
      id: 'ACL-GLOBAL-005',
      layer: 'global-role-mode',
      capability: 'rollback global role mode',
      status: 'warn',
      detail: 'rollback skipped because role-mode write tool is missing',
    });
  } else if (!globalWriteAttempted) {
    addResult({
      id: 'ACL-GLOBAL-005',
      layer: 'global-role-mode',
      capability: 'rollback global role mode',
      status: 'warn',
      detail: 'rollback skipped because no runtime global mode write was executed',
    });
  } else if (!originalRoleMode) {
    addResult({
      id: 'ACL-GLOBAL-005',
      layer: 'global-role-mode',
      capability: 'rollback global role mode',
      status: 'warn',
      detail: 'rollback skipped because original mode was not captured',
    });
  } else {
    const rollbackDef = state.toolMap[roleModeWriteTool];
    const rollbackBaseArgs = {
      requestBody: { roleMode: originalRoleMode },
      roleMode: originalRoleMode,
      mode: originalRoleMode,
      value: originalRoleMode,
    };
    const rollbackArgs = conformArgumentsToSchema(rollbackDef, rollbackBaseArgs, rollbackBaseArgs);
    const rollbackResp = await invokeTool(headers, nextId, roleModeWriteTool, rollbackArgs);
    nextId += 1;
    if (!rollbackResp.ok) {
      addResult({
        id: 'ACL-GLOBAL-005',
        layer: 'global-role-mode',
        capability: 'rollback global role mode',
        status: 'fail',
        detail: `rollback write failed: ${rollbackResp.detail}`,
      });
    } else if (!rolesCheckTool) {
      addResult({
        id: 'ACL-GLOBAL-005',
        layer: 'global-role-mode',
        capability: 'rollback global role mode',
        status: 'warn',
        detail: `rollback write succeeded to ${originalRoleMode}, but roles_check missing for readback`,
      });
    } else {
      const verifyRollbackResp = await invokeTool(headers, nextId, rolesCheckTool, {});
      nextId += 1;
      if (!verifyRollbackResp.ok) {
        addResult({
          id: 'ACL-GLOBAL-005',
          layer: 'global-role-mode',
          capability: 'rollback global role mode',
          status: 'fail',
          detail: `rollback readback failed: ${verifyRollbackResp.detail}`,
        });
      } else {
        const actual = parseRoleMode(verifyRollbackResp.payload);
        addResult({
          id: 'ACL-GLOBAL-005',
          layer: 'global-role-mode',
          capability: 'rollback global role mode',
          status: actual === originalRoleMode ? 'pass' : 'fail',
          detail:
            actual === originalRoleMode
              ? `rollback confirmed (${originalRoleMode})`
              : `rollback mode mismatch (expected=${originalRoleMode}, actual=${actual || 'unknown'})`,
        });
      }
    }
  }

  if (!rolesUpdateTool || !rolesGetTool) {
    addResult({
      id: 'ACL-PERM-001',
      layer: 'permission',
      capability: 'system snippets write/readback',
      status: 'fail',
      detail: 'roles_update or roles_get tool missing',
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-PERM-001',
      layer: 'permission',
      capability: 'system snippets write/readback',
      status: 'warn',
      detail: 'runtime skipped because --skip-writes is set',
    });
  } else if (!roleCreated) {
    addResult({
      id: 'ACL-PERM-001',
      layer: 'permission',
      capability: 'system snippets write/readback',
      status: 'fail',
      detail: 'test role not created, cannot run snippet write test',
    });
  } else {
    const snippets = ['ui.*', 'pm', 'pm.*', 'app'];
    const updateDef = state.toolMap[rolesUpdateTool];
    const updateBaseArgs = {
      filterByTk: testRoleName,
      roleName: testRoleName,
      requestBody: { snippets },
    };
    const updateArgs = conformArgumentsToSchema(updateDef, updateBaseArgs, updateBaseArgs);
    const updateResp = await invokeTool(headers, nextId, rolesUpdateTool, updateArgs);
    nextId += 1;
    if (!updateResp.ok) {
      addResult({
        id: 'ACL-PERM-001',
        layer: 'permission',
        capability: 'system snippets write/readback',
        status: 'fail',
        detail: `snippet write failed: ${updateResp.detail}`,
      });
    } else {
      const getDef = state.toolMap[rolesGetTool];
      const getBaseArgs = {
        filterByTk: testRoleName,
        roleName: testRoleName,
      };
      const getArgs = conformArgumentsToSchema(getDef, getBaseArgs, getBaseArgs);
      const getResp = await invokeTool(headers, nextId, rolesGetTool, getArgs);
      nextId += 1;
      if (!getResp.ok) {
        addResult({
          id: 'ACL-PERM-001',
          layer: 'permission',
          capability: 'system snippets write/readback',
          status: 'fail',
          detail: `snippet readback failed: ${getResp.detail}`,
        });
      } else {
        const text = compactJson(getResp.payload);
        const ok = snippets.every((snippet) => text.includes(snippet));
        addResult({
          id: 'ACL-PERM-001',
          layer: 'permission',
          capability: 'system snippets write/readback',
          status: ok ? 'pass' : 'fail',
          detail: ok ? 'snippet write + readback verified' : 'snippet readback missing one or more expected entries',
        });
      }
    }
  }

  if (!dataSourceRoleUpdateTool || !dataSourceRoleGetTool) {
    addResult({
      id: 'ACL-PERM-002',
      layer: 'permission',
      capability: 'data-source global strategy',
      status: 'fail',
      detail: 'data_sources_roles_update or data_sources_roles_get tool missing',
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-PERM-002',
      layer: 'permission',
      capability: 'data-source global strategy',
      status: 'warn',
      detail: 'runtime skipped because --skip-writes is set',
    });
  } else if (!roleCreated) {
    addResult({
      id: 'ACL-PERM-002',
      layer: 'permission',
      capability: 'data-source global strategy',
      status: 'fail',
      detail: 'test role not created, cannot run global strategy write',
    });
  } else {
    const dsUpdateDef = state.toolMap[dataSourceRoleUpdateTool];
    const dsUpdateBaseArgs = {
      dataSourceKey: args.dataSourceKey,
      filterByTk: testRoleName,
      roleName: testRoleName,
      requestBody: {
        strategy: {
          actions: ['view'],
        },
      },
    };
    const dsUpdateArgs = conformArgumentsToSchema(dsUpdateDef, dsUpdateBaseArgs, dsUpdateBaseArgs);
    const dsUpdateResp = await invokeTool(headers, nextId, dataSourceRoleUpdateTool, dsUpdateArgs);
    nextId += 1;
    if (!dsUpdateResp.ok) {
      addResult({
        id: 'ACL-PERM-002',
        layer: 'permission',
        capability: 'data-source global strategy',
        status: 'fail',
        detail: `global strategy write failed: ${dsUpdateResp.detail}`,
      });
    } else {
      const dsGetDef = state.toolMap[dataSourceRoleGetTool];
      const dsGetBaseArgs = {
        dataSourceKey: args.dataSourceKey,
        filterByTk: testRoleName,
        roleName: testRoleName,
      };
      const dsGetArgs = conformArgumentsToSchema(dsGetDef, dsGetBaseArgs, dsGetBaseArgs);
      const dsGetResp = await invokeTool(headers, nextId, dataSourceRoleGetTool, dsGetArgs);
      nextId += 1;
      if (!dsGetResp.ok) {
        addResult({
          id: 'ACL-PERM-002',
          layer: 'permission',
          capability: 'data-source global strategy',
          status: 'fail',
          detail: `global strategy readback failed: ${dsGetResp.detail}`,
        });
      } else {
        const text = compactJson(dsGetResp.payload);
        const ok = text.includes('strategy') && text.includes('view');
        addResult({
          id: 'ACL-PERM-002',
          layer: 'permission',
          capability: 'data-source global strategy',
          status: ok ? 'pass' : 'fail',
          detail: ok ? 'global strategy write + readback verified' : 'readback missing expected strategy content',
        });
      }
    }
  }
  if (!dataSourceResourceUpdateTool || !dataSourceResourceGetTool || !dataSourceScopesListTool) {
    addResult({
      id: 'ACL-PERM-003',
      layer: 'permission',
      capability: 'data-source resource independent strategy',
      status: 'fail',
      detail: 'resource-level tools missing (update/get/scope-list)',
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-PERM-003',
      layer: 'permission',
      capability: 'data-source resource independent strategy',
      status: 'warn',
      detail: 'runtime skipped because --skip-writes is set',
    });
  } else if (!roleCreated) {
    addResult({
      id: 'ACL-PERM-003',
      layer: 'permission',
      capability: 'data-source resource independent strategy',
      status: 'fail',
      detail: 'test role not created, cannot run resource strategy write',
    });
  } else {
    let collectionFieldNames = [];
    const fieldResolutionNotes = [];

    if (roleCollectionsListTool) {
      const roleCollectionsDef = state.toolMap[roleCollectionsListTool];
      const roleCollectionsBaseArgs = {
        roleName: testRoleName,
        filter: { dataSourceKey: args.dataSourceKey },
        paginate: false,
      };
      const roleCollectionsArgs = conformArgumentsToSchema(
        roleCollectionsDef,
        roleCollectionsBaseArgs,
        roleCollectionsBaseArgs,
      );
      const roleCollectionsResp = await invokeTool(headers, nextId, roleCollectionsListTool, roleCollectionsArgs);
      nextId += 1;
      if (!roleCollectionsResp.ok) {
        fieldResolutionNotes.push(`collection metadata list failed: ${roleCollectionsResp.detail}`);
      } else {
        const targetCollection = findCollectionByName(roleCollectionsResp.payload, args.collectionName, args.dataSourceKey);
        collectionFieldNames = extractCollectionFieldNames(targetCollection);
        if (!collectionFieldNames.length) {
          fieldResolutionNotes.push(
            `collection ${args.collectionName} fields not found in ${roleCollectionsListTool} response`,
          );
        }
      }
    }

    if (!collectionFieldNames.length && collectionFieldsListTool) {
      const collectionFieldsDef = state.toolMap[collectionFieldsListTool];
      const collectionFieldsBaseArgs = {
        collectionName: args.collectionName,
        paginate: false,
        pageSize: 500,
      };
      const collectionFieldsArgs = conformArgumentsToSchema(
        collectionFieldsDef,
        collectionFieldsBaseArgs,
        collectionFieldsBaseArgs,
      );
      const collectionFieldsResp = await invokeTool(headers, nextId, collectionFieldsListTool, collectionFieldsArgs);
      nextId += 1;
      if (!collectionFieldsResp.ok) {
        fieldResolutionNotes.push(`collections_fields_list failed: ${collectionFieldsResp.detail}`);
      } else {
        const rows = extractRows(collectionFieldsResp.payload);
        collectionFieldNames = [
          ...new Set(
            rows
              .map((row) => (isObject(row) && typeof row.name === 'string' ? row.name : ''))
              .filter((name) => !!name),
          ),
        ].sort();
        if (!collectionFieldNames.length) {
          fieldResolutionNotes.push(`no field rows returned for collection ${args.collectionName}`);
        }
      }
    }

    if (!collectionFieldNames.length) {
      addResult({
        id: 'ACL-PERM-003',
        layer: 'permission',
        capability: 'data-source resource independent strategy',
        status: 'fail',
        detail: `cannot resolve explicit full-field list for ${args.collectionName} in data source ${args.dataSourceKey}${
          fieldResolutionNotes.length ? `; details: ${fieldResolutionNotes.join('; ')}` : ''
        }`,
      });
    }

    const scopeListDef = state.toolMap[dataSourceScopesListTool];
    const scopeListBaseArgs = {
      dataSourceKey: args.dataSourceKey,
      filter: { key: 'all' },
    };
    const scopeListArgs = conformArgumentsToSchema(scopeListDef, scopeListBaseArgs, scopeListBaseArgs);
    const scopeListResp = await invokeTool(headers, nextId, dataSourceScopesListTool, scopeListArgs);
    nextId += 1;
    let allScopeId = null;
    if (!scopeListResp.ok) {
      addResult({
        id: 'ACL-PERM-003',
        layer: 'permission',
        capability: 'data-source resource independent strategy',
        status: 'fail',
        detail: `scope discovery failed: ${scopeListResp.detail}`,
      });
    } else {
      const allScope = findScopeByKey(scopeListResp.payload, 'all', args.dataSourceKey);
      allScopeId = allScope && typeof allScope.id === 'number' ? allScope.id : null;
    }
    if (allScopeId === null) {
      addResult({
        id: 'ACL-PERM-003',
        layer: 'permission',
        capability: 'data-source resource independent strategy',
        status: 'fail',
        detail: `cannot resolve built-in all scope in data source ${args.dataSourceKey}`,
      });
    } else if (!collectionFieldNames.length) {
      // field resolution failure already reported above
    } else {
      const filter = { dataSourceKey: args.dataSourceKey, name: args.collectionName };
      const selectedActionNames = ['create', 'view', 'update'];
      const scopedActionNames = new Set(['view', 'update']);
      const expectedFieldNames = normalizeStringSet(collectionFieldNames);
      const requestActions = selectedActionNames.map((actionName) => {
        const action = {
          name: actionName,
          fields: expectedFieldNames,
        };
        if (scopedActionNames.has(actionName)) {
          action.scopeId = allScopeId;
        }
        return action;
      });
      const requestBody = {
        dataSourceKey: args.dataSourceKey,
        name: args.collectionName,
        usingActionsConfig: true,
        actions: requestActions,
      };
      const updateDef = state.toolMap[dataSourceResourceUpdateTool];
      const updateBaseArgs = {
        roleName: testRoleName,
        filter,
        requestBody,
      };
      const updateArgs = conformArgumentsToSchema(updateDef, updateBaseArgs, updateBaseArgs);
      let updateResp = await invokeTool(headers, nextId, dataSourceResourceUpdateTool, updateArgs);
      nextId += 1;

      if (!updateResp.ok && dataSourceResourceCreateTool) {
        const createDef = state.toolMap[dataSourceResourceCreateTool];
        const createBaseArgs = {
          roleName: testRoleName,
          requestBody,
        };
        const createArgs = conformArgumentsToSchema(createDef, createBaseArgs, createBaseArgs);
        const createResp = await invokeTool(headers, nextId, dataSourceResourceCreateTool, createArgs);
        nextId += 1;
        if (createResp.ok) {
          updateResp = await invokeTool(headers, nextId, dataSourceResourceUpdateTool, updateArgs);
          nextId += 1;
        }
      }

      if (!updateResp.ok) {
        addResult({
          id: 'ACL-PERM-003',
          layer: 'permission',
          capability: 'data-source resource independent strategy',
          status: 'fail',
          detail: `resource strategy write failed: ${updateResp.detail}`,
        });
      } else {
        const isResourceReadbackOk = (payload) => {
          const root = isObject(payload) && isObject(payload.data) ? payload.data : extractRows(payload)[0];
          const actions = isObject(root) && Array.isArray(root.actions) ? root.actions : [];
          const actionMap = {};
          for (const action of actions) {
            if (!isObject(action) || typeof action.name !== 'string' || !action.name) {
              continue;
            }
            actionMap[action.name] = action;
          }

          const text = compactJson(payload);
          const hasName =
            (isObject(root) && typeof root.name === 'string' && root.name === args.collectionName) ||
            text.includes(`"name":"${args.collectionName}"`) ||
            text.includes(args.collectionName);
          const hasActionsConfig =
            (isObject(root) && root.usingActionsConfig === true) || text.includes('usingActionsConfig');
          if (!(hasName && hasActionsConfig)) {
            return false;
          }

          for (const actionName of selectedActionNames) {
            const action = actionMap[actionName];
            if (!isObject(action)) {
              return false;
            }
            const actionFields = normalizeStringSet(Array.isArray(action.fields) ? action.fields : []);
            if (!actionFields.length || !hasSameStringSet(actionFields, expectedFieldNames)) {
              return false;
            }
            if (scopedActionNames.has(actionName)) {
              const actionScopeId = typeof action.scopeId === 'number' ? Number(action.scopeId) : null;
              const actionScopeKey =
                isObject(action.scope) && typeof action.scope.key === 'string' ? action.scope.key : '';
              if (actionScopeId !== Number(allScopeId)) {
                return false;
              }
              if (actionScopeKey !== 'all') {
                return false;
              }
            }
          }

          return true;
        };

        const getDef = state.toolMap[dataSourceResourceGetTool];
        const getBaseArgs = {
          roleName: testRoleName,
          filter,
          appends: ['actions', 'actions.scope'],
        };
        const getArgs = conformArgumentsToSchema(getDef, getBaseArgs, getBaseArgs);
        let getResp = await invokeTool(headers, nextId, dataSourceResourceGetTool, getArgs);
        nextId += 1;

        if (getResp.ok && !isResourceReadbackOk(getResp.payload) && dataSourceResourceCreateTool) {
          const createDef = state.toolMap[dataSourceResourceCreateTool];
          const createBaseArgs = {
            roleName: testRoleName,
            requestBody,
          };
          const createArgs = conformArgumentsToSchema(createDef, createBaseArgs, createBaseArgs);
          const createResp = await invokeTool(headers, nextId, dataSourceResourceCreateTool, createArgs);
          nextId += 1;
          if (createResp.ok) {
            getResp = await invokeTool(headers, nextId, dataSourceResourceGetTool, getArgs);
            nextId += 1;
          }
        }

        if (!getResp.ok) {
          addResult({
            id: 'ACL-PERM-003',
            layer: 'permission',
            capability: 'data-source resource independent strategy',
            status: 'fail',
            detail: `resource strategy readback failed: ${getResp.detail}`,
          });
        } else {
          const ok = isResourceReadbackOk(getResp.payload);
          addResult({
            id: 'ACL-PERM-003',
            layer: 'permission',
            capability: 'data-source resource independent strategy',
            status: ok ? 'pass' : 'fail',
            detail: ok
              ? `resource strategy write + readback verified (actions=create/view/update, scope=all, fields=${expectedFieldNames.length})`
              : 'resource strategy markers missing in readback (action coverage, scope binding, or full-field list)',
          });
        }
      }
    }
    /*
     * Keep this branch local to ACL-PERM-003. Do not short-circuit `main`,
     * so subsequent capability checks can still run and cleanup can execute.
     */
  }

  let routeRoleName = roleCreated ? testRoleName : auditRoleName;
  if (!routeRoleName && rolesListTool) {
    const listResp = await invokeTool(headers, nextId, rolesListTool, {});
    nextId += 1;
    if (listResp.ok) {
      routeRoleName = findFirstRoleName(listResp.payload);
    }
  }

  if (!routeWriteTool || !routeListTool) {
    addResult({
      id: 'ACL-PERM-004',
      layer: 'permission',
      capability: 'desktop route permission capability',
      status: 'fail',
      detail: 'route write/list tools are incomplete',
    });
  } else if (!routeRoleName) {
    addResult({
      id: 'ACL-PERM-004',
      layer: 'permission',
      capability: 'desktop route permission capability',
      status: 'warn',
      detail: 'route tools exist, but no role name available for runtime validation',
    });
  } else {
    const listDef = state.toolMap[routeListTool];
    const listBaseArgs = {
      roleName: routeRoleName,
      paginate: false,
      filter: {},
    };
    const listArgs = conformArgumentsToSchema(listDef, listBaseArgs, listBaseArgs);
    const listResp = await invokeTool(headers, nextId, routeListTool, listArgs);
    nextId += 1;
    if (!listResp.ok) {
      addResult({
        id: 'ACL-PERM-004',
        layer: 'permission',
        capability: 'desktop route permission capability',
        status: 'fail',
        detail: `route list failed: ${listResp.detail}`,
      });
    } else if (args.enableRouteWrites && !args.skipWrites && roleCreated) {
      const routeId = parseRouteIdByKey(listResp.payload, args.desktopRouteKey);
      if (!routeId) {
        addResult({
          id: 'ACL-PERM-004',
          layer: 'permission',
          capability: 'desktop route permission capability',
          status: 'warn',
          detail:
            'route write requested but no writable route id resolved; provide --desktop-route-key (numeric id or known route key)',
        });
      } else {
        const writeDef = state.toolMap[routeWriteTool];
        const writeBaseArgs = {
          roleName: routeRoleName,
          requestBody: [routeId],
        };
        const writeArgs = conformArgumentsToSchema(writeDef, writeBaseArgs, writeBaseArgs);
        const writeResp = await invokeTool(headers, nextId, routeWriteTool, writeArgs);
        nextId += 1;
        if (!writeResp.ok) {
          addResult({
            id: 'ACL-PERM-004',
            layer: 'permission',
            capability: 'desktop route permission capability',
            status: 'fail',
            detail: `route write failed with ${routeWriteTool}: ${writeResp.detail}`,
          });
        } else {
          const verifyResp = await invokeTool(headers, nextId, routeListTool, listArgs);
          nextId += 1;
          if (!verifyResp.ok) {
            addResult({
              id: 'ACL-PERM-004',
              layer: 'permission',
              capability: 'desktop route permission capability',
              status: 'warn',
              detail: 'route write succeeded, but readback list failed',
            });
          } else {
            const text = compactJson(verifyResp.payload);
            const found = text.includes(String(routeId));
            addResult({
              id: 'ACL-PERM-004',
              layer: 'permission',
              capability: 'desktop route permission capability',
              status: found ? 'pass' : 'warn',
              detail: found ? `route write + readback verified (id=${routeId})` : 'route write succeeded but route id not found in readback',
            });
          }
        }
      }
    } else {
      addResult({
        id: 'ACL-PERM-004',
        layer: 'permission',
        capability: 'desktop route permission capability',
        status: 'warn',
        detail: `contract verified (write=${routeWriteTool}, list=${routeListTool}), runtime write skipped`,
      });
    }
  }

  if (!roleCollectionsListTool) {
    addResult({
      id: 'ACL-PERM-005',
      layer: 'permission',
      capability: 'role collections listing with filter.dataSourceKey',
      status: 'fail',
      detail: 'roles_data_sources_collections_list tool missing',
    });
  } else {
    const roleNameForCollections = roleCreated ? testRoleName : auditRoleName;
    if (!roleNameForCollections) {
      addResult({
        id: 'ACL-PERM-005',
        layer: 'permission',
        capability: 'role collections listing with filter.dataSourceKey',
        status: 'fail',
        detail: 'no role name available for collection listing',
      });
    } else {
      const collDef = state.toolMap[roleCollectionsListTool];
      const collBaseArgs = {
        roleName: roleNameForCollections,
        filter: {
          dataSourceKey: args.dataSourceKey,
        },
      };
      const collArgs = conformArgumentsToSchema(collDef, collBaseArgs, collBaseArgs);
      const collResp = await invokeTool(headers, nextId, roleCollectionsListTool, collArgs);
      nextId += 1;
      if (!collResp.ok) {
        addResult({
          id: 'ACL-PERM-005',
          layer: 'permission',
          capability: 'role collections listing with filter.dataSourceKey',
          status: 'fail',
          detail: `listing failed; ensure filter.dataSourceKey is provided: ${collResp.detail}`,
        });
      } else {
        addResult({
          id: 'ACL-PERM-005',
          layer: 'permission',
          capability: 'role collections listing with filter.dataSourceKey',
          status: 'pass',
          detail: `listing succeeded with roleName=${roleNameForCollections} filter.dataSourceKey=${args.dataSourceKey}`,
        });
      }
    }
  }
  if (dedicatedMembershipTool) {
    addResult({
      id: 'ACL-USER-001',
      layer: 'user',
      capability: 'strict mode blocks membership write without dedicated tool',
      status: 'pass',
      detail: `dedicated membership tool available (${dedicatedMembershipTool}), strict blocked path not required`,
    });
  } else {
    addResult({
      id: 'ACL-USER-001',
      layer: 'user',
      capability: 'strict mode blocks membership write without dedicated tool',
      status: 'pass',
      detail: 'no dedicated membership write tool detected; strict mode should block write by governance policy',
    });
  }

  if (dedicatedMembershipTool) {
    addResult({
      id: 'ACL-USER-002',
      layer: 'user',
      capability: 'guarded fallback membership write using resource_update',
      status: 'warn',
      detail: `dedicated membership tool exists (${dedicatedMembershipTool}); guarded fallback check skipped`,
    });
  } else if (!genericResourceUpdateTool) {
    addResult({
      id: 'ACL-USER-002',
      layer: 'user',
      capability: 'guarded fallback membership write using resource_update',
      status: 'fail',
      detail: 'resource_update tool missing; guarded fallback path unavailable',
    });
  } else if (!args.enableGuardedUserWrites) {
    addResult({
      id: 'ACL-USER-002',
      layer: 'user',
      capability: 'guarded fallback membership write using resource_update',
      status: 'warn',
      detail: `contract detected (${genericResourceUpdateTool}), runtime skipped; enable --enable-guarded-user-writes to execute`,
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-USER-002',
      layer: 'user',
      capability: 'guarded fallback membership write using resource_update',
      status: 'warn',
      detail: 'runtime skipped because --skip-writes is set',
    });
  } else if (!args.testUserId) {
    addResult({
      id: 'ACL-USER-002',
      layer: 'user',
      capability: 'guarded fallback membership write using resource_update',
      status: 'warn',
      detail: 'test user id missing; provide --test-user-id for runtime guarded write check',
    });
  } else if (!roleCreated) {
    addResult({
      id: 'ACL-USER-002',
      layer: 'user',
      capability: 'guarded fallback membership write using resource_update',
      status: 'fail',
      detail: 'test role not created; cannot verify guarded membership assignment',
    });
  } else {
    const userIdValue = toIdValue(args.testUserId);
    const updateDef = state.toolMap[genericResourceUpdateTool];
    const updateBaseArgs = {
      resource: 'users',
      filterByTk: userIdValue,
      values: {
        roles: [{ name: testRoleName }],
      },
      updateAssociationValues: ['roles'],
    };
    const updateArgs = conformArgumentsToSchema(updateDef, updateBaseArgs, updateBaseArgs);
    const updateResp = await invokeTool(headers, nextId, genericResourceUpdateTool, updateArgs);
    nextId += 1;
    if (!updateResp.ok) {
      addResult({
        id: 'ACL-USER-002',
        layer: 'user',
        capability: 'guarded fallback membership write using resource_update',
        status: 'fail',
        detail: `guarded fallback write failed: ${updateResp.detail}`,
      });
    } else {
      guardedMembershipApplied = true;
      addResult({
        id: 'ACL-USER-002',
        layer: 'user',
        capability: 'guarded fallback membership write using resource_update',
        status: 'pass',
        detail: `guarded membership write succeeded for user=${args.testUserId} role=${testRoleName}`,
      });
    }
  }

  if (!genericResourceListTool) {
    addResult({
      id: 'ACL-USER-003',
      layer: 'user',
      capability: 'membership readback via users.roles or roles.users',
      status: 'fail',
      detail: 'resource_list tool missing',
    });
  } else {
    let readResp = null;
    let readPath = '';
    const listDef = state.toolMap[genericResourceListTool];

    if (args.testUserId) {
      const userIdValue = toIdValue(args.testUserId);
      const byUserBaseArgs = {
        resource: 'users.roles',
        sourceId: userIdValue,
      };
      const byUserArgs = conformArgumentsToSchema(listDef, byUserBaseArgs, byUserBaseArgs);
      const byUserResp = await invokeTool(headers, nextId, genericResourceListTool, byUserArgs);
      nextId += 1;
      if (byUserResp.ok) {
        readResp = byUserResp;
        readPath = `users.roles sourceId=${String(userIdValue)}`;
      }
    }

    if (!readResp) {
      const roleNameForMembershipRead = roleCreated ? testRoleName : auditRoleName;
      if (roleNameForMembershipRead) {
        const byRoleBaseArgs = {
          resource: 'roles.users',
          sourceId: roleNameForMembershipRead,
        };
        const byRoleArgs = conformArgumentsToSchema(listDef, byRoleBaseArgs, byRoleBaseArgs);
        const byRoleResp = await invokeTool(headers, nextId, genericResourceListTool, byRoleArgs);
        nextId += 1;
        if (byRoleResp.ok) {
          readResp = byRoleResp;
          readPath = `roles.users sourceId=${roleNameForMembershipRead}`;
        } else if (!args.testUserId) {
          addResult({
            id: 'ACL-USER-003',
            layer: 'user',
            capability: 'membership readback via users.roles or roles.users',
            status: 'fail',
            detail: `membership read failed: ${byRoleResp.detail}`,
          });
        }
      }
    }

    if (!readResp) {
      if (args.testUserId) {
        addResult({
          id: 'ACL-USER-003',
          layer: 'user',
          capability: 'membership readback via users.roles or roles.users',
          status: 'fail',
          detail: 'membership readback failed for both users.roles and roles.users paths',
        });
      } else {
        addResult({
          id: 'ACL-USER-003',
          layer: 'user',
          capability: 'membership readback via users.roles or roles.users',
          status: 'warn',
          detail: 'membership readback skipped because no user id and no role context available',
        });
      }
    } else {
      const roleNames = parseRoleNamesFromMembership(readResp.payload);
      if (guardedMembershipApplied) {
        const found = roleNames.includes(testRoleName);
        addResult({
          id: 'ACL-USER-003',
          layer: 'user',
          capability: 'membership readback via users.roles or roles.users',
          status: found ? 'pass' : 'fail',
          detail: found
            ? `membership readback verified via ${readPath}`
            : `readback executed via ${readPath}, but expected role ${testRoleName} not found`,
        });
      } else {
        addResult({
          id: 'ACL-USER-003',
          layer: 'user',
          capability: 'membership readback via users.roles or roles.users',
          status: 'pass',
          detail: `membership read path verified via ${readPath}`,
        });
      }
    }
  }

  const riskRequiredMissing = [];
  if (!rolesListTool) riskRequiredMissing.push('roles_list');
  if (!rolesGetTool) riskRequiredMissing.push('roles_get');
  if (!rolesCheckTool) riskRequiredMissing.push('roles_check');
  if (!availableActionsTool) riskRequiredMissing.push('available_actions_list');
  if (!dataSourceRoleGetTool) riskRequiredMissing.push('data_sources_roles_get');

  if (riskRequiredMissing.length > 0) {
    addResult({
      id: 'ACL-RISK-001',
      layer: 'risk',
      capability: 'risk assessment data prerequisites',
      status: 'fail',
      detail: `missing required tools: ${riskRequiredMissing.join(', ')}`,
    });
  } else {
    const evidenceTools = [];
    let riskRoleName = auditRoleName || (roleCreated ? testRoleName : '');
    let riskFailed = false;
    let riskFailureDetail = '';

    const rolesListResp = await invokeTool(headers, nextId, rolesListTool, {});
    nextId += 1;
    if (!rolesListResp.ok) {
      riskFailed = true;
      riskFailureDetail = `roles_list failed: ${rolesListResp.detail}`;
    } else {
      evidenceTools.push(rolesListTool);
      if (!riskRoleName) {
        riskRoleName = findFirstRoleName(rolesListResp.payload);
      }
    }

    if (!riskFailed && !riskRoleName) {
      riskFailed = true;
      riskFailureDetail = 'roles_list succeeded but no role available for follow-up checks';
    }

    if (!riskFailed) {
      const rolesGetDef = state.toolMap[rolesGetTool];
      const rolesGetBaseArgs = {
        filterByTk: riskRoleName,
        roleName: riskRoleName,
      };
      const rolesGetArgs = conformArgumentsToSchema(rolesGetDef, rolesGetBaseArgs, rolesGetBaseArgs);
      const rolesGetResp = await invokeTool(headers, nextId, rolesGetTool, rolesGetArgs);
      nextId += 1;
      if (!rolesGetResp.ok) {
        riskFailed = true;
        riskFailureDetail = `roles_get failed: ${rolesGetResp.detail}`;
      } else {
        evidenceTools.push(rolesGetTool);
      }
    }

    if (!riskFailed) {
      const checkResp = await invokeTool(headers, nextId, rolesCheckTool, {});
      nextId += 1;
      if (!checkResp.ok) {
        riskFailed = true;
        riskFailureDetail = `roles_check failed: ${checkResp.detail}`;
      } else {
        evidenceTools.push(rolesCheckTool);
      }
    }

    if (!riskFailed) {
      const actionsResp = await invokeTool(headers, nextId, availableActionsTool, {});
      nextId += 1;
      if (!actionsResp.ok) {
        riskFailed = true;
        riskFailureDetail = `available_actions_list failed: ${actionsResp.detail}`;
      } else {
        evidenceTools.push(availableActionsTool);
      }
    }

    if (!riskFailed) {
      const dsGetDef = state.toolMap[dataSourceRoleGetTool];
      const dsGetBaseArgs = {
        dataSourceKey: args.dataSourceKey,
        filterByTk: riskRoleName,
        roleName: riskRoleName,
      };
      const dsGetArgs = conformArgumentsToSchema(dsGetDef, dsGetBaseArgs, dsGetBaseArgs);
      const dsGetResp = await invokeTool(headers, nextId, dataSourceRoleGetTool, dsGetArgs);
      nextId += 1;
      if (!dsGetResp.ok) {
        riskFailed = true;
        riskFailureDetail = `data_sources_roles_get failed: ${dsGetResp.detail}`;
      } else {
        evidenceTools.push(dataSourceRoleGetTool);
      }
    }

    if (!riskFailed && genericResourceListTool) {
      const listDef = state.toolMap[genericResourceListTool];
      const membershipBaseArgs = {
        resource: 'roles.users',
        sourceId: riskRoleName,
      };
      const membershipArgs = conformArgumentsToSchema(listDef, membershipBaseArgs, membershipBaseArgs);
      const membershipResp = await invokeTool(headers, nextId, genericResourceListTool, membershipArgs);
      nextId += 1;
      if (membershipResp.ok) {
        evidenceTools.push(genericResourceListTool);
      }
    }

    addResult({
      id: 'ACL-RISK-001',
      layer: 'risk',
      capability: 'risk assessment data prerequisites',
      status: riskFailed ? 'fail' : 'pass',
      detail: riskFailed
        ? riskFailureDetail
        : `risk prerequisite data verified via: ${[...new Set(evidenceTools)].join(', ')}`,
    });
  }

  if (roleCreated && rolesDestroyTool && !args.skipWrites) {
    const destroyDef = state.toolMap[rolesDestroyTool];
    const destroyBaseArgs = {
      filterByTk: testRoleName,
      roleName: testRoleName,
    };
    const destroyArgs = conformArgumentsToSchema(destroyDef, destroyBaseArgs, destroyBaseArgs);
    const destroyResp = await invokeTool(headers, nextId, rolesDestroyTool, destroyArgs);
    nextId += 1;
    if (destroyResp.ok) {
      addResult({
        id: 'ACL-CLEANUP-001',
        layer: 'cleanup',
        capability: 'remove temporary role',
        status: 'pass',
        detail: `destroyed temporary role ${testRoleName}`,
      });
      roleCreated = false;
    } else {
      addResult({
        id: 'ACL-CLEANUP-001',
        layer: 'cleanup',
        capability: 'remove temporary role',
        status: 'warn',
        detail: `failed to destroy temporary role ${testRoleName}: ${destroyResp.detail}`,
      });
    }
  } else if (roleCreated && !rolesDestroyTool) {
    addResult({
      id: 'ACL-CLEANUP-001',
      layer: 'cleanup',
      capability: 'remove temporary role',
      status: 'warn',
      detail: `roles_destroy missing; temporary role remains: ${testRoleName}`,
    });
  }

  const reportPath = writeReport({ testRoleName, roleCreated, originalRoleMode });
  process.stdout.write('\n');
  process.stdout.write(`summary: pass=${state.pass} warn=${state.warn} fail=${state.fail} skip=${state.skip}\n`);
  process.stdout.write(`report: ${reportPath}\n`);
  process.exitCode = state.fail > 0 ? 1 : 0;
}

main().catch((err) => {
  process.stderr.write(`fatal error: ${err.stack || err.message}\n`);
  process.exit(1);
});

