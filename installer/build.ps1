<#
  בונה את המתקין: השירות, קובץ התוסף, ואז Inno Setup.

    pwsh installer/build.ps1              # הכול
    pwsh installer/build.ps1 -SkipHelper  # רק אריזה מחדש, עם השירות שכבר נבנה

  הקובץ שמור ב-UTF-8 עם BOM: בלעדיו PowerShell 5.1 קורא אותו כ-ANSI והעברית נשברת.

  דרישות: Dart SDK, Node.js, Python, Inno Setup 6 (ISCC.exe), ועותק של
  Otzaria/otzaria-plugin-validator (נמשך אוטומטית ל-build/validator).
#>
param(
  [switch]$SkipHelper
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installer = $PSScriptRoot
$staging = Join-Path $installer 'staging'
$buildDir = Join-Path $root 'build'
$manifest = Get-Content (Join-Path $root 'plugin/manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

function Step($text) { Write-Host "== $text" -ForegroundColor Cyan }

# גרסת השירות חייבת להתאים לגרסת התוסף: השירות מדווח אותה ב-/health.
$serviceVersion = Select-String -Path (Join-Path $root 'helper/lib/src/server/helper_service.dart') `
  -Pattern "serverVersion = '([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value }
if ($serviceVersion -ne $version) {
  throw "גרסת השירות ($serviceVersion) שונה מגרסת התוסף ($version)."
}

if (-not $SkipHelper) {
  Step 'בניית השירות'
  Push-Location (Join-Path $root 'helper')
  try {
    dart pub get | Out-Null
    dart build cli
    if ($LASTEXITCODE -ne 0) { throw 'dart build cli נכשל' }
  } finally { Pop-Location }
}

Step 'הכנת staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
Copy-Item -Recurse (Join-Path $root 'helper/build/cli/windows_x64/bundle/*') $staging
py -X utf8 (Join-Path $root 'tools/set_gui_subsystem.py') (Join-Path $staging 'bin/responsa_helper.exe')
if ($LASTEXITCODE -ne 0) { throw 'סימון השירות כתוכנת GUI נכשל' }

Step 'אריזת התוסף ובדיקתו בוולידטור הרשמי'
$validator = Join-Path $buildDir 'validator'
if (-not (Test-Path (Join-Path $validator 'src/cli.js'))) {
  git clone --depth 1 https://github.com/Otzaria/otzaria-plugin-validator $validator
}
$env:INPUT_BUILD = 'true'
$output = node (Join-Path $validator 'src/cli.js') (Join-Path $root 'plugin') `
  --fail-on-warnings --app-version $manifest.minAppVersion --publish false 2>&1
$env:INPUT_BUILD = $null
$output | Where-Object { $_ -notmatch '^OUTPUT ' } | Write-Host
if ($LASTEXITCODE -ne 0) { throw 'הוולידטור נכשל' }
$pluginFile = ($output | Select-String '^OUTPUT plugin-file=(.+)$').Matches[0].Groups[1].Value
Move-Item -Force $pluginFile (Join-Path $staging 'OtzariaResponsa.otzplugin')

Step 'Inno Setup'
$iscc = @(
  (Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 6/ISCC.exe'),
  'C:/Program Files (x86)/Inno Setup 6/ISCC.exe',
  'C:/Program Files/Inno Setup 6/ISCC.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'ISCC.exe לא נמצא. יש להתקין Inno Setup 6.' }
& $iscc "/DAppVersion=$version" (Join-Path $installer 'OtzariaResponsa.iss')
if ($LASTEXITCODE -ne 0) { throw 'ISCC נכשל' }

$setup = Join-Path $installer "output/OtzariaResponsa-Setup-$version.exe"
Step "מוכן: $setup"
