# Set-Gemini-Key.ps1 - stores your optional FREE Gemini API key in .env.local (the file is never uploaded).
# Typing is hidden and the key is never printed or sent to Claude.
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Write-Host 'Run this from the project folder.'; exit 1 }
Write-Host 'Get a FREE key: open https://aistudio.google.com/apikey , sign in with Google, press "Create API key".'
Write-Host 'Choose a project WITHOUT billing so it can never be charged. Only public product-page text is sent.'
Write-Host ''
$sec = Read-Host 'Paste the key here (typing is hidden), then press Enter' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
if (-not $key -or $key.Trim().Length -lt 20 -or $key -match '\s') { Write-Host 'That does not look like a key. Nothing was saved.'; exit 1 }
$file = Join-Path $root '.env.local'
$lines = @()
if (Test-Path -LiteralPath $file) { $lines = @(Get-Content -LiteralPath $file | Where-Object { $_ -notmatch '^\s*GEMINI_API_KEY\s*=' }) }
$lines += ('GEMINI_API_KEY=' + $key.Trim())
[IO.File]::WriteAllLines($file, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Saved to .env.local. Restarting the dev server is needed (Ctrl+C, npm.cmd run dev).'
Write-Host ''
Write-Host 'Testing the key...'
node check-ai.mjs
