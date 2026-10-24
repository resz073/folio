import asyncio, sys, base64, json
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000, mock_caps=True)
        await load(page)
        await page.wait_for_timeout(500)
        st = await page.evaluate("() => ({ cloud: __Q.Store.cloud, uid: __Q.Cap.uid, name: __Q.Cap.name, badge: (document.getElementById('storeBadge') || {}).textContent || '' })")
        print('store', st)
        # type and autosave
        await page.evaluate("() => __Q.newFromTemplate('letter')")
        await page.wait_for_timeout(200)
        await page.click('#editor p')
        await page.keyboard.press('End')
        await page.keyboard.type(' Added by the test.')
        await page.wait_for_timeout(1800)
        r = await page.evaluate("""() => { const keys = Array.from(window.__mockStore.keys()); return { keys: keys.length, docs: keys.filter(k => /docs\\/[^/]+$/.test(k)), chunks: keys.filter(k => k.includes('/chunks/')).length, state: document.getElementById('saveState').textContent }; }""")
        print('saved', r)
        # big document with pictures goes over the 256 KiB doc limit and must be chunked
        await page.evaluate("""async () => {
          const cv = document.createElement('canvas'); cv.width = 900; cv.height = 600; const x = cv.getContext('2d');
          for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${i % 360},70%,${30 + (i % 40)}%)`; x.fillRect(Math.random() * 900, Math.random() * 600, 12, 12); }
          const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
          const p = document.querySelector('#editor p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
          await __Q.Images.insertFiles([new File([blob], 'noise.png', { type: 'image/png' })]);
        }""")
        await page.wait_for_timeout(2200)
        r2 = await page.evaluate("""() => { const log = window.__capLog.filter(l => l[0] === 'set'); const max = Math.max(...log.map(l => l[2])); const id = __Q.S.doc.id; return { writes: log.length, maxDoc: max, state: document.getElementById('saveState').textContent, id, htmlLen: __Q.S.editor.innerHTML.length }; }""")
        print('chunked', r2)
        # reload from the cloud store
        r3 = await page.evaluate("""async (id) => { const d = await __Q.CloudStore.load(id); const list = await __Q.CloudStore.list(); return { title: d.title, html: d.html.length, imgs: (d.html.match(/<img/g) || []).length, damaged: !!d._damaged, listed: list.map(x => x.title) }; }""", r2['id'])
        print('reloaded', r3)
        # open another doc, then reopen the stored one
        await page.evaluate("() => __Q.newFromTemplate('memo')")
        await page.wait_for_timeout(1600)
        await page.evaluate("(id) => __Q.openStored(id)", r2['id'])
        await page.wait_for_timeout(400)
        r4 = await page.evaluate("() => ({ title: __Q.S.doc.title, text: document.getElementById('editor').textContent.includes('Added by the test.'), imgs: document.querySelectorAll('#editor img').length })")
        print('reopened', r4)
        # exports through the downloads capability
        await page.evaluate("() => __Q.Files.export('docx')")
        await page.evaluate("() => __Q.Files.export('pdf', { scale: 2 })")
        await page.evaluate("() => __Q.Files.export('md')")
        await page.evaluate("() => { window.__declineNextSave = true; return __Q.Files.export('txt'); }")
        await page.wait_for_timeout(300)
        saved = await page.evaluate("() => window.__saved.map(s => ({ filename: s.filename, size: s.size }))")
        print('downloads', saved)
        pdf = await page.evaluate("() => window.__saved.find(s => s.filename.endsWith('.pdf')).b64")
        open('shots/test4.pdf', 'wb').write(base64.b64decode(pdf))
        toasts = await page.evaluate("() => Array.from(document.querySelectorAll('#toastRoot *')).map(t => t.textContent).filter(Boolean)")
        print('toasts', toasts[-3:])
        # Claude assistant: rewrite the first paragraph
        await page.evaluate("() => { window.__sampleReply = 'I am writing to confirm the **delivery** schedule.'; }")
        await page.evaluate("() => { const p = document.querySelectorAll('#editor p')[3]; const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r); }")
        await page.evaluate("() => { __Q.Assistant.init(); __Q.Assistant.capture(); return __Q.Assistant.run('formal'); }")
        await page.wait_for_timeout(300)
        out = await page.evaluate("() => document.getElementById('asstOut').innerHTML")
        await page.evaluate("() => __Q.Assistant.apply('replace')")
        p3 = await page.evaluate("() => document.querySelectorAll('#editor p')[3].innerHTML")
        print('assistant out', out, '| applied:', p3)
        print('prompt starts:', (await page.evaluate("() => window.__lastPrompt")).split('\n')[0][:120])
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
