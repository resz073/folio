import asyncio, sys, json
sys.path.insert(0, 'tests')
from harness import *

HELP = r"""() => {
  window.T = {
    tbl: (i = 0) => document.querySelectorAll('#editor table')[i],
    shape: t => { const G = __Q.Tables.grid(t); return G.rows.map(r => Array.from(r.cells).map(c => (c.textContent.trim() || '.') + (c.colSpan > 1 ? '~c' + c.colSpan : '') + (c.rowSpan > 1 ? '~r' + c.rowSpan : '')).join('|')); },
    cell: (t, r, c) => __Q.Tables.grid(t).g[r][c].cell,
    rect: el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
    clickTab: id => document.getElementById('tab-' + id).click(),
    btn: (label) => Array.from(document.querySelectorAll('.rpanel.active button')).find(b => (b.getAttribute('aria-label') || '').trim() === label || (b.textContent || '').trim() === label),
  };
  return true;
}"""
async def ev(page, label, js, arg=None):
    r = await page.evaluate(js, arg) if arg is not None else await page.evaluate(js)
    print(label, json.dumps(r, ensure_ascii=False)[:600])
    return r

async def run(p, dark=False, width=1400, height=1000, tag='lt'):
    b, page, errors = await new_page(p, width=width, height=height, dark=dark)
    await load(page)
    await page.evaluate("() => __Q.openDoc(__Q.newDocModel({ title: 'Tables', html: '<p>Intro</p><p><br></p><p>After</p>' }))")
    await page.wait_for_timeout(200)
    await page.evaluate(HELP)
    await page.evaluate("() => { const p = document.querySelectorAll('#editor p')[1]; const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Tables.insert(3, 4); __Q.change(() => { const G = __Q.Tables.grid(T.tbl()); G.rows.forEach((r, i) => Array.from(r.cells).forEach((c, j) => { c.querySelector('p').textContent = String.fromCharCode(65 + j) + (i + 1); })); }, { full: true }); }")
    await page.wait_for_timeout(150)
    # click into B2
    r = await page.evaluate("() => T.rect(T.cell(T.tbl(), 1, 1))")
    await page.mouse.click(r['x'] + r['w'] - 12, r['y'] + r['h'] / 2)
    await page.wait_for_timeout(150)
    await ev(page, 'ctx tabs', "() => [Array.from(document.querySelectorAll('#tabs .tab')).filter(t => !t.hidden).map(t => t.textContent), !!document.getElementById('tab-tlayout')]")
    await page.evaluate("() => T.clickTab('tdesign')")
    await page.wait_for_timeout(120)
    await page.screenshot(path=f'shots/ui/{tag}-tdesign.png', clip={'x': 0, 'y': 0, 'width': width, 'height': 190})
    if tag != 'lt':
        for e in errors: print('ERR', e)
        await b.close(); return
    # Split Cells dialog from the ribbon
    await page.evaluate("() => T.clickTab('tdesign')")
    await page.evaluate("() => T.btn('Split Cells').click()")
    await page.wait_for_timeout(120)
    await page.fill('#dlgSplitCols', '3'); await page.fill('#dlgSplitRows', '2')
    await page.screenshot(path='shots/ui/lt-split.png')
    await page.keyboard.press('Enter')
    await page.wait_for_timeout(150)
    await ev(page, 'split 3x2', "() => T.shape(T.tbl())")
    await page.evaluate("() => __Q.undo()")
    # Insert Cells via the launcher
    await page.evaluate("() => { const c = T.cell(T.tbl(), 1, 1); const r = document.createRange(); r.selectNodeContents(c.querySelector('p')); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }")
    await page.evaluate("() => document.querySelector('.rpanel.active .rgroup[aria-label=\"Rows & Columns\"] .launcher').click()")
    await page.wait_for_timeout(120)
    await page.click('label[for="insCells-right"]')
    await page.click('.dialog footer .btn.primary')
    await page.wait_for_timeout(120)
    await ev(page, 'insert cells right', "() => T.shape(T.tbl())")
    await page.evaluate("() => __Q.undo()")
    # Delete › Delete Cells… › shift up
    await page.evaluate("() => { const c = T.cell(T.tbl(), 1, 1); const r = document.createRange(); r.selectNodeContents(c.querySelector('p')); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }")
    await page.evaluate("() => T.btn('Delete').click()")
    await page.wait_for_timeout(100)
    await page.evaluate("() => Array.from(document.querySelectorAll('.pop .mi')).find(b => b.textContent.includes('Delete Cells')).click()")
    await page.wait_for_timeout(150)
    await page.click('label[for="delCells-up"]')
    await page.click('.dialog footer .btn.primary')
    await page.wait_for_timeout(120)
    await ev(page, 'delete cells up', "() => T.shape(T.tbl())")
    await page.evaluate("() => __Q.undo()")
    # Split Table
    await page.evaluate("() => { const c = T.cell(T.tbl(), 2, 0); const r = document.createRange(); r.selectNodeContents(c.querySelector('p')); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }")
    await page.evaluate("() => T.btn('Split Table').click()")
    await page.wait_for_timeout(120)
    await ev(page, 'split table', "() => [document.querySelectorAll('#editor table').length, T.shape(T.tbl(0)), T.shape(T.tbl(1))]")
    await page.evaluate("() => __Q.undo()")
    await page.wait_for_timeout(100)
    # Borders and Shading from the Table Design launcher
    await page.evaluate("() => { const c = T.cell(T.tbl(), 0, 0); const r = document.createRange(); r.selectNodeContents(c.querySelector('p')); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); T.clickTab('tdesign'); }")
    await page.evaluate("() => document.querySelector('.rpanel.active .rgroup[aria-label=\"Borders\"] .launcher').click()")
    await page.wait_for_timeout(150)
    await page.screenshot(path='shots/ui/lt-bsd-borders.png')
    await page.select_option('#bsdApplyB', 'table')
    await page.evaluate("() => Array.from(document.querySelectorAll('.set-b')).find(b => b.textContent.trim() === 'Grid').click()")
    await page.select_option('#bsdBWidth', '1.5')
    await page.screenshot(path='shots/ui/lt-bsd-grid.png')
    await page.click('.dialog footer .btn.primary')
    await page.wait_for_timeout(150)
    await ev(page, 'grid applied', "() => { const t = T.tbl(); return ['--bt', '--bh', '--bv'].map(k => t.style.getPropertyValue(k)); }")
    # diagonal via the dialog preview buttons, on one cell
    await page.evaluate("() => { const c = T.cell(T.tbl(), 1, 1); const r = document.createRange(); r.selectNodeContents(c.querySelector('p')); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.CMD.bordersShading(); }")
    await page.wait_for_timeout(150)
    await page.click('button[aria-label="Diagonal up border"]')
    await page.click('.dialog footer .btn.primary')
    await page.wait_for_timeout(120)
    await ev(page, 'diag up', "() => T.cell(T.tbl(), 1, 1).getAttribute('data-du')")
    # shading tab
    await page.evaluate("() => { const c = T.cell(T.tbl(), 0, 3); const r = document.createRange(); r.selectNodeContents(c.querySelector('p')); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.CMD.bordersShading(); }")
    await page.wait_for_timeout(150)
    await page.evaluate("() => Array.from(document.querySelectorAll('.bsd-tab')).find(b => b.textContent === 'Shading').click()")
    await page.select_option('#bsdPat', 'pct25')
    await page.screenshot(path='shots/ui/lt-bsd-shading.png')
    await page.click('.dialog footer .btn.primary')
    await page.wait_for_timeout(120)
    await ev(page, 'shading pct25', "() => { const c = T.cell(T.tbl(), 0, 3); return [c.getAttribute('data-shd'), getComputedStyle(c).backgroundColor]; }")
    # page border
    await page.evaluate("() => __Q.CMD.pageBorder()")
    await page.wait_for_timeout(150)
    await page.evaluate("() => Array.from(document.querySelectorAll('.bsd-panel[data-p=page] .set-b')).find(b => b.textContent.trim() === 'Shadow').click()")
    await page.screenshot(path='shots/ui/lt-bsd-page.png')
    await page.click('.dialog footer .btn.primary')
    await page.wait_for_timeout(200)
    await ev(page, 'page border', "() => [JSON.stringify(__Q.S.doc.page.border), document.querySelectorAll('#sheets .pborder').length, getComputedStyle(document.querySelector('#sheets .pborder')).boxShadow]")
    # Draw Table: a box below the text, then a line through it, then the eraser on that line
    await page.evaluate("() => T.clickTab('tdesign')")
    await page.evaluate("() => T.btn('Draw Table').click()")
    after = await page.evaluate("() => T.rect(Array.from(document.querySelectorAll('#editor p')).pop())")
    x0, y0 = after['x'] + 40, after['y'] + after['h'] + 30
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x0 + 300, y0 + 80, steps=10); await page.mouse.up()
    await page.wait_for_timeout(150)
    n = await ev(page, 'drawn table', "() => { const ts = document.querySelectorAll('#editor table'); const t = ts[ts.length - 1]; return [ts.length, T.shape(t), t.style.width, getComputedStyle(t.rows[0].cells[0]).borderTopStyle]; }")
    nt = await page.evaluate("() => { const ts = document.querySelectorAll('#editor table'); return T.rect(ts[ts.length - 1]); }")
    mx = nt['x'] + nt['w'] / 2
    await page.mouse.move(mx, nt['y'] - 6); await page.mouse.down(); await page.mouse.move(mx + 1, nt['y'] + nt['h'] + 6, steps=8); await page.mouse.up()
    await page.wait_for_timeout(150)
    await ev(page, 'line split', "() => { const ts = document.querySelectorAll('#editor table'); return T.shape(ts[ts.length - 1]); }")
    hy = nt['y'] + nt['h'] / 2
    await page.mouse.move(nt['x'] - 6, hy); await page.mouse.down(); await page.mouse.move(nt['x'] + nt['w'] * 0.4, hy + 1, steps=8); await page.mouse.up()
    await page.wait_for_timeout(150)
    await ev(page, 'h line split left part', "() => { const ts = document.querySelectorAll('#editor table'); return T.shape(ts[ts.length - 1]); }")
    await page.screenshot(path='shots/ui/lt-drawn.png')
    await page.evaluate("() => T.btn('Eraser').click()")
    await page.wait_for_timeout(80)
    nt2 = await page.evaluate("() => { const ts = document.querySelectorAll('#editor table'); const t = ts[ts.length - 1]; return T.rect(t.rows[0].cells[0]); }")
    await page.mouse.click(nt2['x'] + nt2['w'], nt2['y'] + nt2['h'] / 2)
    await page.wait_for_timeout(150)
    await ev(page, 'erased vertical', "() => { const ts = document.querySelectorAll('#editor table'); return T.shape(ts[ts.length - 1]); }")
    await page.keyboard.press('Escape')
    await ev(page, 'mode off', "() => [__Q.TDraw.mode, document.getElementById('paper').className]")
    for e in errors: print('ERR', e)
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p)
        await run(p, dark=True, tag='dk')
        await run(p, width=420, height=860, tag='ph')
asyncio.run(main())
