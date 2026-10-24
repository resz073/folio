import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        for dark in (False, True):
            b, page, errors = await new_page(p, width=1366, height=860, dark=dark)
            await load(page)
            await page.evaluate("() => __Q.newFromTemplate('leave-bn')")
            await page.wait_for_timeout(300)
            await page.evaluate("() => __Q.UI.selectTab('review')")
            await page.keyboard.press('F12')
            await page.wait_for_timeout(200)
            t = 'dk' if dark else 'lt'
            await page.screenshot(path=f'shots/ui/{t}-review-bn.png', clip={'x': 0, 'y': 0, 'width': 1366, 'height': 180})
            await page.screenshot(path=f'shots/ui/{t}-status.png', clip={'x': 0, 'y': 830, 'width': 700, 'height': 30})
            await page.evaluate("() => __Q.Backstage.open('options')")
            await page.wait_for_timeout(250)
            await page.screenshot(path=f'shots/ui/{t}-options-bn.png', clip={'x': 220, 'y': 0, 'width': 760, 'height': 860})
            for e in errors: print('ERR', e)
            await b.close()
asyncio.run(main())
