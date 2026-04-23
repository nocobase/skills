import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCliArgs } from './cli-args.js';
import { runBatch, validateRunJSSnippet } from './index.js';

async function loadTextFile(cwd, filePath) {
  return fs.readFile(path.resolve(cwd, filePath), 'utf8');
}

async function loadJsonFile(cwd, filePath) {
  return JSON.parse(await fs.readFile(path.resolve(cwd, filePath), 'utf8'));
}

async function readStreamText(stream) {
  let output = '';
  for await (const chunk of stream) {
    output += chunk.toString('utf8');
  }
  return output;
}

async function loadStdinJson(stream) {
  if (!stream || stream.isTTY) {
    throw new Error('Missing JSON stdin payload.');
  }
  const raw = await readStreamText(stream);
  if (!raw.trim()) {
    throw new Error('Missing JSON stdin payload.');
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON stdin payload: ${error.message}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('JSON stdin payload must be one object.');
  }
  return payload;
}

function parseOptionalNumber(value, label) {
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} "${value}".`);
  }
  return parsed;
}

function parseOptionalBoolean(value, label) {
  if (typeof value === 'undefined') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error(`Invalid ${label} "${value}".`);
}

function usage() {
  return {
    commands: {
      validate:
        'Validate one trusted snippet. Required: ((--model <model> | --surface <surface>) --code-file <path>) or (--stdin-json). Optional: --context-file <path> --network-file <path> --skill-mode --timeout <ms> --version <version>.',
      batch: 'Run multiple validate tasks from one JSON file. Required: --input <path>. Optional: --skill-mode.',
    },
  };
}

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function loadValidateTask(args, io, cwd) {
  const stdin = io.stdin || process.stdin;
  const cliTimeoutMs = parseOptionalNumber(args.timeout, '--timeout');
  const cliSkillMode = parseOptionalBoolean(args['skill-mode'], '--skill-mode');

  if (args['stdin-json']) {
    const payload = await loadStdinJson(stdin);
    if (args.model && payload.model && args.model !== payload.model) {
      throw new Error(`CLI --model "${args.model}" does not match stdin payload model "${payload.model}".`);
    }
    if (args.surface && payload.surface && args.surface !== payload.surface) {
      throw new Error(`CLI --surface "${args.surface}" does not match stdin payload surface "${payload.surface}".`);
    }
    const model = args.model || payload.model;
    const surface = args.surface || payload.surface;
    if (!model && !surface) throw new Error('Missing required model or surface in stdin payload.');
    if (typeof payload.code !== 'string') {
      throw new Error('Missing required code string in stdin payload.');
    }
    return {
      model,
      surface,
      code: payload.code,
      context: payload.context,
      network: payload.network,
      skillMode:
        typeof cliSkillMode === 'boolean'
          ? cliSkillMode
          : parseOptionalBoolean(payload.skillMode, 'stdin skillMode') ?? false,
      version: args.version || payload.version,
      timeoutMs: typeof cliTimeoutMs === 'number' ? cliTimeoutMs : parseOptionalNumber(payload.timeoutMs, 'stdin timeoutMs'),
      filename: payload.filename || '<stdin>',
    };
  }

  if (!args.model && !args.surface) throw new Error('Missing required --model or --surface.');
  if (!args['code-file']) throw new Error('Missing required --code-file.');
  return {
    model: args.model,
    surface: args.surface,
    code: await loadTextFile(cwd, args['code-file']),
    context: args['context-file'] ? await loadJsonFile(cwd, args['context-file']) : undefined,
    network: args['network-file'] ? await loadJsonFile(cwd, args['network-file']) : undefined,
    skillMode: typeof cliSkillMode === 'boolean' ? cliSkillMode : false,
    version: args.version,
    timeoutMs: cliTimeoutMs,
    filename: args['code-file'],
  };
}

export async function runCli(argv, io = {}) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;

  try {
    const args = parseCliArgs(argv, {
      valueFlags: ['model', 'surface', 'code-file', 'context-file', 'network-file', 'timeout', 'version', 'input'],
      booleanFlags: ['help', 'stdin-json'],
      booleanValueFlags: ['skill-mode'],
    });
    const command = args._[0];
    if (args.help || command === 'help' || !command) {
      writeJson(stdout, {
        ok: true,
        usage: usage(),
      });
      return 0;
    }

    switch (command) {
      case 'validate': {
        const task = await loadValidateTask(args, io, cwd);
        const result = await validateRunJSSnippet(task);
        writeJson(stdout, result);
        return result.ok ? 0 : 1;
      }
      case 'batch': {
        if (args.help) {
          writeJson(stdout, {
            ok: true,
            usage: usage(),
          });
          return 0;
        }
        if (!args.input) throw new Error('Missing required --input.');
        const cliSkillMode = parseOptionalBoolean(args['skill-mode'], '--skill-mode');
        const inputPath = path.resolve(cwd, args.input);
        const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
        const result = await runBatch({
          tasks: input.tasks,
          cwd: path.dirname(inputPath),
          defaultSkillMode: typeof cliSkillMode === 'boolean' ? cliSkillMode : false,
        });
        writeJson(stdout, result);
        return result.ok ? 0 : 1;
      }
      default: {
        writeJson(stderr, {
          ok: false,
          error: 'Unknown command.',
          usage: usage(),
        });
        return 2;
      }
    }
  } catch (error) {
    writeJson(stderr, {
      ok: false,
      error: error?.message || String(error),
      usage: usage(),
    });
    return 2;
  }
}
