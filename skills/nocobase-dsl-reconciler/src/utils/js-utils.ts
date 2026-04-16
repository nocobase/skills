/**
 * JS code manipulation utilities for jsBlock/jsColumn/jsItem.
 */

/**
 * Ensure JS code has a standard header comment.
 */
export function ensureJsHeader(
  code: string,
  opts: { desc?: string; jsType?: string; coll?: string; fields?: string[] } = {},
): string {
  if (code.trim().startsWith('/**')) return code;

  const lines = ['/**'];
  if (opts.desc) lines.push(` * ${opts.desc}`);
  lines.push(' *');
  if (opts.jsType) lines.push(` * @type ${opts.jsType}`);
  if (opts.coll) lines.push(` * @collection ${opts.coll}`);
  if (opts.fields?.length) lines.push(` * @fields ${opts.fields.slice(0, 10).join(', ')}`);
  lines.push(' */');
  lines.push('');

  return lines.join('\n') + code;
}

/**
 * Replace TARGET_BLOCK_UID and __TABLE_UID__ in JS code with actual UID.
 */
export function replaceJsUids(
  code: string,
  blocksState: Record<string, { type?: string; uid?: string }>,
): string {
  // Find first table block UID
  const tableUid = Object.values(blocksState).find(b => b.type === 'table')?.uid;
  if (!tableUid) return code;

  // Replace TARGET_BLOCK_UID = 'old_uid'
  code = code.replace(
    /(TARGET_BLOCK_UID\s*=\s*['"])[a-z0-9_]{11,}(['"])/g,
    `$1${tableUid}$2`,
  );
  // Replace __TABLE_UID__ placeholder
  code = code.replaceAll('__TABLE_UID__', tableUid);

  return code;
}

/**
 * Strip NocoBase auto-generated header comment (/** @type JSBlockModel *​/).
 * Keeps headers that have real descriptions (non-@-only content).
 */
export function stripAutoHeader(code: string): string {
  const match = code.match(/^\/\*\*([\s\S]*?)\*\/\s*\n?/);
  if (!match) return code;

  // Check if header has any non-@ content
  const lines = match[1].split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim())
    .filter(l => l && !l.startsWith('@'));

  if (lines.length === 0) {
    // Pure auto-generated header — strip it + trim leading blank lines
    return code.slice(match[0].length).replace(/^\n+/, '');
  }
  return code;
}

/**
 * Extract description from JS code header comment.
 * Skips auto-generated annotations (@type, @collection, @fields).
 */
export function extractJsDesc(code: string): string {
  const headerMatch = code.match(/\/\*\*([\s\S]*?)\*\//);
  if (!headerMatch) return '';

  const lines = headerMatch[1].split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim())
    .filter(l => l && !l.startsWith('@'));

  return lines[0] || '';
}
