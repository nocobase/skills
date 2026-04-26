import dotenv from 'dotenv';
import path from 'node:path';

const SKILLS_ENV_FILE = path.resolve(__dirname, '../../../../../.env.test');

dotenv.config({ path: SKILLS_ENV_FILE, override: false });

export interface WorkflowRecord extends Record<string, unknown> {
  id: number;
  key?: string;
  type?: string;
  title?: string;
  sync?: boolean;
  enabled?: boolean;
  config?: Record<string, unknown>;
  nodes?: NodeRecord[];
}

export interface NodeRecord extends Record<string, unknown> {
  id: number;
  key?: string;
  workflowId?: number;
  title?: string;
  type?: string;
  upstreamId?: number | null;
  branchIndex?: number | null;
  config?: Record<string, unknown>;
}

export interface OperationResult {
  resource: 'workflow' | 'node';
  action: 'created' | 'updated' | 'deleted';
  id: number;
  key?: string;
  config: Record<string, unknown>;
}

export function extractOperationResult(output: string): OperationResult | null {
  const normalized = output.replace(/\r\n/g, '\n');
  const fencedMatch = normalized.match(/```(?:json)?\s*\n\[OPERATION_RESULT\]\s*\n([\s\S]*?)\n```/);
  const inlineMatch = normalized.match(/\[OPERATION_RESULT\]\s*\n([\s\S]*?)(?=\n(?:\[|```)|$)/);
  const match = fencedMatch ?? inlineMatch;
  if (!match) return null;

  const json = match[1].trim();

  try {
    return JSON.parse(json) as OperationResult;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
}

async function requestJson<T>(pathname: string, { method = 'GET', body }: RequestOptions = {}): Promise<T | null> {
  const url = process.env.NOCOBASE_URL;
  const token = process.env.NOCOBASE_API_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { data?: T };
  return payload.data ?? null;
}

export async function fetchWorkflow(id: number, options?: { appends?: string[] }): Promise<WorkflowRecord | null> {
  const searchParams = new URLSearchParams({ filterByTk: String(id) });

  for (const append of options?.appends ?? []) {
    searchParams.append('appends[]', append);
  }

  return requestJson<WorkflowRecord>(`/api/workflows:get?${searchParams.toString()}`);
}

export async function listRecentWorkflows(pageSize = 20): Promise<WorkflowRecord[]> {
  return (await requestJson<WorkflowRecord[]>(`/api/workflows:list?pageSize=${pageSize}&sort=-createdAt`)) ?? [];
}

export async function fetchNode(id: number): Promise<NodeRecord | null> {
  return requestJson<NodeRecord>(`/api/flow_nodes:get?filterByTk=${id}`);
}

export async function deleteWorkflow(id: number): Promise<void> {
  await requestJson(`/api/workflows:destroy?filterByTk=${id}`, {
    method: 'POST',
  });
}
