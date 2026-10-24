/* ===================== Fields =====================
   Words in square brackets, like [Recipient Name], are fill-in fields. Clicking one
   selects it, F11 / Shift+F11 move between them, and the Fields pane fills every
   occurrence at once. Values used before are suggested after one or two letters. */
const FIELD_RE = /\[([^[\]\n]{1,60})\]/g;
function isFieldName(s) { return /\p{L}/u.test(s) && s.trim() === s && !/^(x|X| )$/.test(s); }
const Fields = {
  /* every [field] in document order: { node, start, end, name } */
  matches() {
    const out = [];
    const w = document.createTreeWalker(S.editor, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest('del.tc, .toc, span.pg-line, span.qm') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let n;
    while ((n = w.nextNode())) {
      FIELD_RE.lastIndex = 0;
      let m;
      while ((m = FIELD_RE.exec(n.data))) if (isFieldName(m[1])) out.push({ node: n, start: m.index, end: m.index + m[0].length, name: m[1] });
    }
    return out;
  },
  names() {
    const seen = new Map();
    for (const m of this.matches()) { const k = m.name.toLocaleLowerCase(); if (!seen.has(k)) seen.set(k, { name: m.name, count: 0 }); seen.get(k).count++; }
    return Array.from(seen.values());
  },
  rangeOf(m) { const r = document.createRange(); r.setStart(m.node, m.start); r.setEnd(m.node, m.end); return r; },
  select(m) {
    const r = this.rangeOf(m);
    S.editor.focus({ preventScroll: true });
    setRange(r);
    const rc = r.getBoundingClientRect(), cv = $('#canvas').getBoundingClientRect();
    if (rc.top < cv.top + 40 || rc.bottom > cv.bottom - 40) m.node.parentElement.scrollIntoView({ block: 'center' });
  },
  /* the field the range sits in or exactly covers */
  at(r) {
    if (!r) return null;
    const n = r.startContainer;
    if (n.nodeType !== 3 || (r.endContainer !== n)) return null;
    FIELD_RE.lastIndex = 0;
    let m;
    while ((m = FIELD_RE.exec(n.data))) {
      const s = m.index, e = s + m[0].length;
      if (isFieldName(m[1]) && r.startOffset >= s && r.endOffset <= e && (r.collapsed ? r.startOffset > s && r.startOffset < e : true)) return { node: n, start: s, end: e, name: m[1] };
    }
    return null;
  },
  isSelected(r) { const f = this.at(r); return !!(f && r.startOffset === f.start && r.endOffset === f.end); },
  next(dir = 1) {
    const all = this.matches();
    if (!all.length) { toast('There are no [fields] in this document.'); return false; }
    const r = getRange() || lastRange;
    let pick = null;
    if (r && S.editor.contains(r.startContainer)) {
      const pt = (node, off) => { const x = document.createRange(); x.setStart(node, off); return x; };
      const cmp = (a, b) => a.compareBoundaryPoints(Range.START_TO_START, b);
      const selStart = pt(r.startContainer, r.startOffset), selEnd = pt(r.endContainer, r.endOffset);
      if (dir > 0) pick = all.find(m => cmp(pt(m.node, m.start), selEnd) >= 0);
      else pick = all.slice().reverse().find(m => cmp(pt(m.node, m.end), selStart) <= 0);
    }
    if (!pick) pick = dir > 0 ? all[0] : all[all.length - 1];
    this.select(pick);
    return true;
  },
  /* a click inside a [field] selects the whole field, so typing replaces it */
  onClick(e) {
    if (e.detail !== 1 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || S.readOnly) return;
    const r = getRange();
    if (!r || !r.collapsed) return;
    const f = this.at(r);
    if (f) setRange(this.rangeOf(f));
  },
  fill(name, value, opts = {}) {
    value = String(value || '');
    if (!value.trim() || S.readOnly) return 0;
    const key = name.toLocaleLowerCase();
    const hits = this.matches().filter(m => m.name.toLocaleLowerCase() === key);
    if (!hits.length) return 0;
    change(() => {
      for (const m of hits.reverse()) {
        if (S.track) { const r = this.rangeOf(m); Track.replaceRange(r, value); }
        else m.node.replaceData(m.start, m.end - m.start, value);
      }
    });
    this.remember(name, value);
    if (!opts.quiet) toast(hits.length === 1 ? `Filled ${name}.` : `Filled ${name} in ${hits.length} places.`);
    return hits.length;
  },
  remember(name, value) {
    const k = name.toLocaleLowerCase();
    const all = Prefs.fieldValues || (Prefs.fieldValues = {});
    const list = (all[k] || []).filter(v => v !== value);
    list.unshift(value);
    all[k] = list.slice(0, 40);
    const keys = Object.keys(all);
    if (keys.length > 300) delete all[keys[0]];
    savePrefs();
  },
  suggestions(name, typed) {
    const t = typed.trim().toLocaleLowerCase();
    const own = ((Prefs.fieldValues || {})[name.toLocaleLowerCase()] || []);
    const parts = QuickParts.list().map(q => q.text).filter(Boolean);
    // a [Date] or [তারিখ] field: today in both calendars as well
    const dates = /date|তারিখ|দিন/i.test(name) ? BnDate.fieldChoices(name).filter(v => !own.includes(v)) : [];
    const pool = own.concat(dates, parts.filter(p => !own.includes(p) && !dates.includes(p)));
    if (!t) return own.concat(dates).slice(0, 8);
    const starts = pool.filter(v => v.toLocaleLowerCase().startsWith(t));
    const words = pool.filter(v => !starts.includes(v) && v.toLocaleLowerCase().split(/[\s,.-]+/).some(w => w.startsWith(t)));
    return starts.concat(words).slice(0, 8);
  },
  render() {
    const sec = $('[data-section="fields"]');
    if (!sec) return;
    sec.innerHTML = '';
    const list = this.names();
    const head = h('p', { class: 'note', style: { margin: '0 0 10px' } }, list.length ? 'Fill a field and press Enter. Every place it appears is filled. Past values come up as you type.' : 'No fields in this document yet. A field is a name in square brackets, like [Recipient Name]. The letter templates under File › New have them ready to fill.');
    sec.appendChild(head);
    if (!list.length) return;
    const box = h('div', { class: 'fields-list' });
    for (const f of list) {
      const id = 'fld-' + hash53(f.name).slice(-6);
      const inp = h('input', { class: 'input', 'data-avro': '', id, autocomplete: 'off', placeholder: f.name, 'aria-label': f.name, spellcheck: 'false' });
      const sug = h('div', { class: 'fld-sug', role: 'listbox', hidden: true });
      let idx = -1, items = [];
      const show = () => {
        items = this.suggestions(f.name, inp.value);
        sug.innerHTML = '';
        idx = -1;
        if (!items.length || (items.length === 1 && items[0] === inp.value)) { sug.hidden = true; return; }
        items.forEach((v, i) => { const o = h('div', { class: 'fld-opt', role: 'option' }, v); o.addEventListener('mousedown', e => { e.preventDefault(); inp.value = v; sug.hidden = true; go(); }); sug.appendChild(o); void i; });
        sug.hidden = false;
      };
      const mark = () => Array.from(sug.children).forEach((o, i) => o.setAttribute('aria-selected', i === idx ? 'true' : 'false'));
      const go = () => {
        const n = this.fill(f.name, inp.value);
        if (n) { this.render(); const nextInp = $('.fields-list .input'); if (nextInp) nextInp.focus(); }
      };
      inp.addEventListener('input', show);
      inp.addEventListener('focus', show);
      inp.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 120));
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' && !sug.hidden) { e.preventDefault(); idx = (idx + 1) % items.length; mark(); }
        else if (e.key === 'ArrowUp' && !sug.hidden) { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; mark(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (!sug.hidden && idx >= 0) inp.value = items[idx]; sug.hidden = true; go(); }
        else if (e.key === 'Escape') { sug.hidden = true; }
      });
      const find = h('button', { class: 'link-btn', type: 'button', title: 'Show in document' }, f.count > 1 ? `${f.count} places` : 'Show');
      find.addEventListener('click', () => { const m = this.matches().find(x => x.name.toLocaleLowerCase() === f.name.toLocaleLowerCase()); if (m) this.select(m); });
      box.appendChild(h('div', { class: 'fld' }, h('div', { class: 'fld-head' }, h('label', { for: id, class: 'flabel' }, f.name), find), h('div', { class: 'fld-in' }, inp, sug)));
    }
    sec.appendChild(box);
    const all = h('button', { class: 'btn primary', type: 'button', style: { marginTop: '12px' } }, 'Fill all');
    all.addEventListener('click', () => {
      let n = 0;
      for (const inp of $$('.fields-list .input')) if (inp.value.trim()) n += this.fill(inp.getAttribute('aria-label'), inp.value, { quiet: true });
      toast(n ? `Filled ${n} ${n === 1 ? 'place' : 'places'}.` : 'Type a value in a field first.');
      this.render();
    });
    sec.append(all, h('p', { class: 'note', style: { marginTop: '10px' } }, 'In the page: click a field to select it, F11 for the next one, Shift+F11 for the one before.'));
  },
  soon: debounce(() => { if (S.pane === 'fields') Fields.render(); }, 600),
};
