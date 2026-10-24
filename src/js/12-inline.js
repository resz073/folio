/* ===================== Character formatting ===================== */
const exec = (cmd, val = null) => { try { return document.execCommand(cmd, false, val); } catch { return false; } };
const qstate = cmd => { try { return document.queryCommandState(cmd); } catch { return false; } };

function unwrap(el) {
  const p = el.parentNode;
  if (!p) return;
  while (el.firstChild) p.insertBefore(el.firstChild, el);
  el.remove();
}
function renameEl(el, tag) {
  const n = document.createElement(tag);
  for (const a of Array.from(el.attributes)) n.setAttribute(a.name, a.value);
  while (el.firstChild) n.appendChild(el.firstChild);
  el.replaceWith(n);
  return n;
}
/* Split ancestors so that `anc` holds only the chain leading to `node` */
function isolate(node, anc) {
  let cur = node;
  while (cur !== anc && cur.parentNode) {
    const p = cur.parentNode;
    if (cur.previousSibling) { const before = p.cloneNode(false); while (p.firstChild !== cur) before.appendChild(p.firstChild); p.parentNode.insertBefore(before, p); }
    if (cur.nextSibling) { const after = p.cloneNode(false); while (cur.nextSibling) after.appendChild(cur.nextSibling); p.parentNode.insertBefore(after, p.nextSibling); }
    cur = p;
  }
  return anc;
}
const isFmtSpan = el => el && el.nodeName === 'SPAN' && !el.classList.contains('cmt') && !el.classList.contains('qm') && !isPgArtifact(el);

function decoTokens(el) { const v = (el.style && (el.style.textDecorationLine || el.style.textDecoration)) || ''; return v.split(/\s+/).filter(x => x === 'underline' || x === 'line-through' || x === 'overline'); }
function carriesProp(el, prop) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;
  switch (prop) {
    case 'underline': return tag === 'U' || decoTokens(el).includes('underline');
    case 'strike': return tag === 'S' || tag === 'STRIKE' || decoTokens(el).includes('line-through');
    case 'fontWeight': return tag === 'B' || tag === 'STRONG' || !!el.style.fontWeight;
    case 'fontStyle': return tag === 'I' || tag === 'EM' || !!el.style.fontStyle;
    case 'verticalAlign': return tag === 'SUB' || tag === 'SUP' || !!el.style.verticalAlign;
    case 'color': return (tag === 'FONT' && el.hasAttribute('color')) || !!el.style.color;
    case 'fontFamily': return (tag === 'FONT' && el.hasAttribute('face')) || !!el.style.fontFamily;
    case 'fontSize': return (tag === 'FONT' && el.hasAttribute('size')) || !!el.style.fontSize;
    default: return !!(el.style && el.style[prop]);
  }
}
function stripProp(el, prop) {
  const tag = el.tagName;
  const tagBased = (prop === 'underline' && tag === 'U') || (prop === 'strike' && (tag === 'S' || tag === 'STRIKE')) ||
    (prop === 'fontWeight' && (tag === 'B' || tag === 'STRONG')) || (prop === 'fontStyle' && (tag === 'I' || tag === 'EM')) ||
    (prop === 'verticalAlign' && (tag === 'SUB' || tag === 'SUP'));
  if (prop === 'underline' || prop === 'strike') {
    const drop = prop === 'underline' ? 'underline' : 'line-through';
    const keep = decoTokens(el).filter(t => t !== drop);
    el.style.textDecoration = '';
    if (keep.length) el.style.textDecorationLine = keep.join(' ');
    else { el.style.textDecorationLine = ''; el.style.textDecorationStyle = ''; el.style.textDecorationColor = ''; el.style.textDecorationThickness = ''; }
  } else if (el.style) el.style[prop] = '';
  if (tag === 'FONT') { if (prop === 'color') el.removeAttribute('color'); if (prop === 'fontFamily') el.removeAttribute('face'); if (prop === 'fontSize') el.removeAttribute('size'); }
  if (el.getAttribute('style') === '') el.removeAttribute('style');
  if (tagBased) { if (el.attributes.length) renameEl(el, 'span'); else unwrap(el); }
  else if ((tag === 'SPAN' || tag === 'FONT') && !el.attributes.length) unwrap(el);
}
function removeInlineProp(t, prop) {
  const block = blockOf(t);
  let el = t.parentNode;
  while (el && el !== block && el !== S.editor && el.nodeType === 1) {
    const up = el.parentNode;
    if (carriesProp(el, prop) && !el.classList.contains('cmt')) {
      isolate(t, el);
      const parentAfter = el.parentNode;
      stripProp(el, prop);
      el = el.isConnected ? el.parentNode : parentAfter;
      continue;
    }
    el = up;
  }
}
function wrapperFor(t) {
  const p = t.parentNode;
  if (isFmtSpan(p) && p.childNodes.length === 1) return p;
  const sp = document.createElement('span');
  p.insertBefore(sp, t);
  sp.appendChild(t);
  return sp;
}
/* props: CSS property → value, or null to remove. Pseudo props: underline (style|null), strike (true|null) */
function styleTextNode(t, props) {
  for (const k in props) {
    if (props[k] === null || k === 'underline' || k === 'strike') removeInlineProp(t, k);
  }
  const sets = Object.entries(props).filter(([, v]) => v !== null && v !== undefined);
  if (!sets.length) return;
  const sp = wrapperFor(t);
  for (const [k, v] of sets) {
    if (k === 'underline' || k === 'strike') {
      const toks = new Set(decoTokens(sp));
      toks.add(k === 'underline' ? 'underline' : 'line-through');
      sp.style.textDecoration = '';
      sp.style.textDecorationLine = [...toks].join(' ');
      if (k === 'underline') {
        const st = v === true ? 'single' : v;
        sp.style.textDecorationStyle = st === 'single' || st === 'thick' ? '' : st;
        sp.style.textDecorationThickness = st === 'thick' ? '2px' : '';
      }
    } else sp.style[k] = v;
  }
}
function makeCaretSpan(r) {
  const el = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
  if (el && el.classList && el.classList.contains('zw') && el.textContent === '\u200B') return el;
  const sp = h('span', { class: 'zw' }, '\u200B');
  r.insertNode(sp);
  return sp;
}
function uniqueBlocks(nodes) { const s = new Set(); for (const n of nodes) { const b = blockOf(n) || topBlockOf(n); if (b) s.add(b); } return [...s]; }

/* Apply inline CSS to the selection. fn(textNode) may supply per-node props. */
function applyInline(props, fn) {
  if (S.readOnly) return;
  focusEditor();
  if (Tables.active()) {
    // selected table cells: all of their text
    const cells = Tables.selectedCells();
    change(() => {
      for (const t of Tables.cellTexts()) styleTextNode(t, fn ? fn(t) : props);
      normalizeInline(cells);
      Tables.park();
    }, { node: cells[0] });
    return;
  }
  const r = getRange();
  if (!r) return;
  change(() => {
    const collapsed = r.collapsed;
    let texts;
    if (collapsed) texts = [makeCaretSpan(r).firstChild];
    else texts = textNodesIn(r);
    if (!texts.length) return;
    const first = texts[0], last = texts[texts.length - 1];
    for (const t of texts) styleTextNode(t, fn ? fn(t) : props);
    normalizeInline(uniqueBlocks(texts));
    if (collapsed) caretAt(first, first.length); else selectNodesRange(first, last);
  }, { node: r.startContainer });
}

function fontToSpan(f) {
  const sp = document.createElement('span');
  if (f.getAttribute('style')) sp.setAttribute('style', f.getAttribute('style'));
  if (f.hasAttribute('face')) sp.style.fontFamily = fontStack(firstFamily(f.getAttribute('face')));
  if (f.hasAttribute('color')) sp.style.color = f.getAttribute('color');
  if (f.hasAttribute('size')) { const m = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 }; const v = m[f.getAttribute('size')]; if (v) sp.style.fontSize = v + 'pt'; }
  while (f.firstChild) sp.appendChild(f.firstChild);
  f.replaceWith(sp);
  return sp;
}
const hasData = el => Array.from(el.attributes).some(a => a.name.startsWith('data-'));
function sameAttrs(a, b) {
  if (a.attributes.length !== b.attributes.length) return false;
  for (const at of Array.from(a.attributes)) {
    if (at.name === 'style') { if (a.style.cssText !== b.style.cssText) return false; }
    else if (b.getAttribute(at.name) !== at.value) return false;
  }
  return true;
}
function normalizeInline(roots) {
  for (const root of roots) {
    if (!root || !root.isConnected) continue;
    root.querySelectorAll('font').forEach(fontToSpan);
    root.querySelectorAll('span').forEach(sp => {
      if (sp.classList.contains('zw') || sp.classList.contains('qm') || isPgArtifact(sp)) return;
      if (sp.getAttribute('style') === '') sp.removeAttribute('style');
      if (sp.getAttribute('class') === '') sp.removeAttribute('class');
      if (!sp.attributes.length) { unwrap(sp); return; }
      if (!sp.firstChild && !sp.classList.contains('cmt')) sp.remove();
    });
    for (const sp of root.querySelectorAll('span, b, i, u, s, sub, sup, strong, em')) {
      if (!sp.isConnected || sp.classList.contains('zw') || sp.classList.contains('qm') || isPgArtifact(sp)) continue;
      let n = sp.nextSibling;
      while (n && n.nodeType === 1 && n.tagName === sp.tagName && sameAttrs(n, sp) && !n.classList.contains('zw')) {
        while (n.firstChild) sp.appendChild(n.firstChild);
        const dead = n; n = n.nextSibling; dead.remove();
      }
      if (sp.tagName === 'SPAN' && sp.childNodes.length === 1 && sp.firstChild.nodeType === 1 && sp.firstChild.tagName === 'SPAN' &&
        !sp.className && !sp.firstChild.className && !hasData(sp) && !hasData(sp.firstChild)) {
        const inner = sp.firstChild;
        sp.setAttribute('style', (sp.getAttribute('style') || '') + ';' + (inner.getAttribute('style') || ''));
        sp.setAttribute('style', sp.style.cssText);
        while (inner.firstChild) sp.insertBefore(inner.firstChild, inner);
        inner.remove();
      }
    }
  }
}

/* --- Commands --- */
function toggleInline(cmd) {
  if (S.readOnly) return;
  focusEditor();
  if (Tables.active()) {
    // selected table cells: on for all of them unless all of them have it already (as Word)
    const cells = Tables.selectedCells().filter(c => c.textContent.replace(/[\u200B\s]/g, ''));
    if (!cells.length) return;
    change(() => {
      const on = cells.every(c => { setRange(Tables.contentsRange(c)); return qstate(cmd); });
      for (const c of cells) {
        setRange(Tables.contentsRange(c));
        if (cmd === 'subscript' && qstate('superscript')) exec('superscript');
        if (cmd === 'superscript' && qstate('subscript')) exec('subscript');
        if (qstate(cmd) === on) exec(cmd);
      }
      normalizeInline(Tables.selectedCells());
      Tables.park();
    }, { node: cells[0] });
    return;
  }
  const r = getRange();
  if (!r) return;
  change(() => {
    if (cmd === 'subscript' && qstate('superscript')) exec('superscript');
    if (cmd === 'superscript' && qstate('subscript')) exec('subscript');
    exec(cmd);
    const rr = getRange();
    if (rr && !rr.collapsed) normalizeInline(selectedBlocks(rr));
  }, { node: r.startContainer });
}
function curTextNode() {
  const r = getRange() || lastRange;
  if (!r) return null;
  const n = boundaryNode(r.startContainer, r.startOffset, false);
  return n;
}
function curComputed() {
  const n = curTextNode();
  const el = n ? (n.nodeType === 1 ? n : n.parentNode) : S.editor.firstElementChild;
  return el && S.editor.contains(el) ? getComputedStyle(el) : getComputedStyle(S.editor);
}
function setFontFamily(name) {
  name = String(name || '').trim();
  if (!name) return;
  ensureFont(name);
  addRecentFont(name);
  applyInline({ fontFamily: fontStack(name) });
}
function setFontSize(pt) {
  pt = parseFloat(pt);
  if (!(pt >= 1 && pt <= 1638)) { toast('Enter a font size between 1 and 1638.'); return; }
  applyInline({ fontSize: fmtNum(pt, 1) + 'pt' });
}
function growFont(dir) {
  applyInline(null, t => {
    const px = parseFloat(getComputedStyle(t.parentNode).fontSize) || 14.67;
    const pt = Math.round(px * 0.75 * 2) / 2;
    let next;
    if (dir > 0) next = FONT_SIZES.find(s => s > pt + 0.01) || Math.min(1638, pt + 10);
    else next = [...FONT_SIZES].reverse().find(s => s < pt - 0.01) || Math.max(1, pt - 1);
    return { fontSize: fmtNum(next, 1) + 'pt' };
  });
}
function setFontColor(c) { if (c !== undefined) Prefs.fontColor = c || Prefs.fontColor; applyInline({ color: c || null }); savePrefs(); }
function setHighlight(c) { if (c) Prefs.highlight = c; applyInline({ backgroundColor: c || null }); savePrefs(); }
function setUnderlineStyle(st) { applyInline(st === 'none' ? { underline: null } : { underline: st }); }
function setCharEffect(prop, value) { applyInline({ [prop]: value }); }

function changeCase(mode) {
  if (S.readOnly) return;
  focusEditor();
  const cellMode = Tables.active();
  const r = getRange();
  if (!cellMode && (!r || r.collapsed)) { toast('Select the text you want to change.'); return; }
  change(() => {
    const texts = cellMode ? Tables.cellTexts() : textNodesIn(r);
    let capNext = true, prevBlock = null, prevWordChar = false;
    for (const t of texts) {
      const b = blockOf(t);
      if (b !== prevBlock) { capNext = true; prevWordChar = false; prevBlock = b; }
      let s = t.data;
      if (mode === 'upper') s = s.toLocaleUpperCase();
      else if (mode === 'lower') s = s.toLocaleLowerCase();
      else if (mode === 'toggle') s = [...s].map(ch => ch === ch.toLocaleUpperCase() ? ch.toLocaleLowerCase() : ch.toLocaleUpperCase()).join('');
      else if (mode === 'title') s = [...s.toLocaleLowerCase()].map(ch => { const out = (!prevWordChar && /\p{L}/u.test(ch)) ? ch.toLocaleUpperCase() : ch; prevWordChar = /[\p{L}\p{N}']/u.test(ch); return out; }).join('');
      else if (mode === 'sentence') s = [...s.toLocaleLowerCase()].map(ch => { let out = ch; if (capNext && /\p{L}/u.test(ch)) { out = ch.toLocaleUpperCase(); capNext = false; } else if (/[.!?।]/.test(ch)) capNext = true; return out; }).join('');
      if (s !== t.data) t.data = s;
    }
    if (cellMode) Tables.park();
    else if (texts.length) selectNodesRange(texts[0], texts[texts.length - 1]);
  }, { node: cellMode ? Tables.selectedCells()[0] : r.startContainer });
}

function clearFormatting() {
  if (S.readOnly) return;
  focusEditor();
  if (Tables.active()) { change(() => Tables.forEachCell((c, r) => clearFormattingIn(r))); return; }
  const r = getRange();
  if (!r) return;
  change(() => clearFormattingIn(r));
}
function clearFormattingIn(r) {
  const blocks = selectedBlocks(r);
  if (!r.collapsed) {
    withMarkers(() => {
      const keep = Array.from(S.editor.querySelectorAll('span.cmt, ins.tc, del.tc, span.zw'));
      for (const el of keep) {
        const n = document.createElement('q-keep');
        n.setAttribute('data-tag', el.tagName);
        for (const a of Array.from(el.attributes)) n.setAttribute('data-a-' + a.name, a.value);
        while (el.firstChild) n.appendChild(el.firstChild);
        el.replaceWith(n);
      }
      selectBetweenMarkers();
      exec('removeFormat');
      exec('unlink');
      for (const n of Array.from(S.editor.querySelectorAll('q-keep'))) {
        const el = document.createElement(n.getAttribute('data-tag'));
        for (const a of Array.from(n.attributes)) if (a.name.startsWith('data-a-')) el.setAttribute(a.name.slice(7), a.value);
        while (n.firstChild) el.appendChild(n.firstChild);
        n.replaceWith(el);
      }
      const rr = selectBetweenMarkers();
      if (rr) for (const t of textNodesIn(rr, false)) for (const p of ['fontFamily', 'fontSize', 'color', 'backgroundColor', 'underline', 'strike', 'fontWeight', 'fontStyle', 'verticalAlign', 'letterSpacing', 'textTransform', 'fontVariant']) removeInlineProp(t, p);
    });
  }
  for (const b of blocks) {
    if (/^(P|H[1-6])$/.test(b.tagName)) {
      const nb = b.tagName === 'P' ? b : renameEl(b, 'P');
      nb.removeAttribute('class');
      nb.removeAttribute('data-align');
      const keepPgp = nb.style.getPropertyValue('--pgp');
      nb.removeAttribute('style');
      if (keepPgp) nb.style.setProperty('--pgp', keepPgp);
    } else if (b.style) { b.style.textAlign = ''; b.style.lineHeight = ''; b.style.marginLeft = ''; b.style.textIndent = ''; if (!b.getAttribute('style')) b.removeAttribute('style'); }
  }
  normalizeInline(selectedBlocks());
}

/* Format painter */
const Painter = {
  capture() {
    const n = curTextNode();
    const el = n && (n.nodeType === 1 ? n : n.parentNode);
    if (!el || !S.editor.contains(el)) return null;
    const cs = getComputedStyle(el);
    let bg = null, under = false, strike = false;
    for (let a = el; a && a !== S.editor && !LEAF_BLOCKS.has(a.tagName); a = a.parentNode) {
      if (!bg) { const c = cssColorToHex(getComputedStyle(a).backgroundColor); if (c) bg = c; }
      if (carriesProp(a, 'underline')) under = true;
      if (carriesProp(a, 'strike')) strike = true;
    }
    const block = blockOf(el);
    return {
      fontFamily: cs.fontFamily, fontSize: fmtNum(parseFloat(cs.fontSize) * 0.75, 1) + 'pt', fontWeight: parseInt(cs.fontWeight, 10) >= 600 ? '700' : '400',
      fontStyle: cs.fontStyle === 'italic' ? 'italic' : 'normal', color: cs.color, bg, under, strike,
      block: block ? { align: block.getAttribute('data-align') === 'decimal' ? 'decimal' : (block.style.textAlign || 'left'), line: block.style.lineHeight } : null,
    };
  },
  start(sticky) {
    const f = this.capture();
    if (!f) { toast('Click in formatted text first, then choose Format Painter.'); return; }
    S.painter = { f, sticky };
    S.editor.style.cursor = 'copy';
    UI.refresh();
    toast(sticky ? 'Format Painter is on. Select text to paint; press Esc to stop.' : 'Select the text to paint with this formatting.');
  },
  stop() { S.painter = null; S.editor.style.cursor = ''; UI.refresh(); },
  apply() {
    const p = S.painter;
    if (!p) return;
    const r = getRange();
    if (!r) return;
    if (r.collapsed && !Tables.active()) { const s = window.getSelection(); try { s.modify('move', 'backward', 'word'); s.modify('extend', 'forward', 'word'); } catch { } }
    const f = p.f;
    applyInline({ fontFamily: f.fontFamily, fontSize: f.fontSize, fontWeight: f.fontWeight, fontStyle: f.fontStyle, color: f.color, backgroundColor: f.bg || null, underline: f.under ? 'single' : null, strike: f.strike ? true : null });
    if (f.block) change(() => { for (const b of selectedBlocks()) { alignBlock(b, f.block.align); b.style.lineHeight = f.block.line || ''; if (!b.getAttribute('style')) b.removeAttribute('style'); } });
    if (!p.sticky) this.stop();
  },
};
