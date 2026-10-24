/* ===================== Table, border and shading dialogs ===================== */
function radioGroup(name, opts, value) {
  const box = h('div', { class: 'radios', role: 'radiogroup' });
  for (const [v, l] of opts) {
    const id = name + '-' + v;
    const inp = h('input', { type: 'radio', name, id, value: v });
    inp.checked = v === value;
    box.appendChild(h('label', { class: 'check', for: id }, inp, l));
  }
  return { el: box, get value() { const c = box.querySelector('input:checked'); return c ? c.value : value; } };
}
/* a colour button that opens the palette; null is Automatic or No Color */
function colorButton(get, set, kind, noneLabel) {
  const sw = h('span', { class: 'cswatch' });
  const lb = h('span', { class: 'clabel' });
  const b = h('button', { class: 'btn cbtn', type: 'button', 'aria-label': 'Color' }, sw, lb, iconEl('caret'));
  const upd = () => { const c = get(); sw.style.background = c || 'transparent'; sw.classList.toggle('none', !c); lb.textContent = c ? c.toUpperCase() : noneLabel; };
  b.addEventListener('click', () => Menu.open(b, colorPalette(kind, c => { set(c); upd(); })));
  upd();
  return { el: b, upd };
}
function lineSample(style, color, pt) {
  const d3 = /^(groove|ridge|inset|outset)$/.test(style);
  const w = pt ? (style === 'double' ? Math.max(3, Math.round(pt * 4)) : d3 ? Math.max(2, Math.round(pt * 8 / 3)) : Math.max(1, Math.round(pt * 4 / 3))) : (style === 'double' || d3 ? 4 : 2);
  return h('span', { class: 'lsample', style: { borderTop: `${w}px ${style} ${color || 'currentColor'}` } });
}
/* the border style list, colour and width shared by the Borders and Page Border tabs */
function penControls(pen, onChange, idp) {
  const list = h('div', { class: 'lstyles', role: 'listbox', 'aria-label': 'Style', tabindex: '0' });
  const opts = BORDER_STYLES.map(([v, l]) => {
    const o = h('div', { class: 'lopt', role: 'option', 'data-v': v, title: l, 'aria-label': l }, lineSample(v));
    o.addEventListener('click', () => { pen.style = v; sync(); onChange(); });
    list.appendChild(o);
    return o;
  });
  list.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = BORDER_STYLES.findIndex(s => s[0] === pen.style);
    pen.style = BORDER_STYLES[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, BORDER_STYLES.length - 1)][0];
    sync(); onChange();
  });
  const col = colorButton(() => pen.color === '#000000' ? null : pen.color, c => { pen.color = c || '#000000'; onChange(); }, 'font', 'Automatic');
  const wsel = select(BORDER_WIDTHS.map(w => [String(w), fmtBW(w)]), String(pen.width), { id: idp + 'Width' });
  if (!BORDER_WIDTHS.includes(pen.width)) { wsel.appendChild(h('option', { value: String(pen.width) }, fmtBW(pen.width))); wsel.value = String(pen.width); }
  wsel.addEventListener('change', () => { pen.width = parseFloat(wsel.value); onChange(); });
  const sync = () => { opts.forEach(o => o.setAttribute('aria-selected', o.dataset.v === pen.style ? 'true' : 'false')); col.upd(); wsel.value = String(pen.width); };
  sync();
  return { el: h('div', { class: 'bsd-pen' }, h('div', { class: 'flabel' }, 'Style'), list, h('div', { class: 'flabel' }, 'Color'), col.el, h('label', { class: 'flabel', for: idp + 'Width' }, 'Width'), wsel), sync };
}
/* small pictures for the Setting buttons */
function settingIcon(kind) {
  const g = '#9aa59f';
  const parts = {
    none: `<rect x="4" y="4" width="24" height="24" fill="none" stroke="${g}" stroke-dasharray="2 2"/><path d="M16 4v24M4 16h24" stroke="${g}" stroke-dasharray="2 2"/>`,
    box: `<rect x="4" y="4" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 4v24M4 16h24" stroke="${g}" stroke-dasharray="2 2"/>`,
    all: `<rect x="4" y="4" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 4v24M4 16h24" stroke="currentColor" stroke-width="2"/>`,
    grid: `<rect x="4" y="4" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 4v24M4 16h24" stroke="currentColor" stroke-width="1"/>`,
    custom: `<path d="M4 4h24M4 28h24" stroke="currentColor" stroke-width="2"/><path d="M4 4v24M28 4v24M16 4v24M4 16h24" stroke="${g}" stroke-dasharray="2 2"/>`,
    shadow: `<rect x="7" y="7" width="23" height="23" fill="currentColor" opacity=".55"/><rect x="3" y="3" width="23" height="23" fill="var(--surface)" stroke="currentColor" stroke-width="2"/>`,
  };
  return h('span', { class: 'set-ic', html: `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">${parts[kind]}</svg>` });
}
const SETTING_LABEL = { none: 'None', box: 'Box', all: 'All', grid: 'Grid', custom: 'Custom', shadow: 'Shadow' };
function normPageBorder(v) {
  if (!v) return null;
  const sides = { top: true, bottom: true, left: true, right: true };
  if (v === true) return { style: 'solid', width: 1.125, color: '#333333', sides, shadow: false, from: 'page', m: { t: 24, b: 24, l: 24, r: 24 }, show: 'all' };
  return Object.assign({ style: 'solid', width: 0.5, color: '#000000', shadow: false, from: 'page', show: 'all' }, v, { sides: Object.assign({}, sides, v.sides), m: Object.assign({ t: 24, b: 24, l: 24, r: 24 }, v.m) });
}

Object.assign(Dialogs, {
  splitCells() {
    const cells = Tables.selectedCells();
    if (!cells.length) { toast('Click in a table cell first.'); return; }
    const one = cells.length === 1 ? cells[0] : null;
    const cols = input(one && one.colSpan > 1 ? one.colSpan : 2, { type: 'number', min: '1', max: '63', inputmode: 'numeric' });
    const rows = input(one && one.rowSpan > 1 ? one.rowSpan : 1, { type: 'number', min: '1', max: '99', inputmode: 'numeric' });
    const merge = checkbox('Merge cells before split', true, 'dlgSplitMerge');
    const msg = h('p', { class: 'note dlg-err', role: 'alert' });
    const body = h('div', null, h('div', { class: 'grid2' }, field('Number of columns', cols, 'dlgSplitCols'), field('Number of rows', rows, 'dlgSplitRows')), cells.length > 1 ? merge.el : null, msg);
    openDialog({ title: 'Split Cells', width: 380, body, buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => {
      const nc = parseInt(cols.value, 10), nr = parseInt(rows.value, 10);
      if (!(nc >= 1 && nc <= 63)) { msg.textContent = 'The number of columns must be between 1 and 63.'; cols.focus(); return false; }
      if (!(nr >= 1 && nr <= 99)) { msg.textContent = 'The number of rows must be between 1 and 99.'; rows.focus(); return false; }
      const mf = cells.length > 1 && merge.input.checked;
      const p = Tables.splitRowsProblem(cells, nr, mf);
      if (p) { msg.textContent = p; rows.focus(); return false; }
      if (nc === 1 && nr === 1 && !mf) return;
      Tables.splitCells(nc, nr, mf);
      S.editor.focus({ preventScroll: true });
    } }] });
  },
  insertCells() {
    if (!Tables.selectedCells().length) { toast('Click in a table cell first.'); return; }
    const g = radioGroup('insCells', [['right', 'Shift cells right'], ['down', 'Shift cells down'], ['row', 'Insert entire row'], ['col', 'Insert entire column']], 'down');
    openDialog({ title: 'Insert Cells', width: 340, body: g.el, focus: 'input:checked', buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { Tables.insertCells(g.value); } }] });
  },
  deleteCells() {
    if (!Tables.selectedCells().length) { toast('Click in a table cell first.'); return; }
    const g = radioGroup('delCells', [['left', 'Shift cells left'], ['up', 'Shift cells up'], ['row', 'Delete entire row'], ['col', 'Delete entire column']], 'left');
    openDialog({ title: 'Delete Cells', width: 340, body: g.el, focus: 'input:checked', buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { Tables.deleteCells(g.value); S.editor.focus({ preventScroll: true }); } }] });
  },

  /* Borders and Shading: borders, page border and shading, like Word's dialog */
  bordersShading(startTab = 'borders') {
    const r0 = getRange() || lastRange;
    const r = r0 && S.editor.contains(r0.startContainer) ? r0.cloneRange() : null;
    const cells = Tables.selectedCells();
    const tbl = cells.length ? cells[0].closest('table') : null;
    const R = tbl ? Borders.rectOf(tbl, cells) : null;
    const G0 = tbl ? Tables.grid(tbl) : null;
    const whole = !!(R && G0 && R.r1 === 0 && R.c1 === 0 && R.r2 === G0.rows.length - 1 && R.c2 === G0.ncols - 1 && G0.rows.length * G0.ncols > 1);
    const blocks = Borders.paraBlocks(r);
    const partial = !!(r && !r.collapsed && !Tables.sel && blocks.length === 1 && r.toString().replace(/[\u200B\s]+/g, '').length < blocks[0].textContent.replace(/[\u200B\s]+/g, '').length);
    const targets = [];
    if (partial) targets.push(['text', 'Text']);
    if (blocks.length) targets.push(['para', 'Paragraph']);
    if (tbl) targets.push(['cell', 'Cell'], ['table', 'Table']);
    if (!targets.length) targets.push(['para', 'Paragraph']);
    const defT = partial ? 'text' : (tbl && Tables.sel ? (whole ? 'table' : 'cell') : tbl ? 'cell' : 'para');

    /* ---------- Borders tab ---------- */
    const bs = { target: defT, pen: Borders.pen(), edges: {}, shadow: false, pad: { t: 1, b: 1, l: 4, r: 4 }, setting: 'none', dirty: false };
    const applicable = k => bs.edges[k] !== undefined;
    const OUT = ['top', 'bottom', 'left', 'right'];
    const loadB = () => {
      const t = bs.target;
      bs.shadow = false;
      if (t === 'table') {
        const sp = Borders.tableSpec(tbl), G = Tables.grid(tbl);
        const all = Borders.cellState(tbl, { r1: 0, c1: 0, r2: G.rows.length - 1, c2: G.ncols - 1 });
        bs.edges = { top: sp.top, bottom: sp.bottom, left: sp.left, right: sp.right, insideH: G.rows.length > 1 ? sp.insideH : undefined, insideV: G.ncols > 1 ? sp.insideV : undefined, diagDown: all.diagDown || null, diagUp: all.diagUp || null };
      } else if (t === 'cell') {
        const st = Borders.cellState(tbl, R);
        bs.edges = {};
        for (const k of EDGE_KEYS) bs.edges[k] = st[k] === undefined ? undefined : (st[k] || null);
      } else if (t === 'para') {
        const st = Borders.paraState(blocks);
        bs.edges = { top: st.top, bottom: st.bottom, left: st.left, right: st.right, insideH: blocks.length > 1 ? (st.insideH || null) : undefined };
        bs.shadow = st.shadow; bs.pad = st.pad;
      } else {
        const st = Borders.textState(r);
        bs.edges = { top: st.top, bottom: st.bottom, left: st.left, right: st.right };
        bs.shadow = st.shadow;
      }
      const first = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => bs.edges[k]).find(Boolean);
      if (first && !bs.penSet) Object.assign(bs.pen, first);
      bs.setting = detect();
    };
    const detect = () => {
      const E = bs.edges;
      const outs = OUT.map(k => E[k]), ins = ['insideH', 'insideV'].filter(applicable).map(k => E[k]);
      const diag = E.diagDown || E.diagUp;
      if (outs.every(v => !v) && ins.every(v => !v) && !diag) return 'none';
      const outEq = outs.every(v => v && bdrEq(v, outs[0]));
      if (!outEq || diag) return 'custom';
      if (ins.every(v => !v)) return bs.shadow ? 'shadow' : 'box';
      if (bs.target === 'para' || bs.target === 'text') return 'custom';
      if (ins.every(v => v && bdrEq(v, outs[0]))) return 'all';
      if (ins.every(v => v && bdrEq(v, ins[0]) && v.width < outs[0].width)) return 'grid';
      return 'custom';
    };
    const settingsFor = t => t === 'text' ? ['none', 'box', 'shadow'] : t === 'para' ? ['none', 'box', 'shadow', 'custom'] : ['none', 'box', 'all', 'grid', 'custom'];
    const applySetting = s => {
      const E = bs.edges, pen = bs.pen;
      const set = (keys, v) => keys.forEach(k => { if (applicable(k)) E[k] = v ? Object.assign({}, v) : null; });
      if (s === 'none') { set(EDGE_KEYS, null); bs.shadow = false; }
      else if (s === 'box' || s === 'shadow') { set(OUT, pen); set(['insideH', 'insideV', 'diagDown', 'diagUp'], null); bs.shadow = s === 'shadow'; }
      else if (s === 'all') { set(OUT, pen); set(['insideH', 'insideV'], pen); set(['diagDown', 'diagUp'], null); bs.shadow = false; }
      else if (s === 'grid') { set(OUT, pen); set(['insideH', 'insideV'], Object.assign({}, pen, { width: Math.min(pen.width, 0.5) })); set(['diagDown', 'diagUp'], null); bs.shadow = false; }
      bs.setting = s;
    };
    const toggleEdge = k => {
      if (!applicable(k) || bs.target === 'text') return;
      const E = bs.edges;
      E[k] = E[k] && bdrEq(E[k], bs.pen) ? null : Object.assign({}, bs.pen);
      bs.setting = 'custom';
      bs.dirty = true;
      renderB();
    };
    const setCol = h('div', { class: 'bsd-set', role: 'radiogroup', 'aria-label': 'Setting' });
    const pen = penControls(bs.pen, () => {
      bs.penSet = true;
      if (bs.setting === 'none' && bs.target !== 'cell' && bs.target !== 'table') applySetting('box');
      else if (bs.setting === 'none') applySetting(bs.target === 'table' ? 'all' : 'box');
      else if (bs.setting !== 'custom') applySetting(bs.setting);
      bs.dirty = true;
      renderB();
    }, 'bsdB');
    const pv = h('div', { class: 'bpv', role: 'img', 'aria-label': 'Preview. Click an edge to turn its border on or off.' });
    const btnL = h('div', { class: 'bpv-btns col' }), btnB = h('div', { class: 'bpv-btns row' });
    const EDGE_BTN = { top: ['borderTop', 'Top border'], insideH: ['borderInsideH', 'Inside horizontal border'], bottom: ['borderBottom', 'Bottom border'], diagDown: ['borderDiagDown', 'Diagonal down border'], left: ['borderLeft', 'Left border'], insideV: ['borderInsideV', 'Inside vertical border'], right: ['borderRight', 'Right border'], diagUp: ['borderDiagUp', 'Diagonal up border'] };
    const ebtn = {};
    for (const k of Object.keys(EDGE_BTN)) {
      const b = h('button', { class: 'tb-btn bpv-b', type: 'button', title: EDGE_BTN[k][1], 'aria-label': EDGE_BTN[k][1], 'aria-pressed': 'false', html: icon(EDGE_BTN[k][0]) });
      b.addEventListener('click', () => toggleEdge(k));
      ebtn[k] = b;
    }
    btnL.append(ebtn.top, ebtn.insideH, ebtn.bottom);
    btnB.append(ebtn.diagDown, ebtn.left, ebtn.insideV, ebtn.right, ebtn.diagUp);
    const applyB = select(targets, bs.target, { id: 'bsdApplyB' });
    applyB.addEventListener('change', () => { bs.target = applyB.value; loadB(); renderB(); });
    const padIn = {};
    const padBox = h('div', { class: 'bsd-opts', hidden: true }, h('div', { class: 'flabel' }, 'Distance from text (pt)'),
      h('div', { class: 'grid4' }, ...[['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']].map(([k, l]) => { const i = input('', { inputmode: 'decimal', id: 'bsdPad' + k, 'aria-label': l + ' distance' }); i.addEventListener('input', () => { const v = parseFloat(i.value); if (v >= 0 && v <= 31) { bs.pad[k] = v; bs.dirty = true; } }); padIn[k] = i; return field(l, i, 'bsdPad' + k); })));
    const optBtn = h('button', { class: 'btn', type: 'button', 'aria-expanded': 'false' }, 'Options…');
    optBtn.addEventListener('click', () => { padBox.hidden = !padBox.hidden; optBtn.setAttribute('aria-expanded', String(!padBox.hidden)); });
    const prevCss = b => { if (!b) return 'none'; const px = b.style === 'double' ? Math.max(3, b.width * 4) : Math.max(1, b.width * 4 / 3); return `${fmtNum(px, 2)}px ${b.style} ${b.color}`; };
    const renderB = () => {
      const t = bs.target, E = bs.edges;
      setCol.innerHTML = '';
      for (const s of settingsFor(t)) {
        const b = h('button', { class: 'set-b', type: 'button', role: 'radio', 'aria-checked': bs.setting === s ? 'true' : 'false' }, settingIcon(s), h('span', null, SETTING_LABEL[s]));
        b.addEventListener('click', () => { if (s !== 'custom') applySetting(s); else bs.setting = 'custom'; bs.dirty = true; renderB(); });
        setCol.appendChild(b);
      }
      pv.className = 'bpv ' + t;
      pv.innerHTML = '';
      const inner = h('div', { class: 'bpv-in' });
      const bars = n => Array.from({ length: n }, (_, i) => h('i', { style: { width: (i % 3 === 2 ? 60 : 92) + '%' } }));
      if (t === 'table' || t === 'cell') {
        const two = k => applicable(k);
        inner.classList.toggle('h2', two('insideH')); inner.classList.toggle('v2', two('insideV'));
        const nq = (two('insideH') ? 2 : 1) * (two('insideV') ? 2 : 1);
        for (let i = 0; i < nq; i++) inner.appendChild(h('div', { class: 'bpv-q' }, bars(3)));
      } else if (t === 'para') {
        inner.appendChild(h('div', { class: 'bpv-p' }, bars(4)));
        if (applicable('insideH')) { inner.classList.add('h2'); inner.appendChild(h('div', { class: 'bpv-p' }, bars(3))); }
      } else inner.appendChild(h('div', { class: 'bpv-t' }, 'Text'));
      if (t === 'text') { const b = E.top; inner.firstChild.style.border = prevCss(b); inner.firstChild.style.boxShadow = bs.shadow && b ? `3px 3px 0 0 ${b.color}` : ''; }
      else {
        for (const k of OUT) inner.style['border' + k[0].toUpperCase() + k.slice(1)] = prevCss(E[k]);
        inner.style.boxShadow = bs.shadow && (E.right || E.bottom) ? `4px 4px 0 0 ${(E.right || E.bottom).color}` : '';
        if (applicable('insideH')) inner.appendChild(h('div', { class: 'bpv-ih', style: { borderTop: prevCss(E.insideH) } }));
        if (applicable('insideV')) inner.appendChild(h('div', { class: 'bpv-iv', style: { borderLeft: prevCss(E.insideV) } }));
        if (E.diagDown || E.diagUp) inner.style.backgroundImage = `url("${diagSvg(E.diagDown && Object.assign({}, E.diagDown, { width: Math.max(0.75, E.diagDown.width) }), E.diagUp && Object.assign({}, E.diagUp, { width: Math.max(0.75, E.diagUp.width) }))}")`;
      }
      pv.appendChild(inner);
      for (const k of Object.keys(ebtn)) { ebtn[k].hidden = t === 'text' || !applicable(k); ebtn[k].setAttribute('aria-pressed', E[k] ? 'true' : 'false'); }
      btnL.hidden = btnB.hidden = t === 'text';
      ebtn.insideH.title = ebtn.insideH.ariaLabel = t === 'para' ? 'Border between paragraphs' : 'Inside horizontal border';
      optBtn.hidden = t !== 'para';
      if (t !== 'para') padBox.hidden = true;
      for (const k of ['t', 'b', 'l', 'r']) if (document.activeElement !== padIn[k]) padIn[k].value = fmtNum(bs.pad[k], 2);
      pen.sync();
    };
    pv.addEventListener('click', e => {
      if (bs.target === 'text') return;
      const inner = pv.querySelector('.bpv-in');
      const rc = inner.getBoundingClientRect();
      const x = e.clientX - rc.left, y = e.clientY - rc.top, W = rc.width, H = rc.height;
      const d = { top: Math.abs(y), bottom: Math.abs(H - y), left: Math.abs(x), right: Math.abs(W - x) };
      if (applicable('insideH')) d.insideH = Math.abs(y - H / 2);
      if (applicable('insideV')) d.insideV = Math.abs(x - W / 2);
      const len = Math.hypot(W, H);
      if (applicable('diagDown')) d.diagDown = Math.abs(y * W - x * H) / len + 3;
      if (applicable('diagUp')) d.diagUp = Math.abs(y * W - (W - x) * H) / len + 3;
      const k = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
      if (d[k] <= 14) toggleEdge(k);
    });
    loadB();
    const bPanel = h('div', { class: 'bsd-panel', 'data-p': 'borders', role: 'tabpanel' },
      h('div', { class: 'bsd-grid' },
        h('div', null, h('div', { class: 'flabel' }, 'Setting'), setCol),
        pen.el,
        h('div', { class: 'bsd-prev' }, h('div', { class: 'flabel' }, 'Preview'), h('p', { class: 'note bsd-hint' }, 'Click on the diagram or use the buttons to apply borders.'),
          h('div', { class: 'bpv-wrap' }, btnL, pv, h('span'), btnB),
          field('Apply to', applyB, 'bsdApplyB'), optBtn)),
      padBox);

    /* ---------- Page Border tab ---------- */
    const cur = normPageBorder(S.doc.page.border);
    const pg = { on: !!cur, pen: cur ? { style: cur.style, width: cur.width, color: cur.color } : Object.assign({}, bs.pen), sides: cur ? Object.assign({}, cur.sides) : { top: true, bottom: true, left: true, right: true }, shadow: cur ? cur.shadow : false, from: cur ? cur.from : 'page', m: cur ? Object.assign({}, cur.m) : { t: 24, b: 24, l: 24, r: 24 }, show: cur ? cur.show : 'all', dirty: false };
    const pgSetting = () => !pg.on || !Object.values(pg.sides).some(Boolean) ? 'none' : Object.values(pg.sides).every(Boolean) ? (pg.shadow ? 'shadow' : 'box') : 'custom';
    const pgSetCol = h('div', { class: 'bsd-set', role: 'radiogroup', 'aria-label': 'Setting' });
    const pgPen = penControls(pg.pen, () => { if (!pg.on) { pg.on = true; pg.sides = { top: true, bottom: true, left: true, right: true }; } pg.dirty = true; renderP(); }, 'bsdP');
    const ppv = h('div', { class: 'ppv', role: 'img', 'aria-label': 'Page preview. Click an edge to turn it on or off.' });
    const pbtn = {};
    const pgBtnL = h('div', { class: 'bpv-btns col' }), pgBtnB = h('div', { class: 'bpv-btns row' });
    for (const [k, ic, l] of [['top', 'borderTop', 'Top border'], ['bottom', 'borderBottom', 'Bottom border'], ['left', 'borderLeft', 'Left border'], ['right', 'borderRight', 'Right border']]) {
      const b = h('button', { class: 'tb-btn bpv-b', type: 'button', title: l, 'aria-label': l, html: icon(ic) });
      b.addEventListener('click', () => togglePg(k));
      pbtn[k] = b;
    }
    pgBtnL.append(pbtn.top, pbtn.bottom);
    pgBtnB.append(pbtn.left, pbtn.right);
    const togglePg = k => { if (!pg.on) { pg.on = true; pg.sides = { top: false, bottom: false, left: false, right: false }; } pg.sides[k] = !pg.sides[k]; pg.dirty = true; renderP(); };
    const applyP = select([['all', 'Whole document'], ['first', 'This section – First page only'], ['rest', 'This section – All except first page']], pg.show, { id: 'bsdApplyP' });
    applyP.addEventListener('change', () => { pg.show = applyP.value; pg.dirty = true; });
    const fromSel = select([['page', 'Edge of page'], ['text', 'Text']], pg.from, { id: 'bsdFrom' });
    const mIn = {};
    const pgOpts = h('div', { class: 'bsd-opts', hidden: true }, field('Measure from', fromSel, 'bsdFrom'), h('div', { class: 'flabel' }, 'Margin (pt)'),
      h('div', { class: 'grid4' }, ...[['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']].map(([k, l]) => { const i = input(fmtNum(pg.m[k], 1), { inputmode: 'decimal', id: 'bsdM' + k }); i.addEventListener('input', () => { const v = parseFloat(i.value); if (v >= 0 && v <= 31) { pg.m[k] = v; pg.dirty = true; } }); mIn[k] = i; return field(l, i, 'bsdM' + k); })));
    fromSel.addEventListener('change', () => {
      const was = pg.from; pg.from = fromSel.value; pg.dirty = true;
      const defs = { page: { t: 24, b: 24, l: 24, r: 24 }, text: { t: 1, b: 1, l: 4, r: 4 } };
      if (['t', 'b', 'l', 'r'].every(k => Math.abs(pg.m[k] - defs[was][k]) < 0.01)) { pg.m = Object.assign({}, defs[pg.from]); for (const k in mIn) mIn[k].value = fmtNum(pg.m[k], 1); }
    });
    const pgOptBtn = h('button', { class: 'btn', type: 'button', 'aria-expanded': 'false' }, 'Options…');
    pgOptBtn.addEventListener('click', () => { pgOpts.hidden = !pgOpts.hidden; pgOptBtn.setAttribute('aria-expanded', String(!pgOpts.hidden)); });
    const renderP = () => {
      const s = pgSetting();
      pgSetCol.innerHTML = '';
      for (const k of ['none', 'box', 'shadow', 'custom']) {
        const b = h('button', { class: 'set-b', type: 'button', role: 'radio', 'aria-checked': s === k ? 'true' : 'false' }, settingIcon(k), h('span', null, SETTING_LABEL[k]));
        b.addEventListener('click', () => {
          if (k === 'none') pg.on = false;
          else if (k === 'box' || k === 'shadow') { pg.on = true; pg.sides = { top: true, bottom: true, left: true, right: true }; pg.shadow = k === 'shadow'; }
          pg.dirty = true; renderP();
        });
        pgSetCol.appendChild(b);
      }
      ppv.innerHTML = '';
      const pin = h('div', { class: 'ppv-in' }, h('div', { class: 'bpv-p' }, Array.from({ length: 9 }, (_, i) => h('i', { style: { width: (i % 4 === 3 ? 55 : 94) + '%' } }))));
      for (const k of OUT) pin.style['border' + k[0].toUpperCase() + k.slice(1)] = pg.on && pg.sides[k] ? prevCss(pg.pen) : 'none';
      pin.style.boxShadow = pg.on && pg.shadow ? `3px 3px 0 0 ${pg.pen.color}` : '';
      ppv.appendChild(pin);
      for (const k of OUT) pbtn[k].setAttribute('aria-pressed', pg.on && pg.sides[k] ? 'true' : 'false');
      pgPen.sync();
    };
    ppv.addEventListener('click', e => {
      const rc = ppv.querySelector('.ppv-in').getBoundingClientRect();
      const x = e.clientX - rc.left, y = e.clientY - rc.top;
      const d = { top: Math.abs(y), bottom: Math.abs(rc.height - y), left: Math.abs(x), right: Math.abs(rc.width - x) };
      const k = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
      if (d[k] <= 14) togglePg(k);
    });
    const pPanel = h('div', { class: 'bsd-panel', 'data-p': 'page', role: 'tabpanel', hidden: true },
      h('div', { class: 'bsd-grid' },
        h('div', null, h('div', { class: 'flabel' }, 'Setting'), pgSetCol),
        pgPen.el,
        h('div', { class: 'bsd-prev' }, h('div', { class: 'flabel' }, 'Preview'), h('p', { class: 'note bsd-hint' }, 'Click on the page or use the buttons to apply borders.'),
          h('div', { class: 'bpv-wrap page' }, pgBtnL, ppv, h('span'), pgBtnB),
          field('Apply to', applyP, 'bsdApplyP'), pgOptBtn)),
      pgOpts);

    /* ---------- Shading tab ---------- */
    const sh = { target: defT, fill: null, pat: 'clear', color: '#000000', dirty: false };
    const shEl = t => t === 'table' ? (Tables.cells(Tables.grid(tbl))[0] || {}).el : t === 'cell' ? cells[0] : t === 'para' ? blocks[0] : Borders.textSpan(r);
    const loadS = () => { const v = Borders.shdOf(sh.target === 'text' ? (Borders.textSpan(r) && Borders.textSpan(r).hasAttribute('data-ts') ? Borders.textSpan(r) : null) : shEl(sh.target)); sh.fill = v.fill; sh.pat = v.pat; sh.color = v.color; };
    loadS();
    const fillBtn = colorButton(() => sh.fill, c => { sh.fill = c; sh.dirty = true; renderS(); }, 'shade', 'No Color');
    const patSel = select(SHD_PATTERNS, sh.pat, { id: 'bsdPat' });
    patSel.addEventListener('change', () => { sh.pat = patSel.value; sh.dirty = true; renderS(); });
    const patCol = colorButton(() => sh.color === '#000000' ? null : sh.color, c => { sh.color = c || '#000000'; sh.dirty = true; renderS(); }, 'font', 'Automatic');
    const applyS = select(targets, sh.target, { id: 'bsdApplyS' });
    applyS.addEventListener('change', () => { sh.target = applyS.value; loadS(); fillBtn.upd(); patCol.upd(); patSel.value = sh.pat; renderS(); });
    const spv = h('div', { class: 'spv' }, h('span', null, 'Sample text · নমুনা লেখা'));
    const renderS = () => {
      const s = spv.firstChild;
      s.style.backgroundColor = shdColor(sh) || 'transparent';
      s.style.backgroundImage = PAT_GEOM[sh.pat] ? `url("${patSvg(sh.pat, sh.color)}")` : '';
      s.style.backgroundSize = '6px 6px';
      patCol.el.disabled = sh.pat === 'clear';
      fillBtn.upd(); patCol.upd();
    };
    renderS();
    const sPanel = h('div', { class: 'bsd-panel', 'data-p': 'shading', role: 'tabpanel', hidden: true },
      h('div', { class: 'bsd-grid shd' },
        h('div', null, h('div', { class: 'flabel' }, 'Fill'), fillBtn.el,
          h('div', { class: 'dsection' }, 'Patterns'), field('Style', patSel, 'bsdPat'), h('div', { class: 'flabel' }, 'Color'), patCol.el),
        h('div', { class: 'bsd-prev' }, h('div', { class: 'flabel' }, 'Preview'), spv, field('Apply to', applyS, 'bsdApplyS'))));

    /* ---------- tabs ---------- */
    const tabs = h('div', { class: 'bsd-tabs', role: 'tablist' });
    const panels = { borders: bPanel, page: pPanel, shading: sPanel };
    const tabBtns = {};
    for (const [k, l] of [['borders', 'Borders'], ['page', 'Page Border'], ['shading', 'Shading']]) {
      const b = h('button', { class: 'bsd-tab', type: 'button', role: 'tab', 'aria-selected': 'false' }, l);
      b.addEventListener('click', () => showTab(k));
      tabBtns[k] = b;
      tabs.appendChild(b);
    }
    const showTab = k => { for (const t in panels) { panels[t].hidden = t !== k; tabBtns[t].setAttribute('aria-selected', t === k ? 'true' : 'false'); } };
    showTab(startTab);
    renderB(); renderP();

    const apply = () => {
      if (!bs.dirty && !sh.dirty && !pg.dirty) return;
      change(() => {
        let rr = r;
        if (bs.dirty) {
          const E = bs.edges;
          if (bs.target === 'table') Borders.applyTable(tbl, E);
          else if (bs.target === 'cell') Borders.applyCells(tbl, R, E);
          else if (bs.target === 'para') Borders.applyParas(blocks, E, { pad: bs.pad, shadow: bs.shadow });
          else {
            const sps = Borders.applyText(rr, E.top, bs.shadow);
            if (sps.length) { rr = document.createRange(); rr.setStartBefore(sps[0]); rr.setEndAfter(sps[sps.length - 1]); }
          }
        }
        if (sh.dirty) {
          const shd = { fill: sh.fill, pat: sh.pat, color: sh.color };
          const on = !!(sh.fill || sh.pat !== 'clear');
          if (sh.target === 'table') for (const x of Tables.cells(Tables.grid(tbl))) Borders.shade(x.el, on ? shd : null);
          else if (sh.target === 'cell') for (const c of cells) Borders.shade(c, on ? shd : null);
          else if (sh.target === 'para') Borders.shadeBlocks(blocks, on ? shd : null);
          else Borders.shadeText(rr, on ? shd : null);
        }
        if (pg.dirty) {
          S.doc.page.border = pg.on && Object.values(pg.sides).some(Boolean) ? { style: pg.pen.style, width: pg.pen.width, color: pg.pen.color, sides: Object.assign({}, pg.sides), shadow: !!pg.shadow, from: pg.from, m: Object.assign({}, pg.m), show: pg.show } : false;
        }
      }, { full: true });
      if (bs.dirty && bs.target !== 'text') Borders.setPen({ style: bs.pen.style, width: bs.pen.width, color: bs.pen.color });
    };
    openDialog({ title: 'Borders and Shading', width: 700, body: h('div', { class: 'bsd' }, tabs, bPanel, pPanel, sPanel), focus: tabBtns[startTab], buttons: [{ label: 'Horizontal Line', left: true, onClick: () => { setTimeout(() => insertHR(), 0); } }, { label: 'Cancel' }, { label: 'OK', primary: true, onClick: apply }] });
  },
});
