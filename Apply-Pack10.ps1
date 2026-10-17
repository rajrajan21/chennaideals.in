# Apply-Pack10.ps1
# Deal Hunter v2: correct prices (product pages only), category/sub-category filters, unique-price check, pictures that always load, rupee symbol font.

$ErrorActionPreference = 'Continue'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-pack10-report.txt'
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Pack 10 run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'src'))) { Fail 'The payload folder next to this script is missing.' }
foreach ($need in @('src\server\lib\hunter\hunter-core.ts', 'src\pages\admin\DealHunter.tsx', 'src\styles\globals.css')) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $need))) { Fail "Missing $need - Update Pack 9 (Deal Hunter) must be applied first." }
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
$bk = Join-Path $root ".update-backups\pack10-$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
robocopy (Join-Path $root 'src') (Join-Path $bk 'src') /E /NFL /NDL /NJH /NJS /NP | Out-Null
Log "Backup  : $bk"
function Restore-All {
  robocopy (Join-Path $bk 'src') (Join-Path $root 'src') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  Log 'Your original src folder was restored.'
}
function Stop-Restore([string]$m) { Log ''; Log "STOPPED: $m"; Restore-All; Log "Details are in $report - send that file to Claude."; exit 1 }

$manifest = @(
  'src\pages\admin\DealHunter.tsx',
  'src\server\api\admin\hunter\[jobId]\GET.ts',
  'src\server\api\admin\hunter\[jobId]\publish\POST.ts',
  'src\server\api\admin\hunter\options\GET.ts',
  'src\server\api\admin\hunter\start\POST.ts',
  'src\server\lib\hunter\admin-guard.ts',
  'src\server\lib\hunter\hunter-ai.ts',
  'src\server\lib\hunter\hunter-core.ts',
  'src\server\lib\hunter\hunter-engine.ts',
  'src\server\lib\hunter\hunter-jobs.ts',
  'src\server\lib\hunter\hunter-providers.ts',
  'src\server\lib\hunter\hunter-sources.ts',
  'tools\Delete-Deal.bat',
  'tools\Set-AI-Key.bat',
  'tools\delete-deal.mjs',
  'tools\set-ai-key.mjs'
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

function Read-Text([string]$p) { [IO.File]::ReadAllText($p, $utf8) }
function Write-Text([string]$p, [string]$t) { [IO.File]::WriteAllText($p, $t, $utf8) }
function Nl([string]$text) { if ($text.Contains("`r`n")) { "`r`n" } else { "`n" } }
function Insert-After([string]$text, [string]$pattern, [string]$line) {
  $ms = [regex]::Matches($text, $pattern)
  if ($ms.Count -ne 1) { return $null }
  return $text.Insert($ms[0].Index + $ms[0].Length, (Nl $text) + $line)
}

# rupee symbol: use a font whose rupee sign matches the logo (two bars and a tail) everywhere on the site
$p = Join-Path $root 'src\styles\globals.css'
$t = Read-Text $p
if (-not $t.Contains('Noto+Sans')) {
  $imp = "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;800&text=%E2%82%B9&display=swap');"
  $m = [regex]::Match($t, '(?m)^@import[^\r\n]*')
  if ($m.Success) { $t = $t.Insert($m.Index + $m.Length, (Nl $t) + $imp) } else { $t = $imp + (Nl $t) + $t }
  $t = $t.Replace('--font-sans: "Inter",', '--font-sans: "Noto Sans", "Inter",').Replace('--font-heading: "Poppins",', '--font-heading: "Noto Sans", "Poppins",')
  Write-Text $p $t
  Log 'Rupee symbol font added (Noto Sans, only for the rupee sign)'
} else { Log 'Rupee font already present.' }

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
Log 'STOP and restart npm run dev, then hard-refresh (Ctrl+Shift+R). Open /admin/hunter. To remove the wrong deal 32 run tools\Delete-Deal.bat. To add an AI key run tools\Set-AI-Key.bat.'
Log "To undo: copy $bk\src back over src."
