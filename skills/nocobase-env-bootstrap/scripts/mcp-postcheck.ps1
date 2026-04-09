param(
  [int]$Port = 13000,
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

$appBaseUrl = "http://127.0.0.1:$Port"
$pluginManagerUrl = "$appBaseUrl/admin/settings/plugin-manager"
$apiKeysConfigUrl = "$appBaseUrl/admin/settings/api-keys"
$targetMcpUrl = Get-McpUrl -TargetPort $Port -InputUrl $McpUrl -InputAppName $McpAppName
$activationPlugins = Get-ActivationPlugins -AuthMode $McpAuthMode
$pluginEnableHint = Get-PluginEnableHint -Plugins $activationPlugins
$appRestartHint = 'App may still be reloading. Restart app, wait for startup complete, then rerun postcheck.'
$apiKeyCreateHint = "Manual only after plugin bundle is active: open $apiKeysConfigUrl, click Add API Key, copy token, set $McpTokenEnv, then rerun postcheck. Do not auto-create or auto-retrieve token via CLI/API/DB/UI automation."

Write-Host "phase: mcp-postcheck"
Write-Host "timestamp: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
Write-Host "mcp_target: $targetMcpUrl"
Write-Host "mcp_auth_mode: $McpAuthMode"
Write-Host "mcp_activation_plugins: $($activationPlugins -join ',')"
Write-Host "mcp_manual_plugin_manager_url: $pluginManagerUrl"
Write-Host "mcp_manual_api_keys_url: $apiKeysConfigUrl"

if ($McpPackages) {
  Record-Check pass 'MCP-PKG-POST-001' "x-mcp-packages configured ($McpPackages)."
} else {
  Record-Check warn 'MCP-PKG-POST-001' 'x-mcp-packages not set; server default exposure will be used.'
}

$routeStatus = Get-HttpStatus -Url $targetMcpUrl
$routeBlocked = $false
if ($null -eq $routeStatus) {
  Record-Check fail 'MCP-ENDPOINT-POST-001' "MCP endpoint is unreachable ($targetMcpUrl)." 'Ensure app is running and routing is reachable, then retry postcheck.'
  $routeBlocked = $true
} else {
  $routeState = Get-McpEndpointState -StatusCode $routeStatus
  switch ($routeState) {
    'missing_route' {
      Record-Check fail 'MCP-ENDPOINT-POST-001' "MCP endpoint returned 404 ($targetMcpUrl)." $pluginEnableHint
      Emit-ActivatePluginAction -Plugins $activationPlugins
      $routeBlocked = $true
    }
    'app_preparing' {
      Record-Check fail 'MCP-ENDPOINT-POST-001' "MCP endpoint responded with 503 ($targetMcpUrl)." $appRestartHint
      Write-Host 'action_required: restart_app'
      Write-Host 'required_step: restart_app'
      Write-Host 'required_step: rerun_mcp_postcheck'
      $routeBlocked = $true
    }
    'server_error' {
      Record-Check fail 'MCP-ENDPOINT-POST-001' "MCP endpoint responded with $routeStatus ($targetMcpUrl)." $appRestartHint
      Write-Host 'action_required: restart_app'
      Write-Host 'required_step: restart_app'
      Write-Host 'required_step: rerun_mcp_postcheck'
      $routeBlocked = $true
    }
    default {
      Record-Check pass 'MCP-ENDPOINT-POST-001' "MCP endpoint responded with status $routeStatus."
    }
  }
}

if ($McpAuthMode -eq 'api-key') {
  if ($routeBlocked) {
    Record-Check warn 'MCP-AUTH-POST-APIKEY-000' 'Skip token gate because MCP endpoint is not ready yet.' 'Resolve endpoint blocker first, then rerun postcheck.'
  } else {
  $token = [System.Environment]::GetEnvironmentVariable($McpTokenEnv)
  if ([string]::IsNullOrWhiteSpace($token)) {
    Record-Check fail 'MCP-AUTH-POST-APIKEY-001' "API key token env '$McpTokenEnv' is missing." $apiKeyCreateHint
    Write-Host "action_required: provide_api_token"
    Write-Host 'required_step: manual_user_create_token'
    Write-Host 'required_step: manual_user_send_token_in_chat'
    Write-Host 'required_step: no_agent_token_automation'
  } else {
    Record-Check pass 'MCP-AUTH-POST-APIKEY-001' "API key token env '$McpTokenEnv' is present."
    $authStatus = Get-HttpStatus -Url $targetMcpUrl -Headers @{ Authorization = "Bearer $token" }
    if ($null -eq $authStatus) {
      Record-Check fail 'MCP-AUTH-POST-APIKEY-002' 'Cannot verify API key auth reachability.' 'Ensure app route is reachable, then rerun postcheck.'
    } else {
      $authState = Get-McpEndpointState -StatusCode $authStatus
      if ($authState -eq 'missing_route') {
        Record-Check fail 'MCP-AUTH-POST-APIKEY-002' "MCP endpoint returned 404 in API key probe ($targetMcpUrl)." $pluginEnableHint
        Emit-ActivatePluginAction -Plugins $activationPlugins
      } elseif ($authState -eq 'app_preparing' -or $authState -eq 'server_error') {
        Record-Check fail 'MCP-AUTH-POST-APIKEY-002' "MCP endpoint responded with $authStatus in API key probe ($targetMcpUrl)." $appRestartHint
        Write-Host 'action_required: restart_app'
        Write-Host 'required_step: restart_app'
        Write-Host 'required_step: rerun_mcp_postcheck'
      } elseif ($authStatus -in 401, 403) {
        Record-Check fail 'MCP-AUTH-POST-APIKEY-002' "MCP API key auth probe returned $authStatus." "Open $apiKeysConfigUrl, regenerate API key, update $McpTokenEnv, then rerun postcheck."
        Write-Host 'action_required: provide_api_token'
        Write-Host 'required_step: manual_user_create_token'
        Write-Host 'required_step: manual_user_send_token_in_chat'
        Write-Host 'required_step: no_agent_token_automation'
      } else {
        Record-Check pass 'MCP-AUTH-POST-APIKEY-002' "MCP API key auth probe responded with status $authStatus."
      }
    }
  }
  }
} elseif ($McpAuthMode -eq 'oauth') {
  Record-Check warn 'MCP-AUTH-POST-OAUTH-001' 'OAuth postcheck requires interactive client login.' 'Run client login with scopes mcp,offline_access.'
} else {
  Record-Check warn 'MCP-AUTH-POST-000' 'MCP auth probe disabled (mode=none).' 'Use api-key or oauth when MCP access is required.'
}

Write-Host ""
Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"

if ($Fail -gt 0) {
  exit 1
}

exit 0
