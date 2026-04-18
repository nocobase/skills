/**
 * Verification / validation CLI commands: verify-sql, verify-data,
 * validate-workflows.
 *
 * Extracted from cli.ts — behaviour unchanged, only relocation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NocoBaseClient } from '../../client';
import { verifySql } from '../../deploy';
import { validateWorkflow, formatValidationResult } from '../../workflow/validator';
import { loadYaml } from '../../utils/yaml';
import type { WorkflowSpec } from '../../workflow/types';
import { resolveWorkspacePath } from '../workspace-paths';

export async function cmdVerifySql(args: string[]) {
  const modDirArg = args[0];
  if (!modDirArg) { console.error('Usage: cli.ts verify-sql <dir>'); process.exit(1); }
  const modDir = resolveWorkspacePath(modDirArg);

  const nb = await NocoBaseClient.create();
  const result = await verifySql(modDir, nb);

  console.log(`── Verify SQL (${result.results.length} queries) ──`);
  console.log(`  Target: ${nb.baseUrl} (PostgreSQL)\n`);
  for (const r of result.results) {
    console.log(r.ok ? `  ✓ ${r.label} (${r.rows} rows)` : `  ✗ ${r.label}\n    Error: ${r.error}`);
  }
  console.log(`\n  Result: ${result.passed} passed, ${result.failed} failed`);
  if (result.failed > 0) process.exit(1);
}

export async function cmdVerifyData(args: string[]) {
  const dirArg = args[0];
  if (!dirArg) { console.log('Usage: verify-data <project-dir>'); process.exit(1); }
  const { verifyData } = await import('../verify-data');
  const result = await verifyData(resolveWorkspacePath(dirArg));
  if (result.failed > 0) process.exit(1);
}

export function cmdValidateWorkflows(args: string[]) {
  const dirArg = args[0];
  if (!dirArg) { console.error('Usage: cli.ts validate-workflows <project-dir>'); process.exit(1); }
  const dir = resolveWorkspacePath(dirArg);

  const wfBaseDir = path.join(dir, 'workflows');
  if (!fs.existsSync(wfBaseDir)) {
    console.error('No workflows/ directory found');
    process.exit(1);
  }

  const entries = fs.readdirSync(wfBaseDir, { withFileTypes: true });
  const wfDirs = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => fs.existsSync(path.join(wfBaseDir, name, 'workflow.yaml')));

  if (!wfDirs.length) {
    console.log('No workflow.yaml files found');
    return;
  }

  console.log(`  Validating ${wfDirs.length} workflow(s)...\n`);
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const slug of wfDirs) {
    const spec = loadYaml<WorkflowSpec>(path.join(wfBaseDir, slug, 'workflow.yaml'));
    const result = validateWorkflow(spec);

    const errors = result.errors.filter(e => e.level === 'error');
    const warnings = result.errors.filter(e => e.level === 'warn');
    totalErrors += errors.length;
    totalWarnings += warnings.length;

    if (result.errors.length) {
      console.log(formatValidationResult(result, spec.title));
    } else {
      console.log(`  ✓ ${spec.title}: passed`);
    }
  }

  console.log(`\n  Result: ${wfDirs.length} workflow(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`);
  if (totalErrors > 0) process.exit(1);
}
