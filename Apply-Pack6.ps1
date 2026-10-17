# Apply-Pack6.ps1
# Automatic review of every submitted deal + safety notices.
#  - checks the link/website (exists? https? look-alike of Amazon/Flipkart? brand-new domain? dead link?),
#    the wording (adult, betting, "earn money", payment-scam phrases), the prices, and the pictures
#  - REJECTED deals are never posted and the admin (Chennaideals.in@gmail.com) is emailed
#  - risky-but-possible deals are posted with an automatic caution in the Editor's Note
#  - site-wide "be careful before you buy" notice + disclaimer, contact email in the footer
# Safety: backs up src, package.json and the lock file; runs type-check + build; restores if anything fails.
# Does NOT commit or push. Does NOT change the database (no new columns are needed).

$ErrorActionPreference = 'Continue'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-pack6-report.txt'
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Pack 6 run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'src'))) { Fail 'The payload folder next to this script is missing.' }
foreach ($need in @('src\server\lib\page-images.ts', 'src\server\lib\uploads.ts', 'src\lib\email\resend.ts', 'src\server\entry.ts', 'src\layouts\RootLayout.tsx', 'src\layouts\parts\Footer.tsx', 'src\pages\deals\submit.tsx', 'src\server\api\deals\POST.ts', 'src\server\api\deals\GET.ts', 'src\server\api\deals\[id]\GET.ts')) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $need))) { Fail "Missing $need - Update Packs 3 and 4 must be applied first." }
}
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
$bk = Join-Path $root ".update-backups\pack6-$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
robocopy (Join-Path $root 'src') (Join-Path $bk 'src') /E /NFL /NDL /NJH /NJS /NP | Out-Null
foreach ($f in @('package.json', 'package-lock.json')) { if (Test-Path -LiteralPath (Join-Path $root $f)) { Copy-Item -LiteralPath (Join-Path $root $f) -Destination $bk -Force } }
Log "Backup  : $bk"

function Restore-All {
  robocopy (Join-Path $bk 'src') (Join-Path $root 'src') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  foreach ($f in @('package.json', 'package-lock.json')) { if (Test-Path -LiteralPath (Join-Path $bk $f)) { Copy-Item -LiteralPath (Join-Path $bk $f) -Destination (Join-Path $root $f) -Force } }
  Log 'Your original src folder, package.json and package-lock.json were restored.'
}
function Stop-Restore([string]$m) { Log ''; Log "STOPPED: $m"; Restore-All; Log "Details are in $report - send that file to Claude."; exit 1 }

# ---- picture checks need the "sharp" image package ------------------------------
$pkg = [IO.File]::ReadAllText((Join-Path $root 'package.json'), $utf8)
if (-not $pkg.Contains('"sharp"')) {
  Log 'Installing the "sharp" image package (needed for picture checks)...'
  $inst = cmd /c "npm.cmd install sharp 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Log ($inst | Select-Object -Last 15 | Out-String)
    Log 'WARNING: sharp could not be installed. The review still works, but pictures get only basic checks (size, shape).'
    Copy-Item -LiteralPath (Join-Path $bk 'package.json') -Destination (Join-Path $root 'package.json') -Force
    if (Test-Path -LiteralPath (Join-Path $bk 'package-lock.json')) { Copy-Item -LiteralPath (Join-Path $bk 'package-lock.json') -Destination (Join-Path $root 'package-lock.json') -Force }
  } else { Log 'sharp installed.' }
}

# ---- copy the pack's files ---------------------------------------------------------
$manifest = @(
  'src\components\SafetyNotice.tsx',
  'src\lib\finalize.ts',
  'src\pages\deals\submit.tsx',
  'src\server\api\deals\POST.ts',
  'src\server\api\deals\[id]\finalize\POST.ts',
  'src\server\lib\admin-alert.ts',
  'src\server\lib\deal-review-core.ts',
  'src\server\lib\deal-review.ts',
  'src\server\lib\gemini-lite.ts',
  'src\server\lib\image-analysis-core.ts',
  'src\server\lib\image-review.ts',
  'src\server\lib\review-mail.ts'
)
foreach ($rel in $manifest) {
  if (-not (Test-Path -LiteralPath (Join-Path $payload $rel))) { Stop-Restore "The pack is incomplete: $rel is missing. Unzip it again into a NEW empty folder." }
}
$mine = @('src\pages\deals\submit.tsx', 'src\server\api\deals\POST.ts')
foreach ($rel in $mine) {
  $cur = Join-Path $root $rel
  $new = Join-Path $payload $rel
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $cur).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $new).Hash) {
    $known = @{ 'src\pages\deals\submit.tsx' = 'D5087C8B78BD99811DDA37F53F71F1B157E9F594710DB09793C7CF3ED253B4EE'; 'src\server\api\deals\POST.ts' = '2EF909E3D53B5372B2F706602DC876BAD8685E7AB14533BA1D2CA17839588944' }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $cur).Hash -ne $known[$rel]) { Log "WARNING: $rel was different from the version Claude inspected. It is being replaced; your version is in the backup folder." }
  }
}
foreach ($rel in $manifest) {
  $dest = Join-Path $root $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath (Join-Path $payload $rel) -Destination $dest -Force
}
Log ("Copied  : " + $manifest.Count + " files")

# ---- small edits to existing files ------------------------------------------------
function Read-Text([string]$p) { [IO.File]::ReadAllText($p, $utf8) }
function Write-Text([string]$p, [string]$t) { [IO.File]::WriteAllText($p, $t, $utf8) }
function Nl([string]$text) { if ($text.Contains("`r`n")) { "`r`n" } else { "`n" } }
function Insert-After([string]$text, [string]$pattern, [string]$line) {
  $ms = [regex]::Matches($text, $pattern)
  if ($ms.Count -ne 1) { return $null }
  return $text.Insert($ms[0].Index + $ms[0].Length, (Nl $text) + $line)
}
function Insert-Before([string]$text, [string]$pattern, [string]$block) {
  $ms = [regex]::Matches($text, $pattern)
  if ($ms.Count -ne 1) { return $null }
  return $text.Insert($ms[0].Index, $block + (Nl $text))
}

# 1. a deal that is still being checked ('pending') must never be listed or opened by strangers
$p = Join-Path $root 'src\server\api\deals\GET.ts'
$t = Read-Text $p
if (-not $t.Contains("status === 'pending'")) {
  $t = Insert-After $t '(?m)^[ \t]*const conditions = \[\];[^\r\n]*' "    if (status === 'pending' || status === 'rejected') return res.json({ deals: [], tabCounts: { new: 0, popular: 0, frontpage: 0 }, page: pageNum, limit: limitNum });"
  if ($null -eq $t) { Stop-Restore 'Could not find "const conditions = [];" in src\server\api\deals\GET.ts.' }
  Write-Text $p $t
  Log 'Updated deals list (pending deals are hidden)'
}
$p = Join-Path $root 'src\server\api\deals\[id]\GET.ts'
$t = Read-Text $p
if (-not $t.Contains("deal.status === 'pending'")) {
  $guard = @"
    if (deal.status === 'pending') {
      const pendingSession = await getAuth().api.getSession({ headers: req.headers as unknown as Headers });
      const pendingUser = pendingSession?.user as { id: string; isAdmin?: boolean } | undefined;
      if (!pendingUser || (pendingUser.id !== deal.submittedBy && !pendingUser.isAdmin)) return res.status(404).json({ error: 'Deal not found' });
    }
"@
  $guard = $guard.TrimEnd("`r", "`n")
  $t = Insert-After $t "(?m)^[ \t]*if \(!deal\) return res\.status\(404\)\.json\(\{ error: 'Deal not found' \}\);[^\r\n]*" $guard
  if ($null -eq $t) { Stop-Restore 'Could not find the "Deal not found" line in src\server\api\deals\[id]\GET.ts.' }
  Write-Text $p $t
  Log 'Updated deal page (pending deals are private)'
}

# 2. register the finalize route
$p = Join-Path $root 'src\server\entry.ts'
$t = Read-Text $p
if (-not $t.Contains('deals__id__finalize__post')) {
  $t = Insert-After $t '(?m)^[ \t]*import deals__id__media__post from [^\r\n]*' 'import deals__id__finalize__post from "./api/deals/[id]/finalize/POST";'
  if ($null -eq $t) { Stop-Restore 'Could not find the media route import in src\server\entry.ts.' }
  $t = Insert-After $t '(?m)^[ \t]*app\.post\(\s*["'']/api/deals/:id/media["'']\s*,\s*deals__id__media__post\s*\);[^\r\n]*' 'app.post("/api/deals/:id/finalize", deals__id__finalize__post);'
  if ($null -eq $t) { Stop-Restore 'Could not find the media route registration in src\server\entry.ts.' }
  Write-Text $p $t
  Log 'Registered /api/deals/:id/finalize'
}

# 3. site-wide safety notice
$p = Join-Path $root 'src\layouts\RootLayout.tsx'
$t = Read-Text $p
if (-not $t.Contains('SafetyNotice')) {
  $t = Insert-After $t "(?m)^[ \t]*import Header from '@/layouts/parts/Header';[^\r\n]*" "import SafetyNotice from '@/components/SafetyNotice';"
  if ($null -eq $t) { Stop-Restore 'Could not find the Header import in RootLayout.tsx.' }
  $t = Insert-After $t '(?m)^[ \t]*<Header />[^\r\n]*' '      <SafetyNotice />'
  if ($null -eq $t) { Stop-Restore 'Could not find <Header /> in RootLayout.tsx.' }
  Write-Text $p $t
  Log 'Added the safety notice under the header'
}

# 4. footer disclaimer
$p = Join-Path $root 'src\layouts\parts\Footer.tsx'
$t = Read-Text $p
if (-not $t.Contains('not responsible')) {
  $block = @"
      <div className="border-t" style={{ borderColor: 'hsl(var(--footer-surface))' }}>
        <p className="max-w-7xl mx-auto px-4 py-4 text-xs leading-relaxed" style={{ color: 'hsl(var(--footer-subtle))' }}>
          Disclaimer: deals are posted by community members. ChennaiDeals.in does not sell, ship or guarantee any product and is not responsible for any order, payment, delivery, refund or loss. Some websites advertise heavy discounts but never deliver, so please verify the seller and the price yourself before you buy. Every deal is checked automatically, but no check is perfect. Report a suspicious deal or contact the admin at Chennaideals.in@gmail.com.
        </p>
      </div>
"@
  $block = $block.TrimEnd("`r", "`n")
  $t = Insert-Before $t '(?m)^[ \t]*</footer>' $block
  if ($null -eq $t) { Stop-Restore 'Could not find </footer> in Footer.tsx.' }
  Write-Text $p $t
  Log 'Added the disclaimer to the footer'
}

# 5. contact email everywhere
$changed = 0
Get-ChildItem -LiteralPath (Join-Path $root 'src') -Recurse -File -Include *.ts,*.tsx,*.md,*.json,*.html | ForEach-Object {
  $c = [IO.File]::ReadAllText($_.FullName, $utf8)
  if ($c -match '(?i)deals@chennaideals\.in') {
    [IO.File]::WriteAllText($_.FullName, ([regex]::Replace($c, '(?i)deals@chennaideals\.in', 'Chennaideals.in@gmail.com')), $utf8)
    $changed++
  }
}
Log "Contact email updated in $changed file(s) (now Chennaideals.in@gmail.com)"

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
Log 'Restart the dev server (Ctrl+C, then npm.cmd run dev), hard-refresh (Ctrl+Shift+R), then test as a NORMAL (non-admin) user:'
Log '  1. A normal deal with an Amazon/Flipkart link -> posts as usual.'
Log '  2. A title like "Hot escort service" or a link like https://amazon-offers-today.xyz/x -> rejected, nothing is posted.'
Log '  3. A deal on an unknown shop -> posted with a caution in the Editor''s Note.'
Log '  4. The yellow "Be careful before you buy" bar shows under the header; the footer has the disclaimer and the new email.'
Log 'Admin accounts skip the review (editors are trusted). Rejected deals email Chennaideals.in@gmail.com.'
Log 'NOTE: Resend only delivers to addresses it is allowed to (see README-PACK6.txt about the sender domain).'
Log "To undo: copy $bk\src back over src (and package.json / package-lock.json)."
