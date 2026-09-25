param(
  [string[]]$FieldNames = @(
    'kezdesDatuma',
    'szuletesiIdo',
    'megszunesDatuma',
    'szunetKezdete',
    'lemondasDatuma',
    'jogviszonyvaltasDatuma',
    'navOnlineStartDate'
  ),
  [switch]$Apply,
  [int]$Limit = 0,
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
  if ($Value.PSObject.Properties.Name -contains 'timestampValue') { return $Value.timestampValue }
  return $null
}

function Add-OneCalendarDay {
  param([string]$Value)

  if ($Value -notmatch '^\d{4}-\d{2}-\d{2}$') { return $null }
  $date = [datetime]::ParseExact($Value, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  return $date.AddDays(1).ToString('yyyy-MM-dd')
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envValues = Read-EnvFile -Path (Join-Path $repoRoot '.env')
$projectId = $envValues['VITE_FIREBASE_PROJECT_ID']
if (-not $projectId) { throw 'Missing VITE_FIREBASE_PROJECT_ID in .env' }

$accessToken = Get-AccessTokenFromAdc -Path $AdcPath
$headers = @{ Authorization = "Bearer $accessToken" }
$baseUri = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/clients"

$pageToken = ''
$scanned = 0
$changedDocs = 0
$changedFields = 0
$preview = @()

do {
  $pageSize = 300
  if ($Limit -gt 0) {
    $remaining = $Limit - $scanned
    if ($remaining -le 0) { break }
    $pageSize = [Math]::Min($pageSize, $remaining)
  }

  $uri = "$baseUri`?pageSize=$pageSize"
  if ($pageToken) { $uri += "&pageToken=$([uri]::EscapeDataString($pageToken))" }
  $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers

  foreach ($document in @($response.documents)) {
    if (-not $document) { continue }
    $scanned += 1
    $docId = ($document.name -split '/')[-1]
    $updates = [ordered]@{}
    $docChanges = @()

    foreach ($fieldName in $FieldNames) {
      if (-not $document.fields -or -not ($document.fields.PSObject.Properties.Name -contains $fieldName)) { continue }
      $current = Convert-FirestoreValue $document.fields.$fieldName
      $next = Add-OneCalendarDay $current
      if (-not $next) { continue }
      $updates[$fieldName] = @{ stringValue = $next }
      $docChanges += [ordered]@{ field = $fieldName; from = $current; to = $next }
    }

    if ($docChanges.Count -eq 0) { continue }

    $changedDocs += 1
    $changedFields += $docChanges.Count
    $preview += [ordered]@{ id = $docId; changes = $docChanges }

    if ($Apply) {
      $mask = ($updates.Keys | ForEach-Object { "updateMask.fieldPaths=$([uri]::EscapeDataString($_))" }) -join '&'
      $patchUri = "$baseUri/$([uri]::EscapeDataString($docId))`?$mask"
      $body = @{ fields = $updates } | ConvertTo-Json -Depth 5
      Invoke-RestMethod -Method Patch -Uri $patchUri -Headers $headers -Body $body -ContentType 'application/json' | Out-Null
    }
  }

  $pageToken = $response.nextPageToken
} while ($pageToken)

[ordered]@{
  projectId = $projectId
  collection = 'clients'
  mode = if ($Apply) { 'apply' } else { 'dry-run' }
  scannedDocuments = $scanned
  changedDocuments = $changedDocs
  changedFields = $changedFields
  fields = $FieldNames
  preview = $preview
} | ConvertTo-Json -Depth 8
