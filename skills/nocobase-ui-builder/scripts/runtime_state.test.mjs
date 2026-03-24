import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_RUNTIME_STATE_DIR,
  LEGACY_RUNTIME_STATE_DIR,
  defaultRuntimeStateDir,
  legacyRuntimeStateDir,
  resolveRuntimeStateDir,
} from './runtime_state.mjs';

test('default runtime state directory points to agent-neutral state directory', () => {
  assert.match(DEFAULT_RUNTIME_STATE_DIR, /\.nocobase\/state\/nocobase-ui-runtime$/);
  assert.equal(DEFAULT_RUNTIME_STATE_DIR, defaultRuntimeStateDir());
  assert.equal(LEGACY_RUNTIME_STATE_DIR, legacyRuntimeStateDir());
});

test('resolveRuntimeStateDir falls back to legacy codex state dir when only legacy data exists', () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-state-home-'));
  const neutralPath = defaultRuntimeStateDir(tempHome);
  const legacyPath = legacyRuntimeStateDir(tempHome);

  fs.mkdirSync(legacyPath, { recursive: true });
  process.env.NOCOBASE_UI_RUNTIME_STATE_DIR = '';
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;

  try {
    assert.equal(resolveRuntimeStateDir(), legacyPath);
    fs.mkdirSync(neutralPath, { recursive: true });
    assert.equal(resolveRuntimeStateDir(), neutralPath);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});
