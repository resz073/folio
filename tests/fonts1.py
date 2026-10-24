import asyncio, sys, base64, zipfile, io
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=860, mock_caps=True)
        await load(page)
        await page.wait_for_timeout(400)
        r = await page.evaluate("() => ({ sutonny: __Q.fontAvailable('SutonnyOMJ'), docBn: __Q.docBnFont(), stack: getComputedStyle(document.getElementById('paper')).getPropertyValue('--doc-bn') })")
        print('before:', r)
        # positive detection path: FreeSans is installed here and has Bangla letters
        print('FreeSans detected:', await page.evaluate("() => { __Q.FONTS.push({ n: 'FreeSans', local: true, cat: 'Bangla', alt: [], gen: 'sans-serif' }); const m = {}; return (window.__fa = __Q.fontAvailable)('FreeSans'); }"))
        # add a font file (FreeSerif stands in for SutonnyOMJ: both are TrueType with Bangla)
        for fn in ['FreeSerif.ttf', 'Carlito-Regular.ttf']:
            await page.evaluate("""async (fn) => { const buf = await (await fetch('/tests/fixtures/' + fn)).arrayBuffer(); await __Q.UserFonts.addFiles([new File([buf], fn)]); }""", fn)
            await page.wait_for_timeout(200)
        toasts = await page.evaluate("() => Array.from(document.querySelectorAll('#toastRoot .toast')).map(t => t.textContent)")
        print('toasts:', toasts)
        info = await page.evaluate("() => __Q.UserFonts.list.map(f => [f.family, f.weight, f.italic, f.size, f.bangla])")
        print('user fonts:', info)
        stored = await page.evaluate("""() => { const keys = Array.from(window.__mockStore.keys()).filter(k => k.includes('/fonts/')); return keys.map(k => k.replace(/^.*\\/fonts\\//, '') + ' ' + JSON.stringify(window.__mockStore.get(k)).length); }""")
        print('stored docs:', stored)
        # reload bytes from storage and compare
        rt = await page.evaluate("""async () => { const st = await __Q.UserFonts.store(); const metas = await st.list(); const out = []; for (const m of metas) { const bytes = await st.load(m); out.push([m.family, m.parts, bytes.length, m.size]); } return out; }""")
        print('round trip:', rt)
        # use it for Bangla text
        await page.evaluate("() => __Q.setDocBnFont('FreeSerif', true)")
        await page.wait_for_timeout(300)
        r2 = await page.evaluate("() => { const p = document.querySelector('#editor p'); const bn = document.createElement('p'); bn.textContent = 'Office letter: আমাদের অফিসের জন্য একটি চিঠি'; p.before(bn); const rg = document.createRange(); const t = bn.firstChild; rg.setStart(t, 17); rg.setEnd(t, 21); return { docBn: __Q.docBnFont(), pref: __Q.Prefs.bnFont, bnVar: getComputedStyle(document.getElementById('paper')).getPropertyValue('--doc-bn'), ff: getComputedStyle(bn).fontFamily }; }")
        print('after setDocBnFont:', r2)
        # docx carries the Bangla font as the complex-script font
        b64 = await page.evaluate("""async () => { const blob = await __Q.buildDocx(); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64)))
        st = z.read('word/styles.xml').decode()
        import re
        print('docx defaults rFonts:', re.search(r'<w:rPrDefault><w:rPr>(<w:rFonts[^>]*>)', st).group(1))
        # undo restores the old Bangla font
        await page.evaluate("() => { __Q.undo(); }")
        print('after undo docBn:', await page.evaluate("() => __Q.docBnFont()"))
        # font menu screenshot
        await page.click('#fontName + .drop')
        await page.wait_for_timeout(200)
        await page.evaluate("() => { const pop = document.querySelector('.pop.font-list'); pop.scrollTop = pop.scrollHeight; }")
        await page.wait_for_timeout(100)
        await page.screenshot(path='shots/font-menu.png', clip={'x': 200, 'y': 80, 'width': 420, 'height': 700})
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
