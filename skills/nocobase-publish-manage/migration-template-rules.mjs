const TEMPLATE_DEFS = {
  full_overwrite: {
    key: 'full_overwrite',
    label: 'Full overwrite',
    cli_mode: 'overwrite',
    high_risk: true,
    require_backup_for_apply: true,
  },
  structure_only: {
    key: 'structure_only',
    label: 'Structure only',
    cli_mode: 'structure',
    high_risk: false,
    require_backup_for_apply: false,
  },
};

const TEMPLATE_ALIASES = {
  overwrite: 'full_overwrite',
  full: 'full_overwrite',
  full_overwrite: 'full_overwrite',
  structure: 'structure_only',
  schema: 'structure_only',
  structure_only: 'structure_only',
};

export function getMigrationTemplateKeys() {
  return Object.keys(TEMPLATE_DEFS);
}

export function getMigrationTemplateLabel(templateKey) {
  return TEMPLATE_DEFS[templateKey]?.label || '';
}

export function resolveMigrationTemplate({ method, migrationTemplate, legacyMode }) {
  if (method !== 'migration') {
    return {
      ok: true,
      template: '',
      warnings: [],
      errors: [],
    };
  }

  const warnings = [];
  const errors = [];

  const rawTemplate = (migrationTemplate || '').trim();
  const rawLegacy = (legacyMode || '').trim();

  const normalizedTemplate = rawTemplate ? TEMPLATE_ALIASES[rawTemplate] : '';
  const normalizedLegacy = rawLegacy ? TEMPLATE_ALIASES[rawLegacy] : '';

  if (rawTemplate && !normalizedTemplate) {
    errors.push(
      `Invalid migration template "${rawTemplate}". Expected one of: ${getMigrationTemplateKeys().join(', ')}`,
    );
  }

  if (rawLegacy && !normalizedLegacy) {
    errors.push(
      `Invalid legacy --mode "${rawLegacy}". Expected overwrite (full_overwrite) or structure (structure_only).`,
    );
  }

  let selected = normalizedTemplate || normalizedLegacy;
  if (!selected) {
    errors.push(
      `Migration requires --migration-template <${getMigrationTemplateKeys().join('|')}>.`,
    );
  }

  if (normalizedLegacy) {
    warnings.push('Using legacy --mode for migration template selection. Prefer --migration-template.');
  }

  return {
    ok: errors.length === 0,
    template: selected,
    warnings,
    errors,
  };
}

export function evaluateMigrationTemplateRules({
  action,
  method,
  template,
  backupAuto,
  compatibility,
}) {
  const checks = [];
  const blockers = [];
  const warnings = [];

  if (method !== 'migration') {
    return { checks, blockers, warnings };
  }

  const def = TEMPLATE_DEFS[template];
  const templateKnown = Boolean(def);
  checks.push({
    id: 'REL-TPL-001',
    ok: templateKnown,
    message: templateKnown ? `Migration template resolved: ${template}` : 'Migration template unresolved.',
  });
  if (!templateKnown) {
    blockers.push('Migration template unresolved.');
    return { checks, blockers, warnings };
  }

  if (def.high_risk) {
    warnings.push('Template full_overwrite is high-impact and may replace target data.');
  }

  if (action === 'publish' && def.require_backup_for_apply && backupAuto !== true) {
    checks.push({
      id: 'REL-TPL-002',
      ok: false,
      message: 'full_overwrite publish requires backup_auto=true.',
    });
    blockers.push('full_overwrite publish requires backup_auto=true.');
  } else {
    checks.push({
      id: 'REL-TPL-002',
      ok: true,
      message: 'Backup guard for selected template is satisfied.',
    });
  }

  if (template === 'structure_only') {
    const dbDriverMatch =
      compatibility.source_db_driver &&
      compatibility.target_db_driver &&
      compatibility.source_db_driver === compatibility.target_db_driver;
    const dbVersionMatch =
      compatibility.source_db_major &&
      compatibility.target_db_major &&
      compatibility.source_db_major === compatibility.target_db_major;

    if (compatibility.source_db_driver && compatibility.target_db_driver) {
      checks.push({
        id: 'REL-TPL-003',
        ok: Boolean(dbDriverMatch),
        message: dbDriverMatch
          ? 'structure_only DB driver check passed.'
          : 'structure_only DB driver mismatch.',
      });
      if (!dbDriverMatch) {
        blockers.push('structure_only requires same DB driver on source and target.');
      }
    } else {
      warnings.push('structure_only DB driver compatibility cannot be fully verified yet.');
    }

    if (compatibility.source_db_major && compatibility.target_db_major) {
      checks.push({
        id: 'REL-TPL-004',
        ok: Boolean(dbVersionMatch),
        message: dbVersionMatch
          ? 'structure_only DB major version check passed.'
          : 'structure_only DB major version mismatch.',
      });
      if (!dbVersionMatch) {
        blockers.push('structure_only requires same DB major version on source and target.');
      }
    } else {
      warnings.push('structure_only DB major compatibility cannot be fully verified yet.');
    }
  }

  return { checks, blockers, warnings };
}

export function buildMigrationCliArgs(stage, template) {
  const def = TEMPLATE_DEFS[template];
  if (!def) {
    return [];
  }
  const action = stage === 'generate' ? 'generate' : 'up';
  return ['migration', action, '--mode', def.cli_mode];
}
