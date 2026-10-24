import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p)
        await load(page)
        await page.wait_for_timeout(800)
        await page.screenshot(path='shots/01-initial.png')
        info = await page.evaluate('''() => ({
            pages: document.querySelectorAll('#sheets .sheet').length,
            title: document.querySelector('#docTitle').value,
            words: document.querySelector('#sbWords').textContent,
            page: document.querySelector('#sbPage').textContent,
            store: document.querySelector('#saveState').textContent,
            edH: document.querySelector('#editor').offsetHeight,
            pushes: document.querySelectorAll('[data-pgp]').length,
            lines: document.querySelectorAll('span.pg-line').length,
        })''')
        print(info)
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
