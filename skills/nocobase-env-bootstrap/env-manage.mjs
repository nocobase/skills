#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ACTIONS = new Set(['add', 'use', 'current', 'list']);
const SCOPES = new Set(['project', 'global']);
const PREFERS = new Set(['auto', 'global', 'local']);
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
const CLI_DEPENDENCY_PLUGINS = ['@nocobase/plugin-api-doc', '@nocobase/plugin-api-keys'];
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
    '  node ./env-manage.mjs add --name <env> --url <base-url> [--token <token>] [--token-env <ENV_NAME>] [--scope project|global] [--base-dir <dir>]',
    '  node ./env-manage.mjs use --name <env> [--scope project|global] [--base-dir <dir>]',
    '  node ./env-manage.mjs current [--scope project|global] [--base-dir <dir>]',
    '  node ./env-manage.mjs list [--scope project|global] [--base-dir <dir>]',
    '',
    'Rules:',
    '  - Local URLs always require a real token and env-manage auto-acquires it.',
    '  - Remote URLs require manual token input (--token or --token-env).',
    '  - add always runs env update for connectivity verification; update failure means add failure.',
    '  - Local add auto-recovers dependencies: if api-doc/api-keys is missing, env-manage tries pm enable + retry.',
    '',
    'Examples:',
    '  node ./env-manage.mjs add --name local --url http://localhost:13000/api --scope project',
    '  node ./env-manage.mjs add --name staging --url https://demo.example.com/api --token-env NOCOBASE_API_TOKEN --scope project',
    '  node ./env-manage.mjs use --name local --scope project',
    '  node ./env-manage.mjs current --scope project',
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

  options.baseDir = path.resolve(options.baseDir);

  if (options.action === 'add') {
    if (!options.name) {
      failValidation('Missing required --name for add action.');
    }
    if (!options.url) {
      failValidation('Missing required --url/--base-url for add action.');
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
      `node ./env-manage.mjs add --name ${options.name} --url ${normalized.baseUrl} --token <your_token> --scope ${options.scope} --base-dir ${options.baseDir}`,
      `node ./env-manage.mjs add --name ${options.name} --url ${normalized.baseUrl} --token-env NOCOBASE_API_TOKEN --scope ${options.scope} --base-dir ${options.baseDir}`,
    ],
    token_env_examples: {
      powershell: "$env:NOCOBASE_API_TOKEN='<your_token>'",
      bash: "export NOCOBASE_API_TOKEN='<your_token>'",
    },
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

function runCtl(ctlArgs, options) {
  const commandArgs = [
    RUN_CTL_PATH,
    '--base-dir',
    options.baseDir,
    '--prefer',
    options.prefer,
    '--',
    ...ctlArgs,
  ];

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

function ensureLocalCliDependencyPlugins(options, normalized, reason, dockerTarget = null, tokenForApi = '') {
  const pluginResults = [];
  const successfulBackends = new Set();

  for (const pluginName of CLI_DEPENDENCY_PLUGINS) {
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

function doAdd(options) {
  const normalized = normalizeBaseUrl(options.url);
  const dockerTarget = normalized.isLocal
    ? detectDockerTargetForUrl(options.baseDir, normalized)
    : null;

  let token = { value: '', source: '' };
  let tokenMode = '';
  let tokenAcquisition = [];
  const dependencyRecovery = {
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

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.action === 'add') {
    doAdd(options);
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

main();
