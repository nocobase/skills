import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultSkillRoot = path.resolve(runtimeRoot, '..');
const defaultCasesPath = path.join(runtimeRoot, 'evals', 'prompt-routing-cases.json');
const defaultSchemaPath = path.join(runtimeRoot, 'evals', 'prompt-routing-output.schema.json');
const routeLabels = new Set(['inline-runjs', 'ui-template', 'js-template', 'nocobase-plugin']);
export const PROMPT_ROUTING_MODEL = 'gpt-5.6-sol';
export const PROMPT_ROUTING_REASONING_EFFORT = 'low';
export const PROMPT_ROUTING_ATTEMPTS = 2;
const promptRoutingProviderTokenKey = 'PROMPT_ROUTING_PROVIDER_TOKEN';

const codexEnvironmentKeys = new Set([
  'ALL_PROXY',
  'CODEX_CI',
  'CODEX_HOME',
  'HOME',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NODE_EXTRA_CA_CERTS',
  'NO_PROXY',
  'PATH',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TERM',
  'TMPDIR',
]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readTomlString(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*$`, 'm'));
  return match ? JSON.parse(match[1]) : undefined;
}

function readTomlBoolean(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*(true|false)\\s*$`, 'm'));
  return match ? match[1] === 'true' : undefined;
}

function readTomlSection(source, sectionName) {
  const lines = source.split(/\r?\n/);
  const header = `[${sectionName}]`;
  const startIndex = lines.findIndex((line) => line.trim() === header);
  if (startIndex < 0) {
    return undefined;
  }
  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      break;
    }
    sectionLines.push(lines[index]);
  }
  return sectionLines.join('\n');
}

export function loadActiveCodexProviderConfig({
  codexHome = String(process.env.CODEX_HOME || path.join(os.homedir(), '.codex')),
  environment = process.env,
} = {}) {
  let config;
  try {
    config = readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  const provider = readTomlString(config, 'model_provider');
  if (!provider || provider === 'openai') {
    return undefined;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(provider)) {
    throw new Error(`Active Codex provider name cannot be represented safely: ${provider}`);
  }

  const section = readTomlSection(config, `model_providers.${provider}`);
  if (!section) {
    throw new Error(`Active Codex provider ${provider} is missing its model_providers section`);
  }
  const baseUrl = readTomlString(section, 'base_url');
  if (!baseUrl) {
    throw new Error(`Active Codex provider ${provider} is missing base_url`);
  }
  const configuredEnvironmentKey = readTomlString(section, 'env_key');
  const configuredToken = readTomlString(section, 'experimental_bearer_token');
  const token = configuredEnvironmentKey ? environment[configuredEnvironmentKey] : configuredToken;

  return {
    provider,
    name: readTomlString(section, 'name') || provider,
    baseUrl,
    wireApi: readTomlString(section, 'wire_api') || 'responses',
    requiresOpenAIAuth: readTomlBoolean(section, 'requires_openai_auth') ?? true,
    token,
  };
}

function readDefaultPrompt(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => /^\s*default_prompt:\s*\|-\s*$/.test(line));
  if (keyIndex < 0) {
    throw new Error('agents/openai.yaml must define default_prompt as a literal block scalar');
  }

  const keyIndent = lines[keyIndex].match(/^\s*/)[0].length;
  const content = [];
  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && line.match(/^\s*/)[0].length <= keyIndent) {
      break;
    }
    content.push(line);
  }

  const contentIndent = Math.min(...content.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length));
  if (!Number.isFinite(contentIndent)) {
    throw new Error('agents/openai.yaml default_prompt must not be empty');
  }
  return content
    .map((line) => line.slice(Math.min(contentIndent, line.length)))
    .join('\n')
    .replace(/\n+$/, '');
}

export function loadPromptRoutingCases(casesPath = defaultCasesPath) {
  const cases = readJson(casesPath);
  if (!Array.isArray(cases) || cases.length !== 6) {
    throw new Error('Prompt routing evaluation requires exactly six cases');
  }
  for (const entry of cases) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      typeof entry.request !== 'string' ||
      !routeLabels.has(entry.expectedRoute)
    ) {
      throw new Error('Prompt routing case has an invalid id, request, or expectedRoute');
    }
  }
  return cases;
}

export function buildPromptRoutingEvaluation({ skillRoot = defaultSkillRoot, cases = loadPromptRoutingCases() } = {}) {
  const skill = readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const openaiPrompt = readDefaultPrompt(readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8'));
  const jsTemplateRouter = readFileSync(path.join(skillRoot, 'references', 'js-template-source.md'), 'utf8');
  const requests = cases.map(({ id, request }) => ({ caseId: id, request }));

  return [
    'Evaluate the user requests using only the active NocoBase UI Builder routing sources below.',
    'Choose exactly one allowed route label for every case: inline-runjs, ui-template, js-template, or nocobase-plugin.',
    'Do not call tools. Return every result through the required JSON schema and no extra prose.',
    '',
    '<SKILL_MD>',
    skill,
    '</SKILL_MD>',
    '',
    '<OPENAI_DEFAULT_PROMPT>',
    openaiPrompt,
    '</OPENAI_DEFAULT_PROMPT>',
    '',
    '<JS_TEMPLATE_ROUTER>',
    jsTemplateRouter,
    '</JS_TEMPLATE_ROUTER>',
    '',
    '<REQUESTS>',
    JSON.stringify(requests, null, 2),
    '</REQUESTS>',
  ].join('\n');
}

function createCodexEnvironment(environment = process.env, providerConfig) {
  const isolatedEnvironment = Object.fromEntries(
    Object.entries(environment).filter(([key, value]) => codexEnvironmentKeys.has(key) && value !== undefined)
  );
  if (providerConfig?.token) {
    isolatedEnvironment[promptRoutingProviderTokenKey] = providerConfig.token;
  } else if (!providerConfig && environment.OPENAI_API_KEY) {
    isolatedEnvironment.OPENAI_API_KEY = environment.OPENAI_API_KEY;
  }
  return isolatedEnvironment;
}

function createProviderArguments(providerConfig) {
  if (!providerConfig) {
    return [];
  }
  const prefix = `model_providers.${providerConfig.provider}`;
  const argumentsList = [
    '--config',
    `model_provider=${JSON.stringify(providerConfig.provider)}`,
    '--config',
    `${prefix}.name=${JSON.stringify(providerConfig.name)}`,
    '--config',
    `${prefix}.base_url=${JSON.stringify(providerConfig.baseUrl)}`,
    '--config',
    `${prefix}.wire_api=${JSON.stringify(providerConfig.wireApi)}`,
    '--config',
    `${prefix}.requires_openai_auth=${providerConfig.requiresOpenAIAuth}`,
  ];
  if (providerConfig.token) {
    argumentsList.push('--config', `${prefix}.env_key=${JSON.stringify(promptRoutingProviderTokenKey)}`);
  }
  return argumentsList;
}

function redactDiagnostic(value, environment) {
  let diagnostic = String(value || '').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
  for (const [key, secret] of Object.entries(environment)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key) && secret) {
      diagnostic = diagnostic.replaceAll(secret, '[REDACTED]');
    }
  }
  return diagnostic;
}

function assertNoPromptRoutingToolCalls(eventStream) {
  const lines = eventStream.split(/\r?\n/).filter((line) => line.trim());
  const events = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error('codex exec prompt routing audit returned a non-JSON event');
    }
  });
  const lifecycleTypes = new Set(events.map((event) => event?.type));
  if (!lifecycleTypes.has('thread.started') || !lifecycleTypes.has('turn.completed')) {
    throw new Error('codex exec prompt routing audit is missing lifecycle events');
  }

  for (const event of events) {
    if (event?.item && !['agent_message', 'reasoning'].includes(event.item.type)) {
      throw new Error(`Prompt routing evaluation used prohibited tool activity: ${event.item.type || 'unknown'}`);
    }
    if (typeof event?.type === 'string' && /(?:tool|command|file_change|web_search|mcp)/i.test(event.type)) {
      throw new Error(`Prompt routing evaluation used prohibited tool activity: ${event.type}`);
    }
  }
}

export function validatePromptRoutingResult(result, cases = loadPromptRoutingCases()) {
  if (!result || !Array.isArray(result.results) || result.results.length !== cases.length) {
    throw new Error(`Prompt routing evaluation must return ${cases.length} results`);
  }

  const actualById = new Map();
  for (const entry of result.results) {
    if (!entry || typeof entry.caseId !== 'string' || !routeLabels.has(entry.route)) {
      throw new Error('Prompt routing evaluation returned an invalid result shape');
    }
    if (actualById.has(entry.caseId)) {
      throw new Error(`Prompt routing evaluation returned duplicate case ${entry.caseId}`);
    }
    actualById.set(entry.caseId, entry.route);
  }

  const mismatches = cases
    .filter((entry) => actualById.get(entry.id) !== entry.expectedRoute)
    .map((entry) => `${entry.id}: expected ${entry.expectedRoute}, received ${actualById.get(entry.id) || 'missing'}`);
  if (mismatches.length > 0) {
    throw new Error(`Prompt routing evaluation failed:\n${mismatches.join('\n')}`);
  }

  return cases.map((entry) => ({
    caseId: entry.id,
    route: actualById.get(entry.id),
  }));
}

export function runPromptRoutingEvaluation({
  skillRoot = defaultSkillRoot,
  casesPath = defaultCasesPath,
  schemaPath = defaultSchemaPath,
  codexBin = String(process.env.CODEX_BIN || 'codex').trim() || 'codex',
  model = PROMPT_ROUTING_MODEL,
  reasoningEffort = PROMPT_ROUTING_REASONING_EFFORT,
  attempts = PROMPT_ROUTING_ATTEMPTS,
  providerConfig,
  environment = process.env,
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) {
    throw new Error('Prompt routing evaluation attempts must be an integer from 1 to 3');
  }
  const cases = loadPromptRoutingCases(casesPath);
  const prompt = buildPromptRoutingEvaluation({ skillRoot, cases });
  const activeProviderConfig =
    providerConfig === undefined ? loadActiveCodexProviderConfig({ environment }) : providerConfig;
  const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'nocobase-prompt-routing-'));

  try {
    const isolatedSchemaPath = path.join(outputDirectory, 'prompt-routing-output.schema.json');
    writeFileSync(isolatedSchemaPath, readFileSync(schemaPath));
    let results;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const outputPath = path.join(outputDirectory, `result-${attempt}.json`);
      const isolatedEnvironment = createCodexEnvironment(environment, activeProviderConfig);
      const execution = spawnSync(
        codexBin,
        [
          'exec',
          '--ephemeral',
          '--ignore-user-config',
          '--ignore-rules',
          '--skip-git-repo-check',
          '--model',
          model,
          '--config',
          `model_reasoning_effort="${reasoningEffort}"`,
          ...createProviderArguments(activeProviderConfig),
          '--sandbox',
          'read-only',
          '--json',
          '--output-schema',
          isolatedSchemaPath,
          '--output-last-message',
          outputPath,
          '--color',
          'never',
          '--cd',
          outputDirectory,
          '-',
        ],
        {
          cwd: outputDirectory,
          encoding: 'utf8',
          env: isolatedEnvironment,
          input: prompt,
          timeout: 240_000,
        }
      );

      if (execution.error) {
        throw execution.error;
      }
      if (execution.status !== 0) {
        const diagnostic = redactDiagnostic(execution.stderr || execution.stdout, isolatedEnvironment)
          .trim()
          .slice(-4000);
        throw new Error(
          `codex exec attempt ${attempt} exited with status ${execution.status}${diagnostic ? `:\n${diagnostic}` : ''}`
        );
      }

      assertNoPromptRoutingToolCalls(execution.stdout);
      results = validatePromptRoutingResult(readJson(outputPath), cases);
    }

    return { attempts, model, reasoningEffort, results };
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}
