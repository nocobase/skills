function isIdentifierPart(char) {
  return /[\w$]/.test(char || '');
}

function previousSignificantToken(source, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
  if (cursor < 0) {
    return { type: 'start', value: '' };
  }

  if (isIdentifierPart(source[cursor])) {
    let start = cursor;
    while (start > 0 && isIdentifierPart(source[start - 1])) start -= 1;
    return {
      type: 'word',
      value: source.slice(start, cursor + 1),
    };
  }

  return {
    type: 'char',
    value: source[cursor],
  };
}

const REGEX_PREFIX_KEYWORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

const REGEX_PREFIX_CHARS = new Set([
  '(',
  '[',
  '{',
  ',',
  ';',
  ':',
  '=',
  '!',
  '?',
  '~',
  '*',
  '%',
  '^',
  '&',
  '|',
  '<',
  '>',
]);

function shouldStartRegexLiteral(source, index) {
  if (!source[index + 1]) return false;
  const previous = previousSignificantToken(source, index);
  if (previous.type === 'start') return true;
  if (previous.type === 'word') {
    return REGEX_PREFIX_KEYWORDS.has(previous.value);
  }
  return REGEX_PREFIX_CHARS.has(previous.value);
}

export function maskJavaScriptSource(source) {
  const input = String(source ?? '');
  const output = [];
  const stateStack = [{ mode: 'code' }];

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    const state = stateStack[stateStack.length - 1];

    if (state.mode === 'line-comment') {
      output.push(char === '\n' ? '\n' : ' ');
      if (char === '\n') stateStack.pop();
      continue;
    }
    if (state.mode === 'block-comment') {
      output.push(char === '\n' ? '\n' : ' ');
      if (char === '*' && next === '/') {
        output.push(' ');
        index += 1;
        stateStack.pop();
      }
      continue;
    }
    if (state.mode === 'single-quote' || state.mode === 'double-quote') {
      output.push(char === '\n' ? '\n' : ' ');
      if (state.escape) {
        state.escape = false;
        continue;
      }
      if (char === '\\') {
        state.escape = true;
        continue;
      }
      if ((state.mode === 'single-quote' && char === "'") || (state.mode === 'double-quote' && char === '"')) {
        stateStack.pop();
      }
      continue;
    }
    if (state.mode === 'template') {
      if (state.escape) {
        output.push(char === '\n' ? '\n' : ' ');
        state.escape = false;
        continue;
      }
      if (char === '\\') {
        output.push(' ');
        state.escape = true;
        continue;
      }
      if (char === '`') {
        output.push(' ');
        stateStack.pop();
        continue;
      }
      if (char === '$' && next === '{') {
        output.push('$');
        output.push('{');
        index += 1;
        stateStack.push({ mode: 'template-expression', braceDepth: 1 });
        continue;
      }
      output.push(char === '\n' ? '\n' : ' ');
      continue;
    }
    if (state.mode === 'regex') {
      output.push(char === '\n' ? '\n' : ' ');
      if (state.escape) {
        state.escape = false;
        continue;
      }
      if (char === '\\') {
        state.escape = true;
        continue;
      }
      if (char === '[' && !state.charClass) {
        state.charClass = true;
        continue;
      }
      if (char === ']' && state.charClass) {
        state.charClass = false;
        continue;
      }
      if (char === '/' && !state.charClass) {
        stateStack.pop();
        stateStack.push({ mode: 'regex-flags' });
      }
      continue;
    }
    if (state.mode === 'regex-flags') {
      if (/[A-Za-z]/.test(char)) {
        output.push(' ');
        continue;
      }
      stateStack.pop();
      index -= 1;
      continue;
    }

    if (char === '/' && next === '/') {
      output.push(' ');
      output.push(' ');
      index += 1;
      stateStack.push({ mode: 'line-comment' });
      continue;
    }
    if (char === '/' && next === '*') {
      output.push(' ');
      output.push(' ');
      index += 1;
      stateStack.push({ mode: 'block-comment' });
      continue;
    }
    if (char === '/' && shouldStartRegexLiteral(input, index)) {
      output.push(' ');
      stateStack.push({ mode: 'regex', escape: false, charClass: false });
      continue;
    }
    if (char === "'") {
      output.push(' ');
      stateStack.push({ mode: 'single-quote', escape: false });
      continue;
    }
    if (char === '"') {
      output.push(' ');
      stateStack.push({ mode: 'double-quote', escape: false });
      continue;
    }
    if (char === '`') {
      output.push(' ');
      stateStack.push({ mode: 'template', escape: false });
      continue;
    }
    if (state.mode === 'template-expression') {
      if (char === '{') {
        state.braceDepth += 1;
        output.push('{');
        continue;
      }
      if (char === '}') {
        state.braceDepth -= 1;
        output.push('}');
        if (state.braceDepth === 0) stateStack.pop();
        continue;
      }
    }
    output.push(char);
  }

  return output.join('');
}
