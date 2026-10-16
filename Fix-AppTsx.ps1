# Fix-AppTsx.ps1 - puts src\App.tsx back to the last committed version (the edited one is broken),
# keeps a copy of your edited file, then type-checks and builds. Restores your copy if it still fails.
$ErrorActionPreference = 'Continue'
$root = (Get-Location).Path
$app  = Join-Path $root 'src\App.tsx'
if (-not (Test-Path -LiteralPath $app)) { Write-Host 'Run this from the project folder.'; exit 1 }
$bkDir = Join-Path $root '.update-backups'
New-Item -ItemType Directory -Force -Path $bkDir | Out-Null
$keep = Join-Path $bkDir ('App.tsx.edited-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Copy-Item -LiteralPath $app -Destination $keep -Force
Write-Host "Your edited copy is saved at $keep"
cmd /c "git checkout -- src/App.tsx 2>&1"
Write-Host 'Checking (type-check, about 30 seconds)...'
$tc = cmd /c "npm.cmd run type-check 2>&1"
if ($LASTEXITCODE -ne 0) {
  $tc | Select-Object -Last 15 | ForEach-Object { Write-Host $_ }
  Copy-Item -LiteralPath $keep -Destination $app -Force
  Write-Host 'Still failing, so your edited App.tsx was put back. Send the lines above to Claude.'
  exit 1
}
Write-Host 'Type-check: PASSED. Building (about 1 minute)...'
$bd = cmd /c "npm.cmd run build 2>&1"
if ($LASTEXITCODE -ne 0) {
  $bd | Select-Object -Last 20 | ForEach-Object { Write-Host $_ }
  Copy-Item -LiteralPath $keep -Destination $app -Force
  Write-Host 'Build failed, so your edited App.tsx was put back. Send the lines above to Claude.'
  exit 1
}
Write-Host 'Build: PASSED. src\App.tsx is fixed. Restart npm.cmd run dev.'
