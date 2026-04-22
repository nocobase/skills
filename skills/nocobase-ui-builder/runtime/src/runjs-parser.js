import * as acorn from 'acorn';

import { compileUserCode } from './user-code.js';

export const WRAPPED_RUNJS_PREFIX = '(async () => {\n';
export const WRAPPED_RUNJS_SUFFIX = '\n})()';

function compileMaybeUserCode(source, { compiled = false } = {}) {
  if (compiled) {
    return {
      code: String(source ?? ''),
      compileIssues: [],
    };
  }
  return compileUserCode(String(source ?? ''));
}

export function buildWrappedRunJSCode(source, options = {}) {
  const compiled = compileMaybeUserCode(source, options);
  return {
    code: compiled.code,
    compileIssues: compiled.compileIssues || [],
    wrappedCode: `${WRAPPED_RUNJS_PREFIX}${compiled.code}${WRAPPED_RUNJS_SUFFIX}`,
    sourceOffset: WRAPPED_RUNJS_PREFIX.length,
  };
}

export function parseWrappedRunJS(source, options = {}) {
  const built = buildWrappedRunJSCode(source, options);
  if (built.compileIssues.length > 0) {
    const firstIssue = built.compileIssues[0];
    throw new Error(firstIssue?.message || 'JSX compile error');
  }

  const ast = acorn.parse(built.wrappedCode, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true,
  });
  const wrappedBody = ast.body?.[0]?.expression?.callee?.body || null;

  return {
    ...built,
    ast,
    wrappedBody,
    wrappedStatements: Array.isArray(wrappedBody?.body) ? wrappedBody.body : [],
  };
}

function isAstNode(value) {
  return !!value && typeof value === 'object' && typeof value.type === 'string';
}

function traverseAst(node, visitor, ancestors = []) {
  if (!isAstNode(node)) return;
  visitor(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) traverseAst(item, visitor, nextAncestors);
      }
      continue;
    }
    if (isAstNode(value)) {
      traverseAst(value, visitor, nextAncestors);
    }
  }
}

function unwrapChainExpression(node) {
  return node?.type === 'ChainExpression' ? node.expression : node;
}

function resolveStaticPropertyName(node) {
  const expression = unwrapChainExpression(node);
  if (expression?.type === 'Identifier') return expression.name;
  if (expression?.type === 'Literal') {
    return typeof expression.value === 'string' || typeof expression.value === 'number'
      ? String(expression.value)
      : null;
  }
  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0) {
    return expression.quasis[0]?.value?.cooked ?? '';
  }
  return null;
}

function resolveCtxMemberChain(node) {
  const expression = unwrapChainExpression(node);
  if (!expression) return null;
  if (expression.type === 'Identifier' && expression.name === 'ctx') {
    return {
      segments: [],
      dynamicComputed: false,
      memberNode: expression,
    };
  }
  if (expression.type !== 'MemberExpression') return null;

  const objectInfo = resolveCtxMemberChain(expression.object);
  if (!objectInfo) return null;

  const propertyName = resolveStaticPropertyName(expression.property);
  if (propertyName != null) {
    return {
      segments: [...objectInfo.segments, propertyName],
      dynamicComputed: objectInfo.dynamicComputed,
      memberNode: unwrapChainExpression(expression.property) || expression,
    };
  }

  return {
    segments: [...objectInfo.segments],
    dynamicComputed: true,
    memberNode: unwrapChainExpression(expression.property) || expression,
  };
}

function normalizeSourceIndex(index, sourceOffset) {
  return Number.isFinite(index) ? Math.max(0, index - sourceOffset) : index;
}

function createCtxChainEntry(node, ancestors, sourceOffset = 0) {
  const expression = unwrapChainExpression(node);
  const chainInfo = resolveCtxMemberChain(expression);
  if (!chainInfo) return null;
  return {
    node: expression,
    ancestors,
    start: normalizeSourceIndex(expression.start, sourceOffset),
    end: normalizeSourceIndex(expression.end, sourceOffset),
    path: chainInfo.segments.join('.'),
    segments: [...chainInfo.segments],
    dynamicComputed: chainInfo.dynamicComputed,
    memberNode: chainInfo.memberNode,
    memberStart: normalizeSourceIndex(chainInfo.memberNode?.start, sourceOffset),
  };
}

function dedupeCtxEntries(entries) {
  const seen = new Set();
  const output = [];
  for (const entry of entries) {
    const key = `${entry.start}:${entry.end}:${entry.path}:${entry.dynamicComputed ? '1' : '0'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
}

function selectMaximalCtxMemberChains(entries) {
  const byStart = new Map();
  for (const entry of entries) {
    const key = entry.start;
    const previous = byStart.get(key);
    if (!previous || entry.end > previous.end) {
      byStart.set(key, entry);
    }
  }
  return [...byStart.values()].sort((left, right) => left.start - right.start || right.end - left.end);
}

function isFunctionNode(node) {
  return node?.type === 'FunctionDeclaration'
    || node?.type === 'FunctionExpression'
    || node?.type === 'ArrowFunctionExpression';
}

function isTopLevelSemanticBoundary(node) {
  return isFunctionNode(node) || node?.type === 'ClassDeclaration' || node?.type === 'ClassExpression';
}

function isCtxMemberExpression(node, name) {
  const expression = unwrapChainExpression(node);
  const objectNode = unwrapChainExpression(expression?.object);
  const propertyNode = unwrapChainExpression(expression?.property);
  return expression?.type === 'MemberExpression'
    && expression.computed !== true
    && objectNode?.type === 'Identifier'
    && objectNode.name === 'ctx'
    && propertyNode?.type === 'Identifier'
    && propertyNode.name === name;
}

function isCtxRenderCallExpression(node) {
  const expression = unwrapChainExpression(node);
  const callee = unwrapChainExpression(expression?.callee);
  return expression?.type === 'CallExpression' && isCtxMemberExpression(callee, 'render');
}

function isInnerHTMLAssignmentExpression(node) {
  const expression = unwrapChainExpression(node);
  const leftNode = unwrapChainExpression(expression?.left);
  const propertyNode = unwrapChainExpression(leftNode?.property);
  return expression?.type === 'AssignmentExpression'
    && leftNode?.type === 'MemberExpression'
    && leftNode.computed !== true
    && propertyNode?.type === 'Identifier'
    && propertyNode.name === 'innerHTML';
}

function traverseSurfaceTopLevel(wrappedStatements, visitor) {
  const visit = (node, ancestors = []) => {
    if (!isAstNode(node)) return;
    visitor(node, ancestors);
    if (isTopLevelSemanticBoundary(node)) return;
    const nextAncestors = [...ancestors, node];
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) visit(item, nextAncestors);
        }
        continue;
      }
      if (isAstNode(value)) visit(value, nextAncestors);
    }
  };

  for (const statement of wrappedStatements || []) {
    visit(statement);
  }
}

export function collectWrappedRunJSSemantics(input, options = {}) {
  const parsed = typeof input === 'string' ? parseWrappedRunJS(input, options) : input;
  const semantics = {
    topLevelReturns: [],
    topLevelCtxRenderCalls: [],
    ctxMemberChains: [],
    ctxCallSites: [],
    ctxRequestCalls: [],
    innerHTMLAssignments: [],
  };
  const ctxMemberCandidates = [];
  const ctxCallCandidates = [];

  traverseSurfaceTopLevel(parsed.wrappedStatements, (node, ancestors) => {
    if (node?.type === 'ReturnStatement') {
      semantics.topLevelReturns.push({ node, ancestors });
      return;
    }
    if (isCtxRenderCallExpression(node)) {
      semantics.topLevelCtxRenderCalls.push({
        node: unwrapChainExpression(node),
        ancestors,
      });
    }
  });

  traverseAst(parsed.wrappedBody, (node, ancestors) => {
    const memberEntry = createCtxChainEntry(node, ancestors, parsed.sourceOffset || 0);
    if (memberEntry) ctxMemberCandidates.push(memberEntry);

    const expression = unwrapChainExpression(node);
    if (expression?.type === 'CallExpression') {
      const callEntry = createCtxChainEntry(expression.callee, ancestors, parsed.sourceOffset || 0);
      if (callEntry) {
        ctxCallCandidates.push({
          ...callEntry,
          start: normalizeSourceIndex(expression.start, parsed.sourceOffset || 0),
          end: normalizeSourceIndex(expression.end, parsed.sourceOffset || 0),
          calleeStart: callEntry.start,
          calleeEnd: callEntry.end,
          node: expression,
          calleeNode: unwrapChainExpression(expression.callee),
        });
      }
    }
    if (isInnerHTMLAssignmentExpression(node)) {
      semantics.innerHTMLAssignments.push({
        node: unwrapChainExpression(node),
        ancestors,
      });
    }
  });

  semantics.ctxMemberChains = selectMaximalCtxMemberChains(dedupeCtxEntries(ctxMemberCandidates));
  semantics.ctxCallSites = dedupeCtxEntries(ctxCallCandidates).sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  semantics.ctxRequestCalls = semantics.ctxCallSites
    .filter((entry) => ['request', 'api.request'].includes(entry.path))
    .map((entry) => ({
      node: entry.node,
      calleeNode: entry.calleeNode,
      ancestors: entry.ancestors,
      path: entry.path,
      start: entry.start,
      end: entry.end,
      calleeStart: entry.calleeStart,
      calleeEnd: entry.calleeEnd,
      segments: [...entry.segments],
      memberStart: entry.memberStart,
    }));

  return {
    ...parsed,
    semantics,
  };
}

export function collectCompiledRunJSSemantics(compiledCode) {
  return collectWrappedRunJSSemantics(compiledCode, { compiled: true });
}
