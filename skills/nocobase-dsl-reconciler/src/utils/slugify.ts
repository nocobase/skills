/**
 * Convert string to safe slug (lowercase, underscores).
 */
export function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_|_$/g, '') || 'item';
}
