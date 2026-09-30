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
# ב-CI, תג v0.2.0 על מניפסט 0.1.0 היה מפרסם גרסה בשם אחד וקובץ של אחרת.
if ($env:GITHUB_REF_TYPE -eq 'tag' -and $env:GITHUB_REF_NAME -ne "v$version") {
  throw "התג $env:GITHUB_REF_NAME אינו תואם לגרסה $version שבמניפסט."
}

if (-not $SkipHelper) {
  Step 'בניית השירות'
  Push-Location (Join-Path $root 'helper')
  try {
    dart pub get | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'dart pub get נכשל' }
    dart build cli
    if ($LASTEXITCODE -ne 0) { throw 'dart build cli נכשל' }
  } finally { Pop-Location }
}

Step 'הכנת staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
Copy-Item -Recurse (Join-Path $root 'helper/build/cli/windows_x64/bundle/*') $staging
$python = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }
& $python -X utf8 (Join-Path $root 'tools/set_gui_subsystem.py') (Join-Path $staging 'bin/responsa_helper.exe')
if ($LASTEXITCODE -ne 0) { throw 'סימון השירות כתוכנת GUI נכשל' }

Step 'אריזת התוסף ובדיקתו בוולידטור הרשמי'
$validator = Join-Path $buildDir 'validator'
if (-not (Test-Path (Join-Path $validator 'src/cli.js'))) {
  # אותה גרסה שה-CI מריץ (`@v1`).
  git clone --depth 1 --branch v1 https://github.com/Otzaria/otzaria-plugin-validator $validator
  if ($LASTEXITCODE -ne 0) { throw 'הורדת הוולידטור נכשלה' }
}
$env:INPUT_BUILD = 'true'
# ב-PowerShell 5.1, עם Stop, כל שורה ש-node כותב ל-stderr (גם אזהרה) הופכת
# לחריגה. קוד היציאה הוא מה שמכריע.
$ErrorActionPreference = 'Continue'
$output = node (Join-Path $validator 'src/cli.js') (Join-Path $root 'plugin') `
  --fail-on-warnings --app-version $manifest.minAppVersion --publish false 2>&1 |
  ForEach-Object { "$_" }
$validatorExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$env:INPUT_BUILD = $null
$output | Where-Object { $_ -notmatch '^OUTPUT ' } | Write-Host
if ($validatorExit -ne 0) { throw 'הוולידטור נכשל' }
# לפי השם ולא לפי הפלט: ב-GitHub Actions הוולידטור כותב את הנתיב ל-
# $GITHUB_OUTPUT ולא ל-stdout.
$pluginFile = Join-Path $root "$($manifest.id)-$version.otzplugin"
if (-not (Test-Path $pluginFile)) { throw "קובץ התוסף לא נבנה: $pluginFile" }
Move-Item -Force $pluginFile (Join-Path $staging 'OtzariaResponsa.otzplugin')

Step 'Inno Setup'
$iscc = @(
  (Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 6/ISCC.exe'),
  'C:/Program Files (x86)/Inno Setup 6/ISCC.exe',
  'C:/Program Files/Inno Setup 6/ISCC.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'ISCC.exe לא נמצא. יש להתקין Inno Setup 6.' }
# המתקין בודק את גרסת התוסף שבאוצריא מול AppVersion, בתיקייה שנקראת לפי ה-id.
& $iscc "/DAppVersion=$version" "/DPluginId=$($manifest.id)" (Join-Path $installer 'OtzariaResponsa.iss')
if ($LASTEXITCODE -ne 0) { throw 'ISCC נכשל' }

$setup = Join-Path $installer "output/OtzariaResponsa-Setup-$version.exe"
Step "מוכן: $setup"
