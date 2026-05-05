#!/usr/bin/env node

import { runFlowSurfacesWrapperCli } from '../src/flow-surfaces-wrapper-cli.js';

const exitCode = await runFlowSurfacesWrapperCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exit(exitCode);
