/* ===================== Find & replace ===================== */
const Find = {
  el: null, matches: [], cur: -1, open_: false,
  hasHL: typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined',
  build() {
    if (this.el) return this.el;
    const q = h('input', { class: 'input', 'data-avro': '', id: 'findQ', placeholder: 'Find in document', autocomplete: 'off', spellcheck: 'false' });
    const rep = h('input', { class: 'input', 'data-avro': '', id: 'findR', placeholder: 'Replace with', autocomplete: 'off', spellcheck: 'false' });
    const count = h('span', { class: 'note', id: 'findCount', style: { minWidth: '62px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } });
    const mc = h('input', { type: 'checkbox', id: 'findCase' }), ww = h('input', { type: 'checkbox', id: 'findWord' }), rx = h('input', { type: 'checkbox', id: 'findRegex' });
    const btn = (ic, title, fn) => h('button', { class: 'tb-btn', title, 'aria-label': title, html: icon(ic), onclick: fn });
    const repRow = h('div', { class: 'asst-row', id: 'findRepRow', style: { alignItems: 'center' } }, rep,
      h('button', { class: 'btn', onclick: () => this.replaceOne() }, 'Replace'),
      h('button', { class: 'btn', onclick: () => this.replaceAll() }, 'Replace All'));
    this.el = h('div', { class: 'pop', id: 'findPanel', role: 'dialog', 'aria-label': 'Find and replace', style: { width: 'min(420px, calc(100vw - 32px))', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div', { class: 'asst-row', style: { alignItems: 'center', flexWrap: 'nowrap' } }, q, count, btn('up', 'Previous match (Shift+Enter)', () => this.step(-1)), btn('down', 'Next match (Enter)', () => this.step(1)), btn('close', 'Close (Esc)', () => this.close())),
      repRow,
      h('div', { class: 'asst-row', style: { gap: '14px' } },
        h('label', { class: 'check' }, mc, 'Match case'), h('label', { class: 'check' }, ww, 'Whole words'), h('label', { class: 'check' }, rx, 'Regular expression')));
    const run = debounce(() => this.search(), 120);
    q.addEventListener('input', run);
    [mc, ww, rx].forEach(c => c.addEventListener('change', () => this.search()));
    q.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    rep.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.replaceOne(); } if (e.key === 'Escape') { e.preventDefault(); this.close(); } });
    return this.el;
  },
  open(withReplace, text) {
    const el = this.build();
    if (!el.isConnected) document.body.appendChild(el);
    const c = $('#canvas').getBoundingClientRect();
    el.style.top = (c.top + 10) + 'px';
    el.style.left = Math.max(16, c.right - el.offsetWidth - 18) + 'px';
    $('#findRepRow').style.display = withReplace ? '' : 'none';
    this.open_ = true;
    const sel = text != null ? text : selectionText();
    const q = $('#findQ');
    if (sel && sel.length < 120 && !sel.includes('\n')) q.value = sel;
    q.focus(); q.select();
    this.search();
  },
  close() {
    this.open_ = false;
    if (this.el) this.el.remove();
    const m = this.matches[this.cur];
    this.clearHL();
    if (m) { try { S.editor.focus({ preventScroll: true }); setRange(m.cloneRange()); } catch { } } else focusEditor();
    this.matches = []; this.cur = -1;
  },
  clearHL() { if (this.hasHL) { CSS.highlights.delete('q-find'); CSS.highlights.delete('q-cur'); } },
  pattern(q) {
    const flags = 'g' + ($('#findCase') && $('#findCase').checked ? '' : 'i') + 'u';
    let src = $('#findRegex') && $('#findRegex').checked ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if ($('#findWord') && $('#findWord').checked) src = '(?<![\\p{L}\\p{N}_])(?:' + src + ')(?![\\p{L}\\p{N}_])';
    try { return new RegExp(src, flags); } catch { return null; }
  },
  textBlocks() {
    // leaf blocks with their text nodes, skipping deleted (tracked) text and page artifacts
    const out = [];
    const w = document.createTreeWalker(S.editor, NodeFilter.SHOW_TEXT, { acceptNode: n => { const p = n.parentNode; if (!p || p.closest('del.tc, .pg-line, [contenteditable="false"]')) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; } });
    let n, curB = null, entry = null;
    while ((n = w.nextNode())) {
      const b = blockOf(n) || S.editor;
      if (b !== curB) { curB = b; entry = { block: b, nodes: [], text: '' }; out.push(entry); }
      entry.nodes.push({ node: n, start: entry.text.length });
      entry.text += n.data;
    }
    return out;
  },
  findAll(re) {
    const res = [];
    for (const b of this.textBlocks()) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(b.text))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        const r = this.mapRange(b, m.index, m.index + m[0].length);
        if (r) res.push(r);
        if (res.length > 5000) return res;
      }
    }
    return res;
  },
  mapRange(b, s, e) {
    const loc = off => { for (let i = b.nodes.length - 1; i >= 0; i--) if (b.nodes[i].start <= off) return { node: b.nodes[i].node, off: off - b.nodes[i].start }; return null; };
    const a = loc(s), z = loc(e);
    if (!a || !z) return null;
    if (z.off === 0 && z.node !== a.node) { const i = b.nodes.findIndex(x => x.node === z.node); if (i > 0) { z.node = b.nodes[i - 1].node; z.off = z.node.length; } }
    const r = document.createRange();
    r.setStart(a.node, Math.min(a.off, a.node.length));
    r.setEnd(z.node, Math.min(z.off, z.node.length));
    return r;
  },
  search() {
    const q = $('#findQ') ? $('#findQ').value : '';
    this.matches = [];
    this.cur = -1;
    if (q) { const re = this.pattern(q); if (re) this.matches = this.findAll(re); }
    if (this.matches.length) {
      // start from the match nearest after the caret
      const caret = lastRange;
      let i = 0;
      if (caret) { i = this.matches.findIndex(m => m.compareBoundaryPoints(Range.START_TO_START, caret) >= 0); if (i < 0) i = 0; }
      this.cur = i;
    }
    this.paint();
  },
  paint() {
    const cnt = $('#findCount');
    if (cnt) cnt.textContent = this.matches.length ? `${this.cur + 1} of ${this.matches.length}` : ($('#findQ') && $('#findQ').value ? 'No results' : '');
    if (this.hasHL) {
      this.clearHL();
      if (this.matches.length) {
        CSS.highlights.set('q-find', new Highlight(...this.matches));
        if (this.matches[this.cur]) CSS.highlights.set('q-cur', new Highlight(this.matches[this.cur]));
      }
    }
    const m = this.matches[this.cur];
    if (m) this.reveal(m);
  },
  reveal(r) {
    const rect = r.getBoundingClientRect();
    const c = $('#canvas');
    const cr = c.getBoundingClientRect();
    if (rect.top < cr.top + 60 || rect.bottom > cr.bottom - 40) c.scrollTop += rect.top - cr.top - cr.height / 3;
    if (!this.hasHL) { try { setRange(r.cloneRange()); } catch { } }
  },
  step(d) {
    if (!this.matches.length) { this.search(); if (!this.matches.length) return; }
    this.cur = (this.cur + d + this.matches.length) % this.matches.length;
    this.paint();
  },
  replText() { return $('#findR') ? $('#findR').value : ''; },
  replaceOne() {
    if (S.readOnly) return;
    const m = this.matches[this.cur];
    if (!m) { this.search(); return; }
    const txt = this.expand(m, this.replText());
    change(() => replaceRangeText(m, txt), { node: m.startContainer });
    this.search();
  },
  expand(range, repl) {
    if (!$('#findRegex') || !$('#findRegex').checked) return repl;
    const re = this.pattern($('#findQ').value);
    if (!re) return repl;
    const src = range.toString();
    re.lastIndex = 0;
    return src.replace(re, repl);
  },
  replaceAll() {
    if (S.readOnly) return;
    this.search();
    const list = this.matches.slice();
    if (!list.length) { toast('No matches to replace.'); return; }
    const repl = this.replText();
    change(() => { for (let i = list.length - 1; i >= 0; i--) replaceRangeText(list[i], this.expand(list[i], repl)); }, { full: true });
    toast(`Replaced ${fmtInt(list.length)} ${list.length === 1 ? 'match' : 'matches'}.`);
    this.search();
  },
};
function replaceRangeText(r, text) {
  if (S.track) { Track.replaceRange(r, text); return; }
  const sc = r.startContainer, so = r.startOffset;
  r.deleteContents();
  if (sc.nodeType === 3 && sc.isConnected) { sc.insertData(so, text); caretAt(sc, so + text.length); }
  else if (text) { const t = document.createTextNode(text); r.insertNode(t); caretAt(t, t.length); }
}
