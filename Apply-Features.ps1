# Apply-Features.ps1
# Adds: (1) Forgot / reset password pages, (2) "Find pictures from the deal link" on the
# Submit Deal form (server-side lookup with internal-network protection), (3) reset email.
# Safety: verifies your files are the ones Claude read, backs them up, runs type-check and
# build, and restores everything automatically if either fails. No commit, push or DB change.

$ErrorActionPreference = 'Stop'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-features-report.txt'

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Apply features run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath $payload)) { Fail 'The payload folder next to this script is missing.' }
Log "Project : $root"
Log ("Branch  : " + ((cmd /c "git rev-parse --abbrev-ref HEAD 2>&1") -join ' '))

# files that already exist: must match what Claude inspected (any one of the allowed hashes)
$modified = @(
  @{ rel = 'src\lib\auth\auth.ts';        ok = @('622a8f22380547d08d9b2aaaca6a1fa844ef50c5e50d6a968a9a7a4148e76764', '6bd27e735d9633902411611c34c4e09e1f740ce2a1173febb0aabf34075a0697') },
  @{ rel = 'src\pages\auth\AuthPage.tsx'; ok = @('5f210b8aee2028b90e348e5bafde4144a5e2d7ab39d93a7dfcaa73a43fc3bf94', 'd1b4bb85c5c1efbb6a5960c1f60799ffdddab0dbcb230461405c04370fa675ad') },
  @{ rel = 'src\routes.tsx';               ok = @('682dd8c93eda7afd0997bde26b3cc5d97cfa0fa76122039ad29860daae58a135') },
  @{ rel = 'src\server\entry.ts';         ok = @('98fdf05d2d012e3a1ffef5a45f9f902c8676b8aae1001c98493bc8cf40bcec35') },
  @{ rel = 'src\pages\deals\submit.tsx'; ok = @('0ab05cbbb412f69331147439fc8987ac4dfe3ce2140c92714fce8569e0d13304') }
)
$modRels = $modified | ForEach-Object { $_.rel.ToLower() }

# 1. every file we will replace must be unchanged since Claude read it
foreach ($m in $modified) {
  $p = Join-Path $root $m.rel
  if (-not (Test-Path -LiteralPath $p)) { Fail "Missing $($m.rel)" }
  $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower()
  $payloadFile = Join-Path $payload $m.rel
  $ph = (Get-FileHash -Algorithm SHA256 -LiteralPath $payloadFile).Hash.ToLower()
  $m.state = if ($h -eq $ph) { 'done' } elseif ($m.ok -contains $h) { 'todo' } else { 'changed' }
  if ($m.state -eq 'changed') { Fail "$($m.rel) has changed since the snapshot Claude read. Run collect-local-state.bat again and send the new zip. (If you have not run Apply-Auth-Fix.bat yet, run it first.)" }
}
Log 'Existing files match the snapshot Claude inspected: OK'

# 2. brand-new files must not clash with different files already there
$newFiles = @()
Get-ChildItem -LiteralPath $payload -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($payload.Length).TrimStart('\')
  if ($modRels -contains $rel.ToLower()) { return }
  $dest = Join-Path $root $rel
  if (Test-Path -LiteralPath $dest) {
    $same = (Get-FileHash -Algorithm SHA256 -LiteralPath $dest).Hash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    if (-not $same) { Fail "$rel already exists and is different. Not overwriting it." }
  } else { $newFiles += $rel }
}

if (@($modified | Where-Object { $_.state -eq 'todo' }).Count -eq 0 -and $newFiles.Count -eq 0) { Log 'Already applied - nothing to do.'; exit 0 }

# 3. does the installed Better Auth have what we call?
$ba = Join-Path $root 'node_modules\better-auth'
if (-not (Test-Path -LiteralPath $ba)) { Fail 'node_modules\better-auth not found. Run npm.cmd install first.' }
$ver = (Get-Content (Join-Path $ba 'package.json') -Raw | ConvertFrom-Json).version
Log "Better Auth installed version: $ver"
$dist = Get-ChildItem -Path (Join-Path $ba 'dist') -Recurse -Include *.mjs,*.js,*.cjs -ErrorAction SilentlyContinue
foreach ($needle in @('onExistingUserSignUp', 'requestPasswordReset', 'sendResetPassword')) {
  if (-not ($dist | Select-String -Pattern $needle -List | Select-Object -First 1)) { Fail "Better Auth $ver does not contain '$needle'. Send Claude auth the report file." }
}
Log 'Better Auth features present: OK'

# 4. backup
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $root ".update-backups\features-$stamp"
foreach ($m in $modified) {
  $dest = Join-Path $bk $m.rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath (Join-Path $root $m.rel) -Destination $dest -Force
}
$exclude = Join-Path $root '.git\info\exclude'
if (Test-Path -LiteralPath $exclude) {
  if (-not (Get-Content $exclude -Raw).Contains('.update-backups')) { Add-Content -Path $exclude -Value '.update-backups' }
}
Log "Backup  : $bk"

function Restore-All {
  foreach ($m in $modified) { Copy-Item -LiteralPath (Join-Path $bk $m.rel) -Destination (Join-Path $root $m.rel) -Force }
  foreach ($rel in $newFiles) { Remove-Item -LiteralPath (Join-Path $root $rel) -Force -ErrorAction SilentlyContinue }
  Log 'Your original files were restored and the new files removed.'
}

# 5. apply
foreach ($m in $modified) { if ($m.state -eq 'todo') { Copy-Item -LiteralPath (Join-Path $payload $m.rel) -Destination (Join-Path $root $m.rel) -Force } }
foreach ($rel in $newFiles) {
  $dest = Join-Path $root $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath (Join-Path $payload $rel) -Destination $dest -Force
}
Log ("Updated : " + (@($modified | Where-Object { $_.state -eq 'todo' }).Count) + " existing files, added " + $newFiles.Count + " new files")

# 6. verify
Log ''
Log 'Running type-check (about 30 seconds)...'
$tc = cmd /c "npm.cmd run type-check 2>&1"
if ($LASTEXITCODE -ne 0) {
  Add-Content -Path $report -Value ($tc | Out-String) -Encoding ASCII
  Log ($tc | Select-Object -Last 30 | Out-String)
  Log 'TYPE-CHECK FAILED.'
  Restore-All
  Log "Full details saved in $report - send that file to Claude."
  exit 1
}
Log 'Type-check: PASSED'
Log 'Running build (about 1 minute)...'
$bd = cmd /c "npm.cmd run build 2>&1"
if ($LASTEXITCODE -ne 0) {
  Add-Content -Path $report -Value ($bd | Out-String) -Encoding ASCII
  Log ($bd | Select-Object -Last 30 | Out-String)
  Log 'BUILD FAILED.'
  Restore-All
  Log "Full details saved in $report - send that file to Claude."
  exit 1
}
Log 'Build: PASSED'
Log ''
Log 'DONE. Nothing was committed or pushed.'
Log 'Restart the dev server (Ctrl+C, then npm.cmd run dev) and test:'
Log '  A. Sign in page -> "Forgot password?" -> enter your email -> email arrives -> choose a new password.'
Log '  B. Submit a deal -> paste a product link -> "Find pictures from the deal link" -> tick pictures -> submit.'
Log '     Big shops (Amazon, Flipkart) often refuse automatic access; you will then see a message asking you to upload.'
Log "To undo everything: copy the files in $bk back into src (new files can simply be deleted)."
