param(
  [int]$Port = 13000,
  [string]$EnvName = 'local',
  [string]$TokenEnv = 'NOCOBASE_API_TOKEN',
  [ValidateSet('project', 'global')]
  [string]$Scope = 'project',
  [string]$BaseUrl = '',
  [string]$BaseDir = '',
  [switch]$SkipUpdate,
  [switch]$DisableAutoApiKey = $false,
  [string]$AutoApiKeyName = 'cli_auto_token',
  [string]$AutoApiKeyUsername = 'nocobase',
  [string]$AutoApiKeyRole = 'root',
  [string]$AutoApiKeyExpiresIn = '30d',
  [string]$AutoApiKeyAppService = 'app',
  [string]$AutoApiKeyComposeFile = ''
)

$Fail = 0
$Warn = 0
$Pass = 0
$CliDependencyPlugins = '@nocobase/plugin-api-doc,@nocobase/plugin-api-keys'
$CliDependencyEnableCommand = 'Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys'
$InstallGuide = 'https://github.com/nocobase/nocobase-ctl'

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

function Emit-TokenFixAction {
  Write-Host 'action_required: refresh_cli_token'
  Write-Host 'required_step: ensure_api_keys_plugin_active'
  Write-Host 'required_step: regenerate_or_update_cli_token_env'
  Write-Host 'required_step: rerun_cli_postcheck'
  Write-Host "required_plugins: $script:CliDependencyPlugins"
  Write-Host "suggested_command: $script:CliDependencyEnableCommand"
}

function Resolve-AbsolutePath {
  param(
    [string]$InputPath,
    [string]$FallbackRoot
  )

  if ([string]::IsNullOrWhiteSpace($InputPath)) {
    return [System.IO.Path]::GetFullPath($FallbackRoot)
  }

  if ([System.IO.Path]::IsPathRooted($InputPath)) {
    return [System.IO.Path]::GetFullPath($InputPath)
  }

  return [System.IO.Path]::GetFullPath((Join-Path $FallbackRoot $InputPath))
}

function Get-ComposeFilePath {
  param(
    [string]$InputComposeFile,
    [string]$SearchRoot
  )

  if (-not [string]::IsNullOrWhiteSpace($InputComposeFile)) {
    $explicitPath = Resolve-AbsolutePath -InputPath $InputComposeFile -FallbackRoot $SearchRoot
    if (Test-Path -LiteralPath $explicitPath -PathType Leaf) {
      return $explicitPath
    }
    return ''
  }

  $candidates = @('docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml')
  foreach ($candidate in $candidates) {
    $candidatePath = Join-Path $SearchRoot $candidate
    if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
      return $candidatePath
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
    [string]$AppServiceName,
    [string]$WorkDir
  )

  $commandsTried = @()

  if (Get-Command yarn -ErrorAction SilentlyContinue) {
    $commandsTried += "yarn nocobase generate-api-key -n $KeyName -r $RoleName -u $Username -e $ExpiresIn --silent"
    try {
      Push-Location -LiteralPath $WorkDir
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
    } finally {
      Pop-Location
    }
  }

  if (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerArgs = @('compose')
    if (-not [string]::IsNullOrWhiteSpace($ComposeFilePath)) {
      $dockerArgs += @('-f', $ComposeFilePath)
    }
    $dockerArgs += @('exec', '-T', $AppServiceName, 'yarn', 'nocobase', 'generate-api-key', '-n', $KeyName, '-r', $RoleName, '-u', $Username, '-e', $ExpiresIn, '--silent')
    $commandsTried += "docker $($dockerArgs -join ' ')"

    try {
      Push-Location -LiteralPath $WorkDir
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
    } finally {
      Pop-Location
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

function Invoke-CtlCommand {
  param(
    [string]$WrapperPath,
    [string]$WorkDir,
    [string[]]$CtlArgs
  )

  $rawOutput = (& node $WrapperPath --base-dir $WorkDir -- @CtlArgs 2>&1)
  $exitCode = $LASTEXITCODE
  $outputText = ($rawOutput | Out-String).Trim()

  return [pscustomobject]@{
    ExitCode   = $exitCode
    OutputText = $outputText
    RawOutput  = $rawOutput
  }
}

$resolvedBaseDir = Resolve-AbsolutePath -InputPath $BaseDir -FallbackRoot (Get-Location).Path
if (-not (Test-Path -LiteralPath $resolvedBaseDir -PathType Container)) {
  Record-Check fail 'CLI-001' "Base directory does not exist: $resolvedBaseDir" 'Pass -BaseDir <app-root> where yarn nocobase can run.'
  Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"
  exit 1
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Record-Check fail 'CLI-001' 'Cannot find Node.js in PATH.' "Install Node.js first. Then install nocobase-ctl from $InstallGuide"
  Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"
  exit 1
}

$ctlWrapper = Join-Path $PSScriptRoot '..\run-ctl.mjs'
if (-not (Test-Path -LiteralPath $ctlWrapper -PathType Leaf)) {
  Record-Check fail 'CLI-001' "Cannot find skill-local ctl wrapper: $ctlWrapper" 'Ensure nocobase-env-bootstrap/run-ctl.mjs exists, then rerun postcheck.'
  Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"
  exit 1
}

$autoApiKeyEnabled = -not $DisableAutoApiKey
$resolvedComposeFile = Get-ComposeFilePath -InputComposeFile $AutoApiKeyComposeFile -SearchRoot $resolvedBaseDir
$apiKeyCreateHint = "Auto token generation failed. Fallback manual only: enable @nocobase/plugin-api-keys, generate API key, set $TokenEnv, then rerun postcheck."
$apiKeyAutoHint = "Auto token generation uses CLI: generate-api-key -n $AutoApiKeyName -u $AutoApiKeyUsername -r $AutoApiKeyRole -e $AutoApiKeyExpiresIn."

Record-Check pass 'CLI-001' "Detected skill-local ctl wrapper: $ctlWrapper"
Write-Host "cli_base_dir: $resolvedBaseDir"
Write-Host "cli_auto_api_key: $(if($autoApiKeyEnabled){'enabled'}else{'disabled'})"

$token = [System.Environment]::GetEnvironmentVariable($TokenEnv)
if ([string]::IsNullOrWhiteSpace($token) -and $autoApiKeyEnabled) {
  Record-Check warn 'CLI-002' "Token env '$TokenEnv' is missing. Trying automatic token generation." $apiKeyAutoHint
  $autoToken = Invoke-AutoApiKeyGenerate -TokenEnvName $TokenEnv -KeyName $AutoApiKeyName -Username $AutoApiKeyUsername -RoleName $AutoApiKeyRole -ExpiresIn $AutoApiKeyExpiresIn -ComposeFilePath $resolvedComposeFile -AppServiceName $AutoApiKeyAppService -WorkDir $resolvedBaseDir
  if ($autoToken.Success) {
    $token = $autoToken.Token
    Record-Check pass 'CLI-002' "Automatically generated API token from $($autoToken.Source) and loaded into '$TokenEnv' ($(Get-TokenPreview -Token $token))."
  } else {
    Record-Check fail 'CLI-002' "Automatic token generation failed for '$TokenEnv'." $apiKeyCreateHint
    Write-Host 'action_required: provide_cli_token'
    Write-Host 'required_step: auto_generate_cli_token_failed'
    Write-Host 'required_step: ensure_api_keys_plugin_active'
    Write-Host 'required_step: set_cli_token_env'
    Write-Host 'required_step: rerun_cli_postcheck'
    Write-Host "required_plugins: $CliDependencyPlugins"
    Write-Host "suggested_command: $CliDependencyEnableCommand"
    Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"
    exit 1
  }
} elseif ([string]::IsNullOrWhiteSpace($token)) {
  Record-Check fail 'CLI-002' "Token env '$TokenEnv' is missing and auto generation is disabled." 'Enable @nocobase/plugin-api-keys, generate/copy API token, set token env, then rerun.'
  Write-Host 'action_required: provide_cli_token'
  Write-Host 'required_step: ensure_api_keys_plugin_active'
  Write-Host 'required_step: set_cli_token_env'
  Write-Host 'required_step: rerun_cli_postcheck'
  Write-Host "required_plugins: $CliDependencyPlugins"
  Write-Host "suggested_command: $CliDependencyEnableCommand"
  Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"
  exit 1
} else {
  Record-Check pass 'CLI-002' "Token env '$TokenEnv' is present."
}

$resolvedBaseUrl = if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  "http://localhost:$Port/api"
} else {
  $BaseUrl
}

Write-Host "cli_target_env: $EnvName"
Write-Host "cli_base_url: $resolvedBaseUrl"
Write-Host "cli_scope: $Scope"

$envAddResult = Invoke-CtlCommand -WrapperPath $ctlWrapper -WorkDir $resolvedBaseDir -CtlArgs @('env', 'add', '--name', $EnvName, '--base-url', $resolvedBaseUrl, '--token', $token, '-s', $Scope)
if ($envAddResult.RawOutput) {
  $envAddResult.RawOutput | Out-Host
}

if ($envAddResult.ExitCode -eq 0) {
  Record-Check pass 'CLI-003' "Added or updated env '$EnvName' in $Scope scope."
} else {
  $errorText = if ($envAddResult.OutputText) { $envAddResult.OutputText } else { "exit code $($envAddResult.ExitCode)" }
  $authIssue = $errorText -match '401|403|Auth required|Missing token|Invalid API token|invalid token'

  if ($authIssue -and $autoApiKeyEnabled) {
    Record-Check warn 'CLI-003' "Failed to add env '$EnvName': auth/token issue detected. Trying automatic refresh." $apiKeyAutoHint
    $refreshedToken = Invoke-AutoApiKeyGenerate -TokenEnvName $TokenEnv -KeyName $AutoApiKeyName -Username $AutoApiKeyUsername -RoleName $AutoApiKeyRole -ExpiresIn $AutoApiKeyExpiresIn -ComposeFilePath $resolvedComposeFile -AppServiceName $AutoApiKeyAppService -WorkDir $resolvedBaseDir

    if ($refreshedToken.Success) {
      $token = $refreshedToken.Token
      $retryEnvAddResult = Invoke-CtlCommand -WrapperPath $ctlWrapper -WorkDir $resolvedBaseDir -CtlArgs @('env', 'add', '--name', $EnvName, '--base-url', $resolvedBaseUrl, '--token', $token, '-s', $Scope)
      if ($retryEnvAddResult.RawOutput) {
        $retryEnvAddResult.RawOutput | Out-Host
      }

      if ($retryEnvAddResult.ExitCode -eq 0) {
        Record-Check pass 'CLI-003' "Added or updated env '$EnvName' after automatic token refresh from $($refreshedToken.Source)."
      } else {
        Record-Check fail 'CLI-003' "Failed to add env '$EnvName' after automatic token refresh." $apiKeyCreateHint
        Emit-TokenFixAction
      }
    } else {
      Record-Check fail 'CLI-003' "Failed to add env '$EnvName': auth/token issue detected and automatic refresh failed." $apiKeyCreateHint
      Emit-TokenFixAction
    }
  } elseif ($authIssue) {
    Record-Check fail 'CLI-003' "Failed to add env '$EnvName': auth/token issue detected." $apiKeyCreateHint
    Emit-TokenFixAction
  } else {
    Record-Check fail 'CLI-003' "Failed to add env '$EnvName': $errorText" 'Check base URL, token, and CLI runtime then retry.'
  }
}

if (-not $SkipUpdate -and $Fail -eq 0) {
  $envUpdateResult = Invoke-CtlCommand -WrapperPath $ctlWrapper -WorkDir $resolvedBaseDir -CtlArgs @('env', 'update', '-e', $EnvName, '-s', $Scope)
  if ($envUpdateResult.RawOutput) {
    $envUpdateResult.RawOutput | Out-Host
  }

  if ($envUpdateResult.ExitCode -eq 0) {
    Record-Check pass 'CLI-004' "Updated runtime for env '$EnvName'."
  } else {
    $errorText = if ($envUpdateResult.OutputText) { $envUpdateResult.OutputText } else { "exit code $($envUpdateResult.ExitCode)" }

    if ($errorText -match 'swagger:get|API documentation plugin|api-doc') {
      Record-Check fail 'CLI-004' "Failed to update runtime for env '$EnvName': API documentation dependency is not ready." 'Enable @nocobase/plugin-api-doc and @nocobase/plugin-api-keys, restart app, then rerun postcheck.'
      Write-Host 'action_required: enable_cli_dependency_plugins'
      Write-Host 'required_step: plugin_manage_enable_cli_bundle'
      Write-Host 'required_step: restart_app'
      Write-Host 'required_step: rerun_cli_postcheck'
      Write-Host "required_plugins: $CliDependencyPlugins"
      Write-Host "suggested_command: $CliDependencyEnableCommand"
    } elseif ($errorText -match '401|403|Auth required|Missing token|Invalid API token|invalid token') {
      if ($autoApiKeyEnabled) {
        Record-Check warn 'CLI-004' "Failed to update runtime for env '$EnvName': auth/token issue detected. Trying automatic refresh." $apiKeyAutoHint
        $refreshedToken = Invoke-AutoApiKeyGenerate -TokenEnvName $TokenEnv -KeyName $AutoApiKeyName -Username $AutoApiKeyUsername -RoleName $AutoApiKeyRole -ExpiresIn $AutoApiKeyExpiresIn -ComposeFilePath $resolvedComposeFile -AppServiceName $AutoApiKeyAppService -WorkDir $resolvedBaseDir

        if ($refreshedToken.Success) {
          $token = $refreshedToken.Token
          $refreshEnvResult = Invoke-CtlCommand -WrapperPath $ctlWrapper -WorkDir $resolvedBaseDir -CtlArgs @('env', 'add', '--name', $EnvName, '--base-url', $resolvedBaseUrl, '--token', $token, '-s', $Scope)
          if ($refreshEnvResult.RawOutput) {
            $refreshEnvResult.RawOutput | Out-Host
          }

          if ($refreshEnvResult.ExitCode -eq 0) {
            $retryUpdateResult = Invoke-CtlCommand -WrapperPath $ctlWrapper -WorkDir $resolvedBaseDir -CtlArgs @('env', 'update', '-e', $EnvName, '-s', $Scope)
            if ($retryUpdateResult.RawOutput) {
              $retryUpdateResult.RawOutput | Out-Host
            }
            if ($retryUpdateResult.ExitCode -eq 0) {
              Record-Check pass 'CLI-004' "Updated runtime for env '$EnvName' after automatic token refresh from $($refreshedToken.Source)."
            } else {
              Record-Check fail 'CLI-004' "Failed to update runtime for env '$EnvName' after automatic token refresh." $apiKeyCreateHint
              Emit-TokenFixAction
            }
          } else {
            Record-Check fail 'CLI-004' "Failed to refresh env '$EnvName' token before update retry." $apiKeyCreateHint
            Emit-TokenFixAction
          }
        } else {
          Record-Check fail 'CLI-004' "Failed to update runtime for env '$EnvName': automatic token refresh failed." $apiKeyCreateHint
          Emit-TokenFixAction
        }
      } else {
        Record-Check fail 'CLI-004' "Failed to update runtime for env '$EnvName': auth/token issue detected." 'Enable @nocobase/plugin-api-keys, refresh token env, and retry.'
        Emit-TokenFixAction
      }
    } else {
      Record-Check fail 'CLI-004' "Failed to update runtime for env '$EnvName': $errorText" 'Ensure app is reachable and token has required permission.'
    }
  }
} elseif ($SkipUpdate) {
  Record-Check warn 'CLI-004' 'Skipped env update by flag.'
}

if ($Fail -eq 0) {
  $readbackResult = Invoke-CtlCommand -WrapperPath $ctlWrapper -WorkDir $resolvedBaseDir -CtlArgs @('env', '-s', $Scope)
  if ($readbackResult.RawOutput) {
    $readbackResult.RawOutput | Out-Host
  }

  if ($readbackResult.ExitCode -ne 0) {
    Record-Check fail 'CLI-005' "Readback failed: $($readbackResult.OutputText)" 'Run `node ./run-ctl.mjs -- env -s <scope>` manually and verify.'
  } else {
    $text = $readbackResult.OutputText
    if ($text -match [regex]::Escape($EnvName) -and $text -match [regex]::Escape($resolvedBaseUrl)) {
      Record-Check pass 'CLI-005' 'Readback confirms expected env and base URL.'
    } else {
      Record-Check warn 'CLI-005' 'Readback completed but expected env/base URL was not clearly found in output.' 'Inspect `node ./run-ctl.mjs -- env -s <scope>` output manually.'
    }
  }
}

Write-Host "summary: fail=$Fail warn=$Warn pass=$Pass"
if ($Fail -gt 0) {
  exit 1
}

exit 0
