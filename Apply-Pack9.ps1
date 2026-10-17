# Apply-Pack9.ps1
# Deal Hunter (admin only).

$ErrorActionPreference = 'Continue'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-pack9-report.txt'
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Pack 9 run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'src'))) { Fail 'The payload folder next to this script is missing.' }
foreach ($need in @('src\server\entry.ts', 'src\routes.tsx', 'src\layouts\parts\Header.tsx', 'src\server\lib\deal-review.ts', 'src\server\lib\gemini-lite.ts', 'src\server\lib\page-images.ts')) {
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
$bk = Join-Path $root ".update-backups\pack9-$stamp"
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
  'src\server\lib\hunter\hunter-sources.ts'
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

# 1. server routes
$p = Join-Path $root 'src\server\entry.ts'
$t = Read-Text $p
if (-not $t.Contains('admin__hunter__start__post')) {
  $imports = 'import admin__hunter__options__get from "./api/admin/hunter/options/GET";' + (Nl $t) +
             'import admin__hunter__start__post from "./api/admin/hunter/start/POST";' + (Nl $t) +
             'import admin__hunter__job__get from "./api/admin/hunter/[jobId]/GET";' + (Nl $t) +
             'import admin__hunter__publish__post from "./api/admin/hunter/[jobId]/publish/POST";'
  $t = Insert-After $t '(?m)^[ \t]*import deals__post from [^\r\n]*' $imports
  if ($null -eq $t) { Stop-Restore 'Could not find the deals route import in src\server\entry.ts.' }
  $routes = 'app.get("/api/admin/hunter/options", admin__hunter__options__get);' + (Nl $t) +
            'app.post("/api/admin/hunter/start", admin__hunter__start__post);' + (Nl $t) +
            'app.get("/api/admin/hunter/:jobId", admin__hunter__job__get);' + (Nl $t) +
            'app.post("/api/admin/hunter/:jobId/publish", admin__hunter__publish__post);'
  $t = Insert-After $t '(?m)^[ \t]*app\.post\(\s*["'']/api/deals["'']\s*,\s*deals__post\s*\);[^\r\n]*' $routes
  if ($null -eq $t) { Stop-Restore 'Could not find the deals route registration in src\server\entry.ts.' }
  Write-Text $p $t
  Log 'Registered the Deal Hunter server routes'
} else { Log 'Server routes already registered.' }

# 2. page route
$p = Join-Path $root 'src\routes.tsx'
$t = Read-Text $p
if (-not $t.Contains('DealHunterPage')) {
  $t = Insert-After $t '(?m)^[ \t]*const DealAlertsPage = lazy\([^\r\n]*' "const DealHunterPage = lazy(() => import('./pages/admin/DealHunter'));"
  if ($null -eq $t) { Stop-Restore 'Could not find DealAlertsPage in src\routes.tsx.' }
  $t = Insert-After $t "(?m)^[ \t]*\{ path: '/alerts', element: <DealAlertsPage /> \},[^\r\n]*" "  { path: '/admin/hunter', element: <DealHunterPage /> },"
  if ($null -eq $t) { Stop-Restore 'Could not find the /alerts route in src\routes.tsx.' }
  if ($t.Contains("| '/alerts'")) { $t = $t.Replace("| '/alerts'", "| '/alerts' | '/admin/hunter'") }
  Write-Text $p $t
  Log 'Added the /admin/hunter page'
} else { Log 'Page route already present.' }

# 3. admin-only link in the header
$p = Join-Path $root 'src\layouts\parts\Header.tsx'
$t = Read-Text $p
if (-not $t.Contains('/admin/hunter')) {
  $link = '              {(user as { isAdmin?: boolean }).isAdmin && <Link to="/admin/hunter" className="text-sm font-bold text-white hover:underline">Deal Hunter</Link>}'
  $t = Insert-After $t '(?m)^[ \t]*<Link to="/alerts" className="text-sm font-semibold text-white hover:underline">Deal alerts</Link>[^\r\n]*' $link
  if ($null -eq $t) { Log 'WARNING: could not add the Deal Hunter link to the header - open /admin/hunter directly.' } else { Write-Text $p $t; Log 'Header: admin-only Deal Hunter link added' }
}

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
Log 'STOP and restart npm run dev (new server routes), then sign in as admin and open http://localhost:5173/admin/hunter (also shown as Deal Hunter in the header).'
Log "To undo: copy $bk\src back over src."
