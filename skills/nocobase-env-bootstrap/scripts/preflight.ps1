param(
  [int]$Port = 13000,
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

Write-Host "cwd: $(Get-Location)"
Write-Host "timestamp: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"

if (Has-Command docker) {
  if (Test-CommandSuccess -Command docker -Arguments @('--version')) {
    Record-Check pass 'DEP-DOCKER-001' 'Docker detected.'
  } else {
    Record-Check fail 'DEP-DOCKER-001' 'Docker command exists but version check failed.' 'Reinstall Docker.'
  }

  if (Test-CommandSuccess -Command docker -Arguments @('info')) {
    Record-Check pass 'DEP-DOCKER-002' 'Docker daemon is reachable.'
  } else {
    Record-Check fail 'DEP-DOCKER-002' 'Docker daemon is not reachable.' 'Start Docker service.'
  }

  if (Test-CommandSuccess -Command docker -Arguments @('compose', 'version')) {
    Record-Check pass 'DEP-DOCKER-003' 'Docker Compose detected.'
  } else {
    Record-Check fail 'DEP-DOCKER-003' 'Docker Compose check failed.' 'Install Compose v2.'
  }
} else {
  Record-Check warn 'DEP-DOCKER-001' 'Docker not detected.' 'Install from https://docs.docker.com/get-started/get-docker/'
}

if (Has-Command node) {
  $nodeVersion = (& node -v 2>$null) -join ''
  if ($nodeVersion -match '^v(\d+)') {
    $nodeMajor = [int]$Matches[1]
    if ($nodeMajor -ge 20) {
      Record-Check pass 'DEP-NODE-001' "Node.js version is compatible ($nodeVersion)."
    } else {
      Record-Check warn 'DEP-NODE-001' "Node.js is below recommended version 20 ($nodeVersion)." 'Install Node.js >= 20.'
    }
  } else {
    Record-Check warn 'DEP-NODE-001' "Node.js version check failed ($nodeVersion)." 'Install Node.js >= 20.'
  }
} else {
  Record-Check warn 'DEP-NODE-001' 'Node.js not detected.' 'Install Node.js >= 20 from https://nodejs.org/en/download'
}

if (Has-Command yarn) {
  $yarnVersion = (& yarn -v 2>$null) -join ''
  if ($yarnVersion -match '^1\.22\.') {
    Record-Check pass 'DEP-YARN-001' "Yarn classic detected ($yarnVersion)."
  } else {
    Record-Check warn 'DEP-YARN-001' "Yarn is not 1.22.x ($yarnVersion)." 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/'
  }
} else {
  Record-Check warn 'DEP-YARN-001' 'Yarn not detected.' 'Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/'
}

if (Has-Command git) {
  Record-Check pass 'DEP-GIT-001' 'Git detected.'
} else {
  Record-Check warn 'DEP-GIT-001' 'Git not detected.' 'Install from https://git-scm.com/install'
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

if (Test-Path -LiteralPath '.env') {
  $hasDbDialect = Select-String -Path '.env' -Pattern '^[\s]*DB_DIALECT[\s]*=' -Quiet
  if ($hasDbDialect) {
    Record-Check pass 'ENV-001' '.env contains DB_DIALECT.'
  } else {
    Record-Check warn 'ENV-001' '.env found but DB_DIALECT is missing.' 'Set DB_DIALECT before start/upgrade.'
  }
} else {
  Record-Check warn 'ENV-001' '.env not found in current directory.' 'Create .env before start/upgrade.'
}

if ($McpRequired) {
  $targetMcpUrl = Get-McpUrl -TargetPort $Port -InputUrl $McpUrl -InputAppName $McpAppName
  Write-Host "mcp_target: $targetMcpUrl"
  Write-Host "mcp_auth_mode: $McpAuthMode"

  if ($McpPackages) {
    Record-Check pass 'MCP-PKG-001' "x-mcp-packages configured ($McpPackages)."
  } else {
    Record-Check warn 'MCP-PKG-001' 'x-mcp-packages not set; server default exposure will be used.'
  }

  $routeStatus = Get-HttpStatus -Url $targetMcpUrl
  if ($null -eq $routeStatus) {
    Record-Check warn 'MCP-ENDPOINT-001' 'Cannot verify MCP endpoint reachability.' 'Ensure app is running and MCP endpoint is reachable.'
  } elseif ($routeStatus -eq 404) {
    Record-Check fail 'MCP-ENDPOINT-001' "MCP endpoint returned 404 ($targetMcpUrl)." 'Activate MCP Server plugin manually in NocoBase admin, then retry preflight.'
  } else {
    Record-Check pass 'MCP-ENDPOINT-001' "MCP endpoint route responded with status $routeStatus."
  }

  if ($McpAuthMode -eq 'api-key') {
    $token = [System.Environment]::GetEnvironmentVariable($McpTokenEnv)
    if ([string]::IsNullOrWhiteSpace($token)) {
      Record-Check fail 'MCP-AUTH-APIKEY-001' "API key token env '$McpTokenEnv' is missing." "Activate API Keys plugin manually in NocoBase admin, create an API key, set $McpTokenEnv, then retry."
    } else {
      Record-Check pass 'MCP-AUTH-APIKEY-001' "API key token env '$McpTokenEnv' is present."
      $authStatus = Get-HttpStatus -Url $targetMcpUrl -Headers @{ Authorization = "Bearer $token" }
      if ($null -eq $authStatus) {
        Record-Check warn 'MCP-AUTH-APIKEY-002' 'Cannot verify API key auth reachability.' 'Ensure app network path is reachable and retry.'
      } elseif ($authStatus -eq 404) {
        Record-Check fail 'MCP-AUTH-APIKEY-002' "MCP endpoint returned 404 in API key probe ($targetMcpUrl)." 'Activate MCP Server plugin manually in NocoBase admin, then retry.'
      } elseif ($authStatus -in 401, 403) {
        Record-Check fail 'MCP-AUTH-APIKEY-002' "MCP API key auth probe returned $authStatus." 'Activate API Keys plugin manually in NocoBase admin, regenerate API key, update token env var, then retry.'
      } else {
        Record-Check pass 'MCP-AUTH-APIKEY-002' "MCP API key auth probe responded with status $authStatus."
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
