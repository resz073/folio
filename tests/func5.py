import asyncio, sys
sys.path.insert(0, 'tests')
from harness import *

WORD_HTML = """<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><style>p.MsoNormal{margin:0in;font-size:11.0pt;font-family:"Calibri",sans-serif;}</style></head><body lang=EN-US>
<p class=MsoNormal><b><span style='font-size:14.0pt;color:#1F3864'>Meeting notes<o:p></o:p></span></b></p>
<p class=MsoListParagraphCxSpFirst style='margin-left:.5in;text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp; </span></span><![endif]>Budget approved<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='margin-left:.5in;text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp; </span></span><![endif]>Next review in <i>March</i><o:p></o:p></p>
<p class=MsoNormal style='margin-left:.5in;text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>First step<o:p></o:p></p>
<p class=MsoNormal style='margin-left:.5in;text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span>2.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>Second step<o:p></o:p></p>
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'><tr><td width=200 style='border:solid windowtext 1.0pt;padding:0in 5.4pt'><p class=MsoNormal>Name<o:p></o:p></p></td><td width=200 style='border:solid windowtext 1.0pt;padding:0in 5.4pt'><p class=MsoNormal>Role<o:p></o:p></p></td></tr></table>
</body></html>"""
GDOCS_HTML = """<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;color:#000000;background-color:transparent;font-weight:700;font-style:normal;vertical-align:baseline;white-space:pre-wrap;">Bold heading text</span></p><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400;font-style:italic;white-space:pre-wrap;">An italic line</span><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400;text-decoration:underline;white-space:pre-wrap;"> and underlined</span></p></b>"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000)
        await load(page)
        await page.evaluate("() => __Q.newFromTemplate('welcome')")
        await page.wait_for_timeout(300)
        # ---- find & replace
        r = await page.evaluate("""async () => {
          const out = {};
          __Q.Find.open(true, 'the'); await new Promise(r => setTimeout(r, 50)); out.the = __Q.Find.matches.length;
          document.getElementById('findWord').checked = true; __Q.Find.search(); out.theWord = __Q.Find.matches.length;
          document.getElementById('findWord').checked = false; document.getElementById('findRegex').checked = true; document.getElementById('findQ').value = 'Ctrl\\\\+[A-Z]'; __Q.Find.search(); out.regex = __Q.Find.matches.length;
          document.getElementById('findRegex').checked = false; document.getElementById('findQ').value = 'Folio'; __Q.Find.search(); out.folio = __Q.Find.matches.length;
          document.getElementById('findR').value = 'Quill'; __Q.Find.replaceAll(); await new Promise(r => setTimeout(r, 50));
          out.afterReplace = (document.getElementById('editor').textContent.match(/Quill/g) || []).length; out.leftFolio = (document.getElementById('editor').textContent.match(/Folio/g) || []).length;
          __Q.undo(); await new Promise(r => setTimeout(r, 50)); out.afterUndo = (document.getElementById('editor').textContent.match(/Folio/g) || []).length;
          __Q.Find.close();
          return out; }""")
        print('find', r)
        # ---- AutoCorrect while typing
        await page.evaluate("() => { const ed = document.getElementById('editor'); const p = document.createElement('p'); p.innerHTML = '<br>'; ed.insertBefore(p, ed.firstChild); const r = document.createRange(); r.setStart(p, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); ed.focus(); }")
        await page.keyboard.type('i think teh plan is good. it starts tommorow (c) 2026 -- ok... done -> next ')
        t = await page.evaluate("() => document.getElementById('editor').firstElementChild.textContent")
        print('autocorrect:', repr(t))
        # ---- Quick Parts: save, then autocomplete with two letters
        await page.evaluate("""() => { const ed = document.getElementById('editor'); const p = document.createElement('p'); p.innerHTML = '<b>Dhaka Office</b>, House 12, Road 5, Dhanmondi'; ed.insertBefore(p, ed.firstChild); const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r); __Q.QuickParts.saveSelection('Office address'); }""")
        await page.evaluate("() => { const ed = document.getElementById('editor'); const p = document.createElement('p'); p.innerHTML = '<br>'; ed.insertBefore(p, ed.firstChild); const r = document.createRange(); r.setStart(p, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); ed.focus(); }")
        await page.keyboard.type('Of')
        await page.wait_for_timeout(250)
        bub = await page.evaluate("() => { const b = document.querySelector('.ac-bubble'); return b ? b.textContent : null; }")
        await page.keyboard.press('Enter')
        await page.wait_for_timeout(100)
        first = await page.evaluate("() => document.getElementById('editor').firstElementChild.innerHTML")
        print('autocomplete bubble:', bub, '| inserted:', first)
        # ---- paste from Word and Google Docs
        for name, html in (('word', WORD_HTML), ('gdocs', GDOCS_HTML)):
            res = await page.evaluate("""(html) => { const ed = document.getElementById('editor'); const p = document.createElement('p'); p.innerHTML = '<br>'; ed.appendChild(p); const r = document.createRange(); r.setStart(p, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); const before = ed.children.length; __Q.doPaste('keep', html, ''); const added = Array.from(ed.children).slice(before - 1); return added.map(e => e.outerHTML).join('\\n').slice(0, 1500); }""", html)
            print('paste', name, '=>\n', res)
        # ---- word count, TOC
        await page.evaluate("() => __Q.newFromTemplate('report')")
        await page.wait_for_timeout(300)
        r2 = await page.evaluate("""async () => { const st = __Q.docStats(); __Q.Dialogs.wordCount(); await new Promise(r => setTimeout(r, 50)); const dlg = document.querySelector('.dialog'); const txt = dlg ? dlg.textContent : ''; dlg && dlg.querySelector('button') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          const toc = document.querySelector('#editor .toc'); const entries = toc ? toc.querySelectorAll('.te').length : -1;
          const hs = __Q.Toc.headings().length;
          // add a heading at the end and update
          const ed = document.getElementById('editor'); const h = document.createElement('h2'); h.textContent = 'Appendix'; ed.appendChild(h); __Q.Toc.update(true); await new Promise(r => setTimeout(r, 100));
          const entries2 = document.querySelectorAll('#editor .toc .te').length; const last = Array.from(document.querySelectorAll('#editor .toc .te')).pop();
          return { words: st.words, chars: st.chars, dialog: txt.replace(/\\s+/g, ' ').slice(0, 160), tocEntries: entries, headings: hs, afterAdd: entries2, lastEntry: last && last.textContent }; }""")
        print('stats/toc', r2)
        # ---- HTML and text export
        r3 = await page.evaluate("() => { const h = __Q.toStandaloneHtml(); const t = __Q.toPlainText(); return { htmlHasPage: /@page/.test(h), htmlTitle: (h.match(/<title>([^<]*)/) || [])[1], htmlLen: h.length, txtStart: t.slice(0, 160) }; }")
        print('html/txt', r3)
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
