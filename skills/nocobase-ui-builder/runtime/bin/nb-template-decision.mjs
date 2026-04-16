#!/usr/bin/env node

import { runTemplateSelectionCli } from '../src/template-selection-cli.js';

const exitCode = await runTemplateSelectionCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exit(exitCode);
