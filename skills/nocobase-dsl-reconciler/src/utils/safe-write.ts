/**
 * File-write helpers — always create parent dirs, never fail on missing
 * tree. Every YAML / JS emitter in export/ uses this.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function safeWrite(filePath: string, content: string): void {
  ensureDir(filePath);
  fs.writeFileSync(filePath, content);
}
