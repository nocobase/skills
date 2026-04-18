/**
 * Single entry point for clearing per-run deploy caches.
 *
 * Rationale: three independent modules (block-filler, click-to-open,
 * template-deployer) hold global state keyed to the current deploy run:
 *
 *   - block-filler._m2oCache: live m2o/o2m field metadata (avoid refetching
 *     ~1000 fields per page)
 *   - click-to-open._promotedPopupCache: fields whose inline popup was
 *     promoted to a template during this run (prevents duplicate promotes)
 *   - template-deployer._createdThisRun: UIDs of templates created this
 *     run (consumed by `cli rollback`)
 *
 * Before this module existed project-deployer imported + called three
 * reset functions explicitly — easy to forget one when a new cache is
 * added. Now there's one call: `resetAllCaches()`. New caches register
 * here alongside their siblings, future deploys auto-reset them.
 *
 * Cache modules keep their own reset exports for callers that only need
 * to clear one (e.g. a test that exercises only the m2o path).
 */
import { resetM2oCache } from './blocks/block-filler';
import { resetPromotedPopupCache } from './fillers/click-to-open';
import { resetTemplateCreationTracking } from './templates/template-deployer';

export function resetAllCaches(): void {
  resetM2oCache();
  resetPromotedPopupCache();
  resetTemplateCreationTracking();
}
