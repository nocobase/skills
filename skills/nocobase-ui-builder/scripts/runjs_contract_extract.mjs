#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_SNAPSHOT_PATH = path.join(__dirname, 'runjs_contract_snapshot.json');

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function resolveSnapshotPath(input) {
  return path.resolve(
    normalizeOptionalText(input)
      || normalizeOptionalText(process.env.NOCOBASE_UI_BUILDER_RUNJS_CONTRACT_SNAPSHOT)
      || DEFAULT_SNAPSHOT_PATH,
  );
}

export function readRunJSContractSnapshot({ snapshotPath } = {}) {
  const resolved = resolveSnapshotPath(snapshotPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`RunJS contract snapshot not found: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function usage() {
  return [
    'Usage:',
    '  node scripts/runjs_contract_extract.mjs print-snapshot [--snapshot-file <path>]',
  ].join('\n');
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    return { command: 'help', flags: {} };
  }
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { command, flags };
}

function main(argv) {
  try {
    const { command, flags } = parseArgs(argv);
    if (command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    if (command !== 'print-snapshot') {
      throw new Error(`Unknown command "${command}"`);
    }
    const snapshot = readRunJSContractSnapshot({
      snapshotPath: flags['snapshot-file'],
    });
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (executedPath === path.resolve(__filename)) {
  main(process.argv.slice(2));
}
