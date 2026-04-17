#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_SKILL_ROOT = path.resolve(__dirname, '..');
export const ROOT_INDEX_MIRROR_DIRS = ['blocks', 'patterns', 'js-models'];
export const ROOT_DIRECT_LINK_DIRS = ['recipes'];

function createContext(skillRootInput = DEFAULT_SKILL_ROOT) {
  const skillRoot = path.resolve(skillRootInput);
  return {
    skillRoot,
    skillPath: path.join(skillRoot, 'SKILL.md'),
    agentConfigPath: path.join(skillRoot, 'agents', 'openai.yaml'),
    referencesRoot: path.join(skillRoot, 'references'),
    referencesIndexPath: path.join(skillRoot, 'references', 'index.md'),
  };
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(fullPath, predicate));
      continue;
    }
    if (predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result;
}

function listDirectMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(dir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function countLines(filePath) {
  return readText(filePath).split(/\r?\n/).length;
}

function toRelative(context, filePath) {
  return path.relative(context.skillRoot, filePath).replaceAll(path.sep, '/');
}

function extractMarkdownLinks(filePath) {
  const text = readText(filePath);
  const links = [];
  const regex = /\[[^\]]*]\(([^)]+)\)/g;
  for (const match of text.matchAll(regex)) {
    const rawTarget = match[1].trim();
    if (!rawTarget || rawTarget.startsWith('#')) {
      continue;
    }
    if (/^(https?:|mailto:)/.test(rawTarget)) {
      continue;
    }
    links.push(rawTarget.split('#')[0]);
  }
  return links;
}

function resolveRelativeLink(fromFile, target) {
  if (path.isAbsolute(target)) {
    return path.normalize(target);
  }
  return path.normalize(path.resolve(path.dirname(fromFile), target));
}

function isReferenceDocPath(context, filePath) {
  const normalized = path.normalize(filePath);
  return normalized === context.referencesIndexPath
    || normalized.startsWith(`${context.referencesRoot}${path.sep}`);
}

function collectMarkdownFiles(context) {
  return [
    context.skillPath,
    ...listFiles(context.referencesRoot, (filePath) => filePath.endsWith('.md')),
  ].filter((filePath) => fs.existsSync(filePath));
}

function collectRootLinkedReferenceDocs(context) {
  const rootDocs = [
    context.skillPath,
    context.referencesIndexPath,
  ].filter((filePath) => fs.existsSync(filePath));

  const links = new Set();
  for (const filePath of rootDocs) {
    for (const target of extractMarkdownLinks(filePath)) {
      const resolved = resolveRelativeLink(filePath, target);
      if (resolved.endsWith('.md') && isReferenceDocPath(context, resolved)) {
        links.add(resolved);
      }
    }
  }
  return links;
}

function checkLineBudgets(context, failures) {
  const budgetMap = new Map([
    ['SKILL.md', 220],
    ['references/index.md', 150],
  ]);
  const exemptPrefixes = [
    'references/flow-schemas/',
  ];
  const exemptExact = new Set([
    'references/flow-model-recipes.md',
    'references/blocks/public-blocks-inventory.md',
  ]);

  for (const filePath of collectMarkdownFiles(context)) {
    const relativePath = toRelative(context, filePath);
    const lineCount = countLines(filePath);

    let budget = budgetMap.get(relativePath);
    if (!budget) {
      const isExempt = exemptExact.has(relativePath)
        || exemptPrefixes.some((prefix) => relativePath.startsWith(prefix));
      if (isExempt) {
        continue;
      }
      budget = 220;
    }

    if (lineCount > budget) {
      failures.push(`Line budget exceeded: ${relativePath} has ${lineCount} lines (budget ${budget})`);
    }
  }
}

function checkLocalLinksExist(context, failures) {
  for (const filePath of collectMarkdownFiles(context)) {
    for (const target of extractMarkdownLinks(filePath)) {
      const resolved = resolveRelativeLink(filePath, target);
      if (!fs.existsSync(resolved)) {
        failures.push(`Broken relative link: ${toRelative(context, filePath)} -> ${target}`);
      }
    }
  }
}

function checkTopLevelReferenceReachability(context, failures) {
  const rootLinkedDocs = collectRootLinkedReferenceDocs(context);
  for (const filePath of listDirectMarkdownFiles(context.referencesRoot)) {
    if (!rootLinkedDocs.has(filePath)) {
      failures.push(`Top-level reference doc is not directly linked from SKILL.md or references/index.md: ${toRelative(context, filePath)}`);
    }
  }

  for (const directoryName of ROOT_DIRECT_LINK_DIRS) {
    const targetDir = path.join(context.referencesRoot, directoryName);
    for (const filePath of listFiles(targetDir, (candidate) => candidate.endsWith('.md'))) {
      if (!rootLinkedDocs.has(filePath)) {
        failures.push(`Reference doc is not directly linked from SKILL.md or references/index.md: ${toRelative(context, filePath)}`);
      }
    }
  }
}

function collectSubindexLeafDocs(subindexPath) {
  const directory = path.dirname(subindexPath);
  const leafDocs = new Set(
    listDirectMarkdownFiles(directory).filter((filePath) => path.basename(filePath) !== 'index.md'),
  );
  return [...new Set(
    extractMarkdownLinks(subindexPath)
      .map((target) => resolveRelativeLink(subindexPath, target))
      .filter((resolved) => leafDocs.has(resolved)),
  )].sort((left, right) => left.localeCompare(right));
}

function checkRootIndexMirrorsSubindexes(context, failures) {
  if (!fs.existsSync(context.referencesIndexPath)) {
    return;
  }

  const rootIndexLinks = new Set(
    extractMarkdownLinks(context.referencesIndexPath)
      .map((target) => resolveRelativeLink(context.referencesIndexPath, target))
      .filter((resolved) => resolved.endsWith('.md') && isReferenceDocPath(context, resolved)),
  );

  for (const directoryName of ROOT_INDEX_MIRROR_DIRS) {
    const subindexPath = path.join(context.referencesRoot, directoryName, 'index.md');
    if (!fs.existsSync(subindexPath)) {
      continue;
    }

    for (const leafDocPath of collectSubindexLeafDocs(subindexPath)) {
      if (!rootIndexLinks.has(leafDocPath)) {
        failures.push(
          `${toRelative(context, context.referencesIndexPath)} is missing leaf doc listed by ${toRelative(context, subindexPath)}: ${toRelative(context, leafDocPath)}`,
        );
      }
    }
  }
}

function checkAllowedToolsPolicy(context, failures) {
  if (!fs.existsSync(context.skillPath)) {
    return;
  }
  const text = readText(context.skillPath);
  const allowedToolsLine = text.split(/\r?\n/).find((line) => line.startsWith('allowed-tools:')) ?? '';
  const mentionsLocalScripts = text.includes('node scripts/');
  if (mentionsLocalScripts && !allowedToolsLine.includes('scripts/*.mjs')) {
    failures.push('SKILL.md mentions local Node scripts but frontmatter allowed-tools does not cover scripts/*.mjs');
  }
}

function checkAgentConfig(context, failures) {
  if (!fs.existsSync(context.agentConfigPath)) {
    failures.push(`Missing agent config: ${toRelative(context, context.agentConfigPath)}`);
    return;
  }
  if (!readText(context.agentConfigPath).trim()) {
    failures.push(`Agent config is empty: ${toRelative(context, context.agentConfigPath)}`);
  }
}

export function collectDocsContractFailures({ skillRoot = DEFAULT_SKILL_ROOT } = {}) {
  const context = createContext(skillRoot);
  const failures = [];

  checkLineBudgets(context, failures);
  checkLocalLinksExist(context, failures);
  checkTopLevelReferenceReachability(context, failures);
  checkRootIndexMirrorsSubindexes(context, failures);
  checkAllowedToolsPolicy(context, failures);
  checkAgentConfig(context, failures);

  return failures;
}

export function runCli({ skillRoot = DEFAULT_SKILL_ROOT, stdout = process.stdout, stderr = process.stderr } = {}) {
  const failures = collectDocsContractFailures({ skillRoot });
  if (failures.length > 0) {
    stderr.write('check_docs_contract failed:\n');
    for (const failure of failures) {
      stderr.write(`- ${failure}\n`);
    }
    return {
      ok: false,
      failures,
    };
  }

  stdout.write('check_docs_contract passed\n');
  return {
    ok: true,
    failures: [],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const result = runCli();
  if (!result.ok) {
    process.exit(1);
  }
}
