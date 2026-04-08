param(
  [string]$OutputPath = 'nocobase-diagnostics.txt'
)

$includeDockerLogs = [string]$env:INCLUDE_DOCKER_LOGS -eq 'true'
$dockerTail = 200
if ($env:DOCKER_TAIL -and ($env:DOCKER_TAIL -as [int])) {
  $dockerTail = [int]$env:DOCKER_TAIL
}
if ($dockerTail -lt 1) {
  $dockerTail = 200
}

function Write-Line {
  param([string]$Text)
  Add-Content -LiteralPath $OutputPath -Value $Text
}

function Has-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function First-LineOfCommand {
  param(
    [string]$Command,
    [string[]]$Arguments = @()
  )

  try {
    $output = & $Command @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
      return ''
    }
    if ($null -eq $output) {
      return ''
    }
    return [string]($output | Select-Object -First 1)
  } catch {
    return ''
  }
}

function Add-EnvLine {
  param([string]$Key)
  if (-not (Test-Path -LiteralPath '.env')) {
    return
  }
  $match = Select-String -Path '.env' -Pattern "^[\s]*$Key[\s]*=" | Select-Object -Last 1
  if ($match) {
    Write-Line $match.Line
  }
}

if (Test-Path -LiteralPath $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}
New-Item -ItemType File -Path $OutputPath -Force | Out-Null

Write-Line "timestamp: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
Write-Line "cwd: $(Get-Location)"
Write-Line "os: $([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)"
Write-Line ''
Write-Line '== command versions =='

if (Has-Command docker) {
  $dockerVersion = First-LineOfCommand -Command docker -Arguments @('--version')
  if ($dockerVersion) {
    Write-Line "docker: $dockerVersion"
  } else {
    Write-Line 'docker: <unknown>'
  }
} else {
  Write-Line 'docker: <not found>'
}

if (Has-Command node) {
  $nodeVersion = First-LineOfCommand -Command node -Arguments @('-v')
  if ($nodeVersion) {
    Write-Line "node: $nodeVersion"
  } else {
    Write-Line 'node: <unknown>'
  }
} else {
  Write-Line 'node: <not found>'
}

if (Has-Command yarn) {
  $yarnVersion = First-LineOfCommand -Command yarn -Arguments @('-v')
  if ($yarnVersion) {
    Write-Line "yarn: $yarnVersion"
  } else {
    Write-Line 'yarn: <unknown>'
  }
} else {
  Write-Line 'yarn: <not found>'
}

if (Has-Command git) {
  $gitVersion = First-LineOfCommand -Command git -Arguments @('--version')
  if ($gitVersion) {
    Write-Line "git: $gitVersion"
  } else {
    Write-Line 'git: <unknown>'
  }
} else {
  Write-Line 'git: <not found>'
}

Write-Line ''
Write-Line '== selected env keys =='
if (Test-Path -LiteralPath '.env') {
  Add-EnvLine -Key 'APP_ENV'
  Add-EnvLine -Key 'APP_PORT'
  Add-EnvLine -Key 'DB_DIALECT'
  Add-EnvLine -Key 'DB_HOST'
  Add-EnvLine -Key 'DB_PORT'
  Add-EnvLine -Key 'DB_DATABASE'
  Add-EnvLine -Key 'NOCOBASE_RUNNING_IN_DOCKER'
} else {
  Write-Line '.env not found'
}

if ($includeDockerLogs -and (Has-Command docker)) {
  Write-Line ''
  Write-Line '== docker ps =='
  try {
    $psLines = & docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' 2>$null
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $psLines) {
        Write-Line ([string]$line)
      }
    } else {
      Write-Line '<docker ps failed>'
    }
  } catch {
    Write-Line '<docker ps failed>'
  }

  Write-Line ''
  Write-Line "== docker logs (tail=$dockerTail) =="
  $names = @()
  try {
    $rawNames = & docker ps --format '{{.Names}}' 2>$null
    if ($LASTEXITCODE -eq 0) {
      $names = $rawNames | Where-Object { $_ -match 'nocobase|app' } | Select-Object -First 3
    }
  } catch {
    $names = @()
  }

  if (-not $names -or $names.Count -eq 0) {
    Write-Line '<no matching containers>'
  } else {
    foreach ($name in $names) {
      Write-Line ''
      Write-Line "-- $name --"
      try {
        $logLines = & docker logs --tail "$dockerTail" --timestamps $name 2>&1
        if ($LASTEXITCODE -eq 0) {
          foreach ($line in $logLines) {
            Write-Line ([string]$line)
          }
        } else {
          Write-Line "<docker logs failed for $name>"
        }
      } catch {
        Write-Line "<docker logs failed for $name>"
      }
    }
  }
}

Write-Host "Diagnostics written to: $OutputPath"
