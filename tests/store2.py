"""Renaming Quire to Folio: what this browser saved under the old names ('quire-writer' IndexedDB,
'quire.*' localStorage) moves to the new ones.
  1. one tab: everything moves on first start, the old database and keys are removed
  2. a tab with the old page stays open and keeps saving: the old database is kept until that tab
     is gone, later saves there are brought over, and nothing deleted in Folio comes back
  3. a new person: nothing is created under the old name, and nothing is left behind"""
import asyncio, sys, json, time
sys.path.insert(0, 'tests')
from harness import *

ORIGIN = 'http://localhost:8765/'
fails = []
def ok(cond, what):
    print(('  ok   ' if cond else '  FAIL ') + what)
    if not cond: fails.append(what)

SEED = r"""async ({ docs, keepOpen }) => {
  const bytes = await (await fetch('/dist/fonts/dancingscript-r.ttf')).arrayBuffer();
  const db = await new Promise((res, rej) => { const r = indexedDB.open('quire-writer', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('docs', { keyPath: 'id' }); r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction(['docs', 'kv'], 'readwrite');
    docs.forEach(d => tx.objectStore('docs').put(d));
    tx.objectStore('kv').put({ prefs: { author: 'Reshad', units: 'cm', lastDoc: docs[0].id }, v: 1 }, 'profile');
    tx.objectStore('kv').put([{ id: 'f1', family: 'Old Font', weight: 400, italic: false, size: bytes.byteLength, name: 'old.ttf' }], 'fonts');
    tx.objectStore('kv').put(bytes, 'font:f1');
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  if (keepOpen) window.oldDb = db; else db.close();
  localStorage.setItem('quire.prefs', JSON.stringify({ theme: 'dark', units: 'cm', miniToolbar: false }));
  localStorage.setItem('quire.ruler', 'false');
  localStorage.setItem('quire.ribbonCollapsed', 'true');
  return true; }"""

# the old page saving more after Folio has started in another tab
OLD_TAB_SAVES = r"""async ({ edited, extra }) => {
  const db = window.oldDb;
  const bytes = await (await fetch('/dist/fonts/caladea-r.ttf')).arrayBuffer();
  const fonts = await new Promise(res => { const r = db.transaction('kv').objectStore('kv').get('fonts'); r.onsuccess = () => res(r.result || []); });
  await new Promise((res, rej) => { const tx = db.transaction(['docs', 'kv'], 'readwrite');
    tx.objectStore('docs').put(edited); tx.objectStore('docs').put(extra);
    tx.objectStore('kv').put(bytes, 'font:f2');
    tx.objectStore('kv').put(fonts.concat([{ id: 'f2', family: 'Second Font', weight: 400, italic: false, size: bytes.byteLength, name: 'second.ttf' }]), 'fonts');
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  return true; }"""

STATE = r"""async () => {
  const kv = await __Q.LocalStore._tx('kv', 'readonly', os => os.getAllKeys());
  const mark = await __Q.LocalStore._tx('kv', 'readonly', os => os.get('migrated:quire-writer'));
  return {
    docs: (await __Q.LocalStore.list()).map(d => d.title).sort(),
    open: __Q.S.doc.title, author: __Q.Prefs.author, units: __Q.Prefs.units, theme: __Q.Prefs.theme, mini: __Q.Prefs.miniToolbar,
    ruler: __Q.S.ruler, ribbonCollapsed: document.querySelector('#ribbon').classList.contains('collapsed'),
    fonts: __Q.UserFonts.list.map(m => m.family).sort(),
    faces: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')).filter(f => /Old Font|Second Font/.test(f)).sort(),
    kv: kv.map(String).sort(), mark: mark || null,
    ls: Object.keys(localStorage).filter(k => /^(quire|folio)\./.test(k)).sort(),
    dbs: (await indexedDB.databases()).map(d => d.name).sort() }; }"""

READY = "() => window.__Q && __Q.LocalStore._db && __Q.S.doc && !__Q.S.doc.sample && __Q.UserFonts.list.length > 0"

async def plain_page(ctx, errors):
    """another tab in the same browser, with the same network rules as the harness"""
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
    pg.on('console', lambda m: errors.append(('console.' + m.type, m.text)) if m.type == 'error' else None)
    async def route(r):
        u = r.request.url
        if 'fonts.googleapis.com' in u: await r.fulfill(status=200, content_type='text/css', body='')
        elif u.startswith('http://localhost'): await r.continue_()
        else: await r.abort()
    await pg.route('**/*', route)
    return pg

async def start_app(pg, reload=False):
    t = time.time()
    if reload: await pg.reload()
    else: await pg.goto(ORIGIN + 'dist/test.html')
    await pg.wait_for_function(READY, timeout=15000)
    await pg.wait_for_timeout(400)
    return time.time() - t

async def models(p):
    b, page, errors = await new_page(p)
    await load(page)
    m = await page.evaluate("""() => ['A', 'B'].map((x, i) => { const d = __Q.newDocModel({ title: 'Old letter ' + x, html: '<p>Written before the rename (' + x + ').</p>' });
      d.modified = Date.now() - 86400000 * (2 - i); return JSON.parse(JSON.stringify(d)); })""")
    await b.close()
    return m

async def one_tab(p, docs):
    print('1. one tab')
    b, page, errors = await new_page(p)
    await page.goto(ORIGIN + 'tests/')
    await page.evaluate(SEED, {'docs': docs, 'keepOpen': False})
    secs = await start_app(page)
    for when in ('first start', 'after reload'):
        if when == 'after reload': secs = await start_app(page, reload=True)
        r = await page.evaluate(STATE)
        print('  ', when, f'({secs:.1f}s):', json.dumps(r, ensure_ascii=False))
        ok(r['docs'] == ['Old letter A', 'Old letter B'], f'{when}: both documents are there')
        ok(r['open'] == 'Old letter A', f'{when}: the last document opened is opened again')
        ok(r['author'] == 'Reshad' and r['units'] == 'cm' and r['theme'] == 'dark' and r['mini'] is False, f'{when}: settings kept')
        ok(r['ruler'] is False and r['ribbonCollapsed'] is True, f'{when}: ruler and ribbon kept')
        ok(r['fonts'] == ['Old Font'] and r['faces'] == ['Old Font'], f'{when}: added font kept and loaded')
        ok(r['dbs'] == ['folio'] and not r['mark'] and not any('quire' in k for k in r['kv']), f'{when}: old database removed, nothing left behind')
        ok(r['ls'] == ['folio.prefs', 'folio.ribbonCollapsed', 'folio.ruler'], f'{when}: old settings keys moved')
        ok(secs < 5, f'{when}: starts without waiting')
    for e in errors: print('   ERR', e)
    ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors')
    await b.close()

async def two_tabs(p, docs):
    print('2. the old page still open in another tab')
    b, old_tab, errors = await new_page(p)
    ctx = old_tab.context
    await old_tab.goto(ORIGIN + 'tests/')
    await old_tab.evaluate(SEED, {'docs': docs, 'keepOpen': True})
    app = await plain_page(ctx, errors)
    secs = await start_app(app)
    r = await app.evaluate(STATE)
    print('   first start', f'({secs:.1f}s):', json.dumps(r, ensure_ascii=False))
    ok(r['docs'] == ['Old letter A', 'Old letter B'] and r['fonts'] == ['Old Font'], 'documents and font brought over')
    ok('quire-writer' in r['dbs'] and r['mark'] and r['mark'].get('t'), 'old database kept while the old tab has it open')
    ok(secs < 5, 'starts without waiting for the old tab')
    secs = await start_app(app, reload=True)
    r = await app.evaluate(STATE)
    print('   reload, old tab still open', f'({secs:.1f}s):', json.dumps(r, ensure_ascii=False))
    ok(r['docs'] == ['Old letter A', 'Old letter B'] and 'quire-writer' in r['dbs'], 'reload with the old tab open: same documents, no duplicates')
    ok(secs < 5, 'reload does not wait for the old tab either')
    # in Folio: delete B and the old font; in the old tab: edit A, add C and a second font
    b_id = docs[1]['id']
    await app.evaluate("async ([id]) => { await __Q.LocalStore.remove(id); await __Q.UserFonts.remove('f1'); }", [b_id])
    edited = dict(docs[0], title='Old letter A (edited in the old tab)', modified=int(time.time() * 1000) + 5)
    extra = dict(docs[0], id='d-extra', title='Old letter C', modified=int(time.time() * 1000) + 5)
    await old_tab.evaluate(OLD_TAB_SAVES, {'edited': edited, 'extra': extra})
    await old_tab.close()
    await app.wait_for_timeout(1500)
    r = await app.evaluate("async () => ({ docs: (await __Q.LocalStore.list()).map(d => d.title).sort(), dbs: (await indexedDB.databases()).map(d => d.name).sort() })")
    print('   old tab closed, Folio still open:', json.dumps(r, ensure_ascii=False))
    ok(r['docs'] == ['Old letter A (edited in the old tab)', 'Old letter C'] and r['dbs'] == ['folio'], 'once the old tab closes, its later saves arrive without a reload')
    secs = await start_app(app, reload=True)
    r = await app.evaluate(STATE)
    print('   after the old tab closed', f'({secs:.1f}s):', json.dumps(r, ensure_ascii=False))
    ok(r['docs'] == ['Old letter A (edited in the old tab)', 'Old letter C'], 'later saves in the old tab arrive; the deleted document stays deleted')
    ok(r['fonts'] == ['Second Font'] and r['faces'] == ['Second Font'], 'font added in the old tab arrives; the removed font stays removed')
    ok(r['dbs'] == ['folio'] and not r['mark'] and not any('quire' in k for k in r['kv']), 'old database removed once the old tab is gone')
    for e in errors: print('   ERR', e)
    ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors')
    await b.close()

async def new_person(p):
    print('3. nothing saved before')
    b, page, errors = await new_page(p)
    await load(page)
    await page.wait_for_function("() => window.__Q && __Q.LocalStore._db", timeout=15000)
    await page.wait_for_timeout(500)
    r = await page.evaluate("""async () => ({ dbs: (await indexedDB.databases()).map(d => d.name).sort(),
      kv: (await __Q.LocalStore._tx('kv', 'readonly', os => os.getAllKeys())).map(String),
      ls: Object.keys(localStorage).filter(k => /quire/.test(k)) })""")
    print('  ', json.dumps(r))
    ok(r['dbs'] == ['folio'] and not any('quire' in k for k in r['kv']) and not r['ls'], 'nothing under the old name')
    ok(not [e for e in errors if e[0] == 'pageerror'], 'no page errors')
    await b.close()

async def main():
    async with async_playwright() as p:
        docs = await models(p)
        await one_tab(p, docs)
        await two_tabs(p, docs)
        await new_person(p)
    print('MIGRATION', 'OK' if not fails else 'FAILED: ' + '; '.join(fails))

asyncio.run(main())
