#!/usr/bin/env node

import { runPagePreviewCli } from '../src/page-preview-cli.js';

const exitCode = await runPagePreviewCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exit(exitCode);
