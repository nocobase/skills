function inferMigrationMode(migrationTemplate = '') {
  if (migrationTemplate === 'schema_only_all' || migrationTemplate === 'structure_only') {
    return 'structure';
  }
  if (
    migrationTemplate === 'full_overwrite' ||
    migrationTemplate === 'user_overwrite_only' ||
    migrationTemplate === 'system_overwrite_only'
  ) {
    return 'overwrite';
  }
  return '';
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function pickDefined(source = {}, keys = []) {
  const out = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function resolveArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '');
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
}

const RESOURCE_OPERATION_DEFS = {
  backup_create: {
    key: 'backup_create',
    description: 'Create a backup package on target.',
    method: 'POST',
    routes: ['/backups:create', '/backupFiles:create'],
    buildQuery: () => ({}),
    buildBody: ({ backupArtifact, password }) => pickDefined({ name: backupArtifact, password }, ['name', 'password']),
  },
  backup_list: {
    key: 'backup_list',
    description: 'List backup packages on target.',
    method: 'GET',
    routes: ['/backups:list', '/backupFiles:list'],
    buildQuery: ({ page = 1, pageSize = 20, sort = ['-createdAt'] }) => ({ page, pageSize, sort }),
    buildBody: () => undefined,
  },
  backup_destroy: {
    key: 'backup_destroy',
    description: 'Delete one backup package on target.',
    method: 'POST',
    routes: ['/backups:destroy', '/backupFiles:destroy'],
    buildQuery: ({ backupArtifact, filterByTk, name }) => ({
      filterByTk: firstDefined(filterByTk, backupArtifact, name),
    }),
    buildBody: () => undefined,
  },
  backup_restore: {
    key: 'backup_restore',
    description: 'Restore target from a backup package.',
    method: 'POST',
    routes: ['/backups:restore', '/backupFiles:restore', '/backup:restore'],
    buildQuery: () => ({}),
    buildBody: ({ backupArtifact, name, password }) => pickDefined(
      {
        name: firstDefined(name, backupArtifact),
        password,
      },
      ['name', 'password'],
    ),
  },
  backup_upload: {
    key: 'backup_upload',
    description: 'Upload backup package and restore target.',
    method: 'POST',
    routes: ['/backups:upload', '/backupFiles:upload'],
    transport: 'multipart',
    buildQuery: () => ({}),
    buildBody: () => undefined,
    buildMultipart: ({ filePath, fileName, password }) => ({
      file_field: 'file',
      file_path: filePath || '',
      file_name: fileName || '',
      fields: pickDefined({ password }, ['password']),
    }),
  },
  backup_download: {
    key: 'backup_download',
    description: 'Download backup package.',
    method: 'GET',
    routes: ['/backups:download', '/backupFiles:download'],
    response_type: 'binary',
    buildQuery: ({ backupArtifact, filterByTk, name }) => ({
      filterByTk: firstDefined(filterByTk, backupArtifact, name),
    }),
    buildBody: () => undefined,
    buildDownload: ({ outputPath }) => ({
      output_path: outputPath || '',
    }),
  },
  backup_task_status: {
    key: 'backup_task_status',
    description: 'Get backup task status by backup names.',
    method: 'GET',
    routes: ['/backups:taskStatus'],
    buildQuery: ({ names, backupArtifacts }) => ({
      'names[]': resolveArray(firstDefined(names, backupArtifacts)),
    }),
    buildBody: () => undefined,
  },
  backup_restore_status: {
    key: 'backup_restore_status',
    description: 'Get restore task status.',
    method: 'GET',
    routes: ['/backups:restoreStatus'],
    buildQuery: ({ task, taskId }) => ({
      task: firstDefined(task, taskId),
    }),
    buildBody: () => undefined,
  },
  backup_app_info: {
    key: 'backup_app_info',
    description: 'Get target app database info from backups plugin.',
    method: 'GET',
    routes: ['/backups:appInfo'],
    buildQuery: () => ({}),
    buildBody: () => undefined,
  },
  backup_settings_get: {
    key: 'backup_settings_get',
    description: 'Get backup settings.',
    method: 'GET',
    routes: ['/backupSettings:get'],
    buildQuery: () => ({}),
    buildBody: () => undefined,
  },
  backup_settings_update: {
    key: 'backup_settings_update',
    description: 'Update backup settings.',
    method: 'POST',
    routes: ['/backupSettings:update'],
    buildQuery: ({ filterByTk }) => ({ filterByTk }),
    buildBody: (params) => (params.values && typeof params.values === 'object' ? params.values : params),
  },

  migration_rules_list: {
    key: 'migration_rules_list',
    description: 'List migration rules.',
    method: 'GET',
    routes: ['/migrationRules:list'],
    buildQuery: ({ page = 1, pageSize = 100, sort = ['-id'] }) => ({ page, pageSize, sort }),
    buildBody: () => undefined,
  },
  migration_rules_get: {
    key: 'migration_rules_get',
    description: 'Get one migration rule.',
    method: 'GET',
    routes: ['/migrationRules:get'],
    buildQuery: ({ filterByTk, ruleId, id }) => ({ filterByTk: firstDefined(filterByTk, ruleId, id) }),
    buildBody: () => undefined,
  },
  migration_rules_create: {
    key: 'migration_rules_create',
    description: 'Create migration rule.',
    method: 'POST',
    routes: ['/migrationRules:create'],
    buildQuery: () => ({}),
    buildBody: (params) => {
      if (params.values && typeof params.values === 'object') {
        return params.values;
      }
      return pickDefined(params, ['name', 'description', 'rules']);
    },
  },
  migration_rules_update: {
    key: 'migration_rules_update',
    description: 'Update migration rule.',
    method: 'POST',
    routes: ['/migrationRules:update'],
    buildQuery: ({ filterByTk, ruleId, id }) => ({ filterByTk: firstDefined(filterByTk, ruleId, id) }),
    buildBody: (params) => {
      if (params.values && typeof params.values === 'object') {
        return params.values;
      }
      return pickDefined(params, ['name', 'description', 'rules']);
    },
  },
  migration_rules_destroy: {
    key: 'migration_rules_destroy',
    description: 'Delete migration rule.',
    method: 'POST',
    routes: ['/migrationRules:destroy'],
    buildQuery: ({ filterByTk, ruleId, id }) => ({ filterByTk: firstDefined(filterByTk, ruleId, id) }),
    buildBody: () => undefined,
  },
  migration_rules_list_collections: {
    key: 'migration_rules_list_collections',
    description: 'List collections and metadata for migration rule configuration.',
    method: 'GET',
    routes: ['/migrationRules:listCollections'],
    buildQuery: () => ({}),
    buildBody: () => undefined,
  },

  migration_files_list: {
    key: 'migration_files_list',
    description: 'List migration packages.',
    method: 'GET',
    routes: ['/migrationFiles:list'],
    buildQuery: ({ page = 1, pageSize = 50 }) => ({ page, pageSize }),
    buildBody: () => undefined,
  },
  migration_files_get: {
    key: 'migration_files_get',
    description: 'Get migration package status.',
    method: 'GET',
    routes: ['/migrationFiles:get'],
    buildQuery: ({ filterByTk, fileName, name }) => ({ filterByTk: firstDefined(filterByTk, fileName, name) }),
    buildBody: () => undefined,
  },
  migration_files_create: {
    key: 'migration_files_create',
    description: 'Create migration package from a migration rule.',
    method: 'POST',
    routes: ['/migrationFiles:create'],
    buildQuery: () => ({}),
    buildBody: ({ ruleId, title }) => pickDefined({ ruleId, title }, ['ruleId', 'title']),
  },
  migration_files_destroy: {
    key: 'migration_files_destroy',
    description: 'Delete migration package.',
    method: 'POST',
    routes: ['/migrationFiles:destroy'],
    buildQuery: ({ filterByTk, fileName, name }) => ({ filterByTk: firstDefined(filterByTk, fileName, name) }),
    buildBody: () => undefined,
  },
  migration_files_download: {
    key: 'migration_files_download',
    description: 'Download migration package.',
    method: 'GET',
    routes: ['/migrationFiles:download'],
    response_type: 'binary',
    buildQuery: ({ filterByTk, fileName, name }) => ({ filterByTk: firstDefined(filterByTk, fileName, name) }),
    buildBody: () => undefined,
    buildDownload: ({ outputPath }) => ({
      output_path: outputPath || '',
    }),
  },
  migration_files_download_sql: {
    key: 'migration_files_download_sql',
    description: 'Download generated migration SQL file.',
    method: 'GET',
    routes: ['/migrationFiles:downloadMigrationSql'],
    response_type: 'binary',
    buildQuery: ({ fileName }) => ({ fileName }),
    buildBody: () => undefined,
    buildDownload: ({ outputPath }) => ({
      output_path: outputPath || '',
    }),
  },
  migration_files_get_process: {
    key: 'migration_files_get_process',
    description: 'Get migration process JSON content.',
    method: 'GET',
    routes: ['/migrationFiles:getMigrationProcess'],
    buildQuery: ({ fileName }) => ({ fileName }),
    buildBody: () => undefined,
  },
  migration_files_check: {
    key: 'migration_files_check',
    description: 'Upload migration package and perform package validation check.',
    method: 'POST',
    routes: ['/migrationFiles:check'],
    transport: 'multipart',
    buildQuery: () => ({}),
    buildBody: () => undefined,
    buildMultipart: ({ filePath, fileName }) => ({
      file_field: 'file',
      file_path: filePath || '',
      file_name: fileName || '',
      fields: {},
    }),
  },
  migration_files_check_env_texts: {
    key: 'migration_files_check_env_texts',
    description: 'Validate environment variable placeholders used by migration package.',
    method: 'POST',
    routes: ['/migrationFiles:checkEnvTexts'],
    buildQuery: () => ({}),
    buildBody: ({ envTexts = [] }) => ({ envTexts }),
  },
  migration_files_check_data_conflicts: {
    key: 'migration_files_check_data_conflicts',
    description: 'Check migration data conflicts.',
    method: 'GET',
    routes: ['/migrationFiles:checkDataConflicts'],
    buildQuery: ({ taskId }) => ({ taskId }),
    buildBody: () => undefined,
  },
  migration_files_run_task: {
    key: 'migration_files_run_task',
    description: 'Execute uploaded migration package task.',
    method: 'POST',
    routes: ['/migrationFiles:runTask'],
    buildQuery: () => ({}),
    buildBody: ({ taskId, envTexts = [], skipBackup }) => {
      const body = {
        taskId,
        envTexts,
      };
      if (skipBackup !== undefined) {
        body.skipBackup = skipBackup;
      }
      return body;
    },
  },

  migration_logs_list: {
    key: 'migration_logs_list',
    description: 'List migration logs.',
    method: 'GET',
    routes: ['/migrationLogs:list'],
    buildQuery: ({ page = 1, pageSize = 50 }) => ({ page, pageSize }),
    buildBody: () => undefined,
  },
  migration_logs_get: {
    key: 'migration_logs_get',
    description: 'Get one migration log.',
    method: 'GET',
    routes: ['/migrationLogs:get'],
    buildQuery: ({ filterByTk, logId, id }) => ({ filterByTk: firstDefined(filterByTk, logId, id) }),
    buildBody: () => undefined,
  },
  migration_logs_destroy: {
    key: 'migration_logs_destroy',
    description: 'Delete one migration log.',
    method: 'POST',
    routes: ['/migrationLogs:destroy'],
    buildQuery: ({ filterByTk, logId, id }) => ({ filterByTk: firstDefined(filterByTk, logId, id) }),
    buildBody: () => undefined,
  },
  migration_logs_download: {
    key: 'migration_logs_download',
    description: 'Download one migration log file.',
    method: 'GET',
    routes: ['/migrationLogs:download'],
    response_type: 'binary',
    buildQuery: ({ fileName }) => ({ fileName }),
    buildBody: () => undefined,
    buildDownload: ({ outputPath }) => ({
      output_path: outputPath || '',
    }),
  },

  migration_generate: {
    key: 'migration_generate',
    description: 'Legacy alias for migration package generation.',
    method: 'POST',
    routes: ['/migrationFiles:create'],
    buildQuery: () => ({}),
    buildBody: ({ ruleId, title, migrationTemplate }) => {
      const mode = inferMigrationMode(migrationTemplate);
      const body = pickDefined({ ruleId, title }, ['ruleId', 'title']);
      if (mode) {
        body.mode = mode;
      }
      if (migrationTemplate) {
        body.template = migrationTemplate;
      }
      return body;
    },
  },
  migration_up: {
    key: 'migration_up',
    description: 'Legacy alias for migration package execution.',
    method: 'POST',
    routes: ['/migrationFiles:runTask'],
    buildQuery: () => ({}),
    buildBody: ({ taskId, envTexts = [], skipBackup, migrationTemplate }) => {
      const mode = inferMigrationMode(migrationTemplate);
      const body = {
        taskId,
        envTexts,
      };
      if (skipBackup !== undefined) {
        body.skipBackup = skipBackup;
      }
      if (mode) {
        body.mode = mode;
      }
      if (migrationTemplate) {
        body.template = migrationTemplate;
      }
      return body;
    },
  },
};

function normalizeScalar(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function pushOptionalFlag(args, flag, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  args.push(flag, normalizeScalar(value));
}

function pushArrayFlags(args, flag, value) {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }
  for (const item of value) {
    if (item === undefined || item === null || item === '') {
      continue;
    }
    args.push(flag, String(item));
  }
}

export function createResourceOperationRequest(operationKey, params = {}) {
  const def = RESOURCE_OPERATION_DEFS[operationKey];
  if (!def) {
    return null;
  }
  return {
    key: def.key,
    description: def.description,
    method: def.method,
    routes: [...def.routes],
    query: def.buildQuery(params) || {},
    body: def.buildBody(params),
    transport: def.transport || 'json',
    multipart: def.buildMultipart ? def.buildMultipart(params) : null,
    response_type: def.response_type || 'json',
    download: def.buildDownload ? def.buildDownload(params) : null,
  };
}

export function getResourceOperationKeys() {
  return Object.keys(RESOURCE_OPERATION_DEFS);
}

export function buildRunCtlResourceArgs(request) {
  if (!request || !Array.isArray(request.routes) || request.routes.length === 0) {
    return [];
  }

  const supportedActions = ['list', 'get', 'create', 'update', 'destroy', 'query'];
  let selectedRoute = '';
  for (const route of request.routes) {
    const normalized = String(route || '').replace(/^\/+/, '');
    const colonIndex = normalized.lastIndexOf(':');
    if (colonIndex <= 0) {
      continue;
    }
    const action = normalized.slice(colonIndex + 1);
    if (supportedActions.includes(action)) {
      selectedRoute = normalized;
      break;
    }
  }

  if (!selectedRoute) {
    return [];
  }

  const colonIndex = selectedRoute.lastIndexOf(':');
  const resource = selectedRoute.slice(0, colonIndex);
  const action = selectedRoute.slice(colonIndex + 1);
  const args = ['api', 'resource', action, '--resource', resource];
  const query = request.query || {};

  pushOptionalFlag(args, '--filter-by-tk', query.filterByTk);
  pushOptionalFlag(args, '--page', query.page);
  pushOptionalFlag(args, '--page-size', query.pageSize);
  pushOptionalFlag(args, '--source-id', query.sourceId);

  if (query.filter && typeof query.filter === 'object') {
    args.push('--filter', JSON.stringify(query.filter));
  }
  pushArrayFlags(args, '--sort', query.sort);
  pushArrayFlags(args, '--fields', query.fields);
  pushArrayFlags(args, '--appends', query.appends);
  pushArrayFlags(args, '--except', query.except);

  if (request.body && typeof request.body === 'object') {
    let valuesPayload = request.body;
    if (
      Object.keys(valuesPayload).length === 1 &&
      Object.prototype.hasOwnProperty.call(valuesPayload, 'values') &&
      valuesPayload.values &&
      typeof valuesPayload.values === 'object'
    ) {
      valuesPayload = valuesPayload.values;
    }
    args.push('--values', JSON.stringify(valuesPayload));
  }

  return args;
}
