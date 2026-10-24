/* ===================== Borders & shading =====================
   A border is { style, width (pt), color } or null for none, as in Word's dialog.
   On the page it is a CSS border. Word counts one line of a double border as its
   width, so a double's CSS width is three times that.
   - A table keeps its outside and inside borders in CSS variables (class tbl-bd:
     --bt --bb --bl --br --bh --bv); Tables.markEdges() tags the cells on its edge.
     A cell's own borders are inline styles and win over the table's, as in Word.
   - Diagonal borders (data-dd, data-du) and shading patterns (data-shd) are drawn
     with background images that decoSync() keeps in step with the attributes.
   - Consecutive paragraphs with the same borders share one box (markParaGroups). */
const BORDER_STYLES = [['solid', 'Single'], ['dotted', 'Dotted'], ['dashed', 'Dashed'], ['double', 'Double'], ['groove', '3-D engrave'], ['ridge', '3-D emboss'], ['inset', 'Inset'], ['outset', 'Outset']];
const BORDER_WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
const W_BORDER = { solid: 'single', dotted: 'dotted', dashed: 'dashed', double: 'double', groove: 'threeDEngrave', ridge: 'threeDEmboss', inset: 'inset', outset: 'outset' };
const BORDER_FROM_W = { single: 'solid', thick: 'solid', dotted: 'dotted', dashed: 'dashed', dashSmallGap: 'dashed', dotDash: 'dashed', dotDotDash: 'dashed', dashDotStroked: 'dashed', double: 'double', triple: 'double', thinThickSmallGap: 'double', thickThinSmallGap: 'double', thinThickThinSmallGap: 'double', thinThickMediumGap: 'double', thickThinMediumGap: 'double', thinThickThinMediumGap: 'double', thinThickLargeGap: 'double', thickThinLargeGap: 'double', thinThickThinLargeGap: 'double', threeDEngrave: 'groove', threeDEmboss: 'ridge', inset: 'inset', outset: 'outset', wave: 'solid', doubleWave: 'double' };
const EDGE_KEYS = ['top', 'bottom', 'left', 'right', 'insideH', 'insideV', 'diagDown', 'diagUp'];

function fmtBW(w) {
  const q = Math.round(w * 4);
  if (Math.abs(w * 4 - q) > 0.01) return fmtNum(w, 2) + ' pt';
  const i = Math.floor(q / 4), f = q % 4;
  return (i || !f ? String(i) : '') + ['', '¼', '½', '¾'][f] + ' pt';
}
const snapBW = pt => { const k = BORDER_WIDTHS.find(x => Math.abs(x - pt) < 0.06); return k != null ? k : Math.round(pt * 100) / 100; };
function bdrCss(b) { return b ? `${fmtNum(b.style === 'double' ? b.width * 3 : b.width, 3)}pt ${b.style} ${b.color}` : 'none'; }
const BW_KEYWORD = { thin: 0.75, medium: 2.25, thick: 3.75 };
/* a border from declared (not computed) style, width and colour strings */
function bdrOfDecl(style, width, color) {
  if (!style || style === 'none' || style === 'hidden' || style === 'initial') return null;
  let w = BW_KEYWORD[width] != null ? BW_KEYWORD[width] : (width ? cssToPt(width) : 2.25);
  if (w == null || w <= 0) return null;
  if (style === 'double') w /= 3;
  const col = /^(windowtext|currentcolor|auto)?$/i.test(color || '') ? '#000000' : (cssColorToHex(color) || '#000000');
  return { style: BORDER_STYLES.some(s => s[0] === style) ? style : 'solid', width: snapBW(w), color: col };
}
function bdrParse(s) {
  if (s == null) return null;
  s = String(s).trim();
  if (!s || /^(none|hidden|0|0px|0pt|nil)$/i.test(s)) return null;
  const el = bdrParse.el || (bdrParse.el = document.createElement('div'));
  el.style.cssText = '';
  el.style.borderTop = s.replace(/\bwindowtext\b/gi, '#000000');
  return bdrOfDecl(el.style.borderTopStyle, el.style.borderTopWidth, el.style.borderTopColor);
}
/* inline border of one side: undefined when the element doesn't set it */
function bdrInline(el, side) {
  const st = el.style['border' + side + 'Style'];
  if (!st) return undefined;
  return bdrOfDecl(st, el.style['border' + side + 'Width'], el.style['border' + side + 'Color']);
}
function bdrComputed(cs, side) {
  const st = cs['border' + side + 'Style'];
  const w = parseFloat(cs['border' + side + 'Width']) || 0;
  if (st === 'none' || st === 'hidden' || !w) return null;
  const col = cssColorToHex(cs['border' + side + 'Color']);
  if (!col) return null;
  return { style: st, width: snapBW(w * 0.75 / (st === 'double' ? 3 : 1)), color: col };
}
function bdrEq(a, b) {
  if (!a || !b) return !a && !b;
  return a.style === b.style && Math.abs(a.width - b.width) < 0.06 && (a.color || '').toLowerCase() === (b.color || '').toLowerCase();
}
function bdrWordXml(tag, b, space = 0, extra = '') {
  if (!b) return `<w:${tag} w:val="nil"/>`;
  return `<w:${tag} w:val="${W_BORDER[b.style] || 'single'}" w:sz="${clamp(Math.round(b.width * 8), 2, 96)}" w:space="${Math.max(0, Math.round(space))}" w:color="${(b.color || '#000000').replace('#', '').toUpperCase()}"${extra}/>`;
}
function bdrFromWord(e) {
  if (!e) return undefined;
  const v = e.getAttributeNS(WNS, 'val') ?? e.getAttribute('w:val');
  if (!v || v === 'nil' || v === 'none') return null;
  const sz = parseFloat(e.getAttributeNS(WNS, 'sz') ?? e.getAttribute('w:sz')) || 4;
  const c = e.getAttributeNS(WNS, 'color') ?? e.getAttribute('w:color');
  return { style: BORDER_FROM_W[v] || 'solid', width: snapBW(Math.max(0.25, sz / 8)), color: c && c !== 'auto' && /^[0-9a-f]{6}$/i.test(c) ? '#' + c.toLowerCase() : '#000000' };
}

/* per-side borders declared in a style object (border, border-top, …), e.g. from Word's HTML */
function declBorders(st) {
  if (!st || !Object.keys(st).some(k => /^border/.test(k))) return null;
  const el = declBorders.el || (declBorders.el = document.createElement('div'));
  el.style.cssText = '';
  for (const [k, v] of Object.entries(st)) if (/^border(-(top|right|bottom|left))?(-(width|style|color))?$/.test(k)) el.style.setProperty(k, String(v).replace(/\bwindowtext\b/gi, '#000000'));
  const out = {};
  let any = false;
  for (const S of ['Top', 'Right', 'Bottom', 'Left']) { const s2 = el.style['border' + S + 'Style']; out[S] = s2 ? bdrOfDecl(s2, el.style['border' + S + 'Width'], el.style['border' + S + 'Color']) : undefined; if (s2) any = true; }
  return any ? out : null;
}
function declPadding(st) {
  const el = declPadding.el || (declPadding.el = document.createElement('div'));
  el.style.cssText = '';
  for (const [k, v] of Object.entries(st || {})) if (/^padding(-(top|right|bottom|left))?$/.test(k)) el.style.setProperty(k, v);
  const out = {};
  for (const S of ['Top', 'Right', 'Bottom', 'Left']) { const v = cssToPt(el.style['padding' + S]); out[S] = v == null ? null : v; }
  return out;
}
/* ---------- shading patterns ---------- */
const SHD_PATTERNS = [['clear', 'Clear'], ['solid', 'Solid (100%)'],
  ...[5, 10, 12.5, 15, 20, 25, 30, 35, 37.5, 40, 45, 50, 55, 60, 62.5, 65, 70, 75, 80, 85, 87.5, 90, 95].map(n => ['pct' + Math.floor(n), n + '%']),
  ['horzStripe', 'Dk Horizontal'], ['vertStripe', 'Dk Vertical'], ['reverseDiagStripe', 'Dk Dwn Diagonal'], ['diagStripe', 'Dk Up Diagonal'], ['horzCross', 'Dk Grid'], ['diagCross', 'Dk Trellis'],
  ['thinHorzStripe', 'Lt Horizontal'], ['thinVertStripe', 'Lt Vertical'], ['thinReverseDiagStripe', 'Lt Dwn Diagonal'], ['thinDiagStripe', 'Lt Up Diagonal'], ['thinHorzCross', 'Lt Grid'], ['thinDiagCross', 'Lt Trellis']];
function shdPct(v) {
  if (v === 'solid') return 100;
  const m = /^pct(\d+)$/.exec(v || '');
  if (!m) return null;
  const n = +m[1];
  return n === 12 ? 12.5 : n === 37 ? 37.5 : n === 62 ? 62.5 : n === 87 ? 87.5 : n;
}
/* stripes and grids in a 6 px tile: r = rectangles, l = lines drawn w wide */
const DN = [[-1, -1, 7, 7], [-1, 5, 1, 7], [5, -1, 7, 1]], UP = [[-1, 7, 7, -1], [-1, 1, 1, -1], [5, 7, 7, 5]];
const PAT_GEOM = {
  horzStripe: { r: [[0, 0, 6, 3]] }, thinHorzStripe: { r: [[0, 0, 6, 1]] },
  vertStripe: { r: [[0, 0, 3, 6]] }, thinVertStripe: { r: [[0, 0, 1, 6]] },
  horzCross: { r: [[0, 0, 6, 2], [0, 0, 2, 6]] }, thinHorzCross: { r: [[0, 0, 6, 1], [0, 0, 1, 6]] },
  reverseDiagStripe: { l: DN, w: 2.1 }, thinReverseDiagStripe: { l: DN, w: 0.9 },
  diagStripe: { l: UP, w: 2.1 }, thinDiagStripe: { l: UP, w: 0.9 },
  diagCross: { l: DN.concat(UP), w: 1.7 }, thinDiagCross: { l: DN.concat(UP), w: 0.85 },
};
function patSvg(kind, color) {
  const g = PAT_GEOM[kind];
  if (!g) return '';
  let s = "<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 6 6'>";
  for (const [x, y, w, hh] of g.r || []) s += `<rect x='${x}' y='${y}' width='${w}' height='${hh}' fill='${color}' shape-rendering='crispEdges'/>`;
  if (g.l) s += `<path d='${g.l.map(([a, b, c, d]) => `M${a} ${b}L${c} ${d}`).join('')}' stroke='${color}' stroke-width='${g.w}' fill='none'/>`;
  return 'data:image/svg+xml,' + encodeURIComponent(s + '</svg>');
}
/* the colour shown for a shading: Word paints percentage patterns as a tint */
function shdColor(shd) {
  if (!shd) return null;
  const pct = shdPct(shd.pat);
  if (pct != null) return mix(shd.fill || '#ffffff', shd.color || '#000000', pct / 100);
  return shd.fill || null;
}
function diagSvg(dd, du) {
  const line = (b, x1, y1, x2, y2) => {
    const px = Math.max(0.6, b.width * 4 / 3);
    const dash = b.style === 'dotted' ? ` stroke-dasharray='${fmtNum(px, 2)} ${fmtNum(px, 2)}'` : b.style === 'dashed' ? ` stroke-dasharray='${fmtNum(px * 3, 2)} ${fmtNum(px * 3, 2)}'` : '';
    return `<line x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}' stroke='${b.color}' stroke-width='${fmtNum(px, 2)}' vector-effect='non-scaling-stroke'${dash}/>`;
  };
  let s = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>";
  if (dd) s += line(dd, 0, 0, 100, 100);
  if (du) s += line(du, 100, 0, 0, 100);
  return 'data:image/svg+xml,' + encodeURIComponent(s + '</svg>');
}
/* background layers for diagonal borders and patterns, from the data attributes */
function decoSync(el) {
  const imgs = [], sizes = [], reps = [];
  const dd = bdrParse(el.getAttribute('data-dd')), du = bdrParse(el.getAttribute('data-du'));
  if (dd || du) { imgs.push(`url("${diagSvg(dd, du)}")`); sizes.push('100% 100%'); reps.push('no-repeat'); }
  const k = el.getAttribute('data-shd');
  if (k && PAT_GEOM[k]) { imgs.push(`url("${patSvg(k, el.getAttribute('data-shdc') || '#000000')}")`); sizes.push('4.5pt 4.5pt'); reps.push('repeat'); }
  const st = el.style;
  if (imgs.length) { st.backgroundImage = imgs.join(', '); st.backgroundSize = sizes.join(', '); st.backgroundRepeat = reps.join(', '); st.backgroundOrigin = 'border-box'; }
  else if (st.backgroundImage) { st.backgroundImage = ''; st.backgroundSize = ''; st.backgroundRepeat = ''; st.backgroundOrigin = ''; }
  if (!el.getAttribute('style')) el.removeAttribute('style');
}
function setDiag(el, key, b) {
  if (b) el.setAttribute('data-' + key, bdrCss(b)); else el.removeAttribute('data-' + key);
  decoSync(el);
}

/* ---------- paragraphs that share a box ---------- */
const PARA_SEL = 'p, h1, h2, h3, h4, h5, h6, li';
function paraBorderSig(el) {
  const s = el.style;
  return [s.borderTop, s.borderBottom, s.borderLeft, s.borderRight, s.getPropertyValue('--bbtw'), s.marginLeft, s.marginRight, s.paddingLeft, s.paddingRight, s.boxShadow].join('|');
}
function markParaGroups() {
  const ed = S.editor;
  const cands = Array.from(ed.querySelectorAll('[style*="border"]')).filter(el => el.matches(PARA_SEL) && (el.style.borderTopStyle || el.style.borderBottomStyle || el.style.borderLeftStyle || el.style.borderRightStyle));
  const old = Array.from(ed.querySelectorAll('[data-bj]'));
  if (!cands.length && !old.length) return;
  const set = new Set(cands);
  const want = new Map();
  const flag = (el, k) => { const f = want.get(el) || {}; f[k] = true; want.set(el, f); };
  for (const el of cands) {
    const nx = el.nextElementSibling;
    if (!nx || !set.has(nx) || (el.tagName === 'LI') !== (nx.tagName === 'LI')) continue;
    if (paraBorderSig(el) !== paraBorderSig(nx)) continue;
    flag(el, 'n'); flag(nx, 'p');
  }
  // the gap between joined paragraphs is filled with padding, so read the natural spacing first
  old.forEach(el => el.removeAttribute('data-bj'));
  const vals = new Map();
  for (const [el, f] of want) if (f.n) {
    const cs = getComputedStyle(el), ncs = getComputedStyle(el.nextElementSibling);
    vals.set(el, { gap: Math.max(parseFloat(cs.marginBottom) || 0, parseFloat(ncs.marginTop) || 0), pb: parseFloat(cs.paddingBottom) || 0 });
  }
  for (const [el, f] of want) {
    el.setAttribute('data-bj', [f.p ? 'p' : '', f.n ? 'n' : ''].filter(Boolean).join(' '));
    const v = vals.get(el);
    if (v) { el.style.setProperty('--bjg', fmtNum(v.gap, 2) + 'px'); el.style.setProperty('--pb0', fmtNum(v.pb, 2) + 'px'); }
    else { el.style.removeProperty('--bjg'); el.style.removeProperty('--pb0'); }
    // a shadowed box keeps only its right-hand shadow until the last paragraph
    const m = f.n && /(rgba?\([^)]*\)|#[0-9a-f]{3,8})?\s*(-?[\d.]+)(pt|px)\s+(-?[\d.]+)(pt|px)/i.exec(el.style.boxShadow || '');
    if (m) el.style.setProperty('--bjsh', `${m[2]}${m[3]} 0 0 0 ${m[1] || 'currentColor'}`); else el.style.removeProperty('--bjsh');
  }
  for (const el of old) if (!want.has(el)) { ['--bjg', '--pb0', '--bjsh'].forEach(k => el.style.removeProperty(k)); if (!el.getAttribute('style')) el.removeAttribute('style'); }
}

const Borders = {
  pen() { const p = Prefs.pen || {}; return { style: p.style || 'solid', width: p.width || 0.5, color: p.color || '#000000' }; },
  setPen(o) { Prefs.pen = Object.assign(this.pen(), o); savePrefs(); UI.refresh(); },

  /* ---------- tables ---------- */
  tableSpec(tbl) {
    if (tbl.classList.contains('tbl-bd')) {
      const v = k => bdrParse(tbl.style.getPropertyValue(k));
      return { top: v('--bt'), bottom: v('--bb'), left: v('--bl'), right: v('--br'), insideH: v('--bh'), insideV: v('--bv') };
    }
    // a preset table: read what it shows
    const G = Tables.grid(tbl), cells = Tables.cells(G);
    if (!cells.length) return { top: null, bottom: null, left: null, right: null, insideH: null, insideV: null };
    const at = (r, c) => { const e = G.g[r] && G.g[r][c]; return e ? getComputedStyle(e.cell) : null; };
    const nr = G.rows.length, nc = G.ncols;
    const tl = at(0, 0), br = at(nr - 1, nc - 1) || tl;
    return { top: bdrComputed(tl, 'Top'), left: bdrComputed(tl, 'Left'), bottom: bdrComputed(br, 'Bottom'), right: bdrComputed(br, 'Right'), insideH: nr > 1 ? bdrComputed(tl, 'Bottom') : null, insideV: nc > 1 ? bdrComputed(tl, 'Right') : null };
  },
  setTableSpec(tbl, sp) {
    ['tbl-grid', 'tbl-plain', 'tbl-lines'].forEach(c => tbl.classList.remove(c));
    tbl.classList.add('tbl-bd');
    tbl.style.border = '';
    for (const [k, v] of [['--bt', sp.top], ['--bb', sp.bottom], ['--bl', sp.left], ['--br', sp.right], ['--bh', sp.insideH], ['--bv', sp.insideV]]) tbl.style.setProperty(k, bdrCss(v));
    Tables.markEdges(tbl);
  },
  /* the border one cell shows on one side, from its own style or the table's */
  cellSide(tbl, x, side, nr, nc) {
    const own = bdrInline(x.el, side);
    if (own !== undefined) return own;
    if (tbl.classList.contains('tbl-bd')) {
      const outer = side === 'Top' ? x.r === 0 : side === 'Bottom' ? x.r + x.rs >= nr : side === 'Left' ? x.c === 0 : x.c + x.cs >= nc;
      const k = outer ? { Top: '--bt', Bottom: '--bb', Left: '--bl', Right: '--br' }[side] : (side === 'Top' || side === 'Bottom' ? '--bh' : '--bv');
      return bdrParse(tbl.style.getPropertyValue(k));
    }
    return bdrComputed(getComputedStyle(x.el), side);
  },
  /* the selection as a grid rectangle */
  rectOf(tbl, cells) {
    const G = Tables.grid(tbl);
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for (const cl of cells) { const p = Tables.pos(G, cl); if (!p) continue; r1 = Math.min(r1, p.r); c1 = Math.min(c1, p.c); r2 = Math.max(r2, p.r + (cl.rowSpan || 1) - 1); c2 = Math.max(c2, p.c + (cl.colSpan || 1) - 1); }
    if (r2 < 0) return null;
    return Tables.expandRect(G, r1, c1, Math.min(r2, G.rows.length - 1), Math.min(c2, G.ncols - 1));
  },
  /* the borders of a cell selection, edge by edge (null when off or mixed) */
  cellState(tbl, R) {
    const G = Tables.grid(tbl), cells = Tables.cells(G), nr = G.rows.length, nc = G.ncols;
    const inR = cells.filter(x => x.r >= R.r1 && x.r + x.rs - 1 <= R.r2 && x.c >= R.c1 && x.c + x.cs - 1 <= R.c2);
    const common = list => { if (!list.length) return undefined; const a = list[0]; return list.every(b => bdrEq(a, b)) ? a : null; };
    const side = (x, s) => this.cellSide(tbl, x, s, nr, nc);
    const st = {
      top: common(inR.filter(x => x.r === R.r1).map(x => side(x, 'Top'))),
      bottom: common(inR.filter(x => x.r + x.rs - 1 === R.r2).map(x => side(x, 'Bottom'))),
      left: common(inR.filter(x => x.c === R.c1).map(x => side(x, 'Left'))),
      right: common(inR.filter(x => x.c + x.cs - 1 === R.c2).map(x => side(x, 'Right'))),
      insideH: R.r2 > R.r1 ? common(inR.filter(x => x.r + x.rs - 1 < R.r2).map(x => side(x, 'Bottom'))) : undefined,
      insideV: R.c2 > R.c1 ? common(inR.filter(x => x.c + x.cs - 1 < R.c2).map(x => side(x, 'Right'))) : undefined,
      diagDown: common(inR.map(x => bdrParse(x.el.getAttribute('data-dd')))),
      diagUp: common(inR.map(x => bdrParse(x.el.getAttribute('data-du')))),
    };
    return st;
  },
  /* set the edges of a cell selection; undefined leaves an edge alone. Cells that
     share an outside edge get the same border, so the line really changes. */
  applyCells(tbl, R, ed) {
    const G = Tables.grid(tbl), cells = Tables.cells(G);
    const set = (el, side, v) => { if (v === undefined) return; el.style['border' + side] = bdrCss(v); };
    for (const x of cells) {
      const inCols = x.c >= R.c1 && x.c + x.cs - 1 <= R.c2, inRows = x.r >= R.r1 && x.r + x.rs - 1 <= R.r2;
      if (inCols && inRows) {
        set(x.el, 'Top', x.r === R.r1 ? ed.top : ed.insideH);
        set(x.el, 'Bottom', x.r + x.rs - 1 === R.r2 ? ed.bottom : ed.insideH);
        set(x.el, 'Left', x.c === R.c1 ? ed.left : ed.insideV);
        set(x.el, 'Right', x.c + x.cs - 1 === R.c2 ? ed.right : ed.insideV);
        if (ed.diagDown !== undefined) setDiag(x.el, 'dd', ed.diagDown);
        if (ed.diagUp !== undefined) setDiag(x.el, 'du', ed.diagUp);
        continue;
      }
      if (inCols && x.r + x.rs === R.r1) set(x.el, 'Bottom', ed.top);
      if (inCols && x.r === R.r2 + 1) set(x.el, 'Top', ed.bottom);
      if (inRows && x.c + x.cs === R.c1) set(x.el, 'Right', ed.left);
      if (inRows && x.c === R.c2 + 1) set(x.el, 'Left', ed.right);
    }
  },
  /* borders for a whole table: the table's own, with cells' borders cleared */
  applyTable(tbl, ed) {
    const cur = this.tableSpec(tbl);
    const sp = {};
    for (const k of ['top', 'bottom', 'left', 'right', 'insideH', 'insideV']) sp[k] = ed[k] === undefined ? cur[k] : ed[k];
    this.setTableSpec(tbl, sp);
    for (const x of Tables.cells(Tables.grid(tbl))) {
      ['borderTop', 'borderBottom', 'borderLeft', 'borderRight', 'border'].forEach(p => x.el.style[p] = '');
      if (ed.diagDown !== undefined) x.el.removeAttribute('data-dd');
      if (ed.diagUp !== undefined) x.el.removeAttribute('data-du');
      if (ed.diagDown) x.el.setAttribute('data-dd', bdrCss(ed.diagDown));
      if (ed.diagUp) x.el.setAttribute('data-du', bdrCss(ed.diagUp));
      decoSync(x.el);
    }
  },

  /* ---------- paragraphs ---------- */
  paraBlocks(r) { return selectedBlocks(r).filter(b => b.matches(PARA_SEL) && !b.closest('.toc')); },
  paraState(blocks) {
    const b = blocks[0];
    const st = { top: null, bottom: null, left: null, right: null, insideH: blocks.length > 1 ? null : undefined, shadow: false, pad: { t: 1, b: 1, l: 4, r: 4 } };
    if (!b) return st;
    for (const [k, s] of [['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]) { const v = bdrInline(b, s); st[k] = v || null; }
    if (blocks.length > 1) st.insideH = bdrParse(b.style.getPropertyValue('--bbtw'));
    st.shadow = !!b.style.boxShadow && b.style.boxShadow !== 'none';
    const p = k => { const v = cssToPt(b.style['padding' + k]); return v == null ? null : v; };
    st.pad = { t: p('Top') ?? 1, b: p('Bottom') ?? 1, l: p('Left') ?? 4, r: p('Right') ?? 4 };
    return st;
  },
  /* Word gives every paragraph of a box the same borders; the box is drawn once around them */
  applyParas(blocks, ed, opt = {}) {
    const pad = opt.pad || { t: 1, b: 1, l: 4, r: 4 };
    for (const b of blocks) {
      for (const [k, s, pk] of [['top', 'Top', 't'], ['bottom', 'Bottom', 'b'], ['left', 'Left', 'l'], ['right', 'Right', 'r']]) {
        if (ed[k] === undefined) continue;
        b.style['border' + s] = ed[k] ? bdrCss(ed[k]) : '';
        b.style['padding' + s] = ed[k] ? fmtNum(pad[pk], 2) + 'pt' : '';
      }
      if (ed.insideH !== undefined) { if (ed.insideH && blocks.length > 1) b.style.setProperty('--bbtw', bdrCss(ed.insideH)); else b.style.removeProperty('--bbtw'); }
      if (opt.shadow !== undefined) {
        const w = Math.max(...['top', 'bottom', 'left', 'right'].map(k => (ed[k] && ed[k].width) || 0));
        const c = (ed.right || ed.bottom || ed.top || {}).color || '#000000';
        b.style.boxShadow = opt.shadow && w ? `${fmtNum(Math.max(1.5, w * 2), 2)}pt ${fmtNum(Math.max(1.5, w * 2), 2)}pt 0 0 ${c}` : '';
      }
      if (!b.getAttribute('style')) b.removeAttribute('style');
    }
  },

  /* ---------- text ---------- */
  textSpan(r) {
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer.childNodes[r.startOffset] || r.startContainer : r.startContainer);
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const sp = el && el.closest && el.closest('span[data-tb], span[data-ts]');
    return sp && S.editor.contains(sp) ? sp : null;
  },
  textState(r) {
    const sp = this.textSpan(r);
    const b = sp && sp.hasAttribute('data-tb') ? bdrInline(sp, 'Top') : null;
    return { top: b || null, bottom: b || null, left: b || null, right: b || null, shadow: !!(sp && sp.style.boxShadow) };
  },
  /* wrap the selected text of each paragraph in one span, so a border runs around
     the whole run (Word draws one box around runs with the same border) */
  wrapText(r, attr) {
    const out = [];
    if (!r || r.collapsed) return out;
    const blocks = selectedBlocks(r);
    for (const b of blocks) {
      const br = document.createRange();
      br.selectNodeContents(b);
      if (br.compareBoundaryPoints(Range.START_TO_START, r) < 0) br.setStart(r.startContainer, r.startOffset);
      if (br.compareBoundaryPoints(Range.END_TO_END, r) > 0) br.setEnd(r.endContainer, r.endOffset);
      if (br.collapsed || !br.toString().replace(/[\u200B\s]/g, '')) continue;
      const probe = br.cloneContents();
      if (Array.from(probe.querySelectorAll('*')).some(n => isBlockEl(n))) continue;
      const frag = br.extractContents();
      frag.querySelectorAll('span[' + attr + ']').forEach(s => { s.removeAttribute(attr); if (attr === 'data-tb') { s.style.border = ''; s.style.padding = ''; s.style.boxShadow = ''; } else { s.style.backgroundColor = ''; ['data-shd', 'data-shdc', 'data-shdf'].forEach(a => s.removeAttribute(a)); decoSync(s); } if (!s.attributes.length) unwrap(s); });
      const sp = h('span', { [attr]: '' });
      sp.appendChild(frag);
      br.insertNode(sp);
      out.push(sp);
    }
    return out;
  },
  applyText(r, b, shadow) {
    if (!b) {
      // remove text borders touching the selection
      const sps = new Set();
      const one = this.textSpan(r); if (one) sps.add(one);
      if (r && !r.collapsed) S.editor.querySelectorAll('span[data-tb]').forEach(s => { if (r.intersectsNode(s)) sps.add(s); });
      for (const s of sps) { s.removeAttribute('data-tb'); s.style.border = ''; s.style.padding = ''; s.style.boxShadow = ''; if (!s.getAttribute('style')) s.removeAttribute('style'); if (!s.attributes.length) unwrap(s); }
      return [];
    }
    const sps = this.wrapText(r, 'data-tb');
    for (const s of sps) {
      s.style.border = bdrCss(b);
      s.style.padding = '0 1pt';
      s.style.boxShadow = shadow ? `${fmtNum(Math.max(1.5, b.width * 2), 2)}pt ${fmtNum(Math.max(1.5, b.width * 2), 2)}pt 0 0 ${b.color}` : '';
    }
    return sps;
  },

  /* ---------- shading: { fill, pat, color } ---------- */
  shdOf(el) {
    if (!el) return { fill: null, pat: 'clear', color: '#000000' };
    const pat = el.getAttribute('data-shd');
    if (pat) { const f = el.getAttribute('data-shdf'); return { fill: f && f !== 'auto' ? f : null, pat, color: el.getAttribute('data-shdc') || '#000000' }; }
    return { fill: cssColorToHex(el.style.backgroundColor) || null, pat: 'clear', color: '#000000' };
  },
  shade(el, shd) {
    const pat = shd && shd.pat && shd.pat !== 'clear' ? shd.pat : null;
    el.style.backgroundColor = shdColor(shd) || '';
    if (pat) { el.setAttribute('data-shd', pat); el.setAttribute('data-shdc', shd.color || '#000000'); el.setAttribute('data-shdf', shd.fill || 'auto'); }
    else ['data-shd', 'data-shdc', 'data-shdf'].forEach(a => el.removeAttribute(a));
    decoSync(el);
  },
  shadeBlocks(blocks, shd) {
    for (const b of blocks) {
      this.shade(b, shd);
      const on = !!(shd && (shd.fill || (shd.pat && shd.pat !== 'clear')));
      const bordered = b.style.borderLeftStyle || b.style.borderRightStyle;
      if (!bordered) { b.style.paddingLeft = on ? (b.style.paddingLeft || '3pt') : ''; b.style.paddingRight = on ? (b.style.paddingRight || '3pt') : ''; }
      if (!b.getAttribute('style')) b.removeAttribute('style');
    }
  },
  shadeText(r, shd) {
    const on = !!(shd && (shd.fill || (shd.pat && shd.pat !== 'clear')));
    if (!on) {
      const sps = new Set();
      if (r && !r.collapsed) S.editor.querySelectorAll('span[data-ts]').forEach(s => { if (r.intersectsNode(s)) sps.add(s); });
      for (const s of sps) { s.removeAttribute('data-ts'); this.shade(s, null); if (!s.attributes.length) unwrap(s); }
      return;
    }
    for (const s of this.wrapText(r, 'data-ts')) this.shade(s, shd);
  },

  /* ---------- the Borders button (Home and Table Design) ---------- */
  inTable() { return !!(Tables.sel && Tables.sel.table.isConnected) || !!Tables.cellAtCaret(); },
  quick(kind) {
    if (S.readOnly) return;
    Prefs.lastBorder = kind; savePrefs();
    const pen = this.pen();
    const toggle = (cur, keys) => { const on = keys.every(k => bdrEq(cur[k], pen)); const out = {}; keys.forEach(k => { out[k] = on ? null : pen; }); return out; };
    // words selected inside one cell get paragraph borders, as in Word
    const rr = getRange() || lastRange;
    const cellOf = n => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el && el.closest ? el.closest('td, th') : null; };
    const c0 = rr && cellOf(rr.startContainer);
    const inText = !!(rr && !rr.collapsed && !Tables.sel && c0 && c0 === cellOf(rr.endContainer) && rr.toString().replace(/\s+/g, '').length < c0.textContent.replace(/\s+/g, '').length);
    if (this.inTable() && !inText) {
      const cells = Tables.selectedCells();
      if (!cells.length) return;
      const tbl = cells[0].closest('table');
      const R = this.rectOf(tbl, cells);
      if (!R) return;
      const cur = this.cellState(tbl, R);
      const multiR = R.r2 > R.r1, multiC = R.c2 > R.c1;
      const inside = [multiR ? 'insideH' : null, multiC ? 'insideV' : null].filter(Boolean);
      let ed;
      switch (kind) {
        case 'none': ed = { top: null, bottom: null, left: null, right: null, insideH: multiR ? null : undefined, insideV: multiC ? null : undefined, diagDown: null, diagUp: null }; break;
        case 'all': ed = toggle(cur, ['top', 'bottom', 'left', 'right', ...inside]); break;
        case 'outside': case 'box': ed = toggle(cur, ['top', 'bottom', 'left', 'right']); break;
        case 'inside': if (!inside.length) return; ed = toggle(cur, inside); break;
        case 'insideH': if (!multiR) return; ed = toggle(cur, ['insideH']); break;
        case 'insideV': if (!multiC) return; ed = toggle(cur, ['insideV']); break;
        case 'diagDown': case 'diagUp': ed = toggle(cur, [kind]); break;
        default: ed = toggle(cur, [kind]);
      }
      change(() => this.applyCells(tbl, R, ed), { full: true });
      return;
    }
    const r = getRange() || lastRange;
    const blocks = this.paraBlocks(r);
    if (!blocks.length) return;
    const cur = this.paraState(blocks);
    let ed;
    switch (kind) {
      case 'none': ed = { top: null, bottom: null, left: null, right: null, insideH: null }; break;
      case 'all': ed = toggle(cur, blocks.length > 1 ? ['top', 'bottom', 'left', 'right', 'insideH'] : ['top', 'bottom', 'left', 'right']); break;
      case 'outside': case 'box': ed = toggle(cur, ['top', 'bottom', 'left', 'right']); break;
      case 'inside': case 'insideH': if (blocks.length < 2) { toast('Select two or more paragraphs to put a line between them.'); return; } ed = toggle(cur, ['insideH']); break;
      case 'insideV': case 'diagDown': case 'diagUp': toast('That border is for table cells. Click in a table first.'); return;
      default: ed = toggle(cur, [kind]);
    }
    change(() => this.applyParas(blocks, ed, { pad: cur.pad }), { full: true });
  },
};
