import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { AGENT_TIMEOUT_MS, runAgent } from '../../../../test/agent-runner';
import {
  deleteWorkflow,
  extractOperationResult,
  fetchNode,
  fetchWorkflow,
  listRecentWorkflows,
  NodeRecord,
  WorkflowRecord,
} from './workflow-test-utils';

const MAX_ATTEMPTS = 3;
const TIMEOUT = MAX_ATTEMPTS * AGENT_TIMEOUT_MS + 60_000;

export type Scenario = 'create' | 'edit';
type Category = 'triggers' | 'nodes';

export interface AgentCase {
  id: string;
  description: string;
  prompt: string;
  scenario: Scenario;
  expectedConfig: Record<string, unknown>;
  placeholderExpected: boolean;
  environment?: CaseEnvironment;
  resultNode?: 'existing' | 'new';
  assert?: (report: TestReport) => void;
  skip?: boolean | string;
}

interface SuiteRuntime {
  category: Category;
  type: string;
  artifactDir: string;
  workflow?: WorkflowSeed;
}

export interface TestReport {
  artifactPath: string;
  attempts: number;
  stdout: string;
  stderr: string;
  workflow: WorkflowRecord | null;
  node: NodeRecord | null;
  lookupDetail: string;
}

interface WorkflowFixture {
  workflowId: number;
  workflowTitle: string;
  workflowType: string;
  existingNodes: NodeRecord[];
  targetNodeId?: number;
  beforeNodeIds: number[];
}

interface WorkflowSeed {
  type: string;
  sync: boolean;
  config: Record<string, unknown>;
}

interface NodeSeed {
  alias?: string;
  key?: string;
  type: string;
  title?: string;
  upstreamAlias?: string | null;
  branchIndex?: number | null;
  config?: Record<string, unknown>;
}

interface CaseEnvironment {
  workflow?: Partial<WorkflowSeed>;
  nodes?: NodeSeed[];
  targetNodeAlias?: string;
}

interface SuiteDefinition {
  category: Category;
  type: string;
  workflow?: WorkflowSeed;
  artifactDir?: string;
  describeTitle?: string;
}

type TriggerSuiteDefinition = Omit<SuiteDefinition, 'category' | 'workflow'>;

interface NodeSuiteDefinition extends Omit<SuiteDefinition, 'category'> {
  workflow: WorkflowSeed;
}

interface SuiteContext {
  describeTitle: string;
  timeout: number;
  cleanup: () => Promise<void>;
  runCase: (testCase: AgentCase) => () => Promise<void>;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupTemplateString(value: string) {
  return value
    .trim()
    .replace(/\{\{\s*/g, '{{')
    .replace(/\s*\}\}/g, '}}')
    .replace(/^main[:.]/, '');
}

function findComparablePrimitive(actual: unknown, expected: unknown) {
  if (
    expected !== null &&
    typeof expected !== 'object' &&
    actual &&
    typeof actual === 'object' &&
    Object.keys(actual as Record<string, unknown>).length === 1
  ) {
    const operatorValue = (actual as Record<string, unknown>).$eq;
    if (operatorValue !== undefined) {
      return operatorValue;
    }
  }

  return actual;
}

function matchesSubset(actual: unknown, expected: unknown): boolean {
  const comparableActual = findComparablePrimitive(actual, expected);

  if (expected === null || typeof expected !== 'object') {
    if (typeof expected === 'string' && typeof comparableActual === 'string') {
      return cleanupTemplateString(comparableActual) === cleanupTemplateString(expected);
    }
    return comparableActual === expected;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) {
      return false;
    }

    return expected.every((expectedItem, index) => matchesSubset(actual[index], expectedItem));
  }

  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
    return false;
  }

  const actualObject = actual as Record<string, unknown>;
  const expectedObject = expected as Record<string, unknown>;

  if (!('$and' in expectedObject) && !('$or' in expectedObject)) {
    const groupedCandidates = [
      ...(Array.isArray(actualObject.$and) ? actualObject.$and : []),
      ...(Array.isArray(actualObject.$or) ? actualObject.$or : []),
    ];

    if (groupedCandidates.some((candidate) => matchesSubset(candidate, expectedObject))) {
      return true;
    }
  }

  return Object.entries(expectedObject).every(([key, expectedValue]) =>
    matchesSubset(actualObject[key], expectedValue),
  );
}

export function expectSubset(actual: unknown, expected: unknown, detail: string) {
  expect(matchesSubset(actual, expected), detail).toBe(true);
}

async function requestJson<T>(pathname: string, { method = 'GET', body }: RequestOptions = {}): Promise<T | null> {
  const url = process.env.NOCOBASE_URL;
  const token = process.env.NOCOBASE_API_TOKEN;
  if (!url || !token) {
    return null;
  }

  const res = await fetch(`${url}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    return null;
  }

  const payload = (await res.json()) as { data?: T };
  return payload.data ?? null;
}

async function seedWorkflow(seed: WorkflowSeed & { title: string }): Promise<WorkflowRecord | null> {
  const workflow = await requestJson<WorkflowRecord>('/api/workflows:create', {
    method: 'POST',
    body: {
      title: seed.title,
      type: seed.type,
      sync: seed.sync,
      enabled: false,
    },
  });

  if (!workflow?.id) {
    return null;
  }

  if (Object.keys(seed.config).length === 0) {
    return workflow;
  }

  await requestJson<WorkflowRecord>(`/api/workflows:update?filterByTk=${workflow.id}`, {
    method: 'POST',
    body: { config: seed.config },
  });

  return workflow;
}

async function seedNode(workflowId: number, seed: NodeSeed, upstreamId: number | null): Promise<NodeRecord | null> {
  return requestJson<NodeRecord>(`/api/workflows/${workflowId}/nodes:create`, {
    method: 'POST',
    body: {
      key: seed.key,
      type: seed.type,
      title: seed.title ?? `${seed.type}-${randomUUID().slice(0, 6)}`,
      upstreamId,
      branchIndex: seed.branchIndex ?? null,
      config: seed.config ?? {},
    },
  });
}

function requireTriggerWorkflowSeed(testCase: AgentCase): WorkflowSeed {
  const workflow = testCase.environment?.workflow;

  if (!workflow) {
    throw new Error(`Edit case ${testCase.id} must declare environment.workflow`);
  }

  if (typeof workflow.type !== 'string' || typeof workflow.sync !== 'boolean' || !workflow.config) {
    throw new Error(`Edit case ${testCase.id} must declare workflow.type, workflow.sync, and workflow.config`);
  }

  return {
    type: workflow.type,
    sync: workflow.sync,
    config: workflow.config,
  };
}

function resolveNodeWorkflowSeed(suite: SuiteRuntime, testCase: AgentCase): WorkflowSeed {
  if (!suite.workflow) {
    throw new Error(`Node suite ${suite.type} must declare a base workflow environment`);
  }

  const workflowOverride = testCase.environment?.workflow;

  return {
    type: workflowOverride?.type ?? suite.workflow.type,
    sync: workflowOverride?.sync ?? suite.workflow.sync,
    config: workflowOverride?.config ?? suite.workflow.config,
  };
}

function resolveTargetNodeId(
  testCase: AgentCase,
  suite: SuiteRuntime,
  nodes: NodeRecord[],
  aliases: Map<string, NodeRecord>,
) {
  if (testCase.resultNode === 'new') {
    return undefined;
  }

  const explicitTargetAlias = testCase.environment?.targetNodeAlias;
  if (explicitTargetAlias) {
    const targetNode = aliases.get(explicitTargetAlias);
    if (!targetNode?.id) {
      throw new Error(`Case ${testCase.id} references missing environment.targetNodeAlias="${explicitTargetAlias}"`);
    }
    return targetNode.id;
  }

  const matchedNodes = nodes.filter((node) => node.type === suite.type);
  if (matchedNodes.length === 1) {
    return matchedNodes[0].id;
  }

  if (testCase.scenario === 'edit') {
    throw new Error(
      `Edit case ${testCase.id} must provide environment.targetNodeAlias or exactly one existing "${suite.type}" node`,
    );
  }

  return undefined;
}

async function fetchWorkflowWithRetry(id: number, appends: string[] = [], attempts = 10, delayMs = 1_500) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const workflow = await fetchWorkflow(id, { appends });
    if (workflow) {
      return workflow;
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  return null;
}

async function fetchNodeWithRetry(id: number, attempts = 10, delayMs = 1_500) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const node = await fetchNode(id);
    if (node) {
      return node;
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  return null;
}

function writeArtifact(artifactDir: string, testCase: AgentCase, payload: Record<string, unknown>) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `${testCase.id}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(payload, null, 2));
  return artifactPath;
}

function resolveCreatedWorkflowByDiff(
  workflows: WorkflowRecord[],
  beforeWorkflowIds: Set<number>,
  workflowType: string,
  attemptStartedAt: number,
) {
  return (
    workflows.find((workflow) => {
      const createdAt = typeof workflow.createdAt === 'string' ? Date.parse(workflow.createdAt) : Number.NaN;
      return (
        workflow.type === workflowType &&
        !beforeWorkflowIds.has(workflow.id) &&
        !Number.isNaN(createdAt) &&
        createdAt >= attemptStartedAt - 1_000
      );
    }) ?? null
  );
}

async function createTriggerFixture(suite: SuiteRuntime, testCase: AgentCase, createdWorkflowIds: number[]) {
  if (testCase.scenario !== 'edit') {
    return null;
  }

  const workflowSeed = requireTriggerWorkflowSeed(testCase);
  const title = `WF_TEST_${suite.type}_${testCase.id}_${randomUUID().slice(0, 8)}`;
  const workflow = await seedWorkflow({
    title,
    type: workflowSeed.type,
    sync: workflowSeed.sync,
    config: workflowSeed.config,
  });

  if (!workflow?.id) {
    throw new Error(`Failed to create workflow fixture for ${testCase.id}`);
  }

  createdWorkflowIds.push(workflow.id);

  return {
    workflowId: workflow.id,
    workflowTitle: title,
    workflowType: workflowSeed.type,
    existingNodes: [],
    beforeNodeIds: [],
  } satisfies WorkflowFixture;
}

async function createNodeFixture(suite: SuiteRuntime, testCase: AgentCase, createdWorkflowIds: number[]) {
  const workflowSeed = resolveNodeWorkflowSeed(suite, testCase);
  const workflowTitle = `WF_TEST_${suite.type}_${testCase.id}_${randomUUID().slice(0, 8)}`;
  const workflow = await seedWorkflow({
    title: workflowTitle,
    type: workflowSeed.type,
    sync: workflowSeed.sync,
    config: workflowSeed.config,
  });

  if (!workflow?.id) {
    throw new Error(`Failed to create node workflow fixture for ${testCase.id}`);
  }

  createdWorkflowIds.push(workflow.id);
  const aliases = new Map<string, NodeRecord>();
  const existingNodes: NodeRecord[] = [];

  for (const nodeSeed of testCase.environment?.nodes ?? []) {
    const upstreamId =
      nodeSeed.upstreamAlias === null
        ? null
        : nodeSeed.upstreamAlias
          ? aliases.get(nodeSeed.upstreamAlias)?.id ?? null
          : existingNodes.at(-1)?.id ?? null;

    if (nodeSeed.upstreamAlias && upstreamId === null) {
      throw new Error(`Case ${testCase.id} references missing upstreamAlias="${nodeSeed.upstreamAlias}"`);
    }

    const node = await seedNode(workflow.id, nodeSeed, upstreamId);

    if (!node?.id) {
      throw new Error(`Failed to seed node fixture for ${testCase.id}`);
    }

    existingNodes.push(node);
    if (nodeSeed.alias) {
      aliases.set(nodeSeed.alias, node);
    }
  }

  return {
    workflowId: workflow.id,
    workflowTitle,
    workflowType: workflowSeed.type,
    existingNodes,
    targetNodeId: resolveTargetNodeId(testCase, suite, existingNodes, aliases),
    beforeNodeIds: existingNodes.map((node) => node.id),
  } satisfies WorkflowFixture;
}

function formatReportDetail(report: TestReport) {
  return `Artifact: ${report.artifactPath}\nlookup: ${report.lookupDetail}\n\nstdout:\n${report.stdout}\n\nstderr:\n${report.stderr}`;
}

function assertTriggerCase(suite: SuiteRuntime, testCase: AgentCase, report: TestReport) {
  const detail = formatReportDetail(report);
  const workflow = report.workflow;

  expect(workflow, detail).not.toBeNull();
  expect(workflow?.type, detail).toBe(suite.type);
  expect(workflow?.enabled, detail).toBe(false);

  if (testCase.assert) {
    testCase.assert(report);
    return;
  }

  const config = (workflow?.config as Record<string, unknown> | null | undefined) ?? {};
  if (!testCase.placeholderExpected) {
    expectSubset(config, testCase.expectedConfig, detail);
  }
}

function assertNodeCase(suite: SuiteRuntime, testCase: AgentCase, report: TestReport) {
  const detail = formatReportDetail(report);
  const node = report.node;

  expect(report.workflow, detail).not.toBeNull();
  expect(node, detail).not.toBeNull();
  expect(node?.type, detail).toBe(suite.type);

  if (testCase.assert) {
    testCase.assert(report);
    return;
  }

  const config = (node?.config as Record<string, unknown> | null | undefined) ?? {};
  if (!testCase.placeholderExpected) {
    expectSubset(config, testCase.expectedConfig, detail);
  }
}

async function runTriggerCase(suite: SuiteRuntime, testCase: AgentCase, createdWorkflowIds: number[]) {
  const fixture = await createTriggerFixture(suite, testCase, createdWorkflowIds);
  const prompt = fixture
    ? [
        `当前环境中存在一个可操作 workflow：id=${fixture.workflowId}，title="${fixture.workflowTitle}"，type="${fixture.workflowType}"。`,
        testCase.prompt,
      ].join('\n\n')
    : testCase.prompt;
  const attempts: Array<Record<string, unknown>> = [];
  let finalWorkflow: WorkflowRecord | null = null;
  let finalLookupDetail = 'no attempts executed';
  let finalStdout = '';
  let finalStderr = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStartedAt = Date.now();
    const beforeWorkflows = await listRecentWorkflows(50);
    const beforeWorkflowIds = new Set(beforeWorkflows.map((workflow) => workflow.id));
    const { stdout, stderr, exitCode } = await runAgent(prompt);
    const operation = extractOperationResult(stdout);
    let workflow: WorkflowRecord | null = null;
    let lookupDetail = 'not found';

    if (testCase.scenario === 'edit' && fixture?.workflowId) {
      workflow = await fetchWorkflowWithRetry(fixture.workflowId);
      lookupDetail = `resolved by fixture workflow id=${fixture.workflowId}`;
    } else if (operation?.resource === 'workflow') {
      workflow = await fetchWorkflowWithRetry(operation.id);
      lookupDetail = `resolved by operation result id=${operation.id}`;
    }

    if (!workflow) {
      const recentWorkflows = await listRecentWorkflows(50);
      workflow = resolveCreatedWorkflowByDiff(recentWorkflows, beforeWorkflowIds, suite.type, attemptStartedAt);
      if (workflow?.id && !createdWorkflowIds.includes(workflow.id)) {
        createdWorkflowIds.push(workflow.id);
      }
      lookupDetail = workflow ? `resolved by workflow list diff id=${workflow.id}` : 'no workflow matched this attempt';
    }

    attempts.push({
      attempt,
      exitCode,
      stdout,
      stderr,
      operation,
      workflowId: workflow?.id ?? null,
      lookupDetail,
    });

    finalWorkflow = workflow;
    finalLookupDetail = lookupDetail;
    finalStdout = stdout;
    finalStderr = stderr;

    if (workflow) {
      break;
    }
  }

  const artifactPath = writeArtifact(suite.artifactDir, testCase, {
    prompt,
    attempts,
    workflow: finalWorkflow,
    lookupDetail: finalLookupDetail,
  });

  const report: TestReport = {
    artifactPath,
    attempts: attempts.length,
    stdout: finalStdout,
    stderr: finalStderr,
    workflow: finalWorkflow,
    node: null,
    lookupDetail: finalLookupDetail,
  };

  assertTriggerCase(suite, testCase, report);
}

async function runNodeCase(suite: SuiteRuntime, testCase: AgentCase, createdWorkflowIds: number[]) {
  const fixture = await createNodeFixture(suite, testCase, createdWorkflowIds);
  const nodeContext =
    fixture.existingNodes.length === 0
      ? '当前 workflow 中还没有节点。'
      : [
          '当前 workflow 中已存在以下节点：',
          ...fixture.existingNodes.map((node) => {
            return `- id=${node.id}, type=${node.type}, title="${node.title ?? ''}"${
              node.key ? `, key=${node.key}` : ''
            }`;
          }),
        ].join('\n');
  const promptLines = [
    `当前环境中存在一个可操作 workflow：id=${fixture.workflowId}，title="${fixture.workflowTitle}"，type="${fixture.workflowType}"。`,
    nodeContext,
  ];

  if (fixture.targetNodeId) {
    promptLines.push(`如需修改既有 "${suite.type}" 节点，请优先检查 id=${fixture.targetNodeId} 的节点。`);
  }

  promptLines.push(testCase.prompt);
  const prompt = promptLines.join('\n\n');
  const attempts: Array<Record<string, unknown>> = [];
  let finalWorkflow: WorkflowRecord | null = null;
  let finalNode: NodeRecord | null = null;
  let finalLookupDetail = 'no attempts executed';
  let finalStdout = '';
  let finalStderr = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { stdout, stderr, exitCode } = await runAgent(prompt);
    const operation = extractOperationResult(stdout);
    const workflow = await fetchWorkflowWithRetry(fixture.workflowId, ['nodes']);
    const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
    let node: NodeRecord | null = null;
    let lookupDetail = 'node not found';

    if (
      (testCase.resultNode ?? (testCase.scenario === 'create' ? 'new' : 'existing')) === 'existing' &&
      fixture.targetNodeId
    ) {
      node = await fetchNodeWithRetry(fixture.targetNodeId);
      lookupDetail = `resolved by existing node id=${fixture.targetNodeId}`;
    } else if (operation?.resource === 'node') {
      node = await fetchNodeWithRetry(operation.id);
      lookupDetail = `resolved by operation result id=${operation.id}`;
    }

    if (!node) {
      const beforeNodeIds = new Set(fixture.beforeNodeIds);
      node =
        [...nodes].reverse().find((candidate) => candidate.type === suite.type && !beforeNodeIds.has(candidate.id)) ??
        null;
      lookupDetail = node
        ? `resolved by workflow node diff id=${node.id}`
        : `no new "${suite.type}" node found under workflow ${fixture.workflowId}`;
    }

    attempts.push({
      attempt,
      exitCode,
      stdout,
      stderr,
      operation,
      workflowId: workflow?.id ?? null,
      nodeId: node?.id ?? null,
      lookupDetail,
    });

    finalWorkflow = workflow;
    finalNode = node;
    finalLookupDetail = lookupDetail;
    finalStdout = stdout;
    finalStderr = stderr;

    if (workflow && node) {
      break;
    }
  }

  const artifactPath = writeArtifact(suite.artifactDir, testCase, {
    prompt,
    attempts,
    workflow: finalWorkflow,
    node: finalNode,
    lookupDetail: finalLookupDetail,
  });

  const report: TestReport = {
    artifactPath,
    attempts: attempts.length,
    stdout: finalStdout,
    stderr: finalStderr,
    workflow: finalWorkflow,
    node: finalNode,
    lookupDetail: finalLookupDetail,
  };

  assertNodeCase(suite, testCase, report);
}

function createSuiteContext(
  suite: SuiteRuntime,
  describeTitle: string,
  runCase: (testCase: AgentCase, createdWorkflowIds: number[]) => Promise<void>,
): SuiteContext {
  const createdWorkflowIds: number[] = [];

  return {
    describeTitle,
    timeout: TIMEOUT,
    cleanup: async () => {
      while (createdWorkflowIds.length > 0) {
        const workflowId = createdWorkflowIds.pop();
        if (workflowId !== undefined) {
          await deleteWorkflow(workflowId);
        }
      }
    },
    runCase: (testCase: AgentCase) => () => runCase(testCase, createdWorkflowIds),
  };
}

export function createTriggerTestContext(definition: TriggerSuiteDefinition): SuiteContext {
  const suite: SuiteRuntime = {
    category: 'triggers',
    type: definition.type,
    artifactDir:
      definition.artifactDir ?? path.join(os.tmpdir(), 'nocobase-workflow-manage-evals', 'triggers', definition.type),
  };

  return createSuiteContext(
    suite,
    definition.describeTitle ?? `triggers: ${suite.type} agent integration`,
    (testCase, createdWorkflowIds) => runTriggerCase(suite, testCase, createdWorkflowIds),
  );
}

export function createNodeTestContext(definition: NodeSuiteDefinition): SuiteContext {
  const suite: SuiteRuntime = {
    category: 'nodes',
    type: definition.type,
    artifactDir:
      definition.artifactDir ?? path.join(os.tmpdir(), 'nocobase-workflow-manage-evals', 'nodes', definition.type),
    workflow: definition.workflow,
  };

  return createSuiteContext(
    suite,
    definition.describeTitle ?? `nodes: ${suite.type} agent integration`,
    (testCase, createdWorkflowIds) => runNodeCase(suite, testCase, createdWorkflowIds),
  );
}
