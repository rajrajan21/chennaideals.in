# Sync-To-GitHub.ps1 - saves ALL your current code as one commit and uploads it to GitHub.
# Use any time:  Sync-To-GitHub.bat            (default message)
#                Sync-To-GitHub.bat "my message"
# Safety: never uses force; never commits .env / passwords / uploads / backups / zips;
#         stops (without changing anything on GitHub) if GitHub has newer commits.
param(
  [string]$Message = '',
  [switch]$NoPush,
  [switch]$NoTrailer
)

$ErrorActionPreference = 'Continue'   # git writes progress to stderr; we check exit codes ourselves
. (Join-Path $PSScriptRoot 'Common-Git-Safety.ps1')
$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) { Write-Host 'This is not a git project folder.'; exit 1 }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -eq 'HEAD') { Write-Host 'You are not on a branch (detached HEAD). Stopping.'; exit 1 }
Write-Host "Project: $root"
Write-Host "Branch : $branch"
Assert-GitIdentity

# 1. make sure private / junk files are ignored by git
$ignoreFile = Join-Path $root '.gitignore'
$wanted = @(
  '# --- added by Sync-To-GitHub: never upload these ---',
  '.env', '.env.*', '!.env.example', 'config.json',
  'node_modules/', 'dist/', 'uploads/', '.update-backups/',
  'database-backups/', 'migration-diagnostic-backup-*/', 'backup-*/', 'backups/',
  '*.backup-*', '*.bak-*', '*.zip', '*.log',
  '*-report.txt', 'drizzle-check-report.txt',
  'Thumbs.db', '.DS_Store'
)
$existing = @()
if (Test-Path -LiteralPath $ignoreFile) { $existing = Get-Content -LiteralPath $ignoreFile }
$missing = @($wanted | Where-Object { $_ -notlike '#*' -and ($existing -notcontains $_) })
if ($missing.Count -gt 0) {
  $add = @('', '# --- added by Sync-To-GitHub: never upload these ---') + $missing
  Add-Content -LiteralPath $ignoreFile -Value $add -Encoding ASCII
  Write-Host ("Updated .gitignore (" + $missing.Count + " protective rules added)")
}

# 2. stage everything that is allowed
git add -A

$blocked = Get-StagedBlockedFiles
if ($blocked.Count -gt 0) {
  git reset -q
  Write-Host 'STOPPED - these must not be uploaded:'; $blocked | ForEach-Object { Write-Host "  $_" }
  Write-Host 'Nothing was committed or uploaded. Tell Claude if you want them handled.'
  exit 1
}
$hits = Get-StagedSecretHits
if ($hits.Count -gt 0) {
  git reset -q
  Write-Host 'STOPPED - something that looks like a password/key was found in:'; $hits | ForEach-Object { Write-Host "  $_" }
  Write-Host 'Nothing was committed or uploaded. Remove it (or tell Claude if it is a false alarm).'
  exit 1
}

# 3. commit (if there is anything new)
$staged = @(git diff --cached --name-only)
if ($staged.Count -gt 0) {
  Write-Host ''
  Write-Host ("Files to save: " + $staged.Count)
  git diff --cached --stat | Select-Object -Last 25
  if (-not $Message) { $Message = 'Sync local changes ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') }
  $msg = $Message + "`n"
  if (-not $NoTrailer) {
    $msg += "`nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_01VrdnmEyAnnSrba25mLEVGy`n"
  }
  # Written to a file because Windows PowerShell mangles quotes inside command-line arguments.
  $msgFile = Join-Path $env:TEMP ('commit-msg-' + [guid]::NewGuid().ToString('N') + '.txt')
  [IO.File]::WriteAllText($msgFile, $msg, (New-Object System.Text.UTF8Encoding($false)))
  git commit -F $msgFile
  $commitCode = $LASTEXITCODE
  Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue
  if ($commitCode -ne 0) { Write-Host 'Commit failed.'; exit 1 }
} else {
  Write-Host 'No new changes to save.'
}

if ($NoPush) { Write-Host 'Committed locally. (-NoPush: not uploaded.)'; exit 0 }

# 4. upload - never forced
git fetch origin 2>$null | Out-Null
$remoteRef = "origin/$branch"
git rev-parse --verify --quiet $remoteRef 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  $behind = [int](git rev-list --count "HEAD..$remoteRef")
  if ($behind -gt 0) {
    Write-Host ''
    Write-Host "STOPPED: GitHub has $behind newer commit(s) on '$branch' that you do not have locally."
    Write-Host 'Nothing was uploaded and nothing on GitHub was changed. Your work is committed locally and safe.'
    Write-Host 'Send this message to Claude and it will merge them safely.'
    exit 1
  }
}
git push -u origin $branch
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'Upload failed (your work is saved in the local commit). If it asked you to sign in, sign in to GitHub and run this again.'
  exit 1
}
Write-Host ''
Write-Host 'SYNCED to GitHub:'
git log -1 --oneline
Write-Host "https://github.com/rajrajan21/chennaideals.in/tree/$branch"
