/* ===================== PDF, the way Word writes it =====================
   Text is real text set in embedded font subsets, so it stays sharp at any zoom, prints
   crisply, can be searched and copied, and the file stays small. Borders, shading and
   rules are vector shapes; pictures keep their own resolution. Every word is placed
   exactly where the page shows it. Words in a font whose file Folio can't read (a font
   installed only on this computer) are drawn as fine pictures with searchable text over
   them, so the PDF still looks exactly like the page. */
const PT = 0.75; // CSS px to PDF points
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', '-apple-system', 'blinkmacsystemfont', 'math', 'emoji']);
/* stand-ins for fonts that live on the computer (metric-compatible ones keep every line break) */
const PDF_SUBST = {
  calibri: ['carlito', 1], 'calibri light': ['carlito', 0], cambria: ['caladea', 1], 'cambria math': ['caladea', 0],
  arial: ['arimo', 1], helvetica: ['arimo', 1], 'helvetica neue': ['arimo', 0], 'liberation sans': ['arimo', 1], 'arial nova': ['arimo', 0],
  'times new roman': ['tinos', 1], times: ['tinos', 1], 'liberation serif': ['tinos', 1],
  'courier new': ['cousine', 1], courier: ['cousine', 1], 'liberation mono': ['cousine', 1], consolas: ['cousine', 0], menlo: ['cousine', 0],
  georgia: ['gelasio', 1], garamond: ['eb garamond', 0], 'book antiqua': ['gelasio', 0], 'palatino linotype': ['gelasio', 0], palatino: ['gelasio', 0],
  verdana: ['dejavu sans', 0], tahoma: ['dejavu sans', 0], 'segoe ui': ['noto sans', 0], 'century gothic': ['questrial', 0],
  serif: ['tinos', 0], 'sans-serif': ['arimo', 0], monospace: ['cousine', 0], 'system-ui': ['noto sans', 0], cursive: ['dancing script', 0],
  'ui-serif': ['tinos', 0], 'ui-sans-serif': ['arimo', 0], 'ui-monospace': ['cousine', 0], '-apple-system': ['noto sans', 0], blinkmacsystemfont: ['noto sans', 0],
};
function splitFamilies(list) {
  const out = [];
  const re = /\s*(?:"([^"]*)"|'([^']*)'|([^,]+))\s*(?:,|$)/g;
  let m;
  while ((m = re.exec(String(list || ''))) && m[0]) out.push((m[1] || m[2] || m[3] || '').trim());
  return out.filter(Boolean);
}
/* CSS font matching for a weight among the faces a family has */
function matchWeight(want, have) {
  if (have.includes(want)) return want;
  const asc = have.slice().sort((a, b) => a - b), desc = asc.slice().reverse();
  if (want >= 400 && want <= 500) return asc.find(w => w > want && w <= 500) || desc.find(w => w < want) || asc.find(w => w > 500);
  if (want < 400) return desc.find(w => w < want) || asc.find(w => w > want);
  return asc.find(w => w > want) || desc.find(w => w < want);
}

/* ---------- where font files come from ---------- */
const PdfFontFiles = {
  cache: new Map(),
  failed: new Set(),
  /* failures are forgotten before each export, so the next one tries again */
  reset() { for (const k of this.failed) this.cache.delete(k); this.failed.clear(); },
  load(src) {
    const key = src.kind === 'user' ? 'u:' + src.meta.id : 'b:' + src.file;
    let p = this.cache.get(key);
    if (!p) {
      p = (async () => {
        try {
          let bytes;
          if (src.kind === 'user') {
            bytes = UserFonts.bytes && UserFonts.bytes.get(src.meta.id);
            if (!bytes) { const st = await UserFonts.store(); bytes = await st.load(src.meta); }
          } else {
            const r = await fetch('fonts/' + src.file);
            if (!r.ok) throw new Error('font file ' + r.status);
            bytes = new Uint8Array(await r.arrayBuffer());
          }
          if (!bytes || !bytes.length) return null;
          const f = new OTFont(bytes);
          f.key = key;
          return f;
        } catch (e) { console.warn('PDF font unavailable', src, e); this.failed.add(key); return null; }
      })();
      this.cache.set(key, p);
    }
    return p;
  },
};

/* Which family the browser drew a character with: the first in the list it has a glyph for.
   Measured against a probe font that has every character at an odd width, so the answer
   doesn't depend on which font the system would fall back to. */
const _famHas = new Map();
let _probe = null;
function probeReady() {
  if (!_probe) _probe = (async () => {
    try { const ff = new FontFace('FolioProbe', glyphlessFont(true)); await ff.load(); document.fonts.add(ff); return true; }
    catch (e) { console.warn('probe font unavailable', e); return false; }
  })();
  return _probe;
}
function browserHas(fam, ch, wt, it) {
  const lf = fam.toLowerCase();
  if (GENERIC_FAMILIES.has(lf)) return true;
  const key = lf + '\u0001' + ch + '\u0001' + (wt >= 600 ? 'b' : '') + (it ? 'i' : '');
  let v = _famHas.get(key);
  if (v !== undefined) return v;
  v = false;
  try {
    const c = PaintSession.mctx || (PaintSession.mctx = document.createElement('canvas').getContext('2d'));
    const pre = `${it ? 'italic ' : ''}${wt} 40px `;
    if (_probe && _probe.ok) {
      c.font = pre + quoteFont(fam) + ', FolioProbe';
      v = Math.abs(c.measureText(ch).width - 40 * 1.738) > 0.05;
    } else {
      const sample = ch.repeat(3);
      for (const base of ['monospace', 'serif']) {
        c.font = pre + base; const w0 = c.measureText(sample).width;
        c.font = pre + quoteFont(fam) + ', ' + base; const w1 = c.measureText(sample).width;
        if (Math.abs(w1 - w0) > 0.01) { v = true; break; }
      }
    }
  } catch { v = false; }
  _famHas.set(key, v);
  return v;
}
/* the font file to embed for a family, weight and style (or null: draw as a picture) */
function pdfFaceFor(fam, wt, it) {
  const lf = fam.toLowerCase();
  const user = (UserFonts.list || []).filter(m => m.family.toLowerCase() === lf);
  if (user.length) {
    const pool = user.filter(m => !!m.italic === !!it).length ? user.filter(m => !!m.italic === !!it) : user;
    const w = matchWeight(wt, pool.map(m => m.weight || 400));
    const meta = pool.find(m => (m.weight || 400) === w) || pool[0];
    return { src: { kind: 'user', meta }, bold: wt >= 600 && (meta.weight || 400) < 600, italic: it && !meta.italic, exact: true };
  }
  let name = lf, exact = true;
  if (!PDF_FONT_FILES[name]) {
    const sub = PDF_SUBST[name];
    if (!sub) return null;
    name = sub[0]; exact = !!sub[1];
  }
  const files = PDF_FONT_FILES[name];
  if (!files) return null;
  const faces = Object.keys(files).map(k => ({ k, w: k.includes('b') ? 700 : 400, i: k.includes('i') }));
  const pool = faces.filter(f => f.i === !!it).length ? faces.filter(f => f.i === !!it) : faces;
  const w = matchWeight(wt, pool.map(f => f.w));
  const f = pool.find(x => x.w === w) || pool[0];
  return { src: { kind: 'bundled', file: files[f.k] }, bold: wt >= 600 && f.w < 600, italic: !!it && !f.i, exact };
}

/* ---------- the PDF file ---------- */
class PdfDoc {
  constructor() {
    this.enc = new TextEncoder();
    this.chunks = []; this.offset = 0; this.offsets = []; this.nextId = 1;
    this.fonts = new Map();  // font key + synthetic flags -> font resource
    this.images = new Map();
    this.gstates = new Map();
    this.compress = typeof CompressionStream !== 'undefined';
    this.push('%PDF-1.7\n%');
    this.push(new Uint8Array([0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    this.catalog = this.alloc(); this.pagesId = this.alloc();
  }
  alloc() { return this.nextId++; }
  push(d) { const b = typeof d === 'string' ? this.enc.encode(d) : d; this.chunks.push(b); this.offset += b.length; }
  obj(id, dict) { this.offsets[id] = this.offset; this.push(`${id} 0 obj\n${dict}\nendobj\n`); }
  async stream(id, dict, data, compress = true) {
    let bytes = typeof data === 'string' ? this.enc.encode(data) : data;
    let filter = '';
    if (compress && this.compress && bytes.length > 64) { bytes = await deflateBytes(bytes); filter = ' /Filter /FlateDecode'; }
    this.offsets[id] = this.offset;
    this.push(`${id} 0 obj\n<< ${dict}${filter} /Length ${bytes.length} >>\nstream\n`);
    this.push(bytes);
    this.push('\nendstream\nendobj\n');
  }
  font(otf) {
    let fr = this.fonts.get(otf.key);
    if (!fr) { fr = { otf, id: this.alloc(), name: 'F' + (this.fonts.size + 1), used: new Map() }; this.fonts.set(otf.key, fr); }
    return fr;
  }
  gs(fill, stroke) {
    const k = fill + '/' + stroke;
    let g = this.gstates.get(k);
    if (!g) { g = { id: this.alloc(), name: 'G' + (this.gstates.size + 1), fill, stroke }; this.gstates.set(k, g); }
    return g;
  }
  async writeFonts() {
    for (const fr of this.fonts.values()) {
      const f = fr.otf, k = 1000 / f.upem;
      const used = Array.from(fr.used.keys()).sort((a, b) => a - b);
      const cff = f.cff ? f.cffInfo() : null;
      // CFF fonts go in whole as OpenType; a TrueType font is cut down to the glyphs used,
      // unless its maker forbids subsetting
      const sub = cff || (f.fsType & 0x0100) ? f.standalone() : (f.subset(used) || f.standalone());
      const code = g => g; // CID = glyph id (CID-keyed CFF fonts get an identity charset)
      let h = 0;
      for (const c of f.key + used.join(',')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      let tag = '';
      for (let i = 0; i < 6; i++) { tag += String.fromCharCode(65 + (h % 26)); h = Math.floor(h / 26) + i * 7; }
      const base = tag + '+' + (f.psName || 'Font').slice(0, 60);
      const ff = this.alloc(), fd = this.alloc(), cid = this.alloc(), tu = this.alloc();
      await this.stream(ff, cff ? '/Subtype /OpenType' : `/Length1 ${sub.length}`, sub);
      const lm = f.lineMetrics();
      const flags = 4 | (f.fixedPitch ? 1 : 0) | (f.italicAngle ? 64 : 0);
      const bb = f.bbox.map(v => Math.round(v * k));
      const stemV = Math.round(50 + Math.max(0, f.weight - 300) / 5);
      this.obj(fd, `<< /Type /FontDescriptor /FontName /${base} /Flags ${flags} /FontBBox [${bb.join(' ')}] /ItalicAngle ${pdfNum(f.italicAngle)} /Ascent ${Math.round(lm.asc * k)} /Descent ${-Math.round(lm.desc * k)} /CapHeight ${Math.round(f.capHeight * k)} /XHeight ${Math.round(f.xHeight * k)} /StemV ${stemV} /${cff ? 'FontFile3' : 'FontFile2'} ${ff} 0 R >>`);
      // widths of the glyphs used, by character code, in runs of consecutive codes
      let W = '', run = null, prev = -2;
      for (const [c, g] of used.map(g => [code(g), g]).sort((a, b) => a[0] - b[0])) {
        const w = pdfNum(f.advance(g) * k);
        if (c === prev + 1 && run) run.push(w); else { if (run) W += `${run.start} [${run.join(' ')}] `; run = [w]; run.start = c; }
        prev = c;
      }
      if (run) W += `${run.start} [${run.join(' ')}]`;
      this.obj(cid, `<< /Type /Font /Subtype /${cff ? 'CIDFontType0' : 'CIDFontType2'} /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fd} 0 R /DW ${Math.round(f.advance(0) * k)} /W [${W}]${cff ? '' : ' /CIDToGIDMap /Identity'} >>`);
      await this.stream(tu, '', toUnicodeFor(new Map(Array.from(fr.used).map(([g, ch]) => [code(g), ch]))));
      this.obj(fr.id, `<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    }
    for (const g of this.gstates.values()) this.obj(g.id, `<< /Type /ExtGState /ca ${pdfNum(g.fill)} /CA ${pdfNum(g.stroke)} >>`);
  }
  async finish(pageIds, meta, outline) {
    await this.writeFonts();
    if (this.glyphless) await this.writeGlyphless();
    this.obj(this.pagesId, `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
    let outl = '';
    if (outline && outline.length) {
      const oid = this.alloc();
      const ids = outline.map(() => this.alloc());
      // a tree from heading levels
      const parent = [], kids = new Map([[oid, []]]);
      outline.forEach((o, i) => {
        while (parent.length && parent[parent.length - 1].level >= o.level) parent.pop();
        const p = parent.length ? parent[parent.length - 1].id : oid;
        o.id = ids[i]; o.parent = p;
        kids.get(p).push(o); kids.set(o.id, []);
        parent.push(o);
      });
      const count = id => kids.get(id).reduce((a, k) => a + 1 + count(k.id), 0);
      for (const o of outline) {
        const sib = kids.get(o.parent), j = sib.indexOf(o), ch = kids.get(o.id);
        let d = `<< /Title ${pdfText(o.text)} /Parent ${o.parent} 0 R /Dest [${o.page} 0 R /XYZ 0 ${pdfNum(o.top)} null]`;
        if (j > 0) d += ` /Prev ${sib[j - 1].id} 0 R`;
        if (j < sib.length - 1) d += ` /Next ${sib[j + 1].id} 0 R`;
        if (ch.length) d += ` /First ${ch[0].id} 0 R /Last ${ch[ch.length - 1].id} 0 R /Count ${o.level < 2 ? count(o.id) : -count(o.id)}`;
        this.obj(o.id, d + ' >>');
      }
      const top = kids.get(oid);
      this.obj(oid, `<< /Type /Outlines /First ${top[0].id} 0 R /Last ${top[top.length - 1].id} 0 R /Count ${count(oid)} >>`);
      outl = ` /Outlines ${oid} 0 R`;
    }
    const pp = pdfPrintPrefs(meta.print);
    this.obj(this.catalog, `<< /Type /Catalog /Pages ${this.pagesId} 0 R${outl} /ViewerPreferences << /DisplayDocTitle true${pp.prefs} >>${pp.open}${meta.lang ? ` /Lang ${pdfLiteral(meta.lang)}` : ''} >>`);
    const info = this.alloc();
    const d = new Date(), pad = v => String(v).padStart(2, '0');
    const dt = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    this.obj(info, `<< /Title ${pdfText(meta.title || 'Document')} /Author ${pdfText(meta.author || '')}${meta.subject ? ` /Subject ${pdfText(meta.subject)}` : ''}${meta.keywords ? ` /Keywords ${pdfText(meta.keywords)}` : ''} /Creator (Folio) /Producer (Folio) /CreationDate (${dt}) /ModDate (${dt}) >>`);
    const xref = this.offset;
    let x = `xref\n0 ${this.nextId}\n0000000000 65535 f \n`;
    for (let k = 1; k < this.nextId; k++) x += String(this.offsets[k] || 0).padStart(10, '0') + ' 00000 n \n';
    this.push(x);
    this.push(`trailer\n<< /Size ${this.nextId} /Root ${this.catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(this.chunks, { type: 'application/pdf' });
  }
  /* the invisible font that carries searchable text over words drawn as pictures */
  glyphlessFont() { if (!this.glyphless) this.glyphless = { id: this.alloc() }; return this.glyphless; }
  async writeGlyphless() {
    const g = this.glyphless, cid = this.alloc(), fd = this.alloc(), ff = this.alloc(), map = this.alloc(), tu = this.alloc();
    this.obj(g.id, `<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    this.obj(cid, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GlyphLessFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fd} 0 R /DW 500 /CIDToGIDMap ${map} 0 R >>`);
    this.obj(fd, `<< /Type /FontDescriptor /FontName /GlyphLessFont /Flags 4 /FontBBox [0 -200 500 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 ${ff} 0 R >>`);
    const ttf = glyphlessFont();
    await this.stream(ff, `/Length1 ${ttf.length}`, ttf);
    const gid = new Uint8Array(131072);
    for (let i = 1; i < gid.length; i += 2) gid[i] = 1;
    await this.stream(map, '', gid);
    await this.stream(tu, '', toUnicodeCMap());
  }
}
function utf16hex(s) { let x = ''; for (let i = 0; i < s.length; i++) x += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase(); return x; }
function toUnicodeFor(used) {
  const ent = [];
  for (const [g, chars] of used) if (chars) ent.push(`<${g.toString(16).padStart(4, '0').toUpperCase()}> <${utf16hex(chars)}>`);
  let body = '';
  for (let i = 0; i < ent.length; i += 100) { const part = ent.slice(i, i + 100); body += `${part.length} beginbfchar\n${part.join('\n')}\nendbfchar\n`; }
  return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${body}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
}
function pdfRGB(css) { const [r, g, b, a] = rgbaOf(css); return { c: `${pdfNum(r / 255)} ${pdfNum(g / 255)} ${pdfNum(b / 255)}`, a: a == null ? 1 : a }; }

/* ---------- laying words out in embedded fonts ---------- */
const SMALLCAPS = 0.7; // Chromium's synthesized small capitals
class TextSetter {
  constructor(doc) { this.doc = doc; this.cache = new Map(); this.need = new Map(); this.pictures = []; this.localOnly = new Set(); }
  /* which embedded face each character of a word uses (null for picture text) */
  plan(s, fi) {
    const fams = splitFamilies(fi.fam);
    const chars = Array.from(s);
    const runs = [];
    let cur = null;
    for (const ch of chars) {
      const cp = ch.codePointAt(0), up = ucProps(cp);
      let fam;
      if ((up.mark || up.ign || cp === 0x200C || cp === 0x200D) && cur) fam = cur.fam;
      else fam = fams.find(f => browserHas(f, ch, fi.wt, fi.it)) || null;
      if (cur && cur.fam === fam) { cur.text += ch; continue; }
      cur = { fam, text: ch };
      runs.push(cur);
    }
    for (const r of runs) r.face = r.fam ? pdfFaceFor(r.fam, fi.wt, fi.it) : null;
    return runs;
  }
  /* fonts every word on the pages needs, fetched once */
  async preload(ops) {
    const ok = await probeReady();
    if (_probe) _probe.ok = ok;
    const srcs = new Map();
    for (const op of ops) {
      if (!op.fi || (op.t !== 'text' && op.t !== 'wm')) continue;
      const k = op.s + '\u0001' + op.fi.fam + op.fi.wt + op.fi.it;
      if (this.need.has(k)) continue;
      const runs = this.plan(op.s, op.fi);
      this.need.set(k, runs);
      for (const r of runs) if (r.face) srcs.set(r.face.src.kind === 'user' ? 'u' + r.face.src.meta.id : r.face.src.file, r.face.src);
    }
    await Promise.all(Array.from(srcs.values()).map(src => PdfFontFiles.load(src)));
  }
  /* shape a word: positioned glyph runs in px, or null when it has to be a picture */
  async layout(op) {
    const fi = op.fi;
    const key = op.s + '\u0001' + fi.fam + fi.wt + fi.it + '|' + fi.sz + '|' + (op.ls || 0) + (fi.caps ? 'c' : '') + (fi.kern ? '' : 'k') + (fi.liga ? '' : 'l') + fi.lang;
    if (this.cache.has(key)) return this.cache.get(key);
    let runs = this.need.get(op.s + '\u0001' + fi.fam + fi.wt + fi.it);
    if (!runs) runs = this.plan(op.s, fi);
    let res = { items: [], width: 0, chars: 0 };
    for (const r of runs) {
      if (!r.face) { if (r.fam) this.localOnly.add(r.fam); res = null; break; }
      const otf = await PdfFontFiles.load(r.face.src);
      if (!otf || !otf.embeddable || (otf.cff && (!otf.t['CFF '] || otf.u8.length > 8e6 || !otf.cffInfo()))) { res = null; break; }
      const lang = /^bn/i.test(fi.lang) ? 'BEN ' : null;
      const opts = { lang, noLiga: !!op.ls || !fi.liga, noKern: !fi.kern };
      // small capitals: the font's own, or lower-case letters as capitals at 70%
      const pieces = [];
      if (fi.caps && !(otf.layout('GSUB') && otf.layout('GSUB').features.some(f => f.tag === 'smcp'))) {
        let p = null;
        for (const ch of r.text) {
          const low = ch !== ch.toUpperCase() && ch.toUpperCase().length === 1;
          if (!p || p.low !== low) { p = { low, text: '' }; pieces.push(p); }
          p.text += low ? ch.toUpperCase() : ch;
        }
      } else pieces.push({ low: false, text: r.text, smcp: fi.caps });
      for (const pc of pieces) {
        const size = fi.sz * (pc.low ? SMALLCAPS : 1);
        for (const sr of scriptRuns(pc.text)) {
          if (sr.script === 'complex' || sr.script === 'other' && /[֐-ࣿऀ-ॿ਀-෿฀-࿿က-႟ក-៿가-힯]/.test(sr.text)) { res = null; break; }
          const sh = shapeRun(otf, sr.text, sr.script === 'other' ? 'com' : sr.script, Object.assign({ smcp: pc.smcp }, opts));
          if (sh.missing) { res = null; break; }
          const k = size / otf.upem;
          res.items.push({ otf, face: r.face, size, k, glyphs: sh.glyphs, x: res.width, text: sr.text });
          res.width += sh.width * k;
          const n = Array.from(sr.text).length;
          res.chars += n;
          if (op.ls) res.width += op.ls * n;
        }
        if (!res) break;
      }
      if (!res) break;
    }
    if (res && op.ls) {
      // letter spacing follows every character, as in the browser
      let x = 0;
      for (const it of res.items) { it.x = x; x += it.glyphs.reduce((a, g) => a + g.xa, 0) * it.k + op.ls * Array.from(it.text).length; }
    }
    this.cache.set(key, res);
    return res;
  }
}

/* ---------- one page ---------- */
class PdfPageWriter {
  constructor(doc, setter, P, i) {
    this.doc = doc; this.setter = setter; this.P = P; this.i = i;
    // the page's own size, and its place in the column of pages
    const g = Pages.g(i);
    this.W = g.w * PT; this.H = g.h * PT; this.top = Pages.top(i); this.left = Pages.x(i);
    this.out = [];
    this.res = { font: new Map(), xobj: new Map(), gs: new Map(), pat: new Map() };
    this.fallbackWords = [];
    this.links = [];
  }
  X(x) { return pdfNum((x - this.left) * PT); }
  Y(y) { return pdfNum(this.H - (y - this.top) * PT); }
  L(v) { return pdfNum(v * PT); }
  w(s) { this.out.push(s); }
  fill(css) { const c = pdfRGB(css); return `${c.c} rg` + this.alpha(c.a, null); }
  stroke(css) { const c = pdfRGB(css); return `${c.c} RG` + this.alpha(null, c.a); }
  alpha(fa, sa) {
    if ((fa == null || fa >= 1) && (sa == null || sa >= 1)) return '';
    const g = this.doc.gs(fa == null ? 1 : fa, sa == null ? 1 : sa);
    this.res.gs.set(g.name, g.id);
    return ` /${g.name} gs`;
  }
  rect(x, y, w, h) { return `${this.X(x)} ${pdfNum(this.H - (y + h - this.top) * PT)} ${this.L(w)} ${this.L(h)} re`; }
  clipOpen(c) { if (!c) return false; if (c.w <= 0 || c.h <= 0) return null; this.w(`q ${this.rect(c.x, c.y, c.w, c.h)} W n`); return true; }
  async op(op) {
    const c = op.clip ? this.clipOpen(op.clip) : false;
    if (c === null) return;
    // a turned shape (and its text): a turn about the shape's centre, in the page's coordinates
    if (op.rot) {
      const f = -op.rot.deg * Math.PI / 180, cs = Math.cos(f), sn = Math.sin(f), X = (op.rot.cx - this.left) * PT, Y = this.H - (op.rot.cy - this.top) * PT;
      this.w(`q ${pdfNum(cs)} ${pdfNum(sn)} ${pdfNum(-sn)} ${pdfNum(cs)} ${pdfNum(X - X * cs + Y * sn)} ${pdfNum(Y - X * sn - Y * cs)} cm`);
    }
    try {
      switch (op.t) {
        case 'rect': this.w(`q ${this.fill(op.fill)} ${this.rect(op.x, op.y, op.w, op.h)} f Q`); break;
        case 'line': this.rule(op); break;
        case 'shape': this.shape(op); break;
        case 'deco': this.deco(op); break;
        case 'diag': this.diag(op); break;
        case 'mark': this.mark(op); break;
        case 'pat': this.pattern(op); break;
        case 'img': await this.image(op); break;
        case 'bgimg': await this.bgImage(op); break;
        case 'text': await this.text(op); break;
        case 'wm': await this.watermark(op); break;
      }
    } finally { if (op.rot) this.w('Q'); if (c) this.w('Q'); }
  }
  /* a shape's outline: its path (M, L, C, Z from shapeGeom) on the page, filled and stroked */
  shape(op) {
    const fh = op.flip.includes('h'), fv = op.flip.includes('v');
    const tx = x => this.X(op.ox + (fh ? op.sw - x : x)), ty = y => this.Y(op.oy + (fv ? op.sh - y : y));
    const path = d => {
      let out = '';
      const re = /([MLCZ])([^MLCZ]*)/g;
      let m;
      while ((m = re.exec(d))) {
        const n = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
        if (m[1] === 'M') out += `${tx(n[0])} ${ty(n[1])} m `;
        else if (m[1] === 'L') out += `${tx(n[0])} ${ty(n[1])} l `;
        else if (m[1] === 'C') out += `${tx(n[0])} ${ty(n[1])} ${tx(n[2])} ${ty(n[3])} ${tx(n[4])} ${ty(n[5])} c `;
        else out += 'h ';
      }
      return out;
    };
    let s = 'q ';
    if (op.fill) s += this.fill(op.fill) + ' ';
    if (op.stroke) s += `${this.stroke(op.stroke)} ${this.L(op.lw)} w ${op.round ? 1 : 0} J 0 j ${op.dash && op.dash.length ? `[${op.dash.map(v => this.L(v)).join(' ')}] 0 d ` : ''}`;
    this.w(s + path(op.d) + (op.fill && op.stroke ? 'B' : op.fill ? 'f' : op.stroke ? 'S' : 'n') + ' Q');
    if (op.stroke) for (const hd of op.heads || []) this.w(`q ${this.fill(op.stroke)} ${path(hd)}f Q`);
  }
  /* borders: solid, double, dotted, dashed and the 3-D styles, at their true widths */
  rule(op) {
    const horiz = Math.abs(op.y2 - op.y1) < 0.01;
    const t = Math.max(0.25, op.w);
    const len = horiz ? op.x2 - op.x1 : op.y2 - op.y1;
    if (len <= 0) return;
    const band = (off, th, col) => {
      const s = this.fill(col);
      if (horiz) this.w(`q ${s} ${this.rect(op.x1, op.y1 - t / 2 + off, len, th)} f Q`);
      else this.w(`q ${s} ${this.rect(op.x1 - t / 2 + off, op.y1, th, len)} f Q`);
    };
    if (op.style === 'dotted' || op.style === 'dashed') {
      const round = op.style === 'dotted' && t >= 3;
      const dash = op.style === 'dotted' ? (round ? `[0 ${this.L(t * 2)}] 0` : `[${this.L(t)} ${this.L(t)}] 0`) : `[${this.L(t * 3)} ${this.L(t * 3)}] 0`;
      const a = horiz ? [op.x1 + (round ? t / 2 : 0), op.y1, op.x2, op.y1] : [op.x1, op.y1 + (round ? t / 2 : 0), op.x1, op.y2];
      this.w(`q ${this.stroke(op.color)} ${this.L(t)} w ${round ? 1 : 0} J ${dash} d ${this.X(a[0])} ${this.Y(a[1])} m ${this.X(a[2])} ${this.Y(a[3])} l S Q`);
      return;
    }
    if (/^(groove|ridge|inset|outset)$/.test(op.style)) {
      let st = op.style;
      if (op.coll) st = st === 'inset' ? 'ridge' : st === 'outset' ? 'groove' : st;
      const tl = op.side === 't' || op.side === 'l';
      if (st === 'inset' || st === 'outset') band(0, t, shade3d(op.color, (st === 'inset') === tl));
      else if (t < 1.5) band(0, t, op.color);
      else { band(0, t / 2, shade3d(op.color, st === 'groove')); band(t / 2, t / 2, shade3d(op.color, st !== 'groove')); }
      return;
    }
    if (op.style === 'double' && t >= 2.5) { const g3 = t / 3; band(0, g3, op.color); band(t - g3, g3, op.color); return; }
    band(0, t, op.color);
  }
  deco(op) {
    const t = Math.max(0.5, op.raw), x1 = op.x1, x2 = op.x2;
    if (x2 <= x1) return;
    if (op.style === 'wavy') {
      const amp = Math.max(1, t * 1.2), step = amp * 2, yc = op.top + t / 2 + amp / 2;
      let d = `${this.X(x1)} ${this.Y(yc)} m`;
      let up = true;
      for (let x = x1; x < x2; x += step) {
        const xe = Math.min(x2, x + step), cy = yc + (up ? -amp : amp);
        const c1x = x + (x + step / 2 - x) * 2 / 3, c2x = xe + (x + step / 2 - xe) * 2 / 3, c1y = yc + (cy - yc) * 2 / 3;
        d += ` ${this.X(c1x)} ${this.Y(c1y)} ${this.X(c2x)} ${this.Y(c1y)} ${this.X(xe)} ${this.Y(yc)} c`;
        up = !up;
      }
      this.w(`q ${this.stroke(op.color)} ${this.L(t)} w ${d} S Q`);
      return;
    }
    if (op.style === 'dotted' || op.style === 'dashed') {
      const dash = op.style === 'dotted' ? `[0 ${this.L(t * 2)}] 0` : `[${this.L(t * 3)} ${this.L(t * 2)}] 0`;
      this.w(`q ${this.stroke(op.color)} ${this.L(t)} w ${op.style === 'dotted' ? 1 : 0} J ${dash} d ${this.X(x1)} ${this.Y(op.top + t / 2)} m ${this.X(x2)} ${this.Y(op.top + t / 2)} l S Q`);
      return;
    }
    let s = `q ${this.fill(op.color)} ${this.rect(x1, op.top, x2 - x1, t)} f`;
    if (op.style === 'double') s += ` ${this.rect(x1, op.top + t * 2, x2 - x1, t)} f`;
    this.w(s + ' Q');
  }
  diag(op) {
    const t = Math.max(0.5, op.w);
    const dash = op.style === 'dotted' ? ` [${this.L(t)} ${this.L(t)}] 0 d` : op.style === 'dashed' ? ` [${this.L(t * 3)} ${this.L(t * 3)}] 0 d` : '';
    this.w(`q ${this.stroke(op.color)} ${this.L(t)} w${dash} ${this.X(op.x1)} ${this.Y(op.y1)} m ${this.X(op.x2)} ${this.Y(op.y2)} l S Q`);
  }
  mark(op) {
    const s = op.size;
    if (op.kind === 'square') { this.w(`q ${this.fill(op.color)} ${this.rect(op.x, op.y, s, s)} f Q`); return; }
    const r = s / 2, cx = op.x + r, cy = op.y + r;
    const ring = op.kind === 'circle';
    const rr = ring ? r - 0.5 : r, k = 0.5523 * rr;
    const P2 = (x, y) => `${this.X(x)} ${this.Y(y)}`;
    const d = `${P2(cx + rr, cy)} m ${P2(cx + rr, cy - k)} ${P2(cx + k, cy - rr)} ${P2(cx, cy - rr)} c ${P2(cx - k, cy - rr)} ${P2(cx - rr, cy - k)} ${P2(cx - rr, cy)} c ${P2(cx - rr, cy + k)} ${P2(cx - k, cy + rr)} ${P2(cx, cy + rr)} c ${P2(cx + k, cy + rr)} ${P2(cx + rr, cy + k)} ${P2(cx + rr, cy)} c h`;
    this.w(ring ? `q ${this.stroke(op.color)} ${this.L(1)} w ${d} S Q` : `q ${this.fill(op.color)} ${d} f Q`);
  }
  /* Word's shading patterns as tiling patterns anchored at the cell's corner */
  pattern(op) {
    const geo = PAT_GEOM[op.kind];
    if (!geo) return;
    const id = this.doc.alloc(), name = 'P' + id;
    const col = pdfRGB(op.color);
    let cs = `${col.c} rg ${col.c} RG`;
    for (const [x, y, w, h] of geo.r || []) cs += ` ${pdfNum(x)} ${pdfNum(y)} ${pdfNum(w)} ${pdfNum(h)} re f`;
    if (geo.l) { cs += ` ${pdfNum(geo.w)} w`; for (const [a, b, c, d] of geo.l) cs += ` ${pdfNum(a)} ${pdfNum(b)} m ${pdfNum(c)} ${pdfNum(d)} l S`; }
    const m = `[${PT} 0 0 ${-PT} ${this.X(op.x)} ${this.Y(op.y)}]`;
    this.pending = (this.pending || []).concat([this.doc.stream(id, `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 6 6] /XStep 6 /YStep 6 /Resources << >> /Matrix ${m}`, cs, false)]);
    this.res.pat.set(name, id);
    this.w(`q /Pattern cs /${name} scn ${this.rect(op.x, op.y, op.w, op.h)} f Q`);
  }
  async image(op) {
    const im = await pdfImage(this.doc, op.el, op.w, op.h);
    if (!im) return;
    this.res.xobj.set(im.name, im.id);
    this.w(`q ${this.L(op.w)} 0 0 ${this.L(op.h)} ${this.X(op.x)} ${pdfNum(this.H - (op.y + op.h - this.top) * PT)} cm /${im.name} Do Q`);
  }
  async bgImage(op) {
    const src = this.P.bgImages.get(op.url);
    if (!src) return;
    const im = await pdfImage(this.doc, src, op.w, op.h, { key: 'bg:' + op.url + ':' + op.w + 'x' + op.h, scale: 8 });
    if (!im) return;
    this.res.xobj.set(im.name, im.id);
    this.w(`q ${this.L(op.w)} 0 0 ${this.L(op.h)} ${this.X(op.x)} ${pdfNum(this.H - (op.y + op.h - this.top) * PT)} cm /${im.name} Do Q`);
  }
  /* one word: glyphs at the browser's position, in the browser's font */
  async text(op) {
    const lay = op.fi ? await this.setter.layout(op) : null;
    if (!lay) { await this.textPicture(op); return; }
    // the page measured the word; a font that runs a little wide or narrow is fitted
    let scale = 1;
    const domW = op.w;
    let ours = lay.width;
    if (op.hy && lay.items.length) { const last = lay.items[lay.items.length - 1]; const g = last.glyphs[last.glyphs.length - 1]; if (g) ours -= g.xa * last.k; }
    if (domW > 0 && Math.abs(ours - domW) > Math.max(0.35, domW * 0.004)) {
      scale = domW / ours;
      if (scale < 0.9 || scale > 1.1) { await this.textPicture(op); return; }
    }
    const col = pdfRGB(op.color);
    for (const it of lay.items) this.glyphRun(it, op.x + it.x * scale, op.y, scale, col, op.ls || 0);
    // a real space after the word, so copied text keeps its spaces
    const last = lay.items[lay.items.length - 1];
    const sp = op.sp && last ? last.otf.glyph(0x20) : 0;
    if (sp) this.glyphRun({ otf: last.otf, face: { bold: false, italic: false }, size: last.size, k: last.k, glyphs: [{ g: sp, xa: last.otf.advance(sp), xo: 0, yo: 0, chars: ' ', cl: 0 }], text: ' ' }, op.x + lay.width * scale, op.y, 1, col, 0);
  }
  glyphRun(it, x, y, scale, col, ls) {
    const { fr, tj } = this.tj(it, ls);
    const sz = it.size * PT;
    // q/Q keeps text state (render mode, rise) from leaking into the next word; it sits
    // outside the marked content, which readers close while the font is still set
    let s = `BT ${col.c} rg${this.alpha(col.a, null)} /${fr.name} ${pdfNum(sz)} Tf `;
    if (it.face.bold) s += this.fakeBold(it, col);
    s += `${pdfNum(scale)} 0 ${it.face.italic ? 0.25 : 0} 1 ${this.X(x)} ${this.Y(y)} Tm ${tj} ET`;
    this.w('q ' + this.actual(it, s) + ' Q');
  }
  /* Chromium's synthetic bold: the outline grows by a share of the size */
  fakeBold(it, col) {
    const px = it.size, ratio = px <= 9 ? 1 / 24 : px >= 36 ? 1 / 32 : 1 / 24 + (1 / 32 - 1 / 24) * (px - 9) / 27;
    return `2 Tr ${col.c} RG ${pdfNum(px * ratio * PT)} w `;
  }
  /* Bangla words (glyphs out of reading order, conjuncts, raised marks) carry their text,
     so copying and searching give the words as typed */
  actual(it, s) {
    const chars = it.glyphs.map(g => g.chars).join('');
    const plain = !it.glyphs.some(g => g.yo) && (chars === it.text.normalize('NFD') || chars.normalize('NFC') === it.text.normalize('NFC'));
    if (plain && !/[\u0980-\u09FF]/.test(it.text)) return s;
    return `/Span << /ActualText ${pdfText(it.text)} >> BDC ${s} EMC`;
  }
  /* the glyphs of one run as TJ arrays: pen positions in font units, the text position moving
     by each glyph's width, kerning and mark offsets as adjustments and rises */
  tj(it, ls) {
    const fr = this.doc.font(it.otf);
    this.res.font.set(fr.name, fr.id);
    const sz = it.size * PT, upem = it.otf.upem, k1000 = 1000 / upem;
    const lsU = ls ? ls / it.k : 0;
    // glyphs are written in visual order (as Chrome's own PDFs do); Bangla runs carry
    // /ActualText, which Chrome, Edge, Acrobat and poppler use for copying and searching
    const gs = it.glyphs, at0 = [];
    let pen = 0;
    for (let gi = 0; gi < gs.length; gi++) {
      at0.push(pen + gs[gi].xo);
      pen += gs[gi].xa;
      if (lsU && (gi === gs.length - 1 || gs[gi + 1].cl !== gs[gi].cl)) pen += lsU;
    }
    const order = gs.map((g, i) => i);
    let at = 0, rise = 0, out = '[';
    for (const gi of order) {
      const g = gs[gi];
      if (!fr.used.get(g.g)) fr.used.set(g.g, g.chars || '');
      if (g.yo !== rise) { out += `] TJ ${pdfNum(g.yo * sz / upem)} Ts [`; rise = g.yo; }
      const dx = at0[gi] - at;
      if (Math.abs(dx) > 0.01) out += `${pdfNum(-dx * k1000)}`;
      out += `<${g.g.toString(16).padStart(4, '0')}>`;
      at = at0[gi] + Math.round(it.otf.advance(g.g) * k1000 * 100) / 100 / k1000;
    }
    out += '] TJ' + (rise ? ' 0 Ts' : '');
    return { fr, tj: out };
  }
  /* a word in a font Folio can't embed: drawn as a fine picture, with its text kept */
  async textPicture(op) {
    this.setter.pictures.push(op.s);
    const m = this.P.metrics(op.font);
    const pad = 2;
    this.P.mctx.font = op.font;
    const mw = this.P.mctx.measureText(op.s).width + (op.ls || 0) * Array.from(op.s).length;
    const x0 = op.x - pad, y0 = op.y - m.ascent - pad, w = Math.max(op.w || 0, mw) + pad * 2, h = m.ascent + m.descent + pad * 2;
    const k = Math.max(1, Math.min(8, 4000 / Math.max(w, h)));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    ctx.font = op.font; ctx.fontKerning = 'normal'; ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = (op.ls || 0) + 'px';
    ctx.fillStyle = '#000';
    ctx.fillText(op.s, op.x, op.y);
    const im = await maskImage(this.doc, cv, op.color);
    if (im) {
      this.res.xobj.set(im.name, im.id);
      this.w(`q ${this.L(w)} 0 0 ${this.L(h)} ${this.X(x0)} ${pdfNum(this.H - (y0 + h - this.top) * PT)} cm /${im.name} Do Q`);
    }
    // invisible text so the word can still be found and copied
    const gl = this.doc.glyphlessFont();
    this.res.font.set('FG', gl.id);
    const { hex, n } = textLayerHex(op.s);
    const width = (op.w || mw) * PT;
    if (n && width > 0) {
      const sz = Math.max(1, (op.fi ? op.fi.sz : 12) * PT);
      const tz = Math.max(1, Math.min(1000, 100 * width / (n * 0.5 * sz)));
      this.w(`q BT 3 Tr /FG ${pdfNum(sz)} Tf ${pdfNum(tz)} Tz 1 0 0 1 ${this.X(op.x)} ${this.Y(op.y)} Tm <${hex}> Tj ET Q`);
    }
  }
  /* the watermark is drawn as shapes, like Word's WordArt, so it stays out of copied text */
  async watermark(op) {
    const fi = op.fi;
    const lay = fi ? await this.setter.layout({ s: op.s, fi, ls: 0 }) : null;
    if (!lay || !lay.items.length) return;
    const col = pdfRGB(op.color);
    const a = (col.a == null ? 1 : col.a) * (op.alpha == null ? 1 : op.alpha);
    const g = this.doc.gs(a, a);
    this.res.gs.set(g.name, g.id);
    const it0 = lay.items[0], lm = it0.otf.lineMetrics();
    // centred on the page, turned 45 degrees; 'middle' puts the em box's centre on the point
    const base = -(lm.asc - lm.desc) / 2 * it0.k;
    const c = Math.SQRT1_2;
    let d = '';
    for (const it of lay.items) {
      let pen = -lay.width / 2 + it.x;
      for (const gl of it.glyphs) {
        const ox = pen + gl.xo * it.k, oy = base + gl.yo * it.k;
        const P = (x, y) => `${pdfNum((ox + x * it.k) * PT)} ${pdfNum((oy + y * it.k) * PT)}`;
        let cx = 0, cy = 0;
        for (const cmd of it.otf.outline(gl.g)) {
          if (cmd[0] === 'M') { d += `${P(cmd[1], cmd[2])} m `; cx = cmd[1]; cy = cmd[2]; }
          else if (cmd[0] === 'L') { d += `${P(cmd[1], cmd[2])} l `; cx = cmd[1]; cy = cmd[2]; }
          else if (cmd[0] === 'Q') {
            const [, qx, qy, x, y] = cmd;
            d += `${P(cx + (qx - cx) * 2 / 3, cy + (qy - cy) * 2 / 3)} ${P(x + (qx - x) * 2 / 3, y + (qy - y) * 2 / 3)} ${P(x, y)} c `;
            cx = x; cy = y;
          } else d += 'h ';
        }
        pen += gl.xa * it.k;
      }
    }
    if (d) this.w(`q /${g.name} gs ${pdfNum(c)} ${pdfNum(c)} ${pdfNum(-c)} ${pdfNum(c)} ${this.X(op.x)} ${this.Y(op.y)} cm ${col.c} rg ${d}f Q`);
  }
  async finish() {
    if (this.pending) await Promise.all(this.pending);
    const r = this.res;
    const dict = (m, k) => m.size ? ` /${k} << ${Array.from(m).map(([n, id]) => `/${n} ${id} 0 R`).join(' ')} >>` : '';
    return { content: this.out.join('\n'), resources: `<<${dict(r.font, 'Font')}${dict(r.xobj, 'XObject')}${dict(r.gs, 'ExtGState')}${dict(r.pat, 'Pattern')} >>` };
  }
}

/* ---------- pictures ---------- */
function jpegInfo(u8) {
  if (u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
  let p = 2, orient = 1;
  while (p + 4 < u8.length) {
    if (u8[p] !== 0xFF) { p++; continue; }
    const mk = u8[p + 1], len = (u8[p + 2] << 8) | u8[p + 3];
    if (mk === 0xE1 && u8[p + 4] === 0x45 && u8[p + 5] === 0x78) {
      // EXIF orientation: the page shows the picture turned, so it must be re-drawn
      const t = p + 10, le = u8[t] === 0x49;
      const r16 = o => le ? u8[t + o] | (u8[t + o + 1] << 8) : (u8[t + o] << 8) | u8[t + o + 1];
      const r32 = o => le ? (u8[t + o] | (u8[t + o + 1] << 8) | (u8[t + o + 2] << 16) | (u8[t + o + 3] << 24)) >>> 0 : ((u8[t + o] << 24) | (u8[t + o + 1] << 16) | (u8[t + o + 2] << 8) | u8[t + o + 3]) >>> 0;
      try { const ifd = r32(4), n = r16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (r16(e) === 0x112) orient = r16(e + 8); } } catch { }
    }
    if ((mk >= 0xC0 && mk <= 0xC3) || (mk >= 0xC5 && mk <= 0xC7) || (mk >= 0xC9 && mk <= 0xCB) || (mk >= 0xCD && mk <= 0xCF)) {
      return { h: (u8[p + 5] << 8) | u8[p + 6], w: (u8[p + 7] << 8) | u8[p + 8], comps: u8[p + 9], orient };
    }
    p += 2 + len;
  }
  return null;
}
function dataUrlBytes(url) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url || '');
  if (!m || !m[2]) return null;
  return { type: (m[1] || '').toLowerCase(), bytes: b64ToBytes(m[3]) };
}
async function pdfImage(doc, el, dispW, dispH, opt = {}) {
  const key = opt.key || el.currentSrc || el.src;
  if (!key) return null;
  const cached = doc.images.get(key);
  if (cached) return cached;
  const id = doc.alloc(), name = 'Im' + id;
  const rec = { id, name };
  doc.images.set(key, rec);
  try {
    const d = !opt.scale && dataUrlBytes(el.currentSrc || el.src);
    if (d && d.type === 'image/jpeg') {
      const info = jpegInfo(d.bytes);
      if (info && (info.comps === 1 || info.comps === 3) && info.orient === 1 && info.w && info.h) {
        await doc.stream(id, `/Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace /${info.comps === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode`, d.bytes, false);
        return rec;
      }
    }
    // everything else is drawn at its own size (up to 300 dpi where it is shown) and kept lossless
    const nw = el.naturalWidth || el.width || 1, nh = el.naturalHeight || el.height || 1;
    let w = nw, h = nh;
    const maxW = dispW * PT / 72 * 300, maxH = dispH * PT / 72 * 300;
    if (opt.scale) { w = Math.max(1, Math.round(dispW * opt.scale)); h = Math.max(1, Math.round(dispH * opt.scale)); }
    else if (w > maxW * 1.25 && h > maxH * 1.25) { const s = Math.max(maxW / w, maxH / h); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
    const big = 4000;
    if (w > big || h > big) { const s = big / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(el, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    let alpha = false;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { alpha = true; break; }
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0, o = 0; i < px.length; i += 4) { rgb[o++] = px[i]; rgb[o++] = px[i + 1]; rgb[o++] = px[i + 2]; }
    let smask = '';
    if (alpha) {
      const sid = doc.alloc();
      const a = new Uint8Array(w * h);
      for (let i = 3, o = 0; i < px.length; i += 4) a[o++] = px[i];
      await doc.stream(sid, `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8`, a);
      smask = ` /SMask ${sid} 0 R`;
    }
    // large opaque photographs are far smaller as JPEG
    if (!alpha && w * h > 600000 && !opt.scale) {
      const j = await encodeJpeg(cv, 0.92);
      await doc.stream(id, `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, j.data, false);
      return rec;
    }
    await doc.stream(id, `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8${smask}`, rgb);
    return rec;
  } catch (e) {
    console.warn('picture skipped in PDF', e);
    doc.images.delete(key);
    return null;
  }
}
/* text drawn by the browser, as a colour shape with soft edges */
async function maskImage(doc, cv, color) {
  const w = cv.width, h = cv.height;
  const px = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  let any = false;
  for (let i = 3, o = 0; i < px.length; i += 4) { a[o++] = px[i]; if (px[i]) any = true; }
  if (!any) return null;
  const [r, g, b] = rgbaOf(color);
  const rgb = new Uint8Array(w * h * 3);
  for (let o = 0; o < rgb.length; o += 3) { rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b; }
  const id = doc.alloc(), sid = doc.alloc();
  await doc.stream(sid, `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8`, a);
  await doc.stream(id, `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${sid} 0 R`, rgb);
  return { id, name: 'Im' + id };
}

/* ---------- the whole document ---------- */
async function buildVectorPdf(opts = {}, onProgress) {
  Images.deselect();
  const view = S.view === 'web' ? 'web' : null;
  if (view) setView('print');
  if (document.activeElement && S.editor.contains(document.activeElement)) document.activeElement.blur();
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(Array.from(S.editor.querySelectorAll('img')).map(im => (im.decode ? im.decode().catch(() => { }) : null)));
    Layout.full();
    await yieldTask();
    const P = await collectPaint();
    const from = Math.max(1, opts.from || 1), to = Math.min(S.pages, opts.to || S.pages);
    // the pages in order: a range, or a list from Print (repeats for copies, -1 a blank back)
    const order = Array.isArray(opts.pages) ? opts.pages.filter(i => i < S.pages) : Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from - 1 + k);
    const distinct = Array.from(new Set(order.filter(i => i >= 0)));
    PdfFontFiles.reset();
    const doc = new PdfDoc();
    const setter = new TextSetter(doc);
    const pageOpsList = [];
    for (const i of distinct) pageOpsList.push([(P.sheetOps[i] || []).slice().sort((a, b) => a.layer - b.layer), pageOps(P, i)]);
    await setter.preload(pageOpsList.flat(2));
    const pageIds = [], pageRefs = new Map(), built = new Map();
    const stats = { pictureWords: 0, words: 0 };
    for (let n = 0; n < pageOpsList.length; n++) {
      const i = distinct[n];
      const pw = new PdfPageWriter(doc, setter, P, i);
      if (S.doc.page.color && !/^#?f{6}$/i.test(S.doc.page.color.replace('#', ''))) pw.w(`q ${pw.fill(S.doc.page.color)} 0 0 ${pdfNum(pw.W)} ${pdfNum(pw.H)} re f Q`);
      for (const list of pageOpsList[n]) for (const op of list) {
        if (op.t === 'text') stats.words++;
        await pw.op(op);
      }
      const { content, resources } = await pw.finish();
      const cid = doc.alloc();
      await doc.stream(cid, '', content);
      built.set(i, { cid, resources, W: pw.W, H: pw.H });
      if (onProgress) onProgress((n + 1) / pageOpsList.length);
      await yieldTask();
    }
    // page objects in order; a repeated page shares its content, a blank one has none
    let lastSize = [Pages.g(0).w * PT, Pages.g(0).h * PT];
    for (const i of order) {
      const pid = doc.alloc();
      pageIds.push(pid);
      // a blank back is the size of the page it is behind
      if (i < 0) { doc.obj(pid, `<< /Type /Page /Parent ${doc.pagesId} 0 R /MediaBox [0 0 ${pdfNum(lastSize[0])} ${pdfNum(lastSize[1])}] /Resources << >> >>`); continue; }
      const pb = built.get(i);
      lastSize = [pb.W, pb.H];
      if (!pageRefs.has(i)) pageRefs.set(i, pid);
      const annots = [];
      for (const l of pageLinks(P, i)) {
        const id = doc.alloc();
        const url = /^[\x20-\x7E]*$/.test(l.url) ? l.url : encodeURI(l.url);
        doc.obj(id, `<< /Type /Annot /Subtype /Link /Rect [${pdfNum(l.x * PT)} ${pdfNum(pb.H - (l.y + l.h) * PT)} ${pdfNum((l.x + l.w) * PT)} ${pdfNum(pb.H - l.y * PT)}] /Border [0 0 0] /A << /S /URI /URI ${pdfLiteral(url)} >> >>`);
        annots.push(id);
      }
      doc.obj(pid, `<< /Type /Page /Parent ${doc.pagesId} 0 R /MediaBox [0 0 ${pdfNum(pb.W)} ${pdfNum(pb.H)}] /Resources ${pb.resources} /Contents ${pb.cid} 0 R${annots.length ? ` /Annots [${annots.map(a => a + ' 0 R').join(' ')}]` : ''} >>`);
    }
    // bookmarks from headings, as Word makes them
    const outline = opts.bookmarks === false ? [] : (P.heads || []).map(hd => {
      const pi = Pages.at(hd.y);
      if (!pageRefs.has(pi)) return null;
      return { level: hd.level, text: hd.text, page: pageRefs.get(pi), top: Pages.g(pi).h * PT - (hd.y - Pages.top(pi)) * PT + 4 };
    }).filter(Boolean);
    const blob = await doc.finish(pageIds, { title: opts.title, author: opts.author, subject: opts.subject, keywords: opts.keywords, lang: opts.lang, print: opts.print }, outline);
    stats.pictureWords = setter.pictures.length;
    stats.localOnly = Array.from(setter.localOnly);
    stats.fontErrors = Array.from(PdfFontFiles.failed);
    stats.pictures = setter.pictures.slice(0, 40);
    blob.stats = stats;
    return blob;
  } finally {
    if (view) setView(view);
  }
}
