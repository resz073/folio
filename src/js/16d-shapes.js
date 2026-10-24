/* ===================== Shapes and text boxes =====================
   Word's shapes (Insert › Shapes) and text boxes (Insert › Text Box). A shape is a span.shp
   (contenteditable=false) in a paragraph: in front of or behind the text as a picture is
   (classes img-front / img-behind, left/top from its paragraph: PicEdit places it), square to
   one side (img-left / img-right), on a line of its own (img-center) or in the line.
     data-shp   Word's preset name (rect, roundRect, ellipse, line, …); data-tb="1" a text box
     style      width/height (px); left/top when in front or behind; transform: rotate()
     data-fill  #rrggbb or none           data-line  #rrggbb or none
     data-lw    the outline's width (pt)   data-dash  solid, sysDot, sysDash, dash, dashDot, lgDash…
     data-head  a line's ends: end, both  data-flip  h, v or hv (a line's direction; mirrored shapes)
     data-rot   degrees clockwise          data-adj   Word's adjust values (callouts, rounding)
     data-va    t, ctr or b (the text)     data-ins   the text's insets in pt: "l t r b"
     data-fit   1: the height follows the text (Word's Resize Shape to Fit Text)
     data-tc    the text's colour where its runs have none
   The text is HTML in a <template> child (paragraphs can't sit in a paragraph as markup) and is
   shown in a shadow root with the document's style sheet, so Folio's layout, styles, find and
   counts never take it for the document's own paragraphs. It is edited in place as a story. */
const SHAPE_K = 0.5522847498;
const shN = v => Math.round(v * 100) / 100;
function shPoly(pts) { return 'M' + pts.map(p => shN(p[0]) + ' ' + shN(p[1])).join(' L') + ' Z'; }
function shEllipse(cx, cy, rx, ry) {
  const k = SHAPE_K, P = (x, y) => shN(x) + ' ' + shN(y);
  return `M${P(cx + rx, cy)} C${P(cx + rx, cy + ry * k)} ${P(cx + rx * k, cy + ry)} ${P(cx, cy + ry)} C${P(cx - rx * k, cy + ry)} ${P(cx - rx, cy + ry * k)} ${P(cx - rx, cy)} C${P(cx - rx, cy - ry * k)} ${P(cx - rx * k, cy - ry)} ${P(cx, cy - ry)} C${P(cx + rx * k, cy - ry)} ${P(cx + rx, cy - ry * k)} ${P(cx + rx, cy)} Z`;
}
/* an elliptical arc as cubic curves, from angle a0 to a1 (radians, the ellipse's own angles);
   the pen is already at its start */
function shArc(cx, cy, rx, ry, a0, a1) {
  let out = '';
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9));
  const d = (a1 - a0) / n, k = 4 / 3 * Math.tan(d / 4);
  for (let i = 0; i < n; i++) {
    const t0 = a0 + d * i, t1 = t0 + d;
    const x0 = Math.cos(t0), y0 = Math.sin(t0), x1 = Math.cos(t1), y1 = Math.sin(t1);
    out += ` C${shN(cx + rx * (x0 - k * y0))} ${shN(cy + ry * (y0 + k * x0))} ${shN(cx + rx * (x1 + k * y1))} ${shN(cy + ry * (y1 - k * x1))} ${shN(cx + rx * x1)} ${shN(cy + ry * y1)}`;
  }
  return out;
}
/* a rectangle with rounded corners (r 0: square) and, for callouts, the wedge's points on its
   edges: wedge = { t: [[x, y]…], r, b, l } walked clockwise */
function shRoundRect(w, h, r, wedge) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const W = wedge || {}, L = pts => (pts || []).map(p => ` L${shN(p[0])} ${shN(p[1])}`).join('');
  const H = Math.PI / 2;
  let d = `M${shN(r)} 0` + L(W.t) + ` L${shN(w - r)} 0`;
  if (r) d += shArc(w - r, r, r, r, -H, 0);
  d += L(W.r) + ` L${shN(w)} ${shN(h - r)}`;
  if (r) d += shArc(w - r, h - r, r, r, 0, H);
  d += L(W.b) + ` L${shN(r)} ${shN(h)}`;
  if (r) d += shArc(r, h - r, r, r, H, 2 * H);
  d += L(W.l) + ` L0 ${shN(r)}`;
  if (r) d += shArc(r, r, r, r, 2 * H, 3 * H);
  return d + ' Z';
}
/* Word's rectangular callout: the wedge on the side facing its tip (adj: the tip from the centre,
   in 1/100000 of the width and height) */
function shCalloutWedge(w, h, adj) {
  const a1 = adj[0] != null ? adj[0] : -20833, a2 = adj[1] != null ? adj[1] : 62500;
  const dx = w * a1 / 100000, dy = h * a2 / 100000, xP = w / 2 + dx, yP = h / 2 + dy;
  const dz = Math.abs(dy) - Math.abs(dx * h / w);
  const x1 = w * (dx > 0 ? 7 : 2) / 12, x2 = w * (dx > 0 ? 10 : 5) / 12;
  const y1 = h * (dy > 0 ? 7 : 2) / 12, y2 = h * (dy > 0 ? 10 : 5) / 12;
  if (dz > 0) return dy > 0 ? { b: [[x2, h], [xP, yP], [x1, h]] } : { t: [[x1, 0], [xP, yP], [x2, 0]] };
  return dx > 0 ? { r: [[w, y1], [xP, yP], [w, y2]] } : { l: [[0, y2], [xP, yP], [0, y1]] };
}
/* a shape's outline in a w × h box: { d, heads (paths filled with the outline's colour), open
   (a line: nothing to fill, no text), text: the rectangle its text goes in } */
function shapeGeom(kind, w, h, o = {}) {
  w = Math.max(0, w); h = Math.max(0, h);
  const ss = Math.min(w, h), adj = o.adj || [];
  const A = (i, def) => (adj[i] != null && isFinite(adj[i]) ? adj[i] : def) / 100000;
  const R = (l, t, r, b) => ({ l, t, r: Math.max(l + 1, r), b: Math.max(t + 1, b) });
  switch (kind) {
    case 'line': {
      const fh = /h/.test(o.flip || ''), fv = /v/.test(o.flip || '');
      const x1 = fh ? w : 0, y1 = fv ? h : 0, x2 = fh ? 0 : w, y2 = fv ? 0 : h;
      const lw = Math.max(0.5, o.lwPx || 1), heads = [];
      let s = [x1, y1], e = [x2, y2];
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const L = Math.min(len * 0.45, Math.max(6, lw * 3.5)), Wd = L * 0.5;
      const head = (bx, by, sx) => {
        const vx = ux * sx, vy = uy * sx;
        heads.push(shPoly([[bx, by], [bx - vx * L - vy * Wd, by - vy * L + vx * Wd], [bx - vx * L + vy * Wd, by - vy * L - vx * Wd]]));
        return [bx - vx * L * 0.75, by - vy * L * 0.75];
      };
      if (o.head === 'end' || o.head === 'both') e = head(x2, y2, 1);
      if (o.head === 'start' || o.head === 'both') s = head(x1, y1, -1);
      return { d: `M${shN(s[0])} ${shN(s[1])} L${shN(e[0])} ${shN(e[1])}`, heads, open: true };
    }
    case 'roundRect': { const r = ss * Math.min(0.5, A(0, 16667)), k = r * 0.29289; return { d: shRoundRect(w, h, r), text: R(k, k, w - k, h - k) }; }
    case 'ellipse': return { d: shEllipse(w / 2, h / 2, w / 2, h / 2), text: R(w * 0.14645, h * 0.14645, w * 0.85355, h * 0.85355) };
    case 'triangle': { const x = w * A(0, 50000); return { d: shPoly([[x, 0], [w, h], [0, h]]), text: R(x / 2, h / 2, x / 2 + w / 2, h) }; }
    case 'rtTriangle': return { d: shPoly([[0, 0], [w, h], [0, h]]), text: R(w / 12, h * 7 / 12, w * 7 / 12, h * 11 / 12) };
    case 'diamond': return { d: shPoly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), text: R(w / 4, h / 4, w * 3 / 4, h * 3 / 4) };
    case 'parallelogram': { const x = Math.min(w, ss * A(0, 25000)); return { d: shPoly([[x, 0], [w, 0], [w - x, h], [0, h]]), text: R(x * 0.9, h * 0.08, w - x * 0.9, h * 0.92) }; }
    case 'trapezoid': { const x = Math.min(w / 2, ss * A(0, 25000)); return { d: shPoly([[0, h], [x, 0], [w - x, 0], [w, h]]), text: R(x * 0.67, h * 0.12, w - x * 0.67, h) }; }
    case 'pentagon': return { d: shPoly([[0, h * 0.38197], [w / 2, 0], [w, h * 0.38197], [w * 0.80902, h], [w * 0.19098, h]]), text: R(w * 0.19098, h * 0.38197, w * 0.80902, h) };
    case 'hexagon': { const x = Math.min(w / 2, ss * A(0, 25000)); return { d: shPoly([[0, h / 2], [x, 0], [w - x, 0], [w, h / 2], [w - x, h], [x, h]]), text: R(x * 0.6, h * 0.1, w - x * 0.6, h * 0.9) }; }
    case 'octagon': { const x = Math.min(ss / 2, ss * A(0, 29289)); return { d: shPoly([[0, x], [x, 0], [w - x, 0], [w, x], [w, h - x], [w - x, h], [x, h], [0, h - x]]), text: R(x / 2, x / 2, w - x / 2, h - x / 2) }; }
    case 'plus': { const x = Math.min(ss / 2, ss * A(0, 25000)); return { d: shPoly([[0, x], [x, x], [x, 0], [w - x, 0], [w - x, x], [w, x], [w, h - x], [w - x, h - x], [w - x, h], [x, h], [x, h - x], [0, h - x]]), text: R(0, x, w, h - x) }; }
    case 'heart': {
      const P = (x, y) => shN(x) + ' ' + shN(y);
      return { d: `M${P(w / 2, h / 4)} C${P(w / 2 + w * 10 / 48, -h / 3)} ${P(w / 2 + w * 49 / 48, h / 4)} ${P(w / 2, h)} C${P(w / 2 - w * 49 / 48, h / 4)} ${P(w / 2 - w * 10 / 48, -h / 3)} ${P(w / 2, h / 4)} Z`, text: R(w * 0.27, h * 0.25, w * 0.73, h * 0.7) };
    }
    case 'star5': return { d: shPoly([[0, h * 0.381966], [w * 0.381966, h * 0.381966], [w / 2, 0], [w * 0.618034, h * 0.381966], [w, h * 0.381966], [w * 0.690983, h * 0.618034], [w * 0.809017, h], [w / 2, h * 0.763927], [w * 0.190983, h], [w * 0.309017, h * 0.618034]]), text: R(w * 0.309, h * 0.382, w * 0.691, h * 0.764) };
    case 'rightArrow': case 'leftArrow': {
      const t = h * A(0, 50000) / 2, x = Math.min(w, ss * A(1, 50000)), y1 = h / 2 - t, y2 = h / 2 + t;
      let pts = [[0, y1], [w - x, y1], [w - x, 0], [w, h / 2], [w - x, h], [w - x, y2], [0, y2]];
      let tr = R(0, y1, w - x + x * t / (h / 2 || 1), y2);
      if (kind === 'leftArrow') { pts = pts.map(([px, py]) => [w - px, py]); tr = R(w - tr.r, tr.t, w - tr.l, tr.b); }
      return { d: shPoly(pts), text: tr };
    }
    case 'upArrow': case 'downArrow': {
      const t = w * A(0, 50000) / 2, y = Math.min(h, ss * A(1, 50000)), x1 = w / 2 - t, x2 = w / 2 + t;
      let pts = [[x1, h], [x1, y], [0, y], [w / 2, 0], [w, y], [x2, y], [x2, h]];
      let tr = R(x1, y - y * t / (w / 2 || 1), x2, h);
      if (kind === 'downArrow') { pts = pts.map(([px, py]) => [px, h - py]); tr = R(tr.l, h - tr.b, tr.r, h - tr.t); }
      return { d: shPoly(pts), text: tr };
    }
    case 'leftRightArrow': {
      const t = h * A(0, 50000) / 2, x = Math.min(w / 2, ss * A(1, 50000)), y1 = h / 2 - t, y2 = h / 2 + t, k = x * t / (h / 2 || 1);
      return { d: shPoly([[0, h / 2], [x, 0], [x, y1], [w - x, y1], [w - x, 0], [w, h / 2], [w - x, h], [w - x, y2], [x, y2], [x, h]]), text: R(x - k, y1, w - x + k, y2) };
    }
    case 'chevron': { const x = Math.min(w, ss * A(0, 50000)); return { d: shPoly([[0, 0], [w - x, 0], [w, h / 2], [w - x, h], [0, h], [x, h / 2]]), text: R(Math.min(x, w / 2), 0, Math.max(w - x, w / 2), h) }; }
    case 'homePlate': { const x = Math.min(w, ss * A(0, 50000)); return { d: shPoly([[0, 0], [w - x, 0], [w, h / 2], [w - x, h], [0, h]]), text: R(0, 0, w - x / 2, h) }; }
    case 'wedgeRectCallout': return { d: shRoundRect(w, h, 0, shCalloutWedge(w, h, adj)), text: R(0, 0, w, h) };
    case 'wedgeRoundRectCallout': return { d: shRoundRect(w, h, ss * 0.16667, shCalloutWedge(w, h, [adj[0], adj[1]])), text: R(ss * 0.049, ss * 0.049, w - ss * 0.049, h - ss * 0.049) };
    case 'wedgeEllipseCallout': {
      const a1 = adj[0] != null ? adj[0] : -20833, a2 = adj[1] != null ? adj[1] : 62500;
      const dx = w * a1 / 100000, dy = h * a2 / 100000, cx = w / 2, cy = h / 2;
      const pang = Math.atan2(dy * w, dx * h), st = pang + 11 * Math.PI / 180, en = pang - 11 * Math.PI / 180 + 2 * Math.PI;
      const x1 = cx + cx * Math.cos(st), y1 = cy + cy * Math.sin(st);
      return { d: `M${shN(cx + dx)} ${shN(cy + dy)} L${shN(x1)} ${shN(y1)}` + shArc(cx, cy, cx, cy, st, en) + ' Z', text: R(w * 0.14645, h * 0.14645, w * 0.85355, h * 0.85355) };
    }
    default: return { d: shPoly([[0, 0], [w, 0], [w, h], [0, h]]), text: R(0, 0, w, h) };
  }
}
/* Word's preset dashes, as multiples of the line's width; round caps for Round Dot */
const SHAPE_DASH = { solid: [], sysDot: [0, 2], sysDash: [1, 1], dash: [4, 3], dashDot: [4, 3, 1, 3], lgDash: [8, 3], lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3] };
const SHAPE_DASH_NAMES = [['solid', 'Solid'], ['sysDot', 'Round Dot'], ['sysDash', 'Square Dot'], ['dash', 'Dash'], ['dashDot', 'Dash Dot'], ['lgDash', 'Long Dash'], ['lgDashDot', 'Long Dash Dot'], ['lgDashDotDot', 'Long Dash Dot Dot']];
function shapeDash(dash, lwPx) { const a = SHAPE_DASH[dash]; return a && a.length ? a.map(v => v === 0 ? 0.01 : shN(v * Math.max(0.5, lwPx))) : []; }
const SHAPE_GALLERY = [
  ['Lines', [['line', 'Line'], ['line:end', 'Arrow'], ['line:both', 'Double Arrow']]],
  ['Rectangles', [['rect', 'Rectangle'], ['roundRect', 'Rounded Rectangle']]],
  ['Basic Shapes', [['ellipse', 'Oval'], ['triangle', 'Triangle'], ['rtTriangle', 'Right Triangle'], ['diamond', 'Diamond'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['plus', 'Cross'], ['heart', 'Heart'], ['star5', 'Star']]],
  ['Block Arrows', [['rightArrow', 'Arrow: Right'], ['leftArrow', 'Arrow: Left'], ['upArrow', 'Arrow: Up'], ['downArrow', 'Arrow: Down'], ['leftRightArrow', 'Arrow: Left-Right'], ['chevron', 'Arrow: Chevron'], ['homePlate', 'Arrow: Pentagon']]],
  ['Callouts', [['wedgeRectCallout', 'Speech Bubble: Rectangle'], ['wedgeRoundRectCallout', 'Speech Bubble: Rounded'], ['wedgeEllipseCallout', 'Speech Bubble: Oval']]],
];
const SHAPE_NAMES = Object.fromEntries(SHAPE_GALLERY.flatMap(g => g[1]));
/* Word's other presets drawn as the nearest of ours */
const SHAPE_ALIAS = { flowChartProcess: 'rect', flowChartAlternateProcess: 'roundRect', flowChartDecision: 'diamond', flowChartTerminator: 'roundRect', flowChartConnector: 'ellipse', flowChartInputOutput: 'parallelogram', flowChartPreparation: 'hexagon', flowChartManualOperation: 'trapezoid', snip1Rect: 'rect', snip2SameRect: 'rect', snip2DiagRect: 'rect', round1Rect: 'roundRect', round2SameRect: 'roundRect', round2DiagRect: 'roundRect', frame: 'rect', bevel: 'rect', plaque: 'roundRect', cloud: 'ellipse', teardrop: 'ellipse', donut: 'ellipse', star4: 'star5', star6: 'star5', star7: 'star5', star8: 'star5', star10: 'star5', star12: 'star5', star16: 'star5', star24: 'star5', star32: 'star5', irregularSeal1: 'star5', irregularSeal2: 'star5', notchedRightArrow: 'rightArrow', stripedRightArrow: 'rightArrow', upDownArrow: 'upArrow', cloudCallout: 'wedgeEllipseCallout', borderCallout1: 'rect', borderCallout2: 'rect', callout1: 'rect', callout2: 'rect', accentCallout1: 'rect', flowChartDocument: 'rect', flowChartPredefinedProcess: 'rect', flowChartOffpageConnector: 'homePlate', can: 'roundRect', cube: 'rect' };
/* new shapes as Word draws them (Office's blue), text boxes white with a thin black line */
const SHAPE_LOOK = { fill: '#4472c4', line: '#2f528f', lw: 1, tc: '#ffffff' };
const TEXTBOX_LOOK = { fill: '#ffffff', line: '#000000', lw: 0.75, tc: '' };
const LINE_LOOK = { fill: 'none', line: '#4472c4', lw: 1, tc: '' };
/* Shape Styles: fill, outline, text colour */
const SHAPE_PRESETS = [
  ['Black outline', '#ffffff', '#000000', 0.75, '#000000'], ['Blue outline', '#ffffff', '#4472c4', 1, '#000000'], ['Green outline', '#ffffff', '#1d6a50', 1, '#000000'], ['Red outline', '#ffffff', '#c00000', 1, '#000000'],
  ['Blue', '#4472c4', '#2f528f', 1, '#ffffff'], ['Navy', '#1f3a5f', '#14263f', 1, '#ffffff'], ['Green', '#1d6a50', '#134735', 1, '#ffffff'], ['Red', '#c00000', '#800000', 1, '#ffffff'],
  ['Orange', '#ed7d31', '#ae5a21', 1, '#ffffff'], ['Gray', '#7f7f7f', '#595959', 1, '#ffffff'], ['Light blue', '#dae3f3', '#4472c4', 1, '#1f3a5f'], ['Light green', '#e2f0d9', '#548235', 1, '#1e3a14'],
  ['Light yellow', '#fff2cc', '#bf9000', 1, '#3f3000'], ['Light orange', '#fbe5d6', '#c55a11', 1, '#5a1f00'], ['Text only', 'none', 'none', 0.75, '#000000'], ['Dashed box', 'none', '#000000', 0.75, '#000000', 'dash'],
];
const SHAPE_ATTRS = ['data-shp', 'data-tb', 'data-fill', 'data-line', 'data-lw', 'data-dash', 'data-head', 'data-flip', 'data-rot', 'data-adj', 'data-va', 'data-ins', 'data-fit', 'data-tc'];

const Shapes = {
  is(el) { return !!(el && el.nodeType === 1 && el.tagName === 'SPAN' && el.classList.contains('shp')); },
  isLine(el) { return this.is(el) && el.getAttribute('data-shp') === 'line'; },
  /* the shape being worked on: the selected one, or the one whose text is open */
  cur() { if (Story.cur && Story.cur.type === 'shape') return Story.cur.shape; return this.is(S.selImg) ? S.selImg : null; },
  tpl(el) {
    let t = Array.from(el.children).find(k => k.tagName === 'TEMPLATE');
    if (!t) { t = document.createElement('template'); el.appendChild(t); }
    return t;
  },
  size(el) {
    const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
    return { w: isFinite(w) ? w : el.offsetWidth || 0, h: isFinite(h) ? h : el.offsetHeight || 0 };
  },
  attrs(el) {
    const g = n => el.getAttribute('data-' + n);
    const line = g('shp') === 'line', tb = g('tb') === '1';
    const def = line ? LINE_LOOK : tb ? TEXTBOX_LOOK : SHAPE_LOOK;
    const col = (v, d) => v === 'none' ? 'none' : (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : d);
    const ins = (g('ins') || '').split(/[\s,]+/).map(Number);
    return {
      shp: line ? 'line' : (g('shp') || 'rect'), line, tb,
      fill: line ? 'none' : col(g('fill'), def.fill), stroke: col(g('line'), def.line),
      lw: g('lw') != null && isFinite(parseFloat(g('lw'))) ? clamp(parseFloat(g('lw')), 0, 72) : def.lw,
      dash: SHAPE_DASH[g('dash')] ? g('dash') : 'solid', head: /^(end|both|start)$/.test(g('head') || '') ? g('head') : '',
      flip: (g('flip') || '').replace(/[^hv]/g, ''), rot: PicEdit.angle(parseFloat(g('rot')) || 0),
      adj: (g('adj') || '').split(',').filter(x => x.trim() !== '').map(Number).filter(isFinite),
      va: /^(t|ctr|b)$/.test(g('va') || '') ? g('va') : (tb ? 't' : 'ctr'),
      ins: ins.length === 4 && ins.every(isFinite) ? ins.map(v => clamp(v, 0, 200)) : [7.2, 3.6, 7.2, 3.6],
      fit: g('fit') === '1', tc: col(g('tc'), def.tc) === 'none' ? '' : col(g('tc'), def.tc),
    };
  },
  geom(el, a, sz) { a = a || this.attrs(el); sz = sz || this.size(el); return shapeGeom(a.shp, sz.w, sz.h, { adj: a.adj, flip: a.flip, head: a.head, lwPx: a.stroke === 'none' ? 0 : a.lw / 0.75 }); },
  /* ---------- drawing it ---------- */
  /* the style sheet of every shape's text: the document's (Folio's look, its styles) and the
     shape's own box */
  sheet() {
    if (!this._sheet) { this._sheet = new CSSStyleSheet(); this.restyle(); }
    return this._sheet;
  },
  restyle() {
    if (!this._sheet) return;
    const doc = ($('#docCss') && $('#docCss').textContent) || '';
    const rules = ($('#docStyleRules') && $('#docStyleRules').textContent) || '';
    const css = `${doc}\n${rules}\n${SHAPE_INNER_CSS}`;
    if (css !== this._css) { this._css = css; try { this._sheet.replaceSync(css); } catch (e) { console.warn(e); } }
  },
  render(el) {
    if (!this.is(el)) return;
    const a = this.attrs(el), sz = this.size(el);
    const sr = el.shadowRoot || el.attachShadow({ mode: 'open' });
    sr.adoptedStyleSheets = [this.sheet()];
    const g = this.geom(el, a, sz);
    const lwPx = a.stroke === 'none' ? 0 : a.lw / 0.75;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'g');
    svg.setAttribute('width', Math.max(1, sz.w)); svg.setAttribute('height', Math.max(1, sz.h));
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, sz.w)} ${Math.max(1, sz.h)}`);
    const grp = document.createElementNS(svgNS, 'g');
    if (!a.line && a.flip) grp.setAttribute('transform', `translate(${a.flip.includes('h') ? sz.w : 0} ${a.flip.includes('v') ? sz.h : 0}) scale(${a.flip.includes('h') ? -1 : 1} ${a.flip.includes('v') ? -1 : 1})`);
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', g.d);
    p.setAttribute('fill', g.open || a.fill === 'none' ? 'none' : a.fill);
    p.setAttribute('stroke', a.stroke === 'none' || !lwPx ? 'none' : a.stroke);
    p.setAttribute('stroke-width', shN(lwPx));
    const da = shapeDash(a.dash, lwPx);
    if (da.length) p.setAttribute('stroke-dasharray', da.join(' '));
    if (a.dash === 'sysDot') p.setAttribute('stroke-linecap', 'round');
    grp.appendChild(p);
    if (g.open) { const hit = document.createElementNS(svgNS, 'path'); hit.setAttribute('d', g.d); hit.setAttribute('class', 'hit'); grp.appendChild(hit); }
    for (const hd of g.heads || []) { const q = document.createElementNS(svgNS, 'path'); q.setAttribute('d', hd); q.setAttribute('fill', a.stroke === 'none' ? 'none' : a.stroke); grp.appendChild(q); }
    svg.appendChild(grp);
    const kids = [svg];
    if (!g.open) {
      const tr = g.text, ins = a.ins.map(v => v / 0.75);
      const tx = document.createElement('div');
      tx.className = 'tx ' + a.va;
      Object.assign(tx.style, { left: shN(tr.l + ins[0]) + 'px', top: shN(tr.t + ins[1]) + 'px', width: shN(Math.max(1, tr.r - tr.l - ins[0] - ins[2])) + 'px', height: shN(Math.max(0, tr.b - tr.t - ins[1] - ins[3])) + 'px' });
      const inner = document.createElement('div');
      inner.className = 'doc in';
      if (a.tc) inner.style.color = a.tc;
      inner.appendChild(this.tpl(el).content.cloneNode(true));
      tx.appendChild(inner);
      if (el._editing) tx.style.visibility = 'hidden';
      kids.push(tx);
    }
    sr.replaceChildren(...kids);
    const tx = sr.querySelector('.tx .in');
    if (tx) { try { HF.decorate(tx, true); } catch (e) { console.warn(e); } }
    if (a.fit && tx && !el._editing && el.isConnected && !this._fitting) this.fit(el, a, sz, g, tx, this._exact === el);
  },
  /* Resize Shape to Fit Text: the shape grows so its text never runs out of it (keeping the
     text's share of the height); exact: shrinks to the text too (when it is turned on) */
  need(a, sz, g, contentH) {
    const ins = a.ins.map(v => v / 0.75);
    const share = Math.max(0.2, (g.text.b - g.text.t) / Math.max(1, sz.h));
    return Math.max(8, (contentH + ins[1] + ins[3]) / share);
  },
  fit(el, a, sz, g, inner, exact) {
    if (!el.getClientRects().length) return;
    const need = this.need(a, sz, g, inner.offsetHeight);
    if (exact ? Math.abs(need - sz.h) < 0.75 : need < sz.h + 0.75) return;
    el.style.height = shN(need) + 'px';
    this._fitting = true;
    try { this.render(el); } finally { this._fitting = false; }
  },
  renderAll(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('span.shp').forEach(el => this.render(el));
  },
  /* shapes that come into the page (pasted, undone, opened, laid out by the browser) are drawn */
  watch() {
    if (this._mo) return;
    this._mo = new MutationObserver(list => {
      for (const m of list) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (this.is(n)) { if (!n.shadowRoot || !n.shadowRoot.firstChild) this.render(n); }
        else if (n.querySelector && n.querySelector('span.shp')) n.querySelectorAll('span.shp').forEach(s => { if (!s.shadowRoot || !s.shadowRoot.firstChild) this.render(s); });
      }
    });
    this._mo.observe($('#paper'), { childList: true, subtree: true });
  },
  /* the text of every shape in root (for counts, export): their content elements */
  inners(root) { return Array.from((root || docBody()).querySelectorAll('span.shp')).map(el => el.shadowRoot && el.shadowRoot.querySelector('.in')).filter(Boolean); },
  /* ---------- making one ---------- */
  make(kind, w, h) {
    const [shp, head] = kind.split(':');
    const el = document.createElement('span');
    el.className = 'shp';
    el.setAttribute('contenteditable', 'false');
    const tb = shp === 'textbox';
    const look = shp === 'line' ? LINE_LOOK : tb ? TEXTBOX_LOOK : SHAPE_LOOK;
    el.setAttribute('data-shp', tb ? 'rect' : shp);
    if (tb) el.setAttribute('data-tb', '1');
    if (shp !== 'line') el.setAttribute('data-fill', look.fill);
    el.setAttribute('data-line', look.line);
    el.setAttribute('data-lw', String(look.lw));
    if (head) el.setAttribute('data-head', head);
    if (shp !== 'line') {
      el.setAttribute('data-va', tb ? 't' : 'ctr');
      if (tb) el.setAttribute('data-fit', '1');
      if (look.tc) el.setAttribute('data-tc', look.tc);
      // a shape's text is centred, as in Word; a text box's starts at the left
      this.tpl(el).innerHTML = tb ? '<p><br></p>' : '<p style="text-align:center"><br></p>';
    }
    el.style.width = shN(w) + 'px';
    el.style.height = shN(h) + 'px';
    return el;
  },
  /* a new shape in front of the text at rect (screen pixels; for a line its direction too) */
  insert(kind, rect, opts = {}) {
    if (S.readOnly) return null;
    if (Story.cur) Story.close();
    const z = S.zoom;
    const w = Math.max(kind.startsWith('line') ? 0 : 4, rect.width / z), hh = Math.max(kind.startsWith('line') ? 0 : 4, rect.height / z);
    const el = this.make(kind, w, hh);
    if (opts.flip) el.setAttribute('data-flip', opts.flip);
    el.classList.add('img-front');
    let b = PicEdit.blockFor(rect);
    if (!b) { b = S.editor.querySelector('p, h1, h2, h3, h4, h5, h6, li') || S.editor.appendChild(h('p', null, h('br'))); }
    change(() => {
      b.insertBefore(el, b.firstChild);
      PicEdit.keepLine(b);
      PicEdit.place(el, b, rect);
      this.render(el);
    }, { full: true });
    Images.select(el);
    UI.showContext('shape', true); UI.selectTab('shape');
    return el;
  },
  /* Insert › Shapes: drag on the page to draw (a click: Word's 1-inch shape); Shift keeps the
     proportions (lines: every 45°); Esc cancels */
  draw(kind) {
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to make changes.'); return; }
    if (Story.cur) Story.close();
    this.stopDraw();
    if (S.view !== 'print') setView('print');
    const paper = $('#paper'), line = kind.startsWith('line');
    const ov = h('div', { class: 'shp-draw', 'aria-label': 'Drag to draw the shape' });
    const pv = h('div', { class: 'shp-pv' + (line ? ' ln' : '') });
    ov.appendChild(pv);
    paper.appendChild(ov);
    paper.classList.add('drawing-shape');
    this.drawing = { kind, ov };
    $$('#toastRoot .toast.shp-tip').forEach(t => t.remove());
    toast(kind === 'textbox' ? 'Drag on the page to draw the text box, then type. Esc cancels.' : 'Drag on the page to draw the shape. Shift keeps its proportions. Esc cancels.', { ms: 5000 });
    const tip = $('#toastRoot') && $('#toastRoot').lastElementChild;
    if (tip) tip.classList.add('shp-tip');
    const pt = e => { const r = paper.getBoundingClientRect(); return { x: (e.clientX - r.left) / S.zoom, y: (e.clientY - r.top) / S.zoom }; };
    let p0 = null;
    const box = (a, b, shift) => {
      let dx = b.x - a.x, dy = b.y - a.y;
      if (shift && line) { const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy); dx = Math.cos(ang) * len; dy = Math.sin(ang) * len; if (Math.abs(dx) < 0.01) dx = 0; if (Math.abs(dy) < 0.01) dy = 0; }
      else if (shift) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
      return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx), h: Math.abs(dy), flip: (dx < 0 ? 'h' : '') + (dy < 0 ? 'v' : '') };
    };
    const show = b => {
      Object.assign(pv.style, { display: 'block', left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
      if (line) pv.style.setProperty('--ln', b.flip === 'h' || b.flip === 'v' ? 'linear-gradient(to top right, transparent calc(50% - 0.75px), #1a73e8 50%, transparent calc(50% + 0.75px))' : 'linear-gradient(to bottom right, transparent calc(50% - 0.75px), #1a73e8 50%, transparent calc(50% + 0.75px))');
    };
    ov.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      p0 = pt(e);
      try { ov.setPointerCapture(e.pointerId); } catch { }
    });
    ov.addEventListener('pointermove', e => { if (p0) show(box(p0, pt(e), e.shiftKey)); });
    const finish = e => {
      if (!p0) return;
      let b = box(p0, pt(e), e.shiftKey);
      const tiny = b.w < 4 && b.h < 4;
      if (tiny) {
        // a click: Word's default size from the click
        const d = kind === 'textbox' ? { w: 240, h: 58 } : line ? { w: 96, h: 0 } : { w: 96, h: 96 };
        b = { x: p0.x, y: p0.y, w: d.w, h: d.h, flip: '' };
      }
      this.stopDraw();
      const r = paper.getBoundingClientRect(), z = S.zoom;
      const rect = { left: r.left + b.x * z, top: r.top + b.y * z, width: b.w * z, height: b.h * z };
      rect.right = rect.left + rect.width; rect.bottom = rect.top + rect.height;
      const el = this.insert(kind, rect, { flip: line ? b.flip : '' });
      if (el && kind === 'textbox') setTimeout(() => this.edit(el), 0);
    };
    ov.addEventListener('pointerup', finish);
    ov.addEventListener('pointercancel', () => this.stopDraw());
    this._drawKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.stopDraw(); } };
    window.addEventListener('keydown', this._drawKey, true);
  },
  stopDraw() {
    if (!this.drawing) return;
    $$('#toastRoot .toast.shp-tip').forEach(t => t.remove());
    this.drawing.ov.remove();
    $('#paper').classList.remove('drawing-shape');
    window.removeEventListener('keydown', this._drawKey, true);
    this.drawing = null;
  },
  /* Insert › Text Box › Simple Text Box: at the cursor's line, in front of the text */
  simpleTextBox() {
    if (S.readOnly) return;
    if (Story.cur) Story.close();
    const r = caretRect() || (blockOf(curTextNode()) || S.editor.firstElementChild).getBoundingClientRect();
    // in the caret's section's text column
    const si = Math.min(Sections.indexOf(curTextNode() || S.editor.firstElementChild), Pages.ready().secs.length - 1);
    const g = Pages.secs[si].g, x0 = Pages.colX(si), pr = $('#paper').getBoundingClientRect(), z = S.zoom;
    const w = Math.min(g.cw, 288) * z, hh = 58 * z;
    const left = Math.min(Math.max(r.left, pr.left + x0 * z), pr.left + (x0 + g.cw) * z - w);
    const rect = { left, top: r.top, width: w, height: hh, right: left + w, bottom: r.top + hh };
    const el = this.insert('textbox', rect);
    if (el) setTimeout(() => this.edit(el), 0);
  },
  /* ---------- its text, edited in place ---------- */
  blankHtml(a) { return a.tb ? '<p><br></p>' : '<p style="text-align:center"><br></p>'; },
  edit(el, at) {
    if (!this.is(el) || this.isLine(el)) return;
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to make changes.'); return; }
    if (Story.cur && Story.cur.type === 'shape' && Story.cur.shape === el) return;
    if (Story.cur) Story.close();
    const a = this.attrs(el);
    const live = h('div', { class: 'doc shp-live', lang: docBody().getAttribute('lang') || 'en-US' });
    live.contentEditable = 'true';
    const t = this.tpl(el);
    live.innerHTML = t.innerHTML.trim() ? t.innerHTML : this.blankHtml(a);
    if (a.tc) live.style.color = a.tc;
    el._editing = true;
    this.render(el);
    Story.open({
      type: 'shape', kind: a.tb ? 'text box' : 'shape', shape: el, el: live, extras: [], tab: 'shape',
      place: () => this.placeLive(el, live),
      changed: () => this.liveChanged(el, live),
      clean: e => cleanHTML(e),
      save: (html, quiet) => {
        const tt = this.tpl(el);
        const empty = !html.replace(/<p[^>]*>(<br>)?<\/p>/g, '').trim();
        const v = empty ? '' : html;
        if (tt.innerHTML === v) return false;
        tt.innerHTML = v;
        void quiet;
        return true;
      },
      after: () => { el._editing = false; if (el.isConnected) this.render(el); },
    });
    HF.decorate(live, true);
    this.placeLive(el, live);
    // the caret where the shape was clicked, else at the end of its text
    let placed = false;
    if (at) { const pos = caretFromPoint(at.x, at.y); if (pos && live.contains(pos.node)) { caretAt(pos.node, pos.offset); placed = true; } }
    if (!placed) { const r = document.createRange(); r.selectNodeContents(live.lastElementChild || live); r.collapse(false); setRange(r); }
    UI.refresh();
  },
  /* the live text over the shape: where its text goes, turned as the shape is */
  placeLive(el, live) {
    if (!el.isConnected) return;
    const a = this.attrs(el), sz = this.size(el), g = this.geom(el, a, sz), ins = a.ins.map(v => v / 0.75);
    const pr = $('#paper').getBoundingClientRect(), z = S.zoom;
    const r = Grid.place(el, el.getBoundingClientRect());
    const cx = ((r.left + r.right) / 2 - pr.left) / z, cy = ((r.top + r.bottom) / 2 - pr.top) / z;
    const x0 = cx - sz.w / 2, y0 = cy - sz.h / 2;
    const tw = Math.max(8, g.text.r - g.text.l - ins[0] - ins[2]), th = Math.max(0, g.text.b - g.text.t - ins[1] - ins[3]);
    live.style.width = shN(tw) + 'px';
    const ch = live.offsetHeight;
    const off = a.va === 'ctr' ? (th - ch) / 2 : a.va === 'b' ? th - ch : 0;
    const left = x0 + g.text.l + ins[0], top = y0 + g.text.t + ins[1] + (a.fit ? 0 : Math.max(a.va === 't' ? 0 : -1e9, off));
    live.style.left = shN(left) + 'px';
    live.style.top = shN(top) + 'px';
    live.style.transformOrigin = `${shN(cx - left)}px ${shN(cy - top)}px`;
    live.style.transform = a.rot ? `rotate(${a.rot}deg)` : '';
  },
  /* typing: a shape that fits its text grows or shrinks with it */
  liveChanged(el, live) {
    if (!el.isConnected) return false;
    HF.decorate(live, true);
    const a = this.attrs(el);
    let grew = false;
    if (a.fit) {
      const sz = this.size(el), g = this.geom(el, a, sz);
      const need = this.need(a, sz, g, live.offsetHeight);
      if (need > sz.h + 0.75) {
        el.style.height = shN(need) + 'px';
        this.render(el);
        grew = !PicEdit.floating(el);
      }
    }
    this.placeLive(el, live);
    Images.refreshFrame();
    return grew;
  },
  /* ---------- changing it ---------- */
  /* attributes of the selected shape (or the one being typed in), one step to undo */
  set(o, el) {
    el = el || this.cur();
    if (!el) { toast('Select a shape first.'); return; }
    if (S.readOnly) return;
    const body = Story.cur && Story.cur.type === 'shape' ? Story.cur.body : null;
    const apply = () => {
      for (const [k, v] of Object.entries(o)) {
        const an = 'data-' + k;
        if (v == null || v === '') el.removeAttribute(an); else el.setAttribute(an, String(v));
      }
      if (o.rot != null) el.style.transform = +o.rot ? `rotate(${+o.rot}deg)` : '';
      if (!el.getAttribute('style')) el.removeAttribute('style');
      this.render(el);
    };
    if (body) {
      // typing in it: the shape changes with the document, one step to undo when the text closes
      apply();
      Story.cur.dirtyBody = true;
      Saver.mark();
      Story.place();
    } else change(apply, { node: el, full: !PicEdit.floating(el) });
    Images.refreshFrame();
    UI.refresh();
  },
  setFill(c) { this.set({ fill: c || 'none' }); },
  setOutline(c) { const el = this.cur(); if (!el) return toast('Select a shape first.'); this.set({ line: c || 'none' }); },
  setWeight(pt) { const el = this.cur(); if (!el) return toast('Select a shape first.'); const o = { lw: pt }; if (this.attrs(el).stroke === 'none') o.line = '#000000'; this.set(o); },
  setDash(d) { this.set({ dash: d === 'solid' ? '' : d }); },
  setHead(v) { const el = this.cur(); if (!el || !this.isLine(el)) return toast('Select a line or an arrow first.'); this.set({ head: v }); },
  setVa(v) { this.set({ va: v }); },
  preset(p) {
    const [, fill, line, lw, tc, dash] = p;
    const el = this.cur();
    if (!el) return toast('Select a shape first.');
    if (this.isLine(el)) this.set({ line: line === 'none' ? '#000000' : line, lw, dash: dash || '' });
    else this.set({ fill, line, lw, tc, dash: dash || '' });
  },
  toggleFit() {
    const el = this.cur();
    if (!el) return toast('Select a shape first.');
    const on = !this.attrs(el).fit;
    // turned on: the shape takes its text's height exactly, once
    if (on) this._exact = el;
    try { this.set({ fit: on ? '1' : '' }); } finally { this._exact = null; }
  },
  setSize(w, hh) {
    const el = this.cur();
    if (!el) return;
    change(() => {
      if (w != null) el.style.width = shN(Math.max(this.isLine(el) ? 0 : 4, w)) + 'px';
      if (hh != null) { el.style.height = shN(Math.max(this.isLine(el) ? 0 : 4, hh)) + 'px'; if (this.attrs(el).fit) el.removeAttribute('data-fit'); }
      this.render(el);
    }, { node: el, full: !PicEdit.floating(el) });
    Images.refreshFrame();
  },
  rotate(deg, abs) {
    const el = this.cur();
    if (!el) return;
    const a = this.attrs(el);
    this.set({ rot: shN(PicEdit.angle(abs ? deg : a.rot + deg)) || '' });
  },
  flip(dir) {
    const el = this.cur();
    if (!el) return;
    const f = this.attrs(el).flip;
    const nf = f.includes(dir) ? f.replace(dir, '') : f + dir;
    this.set({ flip: ['h', 'v'].filter(x => nf.includes(x)).join('') });
  },
  /* ---------- moving, sizing and turning it with the mouse ---------- */
  /* the frame around a shape: its own box, turned with it; a line has a handle at each end */
  placeFrame(el, fr) {
    const a = this.attrs(el), sz = this.size(el);
    const pr = $('#paper').getBoundingClientRect(), z = S.zoom;
    const r = Grid.place(el, el.getBoundingClientRect());
    const cx = ((r.left + r.right) / 2 - pr.left) / z, cy = ((r.top + r.bottom) / 2 - pr.top) / z;
    Object.assign(fr.style, { left: shN(cx - sz.w / 2) + 'px', top: shN(cy - sz.h / 2) + 'px', width: shN(sz.w) + 'px', height: shN(sz.h) + 'px', transform: a.rot ? `rotate(${a.rot}deg)` : '' });
    fr.classList.toggle('shape', true);
    fr.classList.toggle('line', a.line);
    if (a.line) {
      const fh = a.flip.includes('h'), fv = a.flip.includes('v');
      const p1 = fr.querySelector('.hd.p1'), p2 = fr.querySelector('.hd.p2');
      if (p1) Object.assign(p1.style, { left: shN((fh ? sz.w : 0) - 6) + 'px', top: shN((fv ? sz.h : 0) - 6) + 'px' });
      if (p2) Object.assign(p2.style, { left: shN((fh ? 0 : sz.w) - 6) + 'px', top: shN((fv ? 0 : sz.h) - 6) + 'px' });
    }
    const lab = fr.querySelector('.sz');
    if (lab && !fr.classList.contains('turning')) lab.textContent = a.line ? fmtLen(Math.hypot(sz.w, sz.h)) : `${fmtLen(sz.w)} × ${fmtLen(sz.h)}`;
  },
  /* a handle dragged: the side or corner follows the pointer in the shape's own (turned) frame,
     the opposite side stays where it is; Shift keeps the proportions at a corner */
  startResize(e, k) {
    e.preventDefault(); e.stopPropagation();
    const el = S.selImg;
    if (!this.is(el) || S.readOnly || e.button !== 0) return;
    const a = this.attrs(el), sz0 = this.size(el), z = S.zoom;
    const fl = PicEdit.floating(el), l0 = parseFloat(el.style.left) || 0, t0 = parseFloat(el.style.top) || 0;
    const rad = a.rot * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
    const x0 = e.clientX, y0 = e.clientY, ratio = sz0.w / Math.max(1, sz0.h);
    beginChange();
    if (Hist.timer) histRecord();
    let moved = false;
    const move = ev => {
      const sdx = (ev.clientX - x0) / z, sdy = (ev.clientY - y0) / z;
      // the pointer's movement in the shape's own frame
      const dx = sdx * cs + sdy * sn, dy = -sdx * sn + sdy * cs;
      let L = 0, T = 0, R = sz0.w, B = sz0.h;
      if (a.line) {
        // an end of a line: the box from both ends, its direction from where they are
        const fh = a.flip.includes('h'), fv = a.flip.includes('v');
        let p = [[fh ? sz0.w : 0, fv ? sz0.h : 0], [fh ? 0 : sz0.w, fv ? 0 : sz0.h]];
        const i = k === 'p1' ? 0 : 1;
        p[i] = [p[i][0] + sdx, p[i][1] + sdy];
        if (ev.shiftKey) { const o = p[1 - i], vx = p[i][0] - o[0], vy = p[i][1] - o[1], ang = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(vx, vy); p[i] = [o[0] + Math.cos(ang) * len, o[1] + Math.sin(ang) * len]; }
        const nx = Math.min(p[0][0], p[1][0]), ny = Math.min(p[0][1], p[1][1]);
        const flip = (p[0][0] > p[1][0] + 0.01 ? 'h' : '') + (p[0][1] > p[1][1] + 0.01 ? 'v' : '');
        el.style.width = shN(Math.abs(p[0][0] - p[1][0])) + 'px';
        el.style.height = shN(Math.abs(p[0][1] - p[1][1])) + 'px';
        if (flip) el.setAttribute('data-flip', flip); else el.removeAttribute('data-flip');
        if (fl) { el.style.left = shN(l0 + nx) + 'px'; el.style.top = shN(t0 + ny) + 'px'; }
        moved = true;
        this.render(el);
        Images.refreshFrame();
        return;
      }
      if (k.includes('w')) L = Math.min(sz0.w - 4, dx);
      if (k.includes('e')) R = Math.max(4, sz0.w + dx);
      if (k.includes('n')) T = Math.min(sz0.h - 4, dy);
      if (k.includes('s')) B = Math.max(4, sz0.h + dy);
      let w = R - L, hh = B - T;
      if (ev.shiftKey && k.length === 2) {
        // the side that moved more leads
        if (w / hh > ratio) hh = w / ratio; else w = hh * ratio;
        if (k.includes('w')) L = R - w; else R = L + w;
        if (k.includes('n')) T = B - hh; else B = T + hh;
      }
      el.style.width = shN(w) + 'px';
      el.style.height = shN(hh) + 'px';
      if (k.includes('s') || k.includes('n')) el.removeAttribute('data-fit');
      if (fl) {
        // the box's new centre, from its own frame back to the page; its corner from that
        const mx = (L + R) / 2 - sz0.w / 2, my = (T + B) / 2 - sz0.h / 2;
        const ccx = l0 + sz0.w / 2 + mx * cs - my * sn, ccy = t0 + sz0.h / 2 + mx * sn + my * cs;
        el.style.left = shN(ccx - w / 2) + 'px';
        el.style.top = shN(ccy - hh / 2) + 'px';
      }
      moved = true;
      this.render(el);
      Images.refreshFrame();
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (!moved) return;
      this.render(el);
      histRecord();
      afterChange(el, { full: true });
      Images.refreshFrame();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  },
  /* the round handle: turn about the centre (Shift: 15° steps) */
  startRotate(e) {
    const el = S.selImg;
    if (!this.is(el) || S.readOnly || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx), rot0 = this.attrs(el).rot;
    const fr = Images.frame, lab = fr && fr.querySelector('.sz');
    if (fr) fr.classList.add('turning');
    beginChange();
    if (Hist.timer) histRecord();
    let deg = rot0;
    const move = ev => {
      let d = (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI;
      deg = PicEdit.angle(rot0 + d);
      if (ev.shiftKey) deg = PicEdit.angle(Math.round(deg / 15) * 15);
      deg = Math.round(deg * 10) / 10;
      el.style.transform = deg ? `rotate(${deg}deg)` : '';
      if (lab) lab.textContent = `${fmtNum(deg, 1)}°`;
      Images.refreshFrame();
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (fr) fr.classList.remove('turning');
      if (deg) el.setAttribute('data-rot', String(deg)); else el.removeAttribute('data-rot');
      if (!el.getAttribute('style')) el.removeAttribute('style');
      histRecord();
      afterChange(el, { node: el });
      Images.refreshFrame();
      UI.refresh();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  },
  /* a click on a text box away from its edge goes into its text (as in Word); on a shape, or
     a text box's edge, it selects it */
  clickEdits(el, e) {
    if (this.isLine(el) || !this.attrs(el).tb || S.selImg === el) return false;
    const a = this.attrs(el), sz = this.size(el), r = el.getBoundingClientRect(), z = S.zoom;
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, rad = -a.rot * Math.PI / 180;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / z + sz.w / 2, ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / z + sz.h / 2;
    const edge = 6 / z;
    return lx > edge && ly > edge && lx < sz.w - edge && ly < sz.h - edge;
  },
  /* a shape copied in Folio and pasted: its own attributes and size kept, its text cleaned as
     pasted text is (no shape in a shape) */
  sanitize(n, st) {
    if ((Story.cur && Story.cur.type === 'shape') || this._sanitizing) return null;
    const el = document.createElement('span');
    el.className = 'shp';
    el.setAttribute('contenteditable', 'false');
    for (const c of n.classList) if (/^img-(front|behind|left|right|center)$/.test(c)) el.classList.add(c);
    for (const a of SHAPE_ATTRS) { const v = n.getAttribute(a); if (v != null && /^[\w#.,\s-]{0,80}$/.test(v)) el.setAttribute(a, v); }
    const fl = PicEdit.floating(el);
    for (const k of ['width', 'height', 'left', 'top']) {
      const v = parseFloat(st[k]);
      if (isFinite(v) && (k === 'width' || k === 'height' || fl)) el.style[k] = shN(v) + 'px';
    }
    const rot = parseFloat(el.getAttribute('data-rot'));
    if (rot) el.style.transform = `rotate(${rot}deg)`;
    const t = Array.from(n.children).find(k => k.tagName === 'TEMPLATE');
    if (t && t.innerHTML.trim()) {
      this._sanitizing = true;
      try { this.tpl(el).content.appendChild(sanitizeHtml(t.innerHTML, { keepClasses: true })); }
      finally { this._sanitizing = false; }
    } else this.tpl(el);
    return el;
  },
  /* a web page of the document: each shape's drawing as a declarative shadow root (the browser
     builds it when it reads the page), with the document's style sheet inside it */
  declarative(root) {
    const css = `${($('#docCss') && $('#docCss').textContent) || ''}\n${($('#docStyleRules') && $('#docStyleRules').textContent) || ''}\n${SHAPE_INNER_CSS}`;
    for (const el of Array.from(root.querySelectorAll('span.shp'))) {
      const box = h('div', { class: 'doc', style: `position:absolute;left:-20000px;top:0;${docVarsCss()}` });
      const live = el.cloneNode(true);
      box.appendChild(live);
      $('#renderHost').appendChild(box);
      try {
        this.render(live);
        const t = document.createElement('template');
        t.setAttribute('shadowrootmode', 'open');
        t.innerHTML = `<style>${css}</style>` + live.shadowRoot.innerHTML;
        Array.from(el.children).filter(k => k.tagName === 'TEMPLATE').forEach(k => k.remove());
        el.removeAttribute('contenteditable');
        el.insertBefore(t, el.firstChild);
      } finally { box.remove(); }
    }
  },
  /* ---------- dialogs and menus ---------- */
  galleryMenu(anchor) {
    const box = h('div', { class: 'shp-gallery', role: 'menu' });
    for (const [group, items] of SHAPE_GALLERY) {
      box.appendChild(h('div', { class: 'pal-label' }, group));
      const row = h('div', { class: 'shp-row' });
      for (const [k, name] of items) {
        const b = h('button', { type: 'button', class: 'shp-btn', title: name, 'aria-label': name, html: this.iconSvg(k) });
        b.addEventListener('click', () => { Menu.close(); this.draw(k); });
        row.appendChild(b);
      }
      box.appendChild(row);
    }
    const tbRow = h('div', { class: 'shp-row' });
    const tb = h('button', { type: 'button', class: 'shp-btn', title: 'Text Box', 'aria-label': 'Text Box', html: this.iconSvg('textbox') });
    tb.addEventListener('click', () => { Menu.close(); this.draw('textbox'); });
    tbRow.appendChild(tb);
    box.append(h('div', { class: 'pal-label' }, 'Text Box'), tbRow);
    Menu.open(anchor, box);
  },
  /* a small picture of a shape for the menus */
  iconSvg(k) {
    const [shp, head] = k.split(':');
    const w = 20, hh = shp === 'line' ? 20 : 16;
    if (shp === 'textbox') return `<svg viewBox="0 0 24 20" width="24" height="20" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="15" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 7h12M6 10.5h12M6 14h8" stroke="currentColor" stroke-width="1.2"/></svg>`;
    const g = shapeGeom(shp, w, hh, { head, lwPx: 1.2 });
    const heads = (g.heads || []).map(d => `<path d="${d}" fill="currentColor"/>`).join('');
    return `<svg viewBox="-2 ${shp === 'line' ? -2 : 0} 24 ${shp === 'line' ? 24 : 20}" width="24" height="20" aria-hidden="true"><g transform="translate(0 ${shp === 'line' ? 0 : 2})"><path d="${g.d}" fill="${g.open ? 'none' : 'currentColor'}" fill-opacity="0.16" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>${heads}</g></svg>`;
  },
  presetMenu(anchor) {
    const el = this.cur();
    const box = h('div', { class: 'shp-presets', role: 'menu' });
    box.appendChild(h('div', { class: 'pal-label' }, 'Shape Styles'));
    const grid = h('div', { class: 'shp-pgrid' });
    for (const p of SHAPE_PRESETS) {
      const [name, fill, line, lw, tc, dash] = p;
      const b = h('button', { type: 'button', class: 'shp-pre', title: name, 'aria-label': name });
      Object.assign(b.style, { background: fill === 'none' ? 'transparent' : fill, borderColor: line === 'none' ? 'transparent' : line, borderWidth: Math.max(1, lw / 0.75 * 1.2) + 'px', borderStyle: dash ? 'dashed' : 'solid', color: tc });
      b.textContent = 'Abc';
      b.addEventListener('click', () => { Menu.close(); this.preset(p); });
      grid.appendChild(b);
    }
    box.appendChild(grid);
    if (!el) box.appendChild(h('div', { class: 'note', style: { padding: '4px 10px' } }, 'Select a shape first.'));
    Menu.open(anchor, box);
  },
  /* Shape Outline: its colour, then the weight and dashes as small pictures of the line */
  outlineMenu(anchor) {
    const el = this.cur(), a = el ? this.attrs(el) : null;
    const box = h('div', { class: 'shp-outline' }, colorPalette('shape', c => this.setOutline(c)));
    const lineBtn = (title, svg, on, fn) => { const b = h('button', { type: 'button', class: 'shp-lb' + (on ? ' on' : ''), title, 'aria-label': title, 'aria-pressed': on ? 'true' : 'false', html: svg }); b.addEventListener('click', () => { Menu.close(); fn(); }); return b; };
    box.appendChild(h('div', { class: 'pal-label' }, 'Weight'));
    box.appendChild(h('div', { class: 'shp-lrow' }, [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map(v => lineBtn(`${fmtNum(v, 2)} pt`, `<svg viewBox="0 0 34 14" width="34" height="14"><line x1="2" y1="7" x2="32" y2="7" stroke="currentColor" stroke-width="${Math.max(0.6, v * 1.1)}"/></svg>`, !!a && a.stroke !== 'none' && Math.abs(a.lw - v) < 0.01, () => this.setWeight(v)))));
    box.appendChild(h('div', { class: 'pal-label' }, 'Dashes'));
    box.appendChild(h('div', { class: 'shp-lrow' }, SHAPE_DASH_NAMES.map(([v, l]) => { const da = shapeDash(v, 2).join(' '); return lineBtn(l, `<svg viewBox="0 0 34 14" width="34" height="14"><line x1="2" y1="7" x2="32" y2="7" stroke="currentColor" stroke-width="2"${da ? ` stroke-dasharray="${da}"` : ''}${v === 'sysDot' ? ' stroke-linecap="round"' : ''}/></svg>`, !!a && a.dash === v, () => this.setDash(v)); })));
    if (a && a.line) {
      box.appendChild(h('div', { class: 'pal-label' }, 'Arrows'));
      box.appendChild(h('div', { class: 'shp-lrow' }, [['', 'No arrows'], ['end', 'Arrow at the end'], ['start', 'Arrow at the start'], ['both', 'Arrows at both ends']].map(([v, l]) => {
        const g = shapeGeom('line', 30, 0, { head: v === 'start' ? 'end' : v, lwPx: 1.4, flip: v === 'start' ? 'h' : '' });
        return lineBtn(l, `<svg viewBox="-2 -7 34 14" width="34" height="14"><path d="${g.d}" stroke="currentColor" stroke-width="1.4" fill="none"/>${(g.heads || []).map(d => `<path d="${d}" fill="currentColor"/>`).join('')}</svg>`, a.head === v, () => this.setHead(v));
      })));
    }
    Menu.open(anchor, box);
  },
  fillMenu(anchor) { Menu.open(anchor, colorPalette('shape', c => this.setFill(c))); },
  vaMenu(anchor) {
    const el = this.cur(), a = el ? this.attrs(el) : null;
    Menu.open(anchor, [['t', 'Top', 'vTop'], ['ctr', 'Middle', 'vMid'], ['b', 'Bottom', 'vBottom']].map(([v, l, ic]) => ({ label: l, icon: ic, checked: !!a && a.va === v, onClick: () => this.setVa(v) })).concat(['-', { label: 'Resize Shape to Fit Text', checked: !!a && a.fit, onClick: () => this.toggleFit() }]));
  },
  rotateMenu(anchor) {
    Menu.open(anchor, [
      { label: 'Rotate Right 90°', icon: 'rotateRight', onClick: () => this.rotate(90) }, { label: 'Rotate Left 90°', icon: 'rotateLeft', onClick: () => this.rotate(-90) },
      { label: 'Flip Vertical', icon: 'flipV', onClick: () => this.flip('v') }, { label: 'Flip Horizontal', icon: 'flipH', onClick: () => this.flip('h') },
      '-', { label: 'More Rotation Options…', onClick: () => this.dialog('size') }]);
  },
  wrapMenu(anchor) {
    Menu.open(anchor, [['inline', 'In Line with Text', 'wrapInline'], ['left', 'Square, shape on the left', 'wrapLeft'], ['right', 'Square, shape on the right', 'wrapRight'], ['center', 'Top and Bottom, centered', 'wrapTop'], ['behind', 'Behind Text', 'wrapBehind'], ['front', 'In Front of Text', 'wrapFront']].map(([v, l, ic]) => ({ label: l, icon: ic, checked: Images.wrapMode(this.cur()) === v, onClick: () => { const el = this.cur(); if (!el) return; if (Story.cur) Story.close(); Images.select(el); Images.setWrap(v); } })));
  },
  /* Format Shape: fill, line, size and turn, the text's place and margins, wrapping */
  dialog(focus) {
    const el = this.cur();
    if (!el) { toast('Select a shape first.'); return; }
    if (Story.cur) Story.close();
    Images.select(el);
    const a = this.attrs(el), sz = this.size(el);
    const colorIn = (v, label) => {
      const none = h('input', { type: 'checkbox' });
      none.checked = v === 'none';
      const c = h('input', { type: 'color', value: v === 'none' ? '#ffffff' : v, 'aria-label': label, style: { width: '44px', height: '30px', padding: '1px', border: '1px solid var(--line)', borderRadius: '6px' } });
      c.disabled = none.checked;
      none.addEventListener('change', () => { c.disabled = none.checked; });
      return { el: h('span', { class: 'st-tg' }, c, h('label', { class: 'chk' }, none, ' None')), get: () => none.checked ? 'none' : c.value };
    };
    const fill = colorIn(a.fill, 'Fill color'), line = colorIn(a.stroke, 'Line color');
    const lw = input(fmtNum(a.lw, 2), { type: 'number', min: '0', max: '72', step: '0.25', style: { width: '70px' } });
    const dash = h('select', { class: 'select' }, ...SHAPE_DASH_NAMES.map(([v, l]) => h('option', { value: v }, l)));
    dash.value = a.dash;
    const W = input(fmtLen(sz.w), { style: { width: '90px' } }), Hh = input(fmtLen(sz.h), { style: { width: '90px' } });
    const rot = input(fmtNum(a.rot, 1), { type: 'number', min: '-360', max: '360', step: '1', style: { width: '70px' } });
    const va = h('select', { class: 'select' }, h('option', { value: 't' }, 'Top'), h('option', { value: 'ctr' }, 'Middle'), h('option', { value: 'b' }, 'Bottom'));
    va.value = a.va;
    const insIn = a.ins.map(v => input(fmtLen(v / 0.75), { style: { width: '80px' } }));
    const fit = h('input', { type: 'checkbox' }); fit.checked = a.fit;
    const row = (...k) => h('div', { class: 'st-row' }, ...k);
    const lab = (t, c) => h('label', { class: 'st-l' }, h('span', null, t), c);
    const body = h('div', { class: 'st-dialog' },
      h('div', { class: 'dsection' }, a.line ? 'Line' : 'Fill and line'),
      a.line ? null : row(lab('Fill', fill.el)),
      row(lab('Line', line.el), lab('Width (pt)', lw), lab('Dashes', dash)),
      h('div', { class: 'dsection' }, 'Size'),
      row(lab('Width', W), a.line ? null : lab('Height', Hh), lab('Rotation (°)', rot)),
      a.line ? null : h('div', { class: 'dsection' }, 'Text'),
      a.line ? null : row(lab('Vertical alignment', va), h('label', { class: 'chk', style: { alignSelf: 'end', paddingBottom: '6px' } }, fit, ' Resize shape to fit text')),
      a.line ? null : row(lab('Left margin', insIn[0]), lab('Top', insIn[1]), lab('Right', insIn[2]), lab('Bottom', insIn[3])));
    openDialog({ title: a.line ? 'Format Line' : a.tb ? 'Format Text Box' : 'Format Shape', width: 560, body, focus: focus === 'size' ? 'input[type=number]:last-of-type' : 'select', buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => {
      const len = v => { const px = parseLen(v); return isNaN(px) ? null : px; };
      const w = len(W.value), hh = a.line ? sz.h : len(Hh.value);
      change(() => {
        if (!a.line) el.setAttribute('data-fill', fill.get());
        el.setAttribute('data-line', line.get());
        el.setAttribute('data-lw', String(clamp(parseFloat(lw.value) || 0, 0, 72)));
        if (dash.value === 'solid') el.removeAttribute('data-dash'); else el.setAttribute('data-dash', dash.value);
        if (w != null && w >= 0) el.style.width = shN(w) + 'px';
        if (hh != null && hh >= 0 && Math.abs(hh - sz.h) > 0.5) el.style.height = shN(hh) + 'px';
        const r = PicEdit.angle(parseFloat(rot.value) || 0);
        if (r) { el.setAttribute('data-rot', String(shN(r))); el.style.transform = `rotate(${shN(r)}deg)`; } else { el.removeAttribute('data-rot'); el.style.removeProperty('transform'); }
        if (!a.line) {
          el.setAttribute('data-va', va.value);
          if (fit.checked) el.setAttribute('data-fit', '1'); else el.removeAttribute('data-fit');
          el.setAttribute('data-ins', insIn.map(x => { const px = len(x.value); return fmtNum(Math.max(0, px == null ? 0 : px) * 0.75, 2); }).join(' '));
        }
        this.render(el);
      }, { node: el, full: true });
      Images.refreshFrame();
      UI.refresh();
    } }] });
  },
};
/* inside a shape (its shadow root): the outline under the text, the text in its box */
const SHAPE_INNER_CSS = `
.g { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.g .hit { fill: none; stroke: transparent; stroke-width: 12px; pointer-events: stroke; }
.tx { position: absolute; display: flex; flex-direction: column; box-sizing: border-box; font-weight: 400; font-style: normal; text-align: left; text-indent: 0; letter-spacing: normal; word-spacing: normal; text-transform: none; white-space: pre-wrap; line-height: normal; }
.tx.t { justify-content: flex-start; } .tx.ctr { justify-content: center; } .tx.b { justify-content: flex-end; }
.tx > .in { flex: none; min-width: 0; }
.in > :last-child { margin-bottom: 0; }
.in > :first-child { margin-top: 0; }
`;
