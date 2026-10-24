import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=860, mock_caps=True)
        await load(page)
        await page.evaluate("() => __Q.newFromTemplate('welcome')")
        await page.wait_for_timeout(400)
        await page.screenshot(path='shots/ui/folio-home.png', clip={'x': 0, 'y': 0, 'width': 1366, 'height': 420})
        await page.evaluate("() => __Q.Backstage.open('home')"); await page.wait_for_timeout(250)
        await page.screenshot(path='shots/ui/folio-bs.png', clip={'x': 0, 'y': 0, 'width': 700, 'height': 260})
        print('title:', await page.title())
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
