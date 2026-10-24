/* ===================== Tables =====================
   A table is edited as a grid: grid() maps every slot to the cell covering it, and
   structural changes (split, insert or delete cells, draw a line) work on a model of
   that grid { rows, nr, nc, cells: [{ el, r, c, rs, cs }], widths } that rebuild()
   writes back as rows, cells, spans and column widths. */
const TABLE_PRESETS = [
  { id: 'grid', label: 'Grid', cls: 'tbl-grid' },
  { id: 'plain', label: 'No borders', cls: 'tbl-plain' },
  { id: 'lines', label: 'Lines', cls: 'tbl-lines hdr' },
  { id: 'gray', label: 'Gray header', cls: 'tbl-c-gray hdr band' },
  { id: 'green', label: 'Green header', cls: 'tbl-c-green hdr band' },
  { id: 'blue', label: 'Blue header', cls: 'tbl-c-blue hdr band' },
  { id: 'amber', label: 'Amber header', cls: 'tbl-c-amber hdr band' },
];
const CELL_BLOCKS = ':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6';
const Tables = {
  sel: null, // {table, r1, c1, r2, c2}
  anchor: null,
  newCell(tag = 'td') { const c = document.createElement(tag); c.appendChild(h('p', null, h('br'))); return c; },
  /* an empty cell with the formatting of el (borders, shading, alignment) */
  cloneCell(el, opts = {}) {
    const n = document.createElement(opts.tag || (el.tagName === 'TH' ? 'th' : 'td'));
    const st = el.getAttribute('style');
    if (st) n.setAttribute('style', st);
    if (opts.bg === false) n.style.backgroundColor = '';
    for (const a of ['data-dd', 'data-du', 'data-shd', 'data-shdc', 'data-shdf']) if (el.hasAttribute(a) && opts.bg !== false) n.setAttribute(a, el.getAttribute(a));
    if (opts.bg === false) decoSync(n);
    if (!n.getAttribute('style')) n.removeAttribute('style');
    const p0 = el.querySelector(CELL_BLOCKS);
    const p = p0 && p0.tagName === 'P' ? p0.cloneNode(false) : h('p');
    ['id', 'data-pgp', 'data-bj'].forEach(a => p.removeAttribute(a));
    ['--pgp', '--bjg', '--pb0'].forEach(k => p.style.removeProperty(k));
    if (!p.getAttribute('style')) p.removeAttribute('style');
    p.appendChild(h('br'));
    n.appendChild(p);
    return n;
  },
  cellAtCaret() {
    const n = curTextNode();
    const el = n && (n.nodeType === 1 ? n : n.parentNode);
    const c = el && el.closest && el.closest('td, th');
    return c && S.editor.contains(c) && !c.closest('tr.pg-spacer') ? c : null;
  },
  tableAtCaret() { const c = this.cellAtCaret(); if (c) return c.closest('table'); return this.sel && this.sel.table.isConnected ? this.sel.table : null; },
  grid(tbl) {
    const rows = Array.from(tbl.rows).filter(r => !r.classList.contains('pg-spacer') && r.closest('table') === tbl);
    const g = rows.map(() => []);
    rows.forEach((row, r) => {
      let c = 0;
      for (const cell of row.cells) {
        while (g[r][c]) c++;
        const rs = Math.max(1, cell.rowSpan || 1), cs = Math.max(1, cell.colSpan || 1);
        for (let i = 0; i < rs && r + i < rows.length; i++) for (let j = 0; j < cs; j++) g[r + i][c + j] = { cell, r0: r, c0: c };
        c += cs;
      }
    });
    const ncols = g.reduce((m, row) => Math.max(m, row.length), 0);
    return { rows, g, ncols };
  },
  /* every cell once, with its place and spans */
  cells(G) {
    const out = [], seen = new Set(), nr = G.rows.length;
    for (let r = 0; r < nr; r++) for (let c = 0; c < G.ncols; c++) {
      const e = G.g[r][c];
      if (!e || seen.has(e.cell)) continue;
      seen.add(e.cell);
      out.push({ el: e.cell, r: e.r0, c: e.c0, rs: Math.max(1, Math.min(e.cell.rowSpan || 1, nr - e.r0)), cs: Math.max(1, e.cell.colSpan || 1) });
    }
    return out;
  },
  pos(G, cell) {
    for (let r = 0; r < G.g.length; r++) for (let c = 0; c < G.g[r].length; c++) if (G.g[r][c] && G.g[r][c].cell === cell) return { r, c };
    return null;
  },

  /* ---------- grid model ---------- */
  model(tbl) {
    const G = this.grid(tbl);
    let ws = this.measureCols(tbl);
    if (ws.length !== G.ncols) { const avg = (tbl.offsetWidth || geom().cw) / Math.max(1, G.ncols); ws = Array.from({ length: G.ncols }, (_, i) => ws[i] || avg); }
    return { tbl, rows: G.rows.slice(), nr: G.rows.length, nc: G.ncols, cells: this.cells(G), widths: ws.slice() };
  },
  occupancy(M) {
    const occ = Array.from({ length: M.nr }, () => new Array(M.nc).fill(null));
    for (const x of M.cells) for (let r = x.r; r < Math.min(M.nr, x.r + x.rs); r++) for (let c = x.c; c < Math.min(M.nc, x.c + x.cs); c++) occ[r][c] = x;
    return occ;
  },
  /* split grid column k at fraction f; cells over it now span both parts */
  splitGridCol(M, k, f) {
    const w = M.widths[k];
    M.widths.splice(k, 1, w * f, w * (1 - f));
    for (const x of M.cells) { if (x.c > k) x.c++; else if (x.c + x.cs - 1 >= k) x.cs++; }
    M.nc++;
  },
  /* add a grid row after row k; cells over row k now span it too */
  splitGridRow(M, k) {
    const tr = document.createElement('tr');
    M.rows.splice(k + 1, 0, tr);
    for (const x of M.cells) { if (x.r > k) x.r++; else if (x.r + x.rs - 1 >= k) x.rs++; }
    M.nr++;
    return tr;
  },
  /* drop grid rows and columns that no cell starts in (left behind by merging) */
  compact(M) {
    for (let r = M.nr - 1; r >= 1; r--) {
      if (M.cells.some(x => x.r === r)) continue;
      for (const x of M.cells) { if (x.r > r) x.r--; else if (x.r + x.rs > r) x.rs--; }
      M.rows[r].remove();
      M.rows.splice(r, 1);
      M.nr--;
    }
    for (let c = M.nc - 1; c >= 1; c--) {
      if (M.cells.some(x => x.c === c)) continue;
      M.widths[c - 1] += M.widths[c];
      M.widths.splice(c, 1);
      for (const x of M.cells) { if (x.c > c) x.c--; else if (x.c + x.cs > c) x.cs--; }
      M.nc--;
    }
  },
  /* write the model back to the table */
  rebuild(M, opts = {}) {
    const tbl = M.tbl;
    if (opts.compact) this.compact(M);
    const occ = this.occupancy(M);
    for (let r = 0; r < M.nr; r++) for (let c = 0; c < M.nc; c++) {
      if (occ[r][c]) continue;
      let el = opts.fill ? opts.fill(r, c, occ) : null;
      if (!el) { const near = occ[r][c - 1] || occ[r][c + 1] || (occ[r - 1] && occ[r - 1][c]) || (occ[r + 1] && occ[r + 1][c]); el = near ? this.cloneCell(near.el) : this.newCell(); }
      const x = { el, r, c, rs: 1, cs: 1 };
      M.cells.push(x);
      occ[r][c] = x;
    }
    tbl.querySelectorAll('tr.pg-spacer').forEach(tr => { if (tr.closest('table') === tbl) tr.remove(); });
    const live = new Set(M.rows);
    for (const tr of Array.from(tbl.rows)) if (tr.closest('table') === tbl && !live.has(tr)) tr.remove();
    let body = null;
    for (const tr of M.rows) if (tr.parentNode && tr.parentNode.parentNode === tbl) { body = tr.parentNode; break; }
    if (!body) body = tbl.tBodies[0] || tbl.appendChild(document.createElement('tbody'));
    let prevRow = null;
    for (const tr of M.rows) {
      const okPlace = tr.parentNode && tr.parentNode.parentNode === tbl && (prevRow ? prevRow.nextElementSibling === tr : (tr.parentNode === body && !tr.previousElementSibling));
      if (!okPlace) { if (prevRow) prevRow.after(tr); else body.prepend(tr); }
      prevRow = tr;
    }
    const inModel = new Set(M.cells.map(x => x.el));
    const byRow = M.rows.map(() => []);
    for (const x of M.cells) if (x.r < M.nr) byRow[x.r].push(x); else x.el.remove();
    M.rows.forEach((tr, r) => {
      for (const cl of Array.from(tr.cells)) if (!inModel.has(cl)) cl.remove();
      let prev = null;
      for (const x of byRow[r].sort((a, b) => a.c - b.c)) {
        if (x.cs > 1) x.el.colSpan = x.cs; else x.el.removeAttribute('colspan');
        if (x.rs > 1) x.el.rowSpan = x.rs; else x.el.removeAttribute('rowspan');
        if (x.el.parentNode !== tr || x.el.previousElementSibling !== prev) { if (prev) prev.after(x.el); else tr.prepend(x.el); }
        prev = x.el;
      }
    });
    this.setWidths(tbl, M.widths);
    this.markEdges(tbl);
  },
  setWidths(tbl, ws) {
    let cg = tbl.querySelector(':scope > colgroup');
    if (!cg && tbl.style.tableLayout === 'auto') return;
    const pct = cg ? (cg.children.length > 0 && Array.from(cg.children).every(c => /%$/.test(c.style.width))) : /%$/.test(tbl.style.width || '');
    if (!cg) { cg = document.createElement('colgroup'); tbl.insertBefore(cg, tbl.firstChild); }
    cg.innerHTML = '';
    const sum = ws.reduce((a, b) => a + b, 0) || 1;
    for (const w of ws) cg.appendChild(h('col', { style: `width:${pct ? fmtNum(w * 100 / sum, 3) + '%' : fmtNum(w, 1) + 'px'}` }));
    if (!pct) tbl.style.width = fmtNum(sum, 1) + 'px';
  },

  /* ---------- outside edges, for the table's own borders ---------- */
  markEdges(tbl) {
    if (!tbl.classList.contains('tbl-bd')) return;
    const G = this.grid(tbl), nr = G.rows.length;
    for (const x of this.cells(G)) {
      const right = x.c + x.cs >= G.ncols || !G.g[x.r][x.c + x.cs];
      const bottom = x.r + x.rs >= nr || !(G.g[x.r + x.rs] && G.g[x.r + x.rs][x.c]);
      const v = [x.r === 0 ? 't' : '', bottom ? 'b' : '', x.c === 0 ? 'l' : '', right ? 'r' : ''].filter(Boolean).join(' ');
      if ((x.el.getAttribute('data-edge') || '') !== v) { if (v) x.el.setAttribute('data-edge', v); else x.el.removeAttribute('data-edge'); }
    }
  },
  markAll() { if (S.editor) for (const t of S.editor.querySelectorAll('table.tbl-bd')) this.markEdges(t); },

  /* ---------- insert ---------- */
  insert(rows, cols, preset = 'grid') {
    if (S.readOnly) return;
    rows = clamp(rows | 0, 1, 200); cols = clamp(cols | 0, 1, 40);
    change(() => {
      const p = TABLE_PRESETS.find(x => x.id === preset) || TABLE_PRESETS[0];
      const tbl = h('table', { class: p.cls, style: 'width:100%' });
      const cg = document.createElement('colgroup');
      for (let c = 0; c < cols; c++) cg.appendChild(h('col', { style: `width:${fmtNum(100 / cols, 3)}%` }));
      tbl.appendChild(cg);
      const tb = document.createElement('tbody');
      for (let r = 0; r < rows; r++) { const tr = document.createElement('tr'); for (let c = 0; c < cols; c++) tr.appendChild(this.newCell()); tb.appendChild(tr); }
      tbl.appendChild(tb);
      const r = getRange();
      const leaf = r && blockOf(r.startContainer);
      if (leaf && leaf.closest('td, th')) { leaf.after(tbl); }
      else if (leaf && leaf.parentNode === S.editor && isBlank(leaf)) { leaf.before(tbl); }
      else insertBlockAfterCaret(tbl, { split: true });
      if (!tbl.nextElementSibling) tbl.after(h('p', null, h('br')));
      caretAtStart(tbl.rows[0].cells[0].firstChild);
    }, { full: true });
  },
  /* the selected cells as a grid rectangle */
  selRect() {
    const cells = this.selectedCells();
    if (!cells.length) return null;
    const tbl = cells[0].closest('table');
    const R = Borders.rectOf(tbl, cells);
    return R ? { tbl, R, cells } : null;
  },
  /* k new rows before grid row `at`, formatted like row `src` (merges included) */
  insertRowsAt(tbl, at, k, src) {
    const M = this.model(tbl);
    for (const x of M.cells) { if (x.r >= at) x.r += k; else if (x.r + x.rs > at) x.rs += k; }
    const srcR = src >= at ? src + k : src;
    const ref = M.rows[Math.min(src, M.nr - 1)];
    const fresh = Array.from({ length: k }, () => { const tr = document.createElement('tr'); if (ref && ref.style.height) tr.style.height = ref.style.height; return tr; });
    M.rows.splice(at, 0, ...fresh);
    M.nr += k;
    const occ = this.occupancy(M);
    const banded = tbl.classList.contains('band');
    for (let rn = at; rn < at + k; rn++) for (let c = 0; c < M.nc; c++) {
      if (occ[rn][c]) continue;
      const s = occ[srcR] && occ[srcR][c];
      let cs = 1;
      if (s && s.c === c) { cs = s.cs; for (let j = c; j < c + cs; j++) if (j >= M.nc || occ[rn][j]) { cs = 1; break; } }
      const x = { el: s ? this.cloneCell(s.el, { bg: !banded, tag: s.el.tagName === 'TH' && rn < srcR ? 'th' : 'td' }) : this.newCell(), r: rn, c, rs: 1, cs };
      M.cells.push(x);
      for (let j = c; j < c + cs; j++) occ[rn][j] = x;
    }
    this.rebuild(M);
    return fresh;
  },
  /* k new columns before grid column `at`, formatted like column `src` */
  insertColsAt(tbl, at, k, src) {
    const M = this.model(tbl);
    const copies = Array.from({ length: k }, (_, i) => M.widths[clamp(src + (src >= at ? i : -i), 0, M.nc - 1)] || M.widths[clamp(src, 0, M.nc - 1)]);
    for (const x of M.cells) { if (x.c >= at) x.c += k; else if (x.c + x.cs > at) x.cs += k; }
    const srcC = src >= at ? src + k : src;
    M.widths.splice(at, 0, ...copies);
    M.nc += k;
    const occ = this.occupancy(M);
    for (let cn = at; cn < at + k; cn++) for (let r = 0; r < M.nr; r++) {
      if (occ[r][cn]) continue;
      const s = occ[r][srcC];
      let rs = 1;
      if (s && s.r === r) { rs = s.rs; for (let i = r; i < r + rs; i++) if (i >= M.nr || occ[i][cn]) { rs = 1; break; } }
      const x = { el: s ? this.cloneCell(s.el) : this.newCell(), r, c: cn, rs, cs: 1 };
      M.cells.push(x);
      for (let i = r; i < r + rs; i++) occ[i][cn] = x;
    }
    this.rebuild(M);
  },
  insertRow(below, opts = {}) {
    const s = this.selRect(); if (!s) return;
    const { tbl, R } = s;
    const k = opts.one ? 1 : R.r2 - R.r1 + 1;
    change(() => {
      const fresh = this.insertRowsAt(tbl, below ? R.r2 + 1 : R.r1, k, below ? R.r2 : R.r1);
      this.sel = null; this.refreshHL();
      const first = opts.moveCaret && fresh[0] && fresh[0].cells[0];
      if (first) caretAtStart(first);
    }, { full: true });
  },
  insertCol(right) {
    const s = this.selRect(); if (!s) return;
    const { tbl, R } = s;
    change(() => { this.insertColsAt(tbl, right ? R.c2 + 1 : R.c1, R.c2 - R.c1 + 1, right ? R.c2 : R.c1); this.sel = null; this.refreshHL(); }, { full: true });
  },
  /* Insert Cells dialog: shift right / shift down / whole rows / whole columns */
  insertCells(mode) {
    const s = this.selRect(); if (!s) return;
    const { tbl, R } = s;
    if (mode === 'row') return this.insertRow(false);
    if (mode === 'col') return this.insertCol(false);
    const M = this.model(tbl);
    const h0 = R.r2 - R.r1 + 1, k = R.c2 - R.c1 + 1;
    if (mode === 'down') {
      const moving = M.cells.filter(x => x.c + x.cs - 1 >= R.c1 && x.c <= R.c2 && x.r + x.rs - 1 >= R.r1);
      if (moving.some(x => x.c < R.c1 || x.c + x.cs - 1 > R.c2 || x.r < R.r1)) { toast('Merged cells below the selection reach into other columns, so whole rows were inserted instead.'); return this.insertRow(false); }
      change(() => {
        for (const x of moving) x.r += h0;
        for (let i = 0; i < h0; i++) M.rows.push(document.createElement('tr'));
        M.nr += h0;
        this.rebuild(M, { fill: (r, c, occ) => { const a = occ[r + h0] && occ[r + h0][c]; return r >= R.r1 && r <= R.r2 && c >= R.c1 && c <= R.c2 && a ? this.cloneCell(a.el) : null; } });
        this.sel = null; this.refreshHL();
      }, { full: true });
      return;
    }
    // shift right: new columns at the selection; other rows widen the cell beside them
    change(() => {
      M.widths.splice(R.c1, 0, ...M.widths.slice(R.c1, R.c2 + 1));
      for (const x of M.cells) { if (x.c >= R.c1) x.c += k; else if (x.c + x.cs > R.c1) x.cs += k; }
      M.nc += k;
      let occ = this.occupancy(M);
      const grown = new Set();
      for (let r = 0; r < M.nr; r++) {
        if (r >= R.r1 && r <= R.r2) continue;
        if (occ[r][R.c1]) continue;
        const left = R.c1 > 0 ? occ[r][R.c1 - 1] : null, right = occ[r][R.c1 + k];
        const fits = x => x && (x.r + x.rs - 1 < R.r1 || x.r > R.r2);
        if (fits(left) && !grown.has(left)) { left.cs += k; grown.add(left); }
        else if (!left && fits(right) && !grown.has(right)) { right.c -= k; right.cs += k; grown.add(right); }
        occ = this.occupancy(M);
      }
      this.rebuild(M, { fill: (r, c, occ2) => { const a = occ2[r][c + k]; return a ? this.cloneCell(a.el) : null; } });
      this.sel = null; this.refreshHL();
    }, { full: true });
  },

  /* ---------- delete ---------- */
  deleteRow() {
    const cells = this.selectedCells();
    const cell = cells[0] || this.cellAtCaret(); if (!cell) return;
    change(() => {
      const tbl = cell.closest('table');
      let G = this.grid(tbl);
      let r1 = Infinity, r2 = -1;
      for (const c of (cells.length ? cells : [cell])) { const p = this.pos(G, c); r1 = Math.min(r1, p.r); r2 = Math.max(r2, p.r + (c.rowSpan || 1) - 1); }
      const count = r2 - r1 + 1;
      if (count >= G.rows.length) { this.removeTable(tbl); return; }
      for (let k = 0; k < count; k++) { this.deleteOneRow(tbl, r1); }
      G = this.grid(tbl);
      const row = G.rows[Math.min(r1, G.rows.length - 1)];
      if (row && row.cells[0]) caretAtStart(row.cells[0]);
      this.sel = null;
      this.markEdges(tbl);
    }, { full: true });
  },
  deleteOneRow(tbl, r) {
    const G = this.grid(tbl);
    const row = G.rows[r];
    const done = new Set();
    for (let c = 0; c < G.ncols; c++) {
      const e = G.g[r][c];
      if (!e || done.has(e.cell)) continue;
      done.add(e.cell);
      const cl = e.cell, rs = cl.rowSpan || 1;
      if (e.r0 < r) cl.rowSpan = rs - 1;
      else if (rs > 1 && G.rows[r + 1]) {
        const next = G.rows[r + 1];
        cl.rowSpan = rs - 1;
        let ref = null;
        for (let cc = e.c0 + (cl.colSpan || 1); cc < G.ncols; cc++) { const ne = G.g[r + 1][cc]; if (ne && ne.r0 === r + 1 && ne.c0 === cc) { ref = ne.cell; break; } }
        next.insertBefore(cl, ref);
      }
    }
    const prev = row.previousElementSibling;
    if (prev && prev.classList.contains('pg-spacer')) prev.remove();
    row.remove();
  },
  deleteCol() {
    const cells = this.selectedCells();
    const cell = cells[0] || this.cellAtCaret(); if (!cell) return;
    change(() => {
      const tbl = cell.closest('table');
      const G = this.grid(tbl);
      let c1 = Infinity, c2 = -1;
      for (const c of (cells.length ? cells : [cell])) { const p = this.pos(G, c); c1 = Math.min(c1, p.c); c2 = Math.max(c2, p.c + (c.colSpan || 1) - 1); }
      if (c2 - c1 + 1 >= G.ncols) { this.removeTable(tbl); return; }
      for (let k = c2; k >= c1; k--) {
        const Gk = this.grid(tbl);
        const done = new Set();
        Gk.rows.forEach((row, r) => {
          const e = Gk.g[r][k];
          if (!e || done.has(e.cell)) return;
          done.add(e.cell);
          if ((e.cell.colSpan || 1) > 1) e.cell.colSpan -= 1; else e.cell.remove();
        });
        const cg = tbl.querySelector(':scope > colgroup');
        if (cg && cg.children[k]) cg.children[k].remove();
      }
      this.normalizeColWidths(tbl);
      Array.from(tbl.rows).forEach(r => { if (!r.cells.length && !r.classList.contains('pg-spacer')) r.remove(); });
      const c0 = tbl.rows[0] && tbl.rows[0].cells[0];
      if (c0) caretAtStart(c0);
      this.sel = null;
      this.markEdges(tbl);
    }, { full: true });
  },
  normalizeColWidths(tbl) {
    const cg = tbl.querySelector(':scope > colgroup');
    if (!cg) return;
    const cols = Array.from(cg.children);
    const pct = cols.every(c => /%$/.test(c.style.width));
    if (pct) {
      const sum = cols.reduce((s, c) => s + parseFloat(c.style.width), 0) || 100;
      cols.forEach(c => c.style.width = fmtNum(parseFloat(c.style.width) * 100 / sum, 3) + '%');
    } else {
      const total = cols.reduce((s, c) => s + (parseFloat(c.style.width) || 0), 0);
      if (total) tbl.style.width = fmtNum(total, 1) + 'px';
    }
  },
  /* Delete Cells dialog: shift left / shift up / whole rows / whole columns */
  deleteCells(mode) {
    const s = this.selRect(); if (!s) return;
    const { tbl, R } = s;
    if (mode === 'row') return this.deleteRow();
    if (mode === 'col') return this.deleteCol();
    const M = this.model(tbl);
    const h0 = R.r2 - R.r1 + 1, k = R.c2 - R.c1 + 1;
    const inSel = x => x.r >= R.r1 && x.r + x.rs - 1 <= R.r2 && x.c >= R.c1 && x.c + x.cs - 1 <= R.c2;
    if (mode === 'up') {
      const moving = M.cells.filter(x => !inSel(x) && x.c + x.cs - 1 >= R.c1 && x.c <= R.c2 && x.r > R.r2);
      if (moving.some(x => x.c < R.c1 || x.c + x.cs - 1 > R.c2)) { toast('Merged cells below the selection reach into other columns, so the cells can’t shift up.'); return; }
      change(() => {
        const gone = M.cells.filter(inSel);
        M.cells = M.cells.filter(x => !inSel(x));
        gone.forEach(x => x.el.remove());
        for (const x of moving) x.r -= h0;
        this.rebuild(M);
        this.sel = null; this.refreshHL();
        const at = M.cells.find(x => x.r === R.r1 && x.c === R.c1);
        if (at) caretAtStart(at.el);
      }, { full: true });
      return;
    }
    const moving = M.cells.filter(x => !inSel(x) && x.r + x.rs - 1 >= R.r1 && x.r <= R.r2 && x.c > R.c2);
    if (moving.some(x => x.r < R.r1 || x.r + x.rs - 1 > R.r2)) { toast('Merged cells beside the selection reach into other rows, so the cells can’t shift left.'); return; }
    change(() => {
      const gone = M.cells.filter(inSel);
      M.cells = M.cells.filter(x => !inSel(x));
      gone.forEach(x => x.el.remove());
      for (const x of moving) x.c -= k;
      this.rebuild(M);
      this.sel = null; this.refreshHL();
      const at = M.cells.find(x => x.r === R.r1 && x.c === R.c1);
      if (at) caretAtStart(at.el);
    }, { full: true });
  },
  removeTable(tbl) {
    const next = tbl.nextElementSibling || tbl.previousElementSibling;
    tbl.remove();
    if (!S.editor.firstElementChild) S.editor.appendChild(h('p', null, h('br')));
    if (next) caretAtStart(next); else caretAtStart(S.editor.firstElementChild);
    this.sel = null;
    this.refreshHL();
  },
  deleteTable() { const tbl = this.tableAtCaret(); if (!tbl) return; change(() => this.removeTable(tbl), { full: true }); },
  selectedCells() {
    if (this.sel && this.sel.table.isConnected) {
      const G = this.grid(this.sel.table);
      const out = new Set();
      for (let r = this.sel.r1; r <= this.sel.r2; r++) for (let c = this.sel.c1; c <= this.sel.c2; c++) { const e = G.g[r] && G.g[r][c]; if (e) out.add(e.cell); }
      return [...out];
    }
    const r = getRange();
    if (r && !r.collapsed) {
      const tbl = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode).closest('table');
      if (tbl && S.editor.contains(tbl)) return Array.from(tbl.querySelectorAll('td, th')).filter(td => r.intersectsNode(td) && td.closest('table') === tbl && !td.closest('tr.pg-spacer'));
    }
    const c = this.cellAtCaret();
    return c ? [c] : [];
  },
  expandRect(G, r1, c1, r2, c2) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        const e = G.g[r] && G.g[r][c]; if (!e) continue;
        const er2 = e.r0 + (e.cell.rowSpan || 1) - 1, ec2 = e.c0 + (e.cell.colSpan || 1) - 1;
        if (e.r0 < r1) { r1 = e.r0; changed = true; }
        if (e.c0 < c1) { c1 = e.c0; changed = true; }
        if (er2 > r2) { const n = Math.min(er2, G.rows.length - 1); if (n > r2) { r2 = n; changed = true; } }
        if (ec2 > c2) { c2 = ec2; changed = true; }
      }
    }
    return { r1, c1, r2, c2 };
  },

  /* ---------- merge & split ---------- */
  merge() {
    const cells = this.selectedCells();
    if (cells.length < 2) { toast('Select two or more cells to merge (drag across them).'); return; }
    const tbl = cells[0].closest('table');
    change(() => {
      const tl = this.mergeCore(tbl, cells);
      this.sel = null;
      this.refreshHL();
      caretAtStart(tl);
    }, { full: true });
  },
  mergeCore(tbl, cells) {
    const G = this.grid(tbl);
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for (const c of cells) { const p = this.pos(G, c); if (!p) continue; r1 = Math.min(r1, p.r); c1 = Math.min(c1, p.c); r2 = Math.max(r2, p.r + (c.rowSpan || 1) - 1); c2 = Math.max(c2, p.c + (c.colSpan || 1) - 1); }
    ({ r1, c1, r2, c2 } = this.expandRect(G, r1, c1, Math.min(r2, G.rows.length - 1), c2));
    const tl = G.g[r1][c1].cell;
    const seen = new Set([tl]);
    const blankP = n => n.nodeType === 1 && n.tagName === 'P' && !n.textContent.replace(/\u200B/g, '').trim() && !n.querySelector('img, table, hr');
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const e = G.g[r][c]; if (!e || seen.has(e.cell)) continue;
      seen.add(e.cell);
      const kids = Array.from(e.cell.childNodes).filter(n => !blankP(n) && !(n.nodeType === 3 && !n.data.trim()));
      if (kids.length) { if (Array.from(tl.childNodes).every(n => blankP(n) || (n.nodeType === 3 && !n.data.trim()))) tl.innerHTML = ''; tl.append(...kids); }
      e.cell.remove();
    }
    tl.colSpan = c2 - c1 + 1;
    tl.rowSpan = r2 - r1 + 1;
    if (tl.colSpan === 1) tl.removeAttribute('colspan');
    if (tl.rowSpan === 1) tl.removeAttribute('rowspan');
    // rows left without cells collapse into the rowspan
    for (const row of G.rows) {
      if (!row.isConnected || row.cells.length) continue;
      const Gx = this.grid(tbl);
      const idx = Gx.rows.indexOf(row);
      const done = new Set();
      if (idx >= 0) for (let c = 0; c < Gx.ncols; c++) { const e = Gx.g[idx][c]; if (e && !done.has(e.cell) && e.r0 < idx) { done.add(e.cell); e.cell.rowSpan = Math.max(1, (e.cell.rowSpan || 1) - 1); } }
      row.remove();
    }
    this.markEdges(tbl);
    return tl;
  },
  /* split one cell of the model into nc columns and nr rows */
  splitInModel(M, x, nc, nr) {
    let colB;
    if (x.cs % nc === 0) { const k = x.cs / nc; colB = Array.from({ length: nc + 1 }, (_, i) => x.c + i * k); }
    else {
      const W = M.widths.slice(x.c, x.c + x.cs).reduce((a, b) => a + b, 0);
      colB = [x.c];
      for (let i = 1; i < nc; i++) {
        const t = W * i / nc;
        let acc = 0, j = x.c;
        while (j < x.c + x.cs - 1 && acc + M.widths[j] <= t + 0.5) { acc += M.widths[j]; j++; }
        if (Math.abs(acc - t) <= 1 && j > colB[colB.length - 1]) { colB.push(j); continue; }
        this.splitGridCol(M, j, clamp((t - acc) / M.widths[j], 0.02, 0.98));
        colB.push(j + 1);
      }
      colB.push(x.c + x.cs);
    }
    let rowB;
    if (x.rs > 1 && x.rs % nr) nr = 1; // only a divisor of the rows it spans (checked by the dialog)
    if (x.rs % nr === 0) { const k = x.rs / nr; rowB = Array.from({ length: nr + 1 }, (_, i) => x.r + i * k); }
    else {
      for (let i = 1; i < nr; i++) this.splitGridRow(M, x.r + i - 1);
      rowB = Array.from({ length: nr + 1 }, (_, i) => x.r + i);
    }
    const subs = [];
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
      const s = i === 0 && j === 0 ? x : { el: this.cloneCell(x.el) };
      Object.assign(s, { r: rowB[i], rs: rowB[i + 1] - rowB[i], c: colB[j], cs: colB[j + 1] - colB[j] });
      if (s !== x) M.cells.push(s);
      subs.push(s);
    }
    // a cell with a few paragraphs gives one to each new cell (as after a merge)
    const blocks = Array.from(x.el.children).filter(k => isBlockEl(k));
    if (subs.length > 1 && blocks.length > 1 && blocks.length <= subs.length) blocks.forEach((b, i) => { if (i) { subs[i].el.innerHTML = ''; subs[i].el.appendChild(b); } });
    return subs;
  },
  /* why the rows can't be split that way, or null */
  splitRowsProblem(cells, nr, merged) {
    if (!cells.length) return 'Click in a table cell first.';
    if (merged) {
      const tbl = cells[0].closest('table'), R = Borders.rectOf(tbl, cells);
      const n = R ? R.r2 - R.r1 + 1 : 1;
      return n > 1 && n % nr ? `The selected cells span ${n} rows, so they can be split into ${divisors(n).join(', ')} rows.` : null;
    }
    for (const c of cells) { const n = c.rowSpan || 1; if (n > 1 && n % nr) return `A selected cell spans ${n} rows, so it can be split into ${divisors(n).join(', ')} rows.`; }
    return null;
  },
  splitCells(nc, nr, mergeFirst) {
    let cells = this.selectedCells();
    if (!cells.length) { toast('Click in a table cell first.'); return; }
    const tbl = cells[0].closest('table');
    nc = clamp(nc | 0, 1, 63); nr = clamp(nr | 0, 1, 99);
    change(() => {
      if (mergeFirst && cells.length > 1) cells = [this.mergeCore(tbl, cells)];
      const M = this.model(tbl);
      let first = null;
      for (const el of cells) { const x = M.cells.find(c => c.el === el); if (x) { const subs = this.splitInModel(M, x, nc, nr); if (!first) first = subs[0].el; } }
      this.rebuild(M);
      this.sel = null;
      this.refreshHL();
      if (first) caretAtStart(first);
    }, { full: true });
  },
  /* the old Split button: a merged cell goes back to its grid cells */
  split() {
    const cell = this.cellAtCaret();
    if (cell && ((cell.colSpan || 1) > 1 || (cell.rowSpan || 1) > 1) && !(this.sel && this.selectedCells().length > 1)) { this.splitCells(cell.colSpan || 1, cell.rowSpan || 1, false); return; }
    Dialogs.splitCells();
  },
  /* Split Table: the caret's row and the rows below become a table of their own */
  splitTable() {
    const cell = this.cellAtCaret() || this.selectedCells()[0];
    if (!cell) { toast('Click in the row that should start the new table.'); return; }
    const tbl = cell.closest('table');
    change(() => {
      const M = this.model(tbl);
      const x0 = M.cells.find(c => c.el === cell);
      const R0 = x0 ? x0.r : 0;
      if (R0 === 0) { const p = h('p', null, h('br')); tbl.before(p); caretAtStart(p); this.sel = null; this.refreshHL(); return; }
      for (const x of M.cells.slice()) if (x.r < R0 && x.r + x.rs > R0) { M.cells.push({ el: this.cloneCell(x.el), r: R0, c: x.c, rs: x.r + x.rs - R0, cs: x.cs }); x.rs = R0 - x.r; }
      const t2 = tbl.cloneNode(false);
      const cg = tbl.querySelector(':scope > colgroup');
      if (cg) t2.appendChild(cg.cloneNode(true));
      const tb2 = document.createElement('tbody');
      t2.appendChild(tb2);
      const rows2 = M.rows.slice(R0);
      for (const tr of rows2) tb2.appendChild(tr);
      const gap = h('p', null, h('br'));
      tbl.after(gap);
      gap.after(t2);
      const M1 = { tbl, rows: M.rows.slice(0, R0), nr: R0, nc: M.nc, widths: M.widths.slice(), cells: M.cells.filter(x => x.r < R0) };
      const M2 = { tbl: t2, rows: rows2, nr: M.nr - R0, nc: M.nc, widths: M.widths.slice(), cells: M.cells.filter(x => x.r >= R0).map(x => Object.assign(x, { r: x.r - R0 })) };
      this.rebuild(M1);
      this.rebuild(M2);
      this.sel = null;
      this.refreshHL();
      caretAtStart(gap);
    }, { full: true });
  },

  /* ---------- size, style (selecting is in 15b-cellsel.js) ---------- */
  distributeRows() {
    const s = this.selRect(); if (!s) return;
    const { tbl } = s;
    const G = this.grid(tbl);
    let { r1, r2 } = s.R;
    if (r1 === r2) { r1 = 0; r2 = G.rows.length - 1; }
    const rows = G.rows.slice(r1, r2 + 1);
    if (rows.length < 2) return;
    const z = S.zoom || 1;
    const avg = rows.reduce((a, tr) => a + tr.getBoundingClientRect().height / z, 0) / rows.length;
    change(() => rows.forEach(tr => { tr.style.height = fmtNum(avg * 0.75, 1) + 'pt'; }), { full: true });
  },
  setStyle(id) {
    const tbl = this.tableAtCaret(); if (!tbl) return;
    const p = TABLE_PRESETS.find(x => x.id === id); if (!p) return;
    change(() => {
      Array.from(tbl.classList).filter(c => /^tbl-|^hdr$|^band$/.test(c)).forEach(c => tbl.classList.remove(c));
      ['--bt', '--bb', '--bl', '--br', '--bh', '--bv'].forEach(k => tbl.style.removeProperty(k));
      p.cls.split(' ').forEach(c => tbl.classList.add(c));
    });
  },
  toggleClass(cls) { const tbl = this.tableAtCaret(); if (!tbl) return; change(() => tbl.classList.toggle(cls)); },
  setBorders(kind) { Borders.quick(kind === 'outside' ? 'outside' : kind); },
  setVAlign(v) { const cells = this.selectedCells(); if (!cells.length) return; change(() => cells.forEach(c => c.style.verticalAlign = v === 'top' ? '' : v)); },
  shade(color) {
    const cells = this.selectedCells(); if (!cells.length) return;
    change(() => cells.forEach(c => { Borders.shade(c, color ? { fill: color, pat: 'clear' } : null); if (!c.getAttribute('style')) c.removeAttribute('style'); }));
  },
  distribute() {
    const tbl = this.tableAtCaret(); if (!tbl) return;
    change(() => {
      const G = this.grid(tbl);
      let cg = tbl.querySelector(':scope > colgroup');
      if (!cg) { cg = document.createElement('colgroup'); tbl.insertBefore(cg, tbl.firstChild); }
      cg.innerHTML = '';
      for (let c = 0; c < G.ncols; c++) cg.appendChild(h('col', { style: `width:${fmtNum(100 / G.ncols, 3)}%` }));
      tbl.style.width = '100%';
      tbl.style.tableLayout = '';
      tbl.setAttribute('data-fit', 'window');
    });
  },
  /* AutoFit, as in Word:
     'contents' — each column is as wide as its text needs (the table grows as you type, up to the page);
     'window'   — the table spans the page and the columns keep their proportions;
     'fixed'    — the columns keep the widths they have now. */
  fitMode(tbl) {
    if (!tbl) return null;
    const m = tbl.getAttribute('data-fit');
    if (m === 'contents' || m === 'window' || m === 'fixed') return m;
    if (!tbl.querySelector(':scope > colgroup') && tbl.style.tableLayout === 'auto') return 'contents';
    return /%$/.test(tbl.style.width || '') ? 'window' : 'fixed';
  },
  autofit(mode) {
    const tbl = this.tableAtCaret(); if (!tbl) return;
    change(() => this.applyFit(tbl, mode), { full: true });
    const msg = { contents: 'Columns now fit their contents.', window: 'The table now spans the page.', fixed: 'Column widths are fixed.' }[mode];
    if (msg) toast(msg);
  },
  applyFit(tbl, mode) {
    if (mode === 'contents') {
      const cg = tbl.querySelector(':scope > colgroup');
      if (cg) cg.remove();
      tbl.style.width = '';
      tbl.style.tableLayout = 'auto';
      for (const c of tbl.querySelectorAll('td, th')) if (c.closest('table') === tbl && c.style.width) c.style.width = '';
    } else if (mode === 'window') {
      this.toPercent(tbl);
      tbl.style.width = '100%';
      tbl.style.tableLayout = '';
    } else {
      // freeze what is on the page now
      const ws = this.measureCols(tbl);
      let cg = tbl.querySelector(':scope > colgroup');
      if (!cg) { cg = document.createElement('colgroup'); tbl.insertBefore(cg, tbl.firstChild); }
      cg.innerHTML = '';
      ws.forEach(w => cg.appendChild(h('col', { style: `width:${fmtNum(w, 1)}px` })));
      tbl.style.width = fmtNum(ws.reduce((a, b) => a + b, 0), 1) + 'px';
      tbl.style.tableLayout = '';
    }
    tbl.setAttribute('data-fit', mode);
  },
  toPercent(tbl) {
    const ws = this.measureCols(tbl);
    const sum = ws.reduce((a, b) => a + b, 0) || 1;
    let cg = tbl.querySelector(':scope > colgroup');
    if (!cg) { cg = document.createElement('colgroup'); tbl.insertBefore(cg, tbl.firstChild); }
    cg.innerHTML = '';
    ws.forEach(w => cg.appendChild(h('col', { style: `width:${fmtNum(w * 100 / sum, 3)}%` })));
  },
  measureCols(tbl) {
    const G = this.grid(tbl);
    const ws = new Array(G.ncols).fill(0);
    const cg = tbl.querySelector(':scope > colgroup');
    if (cg && cg.children.length === G.ncols) {
      const tw = tbl.offsetWidth;
      return Array.from(cg.children).map(c => { const w = c.style.width; return /%$/.test(w) ? parseFloat(w) / 100 * tw : (parseFloat(w) || c.offsetWidth || tw / G.ncols); });
    }
    for (let r = 0; r < G.rows.length; r++) for (let c = 0; c < G.ncols; c++) { const e = G.g[r][c]; if (e && (e.cell.colSpan || 1) === 1 && !ws[c]) ws[c] = e.cell.offsetWidth; }
    const avg = (tbl.offsetWidth || 600) / Math.max(1, G.ncols);
    return ws.map(w => w || avg);
  },
  /* Tab moves between cells; Tab in the last cell adds a row */
  onTab(e) {
    const cell = this.cellAtCaret();
    if (!cell) return false;
    e.preventDefault();
    const tbl = cell.closest('table');
    const cells = Array.from(tbl.querySelectorAll('td, th')).filter(c => c.closest('table') === tbl && !c.closest('tr.pg-spacer'));
    const i = cells.indexOf(cell);
    let next = e.shiftKey ? cells[i - 1] : cells[i + 1];
    if (!next && !e.shiftKey) { this.sel = null; this.insertRow(true, { one: true, moveCaret: true }); return true; }
    if (next) selectNodeContents(next.querySelector('p') || next);
    return true;
  },
  /* dashed lines where a table has no border, so its cells can be seen (View Gridlines) */
  gridlines() {
    const ov = $('#overlay');
    if (!ov || !S.editor) return;
    let svg = ov.querySelector(':scope > svg.gridlines');
    // preset tables draw every line already, unless cells changed their borders
    const tables = Array.from(S.editor.querySelectorAll('table')).filter(t => !t.classList.contains('tbl-plain') && (t.classList.contains('tbl-bd') || t.classList.contains('tbl-lines') || t.style.border || t.querySelector('td[style*="border"], th[style*="border"]')));
    if (Prefs.gridlines === false || !tables.length || S.view === 'read') { if (svg) svg.remove(); return; }
    const pr = $('#paper').getBoundingClientRect(), z = S.zoom || 1;
    const X = v => fmtNum((v - pr.left) / z, 2), Y = v => fmtNum((v - pr.top) / z, 2);
    let d = '';
    const seg = (x1, y1, x2, y2) => { if (Math.abs(x2 - x1) + Math.abs(y2 - y1) < 1) return; d += `M${X(x1)} ${Y(y1)}L${X(x2)} ${Y(y2)}`; };
    const vis = (cs, side) => { const st = cs['border' + side + 'Style']; return st !== 'none' && st !== 'hidden' && parseFloat(cs['border' + side + 'Width']) > 0 && colorAlpha(cs['border' + side + 'Color']) > 0.05; };
    for (const tbl of tables) {
      if (!tbl.getClientRects().length) continue;
      const G = this.grid(tbl), cells = this.cells(G);
      if (!cells.length) continue;
      const info = new Map();
      for (const x of cells) info.set(x.el, { x, cs: getComputedStyle(x.el), rc: Grid.place(x.el, x.el.getBoundingClientRect()) });
      const tcs = getComputedStyle(tbl);
      const at = (r, c) => { const e = G.g[r] && G.g[r][c]; return e ? info.get(e.cell) : null; };
      for (const { x, cs, rc } of info.values()) {
        if (x.r === 0 && !vis(cs, 'Top') && !vis(tcs, 'Top')) seg(rc.left, rc.top, rc.right, rc.top);
        if (x.c === 0 && !vis(cs, 'Left') && !vis(tcs, 'Left')) seg(rc.left, rc.top, rc.left, rc.bottom);
        const below = new Set();
        for (let c = x.c; c < x.c + x.cs; c++) { const n = at(x.r + x.rs, c); if (n) below.add(n); }
        if (!below.size) { if (!vis(cs, 'Bottom') && !vis(tcs, 'Bottom')) seg(rc.left, rc.bottom, rc.right, rc.bottom); }
        else for (const n of below) {
          const a = Math.max(rc.left, n.rc.left), b = Math.min(rc.right, n.rc.right);
          if (b <= a) continue;
          const apart = n.rc.top - rc.bottom > 2;
          if (!apart) { if (!vis(cs, 'Bottom') && !vis(n.cs, 'Top')) seg(a, rc.bottom, b, rc.bottom); }
          else { if (!vis(cs, 'Bottom')) seg(a, rc.bottom, b, rc.bottom); if (!vis(n.cs, 'Top')) seg(a, n.rc.top, b, n.rc.top); }
        }
        const right = new Set();
        for (let r = x.r; r < x.r + x.rs; r++) { const n = at(r, x.c + x.cs); if (n) right.add(n); }
        if (!right.size) { if (!vis(cs, 'Right') && !vis(tcs, 'Right')) seg(rc.right, rc.top, rc.right, rc.bottom); }
        else for (const n of right) {
          const a = Math.max(rc.top, n.rc.top), b = Math.min(rc.bottom, n.rc.bottom);
          if (b > a && !vis(cs, 'Right') && !vis(n.cs, 'Left')) seg(rc.right, a, rc.right, b);
        }
      }
    }
    if (!d) { if (svg) svg.remove(); return; }
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'gridlines'); svg.setAttribute('aria-hidden', 'true'); svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path')); ov.prepend(svg); }
    svg.firstChild.setAttribute('d', d);
  },
  /* Drag a column border to resize */
  resizeHit(e) {
    const t = e.target.closest && e.target.closest('td, th');
    if (!t || S.readOnly) return false;
    const r = t.getBoundingClientRect();
    const nearRight = Math.abs(e.clientX - r.right) <= 4;
    const nearLeft = Math.abs(e.clientX - r.left) < 3 && t.cellIndex > 0;
    if (!nearRight && !nearLeft) return false;
    const tbl = t.closest('table');
    const G = this.grid(tbl);
    const p = this.pos(G, t);
    const boundary = nearRight ? p.c + (t.colSpan || 1) : p.c;
    if (boundary <= 0 || boundary >= G.ncols + (nearRight ? 1 : 0)) { if (boundary !== G.ncols) return false; }
    e.preventDefault();
    const ws = this.measureCols(tbl);
    const startX = e.clientX;
    const guide = h('div', { class: 'col-guide' });
    $('#overlay').appendChild(guide);
    const pr = $('#paper').getBoundingClientRect();
    const tr = tbl.getBoundingClientRect();
    guide.style.top = (tr.top - pr.top) / S.zoom + 'px';
    guide.style.height = tr.height / S.zoom + 'px';
    let dx = 0;
    const move = ev => { dx = (ev.clientX - startX) / S.zoom; guide.style.left = ((nearRight ? r.right : r.left) - pr.left) / S.zoom + dx + 'px'; };
    move(e);
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      guide.remove();
      if (Math.abs(dx) < 1) return;
      change(() => {
        const left = boundary - 1, right = boundary;
        if (right < ws.length) {
          const tot = ws[left] + ws[right];
          ws[left] = clamp(ws[left] + dx, 18, tot - 18);
          ws[right] = tot - ws[left];
        } else ws[left] = Math.max(18, ws[left] + dx);
        let cg = tbl.querySelector(':scope > colgroup');
        if (!cg) { cg = document.createElement('colgroup'); tbl.insertBefore(cg, tbl.firstChild); }
        cg.innerHTML = '';
        ws.forEach(w => cg.appendChild(h('col', { style: `width:${fmtNum(w, 1)}px` })));
        tbl.style.width = fmtNum(ws.reduce((a, b) => a + b, 0), 1) + 'px';
        tbl.style.tableLayout = '';
        tbl.setAttribute('data-fit', 'fixed');
      }, { full: true });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return true;
  },
};
function divisors(n) { const out = []; for (let i = 1; i <= n; i++) if (n % i === 0) out.push(i); return out; }
