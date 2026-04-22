import { transformJsx } from './jsx-transform.js';

export function compileUserCode(code) {
  const transformed = transformJsx(code);
  return {
    code: transformed.code,
    compileIssues: transformed.compileIssues || [],
  };
}
