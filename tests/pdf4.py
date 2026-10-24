"""Vector PDF, harder cases: several pages with headers, footers, page numbers, a page border
and a watermark; bookmarks; a font added from a file; a font only installed on the
computer (drawn as pictures); synthetic bold and italic; small capitals; letter spacing;
hyphenation; a JPEG; check boxes; shading patterns and every border style."""
import asyncio, sys, base64, io, math, subprocess, re, zlib
sys.path.insert(0, 'tests')
from harness import *
from PIL import Image, ImageChops
from paint3 import DOC as BORDERS

DOC = r"""
<h1>Annual Report 2026</h1>
<p>An introduction in Calibri. <span style="font-variant:small-caps">Small Capitals Here</span> and <span style="font-family:Arial, Arimo, sans-serif;font-variant:small-caps">Arial small caps</span>. <span style="letter-spacing:2px">Spaced letters</span>.</p>
<h2>বাংলা অংশ</h2>
<p style="font-family:'Tiro Bangla', serif"><b>টিরো বাংলা মোটা অক্ষরে</b> এবং সাধারণ লেখা।</p>
<p><i>নোটো সান্স বাংলা বাঁকা লেখা</i> এবং সোজা লেখা।</p>
<p style="font-family:'FreeSerif Test', serif">ফাইল থেকে যোগ করা ফন্ট: আমাদের কার্যালয়ের সভার কার্যবিবরণী সংযুক্ত করা হলো।</p>
<p style="font-family:'DejaVu Serif'">DejaVu Serif is only on this computer, so these words become pictures.</p>
<h3>Lists</h3>
<ul class="checklist"><li data-checked="true">Done item</li><li>Open item</li></ul>
<div style="width:220px"><p style="text-align:justify">Hyphenation international organization representatives administration communication responsibilities.</p></div>
"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1500, gfonts=True)
        await load(page)
        await page.evaluate("(html) => __Q.openDoc(__Q.newDocModel({ title: 'Report', html }))", DOC + BORDERS + DOC.replace('Annual Report 2026', 'Second Part'))
        fs = base64.b64encode(open('/usr/share/fonts/truetype/freefont/FreeSerif.ttf', 'rb').read()).decode()
        await page.evaluate("""async (b64) => {
          const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          await __Q.UserFonts.register({ id: 'fs1', family: 'FreeSerif Test', weight: 400, italic: false }, u);
        }""", fs)
        await page.wait_for_timeout(600)
        await page.evaluate("""async () => {
          const ed = document.getElementById('editor'); ed.spellcheck = false;
          document.querySelectorAll('#editor [data-dd], #editor [data-du], #editor [data-shd]').forEach(el => __Q.decoSync(el));
          const cv = document.createElement('canvas'); cv.width = 400; cv.height = 250; const x = cv.getContext('2d');
          for (let i = 0; i < 400; i += 20) { x.fillStyle = `hsl(${i}, 60%, 50%)`; x.fillRect(i, 0, 20, 250); }
          x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.fillText('JPEG', 120, 140);
          const p = document.createElement('p'); p.innerHTML = `<img src="${cv.toDataURL('image/jpeg', 0.9)}" style="width:200px"> photo`;
          ed.insertBefore(p, ed.children[3]);
          ed.style.hyphens = 'auto'; __Q.S.doc.hyphenate = true;
          const d = __Q.S.doc; d.header = { l: 'Folio report', c: '', r: 'Page {PAGE} of {PAGES}' }; d.footer = { l: '', c: '{TITLE}', r: '' };
          d.page.border = { style: 'double', width: 0.75, color: '#2f5597', sides: { top: true, bottom: true, left: true, right: true }, shadow: false, from: 'page', m: { t: 24, b: 24, l: 24, r: 24 }, show: 'all' };
          __Q.setWatermark({ text: 'CONFIDENTIAL', color: '#c0c0c0', opacity: 0.4 });
          __Q.setZoom(1); __Q.renderSheets(); __Q.Layout.full();
          getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur();
          __Q.Prefs.gridlines = false; __Q.applyGridlines();
          await document.fonts.ready;
        }""")
        await page.wait_for_timeout(800)
        r = await page.evaluate("""async () => { const t0 = performance.now(); const blob = await __Q.buildVectorPdf({ title: 'Report', author: 'Tester', lang: 'en-US' });
          const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
          return { b64: btoa(s), size: u.length, ms: performance.now() - t0, stats: blob.stats, pages: __Q.S.pages }; }""")
        open('shots/v2.pdf', 'wb').write(base64.b64decode(r['b64']))
        print(f"PDF {r['size']/1024:.0f} KB, {r['ms']:.0f} ms, pages {r['pages']}, stats {r['stats']}")
        print(subprocess.run(['pdffonts', 'shots/v2.pdf'], capture_output=True, text=True).stdout)
        q = subprocess.run(['qpdf', '--check', 'shots/v2.pdf'], capture_output=True, text=True)
        print('qpdf:', (q.stdout.strip().splitlines() or [''])[-1], q.stderr[:300])
        raw = open('shots/v2.pdf', 'rb').read()
        print('outline entries:', raw.count(b'/Dest ['), 'titles:', [base64.b16decode(t).decode('utf-16-be') for t in re.findall(rb'/Title <FEFF([0-9A-F]+)> /Parent', raw)][:8])
        print(subprocess.run(['pdfimages', '-list', 'shots/v2.pdf'], capture_output=True, text=True).stdout[:900])
        txt = subprocess.run(['pdftotext', 'shots/v2.pdf', '-'], capture_output=True, text=True).stdout
        for want in ['Annual Report 2026', 'টিরো বাংলা মোটা অক্ষরে', 'নোটো সান্স বাংলা বাঁকা লেখা', 'আমাদের কার্যালয়ের সভার কার্যবিবরণী', 'DejaVu Serif is only on this computer', 'Done item', 'Page 1 of', 'Borders and shading test', 'Spaced letters']:
            print(('OK  ' if want.replace(' ', '') in txt.replace(' ', '').replace('\n', '') else 'MISS'), want)
        open('shots/v2.txt', 'w').write(txt)
        n = r['pages']
        for i in range(n):
            info = await page.evaluate("(i) => { const sh = document.querySelectorAll('#sheets .sheet')[i]; sh.scrollIntoView({block: 'start'}); const r = sh.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }", i)
            await page.wait_for_timeout(200)
            info = await page.evaluate("(i) => { const r = document.querySelectorAll('#sheets .sheet')[i].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }", i)
            x0, y0 = round(info['x']), round(info['y'])
            W, H = round(info['w']), min(round(info['h']), 1500 - y0)
            await page.screenshot(path=f'shots/v2-{i+1}-dom.png', clip={'x': x0, 'y': y0, 'width': W, 'height': H})
            subprocess.run(['pdftoppm', '-r', '96', '-f', str(i + 1), '-l', str(i + 1), '-png', 'shots/v2.pdf', f'shots/v2-{i+1}-pdf'], check=True)
            pp = f'shots/v2-{i+1}-pdf-{i+1}.png'
            import os
            if not os.path.exists(pp): pp = f'shots/v2-{i+1}-pdf-{str(i+1).zfill(len(str(n)))}.png'
            pdf = Image.open(pp).convert('RGB').crop((0, 0, W, H))
            dom = Image.open(f'shots/v2-{i+1}-dom.png').convert('RGB')
            diff = ImageChops.difference(dom, pdf).convert('L')
            px = diff.load(); big = 0; ov = dom.copy(); op = ov.load()
            for y in range(H):
                for x in range(W):
                    if px[x, y] > 96: big += 1; op[x, y] = (255, 0, 0)
            ov.save(f'shots/v2-{i+1}-diff.png')
            print('page %d differing pixels: %d (%.3f%%)' % (i + 1, big, 100 * big / (W * H)))
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
