"""Government letters and the office profile. File › New › সরকারি পত্র the first time: the Office
Profile (Bangla and English names, memo number, next number, website, phone, email, addresses),
then the letter's details (type, স্মারক নং, তারিখ, বিষয়, সূত্র, সংযুক্তি, প্রাপক and অনুলিপি from the
saved addresses, a new address, সংরক্ষণ নথি, page numbers from page 2). The letter: the office's
name centred, স্মারক নং with the Bangla date over the English one, বিষয় and সূত্র lined up, the text,
the signature block, the addressee on lines, the copies (/১(n), the heading, ১) ২) …), - ২ - at the
top from page 2, Bangla page numbers; the next number counts on; the first [field] selected. The
other types (অফিস আদেশ, প্রজ্ঞাপন, নোটিশ, English letter and office order), a logo, Insert › Office
Letter's parts at the cursor, Word (tables, the ১) list, the header) read back, the PDF, the
profile kept with the account (and in the browser without one); phone width; dark."""
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
GET_DOCX = """async () => { const blob = await __Q.buildDocx(); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); }"""
OPEN_DOCX = """async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = await __Q.readDocxFile(u.buffer); r.title = 'Imported'; await __Q.openImported(r); return true; }"""
SHEETS = "() => [...document.querySelectorAll('#sheets .sheet')].map(s => [...s.querySelectorAll('.hfx')].map(x => (x.classList.contains('hdr') ? 'H:' : 'F:') + x.innerText.replace(/\\s+/g, ' ').trim()))"
TEXT = "() => [...document.getElementById('editor').querySelectorAll('p, li')].filter(x => !x.closest('li') || x.tagName === 'LI').map(x => x.innerText.replace(/\\s+/g, ' ').trim()).filter(Boolean)"
def pdf_pages_text(path):
    n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout).group(1))
    return [subprocess.run(['pdftotext', '-f', str(i), '-l', str(i), '-layout', path, '-'], capture_output=True, text=True).stdout for i in range(1, n + 1)]
ADDRS = ['সচিব, স্বাস্থ্য সেবা বিভাগ, বাংলাদেশ সচিবালয়, ঢাকা।', 'মহাপরিচালক, স্বাস্থ্য অধিদপ্তর, মহাখালী, ঢাকা।', 'জেলা প্রশাসক, ঢাকা।']
LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVR42mNkYPhfz0AEYBxVSF+FjFQwahGGgpGgYDQZjAYDGAkGgLwqFAH3AG+nAAAAAElFTkSuQmCC'

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=900, mock_caps=True, gfonts=True)
        await load(page)
        st = lambda js, *a: page.evaluate(js, *a)
        today = datetime.date.today()
        bs_today, g_today = await st("() => __Q.BnDate.lines(new Date())")

        print('1. File › New › সরকারি পত্র, the first time: the office profile')
        await st("() => __Q.Backstage.open('new')")
        await page.wait_for_timeout(500)
        card = await st("() => { const b = [...document.querySelectorAll('.tpl')].find(x => x.querySelector('.tname').textContent === 'সরকারি পত্র'); return b && [b.querySelector('.thumb .mini') ? b.querySelector('.thumb .mini').innerText.includes('গণপ্রজাতন্ত্রী বাংলাদেশ সরকার') : 'no mini', !!b.title]; }")
        ok(card == [True, True], 'File › New has a সরকারি পত্র card, its picture a government letter', card)
        await page.locator('.tpl:has(.tname:text-is("সরকারি পত্র"))').click()
        await page.wait_for_timeout(600)
        d1 = await st("() => { const d = document.querySelector('.dialog'); return d && [d.querySelector('h2').textContent, d.querySelector('.note').textContent.slice(0, 30), document.getElementById('of-gov').value, [...d.querySelectorAll('.seg button')].map(x => x.textContent)]; }")
        ok(d1 and d1[0] == 'Office Profile' and d1[1].startswith('Fill this in once') and N(d1[2]) == N('গণপ্রজাতন্ত্রী বাংলাদেশ সরকার') and d1[3] == ['বাংলা', 'English'], 'the Office Profile comes first, the government\'s name filled in', d1)
        for k, v in {'#of-org': 'জনপ্রশাসন মন্ত্রণালয়', '#of-branch': 'প্রশাসন-১ শাখা', '#of-address': 'বাংলাদেশ সচিবালয়, ঢাকা', '#of-name': 'মোঃ রেজাউল করিম', '#of-title': 'উপসচিব'}.items():
            await page.fill(k, v)
        await page.fill('#of-memo', '05.00.0000.110.11.003.26')
        await page.fill('#of-next', '45')
        await page.fill('#of-web', 'www.mopa.gov.bd')
        await page.fill('#of-phone', '02-55100233')
        await page.fill('#of-email', 'admin1@mopa.gov.bd')
        await page.fill('#of-addrs', '\n'.join(ADDRS) + '\n\n' + ADDRS[2])
        await page.click('.seg button[data-l="en"]')
        en = await st("() => [document.getElementById('of-gov').value, document.getElementById('of-org').value, document.getElementById('of-org').placeholder, document.querySelector('label[for=of-org]').textContent]")
        ok(en[0].startswith('Government of the People') and en[1] == '' and en[2] == '(in English)' and en[3] == 'Ministry / Division', 'the English tab: its own names (an empty one asks for the English)', en)
        await page.fill('#of-org', 'Ministry of Public Administration')
        await page.fill('#of-branch', 'Admin-1 Section')
        await page.fill('#of-address', 'Bangladesh Secretariat, Dhaka')
        await page.fill('#of-name', 'Md. Rezaul Karim')
        await page.fill('#of-title', 'Deputy Secretary')
        await page.click('.seg button[data-l="bn"]')
        ok(N(await st("() => document.getElementById('of-org').value")) == N('জনপ্রশাসন মন্ত্রণালয়'), 'back on বাংলা the Bangla names are kept')
        await page.fill('#of-next', '4x')
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(300)
        ok(await st("() => !!document.getElementById('of-next') && document.activeElement.id === 'of-next'"), 'a next number that is not a number is refused')
        await page.fill('#of-next', '৪৫')
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(700)
        prof = await st("() => __Q.Office.prof")
        ok(prof['saved'] and N(prof['bn']['org']) == N('জনপ্রশাসন মন্ত্রণালয়') and prof['en']['org'] == 'Ministry of Public Administration' and prof['next'] == '৪৫' and [N(a) for a in prof['addrs']] == [N(a) for a in ADDRS], 'saved: both languages, the next number, the addresses (once each, blank lines dropped)', prof)
        cap = await st("() => window.__capLog.filter(x => x[0] === 'set' && /\\/profile\\/office\\/profile$/.test(x[1])).length")
        ok(cap >= 1, 'kept with the account (data/users/<id>/profile/office/profile)', cap)

        print('2. The letter\'s details')
        d2 = await st("""() => { const d = document.querySelector('.dialog'); return d && { title: d.querySelector('h2').textContent, types: [...document.querySelectorAll('#olType option')].map(o => o.textContent), memo: document.getElementById('olMemo').value, date: document.getElementById('olDate').value, note: d.querySelector('.ol-dnote').textContent, office: d.querySelector('.ol-office .note').textContent, rows: [...d.querySelectorAll('.ol-addr')].map(r => [r.querySelector('.ol-at').textContent, r.querySelectorAll('input').length]), focus: document.activeElement.id, labels: [...d.querySelectorAll('label[for=olMemo], label[for=olDate], label[for=olSubject], label[for=olRef]')].map(l => l.textContent) }; }""")
        ok(d2 and d2['title'] == 'Government Letter' and [N(t) for t in d2['types']] == [N(t) for t in ['সরকারি পত্র', 'অফিস আদেশ', 'প্রজ্ঞাপন', 'নোটিশ', 'Government letter (English)', 'Office order (English)']], 'then the letter: six kinds (সরকারি পত্র, অফিস আদেশ, প্রজ্ঞাপন, নোটিশ, English letter and order)', d2)
        ok(d2['memo'] == bn('05.00.0000.110.11.003.26.45') and d2['date'] == today.isoformat() and N(d2['note']) == N(f'{bs_today} / {g_today}') and d2['focus'] == 'olSubject', 'স্মারক নং from the profile with the next number, today in both calendars, the cursor in বিষয়', d2)
        ok(len(d2['rows']) == 3 and all(r[1] == 2 for r in d2['rows']) and [N(x) for x in d2['labels']] == [N(x) for x in ['স্মারক নং', 'তারিখ', 'বিষয়', 'সূত্র (থাকলে)']], 'the saved addresses, each with প্রাপক and অনুলিপি; Bangla labels', d2)
        await page.fill('#olSubject', 'সরকারি কর্মচারীদের প্রশিক্ষণ কর্মসূচি আয়োজন প্রসঙ্গে।')
        await page.fill('#olRef', 'মন্ত্রিপরিষদ বিভাগের স্মারক নং ০৪.০০.০০০০.৮১২.০৬.০০২.২৬-১১৫, তারিখ: ১০ অক্টোবর ২০২৬')
        await page.fill('#olAtt', '০২ (দুই) পাতা')
        rows = page.locator('.ol-addr')
        await rows.nth(0).locator('input').nth(0).check()
        await rows.nth(1).locator('input').nth(1).check()
        await rows.nth(2).locator('input').nth(1).check()
        await page.fill('#olNewAddr', 'বিভাগীয় কমিশনার, ঢাকা বিভাগ, ঢাকা।')
        await page.press('#olNewAddr', 'Enter')
        await page.wait_for_timeout(150)
        r4 = await st("() => [document.querySelectorAll('.ol-addr').length, !!document.querySelector('.dialog'), [...document.querySelectorAll('.ol-addr')].pop().querySelectorAll('input:checked').length, [...document.querySelectorAll('.ol-addr')].pop().querySelectorAll('input')[1].checked]")
        ok(r4 == [4, True, 1, True], 'Enter in “Another address” adds it (as a copy) without closing the dialog', r4)
        await rows.nth(2).locator('.ol-rm').click()
        await page.wait_for_timeout(100)
        ok(await st("() => document.querySelectorAll('.ol-addr').length") == 3, '× takes one off the saved list')
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(1500)

        print('3. The letter')
        t = [N(x) for x in await st(TEXT)]
        exp_head = [N(x) for x in ['গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'জনপ্রশাসন মন্ত্রণালয়', 'প্রশাসন-১ শাখা', 'বাংলাদেশ সচিবালয়, ঢাকা', 'www.mopa.gov.bd']]
        ok(t[:5] == exp_head, 'the office\'s name at the top, centred lines', t[:6])
        memo = N('স্মারক নং: ' + bn('05.00.0000.110.11.003.26.45'))
        ok(memo in t and N('তারিখ:') in t and N(bs_today) in t and N(g_today) in t, 'স্মারক নং in Bangla digits, তারিখ: with the Bangla date and the English one', [x for x in t if 'স্মারক' in x or 'তারিখ' in x][:3])
        geo = await st("""() => { const tb = [...document.querySelectorAll('#editor table')].find(x => x.innerText.includes('তারিখ')); const c = [...tb.querySelectorAll('td')]; return { rs: c.slice(0, 2).map(x => x.rowSpan), line: getComputedStyle(c[2]).borderBottomStyle, va: getComputedStyle(c[1]).verticalAlign, right: Math.round(tb.getBoundingClientRect().right - document.querySelector('#editor > p').getBoundingClientRect().right), wraps: c[0].querySelector('p').getClientRects().length === 1 && c[0].getBoundingClientRect().height < 2.5 * parseFloat(getComputedStyle(c[0]).lineHeight || 20) }; }""")
        ok(geo['rs'] == [2, 2] and geo['line'] == 'solid' and geo['va'] == 'middle' and abs(geo['right']) <= 2, 'the date as a fraction (a line between, তারিখ: in the middle), flush with the right margin', geo)
        sub = await st("() => { const tb = [...document.querySelectorAll('#editor table')].find(x => x.innerText.includes('বিষয়')); return [...tb.querySelectorAll('tr')].map(r => [...r.cells].map(c => c.innerText.trim())); }")
        ok([[N(c) for c in r] for r in sub] == [[N('বিষয়:'), N('সরকারি কর্মচারীদের প্রশিক্ষণ কর্মসূচি আয়োজন প্রসঙ্গে।')], [N('সূত্র:'), N('মন্ত্রিপরিষদ বিভাগের স্মারক নং ০৪.০০.০০০০.৮১২.০৬.০০২.২৬-১১৫, তারিখ: ১০ অক্টোবর ২০২৬')]] and await st("() => !![...document.querySelectorAll('#editor table')].find(x => x.innerText.includes('বিষয়')).querySelector('b')"), 'বিষয় (bold) and সূত্র lined up after their labels', sub)
        body = [x for x in t if x.startswith(N('উপর্যুক্ত')) or x.startswith(N('২।')) or x.startswith(N('৩।'))]
        ok(len(body) == 3 and N('উপর্যুক্ত বিষয় ও সূত্রের পরিপ্রেক্ষিতে জানানো যাচ্ছে যে, [পত্রের মূল বক্তব্য]।') == body[0], 'the text: “উপর্যুক্ত বিষয় ও সূত্রের পরিপ্রেক্ষিতে …”, then ২।, ৩।', body)
        ok(N('সংযুক্তি: ০২ (দুই) পাতা') in t, 'সংযুক্তি')
        i = t.index(N('(মোঃ রেজাউল করিম)'))
        ok(t[i + 1] == N('উপসচিব') and t[i + 2] == N('ফোন: ০২-৫৫১০০২৩৩') and t[i + 3] == N('ইমেইল: admin1@mopa.gov.bd') and t[i + 4:i + 7] == [N('সচিব'), N('স্বাস্থ্য সেবা বিভাগ'), N('বাংলাদেশ সচিবালয়, ঢাকা।')], 'signature: (name), designation, phone in Bangla digits, email; then the addressee on three lines', t[i:i + 7])
        sig = await st("() => { const p = [...document.querySelectorAll('#editor p')].find(x => x.textContent.startsWith('(')); const e = document.querySelector('#editor > p').getBoundingClientRect(); const r = p.getBoundingClientRect(); return [getComputedStyle(p).textAlign, Math.round(r.left - e.left)]; }")
        ok(sig[0] == 'center' and sig[1] > 250, 'the signature block on the right, centred', sig)
        cc = N('স্মারক নং: ' + bn('05.00.0000.110.11.003.26.45') + '/১(৩)')
        lst = await st("() => { const ol = document.querySelector('#editor ol'); return ol && [getComputedStyle(ol).listStyleType, [...ol.children].map(li => li.textContent)]; }")
        ok(cc in t and N('সদয় জ্ঞাতার্থে/জ্ঞাতার্থে ও প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য (জ্যেষ্ঠতার ক্রমানুসারে নয়):') in t, 'the copies: the memo number with /১(৩), the date again, “সদয় জ্ঞাতার্থে … (জ্যেষ্ঠতার ক্রমানুসারে নয়):”', [x for x in t if '/১(' in x])
        ok(lst and lst[0] == 'bn-close' and [N(x) for x in lst[1]] == [N(ADDRS[1]), N('বিভাগীয় কমিশনার, ঢাকা বিভাগ, ঢাকা।'), N('সংরক্ষণ নথি।')], 'বিতরণ numbered ১) ২) ৩), সংরক্ষণ নথি last', lst)
        mk = await st("() => { const ol = document.querySelector('#editor ol'); return __Q.markerString(ol.querySelector('li'), getComputedStyle(ol).listStyleType); }")
        ok(N(mk).startswith('১)'), 'the list\'s number is ১) (the PDF draws it so)', mk)
        doc = await st("() => ({ pages: __Q.S.pages, first: __Q.S.doc.firstDiff, pn: __Q.S.doc.pn, lang: __Q.S.doc.lang, size: __Q.S.doc.size, font: __Q.S.doc.font, page: [__Q.S.doc.page.size, __Q.S.doc.page.mt, __Q.S.doc.page.ml, __Q.S.doc.page.mr], title: __Q.S.doc.title, sel: getSelection().toString() })")
        sh = await st(SHEETS)
        ok(doc['first'] and doc['pn'] == {'start': None, 'fmt': 'bn'} and sh[0] == [] and (doc['pages'] < 2 or sh[1] == ['H:- ২ -']), '- ২ - at the top from page 2 (none on the first page), Bangla page numbers', [doc, sh])
        ok(doc['lang'] == 'bn-BD' and doc['size'] == 13 and doc['page'] == ['A4', 96, 120, 72] and N(doc['title']).startswith(N('সরকারি পত্র: সরকারি কর্মচারীদের')), 'A4, office margins, Bangla, 13 pt; named by its subject', doc)
        ok(N(doc['sel']) == N('[পত্রের মূল বক্তব্য]'), 'the first thing to write is selected: [পত্রের মূল বক্তব্য]', doc['sel'])
        prof = await st("() => __Q.Office.prof")
        ok(prof['next'] == '46' and len(prof['addrs']) == 3 and N(prof['addrs'][-1]) == N('বিভাগীয় কমিশনার, ঢাকা বিভাগ, ঢাকা।'), 'the next number counts on (46); the new address is kept, the removed one gone', [prof['next'], prof['addrs']])
        await page.screenshot(path='shots/gov1-letter.png')

        print('4. Word and PDF')
        b64 = await st(GET_DOCX)
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64)))
        dx = z.read('word/document.xml').decode()
        num = z.read('word/numbering.xml').decode()
        hdrs = [z.read(nm).decode() for nm in z.namelist() if re.match(r'word/header\d+\.xml', nm)]
        ok(dx.count('<w:tbl>') >= 3 and '<w:vMerge w:val="restart"/>' in dx and '<w:titlePg/>' in dx, 'Word: the tables (memo and date, বিষয় and সূত্র), merged cells, a different first page', dx.count('<w:tbl>'))
        ok('w:format="১, ২, ৩, ..."' in num and '<w:lvlText w:val="%1)"/>' in num, 'the বিতরণ list in Word: Bangla numbers, ১)', num[:300])
        ok(any(re.search(r'- </w:t>.*?w:instr=" PAGE .*?<w:t[^>]*>১</w:t>.*? -</w:t>', h) for h in hdrs), 'the header: - PAGE - (Word works out the number; ১ until it does)', [h[-300:] for h in hdrs])
        await st(OPEN_DOCX, b64)
        await page.wait_for_timeout(900)
        back = await st("() => ({ ol: getComputedStyle(document.querySelector('#editor ol')).listStyleType, first: __Q.S.doc.firstDiff, pn: __Q.S.doc.pn, rows: [...document.querySelectorAll('#editor table')].find(x => x.innerText.includes('তারিখ')).querySelector('td').rowSpan })")
        ok(back == {'ol': 'bn-close', 'first': True, 'pn': {'start': None, 'fmt': 'bn'}, 'rows': 2}, 'read back: ১) ২) list, the first page without a number, ১, ২, ৩, the merged cells', back)
        r = await st("""async () => { await document.fonts.ready; const blob = await __Q.buildVectorPdf({ title: 'letter' }); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        open('shots/gov1.pdf', 'wb').write(base64.b64decode(r))
        txt = [N(x) for x in pdf_pages_text('shots/gov1.pdf')]
        ok(N('গণপ্রজাতন্ত্রী বাংলাদেশ সরকার') in txt[0] and N('স্মারক নং') in txt[0] and N(bs_today) in txt[0] and N('বিষয়') in txt[0], 'the PDF: the letter with its Bangla text', txt[0][:300])
        ok(len(txt) < 2 or re.search(r'-\s*২\s*-', txt[1]), 'the PDF: - ২ - on page 2', txt[1][:200] if len(txt) > 1 else None)

        print('5. The next letter, the other kinds')
        await st("() => __Q.OfficeLetter.start()")
        await page.wait_for_timeout(500)
        ok(await st("() => document.getElementById('olMemo').value") == bn('05.00.0000.110.11.003.26.46'), 'the next letter takes ৪৬')
        await page.select_option('#olType', 'en-letter')
        await page.wait_for_timeout(150)
        d3 = await st("() => ({ memo: document.getElementById('olMemo').value, note: document.querySelector('.ol-dnote').textContent, labels: [...document.querySelectorAll('label[for=olMemo], label[for=olDate], label[for=olSubject]')].map(l => l.textContent), office: document.querySelector('#olOffice').parentNode.textContent, rows: [...document.querySelectorAll('.ol-ck')].map(x => x.textContent) })")
        ok(d3['memo'] == '05.00.0000.110.11.003.26.46' and d3['note'] == today.strftime('%d %B %Y').lstrip('0') and d3['labels'] == ['Memo No', 'Date', 'Subject'] and d3['office'] == 'Office copy at the end of the list' and d3['rows'][:2] == ['To', 'Copy'], 'English: English digits, labels and date', d3)
        await page.fill('#olSubject', 'Arranging training for government employees')
        await page.locator('.ol-addr').nth(0).locator('input').nth(0).check()
        await page.locator('.ol-addr').nth(2).locator('input').nth(1).check()
        await page.click('.dialog footer .btn.primary')
        await page.wait_for_timeout(1300)
        t = [N(x) for x in await st(TEXT)]
        ok(t[:4] == ["Government of the People’s Republic of Bangladesh", 'Ministry of Public Administration', 'Admin-1 Section', 'Bangladesh Secretariat, Dhaka'] and 'Memo No: 05.00.0000.110.11.003.26.46' in t and f'Date: {today.strftime("%d %B %Y").lstrip("0")}' in t, 'the English letter: the English names, Memo No, Date', t[:8])
        ok('(Md. Rezaul Karim)' in t and 'Deputy Secretary' in t and 'Phone: 02-55100233' in t and 'Copy for kind information and necessary action (not in order of seniority):' in t and 'Memo No: 05.00.0000.110.11.003.26.46/1(2)' in t, 'signature, Phone, the copies in English with /1(2)', [x for x in t if 'Memo' in x or 'Copy' in x])
        lst = await st("() => { const ol = document.querySelector('#editor ol'); return [getComputedStyle(ol).listStyleType, [...ol.children].map(li => li.textContent)]; }")
        ok(lst[0] == 'decimal-paren' and lst[1][-1] == 'Office copy.' and await st("() => __Q.S.doc.lang") == 'en-GB' and await st("() => !__Q.S.doc.pn"), 'its list 1) 2), “Office copy.”, English page numbers', lst)
        for typ, title, extra in [('adesh', 'অফিস আদেশ', 'বিতরণ (জ্যেষ্ঠতার ক্রমানুসারে নয়):'), ('proggapon', 'প্রজ্ঞাপন', 'রাষ্ট্রপতির আদেশক্রমে,'), ('notice', 'নোটিশ', '[নোটিশের বিষয়বস্তু]।'), ('en-order', 'OFFICE ORDER', 'Distribution (not in order of seniority):')]:
            await st("t => __Q.OfficeLetter.create({ type: t, date: new Date(), cc: [__Q.Office.prof.addrs[1]], officeCopy: true }, __Q.Office.prof)", typ)
            await page.wait_for_timeout(700)
            t = [N(x) for x in await st(TEXT)]
            u = await st("() => !![...document.querySelectorAll('#editor p')].find(p => p.querySelector('b u'))")
            ok(N(title) in t and N(extra) in t and u and not any(x.startswith(N('বিষয়')) or x.startswith('Subject') for x in t), f'{title}: its heading (bold, underlined), “{extra}”; no বিষয় when there is none', [x for x in t if len(x) < 60][:12])
        ok(await st("() => __Q.Prefs.letterType") == 'en-letter', 'the kind chosen last comes up next time')

        print('6. A logo; Insert › Office Letter')
        await st("l => __Q.Office.save(Object.assign({}, __Q.Office.prof, { logo: l }))", LOGO)
        await st("() => __Q.OfficeLetter.create({ type: 'patra', date: new Date(), subject: 'x', to: [], cc: [] }, __Q.Office.prof)")
        await page.wait_for_timeout(800)
        lg = await st("() => { const t = document.querySelector('#editor table'); const img = t && t.querySelector('img'); const c = t && [...t.rows[0].cells]; return img && [c.length, c[1].innerText.includes('জনপ্রশাসন মন্ত্রণালয়'), Math.round(c[0].getBoundingClientRect().width) === Math.round(c[2].getBoundingClientRect().width)]; }")
        ok(lg == [3, True, True], 'with a logo: the logo on the left, the names centred on the page', lg)
        t = [N(x) for x in await st(TEXT)]
        ok(N('[প্রাপকের পদবি]') in t and N('[দপ্তরের নাম]') in t and any(x.endswith('/১(১)') for x in t) and N('সংরক্ষণ নথি।') in t, 'no addressee picked: [প্রাপকের পদবি] to fill; only সংরক্ষণ নথি in the copies', [x for x in t if '[' in x])
        await st("() => __Q.openDoc(__Q.newDocModel({ title: 'Parts', html: '<p>আমার পত্র</p><p><br></p>', lang: 'bn-BD' }))")
        await page.wait_for_timeout(300)
        await page.click('#editor')
        await st("() => { const e = document.getElementById('editor'); const r = document.createRange(); r.selectNodeContents(e.lastElementChild); r.collapse(false); __Q.setRange(r); }")
        await st("() => __Q.UI.selectTab('insert')")
        await page.locator('.rb:visible:has(.cap:text-is("Office Letter"))').first.click()
        await page.wait_for_timeout(200)
        items = await st("() => [...document.querySelectorAll('.pop .mi, .pop .mh')].map(x => x.textContent.trim())")
        ok(items[0] == 'New Government Letter…' and 'Office Profile…' in items and len(items) >= 7, 'Insert › Office Letter: a new letter, the parts, the profile', items)
        await page.locator('.pop .mi', has_text='Memo Number and Date').click()
        await page.wait_for_timeout(500)
        t = [N(x) for x in await st(TEXT)]
        ok(N('স্মারক নং: ' + bn('05.00.0000.110.11.003.26.47')) in t and N(bs_today) in t, 'Memo Number and Date at the cursor (the next number, today)', t)
        await st("() => { const e = document.getElementById('editor'); const r = document.createRange(); r.selectNodeContents(e.lastElementChild); r.collapse(false); __Q.setRange(r); }")
        await st("() => __Q.OfficeLetter.insertPart('signature')")
        await page.wait_for_timeout(400)
        t = [N(x) for x in await st(TEXT)]
        ok(N('(মোঃ রেজাউল করিম)') in t and N('ফোন: ০২-৫৫১০০২৩৩') in t, 'Signature Block at the cursor', t[-6:])
        await st("() => __Q.undo()")
        await page.wait_for_timeout(300)
        ok(N('(মোঃ রেজাউল করিম)') not in [N(x) for x in await st(TEXT)], 'one Undo takes it out')
        await page.screenshot(path='shots/gov1-parts.png')

        print('7. Phone and dark; no account')
        b2, page2, errors2 = await new_page(p, width=390, height=844, mock_caps=False, dark=True)
        await load(page2)
        st2 = lambda js, *a: page2.evaluate(js, *a)
        await st2("() => __Q.newFromTemplate('gov')")
        await page2.wait_for_timeout(600)
        fit = await st2("() => { const d = document.querySelector('.dialog').getBoundingClientRect(); return [d.left >= 0, d.right <= innerWidth + 1, document.documentElement.scrollWidth <= innerWidth, getComputedStyle(document.querySelector('.of-grid')).gridTemplateColumns.split(' ').length]; }")
        ok(fit == [True, True, True, 1], 'phone: the Office Profile fits, one column', fit)
        await page2.screenshot(path='shots/gov1-phone-profile.png')
        await page2.fill('#of-org', 'জনপ্রশাসন মন্ত্রণালয়')
        await page2.fill('#of-addrs', ADDRS[0])
        await page2.click('.dialog footer .btn.primary')
        await page2.wait_for_timeout(800)
        fit = await st2("() => { const d = document.querySelector('.dialog').getBoundingClientRect(); return [d.right <= innerWidth + 1, document.documentElement.scrollWidth <= innerWidth, [...document.querySelectorAll('.ol-addr')].every(r => r.getBoundingClientRect().right <= d.right)]; }")
        ok(fit == [True] * 3, 'phone: the letter dialog fits', fit)
        col = await st2("() => [getComputedStyle(document.querySelector('.ol-at')).color, getComputedStyle(document.querySelector('.ol-addrs')).backgroundColor]")
        ok(col[0] != col[1], 'dark: readable', col)
        await page2.screenshot(path='shots/gov1-phone-letter.png')
        await page2.keyboard.press('Escape')
        await page2.reload()
        await page2.wait_for_timeout(900)
        kept = await st2("async () => { const p = await __Q.Office.load(true); return [p.saved, p.bn.org, p.addrs.length]; }")
        ok(kept[0] and N(kept[1]) == N('জনপ্রশাসন মন্ত্রণালয়') and kept[2] == 1, 'without an account the profile is kept in this browser (after a reload)', kept)
        await b2.close()
        for e in errors + [e for e in errors2 if 'favicon' not in e[1]]: print('ERR', e)
        await b.close()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')
asyncio.run(main())
