import asyncio, sys, base64, time
sys.path.insert(0, 'tests')
from harness import *
EXTRA = open('tests/paint1.py').read().split('EXTRA = """')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000)
        await load(page)
        await page.evaluate("() => __Q.newFromTemplate('welcome')")
        await page.wait_for_timeout(300)
        await page.evaluate("""(extra) => { const ed = document.getElementById('editor'); const h1 = ed.querySelector('h1'); const box = document.createElement('div'); box.innerHTML = extra; while (box.firstChild) h1.parentNode.insertBefore(box.firstChild, h1); __Q.S.doc.header = { l: 'Folio', c: '', r: '{DATE}' }; __Q.renderSheets(); __Q.Layout.full(); }""", EXTRA)
        await page.wait_for_timeout(300)
        for scale in (2, 3):
            t0 = time.time()
            r = await page.evaluate("""async (sc) => { const t0 = performance.now(); const pages = await __Q.renderPagesForPdf({ scale: sc }); const t1 = performance.now(); const blob = await __Q.buildPdf(pages, { title: 'Welcome to Folio', author: 'Tester', lang: 'en-US' }); const t2 = performance.now();
              const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
              return { b64: btoa(s), size: u.length, render: t1 - t0, build: t2 - t1, pages: pages.length, imgs: pages.map(p => [p.img.filter, p.img.comps, p.img.data.length]), words: pages.map(p => p.words.length), links: pages.map(p => p.links.length) }; }""", scale)
            open(f'shots/test3-{scale}x.pdf', 'wb').write(base64.b64decode(r['b64']))
            print(f"scale {scale}: {r['size']/1024:.0f} KB, render {r['render']:.0f} ms, build {r['build']:.0f} ms, pages {r['pages']}, imgs {r['imgs']}, words {r['words']}, links {r['links']}")
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
