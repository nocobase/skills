param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error 'Node.js is required to run scripts/upgrade.mjs.'
  exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$entry = Join-Path $scriptDir 'upgrade.mjs'

& node $entry @Args
exit $LASTEXITCODE

