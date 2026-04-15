param(
  [ValidateSet('all', 'codex', 'claude', 'opencode', 'vscode', 'windsurf', 'cline')]
  [string]$Client = 'all',
  [string]$BaseUrl = 'http://127.0.0.1:13000',
  [ValidateSet('main', 'non-main')]
  [string]$McpScope = 'main',
  [string]$McpAppName = '',
  [ValidateSet('none', 'api-key', 'oauth')]
  [string]$McpAuthMode = 'api-key',
  [string]$TokenEnv = 'NOCOBASE_API_TOKEN',
  [string]$McpPackages = '',
  [string]$ServerName = 'nocobase',
  [string]$OutputFile = ''
)

function Get-McpUrl {
  param(
    [string]$InputBaseUrl,
    [string]$Scope,
    [string]$AppName
  )

  $base = $InputBaseUrl.TrimEnd('/')
  if ($Scope -eq 'non-main') {
    if ([string]::IsNullOrWhiteSpace($AppName)) {
      throw "McpAppName is required when McpScope=non-main."
    }
    return "$base/api/__app/$AppName/mcp"
  }
  return "$base/api/mcp"
}

function Add-PackageHeaderIfNeeded {
  param(
    [hashtable]$Headers,
    [string]$Packages
  )

  if (-not [string]::IsNullOrWhiteSpace($Packages)) {
    $Headers['x-mcp-packages'] = $Packages
  }
}

function Get-ClientList {
  param([string]$Selected)

  if ($Selected -eq 'all') {
    return @('codex', 'claude', 'opencode', 'vscode', 'windsurf', 'cline')
  }
  return @($Selected)
}

function Build-CodexSection {
  param(
    [string]$Url,
    [string]$AuthMode,
    [string]$EnvName,
    [string]$Name,
    [string]$Packages
  )

  $lines = @()
  $lines += '## codex'
  $lines += ''
  switch ($AuthMode) {
    'api-key' {
      $lines += "1. Set token env var:"
      $lines += '```powershell'
      $lines += "`$env:$EnvName=""<your_api_key>"""
      $lines += '```'
      $lines += ''
      $lines += '2. Add server:'
      $lines += '```bash'
      $lines += "codex mcp add $Name --url $Url --bearer-token-env-var $EnvName"
      $lines += '```'
    }
    'oauth' {
      $lines += '```bash'
      $lines += "codex mcp add $Name --url $Url"
      $lines += "codex mcp login $Name --scopes mcp,offline_access"
      $lines += '```'
    }
    default {
      $lines += '```bash'
      $lines += "codex mcp add $Name --url $Url"
      $lines += '```'
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($Packages)) {
    $lines += ''
    $lines += "> note: codex CLI command does not inject `x-mcp-packages` directly; configure package header in MCP server config file if strict package scoping is required."
  }
  return $lines
}

function Build-ClaudeSection {
  param(
    [string]$Url,
    [string]$AuthMode,
    [string]$EnvName,
    [string]$Name,
    [string]$Packages
  )

  $headers = @{
    Accept = 'application/json, text/event-stream'
  }
  if ($AuthMode -eq 'api-key') {
    $headers['Authorization'] = 'Bearer ${' + $EnvName + '}'
  }
  Add-PackageHeaderIfNeeded -Headers $headers -Packages $Packages

  $cfg = @{
    type = 'http'
    url = $Url
    headers = $headers
  }
  $json = $cfg | ConvertTo-Json -Depth 20 -Compress

  return @(
    '## claude'
    ''
    '```bash'
    "claude mcp add-json $Name '$json'"
    '```'
  )
}

function Build-OpenCodeSection {
  param(
    [string]$Url,
    [string]$AuthMode,
    [string]$EnvName,
    [string]$Name,
    [string]$Packages
  )

  $headers = @{
    Accept = 'application/json, text/event-stream'
  }
  if ($AuthMode -eq 'api-key') {
    $headers['Authorization'] = 'Bearer {env:' + $EnvName + '}'
  }
  Add-PackageHeaderIfNeeded -Headers $headers -Packages $Packages

  $server = @{
    type = 'remote'
    url = $Url
    headers = $headers
  }

  $cfg = @{
    '$schema' = 'https://opencode.ai/config.json'
    mcp = @{}
  }
  $cfg.mcp[$Name] = $server
  $json = $cfg | ConvertTo-Json -Depth 20

  return @(
    '## opencode'
    ''
    'Save snippet to `~/.config/opencode/opencode.json`:'
    '```json'
    $json
    '```'
    ''
    'Optional per-agent binding:'
    '```bash'
    "opencode mcp add $Name --agent codex"
    '```'
  )
}

function Build-VscodeSection {
  param(
    [string]$Url,
    [string]$AuthMode,
    [string]$Name,
    [string]$Packages
  )

  $headers = @{
    Accept = 'application/json, text/event-stream'
  }
  $inputs = @()

  if ($AuthMode -eq 'api-key') {
    $headers['Authorization'] = 'Bearer ${input:nocobase_token}'
    $inputs += @{
      type = 'promptString'
      id = 'nocobase_token'
      description = 'NocoBase API token'
      password = $true
    }
  }
  Add-PackageHeaderIfNeeded -Headers $headers -Packages $Packages

  $server = @{
    type = 'http'
    url = $Url
    headers = $headers
  }
  if ($inputs.Count -gt 0) {
    $server['inputs'] = $inputs
  }

  $cfg = @{
    servers = @{}
  }
  $cfg.servers[$Name] = $server
  $json = $cfg | ConvertTo-Json -Depth 20

  return @(
    '## vscode'
    ''
    'Save snippet to `.vscode/mcp.json`:'
    '```json'
    $json
    '```'
  )
}

function Build-WindsurfSection {
  param(
    [string]$Url,
    [string]$AuthMode,
    [string]$EnvName,
    [string]$Name,
    [string]$Packages
  )

  $headers = @{
    Accept = 'application/json, text/event-stream'
  }
  if ($AuthMode -eq 'api-key') {
    $headers['Authorization'] = 'Bearer {{' + $EnvName + '}}'
  }
  Add-PackageHeaderIfNeeded -Headers $headers -Packages $Packages

  $server = @{
    transport = @{
      type = 'http'
      url = $Url
      headers = $headers
    }
  }

  $cfg = @{
    mcpServers = @{}
  }
  $cfg.mcpServers[$Name] = $server
  $json = $cfg | ConvertTo-Json -Depth 20

  return @(
    '## windsurf'
    ''
    'Save snippet to `mcp_config.json`:'
    '```json'
    $json
    '```'
  )
}

function Build-ClineSection {
  param(
    [string]$Url,
    [string]$AuthMode,
    [string]$EnvName,
    [string]$Name,
    [string]$Packages
  )

  $headers = @{
    Accept = 'application/json, text/event-stream'
  }
  if ($AuthMode -eq 'api-key') {
    $headers['Authorization'] = 'Bearer ${' + $EnvName + '}'
  }
  Add-PackageHeaderIfNeeded -Headers $headers -Packages $Packages

  $server = @{
    url = $Url
    headers = $headers
  }

  $cfg = @{
    mcpServers = @{}
  }
  $cfg.mcpServers[$Name] = $server
  $json = $cfg | ConvertTo-Json -Depth 20

  return @(
    '## cline'
    ''
    'Save snippet to `cline_mcp_settings.json`:'
    '```json'
    $json
    '```'
  )
}

$targetUrl = Get-McpUrl -InputBaseUrl $BaseUrl -Scope $McpScope -AppName $McpAppName
$clients = Get-ClientList -Selected $Client

$out = @()
$out += '# MCP Client Template Output'
$out += ''
$out += "- endpoint: $targetUrl"
$out += "- auth_mode: $McpAuthMode"
$out += "- token_env: $TokenEnv"
if (-not [string]::IsNullOrWhiteSpace($McpPackages)) {
  $out += "- mcp_packages: $McpPackages"
}
$out += ''

foreach ($item in $clients) {
  $section = switch ($item) {
    'codex'    { Build-CodexSection -Url $targetUrl -AuthMode $McpAuthMode -EnvName $TokenEnv -Name $ServerName -Packages $McpPackages }
    'claude'   { Build-ClaudeSection -Url $targetUrl -AuthMode $McpAuthMode -EnvName $TokenEnv -Name $ServerName -Packages $McpPackages }
    'opencode' { Build-OpenCodeSection -Url $targetUrl -AuthMode $McpAuthMode -EnvName $TokenEnv -Name $ServerName -Packages $McpPackages }
    'vscode'   { Build-VscodeSection -Url $targetUrl -AuthMode $McpAuthMode -Name $ServerName -Packages $McpPackages }
    'windsurf' { Build-WindsurfSection -Url $targetUrl -AuthMode $McpAuthMode -EnvName $TokenEnv -Name $ServerName -Packages $McpPackages }
    'cline'    { Build-ClineSection -Url $targetUrl -AuthMode $McpAuthMode -EnvName $TokenEnv -Name $ServerName -Packages $McpPackages }
  }
  $out += $section
  $out += ''
}

$result = ($out -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine

if (-not [string]::IsNullOrWhiteSpace($OutputFile)) {
  Set-Content -LiteralPath $OutputFile -Value $result -Encoding UTF8
  Write-Host "written: $OutputFile"
  exit 0
}

Write-Output $result
