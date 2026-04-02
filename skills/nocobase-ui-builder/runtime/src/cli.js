import fs from 'node:fs/promises';
import path from 'node:path';
import {
  inspectRunJSContext,
  listProfiles,
  previewRunJSSnippet,
  runBatch,
  validateRunJSSnippet,
} from './index.js';

function parseArgs(argv) {
  const args = {
    _: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

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
      models: 'List supported RunJS models.',
      contexts: 'Print the context contract for one model. Required: --model <model>.',
      validate:
        'Validate one trusted snippet with the compat validator. Required: (--model <model> --code-file <path>) or (--stdin-json). Optional: --context-file <path> --network-file <path>.',
      preview:
        'Validate and preview one trusted snippet with the compat runtime. Required: (--model <model> --code-file <path>) or (--stdin-json). Optional: --context-file <path> --network-file <path>.',
      batch: 'Run multiple validate/preview tasks from one JSON file. Required: --input <path>.',
    },
  };
}

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function loadSnippetTask(command, args, io, cwd) {
  const stdin = io.stdin || process.stdin;
  const cliTimeoutMs = parseOptionalNumber(args.timeout, '--timeout');
  const cliIsolate = parseOptionalBoolean(args.isolate, '--isolate');

  if (args['stdin-json']) {
    const payload = await loadStdinJson(stdin);
    if (payload.mode && payload.mode !== command) {
      throw new Error(`Stdin payload mode "${payload.mode}" does not match command "${command}".`);
    }
    if (args.model && payload.model && args.model !== payload.model) {
      throw new Error(`CLI --model "${args.model}" does not match stdin payload model "${payload.model}".`);
    }
    const model = args.model || payload.model;
    if (!model) throw new Error('Missing required model in stdin payload.');
    if (typeof payload.code !== 'string') {
      throw new Error('Missing required code string in stdin payload.');
    }
    return {
      model,
      code: payload.code,
      context: payload.context,
      network: payload.network,
      version: args.version || payload.version,
      timeoutMs: typeof cliTimeoutMs === 'number' ? cliTimeoutMs : parseOptionalNumber(payload.timeoutMs, 'stdin timeoutMs'),
      filename: payload.filename || '<stdin>',
      isolate: typeof cliIsolate === 'boolean' ? cliIsolate : parseOptionalBoolean(payload.isolate, 'stdin isolate') ?? true,
    };
  }

  if (!args.model) throw new Error('Missing required --model.');
  if (!args['code-file']) throw new Error('Missing required --code-file.');
  return {
    model: args.model,
    code: await loadTextFile(cwd, args['code-file']),
    context: args['context-file'] ? await loadJsonFile(cwd, args['context-file']) : undefined,
    network: args['network-file'] ? await loadJsonFile(cwd, args['network-file']) : undefined,
    version: args.version,
    timeoutMs: cliTimeoutMs,
    filename: args['code-file'],
    isolate: typeof cliIsolate === 'boolean' ? cliIsolate : true,
  };
}

export async function runCli(argv, io = {}) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const args = parseArgs(argv);
  const command = args._[0];

  try {
    switch (command) {
      case 'models': {
        writeJson(stdout, {
          ok: true,
          models: listProfiles(),
        });
        return 0;
      }
      case 'contexts': {
        if (!args.model) throw new Error('Missing required --model.');
        writeJson(stdout, {
          ok: true,
          ...(await inspectRunJSContext({ model: args.model })),
        });
        return 0;
      }
      case 'validate':
      case 'preview': {
        const task = await loadSnippetTask(command, args, io, cwd);
        const runner = command === 'preview' ? previewRunJSSnippet : validateRunJSSnippet;
        const result = await runner(task);
        writeJson(stdout, result);
        return result.ok ? 0 : 1;
      }
      case 'batch': {
        if (!args.input) throw new Error('Missing required --input.');
        const inputPath = path.resolve(cwd, args.input);
        const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
        const result = await runBatch({
          tasks: input.tasks || [],
          cwd: path.dirname(inputPath),
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
