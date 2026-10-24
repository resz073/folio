/* ===================== Version history =====================
   Folio keeps versions of each document as you work: one at a save at least VER_GAP after the
   last one (automatic), and one whenever you name the current version. In the account a version
   is only the list of content-addressed chunks the document was saved in (so pictures aren't
   stored again; CloudStore keeps chunks a version uses) and its settings; in this browser it is
   a copy. The newest KEEP automatic versions are kept, named ones until deleted.
   File › Version History lists them by day; each can be previewed, shown with the changes made
   since, restored (the current text is kept as a version first, and undo works), or opened as a
   new document with the changes as tracked changes (Compare). Review › Compare also compares the
   document with a Word file. */
const VER_GAP = 10 * 60e3;
const Versions = {
  cache: {},          // doc id -> versions, newest first
  busy: false,
  gap: VER_GAP,
  keep() { return Store.cloud ? 40 : 15; },
  async list(id = S.doc && S.doc.id, force) {
    if (!id) return [];
    if (this.cache[id] && !force) return this.cache[id];
    try { this.cache[id] = (await Store.impl.listVersions(id)).sort((a, b) => b.at - a.at); }
    catch (e) { console.warn('versions unavailable', e); this.cache[id] = this.cache[id] || []; }
    return this.cache[id];
  },
  /* after each save: a version when the last one is old enough and the text has changed */
  async afterSave(doc, saved) {
    if (!doc || doc.sample || !(doc.words > 0) || this.busy) return;
    const list = await this.list(doc.id);
    const last = list[0];
    if (last && (last.h === hash53(doc.html || '') || Date.now() - last.at < this.gap)) return;
    try { await this.add(doc, saved, { auto: true }); } catch (e) { console.warn('version not kept', e); }
  },
  async add(doc, saved, o = {}) {
    const { html, ...rest } = doc;
    const v = { id: uid('v'), at: Date.now(), name: String(o.name || '').trim().slice(0, 80), auto: !!o.auto, author: Prefs.author || Cap.name || '', words: doc.words || 0, h: hash53(html || ''), title: doc.title || '' };
    this.busy = true;
    try {
      if (Store.cloud) {
        const meta = saved && saved.chunks ? saved : await CloudStore.save(doc);
        v.chunks = meta.chunks; v.hfChunks = meta.hfChunks || []; v.fnChunks = meta.fnChunks || []; v.body = meta.body;
        await CloudStore.addVersion(doc.id, v);
      } else await LocalStore.addVersion(doc.id, v, { html: html || '', body: JSON.stringify(rest) });
      const list = await this.list(doc.id);
      if (!list.some(x => x.id === v.id)) list.unshift(v);
      await this.thin(doc.id);
    } finally { this.busy = false; }
    return v;
  },
  async thin(id) {
    const list = this.cache[id] || [];
    const autos = list.filter(v => v.auto), n = this.keep();
    const drop = new Set(autos.slice(n));
    for (const v of drop) { try { await Store.impl.removeVersion(id, v); } catch { } }
    this.cache[id] = list.filter(v => !drop.has(v));
  },
  /* the document as it is now */
  async snapshot(name, o = {}) {
    await Saver.flush();
    const doc = snapshotDoc();
    return this.add(doc, null, { name, auto: !!o.auto });
  },
  async load(v, id = S.doc.id) { return Store.impl.loadVersion(id, v); },
  async remove(v, id = S.doc.id) { await Store.impl.removeVersion(id, v); this.cache[id] = (this.cache[id] || []).filter(x => x.id !== v.id); },
  async rename(v, name, id = S.doc.id) { v.name = String(name || '').trim().slice(0, 80); if (v.name) v.auto = false; await Store.impl.renameVersion(id, v); },
  /* back to a version's text and settings; the current one is kept as a version first */
  async restore(v) {
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to restore a version.'); return false; }
    const data = await this.load(v);
    await this.snapshot('Before restoring ' + this.when(v.at), { auto: true });
    beginChange();
    histRecord();
    S.editor.innerHTML = data.html || '<p><br></p>';
    const body = data.body || {};
    // a version from before headers had their own model: its left / centre / right texts
    if (!body.hf && (body.header || body.footer)) body.hf = HF.ensure({ header: body.header, footer: body.footer }).hf;
    for (const k of ['page', 'hf', 'firstDiff', 'evenDiff', 'pn', 'watermark', 'comments', 'footnotes', 'notePr', 'styles', 'font', 'size', 'line', 'after', 'headFont', 'bnFont', 'lang']) if (k in body) S.doc[k] = body[k];
    // (the first section's page numbers: none kept when the version has none)
    if (!('pn' in body)) delete S.doc.pn;
    HF.ensure(S.doc);
    histRecord();
    afterContentReplaced(true);
    Saver.mark();
    return true;
  },
  /* ---------- words for times ---------- */
  day(t) {
    const d = new Date(t), now = new Date();
    const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (same(d, now)) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (same(d, y)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  },
  time(t) { return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); },
  when(t) { const d = this.day(t); return (d === 'Today' ? '' : d + ', ') + this.time(t); },
  label(v) { return v ? v.name || 'Autosaved version' : 'Current version'; },
  /* ---------- File › Version History ---------- */
  nameDialog(onDone) {
    const i = input('', { maxlength: '80', placeholder: 'For example: Sent to the Managing Director' });
    openDialog({ title: 'Name Current Version', width: 420, body: h('div', null, field('Name', i, 'verName'), h('p', { class: 'note' }, 'A named version is kept until you delete it.')),
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => {
        const name = i.value.trim();
        if (!name) { i.focus(); return false; }
        (async () => { try { await this.snapshot(name); toast(`Saved this version as “${name}”.`); } catch (e) { console.warn(e); toast('The version couldn’t be saved. Try again.', { error: true }); } if (onDone) onDone(); })();
      } }] });
  },
  async page(m) {
    const doc = S.doc;
    m.appendChild(h('h1', null, 'Version History'));
    const listEl = h('div', { class: 'vh-list', role: 'listbox', 'aria-label': 'Versions' });
    const nameB = h('button', { class: 'btn primary', type: 'button' }, h('span', { html: icon('plus') }), 'Name Current Version…');
    nameB.addEventListener('click', () => this.nameDialog(() => { if (Backstage.page === 'history' && !$('#backstage').hidden) Backstage.show('history'); }));
    const side = h('div', { class: 'vh-side' }, nameB,
      h('p', { class: 'note' }, `Folio keeps a version about every 10 minutes while you work${Store.cloud ? ', with your account' : ', in this browser'}: the newest ${this.keep()}, and the ones you name until you delete them.`),
      listEl);
    const bar = h('div', { class: 'vh-bar' }), stage = h('div', { class: 'vh-stage', tabindex: '0', 'aria-label': 'Preview' });
    const main = h('div', { class: 'vh-main' }, bar, stage);
    m.appendChild(h('div', { class: 'vh-grid' }, side, main));
    listEl.appendChild(h('p', { class: 'note' }, 'Loading versions…'));
    const list = await this.list(doc.id, true);
    if (S.doc !== doc) return;
    const st = { v: null, changes: false, cur: cleanHTML() };
    const pick = async v => {
      st.v = v;
      listEl.querySelectorAll('.vh-item').forEach(b => b.setAttribute('aria-selected', String(b._v === v)));
      await this.show(st, bar, stage, () => Backstage.show('history'));
    };
    listEl.innerHTML = '';
    const item = v => {
      const b = h('button', { class: 'vh-item', type: 'button', role: 'option', 'aria-selected': 'false' },
        h('span', { class: 'vh-t' }, v ? this.time(v.at) : 'Now'),
        h('span', { class: 'vh-n' }, this.label(v)),
        h('span', { class: 'vh-a note' }, v ? [v.author, `${fmtInt(v.words)} ${v.words === 1 ? 'word' : 'words'}`].filter(Boolean).join(' · ') : 'What you see in the document'));
      b._v = v;
      b.addEventListener('click', () => pick(v));
      return b;
    };
    listEl.appendChild(item(null));
    let day = '';
    for (const v of list) {
      const d = this.day(v.at);
      if (d !== day) { day = d; listEl.appendChild(h('div', { class: 'vh-day' }, d)); }
      listEl.appendChild(item(v));
    }
    if (!list.length) listEl.appendChild(h('p', { class: 'note vh-none' }, 'No earlier versions yet. The first one is kept about 10 minutes after you start writing, or name one now.'));
    listEl.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = Array.from(listEl.querySelectorAll('.vh-item'));
      const i = items.indexOf(document.activeElement);
      const n = items[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1)];
      if (n) { n.focus(); n.click(); }
    });
    await pick(null);
  },
  /* the bar and the preview for the chosen version (null: the current document) */
  async show(st, bar, stage, again) {
    const v = st.v;
    bar.innerHTML = '';
    const title = h('div', { class: 'vh-title' }, h('strong', null, this.label(v)), h('span', { class: 'note' }, v ? `${this.when(v.at)}${v.author ? ' · ' + v.author : ''}` : 'The document as it is now'));
    bar.appendChild(title);
    if (!v) { this.preview(stage, st.cur); return; }
    let data;
    try { data = await this.load(v); }
    catch (e) { console.warn(e); stage.innerHTML = ''; stage.appendChild(h('p', { class: 'note' }, 'This version couldn’t be loaded.')); return; }
    if (st.v !== v) return;
    const acts = h('div', { class: 'vh-acts' });
    const chk = h('input', { type: 'checkbox', id: 'vhChanges' });
    chk.checked = st.changes;
    chk.addEventListener('change', () => { st.changes = chk.checked; draw(); });
    const restore = h('button', { class: 'btn primary', type: 'button', disabled: S.readOnly || null }, 'Restore');
    const open = h('button', { class: 'btn', type: 'button' }, 'Open the Changes…');
    const rename = h('button', { class: 'btn', type: 'button' }, v.name ? 'Rename…' : 'Name…');
    const del = h('button', { class: 'tb-btn', type: 'button', title: 'Delete this version', 'aria-label': 'Delete this version', html: icon('trash') });
    acts.append(h('label', { class: 'check vh-chk', for: 'vhChanges' }, chk, 'Show changes since'), restore, open, rename, del);
    bar.appendChild(acts);
    const confirmRow = (msg, okLabel, fn, danger) => {
      const row = h('div', { class: 'vh-confirm', role: 'alert' }, h('span', null, msg));
      const ok = h('button', { class: 'btn' + (danger ? ' danger' : ' primary'), type: 'button' }, okLabel), no = h('button', { class: 'btn', type: 'button' }, 'Cancel');
      no.addEventListener('click', () => { row.remove(); acts.hidden = false; });
      ok.addEventListener('click', async () => { ok.disabled = no.disabled = true; await fn(); });
      row.append(ok, no);
      acts.hidden = true;
      bar.appendChild(row);
      ok.focus();
    };
    restore.addEventListener('click', () => confirmRow('Go back to this version? What you have now is kept as a version first, and Undo works too.', 'Restore', async () => {
      if (await this.restore(v)) { Backstage.close(); toast(`Restored the version from ${this.when(v.at)}.`); }
    }));
    del.addEventListener('click', () => confirmRow('Delete this version for good?', 'Delete', async () => { await this.remove(v); again(); }, true));
    rename.addEventListener('click', () => {
      const i = input(v.name || '', { maxlength: '80' });
      openDialog({ title: v.name ? 'Rename Version' : 'Name Version', width: 420, body: h('div', null, field('Name', i, 'verRename'), h('p', { class: 'note' }, 'A named version is kept until you delete it.')),
        buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { (async () => { await this.rename(v, i.value); again(); })(); } }] });
    });
    open.addEventListener('click', async () => {
      const res = Compare.run(data.html, st.cur);
      await Compare.openDoc(res, `${S.doc.title || 'Document'} (changes since ${this.when(v.at)})`);
      Backstage.close();
    });
    const draw = () => {
      if (st.changes) { const res = Compare.run(data.html, st.cur); this.preview(stage, res.html, data.body); title.lastChild.textContent = `${this.when(v.at)} · ${res.n ? `${fmtInt(res.n)} ${res.n === 1 ? 'change' : 'changes'} since` : 'no changes since'}`; }
      else { this.preview(stage, data.html, data.body); title.lastChild.textContent = `${this.when(v.at)}${v.author ? ' · ' + v.author : ''}`; }
    };
    draw();
  },
  /* a page-wide picture of some document HTML, scaled to the pane */
  preview(stage, html, body) {
    stage.innerHTML = '';
    const g = geom();
    const pageEl = h('div', { class: 'vh-page doc' });
    pageEl.style.cssText = $('#paper').style.cssText;
    pageEl.style.removeProperty('transform'); pageEl.style.removeProperty('width'); pageEl.style.removeProperty('height');
    if (body && body.font) pageEl.style.setProperty('--doc-font', fontStack(body.font));
    if (body && body.size) pageEl.style.setProperty('--doc-size', body.size + 'pt');
    Object.assign(pageEl.style, { position: 'relative', left: '0', top: '0', width: g.w + 'px', padding: `${g.mt}px ${g.mr}px ${g.mb}px ${g.ml}px`, transformOrigin: '0 0' });
    pageEl.innerHTML = html || '<p><br></p>';
    pageEl.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
    const wrap = h('div', { class: 'vh-scale' }, pageEl);
    stage.appendChild(wrap);
    const fit = () => {
      const k = Math.min(1, Math.max(0.2, (stage.clientWidth - 32) / g.w));
      pageEl.style.transform = `scale(${k})`;
      wrap.style.width = Math.round(g.w * k) + 'px';
      wrap.style.height = Math.round(pageEl.offsetHeight * k) + 'px';
    };
    fit();
    requestAnimationFrame(fit);
  },
};

/* ===================== Compare =====================
   Two versions of a document → the newer one with what changed as tracked changes: blocks are
   matched by their text (common start and end, then the longest common sequence); unmatched
   blocks of the same kind that look alike are paired and compared word by word; the rest are
   deleted or inserted whole. Lists and quotes are compared item by item, tables row by row and
   cell by cell (rows of a different shape are deleted and inserted). Formatting-only changes
   aren't marked. */
const Compare = {
  run(oldHtml, newHtml, who = Prefs.author || Cap.name || 'Author', at = Date.now()) {
    this.who = who || 'Author'; this.at = String(at); this.n = 0;
    this.color = TC_COLORS[parseInt(hash53(this.who).slice(-3), 36) % TC_COLORS.length];
    const A = this.parse(oldHtml), B = this.parse(newHtml);
    const out = document.createElement('div');
    for (const k of this.blocks(this.kids(A), this.kids(B))) out.appendChild(k);
    out.querySelectorAll('span.cmt').forEach(sp => unwrap(sp));
    return { html: out.innerHTML, n: this.n };
  },
  parse(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    for (const n of Array.from(d.childNodes)) if (n.nodeType === 3) { if (n.data.trim()) n.replaceWith(h('p', null, n.data)); else n.remove(); }
    return d;
  },
  kids(el) { return Array.from(el.children); },
  /* an element's words, with a space between its paragraphs, cells and lines */
  text(el) {
    let s = '';
    const walk = n => {
      for (let k = n.firstChild; k; k = k.nextSibling) {
        if (k.nodeType === 3) s += k.data;
        else if (k.nodeType === 1) { const b = BLOCK_TAGS.has(k.tagName) || k.tagName === 'BR'; if (b) s += ' '; walk(k); if (b) s += ' '; }
      }
    };
    walk(el);
    return s.replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
  },
  key(el) {
    let k = el.nodeName + '|' + this.text(el);
    for (const im of el.tagName === 'IMG' ? [el] : el.querySelectorAll('img')) k += '|' + hash53(im.getAttribute('src') || '').slice(0, 8) + (im.className ? ':' + im.className : '');
    return k;
  },
  words(s) { return s.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []; },
  sim(a, b) {
    if (a.nodeName === 'TABLE') return 1;
    const ta = this.words(this.text(a)), tb = this.words(this.text(b));
    if (!ta.length && !tb.length) return this.key(a) === this.key(b) ? 1 : 0.5;
    const m = new Map();
    for (const t of ta) m.set(t, (m.get(t) || 0) + 1);
    let c = 0;
    for (const t of tb) { const k = m.get(t); if (k) { c++; m.set(t, k - 1); } }
    return 2 * c / (ta.length + tb.length);
  },
  /* pairs [i, j] of equal items: the common start and end, then the longest common sequence
     between (none when that is too big to work out) */
  lcs(a, b) {
    const n = a.length, m = b.length, pairs = [];
    let s = 0;
    while (s < n && s < m && a[s] === b[s]) { pairs.push([s, s]); s++; }
    let e = 0;
    while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
    const N = n - s - e, M = m - s - e;
    if (N > 0 && M > 0 && N * M <= 4e6) {
      const W = M + 1, L = Math.min(N, M) < 65535 ? new Uint16Array((N + 1) * W) : new Uint32Array((N + 1) * W);
      for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--) L[i * W + j] = a[s + i] === b[s + j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      let i = 0, j = 0;
      while (i < N && j < M) {
        if (a[s + i] === b[s + j]) { pairs.push([s + i, s + j]); i++; j++; }
        else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) i++;
        else j++;
      }
    }
    for (let k = e; k > 0; k--) pairs.push([n - k, m - k]);
    return pairs;
  },
  stamp(el) {
    el.className = 'tc';
    el.setAttribute('data-author', this.who);
    el.setAttribute('data-time', this.at);
    el.style.setProperty('--tcc', this.color);
    return el;
  },
  /* every piece of text and picture in a node marked inserted or deleted */
  mark(node, kind) {
    const list = [];
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.currentNode; n; n = w.nextNode()) {
      if (n.nodeType === 3) { if (n.data.replace(/[\u200B\s]/g, '') && !n.parentNode.closest('ins.tc, del.tc')) list.push(n); }
      else if (n.tagName === 'IMG' && !n.closest('ins.tc, del.tc')) list.push(n);
    }
    if (list.length) { this.n++; if (node.nodeType === 1) node.setAttribute('data-tcb', kind); }
    for (const t of list) { const el = this.stamp(document.createElement(kind)); t.parentNode.insertBefore(el, t); el.appendChild(t); }
    return node;
  },
  blocks(O, N) {
    const pairs = this.lcs(O.map(n => this.key(n)), N.map(n => this.key(n)));
    const out = [];
    let i = 0, j = 0;
    const gap = (i1, j1) => {
      const os = O.slice(i, i1), ns = N.slice(j, j1);
      // as many old as new between two matches: each one changed in its place
      if (os.length === ns.length && os.every((o, k) => o.nodeName === ns[k].nodeName)) { os.forEach((o, k) => out.push(...this.pair(o, ns[k]))); return; }
      let q = 0;
      for (const o of os) {
        let best = -1, bs = 0.34;
        for (let t = q; t < Math.min(ns.length, q + 8); t++) {
          if (o.nodeName !== ns[t].nodeName) continue;
          const s = this.sim(o, ns[t]);
          if (s > bs) { bs = s; best = t; }
        }
        if (best < 0) { out.push(this.mark(o.cloneNode(true), 'del')); continue; }
        for (; q < best; q++) out.push(this.mark(ns[q].cloneNode(true), 'ins'));
        out.push(...this.pair(o, ns[best]));
        q = best + 1;
      }
      for (; q < ns.length; q++) out.push(this.mark(ns[q].cloneNode(true), 'ins'));
    };
    for (const [pi, pj] of pairs) { gap(pi, pj); out.push(N[pj].cloneNode(true)); i = pi + 1; j = pj + 1; }
    gap(O.length, N.length);
    return out;
  },
  hasBlocks(el) { return Array.from(el.children).some(k => BLOCK_TAGS.has(k.tagName)); },
  pair(o, n) {
    if (n.nodeName === 'TABLE') return [this.table(o, n)];
    const ob = this.hasBlocks(o), nb = this.hasBlocks(n);
    if (ob && nb && !n.classList.contains('toc')) {
      // a list, quote or box of paragraphs: item by item (any text loose in it is compared as well)
      const loose = el => Array.from(el.childNodes).some(k => (k.nodeType === 3 && k.data.trim()) || (k.nodeType === 1 && !BLOCK_TAGS.has(k.tagName)));
      if (!loose(o) && !loose(n)) { const c = n.cloneNode(false); for (const k of this.blocks(this.kids(o), this.kids(n))) c.appendChild(k); return [c]; }
    }
    if (!ob && !nb) return [this.wordDiff(o, n)];
    return this.key(o) === this.key(n) ? [n.cloneNode(true)] : [this.mark(o.cloneNode(true), 'del'), this.mark(n.cloneNode(true), 'ins')];
  },
  /* a cell's content: its paragraphs, or its text when it has none */
  cell(oc, nc, outCell) {
    if (this.hasBlocks(oc) && this.hasBlocks(nc)) outCell.replaceChildren(...this.blocks(this.kids(oc), this.kids(nc)));
    else if (!this.hasBlocks(oc) && !this.hasBlocks(nc)) outCell.replaceChildren(...Array.from(this.wordDiff(oc, nc).childNodes));
    else if (this.text(oc) !== this.text(nc)) { const d = this.mark(oc.cloneNode(true), 'del'), i = this.mark(nc.cloneNode(true), 'ins'); outCell.replaceChildren(...Array.from(d.childNodes), ...Array.from(i.childNodes)); }
  },
  table(o, n) {
    const out = n.cloneNode(true);
    const ro = Array.from(o.rows), rn = Array.from(n.rows), outRows = Array.from(out.rows);
    const pairs = this.lcs(ro.map(r => this.key(r)), rn.map(r => this.key(r)));
    let i = 0, j = 0;
    // an old row that is gone goes in before the new row now due, or at the end
    const before = (row, jj) => { const ref = outRows[jj]; if (ref) ref.parentNode.insertBefore(row, ref); else if (outRows.length) outRows[outRows.length - 1].parentNode.appendChild(row); else (out.tBodies[0] || out).appendChild(row); };
    const pairRows = (r0, r1, outRow) => {
      const c0 = Array.from(r0.cells), c1 = Array.from(r1.cells), co = Array.from(outRow.cells);
      for (let k = 0; k < c1.length; k++) this.cell(c0[k], c1[k], co[k]);
    };
    const gap = (i1, j1) => {
      let q = j;
      for (let a = i; a < i1; a++) {
        const r0 = ro[a];
        let best = -1, bs = 0.3;
        for (let t = q; t < Math.min(j1, q + 6); t++) {
          if (rn[t].cells.length !== r0.cells.length) continue;
          const s = this.sim(r0, rn[t]);
          if (s > bs) { bs = s; best = t; }
        }
        if (best < 0) { before(this.mark(r0.cloneNode(true), 'del'), q); continue; }
        for (; q < best; q++) this.mark(outRows[q], 'ins');
        pairRows(r0, rn[best], outRows[best]);
        q = best + 1;
      }
      for (; q < j1; q++) this.mark(outRows[q], 'ins');
    };
    for (const [pi, pj] of pairs) { gap(pi, pj); i = pi + 1; j = pj + 1; }
    gap(ro.length, rn.length);
    return out;
  },
  tokens(text) {
    const out = [];
    // words; a number keeps its separators (4,500.50, 10:30, 19/10/2026); anything else one by one
    const re = /[\p{L}\p{M}\p{N}\u200C\u200D]+(?:[.,:/-]\p{N}+)*|[^]/gu;
    let m;
    while ((m = re.exec(text))) out.push({ s: m[0], a: m.index, z: m.index + m[0].length });
    return out;
  },
  /* a paragraph word by word: the new one, with what was taken out (deleted) and put in (inserted) */
  wordDiff(o, n) {
    const out = n.cloneNode(true);
    const ta = this.tokens(Proof.textOf(o).text), tb = this.tokens(Proof.textOf(out).text);
    if (ta.map(t => t.s).join('') === tb.map(t => t.s).join('')) return out;
    if (ta.length * tb.length > 4e6) { const d = this.mark(o.cloneNode(true), 'del'); this.mark(out, 'ins'); out.prepend(...Array.from(d.childNodes)); return out; }
    const pairs = this.lcs(ta.map(t => t.s), tb.map(t => t.s));
    // runs of changes between equal tokens: { del: text, at: position in the new text, ins: [a, z) }
    const ch = [];
    let i = 0, j = 0;
    const take = (i1, j1) => {
      if (i1 > i || j1 > j) {
        const at = j < tb.length ? tb[j].a : (tb.length ? tb[tb.length - 1].z : 0);
        ch.push({ del: ta.slice(i, i1).map(t => t.s).join(''), at, ins: j1 > j ? [tb[j].a, tb[j1 - 1].z] : null, i, i1, j, j1 });
      }
    };
    for (const [pi, pj] of pairs) { take(pi, pj); i = pi + 1; j = pj + 1; }
    take(ta.length, tb.length);
    // two changes with only a space between them read better as one
    for (let k = ch.length - 1; k > 0; k--) {
      const a = ch[k - 1], b = ch[k];
      const midNew = tb.slice(a.j1, b.j).map(t => t.s).join(''), midOld = ta.slice(a.i1, b.i).map(t => t.s).join('');
      if (midNew === midOld && /^\s{1,2}$/.test(midNew)) {
        ch.splice(k - 1, 2, { del: a.del + midOld + b.del, at: a.at, ins: [a.ins ? a.ins[0] : a.at, b.ins ? b.ins[1] : tb[b.j - 1].z], i: a.i, i1: b.i1, j: a.j, j1: b.j1 });
      }
    }
    if (ch.length) this.n += ch.length;
    // right to left, inserted text marked first, then the deleted text put before it
    for (const c of ch.reverse()) {
      if (c.ins && c.ins[1] > c.ins[0]) this.wrapRange(out, c.ins[0], c.ins[1]);
      if (c.del) this.putDel(out, c.at, c.del);
    }
    return out;
  },
  wrapRange(el, s, e) {
    const { map } = Proof.textOf(el);
    const a = Proof.at(map, s, false), z = Proof.at(map, e, true);
    if (!a || !z) return;
    const r = document.createRange();
    try { r.setStart(a[0], a[1]); r.setEnd(z[0], z[1]); } catch { return; }
    for (const t of textNodesIn(r)) {
      if (t.parentNode.closest(PROOF_SKIP) || !t.data.replace(/\u200B/g, '')) continue;
      const ins = this.stamp(document.createElement('ins'));
      t.parentNode.insertBefore(ins, t);
      ins.appendChild(t);
    }
  },
  putDel(el, pos, text) {
    const del = this.stamp(document.createElement('del'));
    del.textContent = text;
    const { map } = Proof.textOf(el);
    const p = Proof.at(map, pos, true);
    if (!p) { el.insertBefore(del, el.firstChild && el.firstChild.nodeName === 'BR' && !el.firstChild.nextSibling ? el.firstChild : null); return; }
    const [node, off] = p;
    if (off >= node.length) node.after(del);
    else if (off <= 0) {
      // at the very start: before an insertion that starts there, not inside it
      let t = node;
      while (t.parentNode !== el && t.parentNode.firstChild === t && t.parentNode.matches('ins.tc')) t = t.parentNode;
      t.before(del);
    } else { node.splitText(off); node.after(del); }
  },
  /* the comparison as a new document, opened */
  async openDoc(res, title, styles) {
    await Saver.flush();
    const cur = snapshotDoc();
    // the Word file's own paragraph styles come along (its paragraphs name them)
    const st = Object.assign({}, styles || {}, cur.styles || {});
    const d = Object.assign({}, cur, { id: uid('d'), title, html: res.html, created: Date.now(), modified: Date.now(), comments: [], track: false, sample: false, styles: st });
    try { await Store.impl.save(d); } catch (e) { console.warn(e); }
    openDoc(d, { fresh: true });
    Saver.mark();
    toast(res.n ? `${fmtInt(res.n)} ${res.n === 1 ? 'change' : 'changes'}, shown as tracked changes. Accept or reject them on the Review tab.` : 'No changes in the text.', { ms: 6000 });
  },
  /* Review › Compare › Compare with a Word File */
  withFile() {
    pickFile('.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, async files => {
      const f = files[0];
      let r;
      const b = busy('Reading ' + f.name + '…');
      try { r = await readDocxFile(await f.arrayBuffer()); }
      catch (e) { console.warn(e); toast('That file couldn’t be read as a Word document.', { error: true }); return; }
      finally { b.close(); }
      const dir = select([['file', `What changed from “${f.name}” to this document`], ['doc', `What changed from this document to “${f.name}”`]], 'file', { id: 'cmpDir' });
      openDialog({ title: 'Compare Documents', width: 520, body: h('div', null, field('Show', dir, 'cmpDir'), h('p', { class: 'note' }, 'Opens a new document with every change as a tracked change. Neither document is changed.')),
        buttons: [{ label: 'Cancel' }, { label: 'Compare', primary: true, onClick: () => {
          const cur = cleanHTML();
          const res = dir.value === 'file' ? this.run(r.html, cur) : this.run(cur, r.html, 'Author');
          this.openDoc(res, `${S.doc.title || 'Document'} compared with ${f.name.replace(/\.docx$/i, '')}`, r.settings && r.settings.styles);
        } }] });
    });
  },
};
