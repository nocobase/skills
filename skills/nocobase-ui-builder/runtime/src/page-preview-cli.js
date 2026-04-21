import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCliArgs } from './cli-args.js';
import { prepareApplyBlueprintRequest, renderPageBlueprintAsciiPreview } from './page-blueprint-preview.js';

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
      'Render one page blueprint ASCII preview or prepare one applyBlueprint write. Required: --stdin-json or --input <path>. Optional: --prepare-write --expected-outer-tabs <n> --max-popup-depth <n>.',
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

function parseOptionalInteger(value, label) {
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label} "${value}".`);
  return parsed;
}

export async function runPagePreviewCli(argv, io = {}) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const stdin = io.stdin || process.stdin;

  try {
    const args = parseCliArgs(argv, {
      valueFlags: ['input', 'expected-outer-tabs', 'max-popup-depth'],
      booleanFlags: ['help', 'stdin-json', 'prepare-write'],
    });
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

    const maxPopupDepth = parseOptionalNumber(args['max-popup-depth'], '--max-popup-depth');
    const expectedOuterTabs = parseOptionalInteger(args['expected-outer-tabs'], '--expected-outer-tabs');
    const result = args['prepare-write']
      ? prepareApplyBlueprintRequest(payload, {
          maxPopupDepth,
          expectedOuterTabs,
        })
      : renderPageBlueprintAsciiPreview(payload, {
          maxPopupDepth,
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
