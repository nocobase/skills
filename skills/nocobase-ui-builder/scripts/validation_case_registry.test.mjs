import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCK_COVERAGE_MATRIX,
  PATTERN_COVERAGE_MATRIX,
  PUBLIC_BLOCK_USES,
  VALIDATION_CASE_REGISTRY,
  VALIDATION_PATTERN_IDS,
  resolveValidationCase,
  resolveValidationCaseDocPath,
} from './validation_case_registry.mjs';

test('validation case registry resolves by case id, alias and request text', () => {
  const byCaseId = resolveValidationCase({
    caseRequest: '请跑 case9',
    baseSlug: 'case9',
  });
  assert.equal(byCaseId.matched, true);
  assert.equal(byCaseId.caseId, 'case9');

  const byAlias = resolveValidationCase({
    caseRequest: '请帮我跑订单中心页面的 validation',
    baseSlug: '',
  });
  assert.equal(byAlias.matched, true);
  assert.equal(byAlias.caseId, 'case1');

  const unmatched = resolveValidationCase({
    caseRequest: '随便建一个页面',
    baseSlug: 'unknown-demo',
  });
  assert.equal(unmatched.matched, false);
  assert.equal(unmatched.fallbackReason, 'CASE_REGISTRY_UNMATCHED');
});

test('validation case registry doc paths exist', () => {
  for (const entry of VALIDATION_CASE_REGISTRY) {
    assert.equal(fs.existsSync(resolveValidationCaseDocPath(entry)), true, `${entry.id} doc path should exist`);
  }
});

test('coverage matrices cover all public blocks and validation patterns', () => {
  const coveredBlocks = new Set(BLOCK_COVERAGE_MATRIX.map((item) => item.target));
  const coveredPatterns = new Set(PATTERN_COVERAGE_MATRIX.map((item) => item.target));

  assert.deepEqual([...coveredBlocks].sort(), [...PUBLIC_BLOCK_USES].sort());
  assert.deepEqual([...coveredPatterns].sort(), [...VALIDATION_PATTERN_IDS].sort());

  for (const item of BLOCK_COVERAGE_MATRIX) {
    assert.equal(Boolean(VALIDATION_CASE_REGISTRY.find((entry) => entry.id === item.primaryCaseId)), true);
  }
  for (const item of PATTERN_COVERAGE_MATRIX) {
    assert.equal(Boolean(VALIDATION_CASE_REGISTRY.find((entry) => entry.id === item.primaryCaseId)), true);
  }
});
