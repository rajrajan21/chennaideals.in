# Apply-Pack5.ps1
# Adds "Mobile number" sign in / sign up (Indian numbers, 6-digit code) to the login page.
# - Works FREE in test mode: the code is printed in the window where npm run dev is running.
# - Real SMS (paid, via Fast2SMS) is switched on later with Set-Sms-Key.bat.
# - Adds two columns to the user table in your LOCAL database (safe to run twice).
# - Also installs the improved Sync-To-GitHub.bat (commit + upload backup).
# Safety: backs up src first, runs type-check + build, restores src if anything fails.
# Does NOT commit or push.

$ErrorActionPreference = 'Continue'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-pack5-report.txt'
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Pack 5 run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'src'))) { Fail 'The payload folder next to this script is missing.' }
foreach ($need in @('src\lib\auth\auth.ts', 'src\lib\auth\auth-client.tsx', 'src\server\db\schema.ts', 'src\components\AuthShell.tsx')) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $need))) { Fail "Missing $need - Update Pack 4 must be applied first." }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js was not found on PATH.' }
Log "Project : $root"
Log ("Branch  : " + ((cmd /c "git rev-parse --abbrev-ref HEAD 2>&1") -join ' '))

# ---- baseline -------------------------------------------------------------
Log ''
Log 'Checking your project as it is now (about 30 seconds)...'
$baseOut = cmd /c "npm.cmd run type-check 2>&1"
$baseErr = @($baseOut | Where-Object { $_ -match 'error TS' } | ForEach-Object { $_.ToString().Trim() })
if ($baseErr.Count -gt 0) {
  Log ("NOTE: your project already has " + $baseErr.Count + " type error(s) that are NOT caused by this pack:")
  $baseErr | ForEach-Object { Log ("  " + $_) }
} else { Log 'Baseline type-check: clean' }

# ---- backup ---------------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $root ".update-backups\pack5-$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
robocopy (Join-Path $root 'src') (Join-Path $bk 'src') /E /NFL /NDL /NJH /NJS /NP | Out-Null
foreach ($f in @('Sync-To-GitHub.ps1','Sync-To-GitHub.bat','Common-Git-Safety.ps1')) {
  if (Test-Path -LiteralPath (Join-Path $root $f)) { Copy-Item -LiteralPath (Join-Path $root $f) -Destination $bk -Force }
}
Log "Backup  : $bk"

function Restore-All {
  robocopy (Join-Path $bk 'src') (Join-Path $root 'src') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  foreach ($f in @('Sync-To-GitHub.ps1','Sync-To-GitHub.bat','Common-Git-Safety.ps1')) {
    if (Test-Path -LiteralPath (Join-Path $bk $f)) { Copy-Item -LiteralPath (Join-Path $bk $f) -Destination (Join-Path $root $f) -Force }
  }
  Log 'Your original src folder was restored.'
}
function Stop-Restore([string]$m) { Log ''; Log "STOPPED: $m"; Restore-All; Log "Details are in $report - send that file to Claude."; exit 1 }

# ---- copy ONLY this pack's files ---------------------------------------------
$manifest = @(
  'Common-Git-Safety.ps1',
  'Set-Sms-Key.bat',
  'Set-Sms-Key.ps1',
  'Sync-To-GitHub.bat',
  'Sync-To-GitHub.ps1',
  'src\components\PhoneAuth.tsx',
  'src\lib\auth\phone-auth.ts',
  'src\lib\phone.ts',
  'src\pages\auth\AuthPage.tsx',
  'src\server\lib\sms.ts',
  'tools\add-phone-columns.mjs'
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

# ---- small edits to three existing files ----------------------------------------
function Read-Text([string]$p) { [IO.File]::ReadAllText($p, $utf8) }
function Write-Text([string]$p, [string]$t) { [IO.File]::WriteAllText($p, $t, $utf8) }
function Insert-After([string]$text, [string]$pattern, [string]$line) {
  $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $ms = [regex]::Matches($text, $pattern)
  if ($ms.Count -ne 1) { return $null }
  $m = $ms[0]
  return $text.Insert($m.Index + $m.Length, $nl + $line)
}

# auth.ts: use the phone plugin
$p = Join-Path $root 'src\lib\auth\auth.ts'
$t = Read-Text $p
if (-not $t.Contains('buildPhonePlugin')) {
  $t = Insert-After $t '(?m)^[ \t]*import \{ sendResendEmail \}[^\r\n]*' "import { buildPhonePlugin } from './phone-auth';"
  if ($null -eq $t) { Stop-Restore 'Could not find the sendResendEmail import in src\lib\auth\auth.ts.' }
  $t = Insert-After $t '(?m)^[ \t]*secret: authSecret,[^\r\n]*' '    plugins: [buildPhonePlugin()],'
  if ($null -eq $t) { Stop-Restore 'Could not find "secret: authSecret," in src\lib\auth\auth.ts.' }
  Write-Text $p $t
  Log 'Updated auth.ts'
}

# schema.ts: two phone columns on the user table
$p = Join-Path $root 'src\server\db\schema.ts'
$t = Read-Text $p
if (-not $t.Contains('phoneNumberVerified')) {
  $t = Insert-After $t "(?m)^[ \t]*emailVerified: boolean\('email_verified'\)[^\r\n]*" ("  phoneNumber: varchar('phone_number', { length: 20 }).unique()," + $(if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }) + "  phoneNumberVerified: boolean('phone_number_verified').default(false),")
  if ($null -eq $t) { Stop-Restore 'Could not find the emailVerified column in src\server\db\schema.ts.' }
  Write-Text $p $t
  Log 'Updated schema.ts'
}

# auth-client.tsx: phone plugin for the browser
$p = Join-Path $root 'src\lib\auth\auth-client.tsx'
$t = Read-Text $p
if (-not $t.Contains('phoneNumberClient')) {
  $t = Insert-After $t "(?m)^[ \t]*import \{ createAuthClient \} from 'better-auth/react';[^\r\n]*" "import { phoneNumberClient } from 'better-auth/client/plugins';"
  if ($null -eq $t) { Stop-Restore 'Could not find the createAuthClient import in auth-client.tsx.' }
  $t = Insert-After $t '(?m)^[ \t]*baseURL:[^\r\n]*window\.location\.origin[^\r\n]*' '  plugins: [phoneNumberClient()],'
  if ($null -eq $t) { Stop-Restore 'Could not find the baseURL line in auth-client.tsx.' }
  Write-Text $p $t
  Log 'Updated auth-client.tsx'
}

# ---- database: add the columns BEFORE the app runs with the new schema -------------
Log ''
Log 'Updating your local database (2 new columns on the user table)...'
$dbOut = cmd /c "node tools\add-phone-columns.mjs 2>&1"
Log ($dbOut | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { Stop-Restore 'DATABASE UPDATE FAILED.' }

# ---- verify -----------------------------------------------------------------------
Log ''
Log 'Running type-check (about 30 seconds)...'
$tc = cmd /c "npm.cmd run type-check 2>&1"
$newErr = @($tc | Where-Object { $_ -match 'error TS' } | ForEach-Object { $_.ToString().Trim() } | Where-Object { $baseErr -notcontains $_ })
if ($newErr.Count -gt 0) {
  Add-Content -Path $report -Value ($tc | Out-String) -Encoding ASCII
  $newErr | Select-Object -First 25 | ForEach-Object { Log ("  " + $_) }
  Stop-Restore 'TYPE-CHECK FOUND NEW ERRORS. (The two new database columns are harmless and were left in place.)'
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
Log 'Restart the dev server (Ctrl+C, then npm.cmd run dev), hard-refresh (Ctrl+Shift+R), open /login and click "Mobile number".'
Log 'TEST MODE (free): enter a number, press Send code, then LOOK IN THE WINDOW running npm run dev - the 6-digit code is printed there.'
Log 'REAL SMS: run Set-Sms-Key.bat (Fast2SMS account with KYC + wallet recharge needed; SMS is paid, not free).'
Log 'BACKUP: run Sync-To-GitHub.bat any time to commit and upload everything to GitHub.'
Log "To undo the code: copy $bk\src back over src."
