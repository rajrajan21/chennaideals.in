# Apply-Pack11.ps1
# Editor note with coupon / bank offers on every deal, New tab when Front Page and Popular are empty, real Deal of the Day.

$ErrorActionPreference = 'Continue'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'apply-pack11-report.txt'
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }
Set-Content -Path $report -Value ("Pack 11 run " + (Get-Date -Format 's')) -Encoding ASCII

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'src'))) { Fail 'The payload folder next to this script is missing.' }
foreach ($need in @('src\server\entry.ts', 'src\pages\index.tsx', 'src\server\api\deals\POST.ts', 'src\server\lib\hunter\hunter-providers.ts', 'src\server\lib\page-images.ts')) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $need))) { Fail "Missing $need - Update Pack 10 (Deal Hunter) must be applied first." }
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
$bk = Join-Path $root ".update-backups\pack11-$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
robocopy (Join-Path $root 'src') (Join-Path $bk 'src') /E /NFL /NDL /NJH /NJS /NP | Out-Null
Log "Backup  : $bk"
function Restore-All {
  robocopy (Join-Path $bk 'src') (Join-Path $root 'src') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  Log 'Your original src folder was restored.'
}
function Stop-Restore([string]$m) { Log ''; Log "STOPPED: $m"; Restore-All; Log "Details are in $report - send that file to Claude."; exit 1 }

$manifest = @(
  'src\server\api\admin\hunter\[jobId]\publish\POST.ts',
  'src\server\api\deals\deal-of-the-day\GET.ts',
  'src\server\lib\deal-offers-core.ts',
  'src\server\lib\deal-offers.ts'
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

function Insert-Before([string]$text, [string]$pattern, [string]$block) {
  $ms = [regex]::Matches($text, $pattern)
  if ($ms.Count -ne 1) { return $null }
  return $text.Insert($ms[0].Index, $block + (Nl $text))
}

# 1. server: deal-of-the-day route (must come before /api/deals/:id)
$p = Join-Path $root 'src\server\entry.ts'
$t = Read-Text $p
if (-not $t.Contains('deals__dealoftheday__get')) {
  $t = Insert-After $t '(?m)^[ \t]*import deals__post from [^\r\n]*' 'import deals__dealoftheday__get from "./api/deals/deal-of-the-day/GET";'
  if ($null -eq $t) { Stop-Restore 'Could not find the deals route import in src\server\entry.ts.' }
  $t = Insert-Before $t '(?m)^[ \t]*app\.get\(\s*["'']/api/deals/:id["'']' 'app.get("/api/deals/deal-of-the-day", deals__dealoftheday__get);'
  if ($null -eq $t) { Stop-Restore 'Could not find the /api/deals/:id route in src\server\entry.ts.' }
  Write-Text $p $t
  Log 'Registered /api/deals/deal-of-the-day'
} else { Log 'Deal-of-the-day route already registered.' }

# 2. every submitted deal gets the "Ways to save more" note (runs in the background)
$p = Join-Path $root 'src\server\api\deals\POST.ts'
$t = Read-Text $p
if (-not $t.Contains('queueOfferNote')) {
  $t = Insert-After $t '(?m)^[ \t]*import \{ db \} from [^\r\n]*' "import { queueOfferNote } from '../../lib/deal-offers.js';"
  if ($null -eq $t) { Stop-Restore 'Could not find the db import in src\server\api\deals\POST.ts.' }
  $t = Insert-After $t '(?m)^[ \t]*const insertId = Number\(result\[0\]\.insertId\);[^\r\n]*' '    queueOfferNote(insertId);'
  if ($null -eq $t) { Stop-Restore 'Could not find "const insertId" in src\server\api\deals\POST.ts.' }
  Write-Text $p $t
  Log 'Submitted deals now get the Ways to save more note'
} else { Log 'Deal submit already adds the note.' }

# 3. home page: real Deal of the Day + New tab when Front Page and Popular are empty
$p = Join-Path $root 'src\pages\index.tsx'
$t = Read-Text $p
if (-not $t.Contains('deal-of-the-day')) {
  $orig = $t
  $t = [regex]::Replace($t, 'home\.dealOfTheDay\.(badge|retailer|title|salePrice|originalPrice|savings|ctaLabel)\b', 'dod.$1')
  $t = [regex]::Replace($t, '<a(\s+)href="#"(\s+className="inline-flex items-center gap-2 px-6 py-3)', '<a$1href={dod.href}$2')
  $t = $t.Replace('onClick={() => setActiveTab(tab.id)}', 'onClick={() => { userPickedTab.current = true; setActiveTab(tab.id); }}')
  $t = [regex]::Replace($t, '(setLiveDeals\(data\.deals \|\| \[\]\);)', ('$1' + (Nl $t) + '      setLoadedTab(tab);'), 1)
  $typeBlock = @'
type FeaturedDeal = { id: number; title: string; retailer: string | null; salePrice: string | null; originalPrice: string | null; savingsPercent: number | null };
const rupeeText = (v: string | null) => (v ? '\u20b9' + Number(v).toLocaleString('en-IN') : '');

'@
  $stateBlock = @'
  const [loadedTab, setLoadedTab] = useState<FeedTab | null>(null);
  const [featured, setFeatured] = useState<FeaturedDeal | null>(null);
  const userPickedTab = useRef(false);
  const dod = featured
    ? { ...home.dealOfTheDay, title: featured.title, retailer: featured.retailer ?? home.dealOfTheDay.retailer, salePrice: rupeeText(featured.salePrice), originalPrice: rupeeText(featured.originalPrice), savings: featured.savingsPercent ? `${featured.savingsPercent}% OFF` : '', ctaLabel: 'View Deal', href: `/deals/${featured.id}` }
    : { ...home.dealOfTheDay, href: '#' };
  useEffect(() => {
    fetch('/api/deals/deal-of-the-day').then((r) => (r.ok ? r.json() : null)).then((d) => setFeatured(d?.deal ?? null)).catch(() => { /* keep the default banner */ });
  }, []);
'@
  $effectBlock = @'
  useEffect(() => {
    // nothing on Front Page, then nothing on Popular -> show New, with or without filters
    if (userPickedTab.current || searchQuery || feedLoading || activeTab === 'new' || loadedTab !== activeTab) return;
    if (liveDeals.length === 0) setActiveTab(activeTab === 'frontpage' ? 'popular' : 'new');
  }, [feedLoading, liveDeals, activeTab, loadedTab, searchQuery]);
'@
  $t = Insert-Before $t '(?m)^export default function HomePage\(\) \{' $typeBlock.TrimEnd()
  if ($null -ne $t) { $t = Insert-After $t '(?m)^[ \t]*const \[feedLoading, setFeedLoading\] = useState\(true\);[^\r\n]*' $stateBlock.TrimEnd() }
  if ($null -ne $t) { $t = Insert-After $t '(?m)^[ \t]*useEffect\(\(\) => \{ fetchDeals\(activeTab, activeCategory, activeRetailer\); \}[^\r\n]*' $effectBlock.TrimEnd() }
  if ($null -eq $t -or -not $t.Contains('setLoadedTab(tab)') -or -not $t.Contains('href={dod.href}')) {
    Log 'WARNING: the home page has a different layout than expected - Deal of the Day / New-tab changes were NOT applied. Send apply-pack11-report.txt to Claude.'
  } else { Write-Text $p $t; Log 'Home page: real Deal of the Day, and New tab shown when Front Page / Popular are empty' }
} else { Log 'Home page already updated.' }

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
Log 'STOP and restart npm run dev, then hard-refresh (Ctrl+Shift+R). New deals now get a Ways to save more note a minute or two after posting.'
Log "To undo: copy $bk\src back over src."
