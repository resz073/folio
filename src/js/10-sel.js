/* ===================== Selection helpers ===================== */
let lastRange = null;
const LEAF_BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'PRE', 'BLOCKQUOTE', 'DIV', 'DT', 'DD']);
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'PRE', 'BLOCKQUOTE', 'DIV', 'HR', 'DL', 'DT', 'DD', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'ADDRESS', 'CAPTION', 'COLGROUP', 'COL', 'MAIN', 'NAV', 'ASIDE', 'CENTER', 'DETAILS', 'SUMMARY', 'FIGCAPTION', 'FIELDSET', 'LEGEND']);
const isBlockEl = n => n && n.nodeType === 1 && BLOCK_TAGS.has(n.tagName);
const isPgArtifact = n => n && n.nodeType === 1 && (n.classList.contains('pg-spacer') || n.classList.contains('pg-line'));

function getRange() {
  const s = window.getSelection();
  if (!s || !s.rangeCount || !S.editor) return null;
  const r = s.getRangeAt(0);
  return S.editor.contains(r.commonAncestorContainer) ? r : null;
}
function setRange(r) {
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
  lastRange = r.cloneRange();
}
function caretAt(node, offset) { const r = document.createRange(); r.setStart(node, offset); r.collapse(true); setRange(r); }
function caretAtStart(el) {
  let n = el;
  while (n.firstChild && n.firstChild.nodeType === 1 && !isVoid(n.firstChild)) n = n.firstChild;
  if (n.firstChild && n.firstChild.nodeType === 3) caretAt(n.firstChild, 0); else caretAt(n, 0);
}
function caretAtEnd(el) {
  let n = el;
  while (n.lastChild && n.lastChild.nodeType === 1 && !isVoid(n.lastChild)) n = n.lastChild;
  if (n.lastChild && n.lastChild.nodeType === 3) caretAt(n.lastChild, n.lastChild.length);
  else if (n.lastChild && n.lastChild.nodeName === 'BR') caretAt(n, Array.prototype.indexOf.call(n.childNodes, n.lastChild));
  else caretAt(n, n.childNodes.length);
}
const isVoid = n => /^(BR|IMG|HR|INPUT|COL|WBR)$/.test(n.nodeName);
function selectNodeContents(el) { const r = document.createRange(); r.selectNodeContents(el); setRange(r); }

function focusEditor() {
  if (!S.editor) return;
  const had = getRange();
  if (document.activeElement !== S.editor) {
    const x = window.scrollX, y = window.scrollY;
    S.editor.focus({ preventScroll: true });
    window.scrollTo(x, y);
  }
  if (!had) {
    if (lastRange && S.editor.contains(lastRange.startContainer)) setRange(lastRange);
    else if (!getRange()) { const f = S.editor.firstElementChild; if (f) caretAtStart(f); }
  }
}

/* Paths that ignore pagination artifacts (used by undo snapshots) */
function idxOf(n) { let i = 0; for (let c = n.parentNode.firstChild; c && c !== n; c = c.nextSibling) if (!isPgArtifact(c)) i++; return i; }
function nodePath(n) {
  const p = [];
  while (n && n !== S.editor) { if (!n.parentNode) return null; p.unshift(idxOf(n)); n = n.parentNode; }
  return n === S.editor ? p : null;
}
function pathNode(p) {
  let n = S.editor;
  for (const i of p) {
    let k = -1, c = n.firstChild;
    for (; c; c = c.nextSibling) { if (isPgArtifact(c)) continue; if (++k === i) break; }
    if (!c) return n;
    n = c;
  }
  return n;
}
function offSkip(c, o) { if (c.nodeType !== 1) return o; let k = 0; for (let i = 0; i < o && i < c.childNodes.length; i++) if (!isPgArtifact(c.childNodes[i])) k++; return k; }
function offUnskip(c, k) { if (c.nodeType !== 1) return Math.min(k, c.length); let i = 0, seen = 0; for (; i < c.childNodes.length && seen < k; i++) if (!isPgArtifact(c.childNodes[i])) seen++; return i; }
function saveSel(r) {
  const own = !r;
  const cells = own && Tables.active();
  r = r || getRange() || (cells && lastRange && S.editor.contains(lastRange.startContainer) ? lastRange : null);
  if (!r) return null;
  const sp = nodePath(r.startContainer), ep = nodePath(r.endContainer);
  if (!sp || !ep) return null;
  const out = { sp, so: offSkip(r.startContainer, r.startOffset), ep, eo: offSkip(r.endContainer, r.endOffset) };
  if (cells) out.cells = Tables.serialize();   // selected table cells come back with undo and redo
  return out;
}
function restoreSel(s) {
  if (!s) return false;
  try {
    const sn = pathNode(s.sp), en = pathNode(s.ep);
    const r = document.createRange();
    const cl = (n, o) => Math.min(o, n.nodeType === 3 ? n.length : n.childNodes.length);
    r.setStart(sn, cl(sn, offUnskip(sn, s.so)));
    r.setEnd(en, cl(en, offUnskip(en, s.eo)));
    setRange(r);
    if (s.cells) Tables.restore(s.cells); else if (Tables.sel) Tables.clearSel();
    return true;
  } catch { return false; }
}

/* Keep the selection across DOM surgery by dropping invisible markers into the content */
function withMarkers(fn) {
  const r = getRange() || (lastRange && S.editor.contains(lastRange.startContainer) ? lastRange : null);
  if (!r) { fn(); return; }
  const m1 = h('span', { class: 'qm', 'data-q': 's' }, '\u200B'), m2 = h('span', { class: 'qm', 'data-q': 'e' }, '\u200B');
  const collapsed = r.collapsed;
  const er = r.cloneRange(); er.collapse(false); er.insertNode(m2);
  if (!collapsed) { const sr = r.cloneRange(); sr.collapse(true); sr.insertNode(m1); }
  try { fn(); }
  finally { restoreFromMarkers(); }
}
function selectBetweenMarkers() {
  const a = S.editor.querySelector('span.qm[data-q="s"]'), b = S.editor.querySelector('span.qm[data-q="e"]');
  const nr = document.createRange();
  if (a && b) { nr.setStartAfter(a); nr.setEndBefore(b); }
  else if (b) { nr.setStartBefore(b); nr.collapse(true); }
  else if (a) { nr.setStartAfter(a); nr.collapse(true); }
  else return null;
  setRange(nr);
  return nr;
}
function restoreFromMarkers() {
  const nr = selectBetweenMarkers();
  const ms = S.editor.querySelectorAll('span.qm');
  const parents = new Set();
  ms.forEach(m => { parents.add(m.parentNode); m.remove(); });
  if (nr) {
    // merge text nodes split by the markers without losing the caret
    for (const p of parents) if (p && p.isConnected) mergeTextAround(p, nr);
    try { setRange(nr); } catch { }
  }
}
function mergeTextAround(parent, r) {
  for (let c = parent.firstChild; c;) {
    const n = c.nextSibling;
    if (c.nodeType === 3 && n && n.nodeType === 3) {
      const len = c.length;
      const fix = (node, off) => (node === n ? [c, off + len] : node === parent && off > idxChild(n) ? [parent, off - 1] : null);
      const s = fix(r.startContainer, r.startOffset), e = fix(r.endContainer, r.endOffset);
      c.appendData(n.data);
      n.remove();
      if (s) r.setStart(s[0], s[1]);
      if (e) r.setEnd(e[0], e[1]);
      continue;
    }
    c = n;
  }
}
const idxChild = n => Array.prototype.indexOf.call(n.parentNode.childNodes, n);

function blockOf(node) {
  let n = node && (node.nodeType === 1 ? node : node.parentNode);
  while (n && n !== S.editor) {
    if (n.nodeType === 1 && LEAF_BLOCKS.has(n.tagName) && !(n.tagName === 'DIV' && (n.classList.contains('cols') || n.classList.contains('toc')))) return n;
    n = n.parentNode;
  }
  return null;
}
function topBlockOf(node) {
  let n = node && (node.nodeType === 1 ? node : node.parentNode);
  while (n && n.parentNode !== S.editor) { if (n === S.editor || !n.parentNode) return null; n = n.parentNode; }
  return n && n.parentNode === S.editor ? n : null;
}
function deepFirst(n) { while (n && n.firstChild) n = n.firstChild; return n; }
function deepLast(n) { while (n && n.lastChild) n = n.lastChild; return n; }
function boundaryNode(c, o, isEnd) {
  if (c.nodeType === 3) return c;
  if (isEnd) return o > 0 ? deepLast(c.childNodes[o - 1]) || c : c;
  return c.childNodes[o] ? deepFirst(c.childNodes[o]) || c.childNodes[o] : c;
}
function atBlockStart(container, offset, block) {
  const t = document.createRange();
  t.setStart(block, 0);
  try { t.setEnd(container, offset); } catch { return false; }
  if (t.toString().replace(/\u200B/g, '') !== '') return false;
  const f = t.cloneContents();
  // a picture or shape in the text is in the way; one wrapped or floating beside it isn't
  return !f.querySelector || !Array.from(f.querySelectorAll('img, span.shp')).some(x => !x.matches(WRAPPED_SEL));
}
function selectedBlocks(r) {
  if (!r && Tables.active()) return Tables.selBlocks();   // selected table cells: all their paragraphs
  r = r || getRange() || lastRange;
  if (!r || !S.editor.contains(r.startContainer)) return [];
  const sb = blockOf(boundaryNode(r.startContainer, r.startOffset, false));
  if (r.collapsed) return sb ? [sb] : [];
  const out = [], seen = new Set();
  const add = b => { if (b && !seen.has(b)) { seen.add(b); out.push(b); } };
  add(sb);
  const root = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => (n.nodeType === 3 || n.nodeName === 'BR' || n.nodeName === 'IMG' || (n.nodeType === 1 && LEAF_BLOCKS.has(n.tagName) && !n.firstChild)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3 && /^\s*$/.test(n.data) && n.parentNode && /^(UL|OL|TABLE|TBODY|THEAD|TR|COLGROUP)$/.test(n.parentNode.nodeName)) continue;
    if (r.intersectsNode(n)) add(blockOf(n));
  }
  const eb = blockOf(boundaryNode(r.endContainer, r.endOffset, false));
  if (eb && eb !== sb && seen.has(eb) && atBlockStart(r.endContainer, r.endOffset, eb)) { out.splice(out.indexOf(eb), 1); }
  return out.filter(b => !out.some(o => o !== b && b.contains(o)));
}
function insideNonEditable(n) {
  const el = n.nodeType === 1 ? n : n.parentNode;
  const ce = el && el.closest('[contenteditable="false"]');
  return !!(ce && S.editor.contains(ce) && ce !== S.editor);
}
/* Text nodes fully covered by the range, splitting the boundary nodes */
function textNodesIn(r, split = true) {
  let sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
  if (split) {
    if (ec.nodeType === 3 && eo > 0 && eo < ec.length) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0 && so < sc.length) { const n = sc.splitText(so); if (ec === sc) { ec = n; eo -= so; } sc = n; so = 0; }
  }
  const rr = document.createRange();
  rr.setStart(sc, so); rr.setEnd(ec, eo);
  const out = [];
  const consider = t => {
    if (!t.length) return;
    if (t === sc && so >= t.length) return;
    if (t === ec && eo === 0) return;
    if (/^\s*$/.test(t.data) && t.parentNode && /^(UL|OL|TABLE|TBODY|THEAD|TR|COLGROUP)$/.test(t.parentNode.nodeName)) return;
    if (insideNonEditable(t)) return;
    out.push(t);
  };
  const root = rr.commonAncestorContainer;
  if (root.nodeType === 3) consider(root);
  else { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (rr.intersectsNode(n)) consider(n); }
  return out;
}
function selectNodesRange(first, last) {
  const r = document.createRange();
  r.setStart(first, 0);
  r.setEnd(last, last.nodeType === 3 ? last.length : last.childNodes.length);
  setRange(r);
}
function selectionText() { const r = getRange(); return r ? r.toString().replace(/\u200B/g, '') : ''; }
function caretRect() {
  const r = getRange();
  if (!r) return null;
  const rr = r.cloneRange();
  rr.collapse(false);
  let rect = rr.getClientRects()[0];
  if (!rect || (!rect.width && !rect.height)) {
    const n = rr.startContainer.nodeType === 1 ? (rr.startContainer.childNodes[rr.startOffset] || rr.startContainer) : rr.startContainer.parentNode;
    const el = n.nodeType === 1 ? n : n.parentNode;
    rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, bottom: rect.top + Math.min(rect.height, 24), right: rect.left, height: Math.min(rect.height, 24) };
  }
  return rect;
}
