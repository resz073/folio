import asyncio, sys, json
sys.path.insert(0, 'tests')
from harness import *

PARA = ("Folio lays out text on real pages, so a long report should break between lines exactly where the page ends, "
        "keeping at least two lines together at the bottom and the top of each page. This paragraph is long enough to wrap "
        "across several lines at the default A4 width with one inch margins, which makes it a good test of splitting.")

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p)
        await load(page)
        await page.add_script_tag(path='tests/checks.js')
        # 1. blank doc and typing
        await page.evaluate("() => __Q.newFromTemplate('blank')")
        await page.click('#editor')
        await page.keyboard.type('Hello world')
        txt = await page.evaluate("() => document.getElementById('editor').textContent")
        print('typed:', repr(txt))
        # select word "world" and bold it
        await page.keyboard.down('Shift')
        for _ in range(5): await page.keyboard.press('ArrowLeft')
        await page.keyboard.up('Shift')
        await page.keyboard.press('Control+b')
        html = await page.evaluate("() => __Q.cleanHTML()")
        print('after bold:', html)
        await page.keyboard.press('Control+z')
        await page.wait_for_timeout(50)
        print('after undo:', await page.evaluate("() => __Q.cleanHTML()"))
        await page.keyboard.press('Control+y')
        print('after redo:', await page.evaluate("() => __Q.cleanHTML()"))
        # 2. long document pagination
        await page.evaluate("""(para) => {
          const parts = [];
          for (let i = 0; i < 40; i++) {
            if (i % 7 === 0) parts.push('<h1>Section ' + (i/7+1) + '</h1>');
            parts.push('<p>' + (i+1) + '. ' + para + (i % 3 === 0 ? ' ' + para : '') + '</p>');
            if (i % 9 === 4) parts.push('<ul><li>First point</li><li>Second point that is a bit longer than the first one</li><li>Third point</li></ul>');
          }
          const m = __Q.newDocModel({ title: 'Pagination test', html: parts.join('') });
          __Q.openDoc(m, { fresh: true });
        }""", PARA)
        await page.wait_for_timeout(300)
        res = await page.evaluate("() => __checkPages()")
        print('pagination:', json.dumps(res)[:1500])
        lines = await page.evaluate("() => document.querySelectorAll('span.pg-line').length")
        pushes = await page.evaluate("() => document.querySelectorAll('[data-pgp]').length")
        print('splits', lines, 'pushes', pushes, 'layout ms', await page.evaluate("() => __Q.S.lastLayoutMs"))
        await page.screenshot(path='shots/02-long.png')
        # scroll to page 2 boundary for visual check
        await page.evaluate("() => { const c = document.getElementById('canvas'); const g = __Q.geom(); c.scrollTop = (g.h + __Q.GAP) * __Q.S.zoom - 300; }")
        await page.wait_for_timeout(100)
        await page.screenshot(path='shots/03-boundary.png')
        # 3. typing in the middle of page 1 keeps pages valid
        await page.evaluate("() => { const p = document.querySelectorAll('#editor p')[2]; const r = document.createRange(); r.setStart(p.firstChild, 5); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('editor').focus(); }")
        await page.keyboard.type(' extra words to push the text down a line or two and force pages to reflow nicely ' * 2)
        await page.wait_for_timeout(200)
        res2 = await page.evaluate("() => __checkPages()")
        print('after typing:', json.dumps(res2)[:800])
        # 4. A page break
        await page.keyboard.press('Control+Enter')
        await page.wait_for_timeout(100)
        res3 = await page.evaluate("() => __checkPages()")
        print('after page break (100ms):', res3['nbad'])
        await page.wait_for_timeout(800)
        res3 = await page.evaluate("() => __checkPages()")
        print('after page break (900ms):', json.dumps(res3)[:900])
        res4 = await page.evaluate("() => { __Q.Layout.full(); return __checkPages(); }")
        print('after full layout:', json.dumps(res4)[:900])
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
