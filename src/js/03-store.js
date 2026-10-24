/* ===================== Capabilities & storage ===================== */
const Cap = { db: null, user: null, downloads: null, sample: null, uid: null, name: '', color: '', ready: false };
const capsReady = (async () => {
  const c = window.claude;
  if (!c || typeof c.use !== 'function') { Cap.ready = true; return Cap; }
  const use = n => Promise.resolve().then(() => c.use(n)).catch(() => null);
  const [db, user, downloads, sample] = await Promise.all([use('db'), use('user'), use('downloads'), use('sample')]);
  Object.assign(Cap, { db, user, downloads, sample });
  if (user) {
    try { const me = await user.me(); Cap.uid = me.id || null; Cap.name = me.name || ''; Cap.color = me.color || ''; } catch { }
    if (!Cap.uid) { try { Cap.uid = await user.id(); } catch { } }
  }
  Cap.ready = true;
  return Cap;
})();

function metaOf(doc) {
  return { id: doc.id, title: doc.title, modified: doc.modified, created: doc.created, words: doc.words || 0, preview: doc.preview || '', size: doc.page && doc.page.size };
}

const LocalStore = {
  kind: 'local',
  _db: null,
  _mem: new Map(),
  _memProfile: null,
  _failed: false,
  async open() {
    if (this._db) return this._db;
    if (this._failed) throw new Error('no-idb');
    if (this._opening) return this._opening;
    this._opening = (async () => {
      try {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('folio', 1);
          r.onupgradeneeded = () => { r.result.createObjectStore('docs', { keyPath: 'id' }); r.result.createObjectStore('kv'); };
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
          r.onblocked = () => rej(new Error('blocked'));
        });
        // a newer copy of Folio in another tab may need to change the database: let go of it and
        // ask for a reload, instead of holding that tab up
        db.onversionchange = () => {
          db.close(); this._db = null; this._failed = true;
          toast('Folio was updated in another tab. Reload this one to keep saving your work here.', { ms: 60000, action: { label: 'Reload', fn: () => location.reload() } });
        };
        // bringing over older data never holds up the editor; if it is slow it finishes in the background
        await Promise.race([this.migrate(db), new Promise(r => setTimeout(r, 8000))]);
        this._db = db;
        return db;
      } catch (e) { this._failed = true; throw e; } finally { this._opening = null; }
    })();
    return this._opening;
  },
  /* Documents, fonts and settings saved under the app's earlier name ('quire-writer') move into
     'folio'. The old database is removed only once everything is copied and no other tab still has
     it open (a tab with the old page may still be saving there). Until then this runs at each start
     and also brings over what was saved there since the previous run, without bringing back
     documents or fonts deleted here in the meantime. */
  async migrate(db) {
    const mark = await new Promise(res => {
      try { const r = db.transaction('kv', 'readonly').objectStore('kv').get('migrated:quire-writer'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
      catch { res(null); }
    });
    const prev = mark && typeof mark === 'object' ? mark : null;   // { t, keys } from a run that had to leave it
    const run = this.moveOld(db, mark, prev);
    // the first time, the editor waits for the documents. Later runs only bring over what a tab with
    // the old page saved since, and may have to wait for that tab to close, so they go on in the background.
    if (!prev) await run;
  },
  async moveOld(db, mark, prev) {
    const OLD = 'quire-writer', MARK = 'migrated:' + OLD;
    const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const read = (name, fn) => req(fn(db.transaction(name, 'readonly').objectStore(name)));
    const write = (name, fn) => new Promise((res, rej) => {
      const tx = db.transaction(name, 'readwrite'); fn(tx.objectStore(name));
      tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error);
    });
    let old = null;
    try {
      const gone = async () => { if (mark != null) await write('kv', os => os.delete(MARK)); };
      if (indexedDB.databases && !(await indexedDB.databases()).some(d => d.name === OLD)) return gone();
      // open without creating it: an upgrade means it never existed
      old = await new Promise(res => {
        const r = indexedDB.open(OLD);
        r.onupgradeneeded = () => { try { r.transaction.abort(); } catch { } };
        r.onsuccess = () => res(r.result);
        r.onerror = r.onblocked = () => res(null);
      });
      if (!old) return gone();
      const started = Date.now(), version = old.version;
      const seen = new Set(prev && Array.isArray(prev.keys) ? prev.keys : []);
      const all = name => new Promise((res, rej) => {   // keys and values from one snapshot
        const os = old.transaction(name, 'readonly').objectStore(name), k = os.getAllKeys(), v = os.getAll();
        v.onsuccess = () => res(k.result.map((key, i) => [key, v.result[i]]));
        k.onerror = v.onerror = () => rej(k.error || v.error);
      });
      if (old.objectStoreNames.contains('docs')) {
        const here = new Map((await read('docs', os => os.getAll())).map(d => [d.id, d.modified || 0]));
        const take = (await all('docs')).map(e => e[1]).filter(d => d && d.id != null
          && (!prev || (d.modified || 0) > (prev.t || 0))              // after the first run: only what was saved there since
          && (!here.has(d.id) || (d.modified || 0) > here.get(d.id)));  // never over a newer copy
        if (take.length) await write('docs', os => take.forEach(d => os.put(d)));
      }
      const keys = new Set(seen);
      if (old.objectStoreNames.contains('kv')) {
        const entries = (await all('kv')).filter(e => e[0] !== MARK);
        const have = new Set(await read('kv', os => os.getAllKeys()));
        const fonts = (await read('kv', os => os.get('fonts'))) || [];
        await write('kv', os => {
          for (const [k, v] of entries) {
            if (k === 'fonts') {   // the list of added fonts: add the ones not brought over before
              const ids = new Set(fonts.map(m => m && m.id));
              const add = (Array.isArray(v) ? v : []).filter(m => m && !ids.has(m.id) && !seen.has('font:' + m.id));
              if (add.length) os.put(fonts.concat(add), 'fonts');
            } else if (!seen.has(k) && !have.has(k)) os.put(v, k);
          }
        });
        entries.forEach(e => keys.add(e[0]));
      }
      old.close(); old = null;
      // asking for a newer version tells whether another tab still has it open ("blocked");
      // the upgrade itself is cancelled, so the old database stays exactly as it was
      const free = await new Promise(res => {
        const r = indexedDB.open(OLD, version + 1);
        r.onupgradeneeded = () => { try { r.transaction.abort(); } catch { } res(true); };
        r.onblocked = () => res(false);
        r.onerror = () => res(true);
        r.onsuccess = () => { r.result.close(); res(true); };
      });
      if (!free) { await write('kv', os => os.put({ t: started, keys: [...keys] }, MARK)); return; }
      const del = indexedDB.deleteDatabase(OLD);
      del.onsuccess = () => { if (mark != null) write('kv', os => os.delete(MARK)).catch(() => { }); };
    } catch (e) {
      console.warn('could not bring over documents saved under the earlier name; they stay there and are tried again next time', e);
      try { old && old.close(); } catch { }
    }
  },
  async _tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  async list() {
    try { return (await this._tx('docs', 'readonly', os => os.getAll())).map(metaOf); }
    catch { return [...this._mem.values()].map(metaOf); }
  },
  async load(id) {
    try { return (await this._tx('docs', 'readonly', os => os.get(id))) || null; }
    catch { return this._mem.get(id) || null; }
  },
  async save(doc) {
    try { await this._tx('docs', 'readwrite', os => os.put(doc)); }
    catch { this._mem.set(doc.id, JSON.parse(JSON.stringify(doc))); this.volatile = true; }
  },
  async remove(id) {
    try { await this._tx('docs', 'readwrite', os => os.delete(id)); } catch { }
    this._mem.delete(id);
    for (const v of await this.listVersions(id)) { try { await this.removeVersion(id, v); } catch { } }
  },
  /* versions (Versions): copies, listed under 'vers:<doc>' and kept under 'ver:<doc>:<version>' */
  _memVers: new Map(),
  async listVersions(id) {
    try { return (await this._tx('kv', 'readonly', os => os.get('vers:' + id))) || []; }
    catch { return (this._memVers.get('vers:' + id) || []).slice(); }
  },
  async putVersions(id, list) {
    try { await this._tx('kv', 'readwrite', os => os.put(list, 'vers:' + id)); } catch { this._memVers.set('vers:' + id, list.slice()); }
  },
  async addVersion(id, v, data) {
    try { await this._tx('kv', 'readwrite', os => os.put(data, 'ver:' + id + ':' + v.id)); } catch { this._memVers.set('ver:' + id + ':' + v.id, data); }
    const list = (await this.listVersions(id)).filter(x => x.id !== v.id);
    list.unshift(v);
    await this.putVersions(id, list);
  },
  async loadVersion(id, v) {
    let d = null;
    try { d = await this._tx('kv', 'readonly', os => os.get('ver:' + id + ':' + v.id)); } catch { d = this._memVers.get('ver:' + id + ':' + v.id); }
    if (!d) throw new Error('version missing');
    return { html: d.html || '', body: JSON.parse(d.body || '{}') };
  },
  async renameVersion(id, v) { await this.putVersions(id, (await this.listVersions(id)).map(x => (x.id === v.id ? Object.assign({}, x, { name: v.name, auto: v.auto }) : x))); },
  async removeVersion(id, v) {
    try { await this._tx('kv', 'readwrite', os => os.delete('ver:' + id + ':' + v.id)); } catch { this._memVers.delete('ver:' + id + ':' + v.id); }
    await this.putVersions(id, (await this.listVersions(id)).filter(x => x.id !== v.id));
  },
  async getProfile() {
    try { return (await this._tx('kv', 'readonly', os => os.get('profile'))) || lsGet('folio.profile', null); }
    catch { return this._memProfile || lsGet('folio.profile', null); }
  },
  async setProfile(p) {
    lsSet('folio.profile', p);
    try { await this._tx('kv', 'readwrite', os => os.put(p, 'profile')); } catch { this._memProfile = p; }
  },
};

/* Split HTML into content-addressed chunks so unchanged parts (images especially) are written once. */
function chunkHtml(html) {
  const MAXC = 60000, MAXB = 240000;
  const pieces = html.split(/(?<=<\/(?:p|h[1-6]|li|tr|table|ul|ol|div)>)/i);
  const out = [];
  let cur = '';
  const enc = new TextEncoder();
  const push = s => {
    if (!s) return;
    if (enc.encode(JSON.stringify(s)).length > MAXB) { const half = Math.ceil(s.length / 2); push(s.slice(0, half)); push(s.slice(half)); return; }
    out.push({ id: 'c' + hash53(s) + s.length.toString(36), d: s });
  };
  for (const p of pieces) {
    if (p.length > MAXC) {
      push(cur); cur = '';
      for (let i = 0; i < p.length; i += MAXC) push(p.slice(i, i + MAXC));
      continue;
    }
    if (cur.length + p.length > MAXC) { push(cur); cur = ''; }
    cur += p;
    if (parseInt(hash53(p).slice(-2), 36) % 6 === 0 && cur.length > 2000) { push(cur); cur = ''; }
  }
  push(cur);
  return out;
}

const CloudStore = {
  kind: 'cloud',
  _known: {},
  _pins: {},          // doc id -> chunks its versions use (never deleted with the document's own)
  base() { return Cap.db.doc('data/users/' + Cap.uid + '/profile'); },
  docs() { return this.base().collection('docs'); },
  async list() {
    const snap = await this.docs().orderBy('modified', 'desc').limit(500).get();
    return snap.docs.filter(d => d.exists).map(d => d.data()).map(m => ({ id: m.id, title: m.title, modified: m.modified, created: m.created, words: m.words, preview: m.preview, size: m.pageSize }));
  },
  /* the stored parts, in order: [texts] (null for a missing one) */
  async fetchChunks(ref, ids) {
    const parts = [];
    for (let i = 0; i < ids.length; i += 8) parts.push(...await Promise.all(ids.slice(i, i + 8).map(cid => ref.collection('chunks').doc(cid).get())));
    return parts.map(p => (p.exists ? p.data().d : null));
  },
  /* all the parts a document or version uses: its text's and its headers' (a logo can be big) */
  allChunks(m) { return (m.chunks || []).concat(m.hfChunks || [], m.fnChunks || []); },
  async load(id) {
    const ref = this.docs().doc(id);
    const ms = await ref.get();
    if (!ms.exists) return null;
    const m = ms.data();
    const ids = m.chunks || [], hids = m.hfChunks || [], fids = m.fnChunks || [];
    const parts = await this.fetchChunks(ref, ids.concat(hids, fids));
    const doc = JSON.parse(m.body || '{}');
    doc.html = parts.slice(0, ids.length).map(p => p || '').join('');
    if (parts.some(p => p == null)) doc._damaged = true;
    else {
      try {
        if (hids.length) doc.hf = JSON.parse(parts.slice(ids.length, ids.length + hids.length).join(''));
        if (fids.length) doc.footnotes = JSON.parse(parts.slice(ids.length + hids.length).join(''));
      } catch { doc._damaged = true; }
    }
    this._known[id] = new Set(ids.concat(hids, fids));
    return doc;
  },
  async save(doc) {
    const ref = this.docs().doc(doc.id);
    const { html, hf, footnotes, ...rest } = doc;
    const chunks = chunkHtml(html || '');
    // headers and footers and the notes (with their pictures) are stored in parts too, outside the 256 KB record
    const hfChunks = hf ? chunkHtml(JSON.stringify(hf)) : [];
    const fnChunks = footnotes && Object.keys(footnotes).length ? chunkHtml(JSON.stringify(footnotes)) : [];
    let known = this._known[doc.id];
    if (!known) {
      const ms = await ref.get();
      known = this._known[doc.id] = new Set(ms.exists ? this.allChunks(ms.data()) : []);
    }
    for (const c of chunks.concat(hfChunks, fnChunks)) {
      if (known.has(c.id)) continue;
      await withRetry(() => ref.collection('chunks').doc(c.id).set({ d: c.d }));
      known.add(c.id);
    }
    const meta = { id: doc.id, title: doc.title || 'Untitled document', modified: doc.modified, created: doc.created, words: doc.words || 0, preview: doc.preview || '', pageSize: (doc.page && doc.page.size) || '', chunks: chunks.map(c => c.id), hfChunks: hfChunks.map(c => c.id), fnChunks: fnChunks.map(c => c.id), body: JSON.stringify(rest), session: S.sessionId, v: 1 };
    await withRetry(() => ref.set(meta));
    const keep = new Set(this.allChunks(meta));
    let pins = null;
    try { pins = await this.pins(doc.id); } catch (e) { console.warn('versions unavailable; old parts kept', e); }
    if (pins) for (const cid of [...known]) {
      if (keep.has(cid) || pins.has(cid)) continue;
      try { await ref.collection('chunks').doc(cid).delete(); } catch { }
      known.delete(cid);
    }
    return meta;
  },
  async remove(id) {
    const ref = this.docs().doc(id);
    const ms = await ref.get();
    const chunks = new Set(ms.exists ? this.allChunks(ms.data()) : []);
    let vers = [];
    try { vers = await this.listVersions(id); } catch { }
    for (const v of vers) { this.allChunks(v).forEach(c => chunks.add(c)); try { await this.vers(id).doc(v.id).delete(); } catch { } }
    await ref.delete();
    for (const c of chunks) { try { await ref.collection('chunks').doc(c).delete(); } catch { } }
    delete this._known[id];
    delete this._pins[id];
  },
  /* versions (Versions): { id, at, name, auto, author, words, h, title, chunks, body } */
  vers(id) { return this.docs().doc(id).collection('versions'); },
  async pins(id) {
    if (!this._pins[id]) await this.listVersions(id);
    return this._pins[id];
  },
  async listVersions(id) {
    const s = await this.vers(id).get();
    const out = s.docs.filter(d => d.exists).map(d => d.data()).sort((a, b) => b.at - a.at);
    this._pins[id] = new Set(out.flatMap(v => this.allChunks(v)));
    return out;
  },
  async addVersion(id, v) {
    await withRetry(() => this.vers(id).doc(v.id).set(v));
    const p = this._pins[id] || (this._pins[id] = new Set());
    this.allChunks(v).forEach(c => p.add(c));
  },
  async loadVersion(id, v) {
    const ref = this.docs().doc(id), ids = v.chunks || [], hids = v.hfChunks || [], fids = v.fnChunks || [];
    const parts = await this.fetchChunks(ref, ids.concat(hids, fids));
    if (parts.some(p => p == null)) throw new Error('version incomplete');
    const body = JSON.parse(v.body || '{}');
    if (hids.length) body.hf = JSON.parse(parts.slice(ids.length, ids.length + hids.length).join(''));
    if (fids.length) body.footnotes = JSON.parse(parts.slice(ids.length + hids.length).join(''));
    return { html: parts.slice(0, ids.length).join(''), body };
  },
  async renameVersion(id, v) { await withRetry(() => this.vers(id).doc(v.id).set(v)); },
  async removeVersion(id, v) {
    await this.vers(id).doc(v.id).delete();
    await this.listVersions(id);
    const ms = await this.docs().doc(id).get();
    const cur = new Set(ms.exists ? this.allChunks(ms.data()) : []);
    for (const cid of this.allChunks(v)) {
      if (cur.has(cid) || this._pins[id].has(cid)) continue;
      try { await this.docs().doc(id).collection('chunks').doc(cid).delete(); } catch { }
      if (this._known[id]) this._known[id].delete(cid);
    }
  },
  async getProfile() { const s = await this.base().get(); return s.exists ? s.data() : null; },
  async setProfile(p) { await withRetry(() => this.base().set(p)); },
};
async function withRetry(fn) {
  try { return await fn(); }
  catch (e) {
    if (e && e.code === 'unavailable') { await sleep(400 + Math.random() * 600); return fn(); }
    throw e;
  }
}

const Store = {
  impl: LocalStore,
  get cloud() { return this.impl === CloudStore; },
  async init() {
    await capsReady;
    if (Cap.db && Cap.uid) {
      try { await CloudStore.getProfile(); this.impl = CloudStore; }
      catch (e) { console.warn('Account storage unavailable, using this browser', e); }
    }
    return this.impl;
  },
};

/* Autosave */
const Saver = {
  timer: 0, saving: false, again: false, fails: 0,
  mark() {
    if (!S.doc) return;
    S.doc.sample = false;
    S.dirty = true;
    setSaveState('dirty');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 1100);
  },
  async run() {
    if (!S.doc || !S.dirty) return;
    if (this.saving) { this.again = true; return; }
    this.saving = true; this.again = false; S.dirty = false;
    setSaveState('saving');
    const doc = snapshotDoc();
    try {
      const saved = await Store.impl.save(doc);
      this.fails = 0;
      setSaveState('saved');
      Versions.afterSave(doc, saved).catch(e => console.warn('version not kept', e));
      if (Prefs.lastDoc !== doc.id) { Prefs.lastDoc = doc.id; savePrefs(); }
    } catch (e) {
      S.dirty = true;
      this.fails++;
      const code = e && e.code;
      setSaveState('error', code === 'quota_exceeded' ? 'Storage full' : 'Not saved');
      if (code === 'quota_exceeded') toast('Your Folio storage is full. Delete documents or large pictures to keep saving.', { error: true, ms: 8000 });
      else if (code === 'invalid_argument') toast('This document could not be saved. Try removing very large pictures.', { error: true, ms: 8000 });
      else if (this.fails === 1) toast('Saving failed. Retrying in a few seconds.', { error: true });
      clearTimeout(this.timer);
      if (code !== 'quota_exceeded' && code !== 'invalid_argument') this.timer = setTimeout(() => this.run(), Math.min(30000, 3000 * this.fails));
    } finally {
      this.saving = false;
      if (this.again || (S.dirty && !this.fails)) { clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), 700); }
    }
  },
  async flush() { clearTimeout(this.timer); if (S.dirty) await this.run(); while (this.saving) await sleep(60); },
};

function snapshotDoc() {
  const d = S.doc;
  // a header or note being edited is kept as it is now; the document's text is the page's
  const live = S.editor;
  if (Story.cur) { Story.capture(); S.editor = Story.cur.body; }
  try {
    d.html = cleanHTML();
    d.modified = Date.now();
    const st = docStats(true);
    d.words = st.words;
    d.preview = st.preview;
  } finally { S.editor = live; }
  d.title = d.title || 'Untitled document';
  const copy = JSON.parse(JSON.stringify(d));
  // notes whose mark is gone stay in the open document (undo can bring the mark back), not in the saved one
  copy.footnotes = Notes.kept(copy.html, copy.footnotes);
  // so do the headers of sections whose break is gone
  Sections.prune(copy, copy.html);
  return copy;
}

function setSaveState(state, msg) {
  const el = $('#saveState');
  if (!el) return;
  const local = !Store.cloud;
  const map = {
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    saved: local ? (LocalStore.volatile ? 'Not stored (private window)' : 'Saved in this browser') : 'Saved',
    error: msg || 'Not saved',
  };
  el.dataset.state = state === 'saved' && local ? 'local' : state;
  el.querySelector('.txt').textContent = map[state] || '';
  el.title = state === 'saved' ? (local ? 'Saved in this browser only' : 'Saved to your Claude account') : '';
}

/* Preferences (per person) */
const savePrefs = debounce(async () => {
  lsSet('folio.prefs', { theme: Prefs.theme, units: Prefs.units, miniToolbar: Prefs.miniToolbar });
  try { await Store.impl.setProfile({ prefs: JSON.parse(JSON.stringify(Prefs)), v: 1 }); } catch (e) { console.warn('prefs not saved', e); }
}, 900);
async function loadPrefs() {
  try {
    const p = await Store.impl.getProfile();
    if (p && p.prefs) Object.assign(Prefs, p.prefs);
  } catch { }
}
