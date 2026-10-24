import asyncio, sys, json
sys.path.insert(0, 'tests')
from harness import *

WORD = """<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><body>
<p class=MsoNormal style='border:none;border-bottom:solid windowtext 1.5pt;padding:0in 0in 1.0pt 0in'>Ministry of Planning<o:p></o:p></p>
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'>
<tr><td width=200 style='border:solid windowtext 1.0pt;padding:0in 5.4pt'><p class=MsoNormal>Name</p></td><td width=200 style='border:solid windowtext 1.0pt;border-left:none;padding:0in 5.4pt'><p class=MsoNormal>Role</p></td></tr>
<tr><td width=200 style='border:dashed #C00000 1.5pt;border-top:none;padding:0in 5.4pt'><p class=MsoNormal>Rahim</p></td><td width=200 style='border-top:none;border-left:none;border-bottom:solid windowtext 1.0pt;border-right:solid windowtext 1.0pt;padding:0in 5.4pt'><p class=MsoNormal>Officer</p></td></tr></table>
<p class=MsoNormal>Text with a <span style='border:solid windowtext 1.0pt;padding:0in'>boxed word</span> inside.</p>
</body></html>"""

async def ev(page, label, js, arg=None):
    r = await page.evaluate(js, arg) if arg is not None else await page.evaluate(js)
    print(label, json.dumps(r, ensure_ascii=False)[:900])
    return r

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000)
        await load(page)
        await page.evaluate("() => __Q.openDoc(__Q.newDocModel({ title: 'Paste', html: '<p>Start</p><p><br></p>' }))")
        await page.wait_for_timeout(200)
        await page.evaluate("() => { const p = document.querySelectorAll('#editor p')[1]; const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); }")
        await page.evaluate("(html) => __Q.doPaste('keep', html, 'x', false)", WORD)
        await page.wait_for_timeout(200)
        await ev(page, 'word paste', """() => { const ed = document.getElementById('editor'); const t = ed.querySelector('table'); const p = ed.querySelector('p[style*=border]');
          return { pStyle: p && p.getAttribute('style'), tcls: t.className, vars: t.style.getPropertyValue('--bh'), cells: Array.from(t.querySelectorAll('td')).map(td => td.getAttribute('style')), span: (ed.querySelector('span[data-tb]') || {}).outerHTML }; }""")
        # internal copy & paste of a table with its own borders
        await ev(page, 'internal copy/paste', """async () => {
          const ed = document.getElementById('editor'); const t = ed.querySelector('table');
          __Q.change(() => { __Q.Borders.applyTable(t, { top: { style: 'double', width: 0.75, color: '#1d6a50' }, bottom: { style: 'double', width: 0.75, color: '#1d6a50' }, left: null, right: null, insideH: { style: 'solid', width: 0.5, color: '#000000' }, insideV: null }); t.rows[0].cells[0].setAttribute('data-dd', '0.5pt solid #000000'); __Q.decoSync(t.rows[0].cells[0]); }, { full: true });
          const r = document.createRange(); r.setStartBefore(t); r.setEndAfter(t); getSelection().removeAllRanges(); getSelection().addRange(r);
          const dt = new DataTransfer(); const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }); ed.dispatchEvent(ev);
          const html = dt.getData('text/html');
          const last = ed.lastElementChild; const rr = document.createRange(); rr.selectNodeContents(last); rr.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(rr);
          __Q.doPaste('keep', html, 'x', false);
          await new Promise(r => setTimeout(r, 150));
          const ts = ed.querySelectorAll('table'); const t2 = ts[ts.length - 1];
          return { n: ts.length, cls: t2.className, bt: t2.style.getPropertyValue('--bt'), bh: t2.style.getPropertyValue('--bh'), dd: t2.rows[0].cells[0].getAttribute('data-dd'), top: getComputedStyle(t2.rows[0].cells[0]).borderTopStyle }; }""")
        # Home › Borders on two paragraphs
        await ev(page, 'quick borders on paragraphs', """async () => {
          const ed = document.getElementById('editor'); const a = document.createElement('p'); a.textContent = 'Para A'; const c = document.createElement('p'); c.textContent = 'Para B'; ed.appendChild(a); ed.appendChild(c);
          const r = document.createRange(); r.setStart(a.firstChild, 1); r.setEnd(c.firstChild, 2); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Tables.sel = null;
          __Q.Borders.quick('outside'); await new Promise(r => setTimeout(r, 80));
          const s1 = [a.getAttribute('data-bj'), c.getAttribute('data-bj'), getComputedStyle(a).borderBottomStyle];
          getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Borders.quick('inside'); await new Promise(r => setTimeout(r, 80));
          const s2 = [getComputedStyle(a).borderBottomStyle, a.style.getPropertyValue('--bbtw')];
          getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Borders.quick('none'); await new Promise(r => setTimeout(r, 80));
          return { s1, s2, after: [a.getAttribute('style'), a.getAttribute('data-bj')] }; }""")
        # text border through the dialog
        await page.evaluate("""() => { const ed = document.getElementById('editor'); const p = document.createElement('p'); p.textContent = 'Please sign here today'; ed.appendChild(p);
          const r = document.createRange(); r.setStart(p.firstChild, 7); r.setEnd(p.firstChild, 16); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.Tables.sel = null; __Q.CMD.bordersShading(); }""")
        await page.wait_for_timeout(150)
        await ev(page, 'dialog target', "() => [document.getElementById('bsdApplyB').value, Array.from(document.getElementById('bsdApplyB').options).map(o => o.value)]")
        await page.evaluate("() => Array.from(document.querySelectorAll('.bsd-panel[data-p=borders] .set-b')).find(b => b.textContent.trim() === 'Box').click()")
        await page.evaluate("() => Array.from(document.querySelectorAll('.bsd-tab')).find(b => b.textContent === 'Shading').click()")
        await page.select_option('#bsdPat', 'pct10')
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(150)
        await ev(page, 'text border + shading', "() => { const p = document.getElementById('editor').lastElementChild; return p.innerHTML; }")
        await ev(page, 'undo text border', "() => { __Q.undo(); return document.getElementById('editor').lastElementChild.innerHTML; }")
        # docx of the text border
        await ev(page, 'redo + docx run border', """async () => { __Q.redo(); const blob = await __Q.buildDocx(); const zip = await JSZip.loadAsync(await blob.arrayBuffer()); const xml = await zip.file('word/document.xml').async('string'); return { bdr: (xml.match(/<w:bdr [^>]*>/g) || []).slice(0, 3), pct10: /w:val="pct10"/.test(xml) }; }""")
        # quick borders on a cell range: toggle all twice
        await ev(page, 'quick table borders', """async () => { const t = document.querySelector('#editor table'); __Q.Tables.setRect(t.rows[0].cells[0], t.rows[1].cells[1]);
          __Q.Borders.quick('none'); const a = getComputedStyle(t.rows[0].cells[0]).borderRightStyle;
          __Q.Tables.setRect(t.rows[0].cells[0], t.rows[1].cells[1]); __Q.Borders.quick('all'); const b = getComputedStyle(t.rows[0].cells[0]).borderRightStyle;
          __Q.Tables.setRect(t.rows[0].cells[0], t.rows[1].cells[1]); __Q.Borders.quick('diagUp'); const c = t.rows[1].cells[1].getAttribute('data-du');
          return [a, b, c]; }""")
        await page.screenshot(path='shots/tbl3.png')
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
