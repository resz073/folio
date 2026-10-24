"""Version history and Compare: the autosave keeps a version when the text has changed and the last
one is old enough (none for an empty or unchanged document); naming the current version; File ›
Version History (Info and Review lead there): the list by day, a preview, "Show changes since",
Restore (the current text kept first; undo), Rename, Delete (asks first), Open the Changes (a new
document with tracked changes that accept to the new text and reject to the old); thinning to the
newest automatic versions; in the account, versions reuse the document's stored parts, keep them
while needed and drop them when not; in this browser, copies; deleting a document deletes its
versions. Compare itself: words, paragraphs, list items, table cells and rows, Bangla; whole
paragraphs and rows go away when their change is accepted; the paragraph mark and row changes in
.docx (out and back in); Review › Compare › Compare with a Word File."""
import asyncio, sys, json, base64, io, zipfile, re, os, tempfile
sys.path.insert(0, 'tests')
from harness import *

fails = []
def ok(cond, what, got=None):
    print(('  ok   ' if cond else '  FAIL ') + what + ('' if cond or got is None else '  -> ' + json.dumps(got, ensure_ascii=False)))
    if not cond: fails.append(what)

TEXTS = "() => [...document.querySelectorAll('#editor p, #editor li, #editor h1, #editor td')].filter(e => !e.querySelector('p')).map(e => e.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean)"
VERS = "async () => (await __Q.Versions.list(__Q.S.doc.id, true)).map(v => [v.name, v.auto, v.words])"
ROUND = """([a, b]) => {
  const res = __Q.Compare.run(a, b, 'Tester');
  const box = document.createElement('div'); box.innerHTML = res.html;
  document.body.appendChild(box);
  const norm = el => [...el.querySelectorAll('p,li,td,th,h1,h2,h3')].filter(e => !e.querySelector('p,li,td,th')).map(e => e.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean).join(' | ');
  const cnt = el => el.querySelectorAll('p,li,tr').length;
  const acc = box.cloneNode(true), rej = box.cloneNode(true);
  document.body.append(acc, rej);
  [...acc.querySelectorAll('ins.tc, del.tc')].forEach(e => e.isConnected && __Q.Track.accept(e));
  [...rej.querySelectorAll('ins.tc, del.tc')].forEach(e => e.isConnected && __Q.Track.reject(e));
  const A = document.createElement('div'); A.innerHTML = a; const B = document.createElement('div'); B.innerHTML = b;
  const out = { n: res.n, html: res.html, acc: norm(acc), rej: norm(rej), A: norm(A), B: norm(B), cacc: cnt(acc), crej: cnt(rej), cA: cnt(A), cB: cnt(B), left: acc.querySelectorAll('[data-tcb]').length + rej.querySelectorAll('[data-tcb]').length };
  box.remove(); acc.remove(); rej.remove();
  return out;
}"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1366, height=900, mock_caps=True, gfonts=True)
        await load(page)
        st = lambda js, *a: page.evaluate(js, *a)

        print('1. Compare')
        cases = [
          ('words', '<p>The quick brown fox jumps.</p><p>Second paragraph stays.</p>', '<p>The quick red fox jumped.</p><p>Second paragraph stays.</p><p>A new paragraph.</p>'),
          ('a paragraph taken out', '<p>Keep this.</p><p>Remove this one.</p><p>And this stays.</p>', '<p>Keep this.</p><p>And this stays.</p>'),
          ('list items', '<ul><li>One</li><li>Two</li><li>Three</li></ul>', '<ul><li>One</li><li>Two and a half</li><li>Four</li><li>Five</li></ul>'),
          ('a table: a cell changed, a row added', '<table><tbody><tr><td><p>Name</p></td><td><p>Amount</p></td></tr><tr><td><p>Toner</p></td><td><p>4,500</p></td></tr></tbody></table>', '<table><tbody><tr><td><p>Name</p></td><td><p>Amount</p></td></tr><tr><td><p>Toner</p></td><td><p>5,200</p></td></tr><tr><td><p>Paper</p></td><td><p>900</p></td></tr></tbody></table>'),
          ('a table: a row taken out', '<table><tbody><tr><td><p>A</p></td><td><p>1</p></td></tr><tr><td><p>B</p></td><td><p>2</p></td></tr><tr><td><p>C</p></td><td><p>3</p></td></tr></tbody></table>', '<table><tbody><tr><td><p>A</p></td><td><p>1</p></td></tr><tr><td><p>C</p></td><td><p>3</p></td></tr></tbody></table>'),
          ('Bangla', '<p>আমাদের সরকারী দপ্তরে আগামী সপ্তাহে সভা হবে।</p>', '<p>আমাদের সরকারি দপ্তরে আগামী রবিবার সভা হবে।</p>'),
          ('formatting kept', '<p>Dear <b>Sir</b>, please find the report.</p>', '<p>Dear <b>Madam</b>, kindly find the attached report.</p>'),
          ('a heading', '<h1>Title</h1><p>Body</p>', '<h1>New title</h1><p>Body</p>'),
          ('everything new', '<p>a b c d e f</p><p>g h</p>', '<p>x y z</p>'),
        ]
        for name, a, c in cases:
            r = await st(ROUND, [a, c])
            ok(r['acc'] == r['B'] and r['rej'] == r['A'] and r['cacc'] == r['cB'] and r['crej'] == r['cA'] and r['left'] == 0 and r['n'] > 0,
               f'{name}: accepting all gives the new text, rejecting all the old (paragraphs and rows too)', {k: r[k] for k in ('acc', 'B', 'rej', 'A', 'cacc', 'cB', 'crej', 'cA', 'left')})
        r = await st(ROUND, ['<p>The quick brown fox jumps.</p>', '<p>The quick red fox jumps.</p>'])
        ok(re.search(r'quick <del[^>]*>brown</del><ins[^>]*>red</ins> fox', r['html']) is not None and r['n'] == 1, 'a changed word: the old one struck, the new one after it', r['html'])
        r = await st(ROUND, ['<ul><li>One</li><li>Two</li><li>Three</li></ul>', '<ul><li>One</li><li>Two and a half</li><li>Four</li><li>Five</li></ul>'])
        ok(r['html'].startswith('<ul><li>One</li><li>Two<ins'), 'lists are compared item by item', r['html'][:80])
        r = await st(ROUND, ['<p>Same.</p>', '<p>Same.</p>'])
        ok(r['n'] == 0 and 'tc' not in r['html'], 'no changes: nothing marked')

        print('2. automatic versions')
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Office order', html: h }))", '<p>Office order no. 12</p><p>The office will remain closed on Sunday.</p>')
        await page.wait_for_timeout(400)
        await st("() => { __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        v = await st(VERS)
        ok(len(v) == 1 and v[0][1] is True and v[0][2] > 5, 'the first save of a document with words keeps a version', v)
        await st("() => { const p = document.querySelectorAll('#editor p')[1]; p.firstChild.data = 'The office will remain closed on Sunday and Monday.'; __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        ok(len(await st(VERS)) == 1, 'within 10 minutes of the last version: no new one')
        await st("() => { __Q.Versions.gap = 0; }")
        await st("() => { __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        ok(len(await st(VERS)) == 2, 'later, with changed text: another version')
        await st("() => { __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        ok(len(await st(VERS)) == 2, 'the same text again: no new version')
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Empty', html: h }))", '<p><br></p>')
        await page.wait_for_timeout(300)
        await st("() => { __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        ok(await st(VERS) == [], 'an empty document keeps no versions')

        print('3. File › Version History')
        html1 = '<p>Office order no. 12</p><p>The office will remain closed on Sunday.</p><table><tbody><tr><td><p>Item</p></td><td><p>Cost</p></td></tr><tr><td><p>Toner</p></td><td><p>4,500</p></td></tr></tbody></table>'
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Office order', html: h }))", html1)
        await page.wait_for_timeout(300)
        await st("() => { __Q.Versions.gap = 0; __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        # change it: a paragraph edited, one added, a cell changed
        await st("() => { const ps = document.querySelectorAll('#editor > p'); ps[1].firstChild.data = 'The office will remain closed on Sunday for the holiday.'; const n = document.createElement('p'); n.textContent = 'All staff are requested to note this.'; ps[1].after(n); document.querySelectorAll('#editor td p')[3].firstChild.data = '5,200'; __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        ok(len(await st(VERS)) == 2, 'two versions so far')
        await page.click('#tab-review')
        ok(await page.locator('.rb:visible:has(.cap:text-is("Version History"))').count() == 1 and await page.locator('.rb:visible:has(.cap:text-is("Compare"))').count() == 1, 'Review has Compare and Version History')
        await page.locator('.rb:visible:has(.cap:text-is("Version History"))').click()
        await page.wait_for_timeout(700)
        info = await st("() => ({ h1: document.querySelector('.bs-main h1').textContent, nav: document.querySelector('.bs-nav [aria-current=page]').textContent, days: [...document.querySelectorAll('.vh-day')].map(d => d.textContent), items: [...document.querySelectorAll('.vh-item')].map(i => i.querySelector('.vh-n').textContent), sel: document.querySelector('.vh-item[aria-selected=true] .vh-n').textContent, prev: document.querySelector('.vh-page') ? document.querySelector('.vh-page').textContent.includes('All staff are requested') : null })")
        ok(info['h1'] == 'Version History' and 'Version History' in info['nav'] and info['days'] == ['Today'] and info['items'] == ['Current version', 'Autosaved version', 'Autosaved version'] and info['sel'] == 'Current version' and info['prev'], 'the page lists the current version and the autosaved ones, by day, with a preview', info)
        # the older one
        await page.locator('.vh-item').nth(2).click()
        await page.wait_for_timeout(500)
        prev = await st("() => [document.querySelector('.vh-page').textContent.includes('All staff'), document.querySelector('.vh-page').textContent.includes('4,500'), [...document.querySelectorAll('.vh-acts button')].map(b => b.textContent || b.getAttribute('aria-label'))]")
        ok(prev[0] is False and prev[1] and prev[2] == ['Restore', 'Open the Changes…', 'Name…', 'Delete this version'], 'an older version: its own text, with Restore, Open the Changes, Name and Delete', prev)
        await page.click('#vhChanges')
        await page.wait_for_timeout(400)
        ch = await st("() => { const p = document.querySelector('.vh-page'); return [p.querySelectorAll('ins.tc').length > 0, p.querySelectorAll('del.tc').length > 0, [...p.querySelectorAll('del.tc')].map(d => d.textContent), document.querySelector('.vh-title .note').textContent]; }")
        ok(ch[0] and ch[1] and '4,500' in ch[2] and 'changes since' in ch[3], 'Show changes since: what was added and taken out since then, counted', ch)
        # name it
        await page.locator('.vh-acts button', has_text='Name…').click()
        await page.wait_for_timeout(200)
        await page.fill('#verRename', 'First draft')
        await page.click('.dialog .btn.primary')
        await page.wait_for_timeout(700)
        items = await st("() => [...document.querySelectorAll('.vh-item .vh-n')].map(n => n.textContent)")
        ok(items == ['Current version', 'Autosaved version', 'First draft'], 'a version can be named', items)
        # name the current version
        await page.locator('.vh-side .btn.primary').click()
        await page.wait_for_timeout(200)
        await page.fill('#verName', 'Sent to the MD')
        await page.click('.dialog .btn.primary')
        await page.wait_for_timeout(1200)
        items = await st("() => [...document.querySelectorAll('.vh-item .vh-n')].map(n => n.textContent)")
        ok(items[:2] == ['Current version', 'Sent to the MD'] and len(items) == 4, 'Name Current Version keeps one now', items)

        print('4. restore')
        await page.locator('.vh-item', has_text='First draft').click()
        await page.wait_for_timeout(500)
        await page.locator('.vh-acts button', has_text='Restore').click()
        await page.wait_for_timeout(200)
        ok(await st("() => !!document.querySelector('.vh-confirm') && document.querySelector('.vh-acts').hidden"), 'Restore asks first')
        await page.locator('.vh-confirm .btn.primary').click()
        await page.wait_for_timeout(1200)
        t = await st(TEXTS)
        ok(await st("() => document.getElementById('backstage').hidden") and t == ['Office order no. 12', 'The office will remain closed on Sunday.', 'Item', 'Cost', 'Toner', '4,500'], 'the document is back to that version', t)
        v = await st(VERS)
        ok(any(n.startswith('Before restoring') for n, a, w in v), 'what was there before is kept as a version', v)
        await st("() => __Q.undo()"); await page.wait_for_timeout(300)
        t = await st(TEXTS)
        ok('All staff are requested to note this.' in t and '5,200' in t, 'Undo brings back what was there', t)
        await st("() => __Q.redo()"); await page.wait_for_timeout(300)

        print('5. open the changes, delete, thinning')
        await st("() => __Q.Backstage.open('history')")
        await page.wait_for_timeout(700)
        await page.locator('.vh-item', has_text='Sent to the MD').click()
        await page.wait_for_timeout(500)
        cur_id = await st("() => __Q.S.doc.id")
        await page.locator('.vh-acts button', has_text='Open the Changes').click()
        await page.wait_for_timeout(1200)
        d2 = await st("() => [__Q.S.doc.id, __Q.S.doc.title, document.querySelectorAll('#editor ins.tc').length, document.querySelectorAll('#editor del.tc').length]")
        ok(d2[0] != cur_id and d2[1].startswith('Office order (changes since') and d2[2] > 0 and d2[3] > 0, 'Open the Changes: a new document with them as tracked changes', d2)
        await st("() => __Q.Track.acceptAll()"); await page.wait_for_timeout(300)
        ok(await st(TEXTS) == ['Office order no. 12', 'The office will remain closed on Sunday.', 'Item', 'Cost', 'Toner', '4,500'], 'Accept All gives the newer text, without empty paragraphs', await st(TEXTS))
        await st("() => __Q.undo()"); await page.wait_for_timeout(300)
        await st("() => __Q.Track.rejectAll()"); await page.wait_for_timeout(300)
        ok(await st(TEXTS) == ['Office order no. 12', 'The office will remain closed on Sunday for the holiday.', 'All staff are requested to note this.', 'Item', 'Cost', 'Toner', '5,200'], 'Reject All gives the version', await st(TEXTS))
        await st("() => __Q.undo()"); await page.wait_for_timeout(300)
        b64 = await st("""async () => { const b = await __Q.buildDocx(); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        x = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64))).read('word/document.xml').decode()
        ok(re.search(r'<w:pPr>(?:(?!</w:pPr>).)*<w:rPr><w:del w:id="\d+" w:author="[^"]+" w:date="[^"]+"/></w:rPr>', x) is not None and '<w:delText xml:space="preserve">5,200</w:delText>' in x, '.docx: the removed paragraph’s mark is a deletion too; the old amount is deleted text', None)
        back = await st("""async b64 => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = await __Q.readDocxFile(u.buffer); const d = document.createElement('div'); d.innerHTML = r.html; return [...d.querySelectorAll('[data-tcb]')].map(e => e.tagName + ':' + e.getAttribute('data-tcb')); }""", b64)
        ok('P:del' in back, 'and back in: the paragraph is still marked as removed whole', back)
        # back to the order; delete a version
        await st("id => __Q.openStored ? __Q.openStored(id) : null", cur_id)
        await page.wait_for_timeout(800)
        if await st("() => __Q.S.doc.id") != cur_id:
            doc = await st("async id => { const d = await __Q.Store.impl.load(id); __Q.openDoc(d); return !!d; }", cur_id)
            await page.wait_for_timeout(500)
        await st("() => __Q.Backstage.open('history')"); await page.wait_for_timeout(700)
        n0 = await st("() => document.querySelectorAll('.vh-item').length")
        await page.locator('.vh-item').nth(n0 - 1).click(); await page.wait_for_timeout(400)
        await page.locator('.vh-acts .tb-btn').click(); await page.wait_for_timeout(150)
        await page.locator('.vh-confirm .btn.danger').click(); await page.wait_for_timeout(900)
        ok(await st("() => document.querySelectorAll('.vh-item').length") == n0 - 1, 'Delete (after asking) takes a version away', n0)
        await page.keyboard.press('Escape')
        await st("() => { __Q.Versions.keep = () => 3; }")
        for k in range(5):
            await st("k => { const p = document.querySelector('#editor p'); p.firstChild.data = 'Office order no. ' + (20 + k); __Q.Saver.mark(); }", k)
            await page.wait_for_timeout(1700)
        v = await st(VERS)
        autos = [x for x in v if x[1]]
        ok(len(autos) == 3 and any(x[0] == 'Sent to the MD' for x in v), 'only the newest automatic versions are kept; named ones stay', v)

        print('6. stored parts in the account')
        pic = await st("""() => { const c = document.createElement('canvas'); c.width = 300; c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 300, 120); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgb(${i % 255},${(i * 7) % 255},${(i * 13) % 255})`; g.fillRect((i * 37) % 300, (i * 11) % 120, 3, 3); } return c.toDataURL('image/png'); }""")
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'With picture', html: h }))", f'<p>Before the picture.</p><p><img src="{pic}" style="width:200px"></p><p>After it.</p>')
        await page.wait_for_timeout(300)
        await st("() => { __Q.Versions.gap = 0; __Q.Versions.keep = () => 40; __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        did = await st("() => __Q.S.doc.id")
        chunks = lambda: st("id => [...window.__mockStore.keys()].filter(k => k.includes('/docs/' + id + '/chunks/')).length", did)
        withpic = await chunks()
        await st("() => { const i = document.querySelector('#editor img'); i.closest('p').remove(); __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        v = await st(VERS)
        stored = await st("id => [...window.__mockStore.entries()].some(([k, v]) => k.includes('/docs/' + id + '/chunks/') && JSON.stringify(v).includes('data:image/png'))", did)
        ok(len(v) == 2 and stored, 'a picture taken out stays stored while a version uses it', [len(v), withpic, await chunks()])
        await st("async () => { const l = await __Q.Versions.list(__Q.S.doc.id, true); await __Q.Versions.restore(l[l.length - 1]); }")
        await page.wait_for_timeout(800)
        ok(await st("() => !!document.querySelector('#editor img')"), 'and restoring that version brings the picture back')
        await st("async () => { const l = await __Q.Versions.list(__Q.S.doc.id, true); for (const v of l) await __Q.Versions.remove(v); }")
        await st("() => { const i = document.querySelector('#editor img'); i.closest('p').remove(); __Q.Versions.gap = 1e9; __Q.Saver.mark(); }")
        await page.wait_for_timeout(1800)
        await st("async () => { const l = await __Q.Versions.list(__Q.S.doc.id, true); for (const v of l) await __Q.Versions.remove(v); }")
        await page.wait_for_timeout(300)
        stored = await st("id => [...window.__mockStore.entries()].some(([k, v]) => k.includes('/docs/' + id + '/chunks/') && JSON.stringify(v).includes('data:image/png'))", did)
        ok(not stored, 'once no version uses it, it is deleted')
        await st("async id => { await __Q.Versions.snapshot('Keep'); await __Q.CloudStore.remove(id); }", did)
        left = await st("id => [...window.__mockStore.keys()].filter(k => k.includes('/docs/' + id)).length", did)
        ok(left == 0, 'deleting a document deletes its versions and parts', left)

        print('7. compare with a Word file')
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Notice', html: h }))", '<p>The meeting is on Sunday at 10 am.</p><p>Bring the files.</p>')
        await page.wait_for_timeout(300)
        b64 = await st("""async () => { const b = await __Q.buildDocx(); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
        path = os.path.join(tempfile.gettempdir(), 'notice-old.docx')
        open(path, 'wb').write(base64.b64decode(b64))
        await st("() => { const ps = document.querySelectorAll('#editor p'); ps[0].firstChild.data = 'The meeting is on Monday at 11 am.'; }")
        await page.click('#tab-review')
        await page.locator('.rb:visible:has(.cap:text-is("Compare"))').click()
        await page.wait_for_timeout(200)
        async with page.expect_file_chooser() as fc:
            await page.locator('.pop .mi', has_text='Compare with a Word File').click()
        await (await fc.value).set_files(path)
        await page.wait_for_timeout(1500)
        await page.click('.dialog .btn.primary')
        await page.wait_for_timeout(1200)
        d3 = await st("() => [__Q.S.doc.title, [...document.querySelectorAll('#editor del.tc')].map(e => e.textContent), [...document.querySelectorAll('#editor ins.tc')].map(e => e.textContent)]")
        ok(d3[0] == 'Notice compared with notice-old' and d3[1] == ['Sunday', '10'] and d3[2] == ['Monday', '11'], 'a new document shows what changed since the Word file', d3)
        ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors', errors)
        await b.close()

    print('8. in this browser (no account)')
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1200, height=850)
        await load(page)
        st = lambda js, *a: page.evaluate(js, *a)
        await page.wait_for_timeout(800)
        ok(await st("() => __Q.Store.impl.kind") == 'local', 'no account: Folio saves in this browser')
        await st("h => __Q.openDoc(__Q.newDocModel({ title: 'Local', html: h }))", '<p>First words here.</p>')
        await page.wait_for_timeout(300)
        await st("() => { __Q.Versions.gap = 0; __Q.Saver.mark(); }"); await page.wait_for_timeout(1800)
        await st("() => { document.querySelector('#editor p').firstChild.data = 'Second words here.'; __Q.Saver.mark(); }"); await page.wait_for_timeout(1800)
        v = await st(VERS)
        ok(len(v) == 2, 'versions are kept in this browser', v)
        t = await st("async () => { const l = await __Q.Versions.list(__Q.S.doc.id, true); await __Q.Versions.restore(l[1]); return document.querySelector('#editor p').textContent; }")
        ok(t == 'First words here.', 'and restore', t)
        did = await st("() => __Q.S.doc.id")
        left = await st("async id => { await __Q.LocalStore.remove(id); return (await __Q.LocalStore.listVersions(id)).length; }", did)
        ok(left == 0, 'deleting the document deletes them', left)
        ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors', errors)
        await b.close()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')

asyncio.run(main())
