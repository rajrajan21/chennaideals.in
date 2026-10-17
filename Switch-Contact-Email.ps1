# Switch-Contact-Email.ps1 - run ONLY after admin@chennaideals.in can receive mail.
# Replaces Chennaideals.in@gmail.com with admin@chennaideals.in everywhere under src.
$ErrorActionPreference = 'Continue'
$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Write-Host 'Run this from the project folder.'; exit 1 }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$n = 0
Get-ChildItem -LiteralPath (Join-Path $root 'src') -Recurse -File -Include *.ts,*.tsx | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName, $utf8)
  $new = [regex]::Replace($t, 'Chennaideals\.in@gmail\.com', 'admin@chennaideals.in', 'IgnoreCase')
  if ($new -ne $t) { [IO.File]::WriteAllText($_.FullName, $new, $utf8); $n++; Write-Host ("Updated " + $_.FullName) }
}
Write-Host "Files changed: $n"
Write-Host 'Restart npm run dev. Also set ADMIN_ALERT_EMAIL=admin@chennaideals.in in .env.local if you use it.'
