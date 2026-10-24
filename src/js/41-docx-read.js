/* ===================== .docx reader ===================== */
const WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DML = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WPD = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const WPS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
const WPG = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup';
const HL_HEX = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff' };
const wa = (el, n) => el ? (el.getAttributeNS(WNS, n) ?? el.getAttribute('w:' + n)) : null;
const ra = (el, n) => el ? (el.getAttributeNS(RNS, n) ?? el.getAttribute('r:' + n)) : null;
const wkids = (el, n) => el ? Array.from(el.children).filter(k => k.localName === n) : [];
const wkid = (el, n) => el ? Array.from(el.children).find(k => k.localName === n) || null : null;
const onOff = el => { if (!el) return null; const v = wa(el, 'val'); return !(v === '0' || v === 'false' || v === 'off' || v === 'none'); };
const twToPx = v => (parseFloat(v) || 0) / 15;

function parseRPr(r) {
  const o = {};
  if (!r) return o;
  const f = wkid(r, 'rFonts');
  if (f) { o.font = wa(f, 'ascii') || wa(f, 'hAnsi') || null; o.csFont = wa(f, 'cs') || null; }
  const b = wkid(r, 'b'); if (b) o.bold = onOff(b);
  const i = wkid(r, 'i'); if (i) o.italic = onOff(i);
  const u = wkid(r, 'u'); if (u) { const v = wa(u, 'val') || 'single'; o.underline = v === 'none' ? false : v; }
  const s = wkid(r, 'strike'); if (s) o.strike = onOff(s);
  const ds = wkid(r, 'dstrike'); if (ds && onOff(ds)) o.strike = true;
  const c = wkid(r, 'color'); if (c) { const v = wa(c, 'val'); if (v && v !== 'auto') o.color = '#' + v.toLowerCase(); else if (v === 'auto') o.color = 'auto'; }
  const sz = wkid(r, 'sz'); if (sz) o.size = parseFloat(wa(sz, 'val')) / 2;
  const hl = wkid(r, 'highlight'); if (hl) { const v = wa(hl, 'val'); if (v && v !== 'none') o.bg = HL_HEX[v] || null; }
  const shd = wkid(r, 'shd');
  if (shd) {
    const sp = shdFromWord(shd);
    if (sp && sp.pat !== 'clear') { o.shdPat = sp; if (!o.bg) o.bg = shdColor(sp); }
    else { const fill = wa(shd, 'fill'); if (fill && fill !== 'auto' && !o.bg) o.bg = '#' + fill.toLowerCase(); }
  }
  const rb = wkid(r, 'bdr'); if (rb) { const b = bdrFromWord(rb); if (b) { o.bdr = b; o.bdrShadow = /^(1|true|on)$/.test(wa(rb, 'shadow') || ''); } }
  const va = wkid(r, 'vertAlign'); if (va) o.vert = wa(va, 'val');
  const caps = wkid(r, 'caps'); if (caps) o.caps = onOff(caps);
  const sc = wkid(r, 'smallCaps'); if (sc) o.smallCaps = onOff(sc);
  const sp = wkid(r, 'spacing'); if (sp) o.spacing = parseFloat(wa(sp, 'val')) / 20;
  const vanish = wkid(r, 'vanish'); if (vanish) o.hidden = onOff(vanish);
  const rs = wkid(r, 'rStyle'); if (rs) o.rStyle = wa(rs, 'val');
  return o;
}
function parsePPr(p) {
  const o = {};
  if (!p) return o;
  const tabs = wkid(p, 'tabs');
  if (tabs) {
    o.tabs = [];
    for (const t of wkids(tabs, 'tab')) { if (wa(t, 'val') === 'decimal') o.decTab = parseFloat(wa(t, 'pos')) || 0; o.tabs.push({ val: wa(t, 'val') || 'left', pos: parseFloat(wa(t, 'pos')) || 0 }); }
  }
  const jc = wkid(p, 'jc'); if (jc) { const v = wa(jc, 'val'); o.align = v === 'center' ? 'center' : (v === 'right' || v === 'end') ? 'right' : (v === 'both' || v === 'distribute') ? 'justify' : 'left'; }
  const ind = wkid(p, 'ind');
  if (ind) {
    const l = wa(ind, 'left') ?? wa(ind, 'start'), r = wa(ind, 'right') ?? wa(ind, 'end'), fl = wa(ind, 'firstLine'), hg = wa(ind, 'hanging');
    if (l != null) o.left = twToPx(l);
    if (r != null) o.right = twToPx(r);
    if (fl != null) o.first = twToPx(fl);
    if (hg != null) o.first = -twToPx(hg);
  }
  const sp = wkid(p, 'spacing');
  if (sp) {
    const b = wa(sp, 'before'), a = wa(sp, 'after'), line = wa(sp, 'line'), rule = wa(sp, 'lineRule');
    if (b != null && wa(sp, 'beforeAutospacing') !== '1') o.before = parseFloat(b) / 20;
    if (a != null && wa(sp, 'afterAutospacing') !== '1') o.after = parseFloat(a) / 20;
    if (line != null) { if (!rule || rule === 'auto') o.line = Math.round(parseFloat(line) / 240 * 100) / 100; else o.lineExact = parseFloat(line) / 20; }
  }
  const shd = wkid(p, 'shd');
  if (shd) {
    const sp = shdFromWord(shd);
    if (sp && sp.pat !== 'clear') { o.shdPat = sp; o.bg = shdColor(sp); }
    else { const f = wa(shd, 'fill'); if (f && f !== 'auto' && f.toLowerCase() !== 'ffffff') o.bg = '#' + f.toLowerCase(); }
  }
  const bdr = wkid(p, 'pBdr');
  if (bdr) {
    const B = { space: {}, shadow: false };
    for (const [s, alt] of [['top'], ['bottom'], ['left', 'start'], ['right', 'end'], ['between']]) {
      const e = wkid(bdr, s) || (alt ? wkid(bdr, alt) : null);
      const b = bdrFromWord(e);
      if (!b) continue;
      B[s] = b;
      B.space[s] = parseFloat(wa(e, 'space')) || 0;
      if (/^(1|true|on)$/.test(wa(e, 'shadow') || '')) B.shadow = true;
    }
    if (B.top || B.bottom || B.left || B.right || B.between) o.pbdr = B;
  }
  const ps = wkid(p, 'pStyle'); if (ps) o.style = wa(ps, 'val');
  const num = wkid(p, 'numPr'); if (num) { const id = wa(wkid(num, 'numId'), 'val'), lv = wa(wkid(num, 'ilvl'), 'val'); if (id != null) o.numId = id; if (lv != null) o.ilvl = parseInt(lv, 10) || 0; }
  if (wkid(p, 'pageBreakBefore') && onOff(wkid(p, 'pageBreakBefore'))) o.pageBreakBefore = true;
  if (wkid(p, 'keepNext')) o.keepNext = true;
  const ol = wkid(p, 'outlineLvl'); if (ol) o.outline = parseInt(wa(ol, 'val'), 10);
  return o;
}

class DocxReader {
  constructor(zip) { this.zip = zip; this.bj = typeof Bijoy !== 'undefined' && Bijoy.auto(); this.styles = {}; this.nums = {}; this.abs = {}; this.rels = {}; this.media = {}; this.comments = {}; this.cmtMap = {}; this.notesOut = {}; this.noteMap = {}; this.noteMarks = { foot: [], end: [] }; this.listCounters = {}; this.bookmarks = {}; }
  async xml(path) { const f = this.zip.file(path); if (!f) return null; const s = await f.async('string'); return new DOMParser().parseFromString(s, 'application/xml'); }
  async loadRels(path) {
    const x = await this.xml(path);
    const out = {};
    if (x) for (const r of x.getElementsByTagName('Relationship')) out[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type') || '', external: r.getAttribute('TargetMode') === 'External' };
    return out;
  }
  async read() {
    const doc = await this.xml('word/document.xml');
    if (!doc) throw new Error('This file is not a Word document (word/document.xml is missing).');
    this.rels = await this.loadRels('word/_rels/document.xml.rels');
    await this.readStyles();
    await this.readTheme();
    await this.readNumbering();
    await this.readComments();
    await this.readNotes();
    const body = doc.getElementsByTagNameNS(WNS, 'body')[0];
    const out = document.createElement('div');
    this.listState = null;
    this.sectList = [];
    this.blocks(body, out, { rels: this.rels, base: 'word/', body: true });
    const sect = this.lastSect || wkid(body, 'sectPr');
    // every section's settings; the first section's are the document's own
    const all = this.sectList.concat([sect]);
    const infos = [];
    for (const sp of all) infos.push(await this.readSection(sp));
    const settings = infos[0];
    const sx = await this.xml('word/settings.xml');
    this.folioPn(sx, infos);
    this.sections(out, all, infos, settings);
    const eo = sx && sx.getElementsByTagNameNS(WNS, 'evenAndOddHeaders')[0];
    if (eo && !/^(0|false|off)$/.test(wa(eo, 'val') || '')) settings.evenDiff = true;
    // the document's own paragraph styles
    if (this.ownStyles && Object.keys(this.ownStyles).length) settings.styles = this.ownStylesOut();
    // Word's look for Normal, Heading 1–6, Title and Subtitle
    const nl = this.normalLook();
    if (Object.keys(nl).length) (this.builtin = this.builtin || {}).normal = nl;
    if (this.builtin) settings.builtin = this.builtin;
    // footnotes and endnotes: the notes of the marks found, their number formats
    if (Object.keys(this.notesOut).length) {
      settings.notes = this.notesOut;
      const pr = {};
      for (const [kind, tag] of [['foot', 'footnotePr'], ['end', 'endnotePr']]) {
        const el = wkid(sect, tag) || (sx && sx.getElementsByTagNameNS(WNS, tag)[0]);
        const fmt = el && wa(wkid(el, 'numFmt'), 'val'), st = el && parseInt(wa(wkid(el, 'numStart'), 'val') || '', 10);
        const marks = this.noteMarks[kind];
        const f = marks.length && marks.every(m => /^[০-৯]+$/.test(m)) ? 'bn' : ({ decimal: '1', lowerLetter: 'a', upperLetter: 'A', lowerRoman: 'i', upperRoman: 'I', chicago: '*' })[fmt] || null;
        if (f || st > 1) pr[kind] = { fmt: f || (kind === 'end' ? 'i' : '1'), start: st > 1 ? st : 1 };
      }
      if (Object.keys(pr).length) settings.notePr = pr;
    }
    const core = await this.xml('docProps/core.xml');
    if (core) {
      const t = core.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0];
      if (t && t.textContent.trim()) settings.title = t.textContent.trim();
      const cr = core.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator')[0];
      if (cr && cr.textContent.trim()) settings.props = { author: cr.textContent.trim() };
    }
    const bgEl = doc.getElementsByTagNameNS(WNS, 'background')[0];
    if (bgEl && wa(bgEl, 'color') && wa(bgEl, 'color') !== 'auto') settings.pageColor = '#' + wa(bgEl, 'color').toLowerCase();
    settings.comments = Object.values(this.comments).filter(c => c.used);
    const n = this.resolvedP('Normal');
    settings.font = this.plainFont(n.r.font || 'Calibri');
    settings.size = n.r.size || 11;
    settings.after = n.p.after != null ? n.p.after : 0;
    settings.line = n.p.line || 1;
    return { html: out.innerHTML, settings };
  }
  async readStyles() {
    const x = await this.xml('word/styles.xml');
    this.defR = {}; this.defP = {};
    if (!x) return;
    const dd = x.getElementsByTagNameNS(WNS, 'docDefaults')[0];
    if (dd) {
      const rd = dd.getElementsByTagNameNS(WNS, 'rPrDefault')[0], pd = dd.getElementsByTagNameNS(WNS, 'pPrDefault')[0];
      if (rd) this.defR = parseRPr(wkid(rd, 'rPr'));
      if (pd) this.defP = parsePPr(wkid(pd, 'pPr'));
    }
    for (const s of x.getElementsByTagNameNS(WNS, 'style')) {
      const id = wa(s, 'styleId');
      this.styles[id] = { id, type: wa(s, 'type'), raw: wa(wkid(s, 'name'), 'val') || id || '', next: wa(wkid(s, 'next'), 'val'), name: (wa(wkid(s, 'name'), 'val') || id || '').toLowerCase(), basedOn: wa(wkid(s, 'basedOn'), 'val'), r: parseRPr(wkid(s, 'rPr')), p: parsePPr(wkid(s, 'pPr')), def: wa(s, 'default') === '1', tb: tblBordersFromWord(wkid(wkid(s, 'tblPr'), 'tblBorders')) };
      if (this.styles[id].def && this.styles[id].type === 'table') this.defaultTStyle = id;
      if (this.styles[id].def && this.styles[id].type === 'paragraph') this.defaultPStyle = id;
    }
  }
  resolvedP(id) {
    const chain = [];
    let s = this.styles[id || this.defaultPStyle || 'Normal'];
    const seen = new Set();
    while (s && !seen.has(s.id)) { seen.add(s.id); chain.unshift(s); s = this.styles[s.basedOn]; }
    const r = Object.assign({}, this.defR), p = Object.assign({}, this.defP);
    for (const c of chain) { Object.assign(r, c.r); Object.assign(p, c.p); }
    return { r, p, name: chain.length ? chain[chain.length - 1].name : 'normal', chain };
  }
  charStyle(id) {
    const chain = [];
    let s = this.styles[id];
    const seen = new Set();
    while (s && !seen.has(s.id)) { seen.add(s.id); chain.unshift(s); s = this.styles[s.basedOn]; }
    return Object.assign({}, ...chain.map(c => c.r));
  }
  async readNumbering() {
    const x = await this.xml('word/numbering.xml');
    if (!x) return;
    for (const a of x.getElementsByTagNameNS(WNS, 'abstractNum')) {
      const levels = {};
      for (const l of wkids(a, 'lvl')) {
        const il = parseInt(wa(l, 'ilvl'), 10) || 0;
        // Word 2010's custom formats (Bangla digits and letters) sit in mc:AlternateContent
        let nf = wkid(l, 'numFmt');
        const alt = Array.from(l.children).find(k => k.localName === 'AlternateContent');
        if (alt) { const ch = Array.from(alt.children).find(k => k.localName === 'Choice'); const c = ch && Array.from(ch.children).find(k => k.localName === 'numFmt'); if (c) nf = c; else if (!nf) { const fb = Array.from(alt.children).find(k => k.localName === 'Fallback'); nf = fb && Array.from(fb.children).find(k => k.localName === 'numFmt'); } }
        let fmt = wa(nf, 'val') || 'decimal';
        if (fmt === 'custom') { const f = wa(nf, 'format') || ''; fmt = /[০-৯]/.test(f) ? 'bn' : /[ক-হ]/.test(f) ? 'bnAlpha' : 'decimal'; }
        levels[il] = { fmt, text: wa(wkid(l, 'lvlText'), 'val') || '', start: parseInt(wa(wkid(l, 'start'), 'val') || '1', 10) };
      }
      this.abs[wa(a, 'abstractNumId')] = levels;
    }
    for (const n of x.getElementsByTagNameNS(WNS, 'num')) {
      const id = wa(n, 'numId');
      const absId = wa(wkid(n, 'abstractNumId'), 'val');
      const over = {};
      for (const o of wkids(n, 'lvlOverride')) { const so = wkid(o, 'startOverride'); if (so) over[parseInt(wa(o, 'ilvl'), 10) || 0] = parseInt(wa(so, 'val'), 10); }
      this.nums[id] = { absId, over };
    }
  }
  levelInfo(numId, ilvl) {
    const n = this.nums[numId];
    const lv = n && this.abs[n.absId] && this.abs[n.absId][ilvl];
    if (!lv) return { tag: 'ul', type: '' };
    if (lv.fmt === 'bullet' || lv.fmt === 'none') {
      const ch = lv.text || '';
      let type = '';
      if (/^[o◦]$/.test(ch)) type = 'circle';
      else if (/^[▪■§]$/.test(ch)) type = 'square';
      else if (/^[•·]$/.test(ch) || !ch) type = '';
      else if (/^[✓✔]$/.test(ch)) type = '"✓  "';
      else if (/^[➢➤►]$/.test(ch)) type = '"➢  "';
      else if (/^[–-]$/.test(ch)) type = '"–  "';
      else type = '';
      return { tag: 'ul', type };
    }
    const start = n.over[ilvl] != null ? n.over[ilvl] : lv.start;
    // the text around the number: 1.  1)  (1)  ১।  (ক) …
    const pat = String(lv.text || '').replace(/%\d/g, '%');
    const byPat = {
      decimal: { '%.': 'decimal', '%)': 'decimal-paren', '(%)': 'paren-decimal' },
      decimalZero: { '%.': 'decimal-leading-zero' },
      lowerLetter: { '%.': 'lower-alpha', '%)': 'lower-alpha-paren', '(%)': 'paren-lower-alpha' },
      upperLetter: { '%.': 'upper-alpha' },
      lowerRoman: { '%.': 'lower-roman', '%)': 'lower-roman-paren', '(%)': 'paren-lower-roman' },
      upperRoman: { '%.': 'upper-roman' },
      bn: { '%.': 'bengali-dot', '%।': 'bn-dari', '%)': 'bn-close', '(%)': 'bn-paren', '%': 'bengali' },
      bengali: { '%.': 'bengali-dot', '%।': 'bn-dari', '%)': 'bn-close', '(%)': 'bn-paren' },
      bnAlpha: { '%)': 'bn-alpha', '(%)': 'bn-alpha-paren', '%.': 'bn-alpha' },
    };
    const base = { decimal: 'decimal', decimalZero: 'decimal-leading-zero', lowerLetter: 'lower-alpha', upperLetter: 'upper-alpha', lowerRoman: 'lower-roman', upperRoman: 'upper-roman', bn: 'bengali-dot', bengali: 'bengali-dot', bnAlpha: 'bn-alpha' }[lv.fmt] || 'decimal';
    const type = (byPat[lv.fmt] && byPat[lv.fmt][pat]) || base;
    return { tag: 'ol', type, start };
  }
  /* a list numbered 1.1, 1.1.1 (a level's text names the levels above it): Folio's Multilevel List */
  legalOf(numId) {
    const n = this.nums[numId];
    const lv = n && this.abs[n.absId];
    if (!lv || !lv[1] || !/%1\D+%2/.test(lv[1].text || '')) return null;
    return lv[0] && (lv[0].fmt === 'bn' || lv[0].fmt === 'bengali') ? 'bn-legal' : 'legal';
  }
  async readComments() {
    const x = await this.xml('word/comments.xml');
    if (!x) return;
    for (const c of x.getElementsByTagNameNS(WNS, 'comment')) {
      const id = wa(c, 'id');
      const text = Array.from(c.getElementsByTagNameNS(WNS, 'p')).map(p => Array.from(p.getElementsByTagNameNS(WNS, 't')).map(t => t.textContent).join('')).join('\n').trim();
      this.comments[id] = { id: uid('c'), text, author: wa(c, 'author') || '', uid: null, time: Date.parse(wa(c, 'date') || '') || Date.now(), resolved: false, replies: [] };
    }
  }
  /* the notes' text, as HTML, by kind and Word's id (their marks pick them up in run()) */
  async readNotes() {
    for (const kind of ['footnotes', 'endnotes']) {
      const path = this.rels && Object.values(this.rels).find(r => /\/(footnotes|endnotes)$/.test(r.type) && r.type.endsWith('/' + kind));
      const file = path ? this.resolvePath('word/', path.target) : `word/${kind}.xml`;
      const x = await this.xml(file);
      if (!x) continue;
      const rels = await this.loadRels(file.replace(/([^/]+)$/, '_rels/$1.rels'));
      for (const n of x.getElementsByTagNameNS(WNS, kind === 'footnotes' ? 'footnote' : 'endnote')) {
        const t = wa(n, 'type');
        if (t === 'separator' || t === 'continuationSeparator' || t === 'continuationNotice') continue;
        const box = document.createElement('div');
        const keepList = this.listState;
        this.listState = null;
        this.blocks(n, box, { rels, base: file.replace(/[^/]+$/, ''), inNote: true, note: kind === 'endnotes' ? 'end' : 'foot' });
        this.listState = keepList;
        // the space Word puts after the note's number
        const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        const first = w.nextNode();
        if (first) first.data = first.data.replace(/^[\s\u00A0]+/, '');
        this.noteMap[kind + ':' + wa(n, 'id')] = box.innerHTML || '<p><br></p>';
      }
    }
  }
  blocks(container, out, ctx) {
    for (const el of Array.from(container.children)) {
      const n = el.localName;
      if (n === 'p') this.para(el, out, ctx);
      else if (n === 'tbl') { this.closeList(); out.appendChild(this.table(el, ctx)); }
      else if (n === 'sdt') { const c = wkid(el, 'sdtContent'); if (c) this.blocks(c, out, ctx); }
      else if (n === 'customXml' || n === 'smartTag') this.blocks(el, out, ctx);
      else if (n === 'sectPr') this.lastSect = el;
      else if (n === 'altChunk') this.altChunk(el, out, ctx);
      else if (n === 'ins' || n === 'moveTo') this.blocks(el, out, ctx);
    }
    this.closeList();
  }
  async altChunkLoad() { }
  altChunk(el, out, ctx) {
    const rel = ctx.rels[ra(el, 'id')];
    if (!rel) return;
    const holder = h('div', { 'data-altchunk': rel.target });
    out.appendChild(holder);
    (this.pendingAlt = this.pendingAlt || []).push({ holder, path: this.resolvePath(ctx.base, rel.target) });
  }
  resolvePath(base, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = (base + target).split('/');
    const st = [];
    for (const p of parts) { if (p === '..') st.pop(); else if (p && p !== '.') st.push(p); }
    return st.join('/');
  }
  closeList() { this.listState = null; }
  para(p, out, ctx) {
    const ppr = parsePPr(wkid(p, 'pPr'));
    const sty = this.resolvedP(ppr.style);
    const P = Object.assign({}, sty.p, ppr);
    if (wkid(wkid(p, 'pPr'), 'sectPr')) this.midSect = wkid(wkid(p, 'pPr'), 'sectPr');
    const name = sty.name;
    let tag = 'p', cls = '';
    const hm = name.match(/^heading\s*([1-6])$/);
    if (hm) tag = 'h' + hm[1];
    else if (name === 'title') cls = 'title';
    else if (name === 'subtitle') cls = 'subtitle';
    else if (/quote/.test(name)) cls = 'quote';
    else if (name === 'no spacing') cls = 'nospacing';
    else if (/^(code|html preformatted|plain text|source code)/.test(name)) cls = 'code';
    else if (P.outline != null && P.outline < 6 && name !== 'normal' && !/list|toc/.test(name)) tag = 'h' + (P.outline + 1);
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    const numId = P.numId && P.numId !== '0' ? P.numId : null;
    // a paragraph style of the document's own (Body Text, Office Body…): one of Folio's document
    // styles; the paragraph then keeps only its own formatting
    const custom = !hm && !cls && name !== 'normal' && !/^list/.test(name);
    const ownKey = custom && tag === 'p' && !numId && !ctx.hf && !ctx.note && ppr.style && this.styles[ppr.style] ? this.ownStyle(ppr.style, sty) : null;
    if (ownKey) el.className = ownKey;
    // Heading 1–6, Title and Subtitle: Word's look for them becomes the document's style (as far as
    // it differs from Folio's, when the file opens); the paragraphs keep only their own formatting
    const bk = (hm || cls === 'title' || cls === 'subtitle') && !ctx.hf && !ctx.note ? (hm ? 'h' + hm[1] : cls) : null;
    if (bk) this.builtinOf(bk, sty);
    const D = ownKey || bk ? ppr : P;
    // a plain paragraph in the body: what Word's Normal gives it (a justified Normal, its indents)
    // is the Normal style's, not repeated on each paragraph
    const plain = tag === 'p' && !cls && !ownKey && !numId && !ctx.inCell && !ctx.hf && !ctx.note;
    const NP = this.resolvedP('Normal').p, na = NP.align || 'left';
    const css = [];
    if (ownKey || bk) { if (D.align) css.push('text-align:' + D.align); }
    else { const al = D.align || 'left'; if (plain ? al !== na : (al !== 'left' || na !== 'left')) css.push('text-align:' + al); }
    if (!numId && !ctx.inCell) {
      if (plain) {
        if (Math.abs((D.left || 0) - (NP.left || 0)) > 1) css.push(`margin-left:${fmtNum((D.left || 0) * 0.75, 1)}pt`);
        if (D.right && D.right > 1) css.push(`margin-right:${fmtNum(D.right * 0.75, 1)}pt`);
        if (Math.abs((D.first || 0) - (NP.first || 0)) > 1) css.push(`text-indent:${fmtNum((D.first || 0) * 0.75, 1)}pt`);
      } else {
        if (D.left && Math.abs(D.left) > 1 && cls !== 'quote') css.push(`margin-left:${fmtNum(D.left * 0.75, 1)}pt`);
        if (D.right && D.right > 1 && cls !== 'quote') css.push(`margin-right:${fmtNum(D.right * 0.75, 1)}pt`);
        if (D.first && Math.abs(D.first) > 1) css.push(`text-indent:${fmtNum(D.first * 0.75, 1)}pt`);
      }
    }
    if (!ctx.inCell && !numId && !cls && tag === 'p') {
      if (D.before != null && (ownKey || Math.abs(D.before - (ctx.hf || ctx.note ? 0 : this.resolvedP('Normal').p.before || 0)) > 0.4)) css.push(`margin-top:${fmtNum(D.before, 1)}pt`);
      if (D.after != null && (ownKey || Math.abs(D.after - (ctx.hf || ctx.note ? 0 : this.defAfter())) > 0.4)) css.push(`margin-bottom:${fmtNum(D.after, 1)}pt`);
    }
    if (D.line && (ownKey || bk || Math.abs(D.line - (ctx.hf || ctx.note ? 1 : this.resolvedP('Normal').p.line || 1)) > 0.02)) css.push('line-height:' + fmtNum(D.line, 2));
    else if (D.lineExact) css.push(`line-height:${fmtNum(D.lineExact, 1)}pt`);
    if (P.bg) css.push('background-color:' + P.bg);
    if (P.pbdr) {
      const B = P.pbdr;
      for (const s of ['top', 'bottom', 'left', 'right']) if (B[s]) css.push(`border-${s}:${bdrCss(B[s])}`, `padding-${s}:${fmtNum(B.space[s] || 0, 2)}pt`);
      if (B.between) css.push(`--bbtw:${bdrCss(B.between)}`);
      const w = Math.max(...['top', 'bottom', 'left', 'right'].map(k => (B[k] && B[k].width) || 0));
      if (B.shadow && w) css.push(`box-shadow:${fmtNum(Math.max(1.5, w * 2), 2)}pt ${fmtNum(Math.max(1.5, w * 2), 2)}pt 0 0 ${(B.right || B.bottom || B.top || B.left).color}`);
    }
    // a heading's look in a header or a note: carried on the paragraph
    const sr = sty.r, nr = this.resolvedP('Normal').r;
    if ((hm || cls === 'title' || cls === 'subtitle') && !bk) {
      if (sr.size) css.push(`font-size:${fmtNum(sr.size, 1)}pt`);
      if (sr.color && sr.color !== 'auto') css.push('color:' + sr.color);
      if (sr.font && sr.font !== nr.font && !(this.bj && isBijoyFont(sr.font))) css.push('font-family:' + fontStack(sr.font));
      css.push('font-weight:' + (sr.bold ? '700' : '400'));
      if (sr.italic) css.push('font-style:italic');
    }
    if (css.length) el.setAttribute('style', css.join(';'));
    if (P.shdPat) { el.setAttribute('data-shd', P.shdPat.pat); el.setAttribute('data-shdc', P.shdPat.color || '#000000'); el.setAttribute('data-shdf', P.shdPat.fill || 'auto'); decoSync(el); }
    const base = (hm || cls === 'title' || cls === 'subtitle') ? sr : (cls ? sr : Object.assign({}, nr));
    // runs that look like their paragraph style get nothing of their own
    const runBase = ownKey ? Object.assign({}, nr, sr) : custom ? nr : base;
    const extra = custom && !ownKey ? diffRun(sr, nr) : null;
    this.state = { brk: false };
    this.inlineInto(p, el, ctx, runBase, extra, sty.r);
    trimBlock(el);
    // a paragraph added or removed whole with Track Changes: its paragraph mark is marked too
    const pm = wkid(wkid(p, 'pPr'), 'rPr');
    const mk = pm ? (wkid(pm, 'del') ? 'del' : wkid(pm, 'ins') ? 'ins' : null) : null;
    if (mk && el.querySelector(mk + '.tc')) { const c = el.cloneNode(true); c.querySelectorAll(mk + '.tc').forEach(n => n.remove()); if (!c.textContent.replace(/[\u200B\s]/g, '')) el.setAttribute('data-tcb', mk); }
    // a decimal tab in a table cell lines numbers up there, with no tab typed (Word)
    if (P.decTab != null && ctx.inCell && !el.textContent.includes('\t')) { el.setAttribute('data-align', 'decimal'); el.style.textAlign = 'right'; }
    if (!el.firstChild) el.appendChild(document.createElement('br'));
    if (P.pageBreakBefore && !ctx.inCell) { this.closeList(); out.appendChild(h('hr', { class: 'pb' })); }
    // a header's "left ⇥ centre ⇥ right" line: a borderless table of three cells (as Insert › Header)
    const grid = ctx.hf && !ctx.inCell && !numId ? hfTabGrid(el, P) : null;
    if (grid) { this.closeList(); out.appendChild(grid); return; }
    if (numId && !ctx.inNote) this.listItem(el, numId, P.ilvl || 0, out);
    else { this.closeList(); out.appendChild(el); }
    if (this.state.brk && !ctx.inCell) { this.closeList(); out.appendChild(h('hr', { class: 'pb' })); }
    // the end of a section (Word keeps its settings in its last paragraph): a mark, made a section
    // break once every section's settings are read
    const sp = ctx.body && !ctx.inCell && !ctx.inShape ? wkid(wkid(p, 'pPr'), 'sectPr') : null;
    if (sp) {
      this.closeList();
      this.sectList.push(sp);
      out.appendChild(h('hr', { 'data-sect': String(this.sectList.length - 1), 'data-empty': !el.textContent.replace(/[\s\u200B]/g, '') && !el.querySelector('img, span.shp, table') ? '1' : null }));
    }
  }
  defAfter() { const n = this.resolvedP('Normal'); return n.p.after != null ? n.p.after : 0; }
  /* a Bijoy font whose text becomes Unicode leaves the document's English to Times New Roman */
  plainFont(f) { return this.bj && isBijoyFont(f) ? 'Times New Roman' : f; }
  /* Word's look for one of Folio's built-in styles (Heading 1–6, Title, Subtitle), all of it: the
     document keeps what differs from Folio's (Styles.adopt) */
  builtinOf(k, sty) {
    this.builtin = this.builtin || {};
    if (this.builtin[k]) return;
    const r = sty.r, p = sty.p, nr = this.resolvedP('Normal').r;
    const r1 = v => Math.round(v * 10) / 10;
    const o = {
      font: this.plainFont(r.font || nr.font || 'Calibri'), size: r.size || nr.size || 11,
      bold: !!r.bold, italic: !!r.italic, underline: !!(r.underline && r.underline !== 'none'),
      color: r.color && r.color !== 'auto' ? r.color : '#000000',
      align: p.align || 'left', before: r1(p.before || 0), after: r1(p.after || 0),
    };
    if (p.line) o.line = Math.round(p.line * 100) / 100;
    if (p.left && Math.abs(p.left) > 1) o.indent = r1(p.left * 0.75);
    if (p.first && Math.abs(p.first) > 1) o.first = r1(p.first * 0.75);
    this.builtin[k] = o;
  }
  /* Word's Normal: what Folio's Normal style takes from it besides the font, size and spacing */
  normalLook() {
    const n = this.resolvedP('Normal'), o = {};
    if (n.p.align && n.p.align !== 'left') o.align = n.p.align;
    if (n.p.before > 0.4) o.before = Math.round(n.p.before * 10) / 10;
    if (n.p.left && Math.abs(n.p.left) > 1) o.indent = Math.round(n.p.left * 0.75 * 10) / 10;
    if (n.p.first && Math.abs(n.p.first) > 1) o.first = Math.round(n.p.first * 0.75 * 10) / 10;
    if (n.r.color && n.r.color !== 'auto' && !/^#?0{6}$/.test(n.r.color)) o.color = n.r.color;
    if (n.r.bold) o.bold = true;
    if (n.r.italic) o.italic = true;
    return o;
  }
  /* a Word paragraph style as one of Folio's document styles (what it changes from Normal) */
  ownStyle(id, sty) {
    this.ownStyles = this.ownStyles || {};
    if (this.ownStyles[id]) return this.ownStyles[id].key;
    const n = this.resolvedP('Normal'), r = sty.r, p = sty.p, nr = n.r, np = n.p;
    // what the style (or one it's based on, other than Normal) sets itself is kept even where it is
    // what Normal says, as in Word: a justified style stays so when Normal changes
    const exR = {}, exP = {};
    for (const c of sty.chain || []) if (c.id !== 'Normal' && c.id !== this.defaultPStyle) { Object.assign(exR, c.r); Object.assign(exP, c.p); }
    const def = { name: this.styles[id].raw.slice(0, 60) };
    if (r.font && (r.font !== nr.font || exR.font) && !(this.bj && isBijoyFont(r.font))) def.font = r.font;
    if (r.size && (Math.abs(r.size - (nr.size || 11)) > 0.01 || exR.size)) def.size = r.size;
    if (r.bold != null && (!!r.bold !== !!nr.bold || exR.bold != null)) def.bold = !!r.bold;
    if (r.italic != null && (!!r.italic !== !!nr.italic || exR.italic != null)) def.italic = !!r.italic;
    if (r.underline && r.underline !== 'none') def.underline = true;
    if (r.color && r.color !== 'auto' && (r.color !== (nr.color || '#000000') || exR.color)) def.color = r.color;
    if (p.align && (p.align !== (np.align || 'left') || exP.align)) def.align = p.align;
    if (p.line && (Math.abs(p.line - (np.line || 1)) > 0.02 || exP.line)) def.line = Math.round(p.line * 100) / 100;
    if (p.before != null && (Math.abs(p.before - (np.before || 0)) > 0.4 || exP.before != null)) def.before = Math.round(p.before * 10) / 10;
    if (p.after != null && (Math.abs(p.after - this.defAfter()) > 0.4 || exP.after != null)) def.after = Math.round(p.after * 10) / 10;
    if (p.left && Math.abs(p.left) > 1) def.indent = Math.round(p.left * 0.75 * 10) / 10;
    if (p.first && Math.abs(p.first) > 1) def.first = Math.round(p.first * 0.75 * 10) / 10;
    const key = 's-' + uid('').slice(-8).replace(/[^\w]/g, 'x');
    this.ownStyles[id] = { key, def, next: this.styles[id].next };
    return key;
  }
  /* the document's styles found, for S.doc.styles (the next style of each: itself, Normal or another) */
  ownStylesOut() {
    const out = {};
    for (const [id, o] of Object.entries(this.ownStyles || {})) {
      const nx = o.next && o.next !== id ? (this.ownStyles[o.next] ? this.ownStyles[o.next].key : 'normal') : o.key;
      out[o.key] = Object.assign({}, o.def, { next: nx });
    }
    return out;
  }
  listItem(el, numId, ilvl, out) {
    const li = document.createElement('li');
    if (el.getAttribute('style')) li.setAttribute('style', el.getAttribute('style'));
    if (el.hasAttribute('data-tcb')) li.setAttribute('data-tcb', el.getAttribute('data-tcb'));
    if (/^H\d$/.test(el.tagName) || el.className) { li.appendChild(el); }
    else while (el.firstChild) li.appendChild(el.firstChild);
    let st = this.listState;
    if (!st || (st.numId !== numId && ilvl === 0)) {
      const info = this.levelInfo(numId, 0);
      const list = document.createElement(info.tag);
      const legal = info.tag === 'ol' ? this.legalOf(numId) : null;
      if (legal) list.setAttribute('data-ml', legal);
      else if (info.type) list.style.listStyleType = info.type;
      const used = this.listCounters[numId] || 0;
      const start = (info.start || 1) + used;
      if (info.tag === 'ol' && start !== 1) list.setAttribute('start', start);
      out.appendChild(list);
      st = this.listState = { numId, stack: [{ list, lvl: 0 }] };
    }
    if (ilvl === 0) this.listCounters[numId] = (this.listCounters[numId] || 0) + 1;
    let stack = st.stack;
    while (stack.length > 1 && stack[stack.length - 1].lvl > ilvl) stack.pop();
    let top = stack[stack.length - 1];
    while (top.lvl < ilvl) {
      const info = this.levelInfo(numId, top.lvl + 1);
      const list = document.createElement(info.tag);
      if (info.type && !(info.tag === 'ol' && this.legalOf(numId))) list.style.listStyleType = info.type;
      if (info.start && info.start !== 1) list.setAttribute('start', info.start);
      const host = top.list.lastElementChild || top.list.appendChild(h('li'));
      host.appendChild(list);
      top = { list, lvl: top.lvl + 1 };
      stack.push(top);
    }
    top.list.appendChild(li);
  }
  inlineInto(p, el, ctx, base, extra, pStyleR) {
    let cur = el;
    const open = [];
    const fld = { depth: 0, inResult: false, instr: '' };
    const walk = (node, wrap) => {
      for (const k of Array.from(node.children)) {
        const n = k.localName;
        if (n === 'r') this.run(k, wrap || el, ctx, base, extra, fld, open);
        else if (n === 'hyperlink') {
          const rid = ra(k, 'id'), anc = wa(k, 'anchor');
          let href = null;
          if (rid && ctx.rels[rid]) href = ctx.rels[rid].target;
          else if (anc) href = '#' + anc;
          const a = href && cleanHref(href) ? h('a', { href: cleanHref(href) }) : null;
          if (a) { (wrap || el).appendChild(a); walk(k, a); } else walk(k, wrap);
        }
        else if (n === 'ins' || n === 'moveTo') { const ins = h('ins', { class: 'tc' }); if (wa(k, 'author')) ins.setAttribute('data-author', wa(k, 'author')); ins.setAttribute('data-time', String(Date.parse(wa(k, 'date') || '') || Date.now())); (wrap || el).appendChild(ins); walk(k, ins); if (!ins.firstChild) ins.remove(); }
        else if (n === 'del' || n === 'moveFrom') { const del = h('del', { class: 'tc' }); if (wa(k, 'author')) del.setAttribute('data-author', wa(k, 'author')); del.setAttribute('data-time', String(Date.parse(wa(k, 'date') || '') || Date.now())); (wrap || el).appendChild(del); walk(k, del); if (!del.firstChild) del.remove(); }
        else if (n === 'fldSimple' && ctx.hf && hfToken(wa(k, 'instr'))) {
          // a page number, date… in a header or footer: the field, with its run's look around it
          const tmp = document.createElement('span');
          for (const r of wkids(k, 'r')) this.run(r, tmp, ctx, base, extra, { depth: 0, inResult: false, instr: '' }, open);
          const sp = hffSpan(hfToken(wa(k, 'instr')), tmp.textContent);
          const texts = [], w = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
          for (let t = w.nextNode(); t; t = w.nextNode()) texts.push(t);
          if (texts.length) {
            texts[0].replaceWith(sp);
            texts.slice(1).forEach(t => t.remove());
            tmp.querySelectorAll('*').forEach(x => { if (x !== sp && !x.contains(sp) && !x.textContent && x.tagName !== 'BR' && x.tagName !== 'IMG') x.remove(); });
            while (tmp.firstChild) (wrap || el).appendChild(tmp.firstChild);
          } else (wrap || el).appendChild(sp);
        }
        else if (n === 'smartTag' || n === 'customXml' || n === 'sdt' || n === 'sdtContent' || n === 'fldSimple' || n === 'bdo' || n === 'dir') walk(n === 'sdt' ? (wkid(k, 'sdtContent') || k) : k, wrap);
        else if (n === 'commentRangeStart') { const c = this.comments[wa(k, 'id')]; if (c) { c.used = true; open.push(c.id); } }
        else if (n === 'commentRangeEnd') { const c = this.comments[wa(k, 'id')]; if (c) { const i = open.lastIndexOf(c.id); if (i >= 0) open.splice(i, 1); } }
        else if (n === 'bookmarkStart') { const nm = wa(k, 'name'); if (nm && !nm.startsWith('_GoBack')) { el.id = el.id || nm.replace(/[^\w-]/g, '_'); } }
        else if (n === 'oMath' || n === 'oMathPara') { (wrap || el).appendChild(document.createTextNode(k.textContent)); }
      }
    };
    walk(p, null);
    void cur; void pStyleR;
  }
  run(r, parent, ctx, base, extra, fld, open) {
    const rpr = parseRPr(wkid(r, 'rPr'));
    if (rpr.hidden) return;
    const noteRef = Array.from(r.children).find(k => k.localName === 'footnoteReference' || k.localName === 'endnoteReference');
    if (noteRef && !ctx.note) {
      const kind = noteRef.localName === 'endnoteReference' ? 'end' : 'foot';
      const html = this.noteMap[(kind === 'end' ? 'endnotes:' : 'footnotes:') + wa(noteRef, 'id')];
      if (html != null) {
        const id = uid('n');
        this.notesOut[id] = { kind, html };
        if (/^(1|true|on)$/.test(wa(noteRef, 'customMarkFollows') || '')) this.noteMarks[kind].push(Array.from(r.children).filter(k => k.localName === 't').map(k => k.textContent).join('').trim());
        let host = parent;
        if (open.length) { const sp = h('span', { class: 'cmt', 'data-cid': open[open.length - 1] }); host.appendChild(sp); host = sp; }
        host.appendChild(h('sup', { class: kind === 'end' ? 'fn en' : 'fn', 'data-fn': id, contenteditable: 'false' }, '1'));
        return;
      }
    }
    if (ctx.note && (Array.from(r.children).some(k => k.localName === 'footnoteRef' || k.localName === 'endnoteRef') || /^(Footnote|Endnote)Reference$/i.test(rpr.rStyle || '') || /^(footnote|endnote) reference$/.test((this.styles[rpr.rStyle] || {}).name || ''))) return;
    const cs = rpr.rStyle ? this.charStyle(rpr.rStyle) : {};
    const eff = Object.assign({}, extra || {}, cs, rpr);
    // text in a Bijoy font (SutonnyMJ…) is marked, and converted to Unicode once the file is read
    const bjRun = this.bj && isBijoyFont(eff.font || base.font);
    if (bjRun) eff.font = null;
    let target = parent;
    const css = runCss(eff, base, S.doc ? S.doc.font : 'Calibri');
    const wrapEl = () => {
      let host = parent;
      if (open.length) { const sp = h('span', { class: 'cmt', 'data-cid': open[open.length - 1] }); host.appendChild(sp); host = sp; }
      if (eff.vert === 'superscript' || eff.vert === 'subscript') { const s = document.createElement(eff.vert === 'superscript' ? 'sup' : 'sub'); host.appendChild(s); host = s; }
      if (css || eff.bdr || eff.shdPat || bjRun) {
        const sp = h('span', { style: css || null, 'data-bj': bjRun ? '' : null });
        if (eff.shdPat) { sp.setAttribute('data-ts', ''); Borders.shade(sp, eff.shdPat); }
        if (eff.bdr) { const b = h('span', { 'data-tb': '', style: `border:${bdrCss(eff.bdr)};padding:0 1pt` + (eff.bdrShadow ? `;box-shadow:${fmtNum(Math.max(1.5, eff.bdr.width * 2), 2)}pt ${fmtNum(Math.max(1.5, eff.bdr.width * 2), 2)}pt 0 0 ${eff.bdr.color}` : '') }); sp.appendChild(b); host.appendChild(sp); host = b; }
        else { host.appendChild(sp); host = sp; }
      }
      return host;
    };
    let host = null;
    const put = node => { if (!host) host = wrapEl(); host.appendChild(node); };
    const text = s => {
      if (!s) return;
      if (fld.skip) { if (fld.span && /[০-৯]/.test(s)) fld.span.setAttribute('data-num', 'bn'); return; }
      if (fld.depth > 0 && !fld.inResult) return;
      const last = host && host.lastChild;
      if (last && last.nodeType === 3) last.appendData(s); else put(document.createTextNode(s));
    };
    for (const k of Array.from(r.children)) {
      const n = k.localName;
      if (n === 't' || n === 'delText') text(k.textContent);
      else if (n === 'tab' || n === 'ptab') text('\t');
      else if (n === 'br' || n === 'cr') {
        const t = wa(k, 'type');
        if (t === 'page' || t === 'column') this.state.brk = true;
        else if (!(fld.depth > 0 && !fld.inResult)) put(document.createElement('br'));
      }
      else if (n === 'noBreakHyphen') text('‑');
      else if (n === 'softHyphen') text('\u00AD');
      else if (n === 'sym') { const c = parseInt(wa(k, 'char') || '', 16); if (c) { const ch = c >= 0xF000 ? ({ 0xF0B7: '•', 0xF0A7: '▪', 0xF0FC: '✓', 0xF0D8: '➢', 0xF06F: '○', 0xF0E0: '→' }[c] || String.fromCharCode(c - 0xF000)) : String.fromCharCode(c); text(ch); } }
      else if (n === 'fldChar') {
        const t = wa(k, 'fldCharType');
        if (t === 'begin') { fld.depth++; fld.inResult = false; fld.instr = ''; }
        else if (t === 'separate') {
          fld.inResult = true;
          // a page number, date… in a header or footer becomes a field of ours (its result is shown per page)
          const tok = ctx.hf && fld.depth === 1 ? hfToken(fld.instr) : null;
          if (tok) { fld.span = hffSpan(tok, ''); put(fld.span); fld.skip = true; }
        }
        else if (t === 'end') { fld.depth = Math.max(0, fld.depth - 1); fld.inResult = fld.depth > 0; if (!fld.depth) { fld.skip = false; fld.span = null; } }
      }
      else if (n === 'instrText') fld.instr += k.textContent;
      else if (n === 'drawing' || n === 'pict' || n === 'object') { const img = this.drawing(k, ctx); if (img) put(img); }
      else if (n === 'AlternateContent') { const x = this.alternate(k, ctx); if (x) put(x); }

    }
  }
  /* the theme's colours (Word's shapes name them: accent1, dark 1…) */
  async readTheme() {
    this.themeClr = { dk1: '#000000', lt1: '#ffffff', dk2: '#44546a', lt2: '#e7e6e6', accent1: '#4472c4', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000', accent5: '#5b9bd5', accent6: '#70ad47', hlink: '#0563c1', folHlink: '#954f72' };
    const rel = this.rels && Object.values(this.rels).find(r => /\/theme$/.test(r.type));
    const x = await this.xml(rel ? this.resolvePath('word/', rel.target) : 'word/theme/theme1.xml');
    const cs = x && x.getElementsByTagNameNS(DML, 'clrScheme')[0];
    if (!cs) return;
    for (const k of cs.children) {
      const c = k.firstElementChild;
      const v = c && (c.getAttribute('lastClr') || c.getAttribute('val'));
      if (v && /^[0-9a-f]{6}$/i.test(v)) this.themeClr[k.localName] = '#' + v.toLowerCase();
    }
  }
  /* a DrawingML colour (srgbClr, schemeClr, prstClr, sysClr) with its shade, tint and luminance */
  dmlColor(el) {
    if (!el) return null;
    const n = el.localName, v = el.getAttribute('val') || '';
    let hex = null;
    if (n === 'srgbClr') hex = /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : null;
    else if (n === 'schemeClr') hex = this.themeClr[{ tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2', phClr: 'accent1' }[v] || v] || null;
    else if (n === 'sysClr') hex = '#' + (el.getAttribute('lastClr') || (v === 'window' ? 'ffffff' : '000000')).toLowerCase();
    else if (n === 'prstClr') hex = ({ black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080' })[v] || null;
    if (!hex) return null;
    let [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)), gam = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    for (const m of el.children) {
      const f = (parseInt(m.getAttribute('val'), 10) || 0) / 100000;
      if (m.localName === 'shade') [r, g, b] = [r, g, b].map(c => gam(lin(c) * f));
      else if (m.localName === 'tint') [r, g, b] = [r, g, b].map(c => gam(lin(c) * f + (1 - f)));
      else if (m.localName === 'lumMod' || m.localName === 'lumOff') {
        // through HSL: luminance times lumMod, plus lumOff
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let hh = 0, ss = 0, l = (mx + mn) / 2;
        if (mx !== mn) { const d = mx - mn; ss = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; }
        l = m.localName === 'lumMod' ? l * f : l + f;
        l = Math.max(0, Math.min(1, l));
        const q = l < 0.5 ? l * (1 + ss) : l + ss - l * ss, p2 = 2 * l - q;
        const hue = t => { t = (t + 1) % 1; return t < 1 / 6 ? p2 + (q - p2) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p2 + (q - p2) * (2 / 3 - t) * 6 : p2; };
        [r, g, b] = ss ? [hue(hh + 1 / 3), hue(hh), hue(hh - 1 / 3)] : [l, l, l];
      }
    }
    return '#' + [r, g, b].map(c => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');
  }
  /* mc:AlternateContent in a run: the Choice a Word 2010 reader takes (shapes, groups, pictures),
     else what older readers get (VML) */
  alternate(k, ctx) {
    for (const ch of Array.from(k.children).filter(c => c.localName === 'Choice')) {
      const d = Array.from(ch.children).find(c => /^(drawing|pict|object)$/.test(c.localName));
      if (d) { const x = this.drawing(d, ctx); if (x) return x; }
    }
    const fb = Array.from(k.children).find(c => c.localName === 'Fallback');
    if (fb) for (const c of fb.children) if (/^(drawing|pict|object)$/.test(c.localName)) { const x = this.drawing(c, ctx); if (x) return x; }
    return null;
  }
  /* a drawing: a shape or text box, a group of them, or a picture */
  drawing(k, ctx) {
    if (k.localName === 'drawing') {
      const grp = k.getElementsByTagNameNS(WPG, 'wgp')[0];
      if (grp) return this.group(k, grp, ctx);
      const wsp = k.getElementsByTagNameNS(WPS, 'wsp')[0];
      if (wsp) return this.wpsShape(k, wsp, ctx);
    } else if (k.localName === 'pict') {
      const v = this.vmlShape(k, ctx);
      if (v) return v;
    }
    return this.image(k, ctx);
  }
  /* a text box's text (w:txbxContent) as HTML, read as the document's is */
  txbxHtml(content, ctx) {
    if (!content) return '';
    const box = document.createElement('div');
    const keep = { list: this.listState, state: this.state, mid: this.midSect };
    this.listState = null;
    try { this.blocks(content, box, Object.assign({}, ctx, { inShape: true })); }
    finally { this.listState = keep.list; this.state = keep.state; this.midSect = keep.mid; }
    return box.innerHTML;
  }
  /* where a floating drawing is: Word's reference (page, margin, column, paragraph) and offset or
     alignment, placed after layout (PicEdit.settle); its wrapping as Folio's */
  placeFloat(el, anchor) {
    const pos = tag => {
      const p = anchor.getElementsByTagNameNS(WPD, tag)[0];
      if (!p) return '||';
      const o = p.getElementsByTagNameNS(WPD, 'posOffset')[0], a = p.getElementsByTagNameNS(WPD, 'align')[0];
      return `${p.getAttribute('relativeFrom') || ''}|${o ? (parseInt(o.textContent, 10) || 0) / 9525 : ''}|${a ? a.textContent.trim() : ''}`;
    };
    const has = n => !!anchor.getElementsByTagNameNS(WPD, n)[0];
    if (has('wrapNone') || !(has('wrapSquare') || has('wrapTight') || has('wrapThrough') || has('wrapTopAndBottom'))) {
      el.classList.add(/^(1|true)$/.test(anchor.getAttribute('behindDoc') || '') ? 'img-behind' : 'img-front');
      el.setAttribute('data-fx', pos('positionH'));
      el.setAttribute('data-fy', pos('positionV'));
      return;
    }
    // text around it: to the side it is nearer (Folio's square wrap), or on a line of its own
    const [, ho, ha] = pos('positionH').split('|');
    const g = geom(), w = parseFloat(el.style.width) || 0;
    const x = ha ? null : +ho;
    const side = ha === 'right' || ha === 'outside' ? 'right' : ha === 'center' ? 'center' : ha === 'left' || ha === 'inside' ? 'left' : (x + w / 2 > g.cw * 0.62 ? 'right' : x + w / 2 < g.cw * 0.38 ? 'left' : 'center');
    el.classList.add(has('wrapTopAndBottom') ? 'img-center' : 'img-' + side);
  }
  /* Word 2010's shape (wps:wsp): its outline (preset, fill, line from its own properties or its
     style's references to the theme), its text box, its place */
  wpsShape(drawing, wsp, ctx, place = true) {
    if (ctx.inShape) return null;
    const kid = (el, name, ns) => el && Array.from(el.children).find(c => c.localName === name && (!ns || c.namespaceURI === ns));
    const spPr = kid(wsp, 'spPr'), style = kid(wsp, 'style'), bodyPr = kid(wsp, 'bodyPr');
    const holder = drawing && (drawing.getElementsByTagNameNS(WPD, 'anchor')[0] || drawing.getElementsByTagNameNS(WPD, 'inline')[0]);
    const xfrm = spPr && kid(spPr, 'xfrm', DML), ext = xfrm && kid(xfrm, 'ext', DML), wext = holder && kid(holder, 'extent', WPD);
    const E = v => (parseInt(v, 10) || 0) / 9525;
    let w = wext ? E(wext.getAttribute('cx')) : ext ? E(ext.getAttribute('cx')) : 96, hh = wext ? E(wext.getAttribute('cy')) : ext ? E(ext.getAttribute('cy')) : 96;
    const prst = spPr && kid(spPr, 'prstGeom', DML);
    let kind = prst ? prst.getAttribute('prst') || 'rect' : 'rect';
    const line = /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(kind);
    if (!line && !SHAPE_NAMES[kind]) kind = SHAPE_ALIAS[kind] || (spPr && kid(spPr, 'custGeom', DML) ? 'rect' : 'rect');
    const cnv = kid(wsp, 'cNvSpPr');
    const tb = !!(cnv && /^(1|true)$/.test(cnv.getAttribute('txBox') || ''));
    const el = Shapes.make(line ? 'line' : tb ? 'textbox' : kind, w, hh);
    if (!line && tb && kind !== 'rect') el.setAttribute('data-shp', kind);
    el.removeAttribute('data-fit');
    const adj = prst ? Array.from(prst.getElementsByTagNameNS(DML, 'gd')).map(g => parseFloat((g.getAttribute('fmla') || '').replace(/^val\s+/, ''))).filter(isFinite) : [];
    if (adj.length && !line) el.setAttribute('data-adj', adj.join(','));
    if (xfrm) {
      const rot = (parseInt(xfrm.getAttribute('rot'), 10) || 0) / 60000;
      if (rot) { el.setAttribute('data-rot', String(Math.round(rot * 10) / 10)); el.style.transform = `rotate(${Math.round(rot * 10) / 10}deg)`; }
      const fl = (/^(1|true)$/.test(xfrm.getAttribute('flipH') || '') ? 'h' : '') + (/^(1|true)$/.test(xfrm.getAttribute('flipV') || '') ? 'v' : '');
      if (fl) el.setAttribute('data-flip', fl);
    }
    // its fill: its own, else its style's (fillRef 0: none)
    const ref = n => style && kid(style, n, DML);
    const refClr = n => { const r = ref(n); return r && r.firstElementChild ? this.dmlColor(r.firstElementChild) : null; };
    const sf = spPr && kid(spPr, 'solidFill', DML), nf = spPr && kid(spPr, 'noFill', DML), gf = spPr && kid(spPr, 'gradFill', DML);
    let fill = sf ? this.dmlColor(sf.firstElementChild) : nf ? 'none' : gf ? this.dmlColor(gf.getElementsByTagNameNS(DML, 'gs')[0] && gf.getElementsByTagNameNS(DML, 'gs')[0].firstElementChild) : null;
    if (fill == null) { const r = ref('fillRef'); fill = r && (parseInt(r.getAttribute('idx'), 10) || 0) > 0 ? refClr('fillRef') : null; }
    if (!line) el.setAttribute('data-fill', fill || 'none');
    // its line: its own, else its style's (lnRef: 0 none, 1 thin, 2 1 pt, 3 1.5 pt)
    const ln = spPr && kid(spPr, 'ln', DML);
    let stroke = null, lw = null;
    if (ln) {
      if (kid(ln, 'noFill', DML)) stroke = 'none';
      else { const lf = kid(ln, 'solidFill', DML); if (lf) stroke = this.dmlColor(lf.firstElementChild); }
      if (ln.getAttribute('w')) lw = (parseInt(ln.getAttribute('w'), 10) || 0) / 12700;
      const pd = kid(ln, 'prstDash', DML);
      if (pd && SHAPE_DASH[pd.getAttribute('val')] && pd.getAttribute('val') !== 'solid') el.setAttribute('data-dash', pd.getAttribute('val'));
      else if (pd && /^(dot|sysDashDot)$/.test(pd.getAttribute('val') || '')) el.setAttribute('data-dash', pd.getAttribute('val') === 'dot' ? 'sysDot' : 'dashDot');
      const he = kid(ln, 'headEnd', DML), te = kid(ln, 'tailEnd', DML);
      const on = x => !!x && (x.getAttribute('type') || 'none') !== 'none';
      if (line && (on(he) || on(te))) el.setAttribute('data-head', on(he) && on(te) ? 'both' : on(te) ? 'end' : 'start');
    }
    if (stroke == null) { const r = ref('lnRef'); const idx = r ? parseInt(r.getAttribute('idx'), 10) || 0 : 0; stroke = idx > 0 ? refClr('lnRef') : null; if (lw == null && idx > 0) lw = [0, 0.5, 1, 1.5][Math.min(3, idx)]; }
    el.setAttribute('data-line', stroke || 'none');
    if (lw != null) el.setAttribute('data-lw', String(Math.round(lw * 100) / 100));
    // its text: colour from its style's font reference; insets, anchoring, fitting from bodyPr
    if (!line) {
      const fc = refClr('fontRef');
      if (fc) el.setAttribute('data-tc', fc); else el.removeAttribute('data-tc');
      if (bodyPr) {
        const ins = [['lIns', 91440], ['tIns', 45720], ['rIns', 91440], ['bIns', 45720]].map(([k2, d]) => (bodyPr.getAttribute(k2) != null ? parseInt(bodyPr.getAttribute(k2), 10) || 0 : d) / 12700);
        el.setAttribute('data-ins', ins.map(v => Math.round(v * 100) / 100).join(' '));
        const an = bodyPr.getAttribute('anchor');
        el.setAttribute('data-va', an === 'ctr' || an === 'b' ? an : 't');
        if (kid(bodyPr, 'spAutoFit', DML)) el.setAttribute('data-fit', '1');
      }
      const txbx = kid(wsp, 'txbx');
      const content = txbx && Array.from(txbx.children).find(c => c.localName === 'txbxContent');
      Shapes.tpl(el).innerHTML = content ? this.txbxHtml(content, ctx) : '';
    }
    if (place && holder) { if (holder.localName === 'anchor') this.placeFloat(el, holder); }
    return el;
  }
  /* a group of shapes: each shape on its own, in front of the text where the group was (its
     child coordinates scaled to the group's box) */
  group(drawing, grp, ctx) {
    if (ctx.inShape) return null;
    const holder = drawing.getElementsByTagNameNS(WPD, 'anchor')[0] || drawing.getElementsByTagNameNS(WPD, 'inline')[0];
    const gx = grp.getElementsByTagNameNS(DML, 'xfrm')[0];
    const val = (el, n, a) => { const x = el && Array.from(el.children).find(c => c.localName === n); return x ? (parseInt(x.getAttribute(a), 10) || 0) / 9525 : 0; };
    const ext = holder && holder.getElementsByTagNameNS(WPD, 'extent')[0];
    const W = ext ? (parseInt(ext.getAttribute('cx'), 10) || 0) / 9525 : val(gx, 'ext', 'cx'), H = ext ? (parseInt(ext.getAttribute('cy'), 10) || 0) / 9525 : val(gx, 'ext', 'cy');
    const chX = val(gx, 'chOff', 'x'), chY = val(gx, 'chOff', 'y'), chW = val(gx, 'chExt', 'cx') || W || 1, chH = val(gx, 'chExt', 'cy') || H || 1;
    const sx = W / chW, sy = H / chH;
    let base = ['column', 0, 'paragraph', 0, 'img-front'];
    if (holder && holder.localName === 'anchor') {
      const probe = h('span');
      probe.style.width = W + 'px';
      this.placeFloat(probe, holder);
      const fx = (probe.getAttribute('data-fx') || 'column|0|').split('|'), fy = (probe.getAttribute('data-fy') || 'paragraph|0|').split('|');
      base = [fx[0], +fx[1] || 0, fy[0], +fy[1] || 0, probe.classList.contains('img-behind') ? 'img-behind' : 'img-front'];
    }
    const frag = document.createDocumentFragment();
    for (const sp of Array.from(grp.getElementsByTagNameNS(WPS, 'wsp'))) {
      const el = this.wpsShape(null, sp, ctx, false);
      if (!el) continue;
      const x = sp.getElementsByTagNameNS(DML, 'xfrm')[0];
      const ox = (val(x, 'off', 'x') - chX) * sx, oy = (val(x, 'off', 'y') - chY) * sy;
      el.style.width = Math.round(val(x, 'ext', 'cx') * sx * 10) / 10 + 'px';
      el.style.height = Math.round(val(x, 'ext', 'cy') * sy * 10) / 10 + 'px';
      el.classList.add(base[4]);
      el.setAttribute('data-fx', `${base[0]}|${Math.round((base[1] + ox) * 10) / 10}|`);
      el.setAttribute('data-fy', `${base[2]}|${Math.round((base[3] + oy) * 10) / 10}|`);
      frag.appendChild(el);
    }
    return frag.firstChild ? frag : null;
  }
  /* older Word's text boxes and shapes (VML): rectangles, rounded ones, ovals, lines, text boxes */
  vmlShape(pict, ctx) {
    if (ctx.inShape) return null;
    const all = Array.from(pict.getElementsByTagName('*'));
    if (all.some(e => /^v:(imagedata|textpath)$/.test(e.tagName))) return null;
    const v = all.find(e => /^v:(shape|rect|roundrect|oval|line)$/.test(e.tagName));
    if (!v) return null;
    const st = parseStyleAttr(v.getAttribute('style'));
    const px = x => { const pt = cssToPt(x); return pt ? pt / 0.75 : 0; };
    const type = v.getAttribute('type') || '';
    const tbox = all.find(e => e.tagName === 'v:textbox');
    const content = tbox && Array.from(tbox.getElementsByTagName('*')).find(e => e.localName === 'txbxContent');
    let kind = v.tagName === 'v:roundrect' ? 'roundRect' : v.tagName === 'v:oval' ? 'ellipse' : v.tagName === 'v:line' || /_x0000_t32/.test(type) ? 'line' : 'rect';
    let w = px(st.width), hh = px(st.height), flip = '';
    if (kind === 'line') {
      const pts = a => (v.getAttribute(a) || '0,0').split(',').map(x => px(/[a-z]/i.test(x) ? x : x + 'pt'));
      const [x1, y1] = pts('from'), [x2, y2] = pts('to');
      if (v.tagName === 'v:line') { w = Math.abs(x2 - x1); hh = Math.abs(y2 - y1); flip = (x2 < x1 ? 'h' : '') + (y2 < y1 ? 'v' : ''); st['margin-left'] = st['margin-left'] || (Math.min(x1, x2) * 0.75) + 'pt'; st['margin-top'] = st['margin-top'] || (Math.min(y1, y2) * 0.75) + 'pt'; }
    }
    if (!w && !hh) return null;
    const tb = /_x0000_t202/.test(type) || (!!content && kind === 'rect' && v.tagName === 'v:shape');
    const el = Shapes.make(kind === 'line' ? 'line' : tb ? 'textbox' : kind, w, hh);
    el.removeAttribute('data-fit');
    if (flip) el.setAttribute('data-flip', flip);
    const col = c => { const x = cssColorToHex((c || '').split(/\s/)[0]); return x || null; };
    if (kind !== 'line') {
      const filled = v.getAttribute('filled');
      el.setAttribute('data-fill', /^(f|false)$/i.test(filled || '') ? 'none' : col(v.getAttribute('fillcolor')) || '#ffffff');
    }
    el.setAttribute('data-line', /^(f|false)$/i.test(v.getAttribute('stroked') || '') ? 'none' : col(v.getAttribute('strokecolor')) || '#000000');
    el.setAttribute('data-lw', String(Math.round((cssToPt(v.getAttribute('strokeweight') || '0.75pt') || 0.75) * 100) / 100));
    if (kind !== 'line') {
      el.removeAttribute('data-tc');
      el.setAttribute('data-va', /middle/.test(st['v-text-anchor'] || '') ? 'ctr' : /bottom/.test(st['v-text-anchor'] || '') ? 'b' : 't');
      if (tbox && tbox.getAttribute('inset')) { const ins = tbox.getAttribute('inset').split(',').map(x => cssToPt(x.trim() || '0') || 0); if (ins.length === 4) el.setAttribute('data-ins', ins.map(x => Math.round(x * 100) / 100).join(' ')); }
      if (/mso-fit-shape-to-text\s*:\s*t/i.test((tbox && tbox.getAttribute('style')) || '')) el.setAttribute('data-fit', '1');
      Shapes.tpl(el).innerHTML = content ? this.txbxHtml(content, ctx) : '';
    }
    const rot = parseFloat(st.rotation);
    if (rot) { el.setAttribute('data-rot', String(rot)); el.style.transform = `rotate(${rot}deg)`; }
    if (/absolute/.test(st.position || '')) {
      const wrap = all.find(e => e.tagName === 'w10:wrap');
      const wt = wrap ? wrap.getAttribute('type') : 'none';
      const hr = ({ page: 'page', margin: 'margin', text: 'column', char: 'character' })[st['mso-position-horizontal-relative']] || 'column';
      const vr = ({ page: 'page', margin: 'margin', text: 'paragraph', line: 'line' })[st['mso-position-vertical-relative']] || 'paragraph';
      if (!wt || wt === 'none') {
        el.classList.add((parseInt(st['z-index'], 10) || 0) < 0 ? 'img-behind' : 'img-front');
        el.setAttribute('data-fx', `${hr}|${st['mso-position-horizontal'] ? '' : Math.round(px(st['margin-left'] || '0') * 10) / 10}|${st['mso-position-horizontal'] || ''}`);
        el.setAttribute('data-fy', `${vr}|${st['mso-position-vertical'] ? '' : Math.round(px(st['margin-top'] || '0') * 10) / 10}|${st['mso-position-vertical'] || ''}`);
      } else {
        const x = px(st['margin-left'] || '0'), g = geom();
        const ha = st['mso-position-horizontal'] || '';
        const side = ha === 'right' ? 'right' : ha === 'center' ? 'center' : ha === 'left' ? 'left' : (x + w / 2 > g.cw * 0.62 ? 'right' : x + w / 2 < g.cw * 0.38 ? 'left' : 'center');
        el.classList.add(wt === 'topAndBottom' ? 'img-center' : 'img-' + side);
      }
    }
    return el;
  }
  image(k, ctx) {
    if (ctx.hf) {
      const dp = k.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'docPr')[0];
      if (dp && /^watermark$/i.test(dp.getAttribute('name') || '')) { if (dp.getAttribute('descr')) this.watermarkText = dp.getAttribute('descr'); return null; }
      const vs = k.getElementsByTagName('v:shape')[0];
      if (vs && /watermark/i.test(vs.getAttribute('id') || '')) { const tp = k.getElementsByTagName('v:textpath')[0]; if (tp && tp.getAttribute('string')) this.watermarkText = tp.getAttribute('string'); return null; }
    }
    const blip = k.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
    let rid = blip ? (blip.getAttributeNS(RNS, 'embed') || blip.getAttribute('r:embed')) : null;
    if (!rid) { const vi = k.getElementsByTagName('v:imagedata')[0]; if (vi) rid = vi.getAttributeNS(RNS, 'id') || vi.getAttribute('r:id'); }
    if (!rid) {
      // VML watermark text in headers
      const tp = k.getElementsByTagName('v:textpath')[0];
      if (tp && tp.getAttribute('string')) this.watermarkText = tp.getAttribute('string');
      return null;
    }
    const rel = ctx.rels[rid];
    if (!rel || rel.external) return null;
    const path = this.resolvePath(ctx.base, rel.target);
    const ext = (path.split('.').pop() || '').toLowerCase();
    if (!/^(png|jpe?g|gif|bmp|webp|svg)$/.test(ext)) return document.createTextNode('[picture]');
    const img = h('img', { alt: '', 'data-pending': path });
    const extEl = k.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0];
    if (extEl) { const cx = parseInt(extEl.getAttribute('cx'), 10), cy = parseInt(extEl.getAttribute('cy'), 10); if (cx) img.style.width = Math.round(cx / 9525) + 'px'; if (cx && cy) img.setAttribute('data-ext', `${cx / 9525},${cy / 9525}`); }
    else { const shape = k.getElementsByTagName('v:shape')[0]; const st = shape && parseStyleAttr(shape.getAttribute('style')); if (st && st.width) { const pt = cssToPt(st.width); if (pt) img.style.width = Math.round(pt / 0.75) + 'px'; } }
    const docPr = k.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'docPr')[0];
    if (docPr && docPr.getAttribute('descr')) img.setAttribute('alt', docPr.getAttribute('descr'));
    // cropped, turned or flipped in Word: made the same way once the picture is loaded (PicEdit.importBake)
    const A = 'http://schemas.openxmlformats.org/drawingml/2006/main', WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
    const src = k.getElementsByTagNameNS(A, 'srcRect')[0];
    const spPr = k.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/picture', 'spPr')[0];
    const xfrm = spPr && spPr.getElementsByTagNameNS(A, 'xfrm')[0];
    const xf = {};
    if (src) { const v = n => Math.max(0, (parseInt(src.getAttribute(n), 10) || 0) / 100000); const c = [v('l'), v('t'), v('r'), v('b')]; if (c.some(n => n > 0)) xf.c = c; }
    if (xfrm) { const rot = (parseInt(xfrm.getAttribute('rot'), 10) || 0) / 60000; if (rot) xf.r = rot; if (/^(1|true)$/.test(xfrm.getAttribute('flipH') || '')) xf.fh = 1; if (/^(1|true)$/.test(xfrm.getAttribute('flipV') || '')) xf.fv = 1; }
    if (Object.keys(xf).length) img.setAttribute('data-xf', JSON.stringify(xf));
    const anchor = k.getElementsByTagNameNS(WP, 'anchor')[0];
    if (anchor && anchor.getElementsByTagNameNS(WP, 'wrapNone')[0]) {
      // in front of / behind the text: placed after layout (PicEdit.settle)
      img.className = /^(1|true)$/.test(anchor.getAttribute('behindDoc') || '') ? 'img-behind' : 'img-front';
      const pos = tag => {
        const p = anchor.getElementsByTagNameNS(WP, tag)[0];
        if (!p) return '||';
        const o = p.getElementsByTagNameNS(WP, 'posOffset')[0], a = p.getElementsByTagNameNS(WP, 'align')[0];
        return `${p.getAttribute('relativeFrom') || ''}|${o ? (parseInt(o.textContent, 10) || 0) / 9525 : ''}|${a ? a.textContent.trim() : ''}`;
      };
      img.setAttribute('data-fx', pos('positionH'));
      img.setAttribute('data-fy', pos('positionV'));
    } else if (anchor) {
      const al = anchor.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'align')[0];
      const wrapTB = anchor.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'wrapTopAndBottom')[0];
      const a = al ? al.textContent : '';
      if (wrapTB) img.className = 'img-center';
      else if (a === 'right') img.className = 'img-right';
      else if (a === 'left' || anchor.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'wrapSquare')[0]) img.className = 'img-left';
    }
    (this.pendingImgs = this.pendingImgs || []).push({ img, path, ext });
    return img;
  }
  /* a table style's borders, with the styles it is based on */
  tableStyleBorders(id) {
    const chain = [];
    let st = this.styles[id || this.defaultTStyle];
    const seen = new Set();
    while (st && !seen.has(st.id)) { seen.add(st.id); chain.unshift(st); st = this.styles[st.basedOn]; }
    const out = {};
    for (const c of chain) if (c.tb) for (const k in c.tb) if (c.tb[k] !== undefined) out[k] = c.tb[k];
    return out;
  }
  table(tbl, ctx) {
    const out = document.createElement('table');
    const tblPr = wkid(tbl, 'tblPr');
    const styleId = tblPr && wa(wkid(tblPr, 'tblStyle'), 'val');
    // the table's own borders: its style, then its direct formatting
    const spec = Object.assign({ top: null, bottom: null, left: null, right: null, insideH: null, insideV: null }, this.tableStyleBorders(styleId));
    const direct = tblBordersFromWord(tblPr && wkid(tblPr, 'tblBorders'));
    for (const k in direct) if (direct[k] !== undefined) spec[k] = direct[k];
    const cols = wkids(wkid(tbl, 'tblGrid'), 'gridCol').map(c => twToPx(wa(c, 'w')));
    // AutoFit: a percentage width spans the page; 'fixed' layout keeps the grid; an auto
    // width with auto cell widths fits the contents
    const tw = tblPr && wkid(tblPr, 'tblW'), twType = tw && wa(tw, 'type');
    const layout = tblPr && wa(wkid(tblPr, 'tblLayout'), 'type');
    let pct = 0;
    if (twType === 'pct') { const v = wa(tw, 'w') || ''; pct = /%$/.test(v) ? parseFloat(v) : (parseFloat(v) || 0) / 50; }
    const cellWs = wkids(tbl, 'tr').flatMap(tr => wkids(tr, 'tc')).map(tc => wkid(wkid(tc, 'tcPr'), 'tcW'));
    const fitContents = layout !== 'fixed' && (!tw || twType === 'auto' || twType === 'nil') && cellWs.length > 0 && cellWs.every(e => !e || wa(e, 'type') === 'auto' || wa(e, 'type') === 'nil');
    if (fitContents) { out.style.tableLayout = 'auto'; out.setAttribute('data-fit', 'contents'); }
    else if (cols.length) {
      const cg = document.createElement('colgroup');
      const sum = cols.reduce((a, b) => a + b, 0) || 1;
      if (pct > 0) {
        for (const w of cols) cg.appendChild(h('col', { style: `width:${fmtNum(w * 100 / sum, 3)}%` }));
        out.style.width = fmtNum(Math.min(100, pct), 2) + '%';
        if (pct >= 99.5) out.setAttribute('data-fit', 'window');
      } else {
        for (const w of cols) cg.appendChild(h('col', { style: `width:${fmtNum(w, 1)}px` }));
        out.style.width = fmtNum(sum, 1) + 'px';
        if (layout === 'fixed') out.setAttribute('data-fit', 'fixed');
      }
      out.appendChild(cg);
    }
    const jc = tblPr && wa(wkid(tblPr, 'jc'), 'val');
    if (jc === 'center') { out.style.marginLeft = 'auto'; out.style.marginRight = 'auto'; }
    else if (jc === 'right' || jc === 'end') { out.style.marginLeft = 'auto'; out.style.marginRight = '0'; }
    const body = document.createElement('tbody');
    out.appendChild(body);
    const vmerge = {};
    const rows = wkids(tbl, 'tr');
    rows.forEach((tr, ri) => {
      const row = document.createElement('tr');
      let c = 0;
      const trPr = wkid(tr, 'trPr');
      const gb = trPr && wkid(trPr, 'gridBefore');
      if (gb) c += parseInt(wa(gb, 'val'), 10) || 0;
      const th = trPr && wkid(trPr, 'trHeight');
      if (th && parseFloat(wa(th, 'val')) > 0) row.style.height = fmtNum(parseFloat(wa(th, 'val')) / 20, 1) + 'pt';
      if (trPr && (wkid(trPr, 'del') || wkid(trPr, 'ins'))) row.setAttribute('data-tcb', wkid(trPr, 'del') ? 'del' : 'ins');
      for (const tc of wkids(tr, 'tc').concat(wkids(tr, 'sdt').flatMap(s => wkids(wkid(s, 'sdtContent'), 'tc')))) {
        const pr = wkid(tc, 'tcPr');
        const span = parseInt(wa(wkid(pr, 'gridSpan'), 'val') || '1', 10) || 1;
        const vm = wkid(pr, 'vMerge');
        const vmv = vm ? (wa(vm, 'val') || 'continue') : null;
        if (vmv === 'continue' && vmerge[c]) { vmerge[c].rowSpan = (vmerge[c].rowSpan || 1) + 1; c += span; continue; }
        const cell = document.createElement('td');
        if (span > 1) cell.colSpan = span;
        if (vmv === 'restart') vmerge[c] = cell; else for (let k = 0; k < span; k++) delete vmerge[c + k];
        const shd = wkid(pr, 'shd');
        const sp = shd ? shdFromWord(shd) : null;
        if (sp && (sp.pat !== 'clear' || (sp.fill && sp.fill !== '#ffffff'))) Borders.shade(cell, sp);
        const va = wa(wkid(pr, 'vAlign'), 'val');
        if (va === 'center') cell.style.verticalAlign = 'middle'; else if (va === 'bottom') cell.style.verticalAlign = 'bottom';
        const cb = wkid(pr, 'tcBorders');
        if (cb) {
          for (const [side, names] of [['Top', ['top']], ['Bottom', ['bottom']], ['Left', ['left', 'start']], ['Right', ['right', 'end']]]) {
            const e = names.map(n => wkid(cb, n)).find(Boolean);
            if (e) cell.style['border' + side] = bdrCss(bdrFromWord(e));
          }
          const d1 = bdrFromWord(wkid(cb, 'tl2br')), d2 = bdrFromWord(wkid(cb, 'tr2bl'));
          if (d1) cell.setAttribute('data-dd', bdrCss(d1));
          if (d2) cell.setAttribute('data-du', bdrCss(d2));
          if (d1 || d2) decoSync(cell);
        }
        const box = document.createElement('div');
        const save = this.listState;
        this.listState = null;
        this.blocks(tc, box, Object.assign({}, ctx, { inCell: true }));
        this.listState = save;
        while (box.firstChild) cell.appendChild(box.firstChild);
        if (!cell.firstChild) cell.appendChild(h('p', null, h('br')));
        row.appendChild(cell);
        c += span;
      }
      if (row.firstChild) body.appendChild(row);
      void ri;
    });
    out.className = 'tbl-bd';
    for (const [k, v] of [['--bt', spec.top], ['--bb', spec.bottom], ['--bl', spec.left], ['--br', spec.right], ['--bh', spec.insideH], ['--bv', spec.insideV]]) out.style.setProperty(k, bdrCss(v));
    return out;
  }
  async readSection(sect) {
    const s = {};
    if (!sect) return s;
    const sz = wkid(sect, 'pgSz');
    if (sz) { s.w = twToPx(wa(sz, 'w')); s.h = twToPx(wa(sz, 'h')); s.orient = wa(sz, 'orient') === 'landscape' || s.w > s.h ? 'landscape' : 'portrait'; }
    const mg = wkid(sect, 'pgMar');
    if (mg) s.margins = { mt: twToPx(wa(mg, 'top')), mr: twToPx(wa(mg, 'right')), mb: twToPx(wa(mg, 'bottom')), ml: twToPx(wa(mg, 'left')), hd: twToPx(wa(mg, 'header') || 720), fd: twToPx(wa(mg, 'footer') || 720) };
    s.firstDiff = !!wkid(sect, 'titlePg');
    // where it starts (Next Page unless Word says otherwise) and its page numbers
    s.type = ({ continuous: 'cont', evenPage: 'even', oddPage: 'odd', nextColumn: 'cont' })[wa(wkid(sect, 'type'), 'val') || ''] || 'next';
    const pgn = wkid(sect, 'pgNumType');
    if (pgn) s.pn = normPn({ start: wa(pgn, 'start') != null && wa(pgn, 'start') !== '' ? parseInt(wa(pgn, 'start'), 10) : null, fmt: ({ lowerRoman: 'i', upperRoman: 'I', lowerLetter: 'a', upperLetter: 'A' })[wa(pgn, 'fmt') || ''] || '1' });
    const cols = wkid(sect, 'cols');
    if (cols && parseInt(wa(cols, 'num'), 10) > 1) s.cols = parseInt(wa(cols, 'num'), 10);
    const pgb = wkid(sect, 'pgBorders');
    if (pgb) {
      const sides = {}, m = {};
      let first = null, shadow = false;
      for (const k of ['top', 'bottom', 'left', 'right']) {
        const e = wkid(pgb, k);
        const b = bdrFromWord(e);
        sides[k] = !!b;
        m[k[0]] = Math.min(31, parseFloat(wa(e, 'space')) || 0);
        if (b && !first) first = b;
        if (b && /^(1|true|on)$/.test(wa(e, 'shadow') || '')) shadow = true;
      }
      const disp = wa(pgb, 'display');
      if (first) s.border = { style: first.style, width: first.width, color: first.color, sides, shadow, from: wa(pgb, 'offsetFrom') === 'page' ? 'page' : 'text', m, show: disp === 'firstPage' ? 'first' : disp === 'notFirstPage' ? 'rest' : 'all' };
    }
    // headers and footers: Word's default, first-page and even-page parts, read like the text
    const hf = { header: { def: '', first: '', even: '' }, footer: { def: '', first: '', even: '' } };
    s.refs = { header: new Set(), footer: new Set() };
    for (const kind of ['header', 'footer']) {
      for (const ref of wkids(sect, kind + 'Reference')) {
        const v = { default: 'def', first: 'first', even: 'even' }[wa(ref, 'type') || 'default'];
        const rel = this.rels[ra(ref, 'id')];
        if (!v || !rel) continue;
        s.refs[kind].add(v);
        const path = this.resolvePath('word/', rel.target);
        const x = await this.xml(path);
        if (!x || !x.documentElement) continue;
        const rels = await this.loadRels(path.replace(/([^/]+)$/, '_rels/$1.rels'));
        const box = document.createElement('div');
        const keepList = this.listState;
        this.listState = null;
        this.blocks(x.documentElement, box, { rels, base: path.replace(/[^/]+$/, ''), hf: true });
        this.listState = keepList;
        // watermarks live in headers as VML text or pictures
        x.querySelectorAll('*').forEach(n => { if (n.localName === 'textpath' && n.getAttribute('string')) this.watermarkText = n.getAttribute('string'); });
        while (box.lastElementChild && box.children.length > 1 && /^P$/.test(box.lastElementChild.tagName) && !box.lastElementChild.textContent.replace(/[\s\u200B]/g, '') && !box.lastElementChild.querySelector('img, span.hff') && !box.lastElementChild.getAttribute('style')) box.lastElementChild.remove();
        hf[kind][v] = HF.empty(box.innerHTML) ? '' : box.innerHTML;
      }
    }
    if (HF_KINDS.some(k => HF_VARS.some(v => hf[k][v]))) s.hf = hf;
    s.allHf = hf;
    if (this.watermarkText) s.watermark = { text: this.watermarkText, color: '#c0c0c0', opacity: 0.45 };
    return s;
  }
  /* Bangla page numbers (১, ২, ৩ and ক, খ, গ), which Word lacks: Folio keeps each section's format
     in a document variable (one Word changed since, to i, ii, iii say, stays Word's) */
  folioPn(sx, infos) {
    const dv = sx && Array.from(sx.getElementsByTagNameNS(WNS, 'docVar')).find(e => wa(e, 'name') === 'FolioPageNumbers');
    if (!dv) return;
    (wa(dv, 'val') || '').split('|').forEach((f, i) => {
      const info = infos[i];
      if (!info || (f !== 'bn' && f !== 'bnk')) return;
      if (((info.pn && info.pn.fmt) || '1') !== (f === 'bn' ? '1' : 'a')) return;
      info.pn = normPn({ start: info.pn ? info.pn.start : null, fmt: f });
    });
  }
  /* Word's sections, after the text is read: a section in columns has its blocks in a box of
     columns; between two sections that differ in more than columns (a page setup, headers, page
     numbers, a new page) a section break with the second one's settings; headers and footers a
     section has of its own are kept for it (Word's per kind of page; one it lacks is the one before) */
  sections(out, all, infos, settings) {
    delete settings.cols;
    const marks = Array.from(out.querySelectorAll(':scope > hr[data-sect]'));
    // the blocks of each section
    const groups = [];
    let cur = [];
    for (const n of Array.from(out.children)) { if (n.tagName === 'HR' && n.hasAttribute('data-sect')) { groups.push(cur); cur = []; } else cur.push(n); }
    groups.push(cur);
    groups.forEach((g, k) => {
      const info = infos[k];
      if (!info || !(info.cols > 1) || !g.length) return;
      const box = h('div', { class: 'cols' });
      box.style.setProperty('--cols', info.cols);
      g[0].before(box);
      for (const n of g) box.appendChild(n);
    });
    const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 1.5;
    const samePage = (a, b) => near(a.w, b.w) && near(a.h, b.h) && a.orient === b.orient && ['mt', 'mr', 'mb', 'ml', 'hd', 'fd'].every(k => near(a.margins && a.margins[k], b.margins && b.margins[k]));
    const sizeOf = i => {
      const px = { w: Math.min(i.w, i.h), h: Math.max(i.w, i.h) };
      const m = PAGE_SIZES.find(p => { const q = pageSizePx(p.id); return Math.abs(q.w - px.w) < 4 && Math.abs(q.h - px.h) < 4; });
      return m ? m.id : 'Custom';
    };
    // the headers each section shows: its own, or (Word, per kind of page) the one before
    const base = settings.allHf || { header: { def: '', first: '', even: '' }, footer: { def: '', first: '', even: '' } };
    const eff = { header: Object.assign({}, base.header), footer: Object.assign({}, base.footer) };
    const sects = {};
    let prev = infos[0];
    marks.forEach((m, k) => {
      const B = infos[k + 1] || {}, A = prev;
      // the paragraph Word kept only to hold the section's end, after a table or list, goes
      const before = m.previousElementSibling;
      if (m.dataset.empty === '1' && before && before.tagName === 'P' && before.previousElementSibling && !/^(P|H[1-6])$/.test(before.previousElementSibling.tagName)) before.remove();
      const own = HF_KINDS.filter(kind => B.refs && B.refs[kind].size);
      // headers it names that are the ones shown already (Folio repeats them in a part in columns)
      const hfOf = (kind, v) => (B.refs[kind].has(v) ? (B.allHf[kind][v] || '') : (eff[kind][v] || ''));
      const sameHf = own.every(kind => HF_VARS.every(v => hfOf(kind, v) === (eff[kind][v] || '')));
      const colsOnly = B.type === 'cont' && B.w && A.w && samePage(A, B) && sameHf && !!B.firstDiff === !!A.firstDiff && JSON.stringify(B.pn || null) === JSON.stringify(A.pn || null);
      if (colsOnly) { m.remove(); prev = Object.assign({}, A, { cols: B.cols }); return; }
      const w = B.w || A.w, hh = B.h || A.h, mg = B.margins || A.margins || {};
      const pg = { size: sizeOf({ w, h: hh }), w: Math.min(w, hh), h: Math.max(w, hh), orient: B.orient || (w > hh ? 'landscape' : 'portrait'), mt: mg.mt, mr: mg.mr, mb: mg.mb, ml: mg.ml, hd: mg.hd, fd: mg.fd };
      const sid = uid('s');
      const el = h('hr', { class: 'sb', 'data-sb': B.type || 'next', 'data-pg': JSON.stringify(pg), 'data-sid': sid });
      if (B.firstDiff) el.setAttribute('data-first', '1');
      if (B.pn) el.setAttribute('data-pn', JSON.stringify(B.pn));
      for (const kind of own) {
        const st = {};
        for (const v of HF_VARS) st[v] = hfOf(kind, v);
        (sects[sid] = sects[sid] || {})[kind] = st;
        eff[kind] = st;
      }
      m.replaceWith(el);
      prev = B;
    });
    if (Object.keys(sects).length) { settings.hf = settings.hf || { header: { def: '', first: '', even: '' }, footer: { def: '', first: '', even: '' } }; settings.hf.sects = sects; }
    delete settings.allHf;
    if (infos.length > 1) for (const i of infos) if (i.watermark && !settings.watermark) settings.watermark = i.watermark;
  }
  async finishMedia() {
    for (const p of this.pendingImgs || []) {
      const f = this.zip.file(p.path);
      if (!f) { p.img.remove(); continue; }
      const b64 = await f.async('base64');
      const mime = p.ext === 'jpg' || p.ext === 'jpeg' ? 'image/jpeg' : p.ext === 'svg' ? 'image/svg+xml' : 'image/' + p.ext;
      p.img.src = `data:${mime};base64,${b64}`;
      if (p.img.hasAttribute('data-xf')) await PicEdit.importBake(p.img);
      else p.img.removeAttribute('data-ext');
    }
    for (const a of this.pendingAlt || []) {
      const f = this.zip.file(a.path);
      if (!f) { a.holder.remove(); continue; }
      const html = await f.async('string');
      const frag = sanitizeHtml(html);
      a.holder.replaceWith(frag);
    }
  }
}
/* a table's six borders from <w:tblBorders>; undefined where it says nothing */
function tblBordersFromWord(el) {
  if (!el) return {};
  const pick = (...n) => { const e = n.map(x => wkid(el, x)).find(Boolean); return e ? bdrFromWord(e) : undefined; };
  return { top: pick('top'), bottom: pick('bottom'), left: pick('left', 'start'), right: pick('right', 'end'), insideH: pick('insideH'), insideV: pick('insideV') };
}
/* <w:shd>: { fill, pat, color } */
function shdFromWord(el) {
  if (!el) return null;
  const v = wa(el, 'val') || 'clear', f = wa(el, 'fill'), c = wa(el, 'color');
  if (v === 'nil') return null;
  const hex = x => x && x !== 'auto' && /^[0-9a-f]{6}$/i.test(x) ? '#' + x.toLowerCase() : null;
  return { fill: hex(f), pat: SHD_PATTERNS.some(p => p[0] === v) ? v : 'clear', color: hex(c) || '#000000' };
}
function diffRun(a, b) { const o = {}; for (const k of ['font', 'size', 'bold', 'italic', 'color', 'underline', 'strike', 'caps', 'smallCaps']) if (a[k] !== undefined && a[k] !== b[k]) o[k] = a[k]; return o; }
function runCss(eff, base, docFont) {
  const o = [];
  if (eff.font && eff.font.toLowerCase() !== String(base.font || docFont || '').toLowerCase()) o.push('font-family:' + fontStack(eff.font));
  if (eff.size && Math.abs(eff.size - (base.size || 11)) > 0.01 && eff.vert !== 'superscript' && eff.vert !== 'subscript') o.push(`font-size:${fmtNum(eff.size, 1)}pt`);
  if (eff.bold != null && !!eff.bold !== !!base.bold) o.push('font-weight:' + (eff.bold ? '700' : '400'));
  if (eff.italic != null && !!eff.italic !== !!base.italic) o.push('font-style:' + (eff.italic ? 'italic' : 'normal'));
  const deco = [];
  if (eff.underline && eff.underline !== 'none') deco.push('underline');
  if (eff.strike) deco.push('line-through');
  if (deco.length) {
    o.push('text-decoration-line:' + deco.join(' '));
    const u = eff.underline;
    if (u === 'double') o.push('text-decoration-style:double');
    else if (/dot/.test(u || '')) o.push('text-decoration-style:dotted');
    else if (/dash/.test(u || '')) o.push('text-decoration-style:dashed');
    else if (/wav/.test(u || '')) o.push('text-decoration-style:wavy');
    else if (u === 'thick') o.push('text-decoration-thickness:2px');
  }
  if (eff.color && eff.color !== 'auto' && eff.color !== (base.color || '#000000') && eff.color !== '#000000') o.push('color:' + eff.color);
  if (eff.bg) o.push('background-color:' + eff.bg);
  if (eff.caps) o.push('text-transform:uppercase');
  if (eff.smallCaps) o.push('font-variant:small-caps');
  if (eff.spacing && Math.abs(eff.spacing) > 0.05) o.push(`letter-spacing:${fmtNum(eff.spacing, 2)}pt`);
  return o.join(';');
}
/* Word lines a header's texts up on its centre and right tab stops (the Header style's, unless the
   paragraph has its own): one or two tabs to such stops become a three-cell table, each text in its
   cell; a left tab stop, a border or shading leaves the paragraph as it is */
function hfTabGrid(el, P) {
  const tabs = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) for (let i = t.data.indexOf('\t'); i >= 0; i = t.data.indexOf('\t', i + 1)) tabs.push([t, i]);
  if (!tabs.length || tabs.length > 2 || P.pbdr || P.bg || P.shdPat) return null;
  let stops = (P.tabs || []).filter(t => t.val !== 'clear' && t.val !== 'bar').sort((a, b) => a.pos - b.pos);
  if (!stops.length) stops = [{ val: 'center' }, { val: 'right' }];
  if (stops.length < tabs.length || stops.slice(0, tabs.length).some(t => !/^(center|right|end)$/.test(t.val))) return null;
  const parts = [];
  let from = [el, 0];
  for (const [t, i] of tabs) { const r = document.createRange(); r.setStart(from[0], from[1]); r.setEnd(t, i); parts.push(r.cloneContents()); from = [t, i + 1]; }
  const r = document.createRange(); r.setStart(from[0], from[1]); r.setEnd(el, el.childNodes.length); parts.push(r.cloneContents());
  const cells = { left: [], center: [], right: [] };
  parts.forEach((f, i) => cells[i === 0 ? 'left' : stops[i - 1].val === 'center' ? 'center' : 'right'].push(f));
  const keep = ['margin-top', 'margin-bottom', 'line-height'].map(k => el.style.getPropertyValue(k) ? `;${k}:${el.style.getPropertyValue(k)}` : '').join('');
  const row = h('tr');
  for (const a of ['left', 'center', 'right']) {
    const p = h('p', { style: `text-align:${a};margin:0${keep}` });
    cells[a].forEach((f, i) => { if (i) p.append(' '); p.append(f); });
    if (!p.textContent.replace(/\s/g, '') && !p.querySelector('img, span.hff')) p.replaceChildren(h('br'));
    row.appendChild(h('td', { style: 'width:33.33%;vertical-align:top' }, p));
  }
  return h('table', { class: 'hf-grid tbl-plain', style: 'width:100%' }, h('tbody', null, row));
}
/* a header's field, filled in per page by HF */
function hffSpan(tok, shown) {
  const f = String(tok || '').replace(/[{}]/g, '');
  const sp = h('span', { class: 'hff', 'data-f': f, contenteditable: 'false' }, shown || '1');
  if (/[০-৯]/.test(shown || '')) sp.setAttribute('data-num', 'bn');
  return sp;
}
function hfToken(instr) {
  const k = String(instr || '').trim().split(/\s+/)[0].toUpperCase();
  return { PAGE: '{PAGE}', NUMPAGES: '{PAGES}', SECTIONPAGES: '{PAGES}', DATE: '{DATE}', CREATEDATE: '{DATE}', SAVEDATE: '{DATE}', PRINTDATE: '{DATE}', TITLE: '{TITLE}', AUTHOR: '{AUTHOR}' }[k] || null;
}
/* Word splits one revision into a w:ins/w:del per run; join neighbours from the same author */
function mergeRevisions(root) {
  root.querySelectorAll('ins.tc, del.tc').forEach(el => {
    if (!el.isConnected) return;
    let prev = el.previousSibling;
    if (!prev || prev.nodeType !== 1 || prev.tagName !== el.tagName || !prev.classList.contains('tc')) return;
    if ((prev.getAttribute('data-author') || '') !== (el.getAttribute('data-author') || '')) return;
    const dt = Math.abs((+prev.getAttribute('data-time') || 0) - (+el.getAttribute('data-time') || 0));
    if (dt > 10 * 60 * 1000) return;
    while (el.firstChild) prev.appendChild(el.firstChild);
    el.remove();
  });
  root.querySelectorAll('ins.tc span:only-child, del.tc span:only-child').forEach(sp => { if (!sp.attributes.length) sp.replaceWith(...sp.childNodes); });
  root.normalize();
}
async function readDocxFile(buf) {
  const JSZip = await needJSZip();
  const zip = await JSZip.loadAsync(buf);
  const rd = new DocxReader(zip);
  const res = await rd.read();
  const box = document.createElement('div');
  box.innerHTML = res.html;
  // Bijoy text (SutonnyMJ…) in the text, headers, footers and notes: Unicode
  let nbj = Bijoy.convertMarked(box);
  const bjConv = html => { const [x, n] = Bijoy.convertMarkedHtml(html); nbj += n; return x; };
  if (res.settings.hf) for (const st of [res.settings.hf, ...Object.values(res.settings.hf.sects || {})]) for (const k of HF_KINDS) if (st[k]) for (const v of HF_VARS) if (st[k][v]) st[k][v] = bjConv(st[k][v]);
  if (res.settings.notes) for (const id of Object.keys(res.settings.notes)) res.settings.notes[id].html = bjConv(res.settings.notes[id].html);
  if (nbj) res.settings.bijoy = nbj;
  // the headers' and footers' HTML, for their pictures
  const hfBoxes = [];
  const hf = res.settings.hf;
  if (hf) for (const k of HF_KINDS) for (const v of HF_VARS) if (hf[k][v]) { const b = document.createElement('div'); b.innerHTML = hf[k][v]; hfBoxes.push([hf[k], v, b]); }
  if (hf && hf.sects) for (const st of Object.values(hf.sects)) for (const k of HF_KINDS) if (st[k]) for (const v of HF_VARS) if (st[k][v]) { const b = document.createElement('div'); b.innerHTML = st[k][v]; hfBoxes.push([st[k], v, b]); }
  const notes = res.settings.notes;
  if (notes) for (const id of Object.keys(notes)) if (/<img/i.test(notes[id].html)) { const b = document.createElement('div'); b.innerHTML = notes[id].html; hfBoxes.push([null, id, b]); }
  // map images and alt chunks back onto the parsed DOM
  const paths = new Map((rd.pendingImgs || []).map(p => [p.path, p]));
  // (pictures in text boxes too: they are in the boxes' templates)
  const pendingIn = b => [...b.querySelectorAll('img[data-pending]'), ...Array.from(b.querySelectorAll('template')).flatMap(t => Array.from(t.content.querySelectorAll('img[data-pending]')))];
  rd.pendingImgs = [box, ...hfBoxes.map(x => x[2])].flatMap(pendingIn).map(img => { const p = paths.get(img.getAttribute('data-pending')); img.removeAttribute('data-pending'); return p ? { img, path: p.path, ext: p.ext } : null; }).filter(Boolean);
  rd.pendingAlt = Array.from(box.querySelectorAll('[data-altchunk]')).map(holder => ({ holder, path: rd.resolvePath('word/', holder.getAttribute('data-altchunk')) }));
  await rd.finishMedia();
  mergeRevisions(box);
  res.html = box.innerHTML;
  for (const [st, v, b] of hfBoxes) { if (st) st[v] = b.innerHTML; else notes[v].html = b.innerHTML; }
  return res;
}
