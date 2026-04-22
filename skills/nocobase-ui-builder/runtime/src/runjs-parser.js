import * as acorn from 'acorn';

import { compileUserCode } from './analysis.js';

export const WRAPPED_RUNJS_PREFIX = '(async () => {\n';
export const WRAPPED_RUNJS_SUFFIX = '\n})()';

export function buildWrappedRunJSCode(source) {
  const compiled = compileUserCode(String(source ?? ''));
  return {
    code: compiled.code,
    compileIssues: compiled.compileIssues || [],
    wrappedCode: `${WRAPPED_RUNJS_PREFIX}${compiled.code}${WRAPPED_RUNJS_SUFFIX}`,
    sourceOffset: WRAPPED_RUNJS_PREFIX.length,
  };
}

export function parseWrappedRunJS(source) {
  const built = buildWrappedRunJSCode(source);
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

function isCtxRequestCallExpression(node) {
  const expression = unwrapChainExpression(node);
  const callee = unwrapChainExpression(expression?.callee);
  return expression?.type === 'CallExpression' && isCtxMemberExpression(callee, 'request');
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

export function collectWrappedRunJSSemantics(input) {
  const parsed = typeof input === 'string' ? parseWrappedRunJS(input) : input;
  const semantics = {
    topLevelReturns: [],
    topLevelCtxRenderCalls: [],
    ctxRequestCalls: [],
    innerHTMLAssignments: [],
  };

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
    if (isCtxRequestCallExpression(node)) {
      semantics.ctxRequestCalls.push({
        node: unwrapChainExpression(node),
        ancestors,
      });
      return;
    }
    if (isInnerHTMLAssignmentExpression(node)) {
      semantics.innerHTMLAssignments.push({
        node: unwrapChainExpression(node),
        ancestors,
      });
    }
  });

  return {
    ...parsed,
    semantics,
  };
}
