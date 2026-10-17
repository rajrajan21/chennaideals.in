# Apply-Pack8.ps1
# Shorter 3-line safety notice, WhatsApp share + Report buttons on deal pages, one-place contact email setting.

$ErrorActionPreference = 'Continue'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-pack8-report.txt'
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Pack 8 run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'src'))) { Fail 'The payload folder next to this script is missing.' }
foreach ($need in @('src\components\SafetyNotice.tsx', 'src\pages\deals\[id].tsx')) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $need))) { Fail "Missing $need - Update Packs 4, 5 and 6 must be applied first." }
}
Log "Project : $root"
Log ("Branch  : " + ((cmd /c "git rev-parse --abbrev-ref HEAD 2>&1") -join ' '))

Log ''
Log 'Checking your project as it is now (about 30 seconds)...'
$baseOut = cmd /c "npm.cmd run type-check 2>&1"
$baseErr = @($baseOut | Where-Object { $_ -match 'error TS' } | ForEach-Object { $_.ToString().Trim() })
if ($baseErr.Count -gt 0) {
  Log ("NOTE: your project already has " + $baseErr.Count + " type error(s) that are NOT caused by this pack:")
  $baseErr | ForEach-Object { Log ("  " + $_) }
} else { Log 'Baseline type-check: clean' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $root ".update-backups\pack8-$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
robocopy (Join-Path $root 'src') (Join-Path $bk 'src') /E /NFL /NDL /NJH /NJS /NP | Out-Null
Log "Backup  : $bk"
function Restore-All {
  robocopy (Join-Path $bk 'src') (Join-Path $root 'src') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  Log 'Your original src folder was restored.'
}
function Stop-Restore([string]$m) { Log ''; Log "STOPPED: $m"; Restore-All; Log "Details are in $report - send that file to Claude."; exit 1 }

$manifest = @(
  'src\lib\site-config.ts',
  'src\components\SafetyNotice.tsx',
  'src\components\DealActions.tsx'
)
foreach ($rel in $manifest) {
  if (-not (Test-Path -LiteralPath (Join-Path $payload $rel))) { Stop-Restore "The pack is incomplete: $rel is missing. Unzip it again into a NEW empty folder." }
}
foreach ($rel in $manifest) {
  $dest = Join-Path $root $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath (Join-Path $payload $rel) -Destination $dest -Force
}
Log ("Copied  : " + $manifest.Count + " files")

# ---- deal page: add WhatsApp + Report buttons next to Share ------------------------------
$p = Join-Path $root 'src\pages\deals\[id].tsx'
$t = [IO.File]::ReadAllText($p, $utf8)
$nl_ = if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }
if (-not $t.Contains('DealActions')) {
  $imp = [regex]'(import MediaGallery[^\r\n]*)'
  $rx  = [regex]'(\{shareNotice && <span[^\r\n]*</span>\})'
  if ($imp.Matches($t).Count -eq 1 -and $rx.Matches($t).Count -eq 1) {
    $t = $imp.Replace($t, '$1' + $nl_ + "import DealActions from '@/components/DealActions';")
    $t = $rx.Replace($t, '$1' + $nl_ + '            <DealActions title={deal.title} />')
    [IO.File]::WriteAllText($p, $t, $utf8)
    Log 'Deal page: WhatsApp and Report buttons added'
  } else { Log 'WARNING: could not find the Share row in the deal page - buttons not added.' }
} else { Log 'Deal page already updated.' }

# ---- verify -----------------------------------------------------------------------
Log ''
Log 'Running type-check (about 30 seconds)...'
$tc = cmd /c "npm.cmd run type-check 2>&1"
$newErr = @($tc | Where-Object { $_ -match 'error TS' } | ForEach-Object { $_.ToString().Trim() } | Where-Object { $baseErr -notcontains $_ })
if ($newErr.Count -gt 0) {
  Add-Content -Path $report -Value ($tc | Out-String) -Encoding ASCII
  $newErr | Select-Object -First 25 | ForEach-Object { Log ("  " + $_) }
  Stop-Restore 'TYPE-CHECK FOUND NEW ERRORS.'
}
Log 'Type-check: no new errors'
if ($baseErr.Count -eq 0) {
  Log 'Running build (about 1 minute)...'
  $bd = cmd /c "npm.cmd run build 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Add-Content -Path $report -Value ($bd | Out-String) -Encoding ASCII
    Log ($bd | Select-Object -Last 25 | Out-String)
    Stop-Restore 'BUILD FAILED.'
  }
  Log 'Build: PASSED'
}
Log ''
Log 'DONE. Nothing was committed or pushed.'
Log 'Hard-refresh the browser (Ctrl+Shift+R) - no server restart is needed. Check: the 3-line notice, and WhatsApp / Report buttons on a deal page.'
Log "To undo: copy $bk\src back over src."
