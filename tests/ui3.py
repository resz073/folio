import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *
async def drag(page, k, dx):
    box = await page.evaluate("(k) => { const el = document.querySelector(`#rulerMarks [data-k=\"${k}\"]`); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }", k)
    await page.mouse.move(box['x'], box['y']); await page.mouse.down()
    for i in range(1, 6): await page.mouse.move(box['x'] + dx * i / 5, box['y'])
    await page.mouse.up(); await page.wait_for_timeout(200)
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=860)
        await load(page)
        await page.evaluate("() => { __Q.newFromTemplate('welcome'); __Q.setZoom(1); }")
        await page.wait_for_timeout(300)
        await page.evaluate("() => { const p = document.querySelectorAll('#editor p')[2]; const r = document.createRange(); r.setStart(p.firstChild, 2); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); }")
        await page.wait_for_timeout(150)
        await drag(page, 'left', 48)
        st1 = await page.evaluate("() => document.querySelectorAll('#editor p')[2].getAttribute('style')")
        await drag(page, 'first', 24)
        st2 = await page.evaluate("() => document.querySelectorAll('#editor p')[2].getAttribute('style')")
        await drag(page, 'right', -48)
        st3 = await page.evaluate("() => document.querySelectorAll('#editor p')[2].getAttribute('style')")
        await drag(page, 'ml', 24)
        ml = await page.evaluate("() => __Q.S.doc.page.ml")
        print('left indent:', st1, '| first line:', st2, '| right:', st3, '| page left margin px:', ml)
        # views and zoom
        for v in ['web', 'read', 'focus', 'print']:
            await page.evaluate("(v) => __Q.setView(v)", v); await page.wait_for_timeout(200)
            await page.screenshot(path=f'shots/ui/view-{v}.png')
        await page.evaluate("() => __Q.setZoom(1.5)"); await page.wait_for_timeout(150)
        z = await page.evaluate("() => [__Q.S.zoom, document.getElementById('zoomLabel').textContent]")
        print('zoom', z)
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
