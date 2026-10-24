"""AutoFit: contents, window and fixed column widths; undo; Word export and import; the
Table Design button and its menu."""
import asyncio, sys, json, base64, zipfile, io, re
sys.path.insert(0, 'tests')
from harness import *
from tbl1 import HELPERS, step

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000)
        await load(page)
        await page.evaluate("() => __Q.openDoc(__Q.newDocModel({ title: 'AutoFit', html: '<p>Intro</p><p><br></p><p>After</p>' }))")
        await page.wait_for_timeout(200)
        await page.evaluate(HELPERS)
        await page.evaluate("""() => { const p = document.querySelectorAll('#editor p')[1]; const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r);
          __Q.Tables.insert(2, 3); __Q.change(() => { const t = T.tbl(); const G = __Q.Tables.grid(t);
            const txt = [['No.', 'Description', 'Amount'], ['1', 'Printing paper for the office, eighty reams', '৳১,২০০']];
            G.rows.forEach((r, i) => Array.from(r.cells).forEach((c, j) => { c.querySelector('p').textContent = txt[i][j]; })); }, { full: true }); }""")
        await page.wait_for_timeout(100)
        W = "() => { const t = T.tbl(); const G = __Q.Tables.grid(t); return { mode: __Q.Tables.fitMode(t), fit: t.getAttribute('data-fit'), layout: getComputedStyle(t).tableLayout, width: t.style.width, tw: Math.round(t.offsetWidth), cols: Array.from(G.rows[1].cells).map(c => Math.round(c.offsetWidth)), cg: (t.querySelector(':scope > colgroup') || { children: [] }).children.length }; }"
        await step(page, 'new table', W)
        await page.evaluate("() => T.caret(T.cell(T.tbl(), 0, 0))")
        await step(page, 'autofit contents', "async () => { __Q.Tables.autofit('contents'); await new Promise(r => setTimeout(r, 60)); return (" + W + ")(); }")
        await step(page, 'type in col 1 (grows)', "async () => { __Q.change(() => { T.cell(T.tbl(), 1, 0).querySelector('p').textContent = '1 (one hundred and one)'; }, { full: true }); await new Promise(r => setTimeout(r, 60)); return (" + W + ")(); }")
        await step(page, 'fixed', "async () => { T.caret(T.cell(T.tbl(), 0, 0)); __Q.Tables.autofit('fixed'); await new Promise(r => setTimeout(r, 60)); return (" + W + ")(); }")
        await step(page, 'type more (stays)', "async () => { __Q.change(() => { T.cell(T.tbl(), 1, 0).querySelector('p').textContent = '1 (one hundred and one, and a much longer note that wraps)'; }, { full: true }); await new Promise(r => setTimeout(r, 60)); return (" + W + ")(); }")
        await step(page, 'window', "async () => { T.caret(T.cell(T.tbl(), 0, 0)); __Q.Tables.autofit('window'); await new Promise(r => setTimeout(r, 60)); return (" + W + ")(); }")
        await step(page, 'undo -> fixed', "async () => { __Q.undo(); await new Promise(r => setTimeout(r, 60)); return (" + W + ")(); }")
        await step(page, 'redo -> window', "async () => { __Q.redo(); await new Promise(r => setTimeout(r, 60)); return (" + W + ")(); }")
        # Word export / import of each mode
        for mode in ['contents', 'window', 'fixed']:
            r = await page.evaluate("""async (mode) => { T.caret(T.cell(T.tbl(), 0, 0)); __Q.Tables.autofit(mode); await new Promise(r => setTimeout(r, 60));
              const blob = await __Q.buildDocx(); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
              const back = await __Q.readDocxFile(u.buffer); const box = document.createElement('div'); box.innerHTML = back.html; const t = box.querySelector('table');
              return { b64: btoa(s), back: t ? { fit: t.getAttribute('data-fit'), layout: t.style.tableLayout, width: t.style.width, cg: t.querySelector('colgroup') ? Array.from(t.querySelector('colgroup').children).map(c => c.style.width) : null } : null }; }""", mode)
            z = zipfile.ZipFile(io.BytesIO(base64.b64decode(r['b64'])))
            xml = z.read('word/document.xml').decode()
            tbl = xml[xml.index('<w:tbl>'):xml.index('</w:tblPr>')]
            tcw = re.findall(r'<w:tcW [^>]*/>', xml)[:3]
            print(mode, 'docx:', re.findall(r'<w:tblW [^>]*/>|<w:tblLayout [^>]*/>', tbl), tcw, '| reimported:', json.dumps(r['back']))
        # the ribbon button and menu
        await page.evaluate("() => { T.caret(T.cell(T.tbl(), 0, 0)); __Q.Tables.autofit('contents'); __Q.UI.selectTab('tdesign'); }")
        await page.wait_for_timeout(300)
        btn = page.locator('#ribbon [data-menu="autofit"], #ribbon button:has-text("AutoFit")').first
        print('button visible:', await btn.is_visible())
        await btn.click()
        await page.wait_for_timeout(200)
        items = await page.evaluate("() => Array.from(document.querySelectorAll('.pop .mi')).map(b => b.textContent.trim() + (b.getAttribute('aria-checked') === 'true' ? ' [x]' : ''))")
        print('menu:', items)
        await page.screenshot(path='shots/tbl4-menu.png', clip={'x': 0, 'y': 0, 'width': 1400, 'height': 420})
        await page.locator('.pop .mi:has-text("Fixed Column Width")').click()
        await page.wait_for_timeout(200)
        print('after menu click:', await page.evaluate(W))
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
