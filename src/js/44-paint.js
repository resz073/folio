/* ===================== Page painter =====================
   PDF pages are drawn straight from the live layout. Every word is placed where the
   browser put it (Range rects) and drawn with the same font, so what lands in the PDF
   is what is on screen. The same pass records each word for the PDF's text layer. */
const MARK_SYMBOLS = { disc: 1, circle: 1, square: 1 };
function romanize(n, upper) {
  if (n <= 0 || n >= 4000) return String(n);
  const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return upper ? s.toUpperCase() : s;
}
function alphaize(n, upper) { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return upper ? s.toUpperCase() : s; }
function bengaliNum(n) { return String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]); }
const BN_ALPHA = 'কখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহ';
function bnAlpha(n) { let s = ''; while (n > 0) { n--; s = BN_ALPHA[n % BN_ALPHA.length] + s; n = Math.floor(n / BN_ALPHA.length); } return s; }
/* the item a list is under: its <li>, or the item before it when the list sits right in a list */
function parentItem(list) {
  const p = list.parentElement;
  if (!p) return null;
  if (p.tagName === 'LI') return p;
  if (p.tagName === 'OL' || p.tagName === 'UL') { for (let s = list.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === 'LI') return s; }
  return null;
}
/* a list numbered 1.1, 1.1.1 (Multilevel List, data-ml legal): the numbers of the items above */
function legalNumber(li, top) {
  const parts = [];
  for (let x = li; x; ) {
    parts.unshift(listOrdinal(x));
    const l = x.parentElement;
    if (!l || l === top) break;
    x = parentItem(l);
    if (x && !top.contains(x)) break;
  }
  return parts.join('.');
}
function listOrdinal(li) {
  const list = li.parentElement;
  let n = list && list.tagName === 'OL' && list.hasAttribute('start') ? (parseInt(list.getAttribute('start'), 10) || 1) : 1;
  for (let k = list ? list.firstElementChild : null; k && k !== li; k = k.nextElementSibling) {
    if (k.tagName !== 'LI') continue;
    n = k.hasAttribute('value') ? (parseInt(k.getAttribute('value'), 10) || n) + 1 : n + 1;
  }
  if (li.hasAttribute('value')) n = parseInt(li.getAttribute('value'), 10) || n;
  return n;
}
function markerString(li, type) {
  if (/^["']/.test(type)) { try { return JSON.parse('"' + type.slice(1, -1).replace(/"/g, '\\"') + '"'); } catch { return type.slice(1, -1); } }
  const ml = li.parentElement && li.parentElement.closest('ol[data-ml="legal"], ol[data-ml="bn-legal"]');
  if (ml) { const s = legalNumber(li, ml) + '. '; return ml.getAttribute('data-ml') === 'bn-legal' ? bengaliNum(s) : s; }
  const n = listOrdinal(li);
  switch (type) {
    case 'bn-dari': return bengaliNum(n) + '। ';
    case 'bn-close': return bengaliNum(n) + ') ';
    case 'bn-paren': return '(' + bengaliNum(n) + ') ';
    case 'bn-alpha': return bnAlpha(n) + ') ';
    case 'bn-alpha-paren': return '(' + bnAlpha(n) + ') ';
    case 'paren-decimal': return '(' + n + ') ';
    case 'paren-lower-alpha': return '(' + alphaize(n) + ') ';
    case 'paren-lower-roman': return '(' + romanize(n) + ') ';
    case 'lower-roman-paren': return romanize(n) + ') ';
    case 'decimal-leading-zero': return (n < 10 ? '0' : '') + n + '. ';
    case 'decimal-paren': return n + ') ';
    case 'lower-alpha': case 'lower-latin': return alphaize(n) + '. ';
    case 'upper-alpha': case 'upper-latin': return alphaize(n, true) + '. ';
    case 'lower-alpha-paren': return alphaize(n) + ') ';
    case 'lower-roman': return romanize(n) + '. ';
    case 'upper-roman': return romanize(n, true) + '. ';
    case 'bengali': case 'bengali-dot': return bengaliNum(n) + '. ';
    default: return n + '. ';
  }
}
function colorAlpha(c) {
  if (!c || c === 'transparent') return 0;
  const m = /rgba?\(([^)]*)\)/.exec(c);
  if (!m) return 1;
  const p = m[1].split(/[\s,/]+/).filter(Boolean);
  return p.length > 3 ? parseFloat(p[3]) : 1;
}
function applyTextTransform(s, tt) {
  if (tt === 'uppercase') return s.toUpperCase();
  if (tt === 'lowercase') return s.toLowerCase();
  if (tt === 'capitalize') return s.replace(/(^|[\s(“"'‘-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return s;
}
const BORDER_SIDES = [['Top', 't'], ['Right', 'r'], ['Bottom', 'b'], ['Left', 'l']];
const BORDER_RANK = { double: 8, solid: 7, dashed: 6, dotted: 5, ridge: 4, outset: 3, groove: 2, inset: 1 };
function parseShadow(s) {
  if (!s || s === 'none') return null;
  const m = /^(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?(?:\s+(-?[\d.]+)px)?/i.exec(s.trim());
  if (!m) return null;
  return { color: m[1], ox: +m[2], oy: +m[3], blur: +(m[4] || 0), spread: +(m[5] || 0) };
}
function rgbaOf(col) {
  const m = /rgba?\(([^)]+)\)/.exec(col || '');
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
  const hx = cssColorToHex(col) || '#000000';
  return [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16), 1];
}
/* Chromium's colours for the shadowed and lit sides of 3-D borders */
function shade3d(col, dark) {
  const [r, g, b, a] = rgbaOf(col);
  const black = !r && !g && !b;
  let o = [r, g, b];
  if (dark && !black) { const v = Math.max(r, g, b) / 255, k = v ? Math.max(0, (v - 0.33) / v) : 0; o = [r * k, g * k, b * k].map(Math.round); }
  else if (!dark && black) o = [84, 84, 84];
  return `rgba(${o[0]},${o[1]},${o[2]},${a})`;
}

class PaintSession {
  constructor() {
    this.paper = $('#paper');
    this.z = S.zoom || 1;
    const pr = this.paper.getBoundingClientRect();
    this.ox = pr.left; this.oy = pr.top;
    this.styles = new Map();
    this.decos = new Map();
    this.fonts = new Map();
    this.range = document.createRange();
    this.mctx = document.createElement('canvas').getContext('2d');
    this.ops = [];      // drawing operations in paper coordinates
    this.words = [];    // text layer: { s, x, y (baseline), w, size }
    this.links = [];
    this.bgUrls = new Set();
    this.layer = 0;
  }
  cs(el) { let c = this.styles.get(el); if (!c) { c = getComputedStyle(el); this.styles.set(el, c); } return c; }
  box(r) { return { x: (r.left - this.ox) / this.z, y: (r.top - this.oy) / this.z, w: r.width / this.z, h: r.height / this.z }; }
  fontOf(c) {
    const variant = c.fontVariantCaps === 'small-caps' || c.fontVariant === 'small-caps' ? 'small-caps ' : '';
    return `${c.fontStyle === 'normal' ? '' : c.fontStyle + ' '}${variant}${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
  }
  /* the font as the PDF writer needs it: families, weight, style, size, features, language */
  fontInfo(el, c) {
    const fis = this.fis || (this.fis = new Map());
    let fi = fis.get(el);
    if (!fi) {
      const lg = el.closest && el.closest('[lang]');
      const lig = c.fontVariantLigatures || 'normal';
      fi = { fam: c.fontFamily, wt: parseInt(c.fontWeight, 10) || 400, it: c.fontStyle !== 'normal', sz: parseFloat(c.fontSize) || 14,
        caps: c.fontVariantCaps === 'small-caps' || c.fontVariant === 'small-caps', kern: c.fontKerning !== 'none', liga: !/none|no-common/.test(lig),
        lang: (lg && lg.getAttribute('lang')) || (S.doc && S.doc.lang) || '', hy: c.hyphens === 'auto' };
      fis.set(el, fi);
    }
    return fi;
  }
  metrics(font) {
    let m = this.fonts.get(font);
    if (!m) {
      this.mctx.font = font;
      const t = this.mctx.measureText('Hg');
      m = { ascent: t.fontBoundingBoxAscent, descent: t.fontBoundingBoxDescent };
      this.fonts.set(font, m);
    }
    return m;
  }
  /* decorations that apply to text inside el (they propagate from ancestors) */
  decoOf(el, root) {
    if (!el || el === root) return [];
    let d = this.decos.get(el);
    if (d) return d;
    const parent = this.decoOf(el.parentElement, root);
    const c = this.cs(el);
    const line = c.textDecorationLine;
    d = parent;
    if (line && line !== 'none' && colorAlpha(c.textDecorationColor) > 0) {
      d = parent.concat([{ line, style: c.textDecorationStyle, color: c.textDecorationColor, thick: c.textDecorationThickness, size: parseFloat(c.fontSize) || 14, block: !/^inline/.test(c.display) }]);
    }
    this.decos.set(el, d);
    return d;
  }
  push(op) { op.layer = op.layer != null ? op.layer : this.layer; this.ops.push(op); }
  /* text, list numbers and underlines: over the boxes (in a shape: over the shape) */
  textLayer() { return this.inShape != null ? this.layer : 2; }

  walk(el, ctx) {
    const c = this.cs(el);
    if (c.display === 'none') return;
    if (el.matches('span.pg-line, span.qm, hr.pb, .img-frame, .pnum-hint, .shp-draw')) return;
    const visible = c.visibility === 'visible';
    // a shape or text box: its outline, then its text (in its shadow root)
    if (el.tagName === 'SPAN' && el.classList.contains('shp')) { if (visible) this.paintShape(el, ctx); return; }
    const tag = el.tagName;
    const isFloat = c.float !== 'none';
    const prevLayer = this.layer;
    if (isFloat) this.layer = 1;
    if (visible && el !== ctx.root) this.paintBox(el, c, ctx);
    let clip = ctx.clip;
    if (el !== ctx.root && (c.overflowX !== 'visible' || c.overflowY !== 'visible') && tag !== 'IMG') {
      const b = this.box(el.getBoundingClientRect());
      clip = clip ? intersectBox(clip, b) : b;
    }
    if (tag === 'IMG') { if (visible) this.paintImg(el, c, clip); this.layer = prevLayer; return; }
    if (/^H[1-3]$/.test(tag) && visible && ctx.body) { const t = el.textContent.replace(/\s+/g, ' ').trim(); if (t) (this.heads || (this.heads = [])).push({ level: +tag[1], text: t.slice(0, 200), y: this.box(el.getBoundingClientRect()).y + pushOf(el) }); }
    if (tag === 'LI' && visible && c.display === 'list-item') this.paintMarker(el, c, clip);
    if (tag === 'A' && visible) this.collectLink(el);
    const sub = clip === ctx.clip ? ctx : Object.assign({}, ctx, { clip });
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { if (visible) this.paintText(n, el, c, sub); }
      else if (n.nodeType === 1) this.walk(n, sub);
    }
    this.layer = prevLayer;
  }

  /* a table's grid, once per session, for collapsed border conflicts */
  gridOf(tbl) {
    let g = this.grids && this.grids.get(tbl);
    if (!g) {
      const G = Tables.grid(tbl), pos = new Map();
      for (const x of Tables.cells(G)) pos.set(x.el, x);
      g = { G, pos };
      (this.grids || (this.grids = new Map())).set(tbl, g);
    }
    return g;
  }
  /* collapsed borders: the neighbour across a side draws the shared line when its border wins */
  yields(el, side, mine) {
    const tbl = el.closest('table');
    if (!tbl) return false;
    const { G, pos } = this.gridOf(tbl);
    const x = pos.get(el);
    if (!x) return false;
    let r, c;
    if (side === 't') { r = x.r - 1; c = x.c + (x.cs >> 1); }
    else if (side === 'b') { r = x.r + x.rs; c = x.c + (x.cs >> 1); }
    else if (side === 'l') { r = x.r + (x.rs >> 1); c = x.c - 1; }
    else { r = x.r + (x.rs >> 1); c = x.c + x.cs; }
    const e = G.g[r] && G.g[r][c];
    if (!e || e.cell === el) return false;
    const opp = { t: 'Bottom', b: 'Top', l: 'Right', r: 'Left' }[side];
    const nc = this.cs(e.cell);
    const st = nc['border' + opp + 'Style'];
    const w = st === 'none' || st === 'hidden' ? 0 : parseFloat(nc['border' + opp + 'Width']) || 0;
    if (!w || colorAlpha(nc['border' + opp + 'Color']) <= 0) return false;
    if (Math.abs(w - mine.w) > 0.01) return w > mine.w;
    const ra = BORDER_RANK[st] || 0, rb = BORDER_RANK[mine.st] || 0;
    if (ra !== rb) return ra > rb;
    return side === 't' || side === 'l';
  }
  paintBox(el, c, ctx) {
    const inline = c.display === 'inline' && el.tagName !== 'IMG';
    const bg = c.backgroundColor;
    const hasBg = colorAlpha(bg) > 0;
    const pat = el.getAttribute('data-shd');
    const patOn = pat && PAT_GEOM[pat];
    const dd = bdrParse(el.getAttribute('data-dd')), du = bdrParse(el.getAttribute('data-du'));
    const deco = !!(el.hasAttribute('data-shd') || dd || du);
    const bgImg = !deco && c.backgroundImage && c.backgroundImage !== 'none' ? c.backgroundImage : null;
    const shadow = parseShadow(c.boxShadow);
    const bw = {};
    let anyBorder = false;
    for (const [side, k] of BORDER_SIDES) {
      const st = c['border' + side + 'Style'];
      const w = st === 'none' || st === 'hidden' ? 0 : parseFloat(c['border' + side + 'Width']) || 0;
      const col = c['border' + side + 'Color'];
      bw[k] = { w, st, col };
      if (w > 0 && colorAlpha(col) > 0) anyBorder = true;
    }
    if (!hasBg && !bgImg && !anyBorder && !patOn && !dd && !du && !shadow) return;
    const patColor = el.getAttribute('data-shdc') || '#000000';
    const patUrl = patOn ? patSvg(pat, patColor) : null;
    if (patUrl) this.bgUrls.add(patUrl);
    if (inline) {
      const rects = Array.from(el.getClientRects()).map(r => this.box(r)).filter(b => b.w > 0.2);
      rects.forEach((b, i) => {
        // inline highlights go under the text (in a shape: over the shape, under its text)
        const IL = this.inShape != null ? this.inShape : 2;
        if (shadow) this.pushShadow(b, shadow, ctx.clip, IL);
        if (hasBg) this.push({ t: 'rect', ...b, fill: bg, clip: ctx.clip, layer: IL });
        if (patOn) this.push({ t: 'pat', ...b, kind: pat, color: patColor, url: patUrl, clip: ctx.clip, layer: IL });
        if (!anyBorder) return;
        const line = (k, x1, y1, x2, y2) => { const s2 = bw[k]; if (s2.w > 0 && colorAlpha(s2.col) > 0) this.push({ t: 'line', x1, y1, x2, y2, w: s2.w, color: s2.col, style: s2.st, side: k, clip: ctx.clip, layer: IL }); };
        line('t', b.x, b.y + bw.t.w / 2, b.x + b.w, b.y + bw.t.w / 2);
        line('b', b.x, b.y + b.h - bw.b.w / 2, b.x + b.w, b.y + b.h - bw.b.w / 2);
        if (i === 0) line('l', b.x + bw.l.w / 2, b.y, b.x + bw.l.w / 2, b.y + b.h);
        if (i === rects.length - 1) line('r', b.x + b.w - bw.r.w / 2, b.y, b.x + b.w - bw.r.w / 2, b.y + b.h);
      });
      return;
    }
    const raw = this.box(el.getBoundingClientRect());
    if (raw.w <= 0 || raw.h <= 0) return;
    const b = Object.assign({}, raw);
    const pgp = pushOf(el);
    if (pgp) { b.y += pgp; b.h -= pgp; }
    const body = ctx.body;
    if (shadow) this.pushShadow(b, shadow, ctx.clip, null, body);
    if (hasBg) this.push({ t: 'rect', ...b, fill: bg, body, clip: ctx.clip });
    if (patOn) this.push({ t: 'pat', ...b, kind: pat, color: patColor, url: patUrl, body, clip: ctx.clip });
    if (bgImg) {
      const m = /url\("?([^")]+)"?\)/.exec(bgImg);
      if (m) {
        const url = m[1];
        this.bgUrls.add(url);
        const bl = bw.l.w, bt = bw.t.w;
        const px = parseFloat(c.backgroundPositionX) || 0, py = parseFloat(c.backgroundPositionY) || 0;
        const sz = (c.backgroundSize || '').split(/\s+/).map(v => parseFloat(v));
        const w = sz[0] || 16, hgt = sz[1] || w;
        this.push({ t: 'bgimg', url, x: raw.x + bl + px, y: raw.y + bt + py, w, h: hgt, clip: ctx.clip });
      }
    }
    for (const [d, x1, y1, x2, y2] of [[dd, b.x, b.y, b.x + b.w, b.y + b.h], [du, b.x + b.w, b.y, b.x, b.y + b.h]]) {
      if (d) this.push({ t: 'diag', x1, y1, x2, y2, w: Math.max(0.6, d.width * 4 / 3), color: d.color, style: d.style, body, clip: ctx.clip });
    }
    if (anyBorder) {
      // collapsed table borders are centred on the shared cell edge; others sit inside the box
      const isCell = el.tagName === 'TD' || el.tagName === 'TH';
      const collapsed = isCell && this.cs(el.closest('table') || el).borderCollapse === 'collapse';
      const half = side => collapsed ? 0 : bw[side].w / 2;
      const line = (side, x1, y1, x2, y2) => {
        const s2 = bw[side];
        if (!(s2.w > 0 && colorAlpha(s2.col) > 0)) return;
        if (collapsed && this.yields(el, side, s2)) return;
        this.push({ t: 'line', x1, y1, x2, y2, w: s2.w, color: s2.col, style: s2.st, side, coll: collapsed, body, clip: ctx.clip });
      };
      line('t', b.x, b.y + half('t'), b.x + b.w, b.y + half('t'));
      line('b', b.x, b.y + b.h - half('b'), b.x + b.w, b.y + b.h - half('b'));
      line('l', b.x + half('l'), b.y, b.x + half('l'), b.y + b.h);
      line('r', b.x + b.w - half('r'), b.y, b.x + b.w - half('r'), b.y + b.h);
    }
  }
  /* a solid offset shadow (Word's border shadow): the part outside the box */
  pushShadow(b, sh, clip, layer, body) {
    if (!(colorAlpha(sh.color) > 0) || sh.blur > 0.5) return;
    const ox = sh.ox + sh.spread, oy = sh.oy + sh.spread;
    const L = layer == null ? {} : { layer };
    if (ox > 0) this.push({ t: 'rect', x: b.x + b.w, y: b.y + Math.max(0, oy), w: ox, h: b.h, fill: sh.color, clip, body, ...L });
    if (oy > 0) this.push({ t: 'rect', x: b.x + Math.max(0, ox), y: b.y + b.h, w: b.w, h: oy, fill: sh.color, clip, body, ...L });
  }

  /* a shape: its outline as a path (turned about its centre when it is turned), its text measured
     with the turn taken off and drawn turned the same way, just over the shape */
  paintShape(el, ctx) {
    const a = Shapes.attrs(el), sz = Shapes.size(el);
    const layer = el.classList.contains('img-front') ? 3 : el.classList.contains('img-behind') ? 0.5 : this.layer === 1 ? 1 : 2;
    const keepT = el.style.transform;
    if (a.rot) el.style.transform = 'none';
    try {
      const b = this.box(el.getBoundingClientRect());
      const g = Shapes.geom(el, a, sz);
      const R = a.rot ? { cx: b.x + b.w / 2, cy: b.y + b.h / 2, deg: a.rot } : null;
      let bb = { x: b.x, y: b.y, w: b.w, h: b.h };
      if (R) { const r = a.rot * Math.PI / 180, cw = Math.abs(Math.cos(r)), sw = Math.abs(Math.sin(r)), W = b.w * cw + b.h * sw, H = b.w * sw + b.h * cw; bb = { x: R.cx - W / 2, y: R.cy - H / 2, w: W, h: H }; }
      const lw = a.stroke === 'none' ? 0 : a.lw / 0.75;
      this.push({ t: 'shape', x: bb.x, y: bb.y, w: bb.w, h: bb.h, ox: b.x, oy: b.y, sw: sz.w, sh: sz.h, d: g.d, heads: g.heads || [], fill: g.open || a.fill === 'none' ? null : a.fill, stroke: a.stroke === 'none' || !lw ? null : a.stroke, lw, dash: shapeDash(a.dash, lw), round: a.dash === 'sysDot', flip: a.line ? '' : a.flip, rot: R, clip: ctx.clip, layer });
      const tx = !g.open && el.shadowRoot && el.shadowRoot.querySelector('.tx');
      if (tx) {
        const i0 = this.ops.length, keepL = this.layer, keepS = this.inShape;
        this.layer = layer + 0.01; this.inShape = layer + 0.005;
        try { this.walk(tx, Object.assign({}, ctx, { root: tx, body: false })); }
        finally { this.layer = keepL; this.inShape = keepS; }
        if (R) for (let i = i0; i < this.ops.length; i++) this.ops[i].rot = R;
      }
    } finally { if (a.rot) el.style.transform = keepT; }
  }
  paintImg(img, c, clip) {
    if (!img.complete || !img.naturalWidth) return;
    const b = this.box(img.getBoundingClientRect());
    const bl = parseFloat(c.borderLeftWidth) || 0, bt = parseFloat(c.borderTopWidth) || 0, br = parseFloat(c.borderRightWidth) || 0, bb = parseFloat(c.borderBottomWidth) || 0;
    const pl = parseFloat(c.paddingLeft) || 0, pt = parseFloat(c.paddingTop) || 0, pr = parseFloat(c.paddingRight) || 0, pb = parseFloat(c.paddingBottom) || 0;
    const x = b.x + bl + pl, y = b.y + bt + pt, w = b.w - bl - br - pl - pr, hgt = b.h - bt - bb - pt - pb;
    // behind the text: over the page's colour and watermark, under everything else; in front: over all of it
    const layer = img.classList.contains('img-front') ? 3 : img.classList.contains('img-behind') ? 0.5 : this.layer === 1 ? 1 : 2;
    if (w > 0 && hgt > 0) this.push({ t: 'img', el: img, x, y, w, h: hgt, clip, layer });
  }

  firstBaseline(li) {
    const w = document.createTreeWalker(li, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: n => {
      if (n.nodeType === 1) return n.tagName === 'UL' || n.tagName === 'OL' || n.classList.contains('pg-line') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      return /[^\s\u200B\u2060\uFEFF]/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    } });
    const t = w.nextNode();
    if (!t) return null;
    const i = t.data.search(/[^\s\u200B\u2060\uFEFF]/);
    this.range.setStart(t, i); this.range.setEnd(t, i + 1);
    const r = Array.from(this.range.getClientRects()).find(x => x.width > 0.01);
    if (!r) return null;
    return this.box(r).y + this.metrics(this.fontOf(this.cs(t.parentElement))).ascent;
  }

  paintMarker(li, c, clip) {
    const type = c.listStyleType;
    if (!type || type === 'none') return;
    const lb = this.box(li.getBoundingClientRect());
    const font = this.fontOf(c);
    const fm = this.metrics(font);
    let base = this.firstBaseline(li);
    if (base == null) base = lb.y + pushOf(li) + fm.ascent;
    if (MARK_SYMBOLS[type]) {
      // Chromium draws these as shapes sized from the font ascent (list_marker.cc)
      const asc = Math.round(fm.ascent);
      const off = Math.floor(asc * 2 / 3);
      const size = Math.floor((off + 1) / 2);
      const x = lb.x - (off + 8) + 1;
      const y = base - asc + Math.floor(3 * (asc - off) / 2);
      this.push({ t: 'mark', kind: type, x, y, size, color: c.color, clip, layer: this.textLayer() });
      this.words.push({ s: type === 'square' ? '▪' : type === 'circle' ? '◦' : '•', x, y: base, w: size, size: parseFloat(c.fontSize) || 14, space: true });
      return;
    }
    const s = markerString(li, type);
    this.mctx.font = font;
    const w = this.mctx.measureText(s).width;
    this.push({ t: 'text', s, x: lb.x - w, y: base, font, color: c.color, ls: 0, clip, layer: this.textLayer(), fi: this.fontInfo(li, c), w });
    this.words.push({ s: s.trim(), x: lb.x - w, y: base, w: this.mctx.measureText(s.trim()).width, size: parseFloat(c.fontSize) || 14, space: true });
  }

  collectLink(a) {
    const href = a.getAttribute('href') || '';
    if (!/^(https?:|mailto:)/i.test(href)) return;
    for (const r of a.getClientRects()) { const b = this.box(r); if (b.w > 1 && b.h > 1) this.links.push({ ...b, url: href }); }
  }

  paintText(node, el, c, ctx) {
    const data = node.data;
    if (!data) return;
    const font = this.fontOf(c);
    const fi = this.fontInfo(el, c);
    const fm = this.metrics(font);
    const size = parseFloat(c.fontSize) || 14;
    const ls = c.letterSpacing === 'normal' ? 0 : parseFloat(c.letterSpacing) || 0;
    const tt = c.textTransform && c.textTransform !== 'none' ? c.textTransform : null;
    const rg = this.range;
    // decorations run under spaces too, so they follow the node's line boxes
    const deco = this.decoOf(el, ctx.root);
    if (deco.length) {
      rg.selectNodeContents(node);
      for (const r of rg.getClientRects()) {
        const b = this.box(r);
        if (b.w < 0.5) continue;
        const base = b.y + fm.ascent;
        for (const d of deco) this.decoLines(d, b.x, b.x + b.w, base, fm, ctx.clip);
      }
    }
    const re = /[^\s\u200B\u2060\uFEFF]+/g;
    let m;
    while ((m = re.exec(data))) {
      const s = m.index, e = s + m[0].length;
      rg.setStart(node, s); rg.setEnd(node, e);
      const rects = Array.from(rg.getClientRects()).filter(r => r.width > 0.01);
      if (!rects.length) continue;
      const spaceAfter = /[ \t\u00A0]/.test(data[e] || '');
      const t0 = rects[0].top;
      if (rects.every(r => Math.abs(r.top - t0) <= 2 * this.z)) {
        const b = this.box(rects[0]);
        const last = this.box(rects[rects.length - 1]);
        this.emitWord({ s: m[0], x: b.x, y: b.y + fm.ascent, w: last.x + last.w - b.x, size, space: spaceAfter }, font, c.color, ls, tt, ctx.clip, fi);
        continue;
      }
      // a word broken across lines: split it where the line changes
      let start = s, top = null;
      const flush = (end, last) => {
        if (end <= start) return;
        rg.setStart(node, start); rg.setEnd(node, end);
        const rr = Array.from(rg.getClientRects()).filter(r => r.width > 0.01);
        if (!rr.length) return;
        const b0 = this.box(rr[0]);
        const bw = rr.reduce((acc, r) => acc + r.width, 0) / this.z;
        // a word broken by hyphenation shows a hyphen at the end of the line
        const part = data.slice(start, end);
        const hy = !last && (data[end - 1] === '\u00AD' || (fi.hy && /\p{L}$/u.test(part)));
        this.emitWord({ s: part, x: b0.x, y: b0.y + fm.ascent, w: bw, size, space: last && spaceAfter, hy }, font, c.color, ls, tt, ctx.clip, fi);
      };
      for (let i = s; i < e;) {
        const step = data.codePointAt(i) > 0xFFFF ? 2 : 1;
        rg.setStart(node, i); rg.setEnd(node, i + step);
        const r = Array.from(rg.getClientRects()).find(x => x.width > 0.01);
        if (r) {
          if (top == null) top = r.top;
          else if (Math.abs(r.top - top) > 2 * this.z) { flush(i, false); start = i; top = r.top; }
        }
        i += step;
      }
      flush(e, true);
    }
  }

  emitWord(word, font, color, ls, tt, clip, fi) {
    let s = (tt ? applyTextTransform(word.s, tt) : word.s).replace(/\u00AD/g, '');
    if (!s) return;
    if (word.hy) s += '-';
    this.push({ t: 'text', s, x: word.x, y: word.y, font, color, ls, clip, layer: this.layer === 1 ? 1 : this.textLayer(), fi, w: word.w, hy: !!word.hy, sp: !!word.space });
    this.words.push({ s: word.hy ? s.slice(0, -1) : s, x: word.x, y: word.y, w: word.w, size: word.size, space: word.space, sheet: this.inSheet });
  }

  decoLines(d, x1, x2, base, fm, clip) {
    // Chromium: auto thickness is a tenth of the font size, drawn in whole device pixels;
    // the underline starts ceil(thickness / 2) below the baseline, line-through about a third of the ascent up
    const f = d.size;
    let raw = parseFloat(d.thick);
    if (!raw || isNaN(raw)) raw = f / 10;
    for (const kind of d.line.split(/\s+/)) {
      let top;
      if (kind === 'underline') top = base + Math.max(1, Math.ceil(raw / 2));
      else if (kind === 'line-through') top = base - fm.ascent / 3 - raw / 2 + (d.block ? 0.5 : 0);
      else if (kind === 'overline') top = base - fm.ascent;
      else continue;
      this.push({ t: 'deco', x1, x2, top, raw, color: d.color, style: d.style, clip, layer: this.textLayer() });
    }
  }
}
function intersectBox(a, b) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w), btm = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, btm - y) };
}

/* Collect everything once, then hand back per-page lists */
async function collectPaint() {
  if (Story.cur) Story.close();
  const paper = $('#paper');
  paper.classList.add('exporting');
  // pages side by side: the text goes back to one column, and so do the sheets
  const moved = [];
  const sheets = Array.from($('#sheets').children);
  if (Grid.on) {
    Grid.lift();
    sheets.forEach((sh, i) => { moved.push([sh, sh.style.left, sh.style.top]); sh.style.left = Pages.x(i) + 'px'; sh.style.top = Pages.top(i) + 'px'; });
  }
  let P;
  try {
    P = new PaintSession();
    // sheets: page colour, header, footer, border, watermark
    P.sheetOps = sheets.map(() => []);
    P.inSheet = true;
    sheets.forEach((sh, i) => {
      const keep = P.ops; P.ops = P.sheetOps[i];
      for (const k of Array.from(sh.children)) {
        if (k.classList.contains('wm')) {
          const c = P.cs(k), g = Pages.g(i);
          P.push({ t: 'wm', s: k.textContent, font: P.fontOf(c), fi: P.fontInfo(k, c), color: c.color, alpha: parseFloat(c.opacity) || 0.45, x: Pages.x(i) + g.w / 2, y: Pages.top(i) + g.h / 2, layer: 0 });
        } else P.walk(k, { root: sh, clip: null, body: false });
      }
      P.ops = keep;
    });
    P.inSheet = false;
    P.layer = 0;
    P.walk(S.editor, { root: S.editor, clip: null, body: true });
  } finally { moved.forEach(([sh, l, t]) => { sh.style.left = l; sh.style.top = t; }); paper.classList.remove('exporting'); Grid.apply(); }
  // pictures used as backgrounds (checklist boxes)
  P.bgImages = new Map();
  await Promise.all(Array.from(P.bgUrls).map(url => new Promise(res => { const im = new Image(); im.onload = () => { P.bgImages.set(url, im); res(); }; im.onerror = () => res(); im.src = url; })));
  return P;
}

function opRange(op) {
  switch (op.t) {
    case 'text': return [op.y - 1, op.y];
    case 'line': case 'diag': return [Math.min(op.y1, op.y2), Math.max(op.y1, op.y2)];
    case 'deco': return [op.top, op.top + op.raw];
    case 'mark': return [op.y, op.y + op.size];
    default: return [op.y, op.y + (op.h || 0)];
  }
}
function pageOps(P, i) {
  const g = Pages.g(i);
  const top = Pages.top(i), bottom = top + g.h;
  const out = [];
  for (const op of P.ops) {
    const [y0, y1] = opRange(op);
    if (y1 < top || y0 > bottom) continue;
    if (op.t === 'text' && (op.y < top || op.y > bottom)) continue;
    if (op.body && (y0 < top || y1 > bottom)) {
      // a box that runs over a page break: keep it to this page's body area
      const clip = { x: -1e4, y: top + g.mt, w: 2e4, h: g.h - g.mt - g.mb };
      out.push(Object.assign({}, op, { clip: op.clip ? intersectBox(op.clip, clip) : clip }));
    } else out.push(op);
  }
  return out.sort((a, b) => a.layer - b.layer);
}

/* T maps paper coordinates to device pixels: dev = (x * sc + dx, y * sc + dy).
   Text is drawn through the transform; boxes and rules are snapped to whole device
   pixels first, the way the browser paints them, so thin lines stay crisp. */
function drawOps(ctx, ops, P, T) {
  const sc = T.sc;
  const DX = v => v * sc + T.dx, DY = v => v * sc + T.dy;
  // turn: a turned shape's (or its text's) turn about the shape's centre, in device pixels
  let turn = null;
  const page = () => (turn ? ctx.setTransform(turn.multiply(new DOMMatrix([sc, 0, 0, sc, T.dx, T.dy]))) : ctx.setTransform(sc, 0, 0, sc, T.dx, T.dy));
  const dev = () => (turn ? ctx.setTransform(turn) : ctx.setTransform(1, 0, 0, 1, 0, 0));
  const snapBox = (x, y, w, h) => {
    let x0 = Math.round(DX(x)), x1 = Math.round(DX(x + w)), y0 = Math.round(DY(y)), y1 = Math.round(DY(y + h));
    if (w > 0 && x1 <= x0) x1 = x0 + 1;
    if (h > 0 && y1 <= y0) y1 = y0 + 1;
    return [x0, y0, x1 - x0, y1 - y0];
  };
  let font = '';
  for (const op of ops) {
    const clipped = !!op.clip;
    if (clipped) {
      if (op.clip.w <= 0 || op.clip.h <= 0) continue;
      ctx.save(); dev(); ctx.beginPath(); ctx.rect(DX(op.clip.x), DY(op.clip.y), op.clip.w * sc, op.clip.h * sc); ctx.clip();
    }
    turn = op.rot ? new DOMMatrix().translate(DX(op.rot.cx), DY(op.rot.cy)).rotate(op.rot.deg).translate(-DX(op.rot.cx), -DY(op.rot.cy)) : null;
    switch (op.t) {
      case 'rect': { dev(); ctx.fillStyle = op.fill; ctx.fillRect(...snapBox(op.x, op.y, op.w, op.h)); break; }
      case 'img': { dev(); try { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(op.el, ...snapBox(op.x, op.y, op.w, op.h)); } catch { } break; }
      case 'bgimg': { dev(); const im = P.bgImages.get(op.url); if (im) ctx.drawImage(im, ...snapBox(op.x, op.y, op.w, op.h)); break; }
      case 'mark': {
        dev();
        ctx.fillStyle = op.color; ctx.strokeStyle = op.color;
        const [x0, y0, w] = snapBox(op.x, op.y, op.size, op.size);
        if (op.kind === 'square') ctx.fillRect(x0, y0, w, w);
        else {
          const r = w / 2, lw = Math.max(1, Math.round(sc));
          ctx.beginPath(); ctx.ellipse(x0 + r, y0 + r, op.kind === 'circle' ? r - lw / 2 : r, op.kind === 'circle' ? r - lw / 2 : r, 0, 0, Math.PI * 2);
          if (op.kind === 'circle') { ctx.lineWidth = lw; ctx.stroke(); } else ctx.fill();
        }
        break;
      }
      case 'text':
        page();
        if (op.font !== font) { ctx.font = op.font; font = op.font; }
        ctx.fillStyle = op.color;
        ctx.letterSpacing = (op.ls || 0) + 'px';
        ctx.fillText(op.s, op.x, op.y);
        break;
      case 'line': dev(); drawRule(ctx, op, DX, DY, sc); break;
      case 'shape': dev(); drawShape(ctx, op, DX, DY, sc); break;
      case 'diag': dev(); drawDiag(ctx, op, DX, DY, sc); break;
      case 'pat': dev(); drawPat(ctx, op, DX, DY, sc, snapBox, P); break;
      case 'deco': dev(); drawDeco(ctx, op, DX, DY, sc); break;
      case 'wm':
        page();
        ctx.save();
        ctx.globalAlpha = op.alpha;
        ctx.translate(op.x, op.y); ctx.rotate(-Math.PI / 4);
        ctx.font = op.font; font = op.font;
        ctx.fillStyle = op.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.letterSpacing = '0px';
        ctx.fillText(op.s, 0, 0);
        ctx.restore();
        break;
    }
    if (clipped) { ctx.restore(); font = ''; }
    if (turn) { turn = null; font = ''; }
  }
  page();
}
/* a shape's outline (and a line's arrowheads) */
function drawShape(ctx, op, DX, DY, sc) {
  const fh = op.flip.includes('h'), fv = op.flip.includes('v');
  const m = new DOMMatrix().translate(DX(op.ox), DY(op.oy)).scale(sc, sc).translate(fh ? op.sw : 0, fv ? op.sh : 0).scale(fh ? -1 : 1, fv ? -1 : 1);
  const base = ctx.getTransform();
  ctx.setTransform(base.multiply(m));
  const p = new Path2D(op.d);
  if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(p); }
  if (op.stroke) {
    ctx.strokeStyle = op.stroke; ctx.lineWidth = op.lw; ctx.lineJoin = 'miter'; ctx.lineCap = op.round ? 'round' : 'butt';
    ctx.setLineDash(op.dash || []);
    ctx.stroke(p);
    ctx.setLineDash([]); ctx.lineCap = 'butt';
    ctx.fillStyle = op.stroke;
    for (const hd of op.heads || []) ctx.fill(new Path2D(hd));
  }
  ctx.setTransform(base);
}
/* box borders: whole device pixels, at least one */
function drawRule(ctx, op, DX, DY, sc) {
  const horiz = Math.abs(op.y2 - op.y1) < 0.01;
  const t = Math.max(1, Math.floor(op.w * sc + 0.01));
  ctx.fillStyle = op.color; ctx.strokeStyle = op.color;
  if (op.style === 'dotted' || op.style === 'dashed') {
    // thin dots are drawn as squares on whole pixels, thicker ones round
    const round = op.style === 'dotted' && t >= 3;
    ctx.lineWidth = t;
    ctx.lineCap = round ? 'round' : 'butt';
    ctx.setLineDash(op.style === 'dotted' ? (round ? [0.01, t * 2] : [t, t]) : [t * 3, t * 3]);
    ctx.lineDashOffset = 0;
    ctx.beginPath();
    if (horiz) { const y = Math.round(DY(op.y1) - t / 2) + t / 2, xa = Math.floor(DX(op.x1)), xb = Math.round(DX(op.x2)); ctx.moveTo(xa + (round ? t / 2 : 0), y); ctx.lineTo(xb, y); }
    else { const x = Math.round(DX(op.x1) - t / 2) + t / 2, ya = Math.round(DY(op.y1)), yb = Math.round(DY(op.y2)); ctx.moveTo(x, ya + (round ? t / 2 : 0)); ctx.lineTo(x, yb); }
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'butt';
    return;
  }
  if (/^(groove|ridge|inset|outset)$/.test(op.style)) {
    let st = op.style;
    if (op.coll) st = st === 'inset' ? 'ridge' : st === 'outset' ? 'groove' : st;
    const tl = op.side === 't' || op.side === 'l';
    const strips = st === 'inset' || st === 'outset' ? [[t, shade3d(op.color, (st === 'inset') === tl)]]
      : t < 2 ? [[t, op.color]] : [[Math.ceil(t / 2), shade3d(op.color, st === 'groove')], [t - Math.ceil(t / 2), shade3d(op.color, st !== 'groove')]];
    let off = 0;
    for (const [n, col] of strips) {
      ctx.fillStyle = col;
      if (horiz) { const y0 = Math.round(DY(op.y1) - t / 2) + off, x0 = Math.round(DX(op.x1)); ctx.fillRect(x0, y0, Math.max(1, Math.round(DX(op.x2)) - x0), n); }
      else { const x0 = Math.round(DX(op.x1) - t / 2) + off, y0 = Math.round(DY(op.y1)); ctx.fillRect(x0, y0, n, Math.max(1, Math.round(DY(op.y2)) - y0)); }
      off += n;
    }
    return;
  }
  if (op.style === 'double' && t >= 3) {
    const g = Math.max(1, Math.round(t / 3));
    if (horiz) { const y0 = Math.round(DY(op.y1) - t / 2), x0 = Math.round(DX(op.x1)), w = Math.round(DX(op.x2)) - x0; ctx.fillRect(x0, y0, w, g); ctx.fillRect(x0, y0 + t - g, w, g); }
    else { const x0 = Math.round(DX(op.x1) - t / 2), y0 = Math.round(DY(op.y1)), hh = Math.round(DY(op.y2)) - y0; ctx.fillRect(x0, y0, g, hh); ctx.fillRect(x0 + t - g, y0, g, hh); }
    return;
  }
  if (horiz) { const y0 = Math.round(DY(op.y1) - t / 2), x0 = Math.round(DX(op.x1)); ctx.fillRect(x0, y0, Math.max(1, Math.round(DX(op.x2)) - x0), t); }
  else { const x0 = Math.round(DX(op.x1) - t / 2), y0 = Math.round(DY(op.y1)); ctx.fillRect(x0, y0, t, Math.max(1, Math.round(DY(op.y2)) - y0)); }
}
/* diagonal cell borders */
function drawDiag(ctx, op, DX, DY, sc) {
  const t = Math.max(1, op.w * sc);
  ctx.strokeStyle = op.color;
  ctx.lineWidth = t;
  ctx.lineCap = 'butt';
  ctx.setLineDash(op.style === 'dotted' ? [t, t] : op.style === 'dashed' ? [t * 3, t * 3] : []);
  ctx.beginPath(); ctx.moveTo(DX(op.x1), DY(op.y1)); ctx.lineTo(DX(op.x2), DY(op.y2)); ctx.stroke();
  ctx.setLineDash([]);
}
/* shading patterns: the 6 px tile of PAT_GEOM, from the box's corner */
function drawPat(ctx, op, DX, DY, sc, snapBox, P) {
  const g = PAT_GEOM[op.kind];
  if (!g) return;
  const tile = 6 * sc, T = Math.max(2, Math.round(tile));
  const key = op.kind + op.color + T;
  const cache = P.patTiles || (P.patTiles = new Map());
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = cv.height = T;
    const tc = cv.getContext('2d'), k = T / 6;
    const im = op.url && P.bgImages && P.bgImages.get(op.url);
    // the same picture the page shows, drawn at this scale
    if (im) tc.drawImage(im, 0, 0, T, T);
    else {
      tc.fillStyle = op.color; tc.strokeStyle = op.color;
      for (const [x, y, w, hh] of g.r || []) tc.fillRect(Math.round(x * k), Math.round(y * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(hh * k)));
      if (g.l) { tc.lineWidth = g.w * k; tc.beginPath(); for (const [a, b, c, d] of g.l) { tc.moveTo(a * k, b * k); tc.lineTo(c * k, d * k); } tc.stroke(); }
    }
    cache.set(key, cv);
  }
  const pat = ctx.createPattern(cv, 'repeat');
  const s = tile / T;
  pat.setTransform(new DOMMatrix([s, 0, 0, s, DX(op.x), DY(op.y)]));
  ctx.fillStyle = pat;
  ctx.fillRect(...snapBox(op.x, op.y, op.w, op.h));
}
/* text decorations: Chromium rounds the top to the nearest pixel and truncates the thickness */
function drawDeco(ctx, op, DX, DY, sc) {
  const t = Math.max(1, Math.floor(op.raw * sc));
  const y0 = Math.floor(DY(op.top) + 0.5);
  const x0 = DX(op.x1), x1 = DX(op.x2);
  ctx.fillStyle = op.color; ctx.strokeStyle = op.color;
  if (op.style === 'wavy') {
    const amp = Math.max(1, t * 1.2), step = amp * 2, yc = y0 + t / 2 + amp / 2;
    ctx.lineWidth = t; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x0, yc);
    let up = true;
    for (let x = x0; x < x1; x += step) { ctx.quadraticCurveTo(x + step / 2, yc + (up ? -amp : amp), Math.min(x1, x + step), yc); up = !up; }
    ctx.stroke();
    return;
  }
  if (op.style === 'dotted' || op.style === 'dashed') {
    ctx.lineWidth = t; ctx.lineCap = op.style === 'dotted' ? 'round' : 'butt';
    ctx.setLineDash(op.style === 'dotted' ? [0.01, t * 2] : [t * 3, t * 2]);
    ctx.beginPath(); ctx.moveTo(x0, y0 + t / 2); ctx.lineTo(x1, y0 + t / 2); ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'butt';
    return;
  }
  ctx.fillRect(x0, y0, x1 - x0, t);
  if (op.style === 'double') ctx.fillRect(x0, y0 + t * 2, x1 - x0, t);
}

/* Paint one page to a fresh canvas */
function paintPage(P, i, scale, opt = {}) {
  // the page's own size; its place in the column of pages is (Pages.x, Pages.top)
  const g = Pages.g(i);
  const cv = document.createElement('canvas');
  cv.width = opt.w || Math.round(g.w * scale);
  cv.height = opt.h || Math.round(g.h * scale);
  const ctx = cv.getContext('2d');
  ctx.fontKerning = 'normal';
  ctx.textRendering = 'optimizeLegibility';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = S.doc.page.color || '#ffffff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const T = { sc: scale, dx: (opt.dx || 0) - Pages.x(i) * scale, dy: (opt.dy || 0) - Pages.top(i) * scale };
  drawOps(ctx, (P.sheetOps[i] || []).slice().sort((a, b) => a.layer - b.layer), P, T);
  drawOps(ctx, pageOps(P, i), P, T);
  return cv;
}
function pageWords(P, i) {
  const g = Pages.g(i);
  const top = Pages.top(i), bottom = top + g.h, left = Pages.x(i);
  const all = P.words.filter(w => w.y >= top && w.y <= bottom).map(w => Object.assign({}, w, { x: w.x - left, y: w.y - top }));
  // reading order: header, body, footer
  const list = all.filter(w => w.sheet && w.y < g.h / 2).concat(all.filter(w => !w.sheet), all.filter(w => w.sheet && w.y >= g.h / 2));
  // a following space stretches to the next word on the same line, so copied text keeps its spaces
  for (let k = 0; k < list.length; k++) {
    const w = list[k], nx = list[k + 1];
    if (!w.space) continue;
    if (nx && Math.abs(nx.y - w.y) < 1.5 && nx.x > w.x + w.w - 0.5) w.gap = Math.min(nx.x - (w.x + w.w), w.size * 4);
    else w.gap = w.size * 0.25;
  }
  return list;
}
function pageLinks(P, i) {
  const g = Pages.g(i);
  const top = Pages.top(i), bottom = top + g.h, left = Pages.x(i);
  return P.links.filter(l => l.y >= top && l.y + l.h <= bottom + 2).map(l => Object.assign({}, l, { x: l.x - left, y: l.y - top }));
}
