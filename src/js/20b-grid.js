/* ===================== Pages side by side =====================
   Zoomed out far enough, the pages sit in rows, as in Word's multiple-page view. The
   document stays one continuous column, so pagination does not change; each top-level
   block is moved to its page's place with a transform (data-gp, one rule per page).
   A block that runs over a page break (a long paragraph, a table, a list) is clipped to one
   page — the one with the caret — and copies of it show its other parts (data-gs and the
   copies in .ghosts); a click on a copy lands in the block. Pagination reads positions
   less the block's shift (dyOf), and the PDF lifts the transforms while it measures.
   Nothing here is saved: cleanHTML() drops data-gp and data-gs. */
const GRID_GX = 24;
const Grid = {
  cols: 1,            // pages per row
  on: false,
  pageSig: '',
  want: new WeakMap(), // block over a page break -> the page it shows live
  ghostsOf: new Map(), // block -> { sig, els }
  changed: new WeakSet(),
  mo: null,
  followRaf: 0,
  init() {
    const paper = $('#paper');
    paper.addEventListener('mousedown', e => this.onDown(e), true);
    document.addEventListener('selectionchange', () => this.follow());
    // the canvas gets wider or narrower (window, side panes): maybe more pages fit
    if (window.ResizeObserver) new ResizeObserver(() => { if (S.doc && this.colsFor() !== this.cols) applyZoom(); }).observe($('#canvas'));
  },
  /* how many pages fit side by side at this zoom */
  colsFor() {
    // pages of different sizes (a landscape section) stay in one column
    if (!S.doc || S.view === 'web' || Pages.mixed) return 1;
    const c = $('#canvas');
    if (!c || !c.clientWidth) return 1;
    const g = geom(), z = S.zoom || 1;
    const n = Math.floor(((c.clientWidth - 36) / z + GRID_GX) / (g.w + GRID_GX) + 1e-6);
    return clamp(n, 1, Math.max(1, S.pages || 1));
  },
  /* page k's place on the paper (unscaled) */
  pos(k) {
    if (!this.on) return { x: Pages.x(k), y: Pages.top(k) };
    const g = geom(), C = this.cols;
    return { x: (k % C) * (g.w + GRID_GX), y: Math.floor(k / C) * (g.h + GAP) };
  },
  size() {
    const g = geom(), n = Math.max(1, S.pages || 1);
    if (!this.on) return { w: Pages.maxW || g.w, h: Pages.height(n) };
    const C = this.cols;
    return { w: C * g.w + (C - 1) * GRID_GX, h: Math.ceil(n / C) * (g.h + GAP) - GAP };
  },
  /* the page under a point on the paper (unscaled) */
  pageAt(x, y) {
    const g = geom(), n = Math.max(1, S.pages || 1);
    if (!this.on) return clamp(Pages.at(y), 0, n - 1);
    const row = Math.max(0, Math.floor(y / (g.h + GAP)));
    const col = this.on ? clamp(Math.floor((x + GRID_GX / 2) / (g.w + GRID_GX)), 0, this.cols - 1) : 0;
    return clamp(row * (this.on ? this.cols : 1) + col, 0, n - 1);
  },
  /* the shift from page k's place in the column to its place in the rows */
  shift(k) {
    const g = geom(), p = this.pos(k);
    return { x: p.x, y: p.y - k * (g.h + GAP) };
  },
  tr(k) { const s = this.shift(k); return s.x || s.y ? `translate(${fmtNum(s.x, 2)}px,${fmtNum(s.y, 2)}px)` : 'none'; },
  /* clip a block (or its copy) to page k of the column */
  clip(top, height, k) {
    const g = geom(), pitch = g.h + GAP;
    const a = Math.max(0, k * pitch - top), b = Math.max(0, top + height - ((k + 1) * pitch - GAP));
    return `inset(${fmtNum(a, 2)}px -4000px ${fmtNum(b, 2)}px -4000px)`;
  },
  /* re-check the number of columns (zoom, window, page count); true when it changed */
  check() {
    const C = this.colsFor();
    const on = C > 1;
    if (C === this.cols && on === this.on) return false;
    this.cols = C; this.on = on;
    if (!on) this.off();
    $$('#sheets .sheet').forEach(s => { s._sig = null; });
    return true;
  },
  off() {
    this.on = false; this.cols = 1;
    const paper = $('#paper');
    if (paper) paper.classList.remove('grid', 'gt');
    if (S.editor) S.editor.querySelectorAll(':scope > [data-gp], :scope > [data-gs]').forEach(b => { b.removeAttribute('data-gp'); b.removeAttribute('data-gs'); });
    for (const v of this.ghostsOf.values()) v.els.forEach(e => e.remove());
    this.ghostsOf.clear();
    if (this.sheet) this.sheet.textContent = '';
    if (this.gsSheet) this.gsSheet.textContent = '';
    this.pageSig = '';
  },
  /* how far the grid moved the block holding el down (unscaled px; layout reads the column) */
  dyOf(el) {
    if (!this.on || !el) return 0;
    const paper = $('#paper');
    if (!paper || !paper.classList.contains('gt')) return 0;
    let b = el.nodeType === 1 ? el : el.parentNode;
    while (b && b.parentNode !== S.editor) b = b.parentNode;
    if (!b) return 0;
    const tf = getComputedStyle(b).transform;
    return tf && tf !== 'none' ? new DOMMatrixReadOnly(tf).f : 0;
  },
  /* where something in the document shows: a part of a block over a page break that is
     not the live one shows in its copy, so overlays (cell selection, gridlines, a picture's
     frame) go there */
  place(el, r) {
    if (!this.on || !r || !el) return r;
    let b = el.nodeType === 1 ? el : el.parentNode;
    while (b && b.parentNode !== S.editor) b = b.parentNode;
    if (!b || !b.hasAttribute('data-gs') || b._gAct == null) return r;
    const z = S.zoom || 1, pitch = geom().h + GAP;
    const pr = $('#paper').getBoundingClientRect();
    const sa = this.shift(b._gAct);
    const k = Math.max(0, Math.floor((((r.top + r.bottom) / 2 - pr.top) / z - sa.y) / pitch));
    if (k === b._gAct) return r;
    const sk = this.shift(k), dx = (sk.x - sa.x) * z, dy = (sk.y - sa.y) * z;
    return { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy, width: r.width, height: r.height, x: r.left + dx, y: r.top + dy };
  },
  /* the PDF measures the column: lift the transforms (no paint happens before apply) */
  lift() { const p = $('#paper'); if (p) p.classList.remove('gt'); },
  layer() {
    let g = $('#ghosts');
    if (!g) {
      g = h('div', { id: 'ghosts', class: 'ghosts doc', 'aria-hidden': 'true' });
      $('#paper').appendChild(g);
    }
    g.setAttribute('lang', S.editor.getAttribute('lang') || 'en-US');
    return g;
  },
  watch() {
    if (this.mo || !S.editor) return;
    this.mo = new MutationObserver(list => {
      for (const m of list) {
        let n = m.target;
        while (n && n.parentNode !== S.editor) n = n.parentNode;
        if (n) this.changed.add(n);
      }
    });
    this.mo.observe(S.editor, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'src', 'colspan', 'rowspan', 'data-checked', 'start'] });
  },
  rules(g) {
    const n = Math.max(1, S.pages || 1);
    const sig = [this.cols, n, g.w, g.h].join('|');
    if (sig === this.pageSig && this.sheet && this.sheet.isConnected) return;
    this.pageSig = sig;
    if (!this.sheet || !this.sheet.isConnected) { this.sheet = h('style', { id: 'gridRules' }); document.head.appendChild(this.sheet); }
    let css = '';
    for (let k = 1; k < n; k++) css += `#paper.gt .doc > [data-gp="${k}"]{transform:${this.tr(k)}}\n`;
    this.sheet.textContent = css;
  },
  /* place every top-level block on its page */
  apply() {
    const paper = $('#paper');
    if (!paper || !S.editor) return;
    if (!this.on || S.view === 'web') { if (paper.classList.contains('grid')) this.off(); return; }
    this.watch();
    if (this.mo) this.mo.takeRecords().forEach(m => { let n = m.target; while (n && n.parentNode !== S.editor) n = n.parentNode; if (n) this.changed.add(n); });
    const g = geom(), pitch = g.h + GAP;
    this.caretWant();
    this.rules(g);
    if (!this.gsSheet || !this.gsSheet.isConnected) { this.gsSheet = h('style', { id: 'gridSpan' }); document.head.appendChild(this.gsSheet); }
    const layer = this.layer();
    const seen = new Map();
    let css = '', id = 0;
    for (let b = S.editor.firstElementChild; b; b = b.nextElementSibling) {
      const top = b.offsetTop, H = b.offsetHeight, push = pushOf(b);
      const p0 = Math.max(0, Math.floor((top + push + 0.5) / pitch));
      const p1 = Math.max(p0, Math.floor((top + Math.max(H, push + 1) - 0.5) / pitch));
      if (p0 === p1 && !push) {
        if (b.hasAttribute('data-gs')) b.removeAttribute('data-gs');
        const v = p0 ? String(p0) : null;
        if (b.getAttribute('data-gp') !== v) { if (v) b.setAttribute('data-gp', v); else b.removeAttribute('data-gp'); }
        continue;
      }
      let act = p0;
      const w = this.want.get(b);
      if (w != null && w >= p0 && w <= p1) act = w;
      id++;
      b._gAct = act;
      if (b.getAttribute('data-gs') !== String(id)) b.setAttribute('data-gs', String(id));
      if (b.hasAttribute('data-gp')) b.removeAttribute('data-gp');
      css += `#paper.gt .doc > [data-gs="${id}"]{transform:${this.tr(act)};clip-path:${this.clip(top, H, act)}}\n`;
      if (p1 === p0) continue;
      // copies for the other pages
      const sig = [top, H, b.offsetLeft, b.offsetWidth, act, p0, p1, this.cols, g.w, g.h].join('|');
      const old = this.ghostsOf.get(b);
      if (old && old.sig === sig && !this.changed.has(b)) { seen.set(b, old); continue; }
      if (old) old.els.forEach(e => e.remove());
      const els = [];
      for (let p = p0; p <= p1; p++) {
        if (p === act) continue;
        const c = b.cloneNode(true);
        c.removeAttribute('data-gs'); c.removeAttribute('data-gp');
        c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
        c.removeAttribute('contenteditable');
        c.setAttribute('data-page', String(p));
        Object.assign(c.style, { left: b.offsetLeft + 'px', top: top + 'px', width: b.offsetWidth + 'px', transform: this.tr(p), clipPath: this.clip(top, H, p) });
        c._src = b; c._page = p;
        layer.appendChild(c);
        els.push(c);
      }
      seen.set(b, { sig, els });
    }
    for (const [b, v] of this.ghostsOf) if (!seen.has(b)) v.els.forEach(e => e.remove());
    this.ghostsOf = seen;
    this.changed = new WeakSet();
    if (this.gsSheet.textContent !== css) this.gsSheet.textContent = css;
    paper.classList.add('grid', 'gt');
    this.mirror();
  },
  /* the selection shows in the copies too */
  mirror() {
    if (typeof Highlight === 'undefined' || !window.CSS || !CSS.highlights) return;
    const r = this.on ? getRange() : null;
    const out = [];
    if (r && !r.collapsed && this.ghostsOf.size) {
      for (const [b, v] of this.ghostsOf) {
        if (!r.intersectsNode(b)) continue;
        for (const c of v.els) {
          const a = b.contains(r.startContainer) ? this.mapTo(b, c, r.startContainer, r.startOffset) : { node: c, offset: 0 };
          const z = b.contains(r.endContainer) ? this.mapTo(b, c, r.endContainer, r.endOffset) : { node: c, offset: c.childNodes.length };
          if (!a || !z) continue;
          try { const rr = document.createRange(); rr.setStart(a.node, a.offset); rr.setEnd(z.node, z.offset); out.push(rr); } catch { }
        }
      }
    }
    if (out.length) CSS.highlights.set('q-gsel', new Highlight(...out));
    else CSS.highlights.delete('q-gsel');
  },
  /* the node in a copy that stands for node in the block it was made from */
  mapTo(src, ghost, node, offset) {
    const path = [];
    for (let n = node; n && n !== src; n = n.parentNode) { const p = n.parentNode; if (!p) return null; path.unshift(Array.prototype.indexOf.call(p.childNodes, n)); }
    let t = ghost;
    for (const i of path) { t = t && t.childNodes[i]; if (!t) return null; }
    return { node: t, offset: Math.min(offset, t.nodeType === 3 ? t.length : t.childNodes.length) };
  },
  /* the live part of a block over a page break follows the caret */
  follow() {
    if (!this.on || this.followRaf || Story.cur) return;
    this.followRaf = requestAnimationFrame(() => {
      this.followRaf = 0;
      this.mirror();
      if (S.selImg) return;   // a selected picture keeps its part live
      const r = getRange();
      if (!r || !S.editor.contains(r.endContainer)) return;
      const b = topBlockOf(r.endContainer);
      if (!b || !b.hasAttribute('data-gs')) return;
      const k = this.caretPage(b);
      if (k == null) return;
      if (k === b._gAct) return;
      this.want.set(b, k);
      this.swapped();
      scrollCaretIntoView();
    });
  },
  /* the part of a block with the caret is the live one (typing that runs onto the next
     page, rows laid out anew), unless a click just picked another part of it */
  caretWant() {
    if (Story.cur) return;
    const r = getRange();
    if (!r || !S.editor.contains(r.endContainer) || S.selImg) return;
    const b = topBlockOf(r.endContainer);
    if (this.pin && this.pin.b === b && performance.now() - this.pin.t < 1000) return;
    const rect = b && caretRect();
    if (!rect) return;
    const z = S.zoom || 1, pitch = geom().h + GAP, pr = $('#paper').getBoundingClientRect();
    const k = Math.floor(((rect.top + Math.min(rect.height || 0, 30) / 2 - pr.top) / z - this.dyOf(b)) / pitch);
    if (k >= 0) this.want.set(b, k);
  },
  /* another part went live: place the blocks and what sits over them again */
  swapped() {
    this.apply();
    updatePageStatus();
    Ruler.drawSoon();
    Images.refreshFrame();
    Tables.refreshHL();
    try { Tables.gridlines(); } catch (e) { console.warn(e); }
    Toc.tools();
  },
  /* the page of the column the caret is on, from where it shows now */
  caretPage(b) {
    const rect = caretRect();
    if (!rect) return null;
    const g = geom(), pitch = g.h + GAP, z = S.zoom || 1;
    const pr = $('#paper').getBoundingClientRect();
    const tf = getComputedStyle(b).transform;
    let dy = 0;
    if (tf && tf !== 'none') { const m = new DOMMatrixReadOnly(tf); dy = m.f; }
    const y = (rect.top + Math.min(rect.height || 0, 30) / 2 - pr.top) / z - dy;
    return Math.max(0, Math.floor(y / pitch));
  },
  /* ---------- pointer ---------- */
  /* the document position under a point: a live block, a copy (mapped back), or the
     nearest line on the page under it */
  posAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const ghost = el && el.closest && el.closest('#ghosts > *');
    if (ghost) {
      const r = caretFrom(x, y);
      const m = r && ghost.contains(r.node) ? this.mapBack(ghost, r.node, r.offset) : null;
      return m ? Object.assign(m, { block: ghost._src, page: ghost._page }) : null;
    }
    if (el && S.editor.contains(el) && el !== S.editor && !/^(UL|OL|TABLE|TBODY|TR)$/.test(el.tagName)) {
      const r = caretFrom(x, y);
      if (r && S.editor.contains(r.node)) return r;
    }
    return this.nearest(x, y);
  },
  /* same node in the block a copy was made from */
  mapBack(ghost, node, offset) {
    const path = [];
    for (let n = node; n && n !== ghost; n = n.parentNode) { const p = n.parentNode; if (!p) return null; path.unshift(Array.prototype.indexOf.call(p.childNodes, n)); }
    let t = ghost._src;
    for (const i of path) { t = t && t.childNodes[i]; if (!t) return null; }
    if (t.nodeType === 3) offset = Math.min(offset, t.length);
    else offset = Math.min(offset, t.childNodes.length);
    return { node: t, offset };
  },
  /* the closest line on the page under a point that hit no text */
  nearest(x, y) {
    const pr = $('#paper').getBoundingClientRect(), z = S.zoom || 1;
    const k = this.pageAt((x - pr.left) / z, (y - pr.top) / z);
    const shown = [];
    for (let b = S.editor.firstElementChild; b; b = b.nextElementSibling) {
      const gp = b.getAttribute('data-gp');
      if (b.hasAttribute('data-gs')) {
        const v = this.ghostsOf.get(b);
        const cp = v && v.els.find(c => c._page === k);
        if (cp) { shown.push(cp); continue; }
        if (b._gAct === k) shown.push(b);
        continue;
      }
      if ((gp ? +gp : 0) === k) shown.push(b);
    }
    if (!shown.length) return null;
    let best = null, bd = Infinity;
    for (const el of shown) {
      const rects = Array.from(el.getClientRects ? [el.getBoundingClientRect()] : []);
      for (const r of rects) {
        // a block over a page break shows only its part on this page
        const vis = this.visibleRect(el, r, k);
        if (!vis) continue;
        const d = y < vis.top ? vis.top - y : y > vis.bottom ? y - vis.bottom : 0;
        if (d < bd) { bd = d; best = { el, r: vis }; }
      }
    }
    if (!best) return null;
    const { el, r } = best;
    const px = clamp(x, r.left + 1, r.right - 1), py = clamp(y, r.top + 2, r.bottom - 2);
    const hit = caretFrom(px, py);
    if (!hit) return null;
    if (el.parentNode && el.parentNode.id === 'ghosts') { const m = el.contains(hit.node) ? this.mapBack(el, hit.node, hit.offset) : null; return m ? Object.assign(m, { block: el._src, page: el._page }) : null; }
    return S.editor.contains(hit.node) ? hit : null;
  },
  visibleRect(el, r, k) {
    const pr = $('#paper').getBoundingClientRect(), z = S.zoom || 1, g = geom();
    const p = this.pos(k);
    const top = Math.max(r.top, pr.top + p.y * z), bottom = Math.min(r.bottom, pr.top + (p.y + g.h) * z);
    if (bottom <= top) return null;
    return { left: r.left, right: r.right, top, bottom };
  },
  /* mouse down on a copy or on empty paper: put the caret there and let a drag select */
  onDown(e) {
    if (!this.on || S.view === 'web' || Story.cur || (e.button !== 0 && e.button !== 2)) return;
    const paper = $('#paper');
    if (paper.classList.contains('tdraw-pen') || paper.classList.contains('tdraw-eraser')) return;   // drawing a table
    const t = e.target;
    const onGhost = t.closest && t.closest('#ghosts > *');
    // a right-click on a copy: its block goes live there, for the menu to act on
    if (e.button === 2) {
      if (onGhost) { this.want.set(onGhost._src, onGhost._page); this.pin = { b: onGhost._src, t: performance.now() }; this.swapped(); }
      return;
    }
    // a picture in a copy: select the picture itself
    if (onGhost && t.tagName === 'IMG') {
      const m = this.mapBack(onGhost, t, 0);
      if (m && m.node.tagName === 'IMG') {
        e.preventDefault(); e.stopPropagation();
        this.want.set(onGhost._src, onGhost._page); this.pin = { b: onGhost._src, t: performance.now() }; this.swapped();
        Images.select(m.node);
        return;
      }
    }
    const empty = !onGhost && (t === S.editor || t.id === 'paper' || t.id === 'zoomBox' || t.id === 'ghosts' || (S.editor.contains(t) && /^(UL|OL|TABLE|TBODY|TR)$/.test(t.tagName) && t.closest('#editor > *') === t.closest('ul,ol,table')));
    if (!onGhost && !empty) return;
    const pos = this.posAt(e.clientX, e.clientY);
    if (!pos) return;
    e.preventDefault(); e.stopPropagation();
    if (S.selImg) Images.deselect();
    if (pos.block != null) this.want.set(pos.block, pos.page);
    S.editor.focus({ preventScroll: true });
    const sel = getSelection();
    if (e.shiftKey && sel.rangeCount) sel.extend(pos.node, pos.offset);
    else sel.collapse(pos.node, pos.offset);
    if (pos.block != null) this.swapped();
    const move = ev => {
      if (!(ev.buttons & 1)) return up();
      const p = this.posAt(ev.clientX, ev.clientY);
      if (p) { try { getSelection().extend(p.node, p.offset); } catch { } }
    };
    const up = () => { window.removeEventListener('mousemove', move, true); window.removeEventListener('mouseup', up, true); this.follow(); };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  },
};
/* caret position at a point on screen */
function caretFrom(x, y) {
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && p.offsetNode ? { node: p.offsetNode, offset: p.offset } : null; }
  const r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}
