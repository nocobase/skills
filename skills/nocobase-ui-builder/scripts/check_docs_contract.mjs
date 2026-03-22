#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, '..');
const referencesRoot = path.join(skillRoot, 'references');

const failures = [];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(dir, predicate = () => true) {
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

function countLines(filePath) {
  return readText(filePath).split(/\r?\n/).length;
}

function toRelative(filePath) {
  return path.relative(skillRoot, filePath).replaceAll(path.sep, '/');
}

function addFailure(message) {
  failures.push(message);
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
    const target = rawTarget.split('#')[0];
    links.push(target);
  }
  return links;
}

function resolveRelativeLink(fromFile, target) {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.normalize(path.resolve(path.dirname(fromFile), target));
}

function checkLineBudgets() {
  const budgetMap = new Map([
    ['SKILL.md', 350],
    ['references/index.md', 150],
  ]);
  const exemptPrefixes = [
    'references/flow-schemas/',
  ];
  const exemptExact = new Set([
    'references/flow-model-recipes.md',
    'references/blocks/public-blocks-inventory.md',
  ]);

  const markdownFiles = [
    path.join(skillRoot, 'SKILL.md'),
    ...listFiles(referencesRoot, (filePath) => filePath.endsWith('.md')),
  ];

  for (const filePath of markdownFiles) {
    const relativePath = toRelative(filePath);
    const lineCount = countLines(filePath);

    let budget = budgetMap.get(relativePath);
    if (!budget) {
      const isExempt =
        exemptExact.has(relativePath) ||
        exemptPrefixes.some((prefix) => relativePath.startsWith(prefix));
      if (isExempt) {
        continue;
      }
      budget = 220;
    }

    if (lineCount > budget) {
      addFailure(`Line budget exceeded: ${relativePath} has ${lineCount} lines (budget ${budget})`);
    }
  }
}

function checkLocalLinksExist() {
  const markdownFiles = [
    path.join(skillRoot, 'SKILL.md'),
    ...listFiles(referencesRoot, (filePath) => filePath.endsWith('.md')),
  ];

  for (const filePath of markdownFiles) {
    for (const target of extractMarkdownLinks(filePath)) {
      const resolved = resolveRelativeLink(filePath, target);
      if (!fs.existsSync(resolved)) {
        addFailure(`Broken relative link: ${toRelative(filePath)} -> ${target}`);
      }
    }
  }
}

function checkReferenceReachability() {
  const rootDocs = [
    path.join(skillRoot, 'SKILL.md'),
    path.join(referencesRoot, 'index.md'),
  ];

  const directlyLinked = new Set();
  for (const filePath of rootDocs) {
    for (const target of extractMarkdownLinks(filePath)) {
      const resolved = resolveRelativeLink(filePath, target);
      if (resolved.endsWith('.md') && resolved.startsWith(referencesRoot)) {
        directlyLinked.add(resolved);
      }
    }
  }

  const referenceDocs = listFiles(referencesRoot, (filePath) => filePath.endsWith('.md'));
  for (const filePath of referenceDocs) {
    if (!directlyLinked.has(filePath)) {
      addFailure(`Reference doc is not one-hop reachable from SKILL.md or references/index.md: ${toRelative(filePath)}`);
    }
  }
}

function checkAllowedToolsPolicy() {
  const skillPath = path.join(skillRoot, 'SKILL.md');
  const text = readText(skillPath);
  const allowedToolsLine = text.split(/\r?\n/).find((line) => line.startsWith('allowed-tools:')) ?? '';
  const mentionsLocalScripts = text.includes('node scripts/');
  if (mentionsLocalScripts && !allowedToolsLine.includes('scripts/*.mjs')) {
    addFailure('SKILL.md mentions local Node scripts but frontmatter allowed-tools does not cover scripts/*.mjs');
  }
}

checkLineBudgets();
checkLocalLinksExist();
checkReferenceReachability();
checkAllowedToolsPolicy();

if (failures.length > 0) {
  console.error('check_docs_contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('check_docs_contract passed');
