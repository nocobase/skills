#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCliArgs } from '../src/cli-args.js';
import { runLocalizedWritePreflight } from '../src/localized-write-preflight.js';

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
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON stdin payload: ${error.message}`);
  }
}

async function loadJsonFromFile(cwd, filePath) {
  const resolved = path.resolve(cwd, filePath);
  return JSON.parse(await fs.readFile(resolved, 'utf8'));
}

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function usage() {
  return {
    command:
      'Validate one localized flow-surfaces add-block/add-blocks/compose body locally before a later explicit nb write. Required: --operation <add-block|add-blocks|compose> and --stdin-json or --input <path>. Optional: --metadata <path>.',
  };
}

export async function runLocalizedWritePreflightCli(argv, io = {}) {
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const stdin = io.stdin || process.stdin;

  try {
    const args = parseCliArgs(argv, {
      valueFlags: ['input', 'metadata', 'operation'],
      booleanFlags: ['help', 'stdin-json'],
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

    const metadata = args.metadata ? await loadJsonFromFile(cwd, args.metadata) : undefined;
    const result = runLocalizedWritePreflight({
      operation: args.operation,
      body: payload?.body ?? payload,
      collectionMetadata: payload?.collectionMetadata ?? metadata,
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

const exitCode = await runLocalizedWritePreflightCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exit(exitCode);
