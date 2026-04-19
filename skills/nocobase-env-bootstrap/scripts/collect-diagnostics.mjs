#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const options = {
    outputPath: 'nocobase-diagnostics.txt',
  };

  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true, options };
    }
    if (arg === '--output-path' || arg === '-o') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('Missing value for --output-path');
      }
      options.outputPath = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--output-path=')) {
      options.outputPath = arg.slice('--output-path='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  if (positional.length > 0) {
    options.outputPath = positional[0];
  }

  return { help: false, options };
}

function printHelp() {
  const lines = [
    'Usage:',
    '  node ./scripts/collect-diagnostics.mjs [output_path]',
    '  node ./scripts/collect-diagnostics.mjs --output-path nocobase-diagnostics.txt',
    '',
    'Environment variables:',
    '  INCLUDE_DOCKER_LOGS=true|false (default: false)',
    '  DOCKER_TAIL=<number> (default: 200)',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function hasCommand(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function runFirstLine(command, args = [], cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) {
    return '';
  }
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (!text) {
    return '';
  }
  return text.split(/\r?\n/g)[0] || '';
}

function readEnvLine(envPath, key) {
  if (!fs.existsSync(envPath)) {
    return '';
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/g);
  let match = '';
  for (const line of lines) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      match = line;
    }
  }
  return match;
}

function append(lines, text = '') {
  lines.push(text);
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`collect-diagnostics error: ${error instanceof Error ? error.message : String(error)}\n`);
    printHelp();
    process.exit(2);
    return;
  }

  if (parsed.help) {
    printHelp();
    return;
  }

  const includeDockerLogs = String(process.env.INCLUDE_DOCKER_LOGS || 'false').toLowerCase() === 'true';
  const dockerTailRaw = Number(process.env.DOCKER_TAIL || '200');
  const dockerTail = Number.isInteger(dockerTailRaw) && dockerTailRaw > 0 ? dockerTailRaw : 200;
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const outputPath = path.resolve(cwd, parsed.options.outputPath);

  const lines = [];
  append(lines, `timestamp: ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
  append(lines, `cwd: ${cwd}`);
  append(lines, `os: ${os.type()} ${os.release()} ${os.arch()}`);
  append(lines);
  append(lines, '== command versions ==');

  if (hasCommand('docker')) {
    append(lines, `docker: ${runFirstLine('docker', ['--version'], cwd) || '<unknown>'}`);
  } else {
    append(lines, 'docker: <not found>');
  }
  if (hasCommand('node')) {
    append(lines, `node: ${runFirstLine('node', ['-v'], cwd) || '<unknown>'}`);
  } else {
    append(lines, 'node: <not found>');
  }
  if (hasCommand('yarn')) {
    append(lines, `yarn: ${runFirstLine(process.platform === 'win32' ? 'yarn.cmd' : 'yarn', ['-v'], cwd) || '<unknown>'}`);
  } else {
    append(lines, 'yarn: <not found>');
  }
  if (hasCommand('git')) {
    append(lines, `git: ${runFirstLine('git', ['--version'], cwd) || '<unknown>'}`);
  } else {
    append(lines, 'git: <not found>');
  }

  append(lines);
  append(lines, '== selected env keys ==');
  if (fs.existsSync(envPath)) {
    const keys = ['APP_ENV', 'APP_PORT', 'DB_DIALECT', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'NOCOBASE_RUNNING_IN_DOCKER'];
    for (const key of keys) {
      const line = readEnvLine(envPath, key);
      if (line) {
        append(lines, line);
      }
    }
  } else {
    append(lines, '.env not found');
  }

  if (includeDockerLogs && hasCommand('docker')) {
    append(lines);
    append(lines, '== docker ps ==');
    const ps = spawnSync('docker', ['ps', '--format', '{{.Names}}|{{.Image}}|{{.Status}}'], {
      cwd,
      encoding: 'utf8',
      env: process.env,
    });
    if ((ps.status ?? 1) === 0) {
      const psLines = (ps.stdout || '').split(/\r?\n/g).filter(Boolean);
      if (psLines.length === 0) {
        append(lines, '<no containers>');
      } else {
        for (const line of psLines) {
          append(lines, line);
        }
      }
    } else {
      append(lines, '<docker ps failed>');
    }

    append(lines);
    append(lines, `== docker logs (tail=${dockerTail}) ==`);
    const namesResult = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
      cwd,
      encoding: 'utf8',
      env: process.env,
    });
    const allNames = (namesResult.stdout || '').split(/\r?\n/g).filter(Boolean);
    const containerNames = allNames.filter((name) => /nocobase|app/i.test(name)).slice(0, 3);

    if (containerNames.length === 0) {
      append(lines, '<no matching containers>');
    } else {
      for (const name of containerNames) {
        append(lines);
        append(lines, `-- ${name} --`);
        const logsResult = spawnSync('docker', ['logs', '--tail', String(dockerTail), '--timestamps', name], {
          cwd,
          encoding: 'utf8',
          env: process.env,
        });
        if ((logsResult.status ?? 1) === 0) {
          const logLines = `${logsResult.stdout || ''}${logsResult.stderr || ''}`.split(/\r?\n/g);
          for (const line of logLines) {
            if (line) {
              append(lines, line);
            }
          }
        } else {
          append(lines, `<docker logs failed for ${name}>`);
        }
      }
    }
  }

  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`Diagnostics written to: ${outputPath}\n`);
}

main();
