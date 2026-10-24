import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *
TXT = "() => document.getElementById('editor').firstElementChild.textContent"
async def fresh(page):
    await page.evaluate("() => { __Q.newFromTemplate('blank'); }")
    await page.wait_for_timeout(150)
    await page.click('#editor')
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=860)
        await load(page)
        await fresh(page)
        await page.keyboard.press('F12')
        await page.wait_for_timeout(100)
        print('avro on:', await page.evaluate("() => [__Q.S.avro, document.getElementById('sbAvro').textContent]"))
        await page.keyboard.type('ami banglay gan gai. tumi kemon acho?')
        print('typed     :', await page.evaluate(TXT))
        await page.keyboard.press('Enter')
        await page.keyboard.type('korrmo')
        pv = await page.evaluate("() => { const p = document.querySelector('.avro-pv'); return p ? p.textContent : null; }")
        await page.screenshot(path='shots/avro-typing.png', clip={'x': 250, 'y': 200, 'width': 700, 'height': 200})
        await page.keyboard.press('Backspace')
        t1 = await page.evaluate("() => document.getElementById('editor').children[1].textContent")
        await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace')
        t2 = await page.evaluate("() => document.getElementById('editor').children[1].textContent")
        print('preview:', pv, '| after 1 backspace:', t1, '| after 3:', t2)
        # undo the whole thing step by step
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(50)
        print('after undo:', await page.evaluate("() => document.getElementById('editor').textContent"))
        # English when off
        await page.keyboard.press('F12')
        await page.keyboard.type(' plain English')
        print('off again :', await page.evaluate("() => document.getElementById('editor').textContent"))
        # track changes + avro
        await fresh(page)
        await page.evaluate("() => __Q.Track.toggle()")
        await page.keyboard.press('F12')
        await page.keyboard.type('bangla bhasha')
        print('tracked   :', await page.evaluate("() => document.getElementById('editor').firstElementChild.innerHTML"))
        await page.evaluate("() => __Q.Track.toggle()")
        # typing in the middle of English text, then clicking away commits
        await fresh(page)
        await page.keyboard.press('F12')  # now off
        await page.keyboard.type('Name: ')
        await page.keyboard.press('F12')  # on
        await page.keyboard.type('rohim')
        await page.keyboard.press('Home')
        await page.keyboard.type('x')
        print('mixed     :', await page.evaluate(TXT))
        print('pref saved:', await page.evaluate("() => __Q.Prefs.avro"))
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
