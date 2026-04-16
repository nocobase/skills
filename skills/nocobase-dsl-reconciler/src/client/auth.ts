import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface AuthResult {
  token?: string;
  baseUrl?: string;  // discovered from MCP config
}

/**
 * Resolve NocoBase authentication.
 * Priority: env token → MCP config → signIn credentials.
 * Returns token if found, or throws with setup instructions.
 */
export function resolveToken(): AuthResult {
  // 1. Direct token from env
  const token = process.env.NOCOBASE_API_TOKEN || process.env.NB_TOKEN;
  if (token) return { token };

  // 2. Try MCP config files
  const mcp = findMcpToken();
  if (mcp.token) return mcp;

  return {};
}

export function resolveCredentials(): { account: string; password: string } {
  const account = process.env.NB_USER || '';
  const password = process.env.NB_PASSWORD || '';
  if (!account || !password) {
    throw new Error(
      'No NocoBase credentials found. Set one of:\n'
      + '  1. NOCOBASE_API_TOKEN env var (API key)\n'
      + '  2. NB_USER + NB_PASSWORD env vars\n'
      + '  3. Configure NocoBase MCP server (claude mcp add nocobase ...)\n'
    );
  }
  return { account, password };
}

function findMcpToken(): AuthResult {
  const home = os.homedir();
  const configPaths = [
    path.join(home, '.claude', 'settings.json'),
    path.join(home, '.claude', 'settings.local.json'),
    '.mcp.json',
    path.join(home, '.kimi', 'mcp.json'),
  ];

  for (const cfgPath of configPaths) {
    try {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const cfg = JSON.parse(raw);
      const servers: Record<string, Record<string, unknown>> = cfg.mcpServers || cfg;

      for (const [name, sv] of Object.entries(servers)) {
        if (!name.toLowerCase().includes('nocobase')) continue;

        // Check headers for Bearer token
        const headers = (sv.headers || []) as string[];
        for (const h of headers) {
          if (typeof h === 'string' && h.toLowerCase().includes('bearer')) {
            const token = h.split('Bearer ').pop()?.trim();
            if (token) {
              const url = (sv.url as string || '').replace('/api/mcp', '').replace(/\/$/, '');
              return { token, baseUrl: url || undefined };
            }
          }
        }

        // Extract base URL even without token
        const url = sv.url as string;
        if (url) {
          const baseUrl = url.replace('/api/mcp', '').replace(/\/$/, '');
          return { baseUrl };
        }
      }
    } catch {
      // config file doesn't exist or isn't valid JSON
    }
  }

  return {};
}
