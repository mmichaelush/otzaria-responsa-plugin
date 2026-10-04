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
    'add_24_regular',
    'apps_list_24_regular',
    'arrow_download_24_regular',
    'arrow_right_24_regular',
    'arrow_sync_24_regular',
    'book_24_regular',
    'book_information_24_regular',
    'book_open_24_regular',
    'bug_24_regular',
    'building_shop_24_regular',
    'checkmark_24_regular',
    'checkmark_circle_24_regular',
    'chevron_down_24_regular',
    'circle_24_regular',
    'code_24_regular',
    'copy_24_regular',
    'desktop_24_regular',
    'database_search_24_regular',
    'delete_24_regular',
    'dismiss_24_regular',
    'dismiss_circle_24_regular',
    'document_bullet_list_24_regular',
    'document_search_24_regular',
    'chevron_left_24_regular',
    'folder_24_regular',
    'folder_open_24_regular',
    'home_24_regular',
    'hand_wave_24_regular',
    'history_24_regular',
    'info_24_regular',
    'library_24_regular',
    'mail_24_regular',
    'open_24_regular',
    'pulse_24_regular',
    'question_circle_24_regular',
    'search_24_regular',
    'search_info_24_regular',
    'send_24_regular',
    'settings_24_regular',
    'shield_checkmark_24_regular',
    'text_font_24_regular',
    'text_font_size_24_regular',
    'text_quote_24_regular',
    'translate_24_regular',
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
//
// כשהשירות מוצא את האוצריא המותקנת, התוסף מצייר את האייקונים של אוצריא
// עצמה מהגופן שלה (useHostFont), כמו הכלל של אוצריא: שם שקיים בשתי
// הספריות — של אוצריא. האייקונים שכאן נשארים לכל שם שאין לו גליף, ולפני
// שהגופן נטען.
(function (root) {
  'use strict';
  const shapes = {
__SHAPES__
  };

  /**
   * אייקון של אוצריא שמתאים יותר מהאייקון שבתוסף, כשהוא קיים בגופן של
   * האוצריא המותקנת. שם שקיים בשתי הספריות אינו צריך כאן רשומה.
   */
  const PREFERRED = Object.freeze({
    document_search_24_regular: 'search_in_the_library_24_regular',
    search_info_24_regular: 'search_not_found_24_regular',
    database_search_24_regular: 'search_in_the_settings_24_regular',
    text_quote_24_regular: 'search_in_the_text_24_regular',
    library_24_regular: 'bookshelf_24_regular',
    folder_24_regular: 'books_stacked_low_24_regular',
  });

  const SVG = 'http://www.w3.org/2000/svg';
  const FAMILY = 'OtzariaIcons';

  /** שם הגליף ← נקודת קוד, מהגופן של אוצריא; `null` עד שנטען. */
  let hostGlyphs = null;
  const listeners = [];

  function hostCodepoint(name) {
    if (!hostGlyphs) return null;
    const preferred = PREFERRED[name];
    if (preferred && hostGlyphs[preferred]) return hostGlyphs[preferred];
    return hostGlyphs[name] || null;
  }

  /**
   * אלמנט SVG דקורטיבי (aria-hidden). גליף של אוצריא מצויר כטקסט באותו
   * 24×24, כך שכל כללי הגודל של `.icon` חלים עליו בלי שינוי.
   */
  function icon(name, className) {
    const shape = shapes[name];
    if (!shape) throw new Error('אייקון לא מוכר: ' + name);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon' + (className ? ' ' + className : ''));
    const code = hostCodepoint(name);
    if (code) {
      const text = document.createElementNS(SVG, 'text');
      text.setAttribute('class', 'icon-glyph');
      text.setAttribute('x', '0');
      text.setAttribute('y', '24');
      text.setAttribute('direction', 'ltr');
      text.setAttribute('font-size', '24');
      text.textContent = String.fromCodePoint(code);
      svg.appendChild(text);
      svg.dataset.icon = 'otzaria';
      return svg;
    }
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', shape.path);
    if (shape.transform) path.setAttribute('transform', shape.transform);
    svg.appendChild(path);
    return svg;
  }

  /**
   * טוען את גופן האייקונים של אוצריא (base64) ומודיע למאזינים, שמציירים
   * מחדש. `false` כשאין תמיכה או שהגופן לא נטען: האייקונים שבתוסף נשארים.
   */
  async function useHostFont(fontBase64, glyphs) {
    const doc = root.document;
    if (typeof root.FontFace !== 'function' || !doc || !doc.fonts) return false;
    if (typeof fontBase64 !== 'string' || !glyphs || typeof glyphs !== 'object') return false;
    try {
      const binary = root.atob(fontBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const face = new root.FontFace(FAMILY, bytes.buffer);
      await face.load();
      doc.fonts.add(face);
    } catch (error) {
      return false;
    }
    hostGlyphs = Object.create(null);
    for (const [name, code] of Object.entries(glyphs)) {
      if (Number.isInteger(code) && code > 0) hostGlyphs[name] = code;
    }
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        // מאזין שנכשל אינו עוצר את האחרים.
      }
    }
    return true;
  }

  function onChange(listener) {
    listeners.push(listener);
  }

  const api = {
    icon,
    names: Object.keys(shapes),
    PREFERRED,
    useHostFont,
    onChange,
    /** האם גופן האייקונים של אוצריא נטען. */
    get hostActive() {
      return hostGlyphs !== null;
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaIcons = api;
})(typeof self !== 'undefined' ? self : globalThis);
"""

if __name__ == '__main__':
    main()
