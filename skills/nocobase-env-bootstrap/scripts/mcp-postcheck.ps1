param(
  [int]$Port = 13000,
  [ValidateSet('none', 'api-key', 'oauth')]
  [string]$McpAuthMode = 'none',
  [string]$McpUrl = '',
  [string]$McpAppName = '',
  [string]$McpTokenEnv = 'NOCOBASE_API_TOKEN',
  [string]$McpPackages = '',
  [switch]$DisableAutoApiKey = $false,
  [string]$AutoApiKeyName = 'mcp_auto_token',
  [string]$AutoApiKeyUsername = 'nocobase',
  [string]$AutoApiKeyRole = 'root',
  [string]$AutoApiKeyExpiresIn = '30d',
  [string]$AutoApiKeyAppService = 'app',
  [string]$AutoApiKeyComposeFile = ''
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
      if ($name -ieq 'Accept') {
        $request.Accept = [string]$Headers[$name]
        continue
      }
      if ($name -ieq 'Content-Type') {
        continue
      }
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

function Invoke-McpRpc {
  param(
    [string]$Url,
    [string]$PayloadJson,
    [hashtable]$Headers = @{}
  )

  $statusCode = $null
  $body = ''
  $responseHeaders = @{}
  $transportError = ''

  try {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Method = 'POST'
    $request.Timeout = 15000
    $request.ContentType = 'application/json'
    $request.Accept = 'application/json, text/event-stream'

    foreach ($name in $Headers.Keys) {
      if ($name -eq 'Accept' -or $name -eq 'Content-Type') {
        continue
      }
      $request.Headers[$name] = $Headers[$name]
    }

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($PayloadJson)
    $request.ContentLength = $bytes.Length
    $requestStream = $request.GetRequestStream()
    $requestStream.Write($bytes, 0, $bytes.Length)
    $requestStream.Close()

    $response = $request.GetResponse()
    $statusCode = [int]$response.StatusCode
    foreach ($key in $response.Headers.AllKeys) {
      $responseHeaders[$key] = $response.Headers[$key]
    }
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $body = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $response = $_.Exception.Response
      $statusCode = [int]$response.StatusCode
      foreach ($key in $response.Headers.AllKeys) {
        $responseHeaders[$key] = $response.Headers[$key]
      }
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      $body = $reader.ReadToEnd()
      $reader.Close()
      $response.Close()
    } else {
      $transportError = $_.Exception.Message
    }
  } catch {
    $transportError = $_.Exception.Message
  }

  return [pscustomobject]@{
    StatusCode      = $statusCode
    Body            = $body
    ResponseHeaders = $responseHeaders
    TransportError  = $transportError
  }
}

function ConvertFrom-McpEnvelope {
  param([string]$Body)

  if ([string]::IsNullOrWhiteSpace($Body)) {
    return $null
  }

  $trimmed = $Body.Trim()
  if ($trimmed.StartsWith('{') -or $trimmed.StartsWith('[')) {
    try {
      return $trimmed | ConvertFrom-Json -Depth 100
    } catch {
      try {
        return $trimmed | ConvertFrom-Json
      } catch {
        return $null
      }
    }
  }

  $dataLines = $trimmed -split "(`r`n|`n)" |
    Where-Object { $_ -match '^\s*data:\s*' } |
    ForEach-Object { ($_ -replace '^\s*data:\s*', '').Trim() } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -ne '[DONE]' }

  foreach ($line in ($dataLines | Select-Object -Last 10)) {
    try {
      return $line | ConvertFrom-Json -Depth 100
    } catch {
      try {
        return $line | ConvertFrom-Json
      } catch {
      }
    }
  }

  return $null
}

function Get-McpErrorText {
  param($Envelope)

  if ($null -eq $Envelope) {
    return ''
  }

  if ($Envelope.PSObject.Properties.Name -contains 'error' -and $Envelope.error) {
    $code = ''
    $message = ''
    if ($Envelope.error.PSObject.Properties.Name -contains 'code') {
      $code = [string]$Envelope.error.code
    }
    if ($Envelope.error.PSObject.Properties.Name -contains 'message') {
      $message = [string]$Envelope.error.message
    }
    if ($code -or $message) {
      return "code=$code message=$message".Trim()
    }
    return 'JSON-RPC error returned.'
  }

  return ''
}

function Get-HeaderValue {
  param(
    [hashtable]$Headers,
    [string]$Name
  )

  if (-not $Headers) {
    return ''
  }

  foreach ($key in $Headers.Keys) {
    if ($key -ieq $Name) {
      return [string]$Headers[$key]
    }
  }
  return ''
}

function Get-ToolNames {
  param($ToolsEnvelope)

  if ($null -eq $ToolsEnvelope) {
    return @()
  }

  if (-not ($ToolsEnvelope.PSObject.Properties.Name -contains 'result')) {
    return @()
  }

  $result = $ToolsEnvelope.result
  if (-not $result) {
    return @()
  }

  if (-not ($result.PSObject.Properties.Name -contains 'tools')) {
    return @()
  }

  $names = @()
  foreach ($tool in @($result.tools)) {
    if ($tool -and ($tool.PSObject.Properties.Name -contains 'name') -and $tool.name) {
      $names += [string]$tool.name
    }
  }
  return ,$names
}

function Select-ProbeTool {
  param([string[]]$ToolNames)

  if (-not $ToolNames -or $ToolNames.Count -eq 0) {
    return ''
  }

  $preferred = @(
    'available_actions_list',
    'roles_list',
    'data_sources_list'
  )

  foreach ($name in $preferred) {
    if ($ToolNames -contains $name) {
      return $name
    }
  }

  $fallback = $ToolNames | Where-Object { $_ -match '_list$' } | Select-Object -First 1
  if ($fallback) {
    return [string]$fallback
  }

  return ''
}

function Get-ComposeFilePath {
  param([string]$InputComposeFile)

  if (-not [string]::IsNullOrWhiteSpace($InputComposeFile)) {
    if (Test-Path -LiteralPath $InputComposeFile) {
      return $InputComposeFile
    }
    return ''
  }

  $candidates = @('docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml')
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return ''
}

function Get-TokenPreview {
  param([string]$Token)

  if ([string]::IsNullOrWhiteSpace($Token)) {
    return ''
  }

  if ($Token.Length -le 12) {
    return ('*' * $Token.Length)
  }

  return "{0}...{1}" -f $Token.Substring(0, 6), $Token.Substring($Token.Length - 4)
}

function Extract-ApiKeyFromOutput {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ''
  }

  $blockPattern = '-----BEGIN API KEY-----\s*(?<token>[A-Za-z0-9\-_\.]+)\s*-----END API KEY-----'
  $blockMatch = [regex]::Match($Text, $blockPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($blockMatch.Success) {
    return [string]$blockMatch.Groups['token'].Value
  }

  $jwtPattern = '(?<token>eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)'
  $jwtMatch = [regex]::Match($Text, $jwtPattern)
  if ($jwtMatch.Success) {
    return [string]$jwtMatch.Groups['token'].Value
  }

  return ''
}

function Invoke-AutoApiKeyGenerate {
  param(
    [string]$TokenEnvName,
    [string]$KeyName,
    [string]$Username,
    [string]$RoleName,
    [string]$ExpiresIn,
    [string]$ComposeFilePath,
    [string]$AppServiceName
  )

  $commandsTried = @()

  if (Get-Command yarn -ErrorAction SilentlyContinue) {
    $commandsTried += 'yarn nocobase generate-api-key'
    try {
      $localOutput = (& yarn nocobase generate-api-key -n $KeyName -r $RoleName -u $Username -e $ExpiresIn --silent 2>&1 | Out-String)
      $localToken = Extract-ApiKeyFromOutput -Text $localOutput
      if (-not [string]::IsNullOrWhiteSpace($localToken)) {
        Set-Item -Path ("Env:{0}" -f $TokenEnvName) -Value $localToken
        [System.Environment]::SetEnvironmentVariable($TokenEnvName, $localToken, 'Process')
        return [pscustomobject]@{
          Success       = $true
          Token         = $localToken
          Source        = 'local-cli'
          ErrorMessage  = ''
          CommandsTried = $commandsTried
        }
      }
    } catch {
    }
  }

  if (Get-Command docker -ErrorAction SilentlyContinue) {
    $commandsTried += 'docker compose exec'

    $dockerArgs = @('compose')
    if (-not [string]::IsNullOrWhiteSpace($ComposeFilePath)) {
      $dockerArgs += @('-f', $ComposeFilePath)
    }
    $dockerArgs += @('exec', '-T', $AppServiceName, 'yarn', 'nocobase', 'generate-api-key', '-n', $KeyName, '-r', $RoleName, '-u', $Username, '-e', $ExpiresIn, '--silent')

    try {
      $dockerOutput = (& docker @dockerArgs 2>&1 | Out-String)
      $dockerToken = Extract-ApiKeyFromOutput -Text $dockerOutput
      if (-not [string]::IsNullOrWhiteSpace($dockerToken)) {
        Set-Item -Path ("Env:{0}" -f $TokenEnvName) -Value $dockerToken
        [System.Environment]::SetEnvironmentVariable($TokenEnvName, $dockerToken, 'Process')
        return [pscustomobject]@{
          Success       = $true
          Token         = $dockerToken
          Source        = 'docker-compose-exec'
          ErrorMessage  = ''
          CommandsTried = $commandsTried
        }
      }
    } catch {
    }
  }

  return [pscustomobject]@{
    Success       = $false
    Token         = ''
    Source        = ''
    ErrorMessage  = 'Auto API key generation failed from local CLI and docker compose paths.'
    CommandsTried = $commandsTried
  }
}

$appBaseUrl = "http://127.0.0.1:$Port"
$pluginManagerUrl = "$appBaseUrl/admin/settings/plugin-manager"
$apiKeysConfigUrl = "$appBaseUrl/admin/settings/api-keys"
$targetMcpUrl = Get-McpUrl -TargetPort $Port -InputUrl $McpUrl -InputAppName $McpAppName
$activationPlugins = Get-ActivationPlugins -AuthMode $McpAuthMode
$pluginEnableHint = Get-PluginEnableHint -Plugins $activationPlugins
$appRestartHint = 'App may still be reloading. Restart app, wait for startup complete, then rerun postcheck.'
$autoApiKeyEnabled = -not $DisableAutoApiKey
$resolvedComposeFile = Get-ComposeFilePath -InputComposeFile $AutoApiKeyComposeFile
$apiKeyCreateHint = "Auto token refresh failed. Fallback manual only: open $apiKeysConfigUrl, click Add API Key, copy token, set $McpTokenEnv, then rerun postcheck."
$apiKeyAutoHint = "Auto token generation uses CLI: generate-api-key -n $AutoApiKeyName -u $AutoApiKeyUsername -r $AutoApiKeyRole -e $AutoApiKeyExpiresIn."
$protocolCheckEligible = $false
$protocolToken = ''

Write-Host "phase: mcp-postcheck"
Write-Host "timestamp: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
Write-Host "mcp_target: $targetMcpUrl"
Write-Host "mcp_auth_mode: $McpAuthMode"
Write-Host "mcp_activation_plugins: $($activationPlugins -join ',')"
Write-Host "mcp_auto_api_key: $(if($autoApiKeyEnabled){'enabled'}else{'disabled'})"
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
    if ([string]::IsNullOrWhiteSpace($token) -and $autoApiKeyEnabled) {
      Record-Check warn 'MCP-AUTH-POST-APIKEY-001' "API key token env '$McpTokenEnv' is missing. Trying automatic token generation." $apiKeyAutoHint
      $autoToken = Invoke-AutoApiKeyGenerate -TokenEnvName $McpTokenEnv -KeyName $AutoApiKeyName -Username $AutoApiKeyUsername -RoleName $AutoApiKeyRole -ExpiresIn $AutoApiKeyExpiresIn -ComposeFilePath $resolvedComposeFile -AppServiceName $AutoApiKeyAppService
      if ($autoToken.Success) {
        $token = $autoToken.Token
        Record-Check pass 'MCP-AUTH-POST-APIKEY-001' "Automatically generated API token from $($autoToken.Source) and loaded into '$McpTokenEnv' ($(Get-TokenPreview -Token $token))."
      } else {
        Record-Check fail 'MCP-AUTH-POST-APIKEY-001' "Automatic API token generation failed for '$McpTokenEnv'." $apiKeyCreateHint
        Write-Host "action_required: provide_api_token"
        Write-Host 'required_step: auto_generate_api_token_failed'
        Write-Host 'required_step: manual_user_create_token'
        Write-Host 'required_step: manual_user_send_token_in_chat'
      }
    } elseif ([string]::IsNullOrWhiteSpace($token)) {
      Record-Check fail 'MCP-AUTH-POST-APIKEY-001' "API key token env '$McpTokenEnv' is missing and auto generation is disabled." $apiKeyCreateHint
      Write-Host "action_required: provide_api_token"
      Write-Host 'required_step: manual_user_create_token'
      Write-Host 'required_step: manual_user_send_token_in_chat'
    } else {
      Record-Check pass 'MCP-AUTH-POST-APIKEY-001' "API key token env '$McpTokenEnv' is present."
    }

    if (-not [string]::IsNullOrWhiteSpace($token)) {
      Record-Check pass 'MCP-AUTH-POST-APIKEY-002' 'Token validity will be verified by MCP protocol probe (initialize/tools/list/tools/call).'
      $protocolCheckEligible = $true
      $protocolToken = $token
    }
  }
} elseif ($McpAuthMode -eq 'oauth') {
  Record-Check warn 'MCP-AUTH-POST-OAUTH-001' 'OAuth postcheck requires interactive client login.' 'Run client login with scopes mcp,offline_access.'
} else {
  Record-Check warn 'MCP-AUTH-POST-000' 'MCP auth probe disabled (mode=none).' 'Use api-key or oauth when MCP access is required.'
}

if ($protocolCheckEligible) {
  $baseHeaders = @{}
  $baseHeaders['Authorization'] = "Bearer $protocolToken"
  if ($McpPackages) {
    $baseHeaders['x-mcp-packages'] = $McpPackages
  }

  $initPayload = @{
    jsonrpc = '2.0'
    id = 9001
    method = 'initialize'
    params = @{
      protocolVersion = '2024-11-05'
      capabilities = @{}
      clientInfo = @{
        name = 'nocobase-env-bootstrap-postcheck'
        version = '1.2.0'
      }
    }
  } | ConvertTo-Json -Depth 20 -Compress

  $initResp = Invoke-McpRpc -Url $targetMcpUrl -PayloadJson $initPayload -Headers $baseHeaders
  if ($null -eq $initResp.StatusCode) {
    Record-Check fail 'MCP-PROTO-001' "Initialize transport failed ($($initResp.TransportError))." 'Verify request headers include Accept: application/json, text/event-stream and retry.'
  } else {
    if ($initResp.StatusCode -lt 200 -or $initResp.StatusCode -ge 300) {
      if ($initResp.StatusCode -in 401, 403 -and $autoApiKeyEnabled) {
        Record-Check warn 'MCP-AUTH-POST-APIKEY-003' "Initialize returned HTTP $($initResp.StatusCode); token may be expired. Trying automatic refresh." $apiKeyAutoHint
        $refreshedToken = Invoke-AutoApiKeyGenerate -TokenEnvName $McpTokenEnv -KeyName $AutoApiKeyName -Username $AutoApiKeyUsername -RoleName $AutoApiKeyRole -ExpiresIn $AutoApiKeyExpiresIn -ComposeFilePath $resolvedComposeFile -AppServiceName $AutoApiKeyAppService
        if ($refreshedToken.Success) {
          $protocolToken = $refreshedToken.Token
          $baseHeaders['Authorization'] = "Bearer $protocolToken"
          Record-Check pass 'MCP-AUTH-POST-APIKEY-003' "Automatic token refresh succeeded from $($refreshedToken.Source) ($(Get-TokenPreview -Token $protocolToken)). Retrying initialize."
          $initResp = Invoke-McpRpc -Url $targetMcpUrl -PayloadJson $initPayload -Headers $baseHeaders
        } else {
          Record-Check fail 'MCP-AUTH-POST-APIKEY-003' 'Automatic token refresh failed after initialize auth error.' $apiKeyCreateHint
        }
      }

      if ($initResp.StatusCode -lt 200 -or $initResp.StatusCode -ge 300) {
        if ($initResp.StatusCode -in 401, 403) {
          Record-Check fail 'MCP-PROTO-001' "Initialize returned HTTP $($initResp.StatusCode)." $apiKeyCreateHint
          Write-Host 'action_required: provide_api_token'
          Write-Host 'required_step: auto_generate_api_token_failed'
          Write-Host 'required_step: manual_user_create_token'
          Write-Host 'required_step: manual_user_send_token_in_chat'
        } else {
          Record-Check fail 'MCP-PROTO-001' "Initialize returned HTTP $($initResp.StatusCode)." 'Verify MCP auth and streamable HTTP headers.'
        }
      }
    }
    if ($initResp.StatusCode -ge 200 -and $initResp.StatusCode -lt 300) {
      $initEnvelope = ConvertFrom-McpEnvelope -Body $initResp.Body
      $initError = Get-McpErrorText -Envelope $initEnvelope
      if ($initError) {
        Record-Check fail 'MCP-PROTO-001' "Initialize returned JSON-RPC error ($initError)." 'Use standard initialize payload and retry.'
      } else {
        $sessionId = Get-HeaderValue -Headers $initResp.ResponseHeaders -Name 'Mcp-Session-Id'
        if (-not [string]::IsNullOrWhiteSpace($sessionId)) {
          $baseHeaders['Mcp-Session-Id'] = $sessionId
          Write-Host "mcp_session_id: $sessionId"
        }
        Record-Check pass 'MCP-PROTO-001' 'Initialize probe succeeded.'

        $toolsListPayload = @{
          jsonrpc = '2.0'
          id = 9002
          method = 'tools/list'
          params = @{}
        } | ConvertTo-Json -Depth 20 -Compress

        $toolsResp = Invoke-McpRpc -Url $targetMcpUrl -PayloadJson $toolsListPayload -Headers $baseHeaders
        if ($null -eq $toolsResp.StatusCode) {
          Record-Check fail 'MCP-PROTO-002' "tools/list transport failed ($($toolsResp.TransportError))." 'Retry with initialize + session header and valid auth.'
        } elseif ($toolsResp.StatusCode -lt 200 -or $toolsResp.StatusCode -ge 300) {
          Record-Check fail 'MCP-PROTO-002' "tools/list returned HTTP $($toolsResp.StatusCode)." 'Verify MCP auth/session state and retry.'
        } else {
          $toolsEnvelope = ConvertFrom-McpEnvelope -Body $toolsResp.Body
          $toolsError = Get-McpErrorText -Envelope $toolsEnvelope
          if ($toolsError) {
            Record-Check fail 'MCP-PROTO-002' "tools/list returned JSON-RPC error ($toolsError)." 'Use initialize first, then tools/list with same auth/session context.'
          } else {
            $toolNames = Get-ToolNames -ToolsEnvelope $toolsEnvelope
            if ($toolNames.Count -eq 0) {
              Record-Check fail 'MCP-PROTO-002' 'tools/list succeeded but returned no tools.' 'Verify MCP package scope and plugin activation.'
            } else {
              $sample = ($toolNames | Select-Object -First 8) -join ', '
              Write-Host "mcp_tools_sample: $sample"
              Record-Check pass 'MCP-PROTO-002' "tools/list probe succeeded ($($toolNames.Count) tools)."

            $probeTool = Select-ProbeTool -ToolNames $toolNames
            if ([string]::IsNullOrWhiteSpace($probeTool)) {
              Record-Check warn 'MCP-PROTO-003' 'No safe list-style probe tool found for tools/call verification.' 'Use runtime tool schema to choose a read-only tool and verify manually.'
            } else {
              $toolsCallPayload = @{
                jsonrpc = '2.0'
                id = 9003
                method = 'tools/call'
                params = @{
                  name = $probeTool
                  arguments = @{}
                }
              } | ConvertTo-Json -Depth 20 -Compress

              $callResp = Invoke-McpRpc -Url $targetMcpUrl -PayloadJson $toolsCallPayload -Headers $baseHeaders
              if ($null -eq $callResp.StatusCode) {
                Record-Check fail 'MCP-PROTO-003' "tools/call transport failed ($($callResp.TransportError))." 'Verify streamable HTTP headers and retry.'
              } elseif ($callResp.StatusCode -lt 200 -or $callResp.StatusCode -ge 300) {
                Record-Check fail 'MCP-PROTO-003' "tools/call returned HTTP $($callResp.StatusCode) on '$probeTool'." 'Verify auth/session and tool availability, then retry.'
              } else {
                $callEnvelope = ConvertFrom-McpEnvelope -Body $callResp.Body
                $callError = Get-McpErrorText -Envelope $callEnvelope
                if ($callError) {
                  Record-Check fail 'MCP-PROTO-003' "tools/call returned JSON-RPC error on '$probeTool' ($callError)." 'Verify tool argument shape from tools/list schema and retry.'
                } else {
                  Record-Check pass 'MCP-PROTO-003' "tools/call probe succeeded with '$probeTool'."
                }
              }
            }
          }
        }
      }
    }
  }
  }
} else {
  Record-Check warn 'MCP-PROTO-000' 'Skip protocol probe because API-key auth is not ready.' 'Resolve auth blockers, then rerun mcp-postcheck.'
}

Write-Host ""
Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"

if ($Fail -gt 0) {
  exit 1
}

exit 0
