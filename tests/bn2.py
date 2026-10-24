"""Bangla page numbers and Bangla + English dates. Page Number's Bangla choices (১, পৃষ্ঠা ১,
পৃষ্ঠা ১ এর ৩, ১/৩, - ২ - from page 2), one set of numbers at a time, the Bangla Digits switch both
ways (Page … of … ⇄ পৃষ্ঠা … এর …, the sections' format), ক, খ, গ numbering, Go To and Start at with
Bangla digits, Word (the document variable that keeps the format, read back) and the PDF. The
Bangla calendar against known dates (the 2019 revision and the rule before it) and every day from
1990 to 2040 both ways; Insert › Date & Time (English, বঙ্গাব্দ, খ্রিস্টাব্দ, the letter date block),
More Formats (another day by either calendar, two-digit days, a selected date written again), the
block in Word (on the right, the line under the Bangla date) and read back, AutoComplete and Fill
Fields offering today's date, the header's Bangla date; phone width; dark."""
import asyncio, sys, json, base64, io, zipfile, re, os, datetime, unicodedata, subprocess
sys.path.insert(0, 'tests')
from harness import *

fails = []
def ok(cond, what, got=None):
    print(('  ok   ' if cond else '  FAIL ') + what + ('' if cond or got is None else '  -> ' + json.dumps(got, ensure_ascii=False)[:900]))
    if not cond: fails.append(what)

N = lambda s: unicodedata.normalize('NFC', s)
BND = '০১২৩৪৫৬৭৮৯'
def bn(s): return ''.join(BND[int(c)] if c.isdigit() else c for c in str(s))
BS = [N(x) for x in ['বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন', 'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র']]
GM = [N(x) for x in ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']]
# known days: newspapers' datelines, the national days the 2019 revision fixed, the rule before it
KNOWN = [
    ((2026, 9, 22), '৭ আশ্বিন ১৪৩৩'),     # bdnews24: "২২ সেপ্টেম্বর ২০২৬, ০৭ আশ্বিন ১৪৩৩"
    ((2026, 10, 20), '৪ কার্তিক ১৪৩৩'),
    ((2020, 2, 21), '৮ ফাল্গুন ১৪২৬'),    # Ekushey: 8 Falgun from 1426
    ((2027, 2, 21), '৮ ফাল্গুন ১৪৩৩'),
    ((2026, 3, 26), '১২ চৈত্র ১৪৩২'),     # Independence Day
    ((2025, 12, 16), '১ পৌষ ১৪৩২'),       # Victory Day
    ((2026, 4, 14), '১ বৈশাখ ১৪৩৩'),      # Pahela Baishakh
    ((2026, 4, 13), '৩০ চৈত্র ১৪৩২'),
    ((2026, 8, 15), '৩১ শ্রাবণ ১৪৩৩'),
    ((2027, 3, 14), '২৯ ফাল্গুন ১৪৩৩'),    # Falgun 29 days (February 2027 has 28)
    ((2028, 3, 14), '৩০ ফাল্গুন ১৪৩৪'),    # 30 in a leap year
    ((2019, 2, 21), '৯ ফাল্গুন ১৪২৫'),     # before 1426: Bhadra 31, Falgun 30
    ((2018, 12, 16), '২ পৌষ ১৪২৫'),
    ((2016, 3, 14), '৩১ ফাল্গুন ১৪২২'),    # before 1426: Falgun 31 in a leap year
]
def bs_today():
    """today's Bangla date by the rule, written independently of Folio's code"""
    d = datetime.date.today()
    leap = lambda y: y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
    def ml(y, m):
        lp = leap(y + 594)
        if y >= 1426: return 31 if m < 6 else ((30 if lp else 29) if m == 10 else 30)
        return 31 if m < 5 else (31 if m == 10 and lp else 30)
    y0 = d.year if d >= datetime.date(d.year, 4, 14) else d.year - 1
    y, days, m = y0 - 593, (d - datetime.date(y0, 4, 14)).days, 0
    while m < 11 and days >= ml(y, m): days -= ml(y, m); m += 1
    return y, m, days + 1
SHEETS = "() => [...document.querySelectorAll('#sheets .sheet')].map(s => [...s.querySelectorAll('.hfx')].map(x => (x.classList.contains('hdr') ? 'H:' : 'F:') + x.innerText.replace(/\\s+/g, ' ').trim()))"
GET_DOCX = """async () => { const blob = await __Q.buildDocx(); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); }"""
OPEN_DOCX = """async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = await __Q.readDocxFile(u.buffer); r.title = 'Imported'; await __Q.openImported(r); return true; }"""
def pdf_pages_text(path):
    n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout).group(1))
    return [subprocess.run(['pdftotext', '-f', str(i), '-l', str(i), '-layout', path, '-'], capture_output=True, text=True).stdout for i in range(1, n + 1)]
LONG = ''.join(f'<p>Paragraph {i} ' + 'text ' * 90 + '</p>' for i in range(22))

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=900, mock_caps=True, gfonts=True)
        await load(page)
        st = lambda js, *a: page.evaluate(js, *a)
        async def fresh(html='<p><br></p>', title='Bangla'):
            await st("([h, t]) => __Q.openDoc(__Q.newDocModel({ title: t, html: h }))", [html, title])
            await page.wait_for_timeout(350)
            await page.click('#editor')
            await st("() => { const e = document.getElementById('editor'); const r = document.createRange(); r.selectNodeContents(e.lastElementChild); r.collapse(false); __Q.setRange(r); }")
        async def menu(cap):
            await st("() => __Q.UI.selectTab('insert')")
            await page.locator(f'.rb:visible:has(.cap:text-is("{cap}"))').first.click()
            await page.wait_for_timeout(200)
        async def pick(text, exact=False):
            await page.locator('.pop .mi', has_text=re.compile(r'^\s*' + re.escape(text) + r'\s*$') if exact else text).first.click()
            await page.wait_for_timeout(450)

        print('1. Page Number: the Bangla choices')
        await fresh(LONG, 'Bangla pages')
        n = await st("() => __Q.S.pages")
        ok(n >= 3, f'a document of {n} pages')
        await menu('Page Number')
        items = await st("() => [...document.querySelectorAll('.pop .mi, .pop .mh')].map(x => x.textContent.trim())")
        want = ['Bottom center: ১', 'Bottom center: পৃষ্ঠা ১', 'Bottom right: পৃষ্ঠা ১ এর ৩', 'Bottom center: ১/৩', 'Top center, from page 2: - ২ -', 'Bangla Digits (১, ২, ৩)']
        ok(all(N(w) in [N(i) for i in items] for w in want), 'the menu has a Bangla group: ১, পৃষ্ঠা ১, পৃষ্ঠা ১ এর ৩, ১/৩, - ২ - from page 2, and Bangla Digits', items)
        await pick('Bottom right: পৃষ্ঠা ১ এর ৩')
        sh = await st(SHEETS)
        ok(all(sh[i] == [N(f'F:পৃষ্ঠা {bn(i + 1)} এর {bn(n)}')] for i in range(n)), 'পৃষ্ঠা ১ এর ৩ on every page, the page count in Bangla too', sh)
        await menu('Page Number')
        await pick('Bottom center: ১/৩')
        sh = await st(SHEETS)
        ok(all(sh[i] == [f'F:{bn(i + 1)}/{bn(n)}'] for i in range(n)), 'Bottom center ১/৩ takes the place of the numbers before (one set at a time)', sh)
        await menu('Page Number')
        await pick('Top center, from page 2')
        sh = await st(SHEETS)
        r = await st("() => [__Q.S.doc.firstDiff, __Q.S.doc.hf.footer.def]")
        ok(sh[0] == [] and all(sh[i] == [f'H:- {bn(i + 1)} -'] for i in range(1, n)) and r[0] and r[1] == '', '- ২ - at the top from page 2 (Different First Page on, the footer\'s numbers gone)', [sh, r])
        await st("() => __Q.undo()")
        await page.wait_for_timeout(400)
        sh = await st(SHEETS)
        ok(sh[0] == [f'F:{bn(1)}/{bn(n)}'] and not await st("() => __Q.S.doc.firstDiff"), 'one Undo puts it all back', sh)

        print('2. Bangla Digits, both ways')
        await st("() => __Q.HF.removeNumbers()")
        await st("() => __Q.HF.pageNumbers('footer', 'right', 'of')")
        await page.wait_for_timeout(400)
        await menu('Page Number')
        chk = await st("() => { const m = [...document.querySelectorAll('.pop .mi')].find(x => /Bangla Digits/.test(x.textContent)); return m && (m.getAttribute('aria-checked') || m.classList.contains('on') || !!m.querySelector('.chk, .check, svg')); }")
        await pick('Bangla Digits')
        sh = await st(SHEETS)
        pn = await st("() => JSON.stringify(__Q.S.doc.pn)")
        ok(all(sh[i] == [N(f'F:পৃষ্ঠা {bn(i + 1)} এর {bn(n)}')] for i in range(n)) and '"bn"' in pn, '“Page 1 of 3” becomes “পৃষ্ঠা ১ এর ৩” and the document numbers its pages ১, ২, ৩', [sh, pn])
        ok(await st("() => __Q.HF.bnNumbersOn()"), 'the switch shows on')
        await menu('Page Number')
        labels = await st("() => [...document.querySelectorAll('.pop .mi')].slice(0, 4).map(x => x.textContent.trim())")
        ok(N(labels[0]) == N('Bottom center: ১') and N(labels[1]) == N('Bottom right: পৃষ্ঠা ১ এর ৩'), 'with it on, the first choices are Bangla too', labels)
        await pick('Bangla Digits')
        sh = await st(SHEETS)
        ok(all(sh[i] == [f'F:Page {i + 1} of {n}'] for i in range(n)) and await st("() => !__Q.S.doc.pn"), 'off again: Page 1 of 3, the format back to 1, 2, 3', sh)

        print('3. ক, খ, গ; Go To and Start at in Bangla digits')
        await st("() => __Q.HF.removeNumbers()")
        await st("() => __Q.HF.pageNumbers('footer', 'center')")
        await page.wait_for_timeout(300)
        await st("() => __Q.Dialogs.pageNumberFormat()")
        await page.wait_for_timeout(250)
        opts = await st("() => [...document.querySelectorAll('#pnFmt option')].map(o => o.textContent)")
        ok(N('ক, খ, গ') in [N(o) for o in opts], 'Page Number Format offers ক, খ, গ', opts)
        await page.select_option('#pnFmt', 'bnk')
        await page.select_option('#pnMode', 'start')
        await page.fill('#pnStart', '৩')
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(450)
        sh = await st(SHEETS)
        alpha = [N(x) for x in ['গ', 'ঘ', 'ঙ', 'চ', 'ছ']]
        ok(all(N(sh[i][0]) == 'F:' + alpha[i] for i in range(min(n, 5))), 'starting at ৩ in ক, খ, গ: গ, ঘ, ঙ …', sh)
        await st("() => __Q.Dialogs.goTo()")
        await page.wait_for_timeout(200)
        await page.fill('#gtPage', '২')
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(1000)
        gt = await st("() => { const c = document.getElementById('canvas'); const y = __Q.Grid.pos(1).y * __Q.S.zoom + document.getElementById('zoomBox').offsetTop - 12; return [Math.round(c.scrollTop), Math.round(Math.min(y, c.scrollHeight - c.clientHeight))]; }")
        ok(abs(gt[0] - gt[1]) <= 4 and gt[1] > 300, 'Go To takes ২ for page 2', gt)

        print('4. Word and PDF')
        await st("() => { __Q.HF.removeNumbers(); __Q.HF.reopen(() => __Q.Sections.setPn(__Q.Sections.list()[0], null)); }")
        await page.wait_for_timeout(300)
        await st("() => __Q.HF.pageNumbers('footer', 'right', 'of', 'bn')")
        await page.wait_for_timeout(400)
        await st("() => __Q.HF.bnNumbers(true)")
        await page.wait_for_timeout(300)
        b64 = await st(GET_DOCX)
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64)))
        sx = z.read('word/settings.xml').decode()
        foots = [z.read(nm).decode() for nm in z.namelist() if re.match(r'word/footer\d+\.xml', nm)]
        ok('w:docVar w:name="FolioPageNumbers" w:val="bn"' in sx and '<w:compat>' in sx and sx.index('<w:compat>') < sx.index('<w:docVars>'), 'Word: the Bangla format kept in a document variable (after compat, as Word orders them)', sx[-400:])
        ok(any('PAGE' in f and N('পৃষ্ঠা') in N(f) and '১' in f and 'NUMPAGES' in f for f in foots), 'the footer: PAGE and NUMPAGES fields showing ১ and the page count, পৃষ্ঠা … এর …', [f[-600:] for f in foots])
        await st(OPEN_DOCX, b64)
        await page.wait_for_timeout(800)
        back = await st("() => ({ pn: __Q.S.doc.pn, nums: [...__Q.S.doc.hf.footer.def.matchAll(/data-num=\"(\\w+)\"/g)].map(m => m[1]) })")
        sh = await st(SHEETS)
        ok(back['pn'] and back['pn']['fmt'] == 'bn' and back['nums'] == ['bn', 'bn'] and N(sh[1][0]) == N(f'F:পৃষ্ঠা ২ এর {bn(len(sh))}'), 'read back: still ১, ২, ৩ (the variable and the fields\' Bangla numbers)', [back, sh[:2]])
        r = await st("""async () => { await document.fonts.ready; const blob = await __Q.buildVectorPdf({ title: 'pn' }); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        open('shots/bn2.pdf', 'wb').write(base64.b64decode(r))
        txt = pdf_pages_text('shots/bn2.pdf')
        ok(N(f'২ এর {bn(len(txt))}') in N(txt[1]), 'the PDF prints the Bangla numbers', txt[1][-200:])

        print('5. The Bangla calendar')
        got = await st("k => k.map(([d]) => __Q.BnDate.fmt(new Date(d[0], d[1] - 1, d[2]), 'bs-plain'))", KNOWN)
        bad = [[k[0], g, k[1]] for k, g in zip(KNOWN, got) if N(g) != N(k[1])]
        ok(not bad, f'{len(KNOWN)} known days (newspapers, national days, leap Falgun, the rule before 1426)', bad)
        rt = await st("""() => { let bad = 0, n = 0; for (let x = new Date(1990, 0, 1); x < new Date(2041, 0, 1); x.setDate(x.getDate() + 1)) { n++; const b = __Q.toBs(x), y = __Q.fromBs(b.y, b.m, b.d); if (!y || y.getFullYear() !== x.getFullYear() || y.getMonth() !== x.getMonth() || y.getDate() !== x.getDate()) bad++; } const len = []; for (let y = 1396; y <= 1448; y++) { let t = 0; for (let m = 0; m < 12; m++) t += __Q.bsMonthLen(y, m); len.push(t); } return [n, bad, len.every(t => t === 365 || t === 366)]; }""")
        ok(rt[1] == 0 and rt[2], f'every day 1990–2040 ({rt[0]}) goes to its Bangla date and back; every year is 365 or 366 days', rt)
        y, m, d = bs_today()
        today_bs = N(f'{bn(d)} {BS[m]} {bn(y)} বঙ্গাব্দ')
        t = datetime.date.today()
        today_g = N(f'{bn(t.day)} {GM[t.month - 1]} {bn(t.year)} খ্রিস্টাব্দ')
        ok(N(await st("() => __Q.BnDate.fmt(new Date(), 'bs')")) == today_bs, 'today by an independent reckoning: ' + today_bs)
        parsed = await st("""() => ['২০ অক্টোবর ২০২৬', '৪ কার্তিক ১৪৩৩ বঙ্গাব্দ', 'তারিখ: ০৪ কার্তিক ১৪৩৩ বঙ্গাব্দ / ২০ অক্টোবর ২০২৬ খ্রিস্টাব্দ', 'October 20, 2026', '20 Oct 2026', '20/10/2026', '২০-১০-২০২৬', '2026-10-20', 'Tuesday, 20 October 2026', '4 Kartik 1433 BS', '20th October, 2026', 'hello', '31/02/2026', '৩০ ফাল্গুন ১৪৩৩'].map(s => { const d = __Q.BnDate.parse(s); return d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-') : null; })""")
        ok(parsed[:11] == ['2026-10-20'] * 11 and parsed[11:] == [None] * 3, 'dates written either way are read (and impossible ones are not)', parsed)

        print('6. Insert › Date & Time')
        await fresh('<p>Dhaka</p><p><br></p>', 'Dates')
        await menu('Date & Time')
        items = [N(x) for x in await st("() => [...document.querySelectorAll('.pop .mi, .pop .mh')].map(x => x.textContent.trim())")]
        ok(today_bs in items and today_g in items and any(i.startswith('Letter date: তারিখ:') for i in items) and 'More Formats and Other Dates…' in items, 'the menu: English, বঙ্গাব্দ, খ্রিস্টাব্দ, the letter date block, More Formats', items)
        await pick(today_bs, exact=True)
        ok(N(await st("() => document.getElementById('editor').lastElementChild.textContent")) == today_bs, 'বঙ্গাব্দ goes in at the cursor')
        await st("() => __Q.undo()")
        await page.wait_for_timeout(250)
        await menu('Date & Time')
        await page.locator('.pop .mi', has_text='Letter date: তারিখ:').click()
        await page.wait_for_timeout(500)
        blk = await st("""() => { const t = document.querySelector('#editor table'); if (!t) return null; const c = [...t.querySelectorAll('td')]; const cs = getComputedStyle(t); const r = t.getBoundingClientRect(), e = document.querySelector('#editor > p').getBoundingClientRect();
          return { cells: c.map(x => x.innerText.trim()), rs: c[0].rowSpan, line: getComputedStyle(c[1]).borderBottomStyle + ' ' + getComputedStyle(c[1]).borderBottomWidth, under: getComputedStyle(c[2]).borderBottomStyle, right: Math.abs(r.right - e.right) < 3, left: r.left - e.left > 100 }; }""")
        ok(blk and N(blk['cells'][0]) == 'তারিখ:' and N(blk['cells'][1]) == today_bs and N(blk['cells'][2]) == today_g and blk['rs'] == 2 and blk['line'].startswith('solid') and blk['under'] == 'none' and blk['right'] and blk['left'],
           'the letter date block: তারিখ: beside the Bangla date over the English one, a line between, on the right', blk)
        b64 = await st(GET_DOCX)
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64)))
        doc = z.read('word/document.xml').decode()
        tbl = re.search(r'<w:tbl>.*?</w:tbl>', doc, re.S).group(0)
        ok('<w:jc w:val="right"/>' in tbl and 'w:vMerge w:val="restart"' in tbl and '<w:vMerge/>' in tbl and re.search(r'<w:tcBorders><w:bottom w:val="single"', tbl) and '<w:tblW w:w="0" w:type="auto"/>' in tbl, 'Word: a table on the right that fits its text, তারিখ: in merged cells, the line under the Bangla date', tbl[:700])
        await st(OPEN_DOCX, b64)
        await page.wait_for_timeout(700)
        back = await st("() => { const t = document.querySelector('#editor table'); return t && [t.style.marginLeft, t.style.marginRight, t.querySelector('td').rowSpan, [...t.querySelectorAll('td')].map(x => x.innerText.trim())]; }")
        ok(back and back[0] == 'auto' and back[2] == 2 and N(back[3][1]) == today_bs, 'read back: still on the right, the same three cells', back)

        print('7. More Formats and Other Dates')
        await fresh('<p>The meeting is on 21 February 2027 at the office.</p>', 'Dialog')
        await st("""() => { const t = document.querySelector('#editor p').firstChild; const i = t.data.indexOf('21 February 2027'); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 16); __Q.setRange(r); }""")
        await st("() => __Q.BnDate.dialog()")
        await page.wait_for_timeout(400)
        dl = await st("() => ({ g: document.getElementById('dtG').value, d: document.getElementById('dtBd').value, m: document.getElementById('dtBm').value, y: document.getElementById('dtBy').value, btn: document.querySelector('.dialog footer .btn.primary').textContent, note: document.querySelector('.dt-note').textContent, groups: [...document.querySelectorAll('.dt-head')].map(x => x.textContent) })")
        ok(dl['g'] == '2027-02-21' and dl['d'] == '৮' and dl['m'] == '10' and dl['y'] == '১৪৩৩' and dl['btn'] == 'Replace', 'a selected date comes up in it, in both calendars (৮ ফাল্গুন ১৪৩৩), to be replaced', dl)
        await page.click('.dt-opt[data-id="bs"]')
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(450)
        txt = N(await st("() => document.querySelector('#editor p').textContent"))
        ok(txt == N('The meeting is on ৮ ফাল্গুন ১৪৩৩ বঙ্গাব্দ at the office.'), 'Replace writes it in the Bangla calendar', txt)
        ok(await st("() => __Q.Prefs.dateFmt") == 'bs', 'the format is remembered for next time')
        await st("() => { const p = document.querySelector('#editor p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); __Q.setRange(r); }")
        await st("() => __Q.BnDate.dialog()")
        await page.wait_for_timeout(350)
        ok(await st("() => document.querySelector('.dt-opt[aria-selected=true]').dataset.id") == 'bs' and await st("() => document.querySelector('.dialog footer .btn.primary').textContent") == 'Insert', 'next time it opens on that format, to insert')
        # a Bangla calendar day: the English date follows
        await page.fill('#dtBd', '১')
        await page.select_option('#dtBm', '0')
        await page.fill('#dtBy', '১৪৩৪')
        await page.wait_for_timeout(150)
        ok(await st("() => document.getElementById('dtG').value") == '2027-04-14', 'typing ১ বৈশাখ ১৪৩৪ sets the English date to 14 April 2027', await st("() => document.getElementById('dtG').value"))
        await page.fill('#dtBd', '৩২')
        await page.wait_for_timeout(100)
        ok(await st("() => document.getElementById('dtBd').classList.contains('bad') && document.getElementById('dtG').value === '2027-04-14'"), 'a day the month does not have is marked, nothing changes')
        await page.fill('#dtG', '2026-12-16')
        await page.dispatch_event('#dtG', 'change')
        await page.check('#dtPad')
        await page.wait_for_timeout(150)
        opts = {x['id']: N(x['t']) for x in await st("() => [...document.querySelectorAll('.dt-opt')].map(o => ({ id: o.dataset.id, t: o.getAttribute('aria-label') || o.textContent }))")}
        ok(opts['bs'] == N('০১ পৌষ ১৪৩৩ বঙ্গাব্দ') and opts['en-dmy'] == '16 December 2026' and opts['g-bn-num'] == '১৬/১২/২০২৬' and opts['bs-en'] == '01 Poush 1433 BS' and opts['block'] == N('তারিখ: ০১ পৌষ ১৪৩৩ বঙ্গাব্দ / ১৬ ডিসেম্বর ২০২৬ খ্রিস্টাব্দ'), 'picking 16 December 2026: ০১ পৌষ ১৪৩৩ with two-digit days, and every format for that day', opts)
        await page.click('.dt-opt[data-id="g-bn-wd"]')
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(400)
        txt = N(await st("() => document.querySelector('#editor p').textContent"))
        ok(txt.endswith(N('বুধবার, ১৬ ডিসেম্বর ২০২৬')), 'Insert puts the picked day in, in Bangla with its weekday', txt[-40:])
        await st("() => { __Q.Prefs.datePad = false; __Q.Prefs.dateFmt = ''; }")

        print('8. AutoComplete, Fill Fields, the header')
        await fresh('<p><br></p>', 'Auto')
        mon = await st("() => __Q.BnDate.fmt(new Date(), 'bs-my').split(' ')[0]")
        await page.keyboard.insert_text(mon[:3])
        await page.wait_for_timeout(300)
        sug = [N(x) for x in await st("() => [...document.querySelectorAll('.ac-bubble [role=option] b')].map(x => x.textContent.trim())")]
        ok(sug and sug[0] == today_bs, f'typing {mon[:3]}… (this month) offers today\'s date first', sug[:6])
        await page.keyboard.press('Enter')
        await page.wait_for_timeout(250)
        ok(N(await st("() => document.getElementById('editor').textContent")).strip() == today_bs, 'Enter puts it in', await st("() => document.getElementById('editor').textContent"))
        await fresh('<p>তারিখ: [তারিখ]</p><p>Date: [Date]</p>', 'Fields')
        await st("() => __Q.CMD.fillFields()")
        await page.wait_for_timeout(400)
        await page.click('.fields-list input[aria-label="তারিখ"]')
        await page.wait_for_timeout(200)
        sug = [N(x) for x in await st("() => [...document.querySelectorAll('.fld-sug:not([hidden]) .fld-opt')].map(o => o.textContent)")]
        ok(N(f'{today_bs} / {today_g}') in sug and today_bs in sug, '[তারিখ] in Fill Fields offers today in both calendars', sug)
        await st("() => document.querySelector('.fields-list input[aria-label=\"Date\"]').focus()")
        await page.wait_for_timeout(200)
        sug = await st("() => [...document.querySelectorAll('.fld-sug:not([hidden]) .fld-opt')].map(o => o.textContent)")
        ok(t.strftime('%d %B %Y').lstrip('0') in sug, '[Date] offers today in English', sug)
        await st("() => __Q.closePane && __Q.closePane()")
        await st("() => { __Q.HF.edit('header', 0); }")
        await page.wait_for_timeout(300)
        await st("() => __Q.HF.field('BSDATE')")
        await st("() => __Q.HF.field('DATE', 'bn')")
        await st("() => __Q.HF.close()")
        await page.wait_for_timeout(350)
        sh = await st(SHEETS)
        ok(sh and N(sh[0][0]).startswith('H:' + today_bs) and N(f'{bn(t.day)} {GM[t.month - 1]} {bn(t.year)}') in N(sh[0][0]), 'the header shows today in বঙ্গাব্দ and in Bangla', sh)
        b64 = await st(GET_DOCX)
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64)))
        hd = ''.join(z.read(nm).decode() for nm in z.namelist() if re.match(r'word/header\d+\.xml', nm))
        ok(N(today_bs) in N(hd) and 'DATE' not in hd, 'Word: the Bangla dates go as text (a DATE field would turn English)', hd[-500:])

        print('9. Phone and dark')
        b2, page2, errors2 = await new_page(p, width=390, height=844, mock_caps=True, dark=True)
        await load(page2)
        st2 = lambda js, *a: page2.evaluate(js, *a)
        await st2("() => __Q.openDoc(__Q.newDocModel({ title: 'Phone', html: '<p><br></p>' }))")
        await page2.wait_for_timeout(300)
        await st2("() => __Q.BnDate.dialog()")
        await page2.wait_for_timeout(400)
        fit = await st2("() => { const d = document.querySelector('.dialog').getBoundingClientRect(); return [d.left >= 0, d.right <= innerWidth + 1, document.documentElement.scrollWidth <= innerWidth, [...document.querySelectorAll('.dialog .dt-ctl > *')].every(x => x.getBoundingClientRect().right <= d.right + 1)]; }")
        ok(fit == [True] * 4, 'phone: the Date and Time dialog fits', fit)
        col = await st2("() => { const o = document.querySelector('.dt-opt'); return [getComputedStyle(o).color, getComputedStyle(document.querySelector('.dialog')).backgroundColor]; }")
        ok(col[0] != col[1], 'dark: its text is readable', col)
        await page2.screenshot(path='shots/bn2-phone-dark.png')
        await b2.close()
        await page.screenshot(path='shots/bn2.png')
        for e in errors + [e for e in errors2 if 'favicon' not in e[1]]: print('ERR', e)
        await b.close()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')
asyncio.run(main())
