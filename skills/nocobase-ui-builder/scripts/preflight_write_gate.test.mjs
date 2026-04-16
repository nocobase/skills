import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(new URL('./preflight_write_gate.mjs', import.meta.url));
const SNAPSHOT_PATH = fileURLToPath(new URL('./runjs_contract_snapshot.json', import.meta.url));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('preflight_write_gate exits with blocker code for forbidden RunJS globals', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-write-gate-block-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const metadataFile = path.join(tempDir, 'metadata.json');

  writeJson(payloadFile, {
    use: 'JSBlockModel',
    stepParams: {
      jsSettings: {
        runJs: {
          version: 'v2',
          code: "await fetch('/api/auth:check')",
        },
      },
    },
  });
  writeJson(metadataFile, {});

  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    'run',
    '--payload-file',
    payloadFile,
    '--metadata-file',
    metadataFile,
    '--snapshot-file',
    SNAPSHOT_PATH,
  ], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.audit.blockers.some((item) => item.code === 'RUNJS_FORBIDDEN_GLOBAL'), true);
});

test('preflight_write_gate writes canonicalized payload for resource reads', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-write-gate-pass-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const metadataFile = path.join(tempDir, 'metadata.json');
  const outFile = path.join(tempDir, 'canonicalized.json');

  writeJson(payloadFile, {
    use: 'JSBlockModel',
    stepParams: {
      jsSettings: {
        runJs: {
          version: 'v2',
          code: "const rows = await ctx.request({ url: 'users:list' }); ctx.render(String(rows?.data?.length ?? 0));",
        },
      },
    },
  });
  writeJson(metadataFile, {});

  const stdout = execFileSync(process.execPath, [
    SCRIPT_PATH,
    'run',
    '--payload-file',
    payloadFile,
    '--metadata-file',
    metadataFile,
    '--snapshot-file',
    SNAPSHOT_PATH,
    '--out-file',
    outFile,
  ], {
    encoding: 'utf8',
  });

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.equal(fs.existsSync(outFile), true);

  const canonicalizedPayload = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const code = canonicalizedPayload.stepParams.jsSettings.runJs.code;
  assert.equal(code.includes("ctx.makeResource('MultiRecordResource')"), true);
});
