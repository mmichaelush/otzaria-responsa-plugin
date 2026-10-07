// טוען כל מסך ולוח של התצוגה המקדימה בדפדפן אמיתי, ונכשל על כל שגיאה
// בקונסול. בדיקות Node אינן בונות DOM, ולכן חריגה בציור נתפסת רק כאן.
//   node tools/preview/smoke.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath, [join(here, 'build-preview.mjs')], { stdio: 'ignore' });
const page = pathToFileURL(join(here, 'out', 'preview.html')).href;

const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => existsSync(path));
if (!browser) throw new Error('לא נמצא Edge או Chrome');

const scenarios = [
  'scenario=ready&page=text',
  'scenario=ready&page=text&adv=simple&run=1',
  'scenario=ready&page=text&adv=words',
  'scenario=ready&page=text&adv=scope',
  'scenario=ready&page=text&adv=manual&run=1',
  'scenario=ready&page=text&adv=free&run=1',
  'scenario=ready&page=text&adv=free&nofree=1',
  'scenario=ready&page=text&oldservice=1',
  'scenario=needsCatalog&page=text&adv=scope',
  'scenario=serviceMissing&page=text',
  'scenario=ready&page=locate&history=1',
  'scenario=ready&page=locate&example=1',
  'scenario=ready&page=locate&loc=' + encodeURIComponent('בראשית ב ג') + '&run=1',
  'scenario=ready&page=locate&loc=' + encodeURIComponent('ברכות דף ב') + '&run=1',
  'scenario=ready&page=locate&oldservice=1',
  'scenario=ready&reader=' + encodeURIComponent('בראשית|בראשית, פרק ב'),
  'scenario=ready&reader=' + encodeURIComponent('רש"י על בראשית|פרק ב'),
  'scenario=serviceMissing&reader=' + encodeURIComponent('ברכות|דף ב.'),
  'scenario=ready&otzsearch=' + encodeURIComponent('נר שבת'),
  'scenario=ready&page=settings&oldservice=1',
  'scenario=building&page=locate',
  'scenario=serviceMissing',
  'scenario=needsCatalog',
  'scenario=building',
  'scenario=buildFailed',
  'scenario=notInstalled',
  'scenario=portTaken',
  'scenario=permissionDenied',
  'scenario=serviceError',
  'scenario=serviceError&service=0.4.0',
  'scenario=serviceError&service=0.4.0&page=text',
  'scenario=building&waiting=1&notice=1',
  'scenario=rebuilding&waiting=1&notice=1&query=' + encodeURIComponent('אבני נזר'),
  'scenario=ready&service=0.4.0',
  'scenario=unsupported',
  'scenario=ready&query=' + encodeURIComponent('מהרש"א'),
  'scenario=rebuilding&query=' + encodeURIComponent('אבני נזר'),
  'scenario=ready&page=settings',
  'scenario=serviceMissing&page=settings',
  ...['guide', 'troubleshoot', 'status'].map((tab) => 'scenario=ready&page=help&tab=' + tab),
  'scenario=serviceMissing&page=help&tab=troubleshoot',
  'scenario=ready&page=about',
  'scenario=serviceMissing&page=about',
  'scenario=ready&welcome=1',
  'scenario=serviceMissing&welcome=1&offline=1',
  'scenario=ready&details=3232&query=' + encodeURIComponent('מהרש"א'),
  'scenario=ready&page=about&offline=1',
  'scenario=ready&page=settings&scale=1.5&font=Shofar',
  'scenario=ready&scale=0.9&query=' + encodeURIComponent('מהרש"א'),
];

let failures = 0;
for (const base of scenarios) {
  for (const extra of ['', '&lang=en', '&mode=dark']) {
    const url = `${page}?${base}${extra}`;
    const run = spawnSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--enable-logging=stderr',
        '--v=0',
        '--virtual-time-budget=4000',
        '--dump-dom',
        url,
      ],
      { encoding: 'utf8' },
    );
    // רק גוף ההודעה: כתובת המקור מכילה את שם התרחיש (למשל serviceError).
    const errors = (run.stderr || '')
      .split('\n')
      .map((line) => (line.match(/CONSOLE[^"]*"(.*)", source:/) || [])[1])
      // runtime.lastError — מתוספי הדפדפן, לא מהדף.
      .filter((message) => message && /Uncaught|failed|Error/.test(message) && !/runtime\.lastError/.test(message))
      // היומן של התוסף (`[responsa] …`) רושם כשלים צפויים בכוונה — שירות שלא
      // עונה הוא תרחיש, לא באג. רק מטפל אירוע שנפל הוא תקלה בקוד.
      .filter((message) => !message.startsWith('[responsa] ') || /^\[responsa\] event .* failed/.test(message));
    if (errors.length) {
      failures++;
      console.error('✖ ' + base + extra + '\n  ' + errors.join('\n  '));
    } else {
      console.log('✔ ' + base + extra);
    }
  }
}
if (failures) {
  console.error(failures + ' מסכים נכשלו');
  process.exit(1);
}
