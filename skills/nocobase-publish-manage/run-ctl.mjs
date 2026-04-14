#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const INSTALL_URL = 'https://github.com/nocobase/nocobase-ctl';

function printHelp() {
  const help = [
    'Usage:',
    '  node ./run-ctl.mjs [--prefer auto|global|local] [--base-dir <dir>] [--debug] -- <ctl args...>',
    '  node ./run-ctl.mjs <ctl args...>',
    '',
    'Examples:',
    '  node ./run-ctl.mjs -- env update -e local',
    '  node ./run-ctl.mjs --prefer local -- env add --name local --base-url http://localhost:13000/api --token xxx -s project',
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
    throw new Error('Missing ctl arguments. Example: node ./run-ctl.mjs -- env update -e local');
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

function readUtf8IfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function removeIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // noop
  }
}

function createCapturePaths() {
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    stdoutPath: path.join(os.tmpdir(), `run-ctl-${stamp}.stdout.log`),
    stderrPath: path.join(os.tmpdir(), `run-ctl-${stamp}.stderr.log`),
  };
}

function runCtl(resolution, ctlArgs, baseDir, stdio = 'inherit') {
  let command = '';
  let commandArgs = [];
  if (resolution.type === 'global') {
    command = resolution.command;
    commandArgs = ctlArgs;
  } else {
    command = process.execPath;
    commandArgs = [resolution.runJs, ...ctlArgs];
  }

  if (stdio === 'pipe') {
    const capture = createCapturePaths();
    let stdoutFd;
    let stderrFd;
    try {
      stdoutFd = fs.openSync(capture.stdoutPath, 'w');
      stderrFd = fs.openSync(capture.stderrPath, 'w');
      const result = spawnSync(command, commandArgs, {
        stdio: ['ignore', stdoutFd, stderrFd],
        cwd: baseDir,
        env: process.env,
      });
      if (stdoutFd !== undefined) fs.closeSync(stdoutFd);
      if (stderrFd !== undefined) fs.closeSync(stderrFd);
      return {
        ...result,
        stdout: readUtf8IfExists(capture.stdoutPath),
        stderr: readUtf8IfExists(capture.stderrPath),
      };
    } finally {
      if (stdoutFd !== undefined) {
        try { fs.closeSync(stdoutFd); } catch { /* noop */ }
      }
      if (stderrFd !== undefined) {
        try { fs.closeSync(stderrFd); } catch { /* noop */ }
      }
      removeIfExists(capture.stdoutPath);
      removeIfExists(capture.stderrPath);
    }
  }

  if (resolution.type === 'global') {
    return spawnSync(command, commandArgs, {
      stdio,
      cwd: baseDir,
      env: process.env,
    });
  }

  return spawnSync(command, commandArgs, {
    stdio,
    cwd: baseDir,
    env: process.env,
  });
}

export function runCtlWithResolver(options = {}) {
  const prefer = options.prefer || 'auto';
  const baseDir = path.resolve(options.baseDir || process.cwd());
  const ctlArgs = Array.isArray(options.ctlArgs) ? options.ctlArgs : [];
  const stdio = options.stdio || 'pipe';

  if (!['auto', 'global', 'local'].includes(prefer)) {
    return {
      code: 2,
      stdout: '',
      stderr: '',
      error: `Invalid --prefer value: ${prefer}. Expected one of auto|global|local`,
      command: [],
      resolver: null,
      diagnostics: [],
    };
  }

  if (ctlArgs.length === 0) {
    return {
      code: 2,
      stdout: '',
      stderr: '',
      error: 'Missing ctl arguments. Example: node ./run-ctl.mjs -- env update -e local',
      command: [],
      resolver: null,
      diagnostics: [],
    };
  }

  const local = resolveLocalRunJs(baseDir);
  const global = resolveGlobalBinary();
  const order = buildResolverOrder(prefer);

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
    const diagnostics = [
      `Tried global commands: ${global.globalCommands.join(', ')}`,
    ];
    if (local.candidates.length > 0) {
      diagnostics.push('Tried local run.js candidates:');
      for (const candidate of local.candidates) {
        diagnostics.push(`- ${candidate}`);
      }
    }
    return {
      code: 1,
      stdout: '',
      stderr: '',
      error: 'Cannot find nocobase-ctl entrypoint.',
      command: [],
      resolver: null,
      diagnostics,
    };
  }

  const result = runCtl(chosen, ctlArgs, baseDir, stdio);
  const command = chosen.type === 'global'
    ? [chosen.command, ...ctlArgs]
    : [process.execPath, chosen.runJs, ...ctlArgs];

  if (result.error) {
    return {
      code: 1,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error.message,
      command,
      resolver: chosen.type,
      diagnostics: [],
    };
  }

  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: '',
    command,
    resolver: chosen.type,
    diagnostics: [],
  };
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

  const result = runCtlWithResolver({
    prefer: options.prefer,
    baseDir: options.baseDir,
    ctlArgs: options.ctlArgs,
    stdio: 'inherit',
  });

  if (options.debug) {
    if (result.resolver === 'global') {
      console.error(`run-ctl resolver: global (${result.command[0] || ''})`);
    } else if (result.resolver === 'local') {
      console.error(`run-ctl resolver: local (${result.command[1] || ''})`);
    }
  }

  if (result.error) {
    console.error(`run-ctl error: ${result.error}`);
    for (const line of result.diagnostics || []) {
      console.error(line);
    }
    console.error(`Install guide: ${INSTALL_URL}`);
    process.exit(1);
  }

  process.exit(result.code ?? 1);
}

function isDirectExecution() {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(path.resolve(argv1)).href;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main();
}
