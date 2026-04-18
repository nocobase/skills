/**
 * Resolve a template UID to its relative YAML path by walking up from
 * a starting directory until a templates/_index.yaml is found.
 *
 * Used by both export (to write `ref: templates/block/x.yaml`) and
 * deploy (to resolve `ref:` back to a concrete file). Lives in utils
 * so it doesn't couple exporter to deployer.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadYaml } from './yaml';

export function lookupTemplateFile(templateUid: string, fromDir: string): string | null {
  for (let d = fromDir; d !== path.dirname(d); d = path.dirname(d)) {
    const indexFile = path.join(d, 'templates', '_index.yaml');
    if (!fs.existsSync(indexFile)) continue;
    const index = loadYaml<Record<string, unknown>[]>(indexFile) || [];
    const entry = index.find(t => t.uid === templateUid);
    if (entry?.file) return `templates/${entry.file}`;
    break;
  }
  return null;
}
