#!/usr/bin/env node

/*
 * ACL MCP capability runner (Node version)
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

    const isBoolean = ['skipWrites', 'enableHighImpactWrites', 'enableRouteWrites'].includes(mapped);
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

function modeFromPayloadText(text) {
  if (!text) {
    return '';
  }
  if (text.includes('allow-use-union')) {
    return 'allow-use-union';
  }
  if (text.includes('only-use-union')) {
    return 'only-use-union';
  }
  if (text.includes('"default"')) {
    return 'default';
  }
  return '';
}

function findRoleObject(node, roleName, seen = new Set()) {
  if (node === null || node === undefined) {
    return null;
  }
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return null;
  }
  if (seen.has(node)) {
    return null;
  }
  if (typeof node === 'object') {
    seen.add(node);
  }

  if (isObject(node) && node.name === roleName) {
    return node;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRoleObject(item, roleName, seen);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (isObject(node)) {
    for (const key of Object.keys(node)) {
      const found = findRoleObject(node[key], roleName, seen);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function writeJsonFile(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

  function writeReport({ testRoleName, roleCreated }) {
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
      testRoleName,
      roleCreated,
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
    return {
      ok: true,
      detail: 'ok',
      envelope: methodResult.envelope,
      payload: extractToolPayload(methodResult.envelope),
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
    const reportPath = writeReport({ testRoleName: '', roleCreated: false });
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

  const initResp = await invokeMethod(headers, nextId, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'nocobase-acl-capability-runner-node',
      version: '1.0.0',
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
    const reportPath = writeReport({ testRoleName: '', roleCreated: false });
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
    const reportPath = writeReport({ testRoleName: '', roleCreated: false });
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
    const reportPath = writeReport({ testRoleName: '', roleCreated: false });
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

  const probeTool = resolveToolName(state, '', ['available_actions_list', 'roles_list', 'data_sources_list'], ['_list$']);
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

  const testRoleName = `${args.roleNamePrefix}${makeTimestampForName()}${Math.floor(100 + Math.random() * 900)}`;
  const testRoleTitle = `ACL MCP Test ${testRoleName}`;
  let roleCreated = false;

  const rolesCreateTool = resolveToolName(state, 'role_create', ['roles_create'], ['^roles_.*create$']);
  const rolesListTool = resolveToolName(state, 'roles_list', ['roles_list'], ['^roles_.*list$']);
  const rolesGetTool = resolveToolName(state, 'roles_get', ['roles_get'], ['^roles_.*get$']);
  const rolesUpdateTool = resolveToolName(state, 'roles_update', ['roles_update'], ['^roles_.*update$']);
  const rolesDestroyTool = resolveToolName(state, 'roles_destroy', ['roles_destroy'], ['^roles_.*destroy$']);

  if (!rolesCreateTool || !rolesListTool) {
    addResult({
      id: 'ACL-BASE-001',
      layer: 'base',
      capability: 'create role',
      status: 'fail',
      detail: 'required tools missing: roles_create or roles_list',
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-BASE-001',
      layer: 'base',
      capability: 'create role',
      status: 'warn',
      detail: 'skipped runtime because --skip-writes is set',
    });
  } else {
    const createResp = await invokeTool(headers, nextId, rolesCreateTool, {
      requestBody: { name: testRoleName, title: testRoleTitle },
    });
    nextId += 1;
    if (!createResp.ok) {
      addResult({
        id: 'ACL-BASE-001',
        layer: 'base',
        capability: 'create role',
        status: 'fail',
        detail: `create failed: ${createResp.detail}`,
      });
    } else {
      roleCreated = true;
      const listResp = await invokeTool(headers, nextId, rolesListTool, {});
      nextId += 1;
      if (!listResp.ok) {
        addResult({
          id: 'ACL-BASE-001',
          layer: 'base',
          capability: 'create role',
          status: 'fail',
          detail: `readback failed: ${listResp.detail}`,
        });
      } else if (compactJson(listResp.payload).includes(testRoleName)) {
        addResult({
          id: 'ACL-BASE-001',
          layer: 'base',
          capability: 'create role',
          status: 'pass',
          detail: 'create + readback succeeded',
        });
      } else {
        addResult({
          id: 'ACL-BASE-001',
          layer: 'base',
          capability: 'create role',
          status: 'fail',
          detail: 'role not found in readback payload',
        });
      }
    }
  }

  const bindUserTool = resolveToolName(
    state,
    'bind_user',
    ['roles_users_add', 'roles_users_set', 'roles_users_update', 'users_roles_add', 'users_roles_set', 'users_roles_update'],
    ['^roles_.*users_.*(add|set|update)$', '^users_.*roles_.*(add|set|update)$'],
  );
  if (!bindUserTool) {
    addResult({
      id: 'ACL-BASE-002',
      layer: 'base',
      capability: 'bind user to role',
      status: 'fail',
      detail: 'no role-user binding tool detected',
    });
  } else if (!args.testUserId) {
    addResult({
      id: 'ACL-BASE-002',
      layer: 'base',
      capability: 'bind user to role',
      status: 'warn',
      detail: `tool available (${bindUserTool}) but runtime skipped; provide --test-user-id`,
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-BASE-002',
      layer: 'base',
      capability: 'bind user to role',
      status: 'warn',
      detail: 'skipped runtime because --skip-writes is set',
    });
  } else if (!roleCreated) {
    addResult({
      id: 'ACL-BASE-002',
      layer: 'base',
      capability: 'bind user to role',
      status: 'fail',
      detail: 'test role not created; cannot bind user',
    });
  } else {
    const def = state.toolMap[bindUserTool];
    const baseArgs = {
      dataSourceKey: args.dataSourceKey,
      filterByTk: testRoleName,
      roleName: testRoleName,
      userId: args.testUserId,
      userIds: [args.testUserId],
      requestBody: {
        roleName: testRoleName,
        userId: args.testUserId,
        userIds: [args.testUserId],
      },
    };
    const callArgs = conformArgumentsToSchema(def, baseArgs, baseArgs);
    const bindResp = await invokeTool(headers, nextId, bindUserTool, callArgs);
    nextId += 1;
    if (bindResp.ok) {
      addResult({
        id: 'ACL-BASE-002',
        layer: 'base',
        capability: 'bind user to role',
        status: 'pass',
        detail: `runtime call succeeded with ${bindUserTool}`,
      });
    } else if (/Invalid params|code=-32602/.test(bindResp.detail)) {
      addResult({
        id: 'ACL-BASE-002',
        layer: 'base',
        capability: 'bind user to role',
        status: 'warn',
        detail: `tool exists but argument shape needs override for ${bindUserTool}: ${bindResp.detail}`,
      });
    } else {
      addResult({
        id: 'ACL-BASE-002',
        layer: 'base',
        capability: 'bind user to role',
        status: 'fail',
        detail: `runtime call failed with ${bindUserTool}: ${bindResp.detail}`,
      });
    }
  }

  let defaultRoleTool = resolveToolName(
    state,
    'default_role',
    ['roles_set_default', 'roles_set_default_role', 'roles_default_set'],
    ['^roles_.*default.*(set|update)$'],
  );
  if (!defaultRoleTool && rolesUpdateTool) {
    defaultRoleTool = rolesUpdateTool;
  }

  if (!defaultRoleTool) {
    addResult({
      id: 'ACL-BASE-003',
      layer: 'base',
      capability: 'set default role',
      status: 'fail',
      detail: 'no default-role write tool detected',
    });
  } else if (!args.enableHighImpactWrites) {
    addResult({
      id: 'ACL-BASE-003',
      layer: 'base',
      capability: 'set default role',
      status: 'warn',
      detail: `contract detected (${defaultRoleTool}), runtime skipped; enable --enable-high-impact-writes to execute`,
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-BASE-003',
      layer: 'base',
      capability: 'set default role',
      status: 'warn',
      detail: 'skipped runtime because --skip-writes is set',
    });
  } else if (!roleCreated) {
    addResult({
      id: 'ACL-BASE-003',
      layer: 'base',
      capability: 'set default role',
      status: 'fail',
      detail: 'test role not created; cannot set default',
    });
  } else {
    const def = state.toolMap[defaultRoleTool];
    const baseArgs = {
      filterByTk: testRoleName,
      roleName: testRoleName,
      name: testRoleName,
      requestBody: { default: true },
    };
    const callArgs = conformArgumentsToSchema(def, baseArgs, baseArgs);
    const writeResp = await invokeTool(headers, nextId, defaultRoleTool, callArgs);
    nextId += 1;
    if (!writeResp.ok) {
      addResult({
        id: 'ACL-BASE-003',
        layer: 'base',
        capability: 'set default role',
        status: 'fail',
        detail: `runtime call failed with ${defaultRoleTool}: ${writeResp.detail}`,
      });
    } else if (!rolesListTool) {
      addResult({
        id: 'ACL-BASE-003',
        layer: 'base',
        capability: 'set default role',
        status: 'warn',
        detail: 'write succeeded, but roles_list missing for readback verification',
      });
    } else {
      const checkResp = await invokeTool(headers, nextId, rolesListTool, {});
      nextId += 1;
      if (!checkResp.ok) {
        addResult({
          id: 'ACL-BASE-003',
          layer: 'base',
          capability: 'set default role',
          status: 'fail',
          detail: `readback failed: ${checkResp.detail}`,
        });
      } else {
        const roleObj = findRoleObject(checkResp.payload, testRoleName);
        const directDefault = roleObj && roleObj.default === true;
        const text = compactJson(checkResp.payload);
        const textDefault = text.includes(testRoleName) && /"default"\s*:\s*true/.test(text);
        addResult({
          id: 'ACL-BASE-003',
          layer: 'base',
          capability: 'set default role',
          status: directDefault || textDefault ? 'pass' : 'fail',
          detail:
            directDefault || textDefault
              ? 'default role set and readback confirmed'
              : 'default role write succeeded but readback did not confirm default=true',
        });
      }
    }
  }
  const roleModeWriteTool = resolveToolName(
    state,
    'role_mode_write',
    ['roles_mode_set', 'roles_set_mode', 'role_mode_set'],
    ['mode', '^.*roles.*mode.*(set|update).*$'],
  );
  const roleModeReadTool = resolveToolName(
    state,
    'role_mode_read',
    ['roles_mode_get', 'role_mode_get'],
    ['^.*roles.*mode.*(get|list).*$'],
  );
  const modeCases = [
    { id: 'ACL-BASE-004', mode: 'default' },
    { id: 'ACL-BASE-005', mode: 'allow-use-union' },
    { id: 'ACL-BASE-006', mode: 'only-use-union' },
  ];

  if (!roleModeWriteTool) {
    for (const item of modeCases) {
      addResult({
        id: item.id,
        layer: 'base',
        capability: `role mode ${item.mode}`,
        status: 'fail',
        detail: 'no role-mode write tool detected',
      });
    }
  } else if (!args.enableHighImpactWrites) {
    for (const item of modeCases) {
      addResult({
        id: item.id,
        layer: 'base',
        capability: `role mode ${item.mode}`,
        status: 'warn',
        detail: `contract detected (${roleModeWriteTool}), runtime skipped; enable --enable-high-impact-writes to execute`,
      });
    }
  } else if (args.skipWrites) {
    for (const item of modeCases) {
      addResult({
        id: item.id,
        layer: 'base',
        capability: `role mode ${item.mode}`,
        status: 'warn',
        detail: 'skipped runtime because --skip-writes is set',
      });
    }
  } else {
    const modeDef = state.toolMap[roleModeWriteTool];
    let originalMode = '';
    if (roleModeReadTool) {
      const read = await invokeTool(headers, nextId, roleModeReadTool, {});
      nextId += 1;
      if (read.ok) {
        originalMode = modeFromPayloadText(compactJson(read.payload));
      }
    }

    for (const item of modeCases) {
      const baseArgs = {
        mode: item.mode,
        requestBody: { mode: item.mode },
        value: item.mode,
        name: item.mode,
      };
      const callArgs = conformArgumentsToSchema(modeDef, baseArgs, baseArgs);
      const write = await invokeTool(headers, nextId, roleModeWriteTool, callArgs);
      nextId += 1;
      if (!write.ok) {
        addResult({
          id: item.id,
          layer: 'base',
          capability: `role mode ${item.mode}`,
          status: 'fail',
          detail: `mode write failed with ${roleModeWriteTool}: ${write.detail}`,
        });
        continue;
      }
      if (!roleModeReadTool) {
        addResult({
          id: item.id,
          layer: 'base',
          capability: `role mode ${item.mode}`,
          status: 'warn',
          detail: 'mode write succeeded but no mode-read tool for readback',
        });
        continue;
      }
      const verify = await invokeTool(headers, nextId, roleModeReadTool, {});
      nextId += 1;
      if (!verify.ok) {
        addResult({
          id: item.id,
          layer: 'base',
          capability: `role mode ${item.mode}`,
          status: 'fail',
          detail: `mode readback failed: ${verify.detail}`,
        });
        continue;
      }
      const ok = compactJson(verify.payload).includes(item.mode);
      addResult({
        id: item.id,
        layer: 'base',
        capability: `role mode ${item.mode}`,
        status: ok ? 'pass' : 'warn',
        detail: ok ? 'mode write + readback succeeded' : 'mode write succeeded, but readback payload did not include target mode string',
      });
    }

    if (['default', 'allow-use-union', 'only-use-union'].includes(originalMode)) {
      const baseArgs = {
        mode: originalMode,
        requestBody: { mode: originalMode },
        value: originalMode,
        name: originalMode,
      };
      const restoreArgs = conformArgumentsToSchema(modeDef, baseArgs, baseArgs);
      const restore = await invokeTool(headers, nextId, roleModeWriteTool, restoreArgs);
      nextId += 1;
      addResult({
        id: 'ACL-BASE-007',
        layer: 'base',
        capability: 'role mode rollback',
        status: restore.ok ? 'pass' : 'warn',
        detail: restore.ok
          ? `restored original role mode: ${originalMode}`
          : `failed to restore original role mode: ${restore.detail}`,
      });
    } else {
      addResult({
        id: 'ACL-BASE-007',
        layer: 'base',
        capability: 'role mode rollback',
        status: 'warn',
        detail: 'original mode not captured; rollback skipped',
      });
    }
  }

  const snippetCases = [
    { id: 'ACL-SYS-001', snippet: 'ui.*', capability: 'interface configuration snippet' },
    { id: 'ACL-SYS-002', snippet: 'pm', capability: 'plugin lifecycle snippet' },
    { id: 'ACL-SYS-003', snippet: 'pm.*', capability: 'plugin configuration snippet' },
    { id: 'ACL-SYS-004', snippet: 'app', capability: 'app lifecycle snippet' },
    { id: 'ACL-SYS-005', snippet: 'pm.api-doc.documentation', capability: 'plugin-specific snippet' },
  ];
  if (!rolesUpdateTool) {
    for (const c of snippetCases) {
      addResult({ id: c.id, layer: 'system-snippets', capability: c.capability, status: 'fail', detail: 'roles_update tool missing' });
    }
  } else if (args.skipWrites) {
    for (const c of snippetCases) {
      addResult({ id: c.id, layer: 'system-snippets', capability: c.capability, status: 'warn', detail: 'skipped runtime because --skip-writes is set' });
    }
  } else if (!roleCreated) {
    for (const c of snippetCases) {
      addResult({ id: c.id, layer: 'system-snippets', capability: c.capability, status: 'fail', detail: 'test role not created' });
    }
  } else {
    const snippetSet = ['ui.*', 'pm', 'pm.*', 'app', 'pm.api-doc.documentation'];
    const update = await invokeTool(headers, nextId, rolesUpdateTool, {
      filterByTk: testRoleName,
      requestBody: { snippets: snippetSet },
    });
    nextId += 1;
    if (!update.ok) {
      for (const c of snippetCases) {
        addResult({
          id: c.id,
          layer: 'system-snippets',
          capability: c.capability,
          status: 'fail',
          detail: `snippet update failed: ${update.detail}`,
        });
      }
    } else {
      const readTool = rolesGetTool || rolesListTool;
      const readArgs = readTool === rolesGetTool ? { filterByTk: testRoleName } : {};
      const read = await invokeTool(headers, nextId, readTool, readArgs);
      nextId += 1;
      if (!read.ok) {
        for (const c of snippetCases) {
          addResult({
            id: c.id,
            layer: 'system-snippets',
            capability: c.capability,
            status: 'fail',
            detail: `snippet readback failed: ${read.detail}`,
          });
        }
      } else {
        const text = compactJson(read.payload);
        for (const c of snippetCases) {
          const ok = text.includes(c.snippet);
          addResult({
            id: c.id,
            layer: 'system-snippets',
            capability: c.capability,
            status: ok ? 'pass' : 'fail',
            detail: ok ? `snippet verified: ${c.snippet}` : `snippet missing in readback: ${c.snippet}`,
          });
        }
      }
    }
  }

  const dataSourceRoleUpdateTool = resolveToolName(state, 'data_source_role_update', ['data_sources_roles_update'], ['^data_.*roles_.*update$']);
  const dataSourceRoleGetTool = resolveToolName(state, 'data_source_role_get', ['data_sources_roles_get'], ['^data_.*roles_.*get$']);
  if (!dataSourceRoleUpdateTool || !dataSourceRoleGetTool) {
    addResult({
      id: 'ACL-DS-001',
      layer: 'data-source',
      capability: 'global strategy actions',
      status: 'fail',
      detail: 'required data-source role tools missing',
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-DS-001',
      layer: 'data-source',
      capability: 'global strategy actions',
      status: 'warn',
      detail: 'skipped runtime because --skip-writes is set',
    });
  } else if (!roleCreated) {
    addResult({
      id: 'ACL-DS-001',
      layer: 'data-source',
      capability: 'global strategy actions',
      status: 'fail',
      detail: 'test role not created',
    });
  } else {
    const update = await invokeTool(headers, nextId, dataSourceRoleUpdateTool, {
      dataSourceKey: args.dataSourceKey,
      filterByTk: testRoleName,
      requestBody: { strategy: { actions: ['view'] } },
    });
    nextId += 1;
    if (!update.ok) {
      addResult({
        id: 'ACL-DS-001',
        layer: 'data-source',
        capability: 'global strategy actions',
        status: 'fail',
        detail: `update failed: ${update.detail}`,
      });
    } else {
      const read = await invokeTool(headers, nextId, dataSourceRoleGetTool, {
        dataSourceKey: args.dataSourceKey,
        filterByTk: testRoleName,
      });
      nextId += 1;
      if (!read.ok) {
        addResult({
          id: 'ACL-DS-001',
          layer: 'data-source',
          capability: 'global strategy actions',
          status: 'fail',
          detail: `readback failed: ${read.detail}`,
        });
      } else {
        const text = compactJson(read.payload);
        const ok = text.includes('strategy') && text.includes('view');
        addResult({
          id: 'ACL-DS-001',
          layer: 'data-source',
          capability: 'global strategy actions',
          status: ok ? 'pass' : 'fail',
          detail: ok ? 'strategy update + readback succeeded' : 'readback missing expected strategy actions',
        });
      }
    }
  }
  const dataSourceResourceUpdateTool = resolveToolName(
    state,
    'resource_update',
    ['data_sources_roles_resources_update', 'roles_data_source_resources_update', 'roles_data_sources_resources_update'],
    ['^data_.*roles_.*resources_.*update$', '^roles_.*resources_.*update$'],
  );
  const dataSourceResourceGetTool = resolveToolName(
    state,
    'resource_get',
    ['data_sources_roles_resources_get', 'roles_data_source_resources_get', 'roles_data_sources_resources_get'],
    ['^data_.*roles_.*resources_.*get$', '^roles_.*resources_.*get$'],
  );
  if (!dataSourceResourceUpdateTool || !dataSourceResourceGetTool) {
    addResult({
      id: 'ACL-DS-002',
      layer: 'data-source',
      capability: 'single-table strategy',
      status: 'fail',
      detail: 'required resource-level tools missing',
    });
  } else if (args.skipWrites) {
    addResult({
      id: 'ACL-DS-002',
      layer: 'data-source',
      capability: 'single-table strategy',
      status: 'warn',
      detail: 'skipped runtime because --skip-writes is set',
    });
  } else if (!roleCreated) {
    addResult({
      id: 'ACL-DS-002',
      layer: 'data-source',
      capability: 'single-table strategy',
      status: 'fail',
      detail: 'test role not created',
    });
  } else {
    const updateDef = state.toolMap[dataSourceResourceUpdateTool];
    const getDef = state.toolMap[dataSourceResourceGetTool];
    const requestBody = {
      name: args.collectionName,
      resourceName: args.collectionName,
      usingActionsConfig: true,
      actions: [{ name: 'view' }],
    };
    const baseArgs = {
      dataSourceKey: args.dataSourceKey,
      filterByTk: testRoleName,
      name: args.collectionName,
      resourceName: args.collectionName,
      requestBody,
    };
    const updateArgs = conformArgumentsToSchema(updateDef, baseArgs, baseArgs);
    const update = await invokeTool(headers, nextId, dataSourceResourceUpdateTool, updateArgs);
    nextId += 1;
    if (!update.ok) {
      addResult({
        id: 'ACL-DS-002',
        layer: 'data-source',
        capability: 'single-table strategy',
        status: 'fail',
        detail: `resource update failed: ${update.detail}`,
      });
    } else {
      const readArgs = conformArgumentsToSchema(getDef, baseArgs, baseArgs);
      const read = await invokeTool(headers, nextId, dataSourceResourceGetTool, readArgs);
      nextId += 1;
      if (!read.ok) {
        addResult({
          id: 'ACL-DS-002',
          layer: 'data-source',
          capability: 'single-table strategy',
          status: 'fail',
          detail: `resource readback failed: ${read.detail}`,
        });
      } else {
        const text = compactJson(read.payload);
        const ok = text.includes(args.collectionName) && text.includes('usingActionsConfig');
        addResult({
          id: 'ACL-DS-002',
          layer: 'data-source',
          capability: 'single-table strategy',
          status: ok ? 'pass' : 'fail',
          detail: ok ? 'resource strategy update + readback succeeded' : 'readback missing resource strategy markers',
        });
      }
    }
  }

  const routeWriteTool = resolveToolName(
    state,
    'route_write',
    ['roles_desktop_routes_add', 'roles_desktop_routes_set', 'roles_mobile_routes_add', 'roles_mobile_routes_set'],
    ['^roles_.*routes_.*(add|set|update)$'],
  );
  const routeListTool = resolveToolName(
    state,
    'route_list',
    ['roles_desktop_routes_list', 'roles_mobile_routes_list', 'desktop_routes_list_accessible', 'mobile_routes_list_accessible'],
    ['^roles_.*routes_.*list$', '^.*routes_.*accessible$'],
  );

  if (!routeWriteTool || !routeListTool) {
    addResult({
      id: 'ACL-ROUTE-001',
      layer: 'route',
      capability: 'route permission capability',
      status: 'fail',
      detail: 'route write/list tools are incomplete',
    });
  } else {
    const listDef = state.toolMap[routeListTool];
    const listBaseArgs = {
      filterByTk: testRoleName,
      roleName: testRoleName,
      dataSourceKey: args.dataSourceKey,
    };
    const listArgs = conformArgumentsToSchema(listDef, listBaseArgs, listBaseArgs);
    const listResp = await invokeTool(headers, nextId, routeListTool, listArgs);
    nextId += 1;
    if (!listResp.ok) {
      addResult({
        id: 'ACL-ROUTE-001',
        layer: 'route',
        capability: 'route permission capability',
        status: 'fail',
        detail: `route list call failed: ${listResp.detail}`,
      });
    } else if (args.enableRouteWrites && !args.skipWrites && args.desktopRouteKey && roleCreated) {
      const writeDef = state.toolMap[routeWriteTool];
      const writeBaseArgs = {
        filterByTk: testRoleName,
        roleName: testRoleName,
        dataSourceKey: args.dataSourceKey,
        routeKey: args.desktopRouteKey,
        name: args.desktopRouteKey,
        path: args.desktopRouteKey,
        requestBody: {
          routes: [args.desktopRouteKey],
          routeKey: args.desktopRouteKey,
          path: args.desktopRouteKey,
          name: args.desktopRouteKey,
        },
      };
      const writeArgs = conformArgumentsToSchema(writeDef, writeBaseArgs, writeBaseArgs);
      const writeResp = await invokeTool(headers, nextId, routeWriteTool, writeArgs);
      nextId += 1;
      if (!writeResp.ok) {
        if (/Invalid params|code=-32602/.test(writeResp.detail)) {
          addResult({
            id: 'ACL-ROUTE-001',
            layer: 'route',
            capability: 'route permission capability',
            status: 'warn',
            detail: `route write tool exists, but argument shape needs override for ${routeWriteTool}: ${writeResp.detail}`,
          });
        } else {
          addResult({
            id: 'ACL-ROUTE-001',
            layer: 'route',
            capability: 'route permission capability',
            status: 'fail',
            detail: `route write failed: ${writeResp.detail}`,
          });
        }
      } else {
        const verifyResp = await invokeTool(headers, nextId, routeListTool, listArgs);
        nextId += 1;
        if (!verifyResp.ok) {
          addResult({
            id: 'ACL-ROUTE-001',
            layer: 'route',
            capability: 'route permission capability',
            status: 'warn',
            detail: 'route write succeeded, but readback failed',
          });
        } else {
          const found = compactJson(verifyResp.payload).includes(args.desktopRouteKey);
          addResult({
            id: 'ACL-ROUTE-001',
            layer: 'route',
            capability: 'route permission capability',
            status: found ? 'pass' : 'warn',
            detail: found ? 'route write + readback succeeded' : 'route write succeeded, route key not found in readback payload',
          });
        }
      }
    } else {
      addResult({
        id: 'ACL-ROUTE-001',
        layer: 'route',
        capability: 'route permission capability',
        status: 'warn',
        detail: `contract verified (write=${routeWriteTool} list=${routeListTool}), runtime write skipped`,
      });
    }
  }

  if (roleCreated && rolesDestroyTool && !args.skipWrites) {
    const destroy = await invokeTool(headers, nextId, rolesDestroyTool, { filterByTk: testRoleName });
    nextId += 1;
    if (destroy.ok) {
      addResult({
        id: 'ACL-CLEANUP-001',
        layer: 'cleanup',
        capability: 'remove temporary role',
        status: 'pass',
        detail: `destroyed role ${testRoleName}`,
      });
      roleCreated = false;
    } else {
      addResult({
        id: 'ACL-CLEANUP-001',
        layer: 'cleanup',
        capability: 'remove temporary role',
        status: 'warn',
        detail: `failed to destroy role ${testRoleName}: ${destroy.detail}`,
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

  const reportPath = writeReport({ testRoleName, roleCreated });
  process.stdout.write('\n');
  process.stdout.write(`summary: pass=${state.pass} warn=${state.warn} fail=${state.fail} skip=${state.skip}\n`);
  process.stdout.write(`report: ${reportPath}\n`);
  process.exitCode = state.fail > 0 ? 1 : 0;
}

main().catch((err) => {
  process.stderr.write(`fatal error: ${err.stack || err.message}\n`);
  process.exit(1);
});

