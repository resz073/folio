import asyncio, sys, json, base64
sys.path.insert(0, 'tests')
from harness import *

GET_DOCX = """async () => { const blob = await __Q.buildDocx(); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); }"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p)
        await load(page)
        await page.evaluate("() => __Q.newFromTemplate('welcome')")
        await page.wait_for_timeout(200)
        # insert an image after the first paragraph
        await page.evaluate("""async () => {
          const cv = document.createElement('canvas'); cv.width = 400; cv.height = 200; const x = cv.getContext('2d');
          x.fillStyle = '#1d6a50'; x.fillRect(0, 0, 400, 200); x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.fillText('Chart', 130, 115);
          const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
          const file = new File([blob], 'chart.png', { type: 'image/png' });
          const p = document.querySelectorAll('#editor p')[2];
          const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
          await __Q.Images.insertFiles([file]);
        }""")
        await page.wait_for_timeout(300)
        # comment on "Start writing" heading word
        await page.evaluate("""() => { const h = document.querySelector('#editor h1'); const r = document.createRange(); r.selectNodeContents(h); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Comments.add(); }""")
        await page.keyboard.type('Please expand this section.')
        await page.keyboard.press('Control+Enter')
        # tracked change: turn on, type in second paragraph
        await page.evaluate("() => { __Q.Track.toggle(); const p = document.querySelectorAll('#editor p')[2]; const r = document.createRange(); r.setStart(p.firstChild, 5); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); }")
        await page.keyboard.type('really ')
        await page.keyboard.press('Backspace')
        await page.keyboard.press('Backspace')
        for _ in range(3): await page.keyboard.press('Delete')
        await page.evaluate("() => __Q.Track.toggle()")
        tc = await page.evaluate("() => [...document.querySelectorAll('#editor ins.tc, #editor del.tc')].map(e => e.tagName + ':' + e.textContent)")
        print('tracked:', tc)
        # header, watermark
        await page.evaluate("() => { const d = __Q.S.doc; d.header = { l: 'Folio', c: '', r: '{DATE}' }; __Q.setWatermark({ text: 'DRAFT', color: '#c0c0c0', opacity: 0.4 }); __Q.renderSheets(); }")
        await page.wait_for_timeout(200)
        await page.screenshot(path='shots/05-welcome-edit.png')
        b64 = await page.evaluate(GET_DOCX)
        open('shots/test2.docx', 'wb').write(base64.b64decode(b64))
        # re-import
        res = await page.evaluate("""async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = await __Q.readDocxFile(u.buffer); return { html: r.html.slice(0, 3000), settings: JSON.stringify(r.settings).slice(0, 1500), imgs: (r.html.match(/<img/g) || []).length, cmts: (r.html.match(/class="cmt"/g) || []).length, ins: (r.html.match(/<ins/g) || []).length, del: (r.html.match(/<del/g) || []).length }; }""", b64)
        print('IMPORT html:', res['html'][:1800])
        print('IMPORT settings:', res['settings'])
        print('imgs', res['imgs'], 'cmts', res['cmts'], 'ins', res['ins'], 'del', res['del'])
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
