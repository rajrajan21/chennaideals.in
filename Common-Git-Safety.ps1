# Shared safety checks used by Commit-Auth-Fix.ps1 and Sync-To-GitHub.ps1 (dot-sourced).
# Never prints the value of a suspected secret - only the file name.

function Get-StagedSecretHits {
  $patterns = @(
    're_[A-Za-z0-9_]{20,}',
    'GOCSPX-[A-Za-z0-9_-]{10,}',
    'AKIA[0-9A-Z]{16}',
    '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    'EAA[A-Za-z0-9]{40,}',
    '(?i)(client_secret|api_key|apikey|secret_key|auth_secret|password)\s*[:=]\s*["''][A-Za-z0-9/+_\-]{16,}["'']'
  )
  $hits = @()
  $current = ''
  foreach ($line in (git diff --cached -U0 --no-color 2>$null)) {
    if ($line -match '^\+\+\+ b/(.*)$') { $current = $Matches[1]; continue }
    if ($line.StartsWith('+') -and -not $line.StartsWith('+++')) {
      foreach ($p in $patterns) { if ($line -match $p) { $hits += $current; break } }
    }
  }
  return @($hits | Select-Object -Unique)
}

function Get-StagedBlockedFiles {
  $bad = @()
  foreach ($f in (git diff --cached --name-only 2>$null)) {
    $n = $f.Replace('\', '/')
    if ($n -match '(^|/)\.env(\.|$)' -and $n -notmatch '\.example$') { $bad += $f; continue }
    if ($n -match '(^|/)config\.json$') { $bad += $f; continue }
    if ($n -match '(^|/)(uploads|\.update-backups|database-backups|node_modules|dist)/') { $bad += $f; continue }
    if ($n -match '\.(zip|sql|sqlite|db)$' -and $n -notmatch '^drizzle/') { $bad += $f; continue }
    $full = Join-Path (Get-Location).Path $f
    if ((Test-Path -LiteralPath $full) -and ((Get-Item -LiteralPath $full).Length -gt 5MB)) { $bad += $f }
  }
  return @($bad | Select-Object -Unique)
}

function Assert-GitIdentity {
  $e = (git config user.email 2>$null)
  $n = (git config user.name 2>$null)
  if (-not $e -or -not $n) {
    Write-Host ''
    Write-Host 'Git does not know who you are yet. Run these two lines once (with your own details), then run this again:'
    Write-Host '  git config user.email "you@example.com"'
    Write-Host '  git config user.name "Your Name"'
    exit 1
  }
}
