# Apply-Pack7.ps1
# Look and wording updates:
#  - friendlier "community-supported" safety notice under the header
#  - login / sign-up / password pages use the website's own colours (amber header colour + green buttons)
#  - the logo box takes the page background colour (no white box around the logo)
#  - shorter search bar so "Sign in" / your name / "Sign out" are not pushed to the far right
# Safety: backs up src, runs type-check + build, restores everything if anything fails.
# Does NOT commit or push and does not touch the database.

$ErrorActionPreference = 'Continue'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-pack7-report.txt'
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Pack 7 run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'src'))) { Fail 'The payload folder next to this script is missing.' }
foreach ($need in @('src\components\AuthShell.tsx', 'src\components\PhoneAuth.tsx', 'src\components\SafetyNotice.tsx', 'src\layouts\parts\Header.tsx')) {
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
$bk = Join-Path $root ".update-backups\pack7-$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
robocopy (Join-Path $root 'src') (Join-Path $bk 'src') /E /NFL /NDL /NJH /NJS /NP | Out-Null
Log "Backup  : $bk"
function Restore-All {
  robocopy (Join-Path $bk 'src') (Join-Path $root 'src') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  Log 'Your original src folder was restored.'
}
function Stop-Restore([string]$m) { Log ''; Log "STOPPED: $m"; Restore-All; Log "Details are in $report - send that file to Claude."; exit 1 }

$manifest = @(
  'src\components\AuthShell.tsx',
  'src\components\PhoneAuth.tsx',
  'src\components\SafetyNotice.tsx',
  'src\pages\auth\AuthPage.tsx',
  'src\pages\auth\ForgotPassword.tsx',
  'src\pages\auth\ResetPassword.tsx'
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

# ---- header: logo box colour, shorter search, auth buttons closer to the middle ------------
$p = Join-Path $root 'src\layouts\parts\Header.tsx'
$t = [IO.File]::ReadAllText($p, $utf8)
$nl = if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }
$did = 0
if (-not $t.Contains('mix-blend-multiply')) {
  $rx = [regex]'<img\s+src="/logo\.jpg"[\s\S]*?/>'
  if ($rx.Matches($t).Count -eq 1) {
    $logo = '<span className="inline-flex overflow-hidden rounded-xl bg-background shadow-md ring-1 ring-white/30">' + $nl +
            '              <img src="/logo.jpg" alt="ChennaiDeals.in - Best deals voted by you, Every rupee counts!" className="h-14 md:h-16 w-auto mix-blend-multiply" />' + $nl +
            '            </span>'
    $t = $rx.Replace($t, $logo.Replace('$', '$$'))
    $did++; Log 'Header: logo box now uses the page colour'
  } else { Log 'WARNING: could not find the logo image in Header.tsx - logo colour not changed.' }
}
if ($t.Contains('max-w-4xl relative')) { $t = $t.Replace('max-w-4xl relative', 'max-w-2xl relative'); $did++; Log 'Header: search bar made shorter' }
if ($t.Contains('gap-3 ml-auto shrink-0')) { $t = $t.Replace('gap-3 ml-auto shrink-0', 'gap-3 ml-2 shrink-0'); $did++; Log 'Header: Sign in / user name / Sign out moved away from the far right' }
if ($t.Contains('max-w-36 truncate')) { $t = $t.Replace('max-w-36 truncate', 'max-w-48 truncate'); $did++ }
if ($did -gt 0) { [IO.File]::WriteAllText($p, $t, $utf8) } else { Log 'Header.tsx already updated (or has a different layout) - not changed.' }

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
Log 'Hard-refresh the browser (Ctrl+Shift+R) - no server restart is needed. Check: the notice under the header, /login colours, the logo box, and the header on a wide screen.'
Log "To undo: copy $bk\src back over src."
