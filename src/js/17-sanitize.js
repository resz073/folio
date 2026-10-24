/* ===================== HTML sanitizer (paste, drop, import) ===================== */
const SAN_DROP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'MAP', 'AREA', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'FORM', 'XML', 'DIALOG', 'COLGROUP']);
const SAN_INLINE_TAG = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', SUB: 'sub', SUP: 'sup' };
function safeJson(t) { try { return JSON.parse(t); } catch { return null; } }
const KNOWN_CLASSES = new Set(['title', 'subtitle', 'quote', 'code', 'nospacing', 'checklist', 'pb', 'img-left', 'img-right', 'img-center', 'img-border', 'tbl-grid', 'tbl-plain', 'tbl-lines', 'tbl-c-gray', 'tbl-c-green', 'tbl-c-blue', 'tbl-c-amber', 'hdr', 'band', 'cols', 'tc', 'tbl-bd']);
const FONT_KEYWORD_PT = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36, smaller: 9, larger: 14 };

function cssToPt(v, basePt = 11) {
  if (!v) return null;
  v = String(v).trim().toLowerCase();
  if (FONT_KEYWORD_PT[v]) return FONT_KEYWORD_PT[v];
  const m = v.match(/^(-?[\d.]+)(px|pt|em|rem|%|in|cm|mm)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'px': return n * 0.75;
    case 'pt': case undefined: return n;
    case 'em': case 'rem': return n * basePt;
    case '%': return (n / 100) * basePt;
    case 'in': return n * 72;
    case 'cm': return n * 28.3465;
    case 'mm': return n * 2.83465;
  }
  return null;
}
function parseStyleAttr(s) {
  const out = {};
  if (!s) return out;
  for (const part of String(s).split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase(), v = part.slice(i + 1).trim().replace(/\s*!important$/i, '');
    if (k) out[k] = v;
  }
  return out;
}
function inlineCss(st, merge) {
  const out = [];
  const fw = st['font-weight'];
  if (fw && (fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600)) out.push('font-weight:700');
  else if (fw && (fw === 'normal' || fw === '400' || parseInt(fw, 10) < 600)) out.push('font-weight:400');
  if (st['font-style'] === 'italic' || st['font-style'] === 'oblique') out.push('font-style:italic');
  else if (st['font-style'] === 'normal') out.push('font-style:normal');
  const td = (st['text-decoration-line'] || st['text-decoration'] || '').toLowerCase();
  const toks = [];
  if (/underline/.test(td)) toks.push('underline');
  if (/line-through/.test(td)) toks.push('line-through');
  if (toks.length) out.push('text-decoration-line:' + toks.join(' '));
  const va = (st['vertical-align'] || '').toLowerCase();
  if (va === 'super' || va === 'sub') out.push('vertical-align:' + va);
  if (st['text-transform'] === 'uppercase') out.push('text-transform:uppercase');
  if (/small-caps/.test(st['font-variant'] || '') || /small-caps/.test(st['font-variant-caps'] || '')) out.push('font-variant:small-caps');
  if (!merge) {
    const c = cssColorToHex(st.color);
    if (c && c !== '#000000') out.push('color:' + c);
    let bg = st['background-color'] || '';
    if (!bg && st.background) { const m = st.background.match(/(#[0-9a-f]{3,6}|rgba?\([^)]*\)|\b[a-z]+\b)/i); if (m) bg = m[1]; }
    if (st['mso-highlight']) bg = st['mso-highlight'];
    const b = cssColorToHex(bg);
    if (b && b !== '#ffffff') out.push('background-color:' + b);
    const ff = firstFamily(st['font-family'] || '');
    if (ff && !/^(inherit|initial|-apple-system|system-ui|blinkmacsystemfont|serif|sans-serif|monospace|var\(.*)$/i.test(ff)) out.push('font-family:' + fontStack(ff));
    const pt = cssToPt(st['font-size']);
    if (pt && pt >= 4 && pt <= 200) out.push('font-size:' + fmtNum(pt, 1) + 'pt');
    const ls = cssToPt(st['letter-spacing']);
    if (ls && Math.abs(ls) > 0.05 && Math.abs(ls) < 20) out.push('letter-spacing:' + fmtNum(ls, 2) + 'pt');
  }
  return out.join(';');
}
function blockCss(st, merge) {
  const out = [];
  const ta = (st['text-align'] || '').toLowerCase();
  if (/^(center|right|justify)$/.test(ta)) out.push('text-align:' + ta);
  if (!merge) {
    const ml = cssToPt(st['margin-left']);
    if (ml && ml > 2 && ml < 400) out.push('margin-left:' + fmtNum(ml, 1) + 'pt');
    const ti = cssToPt(st['text-indent']);
    if (ti && Math.abs(ti) > 1 && Math.abs(ti) < 300) out.push('text-indent:' + fmtNum(ti, 1) + 'pt');
    const lh = st['line-height'];
    if (lh) { const m = String(lh).match(/^([\d.]+)(%)?$/); if (m) { const v = m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]); if (v >= 0.8 && v <= 4) out.push('line-height:' + fmtNum(v, 2)); } }
    const bg = cssColorToHex(st['background-color'] || st.background || '');
    if (bg && bg !== '#ffffff') out.push('background-color:' + bg);
    const bd = declBorders(st);
    if (bd) {
      const pad = declPadding(st);
      for (const S of ['Top', 'Right', 'Bottom', 'Left']) if (bd[S]) { const k = S.toLowerCase(); out.push(`border-${k}:${bdrCss(bd[S])}`, `padding-${k}:${fmtNum(clamp(pad[S] || 0, 0, 31), 2)}pt`); }
      const btw = bdrParse(st['--bbtw']);
      if (btw) out.push('--bbtw:' + bdrCss(btw));
    }
  }
  return out.join(';');
}
function cleanHref(href) {
  if (!href) return null;
  href = href.trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(href)) return href;
  if (/^www\./i.test(href)) return 'https://' + href;
  return null;
}
function convertWordLists(root) {
  const paras = Array.from(root.querySelectorAll('p, h1, h2, h3, h4, h5, h6')).filter(p => /mso-list\s*:\s*l\d+/i.test(p.getAttribute('style') || ''));
  if (!paras.length) return;
  let stack = [], lastPara = null;
  for (const p of paras) {
    const st = p.getAttribute('style') || '';
    const lvl = parseInt((st.match(/level(\d+)/i) || [])[1] || '1', 10);
    const lid = ((st.match(/mso-list\s*:\s*(l\d+)/i) || [])[1] || '') + ':' + ((st.match(/lfo(\d+)/i) || [])[1] || '');
    // the marker sits in <![if !supportLists]> … <![endif]> and/or a mso-list:Ignore span
    let marker = takeWordConditional(p, 'supportLists');
    const ign = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
    if (ign) {
      if (!marker) marker = ign.textContent.replace(/\s+/g, '').trim();
      let top = ign; while (top.parentNode && top.parentNode !== p && top.parentNode.textContent.trim() === top.textContent.trim()) top = top.parentNode; top.remove();
    }
    let tag = 'ul', type = '';
    const mm = marker.match(/^\(?([0-9]+|[a-z]+|[A-Z]+)[.)\]]$/);
    if (mm) {
      tag = 'ol';
      const v = mm[1];
      if (/^\d+$/.test(v)) type = marker.endsWith(')') ? 'decimal-paren' : 'decimal';
      else if (/^[ivxlc]+$/.test(v) && v.length > 0 && (v === 'i' || v.length > 1)) type = 'lower-roman';
      else if (/^[IVXLC]+$/.test(v) && (v === 'I' || v.length > 1)) type = 'upper-roman';
      else if (/^[a-z]+$/.test(v)) type = marker.endsWith(')') ? 'lower-alpha-paren' : 'lower-alpha';
      else type = 'upper-alpha';
    } else if (/^[o]$/.test(marker)) type = 'circle';
    else if (/^[§▪■]$/.test(marker)) type = 'square';
    const contiguous = lastPara && sibAfterIgnoringBlank(lastPara) === p;
    if (!contiguous) stack = [];
    while (stack.length && stack[stack.length - 1].lvl > lvl) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || top.lvl < lvl || top.tag !== tag || (top.lvl === lvl && top.lid !== lid)) {
      if (top && top.lvl === lvl) stack.pop();
      const list = document.createElement(tag);
      if (type && !(tag === 'ul' && !type)) list.setAttribute('style', 'list-style-type:' + type);
      const parentTop = stack[stack.length - 1];
      if (parentTop && parentTop.list.lastElementChild) parentTop.list.lastElementChild.appendChild(list);
      else p.parentNode.insertBefore(list, p);
      stack.push(top = { lvl, tag, list, lid });
    }
    const li = document.createElement('li');
    while (p.firstChild) li.appendChild(p.firstChild);
    top.list.appendChild(li);
    const holder = document.createElement('span');
    holder.setAttribute('data-word-list-placeholder', '1');
    p.replaceWith(holder);
    lastPara = holder;
  }
  root.querySelectorAll('[data-word-list-placeholder]').forEach(x => x.remove());
}
/* Word wraps fallback content in <![if !name]> … <![endif]>, which parses as comments
   around ordinary nodes. Remove such a block from el and return its text. */
function takeWordConditional(el, name) {
  let text = '';
  const re = new RegExp('^\\[if !' + name + '\\]', 'i');
  const w = document.createTreeWalker(el, NodeFilter.SHOW_COMMENT);
  const starts = [];
  let c;
  while ((c = w.nextNode())) if (re.test(c.data.trim())) starts.push(c);
  for (const start of starts) {
    let n = start.nextSibling;
    while (n && !(n.nodeType === 8 && /^\[endif\]/i.test(n.data.trim()))) { const nx = n.nextSibling; text += n.textContent; n.remove(); n = nx; }
    if (n) n.remove();
    start.remove();
  }
  return text.replace(/\s+/g, '').trim();
}
function sibAfterIgnoringBlank(n) {
  let s = n.nextSibling;
  while (s && ((s.nodeType === 3 && !s.data.trim()) || s.nodeType === 8)) s = s.nextSibling;
  return s;
}

function sanitizeHtml(html, opts = {}) {
  const merge = opts.mode === 'merge';
  html = String(html || '').replace(/<!--\s*StartFragment\s*-->|<!--\s*EndFragment\s*-->/gi, '');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (/urn:schemas-microsoft-com:office|class=["']?Mso|mso-/i.test(html)) { convertWordLists(body); takeWordConditional(body, 'supportLineBreakNewLine'); takeWordConditional(body, 'supportLists'); }
  if (/schemas-microsoft-com:office:excel|ProgId content=["']?Excel/i.test(html)) inlineClassRules(doc);
  body.querySelectorAll('b[id^="docs-internal-guid"]').forEach(b => { while (b.firstChild) b.parentNode.insertBefore(b.firstChild, b); b.remove(); });
  const out = document.createDocumentFragment();
  // copied in Folio (onCopy marks it): its shapes come along, and in Keep Source Formatting its
  // classes (styles, tables, pictures in front of the text) too
  const internal = /<meta[^>]+name=["']?folio-copy/i.test(html);
  // text in a Bijoy font (SutonnyMJ…) is converted to Unicode
  if (!internal && !opts.noBijoy && typeof Bijoy !== 'undefined' && Bijoy.auto()) { const n = Bijoy.fromHtmlDoc(doc); if (n) Bijoy.pasted = n; }
  sanWalk(body, out, { pre: false, merge, inCell: false, keepClasses: !!opts.keepClasses || (internal && !merge && opts.mode !== 'text'), internal });
  return finalizeFragment(out);
}

/* Excel keeps cell formatting in a style sheet (.xl65 { font-weight:700 }); the simple class
   rules go into each cell's own style so the formatting comes along */
function inlineClassRules(doc) {
  const rules = new Map();
  for (const st of doc.querySelectorAll('style')) {
    const css = st.textContent.replace(/<!--|-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const sel of m[1].split(',')) {
        const k = sel.trim().match(/^(?:[a-z]+)?\.([\w-]+)$/i);
        if (k) rules.set(k[1], (rules.get(k[1]) || '') + ';' + m[2]);
      }
    }
  }
  if (!rules.size) return;
  for (const el of doc.body.querySelectorAll('[class]')) {
    let decl = '';
    for (const c of el.classList) if (rules.has(c)) decl += ';' + rules.get(c);
    if (decl) el.setAttribute('style', decl + ';' + (el.getAttribute('style') || ''));
  }
}
function sanWalk(src, dst, ctx) {
  for (let n = src.firstChild; n; n = n.nextSibling) sanNode(n, dst, ctx);
}
function sanNode(n, dst, ctx) {
  if (n.nodeType === 3) {
    let t = n.data;
    if (!ctx.pre) { t = t.replace(/[\t\n\r ]+/g, ' ').replace(/\u00A0/g, ' '); }
    else t = t.replace(/\u00A0/g, ' ');
    if (t) dst.appendChild(document.createTextNode(t));
    return;
  }
  if (n.nodeType !== 1) return;
  const tag = n.tagName.toUpperCase();
  if (SAN_DROP.has(tag) || tag.includes(':') && !/^O:P$/.test(tag) && !n.textContent.trim()) return;
  if (n.getAttribute && (n.getAttribute('style') || '').match(/display\s*:\s*none|mso-hide\s*:\s*all/i)) return;
  if (n.classList && (n.classList.contains('pg-spacer') || n.classList.contains('pg-line') || n.classList.contains('qm'))) return;
  const st = parseStyleAttr(n.getAttribute('style'));
  const cls = n.getAttribute('class') || '';
  const keepCls = c => ctx.keepClasses ? c : c.split(/\s+/).filter(x => KNOWN_CLASSES.has(x) && x !== 'tc').join(' ');

  if (tag === 'BR') {
    if (/page-break-before\s*:\s*always/i.test(n.getAttribute('style') || '')) { dst.appendChild(h('hr', { class: 'pb' })); return; }
    dst.appendChild(document.createElement('br'));
    return;
  }
  // a section break copied in Folio keeps its section's settings (a pasted one is a page break)
  if (tag === 'HR' && /\bsb\b/.test(cls)) {
    if (!(ctx.keepClasses || ctx.internal)) { dst.appendChild(h('hr', { class: 'pb' })); return; }
    const el = h('hr', { class: 'sb', 'data-sb': SB_KINDS[n.getAttribute('data-sb')] ? n.getAttribute('data-sb') : 'next' });
    for (const a of ['data-pg', 'data-pn']) { const v = n.getAttribute(a); if (v) { try { const o = JSON.parse(v); if (o && typeof o === 'object') el.setAttribute(a, JSON.stringify(o)); } catch { } } }
    if (n.getAttribute('data-first') === '1') el.setAttribute('data-first', '1');
    const sid = n.getAttribute('data-sid');
    if (sid && /^[\w-]{1,40}$/.test(sid)) el.setAttribute('data-sid', sid);
    dst.appendChild(el);
    return;
  }
  if (tag === 'HR') { dst.appendChild(h('hr', /\bpb\b/.test(cls) || /page-break/i.test(n.getAttribute('style') || '') ? { class: 'pb' } : null)); return; }
  if (tag === 'IMG') {
    const src = n.getAttribute('src') || '';
    if (!/^data:image\//i.test(src) && !/^blob:/i.test(src) && !/^\/_blob\//.test(src)) { const alt = n.getAttribute('alt'); if (alt) dst.appendChild(document.createTextNode('[' + alt + ']')); return; }
    const img = h('img', { src });
    if (n.getAttribute('alt')) img.setAttribute('alt', n.getAttribute('alt'));
    const w = parseFloat(st.width || n.getAttribute('width'));
    const hh = parseFloat(st.height || n.getAttribute('height'));
    if (w && !/%/.test(st.width || '')) img.style.width = Math.round(String(st.width || '').endsWith('pt') ? w / 0.75 : w) + 'px';
    if (hh && st.height && !/auto|%/.test(st.height) && n.hasAttribute('data-stretch')) img.style.height = Math.round(hh) + 'px';
    const c = keepCls(cls);
    if (c) img.className = c;
    if (ctx.keepClasses) {
      // copied inside Folio: a floating picture's place and a picture's edits (with its original) come along
      if (/\bimg-(front|behind)\b/.test(c)) for (const k of ['left', 'top']) { const v = parseFloat(st[k]); if (isFinite(v)) img.style[k] = v + 'px'; }
      if (hh && st.height && !/auto|%/.test(st.height)) img.style.height = Math.round(hh) + 'px';
      const xf = n.getAttribute('data-xf'), orig = n.getAttribute('data-orig') || '';
      if (xf && /^data:image\//i.test(orig)) { img.setAttribute('data-xf', JSON.stringify(PicEdit.clean(safeJson(xf)))); img.setAttribute('data-orig', orig); }
    }
    dst.appendChild(img);
    return;
  }
  if (tag === 'A') {
    const href = cleanHref(n.getAttribute('href'));
    if (!href) { sanWalk(n, dst, ctx); return; }
    const a = h('a', { href });
    sanWalk(n, a, ctx);
    if (a.firstChild) dst.appendChild(a);
    return;
  }
  // a footnote or endnote mark copied in Folio: kept, to bring its note (Notes.adopt)
  if (tag === 'SUP' && n.classList.contains('fn') && /^[\w-]{1,40}$/.test(n.getAttribute('data-fn') || '')) {
    dst.appendChild(h('sup', { class: n.classList.contains('en') ? 'fn en' : 'fn', 'data-fn': n.getAttribute('data-fn'), contenteditable: 'false' }, n.textContent));
    return;
  }
  // a shape or text box copied in Folio: kept (its text cleaned as pasted text is)
  if (tag === 'SPAN' && (ctx.keepClasses || ctx.internal) && n.classList.contains('shp')) { const sh = Shapes.sanitize(n, st); if (sh) dst.appendChild(sh); return; }
  if (SAN_INLINE_TAG[tag]) {
    const el = document.createElement(SAN_INLINE_TAG[tag]);
    if (tag === 'DEL' && n.classList.contains('tc') && ctx.keepClasses) { const d = document.createElement('del'); d.className = 'tc'; for (const a of ['data-author', 'data-time', 'data-uid']) if (n.hasAttribute(a)) d.setAttribute(a, n.getAttribute(a)); sanWalk(n, d, ctx); dst.appendChild(d); return; }
    const css = inlineCss(st, ctx.merge);
    if (css) el.setAttribute('style', css);
    sanWalk(n, el, ctx);
    if (el.firstChild) dst.appendChild(el);
    return;
  }
  if (tag === 'INS') {
    if (n.classList.contains('tc') && ctx.keepClasses) { const d = document.createElement('ins'); d.className = 'tc'; for (const a of ['data-author', 'data-time', 'data-uid']) if (n.hasAttribute(a)) d.setAttribute(a, n.getAttribute(a)); sanWalk(n, d, ctx); dst.appendChild(d); return; }
    sanWalk(n, dst, ctx); return;
  }
  if (tag === 'SPAN' || tag === 'FONT' || tag === 'MARK' || tag === 'CODE' || tag === 'KBD' || tag === 'TT' || tag === 'SAMP' || tag === 'SMALL' || tag === 'BIG' || tag === 'Q' || tag === 'CITE' || tag === 'ABBR' || tag === 'DFN' || tag === 'TIME' || tag === 'LABEL' || tag === 'VAR' || tag === 'O:P' || tag === 'NOBR' || tag === 'WBR' || !BLOCK_TAGS.has(tag)) {
    if (tag === 'SPAN' && /mso-list\s*:\s*ignore/i.test(n.getAttribute('style') || '')) return;
    if (tag === 'SPAN' && ctx.keepClasses && n.classList.contains('cmt')) { const sp = h('span', { class: 'cmt', 'data-cid': n.getAttribute('data-cid') }); sanWalk(n, sp, ctx); if (sp.firstChild) dst.appendChild(sp); return; }
    if (tag === 'FONT') { if (n.getAttribute('face')) st['font-family'] = n.getAttribute('face'); if (n.getAttribute('color')) st.color = n.getAttribute('color'); const sz = { 1: '8pt', 2: '10pt', 3: '12pt', 4: '14pt', 5: '18pt', 6: '24pt', 7: '36pt' }[n.getAttribute('size')]; if (sz) st['font-size'] = sz; }
    if (tag === 'MARK' && !st['background-color']) st['background-color'] = '#ffff00';
    if (/^(CODE|KBD|TT|SAMP)$/.test(tag) && !st['font-family']) st['font-family'] = 'Consolas';
    const tb = !ctx.merge && tag === 'SPAN' ? declBorders(st) : null;
    if (tb && tb.Top && bdrEq(tb.Top, tb.Bottom) && bdrEq(tb.Top, tb.Left) && bdrEq(tb.Top, tb.Right)) {
      const sp = h('span', { 'data-tb': '', style: `border:${bdrCss(tb.Top)};padding:0 1pt` });
      const css2 = inlineCss(st, ctx.merge);
      if (css2) { const inner = h('span', { style: css2 }); sanWalk(n, inner, ctx); if (inner.firstChild) sp.appendChild(inner); }
      else sanWalk(n, sp, ctx);
      if (sp.firstChild) dst.appendChild(sp);
      return;
    }
    const css = inlineCss(st, ctx.merge);
    if (css) { const sp = h('span', { style: css }); sanWalk(n, sp, ctx); if (sp.firstChild) dst.appendChild(sp); }
    else sanWalk(n, dst, ctx);
    return;
  }
  // ----- blocks -----
  if (tag === 'UL' || tag === 'OL') {
    const list = document.createElement(tag.toLowerCase());
    const lst = (st['list-style-type'] || '').trim();
    const typeAttr = n.getAttribute('type');
    const map = { a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman', 1: 'decimal' };
    if (lst && lst !== 'none' && !/^(disc|decimal)$/.test(lst)) list.style.listStyleType = lst;
    else if (typeAttr && map[typeAttr]) list.style.listStyleType = map[typeAttr];
    if (n.getAttribute('start') && tag === 'OL') list.setAttribute('start', n.getAttribute('start'));
    const c = keepCls(cls); if (c) list.className = c;
    for (let k = n.firstChild; k; k = k.nextSibling) {
      if (k.nodeType === 1 && k.tagName === 'LI') {
        const li = document.createElement('li');
        if (k.hasAttribute('data-checked')) li.setAttribute('data-checked', k.getAttribute('data-checked') === 'true' ? 'true' : 'false');
        const blk = blockCss(parseStyleAttr(k.getAttribute('style')), ctx.merge).replace(/margin-left:[^;]+;?/, '');
        if (blk) li.setAttribute('style', blk);
        sanWalk(k, li, Object.assign({}, ctx));
        flattenBlocksInto(li);
        if (!li.firstChild) li.appendChild(document.createElement('br'));
        list.appendChild(li);
      } else if (k.nodeType === 1 && (k.tagName === 'UL' || k.tagName === 'OL')) {
        const tmp = document.createDocumentFragment();
        sanNode(k, tmp, ctx);
        if (list.lastElementChild) list.lastElementChild.appendChild(tmp); else { const li = document.createElement('li'); li.appendChild(tmp); list.appendChild(li); }
      } else if (k.nodeType === 1) {
        const li = document.createElement('li'); sanNode(k, li, ctx); if (li.firstChild) list.appendChild(li);
      } else if (k.nodeType === 3 && k.data.trim()) { const li = document.createElement('li'); li.textContent = k.data.trim(); list.appendChild(li); }
    }
    if (list.firstChild) dst.appendChild(list);
    return;
  }
  if (tag === 'LI') { const li = document.createElement('li'); sanWalk(n, li, ctx); dst.appendChild(li); return; }
  if (tag === 'TABLE') { dst.appendChild(sanTable(n, ctx)); return; }
  if (/^(THEAD|TBODY|TFOOT|TR|TD|TH|CAPTION)$/.test(tag)) { sanWalk(n, dst, ctx); return; }
  if (tag === 'PRE') {
    const lines = n.textContent.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    for (const ln of lines) dst.appendChild(ln ? h('p', { class: 'code' }, ln) : h('p', { class: 'code' }, h('br')));
    return;
  }
  if (tag === 'BLOCKQUOTE') {
    const tmp = document.createDocumentFragment();
    sanWalk(n, tmp, ctx);
    const fin = finalizeFragment(tmp);
    for (const k of Array.from(fin.childNodes)) { if (k.nodeType === 1 && k.tagName === 'P' && !k.className) k.className = 'quote'; dst.appendChild(k); }
    return;
  }
  if (tag === 'DIV' && n.classList.contains('toc') && ctx.keepClasses) { const d = n.cloneNode(true); dst.appendChild(d); return; }
  if (tag === 'DIV' && n.classList.contains('cols')) {
    const d = h('div', { class: 'cols' });
    if (n.style.getPropertyValue('--cols')) d.style.setProperty('--cols', n.style.getPropertyValue('--cols'));
    const tmp = document.createDocumentFragment(); sanWalk(n, tmp, ctx); d.appendChild(finalizeFragment(tmp));
    dst.appendChild(d); return;
  }
  // P, H1-6, DIV, SECTION... → paragraph-level element
  const isHeading = /^H[1-6]$/.test(tag);
  const mso = /MsoTitle/i.test(cls) ? 'title' : /MsoSubtitle/i.test(cls) ? 'subtitle' : /MsoQuote|IntenseQuote/i.test(cls) ? 'quote' : /MsoNoSpacing/i.test(cls) ? 'nospacing' : '';
  const hasBlockKids = Array.from(n.children).some(k => BLOCK_TAGS.has(k.tagName.toUpperCase()) && k.tagName !== 'BR');
  if (!isHeading && hasBlockKids) {
    // a wrapper: carry its alignment to loose text and recurse
    const tmp = document.createDocumentFragment();
    sanWalk(n, tmp, ctx);
    const fin = finalizeFragment(tmp);
    const ta = blockCss(st, ctx.merge);
    if (ta) for (const k of Array.from(fin.childNodes)) if (k.nodeType === 1 && /^(P|H[1-6])$/.test(k.tagName) && !k.getAttribute('style')) k.setAttribute('style', ta);
    dst.appendChild(fin);
    if (/page-break-after\s*:\s*always/i.test(n.getAttribute('style') || '')) dst.appendChild(h('hr', { class: 'pb' }));
    return;
  }
  if (/page-break-before\s*:\s*always/i.test(n.getAttribute('style') || '')) dst.appendChild(h('hr', { class: 'pb' }));
  const el = document.createElement(isHeading ? tag.toLowerCase() : 'p');
  const c = keepCls(cls) || mso;
  if (c && !isHeading) el.className = c;
  const css = blockCss(st, ctx.merge);
  const inl = inlineCss(st, ctx.merge);
  if (css) el.setAttribute('style', css);
  if (n.getAttribute('data-align') === 'decimal' && !ctx.merge) { el.setAttribute('data-align', 'decimal'); el.style.textAlign = 'right'; }
  if (inl && !isHeading) {
    const sp = h('span', { style: inl }); sanWalk(n, sp, ctx);
    if (sp.firstChild) el.appendChild(sp);
  } else sanWalk(n, el, ctx);
  trimBlock(el);
  if (!el.firstChild) el.appendChild(document.createElement('br'));
  dst.appendChild(el);
  if (/page-break-after\s*:\s*always/i.test(n.getAttribute('style') || '')) dst.appendChild(h('hr', { class: 'pb' }));
}
function sanTable(t, ctx) {
  const tbl = document.createElement('table');
  const cls = (t.getAttribute('class') || '').split(/\s+/).filter(x => KNOWN_CLASSES.has(x));
  const bAttr = parseInt(t.getAttribute('border') || '0', 10);
  const anyBorder = bAttr > 0 || /border/i.test(t.getAttribute('style') || '') || Array.from(t.querySelectorAll('td,th')).slice(0, 6).some(td => /border(-\w+)?\s*:\s*(?!none)(?!0)[^;]*(solid|dashed|dotted|double|windowtext|#|rgb|black)/i.test(td.getAttribute('style') || ''));
  tbl.className = cls.length ? cls.join(' ') : (anyBorder ? 'tbl-grid' : 'tbl-plain');
  const keepB = !ctx.merge;
  if (keepB && t.classList.contains('tbl-bd')) for (const k of ['--bt', '--bb', '--bl', '--br', '--bh', '--bv']) tbl.style.setProperty(k, bdrCss(bdrParse(t.style.getPropertyValue(k))));
  // copied within Folio: the table keeps its AutoFit setting and column widths
  if (ctx.keepClasses && !ctx.merge) {
    const fit = t.getAttribute('data-fit');
    if (fit === 'contents' || fit === 'window' || fit === 'fixed') tbl.setAttribute('data-fit', fit);
    const cg = Array.from(t.children).find(k => k.tagName === 'COLGROUP');
    const tw = parseStyleAttr(t.getAttribute('style')).width || '';
    if (fit === 'contents') tbl.style.tableLayout = 'auto';
    else if (cg) {
      const ncg = document.createElement('colgroup');
      for (const col of Array.from(cg.children)) { const w = (parseStyleAttr(col.getAttribute('style')).width || '').trim(); if (/^[\d.]+(px|%)$/.test(w)) ncg.appendChild(h('col', { style: 'width:' + w })); }
      if (ncg.children.length) { tbl.appendChild(ncg); if (/^[\d.]+(px|%)$/.test(tw.trim())) tbl.style.width = tw.trim(); }
    }
  }
  let cellBorders = false;
  const tbody = document.createElement('tbody');
  tbl.appendChild(tbody);
  const rows = Array.from(t.rows || []);
  let maxCols = 0;
  for (const row of rows) {
    if (row.closest('table') !== t) continue;
    if (row.classList && row.classList.contains('pg-spacer')) continue;
    const tr = document.createElement('tr');
    let cols = 0;
    for (const cell of Array.from(row.cells)) {
      const td = document.createElement(cell.tagName === 'TH' ? 'th' : 'td');
      const cs = parseInt(cell.getAttribute('colspan') || '1', 10), rs = parseInt(cell.getAttribute('rowspan') || '1', 10);
      if (cs > 1) td.setAttribute('colspan', cs);
      if (rs > 1) td.setAttribute('rowspan', rs);
      cols += cs;
      const cst = parseStyleAttr(cell.getAttribute('style'));
      const bg = !ctx.merge && cssColorToHex(cst['background-color'] || cst.background || cell.getAttribute('bgcolor') || '');
      if (bg && bg !== '#ffffff') td.style.backgroundColor = bg;
      const va = (cst['vertical-align'] || cell.getAttribute('valign') || '').toLowerCase();
      if (va === 'middle' || va === 'bottom') td.style.verticalAlign = va;
      if (keepB) {
        const cb = declBorders(cst);
        if (cb) for (const S of ['Top', 'Right', 'Bottom', 'Left']) if (cb[S] !== undefined) { td.style['border' + S] = bdrCss(cb[S]); cellBorders = true; }
        for (const a of ['data-dd', 'data-du']) { const b2 = bdrParse(cell.getAttribute(a)); if (b2) td.setAttribute(a, bdrCss(b2)); }
        const pat = cell.getAttribute('data-shd');
        if (pat && SHD_PATTERNS.some(x => x[0] === pat)) { td.setAttribute('data-shd', pat); td.setAttribute('data-shdc', cssColorToHex(cell.getAttribute('data-shdc')) || '#000000'); td.setAttribute('data-shdf', cssColorToHex(cell.getAttribute('data-shdf')) || 'auto'); }
        if (td.hasAttribute('data-dd') || td.hasAttribute('data-du') || td.hasAttribute('data-shd')) decoSync(td);
      }
      const tmp = document.createDocumentFragment();
      sanWalk(cell, tmp, Object.assign({}, ctx, { inCell: true }));
      const fin = finalizeFragment(tmp);
      if (!fin.firstChild) fin.appendChild(h('p', null, h('br')));
      // text formatting and alignment set on the cell itself (Excel, Google Sheets) go to its paragraphs
      const tst = Object.assign({}, cst);
      delete tst['background-color']; delete tst.background; delete tst['mso-highlight'];
      const cin = inlineCss(tst, ctx.merge);
      const ta = (cst['text-align'] || cell.getAttribute('align') || '').toLowerCase();
      for (const k of Array.from(fin.childNodes)) {
        if (k.nodeType !== 1 || !/^(P|H[1-6])$/.test(k.tagName)) continue;
        if (cin && !(k.childNodes.length === 1 && k.firstChild.nodeName === 'BR')) { const sp = h('span', { style: cin }); while (k.firstChild) sp.appendChild(k.firstChild); k.appendChild(sp); }
        if (/^(center|right|justify)$/.test(ta) && !k.style.textAlign) k.style.textAlign = ta;
      }
      td.appendChild(fin);
      tr.appendChild(td);
    }
    maxCols = Math.max(maxCols, cols);
    if (tr.firstChild) tbody.appendChild(tr);
  }
  // cells that bring their own borders (Word, other pages): the table adds none of its own
  if (cellBorders && !tbl.classList.contains('tbl-bd')) {
    ['tbl-grid', 'tbl-plain', 'tbl-lines'].forEach(c => tbl.classList.remove(c));
    tbl.classList.add('tbl-bd');
    for (const k of ['--bt', '--bb', '--bl', '--br', '--bh', '--bv']) tbl.style.setProperty(k, 'none');
  }
  return tbl;
}
function flattenBlocksInto(li) {
  // list items keep at most simple paragraphs; unwrap single paragraph wrappers
  const ps = Array.from(li.children).filter(k => k.tagName === 'P');
  if (ps.length === 1 && li.children.length >= 1 && li.firstElementChild === ps[0]) {
    const p = ps[0];
    const st = p.getAttribute('style');
    if (st && /text-align/.test(st)) li.setAttribute('style', (li.getAttribute('style') || '') + ';' + st);
    while (p.firstChild) li.insertBefore(p.firstChild, p);
    p.remove();
  }
  trimBlock(li);
}
function trimBlock(el) {
  let f = el.firstChild;
  while (f && f.nodeType === 3 && !f.data.trim()) { const n = f.nextSibling; f.remove(); f = n; }
  if (f && f.nodeType === 3) f.data = f.data.replace(/^ +/, '');
  let l = el.lastChild;
  while (l && l.nodeType === 3 && !l.data.trim()) { const p = l.previousSibling; l.remove(); l = p; }
  if (l && l.nodeType === 3) l.data = l.data.replace(/ +$/, '');
  if (l && l.nodeName === 'BR' && l.previousSibling) l.remove();
}
/* Wrap loose inline runs at the top level of a fragment into paragraphs */
function finalizeFragment(frag) {
  const out = document.createDocumentFragment();
  let p = null;
  for (const n of Array.from(frag.childNodes)) {
    const block = n.nodeType === 1 && (isBlockEl(n) || n.classList.contains('toc'));
    if (block) {
      if (p) { trimBlock(p); if (p.firstChild) out.appendChild(p); p = null; }
      out.appendChild(n);
    } else {
      if (n.nodeType === 3 && !p && !n.data.trim()) continue;
      if (n.nodeName === 'BR' && !p) { continue; }
      if (!p) p = document.createElement('p');
      p.appendChild(n);
    }
  }
  if (p) { trimBlock(p); if (p.firstChild) out.appendChild(p); }
  return out;
}
