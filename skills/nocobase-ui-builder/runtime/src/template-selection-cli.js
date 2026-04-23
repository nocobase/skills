import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCliArgs } from './cli-args.js';
import { planTemplateQuery, selectTemplateDecision } from './template-selection.js';

async function readStreamText(stream) {
  let output = '';
  for await (const chunk of stream) {
    output += chunk.toString('utf8');
  }
  return output;
}

async function loadJsonFromStdin(stream) {
  if (!stream || stream.isTTY) throw new Error('Missing JSON stdin payload.');
  const raw = await readStreamText(stream);
  if (!raw.trim()) throw new Error('Missing JSON stdin payload.');
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

async function loadJsonFromFile(cwd, filePath) {
  const resolved = path.resolve(cwd, filePath);
  return JSON.parse(await fs.readFile(resolved, 'utf8'));
}

function usage() {
  return {
    commands: {
      'plan-query':
        'Plan one contextual list-templates query. Required: --stdin-json or --input <path>. Input must be one scene object.',
      select:
        'Select one template decision from contextual candidates. Required: --stdin-json or --input <path>. Input must be { scene, probe, candidates, modePreference?, explicitTemplate? }.',
    },
  };
}

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function runTemplateSelectionCli(argv, io = {}) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const stdin = io.stdin || process.stdin;

  try {
    const args = parseCliArgs(argv, {
      valueFlags: ['input'],
      booleanFlags: ['help', 'stdin-json'],
    });
    const command = args._[0];
    if (args.help || command === 'help' || !command) {
      writeJson(stdout, { ok: true, usage: usage() });
      return 0;
    }

    const payload = args['stdin-json']
      ? await loadJsonFromStdin(stdin)
      : args.input
        ? await loadJsonFromFile(cwd, args.input)
        : (() => {
            throw new Error('Missing required --stdin-json or --input.');
          })();

    let result;
    switch (command) {
      case 'plan-query':
        result = planTemplateQuery(payload);
        break;
      case 'select':
        result = selectTemplateDecision(payload);
        break;
      default:
        writeJson(stderr, {
          ok: false,
          error: 'Unknown command.',
          usage: usage(),
        });
        return 2;
    }

    writeJson(stdout, result);
    return result.ok ? 0 : 1;
  } catch (error) {
    writeJson(stderr, {
      ok: false,
      error: error?.message || String(error),
      usage: usage(),
    });
    return 2;
  }
}
