# -*- coding: utf-8 -*-
"""בונה את plugin/js/responsa-icons.js מתוך הגופן של FluentUI System Icons.

אותו גופן שאוצריא מציירת ממנו, ולכן האייקונים זהים לאלה שבממשק שלה. כדי להוסיף
אייקון: מוסיפים את שמו ל-ICONS ומריצים

    py -3 tools/icon/build_icons.py

דורש את חבילת Flutter `fluentui_system_icons` ב-pub cache ואת fontTools.
"""
import os
import re
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ICONS = [
    'apps_list_24_regular',
    'arrow_download_24_regular',
    'arrow_sync_24_regular',
    'book_24_regular',
    'book_information_24_regular',
    'bug_24_regular',
    'building_shop_24_regular',
    'checkmark_24_regular',
    'checkmark_circle_24_regular',
    'chevron_down_24_regular',
    'circle_24_regular',
    'code_24_regular',
    'copy_24_regular',
    'desktop_24_regular',
    'dismiss_24_regular',
    'dismiss_circle_24_regular',
    'document_bullet_list_24_regular',
    'document_search_24_regular',
    'folder_open_24_regular',
    'hand_wave_24_regular',
    'history_24_regular',
    'info_24_regular',
    'library_24_regular',
    'open_24_regular',
    'pulse_24_regular',
    'question_circle_24_regular',
    'search_24_regular',
    'search_info_24_regular',
    'send_24_regular',
    'settings_24_regular',
    'shield_checkmark_24_regular',
    'text_quote_24_regular',
    'warning_24_regular',
    'wifi_off_24_regular',
    'wrench_24_regular',
]

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'plugin' / 'js' / 'responsa-icons.js'


def package_dir():
    cache = Path(os.environ.get('PUB_CACHE', r'C:\pubcache')) / 'hosted' / 'pub.dev'
    found = sorted(cache.glob('fluentui_system_icons-*'))
    if not found:
        sys.exit('fluentui_system_icons לא נמצאה ב-' + str(cache))
    return found[-1]


def codepoints(package):
    source = (package / 'lib' / 'src' / 'fluent_icons.dart').read_text(encoding='utf-8')
    pattern = re.compile(r'static const IconData (\w+) = IconData\((\d+)')
    return {name: int(code) for name, code in pattern.findall(source)}


def main():
    package = package_dir()
    font = TTFont(package / 'lib' / 'fonts' / 'FluentSystemIcons-Regular.ttf')
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = 24 / font['head'].unitsPerEm
    codes = codepoints(package)

    entries = []
    for name in sorted(set(ICONS)):
        if name not in codes:
            sys.exit('אייקון לא קיים בגופן: ' + name)
        pen = SVGPathPen(glyphs, ntos=lambda value: ('%.2f' % value).rstrip('0').rstrip('.'))
        glyphs[cmap[codes[name]]].draw(pen)
        entries.append(
            "    %s: { path: '%s', transform: 'translate(0 24) scale(%s -%s)' },"
            % (name, pen.getCommands(), round(scale, 6), round(scale, 6))
        )

    OUTPUT.write_text(
        TEMPLATE.replace('__SHAPES__', '\n'.join(entries)), encoding='utf-8', newline='\n'
    )
    print('%d icons -> %s' % (len(entries), OUTPUT))


TEMPLATE = """// נוצר מתוך FluentUI System Icons (רישיון MIT), באותה צורה שבה אוצריא
// מציירת אותם. כל אייקון הוא path במערכת 24×24. אין לערוך ידנית: להוספת
// אייקון — tools/icon/build_icons.py.
(function (root) {
  'use strict';
  const shapes = {
__SHAPES__
  };

  const SVG = 'http://www.w3.org/2000/svg';

  /** אלמנט SVG דקורטיבי (aria-hidden). */
  function icon(name, className) {
    const shape = shapes[name];
    if (!shape) throw new Error('אייקון לא מוכר: ' + name);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon' + (className ? ' ' + className : ''));
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', shape.path);
    if (shape.transform) path.setAttribute('transform', shape.transform);
    svg.appendChild(path);
    return svg;
  }

  const api = { icon, names: Object.keys(shapes) };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaIcons = api;
})(typeof self !== 'undefined' ? self : globalThis);
"""

if __name__ == '__main__':
    main()
