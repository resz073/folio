import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        for dark in (True, False):
            b, page, errors = await new_page(p, width=1366, height=860, dark=dark, mock_caps=True)
            await load(page)
            await page.evaluate("() => __Q.newFromTemplate('letter')")
            await page.wait_for_timeout(400)
            t = 'dk' if dark else 'lt'
            await page.screenshot(path=f'shots/ui/{t}2-home.png', clip={'x': 0, 'y': 0, 'width': 1366, 'height': 200})
            await page.evaluate("() => __Q.Backstage.open('home')")
            await page.wait_for_timeout(250)
            await page.screenshot(path=f'shots/ui/{t}2-bs.png', clip={'x': 0, 'y': 0, 'width': 700, 'height': 400})
            for e in errors: print('ERR', e)
            await b.close()
asyncio.run(main())
