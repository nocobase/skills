export function parseCliArgs(argv, options = {}) {
  const args = { _: [] };
  const valueFlags = new Set(options.valueFlags || []);
  const booleanFlags = new Set(options.booleanFlags || []);
  const booleanValueFlags = new Set(options.booleanValueFlags || []);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    const hasValue = typeof next === 'string' && !next.startsWith('--');

    if (valueFlags.has(key)) {
      if (!hasValue) {
        throw new Error(`Missing value for --${key}.`);
      }
      args[key] = next;
      index += 1;
      continue;
    }

    if (booleanValueFlags.has(key)) {
      if (hasValue) {
        args[key] = next;
        index += 1;
        continue;
      }
      args[key] = true;
      continue;
    }

    if (booleanFlags.has(key)) {
      args[key] = true;
      continue;
    }

    if (hasValue) {
      args[key] = next;
      index += 1;
      continue;
    }

    args[key] = true;
  }

  return args;
}
