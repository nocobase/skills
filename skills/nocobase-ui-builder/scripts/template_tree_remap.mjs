#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stableOpaqueId } from './opaque_uid.mjs';

const DEFAULT_LOGICAL_PATH_PREFIX = 'template';

function usage() {
  return [
    'Usage:',
    '  node scripts/template_tree_remap.mjs remap-tree (--payload-json <json> | --payload-file <path>) --page-schema-uid <schemaUid> [--root-uid <uid>] [--root-parent-id <id>] [--logical-path-prefix <prefix>]',
  ].join('\n');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeNonEmpty(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function parseJson(rawValue, label) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function readJsonInput(jsonValue, filePath, label) {
  if (jsonValue) {
    return parseJson(jsonValue, label);
  }
  if (filePath) {
    return parseJson(fs.readFileSync(path.resolve(filePath), 'utf8'), `${label} file`);
  }
  throw new Error(`${label} input is required`);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === 'help') {
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

function cloneJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function joinPath(basePath, segment) {
  if (segment === '') {
    return basePath;
  }
  if (typeof segment === 'number') {
    return `${basePath}[${segment}]`;
  }
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
    return `${basePath}.${segment}`;
  }
  return `${basePath}[${JSON.stringify(segment)}]`;
}

function isFlowModelNode(value) {
  return isPlainObject(value) && (
    typeof value.use === 'string'
    || typeof value.uid === 'string'
    || isPlainObject(value.subModels)
  );
}

function visitFlowModelTree(node, visitor, logicalPath = 'root') {
  if (!isFlowModelNode(node)) {
    return;
  }

  visitor(node, logicalPath);

  const subModels = isPlainObject(node.subModels) ? node.subModels : null;
  if (!subModels) {
    return;
  }

  for (const [subKey, child] of Object.entries(subModels)) {
    const nextLogicalPath = `${logicalPath}/subModels.${subKey}`;
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        if (isFlowModelNode(item)) {
          visitFlowModelTree(item, visitor, `${nextLogicalPath}[${index}]`);
        }
      });
      continue;
    }
    if (isFlowModelNode(child)) {
      visitFlowModelTree(child, visitor, nextLogicalPath);
    }
  }
}

function shouldRewriteUidReferenceKey(key) {
  if (
    key === 'uid'
    || key === 'parentId'
    || key === 'defaultTargetUid'
    || key === 'filterId'
    || key === 'targetId'
  ) {
    return true;
  }
  return /Uid$/.test(key) && key !== 'schemaUid' && key !== 'defaultTabSchemaUid';
}

function buildStableNodeUid({ pageSchemaUid, logicalPath, use }) {
  const normalizedUse = typeof use === 'string' && use.trim() ? use.trim() : 'UnknownUse';
  return stableOpaqueId(
    'node',
    `${pageSchemaUid}|template-remap|${logicalPath}|${normalizedUse}`,
  );
}

export function remapTemplateTree({
  payload,
  pageSchemaUid,
  rootUid,
  rootParentId,
  logicalPathPrefix = DEFAULT_LOGICAL_PATH_PREFIX,
}) {
  const normalizedPageSchemaUid = normalizeNonEmpty(pageSchemaUid, 'pageSchemaUid');
  const normalizedLogicalPathPrefix = normalizeNonEmpty(logicalPathPrefix, 'logicalPathPrefix');
  const normalizedRootUid = rootUid == null ? '' : normalizeNonEmpty(rootUid, 'rootUid');
  const normalizedRootParentId = rootParentId == null ? '' : normalizeNonEmpty(rootParentId, 'rootParentId');
  const workingPayload = cloneJsonValue(payload);

  if (!isFlowModelNode(workingPayload)) {
    throw new Error('payload root must be a flow model node');
  }

  const nodePathByRef = new WeakMap();
  const uidMappings = new Map();
  const rewrittenReferences = [];

  visitFlowModelTree(workingPayload, (node, logicalPath) => {
    const scopedPath = `${normalizedLogicalPathPrefix}/${logicalPath}`;
    nodePathByRef.set(node, scopedPath);
    const previousUid = typeof node.uid === 'string' && node.uid.trim() ? node.uid.trim() : '';
    const nextUid = scopedPath === `${normalizedLogicalPathPrefix}/root` && normalizedRootUid
      ? normalizedRootUid
      : buildStableNodeUid({
        pageSchemaUid: normalizedPageSchemaUid,
        logicalPath: scopedPath,
        use: node.use,
      });

    if (previousUid) {
      uidMappings.set(previousUid, nextUid);
    }
    if (previousUid !== nextUid) {
      rewrittenReferences.push({
        path: `${scopedPath}.uid`,
        key: 'uid',
        from: previousUid || null,
        to: nextUid,
      });
    }
    node.uid = nextUid;
  });

  function rewriteReferences(value, jsonPath = '$', activeNodePath = null) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => rewriteReferences(item, joinPath(jsonPath, index), activeNodePath));
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }

    const nodePath = nodePathByRef.get(value) || activeNodePath;
    for (const [key, child] of Object.entries(value)) {
      const propertyPath = joinPath(jsonPath, key);
      if (typeof child === 'string' && shouldRewriteUidReferenceKey(key)) {
        let replacement = child;
        if (key === 'parentId' && nodePath === `${normalizedLogicalPathPrefix}/root` && normalizedRootParentId) {
          replacement = normalizedRootParentId;
        } else if (uidMappings.has(child)) {
          replacement = uidMappings.get(child);
        }

        if (replacement !== child) {
          value[key] = replacement;
          const rewritePath = nodePath ? `${nodePath}.${key}` : propertyPath;
          const duplicate = rewrittenReferences.some(
            (entry) => entry.path === rewritePath && entry.key === key && entry.from === child && entry.to === replacement,
          );
          if (!duplicate) {
            rewrittenReferences.push({
              path: rewritePath,
              key,
              from: child,
              to: replacement,
            });
          }
        }
      }
      rewriteReferences(child, propertyPath, nodePath);
    }
  }

  rewriteReferences(workingPayload);

  return {
    pageSchemaUid: normalizedPageSchemaUid,
    rootUid: workingPayload.uid,
    rootParentId: normalizedRootParentId || null,
    payload: workingPayload,
    uidMappings: Object.fromEntries([...uidMappings.entries()].sort(([left], [right]) => left.localeCompare(right))),
    rewrittenReferences,
  };
}

function handleRemapTree(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const result = remapTemplateTree({
    payload,
    pageSchemaUid: flags['page-schema-uid'],
    rootUid: flags['root-uid'],
    rootParentId: flags['root-parent-id'],
    logicalPathPrefix: flags['logical-path-prefix'] || DEFAULT_LOGICAL_PATH_PREFIX,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function main(argv) {
  try {
    const { command, flags } = parseArgs(argv);
    if (command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    if (command === 'remap-tree') {
      handleRemapTree(flags);
      return;
    }
    throw new Error(`Unknown command "${command}"`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = path.resolve(fileURLToPath(import.meta.url));
if (executedPath === currentPath) {
  main(process.argv.slice(2));
}
