/**
 * Build AI employee button stepParams + props from shorthand DSL.
 *
 * Shorthand: { type: ai, employee: viz, tasks_file: ./ai/tasks.yaml }
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadYaml } from '../../utils/yaml';

export function buildAiButton(
  spec: Record<string, unknown>,
  blockUid: string,
  modDir: string,
): { sp: Record<string, unknown>; props: Record<string, unknown> } {
  const employee = (spec.employee as string) || '';
  const tasksFile = (spec.tasks_file as string) || '';

  let tasksSpec: Record<string, unknown>[] = [];
  if (tasksFile) {
    const tf = path.join(modDir, tasksFile);
    if (fs.existsSync(tf)) {
      const td = loadYaml<Record<string, unknown>>(tf);
      tasksSpec = (td.tasks as Record<string, unknown>[]) || [];
    }
  }

  const builtTasks: Record<string, unknown>[] = [];
  for (const t of tasksSpec) {
    let systemText = (t.system as string) || '';
    if (!systemText && t.system_file) {
      const sf = path.join(modDir, t.system_file as string);
      if (fs.existsSync(sf)) systemText = fs.readFileSync(sf, 'utf8');
    }
    builtTasks.push({
      title: t.title || '',
      autoSend: t.autoSend ?? true,
      message: {
        user: t.user || '',
        system: systemText,
        workContext: [{ type: 'flow-model', uid: blockUid }],
        skillSettings: {},
      },
    });
  }

  return {
    sp: { shortcutSettings: { editTasks: { tasks: builtTasks } } },
    props: {
      aiEmployee: { username: employee },
      context: { workContext: [{ type: 'flow-model', uid: blockUid }] },
      auto: false,
    },
  };
}
