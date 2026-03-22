import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveSessionPaths } from './session_state.mjs';

export const DEFAULT_RUNTIME_STATE_DIR = path.join(
  os.homedir(),
  '.codex',
  'state',
  'nocobase-ui-runtime',
);

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
  const candidate = explicitPath || process.env.NOCOBASE_UI_RUNTIME_STATE_DIR || DEFAULT_RUNTIME_STATE_DIR;
  return path.resolve(candidate);
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
