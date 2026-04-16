import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  defaultAgentStateHome,
  legacyCodexStateHome,
  resolveSessionPaths,
} from './session_state.mjs';

export function defaultRuntimeStateDir(homeDir = os.homedir()) {
  return path.join(defaultAgentStateHome(homeDir), 'nocobase-ui-runtime');
}

export function legacyRuntimeStateDir(homeDir = os.homedir()) {
  return path.join(legacyCodexStateHome(homeDir), 'nocobase-ui-runtime');
}

export const DEFAULT_RUNTIME_STATE_DIR = defaultRuntimeStateDir();
export const LEGACY_RUNTIME_STATE_DIR = legacyRuntimeStateDir();

export const DEFAULT_STABLE_CACHE_DIR = path.join(DEFAULT_RUNTIME_STATE_DIR, 'stable-cache');
export const DEFAULT_NOISE_BASELINE_DIR = path.join(DEFAULT_RUNTIME_STATE_DIR, 'noise-baselines');
export const DEFAULT_TELEMETRY_DIR = path.join(DEFAULT_RUNTIME_STATE_DIR, 'telemetry');

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

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

export function resolveRuntimeStateDir(explicitPath) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_RUNTIME_STATE_DIR;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }

  const defaultDir = defaultRuntimeStateDir();
  const legacyDir = legacyRuntimeStateDir();

  if (fs.existsSync(legacyDir) && !fs.existsSync(defaultDir)) {
    return legacyDir;
  }
  return defaultDir;
}

export function resolveStableCacheDir(stateDir) {
  return path.join(resolveRuntimeStateDir(stateDir), 'stable-cache');
}

export function resolveNoiseBaselineDir(stateDir, options = {}) {
  if (stateDir || (process.env.NOCOBASE_UI_RUNTIME_STATE_DIR && process.env.NOCOBASE_UI_RUNTIME_STATE_DIR.trim())) {
    return path.join(resolveRuntimeStateDir(stateDir), 'noise-baselines');
  }
  return resolveSessionPaths(options).noiseBaselineDir;
}

export function resolveTelemetryDir(stateDir, options = {}) {
  if (stateDir || (process.env.NOCOBASE_UI_RUNTIME_STATE_DIR && process.env.NOCOBASE_UI_RUNTIME_STATE_DIR.trim())) {
    return path.join(resolveRuntimeStateDir(stateDir), 'telemetry');
  }
  return resolveSessionPaths(options).telemetryDir;
}

export function sortUniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function readJsonFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
