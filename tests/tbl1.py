import asyncio, sys, json
sys.path.insert(0, 'tests')
from harness import *

HELPERS = r"""() => {
  window.T = {
    tbl: (i = 0) => document.querySelectorAll('#editor table')[i],
    shape: t => { const G = __Q.Tables.grid(t); return G.rows.map(r => Array.from(r.cells).map(c => (c.textContent.trim() || '.') + (c.colSpan > 1 ? '~c' + c.colSpan : '') + (c.rowSpan > 1 ? '~r' + c.rowSpan : '')).join('|')); },
    cell: (t, r, c) => { const G = __Q.Tables.grid(t); return G.g[r][c].cell; },
    caret: el => { __Q.Tables.sel = null; const p = el.querySelector('p') || el; const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); },
    fill: t => { const G = __Q.Tables.grid(t); G.rows.forEach((r, i) => Array.from(r.cells).forEach((c, j) => { c.querySelector('p').textContent = String.fromCharCode(65 + j) + (i + 1); })); },
    cs: (el, p) => getComputedStyle(el)[p],
  };
  return true;
}"""

async def step(page, label, js):
    r = await page.evaluate(js)
    print(label, json.dumps(r, ensure_ascii=False))
    return r

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000)
        await load(page)
        await page.evaluate("() => __Q.openDoc(__Q.newDocModel({ title: 'Tables', html: '<p>Intro</p><p><br></p><p>After</p>' }))")
        await page.wait_for_timeout(200)
        await page.evaluate(HELPERS)
        await page.evaluate("() => { const p = document.querySelectorAll('#editor p')[1]; const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Tables.insert(3, 3); __Q.change(() => T.fill(T.tbl()), { full: true }); }")
        await page.wait_for_timeout(100)
        await step(page, 'start', "() => T.shape(T.tbl())")
        # split one cell into two columns
        await step(page, 'split 2x1', "async () => { T.caret(T.cell(T.tbl(), 1, 1)); __Q.Tables.splitCells(2, 1); await new Promise(r => setTimeout(r, 50)); return T.shape(T.tbl()); }")
        await step(page, 'undo', "async () => { __Q.undo(); await new Promise(r => setTimeout(r, 50)); return T.shape(T.tbl()); }")
        await step(page, 'split 1x2', "async () => { T.caret(T.cell(T.tbl(), 1, 1)); __Q.Tables.splitCells(1, 2); await new Promise(r => setTimeout(r, 50)); return T.shape(T.tbl()); }")
        await step(page, 'undo', "async () => { __Q.undo(); await new Promise(r => setTimeout(r, 50)); return T.shape(T.tbl()); }")
        await step(page, 'merge A1:B2 then split 2x2', "async () => { const t = T.tbl(); __Q.Tables.setRect(T.cell(t, 0, 0), T.cell(t, 1, 1)); __Q.Tables.merge(); const a = T.shape(t); T.caret(T.cell(t, 0, 0)); __Q.Tables.splitCells(2, 2); return [a, T.shape(T.tbl())]; }")
        await step(page, 'undo x2', "async () => { __Q.undo(); __Q.undo(); return T.shape(T.tbl()); }")
        await step(page, 'insert shift down', "async () => { T.caret(T.cell(T.tbl(), 1, 1)); __Q.Tables.insertCells('down'); return T.shape(T.tbl()); }")
        await step(page, 'undo', "async () => { __Q.undo(); return T.shape(T.tbl()); }")
        await step(page, 'insert shift right', "async () => { T.caret(T.cell(T.tbl(), 1, 1)); __Q.Tables.insertCells('right'); return T.shape(T.tbl()); }")
        await step(page, 'undo', "async () => { __Q.undo(); return T.shape(T.tbl()); }")
        await step(page, 'delete shift left', "async () => { T.caret(T.cell(T.tbl(), 1, 1)); __Q.Tables.deleteCells('left'); return T.shape(T.tbl()); }")
        await step(page, 'undo', "async () => { __Q.undo(); return T.shape(T.tbl()); }")
        await step(page, 'delete shift up', "async () => { T.caret(T.cell(T.tbl(), 1, 1)); __Q.Tables.deleteCells('up'); return T.shape(T.tbl()); }")
        await step(page, 'undo', "async () => { __Q.undo(); return T.shape(T.tbl()); }")
        await step(page, 'insert rows above x2 (2 rows selected)', "async () => { const t = T.tbl(); __Q.Tables.setRect(T.cell(t, 0, 0), T.cell(t, 1, 0)); __Q.Tables.insertRow(false); return T.shape(T.tbl()); }")
        await step(page, 'undo', "async () => { __Q.undo(); return T.shape(T.tbl()); }")
        await step(page, 'split table at row 2', "async () => { T.caret(T.cell(T.tbl(), 1, 0)); __Q.Tables.splitTable(); return [document.querySelectorAll('#editor table').length, T.shape(T.tbl(0)), T.shape(T.tbl(1)), T.tbl(0).nextElementSibling.tagName]; }")
        await step(page, 'undo', "async () => { __Q.undo(); return [document.querySelectorAll('#editor table').length, T.shape(T.tbl())]; }")
        # borders
        await step(page, 'table box red 1.5', """async () => { const t = T.tbl(); T.caret(T.cell(t, 0, 0)); const red = { style: 'solid', width: 1.5, color: '#c00000' };
          __Q.change(() => __Q.Borders.applyTable(t, { top: red, bottom: red, left: red, right: red, insideH: null, insideV: null }), { full: true });
          await new Promise(r => setTimeout(r, 80));
          const a = T.cell(t, 0, 0), m = T.cell(t, 1, 1), z = T.cell(t, 2, 2);
          return { cls: t.className, edgeA: a.getAttribute('data-edge'), aTop: T.cs(a, 'borderTopStyle') + ' ' + T.cs(a, 'borderTopWidth') + ' ' + T.cs(a, 'borderTopColor'), aBottom: T.cs(a, 'borderBottomStyle'), mid: T.cs(m, 'borderTopStyle') + '/' + T.cs(m, 'borderLeftStyle'), zRight: T.cs(z, 'borderRightStyle') + ' ' + T.cs(z, 'borderRightWidth') }; }""")
        await step(page, 'cell B2 bottom dashed blue', """async () => { const t = T.tbl(); const R = { r1: 1, c1: 1, r2: 1, c2: 1 }; const blue = { style: 'dashed', width: 0.75, color: '#2f5597' };
          __Q.change(() => __Q.Borders.applyCells(t, R, { bottom: blue }), { full: true });
          return { b2: T.cs(T.cell(t, 1, 1), 'borderBottomStyle'), b3top: T.cs(T.cell(t, 2, 1), 'borderTopStyle'), state: JSON.stringify(__Q.Borders.cellState(t, R)) }; }""")
        await step(page, 'diag + shading', """async () => { const t = T.tbl(); T.caret(T.cell(t, 1, 1)); __Q.Borders.quick('diagDown');
          const c3 = T.cell(t, 2, 2); __Q.change(() => { __Q.Borders.shade(c3, { fill: null, pat: 'pct20', color: '#000000' }); __Q.Borders.shade(T.cell(t, 0, 2), { fill: '#fff2cc', pat: 'horzStripe', color: '#c00000' }); }, { full: true });
          const b2 = T.cell(t, 1, 1);
          return { dd: b2.getAttribute('data-dd'), bgimg: T.cs(b2, 'backgroundImage').slice(0, 40), c3bg: T.cs(c3, 'backgroundColor'), stripe: T.cs(T.cell(t, 0, 2), 'backgroundImage').slice(0, 30), stripeBg: T.cs(T.cell(t, 0, 2), 'backgroundColor') }; }""")
        # paragraph box over three paragraphs
        await step(page, 'para box', """async () => { const ed = document.getElementById('editor'); const ps = []; for (const s of ['One line', 'Two line', 'Three line']) { const p = document.createElement('p'); p.textContent = s; ed.appendChild(p); ps.push(p); }
          const pen = { style: 'solid', width: 0.75, color: '#000000' };
          __Q.change(() => __Q.Borders.applyParas(ps, { top: pen, bottom: pen, left: pen, right: pen, insideH: null }), { full: true });
          await new Promise(r => setTimeout(r, 120));
          return ps.map(p => [p.getAttribute('data-bj'), T.cs(p, 'borderTopStyle'), T.cs(p, 'borderBottomStyle'), T.cs(p, 'marginBottom'), T.cs(p, 'paddingBottom')]); }""")
        await step(page, 'clean html has no derived marks', "() => { const h = __Q.cleanHTML(); return [/data-edge/.test(h), /data-bj/.test(h), /--bjg/.test(h), /tbl-bd/.test(h)]; }")
        await page.screenshot(path='shots/tbl1-a.png')
        # docx round trip
        r = await step(page, 'docx round trip', """async () => { const blob = await __Q.buildDocx(); const buf = await blob.arrayBuffer();
          const zip = await JSZip.loadAsync(buf); const xml = await zip.file('word/document.xml').async('string');
          const out = { tl2br: /<w:tl2br /.test(xml), pct20: /w:val="pct20"/.test(xml), stripe: /w:val="horzStripe"/.test(xml), dashed: (xml.match(/w:val="dashed"/g) || []).length, red: (xml.match(/C00000/g) || []).length, pBdr: (xml.match(/<w:pBdr>/g) || []).length };
          const r = await __Q.readDocxFile(buf); const box = document.createElement('div'); box.innerHTML = r.html; const t = box.querySelector('table');
          out.imp = { cls: t.className, bt: t.style.getPropertyValue('--bt'), bh: t.style.getPropertyValue('--bh'), dd: !!t.querySelector('[data-dd]'), shd: Array.from(t.querySelectorAll('[data-shd]')).map(x => x.getAttribute('data-shd')), b2: (t.rows[1].cells[1].style.borderBottom || '') };
          out.paras = Array.from(box.querySelectorAll('p')).filter(p => /border/.test(p.getAttribute('style') || '')).map(p => p.getAttribute('style'));
          return out; }""")
        # painter ops
        await step(page, 'paint ops', """async () => { const P = await __Q.collectPaint(); const k = {}; for (const op of P.ops) k[op.t] = (k[op.t] || 0) + 1; const reds = P.ops.filter(o => o.t === 'line' && /192, 0, 0/.test(o.color)).length; return { kinds: k, reds }; }""")
        for e in errors: print('ERR', e)
        await b.close()
if __name__ == "__main__":
    asyncio.run(main())
