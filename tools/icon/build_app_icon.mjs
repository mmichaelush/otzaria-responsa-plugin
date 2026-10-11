// בונה את אייקון התוסף (plugin/icon/icon.png, 256×256) ואת אייקון המתקין
// (installer/icon.ico) מתוך tools/icon/icon.html. הציור ב-SVG, ודפדפן אמיתי
// מצייר אותו: כך הגרדיאנטים, ה-clip של העדשה והצל מצוירים נכון, בלי ספריית
// SVG נוספת.
//   node tools/icon/build_app_icon.mjs
// דורש Edge או Chrome, ו-Python 3 עם Pillow (לקובץ ה-ICO).
//
// icon.html מציג את כל הגדלים בדף אחד, כל אחד בגודלו האמיתי ובמקום קבוע
// (SLOTS). הגדלים הקטנים הם ציורים נפרדים ופשוטים יותר, ולכן לא מקטינים
// את ה-256: כל גודל נחתך מצילום הדף כמו שהדפדפן צייר אותו.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const png = join(root, 'plugin', 'icon', 'icon.png');
const ico = join(root, 'installer', 'icon.ico');

// [גודל, x, y] — חייב להתאים למיקומים ב-icon.html.
const SLOTS = [
  [256, 0, 0],
  [128, 256, 0],
  [64, 384, 0],
  [48, 448, 0],
  [32, 384, 64],
  [24, 416, 64],
  [16, 448, 64],
];
const PAGE = [512, 256];

const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => existsSync(path));
if (!browser) throw new Error('לא נמצא Edge או Chrome');

const work = mkdtempSync(join(tmpdir(), 'responsa-icon-'));
const sheet = join(work, 'sheet.png');
try {
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    '--user-data-dir=' + join(work, 'profile'),
    '--window-size=' + PAGE.join(','),
    '--screenshot=' + sheet,
    pathToFileURL(join(here, 'icon.html')).href,
  ], { stdio: 'ignore' });
  if (!existsSync(sheet)) throw new Error('הדפדפן לא יצר את ' + sheet);

  // ה-ICO מקבל את כל הגדלים ש-Windows בוחר מהם (סייר הקבצים, שורת
  // המשימות, "הוספה/הסרה"), כל אחד מהציור שלו.
  const python = process.platform === 'win32' ? 'py' : 'python3';
  const args = process.platform === 'win32' ? ['-3'] : [];
  execFileSync(python, [
    ...args,
    '-c',
    'import sys, json; from PIL import Image\n' +
      'sheet = Image.open(sys.argv[1]).convert("RGBA")\n' +
      'frames = [sheet.crop((x, y, x + s, y + s)) for s, x, y in json.loads(sys.argv[4])]\n' +
      'frames[0].save(sys.argv[2])\n' +
      'frames[0].save(sys.argv[3], sizes=[f.size for f in frames], append_images=frames[1:])\n',
    sheet,
    png,
    ico,
    JSON.stringify(SLOTS),
  ]);
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log('✔ ' + png + '\n✔ ' + ico);
