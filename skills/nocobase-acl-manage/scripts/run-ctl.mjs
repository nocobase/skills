#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const INSTALL_URL = 'https://github.com/nocobase/nocobase-ctl';
const ACL_RESOURCE_WRITE_ACTIONS = new Set(['create', 'update']);
const SCOPE_REQUIRED_ACTIONS = new Set(['view', 'update', 'destroy', 'export', 'importXlsx']);
const FIELD_REQUIRED_ACTIONS = new Set(['create', 'view', 'update', 'export', 'importXlsx']);

function printHelp() {
  const help = [
    'Usage:',
    '  node ./scripts/run-ctl.mjs [--prefer auto|global|local] [--base-dir <dir>] [--debug] -- <ctl args...>',
    '  node ./scripts/run-ctl.mjs <ctl args...>',
    '',
    'Examples:',
    '  node ./scripts/run-ctl.mjs -- env update -e local',
    '  node ./scripts/run-ctl.mjs --prefer local -- env add --name local --base-url http://localhost:13000/api --token xxx -s project',
    '',
    'Env overrides:',
    '  NOCOBASE_CTL_RUN_JS=<absolute-or-relative-path-to-bin/run.js>',
    '  NOCOBASE_CTL_ROOT=<nocobase-ctl-root-directory>',
  ];
  console.log(help.join('\n'));
}

function validateCtlArgs(ctlArgs) {
  const first = ctlArgs[0];
  if (typeof first !== 'string' || first.trim().length === 0) {
    throw new Error('Missing ctl command. Example: node ./scripts/run-ctl.mjs -- env -s project');
  }

  if (first.startsWith('-')) {
    const detail = [
      `Invalid ctl arguments: first passthrough token "${first}" looks like a flag.`,
      'Expected a command first (for example: env | acl | resource), then command flags.',
      'Correct examples:',
      '  node ./scripts/run-ctl.mjs -- env -s project',
      '  node ./scripts/run-ctl.mjs -- resource list --resource users -e local -j',
      '  node ./scripts/run-ctl.mjs -- acl roles list -e local -j',
    ];
    throw new Error(detail.join('\n'));
  }
}

function getOptionValue(ctlArgs, optionName) {
  for (let i = 0; i < ctlArgs.length; i += 1) {
    const arg = ctlArgs[i];
    if (arg === optionName) {
      const value = ctlArgs[i + 1];
      return typeof value === 'string' ? value : '';
    }
    if (arg.startsWith(`${optionName}=`)) {
      return arg.slice(optionName.length + 1);
    }
  }
  return '';
}

function isAclDataSourceResourceWrite(ctlArgs) {
  if (ctlArgs.length < 4) {
    return false;
  }
  return (
    ctlArgs[0] === 'acl' &&
    ctlArgs[1] === 'roles' &&
    ctlArgs[2] === 'data-source-resources' &&
    ACL_RESOURCE_WRITE_ACTIONS.has(ctlArgs[3])
  );
}

function normalizeActionName(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

function toScopeIdNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return Number(value);
  }
  return NaN;
}

function isNonEmptyStringArray(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function validateAclResourceWriteBody(ctlArgs) {
  if (!isAclDataSourceResourceWrite(ctlArgs)) {
    return;
  }

  const bodyText = getOptionValue(ctlArgs, '--body');
  if (!bodyText) {
    throw new Error(
      [
        'ACL resource policy write requires --body JSON.',
        'Expected payload must include usingActionsConfig=true and actions[] with explicit scopeId/fields where required.',
      ].join('\n'),
    );
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (error) {
    throw new Error(`Invalid --body JSON for ACL resource policy write: ${error.message}`);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid ACL resource policy body: --body must be a JSON object.');
  }

  if (body.usingActionsConfig !== true) {
    throw new Error('Invalid ACL resource policy body: `usingActionsConfig` must be `true`.');
  }

  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    throw new Error('Invalid ACL resource policy body: `actions` must be a non-empty array.');
  }

  const issues = [];
  for (let i = 0; i < body.actions.length; i += 1) {
    const action = body.actions[i];
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      issues.push(`actions[${i}] must be an object.`);
      continue;
    }

    const actionName = normalizeActionName(action.name);
    if (!actionName) {
      issues.push(`actions[${i}].name is required.`);
      continue;
    }

    if (SCOPE_REQUIRED_ACTIONS.has(actionName)) {
      const scopeId = toScopeIdNumber(action.scopeId);
      if (!Number.isInteger(scopeId) || scopeId <= 0) {
        issues.push(`actions[${i}] (${actionName}) requires a non-null integer scopeId (>0).`);
      }
    }

    if (FIELD_REQUIRED_ACTIONS.has(actionName) && !isNonEmptyStringArray(action.fields)) {
      issues.push(`actions[${i}] (${actionName}) requires a non-empty string array in fields.`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      [
        'Invalid ACL resource policy body:',
        ...issues.map((item) => `- ${item}`),
        'Example:',
        '{"usingActionsConfig":true,"actions":[{"name":"view","scopeId":1,"fields":["id","createdAt"]},{"name":"update","scopeId":1,"fields":["status"]}]}',
      ].join('\n'),
    );
  }
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
    throw new Error('Missing ctl arguments. Example: node ./scripts/run-ctl.mjs -- env update -e local');
  }

  validateCtlArgs(ctlArgs);
  validateAclResourceWriteBody(ctlArgs);

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
