import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=860)
        await load(page)
        await page.evaluate("() => __Q.newFromTemplate('leave-bn')")
        await page.wait_for_timeout(300)
        await page.click('#editor')
        await page.keyboard.press('F12')
        await page.evaluate("() => __Q.openPane('fields')")
        await page.wait_for_timeout(200)
        names = await page.evaluate("() => Array.from(document.querySelectorAll('.fields-list .flabel')).map(l => l.textContent)")
        print('fields:', names)
        sel = '.fields-list input[aria-label="আপনার নাম"]'
        await page.click(sel)
        await page.keyboard.type('rohim uddin')
        v = await page.input_value(sel)
        await page.keyboard.press('Enter')
        await page.wait_for_timeout(200)
        print('typed in field box:', v, '| in doc:', await page.evaluate("() => document.getElementById('editor').textContent.includes('রহিম উদ্দিন')"))
        # numeric dialog fields stay English
        await page.evaluate("() => __Q.Dialogs.pageSetup()")
        await page.wait_for_timeout(150)
        await page.fill('#psTop', '')
        await page.click('#psTop')
        await page.keyboard.type('1.25')
        print('margin box:', await page.input_value('#psTop'))
        await page.keyboard.press('Escape')
        # document title
        await page.click('#docTitle')
        await page.keyboard.press('Control+a')
        await page.keyboard.type('chhuTir abedon')
        print('title box:', await page.input_value('#docTitle'))
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
