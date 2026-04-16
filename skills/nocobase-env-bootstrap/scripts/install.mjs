#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const METHODS = new Set(['docker', 'create-nocobase-app', 'git']);
const CHANNELS = new Set(['latest', 'beta', 'alpha']);
const DIALECTS = new Set(['postgres', 'mysql', 'mariadb']);
const EXTERNAL_DB_DIALECTS = new Set(['postgres', 'mysql', 'mariadb']);
const DB_MODES = new Set(['bundled', 'existing']);
const RUN_MODES = new Set(['none', 'dev', 'start']);

function printHelp() {
  const help = [
    'Usage:',
    '  node ./scripts/install.mjs [options]',
    '',
    'Options:',
    '  --method <docker|create-nocobase-app|git>   Installation method. Default: docker',
    '  --target-dir <dir>                           Base directory. Default: .',
    '  --release-channel <latest|beta|alpha>       Release channel. Default: latest',
    '  --db-mode <bundled|existing>                Database mode. Default: bundled',
    '  --db-dialect <postgres|mysql|mariadb>       Database dialect. Default: postgres',
    '  --project-name <name>                        Project directory name (method-specific default)',
    '  --db-host <host>                             DB host (required for existing mode)',
    '  --db-port <port>                             DB port (method/dialect default when omitted)',
    '  --db-database <name>                         DB database (required for existing mode)',
    '  --db-user <user>                             DB user (required for existing mode)',
    '  --db-password <password>                     DB password (required for existing mode)',
    '  --db-underscored <true|false>                DB_UNDERSCORED preference. Default: false',
    '  --timezone <TZ>                              TZ value. Default: Asia/Shanghai',
    '  --port <app-port>                            APP_PORT. Default: 13000',
    '  --lang <lang>                                Install language. Default: zh-CN',
    '  --run-mode <none|dev|start>                 Post-install start mode. Default: none',
    '  --git-repo <url>                             Git repository URL (git method only)',
    '  --git-ref <ref>                              Git ref override (git method only)',
    '  --create-package <pkg>                       create package override (create method only)',
    '  --skip-pull                                  Skip docker compose pull',
    '  --dry-run                                    Print commands without executing them',
    '  -h, --help                                   Show help',
    '',
    'Examples:',
    '  node ./scripts/install.mjs --method docker --target-dir ./myapp --db-dialect postgres',
    '  node ./scripts/install.mjs --method create-nocobase-app --target-dir . --project-name my-nocobase-app',
    '  node ./scripts/install.mjs --method git --target-dir . --project-name my-nocobase --release-channel latest',
  ];
  console.log(help.join('\n'));
}

function parseArgs(argv) {
  const options = {
    method: 'docker',
    targetDir: '.',
    releaseChannel: 'latest',
    dbMode: 'bundled',
    dbDialect: 'postgres',
    projectName: '',
    dbHost: '',
    dbPort: '',
    dbDatabase: '',
    dbUser: '',
    dbPassword: '',
    dbUnderscored: null,
    timezone: 'Asia/Shanghai',
    port: 13000,
    lang: 'zh-CN',
    runMode: 'none',
    gitRepo: 'https://github.com/nocobase/nocobase.git',
    gitRef: '',
    createPackage: '',
    skipPull: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }

    const nextValue = () => {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    if (arg === '--skip-pull') {
      options.skipPull = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--method') {
      options.method = nextValue();
      continue;
    }
    if (arg.startsWith('--method=')) {
      options.method = arg.slice('--method='.length);
      continue;
    }

    if (arg === '--target-dir') {
      options.targetDir = nextValue();
      continue;
    }
    if (arg.startsWith('--target-dir=')) {
      options.targetDir = arg.slice('--target-dir='.length);
      continue;
    }

    if (arg === '--release-channel') {
      options.releaseChannel = nextValue();
      continue;
    }
    if (arg.startsWith('--release-channel=')) {
      options.releaseChannel = arg.slice('--release-channel='.length);
      continue;
    }

    if (arg === '--db-mode') {
      options.dbMode = nextValue();
      continue;
    }
    if (arg.startsWith('--db-mode=')) {
      options.dbMode = arg.slice('--db-mode='.length);
      continue;
    }

    if (arg === '--db-dialect') {
      options.dbDialect = nextValue();
      continue;
    }
    if (arg.startsWith('--db-dialect=')) {
      options.dbDialect = arg.slice('--db-dialect='.length);
      continue;
    }

    if (arg === '--project-name') {
      options.projectName = nextValue();
      continue;
    }
    if (arg.startsWith('--project-name=')) {
      options.projectName = arg.slice('--project-name='.length);
      continue;
    }

    if (arg === '--db-host') {
      options.dbHost = nextValue();
      continue;
    }
    if (arg.startsWith('--db-host=')) {
      options.dbHost = arg.slice('--db-host='.length);
      continue;
    }

    if (arg === '--db-port') {
      options.dbPort = nextValue();
      continue;
    }
    if (arg.startsWith('--db-port=')) {
      options.dbPort = arg.slice('--db-port='.length);
      continue;
    }

    if (arg === '--db-database') {
      options.dbDatabase = nextValue();
      continue;
    }
    if (arg.startsWith('--db-database=')) {
      options.dbDatabase = arg.slice('--db-database='.length);
      continue;
    }

    if (arg === '--db-user') {
      options.dbUser = nextValue();
      continue;
    }
    if (arg.startsWith('--db-user=')) {
      options.dbUser = arg.slice('--db-user='.length);
      continue;
    }

    if (arg === '--db-password') {
      options.dbPassword = nextValue();
      continue;
    }
    if (arg.startsWith('--db-password=')) {
      options.dbPassword = arg.slice('--db-password='.length);
      continue;
    }

    if (arg === '--db-underscored') {
      options.dbUnderscored = nextValue();
      continue;
    }
    if (arg.startsWith('--db-underscored=')) {
      options.dbUnderscored = arg.slice('--db-underscored='.length);
      continue;
    }

    if (arg === '--timezone') {
      options.timezone = nextValue();
      continue;
    }
    if (arg.startsWith('--timezone=')) {
      options.timezone = arg.slice('--timezone='.length);
      continue;
    }

    if (arg === '--port') {
      options.port = Number(nextValue());
      continue;
    }
    if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length));
      continue;
    }

    if (arg === '--lang') {
      options.lang = nextValue();
      continue;
    }
    if (arg.startsWith('--lang=')) {
      options.lang = arg.slice('--lang='.length);
      continue;
    }

    if (arg === '--run-mode') {
      options.runMode = nextValue();
      continue;
    }
    if (arg.startsWith('--run-mode=')) {
      options.runMode = arg.slice('--run-mode='.length);
      continue;
    }

    if (arg === '--git-repo') {
      options.gitRepo = nextValue();
      continue;
    }
    if (arg.startsWith('--git-repo=')) {
      options.gitRepo = arg.slice('--git-repo='.length);
      continue;
    }

    if (arg === '--git-ref') {
      options.gitRef = nextValue();
      continue;
    }
    if (arg.startsWith('--git-ref=')) {
      options.gitRef = arg.slice('--git-ref='.length);
      continue;
    }

    if (arg === '--create-package') {
      options.createPackage = nextValue();
      continue;
    }
    if (arg.startsWith('--create-package=')) {
      options.createPackage = arg.slice('--create-package='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!METHODS.has(options.method)) {
    throw new Error(`Invalid --method value: ${options.method}`);
  }
  if (!CHANNELS.has(options.releaseChannel)) {
    throw new Error(`Invalid --release-channel value: ${options.releaseChannel}`);
  }
  if (!DB_MODES.has(options.dbMode)) {
    throw new Error(`Invalid --db-mode value: ${options.dbMode}`);
  }
  if (!DIALECTS.has(options.dbDialect)) {
    throw new Error(`Invalid --db-dialect value: ${options.dbDialect}`);
  }
  if (!RUN_MODES.has(options.runMode)) {
    throw new Error(`Invalid --run-mode value: ${options.runMode}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid --port value: ${options.port}`);
  }

  options.targetDir = path.resolve(options.targetDir);
  options.projectName = options.projectName || defaultProjectName(options.method);
  options.dbHost = options.dbHost || process.env.DB_HOST || '';
  options.dbPort = options.dbPort || process.env.DB_PORT || '';
  options.dbDatabase = options.dbDatabase || process.env.DB_DATABASE || '';
  options.dbUser = options.dbUser || process.env.DB_USER || '';
  options.dbPassword = options.dbPassword || process.env.DB_PASSWORD || '';
  options.dbUnderscored = resolveDbUnderscored(options.dbUnderscored, process.env.DB_UNDERSCORED);
  options.dbMode = resolveDbMode(options);
  validateDbPolicy(options);
  options.dbPort = options.dbPort || defaultDbPort(options.dbDialect);
  if (options.dbMode === 'bundled') {
    options.dbDatabase = options.dbDatabase || defaultDbDatabase(options.dbDialect);
  }
  options.gitRef = options.gitRef || defaultGitRef(options.releaseChannel);
  options.createPackage = options.createPackage || defaultCreatePackage(options.releaseChannel);
  validateDbInputsForExistingMode(options);

  return options;
}

function defaultProjectName(method) {
  if (method === 'create-nocobase-app') {
    return 'my-nocobase-app';
  }
  if (method === 'git') {
    return 'my-nocobase';
  }
  return 'my-nocobase';
}

function defaultDbPort(dialect) {
  if (dialect === 'postgres') {
    return '5432';
  }
  return '3306';
}

function defaultDbDatabase() {
  return 'nocobase';
}

function parseBooleanValue(optionName, value) {
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid ${optionName} value: ${value}. Use true or false.`);
}

function resolveDbUnderscored(cliValue, envValue) {
  if (cliValue !== null && cliValue !== undefined && String(cliValue).length > 0) {
    return parseBooleanValue('--db-underscored', cliValue);
  }
  if (envValue !== undefined && envValue !== null && String(envValue).trim().length > 0) {
    return parseBooleanValue('DB_UNDERSCORED', envValue);
  }
  return false;
}

function hasAnyExternalDbInput(options) {
  return Boolean(options.dbHost || options.dbPort || options.dbDatabase || options.dbUser || options.dbPassword);
}

function resolveDbMode(options) {
  if (options.method !== 'docker') {
    return 'existing';
  }
  if (options.dbMode === 'bundled' && hasAnyExternalDbInput(options)) {
    return 'existing';
  }
  return options.dbMode;
}

function validateDbPolicy(options) {
  if (options.method !== 'docker' && options.dbMode !== 'existing') {
    throw new Error(`Method ${options.method} requires db-mode=existing`);
  }
  if (options.dbMode === 'existing' && !EXTERNAL_DB_DIALECTS.has(options.dbDialect)) {
    throw new Error(`db-dialect=${options.dbDialect} is not supported for existing database mode. Use postgres, mysql, or mariadb.`);
  }
}

function validateDbInputsForExistingMode(options) {
  if (options.dbMode !== 'existing') {
    return;
  }
  const missing = [];
  if (!options.dbHost) {
    missing.push('db-host');
  }
  if (!options.dbPort) {
    missing.push('db-port');
  }
  if (!options.dbDatabase) {
    missing.push('db-database');
  }
  if (!options.dbUser) {
    missing.push('db-user');
  }
  if (!options.dbPassword) {
    missing.push('db-password');
  }
  if (missing.length > 0) {
    throw new Error(`Existing database mode requires ${missing.join(', ')}`);
  }
}

function defaultGitRef(channel) {
  if (channel === 'beta') {
    return 'next';
  }
  if (channel === 'alpha') {
    return 'develop';
  }
  return 'main';
}

function defaultCreatePackage(channel) {
  if (channel === 'beta') {
    return 'nocobase-app@beta';
  }
  if (channel === 'alpha') {
    return 'nocobase-app@alpha';
  }
  return 'nocobase-app';
}

function dockerImageByChannel(channel) {
  if (channel === 'beta') {
    return 'registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:beta-full';
  }
  if (channel === 'alpha') {
    return 'registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:alpha-full';
  }
  return 'registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:latest-full';
}

function quoteArgs(args) {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg)).join(' ');
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function commandBin(command) {
  if (process.platform === 'win32' && command === 'yarn') {
    return 'yarn.cmd';
  }
  return command;
}

function ensureCommand(command, reason) {
  if (!commandExists(command)) {
    throw new Error(`${command} is required: ${reason}`);
  }
}

function runCommand(command, args, cwd, options) {
  const printable = `${command} ${quoteArgs(args)}`.trim();
  console.log(`+ (${cwd}) ${printable}`);
  if (options.dryRun) {
    return;
  }
  const result = spawnSync(commandBin(command), args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${printable}`);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeInstallMethodMarker(projectDir, method, options) {
  const markerPath = path.join(projectDir, '.nocobase-install-method');
  if (options.dryRun) {
    console.log(`~ (${projectDir}) write ${markerPath}: ${method}`);
    return;
  }
  fs.writeFileSync(markerPath, `${method}\n`, 'utf8');
  console.log(`install_method_marker: ${markerPath}`);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dotEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const pattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*(.*)$`, 'm');
  const match = content.match(pattern);
  if (!match) {
    return '';
  }
  const raw = match[1].trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function upsertDotEnv(filePath, key, value) {
  const entry = `${key}=${value}`;
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }
  const pattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=.*$`, 'm');
  if (pattern.test(content)) {
    content = content.replace(pattern, entry);
  } else if (content.trim().length === 0) {
    content = `${entry}\n`;
  } else if (content.endsWith('\n')) {
    content += `${entry}\n`;
  } else {
    content += `\n${entry}\n`;
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function looksWeakAppKey(value) {
  if (!value) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 32) {
    return true;
  }
  if (/\s/.test(value)) {
    return true;
  }
  return normalized.includes('change-me') || normalized.includes('please-change') || normalized.includes('secret-key');
}

function randomAppKey() {
  return crypto.randomBytes(32).toString('hex');
}

function fillTemplate(content, replacements) {
  let output = content;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`__${key}__`, String(value));
  }
  return output;
}

function resolveSkillPaths() {
  const scriptFile = fileURLToPath(import.meta.url);
  const scriptDir = path.dirname(scriptFile);
  const skillRoot = path.resolve(scriptDir, '..');
  return {
    scriptDir,
    skillRoot,
    dockerTemplatesDir: path.join(skillRoot, 'assets', 'docker-templates'),
    installTemplatesDir: path.join(skillRoot, 'assets', 'install-templates'),
  };
}

function installDocker(options, paths) {
  ensureCommand('docker', 'docker method requires docker and docker compose');

  ensureDir(options.targetDir);
  const sourceTemplate = options.dbMode === 'existing'
    ? path.join(paths.dockerTemplatesDir, `docker-compose.external.${options.dbDialect}.yml`)
    : path.join(paths.dockerTemplatesDir, `docker-compose.${options.dbDialect}.yml`);
  if (!fs.existsSync(sourceTemplate)) {
    throw new Error(`Missing local docker template: ${sourceTemplate}`);
  }

  const targetCompose = path.join(options.targetDir, 'docker-compose.yml');
  fs.copyFileSync(sourceTemplate, targetCompose);
  console.log(`template_source: ${sourceTemplate}`);
  console.log(`template_target: ${targetCompose}`);

  const envPath = path.join(options.targetDir, '.env');
  const existingAppKey = process.env.APP_KEY || dotEnvValue(envPath, 'APP_KEY');
  const appKey = looksWeakAppKey(existingAppKey) ? randomAppKey() : existingAppKey;

  upsertDotEnv(envPath, 'APP_KEY', appKey);
  upsertDotEnv(envPath, 'APP_PORT', String(options.port));
  upsertDotEnv(envPath, 'NOCOBASE_APP_IMAGE', dockerImageByChannel(options.releaseChannel));
  upsertDotEnv(envPath, 'DB_UNDERSCORED', String(options.dbUnderscored));
  if (options.dbMode === 'existing') {
    upsertDotEnv(envPath, 'DB_DIALECT', options.dbDialect);
    upsertDotEnv(envPath, 'DB_HOST', options.dbHost);
    upsertDotEnv(envPath, 'DB_PORT', options.dbPort);
    upsertDotEnv(envPath, 'DB_DATABASE', options.dbDatabase);
    upsertDotEnv(envPath, 'DB_USER', options.dbUser);
    upsertDotEnv(envPath, 'DB_PASSWORD', options.dbPassword);
  }

  if (!options.skipPull) {
    runCommand('docker', ['compose', 'pull'], options.targetDir, options);
  }
  runCommand('docker', ['compose', 'up', '-d'], options.targetDir, options);
  runCommand('docker', ['compose', 'logs', '--tail=200', 'app'], options.targetDir, options);
  writeInstallMethodMarker(options.targetDir, 'docker', options);

  console.log('method_result: docker install commands completed.');
}

function installCreateApp(options, paths) {
  ensureCommand('node', 'create-nocobase-app method requires node');
  ensureCommand('yarn', 'create-nocobase-app method requires yarn classic');

  ensureDir(options.targetDir);
  const appDir = path.join(options.targetDir, options.projectName);
  if (fs.existsSync(appDir)) {
    throw new Error(`Target project directory already exists: ${appDir}`);
  }

  const createTemplate = path.join(paths.installTemplatesDir, 'create-app.command.template.txt');
  if (fs.existsSync(createTemplate)) {
    const template = fs.readFileSync(createTemplate, 'utf8');
    const preview = fillTemplate(template, {
      CREATE_PACKAGE: options.createPackage,
      PROJECT_NAME: options.projectName,
      DB_DIALECT: options.dbDialect,
      DB_HOST: options.dbHost,
      DB_PORT: options.dbPort,
      DB_DATABASE: options.dbDatabase,
      DB_USER: options.dbUser,
      DB_PASSWORD: '******',
      DB_UNDERSCORED: String(options.dbUnderscored),
      TZ: options.timezone,
    });
    console.log('template_preview:create-app');
    console.log(preview);
  }

  runCommand(
    'yarn',
    [
      'create',
      options.createPackage,
      options.projectName,
      '-d',
      options.dbDialect,
      '-e',
      `DB_HOST=${options.dbHost}`,
      '-e',
      `DB_PORT=${options.dbPort}`,
      '-e',
      `DB_DATABASE=${options.dbDatabase}`,
      '-e',
      `DB_USER=${options.dbUser}`,
      '-e',
      `DB_PASSWORD=${options.dbPassword}`,
      '-e',
      `DB_UNDERSCORED=${String(options.dbUnderscored)}`,
      '-e',
      `TZ=${options.timezone}`,
    ],
    options.targetDir,
    options,
  );

  runCommand('yarn', ['install'], appDir, options);

  const envPath = path.join(appDir, '.env');
  const existingAppKey = process.env.APP_KEY || dotEnvValue(envPath, 'APP_KEY');
  const appKey = looksWeakAppKey(existingAppKey) ? randomAppKey() : existingAppKey;
  upsertDotEnv(envPath, 'APP_KEY', appKey);
  upsertDotEnv(envPath, 'APP_PORT', String(options.port));
  upsertDotEnv(envPath, 'DB_DIALECT', options.dbDialect);
  upsertDotEnv(envPath, 'DB_UNDERSCORED', String(options.dbUnderscored));

  runCommand('yarn', ['nocobase', 'install', `--lang=${options.lang}`], appDir, options);

  if (options.runMode === 'dev') {
    runCommand('yarn', ['dev'], appDir, options);
  } else if (options.runMode === 'start') {
    runCommand('yarn', ['start'], appDir, options);
  } else {
    console.log(`next_command: (cd ${appDir} && yarn dev)`);
  }
  writeInstallMethodMarker(appDir, 'create-nocobase-app', options);

  console.log('method_result: create-nocobase-app install commands completed.');
}

function installGit(options, paths) {
  ensureCommand('git', 'git method requires git');
  ensureCommand('node', 'git method requires node');
  ensureCommand('yarn', 'git method requires yarn classic');

  ensureDir(options.targetDir);
  const appDir = path.join(options.targetDir, options.projectName);
  if (fs.existsSync(appDir)) {
    throw new Error(`Target project directory already exists: ${appDir}`);
  }

  const cloneTemplate = path.join(paths.installTemplatesDir, 'git.clone.command.template.txt');
  if (fs.existsSync(cloneTemplate)) {
    const template = fs.readFileSync(cloneTemplate, 'utf8');
    const preview = fillTemplate(template, {
      GIT_REPO: options.gitRepo,
      GIT_REF: options.gitRef,
      PROJECT_NAME: options.projectName,
    });
    console.log('template_preview:git-clone');
    console.log(preview);
  }

  runCommand(
    'git',
    ['clone', options.gitRepo, '-b', options.gitRef, '--depth=1', options.projectName],
    options.targetDir,
    options,
  );

  runCommand('yarn', ['install', '--frozen-lockfile'], appDir, options);

  const envTemplatePath = path.join(paths.installTemplatesDir, 'git.env.template');
  if (!fs.existsSync(envTemplatePath)) {
    throw new Error(`Missing local env template: ${envTemplatePath}`);
  }
  const envTemplate = fs.readFileSync(envTemplatePath, 'utf8');
  const envContent = fillTemplate(envTemplate, {
    TZ: options.timezone,
    APP_KEY: process.env.APP_KEY && !looksWeakAppKey(process.env.APP_KEY) ? process.env.APP_KEY : randomAppKey(),
    APP_PORT: options.port,
    DB_DIALECT: options.dbDialect,
    DB_HOST: options.dbHost,
    DB_PORT: options.dbPort,
    DB_DATABASE: options.dbDatabase,
    DB_USER: options.dbUser,
    DB_PASSWORD: options.dbPassword,
    DB_UNDERSCORED: String(options.dbUnderscored),
  });
  const envPath = path.join(appDir, '.env');
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`env_template_source: ${envTemplatePath}`);
  console.log(`env_template_target: ${envPath}`);

  runCommand('yarn', ['nocobase', 'install', `--lang=${options.lang}`], appDir, options);

  if (options.runMode === 'dev') {
    runCommand('yarn', ['dev'], appDir, options);
  } else if (options.runMode === 'start') {
    runCommand('yarn', ['start'], appDir, options);
  } else {
    console.log(`next_command: (cd ${appDir} && yarn dev)`);
  }
  writeInstallMethodMarker(appDir, 'git', options);

  console.log('method_result: git install commands completed.');
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`install error: ${error.message}`);
    printHelp();
    process.exit(2);
  }

  const paths = resolveSkillPaths();
  console.log(`install_method: ${options.method}`);
  console.log(`release_channel: ${options.releaseChannel}`);
  console.log(`target_dir: ${options.targetDir}`);
  console.log(`project_name: ${options.projectName}`);
  console.log(`db_mode: ${options.dbMode}`);
  console.log(`db_dialect: ${options.dbDialect}`);
  console.log(`db_underscored: ${String(options.dbUnderscored)}`);

  try {
    if (options.method === 'docker') {
      installDocker(options, paths);
    } else if (options.method === 'create-nocobase-app') {
      installCreateApp(options, paths);
    } else {
      installGit(options, paths);
    }
  } catch (error) {
    console.error(`install error: ${error.message}`);
    process.exit(1);
  }
}

main();
