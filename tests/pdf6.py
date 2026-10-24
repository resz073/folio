"""Vector PDF with OpenType (CFF) fonts added from files: a plain one (TeX Gyre Termes) and a
CID-keyed one (a Noto Sans CJK subset). Both must be embedded as real text."""
import asyncio, sys, base64, subprocess
sys.path.insert(0, 'tests')
from harness import *
from PIL import Image, ImageChops

import os
CJK = 'shots/cjk-sub.otf'
if not os.path.exists(CJK):
    # a small CID-keyed CFF font: a subset of Noto Sans CJK
    from fontTools.ttLib import TTFont
    from fontTools import subset
    f = TTFont('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', fontNumber=0)
    o = subset.Options(); o.layout_features = ['*']; o.name_IDs = ['*']; o.notdef_outline = True
    s = subset.Subsetter(o); s.populate(text='日本語の文書です。漢字とかなを含む中文测试 ABC abc 123'); s.subset(f)
    f.save(CJK)
FONTS = [('Termes Test', '/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyretermes-regular.otf'), ('CJK Test', CJK)]
DOC = """<p style="font-family:'Termes Test', serif;font-size:16pt">Termes from an OTF file: Office fluffy AVATAR, “quotes” and 1,234.56.</p>
<p style="font-family:'CJK Test', sans-serif;font-size:16pt">日本語の文書です。漢字とかなを含む中文测试 ABC abc 123</p>
<p>Calibri for comparison.</p>"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1200, gfonts=True)
        await load(page)
        await page.evaluate("(html) => __Q.openDoc(__Q.newDocModel({ title: 'OTF', html }))", DOC)
        for i, (fam, path) in enumerate(FONTS):
            await page.evaluate("""async ([fam, b64, id]) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
              await __Q.UserFonts.register({ id, family: fam, weight: 400, italic: false }, u); }""", [fam, base64.b64encode(open(path, 'rb').read()).decode(), f'otf{i}'])
        await page.evaluate("async () => { document.getElementById('editor').spellcheck = false; __Q.setZoom(1); __Q.Layout.full(); getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur(); await document.fonts.ready; }")
        await page.wait_for_timeout(600)
        r = await page.evaluate("""async () => { const blob = await __Q.buildVectorPdf({ title: 'OTF' });
          const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
          return { b64: btoa(s), kb: Math.round(u.length / 1024), stats: blob.stats }; }""")
        open('shots/v6.pdf', 'wb').write(base64.b64decode(r['b64']))
        print(r['kb'], 'KB', r['stats'])
        print(subprocess.run(['pdffonts', 'shots/v6.pdf'], capture_output=True, text=True).stdout)
        q = subprocess.run(['qpdf', '--check', 'shots/v6.pdf'], capture_output=True, text=True)
        print('qpdf:', (q.stdout.strip().splitlines() or [''])[-1], q.stderr[:200])
        txt = subprocess.run(['pdftotext', 'shots/v6.pdf', '-'], capture_output=True, text=True).stdout
        for want in ['Termes from an OTF file', 'fluffy AVATAR', '日本語の文書です。', '中文测试', 'Calibri for comparison']:
            print(('OK  ' if want in txt else 'MISS'), want)
        info = await page.evaluate("() => { const r = document.querySelectorAll('#sheets .sheet')[0].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }")
        x0, y0 = round(info['x']), round(info['y'])
        W, H = round(info['w']), 300
        await page.screenshot(path='shots/v6-dom.png', clip={'x': x0, 'y': y0, 'width': W, 'height': H})
        subprocess.run(['pdftoppm', '-r', '96', '-f', '1', '-l', '1', '-png', 'shots/v6.pdf', 'shots/v6-pdf'], check=True)
        pdf = Image.open('shots/v6-pdf-1.png').convert('RGB').crop((0, 0, W, H))
        dom = Image.open('shots/v6-dom.png').convert('RGB')
        diff = ImageChops.difference(dom, pdf).convert('L'); px = diff.load()
        big = sum(1 for y in range(H) for x in range(W) if px[x, y] > 96)
        print('differing pixels in the top 300 px: %d (%.3f%%)' % (big, 100 * big / (W * H)))
        both = Image.new('RGB', (W, H * 2 + 6), 'white'); both.paste(dom, (0, 0)); both.paste(pdf, (0, H + 6)); both.save('shots/v6-both.png')
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
