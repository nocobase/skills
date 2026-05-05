const WHOLE_PAGE_PREPARE_COMMANDS = new Set([
  'apply-blueprint',
]);

const LOCALIZED_PREFLIGHT_COMMANDS = new Set([
  'compose',
  'add-block',
  'add-blocks',
  'configure',
]);

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function getFlowSurfacesCommandPolicy(subcommand) {
  const normalized = normalizeText(subcommand);
  if (WHOLE_PAGE_PREPARE_COMMANDS.has(normalized)) return 'whole_page_prepare';
  if (LOCALIZED_PREFLIGHT_COMMANDS.has(normalized)) return 'localized_preflight';
  return 'passthrough';
}
