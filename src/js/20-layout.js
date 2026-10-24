/* ===================== Page layout & pagination =====================
   The document is one continuous contenteditable laid over a stack of sheet
   backgrounds. Pagination nudges content so that every line lands inside a
   sheet's text area:
   - a block that must start on the next page gets a ::before spacer (--pgp)
   - a table row gets a spacer row in front of it
   - a long paragraph is split between lines by an inline zero-width spacer
   Nothing here is saved: cleanHTML() strips every artifact. */
const Layout = {
  raf: 0, fullPending: true, dirty: new Set(), cache: new WeakMap(), waitingIME: false,
  soon(node) {
    if (node == null) this.fullPending = true;
    else { const u = unitOf(node); if (u) this.dirty.add(u); else this.fullPending = true; }
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.run(); });
  },
  full() { this.fullPending = true; cancelAnimationFrame(this.raf); this.raf = 0; this.run(); },
  run() {
    if (!S.doc || !S.editor) return;
    HF.sync();
    const ed = Story.cur;
    if (ed && S.editor !== ed.body) {
      // typing in a header or note: the text is laid out again only when its height changed
      const grew = ed.changed();
      if (!grew && !this.fullPending) { this.dirty.clear(); Images.refreshFrame(); Tables.refreshHL(); UI.refresh(); return; }
      const live = S.editor;
      S.editor = ed.body;
      this.fullPending = true;
      this.dirty.clear();
      try { applyPageBox(); this.run(); } finally { S.editor = live; Story.place(); }
      return;
    }
    if (S.composing) {
      if (!this.waitingIME) { this.waitingIME = true; S.editor.addEventListener('compositionend', () => { this.waitingIME = false; setTimeout(() => this.soon(), 0); }, { once: true }); }
      return;
    }
    const t0 = performance.now();
    // the sections (a change to them lays everything out again), and the text column of each
    if (S.view !== 'web') {
      // the sections changed (a break typed over, pasted or undone): the text's box too
      if (Pages.begin(this.fullPending)) { this.fullPending = true; editorBox(); }
      try { Sections.columns(this.fullPending ? null : this.dirty); } catch (e) { console.warn(e); }
    } else Sections.clearCols(docBody());
    // derived marks that change how things look: table edges and shared paragraph boxes
    try { LineH.layout(this.fullPending ? null : this.dirty); } catch (e) { console.warn(e); }
    try { Tables.markAll(); markParaGroups(); DecAlign.layout(); } catch (e) { console.warn(e); }
    if (S.view === 'web') { clearPagination(); sizeWeb(); this.fullPending = false; this.dirty.clear(); afterLayout(); return; }
    const units = collectUnits();
    let start = 0, exitAfter = Infinity;
    if (!this.fullPending && this.dirty.size) {
      let m = Infinity;
      for (const el of this.dirty) { const i = units.indexOf(el); if (i < 0) { m = 0; break; } m = Math.min(m, i); }
      start = Math.max(0, (isFinite(m) ? m : 0) - 2);
      exitAfter = isFinite(m) ? m + 1 : Infinity;
    } else if (!this.fullPending && !this.dirty.size) { afterLayout(); return; }
    this.fullPending = false;
    this.dirty.clear();
    paginateUnits(units, start, exitAfter);
    const last = units[units.length - 1];
    let bottom = HF.top(0, Pages.g(0)), after = 0;
    if (last) { const e = rowGroupEnd.get(last) || last; bottom = topOf(e) + e.offsetHeight; after = parseFloat(getComputedStyle(e).marginBottom) || 0; }
    // footnotes to their pages; endnotes after the text (they may need pages of their own)
    const endPages = Notes.collect(bottom + after);
    S.pages = Math.max(1, Pages.at(Math.max(0, bottom - 1)) + 1, endPages);
    Pages.fit(S.pages);
    renderSheets();
    afterLayout();
    S.lastLayoutMs = performance.now() - t0;
  },
};
const rowGroupEnd = new WeakMap();

function topOf(el) {
  let y = 0, n = el;
  while (n && n !== S.editor) { y += n.offsetTop; n = n.offsetParent; }
  return y;
}
function unitOf(node) {
  let n = node && (node.nodeType === 1 ? node : node.parentNode);
  let tr = null, li = null, top = null;
  while (n && n !== S.editor) {
    if (n.nodeType === 1) {
      if (!tr && n.tagName === 'TR') tr = n;
      if (!li && !tr && n.tagName === 'LI') li = n;
      if (n.parentNode === S.editor) top = n;
    }
    n = n.parentNode;
  }
  if (n !== S.editor) return null;
  if (tr && top && top.tagName === 'TABLE' && tr.closest('table') === top) {
    // rows inside a rowspan group belong to the group's first row
    const tb = tr.parentNode;
    for (let r = tr.previousElementSibling; r; r = r.previousElementSibling) {
      const end = rowGroupEnd.get(r);
      if (end && rowIndexIn(tb, end) >= rowIndexIn(tb, tr)) return r;
    }
    return tr;
  }
  if (li) return li;
  return top;
}
const rowIndexIn = (tb, r) => Array.prototype.indexOf.call(tb.children, r);

function collectUnits() {
  const out = [];
  const walk = root => {
    for (let el = root.firstElementChild; el; el = el.nextElementSibling) {
      const t = el.tagName;
      if (t === 'UL' || t === 'OL') walkList(el);
      else if (t === 'TABLE') walkTable(el);
      else if (t === 'BLOCKQUOTE' && el.firstElementChild && isBlockEl(el.firstElementChild)) walk(el);
      else out.push(el);
    }
  };
  const walkList = list => {
    for (let li = list.firstElementChild; li; li = li.nextElementSibling) {
      if (li.tagName === 'LI') {
        out.push(li);
        for (let k = li.firstElementChild; k; k = k.nextElementSibling) if (k.tagName === 'UL' || k.tagName === 'OL') walkList(k);
      } else if (li.tagName === 'UL' || li.tagName === 'OL') walkList(li);
    }
  };
  const walkTable = tbl => {
    const rows = Array.from(tbl.rows).filter(r => !r.classList.contains('pg-spacer') && r.closest('table') === tbl);
    for (let i = 0; i < rows.length;) {
      let end = i;
      for (let j = i; j <= end; j++) for (const c of rows[j].cells) { const rs = c.rowSpan || 1; if (rs > 1) end = Math.max(end, Math.min(rows.length - 1, j + rs - 1)); }
      out.push(rows[i]);
      if (end > i) rowGroupEnd.set(rows[i], rows[end]); else rowGroupEnd.delete(rows[i]);
      i = end + 1;
    }
  };
  walk(S.editor);
  return out;
}
function ownHeight(u) {
  if (u.tagName === 'LI') {
    for (let k = u.firstElementChild; k; k = k.nextElementSibling) if (k.tagName === 'UL' || k.tagName === 'OL') return topOf(k) - topOf(u);
  }
  return u.offsetHeight;
}
function pushOf(u) { return u.hasAttribute('data-pgp') ? (parseFloat(u.style.getPropertyValue('--pgp')) || 0) : 0; }
function setPush(u, need) {
  const cur = pushOf(u);
  if (Math.abs(cur - need) < 0.5) return;
  if (need <= 0.5) { u.removeAttribute('data-pgp'); u.style.removeProperty('--pgp'); if (!u.getAttribute('style')) u.removeAttribute('style'); }
  else { u.setAttribute('data-pgp', ''); u.style.setProperty('--pgp', need.toFixed(1) + 'px'); }
}
function tableCols(tbl) {
  let max = 1;
  for (const r of tbl.rows) { if (r.classList.contains('pg-spacer')) continue; let n = 0; for (const c of r.cells) n += c.colSpan || 1; max = Math.max(max, n); }
  return max;
}
function setRowPush(tr, spacer, need) {
  if (need <= 0.5) { if (spacer) spacer.remove(); return; }
  if (!spacer) {
    spacer = document.createElement('tr');
    spacer.className = 'pg-spacer';
    spacer.setAttribute('contenteditable', 'false');
    spacer.setAttribute('aria-hidden', 'true');
    const td = document.createElement('td');
    td.colSpan = tableCols(tr.closest('table'));
    spacer.appendChild(td);
    tr.parentNode.insertBefore(spacer, tr);
  }
  const td = spacer.firstChild;
  if (Math.abs((parseFloat(td.style.height) || 0) - need) >= 0.5) td.style.height = need.toFixed(1) + 'px';
}
const isHeadingEl = el => /^H[1-6]$/.test(el.tagName) || (el.tagName === 'P' && (el.classList.contains('title') || el.classList.contains('subtitle')));
const canSplit = el => /^(P|LI|PRE|H[4-6]|DIV|BLOCKQUOTE)$/.test(el.tagName) && !el.classList.contains('toc') && !el.classList.contains('cols') && !el.classList.contains('title');

function ownSplits(u) {
  return Array.from(u.querySelectorAll('span.pg-line')).filter(s => { const li = s.closest('li'); return u.tagName !== 'LI' ? true : li === u; });
}
function removeSplits(u) {
  const list = ownSplits(u);
  if (!list.length) return;
  const r = getRange();
  for (const s of list) {
    const p = s.parentNode;
    s.remove();
    if (p && (!r || !p.contains(r.startContainer))) p.normalize();
  }
}

function paginateUnits(units, start, exitAfter) {
  const cache = Layout.cache;
  // a page or section break just before `start` is laid out again with what follows it
  while (start > 0 && units[start - 1].tagName === 'HR') start--;
  // footnotes take room at the bottom of the page their mark is on (null: the document has none)
  const fn = Notes.begin(units, start);
  let sect = 0;
  if (Pages.multi()) for (let i = 0; i < start; i++) if (isSectBreak(units[i])) sect++;
  // after a page break or a section break that starts a page: { sect (-1 for a page break), parity }
  let force = null;
  for (let i = start; i < units.length; i++) {
    const u = units[i];
    if (u.tagName === 'HR' && (u.classList.contains('pb') || isSectBreak(u))) {
      cache.set(u, topOf(u));
      if (u.classList.contains('pb')) force = { sect: -1, parity: -1 };
      else {
        sect++;
        const type = u.dataset.sb;
        if (type !== 'cont') force = { sect, parity: type === 'even' ? 0 : type === 'odd' ? 1 : -1 };
      }
      continue;
    }
    const isRow = u.tagName === 'TR';
    const spacer = isRow && u.previousElementSibling && u.previousElementSibling.classList.contains('pg-spacer') ? u.previousElementSibling : null;
    const T = topOf(spacer || u);
    let p = Pages.at(T), Tv = T, forced = false;
    if (force) {
      // it starts a page: this one when it is at its top already, else the next; a section's
      // first page (an Even or Odd Page break may leave a blank page before it)
      const atTop = T <= Pages.top(p) + HF.top(p, Pages.g(p)) + 0.5;
      let t = atTop ? p : p + 1;
      if (force.sect >= 0) {
        if (force.parity >= 0 && Pages.numberAt(t, force.sect) % 2 !== force.parity) { Pages.ensure(t, force.sect - 1); t++; }
        Pages.ensure(t, force.sect);
      } else if (!atTop) Pages.ensure(t, sect);
      p = t;
      Tv = Math.max(T, Pages.top(t) + HF.top(t, Pages.g(t)));
      force = null;
      forced = true;
    }
    let G = Pages.g(p);
    let cTop = Pages.top(p) + HF.top(p, G);
    // the rest is as before when nothing above changed (with footnotes: from the top of a page,
    // where no earlier note can be)
    if (!forced && i > exitAfter && !Pages.changed && cache.get(u) === T && (!fn || Math.abs(T - cTop) < 1)) break;
    if (!isRow) removeSplits(u);
    let Hn;
    if (isRow) { const e = rowGroupEnd.get(u) || u; Hn = topOf(e) + e.offsetHeight - topOf(u); }
    else Hn = ownHeight(u) - pushOf(u);
    const own = fn ? fn.refsIn(u) : null;
    // in the top margin: it is the first thing on its page, which is its section's
    if (!forced && T < cTop - 0.5 && Pages.ensure(p, sect)) { G = Pages.g(p); cTop = Pages.top(p) + HF.top(p, G); }
    const cBot = Pages.top(p) + G.h - HF.bot(p, G) - (fn ? fn.area(p, own) : 0);
    const nextTop = () => { Pages.ensure(p + 1, sect); return Pages.top(p + 1) + HF.top(p + 1, Pages.g(p + 1)); };
    let need = 0;
    if (forced) {
      // moved to its page; one longer than the page goes on over the next ones line by line
      need = Tv - T;
      if (!isRow && Tv + Hn > cBot + 0.5 && canSplit(u)) { setPush(u, need); splitAcrossPages(u, Tv, p, true, fn, own, sect); }
    }
    else if (T < cTop - 0.5) need = cTop - T;
    else if (T + Hn > cBot + 0.5) {
      const atTop = T <= cTop + 0.5;
      if (!isRow && canSplit(u) && splitAcrossPages(u, T, p, atTop, fn, own, sect)) need = 0;
      else if (!atTop) need = nextTop() - T;
    } else if (!isRow && isHeadingEl(u) && T > cTop + 0.5) {
      const nx = units[i + 1];
      if (nx && !(nx.tagName === 'HR')) {
        const nh = Math.min(nx.tagName === 'TR' ? nx.offsetHeight : ownHeight(nx) - pushOf(nx), 46);
        if (T + Hn + nh > cBot + 0.5) need = nextTop() - T;
      }
    }
    if (isRow) setRowPush(u, spacer, need); else setPush(u, need);
    cache.set(u, T);
    if (fn && own.length) fn.place(own);
  }
}

/* Visual line boxes of a block, in editor coordinates */
function lineBoxes(u) {
  const z = S.zoom || 1;
  const edTop = S.editor.getBoundingClientRect().top + Grid.dyOf(u) * z;
  const rects = [];
  const w = document.createTreeWalker(u, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => n.nodeType === 3 ? (n.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
      : (n.tagName === 'UL' || n.tagName === 'OL' || n.classList.contains('pg-line')) ? NodeFilter.FILTER_REJECT
        : (n.tagName === 'IMG' || n.tagName === 'BR') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  const rr = document.createRange();
  let n;
  while ((n = w.nextNode())) {
    let list;
    if (n.nodeType === 3) { rr.selectNodeContents(n); list = rr.getClientRects(); }
    else if (n.tagName === 'IMG') list = [n.getBoundingClientRect()];
    else { rr.selectNode(n); list = rr.getClientRects(); }
    for (const r of list) if (r.height > 0.5) rects.push({ top: (r.top - edTop) / z, bottom: (r.bottom - edTop) / z });
  }
  rects.sort((a, b) => a.top - b.top);
  const lines = [];
  for (const r of rects) {
    const L = lines[lines.length - 1];
    if (L && r.top < L.bottom - 0.5 * Math.min(r.bottom - r.top, L.bottom - L.top)) { L.top = Math.min(L.top, r.top); L.bottom = Math.max(L.bottom, r.bottom); }
    else lines.push({ top: r.top, bottom: r.bottom });
  }
  return lines;
}
function findLineStart(u, Lk) {
  const z = S.zoom || 1;
  const edTop = S.editor.getBoundingClientRect().top + Grid.dyOf(u) * z;
  const top = r => (r.top - edTop) / z;
  const w = document.createTreeWalker(u, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => n.nodeType === 3 ? (n.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
      : (n.tagName === 'UL' || n.tagName === 'OL' || n.classList.contains('pg-line') || n.getAttribute('contenteditable') === 'false') ? NodeFilter.FILTER_REJECT
        : n.tagName === 'IMG' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  const rr = document.createRange();
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 1) { if (top(n.getBoundingClientRect()) >= Lk - 1) return { node: n, offset: -1 }; continue; }
    rr.setStart(n, n.length - 1); rr.setEnd(n, n.length);
    if (top(rr.getBoundingClientRect()) < Lk - 1) continue;
    let lo = 0, hi = n.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      rr.setStart(n, mid); rr.setEnd(n, mid + 1);
      if (top(rr.getBoundingClientRect()) >= Lk - 1) hi = mid; else lo = mid + 1;
    }
    // never split inside a surrogate pair or before a combining mark
    while (lo > 0 && /[\uDC00-\uDFFF̀-ͯঁ-ঃ়-ৗ\u200C\u200D]/.test(n.data[lo])) lo--;
    return { node: n, offset: lo };
  }
  return null;
}
function charTopAfter(sp) {
  const z = S.zoom || 1;
  const edTop = S.editor.getBoundingClientRect().top + Grid.dyOf(sp) * z;
  let n = sp.nextSibling;
  while (n && n.nodeType === 3 && !n.length) n = n.nextSibling;
  if (!n) { const r = sp.getBoundingClientRect(); return (r.bottom - edTop) / z; }
  if (n.nodeType === 3) { const rr = document.createRange(); rr.setStart(n, 0); rr.setEnd(n, Math.min(1, n.length)); return (rr.getBoundingClientRect().top - edTop) / z; }
  return (n.getBoundingClientRect().top - edTop) / z;
}
/* Split a block between lines so each part sits inside a page. Returns false
   when the block should rather move to the next page as a whole. */
function splitAcrossPages(u, T, p, atTop, fn, own, sect) {
  let lines = lineBoxes(u);
  if (lines.length < 2) return false;
  let page = p, guard = 0, did = false;
  while (guard++ < 60) {
    const G = Pages.g(page);
    const cBot = Pages.top(page) + G.h - HF.bot(page, G);
    const pageTop = Pages.top(page) + HF.top(page, G);
    let first = lines.findIndex(L => L.top >= pageTop - 1.5);
    if (first < 0) first = 0;
    // a line fits when it and the notes of the marks on this page's lines up to it fit
    let k;
    if (!fn) k = lines.findIndex(L => L.bottom > cBot + 0.5);
    else {
      const at = own && own.length ? fn.lines(own, lines) : [];
      k = lines.findIndex((L, li) => L.bottom > cBot - fn.area(page, own ? own.filter((r, j) => at[j] >= first && at[j] <= li) : null) + 0.5);
    }
    if (k < 0) break;
    const onPage = k - first;
    const n = lines.length;
    if (!did && !atTop && (onPage < 2 || (n < 4 && n * (lines[0].bottom - lines[0].top) < G.ch * 0.5))) return false;
    if (n - k === 1 && onPage >= 3) k -= 1;
    if (k <= first) { if (!did && !atTop) return false; k = first + 1; if (k >= n) break; }
    const pos = findLineStart(u, lines[k].top);
    if (!pos) break;
    // the rest goes to the next page, which is this section's
    Pages.ensure(page + 1, sect || 0);
    const target = Pages.top(page + 1) + HF.top(page + 1, Pages.g(page + 1)) + 1;
    // An empty-looking inline whose word joiner glues it to the first word of the line,
    // so it always starts that line; its tall line-height pushes the line down.
    const sp = document.createElement('span');
    sp.className = 'pg-line';
    sp.setAttribute('contenteditable', 'false');
    sp.setAttribute('aria-hidden', 'true');
    sp.textContent = '\u2060';
    const lh = Math.max(8, lines[k].bottom - lines[k].top);
    const h0 = Math.max(lh, target - lines[k].top + lh);
    sp.style.lineHeight = h0.toFixed(1) + 'px';
    if (pos.offset <= 0) pos.node.parentNode.insertBefore(sp, pos.node);
    else { const rest = pos.node.splitText(pos.offset); rest.parentNode.insertBefore(sp, rest); }
    const c1 = charTopAfter(sp);
    const h1 = Math.max(lh, h0 + (target - c1));
    if (Math.abs(h1 - h0) > 0.4) sp.style.lineHeight = h1.toFixed(1) + 'px';
    did = true;
    page++;
    lines = lineBoxes(u);
  }
  return did;
}
function clearPagination() {
  S.editor.querySelectorAll('span.pg-line').forEach(s => { const p = s.parentNode; s.remove(); p && p.normalize(); });
  S.editor.querySelectorAll('tr.pg-spacer').forEach(s => s.remove());
  S.editor.querySelectorAll('[data-pgp]').forEach(u => setPush(u, 0));
  Layout.cache = new WeakMap();
}

/* ---------- Sheets, header/footer, watermark ---------- */
function hfText(s, i, n) {
  const d = new Date();
  return esc(s || '')
    .replace(/\{PAGE\}/g, String(i + 1)).replace(/\{PAGES\}/g, String(n))
    .replace(/\{DATE\}/g, esc(d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })))
    .replace(/\{TITLE\}/g, esc(S.doc.title || '')).replace(/\{AUTHOR\}/g, esc(S.doc.props.author || Prefs.author || ''));
}
function renderSheets() {
  HF.sync();
  Grid.check();
  const host = $('#sheets');
  const n = S.pages;
  while (host.children.length < n) host.appendChild(h('div', { class: 'sheet' }));
  while (host.children.length > n) host.lastChild.remove();
  const d = S.doc;
  for (let i = 0; i < n; i++) {
    const sh = host.children[i];
    // each page has its section's size and margins
    const gp = Grid.pos(i), g = Pages.g(i);
    const sig = [i, gp.x, gp.y, g.w, g.h, g.mt, g.mb, g.ml, g.mr, g.hd, g.fd, Pages.numText(i), d.page.color, JSON.stringify(d.page.border), HF.sheetSig(i, n), Notes.sheetSig(i), JSON.stringify(d.watermark), d.font, d.size, d.lang].join('|');
    if (sh._sig === sig) continue;
    sh._sig = sig;
    sh.style.cssText = `left:${gp.x}px;top:${gp.y}px;width:${g.w}px;height:${g.h}px;background:${d.page.color || '#fff'}`;
    let html = HF.sheetHtml(i, n, g) + Notes.sheetHtml(i, g);
    if (d.watermark && d.watermark.text) {
      const w = d.watermark;
      const size = w.size || Math.min(120, Math.max(36, (g.w * 0.9) / Math.max(4, w.text.length) * 1.25));
      html += `<div class="wm" style="font-size:${size}px;color:${esc(w.color || '#c0c0c0')};opacity:${w.opacity != null ? w.opacity : 0.45}">${esc(w.text)}</div>`;
    }
    const pb = normPageBorder(d.page.border);
    if (pb && (pb.show === 'all' || (pb.show === 'first') === (i === 0))) html += pageBorderHtml(pb, g);
    sh.innerHTML = html;
    HF.fill(sh, i, n);
    sh.querySelectorAll('.hfx, .fn-area, .en-area').forEach(x => HF.decorate(x));
  }
  docBody().style.minHeight = Pages.height(n) + 'px';
  const paper = $('#paper');
  const box = Grid.size();
  paper.style.width = box.w + 'px';
  paper.style.height = box.h + 'px';
  applyZoom(true);
  if (Story.cur) Story.place();
}
/* a page border, measured from the page edge or from the text */
function pageBorderHtml(pb, g) {
  const css = bdrCss({ style: pb.style, width: pb.width, color: pb.color });
  const bw = (pb.style === 'double' ? pb.width * 3 : pb.width) * PX.pt;
  const m = k => pb.m[k] * PX.pt;
  const pos = pb.from === 'text'
    ? { top: g.mt - m('t') - bw, bottom: g.mb - m('b') - bw, left: g.ml - m('l') - bw, right: g.mr - m('r') - bw }
    : { top: m('t'), bottom: m('b'), left: m('l'), right: m('r') };
  for (const k in pos) pos[k] = Math.max(0, pos[k]);
  const off = Math.max(1.5, pb.width * 2);
  const st = ['top', 'bottom', 'left', 'right'].map(k => `${k}:${fmtNum(pos[k], 2)}px;border-${k}:${pb.sides[k] ? css : 'none'}`).join(';') + (pb.shadow ? `;box-shadow:${fmtNum(off, 2)}pt ${fmtNum(off, 2)}pt 0 0 ${pb.color}` : '');
  return `<div class="pborder" style="${esc(st)}"></div>`;
}
/* the text's box: as wide as the widest page, its column the first section's */
function applyPageBox() {
  Pages.refreshSecs();
  editorBox();
}
function editorBox() {
  const ed = docBody();
  HF.measure();
  const g = Pages.secs[0].g, W = Pages.maxW, x0 = Pages.colX(0);
  ed.style.width = W + 'px';
  ed.style.padding = `${HF.top(0, g)}px ${fmtNum(W - x0 - g.cw, 2)}px 0 ${fmtNum(x0, 2)}px`;
  ed.style.minHeight = g.h + 'px';
}
function applyDocSettings() {
  const d = S.doc;
  const paper = $('#paper');
  paper.style.setProperty('--doc-font', fontStack(d.font));
  paper.style.setProperty('--doc-bn', bnStack(docBnFont()));
  ensureFont(docBnFont());
  paper.style.setProperty('--doc-size', d.size + 'pt');
  paper.style.setProperty('--doc-line', String(d.line || 1.08));
  LineH.reset();
  Notes.reset();
  paper.style.setProperty('--doc-r', String(LineH.stack(fontStack(d.font))));
  if (d.headFont) paper.style.setProperty('--head-r', String(LineH.stack(fontStack(d.headFont)))); else paper.style.removeProperty('--head-r');
  paper.style.setProperty('--doc-after', (d.after != null ? d.after : 8) + 'pt');
  if (d.headFont) paper.style.setProperty('--doc-head-font', fontStack(d.headFont)); else paper.style.removeProperty('--doc-head-font');
  Styles.apply();
  docBody().setAttribute('lang', d.lang || 'en-US');
  ensureFont(d.font);
  if (d.headFont) ensureFont(d.headFont);
  if (S.view !== 'web') applyPageBox();
  $$('#sheets .sheet').forEach(s => s._sig = null);
  Layout.cache = new WeakMap();
}
function sizeWeb() {
  const c = $('#canvas');
  const z = S.zoom;
  const w = Math.max(320, (c.clientWidth - 2) / z);
  const ed = S.editor;
  ed.style.width = w + 'px';
  ed.style.padding = '28px max(24px, 6%) 60px';
  ed.style.minHeight = (c.clientHeight - 4) / z + 'px';
  const paper = $('#paper');
  paper.style.width = w + 'px';
  paper.style.height = Math.max(ed.offsetHeight, c.clientHeight / z) + 'px';
  $('#sheets').innerHTML = '';
  S.pages = 1;
  applyZoom(true);
}
function afterLayout() {
  Grid.apply();
  updatePageStatus();
  Images.refreshFrame();
  Tables.refreshHL();
  try { Tables.gridlines(); } catch (e) { console.warn(e); }
  Ruler.drawSoon();
  Toc.tools();
}

/* ---------- Zoom & views ---------- */
function setZoom(z, mode) {
  const spot = zoomSpot();
  S.zoom = clamp(Math.round(z * 100) / 100, 0.25, 3);
  S.zoomMode = mode || 'custom';
  applyZoom();
  if (S.view === 'web') Layout.full();
  else keepSpot(spot);
}
/* Zooming keeps your place: the caret when it is on screen, else the middle of the window,
   as a page and a point on it (pages may move into rows or back into a column) */
function zoomSpot() {
  const c = $('#canvas'), paper = $('#paper');
  if (!c || !paper || !S.doc || S.view === 'web' || !c.clientHeight) return null;
  const cr = c.getBoundingClientRect(), pr = paper.getBoundingClientRect(), z = S.zoom || 1;
  let x = cr.left + c.clientWidth / 2, y = cr.top + c.clientHeight / 2;
  const rect = getRange() && caretRect();
  if (rect && rect.top >= cr.top && rect.bottom <= cr.bottom && rect.left >= cr.left && rect.right <= cr.right) { x = rect.left; y = (rect.top + rect.bottom) / 2; }
  else if (c.scrollTop < 1) return null;   // at the top of the document, stay at the top
  const px = (x - pr.left) / z, py = (y - pr.top) / z;
  const k = Grid.pageAt(px, py), p = Grid.pos(k);
  return { k, dx: px - p.x, dy: py - p.y, sx: x - cr.left, sy: y - cr.top };
}
function keepSpot(s) {
  if (!s) return;
  const c = $('#canvas'), box = $('#zoomBox'), z = S.zoom || 1;
  const p = Grid.pos(Math.min(s.k, Math.max(0, S.pages - 1)));
  c.scrollTop = box.offsetTop + (p.y + s.dy) * z - s.sy;
  c.scrollLeft = box.offsetLeft + (p.x + s.dx) * z - s.sx;
}
function applyZoom(noLayout) {
  // more (or fewer) pages fit side by side now: place the sheets again
  if (S.view !== 'web' && S.doc && Grid.check()) { renderSheets(); afterLayout(); return; }
  const g = geom();
  const paper = $('#paper'), box = $('#zoomBox');
  const gs = Grid.size();
  const H = S.view === 'web' ? parseFloat(paper.style.height) || 800 : gs.h;
  const W = S.view === 'web' ? parseFloat(paper.style.width) || g.w : gs.w;
  paper.style.transform = `scale(${S.zoom})`;
  box.style.width = W * S.zoom + 'px';
  box.style.height = H * S.zoom + 'px';
  const pct = Math.round(S.zoom * 100);
  const sl = $('#zoomSlider'); if (sl) sl.value = pct;
  const lb = $('#zoomLabel'); if (lb) lb.textContent = pct + '%';
  if (!noLayout) { Ruler.drawSoon(); Images.refreshFrame(); Tables.refreshHL(); }
}
function fitZoom() {
  const c = $('#canvas');
  if (!c || !S.doc) return;
  const g = geom();
  // the widest page across, the tallest one whole
  Pages.ready();
  const W = Math.max(g.w, Pages.maxW || 0), Hmax = Math.max(g.h, ...(Pages.secs || []).map(s => s.g.h));
  const wz = (c.clientWidth - 36) / W;
  if (S.zoomMode === 'width') setZoom(Math.min(wz, 3), 'width');
  else if (S.zoomMode === 'page') setZoom(Math.min(wz, (c.clientHeight - 50) / Hmax), 'page');
  // two whole pages side by side (or more where the window is wide and short)
  else if (S.zoomMode === 'multi') setZoom(Math.min((c.clientWidth - 36) / (2 * g.w + GRID_GX), (c.clientHeight - 50) / g.h), 'multi');
}
function setView(v) {
  if (Story.cur && v !== 'print') Story.close();
  const app = $('#app');
  const prev = S.view;
  S.view = v;
  app.classList.toggle('web-layout', v === 'web');
  app.classList.toggle('read-mode', v === 'read');
  app.classList.toggle('focus-mode', v === 'focus');
  S.editor.contentEditable = (v === 'read' || S.readOnly) ? 'false' : 'true';
  S.editor.classList.toggle('ro', v === 'read' || S.readOnly);
  if (prev === 'web' && v !== 'web') { applyPageBox(); }
  if (v === 'read' && S.zoomMode === 'custom') { S._preReadZoom = S.zoom; S.zoomMode = 'width'; }
  if (prev === 'read' && v !== 'read' && S._preReadZoom) { S.zoom = S._preReadZoom; S.zoomMode = 'custom'; S._preReadZoom = 0; }
  Layout.full();
  fitZoom();
  UI.refresh();
}
function updatePageStatus() {
  const el = $('#sbPage');
  if (!el || !S.doc) return;
  let cur = 1;
  if (S.view !== 'web') {
    const rect = caretRect();
    const pr = $('#paper').getBoundingClientRect();
    const g = geom();
    const r0 = getRange();
    if (rect && r0) cur = Grid.on ? clamp(Math.floor(((rect.top + 1 - pr.top) / S.zoom - Grid.dyOf(r0.endContainer)) / (g.h + GAP)) + 1, 1, S.pages)
      : Grid.pageAt((rect.left + 1 - pr.left) / S.zoom, (rect.top + 1 - pr.top) / S.zoom) + 1;
    else {
      const c = $('#canvas'), cr = c.getBoundingClientRect();
      cur = Grid.pageAt((cr.left + c.clientWidth / 2 - pr.left) / S.zoom, (cr.top + c.clientHeight / 2 - pr.top) / S.zoom) + 1;
    }
  }
  S.curPage = cur;
  // with sections: the one the caret is in, as Word's status bar can show it
  let sec = '';
  if (S.view !== 'web' && Pages.multi()) {
    const r0 = getRange(), body = docBody();
    const k = r0 && body && body.contains(r0.startContainer) ? Sections.indexOf(r0.startContainer) : Pages.sect(cur - 1);
    sec = ` · Section ${k + 1}`;
  }
  el.textContent = S.view === 'web' ? 'Web layout' : `Page ${cur} of ${S.pages}${sec}`;
}
function goToPage(n) {
  const g = geom();
  const c = $('#canvas');
  n = clamp(n, 1, S.pages);
  void g;
  const y = Grid.pos(n - 1).y * S.zoom + $('#zoomBox').offsetTop - 12;
  c.scrollTo({ top: y, behavior: 'smooth' });
}
