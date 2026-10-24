/* ===================== Quick Parts & AutoComplete ===================== */
const MONTHS_DAYS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const QuickParts = {
  list() { return Prefs.quickparts || (Prefs.quickparts = []); },
  saveSelection(name) {
    const r = getRange() || lastRange;
    if (!r || r.collapsed) { toast('Select the text you want to save as a Quick Part.'); return false; }
    const box = document.createElement('div');
    box.appendChild(r.cloneContents());
    box.querySelectorAll('tr.pg-spacer, span.pg-line, span.qm').forEach(n => n.remove());
    box.querySelectorAll('[data-pgp]').forEach(n => { n.removeAttribute('data-pgp'); n.style.removeProperty('--pgp'); });
    box.querySelectorAll('.cmt').forEach(n => unwrap(n));
    const text = r.toString().replace(/\u200B/g, '').trim();
    name = String(name || '').trim() || text.split(/\s+/).slice(0, 4).join(' ');
    const list = this.list();
    const existing = list.find(q => q.name.toLowerCase() === name.toLowerCase());
    const entry = { id: existing ? existing.id : uid('q'), name: name.slice(0, 80), html: box.innerHTML.replace(/\u200B/g, ''), text: text.slice(0, 2000) };
    if (existing) Object.assign(existing, entry); else list.push(entry);
    savePrefs();
    toast(`Saved “${entry.name}”. Type its first letters to insert it.`);
    return true;
  },
  insert(entry) {
    if (!entry || S.readOnly) return;
    focusEditor();
    change(() => {
      const frag = sanitizeHtml(entry.html, { keepClasses: true });
      if (S.track) Track.markFragment(frag);
      insertFragment(unwrapSinglePara(frag));
    }, { full: true });
  },
  remove(id) { Prefs.quickparts = this.list().filter(q => q.id !== id); savePrefs(); },
  rename(id, name) { const q = this.list().find(x => x.id === id); if (q && name.trim()) { q.name = name.trim().slice(0, 80); savePrefs(); } },
};
function unwrapSinglePara(frag) {
  const kids = Array.from(frag.childNodes).filter(n => !(n.nodeType === 3 && !n.data.trim()));
  if (kids.length === 1 && kids[0].nodeType === 1 && kids[0].tagName === 'P' && !kids[0].className) {
    const f = document.createDocumentFragment();
    while (kids[0].firstChild) f.appendChild(kids[0].firstChild);
    return f;
  }
  return frag;
}

const AutoComplete = {
  el: null, items: [], idx: 0, cur: null,
  wordBefore() {
    const r = getRange();
    if (!r || !r.collapsed) return null;
    const n = r.startContainer;
    if (n.nodeType !== 3) return null;
    const s = n.data.slice(0, r.startOffset).replace(/\u200B/g, '');
    const m = s.match(/[\p{L}\p{M}\p{N}_-]+$/u);
    if (!m) return null;
    const start = r.startOffset - m[0].length;
    return { node: n, start, end: r.startOffset, word: m[0] };
  },
  sources(prefix) {
    const p = prefix.toLocaleLowerCase();
    const out = [];
    for (const q of QuickParts.list()) {
      const nm = (q.name || '').toLocaleLowerCase(), tx = (q.text || '').toLocaleLowerCase();
      if ((nm.startsWith(p) && nm.length > p.length) || (tx.startsWith(p) && tx.length > p.length)) out.push({ label: q.name, preview: q.text, html: q.html, kind: 'Quick Part' });
    }
    if (prefix.length >= 3 && /^[a-z]+$/i.test(prefix)) {
      const now = new Date();
      const mon = now.toLocaleDateString('en-US', { month: 'long' });
      if (mon.toLowerCase().startsWith(p)) { const ds = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); out.push({ label: ds, text: ds, kind: 'Today' }); }
      for (const w of MONTHS_DAYS) if (w.toLowerCase().startsWith(p) && w.length > prefix.length) out.push({ label: w, text: w, kind: '' });
    }
    // Bangla: this month's name (কার্তি…, অক্টো…) brings today's date; the months and days of the week
    out.push(...BnDate.complete(prefix));
    return out.slice(0, 6);
  },
  check() {
    if (!Prefs.autocomplete || S.composing || S.readOnly) { this.hide(); return; }
    const w = this.wordBefore();
    if (!w || w.word.length < 2) { this.hide(); return; }
    const items = this.sources(w.word);
    if (!items.length) { this.hide(); return; }
    this.items = items; this.idx = 0; this.cur = w;
    this.render();
  },
  render() {
    if (!this.el) { this.el = h('div', { class: 'float bubble ac-bubble', role: 'listbox', 'aria-label': 'Suggestions' }); $('#floatRoot').appendChild(this.el); }
    const el = this.el;
    el.innerHTML = '';
    const col = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } });
    this.items.forEach((it, i) => {
      const row = h('div', { role: 'option', 'aria-selected': i === this.idx ? 'true' : 'false', style: { padding: '2px 4px', borderRadius: '4px', background: i === this.idx ? 'color-mix(in srgb, var(--bg) 18%, transparent)' : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '360px' } },
        h('b', null, it.label), it.kind ? h('span', { class: 'k' }, '  ' + it.kind) : null,
        it.preview && it.preview !== it.label ? h('span', { class: 'k' }, '  ' + it.preview.slice(0, 48) + (it.preview.length > 48 ? '…' : '')) : null);
      row.addEventListener('mousedown', e => { e.preventDefault(); this.idx = i; this.accept(); });
      col.appendChild(row);
    });
    col.appendChild(h('span', { class: 'k', style: { fontSize: '11px' } }, 'Enter to insert · Esc to dismiss'));
    el.appendChild(col);
    const rect = caretRect();
    if (rect) { el.style.left = Math.min(window.innerWidth - 380, rect.left) + 'px'; el.style.top = (rect.top - el.offsetHeight - 6 < 8 ? rect.bottom + 6 : rect.top - el.offsetHeight - 6) + 'px'; }
  },
  hide() { if (this.el) { this.el.remove(); this.el = null; } this.items = []; this.cur = null; },
  key(e) {
    if (!this.el || !this.items.length) return false;
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.accept(); return true; }
    if (e.key === 'Escape') { e.preventDefault(); this.hide(); return true; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && this.items.length > 1) { e.preventDefault(); this.idx = (this.idx + (e.key === 'ArrowDown' ? 1 : -1) + this.items.length) % this.items.length; this.render(); return true; }
    return false;
  },
  onSel() {
    if (!this.el || !this.cur) return;
    const r = getRange();
    if (!r || !r.collapsed || r.startContainer !== this.cur.node || r.startOffset !== this.cur.end) this.hide();
  },
  accept() {
    const it = this.items[this.idx], w = this.cur;
    this.hide();
    if (!it || !w || !w.node.isConnected) return;
    change(() => {
      const r = document.createRange();
      r.setStart(w.node, Math.min(w.start, w.node.length));
      r.setEnd(w.node, Math.min(w.end, w.node.length));
      if (it.html) {
        r.deleteContents();
        caretAt(w.node, Math.min(w.start, w.node.length));
        const frag = unwrapSinglePara(sanitizeHtml(it.html, { keepClasses: true }));
        if (S.track) Track.markFragment(frag);
        insertFragment(frag);
      } else replaceRangeText(r, it.text);
    }, { full: !!it.html });
  },
};

/* ===================== AutoCorrect ===================== */
const TYPO_FIX = { teh: 'the', adn: 'and', recieve: 'receive', seperate: 'separate', definately: 'definitely', occured: 'occurred', untill: 'until', wich: 'which', becuase: 'because', thier: 'their', accomodate: 'accommodate', acheive: 'achieve', beleive: 'believe', goverment: 'government', enviroment: 'environment', tommorow: 'tomorrow', wierd: 'weird', alot: 'a lot', occurence: 'occurrence', publically: 'publicly', recomend: 'recommend', succesful: 'successful', sincerly: 'sincerely', truely: 'truly', freind: 'friend' };
const AutoCorrect = {
  onText(e) {
    if (!Prefs.autocorrect || S.track || S.composing) return;
    const ch = e.data;
    if (!ch || ch.length !== 1) return;
    const r = getRange();
    if (!r || !r.collapsed || r.startContainer.nodeType !== 3) return;
    const n = r.startContainer, off = r.startOffset;
    const before = n.data.slice(0, off);
    const rep = (len, str) => { n.replaceData(off - len, len, str); caretAt(n, off - len + str.length); };
    if (ch === ')') {
      if (/\(c\)$/i.test(before)) return rep(3, '©');
      if (/\(r\)$/i.test(before)) return rep(3, '®');
      if (/\(tm\)$/i.test(before)) return rep(4, '™');
    }
    if (ch === '>') { if (/(^|[^-])->$/.test(before)) return rep(2, '→'); if (/(^|[^=])=>$/.test(before)) return rep(2, '⇒'); }
    if (ch === '.' && /(^|[^.])\.\.\.$/.test(before)) return rep(3, '…');
    if (/[\s.,;:!?)]/.test(ch)) {
      const body = before.slice(0, -1);
      if (/(^|\s)--$/.test(body) && ch === ' ') { n.replaceData(off - 3, 2, '–'); caretAt(n, off - 1); return; }
      const m = body.match(/(^|[^\p{L}\p{N}'])([\p{L}']+)$/u);
      if (!m) return;
      const word = m[2];
      const ws = body.length - word.length;
      let fixed = TYPO_FIX[word.toLowerCase()];
      if (fixed && word[0] === word[0].toUpperCase()) fixed = fixed[0].toUpperCase() + fixed.slice(1);
      if (word === 'i') fixed = 'I';
      if (!fixed && /^[a-z]/.test(word) && word.length > 1 && /^[a-z']+$/.test(word)) {
        const pre = body.slice(0, ws);
        const abbrev = /\b(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|prof|no|st|approx|dept|est|fig|vol|p|pp)\.\s+$/i.test(pre);
        const start = pre.trim() === '' ? isFirstTextInBlock(n) : (!abbrev && /[.!?]["')\]]?\s+$/.test(pre));
        if (start) fixed = word[0].toUpperCase() + word.slice(1);
      }
      if (fixed && fixed !== word) { n.replaceData(ws, word.length, fixed); caretAt(n, off - word.length + fixed.length); }
    }
  },
};
function isFirstTextInBlock(t) {
  const b = blockOf(t);
  if (!b) return false;
  const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) { if (n === t) return true; if (n.data.replace(/\u200B/g, '').trim()) return false; }
  return false;
}

/* ===================== Claude assistant ===================== */
const Assistant = {
  target: null, ctl: null, text: '',
  ACTIONS: [
    ['improve', 'Improve writing', 'Improve the clarity, flow and word choice of the text while keeping its meaning, facts and tone.'],
    ['grammar', 'Fix spelling & grammar', 'Correct spelling, grammar and punctuation mistakes. Change nothing else.'],
    ['shorter', 'Make shorter', 'Make the text noticeably more concise while keeping every important point.'],
    ['longer', 'Make longer', 'Expand the text with relevant detail and smoother transitions, about 50% longer.'],
    ['formal', 'More formal', 'Rewrite the text in a formal, professional register suitable for an office letter.'],
    ['friendly', 'Friendlier', 'Rewrite the text in a warm, friendly but still professional tone.'],
    ['summary', 'Summarize', 'Summarize the text as a few short bullet points.'],
    ['bangla', 'Translate to Bangla', 'Translate the text into natural, formal Bangla (Bengali script). Keep names, numbers and formatting.'],
    ['english', 'Translate to English', 'Translate the text into natural, formal English. Keep names, numbers and formatting.'],
    ['continue', 'Continue writing', 'Continue the text with one or two more paragraphs in the same voice. Return only the new paragraphs.'],
  ],
  init() {
    const sec = $('[data-section="assistant"]');
    if (!sec || sec.dataset.ready) return;
    sec.dataset.ready = '1';
    const chips = h('div', { class: 'chips', id: 'asstChips' }, this.ACTIONS.map(([id, label]) => h('button', { class: 'chip', 'data-act': id, onclick: () => this.run(id) }, label)));
    const ta = h('textarea', { class: 'asst-prompt', id: 'asstPrompt', placeholder: 'Describe what to write. For example: a formal leave application for three days, addressed to the Managing Director.' });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.run('draft'); } });
    sec.append(h('div', { class: 'asst-box' },
      h('div', { class: 'asst-ctx', id: 'asstCtx' }, ''),
      h('div', { class: 'flabel' }, 'Rewrite the selection'), chips,
      h('div', { class: 'flabel' }, 'Write something new'), ta,
      h('div', { class: 'asst-row' }, h('button', { class: 'btn primary', id: 'asstGo', onclick: () => this.run('draft') }, h('span', { html: icon('sparkle') }), 'Write'), h('button', { class: 'btn', id: 'asstStop', hidden: true, onclick: () => this.ctl && this.ctl.abort() }, 'Stop')),
      h('div', { id: 'asstResult', hidden: true },
        h('div', { class: 'flabel', style: { marginBottom: '6px' } }, 'Result'),
        h('div', { class: 'asst-out', id: 'asstOut' }),
        h('div', { class: 'asst-row', style: { marginTop: '8px' } },
          h('button', { class: 'btn primary', id: 'asstReplace', onclick: () => this.apply('replace') }, 'Replace selection'),
          h('button', { class: 'btn', id: 'asstInsert', onclick: () => this.apply('insert') }, 'Insert'),
          h('button', { class: 'btn', onclick: () => this.copy() }, 'Copy'),
          h('button', { class: 'btn', onclick: () => this.discard() }, 'Discard')),
        h('div', { class: 'note', id: 'asstNote', style: { marginTop: '6px' } })),
      h('p', { class: 'note', id: 'asstFoot' }, 'Claude uses your Claude account. Nothing is sent until you pick an action.')));
    this.refreshCtx();
    Proof.init(sec);
  },
  available() { return !!Cap.sample; },
  capture() {
    const r = getRange();
    if (r && !r.collapsed && r.toString().trim()) this.target = { range: r.cloneRange(), text: r.toString().replace(/\u200B/g, '') };
    else if (r) this.target = { range: r.cloneRange(), text: '' };
    this.refreshCtx();
  },
  refreshCtx() {
    const el = $('#asstCtx');
    if (!el) return;
    const t = this.target;
    const words = t && t.text ? countWords(t.text) : 0;
    el.textContent = !this.available() ? 'The Claude assistant isn’t available in this view. Open Folio inside Claude to use it.' : words ? `Working on your selection: ${fmtInt(words)} ${words === 1 ? 'word' : 'words'}.` : 'No text selected. Rewrites will use the paragraph at the cursor; new writing goes in at the cursor.';
    $$('#asstChips .chip').forEach(c => c.disabled = !this.available());
    const go = $('#asstGo'); if (go) go.disabled = !this.available();
  },
  sourceText(act) {
    const t = this.target;
    if (t && t.text) return t.text;
    if (act === 'summary') return docText().join('\n\n');
    const r = t && t.range;
    const b = r && blockOf(r.startContainer);
    if (act === 'continue') { const all = docText().join('\n\n'); return all.slice(-4000); }
    if (b) { const rr = document.createRange(); rr.selectNodeContents(b); this.target = { range: rr, text: b.textContent.replace(/\u200B/g, '') }; this.refreshCtx(); return this.target.text; }
    return '';
  },
  prompt(act, src, extra) {
    const rules = '\n\nRules:\n- Reply with only the finished text, ready to paste into the document. No preamble, no notes, no quotation marks around it.\n- Use Markdown only where the document needs structure: # headings, **bold**, *italic*, "- " bullet lists, "1. " numbered lists, and tables. Separate paragraphs with a blank line.\n- Keep the language of the original text unless the task is a translation.';
    if (act === 'draft') {
      const ctx = docText().join('\n\n').slice(-2500).trim();
      return `You are a writing assistant inside a word processor. Write the following for the user's document: ${extra}` + rules + (ctx ? `\n\nFor context only, here is the end of the document so far (do not repeat it):\n<<<\n${ctx}\n>>>` : '');
    }
    const a = this.ACTIONS.find(x => x[0] === act);
    return `You are a writing assistant inside a word processor. Task: ${a ? a[2] : extra}` + rules + `\n\nText:\n<<<\n${src.slice(0, 60000)}\n>>>`;
  },
  async run(act) {
    if (!this.available()) { toast('The Claude assistant isn’t available in this view.'); return; }
    let src = '', extra = '';
    if (act === 'draft') { extra = ($('#asstPrompt').value || '').trim(); if (!extra) { $('#asstPrompt').focus(); toast('Describe what you want Claude to write.'); return; } }
    else { src = this.sourceText(act); if (!src.trim()) { toast('Select some text first, or click inside a paragraph.'); return; } }
    if (this.ctl) this.ctl.abort();
    const ctl = this.ctl = new AbortController();
    this.lastAct = act;
    const out = $('#asstOut');
    $('#asstResult').hidden = false;
    out.classList.add('thinking');
    out.textContent = 'Thinking…';
    $('#asstNote').textContent = '';
    $('#asstStop').hidden = false;
    $('#asstReplace').hidden = !(this.target && this.target.text) || act === 'continue' || act === 'draft';
    this.text = '';
    try {
      const res = await Cap.sample(this.prompt(act, src, extra), {
        signal: ctl.signal,
        cache: false,
        onText: ({ text }) => { this.text = text; out.classList.remove('thinking'); out.innerHTML = mdToHtml(text); },
      });
      this.text = res.text;
      out.classList.remove('thinking');
      out.innerHTML = mdToHtml(res.text);
      if (res.truncated) $('#asstNote').textContent = 'The answer was cut short. Try a smaller selection.';
    } catch (e) {
      const code = e && e.code;
      out.classList.remove('thinking');
      if (code === 'cancelled') { if (!this.text) $('#asstResult').hidden = true; }
      else {
        if (e && e.text) { this.text = e.text; out.innerHTML = mdToHtml(e.text); } else if (code !== 'refused') out.textContent = '';
        if (code === 'refused') { out.textContent = ''; this.text = ''; }
        const msg = { not_granted: 'Claude wasn’t allowed for this page. You can allow it from the artifact’s permissions.', sampling_disabled: 'Claude isn’t available for this account.', rate_limited: 'You’ve reached a usage limit. Try again in a little while.', refused: 'Claude declined this request. Try rewording it.', prompt_too_large: 'That selection is too long. Select a smaller part.', session_expired: 'Sign in to Claude again, then retry.', empty_completion: 'Claude returned nothing. Try rephrasing.' }[code] || 'Something went wrong. Try again.';
        $('#asstNote').textContent = msg;
        if (code === 'not_granted' || code === 'sampling_disabled') { Cap.sample = null; this.refreshCtx(); }
      }
    } finally {
      if (this.ctl === ctl) this.ctl = null;
      $('#asstStop').hidden = true;
    }
  },
  apply(mode) {
    if (!this.text.trim() || S.readOnly) return;
    const t = this.target;
    S.editor.focus({ preventScroll: true });
    if (t && t.range && S.editor.contains(t.range.startContainer)) setRange(t.range.cloneRange());
    else focusEditor();
    const r = getRange();
    if (!r) return;
    if (mode === 'insert') { r.collapse(false); setRange(r); }
    change(() => {
      let frag = sanitizeHtml(mdToHtml(this.text));
      if (mode === 'insert' && (this.lastAct === 'continue' || this.lastAct === 'draft')) {
        const b = blockOf(getRange().startContainer);
        if (b && !isBlank(b)) { const top = topBlockOf(b) || b; const p = h('p', null, h('br')); top.after(p); caretAtStart(p); }
      } else frag = unwrapSinglePara(frag);
      if (S.track) { if (mode === 'replace' && !getRange().collapsed) Track.markDeleted(getRange(), 'end'); Track.markFragment(frag); }
      insertFragment(frag);
    }, { full: true });
    this.discard();
    toast(mode === 'replace' ? 'Replaced with Claude’s version.' : 'Inserted.');
  },
  copy() {
    const txt = this.text;
    if (!txt) return;
    navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Copied.'), () => toast('Copy failed. Select the result and press Ctrl+C.'));
  },
  discard() { this.text = ''; $('#asstResult').hidden = true; $('#asstOut').innerHTML = ''; },
};
