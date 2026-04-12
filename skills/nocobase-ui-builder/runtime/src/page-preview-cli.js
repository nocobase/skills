import fs from 'node:fs/promises';
import path from 'node:path';
import { renderPageDslAsciiPreview } from './page-dsl-preview.js';

function parseArgs(argv) {
  const args = { _: [] };
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
    command:
      'Render one page DSL ASCII preview. Required: --stdin-json or --input <path>. Optional: --max-popup-depth <n>.',
  };
}

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseOptionalNumber(value, label) {
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} "${value}".`);
  return parsed;
}

export async function runPagePreviewCli(argv, io = {}) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const stdin = io.stdin || process.stdin;
  const args = parseArgs(argv);

  try {
    if (args.help) {
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

    const result = renderPageDslAsciiPreview(payload, {
      maxPopupDepth: parseOptionalNumber(args['max-popup-depth'], '--max-popup-depth'),
    });

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
