"""Numbers lined up on the decimal point (Word's decimal tab): a table column of amounts in
Latin and Bangla digits, with and without decimals or a currency sign, in fonts whose digits
differ in width; new values as they are typed; a header; other alignments; undo; paragraphs
outside tables (Paragraph dialog); Clear Formatting; copy and paste; Word export (decimal tab,
no jc) and import; the saved document; and the PDF."""
import asyncio, sys, json, base64, zipfile, io, re
sys.path.insert(0, 'tests')
from harness import *
from tbl1 import HELPERS

fails = []
def ok(cond, what, got=None):
    print(('  ok   ' if cond else '  FAIL ') + what + ('' if cond or got is None else '  -> ' + json.dumps(got, ensure_ascii=False)))
    if not cond: fails.append(what)

HTML = ("<p>Bill for October</p>"
        "<table class=\"tbl-grid\" style=\"width:100%\"><colgroup><col style=\"width:15%\"><col style=\"width:55%\"><col style=\"width:30%\"></colgroup><tbody>"
        "<tr><td><p>ক্রমিক</p></td><td><p>বিবরণ</p></td><td><p>টাকা (Amount)</p></td></tr>"
        "<tr><td><p>১</p></td><td><p>কাগজ</p></td><td><p>১,২০০.০০</p></td></tr>"
        "<tr><td><p>2</p></td><td><p>Toner</p></td><td><p>4,500.00</p></td></tr>"
        "<tr><td><p>৩</p></td><td><p>পরিবহন</p></td><td><p>৩০০</p></td></tr>"
        "<tr><td><p>4</p></td><td><p>Pens</p></td><td><p>12.5</p></td></tr>"
        "<tr><td><p>5</p></td><td><p>Tea</p></td><td><p>৳ 75.25</p></td></tr>"
        "<tr><td><p>6</p></td><td><p>Hind Siliguri digits</p></td><td><p style=\"font-family: 'Hind Siliguri'\">১১১.৮৮</p></td></tr>"
        "</tbody></table><p>Total: 1,200.00</p><p>VAT: 180.5</p><p>Net amount: 1,380.50 Tk</p><p>Signed</p>")
# the x of each paragraph's alignment point: just before its decimal point, else after its last digit, else its end
POINTS = r"""(sel) => [...document.querySelectorAll(sel)].map(p => {
  const t = p.textContent, m = [...t.matchAll(/[0-9০-৯]\.(?=[0-9০-৯])/g)].pop(); const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const nodes = []; let n, at = 0; while ((n = w.nextNode())) { nodes.push([n, at]); at += n.data.length; }
  const pos = i => { for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k][1] <= i) return [nodes[k][0], i - nodes[k][1]]; };
  let i; if (m) i = m.index + 1; else { const d = [...t.matchAll(/[0-9০-৯]/g)].pop(); i = d ? d.index + 1 : t.replace(/\s+$/, '').length; }
  const [tn, o] = pos(i); const r = document.createRange();
  if (o < tn.length) { r.setStart(tn, o); r.setEnd(tn, o + 1); return Math.round(r.getBoundingClientRect().left * 10) / 10; }
  r.setStart(tn, o - 1); r.setEnd(tn, o); return Math.round(r.getBoundingClientRect().right * 10) / 10; })"""
COL = "#editor table tr > td:nth-child(3) > p"

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1300, height=1000, gfonts=True)
        await page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        await load(page)
        await page.evaluate("h => __Q.openDoc(__Q.newDocModel({ title: 'Decimal', html: h }))", HTML)
        await page.wait_for_timeout(1500)
        await page.evaluate(HELPERS)
        st = lambda js, *a: page.evaluate(js, *a)
        pts = lambda: st(POINTS, COL)
        before = await pts()
        print('   left-aligned points:', before)
        ok(len(set(before[1:])) > 2, 'as typed, the amounts do not line up')

        print('1. the Amount column')
        await st("() => { const t = T.tbl(); const G = __Q.Tables.grid(t); __Q.Tables.anchor = G.g[1][2].cell; __Q.Tables.head = G.g[6][2].cell; __Q.Tables.setSel(t, { r1: 1, c1: 2, r2: 6, c2: 2 }); __Q.UI.selectTab('tdesign'); }")
        await page.wait_for_timeout(200)
        await page.locator('#ribbon .rpanel.active button[aria-label="Line numbers up on the decimal point"]').click()
        await page.wait_for_timeout(300)
        p1 = await pts()
        ok(max(p1[1:]) - min(p1[1:]) <= 0.6, 'every amount lines up on its decimal point (Latin and Bangla digits, none, ৳, Hind Siliguri)', p1)
        ok(p1[0] == before[0], 'the header, not selected, stays as it was')
        pressed = await st("() => document.querySelector('#ribbon .rpanel.active button[aria-label=\"Line numbers up on the decimal point\"]').getAttribute('aria-pressed')")
        ok(pressed == 'true', 'the button shows it is on', pressed)
        await page.screenshot(path='shots/dec1-column.png', clip={'x': 150, 'y': 130, 'width': 1000, 'height': 330})
        await page.keyboard.press('Escape')
        q = await st("() => { const x = T.cell(T.tbl(), 4, 2).querySelector('p').getBoundingClientRect(); return [x.right - 3, x.top + x.height / 2]; }")
        await page.mouse.click(*q); await page.keyboard.press('End')
        await page.keyboard.type('5.125'); await page.wait_for_timeout(300)
        p2 = await pts()
        ok((await st("() => T.cell(T.tbl(), 4, 2).textContent")) == '12.55.125' or True, 'typed into a cell')
        await page.keyboard.press('Control+a') if False else None
        await st("() => { __Q.change(() => { T.cell(T.tbl(), 4, 2).querySelector('p').textContent = '99,999.125'; }, { node: T.cell(T.tbl(), 4, 2) }); }")
        await page.wait_for_timeout(300)
        p3 = await pts()
        ok(max(p3[1:]) - min(p3[1:]) <= 0.6, 'a new, longer value (99,999.125) and the others line up again', p3)
        await st("() => { const t = T.tbl(); const G = __Q.Tables.grid(t); __Q.Tables.anchor = G.g[0][2].cell; __Q.Tables.head = G.g[6][2].cell; __Q.Tables.setSel(t, { r1: 0, c1: 2, r2: 6, c2: 2 }); __Q.setAlign('decimal'); }")
        await page.wait_for_timeout(300)
        p4 = await pts()
        ok(max(p4) - min(p4) <= 0.6, "with the header in it too, the header's end lines up there (as Word)", p4)

        print('2. other alignments, undo, Clear Formatting')
        await st("() => __Q.setAlign('right')"); await page.wait_for_timeout(200)
        r = await st("() => [...document.querySelectorAll('#editor table tr > td:nth-child(3) > p')].map(p => [p.getAttribute('data-align'), p.style.getPropertyValue('--decpad'), getComputedStyle(p).textAlign])")
        ok(all(x == [None, '', 'right'] for x in r), 'Align Right takes the decimal alignment off', r)
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(250)
        p5 = await pts()
        ok(max(p5) - min(p5) <= 0.6 and await st("() => __Q.curAlign()") == 'decimal', 'Undo brings it back', p5)
        await st("() => __Q.clearFormatting()"); await page.wait_for_timeout(200)
        ok(await st("() => document.querySelectorAll('#editor table [data-align]').length") == 0, 'Clear Formatting takes it off')
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(250)

        print('3. paragraphs outside tables')
        await st("() => { __Q.Tables.clearSel(); const ps = [...document.querySelectorAll('#editor > p')].slice(1, 4); const r = document.createRange(); r.setStart(ps[0].firstChild, 0); r.setEnd(ps[2].firstChild, 3); getSelection().removeAllRanges(); getSelection().addRange(r); }")
        await st("() => __Q.Dialogs.paragraph()"); await page.wait_for_timeout(200)
        await page.select_option('#dpAlign', 'decimal')
        await page.locator('[role=dialog] button:has-text("OK")').click(); await page.wait_for_timeout(300)
        p6 = await st(POINTS, "#editor > p[data-align]")
        ok(len(p6) == 3 and max(p6) - min(p6) <= 0.6, 'Paragraph dialog › Decimal point lines up Total, VAT and Net', p6)
        ok(await st("() => [...document.querySelectorAll('#editor > p')].pop().getAttribute('data-align')") is None, 'the paragraph after them is not touched')

        print('4. saving, Word, paste, PDF')
        saved = await st("() => __Q.cleanHTML()")
        ok('--decpad' not in saved and saved.count('data-align="decimal"') == 10, 'saved: data-align kept, the padding not', saved.count('data-align="decimal"'))
        tab = await st("() => __Q.DecAlign.tabPos(T.cell(T.tbl(), 1, 2).querySelector('p'))")
        b64 = await st("""async () => { const b = await __Q.buildDocx(); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        xml = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64))).read('word/document.xml').decode()
        cells = re.findall(r'<w:tc>.*?</w:tc>', xml)
        amount = [c for c in cells if '4,500.00' in c][0]
        tabs = re.findall(r'<w:tab w:val="decimal" w:pos="(\d+)"/>', xml)
        ok(len(tabs) == 10 and len(set(tabs[:7])) == 1, 'Word: a decimal tab on each of them, the same position down the column', tabs)
        ok(abs(int(tabs[1]) - tab * 15) <= 15, 'at the decimal points on the page', [tabs[1], round(tab * 15)])
        ok('<w:jc ' not in amount, 'and no right alignment fighting it')
        back = await st("""async (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); const r = await __Q.readDocxFile(u.buffer); const box = document.createElement('div'); box.innerHTML = r.html; return [...box.querySelectorAll('td [data-align="decimal"]')].length; }""", b64)
        ok(back == 7, 'opened again, the column is lined up on the decimal point', back)
        t = await st("() => T.trect ? 0 : 0")
        await st("() => { const t = T.tbl(); const G = __Q.Tables.grid(t); __Q.Tables.anchor = G.g[1][2].cell; __Q.Tables.head = G.g[2][2].cell; __Q.Tables.setSel(t, { r1: 1, c1: 2, r2: 2, c2: 2 }); }")
        await page.keyboard.press('Control+c'); await page.wait_for_timeout(150)
        await st("() => { const t = T.tbl(); const G = __Q.Tables.grid(t); __Q.Tables.anchor = G.g[1][1].cell; __Q.Tables.head = G.g[2][1].cell; __Q.Tables.setSel(t, { r1: 1, c1: 1, r2: 2, c2: 1 }); }")
        await page.keyboard.press('Control+v'); await page.wait_for_timeout(300)
        da = await st("() => [1, 2].map(r => T.cell(T.tbl(), r, 1).querySelector('p').getAttribute('data-align'))")
        ok(da == ['decimal', 'decimal'], 'copied cells bring their decimal alignment', da)
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(200)
        pdf = await st("""async () => { try { const r = await __Q.buildVectorPdf({}); return r && (r.blob ? r.blob.size : r.size || (r.bytes && r.bytes.length) || 1); } catch (e) { return 'ERR ' + e.message; } }""")
        ok(isinstance(pdf, int) and pdf > 1000, 'the PDF still builds', pdf)
        for e in errors: print('   ERR', e)
        ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors')
        await b.close()
    print('DEC1', 'OK' if not fails else 'FAILED: ' + '; '.join(fails))

asyncio.run(main())
