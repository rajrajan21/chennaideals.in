# Apply-Pack4.ps1
# 1. "Get details from link" is much faster: text fills in first, pictures stream in one by one
# 2. Deal title gets the offer price + original price + discount %, and Original price is filled in
# 3. Modern sign in / sign up / forgot / reset password pages (no blank space at the top)
# 4. Repairs garbled characters (rupee sign, arrows, dots, emoji) in every source file
# Safety: backs up src first, runs type-check + build, restores everything if either fails.
# Does NOT commit, push, or touch the database.

$ErrorActionPreference = 'Continue'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-pack4-report.txt'
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Pack 4 run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'src'))) { Fail 'The payload folder next to this script is missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'src\server\lib\deal-details.ts'))) { Fail 'Update Pack 3 (Get details from link) is not applied yet. Run Apply-LinkAssist.bat first.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'src\server\entry.ts'))) { Fail 'src\server\entry.ts not found.' }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'Node.js was not found on PATH.' }
Log "Project : $root"
Log ("Branch  : " + ((cmd /c "git rev-parse --abbrev-ref HEAD 2>&1") -join ' '))

# ---- baseline: errors that already exist BEFORE this pack --------------------
Log ''
Log 'Checking your project as it is now (about 30 seconds)...'
$baseOut = cmd /c "npm.cmd run type-check 2>&1"
$baseErr = @($baseOut | Where-Object { $_ -match 'error TS' } | ForEach-Object { $_.ToString().Trim() })
if ($baseErr.Count -gt 0) {
  Log ("NOTE: your project already has " + $baseErr.Count + " type error(s) that are NOT caused by this pack:")
  $baseErr | ForEach-Object { Log ("  " + $_) }
  Log 'This pack will only be stopped by NEW errors. Please fix those afterwards (see the end of this report).'
  Log ('git status: ' + ((cmd /c "git status --short src\App.tsx 2>&1") -join ' '))
} else { Log 'Baseline type-check: clean' }

# ---- backup (whole src, it is small) --------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $root ".update-backups\pack4-$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
robocopy (Join-Path $root 'src') (Join-Path $bk 'src') /E /NFL /NDL /NJH /NJS /NP | Out-Null
$exclude = Join-Path $root '.git\info\exclude'
if (Test-Path -LiteralPath $exclude) {
  if (-not (Get-Content $exclude -Raw).Contains('.update-backups')) { Add-Content -Path $exclude -Value '.update-backups' }
}
Log "Backup  : $bk"

function Restore-All {
  robocopy (Join-Path $bk 'src') (Join-Path $root 'src') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  Log 'Your original src folder was restored.'
}
function Stop-Restore([string]$m) { Log ''; Log "STOPPED: $m"; Restore-All; Log "Details are in $report - send that file to Claude."; exit 1 }

# ---- copy ONLY the files that belong to this pack ---------------------------
$manifest = @(
  'src\components\AuthShell.tsx',
  'src\components\DealLinkAssist.tsx',
  'src\lib\deal-link.ts',
  'src\pages\auth\AuthPage.tsx',
  'src\pages\auth\ForgotPassword.tsx',
  'src\pages\auth\ResetPassword.tsx',
  'src\server\api\deals\fetch-image\POST.ts',
  'src\server\lib\deal-ai.ts',
  'src\server\lib\deal-details.ts',
  'src\server\lib\deal-facts.ts',
  'src\server\lib\image-collector.ts',
  'src\server\lib\image-tools.ts',
  'src\server\lib\lookup-store.ts',
  'src\server\lib\page-images.ts',
  'src\server\lib\tmp-images.ts',
  'tools\fix-encoding.mjs'
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
$extra = @(Get-ChildItem -LiteralPath $payload -Recurse -File).Count - $manifest.Count
if ($extra -gt 0) { Log "Note    : $extra other files in the payload folder were IGNORED (left over from an older pack)." }

# ---- register the new picture route in entry.ts ---------------------------
$entry = Join-Path $root 'src\server\entry.ts'
$e = [IO.File]::ReadAllText($entry, $utf8)
$nl = if ($e.Contains("`r`n")) { "`r`n" } else { "`n" }
if (-not $e.Contains('fetch-image/POST')) {
  $impRx = [regex]'(?m)^[ \t]*import\s+[^\r\n]*fetch-details/POST[^\r\n]*'
  $rteRx = [regex]'(?m)^[ \t]*app\.post\(\s*[''"]/api/deals/fetch-details[''"][^\r\n]*'
  $quote = if ($e -match 'from \x27\./api/') { "'" } else { '"' }
  $impLine = 'import deals__fetch_image__post from ' + $quote + './api/deals/fetch-image/POST' + $quote + ';'
  $rteLine = 'app.post(' + $quote + '/api/deals/fetch-image' + $quote + ', deals__fetch_image__post);'
  $mi = $impRx.Match($e)
  if ($mi.Success) { $e = $e.Insert($mi.Index + $mi.Length, $nl + $impLine) }
  else {
    $all = [regex]::Matches($e, '(?m)^[ \t]*import\s+[^\r\n]*\./api/[^\r\n]*')
    if ($all.Count -eq 0) { Add-Content -Path $report -Value (($e -split "`n" | Select-String -Pattern 'fetch|import' | Select-Object -First 60 | Out-String)) -Encoding ASCII; Stop-Restore 'Could not find where the API routes are imported in src\server\entry.ts.' }
    $l = $all[$all.Count - 1]; $e = $e.Insert($l.Index + $l.Length, $nl + $impLine)
  }
  $mr = $rteRx.Match($e)
  if ($mr.Success) { $e = $e.Insert($mr.Index + $mr.Length, $nl + $rteLine) }
  else {
    $all = [regex]::Matches($e, '(?m)^[ \t]*app\.(get|post|put|patch|delete)\([^\r\n]*')
    if ($all.Count -eq 0) { Add-Content -Path $report -Value (($e -split "`n" | Select-String -Pattern 'app\.|fetch' | Select-Object -First 60 | Out-String)) -Encoding ASCII; Stop-Restore 'Could not find where the API routes are registered in src\server\entry.ts.' }
    $l = $all[$all.Count - 1]; $e = $e.Insert($l.Index + $l.Length, $nl + $rteLine)
  }
  [IO.File]::WriteAllText($entry, $e, $utf8)
  Log 'Registered the /api/deals/fetch-image route.'
}

# ---- repair garbled characters everywhere in src -------------------------
$fx = cmd /c "node tools\fix-encoding.mjs src 2>&1"
Log ($fx | Out-String).Trim()

# ---- rupee formatting on the deal page -----------------------------------
$deal = Join-Path $root 'src\pages\deals\[id].tsx'
if (Test-Path -LiteralPath $deal) {
  $d = [IO.File]::ReadAllText($deal, $utf8)
  $rx = [regex]"return new Intl\.NumberFormat\('en-IN',\s*\{[^}]*\}\)\.format\(amount\);"
  if ($rx.IsMatch($d)) {
    $d = $rx.Replace($d, 'return ''\u20b9'' + amount.toLocaleString(''en-IN'', { maximumFractionDigits: 2, minimumFractionDigits: 0 });')
    [IO.File]::WriteAllText($deal, $d, $utf8)
    Log 'Deal page prices now always show the rupee sign.'
  }
}

# ---- verify ---------------------------------------------------------------
Log ''
Log 'Running type-check (about 30 seconds)...'
$tc = cmd /c "npm.cmd run type-check 2>&1"
$newErr = @($tc | Where-Object { $_ -match 'error TS' } | ForEach-Object { $_.ToString().Trim() } | Where-Object { $baseErr -notcontains $_ })
if ($newErr.Count -gt 0) {
  Add-Content -Path $report -Value ($tc | Out-String) -Encoding ASCII
  $newErr | Select-Object -First 25 | ForEach-Object { Log ("  " + $_) }
  Stop-Restore 'TYPE-CHECK FOUND NEW ERRORS.'
}
if ($baseErr.Count -eq 0 -and $LASTEXITCODE -ne 0) {
  Add-Content -Path $report -Value ($tc | Out-String) -Encoding ASCII
  Stop-Restore 'TYPE-CHECK FAILED.'
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
} else {
  Log 'Build skipped because your project already had type errors before this pack.'
}
Log ''
Log 'DONE. Nothing was committed or pushed.'
if ($baseErr.Count -gt 0) {
  Log 'IMPORTANT: src\App.tsx (or another file listed above) was already broken before this pack. Send this report to Claude.'
}
Log 'Restart the dev server (Ctrl+C, then npm.cmd run dev), hard-refresh the browser (Ctrl+Shift+R), then test:'
Log '  1. Submit Deal: paste a link, click Get details - text appears in a few seconds, pictures follow one by one.'
Log '  2. Title ends with the offer price, original price and % off; Original price is filled in.'
Log '  3. /login looks like a modern site and the Create an account link is visible without scrolling.'
Log '  4. A deal page: rupee signs and the Deal Lifecycle text are clean.'
Log "To undo everything: copy $bk\src back over src."
