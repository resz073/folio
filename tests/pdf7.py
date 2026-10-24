"""Export messages: a font installed only on this computer is named in a message whose
button reads the font from the computer (Local Font Access) or asks for the file."""
import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        for grant in (False, True):
            b, page, errors = await new_page(p, width=1300, height=900, mock_caps=True, gfonts=True)
            if grant:
                try: await page.context.grant_permissions(['local-fonts'], origin='http://localhost:8765')
                except Exception as e: print('grant failed:', str(e)[:120])
            await load(page)
            await page.evaluate("(html) => __Q.openDoc(__Q.newDocModel({ title: 'Local', html }))", "<p style=\"font-family:'DejaVu Serif'\">Only on this computer.</p><p>Calibri text.</p>")
            await page.wait_for_timeout(500)
            await page.evaluate("() => __Q.Files.export('pdf')")
            await page.wait_for_timeout(500)
            toasts = await page.evaluate("() => Array.from(document.querySelectorAll('#toastRoot .toast, #toastRoot > *')).map(t => t.textContent)")
            print('grant' if grant else 'no grant', '| toasts:', [t[:140] for t in toasts if 'pictures' in t or 'Saved' in t][-2:])
            btn = page.locator('#toastRoot button:has-text("Add font")')
            if await btn.count():
                await btn.first.click()
                await page.wait_for_timeout(2500)
                after = await page.evaluate("() => ({ fonts: __Q.UserFonts.list.map(f => f.family + ' ' + f.weight + (f.italic ? 'i' : '')), toasts: Array.from(document.querySelectorAll('#toastRoot > *')).map(t => t.textContent.slice(0, 120)) })")
                print('   after click:', after)
                if after['fonts']:
                    st = await page.evaluate("async () => (await __Q.buildVectorPdf({ title: 'Local' })).stats")
                    print('   export again:', {'pictureWords': st['pictureWords'], 'localOnly': st['localOnly']})
            for e in errors: print('ERR', e)
            await b.close()
asyncio.run(main())
