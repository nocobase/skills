#!/usr/bin/env node

import path from 'node:path';

import {
  ensureDir,
  loadArtifactInput,
  normalizeOptionalText,
  normalizeRequiredText,
  writeJson,
} from './mcp_artifact_support.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/live_template_catalog.mjs list (--route-tree-json <json> | --route-tree-file <path>)',
    '  node scripts/live_template_catalog.mjs export (--schema-uid <uid> | --title <title>) --target <page|grid> --out-dir <dir> (--route-tree-json <json> | --route-tree-file <path>) [--page-anchor-json <json> | --page-anchor-file <path>] [--grid-anchor-json <json> | --grid-anchor-file <path>]',
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

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function flattenRouteTree(nodes, parent = null, output = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!isPlainObject(node)) {
      continue;
    }
    output.push({ node, parent });
    flattenRouteTree(node.children, node, output);
  }
  return output;
}

function pickHiddenTabNode(pageNode) {
  const children = Array.isArray(pageNode?.children) ? pageNode.children : [];
  return children.find((child) => child?.schemaUid && child?.hidden) || null;
}

function normalizeTemplateEntry(node) {
  const hiddenTabNode = pickHiddenTabNode(node);
  return {
    title: normalizeOptionalText(node?.title),
    schemaUid: normalizeOptionalText(node?.schemaUid),
    routeName: normalizeOptionalText(node?.name),
    type: normalizeOptionalText(node?.type),
    hiddenTabSchemaUid: normalizeOptionalText(hiddenTabNode?.schemaUid),
    childCount: Array.isArray(node?.children) ? node.children.length : 0,
  };
}

export function collectLiveTemplates(routeTree) {
  const flatNodes = flattenRouteTree(routeTree);
  return flatNodes
    .map(({ node }) => normalizeTemplateEntry(node))
    .filter((entry) => entry.schemaUid)
    .sort((left, right) => left.title.localeCompare(right.title) || left.schemaUid.localeCompare(right.schemaUid));
}

function findTemplateRoute(routeTree, { schemaUid, title }) {
  const candidates = collectLiveTemplates(routeTree);
  if (schemaUid) {
    return candidates.find((item) => item.schemaUid === schemaUid) || null;
  }
  if (title) {
    return candidates.find((item) => item.title === title) || null;
  }
  return null;
}

export async function exportLiveTemplate({
  schemaUid,
  title,
  target,
  outDir,
  routeTree,
  pageAnchor = null,
  gridAnchor = null,
}) {
  const normalizedTarget = normalizeRequiredText(target, 'target');
  if (normalizedTarget !== 'page' && normalizedTarget !== 'grid') {
    throw new Error('target must be "page" or "grid"');
  }

  const normalizedOutDir = path.resolve(normalizeRequiredText(outDir, 'out dir'));
  const route = findTemplateRoute(routeTree, {
    schemaUid: normalizeOptionalText(schemaUid),
    title: normalizeOptionalText(title),
  });
  if (!route) {
    throw new Error(`template route not found for ${schemaUid ? `schemaUid=${schemaUid}` : `title=${title}`}`);
  }

  const anchorArtifact = normalizedTarget === 'page' ? pageAnchor : gridAnchor;
  if (!anchorArtifact) {
    throw new Error(`${normalizedTarget} anchor artifact is required`);
  }

  ensureDir(normalizedOutDir);
  const routeFile = path.join(normalizedOutDir, 'route-node.json');
  const templateFile = path.join(normalizedOutDir, normalizedTarget === 'page' ? 'source-page.json' : 'source-grid.json');
  const summaryFile = path.join(normalizedOutDir, 'summary.json');
  writeJson(routeFile, route);
  writeJson(templateFile, anchorArtifact.raw ?? anchorArtifact);
  writeJson(summaryFile, {
    exportedAt: new Date().toISOString(),
    target: normalizedTarget,
    schemaUid: route.schemaUid,
    title: route.title,
    hiddenTabSchemaUid: route.hiddenTabSchemaUid,
    routeFile,
    templateFile,
  });

  return {
    schemaUid: route.schemaUid,
    title: route.title,
    hiddenTabSchemaUid: route.hiddenTabSchemaUid,
    target: normalizedTarget,
    routeFile,
    templateFile,
    summaryFile,
  };
}

async function handleList(flags) {
  const routeTreeArtifact = loadArtifactInput({
    jsonValue: flags['route-tree-json'],
    fileValue: flags['route-tree-file'],
    label: 'route tree',
    required: true,
  });
  const routeTree = Array.isArray(routeTreeArtifact.data) ? routeTreeArtifact.data : [];
  process.stdout.write(`${JSON.stringify({ templates: collectLiveTemplates(routeTree) }, null, 2)}\n`);
}

async function handleExport(flags) {
  const routeTreeArtifact = loadArtifactInput({
    jsonValue: flags['route-tree-json'],
    fileValue: flags['route-tree-file'],
    label: 'route tree',
    required: true,
  });
  const pageAnchorArtifact = loadArtifactInput({
    jsonValue: flags['page-anchor-json'],
    fileValue: flags['page-anchor-file'],
    label: 'page anchor',
    required: false,
  });
  const gridAnchorArtifact = loadArtifactInput({
    jsonValue: flags['grid-anchor-json'],
    fileValue: flags['grid-anchor-file'],
    label: 'grid anchor',
    required: false,
  });
  const result = await exportLiveTemplate({
    schemaUid: flags['schema-uid'],
    title: flags.title,
    target: flags.target,
    outDir: flags['out-dir'],
    routeTree: Array.isArray(routeTreeArtifact.data) ? routeTreeArtifact.data : [],
    pageAnchor: pageAnchorArtifact,
    gridAnchor: gridAnchorArtifact,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === 'list') {
    await handleList(flags);
    return;
  }
  if (command === 'export') {
    await handleExport(flags);
    return;
  }
  throw new Error(`Unsupported command "${command}"`);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
  : false;
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
