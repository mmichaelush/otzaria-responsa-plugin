// מצלם כל מסך של התוסף בתצוגה המקדימה, בהיר וכהה, עם Edge או Chrome.
//   node tools/preview/screenshots.mjs [out-dir]   (SHOTS=a,b לחלק מהמסכים)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || join(here, 'out', 'shots'));
mkdirSync(outDir, { recursive: true });
execFileSync(process.execPath, [join(here, 'build-preview.mjs')], { stdio: 'inherit' });
const page = pathToFileURL(join(here, 'out', 'preview.html')).href;

// חלון ראש-שקט אינו צר מ-500px, ולכן גודל טלפון מצולם דרך iframe ברוחב המדויק.
const framePath = join(here, 'out', 'frame.html');
writeFileSync(
  framePath,
  '<!DOCTYPE html><html><body style="margin:0"><iframe id="f" style="border:0;display:block"></iframe>' +
    '<script>const [w, h, src] = decodeURIComponent(location.hash.slice(1)).split("|");' +
    'const f = document.getElementById("f"); f.style.width = w + "px"; f.style.height = h + "px"; f.src = src;</script>' +
    '</body></html>',
);
const frame = pathToFileURL(framePath).href;

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
  ['settings-panel', 'scenario=ready&page=settings', '1000,1100'],
  ['help-guide', 'scenario=ready&page=help'],
  ['help-troubleshoot', 'scenario=ready&page=help&tab=troubleshoot'],
  ['help-status', 'scenario=ready&page=help&tab=status'],
  ['about', 'scenario=ready&page=about', '1000,1200'],
  ['english-results', 'scenario=ready&lang=en&query=' + encodeURIComponent('מהרש"א')],
  ['english-settings', 'scenario=ready&lang=en&page=settings'],
  ['not-installed', 'scenario=notInstalled'],
  ['port-taken', 'scenario=portTaken'],
  ['permission-denied', 'scenario=permissionDenied'],
  ['service-error', 'scenario=serviceError'],
  ['service-error-old', 'scenario=serviceError&service=0.4.0'],
  ['building-waiting', 'scenario=building&waiting=1&notice=1'],
  ['service-behind', 'scenario=ready&service=0.4.0&noicons=1'],
  ['welcome', 'scenario=ready&welcome=1'],
  ['welcome-first-run', 'scenario=serviceMissing&welcome=1'],
  ['book-details', 'scenario=ready&details=3232&query=' + encodeURIComponent('מהרש"א')],
  ['about-offline', 'scenario=ready&page=about&offline=1'],
  ['service-missing-offline', 'scenario=serviceMissing&offline=1'],
  ['browse-inner', 'scenario=ready&browse=' + encodeURIComponent('מפרשים ופוסקים על הבבלי והירושלמי/אחרונים על הבבלי')],
  ['browse-books', 'scenario=ready&browse=' + encodeURIComponent('מפרשים ופוסקים על הבבלי והירושלמי/אחרונים על הבבלי/מהרש"א')],
  ['browse-search', 'scenario=ready&browse=' + encodeURIComponent('מפרשים ופוסקים על הבבלי והירושלמי') + '&query=' + encodeURIComponent('מהרש"א')],
  ['old-service', 'scenario=ready&oldservice=1&noicons=1'],
  ['text-simple', 'scenario=ready&page=text&adv=simple&run=1', '1000,900'],
  ['advanced', 'scenario=ready&page=text&adv=words', '1000,1500'],
  ['advanced-scope', 'scenario=ready&page=text&adv=scope', '1000,1600'],
  ['advanced-manual', 'scenario=ready&page=text&adv=manual&run=1', '1000,1000'],
  ['text-free', 'scenario=ready&page=text&adv=free&run=1', '1000,900'],
  ['text-free-old-service', 'scenario=ready&page=text&adv=free&nofree=1', '1000,720'],
  ['advanced-guide', 'scenario=ready&page=text&adv=words&guide=1'],
  ['english-advanced', 'scenario=ready&lang=en&page=text&adv=words', '1000,1500'],
  ['narrow-advanced', 'scenario=ready&page=text&adv=words', '380,1300'],
  ['narrow-text-free', 'scenario=ready&page=text&adv=free&run=1', '380,1000'],
  ['locate', 'scenario=ready&page=locate&history=1', '1000,820'],
  ['locate-choices', 'scenario=ready&page=locate&loc=' + encodeURIComponent('בראשית ב ג') + '&run=1', '1000,900'],
  ['narrow-locate', 'scenario=ready&page=locate&loc=' + encodeURIComponent('בראשית ב ג') + '&run=1', '380,900'],
  ['fluent-icons', 'scenario=ready&noicons=1&query=' + encodeURIComponent('מהרש"א')],
  // גדלי מסך: חלון צר (טלפון, או אוצריא בחצי מסך) וחלון רחב.
  ['narrow-browse', 'scenario=ready&browse=' + encodeURIComponent('מפרשים ופוסקים על הבבלי והירושלמי/אחרונים על הבבלי'), '380,820'],
  ['narrow-results', 'scenario=ready&details=3232&query=' + encodeURIComponent('מהרש"א'), '380,820'],
  ['narrow-welcome', 'scenario=ready&welcome=1', '380,820'],
  ['narrow-settings', 'scenario=ready&page=settings', '380,820'],
  ['narrow-help', 'scenario=ready&page=help&tab=status', '380,820'],
  ['narrow-about', 'scenario=ready&page=about', '380,820'],
  ['wide-results', 'scenario=ready&query=' + encodeURIComponent('מהרש"א'), '1600,900'],
  // "גודל תצוגה" 150%: באותו חלון הפריסה עוברת לצרה כשהתוכן כבר לא נכנס.
  ['scaled-results', 'scenario=ready&scale=1.5&query=' + encodeURIComponent('מהרש"א'), '1000,720'],
  ['scaled-narrow', 'scenario=ready&scale=1.3&page=locate&history=1', '700,720'],
];

// SHOTS=about,ready-empty מצלם רק את המסכים האלה.
const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
for (const [name, query, size] of shots) {
  if (only && !only.includes(name)) continue;
  for (const mode of ['light', 'dark']) {
    const file = join(outDir, `${name}-${mode}.png`);
    const [width, height] = (size || '1000,720').split(',').map(Number);
    const url =
      width < 500
        ? `${frame}#${encodeURIComponent(`${width}|${height}|${page}?${query}&mode=${mode}`)}`
        : `${page}?${query}&mode=${mode}`;
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=' + Math.max(width, 500) + ',' + height,
      '--allow-file-access-from-files',
      '--virtual-time-budget=4000',
      `--screenshot=${file}`,
      url,
    ], { stdio: 'ignore' });
    // הצילום ברוחב החלון; בגודל טלפון חותכים לרוחב ה-iframe.
    if (width < 500) {
      execFileSync(process.platform === 'win32' ? 'py' : 'python3', [
        ...(process.platform === 'win32' ? ['-3'] : []),
        '-c',
        'import sys; from PIL import Image; im = Image.open(sys.argv[1]); ' +
          'im.crop((0, 0, int(sys.argv[2]), im.height)).save(sys.argv[1])',
        file,
        String(width),
      ]);
    }
    console.log(file);
  }
}
