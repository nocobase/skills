import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_BUILDER_STATE_DIR = path.join(
  os.homedir(),
  '.codex',
  'state',
  'nocobase-ui-builder',
);

export function normalizeNonEmpty(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

export function resolveBuilderStateDir(explicitPath) {
  const candidate = explicitPath || process.env.NOCOBASE_UI_BUILDER_STATE_DIR || DEFAULT_BUILDER_STATE_DIR;
  return path.resolve(candidate);
}

export function createAutoSessionId({
  cwd = process.cwd(),
  ppid = process.ppid,
} = {}) {
  const digest = crypto.createHash('sha256')
    .update(`${ppid}|${path.resolve(cwd)}`)
    .digest('hex')
    .slice(0, 12);
  return `session-${digest}`;
}

export function resolveSessionId(explicitSessionId, options = {}) {
  if (typeof explicitSessionId === 'string' && explicitSessionId.trim()) {
    return normalizeNonEmpty(explicitSessionId, 'session id');
  }
  if (typeof process.env.NOCOBASE_UI_BUILDER_SESSION_ID === 'string'
    && process.env.NOCOBASE_UI_BUILDER_SESSION_ID.trim()) {
    return normalizeNonEmpty(process.env.NOCOBASE_UI_BUILDER_SESSION_ID, 'session id');
  }
  return createAutoSessionId(options);
}

export function resolveSessionRoot({
  sessionId,
  sessionRoot,
  stateDir,
  cwd,
  ppid,
} = {}) {
  if (typeof sessionRoot === 'string' && sessionRoot.trim()) {
    return path.resolve(sessionRoot.trim());
  }
  if (typeof process.env.NOCOBASE_UI_BUILDER_SESSION_ROOT === 'string'
    && process.env.NOCOBASE_UI_BUILDER_SESSION_ROOT.trim()) {
    return path.resolve(process.env.NOCOBASE_UI_BUILDER_SESSION_ROOT.trim());
  }
  const resolvedSessionId = resolveSessionId(sessionId, { cwd, ppid });
  return path.join(resolveBuilderStateDir(stateDir), 'sessions', resolvedSessionId);
}

export function resolveSessionPaths(options = {}) {
  const sessionId = resolveSessionId(options.sessionId, options);
  const sessionRoot = resolveSessionRoot({
    ...options,
    sessionId,
  });
  return {
    sessionId,
    sessionRoot,
    runLogDir: path.join(sessionRoot, 'tool-logs'),
    latestRunPath: path.join(sessionRoot, 'latest-run.json'),
    reportDir: path.join(sessionRoot, 'reports'),
    improvementLogPath: path.join(sessionRoot, 'improvement-log.jsonl'),
    registryPath: path.join(sessionRoot, 'pages.v1.json'),
    artifactDir: path.join(sessionRoot, 'artifacts'),
    runtimeDir: path.join(sessionRoot, 'runtime'),
    noiseBaselineDir: path.join(sessionRoot, 'runtime', 'noise-baselines'),
    telemetryDir: path.join(sessionRoot, 'runtime', 'telemetry'),
  };
}
