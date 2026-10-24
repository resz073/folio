import asyncio, sys, base64
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=860, mock_caps=True)
        await load(page)
        await page.wait_for_timeout(300)
        await page.evaluate("() => __Q.newFromTemplate('leave-bn')")
        await page.wait_for_timeout(300)
        await page.evaluate("""async () => { const buf = await (await fetch('/tests/fixtures/FreeSerif.ttf')).arrayBuffer(); await __Q.UserFonts.addFiles([new File([buf], 'FreeSerif.ttf')]); __Q.setDocBnFont('FreeSerif', true); }""")
        await page.wait_for_timeout(500)
        r = await page.evaluate("""async () => { const pages = await __Q.renderPagesForPdf({ scale: 2 }); const blob = await __Q.buildPdf(pages, { title: 'bn' }); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        open('shots/t-bn-font.pdf', 'wb').write(base64.b64decode(r))
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
