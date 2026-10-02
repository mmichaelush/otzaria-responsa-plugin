// בונה tools/preview/out/preview.html מתוך plugin/index.html האמיתי, עם הגשר
// המדומה שב-stub.js. כך התצוגה המקדימה היא תמיד הדף שנשלח, ולא עותק שלו.
//
//   node tools/preview/build-preview.mjs
//   node tools/preview/screenshots.mjs          # צילום כל המסכים
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const plugin = join(here, '..', '..', 'plugin');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const toPlugin = relative(out, plugin).replaceAll('\\', '/');
const fixtures = readFileSync(join(here, 'fixtures.json'), 'utf8');
const stub = readFileSync(join(here, 'stub.js'), 'utf8');

// אייקוני אוצריא והסמל של בר אילן מהמחשב, כמו שהשירות מגיש אותם. לא
// נכנסים לתוסף ולא למאגר: רק לתצוגה המקדימה, ורק כשהם קיימים במחשב.
//   OTZARIA_ICON_FONT=<otf>  RESPONSA_ICON=<ico> (או out/responsa-icon.ico)
const fontPath = [
  process.env.OTZARIA_ICON_FONT,
  join(here, '..', '..', '..', 'otzaria_icons', 'lib', 'fonts', 'otzaria_icons.otf'),
  'C:/Program Files/Otzaria/data/flutter_assets/packages/otzaria_icons/lib/fonts/otzaria_icons.otf',
].find((path) => path && existsSync(path));
const iconPath = [process.env.RESPONSA_ICON, join(out, 'responsa-icon.ico')].find(
  (path) => path && existsSync(path),
);
let assets = '';
if (fontPath) {
  const glyphs = JSON.parse(
    execFileSync('py', ['-3', join(here, 'font_glyphs.py'), fontPath], { encoding: 'utf8' }),
  );
  const font = readFileSync(fontPath).toString('base64');
  assets += `window.__OTZARIA_ICON_FONT__ = ${JSON.stringify({ font, glyphs })};`;
}
if (iconPath) {
  assets += `window.__RESPONSA_APP_ICON__ = ${JSON.stringify(readFileSync(iconPath).toString('base64'))};`;
}

const html = readFileSync(join(plugin, 'index.html'), 'utf8')
  .replaceAll('href="css/', `href="${toPlugin}/css/`)
  .replaceAll('src="js/', `src="${toPlugin}/js/`)
  .replaceAll('src="i18n/', `src="${toPlugin}/i18n/`)
  .replace(
    '<link rel="stylesheet"',
    `<script>window.__RESPONSA_FIXTURES__ = ${fixtures};${assets}</script>\n    <script>${stub}</script>\n    <link rel="stylesheet"`,
  );

writeFileSync(join(out, 'preview.html'), html);
console.log(join(out, 'preview.html'));
