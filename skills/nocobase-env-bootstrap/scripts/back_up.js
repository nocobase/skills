#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

const AUTH_MODES = new Set(['oauth', 'token']);
const SCOPES = new Set(['project', 'global']);

const defaults = {
  port: 13000,
  envName: 'local',
  tokenEnv: 'NOCOBASE_API_TOKEN',
  authMode: 'oauth',
  scope: 'project',
  prefer: 'auto',
  baseDir: '',  // empty = process.cwd() at runtime
  ctlDir: '',   // empty = process.cwd() at runtime (workspace root)
  baseUrl: '',
  skipUpdate: false,
  disableAutoApiKey: false,
  autoApiKeyName: 'cli_auto_token',
  autoApiKeyUsername: 'nocobase',
  autoApiKeyRole: 'root',
  autoApiKeyExpiresIn: '30d',
  autoApiKeyAppService: 'app',
  autoApiKeyComposeFile: '',
};

const counters = {
  fail: 0,
  warn: 0,
  pass: 0,
};

function record(level, id, message, fix = '') {
  process.stdout.write(`[${level}] ${id}: ${message}\n`);
  if (fix) {
    process.stdout.write(`  fix: ${fix}\n`);
  }
  if (level === 'fail') {
    counters.fail += 1;
  } else if (level === 'warn') {
    counters.warn += 1;
  } else if (level === 'pass') {
    counters.pass += 1;
  }
}

function printSummaryAndExit() {
  process.stdout.write(`summary: fail=${counters.fail} warn=${counters.warn} pass=${counters.pass}\n`);
  process.exit(counters.fail > 0 ? 1 : 0);
}

function printHelp() {
  const lines = [
    'Usage:',
    '  OAuth mode (default):',
    '    node ./scripts/cli-postcheck.mjs --base-dir <app_dir> --ctl-dir <workspace_dir>',
    '  Token mode:',
    '    node ./scripts/cli-postcheck.mjs --auth-mode token --token-env NOCOBASE_API_TOKEN --base-dir <app_dir> --ctl-dir <workspace_dir>',
    '  Legacy positional form:',
    '    node ./scripts/cli-postcheck.mjs [port] [env_name] [token_env] [scope]',
    '',
    'PowerShell-compatible flags are also supported:',
    '  -Port -EnvName -TokenEnv -AuthMode -Scope -Prefer -BaseDir -CtlDir -BaseUrl -SkipUpdate',
    '  -DisableAutoApiKey -AutoApiKeyName -AutoApiKeyUsername -AutoApiKeyRole -AutoApiKeyExpiresIn -AutoApiKeyAppService -AutoApiKeyComposeFile',
    '',
    'Flags:',
    '  --base-dir <dir>             App directory for yarn/docker commands (default: cwd)',
    '  --ctl-dir <dir>              Workspace root where .nocobase-ctl/config.json is stored (default: cwd)',
    '  --token-env <name>           Token env var name; required only when --auth-mode token',
    '  --prefer auto|global|local   nocobase-ctl resolver preference (default: auto)',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function normalizeKey(raw) {
  return String(raw || '').replace(/^-+/, '').trim().toLowerCase();
}

function parseBooleanText(value, optionName) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value for ${optionName}: ${value}`);
}

function parseArgs(argv) {
  const options = { ...defaults };
  const positionals = [];

  const assignValue = (key, value) => {
    switch (key) {
      case 'port':
        options.port = Number(value);
        return;
      case 'envname':
      case 'env-name':
        options.envName = String(value || '');
        return;
      case 'tokenenv':
      case 'token-env':
        options.tokenEnv = String(value || '');
        return;
      case 'authmode':
      case 'auth-mode':
        options.authMode = String(value || '').toLowerCase();
        return;
      case 'scope':
        options.scope = String(value || '').toLowerCase();
        return;
      case 'prefer':
        options.prefer = String(value || '').toLowerCase();
        return;
      case 'basedir':
      case 'base-dir':
        options.baseDir = String(value || '');
        return;
      case 'ctldir':
      case 'ctl-dir':
        options.ctlDir = String(value || '');
        return;
      case 'baseurl':
      case 'base-url':
        options.baseUrl = String(value || '');
        return;
      case 'skipupdate':
      case 'skip-update':
        options.skipUpdate = parseBooleanText(value, key);
        return;
      case 'disableautoapikey':
      case 'disable-auto-api-key':
        options.disableAutoApiKey = parseBooleanText(value, key);
        return;
      case 'autoapikeyname':
      case 'auto-api-key-name':
        options.autoApiKeyName = String(value || '');
        return;
      case 'autoapikeyusername':
      case 'auto-api-key-username':
        options.autoApiKeyUsername = String(value || '');
        return;
      case 'autoapikeyrole':
      case 'auto-api-key-role':
        options.autoApiKeyRole = String(value || '');
        return;
      case 'autoapikeyexpiresin':
      case 'auto-api-key-expires-in':
        options.autoApiKeyExpiresIn = String(value || '');
        return;
      case 'autoapikeyappservice':
      case 'auto-api-key-app-service':
        options.autoApiKeyAppService = String(value || '');
        return;
      case 'autoapikeycomposefile':
      case 'auto-api-key-compose-file':
        options.autoApiKeyComposeFile = String(value || '');
        return;
      default:
        throw new Error(`Unknown option: ${key}`);
    }
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    if (arg.includes('=')) {
      const [rawKey, rawValue] = arg.split(/=(.*)/, 2);
      const key = normalizeKey(rawKey);
      assignValue(key, rawValue);
      continue;
    }

    const key = normalizeKey(arg);
    const flagOnlyKeys = new Set(['skipupdate', 'skip-update', 'disableautoapikey', 'disable-auto-api-key']);
    if (flagOnlyKeys.has(key)) {
      if (key.includes('skip')) {
        options.skipUpdate = true;
      } else {
        options.disableAutoApiKey = true;
      }
      continue;
    }

    const next = argv[i + 1];
    if (next === undefined) {
      throw new Error(`Missing value for option: ${arg}`);
    }
    i += 1;
    assignValue(key, next);
  }

  if (positionals.length > 4) {
    throw new Error('Unsupported extra positional arguments. Expected: <port> <env_name> <token_env> <scope>.');
  }
  if (positionals[0] !== undefined) {
    options.port = Number(positionals[0]);
  }
  if (positionals[1] !== undefined) {
    options.envName = String(positionals[1]);
  }
  if (positionals[2] !== undefined) {
    options.tokenEnv = String(positionals[2]);
  }
  if (positionals[3] !== undefined) {
    options.scope = String(positionals[3]).toLowerCase();
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!AUTH_MODES.has(options.authMode)) {
    throw new Error(`Invalid auth mode: ${options.authMode}. Expected oauth|token.`);
  }
  if (!['auto', 'global', 'local'].includes(options.prefer)) {
    throw new Error(`Invalid prefer: ${options.prefer}. Expected auto|global|local.`);
  }
  if (!SCOPES.has(options.scope)) {
    throw new Error(`Invalid scope: ${options.scope}. Expected project|global.`);
  }
  if (!options.envName.trim()) {
    throw new Error('envName cannot be empty.');
  }
  if (options.authMode === 'token' && !options.tokenEnv.trim()) {
    throw new Error('tokenEnv cannot be empty when authMode=token.');
  }
  return options;
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function resolveCtlCommand() {
  if (commandExists('nocobase-ctl')) {
    return 'nocobase-ctl';
  }
  if (commandExists('nbctl')) {
    return 'nbctl';
  }
  return '';
}

function runCommand(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
}

function buildCommandInvocation(command, args) {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args],
    };
  }
  return { command, args };
}

function runCtlCommand(command, args, cwd) {
  const invocation = buildCommandInvocation(command, args);
  return runCommand(invocation.command, invocation.args, cwd);
}

function commandText(result) {
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function extractAuthorizationUrl(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s"'<>]+/g);
  if (!matches || matches.length === 0) {
    return '';
  }
  return matches.find((url) => url.includes('response_type=code'))
    || matches.find((url) => url.includes('/authorize'))
    || matches[0];
}

function emitOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stdout.write(result.stderr);
  }
}

function runCtl(ctlArgs, cwd, prefer = 'auto', ctlDir = cwd) {
  void prefer;
  const ctlCommand = resolveCtlCommand();
  if (!ctlCommand) {
    return {
      status: 1,
      stdout: '',
      stderr: 'cli-postcheck error: Cannot find nocobase-ctl or nbctl. Install nocobase-ctl first.\n',
    };
  }
  return runCtlCommand(ctlCommand, ctlArgs, ctlDir);
}

function runCtlStreaming(ctlArgs, cwd, prefer = 'auto', ctlDir = cwd) {
  void prefer;
  const ctlCommand = resolveCtlCommand();
  if (!ctlCommand) {
    return Promise.resolve({
      status: 1,
      stdout: '',
      stderr: 'cli-postcheck error: Cannot find nocobase-ctl or nbctl. Install nocobase-ctl first.\n',
      authorizationUrl: '',
    });
  }

  const invocation = buildCommandInvocation(ctlCommand, ctlArgs);
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let authorizationUrl = '';
    let settled = false;

    const child = spawn(invocation.command, invocation.args, {
      cwd: ctlDir,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const emitChunk = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      const maybeUrl = extractAuthorizationUrl(`${stdout}${stderr}${text}`);
      if (!authorizationUrl && maybeUrl) {
        authorizationUrl = maybeUrl;
        process.stdout.write(`oauth_authorization_url: ${authorizationUrl}\n`);
      }
      return text;
    };

    child.stdout?.on('data', (chunk) => {
      stdout += emitChunk(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      stderr += emitChunk(chunk);
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        status: 1,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`,
        authorizationUrl,
      });
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        status: code ?? 1,
        stdout,
        stderr,
        authorizationUrl,
      });
    });
  });
}

function extractApiKeyToken(text) {
  const block = /-----BEGIN API KEY-----\s*([A-Za-z0-9\-_.]+)\s*-----END API KEY-----/s.exec(text || '');
  if (block && block[1]) {
    return block[1].trim();
  }
  const jwt = /(eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/.exec(text || '');
  if (jwt && jwt[1]) {
    return jwt[1].trim();
  }
  return '';
}

function resolveComposeFile(baseDir, inputComposeFile) {
  if (inputComposeFile) {
    const explicitPath = path.isAbsolute(inputComposeFile)
      ? inputComposeFile
      : path.join(baseDir, inputComposeFile);
    if (fs.existsSync(explicitPath)) {
      return explicitPath;
    }
    return '';
  }
  const candidates = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  for (const candidate of candidates) {
    const full = path.join(baseDir, candidate);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return '';
}

function tryGenerateApiKeyViaYarn(baseDir, options) {
  if (!commandExists('yarn')) {
    return { ok: false, token: '', source: 'local-cli', detail: 'yarn-not-found' };
  }
  const args = [
    'nocobase',
    'generate-api-key',
    '-n',
    options.autoApiKeyName,
    '-r',
    options.autoApiKeyRole,
    '-u',
    options.autoApiKeyUsername,
    '-e',
    options.autoApiKeyExpiresIn,
    '--silent',
  ];
  const result = runCommand(process.platform === 'win32' ? 'yarn.cmd' : 'yarn', args, baseDir);
  const token = extractApiKeyToken(commandText(result));
  return {
    ok: Boolean(token),
    token,
    source: 'local-cli',
    detail: commandText(result),
  };
}

function tryGenerateApiKeyViaDocker(baseDir, options) {
  if (!commandExists('docker')) {
    return { ok: false, token: '', source: 'docker-compose-exec', detail: 'docker-not-found' };
  }
  const composeFile = resolveComposeFile(baseDir, options.autoApiKeyComposeFile);
  const args = ['compose'];
  if (composeFile) {
    args.push('-f', composeFile);
  }
  args.push(
    'exec',
    '-T',
    options.autoApiKeyAppService,
    'yarn',
    'nocobase',
    'generate-api-key',
    '-n',
    options.autoApiKeyName,
    '-r',
    options.autoApiKeyRole,
    '-u',
    options.autoApiKeyUsername,
    '-e',
    options.autoApiKeyExpiresIn,
    '--silent',
  );
  const result = runCommand('docker', args, baseDir);
  const token = extractApiKeyToken(commandText(result));
  return {
    ok: Boolean(token),
    token,
    source: 'docker-compose-exec',
    detail: commandText(result),
  };
}

function isAuthIssue(text) {
  return /401|403|Auth required|Missing token|Invalid API token|invalid token/i.test(text || '');
}

function normalizeBaseUrl(options) {
  if (options.baseUrl && options.baseUrl.trim()) {
    return options.baseUrl.trim();
  }
  return `http://localhost:${options.port}/api`;
}

function emitTokenFixAction(plugins, suggestedCommand) {
  process.stdout.write('action_required: refresh_cli_token\n');
  process.stdout.write('required_step: ensure_api_keys_plugin_active\n');
  process.stdout.write('required_step: regenerate_or_update_cli_token_env\n');
  process.stdout.write('required_step: rerun_cli_postcheck\n');
  process.stdout.write(`required_plugins: ${plugins}\n`);
  process.stdout.write(`suggested_command: ${suggestedCommand}\n`);
}

function getCliDependencyBundle(authMode) {
  if (authMode === 'oauth') {
    return {
      plugins: '@nocobase/plugin-api-doc,@nocobase/plugin-idp-oauth',
      command: 'Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-idp-oauth',
    };
  }
  return {
    plugins: '@nocobase/plugin-api-doc,@nocobase/plugin-api-keys',
    command: 'Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys',
  };
}

async function handleOauthMode(options, baseDir, baseUrl, ctlDir) {
  record('pass', 'CLI-002', 'OAuth mode selected.');
  process.stdout.write('login_credentials_hint: Please log in to the app before the OAuth authorization page opens.\n');
  process.stdout.write('login_account: admin@nocobase.com (or your configured INIT_ROOT_EMAIL)\n');
  process.stdout.write('login_password: admin123 (or your configured INIT_ROOT_PASSWORD)\n');
  process.stdout.write('login_note: The OAuth authorization page will open in your browser automatically. If you are not logged in, it will redirect to the login page first.\n');
  const addResult = runCtl(['env', 'add', '--name', options.envName, '--base-url', baseUrl, '-s', options.scope], baseDir, options.prefer, ctlDir);
  emitOutput(addResult);
  if ((addResult.status ?? 1) !== 0) {
    record('fail', 'CLI-003', `Failed to add env '${options.envName}'.`, 'Check base URL, nocobase-ctl installation, and workspace write permissions, then rerun postcheck.');
    return;
  }
  record('pass', 'CLI-003', `Added or updated env '${options.envName}' in ${options.scope} scope.`);

  const authResult = await runCtlStreaming(['env', 'auth', '-e', options.envName, '-s', options.scope], baseDir, options.prefer, ctlDir);
  if (!authResult.authorizationUrl) {
    process.stdout.write('oauth_authorization_url: unavailable_from_command_output\n');
  }
  if ((authResult.status ?? 1) !== 0) {
    record('fail', 'CLI-004', 'OAuth authorization did not complete.', 'Complete the browser OAuth flow opened by nocobase-ctl env auth, then rerun cli-postcheck.');
    process.stdout.write('action_required: complete_oauth_login\n');
    process.stdout.write('auth_mode_switch_policy: do_not_switch_to_token_without_user_confirmation\n');
    process.stdout.write('required_step: rerun_cli_postcheck_after_oauth_completes\n');
    process.stdout.write('switch_auth_mode_instruction: ask_user_before_switching_to_token_mode\n');
    return;
  }

  if (!options.skipUpdate) {
    const updateResult = runCtl(['env', 'update', '-e', options.envName, '-s', options.scope], baseDir, options.prefer, ctlDir);
    emitOutput(updateResult);
    if ((updateResult.status ?? 1) !== 0) {
      record('fail', 'CLI-004', `Failed to update runtime for env '${options.envName}' after OAuth authorization.`, 'Ensure app is reachable and required OAuth/API-doc plugins are active, then rerun postcheck.');
      return;
    }
    record('pass', 'CLI-004', `OAuth authorization and runtime update completed for env '${options.envName}'.`);
  } else {
    record('warn', 'CLI-004', 'Skipped env update by flag after OAuth authorization.');
  }

  const readback = runCtl(['env', '-s', options.scope], baseDir, options.prefer, ctlDir);
  emitOutput(readback);
  if ((readback.status ?? 1) !== 0) {
    record('fail', 'CLI-005', 'Readback failed after OAuth bootstrap.', 'Run `nocobase-ctl env -s <scope>` manually and verify.');
    return;
  }
  const text = commandText(readback);
  if (text.includes(options.envName) && text.includes(baseUrl)) {
    record('pass', 'CLI-005', 'Readback confirms expected env and base URL.');
  } else {
    record('warn', 'CLI-005', 'Readback completed but expected env/base URL was not clearly found in output.', 'Inspect `nocobase-ctl env -s <scope>` output manually.');
  }
}

function handleTokenMode(options, baseDir, baseUrl, bundle, ctlDir) {
  let token = process.env[options.tokenEnv] || '';

  const autoGenerateToken = () => {
    const yarnAttempt = tryGenerateApiKeyViaYarn(baseDir, options);
    if (yarnAttempt.ok) {
      return yarnAttempt;
    }
    const dockerAttempt = tryGenerateApiKeyViaDocker(baseDir, options);
    if (dockerAttempt.ok) {
      return dockerAttempt;
    }
    return {
      ok: false,
      token: '',
      source: '',
      detail: `${yarnAttempt.detail}\n${dockerAttempt.detail}`.trim(),
    };
  };

  if (!token && !options.disableAutoApiKey) {
    record('warn', 'CLI-002', `Token env '${options.tokenEnv}' is missing. Trying automatic token generation.`, `Auto token generation uses CLI: generate-api-key -n ${options.autoApiKeyName} -u ${options.autoApiKeyUsername} -r ${options.autoApiKeyRole} -e ${options.autoApiKeyExpiresIn}.`);
    const generated = autoGenerateToken();
    if (generated.ok) {
      token = generated.token;
      process.env[options.tokenEnv] = token;
      record('pass', 'CLI-002', `Automatically generated API token from ${generated.source} and loaded into '${options.tokenEnv}'.`);
    } else {
      const genDetail = (generated.detail || '').toLowerCase();
      const appNotReady = /user.*not.*found|no.*user|cannot.*find.*user|user.*does.*not.*exist|not.*initialized|db.*not.*ready|econnrefused|enotfound|socket.*hang/i.test(generated.detail || '');
      if (appNotReady) {
        record('fail', 'CLI-002', `Automatic token generation failed: app is not initialized or not reachable. Token generation requires the app to be fully started and the admin user to exist.`,
          `Ensure the app is running and the NocoBase install step has completed (admin user must exist at admin@nocobase.com or the configured email), then rerun postcheck. Do NOT attempt to create API keys via MCP tool calls — use only the CLI path (yarn nocobase generate-api-key or docker compose exec).`);
        process.stdout.write('action_required: wait_for_app_initialization\n');
        process.stdout.write('required_step: confirm_app_is_running_and_reachable\n');
        process.stdout.write('required_step: confirm_nocobase_install_completed\n');
        process.stdout.write('required_step: rerun_cli_postcheck\n');
      } else {
        record('fail', 'CLI-002', `Automatic token generation failed for '${options.tokenEnv}'.`, `Enable @nocobase/plugin-api-keys, generate API key, set ${options.tokenEnv}, then rerun postcheck.`);
        process.stdout.write('action_required: provide_cli_token\n');
        process.stdout.write('required_step: auto_generate_cli_token_failed\n');
        process.stdout.write('required_step: ensure_api_keys_plugin_active\n');
        process.stdout.write('required_step: set_cli_token_env\n');
        process.stdout.write('required_step: rerun_cli_postcheck\n');
        process.stdout.write(`required_plugins: ${bundle.plugins}\n`);
        process.stdout.write(`suggested_command: ${bundle.command}\n`);
      }
      return;
    }
  } else if (!token) {
    record('fail', 'CLI-002', `Token env '${options.tokenEnv}' is missing and auto generation is disabled.`, 'Enable @nocobase/plugin-api-keys, generate/copy API token, set token env, then rerun.');
    process.stdout.write('action_required: provide_cli_token\n');
    process.stdout.write('required_step: ensure_api_keys_plugin_active\n');
    process.stdout.write('required_step: set_cli_token_env\n');
    process.stdout.write('required_step: rerun_cli_postcheck\n');
    process.stdout.write(`required_plugins: ${bundle.plugins}\n`);
    process.stdout.write(`suggested_command: ${bundle.command}\n`);
    return;
  } else {
    record('pass', 'CLI-002', `Token env '${options.tokenEnv}' is present.`);
  }

  let addResult = runCtl(['env', 'add', '--name', options.envName, '--base-url', baseUrl, '--token', token, '-s', options.scope], baseDir, options.prefer, ctlDir);
  emitOutput(addResult);
  if ((addResult.status ?? 1) === 0) {
    record('pass', 'CLI-003', `Added or updated env '${options.envName}' in ${options.scope} scope.`);
  } else if (isAuthIssue(commandText(addResult)) && !options.disableAutoApiKey) {
    record('warn', 'CLI-003', `Failed to add env '${options.envName}': auth/token issue detected. Trying automatic refresh.`, `Auto token generation uses CLI: generate-api-key -n ${options.autoApiKeyName} -u ${options.autoApiKeyUsername} -r ${options.autoApiKeyRole} -e ${options.autoApiKeyExpiresIn}.`);
    const refreshed = autoGenerateToken();
    if (refreshed.ok) {
      token = refreshed.token;
      process.env[options.tokenEnv] = token;
      addResult = runCtl(['env', 'add', '--name', options.envName, '--base-url', baseUrl, '--token', token, '-s', options.scope], baseDir, options.prefer, ctlDir);
      emitOutput(addResult);
      if ((addResult.status ?? 1) === 0) {
        record('pass', 'CLI-003', `Added or updated env '${options.envName}' after automatic token refresh from ${refreshed.source}.`);
      } else {
        record('fail', 'CLI-003', `Failed to add env '${options.envName}' after automatic token refresh.`, `Enable @nocobase/plugin-api-keys, generate API key, set ${options.tokenEnv}, then rerun postcheck.`);
        emitTokenFixAction(bundle.plugins, bundle.command);
        return;
      }
    } else {
      record('fail', 'CLI-003', `Failed to add env '${options.envName}': auth/token issue detected and automatic refresh failed.`, `Enable @nocobase/plugin-api-keys, generate API key, set ${options.tokenEnv}, then rerun postcheck.`);
      emitTokenFixAction(bundle.plugins, bundle.command);
      return;
    }
  } else if (isAuthIssue(commandText(addResult))) {
    record('fail', 'CLI-003', `Failed to add env '${options.envName}': auth/token issue detected.`, `Enable @nocobase/plugin-api-keys, generate API key, set ${options.tokenEnv}, then rerun postcheck.`);
    emitTokenFixAction(bundle.plugins, bundle.command);
    return;
  } else {
    record('fail', 'CLI-003', `Failed to add env '${options.envName}'.`, 'Check base URL, token, and CLI runtime then retry.');
    return;
  }

  if (!options.skipUpdate && counters.fail === 0) {
    let updateResult = runCtl(['env', 'update', '-e', options.envName, '-s', options.scope], baseDir, options.prefer, ctlDir);
    emitOutput(updateResult);
    if ((updateResult.status ?? 1) === 0) {
      record('pass', 'CLI-004', `Updated runtime for env '${options.envName}'.`);
    } else if (isAuthIssue(commandText(updateResult)) && !options.disableAutoApiKey) {
      record('warn', 'CLI-004', `Failed to update runtime for env '${options.envName}': auth/token issue detected. Trying automatic refresh.`, `Auto token generation uses CLI: generate-api-key -n ${options.autoApiKeyName} -u ${options.autoApiKeyUsername} -r ${options.autoApiKeyRole} -e ${options.autoApiKeyExpiresIn}.`);
      const refreshed = autoGenerateToken();
      if (refreshed.ok) {
        token = refreshed.token;
        process.env[options.tokenEnv] = token;
        const refreshEnv = runCtl(['env', 'add', '--name', options.envName, '--base-url', baseUrl, '--token', token, '-s', options.scope], baseDir, options.prefer, ctlDir);
        emitOutput(refreshEnv);
        if ((refreshEnv.status ?? 1) === 0) {
          updateResult = runCtl(['env', 'update', '-e', options.envName, '-s', options.scope], baseDir, options.prefer, ctlDir);
          emitOutput(updateResult);
          if ((updateResult.status ?? 1) === 0) {
            record('pass', 'CLI-004', `Updated runtime for env '${options.envName}' after automatic token refresh from ${refreshed.source}.`);
          } else {
            record('fail', 'CLI-004', `Failed to update runtime for env '${options.envName}' after automatic token refresh.`, `Enable @nocobase/plugin-api-keys, generate API key, set ${options.tokenEnv}, then rerun postcheck.`);
            emitTokenFixAction(bundle.plugins, bundle.command);
            return;
          }
        } else {
          record('fail', 'CLI-004', `Failed to refresh env '${options.envName}' token before update retry.`, `Enable @nocobase/plugin-api-keys, generate API key, set ${options.tokenEnv}, then rerun postcheck.`);
          emitTokenFixAction(bundle.plugins, bundle.command);
          return;
        }
      } else {
        record('fail', 'CLI-004', `Failed to update runtime for env '${options.envName}': automatic token refresh failed.`, `Enable @nocobase/plugin-api-keys, generate API key, set ${options.tokenEnv}, then rerun postcheck.`);
        emitTokenFixAction(bundle.plugins, bundle.command);
        return;
      }
    } else if (/swagger:get|API documentation plugin|api-doc/i.test(commandText(updateResult))) {
      record('fail', 'CLI-004', `Failed to update runtime for env '${options.envName}': API documentation dependency is not ready.`, 'Enable @nocobase/plugin-api-doc and @nocobase/plugin-api-keys, restart app, then rerun postcheck.');
      process.stdout.write('action_required: enable_cli_dependency_plugins\n');
      process.stdout.write('required_step: plugin_manage_enable_cli_bundle\n');
      process.stdout.write('required_step: restart_app\n');
      process.stdout.write('required_step: rerun_cli_postcheck\n');
      process.stdout.write(`required_plugins: ${bundle.plugins}\n`);
      process.stdout.write(`suggested_command: ${bundle.command}\n`);
      return;
    } else {
      record('fail', 'CLI-004', `Failed to update runtime for env '${options.envName}'.`, 'Ensure app is reachable and token has required permission.');
      return;
    }
  } else if (options.skipUpdate) {
    record('warn', 'CLI-004', 'Skipped env update by flag.');
  }

  if (counters.fail === 0) {
    const readback = runCtl(['env', '-s', options.scope], baseDir, options.prefer, ctlDir);
    emitOutput(readback);
    if ((readback.status ?? 1) !== 0) {
      record('fail', 'CLI-005', 'Readback failed.', 'Run `nocobase-ctl env -s <scope>` manually and verify.');
      return;
    }
    const text = commandText(readback);
    if (text.includes(options.envName) && text.includes(baseUrl)) {
      record('pass', 'CLI-005', 'Readback confirms expected env and base URL.');
    } else {
      record('warn', 'CLI-005', 'Readback completed but expected env/base URL was not clearly found in output.', 'Inspect `nocobase-ctl env -s <scope>` output manually.');
    }
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    record('fail', 'CLI-001', error instanceof Error ? error.message : String(error), 'Run `node ./scripts/cli-postcheck.mjs --help` for usage.');
    printSummaryAndExit();
    return;
  }

  const baseDir = path.resolve(options.baseDir || process.cwd());
  const ctlDir = path.resolve(options.ctlDir || process.cwd());
  const baseUrl = normalizeBaseUrl(options);
  const bundle = getCliDependencyBundle(options.authMode);

  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    record('fail', 'CLI-001', `App directory does not exist: ${baseDir}`, 'Pass --base-dir pointing to the app directory, or run cli-postcheck from within the app directory.');
    printSummaryAndExit();
    return;
  }

  const ctlCommand = resolveCtlCommand();
  if (!ctlCommand) {
    record('fail', 'CLI-001', 'Cannot find nocobase-ctl or nbctl in PATH.', 'Install nocobase-ctl from https://github.com/nocobase/nocobase-ctl and rerun postcheck.');
    printSummaryAndExit();
    return;
  }

  record('pass', 'CLI-001', `Detected nocobase-ctl CLI: ${ctlCommand}`);
  process.stdout.write(`cli_base_dir: ${baseDir}\n`);
  process.stdout.write(`cli_ctl_dir: ${ctlDir}\n`);
  process.stdout.write(`cli_auth_mode: ${options.authMode}\n`);
  process.stdout.write(`cli_target_env: ${options.envName}\n`);
  process.stdout.write(`cli_base_url: ${baseUrl}\n`);
  process.stdout.write(`cli_scope: ${options.scope}\n`);
  if (options.authMode === 'token') {
    process.stdout.write(`cli_token_env: ${options.tokenEnv}\n`);
    process.stdout.write(`cli_auto_api_key: ${options.disableAutoApiKey ? 'disabled' : 'enabled'}\n`);
  }

  if (options.authMode === 'oauth') {
    await handleOauthMode(options, baseDir, baseUrl, ctlDir);
  } else {
    handleTokenMode(options, baseDir, baseUrl, bundle, ctlDir);
  }

  printSummaryAndExit();
}

main().catch((error) => {
  record('fail', 'CLI-001', error instanceof Error ? error.message : String(error));
  printSummaryAndExit();
});
