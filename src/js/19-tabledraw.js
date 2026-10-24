/* ===================== Draw Table, Eraser, Border Painter =====================
   With the pencil, drag a box to draw a table; inside a table, draw a line across
   cells to split them, a slanted line in a cell for a diagonal border, or along an
   existing line to give it the pen's style. The eraser removes a line: between two
   cells it merges them, elsewhere the border is taken off. The Border Painter only
   paints lines. Esc or any typing puts the tool away. */
const SVGNS = 'http://www.w3.org/2000/svg';
const TDraw = {
  mode: null, // 'pen' | 'eraser' | 'painter'
  init() {
    const paper = $('#paper');
    paper.addEventListener('pointerdown', e => this.down(e), true);
    document.addEventListener('keydown', e => {
      if (!this.mode || /^(Shift|Control|Alt|Meta|CapsLock)$/.test(e.key)) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
      this.set(null);
    }, true);
  },
  set(mode) {
    this.mode = mode && this.mode !== mode ? mode : null;
    const paper = $('#paper');
    paper.classList.toggle('tdraw-pen', this.mode === 'pen' || this.mode === 'painter');
    paper.classList.toggle('tdraw-eraser', this.mode === 'eraser');
    if (this.mode === 'pen') toast('Draw Table is on: drag to draw a table, draw lines inside one to split cells. Press Esc when you’re done.', { ms: 5000 });
    else if (this.mode === 'eraser') toast('Eraser is on: click a line between cells to merge them, or a border to remove it. Press Esc when you’re done.', { ms: 5000 });
    else if (this.mode === 'painter') toast('Border Painter is on: click or drag along table lines to give them the pen style. Press Esc when you’re done.', { ms: 5000 });
    UI.refresh();
  },
  cellAt(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    const td = el && el.closest && el.closest('td, th');
    return td && S.editor.contains(td) && !td.closest('tr.pg-spacer') ? td : null;
  },
  down(e) {
    if (!this.mode || e.button !== 0) return;
    if (!e.target.closest || !e.target.closest('#paper')) return;
    if (S.readOnly) { this.set(null); return; }
    e.preventDefault();
    e.stopPropagation();
    const ov = $('#overlay');
    const pr = $('#paper').getBoundingClientRect(), z = S.zoom || 1;
    const P = (cx, cy) => [fmtNum((cx - pr.left) / z, 1), fmtNum((cy - pr.top) / z, 1)];
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'tdraw-pv' + (this.mode === 'eraser' ? ' er' : ''));
    ov.appendChild(svg);
    const x0 = e.clientX, y0 = e.clientY;
    let x1 = x0, y1 = y0;
    const path = [[x0, y0]];
    const startCell = this.cellAt(x0, y0);
    const draw = () => {
      const [a, b] = P(x0, y0), [c, d] = P(x1, y1);
      if (this.mode === 'eraser' || this.mode === 'painter') { svg.innerHTML = `<path d="M${path.map(p => P(p[0], p[1]).join(' ')).join('L')}"/>`; return; }
      const k = this.kind(x0, y0, x1, y1);
      if (k === 'h') svg.innerHTML = `<path d="M${a} ${b}L${c} ${b}"/>`;
      else if (k === 'v') svg.innerHTML = `<path d="M${a} ${b}L${a} ${d}"/>`;
      else if (startCell) svg.innerHTML = `<path d="M${a} ${b}L${c} ${d}"/>`;
      else svg.innerHTML = `<rect x="${Math.min(a, c)}" y="${Math.min(b, d)}" width="${Math.abs(c - a)}" height="${Math.abs(d - b)}"/>`;
    };
    const move = ev => { x1 = ev.clientX; y1 = ev.clientY; const l = path[path.length - 1]; if (Math.hypot(x1 - l[0], y1 - l[1]) > 2) path.push([x1, y1]); draw(); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      svg.remove();
      try { this.finish(x0, y0, x1, y1, startCell, path); } catch (err) { console.error(err); toast('That didn’t work on this table.', { error: true }); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    draw();
  },
  kind(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    if (dx < 6 && dy < 6) return 'click';
    if (dy <= dx * 0.27) return 'h';
    if (dx <= dy * 0.27) return 'v';
    return 'diag';
  },
  /* points along the path, every few pixels */
  samples(path) {
    const out = [];
    for (let i = 0; i < path.length; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1] || path[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
    }
    return out;
  },
  finish(x0, y0, x1, y1, startCell, path) {
    const k = this.kind(x0, y0, x1, y1);
    if (this.mode === 'eraser') { this.erase(this.samples(path)); return; }
    if (this.mode === 'painter' || k === 'click') { this.paint(this.samples(path)); return; }
    if (k === 'h' || k === 'v') {
      const y = (y0 + y1) / 2, x = (x0 + x1) / 2;
      const tbl = this.tableOnLine(k, k === 'h' ? y : x, k === 'h' ? Math.min(x0, x1) : Math.min(y0, y1), k === 'h' ? Math.max(x0, x1) : Math.max(y0, y1));
      if (tbl) { if (k === 'h') this.lineH(tbl, y, Math.min(x0, x1), Math.max(x0, x1)); else this.lineV(tbl, x, Math.min(y0, y1), Math.max(y0, y1)); return; }
      if (startCell) return;
    }
    // slanted: a diagonal border inside one cell; anything else outside tables draws a new table
    const endCell = this.cellAt(x1, y1);
    if (startCell) {
      if (startCell === endCell && k === 'diag') change(() => setDiag(startCell, (x1 - x0) * (y1 - y0) > 0 ? 'dd' : 'du', Borders.pen()), { full: true });
      return;
    }
    this.newTable(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
  },
  tableOnLine(k, at, a, b) {
    for (const tbl of S.editor.querySelectorAll('table')) {
      const r = tbl.getBoundingClientRect();
      if (k === 'h' && at >= r.top - 3 && at <= r.bottom + 3 && Math.min(b, r.right) - Math.max(a, r.left) > 8) return this.innermost(tbl, (Math.max(a, r.left) + Math.min(b, r.right)) / 2, at);
      if (k === 'v' && at >= r.left - 3 && at <= r.right + 3 && Math.min(b, r.bottom) - Math.max(a, r.top) > 8) return this.innermost(tbl, at, (Math.max(a, r.top) + Math.min(b, r.bottom)) / 2);
    }
    return null;
  },
  innermost(tbl, cx, cy) { const td = this.cellAt(cx, cy); const t = td && td.closest('table'); return t && tbl.contains(t) ? t : tbl; },
  /* client x of each grid column boundary */
  colEdges(M) {
    const r = M.tbl.getBoundingClientRect();
    const sum = M.widths.reduce((a, b) => a + b, 0) || 1;
    const k = r.width / sum;
    const out = [r.left];
    let acc = 0;
    for (const w of M.widths) { acc += w; out.push(r.left + acc * k); }
    return out;
  },
  /* a horizontal line: split the cells it crosses into two rows */
  lineH(tbl, y, xa, xb) {
    const M = Tables.model(tbl), z = S.zoom || 1, pen = Borders.pen();
    const hits = [], paints = [];
    for (const x of M.cells) {
      const r = x.el.getBoundingClientRect();
      if (Math.min(xb, r.right) - Math.max(xa, r.left) < Math.min(10, r.width * 0.5)) continue;
      if (y > r.top + 5 && y < r.bottom - 5) hits.push(x);
      else if (Math.abs(y - r.top) <= 5) paints.push([x, 'top']);
      else if (Math.abs(y - r.bottom) <= 5) paints.push([x, 'bottom']);
    }
    if (!hits.length) { if (paints.length) change(() => paints.forEach(([x, s]) => Borders.applyCells(tbl, { r1: x.r, c1: x.c, r2: x.r + x.rs - 1, c2: x.c + x.cs - 1 }, { [s]: pen })), { full: true }); return; }
    const rowR = M.rows.map(tr => tr.getBoundingClientRect());
    const plan = new Map(); // boundary row b -> { add, cells, at }
    for (const x of hits) {
      let k = x.r;
      while (k < x.r + x.rs - 1 && rowR[k].bottom <= y) k++;
      let b = k, add = true;
      if (k > x.r && Math.abs(rowR[k].top - y) <= 5) { b = k - 1; add = false; }
      else if (k < x.r + x.rs - 1 && Math.abs(rowR[k].bottom - y) <= 5) { add = false; }
      const p = plan.get(b) || { add: false, cells: [], top: rowR[k].top, bottom: rowR[k].bottom };
      p.add = p.add || add;
      p.cells.push(x);
      plan.set(b, p);
    }
    change(() => {
      for (const b of [...plan.keys()].sort((p, q) => q - p)) {
        const p = plan.get(b);
        if (p.add) {
          const above = M.rows[b];
          const tr = Tables.splitGridRow(M, b);
          const topH = (y - p.top) / z, botH = (p.bottom - y) / z;
          if (topH >= 12) above.style.height = fmtNum(topH * 0.75, 1) + 'pt';
          if (botH >= 12) tr.style.height = fmtNum(botH * 0.75, 1) + 'pt';
        }
        for (const x of p.cells) {
          const end = x.r + x.rs;
          const lower = { el: Tables.cloneCell(x.el), r: b + 1, c: x.c, rs: end - (b + 1), cs: x.cs };
          if (lower.rs < 1) continue;
          x.rs = b + 1 - x.r;
          M.cells.push(lower);
          x.el.style.borderBottom = bdrCss(pen);
          lower.el.style.borderTop = bdrCss(pen);
        }
      }
      Tables.rebuild(M);
      Tables.sel = null; Tables.refreshHL();
      caretAtStart(hits[0].el);
    }, { full: true });
  },
  /* a vertical line: split the cells it crosses into two columns */
  lineV(tbl, xpos, ya, yb) {
    const M = Tables.model(tbl), pen = Borders.pen();
    const hits = [], paints = [];
    for (const x of M.cells) {
      const r = x.el.getBoundingClientRect();
      if (Math.min(yb, r.bottom) - Math.max(ya, r.top) < Math.min(10, r.height * 0.5)) continue;
      if (xpos > r.left + 5 && xpos < r.right - 5) hits.push(x);
      else if (Math.abs(xpos - r.left) <= 5) paints.push([x, 'left']);
      else if (Math.abs(xpos - r.right) <= 5) paints.push([x, 'right']);
    }
    if (!hits.length) { if (paints.length) change(() => paints.forEach(([x, s]) => Borders.applyCells(tbl, { r1: x.r, c1: x.c, r2: x.r + x.rs - 1, c2: x.c + x.cs - 1 }, { [s]: pen })), { full: true }); return; }
    const E = this.colEdges(M);
    const plan = new Map();
    for (const x of hits) {
      let j = x.c;
      while (j < x.c + x.cs - 1 && E[j + 1] <= xpos) j++;
      let b = j, f = (xpos - E[j]) / Math.max(1, E[j + 1] - E[j]), add = true;
      if (j > x.c && Math.abs(E[j] - xpos) <= 5) { b = j - 1; add = false; }
      else if (j < x.c + x.cs - 1 && Math.abs(E[j + 1] - xpos) <= 5) add = false;
      const p = plan.get(b) || { add: false, f, cells: [] };
      p.add = p.add || add;
      p.cells.push(x);
      plan.set(b, p);
    }
    change(() => {
      for (const b of [...plan.keys()].sort((p, q) => q - p)) {
        const p = plan.get(b);
        if (p.add) Tables.splitGridCol(M, b, clamp(p.f, 0.05, 0.95));
        for (const x of p.cells) {
          const end = x.c + x.cs;
          const right = { el: Tables.cloneCell(x.el), r: x.r, c: b + 1, rs: x.rs, cs: end - (b + 1) };
          if (right.cs < 1) continue;
          x.cs = b + 1 - x.c;
          M.cells.push(right);
          x.el.style.borderRight = bdrCss(pen);
          right.el.style.borderLeft = bdrCss(pen);
        }
      }
      Tables.rebuild(M);
      Tables.sel = null; Tables.refreshHL();
      caretAtStart(hits[0].el);
    }, { full: true });
  },
  /* a box outside any table: a one-cell table drawn with the pen */
  newTable(xa, ya, xb, yb) {
    const z = S.zoom || 1;
    const w = (xb - xa) / z, hgt = (yb - ya) / z;
    if (w < 24 || hgt < 12) return;
    const ed = S.editor, er = ed.getBoundingClientRect();
    const padL = parseFloat(getComputedStyle(ed).paddingLeft) || 0, padR = parseFloat(getComputedStyle(ed).paddingRight) || 0;
    const cw = er.width / z - padL - padR;
    const indent = clamp((xa - er.left) / z - padL, 0, Math.max(0, cw - 24));
    const width = Math.min(w, cw - indent);
    const kids = Array.from(ed.children).filter(b => b.nodeType === 1 && !b.matches('span.qm'));
    let ref = null, after = false;
    for (const b of kids) { const r = b.getBoundingClientRect(); if (ya < r.bottom) { ref = b; after = ya > r.top + r.height / 2; break; } }
    if (!ref) { ref = kids[kids.length - 1] || null; after = true; }
    const pen = Borders.pen();
    change(() => {
      const tbl = h('table', { style: `width:${fmtNum(width, 1)}px` + (indent > 3 ? `;margin-left:${fmtNum(indent, 1)}px` : '') });
      tbl.appendChild(h('colgroup', null, h('col', { style: `width:${fmtNum(width, 1)}px` })));
      const cell = Tables.newCell();
      tbl.appendChild(h('tbody', null, h('tr', { style: `height:${fmtNum(hgt * 0.75, 1)}pt` }, cell)));
      Borders.setTableSpec(tbl, { top: pen, bottom: pen, left: pen, right: pen, insideH: pen, insideV: pen });
      if (!ref) ed.appendChild(tbl);
      else if (after) ref.after(tbl); else ref.before(tbl);
      if (!tbl.nextElementSibling) tbl.after(h('p', null, h('br')));
      Tables.markEdges(tbl);
      caretAtStart(cell);
    }, { full: true });
  },
  /* the table line nearest a point: { td, side } or { td, diag } */
  hitEdge(cx, cy) {
    let td = this.cellAt(cx, cy);
    if (!td) for (const [ox, oy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) { td = this.cellAt(cx + ox, cy + oy); if (td) break; }
    if (!td) return null;
    const r = td.getBoundingClientRect(), tol = 5;
    const d = { Top: Math.abs(cy - r.top), Bottom: Math.abs(cy - r.bottom), Left: Math.abs(cx - r.left), Right: Math.abs(cx - r.right) };
    const side = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
    if (d[side] <= tol && cx >= r.left - tol && cx <= r.right + tol && cy >= r.top - tol && cy <= r.bottom + tol) return { td, side };
    const len = Math.hypot(r.width, r.height) || 1;
    const dd = Math.abs((cy - r.top) * r.width - (cx - r.left) * r.height) / len;
    const du = Math.abs((cy - r.top) * r.width - (r.right - cx) * r.height) / len;
    if (td.hasAttribute('data-dd') && dd <= tol) return { td, diag: 'dd' };
    if (td.hasAttribute('data-du') && du <= tol) return { td, diag: 'du' };
    return null;
  },
  edgesOn(points) {
    const out = new Map();
    for (const [cx, cy] of points) {
      const e = this.hitEdge(cx, cy);
      if (!e) continue;
      const key = e.diag ? e.diag : e.side;
      if (!out.has(e.td)) out.set(e.td, new Map());
      if (!out.get(e.td).has(key)) out.get(e.td).set(key, { ...e, cx, cy });
    }
    return [...out.values()].flatMap(m => [...m.values()]);
  },
  paint(points) {
    const hits = this.edgesOn(points).filter(e => !e.diag);
    if (!hits.length) return;
    const pen = Borders.pen();
    change(() => {
      for (const e of hits) {
        if (!e.td.isConnected) continue;
        const tbl = e.td.closest('table'), G = Tables.grid(tbl), p = Tables.pos(G, e.td);
        if (!p) continue;
        Borders.applyCells(tbl, { r1: p.r, c1: p.c, r2: p.r + (e.td.rowSpan || 1) - 1, c2: p.c + (e.td.colSpan || 1) - 1 }, { [e.side.toLowerCase()]: pen });
      }
    }, { full: true });
  },
  erase(points) {
    const hits = this.edgesOn(points);
    if (!hits.length) return;
    change(() => { for (const e of hits) this.eraseOne(e); Tables.sel = null; Tables.refreshHL(); }, { full: true });
  },
  eraseOne(e) {
    if (!e.td.isConnected) return;
    const tbl = e.td.closest('table');
    if (e.diag) { setDiag(e.td, e.diag, null); return; }
    const r = e.td.getBoundingClientRect();
    const across = { Right: [r.right + 4, e.cy], Left: [r.left - 4, e.cy], Bottom: [e.cx, r.bottom + 4], Top: [e.cx, r.top - 4] }[e.side];
    const other = this.cellAt(across[0], across[1]);
    const M = Tables.model(tbl);
    const x = M.cells.find(c => c.el === e.td), n = other && other.closest('table') === tbl ? M.cells.find(c => c.el === other) : null;
    if (x && n && n !== x) {
      const horiz = e.side === 'Left' || e.side === 'Right';
      const [a, b] = (e.side === 'Right' || e.side === 'Bottom') ? [x, n] : [n, x];
      if (horiz ? (a.r === b.r && a.rs === b.rs && a.c + a.cs === b.c) : (a.c === b.c && a.cs === b.cs && a.r + a.rs === b.r)) {
        if (horiz) a.cs += b.cs; else a.rs += b.rs;
        const blank = k => k.nodeType === 1 && k.tagName === 'P' && !k.textContent.replace(/\u200B/g, '').trim() && !k.querySelector('img, table, hr');
        const kids = Array.from(b.el.childNodes).filter(k => !blank(k) && !(k.nodeType === 3 && !k.data.trim()));
        if (kids.length) { if (Array.from(a.el.childNodes).every(k => blank(k) || (k.nodeType === 3 && !k.data.trim()))) a.el.innerHTML = ''; a.el.append(...kids); }
        M.cells = M.cells.filter(c => c !== b);
        b.el.remove();
        Tables.rebuild(M, { compact: true });
        caretAtStart(a.el);
        return;
      }
    }
    if (!x) return;
    Borders.applyCells(tbl, { r1: x.r, c1: x.c, r2: x.r + x.rs - 1, c2: x.c + x.cs - 1 }, { [e.side.toLowerCase()]: null });
  },
};
