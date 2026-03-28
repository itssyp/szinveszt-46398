param(
  [switch]$Apply,
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

  $result = @{ id = ($Document.name -split '/')[-1] }
  if ($Document.fields) {
    foreach ($prop in $Document.fields.PSObject.Properties) {
      $result[$prop.Name] = Convert-FirestoreValue $prop.Value
    }
  }
  return $result
}

function Get-FirestoreDocuments {
  param(
    [string]$ProjectId,
    [hashtable]$Headers,
    [string]$CollectionName
  )

  $uri = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents:runQuery"
  $body = @{
    structuredQuery = @{
      from = @(
        @{
          collectionId = $CollectionName
        }
      )
      limit = 5000
    }
  } | ConvertTo-Json -Depth 6

  $response = Invoke-RestMethod -Method Post -Uri $uri -Headers $Headers -Body $body -ContentType 'application/json'
  $documents = @()
  foreach ($row in $response) {
    if ($row.document) {
      $documents += ,(Convert-FirestoreDocument $row.document)
    }
  }

  return $documents
}

function Invoke-FirestoreCommitWrites {
  param(
    [string]$ProjectId,
    [hashtable]$Headers,
    [object[]]$Writes
  )

  $uri = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents:commit"
  $chunkSize = 400
  for ($offset = 0; $offset -lt $Writes.Count; $offset += $chunkSize) {
    $chunk = @($Writes | Select-Object -Skip $offset -First $chunkSize)
    if (-not $chunk.Count) { continue }
    $body = @{
      writes = $chunk
    } | ConvertTo-Json -Depth 12
    Invoke-RestMethod -Method Post -Uri $uri -Headers $Headers -Body $body -ContentType 'application/json' | Out-Null
  }
}

function New-SzjaAssigneeWrite {
  param(
    [string]$ProjectId,
    [string]$ClientId,
    [string]$AssignedTo
  )

  return @{
    update = @{
      name = "projects/$ProjectId/databases/(default)/documents/clients/$ClientId"
      fields = @{
        szja2025 = @{
          mapValue = @{
            fields = @{
              assignedTo = @{
                stringValue = $AssignedTo
              }
            }
          }
        }
      }
    }
    updateMask = @{
      fieldPaths = @('szja2025.assignedTo')
    }
    currentDocument = @{
      exists = $true
    }
  }
}

function New-DeleteDocumentWrite {
  param(
    [string]$ProjectId,
    [string]$DocumentPath
  )

  return @{
    delete = "projects/$ProjectId/databases/(default)/documents/$DocumentPath"
  }
}

function Normalize-Text {
  param($Value)
  if ($null -eq $Value) { return '' }
  return [string]$Value.ToString().Trim()
}

function Normalize-ComparableText {
  param($Value)

  $text = Normalize-Text $Value
  if (-not $text) { return '' }
  $normalized = $text.Normalize([Text.NormalizationForm]::FormD)
  $chars = New-Object System.Collections.Generic.List[char]
  foreach ($char in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$chars.Add($char)
    }
  }
  return (-join $chars.ToArray()).ToLowerInvariant()
}

function Parse-AnyDate {
  param($Value)

  if ($null -eq $Value) { return $null }
  if ($Value -is [DateTime]) { return $Value }

  $raw = Normalize-Text $Value
  if (-not $raw) { return $null }

  $ymd = [regex]::Match($raw, '^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$')
  if ($ymd.Success) {
    return Get-Date -Year ([int]$ymd.Groups[1].Value) -Month ([int]$ymd.Groups[2].Value) -Day ([int]$ymd.Groups[3].Value)
  }

  $dmy = [regex]::Match($raw, '^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$')
  if ($dmy.Success) {
    return Get-Date -Year ([int]$dmy.Groups[3].Value) -Month ([int]$dmy.Groups[2].Value) -Day ([int]$dmy.Groups[1].Value)
  }

  try {
    return [DateTime]::Parse($raw)
  } catch {
    return $null
  }
}

function Get-SzjaException {
  param($Client)

  $manualException = if ($Client.ContainsKey('szja2025')) { $Client.szja2025.manualException } else { $null }
  return @{
    included = [bool]($manualException -and $manualException.included)
    target = if ($manualException -and $manualException.target -eq 'pausedOrEnded') { 'pausedOrEnded' } else { 'active' }
  }
}

function Classify-ClientForSzja {
  param($Client)

  $start2025 = Get-Date '2025-01-01'
  $start2025Jan2 = Get-Date '2025-01-02'
  $start2026 = Get-Date '2026-01-01'

  $status = Normalize-ComparableText $Client.statusz
  $startDate = Parse-AnyDate $Client.kezdesDatuma
  $pauseStartDate = Parse-AnyDate $Client.szunetKezdete
  $endDate = Parse-AnyDate $Client.megszunesDatuma
  $startedIn2025OrEarlier = ($startDate -ne $null -and $startDate -lt $start2026)

  if ($null -eq $startDate) {
    return @{ targetGroup = $null }
  }

  if (-not $startedIn2025OrEarlier) {
    return @{ targetGroup = $null }
  }

  if ($status.StartsWith('aktiv')) {
    return @{ targetGroup = 'active' }
  }

  if (
    ($status.StartsWith('szunet') -and $pauseStartDate -and $pauseStartDate -ge $start2026) -or
    ($status.StartsWith('megsz') -and $endDate -and $endDate -ge $start2026)
  ) {
    return @{ targetGroup = 'active' }
  }

  if ($status.StartsWith('szunet') -and $pauseStartDate -and $pauseStartDate -ge $start2025Jan2) {
    return @{ targetGroup = 'pausedOrEnded' }
  }

  if ($status.StartsWith('megsz') -and $endDate -and $endDate -ge $start2025) {
    return @{ targetGroup = 'pausedOrEnded' }
  }

  return @{ targetGroup = $null }
}

function Is-FullTimeWorkType {
  param($Client)

  $value = Normalize-ComparableText $Client.munkavegzesJellege
  if (-not $value) { return $false }
  return $value.StartsWith('1341') -or $value.Contains('fofoglalkozasu')
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envValues = Read-EnvFile -Path (Join-Path $repoRoot '.env')
$projectId = $envValues['VITE_FIREBASE_PROJECT_ID']
$accessToken = Get-AccessTokenFromAdc -Path $AdcPath
$headers = @{ Authorization = "Bearer $accessToken" }

$clients = Get-FirestoreDocuments -ProjectId $projectId -Headers $headers -CollectionName 'clients'
$malformedDocId = '.fieldPaths=szja2025.assignedTo'
$malformedDocExists = @($clients | Where-Object { $_.id -eq $malformedDocId }).Count -gt 0

$szjaClients = @()
foreach ($client in $clients) {
  $classification = Classify-ClientForSzja $client
  $exception = Get-SzjaException $client

  if ($classification.targetGroup -or $exception.included) {
    $szjaClients += ,$client
  }
}

$sortedSzjaClients = $szjaClients | Sort-Object -Property @{ Expression = { Normalize-Text $_.nev } }
$fullTimeClients = @($sortedSzjaClients | Where-Object { Is-FullTimeWorkType $_ })
$otherClients = @($sortedSzjaClients | Where-Object { -not (Is-FullTimeWorkType $_) })

$firstHalfCount = [Math]::Ceiling($fullTimeClients.Count / 2.0)
$fanniClients = @($fullTimeClients | Select-Object -First $firstHalfCount)
$szilviClients = @($fullTimeClients | Select-Object -Skip $firstHalfCount)
$szindiClients = @($otherClients)

$plannedAssignments = @()
$plannedAssignments += $fanniClients | ForEach-Object { [ordered]@{ id = $_.id; nev = Normalize-Text $_.nev; assignedTo = 'Fanni'; workType = Normalize-Text $_.munkavegzesJellege } }
$plannedAssignments += $szilviClients | ForEach-Object { [ordered]@{ id = $_.id; nev = Normalize-Text $_.nev; assignedTo = 'Szilvi'; workType = Normalize-Text $_.munkavegzesJellege } }
$plannedAssignments += $szindiClients | ForEach-Object { [ordered]@{ id = $_.id; nev = Normalize-Text $_.nev; assignedTo = 'Szindi'; workType = Normalize-Text $_.munkavegzesJellege } }

if ($Apply) {
  $writes = @()
  foreach ($assignment in $plannedAssignments) {
    $writes += ,(New-SzjaAssigneeWrite -ProjectId $projectId -ClientId $assignment.id -AssignedTo $assignment.assignedTo)
  }
  if ($malformedDocExists) {
    $writes += ,(New-DeleteDocumentWrite -ProjectId $projectId -DocumentPath "clients/$malformedDocId")
  }

  Invoke-FirestoreCommitWrites -ProjectId $projectId -Headers $headers -Writes $writes
}

$verifiedAssignments = 0
$actualAssignedToFanni = 0
$actualAssignedToSzilvi = 0
$actualAssignedToSzindi = 0
$malformedDocExistsAfterApply = $malformedDocExists

if ($Apply) {
  $clientsAfterApply = Get-FirestoreDocuments -ProjectId $projectId -Headers $headers -CollectionName 'clients'
  $clientMapAfterApply = @{}
  foreach ($client in $clientsAfterApply) {
    $clientMapAfterApply[$client.id] = $client
  }

  foreach ($assignment in $plannedAssignments) {
    $updatedClient = $clientMapAfterApply[$assignment.id]
    $actualAssignedTo = Normalize-Text $updatedClient.szja2025.assignedTo
    if ($actualAssignedTo -eq $assignment.assignedTo) {
      $verifiedAssignments += 1
    }
    switch ($actualAssignedTo) {
      'Fanni' { $actualAssignedToFanni += 1 }
      'Szilvi' { $actualAssignedToSzilvi += 1 }
      'Szindi' { $actualAssignedToSzindi += 1 }
    }
  }

  $malformedDocExistsAfterApply = @($clientsAfterApply | Where-Object { $_.id -eq $malformedDocId }).Count -gt 0
}

[ordered]@{
  projectId = $projectId
  apply = [bool]$Apply
  totalClientsInCollection = $clients.Count
  totalSzjaClients = $sortedSzjaClients.Count
  fullTimeClients = $fullTimeClients.Count
  otherSzjaClients = $otherClients.Count
  assignedToFanni = $fanniClients.Count
  assignedToSzilvi = $szilviClients.Count
  assignedToSzindi = $szindiClients.Count
  malformedDocFoundBeforeApply = $malformedDocExists
  malformedDocExistsAfterApply = $malformedDocExistsAfterApply
  verifiedAssignments = $verifiedAssignments
  actualAssignedToFanni = $actualAssignedToFanni
  actualAssignedToSzilvi = $actualAssignedToSzilvi
  actualAssignedToSzindi = $actualAssignedToSzindi
  sample = @($plannedAssignments | Select-Object -First 25)
} | ConvertTo-Json -Depth 6
