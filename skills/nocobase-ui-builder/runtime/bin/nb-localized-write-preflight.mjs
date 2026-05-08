#!/usr/bin/env node

import { parseCliArgs } from '../src/cli-args.js';

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function usage() {
  return {
    command:
      'Deprecated compatibility shim. Call `nb api flow-surfaces <action>` directly with the raw business payload; backend authoring now owns validation/defaulting.',
  };
}

export async function runLocalizedWritePreflightCli(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;

  try {
    const args = parseCliArgs(argv, {
      booleanFlags: ['help'],
    });
    if (args.help) {
      writeJson(stdout, { ok: true, usage: usage() });
      return 0;
    }

    writeJson(stderr, {
      ok: false,
      error:
        'nb-localized-write-preflight is retired. Call `nb api flow-surfaces <action>` directly with the raw business payload.',
      usage: usage(),
    });
    return 2;
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
