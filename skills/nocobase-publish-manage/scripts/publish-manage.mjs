#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  evaluateMigrationTemplateRules,
  getMigrationTemplateDefinition,
  getMigrationTemplateKeys,
  getMigrationTemplateOptions,
  resolveMigrationTemplate,
} from './migration-template-rules.mjs';
import {
  buildRunCtlResourceArgs,
  createResourceOperationRequest,
} from './publish-resource-adapter.mjs';

const ACTIONS = new Set(['precheck', 'publish', 'verify', 'rollback']);
const CHANNELS = new Set(['auto', 'local_cli', 'remote_api', 'remote_ssh_cli']);
const METHODS = new Set(['backup_restore', 'migration']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0:0:0:0:0:0:0:1', 'host.docker.internal']);
const METHOD_UI_META = {
  backup_restore: {
    label: 'Use existing backup package',
    description: 'Use an existing backup package: download from source, then upload and restore on target.',
  },
  migration: {
    label: 'Create new release package',
    description: 'Create a new migration package on source, then validate and apply it on target.',
  },
};

const COMMERCIAL_URL = 'https://www.nocobase.com/en/commercial';
const PUBLISH_CAPABILITY_SENTINELS = ['@nocobase/plugin-migration-manager', 'migration-manager', 'migration manager', 'migration_manager'];
const REQUIRED_RELEASE_PLUGINS = [
  {
    id: 'migration_manager',
    package_name: '@nocobase/plugin-migration-manager',
    aliases: ['@nocobase/plugin-migration-manager', 'migration-manager', 'migration manager', 'migration_manager'],
  },
  {
    id: 'backup_manager',
    package_name: '@nocobase/plugin-backups',
    aliases: [
      '@nocobase/plugin-backups',
      '@nocobase/plugin-backup-manager',
      'backups',
      'backup-manager',
      'backup manager',
      'backup_manager',
    ],
  },
];

function fail(code, message, details = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, error_code: code, message, ...details }, null, 2)}\n`);
  process.exit(code === 'RELEASE_INVALID_INPUT' ? 2 : 1);
}

function methodUiMeta(method) {
  return METHOD_UI_META[method] || {
    label: method || '',
    description: '',
  };
}

function help() {
  process.stdout.write(
    [
      'Usage:',
      '  node ./scripts/publish-manage.mjs <action> --method <backup_restore|migration> [options]',
      '',
      'Required:',
      '  action: precheck|publish|verify|rollback',
      '  --method backup_restore|migration (backup_restore=use existing backup package, migration=create new release package)',
      '  --publish-method-confirm backup_restore|migration (required gate for publish --apply)',
      '',
      'Main options:',
      '  --channel auto|local_cli|remote_api|remote_ssh_cli',
      `  --migration-template ${getMigrationTemplateKeys().join('|')} (required for migration publish execution)`,
      '  --mode <legacy> (compat alias: overwrite/full -> full_overwrite, structure/schema -> schema_only_all)',
      '  --source-env <name> --target-env <name>',
      '  --source-url <url> --target-url <url>',
      '  --source-token-env <ENV> --target-token-env <ENV>',
      '  --backup-artifact <id> (required for rollback and backup_restore publish --apply)',
      '  --backup-auto true|false (default true)',
      '  --apply --confirm confirm',
      '  --base-dir <dir> --scope project|global',
      '',
      'SSH options:',
      '  --ssh-host <host> --ssh-user <user> --ssh-port <port> --ssh-path <path>',
    ].join('\n') + '\n',
  );
}

function argValue(argv, i, flag) {
  const v = argv[i + 1];
  if (!v) fail('RELEASE_INVALID_INPUT', `Missing value for ${flag}`);
  return v;
}

function parseBooleanFlag(value, flagName) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  fail('RELEASE_INVALID_INPUT', `Invalid value for ${flagName}: ${value}. Expected true|false.`);
  return false;
}

function parseArgs(argv) {
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    help();
    process.exit(0);
  }
  const opts = {
    action: argv[0],
    method: '',
    channel: 'auto',
    migrationTemplate: '',
    modeLegacy: '',
    templateWarnings: [],
    sourceEnv: '',
    targetEnv: '',
    sourceUrl: '',
    targetUrl: '',
    sourceTokenEnv: '',
    targetTokenEnv: '',
    backupArtifact: '',
    backupAuto: true,
    publishMethodConfirm: '',
    apply: false,
    confirm: '',
    baseDir: process.cwd(),
    scope: 'project',
    sshHost: '',
    sshUser: '',
    sshPort: '22',
    sshPath: '',
  };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') { opts.apply = true; continue; }
    if (a === '--skip-backup') { opts.backupAuto = false; continue; }
    if (a === '--method') { opts.method = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--method=')) { opts.method = a.slice(9); continue; }
    if (a === '--channel') { opts.channel = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--channel=')) { opts.channel = a.slice(10); continue; }
    if (a === '--migration-template') { opts.migrationTemplate = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--migration-template=')) { opts.migrationTemplate = a.slice(21); continue; }
    if (a === '--mode') { opts.modeLegacy = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--mode=')) { opts.modeLegacy = a.slice(7); continue; }
    if (a === '--source-env') { opts.sourceEnv = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--source-env=')) { opts.sourceEnv = a.slice(13); continue; }
    if (a === '--target-env') { opts.targetEnv = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--target-env=')) { opts.targetEnv = a.slice(13); continue; }
    if (a === '--source-url') { opts.sourceUrl = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--source-url=')) { opts.sourceUrl = a.slice(13); continue; }
    if (a === '--target-url') { opts.targetUrl = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--target-url=')) { opts.targetUrl = a.slice(13); continue; }
    if (a === '--source-token-env') { opts.sourceTokenEnv = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--source-token-env=')) { opts.sourceTokenEnv = a.slice(19); continue; }
    if (a === '--target-token-env') { opts.targetTokenEnv = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--target-token-env=')) { opts.targetTokenEnv = a.slice(19); continue; }
    if (a === '--backup-artifact') { opts.backupArtifact = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--backup-artifact=')) { opts.backupArtifact = a.slice(18); continue; }
    if (a === '--backup-auto') { opts.backupAuto = parseBooleanFlag(argValue(argv, i, a), a); i += 1; continue; }
    if (a.startsWith('--backup-auto=')) { opts.backupAuto = parseBooleanFlag(a.slice(14), '--backup-auto'); continue; }
    if (a === '--confirm') { opts.confirm = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--confirm=')) { opts.confirm = a.slice(10); continue; }
    if (a === '--publish-method-confirm') { opts.publishMethodConfirm = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--publish-method-confirm=')) { opts.publishMethodConfirm = a.slice(25); continue; }
    if (a === '--base-dir') { opts.baseDir = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--base-dir=')) { opts.baseDir = a.slice(11); continue; }
    if (a === '--scope') { opts.scope = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--scope=')) { opts.scope = a.slice(8); continue; }
    if (a === '--ssh-host') { opts.sshHost = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--ssh-host=')) { opts.sshHost = a.slice(11); continue; }
    if (a === '--ssh-user') { opts.sshUser = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--ssh-user=')) { opts.sshUser = a.slice(11); continue; }
    if (a === '--ssh-port') { opts.sshPort = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--ssh-port=')) { opts.sshPort = a.slice(11); continue; }
    if (a === '--ssh-path') { opts.sshPath = argValue(argv, i, a); i += 1; continue; }
    if (a.startsWith('--ssh-path=')) { opts.sshPath = a.slice(11); continue; }
    if (a === '--help' || a === '-h') { help(); process.exit(0); }
    fail('RELEASE_INVALID_INPUT', `Unknown argument: ${a}`);
  }
  opts.baseDir = path.resolve(opts.baseDir);

  if (!ACTIONS.has(opts.action)) fail('RELEASE_INVALID_INPUT', `Invalid action: ${opts.action}`);
  if (!METHODS.has(opts.method)) fail('RELEASE_INVALID_INPUT', `Invalid method: ${opts.method}`);
  if (opts.publishMethodConfirm && !METHODS.has(opts.publishMethodConfirm)) {
    fail('RELEASE_INVALID_INPUT', `Invalid --publish-method-confirm: ${opts.publishMethodConfirm}`);
  }
  if (!CHANNELS.has(opts.channel)) fail('RELEASE_INVALID_INPUT', `Invalid channel: ${opts.channel}`);

  const templateResolution = resolveMigrationTemplate({
    method: opts.method,
    migrationTemplate: opts.migrationTemplate,
    legacyMode: opts.modeLegacy,
    allowEmpty: true,
  });
  if (!templateResolution.ok) {
    fail('RELEASE_INVALID_INPUT', templateResolution.errors.join(' '));
  }
  opts.migrationTemplate = templateResolution.template;
  opts.templateWarnings = templateResolution.warnings;

  if (opts.action === 'rollback' && !opts.backupArtifact) {
    fail('RELEASE_INVALID_INPUT', 'Rollback requires --backup-artifact.');
  }
  if (opts.apply && (opts.action === 'publish' || opts.action === 'rollback') && opts.confirm !== 'confirm') {
    fail('RELEASE_INVALID_INPUT', 'Use --confirm confirm for publish/rollback in apply mode.');
  }

  if (!opts.sourceEnv && !opts.sourceUrl) {
    opts.sourceEnv = 'local';
  }
  if (!opts.targetEnv && !opts.targetUrl) {
    opts.targetEnv = 'test';
  }

  return opts;
}

function nowId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function jsonSafe(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function localUrl(urlText) {
  if (!urlText) return null;
  try {
    const host = new URL(urlText).hostname.toLowerCase();
    if (LOCAL_HOSTS.has(host)) return true;
    return host.endsWith('.localhost');
  } catch {
    return null;
  }
}

function normalizeApiUrl(urlText) {
  if (!urlText) return '';
  try {
    const u = new URL(urlText);
    let p = (u.pathname || '/').replace(/\/+$/g, '');
    if (!p) p = '/api';
    else if (!p.endsWith('/api')) p += '/api';
    u.pathname = p;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

function stripAnsi(text) {
  return (text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function parseEnvRows(tableText) {
  const cleanText = stripAnsi(tableText || '');
  const lines = cleanText
    .split(/\r?\n/g)
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.trim().length > 0);

  const headerIndex = lines.findIndex(
    (line) => line.includes('Name') && line.includes('Base URL'),
  );
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

      if (parts[0] === '*') {
        currentMark = '*';
        name = parts[1] || '';
        baseUrl = parts[2] || '';
      } else {
        name = parts[0] || '';
        baseUrl = parts[1] || '';
      }

      if (!name || !baseUrl) {
        continue;
      }

      rows.push({
        name,
        base_url: baseUrl,
        is_current: currentMark === '*',
      });
      continue;
    }

    const name = parts[0] || '';
    const baseUrl = parts[1] || '';
    if (!name || !baseUrl) {
      continue;
    }

    rows.push({
      name,
      base_url: baseUrl,
      is_current: false,
    });
  }

  return rows;
}

function toLowerSafe(value) {
  return String(value || '').toLowerCase();
}

function parsePmListPayload(stdoutText) {
  const text = stdoutText || '';
  const begin = '--- BEGIN_PLUGIN_LIST_JSON ---';
  const end = '--- END_PLUGIN_LIST_JSON ---';
  const beginIndex = text.indexOf(begin);
  const endIndex = text.indexOf(end);
  if (beginIndex >= 0 && endIndex > beginIndex) {
    const payloadText = text.slice(beginIndex + begin.length, endIndex).trim();
    const payload = jsonSafe(payloadText);
    if (payload) {
      return payload;
    }
  }

  const direct = jsonSafe(text.trim());
  if (direct) {
    return direct;
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const block = text.slice(firstBrace, lastBrace + 1);
    const parsed = jsonSafe(block);
    if (parsed) {
      return parsed;
    }
  }

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const block = text.slice(firstBracket, lastBracket + 1);
    const parsed = jsonSafe(block);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function normalizePmPlugins(payload, rawText = '') {
  if (payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.rows)) return payload.rows;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
  }

  const rows = stripAnsi(rawText || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.includes('BEGIN_PLUGIN_LIST_JSON') && !line.includes('END_PLUGIN_LIST_JSON'))
    .filter((line) => !/^[-=]{3,}$/.test(line.replace(/\s+/g, '')));

  if (rows.length === 0) {
    return [];
  }

  return rows.map((line) => ({ name: line, status: line }));
}

function pluginEntryText(entry) {
  return [
    entry?.name,
    entry?.packageName,
    entry?.package,
    entry?.pluginName,
    entry?.displayName,
    entry?.id,
  ]
    .filter(Boolean)
    .map((x) => toLowerSafe(x))
    .join(' ');
}

function findPluginByAliases(plugins, aliases) {
  for (const plugin of plugins) {
    const text = pluginEntryText(plugin);
    if (aliases.some((alias) => text.includes(toLowerSafe(alias)))) {
      return plugin;
    }
  }
  return null;
}

function parsePluginEnabled(plugin) {
  if (!plugin || typeof plugin !== 'object') return null;
  if (typeof plugin.enabled === 'boolean') return plugin.enabled;
  if (typeof plugin.installed === 'boolean' && plugin.enabled === undefined) return plugin.installed;
  if (typeof plugin.status === 'string') {
    const status = toLowerSafe(plugin.status);
    if (status.includes('enable') || status.includes('active')) return true;
    if (status.includes('disable') || status.includes('inactive')) return false;
  }
  const entryText = pluginEntryText(plugin);
  if (entryText.includes('enable') || entryText.includes('active')) return true;
  if (entryText.includes('disable') || entryText.includes('inactive')) return false;
  return null;
}

function inspectPmListViaCli(opts, targetEnvName) {
  let useResult = null;
  if (targetEnvName) {
    useResult = runCli(['env', 'use', targetEnvName, '-s', opts.scope], opts);
    if (useResult.code !== 0) {
      return {
        ok: false,
        stage: 'env_use_target',
        use_result: useResult,
        pm_result: null,
        plugins: [],
      };
    }
  }

  const pmResult = runCli(['pm', 'list'], opts);
  if (pmResult.code !== 0) {
    return {
      ok: false,
      stage: 'pm_list',
      use_result: useResult,
      pm_result: pmResult,
      plugins: [],
    };
  }

  const payload = parsePmListPayload(pmResult.stdout);
  const plugins = normalizePmPlugins(payload, pmResult.stdout);
  return {
    ok: true,
    stage: 'pm_list',
    use_result: useResult,
    pm_result: pmResult,
    plugins,
    payload_found: Boolean(payload),
  };
}

function runCli(args, opts) {
  const cmd = process.platform === 'win32' ? 'nb.cmd' : 'nb';
  const spawnEnv = { ...process.env };
  const safeArgs = Array.isArray(args) ? [...args] : [];
  if (process.platform === 'win32') {
    // On cmd.exe, JSON passed to --values/--filter can lose inner quotes.
    // Escaping quotes keeps JSON valid when parsed by nb CLI.
    const jsonFlags = new Set(['--values', '--filter']);
    for (let i = 0; i < safeArgs.length - 1; i += 1) {
      const flag = safeArgs[i];
      if (!jsonFlags.has(flag)) {
        continue;
      }
      const raw = safeArgs[i + 1];
      if (!raw || typeof raw !== 'string') {
        continue;
      }
      const trimmed = raw.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
        continue;
      }
      safeArgs[i + 1] = raw.replace(/"/g, '\\"');
    }
  }
  const result = spawnSync(cmd, safeArgs, {
    encoding: 'utf8',
    cwd: opts.baseDir,
    env: spawnEnv,
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : '',
    command: [cmd, ...safeArgs],
    resolver: '',
    diagnostics: [],
  };
}

function runSsh(commandText, opts) {
  const userHost = opts.sshUser ? `${opts.sshUser}@${opts.sshHost}` : opts.sshHost;
  const r = spawnSync('ssh', ['-p', String(opts.sshPort), userHost, commandText], { encoding: 'utf8', cwd: opts.baseDir, env: process.env });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error?.message || '' };
}

function appendQuery(url, query = {}) {
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === '') {
          continue;
        }
        url.searchParams.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item));
      }
      continue;
    }
    url.searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
}

function normalizeExecContext(value) {
  return value === 'source' ? 'source' : 'target';
}

function resolveTokenEnvCandidates(opts, contextName) {
  const context = normalizeExecContext(contextName);
  if (context === 'source') {
    return [...new Set([
      opts.sourceTokenEnv,
      opts.targetTokenEnv,
      'NOCOBASE_SOURCE_API_TOKEN',
      'NOCOBASE_API_TOKEN',
    ].filter(Boolean))];
  }
  return [...new Set([
    opts.targetTokenEnv,
    'NOCOBASE_API_TOKEN',
  ].filter(Boolean))];
}

function resolveApiToken(opts, contextName) {
  const tokenEnvCandidates = resolveTokenEnvCandidates(opts, contextName);
  for (const tokenEnvName of tokenEnvCandidates) {
    const tokenFromEnv = (process.env[tokenEnvName] || '').trim();
    if (tokenFromEnv) {
      return { token: tokenFromEnv, token_env: tokenEnvName, source: `env:${tokenEnvName}` };
    }
  }

  const fallbackTokenEnv = tokenEnvCandidates[0] || '';
  return { token: '', token_env: fallbackTokenEnv, source: 'missing' };
}

function resolveExecContextRuntime(opts, ctx, contextName) {
  const context = normalizeExecContext(contextName);
  if (context === 'source') {
    return {
      context,
      envName: opts.sourceEnv || '',
      baseUrl: ctx.sourceUrl || '',
    };
  }
  return {
    context: 'target',
    envName: opts.targetEnv || '',
    baseUrl: ctx.targetUrl || '',
  };
}

function parseContentDispositionFilename(headerValue = '') {
  if (!headerValue) {
    return '';
  }
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = headerValue.match(/filename=\"([^\"]+)\"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }
  const plainMatch = headerValue.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }
  return '';
}

async function callApi({
  route,
  baseUrl,
  token = '',
  tokenEnv = '',
  method = 'GET',
  query = {},
  body = undefined,
  transport = 'json',
  multipart = null,
  responseType = 'json',
  download = null,
}) {
  try {
    const bearer = token || (tokenEnv ? (process.env[tokenEnv] || '').trim() : '');
    const headers = {
      Accept: responseType === 'binary' ? '*/*' : 'application/json',
    };
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`;
    }
    const url = new URL(`${baseUrl}${route}`);
    appendQuery(url, query);

    let requestBody;
    if (transport === 'multipart') {
      const filePath = multipart?.file_path || '';
      const fileField = multipart?.file_field || 'file';
      const fileName = multipart?.file_name || (filePath ? path.basename(filePath) : 'upload.bin');

      if (!filePath) {
        return { ok: false, status: 0, payload: null, raw: '', error: 'Missing multipart file_path.' };
      }
      if (!fs.existsSync(filePath)) {
        return { ok: false, status: 0, payload: null, raw: '', error: `Multipart file does not exist: ${filePath}` };
      }

      const form = new FormData();
      const fileBuffer = fs.readFileSync(filePath);
      form.append(fileField, new Blob([fileBuffer]), fileName);

      const fields = multipart?.fields || {};
      for (const [fieldName, fieldValue] of Object.entries(fields)) {
        if (fieldValue === undefined || fieldValue === null) {
          continue;
        }
        if (Array.isArray(fieldValue)) {
          for (const item of fieldValue) {
            if (item === undefined || item === null) {
              continue;
            }
            form.append(fieldName, String(item));
          }
          continue;
        }
        form.append(fieldName, String(fieldValue));
      }
      requestBody = form;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const res = await fetch(url, {
      method,
      headers,
      body: requestBody,
    });

    if (responseType === 'binary') {
      const arrayBuffer = await res.arrayBuffer();
      const content = Buffer.from(arrayBuffer);
      const contentDisposition = res.headers.get('content-disposition') || '';
      const suggestedName = parseContentDispositionFilename(contentDisposition);
      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        const rawText = content.toString('utf8');
        return {
          ok: false,
          status: res.status,
          payload: jsonSafe(rawText),
          raw: rawText,
        };
      }

      const outputPath = download?.output_path ? path.resolve(download.output_path) : '';
      let savedPath = '';
      if (outputPath) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, content);
        savedPath = outputPath;
      }

      return {
        ok: res.ok,
        status: res.status,
        payload: {
          bytes: content.length,
          saved_path: savedPath || null,
          suggested_filename: suggestedName || null,
          content_type: contentType || null,
        },
        raw: '',
      };
    }

    const text = await res.text();
    return { ok: res.ok, status: res.status, payload: jsonSafe(text), raw: text };
  } catch (e) {
    return { ok: false, status: 0, payload: null, raw: '', error: e.message };
  }
}

function resolveUrls(opts, envs) {
  const sourceByEnv = envs.find((e) => e.name === opts.sourceEnv)?.base_url || '';
  const targetByEnv = envs.find((e) => e.name === opts.targetEnv)?.base_url || '';
  return {
    source: normalizeApiUrl(opts.sourceUrl || sourceByEnv),
    target: normalizeApiUrl(opts.targetUrl || targetByEnv),
  };
}

function resolveChannel(opts, sourceUrl, targetUrl) {
  if (opts.channel !== 'auto') return { channel: opts.channel, reason: 'explicit channel' };
  if (opts.sshHost) return { channel: 'remote_ssh_cli', reason: 'ssh host provided' };
  const targetLocal = localUrl(targetUrl);
  if (targetLocal === true) return { channel: 'local_cli', reason: 'target URL is local' };
  if (targetLocal === false) return { channel: 'remote_api', reason: 'target URL is remote' };
  if (localUrl(sourceUrl) === true) return { channel: 'local_cli', reason: 'source URL is local fallback' };
  return { channel: 'local_cli', reason: 'default fallback' };
}

function extractApiErrorMessage(apiResult) {
  if (!apiResult) {
    return '';
  }
  const payload = apiResult.payload || {};
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors[0]?.message || '';
  }
  if (typeof payload.message === 'string' && payload.message) {
    return payload.message;
  }
  if (payload.data && typeof payload.data.message === 'string' && payload.data.message) {
    return payload.data.message;
  }
  return apiResult.error || '';
}

function getByPath(source, pathText) {
  const segments = String(pathText || '').split('.').filter(Boolean);
  let current = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function firstPathValue(source, paths = []) {
  for (const pathText of paths) {
    const value = getByPath(source, pathText);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
}

function resolveDefaultMigrationDownloadPath(opts, fileName = '') {
  const fallbackName = `migration_${nowId()}.nbdata`;
  const safeName = fileName || fallbackName;
  return path.join(opts.baseDir, '.tmp-publish', safeName);
}

function resolveDefaultBackupDownloadPath(opts, backupArtifact = '') {
  const fallbackName = `backup_${nowId()}.nbdata`;
  const safeName = backupArtifact || fallbackName;
  return path.join(opts.baseDir, '.tmp-publish', safeName);
}

function normalizeListRows(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
  return [];
}

function normalizeBackupCandidate(row) {
  const name = firstPathValue(row, ['name', 'fileName', 'id']);
  return {
    name: name ? String(name) : '',
    created_at: firstPathValue(row, ['createdAt', 'created_at']) || '',
    size: firstPathValue(row, ['size', 'fileSize', 'sizeText']) || '',
    raw: row,
  };
}

async function listLatestBackupCandidates(baseUrl, tokenPack, limit = 5) {
  if (!baseUrl || !tokenPack?.token) {
    return {
      ok: false,
      artifacts: [],
      attempts: [],
      error: 'Missing source backup list context (baseUrl/token).',
    };
  }

  const request = createResourceOperationRequest('backup_list', {
    page: 1,
    pageSize: limit,
    sort: ['-createdAt'],
  });
  if (!request) {
    return {
      ok: false,
      artifacts: [],
      attempts: [],
      error: 'backup_list resource operation is unavailable.',
    };
  }

  const attempts = [];
  for (const route of request.routes) {
    const api = await callApi({
      route,
      baseUrl,
      token: tokenPack.token,
      method: request.method || 'GET',
      query: request.query,
      body: request.body,
      transport: request.transport || 'json',
      responseType: request.response_type || 'json',
    });
    attempts.push({
      route,
      status: api.status,
      ok: api.ok,
      error: extractApiErrorMessage(api),
    });

    if (!api.ok) {
      continue;
    }

    const rows = normalizeListRows(api.payload);
    const artifacts = rows
      .map((row) => normalizeBackupCandidate(row))
      .filter((row) => row.name)
      .slice(0, limit);
    return {
      ok: true,
      artifacts,
      attempts,
      error: '',
    };
  }

  return {
    ok: false,
    artifacts: [],
    attempts,
    error: 'Unable to list source backup artifacts.',
  };
}

function buildDefaultMigrationRuleValues(migrationTemplate = '') {
  const templateDef = getMigrationTemplateDefinition(migrationTemplate) || getMigrationTemplateDefinition('schema_only_all');
  const normalizedTemplate = templateDef?.key || 'schema_only_all';
  const userGlobalRule = templateDef?.user_global_rule || 'schema-only';
  const systemGlobalRule = templateDef?.system_global_rule || 'schema-only';
  return {
    name: `auto_publish_${normalizedTemplate}_${nowId()}`,
    description: 'Auto generated by nocobase-publish-manage.',
    rules: {
      userDefined: {
        globalRule: userGlobalRule,
        enableIndependentRules: false,
      },
      systemDefined: {
        globalRule: systemGlobalRule,
        enableIndependentRules: false,
      },
    },
  };
}

async function resolveDefaultMigrationRuleId(baseUrl, tokenPack, migrationTemplate = '') {
  if (!baseUrl || !tokenPack?.token) {
    return null;
  }
  const api = await callApi({
    route: '/migrationRules:list',
    baseUrl,
    token: tokenPack.token,
    method: 'GET',
    query: { page: 1, pageSize: 100, sort: ['-id'] },
  });
  if (!api.ok) {
    return null;
  }
  const rows = Array.isArray(api.payload?.data)
    ? api.payload.data
    : Array.isArray(api.payload?.rows)
      ? api.payload.rows
      : Array.isArray(api.payload?.items)
        ? api.payload.items
        : [];
  const withRules = rows.filter(
    (row) => row && typeof row === 'object' && row.rules && typeof row.rules === 'object' && Object.keys(row.rules).length > 0,
  );
  const picked = withRules[0] || rows[0];
  if (picked?.id !== undefined && picked?.id !== null) {
    return picked.id;
  }

  const defaultValues = buildDefaultMigrationRuleValues(migrationTemplate);
  const createBodies = [defaultValues];
  for (const body of createBodies) {
    const created = await callApi({
      route: '/migrationRules:create',
      baseUrl,
      token: tokenPack.token,
      method: 'POST',
      body,
    });
    if (!created.ok) {
      continue;
    }
    const createdId = firstPathValue(created.payload, ['data.id', 'id', 'data.data.id']);
    if (createdId !== '' && createdId !== undefined && createdId !== null) {
      return createdId;
    }
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForMigrationFileReady(baseUrl, tokenPack, fileName, timeoutMs = 120000) {
  if (!fileName || !baseUrl || !tokenPack?.token) {
    return { ok: false, reason: 'missing_context', message: 'Missing fileName/baseUrl/token for migration file status check.' };
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const api = await callApi({
      route: '/migrationFiles:get',
      baseUrl,
      token: tokenPack.token,
      method: 'GET',
      query: { filterByTk: fileName },
    });

    if (!api.ok) {
      const errorText = extractApiErrorMessage(api) || '';
      if (api.status === 404 || /not\s+found/i.test(errorText)) {
        await delay(1000);
        continue;
      }
      return {
        ok: false,
        reason: 'status_failed',
        message: errorText || 'Failed to query migration file status.',
      };
    }

    const status = firstPathValue(api.payload, ['data.status', 'status']);
    if (status === 'ok') {
      return { ok: true, reason: 'ready', message: '' };
    }
    if (status === 'error') {
      return {
        ok: false,
        reason: 'status_error',
        message: firstPathValue(api.payload, ['data.message', 'message']) || 'Migration file generation failed.',
      };
    }

    await delay(1000);
  }

  return {
    ok: false,
    reason: 'timeout',
    message: `Timed out waiting for migration file "${fileName}" to become ready.`,
  };
}

function collectLocalCliTokenRequirements(opts, ctx, commands = []) {
  if (ctx.channel !== 'local_cli' || !Array.isArray(commands) || commands.length === 0) {
    return [];
  }

  const requiredByContext = new Map();
  for (const command of commands) {
    const request = createResourceOperationRequest(command.operation, command.params || {});
    if (!request) {
      continue;
    }
    const runCtlArgs = buildRunCtlResourceArgs(request);
    if (runCtlArgs.length > 0) {
      continue;
    }
    const context = normalizeExecContext(command.exec_context);
    if (!requiredByContext.has(context)) {
      requiredByContext.set(context, new Set());
    }
    requiredByContext.get(context).add(command.operation);
  }

  return Array.from(requiredByContext.entries()).map(([context, operationSet]) => {
    const tokenPack = resolveApiToken(opts, context);
    const fallbackTokenEnv = context === 'source'
      ? (opts.sourceTokenEnv || opts.targetTokenEnv || 'NOCOBASE_API_TOKEN')
      : (opts.targetTokenEnv || 'NOCOBASE_API_TOKEN');
    return {
      context,
      operations: Array.from(operationSet.values()),
      tokenPack,
      tokenEnv: tokenPack.token_env || fallbackTokenEnv,
    };
  });
}

function planCommands(opts, ctx) {
  const generatedBackupId = `backup_${nowId()}.nbdata`;
  const backupId = opts.action === 'rollback' ? (opts.backupArtifact || generatedBackupId) : generatedBackupId;
  const commands = [];

  if (opts.action === 'publish') {
    if (opts.method === 'backup_restore') {
      commands.push({
        step: 'backup-download',
        operation: 'backup_download',
        exec_context: 'source',
        params: {
          backupArtifact: opts.backupArtifact || '',
          outputPathRef: 'latest_backup_file',
        },
      });
      if (opts.backupAuto) {
        commands.push({
          step: 'backup-create',
          operation: 'backup_create',
          exec_context: 'target',
          params: { backupArtifact: backupId },
        });
      }
      commands.push({
        step: 'backup-upload',
        operation: 'backup_upload',
        exec_context: 'target',
        params: {
          filePathRef: 'latest_backup_downloaded',
          fileName: opts.backupArtifact || '',
        },
      });
    } else {
      commands.push({
        step: 'migration-rule-create',
        operation: 'migration_rules_create',
        exec_context: 'source',
        params: {
          values: buildDefaultMigrationRuleValues(opts.migrationTemplate),
        },
      });
      commands.push({
        step: 'migration-generate',
        operation: 'migration_generate',
        exec_context: 'source',
        params: {
          ruleIdRef: 'latest_migration_rule',
          migrationTemplate: opts.migrationTemplate,
        },
      });
      commands.push({
        step: 'migration-download',
        operation: 'migration_files_download',
        exec_context: 'source',
        params: { fileNameRef: 'latest_created', outputPathRef: 'latest_migration_file' },
      });
      if (opts.backupAuto) {
        commands.push({
          step: 'backup-create',
          operation: 'backup_create',
          exec_context: 'target',
          params: { backupArtifact: backupId },
        });
      }
      commands.push({
        step: 'migration-check',
        operation: 'migration_files_check',
        exec_context: 'target',
        params: { filePathRef: 'latest_downloaded' },
      });
      commands.push({
        step: 'migration-up',
        operation: 'migration_up',
        exec_context: 'target',
        params: {
          taskIdRef: 'latest_created',
          migrationTemplate: opts.migrationTemplate,
          envTexts: [],
        },
      });
    }
  }

  if (opts.action === 'verify') {
    if (ctx.channel === 'local_cli') commands.push({ step: 'env-list', lane: 'run_cli', exec_context: 'target', args: ['env', 'list', '-s', opts.scope] });
    if (ctx.channel === 'remote_api') commands.push({ step: 'pm-list', lane: 'remote_api', exec_context: 'target', method: 'GET', route: '/pm:list' });
    if (ctx.channel === 'remote_ssh_cli') commands.push({ step: 'pm-list', lane: 'remote_ssh_cli', exec_context: 'target', ssh: `cd ${opts.sshPath} && nb pm list` });
    if (opts.method === 'backup_restore') {
      commands.push({
        step: 'backup-list',
        operation: 'backup_list',
        exec_context: 'target',
        params: { pageSize: 5, sort: ['-createdAt'] },
      });
    }
  }

  if (opts.action === 'rollback') {
    commands.push({
      step: 'rollback-restore',
      operation: 'backup_restore',
      exec_context: 'target',
      params: { backupArtifact: opts.backupArtifact },
    });
  }
  return { commands, backupId };
}

function shellQuote(arg) {
  return `'${String(arg).replace(/'/g, `'\"'\"'`)}'`;
}

async function executePlan(opts, ctx, commands) {
  const steps = [];
  let ok = true;
  const runtimeState = {
    latestBackupArtifact: '',
    latestBackupDownloadedFile: '',
    latestMigrationRuleId: '',
    latestMigrationFile: '',
    latestMigrationDownloadedFile: '',
    latestMigrationTaskId: '',
    latestRestoreTaskId: '',
  };

  for (const c of commands) {
    const execRuntime = resolveExecContextRuntime(opts, ctx, c.exec_context);

    if (!opts.apply) {
      if (c.operation) {
        const request = createResourceOperationRequest(c.operation, c.params || {});
        steps.push({
          step: c.step,
          lane: 'resource_adapter',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          routes: request?.routes || [],
          status: 'planned',
        });
      } else {
        steps.push({
          step: c.step,
          lane: c.lane,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          status: 'planned',
        });
      }
      continue;
    }

    if (c.operation) {
      const params = { ...(c.params || {}) };
      if (params.backupArtifactRef === 'latest_created' && runtimeState.latestBackupArtifact) {
        params.backupArtifact = runtimeState.latestBackupArtifact;
      }
      if (params.filePathRef === 'latest_backup_downloaded' && runtimeState.latestBackupDownloadedFile) {
        params.filePath = runtimeState.latestBackupDownloadedFile;
      }
      if (params.ruleIdRef === 'latest_migration_rule' && runtimeState.latestMigrationRuleId) {
        params.ruleId = runtimeState.latestMigrationRuleId;
      }
      if (params.fileNameRef === 'latest_created' && runtimeState.latestMigrationFile) {
        params.fileName = runtimeState.latestMigrationFile;
      }
      if (params.taskIdRef === 'latest_created' && runtimeState.latestMigrationTaskId) {
        params.taskId = runtimeState.latestMigrationTaskId;
      }
      if (params.restoreTaskRef === 'latest_created' && runtimeState.latestRestoreTaskId) {
        params.task = runtimeState.latestRestoreTaskId;
      }
      if (params.filePathRef === 'latest_downloaded' && runtimeState.latestMigrationDownloadedFile) {
        params.filePath = runtimeState.latestMigrationDownloadedFile;
      }
      if (params.outputPathRef === 'latest_migration_file') {
        params.outputPath = resolveDefaultMigrationDownloadPath(
          opts,
          params.fileName || runtimeState.latestMigrationFile || '',
        );
      }
      if (params.outputPathRef === 'latest_backup_file') {
        params.outputPath = resolveDefaultBackupDownloadPath(
          opts,
          params.backupArtifact || opts.backupArtifact || '',
        );
      }

      const tokenPack = resolveApiToken(opts, execRuntime.context);
      if (!execRuntime.baseUrl && ctx.channel !== 'remote_ssh_cli') {
        steps.push({
          step: c.step,
          lane: 'resource_api',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          status: 'failed',
          error: `Missing base URL for ${execRuntime.context} context.`,
        });
        ok = false;
        continue;
      }
      const requiresGeneratedRuleId = params.ruleIdRef === 'latest_migration_rule';
      if (requiresGeneratedRuleId && !params.ruleId) {
        steps.push({
          step: c.step,
          lane: ctx.channel === 'remote_api' ? 'remote_api' : 'local_api',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          status: 'failed',
          token_source: tokenPack.source,
          error: 'Missing generated migration rule ID. migrationRules:create must succeed before migrationFiles:create.',
        });
        ok = false;
        continue;
      }
      if ((c.operation === 'migration_generate' || c.operation === 'migration_files_create') && !params.ruleId && !params.ruleIdRef) {
        const defaultRuleId = await resolveDefaultMigrationRuleId(
          execRuntime.baseUrl,
          tokenPack,
          params.migrationTemplate || opts.migrationTemplate || '',
        );
        if (defaultRuleId) {
          params.ruleId = defaultRuleId;
        }
      }
      if (c.operation === 'migration_files_download' && !params.outputPath) {
        params.outputPath = resolveDefaultMigrationDownloadPath(
          opts,
          params.fileName || runtimeState.latestMigrationFile || '',
        );
      }
      if (c.operation === 'backup_download' && !params.outputPath) {
        params.outputPath = resolveDefaultBackupDownloadPath(
          opts,
          params.backupArtifact || opts.backupArtifact || '',
        );
      }
      if (c.operation === 'migration_files_download') {
        const fileNameForWait = params.fileName || runtimeState.latestMigrationFile || '';
        const ready = await waitForMigrationFileReady(execRuntime.baseUrl, tokenPack, fileNameForWait);
        if (!ready.ok) {
          steps.push({
            step: c.step,
            lane: ctx.channel === 'remote_api' ? 'remote_api' : 'local_api',
            operation: c.operation,
            exec_context: execRuntime.context,
            exec_env: execRuntime.envName || '',
            exec_base_url: execRuntime.baseUrl || '',
            status: 'failed',
            token_source: tokenPack.source,
            error: ready.message || 'Migration file is not ready for download.',
          });
          ok = false;
          continue;
        }
      }

      const request = createResourceOperationRequest(c.operation, params);
      if (!request) {
        steps.push({
          step: c.step,
          lane: 'resource_adapter',
          operation: c.operation,
          status: 'failed',
          error: `Unknown resource operation: ${c.operation}`,
        });
        ok = false;
        continue;
      }

      const runCtlArgs = buildRunCtlResourceArgs(request);

      if (ctx.channel === 'local_cli' && runCtlArgs.length > 0 && !tokenPack.token) {
        let envUseResult = null;
        if (execRuntime.envName) {
          envUseResult = runCli(['env', 'use', execRuntime.envName, '-s', opts.scope], opts);
          if (envUseResult.code !== 0) {
            steps.push({
              step: c.step,
              lane: 'run_cli',
              operation: c.operation,
              exec_context: execRuntime.context,
              exec_env: execRuntime.envName || '',
              exec_base_url: execRuntime.baseUrl || '',
              status: 'failed',
              exit_code: envUseResult.code,
              command: envUseResult.command,
              stderr: envUseResult.stderr,
              error: envUseResult.error || `Failed to switch env to ${execRuntime.envName} before operation.`,
            });
            ok = false;
            continue;
          }
        }

        const r = runCli(runCtlArgs, opts);
        const stepOk = r.code === 0;
        let parsedPayload = null;
        if (stepOk) {
          parsedPayload = jsonSafe((r.stdout || '').trim());
        }
        const createdRuleId = firstPathValue(parsedPayload, ['data.id', 'id', 'data.data.id']);
        const createdName = firstPathValue(parsedPayload, ['data.name', 'name']);
        const createdFileName = firstPathValue(parsedPayload, ['data.fileName', 'fileName', 'data.data.fileName']);
        const createdTaskId = firstPathValue(parsedPayload, ['data.task', 'task', 'data.taskId', 'taskId', 'data.data.task']);
        const downloadedPath = firstPathValue(parsedPayload, ['data.saved_path', 'saved_path']);
        if (stepOk && c.operation === 'migration_rules_create' && createdRuleId) {
          runtimeState.latestMigrationRuleId = String(createdRuleId);
        }
        if (stepOk && c.operation === 'backup_create' && createdName) {
          runtimeState.latestBackupArtifact = createdName;
        }
        if (
          stepOk &&
          (c.operation === 'migration_files_create' || c.operation === 'migration_generate') &&
          createdFileName
        ) {
          runtimeState.latestMigrationFile = createdFileName;
        }
        if (
          stepOk &&
          (c.operation === 'migration_files_check' || c.operation === 'migration_up' || c.operation === 'migration_files_run_task') &&
          createdTaskId
        ) {
          runtimeState.latestMigrationTaskId = createdTaskId;
        }
        if (stepOk && (c.operation === 'backup_restore' || c.operation === 'backup_upload') && createdTaskId) {
          runtimeState.latestRestoreTaskId = createdTaskId;
        }
        if (stepOk && c.operation === 'migration_files_download' && downloadedPath) {
          runtimeState.latestMigrationDownloadedFile = downloadedPath;
        }
        if (stepOk && c.operation === 'backup_download' && downloadedPath) {
          runtimeState.latestBackupDownloadedFile = downloadedPath;
        }

        steps.push({
          step: c.step,
          lane: 'run_cli',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          status: stepOk ? 'done' : 'failed',
          exit_code: r.code,
          env_use_exit_code: envUseResult?.code ?? null,
          env_use_command: envUseResult?.command || [],
          command: r.command,
          artifact_name: createdName || '',
          rule_id: createdRuleId || params.ruleId || '',
          request_rule_id: params.ruleId || '',
          migration_file: createdFileName || '',
          downloaded_file: downloadedPath || '',
          task_id: createdTaskId || '',
          stderr: r.stderr,
          error: r.error,
        });
        if (!stepOk) ok = false;
        continue;
      }

      if (ctx.channel === 'remote_ssh_cli' && runCtlArgs.length > 0) {
        if (execRuntime.context === 'source' && opts.sourceEnv && opts.targetEnv && opts.sourceEnv !== opts.targetEnv) {
          steps.push({
            step: c.step,
            lane: 'remote_ssh_cli',
            operation: c.operation,
            exec_context: execRuntime.context,
            exec_env: execRuntime.envName || '',
            status: 'failed',
            error: 'remote_ssh_cli source context is not supported for cross-env publish. Use local_cli or remote_api.',
          });
          ok = false;
          continue;
        }
        const resourceCmd = runCtlArgs.map((part) => shellQuote(part)).join(' ');
        const ssh = `cd ${shellQuote(opts.sshPath)} && nb ${resourceCmd}`;
        const r = runSsh(ssh, opts);
        const stepOk = r.code === 0;
        steps.push({
          step: c.step,
          lane: 'remote_ssh_cli',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          status: stepOk ? 'done' : 'failed',
          exit_code: r.code,
          stderr: r.stderr,
          error: r.error,
        });
        if (!stepOk) ok = false;
        continue;
      }

      if (ctx.channel === 'remote_ssh_cli' && runCtlArgs.length === 0) {
        steps.push({
          step: c.step,
          lane: 'remote_ssh_cli',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          status: 'failed',
          error: `Operation ${c.operation} requires direct API route and is not available via remote_ssh_cli adapter.`,
        });
        ok = false;
        continue;
      }

      if (!tokenPack.token) {
        steps.push({
          step: c.step,
          lane: 'resource_api',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          status: 'failed',
          error: `Missing API token for operation ${c.operation}.`,
          token_source: tokenPack.source,
        });
        ok = false;
        continue;
      }

      const attempts = [];
      let successful = null;
      for (const route of request.routes) {
        const api = await callApi({
          route,
          baseUrl: execRuntime.baseUrl,
          token: tokenPack.token,
          method: request.method || 'POST',
          query: request.query,
          body: request.body,
          transport: request.transport || 'json',
          multipart: request.multipart || null,
          responseType: request.response_type || 'json',
          download: request.download || null,
        });
        attempts.push({
          route,
          method: request.method || 'POST',
          status: api.status,
          ok: api.ok,
          error: extractApiErrorMessage(api),
        });
        if (api.ok) {
          successful = { route, api };
          break;
        }
      }

      if (successful?.api?.ok) {
        const createdRuleId = firstPathValue(successful.api?.payload, ['data.id', 'id', 'data.data.id']);
        const createdName = firstPathValue(successful.api?.payload, ['data.name', 'name']);
        const createdFileName = firstPathValue(successful.api?.payload, ['data.fileName', 'fileName', 'data.data.fileName']);
        const createdTaskId = firstPathValue(
          successful.api?.payload,
          ['data.task', 'task', 'data.taskId', 'taskId', 'data.data.task'],
        );
        const downloadedPath = firstPathValue(successful.api?.payload, ['data.saved_path', 'saved_path']);
        if (c.operation === 'migration_rules_create' && createdRuleId) {
          runtimeState.latestMigrationRuleId = String(createdRuleId);
        }
        if (c.operation === 'backup_create' && createdName) {
          runtimeState.latestBackupArtifact = createdName;
        }
        if ((c.operation === 'migration_files_create' || c.operation === 'migration_generate') && createdFileName) {
          runtimeState.latestMigrationFile = createdFileName;
        }
        if (
          (c.operation === 'migration_files_check' || c.operation === 'migration_files_run_task' || c.operation === 'migration_up') &&
          createdTaskId
        ) {
          runtimeState.latestMigrationTaskId = createdTaskId;
        }
        if ((c.operation === 'backup_restore' || c.operation === 'backup_upload') && createdTaskId) {
          runtimeState.latestRestoreTaskId = createdTaskId;
        }
        if (c.operation === 'migration_files_download' && downloadedPath) {
          runtimeState.latestMigrationDownloadedFile = downloadedPath;
        }
        if (c.operation === 'backup_download' && downloadedPath) {
          runtimeState.latestBackupDownloadedFile = downloadedPath;
        }
        steps.push({
          step: c.step,
          lane: ctx.channel === 'remote_api' ? 'remote_api' : 'local_api',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          status: 'done',
          route: successful.route,
          response_status: successful.api.status,
          token_source: tokenPack.source,
          artifact_name: createdName || '',
          rule_id: createdRuleId || params.ruleId || '',
          request_rule_id: params.ruleId || '',
          migration_file: createdFileName || '',
          downloaded_file: downloadedPath || '',
          task_id: createdTaskId || '',
          response_payload: successful.api.payload || null,
          attempts,
        });
      } else {
        steps.push({
          step: c.step,
          lane: ctx.channel === 'remote_api' ? 'remote_api' : 'local_api',
          operation: c.operation,
          exec_context: execRuntime.context,
          exec_env: execRuntime.envName || '',
          exec_base_url: execRuntime.baseUrl || '',
          status: 'failed',
          token_source: tokenPack.source,
          attempts,
          error: `All candidate routes failed for operation ${c.operation}.`,
        });
        ok = false;
      }
      continue;
    }

    if (c.lane === 'run_cli') {
      if (execRuntime.envName) {
        const envUseResult = runCli(['env', 'use', execRuntime.envName, '-s', opts.scope], opts);
        if (envUseResult.code !== 0) {
          steps.push({
            step: c.step,
            lane: c.lane,
            exec_context: execRuntime.context,
            exec_env: execRuntime.envName || '',
            exec_base_url: execRuntime.baseUrl || '',
            status: 'failed',
            exit_code: envUseResult.code,
            command: envUseResult.command,
            stderr: envUseResult.stderr,
            error: envUseResult.error || `Failed to switch env to ${execRuntime.envName} before operation.`,
          });
          ok = false;
          continue;
        }
      }
      const r = runCli(c.args, opts);
      const stepOk = r.code === 0;
      steps.push({
        step: c.step,
        lane: c.lane,
        exec_context: execRuntime.context,
        exec_env: execRuntime.envName || '',
        exec_base_url: execRuntime.baseUrl || '',
        status: stepOk ? 'done' : 'failed',
        exit_code: r.code,
        command: r.command,
        stderr: r.stderr,
        error: r.error,
      });
      if (!stepOk) ok = false;
      continue;
    }
    if (c.lane === 'remote_ssh_cli') {
      const r = runSsh(c.ssh, opts);
      const stepOk = r.code === 0;
      steps.push({
        step: c.step,
        lane: c.lane,
        exec_context: execRuntime.context,
        exec_env: execRuntime.envName || '',
        exec_base_url: execRuntime.baseUrl || '',
        status: stepOk ? 'done' : 'failed',
        exit_code: r.code,
        stderr: r.stderr,
        error: r.error,
      });
      if (!stepOk) ok = false;
      continue;
    }
    const apiMethod = c.method || 'GET';
    const tokenPack = resolveApiToken(opts, execRuntime.context);
    const api = await callApi({
      route: c.route,
      baseUrl: execRuntime.baseUrl,
      token: tokenPack.token,
      tokenEnv: tokenPack.token_env,
      method: apiMethod,
    });
    steps.push({
      step: c.step,
      lane: c.lane,
      exec_context: execRuntime.context,
      exec_env: execRuntime.envName || '',
      exec_base_url: execRuntime.baseUrl || '',
      status: api.ok ? 'done' : 'failed',
      method: apiMethod,
      route: c.route,
      response_status: api.status,
      token_source: tokenPack.source,
      error: api.error || '',
    });
    if (!api.ok) ok = false;
  }
  return {
    ok,
    steps,
      latest_backup_artifact: runtimeState.latestBackupArtifact || '',
      latest_backup_downloaded_file: runtimeState.latestBackupDownloadedFile || '',
      latest_migration_rule_id: runtimeState.latestMigrationRuleId || '',
      latest_migration_file: runtimeState.latestMigrationFile || '',
      latest_migration_downloaded_file: runtimeState.latestMigrationDownloadedFile || '',
      latest_migration_task_id: runtimeState.latestMigrationTaskId || '',
      latest_restore_task_id: runtimeState.latestRestoreTaskId || '',
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const envListCall = runCli(['env', 'list', '-s', opts.scope], opts);
  const envs = envListCall.code === 0 ? parseEnvRows(envListCall.stdout) : [];
  const urls = resolveUrls(opts, envs);
  const channelResolution = resolveChannel(opts, urls.source, urls.target);
  const ctx = { channel: channelResolution.channel, sourceUrl: urls.source, targetUrl: urls.target };

  const blockers = [];
  const warnings = [];
  const checks = [];
  const actionRequired = [];
  const backupCandidates = [];
  let sourceEnvExists = null;
  let targetEnvExists = null;
  let targetCliReady = opts.targetEnv ? false : null;
  const pluginCheck = {
    pm_list_exit_code: null,
    pro_plugin_detected: null,
    required_plugins: [],
  };

  if (envListCall.code !== 0) {
    checks.push({
      id: 'REL-CLI-001',
      ok: false,
      message: 'CLI env inventory check failed.',
    });
    blockers.push('CLI detection failed. Please run env bootstrap repair before publish.');
    actionRequired.push({
      type: 'env_bootstrap_repair',
      skill: '$nocobase-env-bootstrap',
      prompt: `Use $nocobase-env-bootstrap task=app-manage to repair env CLI and ensure source=${opts.sourceEnv || 'local'} target=${opts.targetEnv || 'test'} are available.`,
    });
  } else {
    checks.push({
      id: 'REL-CLI-001',
      ok: true,
      message: 'CLI env inventory check passed.',
    });
  }

  if (envListCall.code === 0) {
    if (opts.sourceEnv) {
      sourceEnvExists = envs.some((env) => env.name === opts.sourceEnv);
      checks.push({
        id: 'REL-ENV-001',
        ok: sourceEnvExists,
        message: sourceEnvExists
          ? `Source env "${opts.sourceEnv}" exists.`
          : `Source env "${opts.sourceEnv}" is missing.`,
      });
      if (!sourceEnvExists) {
        blockers.push(`Source env "${opts.sourceEnv}" missing.`);
      }
    }

    if (opts.targetEnv) {
      targetEnvExists = envs.some((env) => env.name === opts.targetEnv);
      if (targetEnvExists === true) targetCliReady = true;
      checks.push({
        id: 'REL-ENV-002',
        ok: targetEnvExists,
        message: targetEnvExists
          ? `Target env "${opts.targetEnv}" exists.`
          : `Target env "${opts.targetEnv}" is missing.`,
      });
      if (!targetEnvExists) {
        blockers.push(`Target env "${opts.targetEnv}" missing.`);
      }
    }

    if (sourceEnvExists === false || targetEnvExists === false) {
      const missing = [
        sourceEnvExists === false ? `source=${opts.sourceEnv}` : '',
        targetEnvExists === false ? `target=${opts.targetEnv}` : '',
      ].filter(Boolean).join(', ');
      actionRequired.push({
        type: 'add_env',
        skill: '$nocobase-env-bootstrap',
        prompt: `Use $nocobase-env-bootstrap task=app-manage to add/select envs. Missing: ${missing || `source=${opts.sourceEnv || 'local'}, target=${opts.targetEnv || 'test'}`}.`,
      });
    }
  }

  if (envListCall.code === 0 && opts.sourceEnv && sourceEnvExists === true) {
    const sourceUpdate = runCli(['env', 'update', opts.sourceEnv, '-s', opts.scope], opts);
    checks.push({
      id: 'REL-CLI-002',
      ok: sourceUpdate.code === 0,
      message: sourceUpdate.code === 0
        ? `Source env "${opts.sourceEnv}" CLI update check passed.`
        : `Source env "${opts.sourceEnv}" CLI update check failed.`,
    });
    if (sourceUpdate.code !== 0) {
      blockers.push(`Source env "${opts.sourceEnv}" is not CLI-ready.`);
      actionRequired.push({
        type: 'env_bootstrap_repair',
        skill: '$nocobase-env-bootstrap',
        prompt: `Use $nocobase-env-bootstrap task=app-manage to repair source env "${opts.sourceEnv}".`,
      });
    }
  }

  if (envListCall.code === 0 && opts.targetEnv && targetEnvExists === true) {
    const targetUpdate = runCli(['env', 'update', opts.targetEnv, '-s', opts.scope], opts);
    checks.push({
      id: 'REL-CLI-003',
      ok: targetUpdate.code === 0,
      message: targetUpdate.code === 0
        ? `Target env "${opts.targetEnv}" CLI update check passed.`
        : `Target env "${opts.targetEnv}" CLI update check failed.`,
    });
    if (targetUpdate.code !== 0) {
      targetCliReady = false;
      blockers.push(`Target env "${opts.targetEnv}" is not CLI-ready.`);
      actionRequired.push({
        type: 'env_bootstrap_repair',
        skill: '$nocobase-env-bootstrap',
        prompt: `Use $nocobase-env-bootstrap task=app-manage to repair target env "${opts.targetEnv}".`,
      });
    } else {
      targetCliReady = true;
    }
  }

  checks.push({ id: 'REL-CHK-001', ok: Boolean(ctx.targetUrl || ctx.channel === 'remote_ssh_cli'), message: 'target context resolved' });
  if (!ctx.targetUrl && ctx.channel !== 'remote_ssh_cli') blockers.push('Missing target URL. Provide --target-url or --target-env.');

  if (ctx.channel === 'remote_api') {
    const tokenEnv = opts.targetTokenEnv || 'NOCOBASE_API_TOKEN';
    const tokenReady = Boolean((process.env[tokenEnv] || '').trim());
    checks.push({ id: 'REL-CHK-002', ok: tokenReady, message: `remote token env ${tokenEnv}` });
    if (!tokenReady) blockers.push(`Missing remote token env: ${tokenEnv}`);
  }
  if (ctx.channel === 'remote_ssh_cli') {
    const sshReady = Boolean(opts.sshHost && opts.sshPath);
    checks.push({ id: 'REL-CHK-003', ok: sshReady, message: 'ssh target params' });
    if (!sshReady) blockers.push('Missing --ssh-host or --ssh-path.');
  }

  if (envListCall.code === 0 && opts.targetEnv && targetEnvExists === true && targetCliReady === true) {
    const pmInspection = inspectPmListViaCli(opts, opts.targetEnv);
    pluginCheck.pm_list_exit_code = pmInspection.pm_result?.code ?? null;
    if (!pmInspection.ok) {
      checks.push({
        id: 'REL-CLI-004',
        ok: false,
        message: 'Target pm list check failed.',
      });
      blockers.push('Target plugin inventory check failed (pm list).');
      actionRequired.push({
        type: 'env_bootstrap_repair',
        skill: '$nocobase-env-bootstrap',
        prompt: `Use $nocobase-env-bootstrap task=app-manage to repair target env "${opts.targetEnv}" CLI API capability.`,
      });
    } else {
      checks.push({
        id: 'REL-CLI-004',
        ok: true,
        message: 'Target pm list check passed.',
      });

      const capabilityPlugin = findPluginByAliases(pmInspection.plugins, PUBLISH_CAPABILITY_SENTINELS);
      const capabilityDetected = Boolean(capabilityPlugin && parsePluginEnabled(capabilityPlugin) === true);
      pluginCheck.pro_plugin_detected = capabilityDetected;
      checks.push({
        id: 'REL-PRO-001',
        ok: capabilityDetected,
        message: capabilityDetected
          ? 'Commercial capability detected via migration-manager plugin.'
          : 'Commercial capability not detected via migration-manager plugin.',
      });
      if (!capabilityDetected) {
        blockers.push('Commercial capability missing: migration-manager plugin is not enabled.');
        actionRequired.push({
          type: 'purchase_commercial',
          message: 'Commercial capability is required. If already purchased, restart the target app and retry precheck.',
          url: COMMERCIAL_URL,
        });
        actionRequired.push({
          type: 'restart_app',
          message: `If this environment already purchased commercial edition, restart target env "${opts.targetEnv}" and rerun precheck.`,
        });
      }

      for (const requirement of REQUIRED_RELEASE_PLUGINS) {
        const found = findPluginByAliases(pmInspection.plugins, requirement.aliases);
        const enabled = parsePluginEnabled(found);
        const exists = Boolean(found);
        pluginCheck.required_plugins.push({
          id: requirement.id,
          package_name: requirement.package_name,
          exists,
          enabled,
        });

        checks.push({
          id: `REL-PLG-${requirement.id}`,
          ok: exists && enabled === true,
          message: exists
            ? enabled === true
              ? `${requirement.id} is enabled.`
              : `${requirement.id} exists but is not enabled.`
            : `${requirement.id} is missing.`,
        });

        if (!exists || enabled !== true) {
          blockers.push(`Required plugin not ready: ${requirement.id}.`);
        }
      }

      const notReadyPackages = pluginCheck.required_plugins
        .filter((p) => !p.exists || p.enabled !== true)
        .map((p) => p.package_name);

      if (notReadyPackages.length > 0) {
        actionRequired.push({
          type: 'activate_plugins',
          skill: '$nocobase-plugin-manage',
          prompt: `Use $nocobase-plugin-manage enable ${notReadyPackages.join(' ')}`,
          plugins: notReadyPackages,
        });
      }
    }
  }

  if (
    opts.method === 'backup_restore' &&
    envListCall.code === 0 &&
    sourceEnvExists === true
  ) {
    const sourceRuntime = resolveExecContextRuntime(opts, ctx, 'source');
    const sourceTokenPack = resolveApiToken(opts, 'source');
    const candidateResult = await listLatestBackupCandidates(sourceRuntime.baseUrl, sourceTokenPack, 5);
    backupCandidates.push(...candidateResult.artifacts);

    checks.push({
      id: 'REL-BKP-001',
      ok: candidateResult.ok,
      message: candidateResult.ok
        ? `Loaded ${backupCandidates.length} source backup candidates for selection.`
        : 'Failed to load source backup candidates for selection.',
    });

    if (!candidateResult.ok) {
      warnings.push(candidateResult.error || 'Unable to query source backup candidates.');
    }

    const hasSelectedBackup = Boolean(opts.backupArtifact && opts.backupArtifact.trim());
    if (opts.action === 'publish' && opts.apply && !hasSelectedBackup) {
      blockers.push('When publish method is "Use existing backup package", selecting a source backup artifact is required before execution.');
      actionRequired.push({
        type: 'choose_backup_artifact',
        must_confirm_by_user: true,
        auto_resolve_forbidden: true,
        method: 'backup_restore',
        method_label: methodUiMeta('backup_restore').label,
        source_env: sourceRuntime.envName || opts.sourceEnv || '',
        source_base_url: sourceRuntime.baseUrl || '',
        message: 'Choose one backup artifact and rerun with --backup-artifact <name>.',
        backup_candidates: backupCandidates.map((item) => ({
          name: item.name,
          created_at: item.created_at,
          size: item.size,
        })),
      });
    }
  }

  const compatibility = {
    source_db_driver: '',
    target_db_driver: '',
    source_db_major: '',
    target_db_major: '',
  };
  const templateRules = evaluateMigrationTemplateRules({
    action: opts.action,
    method: opts.method,
    template: opts.migrationTemplate,
    backupAuto: opts.backupAuto,
    compatibility,
  });
  checks.push(...templateRules.checks);
  blockers.push(...templateRules.blockers);
  warnings.push(...templateRules.warnings);
  warnings.push(...opts.templateWarnings);

  if (opts.method === 'migration' && !opts.migrationTemplate) {
    actionRequired.push({
      type: 'choose_migration_template',
      must_confirm_by_user: true,
      auto_resolve_forbidden: true,
      method: 'migration',
      method_label: methodUiMeta('migration').label,
      message: 'For "Create new release package", choose one migration template preset and rerun with --migration-template <key>.',
      options: getMigrationTemplateOptions().map((option) => ({
        key: option.key,
        label: option.label,
        description: option.description,
        user_defined_rule: option.user_defined_rule,
        system_defined_rule: option.system_defined_rule,
        high_risk: option.high_risk,
      })),
      rerun_example: 'node ./scripts/publish-manage.mjs publish --method migration --publish-method-confirm migration --migration-template <template-key> --apply --confirm confirm',
    });
  }

  if (opts.action === 'publish' && opts.apply) {
    const publishMethodGateOk = opts.publishMethodConfirm === opts.method;
    const selectedMethodMeta = methodUiMeta(opts.method);
    checks.push({
      id: 'REL-GATE-001',
      ok: publishMethodGateOk,
      message: publishMethodGateOk
        ? `Publish method gate confirmed: ${opts.method} (${selectedMethodMeta.label}).`
        : 'Publish method gate not confirmed.',
    });
    if (!publishMethodGateOk) {
      blockers.push('Publish method gate not confirmed: choose a publish method before execution.');
      actionRequired.push({
        type: 'choose_publish_method',
        must_confirm_by_user: true,
        auto_resolve_forbidden: true,
        message: 'Before publish execution, choose a method and confirm with --publish-method-confirm <same-as--method>.',
        options: [
          {
            method: 'backup_restore',
            label: methodUiMeta('backup_restore').label,
            description: methodUiMeta('backup_restore').description,
          },
          {
            method: 'migration',
            label: methodUiMeta('migration').label,
            description: methodUiMeta('migration').description,
          },
        ],
        selected_method: opts.method,
        selected_method_label: selectedMethodMeta.label,
        rerun_example: `node ./scripts/publish-manage.mjs publish --method ${opts.method} --publish-method-confirm ${opts.method} --apply --confirm confirm`,
      });
    }
  }

  if (!opts.sourceEnv && !opts.sourceUrl) warnings.push('source context not explicit; source env defaults to local.');

  const plan = planCommands(opts, ctx);
  const tokenNeeds = collectLocalCliTokenRequirements(opts, ctx, plan.commands);
  for (const need of tokenNeeds) {
    const tokenReady = Boolean(need.tokenPack?.token);
    checks.push({
      id: need.context === 'source' ? 'REL-TKN-001' : 'REL-TKN-002',
      ok: tokenReady,
      message: tokenReady
        ? `Token for ${need.context} direct API steps is ready via ${need.tokenPack.source}.`
        : `Token for ${need.context} direct API steps is missing.`,
    });
    if (!tokenReady) {
      blockers.push(`Missing API token for ${need.context} context: ${need.tokenEnv}. Required for operations: ${need.operations.join(', ')}.`);
      actionRequired.push({
        type: 'set_api_token_env',
        context: need.context,
        token_env: need.tokenEnv,
        operations: need.operations,
        must_confirm_by_user: true,
        message: `Set ${need.tokenEnv} for ${need.context} context and rerun.`,
      });
    }
  }

  let execution = {
    ok: true,
    steps: [],
    latest_backup_artifact: '',
    latest_backup_downloaded_file: '',
    latest_migration_rule_id: '',
  };
  if (opts.action !== 'precheck' && blockers.length === 0) {
    execution = await executePlan(opts, ctx, plan.commands);
  } else if (opts.action !== 'precheck') {
    execution = {
      ok: false,
      steps: [],
      latest_backup_artifact: '',
      latest_backup_downloaded_file: '',
      latest_migration_rule_id: '',
    };
  }

  let verification = blockers.length ? 'failed' : 'passed';
  if (opts.action !== 'precheck') {
    if (!execution.ok) verification = 'failed';
    else if (!opts.apply) verification = 'pending_verification';
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: verification !== 'failed',
      request: {
        action: opts.action,
        method: opts.method,
        publish_method_confirm: opts.publishMethodConfirm || null,
        migration_template: opts.migrationTemplate || null,
        legacy_mode: opts.modeLegacy || null,
        channel: opts.channel,
        apply: opts.apply,
        backup_auto: opts.backupAuto,
      },
      channel: ctx.channel,
      target_resolution: {
        reason: channelResolution.reason,
        source_base_url: ctx.sourceUrl || null,
        target_base_url: ctx.targetUrl || null,
      },
      pre_state: { available_envs: envs, env_list_exit_code: envListCall.code },
      plugin_checks: pluginCheck,
      backup_candidates: backupCandidates.map((item) => ({
        name: item.name,
        created_at: item.created_at,
        size: item.size,
      })),
      checks,
      blockers,
      warnings,
      action_required: actionRequired,
      backup_artifact: execution.latest_backup_artifact || plan.backupId,
      commands_or_actions: plan.commands,
      execution,
      verification,
      assumptions: [
        opts.channel === 'auto' ? `channel auto-resolved to ${ctx.channel}` : 'channel explicitly set',
        opts.targetTokenEnv ? `target token env is ${opts.targetTokenEnv}` : 'target token env defaulted to NOCOBASE_API_TOKEN',
        opts.method === 'migration'
          ? (opts.migrationTemplate ? `migration template selected: ${opts.migrationTemplate}` : 'migration template not selected yet')
          : 'migration template not required for backup_restore',
      ],
      fallback_hints: verification === 'failed'
        ? [
            'Run precheck until blockers are empty.',
            `If commercial capability is missing, purchase at ${COMMERCIAL_URL}, or restart the target app after purchase.`,
            'If release plugins are not active, run $nocobase-plugin-manage enable for required plugins.',
            'For remote_api, verify token and runtime action routes.',
            'For remote_ssh_cli, verify SSH connectivity and target path.',
          ]
        : [],
      next_steps: verification === 'passed'
        ? ['Run verify action for post-release readback.']
        : verification === 'pending_verification'
          ? ['Rerun with --apply --confirm confirm when ready.']
          : ['Fix blockers and rerun precheck.'],
    }, null, 2)}\n`,
  );
}

main().catch((e) => fail('RELEASE_RUNTIME_ERROR', 'Unexpected runtime error.', { detail: e.message }));


