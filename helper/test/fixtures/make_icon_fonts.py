# -*- coding: utf-8 -*-
"""יוצר את גופני הבדיקה של otzaria_icon_font_test.dart: שני גליפים מצוירים
כאן (ריבוע ומשולש), בשמות של אייקוני אוצריא, ב-CFF וב-TrueType.

    py -3 test/fixtures/make_icon_fonts.py
"""
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

HERE = Path(__file__).parent
NAMES = ['.notdef', 'book_24_regular', 'search_in_the_library_24_regular']
CMAP = {0xE000: 'book_24_regular', 0xE001: 'search_in_the_library_24_regular'}


def draw(pen, index):
    if index == 1:
        pen.moveTo((100, 100)); pen.lineTo((900, 100)); pen.lineTo((900, 900)); pen.lineTo((100, 900)); pen.closePath()
    elif index == 2:
        pen.moveTo((100, 100)); pen.lineTo((900, 100)); pen.lineTo((500, 900)); pen.closePath()


def base(cff):
    fb = FontBuilder(1000, isTTF=not cff)
    fb.setupGlyphOrder(NAMES)
    fb.setupCharacterMap(CMAP)
    return fb


def finish(fb, path):
    fb.setupHorizontalMetrics({name: (1000, 0) for name in NAMES})
    fb.setupHorizontalHeader(ascent=1000, descent=0)
    fb.setupNameTable({'familyName': 'Test Icons', 'styleName': 'Regular'})
    fb.setupOS2()
    fb.save(str(path))


cff = base(True)
charstrings = {}
for i, name in enumerate(NAMES):
    pen = T2CharStringPen(1000, None)
    draw(pen, i)
    charstrings[name] = pen.getCharString()
cff.setupCFF('TestIcons', {'FullName': 'Test Icons'}, charstrings, {})
cff.setupPost()
finish(cff, HERE / 'icons_cff.otf')

tt = base(False)
glyphs = {}
for i, name in enumerate(NAMES):
    pen = TTGlyphPen(None)
    draw(pen, i)
    glyphs[name] = pen.glyph()
tt.setupGlyf(glyphs)
tt.setupPost(keepGlyphNames=True)
finish(tt, HERE / 'icons_post.ttf')
print('ok')
