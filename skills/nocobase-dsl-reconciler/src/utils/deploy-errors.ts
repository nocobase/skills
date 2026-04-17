/**
 * Structured error reporting for deploy operations.
 *
 * Replaces silent catch-and-skip patterns with a collector
 * that tracks errors by severity, component, and operation.
 *
 * Phase 1 (current): Individual catch blocks use log() directly.
 * Phase 2 (planned): Pass collector through deploy pipeline for aggregate reporting.
 */

export type ErrorLevel = 'fatal' | 'warn' | 'info';

export interface DeployError {
  level: ErrorLevel;
  component: string;  // e.g. 'compose', 'fillBlock', 'templateRef'
  op: string;         // e.g. 'addField status', 'setLayout'
  message: string;
}

export class DeployErrorCollector {
  private errors: DeployError[] = [];

  add(level: ErrorLevel, component: string, op: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.errors.push({ level, component, op, message: message.slice(0, 120) });
  }

  /** Try an operation, catch and record if it fails. Returns true if succeeded. */
  async attempt(level: ErrorLevel, component: string, op: string, fn: () => Promise<void>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (e) {
      this.add(level, component, op, e);
      return false;
    }
  }

  summary(): string {
    const fatal = this.errors.filter(e => e.level === 'fatal');
    const warn = this.errors.filter(e => e.level === 'warn');
    if (!this.errors.length) return '';
    const lines: string[] = [];
    for (const e of fatal) lines.push('  [FATAL] [' + e.component + '] ' + e.op + ': ' + e.message);
    for (const e of warn) lines.push('  [warn] [' + e.component + '] ' + e.op + ': ' + e.message);
    return lines.join('\n');
  }

  hasFatal(): boolean { return this.errors.some(e => e.level === 'fatal'); }

  get count() {
    return {
      fatal: this.errors.filter(e => e.level === 'fatal').length,
      warn: this.errors.filter(e => e.level === 'warn').length,
    };
  }
}
