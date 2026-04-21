/**
 * Execute raw SQL against the same Postgres NocoBase uses.
 *
 * Why direct DB access (not via NB API)? NB doesn't expose a generic
 * DDL/DML endpoint — `sqlReports` is meant for SELECT charts. Triggers,
 * functions and db-level constraints need real DDL. We take the same
 * NB_DB_* env vars NocoBase reads, so config is one place.
 */
import { spawnSync } from 'node:child_process';

interface Conn {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function readConn(): Conn {
  // Defaults match the dev-time NocoBase docker-compose.
  return {
    host: process.env.NB_DB_HOST || process.env.PGHOST || 'localhost',
    port: process.env.NB_DB_PORT || process.env.PGPORT || '5432',
    user: process.env.NB_DB_USER || process.env.PGUSER || 'nocobase',
    password: process.env.NB_DB_PASSWORD || process.env.PGPASSWORD || 'nocobase',
    database: process.env.NB_DB_NAME || process.env.PGDATABASE || 'nocobase',
  };
}

/** Run a SQL string against NB's database. Returns stdout on success or
 *  throws with the stderr message on failure. */
export function execSql(sql: string, opts: { select?: boolean } = {}): string {
  const c = readConn();
  const args = [
    '-h', c.host, '-p', c.port, '-U', c.user, '-d', c.database,
    '-v', 'ON_ERROR_STOP=1',
    '-c', sql,
  ];
  // For SELECT use tuple-only + unaligned. Caller is expected to use
  // queries that return ONE column (most common), or to handle the |
  // field separator themselves. Avoid NUL — Node spawnSync rejects it
  // in args.
  if (opts.select) args.push('-t', '-A');
  else args.push('-q');
  const r = spawnSync('psql', args, {
    env: { ...process.env, PGPASSWORD: c.password },
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').toString().trim();
    throw new Error(`psql failed: ${msg.slice(0, 400)}`);
  }
  return (r.stdout || '').toString();
}

/** For single-column queries: returns the raw value (may be multi-line).
 *  Trim trailing newline only. */
export function singleValue(out: string): string {
  return out.replace(/\n+$/, '');
}

/** Drop a named SQL object (trigger / function / view / constraint) idempotently.
 *  Tries common DROP forms in sequence. Used before re-applying a CREATE so
 *  the deploy is rerunnable. Errors are swallowed — drop-if-exists semantics. */
export function dropSqlObject(name: string, table?: string, kind?: string): void {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, '');
  const safeTable = table ? table.replace(/[^a-zA-Z0-9_]/g, '') : '';
  const drops: string[] = [];
  if (kind === 'trigger' || !kind) {
    if (safeTable) drops.push(`DROP TRIGGER IF EXISTS ${safeName} ON ${safeTable} CASCADE`);
  }
  if (kind === 'function' || !kind) {
    drops.push(`DROP FUNCTION IF EXISTS ${safeName} CASCADE`);
  }
  if (kind === 'view') drops.push(`DROP VIEW IF EXISTS ${safeName} CASCADE`);
  if (kind === 'index') drops.push(`DROP INDEX IF EXISTS ${safeName} CASCADE`);
  for (const d of drops) {
    try { execSql(d); } catch { /* ignore — best effort */ }
  }
}
