/**
 * Stable spec hashing — deterministic fingerprint of a DSL object so we can
 * skip blocks/pages whose declared spec hasn't changed since the last deploy.
 *
 * Keys are sorted at every nesting level, JS file references are replaced with
 * the file's content hash so edits to linked JS trigger a redeploy.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

/** Recursively sort object keys and replace undefined with nulls → stable JSON. */
function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = normalize((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** sha256 of normalized JSON, hex-encoded, first 16 chars. */
export function hashSpec(spec: unknown): string {
  const json = JSON.stringify(normalize(spec));
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/** Hash a block spec together with the contents of any referenced JS files,
 * so edits to the .js file itself trigger a redeploy. baseDir is the page
 * directory (js_items[*].file is resolved relative to it). */
export function hashBlockSpec(spec: Record<string, unknown>, baseDir: string): string {
  const enriched: Record<string, unknown> = { ...spec };
  // Replace JS file references with their content hash
  for (const key of ['js_items', 'js_columns']) {
    const list = spec[key];
    if (!Array.isArray(list)) continue;
    enriched[key] = list.map((item: Record<string, unknown>) => {
      const copy = { ...item };
      const file = item.file as string | undefined;
      if (file && typeof file === 'string') {
        try {
          const abs = path.resolve(baseDir, file);
          const content = fs.readFileSync(abs, 'utf8');
          copy.file = `hash:${createHash('sha256').update(content).digest('hex').slice(0, 12)}`;
        } catch { /* missing file — hash remains the filename */ }
      }
      return copy;
    });
  }
  return hashSpec(enriched);
}
