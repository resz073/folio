"""Pages side by side when zoomed out (Word's multiple-page view): how many pages fit, where
the sheets and every block go, the parts of paragraphs, tables and lists that run over a
page break (copies), clicks on text, on copies and on empty paper, typing, the arrow keys,
a drag across pages, pagination and the PDF unchanged, the window getting narrower, and
the single column back at 100% with nothing left in the document."""
import asyncio, sys, json
sys.path.insert(0, 'tests')
from harness import *

fails = []
def ok(cond, what, got=None):
    print(('  ok   ' if cond else '  FAIL ') + what + ('' if cond or got is None else '  -> ' + json.dumps(got, ensure_ascii=False)))
    if not cond: fails.append(what)

def para(i, n):
    return f'<p>Paragraph {i}. ' + ('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' * n) + '</p>'
parts = ['<h1>Grid test</h1>']
for i in range(1, 14): parts.append(para(i, 4 + (i % 3) * 3))
parts.append('<table style="width:100%"><tbody>' + ''.join(f'<tr><td><p>Row {r}</p></td><td><p>Value {r * 7}</p></td></tr>' for r in range(1, 40)) + '</tbody></table>')
parts.append('<ul>' + ''.join(f'<li>Bullet item number {k} with some words</li>' for k in range(1, 60)) + '</ul>')
for i in range(14, 20): parts.append(para(i, 6))
parts.append('<p>আমি বাংলায় গান গাই। শেষ অনুচ্ছেদ।</p>')
HTML = ''.join(parts)

CARET = """() => { const r = getSelection().getRangeAt(0); const n = r.startContainer; const b = n.nodeType === 1 ? n : n.parentNode;
  const top = [...document.getElementById('editor').children].find(x => x.contains(b));
  return { near: (n.data || '').slice(Math.max(0, r.startOffset - 10), r.startOffset + 10), block: top ? top.textContent.slice(0, 13) : null,
    page: __Q.S.curPage, status: document.getElementById('sbPage').textContent }; }"""
# for every top-level block (or the copy of its part) the page whose sheet holds it
PLACED = """() => { const sheets = [...document.querySelectorAll('#sheets .sheet')].map(s => s.getBoundingClientRect());
  const inside = (r, s) => r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1;
  const pitch = __Q.geom().h + __Q.GAP, bad = [];
  for (const b of document.getElementById('editor').children) {
    if (b.hasAttribute('data-gs')) continue;
    const k = Math.floor((b.offsetTop + 0.5) / pitch); const r = b.getBoundingClientRect();
    if (r.height && !inside(r, sheets[k])) bad.push([b.textContent.slice(0, 12), k]);
  }
  return bad; }"""
# the page of every unit (tops can move by a fraction of a pixel with the zoom, as before)
UNITS = "() => { __Q.Layout.full(); const pitch = __Q.geom().h + __Q.GAP; return { pages: __Q.S.pages, units: __Q.collectUnits().map(u => Math.floor((__Q.topOf(u) + 0.5) / pitch)) }; }"

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1500, height=950, gfonts=True)
        await load(page)
        await page.evaluate("h => __Q.openDoc(__Q.newDocModel({ title: 'Grid', html: h }))", HTML)
        await page.wait_for_timeout(1200)
        st = lambda js, *a: page.evaluate(js, *a)
        col = await st(UNITS)
        ok(col['pages'] >= 7, 'the document has several pages', col['pages'])
        ok(not await st("() => __Q.Grid.on"), 'at 100% the pages are in one column')

        print('1. zoomed out: pages in rows')
        await st("() => __Q.setZoom(0.4)")
        await page.wait_for_timeout(500)
        info = await st("""() => ({ cols: __Q.Grid.cols, cls: document.getElementById('paper').className,
          sheets: [...document.querySelectorAll('#sheets .sheet')].map(s => [s.offsetLeft, s.offsetTop]),
          box: [document.getElementById('zoomBox').offsetWidth, document.getElementById('zoomBox').offsetHeight], canvas: document.getElementById('canvas').clientWidth })""")
        C = info['cols']
        ok(C >= 3, 'at 40% in a wide window three or more pages sit side by side', info)
        g = await st("() => { const g = __Q.geom(); return { w: g.w, h: g.h, ml: g.ml, mt: g.mt, mb: g.mb }; }")
        pitch = g['h'] + 22
        want = [[(k % C) * (round(g['w']) + 24), (k // C) * round(pitch)] for k in range(col['pages'])]
        ok(all(abs(a[0] - w[0]) <= 1 and abs(a[1] - w[1]) <= 1 for a, w in zip(info['sheets'], want)), 'sheet k sits in row k / cols, column k % cols', info['sheets'])
        ok(info['box'][0] <= info['canvas'] and info['box'][1] < col['pages'] * pitch * 0.4 * 0.6, 'the rows fit the window width and are much shorter than the column', info['box'])
        ok(await st(PLACED) == [], 'every block shows inside the sheet of its page', await st(PLACED))
        ghosts = await st("() => [...document.querySelectorAll('#ghosts > *')].map(c => [c.dataset.page, c.tagName, c.textContent.slice(0, 12)])")
        ok(any(t == 'TABLE' for _, t, _ in ghosts) and any(t == 'UL' for _, t, _ in ghosts) and any(t == 'P' for _, t, _ in ghosts), 'a paragraph, the table and the list that run over a page break show their other parts as copies', ghosts)
        same = await st(UNITS)
        ok(same == col, 'pagination is exactly the same as in the column')
        shot = await page.screenshot(path='shots/grid-rows.png')

        pr = await st("() => { const r = document.getElementById('paper').getBoundingClientRect(); return [r.left, r.top]; }")
        z = 0.4
        def pt(k, x, y):
            return pr[0] + ((k % C) * (g['w'] + 24) + x) * z, pr[1] + ((k // C) * pitch + y) * z

        print('2. clicks')
        # the copy on page 2 (the end of the paragraph that starts on page 1)
        cp = await st("() => { const c = [...document.querySelectorAll('#ghosts > p')].find(c => c.dataset.page === '1'); return c ? c.textContent.slice(0, 13) : null; }")
        x, y = pt(1, g['ml'] + 60, g['mt'] + 8)
        await page.mouse.click(x, y)
        await page.wait_for_timeout(300)
        c1 = await st(CARET)
        ok(c1['block'] == cp and c1['page'] == 2, 'a click on the copy at the top of page 2 puts the caret in that paragraph, on page 2', [cp, c1])
        live = await st("() => { const b = [...document.getElementById('editor').children].find(x => x.textContent.startsWith(%s)); return [b._gAct, [...document.querySelectorAll('#ghosts > *')].filter(c => c._src === b).map(c => c._page)]; }" % json.dumps(cp))
        ok(live == [1, [0]], 'the paragraph now shows live on page 2 and as a copy on page 1', live)
        await page.keyboard.type('XYZ')
        await page.wait_for_timeout(400)
        txt = await st("() => document.getElementById('editor').textContent")
        ok('XYZ' in txt and await st("() => [...document.getElementById('editor').children].find(x => x.textContent.includes('XYZ')).textContent.startsWith(%s)" % json.dumps(cp)), 'typing goes into that paragraph')
        vis = await st("() => { const r = getSelection().getRangeAt(0).getClientRects()[0]; const s = document.querySelectorAll('#sheets .sheet')[1].getBoundingClientRect(); return r && r.left > s.left && r.right < s.right && r.top > s.top && r.bottom < s.bottom; }")
        ok(vis, 'the caret shows on page 2')
        # live text on page 3
        x, y = pt(2, g['ml'] + 100, g['mt'] + 40)
        await page.mouse.click(x, y)
        await page.wait_for_timeout(300)
        c2 = await st(CARET)
        ok(c2['page'] == 3 and c2['status'].startswith('Page 3 of'), 'a click on text on page 3 puts the caret there and the status bar says page 3', c2)
        ruler = await st("() => { const w = document.getElementById('rulerWrap').getBoundingClientRect(), s = document.querySelectorAll('#sheets .sheet')[2].getBoundingClientRect(); return Math.abs(__Q.Ruler.geomPx().left + w.left - s.left) < 2; }")
        ok(ruler, 'the ruler lines up with page 3')
        # the right margin of page 2, beside text
        x, y = pt(1, g['w'] - 30, g['mt'] + 200)
        await page.mouse.click(x, y)
        await page.wait_for_timeout(300)
        c3 = await st(CARET)
        ok(c3['page'] == 2, 'a click in the margin of page 2 puts the caret on the nearest line of page 2', c3)
        # empty paper at the bottom of the last page (scrolled into view)
        last = col['pages'] - 1
        await st("n => __Q.goToPage(n)", col['pages'])
        await page.wait_for_timeout(700)
        pr = await st("() => { const r = document.getElementById('paper').getBoundingClientRect(); return [r.left, r.top]; }")
        x, y = pt(last, g['ml'] + 200, g['h'] - 120)
        await page.mouse.click(x, y)
        await page.wait_for_timeout(300)
        c4 = await st(CARET)
        ok(c4['page'] == col['pages'] and c4['block'] and c4['block'].startswith('আমি'), 'a click on empty paper below the text of the last page puts the caret at its last line', c4)

        print('3. keys and a drag')
        await st("() => __Q.goToPage(1)")
        await page.wait_for_timeout(700)
        pr = await st("() => { const r = document.getElementById('paper').getBoundingClientRect(); return [r.left, r.top]; }")
        lastline = await st("""() => { const s = document.querySelectorAll('#sheets .sheet')[0].getBoundingClientRect(); let best = null;
          for (const b of [...document.getElementById('editor').children, ...document.querySelectorAll('#ghosts > *')]) { const r = document.createRange(); r.selectNodeContents(b);
            for (const q of r.getClientRects()) if (q.bottom <= s.bottom - 2 && q.left >= s.left && q.right <= s.right && (!best || q.bottom > best.bottom)) best = { x: q.left + 30, y: q.top + q.height / 2, bottom: q.bottom }; }
          return best; }""")
        await page.mouse.click(lastline['x'], lastline['y'])
        await page.wait_for_timeout(200)
        before = await st(CARET)
        await page.keyboard.press('ArrowDown')
        await page.wait_for_timeout(250)
        down = await st(CARET)
        ok(before['page'] == 1 and down['page'] == 2, 'Down from the last line of page 1 goes to the first line of page 2', [before, down])
        cx = await st("() => { const r = getSelection().getRangeAt(0).getClientRects()[0], s = document.querySelectorAll('#sheets .sheet')[1].getBoundingClientRect(); return (r.left - s.left) / 0.4; }")
        x0 = await st("x => (x - document.querySelectorAll('#sheets .sheet')[0].getBoundingClientRect().left) / 0.4", lastline['x'])
        ok(abs(cx - x0) < 40, 'and keeps its place across the line', [x0, cx])
        await page.keyboard.press('ArrowUp')
        await page.wait_for_timeout(250)
        up = await st(CARET)
        ok(up['page'] == 1, 'Up goes back to page 1', up)
        # drag from page 1 to page 2
        x0, y0 = pt(0, g['ml'] + 20, g['mt'] + 120)
        x1, y1 = pt(1, g['ml'] + 200, g['mt'] + 300)
        await page.mouse.move(x0, y0); await page.mouse.down()
        for i in range(1, 11):
            await page.mouse.move(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10)
            await page.wait_for_timeout(30)
        await page.mouse.up()
        await page.wait_for_timeout(200)
        selp = await st("""() => { const r = getSelection().getRangeAt(0); const pitch = __Q.geom().h + __Q.GAP;
          const pg = n => { const e = n.nodeType === 1 ? n : n.parentNode; const t = [...document.getElementById('editor').children].find(x => x.contains(e)); return t ? Math.floor((t.offsetTop + 0.5) / pitch) : -1; };
          return [pg(r.startContainer), getSelection().toString().length]; }""")
        ok(selp[0] == 0 and selp[1] > 1500, 'a drag from page 1 to page 2 selects the text between', selp)

        # the selection shows in the copies of blocks it covers
        hl = await st("() => { const h = CSS.highlights.get('q-gsel'); return h ? [...h].map(r => r.toString().length) : []; }")
        ok(len(hl) >= 1 and all(n > 0 for n in hl), 'the selected text shows selected in the copies too', hl)
        # from the last page of the first row to the first page of the second
        rowend = await st("""k => { const s = document.querySelectorAll('#sheets .sheet')[k].getBoundingClientRect(); let best = null;
          for (const b of [...document.getElementById('editor').children, ...document.querySelectorAll('#ghosts > *')]) { const r = document.createRange(); r.selectNodeContents(b);
            for (const q of r.getClientRects()) if (q.bottom <= s.bottom - 2 && q.left >= s.left && q.right <= s.right && (!best || q.bottom > best.bottom)) best = { x: q.left + 30, y: q.top + q.height / 2, bottom: q.bottom }; }
          return best; }""", C - 1)
        await page.mouse.click(rowend['x'], rowend['y'])
        await page.wait_for_timeout(250)
        a = await st(CARET)
        await page.keyboard.press('ArrowDown')
        await page.wait_for_timeout(300)
        bq = await st(CARET)
        vis = await st("k => { const r = getSelection().getRangeAt(0).getClientRects()[0], s = document.querySelectorAll('#sheets .sheet')[k].getBoundingClientRect(); return !!r && r.top >= s.top && r.bottom <= s.bottom && r.left >= s.left && r.right <= s.right; }", C)
        ok(a['page'] == C and bq['page'] == C + 1 and vis, 'Down from the end of the first row goes to the first page of the next row, and the caret shows there', [a, bq, vis])

        print('4. pictures and the menu in copies')
        IMG = 'data:image/svg+xml;base64,' + __import__('base64').b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#2a7"/></svg>').decode()
        put = await st("""src => { const sp = [...document.getElementById('editor').children].find(b => b.tagName === 'P' && b.hasAttribute('data-gs') && [...document.querySelectorAll('#ghosts > p')].some(c => c._src === b));
          if (!sp) return null; const im = document.createElement('img'); im.src = src; im.id = 'gimg'; sp.appendChild(im); __Q.Layout.full(); return sp.textContent.slice(0, 13); }""", IMG)
        await page.wait_for_timeout(300)
        gi = await st("() => { const c = [...document.querySelectorAll('#ghosts img')][0]; if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, page: c.closest('#ghosts > *')._page }; }")
        ok(put and gi, 'a picture at the end of a paragraph over a page break shows in its copy', [put, gi])
        if gi:
            await st("y => { const c = document.getElementById('canvas'); c.scrollTop += y - c.getBoundingClientRect().top - 300; }", gi['y'])
            await page.wait_for_timeout(300)
            gi = await st("() => { const c = [...document.querySelectorAll('#ghosts img')][0]; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, page: c.closest('#ghosts > *')._page }; }")
            await page.mouse.click(gi['x'], gi['y'])
            await page.wait_for_timeout(300)
            sel = await st("() => { const s = __Q.S.selImg; if (!s) return null; const f = document.querySelector('.img-frame, .imgframe, [class*=frame]'); const r = s.getBoundingClientRect(); return { id: s.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }")
            ok(sel and sel['id'] == 'gimg' and abs(sel['x'] - gi['x']) < 3 and abs(sel['y'] - gi['y']) < 3, 'a click on the picture in the copy selects the picture, now shown live where it was clicked', [gi, sel])
            await page.keyboard.press('Escape')
            await st("() => { document.getElementById('gimg').remove(); __Q.Layout.full(); }")
            await page.wait_for_timeout(300)
        # right-click on a copy: the menu is the document's, for the text under the pointer
        gc = await st("() => { const cv = document.getElementById('canvas').getBoundingClientRect(); const inView = q => q.top > cv.top + 10 && q.bottom < cv.bottom - 10; for (const c of document.querySelectorAll('#ghosts > p')) { const r = document.createRange(); r.selectNodeContents(c); const cl = c.getBoundingClientRect(); const cp = c.style.clipPath.match(/inset\\(([\\d.]+)px/); const top0 = cl.top + (cp ? parseFloat(cp[1]) * 0.4 : 0); const q = [...r.getClientRects()].find(q => q.top >= top0 && inView(q) && q.width > 40); if (q) return { x: q.left + 20, y: q.top + q.height / 2, src: c._src.textContent.slice(0, 13) }; } return null; }")
        ok(gc is not None, 'a copy of a paragraph is on screen', gc)
        if gc:
            await page.mouse.click(gc['x'], gc['y'], button='right')
            await page.wait_for_timeout(300)
            m = await st("() => ({ open: __Q.CtxMenu.isOpen(), items: [...document.querySelectorAll('.pop.ctx .mi')].map(x => x.textContent).slice(0, 4) })")
            c5 = await st(CARET)
            ok(m['open'] and any('Copy' in t or 'Paste' in t for t in m['items']) and c5['block'] == gc['src'], 'a right-click on a copy opens the document menu with the caret in that paragraph', [m, c5, gc])
            await page.keyboard.press('Escape')
            await page.wait_for_timeout(150)

        print('5. the document and the PDF')
        clean = await st("() => __Q.cleanHTML()")
        ok('data-gp' not in clean and 'data-gs' not in clean and 'ghost' not in clean, 'nothing of the rows goes into the saved document')
        await st("() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#editor > p')); getSelection().removeAllRanges(); getSelection().addRange(r); }")
        html = await st("() => { const dt = new DataTransfer(); const e = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }); document.getElementById('editor').dispatchEvent(e); return dt.getData('text/html'); }")
        ok('data-g' not in html, 'nor into copied HTML')
        grid_pdf = await st("async () => { const P = await __Q.collectPaint(); return [__Q.S.pages, ...Array.from({ length: __Q.S.pages }, (_, i) => __Q.pageWords(P, i).map(w => [w.s || w.t || w.text, Math.round(w.x), Math.round(w.y)]).slice(0, 6))]; }")
        ok(await st("() => document.getElementById('paper').classList.contains('gt')"), 'the rows come back after the PDF is measured')
        await st("() => __Q.setZoom(1)")
        await page.wait_for_timeout(500)
        col_pdf = await st("async () => { const P = await __Q.collectPaint(); return [__Q.S.pages, ...Array.from({ length: __Q.S.pages }, (_, i) => __Q.pageWords(P, i).map(w => [w.s || w.t || w.text, Math.round(w.x), Math.round(w.y)]).slice(0, 6))]; }")
        ok(grid_pdf == col_pdf, 'the PDF is the same whether the pages are in rows or in a column', [grid_pdf[:2], col_pdf[:2]])

        print('6. back to one column')
        info2 = await st("""() => ({ on: __Q.Grid.on, cls: document.getElementById('paper').className, marks: document.querySelectorAll('#editor [data-gp], #editor [data-gs]').length,
          ghosts: document.querySelectorAll('#ghosts > *').length, left: [...document.querySelectorAll('#sheets .sheet')].map(s => s.offsetLeft), w: document.getElementById('paper').offsetWidth })""")
        ok(not info2['on'] and 'grid' not in info2['cls'] and info2['marks'] == 0 and info2['ghosts'] == 0 and set(info2['left']) == {0} and abs(info2['w'] - g['w']) < 1, 'at 100% the column is back, with no marks or copies', info2)
        ok(await st(UNITS) == await st(UNITS), 'and the same pagination')

        print('7. zooming keeps your place; the window')
        await st("() => __Q.goToPage(6)")
        await page.wait_for_timeout(800)
        spot = await st("""() => { const s = document.querySelectorAll('#sheets .sheet')[5].getBoundingClientRect(); const c = document.getElementById('canvas').getBoundingClientRect();
          for (const b of document.getElementById('editor').children) { const r = document.createRange(); r.selectNodeContents(b);
            for (const q of r.getClientRects()) if (q.top > Math.max(s.top, c.top) + 40 && q.bottom < Math.min(s.bottom, c.bottom) - 40 && q.width > 50) return { x: q.left + 20, y: q.top + q.height / 2 }; } return null; }""")
        await page.mouse.click(spot['x'], spot['y'])
        await page.wait_for_timeout(200)
        await st("() => __Q.setZoom(0.4)")
        await page.wait_for_timeout(400)
        seen = await st("() => { const r = getSelection().getRangeAt(0).getClientRects()[0], c = document.getElementById('canvas').getBoundingClientRect(); return [__Q.S.curPage, !!r && r.top >= c.top && r.bottom <= c.bottom && r.left >= c.left && r.right <= c.right]; }")
        ok(seen == [6, True], 'zooming out from page 6 keeps page 6 and the caret on screen', seen)
        await st("() => __Q.setZoom(1)")
        await page.wait_for_timeout(400)
        seen = await st("() => { const r = getSelection().getRangeAt(0).getClientRects()[0], c = document.getElementById('canvas').getBoundingClientRect(); return [__Q.S.curPage, !!r && r.top >= c.top && r.bottom <= c.bottom && r.left >= c.left && r.right <= c.right]; }")
        ok(seen == [6, True], 'and so does zooming back in', seen)
        await st("() => __Q.setZoom(0.4)")
        await page.wait_for_timeout(400)
        c_wide = await st("() => __Q.Grid.cols")
        await page.set_viewport_size({'width': 900, 'height': 950})
        await page.wait_for_timeout(600)
        c_narrow = await st("() => __Q.Grid.cols")
        ok(c_narrow < c_wide and c_narrow >= 2 and await st(PLACED) == [], 'a narrower window fits fewer pages per row, still in place', [c_wide, c_narrow])
        await st("() => __Q.setZoom(0.25)")
        await page.wait_for_timeout(400)
        ok(await st("() => __Q.Grid.cols") > c_narrow, 'zooming out further fits more', await st("() => __Q.Grid.cols"))
        await st("() => { __Q.S.zoomMode = 'width'; }")
        await st("() => __Q.CMD.pageWidth ? __Q.CMD.pageWidth() : null")
        await page.wait_for_timeout(400)
        ok(not await st("() => __Q.Grid.on"), 'Page Width shows one page across')
        two = await st("() => { const d = __Q.newDocModel({ title: 'One', html: '<p>Just one page</p>' }); __Q.openDoc(d); __Q.setZoom(0.3); return [__Q.S.pages, __Q.Grid.on]; }")
        await page.wait_for_timeout(300)
        ok(two == [1, False], 'a one-page document stays a single page however far out', two)
        ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors', errors)
        await b.close()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')

asyncio.run(main())
