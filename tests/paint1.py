import asyncio, sys, base64, io
sys.path.insert(0, 'tests')
from harness import *
from PIL import Image, ImageChops

EXTRA = """<p>Plain <u>underlined words here</u>, <s>struck out</s>, <a href="https://example.com/x">a link</a>, x<sup>2</sup> and H<sub>2</sub>O, <span style="background-color:#fde047">highlighted text</span>.</p>
<ol><li>First numbered item</li><li>Second item with <b>bold</b></li><li>Third</li></ol>
<ol style="list-style-type:lower-roman"><li>roman one</li><li>roman two</li></ol>
<p style="background-color:#e8f3ee;border:1px solid #1d6a50;padding:4pt">A shaded paragraph with a border all round it.</p>
<p style="text-align:justify">Justified text runs the full width of the line so that both edges line up neatly, which is common in formal letters and reports, and this sentence keeps going to wrap.</p>
<hr>
<p style="text-align:center">বাংলা লেখা: আমাদের অফিসের জন্য একটি চিঠি</p>"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1500)
        await load(page)
        await page.evaluate("() => __Q.newFromTemplate('welcome')")
        await page.wait_for_timeout(300)
        await page.evaluate("""(extra) => {
          const ed = document.getElementById('editor'); ed.spellcheck = false;
          const h1 = ed.querySelector('h1');
          const box = document.createElement('div'); box.innerHTML = extra;
          while (box.firstChild) h1.parentNode.insertBefore(box.firstChild, h1);
          __Q.setZoom(1); __Q.Layout.full();
          getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur();
        }""", EXTRA)
        await page.wait_for_timeout(500)
        info = await page.evaluate("() => { const sh = document.querySelector('#sheets .sheet'); const r = sh.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, pages: __Q.S.pages }; }")
        print('sheet', info)
        import math
        x0, y0 = math.floor(info['x']), math.floor(info['y'])
        W, H = math.floor(info['x'] + info['w']) - x0, math.floor(info['y'] + info['h']) - y0
        await page.screenshot(path='shots/p1-dom.png', clip={'x': x0, 'y': y0, 'width': W, 'height': H})
        data = await page.evaluate("""async (o) => { const P = await __Q.collectPaint(); const cv = __Q.paintPage(P, 0, 1, o); window.__P = P; return { url: cv.toDataURL('image/png'), ops: P.ops.length, words: P.words.length }; }""", {'dx': info['x'] - x0, 'dy': info['y'] - y0, 'w': W, 'h': H})
        print('ops', data['ops'], 'words', data['words'])
        img = Image.open(io.BytesIO(base64.b64decode(data['url'].split(',')[1]))).convert('RGB')
        img.save('shots/p1-paint.png')
        dom = Image.open('shots/p1-dom.png').convert('RGB')
        if dom.size != img.size: print('size differ', dom.size, img.size); dom = dom.resize(img.size)
        diff = ImageChops.difference(dom, img).convert('L')
        px = diff.load(); W, H = diff.size
        big = sum(1 for y in range(H) for x in range(W) if px[x, y] > 80)
        print('pixels differing >80:', big, 'of', W * H, '(%.3f%%)' % (100 * big / (W * H)))
        # red overlay of differences on the DOM image
        ov = dom.copy(); op = ov.load()
        for y in range(H):
            for x in range(W):
                if px[x, y] > 80: op[x, y] = (255, 0, 0)
        ov.save('shots/p1-diff.png')
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())

# ---- calibration of decoration rows against the DOM image ----
async def calib():
    import math
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1500)
        await load(page)
        await page.evaluate("() => __Q.newFromTemplate('welcome')")
        await page.wait_for_timeout(300)
        await page.evaluate("""(extra) => { const ed = document.getElementById('editor'); ed.spellcheck = false; const h1 = ed.querySelector('h1'); const box = document.createElement('div'); box.innerHTML = extra; while (box.firstChild) h1.parentNode.insertBefore(box.firstChild, h1); __Q.setZoom(1); __Q.Layout.full(); getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur(); }""", EXTRA)
        await page.wait_for_timeout(400)
        info = await page.evaluate("() => { const sh = document.querySelector('#sheets .sheet'); const r = sh.getBoundingClientRect(); return { x: r.left, y: r.top }; }")
        x0, y0 = math.floor(info['x']), math.floor(info['y'])
        await page.screenshot(path='shots/p1-dom2.png', clip={'x': x0, 'y': y0, 'width': 790, 'height': 1100})
        data = await page.evaluate("""async () => { const P = await __Q.collectPaint(); const g = __Q.geom();
          const words = P.words; const decos = P.ops.filter(o => o.t === 'deco' && o.top < g.h);
          return decos.map(d => { const ws = words.filter(w => Math.abs(w.y - d.top) < 20 && w.x >= d.x1 - 1 && w.x + w.w <= d.x2 + 1).sort((a, b) => a.x - b.x);
            const gaps = []; for (let k = 0; k + 1 < ws.length; k++) if (Math.abs(ws[k].y - ws[k + 1].y) < 1 && ws[k + 1].x - (ws[k].x + ws[k].w) > 2) gaps.push((ws[k].x + ws[k].w + ws[k + 1].x) / 2);
            const base = ws.length ? ws[0].y : null; return { top: d.top, raw: d.raw, base, gaps, kind: d.top < (base || 0) ? 'strike' : 'under', size: ws.length ? ws[0].size : 0 }; }); }""")
        from PIL import Image
        im = Image.open('shots/p1-dom2.png').convert('L')
        fx, fy = info['x'] - x0, info['y'] - y0
        for d in data:
            if not d['gaps'] or d['base'] is None: continue
            rows = set()
            for gx in d['gaps']:
                X = int(gx + fx)
                for Y in range(int(d['base'] + fy) - 14, int(d['base'] + fy) + 6):
                    if 0 <= X < im.size[0] and 0 <= Y < im.size[1] and im.getpixel((X, Y)) < 160: rows.add(Y)
            mine = math.floor(d['top'] + fy + 0.5)
            print(f"{d['kind']:6s} size={d['size']:.2f} base_dev={d['base'] + fy:.3f} top_dev={d['top'] + fy:.3f} mine_row={mine} dom_rows={sorted(rows)} rel={[r - (d['base'] + fy) for r in sorted(rows)]}")
        await b.close()
asyncio.run(calib())
