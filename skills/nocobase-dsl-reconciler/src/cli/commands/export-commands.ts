/**
 * Export-family CLI commands: export (single-page), export-project (pull),
 * export-acl, export-workflows, graph.
 *
 * Extracted from cli.ts — behaviour unchanged, only relocation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NocoBaseClient } from '../../client';
import { exportPageSurface, exportAllPopups, exportProject } from '../../export';
import { exportAcl } from '../../acl/acl-exporter';
import { exportWorkflows } from '../../workflow/workflow-exporter';
import { saveYaml } from '../../utils/yaml';
import { slugify } from '../../utils/slugify';
import { resolveWorkspacePath } from '../workspace-paths';
import { ensureProjectGit } from '../git-ops';

export async function cmdExport(args: string[]) {
  const pageTitle = args[0];
  const outDirArg = args[1];
  if (!pageTitle || !outDirArg) { console.error('Usage: cli.ts export <page-title> <outdir>'); process.exit(1); }
  const outDir = resolveWorkspacePath(outDirArg);

  const nb = await NocoBaseClient.create();
  const routes = await nb.routes.list();

  // Find page by title
  let tabUid = '';
  for (const r of routes) {
    if ((r.title || '') === pageTitle && r.type === 'flowPage') {
      for (const r2 of routes) {
        if (r2.parentId === r.id && r2.type === 'tabs') {
          tabUid = r2.schemaUid || '';
          break;
        }
      }
      break;
    }
  }

  if (!tabUid) { console.error(`Page '${pageTitle}' not found`); process.exit(1); }

  fs.mkdirSync(outDir, { recursive: true });
  const jsDir = path.join(outDir, 'js');
  fs.mkdirSync(jsDir, { recursive: true });

  const spec = await exportPageSurface(nb, tabUid, jsDir, slugify(pageTitle));

  // Extract and export popups
  const popupRefs = (spec.popups || []) as { field: string; field_uid: string }[];
  if (popupRefs.length) {
    const popupsDir = path.join(outDir, 'popups');
    await exportAllPopups(nb, popupRefs, jsDir, popupsDir, slugify(pageTitle));
  }

  // Save structure
  delete spec._state;
  delete spec.popups;
  saveYaml(path.join(outDir, 'structure.yaml'), { module: pageTitle, pages: [{ page: pageTitle, ...spec }] });
  console.log(`Exported to ${outDir}`);
}

export async function cmdExportProject(args: string[]) {
  const outDirArg = args[0];
  if (!outDirArg) {
    console.error('Usage: cli.ts pull <outdir> [--group <key-or-title>]\n\n  --group <key>  Scope the pull to one route subtree. Without it, pull dumps\n                 every collection / template / page from NocoBase — fine for a\n                 fresh export, dangerous when you want a small project copy\n                 (templates from unrelated systems will get pulled too).');
    process.exit(1);
  }
  const outDir = resolveWorkspacePath(outDirArg);
  const groupIdx = args.indexOf('--group');
  const group = groupIdx >= 0 ? args[groupIdx + 1] : undefined;
  const nb = await NocoBaseClient.create();
  await exportProject(nb, { outDir, group });
  await ensureProjectGit(outDir, console.log);
}

export async function cmdExportAcl(args: string[]) {
  const outDirArg = args[0];
  if (!outDirArg) { console.error('Usage: cli.ts export-acl <outdir> [--roles role1,role2]'); process.exit(1); }
  const outDir = resolveWorkspacePath(outDirArg);
  const rolesIdx = args.indexOf('--roles');
  const roles = rolesIdx >= 0 && args[rolesIdx + 1] ? args[rolesIdx + 1].split(',').map(s => s.trim()) : undefined;
  const nb = await NocoBaseClient.create();
  await exportAcl(nb, { outDir, roles });
}

export async function cmdExportWorkflows(args: string[]) {
  const outDirArg = args[0];
  if (!outDirArg) { console.error('Usage: cli.ts export-workflows <outdir> [--enabled] [--type X] [--title-pattern X]'); process.exit(1); }
  const outDir = resolveWorkspacePath(outDirArg);
  const nb = await NocoBaseClient.create();
  const filter: Record<string, unknown> = {};
  if (args.includes('--enabled')) filter.enabled = true;
  const typeIdx = args.indexOf('--type');
  if (typeIdx >= 0) filter.type = args[typeIdx + 1];
  const patternIdx = args.indexOf('--title-pattern');
  if (patternIdx >= 0) filter.titlePattern = args[patternIdx + 1];
  await exportWorkflows(nb, { outDir, filter: filter as Parameters<typeof exportWorkflows>[1]['filter'] });
}

export async function cmdGraph(args: string[]) {
  const dirArg = args[0];
  if (!dirArg) { console.error('Usage: cli.ts graph <project-dir>'); process.exit(1); }
  const dir = resolveWorkspacePath(dirArg);

  const { buildGraph } = await import('../../graph/graph-builder');

  const graph = buildGraph(dir);
  const stats = graph.stats();
  console.log('Graph:', stats);

  // Generate _refs.yaml for each page
  const nodes = (graph as unknown as { nodes: Map<string, Record<string, unknown>> }).nodes;
  let refsCount = 0;
  for (const [id, n] of nodes) {
    if (n.type !== 'page') continue;
    const refs = graph.pageRefs(id);
    const pageDir = path.join(dir, (n.meta as Record<string, unknown> | undefined)?.dir as string || `pages/${n.name as string}`);
    if (fs.existsSync(pageDir)) {
      saveYaml(path.join(pageDir, '_refs.yaml'), {
        _generated: true,
        _readonly: 'This file is auto-generated. Edits will be overwritten.',
        ...refs,
      });
      refsCount++;
    }
  }
  console.log(`Generated ${refsCount} _refs.yaml files`);

  // Save full graph
  saveYaml(path.join(dir, '_graph.yaml'), {
    stats,
    ...graph.toJSON(),
  });
  console.log(`Saved _graph.yaml`);
}
