import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';

const SKILLS_ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(SKILLS_ROOT, '.env.test');
const SKILLS_DIR = path.join(SKILLS_ROOT, 'skills');
export const MOCK_APP_DIR = path.join(SKILLS_ROOT, 'test', 'mock-app');
const OUTPUT_LIMIT = 10 * 1024 * 1024;

dotenv.config({ path: ENV_FILE, override: false });

export const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 300_000);

let mockAppReadyPromise: Promise<void> | null = null;

function splitFlags(flags: string) {
  return flags.split(' ').filter(Boolean);
}

function resolveAgentInvocation(cli: string, prompt: string) {
  if (process.env.AGENT_FLAGS) {
    return {
      args: splitFlags(process.env.AGENT_FLAGS),
      input: prompt,
      normalizeStdout: (stdout: string) => stdout,
    };
  }

  if (cli === 'gemini') {
    return {
      args: ['-p', prompt, '--yolo'],
      input: undefined,
      normalizeStdout: (stdout: string) => stdout,
    };
  }

  if (cli === 'codex') {
    return {
      args: ['exec', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-'],
      input: prompt,
      normalizeStdout: (stdout: string) => stdout,
    };
  }

  if (cli === 'claude') {
    return {
      args: ['--dangerously-skip-permissions', '--print', '-'],
      input: prompt,
      normalizeStdout: (stdout: string) => stdout,
    };
  }

  throw new Error(`Unsupported agent CLI: ${cli}`);
}

function appendOutput(current: string, chunk: string | Buffer) {
  if (current.length >= OUTPUT_LIMIT) {
    return current;
  }

  const next = current + chunk.toString();
  return next.length > OUTPUT_LIMIT ? next.slice(0, OUTPUT_LIMIT) : next;
}

async function ensureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function ensureSymlink(target: string, linkPath: string) {
  const relativeTarget = path.relative(path.dirname(linkPath), target);

  try {
    const stats = await fs.lstat(linkPath);
    if (stats.isSymbolicLink()) {
      const existingTarget = await fs.readlink(linkPath);
      if (existingTarget === relativeTarget) {
        return;
      }
    }
    await fs.rm(linkPath, { recursive: true, force: true });
  } catch {
    // noop
  }

  await fs.symlink(relativeTarget, linkPath, 'dir');
}

async function ensureMockApp() {
  if (!mockAppReadyPromise) {
    mockAppReadyPromise = (async () => {
      const agentsSkillsDir = path.join(MOCK_APP_DIR, '.agents', 'skills');
      const geminiSkillsDir = path.join(MOCK_APP_DIR, '.gemini', 'skills');
      const claudeDir = path.join(MOCK_APP_DIR, '.claude');
      const geminiDir = path.join(MOCK_APP_DIR, '.gemini');

      await Promise.all([
        ensureDirectory(MOCK_APP_DIR),
        ensureDirectory(agentsSkillsDir),
        ensureDirectory(geminiSkillsDir),
        ensureDirectory(claudeDir),
        ensureDirectory(geminiDir),
      ]);

      const skillEntries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
      const skillDirs = skillEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

      await Promise.all(
        skillDirs.flatMap((skillName) => {
          const target = path.join(SKILLS_DIR, skillName);
          return [
            ensureSymlink(target, path.join(agentsSkillsDir, skillName)),
            ensureSymlink(target, path.join(geminiSkillsDir, skillName)),
          ];
        }),
      );

      const nocobaseUrl = process.env.NOCOBASE_URL ?? '';
      const nocobaseApiToken = process.env.NOCOBASE_API_TOKEN ?? '';

      await Promise.all([
        fs.writeFile(
          path.join(MOCK_APP_DIR, '.mcp.json'),
          `${JSON.stringify(
            {
              nocobase: {
                type: 'http',
                url: '${NOCOBASE_URL}/api/mcp',
                headers: {
                  Authorization: 'Bearer ${NOCOBASE_API_TOKEN}',
                },
              },
            },
            null,
            2,
          )}\n`,
        ),
        fs.writeFile(
          path.join(claudeDir, 'settings.json'),
          `${JSON.stringify({ enabledMcpjsonServers: ['nocobase'] }, null, 2)}\n`,
        ),
        fs.writeFile(
          path.join(geminiDir, 'settings.json'),
          `${JSON.stringify(
            {
              mcpServers: {
                nocobase: {
                  url: `${nocobaseUrl}/api/mcp`,
                  type: 'http',
                  headers: {
                    Authorization: `Bearer ${nocobaseApiToken}`,
                  },
                  trust: true,
                },
              },
            },
            null,
            2,
          )}\n`,
        ),
        fs.writeFile(
          path.join(MOCK_APP_DIR, '.env'),
          `export NOCOBASE_URL=${nocobaseUrl}\nexport NOCOBASE_API_TOKEN=${nocobaseApiToken}\n`,
        ),
      ]);
    })();
  }

  await mockAppReadyPromise;
}

export async function runAgent(prompt: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  await ensureMockApp();

  const cli = process.env.AGENT_CLI ?? 'gemini';
  const invocation = resolveAgentInvocation(cli, prompt);

  return await new Promise((resolve) => {
    const child = spawn(cli, invocation.args, {
      cwd: process.env.SKILLS_TEST_APP_DIR ?? MOCK_APP_DIR,
      env: {
        ...process.env,
        NOCOBASE_URL: process.env.NOCOBASE_URL ?? '',
        NOCOBASE_API_TOKEN: process.env.NOCOBASE_API_TOKEN ?? '',
      },
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finalize = (exitCode: number) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: invocation.normalizeStdout(stdout),
        stderr,
        exitCode,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      stderr = appendOutput(stderr, `\nProcess timed out after ${AGENT_TIMEOUT_MS}ms.`);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
    }, AGENT_TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => {
      stdout = appendOutput(stdout, chunk);
    });

    child.stderr?.on('data', (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });

    child.on('error', (error) => {
      stderr = appendOutput(stderr, `\n${error.message}`);
      finalize(1);
    });

    child.on('close', (code, signal) => {
      if (signal && !timedOut) {
        stderr = appendOutput(stderr, `\nProcess exited with signal ${signal}.`);
      }
      finalize(code ?? (timedOut ? 124 : 1));
    });

    child.stdin?.end(invocation.input);
  });
}
