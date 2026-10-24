/* ===================== Decimal alignment =====================
   Word's decimal tab for numbers: paragraphs marked data-align="decimal" line up on their
   decimal point, per table column (or per run of such paragraphs outside tables). They are
   stored right-aligned (text-align:right, so other programs still show them sensibly), and
   each layout pass pads every one on the right (--decpad, never saved) so that its decimal
   point lands where the widest decimal part puts the others. A number without a decimal point
   lines up as if one followed its last digit; text without digits lines up its end there,
   as in Word. Latin, Bangla and Devanagari digits count, so ১,২০০.০০ and 4,500.00 line up. */
const DEC_DIGIT = '0-9\u09E6-\u09EF\u0966-\u096F';
const DEC_POINT = new RegExp(`[${DEC_DIGIT}]\\.(?=[${DEC_DIGIT}])`, 'g');
const DEC_LAST_DIGIT = new RegExp(`[${DEC_DIGIT}](?=[^${DEC_DIGIT}]*$)`);
const DecAlign = {
  /* the paragraph's visible text as one string, with a map back to its text nodes */
  text(p) {
    const nodes = [];
    let s = '';
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('del.tc, span.qm, span.pg-line') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let n;
    while ((n = w.nextNode())) { nodes.push({ n, at: s.length }); s += n.data; }
    return { s, nodes };
  },
  at(T, i) {
    for (let k = T.nodes.length - 1; k >= 0; k--) if (T.nodes[k].at <= i) return { node: T.nodes[k].n, offset: Math.min(i - T.nodes[k].at, T.nodes[k].n.length) };
    return null;
  },
  /* where the paragraph lines up: just before its decimal point, else just after its last
     digit, else at the end of its text; and the end of its text (trailing spaces left out) */
  point(p) {
    const T = this.text(p);
    const end = T.s.replace(/[\s\u200B]+$/, '').length;
    if (!end) return null;
    let i = -1, m;
    DEC_POINT.lastIndex = 0;
    while ((m = DEC_POINT.exec(T.s)) && m.index + 1 < end) i = m.index + 1;
    if (i < 0) { const d = T.s.slice(0, end).match(DEC_LAST_DIGIT); i = d ? d.index + 1 : end; }
    const a = this.at(T, i), b = this.at(T, end);
    return a && b ? { a, b } : null;
  },
  /* the width from the alignment point to the end of the text, and whether it is one line */
  tail(p) {
    const pt = this.point(p);
    if (!pt) return { w: 0, one: true };
    const all = document.createRange();
    all.selectNodeContents(p);
    // lines: rects that overlap vertically are one line (mixed fonts give different tops)
    const rows = [];
    for (const x of all.getClientRects()) {
      if (!(x.height > 0 && x.width > 0)) continue;
      const mid = (x.top + x.bottom) / 2;
      if (!rows.some(q => mid >= q.top && mid <= q.bottom)) rows.push({ top: x.top, bottom: x.bottom });
    }
    const r = document.createRange();
    r.setStart(pt.a.node, pt.a.offset);
    r.setEnd(pt.b.node, pt.b.offset);
    return { w: r.collapsed ? 0 : r.getBoundingClientRect().width / (S.zoom || 1), one: rows.length <= 1 };
  },
  /* every layout pass: pad each decimal paragraph so its group's decimal points line up */
  layout() {
    if (!S.editor) return;
    const ps = Array.from(S.editor.querySelectorAll('[data-align="decimal"]'));
    if (!ps.length) return;
    const grids = new Map(), groups = new Map();
    let run = 0, prev = null;
    ps.forEach((p, i) => {
      const cell = p.closest('td, th');
      let key;
      if (cell && S.editor.contains(cell)) {
        // one group per table column (a merged cell's span is a column of its own)
        const tbl = cell.closest('table');
        if (!grids.has(tbl)) grids.set(tbl, { G: Tables.grid(tbl), id: grids.size });
        const g = grids.get(tbl), pos = Tables.pos(g.G, cell);
        key = pos ? `t${g.id}:${pos.c}:${cell.colSpan || 1}` : 'p' + i;
      } else {
        // outside tables: one group per run of decimal paragraphs
        if (!(prev && prev.nextElementSibling === p && !prev.closest('td, th'))) run++;
        key = 'run' + run;
      }
      prev = p;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    for (const p of ps) p.style.setProperty('--decpad', '0px');
    const tails = new Map(ps.map(p => [p, this.tail(p)]));
    for (const list of groups.values()) {
      const one = list.filter(p => tails.get(p).one);
      const max = Math.max(0, ...one.map(p => tails.get(p).w));
      for (const p of list) { p.style.setProperty('--decpad', (tails.get(p).one ? fmtNum(max - tails.get(p).w, 2) : 0) + 'px'); p._decMax = max; }
    }
  },
  /* for Word's decimal tab: where the alignment point is, from the start of the paragraph's
     text area, in px */
  tabPos(p) {
    const cs = getComputedStyle(p), z = S.zoom || 1, pr = p.getBoundingClientRect();
    // from the group's widest decimal part: the same position for every paragraph in a column
    if (p._decMax != null) {
      const inner = pr.width / z - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingLeft) || 0);
      return Math.max(0, inner - p._decMax);
    }
    const pt = this.point(p);
    const left = pr.left + ((parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0)) * z;
    if (!pt) return Math.max(0, (pr.right - left) / z - (parseFloat(cs.paddingRight) || 0));
    const r = document.createRange();
    r.setStart(pt.a.node, pt.a.offset);
    r.collapse(true);
    let rc = r.getClientRects()[0];
    if (!rc) { const r2 = document.createRange(); r2.setStart(pt.a.node, pt.a.offset); r2.setEnd(pt.b.node, pt.b.offset); rc = r2.getBoundingClientRect(); }
    return Math.max(0, (rc.left - left) / z);
  },
};
