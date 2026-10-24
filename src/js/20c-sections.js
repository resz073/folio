/* ===================== Sections =====================
   Word's sections. A section break (Layout › Breaks) starts a part of the document with a page
   setup of its own (size, orientation, margins, header and footer distances), Different First
   Page, page numbers that go on or start again (in a format of their own), and its own headers
   and footers or the ones before it (Link to Previous). The break is an <hr class="sb"> between
   blocks of the text, and it carries the settings of the section it starts:
     data-sb     next | cont | even | odd: Next Page, Continuous, Even Page or Odd Page
     data-pg     the page settings, JSON { size, w, h, orient, mt, mr, mb, ml, hd, fd }
     data-first  "1": Different First Page
     data-pn     page numbers, JSON { start (null: go on from the section before), fmt }
     data-sid    the section's id: its own headers and footers are S.doc.hf.sects[sid]
   The first section's settings are the document's own: S.doc.page, firstDiff, pn and hf.
   Pages: the layout gives every page its section (its size, its header). Sheets of other sizes
   are centred in the column of pages; a section whose text column is not the first section's
   has its blocks put there by the layout (data-sx: margins, never saved). */
const SB_KINDS = { next: 'Next Page', cont: 'Continuous', even: 'Even Page', odd: 'Odd Page' };
const PG_KEYS = ['size', 'w', 'h', 'orient', 'mt', 'mr', 'mb', 'ml', 'hd', 'fd'];
const PN_FMTS = { '1': '1, 2, 3', 'i': 'i, ii, iii', 'I': 'I, II, III', 'a': 'a, b, c', 'A': 'A, B, C', 'bn': '১, ২, ৩', 'bnk': 'ক, খ, গ' };
const isSectBreak = n => !!n && n.nodeType === 1 && n.tagName === 'HR' && n.classList.contains('sb');
/* a page's size and margins in px, its orientation applied */
function pageGeom(p) {
  const land = p.orient === 'landscape';
  const w = land ? Math.max(p.w, p.h) : Math.min(p.w, p.h);
  const h = land ? Math.min(p.w, p.h) : Math.max(p.w, p.h);
  return { w, h, mt: p.mt, mr: p.mr, mb: p.mb, ml: p.ml, hd: p.hd, fd: p.fd, cw: w - p.ml - p.mr, ch: h - p.mt - p.mb };
}
function normPn(o) {
  if (!o || typeof o !== 'object') return null;
  const st = o.start == null || o.start === '' || !isFinite(+o.start) ? null : Math.max(0, Math.round(+o.start));
  const fmt = PN_FMTS[o.fmt] ? o.fmt : '1';
  return st == null && fmt === '1' ? null : { start: st, fmt };
}
const Sections = {
  /* ---------- the model ---------- */
  pg(el) {
    let o = null;
    try { o = JSON.parse(el.getAttribute('data-pg') || 'null'); } catch { }
    const base = S.doc.page, out = {};
    for (const k of PG_KEYS) out[k] = o && o[k] != null && o[k] !== '' ? o[k] : base[k];
    return out;
  },
  pn(el) { try { return normPn(JSON.parse(el.getAttribute('data-pn') || 'null')); } catch { return null; } },
  breaks(root) { const r = root || docBody(); return r ? Array.from(r.querySelectorAll(':scope > hr.sb')) : []; },
  /* every section in order; the first is the document's own settings */
  list(root) {
    const d = S.doc;
    const out = [{ i: 0, el: null, type: 'next', pg: d.page, first: !!d.firstDiff, pn: normPn(d.pn), sid: '0' }];
    for (const el of this.breaks(root)) {
      // every break has an id (its section's headers are kept by it)
      if (!el.dataset.sid) el.setAttribute('data-sid', uid('s'));
      out.push({ i: out.length, el, type: SB_KINDS[el.dataset.sb] ? el.dataset.sb : 'next', pg: this.pg(el), first: el.dataset.first === '1', pn: this.pn(el), sid: el.dataset.sid });
    }
    for (const s of out) s.g = pageGeom(s.pg);
    return out;
  },
  count(root) { return 1 + this.breaks(root).length; },
  /* the section of a node in the text (the number of breaks before its block) */
  indexOf(node, root) {
    root = root || docBody();
    let b = node && (node.nodeType === 1 ? node : node.parentNode);
    while (b && b.parentNode !== root) b = b.parentNode;
    if (!b) return 0;
    let i = 0;
    for (let x = b.previousElementSibling; x; x = x.previousElementSibling) if (isSectBreak(x)) i++;
    return i;
  },
  geomAt(node) { if (!S.doc) return null; const list = this.list(); return list[Math.min(list.length - 1, this.indexOf(node))].g; },
  /* the sections the selection is in (the caret's one; a header being edited: its page's) */
  selected() {
    const list = this.list();
    if (Story.cur && Story.cur.type === 'hf') return [list[Pages.sect(Story.cur.p)] || list[0]];
    const r = getRange() || lastRange;
    const body = docBody();
    if (!r || !body.contains(r.startContainer)) return [list[Math.min(list.length - 1, Pages.sect(Math.max(0, (S.curPage || 1) - 1)))] || list[0]];
    const a = this.indexOf(r.startContainer), b = r.collapsed ? a : this.indexOf(r.endContainer);
    return list.slice(Math.min(a, b), Math.max(a, b) + 1);
  },
  /* page settings changed for some sections (the first one's are the document's) */
  setPg(sec, over) {
    if (sec.i === 0) { Object.assign(S.doc.page, over); return; }
    const pg = Object.assign({}, this.pg(sec.el), over), o = {};
    for (const k of PG_KEYS) o[k] = pg[k];
    sec.el.setAttribute('data-pg', JSON.stringify(o));
  },
  setFirst(sec, on) {
    if (sec.i === 0) { HF.firstModel(S.doc, on); return; }
    if (on) sec.el.setAttribute('data-first', '1'); else sec.el.removeAttribute('data-first');
  },
  setPn(sec, pn) {
    pn = normPn(pn);
    if (sec.i === 0) { if (pn) S.doc.pn = pn; else delete S.doc.pn; return; }
    if (pn) sec.el.setAttribute('data-pn', JSON.stringify(pn)); else sec.el.removeAttribute('data-pn');
  },
  /* ---------- breaks ---------- */
  make(type, from) {
    const pg = {};
    for (const k of PG_KEYS) pg[k] = from.pg[k];
    const el = h('hr', { class: 'sb', 'data-sb': SB_KINDS[type] ? type : 'next', 'data-pg': JSON.stringify(pg), 'data-sid': uid('s') });
    if (from.first) el.setAttribute('data-first', '1');
    if (from.pn && from.pn.fmt !== '1') el.setAttribute('data-pn', JSON.stringify({ start: null, fmt: from.pn.fmt }));
    return el;
  },
  /* Layout › Breaks › Section Breaks: the new section starts with the page setup of the one it
     is in (as in Word); its headers and footers are the ones before it */
  insert(type) {
    if (S.readOnly || Story.refuse('A section break')) return null;
    if (S.view === 'web' || S.view === 'read') setView('print');
    const cur = this.selected()[0] || this.list()[0];
    const el = this.make(type, cur);
    change(() => insertBlockAfterCaret(el, { split: true }), { full: true });
    toast(`Section break (${SB_KINDS[el.dataset.sb]}) inserted. Show formatting marks (¶) to see it.`, { ms: 4000 });
    return el;
  },
  /* the caret is at the start of a section (its first block's start): "this point forward"
     needs no new break there */
  startsHere() {
    const r = getRange() || lastRange;
    if (!r) return false;
    const top = topBlockOf(r.startContainer);
    if (!top) return false;
    const prev = top.previousElementSibling;
    if (prev && !isSectBreak(prev)) return false;
    const leaf = blockOf(r.startContainer) || top;
    return atBlockStart(r.startContainer, r.startOffset, leaf) && (leaf === top || top.firstElementChild === leaf || top.querySelector('li, td, p') === leaf);
  },
  /* a break's kind changed (Page Setup › Section start) */
  setType(sec, type) { if (sec.el && SB_KINDS[type]) sec.el.setAttribute('data-sb', type); },
  /* ---------- headers and footers of a section ---------- */
  /* its own header or footer (all three variants), or null when it uses the one before */
  own(sec, kind) {
    if (sec.i === 0) return S.doc.hf[kind];
    const st = S.doc.hf.sects && S.doc.hf.sects[sec.sid];
    return st && st[kind] ? st[kind] : null;
  },
  /* the section whose header (or footer) a section shows: itself, or the nearest one before
     with a header of its own */
  owner(list, i, kind) {
    for (let k = i; k > 0; k--) if (this.own(list[k], kind)) return list[k];
    return list[0];
  },
  /* the stored copies of headers and footers of sections whose break is gone go too */
  prune(d, html) {
    const st = d && d.hf && d.hf.sects;
    if (!st) return;
    const ids = new Set();
    const re = /data-sid="([^"]+)"/g;
    let m;
    while ((m = re.exec(html || ''))) ids.add(m[1]);
    for (const k of Object.keys(st)) if (!ids.has(k)) delete st[k];
    if (!Object.keys(st).length) delete d.hf.sects;
  },
  /* breaks pasted or copied: a break whose id is already in the text gets a new one (and a copy of
     its headers and footers); one from another document keeps the headers it has here */
  adopt(root) {
    root = root || docBody();
    const seen = new Set();
    for (const el of this.breaks(root)) {
      let sid = el.dataset.sid;
      if (!sid || seen.has(sid)) {
        const nid = uid('s');
        const st = S.doc.hf.sects;
        if (sid && st && st[sid]) st[nid] = JSON.parse(JSON.stringify(st[sid]));
        el.setAttribute('data-sid', nid);
        sid = nid;
      }
      seen.add(sid);
    }
  },
  /* ---------- the text column ---------- */
  /* A section whose text column is not the first one's (another width, or a page of another
     width centred in the column of pages): its top-level blocks get the margins that put them
     there, over their own (data-sx, --sxl, --sxr; --sxw for a table given in %). */
  columns(dirty) {
    const ed = docBody();
    if (!ed || S.view === 'web') { this.clearCols(ed); return; }
    const secs = Pages.secs || this.list();
    const X = Pages.colX(0), W = secs[0].g.cw;
    const off = secs.map((s, i) => ({ l: Pages.colX(i) - X, r: (X + W) - (Pages.colX(i) + s.g.cw), cw: s.g.cw }));
    const any = off.some(o => Math.abs(o.l) > 0.05 || Math.abs(o.r) > 0.05);
    if (!any) { this.clearCols(ed); return; }
    const tops = dirty ? new Set(Array.from(dirty).map(u => { let b = u; while (b && b.parentNode !== ed) b = b.parentNode; return b; }).filter(Boolean)) : null;
    let s = 0;
    for (let b = ed.firstElementChild; b; b = b.nextElementSibling) {
      const o = off[Math.min(s, off.length - 1)];
      if (isSectBreak(b)) s++;
      if (Math.abs(o.l) < 0.05 && Math.abs(o.r) < 0.05) { if (b.hasAttribute('data-sx')) this.clearCol(b); continue; }
      const sig = s + '|' + o.l + '|' + o.r;
      if (tops && b._sxSig === sig && !tops.has(b) && b.hasAttribute('data-sx')) continue;
      this.setCol(b, o);
      b._sxSig = sig;
    }
  },
  /* a block's own margins (and width), as its style gives them */
  ownBox(b) {
    const had = b.hasAttribute('data-sx'), v = had ? b.getAttribute('data-sx') : null;
    if (had) b.removeAttribute('data-sx');
    const cs = getComputedStyle(b);
    const out = { ml: parseFloat(cs.marginLeft) || 0, mr: parseFloat(cs.marginRight) || 0, autoL: b.style.marginLeft === 'auto', autoR: b.style.marginRight === 'auto', w: 0 };
    // a table's own width (read without laying the page out again when its style gives it)
    if (b.tagName === 'TABLE') out.w = /px\s*$/.test(b.style.width || '') ? parseFloat(b.style.width) : /%\s*$/.test(b.style.width || '') ? 0 : b.offsetWidth;
    if (had) b.setAttribute('data-sx', v);
    return out;
  },
  setCol(b, o) {
    const own = this.ownBox(b);
    let L = o.l + own.ml, R = o.r + own.mr;
    if (b.tagName === 'TABLE') {
      const pct = /%\s*$/.test(b.style.width || '') ? parseFloat(b.style.width) : null;
      const tw = pct != null ? o.cw * pct / 100 : own.w;
      if (pct != null) b.style.setProperty('--sxw', round1(tw) + 'px'); else b.style.removeProperty('--sxw');
      // centred or at the right of its column
      if (own.autoL && own.autoR) { L = o.l + (o.cw - tw) / 2; R = o.r + (o.cw - tw) / 2; }
      else if (own.autoL) { L = o.l + o.cw - tw - own.mr; }
    }
    b.setAttribute('data-sx', '');
    b.style.setProperty('--sxl', round1(L) + 'px');
    b.style.setProperty('--sxr', round1(R) + 'px');
  },
  clearCol(b) {
    b.removeAttribute('data-sx');
    b.style.removeProperty('--sxl'); b.style.removeProperty('--sxr'); b.style.removeProperty('--sxw');
    if (!b.getAttribute('style')) b.removeAttribute('style');
    b._sxSig = null;
  },
  clearCols(ed) { if (ed) ed.querySelectorAll(':scope > [data-sx]').forEach(b => this.clearCol(b)); },
};
/* the page geometry where node is: its section's (a header being edited: its page's section) */
function geomAt(node) {
  if (!S.doc) return null;
  if (Story.cur && Story.cur.type === 'hf') return HF.curSec().g;
  const body = docBody();
  if (!node || !body || !body.contains(node)) { const r = getRange(); node = r && body && body.contains(r.startContainer) ? r.startContainer : null; }
  return node ? Sections.geomAt(node) : geom();
}
/* every top-level block's own margins, without the section's (paragraph dialog, styles, Word) */
function ownMargins(b) {
  if (!b || !b.hasAttribute || !b.hasAttribute('data-sx')) { const cs = getComputedStyle(b); return { ml: parseFloat(cs.marginLeft) || 0, mr: parseFloat(cs.marginRight) || 0 }; }
  const o = Sections.ownBox(b);
  return { ml: o.ml, mr: o.mr };
}

/* ---------- Pages: each page's place, size and section ---------- */
const Pages = {
  list: [{ y: 0, s: 0 }],   // each page's top (in the column of pages) and section
  secs: null,               // the sections, with their geometry, as the layout last saw them
  maxW: 0,                  // the widest page
  mixed: false,             // pages of different sizes (no pages side by side then)
  changed: false,           // the page list changed during this layout
  nums: [],
  /* at the start of a layout: the sections; a full layout starts the pages again */
  begin(full) {
    const secs = Sections.list();
    const sig = secs.map(s => [s.type, s.sid, s.first ? 1 : 0, JSON.stringify(s.pn), PG_KEYS.map(k => s.g[k] != null ? s.g[k] : s.pg[k]).join(' '), s.g.w, s.g.h].join('|')).join(',');
    const prevSig = this._sig;
    this.secs = secs;
    this._sig = sig;
    this.maxW = Math.max(...secs.map(s => s.g.w));
    this.mixed = secs.some(s => Math.abs(s.g.w - secs[0].g.w) > 0.5 || Math.abs(s.g.h - secs[0].g.h) > 0.5);
    const changed = sig !== prevSig;
    if (full || changed || !this.list.length) this.list = [{ y: 0, s: 0 }];
    this.changed = false;
    // a change to the sections: everything is laid out again
    return changed;
  },
  ready() { if (!this.secs) this.begin(true); return this; },
  /* the sections again (page settings changed): the next layout starts the pages again */
  refreshSecs() {
    const secs = Sections.list();
    this.secs = secs;
    this.maxW = Math.max(...secs.map(s => s.g.w));
    this.mixed = secs.some(s => Math.abs(s.g.w - secs[0].g.w) > 0.5 || Math.abs(s.g.h - secs[0].g.h) > 0.5);
    for (const e of this.list) if (e.s >= secs.length) { this.list = [{ y: 0, s: 0 }]; break; }
    this._sig = null;
  },
  multi() { return !!(this.secs && this.secs.length > 1); },
  sect(p) { this.ready(); const L = this.list; return p < L.length ? L[Math.max(0, p)].s : L[L.length - 1].s; },
  sec(p) { return this.ready().secs[this.sect(p)]; },
  g(p) { return this.sec(p).g; },
  top(p) {
    this.ready();
    const L = this.list, n = L.length;
    if (p < n) return L[Math.max(0, p)].y;
    const last = L[n - 1];
    return last.y + (p - n + 1) * (this.secs[last.s].g.h + GAP);
  },
  /* the page at y (in the column of pages) */
  at(y) {
    this.ready();
    const L = this.list;
    let lo = 0, hi = L.length - 1;
    if (y + 0.5 < L[0].y) return 0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L[mid].y <= y + 0.5) lo = mid; else hi = mid - 1; }
    if (lo < L.length - 1) return lo;
    const last = L[lo], pitch = this.secs[last.s].g.h + GAP;
    return lo + Math.max(0, Math.floor((y + 0.5 - last.y) / pitch));
  },
  /* page p belongs to section s (pages after it are worked out again when it changes) */
  ensure(p, s) {
    this.ready();
    const L = this.list;
    while (L.length < p) { const q = L.length, prev = L[q - 1]; L.push({ y: prev.y + this.secs[prev.s].g.h + GAP, s: prev.s }); }
    if (L[p] && L[p].s === s) return false;
    const y = p === 0 ? 0 : L[p - 1].y + this.secs[L[p - 1].s].g.h + GAP;
    L.length = p;
    L.push({ y, s });
    this.changed = true;
    this.nums = null;
    return true;
  },
  /* after the layout: exactly n pages */
  fit(n) {
    this.ready();
    const L = this.list;
    while (L.length < n) { const q = L.length, prev = L[q - 1]; L.push({ y: prev.y + this.secs[prev.s].g.h + GAP, s: prev.s }); }
    if (L.length > n) L.length = Math.max(1, n);
    this.number();
  },
  /* the number each page shows: on from the page before, or the section's start at its first page */
  number() {
    const L = this.list, out = [];
    for (let p = 0; p < L.length; p++) {
      const sec = this.secs[L[p].s], first = p === 0 || L[p - 1].s !== L[p].s;
      out.push(first && sec.pn && sec.pn.start != null ? sec.pn.start : p === 0 ? 1 : out[p - 1] + 1);
    }
    this.nums = out;
    return out;
  },
  /* the number page p would show as the first page of section s (for Even/Odd Page breaks) */
  numberAt(p, s) {
    const sec = this.secs[s];
    if (sec && sec.pn && sec.pn.start != null) return sec.pn.start;
    if (p === 0) return 1;
    const L = this.list;
    let n = 1;
    for (let q = 0; q < p && q < L.length; q++) {
      const sq = this.secs[L[q].s], first = q === 0 || L[q - 1].s !== L[q].s;
      n = first && sq.pn && sq.pn.start != null ? sq.pn.start : q === 0 ? 1 : n + 1;
    }
    return n + (p - Math.min(p, L.length)) + 1;
  },
  num(p) {
    if (!this.nums || this.nums.length !== this.list.length) this.number();
    const L = this.nums.length;
    return p < L ? this.nums[Math.max(0, p)] : this.nums[L - 1] + (p - L + 1);
  },
  /* the page number as the page's section writes it */
  numText(p, num) {
    const sec = this.sec(p), f = sec.pn ? sec.pn.fmt : '1', n = this.num(p);
    if (f === '1') return num === 'bn' ? bengaliNum(n) : String(n);
    return Notes.fmt(n, f);
  },
  /* the first page of section s (-1: none) */
  firstOf(s) { const i = this.list.findIndex(e => e.s === s); return i; },
  /* where a page's sheet sits: centred in the column of pages */
  x(p) { this.ready(); return (this.maxW - this.g(p).w) / 2; },
  /* where section s's text column starts on the paper */
  colX(s) { this.ready(); const g = this.secs[s].g; return (this.maxW - g.w) / 2 + g.ml; },
  height(n) { return this.top(n - 1) + this.g(n - 1).h; },
};
