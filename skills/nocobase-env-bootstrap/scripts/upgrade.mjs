#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const INPUT_METHODS = new Set(['auto', 'docker', 'create-nocobase-app', 'git']);
const RESOLVED_METHODS = new Set(['docker', 'create-nocobase-app', 'git']);
const CHANNELS = new Set(['latest', 'beta', 'alpha']);
const RESTART_MODES = new Set(['manual', 'dev', 'start', 'pm2']);

function printHelp() {
  const help = [
    'Usage:',
    '  node ./scripts/upgrade.mjs [options]',
    '',
    'Options:',
    '  --method <auto|docker|create-nocobase-app|git> Upgrade method. Default: auto',
    '  --target-dir <dir>                           Project directory. Default: .',
    '  --release-channel <latest|beta|alpha>       Release channel for docker alias tags. Default: latest',
    '  --target-version <version>                   Target version (create/git) or image tag/version (docker)',
    '  --restart-mode <manual|dev|start|pm2>       Restart behavior after upgrade. Default: manual',
    '  --backup-confirmed <true|false>              Must be true before upgrade can run',
    '  --confirm-upgrade <true|false>               Must be true before non-dry-run upgrade can run',
    '  --clean-retry <true|false>                   Git path only: retry with clean + reinstall on failure. Default: false',
    '  --allow-dirty <true|false>                   Git path only: allow dirty worktree. Default: false',
    '  --skip-pull                                  Docker path only: skip docker compose pull app',
    '  --dry-run                                    Print commands without executing',
    '  -h, --help                                   Show help',
    '',
    'Examples:',
    '  node ./scripts/upgrade.mjs --target-dir . --backup-confirmed true --confirm-upgrade true --target-version 2.1.0-alpha.16',
    '  node ./scripts/upgrade.mjs --method create-nocobase-app --target-dir ./my-nocobase-app --backup-confirmed true --confirm-upgrade true',
    '  node ./scripts/upgrade.mjs --method git --target-dir ./my-nocobase --backup-confirmed true --confirm-upgrade true --clean-retry true',
    '  node ./scripts/upgrade.mjs --target-dir ./my-nocobase --backup-confirmed true --dry-run',
  ];
  console.log(help.join('\n'));
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

function parseArgs(argv) {
  const options = {
    method: 'auto',
    targetDir: '.',
    releaseChannel: 'latest',
    targetVersion: '',
    restartMode: 'manual',
    backupConfirmed: false,
    confirmUpgrade: false,
    cleanRetry: false,
    allowDirty: false,
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

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--skip-pull') {
      options.skipPull = true;
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

    if (arg === '--target-version') {
      options.targetVersion = nextValue();
      continue;
    }
    if (arg.startsWith('--target-version=')) {
      options.targetVersion = arg.slice('--target-version='.length);
      continue;
    }

    if (arg === '--restart-mode') {
      options.restartMode = nextValue();
      continue;
    }
    if (arg.startsWith('--restart-mode=')) {
      options.restartMode = arg.slice('--restart-mode='.length);
      continue;
    }

    if (arg === '--backup-confirmed') {
      options.backupConfirmed = parseBooleanValue('--backup-confirmed', nextValue());
      continue;
    }
    if (arg.startsWith('--backup-confirmed=')) {
      options.backupConfirmed = parseBooleanValue('--backup-confirmed', arg.slice('--backup-confirmed='.length));
      continue;
    }

    if (arg === '--confirm-upgrade') {
      options.confirmUpgrade = parseBooleanValue('--confirm-upgrade', nextValue());
      continue;
    }
    if (arg.startsWith('--confirm-upgrade=')) {
      options.confirmUpgrade = parseBooleanValue('--confirm-upgrade', arg.slice('--confirm-upgrade='.length));
      continue;
    }

    if (arg === '--clean-retry') {
      options.cleanRetry = parseBooleanValue('--clean-retry', nextValue());
      continue;
    }
    if (arg.startsWith('--clean-retry=')) {
      options.cleanRetry = parseBooleanValue('--clean-retry', arg.slice('--clean-retry='.length));
      continue;
    }

    if (arg === '--allow-dirty') {
      options.allowDirty = parseBooleanValue('--allow-dirty', nextValue());
      continue;
    }
    if (arg.startsWith('--allow-dirty=')) {
      options.allowDirty = parseBooleanValue('--allow-dirty', arg.slice('--allow-dirty='.length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!INPUT_METHODS.has(options.method)) {
    throw new Error(`Invalid --method value: ${options.method}`);
  }
  if (!CHANNELS.has(options.releaseChannel)) {
    throw new Error(`Invalid --release-channel value: ${options.releaseChannel}`);
  }
  if (!RESTART_MODES.has(options.restartMode)) {
    throw new Error(`Invalid --restart-mode value: ${options.restartMode}`);
  }
  if (!options.backupConfirmed) {
    throw new Error('Upgrade is blocked: please confirm backup first with --backup-confirmed true');
  }
  options.targetDir = path.resolve(options.targetDir);
  options.targetVersion = options.targetVersion.trim();

  return options;
}

function commandBin(command) {
  if (process.platform === 'win32' && command === 'yarn') {
    return 'yarn.cmd';
  }
  return command;
}

function quoteArgs(args) {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg)).join(' ');
}

function runCommand(command, args, cwd, options) {
  const printable = `${command} ${quoteArgs(args)}`.trim();
  console.log(`+ (${cwd}) ${printable}`);
  if (options.dryRun) {
    return { status: 0, stdout: '', stderr: '' };
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
  return result;
}

function runCommandCapture(command, args, cwd) {
  const result = spawnSync(commandBin(command), args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    encoding: 'utf8',
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').toString(),
    stderr: (result.stderr || '').toString(),
    error: result.error || null,
  };
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function ensureCommand(command, reason) {
  if (!commandExists(command)) {
    throw new Error(`${command} is required: ${reason}`);
  }
}

function ensureFileExists(filePath, reason) {
  if (!fs.existsSync(filePath)) {
    throw new Error(reason);
  }
}

function readInstallMethodMarker(projectDir) {
  const markerPath = path.join(projectDir, '.nocobase-install-method');
  if (!fs.existsSync(markerPath)) {
    return '';
  }
  const marker = fs.readFileSync(markerPath, 'utf8').trim().toLowerCase();
  if (!RESOLVED_METHODS.has(marker)) {
    return '';
  }
  return marker;
}

function resolveUpgradeMethod(projectDir, methodInput) {
  if (methodInput !== 'auto') {
    return {
      method: methodInput,
      source: 'argument',
    };
  }

  const markerMethod = readInstallMethodMarker(projectDir);
  if (markerMethod) {
    return {
      method: markerMethod,
      source: '.nocobase-install-method',
    };
  }

  const hasCompose = fs.existsSync(path.join(projectDir, 'docker-compose.yml'))
    || fs.existsSync(path.join(projectDir, 'compose.yml'));
  const hasPackageJson = fs.existsSync(path.join(projectDir, 'package.json'));
  const hasGit = fs.existsSync(path.join(projectDir, '.git'));

  if (hasPackageJson && hasCompose && !hasGit) {
    throw new Error('Cannot auto-detect upgrade method: both package.json and compose files exist. Please pass --method explicitly.');
  }
  if (hasPackageJson && hasGit) {
    return {
      method: 'git',
      source: 'project_files(.git+package.json)',
    };
  }
  if (hasPackageJson) {
    return {
      method: 'create-nocobase-app',
      source: 'project_files(package.json)',
    };
  }
  if (hasCompose) {
    return {
      method: 'docker',
      source: 'project_files(compose)',
    };
  }

  throw new Error('Cannot auto-detect upgrade method from target dir. Please pass --method docker|create-nocobase-app|git.');
}

function removeNodeModules(projectDir, options) {
  const nodeModulesPath = path.join(projectDir, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('cleanup: node_modules not found, skip');
    return;
  }
  if (options.dryRun) {
    console.log(`~ (${projectDir}) remove ${nodeModulesPath}`);
    return;
  }
  fs.rmSync(nodeModulesPath, { recursive: true, force: true });
  console.log('cleanup: removed node_modules');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function normalizeVersion(version) {
  return version.replace(/^v/i, '').trim();
}

function extractSemver(input) {
  if (!input) {
    return null;
  }
  const normalized = String(input).trim();
  const fromTagMatch = normalized.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)(?:-full)?$/);
  if (fromTagMatch) {
    return fromTagMatch[1];
  }
  const semverMatch = normalized.match(/^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$/);
  if (semverMatch) {
    return semverMatch[1];
  }
  return null;
}

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function compareIdentifier(a, b) {
  const isNumA = /^\d+$/.test(a);
  const isNumB = /^\d+$/.test(b);
  if (isNumA && isNumB) {
    return Number(a) - Number(b);
  }
  if (isNumA) {
    return -1;
  }
  if (isNumB) {
    return 1;
  }
  return a.localeCompare(b);
}

function comparePrerelease(a, b) {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return 1;
  }
  if (!b) {
    return -1;
  }
  const aParts = a.split('.');
  const bParts = b.split('.');
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const left = aParts[i];
    const right = bParts[i];
    if (left === undefined) {
      return -1;
    }
    if (right === undefined) {
      return 1;
    }
    const diff = compareIdentifier(left, right);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) {
    return null;
  }
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  if (a.patch !== b.patch) {
    return a.patch - b.patch;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function normalizeTargetVersionForDocker(version) {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return '';
  }
  if (normalized.includes('/')) {
    return normalized;
  }
  if (normalized.includes(':')) {
    return normalized;
  }
  const tag = normalized.endsWith('-full') ? normalized : `${normalized}-full`;
  return `registry.cn-shanghai.aliyuncs.com/nocobase/nocobase:${tag}`;
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

function readPackageJson(projectDir) {
  const packagePath = path.join(projectDir, 'package.json');
  ensureFileExists(packagePath, `Missing package.json in target dir: ${projectDir}`);
  return {
    packagePath,
    data: JSON.parse(fs.readFileSync(packagePath, 'utf8')),
  };
}

function getCurrentCliVersion(projectDir) {
  const { data } = readPackageJson(projectDir);
  return data.dependencies?.['@nocobase/cli']
    || data.devDependencies?.['@nocobase/cli']
    || '';
}

function readCurrentDockerImage(projectDir) {
  const envPath = path.join(projectDir, '.env');
  if (!fs.existsSync(envPath)) {
    return '';
  }
  return (fs.readFileSync(envPath, 'utf8').match(/^\s*NOCOBASE_APP_IMAGE\s*=\s*(.*)$/m)?.[1] || '').trim();
}

function getUpgradePreview(options) {
  if (options.method === 'docker') {
    const currentImage = readCurrentDockerImage(options.targetDir);
    let targetImage = currentImage;
    if (options.targetVersion) {
      targetImage = normalizeTargetVersionForDocker(options.targetVersion);
    } else if (options.releaseChannel) {
      targetImage = dockerImageByChannel(options.releaseChannel);
    }
    return {
      currentRef: currentImage || 'unknown',
      targetRef: targetImage || currentImage || 'unknown',
    };
  }

  let currentCliVersion = 'unknown';
  if (fs.existsSync(path.join(options.targetDir, 'package.json'))) {
    try {
      currentCliVersion = getCurrentCliVersion(options.targetDir) || 'unknown';
    } catch (error) {
      currentCliVersion = 'unknown';
    }
  }

  return {
    currentRef: currentCliVersion,
    targetRef: options.targetVersion ? normalizeVersion(options.targetVersion) : '(run yarn nocobase upgrade)',
  };
}

function printUpgradePlan(options, preview, methodInput, methodSource) {
  console.log('upgrade_plan_begin');
  console.log(`upgrade_method_input: ${methodInput}`);
  console.log(`upgrade_method_resolved: ${options.method}`);
  console.log(`upgrade_method_source: ${methodSource}`);
  console.log(`upgrade_target_dir: ${options.targetDir}`);
  console.log(`upgrade_release_channel: ${options.releaseChannel}`);
  console.log(`upgrade_target_version: ${options.targetVersion || '(auto)'}`);
  console.log(`upgrade_restart_mode: ${options.restartMode}`);
  console.log(`upgrade_clean_retry: ${String(options.cleanRetry)}`);
  console.log(`upgrade_allow_dirty: ${String(options.allowDirty)}`);
  console.log(`upgrade_backup_confirmed: ${String(options.backupConfirmed)}`);
  console.log(`upgrade_confirm_upgrade: ${String(options.confirmUpgrade)}`);
  if (options.method === 'docker') {
    console.log(`upgrade_current_image: ${preview.currentRef}`);
    console.log(`upgrade_target_image: ${preview.targetRef}`);
  } else {
    console.log(`upgrade_current_cli_version: ${preview.currentRef}`);
    console.log(`upgrade_target_cli_version: ${preview.targetRef}`);
  }
  console.log('upgrade_plan_end');
}

function ensureUpgradeConfirmation(options) {
  if (options.dryRun) {
    return;
  }
  if (!options.confirmUpgrade) {
    throw new Error('Upgrade is blocked: please confirm upgrade plan by rerunning with --confirm-upgrade true');
  }
}

function setNocobaseVersions(projectDir, version, options) {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    throw new Error('Invalid --target-version value.');
  }
  const { packagePath, data } = readPackageJson(projectDir);
  data.dependencies = data.dependencies || {};
  data.devDependencies = data.devDependencies || {};
  data.dependencies['@nocobase/cli'] = normalized;
  data.devDependencies['@nocobase/devtools'] = normalized;

  if (options.dryRun) {
    console.log(`~ (${projectDir}) update package.json: @nocobase/cli=${normalized}, @nocobase/devtools=${normalized}`);
    return;
  }
  fs.writeFileSync(packagePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function ensureNoDowngrade(currentVersionLike, targetVersionLike) {
  const currentSemver = extractSemver(currentVersionLike);
  const targetSemver = extractSemver(targetVersionLike);
  if (!currentSemver || !targetSemver) {
    console.log('downgrade_check: skipped (cannot parse semver from current/target)');
    return;
  }
  const diff = compareSemver(targetSemver, currentSemver);
  if (diff === null) {
    console.log('downgrade_check: skipped (semver compare unavailable)');
    return;
  }
  if (diff < 0) {
    throw new Error(`Target version ${targetSemver} is lower than current version ${currentSemver}. NocoBase does not support downgrade.`);
  }
}

function assertGitClean(projectDir, options) {
  const result = runCommandCapture('git', ['status', '--porcelain'], projectDir);
  if (result.error || result.status !== 0) {
    throw new Error('Unable to check git worktree status.');
  }
  const output = result.stdout.trim();
  if (output && !options.allowDirty) {
    throw new Error('Git worktree is not clean. Commit/stash changes first or pass --allow-dirty true.');
  }
  if (output && options.allowDirty) {
    console.log('git_status: dirty (allowed by --allow-dirty true)');
  } else {
    console.log('git_status: clean');
  }
}

function executeRestart(projectDir, options) {
  if (options.restartMode === 'manual') {
    console.log(`next_command: (cd ${projectDir} && yarn dev)`);
    return;
  }
  if (options.restartMode === 'dev') {
    runCommand('yarn', ['dev'], projectDir, options);
    return;
  }
  if (options.restartMode === 'start') {
    runCommand('yarn', ['start'], projectDir, options);
    return;
  }
  runCommand('yarn', ['nocobase', 'start'], projectDir, options);
}

function performCreateOrGitUpgrade(projectDir, options) {
  ensureCommand('node', `${options.method} upgrade requires node`);
  ensureCommand('yarn', `${options.method} upgrade requires yarn classic`);
  ensureFileExists(path.join(projectDir, 'package.json'), `Missing package.json in target dir: ${projectDir}`);

  if (options.method === 'git') {
    ensureCommand('git', 'git upgrade method requires git');
    assertGitClean(projectDir, options);
  }

  const currentCliVersion = getCurrentCliVersion(projectDir);
  if (options.targetVersion) {
    ensureNoDowngrade(currentCliVersion, options.targetVersion);
  }

  if (options.restartMode === 'pm2') {
    runCommand('yarn', ['nocobase', 'pm2-stop'], projectDir, options);
  } else {
    console.log('stop_hint: stop running NocoBase process before upgrade (Ctrl+C for foreground process).');
  }

  if (options.method === 'git') {
    runCommand('git', ['pull'], projectDir, options);
  }

  const upgradeArgs = ['nocobase', 'upgrade'];
  if (options.targetVersion) {
    setNocobaseVersions(projectDir, options.targetVersion, options);
    runCommand('yarn', ['install'], projectDir, options);
    upgradeArgs.push('--skip-code-update');
  } else if (options.method === 'git') {
    runCommand('yarn', ['install'], projectDir, options);
  }

  try {
    runCommand('yarn', upgradeArgs, projectDir, options);
  } catch (error) {
    if (options.method === 'git' && options.cleanRetry) {
      console.log('retry: git upgrade failed, retry with clean + reinstall');
      runCommand('yarn', ['nocobase', 'clean'], projectDir, options);
      removeNodeModules(projectDir, options);
      runCommand('yarn', ['install'], projectDir, options);
      runCommand('yarn', upgradeArgs, projectDir, options);
    } else {
      throw error;
    }
  }

  executeRestart(projectDir, options);

  const versionAfter = getCurrentCliVersion(projectDir);
  console.log(`version_before: ${currentCliVersion || 'unknown'}`);
  console.log(`version_after: ${versionAfter || 'unknown'}`);
  console.log('action_required: upgrade_third_party_plugins');
  console.log('plugin_upgrade_hint: review and upgrade third-party plugins after core upgrade.');
}

function performDockerUpgrade(projectDir, options) {
  ensureCommand('docker', 'docker upgrade method requires docker and docker compose');
  const composePath = path.join(projectDir, 'docker-compose.yml');
  const composeAltPath = path.join(projectDir, 'compose.yml');
  if (!fs.existsSync(composePath) && !fs.existsSync(composeAltPath)) {
    throw new Error(`Missing compose file in target dir: ${projectDir}`);
  }

  const envPath = path.join(projectDir, '.env');
  const currentImage = readCurrentDockerImage(projectDir);
  let targetImage = currentImage;
  if (options.targetVersion) {
    targetImage = normalizeTargetVersionForDocker(options.targetVersion);
  } else if (options.releaseChannel) {
    targetImage = dockerImageByChannel(options.releaseChannel);
  }

  if (targetImage) {
    ensureNoDowngrade(currentImage, targetImage);
    if (options.dryRun) {
      console.log(`~ (${projectDir}) update ${envPath}: NOCOBASE_APP_IMAGE=${targetImage}`);
    } else {
      upsertDotEnv(envPath, 'NOCOBASE_APP_IMAGE', targetImage);
    }
  }

  if (!options.skipPull) {
    runCommand('docker', ['compose', 'pull', 'app'], projectDir, options);
  }
  runCommand('docker', ['compose', 'up', '-d', 'app'], projectDir, options);
  runCommand('docker', ['compose', 'logs', '--tail=300', 'app'], projectDir, options);

  console.log(`image_before: ${currentImage || 'unknown'}`);
  console.log(`image_after: ${targetImage || currentImage || 'unknown'}`);
  console.log('action_required: upgrade_third_party_plugins');
  console.log('plugin_upgrade_hint: review and upgrade third-party plugins after docker upgrade.');
  console.log('rollback_hint: restore pre-upgrade database backup and switch image tag back to previous version.');
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`upgrade error: ${error.message}`);
    printHelp();
    process.exit(2);
  }

  const methodInput = options.method;
  let methodResolved = {};
  try {
    methodResolved = resolveUpgradeMethod(options.targetDir, options.method);
    options.method = methodResolved.method;
  } catch (error) {
    console.error(`upgrade error: ${error.message}`);
    process.exit(2);
  }

  const preview = getUpgradePreview(options);
  printUpgradePlan(options, preview, methodInput, methodResolved.source);
  try {
    ensureUpgradeConfirmation(options);
  } catch (error) {
    console.error(`upgrade error: ${error.message}`);
    process.exit(2);
  }

  console.log(`upgrade_method: ${options.method}`);
  console.log(`target_dir: ${options.targetDir}`);
  console.log(`backup_confirmed: ${String(options.backupConfirmed)}`);
  console.log(`confirm_upgrade: ${String(options.confirmUpgrade)}`);
  console.log(`release_channel: ${options.releaseChannel}`);
  console.log(`target_version: ${options.targetVersion || '(auto)'}`);
  console.log(`restart_mode: ${options.restartMode}`);
  console.log(`dry_run: ${String(options.dryRun)}`);

  try {
    if (options.method === 'docker') {
      performDockerUpgrade(options.targetDir, options);
    } else {
      performCreateOrGitUpgrade(options.targetDir, options);
    }
  } catch (error) {
    console.error(`upgrade error: ${error.message}`);
    process.exit(1);
  }
}

main();
