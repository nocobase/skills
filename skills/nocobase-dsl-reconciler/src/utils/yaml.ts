import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

export function loadYaml<T = Record<string, unknown>>(filePath: string): T {
  return yaml.load(fs.readFileSync(filePath, 'utf8')) as T;
}

export function dumpYaml(data: unknown): string {
  return yaml.dump(data, {
    noRefs: true,
    lineWidth: -1,
    sortKeys: false,
  });
}

export function saveYaml(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, dumpYaml(data), 'utf8');
}
