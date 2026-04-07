import { safeErrorMessage } from './utils.js';

function isIdentifierStart(char) {
  return /[A-Za-z_$]/.test(char || '');
}

function skipWhitespace(source, index) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  return cursor;
}

function previousSignificantChar(source, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
  return cursor >= 0 ? source[cursor] : '';
}

function maskSource(source) {
  const output = [];
  const stateStack = [{ mode: 'code' }];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
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
    if (state.mode === 'single-quote') {
      output.push(char === '\n' ? '\n' : ' ');
      if (state.escape) {
        state.escape = false;
        continue;
      }
      if (char === '\\') {
        state.escape = true;
        continue;
      }
      if (char === "'") stateStack.pop();
      continue;
    }
    if (state.mode === 'double-quote') {
      output.push(char === '\n' ? '\n' : ' ');
      if (state.escape) {
        state.escape = false;
        continue;
      }
      if (char === '\\') {
        state.escape = true;
        continue;
      }
      if (char === '"') stateStack.pop();
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

function hasLikelyJsx(source) {
  return /(^|[=(,:\[{\s]|return\s+|=>\s*)<[A-Za-z_$][\w$.:-]*(\s|\/?>)/m.test(source) || /(^|[=(,:\[{\s]|return\s+|=>\s*)<>/m.test(source);
}

function isLikelyJsxStart(source, index) {
  if (source[index] !== '<') return false;
  const next = source[index + 1];
  if (!(next === '>' || next === '/' || isIdentifierStart(next))) return false;
  const prev = previousSignificantChar(source, index);
  if (!prev) return true;
  if ('=([{,:;!?&|+-*%^~'.includes(prev)) return true;
  if (prev === '>') return true;
  if (prev === '\n') return true;
  const prefix = source.slice(Math.max(0, index - 16), index);
  return /\breturn\s*$/.test(prefix) || /=>\s*$/.test(prefix);
}

function skipQuotedLiteral(source, index) {
  const quote = source[index];
  if (!quote || ![`'`, `"`, '`'].includes(quote)) return index;
  let cursor = index + 1;
  let escape = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (escape) {
      escape = false;
      cursor += 1;
      continue;
    }
    if (char === '\\') {
      escape = true;
      cursor += 1;
      continue;
    }
    if (quote === '`' && char === '$' && source[cursor + 1] === '{') {
      cursor = findMatchingToken(source, cursor + 1, '{', '}') + 1;
      continue;
    }
    if (char === quote) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function findMatchingToken(source, index, openChar, closeChar) {
  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    const next = source[cursor + 1];
    if (char === "'" || char === '"' || char === '`') {
      cursor = skipQuotedLiteral(source, cursor) - 1;
      continue;
    }
    if (char === '/' && next === '/') {
      cursor += 2;
      while (cursor < source.length && source[cursor] !== '\n') cursor += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      cursor += 2;
      while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) cursor += 1;
      cursor += 1;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function parseJsxName(source, index) {
  let cursor = index;
  while (cursor < source.length) {
    const char = source[cursor];
    if (/[A-Za-z0-9_$:-]/.test(char) || char === '.') {
      cursor += 1;
      continue;
    }
    break;
  }
  if (cursor === index) return null;
  return {
    name: source.slice(index, cursor),
    end: cursor,
  };
}

function normalizeJsxText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ');
  if (!normalized.trim()) return null;
  return normalized;
}

function formatObjectKey(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function formatTagExpression(name) {
  if (!name) return '__nbJsxFragment';
  if (/^[a-z]/.test(name) || name.includes('-') || name.includes(':')) {
    return JSON.stringify(name);
  }
  return name;
}

function transformEmbeddedExpression(source) {
  const { code } = transformJsx(source);
  return code.trim();
}

function parseJsxAttributeValue(source, index) {
  const char = source[index];
  if (char === "'" || char === '"') {
    const end = skipQuotedLiteral(source, index);
    return {
      code: source.slice(index, end),
      end,
    };
  }
  if (char === '{') {
    const end = findMatchingToken(source, index, '{', '}');
    if (end < 0) throw new Error('Unterminated JSX attribute expression.');
    const expression = source.slice(index + 1, end);
    const transformed = transformEmbeddedExpression(expression);
    return {
      code: transformed ? `(${transformed})` : 'undefined',
      end: end + 1,
    };
  }
  let cursor = index;
  while (cursor < source.length && !/[\s/>]/.test(source[cursor])) cursor += 1;
  return {
    code: JSON.stringify(source.slice(index, cursor)),
    end: cursor,
  };
}

function buildPropsCode(entries) {
  if (!entries.length) return 'null';
  return `({ ${entries
    .map((entry) =>
      entry.kind === 'spread' ? `...(${entry.code || '{}' })` : `${formatObjectKey(entry.name)}: ${entry.value}`,
    )
    .join(', ')} })`;
}

function buildJsxCall(typeExpression, propsCode, children) {
  const args = [typeExpression, propsCode];
  for (const child of children) args.push(child);
  return `__nbJsx(${args.join(', ')})`;
}

function parseJsxElement(source, masked, index) {
  let cursor = index + 1;
  let tagName = '';
  let typeExpression = '__nbJsxFragment';
  if (source[cursor] !== '>') {
    const tag = parseJsxName(source, cursor);
    if (!tag) return null;
    tagName = tag.name;
    typeExpression = formatTagExpression(tag.name);
    cursor = tag.end;
  } else {
    cursor += 1;
  }

  const attributes = [];
  let selfClosing = false;
  while (cursor < source.length) {
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] === '/' && source[cursor + 1] === '>') {
      selfClosing = true;
      cursor += 2;
      break;
    }
    if (source[cursor] === '>') {
      cursor += 1;
      break;
    }
    if (source[cursor] === '{') {
      const end = findMatchingToken(source, cursor, '{', '}');
      if (end < 0) throw new Error('Unterminated JSX spread attribute.');
      const expression = source.slice(cursor + 1, end).trim();
      if (!expression.startsWith('...')) {
        throw new Error('Unexpected JSX expression inside opening tag.');
      }
      attributes.push({
        kind: 'spread',
        code: transformEmbeddedExpression(expression.slice(3)),
      });
      cursor = end + 1;
      continue;
    }

    const attribute = parseJsxName(source, cursor);
    if (!attribute) {
      throw new Error(`Invalid JSX attribute near "${source.slice(cursor, cursor + 12)}".`);
    }
    cursor = attribute.end;
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] === '=') {
      cursor = skipWhitespace(source, cursor + 1);
      const value = parseJsxAttributeValue(source, cursor);
      attributes.push({
        kind: 'attr',
        name: attribute.name,
        value: value.code,
      });
      cursor = value.end;
      continue;
    }
    attributes.push({
      kind: 'attr',
      name: attribute.name,
      value: 'true',
    });
  }

  if (selfClosing) {
    return {
      code: buildJsxCall(typeExpression, buildPropsCode(attributes), []),
      end: cursor,
    };
  }

  const children = [];
  while (cursor < source.length) {
    if (source[cursor] === '<' && source[cursor + 1] === '/') {
      cursor += 2;
      let closingName = '';
      if (source[cursor] !== '>') {
        const closing = parseJsxName(source, cursor);
        if (!closing) throw new Error('Invalid JSX closing tag.');
        closingName = closing.name;
        cursor = closing.end;
      }
      cursor = skipWhitespace(source, cursor);
      if (source[cursor] !== '>') throw new Error('Invalid JSX closing tag terminator.');
      cursor += 1;
      if (closingName !== tagName) {
        throw new Error(`Mismatched JSX closing tag: expected "${tagName || 'fragment'}" but received "${closingName || 'fragment'}".`);
      }
      return {
        code: buildJsxCall(typeExpression, buildPropsCode(attributes), children),
        end: cursor,
      };
    }

    if (source[cursor] === '<' && isLikelyJsxStart(masked, cursor)) {
      const child = parseJsxElement(source, masked, cursor);
      if (!child) throw new Error('Failed to parse nested JSX element.');
      children.push(child.code);
      cursor = child.end;
      continue;
    }

    if (source[cursor] === '{') {
      const end = findMatchingToken(source, cursor, '{', '}');
      if (end < 0) throw new Error('Unterminated JSX child expression.');
      const expression = transformEmbeddedExpression(source.slice(cursor + 1, end));
      if (expression && !/^\/\*[\s\S]*\*\/$/.test(expression)) {
        children.push(`(${expression})`);
      }
      cursor = end + 1;
      continue;
    }

    let next = cursor;
    while (next < source.length) {
      if (source[next] === '{') break;
      if (source[next] === '<' && (source[next + 1] === '/' || isLikelyJsxStart(masked, next))) break;
      next += 1;
    }
    const text = normalizeJsxText(source.slice(cursor, next));
    if (text) children.push(JSON.stringify(text));
    cursor = next;
  }

  throw new Error(`Unterminated JSX element "${tagName || 'fragment'}".`);
}

export function transformJsx(code) {
  const source = String(code ?? '');
  const masked = maskSource(source);
  if (!hasLikelyJsx(masked)) {
    return {
      code: source,
      transformed: false,
    };
  }

  try {
    let output = '';
    let cursor = 0;
    while (cursor < source.length) {
      if (masked[cursor] === '<' && isLikelyJsxStart(masked, cursor)) {
        const parsed = parseJsxElement(source, masked, cursor);
        if (parsed) {
          output += parsed.code;
          cursor = parsed.end;
          continue;
        }
      }
      output += source[cursor];
      cursor += 1;
    }
    return {
      code: output,
      transformed: output !== source,
    };
  } catch (error) {
    return {
      code: source,
      transformed: false,
      compileIssues: [
        {
          type: 'syntax',
          severity: 'error',
          ruleId: 'jsx-transform-error',
          message: safeErrorMessage(error),
        },
      ],
    };
  }
}
