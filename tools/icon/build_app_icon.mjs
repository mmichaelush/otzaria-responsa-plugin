// בונה את אייקון התוסף (plugin/icon/icon.png, 256×256) ואת אייקון המתקין
// (installer/icon.ico) מתוך tools/icon/icon.html. הציור ב-SVG, ודפדפן אמיתי
// מצייר אותו: כך ה-mask של העדשה מצויר נכון, בלי ספריית SVG נוספת.
//   node tools/icon/build_app_icon.mjs
// דורש Edge או Chrome, ו-Python 3 עם Pillow (לקובץ ה-ICO).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const png = join(root, 'plugin', 'icon', 'icon.png');
const ico = join(root, 'installer', 'icon.ico');

const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => existsSync(path));
if (!browser) throw new Error('לא נמצא Edge או Chrome');

const profile = mkdtempSync(join(tmpdir(), 'responsa-icon-'));
try {
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    '--user-data-dir=' + profile,
    '--window-size=256,256',
    '--screenshot=' + png,
    pathToFileURL(join(here, 'icon.html')).href,
  ], { stdio: 'ignore' });
} finally {
  rmSync(profile, { recursive: true, force: true });
}
if (!existsSync(png)) throw new Error('הדפדפן לא יצר את ' + png);

// כל הגדלים ש-Windows בוחר מהם (סייר הקבצים, שורת המשימות, "הוספה/הסרה").
const python = process.platform === 'win32' ? 'py' : 'python3';
const args = process.platform === 'win32' ? ['-3'] : [];
execFileSync(python, [
  ...args,
  '-c',
  'import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGBA"); ' +
    'im.save(sys.argv[2], sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])',
  png,
  ico,
]);
console.log('✔ ' + png + '\n✔ ' + ico);
