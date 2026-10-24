"""Copying and pasting table cells as in Word and Excel: a block of cells pastes cell by cell
(at the caret or over selected cells, adding rows when needed), one value fills every selected
cell, a block repeats over a selection it divides, Excel's HTML and tab-separated text paste
into cells, the paste options re-paste into the same cells, Cut empties the cells, merged
cells, Track Changes, and cells pasted outside a table."""
import asyncio, sys, json
sys.path.insert(0, 'tests')
from harness import *
from tbl1 import HELPERS

fails = []
def ok(cond, what, got=None):
    print(('  ok   ' if cond else '  FAIL ') + what + ('' if cond or got is None else '  -> ' + json.dumps(got, ensure_ascii=False)))
    if not cond: fails.append(what)

CHELP = r"""() => {
  window.C = {
    sel: () => __Q.Tables.active() ? [__Q.Tables.sel.r1, __Q.Tables.sel.c1, __Q.Tables.sel.r2, __Q.Tables.sel.c2] : null,
    text: (i = 0) => { const t = T.tbl(i); const G = __Q.Tables.grid(t); return G.rows.map(row => Array.from(row.cells).map(c => Array.from(c.querySelectorAll(':scope > p, :scope > h1, :scope > h2')).map(p => p.textContent.replace(/\u200B/g, '')).join('/') || '.').join('|')); },
    fill: () => __Q.change(() => { const G = __Q.Tables.grid(T.tbl()); for (let r = 0; r < G.rows.length; r++) for (let c = 0; c < G.ncols; c++) { const e = G.g[r][c]; if (e && e.r0 === r && e.c0 === c) e.cell.innerHTML = '<p>' + String.fromCharCode(65 + c) + (r + 1) + '</p>'; } }, { full: true }),
    rect: (r, c, i = 0) => { const x = T.cell(T.tbl(i), r, c).getBoundingClientRect(); return { l: x.left, t: x.top, w: x.width, h: x.height }; },
    trect: (i = 0) => { const x = T.tbl(i).getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom }; },
    nested: () => document.querySelectorAll('#editor td table, #editor th table').length,
    tables: () => document.querySelectorAll('#editor table').length,
    clip: async () => { const out = {}; for (const it of await navigator.clipboard.read()) for (const ty of it.types) out[ty] = await (await it.getType(ty)).text(); return out; },
    put: async (html, text) => { const o = { 'text/plain': new Blob([text], { type: 'text/plain' }) }; if (html) o['text/html'] = new Blob([html], { type: 'text/html' }); await navigator.clipboard.write([new ClipboardItem(o)]); },
    toast: () => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent).join(' / '),
    bold: () => { const G = __Q.Tables.grid(T.tbl()); return G.rows.map(row => Array.from(row.cells).map(c => { const t = document.createTreeWalker(c, NodeFilter.SHOW_TEXT).nextNode(); return t && parseInt(getComputedStyle(t.parentNode).fontWeight, 10) >= 600 ? 'B' : '.'; }).join('')); },
  };
  return true;
}"""
START = ['A1|B1|C1', 'A2|B2|C2', 'A3|B3|C3', 'A4|B4|C4']

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000)
        await page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        await load(page)
        await page.evaluate("() => __Q.openDoc(__Q.newDocModel({ title: 'Clipboard', html: '<p>Intro line</p><p><br></p><p>After the table</p>' }))")
        await page.wait_for_timeout(200)
        await page.evaluate(HELPERS)
        await page.evaluate(CHELP)
        await page.evaluate("() => { const p = document.querySelectorAll('#editor p')[1]; const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Tables.insert(4, 3); C.fill(); }")
        await page.wait_for_timeout(300)
        st = lambda js: page.evaluate(js)
        async def xy(r, c, dx=0.5, dy=0.5, i=0):
            q = await st(f"() => C.rect({r}, {c}, {i})")
            return q['l'] + q['w'] * dx, q['t'] + q['h'] * dy
        async def click_at(x, y):
            await page.mouse.click(x, y); await page.wait_for_timeout(120)
        async def drag(a, z):
            await page.mouse.move(*a); await page.mouse.down()
            await page.mouse.move(a[0] + 3, a[1] + 2, steps=2); await page.mouse.move(*z, steps=10); await page.mouse.up()
            await page.wait_for_timeout(150)
        async def key(k, wait=200):
            await page.keyboard.press(k); await page.wait_for_timeout(wait)
        async def col_zone(c):
            t = await st("() => C.trect()")
            await click_at((await xy(0, c))[0], t['t'] - 3)
        async def reset():
            await page.keyboard.press('Escape')
            await page.evaluate("() => { __Q.Tables.clearSel(); C.fill(); }")
            await page.evaluate("() => { const G = __Q.Tables.grid(T.tbl()); while (G.rows.length > 4) { G.rows.pop().remove(); } }")
            await page.wait_for_timeout(150)

        print('1. copy a block, paste at the caret')
        await drag(await xy(0, 0, 0.3), await xy(1, 1, 0.5))
        await key('Control+c')
        clip = await st("C.clip")
        ok('data-folio-cells' in clip.get('text/html', '') and clip.get('text/html', '').count('<tr') == 2, 'the clipboard holds a table of just the 2x2 cells', clip.get('text/html', '')[:120])
        ok(clip.get('text/plain') == 'A1\tB1\nA2\tB2', 'and tab-separated text, as Excel copies', clip.get('text/plain'))
        await click_at(*(await xy(2, 1)))
        await key('Control+v', 300)
        ok(await st("C.text()") == ['A1|B1|C1', 'A2|B2|C2', 'A3|A1|B1', 'A4|A2|B2'], 'pasted at the caret in B3, the block fills B3:C4 cell by cell', await st("C.text()"))
        ok(await st("C.sel") == [2, 1, 3, 2] and await st("C.nested") == 0, 'the pasted cells are selected; no table inside a cell', [await st("C.sel"), await st("C.nested")])
        await key('Control+z')
        ok(await st("C.text()") == START, 'Undo takes the paste back', await st("C.text()"))

        print('2. a block that runs past the table')
        await click_at(*(await xy(3, 2)))
        await key('Control+v', 300)
        ok(await st("C.text()") == START[:3] + ['A4|B4|A1', '.|.|A2'], 'at C4: a row is added for the second row of the block', await st("C.text()"))
        ok('didn’t fit' in await st("C.toast"), 'and a note says the column that didn’t fit wasn’t pasted', await st("C.toast"))
        await key('Control+z')
        ok(await st("C.text()") == START, 'Undo takes the new row away too', await st("C.text()"))

        print('3. pasting over selected cells')
        await drag(await xy(2, 0, 0.3), await xy(2, 1, 0.5))
        await key('Control+v', 300)
        ok(await st("C.text()") == ['A1|B1|C1', 'A2|B2|C2', 'A1|B1|C3', 'A2|B2|C4'], 'over A3:B3 the 2x2 block pastes whole from A3', await st("C.text()"))
        await reset()
        await drag(await xy(0, 0, 0.3), await xy(1, 0, 0.5))
        await key('Control+c')
        await col_zone(1)
        await key('Control+v', 300)
        ok(await st("C.text()") == ['A1|A1|C1', 'A2|A2|C2', 'A3|A1|C3', 'A4|A2|C4'], 'two cells pasted over a column of four repeat (as Excel)', await st("C.text()"))
        await reset()
        await page.evaluate("() => { __Q.Tables.selectPart && 0; }")
        await col_zone(0)
        await key('Control+r')
        await page.keyboard.press('Escape')   # (the mini toolbar over the column would be in the way)
        intro = await st("() => { const p = document.querySelector('#editor > p'); const r = p.getBoundingClientRect(); return [r.left + 8, r.top + r.height / 2]; }")
        await page.mouse.dblclick(*intro); await page.wait_for_timeout(150)
        await key('Control+c')
        await col_zone(0)
        await key('Control+v', 300)
        ok(await st("C.text()") == ['Intro|B1|C1', 'Intro|B2|C2', 'Intro|B3|C3', 'Intro|B4|C4'], 'one word pasted over column A goes into every cell', await st("C.text()"))
        al = await st("() => { const G = __Q.Tables.grid(T.tbl()); return G.rows.map(r => getComputedStyle(r.cells[0].querySelector('p')).textAlign); }")
        ok(al == ['right'] * 4, 'and the cells keep their own (right) alignment', al)

        print('4. from Excel and plain text')
        await reset()
        excel = ('<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><style>.xl65{font-weight:700;mso-number-format:General}</style></head><body>'
                 '<table border=0 cellpadding=0 cellspacing=0 width=192 style="border-collapse:collapse;width:144pt"><col width=64 span=3 style="width:48pt">'
                 '<tr height=20><td height=20 class=xl65 style="font-weight:700">Item</td><td style="font-weight:700">Qty</td><td style="font-weight:700">Price</td></tr>'
                 '<tr height=20><td height=20>Paper</td><td align=right>10</td><td align=right>৳১২০০</td></tr></table></body></html>')
        await page.evaluate("([h, t]) => C.put(h, t)", [excel, 'Item\tQty\tPrice\nPaper\t10\t৳১২০০\n'])
        await click_at(*(await xy(0, 0)))
        await key('Control+v', 300)
        ok(await st("C.text()") == ['Item|Qty|Price', 'Paper|10|৳১২০০', 'A3|B3|C3', 'A4|B4|C4'] and await st("C.nested") == 0, 'cells copied in Excel fill A1:C2', await st("C.text()"))
        ok((await st("C.bold"))[0] == 'BBB', "Excel's bold header comes along", await st("C.bold"))
        chip = page.locator('.paste-chip button:has-text("Text only")')
        ok(await chip.is_visible(), 'the paste options appear')
        await chip.click(); await page.wait_for_timeout(300)
        ok(await st("C.text()") == ['Item|Qty|Price', 'Paper|10|৳১২০০', 'A3|B3|C3', 'A4|B4|C4'] and (await st("C.bold"))[0] == '...', 'Text only pastes the same cells again, without the bold', [await st("C.text()"), await st("C.bold")])
        ok(await st("C.sel") == [0, 0, 1, 2], 'with the pasted cells selected', await st("C.sel"))
        await reset()
        await page.evaluate("t => navigator.clipboard.writeText(t)", 'Name\tNote\n"Rahim"\t"Line 1\nLine 2"\n"say ""hi"""\tdone\n')
        q = await st("() => C.rect(0, 0)")
        await click_at(q['l'] + 4, q['t'] + q['h'] / 2)
        await key('Control+v', 300)
        ok(await st("C.text()") == ['Name|Note|C1', 'Rahim|Line 1/Line 2|C2', 'say "hi"|done|C3', 'A4|B4|C4'], "tab-separated text with Excel's quotes fills the cells from a selected cell", await st("C.text()"))
        await reset()
        await page.evaluate("t => navigator.clipboard.writeText(t)", 'Name:\tReshad')
        await click_at(*(await xy(1, 0, 0.9)))
        await key('Control+v', 300)
        ok((await st("C.text()"))[1] == 'A2Name:\tReshad|B2|C2', 'plain text with a tab at a caret stays in that cell (as Word)', await st("C.text()"))
        await reset()
        await page.evaluate("t => navigator.clipboard.writeText(t)", 'first line\nsecond line')
        await click_at(*(await xy(0, 1, 0.9)))
        await key('Control+v', 300)
        ok((await st("C.text()"))[0] == 'A1|B1first line/second line|C1' and await st("C.sel") is None, 'lines of text at a caret stay in that cell (as Word)', await st("C.text()"))
        await reset()
        await col_zone(2)
        await key('Control+v', 300)
        ok(await st("C.text()") == ['A1|B1|first line', 'A2|B2|second line', 'A3|B3|first line', 'A4|B4|second line'], 'over a selected column the lines go down the cells', await st("C.text()"))

        print('5. cut, the ribbon, outside the table')
        await reset()
        await drag(await xy(0, 1, 0.3), await xy(1, 1, 0.5))
        await key('Control+x', 300)
        ok(await st("C.text()") == ['A1|.|C1', 'A2|.|C2', 'A3|B3|C3', 'A4|B4|C4'], 'Cut empties B1:B2', await st("C.text()"))
        ok((await st("C.clip")).get('text/plain') == 'B1\nB2', 'and puts them on the clipboard', await st("C.clip"))
        await key('Control+z')
        await col_zone(2)
        await page.evaluate("() => __Q.CMD.copy()"); await page.wait_for_timeout(200)
        ok((await st("C.clip")).get('text/plain') == 'C1\nC2\nC3\nC4' and await st("C.sel") == [0, 2, 3, 2], 'the ribbon Copy button copies the selected column', await st("C.clip"))
        q = await st("() => C.rect(2, 0)")
        await click_at(q['l'] + 4, q['t'] + q['h'] / 2)
        ok(await st("C.sel") == [2, 0, 2, 0], 'A3 selected with the cell arrow')
        await key('Control+c')
        after = await st("() => { const p = [...document.querySelectorAll('#editor > p')].pop(); const r = p.getBoundingClientRect(); return [r.right - 2, r.top + r.height / 2]; }")
        await page.keyboard.press('Escape')
        await click_at(*after); await key('End', 80)
        await key('Control+v', 300)
        last = await st("() => [...document.querySelectorAll('#editor > p')].pop().textContent")
        ok(last == 'After the tableA3' and await st("C.tables") == 1, 'one cell pasted into a paragraph brings just its text', last)
        await key('Control+z')
        await drag(await xy(0, 0, 0.3), await xy(1, 1, 0.5))
        await key('Control+c')
        await page.keyboard.press('Escape')
        await click_at(*after); await key('End', 80)
        await key('Control+v', 300)
        ok(await st("C.tables") == 2 and await st("C.text(1)") == ['A1|B1', 'A2|B2'], 'a block of cells pasted into a paragraph becomes a new table', await st("C.tables"))
        await key('Control+z')

        print('6. merged cells, Track Changes')
        await reset()
        await drag(await xy(0, 0, 0.3), await xy(0, 1, 0.5))
        await page.evaluate("() => __Q.Tables.merge()"); await page.wait_for_timeout(200)
        await page.evaluate("() => { const t = T.tbl(); const c = __Q.Tables.grid(t).g[0][0].cell; c.innerHTML = '<p>Merged</p>'; }")
        t = await st("() => C.trect()")
        await click_at(t['l'] - 12, (await xy(0, 2))[1])
        ok(await st("C.sel") == [0, 0, 0, 2], 'row 1 (with its merged cell) selected')
        await key('Control+c')
        ok((await st("C.clip")).get('text/plain') == 'Merged\t\tC1', 'the merged cell copies as one value and an empty one', await st("C.clip"))
        await click_at(*(await xy(2, 0)))
        await key('Control+v', 300)
        ok((await st("C.text()"))[2] == 'Merged|.|C1', 'pasted into row 3: Merged, an emptied B3, C1', await st("C.text()"))
        await reset()
        await page.evaluate("() => { __Q.S.track = true; }")
        await drag(await xy(0, 0, 0.3), await xy(1, 0, 0.5))
        await key('Control+c')
        await click_at(*(await xy(0, 2)))
        await key('Control+v', 300)
        tc = await st("() => { const G = __Q.Tables.grid(T.tbl()); return [0, 1].map(r => { const c = G.g[r][2].cell; return [!!c.querySelector('del.tc'), !!c.querySelector('ins.tc'), c.textContent]; }); }")
        ok(tc == [[True, True, 'C1A1'], [True, True, 'C2A2']], 'with Track Changes on, the old text is marked deleted and the new inserted', tc)
        await page.evaluate("() => { __Q.S.track = false; }")
        for e in errors: print('   ERR', e)
        ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors')
        await b.close()
    print('CELLS2', 'OK' if not fails else 'FAILED: ' + '; '.join(fails))

asyncio.run(main())
