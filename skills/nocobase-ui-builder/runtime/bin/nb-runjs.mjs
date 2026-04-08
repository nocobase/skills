#!/usr/bin/env node

import { runCli } from '../src/cli.js';

const exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exit(exitCode);
