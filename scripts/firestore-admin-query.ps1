param(
  [Parameter(Mandatory = $true)]
  [string]$CollectionId,
  [int]$Limit = 10,
  [string]$AdcPath = "$env:APPDATA\firebase\barany_szilva_gmail.com_application_default_credentials.json"
)

$ErrorActionPreference = 'Stop'

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  foreach ($line in Get-Content -Path $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $parts = $trimmed -split '=', 2
    if ($parts.Count -ne 2) { continue }
    $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
  }
  return $values
}

function Get-AccessTokenFromAdc {
  param([string]$Path)

  $adc = Get-Content -Path $Path -Raw | ConvertFrom-Json
  $body = @{
    client_id = $adc.client_id
    client_secret = $adc.client_secret
    refresh_token = $adc.refresh_token
    grant_type = 'refresh_token'
  }

  $tokenResponse = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -Body $body -ContentType 'application/x-www-form-urlencoded'
  return $tokenResponse.access_token
}

function Convert-FirestoreValue {
  param($Value)

  if ($null -eq $Value) { return $null }
  if ($Value.PSObject.Properties.Name -contains 'stringValue') { return $Value.stringValue }
  if ($Value.PSObject.Properties.Name -contains 'booleanValue') { return [bool]$Value.booleanValue }
  if ($Value.PSObject.Properties.Name -contains 'integerValue') { return [int64]$Value.integerValue }
  if ($Value.PSObject.Properties.Name -contains 'doubleValue') { return [double]$Value.doubleValue }
  if ($Value.PSObject.Properties.Name -contains 'timestampValue') { return $Value.timestampValue }
  if ($Value.PSObject.Properties.Name -contains 'nullValue') { return $null }
  if ($Value.PSObject.Properties.Name -contains 'mapValue') {
    $map = @{}
    $fields = $Value.mapValue.fields
    if ($fields) {
      foreach ($prop in $fields.PSObject.Properties) {
        $map[$prop.Name] = Convert-FirestoreValue $prop.Value
      }
    }
    return $map
  }
  if ($Value.PSObject.Properties.Name -contains 'arrayValue') {
    $items = @()
    $arrayValues = @()
    if ($Value.arrayValue -and $Value.arrayValue.values) {
      $arrayValues = $Value.arrayValue.values
    }
    foreach ($item in $arrayValues) {
      $items += ,(Convert-FirestoreValue $item)
    }
    return $items
  }

  return $Value
}

function Convert-FirestoreDocument {
  param($Document)

  $result = [ordered]@{
    name = $Document.name
    id = ($Document.name -split '/')[-1]
  }

  if ($Document.fields) {
    foreach ($prop in $Document.fields.PSObject.Properties) {
      $result[$prop.Name] = Convert-FirestoreValue $prop.Value
    }
  }

  return $result
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envValues = Read-EnvFile -Path (Join-Path $repoRoot '.env')
$projectId = $envValues['VITE_FIREBASE_PROJECT_ID']
$accessToken = Get-AccessTokenFromAdc -Path $AdcPath
$headers = @{ Authorization = "Bearer $accessToken" }
$uri = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery"
$body = @{
  structuredQuery = @{
    from = @(
      @{
        collectionId = $CollectionId
      }
    )
    limit = $Limit
  }
} | ConvertTo-Json -Depth 6

$response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -ContentType 'application/json'
$documents = @()
foreach ($row in $response) {
  if ($row.document) {
    $documents += ,(Convert-FirestoreDocument $row.document)
  }
}

[ordered]@{
  projectId = $projectId
  collectionId = $CollectionId
  count = $documents.Count
  documents = $documents
} | ConvertTo-Json -Depth 8
