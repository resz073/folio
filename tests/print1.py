"""File › Print, like Word's print screen: Ctrl+P opens it with a preview of the pages; page
navigation; All / Current / Custom pages with Word's page box and its errors; copies collated
and uncollated; one or two sides (a blank back so each copy starts on its own sheet);
orientation, paper and margins change the document (undoable); the PDF made for printing:
the right pages in order, repeated pages sharing their content, actual size, the sides as a
print preference, and the script that opens the print dialog (or not); a declined download;
read-only documents; the picture PDF's blank pages."""
import asyncio, sys, json, base64, io
sys.path.insert(0, 'tests')
from harness import *
from pypdf import PdfReader

fails = []
def ok(cond, what, got=None):
    print(('  ok   ' if cond else '  FAIL ') + what + ('' if cond or got is None else '  -> ' + json.dumps(got, ensure_ascii=False)))
    if not cond: fails.append(what)

HTML = '<hr class="pb">'.join(f'<p>MARK-{n} on its own page.</p><p>Some more text for page {n}.</p>' for n in range(1, 6))
WHERE = "() => document.querySelector('.pr-where') ? document.querySelector('.pr-where').textContent : null"

def marks(reader):
    out = []
    for pg in reader.pages:
        t = pg.extract_text() or ''
        m = [w for w in t.replace('\n', ' ').split() if w.startswith('MARK-')]
        out.append(m[0] if m else '')
    return out

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=820, mock_caps=True, gfonts=True)
        await load(page)
        await page.evaluate("h => __Q.openDoc(__Q.newDocModel({ title: 'Print test', html: h }))", HTML)
        await page.wait_for_timeout(1200)
        st = lambda js, *a: page.evaluate(js, *a)
        ok(await st("() => __Q.S.pages") == 5, 'the document has five pages')
        # the caret on page 4
        await st("() => { const p = [...document.querySelectorAll('#editor p')].find(p => p.textContent.startsWith('MARK-4')); const r = document.createRange(); r.setStart(p.firstChild, 2); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); }")
        await page.wait_for_timeout(300)

        print('1. the print screen')
        await page.keyboard.press('Control+p')
        await page.wait_for_timeout(1500)
        info = await st("() => ({ open: !document.getElementById('backstage').hidden, page: __Q.Backstage.page, canvas: !!document.querySelector('.pr-stage canvas'), focus: document.activeElement && document.activeElement.classList.contains('pr-btn') })")
        ok(info == {'open': True, 'page': 'print', 'canvas': True, 'focus': True}, 'Ctrl+P opens File › Print with the preview, the Print button ready for Enter', info)
        ok((await st(WHERE)).startswith('1 of 5'), 'the preview starts at page 1 of 5', await st(WHERE))
        cv = await st("() => { const c = document.querySelector('.pr-stage canvas'); return [c.width, c.height, parseFloat(c.style.width), parseFloat(c.style.height)]; }")
        g = await st("() => { const g = __Q.geom(); return [g.w, g.h]; }")
        ok(abs(cv[2] / cv[3] - g[0] / g[1]) < 0.01 and cv[0] >= cv[2], "the preview page has the paper's shape, drawn sharp", [cv, g])
        await page.click('.pr-nav button[aria-label="Next page"]')
        await page.wait_for_timeout(150)
        ok((await st(WHERE)).startswith('2 of 5'), 'Next page shows page 2', await st(WHERE))
        await page.focus('.pr-stage'); await page.keyboard.press('End'); await page.wait_for_timeout(150)
        ok((await st(WHERE)).startswith('5 of 5'), 'End on the preview shows the last page', await st(WHERE))
        dis = await st("() => [document.querySelector('.pr-nav button[aria-label=\"Next page\"]').disabled, document.querySelector('.pr-nav button[aria-label=\"Previous page\"]').disabled]")
        ok(dis == [True, False], 'at the last page Next is off', dis)
        lab = await st("() => document.querySelector('#prRange').options[1].textContent")
        ok(lab == 'Print Current Page (page 4)', "Print Current Page names the caret's page", lab)

        print('2. which pages')
        await page.select_option('#prRange', 'current'); await page.wait_for_timeout(150)
        ok(await st(WHERE) == '1 of 1  ·  page 4 of the document', 'Current Page previews page 4 alone', await st(WHERE))
        await page.fill('#prPages', '2-3, 5'); await page.wait_for_timeout(150)
        r = await st("() => [document.querySelector('#prRange').value, document.querySelector('.pr-where').textContent, document.querySelector('.pr-btn').disabled]")
        ok(r == ['custom', '1 of 3  ·  page 2 of the document', False], 'typing pages switches to Custom Print and previews those pages', r)
        for bad, want in [('7', 'This document has 5 pages.'), ('2-x', '“2-x” isn’t a page number or a range such as 2-4.')]:
            await page.fill('#prPages', bad); await page.wait_for_timeout(120)
            e = await st("() => [document.getElementById('prErr').textContent, document.querySelector('.pr-btn').disabled]")
            ok(e == [want, True], f'"{bad}" is explained and Print waits', e)
        parsed = await st("() => [__Q.PrintJob.parse('4-2', 5).pages, __Q.PrintJob.parse('3-', 5).pages, __Q.PrintJob.parse('-2, 2, 5', 5).pages, __Q.PrintJob.parse('2-9', 5).pages]")
        ok(parsed == [[1, 2, 3], [2, 3, 4], [0, 1, 4], [1, 2, 3, 4]], 'ranges backwards, open-ended, repeated and past the end', parsed)
        seq = await st("() => [__Q.PrintJob.sequence([0, 1, 2], 2, true, false), __Q.PrintJob.sequence([0, 1, 2], 2, false, false), __Q.PrintJob.sequence([0, 1, 2], 2, true, true), __Q.PrintJob.sequence([0, 1, 2], 2, false, true), __Q.PrintJob.sequence([0, 1, 2], 1, true, true)]")
        ok(seq == [[0, 1, 2, 0, 1, 2], [0, 0, 1, 1, 2, 2], [0, 1, 2, -1, 0, 1, 2], [0, 1, 0, 1, 2, -1, 2], [0, 1, 2]], 'copies: collated, uncollated, and two-sided sheets with blank backs', seq)

        print('3. the PDF for printing')
        await page.fill('#prPages', '2-3'); await page.fill('#prCopies', '2'); await page.locator('#prCopies').dispatch_event('change')
        await page.click('.pr-btn'); await page.wait_for_timeout(2500)
        sv = await st("() => window.__saved.map(s => [s.filename, s.size])")
        ok(len(sv) == 1 and sv[0][0] == 'Print test - print.pdf', 'Print saves “<title> - print.pdf”', sv)
        pdf = PdfReader(io.BytesIO(base64.b64decode(await st("() => window.__saved[0].b64"))))
        ok(marks(pdf) == ['MARK-2', 'MARK-3', 'MARK-2', 'MARK-3'], 'pages 2-3, two copies collated', marks(pdf))
        cat = pdf.trailer['/Root']
        vp = cat['/ViewerPreferences']
        ok(vp.get('/PrintScaling') == '/None' and vp.get('/Duplex') == '/Simplex', 'it asks for actual size and one side', dict(vp))
        oa = cat.get('/OpenAction')
        js = oa.get_object()['/JS'] if oa else None
        ok(js is not None and 'this.print(' in str(js), 'and opens the print dialog when it is opened', str(js))
        c0, c2 = pdf.pages[0].raw_get('/Contents'), pdf.pages[2].raw_get('/Contents')
        ok(c0.idnum == c2.idnum, 'a repeated page shares its content (the file stays small)', [c0.idnum, c2.idnum])
        w, hgt = float(pdf.pages[0].mediabox.width), float(pdf.pages[0].mediabox.height)
        ok(abs(w - g[0] * 0.75) < 0.5 and abs(hgt - g[1] * 0.75) < 0.5, 'pages at the paper size', [w, hgt])
        msg = await st("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')")
        ok('print dialog' in msg, 'a note says to open it and choose the printer', msg)
        ok(await st("() => document.getElementById('backstage').hidden"), 'and Folio goes back to the document, as Word does')
        await page.keyboard.press('Control+p'); await page.wait_for_timeout(1200)

        # uncollated, two-sided, without the script
        ok(await st("() => document.querySelector('#prCopies').value") == '1', 'copies start at 1 again, as in Word')
        await page.select_option('#prCollate', '0')
        await page.select_option('#prSides', 'long')
        await page.fill('#prPages', '1-3')
        await page.fill('#prCopies', '2'); await page.locator('#prCopies').dispatch_event('change')
        await page.click('#prOpen')
        await page.click('.pr-btn'); await page.wait_for_timeout(2500)
        await page.keyboard.press('Control+p'); await page.wait_for_timeout(1200)
        kept = await st("() => [document.querySelector('#prCollate').value, document.querySelector('#prSides').value, document.querySelector('#prOpen').checked, document.querySelector('#prRange').value]")
        ok(kept == ['0', 'long', False, 'all'], 'opened again, it keeps collation, sides and the dialog choice, and starts from all pages', kept)
        pdf = PdfReader(io.BytesIO(base64.b64decode(await st("() => window.__saved[1].b64"))))
        ok(marks(pdf) == ['MARK-1', 'MARK-2', 'MARK-1', 'MARK-2', 'MARK-3', '', 'MARK-3'], 'uncollated two-sided: each sheet twice, page 3 with a blank back', marks(pdf))
        cat = pdf.trailer['/Root']
        ok(cat['/ViewerPreferences'].get('/Duplex') == '/DuplexFlipLongEdge' and cat.get('/OpenAction') is None, 'two-sided long edge, and no script when that box is off', [cat['/ViewerPreferences'].get('/Duplex'), str(cat.get('/OpenAction'))])
        blank = pdf.pages[5]
        ok('/Contents' not in blank and (blank.extract_text() or '') == '', 'the blank back is empty')
        ok(await st("() => __Q.Prefs.printOpen") is False, 'the choice is remembered')
        await st("() => { window.__declineNextSave = true; }")
        await page.click('.pr-btn'); await page.wait_for_timeout(2000)
        msg = await st("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')")
        ok('Download cancelled' in msg and len(await st("() => window.__saved")) == 2 and not await st("() => document.getElementById('backstage').hidden"), 'a declined download just says so and stays on Print', msg)

        print('4. page setup from the print screen')
        await page.select_option('#prOrient', 'landscape'); await page.wait_for_timeout(1500)
        land = await st("() => { const c = document.querySelector('.pr-stage canvas'); return [__Q.S.doc.page.orient, parseFloat(c.style.width) > parseFloat(c.style.height)]; }")
        ok(land == ['landscape', True], 'Landscape turns the document and the preview', land)
        await page.select_option('#prPaper', 'Letter'); await page.wait_for_timeout(1500)
        await page.select_option('#prMargins', 'narrow'); await page.wait_for_timeout(1500)
        pg = await st("() => { const p = __Q.S.doc.page; return [p.size, p.mt, p.ml, __Q.S.pages]; }")
        ok(pg[0] == 'Letter' and pg[1] == 48 and pg[2] == 48, 'paper and margins change the document', pg)
        await page.fill('#prPages', ''); await page.select_option('#prRange', 'all'); await page.select_option('#prCollate', '1'); await page.select_option('#prSides', 'none')
        await page.fill('#prCopies', '1'); await page.locator('#prCopies').dispatch_event('change')
        await page.click('.pr-btn'); await page.wait_for_timeout(2500)
        pdf = PdfReader(io.BytesIO(base64.b64decode(await st("() => window.__saved[window.__saved.length - 1].b64"))))
        w, hgt = float(pdf.pages[0].mediabox.width), float(pdf.pages[0].mediabox.height)
        ok(abs(w - 792) < 0.5 and abs(hgt - 612) < 0.5 and len(pdf.pages) == 5, 'the PDF is Letter landscape, all five pages', [w, hgt, len(pdf.pages)])
        await page.keyboard.press('Control+p'); await page.wait_for_timeout(1200)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
        ok(await st("() => document.getElementById('backstage').hidden"), 'Esc goes back to the document')
        await st("() => { __Q.undo(); __Q.undo(); __Q.undo(); }")
        await page.wait_for_timeout(400)
        pg = await st("() => { const p = __Q.S.doc.page; return [p.orient, p.size, p.mt]; }")
        ok(pg == ['portrait', 'A4', 96], 'the three page changes undo like any other', pg)
        await st("() => __Q.Backstage.open('export')")
        await page.wait_for_timeout(300)
        ok('Print (' in await st("() => document.querySelector('.bs-main').textContent"), 'Export points to Print')
        await st("() => __Q.Backstage.close()")

        print('5. read-only and the picture PDF')
        await st("() => { __Q.S.readOnly = true; __Q.Backstage.open('print'); }")
        await page.wait_for_timeout(1200)
        ro = await st("() => ['#prOrient', '#prPaper', '#prMargins'].map(s => document.querySelector(s).disabled)")
        ok(ro == [True, True, True], 'a read-only document can be printed but not re-paged', ro)
        await st("() => { __Q.Backstage.close(); __Q.S.readOnly = false; }")
        pic = await st("""async () => { const blob = await __Q.buildPdf([{ blank: true, wPt: 595.28, hPt: 841.89 }], { title: 'x', print: { duplex: 'short', autoPrint: true } });
          const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); }""")
        pdf = PdfReader(io.BytesIO(base64.b64decode(pic)))
        cat = pdf.trailer['/Root']
        ok(len(pdf.pages) == 1 and cat['/ViewerPreferences'].get('/Duplex') == '/DuplexFlipShortEdge' and cat.get('/OpenAction') is not None, 'the picture PDF (the fallback) takes blank pages and the same print settings')
        plain = await st("""async () => { const blob = await __Q.buildPdf([{ blank: true, wPt: 595.28, hPt: 841.89 }], { title: 'x' }); const t = await blob.text(); return [t.includes('/OpenAction'), t.includes('/PrintScaling')]; }""")
        ok(plain == [False, False], 'an ordinary PDF export carries none of it', plain)
        ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors', errors)
        await b.close()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')

asyncio.run(main())
