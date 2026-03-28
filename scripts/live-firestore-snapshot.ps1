param(
  [ValidateSet('production', 'emulator', 'admin')]
  [string]$Mode = 'production',
  [string]$EmulatorHost = '127.0.0.1:8080',
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
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }

  return $values
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

  $result = @{
    id = ($Document.name -split '/')[-1]
  }

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
    [string]$ApiKey,
    [string]$CollectionName,
    [string]$Mode,
    [string]$EmulatorHost,
    [hashtable]$Headers
  )

  if ($Mode -eq 'emulator') {
    $baseUrl = "http://$EmulatorHost/v1/projects/$ProjectId/databases/(default)/documents/$CollectionName?pageSize=1000"
  } elseif ($Mode -eq 'admin') {
    $baseUrl = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents/$CollectionName?pageSize=1000"
  } else {
    $baseUrl = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents/$CollectionName?pageSize=1000&key=$ApiKey"
  }
  $documents = @()
  $nextPageToken = $null

  do {
    $url = $baseUrl
    if ($nextPageToken) {
      $url += "&pageToken=$nextPageToken"
    }

    if ($Headers) {
      $response = Invoke-RestMethod -Method Get -Uri $url -Headers $Headers
    } else {
      $response = Invoke-RestMethod -Method Get -Uri $url
    }
    $responseDocuments = @()
    if ($response -and $response.documents) {
      $responseDocuments = $response.documents
    }
    foreach ($document in $responseDocuments) {
      $documents += ,(Convert-FirestoreDocument $document)
    }
    $nextPageToken = $response.nextPageToken
  } while ($nextPageToken)

  return $documents
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

function Normalize-Text {
  param($Value)
  if ($null -eq $Value) { return '' }
  return [string]$Value.ToString().Trim()
}

function Add-Count {
  param(
    [hashtable]$Map,
    [string]$Key
  )

  if ([string]::IsNullOrWhiteSpace($Key)) { return }
  if ($Map.ContainsKey($Key)) {
    $Map[$Key] += 1
  } else {
    $Map[$Key] = 1
  }
}

function Sort-Counts {
  param([hashtable]$Map)

  return $Map.GetEnumerator() |
    Sort-Object -Property @{ Expression = 'Value'; Descending = $true }, @{ Expression = 'Key'; Descending = $false } |
    ForEach-Object { [ordered]@{ value = $_.Key; count = $_.Value } }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$envValues = Read-EnvFile -Path (Join-Path $repoRoot '.env')

$projectId = $envValues['VITE_FIREBASE_PROJECT_ID']
$apiKey = $envValues['VITE_FIREBASE_API_KEY']
$headers = $null

if ($Mode -eq 'admin') {
  $accessToken = Get-AccessTokenFromAdc -Path $AdcPath
  $headers = @{
    Authorization = "Bearer $accessToken"
  }
}

$users = Get-FirestoreDocuments -ProjectId $projectId -ApiKey $apiKey -CollectionName 'users' -Mode $Mode -EmulatorHost $EmulatorHost -Headers $headers
$clients = Get-FirestoreDocuments -ProjectId $projectId -ApiKey $apiKey -CollectionName 'clients' -Mode $Mode -EmulatorHost $EmulatorHost -Headers $headers

$workTypes = @{}
$clientAssignees = @{}
$szjaAssignees = @{}
$ipaValues = @{}
$highPriorityCount = 0
$manualExceptionCount = 0
$clientsWithSzja = 0

foreach ($client in $clients) {
  $workType = Normalize-Text $client.munkavegzesJellege
  $clientAssignee = Normalize-Text $client.hozzarendeltSzemely
  $ipa = Normalize-Text $client.ipa
  $szja = if ($client.ContainsKey('szja2025')) { $client.szja2025 } else { @{} }
  $szjaAssignee = Normalize-Text $szja.assignedTo

  Add-Count -Map $workTypes -Key $workType
  Add-Count -Map $clientAssignees -Key $clientAssignee
  Add-Count -Map $ipaValues -Key $ipa

  if ($szja.Count -gt 0) {
    $clientsWithSzja += 1
    Add-Count -Map $szjaAssignees -Key $szjaAssignee
    if ($szja.highPriority -eq $true) { $highPriorityCount += 1 }
    if (-not [string]::IsNullOrWhiteSpace((Normalize-Text $szja.manualException))) { $manualExceptionCount += 1 }
  }
}

$userSummary = $users |
  ForEach-Object {
    [ordered]@{
      id = $_.id
      username = Normalize-Text $_.username
      email = Normalize-Text $_.email
      themeColor = Normalize-Text $_.themeColor
    }
  } |
  Sort-Object -Property @{ Expression = { $_.username } }, @{ Expression = { $_.email } }, @{ Expression = { $_.id } }

$output = [ordered]@{
  projectId = $projectId
  readOnly = $true
  mode = $Mode
  users = $userSummary
  clientSummary = [ordered]@{
    totalClients = $clients.Count
    clientsWithSzja = $clientsWithSzja
    highPriorityCount = $highPriorityCount
    manualExceptionCount = $manualExceptionCount
    workTypes = @(Sort-Counts -Map $workTypes)
    clientAssignees = @(Sort-Counts -Map $clientAssignees)
    szjaAssignees = @(Sort-Counts -Map $szjaAssignees)
    ipaValues = @(Sort-Counts -Map $ipaValues)
  }
}

$output | ConvertTo-Json -Depth 8
