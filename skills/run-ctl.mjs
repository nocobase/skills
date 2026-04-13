#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const INSTALL_URL = 'https://github.com/nocobase/nocobase-ctl';

function printHelp() {
  const help = [
    'Usage:',
    '  node skills/run-ctl.mjs [--prefer auto|global|local] [--base-dir <dir>] [--debug] -- <ctl args...>',
    '  node skills/run-ctl.mjs <ctl args...>',
    '',
    'Examples:',
    '  node skills/run-ctl.mjs -- env update -e local',
    '  node skills/run-ctl.mjs --prefer local -- env add --name local --base-url http://localhost:13000/api --token xxx -s project',
    '',
    'Env overrides:',
    '  NOCOBASE_CTL_RUN_JS=<absolute-or-relative-path-to-bin/run.js>',
    '  NOCOBASE_CTL_ROOT=<nocobase-ctl-root-directory>',
  ];
  console.log(help.join('\n'));
}

function parseArgs(argv) {
  let prefer = 'auto';
  let baseDir = process.cwd();
  let debug = false;
  const ctlArgs = [];
  let passThrough = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (passThrough) {
      ctlArgs.push(arg);
      continue;
    }

    if (arg === '--') {
      passThrough = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--debug') {
      debug = true;
      continue;
    }

    if (arg === '--prefer') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --prefer');
      }
      prefer = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--prefer=')) {
      prefer = arg.slice('--prefer='.length);
      continue;
    }

    if (arg === '--base-dir') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --base-dir');
      }
      baseDir = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--base-dir=')) {
      baseDir = arg.slice('--base-dir='.length);
      continue;
    }

    ctlArgs.push(arg);
  }

  if (!['auto', 'global', 'local'].includes(prefer)) {
    throw new Error(`Invalid --prefer value: ${prefer}. Expected one of auto|global|local`);
  }

  if (ctlArgs.length === 0) {
    throw new Error('Missing ctl arguments. Example: node skills/run-ctl.mjs -- env update -e local');
  }

  return {
    prefer,
    debug,
    baseDir: path.resolve(baseDir),
    ctlArgs,
  };
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function collectRunJsCandidates(baseDir) {
  const candidates = [];
  const fromEnvRunJs = process.env.NOCOBASE_CTL_RUN_JS;
  const fromEnvRoot = process.env.NOCOBASE_CTL_ROOT;

  if (fromEnvRunJs) {
    candidates.push(path.resolve(baseDir, fromEnvRunJs));
  }

  if (fromEnvRoot) {
    candidates.push(path.resolve(baseDir, fromEnvRoot, 'bin', 'run.js'));
  }

  let current = baseDir;
  while (true) {
    candidates.push(path.join(current, 'node_modules', '@nocobase', 'ctl', 'bin', 'run.js'));
    candidates.push(path.join(current, 'nocobase-ctl', 'bin', 'run.js'));

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return dedupe(candidates);
}

function resolveLocalRunJs(baseDir) {
  const candidates = collectRunJsCandidates(baseDir);
  for (const candidate of candidates) {
    if (isFile(candidate)) {
      return { runJs: candidate, candidates };
    }
  }
  return { runJs: '', candidates };
}

function resolveGlobalBinary() {
  const globalCommands = ['nocobase-ctl', 'nbctl'];
  for (const cmd of globalCommands) {
    if (commandExists(cmd)) {
      return { command: cmd, globalCommands };
    }
  }
  return { command: '', globalCommands };
}

function buildResolverOrder(prefer) {
  if (prefer === 'global') {
    return ['global', 'local'];
  }
  if (prefer === 'local') {
    return ['local', 'global'];
  }
  return ['global', 'local'];
}

function runCtl(resolution, ctlArgs, baseDir) {
  if (resolution.type === 'global') {
    return spawnSync(resolution.command, ctlArgs, {
      stdio: 'inherit',
      cwd: baseDir,
      env: process.env,
    });
  }

  return spawnSync(process.execPath, [resolution.runJs, ...ctlArgs], {
    stdio: 'inherit',
    cwd: baseDir,
    env: process.env,
  });
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`run-ctl error: ${error.message}`);
    console.error(`Install guide: ${INSTALL_URL}`);
    process.exit(2);
  }

  const local = resolveLocalRunJs(options.baseDir);
  const global = resolveGlobalBinary();
  const order = buildResolverOrder(options.prefer);

  let chosen;
  for (const type of order) {
    if (type === 'global' && global.command) {
      chosen = { type: 'global', command: global.command };
      break;
    }
    if (type === 'local' && local.runJs) {
      chosen = { type: 'local', runJs: local.runJs };
      break;
    }
  }

  if (!chosen) {
    console.error('run-ctl error: Cannot find nocobase-ctl entrypoint.');
    console.error(`Tried global commands: ${global.globalCommands.join(', ')}`);
    if (local.candidates.length > 0) {
      console.error('Tried local run.js candidates:');
      for (const candidate of local.candidates) {
        console.error(`- ${candidate}`);
      }
    }
    console.error(`Please install nocobase-ctl: ${INSTALL_URL}`);
    process.exit(1);
  }

  if (options.debug) {
    if (chosen.type === 'global') {
      console.error(`run-ctl resolver: global (${chosen.command})`);
    } else {
      console.error(`run-ctl resolver: local (${chosen.runJs})`);
    }
  }

  const result = runCtl(chosen, options.ctlArgs, options.baseDir);
  if (result.error) {
    console.error(`run-ctl error: ${result.error.message}`);
    console.error(`Install guide: ${INSTALL_URL}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

main();
