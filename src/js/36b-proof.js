/* ===================== Proofread with Claude =====================
   Review › Proofread (also on the Claude tab) asks Claude to check spelling, grammar and
   punctuation, Bangla and English, a few paragraphs per request. Each fix goes into the page
   as a tracked change by "Claude": the old words deleted, the new ones inserted, the reason
   on hover, the pair tied by data-pf. The Claude pane's Proofread view lists them with Accept
   and Reject; Review's Accept, Reject and Next work on them like any tracked change.
   Bangla is checked by the Bangla Academy standard (প্রমিত বানান), keeping সাধু or চলিত as
   most of the text has it. A fix is placed by finding its words in the paragraph as it is
   when the answer comes back, so typing meanwhile is safe; a fix that no longer fits is left
   out. */
const PROOF_AUTHOR = 'Claude', PROOF_UID = 'claude', PROOF_COLOR = '#b4532a';
const PROOF_SKIP = 'del.tc, .pg-line, .qm, sup.fn, [contenteditable="false"]';
const PROOF_ZW = /[\u200B\uFEFF]/g;
const Proof = {
  ctl: null, running: false, view: 'write', note: '', stats: null, focusIdx: -1,
  /* ---------- reading the page ---------- */
  /* a paragraph's text as shown (no deletions, page marks or zero-width spaces), with where
     each run of it is: { n: text node, t: start in the text, o: offset in the node, l: length }.
     A line break, picture, footnote mark or nested block reads as "\n", which no fix crosses. */
  textOf(b) {
    let text = '';
    const map = [];
    const walk = el => {
      for (let n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          const re = /[^\u200B\uFEFF]+/g;
          let m;
          while ((m = re.exec(n.data))) { map.push({ n, t: text.length, o: m.index, l: m[0].length }); text += m[0]; }
          continue;
        }
        if (n.nodeType !== 1) continue;
        if (n.matches('del.tc, .pg-line, .qm')) continue;
        if (n.tagName === 'BR' || n.tagName === 'IMG' || BLOCK_TAGS.has(n.tagName) || n.matches('sup.fn, [contenteditable="false"]')) { text += '\n'; continue; }
        walk(n);
      }
    };
    walk(b);
    return { text, map };
  },
  /* a position in that text → [text node, offset]. At the seam between two runs a start takes
     the later run and an end (or an insertion point, which takes the formatting before it,
     as Word does) the earlier one. */
  at(map, pos, end) {
    let best = null;
    for (const e of map) {
      if (pos < e.t) break;
      if (pos <= e.t + e.l) { best = e; if (end || pos < e.t + e.l) break; }
    }
    return best ? [best.n, best.o + (pos - best.t)] : null;
  },
  /* the paragraphs to check: those in the selection, or all of them */
  blocks() {
    const r = getRange() || lastRange;
    const list = this.hasSel() ? selectedBlocks(r) : Array.from(S.editor.querySelectorAll('*')).filter(el => LEAF_BLOCKS.has(el.tagName));
    return list.filter(b => S.editor.contains(b) && b.tagName !== 'PRE' && !b.classList.contains('code') && !b.closest('.toc, [contenteditable="false"], del.tc') && /\p{L}/u.test(this.textOf(b).text));
  },
  hasSel() {
    const r = getRange() || lastRange;
    return !!(r && !r.collapsed && S.editor.contains(r.commonAncestorContainer) && r.toString().replace(PROOF_ZW, '').trim());
  },
  /* ---------- asking Claude ---------- */
  prompt(batch) {
    return `You are a careful proofreader in a word processor used in Bangladesh for office letters and documents. Check each numbered paragraph below and report only real mistakes.
- Bangla: spelling by the Bangla Academy standard (প্রমিত বাংলা বানান), such as ি/ী, ু/ূ, ন/ণ, স/শ/ষ, hasanta, conjuncts and ref; typing slips, such as those from Avro phonetic typing; the dari (।) and spacing around punctuation (no space before । , ? or !); and সাধু and চলিত forms mixed in one text (change the fewer to match what most of the text uses).
- English: spelling, grammar, agreement, articles, prepositions, punctuation and capitalization. Keep the spelling variety the text already uses (British or American).
Never change meaning, tone or wording that is already correct, and don't rewrite for style. Leave alone names of people, places and organizations, numbers, dates, amounts, reference and memo numbers, addresses, email addresses, codes, legal and technical terms, quotations, and anything in [square brackets]. A paragraph with no mistakes gets no entries. A line break inside a paragraph is shown as ⏎.

Reply with JSON only, in this shape:
{"fixes":[{"p":2,"find":"সরকারী","fix":"সরকারি","why":"Standard spelling"}]}
- "p": the paragraph number.
- "find": text copied exactly from that paragraph, as short as possible but long enough to occur only once in it: usually the whole word, or the word and a neighbour. Never include ⏎.
- "fix": the corrected text that replaces "find".
- "why": the reason in English, in under eight words.
If nothing needs fixing, reply {"fixes":[]}.

Paragraphs:
${batch.map(x => `[${x.n}] ${x.text.replace(/\n/g, ' ⏎ ')}`).join('\n')}`;
  },
  available() { return !!(Cap.sample && Cap.sample.json); },
  label() { return this.hasSel() ? 'Proofread selection' : 'Proofread document'; },
  async run() {
    this.show();
    if (this.running) return;
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to proofread it.'); return; }
    if (!this.available()) { toast('Proofreading uses Claude, which isn’t available in this view. Open Folio inside Claude.'); return; }
    const blocks = this.blocks();
    this.note = '';
    if (!blocks.length) { this.stats = null; this.note = 'There’s no text to check.'; this.render(); return; }
    // batches of a few thousand characters
    const batches = [];
    let cur = [], size = 0;
    for (const b of blocks) {
      const t = this.textOf(b).text;
      if (cur.length && (size + t.length > 3500 || cur.length >= 40)) { batches.push(cur); cur = []; size = 0; }
      cur.push({ b, text: t.slice(0, 6000), n: cur.length + 1 });
      size += Math.min(t.length, 6000);
    }
    if (cur.length) batches.push(cur);
    const ctl = this.ctl = new AbortController();
    const stats = this.stats = { paras: blocks.length, done: 0, fixes: 0, failed: 0, skipped: 0 };
    this.running = true;
    this.render();
    UI.refresh();
    let next = 0, halt = false;
    const one = async () => {
      const batch = batches[next++];
      if (!batch.some(x => x.b.isConnected)) { stats.done += batch.length; return; }
      const out = await this.ask(batch, ctl.signal);
      if (out.stop) { halt = true; if (out.note) this.note = out.note; return; }
      if (out.failed) stats.failed += batch.length;
      else if (!ctl.signal.aborted && this.stats === stats) stats.fixes += this.apply(batch, out.fixes);
      stats.done += batch.length;
      if (this.stats === stats) this.render();
    };
    const more = () => !halt && !ctl.signal.aborted && next < batches.length;
    const loop = async () => { while (more()) await one(); };
    try {
      if (more()) await one();                 // the first request alone: it may ask the viewer to allow Claude
      await Promise.all([loop(), loop()]);     // then two at a time
    }
    finally {
      if (this.ctl === ctl) { this.ctl = null; this.running = false; }
      if (this.stats === stats && !this.note) {
        if (ctl.signal.aborted && stats.done < stats.paras) this.note = `Stopped after ${fmtInt(stats.done)} of ${fmtInt(stats.paras)} ${stats.paras === 1 ? 'paragraph' : 'paragraphs'}.`;
        else if (stats.failed) this.note = `${fmtInt(stats.failed)} ${stats.failed === 1 ? 'paragraph' : 'paragraphs'} couldn’t be checked. Run Proofread again to retry them.`;
      }
      this.render();
      UI.refresh();
    }
  },
  /* one request: { fixes } or { failed } or { stop, note } */
  async ask(batch, signal) {
    let res;
    try { res = await Cap.sample.json(this.prompt(batch), { signal }); }
    catch (e) {
      const code = e && e.code;
      if (code === 'cancelled' || signal.aborted) return { stop: true };
      if (code === 'invalid_json' && e.text) { try { const t = e.text; res = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return { failed: true }; } }
      else if (code === 'not_granted' || code === 'sampling_disabled') { Cap.sample = null; return { stop: true, note: code === 'not_granted' ? 'Claude wasn’t allowed for this page, so nothing more was checked. You can allow it from the artifact’s permissions.' : 'Claude isn’t available for this account.' }; }
      else if (code === 'rate_limited') return { stop: true, note: 'You’ve reached a usage limit. Try again in a little while.' };
      else if (code === 'session_expired') return { stop: true, note: 'Sign in to Claude again, then run Proofread.' };
      else return { failed: true };
    }
    return { fixes: res && Array.isArray(res.fixes) ? res.fixes : [] };
  },
  stop() { if (this.ctl) this.ctl.abort(); },
  reset() { this.stop(); this.ctl = null; this.running = false; this.stats = null; this.note = ''; this.render(); },
  /* ---------- putting fixes in the page ---------- */
  norm(s) { return s.normalize('NFC').replace(/\u00A0/g, ' '); },
  graphemes(s) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) { this._seg = this._seg || new Intl.Segmenter('bn', { granularity: 'grapheme' }); return Array.from(this._seg.segment(s), x => x.segment); }
    return Array.from(s);
  },
  /* every place `find` is in `text`: exactly, else ignoring Unicode normalization (য় typed
     two ways) and no-break spaces, on whole characters */
  search(text, find) {
    const out = [];
    for (let i = text.indexOf(find); i >= 0; i = text.indexOf(find, i + 1)) out.push([i, i + find.length]);
    if (out.length) return out;
    const at = new Map();
    let nt = '', oi = 0;
    for (const g of this.graphemes(text)) { at.set(nt.length, oi); nt += this.norm(g); oi += g.length; }
    at.set(nt.length, oi);
    const nf = this.norm(find);
    if (!nf) return out;
    for (let i = nt.indexOf(nf); i >= 0; i = nt.indexOf(nf, i + 1)) {
      const a = at.get(i), z = at.get(i + nf.length);
      if (a != null && z != null) out.push([a, z]);
    }
    return out;
  },
  /* the part that changes, whole words: the common words and punctuation at both ends are
     left as they are. { a, z }: kept at the start and end of the old text; { fa, fz }: of the new. */
  diff(a, b) {
    const tok = s => s.match(/[\p{L}\p{M}\p{N}\u200C\u200D]+|[^]/gu) || [];
    const A = tok(a), B = tok(b);
    const same = (x, y) => x === y || this.norm(x) === this.norm(y);
    let i = 0;
    while (i < A.length && i < B.length && same(A[i], B[i])) i++;
    let j = 0;
    while (j < A.length - i && j < B.length - i && same(A[A.length - 1 - j], B[B.length - 1 - j])) j++;
    const len = l => l.reduce((n, x) => n + x.length, 0);
    return { a: len(A.slice(0, i)), z: len(A.slice(A.length - j)), fa: len(B.slice(0, i)), fz: len(B.slice(B.length - j)) };
  },
  /* a batch's fixes as Claude's tracked changes, one undo step; returns how many went in */
  apply(batch, fixes) {
    const byBlock = new Map();
    for (const f of fixes) {
      const x = f && Number.isInteger(+f.p) ? batch[+f.p - 1] : null;
      if (!x || typeof f.find !== 'string' || typeof f.fix !== 'string' || !f.find || f.find === f.fix || /[\n⏎]/.test(f.find + f.fix) || !x.b.isConnected) { if (this.stats) this.stats.skipped++; continue; }
      if (!byBlock.has(x.b)) byBlock.set(x.b, []);
      byBlock.get(x.b).push(f);
    }
    if (!byBlock.size || S.readOnly) return 0;
    let n = 0;
    change(() => {
      for (const [b, list] of byBlock) {
        const { text } = this.textOf(b);
        const spots = [];
        const clash = (s, e) => spots.some(p => (s < p.e && p.s < e) || (s === e && p.s === p.e && s === p.s));
        for (const f of list) {
          let spot = null;
          for (const [a, z] of this.search(text, f.find)) {
            const d = this.diff(text.slice(a, z), f.fix);
            const s = a + d.a, e = Math.max(s, z - d.z), ins = f.fix.slice(d.fa, Math.max(d.fa, f.fix.length - d.fz));
            if (s === e && !ins) break;           // the same text: nothing to do
            if (clash(s, e)) continue;
            spot = { s, e, ins, why: String(f.why || '').trim().slice(0, 120) };
            break;
          }
          if (spot) spots.push(spot); else if (this.stats) this.stats.skipped++;
        }
        // right to left (deletions before insertions at the same place), so the places still to
        // do keep their positions; the text is read again after each one
        spots.sort((p, q) => q.s - p.s || (q.e - q.s) - (p.e - p.s));
        let did = false;
        for (const sp of spots) if (this.mark(b, sp)) { n++; did = true; } else if (this.stats) this.stats.skipped++;
        if (did) Layout.soon(b);
      }
    }, { node: batch[0].b });
    return n;
  },
  stamp(el, pf, why) {
    el.className = 'tc';
    el.setAttribute('data-author', PROOF_AUTHOR);
    el.setAttribute('data-uid', PROOF_UID);
    el.setAttribute('data-time', String(Date.now()));
    el.setAttribute('data-pf', pf);
    if (why) el.title = why;
    el.style.setProperty('--tcc', PROOF_COLOR);
    return el;
  },
  /* one fix: the old text into <del>s, the new into an <ins> after them */
  mark(b, sp) {
    const { map } = this.textOf(b);
    const pf = uid('pf');
    let last = null;
    if (sp.e > sp.s) {
      const a = this.at(map, sp.s, false), z = this.at(map, sp.e, true);
      if (!a || !z) return false;
      const r = document.createRange();
      try { r.setStart(a[0], a[1]); r.setEnd(z[0], z[1]); } catch { return false; }
      if (r.collapsed) return false;
      if (textNodesIn(r, false).some(t => t.parentNode.closest('ins.tc[data-pf]'))) return false;   // Claude's own fix still waiting
      for (const t of textNodesIn(r)) {
        if (t.parentNode.closest(PROOF_SKIP) || !t.data.replace(PROOF_ZW, '')) continue;
        const d = this.stamp(document.createElement('del'), pf, sp.why);
        t.parentNode.insertBefore(d, t);
        d.appendChild(t);
        last = d;
      }
      if (!last) return false;
    }
    if (sp.ins) {
      const ins = this.stamp(document.createElement('ins'), pf, sp.why);
      ins.textContent = sp.ins;
      if (last) last.after(ins);
      else {
        const p = this.at(map, sp.s, true);
        if (!p) return false;
        const [node, off] = p;
        const own = node.parentNode.closest('ins.tc[data-pf]');
        if (own && b.contains(own)) own.after(ins);
        else if (off >= node.length) node.after(ins);
        else if (off <= 0) node.before(ins);
        else { node.splitText(off); node.after(ins); }
      }
    }
    return true;
  },
  /* Claude's fixes in the page, in order: { pf, els, del, ins, why } */
  items() {
    const out = new Map();
    for (const el of S.editor.querySelectorAll('ins.tc[data-pf], del.tc[data-pf]')) {
      const pf = el.getAttribute('data-pf');
      if (!out.has(pf)) out.set(pf, { pf, els: [], del: '', ins: '', why: el.title || '' });
      const it = out.get(pf);
      it.els.push(el);
      if (el.tagName === 'DEL') it.del += el.textContent; else it.ins += el.textContent;
    }
    for (const it of out.values()) { it.del = it.del.replace(PROOF_ZW, ''); it.ins = it.ins.replace(PROOF_ZW, ''); }
    return Array.from(out.values());
  },
  find(pf) { return this.items().find(it => it.pf === pf) || null; },
  decide(pf, accept) {
    const list = this.items();
    const it = list.find(x => x.pf === pf);
    if (!it) return;
    this.focusIdx = list.indexOf(it);
    change(() => it.els.forEach(el => el.isConnected && (accept ? Track.accept(el) : Track.reject(el))), { node: it.els[0] });
    this.render();
  },
  decideAll(accept) {
    const list = this.items();
    if (!list.length) return;
    change(() => list.forEach(it => it.els.forEach(el => el.isConnected && (accept ? Track.accept(el) : Track.reject(el)))), { full: true });
    toast(`${accept ? 'Accepted' : 'Rejected'} ${fmtInt(list.length)} ${list.length === 1 ? 'fix' : 'fixes'} from Claude.`);
    this.render();
  },
  go(pf) {
    const it = this.find(pf);
    if (!it) return;
    const r = document.createRange();
    r.setStartBefore(it.els[0]); r.setEndAfter(it.els[it.els.length - 1]);
    S.editor.focus({ preventScroll: true });
    setRange(r);
    it.els[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  /* the words around a fix, as shown */
  context(it) {
    const first = it.els[0], lastEl = it.els[it.els.length - 1], b = blockOf(first);
    if (!b) return ['', ''];
    const shown = r => {
      const f = r.cloneContents();
      f.querySelectorAll(PROOF_SKIP).forEach(n => n.remove());
      f.querySelectorAll('br').forEach(n => n.replaceWith(' '));
      return f.textContent.replace(PROOF_ZW, '').replace(/\s+/g, ' ');
    };
    const r1 = document.createRange(), r2 = document.createRange();
    try { r1.setStart(b, 0); r1.setEndBefore(first); r2.setStartAfter(lastEl); r2.setEnd(b, b.childNodes.length); } catch { return ['', '']; }
    let before = shown(r1), after = shown(r2);
    if (before.length > 30) before = '…' + before.slice(-30).replace(/^\S*\s/, '');
    if (after.length > 30) after = after.slice(0, 30).replace(/\s\S*$/, '') + '…';
    return [before, after];
  },
  /* ---------- the Claude pane's Proofread view ---------- */
  init(sec) {
    if (sec.querySelector('.asst-views')) return;
    const sw = h('div', { class: 'seg asst-views', role: 'tablist', 'aria-label': 'Claude' },
      h('button', { type: 'button', role: 'tab', 'data-v': 'write', 'aria-selected': 'true' }, 'Write'),
      h('button', { type: 'button', role: 'tab', 'data-v': 'proof', 'aria-selected': 'false' }, 'Proofread'));
    sw.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) this.setView(b.dataset.v); });
    sec.prepend(sw);
    const box = h('div', { id: 'proofBox', class: 'proof-box', hidden: true });
    box.addEventListener('click', e => this.onClick(e));
    box.addEventListener('mousedown', e => { if (e.target.closest('[data-keep]')) e.preventDefault(); });
    box.addEventListener('keydown', e => {
      const c = e.target.closest('.proof-item');
      if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.go(c.dataset.pf); }
    });
    sec.appendChild(box);
    this.setView(this.view);
  },
  onClick(e) {
    const t = e.target.closest('[data-fk]');
    if (!t) return;
    const k = t.dataset.fk, pf = t.dataset.pf;
    if (k === 'go') this.run();
    else if (k === 'stop') this.stop();
    else if (k === 'aa') this.decideAll(true);
    else if (k === 'ra') this.decideAll(false);
    else if (k === 'ok') this.decide(pf, true);
    else if (k === 'no') this.decide(pf, false);
    else if (k === 'card') this.go(pf);
  },
  setView(v) {
    this.view = v === 'proof' ? 'proof' : 'write';
    const sec = $('[data-section="assistant"]');
    if (!sec) return;
    sec.querySelectorAll('.asst-views button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === this.view ? 'true' : 'false'));
    const box = sec.querySelector('.asst-box'), pb = $('#proofBox');
    if (box) box.hidden = this.view !== 'write';
    if (pb) pb.hidden = this.view !== 'proof';
    if (this.view === 'proof') this.render();
  },
  show() {
    if (S.pane !== 'assistant') openPane('assistant');
    else Assistant.init();
    this.setView('proof');
  },
  shown() { const b = $('#proofBox'); return !!(b && !b.hidden && S.pane === 'assistant'); },
  renderSoon: debounce(() => Proof.render(), 200),
  /* the button's words and the card at the caret, as the selection moves */
  onSel(r) {
    if (!this.shown()) return;
    const l = $('#proofBox [data-fk="go"] .lbl');
    if (l) l.textContent = this.label();
    let n = r && (r.startContainer.nodeType === 1 ? (r.startContainer.childNodes[r.startOffset] || r.startContainer) : r.startContainer.parentNode);
    if (n && n.nodeType !== 1) n = n.parentNode;
    const el = n && n.closest ? n.closest('[data-pf]') : null;
    const pf = el && S.editor.contains(el) ? el.getAttribute('data-pf') : '';
    $$('#proofBox .proof-item').forEach(c => c.classList.toggle('on', !!pf && c.dataset.pf === pf));
  },
  render() {
    const box = $('#proofBox');
    if (!box || box.hidden) return;
    const act = document.activeElement;
    const fk = act && box.contains(act) ? act.dataset.fk + '|' + (act.dataset.pf || '') : null;
    box.innerHTML = '';
    const can = this.available() && !S.readOnly;
    const row = h('div', { class: 'asst-row' },
      h('button', { class: 'btn primary', type: 'button', 'data-fk': 'go', 'data-keep': '', disabled: this.running || !can }, h('span', { html: icon('proof') }), h('span', { class: 'lbl' }, this.label())));
    if (this.running) row.appendChild(h('button', { class: 'btn', type: 'button', 'data-fk': 'stop' }, 'Stop'));
    box.appendChild(row);
    const s = this.stats;
    if (!s && !this.note) box.appendChild(h('p', { class: 'note' }, 'Claude checks spelling, grammar and punctuation in Bangla and English. Each fix shows in the page as a tracked change for you to accept or reject.'));
    if (!this.available()) box.appendChild(h('p', { class: 'note proof-note' }, 'Proofreading uses Claude, which isn’t available in this view. Open Folio inside Claude to use it.'));
    else if (S.readOnly) box.appendChild(h('p', { class: 'note proof-note' }, 'This document is read-only. Turn off Restrict Editing to proofread it.'));
    if (this.running && s) {
      const pct = Math.round(100 * s.done / Math.max(1, s.paras));
      box.appendChild(h('div', { class: 'proof-prog' },
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Proofreading' }, h('i', { style: { width: pct + '%' } })),
        h('div', { class: 'note' }, `Checking ${fmtInt(s.paras)} ${s.paras === 1 ? 'paragraph' : 'paragraphs'}… ${fmtInt(s.done)} done`)));
    }
    const list = this.items();
    if (list.length) {
      box.appendChild(h('div', { class: 'asst-row proof-all' },
        h('span', { class: 'proof-count' }, `${fmtInt(list.length)} ${list.length === 1 ? 'fix' : 'fixes'}`),
        h('button', { class: 'btn', type: 'button', 'data-fk': 'aa' }, 'Accept all'),
        h('button', { class: 'btn', type: 'button', 'data-fk': 'ra' }, 'Reject all')));
      const ul = h('div', { class: 'proof-list', role: 'list' });
      for (const it of list) {
        const [before, after] = this.context(it);
        const space = t => /^\s+$/.test(t);
        const vis = t => (space(t) ? '␣'.repeat(Math.min(t.length, 3)) : t), word = t => (space(t) ? 'a space' : t);
        const say = it.del && it.ins ? `Change ${word(it.del)} to ${word(it.ins)}` : it.del ? `Delete ${word(it.del)}` : `Add ${word(it.ins)}`;
        ul.appendChild(h('div', { class: 'proof-item', role: 'listitem', tabindex: '0', 'data-fk': 'card', 'data-pf': it.pf, 'aria-label': `${say}. ${it.why}` },
          h('div', { class: 'proof-words' },
            before ? h('span', { class: 'ctx' }, before) : null,
            it.del ? h('del', { class: space(it.del) ? 'sp' : null }, vis(it.del)) : null,
            it.ins ? h('ins', { class: space(it.ins) ? 'sp' : null }, vis(it.ins)) : null,
            after ? h('span', { class: 'ctx' }, after) : null),
          it.why ? h('div', { class: 'proof-why' }, it.why) : null,
          h('div', { class: 'proof-acts' },
            h('button', { class: 'tb-btn', type: 'button', title: 'Accept', 'aria-label': 'Accept this fix', 'data-fk': 'ok', 'data-pf': it.pf, html: icon('check') }),
            h('button', { class: 'tb-btn', type: 'button', title: 'Reject', 'aria-label': 'Reject this fix', 'data-fk': 'no', 'data-pf': it.pf, html: icon('close') }))));
      }
      box.appendChild(ul);
    } else if (s && !this.running) {
      const ok = s.paras - s.failed;
      if (ok > 0 && !(this.note && s.done < s.paras)) box.appendChild(h('p', { class: 'proof-done' }, s.fixes ? 'All of Claude’s fixes have been accepted or rejected.' : `No mistakes found in ${fmtInt(ok)} ${ok === 1 ? 'paragraph' : 'paragraphs'}.`));
    }
    if (s && !this.running && s.fixes && list.length) box.appendChild(h('p', { class: 'note' }, `Claude found ${fmtInt(s.fixes)} ${s.fixes === 1 ? 'mistake' : 'mistakes'} in ${fmtInt(s.paras)} ${s.paras === 1 ? 'paragraph' : 'paragraphs'}. Click one to see it in the page.`));
    if (this.note) box.appendChild(h('p', { class: 'note proof-note' }, this.note));
    // keep the keyboard where it was
    if (fk) {
      const [k, pf] = fk.split('|');
      let el = box.querySelector(`[data-fk="${k}"]${pf ? `[data-pf="${CSS.escape(pf)}"]` : ''}`);
      if (!el && this.focusIdx >= 0) { const cards = box.querySelectorAll('.proof-item'); el = cards[Math.min(this.focusIdx, cards.length - 1)] || box.querySelector('[data-fk="go"]'); }
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
    this.focusIdx = -1;
    this.onSel(getRange() || lastRange);
  },
};
