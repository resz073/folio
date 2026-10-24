/* ===================== Line spacing as Word does it =====================
   Word spaces lines at a multiple of the font's own single line, which for Calibri is
   1.22 × the font size (winAscent + winDescent): its default 1.08 is 1.32 × the size.
   CSS line-height multiplies the font size alone, so doc.css sets
   line-height = multiple (--lhm) × the font's single line (--lhr), and the layout marks a
   paragraph with data-lh (never saved) when it needs another factor:
   - its own multiple (style="line-height: 1.15" is kept as Word's value)
   - letters in another font: the tallest single line among the fonts its text uses. Bangla
     letters in a Latin font are drawn by the document's Bangla font and count with that
     font's line, which keeps vowel signs and conjuncts off the next line
   - every letter in a span with its own size (all 9 pt in an 11 pt paragraph, as Word
     documents often have): the paragraph's own strut is dropped (line-height 0, the spans
     keep the factor), so smaller text gets smaller lines, as in Word. */
// Word's single line of the Office fonts (the look-alikes shown here are spaced like them)
const LINE_MS = { calibri: 1.2207, 'calibri light': 1.2207, cambria: 1.1724, arial: 1.1499, 'times new roman': 1.1499, 'courier new': 1.1328, georgia: 1.1362, verdana: 1.2153, tahoma: 1.207, 'segoe ui': 1.3301, consolas: 1.1709 };
// the faces published with the page, read from their own tables
const LINE_FACES = { carlito: 1.2207, caladea: 1.3, arimo: 1.4321, tinos: 1.1499, cousine: 1.1328, gelasio: 1.6602, 'eb garamond': 1.437, 'dejavu sans': 1.1641, 'noto sans': 1.519, questrial: 1.47, roboto: 1.2002, 'open sans': 1.4419, lato: 1.416, montserrat: 1.562, merriweather: 1.732, lora: 1.5, 'pt serif': 1.325, 'source serif 4': 1.371, 'playfair display': 1.41, 'libre baskerville': 1.452, inconsolata: 1.458, 'dancing script': 1.402, 'noto sans bengali': 1.403, 'noto serif bengali': 1.715, 'hind siliguri': 1.617, 'tiro bangla': 1.521, 'anek bangla': 1.9455, 'baloo da 2': 1.684, galada: 1.627 };
const LH_BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,pre,div,dd,dt';
const LH_NESTED = /^(P|H[1-6]|LI|TD|TH|BLOCKQUOTE|PRE|DIV|DD|DT|UL|OL|DL|TABLE|THEAD|TBODY|TFOOT|TR|HR|FIGURE)$/;
const LH_BN = /[\u0980-\u09FF\u0964\u0965]/;
const LH_OTHER = /[^\s\u0980-\u09FF\u0964\u0965\u200B-\u200D\u2060\uFEFF]/;
const LH_VISIBLE = /[^\s\u200B\u2060\uFEFF]/;

/* Word's single line for a font file: winAscent + winDescent, plus any line gap the hhea
   table asks for beyond that (what GDI calls external leading), per em */
function wordLineOf(bytes) {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const base = dv.getUint32(0) === 0x74746366 ? dv.getUint32(12) : 0;
    const n = dv.getUint16(base + 4), t = {};
    for (let i = 0; i < n; i++) { const r = base + 12 + i * 16; t[String.fromCharCode(u8[r], u8[r + 1], u8[r + 2], u8[r + 3])] = dv.getUint32(r + 8); }
    if (t.head == null || t.hhea == null) return null;
    const upem = dv.getUint16(t.head + 18) || 1000;
    const ha = dv.getInt16(t.hhea + 4), hd = dv.getInt16(t.hhea + 6), hg = dv.getInt16(t.hhea + 8);
    const win = t['OS/2'] != null ? dv.getUint16(t['OS/2'] + 74) + dv.getUint16(t['OS/2'] + 76) : 0;
    if (!win) return (ha - hd + hg) / upem;
    return (win + Math.max(0, hg - (win - (ha - hd)))) / upem;
  } catch { return null; }
}

const LineH = {
  ratios: new Map(),   // family (lower case) -> its single line per em, or null when not drawn here
  rules: new Set(),    // data-lh values with a rule
  sheet: null,
  sweepTimer: 0,
  reset() { this.ratios.clear(); },
  /* is a family drawn here (installed, added or published), measured once */
  drawnHere(name) {
    const f = FONT_MAP[name.toLowerCase()];
    if (f) { if (f.user) return true; if (f.local) return fontAvailable(f.n); }
    try {
      const c = document.createElement('canvas').getContext('2d');
      const sample = 'Abc xyz 0123 ' + FONT_SAMPLE_BN;
      for (const base of ['monospace', 'serif']) {
        c.font = `40px ${base}`; const w0 = c.measureText(sample).width;
        c.font = `40px ${quoteFont(name)}, ${base}`; if (Math.abs(c.measureText(sample).width - w0) > 0.5) return true;
      }
    } catch { }
    return false;
  },
  /* the browser's own line for a family drawn here (on Windows its metrics are Word's) */
  probe(name) {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;margin:0;padding:0;border:0;font:400 normal 200px ${quoteFont(name)};line-height:normal;white-space:nowrap`;
    const k = document.createElement('span');
    k.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    d.appendChild(k);
    document.body.appendChild(d);
    const hgt = d.getBoundingClientRect().height;
    d.remove();
    return hgt > 0 ? hgt / 200 : null;
  },
  family(name) {
    const k = String(name || '').trim().toLowerCase();
    if (!k || /[()]/.test(k)) return null;
    if (this.ratios.has(k)) return this.ratios.get(k);
    let r = null;
    if (LINE_MS[k]) r = LINE_MS[k];
    else {
      const metas = UserFonts.list.filter(m => m.family.toLowerCase() === k && UserFonts.bytes.has(m.id));
      const meta = metas.find(m => (m.weight || 400) === 400 && !m.italic) || metas[0];
      if (meta) r = wordLineOf(UserFonts.bytes.get(meta.id));
      else if (LINE_FACES[k]) r = LINE_FACES[k];
      else if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(k) || this.drawnHere(name)) r = this.probe(name);
    }
    if (r != null && !(r > 0.6 && r < 4)) r = null;
    this.ratios.set(k, r);
    return r;
  },
  /* the single line of the face a font-family list draws with */
  stack(list) {
    for (const f of splitFamilies(list)) { const r = this.family(f); if (r) return r; }
    return 1.2207;
  },
  bnRatio() { return this.stack(bnStack(docBnFont())); },
  /* the factor a block needs: { f, z } (z: drop its own strut), or null to leave it alone */
  need(b) {
    const inl = b.style.lineHeight;
    let m = null;
    if (inl) { if (!/^\s*\d*\.?\d+\s*$/.test(inl)) return null; m = parseFloat(inl); }
    const cs = getComputedStyle(b);
    const lhm = parseFloat(cs.getPropertyValue('--lhm')) || S.doc.line || 1.08;
    if (m == null) m = lhm;
    const famB = cs.fontFamily;
    const bnR = () => (this._bn != null ? this._bn : (this._bn = this.bnRatio()));
    const runR = (t, fam) => {
      const bn = LH_BN.test(t), other = !bn || LH_OTHER.test(t);
      let r = other ? this.stack(fam) : 0;
      if (bn) r = Math.max(r, isBanglaFontName(firstFamily(fam)) ? this.stack(fam) : bnR());
      return r;
    };
    let R = 0, items = 0, direct = false;
    const walk = (node, fam) => {
      for (let n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          const t = n.data;
          if (!t || !LH_VISIBLE.test(t)) continue;
          items++;
          if (node === b) direct = true;
          R = Math.max(R, runR(t, fam));
        } else if (n.nodeType === 1) {
          const tag = n.tagName;
          if (LH_NESTED.test(tag) || tag === 'IMG' || n.classList.contains('pg-line') || n.classList.contains('fn')) continue;
          if (tag === 'BR') { items++; if (node === b) direct = true; R = Math.max(R, this.stack(fam)); continue; }
          walk(n, n.style && n.style.fontFamily ? n.style.fontFamily : fam);
        }
      }
    };
    walk(b, famB);
    if (!items) { R = this.stack(famB); direct = true; }
    const f = Math.round(m * R * 10000) / 10000;
    const def = Math.round(lhm * (parseFloat(cs.getPropertyValue('--lhr')) || 1.2207) * 10000) / 10000;
    if (!inl && direct && Math.abs(f - def) < 0.0002) return null;
    return { f, z: !direct };
  },
  mark(b, v) {
    const cur = b.getAttribute('data-lh');
    if (!v) { if (cur != null) { b.removeAttribute('data-lh'); return true; } return false; }
    const s = v.f.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + (v.z ? 'z' : '');
    this.rule(s, v);
    if (cur === s) return false;
    b.setAttribute('data-lh', s);
    return true;
  },
  rule(s, v) {
    if (this.rules.has(s)) return;
    this.rules.add(s);
    if (!this.sheet || !this.sheet.isConnected) { this.sheet = h('style', { id: 'lhRules' }); document.head.appendChild(this.sheet); }
    this.sheet.textContent += `.doc [data-lh="${s}"]{--lhf:${v.f}!important;line-height:${v.z ? 0 : v.f}!important}\n`;
  },
  cssText() { return this.sheet ? this.sheet.textContent : ''; },
  /* blocks to look at: every one, or those inside the units that changed and the selection */
  blocksFor(units) {
    const ed = S.editor;
    if (!units) return Array.from(ed.querySelectorAll(LH_BLOCKS));
    const set = new Set();
    const add = el => { if (!el || !el.isConnected || !ed.contains(el) || el === ed) return; if (el.matches(LH_BLOCKS)) set.add(el); el.querySelectorAll(LH_BLOCKS).forEach(x => set.add(x)); };
    for (const u of units) { add(u); add(u.previousElementSibling); add(u.nextElementSibling); }
    const r = getRange();
    if (r && ed.contains(r.commonAncestorContainer)) {
      const sb = blockOf(r.startContainer), eb = blockOf(r.endContainer);
      if (sb === eb) add(sb);
      else for (const b of selectedBlocks(r)) add(b);
    }
    if (Tables.active()) for (const c of Tables.selectedCells()) add(c);
    return Array.from(set);
  },
  /* runs before pagination; returns whether any mark changed */
  layout(units) {
    if (!S.editor || !S.doc) return false;
    this._bn = null;
    let changed = false;
    for (const b of this.blocksFor(units)) {
      if (b.closest('.toc')) continue;
      try { if (this.mark(b, this.need(b))) changed = true; } catch (e) { console.warn(e); }
    }
    if (units) this.sweepSoon(); else clearTimeout(this.sweepTimer);
    return changed;
  },
  /* after edits, a quiet look at every block catches the ones a change reached indirectly */
  sweepSoon() {
    clearTimeout(this.sweepTimer);
    this.sweepTimer = setTimeout(() => { if (S.composing) return this.sweepSoon(); if (this.layout(null)) Layout.soon(); }, 1500);
  },
};
