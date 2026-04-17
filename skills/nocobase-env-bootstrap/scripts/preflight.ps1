param(
  [int]$Port = 13000,
  [ValidateSet('docker', 'create-nocobase-app', 'git')]
  [string]$InstallMethod = 'docker',
  [ValidateSet('bundled', 'existing')]
  [string]$DbMode = 'bundled',
  [string]$DbDialect = '',
  [string]$DbHost = '',
  [string]$DbPort = '',
  [string]$DbDatabase = '',
  [ValidateSet('existing', 'create')]
  [string]$DbDatabaseMode = 'existing',
  [string]$DbUser = '',
  [string]$DbPassword = '',
  [switch]$McpRequired,
  [ValidateSet('none', 'api-key', 'oauth')]
  [string]$McpAuthMode = 'none',
  [string]$McpUrl = '',
  [string]$McpAppName = '',
  [string]$McpTokenEnv = 'NOCOBASE_API_TOKEN',
  [string]$McpPackages = ''
)

$Fail = 0
$Warn = 0
$Pass = 0
$PostgresInstallUrl = 'https://www.postgresql.org/download/'
$MySqlInstallUrl = 'https://dev.mysql.com/doc/en/installing.html'
$MySqlDownloadUrl = 'https://dev.mysql.com/downloads/mysql'
$MariaDbInstallUrl = 'https://mariadb.org/download/'

function Record-Check {
  param(
    [string]$Level,
    [string]$Id,
    [string]$Message,
    [string]$Fix = ''
  )

  Write-Host ("[{0}] {1}: {2}" -f $Level, $Id, $Message)
  if ($Fix) {
    Write-Host "  fix: $Fix"
  }

  switch ($Level) {
    'pass' { $script:Pass += 1 }
    'warn' { $script:Warn += 1 }
    'fail' { $script:Fail += 1 }
  }
}

function Has-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-CommandSuccess {
  param(
    [string]$Command,
    [string[]]$Arguments = @()
  )

  try {
    & $Command @Arguments *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-DotEnvValue {
  param(
    [string]$Key,
    [string]$FilePath = '.env'
  )

  if (-not (Test-Path -LiteralPath $FilePath)) {
    return ''
  }

  $pattern = "^[\s]*{0}[\s]*=(.*)$" -f [regex]::Escape($Key)
  $match = Select-String -Path $FilePath -Pattern $pattern | Select-Object -Last 1
  if (-not $match) {
    return ''
  }

  $value = $match.Matches[0].Groups[1].Value.Trim()
  if ($value.Length -ge 2) {
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
  }
  return $value
}

function Get-ComposeFilePath {
  $candidates = @('docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml')
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  return ''
}

function Is-MethodDocker {
  return $InstallMethod -eq 'docker'
}

function Is-MethodCreateOrGit {
  return $InstallMethod -in @('create-nocobase-app', 'git')
}

function Is-MethodGit {
  return $InstallMethod -eq 'git'
}

function Emit-DbInstallAction {
  Write-Host 'action_required: install_or_configure_database'
  Write-Host "postgres_install_url: $PostgresInstallUrl"
  Write-Host "mysql_install_url: $MySqlInstallUrl"
  Write-Host "mysql_download_url: $MySqlDownloadUrl"
  Write-Host "mariadb_install_url: $MariaDbInstallUrl"
}

function Test-TcpReachable {
  param(
    [string]$DbHost,
    [int]$PortNumber,
    [int]$TimeoutMs = 3000
  )

  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($DbHost, $PortNumber, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($iar)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-PostgresAuthProbe {
  param(
    [string]$DbHost,
    [string]$PortNumber,
    [string]$Database,
    [string]$User,
    [string]$Password
  )

  if (-not (Has-Command psql)) {
    return $null
  }

  $previous = [System.Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
  [System.Environment]::SetEnvironmentVariable('PGPASSWORD', $Password, 'Process')
  try {
    return Test-CommandSuccess -Command 'psql' -Arguments @('-h', $DbHost, '-p', $PortNumber, '-U', $User, '-d', $Database, '-c', 'select 1;', '-tA')
  } finally {
    [System.Environment]::SetEnvironmentVariable('PGPASSWORD', $previous, 'Process')
  }
}

function Test-MySqlAuthProbe {
  param(
    [string]$DbHost,
    [string]$PortNumber,
    [string]$Database,
    [string]$User,
    [string]$Password
  )

  if (-not (Has-Command mysql)) {
    return $null
  }

  $previous = [System.Environment]::GetEnvironmentVariable('MYSQL_PWD', 'Process')
  [System.Environment]::SetEnvironmentVariable('MYSQL_PWD', $Password, 'Process')
  try {
    return Test-CommandSuccess -Command 'mysql' -Arguments @('--protocol=TCP', '-h', $DbHost, '-P', $PortNumber, '-u', $User, '-D', $Database, '--connect-timeout=5', '-e', 'SELECT 1;')
  } finally {
    [System.Environment]::SetEnvironmentVariable('MYSQL_PWD', $previous, 'Process')
  }
}

function Escape-SqlLiteral {
  param([string]$Value)
  return ($Value -replace "'", "''")
}

function Quote-PostgresIdentifier {
  param([string]$Value)
  return '"' + ($Value -replace '"', '""') + '"'
}

function Quote-MySqlIdentifier {
  param([string]$Value)
  $tick = [char]96
  return $tick + ($Value -replace [string]$tick, [string]($tick + $tick)) + $tick
}

function Ensure-ExternalDatabaseExists {
  param(
    [string]$Dialect,
    [string]$DatabaseMode,
    [string]$DbHost,
    [string]$PortNumber,
    [string]$Database,
    [string]$User,
    [string]$Password
  )

  if ($DatabaseMode -ne 'create') {
    Record-Check pass 'DB-CREATE-001' 'Database creation mode is existing; creation step skipped.'
    return $true
  }

  if ($Dialect -eq 'postgres') {
    if (-not (Has-Command psql)) {
      Record-Check fail 'DB-CREATE-001' 'db_database_mode=create requires psql client for postgres.' 'Install PostgreSQL client tools and retry.'
      return $false
    }

    $dbLiteral = Escape-SqlLiteral -Value $Database
    $dbIdentifier = Quote-PostgresIdentifier -Value $Database
    $checkSql = "SELECT 1 FROM pg_database WHERE datname = '$dbLiteral' LIMIT 1;"
    $previous = [System.Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
    [System.Environment]::SetEnvironmentVariable('PGPASSWORD', $Password, 'Process')
    try {
      $checkResult = (& psql -h $DbHost -p $PortNumber -U $User -d postgres -tA -v ON_ERROR_STOP=1 -c $checkSql 2>$null) -join ''
      if ($LASTEXITCODE -ne 0) {
        Record-Check fail 'DB-CREATE-001' "Failed to check target database existence ($Database)." 'Check DB_HOST/DB_PORT/DB_USER and network connectivity, then retry.'
        return $false
      }

      if (($checkResult.Trim()) -eq '1') {
        Record-Check pass 'DB-CREATE-001' "Target database already exists ($Database)."
        return $true
      }

      & psql -h $DbHost -p $PortNumber -U $User -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbIdentifier;" *> $null
      if ($LASTEXITCODE -eq 0) {
        Record-Check pass 'DB-CREATE-001' "Created target database ($Database)."
        return $true
      }

      Record-Check fail 'DB-CREATE-001' "Failed to create target database ($Database)." 'Check DB_USER permissions (CREATE DATABASE) or create database manually, then retry.'
      return $false
    } finally {
      [System.Environment]::SetEnvironmentVariable('PGPASSWORD', $previous, 'Process')
    }
  }

  if (-not (Has-Command mysql)) {
    Record-Check fail 'DB-CREATE-001' 'db_database_mode=create requires mysql client for mysql/mariadb.' 'Install mysql client tools and retry.'
    return $false
  }

  $dbLiteral = Escape-SqlLiteral -Value $Database
  $dbIdentifier = Quote-MySqlIdentifier -Value $Database
  $checkSql = "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '$dbLiteral' LIMIT 1;"
  $previous = [System.Environment]::GetEnvironmentVariable('MYSQL_PWD', 'Process')
  [System.Environment]::SetEnvironmentVariable('MYSQL_PWD', $Password, 'Process')
  try {
    $checkResult = (& mysql --protocol=TCP -h $DbHost -P $PortNumber -u $User --connect-timeout=5 --batch --skip-column-names -e $checkSql 2>$null) -join ''
    if ($LASTEXITCODE -ne 0) {
      Record-Check fail 'DB-CREATE-001' "Failed to check target database existence ($Database)." 'Check DB_HOST/DB_PORT/DB_USER and network connectivity, then retry.'
      return $false
    }

    if (($checkResult.Trim()) -eq $Database) {
      Record-Check pass 'DB-CREATE-001' "Target database already exists ($Database)."
      return $true
    }

    & mysql --protocol=TCP -h $DbHost -P $PortNumber -u $User --connect-timeout=5 -e "CREATE DATABASE IF NOT EXISTS $dbIdentifier;" *> $null
    if ($LASTEXITCODE -eq 0) {
      Record-Check pass 'DB-CREATE-001' "Created target database ($Database)."
      return $true
    }

    Record-Check fail 'DB-CREATE-001' "Failed to create target database ($Database)." 'Check DB_USER permissions (CREATE DATABASE) or create database manually, then retry.'
    return $false
  } finally {
    [System.Environment]::SetEnvironmentVariable('MYSQL_PWD', $previous, 'Process')
  }
}

function Test-IsPlaceholderAppKey {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  $normalized = $Value.Trim().ToLowerInvariant()
  if ($normalized -match 'change[-_]?me') {
    return $true
  }
  if ($normalized -match 'please[-_]?change') {
    return $true
  }
  if ($normalized -match 'secret[-_]?key') {
    return $true
  }

  return $false
}

function Test-PortInUse {
  param([int]$TargetPort)

  try {
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
      $conn = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
      return [bool]$conn
    }

    $match = netstat -ano 2>$null | Select-String -Pattern "[:\.]$TargetPort\s+.*LISTENING"
    return [bool]$match
  } catch {
    return $null
  }
}

function Get-HttpStatus {
  param(
    [string]$Url,
    [hashtable]$Headers = @{}
  )

  try {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Method = 'GET'
    $request.Timeout = 8000
    foreach ($name in $Headers.Keys) {
      $request.Headers[$name] = $Headers[$name]
    }

    try {
      $response = $request.GetResponse()
      $statusCode = [int]$response.StatusCode
      $response.Close()
      return $statusCode
    } catch [System.Net.WebException] {
      if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        $_.Exception.Response.Close()
        return $statusCode
      }
      return $null
    }
  } catch {
    return $null
  }
}

function Get-McpEndpointState {
  param([int]$StatusCode)

  if ($StatusCode -eq 404) {
    return 'missing_route'
  }

  if ($StatusCode -eq 503) {
    return 'app_preparing'
  }

  if ($StatusCode -ge 500) {
    return 'server_error'
  }

  return 'ready'
}

function Get-McpUrl {
  param(
    [int]$TargetPort,
    [string]$InputUrl,
    [string]$InputAppName
  )

  if ($InputUrl) {
    return $InputUrl
  }

  if ($InputAppName) {
    return "http://127.0.0.1:$TargetPort/api/__app/$InputAppName/mcp"
  }

  return "http://127.0.0.1:$TargetPort/api/mcp"
}

function Get-ActivationPlugins {
  param([string]$AuthMode)

  $plugins = @('@nocobase/plugin-mcp-server')
  switch ($AuthMode) {
    'api-key' { $plugins += '@nocobase/plugin-api-keys' }
    'oauth' { $plugins += '@nocobase/plugin-idp-oauth' }
  }
  return ,$plugins
}

function Get-PluginStepId {
  param([string]$PluginName)

  switch ($PluginName) {
    '@nocobase/plugin-mcp-server' { return 'plugin_manage_enable_mcp_server' }
    '@nocobase/plugin-api-keys' { return 'plugin_manage_enable_api_keys' }
    '@nocobase/plugin-idp-oauth' { return 'plugin_manage_enable_idp_oauth' }
    default { return 'plugin_manage_enable_plugin' }
  }
}

function Get-PluginEnableHint {
  param([string[]]$Plugins)

  $pluginArgs = ($Plugins -join ' ')
  $pluginList = ($Plugins -join ', ')
  return "Run fixed sequence: Use `$nocobase-plugin-manage enable $pluginArgs -> restart app -> rerun postcheck. Enable bundle: $pluginList. Do not bypass plugin-manage with ad-hoc container shell plugin commands; plugin-manage may auto-select docker CLI internally."
}

function Emit-ActivatePluginAction {
  param([string[]]$Plugins)

  Write-Host 'action_required: activate_plugin'
  foreach ($plugin in $Plugins) {
    $stepId = Get-PluginStepId -PluginName $plugin
    Write-Host "required_step: $stepId"
  }
  Write-Host 'required_step: restart_app'
  Write-Host 'required_step: rerun_mcp_postcheck'
}

Write-Host "cwd: $(Get-Location)"
Write-Host "timestamp: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
Write-Host "install_method: $InstallMethod"

$dbDialectFromEnv = Get-DotEnvValue -Key 'DB_DIALECT'
$dbHostFromEnv = Get-DotEnvValue -Key 'DB_HOST'
$dbPortFromEnv = Get-DotEnvValue -Key 'DB_PORT'
$dbDatabaseFromEnv = Get-DotEnvValue -Key 'DB_DATABASE'
$dbUserFromEnv = Get-DotEnvValue -Key 'DB_USER'
$dbPasswordFromEnv = Get-DotEnvValue -Key 'DB_PASSWORD'

$dbDialectResolved = if ($DbDialect) { $DbDialect } elseif ($dbDialectFromEnv) { $dbDialectFromEnv } else { 'postgres' }
if ($dbDialectResolved -notin @('postgres', 'mysql', 'mariadb')) {
  Record-Check fail 'INPUT-003' "Unsupported DB_DIALECT '$dbDialectResolved'." 'Use DB_DIALECT=postgres, DB_DIALECT=mysql, or DB_DIALECT=mariadb.'
}
$dbHostResolved = if ($DbHost) { $DbHost } elseif ($dbHostFromEnv) { $dbHostFromEnv } else { '' }
$dbPortResolved = if ($DbPort) { $DbPort } elseif ($dbPortFromEnv) { $dbPortFromEnv } else { '' }
$dbDatabaseResolved = if ($DbDatabase) { $DbDatabase } elseif ($dbDatabaseFromEnv) { $dbDatabaseFromEnv } else { '' }
$dbUserResolved = if ($DbUser) { $DbUser } elseif ($dbUserFromEnv) { $dbUserFromEnv } else { '' }
$dbPasswordResolved = if ($DbPassword) { $DbPassword } elseif ($dbPasswordFromEnv) { $dbPasswordFromEnv } else { '' }

$dbModeResolved = $DbMode
$hasExternalDbInputs = -not [string]::IsNullOrWhiteSpace($dbHostResolved) -or
  -not [string]::IsNullOrWhiteSpace($dbPortResolved) -or
  -not [string]::IsNullOrWhiteSpace($dbDatabaseResolved) -or
  -not [string]::IsNullOrWhiteSpace($dbUserResolved) -or
  -not [string]::IsNullOrWhiteSpace($dbPasswordResolved)
$dbDatabaseModeResolved = $DbDatabaseMode

if (Is-MethodCreateOrGit) {
  $dbModeResolved = 'existing'
} elseif ((Is-MethodDocker) -and $dbModeResolved -eq 'bundled' -and $hasExternalDbInputs) {
  $dbModeResolved = 'existing'
}

if ([string]::IsNullOrWhiteSpace($dbPortResolved)) {
  if ($dbDialectResolved -eq 'postgres') {
    $dbPortResolved = '5432'
  } else {
    $dbPortResolved = '3306'
  }
}

Write-Host "db_mode: $dbModeResolved"
Write-Host "db_dialect: $dbDialectResolved"
Write-Host "db_database_mode: $dbDatabaseModeResolved"
if (-not [string]::IsNullOrWhiteSpace($dbHostResolved)) {
  Write-Host "db_host: $dbHostResolved"
}

if (Has-Command docker) {
  if (Test-CommandSuccess -Command docker -Arguments @('--version')) {
    Record-Check pass 'DEP-DOCKER-001' 'Docker detected.'
  } else {
    if (Is-MethodDocker) {
      Record-Check fail 'DEP-DOCKER-001' 'Docker command exists but version check failed.' 'Reinstall Docker.'
    } else {
      Record-Check warn 'DEP-DOCKER-001' "Docker command exists but version check failed (optional for method=$InstallMethod)." 'Reinstall Docker if you plan to use docker method.'
    }
  }

  if (Test-CommandSuccess -Command docker -Arguments @('info')) {
    Record-Check pass 'DEP-DOCKER-002' 'Docker daemon is reachable.'
  } else {
    if (Is-MethodDocker) {
      Record-Check fail 'DEP-DOCKER-002' 'Docker daemon is not reachable.' 'Start Docker service.'
    } else {
      Record-Check warn 'DEP-DOCKER-002' "Docker daemon is not reachable (optional for method=$InstallMethod)." 'Start Docker service if you plan to use docker method.'
    }
  }

  if (Test-CommandSuccess -Command docker -Arguments @('compose', 'version')) {
    Record-Check pass 'DEP-DOCKER-003' 'Docker Compose detected.'
  } else {
    if (Is-MethodDocker) {
      Record-Check fail 'DEP-DOCKER-003' 'Docker Compose check failed.' 'Install Compose v2.'
    } else {
      Record-Check warn 'DEP-DOCKER-003' "Docker Compose check failed (optional for method=$InstallMethod)." 'Install Compose v2 if you plan to use docker method.'
    }
  }
} else {
  if (Is-MethodDocker) {
    Record-Check fail 'DEP-DOCKER-001' 'Docker not detected.' 'Install from https://docs.docker.com/get-started/get-docker/'
  } else {
    Record-Check warn 'DEP-DOCKER-001' "Docker not detected (optional for method=$InstallMethod)." 'Install Docker only if docker method is needed.'
  }
}

if (Has-Command node) {
  $nodeVersion = (& node -v 2>$null) -join ''
  if ($nodeVersion -match '^v(\d+)') {
    $nodeMajor = [int]$Matches[1]
    if ($nodeMajor -ge 20) {
      Record-Check pass 'DEP-NODE-001' "Node.js version is compatible ($nodeVersion)."
    } else {
      if (Is-MethodCreateOrGit) {
        Record-Check fail 'DEP-NODE-001' "Node.js is below required version 20 for method=$InstallMethod ($nodeVersion)." 'Install Node.js >= 20.'
      } else {
        Record-Check warn 'DEP-NODE-001' "Node.js is below recommended version 20 ($nodeVersion)." 'Install Node.js >= 20.'
      }
    }
  } else {
    if (Is-MethodCreateOrGit) {
      Record-Check fail 'DEP-NODE-001' "Node.js version check failed for method=$InstallMethod ($nodeVersion)." 'Install Node.js >= 20.'
    } else {
      Record-Check warn 'DEP-NODE-001' "Node.js version check failed ($nodeVersion)." 'Install Node.js >= 20.'
    }
  }
} else {
  if (Is-MethodCreateOrGit) {
    Record-Check fail 'DEP-NODE-001' "Node.js not detected (required for method=$InstallMethod)." 'Install Node.js >= 20 from https://nodejs.org/en/download'
  } else {
    Record-Check warn 'DEP-NODE-001' 'Node.js not detected.' 'Install Node.js >= 20 from https://nodejs.org/en/download'
  }
}

if (Has-Command yarn) {
  $yarnVersion = (& yarn -v 2>$null) -join ''
  if ($yarnVersion -match '^1\.22\.') {
    Record-Check pass 'DEP-YARN-001' "Yarn classic detected ($yarnVersion)."
  } else {
    if (Is-MethodCreateOrGit) {
      Record-Check fail 'DEP-YARN-001' "Yarn is not 1.22.x (required for method=$InstallMethod, current=$yarnVersion)." 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/'
    } else {
      Record-Check warn 'DEP-YARN-001' "Yarn is not 1.22.x ($yarnVersion)." 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/'
    }
  }
} else {
  if (Is-MethodCreateOrGit) {
    Record-Check fail 'DEP-YARN-001' "Yarn not detected (required for method=$InstallMethod)." 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/'
  } else {
    Record-Check warn 'DEP-YARN-001' 'Yarn not detected.' 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/'
  }
}

if (Has-Command git) {
  Record-Check pass 'DEP-GIT-001' 'Git detected.'
} else {
  if (Is-MethodGit) {
    Record-Check fail 'DEP-GIT-001' 'Git not detected (required for method=git).' 'Install from https://git-scm.com/install'
  } else {
    Record-Check warn 'DEP-GIT-001' 'Git not detected.' 'Install from https://git-scm.com/install'
  }
}

$portInUse = Test-PortInUse -TargetPort $Port
if ($null -eq $portInUse) {
  Record-Check warn 'RUNTIME-PORT-001' "Cannot check port $Port."
} elseif ($portInUse) {
  Record-Check warn 'RUNTIME-PORT-001' "Port $Port is in use." 'Choose another APP_PORT or stop conflicting process.'
} else {
  Record-Check pass 'RUNTIME-PORT-001' "Port $Port is available."
}

if ((Get-Location).Path -match ' ') {
  Record-Check warn 'PATH-001' 'Current path contains spaces.' 'Use a path without spaces.'
} else {
  Record-Check pass 'PATH-001' 'Current path has no spaces.'
}

try {
  [System.Net.Dns]::GetHostAddresses('docs.nocobase.com') | Out-Null
  Record-Check pass 'NET-001' 'DNS resolution for docs.nocobase.com succeeded.'
} catch {
  Record-Check warn 'NET-001' 'Could not verify DNS reachability.' 'If offline/restricted, use offline package workflow.'
}

$composeFilePath = Get-ComposeFilePath
$hasDbDialectInCompose = $false
if ($composeFilePath) {
  $hasDbDialectInCompose = Select-String -Path $composeFilePath -Pattern 'DB_DIALECT=' -Quiet
}

if ($dbModeResolved -eq 'existing') {
  if ($dbDialectResolved -in @('postgres', 'mysql', 'mariadb')) {
    Record-Check pass 'DB-REQ-001' "External DB dialect is supported ($dbDialectResolved)."
  } else {
    Record-Check fail 'DB-REQ-001' "External DB mode requires db_dialect=postgres|mysql|mariadb (current=$dbDialectResolved)." 'Set DB_DIALECT to postgres, mysql, or mariadb.'
  }

  $missingDbFields = @()
  if ([string]::IsNullOrWhiteSpace($dbHostResolved)) { $missingDbFields += 'DB_HOST' }
  if ([string]::IsNullOrWhiteSpace($dbPortResolved)) { $missingDbFields += 'DB_PORT' }
  if ([string]::IsNullOrWhiteSpace($dbDatabaseResolved)) { $missingDbFields += 'DB_DATABASE' }
  if ([string]::IsNullOrWhiteSpace($dbUserResolved)) { $missingDbFields += 'DB_USER' }
  if ([string]::IsNullOrWhiteSpace($dbPasswordResolved)) { $missingDbFields += 'DB_PASSWORD' }

  if ($missingDbFields.Count -gt 0) {
    Record-Check fail 'DB-REQ-002' "External DB mode is missing required fields: $($missingDbFields -join ', ')." "Provide DB_* values or install PostgreSQL/MySQL/MariaDB first. PostgreSQL: $PostgresInstallUrl | MySQL: $MySqlInstallUrl | MariaDB: $MariaDbInstallUrl"
    Emit-DbInstallAction
  } else {
    Record-Check pass 'DB-REQ-002' 'External DB required fields are present.'
    $dbCreateReady = $true

    if ($dbPortResolved -notmatch '^\d+$') {
      Record-Check fail 'DB-REQ-003' "DB_PORT must be numeric (current=$dbPortResolved)." 'Set DB_PORT to a valid numeric port.'
      $dbCreateReady = $false
    } elseif (Test-TcpReachable -DbHost $dbHostResolved -PortNumber ([int]$dbPortResolved)) {
      Record-Check pass 'DB-CONN-001' "Database endpoint is reachable (${dbHostResolved}:$dbPortResolved)."
    } else {
      Record-Check fail 'DB-CONN-001' "Database endpoint is not reachable (${dbHostResolved}:$dbPortResolved)." "Start database service or install one: PostgreSQL $PostgresInstallUrl | MySQL $MySqlInstallUrl | MariaDB $MariaDbInstallUrl"
      Emit-DbInstallAction
      $dbCreateReady = $false
    }

    if ($dbCreateReady) {
      $dbCreateReady = Ensure-ExternalDatabaseExists -Dialect $dbDialectResolved -DatabaseMode $dbDatabaseModeResolved -DbHost $dbHostResolved -PortNumber $dbPortResolved -Database $dbDatabaseResolved -User $dbUserResolved -Password $dbPasswordResolved
    }

    if ($dbCreateReady -and $dbDialectResolved -eq 'postgres') {
      $pgProbe = Test-PostgresAuthProbe -DbHost $dbHostResolved -PortNumber $dbPortResolved -Database $dbDatabaseResolved -User $dbUserResolved -Password $dbPasswordResolved
      if ($null -eq $pgProbe) {
        Record-Check warn 'DB-AUTH-001' 'psql client is not available; skipped PostgreSQL auth probe.' 'Install psql for stronger preflight verification.'
      } elseif ($pgProbe) {
        Record-Check pass 'DB-AUTH-001' 'PostgreSQL auth probe succeeded.'
      } else {
        Record-Check fail 'DB-AUTH-001' "PostgreSQL auth probe failed (host=$dbHostResolved, db=$dbDatabaseResolved, user=$dbUserResolved)." 'Check DB_DATABASE/DB_USER/DB_PASSWORD and permissions.'
      }
    } elseif ($dbCreateReady -and $dbDialectResolved -in @('mysql', 'mariadb')) {
      $myProbe = Test-MySqlAuthProbe -DbHost $dbHostResolved -PortNumber $dbPortResolved -Database $dbDatabaseResolved -User $dbUserResolved -Password $dbPasswordResolved
      if ($null -eq $myProbe) {
        Record-Check warn 'DB-AUTH-001' 'mysql client is not available; skipped MySQL/MariaDB auth probe.' 'Install mysql client for stronger preflight verification.'
      } elseif ($myProbe) {
        Record-Check pass 'DB-AUTH-001' 'MySQL/MariaDB auth probe succeeded.'
      } else {
        Record-Check fail 'DB-AUTH-001' "MySQL/MariaDB auth probe failed (host=$dbHostResolved, db=$dbDatabaseResolved, user=$dbUserResolved)." 'Check DB_DATABASE/DB_USER/DB_PASSWORD and permissions.'
      }
    }
  }
} else {
  Record-Check pass 'DB-REQ-000' 'Using bundled database mode.'
}

if ($dbModeResolved -eq 'bundled' -and (Is-MethodDocker)) {
  if (-not [string]::IsNullOrWhiteSpace($dbDialectFromEnv)) {
    Record-Check pass 'ENV-001' '.env contains DB_DIALECT.'
  } elseif ($hasDbDialectInCompose) {
    Record-Check pass 'ENV-001' "$composeFilePath contains DB_DIALECT for Docker runtime."
  } elseif (Test-Path -LiteralPath '.env') {
    Record-Check warn 'ENV-001' '.env found but DB_DIALECT is missing, and compose file has no DB_DIALECT.' 'Set DB_DIALECT in .env or docker-compose app environment before start/upgrade.'
  } else {
    Record-Check warn 'ENV-001' '.env not found and compose file has no DB_DIALECT.' 'Create .env with DB_DIALECT or add DB_DIALECT to docker-compose app environment before start/upgrade.'
  }
} else {
  Record-Check pass 'ENV-001' "External DB mode will use provided DB_* values (method=$InstallMethod)."
}

$appKey = Get-DotEnvValue -Key 'APP_KEY'
if ([string]::IsNullOrWhiteSpace($appKey)) {
  $appKey = [System.Environment]::GetEnvironmentVariable('APP_KEY')
}

if ([string]::IsNullOrWhiteSpace($appKey)) {
  $hasProjectMarker = (Test-Path -LiteralPath '.env') -or (Test-Path -LiteralPath 'package.json') -or (-not [string]::IsNullOrWhiteSpace($composeFilePath))
  if ($hasProjectMarker) {
    Record-Check fail 'ENV-APPKEY-001' 'APP_KEY is missing for existing project files.' "Generate and set APP_KEY (for example: [System.BitConverter]::ToString((1..32 | ForEach-Object {Get-Random -Max 256})).Replace('-', '').ToLower())."
  } else {
    Record-Check warn 'ENV-APPKEY-001' 'APP_KEY is not set yet; check deferred to local install script generation stage.'
  }
} elseif (Test-IsPlaceholderAppKey -Value $appKey) {
  Record-Check fail 'ENV-APPKEY-001' 'APP_KEY uses an insecure placeholder-like value.' 'Set a random APP_KEY with at least 32 characters; avoid values containing change-me/secret-key.'
} elseif ($appKey.Length -lt 32) {
  Record-Check fail 'ENV-APPKEY-001' "APP_KEY is too short (length=$($appKey.Length))." 'Set a random APP_KEY with at least 32 characters.'
} elseif ($appKey -match '\s') {
  Record-Check fail 'ENV-APPKEY-001' 'APP_KEY must not include whitespace.' 'Set a random APP_KEY without spaces.'
} else {
  Record-Check pass 'ENV-APPKEY-001' 'APP_KEY is present and appears non-placeholder.'
}

if ($composeFilePath) {
  if (Select-String -Path $composeFilePath -Pattern 'APP_KEY=\$\{APP_KEY:-please-change-me\}' -Quiet) {
    Record-Check fail 'ENV-APPKEY-002' "$composeFilePath still contains insecure APP_KEY fallback 'please-change-me'." 'Use required form: APP_KEY=${APP_KEY:?APP_KEY is required. Set a random value in .env}'
  } elseif (Select-String -Path $composeFilePath -Pattern 'APP_KEY=\$\{APP_KEY:\?' -Quiet) {
    Record-Check pass 'ENV-APPKEY-002' "$composeFilePath enforces APP_KEY as required."
  } else {
    Record-Check warn 'ENV-APPKEY-002' "$composeFilePath APP_KEY rule is not in required-form check." 'Ensure compose requires APP_KEY and avoids placeholder fallbacks.'
  }
}

if ($McpRequired) {
  $appBaseUrl = "http://127.0.0.1:$Port"
  $pluginManagerUrl = "$appBaseUrl/admin/settings/plugin-manager"
  $apiKeysConfigUrl = "$appBaseUrl/admin/settings/api-keys"
  $targetMcpUrl = Get-McpUrl -TargetPort $Port -InputUrl $McpUrl -InputAppName $McpAppName
  $activationPlugins = Get-ActivationPlugins -AuthMode $McpAuthMode
  $pluginEnableHint = Get-PluginEnableHint -Plugins $activationPlugins
  $appRestartHint = 'App may still be reloading. Restart app, wait for startup complete, then retry.'
  Write-Host "mcp_target: $targetMcpUrl"
  Write-Host "mcp_auth_mode: $McpAuthMode"
  Write-Host "mcp_activation_plugins: $($activationPlugins -join ',')"
  Write-Host "mcp_manual_plugin_manager_url: $pluginManagerUrl"
  Write-Host "mcp_manual_api_keys_url: $apiKeysConfigUrl"

  if ($McpPackages) {
    Record-Check pass 'MCP-PKG-001' "x-mcp-packages configured ($McpPackages)."
  } else {
    Record-Check warn 'MCP-PKG-001' 'x-mcp-packages not set; server default exposure will be used.'
  }

  $routeStatus = Get-HttpStatus -Url $targetMcpUrl
  $routeBlocked = $false
  if ($null -eq $routeStatus) {
    Record-Check warn 'MCP-ENDPOINT-001' 'Cannot verify MCP endpoint reachability.' 'Ensure app is running and MCP endpoint is reachable.'
    $routeBlocked = $true
  } else {
    $routeState = Get-McpEndpointState -StatusCode $routeStatus
    switch ($routeState) {
      'missing_route' {
        Record-Check fail 'MCP-ENDPOINT-001' "MCP endpoint returned 404 ($targetMcpUrl)." $pluginEnableHint
        Emit-ActivatePluginAction -Plugins $activationPlugins
        $routeBlocked = $true
      }
      'app_preparing' {
        Record-Check fail 'MCP-ENDPOINT-001' "MCP endpoint responded with 503 ($targetMcpUrl)." $appRestartHint
        Write-Host 'action_required: restart_app'
        Write-Host 'required_step: restart_app'
        Write-Host 'required_step: rerun_mcp_postcheck'
        $routeBlocked = $true
      }
      'server_error' {
        Record-Check fail 'MCP-ENDPOINT-001' "MCP endpoint responded with $routeStatus ($targetMcpUrl)." $appRestartHint
        Write-Host 'action_required: restart_app'
        Write-Host 'required_step: restart_app'
        Write-Host 'required_step: rerun_mcp_postcheck'
        $routeBlocked = $true
      }
      default {
        Record-Check pass 'MCP-ENDPOINT-001' "MCP endpoint route responded with status $routeStatus."
      }
    }
  }

  if ($McpAuthMode -eq 'api-key') {
    if ($routeBlocked) {
      Record-Check warn 'MCP-AUTH-APIKEY-000' 'Skip token gate because MCP endpoint is not ready yet.' 'Resolve endpoint blocker first, then rerun preflight/postcheck.'
    } else {
      $token = [System.Environment]::GetEnvironmentVariable($McpTokenEnv)
      if ([string]::IsNullOrWhiteSpace($token)) {
        Record-Check warn 'MCP-AUTH-APIKEY-001' "API key token env '$McpTokenEnv' is missing." "Token will be auto-generated in mcp-postcheck using CLI; if auto generation fails, fallback to manual API keys page."
      } else {
        Record-Check pass 'MCP-AUTH-APIKEY-001' "API key token env '$McpTokenEnv' is present."
        $authStatus = Get-HttpStatus -Url $targetMcpUrl -Headers @{ Authorization = "Bearer $token" }
        if ($null -eq $authStatus) {
          Record-Check warn 'MCP-AUTH-APIKEY-002' 'Cannot verify API key auth reachability.' 'Ensure app network path is reachable and retry.'
        } else {
          $authState = Get-McpEndpointState -StatusCode $authStatus
          if ($authState -eq 'missing_route') {
            Record-Check fail 'MCP-AUTH-APIKEY-002' "MCP endpoint returned 404 in API key probe ($targetMcpUrl)." $pluginEnableHint
            Emit-ActivatePluginAction -Plugins $activationPlugins
          } elseif ($authState -eq 'app_preparing' -or $authState -eq 'server_error') {
            Record-Check fail 'MCP-AUTH-APIKEY-002' "MCP endpoint responded with $authStatus in API key probe ($targetMcpUrl)." $appRestartHint
            Write-Host 'action_required: restart_app'
            Write-Host 'required_step: restart_app'
            Write-Host 'required_step: rerun_mcp_postcheck'
          } elseif ($authStatus -in 401, 403) {
            Record-Check warn 'MCP-AUTH-APIKEY-002' "MCP API key auth probe returned $authStatus." "Token may be expired; mcp-postcheck will auto-refresh token via CLI, with manual fallback only if automation fails."
          } else {
            Record-Check pass 'MCP-AUTH-APIKEY-002' "MCP API key auth probe responded with status $authStatus."
          }
        }
      }
    }
  } elseif ($McpAuthMode -eq 'oauth') {
    Record-Check warn 'MCP-AUTH-OAUTH-001' 'OAuth flow requires interactive login and cannot be fully validated in preflight.' 'Run client login with scopes mcp,offline_access after startup.'
  } else {
    Record-Check warn 'MCP-AUTH-000' 'MCP auth probe disabled (mode=none).' 'Use api-key or oauth mode when MCP access is required.'
  }
}

Write-Host ""
Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"

if ($Fail -gt 0) {
  exit 1
}

exit 0
