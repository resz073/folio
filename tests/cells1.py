"""Selecting table cells as in Word, and formatting only them:
the Select menu, the selection arrows (above a column, left of a row, a cell's left edge),
dragging, Shift+click, Shift+arrows, Delete, typing over cells, undo, and alignment, bold,
size, clear formatting, change case and bullets applied to just the selected cells."""
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
    each: f => { const G = __Q.Tables.grid(T.tbl()); return G.rows.map((row, r) => Array.from(row.cells).map(c => f(c, r)).join('')); },
    align: () => C.each(c => ({ center: 'C', right: 'R', justify: 'J' })[getComputedStyle(c.querySelector('p, li') || c).textAlign] || 'L'),
    bold: () => C.each(c => { const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); const t = w.nextNode(); return t && parseInt(getComputedStyle(t.parentNode).fontWeight, 10) >= 600 ? 'B' : '.'; }),
    ital: () => C.each(c => { const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); const t = w.nextNode(); return t && getComputedStyle(t.parentNode).fontStyle === 'italic' ? 'I' : '.'; }),
    size: () => C.each(c => { const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); const t = w.nextNode(); return t ? String(Math.round(parseFloat(getComputedStyle(t.parentNode).fontSize) * 0.75)) + ' ' : '- '; }).map(s => s.trim()),
    text: () => C.each(c => (c.textContent.replace(/\u200B/g, '') || '.') + '|'),
    lists: () => C.each(c => c.querySelector('ul, ol') ? 'L' : '.'),
    rect: (r, c) => { const x = T.cell(T.tbl(), r, c).getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom, w: x.width, h: x.height }; },
    trect: () => { const x = T.tbl().getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom }; },
    native: () => { const s = getSelection(); return s.rangeCount ? (s.getRangeAt(0).collapsed ? 'caret' : 'text') : 'none'; },
    hidden: () => document.getElementById('editor').classList.contains('cellsel'),
    hl: () => document.querySelectorAll('#overlay .cell-hl').length,
    cursor: () => document.getElementById('editor').style.cursor.slice(0, 40),
  };
  return true;
}"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000)
        await load(page)
        await page.evaluate("() => __Q.openDoc(__Q.newDocModel({ title: 'Cells', html: '<p>Intro line</p><p><br></p><p>After the table</p>' }))")
        await page.wait_for_timeout(200)
        await page.evaluate(HELPERS)
        await page.evaluate(CHELP)
        await page.evaluate("() => { const p = document.querySelectorAll('#editor p')[1]; const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Tables.insert(4, 3); __Q.change(() => T.fill(T.tbl()), { full: true }); }")
        await page.wait_for_timeout(300)
        st = lambda js: page.evaluate(js)
        async def click_at(x, y, shift=False):
            if shift: await page.keyboard.down('Shift')
            await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up()
            if shift: await page.keyboard.up('Shift')
            await page.wait_for_timeout(120)
        async def cell_xy(r, c, dx=0.5, dy=0.5):
            q = await st(f"() => C.rect({r}, {c})")
            return q['l'] + q['w'] * dx, q['t'] + q['h'] * dy
        async def drag(a, z):
            await page.mouse.move(*a); await page.mouse.down()
            await page.mouse.move(a[0] + 3, a[1] + 2, steps=2); await page.mouse.move(*z, steps=10); await page.mouse.up()
            await page.wait_for_timeout(150)
        async def ribbon(label):
            await page.locator(f'#ribbon .rpanel.active button[aria-label="{label}"]').first.click(); await page.wait_for_timeout(150)

        print('1. Table Design > Select')
        await click_at(*(await cell_xy(1, 1)))
        await page.evaluate("() => __Q.UI.selectTab('tdesign')"); await page.wait_for_timeout(150)
        await ribbon('Select'); await page.locator('.pop .mi:has-text("Select Column")').click(); await page.wait_for_timeout(150)
        ok(await st("C.sel") == [0, 1, 3, 1] and await st("C.hl") == 4 and await st("C.hidden"), 'Select Column selects column B', await st("C.sel"))
        await ribbon('Center')
        ok(await st("C.align") == ['LCL', 'LCL', 'LCL', 'LCL'], 'Center (Table Design) centers only column B', await st("C.align"))
        jc = await st("""async () => { const b = await __Q.buildDocx(); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        import base64, zipfile, io, re
        xml = zipfile.ZipFile(io.BytesIO(base64.b64decode(jc))).read('word/document.xml').decode()
        rows = [''.join('C' if 'w:jc w:val="center"' in tc else '.' for tc in re.findall(r'<w:tc>.*?</w:tc>', tr)) for tr in re.findall(r'<w:tr[ >].*?</w:tr>', xml)]
        ok(rows == ['.C.'] * 4, 'in the Word file, just column B is centred', rows)
        await click_at(*(await cell_xy(2, 2)))
        ok(await st("C.sel") is None and not await st("C.hidden"), 'a click in a cell ends the cell selection')
        await ribbon('Select'); await page.locator('.pop .mi:has-text("Select Row")').click(); await page.wait_for_timeout(150)
        ok(await st("C.sel") == [2, 0, 2, 2], 'Select Row selects row 3', await st("C.sel"))
        await page.keyboard.press('Control+r'); await page.wait_for_timeout(150)
        ok(await st("C.align") == ['LCL', 'LCL', 'RRR', 'LCL'], 'Ctrl+R right-aligns only row 3', await st("C.align"))
        await click_at(*(await cell_xy(0, 0)))
        await ribbon('Select'); await page.locator('.pop .mi:has-text("Select Cell")').click(); await page.wait_for_timeout(150)
        ok(await st("C.sel") == [0, 0, 0, 0], 'Select Cell selects A1', await st("C.sel"))
        await page.keyboard.press('Control+j'); await page.wait_for_timeout(150)
        ok(await st("C.align") == ['JCL', 'LCL', 'RRR', 'LCL'], 'Ctrl+J justifies only A1', await st("C.align"))
        await ribbon('Select'); await page.locator('.pop .mi:has-text("Select Table")').click(); await page.wait_for_timeout(150)
        ok(await st("C.sel") == [0, 0, 3, 2], 'Select Table selects every cell', await st("C.sel"))
        await page.keyboard.press('Control+l'); await page.wait_for_timeout(150)
        ok(await st("C.align") == ['LLL'] * 4, 'Ctrl+L left-aligns the whole table', await st("C.align"))
        await ribbon('Align Center Vertically')
        va = await st("() => C.each(c => c.style.verticalAlign === 'middle' ? 'M' : '.')")
        ok(va == ['MMM'] * 4, 'vertical alignment applies to the selected cells', va)

        print('2. the selection arrows')
        t = await st("C.trect")
        x_col, y_col = (await cell_xy(0, 2))[0], t['t'] - 3
        await page.mouse.move(x_col, y_col); await page.wait_for_timeout(80)
        ok('data:image/svg' in await st("C.cursor"), 'above column C the pointer is a down arrow', await st("C.cursor"))
        await click_at(x_col, y_col)
        ok(await st("C.sel") == [0, 2, 3, 2], 'a click above column C selects it', await st("C.sel"))
        await page.keyboard.press('Control+b'); await page.wait_for_timeout(150)
        ok(await st("C.bold") == ['..B'] * 4, 'Ctrl+B bolds only column C', await st("C.bold"))
        await page.keyboard.press('Control+b'); await page.wait_for_timeout(150)
        ok(await st("C.bold") == ['...'] * 4, 'Ctrl+B again (all bold) turns it off', await st("C.bold"))
        y_r2 = (await cell_xy(1, 0))[1]
        await page.mouse.move(t['l'] - 12, y_r2); await page.wait_for_timeout(80)
        ok('data:image/svg' in await st("C.cursor"), 'left of row 2 the pointer is the selection arrow', await st("C.cursor"))
        await click_at(t['l'] - 12, y_r2)
        ok(await st("C.sel") == [1, 0, 1, 2], 'a click left of row 2 selects it', await st("C.sel"))
        await page.keyboard.press('Control+i'); await page.wait_for_timeout(150)
        ok(await st("C.ital") == ['...', 'III', '...', '...'], 'Ctrl+I italicises only row 2', await st("C.ital"))
        q = await st("() => C.rect(2, 1)")
        await page.mouse.move(q['l'] + 4, q['t'] + q['h'] / 2); await page.wait_for_timeout(80)
        ok('data:image/svg' in await st("C.cursor"), "at B3's left edge the pointer is the cell arrow", await st("C.cursor"))
        await click_at(q['l'] + 4, q['t'] + q['h'] / 2)
        ok(await st("C.sel") == [2, 1, 2, 1], "a click at B3's left edge selects the cell", await st("C.sel"))
        await page.mouse.move(*(await cell_xy(3, 2))); await page.wait_for_timeout(80)
        ok(await st("C.cursor") == '', 'inside the text the pointer is ordinary again', await st("C.cursor"))
        a = ((await cell_xy(0, 0))[0], t['t'] - 3)
        await page.mouse.move(*a); await page.mouse.down(); await page.mouse.move((await cell_xy(0, 1))[0], t['t'] - 3, steps=6); await page.mouse.up(); await page.wait_for_timeout(150)
        ok(await st("C.sel") == [0, 0, 3, 1], 'dragging above columns A to B selects both', await st("C.sel"))
        a = (t['l'] - 12, (await cell_xy(1, 0))[1])
        await page.mouse.move(*a); await page.mouse.down(); await page.mouse.move(t['l'] - 12, (await cell_xy(3, 0))[1], steps=6); await page.mouse.up(); await page.wait_for_timeout(150)
        ok(await st("C.sel") == [1, 0, 3, 2], 'dragging down the left of rows 2 to 4 selects them', await st("C.sel"))
        await click_at(t['l'] - 12, (await cell_xy(0, 0))[1], shift=True)
        ok(await st("C.sel") == [0, 0, 1, 2], 'Shift+click left of row 1 extends from row 2 to row 1', await st("C.sel"))

        print('3. dragging and Shift+click in cells')
        await drag(await cell_xy(0, 2, 0.3), await cell_xy(3, 2, 0.3))
        ok(await st("C.sel") == [0, 2, 3, 2] and await st("C.native") == 'caret' and await st("C.hidden"), 'a drag down column C selects the column (no text selection left)', [await st("C.sel"), await st("C.native")])
        mini = await st("() => { const m = document.querySelector('.mini-tb'); return !!m && m.style.display === 'flex'; }")
        ok(mini, 'the mini toolbar comes up over the selected cells')
        await page.screenshot(path='shots/cells1-drag.png', clip={'x': 150, 'y': 150, 'width': 1100, 'height': 330})
        q = await st("() => C.rect(1, 0)")
        await drag((q['l'] + 10, q['t'] + q['h'] / 2), (q['l'] + 24, q['t'] + q['h'] / 2))
        ok(await st("C.sel") is None and await st("C.native") == 'text', 'a drag inside one cell selects text as usual', [await st("C.sel"), await st("C.native")])
        await page.keyboard.press('Escape')   # the mini toolbar over the text goes away
        await drag(await cell_xy(0, 0, 0.3), await cell_xy(1, 1, 0.5))
        ok(await st("C.sel") == [0, 0, 1, 1], 'a drag from A1 to B2 selects the 2x2 block', await st("C.sel"))
        await page.mouse.move(*(await cell_xy(0, 0, 0.3))); await page.mouse.down()
        await page.mouse.move(*(await cell_xy(1, 1)), steps=5)
        after = await st("() => { const p = [...document.querySelectorAll('#editor > p')].pop().getBoundingClientRect(); return [p.left + 30, p.top + p.height / 2]; }")
        await page.mouse.move(*after, steps=8); await page.mouse.up(); await page.wait_for_timeout(150)
        ok(await st("C.sel") is None and await st("C.native") == 'text' and not await st("C.hidden"), 'dragging on out of the table goes back to an ordinary text selection', [await st("C.sel"), await st("C.native")])
        await page.keyboard.press('Escape')
        await click_at(*(await cell_xy(0, 0)))
        await click_at(*(await cell_xy(2, 1)), shift=True)
        ok(await st("C.sel") == [0, 0, 2, 1], 'click in A1, Shift+click in B3 selects A1:B3', await st("C.sel"))

        print('4. keyboard')
        await click_at(*(await cell_xy(1, 0, 0.8)))
        await page.keyboard.press('Shift+ArrowDown'); await page.wait_for_timeout(150)
        ok(await st("C.sel") == [1, 0, 2, 0], 'Shift+Down out of A2 selects A2:A3 (whole cells)', await st("C.sel"))
        await page.keyboard.press('Shift+ArrowRight'); await page.wait_for_timeout(100)
        ok(await st("C.sel") == [1, 0, 2, 1], 'Shift+Right grows it to A2:B3', await st("C.sel"))
        await page.keyboard.press('Shift+ArrowUp'); await page.wait_for_timeout(100)
        ok(await st("C.sel") == [1, 0, 1, 1], 'Shift+Up shrinks it to A2:B2', await st("C.sel"))
        await page.keyboard.press('Shift+ArrowUp'); await page.wait_for_timeout(100)
        ok(await st("C.sel") == [0, 0, 1, 1], 'Shift+Up again reaches row 1', await st("C.sel"))
        await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(100)
        where = await st("() => { const r = getSelection().getRangeAt(0); return [r.collapsed, r.startContainer.textContent]; }")
        ok(await st("C.sel") is None and where == [True, 'B2'], 'Right ends the selection at the end of B2', [await st("C.sel"), where])
        await click_at(*(await cell_xy(0, 1, 0.8)))
        await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.wait_for_timeout(150)
        ok(await st("C.sel") == [0, 1, 0, 2], 'Shift+Right past the end of B1 selects B1:C1', await st("C.sel"))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(100)
        ok(await st("C.sel") is None, 'Escape ends the cell selection')
        await click_at(*(await cell_xy(2, 1, 0.08)))
        await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowLeft'); await page.wait_for_timeout(120)
        ok(await st("C.sel") == [2, 0, 2, 1], 'Shift+Left at the start of B3 selects A3:B3', await st("C.sel"))
        await click_at(*(await cell_xy(2, 1, 0.08)))
        await page.keyboard.press('Shift+ArrowUp'); await page.wait_for_timeout(120)
        ok(await st("C.sel") == [1, 1, 2, 1], 'Shift+Up from B3 selects B2:B3', await st("C.sel"))
        await page.keyboard.press('Escape')
        await page.evaluate("() => { __Q.change(() => { T.cell(T.tbl(), 0, 0).querySelector('p').textContent = 'A1 is a much longer entry that wraps onto a second line in its cell'; }, { full: true }); }")
        await page.wait_for_timeout(150)
        await click_at(*(await cell_xy(0, 0, 0.2, 0.25)))
        await page.keyboard.press('Shift+ArrowDown'); await page.wait_for_timeout(120)
        ok(await st("C.sel") is None and await st("C.native") == 'text', 'Shift+Down on the first of two lines selects text in the cell', [await st("C.sel"), await st("C.native")])
        for _ in range(4):   # line by line to the last line of A1, then out of it
            if await st("C.sel"): break
            await page.keyboard.press('Shift+ArrowDown'); await page.wait_for_timeout(120)
        ok(await st("C.sel") == [0, 0, 1, 0], 'Shift+Down from the last line of A1 selects A1:A2', await st("C.sel"))
        await page.keyboard.press('Escape')
        await page.evaluate("() => { __Q.change(() => { T.cell(T.tbl(), 0, 0).querySelector('p').textContent = 'A1'; }, { full: true }); }")
        await page.wait_for_timeout(150)

        print('5. formatting the selected cells')
        await click_at((await cell_xy(0, 1))[0], t['t'] - 3)
        await page.evaluate("() => __Q.setFontSize(16)"); await page.wait_for_timeout(120)
        ok(await st("C.size") == ['11 16 11'] * 4 or await st("C.size") == ['111611'] * 4, 'font size 16 only in column B', await st("C.size"))
        await page.evaluate("() => __Q.CMD.fontColor && __Q.applyInline({ color: '#c00000' })"); await page.wait_for_timeout(120)
        col = await st("() => C.each(c => { const t = document.createTreeWalker(c, NodeFilter.SHOW_TEXT).nextNode(); return getComputedStyle(t.parentNode).color === 'rgb(192, 0, 0)' ? 'R' : '.'; })")
        ok(col == ['.R.'] * 4, 'font colour only in column B', col)
        await page.evaluate("() => __Q.changeCase('upper')"); await page.wait_for_timeout(120)
        ok(await st("C.text") == ['A1|B1|C1|', 'A2|B2|C2|', 'A3|B3|C3|', 'A4|B4|C4|'], 'UPPERCASE leaves the (already upper) text as it is', await st("C.text"))
        await page.evaluate("() => __Q.changeCase('lower')"); await page.wait_for_timeout(120)
        ok(await st("C.text") == ['A1|b1|C1|', 'A2|b2|C2|', 'A3|b3|C3|', 'A4|b4|C4|'], 'lowercase changes only column B', await st("C.text"))
        await page.evaluate("() => __Q.clearFormatting()"); await page.wait_for_timeout(120)
        sz = await st("C.size")
        ok(sz in (['11 11 11'] * 4, ['111111'] * 4) and await st("C.sel") == [0, 1, 3, 1], 'Clear Formatting resets column B and keeps it selected', [sz, await st("C.sel")])
        await click_at(t['l'] - 12, (await cell_xy(3, 0))[1])
        await page.evaluate("() => __Q.CMD.bullets()"); await page.wait_for_timeout(150)
        ok(await st("C.lists") == ['...', '...', '...', 'LLL'], 'Bullets make a list in each cell of row 4 only', await st("C.lists"))
        await page.evaluate("() => __Q.CMD.bullets()"); await page.wait_for_timeout(150)
        ok(await st("C.lists") == ['...'] * 4, 'Bullets again take them away', await st("C.lists"))
        await page.evaluate("() => __Q.setLineSpacing(2)"); await page.wait_for_timeout(120)
        lh = await st("() => C.each(c => (c.querySelector('p, li') || c).style.lineHeight === '2' ? '2' : '.')")
        ok(lh == ['...', '...', '...', '222'], 'line spacing only in row 4', lh)

        print('6. Delete, typing over cells, undo')
        await click_at((await cell_xy(0, 2))[0], t['t'] - 3)
        await page.keyboard.press('Control+e'); await page.wait_for_timeout(100)
        await page.keyboard.press('Delete'); await page.wait_for_timeout(150)
        ok(await st("C.text") == ['A1|b1|.|', 'A2|b2|.|', 'A3|b3|.|', 'A4|b4|.|'] and await st("C.sel") == [0, 2, 3, 2], 'Delete empties column C and keeps it selected', [await st("C.text"), await st("C.sel")])
        ok(await st("C.align") == ['LLC'] * 3 + ['LLC'], 'the emptied cells keep their alignment', await st("C.align"))
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(150)
        ok(await st("C.text") == ['A1|b1|C1|', 'A2|b2|C2|', 'A3|b3|C3|', 'A4|b4|C4|'] and await st("C.sel") == [0, 2, 3, 2], 'Undo brings the text back with column C still selected', [await st("C.text"), await st("C.sel")])
        await page.keyboard.type('Total'); await page.wait_for_timeout(150)
        ok(await st("C.text") == ['A1|b1|Total|', 'A2|b2|.|', 'A3|b3|.|', 'A4|b4|.|'] and await st("C.sel") is None, 'typing replaces the selected cells; the text goes into the first', await st("C.text"))
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(600)
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(150)
        txt = await st("C.text")
        ok(txt == ['A1|b1|C1|', 'A2|b2|C2|', 'A3|b3|C3|', 'A4|b4|C4|'], 'two undos bring the column back', txt)
        await click_at((await cell_xy(0, 2))[0], t['t'] - 3)
        await page.keyboard.press('Backspace'); await page.wait_for_timeout(120)
        ok(await st("C.text") == ['A1|b1|.|', 'A2|b2|.|', 'A3|b3|.|', 'A4|b4|.|'], 'Backspace also empties the cells')
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(150)
        await click_at((await cell_xy(0, 2))[0], t['t'] - 3)
        await page.keyboard.press('Alt+a'); await page.wait_for_timeout(150)
        ok(await st("C.text") == ['A1|b1|C1|', 'A2|b2|C2|', 'A3|b3|C3|', 'A4|b4|C4|'] and await st("C.sel") == [0, 2, 3, 2], 'Alt+letter (a shortcut, not typing) leaves the cells alone', await st("C.text"))
        # a phone keyboard: no recognisable key, only the input events
        typed = await st("""() => { const ev = new InputEvent('beforeinput', { inputType: 'insertText', data: 'Z', cancelable: true, bubbles: true }); document.getElementById('editor').dispatchEvent(ev); return ev.defaultPrevented; }""")
        await page.wait_for_timeout(150)
        ok(typed and await st("C.text") == ['A1|b1|Z|', 'A2|b2|.|', 'A3|b3|.|', 'A4|b4|.|'] and await st("C.sel") is None, 'typing from a phone keyboard also replaces the cells', await st("C.text"))
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(600)
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(150)
        await click_at((await cell_xy(0, 2))[0], t['t'] - 3)
        await st("() => document.getElementById('editor').dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true, bubbles: true }))")
        await page.wait_for_timeout(150)
        ok(await st("C.text") == ['A1|b1|.|', 'A2|b2|.|', 'A3|b3|.|', 'A4|b4|.|'] and await st("C.sel") == [0, 2, 3, 2], 'and so does deleting from one', await st("C.text"))
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(150)
        ok(await st("C.text") == ['A1|b1|C1|', 'A2|b2|C2|', 'A3|b3|C3|', 'A4|b4|C4|'], 'undo after the phone-keyboard edits', await st("C.text"))

        print('7. Track Changes, read-only, saving')
        await page.evaluate("() => { __Q.S.track = true; }")
        await click_at((await cell_xy(0, 0))[0], t['t'] - 3)
        await page.keyboard.press('Delete'); await page.wait_for_timeout(150)
        dels = await st("() => C.each(c => c.querySelector('del.tc') ? 'D' : '.')")
        ok(dels == ['D..'] * 4 and await st("C.text") == ['A1|b1|C1|', 'A2|b2|C2|', 'A3|b3|C3|', 'A4|b4|C4|'], 'with Track Changes on, Delete marks the text deleted', dels)
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(150)
        await page.evaluate("() => { __Q.S.track = false; }")
        await page.evaluate("() => { __Q.S.readOnly = true; }")
        await click_at((await cell_xy(0, 1))[0], t['t'] - 3)
        ok(await st("C.sel") == [0, 1, 3, 1], 'a read-only document can still select cells')
        await page.keyboard.press('Delete'); await page.wait_for_timeout(150)
        ok(await st("C.text") == ['A1|b1|C1|', 'A2|b2|C2|', 'A3|b3|C3|', 'A4|b4|C4|'], 'but Delete changes nothing')
        await page.evaluate("() => { __Q.S.readOnly = false; }")
        saved = await st("() => __Q.cleanHTML()")
        ok('cellsel' not in saved and 'cell-hl' not in saved, 'the saved document has no trace of the selection')
        blob = await st("async () => { const b = await __Q.buildDocx(); return b.size; }")
        ok(blob > 1000, 'the document still exports to Word with cells selected')
        for e in errors: print('   ERR', e)
        ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors')
        await b.close()
    print('CELLS1', 'OK' if not fails else 'FAILED: ' + '; '.join(fails))

asyncio.run(main())
