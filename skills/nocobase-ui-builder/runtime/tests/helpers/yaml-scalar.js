import assert from 'node:assert/strict';

export function readYamlScalar(yamlText, key) {
  const lines = yamlText.split(/\r?\n/);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyPattern = new RegExp(`^(\\s*)${escapedKey}:\\s*(.*)$`);
  const keyIndex = lines.findIndex((line) => keyPattern.test(line));
  assert.notEqual(keyIndex, -1, `${key} should be present`);

  const [, keyIndent, rawValue] = lines[keyIndex].match(keyPattern);
  const quoted = rawValue.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (quoted) {
    return JSON.parse(`"${quoted[1]}"`);
  }

  const block = rawValue.match(/^\|([+-]?)$/);
  assert.ok(block, `${key} should be a double-quoted or literal block scalar`);

  const contentLines = [];
  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      contentLines.push('');
      continue;
    }

    const indent = line.match(/^\s*/)[0].length;
    if (indent <= keyIndent.length) {
      break;
    }
    contentLines.push(line);
  }

  const contentIndent = Math.min(
    ...contentLines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length),
  );
  assert.ok(Number.isFinite(contentIndent), `${key} block scalar should not be empty`);

  const value = contentLines.map((line) => line.slice(Math.min(contentIndent, line.length))).join('\n');
  return block[1] === '-' ? value.replace(/\n+$/, '') : `${value.replace(/\n+$/, '')}\n`;
}
