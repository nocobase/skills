import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTemplateDecision } from '../src/template-decision-summary.js';

test('summarizeTemplateDecision returns reference summary with template identity and reason', () => {
  const result = summarizeTemplateDecision({
    kind: 'selected-reference',
    template: {
      uid: 'employee-popup-template',
      name: 'Employee popup',
    },
    reasonCode: 'standard-reuse',
  });

  assert.deepEqual(result, {
    kind: 'selected-reference',
    mode: 'reference',
    template: {
      uid: 'employee-popup-template',
      name: 'Employee popup',
    },
    reasonCode: 'standard-reuse',
    reason: 'standard reuse',
    summary: 'Template employee-popup-template via reference: standard reuse.',
  });
});

test('summarizeTemplateDecision returns copy summary with template identity and reason', () => {
  const result = summarizeTemplateDecision({
    kind: 'selected-copy',
    template: {
      uid: 'employee-form-template',
    },
    reasonCode: 'local-customization',
  });

  assert.deepEqual(result, {
    kind: 'selected-copy',
    mode: 'copy',
    template: {
      uid: 'employee-form-template',
    },
    reasonCode: 'local-customization',
    reason: 'local customization',
    summary: 'Template employee-form-template via copy: local customization.',
  });
});

test('summarizeTemplateDecision keeps explicit template as discovery-only when planning context is insufficient', () => {
  const result = summarizeTemplateDecision({
    kind: 'discovery-only',
    template: {
      uid: 'employee-popup-template',
    },
    reasonCode: 'missing-live-context',
  });

  assert.deepEqual(result, {
    kind: 'discovery-only',
    template: {
      uid: 'employee-popup-template',
    },
    reasonCode: 'missing-live-context',
    reason: 'the current opener/host/planning context was insufficient',
    summary: 'Template employee-popup-template stayed discovery-only: the current opener/host/planning context was insufficient.',
  });
});

test('summarizeTemplateDecision reports explicit template unavailable in current context', () => {
  const result = summarizeTemplateDecision({
    kind: 'discovery-only',
    template: {
      uid: 'employee-popup-template',
    },
    reasonCode: 'explicit-template-unavailable',
  });

  assert.equal(result.summary, 'Template employee-popup-template stayed discovery-only: the explicit template is unavailable in the current context.');
});

test('summarizeTemplateDecision reports unresolved best-candidate ranking without implying binding', () => {
  const result = summarizeTemplateDecision({
    kind: 'discovery-only',
    discoveredCount: 3,
    reasonCode: 'multiple-discovered-not-bound',
  });

  assert.deepEqual(result, {
    kind: 'discovery-only',
    discoveredCount: 3,
    reasonCode: 'multiple-discovered-not-bound',
    reason: 'multiple templates were discovered but the best candidate was not uniquely resolved',
    summary: '3 template(s) stayed discovery-only: multiple templates were discovered but the best candidate was not uniquely resolved.',
  });
});

test('summarizeTemplateDecision keeps inline/non-template explicit even when a template identity is present', () => {
  const result = summarizeTemplateDecision({
    kind: 'inline-non-template',
    template: {
      uid: 'employee-popup-template',
    },
    reasonCode: 'no-usable-template',
  });

  assert.deepEqual(result, {
    kind: 'inline-non-template',
    template: {
      uid: 'employee-popup-template',
    },
    reasonCode: 'no-usable-template',
    reason: 'no usable template was available',
    summary: 'Template employee-popup-template stayed inline/non-template: no usable template was available.',
  });
});

test('summarizeTemplateDecision rejects selected decisions without template uid', () => {
  assert.throws(
    () =>
      summarizeTemplateDecision({
        kind: 'selected-reference',
        template: {
          name: 'Employee popup',
        },
        reasonCode: 'standard-reuse',
      }),
    /requires template\.uid/i,
  );
});

test('summarizeTemplateDecision rejects unsupported reason codes for each kind', () => {
  assert.throws(
    () =>
      summarizeTemplateDecision({
        kind: 'inline-non-template',
        reasonCode: 'multiple-usable-candidates-without-reuse-intent',
      }),
    /Unsupported reasonCode "multiple-usable-candidates-without-reuse-intent" for "inline-non-template"/,
  );
});
