/* ===================== Footnotes and endnotes =====================
   As in Word: a reference mark in the text (`sup.fn[data-fn]`, contenteditable=false; endnotes
   also have class "en") and the note's text in the model, S.doc.footnotes = { id: { kind:
   'foot'|'end', html } }; the marks are numbered in order (1, 2, 3 for footnotes and i, ii, iii for
   endnotes, or a, A, I, *, †, ‡ or ১, ২, ৩; S.doc.notePr = { foot: { fmt, start }, end: {...} }).
   Footnotes sit at the bottom of the page their mark is on, under a short line: the pagination
   leaves room for them (Notes.begin… in paginateUnits) and a line whose note doesn't fit goes to
   the next page with its mark. Endnotes follow the text after its last line (Notes.layoutEnd),
   running onto new pages when they must. Both are drawn on the sheets (Notes.sheetHtml) and edited
   in place: a click on a note opens it as a Story (its number stays put), Esc goes back to its
   mark. Notes whose mark was deleted stay in the model while the document is open (undo brings
   the mark back) and are left out when it is saved. */
const NOTE_FMTS = [['1', '1, 2, 3, …'], ['a', 'a, b, c, …'], ['A', 'A, B, C, …'], ['i', 'i, ii, iii, …'], ['I', 'I, II, III, …'], ['*', '*, †, ‡, §, …'], ['bn', '১, ২, ৩, …']];
const NOTE_SEL = 'sup.fn[data-fn]';
const Notes = {
  marks: new Map(),       // id -> its mark (from the last numbering)
  heights: new Map(),     // measurement key -> height in px
  fnPages: [],            // page index -> footnote ids at its bottom
  enPlaces: [],           // endnotes after the text: { id, page, y (from the page's top), sep }
  /* ---------- the model ---------- */
  all() { const d = S.doc; if (!d.footnotes || typeof d.footnotes !== 'object' || Array.isArray(d.footnotes)) d.footnotes = {}; return d.footnotes; },
  pr(kind) {
    const d = S.doc;
    if (!d.notePr) d.notePr = {};
    if (!d.notePr[kind]) d.notePr[kind] = { fmt: kind === 'end' ? 'i' : '1', start: 1 };
    return d.notePr[kind];
  },
  kindOf(ref) { const n = this.all()[ref.dataset.fn]; return n ? n.kind : (ref.classList.contains('en') ? 'end' : 'foot'); },
  refs(root = docBody()) { return root ? Array.from(root.querySelectorAll(NOTE_SEL)) : []; },
  /* a number in a note format */
  fmt(n, f) {
    if (f === 'bn') return String(n).replace(/\d/g, x => '০১২৩৪৫৬৭৮৯'[x]);
    if (f === 'bnk') return bnAlpha(n);   // ক, খ, গ
    if (f === 'a' || f === 'A') { const c = String.fromCharCode(97 + (n - 1) % 26).repeat(Math.floor((n - 1) / 26) + 1); return f === 'A' ? c.toUpperCase() : c; }
    if (f === 'i' || f === 'I') return romanize(n, f === 'I');
    if (f === '*') return ['*', '†', '‡', '§'][(n - 1) % 4].repeat(Math.floor((n - 1) / 4) + 1);
    return String(n);
  },
  /* the marks in the text numbered in order (each kind on its own); cheap, so it runs with every
     undo step (histRecord) and the page always shows the right numbers */
  renumber(root = docBody()) {
    const refs = this.refs(root);
    this.marks.clear();
    if (!refs.length) return;
    const n = { foot: 0, end: 0 };
    for (const r of refs) {
      const kind = this.kindOf(r), pr = this.pr(kind);
      r.classList.toggle('en', kind === 'end');
      const t = this.fmt((pr.start || 1) + n[kind]++, pr.fmt);
      if (r.textContent !== t) r.textContent = t;
      if (r.getAttribute('contenteditable') !== 'false') r.setAttribute('contenteditable', 'false');
      this.marks.set(r.dataset.fn, t);
    }
  },
  mark(id) { return this.marks.get(id) || '?'; },
  /* the notes the saved document keeps: those with a mark in the text */
  kept(html, notes) {
    const out = {};
    if (!notes) return out;
    const re = /data-fn="([^"]+)"/g;
    let m;
    while ((m = re.exec(html || ''))) if (notes[m[1]]) out[m[1]] = notes[m[1]];
    return out;
  },
  /* ---------- sizes ---------- */
  box(cw) {
    let b = this._box;
    if (!b) b = this._box = h('div', { class: 'fn-area doc hf-measure', 'aria-hidden': 'true' });
    if (!b.isConnected) $('#paper').appendChild(b);
    b.style.width = (cw || geom().cw) + 'px';
    return b;
  },
  noteHtml(id, live) {
    const n = this.all()[id];
    const t = document.createElement('div');
    t.innerHTML = (n && n.html) || '<p><br></p>';
    if (!t.firstElementChild || !isBlockEl(t.firstElementChild)) { const p = h('p'); while (t.firstChild) p.appendChild(t.firstChild); t.appendChild(p); }
    let first = t.firstElementChild;
    while (first && /^(UL|OL|TABLE|BLOCKQUOTE)$/.test(first.tagName)) first = first.tagName === 'TABLE' ? null : first.querySelector('li, p') || null;
    const num = h('sup', { class: 'fnn', contenteditable: 'false' }, this.mark(id));
    if (first) first.insertBefore(num, first.firstChild);
    else t.insertBefore(h('p', null, num), t.firstChild);
    if (live && first && first.childNodes.length === 1) first.appendChild(h('br'));
    return t.innerHTML;
  },
  /* a note's height under the page (its number included); measured once per text and width (the
     column of the page it is on) */
  h(id, cw) {
    if (this.live && this.live.id === id) return this.live.h;   // the one being edited: as it is now
    const n = this.all()[id];
    cw = cw || geom().cw;
    const key = id + '|' + this.mark(id) + '|' + cw + '|' + ((n && n.html) || '');
    let v = this.heights.get(key);
    if (v == null) {
      const b = this.box(cw);
      b.innerHTML = `<div class="fnote">${this.noteHtml(id)}</div>`;
      HF.decorate(b);
      v = b.firstElementChild.offsetHeight;
      b.querySelectorAll('img').forEach(im => { if (!im.complete) im.addEventListener('load', () => { this.heights.clear(); Layout.full(); }, { once: true }); });
      b.innerHTML = '';
      if (this.heights.size > 600) this.heights.clear();
      this.heights.set(key, v);
    }
    return v;
  },
  sepH() {
    if (this._sep == null) {
      const b = this.box();
      b.innerHTML = '<div class="fn-sep"><div class="fn-rule"></div></div>';
      this._sep = b.firstElementChild.offsetHeight;
      b.innerHTML = '';
    }
    return this._sep;
  },
  /* fonts, sizes or width changed */
  reset() { this.heights.clear(); this._sep = null; },
  /* ---------- pagination (called from paginateUnits) ---------- */
  /* null when the document has no footnotes; else the page bottoms the notes before `start` took */
  begin(units, start) {
    const root = S.editor;
    const refs = this.refs(root).filter(r => !r.classList.contains('en'));
    if (!refs.length) return null;
    const used = new Map();
    const first = units[start];
    const pageOf = r => Pages.at(topOf(r));
    for (const r of refs) {
      if (!first) break;
      const pos = first.compareDocumentPosition(r);
      if (!(pos & Node.DOCUMENT_POSITION_PRECEDING) || (pos & Node.DOCUMENT_POSITION_CONTAINS)) break;
      const p = pageOf(r);
      used.set(p, (used.get(p) || 0) + this.h(r.dataset.fn, Pages.g(p).cw));
    }
    const self = this;
    return {
      used,
      sep: this.sepH(),
      refsIn(u) {
        let list;
        if (u.tagName === 'TR') { const e = rowGroupEnd.get(u) || u; list = []; for (let r = u; r; r = r.nextElementSibling) { list.push(...r.querySelectorAll(NOTE_SEL)); if (r === e) break; } }
        else if (u.tagName === 'LI') list = Array.from(u.querySelectorAll(NOTE_SEL)).filter(x => x.closest('li') === u);
        else list = Array.from(u.querySelectorAll(NOTE_SEL));
        return list.filter(r => !r.classList.contains('en')).map(ref => ({ ref, h: self.h(ref.dataset.fn, Pages.g(pageOf(ref)).cw) }));
      },
      /* the room the notes take at page p's bottom, with `extra` of this block's too */
      area(p, extra) {
        const u = used.get(p) || 0, x = extra ? extra.reduce((s, r) => s + r.h, 0) : 0;
        return u || x ? u + x + this.sep : 0;
      },
      /* a block is placed: its notes go to the pages its marks are on */
      place(own) { for (const r of own) { const p = pageOf(r.ref); used.set(p, (used.get(p) || 0) + r.h); } },
      /* for each of a block's marks, the line it is on */
      lines(own, lines) {
        const z = S.zoom || 1;
        return own.map(r => {
          const edTop = S.editor.getBoundingClientRect().top + Grid.dyOf(r.ref) * z;
          const rc = r.ref.getBoundingClientRect(), y = (rc.top + rc.bottom) / 2;
          const top = (y - edTop) / z;
          let k = lines.findIndex(L => top >= L.top - 1 && top <= L.bottom + 1);
          if (k < 0) k = lines.findIndex(L => L.top > top) - 1;
          return k < 0 ? lines.length - 1 : k;
        });
      },
    };
  },
  /* after the pagination: which footnotes go on which page, and where the endnotes go */
  collect(bottom) {
    const fn = [];
    const ends = [];
    for (const r of this.refs(S.editor)) {
      if (r.classList.contains('en')) { ends.push(r.dataset.fn); continue; }
      const p = Pages.at(topOf(r));
      (fn[p] = fn[p] || []).push(r.dataset.fn);
    }
    this.fnPages = fn;
    // endnotes: after the text, above that page's footnotes; a note that doesn't fit starts the next page
    this.enPlaces = [];
    if (!ends.length) return 0;
    const fnArea = p => (fn[p] && fn[p].length ? fn[p].reduce((s, id) => s + this.h(id, Pages.g(p).cw), 0) + this.sepH() : 0);
    let p = Pages.at(Math.max(0, bottom - 1));
    let y = bottom - Pages.top(p);
    const limit = q => Pages.g(q).h - HF.bot(q, Pages.g(q)) - fnArea(q);
    let sep = true;
    for (const id of ends) {
      const hh = this.h(id, Pages.g(p).cw) + (sep ? this.sepH() : 0);
      if (y + hh > limit(p) + 0.5 && y > HF.top(p, Pages.g(p)) + 0.5) { p++; y = HF.top(p, Pages.g(p)); }
      this.enPlaces.push({ id, page: p, y, sep });
      y += hh;
      sep = false;
    }
    return p + 1;
  },
  /* ---------- on the sheets ---------- */
  sheetHtml(i, g) {
    let out = '';
    const ed = this.live, ids = this.fnPages[i];
    const note = (id, cls) => `<div class="${cls}${ed && ed.id === id ? ' note-hidden' : ''}" data-fn="${esc(id)}"${ed && ed.id === id ? ` style="height:${ed.h}px"` : ''}>${this.noteHtml(id)}</div>`;
    if (ids && ids.length) out += `<div class="fn-area doc" style="left:${g.ml}px;width:${g.cw}px;bottom:${HF.bot(i, g)}px"><div class="fn-sep"><div class="fn-rule"></div></div>${ids.map(id => note(id, 'fnote')).join('')}</div>`;
    const ens = this.enPlaces.filter(x => x.page === i);
    if (ens.length) out += `<div class="en-area doc" style="left:${g.ml}px;width:${g.cw}px;top:${ens[0].y}px">${ens[0].sep ? '<div class="fn-sep"><div class="fn-rule"></div></div>' : ''}${ens.map(x => note(x.id, 'enote')).join('')}</div>`;
    return out;
  },
  sheetSig(i) {
    const ids = (this.fnPages[i] || []).concat(this.enPlaces.filter(x => x.page === i).map(x => x.id + '@' + x.y));
    if (!ids.length) return '';
    const notes = this.all(), ed = this.live;
    return ids.map(k => { const id = k.split('@')[0]; return k + ':' + this.mark(id) + ':' + hash53((notes[id] && notes[id].html) || ''); }).join(',') + (ed ? ':' + ed.id + ':' + ed.h : '');
  },
  /* the note on a sheet under a point on screen */
  hit(x, y) {
    for (const el of $$('#sheets .fnote, #sheets .enote')) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 1 && y <= r.bottom + 1) return el.dataset.fn;
    }
    return null;
  },
  /* ---------- inserting ---------- */
  insert(kind) {
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to add notes.'); return; }
    if (Story.refuse(kind === 'end' ? 'An endnote' : 'A footnote')) return;
    if (S.view === 'web' || S.view === 'read') setView('print');
    const r = getRange();
    if (!r || !S.editor.contains(r.startContainer)) { toast('Click in the text where the note’s number should go.'); return; }
    const id = uid('n');
    let ref = null;
    change(() => {
      this.all()[id] = { kind, html: '<p><br></p>' };
      const at = getRange();
      at.collapse(false);   // after a selection, as Word
      ref = h('sup', { class: 'fn' + (kind === 'end' ? ' en' : ''), 'data-fn': id, contenteditable: 'false' }, '');
      at.insertNode(ref);
      if (S.track) { const ins = h('ins', { class: 'tc' }); ref.replaceWith(ins); ins.appendChild(ref); Track.stamp && Track.stamp(ins); }
      caretAfter(ref);
      this.renumber();
    }, { full: true });
    Layout.full();
    this.edit(id);
  },
  /* ---------- editing in place ---------- */
  edit(id, at) {
    const n = this.all()[id];
    if (!n) return false;
    if (S.readOnly) { toast('This document is read-only.'); return false; }
    if (S.view !== 'print') { setView('print'); Layout.full(); }
    if (Story.cur && Story.cur.type === 'note' && Story.cur.id === id) { Story.cur.el.focus(); return true; }
    if (Story.cur) Story.close();
    const ref = this.refs().find(r => r.dataset.fn === id);
    if (!ref) return false;
    const stat = () => $(`#sheets [data-fn="${CSS.escape(id)}"]`);
    if (!stat()) { Layout.full(); if (!stat()) return false; }
    const el = h('div', { class: 'note-live doc ' + (n.kind === 'end' ? 'enote' : 'fnote'), contenteditable: 'true', spellcheck: Prefs.spell ? 'true' : 'false', role: 'textbox', 'aria-multiline': 'true', 'aria-label': (n.kind === 'end' ? 'Endnote ' : 'Footnote ') + this.mark(id), lang: S.doc.lang || 'en-US' });
    el.innerHTML = this.noteHtml(id, true);
    if (S.marks) el.classList.add('show-marks');
    const before = n.html || '';
    this.live = { id, h: stat().offsetHeight };
    Story.open({
      type: 'note', kind: n.kind, id, el, ref,
      place: () => {
        const s = stat();
        if (!s) return;
        const pr = $('#paper').getBoundingClientRect(), r = s.getBoundingClientRect(), z = S.zoom || 1;
        Object.assign(el.style, { left: (r.left - pr.left) / z + 'px', top: (r.top - pr.top) / z + 'px', width: s.offsetWidth + 'px' });
      },
      // typing that changes the note's height moves the page's text
      changed: () => {
        this.keepNumber(el);
        const hh = el.offsetHeight;
        if (Math.abs(hh - this.live.h) < 0.5) return false;
        this.live.h = hh;
        return true;
      },
      clean: x => this.clean(x),
      // the note as it is in the model now (an undo can have replaced the model's object)
      save: (html, quiet) => {
        const cur = this.all()[id];
        if (!cur) return false;
        if (quiet) { cur.html = html; return false; }
        if (html === before) { cur.html = before; return false; }
        cur.html = html;
        return true;
      },
      after: () => { this.live = null; Layout.full(); },
      caret: () => { const rr = document.createRange(); if (!ref.isConnected) return null; rr.setStartAfter(ref.closest('ins.tc') || ref); rr.collapse(true); return rr; },
    });
    // the caret where the note was clicked, else at the end of its text
    let placed = false;
    if (at) {
      const pos = document.caretPositionFromPoint ? document.caretPositionFromPoint(at.x, at.y) : null;
      const rr = pos ? (() => { const x = document.createRange(); x.setStart(pos.offsetNode, pos.offset); return x; })() : (document.caretRangeFromPoint ? document.caretRangeFromPoint(at.x, at.y) : null);
      if (rr && el.contains(rr.startContainer) && !rr.startContainer.parentNode.closest('sup.fnn')) { rr.collapse(true); setRange(rr); placed = true; }
    }
    if (!placed) {
      const last = el.lastElementChild || el;
      const rr = document.createRange();
      rr.selectNodeContents(last);
      rr.collapse(false);
      if (last.lastChild && last.lastChild.nodeName === 'BR') rr.setStartBefore(last.lastChild);
      setRange(rr);
    }
    const rr = el.getBoundingClientRect(), c = $('#canvas').getBoundingClientRect();
    if (rr.top < c.top || rr.bottom > c.bottom) el.scrollIntoView({ block: 'center' });
    UI.refresh();
    return true;
  },
  /* the note's number is not text: put back if it was deleted */
  keepNumber(el) {
    if (el.querySelector('sup.fnn')) return;
    const first = el.querySelector('p, li, h1, h2, h3, h4, h5, h6') || el;
    first.insertBefore(h('sup', { class: 'fnn', contenteditable: 'false' }, this.mark(this.live ? this.live.id : '')), first.firstChild);
  },
  clean(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('sup.fnn').forEach(s => s.remove());
    // the space Word keeps after the number is the number's own margin here
    const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    const t = w.nextNode();
    if (t && /^[  ]/.test(t.data)) t.data = t.data.replace(/^[  ]+/, '');
    const html = cleanHTML(c);
    return html.replace(/<[^>]+>|&nbsp;|\s/g, '') ? html : '<p><br></p>';
  },
  /* the mark of the note being edited (Word's "Go to Reference") */
  goRef(id) {
    const ref = this.refs().find(r => r.dataset.fn === id);
    if (Story.cur && Story.cur.type === 'note') Story.close();
    if (!ref) return;
    ref.scrollIntoView({ block: 'center' });
    caretAfter(ref.closest('ins.tc') || ref);
  },
  /* Next / Previous Footnote or Endnote: the caret to the next mark */
  step(kind, dir) {
    if (Story.cur) Story.close();
    const refs = this.refs().filter(r => (kind === 'end') === r.classList.contains('en'));
    if (!refs.length) { toast(kind === 'end' ? 'This document has no endnotes.' : 'This document has no footnotes.'); return; }
    const r = getRange();
    let target = null;
    if (!r) target = dir > 0 ? refs[0] : refs[refs.length - 1];
    else if (dir > 0) target = refs.find(x => r.comparePoint(x, 0) > 0 && !(r.endContainer === x.parentNode && Array.prototype.indexOf.call(x.parentNode.childNodes, x) < r.endOffset)) || null;
    else target = [...refs].reverse().find(x => { const rr = document.createRange(); rr.setStartAfter(x); return rr.compareBoundaryPoints(Range.START_TO_START, r) < 0; }) || null;
    if (!target) { toast(dir > 0 ? 'No more notes after this point.' : 'No notes before this point.'); return; }
    target.scrollIntoView({ block: 'center' });
    caretAfter(target.closest('ins.tc') || target);
  },
  /* the note at the caret (or its mark) */
  atCaret() {
    if (Story.cur && Story.cur.type === 'note') return Story.cur.id;
    const r = getRange();
    if (!r) return null;
    const n = r.startContainer.nodeType === 1 ? r.startContainer.childNodes[r.startOffset - 1] || r.startContainer : r.startContainer;
    const ref = n && (n.nodeType === 1 && n.matches && n.matches(NOTE_SEL) ? n : (n.parentNode && n.parentNode.closest && n.parentNode.closest(NOTE_SEL)));
    return ref ? ref.dataset.fn : null;
  },
  /* Show Notes: the note of the mark at the caret, else the notes of this page or the endnotes */
  show() {
    const id = this.atCaret();
    if (id) { if (Story.cur && Story.cur.type === 'note') this.goRef(id); else this.edit(id); return; }
    const refs = this.refs();
    if (!refs.length) { toast('This document has no footnotes or endnotes yet. References › Insert Footnote adds one.'); return; }
    const p = (S.curPage || 1) - 1;
    const ids = this.fnPages[p] && this.fnPages[p].length ? this.fnPages[p] : (this.enPlaces.length ? [this.enPlaces[0].id] : [refs[0].dataset.fn]);
    this.edit(ids[0]);
  },
  /* footnotes to endnotes or back (all, or the given ones) */
  convert(to, ids) {
    const notes = this.all();
    const list = ids || Object.keys(notes).filter(id => notes[id].kind !== to);
    if (!list.length) return 0;
    if (Story.cur) Story.close();
    change(() => { for (const id of list) if (notes[id]) notes[id].kind = to; this.renumber(); }, { full: true });
    Layout.full();
    return list.length;
  },
  remove(id) {
    const ref = this.refs().find(r => r.dataset.fn === id);
    if (!ref) return;
    if (Story.cur) Story.close();
    change(() => { (ref.closest('ins.tc') && ref.closest('ins.tc').childNodes.length === 1 ? ref.closest('ins.tc') : ref).remove(); this.renumber(); }, { full: true });
  },
  /* after a paste: a copied mark gets a copy of its note; a mark from another document brings its
     note (copied with it); a mark with no note becomes a plain superscript */
  adopt(root = S.editor) {
    const notes = this.all(), seen = new Set();
    for (const r of this.refs(root)) {
      let id = r.dataset.fn;
      const src = notes[id] || (Paste.notes && Paste.notes[id]);
      if (!src) { const s = h('sup', null, r.textContent); r.replaceWith(s); continue; }
      if (seen.has(id) || !notes[id]) {
        const nid = seen.has(id) ? uid('n') : id;
        notes[nid] = { kind: src.kind, html: src.html };
        r.dataset.fn = id = nid;
      }
      seen.add(id);
    }
    this.renumber(root);
  },
  /* the notes of the marks in a copied piece, for a paste elsewhere */
  stash(box) {
    const notes = this.all(), out = {};
    for (const r of box.querySelectorAll(NOTE_SEL)) if (notes[r.dataset.fn]) out[r.dataset.fn] = JSON.parse(JSON.stringify(notes[r.dataset.fn]));
    Paste.notes = out;
  },
  /* the note's text as plain words (a tooltip on its mark, the outline of exports) */
  text(id) { const t = document.createElement('div'); t.innerHTML = (this.all()[id] || {}).html || ''; return t.textContent.replace(/\s+/g, ' ').trim(); },
  /* ---------- the dialog (References › Footnotes launcher) ---------- */
  dialog() {
    const sel = (kind) => { const s = h('select', { class: 'select' }); for (const [v, l] of NOTE_FMTS) s.appendChild(h('option', { value: v }, l)); s.value = this.pr(kind).fmt; return s; };
    const fF = sel('foot'), fE = sel('end');
    const sF = input(String(this.pr('foot').start || 1), { type: 'number', min: '1', max: '999', style: { width: '80px' } });
    const sE = input(String(this.pr('end').start || 1), { type: 'number', min: '1', max: '999', style: { width: '80px' } });
    const notes = this.all(), used = new Set(this.refs().map(r => r.dataset.fn));
    const nF = [...used].filter(id => notes[id] && notes[id].kind === 'foot').length, nE = [...used].filter(id => notes[id] && notes[id].kind === 'end').length;
    const conv = h('select', { class: 'select' },
      h('option', { value: '' }, 'Leave them as they are'),
      h('option', { value: 'toEnd', disabled: !nF || null }, `Convert all footnotes to endnotes (${nF})`),
      h('option', { value: 'toFoot', disabled: !nE || null }, `Convert all endnotes to footnotes (${nE})`),
      h('option', { value: 'swap', disabled: !(nF && nE) || null }, 'Swap footnotes and endnotes'));
    const row = (label, a, b) => h('div', { class: 'grid2', style: { display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: '8px', alignItems: 'center', marginBottom: '8px' } }, h('label', null, label), a, b || h('span'));
    const body = h('div', null,
      h('div', { class: 'dsection' }, 'Footnotes (bottom of the page)'), row('Number format', fF), row('Start at', sF),
      h('div', { class: 'dsection' }, 'Endnotes (end of the document)'), row('Number format', fE), row('Start at', sE),
      h('div', { class: 'dsection' }, 'Convert'), row('Notes in this document', conv));
    const apply = () => {
      const st = v => clamp(parseInt(v, 10) || 1, 1, 999);
      change(() => {
        const d = S.doc;
        d.notePr = { foot: { fmt: fF.value, start: st(sF.value) }, end: { fmt: fE.value, start: st(sE.value) } };
        const c = conv.value;
        for (const id of used) { const n = notes[id]; if (!n) continue; if ((c === 'toEnd' || c === 'swap') && n.kind === 'foot') n.kind = 'end'; else if ((c === 'toFoot' || c === 'swap') && n.kind === 'end') n.kind = 'foot'; }
        this.renumber();
      }, { full: true });
      Layout.full();
    };
    openDialog({ title: 'Footnote and Endnote', width: 480, body, buttons: [
      { label: 'Insert Footnote', left: true, onClick: () => { apply(); setTimeout(() => this.insert('foot'), 0); } },
      { label: 'Cancel' }, { label: 'Apply', primary: true, onClick: apply }] });
  },
};
