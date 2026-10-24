/* ===================== PDF writer =====================
   Each page is one lossless image (Flate, PNG "Up" prediction, grey when the page has
   no colour) with an invisible text layer on top, so text can be selected, searched
   and copied in any script. The text layer uses a tiny embedded font with no visible
   glyphs, the same approach OCR tools use. Links become clickable annotations. */
async function deflateBytes(u8) {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([u8]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function encodeJpeg(cv, q) {
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', q));
  return { data: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height, comps: 3, filter: 'dct' };
}
async function encodeCanvas(cv, q = 0.92) {
  const w = cv.width, h = cv.height;
  if (typeof CompressionStream === 'undefined') return encodeJpeg(cv, q);
  const px = cv.getContext('2d').getImageData(0, 0, w, h).data;
  let gray = true;
  for (let i = 0; i < px.length; i += 4) if (px[i] !== px[i + 1] || px[i] !== px[i + 2]) { gray = false; break; }
  const stride = w * 4;
  let out, comps, bpc;
  if (gray) {
    // 16 grey levels are plenty for anti-aliased text and halve the data
    comps = 1; bpc = 4;
    const rowLen = (w + 1) >> 1;
    const rows = new Uint8Array(rowLen * h);
    for (let y = 0; y < h; y++) {
      const r = y * stride, o = y * rowLen;
      for (let x = 0; x < w; x += 2) {
        const a = ((px[r + x * 4] + 8) / 17) | 0;
        const b2 = x + 1 < w ? ((px[r + (x + 1) * 4] + 8) / 17) | 0 : 15;
        rows[o + (x >> 1)] = (a << 4) | b2;
      }
    }
    out = new Uint8Array((rowLen + 1) * h);
    for (let y = 0, o = 0; y < h; y++) {
      out[o++] = 2; // PNG "Up" filter: each byte minus the byte above
      const r = y * rowLen;
      if (y) for (let x = 0; x < rowLen; x++) out[o++] = (rows[r + x] - rows[r + x - rowLen]) & 255;
      else for (let x = 0; x < rowLen; x++) out[o++] = rows[x];
    }
  } else {
    comps = 3; bpc = 8;
    out = new Uint8Array((w * 3 + 1) * h);
    let o = 0;
    for (let y = 0; y < h; y++) {
      out[o++] = 2;
      const r = y * stride;
      if (y) for (let x = 0; x < w; x++) { const p = r + x * 4; out[o++] = (px[p] - px[p - stride]) & 255; out[o++] = (px[p + 1] - px[p + 1 - stride]) & 255; out[o++] = (px[p + 2] - px[p + 2 - stride]) & 255; }
      else for (let x = 0; x < w; x++) { const p = r + x * 4; out[o++] = px[p]; out[o++] = px[p + 1]; out[o++] = px[p + 2]; }
    }
  }
  const data = await deflateBytes(out);
  // photo-heavy pages compress far better as JPEG
  if (data.length > 1500000) { const j = await encodeJpeg(cv, q); if (j.data.length < data.length) return j; }
  return { data, w, h, comps, bpc, filter: 'flate' };
}

/* A TrueType font with two empty glyphs, every advance 500/1000 em. With probe set, every
   code point maps to an empty glyph 1.738 em wide (a cmap format 13 group): a font that
   "has" every character, used to see whether the browser drew a character in another font. */
function glyphlessFont(probe) {
  const be = { u16: (a, v) => a.push((v >> 8) & 255, v & 255), u32: (a, v) => a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255) };
  const u16 = (a, v) => be.u16(a, v & 0xFFFF), u32 = be.u32;
  const T = {};
  let t = [];
  // OS/2 version 4
  u16(t, 4); u16(t, 500); u16(t, 400); u16(t, 5); u16(t, 0);
  for (const v of [650, 600, 0, 75, 650, 600, 0, 350, 50, 250, 0]) u16(t, v);
  for (let i = 0; i < 10; i++) t.push(0);
  u32(t, 1); u32(t, 0); u32(t, 0); u32(t, 0);
  t.push(78, 79, 78, 69); // 'NONE'
  u16(t, 0x40); u16(t, 0xFFFF); u16(t, 0xFFFF);
  u16(t, 800); u16(t, -200); u16(t, 0); u16(t, 800); u16(t, 200);
  u32(t, 1); u32(t, 0);
  u16(t, 500); u16(t, 700); u16(t, 0); u16(t, 32); u16(t, 0);
  T['OS/2'] = t;
  // cmap: one format 4 subtable with only the closing segment
  t = []; u16(t, 0); u16(t, probe ? 2 : 1); u16(t, 3); u16(t, 1); u32(t, probe ? 20 : 12);
  if (probe) { u16(t, 3); u16(t, 10); u32(t, 44); }
  u16(t, 4); u16(t, 24); u16(t, 0); u16(t, 2); u16(t, 2); u16(t, 0); u16(t, 0);
  u16(t, 0xFFFF); u16(t, 0); u16(t, 0xFFFF); u16(t, 1); u16(t, 0);
  if (probe) { u16(t, 13); u16(t, 0); u32(t, 28); u32(t, 0); u32(t, 1); u32(t, 0x20); u32(t, 0x10FFFF); u32(t, 1); }
  T.cmap = t;
  T.glyf = [0, 0, 0, 0];
  t = [];
  u32(t, 0x00010000); u32(t, 0x00010000); u32(t, 0); u32(t, 0x5F0F3CF5);
  u16(t, 0x000B); u16(t, 1000);
  u32(t, 0); u32(t, 0); u32(t, 0); u32(t, 0);
  u16(t, 0); u16(t, -200); u16(t, 500); u16(t, 800);
  u16(t, 0); u16(t, 7); u16(t, 2); u16(t, 0); u16(t, 0);
  T.head = t;
  t = [];
  u32(t, 0x00010000); u16(t, 800); u16(t, -200); u16(t, 0); u16(t, 500);
  u16(t, 0); u16(t, 0); u16(t, 500); u16(t, 1); u16(t, 0); u16(t, 0);
  u16(t, 0); u16(t, 0); u16(t, 0); u16(t, 0); u16(t, 0); u16(t, 2);
  T.hhea = t;
  t = []; u16(t, 500); u16(t, 0); u16(t, probe ? 1738 : 500); u16(t, 0); T.hmtx = t;
  t = []; u16(t, 0); u16(t, 0); u16(t, 0); T.loca = t;
  t = []; u32(t, 0x00010000); u16(t, 2); for (const v of [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]) u16(t, v); T.maxp = t;
  // name: family, subfamily, full and PostScript names
  const nm = probe ? 'FolioProbe' : 'GlyphLessFont';
  const names = [[1, nm], [2, 'Regular'], [4, nm], [6, nm]];
  t = []; u16(t, 0); u16(t, names.length); u16(t, 6 + 12 * names.length);
  const store = [];
  for (const [id, str] of names) {
    u16(t, 3); u16(t, 1); u16(t, 0x409); u16(t, id); u16(t, str.length * 2); u16(t, store.length);
    for (let i = 0; i < str.length; i++) u16(store, str.charCodeAt(i));
  }
  T.name = t.concat(store);
  t = []; u32(t, 0x00030000); u32(t, 0); u16(t, -100); u16(t, 50); u32(t, 0); u32(t, 0); u32(t, 0); u32(t, 0); u32(t, 0);
  T.post = t;
  const tags = Object.keys(T).sort();
  const n = tags.length;
  let es = 0; while ((1 << (es + 1)) <= n) es++;
  const sr = (1 << es) * 16;
  const head = []; u32(head, 0x00010000); u16(head, n); u16(head, sr); u16(head, es); u16(head, n * 16 - sr);
  const checksum = bytes => { let s = 0; for (let i = 0; i < bytes.length; i += 4) s = (s + ((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0))) >>> 0; return s; };
  let off = 12 + n * 16;
  const dir = [], body = [];
  for (const tag of tags) {
    const data = T[tag];
    for (let i = 0; i < 4; i++) dir.push(tag.charCodeAt(i));
    u32(dir, checksum(data)); u32(dir, off); u32(dir, data.length);
    const padded = data.concat(new Array((4 - (data.length % 4)) % 4).fill(0));
    body.push(...padded);
    off += padded.length;
  }
  const font = new Uint8Array(head.concat(dir, body));
  // head.checkSumAdjustment makes the whole file sum to 0xB1B0AFBA
  const headOff = 12 + n * 16 + tags.slice(0, tags.indexOf('head')).reduce((a, k) => a + Math.ceil(T[k].length / 4) * 4, 0);
  const adj = (0xB1B0AFBA - checksum(font)) >>> 0;
  font[headOff + 8] = adj >>> 24; font[headOff + 9] = (adj >>> 16) & 255; font[headOff + 10] = (adj >>> 8) & 255; font[headOff + 11] = adj & 255;
  return font;
}
function toUnicodeCMap() {
  const ranges = [];
  for (let hi = 0; hi < 256; hi++) {
    if (hi >= 0xD8 && hi <= 0xDF) continue; // surrogates never appear on their own
    const x = hi.toString(16).padStart(2, '0').toUpperCase();
    ranges.push(`<${x}00> <${x}FF> <${x}00>`);
  }
  let blocks = '';
  for (let i = 0; i < ranges.length; i += 100) { const part = ranges.slice(i, i + 100); blocks += `${part.length} beginbfrange\n${part.join('\n')}\nendbfrange\n`; }
  return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${blocks}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
}
function pdfText(s) { let x = '<FEFF'; for (let i = 0; i < s.length; i++) x += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase(); return x + '>'; }
function pdfLiteral(s) { return '(' + String(s).replace(/[\\()]/g, m => '\\' + m) + ')'; }
function pdfNum(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); }
/* only BMP characters go in the text layer; each becomes one two-byte code */
function textLayerHex(s) {
  let hex = '', n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDFFF) continue;
    hex += c.toString(16).padStart(4, '0');
    n++;
  }
  return { hex, n };
}

/* A PDF made for printing tells the viewer's print dialog how: actual size (no shrinking),
   one or two sides, and, when asked, opens that dialog as soon as the file is opened (a
   document script that Chrome, Edge, Firefox and Acrobat run; others ignore it). Copies are
   pages in the file, so they print everywhere. */
function pdfPrintPrefs(pr) {
  if (!pr) return { prefs: '', open: '' };
  const prefs = ' /PrintScaling /None /Duplex /' + (pr.duplex === 'long' ? 'DuplexFlipLongEdge' : pr.duplex === 'short' ? 'DuplexFlipShortEdge' : 'Simplex');
  const open = pr.autoPrint ? ' /OpenAction << /S /JavaScript /JS (this.print\\({bUI: true, bSilent: false, bShrinkToFit: false}\\);) >>' : '';
  return { prefs, open };
}
async function buildPdf(pages, meta = {}) {
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = [];
  const push = d => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); offset += b.length; };
  let next = 1;
  const alloc = () => next++;
  const obj = (id, dict) => { offsets[id] = offset; push(`${id} 0 obj\n${dict}\nendobj\n`); };
  const stream = (id, dict, data) => { offsets[id] = offset; push(`${id} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`); push(data); push('\nendstream\nendobj\n'); };

  push('%PDF-1.4\n%');
  push(new Uint8Array([0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  const catalog = alloc(), pagesId = alloc();
  const hasText = pages.some(p => p.words && p.words.length);
  let fontId = 0;
  if (hasText && typeof CompressionStream !== 'undefined') {
    fontId = alloc();
    const cid = alloc(), fd = alloc(), ff = alloc(), map = alloc(), tu = alloc();
    obj(fontId, `<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    obj(cid, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GlyphLessFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fd} 0 R /DW 500 /CIDToGIDMap ${map} 0 R >>`);
    obj(fd, '<< /Type /FontDescriptor /FontName /GlyphLessFont /Flags 4 /FontBBox [0 -200 500 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 ' + ff + ' 0 R >>');
    const ttf = glyphlessFont();
    stream(ff, `/Length1 ${ttf.length}`, ttf);
    const gid = new Uint8Array(131072);
    for (let i = 1; i < gid.length; i += 2) gid[i] = 1;
    stream(map, '/Filter /FlateDecode', await deflateBytes(gid));
    stream(tu, '/Filter /FlateDecode', await deflateBytes(enc.encode(toUnicodeCMap())));
  }
  const pageIds = [];
  for (const p of pages) {
    // a blank back (two-sided copies start on a new sheet)
    if (p.blank) { const pid = alloc(); pageIds.push(pid); obj(pid, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pdfNum(p.wPt)} ${pdfNum(p.hPt)}] /Resources << >> >>`); continue; }
    const pid = alloc(), imId = alloc(), csId = alloc();
    pageIds.push(pid);
    const W = p.wPt, H = p.hPt;
    const px2pt = 0.75;
    // text layer
    let cs = `q ${pdfNum(W)} 0 0 ${pdfNum(H)} 0 0 cm /Im0 Do Q\n`;
    if (fontId && p.words && p.words.length) {
      cs += 'BT\n3 Tr\n';
      let size = -1, tz = -1;
      for (const w of p.words) {
        const s = w.space ? w.s + ' ' : w.s;
        const { hex, n } = textLayerHex(s);
        if (!n) continue;
        const sz = Math.max(1, Math.round(w.size * px2pt * 100) / 100);
        const width = (w.w + (w.space ? (w.gap || 0) : 0)) * px2pt;
        if (width <= 0) continue;
        const scale = Math.max(1, Math.min(1000, Math.round(100 * width / (n * 0.5 * sz) * 100) / 100));
        if (sz !== size) { cs += `/F1 ${pdfNum(sz)} Tf\n`; size = sz; }
        if (scale !== tz) { cs += `${pdfNum(scale)} Tz\n`; tz = scale; }
        cs += `1 0 0 1 ${pdfNum(w.x * px2pt)} ${pdfNum(H - w.y * px2pt)} Tm <${hex}> Tj\n`;
      }
      cs += 'ET\n';
    }
    const csData = typeof CompressionStream !== 'undefined' ? await deflateBytes(enc.encode(cs)) : enc.encode(cs);
    const annots = [];
    for (const l of p.links || []) {
      const id = alloc();
      const url = /^[\x20-\x7E]*$/.test(l.url) ? l.url : encodeURI(l.url);
      obj(id, `<< /Type /Annot /Subtype /Link /Rect [${pdfNum(l.x * px2pt)} ${pdfNum(H - (l.y + l.h) * px2pt)} ${pdfNum((l.x + l.w) * px2pt)} ${pdfNum(H - l.y * px2pt)}] /Border [0 0 0] /A << /S /URI /URI ${pdfLiteral(url)} >> >>`);
      annots.push(id);
    }
    const res = `<< /XObject << /Im0 ${imId} 0 R >>${fontId ? ` /Font << /F1 ${fontId} 0 R >>` : ''} >>`;
    obj(pid, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pdfNum(W)} ${pdfNum(H)}] /Resources ${res} /Contents ${csId} 0 R${annots.length ? ` /Annots [${annots.map(a => a + ' 0 R').join(' ')}]` : ''} >>`);
    const im = p.img;
    if (im.filter === 'dct') stream(imId, `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, im.data);
    else { const bpc = im.bpc || 8; stream(imId, `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${im.comps === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent ${bpc} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${im.comps} /BitsPerComponent ${bpc} /Columns ${im.w} >>`, im.data); }
    stream(csId, typeof CompressionStream !== 'undefined' ? '/Filter /FlateDecode' : '', csData);
  }
  obj(pagesId, `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
  const pp = pdfPrintPrefs(meta.print);
  obj(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /DisplayDocTitle true${pp.prefs} >>${pp.open}${meta.lang ? ` /Lang ${pdfLiteral(meta.lang)}` : ''} >>`);
  const info = alloc();
  const d = new Date();
  const pad = v => String(v).padStart(2, '0');
  const dt = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  obj(info, `<< /Title ${pdfText(meta.title || 'Document')} /Author ${pdfText(meta.author || '')} /Producer (Folio) /CreationDate (${dt}) >>`);
  const xref = offset;
  let x = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let k = 1; k < next; k++) x += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${next} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
