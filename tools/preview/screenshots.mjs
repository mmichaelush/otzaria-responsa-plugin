// מצלם כל מסך של התוסף בתצוגה המקדימה, בהיר וכהה, עם Edge או Chrome.
//   node tools/preview/screenshots.mjs [out-dir]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || join(here, 'out', 'shots'));
mkdirSync(outDir, { recursive: true });
execFileSync(process.execPath, [join(here, 'build-preview.mjs')], { stdio: 'inherit' });
const page = pathToFileURL(join(here, 'out', 'preview.html')).href;

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = browsers.find((path) => existsSync(path));
if (!browser) throw new Error('לא נמצא Edge או Chrome');

const shots = [
  ['service-missing', 'scenario=serviceMissing'],
  ['needs-catalog', 'scenario=needsCatalog'],
  ['building', 'scenario=building'],
  ['build-failed', 'scenario=buildFailed'],
  ['ready-empty', 'scenario=ready'],
  ['ready-results', 'scenario=ready&query=' + encodeURIComponent('מהרש"א')],
  ['ready-none', 'scenario=ready&query=' + encodeURIComponent('זזזז')],
  ['other-installation', 'scenario=otherInstallation&query=' + encodeURIComponent('אבני נזר')],
  ['rebuilding', 'scenario=rebuilding&query=' + encodeURIComponent('אבני נזר')],
  ['info-panel', 'scenario=ready&info=1'],
  ['not-installed', 'scenario=notInstalled'],
  ['port-taken', 'scenario=portTaken'],
];

for (const [name, query] of shots) {
  for (const mode of ['light', 'dark']) {
    const file = join(outDir, `${name}-${mode}.png`);
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1000,720',
      '--virtual-time-budget=4000',
      `--screenshot=${file}`,
      `${page}?${query}&mode=${mode}`,
    ], { stdio: 'ignore' });
    console.log(file);
  }
}
