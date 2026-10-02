# -*- coding: utf-8 -*-
"""שם גליף ← נקודת קוד, כמו /otzaria/icons של השירות. לתצוגה המקדימה בלבד.

    py -3 tools/preview/font_glyphs.py <font>
"""
import json
import sys

from fontTools.ttLib import TTFont

font = TTFont(sys.argv[1])
glyphs = {}
for code, name in sorted(font.getBestCmap().items()):
    glyphs.setdefault(name, code)
print(json.dumps(glyphs))
