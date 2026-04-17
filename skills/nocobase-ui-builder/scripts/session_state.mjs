import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function defaultAgentStateHome(homeDir = os.homedir()) {
  return path.join(homeDir, '.nocobase', 'state');
}

export function legacyCodexStateHome(homeDir = os.homedir()) {
  return path.join(homeDir, '.codex', 'state');
}

export function defaultBuilderStateDir(homeDir = os.homedir()) {
  return path.join(defaultAgentStateHome(homeDir), 'nocobase-ui-builder');
}

export function legacyBuilderStateDir(homeDir = os.homedir()) {
  return path.join(legacyCodexStateHome(homeDir), 'nocobase-ui-builder');
}

export const DEFAULT_BUILDER_STATE_DIR = defaultBuilderStateDir();
export const LEGACY_BUILDER_STATE_DIR = legacyBuilderStateDir();

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
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_STATE_DIR;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }

  const defaultDir = defaultBuilderStateDir();
  const legacyDir = legacyBuilderStateDir();

  if (fs.existsSync(legacyDir) && !fs.existsSync(defaultDir)) {
    return legacyDir;
  }

  return defaultDir;
}

export function createAutoSessionId({
  cwd = process.cwd(),
  pid = process.pid,
} = {}) {
  const digest = crypto.createHash('sha256')
    .update(`${pid}|${path.resolve(cwd)}`)
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
  pid,
} = {}) {
  if (typeof sessionRoot === 'string' && sessionRoot.trim()) {
    return path.resolve(sessionRoot.trim());
  }
  if (typeof process.env.NOCOBASE_UI_BUILDER_SESSION_ROOT === 'string'
    && process.env.NOCOBASE_UI_BUILDER_SESSION_ROOT.trim()) {
    return path.resolve(process.env.NOCOBASE_UI_BUILDER_SESSION_ROOT.trim());
  }
  const resolvedSessionId = resolveSessionId(sessionId, { cwd, pid });
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
