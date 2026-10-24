/* ===================== Right-click menu =====================
   Word's context menu. What was right-clicked decides the commands: text, table cells (with
   Insert, Delete, Select, Cell Alignment and AutoFit submenus), a picture, a link, a tracked
   change, a comment, a field. A right-click inside the selection (text or cells) keeps it;
   elsewhere it moves the caret there first, as Word does. Shift+right-click gives the
   browser's own menu instead, which has the spelling suggestions.
   Submenus open on hover or with the arrow keys; Esc closes, Enter runs. */
const CtxMenu = {
  panels: [],   // [0] the menu, then its open submenus
  hoverTimer: 0,

  /* ---------- opening ---------- */
  onRightDown(e) {
    LinkBubble.hide(); PasteChip.hide(); MiniBar.hide();
    // a right-click inside selected cells, or on a picture, keeps that selection
    if (Tables.active()) {
      const c = Tables.cellIn(Tables.sel.table, e.target);
      if (c && Tables.selectedCells().includes(c)) { e.preventDefault(); return; }
    }
    const img = e.target.closest && e.target.closest('img, span.shp');
    if (img && S.editor.contains(img)) { e.preventDefault(); if (Story.cur && Story.cur.type === 'shape') Story.close(); Images.select(img); }
  },
  onContext(e) {
    if (e.shiftKey || !S.editor) return;   // the browser's own menu (spelling suggestions)
    // a long press on a phone or tablet keeps the system's own copy and paste bar
    if (e.pointerType === 'touch' || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) return;
    let target = e.target;
    if (!S.editor.contains(target)) {
      // one of Folio's floating bubbles over the page (a link, the paste options) doesn't
      // get in the way: the menu is for the document under it
      if (!(target.closest && target.closest('#floatRoot'))) return;
      const under = document.elementsFromPoint(e.clientX, e.clientY).find(el => S.editor.contains(el));
      if (!under) return;
      target = under;
      LinkBubble.hide(); PasteChip.hide(); MiniBar.hide();
    }
    e.preventDefault();
    const kb = !e.clientX && !e.clientY;   // the Menu key or Shift+F10
    let x = e.clientX, y = e.clientY;
    if (kb) { const r = caretRect(); if (r) { x = r.left; y = r.bottom + 2; } }
    else this.placeCaret(e, target);
    MiniBar.hide();
    UI.refreshNow();
    this.show(this.items(target), x, y);
  },
  /* Word: a right-click outside the selection moves the caret to the click */
  placeCaret(e, target) {
    if (Tables.active()) {
      const c = Tables.cellIn(Tables.sel.table, target);
      if (c && Tables.selectedCells().includes(c)) return;
    }
    const img = target.closest && target.closest('img, span.shp');
    if (img && S.editor.contains(img)) { if (S.selImg !== img) Images.select(img); return; }
    if (S.selImg) Images.deselect();
    const pos = caretFromPoint(e.clientX, e.clientY);
    if (!pos || !S.editor.contains(pos.node)) return;
    const r = getRange();
    if (r && !r.collapsed) { try { if (r.isPointInRange(pos.node, pos.offset)) return; } catch { } }
    if (Tables.active()) Tables.clearSel();
    caretAt(pos.node, pos.offset);
  },

  /* ---------- what is on offer ---------- */
  items(target) {
    const el = target && (target.nodeType === 1 ? target : target.parentElement) || S.editor;
    const ro = S.readOnly;
    const r = getRange() || lastRange;
    const img = S.selImg;
    const cells = Tables.active();
    const cell = cells ? Tables.corner('start') : Tables.cellAtCaret();
    const hasSel = cells || !!img || !!(r && !r.collapsed);
    const link = !img && el.closest('a[href]');
    const out = [
      { label: 'Cut', icon: 'cut', sc: `${MOD}+X`, disabled: !hasSel || ro, onClick: () => img ? this.imgClip('cut') : CMD.cut() },
      { label: 'Copy', icon: 'copy', sc: `${MOD}+C`, disabled: !hasSel, onClick: () => img ? this.imgClip('copy') : CMD.copy() },
      { label: 'Paste', icon: 'paste', sc: `${MOD}+V`, disabled: ro, onClick: () => this.paste(Paste.mode) },
      { label: 'Paste Options', icon: 'paste', disabled: ro, sub: [
        { label: 'Keep Source Formatting', onClick: () => this.paste('keep') },
        { label: 'Match This Document', onClick: () => this.paste('merge') },
        { label: 'Keep Text Only', sc: `${MOD}+Shift+V`, onClick: () => this.paste('text') },
      ] },
      '-',
    ];
    if (img && Shapes.is(img)) {
      const line = Shapes.isLine(img);
      if (!line) out.push({ label: 'Edit Text', icon: 'edit', disabled: ro, onClick: () => Shapes.edit(img) });
      out.push(
        { label: 'Wrap Text', icon: 'wrapFront', disabled: ro, sub: [['inline', 'In Line with Text', 'wrapInline'], ['left', 'Square, shape on the left', 'wrapLeft'], ['right', 'Square, shape on the right', 'wrapRight'], ['center', 'Top and Bottom, centered', 'wrapTop'], ['behind', 'Behind Text', 'wrapBehind'], ['front', 'In Front of Text', 'wrapFront']].map(([v, l, ic]) => ({ label: l, icon: ic, checked: Images.wrapMode() === v, onClick: () => Images.setWrap(v) })) },
        { label: 'Rotate', icon: 'rotateRight', disabled: ro, sub: [{ label: 'Rotate Right 90°', icon: 'rotateRight', onClick: () => Shapes.rotate(90) }, { label: 'Rotate Left 90°', icon: 'rotateLeft', onClick: () => Shapes.rotate(-90) }, { label: 'Flip Vertical', icon: 'flipV', onClick: () => Shapes.flip('v') }, { label: 'Flip Horizontal', icon: 'flipH', onClick: () => Shapes.flip('h') }] },
        { label: line ? 'Format Line…' : 'Format Shape…', icon: 'shapeStyle', disabled: ro, onClick: () => Shapes.dialog() },
        { label: line ? 'Delete Line' : 'Delete Shape', icon: 'trash', sc: 'Del', disabled: ro, onClick: () => Images.remove() },
        '-');
    } else if (img) {
      out.push(
        { label: 'Change Picture…', icon: 'replaceImg', disabled: ro, onClick: () => CMD.replaceImg() },
        { label: 'Wrap Text', icon: 'wrapLeft', disabled: ro, sub: [['inline', 'In Line with Text', 'wrapInline'], ['left', 'Square, picture on the left', 'wrapLeft'], ['right', 'Square, picture on the right', 'wrapRight'], ['center', 'Top and Bottom, centered', 'wrapTop']].map(([v, l, ic]) => ({ label: l, icon: ic, checked: Images.wrapMode() === v, onClick: () => Images.setWrap(v) })) },
        { label: 'Reset Size', icon: 'resetSize', disabled: ro, onClick: () => CMD.resetSize() },
        { label: 'Picture Border', icon: 'imgBorder', disabled: ro, checked: img.classList.contains('img-border'), onClick: () => CMD.imgBorder() },
        { label: 'Alt Text…', icon: 'alt', onClick: () => CMD.altText() },
        { label: 'Delete Picture', icon: 'trash', sc: 'Del', disabled: ro, onClick: () => CMD.deleteImg() },
        '-');
    }
    if (cell && !img) out.push(...this.tableItems(cell, cells, ro), '-');
    if (!img) {
      out.push(
        { label: 'Font…', icon: 'case', sc: `${MOD}+D`, onClick: () => Dialogs.font() },
        { label: 'Paragraph…', icon: 'pilcrow', onClick: () => Dialogs.paragraph() });
      const li = el.closest('li') || (r && blockOf(r.startContainer) && blockOf(r.startContainer).closest('li'));
      if (li && li.parentElement && li.parentElement.tagName === 'OL' && !ro) out.push(
        { label: 'Restart at 1', icon: 'numbering', onClick: () => setListStart(1) },
        { label: 'Set Numbering Value…', icon: 'numbering', onClick: () => Dialogs.listStart() });
      out.push('-');
    }
    if (link) {
      const href = link.getAttribute('href');
      out.push(
        { label: 'Edit Link…', icon: 'link', disabled: ro, onClick: () => { selectNodeContents(link); Dialogs.link(); } },
        { label: 'Open Link', icon: 'globe', onClick: () => openLink(href) },
        { label: 'Copy Link', icon: 'copy', onClick: () => this.copyText(href, 'Link copied.') },
        { label: 'Remove Link', icon: 'unlink', disabled: ro, onClick: () => change(() => unwrap(link)) });
    } else if (!img) out.push({ label: 'Link…', icon: 'link', sc: `${MOD}+K`, disabled: ro, onClick: () => Dialogs.link() });
    out.push({ label: 'New Comment', icon: 'commentAdd', sc: `${MOD}+Alt+M`, disabled: ro, onClick: () => Comments.add() });
    const cm = el.closest('span.cmt');
    if (cm && cm.getAttribute('data-cid')) {
      const id = cm.getAttribute('data-cid');
      out.push({ label: 'Show Comment', icon: 'comment', onClick: () => Comments.go(id) }, { label: 'Delete Comment', icon: 'trash', disabled: ro, onClick: () => Comments.remove(id) });
    }
    const tc = el.closest('ins.tc, del.tc');
    const pf = tc && tc.getAttribute('data-pf');
    if (tc && !ro && pf) out.push('-',
      { label: 'Accept Claude’s Fix', icon: 'accept', onClick: () => Proof.decide(pf, true) },
      { label: 'Reject Claude’s Fix', icon: 'reject', onClick: () => Proof.decide(pf, false) },
      ...(tc.title ? [{ note: tc.title }] : []));
    else if (tc && !ro) out.push('-',
      { label: tc.tagName === 'INS' ? 'Accept Insertion' : 'Accept Deletion', icon: 'accept', onClick: () => change(() => Track.accept(tc), { full: true }) },
      { label: tc.tagName === 'INS' ? 'Reject Insertion' : 'Reject Deletion', icon: 'reject', onClick: () => change(() => Track.reject(tc), { full: true }) });
    // a footnote or endnote: its mark in the text, or the note being edited
    const ref = el.closest('sup.fn[data-fn]');
    const nid = ref ? ref.dataset.fn : (Story.cur && Story.cur.type === 'note' ? Story.cur.id : null);
    if (nid && Notes.all()[nid]) {
      const end = Notes.all()[nid].kind === 'end', name = end ? 'Endnote' : 'Footnote';
      out.push('-',
        ref ? { label: 'Go to ' + name, icon: 'notes', onClick: () => Notes.edit(nid) } : { label: 'Go to ' + name + ' Reference', icon: 'notes', onClick: () => Notes.goRef(nid) },
        { label: end ? 'Convert to Footnote' : 'Convert to Endnote', icon: end ? 'footnote' : 'endnote', disabled: ro, onClick: () => Notes.convert(end ? 'foot' : 'end', [nid]) },
        { label: 'Delete ' + name, icon: 'trash', disabled: ro, onClick: () => Notes.remove(nid) },
        { label: 'Note Options…', icon: 'launcher', onClick: () => Notes.dialog() });
    }
    if (r && Fields.at(r)) out.push('-',
      { label: 'Fill Fields…', icon: 'field', onClick: () => { if (S.pane !== 'fields') CMD.fillFields(); } },
      { label: 'Next Field', icon: 'nextField', sc: 'F11', onClick: () => Fields.next(1) });
    out.push('-', { note: 'Shift+right-click: the browser’s menu, with spelling suggestions' });
    // no double separators
    return out.filter((it, i, a) => !(it === '-' && (i === 0 || a[i - 1] === '-')));
  },
  tableItems(cell, cells, ro) {
    const n = Tables.selectedCells().length;
    const fit = Tables.fitMode(cell.closest('table'));
    return [
      { label: 'Insert', icon: 'rowBelow', disabled: ro, sub: [
        { label: 'Insert Rows Above', icon: 'rowAbove', onClick: () => CMD.rowAbove() },
        { label: 'Insert Rows Below', icon: 'rowBelow', onClick: () => CMD.rowBelow() },
        { label: 'Insert Columns to the Left', icon: 'colLeft', onClick: () => CMD.colLeft() },
        { label: 'Insert Columns to the Right', icon: 'colRight', onClick: () => CMD.colRight() },
        '-',
        { label: 'Insert Cells…', icon: 'insertCells', onClick: () => CMD.insertCells() },
      ] },
      { label: 'Delete', icon: 'delTable', disabled: ro, sub: [
        { label: 'Delete Cells…', icon: 'insertCells', onClick: () => CMD.deleteCells() },
        { label: 'Delete Rows', icon: 'delRow', onClick: () => CMD.delRow() },
        { label: 'Delete Columns', icon: 'delCol', onClick: () => CMD.delCol() },
        { label: 'Delete Table', icon: 'delTable', onClick: () => CMD.delTable() },
      ] },
      n > 1 ? { label: 'Merge Cells', icon: 'merge', disabled: ro, onClick: () => CMD.merge() } : null,
      { label: 'Split Cells…', icon: 'split', disabled: ro, onClick: () => CMD.split() },
      { label: 'Select', icon: 'selectTable', sub: [
        { label: 'Select Cell', icon: 'select', onClick: () => Tables.selectPart('cell') },
        { label: 'Select Column', icon: 'distCols', onClick: () => Tables.selectPart('col') },
        { label: 'Select Row', icon: 'distRows', onClick: () => Tables.selectPart('row') },
        { label: 'Select Table', icon: 'table', onClick: () => Tables.selectPart('table') },
      ] },
      { label: 'Cell Alignment', icon: 'vMid', disabled: ro, sub: [
        { el: this.alignGrid(cell) },
        '-',
        { label: 'Numbers on the Decimal Point', icon: 'alignDecimal', checked: curAlign() === 'decimal', onClick: () => this.cellAlign(null, 'decimal') },
      ] },
      { label: 'AutoFit', icon: 'autofit', disabled: ro, sub: [
        { label: 'AutoFit Contents', icon: 'fitContents', checked: fit === 'contents', onClick: () => Tables.autofit('contents') },
        { label: 'AutoFit Window', icon: 'fitWindow', checked: fit === 'window', onClick: () => Tables.autofit('window') },
        { label: 'Fixed Column Width', icon: 'fitFixed', checked: fit === 'fixed', onClick: () => Tables.autofit('fixed') },
        '-',
        { label: 'Distribute Rows Evenly', icon: 'distRows', onClick: () => CMD.distributeRows() },
        { label: 'Distribute Columns Evenly', icon: 'distCols', onClick: () => CMD.distribute() },
      ] },
      { label: 'Borders and Shading…', icon: 'borders', disabled: ro, onClick: () => CMD.bordersShading() },
    ].filter(Boolean);
  },
  /* Word's Cell Alignment: nine buttons, top/center/bottom by left/center/right */
  alignGrid(cell) {
    const p = cell.querySelector(CELL_BLOCKS) || cell;
    const curV = cell.style.verticalAlign || 'top';
    const curH = p.getAttribute('data-align') === 'decimal' ? 'decimal' : ({ center: 'center', right: 'right', end: 'right', justify: 'justify' })[getComputedStyle(p).textAlign] || 'left';
    const grid = h('div', { class: 'cellgrid', role: 'group', 'aria-label': 'Cell alignment' });
    // each button: a cell outline with a long and a short line where the text would sit
    const V = [['top', 'Top', 6], ['middle', 'Center', 10.5], ['bottom', 'Bottom', 15]];
    const H = [['left', 'Left', 5, 5], ['center', 'Center', 7, 9], ['right', 'Right', 9, 13]];
    for (const [v, vl, y] of V) for (const [a, al, xl, xs] of H) {
      const svg = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="1.5" opacity=".4"/><path d="M${xl} ${y}h10M${xs} ${y + 3}h6"/></svg>`;
      const name = v === 'middle' && a === 'center' ? 'Align Center' : `Align ${vl} ${al}`;
      const b = h('button', { type: 'button', class: 'cg', title: name, 'aria-label': name, 'aria-pressed': curV === v && curH === a ? 'true' : 'false', html: svg });
      b.addEventListener('mousedown', ev => ev.preventDefault());
      b.addEventListener('click', () => { this.close(); setTimeout(() => this.cellAlign(v, a), 0); });
      grid.appendChild(b);
    }
    return grid;
  },
  /* vertical (v) and horizontal (a) alignment for the selected cells, or the caret's cell */
  cellAlign(v, a) {
    const cells = Tables.selectedCells();
    if (!cells.length) return;
    focusEditor();
    change(() => {
      if (v) for (const c of cells) { c.style.verticalAlign = v === 'top' ? '' : v; if (!c.getAttribute('style')) c.removeAttribute('style'); }
      if (a) {
        const blocks = Tables.active() ? Tables.selBlocks() : cells.flatMap(c => selectedBlocks(Tables.contentsRange(c)));
        for (const b of blocks) alignBlock(b, a);
      }
      if (Tables.active()) Tables.park();
    }, { full: true });
  },

  /* ---------- the clipboard from a menu ---------- */
  /* browsers only let a page read the clipboard when it allows that; otherwise say how */
  async paste(mode) {
    focusEditor();
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) throw new Error('no clipboard');
      let html = '', text = '';
      for (const it of await navigator.clipboard.read()) {
        if (it.types.includes('text/html') && !html) html = await (await it.getType('text/html')).text();
        if (it.types.includes('text/plain') && !text) text = await (await it.getType('text/plain')).text();
      }
      if (!html && !text) { toast('The clipboard is empty.'); return; }
      focusEditor();
      Paste.last = { html, text };
      doPaste(mode, html, text, true);
    } catch {
      toast(mode === 'text' ? `Press ${MOD}+Shift+V to paste as text only. Browsers only let pages read the clipboard when you paste with the keyboard.` : `Press ${MOD}+V to paste. Browsers only let pages read the clipboard when you paste with the keyboard.`);
    }
  },
  copyText(text, done) {
    const ok = () => toast(done);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => toast(`Couldn’t copy: ${text}`));
    else toast(text);
  },
  /* a selected picture: copy or cut it as it sits in the text */
  imgClip(cmd) {
    const img = S.selImg;
    if (!img) return;
    const r = document.createRange();
    r.selectNode(img);
    setRange(r);
    if (!exec(cmd)) toast(`Press ${MOD}+${cmd === 'cut' ? 'X' : 'C'} to ${cmd}.`);
  },

  /* ---------- the menu itself ---------- */
  show(items, x, y) {
    this.close();
    const root = this.panel(items, 0);
    this.place(root, x, y);
    document.addEventListener('mousedown', this._outside = ev => { if (!this.panels.some(p => p.contains(ev.target))) this.close(); }, true);
    document.addEventListener('keydown', this._key = ev => this.key(ev), true);
    window.addEventListener('blur', this._blur = () => this.close());
    window.addEventListener('resize', this._blur);
    $('#canvas').addEventListener('scroll', this._blur, { passive: true });
  },
  panel(items, level) {
    const pop = h('div', { class: 'pop ctx', role: 'menu', 'data-level': level });
    for (const it of items) pop.appendChild(this.item(it, pop, level));
    pop.addEventListener('mousedown', e => { if (!e.target.closest('input, textarea, select')) e.preventDefault(); });
    $('#popRoot').appendChild(pop);
    this.panels[level] = pop;
    return pop;
  },
  item(it, pop, level) {
    if (it === '-') return h('div', { class: 'msep', role: 'separator' });
    if (it.note) return h('div', { class: 'mnote' }, it.note);
    if (it.el) return it.el;
    const b = h('button', { class: 'mi', type: 'button', role: it.checked != null ? 'menuitemcheckbox' : 'menuitem', disabled: it.disabled || null, 'aria-haspopup': it.sub ? 'menu' : null },
      h('span', { class: 'ic', html: it.icon ? icon(it.icon) : '' }),
      h('span', { class: 'lb' }, it.label),
      it.sc ? h('span', { class: 'sc' }, it.sc) : null,
      it.sub ? h('span', { class: 'subar', html: icon('chevronRight') }) : null);
    if (it.checked != null) b.setAttribute('aria-checked', it.checked ? 'true' : 'false');
    b._it = it;
    b.addEventListener('mouseenter', () => {
      this.mark(b);
      clearTimeout(this.hoverTimer);
      this.hoverTimer = setTimeout(() => { if (it.sub && !it.disabled) this.openSub(b); else this.closeFrom(level + 1); }, it.sub ? 120 : 200);
    });
    b.addEventListener('click', () => {
      if (it.disabled) return;
      if (it.sub) { clearTimeout(this.hoverTimer); this.openSub(b); return; }
      this.close();
      setTimeout(() => it.onClick && it.onClick(), 0);
    });
    return b;
  },
  openSub(b) {
    const pop = b.closest('.pop');
    if (!pop || !this.panels.includes(pop)) return;   // its menu has closed meanwhile
    const level = +pop.dataset.level;
    if (this.panels[level + 1] && this.panels[level + 1]._from === b) return;
    this.closeFrom(level + 1);
    const sub = this.panel(b._it.sub, level + 1);
    sub._from = b;
    b.setAttribute('aria-expanded', 'true');
    const r = b.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    const w = sub.offsetWidth, hh = sub.offsetHeight;
    let x = pr.right - 4, y = r.top - 6;
    if (x + w > window.innerWidth - 8) x = Math.max(8, pr.left - w + 4);
    if (y + hh > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 8 - hh);
    sub.style.left = x + 'px';
    sub.style.top = y + 'px';
  },
  place(pop, x, y) {
    const w = pop.offsetWidth, hh = pop.offsetHeight;
    if (x + w > window.innerWidth - 8) x = Math.max(8, x - w);
    if (y + hh > window.innerHeight - 8) y = Math.max(8, Math.min(y - hh, window.innerHeight - 8 - hh));
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  },
  closeFrom(level) {
    while (this.panels.length > level) {
      const p = this.panels.pop();
      if (p) { if (p._from) p._from.removeAttribute('aria-expanded'); p.remove(); }
    }
  },
  close() {
    clearTimeout(this.hoverTimer);
    if (!this.panels.length) return;
    this.closeFrom(0);
    document.removeEventListener('mousedown', this._outside, true);
    document.removeEventListener('keydown', this._key, true);
    window.removeEventListener('blur', this._blur);
    window.removeEventListener('resize', this._blur);
    const cv = $('#canvas'); if (cv) cv.removeEventListener('scroll', this._blur);
  },
  isOpen() { return this.panels.length > 0; },
  mark(b) {
    const pop = b.closest('.pop');
    pop.querySelectorAll('.mi.kb, .cg.kb').forEach(x => x.classList.remove('kb'));
    b.classList.add('kb');
  },
  /* keys while the menu is open; they never reach the page */
  key(e) {
    const level = this.panels.length - 1, pop = this.panels[level];
    if (!pop) return;
    const items = Array.from(pop.querySelectorAll('.mi:not(:disabled), .cg'));
    const cur = pop.querySelector('.mi.kb, .cg.kb');
    const i = items.indexOf(cur);
    const go = j => { if (items.length) this.mark(items[(j + items.length) % items.length]); };
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    switch (e.key) {
      case 'ArrowDown': stop(); go(i + 1); return;
      case 'ArrowUp': stop(); go(i < 0 ? -1 : i - 1); return;
      case 'Home': stop(); go(0); return;
      case 'End': stop(); go(-1); return;
      case 'ArrowRight': stop(); if (cur && cur._it && cur._it.sub && !cur._it.disabled) { this.openSub(cur); const sub = this.panels[level + 1]; const f = sub && sub.querySelector('.mi:not(:disabled), .cg'); if (f) this.mark(f); } return;
      case 'ArrowLeft': stop(); if (level > 0) this.closeFrom(level); return;
      case 'Escape': stop(); if (level > 0) this.closeFrom(level); else { this.close(); focusEditor(); } return;
      case 'Enter': case ' ': stop(); if (cur) cur.click(); return;
      case 'Tab': stop(); this.close(); focusEditor(); return;
      case 'Shift': case 'Control': case 'Alt': case 'Meta': return;
      default: this.close();   // anything else closes the menu and goes to the page
    }
  },
};
