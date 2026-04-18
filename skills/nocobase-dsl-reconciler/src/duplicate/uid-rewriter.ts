/**
 * UID remapping primitives for duplicate-project.
 *
 * Pure functions — no disk / NB. The duplicate pipeline runs two passes:
 *   1. `collectUids(yaml, map)` to enumerate every UID value in every
 *      YAML file (keyed by UID_KEYS) and mint a new UID for each
 *   2. `rewriteUids(yaml, map)` to emit a new tree with the remapped
 *      values — walks strings recursively so JS placeholders + URLs
 *      that embed a UID as a substring also get rewritten
 *
 * `looksLikeUid` is the shape detector used during collect (rejects
 * plain field names so we don't accidentally rename `currency` to a
 * new UID).
 *
 * `rewriteString` is the string-level rewrite: only literal content is
 * rewritten; {{template expressions}} are preserved verbatim so URLs
 * like `/admin/<uid>/filterbytk/{{ctx.record.id}}` roundtrip correctly.
 */
import { generateUid } from '../utils/uid';

/** Field names whose values are flowModel UIDs that must be remapped. */
export const UID_KEYS = new Set([
  'uid', 'targetUid', 'popupTemplateUid', 'templateUid',
  'route_id', 'page_uid', 'tab_uid', 'grid_uid', 'schema_uid',
  'popup_grid', 'popup_page', 'popup_tab', 'parent_uid',
  'wrapper', 'field', 'modelUid', 'group_id', 'block_uid',
  'host_uid',
]);

/** UID-shaped value detector.
 *
 * NocoBase generateUid produces 11-char base36 strings with at least one digit
 * (`Math.random().toString(36)` always seeds with a `0.` digit prefix). Field
 * names like `currency` or `priority` are 8 lowercase letters with NO digits —
 * we MUST exclude those, otherwise rewriteString would mangle field names
 * across the project. Require at least one digit to avoid that false positive.
 */
export function looksLikeUid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Numeric route_id (Postgres bigserial)
  if (/^\d{10,}$/.test(value)) return true;
  // 8-12 char base36, must contain at least one digit (rules out plain words)
  if (/^[a-z0-9]{8,12}$/.test(value) && /\d/.test(value)) return true;
  return false;
}

/** Mint a new UID that matches the shape of the old one. */
export function mintUid(oldUid: string): string {
  if (/^\d+$/.test(oldUid)) {
    // Numeric route_id — generate a numeric pseudo-id with similar length.
    // Real route IDs come from NB's auto-increment; here we use timestamp + random
    // and let deploy overwrite via the create-route path.
    return String(Date.now()) + Math.floor(Math.random() * 1000);
  }
  return generateUid();
}

/** Collect all UIDs that appear as values of UID_KEYS, mint new UIDs. */
export function collectUids(obj: unknown, map: Map<string, string>): void {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    for (const x of obj) collectUids(x, map);
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (UID_KEYS.has(k) && looksLikeUid(v)) {
        const oldUid = String(v);
        if (!map.has(oldUid)) map.set(oldUid, mintUid(oldUid));
      }
      collectUids(v, map);
    }
  }
}

/** Rewrite the tree, replacing UIDs in known keys via the map. Strings inside
 *  string values (e.g. JS UID placeholders, /admin/<uid> URLs) are also
 *  rewritten — they often embed UIDs as plain substrings. */
export function rewriteUids(obj: unknown, map: Map<string, string>): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return rewriteString(obj, map);
  if (Array.isArray(obj)) return obj.map(x => rewriteUids(x, map));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (UID_KEYS.has(k) && typeof v === 'string' && map.has(v)) {
        out[k] = map.get(v);
      } else if (UID_KEYS.has(k) && typeof v === 'number' && map.has(String(v))) {
        // Numeric route_id stored as number
        out[k] = Number(map.get(String(v)));
      } else {
        out[k] = rewriteUids(v, map);
      }
    }
    return out;
  }
  return obj;
}

/** Replace UID substrings inside arbitrary string values. Strings with
 *  template expressions (`{{...}}`) ARE processed — only the literal
 *  expression body is preserved verbatim while UIDs in the surrounding
 *  text get rewritten. Without this, action URLs like
 *    admin/<page-uid>/view/<block-uid>/filterbytk/{{ctx.record.id}}
 *  would skip rewriting (the early `if (s.includes('{{'))` bail-out), and
 *  a duplicated project's "Detail" buttons would jump back to the
 *  source's pages. */
export function rewriteString(s: string, map: Map<string, string>): string {
  if (!s) return s;
  // Pure template expression with no surrounding text → no UIDs to remap.
  if (/^\s*\{\{[\s\S]*\}\}\s*$/.test(s)) return s;
  // Split into [text, expr, text, expr, ...] segments so we only rewrite
  // outside `{{...}}` blocks. Keeps things like {{ ctx.record.id }} intact
  // even when ctx happens to contain an alphanumeric run that collides
  // with a UID in the map.
  const parts = s.split(/(\{\{[\s\S]*?\}\})/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue;  // odd indices are expression bodies
    let segment = parts[i];
    for (const [oldUid, newUid] of map) {
      if (segment.includes(oldUid)) segment = segment.split(oldUid).join(newUid);
    }
    parts[i] = segment;
  }
  return parts.join('');
}
