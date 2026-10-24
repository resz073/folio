"""Proofread with Claude: Review › Proofread opens the Claude pane's Proofread view and sends
the paragraphs (line breaks shown as ⏎, deletions left out) in batches; each fix lands as a
tracked change by Claude (whole words, a deleted space, an added full stop, inside a table,
next to someone else's deletion, য় typed two ways); unfound or out-of-range fixes are left
out; the list shows each fix in its words, Accept/Reject one or all (others' changes kept),
undo, a click selects the fix; right-click on a fix; only the selection when there is one;
typing while Claude works; Stop; errors (usage limit, bad answer, not allowed); read-only;
the reason on hover; saving and reopening keeps the fixes; .docx carries them as Claude's
w:ins/w:del; the Write view comes back for the assistant."""
import asyncio, sys, json, base64, io, zipfile, re
sys.path.insert(0, 'tests')
from harness import *

fails = []
def ok(cond, what, got=None):
    print(('  ok   ' if cond else '  FAIL ') + what + ('' if cond or got is None else '  -> ' + json.dumps(got, ensure_ascii=False)))
    if not cond: fails.append(what)

YA_DECOMP = 'সম' + chr(0x9af) + chr(0x9bc)   # সময় with য় as য + nukta
YA_COMP = 'সম' + chr(0x9df)                 # সময় with the one-letter য়
HTML = ''.join([
    '<p>আমাদের সরকারী দপ্তরে আগামী সপ্তাহে সভা হবে ।</p>',
    '<p>Please find teh attached report, which were prepared last week.</p>',
    '<p><b>Bold</b> text with a missing period</p>',
    '<p>Managing Director<br>ABC Limited<br>Dhaka</p>',
    '<table><tbody><tr><td><p>Recieved by</p></td><td><p>তারিখ</p></td></tr></tbody></table>',
    '<p>The <del class="tc" data-author="Rahim" data-time="1">old </del>new policy is aproved.</p>',
    f'<p>কাজটি নির্ধারিত {YA_DECOMP} মত শেষ করতে হবে।</p>',
])
RULES = [
    ['সরকারী', 'সরকারি', 'Standard spelling'],
    ['হবে ।', 'হবে।', 'No space before the dari'],
    ['teh', 'the', 'Spelling'],
    ['which were', 'which was', 'Agreement with report'],
    ['missing period', 'missing period.', 'Sentence needs a full stop'],
    ['Recieved', 'Received', 'Spelling: i before e'],
    ['aproved', 'approved', 'Spelling'],
    [YA_COMP + ' মত', YA_COMP + 'মতো', 'Standard form'],
]
MOCK = """(rules) => {
  window.__rules = rules;
  window.__extra = null;
  window.__sampleFn = prompt => {
    const paras = {};
    for (const l of prompt.split('\\n')) { const m = l.match(/^\\[(\\d+)\\] (.*)$/); if (m) paras[m[1]] = m[2]; }
    const fixes = [];
    for (const [n, t] of Object.entries(paras))
      for (const [find, fix, why] of window.__rules) if (t.includes(find) || t.normalize('NFC').includes(find.normalize('NFC'))) fixes.push({ p: +n, find, fix, why });
    if (window.__extra) { fixes.push(...window.__extra); window.__extra = null; }
    return JSON.stringify({ fixes });
  };
}"""
ITEMS = "() => __Q.Proof.items().map(it => [it.del, it.ins])"
CARDS = "() => [...document.querySelectorAll('#proofBox .proof-item')].map(c => c.querySelector('.proof-words').textContent)"

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=860, mock_caps=True, gfonts=True)
        await load(page)
        st = lambda js, *a: page.evaluate(js, *a)
        await st(MOCK, RULES)
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Proof test', html: h }))", HTML)
        await page.wait_for_timeout(900)

        print('1. Review › Proofread')
        await page.click('#tab-review')
        btn = page.locator('.rb:visible:has(.cap:text-is("Proofread"))')
        ok(await btn.count() == 1, 'Review has a Proofread button')
        await btn.click()
        await page.wait_for_timeout(200)
        view = await st("() => ({ pane: __Q.S.pane, view: __Q.Proof.view, box: !document.getElementById('proofBox').hidden, write: document.querySelector('.asst-box').hidden, tab: document.querySelector('.asst-views [aria-selected=true]').textContent })")
        ok(view == {'pane': 'assistant', 'view': 'proof', 'box': True, 'write': True, 'tab': 'Proofread'}, "it opens the Claude pane's Proofread view", view)
        await page.wait_for_function("() => !__Q.Proof.running", timeout=8000)
        await page.wait_for_timeout(300)
        prompts = await st("() => window.__prompts")
        pr = prompts[-1]
        ok(len(prompts) == 1 and 'Bangla Academy' in pr and 'প্রমিত' in pr, 'one request for this short document, asking for the Bangla Academy standard', len(prompts))
        ok('[4] Managing Director ⏎ ABC Limited ⏎ Dhaka' in pr, 'a line break is shown as ⏎')
        ok('[7] The new policy is aproved.' in pr, "someone else's deletion is left out of the text", pr[-400:])
        ok('[5] Recieved by' in pr and '[6] তারিখ' in pr, 'table cells are paragraphs too', [l for l in pr.split('\n') if l.startswith('[')])
        items = await st(ITEMS)
        want = [['সরকারী', 'সরকারি'], [' ', ''], ['teh', 'the'], ['were', 'was'], ['', '.'], ['Recieved', 'Received'], ['aproved', 'approved'], [YA_DECOMP + ' মত', YA_COMP + 'মতো']]
        ok(items == want, 'eight fixes, each only the words that change', items)
        dom = await st("""() => [...document.querySelectorAll('#editor [data-pf]')].map(e => [e.tagName, e.getAttribute('data-author'), e.getAttribute('data-uid'), e.className, !!e.title, e.style.getPropertyValue('--tcc')])""")
        ok(all(d[1:] == ['Claude', 'claude', 'tc', True, '#b4532a'] for d in dom) and len(dom) == 14, "as tracked changes by Claude, in Claude's colour, with the reason", dom[:3])
        p1 = await st("() => document.querySelector('#editor p').innerHTML")
        ok(re.search(r'<del[^>]*>সরকারী</del><ins[^>]*>সরকারি</ins>', p1) and re.search(r'হবে<del[^>]*> </del>।', p1), 'the old word struck, the new one after it; the space before । struck', p1)
        p3 = await st("() => document.querySelectorAll('#editor > p')[2].innerHTML")
        ok(re.search(r'missing period<ins[^>]*>\.</ins>$', p3) is not None, 'a missing full stop is added after the last word', p3)
        p6 = await st("() => document.querySelectorAll('#editor > p')[4].innerHTML")
        ok('data-author="Rahim"' in p6 and re.search(r'is <del[^>]*>aproved</del><ins[^>]*>approved</ins>\.', p6) is not None, "next to someone else's deletion, which stays", p6)
        title = await st("() => document.querySelector('#editor ins[data-pf]').title")
        ok(title == 'Standard spelling', 'the reason shows on hover', title)
        cards = await st(CARDS)
        ok(len(cards) == 8 and cards[0].startswith('আমাদের') and 'সরকারীসরকারি' in cards[0] and '␣' in cards[1], 'the pane lists each fix in its words, a deleted space shown as ␣', cards[:2])
        why = await st("() => [...document.querySelectorAll('#proofBox .proof-why')].map(e => e.textContent)")
        ok(why[0] == 'Standard spelling' and len(why) == 8, 'with the reason', why)
        head = await st("() => [document.querySelector('.proof-count').textContent, document.querySelector('#proofBox [data-fk=go] .lbl').textContent]")
        ok(head == ['8 fixes', 'Proofread document'], 'a count, and the button says what it checks', head)

        print('2. accept, reject, undo, go')
        await page.click('#proofBox .proof-item:nth-child(1) [data-fk=ok]')
        await page.wait_for_timeout(250)
        t1 = await st("() => document.querySelector('#editor p').textContent")
        ok(t1.startswith('আমাদের সরকারি দপ্তরে'), 'Accept puts the fix in', t1)
        foc = await st("() => document.activeElement && document.activeElement.classList.contains('proof-item') && document.activeElement.dataset.pf === __Q.Proof.items()[0].pf")
        ok(foc, 'the keyboard moves to the next fix')
        await page.click('#proofBox .proof-item:nth-child(2) [data-fk=no]')
        await page.wait_for_timeout(250)
        t2 = await st("() => document.querySelectorAll('#editor > p')[1].textContent")
        ok('find teh attached' in t2 and len(await st(ITEMS)) == 6, 'Reject keeps the original words', t2)
        await st("() => __Q.undo()")
        await page.wait_for_timeout(450)
        ok(len(await st(ITEMS)) == 7 and len(await st(CARDS)) == 7, 'undo brings the fix back, in the page and the list', await st(ITEMS))
        await page.click('#proofBox .proof-item:nth-child(2)')
        await page.wait_for_timeout(250)
        sel = await st("() => getSelection().toString()")
        on = await st("() => [...document.querySelectorAll('#proofBox .proof-item')].map(c => c.classList.contains('on'))")
        ok(sel == 'tehthe' and on[1] and sum(on) == 1, 'clicking a fix selects it in the page and marks its card', [sel, on])
        # the Review tab's own Next/Accept work on Claude's changes too
        await st("() => __Q.CMD.acceptChange()")
        await page.wait_for_timeout(300)
        ok('find the attached' in await st("() => document.querySelectorAll('#editor > p')[1].textContent") and len(await st(ITEMS)) == 6, "Review's Accept takes Claude's fix (both halves)")
        # right-click on a fix
        box = await st("() => { const e = document.querySelector('#editor ins[data-pf]'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
        await page.wait_for_timeout(150)
        await page.mouse.click(box[0], box[1], button='right')
        await page.wait_for_timeout(250)
        labels = await st("() => [...document.querySelectorAll('.pop.ctx .mi, .pop.ctx .mnote')].map(m => m.textContent.trim())")
        ok(any('Accept Claude’s Fix' in l for l in labels) and any('Reject Claude’s Fix' in l for l in labels) and not any('Accept Insertion' in l for l in labels), "right-click on a fix offers Accept/Reject Claude's Fix", labels)
        ok(any(l == 'No space before the dari' or l in [r[2] for r in RULES] for l in labels), 'with the reason', labels)
        await page.keyboard.press('Escape')
        await page.click('#proofBox [data-fk=aa]')
        await page.wait_for_timeout(300)
        left = await st("() => [__Q.Proof.items().length, document.querySelectorAll('#editor del.tc[data-author=Rahim]').length, document.querySelector('#proofBox .proof-done') && document.querySelector('#proofBox .proof-done').textContent]")
        ok(left[0] == 0 and left[1] == 1, "Accept all takes Claude's fixes and leaves others' changes", left)
        text = await st("() => [...document.querySelectorAll('#editor p')].map(p => p.textContent)")
        ok(text[0] == 'আমাদের সরকারি দপ্তরে আগামী সপ্তাহে সভা হবে।' and text[2] == 'Bold text with a missing period.' and text[4] == 'Received by', 'the text is fixed', text)
        ok(text[-1].startswith('কাজটি নির্ধারিত ' + YA_COMP + 'মতো'), 'য় typed two ways is still found', text[-1])

        print('3. the selection only; nothing found')
        await st(MOCK, [['Bold', 'Bold', 'same']])
        await st("() => { const p = document.querySelectorAll('#editor > p')[1]; const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r); }")
        await page.wait_for_timeout(200)
        lbl = await st("() => document.querySelector('#proofBox [data-fk=go] .lbl').textContent")
        ok(lbl == 'Proofread selection', 'with text selected the button says Proofread selection', lbl)
        n0 = len(await st("() => window.__prompts"))
        await page.click('#proofBox [data-fk=go]')
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        await page.wait_for_timeout(200)
        pr = (await st("() => window.__prompts"))[n0:]
        ok(len(pr) == 1 and '[1] Please find the attached' in pr[0] and '[2]' not in pr[0], 'only the selected paragraph is sent', pr[0][-200:] if pr else None)
        done = await st("() => document.querySelector('#proofBox .proof-done') && document.querySelector('#proofBox .proof-done').textContent")
        ok(done == 'No mistakes found in 1 paragraph.', 'a clean result says so', done)

        print('4. answers that do not fit')
        await st("() => { getSelection().removeAllRanges(); const p = document.querySelector('#editor p'); const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true); getSelection().addRange(r); }")
        await st(MOCK, [['সপ্তাহে', 'সপ্তাহে', 'no change']])
        await st("() => { window.__extra = [{ p: 1, find: 'নেই-এমন কথা', fix: 'x', why: 'not there' }, { p: 99, find: 'a', fix: 'b' }, { p: 2, find: 'Please', fix: 'Kindly ⏎', why: 'crosses a break' }, { p: 'x', find: 'a', fix: 'b' }, null, { p: 1, find: 'আমাদের', fix: 'আমাদের' }]; }")
        await page.click('#proofBox [data-fk=go]')
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        s = await st("() => [__Q.Proof.items().length, __Q.Proof.stats.fixes, __Q.Proof.stats.skipped, document.querySelectorAll('#editor [data-pf]').length]")
        ok(s[0] == 0 and s[1] == 0 and s[3] == 0, 'fixes that are not in the text, out of range, unchanged or crossing a break are left out', s)

        print('5. typing while Claude works; Stop')
        await st(MOCK, RULES)
        await st("() => { window.__release = null; window.__sampleWait = new Promise(r => { window.__release = r; }); }")
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Proof test 2', html: h }))", '<p>আমাদের সরকারী দপ্তরে সভা।</p><p>Please find teh report.</p>')
        await page.wait_for_timeout(400)
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_timeout(200)
        prog = await st("() => [__Q.Proof.running, !!document.querySelector('#proofBox .proof-prog'), !!document.querySelector('#proofBox [data-fk=stop]'), document.querySelector('#proofBox [data-fk=go]').disabled]")
        ok(prog == [True, True, True, True], 'while it works: progress, Stop, and the button is off', prog)
        # the user types at the start of the first paragraph meanwhile
        await st("() => { const p = document.querySelector('#editor p'); const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); }")
        await page.keyboard.type('Dear Sir, ')
        await st("() => window.__release()")
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        await page.wait_for_timeout(300)
        p1 = await st("() => document.querySelector('#editor p').innerHTML")
        ok(p1.startswith('Dear Sir, আমাদের <del') and '>সরকারী</del><ins' in p1, 'a fix still lands on its word after typing before it', p1)
        await st("() => { window.__sampleWait = new Promise(r => { window.__release = r; }); }")
        await st("() => __Q.Proof.decideAll(false)")
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_timeout(150)
        await page.click('#proofBox [data-fk=stop]')
        await st("() => window.__release()")
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        await page.wait_for_timeout(250)
        st5 = await st("() => [__Q.Proof.items().length, document.querySelector('#proofBox .proof-note') && document.querySelector('#proofBox .proof-note').textContent]")
        ok(st5[0] == 0 and st5[1] and st5[1].startswith('Stopped after 0 of 2'), 'Stop ends it with nothing changed', st5)
        await st("() => { window.__sampleWait = null; }")

        print('6. errors')
        await st("() => { window.__sampleErrors = ['rate_limited']; }")
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        note = await st("() => document.querySelector('#proofBox .proof-note').textContent")
        ok('usage limit' in note and await st("() => __Q.Proof.items().length") == 0, 'a usage limit says so', note)
        await st("() => { window.__sampleErrors = ['invalid_json']; }")
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        note = await st("() => document.querySelector('#proofBox .proof-note').textContent")
        ok(note == "2 paragraphs couldn’t be checked. Run Proofread again to retry them.", 'a bad answer is reported, not guessed at', note)
        # an answer wrapped in prose still works
        await st("() => { const f = window.__sampleFn; window.__sampleFn = p => 'Here you go: ' + f(p) + ' Thanks.'; }")
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        ok(len(await st(ITEMS)) == 2, 'JSON inside some words is still read', await st(ITEMS))
        await st(MOCK, RULES)
        await st("() => __Q.Proof.decideAll(false)")

        print('7. a long document goes in batches')
        long = ''.join(f'<p>Paragraph {i}: ' + ('lorem ipsum dolor sit amet ' * 12) + 'teh end.</p>' for i in range(30))
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Proof long', html: h }))", long)
        await page.wait_for_timeout(500)
        n0 = await st("() => window.__sampleCalls")
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_function("() => !__Q.Proof.running", timeout=15000)
        await page.wait_for_timeout(300)
        calls = await st("() => window.__sampleCalls") - n0
        ok(calls == 3, '30 paragraphs of ~350 characters go in three requests', calls)
        ok(len(await st(ITEMS)) == 30, 'every paragraph gets its fix', len(await st(ITEMS)))
        sm = await st("() => [...document.querySelectorAll('#proofBox .note')].map(n => n.textContent).find(t => t.startsWith('Claude found'))")
        ok(sm == 'Claude found 30 mistakes in 30 paragraphs. Click one to see it in the page.', 'a summary at the end', sm)

        print('8. saving, .docx')
        html = await st("() => __Q.cleanHTML()")
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Proof long', html: h }))", html)
        await page.wait_for_timeout(400)
        ok(len(await st(ITEMS)) == 30 and len(await st(CARDS)) == 30, 'a saved and reopened document keeps the fixes, and the pane lists them', len(await st(ITEMS)))
        b64 = await st("""async () => { const b = await __Q.buildDocx(); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        x = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64))).read('word/document.xml').decode()
        ok(x.count('<w:ins ') == 30 and x.count('<w:del ') == 30 and 'w:author="Claude"' in x and '<w:delText xml:space="preserve">teh</w:delText>' in x, ".docx carries them as Claude's insertions and deletions", [x.count('<w:ins '), x.count('<w:del ')])

        print('9. not allowed, read-only, the Write view')
        await st("() => { window.__sampleErrors = ['not_granted']; }")
        await st("() => __Q.Proof.decideAll(false)")
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        na = await st("() => [__Q.Cap.sample, document.querySelector('#proofBox [data-fk=go]').disabled, [...document.querySelectorAll('#proofBox .proof-note')].map(n => n.textContent)]")
        ok(na[0] is None and na[1] and any('wasn’t allowed' in t for t in na[2]), 'when Claude is not allowed, it says so and the button is off', na)
        await page.reload()
        await load(page)
        await st(MOCK, RULES)
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Proof RO', html: h }))", '<p>Please find teh report.</p>')
        await page.wait_for_timeout(400)
        await st("() => { __Q.S.readOnly = true; }")
        n0 = await st("() => window.__sampleCalls || 0")
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_timeout(300)
        ro = await st("() => [(window.__sampleCalls || 0), document.querySelector('#proofBox [data-fk=go]').disabled, document.querySelector('#toasts') ? document.querySelector('#toasts').textContent : '']")
        ok(ro[0] == n0 and ro[1], 'a read-only document is not sent', ro)
        await st("() => { __Q.S.readOnly = false; }")
        await page.click('.asst-views [data-v=write]')
        await page.wait_for_timeout(150)
        wv = await st("() => [document.querySelector('.asst-box').hidden, document.getElementById('proofBox').hidden]")
        ok(wv == [False, True], 'the Write tab shows the assistant again', wv)
        await st("() => __Q.Proof.setView('proof')")
        await page.click('#tab-claude')
        await page.locator('.rb:has(.cap:text-is("Improve"))').click()
        await page.wait_for_timeout(300)
        ok(await st("() => __Q.Proof.view") == 'write' and not await st("() => document.querySelector('.asst-box').hidden"), 'a rewrite from the Claude tab switches to the Write view')
        ok(await page.locator('.rb:visible:has(.cap:text-is("Proofread"))').count() == 1, 'the Claude tab has Proofread too')

        print('10. phone width')
        await page.set_viewport_size({'width': 400, 'height': 800})
        await st("() => { __Q.CMD.proofread(); }")
        await page.wait_for_function("() => !__Q.Proof.running", timeout=5000)
        await page.wait_for_timeout(300)
        wide = await st("() => { const p = document.getElementById('sidePane').getBoundingClientRect(); const c = [...document.querySelectorAll('#proofBox .proof-item')].map(e => e.getBoundingClientRect().right); return [p.width, Math.max(0, ...c) <= p.right + 0.5, document.documentElement.scrollWidth <= 400]; }")
        ok(wide[1] and wide[2], 'the list fits the pane on a phone', wide)
        ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors', errors)
        await b.close()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')

asyncio.run(main())
