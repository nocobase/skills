# PowerShell MCP Helpers

Use these helpers to reduce repetitive JSON-RPC and SSE parsing code.

## Helpers

```powershell
function Get-McpJsonFromBody {
  param([string]$Body)

  if ([string]::IsNullOrWhiteSpace($Body)) {
    return $null
  }

  $trimmed = $Body.Trim()
  if ($trimmed.StartsWith('{') -or $trimmed.StartsWith('[')) {
    try { return $trimmed | ConvertFrom-Json -Depth 100 } catch { return $null }
  }

  $dataLines = $trimmed -split "`r?`n" |
    Where-Object { $_ -match '^\s*data:\s*' } |
    ForEach-Object { ($_ -replace '^\s*data:\s*', '').Trim() } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -ne '[DONE]' }

  foreach ($line in ($dataLines | Select-Object -Last 5)) {
    try { return $line | ConvertFrom-Json -Depth 100 } catch { }
  }

  return $null
}

function Invoke-NocoBaseMcpRaw {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][object]$Payload,
    [string]$BearerToken = '',
    [string]$SessionId = '',
    [string]$McpPackages = ''
  )

  $headers = @{
    'Content-Type' = 'application/json'
    'Accept' = 'application/json, text/event-stream'
  }

  if ($BearerToken) { $headers['Authorization'] = "Bearer $BearerToken" }
  if ($SessionId) { $headers['Mcp-Session-Id'] = $SessionId }
  if ($McpPackages) { $headers['x-mcp-packages'] = $McpPackages }

  $body = $Payload | ConvertTo-Json -Depth 100
  $resp = Invoke-WebRequest -Uri $Url -Method Post -Headers $headers -Body $body -TimeoutSec 20
  $json = Get-McpJsonFromBody -Body $resp.Content

  [pscustomobject]@{
    StatusCode = [int]$resp.StatusCode
    SessionId  = $resp.Headers['Mcp-Session-Id']
    RawBody    = $resp.Content
    Json       = $json
  }
}

function Invoke-NocoBaseMcpTool {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$ToolName,
    [hashtable]$Arguments = @{},
    [string]$BearerToken = '',
    [string]$SessionId = '',
    [string]$McpPackages = '',
    [int]$Id = 100
  )

  $payload = @{
    jsonrpc = '2.0'
    id      = $Id
    method  = 'tools/call'
    params  = @{
      name      = $ToolName
      arguments = $Arguments
    }
  }

  Invoke-NocoBaseMcpRaw -Url $Url -Payload $payload -BearerToken $BearerToken -SessionId $SessionId -McpPackages $McpPackages
}
```

## Minimal Usage

```powershell
$url = 'http://127.0.0.1:13000/api/mcp'
$token = $env:NOCOBASE_API_TOKEN

$init = Invoke-NocoBaseMcpRaw -Url $url -BearerToken $token -Payload @{
  jsonrpc = '2.0'
  id      = 1
  method  = 'initialize'
  params  = @{
    protocolVersion = '2024-11-05'
    capabilities    = @{}
    clientInfo      = @{ name = 'ps-helper'; version = '1.0.0' }
  }
}

$sid = $init.SessionId

$tools = Invoke-NocoBaseMcpRaw -Url $url -BearerToken $token -SessionId $sid -Payload @{
  jsonrpc = '2.0'
  id      = 2
  method  = 'tools/list'
  params  = @{}
}

$probe = Invoke-NocoBaseMcpTool -Url $url -BearerToken $token -SessionId $sid -ToolName 'available_actions_list' -Arguments @{} -Id 3
```
