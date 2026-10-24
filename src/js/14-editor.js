/* ===================== Editor core ===================== */
const Paste = { mode: 'keep', last: null, plainNext: false, before: null };

function initEditor() {
  const ed = S.editor = $('#editor');
  exec('defaultParagraphSeparator', 'p');
  exec('styleWithCSS', false);
  try { document.execCommand('enableObjectResizing', false, false); document.execCommand('enableInlineTableEditing', false, false); } catch { }
  bindEditor(ed);
  document.addEventListener('contextmenu', e => CtxMenu.onContext(e));
  $('#paper').addEventListener('dblclick', onEditorDblClick);
  $('#paper').addEventListener('mousedown', onNoteDown, true);
  document.addEventListener('selectionchange', onSelectionChange);
}
/* what makes an element the editor: the document's text, or a header or footer being edited */
function bindEditor(ed) {
  ed.addEventListener('beforeinput', onBeforeInput);
  ed.addEventListener('input', onInput);
  ed.addEventListener('keydown', onEditorKeyDown);
  ed.addEventListener('paste', onPaste);
  ed.addEventListener('copy', onCopy);
  ed.addEventListener('cut', onCopy);
  ed.addEventListener('dragstart', () => { S.dragInside = true; });
  ed.addEventListener('dragend', () => { S.dragInside = false; });
  ed.addEventListener('drop', onDrop);
  ed.addEventListener('mousedown', onEditorMouseDown);
  // a finger or pen drags a picture in front of / behind the text (the mouse goes through mousedown)
  ed.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    PicEdit._touchAt = Date.now();
    const img = e.target.closest && e.target.closest('img, span.shp');
    if (img && S.editor.contains(img) && PicEdit.floating(img) && !(Shapes.is(img) && Shapes.clickEdits(img, e))) { Images.select(img); PicEdit.startMove(e, img); }
  });
  ed.addEventListener('mouseup', onEditorMouseUp);
  ed.addEventListener('click', onEditorClick);
  ed.addEventListener('compositionstart', () => { S.composing = true; if (S.track) Track.onCompositionStart(); });
  ed.addEventListener('compositionend', () => { S.composing = false; });
}

function onBeforeInput(e) {
  const t = e.inputType || '';
  if (t === 'historyUndo') { e.preventDefault(); undo(); return; }
  if (t === 'historyRedo') { e.preventDefault(); redo(); return; }
  if (S.readOnly) { e.preventDefault(); return; }
  if (Tables.onBeforeInput(e)) return;
  if (!Hist.timer && !Hist.before) Hist.before = saveSel();
  if ((S.avro || S.bijoy) && Avro.beforeInput(e)) return;
  if (S.track && Track.beforeInput(e)) return;
  if (t === 'insertParagraph' || t === 'insertLineBreak') AutoComplete.hide();
}

function onInput(e) {
  const t = e.inputType || '';
  histSoon();
  Saver.mark();
  const r = getRange();
  fixupAfterInput(t, r);
  // a note's mark deleted or typed over: the others are numbered again at once
  if (S.doc.footnotes && Object.keys(S.doc.footnotes).length) Notes.renumber();
  Layout.soon(r ? r.startContainer : null);
  Stats.soon();
  Nav.soon();
  if (t === 'insertText' || t === 'insertCompositionText') { AutoCorrect.onText(e); AutoComplete.check(); }
  else AutoComplete.hide();
  if (S.doc.comments.length) Comments.soonSync();
  // paragraphs added or joined: the Styles pane counts them again
  if (S.pane === 'styles' && !/^insert(Text|CompositionText)$/.test(t)) Styles.paneSoon();
}

/* Keep the document structurally valid after native edits */
function fixupAfterInput(t, r) {
  const ed = S.editor;
  if (!ed.firstChild || (ed.childNodes.length === 1 && ed.firstChild.nodeName === 'BR')) {
    ed.innerHTML = '<p><br></p>';
    caretAtStart(ed.firstChild);
    return;
  }
  // stray inline content at the top level goes into a paragraph
  let stray = null;
  for (let n = ed.firstChild; n;) {
    const next = n.nextSibling;
    if (n.nodeType === 3 && !/\S/.test(n.data) && !stray) { n.remove(); n = next; continue; }
    if (n.nodeType === 8) { n.remove(); n = next; continue; }
    const inline = n.nodeType === 3 ? n.data.length > 0 : (n.nodeType === 1 && !isBlockEl(n) && !n.classList.contains('toc') && !n.classList.contains('cols'));
    if (inline) {
      if (!stray) { stray = document.createElement('p'); ed.insertBefore(stray, n); }
      stray.appendChild(n);
    } else if (n.nodeType === 1 && n.tagName === 'DIV' && !n.classList.contains('toc') && !n.classList.contains('cols')) {
      const p = renameEl(n, 'P'); stray = null; void p;
    } else stray = null;
    n = next;
  }
  // zero-width caret spans that received real text
  ed.querySelectorAll('span.zw').forEach(sp => {
    const txt = sp.textContent;
    if (txt.length > 1 || (txt.length === 1 && txt !== '\u200B')) {
      const w = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) { let i; while ((i = n.data.indexOf('\u200B')) >= 0) n.deleteData(i, 1); }
      sp.classList.remove('zw');
      if (!sp.classList.length) sp.removeAttribute('class');
      if (!sp.attributes.length) unwrap(sp);
    }
  });
  if (t === 'insertParagraph' && r) {
    const b = blockOf(r.startContainer);
    if (b) {
      if (b.hasAttribute('data-pgp')) { b.removeAttribute('data-pgp'); b.style.removeProperty('--pgp'); }
      b.querySelectorAll('span.pg-line').forEach(x => x.remove());
      const prev = b.previousElementSibling;
      const blank = isBlank(b) || b.textContent === '';
      // Enter at the end of a paragraph: the new one has the style that follows (a heading: Normal)
      if (blank && prev && /^(P|H[1-6])$/.test(b.tagName) && /^(P|H[1-6])$/.test(prev.tagName)) {
        const nk = Styles.next(blockStyleKey(prev));
        if (nk !== blockStyleKey(b)) {
          const p = setBlockStyleOn(b, nk);
          p.innerHTML = '<br>';
          caretAtStart(p);
        }
      } else if (blank && (/^H[1-6]$/.test(b.tagName) || b.classList.contains('title') || b.classList.contains('subtitle'))) {
        const p = renameEl(b, 'P');
        p.removeAttribute('class');
        p.innerHTML = '<br>';
        caretAtStart(p);
      }
      if (prev && /^(UL|OL|TABLE)$/.test(prev.tagName) && b.tagName === 'P' && b.parentNode === ed) { /* fine */ }
    }
  }
  if (t.startsWith('delete')) {
    ed.querySelectorAll('span.qm').forEach(m => m.remove());
    if (r) { const b = blockOf(r.startContainer); if (b && !b.firstChild) b.appendChild(document.createElement('br')); }
    ed.querySelectorAll(':scope > ul:empty, :scope > ol:empty').forEach(l => l.remove());
  }
  const last = ed.lastElementChild;
  if (last && (last.tagName === 'TABLE' || last.classList.contains('toc') || (last.tagName === 'HR'))) ed.appendChild(h('p', null, h('br')));
}

function onSelectionChange() {
  if (S._selRaf) return;
  S._selRaf = requestAnimationFrame(() => {
    S._selRaf = 0;
    const r = getRange();
    if (r) lastRange = r.cloneRange();
    Proof.onSel(r || lastRange);
    if (!r) { MiniBar.hide(); LinkBubble.hide(); return; }
    Tables.onSelChange(r);
    // drop stray caret spans the caret has left
    S.editor.querySelectorAll('span.zw').forEach(sp => {
      if (sp.contains(r.startContainer)) return;
      if (sp.textContent.replace(/\u200B/g, '') === '' && !sp.querySelector('img')) { const p = sp.parentNode; sp.remove(); if (p && !p.firstChild) p.appendChild(document.createElement('br')); }
    });
    UI.refresh();
    Ruler.drawSoon();
    updatePageStatus();
    LinkBubble.check(r);
    Comments.syncActive(r);
    Stats.soonSel();
    if (r.collapsed && !Tables.active()) MiniBar.hide();
    if (S.selImg && !Images.wrapped(r)) Images.deselect();
    if (Avro.st && !Avro.valid(r)) Avro.commit();
    AutoComplete.onSel();
  });
}

function onEditorKeyDown(e) {
  if (AutoComplete.key(e)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (S.selImg && Images.key(e)) return;
  // Esc leaves the header, footer or note being edited
  if (e.key === 'Escape' && Story.cur && !Menu.el) {
    e.preventDefault();
    const o = Story.cur;
    Story.close();
    // out of a shape's text: the shape stays selected, as in Word
    if (o.type === 'shape' && o.shape.isConnected) Images.select(o.shape);
    return;
  }
  if (Tables.onKeyDown(e)) return;
  if (e.key === 'F11' && !mod && !e.altKey) { e.preventDefault(); Fields.next(e.shiftKey ? -1 : 1); return; }
  if (e.key === 'Tab' && !mod && !e.altKey && Fields.isSelected(getRange())) { e.preventDefault(); Fields.next(e.shiftKey ? -1 : 1); return; }
  if (e.key === 'Tab' && !mod && !e.altKey) {
    if (Tables.onTab(e)) return;
    e.preventDefault();
    if (inList()) { setIndent(e.shiftKey ? -1 : 1); return; }
    if (!e.shiftKey && !S.readOnly) { beginChange(); exec('insertText', '\t'); }
    return;
  }
  if (e.key === 'Escape') {
    if (S.painter) { Painter.stop(); e.preventDefault(); return; }
    MiniBar.hide();
    if (S.view === 'focus' || S.view === 'read') { setView('print'); e.preventDefault(); }
    return;
  }
  if (e.key === 'Enter' && mod && !e.shiftKey) { e.preventDefault(); insertPageBreak(); return; }
  if ((e.key === 'Backspace' || e.key === 'Delete') && !mod) skipPgLine(e.key === 'Backspace' ? -1 : 1);
  if ((e.key === 'Backspace' || e.key === 'Delete') && !e.altKey && joinPastFloats(e.key === 'Backspace' ? -1 : 1)) { e.preventDefault(); return; }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !mod) skipPgLine(e.key === 'ArrowLeft' ? -1 : 1, true);
  if (mod && e.shiftKey && (e.key === 'v' || e.key === 'V')) Paste.plainNext = true;
  if (e.key === 'Backspace' && !mod) {
    // backspace at the start of a list item outdents it, like Word
    const r = getRange();
    const li = inList();
    if (r && r.collapsed && li && atBlockStart(r.startContainer, r.startOffset, li) && !li.previousElementSibling && li.parentNode.parentNode === S.editor) {
      e.preventDefault();
      change(() => exec('outdent'));
      return;
    }
  }
}
/* Pictures and shapes in front of or behind the text, or wrapped at one side, belong to their
   paragraph rather than to its text, as in Word: Backspace and Delete pass over them. At the start
   of a paragraph's text Backspace joins it to the one before (Delete at the end of that one does
   the same) and they come along, staying where they are on the page; the browser would delete them.
   → true when done here (the key's own action is cancelled); false lets the key go ahead, perhaps
   with the caret moved past them. */
const WRAPPED_SEL = 'img.img-front, img.img-behind, img.img-left, img.img-right, img.img-center, span.shp.img-front, span.shp.img-behind, span.shp.img-left, span.shp.img-right, span.shp.img-center';
const isWrappedObj = n => !!n && n.nodeType === 1 && n.matches(WRAPPED_SEL);
const isVoidText = n => !!n && n.nodeType === 3 && !n.data.replace(/[\u200B\u2060]/g, '');
/* text (or an inline picture, a field…) in or under node n; line breaks and wrapped objects aside */
function hasText(n) {
  if (n.nodeType === 3) return !isVoidText(n);
  if (n.nodeType !== 1 || n.tagName === 'BR' || isWrappedObj(n)) return false;
  if (n.matches('img, span.shp, hr, table, [contenteditable="false"]')) return true;
  return leafNodes(n).some(hasText);
}
/* a paragraph's text, inline pictures and the like, in order; a wrapped object is one piece */
function leafNodes(b) {
  const out = [];
  const walk = n => {
    for (let k = n.firstChild; k; k = k.nextSibling) {
      if (k.nodeType === 3) out.push(k);
      else if (k.nodeType === 1) { if (!k.firstChild || k.matches('img, span.shp, br, hr, table, [contenteditable="false"]')) out.push(k); else walk(k); }
    }
  };
  walk(b);
  return out;
}
/* 'float' (a wrapped object), 'void' (nothing to see: an empty run, the closing line break) or 'real' */
function leafKind(n, last) {
  if (n.nodeType === 3) return n.data.replace(/[\u200B\u2060]/g, '') ? 'real' : 'void';
  if (isWrappedObj(n)) return 'float';
  if (n.tagName === 'BR') return last ? 'void' : 'real';
  if (n.matches('img, span.shp, hr, table, [contenteditable="false"]')) return 'real';
  return n.textContent.replace(/[\u200B\u2060]/g, '') ? 'real' : 'void';
}
/* the wrapped objects a paragraph starts with (before any of its text) */
function leadingFloats(b) {
  const ls = leafNodes(b), out = [];
  for (let i = 0; i < ls.length; i++) {
    const k = leafKind(ls[i], i === ls.length - 1);
    if (k === 'real') break;
    if (k === 'float') out.push(ls[i]);
  }
  return out;
}
/* the deepest last item of a list (or of a list item with lists in it) */
function lastListItem(el) {
  let li = el.tagName === 'LI' ? el : null, list = li ? null : el;
  for (;;) {
    if (li) { const subs = Array.from(li.children).filter(k => k.tagName === 'UL' || k.tagName === 'OL'); list = subs[subs.length - 1] || null; if (!list) return li; }
    const items = Array.from(list.children).filter(k => k.tagName === 'LI');
    if (!items.length) return li;
    li = items[items.length - 1];
  }
}
function joinPastFloats(dir) {
  if (S.readOnly || S.selImg) return false;
  const r = getRange();
  if (!r || !r.collapsed) return false;
  const b = blockOf(r.startContainer);
  if (!b || !/^(P|H[1-6]|LI)$/.test(b.tagName)) return false;
  const C = r.startContainer, O = r.startOffset;
  // the caret's own text on the key's side
  if (C.nodeType === 3 && (dir < 0 ? C.data.slice(0, O) : C.data.slice(O)).replace(/[\u200B\u2060]/g, '')) return false;
  const ls = leafNodes(b), before = document.createRange();
  before.setStart(b, 0); before.setEnd(C, O);
  const side = ls.filter(n => n !== C && (dir < 0 ? before.intersectsNode(n) : !before.intersectsNode(n)));
  if (dir < 0) side.reverse();
  const floats = [];
  let stop = null;
  for (const n of side) {
    const k = leafKind(n, n === ls[ls.length - 1]);
    if (k === 'real') { stop = n; break; }
    if (k === 'float') floats.push(n);
  }
  const caretAt = (n, after) => {
    const x = document.createRange();
    if (n.nodeType === 3) x.setStart(n, after ? n.length : 0); else if (after) x.setStartAfter(n); else x.setStartBefore(n);
    x.collapse(true);
    setRange(x);
  };
  if (stop) {
    // text beyond them: the caret steps over them and the key deletes that text as usual
    if (floats.length) caretAt(stop, dir < 0);
    return false;
  }
  if (dir < 0) {
    if (!floats.length) return false;
    // at the start of a list's first item: the list's own Backspace (it outdents)
    if (b.tagName === 'LI' && !b.previousElementSibling && b.parentNode.parentNode === S.editor) return false;
    const prev = b.previousElementSibling;
    if (b.tagName === 'LI') { if (prev && prev.tagName === 'LI') joinBlocks(lastListItem(prev), b); return true; }
    if (prev && /^(P|H[1-6])$/.test(prev.tagName)) joinBlocks(prev, b);
    else if (prev && (prev.tagName === 'UL' || prev.tagName === 'OL')) { const li = lastListItem(prev); if (li) joinBlocks(li, b); }
    else if (prev && prev.tagName === 'HR') change(() => prev.remove(), { full: true });
    // nothing to join to (the first paragraph, a table's): nothing happens, as in Word
    return true;
  }
  const next = b.nextElementSibling;
  if (next && leadingFloats(next).length) {
    if (b.tagName === 'LI' ? next.tagName === 'LI' && lastListItem(b) === b : /^(P|H[1-6])$/.test(next.tagName)) joinBlocks(b, next);
    return true;
  }
  if (floats.length) caretAt(floats[floats.length - 1], true);
  return false;
}
/* paragraph c's text goes to the end of a; its wrapped objects to the start of a, after a's own */
function joinBlocks(a, c) {
  change(() => {
    const z = S.zoom || 1, ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
    // in front of / behind the text: placed from their paragraph's box, so moved by the difference
    const dx = (rc.left - ra.left) / z + c.clientLeft - a.clientLeft, dy = (rc.top - ra.top) / z + c.clientTop - a.clientTop;
    c.querySelectorAll('img.img-front, img.img-behind, span.shp.img-front, span.shp.img-behind').forEach(f => {
      f.style.left = round1((parseFloat(f.style.left) || 0) + dx) + 'px';
      f.style.top = round1((parseFloat(f.style.top) || 0) + dy) + 'px';
    });
    const lead = leadingFloats(c);
    lead.forEach(f => f.remove());
    const kids = Array.from(c.childNodes);
    let join = null;
    if (kids.some(hasText)) {
      // a's closing line break goes when text follows it
      const lastA = Array.from(a.childNodes).filter(n => !isVoidText(n)).pop();
      if (lastA && lastA.nodeType === 1 && lastA.tagName === 'BR') lastA.remove();
      join = kids[0];
      kids.forEach(n => a.appendChild(n));
    }
    let ref = a.firstChild;
    while (ref && (isWrappedObj(ref) || isVoidText(ref))) ref = ref.nextSibling;
    lead.forEach(f => a.insertBefore(f, ref));
    c.remove();
    PicEdit.keepLine(a);
    const x = document.createRange();
    if (join) { if (join.nodeType === 3) x.setStart(join, 0); else x.setStartBefore(join); }
    else {
      // the end of a's text (before its closing line break)
      const last = Array.from(a.childNodes).filter(n => !isWrappedObj(n) && !isVoidText(n)).pop();
      if (!last) x.setStart(a, a.childNodes.length);
      else if (last.nodeType === 1 && last.tagName === 'BR') x.setStartBefore(last);
      else if (last.nodeType === 3) x.setStart(last, last.length);
      else x.setStartAfter(last);
    }
    x.collapse(true);
    setRange(x);
  }, { full: true });
}
/* The inline page-split spacer must never trap the caret or swallow a keystroke */
function skipPgLine(dir, move) {
  const r = getRange();
  if (!r || !r.collapsed) return;
  let c = r.startContainer, o = r.startOffset;
  let adj = null;
  if (c.nodeType === 3) {
    if (dir < 0 && o === 0) adj = c.previousSibling;
    if (dir > 0 && o === c.length) adj = c.nextSibling;
  } else adj = dir < 0 ? c.childNodes[o - 1] : c.childNodes[o];
  if (adj && adj.nodeType === 1 && adj.classList.contains('pg-line')) {
    if (move) { const nr = document.createRange(); if (dir < 0) nr.setStartBefore(adj); else nr.setStartAfter(adj); nr.collapse(true); setRange(nr); }
    else adj.remove();
  }
}

function onCopy(e) {
  // selected table cells: a table of just those cells, and tab-separated text
  if (Tables.active() && e.clipboardData) {
    e.preventDefault();
    Tables.copyCells(e.clipboardData);
    if (e.type === 'cut' && !S.readOnly) Tables.clearContents();
    return;
  }
  const r = getRange();
  if (!r || r.collapsed || !e.clipboardData) return;
  const frag = r.cloneContents();
  const box = document.createElement('div');
  box.appendChild(frag);
  box.querySelectorAll('tr.pg-spacer, span.pg-line, span.qm').forEach(n => n.remove());
  box.querySelectorAll('[data-pgp]').forEach(n => { n.removeAttribute('data-pgp'); n.style.removeProperty('--pgp'); });
  box.querySelectorAll('[data-sx]').forEach(n => { n.removeAttribute('data-sx'); ['--sxl', '--sxr', '--sxw'].forEach(k => n.style.removeProperty(k)); });
  box.querySelectorAll('[data-lh], [data-gp], [data-gs]').forEach(n => { n.removeAttribute('data-lh'); n.removeAttribute('data-gp'); n.removeAttribute('data-gs'); });
  box.querySelectorAll('.cmt').forEach(n => unwrap(n));
  Notes.stash(box);
  // marked as Folio's own, so pasting it here keeps what only Folio knows (its shapes)
  e.clipboardData.setData('text/html', '<meta name="folio-copy" content="1">' + box.innerHTML.replace(/\u200B/g, ''));
  e.clipboardData.setData('text/plain', r.toString().replace(/\u200B/g, ''));
  e.preventDefault();
  if (e.type !== 'cut' || S.readOnly) return;
  // a picture or shape selected: it goes, and only it (the browser's delete can miss one that
  // isn't in the line, and join paragraphs or take a letter instead)
  if (S.selImg && Images.wrapped(r)) Images.remove();
  else change(() => exec('delete'));
}

function onPaste(e) {
  if (S.readOnly) { e.preventDefault(); return; }
  const dt = e.clipboardData;
  if (!dt) return;
  e.preventDefault();
  const html = dt.getData('text/html');
  const text = dt.getData('text/plain');
  const files = Array.from(dt.files || []).filter(f => /^image\//.test(f.type));
  if (files.length && (!html || /^\s*<img[^>]*>\s*$/i.test(html.replace(/<\/?(html|body|meta)[^>]*>/gi, '').trim()) || !text)) { Images.insertFiles(files); return; }
  const mode = Paste.plainNext ? 'text' : Paste.mode;
  Paste.plainNext = false;
  Paste.last = { html, text };
  Paste.noBijoy = false;
  doPaste(mode, html, text, true);
}
function doPaste(mode, html, text, showChip, opts = {}) {
  if (Hist.timer) histRecord();
  Hist.before = saveSel();
  Paste.beforeIdx = Hist.idx;
  Bijoy.pasted = 0;
  const bj = !opts.noBijoy && Bijoy.auto();
  // Bijoy text (SutonnyMJ) comes in as Unicode: known by its font, or by its codes in plain text
  if (bj && (mode === 'text' || !html)) {
    const t2 = html ? Bijoy.textFromHtml(html) : null;
    if (t2 != null) { text = t2; Bijoy.pasted = 1; }
    else if (bijoyScore(text).bijoy) { text = bijoyToUnicode(text); Bijoy.pasted = 1; }
  }
  change(() => {
    // into a table: copied cells fill the cells one by one
    if (!opts.drop && Tables.pasteCells(mode, html, text, { noBijoy: !bj })) return;
    if (Tables.active()) Tables.clearSel();
    let frag = (mode === 'text' || !html) ? textToFragment(text || '') : sanitizeHtml(html, { mode, noBijoy: !bj });
    if (/data-folio-cells/.test(html || '') || Tables.cellAtCaret()) frag = unwrapLoneCell(frag);
    if (S.track) Track.markFragment(frag);
    // a note's mark can't go in a header or a note; elsewhere it brings its note
    if (Story.cur && frag.querySelectorAll) frag.querySelectorAll('sup.fn[data-fn]').forEach(r => r.replaceWith(h('sup', null, r.textContent)));
    // nor a section break
    if (Story.cur && frag.querySelectorAll) frag.querySelectorAll('hr.sb').forEach(x => x.remove());
    insertFragment(frag);
    if (!Story.cur) { Notes.adopt(); Sections.adopt(); }
  }, { full: true });
  ensureDocFonts();
  if (showChip) PasteChip.show();
  if (Bijoy.pasted) Bijoy.afterPaste(mode);
}
/* one copied cell brings its contents, not a table of one cell */
function unwrapLoneCell(frag) {
  const kids = Array.from(frag.childNodes).filter(n => !(n.nodeType === 3 && !n.data.trim()) && !(n.nodeType === 1 && n.tagName === 'P' && isBlank(n)));
  if (kids.length !== 1 || kids[0].nodeName !== 'TABLE') return frag;
  const cells = kids[0].querySelectorAll('td, th');
  if (cells.length !== 1) return frag;
  const out = document.createDocumentFragment();
  while (cells[0].firstChild) out.appendChild(cells[0].firstChild);
  return out;
}
function textToFragment(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  if (lines.length === 1) { frag.appendChild(document.createTextNode(lines[0])); return frag; }
  for (const ln of lines) frag.appendChild(ln ? h('p', null, ln) : h('p', null, h('br')));
  return frag;
}
/* Insert a fragment at the caret, splitting and merging paragraphs the way Word does */
function insertFragment(frag) {
  focusEditor();
  let r = getRange();
  if (!r) return;
  if (!r.collapsed) {
    const img = S.selImg && Images.wrapped(r) ? S.selImg : null;
    if (img) {
      // a selected picture or shape is replaced by what is put in (the browser's delete can miss it)
      r = document.createRange(); r.setStartBefore(img); r.collapse(true);
      Images.deselect();
      img.remove();
      setRange(r);
    } else { exec('delete'); r = getRange(); if (!r) return; }
  }
  const kids = Array.from(frag.childNodes);
  if (!kids.length) return;
  const hasBlocks = kids.some(n => isBlockEl(n));
  if (!hasBlocks) {
    const last = frag.lastChild;
    // put text into an empty block correctly
    const b = blockOf(r.startContainer);
    if (b && b.childNodes.length === 1 && b.firstChild.nodeName === 'BR') { b.innerHTML = ''; b.appendChild(frag); }
    else r.insertNode(frag);
    const nr = document.createRange();
    if (last.nodeType === 3) nr.setStart(last, last.length); else nr.setStartAfter(last);
    nr.collapse(true);
    setRange(nr);
    return;
  }
  let leaf = blockOf(r.startContainer);
  if (leaf && /^(TD|TH|LI)$/.test(leaf.tagName) && !leaf.querySelector(':scope > p, :scope > h1, :scope > h2, :scope > h3')) {
    if (leaf.tagName === 'LI') {
      // list item: each pasted paragraph becomes an item
      const items = [];
      for (const n of kids) {
        if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) items.push(...Array.from(n.children).filter(x => x.tagName === 'LI'));
        else if (n.nodeType === 1 && isBlockEl(n) && n.tagName !== 'TABLE') { const li = document.createElement('li'); while (n.firstChild) li.appendChild(n.firstChild); items.push(li); }
        else if (n.nodeType === 1 && n.tagName === 'TABLE') { topBlockOf(leaf).after(n); }
        else { const li = document.createElement('li'); li.appendChild(n); items.push(li); }
      }
      if (!items.length) return;
      const after = splitBlockAt(leaf, r);
      const first = items.shift();
      if (isBlank(leaf)) leaf.innerHTML = '';
      while (first.firstChild) leaf.appendChild(first.firstChild);
      leaf.after(...items, after);
      const lastLi = items.length ? items[items.length - 1] : leaf;
      if (isBlank(after)) { after.remove(); caretAtEnd(lastLi); }
      else { const mk = h('span', { class: 'qm', 'data-q': 'e' }); lastLi.appendChild(mk); while (after.firstChild) lastLi.appendChild(after.firstChild); after.remove(); restoreFromMarkers(); }
      return;
    }
    // table cell with loose content: wrap it in a paragraph first
    const p = document.createElement('p');
    while (leaf.firstChild) p.appendChild(leaf.firstChild);
    leaf.appendChild(p);
    r = getRange() || r;
    leaf = p;
  }
  if (!leaf || !/^(P|H[1-6]|PRE)$/.test(leaf.tagName)) {
    const top = topBlockOf(r.startContainer);
    if (top) { top.after(...kids); caretAtEnd(kids[kids.length - 1]); }
    return;
  }
  const before = leaf;
  const after = splitBlockAt(leaf, r);
  before.after(...kids);
  const first = kids[0], last = kids[kids.length - 1];
  const beforeBlank = isBlank(before) || (before.childNodes.length === 1 && before.firstChild.nodeName === 'BR');
  if (first.nodeType === 1 && first.tagName === 'P' && !first.className && !beforeBlank && before.tagName === 'P') {
    if (before.lastChild && before.lastChild.nodeName === 'BR') before.lastChild.remove();
    while (first.firstChild) before.appendChild(first.firstChild);
    first.remove();
  } else if (beforeBlank) before.remove();
  const lastEl = last.isConnected ? last : before;
  const afterBlank = isBlank(after) || (after.childNodes.length === 1 && after.firstChild.nodeName === 'BR');
  const mk = h('span', { class: 'qm', 'data-q': 'e' });
  if (!afterBlank && lastEl.nodeType === 1 && /^(P|H[1-6])$/.test(lastEl.tagName)) {
    if (lastEl.lastChild && lastEl.lastChild.nodeName === 'BR') lastEl.lastChild.remove();
    lastEl.appendChild(mk);
    while (after.firstChild) lastEl.appendChild(after.firstChild);
    after.remove();
  } else if (afterBlank && lastEl.nodeType === 1 && /^(P|H[1-6])$/.test(lastEl.tagName)) {
    lastEl.appendChild(mk);
    after.remove();
  } else {
    if (afterBlank) after.innerHTML = '<br>';
    after.insertBefore(mk, after.firstChild);
  }
  restoreFromMarkers();
  fixupAfterInput('', getRange());
}

function onDrop(e) {
  const dt = e.dataTransfer;
  if (!dt) return;
  const files = Array.from(dt.files || []);
  if (S.dragInside && !files.length) { S.dragInside = false; Layout.soon(); setTimeout(() => { histRecord(); Saver.mark(); }, 0); return; }
  e.preventDefault();
  if (S.readOnly) return;
  const pos = caretFromPoint(e.clientX, e.clientY);
  if (pos) caretAt(pos.node, pos.offset);
  if (files.length) {
    const imgs = files.filter(f => /^image\//.test(f.type));
    const docs = files.filter(f => /\.(docx|html?|txt|md|markdown)$/i.test(f.name));
    if (imgs.length) Images.insertFiles(imgs);
    if (docs.length) Files.openFiles(docs);
    return;
  }
  const html = dt.getData('text/html'), text = dt.getData('text/plain');
  if (html || text) doPaste(Paste.mode, html, text, false, { drop: true });
}
function caretFromPoint(x, y) {
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) return { node: p.offsetNode, offset: p.offset }; }
  if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) return { node: r.startContainer, offset: r.startOffset }; }
  return null;
}

function onEditorMouseDown(e) {
  // while a header or footer is open, the page's text only answers a double-click (which closes
  // it); a click in the text leaves a note and goes on as usual
  if (Story.cur && !Story.cur.el.contains(e.target)) {
    if (Story.cur.type === 'hf') { if (e.button === 0) e.preventDefault(); return; }
    Story.close();
  }
  if (e.button === 2) { CtxMenu.onRightDown(e); return; }
  if (e.button !== 0) return;
  const img = e.target.closest && e.target.closest('img, span.shp');
  if (img && S.editor.contains(img)) {
    e.preventDefault();
    // a text box's text takes a click away from its edge; elsewhere the picture or shape is selected
    if (Shapes.is(img) && Shapes.clickEdits(img, e)) { Shapes.edit(img, { x: e.clientX, y: e.clientY }); return; }
    Images.select(img);
    if (PicEdit.floating(img) && !(Date.now() - (PicEdit._touchAt || 0) < 800)) PicEdit.startMove(e, img);
    return;
  }
  if (S.selImg) Images.deselect();
  Tables.onMouseDown(e);
  const li = e.target.closest && e.target.closest('ul.checklist > li');
  if (li && !S.readOnly) {
    const rect = li.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(li).paddingLeft) * S.zoom;
    if (e.clientX - rect.left < pad) {
      e.preventDefault();
      change(() => li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true'), { node: li });
      return;
    }
  }
  const te = e.target.closest && e.target.closest('.toc .te');
  if (te) { e.preventDefault(); Toc.go(te); return; }
}
function onEditorMouseUp(e) {
  if (S.painter) { setTimeout(() => Painter.apply(), 0); return; }
  // (not over a selected picture or shape: its handles stay free)
  setTimeout(() => { const r = getRange(); if (r && !r.collapsed && Prefs.miniToolbar && !S.readOnly && !S.selImg) MiniBar.show(r); }, 10);
}
function onEditorClick(e) {
  const a = e.target.closest && e.target.closest('a[href]');
  if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openLink(a.getAttribute('href')); return; }
  Fields.onClick(e);
}
/* a click on a footnote or endnote under the page's text opens it (as in Word, one click) */
function onNoteDown(e) {
  if (e.button !== 0 || S.view !== 'print') return;
  const cur = Story.cur;
  if (cur && (cur.type === 'hf' || cur.el.contains(e.target))) return;
  const id = Notes.hit(e.clientX, e.clientY);
  if (!id) return;
  e.preventDefault(); e.stopPropagation();
  Notes.edit(id, { x: e.clientX, y: e.clientY });
}
function onEditorDblClick(e) {
  if (S.view !== 'print') return;
  const t = e.target;
  // a shape: its text
  const shp = t.closest && t.closest('span.shp');
  if (shp && docBody().contains(shp) && !Shapes.isLine(shp)) { e.preventDefault(); Shapes.edit(shp, { x: e.clientX, y: e.clientY }); return; }
  // a note's mark in the text opens the note; the number in an open note goes back to its mark
  if (Story.cur && Story.cur.type === 'note' && t.closest && t.closest('sup.fnn')) { e.preventDefault(); Notes.goRef(Story.cur.id); return; }
  const ref = !Story.cur && t.closest && t.closest('sup.fn[data-fn]');
  if (ref && S.editor.contains(ref)) { e.preventDefault(); Notes.edit(ref.dataset.fn); return; }
  if (Story.cur) {
    if (!Story.cur.el.contains(t) && !t.closest('.img-frame, .crop-ui')) {
      const hit = HF.hit(e.clientX, e.clientY);
      e.preventDefault();
      if (hit) HF.edit(hit.kind, hit.p); else Story.close();
    }
    return;
  }
  // the page's top or bottom margin (where the text never goes): its header or footer, as Word
  const hit = HF.hit(e.clientX, e.clientY);
  if (!hit || t.closest('img, span.shp, .img-frame, .crop-ui, .shp-live')) return;
  e.preventDefault();
  HF.edit(hit.kind, hit.p);
}
function openLink(href) {
  if (!href) return;
  if (href.startsWith('#')) { const t = S.editor.querySelector(href.replace(/[^#\w-]/g, '')); if (t) { t.scrollIntoView({ block: 'center' }); caretAtStart(t); } return; }
  const a = h('a', { href, target: '_blank', rel: 'noopener noreferrer' });
  document.body.append(a); a.click(); a.remove();
}
function scrollCaretIntoView() {
  const c = $('#canvas');
  const rect = caretRect();
  if (!rect || !c) return;
  const cr = c.getBoundingClientRect();
  if (rect.top < cr.top + 30) c.scrollTop -= (cr.top + 60 - rect.top);
  else if (rect.bottom > cr.bottom - 30) c.scrollTop += (rect.bottom - cr.bottom + 80);
}

/* Remove formatting whitespace between blocks (it would show as blank lines under pre-wrap) */
function stripBlockWhitespace(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
  const kill = [];
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 8) { kill.push(n); continue; }
    if (/[^\t\n\r ]/.test(n.data)) continue;
    const p = n.parentNode;
    if (!p) continue;
    const structural = p === root || /^(UL|OL|TABLE|TBODY|THEAD|TFOOT|TR|COLGROUP)$/.test(p.tagName);
    const between = (!n.previousSibling || isBlockEl(n.previousSibling)) && (!n.nextSibling || isBlockEl(n.nextSibling));
    if (structural || (between && /^(DIV|BLOCKQUOTE|TD|TH|LI)$/.test(p.tagName))) kill.push(n);
    else if (/\n/.test(n.data) && between) kill.push(n);
  }
  kill.forEach(k => k.remove());
}
/* Called after any command that changed the document */
function afterChange(node, opts = {}) {
  Saver.mark();
  Fields.soon();
  Styles.paneSoon();
  Layout.soon(opts && opts.full ? null : (node || (getRange() ? getRange().startContainer : null)));
  Stats.soon();
  Nav.soon();
  Comments.soonSync();
  if (Proof.shown()) Proof.renderSoon();
  UI.refresh();
  updateUndoButtons();
}
/* Called after the editor HTML was replaced wholesale (load, undo) */
function afterContentReplaced(metaChanged) {
  if (!S.editor.firstChild) S.editor.innerHTML = '<p><br></p>';
  Fields.soon();
  Styles.paneSoon();
  fixupAfterInput('', null);
  if (metaChanged) applyDocSettings();
  Layout.full();
  Stats.soon();
  Nav.soon();
  Comments.render();
  if (Proof.shown()) Proof.renderSoon();
  UI.refresh();
}
