#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ACTIONS = new Set(['add', 'use', 'current', 'list']);
const SCOPES = new Set(['project', 'global']);
const PREFERS = new Set(['auto', 'global', 'local']);
const AUTH_MODES = new Set(['oauth', 'token']);
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0:0:0:0:0:0:0:1',
  'host.docker.internal',
]);
const PLACEHOLDER_TOKEN_PATTERNS = [
  'test_token',
  'for_syntax',
  'placeholder',
  'dummy',
  'example',
  'changeme',
  'token_here',
  'your_token',
];
const CLI_DEPENDENCY_PLUGINS_BY_AUTH_MODE = {
  oauth: ['@nocobase/plugin-api-doc', '@nocobase/plugin-idp-oauth'],
  token: ['@nocobase/plugin-api-doc', '@nocobase/plugin-api-keys'],
};
const CLI_PM_APP_SERVICE = 'app';
const API_DOC_ERROR_PATTERNS = [
  'swagger:get',
  'api documentation plugin',
  'plugin-api-doc',
  'api-doc',
];
const AUTH_ERROR_PATTERNS = [
  '401',
  '403',
  'auth required',
  'missing token',
  'invalid api token',
  'invalid token',
  'invalid_token',
  'token expired',
  'session expired',
  'expired',
  'access denied',
  'plugin-api-keys',
  'api key',
];
const OAUTH_DEP_ERROR_PATTERNS = [
  'plugin-idp-oauth',
  'idpoauth',
  'oauth',
  'oauth-authorization-server',
  '.well-known/oauth-authorization-server',
];
const ALREADY_ENABLED_PATTERNS = [
  'already enabled',
  'has been enabled',
  'is enabled',
  'enabled already',
];

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUN_CTL_PATH = path.join(THIS_DIR, 'run-ctl.mjs');

function printHelp() {
  const lines = [
    'Usage:',
    '  node ./scripts/env-manage.mjs add --name <env> --url <base-url> [--auth-mode oauth|token] [--token <token>] [--token-env <ENV_NAME>] [--scope project|global] [--base-dir <dir>]',
    '  node ./scripts/env-manage.mjs use --name <env> [--scope project|global] [--base-dir <dir>]',
    '  node ./scripts/env-manage.mjs current [--scope project|global] [--base-dir <dir>]',
    '  node ./scripts/env-manage.mjs list [--scope project|global] [--base-dir <dir>]',
    '',
    'Rules:',
    '  - add defaults to OAuth auth-mode unless token args are provided without --auth-mode.',
    '  - oauth mode: local dependencies are api-doc + idp-oauth, then env auth + env update.',
    '  - token mode: local URLs require auto-acquired token; remote URLs require manual token input.',
    '  - add always runs env update for connectivity verification; update failure means add failure.',
    '  - Local add auto-recovers dependencies by auth-mode plugin bundle and retries.',
    '',
    'Examples:',
    '  node ./scripts/env-manage.mjs add --name local --url http://localhost:13000/api --scope project',
    '  node ./scripts/env-manage.mjs add --name staging --url https://demo.example.com/api --token-env NOCOBASE_API_TOKEN --scope project',
    '  node ./scripts/env-manage.mjs use --name local --scope project',
    '  node ./scripts/env-manage.mjs current --scope project',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function failValidation(message, details = {}) {
  const payload = {
    ok: false,
    error_code: 'ENV_MANAGE_INVALID_INPUT',
    message,
    ...details,
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(2);
}

function failRuntime(message, details = {}) {
  const payload = {
    ok: false,
    error_code: 'ENV_MANAGE_RUNTIME_ERROR',
    message,
    ...details,
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}

function parseArgValue(argv, index, flagName) {
  const value = argv[index + 1];
  if (!value) {
    failValidation(`Missing value for ${flagName}`);
  }
  return value;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const action = argv[0];
  if (!ACTIONS.has(action)) {
    failValidation(`Unknown action "${action}". Expected one of: ${[...ACTIONS].join(', ')}`);
  }

  const options = {
    action,
    name: '',
    url: '',
    authMode: 'oauth',
    authModeExplicit: false,
    token: '',
    tokenEnv: '',
    scope: 'project',
    baseDir: process.cwd(),
    prefer: 'auto',
    debug: false,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--debug') {
      options.debug = true;
      continue;
    }

    if (arg === '--name' || arg === '-n') {
      options.name = parseArgValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--name=')) {
      options.name = arg.slice('--name='.length);
      continue;
    }

    if (arg === '--url' || arg === '--base-url') {
      options.url = parseArgValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      options.url = arg.slice('--base-url='.length);
      continue;
    }

    if (arg === '--token' || arg === '-t') {
      options.token = parseArgValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--token=')) {
      options.token = arg.slice('--token='.length);
      continue;
    }

    if (arg === '--token-env') {
      options.tokenEnv = parseArgValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--token-env=')) {
      options.tokenEnv = arg.slice('--token-env='.length);
      continue;
    }

    if (arg === '--auth-mode') {
      options.authMode = parseArgValue(argv, i, arg).toLowerCase();
      options.authModeExplicit = true;
      i += 1;
      continue;
    }
    if (arg.startsWith('--auth-mode=')) {
      options.authMode = arg.slice('--auth-mode='.length).toLowerCase();
      options.authModeExplicit = true;
      continue;
    }

    if (arg === '--scope' || arg === '-s') {
      options.scope = parseArgValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--scope=')) {
      options.scope = arg.slice('--scope='.length);
      continue;
    }

    if (arg === '--base-dir') {
      options.baseDir = parseArgValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--base-dir=')) {
      options.baseDir = arg.slice('--base-dir='.length);
      continue;
    }

    if (arg === '--prefer') {
      options.prefer = parseArgValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--prefer=')) {
      options.prefer = arg.slice('--prefer='.length);
      continue;
    }

    failValidation(`Unknown argument: ${arg}`);
  }

  if (!SCOPES.has(options.scope)) {
    failValidation(`Invalid scope "${options.scope}". Expected project|global.`);
  }
  if (!PREFERS.has(options.prefer)) {
    failValidation(`Invalid prefer "${options.prefer}". Expected auto|global|local.`);
  }
  if (!AUTH_MODES.has(options.authMode)) {
    failValidation(`Invalid auth mode "${options.authMode}". Expected oauth|token.`);
  }

  options.baseDir = path.resolve(options.baseDir);

  if (options.action === 'add') {
    if (!options.name) {
      failValidation('Missing required --name for add action.');
    }
    if (!options.url) {
      failValidation('Missing required --url/--base-url for add action.');
    }
    if (!options.authModeExplicit && (options.token || options.tokenEnv)) {
      options.authMode = 'token';
    }
  }

  if (options.action === 'use' && !options.name) {
    failValidation('Missing required --name for use action.');
  }

  return options;
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function isLocalHost(hostname) {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) {
    return true;
  }
  return host.endsWith('.localhost');
}

function normalizeBaseUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch (error) {
    failValidation(`Invalid URL "${inputUrl}".`, { detail: error.message });
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    failValidation(`Unsupported URL protocol "${parsed.protocol}". Only http/https are allowed.`);
  }

  let pathname = parsed.pathname || '/';
  pathname = pathname.replace(/\/+$/g, '');
  if (pathname.length === 0) {
    pathname = '/api';
  } else if (!pathname.endsWith('/api')) {
    pathname = `${pathname}/api`;
  }

  parsed.pathname = pathname;
  parsed.search = '';
  parsed.hash = '';

  return {
    baseUrl: parsed.toString(),
    hostname: parsed.hostname,
    isLocal: isLocalHost(parsed.hostname),
  };
}

function deriveAdminUrlsFromApiBase(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    let pathname = parsed.pathname || '';
    pathname = pathname.replace(/\/+$/g, '');
    if (pathname.endsWith('/api')) {
      pathname = pathname.slice(0, -4);
    }
    if (pathname === '/') {
      pathname = '';
    }
    const prefix = pathname || '';
    const adminRoot = `${parsed.origin}${prefix}/admin`;
    return {
      admin_root_url: adminRoot,
      plugin_manager_url: `${adminRoot}/settings/plugin-manager`,
      api_keys_url: `${adminRoot}/settings/api-keys`,
    };
  } catch {
    return {
      admin_root_url: '',
      plugin_manager_url: '',
      api_keys_url: '',
    };
  }
}

function getCliDependencyPluginsForAuthMode(authMode) {
  return CLI_DEPENDENCY_PLUGINS_BY_AUTH_MODE[authMode] || CLI_DEPENDENCY_PLUGINS_BY_AUTH_MODE.oauth;
}

function buildPluginEnableHint(plugins) {
  return `Use $nocobase-plugin-manage enable ${plugins.join(' ')}`;
}

function buildNodeScriptCommand(scriptPath, scriptArgs = []) {
  return ['node', scriptPath, ...scriptArgs].join(' ');
}

function buildRunCtlCommand(options, ctlArgs) {
  return buildNodeScriptCommand(RUN_CTL_PATH, ['--base-dir', options.baseDir, '--', ...ctlArgs]);
}

function buildEnvManageCommand(options, args) {
  return buildNodeScriptCommand(path.join(THIS_DIR, 'env-manage.mjs'), [...args, '--base-dir', options.baseDir]);
}

async function probeOauthMetadata(baseUrl) {
  const url = `${baseUrl.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`;
  try {
    const response = await fetch(url);
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    const hasAuthorizeEndpoint = Boolean(
      data
      && typeof data === 'object'
      && typeof data.authorization_endpoint === 'string'
      && data.authorization_endpoint.length > 0,
    );
    return {
      ok: response.ok && hasAuthorizeEndpoint,
      status: response.status,
      url,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      data: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildRemoteTokenGuide(options, normalized, reason) {
  const urls = deriveAdminUrlsFromApiBase(normalized.baseUrl);
  return {
    reason,
    plugin_name: '@nocobase/plugin-api-keys',
    plugin_manager_url: urls.plugin_manager_url,
    api_keys_url: urls.api_keys_url,
    steps: [
      'Open Plugin Manager and ensure @nocobase/plugin-api-keys is enabled.',
      'Open API Keys settings and click Add API Key to generate a token.',
      'Copy the token and rerun env-manage add with --token (or --token-env).',
    ],
    rerun_examples: [
      buildEnvManageCommand(options, ['add', '--name', options.name, '--url', normalized.baseUrl, '--token', '<your_token>', '--scope', options.scope]),
      buildEnvManageCommand(options, ['add', '--name', options.name, '--url', normalized.baseUrl, '--token-env', 'NOCOBASE_API_TOKEN', '--scope', options.scope]),
    ],
    token_env_examples: {
      powershell: "$env:NOCOBASE_API_TOKEN='<your_token>'",
      bash: "export NOCOBASE_API_TOKEN='<your_token>'",
    },
  };
}

function buildRemoteOauthGuide(options, normalized, reason) {
  const urls = deriveAdminUrlsFromApiBase(normalized.baseUrl);
  const requiredPlugins = getCliDependencyPluginsForAuthMode('oauth');
  return {
    reason,
    required_plugins: requiredPlugins,
    plugin_manager_url: urls.plugin_manager_url,
    oauth_metadata_url: `${normalized.baseUrl.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`,
    steps: [
      'Open Plugin Manager and ensure @nocobase/plugin-api-doc and @nocobase/plugin-idp-oauth are enabled.',
      'Restart app if plugin state changed.',
      'Run env auth in an interactive terminal to complete OAuth login (it opens browser automatically, or prints an authorization URL).',
    ],
    rerun_examples: [
      buildEnvManageCommand(options, ['add', '--name', options.name, '--url', normalized.baseUrl, '--auth-mode', 'oauth', '--scope', options.scope]),
      buildRunCtlCommand(options, ['env', 'auth', '-e', options.name, '-s', options.scope]),
    ],
  };
}

function maskSensitiveArgs(args) {
  const masked = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--token') {
      masked.push(arg);
      if (i + 1 < args.length) {
        masked.push('***');
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--token=')) {
      masked.push('--token=***');
      continue;
    }
    masked.push(arg);
  }
  return masked;
}

function buildCtlCommandArgs(options, ctlArgs) {
  return [
    RUN_CTL_PATH,
    '--base-dir',
    options.baseDir,
    '--prefer',
    options.prefer,
    '--',
    ...ctlArgs,
  ];
}

function runCtl(ctlArgs, options) {
  const commandArgs = buildCtlCommandArgs(options, ctlArgs);

  if (options.debug) {
    process.stderr.write(`env-manage debug: ${process.execPath} ${commandArgs.join(' ')}\n`);
  }

  const result = spawnSync(process.execPath, commandArgs, {
    encoding: 'utf8',
    cwd: options.baseDir,
    env: process.env,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : '',
    command: [process.execPath, ...maskSensitiveArgs(commandArgs)],
  };
}

async function runCtlWithLiveOutput(ctlArgs, options) {
  const commandArgs = buildCtlCommandArgs(options, ctlArgs);

  if (options.debug) {
    process.stderr.write(`env-manage debug: ${process.execPath} ${commandArgs.join(' ')}\n`);
  }

  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let errorMessage = '';
    let settled = false;

    const child = spawn(process.execPath, commandArgs, {
      cwd: options.baseDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stderr.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      errorMessage = error instanceof Error ? error.message : String(error);
      resolve({
        exitCode: 1,
        stdout,
        stderr,
        error: errorMessage,
        command: [process.execPath, ...maskSensitiveArgs(commandArgs)],
      });
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        error: errorMessage,
        command: [process.execPath, ...maskSensitiveArgs(commandArgs)],
      });
    });
  });
}

function parseEnvRows(tableText) {
  const cleanText = stripAnsi(tableText || '');
  const lines = cleanText
    .split(/\r?\n/g)
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.trim().length > 0);

  const headerIndex = lines.findIndex((line) => line.includes('Name') && line.includes('Base URL'));
  if (headerIndex === -1) {
    return [];
  }

  const header = lines[headerIndex];
  const hasCurrentColumn = header.includes('Current');
  const rows = [];

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^-{3,}/.test(line.replace(/\s+/g, ''))) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split(/\s{2,}/g);
    if (hasCurrentColumn) {
      let currentMark = '';
      let name = '';
      let baseUrl = '';
      let runtime = '';

      if (parts[0] === '*') {
        currentMark = '*';
        name = parts[1] || '';
        baseUrl = parts[2] || '';
        runtime = parts.slice(3).join(' ');
      } else {
        name = parts[0] || '';
        baseUrl = parts[1] || '';
        runtime = parts.slice(2).join(' ');
      }

      if (!name || !baseUrl) {
        continue;
      }

      rows.push({
        name,
        base_url: baseUrl,
        runtime: runtime || '',
        is_current: currentMark === '*',
      });
      continue;
    }

    const name = parts[0] || '';
    const baseUrl = parts[1] || '';
    const runtime = parts.slice(2).join(' ');
    if (!name || !baseUrl) {
      continue;
    }
    rows.push({
      name,
      base_url: baseUrl,
      runtime: runtime || '',
      is_current: false,
    });
  }

  return rows;
}

function getEnvList(options) {
  const result = runCtl(['env', 'list', '-s', options.scope], options);
  if (result.exitCode !== 0) {
    failRuntime('Failed to list environments.', {
      scope: options.scope,
      ctl: result,
    });
  }
  return {
    rows: parseEnvRows(result.stdout),
    raw: result,
  };
}

function getCurrentState(options) {
  const listState = getEnvList(options);
  let current = listState.rows.find((row) => row.is_current);

  if (!current && listState.rows.length === 1) {
    current = listState.rows[0];
  }

  if (!current) {
    const fallback = runCtl(['env', '-s', options.scope], options);
    if (fallback.exitCode === 0) {
      const parsed = parseEnvRows(fallback.stdout);
      if (parsed.length > 0) {
        current = parsed[0];
      }
    }
  }

  return {
    scope: options.scope,
    base_dir: options.baseDir,
    current_env_name: current ? current.name : '',
    current_base_url: current ? current.base_url : '',
    is_local: current ? normalizeBaseUrl(current.base_url).isLocal : null,
    has_token: null,
    available_envs: listState.rows,
  };
}

function printResult(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function runCommand(command, args, baseDir, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: baseDir,
    env: process.env,
    timeout: options.timeoutMs || 0,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : '',
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
    command: [command, ...args],
  };
}

function commandOutputText(commandResult) {
  return stripAnsi(`${commandResult.stdout || ''}\n${commandResult.stderr || ''}\n${commandResult.error || ''}`);
}

function summarizeCommandResult(commandResult) {
  if (!commandResult) {
    return null;
  }
  return {
    exit_code: commandResult.exitCode,
    command: commandResult.command,
    output: summarizeText(commandOutputText(commandResult)),
  };
}

function summarizeText(text, maxLength = 420) {
  const compact = stripAnsi(text || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}...`;
}

function extractAuthorizationUrl(text) {
  const clean = stripAnsi(text || '');
  const matches = clean.match(/https?:\/\/[^\s"'<>]+/g);
  if (!matches || matches.length === 0) {
    return '';
  }
  return matches.find((url) => url.includes('response_type=code'))
    || matches.find((url) => url.includes('/authorize'))
    || matches[0];
}

function summarizeOauthProbeResult(result) {
  if (!result) {
    return null;
  }
  const dataText = typeof result.data === 'string'
    ? result.data
    : result.data === null || result.data === undefined
      ? ''
      : JSON.stringify(result.data);
  return {
    ok: result.ok,
    status: result.status,
    url: result.url,
    output: summarizeText(dataText),
  };
}

function containsPattern(text, patterns) {
  const normalized = (text || '').toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function isApiDocDependencyError(text) {
  return containsPattern(text, API_DOC_ERROR_PATTERNS);
}

function isAuthDependencyError(text) {
  return containsPattern(text, AUTH_ERROR_PATTERNS);
}

function isOauthDependencyError(text) {
  return containsPattern(text, OAUTH_DEP_ERROR_PATTERNS);
}

function isAlreadyEnabledOutput(text) {
  return containsPattern(text, ALREADY_ENABLED_PATTERNS);
}

function isLikelyPlaceholderToken(token) {
  const value = (token || '').trim().toLowerCase();
  if (!value) {
    return true;
  }
  return PLACEHOLDER_TOKEN_PATTERNS.some((pattern) => value.includes(pattern));
}

function decodeJwtPayload(token) {
  const value = (token || '').trim();
  const parts = value.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const payloadPart = parts[1];
  if (!payloadPart) {
    return null;
  }
  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const jsonText = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(jsonText);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function isExpiredJwtToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || !Number.isInteger(payload.exp)) {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSeconds + 30;
}

function isUsableToken(token) {
  const value = (token || '').trim();
  return Boolean(value) && !isLikelyPlaceholderToken(value) && !isExpiredJwtToken(value);
}

function resolveManualToken(options) {
  const directToken = options.token.trim();
  if (isUsableToken(directToken)) {
    return {
      value: directToken,
      source: 'argument',
    };
  }

  if (options.tokenEnv) {
    const envValue = (process.env[options.tokenEnv] || '').trim();
    if (isUsableToken(envValue)) {
      return {
        value: envValue,
        source: `env:${options.tokenEnv}`,
      };
    }
  }

  return {
    value: '',
    source: '',
  };
}

function readCtlConfig(baseDir) {
  const configPath = path.join(baseDir, '.nocobase-ctl', 'config.json');
  if (!fs.existsSync(configPath)) {
    return { configPath, config: null };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return { configPath, config: JSON.parse(raw) };
  } catch {
    return { configPath, config: null };
  }
}

function normalizeConfigUrl(urlText) {
  try {
    const parsed = new URL(urlText);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return '';
    }

    let pathname = parsed.pathname || '/';
    pathname = pathname.replace(/\/+$/g, '');
    if (pathname.length === 0) {
      pathname = '/api';
    } else if (!pathname.endsWith('/api')) {
      pathname = `${pathname}/api`;
    }

    parsed.pathname = pathname;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function getConfigTokenCandidate(baseDir, normalizedBaseUrl, options = {}) {
  const excludedTokens = new Set(
    (options.excludeTokens || [])
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0),
  );
  const { configPath, config } = readCtlConfig(baseDir);
  if (!config || typeof config !== 'object') {
    return { value: '', source: '', detail: `config-not-usable:${configPath}` };
  }

  const envs = config.envs && typeof config.envs === 'object' ? config.envs : {};
  const currentEnv = typeof config.currentEnv === 'string' ? config.currentEnv : '';

  const prioritized = [];
  if (currentEnv && envs[currentEnv]) {
    prioritized.push({ name: currentEnv, env: envs[currentEnv] });
  }
  for (const [name, env] of Object.entries(envs)) {
    if (name === currentEnv) {
      continue;
    }
    prioritized.push({ name, env });
  }

  const exactUrlMatch = prioritized.find((item) => {
    const u = normalizeConfigUrl(item.env?.baseUrl || '');
    return u && u === normalizedBaseUrl;
  });
  if (exactUrlMatch) {
    const token = (exactUrlMatch.env?.auth?.accessToken || '').trim();
    if (isUsableToken(token) && !excludedTokens.has(token)) {
      return {
        value: token,
        source: `config:${configPath}:${exactUrlMatch.name}`,
        detail: 'exact-base-url-match',
      };
    }
    if (isUsableToken(token) && excludedTokens.has(token)) {
      return {
        value: '',
        source: '',
        detail: 'exact-base-url-token-excluded',
      };
    }
  }

  for (const item of prioritized) {
    const token = (item.env?.auth?.accessToken || '').trim();
    if (isUsableToken(token) && !excludedTokens.has(token)) {
      return {
        value: token,
        source: `config:${configPath}:${item.name}`,
        detail: 'first-usable-token',
      };
    }
  }

  return {
    value: '',
    source: '',
    detail: `no-usable-token:${configPath}`,
  };
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function extractApiKeyToken(text) {
  const blockMatch = /-----BEGIN API KEY-----\s*([A-Za-z0-9\-_.]+)\s*-----END API KEY-----/s.exec(text || '');
  if (blockMatch && isUsableToken(blockMatch[1])) {
    return blockMatch[1].trim();
  }

  const jwtMatch = /(eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/.exec(text || '');
  if (jwtMatch && isUsableToken(jwtMatch[1])) {
    return jwtMatch[1].trim();
  }

  return '';
}

function tryGenerateLocalTokenViaYarn(baseDir) {
  if (!commandExists('yarn')) {
    return { value: '', source: '', detail: 'yarn-not-found' };
  }

  const args = [
    'nocobase',
    'generate-api-key',
    '-n',
    'cli_auto_token',
    '-r',
    'root',
    '-u',
    'nocobase',
    '-e',
    '30d',
    '--silent',
  ];

  const result = spawnSync('yarn', args, {
    encoding: 'utf8',
    cwd: baseDir,
    env: process.env,
  });

  const merged = `${result.stdout || ''}\n${result.stderr || ''}`;
  const token = extractApiKeyToken(merged);
  if (isUsableToken(token)) {
    return {
      value: token,
      source: 'auto:yarn-generate-api-key',
      detail: '',
    };
  }

  return {
    value: '',
    source: '',
    detail: `yarn-generate-api-key-failed:exit=${result.status ?? 1}`,
  };
}

function resolveComposeFile(baseDir) {
  const candidates = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ];

  const checkDir = (dirPath) => {
    for (const file of candidates) {
      const p = path.join(dirPath, file);
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return '';
  };

  const direct = checkDir(baseDir);
  if (direct) {
    return direct;
  }

  const preferredSubdirs = ['skillapp', 'app', 'nocobase', 'server'];
  for (const subdir of preferredSubdirs) {
    const candidateDir = path.join(baseDir, subdir);
    if (!fs.existsSync(candidateDir)) {
      continue;
    }
    const found = checkDir(candidateDir);
    if (found) {
      return found;
    }
  }

  try {
    const subdirs = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(baseDir, entry.name))
      .slice(0, 30);
    for (const dirPath of subdirs) {
      const found = checkDir(dirPath);
      if (found) {
        return found;
      }
    }
  } catch {
    return '';
  }

  return '';
}

function resolveUrlPort(urlText) {
  try {
    const parsed = new URL(urlText);
    if (parsed.port) {
      const asInt = Number(parsed.port);
      if (Number.isInteger(asInt) && asInt > 0) {
        return asInt;
      }
    }
    if (parsed.protocol === 'http:') {
      return 80;
    }
    if (parsed.protocol === 'https:') {
      return 443;
    }
  } catch {
    return null;
  }
  return null;
}

function parseComposePortMappings(text) {
  const lines = (text || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const ports = new Set();

  for (const line of lines) {
    const match = line.match(/:(\d+)\s*$/);
    if (!match) {
      continue;
    }
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) {
      ports.add(value);
    }
  }

  return [...ports];
}

function detectDockerTargetForUrl(baseDir, normalized) {
  const targetPort = resolveUrlPort(normalized.baseUrl);
  if (!targetPort) {
    return {
      allowed: false,
      reason: 'target-port-unresolved',
      target_port: null,
      compose_file: '',
      compose_ports: [],
    };
  }

  if (!commandExists('docker')) {
    return {
      allowed: false,
      reason: 'docker-not-found',
      target_port: targetPort,
      compose_file: '',
      compose_ports: [],
    };
  }

  const composeFile = resolveComposeFile(baseDir);
  if (!composeFile) {
    return {
      allowed: false,
      reason: 'compose-file-not-found',
      target_port: targetPort,
      compose_file: '',
      compose_ports: [],
    };
  }

  const compose = buildComposeArgs(baseDir, ['port', CLI_PM_APP_SERVICE, '80']);
  const result = runCommand('docker', compose.args, baseDir, { timeoutMs: 8000 });
  const output = commandOutputText(result);
  const composePorts = parseComposePortMappings(output);
  if (result.exitCode !== 0) {
    return {
      allowed: false,
      reason: result.timedOut ? 'docker-port-timeout' : 'docker-port-query-failed',
      target_port: targetPort,
      compose_file: composeFile,
      compose_ports: composePorts,
      command: result.command,
      output: summarizeText(output),
    };
  }

  if (!composePorts.includes(targetPort)) {
    return {
      allowed: false,
      reason: 'target-port-not-mapped-by-compose',
      target_port: targetPort,
      compose_file: composeFile,
      compose_ports: composePorts,
      command: result.command,
      output: summarizeText(output),
    };
  }

  return {
    allowed: true,
    reason: 'target-port-mapped-by-compose',
    target_port: targetPort,
    compose_file: composeFile,
    compose_ports: composePorts,
    command: result.command,
    output: summarizeText(output),
  };
}

function tryGenerateLocalTokenViaDocker(baseDir, dockerTarget = null) {
  if (!commandExists('docker')) {
    return { value: '', source: '', detail: 'docker-not-found' };
  }

  if (dockerTarget && dockerTarget.allowed === false) {
    return { value: '', source: '', detail: `docker-skip:${dockerTarget.reason}` };
  }

  const composeFile = resolveComposeFile(baseDir);
  const args = ['compose'];
  if (composeFile) {
    args.push('-f', composeFile);
  }
  args.push(
    'exec',
    '-T',
    'app',
    'yarn',
    'nocobase',
    'generate-api-key',
    '-n',
    'cli_auto_token',
    '-r',
    'root',
    '-u',
    'nocobase',
    '-e',
    '30d',
    '--silent',
  );

  const result = runCommand('docker', args, baseDir, { timeoutMs: 12000 });

  const merged = commandOutputText(result);
  const token = extractApiKeyToken(merged);
  if (isUsableToken(token)) {
    return {
      value: token,
      source: composeFile ? `auto:docker-compose-exec:${composeFile}` : 'auto:docker-compose-exec',
      detail: '',
    };
  }

  return {
    value: '',
    source: '',
    detail: result.timedOut
      ? 'docker-generate-api-key-timeout'
      : `docker-generate-api-key-failed:exit=${result.exitCode}`,
  };
}

function buildComposeArgs(baseDir, tailArgs) {
  const composeFile = resolveComposeFile(baseDir);
  const args = ['compose'];
  if (composeFile) {
    args.push('-f', composeFile);
  }
  args.push(...tailArgs);
  return { args, composeFile };
}

function tryEnablePluginViaHostCli(baseDir, pluginName) {
  if (!commandExists('yarn')) {
    return {
      ok: false,
      backend: 'host_cli',
      detail: 'yarn-not-found',
      command: [],
      exit_code: 1,
      output: '',
    };
  }

  const result = runCommand('yarn', ['nocobase', 'pm', 'enable', pluginName], baseDir);
  const output = commandOutputText(result);
  const ok = result.exitCode === 0 || isAlreadyEnabledOutput(output);
  return {
    ok,
    backend: 'host_cli',
    detail: ok ? (result.exitCode === 0 ? 'enabled' : 'already-enabled') : `exit=${result.exitCode}`,
    command: result.command,
    exit_code: result.exitCode,
    output: summarizeText(output),
  };
}

function tryEnablePluginViaDockerCli(baseDir, pluginName, dockerTarget = null) {
  if (!commandExists('docker')) {
    return {
      ok: false,
      backend: 'docker_cli',
      detail: 'docker-not-found',
      command: [],
      exit_code: 1,
      output: '',
    };
  }

  if (dockerTarget && dockerTarget.allowed === false) {
    return {
      ok: false,
      backend: 'docker_cli',
      detail: `docker-skip:${dockerTarget.reason}`,
      command: dockerTarget.command || [],
      exit_code: 1,
      output: dockerTarget.output || '',
    };
  }

  const compose = buildComposeArgs(baseDir, [
    'exec',
    '-T',
    CLI_PM_APP_SERVICE,
    'yarn',
    'nocobase',
    'pm',
    'enable',
    pluginName,
  ]);
  const result = runCommand('docker', compose.args, baseDir, { timeoutMs: 12000 });
  const output = commandOutputText(result);
  const ok = result.exitCode === 0 || isAlreadyEnabledOutput(output);
  return {
    ok,
    backend: 'docker_cli',
    detail: ok
      ? (result.exitCode === 0 ? 'enabled' : 'already-enabled')
      : result.timedOut
        ? 'docker-enable-timeout'
        : `exit=${result.exitCode}${compose.composeFile ? `:${compose.composeFile}` : ''}`,
    command: result.command,
    exit_code: result.exitCode,
    output: summarizeText(output),
  };
}

function tryEnablePluginViaRemoteApi(options, normalized, pluginName, tokenForApi) {
  if (!isUsableToken(tokenForApi)) {
    return {
      ok: false,
      backend: 'remote_api',
      detail: 'token-missing-for-remote-api-fallback',
      command: [],
      exit_code: 1,
      output: '',
    };
  }

  const result = runCtl([
    'pm',
    'enable',
    '--filter-by-tk',
    pluginName,
    '--base-url',
    normalized.baseUrl,
    '--token',
    tokenForApi,
    '-j',
  ], options);
  const output = commandOutputText(result);
  return {
    ok: result.exitCode === 0,
    backend: 'remote_api',
    detail: result.exitCode === 0 ? 'enabled' : `exit=${result.exitCode}`,
    command: result.command,
    exit_code: result.exitCode,
    output: summarizeText(output),
  };
}

function enableLocalDependencyPlugin(options, normalized, pluginName, dockerTarget = null, tokenForApi = '') {
  const attempts = [];

  const dockerAttempt = tryEnablePluginViaDockerCli(options.baseDir, pluginName, dockerTarget);
  attempts.push(dockerAttempt);
  if (dockerAttempt.ok) {
    return {
      plugin: pluginName,
      ok: true,
      backend: dockerAttempt.backend,
      attempts,
    };
  }

  const remoteApiAttempt = tryEnablePluginViaRemoteApi(options, normalized, pluginName, tokenForApi);
  attempts.push(remoteApiAttempt);
  if (remoteApiAttempt.ok) {
    return {
      plugin: pluginName,
      ok: true,
      backend: remoteApiAttempt.backend,
      attempts,
    };
  }

  return {
    plugin: pluginName,
    ok: false,
    backend: '',
    attempts,
  };
}

function restartLocalRuntime(baseDir, backend) {
  if (backend === 'docker_cli') {
    if (!commandExists('docker')) {
      return {
        attempted: false,
        backend,
        ok: false,
        detail: 'docker-not-found',
      };
    }
    const compose = buildComposeArgs(baseDir, ['restart', CLI_PM_APP_SERVICE]);
    const result = runCommand('docker', compose.args, baseDir);
    return {
      attempted: true,
      backend,
      ok: result.exitCode === 0,
      detail: result.exitCode === 0 ? 'restart-ok' : `restart-failed:exit=${result.exitCode}`,
      command: result.command,
      exit_code: result.exitCode,
      output: summarizeText(commandOutputText(result)),
    };
  }

  if (backend === 'host_cli') {
    if (!commandExists('yarn')) {
      return {
        attempted: false,
        backend,
        ok: false,
        detail: 'yarn-not-found',
      };
    }
    const result = runCommand('yarn', ['nocobase', 'restart'], baseDir);
    return {
      attempted: true,
      backend,
      ok: result.exitCode === 0,
      detail: result.exitCode === 0 ? 'restart-ok' : `restart-failed:exit=${result.exitCode}`,
      command: result.command,
      exit_code: result.exitCode,
      output: summarizeText(commandOutputText(result)),
    };
  }

  return {
    attempted: false,
    backend: '',
    ok: false,
    detail: 'no-backend',
  };
}

function ensureLocalCliDependencyPlugins(
  options,
  normalized,
  reason,
  pluginNames,
  dockerTarget = null,
  tokenForApi = '',
) {
  const pluginResults = [];
  const successfulBackends = new Set();
  const requiredPlugins = Array.isArray(pluginNames) && pluginNames.length > 0
    ? pluginNames
    : getCliDependencyPluginsForAuthMode(options.authMode);

  for (const pluginName of requiredPlugins) {
    const result = enableLocalDependencyPlugin(options, normalized, pluginName, dockerTarget, tokenForApi);
    pluginResults.push(result);
    if (result.ok && result.backend) {
      successfulBackends.add(result.backend);
    }
  }

  const allEnabled = pluginResults.every((item) => item.ok);
  let restart = {
    attempted: false,
    backend: '',
    ok: false,
    detail: 'skipped',
  };

  if (allEnabled) {
    const restartBackend = successfulBackends.has('docker_cli') ? 'docker_cli' : '';
    if (restartBackend) {
      restart = restartLocalRuntime(options.baseDir, restartBackend);
    } else {
      restart = {
        attempted: false,
        backend: '',
        ok: true,
        detail: 'not-required-for-remote-api-fallback',
      };
    }
  }

  return {
    attempted: true,
    reason,
    auth_mode: options.authMode,
    required_plugins: requiredPlugins,
    docker_target: dockerTarget || null,
    plugins: pluginResults,
    all_enabled: allEnabled,
    restart,
  };
}

function acquireLocalToken(options, normalized, dockerTarget = null, policy = {}) {
  const attempts = [];
  const excludeTokens = (policy.excludeTokens || []).map((item) => String(item || '').trim()).filter(Boolean);
  const preferRuntimeGenerated = Boolean(policy.preferRuntimeGenerated);

  const tryConfigFirst = !preferRuntimeGenerated;
  const runConfigLookup = () => {
    const configToken = getConfigTokenCandidate(options.baseDir, normalized.baseUrl, { excludeTokens });
    attempts.push(configToken.detail || 'config-check');
    if (isUsableToken(configToken.value)) {
      return { value: configToken.value, source: configToken.source, attempts };
    }
    return null;
  };

  const runRuntimeGenerate = () => {
    const localYarnToken = tryGenerateLocalTokenViaYarn(options.baseDir);
    attempts.push(localYarnToken.detail || 'yarn-auto-token-ok');
    if (isUsableToken(localYarnToken.value)) {
      return { value: localYarnToken.value, source: localYarnToken.source, attempts };
    }

    const localDockerToken = tryGenerateLocalTokenViaDocker(options.baseDir, dockerTarget);
    attempts.push(localDockerToken.detail || 'docker-auto-token-ok');
    if (isUsableToken(localDockerToken.value)) {
      return { value: localDockerToken.value, source: localDockerToken.source, attempts };
    }

    return null;
  };

  if (tryConfigFirst) {
    const configFirst = runConfigLookup();
    if (configFirst) {
      return configFirst;
    }
    const runtimeAfterConfig = runRuntimeGenerate();
    if (runtimeAfterConfig) {
      return runtimeAfterConfig;
    }
  } else {
    const runtimeFirst = runRuntimeGenerate();
    if (runtimeFirst) {
      return runtimeFirst;
    }
    const configAfterRuntime = runConfigLookup();
    if (configAfterRuntime) {
      return configAfterRuntime;
    }
  }

  return { value: '', source: '', attempts };
}

function isInteractiveAuthRequiredError(text) {
  return summarizeText(text, 1000).toLowerCase().includes('requires an interactive terminal');
}

async function doAddOauthMode(options, normalized, dependencyPlugins, dockerTarget) {
  const loginCommand = buildRunCtlCommand(options, ['env', 'auth', '-e', options.name, '-s', options.scope]);
  const followupCommand = buildRunCtlCommand(options, ['env', 'update', '-e', options.name, '-s', options.scope]);
  const dependencyRecovery = {
    auth_mode: 'oauth',
    required_plugins: dependencyPlugins,
    docker_target: dockerTarget,
    dependency_phase: null,
    oauth_probe: {
      initial: null,
      final: null,
    },
    oauth_auth_phase: null,
    update_phase: null,
  };

  const buildAddArgs = () => [
    'env',
    'add',
    '--name',
    options.name,
    '--base-url',
    normalized.baseUrl,
    '-s',
    options.scope,
  ];

  let metadataProbe = await probeOauthMetadata(normalized.baseUrl);
  dependencyRecovery.oauth_probe.initial = summarizeOauthProbeResult(metadataProbe);

  if (!metadataProbe.ok && normalized.isLocal) {
    dependencyRecovery.dependency_phase = ensureLocalCliDependencyPlugins(
      options,
      normalized,
      'oauth-metadata-probe',
      dependencyPlugins,
      dockerTarget,
      '',
    );
    if (dependencyRecovery.dependency_phase.all_enabled) {
      metadataProbe = await probeOauthMetadata(normalized.baseUrl);
      dependencyRecovery.oauth_probe.final = summarizeOauthProbeResult(metadataProbe);
    }
  } else {
    dependencyRecovery.oauth_probe.final = dependencyRecovery.oauth_probe.initial;
  }

  if (!metadataProbe.ok) {
    const localEnableHint = buildPluginEnableHint(dependencyPlugins);
    failRuntime('OAuth metadata endpoint is not available for this environment.', {
      error_code: 'ENV_OAUTH_METADATA_UNAVAILABLE',
      env_name: options.name,
      base_url: normalized.baseUrl,
      scope: options.scope,
      auth_mode: 'oauth',
      action_required: normalized.isLocal ? 'enable_local_oauth_dependencies' : 'enable_remote_oauth_dependencies',
      suggested_command: normalized.isLocal ? localEnableHint : null,
      remote_oauth_guide: normalized.isLocal ? null : buildRemoteOauthGuide(options, normalized, 'metadata_unavailable'),
      auto_dependency_recovery: dependencyRecovery,
    });
  }

  const addResult = runCtl(buildAddArgs(), options);
  if (addResult.exitCode !== 0) {
    failRuntime('Failed to add environment in OAuth mode.', {
      env_name: options.name,
      base_url: normalized.baseUrl,
      scope: options.scope,
      auth_mode: 'oauth',
      ctl: addResult,
      auto_dependency_recovery: dependencyRecovery,
    });
  }

  const useResult = runCtl(['env', 'use', options.name, '-s', options.scope], options);
  if (useResult.exitCode !== 0) {
    failRuntime('Environment added but failed to switch current environment.', {
      env_name: options.name,
      scope: options.scope,
      auth_mode: 'oauth',
      ctl: useResult,
      auto_dependency_recovery: dependencyRecovery,
    });
  }

  const authResult = await runCtlWithLiveOutput(['env', 'auth', '-e', options.name, '-s', options.scope], options);
  const authOutputText = commandOutputText(authResult);
  const authAuthorizationUrl = extractAuthorizationUrl(authOutputText);
  dependencyRecovery.oauth_auth_phase = {
    ...summarizeCommandResult(authResult),
    authorization_url: authAuthorizationUrl || null,
  };
  if (authResult.exitCode !== 0) {
    const authRequiresInteractive = isInteractiveAuthRequiredError(authOutputText);
    failRuntime(
      authRequiresInteractive
        ? 'OAuth login requires an interactive terminal session.'
        : 'OAuth login failed for environment.',
      {
        error_code: authRequiresInteractive
          ? 'ENV_OAUTH_INTERACTIVE_REQUIRED'
          : 'ENV_OAUTH_AUTH_FAILED',
        action_required: authRequiresInteractive || authAuthorizationUrl ? 'complete_oauth_login' : null,
        env_name: options.name,
        base_url: normalized.baseUrl,
        scope: options.scope,
        auth_mode: 'oauth',
        oauth_authorization_url: authAuthorizationUrl || null,
        login_command: authRequiresInteractive
          ? loginCommand
          : null,
        followup_command: authRequiresInteractive
          ? followupCommand
          : null,
        interactive_login_hint: authRequiresInteractive
          ? 'Run login_command in an interactive terminal. The command opens browser automatically, or prints authorization URL when auto-open is unavailable.'
          : null,
        authorization_url_available_via: authRequiresInteractive ? 'login_command_output' : null,
        ctl: authResult,
        auto_dependency_recovery: dependencyRecovery,
      },
    );
  }

  let updateResult = runCtl(['env', 'update', '-e', options.name, '-s', options.scope], options);
  let updateRetryResult = null;
  if (updateResult.exitCode !== 0 && normalized.isLocal) {
    const initialUpdateErrorText = commandOutputText(updateResult);
    const updateMatchesApiDoc = isApiDocDependencyError(initialUpdateErrorText);
    const updateMatchesOauth = isOauthDependencyError(initialUpdateErrorText);
    if (updateMatchesApiDoc || updateMatchesOauth) {
      const dependencyEnable = ensureLocalCliDependencyPlugins(
        options,
        normalized,
        'oauth-env-update',
        dependencyPlugins,
        dockerTarget,
        '',
      );
      if (dependencyEnable.all_enabled) {
        updateRetryResult = runCtl(['env', 'update', '-e', options.name, '-s', options.scope], options);
        if (updateRetryResult.exitCode === 0) {
          updateResult = updateRetryResult;
        }
      }
      dependencyRecovery.update_phase = {
        triggered: true,
        trigger: {
          api_doc_dependency: updateMatchesApiDoc,
          oauth_dependency: updateMatchesOauth,
          update_error: summarizeText(initialUpdateErrorText),
        },
        dependency_enable: dependencyEnable,
        env_update_retry: summarizeCommandResult(updateRetryResult),
      };
    }
  }

  if (updateResult.exitCode !== 0) {
    const finalUpdateErrorText = commandOutputText(updateResult);
    failRuntime('Environment added and OAuth login completed, but connectivity verification failed during env update.', {
      error_code: 'ENV_UPDATE_CONNECTIVITY_FAILED',
      env_name: options.name,
      base_url: normalized.baseUrl,
      scope: options.scope,
      auth_mode: 'oauth',
      action_required: isAuthDependencyError(finalUpdateErrorText) ? 'complete_oauth_login' : null,
      login_command: isAuthDependencyError(finalUpdateErrorText)
        ? loginCommand
        : null,
      followup_command: followupCommand,
      interactive_login_hint: isAuthDependencyError(finalUpdateErrorText)
        ? 'Run login_command in an interactive terminal. The command opens browser automatically, or prints authorization URL when auto-open is unavailable.'
        : null,
      authorization_url_available_via: isAuthDependencyError(finalUpdateErrorText) ? 'login_command_output' : null,
      ctl: updateResult,
      auto_dependency_recovery: dependencyRecovery,
    });
  }

  const currentState = getCurrentState(options);
  printResult({
    ok: true,
    action: 'add',
    env_name: options.name,
    base_url: normalized.baseUrl,
    is_local: normalized.isLocal,
    auth_mode: 'oauth',
    auth_status: 'oauth-authenticated',
    token_mode: null,
    token_source: null,
    token_acquisition_attempts: [],
    scope: options.scope,
    base_dir: options.baseDir,
    current_state: currentState,
    steps: {
      add: {
        command: addResult.command,
        exit_code: addResult.exitCode,
      },
      use: {
        command: useResult.command,
        exit_code: useResult.exitCode,
      },
      env_auth: {
        command: authResult.command,
        exit_code: authResult.exitCode,
        authorization_url: authAuthorizationUrl || null,
      },
      env_update: {
        command: updateResult.command,
        exit_code: updateResult.exitCode,
      },
      env_update_retry: updateRetryResult
        ? {
            command: updateRetryResult.command,
            exit_code: updateRetryResult.exitCode,
          }
        : null,
    },
    auto_dependency_recovery: dependencyRecovery,
  });
}

async function doAdd(options) {
  const normalized = normalizeBaseUrl(options.url);
  const dependencyPlugins = getCliDependencyPluginsForAuthMode(options.authMode);
  const dockerTarget = normalized.isLocal
    ? detectDockerTargetForUrl(options.baseDir, normalized)
    : null;

  if (options.authMode === 'oauth') {
    await doAddOauthMode(options, normalized, dependencyPlugins, dockerTarget);
    return;
  }

  let token = { value: '', source: '' };
  let tokenMode = '';
  let tokenAcquisition = [];
  const dependencyRecovery = {
    auth_mode: options.authMode,
    required_plugins: dependencyPlugins,
    docker_target: dockerTarget,
    token_phase: null,
    update_phase: null,
  };

  const buildAddArgs = (tokenValue) => [
    'env',
    'add',
    '--name',
    options.name,
    '--base-url',
    normalized.baseUrl,
    '--token',
    tokenValue,
    '-s',
    options.scope,
  ];

  if (normalized.isLocal) {
    let autoToken = acquireLocalToken(options, normalized, dockerTarget);
    token = {
      value: autoToken.value,
      source: autoToken.source,
    };
    tokenAcquisition = [...autoToken.attempts];
    tokenMode = 'auto-local-required';

    if (!isUsableToken(token.value)) {
      dependencyRecovery.token_phase = ensureLocalCliDependencyPlugins(
        options,
        normalized,
        'token-acquire',
        dependencyPlugins,
        dockerTarget,
        token.value,
      );
      if (dependencyRecovery.token_phase.all_enabled) {
        autoToken = acquireLocalToken(options, normalized, dockerTarget);
        token = {
          value: autoToken.value,
          source: autoToken.source,
        };
        tokenAcquisition.push(...autoToken.attempts.map((item) => `after-plugin-enable:${item}`));
      }

      if (!isUsableToken(token.value)) {
        failValidation(
          'Local URL requires automatic token acquisition and strict connectivity verification, but no usable token was auto-resolved.',
          {
            error_code: 'ENV_LOCAL_TOKEN_AUTO_ACQUIRE_FAILED',
            env_name: options.name,
            base_url: normalized.baseUrl,
            scope: options.scope,
            token_acquisition_attempts: tokenAcquisition,
            auto_dependency_recovery: dependencyRecovery.token_phase,
          },
        );
      }
    }
  } else {
    const manualToken = resolveManualToken(options);
    token = manualToken;
    tokenMode = 'manual-remote-required';

    if (!isUsableToken(token.value)) {
      failValidation(
        'Remote URL requires a valid API token. Use the remote token guide to enable API keys, generate token, and retry.',
        {
          error_code: 'ENV_TOKEN_REQUIRED_FOR_REMOTE',
          action_required: 'provide_remote_api_token',
          env_name: options.name,
          base_url: normalized.baseUrl,
          scope: options.scope,
          remote_token_guide: buildRemoteTokenGuide(options, normalized, 'missing_token'),
        },
      );
    }
  }

  const addArgs = buildAddArgs(token.value);
  const addResult = runCtl(addArgs, options);
  if (addResult.exitCode !== 0) {
    failRuntime('Failed to add environment.', {
      env_name: options.name,
      base_url: normalized.baseUrl,
      scope: options.scope,
      token_mode: tokenMode,
      token_source: token.source || null,
      token_acquisition_attempts: tokenAcquisition,
      ctl: addResult,
      auto_dependency_recovery: dependencyRecovery,
    });
  }

  const useResult = runCtl(['env', 'use', options.name, '-s', options.scope], options);
  if (useResult.exitCode !== 0) {
    failRuntime('Environment added but failed to switch current environment.', {
      env_name: options.name,
      scope: options.scope,
      token_mode: tokenMode,
      token_source: token.source || null,
      ctl: useResult,
      auto_dependency_recovery: dependencyRecovery,
    });
  }

  let updateResult = runCtl(['env', 'update', '-e', options.name, '-s', options.scope], options);
  let updateRetryAddResult = null;
  let updateRetryResult = null;

  if (updateResult.exitCode !== 0 && normalized.isLocal) {
    const initialUpdateErrorText = commandOutputText(updateResult);
    const updateMatchesApiDoc = isApiDocDependencyError(initialUpdateErrorText);
    const updateMatchesAuth = isAuthDependencyError(initialUpdateErrorText);

    if (updateMatchesApiDoc || updateMatchesAuth) {
      const dependencyEnable = ensureLocalCliDependencyPlugins(
        options,
        normalized,
        'env-update',
        dependencyPlugins,
        dockerTarget,
        token.value,
      );
      const tokenRetry = acquireLocalToken(options, normalized, dockerTarget, {
        preferRuntimeGenerated: true,
        excludeTokens: [token.value],
      });
      tokenAcquisition.push(...tokenRetry.attempts.map((item) => `update-recovery:${item}`));

      const tokenReacquire = {
        attempted: true,
        usable: isUsableToken(tokenRetry.value),
        source: tokenRetry.source || null,
        attempts: tokenRetry.attempts,
      };

      if (tokenReacquire.usable) {
        token = {
          value: tokenRetry.value,
          source: tokenRetry.source,
        };
      }

      if (dependencyEnable.all_enabled && tokenReacquire.usable) {
        updateRetryAddResult = runCtl(buildAddArgs(token.value), options);
        if (updateRetryAddResult.exitCode === 0) {
          updateRetryResult = runCtl(['env', 'update', '-e', options.name, '-s', options.scope], options);
          if (updateRetryResult.exitCode === 0) {
            updateResult = updateRetryResult;
          }
        }
      }

      dependencyRecovery.update_phase = {
        triggered: true,
        trigger: {
          api_doc_dependency: updateMatchesApiDoc,
          auth_dependency: updateMatchesAuth,
          update_error: summarizeText(initialUpdateErrorText),
        },
        dependency_enable: dependencyEnable,
        token_reacquire: tokenReacquire,
        env_add_retry: summarizeCommandResult(updateRetryAddResult),
        env_update_retry: summarizeCommandResult(updateRetryResult),
      };
    }
  }

  if (updateResult.exitCode !== 0) {
    const finalUpdateErrorText = commandOutputText(updateResult);
    const isRemoteAuthFailure = !normalized.isLocal && isAuthDependencyError(finalUpdateErrorText);
    failRuntime('Environment added but connectivity verification failed during env update.', {
      error_code: 'ENV_UPDATE_CONNECTIVITY_FAILED',
      env_name: options.name,
      base_url: normalized.baseUrl,
      scope: options.scope,
      token_mode: tokenMode,
      token_source: token.source || null,
      token_acquisition_attempts: tokenAcquisition,
      ctl: updateResult,
      auto_dependency_recovery: dependencyRecovery,
      action_required: isRemoteAuthFailure ? 'refresh_remote_api_token' : null,
      remote_token_guide: isRemoteAuthFailure
        ? buildRemoteTokenGuide(options, normalized, 'invalid_or_expired_token')
        : null,
    });
  }

  const currentState = getCurrentState(options);
  printResult({
    ok: true,
    action: 'add',
    env_name: options.name,
    base_url: normalized.baseUrl,
    is_local: normalized.isLocal,
    auth_mode: 'token',
    auth_status: 'token-authenticated',
    token_mode: tokenMode,
    token_source: token.source || null,
    token_acquisition_attempts: tokenAcquisition,
    scope: options.scope,
    base_dir: options.baseDir,
    current_state: currentState,
    steps: {
      add: {
        command: addResult.command,
        exit_code: addResult.exitCode,
      },
      use: {
        command: useResult.command,
        exit_code: useResult.exitCode,
      },
      env_update: {
        command: updateResult.command,
        exit_code: updateResult.exitCode,
      },
      env_add_retry: updateRetryAddResult
        ? {
            command: updateRetryAddResult.command,
            exit_code: updateRetryAddResult.exitCode,
          }
        : null,
      env_update_retry: updateRetryResult
        ? {
            command: updateRetryResult.command,
            exit_code: updateRetryResult.exitCode,
          }
        : null,
    },
    auto_dependency_recovery: dependencyRecovery,
  });
}

function doUse(options) {
  const useResult = runCtl(['env', 'use', options.name, '-s', options.scope], options);
  if (useResult.exitCode !== 0) {
    failRuntime('Failed to switch environment.', {
      env_name: options.name,
      scope: options.scope,
      ctl: useResult,
    });
  }

  const currentState = getCurrentState(options);
  printResult({
    ok: true,
    action: 'use',
    env_name: options.name,
    scope: options.scope,
    base_dir: options.baseDir,
    current_state: currentState,
    ctl: {
      command: useResult.command,
      exit_code: useResult.exitCode,
    },
  });
}

function doCurrent(options) {
  const currentState = getCurrentState(options);
  printResult({
    ok: true,
    action: 'current',
    ...currentState,
  });
}

function doList(options) {
  const listState = getEnvList(options);
  printResult({
    ok: true,
    action: 'list',
    scope: options.scope,
    base_dir: options.baseDir,
    available_envs: listState.rows,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.action === 'add') {
    await doAdd(options);
    return;
  }
  if (options.action === 'use') {
    doUse(options);
    return;
  }
  if (options.action === 'current') {
    doCurrent(options);
    return;
  }
  if (options.action === 'list') {
    doList(options);
  }
}

main().catch((error) => {
  failRuntime('Unhandled env-manage failure.', {
    detail: error instanceof Error ? error.message : String(error),
  });
});
