export const DEFAULT_RESOURCE_DATA = Object.freeze([
  Object.freeze({ id: 1, title: 'Sample task', name: 'Sample task' }),
]);

export const DEFAULT_SINGLE_RECORD_DATA = Object.freeze({
  id: 1,
  title: 'Sample task',
  name: 'Sample task',
});

export function parseRunJSRequestTarget(url) {
  const normalized = String(url ?? '').trim();
  if (!normalized || /^https?:\/\//i.test(normalized)) return null;
  const stripped = normalized
    .replace(/^\/+/, '')
    .replace(/^api\//i, '');

  if (stripped === 'auth:check') {
    return {
      kind: 'auth-check',
      normalized: stripped,
    };
  }

  const match = stripped.match(/^([A-Za-z0-9_.-]+):(list|get)$/);
  if (!match) return null;

  return {
    kind: 'resource-read',
    resourceName: match[1],
    action: match[2],
    normalized: stripped,
  };
}
