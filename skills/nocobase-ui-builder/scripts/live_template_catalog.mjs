#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeUrlBase, unwrapResponseEnvelope } from './rest_template_clone_runner.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/live_template_catalog.mjs list [--url-base <url>]',
    '  node scripts/live_template_catalog.mjs export (--schema-uid <uid> | --title <title>) --target <page|grid> --out-dir <dir> [--url-base <url>]',
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

function normalizeRequiredText(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

async function requestJson({ method = 'GET', url, token, body }) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawText = await response.text();
  let parsed = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = rawText;
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${method} ${url}`);
    error.status = response.status;
    error.response = parsed;
    throw error;
  }

  return {
    status: response.status,
    raw: parsed,
    data: unwrapResponseEnvelope(parsed),
  };
}

async function fetchAccessibleTree({ apiBase, token }) {
  return requestJson({
    method: 'GET',
    url: `${apiBase}/api/desktopRoutes:listAccessible?tree=true&sort=sort`,
    token,
  });
}

async function fetchAnchorModel({ apiBase, token, parentId, subKey }) {
  const params = new URLSearchParams({
    parentId,
    subKey,
    includeAsyncNode: 'true',
  });
  return requestJson({
    method: 'GET',
    url: `${apiBase}/api/flowModels:findOne?${params.toString()}`,
    token,
  });
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
  return children.find((child) => child?.type === 'tabs' && child?.hidden) || null;
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
    .filter((entry) => entry.type === 'flowPage' && entry.schemaUid)
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
  urlBase = 'http://127.0.0.1:23000',
  token = process.env.NOCOBASE_API_TOKEN,
}) {
  const normalizedTarget = normalizeRequiredText(target, 'target');
  if (normalizedTarget !== 'page' && normalizedTarget !== 'grid') {
    throw new Error('target must be "page" or "grid"');
  }
  const normalizedOutDir = path.resolve(normalizeRequiredText(outDir, 'out dir'));
  const normalizedToken = normalizeRequiredText(token, 'NOCOBASE_API_TOKEN');
  const { apiBase } = normalizeUrlBase(urlBase);

  const routeTreeResult = await fetchAccessibleTree({ apiBase, token: normalizedToken });
  const routeTree = Array.isArray(routeTreeResult.data) ? routeTreeResult.data : [];
  const route = findTemplateRoute(routeTree, {
    schemaUid: normalizeOptionalText(schemaUid),
    title: normalizeOptionalText(title),
  });

  if (!route) {
    throw new Error(`template route not found for ${schemaUid ? `schemaUid=${schemaUid}` : `title=${title}`}`);
  }
  if (normalizedTarget === 'grid' && !route.hiddenTabSchemaUid) {
    throw new Error(`template ${route.schemaUid} does not expose a hidden tab schemaUid`);
  }

  const anchor = await fetchAnchorModel({
    apiBase,
    token: normalizedToken,
    parentId: normalizedTarget === 'page' ? route.schemaUid : route.hiddenTabSchemaUid,
    subKey: normalizedTarget,
  });
  if (!isPlainObject(anchor.data) || typeof anchor.data.use !== 'string') {
    throw new Error(`unable to fetch ${normalizedTarget} anchor model for ${route.schemaUid}`);
  }

  ensureDir(normalizedOutDir);
  const routeFile = path.join(normalizedOutDir, 'route-node.json');
  const templateFile = path.join(normalizedOutDir, normalizedTarget === 'page' ? 'source-page.json' : 'source-grid.json');
  const summaryFile = path.join(normalizedOutDir, 'summary.json');
  writeJson(routeFile, route);
  writeJson(templateFile, anchor.raw);
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
  const token = normalizeRequiredText(process.env.NOCOBASE_API_TOKEN, 'NOCOBASE_API_TOKEN');
  const { apiBase } = normalizeUrlBase(flags['url-base'] || 'http://127.0.0.1:23000');
  const routeTreeResult = await fetchAccessibleTree({ apiBase, token });
  const routeTree = Array.isArray(routeTreeResult.data) ? routeTreeResult.data : [];
  process.stdout.write(`${JSON.stringify({ templates: collectLiveTemplates(routeTree) }, null, 2)}\n`);
}

async function handleExport(flags) {
  const result = await exportLiveTemplate({
    schemaUid: flags['schema-uid'],
    title: flags.title,
    target: flags.target,
    outDir: flags['out-dir'],
    urlBase: flags['url-base'] || 'http://127.0.0.1:23000',
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
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  });
}
