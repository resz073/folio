import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *
from PIL import Image

async def shot(page, name):
    await page.wait_for_timeout(250)
    await page.screenshot(path=f'shots/ui/{name}.png')

async def esc(page):
    await page.keyboard.press('Escape'); await page.wait_for_timeout(120)

async def run(p, dark, w, h, tag):
    b, page, errors = await new_page(p, width=w, height=h, dark=dark, mock_caps=True)
    await load(page)
    await page.evaluate("() => __Q.newFromTemplate('welcome')")
    await page.wait_for_timeout(400)
    await shot(page, f'{tag}-home')
    for tab in ['insert', 'layout', 'references', 'review', 'view', 'claude']:
        await page.evaluate("(t) => __Q.UI.selectTab(t)", tab)
        await shot(page, f'{tag}-tab-{tab}')
    await page.evaluate("() => __Q.UI.selectTab('home')")
    # table and picture context tabs
    await page.evaluate("() => { const td = document.querySelector('#editor td'); const r = document.createRange(); r.setStart(td.firstChild || td, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); }")
    await page.wait_for_timeout(200)
    await shot(page, f'{tag}-tab-table')
    # dialogs
    for d in ['font', 'paragraph', 'pageSetup', 'insertTable', 'insertField', 'link', 'headerFooter', 'watermark', 'wordCount', 'shortcuts', 'saveQuickPart', 'manageQuickParts']:
        await page.evaluate("() => { const p = document.querySelector('#editor p'); const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); }")
        await page.evaluate("(d) => __Q.Dialogs[d]()", d)
        await shot(page, f'{tag}-dlg-{d}')
        await esc(page)
    # backstage
    for pg in ['home', 'new', 'open', 'info', 'copy', 'export', 'options']:
        await page.evaluate("(pg) => __Q.Backstage.open(pg)", pg)
        await shot(page, f'{tag}-bs-{pg}')
    await page.evaluate("() => __Q.Backstage.close()")
    # panes
    for pane in ['comments', 'fields', 'assistant']:
        await page.evaluate("(p) => __Q.openPane(p)", pane)
        await shot(page, f'{tag}-pane-{pane}')
    await page.evaluate("() => __Q.closePane()")
    # find panel, menus
    await page.evaluate("() => __Q.Find.open(true, 'Folio')"); await shot(page, f'{tag}-find'); await page.evaluate("() => __Q.Find.close()")
    errs = [e for e in errors]
    await b.close()
    return errs

async def main():
    async with async_playwright() as p:
        for dark, w, h, tag in [(False, 1366, 860, 'lt'), (True, 1366, 860, 'dk'), (False, 400, 820, 'ph')]:
            errs = await run(p, dark, w, h, tag)
            print(tag, 'errors:', errs[:5])
asyncio.run(main())
