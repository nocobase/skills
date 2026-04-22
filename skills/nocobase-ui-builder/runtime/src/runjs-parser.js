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
