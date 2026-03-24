import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_BUILDER_STATE_DIR,
  LEGACY_BUILDER_STATE_DIR,
  createAutoSessionId,
  defaultBuilderStateDir,
  legacyBuilderStateDir,
  resolveBuilderStateDir,
  resolveSessionPaths,
} from './session_state.mjs';

test('default builder state directory points to agent-neutral state directory', () => {
  assert.match(DEFAULT_BUILDER_STATE_DIR, /\.nocobase\/state\/nocobase-ui-builder$/);
  assert.equal(DEFAULT_BUILDER_STATE_DIR, defaultBuilderStateDir());
  assert.equal(LEGACY_BUILDER_STATE_DIR, legacyBuilderStateDir());
});

test('resolveBuilderStateDir falls back to legacy codex state dir when only legacy data exists', () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'session-state-home-'));
  const neutralPath = defaultBuilderStateDir(tempHome);
  const legacyPath = legacyBuilderStateDir(tempHome);

  fs.mkdirSync(legacyPath, { recursive: true });
  process.env.NOCOBASE_UI_BUILDER_STATE_DIR = '';
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;

  try {
    assert.equal(resolveBuilderStateDir(), legacyPath);
    fs.mkdirSync(neutralPath, { recursive: true });
    assert.equal(resolveBuilderStateDir(), neutralPath);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});

test('auto session id is stable for the same cwd and pid', () => {
  const first = createAutoSessionId({ cwd: '/tmp/demo', pid: 12345 });
  const second = createAutoSessionId({ cwd: '/tmp/demo', pid: 12345 });
  const other = createAutoSessionId({ cwd: '/tmp/demo', pid: 54321 });

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^session-[a-f0-9]{12}$/);
});

test('session paths resolve under the provided session root', () => {
  const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'session-state-root-'));
  const session = resolveSessionPaths({ sessionRoot });

  assert.equal(session.sessionRoot, sessionRoot);
  assert.match(session.runLogDir, /tool-logs$/);
  assert.match(session.latestRunPath, /latest-run\.json$/);
  assert.match(session.reportDir, /reports$/);
  assert.match(session.registryPath, /pages\.v1\.json$/);
  assert.match(session.artifactDir, /artifacts$/);
  assert.match(session.noiseBaselineDir, /runtime\/noise-baselines$/);
  assert.match(session.telemetryDir, /runtime\/telemetry$/);
});
