function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTitles(value) {
  return normalizeArray(value)
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function buildDecision({
  gate,
  status,
  reasonCode,
  findings = [],
  stoppedRemainingWork = false,
  details = {},
}) {
  return {
    gate,
    status,
    reasonCode,
    findings: normalizeArray(findings),
    stoppedRemainingWork: Boolean(stoppedRemainingWork),
    details,
  };
}

function hasBlockingAssertionFailure(assertions) {
  return normalizeArray(assertions).some((item) => item?.passed === false && (item.severity ?? 'blocking') === 'blocking');
}

function collectAssertionFailures(assertions) {
  return normalizeArray(assertions)
    .filter((item) => item?.passed === false)
    .map((item) => item.label || item.kind || 'assertion-failed');
}

export function compareReadbackContract(readbackContract = {}, readbackResult = {}) {
  const mismatches = [];
  const expectedTabs = normalizeTitles(readbackContract.requiredVisibleTabs);
  const actualTabs = normalizeTitles(readbackResult.tabTitles);
  if (expectedTabs.length > 0 && JSON.stringify(expectedTabs) !== JSON.stringify(actualTabs)) {
    mismatches.push(`requiredVisibleTabs expected=${expectedTabs.join(' / ')} actual=${actualTabs.join(' / ')}`);
  }

  const expectedUses = normalizeTitles(readbackContract.requiredTopLevelUses);
  const actualUses = normalizeTitles(readbackResult.topLevelUses);
  if (expectedUses.length > 0 && JSON.stringify(expectedUses) !== JSON.stringify(actualUses)) {
    mismatches.push(`requiredTopLevelUses expected=${expectedUses.join(' / ')} actual=${actualUses.join(' / ')}`);
  }

  if (Number.isFinite(readbackContract.requiredTabCount)) {
    const actualTabCount = Number.isFinite(readbackResult.tabCount) ? readbackResult.tabCount : null;
    if (actualTabCount !== readbackContract.requiredTabCount) {
      mismatches.push(`requiredTabCount expected=${readbackContract.requiredTabCount} actual=${actualTabCount}`);
    }
  }

  return mismatches;
}

export function evaluateBuildGate({
  guardResult,
  writeResult,
  readbackContract,
  readbackResult,
}) {
  const blockers = normalizeArray(guardResult?.blockers);
  if (blockers.length > 0) {
    return buildDecision({
      gate: 'build',
      status: 'failed',
      reasonCode: 'GUARD_BLOCKERS',
      findings: blockers.map((item) => item?.code || item?.message || 'guard-blocker'),
      stoppedRemainingWork: true,
    });
  }

  if (writeResult && writeResult.ok === false) {
    return buildDecision({
      gate: 'build',
      status: 'failed',
      reasonCode: 'WRITE_FAILED',
      findings: uniqueList([writeResult.error, writeResult.summary]),
      stoppedRemainingWork: true,
    });
  }

  const mismatches = compareReadbackContract(readbackContract, readbackResult);
  if (mismatches.length > 0) {
    return buildDecision({
      gate: 'build',
      status: 'failed',
      reasonCode: 'READBACK_CONTRACT_MISMATCH',
      findings: mismatches,
      stoppedRemainingWork: true,
    });
  }

  return buildDecision({
    gate: 'build',
    status: 'passed',
    reasonCode: 'BUILD_READY_FOR_BROWSER',
    findings: [],
  });
}

export function evaluatePreOpenGate({
  reachable = true,
  redirected = false,
  blockingFindings = [],
  assertions = [],
}) {
  if (!reachable) {
    return buildDecision({
      gate: 'pre-open',
      status: 'failed',
      reasonCode: 'PAGE_UNREACHABLE',
      findings: ['page-unreachable'],
      stoppedRemainingWork: true,
    });
  }
  if (redirected) {
    return buildDecision({
      gate: 'pre-open',
      status: 'failed',
      reasonCode: 'UNEXPECTED_REDIRECT',
      findings: ['unexpected-redirect'],
      stoppedRemainingWork: true,
    });
  }
  if (normalizeArray(blockingFindings).length > 0) {
    return buildDecision({
      gate: 'pre-open',
      status: 'failed',
      reasonCode: 'PREOPEN_BLOCKING_FINDINGS',
      findings: blockingFindings,
      stoppedRemainingWork: true,
    });
  }
  if (hasBlockingAssertionFailure(assertions)) {
    return buildDecision({
      gate: 'pre-open',
      status: 'failed',
      reasonCode: 'PREOPEN_ASSERTION_FAILED',
      findings: collectAssertionFailures(assertions),
      stoppedRemainingWork: true,
    });
  }
  return buildDecision({
    gate: 'pre-open',
    status: 'passed',
    reasonCode: 'PREOPEN_READY',
  });
}

export function evaluateStageGate({
  stageId,
  actionOk = true,
  waitOk = true,
  blockingFindings = [],
  assertions = [],
  mandatory = true,
}) {
  const gateName = stageId ? `stage:${stageId}` : 'stage';
  const shouldStop = mandatory !== false;

  if (!actionOk) {
    return buildDecision({
      gate: gateName,
      status: 'failed',
      reasonCode: 'STAGE_ACTION_FAILED',
      findings: ['action-failed'],
      stoppedRemainingWork: shouldStop,
    });
  }
  if (!waitOk) {
    return buildDecision({
      gate: gateName,
      status: 'failed',
      reasonCode: 'STAGE_WAIT_FAILED',
      findings: ['wait-condition-failed'],
      stoppedRemainingWork: shouldStop,
    });
  }
  if (normalizeArray(blockingFindings).length > 0) {
    return buildDecision({
      gate: gateName,
      status: 'failed',
      reasonCode: 'STAGE_BLOCKING_FINDINGS',
      findings: blockingFindings,
      stoppedRemainingWork: shouldStop,
    });
  }
  if (hasBlockingAssertionFailure(assertions)) {
    return buildDecision({
      gate: gateName,
      status: 'failed',
      reasonCode: 'STAGE_ASSERTION_FAILED',
      findings: collectAssertionFailures(assertions),
      stoppedRemainingWork: shouldStop,
    });
  }

  return buildDecision({
    gate: gateName,
    status: 'passed',
    reasonCode: 'STAGE_READY',
  });
}

export function summarizeGateDecisions(decisions) {
  const items = normalizeArray(decisions);
  return {
    total: items.length,
    passed: items.filter((item) => item.status === 'passed').length,
    failed: items.filter((item) => item.status === 'failed').length,
    stopped: items.filter((item) => item.stoppedRemainingWork).length,
    failedGates: items.filter((item) => item.status === 'failed').map((item) => ({
      gate: item.gate,
      reasonCode: item.reasonCode,
      findings: item.findings,
    })),
  };
}
