/* ===================== Table of contents ===================== */
const Toc = {
  headings() { return Array.from(S.editor.querySelectorAll('h1, h2, h3')).filter(x => !x.closest('.toc') && !x.closest('td, th')); },
  build() {
    const box = h('div', { class: 'toc', contenteditable: 'false' });
    box.appendChild(h('p', { class: 'toc-title' }, 'Contents'));
    const heads = this.headings();
    if (!heads.length) box.appendChild(h('p', { class: 'toc-empty' }, 'No headings found. Apply Heading 1, 2 or 3 to your section titles, then choose Update Table.'));
    for (const hd of heads) {
      if (!hd.id) hd.id = 'h-' + uid().slice(-7);
      box.appendChild(h('p', { class: 'te l' + hd.tagName[1], 'data-target': hd.id }, h('span', { class: 'tt' }, hd.textContent.replace(/\u200B/g, '').trim() || 'Untitled heading'), h('span', { class: 'td' }), h('span', { class: 'tp' }, '')));
    }
    return box;
  },
  insert() {
    if (S.readOnly || Story.refuse('A table of contents')) return;
    change(() => {
      const t = this.build();
      const r = getRange();
      const top = r && topBlockOf(r.startContainer);
      if (top) { if (isBlank(top)) top.before(t); else top.before(t); }
      else S.editor.prepend(t);
    }, { full: true });
    this.refreshPages();
  },
  update(quiet) {
    const tocs = S.editor.querySelectorAll('.toc');
    if (!tocs.length) { if (!quiet) toast('Insert a table of contents first (References tab).'); return; }
    change(() => tocs.forEach(t => t.replaceWith(this.build())), { full: true });
    this.refreshPages();
    if (!quiet) toast('Table of contents updated.');
  },
  refreshPages() {
    Layout.full();
    // the number the heading's page shows (its section's numbering and format)
    S.editor.querySelectorAll('.toc .te').forEach(te => {
      const t = document.getElementById(te.dataset.target);
      const tp = te.querySelector('.tp');
      if (tp) tp.textContent = t && S.view !== 'web' ? Pages.numText(Pages.at(topOf(t) + pushOf(t))) : '';
    });
  },
  remove() { if (!S.editor.querySelector('.toc')) return; change(() => S.editor.querySelectorAll('.toc').forEach(t => t.remove()), { full: true }); },
  go(te) { const t = document.getElementById(te.dataset.target); if (t) { t.scrollIntoView({ block: 'start', behavior: 'smooth' }); caretAtStart(t); } },
  tools() {
    const ov = $('#overlay');
    let tb = ov.querySelector('.toc-tools');
    const toc = S.editor.querySelector('.toc');
    if (!toc || S.readOnly) { if (tb) tb.remove(); return; }
    if (!tb) {
      tb = h('div', { class: 'toc-tools' }, h('button', { class: 'btn', onmousedown: e => e.preventDefault(), onclick: () => this.update() }, h('span', { html: icon('resetSize') }), 'Update table'));
      ov.appendChild(tb);
    }
    const pr = $('#paper').getBoundingClientRect(), r = toc.getBoundingClientRect();
    tb.style.left = (r.right - pr.left) / S.zoom - 120 + 'px';
    // above the table itself, not the space that moved it to its page
    tb.style.top = (r.top - pr.top) / S.zoom + pushOf(toc) - 30 + 'px';
  },
};

/* ===================== Navigation pane ===================== */
const Nav = {
  soon: debounce(() => Nav.render(), 350),
  render() {
    if (!S.nav || Story.cur) return;
    const ul = $('#outline');
    if (!ul) return;
    const q = ($('#navSearch') && $('#navSearch').value.trim()) || '';
    const res = $('#navResults');
    res.innerHTML = '';
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
      const hits = Find.findAll(re).slice(0, 60);
      res.appendChild(h('div', { class: 'note', style: { margin: '0 0 8px' } }, hits.length ? `${hits.length >= 60 ? '60+' : hits.length} results` : 'No results'));
      for (const m of hits) {
        const blk = blockOf(m.startContainer);
        const full = blk ? blk.textContent : '';
        const pre = document.createRange(); pre.setStart(blk || S.editor, 0); pre.setEnd(m.startContainer, m.startOffset);
        const off = pre.toString().length;
        const snip = full.slice(Math.max(0, off - 30), off + q.length + 40);
        res.appendChild(h('button', { class: 'mi', style: { whiteSpace: 'normal', fontSize: '12.5px', lineHeight: '1.35' }, onclick: () => { S.editor.focus({ preventScroll: true }); setRange(m.cloneRange()); scrollCaretIntoView(); } }, h('span', { class: 'lb' }, (off > 30 ? '…' : '') + snip + '…')));
      }
      ul.innerHTML = '';
      return;
    }
    const heads = Array.from(S.editor.querySelectorAll('h1, h2, h3, h4, h5, h6, p.title')).filter(x => !x.closest('.toc'));
    ul.innerHTML = '';
    if (!heads.length) { ul.appendChild(h('li', { class: 'empty-note' }, 'Headings appear here. Use the Heading styles on the Home tab to build an outline.')); return; }
    const r = lastRange;
    let cur = null;
    if (r) for (const hd of heads) { const x = document.createRange(); x.selectNode(hd); if (x.compareBoundaryPoints(Range.START_TO_START, r) <= 0) cur = hd; }
    for (const hd of heads) {
      const lvl = hd.tagName === 'P' ? 1 : +hd.tagName[1];
      const li = h('li', { class: 'l' + lvl + (hd === cur ? ' cur' : '') }, h('button', { title: hd.textContent, onclick: () => { hd.scrollIntoView({ block: 'start', behavior: 'smooth' }); caretAtStart(hd); } }, hd.textContent.replace(/\u200B/g, '').trim() || 'Untitled heading'));
      ul.appendChild(li);
    }
  },
};

/* ===================== Statistics ===================== */
function docText(root) {
  root = root || S.editor;
  const parts = [];
  let cur = null, buf = '';
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode && n.parentNode.closest('del.tc, .pg-line, .qm') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n;
  while ((n = w.nextNode())) {
    const b = blockOf(n) || n.parentNode;
    if (b !== cur) { if (cur) parts.push(buf); cur = b; buf = ''; }
    buf += n.data;
  }
  if (cur) parts.push(buf);
  return parts.map(s => s.replace(/\u200B/g, ''));
}
const countWords = s => { const m = String(s).match(/[^\s\u200B]+/g); return m ? m.length : 0; };
function docStats(withPreview) {
  const paras = docText();
  const all = paras.join('\n');
  const st = {
    words: countWords(all),
    chars: all.replace(/\n/g, '').length,
    charsNoSpace: all.replace(/\s/g, '').length,
    paras: paras.filter(p => p.trim()).length,
    pages: S.pages,
    lines: 0,
  };
  if (withPreview) st.preview = all.replace(/\s+/g, ' ').trim().slice(0, 160);
  return st;
}
const Stats = {
  soon: debounce(() => Stats.update(), 300),
  soonSel: debounce(() => Stats.update(), 200),
  update() {
    const el = $('#sbWords');
    if (!el || !S.doc) return;
    const r = getRange();
    const total = countWords(docText(docBody()).join('\n'));
    if (r && !r.collapsed) {
      const sel = countWords(r.toString());
      el.textContent = `${fmtInt(sel)} of ${fmtInt(total)} ${total === 1 ? 'word' : 'words'}`;
    } else el.textContent = `${fmtInt(total)} ${total === 1 ? 'word' : 'words'}`;
  },
};

/* ===================== Read aloud ===================== */
const Speech = {
  on: false, map: null, utter: null,
  supported() { return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; },
  toggle() { if (this.on) this.stop(); else this.start(); },
  start() {
    if (!this.supported()) { toast('Read Aloud is not available in this browser.'); return; }
    const r = getRange() || lastRange;
    const segs = [];
    let text = '';
    const startR = document.createRange();
    if (r) startR.setStart(r.startContainer, r.startOffset); else startR.setStart(S.editor, 0);
    startR.collapse(true);
    const w = document.createTreeWalker(S.editor, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode && n.parentNode.closest('del.tc, .pg-line, .toc') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let n, lastB = null;
    const endR = r && !r.collapsed ? r : null;
    while ((n = w.nextNode())) {
      if (startR.comparePoint(n, n.length) < 0) continue;
      const from = r && n === r.startContainer ? r.startOffset : 0;
      let to = n.length;
      if (endR) { if (endR.comparePoint(n, 0) > 0) break; if (n === endR.endContainer) to = endR.endOffset; }
      const b = blockOf(n);
      if (lastB && b !== lastB) text += '\n';
      lastB = b;
      segs.push({ node: n, from, base: text.length });
      text += n.data.slice(from, to);
    }
    if (!text.trim()) { toast('There is nothing to read from here. Place the cursor earlier or select text.'); return; }
    this.map = segs;
    const u = new SpeechSynthesisUtterance(text.replace(/\u200B/g, ' '));
    u.lang = S.doc.lang || 'en-US';
    const voices = speechSynthesis.getVoices();
    const v = voices.find(x => x.lang && x.lang.toLowerCase().startsWith((S.doc.lang || 'en').slice(0, 2).toLowerCase()));
    if (v) u.voice = v;
    u.rate = Prefs.speechRate || 1;
    u.onboundary = e => this.mark(e.charIndex, e.charLength || 1);
    u.onend = u.onerror = () => this.stop(true);
    this.utter = u;
    this.on = true;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    UI.refresh();
  },
  mark(ci, len) {
    if (!Find.hasHL || !this.map) return;
    let seg = null;
    for (const s of this.map) { if (s.base <= ci) seg = s; else break; }
    if (!seg) return;
    const off = seg.from + (ci - seg.base);
    if (off > seg.node.length) return;
    try {
      const r = document.createRange();
      r.setStart(seg.node, off);
      r.setEnd(seg.node, Math.min(seg.node.length, off + Math.max(1, len)));
      CSS.highlights.set('q-speak', new Highlight(r));
      const rect = r.getBoundingClientRect(), c = $('#canvas').getBoundingClientRect();
      if (rect.bottom > c.bottom - 40 || rect.top < c.top + 40) $('#canvas').scrollTop += rect.top - c.top - c.height / 3;
    } catch { }
  },
  stop(natural) {
    if (!natural && this.supported()) speechSynthesis.cancel();
    this.on = false;
    this.map = null;
    if (Find.hasHL) CSS.highlights.delete('q-speak');
    UI.refresh();
  },
};
