/* ===================== Signatures and stamps =====================
   The person's own signatures and office stamps (seals), kept with their account like fonts
   (data/users/<id>/profile/sigs, private to them; or in this browser), to put into any letter
   from Insert › Signature. Each remembers its size and whether it goes in the line or in front
   of the text (a seal over the signature). Add one by drawing it, from a photo or scan (the
   paper is made transparent and the picture trimmed), or by saving a picture in the document. */
const Sigs = {
  list: null,      // [{ id, name, w, h, wrap, created, url }]
  loading: null,
  PART: 180000,    // characters per stored part (stored documents are capped at 256 KiB)
  MAX: 900,        // pixels across, at most
  async store() {
    await capsReady;
    if (Store.cloud) {
      const col = CloudStore.base().collection('sigs');
      return {
        async list() { const s = await col.get(); return s.docs.filter(d => d.exists).map(d => d.data()); },
        async load(meta) { const parts = await Promise.all(Array.from({ length: meta.parts || 0 }, (_, i) => col.doc(meta.id).collection('parts').doc(String(i)).get())); return parts.map(p => (p.exists ? p.data().d : '')).join(''); },
        async save(meta, url) {
          const n = Math.ceil(url.length / Sigs.PART);
          for (let i = 0; i < n; i++) await withRetry(() => col.doc(meta.id).collection('parts').doc(String(i)).set({ d: url.slice(i * Sigs.PART, (i + 1) * Sigs.PART) }));
          await withRetry(() => col.doc(meta.id).set(Object.assign({}, meta, { parts: n })));
        },
        async rename(meta) { const s = await col.doc(meta.id).get(); if (s.exists) await withRetry(() => col.doc(meta.id).set(Object.assign({}, s.data(), { name: meta.name }))); },
        async remove(meta) { const s = await col.doc(meta.id).get(); const n = s.exists ? s.data().parts || 0 : 0; await col.doc(meta.id).delete(); for (let i = 0; i < n; i++) { try { await col.doc(meta.id).collection('parts').doc(String(i)).delete(); } catch { } } },
      };
    }
    const kv = (mode, fn) => LocalStore._tx('kv', mode, fn);
    const mem = this._mem || (this._mem = new Map());
    return {
      async list() { try { return (await kv('readonly', os => os.get('sigs'))) || []; } catch { return [...mem.values()].map(v => v.meta); } },
      async load(meta) { try { return (await kv('readonly', os => os.get('sig:' + meta.id))) || ''; } catch { return (mem.get(meta.id) || {}).url || ''; } },
      async save(meta, url) {
        try { const all = (await kv('readonly', os => os.get('sigs')) || []).filter(m => m.id !== meta.id); await kv('readwrite', os => os.put(url, 'sig:' + meta.id)); all.push(meta); await kv('readwrite', os => os.put(all, 'sigs')); }
        catch { mem.set(meta.id, { meta, url }); }
      },
      async rename(meta) {
        try { const all = (await kv('readonly', os => os.get('sigs')) || []).map(m => (m.id === meta.id ? Object.assign({}, m, { name: meta.name }) : m)); await kv('readwrite', os => os.put(all, 'sigs')); }
        catch { const v = mem.get(meta.id); if (v) v.meta.name = meta.name; }
      },
      async remove(meta) {
        try { const all = (await kv('readonly', os => os.get('sigs')) || []).filter(m => m.id !== meta.id); await kv('readwrite', os => os.delete('sig:' + meta.id)); await kv('readwrite', os => os.put(all, 'sigs')); }
        catch { mem.delete(meta.id); }
      },
    };
  },
  async all(force) {
    if (this.list && !force) return this.list;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const st = await this.store();
        const metas = (await st.list()).filter(m => m && m.id).sort((a, b) => (a.created || 0) - (b.created || 0));
        const out = [];
        for (const m of metas) { try { const url = await st.load(m); if (/^data:image\//.test(url)) out.push(Object.assign({}, m, { url })); } catch { } }
        this.list = out;
      } catch (e) { console.warn('signatures unavailable', e); this.list = this.list || []; }
      finally { this.loading = null; }
      return this.list;
    })();
    return this.loading;
  },
  meta(s) { const { url, ...m } = s; void url; return m; },
  /* keep a new one: { name, url, w, h, wrap } */
  async add(sig) {
    await this.all();
    const meta = { id: uid('sig'), name: String(sig.name || 'Signature').trim().slice(0, 60) || 'Signature', w: Math.round(sig.w) || 150, h: Math.round(sig.h) || 60, wrap: ['inline', 'front', 'behind'].includes(sig.wrap) ? sig.wrap : 'inline', created: Date.now() };
    const st = await this.store();
    await st.save(meta, sig.url);
    this.list.push(Object.assign({}, meta, { url: sig.url }));
    return meta;
  },
  async restore(s) { const st = await this.store(); await st.save(this.meta(s), s.url); await this.all(); if (!this.list.some(x => x.id === s.id)) { this.list.push(s); this.list.sort((a, b) => (a.created || 0) - (b.created || 0)); } },
  async remove(id) {
    const s = (this.list || []).find(x => x.id === id);
    if (!s) return;
    this.list = this.list.filter(x => x.id !== id);
    try { await (await this.store()).remove(this.meta(s)); } catch (e) { console.warn(e); toast('It couldn’t be deleted. Try again.', { error: true }); }
  },
  async rename(id, name) {
    const s = (this.list || []).find(x => x.id === id);
    if (!s || !name || name === s.name) return;
    s.name = name.slice(0, 60);
    try { await (await this.store()).rename(this.meta(s)); } catch (e) { console.warn(e); }
  },
  /* a picture small enough to keep: at most MAX pixels across */
  async shrink(url) {
    const o = await loadImg(url);
    const W = o.naturalWidth, H = o.naturalHeight, k = Math.min(1, this.MAX / Math.max(W, H));
    if (k >= 1 && /^data:image\/(png|jpeg)/i.test(url)) return url;
    const cv = canvasOf(W * k, H * k), g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(o, 0, 0, cv.width, cv.height);
    return hasAlpha(o) ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
  },
  /* ---------- putting one in ---------- */
  async insert(sig) {
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to change it.'); return null; }
    // a selected picture stays: the new one goes next to it, not in its place
    if (S.selImg && S.selImg.isConnected) { const im = S.selImg; Images.deselect(); S.editor.focus({ preventScroll: true }); caretAfter(im); }
    else focusEditor();
    const cr = caretRect();
    const w = sig.w || 150, hh = sig.h || 60, z = S.zoom;
    let img = null;
    change(() => {
      img = h('img', { src: sig.url, alt: sig.name || 'Signature' });
      img.style.width = Math.round(w) + 'px';
      const r = getRange();
      if (r) {
        const leaf = blockOf(r.startContainer);
        if (leaf && leaf.childNodes.length === 1 && leaf.firstChild.nodeName === 'BR' && sig.wrap === 'inline') { leaf.innerHTML = ''; leaf.appendChild(img); }
        else { if (!r.collapsed) r.deleteContents(); r.insertNode(img); }
      } else S.editor.appendChild(h('p', null, img));
      if (sig.wrap === 'front' || sig.wrap === 'behind') {
        // centred on the caret, like a seal stamped there
        img.classList.add('img-' + sig.wrap);
        const at = cr ? { left: cr.left - w * z / 2, top: (cr.top + (cr.bottom || cr.top)) / 2 - hh * z / 2 } : img.getBoundingClientRect();
        PicEdit.anchor(img, at);
      }
      caretAfter(img);
    }, { full: true });
    if (img) { if (img.decode) await img.decode().catch(() => { }); Images.select(img); }
    return img;
  },
  /* Insert › Signature */
  async menu(a) {
    const list = await this.all();
    const items = [];
    if (list.length) {
      items.push({ head: 'Your signatures and stamps' });
      for (const s of list) {
        const b = h('button', { class: 'mi sig-mi', type: 'button', role: 'menuitem', title: s.name }, h('span', { class: 'sig-thumb' }, h('img', { src: s.url, alt: '' })), h('span', { class: 'lb' }, s.name));
        b.addEventListener('click', () => { Menu.close(); setTimeout(() => this.insert(s), 0); });
        items.push({ el: b });
      }
      items.push('-');
    } else items.push({ el: h('div', { class: 'sig-empty' }, 'Keep your signature and your office stamp here, to put them into any letter with one click.') });
    items.push(
      { label: 'Draw a Signature…', icon: 'pen', disabled: S.readOnly, onClick: () => this.draw() },
      { label: 'Add from a Photo or Scan…', icon: 'image', disabled: S.readOnly, onClick: () => this.fromFile() },
      { label: 'Save Selected Picture as Signature…', icon: 'signature', disabled: !S.selImg, onClick: () => this.saveSelected() });
    if (list.length) items.push({ label: 'Manage Signatures…', icon: 'gear', onClick: () => this.manage() });
    Menu.open(a, items, { cls: 'sig-menu' });
  },
  /* ---------- drawing one ---------- */
  draw() {
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to change it.'); return; }
    const W = 560, H = 220, K = 2;
    const cv = h('canvas', { class: 'sig-pad', width: W * K, height: H * K, tabindex: '0', role: 'img', 'aria-label': 'Signature pad: sign with the mouse, a finger or a pen' });
    const g = cv.getContext('2d');
    const st = { color: '#1b3a8c', size: 2.4, strokes: [] };
    let cur = null;
    const paint = () => {
      g.clearRect(0, 0, cv.width, cv.height);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const s of st.strokes) {
        g.strokeStyle = s.color; g.fillStyle = s.color;
        const p = s.pts;
        if (p.length === 1) { g.beginPath(); g.arc(p[0].x, p[0].y, s.size * K * 0.6, 0, Math.PI * 2); g.fill(); continue; }
        let wPrev = s.size * K;
        for (let i = 1; i < p.length; i++) {
          const a = p[i - 1], b = p[i];
          const dist = Math.hypot(b.x - a.x, b.y - a.y) / K, dt = Math.max(1, b.t - a.t);
          const fromSpeed = clamp(1.5 - (dist / dt) * 0.35, 0.55, 1.35);
          const want = s.size * K * (b.pr > 0 && b.pr !== 0.5 ? 0.5 + b.pr : fromSpeed);
          const wv = wPrev * 0.65 + want * 0.35;
          wPrev = wv;
          const m0 = i > 1 ? { x: (p[i - 2].x + a.x) / 2, y: (p[i - 2].y + a.y) / 2 } : a, m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          g.lineWidth = wv;
          g.beginPath(); g.moveTo(m0.x, m0.y); g.quadraticCurveTo(a.x, a.y, m1.x, m1.y);
          if (i === p.length - 1) g.lineTo(b.x, b.y);
          g.stroke();
        }
      }
    };
    const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height), t: e.timeStamp, pr: e.pointerType === 'pen' ? e.pressure : 0 }; };
    cv.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      cur = { color: st.color, size: st.size, pts: [pt(e)] };
      st.strokes.push(cur);
      paint();
    });
    cv.addEventListener('pointermove', e => {
      if (!cur) return;
      for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) cur.pts.push(pt(ev));
      paint();
    });
    const end = () => { cur = null; sync(); };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    const chipRow = (label, opts, get, set) => {
      const row = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label }, opts.map(([v, l, dot]) => h('button', { class: 'chip', type: 'button', role: 'radio', 'data-v': String(v), 'aria-checked': String(get() === v) }, dot ? h('i', { class: 'ink-dot', style: { background: dot } }) : null, l)));
      row.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; const o = opts.find(x => String(x[0]) === b.dataset.v); set(o[0]); row.querySelectorAll('button').forEach(c => c.setAttribute('aria-checked', String(c === b))); });
      return row;
    };
    const undoB = h('button', { class: 'btn', type: 'button' }, 'Undo stroke'), clearB = h('button', { class: 'btn', type: 'button' }, 'Clear');
    undoB.addEventListener('click', () => { st.strokes.pop(); paint(); sync(); });
    clearB.addEventListener('click', () => { st.strokes = []; paint(); sync(); });
    const sync = () => { undoB.disabled = clearB.disabled = !st.strokes.length; };
    const name = input('My signature', { maxlength: '60' });
    const keep = checkbox('Keep it in my signatures (Insert › Signature)', true, 'sigKeep');
    const body = h('div', null, cv,
      h('div', { class: 'sig-tools' },
        chipRow('Ink', [['#1b3a8c', 'Blue', '#1b3a8c'], ['#111111', 'Black', '#111111']], () => st.color, v => { st.color = v; }),
        chipRow('Pen', [[1.6, 'Fine'], [2.4, 'Medium'], [3.4, 'Bold']], () => st.size, v => { st.size = v; }),
        h('span', { style: { flex: '1' } }), undoB, clearB),
      field('Name', name, 'sigDrawName'), keep.el);
    sync();
    openDialog({ title: 'Draw a Signature', width: 600, body, focus: cv,
      buttons: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: () => {
        if (!st.strokes.length) { toast('Sign on the pad first.'); return false; }
        const out = PicEdit.trim(cv);
        const k = Math.min(1, this.MAX / Math.max(out.width, out.height));
        let fin = out;
        if (k < 1) { fin = canvasOf(out.width * k, out.height * k); const fg = fin.getContext('2d'); fg.imageSmoothingQuality = 'high'; fg.drawImage(out, 0, 0, fin.width, fin.height); }
        // about half the size it was drawn at: a signature across most of the pad is about 1.5 in wide
        const w = clamp(out.width / K * 0.5, 50, 260), hh = w * out.height / out.width;
        const sig = { name: name.value.trim() || 'My signature', url: fin.toDataURL('image/png'), w, h: hh, wrap: 'inline' };
        (async () => {
          if (keep.input.checked) { try { await this.add(sig); toast(`Saved “${sig.name}”. Find it under Insert › Signature.`); } catch (e) { console.warn(e); toast('The signature couldn’t be saved, so it’s only in this document.', { error: true }); } }
          await this.insert(sig);
        })();
      } }] });
  },
  /* ---------- from a photo or scan ---------- */
  fromFile() {
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to change it.'); return; }
    pickFile('image/*', false, async files => {
      let o;
      try { const p = await Images.prepare(files[0]); o = await loadImg(p.url); }
      catch { toast('That picture could not be opened.', { error: true }); return; }
      const c = PicEdit.bgControls(o, Object.assign(PicEdit.blank(), { bg: 0.5 }), null, { trim: true });
      const name = input(/stamp|seal/i.test(files[0].name) ? 'Office stamp' : 'Signature', { maxlength: '60' });
      const kind = select([['inline', 'A signature: in the line'], ['front', 'A stamp or seal: in front of the text']], /stamp|seal/i.test(files[0].name) ? 'front' : 'inline');
      openDialog({ title: 'Add a Signature or Stamp', width: 580,
        body: h('div', null, c.el, h('div', { class: 'grid2' }, field('Name', name, 'sigName'), field('Use it as', kind, 'sigKind')), h('p', { class: 'note' }, 'Sign or stamp a blank sheet of paper and take a photo straight on, in good light. The paper is made transparent and the picture is trimmed.')),
        buttons: [{ label: 'Cancel' }, { label: 'Save and Insert', primary: true, onClick: () => { this.finishAdd(o, c.cur(), name.value.trim() || 'Signature', kind.value); } }] });
    });
  },
  async finishAdd(o, x, name, wrap) {
    const res = await PicEdit.bake(o, x, { max: this.MAX, trim: true });
    // a signature about 1.6 in wide, a seal about 1.3 in across, whatever the photo's size
    const w = wrap === 'front' ? 125 : 155, hh = w * res.h / res.w;
    const sig = { name, url: res.url, w, h: hh, wrap };
    try { await this.add(sig); toast(`Saved “${name}”. Find it under Insert › Signature.`); }
    catch (e) { console.warn(e); toast('It couldn’t be saved, so it’s only in this document.', { error: true }); }
    return this.insert(sig);
  },
  /* ---------- a picture in the document ---------- */
  saveSelected() {
    const img = S.selImg;
    if (!img) { toast('Select a picture first, such as a signature you added.'); return; }
    const w0 = Images.wrapMode(img);
    const name = input(img.getAttribute('alt') || 'Signature', { maxlength: '60' });
    const kind = select([['inline', 'In the line'], ['front', 'In front of the text'], ['behind', 'Behind the text']], w0 === 'front' || w0 === 'behind' ? w0 : 'inline');
    openDialog({ title: 'Save as Signature', width: 420,
      body: h('div', null, field('Name', name, 'ssName'), field('Put it', kind, 'ssKind'), h('p', { class: 'note' }, 'It keeps this size. Find it under Insert › Signature in any document. Remove Background first if the paper shows.')),
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { this.saveImg(img, name.value.trim() || 'Signature', kind.value); } }] });
  },
  async saveImg(img, name, wrap) {
    try {
      const url = await this.shrink(img.getAttribute('src'));
      const cs = getComputedStyle(img);
      await this.add({ name, url, w: parseFloat(cs.width) || img.offsetWidth, h: parseFloat(cs.height) || img.offsetHeight, wrap });
      toast(`Saved “${name}”. Find it under Insert › Signature.`);
    } catch (e) { console.warn(e); toast('The signature couldn’t be saved.', { error: true }); }
  },
  /* ---------- managing ---------- */
  async manage() {
    await this.all();
    const box = h('div', { class: 'sig-list' });
    const render = () => {
      box.innerHTML = '';
      if (!this.list.length) { box.appendChild(h('p', { class: 'note' }, 'No signatures or stamps yet. Use Insert › Signature to add one.')); return; }
      for (const s of this.list) {
        const nm = input(s.name, { maxlength: '60', 'aria-label': 'Name' });
        nm.addEventListener('change', () => this.rename(s.id, nm.value.trim()));
        const del = h('button', { class: 'tb-btn', type: 'button', title: 'Delete', 'aria-label': `Delete ${s.name}`, html: icon('trash') });
        del.addEventListener('click', async () => {
          await this.remove(s.id);
          render();
          toast(`Deleted “${s.name}”.`, { action: { label: 'Undo', fn: async () => { await this.restore(s); render(); } } });
        });
        box.appendChild(h('div', { class: 'sig-row' }, h('span', { class: 'sig-thumb' }, h('img', { src: s.url, alt: '' })), nm, h('span', { class: 'note sig-kind' }, s.wrap === 'front' ? 'In front of text' : s.wrap === 'behind' ? 'Behind text' : 'In the line'), del));
      }
    };
    render();
    openDialog({ title: 'Signatures and Stamps', width: 540,
      body: h('div', null, box, h('p', { class: 'note' }, Store.cloud ? 'Kept privately with your Claude account, so they are there on any device. They are not part of any document until you insert one.' : 'Kept in this browser on this device. They are not part of any document until you insert one.')),
      buttons: [{ label: 'Done', primary: true }] });
  },
};
