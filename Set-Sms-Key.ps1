# Set-Sms-Key.ps1 - switches mobile sign-in from TEST MODE to real SMS through Fast2SMS.
# Needs a Fast2SMS account with KYC done and a wallet recharge (SMS costs money; it is not free).
# The key is typed hidden and saved only in .env.local (never uploaded, never shown to Claude).
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) { Write-Host 'Run this from the project folder.'; exit 1 }
Write-Host 'Fast2SMS: sign up at https://www.fast2sms.com , complete KYC, recharge the wallet (minimum Rs 100),'
Write-Host 'then open Dev API and copy your API key.'
Write-Host ''
$sec = Read-Host 'Paste the Fast2SMS API key (typing is hidden), then press Enter' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
if (-not $key -or $key.Trim().Length -lt 20 -or $key -match '\s') { Write-Host 'That does not look like a key. Nothing was saved.'; exit 1 }
$file = Join-Path $root '.env.local'
$lines = @()
if (Test-Path -LiteralPath $file) { $lines = @(Get-Content -LiteralPath $file | Where-Object { $_ -notmatch '^\s*(SMS_PROVIDER|FAST2SMS_API_KEY)\s*=' }) }
$lines += 'SMS_PROVIDER=fast2sms'
$lines += ('FAST2SMS_API_KEY=' + $key.Trim())
[IO.File]::WriteAllLines($file, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Saved to .env.local. Restart the dev server (Ctrl+C, then npm.cmd run dev).'
Write-Host 'To go back to free test mode, delete the SMS_PROVIDER line from .env.local.'
