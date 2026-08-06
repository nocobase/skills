import assert from 'node:assert/strict';

function sortedKeys(value) {
  return Object.keys(value).sort();
}

export function parseJsonFences(markdown) {
  const blocks = [];
  for (const match of markdown.matchAll(/^```json\s*\r?\n([\s\S]*?)^```\s*$/gm)) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks;
}

export function findJsonObjectByExactKeys(markdown, expectedKeys, label, predicate = () => true) {
  const normalizedKeys = [...expectedKeys].sort();
  const matches = parseJsonFences(markdown).filter(
    (value) =>
      value &&
      !Array.isArray(value) &&
      typeof value === 'object' &&
      predicate(value) &&
      JSON.stringify(sortedKeys(value)) === JSON.stringify(normalizedKeys),
  );

  assert.equal(matches.length, 1, `${label} should have one JSON object with the exact documented keys`);
  return matches[0];
}
