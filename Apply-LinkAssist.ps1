# Apply-LinkAssist.ps1
# Adds "Get details from link" at the top of Submit Deal: fills title, price, shop, category,
# description and "why it is a deal", and saves the pictures in FULL SIZE on the server while the
# user chooses (no second download at submit time). Optional free Gemini AI, off unless a key is set.
# Safety: verifies your files, backs them up, runs type-check + build, undoes itself on failure.
# No commit, push or database change.

$ErrorActionPreference = 'Stop'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-linkassist-report.txt'

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Apply features run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath $payload)) { Fail 'The payload folder next to this script is missing.' }
Log "Project : $root"
Log ("Branch  : " + ((cmd /c "git rev-parse --abbrev-ref HEAD 2>&1") -join ' '))

# files that already exist: must match what Claude inspected (any one of the allowed hashes)
$modified = @(
  @{ rel = 'src\pages\deals\submit.tsx'; ok = @('6273706dc3feb7cc4421718bec9ffb2439598f72e4ffdc43c7830c72f3fedf7f') },
  @{ rel = 'src\server\entry.ts';         ok = @('19db3617809f6d337cb22895d2be63d6790cf197014ed322bb1b10d7fd08d858') },
  @{ rel = 'src\server\api\deals\[id]\media\import\POST.ts'; ok = @('39fc443894b5128b9b31c15dffb6bb5e3a4867119ed5d26a9ddd52615c539efe') }
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

# 4. backup
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $root ".update-backups\linkassist-$stamp"
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
Log 'Restart the dev server (Ctrl+C, then npm.cmd run dev) and test on Submit Deal:'
Log '  1. Paste a product link at the TOP -> "Get details from link" (one click, up to a minute).'
Log '  2. Title, price, shop, category, description and details fill in; pictures appear with their size.'
Log '  3. Edit anything, untick pictures you do not want, "Make main" to choose the main photo, then submit.'
Log '  Big shops (Amazon, Flipkart) may block automatic reading: you then get the product name from the link'
Log '  and a message asking you to add price and details yourself.'
Log 'Optional free AI: run Set-Gemini-Key.bat (see README-FIRST.txt).'
Log "To undo everything: copy the files in $bk back into src (new files can simply be deleted)."
