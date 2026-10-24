import asyncio, sys, base64, io, math
sys.path.insert(0, 'tests')
from harness import *
from PIL import Image, ImageChops

async def compare(page, i, name):
    info = await page.evaluate("(i) => { const sh = document.querySelectorAll('#sheets .sheet')[i]; sh.scrollIntoView({block: 'start'}); const r = sh.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }", i)
    await page.wait_for_timeout(150)
    info = await page.evaluate("(i) => { const sh = document.querySelectorAll('#sheets .sheet')[i]; const r = sh.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }", i)
    x0, y0 = math.floor(info['x']), math.floor(info['y'])
    W, H = math.floor(info['x'] + info['w']) - x0, min(math.floor(info['y'] + info['h']) - y0, 1500 - y0)
    await page.screenshot(path=f'shots/{name}-dom.png', clip={'x': x0, 'y': y0, 'width': W, 'height': H})
    url = await page.evaluate("async (o) => { const P = await __Q.collectPaint(); return __Q.paintPage(P, o.i, 1, o).toDataURL('image/png'); }", {'i': i, 'dx': info['x'] - x0, 'dy': info['y'] - y0, 'w': W, 'h': H})
    img = Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB'); img.save(f'shots/{name}-paint.png')
    dom = Image.open(f'shots/{name}-dom.png').convert('RGB')
    diff = ImageChops.difference(dom, img).convert('L'); px = diff.load()
    big = 0; ov = dom.copy(); op = ov.load()
    for y in range(H):
        for x in range(W):
            if px[x, y] > 80: big += 1; op[x, y] = (255, 0, 0)
    ov.save(f'shots/{name}-diff.png')
    print(name, 'differing pixels:', big, '(%.3f%%)' % (100 * big / (W * H)))

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1500)
        await load(page)
        await page.evaluate("() => __Q.newFromTemplate('report')")
        await page.wait_for_timeout(300)
        await page.evaluate("""async () => {
          const ed = document.getElementById('editor'); ed.spellcheck = false;
          const cv = document.createElement('canvas'); cv.width = 300; cv.height = 160; const x = cv.getContext('2d');
          const gr = x.createLinearGradient(0, 0, 300, 160); gr.addColorStop(0, '#2f5597'); gr.addColorStop(1, '#f2c14e'); x.fillStyle = gr; x.fillRect(0, 0, 300, 160);
          const src = cv.toDataURL('image/png');
          const p2 = ed.querySelectorAll('p')[3] || ed.lastElementChild;
          const extra = document.createElement('div');
          extra.innerHTML = `<p><img class="img-left" src="${src}" style="width:150px">A picture floated to the left with text wrapping beside it. The words continue along the right side of the picture and then return to the full width once they pass beneath it, the way a newsletter or a report lays out a figure next to a paragraph of explanation.</p>
          <table class="tbl-lines" style="width:100%"><tbody><tr><td>Item</td><td>Qty</td></tr><tr><td>Paper</td><td>12</td></tr><tr><td>Toner</td><td>3</td></tr></tbody></table>
          <div class="cols" style="--cols:2"><p>Two columns of text flow from the bottom of the first column to the top of the second, as in a newsletter. This sentence is long enough to fill several lines in each column of the layout.</p><p>A second paragraph inside the columns.</p></div>
          <p>Tracked: <ins class="tc" data-author="A" style="--tcc:#047857">added words</ins> and <del class="tc" data-author="A" style="--tcc:#b5179e">removed words</del>.</p>`;
          while (extra.firstChild) ed.insertBefore(extra.firstChild, p2);
          await new Promise(r => setTimeout(r, 200));
          const d = __Q.S.doc; d.header = { l: 'Folio', c: '', r: '{DATE}' }; d.footer = { l: '{TITLE}', c: '', r: 'Page {PAGE} of {PAGES}' }; d.page.border = true;
          __Q.setWatermark({ text: 'CONFIDENTIAL', color: '#c0c0c0', opacity: 0.4 });
          __Q.setZoom(1); __Q.renderSheets(); __Q.Layout.full();
          getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur();
        }""")
        await page.wait_for_timeout(500)
        n = await page.evaluate("() => __Q.S.pages")
        print('pages', n)
        for i in range(min(n, 2)): await compare(page, i, f'p2-{i + 1}')
        for e in errors: print('ERR', e)
        await b.close()
if __name__ == '__main__':
    asyncio.run(main())
