#!/usr/bin/env python3
"""Build the font files Folio embeds in PDFs.

Each family Folio offers is written as static TrueType files (regular, bold, italic,
bold italic, as far as the family has them), made from the same sources Google Fonts
serves, so the PDF uses the glyphs the page showed. Variable fonts are instanced at
weight 400 / 700 with every other axis at its default, as the Google Fonts API does.
Writes dist/fonts/*.ttf, dist/fonts/LICENSES.txt and src/js/06-pdffonts.js."""
import json, pathlib, sys, io
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
GF = pathlib.Path('/home/claude/google/fonts/ofl')
DEJAVU = pathlib.Path('/usr/share/fonts/truetype/dejavu')
OUT = ROOT / 'dist' / 'fonts'
OUT.mkdir(parents=True, exist_ok=True)

# family: (repo dir, {style: (file, wght or None)})
def vf(dirname, upright, italic=None):
    s = {'r': (upright, 400), 'b': (upright, 700)}
    if italic: s['i'] = (italic, 400); s['bi'] = (italic, 700)
    return (dirname, s)
def static(dirname, **files):
    return (dirname, {k: (v, None) for k, v in files.items()})

FAMILIES = {
    'Carlito': static('carlito', r='Carlito-Regular.ttf', b='Carlito-Bold.ttf', i='Carlito-Italic.ttf', bi='Carlito-BoldItalic.ttf'),
    'Caladea': static('caladea', r='Caladea-Regular.ttf', b='Caladea-Bold.ttf', i='Caladea-Italic.ttf', bi='Caladea-BoldItalic.ttf'),
    'Arimo': vf('arimo', 'Arimo[wght].ttf', 'Arimo-Italic[wght].ttf'),
    'Tinos': static('tinos', r='Tinos-Regular.ttf', b='Tinos-Bold.ttf', i='Tinos-Italic.ttf', bi='Tinos-BoldItalic.ttf'),
    'Cousine': static('cousine', r='Cousine-Regular.ttf', b='Cousine-Bold.ttf', i='Cousine-Italic.ttf', bi='Cousine-BoldItalic.ttf'),
    'Gelasio': vf('gelasio', 'Gelasio[wght].ttf', 'Gelasio-Italic[wght].ttf'),
    'EB Garamond': vf('ebgaramond', 'EBGaramond[wght].ttf', 'EBGaramond-Italic[wght].ttf'),
    'Noto Sans': vf('notosans', 'NotoSans[wdth,wght].ttf', 'NotoSans-Italic[wdth,wght].ttf'),
    'Questrial': static('questrial', r='Questrial-Regular.ttf'),
    'Roboto': vf('roboto', 'Roboto[wdth,wght].ttf', 'Roboto-Italic[wdth,wght].ttf'),
    'Open Sans': vf('opensans', 'OpenSans[wdth,wght].ttf', 'OpenSans-Italic[wdth,wght].ttf'),
    'Lato': static('lato', r='Lato-Regular.ttf', b='Lato-Bold.ttf', i='Lato-Italic.ttf', bi='Lato-BoldItalic.ttf'),
    'Montserrat': vf('montserrat', 'Montserrat[wght].ttf', 'Montserrat-Italic[wght].ttf'),
    'Merriweather': vf('merriweather', 'Merriweather[opsz,wdth,wght].ttf', 'Merriweather-Italic[opsz,wdth,wght].ttf'),
    'Lora': vf('lora', 'Lora[wght].ttf', 'Lora-Italic[wght].ttf'),
    'PT Serif': static('ptserif', r='PT_Serif-Web-Regular.ttf', b='PT_Serif-Web-Bold.ttf', i='PT_Serif-Web-Italic.ttf', bi='PT_Serif-Web-BoldItalic.ttf'),
    'Source Serif 4': vf('sourceserif4', 'SourceSerif4[opsz,wght].ttf', 'SourceSerif4-Italic[opsz,wght].ttf'),
    'Playfair Display': vf('playfairdisplay', 'PlayfairDisplay[wght].ttf', 'PlayfairDisplay-Italic[wght].ttf'),
    'Libre Baskerville': ('librebaskerville', {'r': ('LibreBaskerville[wght].ttf', 400), 'b': ('LibreBaskerville[wght].ttf', 700), 'i': ('LibreBaskerville-Italic[wght].ttf', 400)}),
    'Inconsolata': vf('inconsolata', 'Inconsolata[wdth,wght].ttf'),
    'Dancing Script': vf('dancingscript', 'DancingScript[wght].ttf'),
    'Noto Sans Bengali': vf('notosansbengali', 'NotoSansBengali[wdth,wght].ttf'),
    'Noto Serif Bengali': vf('notoserifbengali', 'NotoSerifBengali[wdth,wght].ttf'),
    'Hind Siliguri': static('hindsiliguri', r='HindSiliguri-Regular.ttf', b='HindSiliguri-Bold.ttf'),
    'Tiro Bangla': static('tirobangla', r='TiroBangla-Regular.ttf', i='TiroBangla-Italic.ttf'),
    'Anek Bangla': vf('anekbangla', 'AnekBangla[wdth,wght].ttf'),
    'Baloo Da 2': vf('balooda2', 'BalooDa2[wght].ttf'),
    'Galada': static('galada', r='Galada-Regular.ttf'),
}
LOCAL = {
    'DejaVu Sans': {'r': DEJAVU / 'DejaVuSans.ttf', 'b': DEJAVU / 'DejaVuSans-Bold.ttf', 'i': DEJAVU / 'DejaVuSans-Oblique.ttf', 'bi': DEJAVU / 'DejaVuSans-BoldOblique.ttf'},
}

def slug(name): return name.lower().replace(' ', '')

def instance(path, wght):
    f = TTFont(str(path))
    if 'fvar' in f:
        axes = {a.axisTag: a.defaultValue for a in f['fvar'].axes}
        if wght is not None and 'wght' in axes:
            lo = min(a.minValue for a in f['fvar'].axes if a.axisTag == 'wght')
            hi = max(a.maxValue for a in f['fvar'].axes if a.axisTag == 'wght')
            axes['wght'] = max(lo, min(hi, wght))
        f = instancer.instantiateVariableFont(f, axes, inplace=False, updateFontNames=True)
    for t in ('DSIG', 'STAT', 'MVAR', 'HVAR', 'avar', 'fvar', 'gvar', 'cvar'):
        if t in f: del f[t]
    if 'post' in f: f['post'].formatType = 3.0  # glyph names are not needed
    return f

def main():
    manifest, licenses, total = {}, [], 0
    for fam, (d, styles) in FAMILIES.items():
        entry = {}
        for st, (fn, wght) in styles.items():
            src = GF / d / fn
            f = instance(src, wght)
            if wght and 'OS/2' in f: f['OS/2'].usWeightClass = wght
            out = OUT / f'{slug(fam)}-{st}.ttf'
            f.save(str(out))
            entry[st] = out.name
            total += out.stat().st_size
        manifest[fam.lower()] = entry
        lic = GF / d / 'OFL.txt'
        if lic.exists(): licenses.append(f'==== {fam} ====\n' + lic.read_text().strip() + '\n')
    for fam, styles in LOCAL.items():
        entry = {}
        for st, src in styles.items():
            out = OUT / f'{slug(fam)}-{st}.ttf'
            f = TTFont(str(src))
            if 'post' in f: f['post'].formatType = 3.0
            f.save(str(out))
            entry[st] = out.name
            total += out.stat().st_size
        manifest[fam.lower()] = entry
    licenses.append('==== DejaVu Sans ====\nFonts are (c) Bitstream (see below). DejaVu changes are in public domain.\n'
                    'Bitstream Vera Fonts Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved. Bitstream Vera is a trademark of Bitstream, Inc.\n'
                    'Permission is hereby granted, free of charge, to any person obtaining a copy of the fonts accompanying this license ("Fonts") and associated documentation files (the "Font Software"), to reproduce and distribute the Font Software, including without limitation the rights to use, copy, merge, publish, distribute, and/or sell copies of the Font Software, and to permit persons to whom the Font Software is furnished to do so, subject to the following conditions: The above copyright and trademark notices and this permission notice shall be included in all copies of one or more of the Font Software typefaces. The Font Software may be modified, altered, or added to, and in particular the designs of glyphs or characters in the Fonts may be modified and additional glyphs or characters may be added to the Fonts, only if the fonts are renamed to names not containing either the words "Bitstream" or the word "Vera". The Font Software is provided "as is", without warranty of any kind.\n')
    (OUT / 'LICENSES.txt').write_text('Fonts embedded in PDFs made by Folio, and their licenses.\n\n' + '\n'.join(licenses))
    js = ('/* ===================== Fonts for PDF embedding (generated by tools/fonts.py) =====================\n'
          '   Static TrueType files published with the page, one per family and style (r, b, i, bi). */\n'
          'const PDF_FONT_FILES = ' + json.dumps(manifest, separators=(',', ':')) + ';\n')
    (ROOT / 'src' / 'js' / '06-pdffonts.js').write_text(js)
    print(f'{sum(len(v) for v in manifest.values())} files, {total/1024/1024:.1f} MB')

if __name__ == '__main__':
    main()
