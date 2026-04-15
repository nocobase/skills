const TEMPLATE_DEFS = {
  schema_only_all: {
    key: 'schema_only_all',
    label: 'Schema only (user + system)',
    description: 'Migrate schema only for user-defined and system collections.',
    cli_mode: 'structure',
    high_risk: false,
    require_backup_for_apply: false,
    user_global_rule: 'schema-only',
    system_global_rule: 'schema-only',
  },
  user_overwrite_only: {
    key: 'user_overwrite_only',
    label: 'Overwrite user / schema-only system',
    description: 'Overwrite user-defined collections and keep system collections schema-only.',
    cli_mode: 'overwrite',
    high_risk: true,
    require_backup_for_apply: true,
    user_global_rule: 'overwrite',
    system_global_rule: 'schema-only',
  },
  system_overwrite_only: {
    key: 'system_overwrite_only',
    label: 'Schema-only user / overwrite system',
    description: 'Keep user-defined collections schema-only and overwrite system collections.',
    cli_mode: 'overwrite',
    high_risk: true,
    require_backup_for_apply: true,
    user_global_rule: 'schema-only',
    system_global_rule: 'overwrite-first',
  },
  full_overwrite: {
    key: 'full_overwrite',
    label: 'Full overwrite',
    description: 'Overwrite user-defined collections and system collections.',
    cli_mode: 'overwrite',
    high_risk: true,
    require_backup_for_apply: true,
    user_global_rule: 'overwrite',
    system_global_rule: 'overwrite-first',
  },
};

const TEMPLATE_ALIASES = {
  schema_only_all: 'schema_only_all',
  structure_only: 'schema_only_all',
  schema_only: 'schema_only_all',
  structure: 'schema_only_all',
  schema: 'schema_only_all',

  user_overwrite_only: 'user_overwrite_only',
  user_overwrite: 'user_overwrite_only',
  user_data_overwrite: 'user_overwrite_only',

  system_overwrite_only: 'system_overwrite_only',
  system_overwrite: 'system_overwrite_only',
  system_data_overwrite: 'system_overwrite_only',

  full_overwrite: 'full_overwrite',
  overwrite: 'full_overwrite',
  full: 'full_overwrite',
};

export function getMigrationTemplateKeys() {
  return Object.keys(TEMPLATE_DEFS);
}

export function getMigrationTemplateLabel(templateKey) {
  return TEMPLATE_DEFS[templateKey]?.label || '';
}

export function getMigrationTemplateDefinition(templateKey) {
  return TEMPLATE_DEFS[templateKey] || null;
}

export function getMigrationTemplateOptions() {
  return getMigrationTemplateKeys().map((key) => {
    const def = TEMPLATE_DEFS[key];
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      user_defined_rule: def.user_global_rule,
      system_defined_rule: def.system_global_rule,
      high_risk: def.high_risk,
    };
  });
}

export function resolveMigrationTemplate({
  method,
  migrationTemplate,
  legacyMode,
  allowEmpty = false,
}) {
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
      `Invalid legacy --mode "${rawLegacy}". Expected overwrite/full or structure/schema.`,
    );
  }

  const selected = normalizedTemplate || normalizedLegacy || '';
  if (!selected && !allowEmpty) {
    errors.push(
      `Migration requires --migration-template <${getMigrationTemplateKeys().join('|')}>.`,
    );
  }

  if (rawLegacy) {
    warnings.push('Using legacy --mode for migration template selection. Prefer --migration-template.');
  }

  if (rawTemplate && rawTemplate !== selected) {
    warnings.push(`Migration template alias "${rawTemplate}" normalized to "${selected}".`);
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

  const templateKnown = Boolean(template && TEMPLATE_DEFS[template]);
  checks.push({
    id: 'REL-TPL-001',
    ok: templateKnown,
    message: templateKnown ? `Migration template resolved: ${template}` : 'Migration template unresolved.',
  });

  if (!templateKnown) {
    if (action === 'publish') {
      blockers.push('Migration template unresolved.');
    }
    return { checks, blockers, warnings };
  }

  const def = TEMPLATE_DEFS[template];

  if (def.high_risk) {
    warnings.push(`Template ${template} is high-impact and may replace target data.`);
  }

  if (action === 'publish' && def.require_backup_for_apply && backupAuto !== true) {
    checks.push({
      id: 'REL-TPL-002',
      ok: false,
      message: `${template} publish requires backup_auto=true.`,
    });
    blockers.push(`${template} publish requires backup_auto=true.`);
  } else {
    checks.push({
      id: 'REL-TPL-002',
      ok: true,
      message: 'Backup guard for selected template is satisfied.',
    });
  }

  if (template === 'schema_only_all') {
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
          ? 'schema_only_all DB driver check passed.'
          : 'schema_only_all DB driver mismatch.',
      });
      if (!dbDriverMatch) {
        blockers.push('schema_only_all requires same DB driver on source and target.');
      }
    } else {
      warnings.push('schema_only_all DB driver compatibility cannot be fully verified yet.');
    }

    if (compatibility.source_db_major && compatibility.target_db_major) {
      checks.push({
        id: 'REL-TPL-004',
        ok: Boolean(dbVersionMatch),
        message: dbVersionMatch
          ? 'schema_only_all DB major version check passed.'
          : 'schema_only_all DB major version mismatch.',
      });
      if (!dbVersionMatch) {
        blockers.push('schema_only_all requires same DB major version on source and target.');
      }
    } else {
      warnings.push('schema_only_all DB major compatibility cannot be fully verified yet.');
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
