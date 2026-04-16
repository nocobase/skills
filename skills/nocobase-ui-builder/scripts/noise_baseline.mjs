#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureDir,
  normalizeNonEmpty,
  readJsonFile,
  resolveNoiseBaselineDir,
  sha256,
  sortUniqueStrings,
  writeJsonAtomic,
} from './runtime_state.mjs';

export const BASELINE_PROMOTION_RUN_COUNT = 3;
export const BASELINE_PROMOTION_SESSION_COUNT = 2;
export const DELTA_WARNING_THRESHOLD = 3;
export const BASELINE_SCHEMA_VERSION = 'v1';

export const KNOWN_NOISE_RULES = [
  {
    familyId: 'react-invalid-dom-prop',
    title: 'React invalid DOM prop',
    classification: 'noise',
    patterns: [/does not recognize the .* prop on a DOM element/i],
  },
  {
    familyId: 'react-dom-nesting',
    title: 'React DOM nesting warning',
    classification: 'noise',
    patterns: [/validateDOMNesting/i],
  },
  {
    familyId: 'react-nonboolean-attr',
    title: 'React non-boolean attr warning',
    classification: 'noise',
    patterns: [/non-boolean attribute/i],
  },
  {
    familyId: 'platform-plugin-deprecated',
    title: 'Plugin deprecated warning',
    classification: 'noise',
    patterns: [/deprecated and may be removed/i],
  },
  {
    familyId: 'platform-action-reregistered',
    title: 'Action registered repeatedly',
    classification: 'noise',
    patterns: [/already registered\. It will be overwritten/i],
  },
  {
    familyId: 'flowengine-circular-reference',
    title: 'FlowEngine circular reference',
    classification: 'noise',
    patterns: [/resolveUse circular reference detected/i],
  },
  {
    familyId: 'bundler-critical-dependency',
    title: 'Bundler critical dependency',
    classification: 'noise',
    patterns: [/Critical dependency: the request of a dependency is an expression/i],
  },
  {
    familyId: 'esm-export-warning',
    title: 'ESM named export warning',
    classification: 'noise',
    patterns: [/Should not import the named export/i],
  },
  {
    familyId: 'runtime-exception',
    title: 'Runtime exception',
    classification: 'blocking',
    patterns: [/TypeError:/i, /ReferenceError:/i, /Cannot read properties of undefined/i, /render failed/i, /ErrorBoundary/i],
  },
];

function usage() {
  return [
    'Usage:',
    '  node scripts/noise_baseline.mjs classify --instance-fingerprint <fingerprint> --messages-json <jsonArray> [--session-id <sessionId>] [--session-root <path>] [--state-dir <dir>]',
    '  node scripts/noise_baseline.mjs record --instance-fingerprint <fingerprint> --run-id <runId> --messages-json <jsonArray> [--session-id <sessionId>] [--session-root <path>] [--stage <name>] [--success <true|false>] [--state-dir <dir>]',
  ].join('\n');
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
      throw new Error(`Unexpected argument: ${token}`);
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

function parseJson(rawValue, label) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function parseBooleanString(rawValue, fallback = true) {
  if (rawValue === undefined) {
    return fallback;
  }
  if (rawValue === 'true') {
    return true;
  }
  if (rawValue === 'false') {
    return false;
  }
  throw new Error(`${rawValue} is not a valid boolean string`);
}

function normalizedUnknownFamilyId(message) {
  const normalized = String(message || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return `novel-${sha256(normalized).slice(0, 12)}`;
}

export function matchNoiseFamily(message) {
  const normalized = normalizeNonEmpty(message, 'message');
  for (const rule of KNOWN_NOISE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        familyId: rule.familyId,
        title: rule.title,
        classification: rule.classification,
        known: true,
        sample: normalized,
      };
    }
  }
  return {
    familyId: normalizedUnknownFamilyId(normalized),
    title: 'Novel noise finding',
    classification: 'novel',
    known: false,
    sample: normalized,
  };
}

export function summarizeNoiseMessages(messages) {
  const groups = new Map();
  for (const rawMessage of Array.isArray(messages) ? messages : []) {
    if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
      continue;
    }
    const family = matchNoiseFamily(rawMessage);
    const current = groups.get(family.familyId) ?? {
      familyId: family.familyId,
      title: family.title,
      classification: family.classification,
      known: family.known,
      count: 0,
      sample: family.sample,
      rawExamples: [],
    };
    current.count += 1;
    if (current.rawExamples.length < 3) {
      current.rawExamples.push(rawMessage.trim());
    }
    groups.set(family.familyId, current);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count || left.familyId.localeCompare(right.familyId));
}

function baselineFilePath(stateDir, instanceFingerprint, options = {}) {
  const normalizedInstanceFingerprint = normalizeNoiseBaselineInstanceFingerprint(instanceFingerprint);
  return path.join(
    resolveNoiseBaselineDir(stateDir, options),
    `${normalizedInstanceFingerprint}.json`,
  );
}

function normalizeNoiseBaselineInstanceFingerprint(value) {
  const normalized = normalizeNonEmpty(value, 'instance fingerprint');
  if (path.isAbsolute(normalized)) {
    throw new Error('instance fingerprint must not be an absolute path');
  }
  if (normalized.includes('..')) {
    throw new Error('instance fingerprint must not contain ".."');
  }
  if (normalized.includes('/') || normalized.includes('\\')) {
    throw new Error('instance fingerprint must not contain path separators');
  }
  return normalized;
}

export function loadNoiseBaseline({ stateDir, instanceFingerprint, sessionId, sessionRoot }) {
  const normalizedInstanceFingerprint = normalizeNoiseBaselineInstanceFingerprint(instanceFingerprint);
  return readJsonFile(baselineFilePath(stateDir, instanceFingerprint, { sessionId, sessionRoot }), {
    version: BASELINE_SCHEMA_VERSION,
    instanceFingerprint: normalizedInstanceFingerprint,
    families: {},
  });
}

function computeMedian(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function classifyNoiseSummaries({ baseline, summaries }) {
  const blocking = [];
  const novel = [];
  const baselineNoise = [];
  const deltaWarnings = [];

  for (const summary of Array.isArray(summaries) ? summaries : []) {
    const baselineFamily = baseline?.families?.[summary.familyId] ?? null;
    if (summary.classification === 'blocking') {
      blocking.push(summary);
      continue;
    }
    if (baselineFamily?.promotedAt) {
      const medianCount = Number.isFinite(baselineFamily.medianCount) ? baselineFamily.medianCount : 0;
      if (summary.count >= medianCount + DELTA_WARNING_THRESHOLD) {
        deltaWarnings.push({
          ...summary,
          medianCount,
          delta: summary.count - medianCount,
        });
      } else {
        baselineNoise.push({
          ...summary,
          medianCount,
        });
      }
      continue;
    }
    novel.push(summary);
  }

  return {
    blocking,
    novel,
    baseline: baselineNoise,
    deltaWarnings,
  };
}

export function recordNoiseRun({
  stateDir,
  instanceFingerprint,
  runId,
  sessionId,
  sessionRoot,
  stage = 'pre-open',
  summaries,
  success = true,
}) {
  const normalizedInstanceFingerprint = normalizeNoiseBaselineInstanceFingerprint(instanceFingerprint);
  const baseline = loadNoiseBaseline({
    stateDir,
    instanceFingerprint: normalizedInstanceFingerprint,
    sessionId,
    sessionRoot,
  });
  const now = new Date().toISOString();

  for (const summary of Array.isArray(summaries) ? summaries : []) {
    if (!summary.known || summary.classification === 'blocking' || !success) {
      continue;
    }
    const current = baseline.families[summary.familyId] ?? {
      familyId: summary.familyId,
      title: summary.title,
      firstSeenAt: now,
      lastSeenAt: now,
      counts: [],
      seenRuns: [],
      seenSessions: [],
      stageNames: [],
      maxCount: 0,
      medianCount: 0,
      promotedAt: null,
      sample: summary.sample,
    };
    current.lastSeenAt = now;
    current.sample = current.sample || summary.sample;
    current.counts = [...current.counts, summary.count].slice(-20);
    current.maxCount = Math.max(current.maxCount, summary.count);
    current.medianCount = computeMedian(current.counts);
    current.seenRuns = sortUniqueStrings([...current.seenRuns, runId]);
    current.seenSessions = sortUniqueStrings([...current.seenSessions, sessionId].filter(Boolean));
    current.stageNames = sortUniqueStrings([...current.stageNames, stage]);
    if (!current.promotedAt
      && current.seenRuns.length >= BASELINE_PROMOTION_RUN_COUNT
      && current.seenSessions.length >= BASELINE_PROMOTION_SESSION_COUNT) {
      current.promotedAt = now;
    }
    baseline.families[summary.familyId] = current;
  }

  const targetPath = baselineFilePath(stateDir, normalizedInstanceFingerprint, { sessionId, sessionRoot });
  ensureDir(path.dirname(targetPath));
  writeJsonAtomic(targetPath, baseline);
  return baseline;
}

export function classifyNoiseMessages({
  stateDir,
  instanceFingerprint,
  messages,
  sessionId,
  sessionRoot,
}) {
  const normalizedInstanceFingerprint = normalizeNoiseBaselineInstanceFingerprint(instanceFingerprint);
  const baseline = loadNoiseBaseline({
    stateDir,
    instanceFingerprint: normalizedInstanceFingerprint,
    sessionId,
    sessionRoot,
  });
  const summaries = summarizeNoiseMessages(messages);
  return {
    summaries,
    ...classifyNoiseSummaries({
      baseline,
      summaries,
    }),
  };
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    console.log(usage());
    return;
  }

  if (typeof flags['instance-fingerprint'] !== 'string' || typeof flags['messages-json'] !== 'string') {
    throw new Error('--instance-fingerprint and --messages-json are required');
  }

  const stateDir = typeof flags['state-dir'] === 'string' ? flags['state-dir'] : undefined;
  const sessionId = typeof flags['session-id'] === 'string' ? flags['session-id'] : '';
  const sessionRoot = typeof flags['session-root'] === 'string' ? flags['session-root'] : '';
  const messages = parseJson(flags['messages-json'], 'messages-json');

  if (command === 'classify') {
    console.log(JSON.stringify(classifyNoiseMessages({
      stateDir,
      instanceFingerprint: flags['instance-fingerprint'],
      messages,
      sessionId,
      sessionRoot,
    }), null, 2));
    return;
  }

  if (command === 'record') {
    if (typeof flags['run-id'] !== 'string') {
      throw new Error('--run-id is required');
    }
    const summaries = summarizeNoiseMessages(messages);
    const result = recordNoiseRun({
      stateDir,
      instanceFingerprint: flags['instance-fingerprint'],
      runId: flags['run-id'],
      sessionId,
      sessionRoot,
      stage: typeof flags.stage === 'string' ? flags.stage : 'pre-open',
      summaries,
      success: parseBooleanString(flags.success, true),
    });
    console.log(JSON.stringify({
      stored: true,
      familyCount: Object.keys(result.families).length,
      summaries,
    }, null, 2));
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
