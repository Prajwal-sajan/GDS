# Imports the privately downloaded screenshot/PDF reference package into a running local GDS v24.
# It NEVER promotes competitor data into the operational settlement ledger.
# Usage: .\tools\Import-Invoice-References-v24.ps1 -ReferenceDirectory C:\JourneyOS\Invoice-Sources -PdfDirectory C:\JourneyOS\Invoice-PDFs
[CmdletBinding()]
param(
  [string]$BaseUrl = 'http://localhost:3000',
  [Parameter(Mandatory=$true)][string]$ReferenceDirectory,
  [Parameter(Mandatory=$true)][string]$PdfDirectory,
  [switch]$SkipPdfUpload,
  [switch]$SkipSnapshotUpload
)
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$manifest = Join-Path $ReferenceDirectory 'manifest.json'
if (-not (Test-Path $manifest)) { throw "Missing reference package manifest: $manifest" }
$manifestObject = Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifestObject.scope -ne 'reference_only') { throw 'This importer accepts reference-only packages, never operational billing records.' }

# Token stays in this local PowerShell process; do not paste it into chats or files.
$secure = Read-Host 'Paste your LOCAL GDS login token here (input hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if (-not $token) { throw 'Authentication token is required.' }
$headers = @{Authorization="Bearer $token"}
function ApiGet([string]$uri) {
  Invoke-RestMethod -Method Get -Uri ($BaseUrl+$uri) -Headers $headers
}
function ApiSend([string]$method,[string]$uri,$data) {
  $json = $data | ConvertTo-Json -Compress -Depth 80
  Invoke-RestMethod -Method $method -Uri ($BaseUrl+$uri) -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $json
}
$catalog = ApiGet '/api/accounts/invoices-v24'
$year = '2026'
$results = @()
$docNo = @{
  'ST-26-27-11.pdf' = 'ST/26-27/11'
}
foreach ($item in $manifestObject.source_documents) {
  $name = $item.pdf
  $jsonPath = Join-Path $ReferenceDirectory $item.snapshot_file
  $pdfPath = Join-Path $PdfDirectory $name
  if (-not (Test-Path $jsonPath)) { throw "Missing source mapping JSON: $jsonPath" }
  $entry = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $entry.reference_only) { throw "Refusing nonreference data: $name" }
  if ($entry.sha256 -ne $item.sha256) { throw "Manifest/source mismatch: $name" }
  $stem = [IO.Path]::GetFileNameWithoutExtension($name)
  $docName = if ($docNo.ContainsKey($name)) { $docNo[$name] } else { $stem }
  $month = if ($stem -eq 'OS-2026-00011') { '2026-11' } else { '2026-10' }
  $date = if ($month -eq '2026-11') { '2026-11-20' } else { '2026-10-31' }
  $existing = @($catalog.documents | Where-Object {
    $_.name -eq $docName -and $_.period_month -eq $month -and $_.type -eq $entry.type
  })
  if ($existing.Count -gt 1) { throw "Ambiguous duplicate document entries for $docName"; }
  if ($existing.Count -eq 1) {
    if (-not $existing[0].is_reference) {
      throw "Existing operational document $docName cannot be overwritten by reference-only data."
    }
    $doc = $existing[0]
  } else {
    $doc = ApiSend 'POST' '/api/accounts/invoices-v24/documents' @{
      type = $entry.type; name = $docName; month = $month; date = $date
      reference_only = $true
    }
    $catalog.documents += $doc
  }
  $key = [uri]::EscapeDataString($doc.key)
  if (-not $SkipSnapshotUpload) {
    $null = ApiSend 'PUT' ("/api/accounts/invoices-v24/documents/$key/snapshot") @{snapshot = $entry.snapshot}
  }
  $pdfState = 'skipped'
  if (-not $SkipPdfUpload) {
    if (-not (Test-Path $pdfPath)) {
      throw "Missing original PDF: $pdfPath. Download the eight originals to that folder or use -SkipPdfUpload."
    }
    $sha = (Get-FileHash -Path $pdfPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sha -ne $entry.sha256) { throw "SHA-256 mismatch for $name. The exact supplied PDF is required." }
    $bytes = [IO.File]::ReadAllBytes($pdfPath)
    $null = ApiSend 'POST' ("/api/accounts/invoices-v24/documents/$key/pdf") @{
      filename=$name; base64=[Convert]::ToBase64String($bytes)
    }
    $pdfState = 'original SHA-256 verified'
  }
  $results += [pscustomobject]@{Document=$docName;Type=$entry.type;Month=$month;Rows=$item.line_count;PDF=$pdfState}
  Write-Host "Imported $docName ($($item.line_count) line records), PDF $pdfState"
}
$results | Format-Table -AutoSize
$recon = ApiGet '/api/accounts/invoices-v24/reconcile/2026-10?scope=reference'
Write-Host "October reconciliation: matched=$($recon.summary.matched), mismatched=$($recon.summary.mismatched), insufficient=$($recon.summary.insufficient_evidence)"
if ($recon.summary.mismatched -gt 0) {
  Write-Warning 'Review mismatches: some original PDF line values are clipped. No missing value was invented.'
}
Write-Host 'Completed reference-only import. No settlement postings, payments, or tax invoices were issued.'
