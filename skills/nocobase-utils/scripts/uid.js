let IDX = 36;
let HEX = '';

while (IDX--) HEX += IDX.toString(36);

export function uid(len = 11) {
  let str = '';
  let num = len;

  while (num--) str += HEX[(Math.random() * 36) | 0];

  return str;
}

function parseLength(value) {
  if (value == null) return 11;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid uid length: ${value}`);
  }

  return parsed;
}

if (process.argv[1]?.endsWith('/uid.js')) {
  const len = parseLength(process.argv[2]);
  console.log(uid(len));
}
