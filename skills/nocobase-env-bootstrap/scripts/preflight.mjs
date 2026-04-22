#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log([
    'Usage:',
    '  node ./scripts/preflight.mjs [options]',
    '',
    'Options:',
    '  --port <number>                                     App port. Default: 13000',
    '  --install-method <docker|create-nocobase-app|git>   Install method. Default: docker',
    '  --db-mode <bundled|existing>                        Database mode. Default: bundled',
    '  --db-dialect <postgres|mysql|mariadb>               Database dialect. Default: postgres',
    '  --db-host <host>                                    DB host (existing mode)',
    '  --db-port <port>                                    DB port (existing mode)',
    '  --db-database <name>                                DB database name (existing mode)',
    '  --db-database-mode <existing|create>                DB creation mode. Default: existing',
    '  --db-user <user>                                    DB user (existing mode)',
    '  --db-password <password>                            DB password (existing mode)',
    '  --mcp-required                                      Enable MCP endpoint checks',
    '  --mcp-auth-mode <none|api-key|oauth>                MCP auth mode. Default: none',
    '  --mcp-url <url>                                     MCP endpoint URL override',
    '  --mcp-app-name <name>                               MCP app name for sub-app URL',
    '  --mcp-token-env <envvar>                            Env var holding API token. Default: NOCOBASE_API_TOKEN',
    '  --mcp-packages <csv>                                x-mcp-packages value',
    '  -h, --help                                          Show help',
    '',
    'Examples:',
    '  node ./scripts/preflight.mjs --port 13000 --install-method docker',
    '  node ./scripts/preflight.mjs --install-method create-nocobase-app --db-host localhost --db-database mydb --db-user myuser --db-password secret',
    '  node ./scripts/preflight.mjs --install-method docker --mcp-required --mcp-auth-mode api-key',
  ].join('\n'));
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    port: 13000,
    installMethod: 'docker',
    dbMode: 'bundled',
    dbDialect: '',
    dbHost: '',
    dbPort: '',
    dbDatabase: '',
    dbDatabaseMode: 'existing',
    dbUser: '',
    dbPassword: '',
    mcpRequired: false,
    mcpAuthMode: 'none',
    mcpUrl: '',
    mcpAppName: '',
    mcpTokenEnv: 'NOCOBASE_API_TOKEN',
    mcpPackages: '',
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '--mcp-required') {
      args.mcpRequired = true;
      i++;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      switch (key) {
        case 'port': args.port = parseInt(value, 10); i += 2; break;
        case 'install-method': args.installMethod = value; i += 2; break;
        case 'db-mode': args.dbMode = value; i += 2; break;
        case 'db-dialect': args.dbDialect = value; i += 2; break;
        case 'db-host': args.dbHost = value; i += 2; break;
        case 'db-port': args.dbPort = value; i += 2; break;
        case 'db-database': args.dbDatabase = value; i += 2; break;
        case 'db-database-mode': args.dbDatabaseMode = value; i += 2; break;
        case 'db-user': args.dbUser = value; i += 2; break;
        case 'db-password': args.dbPassword = value; i += 2; break;
        case 'mcp-auth-mode': args.mcpAuthMode = value; i += 2; break;
        case 'mcp-url': args.mcpUrl = value; i += 2; break;
        case 'mcp-app-name': args.mcpAppName = value; i += 2; break;
        case 'mcp-token-env': args.mcpTokenEnv = value; i += 2; break;
        case 'mcp-packages': args.mcpPackages = value; i += 2; break;
        default:
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
      }
    } else {
      console.error(`Unexpected positional argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

// ─── Check counters ───────────────────────────────────────────────────────────

let failCount = 0;
let warnCount = 0;
let passCount = 0;

function record(level, id, message, fix = '') {
  console.log(`[${level}] ${id}: ${message}`);
  if (fix) console.log(`  fix: ${fix}`);
  if (level === 'pass') passCount++;
  else if (level === 'warn') warnCount++;
  else if (level === 'fail') failCount++;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasCommand(name) {
  const probe = process.platform === 'win32'
    ? spawnSync('where', [name], { encoding: 'utf8', stdio: 'pipe' })
    : spawnSync('which', [name], { encoding: 'utf8', stdio: 'pipe' });
  return probe.status === 0;
}

function resolveCtlCommand() {
  if (hasCommand('nb')) return 'nb';
  return '';
}

function runCommand(cmd, args = []) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function runCtlCommand(cmd, args = []) {
  if (process.platform === 'win32') {
    return runCommand('cmd.exe', ['/d', '/s', '/c', cmd, ...args]);
  }
  return runCommand(cmd, args);
}

function readDotEnv(filePath = '.env') {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[m[1]] = val;
  }
  return result;
}

function findComposeFile() {
  for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    if (fs.existsSync(name)) return name;
  }
  return '';
}

function isPlaceholderAppKey(value) {
  if (!value) return false;
  const n = value.toLowerCase();
  return (
    n.includes('change-me') || n.includes('change_me') ||
    n.includes('please-change') || n.includes('please_change') ||
    n.includes('secret-key') || n.includes('secret_key')
  );
}

function tcpReachable(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(val);
    };
    socket.setTimeout(timeoutMs);
    socket.connect(Number(port), host, () => finish(true));
    socket.on('error', () => finish(false));
    socket.on('timeout', () => finish(false));
  });
}

function httpStatus(url, token = '') {
  return new Promise((resolve) => {
    const mod = url.startsWith('https://') ? https : http;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const req = mod.request(url, { headers, timeout: 10000 }, (res) => {
        resolve(res.statusCode);
        res.resume();
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

function dnsResolve(hostname) {
  return new Promise((resolve) => {
    dns.lookup(hostname, (err) => resolve(!err));
  });
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      resolve(err.code === 'EADDRINUSE' ? true : null);
    });
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port);
  });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function ensureDbCreated(dialect, dbDatabaseMode, dbHost, dbPort, dbDatabase, dbUser, dbPassword) {
  if (dbDatabaseMode !== 'create') {
    record('pass', 'DB-CREATE-001', 'Database creation mode is existing; creation step skipped.');
    return true;
  }

  if (dialect === 'postgres') {
    if (!hasCommand('psql')) {
      record('fail', 'DB-CREATE-001', 'db_database_mode=create requires psql client for postgres.', 'Install PostgreSQL client tools and retry.');
      return false;
    }
    const dbLiteral = dbDatabase.replace(/'/g, "''");
    const dbIdentifier = '"' + dbDatabase.replace(/"/g, '""') + '"';
    const checkSql = `SELECT 1 FROM pg_database WHERE datname='${dbLiteral}' LIMIT 1;`;
    const env = { ...process.env, PGPASSWORD: dbPassword };

    const checkResult = spawnSync('psql', ['-h', dbHost, '-p', String(dbPort), '-U', dbUser, '-d', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', checkSql], { encoding: 'utf8', env, stdio: 'pipe' });
    if (checkResult.status !== 0) {
      record('fail', 'DB-CREATE-001', `Failed to check target database existence (${dbDatabase}).`, 'Check DB_HOST/DB_PORT/DB_USER and network connectivity, then retry.');
      return false;
    }
    if (checkResult.stdout.trim() === '1') {
      record('pass', 'DB-CREATE-001', `Target database already exists (${dbDatabase}).`);
      return true;
    }

    const createResult = spawnSync('psql', ['-h', dbHost, '-p', String(dbPort), '-U', dbUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${dbIdentifier};`], { encoding: 'utf8', env, stdio: 'pipe' });
    if (createResult.status === 0) {
      record('pass', 'DB-CREATE-001', `Created target database (${dbDatabase}).`);
      return true;
    }
    record('fail', 'DB-CREATE-001', `Failed to create target database (${dbDatabase}).`, 'Check DB_USER permissions (CREATE DATABASE) or create database manually, then retry.');
    return false;
  }

  // mysql / mariadb
  if (!hasCommand('mysql')) {
    record('fail', 'DB-CREATE-001', 'db_database_mode=create requires mysql client for mysql/mariadb.', 'Install mysql client tools and retry.');
    return false;
  }
  const tick = '`';
  const dbLiteral = dbDatabase.replace(/'/g, "''");
  const dbIdentifier = tick + dbDatabase.replace(new RegExp(tick, 'g'), tick + tick) + tick;
  const checkSql = `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='${dbLiteral}' LIMIT 1;`;
  const env = { ...process.env, MYSQL_PWD: dbPassword };

  const checkResult = spawnSync('mysql', ['--protocol=TCP', '-h', dbHost, '-P', String(dbPort), '-u', dbUser, '--connect-timeout=5', '--batch', '--skip-column-names', '-e', checkSql], { encoding: 'utf8', env, stdio: 'pipe' });
  if (checkResult.status !== 0) {
    record('fail', 'DB-CREATE-001', `Failed to check target database existence (${dbDatabase}).`, 'Check DB_HOST/DB_PORT/DB_USER and network connectivity, then retry.');
    return false;
  }
  if (checkResult.stdout.trim() === dbDatabase) {
    record('pass', 'DB-CREATE-001', `Target database already exists (${dbDatabase}).`);
    return true;
  }

  const createResult = spawnSync('mysql', ['--protocol=TCP', '-h', dbHost, '-P', String(dbPort), '-u', dbUser, '--connect-timeout=5', '-e', `CREATE DATABASE IF NOT EXISTS ${dbIdentifier};`], { encoding: 'utf8', env, stdio: 'pipe' });
  if (createResult.status === 0) {
    record('pass', 'DB-CREATE-001', `Created target database (${dbDatabase}).`);
    return true;
  }
  record('fail', 'DB-CREATE-001', `Failed to create target database (${dbDatabase}).`, 'Check DB_USER permissions (CREATE DATABASE) or create database manually, then retry.');
  return false;
}

function pgAuthProbe(dbHost, dbPort, dbDatabase, dbUser, dbPassword) {
  if (!hasCommand('psql')) return null;
  const env = { ...process.env, PGPASSWORD: dbPassword };
  const result = spawnSync('psql', ['-h', dbHost, '-p', String(dbPort), '-U', dbUser, '-d', dbDatabase, '-c', 'SELECT 1;', '-tA'], { encoding: 'utf8', env, stdio: 'pipe' });
  return result.status === 0;
}

function mysqlAuthProbe(dbHost, dbPort, dbDatabase, dbUser, dbPassword) {
  if (!hasCommand('mysql')) return null;
  const env = { ...process.env, MYSQL_PWD: dbPassword };
  const result = spawnSync('mysql', ['--protocol=TCP', '-h', dbHost, '-P', String(dbPort), '-u', dbUser, '-D', dbDatabase, '--connect-timeout=5', '-e', 'SELECT 1;'], { encoding: 'utf8', env, stdio: 'pipe' });
  return result.status === 0;
}

// ─── MCP helpers ──────────────────────────────────────────────────────────────

function getMcpUrl(port, inputUrl, inputAppName) {
  if (inputUrl) return inputUrl;
  if (inputAppName) return `http://127.0.0.1:${port}/api/__app/${inputAppName}/mcp`;
  return `http://127.0.0.1:${port}/api/mcp`;
}

function getActivationPlugins(authMode) {
  const plugins = ['@nocobase/plugin-mcp-server'];
  if (authMode === 'api-key') plugins.push('@nocobase/plugin-api-keys');
  if (authMode === 'oauth') plugins.push('@nocobase/plugin-idp-oauth');
  return plugins;
}

function getPluginStepId(plugin) {
  switch (plugin) {
    case '@nocobase/plugin-mcp-server': return 'plugin_manage_enable_mcp_server';
    case '@nocobase/plugin-api-keys': return 'plugin_manage_enable_api_keys';
    case '@nocobase/plugin-idp-oauth': return 'plugin_manage_enable_idp_oauth';
    default: return 'plugin_manage_enable_plugin';
  }
}

function getPluginEnableHint(plugins) {
  const args = plugins.join(' ');
  const csv = plugins.join(', ');
  return `Run fixed sequence: Use $nocobase-plugin-manage enable ${args} -> restart app -> rerun postcheck. Enable bundle: ${csv}. Do not bypass plugin-manage with ad-hoc container shell plugin commands; plugin-manage may auto-select docker CLI internally.`;
}

function emitActivatePluginAction(plugins) {
  console.log('action_required: activate_plugin');
  for (const p of plugins) console.log(`required_step: ${getPluginStepId(p)}`);
  console.log('required_step: restart_app');
  console.log('required_step: rerun_mcp_validation');
}

function emitDbInstallAction() {
  console.log('action_required: install_or_configure_database');
  console.log('postgres_install_url: https://www.postgresql.org/download/');
  console.log('mysql_install_url: https://dev.mysql.com/doc/en/installing.html');
  console.log('mysql_download_url: https://dev.mysql.com/downloads/mysql');
  console.log('mariadb_install_url: https://mariadb.org/download/');
}

function getMcpEndpointState(status) {
  if (status === 404) return 'missing_route';
  if (status === 503) return 'app_preparing';
  if (status >= 500) return 'server_error';
  return 'ready';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const VALID_METHODS = new Set(['docker', 'create-nocobase-app', 'git']);
  const VALID_DB_MODES = new Set(['bundled', 'existing']);
  const VALID_DB_DIALECTS = new Set(['postgres', 'mysql', 'mariadb']);
  const VALID_DB_DATABASE_MODES = new Set(['existing', 'create']);

  if (!VALID_METHODS.has(args.installMethod)) {
    console.log(`[fail] INPUT-001: Invalid install_method "${args.installMethod}".`);
    console.log('  fix: Use one of docker/create-nocobase-app/git.');
    process.exit(1);
  }
  if (!VALID_DB_MODES.has(args.dbMode)) {
    console.log(`[fail] INPUT-002: Invalid db_mode "${args.dbMode}".`);
    console.log('  fix: Use one of bundled/existing.');
    process.exit(1);
  }
  if (!VALID_DB_DATABASE_MODES.has(args.dbDatabaseMode)) {
    console.log(`[fail] INPUT-004: Invalid db_database_mode "${args.dbDatabaseMode}".`);
    console.log('  fix: Use one of existing/create.');
    process.exit(1);
  }

  const isDocker = args.installMethod === 'docker';
  const isCreateOrGit = args.installMethod === 'create-nocobase-app' || args.installMethod === 'git';
  const isGit = args.installMethod === 'git';

  const dotenv = readDotEnv('.env');

  // Resolve DB dialect
  let dbDialectResolved = args.dbDialect || dotenv['DB_DIALECT'] || 'postgres';
  if (!VALID_DB_DIALECTS.has(dbDialectResolved)) {
    record('fail', 'INPUT-003', `Unsupported DB_DIALECT '${dbDialectResolved}'.`, 'Use DB_DIALECT=postgres, DB_DIALECT=mysql, or DB_DIALECT=mariadb.');
  }

  const dbHostResolved = args.dbHost || dotenv['DB_HOST'] || '';
  let dbPortResolved = args.dbPort || dotenv['DB_PORT'] || '';
  const dbDatabaseResolved = args.dbDatabase || dotenv['DB_DATABASE'] || '';
  const dbUserResolved = args.dbUser || dotenv['DB_USER'] || '';
  const dbPasswordResolved = args.dbPassword || dotenv['DB_PASSWORD'] || '';
  const dbDatabaseModeResolved = args.dbDatabaseMode;

  const hasExternalDbInputs = !!(dbHostResolved || dbPortResolved || dbDatabaseResolved || dbUserResolved || dbPasswordResolved);
  let dbModeResolved = args.dbMode;
  if (isCreateOrGit) {
    dbModeResolved = 'existing';
  } else if (isDocker && dbModeResolved === 'bundled' && hasExternalDbInputs) {
    dbModeResolved = 'existing';
  }

  if (!dbPortResolved) {
    dbPortResolved = dbDialectResolved === 'postgres' ? '5432' : '3306';
  }

  // Header
  console.log(`cwd: ${process.cwd()}`);
  console.log(`timestamp: ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
  console.log(`install_method: ${args.installMethod}`);
  console.log(`db_mode: ${dbModeResolved}`);
  console.log(`db_dialect: ${dbDialectResolved}`);
  console.log(`db_database_mode: ${dbDatabaseModeResolved}`);
  if (dbHostResolved) console.log(`db_host: ${dbHostResolved}`);

  // ─── Docker ─────────────────────────────────────────────────────────────────

  if (hasCommand('docker')) {
    if (runCommand('docker', ['--version']).ok) {
      record('pass', 'DEP-DOCKER-001', 'Docker detected.');
    } else {
      isDocker
        ? record('fail', 'DEP-DOCKER-001', 'Docker command exists but version check failed.', 'Reinstall Docker.')
        : record('warn', 'DEP-DOCKER-001', `Docker command exists but version check failed (optional for method=${args.installMethod}).`, 'Reinstall Docker if you plan to use docker method.');
    }

    if (runCommand('docker', ['info']).ok) {
      record('pass', 'DEP-DOCKER-002', 'Docker daemon is reachable.');
    } else {
      isDocker
        ? record('fail', 'DEP-DOCKER-002', 'Docker daemon is not reachable.', 'Start Docker service.')
        : record('warn', 'DEP-DOCKER-002', `Docker daemon is not reachable (optional for method=${args.installMethod}).`, 'Start Docker service if you plan to use docker method.');
    }

    if (runCommand('docker', ['compose', 'version']).ok) {
      record('pass', 'DEP-DOCKER-003', 'Docker Compose detected.');
    } else {
      isDocker
        ? record('fail', 'DEP-DOCKER-003', 'Docker Compose check failed.', 'Install Compose v2.')
        : record('warn', 'DEP-DOCKER-003', `Docker Compose check failed (optional for method=${args.installMethod}).`, 'Install Compose v2 if you plan to use docker method.');
    }
  } else {
    isDocker
      ? record('fail', 'DEP-DOCKER-001', 'Docker not detected.', 'Install from https://docs.docker.com/get-started/get-docker/')
      : record('warn', 'DEP-DOCKER-001', `Docker not detected (optional for method=${args.installMethod}).`, 'Install Docker only if docker method is needed.');
  }

  // ─── Node.js ─────────────────────────────────────────────────────────────────

  if (hasCommand('node')) {
    const nodeVer = runCommand('node', ['-v']);
    const m = nodeVer.stdout.match(/^v(\d+)/);
    if (m && parseInt(m[1], 10) >= 20) {
      record('pass', 'DEP-NODE-001', `Node.js version is compatible (${nodeVer.stdout}).`);
    } else {
      record('fail', 'DEP-NODE-001', `Node.js is below required version 20 for method=${args.installMethod} (${nodeVer.stdout}).`, 'Install Node.js >= 20 from https://nodejs.org/en/download');
    }
  } else {
    record('fail', 'DEP-NODE-001', `Node.js not detected (required for method=${args.installMethod}).`, 'Install Node.js >= 20 from https://nodejs.org/en/download');
  }

  // ─── Yarn ─────────────────────────────────────────────────────────────────

  if (hasCommand('yarn')) {
    const yarnVer = runCommand('yarn', ['-v']);
    if (/^1\.22\./.test(yarnVer.stdout)) {
      record('pass', 'DEP-YARN-001', `Yarn classic detected (${yarnVer.stdout}).`);
    } else {
      isCreateOrGit
        ? record('fail', 'DEP-YARN-001', `Yarn is not 1.22.x (required for method=${args.installMethod}, current=${yarnVer.stdout}).`, 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/')
        : record('warn', 'DEP-YARN-001', `Yarn is not 1.22.x (${yarnVer.stdout}).`, 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/');
    }
  } else {
    isCreateOrGit
      ? record('fail', 'DEP-YARN-001', `Yarn not detected (required for method=${args.installMethod}).`, 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/')
      : record('warn', 'DEP-YARN-001', 'Yarn not detected.', 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/');
  }

  // ─── nb CLI ───────────────────────────────────────────────────────────────

  const ctlCommand = resolveCtlCommand();
  if (ctlCommand) {
    const ctlCheck = runCtlCommand(ctlCommand, ['env', 'list', '--help']);
    if (ctlCheck.ok) {
      record('pass', 'DEP-CTL-001', `nb CLI detected (${ctlCommand}).`);
    } else {
      record('fail', 'DEP-CTL-001', `nb CLI exists but command check failed (${ctlCommand}).`, 'Reinstall @nocobase/cli (for example: npm i -g @nocobase/cli) and retry.');
    }
  } else {
    record('fail', 'DEP-CTL-001', 'nb CLI not detected.', 'Install @nocobase/cli (for example: npm i -g @nocobase/cli) before install/upgrade.');
  }

  // ─── Git ─────────────────────────────────────────────────────────────────

  if (hasCommand('git')) {
    record('pass', 'DEP-GIT-001', 'Git detected.');
  } else {
    isGit
      ? record('fail', 'DEP-GIT-001', 'Git not detected (required for method=git).', 'Install from https://git-scm.com/install')
      : record('warn', 'DEP-GIT-001', 'Git not detected.', 'Install from https://git-scm.com/install');
  }

  // ─── Port ─────────────────────────────────────────────────────────────────

  const portInUse = await isPortInUse(args.port);
  if (portInUse === null) {
    record('warn', 'RUNTIME-PORT-001', `Cannot check port ${args.port}.`);
  } else if (portInUse) {
    record('warn', 'RUNTIME-PORT-001', `Port ${args.port} is in use.`, 'Choose another APP_PORT or stop conflicting process.');
  } else {
    record('pass', 'RUNTIME-PORT-001', `Port ${args.port} is available.`);
  }

  // ─── Path ─────────────────────────────────────────────────────────────────

  if (process.cwd().includes(' ')) {
    record('warn', 'PATH-001', 'Current path contains spaces.', 'Use a path without spaces.');
  } else {
    record('pass', 'PATH-001', 'Current path has no spaces.');
  }

  // ─── DNS ─────────────────────────────────────────────────────────────────

  const dnsOk = await dnsResolve('docs.nocobase.com');
  if (dnsOk) {
    record('pass', 'NET-001', 'DNS resolution for docs.nocobase.com succeeded.');
  } else {
    record('warn', 'NET-001', 'Could not verify DNS reachability.', 'If offline/restricted, use offline package workflow.');
  }

  // ─── DB checks ─────────────────────────────────────────────────────────────

  const composeFilePath = findComposeFile();
  let composeContent = '';
  if (composeFilePath) composeContent = fs.readFileSync(composeFilePath, 'utf8');
  const hasDbDialectInCompose = composeContent.includes('DB_DIALECT=');

  if (dbModeResolved === 'existing') {
    if (VALID_DB_DIALECTS.has(dbDialectResolved)) {
      record('pass', 'DB-REQ-001', `External DB dialect is supported (${dbDialectResolved}).`);
    } else {
      record('fail', 'DB-REQ-001', `External DB mode requires db_dialect=postgres|mysql|mariadb (current=${dbDialectResolved}).`, 'Set DB_DIALECT to postgres, mysql, or mariadb.');
    }

    const missingFields = [];
    if (!dbHostResolved) missingFields.push('DB_HOST');
    if (!dbPortResolved) missingFields.push('DB_PORT');
    if (!dbDatabaseResolved) missingFields.push('DB_DATABASE');
    if (!dbUserResolved) missingFields.push('DB_USER');
    if (!dbPasswordResolved) missingFields.push('DB_PASSWORD');

    if (missingFields.length > 0) {
      record('fail', 'DB-REQ-002', `External DB mode is missing required fields: ${missingFields.join(', ')}.`,
        `Provide DB_* values or install PostgreSQL/MySQL/MariaDB first. PostgreSQL: https://www.postgresql.org/download/ | MySQL: https://dev.mysql.com/doc/en/installing.html | MariaDB: https://mariadb.org/download/`);
      emitDbInstallAction();
    } else {
      record('pass', 'DB-REQ-002', 'External DB required fields are present.');
      let dbCreateReady = true;

      if (!/^\d+$/.test(dbPortResolved)) {
        record('fail', 'DB-REQ-003', `DB_PORT must be numeric (current=${dbPortResolved}).`, 'Set DB_PORT to a valid numeric port.');
        dbCreateReady = false;
      } else {
        const reachable = await tcpReachable(dbHostResolved, dbPortResolved);
        if (reachable) {
          record('pass', 'DB-CONN-001', `Database endpoint is reachable (${dbHostResolved}:${dbPortResolved}).`);
        } else {
          record('fail', 'DB-CONN-001', `Database endpoint is not reachable (${dbHostResolved}:${dbPortResolved}).`,
            `Start database service or install one: PostgreSQL https://www.postgresql.org/download/ | MySQL https://dev.mysql.com/doc/en/installing.html | MariaDB https://mariadb.org/download/`);
          emitDbInstallAction();
          dbCreateReady = false;
        }
      }

      if (dbCreateReady) {
        dbCreateReady = ensureDbCreated(dbDialectResolved, dbDatabaseModeResolved, dbHostResolved, dbPortResolved, dbDatabaseResolved, dbUserResolved, dbPasswordResolved);
      }

      if (dbCreateReady && dbDialectResolved === 'postgres') {
        const probe = pgAuthProbe(dbHostResolved, dbPortResolved, dbDatabaseResolved, dbUserResolved, dbPasswordResolved);
        if (probe === null) {
          record('warn', 'DB-AUTH-001', 'psql client is not available; skipped PostgreSQL auth probe.', 'Install psql for stronger preflight verification.');
        } else if (probe) {
          record('pass', 'DB-AUTH-001', 'PostgreSQL auth probe succeeded.');
        } else {
          record('fail', 'DB-AUTH-001', `PostgreSQL auth probe failed (host=${dbHostResolved}, db=${dbDatabaseResolved}, user=${dbUserResolved}).`, 'Check DB_DATABASE/DB_USER/DB_PASSWORD and permissions.');
        }
      } else if (dbCreateReady && (dbDialectResolved === 'mysql' || dbDialectResolved === 'mariadb')) {
        const probe = mysqlAuthProbe(dbHostResolved, dbPortResolved, dbDatabaseResolved, dbUserResolved, dbPasswordResolved);
        if (probe === null) {
          record('warn', 'DB-AUTH-001', 'mysql client is not available; skipped MySQL/MariaDB auth probe.', 'Install mysql client for stronger preflight verification.');
        } else if (probe) {
          record('pass', 'DB-AUTH-001', 'MySQL/MariaDB auth probe succeeded.');
        } else {
          record('fail', 'DB-AUTH-001', `MySQL/MariaDB auth probe failed (host=${dbHostResolved}, db=${dbDatabaseResolved}, user=${dbUserResolved}).`, 'Check DB_DATABASE/DB_USER/DB_PASSWORD and permissions.');
        }
      }
    }
  } else {
    record('pass', 'DB-REQ-000', 'Using bundled database mode.');
  }

  // ─── ENV checks ──────────────────────────────────────────────────────────────

  if (dbModeResolved === 'bundled' && isDocker) {
    if (dotenv['DB_DIALECT']) {
      record('pass', 'ENV-001', '.env contains DB_DIALECT.');
    } else if (hasDbDialectInCompose) {
      record('pass', 'ENV-001', `${composeFilePath} contains DB_DIALECT for Docker runtime.`);
    } else if (fs.existsSync('.env')) {
      record('warn', 'ENV-001', '.env found but DB_DIALECT is missing, and compose file has no DB_DIALECT.', 'Set DB_DIALECT in .env or docker-compose app environment before start/upgrade.');
    } else {
      record('warn', 'ENV-001', '.env not found and compose file has no DB_DIALECT.', 'Create .env with DB_DIALECT or add DB_DIALECT to docker-compose app environment before start/upgrade.');
    }
  } else {
    record('pass', 'ENV-001', `External DB mode will use provided DB_* values (method=${args.installMethod}).`);
  }

  // ─── APP_KEY checks ───────────────────────────────────────────────────────────

  const appKey = dotenv['APP_KEY'] || process.env['APP_KEY'] || '';
  const hasProjectMarker = fs.existsSync('.env') || fs.existsSync('package.json') || !!composeFilePath;

  if (!appKey) {
    if (hasProjectMarker) {
      record('fail', 'ENV-APPKEY-001', 'APP_KEY is missing for existing project files.',
        'Generate and set APP_KEY (example: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))").');
    } else {
      record('warn', 'ENV-APPKEY-001', 'APP_KEY is not set yet; check deferred to local install script generation stage.');
    }
  } else if (isPlaceholderAppKey(appKey)) {
    record('fail', 'ENV-APPKEY-001', 'APP_KEY uses an insecure placeholder-like value.', 'Set a random APP_KEY with at least 32 characters; avoid values containing change-me/secret-key.');
  } else if (appKey.length < 32) {
    record('fail', 'ENV-APPKEY-001', `APP_KEY is too short (length=${appKey.length}).`, 'Set a random APP_KEY with at least 32 characters.');
  } else if (/\s/.test(appKey)) {
    record('fail', 'ENV-APPKEY-001', 'APP_KEY must not include whitespace.', 'Set a random APP_KEY without spaces.');
  } else {
    record('pass', 'ENV-APPKEY-001', 'APP_KEY is present and appears non-placeholder.');
  }

  if (composeFilePath) {
    if (composeContent.includes('APP_KEY=${APP_KEY:-please-change-me}')) {
      record('fail', 'ENV-APPKEY-002', `${composeFilePath} still contains insecure APP_KEY fallback 'please-change-me'.`, 'Use required form: APP_KEY=${APP_KEY:?APP_KEY is required. Set a random value in .env}');
    } else if (composeContent.includes('APP_KEY=${APP_KEY:?')) {
      record('pass', 'ENV-APPKEY-002', `${composeFilePath} enforces APP_KEY as required.`);
    } else {
      record('warn', 'ENV-APPKEY-002', `${composeFilePath} APP_KEY rule is not in required-form check.`, 'Ensure compose requires APP_KEY and avoids placeholder fallbacks.');
    }
  }

  // ─── MCP checks ───────────────────────────────────────────────────────────────

  if (args.mcpRequired) {
    const targetMcpUrl = getMcpUrl(args.port, args.mcpUrl, args.mcpAppName);
    const activationPlugins = getActivationPlugins(args.mcpAuthMode);
    const pluginEnableHint = getPluginEnableHint(activationPlugins);
    const appRestartHint = 'App may still be reloading. Restart app, wait for startup complete, then retry.';

    console.log(`mcp_target: ${targetMcpUrl}`);
    console.log(`mcp_auth_mode: ${args.mcpAuthMode}`);
    console.log(`mcp_activation_plugins: ${activationPlugins.join(',')}`);
    console.log(`mcp_manual_plugin_manager_url: http://127.0.0.1:${args.port}/admin/settings/plugin-manager`);
    console.log(`mcp_manual_api_keys_url: http://127.0.0.1:${args.port}/admin/settings/api-keys`);

    if (args.mcpPackages) {
      record('pass', 'MCP-PKG-001', `x-mcp-packages configured (${args.mcpPackages}).`);
    } else {
      record('warn', 'MCP-PKG-001', 'x-mcp-packages not set; server default exposure will be used.');
    }

    const routeStatus = await httpStatus(targetMcpUrl);
    let routeBlocked = false;

    if (routeStatus === null) {
      record('warn', 'MCP-ENDPOINT-001', 'Cannot verify MCP endpoint reachability.', 'Ensure app is running and MCP endpoint is reachable.');
      routeBlocked = true;
    } else {
      const routeState = getMcpEndpointState(routeStatus);
      if (routeState === 'missing_route') {
        record('fail', 'MCP-ENDPOINT-001', `MCP endpoint returned 404 (${targetMcpUrl}).`, pluginEnableHint);
        emitActivatePluginAction(activationPlugins);
        routeBlocked = true;
      } else if (routeState === 'app_preparing' || routeState === 'server_error') {
        record('fail', 'MCP-ENDPOINT-001', `MCP endpoint responded with ${routeStatus} (${targetMcpUrl}).`, appRestartHint);
        console.log('action_required: restart_app');
        console.log('required_step: restart_app');
        console.log('required_step: rerun_mcp_validation');
        routeBlocked = true;
      } else {
        record('pass', 'MCP-ENDPOINT-001', `MCP endpoint route responded with status ${routeStatus}.`);
      }
    }

    if (args.mcpAuthMode === 'api-key') {
      if (routeBlocked) {
        record('warn', 'MCP-AUTH-APIKEY-000', 'Skip token gate because MCP endpoint is not ready yet.', 'Resolve endpoint blocker first, then rerun preflight/postcheck.');
      } else {
        const token = process.env[args.mcpTokenEnv] || '';
        if (!token) {
          record('warn', 'MCP-AUTH-APIKEY-001', `API key token env '${args.mcpTokenEnv}' is missing.`, 'Use CLI token generation path (nocobase generate-api-key) first; if generation fails, fallback to manual API keys page.');
        } else {
          record('pass', 'MCP-AUTH-APIKEY-001', `API key token env '${args.mcpTokenEnv}' is present.`);
          const authStatus = await httpStatus(targetMcpUrl, token);
          if (authStatus === null) {
            record('warn', 'MCP-AUTH-APIKEY-002', 'Cannot verify API key auth reachability.', 'Ensure app network path is reachable and retry.');
          } else {
            const authState = getMcpEndpointState(authStatus);
            if (authState === 'missing_route') {
              record('fail', 'MCP-AUTH-APIKEY-002', `MCP endpoint returned 404 in API key probe (${targetMcpUrl}).`, pluginEnableHint);
              emitActivatePluginAction(activationPlugins);
            } else if (authState === 'app_preparing' || authState === 'server_error') {
              record('fail', 'MCP-AUTH-APIKEY-002', `MCP endpoint responded with ${authStatus} in API key probe (${targetMcpUrl}).`, appRestartHint);
              console.log('action_required: restart_app');
              console.log('required_step: restart_app');
              console.log('required_step: rerun_mcp_validation');
            } else if (authStatus === 401 || authStatus === 403) {
              record('warn', 'MCP-AUTH-APIKEY-002', `MCP API key auth probe returned ${authStatus}.`, 'Token may be expired; refresh via nocobase generate-api-key first, then fallback to manual API keys page only if automation fails.');
            } else {
              record('pass', 'MCP-AUTH-APIKEY-002', `MCP API key auth probe responded with status ${authStatus}.`);
            }
          }
        }
      }
    } else if (args.mcpAuthMode === 'oauth') {
      record('warn', 'MCP-AUTH-OAUTH-001', 'OAuth flow requires interactive login and cannot be fully validated in preflight.', 'Run client login with scopes mcp,offline_access after startup.');
    } else {
      record('warn', 'MCP-AUTH-000', 'MCP auth probe disabled (mode=none).', 'Use api-key or oauth mode when MCP access is required.');
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────

  console.log('');
  console.log(`summary: fail=${failCount} warn=${warnCount} pass=${passCount}`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('preflight error:', err.message);
  process.exit(1);
});
