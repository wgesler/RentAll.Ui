$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$sqlPath = Join-Path $repoRoot 'RentAll.Db/Population/PropertyHtml_Data.sql'
$assetsPath = $PSScriptRoot

if (-not (Test-Path $sqlPath)) {
  throw "Could not find SQL seed file at: $sqlPath"
}

$sql = Get-Content -Raw -Path $sqlPath

$pattern = "DECLARE\s+@(?<name>\w+)\s+VARCHAR\(MAX\)\s*=\s*'(?<body>.*?)';"
$options = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Singleline
$matches = [regex]::Matches($sql, $pattern, $options)

$dbVars = @{}
foreach ($m in $matches) {
  $dbVars[$m.Groups['name'].Value] = ($m.Groups['body'].Value -replace "''", "'")
}

# Property.PropertyHtml seed variable -> UI asset file
$mapping = [ordered]@{
  WelcomeLetter             = 'welcome-letter.html'
  Lease                     = 'reservation-lease.html'
  Invoice                   = 'invoice.html'
  WorkOrder                 = 'work-order.html'
  LetterOfResponsibility    = 'letter-of-responsibility.html'
  NoticeToVacate            = 'notice-to-vacate.html'
  CreditAuthorization       = 'credit-authorization.html'
  CreditApplicationBusiness = 'credit-application-business.html'
  CreditApplicationIndividual = 'credit-application-individual.html'
}

function Normalize-Template([string]$text) {
  if ($null -eq $text) {
    return $null
  }

  $normalized = $text -replace "`r`n", "`n" -replace "`r", "`n"
  $lines = $normalized -split "`n" | ForEach-Object { $_.TrimEnd() }
  return (($lines -join "`n").Trim() + "`n")
}

$results = @()

foreach ($key in $mapping.Keys) {
  $fileName = $mapping[$key]
  $assetFilePath = Join-Path $assetsPath $fileName

  if (-not $dbVars.ContainsKey($key)) {
    $results += [PSCustomObject]@{
      Name     = $key
      File     = $fileName
      Status   = 'missing_db_variable'
      DbLength = $null
      UiLength = $null
    }
    continue
  }

  if (-not (Test-Path $assetFilePath)) {
    $results += [PSCustomObject]@{
      Name     = $key
      File     = $fileName
      Status   = 'missing_asset_file'
      DbLength = $null
      UiLength = $null
    }
    continue
  }

  $dbTemplate = Normalize-Template $dbVars[$key]
  $uiTemplate = Normalize-Template (Get-Content -Raw -Path $assetFilePath)

  $status = if ($dbTemplate -eq $uiTemplate) { 'same' } else { 'different' }
  if ($key -eq 'Lease' -and $status -eq 'different') {
    $dbIgnoringApostrophes = $dbTemplate -replace "'", ''
    $uiIgnoringApostrophes = $uiTemplate -replace "'", ''
    if ($dbIgnoringApostrophes -eq $uiIgnoringApostrophes) {
      $status = 'same except for acceptable double quotes'
    }
  }

  $results += [PSCustomObject]@{
    Name     = $key
    File     = $fileName
    Status   = $status
    DbLength = $dbTemplate.Length
    UiLength = $uiTemplate.Length
  }
}

$results | Sort-Object File | Format-Table -AutoSize

$differentCount = ($results | Where-Object { $_.Status -eq 'different' }).Count
$missingCount = ($results | Where-Object { $_.Status -like 'missing_*' }).Count

Write-Host ''
Write-Host "Summary: $differentCount different, $missingCount missing mappings/files." -ForegroundColor Cyan
Write-Host "Note: For Lease, if the only mismatch is single quote escaping ('' vs '), ignore it. Double single quotes are required in SQL string literals." -ForegroundColor DarkGray
Write-Host 'Tip: Run from anywhere with:' -ForegroundColor DarkGray
Write-Host "powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot/check-property-html-template-matches.ps1`"" -ForegroundColor DarkGray
