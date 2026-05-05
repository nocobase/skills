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

    const equalIndex = token.indexOf('=');
    const hasInlineValue = equalIndex > 2;
    const key = hasInlineValue ? token.slice(2, equalIndex) : token.slice(2);
    const inlineValue = hasInlineValue ? token.slice(equalIndex + 1) : undefined;
    const next = argv[index + 1];
    const hasNextValue = typeof next === 'string' && !next.startsWith('--');
    const hasValue = hasInlineValue || hasNextValue;
    const value = hasInlineValue ? inlineValue : next;

    if (valueFlags.has(key)) {
      if (!hasValue) {
        throw new Error(`Missing value for --${key}.`);
      }
      args[key] = value;
      if (!hasInlineValue) index += 1;
      continue;
    }

    if (booleanValueFlags.has(key)) {
      if (hasInlineValue) {
        args[key] = inlineValue;
        continue;
      }
      if (hasNextValue) {
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
      args[key] = value;
      if (!hasInlineValue) index += 1;
      continue;
    }

    args[key] = true;
  }

  return args;
}
