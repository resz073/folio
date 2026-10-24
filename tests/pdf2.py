import asyncio, sys, base64
sys.path.insert(0, 'tests')
from harness import *
JS = """async (o) => { const pages = await __Q.renderPagesForPdf({ scale: o.scale }); const blob = await __Q.buildPdf(pages, { title: __Q.S.doc.title, lang: __Q.S.doc.lang });
  const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return { b64: btoa(s), size: u.length, pages: pages.length, imgs: pages.map(p => p.img.filter + p.img.comps) }; }"""
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000)
        await load(page)
        for tpl in ['letter', 'leave-bn']:
            await page.evaluate("(t) => __Q.newFromTemplate(t)", tpl)
            await page.wait_for_timeout(300)
            r = await page.evaluate(JS, {'scale': 2})
            open(f'shots/t-{tpl}.pdf', 'wb').write(base64.b64decode(r['b64']))
            print(tpl, f"{r['size']/1024:.0f} KB", r['pages'], 'pages', r['imgs'])
        # long document: 30 pages of paragraphs
        await page.evaluate("""() => { __Q.newFromTemplate('blank'); const ed = document.getElementById('editor'); let h = '';
          for (let i = 0; i < 160; i++) h += '<p>Paragraph ' + (i + 1) + '. ' + 'The quick brown fox jumps over the lazy dog while the committee reviews the quarterly budget and the procurement plan for next year. '.repeat(3) + '</p>';
          ed.innerHTML = h; __Q.Layout.full(); }""")
        await page.wait_for_timeout(500)
        t = await page.evaluate("""async () => { const t0 = performance.now(); const pages = await __Q.renderPagesForPdf({ scale: 2 }); const t1 = performance.now(); const blob = await __Q.buildPdf(pages, { title: 'Long' }); return { pages: pages.length, ms: Math.round(t1 - t0), kb: Math.round(blob.size / 1024) }; }""")
        print('long doc', t)
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
