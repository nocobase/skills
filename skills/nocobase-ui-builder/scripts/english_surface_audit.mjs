#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HAN_RE = /[\p{Script=Han}]/u;

const TARGETS = [
  'SKILL.md',
  'agents/openai.yaml',
  'references',
  'scripts/preflight_write_gate.mjs',
  'scripts/flow_write_wrapper.mjs',
  'scripts/runjs_guard.mjs',
  'scripts/ui_write_wrapper.mjs',
  'scripts/flow_schema_graph.mjs',
  'scripts/rest_template_clone_runner.mjs',
  'scripts/template_clone_helpers.mjs',
  'scripts/tool_review_report.mjs',
  'scripts/spec_contracts.mjs',
  'scripts/flow_payload_guard.mjs',
  'scripts/validation_browser_smoke.mjs',
];

const ALLOWLIST = new Map([
  ['scripts/flow_payload_guard.mjs', [
    /titlePattern:\s*\/\(\\u7f16\\u8f91\\u8ba2\\u5355\\u9879\|\\u7f16\\u8f91\|edit\)\/i/,
    /titlePattern:\s*\/\(\\u67e5\\u770b\|\\u8be6\\u60c5\|view\)\/i/,
    /titlePattern:\s*\/\(\\u65b0\\u5efa\|\\u521b\\u5efa\|\\u6dfb\\u52a0\|\\u767b\\u8bb0\|create\|add\)\/i/,
    /titlePattern:\s*\/\(\\u65b0\\u589e\\u4e0b\\u7ea7\|\\u4e0b\\u7ea7\|addchild\|add child\|child\)\/i/,
  ]],
  ['scripts/validation_browser_smoke.mjs', [
    /const closePatterns = \[\/close\/i, \/\\u5173\\u95ed\/, \/ok\/i, \/\\u786e\\u5b9a\/, \/\\u77e5\\u9053\\u4e86\/, \/got it\/i\];/,
  ]],
]);

function walkFiles(entryPath) {
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) {
    return [entryPath];
  }
  const entries = fs.readdirSync(entryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    files.push(...walkFiles(path.join(entryPath, entry.name)));
  }
  return files;
}

function isAllowed(relPath, line) {
  const rules = ALLOWLIST.get(relPath) || [];
  return rules.some((rule) => rule.test(line));
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..');

const violations = [];
for (const target of TARGETS) {
  const absTarget = path.join(skillRoot, target);
  if (!fs.existsSync(absTarget)) {
    continue;
  }
  const files = walkFiles(absTarget).filter((filePath) => !filePath.endsWith('.test.mjs'));
  for (const filePath of files) {
    const relPath = path.relative(skillRoot, filePath).replaceAll(path.sep, '/');
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!HAN_RE.test(line)) {
        return;
      }
      if (isAllowed(relPath, line)) {
        return;
      }
      violations.push({
        file: relPath,
        line: index + 1,
        text: line.trim(),
      });
    });
  }
}

if (violations.length > 0) {
  process.stderr.write('English surface audit failed.\n');
  violations.forEach((item) => {
    process.stderr.write(`${item.file}:${item.line}: ${item.text}\n`);
  });
  process.exitCode = 1;
} else {
  process.stdout.write('English surface audit passed.\n');
}
