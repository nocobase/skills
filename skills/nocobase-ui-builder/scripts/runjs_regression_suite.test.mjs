import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { auditPayload, canonicalizePayload } from './flow_payload_guard.mjs';
import { inspectRunJSStaticCode } from './runjs_guard.mjs';

const CASES_PATH = fileURLToPath(new URL('./runjs_regression_cases.json', import.meta.url));
const SNAPSHOT_PATH = fileURLToPath(new URL('./runjs_contract_snapshot.json', import.meta.url));
const CATALOG_PATH = fileURLToPath(new URL('../references/js-snippets/catalog.json', import.meta.url));
const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const catalogById = new Map(catalog.snippets.map((entry) => [entry.id, entry]));

function buildPayloadForCase(runjsCase) {
  const runJs = { code: runjsCase.code, version: 'v1' };
  switch (runjsCase.surface) {
    case 'event-flow.execute-javascript':
      return { flowRegistry: { main: { steps: [{ name: 'runjs', params: runJs }] } } };
    case 'linkage.execute-javascript':
      return { actions: [{ name: 'linkageRunjs', params: { value: { script: runjsCase.code, version: 'v1' } } }] };
    case 'reaction.value-runjs':
      return { value: { source: 'runjs', ...runJs } };
    case 'custom-variable.runjs':
      return { variables: [{ runjs: runJs }] };
    case 'js-model.render':
      return { use: runjsCase.modelOrHost || 'JSBlockModel', stepParams: { jsSettings: { runJs } } };
    case 'js-model.action':
      return {
        ...(runjsCase.modelOrHost ? { use: runjsCase.modelOrHost } : {}),
        clickSettings: { runJs },
      };
    default:
      return null;
  }
}

function collectMainChainCodes({ canonicalized, audit }) {
  return [
    ...(canonicalized.transforms || []).map((item) => item.code),
    ...(canonicalized.unresolved || []).map((item) => item.code),
    ...(audit.blockers || []).map((item) => item.code),
    ...(audit.warnings || []).map((item) => item.code),
  ];
}

for (const runjsCase of cases) {
  test(`RunJS regression: ${runjsCase.id}`, () => {
    const result = inspectRunJSStaticCode({
      code: runjsCase.code,
      surface: runjsCase.surface,
      modelUse: runjsCase.modelOrHost,
      snapshotPath: SNAPSHOT_PATH,
      path: `$cases.${runjsCase.id}`,
    });
    const codes = [
      ...(result.blockers || []).map((item) => item.code),
      ...(result.warnings || []).map((item) => item.code),
    ];

    assert.equal(result.ok, runjsCase.expectedOk);
    for (const expectedCode of runjsCase.expectedCodes) {
      assert.equal(codes.includes(expectedCode), true, `${runjsCase.id} should include ${expectedCode}; got ${codes.join(', ')}`);
    }
  });

  test(`RunJS regression main chain: ${runjsCase.id}`, () => {
    for (const snippetId of runjsCase.preferredSnippetIds || []) {
      const entry = catalogById.get(snippetId);
      assert.ok(entry, `${runjsCase.id} preferred snippet ${snippetId} must exist`);
      assert.equal(
        entry.surfaces.includes(runjsCase.surface),
        true,
        `${runjsCase.id} preferred snippet ${snippetId} must declare ${runjsCase.surface}`,
      );
    }

    const payload = buildPayloadForCase(runjsCase);
    if (!payload) {
      assert.equal(runjsCase.surface, 'runjs.unknown');
      return;
    }

    const canonicalized = canonicalizePayload({
      payload,
      metadata: {},
      snapshotPath: SNAPSHOT_PATH,
    });
    const audit = auditPayload({
      payload: canonicalized.payload,
      metadata: {},
      snapshotPath: SNAPSHOT_PATH,
    });
    const codes = collectMainChainCodes({ canonicalized, audit });

    if (runjsCase.expectedOk) {
      assert.equal(audit.runjsInspection?.ok, true, `${runjsCase.id} should pass RunJS inspection in the main chain`);
    }
    for (const expectedCode of runjsCase.expectedCodes) {
      if (expectedCode === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST') {
        assert.equal(
          canonicalized.runjsCanonicalization.hasAutoRewrite || codes.includes(expectedCode),
          true,
          `${runjsCase.id} should either auto-rewrite or report resource request reroute`,
        );
        continue;
      }
      const acceptableCodes = expectedCode === 'RUNJS_UNKNOWN_MODEL_USE'
        ? [expectedCode, 'RUNJS_SURFACE_UNRESOLVED']
        : [expectedCode];
      assert.equal(
        acceptableCodes.some((code) => codes.includes(code)),
        true,
        `${runjsCase.id} main chain should include ${acceptableCodes.join(' or ')}; got ${codes.join(', ')}`,
      );
    }
  });
}
