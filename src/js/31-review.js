/* ===================== Comments ===================== */
const AVATAR_COLORS = ['#1d6a50', '#2f5597', '#b5179e', '#c2410c', '#7c3aed', '#0e7490', '#a16207', '#be123c'];
function authorName(entry) {
  if (entry && entry.author) return entry.author;
  if (entry && entry.uid && entry.uid === Cap.uid) return Prefs.author || Cap.name || 'You';
  if (entry && !entry.uid) return Prefs.author || Cap.name || 'You';
  return 'Someone';
}
function authorColor(name) { return AVATAR_COLORS[parseInt(hash53(name || '?').slice(-3), 36) % AVATAR_COLORS.length]; }
function initials(name) { return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'; }

const Comments = {
  editing: null,
  soonSync: debounce(() => Comments.render(), 400),
  anchors(id) { return Array.from(S.editor.querySelectorAll(`span.cmt[data-cid="${CSS.escape(id)}"]`)); },
  add() {
    if (S.readOnly) { toast('Turn off Restrict Editing to add comments.'); return; }
    if (Story.refuse('A comment')) return;
    focusEditor();
    let r = getRange();
    if (!r) return;
    if (r.collapsed) {
      const s = window.getSelection();
      try { s.modify('move', 'backward', 'word'); s.modify('extend', 'forward', 'word'); } catch { }
      r = getRange();
      if (!r || r.collapsed || !r.toString().trim()) { toast('Select the text you want to comment on.'); return; }
    }
    const id = uid('c');
    change(() => {
      const texts = textNodesIn(r);
      if (!texts.length) return;
      for (const t of texts) {
        if (!t.data.trim() && texts.length > 1) continue;
        const sp = h('span', { class: 'cmt', 'data-cid': id });
        t.parentNode.insertBefore(sp, t);
        sp.appendChild(t);
      }
      S.doc.comments.push({ id, text: '', author: Prefs.author || '', uid: Cap.uid || null, time: Date.now(), resolved: false, replies: [] });
    });
    this.editing = id;
    openPane('comments');
    this.render();
    const ta = $(`#cm-edit-${id}`);
    if (ta) ta.focus();
    setTimeout(() => { const t2 = $(`#cm-edit-${id}`); if (t2 && document.activeElement !== t2 && !t2.contains(document.activeElement)) t2.focus(); }, 30);
  },
  find(id) { return S.doc.comments.find(c => c.id === id); },
  save(id, text) {
    const c = this.find(id);
    if (!c) return;
    if (!text.trim() && !c.text) { this.remove(id); return; }
    const hadFocus = document.activeElement && document.activeElement.id === `cm-edit-${id}`;
    change(() => { c.text = text.trim(); c.time = c.time || Date.now(); });
    this.editing = null;
    this.render();
    if (hadFocus) {
      // back to the document, just after the commented text
      const a = this.anchors(id);
      S.editor.focus({ preventScroll: true });
      if (a.length) { const r = document.createRange(); r.setStartAfter(a[a.length - 1]); r.collapse(true); setRange(r); }
    }
  },
  reply(id, text) {
    const c = this.find(id);
    if (!c || !text.trim()) return;
    change(() => c.replies.push({ id: uid('r'), text: text.trim(), author: Prefs.author || '', uid: Cap.uid || null, time: Date.now() }));
    this.render();
  },
  resolve(id) { const c = this.find(id); if (!c) return; change(() => { c.resolved = !c.resolved; this.anchors(id).forEach(a => a.classList.toggle('resolved', c.resolved)); }); this.render(); },
  remove(id) {
    change(() => {
      this.anchors(id).forEach(a => unwrap(a));
      S.doc.comments = S.doc.comments.filter(c => c.id !== id);
    });
    this.render();
  },
  removeAll() { if (!S.doc.comments.length) return; change(() => { S.editor.querySelectorAll('span.cmt').forEach(a => unwrap(a)); S.doc.comments = []; }); this.render(); },
  go(id) {
    const a = this.anchors(id);
    if (!a.length) return;
    a[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    const r = document.createRange();
    r.setStartBefore(a[0]); r.setEndAfter(a[a.length - 1]);
    S.editor.focus({ preventScroll: true });
    setRange(r);
    this.syncActive(r);
  },
  step(d) {
    const ids = this.ordered().filter(c => this.anchors(c.id).length).map(c => c.id);
    if (!ids.length) { toast('There are no comments.'); return; }
    const curA = getRange() && getRange().startContainer.parentNode && getRange().startContainer.parentNode.closest && getRange().startContainer.parentNode.closest('span.cmt');
    let i = curA ? ids.indexOf(curA.dataset.cid) : -1;
    i = (i + d + ids.length) % ids.length;
    openPane('comments');
    this.go(ids[i]);
  },
  ordered() {
    const order = new Map();
    S.editor.querySelectorAll('span.cmt').forEach((a, i) => { if (!order.has(a.dataset.cid)) order.set(a.dataset.cid, i); });
    return [...S.doc.comments].sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1e9) - (order.has(b.id) ? order.get(b.id) : 1e9));
  },
  syncActive(r) {
    if (Story.cur) return;
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    const a = n && n.closest && n.closest('span.cmt');
    const id = a ? a.dataset.cid : null;
    if (id === this.activeId) return;
    this.activeId = id;
    S.editor.querySelectorAll('span.cmt.on').forEach(x => x.classList.remove('on'));
    if (id) this.anchors(id).forEach(x => x.classList.add('on'));
    $$('#commentList .cmt-card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
    if (id && S.pane === 'comments') { const card = $(`#commentList .cmt-card[data-id="${CSS.escape(id)}"]`); if (card) card.scrollIntoView({ block: 'nearest' }); }
  },
  render() {
    const list = $('#commentList');
    if (!list || !S.doc || Story.cur) return;
    const showResolved = $('#showResolved') ? $('#showResolved').checked : true;
    list.innerHTML = '';
    const items = this.ordered();
    const badge = $('#cmtCount');
    if (badge) badge.textContent = items.length ? String(items.length) : '';
    if (!items.length) { list.appendChild(h('div', { class: 'empty-note' }, 'No comments yet. Select some text and choose New Comment, or press Ctrl+Alt+M.')); return; }
    for (const c of items) {
      if (c.resolved && !showResolved && this.editing !== c.id) continue;
      const anchors = this.anchors(c.id);
      const quote = anchors.map(a => a.textContent).join('').trim();
      const name = authorName(c);
      const card = h('div', { class: 'cmt-card' + (c.resolved ? ' resolved' : '') + (this.activeId === c.id ? ' active' : ''), 'data-id': c.id });
      card.appendChild(h('div', { class: 'cmt-meta' }, h('span', { class: 'avatar', style: { background: authorColor(name) } }, initials(name)), h('span', { class: 'cmt-author' }, name), h('span', { class: 'cmt-time' }, fmtWhen(c.time))));
      card.appendChild(h('div', { class: 'cmt-quote' }, quote ? '“' + quote.slice(0, 140) + (quote.length > 140 ? '…' : '') + '”' : 'The commented text was deleted.'));
      if (this.editing === c.id) {
        const ta = h('textarea', { class: 'cmt-edit', id: `cm-edit-${c.id}`, placeholder: 'Write a comment' });
        ta.value = c.text;
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.save(c.id, ta.value); } if (e.key === 'Escape') { e.preventDefault(); this.editing = null; if (!c.text) this.remove(c.id); else this.render(); } });
        card.appendChild(ta);
        card.appendChild(h('div', { class: 'cmt-actions' },
          h('button', { onclick: () => { this.editing = null; if (!c.text) this.remove(c.id); else this.render(); } }, 'Cancel'),
          h('button', { style: { fontWeight: 700, color: 'var(--accent-text)' }, onclick: () => this.save(c.id, ta.value) }, 'Post')));
      } else {
        card.appendChild(h('div', { class: 'cmt-text' }, c.text));
        for (const rp of c.replies || []) {
          const rn = authorName(rp);
          card.appendChild(h('div', { class: 'cmt-reply' }, h('div', { class: 'cmt-meta' }, h('span', { class: 'avatar', style: { background: authorColor(rn), width: '18px', height: '18px', fontSize: '9px' } }, initials(rn)), h('span', { class: 'cmt-author' }, rn), h('span', { class: 'cmt-time' }, fmtWhen(rp.time))), h('div', { class: 'cmt-text' }, rp.text)));
        }
        const replyBox = h('input', { class: 'input', 'data-avro': '', placeholder: 'Reply', style: { height: '28px', marginTop: '8px', fontSize: '12.5px' } });
        replyBox.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.reply(c.id, replyBox.value); } });
        if (!c.resolved && !S.readOnly) card.appendChild(replyBox);
        card.appendChild(h('div', { class: 'cmt-actions' },
          !S.readOnly && h('button', { onclick: () => { this.editing = c.id; this.render(); setTimeout(() => $(`#cm-edit-${c.id}`)?.focus(), 20); } }, 'Edit'),
          !S.readOnly && h('button', { onclick: () => this.resolve(c.id) }, c.resolved ? 'Reopen' : 'Resolve'),
          !S.readOnly && h('button', { onclick: () => this.remove(c.id) }, 'Delete')));
      }
      card.addEventListener('click', e => { if (e.target.closest('button, textarea, input')) return; this.go(c.id); });
      list.appendChild(card);
    }
  },
};

/* ===================== Track changes ===================== */
const TC_COLORS = ['#b5179e', '#1d4ed8', '#047857', '#c2410c', '#7c3aed', '#be123c'];
const Track = {
  suspend: false,
  me() { return { author: Prefs.author || '', uid: Cap.uid || '' }; },
  isMine(el) { const m = this.me(); return (el.getAttribute('data-uid') || '') === m.uid && (el.getAttribute('data-author') || '') === m.author; },
  stamp(el) {
    const m = this.me();
    el.className = 'tc';
    if (m.author) el.setAttribute('data-author', m.author);
    if (m.uid) el.setAttribute('data-uid', m.uid);
    el.setAttribute('data-time', String(Date.now()));
    const name = m.author || Cap.name || 'You';
    el.style.setProperty('--tcc', TC_COLORS[parseInt(hash53(name).slice(-3), 36) % TC_COLORS.length]);
    return el;
  },
  toggle() {
    S.track = !S.track;
    if (S.doc) { S.doc.track = S.track; Saver.mark(); }
    UI.refresh();
    toast(S.track ? 'Track Changes is on. Your edits are marked for review.' : 'Track Changes is off.');
  },
  beforeInput(e) {
    if (this.suspend) return false;
    const t = e.inputType || '';
    if (t === 'insertText' || t === 'insertReplacementText') {
      let text = e.data;
      if (text == null && e.dataTransfer) text = e.dataTransfer.getData('text/plain');
      if (text == null) return false;
      e.preventDefault();
      if (t === 'insertReplacementText' && e.getTargetRanges) { const tr = e.getTargetRanges()[0]; if (tr) { const r = document.createRange(); r.setStart(tr.startContainer, tr.startOffset); r.setEnd(tr.endContainer, tr.endOffset); setRange(r); } }
      this.insertText(text);
      this.after();
      return true;
    }
    if (t.startsWith('delete') && t !== 'deleteByDrag') {
      e.preventDefault();
      this.del(t);
      this.after();
      return true;
    }
    return false;
  },
  after() { histSoon(); Saver.mark(); Layout.soon(getRange() ? getRange().startContainer : null); Stats.soon(); },
  insertText(text) {
    let r = getRange();
    if (!r) return;
    if (!r.collapsed) { this.markDeleted(r, 'end'); r = getRange(); if (!r) return; }
    let node = r.startContainer, off = r.startOffset;
    const insEl = node.nodeType === 3 ? node.parentNode.closest('ins.tc') : node.closest && node.closest('ins.tc');
    if (insEl && this.isMine(insEl) && node.nodeType === 3) { node.insertData(off, text); caretAt(node, off + text.length); return; }
    const delEl = (node.nodeType === 3 ? node.parentNode : node).closest('del.tc');
    if (delEl) { const rr = document.createRange(); rr.setStartAfter(delEl); rr.collapse(true); r = rr; node = rr.startContainer; off = rr.startOffset; }
    const before = node.nodeType === 3 ? (off === 0 ? node.previousSibling : null) : node.childNodes[off - 1];
    if (before && before.nodeType === 1 && before.matches('ins.tc') && this.isMine(before)) {
      const last = before.lastChild;
      if (last && last.nodeType === 3) { last.appendData(text); caretAt(last, last.length); }
      else { const t = document.createTextNode(text); before.appendChild(t); caretAt(t, t.length); }
      return;
    }
    const ins = this.stamp(document.createElement('ins'));
    ins.textContent = text;
    r.insertNode(ins);
    caretAt(ins.firstChild, text.length);
    const blk = blockOf(ins);
    if (blk) { const b = blk.querySelector(':scope > br:last-child'); if (b && b.previousSibling) { /* keep */ } }
  },
  del(t) {
    let r = getRange();
    if (!r) return;
    const back = /Backward/.test(t) || t === 'deleteContent' || t === 'deleteByCut';
    if (r.collapsed) {
      const s = window.getSelection();
      const unit = /Word/.test(t) ? 'word' : /Line|Soft|Hard/.test(t) ? 'lineboundary' : 'character';
      try { s.modify('extend', back ? 'backward' : 'forward', unit); } catch { }
      r = getRange();
      if (!r || r.collapsed) return;
    }
    const txt = r.toString().replace(/\u200B/g, '');
    if (!txt) {
      // only a paragraph boundary: merge the blocks without tracking
      this.suspend = true;
      exec('delete');
      this.suspend = false;
      return;
    }
    this.markDeleted(r, back ? 'start' : 'end');
  },
  markDeleted(r, caretSide) {
    const texts = textNodesIn(r);
    let first = null, last = null;
    for (const t of texts) {
      const p = t.parentNode;
      const ins = p.closest('ins.tc');
      if (ins && this.isMine(ins)) {
        const marker = document.createTextNode('');
        t.parentNode.insertBefore(marker, t);
        t.remove();
        if (!ins.textContent) { const m2 = document.createTextNode(''); ins.parentNode.insertBefore(m2, ins); ins.remove(); first = first || m2; last = m2; }
        else { first = first || marker; last = marker; }
        continue;
      }
      if (p.closest('del.tc')) { first = first || p.closest('del.tc'); last = p.closest('del.tc'); continue; }
      const d = this.stamp(document.createElement('del'));
      p.insertBefore(d, t);
      d.appendChild(t);
      // merge with a neighbouring deletion of mine
      const prev = d.previousSibling;
      if (prev && prev.nodeType === 1 && prev.matches('del.tc') && this.isMine(prev)) { while (d.firstChild) prev.appendChild(d.firstChild); d.remove(); first = first || prev; last = prev; continue; }
      const nxt = d.nextSibling;
      if (nxt && nxt.nodeType === 1 && nxt.matches('del.tc') && this.isMine(nxt)) { while (d.lastChild) nxt.insertBefore(d.lastChild, nxt.firstChild); d.remove(); first = first || nxt; last = nxt; continue; }
      first = first || d; last = d;
    }
    const nr = document.createRange();
    try {
      if (caretSide === 'start' && first) { if (first.nodeType === 3) nr.setStart(first, 0); else nr.setStartBefore(first); }
      else if (last) { if (last.nodeType === 3) nr.setStart(last, 0); else nr.setStartAfter(last); }
      else { nr.setStart(r.startContainer, r.startOffset); }
      nr.collapse(true);
      setRange(nr);
    } catch { }
  },
  replaceRange(r, text) {
    setRange(r.cloneRange());
    if (!r.collapsed) this.markDeleted(r, 'end');
    if (text) this.insertText(text);
  },
  markFragment(frag) {
    const w = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
    const list = [];
    let n;
    while ((n = w.nextNode())) if (n.data.trim()) list.push(n);
    for (const t of list) { const ins = this.stamp(document.createElement('ins')); t.parentNode.insertBefore(ins, t); ins.appendChild(t); }
  },
  onCompositionStart() {
    const r = getRange();
    if (!r || !r.collapsed) return;
    const n = r.startContainer;
    const ins = (n.nodeType === 3 ? n.parentNode : n).closest('ins.tc');
    if (ins && this.isMine(ins)) return;
    const el = this.stamp(document.createElement('ins'));
    el.textContent = '\u200B';
    r.insertNode(el);
    caretAt(el.firstChild, 1);
  },
  all() { return Array.from(S.editor.querySelectorAll('ins.tc, del.tc')); },
  accept(el) { const b = el.closest('[data-tcb]'); if (el.tagName === 'INS') { unwrap(el); } else { el.remove(); } this.tidy(b, true); },
  reject(el) { const b = el.closest('[data-tcb]'); if (el.tagName === 'INS') { el.remove(); } else { unwrap(el); } this.tidy(b, false); },
  /* a paragraph, list item, row or table added or removed whole (data-tcb, from Compare or Word):
     once nothing is left to decide in it, an accepted removal or a rejected addition takes it away */
  tidy(b, accepted) {
    if (!b || !b.isConnected || b.querySelector('ins.tc, del.tc')) return;
    const kind = b.getAttribute('data-tcb');
    const gone = (kind === 'del') === accepted;
    if (!gone || b.textContent.replace(/[\u200B\s]/g, '') || b.querySelector('img')) { b.removeAttribute('data-tcb'); return; }
    let p = b.parentElement;
    b.remove();
    // whatever held it and is now empty goes too; a cell or the page keeps a paragraph
    while (p && p !== S.editor && !p.children.length && /^(UL|OL|LI|TBODY|THEAD|TFOOT|TABLE|TR|BLOCKQUOTE)$/.test(p.tagName)) { const q = p.parentElement; p.remove(); p = q; }
    if (p && (/^(TD|TH)$/.test(p.tagName) || p === S.editor) && !p.children.length) p.appendChild(h('p', null, h('br')));
  },
  acceptAll() { const l = this.all(); if (!l.length) { toast('There are no tracked changes.'); return; } change(() => l.forEach(el => this.accept(el)), { full: true }); toast(`Accepted ${l.length} ${l.length === 1 ? 'change' : 'changes'}.`); },
  rejectAll() { const l = this.all(); if (!l.length) { toast('There are no tracked changes.'); return; } change(() => l.forEach(el => this.reject(el)), { full: true }); toast(`Rejected ${l.length} ${l.length === 1 ? 'change' : 'changes'}.`); },
  atCaret() {
    const r = getRange() || lastRange;
    if (!r) return [];
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const one = n && n.closest && n.closest('ins.tc, del.tc');
    if (r.collapsed) return one ? [one] : [];
    return this.all().filter(el => r.intersectsNode(el));
  },
  acceptCur(reject) {
    let l = this.atCaret();
    if (!l.length) { this.step(1); l = this.atCaret(); }
    if (!l.length) { toast('There are no tracked changes.'); return; }
    change(() => l.forEach(el => reject ? this.reject(el) : this.accept(el)));
    this.step(1, true);
  },
  step(d, quiet) {
    const l = this.all();
    if (!l.length) { if (!quiet) toast('There are no tracked changes.'); return; }
    const r = getRange() || lastRange;
    let i = -1;
    if (r) {
      if (d > 0) i = l.findIndex(el => { const x = document.createRange(); x.selectNode(el); return x.compareBoundaryPoints(Range.START_TO_END, r) > 0 && !el.contains(r.startContainer); });
      else { for (let k = l.length - 1; k >= 0; k--) { const x = document.createRange(); x.selectNode(l[k]); if (x.compareBoundaryPoints(Range.END_TO_START, r) < 0 && !l[k].contains(r.startContainer)) { i = k; break; } } }
    }
    if (i < 0) i = d > 0 ? 0 : l.length - 1;
    const el = l[i];
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const nr = document.createRange(); nr.selectNode(el);
    S.editor.focus({ preventScroll: true });
    setRange(nr);
  },
  setView(v) {
    S.tcView = v;
    docBody().classList.toggle('tc-final', v === 'final');
    docBody().classList.toggle('tc-original', v === 'original');
    Layout.full();
    UI.refresh();
  },
};
