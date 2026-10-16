# Commit-Auth-Fix.ps1 - commits ONLY the sign-up / email-verification fix to your LOCAL repo.
# It does not push anything. Use Sync-To-GitHub.bat when you want to upload.

$ErrorActionPreference = 'Continue'   # git writes progress to stderr; we check exit codes ourselves
. (Join-Path $PSScriptRoot 'Common-Git-Safety.ps1')
$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) { Write-Host 'This is not a git project folder.'; exit 1 }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "Branch: $branch"
Assert-GitIdentity

$files = @('src/lib/auth/auth.ts', 'src/pages/auth/AuthPage.tsx', 'src/lib/email/resend.ts')
foreach ($f in $files) { if (-not (Test-Path -LiteralPath (Join-Path $root $f))) { Write-Host "Missing $f"; exit 1 } }

git reset -q            # un-stage anything else (your files are NOT touched)
git add -- $files

$blocked = Get-StagedBlockedFiles
if ($blocked.Count -gt 0) { git reset -q; Write-Host ('Refusing to commit: ' + ($blocked -join ', ')); exit 1 }
$hits = Get-StagedSecretHits
if ($hits.Count -gt 0) { git reset -q; Write-Host ('Refusing to commit - possible secret in: ' + ($hits -join ', ')); exit 1 }

$staged = @(git diff --cached --name-only)
if ($staged.Count -eq 0) { Write-Host 'Nothing to commit - these files are already committed.'; exit 0 }
Write-Host 'Will commit:'
git diff --cached --stat

$subject = 'Add email verification, existing-account notice and clearer sign-up messages'
$body = @"
- Send a verification email on sign-up and sign-in (Resend), required before login.
- When someone signs up with an email that already has an account, email that address
  a sign-in notice (Better Auth hides this from the page on purpose).
- Sign-up screen: honest wording, Sign in button, resend with 60 second pause.
- Sign-in screen: recognise unverified accounts (old check never matched "not verified").
- Log mail-provider failures to the server console instead of crashing or leaking details.
- Remove garbled characters from AuthPage.tsx and auth.ts.
"@
$trailers = "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_01VrdnmEyAnnSrba25mLEVGy"

$msg = $subject + "`n`n" + $body + "`n" + $trailers + "`n"
$msgFile = Join-Path $env:TEMP ('commit-msg-' + [guid]::NewGuid().ToString('N') + '.txt')
[IO.File]::WriteAllText($msgFile, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $msgFile
$commitCode = $LASTEXITCODE
Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue
if ($commitCode -ne 0) { Write-Host 'Commit failed.'; exit 1 }
Write-Host ''
Write-Host 'Committed locally (not pushed):'
git log -1 --oneline
