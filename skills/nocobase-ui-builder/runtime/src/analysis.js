import vm from 'node:vm';
import { getAllowedContextPaths, getFlattenedContract, getRootBehaviors } from './profiles.js';
import { collectCompiledRunJSSemantics } from './runjs-parser.js';
import { maskJavaScriptSource } from './source-mask.js';
import { compileUserCode as compileUserCodeImpl } from './user-code.js';
import { safeErrorMessage } from './utils.js';

const STATIC_BLOCKED_COMPAT_CALLS = new Set([
  'importAsync',
  'requireAsync',
  'loadCSS',
  'openView',
  'viewer.popover',
  'viewer.dialog',
  'viewer.drawer',
]);
const STATIC_BLOCKED_GLOBAL_CALLS = new Set([
  'fetch',
  'Function',
  'eval',
  'globalThis.fetch',
  'globalThis.Function',
  'globalThis.eval',
  'open',
  'window.open',
  'window.fetch',
  'window.Function',
  'window.eval',
  'document.defaultView.open',
  'document.defaultView.fetch',
  'document.defaultView.Function',
  'document.defaultView.eval',
  'location.assign',
  'location.replace',
  'location.reload',
  'document.location.assign',
  'document.location.replace',
  'document.location.reload',
  'document.defaultView.location.assign',
  'document.defaultView.location.replace',
  'document.defaultView.location.reload',
  'window.location.assign',
  'window.location.replace',
  'window.location.reload',
  'history.pushState',
  'history.replaceState',
  'history.go',
  'history.back',
  'history.forward',
  'document.defaultView.history.pushState',
  'document.defaultView.history.replaceState',
  'document.defaultView.history.go',
  'document.defaultView.history.back',
  'document.defaultView.history.forward',
  'window.history.pushState',
  'window.history.replaceState',
  'window.history.go',
  'window.history.back',
  'window.history.forward',
]);
const STATIC_BLOCKED_LOCATION_ASSIGNMENTS = new Set([
  'location',
  'window.location',
  'document.location',
  'location.href',
  'location.hash',
  'location.host',
  'location.hostname',
  'location.pathname',
  'location.port',
  'location.protocol',
  'location.search',
  'document.location.href',
  'document.location.hash',
  'document.location.host',
  'document.location.hostname',
  'document.location.pathname',
  'document.location.port',
  'document.location.protocol',
  'document.location.search',
  'document.defaultView.location',
  'document.defaultView.location.href',
  'document.defaultView.location.hash',
  'document.defaultView.location.host',
  'document.defaultView.location.hostname',
  'document.defaultView.location.pathname',
  'document.defaultView.location.port',
  'document.defaultView.location.protocol',
  'document.defaultView.location.search',
  'window.location.href',
  'window.location.hash',
  'window.location.host',
  'window.location.hostname',
  'window.location.pathname',
  'window.location.port',
  'window.location.protocol',
  'window.location.search',
]);
const UNSUPPORTED_TOP_LEVEL_IDENTIFIERS = new Set(['React', 'ReactDOM', 'antd', 'antdIcons']);
const GLOBAL_ROOT_IDENTIFIERS = new Set(['window', 'location', 'history', 'document', 'open', 'fetch', 'Function', 'eval', 'globalThis']);

function isBlockedDynamicCodeGenerationChain(chain) {
  const segments = chain?.segments || [];
  return segments.length >= 2 && segments.at(-1) === 'constructor' && segments.at(-2) === 'constructor';
}

function createLocator(source) {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') lineStarts.push(index + 1);
  }
  return (index) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= index) {
        if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > index) {
          return { line: mid + 1, column: index - lineStarts[mid] + 1 };
        }
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return undefined;
  };
}

function createStaticIssue(type, severity, ruleId, message, location) {
  return {
    type,
    severity,
    ruleId,
    message,
    location,
  };
}

function isIdentifierStart(char) {
  return /[A-Za-z_$]/.test(char || '');
}

function isIdentifierPart(char) {
  return /[\w$]/.test(char || '');
}

function skipWhitespace(source, index) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  return cursor;
}

function readIdentifier(source, index) {
  if (!isIdentifierStart(source[index])) return null;
  let cursor = index + 1;
  while (cursor < source.length && isIdentifierPart(source[cursor])) cursor += 1;
  return {
    value: source.slice(index, cursor),
    end: cursor,
  };
}

function maskSource(source) {
  return maskJavaScriptSource(source);
}

function parseStringLiteral(source, index) {
  const quote = source[index];
  if (quote !== '"' && quote !== "'") return null;
  let cursor = index + 1;
  let value = '';
  let escape = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (escape) {
      value += char;
      escape = false;
      cursor += 1;
      continue;
    }
    if (char === '\\') {
      escape = true;
      cursor += 1;
      continue;
    }
    if (char === quote) {
      return {
        value,
        end: cursor + 1,
      };
    }
    value += char;
    cursor += 1;
  }
  return null;
}

function findMatchingBracket(source, index, openChar, closeChar) {
  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function parseChain(source, index) {
  const identifier = readIdentifier(source, index);
  if (!identifier) return null;
  const segments = [identifier.value];
  let cursor = identifier.end;
  let dynamicComputed = false;

  while (cursor < source.length) {
    const before = skipWhitespace(source, cursor);
    if (source[before] === '?' && source[before + 1] === '.') {
      cursor = before + 2;
    } else if (source[before] === '.') {
      cursor = before + 1;
    } else if (source[before] === '[') {
      let inner = skipWhitespace(source, before + 1);
      const stringLiteral = parseStringLiteral(source, inner);
      if (!stringLiteral) {
        dynamicComputed = true;
        const bracketEnd = findMatchingBracket(source, before, '[', ']');
        return {
          segments,
          end: bracketEnd >= 0 ? bracketEnd + 1 : source.length,
          dynamicComputed,
        };
      }
      inner = skipWhitespace(source, stringLiteral.end);
      if (source[inner] !== ']') {
        dynamicComputed = true;
        return {
          segments,
          end: inner,
          dynamicComputed,
        };
      }
      segments.push(stringLiteral.value);
      cursor = inner + 1;
      continue;
    } else {
      break;
    }

    cursor = skipWhitespace(source, cursor);
    const nextIdentifier = readIdentifier(source, cursor);
    if (!nextIdentifier) break;
    segments.push(nextIdentifier.value);
    cursor = nextIdentifier.end;
  }

  return {
    segments,
    end: cursor,
    dynamicComputed,
  };
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
    if (char === quote) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function skipExpression(source, index, stopChars = new Set([',', '}', ']'])) {
  let cursor = index;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "'" || char === '"' || char === '`') {
      cursor = skipQuotedLiteral(source, cursor);
      continue;
    }
    if (char === '{') {
      const end = findMatchingBracket(source, cursor, '{', '}');
      cursor = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if (char === '[') {
      const end = findMatchingBracket(source, cursor, '[', ']');
      cursor = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if (char === '(') {
      const end = findMatchingBracket(source, cursor, '(', ')');
      cursor = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if (stopChars.has(char)) break;
    cursor += 1;
  }
  return cursor;
}

function parseBindingPattern(source, index, names) {
  let cursor = skipWhitespace(source, index);
  if (source.slice(cursor, cursor + 3) === '...') {
    cursor = skipWhitespace(source, cursor + 3);
  }

  if (source[cursor] === '{') {
    cursor += 1;
    while (cursor < source.length) {
      cursor = skipWhitespace(source, cursor);
      if (source[cursor] === '}') return cursor + 1;
      if (source[cursor] === ',') {
        cursor += 1;
        continue;
      }
      if (source.slice(cursor, cursor + 3) === '...') {
        cursor = parseBindingPattern(source, cursor + 3, names);
      } else if (source[cursor] === "'" || source[cursor] === '"') {
        cursor = skipQuotedLiteral(source, cursor);
        cursor = skipWhitespace(source, cursor);
        if (source[cursor] === ':') cursor = parseBindingPattern(source, cursor + 1, names);
      } else {
        const key = readIdentifier(source, cursor);
        if (!key) {
          cursor += 1;
          continue;
        }
        cursor = skipWhitespace(source, key.end);
        if (source[cursor] === ':') {
          cursor = parseBindingPattern(source, cursor + 1, names);
        } else {
          names.add(key.value);
          if (source[cursor] === '=') {
            cursor = skipExpression(source, cursor + 1, new Set([',', '}']));
          }
        }
      }
      cursor = skipWhitespace(source, cursor);
      if (source[cursor] === ',') cursor += 1;
    }
    return cursor;
  }

  if (source[cursor] === '[') {
    cursor += 1;
    while (cursor < source.length) {
      cursor = skipWhitespace(source, cursor);
      if (source[cursor] === ']') return cursor + 1;
      if (source[cursor] === ',') {
        cursor += 1;
        continue;
      }
      cursor = parseBindingPattern(source, cursor, names);
      cursor = skipWhitespace(source, cursor);
      if (source[cursor] === '=') {
        cursor = skipExpression(source, cursor + 1, new Set([',', ']']));
      }
      cursor = skipWhitespace(source, cursor);
      if (source[cursor] === ',') cursor += 1;
    }
    return cursor;
  }

  const identifier = readIdentifier(source, cursor);
  if (!identifier) return cursor + 1;
  names.add(identifier.value);
  cursor = skipWhitespace(source, identifier.end);
  if (source[cursor] === '=') {
    return skipExpression(source, cursor + 1, new Set([',', '}', ']']));
  }
  return cursor;
}

function extractPatternBindingNames(patternSource) {
  const names = new Set();
  parseBindingPattern(String(patternSource || ''), 0, names);
  return [...names];
}

function previousSignificantChar(source, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
  return cursor >= 0 ? source[cursor] : '';
}

function isPropertyKeyLike(source, start, end) {
  const previousChar = previousSignificantChar(source, start);
  const nextIndex = skipWhitespace(source, end);
  return (previousChar === '{' || previousChar === ',') && source[nextIndex] === ':';
}

function discoverShadowedNames(source) {
  const shadowed = new Set();
  for (const regex of [/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g]) {
    let match = regex.exec(source);
    while (match) {
      shadowed.add(match[1]);
      match = regex.exec(source);
    }
  }
  for (const regex of [/\b(?:const|let|var)\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*=/g, /\bcatch\s*\(([\s\S]*?)\)/g]) {
    let match = regex.exec(source);
    while (match) {
      for (const name of extractPatternBindingNames(match[1])) shadowed.add(name);
      match = regex.exec(source);
    }
  }
  for (const regex of [/\bfunction(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g, /\(([^)]*)\)\s*=>/g]) {
    let match = regex.exec(source);
    while (match) {
      for (const name of extractPatternBindingNames(match[1])) shadowed.add(name);
      match = regex.exec(source);
    }
  }
  for (const regex of [/\b([A-Za-z_$][\w$]*)\s*=>/g]) {
    let match = regex.exec(source);
    while (match) {
      shadowed.add(match[1]);
      match = regex.exec(source);
    }
  }
  return shadowed;
}

function isAllowedPrecisePath(ctxPath, flattenedContract) {
  if (flattenedContract[ctxPath]) return true;
  for (const allowedPath of Object.keys(flattenedContract)) {
    if (allowedPath.startsWith(`${ctxPath}.`)) return true;
  }
  return false;
}

function getStaticPropertyKeyName(property) {
  const keyNode = property?.key;
  if (!keyNode) return null;
  if (!property.computed && keyNode.type === 'Identifier') return keyNode.name;
  if (keyNode.type === 'Literal' && (typeof keyNode.value === 'string' || typeof keyNode.value === 'number')) {
    return String(keyNode.value);
  }
  if (keyNode.type === 'TemplateLiteral' && keyNode.expressions.length === 0) {
    return keyNode.quasis[0]?.value?.cooked ?? '';
  }
  return null;
}

function getStaticStringValue(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? '';
  }
  return null;
}

function getObjectPropertyValue(objectNode, keyName) {
  if (objectNode?.type !== 'ObjectExpression') return null;
  for (const property of objectNode.properties || []) {
    if (property?.type !== 'Property') continue;
    if (getStaticPropertyKeyName(property) === keyName) return property.value;
  }
  return null;
}

function extractStaticHttpMethodFromCallNode(callNode) {
  const args = Array.isArray(callNode?.arguments) ? callNode.arguments : [];
  for (const candidate of [args[0], args[1]]) {
    const methodNode = getObjectPropertyValue(candidate, 'method');
    const methodValue = getStaticStringValue(methodNode);
    if (methodValue) return methodValue;
  }
  return null;
}

export function parseCode(code) {
  const compiled = compileUserCodeImpl(code);
  const source = compiled.code;
  const masked = maskSource(source);
  if (compiled.compileIssues?.length) {
    return {
      source,
      masked,
      syntaxIssues: compiled.compileIssues,
    };
  }

  try {
    new vm.Script(`(async () => {\n${source}\n})`, {
      filename: 'nb-runjs.syntax-check.js',
    });
    return {
      source,
      masked,
      syntaxIssues: [],
    };
  } catch (error) {
    return {
      source,
      masked,
      syntaxIssues: [
        {
          type: 'syntax',
          severity: 'error',
          ruleId: 'parse-error',
          message: safeErrorMessage(error),
        },
      ],
    };
  }
}

export function compileUserCode(code) {
  return compileUserCodeImpl(code);
}

export function analyzeContextUsage(code, profile) {
  const inputSource = String(code ?? '');
  const { source, masked, syntaxIssues } = parseCode(inputSource);
  if (syntaxIssues.length > 0) {
    return {
      syntaxIssues,
      contextIssues: [],
      policyIssues: [],
      usedContextPaths: [],
    };
  }

  const locate = createLocator(source);
  const allowedPaths = new Set(getAllowedContextPaths(profile));
  const flattenedContract = getFlattenedContract(profile);
  const rootBehaviors = getRootBehaviors(profile);
  const topLevelAliases = new Set(profile.topLevelAliases || []);
  const strictCompatRoots = new Set(profile.enforceCtxQualifiedAccess ? Object.keys(profile.contract || {}) : []);
  const shadowedNames = discoverShadowedNames(masked);
  const usedContextPaths = new Set();
  const contextIssues = [];
  const policyIssues = [];
  const seenContextIssues = new Set();
  const seenPolicyIssues = new Set();
  const seenUnsupportedIdentifiers = new Set();
  let sawExplicitCtxRender = false;

  const pushContextIssue = (ruleId, message, index, severity = 'warning') => {
    const issueKey = `${ruleId}:${message}:${index}`;
    if (seenContextIssues.has(issueKey)) return;
    seenContextIssues.add(issueKey);
    contextIssues.push(createStaticIssue('context', severity, ruleId, message, locate(index)));
  };

  const pushPolicyIssue = (ruleId, message, index) => {
    const issueKey = `${ruleId}:${message}:${index}`;
    if (seenPolicyIssues.has(issueKey)) return;
    seenPolicyIssues.add(issueKey);
    policyIssues.push(createStaticIssue('policy', 'error', ruleId, message, locate(index)));
  };

  const validateCompatPath = ({ compatPath, dynamicComputed = false, index }) => {
    if (!compatPath) return;
    usedContextPaths.add(compatPath);

    const rootPath = compatPath.split('.')[0];
    const rootBehavior = rootBehaviors[rootPath];
    if (!rootBehavior) {
      pushContextIssue('unknown-ctx-path', `Unknown context path "ctx.${compatPath}" for profile ${profile.model}.`, index);
    } else if (dynamicComputed && (rootBehavior === 'precise' || rootBehavior === 'strict')) {
      pushContextIssue(
        'dynamic-compat-member-unsupported',
        `Dynamic compatibility member access is unsupported for "ctx.${compatPath}" in profile ${profile.model}.`,
        index,
        'error',
      );
    } else if (rootBehavior !== 'opaque') {
      const isAllowed = rootBehavior === 'precise' ? isAllowedPrecisePath(compatPath, flattenedContract) : allowedPaths.has(compatPath);
      if (!isAllowed) {
        pushContextIssue('unknown-compat-member', `Unsupported compatibility member "ctx.${compatPath}" for profile ${profile.model}.`, index, 'error');
      }
    }
  };

  try {
    const astSemantics = collectCompiledRunJSSemantics(source).semantics;
    sawExplicitCtxRender = (astSemantics.topLevelCtxRenderCalls || []).length > 0;

    for (const entry of astSemantics.ctxMemberChains || []) {
      validateCompatPath({
        compatPath: entry.path,
        dynamicComputed: entry.dynamicComputed,
        index: entry.memberStart ?? entry.start ?? 0,
      });
    }

    for (const entry of astSemantics.ctxCallSites || []) {
      const compatPath = entry.path;
      if (!compatPath) continue;
      const index = entry.memberStart ?? entry.start ?? 0;
      if (STATIC_BLOCKED_COMPAT_CALLS.has(compatPath) && !profile.simulatedCompatCalls?.includes(compatPath)) {
        pushPolicyIssue('blocked-static-side-effect', `Blocked compatibility side effect "${compatPath}()".`, index);
      }
      if (compatPath === 'request' || compatPath === 'api.request') {
        const method = extractStaticHttpMethodFromCallNode(entry.node);
        if (typeof method === 'string' && !['GET', 'HEAD'].includes(method.trim().toUpperCase())) {
          pushPolicyIssue('blocked-static-side-effect', `Blocked static HTTP method "${method}" for ${compatPath}().`, index);
        }
      }
    }
  } catch (_) {
    // parseCode already performed the syntax gate. If AST enrichment still fails,
    // keep the legacy scan below as the conservative fallback.
  }

  for (let index = 0; index < masked.length; index += 1) {
    if (!isIdentifierStart(masked[index])) continue;
    const previousChar = masked[index - 1];
    if (isIdentifierPart(previousChar) || previousChar === '.') continue;

    const rootStart = index;
    const chain = parseChain(masked, index);
    if (!chain) continue;
    const [root, ...rest] = chain.segments;
    index = Math.max(index, chain.end - 1);
    if (isPropertyKeyLike(masked, rootStart, chain.end)) continue;

    if (UNSUPPORTED_TOP_LEVEL_IDENTIFIERS.has(root) && !shadowedNames.has(root)) {
      const key = `${root}:${chain.end}`;
      if (!seenUnsupportedIdentifiers.has(key)) {
        seenUnsupportedIdentifiers.add(key);
        pushContextIssue('unsupported-runtime-lib', `Unsupported zero-dependency runtime identifier "${root}".`, index, 'error');
      }
      continue;
    }

    const isCtxCompatRoot = root === 'ctx' && !shadowedNames.has(root);
    const isTopLevelCompatAlias = topLevelAliases.has(root) && !shadowedNames.has(root);
    if (strictCompatRoots.has(root) && !isCtxCompatRoot && !isTopLevelCompatAlias && !shadowedNames.has(root)) {
      const barePath = chain.segments.join('.');
      usedContextPaths.add(barePath);
      pushContextIssue(
        'bare-compat-access',
        `Use "ctx.${barePath}" instead of bare compatibility identifier "${barePath}" for profile ${profile.model}.`,
        index,
        'error',
      );
      continue;
    }

    if (isCtxCompatRoot) continue;

    const isCompatRoot = isCtxCompatRoot || isTopLevelCompatAlias;
    if (isCompatRoot) {
      const compatPath = chain.segments.join('.');
      if (!compatPath) continue;
      validateCompatPath({ compatPath, dynamicComputed: chain.dynamicComputed, index });

      const nextIndex = skipWhitespace(masked, chain.end);
      if (masked[nextIndex] === '(') {
        if (STATIC_BLOCKED_COMPAT_CALLS.has(compatPath) && !profile.simulatedCompatCalls?.includes(compatPath)) {
          pushPolicyIssue('blocked-static-side-effect', `Blocked compatibility side effect "${compatPath}()".`, index);
        }
      }

      const assignmentIndex = skipWhitespace(masked, chain.end);
      if (masked[assignmentIndex] === '=' && masked[assignmentIndex + 1] !== '=' && masked[assignmentIndex - 1] !== '=') {
        if (STATIC_BLOCKED_LOCATION_ASSIGNMENTS.has(compatPath)) {
          pushPolicyIssue('blocked-static-side-effect', `Blocked browser assignment to "${compatPath}".`, index);
        }
      }
      continue;
    }

    const nextIndex = skipWhitespace(masked, chain.end);
    if (masked[nextIndex] === '(' && isBlockedDynamicCodeGenerationChain(chain)) {
      pushPolicyIssue(
        'blocked-dynamic-code-generation',
        `Blocked dynamic code generation via "${chain.segments.join('.')}".`,
        index,
      );
      continue;
    }

    if (!GLOBAL_ROOT_IDENTIFIERS.has(root) || shadowedNames.has(root)) continue;
    const globalPath = chain.segments.join('.');
    if (masked[nextIndex] === '(' && STATIC_BLOCKED_GLOBAL_CALLS.has(globalPath)) {
      pushPolicyIssue('blocked-static-side-effect', `Blocked browser side effect "${globalPath}()".`, index);
      continue;
    }
    if (masked[nextIndex] === '=' && masked[nextIndex + 1] !== '=' && masked[nextIndex - 1] !== '=') {
      if (STATIC_BLOCKED_LOCATION_ASSIGNMENTS.has(globalPath)) {
        pushPolicyIssue('blocked-static-side-effect', `Blocked browser assignment to "${globalPath}".`, index);
      }
    }
  }

  if (profile.requireExplicitCtxRender && !sawExplicitCtxRender) {
    pushPolicyIssue(
      'missing-required-ctx-render',
      `Profile ${profile.model} requires an explicit ctx.render(...) call.`,
      skipWhitespace(masked, 0),
    );
  }

  return {
    syntaxIssues,
    contextIssues,
    policyIssues,
    usedContextPaths: [...usedContextPaths].sort(),
  };
}

export function createBareCompatAccessIssue(profile, missingName) {
  return createStaticIssue(
    'context',
    'error',
    'bare-compat-access',
    `Use "ctx.${missingName}" instead of bare compatibility identifier "${missingName}" for profile ${profile.model}.`,
  );
}
