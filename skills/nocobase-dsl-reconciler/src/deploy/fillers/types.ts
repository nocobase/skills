/**
 * Shared types for block filler modules.
 */

export type { DeployContext } from '../deploy-context';
export type LogFn = (msg: string) => void;

export interface PopupContext {
  seenColls: Set<string>;  // circular reference detection (stops infinite popup chains)
}
