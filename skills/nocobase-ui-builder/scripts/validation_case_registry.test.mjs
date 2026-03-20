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

test('validation cases use association-friendly bindings for filter and form scenarios', () => {
  const case1 = VALIDATION_CASE_REGISTRY.find((entry) => entry.id === 'case1');
  const case4 = VALIDATION_CASE_REGISTRY.find((entry) => entry.id === 'case4');
  const case5 = VALIDATION_CASE_REGISTRY.find((entry) => entry.id === 'case5');
  const case6 = VALIDATION_CASE_REGISTRY.find((entry) => entry.id === 'case6');

  assert.deepEqual(case1.buildSpecInput.layout.blocks[0].fields, ['order_no', 'customer.name', 'status', 'created_at']);
  assert.deepEqual(
    case1.buildSpecInput.layout.blocks[1].actions[0].popup.blocks[0].fields,
    ['order_no', 'customer', 'status', 'total_amount'],
  );

  assert.deepEqual(case4.buildSpecInput.layout.blocks[0].fields, ['name', 'status', 'owner.nickname']);
  assert.deepEqual(
    case4.buildSpecInput.layout.blocks[1].fields,
    ['name', 'status', 'owner.nickname', 'start_date', 'end_date'],
  );
  assert.equal(
    case4.buildSpecInput.dataBindings.relations.some(
      (item) => item.sourceCollection === 'projects' && item.targetCollection === 'users' && item.associationName === 'owner',
    ),
    true,
  );

  assert.deepEqual(case5.buildSpecInput.layout.blocks[0].fields, ['title', 'status', 'applicant.nickname', 'department.name']);
  assert.deepEqual(
    case5.buildSpecInput.layout.blocks[1].fields,
    ['title', 'applicant.nickname', 'department.name', 'status', 'submitted_at'],
  );
  assert.equal(
    case5.buildSpecInput.dataBindings.relations.some(
      (item) => item.sourceCollection === 'approval_logs' && item.targetCollection === 'users' && item.associationName === 'operator',
    ),
    true,
  );

  assert.deepEqual(
    case6.buildSpecInput.layout.blocks[0].actions[0].popup.blocks[0].fields,
    ['invoice_no', 'customer', 'order', 'status', 'amount'],
  );
  assert.deepEqual(
    case6.buildSpecInput.layout.blocks[0].rowActions[1].popup.blocks[0].fields,
    ['invoice_no', 'customer.name', 'order.order_no', 'status', 'amount'],
  );
});
