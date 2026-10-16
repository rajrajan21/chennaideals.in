# Apply-Auth-Fix.ps1
# Fixes the "existing email shows generic verification notice" problem.
#   - server: emails the owner of an existing account when someone signs up with their address
#   - sign-up page: honest wording, Sign in button, resend with a 60 second pause
#   - sign-in page: unverified accounts are now recognised (old check never matched "not verified")
#   - removes garbled characters in AuthPage.tsx / auth.ts
# Safety: checks the files are exactly what Claude inspected, backs them up, runs
# type-check + build, and RESTORES the backups automatically if either fails.
# It does NOT commit, push, or touch the database.

$ErrorActionPreference = 'Stop'
$root    = (Get-Location).Path
$payload = Join-Path $PSScriptRoot 'payload'
$report  = Join-Path $root 'auth-fix-report.txt'

function Log([string]$m) { Write-Host $m; Add-Content -Path $report -Value $m -Encoding ASCII }
function Fail([string]$m) { Log ''; Log "STOPPED: $m"; Log 'Nothing was changed.'; exit 1 }

Set-Content -Path $report -Value ("Auth fix run " + (Get-Date -Format 's')) -Encoding ASCII

# ---- 0. sanity -------------------------------------------------------------
if (-not (Test-Path (Join-Path $root 'package.json'))) { Fail 'Run this from the project folder (package.json not found).' }
if (-not (Test-Path (Join-Path $payload 'auth.ts')) -or -not (Test-Path (Join-Path $payload 'AuthPage.tsx'))) { Fail 'The payload folder next to this script is missing. Keep the payload folder beside the .ps1 file.' }

$authPath = Join-Path $root 'src\lib\auth\auth.ts'
$pagePath = Join-Path $root 'src\pages\auth\AuthPage.tsx'
foreach ($p in @($authPath, $pagePath)) { if (-not (Test-Path $p)) { Fail "Missing $p" } }

Log "Project : $root"
Log ("Branch  : " + ((cmd /c "git rev-parse --abbrev-ref HEAD 2>&1") -join ' '))

# ---- 1. the files must be exactly the ones Claude read ----------------------
$expectAuth = '622a8f22380547d08d9b2aaaca6a1fa844ef50c5e50d6a968a9a7a4148e76764'
$expectPage = '5f210b8aee2028b90e348e5bafde4144a5e2d7ab39d93a7dfcaa73a43fc3bf94'
$haveAuth = (Get-FileHash -Algorithm SHA256 -Path $authPath).Hash.ToLower()
$havePage = (Get-FileHash -Algorithm SHA256 -Path $pagePath).Hash.ToLower()
$alreadyAuth = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $payload 'auth.ts')).Hash.ToLower()
$alreadyPage = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $payload 'AuthPage.tsx')).Hash.ToLower()
if ($haveAuth -eq $alreadyAuth -and $havePage -eq $alreadyPage) { Log 'Already applied - nothing to do.'; exit 0 }
if ($haveAuth -ne $expectAuth) { Fail "src\lib\auth\auth.ts has changed since the snapshot Claude read. Run collect-local-state.bat again and send the new zip." }
if ($havePage -ne $expectPage) { Fail "src\pages\auth\AuthPage.tsx has changed since the snapshot Claude read. Run collect-local-state.bat again and send the new zip." }
Log 'Files match the snapshot Claude inspected: OK'

# ---- 2. does the installed Better Auth support the server hook? --------------
$ba = Join-Path $root 'node_modules\better-auth'
if (-not (Test-Path $ba)) { Fail 'node_modules\better-auth not found. Run npm.cmd install first.' }
$ver = (Get-Content (Join-Path $ba 'package.json') -Raw | ConvertFrom-Json).version
$hit = Get-ChildItem -Path (Join-Path $ba 'dist') -Recurse -Include *.mjs,*.js,*.cjs -ErrorAction SilentlyContinue |
       Select-String -Pattern 'onExistingUserSignUp' -List | Select-Object -First 1
Log "Better Auth installed version: $ver"
if (-not $hit) { Fail "This Better Auth version ($ver) does not contain onExistingUserSignUp, so the fix would not work. Send Claude this report." }
Log 'onExistingUserSignUp supported: OK'

# ---- 3. backup ---------------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $root ".update-backups\auth-fix-$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
Copy-Item $authPath (Join-Path $bk 'auth.ts') -Force
Copy-Item $pagePath (Join-Path $bk 'AuthPage.tsx') -Force
$exclude = Join-Path $root '.git\info\exclude'
if (Test-Path $exclude) {
  if (-not (Get-Content $exclude -Raw).Contains('.update-backups')) { Add-Content -Path $exclude -Value '.update-backups' }
}
Log "Backup  : $bk"

function Restore-All {
  Copy-Item (Join-Path $bk 'auth.ts') $authPath -Force
  Copy-Item (Join-Path $bk 'AuthPage.tsx') $pagePath -Force
  Log 'Your original files were restored.'
}

# ---- 4. apply ----------------------------------------------------------------
Copy-Item (Join-Path $payload 'auth.ts') $authPath -Force
Copy-Item (Join-Path $payload 'AuthPage.tsx') $pagePath -Force
Log 'Patched : src\lib\auth\auth.ts, src\pages\auth\AuthPage.tsx'

# ---- 5. verify ---------------------------------------------------------------
Log ''
Log 'Running type-check (about 30 seconds)...'
$tc = cmd /c "npm.cmd run type-check 2>&1"
$tcCode = $LASTEXITCODE
if ($tcCode -ne 0) {
  Add-Content -Path $report -Value ($tc | Out-String) -Encoding ASCII
  Log ($tc | Select-Object -Last 25 | Out-String)
  Log 'TYPE-CHECK FAILED.'
  Restore-All
  Log "Full details saved in $report - send that file to Claude."
  exit 1
}
Log 'Type-check: PASSED'

Log 'Running build (about 1 minute)...'
$bd = cmd /c "npm.cmd run build 2>&1"
$bdCode = $LASTEXITCODE
if ($bdCode -ne 0) {
  Add-Content -Path $report -Value ($bd | Out-String) -Encoding ASCII
  Log ($bd | Select-Object -Last 25 | Out-String)
  Log 'BUILD FAILED.'
  Restore-All
  Log "Full details saved in $report - send that file to Claude."
  exit 1
}
Log 'Build: PASSED'

Log ''
Log 'DONE. Nothing was committed or pushed.'
Log 'Next: stop the dev server (Ctrl+C), start it again with npm.cmd run dev, then test:'
Log '  1. Sign up with an email that ALREADY has an account -> amber notice with a Sign in button.'
Log '  2. Watch the dev-server terminal: a line starting "Resend email request failed" means the'
Log '     email provider refused the message. Copy that line (it contains no secret) and send it to Claude.'
Log '  3. Sign in with an unverified account -> "Verify your email to sign in" notice.'
Log "To undo everything: copy the two files from $bk back into src."
