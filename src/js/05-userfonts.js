/* ===================== Your fonts =====================
   A font file added once (say SutonnyOMJ.ttf from C:\Windows\Fonts) is kept in the
   person's own storage and loaded on every device, so pages, PDFs and the layout use
   the real font even where it isn't installed. */
// letters only: a space or Latin letter would differ between fonts even without Bangla
const FONT_SAMPLE_BN = 'আমিবাংলায়গানগাইকখগঘঙঅআইঈ';

/* family name, weight and style from a TrueType / OpenType file */
function fontFileInfo(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 12) return null;
  let base = 0;
  const tag = dv.getUint32(0);
  if (tag === 0x74746366) base = dv.getUint32(12); // 'ttcf': first face of a collection
  else if (tag !== 0x00010000 && tag !== 0x4F54544F && tag !== 0x74727565) return null; // not TTF / OTF
  const num = dv.getUint16(base + 4);
  const tables = {};
  for (let i = 0; i < num; i++) {
    const r = base + 12 + i * 16;
    const t = String.fromCharCode(dv.getUint8(r), dv.getUint8(r + 1), dv.getUint8(r + 2), dv.getUint8(r + 3));
    tables[t] = { off: dv.getUint32(r + 8), len: dv.getUint32(r + 12) };
  }
  let family = null, rank = 99;
  const nm = tables.name;
  if (nm) {
    const t = nm.off, count = dv.getUint16(t + 2), so = t + dv.getUint16(t + 4);
    for (let k = 0; k < count; k++) {
      const r = t + 6 + k * 12;
      const pid = dv.getUint16(r), lid = dv.getUint16(r + 4), nid = dv.getUint16(r + 6), len = dv.getUint16(r + 8), off = dv.getUint16(r + 10);
      if (nid !== 1 && nid !== 16) continue;
      let str = '';
      if (pid === 3 || pid === 0) for (let j = 0; j + 1 < len; j += 2) str += String.fromCharCode(dv.getUint16(so + off + j));
      else if (pid === 1) for (let j = 0; j < len; j++) str += String.fromCharCode(dv.getUint8(so + off + j));
      else continue;
      // Word looks fonts up by the legacy family name (nameID 1), in US English when present
      const rk = (nid === 1 ? 0 : 4) + (pid === 3 ? 0 : 2) + (lid === 0x409 || pid !== 3 ? 0 : 1);
      if (str.trim() && rk < rank) { family = str.trim(); rank = rk; }
    }
  }
  let weight = 400, italic = false;
  const os2 = tables['OS/2'];
  if (os2 && os2.len >= 64) { weight = dv.getUint16(os2.off + 4) || 400; italic = !!(dv.getUint16(os2.off + 62) & 1); }
  return { family, weight: Math.min(900, Math.max(100, Math.round(weight / 100) * 100)), italic };
}
function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
/* does the face draw Bangla letters itself (and not through a fallback)? */
function faceHasBangla(family) {
  try {
    const c = document.createElement('canvas').getContext('2d');
    for (const base of ['monospace', 'serif']) {
      c.font = `40px ${base}`; const w0 = c.measureText(FONT_SAMPLE_BN).width;
      c.font = `40px ${quoteFont(family)}, ${base}`; const w1 = c.measureText(FONT_SAMPLE_BN).width;
      if (Math.abs(w1 - w0) > 0.5) return true;
    }
    return false;
  } catch { return true; }
}

const UserFonts = {
  list: [],          // { id, family, weight, italic, size, name, bangla }
  faces: new Map(),  // id -> FontFace
  bytes: new Map(),  // id -> the font file
  PART: 180000,      // base64 characters per stored part (documents are capped at 256 KiB)
  async store() {
    await capsReady;
    if (Store.cloud) {
      const col = CloudStore.base().collection('fonts');
      return {
        async list() { const s = await col.get(); return s.docs.filter(d => d.exists).map(d => d.data()); },
        async load(meta) { const parts = await Promise.all(Array.from({ length: meta.parts }, (_, i) => col.doc(meta.id).collection('parts').doc(String(i)).get())); return b64ToBytes(parts.map(p => (p.exists ? p.data().d : '')).join('')); },
        async save(meta, bytes) {
          const b64 = bytesToB64(bytes);
          const n = Math.ceil(b64.length / UserFonts.PART);
          for (let i = 0; i < n; i++) await withRetry(() => col.doc(meta.id).collection('parts').doc(String(i)).set({ d: b64.slice(i * UserFonts.PART, (i + 1) * UserFonts.PART) }));
          await withRetry(() => col.doc(meta.id).set(Object.assign({}, meta, { parts: n })));
        },
        async remove(meta) { await col.doc(meta.id).delete(); for (let i = 0; i < (meta.parts || 0); i++) { try { await col.doc(meta.id).collection('parts').doc(String(i)).delete(); } catch { } } },
      };
    }
    const kv = (mode, fn) => LocalStore._tx('kv', mode, fn);
    return {
      async list() { try { return (await kv('readonly', os => os.get('fonts'))) || []; } catch { return []; } },
      async load(meta) { const b = await kv('readonly', os => os.get('font:' + meta.id)); return b ? new Uint8Array(b) : null; },
      async save(meta, bytes) { const all = (await this.list()).filter(m => m.id !== meta.id); await kv('readwrite', os => os.put(bytes.buffer.slice(0), 'font:' + meta.id)); all.push(meta); await kv('readwrite', os => os.put(all, 'fonts')); },
      async remove(meta) { const all = (await this.list()).filter(m => m.id !== meta.id); await kv('readwrite', os => os.delete('font:' + meta.id)); await kv('readwrite', os => os.put(all, 'fonts')); },
    };
  },
  async register(meta, bytes) {
    const ff = new FontFace(meta.family, bytes, { weight: String(meta.weight || 400), style: meta.italic ? 'italic' : 'normal' });
    await ff.load();
    document.fonts.add(ff);
    this.faces.set(meta.id, ff);
    this.bytes.set(meta.id, bytes);  // kept for embedding in PDFs
    meta.bangla = faceHasBangla(meta.family);
    let f = FONT_MAP[meta.family.toLowerCase()];
    if (!f) {
      f = { n: meta.family, alt: meta.bangla ? ['Noto Sans Bengali'] : ['Carlito'], g: null, gen: 'sans-serif', cat: meta.bangla ? 'Bangla' : 'Mine', user: true };
      FONTS.push(f);
      FONT_MAP[meta.family.toLowerCase()] = f;
    }
    f.user = true;
    _availCache.set(f.n, true);
    if (!this.list.some(m => m.id === meta.id)) this.list.push(meta);
    LineH.reset();
  },
  /* on start: load every saved font, then re-lay the pages with the real metrics */
  async loadAll() {
    try {
      const st = await this.store();
      const metas = await st.list();
      for (const meta of metas) {
        try { const bytes = await st.load(meta); if (bytes && bytes.length) await this.register(meta, bytes); }
        catch (e) { console.warn('font not loaded', meta.family, e); }
      }
      if (metas.length && S.doc) { applyDocSettings(); Layout.full(); UI.refresh(); }
    } catch (e) { console.warn('fonts unavailable', e); }
  },
  async addFiles(files, opts = {}) {
    const added = [];
    for (const file of Array.from(files)) {
      const b = busy('Adding ' + file.name + '…');
      try {
        if (file.size > 12 * 1024 * 1024) throw new Error('That font file is larger than 12 MB.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = fontFileInfo(bytes.buffer);
        if (!info) throw new Error('Only .ttf and .otf font files can be added. Windows keeps them in C:\\Windows\\Fonts.');
        const family = info.family || file.name.replace(/\.[^.]+$/, '').replace(/[-_ ]?(Regular|Normal|Book)$/i, '');
        const prev = this.list.find(m => m.family.toLowerCase() === family.toLowerCase() && m.weight === info.weight && !!m.italic === info.italic);
        const meta = { id: prev ? prev.id : uid('f'), family, weight: info.weight, italic: info.italic, size: bytes.length, name: file.name };
        b.set(0.4);
        await this.register(meta, bytes);
        b.set(0.6, 'Saving the font to your account…');
        const st = await this.store();
        const { bangla, ...stored } = meta;
        void bangla;
        await st.save(stored, bytes);
        if (S.doc) { applyDocSettings(); Layout.full(); UI.refresh(); }
        added.push(family);
        if (opts.quiet) continue;
        if (meta.bangla) toast(`Added ${family}. It works on all your devices.`, { ms: 9000, action: docBnFont().toLowerCase() === family.toLowerCase() ? null : { label: 'Use for Bangla text', fn: () => setDocBnFont(family, true) } });
        else toast(`Added ${family}. It has no Bangla Unicode letters, so it can’t show Bangla text. For Bijoy fonts such as SutonnyMJ, add SutonnyOMJ instead.`, { ms: 9000 });
      } catch (e) {
        console.error(e);
        const code = e && e.code;
        toast(code === 'quota_exceeded' ? 'There isn’t room in your storage for this font.' : (e && e.message ? e.message : 'That font couldn’t be added.'), { error: true, ms: 7000 });
      } finally { b.close(); }
    }
    return added;
  },
  /* fonts installed on this computer, read with the browser's Local Font Access when it is
     allowed here; otherwise the person picks the file */
  async addInstalled(names) {
    if (typeof window.queryLocalFonts === 'function') {
      try {
        const want = new Set(names.map(n => String(n).toLowerCase()));
        const found = (await window.queryLocalFonts()).filter(f => want.has(String(f.family).toLowerCase()));
        const files = [];
        for (const f of found) {
          const blob = await f.blob();
          // only the faces of the families asked for (not, say, a Condensed cousin)
          const info = fontFileInfo(await blob.arrayBuffer());
          if (info && info.family && !want.has(info.family.toLowerCase())) continue;
          files.push(new File([blob], (f.postscriptName || f.family) + '.ttf', { type: 'font/ttf' }));
        }
        if (files.length) {
          const added = Array.from(new Set(await this.addFiles(files, { quiet: true })));
          if (added.length) toast(`Added ${added.join(', ')} from this computer. PDFs now include ${added.length > 1 ? 'them' : 'it'} as real text.`, { ms: 9000, action: { label: 'Export PDF again', fn: () => Files.export('pdf') } });
          return;
        }
      } catch (e) { console.warn('installed fonts not readable here', e); }
      toast(`Choose the font file for ${names.join(', ')}. Windows keeps fonts in C:\\Windows\\Fonts.`, { ms: 12000, action: { label: 'Choose file', fn: () => this.pick() } });
      return;
    }
    this.pick();
  },
  pick() {
    const inp = h('input', { type: 'file', accept: '.ttf,.otf,.ttc,font/ttf,font/otf', multiple: true, style: { display: 'none' } });
    inp.addEventListener('change', () => { if (inp.files && inp.files.length) this.addFiles(inp.files); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  },
  async remove(id) {
    const meta = this.list.find(m => m.id === id);
    if (!meta) return;
    const ff = this.faces.get(id);
    if (ff) { document.fonts.delete(ff); this.faces.delete(id); }
    this.bytes.delete(id);
    this.list = this.list.filter(m => m.id !== id);
    LineH.reset();
    if (!this.list.some(m => m.family === meta.family)) { const f = FONT_MAP[meta.family.toLowerCase()]; if (f) { f.user = false; _availCache.delete(f.n); } }
    try { const st = await this.store(); await st.remove(meta); } catch (e) { console.warn(e); }
    if (S.doc) { Layout.full(); UI.refresh(); }
    toast(`Removed ${meta.family}.`);
  },
};

/* The document's Bangla font (and, when asked, the default for new documents) */
function setDocBnFont(name, asDefault) {
  if (!S.doc) return;
  change(() => { S.doc.bnFont = name; applyDocSettings(); }, { full: true });
  if (asDefault) { Prefs.bnFont = name; savePrefs(); }
  ensureFont(name);
  Layout.full();
  UI.refresh();
  if (!fontAvailable(name)) toast(`${name} isn’t on this device, so Bangla text uses a look-alike for now. Add the font file once and it works everywhere.`, { ms: 8000, action: { label: 'Add font file', fn: () => UserFonts.pick() } });
  else toast(`Bangla text now uses ${name}${asDefault ? ', here and in new documents' : ''}.`);
}
