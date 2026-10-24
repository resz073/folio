/* ===================== Paragraph formatting ===================== */
const BSTYLES = {
  normal: { tag: 'P', cls: '', name: 'Normal' },
  nospacing: { tag: 'P', cls: 'nospacing', name: 'No Spacing' },
  title: { tag: 'P', cls: 'title', name: 'Title' },
  subtitle: { tag: 'P', cls: 'subtitle', name: 'Subtitle' },
  h1: { tag: 'H1', cls: '', name: 'Heading 1' },
  h2: { tag: 'H2', cls: '', name: 'Heading 2' },
  h3: { tag: 'H3', cls: '', name: 'Heading 3' },
  h4: { tag: 'H4', cls: '', name: 'Heading 4' },
  quote: { tag: 'P', cls: 'quote', name: 'Quote' },
  code: { tag: 'P', cls: 'code', name: 'Code' },
};
const STYLE_CLASSES = ['title', 'subtitle', 'quote', 'code', 'nospacing'];
function blockStyleKey(b) {
  if (!b) return 'normal';
  if (/^H[1-6]$/.test(b.tagName)) return b.tagName.toLowerCase();
  if (b.tagName === 'P') {
    for (const c of STYLE_CLASSES) if (b.classList.contains(c)) return c;
    for (const c of b.classList) if (Styles.isCustom(c)) return c;   // one of the document's own styles
  }
  return 'normal';
}
function setBlockStyle(key) {
  if (!Styles.exists(key) || S.readOnly) return;
  focusEditor();
  change(() => {
    withMarkers(() => {
      for (let b of selectedBlocks()) {
        if (/^(LI|TD|TH|DIV|BLOCKQUOTE|PRE)$/.test(b.tagName)) {
          // wrap loose inline content into a paragraph first
          if (b.tagName === 'PRE' || b.tagName === 'BLOCKQUOTE') b = renameEl(b, 'P');
          else {
            const p = document.createElement('p');
            while (b.firstChild && !(b.firstChild.nodeType === 1 && /^(UL|OL|TABLE)$/.test(b.firstChild.tagName))) p.appendChild(b.firstChild);
            b.insertBefore(p, b.firstChild);
            b = p;
          }
        }
        setBlockStyleOn(b, key);
      }
    });
  });
  Styles.paneSoon();
}
function setAlign(a) {
  if (S.readOnly) return;
  focusEditor();
  change(() => {
    const img = S.selImg;
    const blocks = img ? [blockOf(img)].filter(Boolean) : selectedBlocks();
    for (const b of blocks) alignBlock(b, a);
  });
}
/* one paragraph's alignment; 'decimal' lines numbers up on the decimal point (13b-decimal.js) */
function alignBlock(b, a) {
  if (a === 'decimal' && /^(TD|TH)$/.test(b.tagName)) {
    // a cell's loose text goes into a paragraph, so the padding never replaces the cell's own
    const p = document.createElement('p');
    while (b.firstChild && !(b.firstChild.nodeType === 1 && isBlockEl(b.firstChild))) p.appendChild(b.firstChild);
    if (!p.firstChild) p.appendChild(document.createElement('br'));
    b.insertBefore(p, b.firstChild);
    b = p;
  }
  if (a === 'decimal') { b.setAttribute('data-align', 'decimal'); b.style.textAlign = 'right'; return; }
  if (b.getAttribute('data-align') === 'decimal') { b.removeAttribute('data-align'); b.style.removeProperty('--decpad'); }
  b.style.textAlign = a === 'left' ? '' : a;
  if (!b.getAttribute('style')) b.removeAttribute('style');
}
function curAlign() {
  const b = blockOf(curTextNode());
  if (!b) return 'left';
  if (b.getAttribute('data-align') === 'decimal') return 'decimal';
  const v = getComputedStyle(b).textAlign;
  return v === 'center' ? 'center' : v === 'right' || v === 'end' ? 'right' : v === 'justify' ? 'justify' : 'left';
}
function inList() { const n = curTextNode(); const el = n && (n.nodeType === 1 ? n : n.parentNode); return el ? el.closest('li') : null; }
function listOf(node) { const el = node && (node.nodeType === 1 ? node : node.parentNode); return el ? el.closest('ul, ol') : null; }

function setIndent(dir) {
  if (S.readOnly) return;
  focusEditor();
  if (inList()) { change(() => exec(dir > 0 ? 'indent' : 'outdent')); return; }
  change(() => {
    for (const b of selectedBlocks()) {
      if (/^(TD|TH)$/.test(b.tagName)) continue;
      const cur = ownMargins(b).ml;
      const step = 48;
      const next = dir > 0 ? Math.floor(cur / step + 1.0001) * step : Math.max(0, Math.ceil(cur / step - 1.0001) * step);
      b.style.marginLeft = next ? fmtNum(next * 0.75, 2) + 'pt' : '';
      if (!b.getAttribute('style')) b.removeAttribute('style');
    }
  });
}
function setLineSpacing(v) {
  change(() => { for (const b of selectedBlocks()) b.style.lineHeight = v ? String(v) : ''; });
}
function setSpacing(which, pt) {
  change(() => {
    for (const b of selectedBlocks()) {
      if (which === 'before') b.style.marginTop = pt == null ? '' : pt + 'pt';
      else b.style.marginBottom = pt == null ? '' : pt + 'pt';
      if (!b.getAttribute('style')) b.removeAttribute('style');
    }
  });
}
function curSpacing(which) {
  const b = blockOf(curTextNode());
  if (!b) return 0;
  return Math.round(parseFloat(getComputedStyle(b)[which === 'before' ? 'marginTop' : 'marginBottom']) * 0.75 * 10) / 10;
}
function setShading(c) {
  if (c) Prefs.shade = c;
  const shd = c ? { fill: c, pat: 'clear' } : null;
  change(() => {
    const r = getRange() || lastRange;
    const cells = Tables.selectedCells();
    if (cells.length > 1 || (Tables.sel && cells.length)) { for (const td of cells) Borders.shade(td, shd); return; }
    for (const b of selectedBlocks(r)) {
      const tgt = /^(TD|TH)$/.test(b.tagName) ? b : (b.parentNode && /^(TD|TH)$/.test(b.parentNode.tagName) && cells.length && r && r.collapsed ? b.parentNode : b);
      if (tgt === b && !/^(TD|TH)$/.test(b.tagName)) Borders.shadeBlocks([b], shd); else Borders.shade(tgt, shd);
    }
  });
  savePrefs();
}
/* Home › Borders: the same choices as Word's Borders button */
function setBorders(kind) { Borders.quick(kind === 'box' ? 'outside' : kind); }

/* Lists */
const BULLET_TYPES = [
  { v: 'disc', label: '●  Filled circle' }, { v: 'circle', label: '○  Hollow circle' }, { v: 'square', label: '■  Square' },
  { v: '"➢  "', label: '➢  Arrowhead' }, { v: '"✓  "', label: '✓  Check mark' }, { v: '"–  "', label: '–  Dash' }, { v: '"★  "', label: '★  Star' },
];
const NUMBER_TYPES = [
  { v: 'decimal', label: '1.  2.  3.' }, { v: 'decimal-paren', label: '1)  2)  3)' }, { v: 'upper-alpha', label: 'A.  B.  C.' },
  { v: 'lower-alpha', label: 'a.  b.  c.' }, { v: 'lower-alpha-paren', label: 'a)  b)  c)' }, { v: 'upper-roman', label: 'I.  II.  III.' },
  { v: 'lower-roman', label: 'i.  ii.  iii.' }, { v: 'lower-roman-paren', label: 'i)  ii)  iii)' }, { v: 'paren-decimal', label: '(1)  (2)  (3)' },
  { v: 'paren-lower-alpha', label: '(a)  (b)  (c)' }, { v: 'paren-lower-roman', label: '(i)  (ii)  (iii)' },
  { v: 'bengali-dot', label: '১.  ২.  ৩.', bn: true }, { v: 'bn-dari', label: '১।  ২।  ৩।', bn: true }, { v: 'bn-close', label: '১)  ২)  ৩)', bn: true }, { v: 'bn-paren', label: '(১)  (২)  (৩)', bn: true },
  { v: 'bn-alpha', label: 'ক)  খ)  গ)', bn: true }, { v: 'bn-alpha-paren', label: '(ক)  (খ)  (গ)', bn: true },
];
/* Multilevel List presets: the top list's data-ml (doc.css numbers the levels) */
const ML_PRESETS = [
  { v: 'plain', label: '1.  a.  i.', note: 'Word’s default' },
  { v: 'legal', label: '1.  1.1.  1.1.1.' },
  { v: 'bn', label: '১।  (ক)  (১)', note: 'Bangla office style' },
  { v: 'bn-legal', label: '১.  ১.১.  ১.১.১.' },
  { v: 'paren', label: '(1)  (a)  (i)' },
  { v: 'outline', label: 'I.  A.  1.  a.' },
];
/* lists in lists: their top list, multilevel numbering */
const Lists = {
  /* the outermost list around the cursor */
  top(n) {
    let l = (n || (getRange() && getRange().startContainer)) ;
    l = l && (l.nodeType === 1 ? l : l.parentNode);
    let top = null;
    for (let x = l; x && x !== docBody(); x = x.parentNode) if (x.nodeType === 1 && (x.tagName === 'OL' || x.tagName === 'UL')) top = x;
    return top;
  },
  /* a Multilevel List preset on the list at the cursor (made a numbered list first) */
  multilevel(v) {
    if (S.readOnly) return;
    // a paragraph made a list first: the two one step to undo
    histGroup(() => {
      if (!inList()) toggleList('ol');
      const top = this.top();
      if (!top) return;
      change(() => {
        let t = top;
        if (t.tagName === 'UL') t = renameEl(t, 'OL');
        // the levels in it numbered by the preset: lists in it numbered too, their own types gone
        for (const l of [t, ...t.querySelectorAll('ul, ol')]) {
          const ll = l.tagName === 'UL' && !l.classList.contains('checklist') ? renameEl(l, 'OL') : l;
          if (ll.tagName === 'OL') { ll.style.removeProperty('list-style-type'); if (!ll.getAttribute('style')) ll.removeAttribute('style'); if (ll !== t) ll.removeAttribute('data-ml'); }
        }
        if (v === 'plain') t.removeAttribute('data-ml'); else t.setAttribute('data-ml', v);
      }, { full: true });
    });
  },
};
function curListType() {
  const li = inList();
  if (!li) return null;
  const l = li.parentNode.closest('ul,ol') || li.parentNode;
  if (l.tagName === 'UL') return l.classList.contains('checklist') ? 'check' : 'ul';
  return 'ol';
}
function toggleList(kind, styleType) {
  if (S.readOnly) return;
  focusEditor();
  const tidy = () => {
    // Chrome can leave the new list inside the old paragraph
    S.editor.querySelectorAll('p > ul, p > ol').forEach(l => { const p = l.parentNode; if (!p.isConnected) return; const kids = Array.from(p.childNodes); p.replaceWith(...kids); });
    S.editor.querySelectorAll('li > p:only-child').forEach(pp => { if (!pp.className && !pp.getAttribute('style')) unwrap(pp); });
  };
  // selected table cells: each cell's paragraphs become a list of their own, as in Word
  if (Tables.active()) { change(() => { Tables.forEachCell(() => listCommand(kind, styleType)); tidy(); Tables.park(); }, { full: true }); return; }
  change(() => {
    withMarkers(() => {
      selectBetweenMarkers();
      listCommand(kind, styleType);
      tidy();
    });
  });
}
function listCommand(kind, styleType) {
  const cur = curListType();
  if (kind === 'check') {
    if (cur === 'check') { exec('insertUnorderedList'); return; }
    if (cur !== 'ul') exec('insertUnorderedList');
    const l = listOf(curTextNode());
    if (l && l.tagName === 'UL') { l.classList.add('checklist'); l.style.listStyleType = ''; if (!l.getAttribute('style')) l.removeAttribute('style'); l.querySelectorAll(':scope > li').forEach(li => { if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false'); }); }
    return;
  }
  const want = kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList';
  if (cur === 'check' && kind === 'ul') {
    const l = listOf(curTextNode());
    l.classList.remove('checklist'); l.querySelectorAll('li[data-checked]').forEach(li => li.removeAttribute('data-checked'));
    if (!l.classList.length) l.removeAttribute('class');
    if (styleType) l.style.listStyleType = styleType;
    return;
  }
  if (cur === kind && !styleType) { exec(want); return; }
  if (cur !== kind) exec(want);
  const l = listOf(curTextNode());
  if (l) {
    if (styleType) l.style.listStyleType = styleType;
    if (kind === 'ul') { l.classList.remove('checklist'); l.querySelectorAll('li[data-checked]').forEach(li => li.removeAttribute('data-checked')); if (!l.classList.length) l.removeAttribute('class'); }
  }
}
function setListStart(n) {
  const li = inList();
  if (!li) return;
  const ol = li.closest('ol');
  if (!ol) return;
  change(() => { if (n > 1) ol.setAttribute('start', n); else ol.removeAttribute('start'); });
}

function sortParagraphs(desc) {
  const blocks = selectedBlocks().filter(b => b.parentNode === S.editor || b.tagName === 'LI');
  if (blocks.length < 2) { toast('Select two or more paragraphs or list items to sort.'); return; }
  const parent = blocks[0].parentNode;
  if (!blocks.every(b => b.parentNode === parent)) { toast('Sort works on paragraphs at the same level.'); return; }
  change(() => {
    const anchor = blocks[blocks.length - 1].nextSibling;
    const sorted = [...blocks].sort((a, b) => a.textContent.localeCompare(b.textContent, undefined, { numeric: true, sensitivity: 'base' }));
    if (desc) sorted.reverse();
    for (const b of sorted) parent.insertBefore(b, anchor);
    selectNodesRange(sorted[0], sorted[sorted.length - 1]);
  });
}

/* Breaks & rules */
function insertBlockAfterCaret(el, opts = {}) {
  focusEditor();
  const r = getRange();
  if (!r) return;
  let top = topBlockOf(r.startContainer);
  const leaf = blockOf(r.startContainer);
  if (!top) { S.editor.appendChild(el); return; }
  const simple = leaf && leaf === top && /^(P|H[1-6])$/.test(leaf.tagName);
  if (simple && opts.split) {
    const empty = !leaf.textContent.replace(/\u200B/g, '').trim() && !leaf.querySelector('img');
    if (empty) { leaf.before(el); caretAtStart(leaf); return; }
    if (atBlockStart(r.startContainer, r.startOffset, leaf)) { leaf.before(el); caretAtStart(leaf); return; }
    const after = splitBlockAt(leaf, r);
    leaf.after(el);
    if (!after.textContent.replace(/\u200B/g, '').trim() && !after.querySelector('img')) { after.innerHTML = '<br>'; }
    caretAtStart(after);
    return;
  }
  top.after(el);
  let next = el.nextElementSibling;
  if (!next || !/^(P|H[1-6])$/.test(next.tagName)) { next = h('p', null, h('br')); el.after(next); }
  caretAtStart(next);
}
function splitBlockAt(block, r) {
  const tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(block, block.childNodes.length);
  const frag = tail.extractContents();
  const after = block.cloneNode(false);
  after.removeAttribute('data-pgp');
  after.style && after.style.removeProperty('--pgp');
  if (after.hasAttribute('data-sx')) { after.removeAttribute('data-sx'); ['--sxl', '--sxr', '--sxw'].forEach(k => after.style.removeProperty(k)); }
  if (after.getAttribute('style') === '') after.removeAttribute('style');
  after.appendChild(frag);
  block.after(after);
  pruneEmptyInline(block); pruneEmptyInline(after);
  if (!block.firstChild || isBlank(block)) { block.innerHTML = '<br>'; }
  if (!after.firstChild) after.innerHTML = '<br>';
  return after;
}
/* (a shape has no text of its own in the page: it is drawn in its shadow root) */
function isBlank(el) { return !el.textContent.replace(/\u200B/g, '') && !el.querySelector('img, br, hr, table, span.shp'); }
function pruneEmptyInline(root) {
  root.querySelectorAll('span, b, i, u, s, strong, em, sub, sup, a, font').forEach(el => { if (!el.firstChild && !el.classList.contains('zw') && !el.classList.contains('shp')) el.remove(); });
}
function insertPageBreak() {
  if (S.readOnly || Story.refuse('A page break')) return;
  change(() => insertBlockAfterCaret(h('hr', { class: 'pb' }), { split: true }), { full: true });
}
function insertHR() {
  if (S.readOnly) return;
  change(() => insertBlockAfterCaret(h('hr'), { split: true }));
}

/* Paragraph dialog values */
function paraInfo() {
  const b = blockOf(curTextNode());
  if (!b) return null;
  const cs = getComputedStyle(b);
  const fs = parseFloat(cs.fontSize) || 14.67;
  const lhRaw = b.style.lineHeight || '';
  let line = parseFloat(lhRaw);
  // the Word multiple: the paragraph's own, else its style's (doc.css --lhm); an exact
  // height (an imported Word paragraph) as the multiple that looks the same
  if (!line && !lhRaw) line = Math.round((parseFloat(cs.getPropertyValue('--lhm')) || S.doc.line || 1.08) * 100) / 100;
  else if (lhRaw && !/^\s*[\d.]+\s*$/.test(lhRaw)) { const lh = parseFloat(cs.lineHeight); line = lh ? Math.round(lh / fs / LineH.stack(cs.fontFamily) * 100) / 100 : S.doc.line; }
  if (!line) { const lh = parseFloat(cs.lineHeight); line = lh ? Math.round((lh / fs) * 100) / 100 : S.doc.line; }
  const ti = parseFloat(cs.textIndent) || 0;
  // its own indents (a section's column moves its blocks with margins of its own)
  const om = ownMargins(b);
  return {
    block: b, align: curAlign(),
    left: om.ml, right: om.mr,
    first: ti, before: parseFloat(cs.marginTop) * 0.75, after: parseFloat(cs.marginBottom) * 0.75, line,
  };
}
function applyParagraph(o) {
  change(() => {
    for (const b of selectedBlocks()) {
      if (o.align) alignBlock(b, o.align);
      if (o.left != null) b.style.marginLeft = o.left ? fmtNum(o.left * 0.75, 2) + 'pt' : '';
      if (o.right != null) b.style.marginRight = o.right ? fmtNum(o.right * 0.75, 2) + 'pt' : '';
      if (o.first != null) b.style.textIndent = o.first ? fmtNum(o.first * 0.75, 2) + 'pt' : '';
      if (o.before != null) b.style.marginTop = fmtNum(o.before, 1) + 'pt';
      if (o.after != null) b.style.marginBottom = fmtNum(o.after, 1) + 'pt';
      if (o.line != null) b.style.lineHeight = String(o.line);
      if (!b.getAttribute('style')) b.removeAttribute('style');
    }
  });
}
