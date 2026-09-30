// בונה tools/preview/out/preview.html מתוך plugin/index.html האמיתי, עם הגשר
// המדומה שב-stub.js. כך התצוגה המקדימה היא תמיד הדף שנשלח, ולא עותק שלו.
//
//   node tools/preview/build-preview.mjs
//   node tools/preview/screenshots.mjs          # צילום כל המסכים
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const plugin = join(here, '..', '..', 'plugin');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const toPlugin = relative(out, plugin).replaceAll('\\', '/');
const fixtures = readFileSync(join(here, 'fixtures.json'), 'utf8');
const stub = readFileSync(join(here, 'stub.js'), 'utf8');

const html = readFileSync(join(plugin, 'index.html'), 'utf8')
  .replaceAll('href="css/', `href="${toPlugin}/css/`)
  .replaceAll('src="js/', `src="${toPlugin}/js/`)
  .replaceAll('src="i18n/', `src="${toPlugin}/i18n/`)
  .replace(
    '<link rel="stylesheet"',
    `<script>window.__RESPONSA_FIXTURES__ = ${fixtures};</script>\n    <script>${stub}</script>\n    <link rel="stylesheet"`,
  );

writeFileSync(join(out, 'preview.html'), html);
console.log(join(out, 'preview.html'));
