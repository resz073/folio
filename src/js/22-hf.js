/* ===================== Headers and footers =====================
   Word's headers and footers, letterheads included: paragraphs, a table to lay out a logo beside
   the office's name, pictures, lines, and fields (page number, number of pages, date, title,
   author; Bangla numbers on request). One header and one footer for every page, or separate ones
   for the first page (Different First Page) and for even pages (Different Odd & Even Pages):
   S.doc.hf = { header: { def, first, even }, footer: { def, first, even } } (HTML).
   Each sheet shows its own with the fields filled in. A header taller than the top margin pushes
   that page's text down (and a tall footer pulls its bottom up), as in Word: Layout asks
   HF.top(page, g) and HF.bot(page, g), from heights measured once per change (HF.measure).
   Double-click a header or footer (or Insert › Header › Edit Header) to edit it in place: the
   page's text dims and the header becomes the editor (S.editor points at it while it is open, so
   every command and shortcut works there) with its own undo; Close Header and Footer, Esc or a
   double-click in the text puts it back as one undo step of the document. */
const HF_KINDS = ['header', 'footer'];
const HF_VARS = ['def', 'first', 'even'];
const HF = {
  /* the header or footer open on the page (a Story), if any */
  get editing() { const c = Story.cur; return c && c.type === 'hf' ? c : null; },
  heights: {},
  /* ---------- the model ---------- */
  blank() { return { header: { def: '', first: '', even: '' }, footer: { def: '', first: '', even: '' } }; },
  /* a document from before: its left / centre / right texts become a header (or footer) */
  fromLegacy(o) {
    if (!o) return '';
    const l = o.l || '', c = o.c || '', r = o.r || '';
    if (!l && !c && !r) return '';
    const run = t => `<span style="font-size:9pt;color:#444444">${esc(t).replace(/\n/g, '<br>').replace(/\{(PAGE|PAGES|DATE|TITLE|AUTHOR)\}/g, (m, f) => this.fieldHtml(f))}</span>`;
    const slots = [[l, 'left'], [c, 'center'], [r, 'right']].filter(x => x[0]);
    if (slots.length === 1) return `<p style="text-align:${slots[0][1]};margin:0">${run(slots[0][0])}</p>`;
    const cell = (t, a) => `<td style="width:33.33%;vertical-align:top"><p style="text-align:${a};margin:0">${t ? run(t) : '<br>'}</p></td>`;
    return `<table class="hf-grid tbl-plain" style="width:100%"><tbody><tr>${cell(l, 'left')}${cell(c, 'center')}${cell(r, 'right')}</tr></tbody></table>`;
  },
  /* every document gets the model; texts from before are brought over */
  ensure(d) {
    if (!d) return d;
    const hf = d.hf && typeof d.hf === 'object' ? d.hf : this.blank();
    for (const k of HF_KINDS) {
      hf[k] = Object.assign({ def: '', first: '', even: '' }, hf[k] || {});
      const legacy = d[k];
      if (legacy && (legacy.l || legacy.c || legacy.r) && !hf[k].def) hf[k].def = this.fromLegacy(legacy);
      d[k] = { l: '', c: '', r: '' };
    }
    d.hf = hf;
    d.evenDiff = !!d.evenDiff;
    return d;
  },
  /* a document changed the old way (S.doc.header = { l, c, r }): bring it over and measure again */
  sync() {
    const d = S.doc;
    if (!d) return false;
    if (d.hf && !HF_KINDS.some(k => d[k] && (d[k].l || d[k].c || d[k].r))) return false;
    this.ensure(d);
    if (S.view !== 'web') applyPageBox(); else this.measure();
    Layout.soon();
    return true;
  },
  /* which of its section's headers a page shows: the first page's (Different First Page), an even
     page's (Different Odd & Even, by the number it shows) or the default */
  variant(p) {
    const d = S.doc, sec = Pages.sec(p);
    if (sec.first && p === Pages.firstOf(sec.i)) return 'first';
    if (d.evenDiff && Pages.num(p) % 2 === 0) return 'even';
    return 'def';
  },
  /* the section whose header (or footer) page p shows: its own, or the one it is linked to */
  src(kind, p) { const secs = Pages.ready().secs; return Sections.owner(secs, Math.min(secs.length - 1, Pages.sect(p)), kind); },
  /* a section's header or footer by its id ('0': the first section, the document's own) */
  store(sid, kind) { const d = S.doc; if (sid === '0') return d.hf[kind]; const st = d.hf.sects && d.hf.sects[sid]; return st && st[kind] ? st[kind] : null; },
  html(kind, p) { const d = S.doc; if (!d || !d.hf) return ''; const st = Sections.own(this.src(kind, p), kind); return (st && st[this.variant(p)]) || ''; },
  /* every header and footer kept: the first section's and those of the sections with their own */
  stores(d = S.doc) {
    const out = [];
    if (!d || !d.hf) return out;
    for (const k of HF_KINDS) out.push(d.hf[k]);
    for (const st of Object.values(d.hf.sects || {})) for (const k of HF_KINDS) if (st[k]) out.push(st[k]);
    return out;
  },
  empty(html) {
    if (!html) return true;
    if (/<(img|table|hr)\b|class="hff"|border-(top|bottom)/i.test(html)) return false;
    return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;|[\s\u200B]/g, '');
  },
  /* ---------- fields ---------- */
  FIELDS: { PAGE: 'Page number', PAGES: 'Number of pages', DATE: 'Date', BSDATE: 'Date (বঙ্গাব্দ)', TITLE: 'Title', AUTHOR: 'Author' },
  value(f, p, n, num) {
    const bn = num === 'bn', d = S.doc;
    const digits = s => (bn ? String(s).replace(/\d/g, x => '০১২৩৪৫৬৭৮৯'[x]) : String(s));
    // the number the page shows: its section's numbering and format
    if (f === 'PAGE') return S.doc && Pages.secs ? Pages.numText(p, num) : digits(p + 1);
    if (f === 'PAGES') return bn || (d && d.pn && d.pn.fmt === 'bn') ? bengaliNum(n) : String(n);
    if (f === 'DATE') return BnDate.fmt(new Date(), bn ? 'g-bn-plain' : 'en-dmy');
    if (f === 'BSDATE') return BnDate.fmt(new Date(), 'bs');
    if (f === 'TITLE') return (d && d.title) || '';
    if (f === 'AUTHOR') return (d && d.props && d.props.author) || Prefs.author || Cap.name || '';
    return '';
  },
  fieldHtml(f, num) { return `<span class="hff" data-f="${f}"${num ? ` data-num="${num}"` : ''} contenteditable="false">${esc(this.value(f, 0, (S && S.pages) || 1, num))}</span>`; },
  fill(root, p, n) { root.querySelectorAll('span.hff').forEach(s => { s.textContent = this.value(s.dataset.f, p, n, s.dataset.num); }); },
  /* the marks the layout puts on the text (table edges, bordered paragraph groups, line heights,
     decimal tabs), on a header's or footer's HTML wherever it is shown */
  decorate(root) {
    if (!root) return;
    // shapes in it (a header's, one laid out for a Word file) are drawn at once
    if (root.querySelector && root.querySelector('span.shp')) root.querySelectorAll('span.shp').forEach(sh => { if (!sh.shadowRoot || !sh.shadowRoot.firstChild) Shapes.render(sh); });
    const live = S.editor;
    S.editor = root;
    try { LineH.layout(null); Tables.markAll(); markParaGroups(); DecAlign.layout(); }
    catch (e) { console.warn(e); }
    finally { S.editor = live; }
  },
  /* ---------- sizes ---------- */
  measure() {
    const d = S.doc;
    if (!d || !d.hf) return false;
    const e = this.editing, secs = Pages.ready().secs;
    let box = this._box;
    if (!box) box = this._box = h('div', { class: 'hfx doc hf-measure', 'aria-hidden': 'true' });
    if (!box.isConnected) $('#paper').appendChild(box);
    const out = {};
    let changed = false;
    // each section's header and footer at its own column's width (a linked one too: it is laid out
    // again on that section's pages)
    secs.forEach((sec, si) => {
      for (const k of HF_KINDS) {
        const src = Sections.owner(secs, si, k), st = Sections.own(src, k) || { def: '', first: '', even: '' };
        for (const v of HF_VARS) {
          let hgt = 0;
          if (e && e.kind === k && e.variant === v && e.src === src.sid && e.sec === si) hgt = this.empty(e.el.innerHTML) ? 0 : e.el.offsetHeight;
          else if (!this.empty(st[v])) hgt = this.heightOf(st[v], sec.g.cw, box);
          const key = si + ':' + k + ':' + v;
          out[key] = hgt;
          if (Math.abs((this.heights[key] || 0) - hgt) > 0.5) changed = true;
        }
      }
    });
    this.heights = out;
    return changed;
  },
  _hc: new Map(),
  heightOf(html, cw, box) {
    const key = fmtNum(cw, 1) + '|' + html.length + '|' + hash53(html);
    let v = this._hc.get(key);
    if (v == null) {
      box.style.width = cw + 'px';
      box.innerHTML = html;
      this.decorate(box);
      v = box.offsetHeight;
      box.querySelectorAll('img').forEach(im => { if (!im.complete) im.addEventListener('load', () => { this._hc.clear(); if (this.measure()) this.refresh(); }, { once: true }); });
      box.innerHTML = '';
      if (this._hc.size > 300) this._hc.clear();
      this._hc.set(key, v);
    }
    return v;
  },
  /* fonts or sizes changed: heights measured again */
  reset() { this._hc.clear(); },
  /* after a change to the headers or footers: their heights, the first page's top, the pages */
  refresh() { if (S.view !== 'web') applyPageBox(); else this.measure(); Layout.full(); },
  /* where a page's text starts and how far from the bottom it ends */
  top(p, g) { const hh = this.heights[Pages.sect(p) + ':header:' + this.variant(p)] || 0; return hh ? Math.max(g.mt, g.hd + hh) : g.mt; },
  bot(p, g) { const fh = this.heights[Pages.sect(p) + ':footer:' + this.variant(p)] || 0; return fh ? Math.max(g.mb, g.fd + fh) : g.mb; },
  /* ---------- on the sheets ---------- */
  sheetHtml(i, n, g) {
    const d = S.doc;
    if (!d.hf) return '';
    let out = '';
    for (const k of HF_KINDS) {
      const html = this.html(k, i);
      if (this.empty(html)) continue;
      const e = this.editing, live = e && e.p === i && e.kind === k;
      out += `<div class="hfx doc ${k === 'header' ? 'hdr' : 'ftr'}${live ? ' hf-hidden' : ''}" style="${k === 'header' ? `top:${g.hd}px` : `bottom:${g.fd}px`};left:${g.ml}px;width:${g.cw}px">${html}</div>`;
    }
    return out;
  },
  /* what a sheet's header and footer depend on: their HTML, the page being edited, and the
     number of pages, title or author only when a field shows them */
  sheetSig(i, n) {
    const e = this.editing, d = S.doc, html = this.html('header', i) + '|' + this.html('footer', i);
    let sig = html.length + ':' + hash53(html) + (e && e.p === i ? ':' + e.kind : '');
    if (html.includes('data-f="PAGES"')) sig += ':n' + n;
    if (html.includes('data-f="TITLE"')) sig += ':t' + d.title;
    if (html.includes('data-f="AUTHOR"')) sig += ':a' + ((d.props && d.props.author) || Prefs.author || '');
    if (html.includes('data-f="DATE"')) sig += ':d' + new Date().toDateString();
    return sig;
  },
  /* which page and part (header or footer) a point on screen is in */
  hit(x, y) {
    const sheets = Array.from($('#sheets').children), z = S.zoom;
    for (let p = 0; p < sheets.length; p++) {
      const r = sheets[p].getBoundingClientRect(), g = Pages.g(p);
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const iy = (y - r.top) / z;
      if (iy < this.top(p, g) - 2) return { p, kind: 'header' };
      if (iy > g.h - this.bot(p, g) + 2) return { p, kind: 'footer' };
      return null;
    }
    return null;
  },
  /* ---------- editing in place ---------- */
  edit(kind = 'header', p) {
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to change the header or footer.'); return false; }
    if (S.view !== 'print') setView('print');
    p = clamp(p == null ? (S.curPage || 1) - 1 : p, 0, Math.max(0, S.pages - 1));
    const cur = this.editing;
    if (cur && cur.kind === kind && cur.p === p) { cur.el.focus(); return true; }
    if (Story.cur) Story.close(!!cur);
    const d = S.doc, variant = this.variant(p);
    // the header this page shows: its section's own, or the one it is linked to (changed there)
    const si = Pages.sect(p), src = this.src(kind, p), sid = src.sid || '0';
    const store = () => this.store(sid, kind) || { def: '', first: '', even: '' };
    const el = h('div', { class: 'hfx doc hf-live ' + (kind === 'header' ? 'hdr' : 'ftr'), contenteditable: 'true', spellcheck: Prefs.spell ? 'true' : 'false', role: 'textbox', 'aria-multiline': 'true', 'aria-label': (variant === 'first' ? 'First page ' : variant === 'even' ? 'Even page ' : '') + (kind === 'header' ? 'header' : 'footer') + (Pages.multi() ? ', section ' + (si + 1) : ''), lang: d.lang || 'en-US' });
    el.innerHTML = store()[variant] || '<p><br></p>';
    if (S.marks) el.classList.add('show-marks');
    this.fill(el, p, S.pages);
    const band = h('div', { class: 'hf-band ' + kind, 'aria-hidden': 'true' }, h('span', { class: 'hf-tag' }, this.label(kind, variant, si)));
    if (si > 0 && !Sections.own(Pages.secs[si], kind)) band.appendChild(h('span', { class: 'hf-tag hf-same' }, 'Same as Previous'));
    const before = store()[variant] || '';
    Story.open({
      type: 'hf', kind, variant, p, sec: si, src: sid, el, band, extras: [band], dim: true, tab: 'hf',
      place: () => this.place(),
      // a height that changed moves the page's text (Layout.run)
      changed: () => { this.decorate(el); return this.measure(); },
      clean: x => this.clean(x),
      save: (html, quiet) => {
        const st = this.store(sid, kind);
        if (!st) return false;
        if (quiet) { st[variant] = html; return false; }
        if (this.same(html, before)) { st[variant] = before; return false; }
        st[variant] = html;
        return true;
      },
      after: () => this.refresh(),
    });
    caretAtStart(el.firstElementChild || el);
    const rr = el.getBoundingClientRect(), c = $('#canvas').getBoundingClientRect();
    if (rr.top < c.top || rr.bottom > c.bottom) el.scrollIntoView({ block: 'center' });
    return true;
  },
  /* Word's tag under the header's dashed line: Header, First Page Header, Even Page Footer… */
  label(kind, variant, si) {
    const k = kind === 'header' ? 'Header' : 'Footer';
    const sec = Pages.multi() && si != null ? ` -Section ${si + 1}-` : '';
    if (variant === 'first') return 'First Page ' + k + sec;
    if (variant === 'even') return 'Even Page ' + k + sec;
    return (S.doc.evenDiff ? 'Odd Page ' + k : k) + sec;
  },
  place() {
    const e = this.editing;
    if (!e) return;
    const g = Pages.g(e.p), gp = Grid.pos(e.p);
    Object.assign(e.el.style, { left: gp.x + g.ml + 'px', width: g.cw + 'px', top: (e.kind === 'header' ? gp.y + g.hd : gp.y + g.h - g.fd) + 'px', transform: e.kind === 'footer' ? 'translateY(-100%)' : '' });
    const t = this.top(e.p, g), b = this.bot(e.p, g);
    Object.assign(e.band.style, { left: gp.x + 'px', width: g.w + 'px', top: (e.kind === 'header' ? gp.y : gp.y + g.h - b) + 'px', height: (e.kind === 'header' ? t : b) + 'px' });
  },
  /* the header's HTML as it is kept: the fields' text is filled in again on each page */
  clean(el) { const html = cleanHTML(el); return this.empty(html) ? '' : html; },
  /* the same header whichever page filled its fields in */
  same(a, b) { const c = s => String(s || '').replace(/(<span class="hff"[^>]*>)[^<]*(<\/span>)/g, '$1$2'); return c(a) === c(b); },
  close(keepTab) { if (this.editing) Story.close(keepTab); },
  /* a change to the options while editing: put it back, change, and open the same place again */
  reopen(fn) {
    const e = this.editing;
    const at = e ? { kind: e.kind, p: e.p } : null;
    if (e) this.close(true);
    change(fn, { full: true });
    this.refresh();
    if (at) this.edit(at.kind, Math.min(at.p, S.pages - 1));
  },
  /* As in Word, Different First Page gives page 1 a header and footer of its own, empty at first
     (letters don't number their first page). Turned off, a first page's header or footer that
     the other pages lack goes on every page rather than out of sight. */
  firstModel(d, on) {
    on = !!on;
    if (!on && d.firstDiff) this.firstOff([d.hf.header, d.hf.footer], d.evenDiff);
    d.firstDiff = on;
  },
  /* a first page's header that the other pages lack goes on every page rather than out of sight */
  firstOff(stores, even) { for (const st of stores) if (st && this.empty(st.def) && !this.empty(st.first)) { st.def = st.first; if (even && this.empty(st.even)) st.even = st.first; } },
  /* Different First Page for the section of the page being edited (or at the caret) */
  firstOn(sec) { return sec.i === 0 ? !!S.doc.firstDiff : sec.first; },
  setFirst(on) {
    const sec = this.curSec();
    this.reopen(() => {
      if (sec.i === 0) { this.firstModel(S.doc, on); return; }
      const el = Sections.breaks()[sec.i - 1];
      if (!el) return;
      if (!on && el.dataset.first === '1') this.firstOff(HF_KINDS.map(k => this.store(el.dataset.sid || '', k)), S.doc.evenDiff);
      Sections.setFirst({ i: sec.i, el }, on);
    });
  },
  /* the section of the page being edited, or of the caret */
  curSec() { const e = this.editing; const secs = Pages.ready().secs; return e ? secs[Math.min(secs.length - 1, e.sec)] : (Sections.selected()[0] || secs[0]); },
  /* even pages start with a copy of the odd pages' header, to change */
  setEven(on) {
    this.reopen(() => {
      const d = S.doc;
      if (on) for (const st of this.stores(d)) if (this.empty(st.even) && !this.empty(st.def)) st.even = st.def;
      d.evenDiff = !!on;
    });
  },
  /* Header from Top / Footer from Bottom: the section's */
  setDistance(which, px) {
    const sec = this.curSec(), key = which === 'header' ? 'hd' : 'fd';
    if (!(px >= 0) || Math.abs(sec.pg[key] - px) < 0.05) return;
    this.reopen(() => { const s2 = Sections.list()[sec.i]; if (s2) Sections.setPg(s2, { [key]: Math.round(px * 10) / 10 }); applyDocSettings(); });
  },
  /* Link to Previous: this section shows the header (or footer) of the one before, or a copy of
     its own to change (Word's button on the Header & Footer tab) */
  linked(kind, si) { const secs = Pages.ready().secs; return si > 0 && si < secs.length && !Sections.own(secs[si], kind); },
  setLink(on) {
    const e = this.editing;
    if (!e || !e.sec) { toast('The first section has nothing before it to link to.'); return; }
    const kind = e.kind, si = e.sec;
    this.reopen(() => {
      Sections.adopt();
      const secs = Sections.list(), sec = secs[si];
      if (!sec) return;
      const d = S.doc, st = d.hf.sects = d.hf.sects || {};
      if (on) {
        if (st[sec.sid]) { delete st[sec.sid][kind]; if (!st[sec.sid].header && !st[sec.sid].footer) delete st[sec.sid]; }
      } else {
        const from = Sections.own(Sections.owner(secs, si - 1, kind), kind) || { def: '', first: '', even: '' };
        (st[sec.sid] = st[sec.sid] || {})[kind] = { def: from.def || '', first: from.first || '', even: from.even || '' };
      }
      if (!Object.keys(st).length) delete d.hf.sects;
    });
  },
  go(kind) { const e = this.editing; this.edit(kind, e ? e.p : undefined); },
  step(dir) {
    const e = this.editing;
    if (!e) return;
    // the next page with a different header (first, odd, even pages; another section's), as Word's Previous/Next
    const key = q => this.src(e.kind, q).i + ':' + this.variant(q);
    const k0 = key(e.p);
    let p = e.p + dir;
    while (p >= 0 && p < S.pages && key(p) === k0) p += dir;
    if (p < 0 || p >= S.pages) { toast(dir > 0 ? 'No later page has a different ' + e.kind + '.' : 'No earlier page has a different ' + e.kind + '.'); return; }
    this.edit(e.kind, p);
  },
  /* Remove Header: the one the current page shows (its section's, or the one it is linked to) */
  remove(kind) {
    const e = this.editing;
    const p = e ? e.p : Math.max(0, (S.curPage || 1) - 1);
    const sid = this.src(kind, p).sid || '0';
    this.reopen(() => { const st = this.store(sid, kind); if (st) for (const v of HF_VARS) st[v] = ''; });
    if (this.editing && this.editing.kind === kind) this.close();
    toast(kind === 'header' ? 'Header removed.' : 'Footer removed.');
  },
  /* put a field (page number, date…) at the caret while editing */
  field(f, num) {
    if (!this.editing) { this.edit(f === 'PAGE' || f === 'PAGES' ? 'footer' : 'header'); }
    const r = getRange();
    if (!r) return;
    change(() => {
      const t = document.createElement('template');
      t.innerHTML = this.fieldHtml(f, num);
      const sp = t.content.firstChild;
      this.fill(sp.parentNode || t.content, this.editing.p, S.pages);
      r.deleteContents();
      r.insertNode(sp);
      caretAfter(sp);
    });
  },
  /* Word's pictures in front of / behind the text in a header (a logo, a seal): placed from the
     page and margins once the header is laid out, as PicEdit.settle does for the text */
  async settle() {
    const d = S.doc, secs = Sections.list();
    let any = false;
    // each section's own headers, at its page's size
    const jobs = HF_KINDS.map(k => ({ st: d.hf[k], k, g: secs[0].g }));
    for (const [sid, o] of Object.entries(d.hf.sects || {})) { const sec = secs.find(x => x.sid === sid) || secs[0]; for (const k of HF_KINDS) if (o[k]) jobs.push({ st: o[k], k, g: sec.g }); }
    const box = h('div', { class: 'hfx doc hf-measure', 'aria-hidden': 'true' });
    $('#paper').appendChild(box);
    try {
      for (const { st, k, g } of jobs) for (const v of HF_VARS) {
        const html = st[v];
        if (!html || !/data-f[xy]=/.test(html)) continue;
        box.style.width = g.cw + 'px';
        box.innerHTML = html;
        const imgs = Array.from(box.querySelectorAll('img[data-fx], img[data-fy]'));
        await Promise.all(Array.from(box.querySelectorAll('img')).map(im => (im.decode ? im.decode().catch(() => { }) : null)));
        for (const img of imgs) { const b = img.parentElement && img.parentElement.closest('p, h1, h2, h3, h4, h5, h6, li, td, th'); if (b && b.firstChild !== img) b.insertBefore(img, b.firstChild); if (b) PicEdit.keepLine(b); }
        this.decorate(box);
        const H = box.offsetHeight;
        const ox = g.ml, oy = k === 'header' ? g.hd : g.h - g.fd - H;
        const br = box.getBoundingClientRect();
        for (const img of imgs) {
          const b = img.parentElement;
          const [hr, ho, ha] = (img.getAttribute('data-fx') || 'column||').split('|');
          const [vr, vo, va] = (img.getAttribute('data-fy') || 'paragraph||').split('|');
          img.removeAttribute('data-fx'); img.removeAttribute('data-fy');
          if (!b || b === box) continue;
          const r = b.getBoundingClientRect(), z = S.zoom || 1;
          const bx = ox + (r.left - br.left) / z + b.clientLeft, by = oy + (r.top - br.top) / z + b.clientTop;
          const w = img.offsetWidth, hh = img.offsetHeight;
          const areaH = { page: [0, g.w], leftMargin: [0, g.ml], rightMargin: [g.w - g.mr, g.w], insideMargin: [0, g.ml], outsideMargin: [g.w - g.mr, g.w] }[hr] || [g.ml, g.w - g.mr];
          const X = ho !== '' ? areaH[0] + +ho : ha === 'center' ? (areaH[0] + areaH[1] - w) / 2 : (ha === 'right' || ha === 'outside') ? areaH[1] - w : areaH[0];
          img.style.left = round1(X - bx) + 'px';
          if (vr === 'paragraph' || vr === 'line' || !vr) img.style.top = round1(vo !== '' ? +vo : 0) + 'px';
          else {
            const areaV = { page: [0, g.h], topMargin: [0, g.mt], bottomMargin: [g.h - g.mb, g.h], insideMargin: [0, g.mt], outsideMargin: [g.h - g.mb, g.h] }[vr] || [g.mt, g.h - g.mb];
            const Y = vo !== '' ? areaV[0] + +vo : va === 'center' ? (areaV[0] + areaV[1] - hh) / 2 : (va === 'bottom' || va === 'outside') ? areaV[1] - hh : areaV[0];
            img.style.top = round1(Y - by) + 'px';
          }
        }
        st[v] = this.clean(box);
        any = true;
      }
    } finally { box.remove(); }
    if (any) this.refresh();
    return any;
  },
  /* ---------- designs ---------- */
  LOGO: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect x="2" y="2" width="156" height="156" rx="10" fill="#f3f5f4" stroke="#9aa59f" stroke-width="3" stroke-dasharray="10 7"/><text x="80" y="88" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#7a857f" text-anchor="middle">LOGO</text></svg>'),
  designs() {
    const logo = `<img src="${this.LOGO}" alt="Logo" style="width:72px;height:72px">`;
    const line = 'border-bottom:1.5pt solid #1f3a5f;padding-bottom:4pt';
    const rule = 'margin:4pt 0 0;line-height:2pt;border-bottom:1.5pt solid #1f3a5f';
    return [
      { id: 'centre', name: 'Letterhead: name and address, centred', html: `<p style="text-align:center;margin:0"><span style="font-size:18pt;font-weight:700;color:#1f3a5f">[Organization name]</span></p><p style="text-align:center;margin:0"><span style="font-size:10pt">[Address line]</span></p><p style="text-align:center;margin:0 0 6pt;${line}"><span style="font-size:9pt">Phone: [phone] · Email: [email] · [website]</span></p>` },
      { id: 'logo', name: 'Letterhead: logo on the left', html: `<table class="hf-grid tbl-plain" style="width:100%"><tbody><tr><td style="width:84px;vertical-align:middle"><p style="margin:0">${logo}</p></td><td style="vertical-align:middle"><p style="margin:0"><span style="font-size:18pt;font-weight:700;color:#1f3a5f">[Organization name]</span></p><p style="margin:0"><span style="font-size:10pt">[Address line]</span></p><p style="margin:0"><span style="font-size:9pt">Phone: [phone] · Email: [email]</span></p></td></tr></tbody></table><p style="${rule}"><br></p>` },
      { id: 'bn', name: 'Letterhead: Bangla and English, logo between', html: `<table class="hf-grid tbl-plain" style="width:100%"><tbody><tr><td style="width:40%;vertical-align:middle"><p style="margin:0"><span style="font-size:14pt;font-weight:700;color:#1f3a5f">[প্রতিষ্ঠানের নাম]</span></p><p style="margin:0"><span style="font-size:9pt">[ঠিকানা]</span></p></td><td style="width:20%;vertical-align:middle"><p style="text-align:center;margin:0">${logo}</p></td><td style="width:40%;vertical-align:middle"><p style="text-align:right;margin:0"><span style="font-size:14pt;font-weight:700;color:#1f3a5f">[Organization name]</span></p><p style="text-align:right;margin:0"><span style="font-size:9pt">[Address]</span></p></td></tr></tbody></table><p style="text-align:center;margin:2pt 0 6pt;${line}"><span style="font-size:9pt">[phone] · [email] · [website]</span></p>` },
      { id: 'simple', name: 'Title on the left, page number on the right', html: `<table class="hf-grid tbl-plain" style="width:100%"><tbody><tr><td style="width:70%"><p style="margin:0"><span style="font-size:9pt;color:#444444">${this.fieldHtml('TITLE')}</span></p></td><td style="width:30%"><p style="text-align:right;margin:0"><span style="font-size:9pt;color:#444444">Page ${this.fieldHtml('PAGE')}</span></p></td></tr></tbody></table>` },
    ];
  },
  /* a design into the header (a letterhead goes on the first page, as letters have it) */
  useDesign(id) {
    const ds = this.designs().find(x => x.id === id);
    if (!ds) return;
    const letter = id !== 'simple';
    // while a footer is open: the same page's header (a design goes where the header is being edited)
    if (this.editing && this.editing.kind !== 'header') this.go('header');
    if (!this.editing) {
      if (letter && !S.doc.firstDiff) change(() => { S.doc.firstDiff = true; }, { full: true });
      this.refresh();
      if (!this.edit('header', letter ? 0 : undefined)) return;
    }
    const el = this.editing.el;
    change(() => { el.innerHTML = ds.html; this.fill(el, this.editing.p, S.pages); });
    this.pickPlaceholder(el);
    if (letter && S.doc.firstDiff && this.editing.variant === 'first') toast('The letterhead is on the first page. Untick Different First Page to have it on every page.', { ms: 6000 });
  },
  /* the first [Organization name]-style placeholder selected, to type over (F11 goes on to the next) */
  pickPlaceholder(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const m = /\[[^\]\n]{1,60}\]/.exec(t.data);
      if (!m) continue;
      const r = document.createRange();
      r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
      setRange(r);
      return true;
    }
    caretAtStart(el.querySelector('p') || el);
    return false;
  },
  /* Insert › Page Number: a paragraph with the number, in the footer (or header) of every page
     but a different first page (letters don't number their first page) */
  pageNumbers(kind, align, fmt, num, opts = {}) {
    const P = this.fieldHtml('PAGE', num), N = this.fieldHtml('PAGES', num);
    // 1 · Page 1 of 3 · পৃষ্ঠা ১ · পৃষ্ঠা ১ এর ৩ · - ১ - · ১/৩
    const run = fmt === 'of' ? (num === 'bn' ? `পৃষ্ঠা ${P} এর ${N}` : `Page ${P} of ${N}`) : fmt === 'bn' ? `পৃষ্ঠা ${num ? P : this.fieldHtml('PAGE', 'bn')}` : fmt === 'dash' ? `- ${P} -` : fmt === 'slash' ? `${P}/${N}` : P;
    const para = `<p style="text-align:${align};margin:0" data-pn=""><span style="font-size:9pt">${run}</span></p>`;
    const was = !!this.editing;
    // the footer (or header) the current page shows: its section's, or the one it is linked to
    const e = this.editing, p = e ? e.p : Math.max(0, (S.curPage || 1) - 1);
    const src = this.src(kind, p), sid = src.sid || '0';
    const okind = kind === 'footer' ? 'header' : 'footer', osrc = this.src(okind, p);
    const cur = Pages.ready().secs[Math.min(Pages.secs.length - 1, Pages.sect(p))];
    const first = opts.fromSecond && !this.firstOn(cur);
    this.reopen(() => {
      const d = S.doc, st = this.store(sid, kind);
      if (!st) return;
      this.stripNumbers(d, [st]);
      // one set of page numbers: those this menu put in the footer go when they go in the header
      const ost = this.store(osrc.sid || '0', okind);
      if (ost) for (const v of HF_VARS) if (st !== ost && ost[v] && /data-pn=/.test(ost[v])) { const box = document.createElement('div'); box.innerHTML = ost[v]; box.querySelectorAll('[data-pn]').forEach(x => x.remove()); ost[v] = this.empty(box.innerHTML) ? '' : box.innerHTML; }
      // from page 2 (as in government letters): Different First Page, the first page keeping what it showed
      if (first) {
        for (const s2 of [st, ost]) if (s2 && this.empty(s2.first) && !this.empty(s2.def)) s2.first = s2.def;
        if (cur.i === 0) this.firstModel(d, true); else { const el = Sections.breaks()[cur.i - 1]; if (el) Sections.setFirst({ i: cur.i, el }, true); }
      }
      for (const v of ['def'].concat(d.evenDiff ? ['even'] : [])) st[v] = kind === 'footer' ? (st[v] || '') + para : para + (st[v] || '');
    });
    if (!was) toast(first || this.firstOn(cur) ? (num === 'bn' ? 'Page numbers added from page 2 (the first page has none).' : 'Page numbers added, except on the first page (Different First Page).') : 'Page numbers added.');
  },
  /* page numbers out: the paragraphs Page Number put in go, and in other paragraphs the
     number with its "Page … of …" words (a paragraph left with nothing else goes too) */
  stripNumbers(d, stores) {
    const words = /^[\s|·•\-–—]*((page|pg\.?|p\.|পৃষ্ঠা|পাতা)\s*)?((of|\/|এর)\s*)?[\s|·•\-–—]*$/i;
    for (const st of stores || this.stores(d)) for (const v of HF_VARS) {
      if (!st[v] || !/data-f="PAGES?"/.test(st[v])) continue;
      const box = document.createElement('div');
      box.innerHTML = st[v];
      box.querySelectorAll('[data-pn]').forEach(p => p.remove());
      for (const s of Array.from(box.querySelectorAll('span.hff[data-f="PAGE"], span.hff[data-f="PAGES"]'))) {
        if (!s.isConnected) continue;
        const b = s.parentNode.closest('p, h1, h2, h3, h4, h5, h6, li, td, th') || s.parentNode;
        const rest = b.cloneNode(true);
        rest.querySelectorAll('span.hff[data-f="PAGE"], span.hff[data-f="PAGES"]').forEach(x => x.remove());
        if (words.test(rest.textContent) && !rest.querySelector('img, span.hff')) {
          if (b.parentNode && /^(TD|TH)$/.test(b.parentNode.tagName) && b.parentNode.children.length === 1) b.innerHTML = '<br>';
          else if (/^(TD|TH)$/.test(b.tagName)) b.innerHTML = '<p><br></p>';
          else b.remove();
          continue;
        }
        const prev = s.previousSibling, next = s.nextSibling;
        if (prev && prev.nodeType === 3) prev.data = prev.data.replace(/(page|pg\.?|পৃষ্ঠা)\s*$/i, '');
        if (next && next.nodeType === 3) next.data = next.data.replace(/^\s*(of|\/|এর)\s*$/i, '');
        s.remove();
      }
      st[v] = this.empty(box.innerHTML) ? '' : box.innerHTML;
    }
  },
  removeNumbers() {
    this.reopen(() => this.stripNumbers(S.doc));
    toast('Page numbers removed.');
  },
  /* Page Number › Bangla Digits: every page number and page count in the headers and footers in
     ১, ২, ৩ (sections numbered 1, 2, 3 too, so the table of contents follows), "Page … of …" read
     "পৃষ্ঠা … এর …"; or all back */
  bnNumbersOn() {
    const secs = Sections.list();
    if (secs.length && secs.every(s => s.pn && s.pn.fmt === 'bn')) return true;
    let any = false, all = true;
    for (const st of this.stores(S.doc)) for (const v of HF_VARS) {
      if (!st[v] || !/data-f="PAGE"/.test(st[v])) continue;
      const box = document.createElement('div'); box.innerHTML = st[v];
      for (const s of box.querySelectorAll('span.hff[data-f="PAGE"]')) { any = true; if (s.dataset.num !== 'bn') all = false; }
    }
    return any && all;
  },
  bnNumbers(on) {
    on = !!on;
    this.reopen(() => {
      for (const st of this.stores(S.doc)) for (const v of HF_VARS) {
        if (!st[v] || !/data-f="PAGES?"/.test(st[v])) continue;
        const box = document.createElement('div'); box.innerHTML = st[v];
        for (const s of box.querySelectorAll('span.hff[data-f="PAGE"], span.hff[data-f="PAGES"]')) {
          if (on) s.dataset.num = 'bn'; else s.removeAttribute('data-num');
          const prev = s.previousSibling, next = s.nextSibling;
          if (prev && prev.nodeType === 3) prev.data = on ? prev.data.replace(/\bPage(\s*)$/i, 'পৃষ্ঠা$1') : prev.data.replace(/পৃষ্ঠা(\s*)$/, 'Page$1');
          if (next && next.nodeType === 3) next.data = on ? next.data.replace(/^(\s*)of(\s*)$/i, '$1এর$2') : next.data.replace(/^(\s*)এর(\s*)$/, '$1of$2');
        }
        st[v] = box.innerHTML;
      }
      for (const s of Sections.list()) {
        const pn = s.pn || { start: null, fmt: '1' };
        if (on && (pn.fmt || '1') === '1') Sections.setPn(s, Object.assign({}, pn, { fmt: 'bn' }));
        else if (!on && pn.fmt === 'bn') Sections.setPn(s, Object.assign({}, pn, { fmt: '1' }));
      }
    });
    if (S.editor.querySelector('.toc')) Toc.update(true);
    toast(on ? 'Page numbers are in Bangla digits (১, ২, ৩).' : 'Page numbers are in English digits (1, 2, 3).');
  },
};
