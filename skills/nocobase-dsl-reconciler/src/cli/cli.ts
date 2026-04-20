#!/usr/bin/env node
/**
 * NocoBase DSL Reconciler CLI — entry point & command dispatcher.
 *
 * Each command is implemented in src/cli/commands/ grouped by intent:
 *   - deploy-commands.ts   push, deploy, deploy-acl, deploy-workflows,
 *                          rollback, clean
 *   - export-commands.ts   pull, export, export-acl, export-workflows, graph
 *   - verify-commands.ts   verify-sql, verify-data, validate-workflows
 *   - project-commands.ts  sync, diff, duplicate-project
 *
 * Shared infra: workspace-paths.ts (WORKSPACE_ROOT + path resolution),
 * git-ops.ts (per-project git repo management).
 */
import {
  cmdDeploy, cmdDeployProject, cmdDeployAcl, cmdDeployWorkflows,
  cmdRollback, cmdClean,
} from './commands/deploy-commands';
import {
  cmdExport, cmdExportProject, cmdExportAcl, cmdExportWorkflows, cmdGraph,
} from './commands/export-commands';
import {
  cmdVerifySql, cmdVerifyData, cmdValidateWorkflows,
} from './commands/verify-commands';
import {
  cmdSync, cmdCompare, cmdDuplicateProject,
} from './commands/project-commands';

const COMMANDS_HELP = 'Commands: push, pull, diff, duplicate-project, deploy, deploy-project, rollback, clean, verify-sql, verify-data, export, export-project, sync, graph, export-acl, deploy-acl, export-workflows, deploy-workflows, validate-workflows, compare';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage: cli.ts <command> [options]');
    console.log(COMMANDS_HELP);
    process.exit(1);
  }

  const rest = args.slice(1);

  switch (command) {
    // Deploy family
    case 'deploy':             await cmdDeploy(rest); break;
    case 'deploy-project':
    case 'push':               await cmdDeployProject(rest); break;
    case 'rollback':           await cmdRollback(rest); break;
    case 'clean':              await cmdClean(rest); break;
    case 'deploy-acl':         await cmdDeployAcl(rest); break;
    case 'deploy-workflows':   await cmdDeployWorkflows(rest); break;

    // Export family
    case 'export':             await cmdExport(rest); break;
    case 'export-project':
    case 'pull':               await cmdExportProject(rest); break;
    case 'export-acl':         await cmdExportAcl(rest); break;
    case 'export-workflows':   await cmdExportWorkflows(rest); break;
    case 'graph':              await cmdGraph(rest); break;

    // Verify family
    case 'verify-sql':         await cmdVerifySql(rest); break;
    case 'verify-data':        await cmdVerifyData(rest); break;
    case 'validate-workflows': cmdValidateWorkflows(rest); break;

    // Project-level
    case 'sync':               await cmdSync(rest); break;
    case 'compare':
    case 'diff':               await cmdCompare(rest); break;
    case 'duplicate-project':  await cmdDuplicateProject(rest); break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(COMMANDS_HELP);
      process.exit(1);
  }
}

// Last-resort safety net. Unhandled rejections (e.g. deep inside a filler
// that didn't wrap an await) used to kill the whole push silently —
// bun/node default is to exit with no message. Log + exit 1 so operators
// see the cause. Does NOT mask bugs: per-page / per-collection try/catch
// still catches everything they can; this only triggers when they miss.
process.on('unhandledRejection', (reason) => {
  console.error('\n  ✗ unhandled rejection:', reason instanceof Error ? (reason.stack || reason.message) : reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('\n  ✗ uncaught exception:', err.stack || err.message);
  process.exit(1);
});

main().catch(e => { console.error(e.message || e); process.exit(1); });
