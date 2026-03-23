import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_BUILDER_STATE_DIR,
  createAutoSessionId,
  resolveSessionPaths,
} from './session_state.mjs';

test('default builder state directory points to codex state directory', () => {
  assert.match(DEFAULT_BUILDER_STATE_DIR, /\.codex\/state\/nocobase-ui-builder$/);
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
