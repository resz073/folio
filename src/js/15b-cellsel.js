/* ===================== Cell selection =====================
   Word's way of selecting in a table: whole cells, rows or columns, never a run of text that
   zigzags through the rows. Tables.sel = { table, r1, c1, r2, c2 } in grid slots; `anchor` and
   `head` are the cells at its two corners. While cells are selected, the browser's own
   selection waits as a hidden caret in the anchor cell ("parked") and the cells are drawn as
   an overlay. Formatting, copy, cut, paste, Delete and typing act on the selected cells.
   Ways in: drag across cells, Shift+click or Shift+arrows across a cell boundary, click just
   above a column, just left of a row or at a cell's left edge, or Table Design › Select. */
const CELLSEL_CURSORS = (() => {
  const u = (svg, x, y, fb) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>${svg}</svg>`)}") ${x} ${y}, ${fb}`;
  return {
    col: u("<path d='M5.5 1.5h5v6.5h3.5L8 14.5 2 8h3.5z' fill='#000' stroke='#fff' stroke-linejoin='round'/>", 8, 14, 's-resize'),
    row: u("<path d='M14.5 1.5v12.5l-3.4-3.4-2.4 4.9-2-1 2.4-4.9H4.5z' fill='#fff' stroke='#000' stroke-linejoin='round'/>", 14, 2, 'default'),
    cell: u("<path d='M14 2v7l-2.5-2.5L4 14l-2-2 7.5-7.5L7 2z' fill='#000' stroke='#fff' stroke-linejoin='round'/>", 14, 2, 'default'),
  };
})();

Object.assign(Tables, {
  dragging: false,
  parkedIn: null,
  head: null,
  _cursor: '',

  active() { return !!(this.sel && this.sel.table.isConnected); },
  cellFrom(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const c = el && el.closest ? el.closest('td, th') : null;
    return c && S.editor.contains(c) && !c.closest('tr.pg-spacer') ? c : null;
  },
  /* the cell of tbl that holds node, through nested tables */
  cellIn(tbl, node) {
    let c = this.cellFrom(node);
    while (c && c.closest('table') !== tbl) c = c.parentElement ? this.cellFrom(c.parentElement) : null;
    return c;
  },
  slotCell(G, r, c) { const e = G.g[r] && G.g[r][c]; return e ? e.cell : null; },
  corner(which) {
    if (!this.active()) return null;
    const G = this.grid(this.sel.table);
    return which === 'end' ? this.slotCell(G, this.sel.r2, this.sel.c2) : this.slotCell(G, this.sel.r1, this.sel.c1);
  },

  /* ---------- setting and clearing ---------- */
  setSel(tbl, R, opts = {}) {
    const G = this.grid(tbl);
    if (!G.rows.length) return;
    this.sel = { table: tbl, r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2 };
    const inside = c => c && c.isConnected && c.closest('table') === tbl;
    if (!inside(this.anchor)) this.anchor = this.slotCell(G, R.r1, R.c1);
    if (!inside(this.head)) this.head = this.slotCell(G, R.r2, R.c2);
    if (!opts.dragging) this.park();
    MiniBar.hide();
    this.refreshHL();
    UI.refresh();
  },
  setRect(a, b, opts = {}) {
    const tbl = a && a.closest('table');
    if (!tbl || !b || b.closest('table') !== tbl) return;
    const G = this.grid(tbl);
    const pa = this.pos(G, a), pb = this.pos(G, b);
    if (!pa || !pb) return;
    const nr = G.rows.length;
    const R = this.expandRect(G, Math.min(pa.r, pb.r), Math.min(pa.c, pb.c),
      Math.min(nr - 1, Math.max(pa.r + (a.rowSpan || 1) - 1, pb.r + (b.rowSpan || 1) - 1)),
      Math.max(pa.c + (a.colSpan || 1) - 1, pb.c + (b.colSpan || 1) - 1));
    this.anchor = a; this.head = b;
    this.setSel(tbl, R, opts);
  },
  clearSel() {
    if (!this.sel && !(S.editor && S.editor.classList.contains('cellsel'))) return;
    this.sel = null; this.parkedIn = null;
    MiniBar.hide();   // its toolbar goes with it
    this.refreshHL();
    UI.refresh();
  },
  /* the browser's selection waits as a hidden caret at the start of the anchor cell */
  park() {
    if (!this.active()) return;
    let cell = this.anchor;
    if (!cell || !cell.isConnected || cell.closest('table') !== this.sel.table) cell = this.anchor = this.corner('start');
    if (!cell) return;
    caretAtStart(cell);
    this.parkedIn = cell;
  },
  isParked(r) {
    return !!(r && r.collapsed && this.parkedIn && this.parkedIn.isConnected && this.active() && this.cellIn(this.sel.table, r.startContainer) === this.parkedIn);
  },
  refreshHL() {
    const ov = $('#overlay');
    if (ov) ov.querySelectorAll('.cell-hl').forEach(x => x.remove());
    if (this.sel && !this.sel.table.isConnected) { this.sel = null; this.parkedIn = null; }
    if (S.editor) S.editor.classList.toggle('cellsel', !!this.sel);
    if (!this.sel || !ov) return;
    const pr = $('#paper').getBoundingClientRect(), z = S.zoom || 1;
    for (const c of this.selectedCells()) {
      const r = Grid.place(c, c.getBoundingClientRect());
      ov.appendChild(h('div', { class: 'cell-hl', style: { left: (r.left - pr.left) / z + 'px', top: (r.top - pr.top) / z + 'px', width: r.width / z + 'px', height: r.height / z + 'px' } }));
    }
  },
  /* for undo, redo and the paste options: which cells, by table number and grid slots */
  serialize() {
    if (!this.active()) return null;
    const { table, r1, c1, r2, c2 } = this.sel;
    const G = this.grid(table);
    const at = c => { const p = c && c.closest('table') === table ? this.pos(G, c) : null; return p ? [p.r, p.c] : null; };
    return { ti: Array.from(S.editor.querySelectorAll('table')).indexOf(table), r1, c1, r2, c2, a: at(this.anchor), h: at(this.head) };
  },
  restore(o) {
    const tbl = o && S.editor.querySelectorAll('table')[o.ti];
    const G = tbl ? this.grid(tbl) : null;
    if (!G || o.r2 >= G.rows.length || o.c2 >= G.ncols || !this.slotCell(G, o.r1, o.c1)) { this.clearSel(); return false; }
    const at = (p, d) => (p && this.slotCell(G, p[0], p[1])) || d;
    this.anchor = at(o.a, this.slotCell(G, o.r1, o.c1));
    this.head = at(o.h, this.slotCell(G, o.r2, o.c2));
    this.setSel(tbl, { r1: o.r1, c1: o.c1, r2: o.r2, c2: o.c2 });
    return true;
  },

  /* ---------- Table Design › Select ---------- */
  selectPart(kind) {
    const cell = this.cellAtCaret() || this.selectedCells()[0];
    if (!cell) return;
    const tbl = cell.closest('table'), G = this.grid(tbl), p = this.pos(G, cell);
    if (!p) return;
    const nr = G.rows.length, nc = G.ncols;
    const one = { r1: p.r, c1: p.c, r2: Math.min(nr - 1, p.r + (cell.rowSpan || 1) - 1), c2: p.c + (cell.colSpan || 1) - 1 };
    const cur = this.active() && this.sel.table === tbl ? this.sel : one;
    let R;
    if (kind === 'cell') R = one;
    else if (kind === 'row') R = { r1: cur.r1, r2: cur.r2, c1: 0, c2: nc - 1 };
    else if (kind === 'col') R = { r1: 0, r2: nr - 1, c1: cur.c1, c2: cur.c2 };
    else R = { r1: 0, c1: 0, r2: nr - 1, c2: nc - 1 };
    R = this.expandRect(G, R.r1, R.c1, Math.min(R.r2, nr - 1), R.c2);
    this.anchor = this.slotCell(G, R.r1, R.c1);
    this.head = this.slotCell(G, R.r2, R.c2);
    this.setSel(tbl, R);
  },

  /* ---------- mouse ---------- */
  /* Word's selection arrows: the strip inside a cell's left edge selects the cell, just above
     a column selects the column, just left of a row selects the row */
  zoneAt(x, y, target) {
    if (TDraw.mode || S.painter || S.view === 'read' || !S.editor) return null;
    const td = this.cellFrom(target);
    if (td) {
      const r = td.getBoundingClientRect();
      const pad = (parseFloat(getComputedStyle(td).paddingLeft) || 7) * (S.zoom || 1);
      if (x >= r.left + (td.cellIndex > 0 ? 3 : 1) && x <= r.left + Math.max(8, pad + 1.5) && y >= r.top && y <= r.bottom) return { kind: 'cell', tbl: td.closest('table'), cell: td };
    }
    // innermost tables first
    const tables = Array.from(S.editor.querySelectorAll('table')).reverse();
    for (const tbl of tables) {
      const T = tbl.getBoundingClientRect();
      if (!T.width || x < T.left - 30 || x > T.right + 1 || y < T.top - 8 || y > T.bottom + 1) continue;
      const G = this.grid(tbl);
      if (!G.rows.length) continue;
      const top = G.rows[0].getBoundingClientRect().top;
      if (y >= top - 6 && y <= top + 2 && x >= T.left && x <= T.right) { const c = this.colAt(G, x); if (c >= 0) return { kind: 'col', tbl, c }; }
      if (x >= T.left - 28 && x < T.left - 1) { const r = this.rowAt(G, y); if (r >= 0) return { kind: 'row', tbl, r }; }
    }
    return null;
  },
  colAt(G, x) {
    let approx = -1;
    for (let r = 0; r < G.rows.length; r++) for (let c = 0; c < G.ncols; c++) {
      const e = G.g[r][c];
      if (!e || e.r0 !== r || e.c0 !== c) continue;
      const rc = e.cell.getBoundingClientRect();
      if (x < rc.left - 1 || x > rc.right + 1) continue;
      const cs = Math.max(1, e.cell.colSpan || 1);
      if (cs === 1) return c;
      if (approx < 0) approx = c + clamp(Math.floor((x - rc.left) / (rc.width / cs)), 0, cs - 1);
    }
    return approx;
  },
  rowAt(G, y) {
    for (let r = 0; r < G.rows.length; r++) { const rc = G.rows[r].getBoundingClientRect(); if (y >= rc.top && y <= rc.bottom) return r; }
    return -1;
  },
  onMouseDown(e) {
    this.stopDrag();
    if (this.resizeHit(e)) return;
    const z = this.zoneAt(e.clientX, e.clientY, e.target);
    if (z) { this.zoneDown(e, z); return; }
    const td = this.cellFrom(e.target);
    if (!td) { this.clearSel(); return; }
    const tbl = td.closest('table');
    if (e.shiftKey) {
      const r = getRange();
      const from = this.active() && this.sel.table === tbl ? this.anchor : (r ? this.cellIn(tbl, r.startContainer) : null);
      if (from && from !== td && from.closest('table') === tbl) { e.preventDefault(); this.setRect(from, td); this.showMini(); return; }
    }
    this.clearSel();
    this.anchor = td;
    // a drag inside the cell selects text; once it reaches another cell, whole cells
    this.drag(ev => {
      const t = document.elementFromPoint(ev.clientX, ev.clientY);
      const c2 = t ? this.cellIn(tbl, t) : null;
      if (c2) { if (c2 === td) this.clearSel(); else this.setRect(td, c2, { dragging: true }); }
      else if (!(t && t.closest && t.closest('table') === tbl)) this.clearSel();
    });
  },
  zoneDown(e, z) {
    e.preventDefault();
    if (document.activeElement !== S.editor) S.editor.focus({ preventScroll: true });
    const tbl = z.tbl, G = this.grid(tbl), nr = G.rows.length, nc = G.ncols;
    const ext = e.shiftKey && this.active() && this.sel.table === tbl && this.anchor && this.anchor.closest('table') === tbl;
    const at = (r, c) => this.slotCell(G, clamp(r, 0, nr - 1), clamp(c, 0, nc - 1));
    if (z.kind === 'cell') {
      if (ext) { this.setRect(this.anchor, z.cell); this.showMini(); return; }
      this.setRect(z.cell, z.cell, { dragging: true });
      this.drag(ev => { const t = document.elementFromPoint(ev.clientX, ev.clientY); const c2 = t ? this.cellIn(tbl, t) : null; if (c2) this.setRect(z.cell, c2, { dragging: true }); });
      return;
    }
    if (z.kind === 'col') {
      const pa = ext ? this.pos(G, this.anchor) : null;
      const c0 = pa ? pa.c : z.c;
      const span = c => { this.anchor = at(0, c0); this.head = at(nr - 1, c); this.setSel(tbl, this.expandRect(G, 0, Math.min(c0, c), nr - 1, Math.max(c0, c)), { dragging: true }); };
      span(z.c);
      this.drag(ev => { const T = tbl.getBoundingClientRect(); const c = this.colAt(G, clamp(ev.clientX, T.left + 1, T.right - 1)); if (c >= 0) span(c); });
      return;
    }
    const pa = ext ? this.pos(G, this.anchor) : null;
    const r0 = pa ? pa.r : z.r;
    const span = r => { this.anchor = at(r0, 0); this.head = at(r, nc - 1); this.setSel(tbl, this.expandRect(G, Math.min(r0, r), 0, Math.max(r0, r), nc - 1), { dragging: true }); };
    span(z.r);
    this.drag(ev => { const T = tbl.getBoundingClientRect(); const r = this.rowAt(G, clamp(ev.clientY, T.top + 1, T.bottom - 1)); if (r >= 0) span(r); });
  },
  drag(onMove) {
    this.stopDrag();
    this.dragging = true;
    const end = () => {
      this.stopDrag();
      if (!this.active()) return;
      this.park();
      // the browser finishes its own drag selection after this; park again if it moved
      setTimeout(() => { if (this.active() && !this.isParked(getRange())) this.park(); }, 0);
      this.showMini();
    };
    this._drag = { onMove, end };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  },
  /* a new press always ends the last drag, even if its release went unseen */
  stopDrag() {
    const d = this._drag;
    if (d) {
      window.removeEventListener('pointermove', d.onMove);
      window.removeEventListener('pointerup', d.end);
      window.removeEventListener('pointercancel', d.end);
      this._drag = null;
    }
    this.dragging = false;
  },
  hoverCursor(e) {
    let cur = '';
    if (!TDraw.mode && !this.dragging && !e.buttons) {
      const t = e.target.closest && e.target.closest('td, th');
      const r = t && S.editor.contains(t) ? t.getBoundingClientRect() : null;
      if (r && !S.readOnly && (Math.abs(e.clientX - r.right) <= 4 || (Math.abs(e.clientX - r.left) < 3 && t.cellIndex > 0))) cur = 'col-resize';
      else { const z = this.zoneAt(e.clientX, e.clientY, e.target); if (z) cur = CELLSEL_CURSORS[z.kind]; }
    }
    if (!cur && S.painter) cur = 'copy';
    if (cur !== this._cursor) { this._cursor = cur; S.editor.style.cursor = cur; }
  },
  showMini() {
    if (!Prefs.miniToolbar || S.readOnly || !this.active()) return;
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
    for (const c of this.selectedCells()) { const r = c.getBoundingClientRect(); L = Math.min(L, r.left); T = Math.min(T, r.top); R = Math.max(R, r.right); B = Math.max(B, r.bottom); }
    if (!(R > L)) return;
    const rect = new DOMRect(L, T, R - L, B - T);
    MiniBar.show({ getClientRects: () => [rect], getBoundingClientRect: () => rect });
  },

  /* ---------- keyboard ---------- */
  /* keys while cells are selected; true when the key was dealt with here */
  onKeyDown(e) {
    if (e.isComposing) return false;
    if (!this.active()) return this.shiftOutOfCell(e);
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (step && e.shiftKey && !mod && !e.altKey) { e.preventDefault(); this.moveHead(step[0], step[1]); return true; }
    if (step || k === 'Home' || k === 'End' || k === 'PageUp' || k === 'PageDown') {
      if (mod && !step) { this.clearSel(); return false; }   // Ctrl+Home / Ctrl+End: the start or end of the document
      e.preventDefault();
      const back = k === 'ArrowUp' || k === 'ArrowLeft' || k === 'Home' || k === 'PageUp';
      const cell = this.corner(back ? 'start' : 'end');
      this.clearSel();
      if (cell) { if (back) caretAtStart(cell); else caretAtEnd(cell); }
      return true;
    }
    if (k === 'Escape') { e.preventDefault(); const c = this.anchor; this.clearSel(); if (c && c.isConnected) caretAtStart(c); return true; }
    if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); this.clearContents(); return true; }
    if (k === 'Enter') { e.preventDefault(); const c = this.corner('start'); this.clearSel(); if (c) caretAtEnd(c); return true; }
    if (k === 'Tab') { this.clearSel(); return false; }   // on to the next cell from the anchor cell
    // a key that types (Option types on a Mac, AltGr elsewhere; Alt+letter on Windows doesn't)
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
    const plain = !e.ctrlKey && !e.metaKey && (!e.altKey || mac);
    const altGr = !mac && e.ctrlKey && e.altKey && !e.metaKey;
    if ((k.length === 1 || k === 'Process' || k === 'Dead') && (plain || altGr) && !S.readOnly) this.typeOver();   // the key then types into the emptied first cell
    return false;
  },
  /* typing or deleting that came without a recognisable key (phone keyboards, some input
     methods): the same as the keys above */
  onBeforeInput(e) {
    if (!this.active()) return false;
    const t = e.inputType || '';
    if (t.startsWith('delete') && e.cancelable) { e.preventDefault(); this.clearContents(); return true; }
    if (t === 'insertParagraph' || t === 'insertLineBreak') { e.preventDefault(); const c = this.corner('start'); this.clearSel(); if (c) caretAtEnd(c); return true; }
    if ((t === 'insertText' || t === 'insertReplacementText') && e.cancelable && e.data) {
      e.preventDefault();
      this.typeOver();
      if (S.track) { Track.insertText(e.data); Track.after(); } else exec('insertText', e.data);
      return true;
    }
    if (t === 'insertCompositionText') this.typeOver();
    return false;
  },
  /* Shift+arrow that would take a text selection out of its cell selects whole cells instead,
     the cell itself and its neighbour that way in the grid (Word). Inside the cell the
     browser extends the text selection as usual. */
  shiftOutOfCell(e) {
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!step || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
    const s = window.getSelection();
    if (!s.rangeCount) return false;
    const cell = this.cellFrom(s.focusNode);
    if (!cell || this.cellFrom(s.anchorNode) !== cell) return false;
    const next = this.neighbor(cell, step[0], step[1]);
    if (!next) return false;
    // try the move, see whether it leaves the cell, and put the selection back
    const saved = [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset];
    try { s.modify('extend', step[0] ? (step[0] > 0 ? 'forward' : 'backward') : (step[1] > 0 ? 'right' : 'left'), step[0] ? 'line' : 'character'); } catch { return false; }
    const leaves = this.cellFrom(s.focusNode) !== cell;
    try { s.setBaseAndExtent(...saved); } catch { }
    if (!leaves) return false;
    e.preventDefault();
    this.setRect(cell, next);
    return true;
  },
  /* the cell beside `cell` in the grid, one step down (dr 1), up, right (dc 1) or left */
  neighbor(cell, dr, dc) {
    const tbl = cell.closest('table'), G = this.grid(tbl), p = this.pos(G, cell);
    if (!p) return null;
    const r = dr > 0 ? p.r + (cell.rowSpan || 1) : dr < 0 ? p.r - 1 : p.r;
    const c = dc > 0 ? p.c + (cell.colSpan || 1) : dc < 0 ? p.c - 1 : p.c;
    return this.slotCell(G, r, c);
  },
  /* Shift+arrow: the selection grows or shrinks from the anchor by one cell */
  moveHead(dr, dc) {
    const tbl = this.sel.table, G = this.grid(tbl), nr = G.rows.length, nc = G.ncols;
    if (!this.anchor || this.anchor.closest('table') !== tbl) this.anchor = this.corner('start');
    const hc = this.head && this.head.isConnected && this.head.closest('table') === tbl ? this.head : this.corner('end');
    const p = this.pos(G, hc);
    if (!p) return;
    let r = p.r, c = p.c;
    if (dr > 0) r = Math.min(nr - 1, p.r + (hc.rowSpan || 1));
    if (dr < 0) r = Math.max(0, p.r - 1);
    if (dc > 0) c = Math.min(nc - 1, p.c + (hc.colSpan || 1));
    if (dc < 0) c = Math.max(0, p.c - 1);
    const next = this.slotCell(G, r, c);
    if (next) this.setRect(this.anchor, next);
  },
  /* the browser's selection changed: leave cell mode, or enter it when a text selection
     crosses from one cell into another (as Word does) */
  onSelChange(r) {
    if (this.dragging || !r) return;
    const s = window.getSelection();
    if (this.active()) {
      if (this.isParked(r)) return;
      const tbl = this.sel.table;
      const a = this.cellIn(tbl, s.anchorNode), f = this.cellIn(tbl, s.focusNode);
      if (!r.collapsed && a && f && a !== f) { this.setRect(a, f); return; }
      this.clearSel();
      return;
    }
    if (r.collapsed) return;
    const a0 = this.cellFrom(s.anchorNode), f0 = this.cellFrom(s.focusNode);
    if (!a0 || !f0 || a0 === f0) return;
    let tbl = a0.closest('table');
    while (tbl && !tbl.contains(f0)) tbl = tbl.parentElement ? tbl.parentElement.closest('table') : null;
    if (!tbl || !S.editor.contains(tbl)) return;
    const a = this.cellIn(tbl, a0), f = this.cellIn(tbl, f0);
    if (a && f && a !== f) this.setRect(a, f);
  },

  /* ---------- editing the selected cells ---------- */
  contentsRange(cell) { const r = document.createRange(); r.selectNodeContents(cell); return r; },
  /* the paragraphs (and other leaf blocks) of the selected cells, in grid order */
  selBlocks() {
    const out = [];
    for (const c of this.selectedCells()) for (const b of selectedBlocks(this.contentsRange(c))) if (!out.includes(b)) out.push(b);
    return out;
  },
  cellTexts() { return this.selectedCells().flatMap(c => textNodesIn(this.contentsRange(c), false)); },
  /* for commands that work on the browser's selection: run fn over each selected cell in turn */
  forEachCell(fn) {
    for (const c of this.selectedCells()) { if (!c.isConnected) continue; const r = this.contentsRange(c); setRange(r); fn(c, r); }
    this.park();
  },
  /* an empty paragraph formatted like the cell's first one */
  emptyPara(cell) {
    const p0 = cell.querySelector(CELL_BLOCKS);
    const p = p0 && p0.tagName === 'P' ? p0.cloneNode(false) : document.createElement('p');
    ['id', 'data-pgp', 'data-bj'].forEach(a => p.removeAttribute(a));
    ['--pgp', '--bjg', '--pb0', '--bjsh'].forEach(k => p.style.removeProperty(k));
    if (!p.getAttribute('style')) p.removeAttribute('style');
    return p;
  },
  clearCore() {
    for (const c of this.selectedCells()) {
      const r = this.contentsRange(c);
      if (S.track) { if (r.toString().replace(/[\u200B\s]/g, '')) Track.markDeleted(r, 'start'); continue; }
      const p = this.emptyPara(c);
      p.appendChild(h('br'));
      c.replaceChildren(p);
    }
  },
  /* Delete or Backspace: the cells stay, their contents go */
  clearContents() {
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing on the Review tab to make changes.'); return; }
    change(() => { this.clearCore(); this.park(); }, { full: true });
  },
  /* typing over selected cells replaces them: they are emptied and the text goes in the first */
  typeOver() {
    const first = this.corner('start');
    change(() => this.clearCore(), { full: true });
    this.clearSel();
    if (first && first.isConnected) caretAtStart(first);
  },
  /* Copy and Cut from the ribbon: the browser only copies when something is selected */
  execClip(cmd) {
    const c = this.corner('start');
    if (!c) return;
    setRange(this.contentsRange(c));
    const ok = exec(cmd);
    if (this.active()) this.park();
    if (!ok) toast(`Press ${MOD}+${cmd === 'cut' ? 'X' : 'C'} to ${cmd}.`);
  },
  /* the text of a cell, paragraphs on separate lines */
  cellText(cell) {
    const c = cell.cloneNode(true);
    c.querySelectorAll('del.tc, span.qm, span.pg-line, tr.pg-spacer').forEach(n => n.remove());
    c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    const leaf = Array.from(c.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre')).filter(b => !b.querySelector('p, h1, h2, h3, h4, h5, h6, li, pre'));
    const lines = leaf.length ? leaf.map(b => b.textContent) : [c.textContent];
    return lines.map(s => s.replace(/\u200B/g, '').replace(/\n+$/, '')).join('\n').replace(/^\n+|\n+$/g, '');
  },
  /* the selected cells as a table (HTML) and as tab-separated text, the way Excel and Word read them */
  copyCells(dt) {
    const { table: tbl, r1, c1, r2, c2 } = this.sel;
    const G = this.grid(tbl);
    const t = tbl.cloneNode(false);
    t.removeAttribute('id');
    t.setAttribute('data-folio-cells', '');
    if (this.fitMode(tbl) === 'contents') { t.style.width = ''; t.style.tableLayout = 'auto'; }
    else {
      const ws = this.measureCols(tbl).slice(c1, c2 + 1);
      const cg = document.createElement('colgroup');
      ws.forEach(w => cg.appendChild(h('col', { style: `width:${fmtNum(w, 1)}px` })));
      t.appendChild(cg);
      t.style.width = fmtNum(ws.reduce((a, b) => a + b, 0), 1) + 'px';
      t.setAttribute('data-fit', 'fixed');
    }
    const tb = document.createElement('tbody');
    t.appendChild(tb);
    const rows = [];
    for (let r = r1; r <= r2; r++) {
      const tr = G.rows[r].cloneNode(false);
      tr.removeAttribute('id');
      const vals = [];
      for (let c = c1; c <= c2; c++) {
        const e = G.g[r][c];
        if (!e || e.r0 !== r || e.c0 !== c) { vals.push(''); continue; }
        tr.appendChild(e.cell.cloneNode(true));
        vals.push(this.cellText(e.cell));
      }
      tb.appendChild(tr);
      rows.push(vals);
    }
    const box = document.createElement('div');
    box.appendChild(t);
    box.querySelectorAll('.cmt').forEach(n => unwrap(n));
    dt.setData('text/html', cleanHTML(box));
    dt.setData('text/plain', toTSV(rows));
  },

  /* ---------- paste into cells ----------
     As Word's Overwrite Cells and Excel do: a block of cells fills the cells from the top-left
     selected one (rows are added at the bottom if needed); one value pasted over several
     selected cells goes into each of them, and a block that fits a whole number of times
     over the selection repeats. Returns true when the paste was handled here. */
  pasteCells(mode, html, text, opts = {}) {
    const selMode = this.active();
    let tbl, R;
    if (selMode) { tbl = this.sel.table; R = { r1: this.sel.r1, c1: this.sel.c1, r2: this.sel.r2, c2: this.sel.c2 }; }
    else {
      const cell = this.cellAtCaret();
      if (!cell) return false;
      tbl = cell.closest('table');
      const p = this.pos(this.grid(tbl), cell);
      if (!p) return false;
      R = { r1: p.r, c1: p.c, r2: p.r, c2: p.c };
    }
    const grid = this.clipGrid(mode, html, text, selMode, opts);
    if (!grid || !grid.length) return false;
    const gr = grid.length, gc = Math.max(1, ...grid.map(r => r.length));
    if (!selMode && gr * gc < 2) return false;   // one value at the caret: an ordinary paste
    const sr = R.r2 - R.r1 + 1, sc = R.c2 - R.c1 + 1;
    const tile = selMode && sr % gr === 0 && sc % gc === 0;
    const H = tile ? sr : gr, W = tile ? sc : gc;
    let G = this.grid(tbl);
    const need = R.r1 + H - G.rows.length;
    if (need > 0) { this.insertRowsAt(tbl, G.rows.length, need, G.rows.length - 1); G = this.grid(tbl); }
    const fitW = Math.max(1, Math.min(W, G.ncols - R.c1));
    const done = new Set();
    for (let i = 0; i < H; i++) for (let j = 0; j < fitW; j++) {
      const v = grid[i % gr][j % gc];
      if (!v) continue;   // a short row: that cell stays as it is
      const r = R.r1 + i, c = R.c1 + j;
      const e = G.g[r] && G.g[r][c];
      if (!e || e.r0 !== r || e.c0 !== c || done.has(e.cell)) continue;   // the inside of a merged cell
      done.add(e.cell);
      this.fillCell(e.cell, v, mode);
    }
    if (W > fitW) { const n = W - fitW; toast(`${n} column${n > 1 ? 's' : ''} didn’t fit in the table, so ${n > 1 ? 'they weren’t' : 'it wasn’t'} pasted.`); }
    G = this.grid(tbl);
    const R2 = this.expandRect(G, R.r1, R.c1, Math.min(G.rows.length - 1, R.r1 + H - 1), R.c1 + fitW - 1);
    this.anchor = this.slotCell(G, R2.r1, R2.c1);
    this.head = this.slotCell(G, R2.r2, R2.c2);
    this.setSel(tbl, R2);
    return true;
  },
  /* the clipboard as rows of cell values ({ nodes } or { text }), or null when it isn't cells */
  clipGrid(mode, html, text, selMode, opts = {}) {
    if (mode !== 'text' && html) {
      const frag = sanitizeHtml(html, { mode, noBijoy: opts.noBijoy });
      const kids = Array.from(frag.childNodes).filter(n => !(n.nodeType === 3 && !n.data.trim()) && !(n.nodeType === 1 && n.tagName === 'P' && isBlank(n)));
      if (kids.length === 1 && kids[0].nodeType === 1 && kids[0].tagName === 'TABLE') return this.gridOfTable(kids[0]);
      if (!selMode || kids.some(n => n.nodeType === 1 && n.tagName === 'TABLE')) return null;
      // formatted text over selected cells: one value for every cell, or a paragraph per row
      if (kids.length > 1 && kids.every(n => n.nodeType === 1 && isBlockEl(n))) return kids.map(b => [{ nodes: [b] }]);
      // a piece of a paragraph takes the cell's own paragraph formatting, as in Word
      const inline = kids.filter(n => n.nodeName === 'P').length <= 1 && !kids.some(n => n.nodeType === 1 && isBlockEl(n) && n.nodeName !== 'P');
      return kids.length ? [[{ nodes: kids, inline }]] : null;
    }
    if (!text) return null;   // nothing to paste
    // tab-separated text fills cells when cells are selected, or when it is copied cells pasted
    // as text only; at a caret, plain text with tabs stays in the one cell (as in Word)
    const rows = parseTSV(text);
    const copiedCells = !!html && /<t[dh][\s>]/i.test(html);
    if (rows.some(r => r.length > 1) && (selMode || copiedCells)) return rows.map(r => r.map(v => ({ text: v })));
    if (!selMode) return null;
    return rows.map(r => [{ text: r[0] }]);
  },
  gridOfTable(t) {
    const G = this.grid(t);
    return G.rows.map((_, r) => {
      const row = [];
      for (let c = 0; c < G.ncols; c++) {
        const e = G.g[r][c];
        row.push(!e ? null : e.r0 === r && e.c0 === c ? { nodes: Array.from(e.cell.childNodes) } : { text: '' });
      }
      return row;
    });
  },
  fillCell(cell, v, mode) {
    let nodes;
    if (v.text != null) nodes = String(v.text).split('\n').map(line => { const p = this.emptyPara(cell); if (line) p.textContent = line; else p.appendChild(h('br')); return p; });
    else if (mode === 'merge' || v.inline) nodes = finalizeFragmentList(v.nodes).map(b => {
      if (!/^(P|H[1-6])$/.test(b.nodeName)) return b.cloneNode(true);
      const p = this.emptyPara(cell);
      for (const k of Array.from(b.childNodes)) p.appendChild(k.cloneNode(true));
      if (!p.firstChild) p.appendChild(h('br'));
      return p;
    });
    else nodes = finalizeFragmentList(v.nodes).map(n => n.cloneNode(true));
    if (!nodes.length) { const p = this.emptyPara(cell); p.appendChild(h('br')); nodes = [p]; }
    const frag = document.createDocumentFragment();
    frag.append(...nodes);
    if (S.track) {
      Track.markFragment(frag);
      const r = this.contentsRange(cell);
      if (r.toString().replace(/[\u200B\s]/g, '')) { Track.markDeleted(r, 'end'); cell.appendChild(frag); return; }
    }
    cell.replaceChildren(frag);
  },
});

/* nodes as blocks: loose inline runs are wrapped in paragraphs */
function finalizeFragmentList(nodes) {
  const f = document.createDocumentFragment();
  for (const n of nodes) f.appendChild(n.cloneNode(true));
  return Array.from(finalizeFragment(f).childNodes);
}
/* rows of text as Excel's clipboard text: tabs between cells, a line per row, and cells
   with tabs, line breaks or a leading quote in quotes */
function toTSV(rows) {
  return rows.map(r => r.map(v => /[\t\n]|^"/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v).join('\t')).join('\n');
}
function parseTSV(text) {
  let s = String(text).replace(/\r\n?/g, '\n');
  if (s.endsWith('\n')) s = s.slice(0, -1);
  const quoted = () => {
    const rows = [];
    let row = [], cell = '', q = false, fresh = true;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
        continue;
      }
      if (ch === '"' && fresh) { q = true; fresh = false; continue; }
      fresh = false;
      if (ch === '\t') { row.push(cell); cell = ''; fresh = true; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; fresh = true; continue; }
      cell += ch;
    }
    if (q) return null;   // an unmatched quote: read the text as it is
    row.push(cell);
    rows.push(row);
    return rows;
  };
  return quoted() || s.split('\n').map(l => l.split('\t'));
}
