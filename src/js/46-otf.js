/* ===================== OpenType fonts =====================
   Reads TrueType / OpenType files: metrics, the character map, the layout tables used for
   shaping (GSUB, GPOS, GDEF, kern) and the glyph data, and writes the glyph subsets that
   PDFs embed. Shaping itself is in 47-shape.js. */
const OT_TAG = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
const OT_NOT = -1;

class OTFont {
  constructor(bytes, opts = {}) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.u8 = u8;
    const dv = this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let base = 0;
    const sig = dv.getUint32(0);
    if (sig === 0x74746366) base = dv.getUint32(12 + 4 * Math.min(dv.getUint32(8) - 1, opts.index || 0)); // 'ttcf'
    else if (sig !== 0x00010000 && sig !== 0x4F54544F && sig !== 0x74727565) throw new Error('not a TrueType or OpenType font');
    this.t = {};
    const num = dv.getUint16(base + 4);
    for (let i = 0; i < num; i++) { const r = base + 12 + i * 16; this.t[OT_TAG(dv, r)] = { off: dv.getUint32(r + 8), len: dv.getUint32(r + 12) }; }
    if (!this.t.head || !this.t.hhea || !this.t.hmtx || !this.t.maxp || !this.t.cmap) throw new Error('font is missing required tables');
    this.cff = !!(this.t['CFF '] || this.t.CFF2);
    const hd = this.t.head.off;
    this.upem = dv.getUint16(hd + 18) || 1000;
    this.bbox = [dv.getInt16(hd + 36), dv.getInt16(hd + 38), dv.getInt16(hd + 40), dv.getInt16(hd + 42)];
    this.macStyle = dv.getUint16(hd + 44);
    this.locFmt = dv.getInt16(hd + 50);
    const hh = this.t.hhea.off;
    this.hAsc = dv.getInt16(hh + 4); this.hDesc = dv.getInt16(hh + 6); this.hGap = dv.getInt16(hh + 8);
    this.nHM = dv.getUint16(hh + 34);
    this.numGlyphs = dv.getUint16(this.t.maxp.off + 4);
    const os = this.t['OS/2'];
    this.weight = 400; this.fsType = 0; this.fsSel = 0;
    this.typoAsc = this.hAsc; this.typoDesc = this.hDesc; this.typoGap = this.hGap; this.winAsc = this.hAsc; this.winDesc = -this.hDesc;
    this.capHeight = Math.round(this.hAsc * 0.7); this.xHeight = Math.round(this.hAsc * 0.5);
    if (os && os.len >= 78) {
      const o = os.off;
      this.weight = dv.getUint16(o + 4) || 400;
      this.fsType = dv.getUint16(o + 8);
      this.fsSel = dv.getUint16(o + 62);
      this.typoAsc = dv.getInt16(o + 68); this.typoDesc = dv.getInt16(o + 70); this.typoGap = dv.getInt16(o + 72);
      this.winAsc = dv.getUint16(o + 74); this.winDesc = dv.getUint16(o + 76);
      if (os.len >= 90 && dv.getUint16(o) >= 2) { this.xHeight = dv.getInt16(o + 86) || this.xHeight; this.capHeight = dv.getInt16(o + 88) || this.capHeight; }
    }
    const pt = this.t.post;
    this.italicAngle = pt ? dv.getInt32(pt.off + 4) / 65536 : 0;
    this.fixedPitch = pt ? dv.getUint32(pt.off + 12) !== 0 : false;
    this.ulPos = pt ? dv.getInt16(pt.off + 8) : -100; this.ulThick = pt ? dv.getInt16(pt.off + 10) : 50;
    this.names = this.readNames();
    this.psName = (this.names[6] || this.names[4] || this.names[1] || 'Font').replace(/[^\x21-\x7E]|[()<>[\]{}/%#]/g, '');
    this.initCmap();
    this.gdef = this.readGDEF();
    this.layouts = {};
    this._cmapCache = new Map();
  }
  u16(o) { return this.dv.getUint16(o); }
  s16(o) { return this.dv.getInt16(o); }
  u32(o) { return this.dv.getUint32(o); }

  /* --- names --- */
  readNames() {
    const out = {}, t = this.t.name;
    if (!t) return out;
    const dv = this.dv, o = t.off, count = dv.getUint16(o + 2), so = o + dv.getUint16(o + 4);
    const rank = {};
    for (let k = 0; k < count; k++) {
      const r = o + 6 + k * 12;
      const pid = dv.getUint16(r), eid = dv.getUint16(r + 2), lid = dv.getUint16(r + 4), nid = dv.getUint16(r + 6), len = dv.getUint16(r + 8), off = dv.getUint16(r + 10);
      if (nid > 25) continue;
      let s = '';
      if (pid === 3 || pid === 0) for (let j = 0; j + 1 < len; j += 2) s += String.fromCharCode(dv.getUint16(so + off + j));
      else if (pid === 1 && eid === 0) for (let j = 0; j < len; j++) s += String.fromCharCode(dv.getUint8(so + off + j));
      else continue;
      const rk = (pid === 3 ? 0 : 2) + (lid === 0x409 || pid !== 3 ? 0 : 1);
      if (s && (rank[nid] == null || rk < rank[nid])) { out[nid] = s; rank[nid] = rk; }
    }
    return out;
  }

  /* --- metrics --- */
  advance(g) {
    const n = this.nHM;
    if (!n) return 0;
    return this.dv.getUint16(this.t.hmtx.off + 4 * (g < n ? g : n - 1));
  }
  /* ascent and descent the way Chromium lays lines out (positive descent) */
  lineMetrics() {
    if (this.fsSel & 128) return { asc: this.typoAsc, desc: -this.typoDesc, gap: this.typoGap };
    if (this.hAsc || this.hDesc) return { asc: this.hAsc, desc: -this.hDesc, gap: this.hGap };
    return { asc: this.winAsc, desc: this.winDesc, gap: 0 };
  }
  get embeddable() { return (this.fsType & 0x000F) !== 0x0002 && !(this.fsType & 0x0200); }

  /* --- character map --- */
  initCmap() {
    const dv = this.dv, o = this.t.cmap.off, n = dv.getUint16(o + 2);
    const subs = [];
    for (let i = 0; i < n; i++) {
      const r = o + 4 + i * 8;
      const pid = dv.getUint16(r), eid = dv.getUint16(r + 2), off = o + dv.getUint32(r + 4);
      subs.push({ pid, eid, off, fmt: dv.getUint16(off) });
    }
    const pick = (test) => subs.find(test);
    const s = pick(x => x.pid === 3 && x.eid === 10 && x.fmt === 12) || pick(x => x.pid === 0 && x.fmt === 12) ||
      pick(x => x.pid === 3 && x.eid === 1 && x.fmt === 4) || pick(x => x.pid === 0 && x.fmt === 4) ||
      pick(x => x.pid === 3 && x.eid === 0 && x.fmt === 4) || pick(x => x.pid === 3 && x.eid === 1) ||
      pick(x => x.pid === 0) || pick(x => x.pid === 1 && x.eid === 0 && (x.fmt === 0 || x.fmt === 6)) || subs[0];
    this.cm = s || null;
    this.symbol = !!(s && s.pid === 3 && s.eid === 0);
  }
  rawGlyph(cp) {
    const s = this.cm;
    if (!s) return 0;
    const dv = this.dv, o = s.off;
    switch (s.fmt) {
      case 4: {
        if (cp > 0xFFFF) return 0;
        const segX2 = dv.getUint16(o + 6);
        const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ros = deltas + segX2;
        let lo = 0, hi = segX2 / 2 - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const end = dv.getUint16(ends + mid * 2);
          if (cp > end) { lo = mid + 1; continue; }
          const start = dv.getUint16(starts + mid * 2);
          if (cp < start) { hi = mid - 1; continue; }
          const ro = dv.getUint16(ros + mid * 2), delta = dv.getUint16(deltas + mid * 2);
          if (!ro) return (cp + delta) & 0xFFFF;
          const ga = ros + mid * 2 + ro + (cp - start) * 2;
          if (ga + 2 > dv.byteLength) return 0;
          const g = dv.getUint16(ga);
          return g ? (g + delta) & 0xFFFF : 0;
        }
        return 0;
      }
      case 12: case 13: {
        const n = dv.getUint32(o + 12);
        let lo = 0, hi = n - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1, r = o + 16 + mid * 12;
          const a = dv.getUint32(r), b = dv.getUint32(r + 4);
          if (cp < a) hi = mid - 1; else if (cp > b) lo = mid + 1;
          else return s.fmt === 12 ? dv.getUint32(r + 8) + (cp - a) : dv.getUint32(r + 8);
        }
        return 0;
      }
      case 6: { const first = dv.getUint16(o + 6), cnt = dv.getUint16(o + 8); return cp >= first && cp < first + cnt ? dv.getUint16(o + 10 + (cp - first) * 2) : 0; }
      case 0: return cp < 256 ? dv.getUint8(o + 6 + cp) : 0;
      case 10: { const first = dv.getUint32(o + 12), cnt = dv.getUint32(o + 16); return cp >= first && cp < first + cnt ? dv.getUint16(o + 20 + (cp - first) * 2) : 0; }
      default: return 0;
    }
  }
  /* the glyph for a code point; symbol fonts keep their letters at U+F000 */
  glyph(cp) {
    let g = this._cmapCache.get(cp);
    if (g !== undefined) return g;
    g = this.rawGlyph(cp);
    if (!g && this.symbol && cp < 0x100) g = this.rawGlyph(0xF000 + cp);
    if (g >= this.numGlyphs) g = 0;
    this._cmapCache.set(cp, g);
    return g;
  }
  has(cp) { return this.glyph(cp) !== 0; }
  /* every mapped code point (for the ToUnicode fallback) */
  forEachMapping(fn) {
    const s = this.cm;
    if (!s) return;
    const dv = this.dv, o = s.off;
    if (s.fmt === 4) {
      const segX2 = dv.getUint16(o + 6), ends = o + 14, starts = ends + segX2 + 2;
      for (let i = 0; i < segX2 / 2; i++) { const a = dv.getUint16(starts + i * 2), b = dv.getUint16(ends + i * 2); for (let c = a; c <= b && c !== 0xFFFF; c++) { const g = this.glyph(c); if (g) fn(c, g); } }
    } else if (s.fmt === 12) {
      const n = dv.getUint32(o + 12);
      for (let i = 0; i < n; i++) { const r = o + 16 + i * 12, a = dv.getUint32(r), b = Math.min(dv.getUint32(r + 4), a + 0xFFFF); for (let c = a; c <= b; c++) fn(c, dv.getUint32(r + 8) + (c - a)); }
    }
  }

  /* --- coverage & class definitions --- */
  coverage(off) {
    const dv = this.dv, fmt = dv.getUint16(off), m = new Map();
    if (fmt === 1) { const n = dv.getUint16(off + 2); for (let i = 0; i < n; i++) m.set(dv.getUint16(off + 4 + i * 2), i); }
    else if (fmt === 2) {
      const n = dv.getUint16(off + 2);
      for (let i = 0; i < n; i++) { const r = off + 4 + i * 6, a = dv.getUint16(r), b = dv.getUint16(r + 2), si = dv.getUint16(r + 4); for (let g = a; g <= b; g++) m.set(g, si + g - a); }
    }
    return m;
  }
  classDef(off) {
    const dv = this.dv, m = new Map();
    if (!off) return m;
    const fmt = dv.getUint16(off);
    if (fmt === 1) { const start = dv.getUint16(off + 2), n = dv.getUint16(off + 4); for (let i = 0; i < n; i++) { const c = dv.getUint16(off + 6 + i * 2); if (c) m.set(start + i, c); } }
    else if (fmt === 2) {
      const n = dv.getUint16(off + 2);
      for (let i = 0; i < n; i++) { const r = off + 4 + i * 6, a = dv.getUint16(r), b = dv.getUint16(r + 2), c = dv.getUint16(r + 4); if (c) for (let g = a; g <= b; g++) m.set(g, c); }
    }
    return m;
  }

  /* --- GDEF: glyph classes, mark attachment classes, mark sets --- */
  readGDEF() {
    const t = this.t.GDEF;
    const out = { classes: null, markAttach: null, markSets: [] };
    if (!t) return out;
    const dv = this.dv, o = t.off;
    const minor = dv.getUint16(o + 2);
    const gc = dv.getUint16(o + 4), mac = dv.getUint16(o + 10);
    if (gc) out.classes = this.classDef(o + gc);
    if (mac) out.markAttach = this.classDef(o + mac);
    if (minor >= 2 && t.len >= 14) {
      const ms = dv.getUint16(o + 12);
      if (ms) { const so = o + ms, n = dv.getUint16(so + 2); for (let i = 0; i < n; i++) out.markSets.push(this.coverage(so + dv.getUint32(so + 4 + i * 4))); }
    }
    return out;
  }

  /* --- GSUB / GPOS: scripts, features, lookups --- */
  layout(tag) {
    if (tag in this.layouts) return this.layouts[tag];
    const t = this.t[tag];
    let L = null;
    if (t) {
      const dv = this.dv, o = t.off;
      const sl = o + dv.getUint16(o + 4), fl = o + dv.getUint16(o + 6), ll = o + dv.getUint16(o + 8);
      const scripts = {};
      const langSys = off => { const req = dv.getUint16(off + 2), n = dv.getUint16(off + 4), feats = []; for (let i = 0; i < n; i++) feats.push(dv.getUint16(off + 6 + i * 2)); return { req: req === 0xFFFF ? -1 : req, feats }; };
      for (let i = 0, n = dv.getUint16(sl); i < n; i++) {
        const r = sl + 2 + i * 6, so = sl + dv.getUint16(r + 4);
        const def = dv.getUint16(so), langs = {};
        for (let k = 0, m = dv.getUint16(so + 2); k < m; k++) { const lr = so + 4 + k * 6; langs[OT_TAG(dv, lr)] = langSys(so + dv.getUint16(lr + 4)); }
        scripts[OT_TAG(dv, r)] = { dflt: def ? langSys(so + def) : null, langs };
      }
      const features = [];
      for (let i = 0, n = dv.getUint16(fl); i < n; i++) {
        const r = fl + 2 + i * 6, fo = fl + dv.getUint16(r + 4), lookups = [];
        for (let k = 0, m = dv.getUint16(fo + 2); k < m; k++) lookups.push(dv.getUint16(fo + 4 + k * 2));
        features.push({ tag: OT_TAG(dv, r), lookups });
      }
      const lookups = [];
      for (let i = 0, n = dv.getUint16(ll); i < n; i++) {
        const lo = ll + dv.getUint16(ll + 2 + i * 2);
        const type = dv.getUint16(lo), flag = dv.getUint16(lo + 2), cnt = dv.getUint16(lo + 4);
        const subs = [];
        for (let k = 0; k < cnt; k++) subs.push(lo + dv.getUint16(lo + 6 + k * 2));
        const markSet = flag & 0x10 ? dv.getUint16(lo + 6 + cnt * 2) : 0;
        lookups.push({ type, flag, subs, markSet, parsed: null, idx: i });
      }
      L = { scripts, features, lookups, gpos: tag === 'GPOS' };
    }
    this.layouts[tag] = L;
    return L;
  }
  /* parse a lookup's subtables once, resolving Extension subtables */
  subtables(L, lk) {
    if (lk.parsed) return lk.parsed;
    const out = [];
    const ext = L.gpos ? 9 : 7;
    for (let off of lk.subs) {
      let type = lk.type;
      if (type === ext) { type = this.u16(off + 2); off = off + this.u32(off + 4); }
      try { const st = L.gpos ? this.parseGPOS(type, off) : this.parseGSUB(type, off); if (st) out.push(st); }
      catch (e) { console.warn('layout subtable skipped', e); }
    }
    lk.parsed = out;
    return out;
  }
  lookupRecords(off, n) { const r = []; for (let i = 0; i < n; i++) r.push([this.u16(off + i * 4), this.u16(off + i * 4 + 2)]); return r; }
  parseContext(type, off) {
    const dv = this.dv, fmt = dv.getUint16(off);
    if (type === 5 || type === 7) {
      if (fmt === 1) {
        const cov = this.coverage(off + dv.getUint16(off + 2));
        const sets = [];
        for (let i = 0, n = dv.getUint16(off + 4); i < n; i++) {
          const so = dv.getUint16(off + 6 + i * 2), rules = [];
          if (so) for (let k = 0, m = dv.getUint16(off + so); k < m; k++) {
            const ro = off + so + dv.getUint16(off + so + 2 + k * 2);
            const gc = dv.getUint16(ro), lc = dv.getUint16(ro + 2), input = [];
            for (let j = 1; j < gc; j++) input.push(dv.getUint16(ro + 4 + (j - 1) * 2));
            rules.push({ input, back: [], ahead: [], recs: this.lookupRecords(ro + 4 + (gc - 1) * 2, lc) });
          }
          sets.push(rules);
        }
        return { k: 'ctx', fmt: 1, cov, sets };
      }
      if (fmt === 2) {
        const cov = this.coverage(off + dv.getUint16(off + 2)), cd = this.classDef(off + dv.getUint16(off + 4));
        const sets = [];
        for (let i = 0, n = dv.getUint16(off + 6); i < n; i++) {
          const so = dv.getUint16(off + 8 + i * 2), rules = [];
          if (so) for (let k = 0, m = dv.getUint16(off + so); k < m; k++) {
            const ro = off + so + dv.getUint16(off + so + 2 + k * 2);
            const gc = dv.getUint16(ro), lc = dv.getUint16(ro + 2), input = [];
            for (let j = 1; j < gc; j++) input.push(dv.getUint16(ro + 4 + (j - 1) * 2));
            rules.push({ input, back: [], ahead: [], recs: this.lookupRecords(ro + 4 + (gc - 1) * 2, lc) });
          }
          sets.push(rules);
        }
        return { k: 'ctx', fmt: 2, cov, cd, bcd: cd, acd: cd, sets };
      }
      if (fmt === 3) {
        const gc = dv.getUint16(off + 2), lc = dv.getUint16(off + 4), covs = [];
        for (let j = 0; j < gc; j++) covs.push(this.coverage(off + dv.getUint16(off + 6 + j * 2)));
        return { k: 'ctx', fmt: 3, cov: covs[0], input: covs.slice(1), back: [], ahead: [], recs: this.lookupRecords(off + 6 + gc * 2, lc) };
      }
      return null;
    }
    // chained
    if (fmt === 1) {
      const cov = this.coverage(off + dv.getUint16(off + 2));
      const sets = [];
      for (let i = 0, n = dv.getUint16(off + 4); i < n; i++) {
        const so = dv.getUint16(off + 6 + i * 2), rules = [];
        if (so) for (let k = 0, m = dv.getUint16(off + so); k < m; k++) {
          let p = off + so + dv.getUint16(off + so + 2 + k * 2);
          const bc = dv.getUint16(p), back = []; p += 2; for (let j = 0; j < bc; j++, p += 2) back.push(dv.getUint16(p));
          const ic = dv.getUint16(p), input = []; p += 2; for (let j = 1; j < ic; j++, p += 2) input.push(dv.getUint16(p));
          const ac = dv.getUint16(p), ahead = []; p += 2; for (let j = 0; j < ac; j++, p += 2) ahead.push(dv.getUint16(p));
          const lc = dv.getUint16(p); p += 2;
          rules.push({ back, input, ahead, recs: this.lookupRecords(p, lc) });
        }
        sets.push(rules);
      }
      return { k: 'ctx', fmt: 1, cov, sets };
    }
    if (fmt === 2) {
      const cov = this.coverage(off + dv.getUint16(off + 2));
      const bcd = this.classDef(dv.getUint16(off + 4) ? off + dv.getUint16(off + 4) : 0), cd = this.classDef(off + dv.getUint16(off + 6)), acd = this.classDef(dv.getUint16(off + 8) ? off + dv.getUint16(off + 8) : 0);
      const sets = [];
      for (let i = 0, n = dv.getUint16(off + 10); i < n; i++) {
        const so = dv.getUint16(off + 12 + i * 2), rules = [];
        if (so) for (let k = 0, m = dv.getUint16(off + so); k < m; k++) {
          let p = off + so + dv.getUint16(off + so + 2 + k * 2);
          const bc = dv.getUint16(p), back = []; p += 2; for (let j = 0; j < bc; j++, p += 2) back.push(dv.getUint16(p));
          const ic = dv.getUint16(p), input = []; p += 2; for (let j = 1; j < ic; j++, p += 2) input.push(dv.getUint16(p));
          const ac = dv.getUint16(p), ahead = []; p += 2; for (let j = 0; j < ac; j++, p += 2) ahead.push(dv.getUint16(p));
          const lc = dv.getUint16(p); p += 2;
          rules.push({ back, input, ahead, recs: this.lookupRecords(p, lc) });
        }
        sets.push(rules);
      }
      return { k: 'ctx', fmt: 2, cov, cd, bcd, acd, sets };
    }
    if (fmt === 3) {
      let p = off + 2;
      const bc = dv.getUint16(p), back = []; p += 2; for (let j = 0; j < bc; j++, p += 2) back.push(this.coverage(off + dv.getUint16(p)));
      const ic = dv.getUint16(p), inp = []; p += 2; for (let j = 0; j < ic; j++, p += 2) inp.push(this.coverage(off + dv.getUint16(p)));
      const ac = dv.getUint16(p), ahead = []; p += 2; for (let j = 0; j < ac; j++, p += 2) ahead.push(this.coverage(off + dv.getUint16(p)));
      const lc = dv.getUint16(p); p += 2;
      if (!ic) return null;
      return { k: 'ctx', fmt: 3, cov: inp[0], input: inp.slice(1), back, ahead, recs: this.lookupRecords(p, lc) };
    }
    return null;
  }
  parseGSUB(type, off) {
    const dv = this.dv, fmt = dv.getUint16(off);
    switch (type) {
      case 1: {
        const cov = this.coverage(off + dv.getUint16(off + 2));
        if (fmt === 1) return { k: 'single', cov, delta: dv.getInt16(off + 4) };
        const subst = []; for (let i = 0, n = dv.getUint16(off + 4); i < n; i++) subst.push(dv.getUint16(off + 6 + i * 2));
        return { k: 'single', cov, subst };
      }
      case 2: case 3: {
        const cov = this.coverage(off + dv.getUint16(off + 2)), seqs = [];
        for (let i = 0, n = dv.getUint16(off + 4); i < n; i++) { const so = off + dv.getUint16(off + 6 + i * 2), g = []; for (let k = 0, m = dv.getUint16(so); k < m; k++) g.push(dv.getUint16(so + 2 + k * 2)); seqs.push(g); }
        return { k: type === 2 ? 'multiple' : 'alternate', cov, seqs };
      }
      case 4: {
        const cov = this.coverage(off + dv.getUint16(off + 2)), sets = [];
        for (let i = 0, n = dv.getUint16(off + 4); i < n; i++) {
          const so = off + dv.getUint16(off + 6 + i * 2), ligs = [];
          for (let k = 0, m = dv.getUint16(so); k < m; k++) {
            const lo = so + dv.getUint16(so + 2 + k * 2), cc = dv.getUint16(lo + 2), comps = [];
            for (let j = 1; j < cc; j++) comps.push(dv.getUint16(lo + 4 + (j - 1) * 2));
            ligs.push({ g: dv.getUint16(lo), comps });
          }
          sets.push(ligs);
        }
        return { k: 'ligature', cov, sets };
      }
      case 5: case 6: return this.parseContext(type, off);
      case 8: {
        const cov = this.coverage(off + dv.getUint16(off + 2));
        let p = off + 4;
        const bc = dv.getUint16(p), back = []; p += 2; for (let j = 0; j < bc; j++, p += 2) back.push(this.coverage(off + dv.getUint16(p)));
        const ac = dv.getUint16(p), ahead = []; p += 2; for (let j = 0; j < ac; j++, p += 2) ahead.push(this.coverage(off + dv.getUint16(p)));
        const gc = dv.getUint16(p), subst = []; p += 2; for (let j = 0; j < gc; j++, p += 2) subst.push(dv.getUint16(p));
        return { k: 'reverse', cov, back, ahead, subst };
      }
    }
    return null;
  }
  valueRecord(off, fmt) {
    const v = { xp: 0, yp: 0, xa: 0, ya: 0 };
    let p = off;
    if (fmt & 1) { v.xp = this.s16(p); p += 2; }
    if (fmt & 2) { v.yp = this.s16(p); p += 2; }
    if (fmt & 4) { v.xa = this.s16(p); p += 2; }
    if (fmt & 8) { v.ya = this.s16(p); p += 2; }
    return v;
  }
  anchor(off) { return off ? [this.s16(off + 2), this.s16(off + 4)] : null; }
  markArray(off) {
    const out = []; for (let i = 0, n = this.u16(off); i < n; i++) { const r = off + 2 + i * 4; out.push({ cls: this.u16(r), a: this.anchor(off + this.u16(r + 2)) }); }
    return out;
  }
  parseGPOS(type, off) {
    const dv = this.dv, fmt = dv.getUint16(off);
    const vsize = f => { let n = 0; for (let b = f & 0xFF; b; b >>= 1) n += b & 1; return n * 2; };
    switch (type) {
      case 1: {
        const cov = this.coverage(off + dv.getUint16(off + 2)), vf = dv.getUint16(off + 4);
        if (fmt === 1) return { k: 'single', cov, v: this.valueRecord(off + 6, vf) };
        const vs = []; for (let i = 0, n = dv.getUint16(off + 6); i < n; i++) vs.push(this.valueRecord(off + 8 + i * vsize(vf), vf));
        return { k: 'single', cov, vs };
      }
      case 2: {
        const cov = this.coverage(off + dv.getUint16(off + 2)), vf1 = dv.getUint16(off + 4), vf2 = dv.getUint16(off + 6);
        const s1 = vsize(vf1), s2 = vsize(vf2);
        if (fmt === 1) {
          const sets = [];
          for (let i = 0, n = dv.getUint16(off + 8); i < n; i++) {
            const so = off + dv.getUint16(off + 10 + i * 2), m = new Map();
            for (let k = 0, c = dv.getUint16(so); k < c; k++) { const r = so + 2 + k * (2 + s1 + s2); m.set(dv.getUint16(r), [vf1 ? this.valueRecord(r + 2, vf1) : null, vf2 ? this.valueRecord(r + 2 + s1, vf2) : null]); }
            sets.push(m);
          }
          return { k: 'pair', fmt: 1, cov, sets, vf2 };
        }
        const cd1 = this.classDef(off + dv.getUint16(off + 8)), cd2 = this.classDef(off + dv.getUint16(off + 10));
        const c1 = dv.getUint16(off + 12), c2 = dv.getUint16(off + 14);
        return { k: 'pair', fmt: 2, cov, cd1, cd2, c1, c2, base: off + 16, s1, s2, vf1, vf2, cache: new Map() };
      }
      case 3: {
        const cov = this.coverage(off + dv.getUint16(off + 2)), recs = [];
        for (let i = 0, n = dv.getUint16(off + 4); i < n; i++) { const r = off + 6 + i * 4, e = dv.getUint16(r), x = dv.getUint16(r + 2); recs.push([e ? this.anchor(off + e) : null, x ? this.anchor(off + x) : null]); }
        return { k: 'cursive', cov, recs };
      }
      case 4: case 6: {
        const mcov = this.coverage(off + dv.getUint16(off + 2)), bcov = this.coverage(off + dv.getUint16(off + 4));
        const nc = dv.getUint16(off + 6), marks = this.markArray(off + dv.getUint16(off + 8));
        const ba = off + dv.getUint16(off + 10), bases = [];
        for (let i = 0, n = dv.getUint16(ba); i < n; i++) { const row = []; for (let c = 0; c < nc; c++) { const ao = dv.getUint16(ba + 2 + (i * nc + c) * 2); row.push(ao ? this.anchor(ba + ao) : null); } bases.push(row); }
        return { k: type === 4 ? 'markBase' : 'markMark', mcov, bcov, nc, marks, bases };
      }
      case 5: {
        const mcov = this.coverage(off + dv.getUint16(off + 2)), lcov = this.coverage(off + dv.getUint16(off + 4));
        const nc = dv.getUint16(off + 6), marks = this.markArray(off + dv.getUint16(off + 8));
        const la = off + dv.getUint16(off + 10), ligs = [];
        for (let i = 0, n = dv.getUint16(la); i < n; i++) {
          const lo = la + dv.getUint16(la + 2 + i * 2), comps = [];
          for (let k = 0, cc = dv.getUint16(lo); k < cc; k++) { const row = []; for (let c = 0; c < nc; c++) { const ao = dv.getUint16(lo + 2 + (k * nc + c) * 2); row.push(ao ? this.anchor(lo + ao) : null); } comps.push(row); }
          ligs.push(comps);
        }
        return { k: 'markLig', mcov, lcov, nc, marks, ligs };
      }
      case 7: case 8: return this.parseContext(type === 7 ? 5 : 6, off);
    }
    return null;
  }
  pairClassValue(st, c1, c2) {
    const key = c1 * 65536 + c2;
    let v = st.cache.get(key);
    if (v === undefined) {
      if (c1 >= st.c1 || c2 >= st.c2) v = null;
      else { const r = st.base + (c1 * st.c2 + c2) * (st.s1 + st.s2); v = [st.vf1 ? this.valueRecord(r, st.vf1) : null, st.vf2 ? this.valueRecord(r + st.s1, st.vf2) : null]; }
      st.cache.set(key, v);
    }
    return v;
  }
  /* legacy 'kern' table, format 0 subtables (used when GPOS has no kerning) */
  kernTable() {
    if (this._kern !== undefined) return this._kern;
    const t = this.t.kern;
    let m = null;
    if (t) {
      const dv = this.dv, o = t.off, ver = dv.getUint16(o);
      if (ver === 0) {
        m = new Map();
        let p = o + 4;
        for (let i = 0, n = dv.getUint16(o + 2); i < n; i++) {
          const len = dv.getUint16(p + 2), cov = dv.getUint16(p + 4);
          if ((cov >> 8) === 0 && (cov & 1) && !(cov & 4)) {
            const np = dv.getUint16(p + 6);
            for (let k = 0; k < np; k++) { const r = p + 14 + k * 6; m.set(dv.getUint16(r) * 65536 + dv.getUint16(r + 2), dv.getInt16(r + 4)); }
          }
          p += len;
        }
      }
    }
    this._kern = m;
    return m;
  }

  /* --- glyph data (TrueType outlines) --- */
  glyphRange(g) {
    const l = this.t.loca, gl = this.t.glyf;
    if (!l || !gl || g >= this.numGlyphs) return null;
    let a, b;
    if (this.locFmt) { a = this.u32(l.off + g * 4); b = this.u32(l.off + g * 4 + 4); }
    else { a = this.u16(l.off + g * 2) * 2; b = this.u16(l.off + g * 2 + 2) * 2; }
    if (b < a || gl.off + b > this.u8.length) return null;
    return [gl.off + a, gl.off + b];
  }
  /* components a composite glyph is built from */
  components(g) {
    const r = this.glyphRange(g);
    if (!r || r[1] - r[0] < 10 || this.s16(r[0]) >= 0) return [];
    const out = [];
    let p = r[0] + 10, flags;
    do {
      flags = this.u16(p);
      out.push(this.u16(p + 2));
      p += 4 + (flags & 1 ? 4 : 2);
      if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
    } while (flags & 0x20 && p < r[1]);
    return out;
  }
  /* outline as a list of path commands in font units (for tests and previews) */
  outline(g, depth = 0) {
    const r = this.glyphRange(g);
    if (!r || r[1] <= r[0]) return [];
    const dv = this.dv;
    const nc = dv.getInt16(r[0]);
    if (nc < 0) {
      if (depth > 8) return [];
      const out = [];
      let p = r[0] + 10, flags;
      do {
        flags = dv.getUint16(p);
        const gi = dv.getUint16(p + 2);
        p += 4;
        let dx, dy;
        if (flags & 1) { dx = flags & 2 ? dv.getInt16(p) : 0; dy = flags & 2 ? dv.getInt16(p + 2) : 0; p += 4; }
        else { dx = flags & 2 ? dv.getInt8(p) : 0; dy = flags & 2 ? dv.getInt8(p + 1) : 0; p += 2; }
        let a = 1, b = 0, c = 0, d = 1;
        if (flags & 8) { a = d = dv.getInt16(p) / 16384; p += 2; }
        else if (flags & 0x40) { a = dv.getInt16(p) / 16384; d = dv.getInt16(p + 2) / 16384; p += 4; }
        else if (flags & 0x80) { a = dv.getInt16(p) / 16384; b = dv.getInt16(p + 2) / 16384; c = dv.getInt16(p + 4) / 16384; d = dv.getInt16(p + 6) / 16384; p += 8; }
        for (const cmd of this.outline(gi, depth + 1)) {
          const t = cmd.slice();
          for (let k = 1; k < t.length; k += 2) { const x = t[k], y = t[k + 1]; t[k] = a * x + c * y + dx; t[k + 1] = b * x + d * y + dy; }
          out.push(t);
        }
      } while (flags & 0x20);
      return out;
    }
    let p = r[0] + 10;
    const ends = [];
    for (let i = 0; i < nc; i++, p += 2) ends.push(dv.getUint16(p));
    const np = nc ? ends[nc - 1] + 1 : 0;
    p += 2 + dv.getUint16(p);
    const fl = new Uint8Array(np);
    for (let i = 0; i < np;) { const f = dv.getUint8(p++); fl[i++] = f; if (f & 8) { let rep = dv.getUint8(p++); while (rep-- > 0 && i < np) fl[i++] = f; } }
    const xs = new Int32Array(np), ys = new Int32Array(np);
    let v = 0;
    for (let i = 0; i < np; i++) { const f = fl[i]; if (f & 2) { const d = dv.getUint8(p++); v += f & 16 ? d : -d; } else if (!(f & 16)) { v += dv.getInt16(p); p += 2; } xs[i] = v; }
    v = 0;
    for (let i = 0; i < np; i++) { const f = fl[i]; if (f & 4) { const d = dv.getUint8(p++); v += f & 32 ? d : -d; } else if (!(f & 32)) { v += dv.getInt16(p); p += 2; } ys[i] = v; }
    const out = [];
    let s = 0;
    for (let ci = 0; ci < nc; ci++) {
      const e = ends[ci], n = e - s + 1;
      if (n <= 0) { s = e + 1; continue; }
      const on = i => fl[s + ((i % n) + n) % n] & 1, X = i => xs[s + ((i % n) + n) % n], Y = i => ys[s + ((i % n) + n) % n];
      let first = 0;
      while (first < n && !on(first)) first++;
      let sx, sy;
      if (first === n) { sx = (X(0) + X(1)) / 2; sy = (Y(0) + Y(1)) / 2; first = 0; out.push(['M', sx, sy]); }
      else { sx = X(first); sy = Y(first); out.push(['M', sx, sy]); }
      for (let k = 1; k <= n; k++) {
        const i = first + k;
        if (on(i)) { out.push(['L', X(i), Y(i)]); continue; }
        const nx = on(i + 1) ? X(i + 1) : (X(i) + X(i + 1)) / 2, ny = on(i + 1) ? Y(i + 1) : (Y(i) + Y(i + 1)) / 2;
        out.push(['Q', X(i), Y(i), nx, ny]);
        if (on(i + 1)) k++;
      }
      out.push(['Z']);
      s = e + 1;
    }
    return out;
  }

  /* --- subsets for PDF embedding ---
     The glyph ids stay as they are (the PDF maps CIDs straight to glyphs); only the
     outlines of the glyphs used are kept. Hinting tables stay so viewers that hint can. */
  subset(used) {
    if (this.cff || !this.t.glyf || !this.t.loca) return null;
    const keep = new Set([0]);
    const stack = Array.from(used);
    while (stack.length) { const g = stack.pop(); if (keep.has(g) || g >= this.numGlyphs) continue; keep.add(g); for (const c of this.components(g)) if (!keep.has(c)) stack.push(c); }
    const n = this.numGlyphs;
    const parts = [];
    let size = 0;
    const loca = new Uint8Array((n + 1) * 4), ldv = new DataView(loca.buffer);
    for (let g = 0; g < n; g++) {
      ldv.setUint32(g * 4, size);
      if (!keep.has(g)) continue;
      const r = this.glyphRange(g);
      if (!r || r[1] <= r[0]) continue;
      const len = r[1] - r[0], pad = (4 - (len & 3)) & 3;
      parts.push(this.u8.subarray(r[0], r[1]));
      if (pad) parts.push(new Uint8Array(pad));
      size += len + pad;
    }
    ldv.setUint32(n * 4, size);
    const glyf = new Uint8Array(size);
    let o = 0;
    for (const p of parts) { glyf.set(p, o); o += p.length; }
    const copy = tag => { const t = this.t[tag]; return t ? this.u8.slice(t.off, t.off + t.len) : null; };
    const head = copy('head');
    new DataView(head.buffer).setInt16(50, 1); // long loca offsets
    new DataView(head.buffer).setUint32(8, 0);
    const post = new Uint8Array(32); const pdv = new DataView(post.buffer);
    pdv.setUint32(0, 0x00030000); if (this.t.post) post.set(this.u8.subarray(this.t.post.off + 4, this.t.post.off + 16), 4);
    // a minimal (3,1) cmap: viewers map CIDs to glyphs directly
    const cmap = new Uint8Array([0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12, 0, 4, 0, 24, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0xFF, 0xFF, 0, 0, 0xFF, 0xFF, 0, 1, 0, 0]);
    const tables = { head, hhea: copy('hhea'), maxp: copy('maxp'), hmtx: copy('hmtx'), loca, glyf, post, cmap };
    for (const t of ['cvt ', 'fpgm', 'prep', 'gasp', 'OS/2', 'name']) { const c = copy(t); if (c) tables[t] = c; }
    return sfntWrite(tables);
  }
  /* CFF outlines: whether the font is CID-keyed and, if so, the CID of each glyph
     (PDF viewers find a CID-keyed font's glyphs through its charset) */
  cffInfo() {
    if (this._cff !== undefined) return this._cff;
    let info = null;
    const t = this.t['CFF '];
    if (t) {
      try {
        const dv = this.dv, o = t.off;
        const index = p => {
          const count = dv.getUint16(p);
          if (!count) return { items: [], end: p + 2 };
          const os = dv.getUint8(p + 2);
          const rd = q => { let v = 0; for (let i = 0; i < os; i++) v = v * 256 + dv.getUint8(q + i); return v; };
          const offs = [];
          for (let i = 0; i <= count; i++) offs.push(rd(p + 3 + i * os));
          const base = p + 2 + (count + 1) * os;
          return { items: offs.slice(0, -1).map((a, i) => [base + a, base + offs[i + 1]]), end: base + offs[count] };
        };
        const names = index(o + dv.getUint8(o + 2));
        const top = index(names.end).items[0];
        const dict = {};
        let ops = [];
        for (let p = top[0]; p < top[1];) {
          const b = dv.getUint8(p);
          if (b <= 21) { let op = String(b); p++; if (b === 12) { op = '12 ' + dv.getUint8(p); p++; } dict[op] = ops; ops = []; }
          else if (b === 28) { ops.push(dv.getInt16(p + 1)); p += 3; }
          else if (b === 29) { ops.push(dv.getInt32(p + 1)); p += 5; }
          else if (b === 30) { p++; for (;;) { const n = dv.getUint8(p++); if ((n & 15) === 15 || (n >> 4) === 15) break; } ops.push(0); }
          else if (b >= 32 && b <= 246) { ops.push(b - 139); p++; }
          else if (b >= 247 && b <= 250) { ops.push((b - 247) * 256 + dv.getUint8(p + 1) + 108); p += 2; }
          else if (b >= 251 && b <= 254) { ops.push(-(b - 251) * 256 - dv.getUint8(p + 1) - 108); p += 2; }
          else p++;
        }
        const cs = dict['17'] ? dict['17'][0] : 0;
        const n = cs ? dv.getUint16(o + cs) : this.numGlyphs;
        info = { cid: !!dict['12 30'], cids: null, n, charset: dict['15'] ? o + dict['15'][0] : 0 };
        if (info.cid) {
          const cids = new Uint32Array(n);
          let p = o + (dict['15'] ? dict['15'][0] : 0);
          const fmt = dv.getUint8(p++);
          if (fmt === 0) for (let g = 1; g < n; g++, p += 2) cids[g] = dv.getUint16(p);
          else for (let g = 1; g < n;) {
            const first = dv.getUint16(p), left = fmt === 1 ? dv.getUint8(p + 2) : dv.getUint16(p + 2);
            p += fmt === 1 ? 3 : 4;
            for (let k = 0; k <= left && g < n; k++) cids[g++] = first + k;
          }
          info.cids = cids;
        }
      } catch (e) { console.warn('CFF not read', e); info = null; }
    }
    this._cff = info;
    return info;
  }
  /* the whole font as a standalone file (collections give one face). A CID-keyed CFF font
     gets an identity charset (CID = glyph id), which every PDF viewer reads the same way. */
  standalone() {
    const tables = {};
    for (const tag in this.t) { const t = this.t[tag]; tables[tag] = this.u8.slice(t.off, t.off + t.len); }
    if (tables.head) new DataView(tables.head.buffer).setUint32(8, 0);
    const ci = this.cff ? this.cffInfo() : null;
    if (ci && ci.cid && ci.charset && ci.n > 2) {
      const at = ci.charset - this.t['CFF '].off, c = tables['CFF '];
      c[at] = 2; c[at + 1] = 0; c[at + 2] = 1; c[at + 3] = (ci.n - 2) >> 8; c[at + 4] = (ci.n - 2) & 255;
    }
    return sfntWrite(tables, this.cff ? 0x4F54544F : 0x00010000);
  }
}

/* assemble an sfnt from tables, fixing checksums */
function sfntWrite(tables, version = 0x00010000) {
  const tags = Object.keys(tables).filter(t => tables[t]).sort();
  const n = tags.length;
  let es = 0; while ((1 << (es + 1)) <= n) es++;
  const sr = (1 << es) * 16;
  let size = 12 + n * 16;
  for (const t of tags) size += (tables[t].length + 3) & ~3;
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  dv.setUint32(0, version); dv.setUint16(4, n); dv.setUint16(6, sr); dv.setUint16(8, es); dv.setUint16(10, n * 16 - sr);
  const sum = (o, len) => { let s = 0; for (let i = 0; i < len; i += 4) s = (s + dv.getUint32(o + i)) >>> 0; return s; };
  let off = 12 + n * 16, headOff = -1;
  tags.forEach((t, i) => {
    const data = tables[t], r = 12 + i * 16;
    out.set(data, off);
    for (let k = 0; k < 4; k++) dv.setUint8(r + k, t.charCodeAt(k));
    dv.setUint32(r + 4, sum(off, (data.length + 3) & ~3));
    dv.setUint32(r + 8, off); dv.setUint32(r + 12, data.length);
    if (t === 'head') headOff = off;
    off += (data.length + 3) & ~3;
  });
  if (headOff >= 0) dv.setUint32(headOff + 8, (0xB1B0AFBA - sum(0, size)) >>> 0);
  return out;
}
