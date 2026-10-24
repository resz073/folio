/* ===================== .docx writer (OOXML, built by hand) ===================== */
const NS_DECL = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
/* parts that can hold shapes and text boxes (Word 2010's wps shapes, in mc:AlternateContent) */
const NS_DRAW = NS_DECL + ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const HL_COLORS = { ffff00: 'yellow', '00ff00': 'green', '00ffff': 'cyan', ff00ff: 'magenta', '0000ff': 'blue', ff0000: 'red', '000080': 'darkBlue', '008080': 'darkCyan', '008000': 'darkGreen', '800080': 'darkMagenta', '800000': 'darkRed', '808000': 'darkYellow', '808080': 'darkGray', c0c0c0: 'lightGray', '000000': 'black' };
const STYLE_IDS = { normal: null, nospacing: 'NoSpacing', title: 'Title', subtitle: 'Subtitle', h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', h4: 'Heading4', h5: 'Heading5', h6: 'Heading6', quote: 'Quote', code: 'Code' };
const twp = px => Math.round(px * 15);
const emu = px => Math.round(px * 9525);
const hpt = pt => Math.round(pt * 2);
const hex6 = c => (c || '#000000').replace('#', '').toUpperCase();
const isoDate = ts => new Date(ts || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z');
const isBanglaFont = isBanglaFontName;

function docVarsCss() {
  const d = S.doc;
  return `--doc-font:${fontStack(d.font)};--doc-bn:${bnStack(docBnFont())};--doc-size:${d.size}pt;--doc-line:${d.line || 1.08};--doc-r:${LineH.stack(fontStack(d.font))};--doc-after:${d.after != null ? d.after : 8}pt;` + (d.headFont ? `--doc-head-font:${fontStack(d.headFont)};--head-r:${LineH.stack(fontStack(d.headFont))};` : '');
}
/* the document's Bangla font: its own setting, else the main font when that is Bangla */
function docBnFont() { const d = S.doc; return d.bnFont || (isBanglaFontName(d.font) ? d.font : 'Noto Sans Bengali'); }
/* Measure each paragraph style as the browser renders it, so styles.xml matches the screen */
function measureStyles() {
  const keys = ['normal', 'nospacing', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'code'].concat(Styles.custom());
  const box = h('div', { class: 'doc', style: `position:absolute;left:-20000px;top:0;width:${geom().cw}px;${docVarsCss()}` });
  const els = {};
  for (const k of keys) {
    const tag = /^h\d$/.test(k) ? k.toUpperCase() : 'P';
    const el = document.createElement(tag);
    if (!/^h\d$/.test(k) && k !== 'normal') el.className = k;
    el.textContent = 'Sample';
    // each sample on its own: the space a paragraph takes after code (p.code + p) isn't its style's
    if (box.lastChild) box.appendChild(document.createElement('div'));
    box.appendChild(el);
    els[k] = el;
  }
  $('#renderHost').appendChild(box);
  const out = {};
  for (const k of keys) {
    const cs = getComputedStyle(els[k]);
    const fs = parseFloat(cs.fontSize) || 14.67;
    const lh = parseFloat(cs.lineHeight);
    out[k] = {
      font: firstFamily(cs.fontFamily), size: Math.round(fs * 0.75 * 2) / 2, bold: parseInt(cs.fontWeight, 10) >= 600, italic: cs.fontStyle === 'italic',
      color: cssColorToHex(cs.color) || '#000000', before: parseFloat(cs.marginTop) || 0, after: parseFloat(cs.marginBottom) || 0,
      line: Math.round((parseFloat(cs.getPropertyValue('--lhm')) || (lh ? lh / fs : 1.15)) * 100) / 100, ls: parseFloat(cs.letterSpacing) || 0, bg: cssColorToHex(cs.backgroundColor),
      underline: /underline/.test(cs.textDecorationLine || ''), align: cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign,
      indent: parseFloat(cs.marginLeft) || 0, first: parseFloat(cs.textIndent) || 0,
    };
  }
  box.remove();
  return out;
}

async function prepareImages(root, start = 0) {
  const map = new Map();
  let i = start;
  // the pictures in the text, and those in its shapes' text
  for (const img of [...root.querySelectorAll('img'), ...Shapes.inners(root).flatMap(i => Array.from(i.querySelectorAll('img')))]) {
    try {
      let src = img.getAttribute('src') || '';
      let mime, bytes;
      if (/^data:/i.test(src)) ({ mime, bytes } = dataUrlToBytes(src));
      else { const r = await fetch(src); const b = await r.blob(); mime = b.type; bytes = new Uint8Array(await b.arrayBuffer()); }
      if (!/^image\/(png|jpeg|gif)$/i.test(mime)) {
        const im = await loadImg(img.src);
        const cv = document.createElement('canvas');
        cv.width = im.naturalWidth || img.offsetWidth || 300; cv.height = im.naturalHeight || img.offsetHeight || 200;
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        ({ mime, bytes } = dataUrlToBytes(cv.toDataURL('image/png')));
      }
      const ext = /png/i.test(mime) ? 'png' : /gif/i.test(mime) ? 'gif' : 'jpeg';
      i++;
      map.set(img, { bytes, ext, name: `image${i}.${ext}`, w: img.offsetWidth || 100, h: img.offsetHeight || 100 });
    } catch (e) { console.warn('image skipped', e); }
  }
  return map;
}
function watermarkPng(wm) {
  const F = 160;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = `700 ${F}px Calibri, Carlito, "Noto Sans Bengali", sans-serif`;
  const tw = Math.ceil(ctx.measureText(wm.text).width), th = Math.ceil(F * 1.2);
  const side = Math.ceil((tw + th) / Math.SQRT2) + 20;
  cv.width = side; cv.height = side;
  const c2 = cv.getContext('2d');
  c2.translate(side / 2, side / 2);
  c2.rotate(-Math.PI / 4);
  c2.font = `700 ${F}px Calibri, Carlito, "Noto Sans Bengali", sans-serif`;
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.globalAlpha = wm.opacity != null ? wm.opacity : 0.45;
  c2.fillStyle = wm.color || '#c0c0c0';
  c2.fillText(wm.text, 0, 0);
  return { ...dataUrlToBytes(cv.toDataURL('image/png')), side };
}

class DocxCtx {
  constructor() {
    this.rels = [];
    this.relN = 10;
    this.media = [];
    this.docPr = 1;
    this.lists = [];
    this.tcId = 1;
    this.bm = new Map();
    this.bmN = 0;
    this.cmt = new Map();
    this.cache = new WeakMap();
    this.hdrRels = { hdr: [], ftr: [] };
  }
  rel(type, target, external) {
    const id = 'rId' + (this.relN++);
    this.rels.push({ id, type, target, external });
    return id;
  }
  bookmarkFor(id) {
    if (!id) return null;
    if (!this.bm.has(id)) this.bm.set(id, { name: '_Toc' + String(100000 + (++this.bmN)), n: this.bmN });
    return this.bm.get(id).name;
  }
}

function runProps(el, ctx, block) {
  let p = ctx.cache.get(el);
  if (p) return p;
  const cs = getComputedStyle(el);
  p = {};
  p.font = firstFamily(cs.fontFamily);
  let sizeEl = el, vert = null, under = null, strike = false, bg = null, link = false;
  for (let a = el; a && a !== block && a !== S.editor && a.nodeType === 1; a = a.parentNode) {
    if (a.tagName === 'A') link = true;
    if (a.matches('ins.tc, del.tc, span.cmt')) continue;
    const acs = a === el ? cs : getComputedStyle(a);
    const va = acs.verticalAlign;
    if (!vert && (va === 'super' || va === 'sub')) { vert = va === 'super' ? 'superscript' : 'subscript'; sizeEl = a.parentNode; }
    const line = acs.textDecorationLine || '';
    if (!under && /underline/.test(line)) { const st = acs.textDecorationStyle; under = st === 'double' ? 'double' : st === 'dotted' ? 'dotted' : st === 'dashed' ? 'dash' : st === 'wavy' ? 'wave' : (parseFloat(acs.textDecorationThickness) >= 2 ? 'thick' : 'single'); }
    if (/line-through/.test(line)) strike = true;
    if (!bg) bg = cssColorToHex(acs.backgroundColor);
    if (!p.bdr && a.hasAttribute('data-tb')) { p.bdr = bdrInline(a, 'Top') || null; p.bdrShadow = !!(a.style.boxShadow && a.style.boxShadow !== 'none'); }
    if (!p.shdEl && a.hasAttribute('data-shd')) p.shdEl = a;
  }
  const scs = sizeEl === el ? cs : getComputedStyle(sizeEl && sizeEl.nodeType === 1 ? sizeEl : el);
  p.size = Math.round(parseFloat(scs.fontSize) * 0.75 * 2) / 2;
  p.bold = parseInt(cs.fontWeight, 10) >= 600;
  p.italic = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
  p.color = cssColorToHex(cs.color) || '#000000';
  p.vert = vert; p.underline = under; p.strike = strike; p.bg = bg; p.link = link;
  p.caps = cs.textTransform === 'uppercase';
  p.smallCaps = /small-caps/.test(cs.fontVariantCaps || cs.fontVariant || '');
  const ls = parseFloat(cs.letterSpacing);
  p.spacing = ls ? Math.round(ls * 15) : 0;
  ctx.cache.set(el, p);
  return p;
}
function rPrXml(p, base, text) {
  const o = [];
  const bengali = /[ঀ-৿]/.test(text || '');
  if (p.link) o.push('<w:rStyle w:val="Hyperlink"/>');
  if (p.font && p.font.toLowerCase() !== (base.font || '').toLowerCase()) {
    const f = escXml(p.font);
    const cs = bengali && !isBanglaFont(p.font) ? escXml(docBnFont()) : f;
    o.push(`<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${cs}"/>`);
  }
  if (p.bold !== base.bold) o.push(p.bold ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>');
  if (p.italic !== base.italic) o.push(p.italic ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>');
  if (p.caps) o.push('<w:caps/>');
  if (p.smallCaps) o.push('<w:smallCaps/>');
  if (p.strike) o.push('<w:strike/>');
  const linkColor = p.link && p.color === '#0563c1';
  if (p.color && p.color !== base.color && !linkColor) o.push(`<w:color w:val="${hex6(p.color)}"/>`);
  if (p.spacing) o.push(`<w:spacing w:val="${p.spacing}"/>`);
  if (p.size && Math.abs(p.size - base.size) > 0.01) o.push(`<w:sz w:val="${hpt(p.size)}"/><w:szCs w:val="${hpt(p.size)}"/>`);
  const hl = p.bg && HL_COLORS[p.bg.slice(1)];
  if (hl) o.push(`<w:highlight w:val="${hl}"/>`);
  if (p.underline && !(p.link && p.underline === 'single')) o.push(`<w:u w:val="${p.underline}"/>`);
  if (p.bdr) o.push(bdrWordXml('bdr', p.bdr, 0, p.bdrShadow ? ' w:shadow="1"' : ''));
  if (p.shdEl) o.push(shdXml(p.shdEl, p.bg));
  else if (p.bg && !hl) o.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hex6(p.bg)}"/>`);
  if (p.vert) o.push(`<w:vertAlign w:val="${p.vert}"/>`);
  return o.length ? `<w:rPr>${o.join('')}</w:rPr>` : '';
}
function textRuns(text, rpr) {
  const out = [];
  const parts = text.split(/(\t|\n)/);
  for (const part of parts) {
    if (!part) continue;
    if (part === '\t') out.push(`<w:r>${rpr}<w:tab/></w:r>`);
    else if (part === '\n') out.push(`<w:r>${rpr}<w:br/></w:r>`);
    else out.push(`<w:r>${rpr}<w:t xml:space="preserve">${escXml(part)}</w:t></w:r>`);
  }
  return out.join('');
}
function docxAuthor(entry) { const n = authorName(entry); return n === 'You' || n === 'Someone' ? 'Author' : n; }
function tcWrap(xml, st, ctx) {
  const el = st.del || st.ins;
  if (!el || !xml) return xml;
  const author = escXml(el.getAttribute('data-author') || (el.getAttribute('data-uid') === Cap.uid ? (Prefs.author || Cap.name) : '') || 'Author');
  const date = isoDate(parseInt(el.getAttribute('data-time') || '0', 10) || Date.now());
  if (st.del) return `<w:del w:id="${ctx.tcId++}" w:author="${author}" w:date="${date}">${xml.replace(/<w:t xml:space="preserve">/g, '<w:delText xml:space="preserve">').replace(/<\/w:t>/g, '</w:delText>')}</w:del>`;
  return `<w:ins w:id="${ctx.tcId++}" w:author="${author}" w:date="${date}">${xml}</w:ins>`;
}
/* <w:ins/> or <w:del/> for something added or removed whole, by whoever made its changes */
function tcbXml(el, ctx) {
  const kind = el.getAttribute('data-tcb'), t = el.querySelector(kind === 'del' ? 'del.tc' : 'ins.tc');
  if (!t || (kind !== 'ins' && kind !== 'del')) return '';
  const author = escXml(t.getAttribute('data-author') || (t.getAttribute('data-uid') === Cap.uid ? (Prefs.author || Cap.name) : '') || 'Author');
  return `<w:${kind} w:id="${ctx.tcId++}" w:author="${author}" w:date="${isoDate(parseInt(t.getAttribute('data-time') || '0', 10) || Date.now())}"/>`;
}
function imageXml(img, ctx, rels) {
  const im = ctx.images.get(img);
  if (!im) return '';
  let rid;
  if (!im.rid) { im.rid = ctx.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', 'media/' + im.name); ctx.media.push(im); }
  rid = im.rid;
  void rels;
  const cx = emu(im.w), cy = emu(im.h);
  const id = ctx.docPr++;
  const descr = escXml(img.getAttribute('alt') || '');
  const border = img.classList.contains('img-border') ? '<a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>' : '';
  const graphic = `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${im.name}" descr="${descr}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${border}</pic:spPr></pic:pic></a:graphicData></a:graphic>`;
  const fr = PicEdit.wrapOf(img);
  if (fr) {
    // in front of / behind the text: placed from the column's left and the paragraph's top
    const p = PicEdit.floatPos(img);
    return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="${251659264 + id}" behindDoc="${fr === 'behind' ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>${emu(p.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${emu(p.y)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="Picture ${id}" descr="${descr}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>${graphic}</wp:anchor></w:drawing></w:r>`;
  }
  const fl = img.classList.contains('img-left') ? 'left' : img.classList.contains('img-right') ? 'right' : null;
  if (fl) {
    return `<w:r><w:drawing><wp:anchor distT="25400" distB="50800" distL="${fl === 'right' ? 127000 : 0}" distR="${fl === 'left' ? 127000 : 0}" simplePos="0" relativeHeight="${251659264 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${fl}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="${id}" name="Picture ${id}" descr="${descr}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>${graphic}</wp:anchor></w:drawing></w:r>`;
  }
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Picture ${id}" descr="${descr}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>${graphic}</wp:inline></w:drawing></w:r>`;
}
/* a shape or text box: Word 2010's shape (wps) in front of / behind the text, square to one side,
   on its own line or in the line; its text is written as the document's is */
function shapeXml(el, ctx) {
  if (ctx.inShape) return '';
  const a = Shapes.attrs(el), sz = Shapes.size(el);
  const cx = emu(Math.max(0, sz.w)), cy = emu(Math.max(0, sz.h));
  const id = ctx.docPr++;
  const E = pt => Math.round(pt * 12700);
  const clr = c => `<a:solidFill><a:srgbClr val="${hex6(c)}"/></a:solidFill>`;
  const xf = `<a:xfrm${a.rot ? ` rot="${Math.round(a.rot * 60000)}"` : ''}${a.flip.includes('h') ? ' flipH="1"' : ''}${a.flip.includes('v') ? ' flipV="1"' : ''}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
  const av = a.adj.map((v, i) => `<a:gd name="adj${a.adj.length > 1 ? i + 1 : ''}" fmla="val ${Math.round(v)}"/>`).join('');
  const geom = `<a:prstGeom prst="${a.line ? 'line' : escXml(a.shp)}"><a:avLst>${av}</a:avLst></a:prstGeom>`;
  const fill = a.line ? '' : a.fill === 'none' ? '<a:noFill/>' : clr(a.fill);
  const ends = a.line ? (a.head === 'start' || a.head === 'both' ? '<a:headEnd type="triangle"/>' : '') + (a.head === 'end' || a.head === 'both' ? '<a:tailEnd type="triangle"/>' : '') : '';
  const ln = a.stroke === 'none' || !a.lw ? '<a:ln><a:noFill/></a:ln>' : `<a:ln w="${E(a.lw)}"${a.dash === 'sysDot' ? ' cap="rnd"' : ''}>${clr(a.stroke)}${a.dash !== 'solid' ? `<a:prstDash val="${a.dash}"/>` : ''}<a:miter lim="800000"/>${ends}</a:ln>`;
  let txbx = '';
  if (!a.line) {
    const inner = el.shadowRoot && el.shadowRoot.querySelector('.in');
    let body = '';
    if (inner) { const keep = ctx.inShape; ctx.inShape = true; try { body = blocksXml(inner, ctx); } finally { ctx.inShape = keep; } }
    if (!body || /<\/w:tbl>$/.test(body)) body += '<w:p/>';
    txbx = `<wps:txbx><w:txbxContent>${body}</w:txbxContent></wps:txbx>`;
  }
  const bodyPr = `<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="${E(a.ins[0])}" tIns="${E(a.ins[1])}" rIns="${E(a.ins[2])}" bIns="${E(a.ins[3])}" anchor="${a.va}" anchorCtr="0">${a.fit ? '<a:spAutoFit/>' : '<a:noAutofit/>'}</wps:bodyPr>`;
  // the text's own colour (what new text in it takes): the style's font reference, as Word has it
  const style = !a.line && a.tc ? `<wps:style><a:lnRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef><a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"><a:srgbClr val="${hex6(a.tc)}"/></a:fontRef></wps:style>` : '';
  const wsp = `<wps:wsp>${a.line ? '<wps:cNvCnPr/>' : `<wps:cNvSpPr${a.tb ? ' txBox="1"' : ''}/>`}<wps:spPr>${xf}${geom}${fill}${ln}</wps:spPr>${style}${txbx}${bodyPr}</wps:wsp>`;
  const graphic = `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">${wsp}</a:graphicData></a:graphic>`;
  const docPr = `<wp:docPr id="${id}" name="${a.line ? 'Straight Connector' : a.tb ? 'Text Box' : 'Shape'} ${id}"/><wp:cNvGraphicFramePr/>`;
  const fr = PicEdit.wrapOf(el), mode = Images.wrapMode(el);
  let drawing;
  if (fr) {
    // in front of / behind the text: from the column's left and the paragraph's top
    const p = PicEdit.floatPos(el);
    drawing = `<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="${251659264 + id}" behindDoc="${fr === 'behind' ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>${emu(p.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${emu(p.y)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>${docPr}${graphic}</wp:anchor>`;
  } else if (mode === 'left' || mode === 'right' || mode === 'center') {
    drawing = `<wp:anchor distT="25400" distB="50800" distL="${mode === 'left' ? 0 : 127000}" distR="${mode === 'right' ? 0 : 127000}" simplePos="0" relativeHeight="${251659264 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${mode}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${mode === 'center' ? '<wp:wrapTopAndBottom/>' : '<wp:wrapSquare wrapText="bothSides"/>'}${docPr}${graphic}</wp:anchor>`;
  } else drawing = `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${docPr}${graphic}</wp:inline>`;
  return `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>${drawing}</w:drawing></mc:Choice><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r>`;
}
function inlineXml(node, ctx, block, base, st, out) {
  for (let n = node.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3) {
      let t = n.data;
      while (n.nextSibling && n.nextSibling.nodeType === 3) { n = n.nextSibling; t += n.data; }
      t = t.replace(/[\u200B\u2060]/g, '');
      if (!t) continue;
      const p = runProps(n.parentNode, ctx, block);
      out.push(tcWrap(textRuns(t, rPrXml(p, base, t)), st, ctx));
      continue;
    }
    if (n.nodeType !== 1) continue;
    if (n.matches('span.pg-line, span.qm, tr.pg-spacer')) continue;
    const tag = n.tagName;
    if (tag === 'BR') { if (n === ctx.skipBr) continue; out.push(tcWrap('<w:r><w:br/></w:r>', st, ctx)); continue; }
    if (tag === 'IMG') { out.push(tcWrap(imageXml(n, ctx), st, ctx)); continue; }
    if (tag === 'SPAN' && n.classList.contains('shp')) { out.push(tcWrap(shapeXml(n, ctx), st, ctx)); continue; }
    if (n.classList.contains('hff')) { out.push(tcWrap(hffXml(n, ctx, block, base), st, ctx)); continue; }
    if (tag === 'SUP' && n.classList.contains('fn') && ctx.noteIds) { out.push(tcWrap(noteRefXml(n, ctx), st, ctx)); continue; }
    if (tag === 'UL' || tag === 'OL' || tag === 'TABLE' || (isBlockEl(n) && !/^(SPAN|A)$/.test(tag))) continue;
    if (tag === 'A') {
      const href = n.getAttribute('href') || '';
      const inner = [];
      inlineXml(n, ctx, block, base, st, inner);
      if (!inner.length) continue;
      if (href.startsWith('#')) { const nm = ctx.bm.has(href.slice(1)) ? ctx.bm.get(href.slice(1)).name : null; out.push(nm ? `<w:hyperlink w:anchor="${nm}" w:history="1">${inner.join('')}</w:hyperlink>` : inner.join('')); }
      else if (href) { const id = ctx.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', href, true); out.push(`<w:hyperlink r:id="${id}" w:history="1">${inner.join('')}</w:hyperlink>`); }
      else out.push(inner.join(''));
      continue;
    }
    if (n.classList.contains('cmt')) {
      const info = ctx.cmt.get(n.dataset.cid);
      if (info && info.first === n) out.push(`<w:commentRangeStart w:id="${info.n}"/>`);
      inlineXml(n, ctx, block, base, st, out);
      if (info && info.last === n) out.push(`<w:commentRangeEnd w:id="${info.n}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${info.n}"/></w:r>`);
      continue;
    }
    if (tag === 'INS' && n.classList.contains('tc')) { inlineXml(n, ctx, block, base, Object.assign({}, st, { ins: n, del: null }), out); continue; }
    if (tag === 'DEL' && n.classList.contains('tc')) { inlineXml(n, ctx, block, base, Object.assign({}, st, { del: n, ins: null }), out); continue; }
    inlineXml(n, ctx, block, base, st, out);
  }
}
/* a header's or footer's field (page number, number of pages, date, title, author) as Word's */
const HFF_INSTR = { PAGE: 'PAGE', PAGES: 'NUMPAGES', DATE: 'DATE \\@ "d MMMM yyyy"', TITLE: 'TITLE', AUTHOR: 'AUTHOR' };
function hffXml(el, ctx, block, base) {
  // a date in Bangla goes as its text (Word's DATE field would write it in English again)
  const instr = el.dataset.f === 'DATE' && el.dataset.num === 'bn' ? null : HFF_INSTR[el.dataset.f];
  const t = el.textContent.replace(/[\u200B\u2060]/g, '');
  const rpr = rPrXml(runProps(el, ctx, block), base, t || '1');
  if (!instr) return t ? textRuns(t, rpr) : '';
  return `<w:fldSimple w:instr=" ${escXml(instr)} \\* MERGEFORMAT "><w:r>${rpr}<w:t xml:space="preserve">${escXml(t)}</w:t></w:r></w:fldSimple>`;
}
/* footnotes and endnotes: Word's number formats; a mark in the text (Bangla digits as custom marks,
   which Word keeps as they are) */
const NOTE_WFMT = { '1': 'decimal', a: 'lowerLetter', A: 'upperLetter', i: 'lowerRoman', I: 'upperRoman', '*': 'chicago', bn: 'decimal' };
function noteRefXml(n, ctx) {
  const info = ctx.noteIds.get(n.dataset.fn);
  if (!info) return '';
  const end = info.kind === 'end', custom = Notes.pr(info.kind).fmt === 'bn';
  return `<w:r><w:rPr><w:rStyle w:val="${end ? 'Endnote' : 'Footnote'}Reference"/></w:rPr><w:${end ? 'endnote' : 'footnote'}Reference ${custom ? 'w:customMarkFollows="1" ' : ''}w:id="${info.wid}"/>${custom ? `<w:t>${escXml(n.textContent)}</w:t>` : ''}</w:r>`;
}
/* footnotes.xml or endnotes.xml: the separators, then each note in the Footnote Text style with its
   mark first; laid out off screen like on the page, pictures and links in the part's own rels */
async function notesPartXml(kind, list, ctx, box) {
  const end = kind === 'end', tag = end ? 'endnote' : 'footnote', sty = end ? 'Endnote' : 'Footnote';
  const sepP = x => `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:${x}/></w:r></w:p>`;
  let xml = `<w:${tag} w:type="separator" w:id="-1">${sepP('separator')}</w:${tag}><w:${tag} w:type="continuationSeparator" w:id="0">${sepP('continuationSeparator')}</w:${tag}>`;
  const keep = { rels: ctx.rels, relN: ctx.relN, note: ctx.note };
  ctx.rels = []; ctx.relN = 1; ctx.note = kind;
  const custom = Notes.pr(kind).fmt === 'bn';
  try {
    for (const { id, wid, mark } of list) {
      box.innerHTML = `<div class="${end ? 'enote' : 'fnote'}">${(Notes.all()[id] || {}).html || '<p><br></p>'}</div>`;
      const inner = box.firstElementChild;
      HF.decorate(box);
      const imgs = await prepareImages(inner, ctx.imgN);
      ctx.imgN += imgs.size;
      for (const [k, v] of imgs) ctx.images.set(k, v);
      let pieces = [];
      const live = S.editor;
      S.editor = inner;
      try { pieces = Array.from(inner.children).map(b => blocksXml({ children: [b] }, ctx)).filter(Boolean); }
      finally { S.editor = live; }
      const markRun = `<w:r><w:rPr><w:rStyle w:val="${sty}Reference"/></w:rPr>${custom ? `<w:t>${escXml(mark)}</w:t>` : `<w:${tag}Ref/>`}</w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>`;
      const i = pieces.findIndex(x => /^<w:p[ >\/]/.test(x));
      if (i < 0) pieces.unshift(`<w:p><w:pPr><w:pStyle w:val="${sty}Text"/></w:pPr>${markRun}</w:p>`);
      else {
        const m = /^<w:p>(<w:pPr>.*?<\/w:pPr>)?|^<w:p\/>/.exec(pieces[i]);
        pieces[i] = m[0] === '<w:p/>' ? `<w:p><w:pPr><w:pStyle w:val="${sty}Text"/></w:pPr>${markRun}</w:p>` + pieces[i].slice(6) : m[0] + markRun + pieces[i].slice(m[0].length);
      }
      if (/<\/w:tbl>$/.test(pieces[pieces.length - 1])) pieces.push(`<w:p><w:pPr><w:pStyle w:val="${sty}Text"/></w:pPr></w:p>`);
      xml += `<w:${tag} w:id="${wid}">${pieces.join('')}</w:${tag}>`;
    }
  } finally { box.innerHTML = ''; }
  const rels = ctx.rels;
  Object.assign(ctx, keep);
  return { xml: `${XML_HEAD}<w:${tag}s ${NS_DRAW}>${xml}</w:${tag}s>`, rels };
}
/* A <br> that ends a block is only a caret placeholder in the editor */
function trailingBr(block) {
  let last = null;
  const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL' || n.tagName === 'TABLE' || n.classList.contains('pg-line') || n.classList.contains('qm')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) { if (n.data.replace(/[\u200B\u2060]/g, '')) last = n; }
    else if (n.tagName === 'BR' || n.tagName === 'IMG') last = n;
  }
  return last && last.nodeType === 1 && last.tagName === 'BR' ? last : null;
}
function borderXml(cs, side, tag) {
  const S2 = side[0].toUpperCase() + side.slice(1);
  const st = cs['border' + S2 + 'Style'], wd = parseFloat(cs['border' + S2 + 'Width']) || 0, col = cssColorToHex(cs['border' + S2 + 'Color']);
  if (!wd || st === 'none' || st === 'hidden' || !col) return null;
  return bdrWordXml(tag, { style: st, width: wd * 0.75 / (st === 'double' ? 3 : 1), color: col });
}
/* a paragraph's border on one side: as set on it, else as shown */
function paraSideXml(block, cs, side, extra) {
  const S2 = side[0].toUpperCase() + side.slice(1);
  let b = bdrInline(block, S2);
  if (b === undefined) b = bdrComputed(cs, S2);
  if (!b) return null;
  const pad = (parseFloat(cs['padding' + S2]) || 0) * 0.75;
  return bdrWordXml(side, b, Math.min(31, pad), extra);
}
/* Word shading: a pattern with its colours, or a plain fill */
function shdXml(el, fillHex) {
  const pat = el && el.getAttribute && el.getAttribute('data-shd');
  if (pat && pat !== 'clear') {
    const f = el.getAttribute('data-shdf');
    return `<w:shd w:val="${escXml(pat)}" w:color="${hex6(el.getAttribute('data-shdc') || '#000000')}" w:fill="${f && f !== 'auto' ? hex6(f) : 'auto'}"/>`;
  }
  return fillHex ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex6(fillHex)}"/>` : '';
}
function pXml(block, ctx, o = {}) {
  let key = o.styleKey || (block.tagName === 'LI' || /^(TD|TH)$/.test(block.tagName) ? 'normal' : blockStyleKey(block));
  // in a header or footer, plain paragraphs take Word's Header / Footer style (no space after,
  // single); in a note, Footnote Text / Endnote Text (10 pt as well)
  if (ctx.hf && key === 'normal') key = ctx.hf;
  else if (ctx.note && key === 'normal') key = ctx.note === 'end' ? 'enote' : 'fnote';
  const base = ctx.styles[key] || ctx.styles.normal;
  const cs = getComputedStyle(block);
  const ppr = [];
  const sid = o.pStyle || ({ header: 'Header', footer: 'Footer', fnote: 'FootnoteText', enote: 'EndnoteText' })[key] || STYLE_IDS[key] || (Styles.isCustom(key) ? Styles.wordIds()[key] : null);
  if (sid) ppr.push(`<w:pStyle w:val="${sid}"/>`);
  if (o.numPr) ppr.push(`<w:numPr><w:ilvl w:val="${o.numPr.ilvl}"/><w:numId w:val="${o.numPr.numId}"/></w:numPr>`);
  if (key !== 'quote' && !/^(TD|TH)$/.test(block.tagName)) {
    const sh = block.style.boxShadow && block.style.boxShadow !== 'none' ? ' w:shadow="1"' : '';
    const b = ['top', 'left', 'bottom', 'right'].map(s => paraSideXml(block, cs, s, sh)).filter(Boolean);
    const btw = bdrParse(block.style.getPropertyValue('--bbtw'));
    if (btw) b.push(bdrWordXml('between', btw, 1));
    if (b.length) ppr.push(`<w:pBdr>${b.join('')}</w:pBdr>`);
  }
  const bg = !/^(TD|TH)$/.test(block.tagName) && (block.tagName !== 'LI' || block.hasAttribute('data-shd') || block.style.backgroundColor) && cssColorToHex(cs.backgroundColor);
  if ((bg || block.hasAttribute('data-shd')) && !(key === 'code' && bg === base.bg && !block.hasAttribute('data-shd'))) { const x = shdXml(block, bg); if (x) ppr.push(x); }
  // numbers lined up on the decimal point: Word's decimal tab where the points are on the page
  const dec = block.getAttribute('data-align') === 'decimal';
  if (dec) ppr.push(`<w:tabs><w:tab w:val="decimal" w:pos="${twp(DecAlign.tabPos(block))}"/></w:tabs>`);
  const sp = [];
  const before = parseFloat(cs.marginTop) || 0, after = parseFloat(cs.marginBottom) || 0;
  if (!o.inCell && !o.list) {
    if (Math.abs(before - base.before) > 0.5) sp.push(`w:before="${twp(before)}"`);
    if (Math.abs(after - base.after) > 0.5) sp.push(`w:after="${twp(after)}"`);
  } else if (o.inCell) sp.push('w:before="0" w:after="0"');
  // line spacing: a multiple (Word's value), or an exact height (pt or px)
  const lhRaw = block.style.lineHeight || '';
  const lhInline = /^\s*[\d.]+\s*$/.test(lhRaw) ? parseFloat(lhRaw) : 0;
  const lhExact = /^\s*[\d.]+\s*(pt|px)\s*$/.test(lhRaw) ? parseFloat(lhRaw) * (/px/.test(lhRaw) ? 0.75 : 1) : 0;
  if (lhInline && Math.abs(lhInline - base.line) > 0.01) sp.push(`w:line="${Math.round(lhInline * 240)}" w:lineRule="auto"`);
  else if (lhExact > 0) sp.push(`w:line="${Math.round(lhExact * 20)}" w:lineRule="exact"`);
  if (sp.length) ppr.push(`<w:spacing ${sp.join(' ')}/>`);
  // its own indents (a section's column moves its blocks with margins of their own)
  const om = block.hasAttribute('data-sx') ? ownMargins(block) : null;
  const ml = om ? om.ml : parseFloat(cs.marginLeft) || 0, mr = om ? om.mr : parseFloat(cs.marginRight) || 0, ti = parseFloat(cs.textIndent) || 0;
  const ind = [];
  if (o.indLeft != null) ind.push(`w:left="${o.indLeft}"`, `w:hanging="${o.hanging || 0}"`);
  else if (!o.numPr) {
    // what the paragraph's style already gives (its indents) isn't repeated on the paragraph
    const sameInd = Math.abs(ml - (base.indent || 0)) <= 0.5 && Math.abs(ti - (base.first || 0)) <= 0.5;
    if (!sameInd || Math.abs(mr) > 0.5) {
      if (key !== 'quote' && (Math.abs(ml) > 0.5 || base.indent)) ind.push(`w:left="${twp(ml)}"`);
      if (key !== 'quote' && Math.abs(mr) > 0.5) ind.push(`w:right="${twp(mr)}"`);
      if (ti > 0.5) ind.push(`w:firstLine="${twp(ti)}"`); else if (ti < -0.5) ind.push(`w:hanging="${twp(-ti)}"`); else if (base.first) ind.push('w:firstLine="0"');
    }
  }
  if (ind.length) ppr.push(`<w:ind ${ind.join(' ')}/>`);
  const ta = cs.textAlign;
  let jc = o.jc || (dec ? null : ta === 'center' ? 'center' : (ta === 'right' || ta === 'end') ? 'right' : ta === 'justify' ? 'both' : null);
  // the style's own alignment isn't repeated (and left where the style says otherwise is written)
  const baseJc = base.align === 'center' ? 'center' : base.align === 'right' ? 'right' : base.align === 'justify' ? 'both' : null;
  if (!o.jc && !dec && base.align) jc = jc === baseJc ? null : (jc || 'left');
  if (jc) ppr.push(`<w:jc w:val="${jc}"/>`);
  // added or removed whole: its paragraph mark is a tracked change too (rows: in the row's properties)
  const tcb = block.closest('[data-tcb]');
  if (tcb && !/^(TR|TABLE|TBODY|THEAD|TFOOT)$/.test(tcb.tagName) && !(block.closest('tr') && !tcb.closest('tr'))) { const m = tcbXml(tcb, ctx); if (m) ppr.push(`<w:rPr>${m}</w:rPr>`); }
  if (o.sectPr) ppr.push(o.sectPr);
  const runs = [];
  if (o.prefix) runs.push(`<w:r><w:rPr><w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol"/></w:rPr><w:t xml:space="preserve">${escXml(o.prefix)}</w:t></w:r>`);
  ctx.skipBr = trailingBr(o.contentRoot || block);
  inlineXml(o.contentRoot || block, ctx, block, base, {}, runs);
  let body = runs.join('');
  if (block.id && ctx.bm.has(block.id)) { const b = ctx.bm.get(block.id); body = `<w:bookmarkStart w:id="${b.n}" w:name="${b.name}"/>${body}<w:bookmarkEnd w:id="${b.n}"/>`; }
  return `<w:p>${ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : ''}${body}</w:p>`;
}
/* list numbers: Word's number format and the text around the number (% is the number); Bangla
   digits and letters are Word 2010's custom formats, with plain ones for older readers */
const NUM_FMT = {
  decimal: ['decimal', '%.'], 'decimal-paren': ['decimal', '%)'], 'decimal-leading-zero': ['decimalZero', '%.'],
  'lower-alpha': ['lowerLetter', '%.'], 'lower-latin': ['lowerLetter', '%.'], 'upper-alpha': ['upperLetter', '%.'], 'upper-latin': ['upperLetter', '%.'],
  'lower-roman': ['lowerRoman', '%.'], 'upper-roman': ['upperRoman', '%.'], 'lower-alpha-paren': ['lowerLetter', '%)'],
  'paren-decimal': ['decimal', '(%)'], 'paren-lower-alpha': ['lowerLetter', '(%)'], 'paren-lower-roman': ['lowerRoman', '(%)'], 'lower-roman-paren': ['lowerRoman', '%)'],
  'bengali-dot': ['bn', '%.'], bengali: ['bn', '%.'], 'bn-dari': ['bn', '%।'], 'bn-close': ['bn', '%)'], 'bn-paren': ['bn', '(%)'], 'bn-alpha': ['bnAlpha', '%)'], 'bn-alpha-paren': ['bnAlpha', '(%)'],
};
const NUM_CUSTOM = { bn: ['১, ২, ৩, ...', 'decimal'], bnAlpha: ['ক, খ, গ, ...', 'lowerLetter'] };
function numFmtXml(f) {
  const c = NUM_CUSTOM[f];
  if (!c) return `<w:numFmt w:val="${f}"/>`;
  // Word 2010 and later take the Choice. LibreOffice takes a Choice that needs w14 alone but can't
  // draw these formats (the whole level then falls back to “1.”); one that needs w14 and wp14
  // (both Word 2010's) it leaves, for the plain numbers with the text around them (1।  (a))
  return `<mc:AlternateContent><mc:Choice Requires="w14 wp14"><w:numFmt w:val="custom" w:format="${escXml(c[0])}"/></mc:Choice><mc:Fallback><w:numFmt w:val="${c[1]}"/></mc:Fallback></mc:AlternateContent>`;
}
/* ml: the list's Multilevel List preset (legal and bn-legal number each level 1.1, 1.1.1) */
function lvlXml(ilvl, type, start, ml) {
  const ind = `<w:pPr><w:ind w:left="${720 * (ilvl + 1)}" w:hanging="${ml === 'legal' || ml === 'bn-legal' ? 360 + 180 * Math.min(ilvl, 3) : 360}"/></w:pPr>`;
  const t = String(type || '').trim();
  if (ml === 'legal' || ml === 'bn-legal') {
    const txt = Array.from({ length: ilvl + 1 }, (_, i) => '%' + (i + 1)).join('.') + '.';
    return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="${start || 1}"/>${numFmtXml(ml === 'bn-legal' ? 'bn' : 'decimal')}<w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/>${ind}</w:lvl>`;
  }
  if (NUM_FMT[t]) return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="${start || 1}"/>${numFmtXml(NUM_FMT[t][0])}<w:lvlText w:val="${escXml(NUM_FMT[t][1].replace('%', '%' + (ilvl + 1)))}"/><w:lvlJc w:val="left"/>${ind}</w:lvl>`;
  let ch = '•', font = 'Arial';
  if (t === 'circle') { ch = 'o'; font = 'Courier New'; }
  else if (t === 'square') { ch = '▪'; font = 'Arial'; }
  else if (/^["']/.test(t)) { ch = [...t.replace(/^["']|["']$/g, '').trim()][0] || '•'; font = 'Segoe UI Symbol'; }
  return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${escXml(ch)}"/><w:lvlJc w:val="left"/>${ind}<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/></w:rPr></w:lvl>`;
}
function newListNum(list, ctx) {
  const types = [];
  const walk = (l, d) => {
    if (d > 8) return;
    if (!types[d]) types[d] = getComputedStyle(l).listStyleType;
    for (const k of l.children) {
      if (k.tagName === 'UL' || k.tagName === 'OL') walk(k, d + 1);
      else if (k.tagName === 'LI') for (const kk of k.children) if (kk.tagName === 'UL' || kk.tagName === 'OL') walk(kk, d + 1);
    }
  };
  walk(list, 0);
  const ol = list.tagName === 'OL';
  const defs = ol ? ['decimal', 'lower-alpha', 'lower-roman'] : ['disc', 'circle', 'square'];
  const start = parseInt(list.getAttribute('start') || '1', 10) || 1;
  const ml = ol ? list.getAttribute('data-ml') : null;
  const levels = [];
  for (let i = 0; i < 9; i++) levels.push(lvlXml(i, types[i] && types[i] !== 'none' ? types[i] : defs[i % 3], i === 0 ? start : 1, ml));
  ctx.lists.push(levels.join(''));
  return ctx.lists.length;
}
function listXml(list, ctx, level, numId, inCell) {
  const parts = [];
  const check = list.classList.contains('checklist');
  for (const li of list.children) {
    if (li.tagName === 'UL' || li.tagName === 'OL') { parts.push(listXml(li, ctx, level + 1, numId, inCell)); continue; }
    if (li.tagName !== 'LI') continue;
    const paraKids = Array.from(li.children).filter(k => /^(P|H[1-6])$/.test(k.tagName));
    const nested = Array.from(li.children).filter(k => k.tagName === 'UL' || k.tagName === 'OL');
    const common = check
      ? { list: true, inCell, pStyle: 'ListParagraph', prefix: li.getAttribute('data-checked') === 'true' ? '☒ ' : '☐ ', indLeft: 360 + 720 * level, hanging: 360 }
      : { list: true, inCell, pStyle: 'ListParagraph', numPr: { ilvl: Math.min(level, 8), numId } };
    if (paraKids.length && !Array.from(li.childNodes).some(n => (n.nodeType === 3 && n.data.trim()) || (n.nodeType === 1 && !isBlockEl(n) && n.tagName !== 'BR'))) {
      paraKids.forEach((p, i) => parts.push(pXml(p, ctx, i === 0 ? common : { list: true, inCell, pStyle: 'ListParagraph', indLeft: 720 * (level + 1), hanging: 0 })));
    } else parts.push(pXml(li, ctx, common));
    for (const nl of nested) parts.push(listXml(nl, ctx, level + 1, numId, inCell));
  }
  return parts.join('');
}
function tableXml(tbl, ctx) {
  const G = Tables.grid(tbl);
  if (!G.rows.length) return '';
  let ws = Tables.measureCols(tbl);
  if (ws.length !== G.ncols) ws = new Array(G.ncols).fill((tbl.offsetWidth || geom().cw) / G.ncols);
  const widths = ws.map(w => Math.max(120, twp(w)));
  const tcs = getComputedStyle(tbl);
  const own = tbl.hasAttribute('data-sx') ? Sections.ownBox(tbl) : null;
  const center = own ? own.autoL && own.autoR : tcs.marginLeft !== '0px' && tcs.marginLeft === tcs.marginRight;
  // on the right (the letter date block): its left margin automatic, its right none
  const right = !center && (own ? own.autoL && !own.autoR : tbl.style.marginLeft === 'auto' && tbl.style.marginRight !== 'auto');
  const nil = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="nil"/>`).join('');
  const outer = ['top', 'left', 'bottom', 'right'].map(s => borderXml(tcs, s, s)).filter(Boolean);
  // a table with its own borders keeps them as the table's; cells add only what they set themselves
  const bd = tbl.classList.contains('tbl-bd');
  const bdSpec = bd ? Borders.tableSpec(tbl) : null;
  // AutoFit: Word's table width and layout say how the columns behave when text changes
  const fit = Tables.fitMode(tbl);
  const total = widths.reduce((a, b) => a + b, 0);
  const tblW = fit === 'window' ? '<w:tblW w:w="5000" w:type="pct"/>' : fit === 'contents' ? '<w:tblW w:w="0" w:type="auto"/>' : `<w:tblW w:w="${total}" w:type="dxa"/>`;
  const tcW = w => fit === 'window' ? `<w:tcW w:w="${Math.round(5000 * w / total)}" w:type="pct"/>` : fit === 'contents' ? '<w:tcW w:w="0" w:type="auto"/>' : `<w:tcW w:w="${w}" w:type="dxa"/>`;
  let x = `<w:tbl><w:tblPr>${tblW}${center ? '<w:jc w:val="center"/>' : right ? '<w:jc w:val="right"/>' : ''}<w:tblBorders>${bd ? ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => bdrWordXml(k, bdSpec[k])).join('') : outer.length ? outer.join('') + '<w:insideH w:val="nil"/><w:insideV w:val="nil"/>' : nil}</w:tblBorders><w:tblLayout w:type="${fit === 'fixed' ? 'fixed' : 'autofit'}"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
  x += '<w:tblGrid>' + widths.map(w => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';
  const hdr = tbl.classList.contains('hdr');
  const at = new Map(Tables.cells(G).map(c => [c.el, c]));
  const nr = G.rows.length;
  const sideXml = (cl, cs, tag, S2) => {
    const xx = at.get(cl);
    return bdrWordXml(tag, xx ? Borders.cellSide(tbl, xx, S2, nr, G.ncols) : bdrComputed(cs, S2));
  };
  const cellBorders = (cl, cs) => ['top', 'left', 'bottom', 'right'].map(s => { const S2 = s[0].toUpperCase() + s.slice(1); if (bd) { const own = bdrInline(cl, S2); return own === undefined ? '' : bdrWordXml(s, own); } return sideXml(cl, cs, s, S2); }).join('') +
    (cl.hasAttribute('data-dd') ? bdrWordXml('tl2br', bdrParse(cl.getAttribute('data-dd'))) : '') + (cl.hasAttribute('data-du') ? bdrWordXml('tr2bl', bdrParse(cl.getAttribute('data-du'))) : '');
  G.rows.forEach((row, r) => {
    const trh = parseFloat(row.style.height) ? cssToPt(row.style.height) : 0;
    const rtc = row.closest('[data-tcb]');
    const trPr = (r === 0 && (hdr || (row.cells[0] && row.cells[0].tagName === 'TH')) ? '<w:tblHeader/>' : '') + (trh ? `<w:trHeight w:val="${Math.round(trh * 20)}" w:hRule="atLeast"/>` : '') + (rtc ? tcbXml(rtc, ctx) : '');
    x += '<w:tr>' + (trPr ? `<w:trPr>${trPr}</w:trPr>` : '');
    for (let c = 0; c < G.ncols;) {
      const e = G.g[r][c];
      if (!e) { x += `<w:tc><w:tcPr>${tcW(widths[c])}</w:tcPr><w:p/></w:tc>`; c++; continue; }
      const cl = e.cell, cs = Math.max(1, cl.colSpan || 1);
      const w = widths.slice(c, c + cs).reduce((a, b) => a + b, 0);
      const ccs = getComputedStyle(cl);
      const b = cellBorders(cl, ccs);
      const fill = cssColorToHex(ccs.backgroundColor);
      const shd = shdXml(cl, fill);
      const va = ccs.verticalAlign === 'middle' ? '<w:vAlign w:val="center"/>' : ccs.verticalAlign === 'bottom' ? '<w:vAlign w:val="bottom"/>' : '';
      const span = cs > 1 ? `<w:gridSpan w:val="${cs}"/>` : '';
      if (e.r0 !== r) x += `<w:tc><w:tcPr>${tcW(w)}${span}<w:vMerge/>${b ? `<w:tcBorders>${b}</w:tcBorders>` : ''}${shd}${va}</w:tcPr><w:p/></w:tc>`;
      else {
        let content = '';
        const blockKids = Array.from(cl.children).some(k => isBlockEl(k));
        if (blockKids) { content = blocksXml(cl, ctx, true); if (!content || /<\/w:tbl>$/.test(content)) content += '<w:p/>'; }
        else content = pXml(cl, ctx, { inCell: true });
        x += `<w:tc><w:tcPr>${tcW(w)}${span}${(cl.rowSpan || 1) > 1 ? '<w:vMerge w:val="restart"/>' : ''}${b ? `<w:tcBorders>${b}</w:tcBorders>` : ''}${shd}${va}</w:tcPr>${content}</w:tc>`;
      }
      c += cs;
    }
    x += '</w:tr>';
  });
  return x + '</w:tbl>';
}
function tocXml(box, ctx) {
  const g = geom();
  const right = twp(g.cw);
  const title = (box.querySelector('.toc-title') || {}).textContent || 'Contents';
  let x = `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t xml:space="preserve">${escXml(title)}</w:t></w:r></w:p>`;
  const entries = Array.from(box.querySelectorAll('.te'));
  entries.forEach((te, i) => {
    const lvl = +((te.className.match(/l(\d)/) || [0, 1])[1]);
    const nm = ctx.bm.has(te.dataset.target) ? ctx.bm.get(te.dataset.target).name : null;
    let p = `<w:p><w:pPr><w:pStyle w:val="TOC${lvl}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${right}"/></w:tabs></w:pPr>`;
    if (i === 0) p += '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
    const t = (te.querySelector('.tt') || te).textContent, pg = (te.querySelector('.tp') || {}).textContent || '';
    const body = `<w:r><w:t xml:space="preserve">${escXml(t)}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>${escXml(pg)}</w:t></w:r>`;
    p += nm ? `<w:hyperlink w:anchor="${nm}" w:history="1">${body}</w:hyperlink>` : body;
    if (i === entries.length - 1) p += '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    x += p + '</w:p>';
  });
  return x;
}
function blocksXml(container, ctx, inCell) {
  let x = '';
  // the text itself: a section break ends a section (Word keeps its settings in its last paragraph)
  const top = !inCell && ctx.body && container === ctx.body;
  const kids = Array.from(container.children);
  for (let i = 0; i < kids.length; i++) {
    const b = kids[i], t = b.tagName;
    if (b.matches('tr.pg-spacer, span.qm, span.pg-line, colgroup')) continue;
    if (top && isSectBreak(b)) {
      // after a table, a list or nothing: a paragraph to hold it (as Word has one)
      if (!ctx.sectDone) x += `<w:p><w:pPr>${ctx.endSect()}</w:pPr></w:p>`;
      ctx.sectDone = false;
      ctx.si++; ctx.subs = 0; ctx.afterCols = false;
      continue;
    }
    // the last paragraph before a section break carries the section's settings
    const ends = top && isSectBreak(kids[i + 1]) && /^(P|H[1-6])$/.test(t) && !b.classList.contains('toc');
    if (t === 'UL' || t === 'OL') x += listXml(b, ctx, 0, newListNum(b, ctx), inCell);
    else if (t === 'TABLE') x += tableXml(b, ctx);
    else if (t === 'HR') x += b.classList.contains('pb') ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : isSectBreak(b) ? '' : '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="8C8C8C"/></w:pBdr><w:spacing w:before="120" w:after="200"/></w:pPr></w:p>';
    else if (b.classList.contains('toc')) x += tocXml(b, ctx);
    else if (b.classList.contains('cols') && !inCell) {
      const n = clamp(parseInt(b.style.getPropertyValue('--cols'), 10) || parseInt(getComputedStyle(b).columnCount, 10) || 2, 1, 6);
      x += `<w:p><w:pPr><w:sectPr>${ctx.sect(1, ctx.subType())}</w:sectPr></w:pPr></w:p>`;
      ctx.subs++;
      x += blocksXml(b, ctx);
      x += `<w:p><w:pPr><w:sectPr>${ctx.sect(n, 'continuous')}</w:sectPr></w:pPr></w:p>`;
      ctx.subs++;
      ctx.sections++;
      ctx.afterCols = true;
    } else if ((t === 'BLOCKQUOTE' || t === 'DIV') && Array.from(b.children).some(k => isBlockEl(k))) x += blocksXml(b, ctx, inCell);
    else if (ends) { x += pXml(b, ctx, { inCell, sectPr: ctx.endSect() }); ctx.sectDone = true; continue; }
    else x += pXml(b, ctx, { inCell });
    ctx.sectDone = false;
  }
  return x;
}
/* Word's names for the ways a section starts */
const SB_WTYPE = { next: 'nextPage', cont: 'continuous', even: 'evenPage', odd: 'oddPage' };
/* (Word has no Bangla page numbers of its own: those go as 1, 2, 3; Folio's fields keep Bangla digits) */
// Word has no Bangla page numbers: ১, ২, ৩ go as 1, 2, 3 and ক, খ, গ as a, b, c (the cached text stays Bangla)
const PN_WFMT = { '1': 'decimal', i: 'lowerRoman', I: 'upperRoman', a: 'lowerLetter', A: 'upperLetter', bn: 'decimal', bnk: 'lowerLetter' };
/* the watermark: a picture behind the text, centred on the page (in every header, as Word has it);
   its text rides along in the description so Folio gets it back */
function wmDrawingXml(ctx, rel, text) {
  const g = geom();
  const ww = g.w * 0.72, cx = emu(ww), cy = emu(ww);
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251650000" behindDoc="1" locked="1" layoutInCell="0" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${ctx.docPr++}" name="Watermark" descr="${escXml(text || '')}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="watermark.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
}
/* One header or footer part: its HTML laid out off screen (as on the page), written with the
   same code as the document's text, with relationships (pictures, links) of its own. */
async function hfPartXml(kind, html, ctx, box, wmRun) {
  const tag = kind === 'header' ? 'hdr' : 'ftr';
  box.innerHTML = HF.empty(html) ? '' : html;
  HF.fill(box, 0, S.pages);
  HF.decorate(box);
  const imgs = await prepareImages(box, ctx.imgN);
  ctx.imgN += imgs.size;
  for (const [k, v] of imgs) ctx.images.set(k, v);
  const live = S.editor, keep = { rels: ctx.rels, relN: ctx.relN, hf: ctx.hf };
  ctx.rels = []; ctx.relN = 1; ctx.hf = kind;
  // block by block, to find the header's own paragraphs (not those in its tables)
  let pieces = [];
  S.editor = box;
  try { pieces = Array.from(box.children).map(b => blocksXml({ children: [b] }, ctx)).filter(Boolean); }
  finally { S.editor = live; }
  const rels = ctx.rels;
  Object.assign(ctx, keep);
  const sty = `<w:pPr><w:pStyle w:val="${kind === 'header' ? 'Header' : 'Footer'}"/></w:pPr>`;
  // a header can't end with a table (Word wants a paragraph after it): a hairline one
  if (!pieces.length || /<\/w:tbl>$/.test(pieces[pieces.length - 1])) pieces.push(`<w:p>${pieces.length ? sty.replace('</w:pPr>', '<w:spacing w:after="0" w:line="14" w:lineRule="exact"/></w:pPr>') : sty}</w:p>`);
  if (wmRun) {
    // the watermark goes in the header's first paragraph outside a table, so it adds no line of
    // its own and is placed from the page (not a table cell)
    const i = pieces.findIndex(x => /^<w:p[ >\/]/.test(x));
    const m = /^<w:p>(<w:pPr>.*?<\/w:pPr>)?|^<w:p\/>/.exec(pieces[i]);
    pieces[i] = m[0] === '<w:p/>' ? `<w:p>${wmRun}</w:p>` + pieces[i].slice(6) : m[0] + wmRun + pieces[i].slice(m[0].length);
  }
  return { xml: `${XML_HEAD}<w:${tag} ${NS_DRAW}>${pieces.join('')}</w:${tag}>`, rels };
}
function stylesXml(st) {
  const d = S.doc;
  const n = st.normal;
  const csFont = docBnFont();
  const f = escXml(n.font || d.font);
  const rFonts = (font) => `<w:rFonts w:ascii="${escXml(font)}" w:hAnsi="${escXml(font)}" w:eastAsia="${escXml(font)}" w:cs="${escXml(isBanglaFont(font) ? font : csFont)}"/>`;
  const rpr = (s, extra = '') => {
    const o = [];
    if (s.font && s.font.toLowerCase() !== (n.font || '').toLowerCase()) o.push(rFonts(s.font));
    if (s.bold) o.push('<w:b/><w:bCs/>');
    if (s.italic) o.push('<w:i/><w:iCs/>');
    if (s.color && s.color !== '#000000') o.push(`<w:color w:val="${hex6(s.color)}"/>`);
    if (s.ls) o.push(`<w:spacing w:val="${Math.round(s.ls * 15)}"/>`);
    if (Math.abs(s.size - n.size) > 0.01) o.push(`<w:sz w:val="${hpt(s.size)}"/><w:szCs w:val="${hpt(s.size)}"/>`);
    if (s.underline) o.push('<w:u w:val="single"/>');
    return `<w:rPr>${o.join('')}${extra}</w:rPr>`;
  };
  const spacing = s => `<w:spacing w:before="${twp(s.before)}" w:after="${twp(s.after)}" w:line="${Math.round(s.line * 240)}" w:lineRule="auto"/>`;
  // alignment and indents a style was given (Styles); Word's names for them
  const jcInd = s => {
    let x = '';
    if (s.indent > 0.5 || Math.abs(s.first) > 0.5) x += `<w:ind w:left="${twp(Math.max(0, s.indent))}"${s.first > 0.5 ? ` w:firstLine="${twp(s.first)}"` : s.first < -0.5 ? ` w:hanging="${twp(-s.first)}"` : ''}/>`;
    if (s.align && s.align !== 'left') x += `<w:jc w:val="${s.align === 'justify' ? 'both' : s.align}"/>`;
    return x;
  };
  const next = k => { const nk = Styles.next(k); return ids[nk] || 'Normal'; };
  const ids = Object.assign({ normal: 'Normal', nospacing: 'NoSpacing', title: 'Title', subtitle: 'Subtitle', quote: 'Quote', code: 'Code' }, ...[1, 2, 3, 4, 5, 6].map(i => ({ ['h' + i]: 'Heading' + i })), Styles.wordIds());
  const para = (id, name, s, ppr = '', extraR = '', opts = '', k = null) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="${k ? next(k) : 'Normal'}"/>${opts}<w:qFormat/><w:pPr>${ppr}${/<w:ind /.test(ppr) ? jcInd(Object.assign({}, s, { indent: 0, first: 0 })) : jcInd(s)}</w:pPr>${rpr(s, extraR)}</w:style>`;
  const own = Styles.custom().filter(k => st[k]).map(k => para(ids[k], escXml(Styles.name(k)), st[k], spacing(st[k]), '', '<w:uiPriority w:val="1"/>', k).replace('<w:style w:type="paragraph"', '<w:style w:type="paragraph" w:customStyle="1"')).join('');
  const heads = [1, 2, 3, 4, 5, 6].map(i => para('Heading' + i, 'heading ' + i, st['h' + i], `<w:keepNext/><w:keepLines/>${spacing(st['h' + i])}<w:outlineLvl w:val="${i - 1}"/>`, '', '<w:uiPriority w:val="9"/>', 'h' + i)).join('');
  const q = st.quote;
  return `${XML_HEAD}<w:styles ${NS_DECL}>
<w:docDefaults><w:rPrDefault><w:rPr>${rFonts(n.font || d.font)}<w:sz w:val="${hpt(n.size)}"/><w:szCs w:val="${hpt(n.size)}"/><w:lang w:val="${escXml(d.lang || 'en-US')}" w:eastAsia="en-US" w:bidi="bn-BD"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${twp(n.after)}" w:line="${Math.round(n.line * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>${jcInd(n) || n.before > 0.5 ? `<w:pPr>${n.before > 0.5 ? `<w:spacing w:before="${twp(n.before)}"/>` : ''}${jcInd(n)}</w:pPr>` : ''}${n.color !== '#000000' || n.bold || n.italic || n.underline ? `<w:rPr>${n.bold ? '<w:b/><w:bCs/>' : ''}${n.italic ? '<w:i/><w:iCs/>' : ''}${n.underline ? '<w:u w:val="single"/>' : ''}${n.color !== '#000000' ? `<w:color w:val="${hex6(n.color)}"/>` : ''}</w:rPr>` : ''}</w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>
${heads}
${para('Title', 'Title', st.title, spacing(st.title) + '<w:contextualSpacing/>', '', '', 'title')}
${para('Subtitle', 'Subtitle', st.subtitle, spacing(st.subtitle), '', '', 'subtitle')}
${own}
${para('Quote', 'Quote', q, `<w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="C8C8C8"/></w:pBdr>${spacing(q)}<w:ind w:left="240" w:right="480"/>`)}
<w:style w:type="paragraph" w:customStyle="1" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${hex6(st.code.bg || '#f2f3f3')}"/><w:spacing w:before="0" w:after="0" w:line="${Math.round(st.code.line * 240)}" w:lineRule="auto"/></w:pPr>${rpr(st.code)}</w:style>
<w:style w:type="paragraph" w:styleId="NoSpacing"><w:name w:val="No Spacing"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="${twp(geom().cw / 2)}"/><w:tab w:val="right" w:pos="${twp(geom().cw)}"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="${twp(geom().cw / 2)}"/><w:tab w:val="right" w:pos="${twp(geom().cw)}"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="EndnoteText"><w:name w:val="endnote text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="EndnoteReference"><w:name w:val="endnote reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3A5F"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="280"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC3"><w:name w:val="toc 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="560"/></w:pPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
}

async function buildDocx() {
  const JSZip = await needJSZip();
  if (Story.cur) Story.close();
  Layout.full();
  const paper = $('#paper');
  paper.classList.add('exporting', 'exporting-docx');
  try {
    const ctx = new DocxCtx();
    const d = S.doc, g = geom();
    ctx.styles = measureStyles();
    ctx.styles.header = ctx.styles.footer = Object.assign({}, ctx.styles.normal, { before: 0, after: 0, line: 1 });
    ctx.styles.fnote = ctx.styles.enote = Object.assign({}, ctx.styles.normal, { before: 0, after: 0, line: 1, size: 10 });
    ctx.images = await prepareImages(S.editor);
    ctx.sections = 0;
    // bookmarks for TOC targets and internal links
    S.editor.querySelectorAll('.toc .te[data-target]').forEach(te => ctx.bookmarkFor(te.dataset.target));
    S.editor.querySelectorAll('a[href^="#"]').forEach(a => { const id = a.getAttribute('href').slice(1); if (id && document.getElementById(id)) ctx.bookmarkFor(id); });
    // comment anchors
    const validC = new Set(d.comments.map(c => c.id));
    let cn = 0;
    S.editor.querySelectorAll('span.cmt[data-cid]').forEach(a => {
      const id = a.dataset.cid;
      if (!validC.has(id)) return;
      if (!ctx.cmt.has(id)) ctx.cmt.set(id, { n: cn++, first: a, last: a });
      else ctx.cmt.get(id).last = a;
    });
    // header and footer parts: the default one and, as the document has them, the first page's
    // and the even pages' (an empty one is left out: Word shows nothing there either)
    const wm = d.watermark && d.watermark.text ? watermarkPng(d.watermark) : null;
    // each section's own headers and footers (one linked to the section before has none: Word
    // takes the one before, as Folio does)
    const secs = Sections.list();
    ctx.secs = secs;
    const parts = {}, partRels = {}, refs = {};
    const n = { header: 0, footer: 0 };
    ctx.imgN = ctx.images.size;
    const hfBox = h('div', { class: 'hfx doc hf-measure', 'aria-hidden': 'true' });
    hfBox.style.width = g.cw + 'px';
    paper.appendChild(hfBox);
    try {
      for (const sec of secs) {
        const r = refs[sec.sid] = { header: {}, footer: {} };
        hfBox.style.width = sec.g.cw + 'px';
        for (const kind of HF_KINDS) {
          const st = Sections.own(sec, kind);
          if (!st) continue;
          for (const v of HF_VARS) {
            if ((v === 'first' && !sec.first) || (v === 'even' && !d.evenDiff)) continue;
            const html = st[v] || '';
            const withWm = kind === 'header' && !!wm;
            // the first section's empty ones are left out (Word shows nothing there either); a later
            // section's are written, or Word would show the one before
            if (HF.empty(html) && !withWm && sec.i === 0) continue;
            const name = kind + (++n[kind]);
            r[kind][v] = ctx.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + kind, name + '.xml');
            const part = await hfPartXml(kind, html, ctx, hfBox, withWm ? wmDrawingXml(ctx, 'rIdWm', d.watermark.text) : '');
            if (withWm) part.rels.push({ id: 'rIdWm', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'media/watermark.png' });
            parts[name] = part.xml;
            if (part.rels.length) partRels[name] = part.rels;
          }
        }
      }
      // footnotes and endnotes, numbered in the order of their marks
      Notes.renumber(S.editor);
      ctx.noteIds = new Map();
      const lists = { foot: [], end: [] };
      for (const r of Notes.refs(S.editor)) {
        const id = r.dataset.fn, kind = Notes.kindOf(r);
        if (ctx.noteIds.has(id) || !Notes.all()[id]) continue;
        const wid = lists[kind].length + 1;
        ctx.noteIds.set(id, { kind, wid });
        lists[kind].push({ id, wid, mark: r.textContent });
      }
      hfBox.className = 'fn-area doc hf-measure';
      for (const kind of ['foot', 'end']) {
        if (!lists[kind].length) continue;
        const name = kind === 'end' ? 'endnotes' : 'footnotes';
        ctx.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + name, name + '.xml');
        const part = await notesPartXml(kind, lists[kind], ctx, hfBox);
        parts[name] = part.xml;
        if (part.rels.length) partRels[name] = part.rels;
      }
      ctx.noteKinds = { foot: lists.foot.length > 0, end: lists.end.length > 0 };
    } finally { hfBox.remove(); }
    const npb = normPageBorder(d.page.border);
    const pb = npb ? `<w:pgBorders w:offsetFrom="${npb.from === 'text' ? 'text' : 'page'}"${npb.show === 'first' ? ' w:display="firstPage"' : npb.show === 'rest' ? ' w:display="notFirstPage"' : ''}>${['top', 'left', 'bottom', 'right'].map(sd => npb.sides[sd] ? bdrWordXml(sd, { style: npb.style, width: npb.width, color: npb.color }, Math.min(31, npb.m[sd[0]]), npb.shadow ? ' w:shadow="1"' : '') : '').join('')}</w:pgBorders>` : '';
    // a section's settings (the one being written: ctx.si)
    ctx.sect = (cols, type) => {
      const sec = secs[Math.min(ctx.si, secs.length - 1)], sg = sec.g, r = refs[sec.sid] || { header: {}, footer: {} };
      let x = '';
      for (const kind of HF_KINDS) for (const v of HF_VARS) if (r[kind][v]) x += `<w:${kind}Reference w:type="${v === 'def' ? 'default' : v}" r:id="${r[kind][v]}"/>`;
      // the notes' number formats (Word's footnotePr / endnotePr)
      for (const kind of ['foot', 'end']) if (ctx.noteKinds && ctx.noteKinds[kind]) { const pr = Notes.pr(kind), t = kind === 'end' ? 'endnotePr' : 'footnotePr'; x += `<w:${t}><w:numFmt w:val="${NOTE_WFMT[pr.fmt] || 'decimal'}"/>${(pr.start || 1) > 1 ? `<w:numStart w:val="${pr.start}"/>` : ''}</w:${t}>`; }
      if (type) x += `<w:type w:val="${type}"/>`;
      x += `<w:pgSz w:w="${twp(sg.w)}" w:h="${twp(sg.h)}"${sec.pg.orient === 'landscape' ? ' w:orient="landscape"' : ''}/>`;
      x += `<w:pgMar w:top="${twp(sg.mt)}" w:right="${twp(sg.mr)}" w:bottom="${twp(sg.mb)}" w:left="${twp(sg.ml)}" w:header="${twp(sg.hd)}" w:footer="${twp(sg.fd)}" w:gutter="0"/>`;
      x += pb;
      // page numbers: where they start again, their format
      if (sec.pn && (PN_WFMT[sec.pn.fmt] !== 'decimal' || sec.pn.start != null)) x += `<w:pgNumType${PN_WFMT[sec.pn.fmt] !== 'decimal' ? ` w:fmt="${PN_WFMT[sec.pn.fmt]}"` : ''}${sec.pn.start != null ? ` w:start="${sec.pn.start}"` : ''}/>`;
      x += cols > 1 ? `<w:cols w:num="${cols}" w:space="720"/>` : '<w:cols w:space="720"/>';
      if (sec.first) x += '<w:titlePg/>';
      x += '<w:docGrid w:linePitch="360"/>';
      return x;
    };
    // how the part of a section being written starts: the section's own start, then (after a
    // part in columns) continuous
    ctx.subType = () => (ctx.subs ? 'continuous' : ctx.si > 0 ? SB_WTYPE[secs[Math.min(ctx.si, secs.length - 1)].type] : null);
    ctx.endSect = () => `<w:sectPr>${ctx.sect(1, ctx.afterCols ? 'continuous' : ctx.subType())}</w:sectPr>`;
    ctx.si = 0; ctx.subs = 0; ctx.body = S.editor;
    let body = blocksXml(S.editor, ctx);
    ctx.body = null;
    if (!body) body = '<w:p/>';
    const finalSect = ctx.endSect();
    const bg = d.page.color && d.page.color.toLowerCase() !== '#ffffff' ? `<w:background w:color="${hex6(d.page.color)}"/>` : '';
    const documentXml = `${XML_HEAD}<w:document ${NS_DRAW}>${bg}<w:body>${body}${finalSect}</w:body></w:document>`;
    // numbering
    const numberingXml = `${XML_HEAD}<w:numbering ${NS_DECL} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" mc:Ignorable="w14 wp14">${ctx.lists.map((lv, i) => `<w:abstractNum w:abstractNumId="${i}"><w:multiLevelType w:val="hybridMultilevel"/>${lv}</w:abstractNum>`).join('')}${ctx.lists.map((lv, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${i}"/></w:num>`).join('')}</w:numbering>`;
    // comments
    let commentsXml = null;
    if (ctx.cmt.size) {
      const items = [];
      for (const c of d.comments) {
        const info = ctx.cmt.get(c.id);
        if (!info) continue;
        const name = docxAuthor(c);
        const para = (txt, first) => `<w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>${first ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' : ''}<w:r><w:t xml:space="preserve">${escXml(txt)}</w:t></w:r></w:p>`;
        let ps = (c.text || '').split('\n').map((ln, i) => para(ln, i === 0)).join('');
        for (const rp of c.replies || []) ps += para(`${docxAuthor(rp)}: ${rp.text}`, false);
        items.push(`<w:comment w:id="${info.n}" w:author="${escXml(name)}" w:date="${isoDate(c.time)}" w:initials="${escXml(initials(name))}">${ps}</w:comment>`);
      }
      commentsXml = `${XML_HEAD}<w:comments ${NS_DECL}>${items.join('')}</w:comments>`;
      ctx.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments', 'comments.xml');
    }
    // Bangla page numbers (Word has none): each section's format in a document variable Word keeps
    const pnv = secs.map(s => (s.pn && s.pn.fmt) || '1');
    const docVars = pnv.some(f => f === 'bn' || f === 'bnk') ? `<w:docVars><w:docVar w:name="FolioPageNumbers" w:val="${pnv.join('|')}"/></w:docVars>` : '';
    const settingsXml = `${XML_HEAD}<w:settings ${NS_DECL}><w:zoom w:percent="100"/>${bg ? '<w:displayBackgroundShape/>' : ''}${S.track ? '<w:trackRevisions/>' : ''}<w:defaultTabStop w:val="720"/>${d.evenDiff ? '<w:evenAndOddHeaders/>' : ''}<w:characterSpacingControl w:val="doNotCompress"/>${ctx.noteKinds && ctx.noteKinds.foot ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : ''}${ctx.noteKinds && ctx.noteKinds.end ? '<w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>' : ''}<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>${docVars}</w:settings>`;
    const relsXml = `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${ctx.rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
    const st = docStats();
    const now = isoDate(Date.now());
    const coreXml = `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXml(d.title || '')}</dc:title><dc:subject>${escXml(d.props.subject || '')}</dc:subject><dc:creator>${escXml(d.props.author || Prefs.author || '')}</dc:creator><cp:keywords>${escXml(d.props.keywords || '')}</cp:keywords><cp:lastModifiedBy>${escXml(Prefs.author || '')}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${isoDate(d.created)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const appXml = `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Folio</Application><Pages>${S.pages}</Pages><Words>${st.words}</Words><Characters>${st.charsNoSpace}</Characters><CharactersWithSpaces>${st.chars}</CharactersWithSpaces><Paragraphs>${st.paras}</Paragraphs></Properties>`;
    const ct = [`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`, `<Default Extension="xml" ContentType="application/xml"/>`, `<Default Extension="png" ContentType="image/png"/>`, `<Default Extension="jpeg" ContentType="image/jpeg"/>`, `<Default Extension="gif" ContentType="image/gif"/>`,
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`, `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`, `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`, `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`, `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`, `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`];
    if (commentsXml) ct.push(`<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`);
    for (const k of Object.keys(parts)) ct.push(`<Override PartName="/word/${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${k === 'footnotes' || k === 'endnotes' ? k : k.startsWith('header') ? 'header' : 'footer'}+xml"/>`);
    const zip = new JSZip();
    const put = (path, data) => zip.file(path, data, { createFolders: false });
    put('[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct.join('')}</Types>`);
    put('_rels/.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    put('docProps/core.xml', coreXml);
    put('docProps/app.xml', appXml);
    put('word/document.xml', documentXml);
    put('word/styles.xml', stylesXml(ctx.styles));
    put('word/numbering.xml', numberingXml);
    put('word/settings.xml', settingsXml);
    put('word/_rels/document.xml.rels', relsXml);
    if (commentsXml) put('word/comments.xml', commentsXml);
    for (const [k, v] of Object.entries(parts)) put(`word/${k}.xml`, v);
    if (wm) put('word/media/watermark.png', wm.bytes);
    for (const [k, rels] of Object.entries(partRels)) put(`word/_rels/${k}.xml.rels`, `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`);
    for (const im of ctx.media) put('word/media/' + im.name, im.bytes);
    return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  } finally {
    paper.classList.remove('exporting', 'exporting-docx');
  }
}
