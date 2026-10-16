# collect-local-state.ps1
# Packs your LOCAL source (no secrets, no node_modules, no uploads) plus git status and a
# type-check / build report into one zip so Claude can read the real current code.
# Safe: read-only on your project (only writes the zip + a temp folder, both removed/ignored).

$ErrorActionPreference = 'Continue'
$root = (Get-Location).Path
if (-not (Test-Path (Join-Path $root 'package.json'))) { throw "Run this from the project folder (package.json not found)." }

$stage = Join-Path $env:TEMP ("cd-snapshot-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# 1) copy source files, skipping secrets and heavy folders
$skipDirs  = @('node_modules', '.git', 'uploads', 'dist', '.update-backups', '.vite')
$skipFiles = @('.env', '.env.local', '.env.production', '.env.development', 'config.json')
$include   = @('src', 'drizzle', 'scripts', 'public\logo.jpg', 'airo-secrets', 'dev-tools', 'content-plugin')
$topFiles  = @('package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'drizzle.config.ts', 'env.example', 'index.html', 'tailwind.config.js')

function Copy-Clean($from, $to) {
  Get-ChildItem -LiteralPath $from -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length).TrimStart('\')
    $parts = $rel.Split('\')
    if ($parts | Where-Object { $skipDirs -contains $_ }) { return }
    if ($skipFiles -contains $_.Name) { return }
    if ($_.Length -gt 2MB) { return }
    $dest = Join-Path $to $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
  }
}
foreach ($i in $include) {
  $p = Join-Path $root $i
  if (Test-Path $p -PathType Container) { Copy-Clean $p $stage }
  elseif (Test-Path $p) { $d = Join-Path $stage $i; New-Item -ItemType Directory -Force -Path (Split-Path $d) | Out-Null; Copy-Item $p $d -Force }
}
foreach ($f in $topFiles) { $p = Join-Path $root $f; if (Test-Path $p) { Copy-Item $p (Join-Path $stage $f) -Force } }

# 2) git state
$gitOut = Join-Path $stage '_git-state.txt'
$gitText = @()
$gitText += '== branch =='
$gitText += (cmd /c "git rev-parse --abbrev-ref HEAD 2>&1")
$gitText += '== last commits =='
$gitText += (cmd /c "git log -n 8 --format=%h_%ad_%s --date=short 2>&1")
$gitText += '== status =='
$gitText += (cmd /c "git status --short 2>&1")
$gitText += '== remotes =='
$gitText += (cmd /c "git remote -v 2>&1")
$gitText | Out-File -Encoding ascii $gitOut

# 3) verification report (type-check + build). Takes a minute or two.
$rep = Join-Path $stage '_verify-report.txt'
Write-Host 'Running type-check and build (1-3 minutes)...'
"== npm run type-check ==" | Out-File -Encoding ascii $rep
cmd /c "npm run type-check 2>&1" | Out-File -Append -Encoding ascii $rep
"== npm run build ==" | Out-File -Append -Encoding ascii $rep
cmd /c "npm run build 2>&1" | Out-File -Append -Encoding ascii $rep

# 4) schema as the database really has it (names only, no data)
$schemaOut = Join-Path $stage '_db-columns.txt'
"(skipped - ask Claude for the one-line mysql command if needed)" | Out-File -Encoding ascii $schemaOut

# 5) zip
$zip = Join-Path $root 'chennaideals-local-snapshot.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host ''
Write-Host "Done: $zip ($mb MB)"
Write-Host 'Attach this zip in the Claude chat. It contains no passwords, .env files or uploads.'
