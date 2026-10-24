/* ===================== Menus & popovers ===================== */
const Menu = {
  el: null, anchor: null, onClose: null,
  open(anchor, content, opts = {}) {
    this.close();
    const pop = h('div', { class: 'pop' + (opts.cls ? ' ' + opts.cls : ''), role: 'menu', tabindex: '-1' });
    if (Array.isArray(content)) for (const it of content) pop.appendChild(menuItem(it, this));
    else pop.appendChild(content);
    $('#popRoot').appendChild(pop);
    this.el = pop; this.anchor = anchor; this.onClose = opts.onClose || null;
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = opts.alignRight ? r.right - pw : r.left, y = r.bottom + 3;
    if (opts.at) { x = opts.at.x; y = opts.at.y; }
    if (x + pw > window.innerWidth - 8) x = window.innerWidth - pw - 8;
    if (y + ph > window.innerHeight - 8) y = Math.max(8, (opts.at ? opts.at.y : r.top) - ph - 3);
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = y + 'px';
    anchor.setAttribute && anchor.setAttribute('aria-expanded', 'true');
    pop.addEventListener('keydown', e => this.key(e));
    pop.addEventListener('mousedown', e => { if (!e.target.closest('input, textarea, select')) e.preventDefault(); });
    setTimeout(() => { document.addEventListener('mousedown', this._outside = ev => { if (this.el && !this.el.contains(ev.target) && !anchor.contains(ev.target)) this.close(); }, true); }, 0);
    if (!opts.noFocus) { const first = pop.querySelector('.mi:not(:disabled), input, button'); if (first && first.classList.contains('mi')) { /* keep editor focus */ } }
    return pop;
  },
  close() {
    if (!this.el) return;
    this.el.remove();
    if (this.anchor && this.anchor.setAttribute) this.anchor.setAttribute('aria-expanded', 'false');
    this.el = null;
    document.removeEventListener('mousedown', this._outside, true);
    const cb = this.onClose; this.onClose = null;
    if (cb) cb();
  },
  key(e) {
    const items = $$('.mi:not(:disabled)', this.el);
    let i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); this.close(); focusEditor(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0])?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1])?.focus(); }
  },
};
function menuItem(it, menu) {
  if (it === '-' || it.sep) return h('div', { class: 'msep', role: 'separator' });
  if (it.head) return h('div', { class: 'mhead' }, it.head);
  if (it.el) return it.el;
  const b = h('button', { class: 'mi', type: 'button', role: it.checked != null ? 'menuitemradio' : 'menuitem', disabled: it.disabled || null, title: it.title || null },
    h('span', { class: 'ic', html: it.icon ? icon(it.icon) : '' }),
    it.sample ? h('span', { class: 'lb lb-sample' }, it.sample, h('small', null, it.label)) : h('span', { class: 'lb', style: it.style || null }, it.label),
    it.sc ? h('span', { class: 'sc' }, it.sc) : null);
  if (it.checked != null) b.setAttribute('aria-checked', it.checked ? 'true' : 'false');
  b.addEventListener('click', () => { menu.close(); setTimeout(() => it.onClick && it.onClick(), 0); });
  return b;
}

/* ===================== Color palettes ===================== */
const THEME_BASE = ['#ffffff', '#000000', '#e8e6e1', '#263848', '#1d6a50', '#c2410c', '#8e8e8e', '#d4a017', '#2f6fa8', '#7a3e9d'];
const STANDARD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
const HIGHLIGHTS = [['#ffff00', 'Yellow'], ['#00ff00', 'Bright Green'], ['#00ffff', 'Turquoise'], ['#ff00ff', 'Pink'], ['#0000ff', 'Blue'], ['#ff0000', 'Red'], ['#000080', 'Dark Blue'], ['#008080', 'Teal'], ['#008000', 'Green'], ['#800080', 'Violet'], ['#800000', 'Dark Red'], ['#808000', 'Dark Yellow'], ['#808080', 'Gray 50%'], ['#c0c0c0', 'Gray 25%'], ['#000000', 'Black']];
function mix(hex, other, t) { const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16); const ch = (x, s) => (x >> s) & 255; const m = s => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t); return '#' + [16, 8, 0].map(s => m(s).toString(16).padStart(2, '0')).join(''); }
function colorPalette(kind, onPick) {
  const box = h('div', { class: 'palette' });
  const sw = (c, title) => { const b = h('button', { class: 'sw', type: 'button', title: title || c, 'aria-label': title || c, style: { background: c } }); b.addEventListener('click', () => { Menu.close(); onPick(c); }); return b; };
  if (kind === 'highlight') {
    box.appendChild(h('div', { class: 'pal-grid hl' }, HIGHLIGHTS.map(([c, n]) => sw(c, n))));
    box.appendChild(menuItem({ label: 'No Color', icon: 'close', onClick: () => onPick(null) }, Menu));
    return box;
  }
  if (kind === 'font') box.appendChild(menuItem({ label: 'Automatic', icon: 'fontcolor', onClick: () => onPick(null) }, Menu));
  box.appendChild(h('div', { class: 'pal-label' }, 'Theme Colors'));
  const grid = h('div', { class: 'pal-grid' });
  const rows = [0, 0.8, 0.6, 0.4, -0.25, -0.5];
  for (const t of rows) for (const base of THEME_BASE) {
    let c = base;
    if (t > 0) c = mix(base, '#ffffff', base === '#ffffff' ? 0 : t);
    else if (t < 0) c = mix(base, '#000000', -t);
    if (base === '#ffffff' && t !== 0) c = mix('#ffffff', '#000000', [0, 0.05, 0.15, 0.25, 0.35, 0.5][rows.indexOf(t)]);
    if (base === '#000000' && t > 0) c = mix('#000000', '#ffffff', 1 - t);
    grid.appendChild(sw(c));
  }
  box.appendChild(grid);
  box.appendChild(h('div', { class: 'pal-label' }, 'Standard Colors'));
  box.appendChild(h('div', { class: 'pal-grid' }, STANDARD_COLORS.map(c => sw(c))));
  if (kind !== 'font') box.appendChild(menuItem({ label: 'No Color', icon: 'close', onClick: () => onPick(null) }, Menu));
  const inp = h('input', { type: 'color', value: '#1d6a50', style: { width: '0', height: '0', opacity: '0', position: 'absolute' }, 'aria-label': 'Custom color' });
  inp.addEventListener('change', () => { Menu.close(); onPick(inp.value); });
  const more = menuItem({ label: 'More Colors…', icon: 'pagecolor', onClick: () => { } }, Menu);
  more.replaceWith && 0;
  const moreBtn = h('button', { class: 'mi', type: 'button' }, h('span', { class: 'ic', html: icon('pagecolor') }), h('span', { class: 'lb' }, 'More Colors…'));
  moreBtn.addEventListener('click', () => inp.click());
  box.append(moreBtn, inp);
  return box;
}

/* ===================== Commands ===================== */
function needSel(fn) { return (...a) => { if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing on the Review tab to make changes.'); return; } return fn(...a); }; }
const CMD = {
  fillFields: () => (S.pane === 'fields' ? closePane() : openPane('fields')),
  drawTextBox: needSel(() => Shapes.draw('textbox')),
  shapeEditText: needSel(() => { const el = Shapes.cur(); if (el) Shapes.edit(el); else toast('Select a shape first.'); }),
  formatShape: needSel(() => Shapes.dialog()),
  deleteShape: needSel(() => { const el = Shapes.cur(); if (!el) return; if (Story.cur && Story.cur.type === 'shape') Story.close(); Images.select(el); Images.remove(); }),
  avro: () => Avro.toggle(),
  bijoy: () => Bijoy.toggle(),
  bnToUnicode: () => Bijoy.convert('unicode'),
  bnToBijoy: () => Bijoy.convert('bijoy'),
  bijoyLayout: () => Bijoy.showLayout(),
  bnFont: () => Menus.bnFont($('#fontName') || document.body),
  addFont: () => UserFonts.pick(),
  nextField: () => Fields.next(1),
  insertField: () => Dialogs.insertField(),
  save: async () => { await Saver.flush(); setSaveState(S.dirty ? 'dirty' : 'saved'); toast(Store.cloud ? 'Saved to your Claude account.' : 'Saved in this browser.'); },
  undo: () => undo(),
  redo: () => redo(),
  paste: () => toast(`Press ${MOD}+V to paste. Browsers only let pages read the clipboard when you paste with the keyboard.`),
  cut: needSel(() => { focusEditor(); if (Tables.active()) { Tables.execClip('cut'); return; } if (!exec('cut')) toast(`Press ${MOD}+X to cut.`); }),
  copy: () => { focusEditor(); if (Tables.active()) { Tables.execClip('copy'); return; } if (!exec('copy')) toast(`Press ${MOD}+C to copy.`); },
  painter: () => (S.painter ? Painter.stop() : Painter.start(false)),
  bold: needSel(() => toggleInline('bold')),
  italic: needSel(() => toggleInline('italic')),
  underline: needSel(() => toggleInline('underline')),
  strike: needSel(() => toggleInline('strikeThrough')),
  sub: needSel(() => toggleInline('subscript')),
  sup: needSel(() => toggleInline('superscript')),
  grow: needSel(() => growFont(1)),
  shrink: needSel(() => growFont(-1)),
  clearFmt: needSel(() => clearFormatting()),
  highlight: needSel(c => setHighlight(c === undefined ? Prefs.highlight : c)),
  fontColor: needSel(c => setFontColor(c === undefined ? Prefs.fontColor : c)),
  bullets: needSel(t => toggleList('ul', t)),
  numbering: needSel(t => toggleList('ol', t)),
  checklist: needSel(() => toggleList('check')),
  indent: needSel(() => setIndent(1)),
  outdent: needSel(() => setIndent(-1)),
  marks: () => { S.marks = !S.marks; docBody().classList.toggle('show-marks', S.marks); if (Story.cur) Story.cur.el.classList.toggle('show-marks', S.marks); Layout.full(); UI.refresh(); },
  alignLeft: needSel(() => (PicEdit.floating(S.selImg) ? PicEdit.align(S.selImg, 'left') : setAlign('left'))),
  alignCenter: needSel(() => (PicEdit.floating(S.selImg) ? PicEdit.align(S.selImg, 'center') : setAlign('center'))),
  alignRight: needSel(() => (PicEdit.floating(S.selImg) ? PicEdit.align(S.selImg, 'right') : setAlign('right'))),
  alignDecimal: needSel(() => setAlign('decimal')),
  justify: needSel(() => setAlign('justify')),
  shading: needSel(c => setShading(c === undefined ? Prefs.shade : c)),
  find: () => Find.open(false),
  replace: () => Find.open(true),
  selectAll: () => { S.editor.focus(); selectNodeContents(S.editor); },
  pageBreak: needSel(() => insertPageBreak()),
  blankPage: needSel(() => { insertPageBreak(); insertPageBreak(); }),
  picture: needSel(() => pickFile('image/*', true, files => Images.insertFiles(files))),
  link: needSel(() => Dialogs.link()),
  hr: needSel(() => insertHR()),
  comment: () => Comments.add(),
  stylesPane: () => (S.pane === 'styles' ? closePane() : openPane('styles')),
  footnote: () => Notes.insert('foot'),
  endnote: () => Notes.insert('end'),
  nextFootnote: () => Notes.step('foot', 1),
  showNotes: () => Notes.show(),
  noteDialog: () => Notes.dialog(),
  header: () => HF.edit('header'),
  footer: () => HF.edit('footer'),
  hfClose: () => HF.close(),
  hfFirst: needSel(() => HF.setFirst(!HF.firstOn(HF.curSec()))),
  hfLink: () => { const e = HF.editing; if (e) HF.setLink(!HF.linked(e.kind, e.sec)); },
  pageNumberFormat: () => Dialogs.pageNumberFormat(),
  hfEven: needSel(() => HF.setEven(!S.doc.evenDiff)),
  hfToHeader: () => HF.go('header'),
  hfToFooter: () => HF.go('footer'),
  hfPrev: () => HF.step(-1),
  hfNext: () => HF.step(1),
  hfDate: needSel(() => HF.field('DATE')),
  hfLine: needSel(() => Borders.quick('bottom')),
  textFromFile: needSel(() => pickFile('.docx,.html,.htm,.txt,.md,.markdown', false, f => Files.insertFile(f[0]))),
  tocInsert: needSel(() => Toc.insert()),
  tocUpdate: () => Toc.update(),
  tocRemove: () => Toc.remove(),
  spelling: () => { Prefs.spell = !Prefs.spell; S.editor.spellcheck = Prefs.spell; S.editor.setAttribute('spellcheck', Prefs.spell ? 'true' : 'false'); savePrefs(); UI.refresh(); toast(Prefs.spell ? 'Spelling check is on. Misspelled words get a red underline; right-click for suggestions.' : 'Spelling check is off.'); },
  wordCount: () => Dialogs.wordCount(),
  readAloud: () => Speech.toggle(),
  newComment: () => Comments.add(),
  prevComment: () => Comments.step(-1),
  nextComment: () => Comments.step(1),
  showComments: () => (S.pane === 'comments' ? closePane() : openPane('comments')),
  track: () => Track.toggle(),
  acceptChange: () => Track.acceptCur(false),
  rejectChange: () => Track.acceptCur(true),
  prevChange: () => Track.step(-1),
  nextChange: () => Track.step(1),
  restrict: () => setReadOnly(!S.readOnly),
  readMode: () => setView(S.view === 'read' ? 'print' : 'read'),
  printLayout: () => setView('print'),
  webLayout: () => setView('web'),
  focus: () => setView(S.view === 'focus' ? 'print' : 'focus'),
  ruler: () => { S.ruler = !S.ruler; $('#rulerWrap').classList.toggle('off', !S.ruler); lsSet('folio.ruler', S.ruler); Ruler.drawSoon(); UI.refresh(); },
  nav: () => toggleNav(),
  zoom100: () => setZoom(1),
  onePage: () => { S.zoomMode = 'page'; fitZoom(); },
  multiPage: () => { S.zoomMode = 'multi'; fitZoom(); },
  pageWidth: () => { S.zoomMode = 'width'; fitZoom(); },
  zoomDialog: () => Dialogs.zoom(),
  assistant: () => { if (S.pane === 'assistant') closePane(); else { openPane('assistant'); Proof.setView('write'); } },
  proofread: () => { Proof.run(); },
  pageBorder: () => Dialogs.bordersShading('page'),
  bordersShading: () => Dialogs.bordersShading('borders'),
  bordersQuick: needSel(() => Borders.quick(Prefs.lastBorder || 'bottom')),
  drawTable: needSel(() => TDraw.set('pen')),
  eraser: needSel(() => TDraw.set('eraser')),
  borderPainter: needSel(() => TDraw.set('painter')),
  insertCells: needSel(() => Dialogs.insertCells()),
  deleteCells: needSel(() => Dialogs.deleteCells()),
  splitTable: needSel(() => Tables.splitTable()),
  distributeRows: needSel(() => Tables.distributeRows()),
  gridlines: () => { Prefs.gridlines = Prefs.gridlines === false; savePrefs(); applyGridlines(); UI.refresh(); },
  rowAbove: needSel(() => Tables.insertRow(false)),
  rowBelow: needSel(() => Tables.insertRow(true)),
  colLeft: needSel(() => Tables.insertCol(false)),
  colRight: needSel(() => Tables.insertCol(true)),
  delRow: needSel(() => Tables.deleteRow()),
  delCol: needSel(() => Tables.deleteCol()),
  delTable: needSel(() => Tables.deleteTable()),
  merge: needSel(() => Tables.merge()),
  split: needSel(() => Dialogs.splitCells()),
  distribute: needSel(() => Tables.distribute()),
  hdrRow: needSel(() => Tables.toggleClass('hdr')),
  banded: needSel(() => Tables.toggleClass('band')),
  vTop: needSel(() => Tables.setVAlign('top')),
  vMid: needSel(() => Tables.setVAlign('middle')),
  vBottom: needSel(() => Tables.setVAlign('bottom')),
  cellShade: needSel(c => Tables.shade(c === undefined ? Prefs.shade : c)),
  imgBorder: needSel(() => Images.toggleBorder()),
  resetSize: needSel(() => Images.resetSize()),
  altText: () => Dialogs.altText(),
  crop: needSel(() => Crop.toggle()),
  rotateRight: needSel(() => PicEdit.rotate(90)),
  rotateLeft: needSel(() => PicEdit.rotate(-90)),
  flipV: needSel(() => PicEdit.flip('v')),
  flipH: needSel(() => PicEdit.flip('h')),
  rotateMore: needSel(() => PicEdit.rotateDialog()),
  removeBg: needSel(() => PicEdit.background()),
  resetPic: needSel(() => PicEdit.reset()),
  saveSig: () => Sigs.saveSelected(),
  versions: () => Backstage.open('history'),
  replaceImg: needSel(() => Images.replace()),
  deleteImg: needSel(() => Images.remove()),
  fontDialog: () => Dialogs.font(),
  paragraphDialog: () => Dialogs.paragraph(),
  pageSetup: () => Dialogs.pageSetup(),
  shortcuts: () => Dialogs.shortcuts(),
  goTo: () => Dialogs.goTo(),
};
function setReadOnly(on) {
  S.readOnly = on;
  S.editor.contentEditable = on || S.view === 'read' ? 'false' : 'true';
  S.editor.classList.toggle('ro', on);
  showBanner(on ? 'This document is read-only. Turn off Restrict Editing to make changes.' : null, on ? { label: 'Allow editing', fn: () => setReadOnly(false) } : null);
  UI.refresh();
}
function showBanner(msg, action) {
  const b = $('#banner');
  if (!msg) { b.hidden = true; b.innerHTML = ''; return; }
  b.innerHTML = '';
  b.append(h('span', { html: icon('lock') }), h('span', { class: 'grow' }, msg));
  if (action) b.append(h('button', { class: 'btn', onclick: action.fn }, action.label));
  b.hidden = false;
}
/* Margins, Orientation, Size: the sections the selection is in (the whole document when it
   has one), as in Word */
function setPage(over) {
  const at = Sections.selected().map(s => s.i);
  change(() => { const list = Sections.list(); for (const i of at) if (list[i]) Sections.setPg(list[i], over); applyDocSettings(); }, { full: true });
  if (S.zoomMode !== 'custom') fitZoom();
}
/* the page settings of the section the caret is in (what the menus show as chosen) */
function curPage() { const s = S.doc && Sections.selected()[0]; return s ? s.pg : S.doc.page; }
function addRecentFont(name) {
  const r = (Prefs.recentFonts || []).filter(f => f !== name);
  r.unshift(name);
  Prefs.recentFonts = r.slice(0, 5);
  savePrefs();
}
function openPane(name) {
  const p = $('#sidePane');
  S.pane = name;
  p.hidden = false;
  $$('#sidePane .pane-tab').forEach(t => t.setAttribute('aria-selected', t.dataset.pane === name ? 'true' : 'false'));
  $$('#sidePane .pane-section').forEach(s => s.hidden = s.dataset.section !== name);
  if (name === 'comments') Comments.render();
  if (name === 'assistant') { Assistant.init(); Assistant.capture(); }
  if (name === 'fields') Fields.render();
  if (name === 'styles') Styles.renderPane();
  setTimeout(() => { Ruler.drawSoon(); if (S.zoomMode !== 'custom') fitZoom(); }, 0);
  UI.refresh();
}
function closePane() { $('#sidePane').hidden = true; S.pane = null; setTimeout(() => { Ruler.drawSoon(); if (S.zoomMode !== 'custom') fitZoom(); }, 0); UI.refresh(); }
function toggleNav() { S.nav = !S.nav; $('#navPane').hidden = !S.nav; if (S.nav) Nav.render(); setTimeout(() => { Ruler.drawSoon(); if (S.zoomMode !== 'custom') fitZoom(); }, 0); UI.refresh(); }
function applyTheme() {
  const t = Prefs.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else if (document.documentElement.dataset.folioTheme) document.documentElement.removeAttribute('data-theme');
  document.documentElement.dataset.folioTheme = t;
  Ruler.drawSoon();
}

/* ===================== Menus for ribbon controls ===================== */
const Menus = {
  paste: a => Menu.open(a, [
    { head: 'Paste options' },
    { label: 'Keep Source Formatting', checked: Paste.mode === 'keep', onClick: () => { Paste.mode = 'keep'; toast('Pasting keeps source formatting.'); } },
    { label: 'Merge Formatting', checked: Paste.mode === 'merge', onClick: () => { Paste.mode = 'merge'; toast('Pasting keeps bold, italic, lists and tables, and takes this document’s fonts.'); } },
    { label: 'Keep Text Only', checked: Paste.mode === 'text', onClick: () => { Paste.mode = 'text'; toast('Pasting plain text only.'); } },
    '-', { label: `Paste with ${MOD}+V · plain text with ${MOD}+Shift+V`, disabled: true },
  ]),
  case: a => Menu.open(a, [
    { label: 'Sentence case.', onClick: () => changeCase('sentence') }, { label: 'lowercase', onClick: () => changeCase('lower') }, { label: 'UPPERCASE', onClick: () => changeCase('upper') },
    { label: 'Capitalize Each Word', onClick: () => changeCase('title') }, { label: 'tOGGLE cASE', onClick: () => changeCase('toggle') },
  ]),
  underline: a => Menu.open(a, [
    ['single', 'Single'], ['double', 'Double'], ['thick', 'Thick'], ['dotted', 'Dotted'], ['dashed', 'Dashed'], ['wavy', 'Wave'],
  ].map(([v, l]) => ({ label: l, style: `text-decoration:underline;text-decoration-style:${v === 'thick' ? 'solid' : v};text-decoration-thickness:${v === 'thick' ? '2px' : 'auto'}`, onClick: () => setUnderlineStyle(v) })).concat(['-', { label: 'No underline', onClick: () => setUnderlineStyle('none') }])),
  highlight: a => Menu.open(a, colorPalette('highlight', c => CMD.highlight(c))),
  fontColor: a => Menu.open(a, colorPalette('font', c => CMD.fontColor(c))),
  shading: a => Menu.open(a, colorPalette('shade', c => CMD.shading(c))),
  cellShade: a => Menu.open(a, colorPalette('shade', c => CMD.cellShade(c))),
  pageColor: a => Menu.open(a, colorPalette('page', c => setPage({ color: c || '#ffffff' }))),
  bullets: a => Menu.open(a, [{ head: 'Bullet Library' }, ...BULLET_TYPES.map(b => ({ label: b.label, onClick: () => CMD.bullets(b.v) })), '-', { label: 'Checklist', icon: 'checklist', onClick: () => CMD.checklist() }]),
  numbering: a => Menu.open(a, [{ head: 'Numbering Library' }, ...NUMBER_TYPES.map(b => ({ label: b.label, style: b.bn ? 'font-family:' + bnStack(docBnFont()) : null, onClick: () => CMD.numbering(b.v) })), '-', { label: 'Multilevel List…', icon: 'multilevel', onClick: () => Menus.multilevel(a) }, { label: 'Restart at 1', onClick: () => setListStart(1) }, { label: 'Set Numbering Value…', onClick: () => Dialogs.listStart() }]),
  sort: a => Menu.open(a, [{ label: 'Sort A to Z', onClick: () => sortParagraphs(false) }, { label: 'Sort Z to A', onClick: () => sortParagraphs(true) }]),
  lineSpacing: a => {
    const cur = paraInfo();
    const v = cur ? cur.line : 1.08;
    Menu.open(a, [...[1, 1.08, 1.15, 1.5, 2, 2.5, 3].map(n => ({ label: String(n === 1.08 ? '1.08 (default)' : n.toFixed(n % 1 ? 2 : 1).replace(/0$/, '')), checked: Math.abs(v - n) < 0.01, onClick: () => setLineSpacing(n === 1.08 ? '' : n) })), '-',
      { label: 'Line Spacing Options…', onClick: () => Dialogs.paragraph() }, '-',
      { label: curSpacing('before') > 0 ? 'Remove Space Before Paragraph' : 'Add Space Before Paragraph', onClick: () => setSpacing('before', curSpacing('before') > 0 ? 0 : 12) },
      { label: curSpacing('after') > 0 ? 'Remove Space After Paragraph' : 'Add Space After Paragraph', onClick: () => setSpacing('after', curSpacing('after') > 0 ? 0 : 8) }]);
  },
  borders: a => Menu.open(a, bordersMenuItems()),
  styles: a => {
    const cur = blockStyleKey(blockOf(curTextNode()));
    Menu.open(a, [...Styles.keys().map(k => ({ label: Styles.name(k), checked: cur === k, onClick: () => setBlockStyle(k) })), '-',
      { label: 'Create a Style…', icon: 'plus', onClick: () => Styles.dialog(null) },
      { label: `Modify ${Styles.name(cur)}…`, icon: 'edit', onClick: () => Styles.dialog(cur) },
      { label: `Update ${Styles.name(cur)} to Match Selection`, icon: 'refresh', onClick: () => Styles.update(cur) },
      { label: 'Styles Pane', icon: 'styles', onClick: () => openPane('styles') },
      '-', { label: 'Clear Formatting', icon: 'clearfmt', onClick: () => clearFormatting() }]);
  },
  multilevel: a => {
    const top = Lists.top();
    const cur = top && top.tagName === 'OL' ? (top.getAttribute('data-ml') || 'plain') : null;
    Menu.open(a, [{ head: 'List Library' }, ...ML_PRESETS.map(p => ({ label: p.label, sc: p.note, checked: cur === p.v, onClick: () => Lists.multilevel(p.v) })), '-',
      { label: 'Increase List Level', icon: 'indent', sc: 'Tab', disabled: !inList(), onClick: () => setIndent(1) },
      { label: 'Decrease List Level', icon: 'outdent', sc: 'Shift+Tab', disabled: !inList(), onClick: () => setIndent(-1) },
      '-', { label: 'Restart at 1', disabled: !inList(), onClick: () => setListStart(1) }, { label: 'Set Numbering Value…', disabled: !inList(), onClick: () => Dialogs.listStart() }]);
  },
  table: a => Menu.open(a, tableGridPicker()),
  pageNumber: a => { const bnOn = HF.bnNumbersOn(), nm = bnOn ? 'bn' : undefined; Menu.open(a, [
    { head: 'Add page numbers' },
    { label: bnOn ? 'Bottom center: ১' : 'Bottom center: 1', onClick: () => HF.pageNumbers('footer', 'center', '', nm) },
    { label: bnOn ? 'Bottom right: পৃষ্ঠা ১ এর ৩' : 'Bottom right: Page 1 of 3', onClick: () => HF.pageNumbers('footer', 'right', 'of', nm) },
    { label: bnOn ? 'Bottom left: ১' : 'Bottom left: 1', onClick: () => HF.pageNumbers('footer', 'left', '', nm) },
    { label: bnOn ? 'Top right: ১' : 'Top right: 1', onClick: () => HF.pageNumbers('header', 'right', '', nm) },
    { head: 'Bangla (বাংলা)' },
    { label: 'Bottom center: ১', onClick: () => HF.pageNumbers('footer', 'center', '', 'bn') },
    { label: 'Bottom center: পৃষ্ঠা ১', onClick: () => HF.pageNumbers('footer', 'center', 'bn', 'bn') },
    { label: 'Bottom right: পৃষ্ঠা ১ এর ৩', onClick: () => HF.pageNumbers('footer', 'right', 'of', 'bn') },
    { label: 'Bottom center: ১/৩', onClick: () => HF.pageNumbers('footer', 'center', 'slash', 'bn') },
    { label: 'Top center, from page 2: - ২ -', onClick: () => HF.pageNumbers('header', 'center', 'dash', 'bn', { fromSecond: true }) },
    '-', { label: 'Bangla Digits (১, ২, ৩)', checked: bnOn, onClick: () => HF.bnNumbers(!bnOn) },
    { label: 'Insert the Page Number Here', icon: 'pagenum', disabled: !HF.editing, onClick: () => HF.field('PAGE', bnOn ? 'bn' : undefined) },
    { label: 'Format Page Numbers…', onClick: () => Dialogs.pageNumberFormat() },
    { label: 'Remove Page Numbers', onClick: () => HF.removeNumbers() }, { label: 'Edit Footer', onClick: () => HF.edit('footer') },
  ]); },
  header: a => Menu.open(a, [
    { label: 'Edit Header', icon: 'edit', onClick: () => HF.edit('header') },
    { head: 'Letterheads (first page)' },
    ...HF.designs().filter(x => x.id !== 'simple').map(x => ({ label: x.name.replace(/^Letterhead: /, ''), icon: 'header', onClick: () => HF.useDesign(x.id) })),
    { head: 'Every page' },
    { label: 'Title on the left, page number on the right', icon: 'header', onClick: () => HF.useDesign('simple') },
    '-', { label: 'Remove Header', icon: 'trash', disabled: HF.stores().every(st => HF_VARS.every(v => HF.empty(st[v]))), onClick: () => HF.remove('header') },
  ]),
  footer: a => Menu.open(a, [
    { label: 'Edit Footer', icon: 'edit', onClick: () => HF.edit('footer') },
    { label: 'Page Numbers…', icon: 'pagenum', onClick: () => Menus.pageNumber(a) },
    '-', { label: 'Remove Footer', icon: 'trash', disabled: HF.stores().every(st => HF_VARS.every(v => HF.empty(st[v]))), onClick: () => HF.remove('footer') },
  ]),
  nextNote: a => Menu.open(a, [
    { label: 'Next Footnote', icon: 'next', onClick: () => Notes.step('foot', 1) },
    { label: 'Previous Footnote', icon: 'prev', onClick: () => Notes.step('foot', -1) },
    { label: 'Next Endnote', icon: 'next', onClick: () => Notes.step('end', 1) },
    { label: 'Previous Endnote', icon: 'prev', onClick: () => Notes.step('end', -1) },
  ]),
  hfInfo: a => Menu.open(a, Object.entries(HF.FIELDS).map(([f, l]) => ({ label: l, onClick: () => HF.field(f) })).concat(['-', { label: 'Page number in Bangla (১, ২, ৩)', onClick: () => HF.field('PAGE', 'bn') }, { label: 'Date in Bangla (২০ অক্টোবর ২০২৬)', onClick: () => HF.field('DATE', 'bn') }])),
  // English, Bangla (বঙ্গাব্দ and খ্রিস্টাব্দ), the letter date block, the time; More Formats
  date: a => Menu.open(a, BnDate.menuItems()),
  // government letters: a new one, its parts at the cursor, the office profile
  officeLetter: a => Menu.open(a, OfficeLetter.menuItems()),
  // the keyboards (status bar), Bijoy's typing (the arrow of Review › Bijoy) and Bangla conversion
  kbd: a => Menu.open(a, Bijoy.menuItems(), { alignRight: true }),
  bijoy: a => Menu.open(a, Bijoy.menuItems().slice(4)),
  bnConvert: a => Menu.open(a, [
    { label: 'Bijoy to Unicode', icon: 'bnConvert', title: 'Text typed with Bijoy (SutonnyMJ and similar fonts) to Unicode: the selection, or all such text when nothing is selected', onClick: () => Bijoy.convert('unicode') },
    { label: 'Unicode to Bijoy (SutonnyMJ)', title: 'Bangla in the selection (or the whole document) to Bijoy text in SutonnyMJ, for people who use Bijoy', onClick: () => Bijoy.convert('bijoy') },
    '-', { label: 'Convert Bijoy text when pasting and opening Word files', checked: Bijoy.auto(), onClick: () => Bijoy.setAuto(!Bijoy.auto()) },
  ]),
  bnFont: a => {
    const cur = docBnFont().toLowerCase();
    Menu.open(a, [{ head: 'Font for Bangla text' },
      ...FONTS.filter(f => f.cat === 'Bangla').map(f => ({ label: f.n, style: `font-family:${fontStack(f.n)}`, sc: fontAvailable(f.n) ? (f.user ? 'yours' : null) : 'not on this device', checked: f.n.toLowerCase() === cur, onClick: () => setDocBnFont(f.n, true) })),
      '-', { label: 'Add a font from a file…', icon: 'plus', onClick: () => UserFonts.pick() }], { cls: 'font-list' });
  },
  quickParts: a => {
    const list = QuickParts.list();
    Menu.open(a, [
      { head: 'Quick Parts' },
      ...(list.length ? list.map(q => ({ label: q.name, title: q.text, onClick: () => QuickParts.insert(q) })) : [{ label: 'No Quick Parts saved yet', disabled: true }]),
      '-', { label: 'Save Selection as Quick Part…', icon: 'plus', onClick: () => Dialogs.saveQuickPart() }, { label: 'Manage Quick Parts…', icon: 'gear', onClick: () => Dialogs.manageQuickParts() },
      { label: Prefs.autocomplete ? 'Turn off AutoComplete suggestions' : 'Turn on AutoComplete suggestions', onClick: () => { Prefs.autocomplete = !Prefs.autocomplete; savePrefs(); } },
    ]);
  },
  symbol: a => {
    const syms = ['©', '®', '™', '§', '¶', '•', '…', '–', '—', '°', '±', '×', '÷', '≈', '≠', '≤', '≥', '∞', '√', '∑', 'π', 'µ', 'Ω', '½', '¼', '¾', '€', '£', '¥', '$', '৳', '₹', '←', '→', '↑', '↓', '⇒', '✓', '✗', '★', '☐', '☒', '♪', '☎', '✉', '¿', '¡', '«', '»', '“', '”', '‘', '’', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯', '০', '।'];
    const grid = h('div', { class: 'sym-grid' }, syms.map(s => { const b = h('button', { type: 'button', title: 'U+' + s.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') }, s); b.addEventListener('click', () => { Menu.close(); insertTextAtCaret(s); }); return b; }));
    Menu.open(a, h('div', null, grid));
  },
  margins: a => { const pg = curPage(); Menu.open(a, [...MARGIN_PRESETS.map(m => ({ label: `${m.label} — top ${fmtLen(m.t)}, bottom ${fmtLen(m.b)}, left ${fmtLen(m.l)}, right ${fmtLen(m.r)}`, checked: pg.mt === m.t && pg.mb === m.b && pg.ml === m.l && pg.mr === m.r, onClick: () => setPage({ mt: m.t, mb: m.b, ml: m.l, mr: m.r }) })), '-', { label: 'Custom Margins…', onClick: () => Dialogs.pageSetup('margins') }]); },
  orientation: a => { const pg = curPage(); Menu.open(a, [{ label: 'Portrait', icon: 'page', checked: pg.orient !== 'landscape', onClick: () => setPage({ orient: 'portrait' }) }, { label: 'Landscape', icon: 'orientation', checked: pg.orient === 'landscape', onClick: () => setPage({ orient: 'landscape' }) }]); },
  size: a => { const pg = curPage(); Menu.open(a, [...PAGE_SIZES.map(p => ({ label: `${p.label} — ${p.w} × ${p.h} ${p.u === 'in' ? 'in' : 'mm'}`, checked: pg.size === p.id, onClick: () => { const s = pageSizePx(p.id); setPage({ size: p.id, w: s.w, h: s.h }); } })), '-', { label: 'Custom Size…', onClick: () => Dialogs.pageSetup('paper') }]); },
  columns: a => Menu.open(a, [{ label: 'One', onClick: () => setColumns(1) }, { label: 'Two', onClick: () => setColumns(2) }, { label: 'Three', onClick: () => setColumns(3) }, '-', { label: 'Columns apply to the selected paragraphs. Long column sections stay on one page.', disabled: true }]),
  breaks: a => Menu.open(a, [
    { head: 'Page Breaks' },
    { label: 'Page Break', sc: `${MOD}+Enter`, icon: 'pagebreak', onClick: () => insertPageBreak() },
    { label: 'Text Wrapping Break', sc: 'Shift+Enter', onClick: () => { focusEditor(); exec('insertLineBreak'); } },
    { head: 'Section Breaks' },
    { sample: 'Next Page', label: 'A new section on the next page', icon: 'sectNext', onClick: () => Sections.insert('next') },
    { sample: 'Continuous', label: 'A new section on the same page', icon: 'sectCont', onClick: () => Sections.insert('cont') },
    { sample: 'Even Page', label: 'A new section on the next even-numbered page', icon: 'sectEven', onClick: () => Sections.insert('even') },
    { sample: 'Odd Page', label: 'A new section on the next odd-numbered page', icon: 'sectOdd', onClick: () => Sections.insert('odd') },
  ]),
  hyphenation: a => Menu.open(a, [{ label: 'None', checked: !S.doc.hyphenate, onClick: () => setHyphenation(false) }, { label: 'Automatic', checked: !!S.doc.hyphenate, onClick: () => setHyphenation(true) }]),
  watermark: a => Menu.open(a, [
    { head: 'Watermark text' },
    ...['DRAFT', 'CONFIDENTIAL', 'URGENT', 'SAMPLE', 'DO NOT COPY', 'COPY'].map(t => ({ label: t, checked: !!(S.doc.watermark && S.doc.watermark.text === t), onClick: () => setWatermark({ text: t, color: '#c0c0c0', opacity: 0.45 }) })),
    '-', { label: 'Custom Watermark…', onClick: () => Dialogs.watermark() }, { label: 'Remove Watermark', onClick: () => setWatermark(null) },
  ]),
  tableStyles: a => Menu.open(a, TABLE_PRESETS.map(p => ({ label: p.label, onClick: () => Tables.setStyle(p.id) }))),
  tableBorders: a => Menu.open(a, bordersMenuItems()),
  tableSelect: a => Menu.open(a, [{ label: 'Select Cell', icon: 'select', onClick: () => Tables.selectPart('cell') }, { label: 'Select Column', icon: 'distCols', onClick: () => Tables.selectPart('col') }, { label: 'Select Row', icon: 'distRows', onClick: () => Tables.selectPart('row') }, { label: 'Select Table', icon: 'table', onClick: () => Tables.selectPart('table') }]),
  borderStyles: a => Menu.open(a, [{ head: 'Border Styles' }, ...BORDER_PRESETS.map(p => ({ label: p.label, sample: lineSample(p.style, p.color, p.width), onClick: () => penAndPaint({ style: p.style, width: p.width, color: p.color }) })), '-', { label: 'Border Painter', icon: 'painter', onClick: () => CMD.borderPainter() }]),
  lineStyle: a => Menu.open(a, BORDER_STYLES.map(([v, l]) => ({ label: l, sample: lineSample(v), checked: Borders.pen().style === v, onClick: () => penAndPaint({ style: v }) }))),
  lineWeight: a => Menu.open(a, BORDER_WIDTHS.map(w => ({ label: fmtBW(w), sample: h('span', { class: 'lsample', style: { borderTop: `${Math.max(1, Math.round(w * 4 / 3))}px solid currentColor` } }), checked: Math.abs(Borders.pen().width - w) < 0.01, onClick: () => penAndPaint({ width: w }) }))),
  penColor: a => Menu.open(a, colorPalette('font', c => penAndPaint({ color: c || '#000000' }))),
  autofit: a => {
    const m = Tables.fitMode(Tables.tableAtCaret());
    Menu.open(a, [
      { label: 'AutoFit Contents', icon: 'fitContents', checked: m === 'contents', title: 'Size each column to fit its text', onClick: () => Tables.autofit('contents') },
      { label: 'AutoFit Window', icon: 'fitWindow', checked: m === 'window', title: 'Stretch the table across the page', onClick: () => Tables.autofit('window') },
      { label: 'Fixed Column Width', icon: 'fitFixed', checked: m === 'fixed', title: 'Keep the column widths as they are', onClick: () => Tables.autofit('fixed') },
    ]);
  },
  deleteTbl: a => Menu.open(a, [{ label: 'Delete Cells…', icon: 'insertCells', onClick: () => CMD.deleteCells() }, { label: 'Delete Columns', icon: 'delCol', onClick: () => CMD.delCol() }, { label: 'Delete Rows', icon: 'delRow', onClick: () => CMD.delRow() }, { label: 'Delete Table', icon: 'delTable', onClick: () => CMD.delTable() }]),
  wrap: a => Menu.open(a, [['inline', 'In Line with Text', 'wrapInline'], ['left', 'Square, picture on the left', 'wrapLeft'], ['right', 'Square, picture on the right', 'wrapRight'], ['center', 'Top and Bottom, centered', 'wrapTop'], ['behind', 'Behind Text', 'wrapBehind'], ['front', 'In Front of Text', 'wrapFront']].map(([v, l, ic]) => ({ label: l, icon: ic, checked: Images.wrapMode() === v, onClick: () => Images.setWrap(v) }))),
  rotate: a => Menu.open(a, [
    { label: 'Rotate Right 90°', icon: 'rotateRight', onClick: () => CMD.rotateRight() }, { label: 'Rotate Left 90°', icon: 'rotateLeft', onClick: () => CMD.rotateLeft() },
    { label: 'Flip Vertical', icon: 'flipV', onClick: () => CMD.flipV() }, { label: 'Flip Horizontal', icon: 'flipH', onClick: () => CMD.flipH() },
    '-', { label: 'More Rotation Options…', onClick: () => CMD.rotateMore() }]),
  signature: a => Sigs.menu(a),
  shapes: a => Shapes.galleryMenu(a),
  textBox: a => Menu.open(a, [{ label: 'Simple Text Box', icon: 'textBox', onClick: () => Shapes.simpleTextBox() }, { label: 'Draw Text Box', icon: 'pen', onClick: () => Shapes.draw('textbox') }]),
  shapeStyles: a => Shapes.presetMenu(a),
  shapeFill: a => Shapes.fillMenu(a),
  shapeOutline: a => Shapes.outlineMenu(a),
  shapeVa: a => Shapes.vaMenu(a),
  shapeWrap: a => Shapes.wrapMenu(a),
  shapeRotate: a => Shapes.rotateMenu(a),
  compare: a => Menu.open(a, [
    { label: 'Compare with an Earlier Version…', icon: 'history', onClick: () => CMD.versions() },
    { label: 'Compare with a Word File…', icon: 'compare', onClick: () => Compare.withFile() }]),
  language: a => Menu.open(a, [['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['bn-BD', 'বাংলা (Bangladesh)'], ['bn-IN', 'বাংলা (India)'], ['hi-IN', 'हिन्दी (India)'], ['ar', 'العربية'], ['fr-FR', 'Français'], ['es-ES', 'Español']].map(([v, l]) => ({ label: l, checked: S.doc.lang === v, onClick: () => { change(() => { S.doc.lang = v; docBody().setAttribute('lang', v); if (Story.cur) Story.cur.el.setAttribute('lang', v); }); UI.refresh(); toast('Proofing language set. Your browser checks spelling with its dictionary for ' + l + ' if it has one.'); } }))),
  trackView: a => Menu.open(a, [['all', 'All Markup'], ['final', 'No Markup'], ['original', 'Original']].map(([v, l]) => ({ label: l, checked: S.tcView === v, onClick: () => Track.setView(v) }))),
  accept: a => Menu.open(a, [{ label: 'Accept and Move to Next', onClick: () => Track.acceptCur(false) }, { label: 'Accept All Changes', onClick: () => Track.acceptAll() }]),
  reject: a => Menu.open(a, [{ label: 'Reject and Move to Next', onClick: () => Track.acceptCur(true) }, { label: 'Reject All Changes', onClick: () => Track.rejectAll() }]),
  deleteComment: a => Menu.open(a, [{ label: 'Delete', onClick: () => { const n = curTextNode(); const c = n && (n.nodeType === 1 ? n : n.parentNode).closest('span.cmt'); if (c) Comments.remove(c.dataset.cid); else toast('Put the cursor in commented text first.'); } }, { label: 'Delete All Comments in Document', onClick: () => Comments.removeAll() }]),
  theme: a => Menu.open(a, [['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => ({ label: l, checked: Prefs.theme === v, onClick: () => { Prefs.theme = v; applyTheme(); savePrefs(); } }))),
  units: a => Menu.open(a, [['in', 'Inches'], ['cm', 'Centimeters'], ['mm', 'Millimeters'], ['pt', 'Points']].map(([v, l]) => ({ label: l, checked: Prefs.units === v, onClick: () => { Prefs.units = v; savePrefs(); Ruler.drawSoon(); UI.refresh(); } }))),
  translate: a => Menu.open(a, [{ label: 'Translate to Bangla', onClick: () => runAssistant('bangla') }, { label: 'Translate to English', onClick: () => runAssistant('english') }]),
  rewrite: a => Menu.open(a, Assistant.ACTIONS.filter(x => !/bangla|english|summary|continue/.test(x[0])).map(([id, label]) => ({ label, onClick: () => runAssistant(id) }))),
  toc: a => Menu.open(a, [{ label: 'Insert Table of Contents', icon: 'toc', onClick: () => Toc.insert() }, { label: 'Update Table', icon: 'resetSize', onClick: () => Toc.update() }, { label: 'Remove Table of Contents', icon: 'trash', onClick: () => Toc.remove() }]),
};
function runAssistant(act) { openPane('assistant'); Proof.setView('write'); setTimeout(() => Assistant.run(act), 30); }
function insertTextAtCaret(s) {
  if (S.readOnly) return;
  focusEditor();
  change(() => { if (S.track) Track.insertText(s); else exec('insertText', s); });
}
function setPageNumbers(where, slot, tpl) { HF.pageNumbers(where, { l: 'left', c: 'center', r: 'right' }[slot] || 'center', /of/.test(tpl || '') ? 'of' : ''); }
function removePageNumbers() { HF.removeNumbers(); }
function setWatermark(w) { change(() => { S.doc.watermark = w; }); renderSheets(); }
function setHyphenation(on) { change(() => { S.doc.hyphenate = on; docBody().style.hyphens = on ? 'auto' : ''; }, { full: true }); }
function setColumns(n) {
  if (S.readOnly || Story.refuse('Columns')) return;
  const blocks = selectedBlocks().map(b => topBlockOf(b)).filter(Boolean);
  const tops = [...new Set(blocks)];
  if (!tops.length) return;
  change(() => {
    const inCols = tops[0].closest('.cols') || (tops[0].classList.contains('cols') ? tops[0] : null);
    if (n === 1) { S.editor.querySelectorAll('.cols').forEach(c => { if (tops.some(t => t === c || c.contains(t))) unwrap(c); }); return; }
    if (inCols) { inCols.style.setProperty('--cols', n); return; }
    const wrap = h('div', { class: 'cols' });
    wrap.style.setProperty('--cols', n);
    tops[0].before(wrap);
    for (const t of tops) wrap.appendChild(t);
  }, { full: true });
}
function tableGridPicker() {
  const R = 8, C = 10;
  const label = h('div', { class: 'gp-label' }, 'Insert Table');
  const grid = h('div', { class: 'gp', style: { gridTemplateColumns: `repeat(${C}, 17px)` } });
  const cells = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const b = h('button', { class: 'gc', type: 'button', 'aria-label': `${c + 1} by ${r + 1} table` });
    b.addEventListener('mouseenter', () => { cells.forEach(x => x.el.classList.toggle('on', x.r <= r && x.c <= c)); label.textContent = `${c + 1} × ${r + 1} Table`; });
    b.addEventListener('focus', () => b.dispatchEvent(new Event('mouseenter')));
    b.addEventListener('click', () => { Menu.close(); Tables.insert(r + 1, c + 1); });
    cells.push({ el: b, r, c });
    grid.appendChild(b);
  }
  return h('div', { class: 'grid-pick' }, label, grid, h('div', { class: 'msep' }), menuItem({ label: 'Insert Table…', icon: 'table', onClick: () => Dialogs.insertTable() }, Menu), menuItem({ label: 'Draw Table', icon: 'drawTable', onClick: () => CMD.drawTable() }, Menu), menuItem({ label: 'Quick table: 3 × 3 with header', icon: 'hdrRow', onClick: () => Tables.insert(3, 3, 'green') }, Menu));
}

/* ===================== Ribbon ===================== */
const UI = {
  refreshers: [],
  ctx: { tdesign: false, picture: false, hf: false },
  build() {
    const tabs = $('#tabs');
    const ribbon = $('#ribbon');
    for (const t of RIBBON) {
      const tb = h('button', { class: 'tab' + (t.id === 'file' ? ' file' : '') + (t.ctx ? ' ctx' : ''), role: 'tab', id: 'tab-' + t.id, 'data-tab': t.id, 'aria-selected': 'false', hidden: t.ctx ? true : null }, t.label);
      tb.addEventListener('mousedown', e => e.preventDefault());
      tb.addEventListener('click', () => { if (t.id === 'file') Backstage.open(); else this.selectTab(t.id, true); });
      tabs.appendChild(tb);
      if (t.id === 'file') continue;
      const panel = h('div', { class: 'rpanel', 'data-panel': t.id, role: 'tabpanel', 'aria-labelledby': 'tab-' + t.id });
      for (const g of t.groups) panel.appendChild(this.group(g));
      ribbon.appendChild(panel);
    }
    tabs.appendChild(h('span', { class: 'spacer' }));
    const col = h('button', { class: 'tb-btn ribbon-toggle', title: `Collapse the ribbon (${MOD}+F1)`, 'aria-label': 'Collapse the ribbon', html: icon('up') });
    col.addEventListener('click', () => this.toggleRibbon());
    tabs.appendChild(col);
    this.colBtn = col;
    ribbon.addEventListener('mousedown', e => { const b = e.target.closest('button'); if (b && !e.target.closest('input')) e.preventDefault(); });
    this.selectTab('home');
  },
  toggleRibbon(force) {
    setTimeout(() => this.fitRibbon(), 0);
    const r = $('#ribbon');
    const on = force != null ? force : !r.classList.contains('collapsed');
    r.classList.toggle('collapsed', on);
    this.colBtn.innerHTML = icon(on ? 'down' : 'up');
    this.colBtn.title = on ? 'Show the ribbon' : `Collapse the ribbon (${MOD}+F1)`;
    lsSet('folio.ribbonCollapsed', on);
    setTimeout(() => { Ruler.drawSoon(); if (S.zoomMode === 'page' || S.zoomMode === 'multi') fitZoom(); }, 0);
  },
  selectTab(id, user) {
    S.tab = id;
    $$('#tabs .tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === id ? 'true' : 'false'));
    this.tabInView();
    $$('#ribbon .rpanel').forEach(p => p.classList.toggle('active', p.dataset.panel === id));
    if (user && $('#ribbon').classList.contains('collapsed')) this.toggleRibbon(false);
    this.fitRibbon();
    this.refresh();
  },
  /* Like Word's ribbon: when the tab is wider than the window, groups marked with a
     collapse order show their small buttons as icons (lowest order first), but only
     if that makes the tab fit; otherwise the ribbon scrolls with every label. */
  fitRibbon() {
    const rib = $('#ribbon');
    const pnl = rib && rib.querySelector('.rpanel.active');
    if (!pnl) return;
    const groups = Array.from(pnl.querySelectorAll(':scope > .rgroup[data-collapse]')).sort((a, b) => a.dataset.collapse - b.dataset.collapse);
    groups.forEach(g => g.classList.remove('icons'));
    if (!groups.length || rib.classList.contains('collapsed') || rib.scrollWidth <= rib.clientWidth + 1) return;
    groups.forEach(g => g.classList.add('icons'));
    if (rib.scrollWidth > rib.clientWidth + 1) { groups.forEach(g => g.classList.remove('icons')); return; }
    for (let i = groups.length - 1; i >= 0; i--) {
      groups[i].classList.remove('icons');
      if (rib.scrollWidth > rib.clientWidth + 1) { groups[i].classList.add('icons'); break; }
    }
  },
  showContext(id, on) {
    if (this.ctx[id] === on) return;
    this.ctx[id] = on;
    const tb = $('#tab-' + id);
    if (tb) tb.hidden = !on;
    if (!on && S.tab === id) this.selectTab('home');
    if (on && (id === 'picture' || id === 'shape')) this.selectTab(id);
    else this.tabInView();
  },
  /* on a narrow screen the tab strip scrolls: keep the chosen tab (contextual ones come last) in view */
  tabInView() {
    const bar = $('#tabs'), tb = bar && bar.querySelector(`.tab[data-tab="${S.tab}"]`);
    if (!tb || tb.hidden || bar.scrollWidth <= bar.clientWidth + 1) return;
    const br = bar.getBoundingClientRect(), r = tb.getBoundingClientRect();
    if (r.left < br.left) bar.scrollLeft -= br.left - r.left + 12;
    else if (r.right > br.right) bar.scrollLeft += r.right - br.right + 12;
  },
  group(g) {
    const body = h('div', { class: 'rgroup-body' });
    for (const it of g.items) body.appendChild(this.item(it));
    const label = h('div', { class: 'rgroup-label' }, g.label);
    if (g.launcher) {
      const lb = h('button', { class: 'launcher', title: g.launcherTip || (g.label + ' settings'), 'aria-label': g.label + ' settings', html: icon('launcher') });
      lb.addEventListener('click', () => CMD[g.launcher]());
      label.appendChild(lb);
    }
    return h('div', { class: 'rgroup', role: 'group', 'aria-label': g.label, 'data-collapse': g.collapse || null }, body, label);
  },
  item(it) {
    if (it.t === 'rows') return h('div', { class: 'rrows' }, it.rows.map(r => h('div', { class: 'rrow' }, r.map(x => this.item(x)))));
    if (it.t === 'stack') return h('div', { class: 'rstack' }, it.items.map(x => this.item(x)));
    if (it.t === 'sep') return h('span', { class: 'rsep' });
    if (it.t === 'el') return it.build();
    return this.button(it);
  },
  button(it) {
    const size = it.big ? 'big' : it.label && !it.iconOnly ? 'lbl' : '';
    const b = h('button', { class: 'rb ' + size, type: 'button', title: it.tip || it.label || '', 'aria-label': it.tip || it.label || '' });
    b.innerHTML = icon(it.icon) + (it.label && !it.iconOnly ? `<span class="cap">${esc(it.label)}</span>` : '');
    if (it.color) { const bar = h('span', { class: 'cbar' }); b.appendChild(bar); b.classList.add('has-bar'); this.refreshers.push(() => { bar.style.background = Prefs[it.color] || '#000'; }); }
    const run = () => { if (it.cmd && CMD[it.cmd]) CMD[it.cmd](); else if (it.menu) Menus[it.menu](b); };
    if (it.menu && !it.split) {
      b.innerHTML += icon('caret', 'caret');
      b.addEventListener('click', () => Menus[it.menu](b));
    } else b.addEventListener('click', run);
    if (it.dbl) b.addEventListener('dblclick', it.dbl);
    if (it.state) this.refreshers.push(() => { const v = !!it.state(); b.setAttribute('aria-pressed', v ? 'true' : 'false'); });
    if (it.enabled) this.refreshers.push(() => { b.disabled = !it.enabled(); });
    if (it.split) {
      const arrow = h('button', { class: 'rb arrow', type: 'button', title: (it.tip || it.label) + ' options', 'aria-label': (it.tip || it.label) + ' options', html: icon('caret') });
      arrow.addEventListener('click', () => Menus[it.menu](arrow));
      if (it.enabled) this.refreshers.push(() => { arrow.disabled = !it.enabled(); });
      return h('span', { class: 'rsplit' + (it.big ? ' big' : '') }, b, arrow);
    }
    return b;
  },
  refresh() {
    if (this._r) return;
    this._r = requestAnimationFrame(() => { this._r = 0; this.refreshNow(); });
  },
  refreshNow() {
    for (const f of this.refreshers) { try { f(); } catch { } }
    const inTable = !!Tables.cellAtCaret() || !!Tables.sel;
    this.showContext('tdesign', inTable);
    this.showContext('picture', !!S.selImg && S.selImg.tagName === 'IMG');
    this.showContext('shape', !!Shapes.cur());
    // font & size boxes
    if (document.activeElement !== $('#fontName')) {
      const cs = curComputed();
      const f = firstFamily(cs.fontFamily);
      $('#fontName').value = f === 'Carlito' ? 'Calibri' : f;
      if (document.activeElement !== $('#fontSize')) $('#fontSize').value = fmtNum(parseFloat(cs.fontSize) * 0.75, 1);
    }
    const sk = blockStyleKey(blockOf(curTextNode()));
    $$('.gal-item').forEach(g => g.setAttribute('aria-pressed', g.dataset.style === sk ? 'true' : 'false'));
    if (S.pane === 'styles') $$('#sidePane .st-item').forEach(r => r.classList.toggle('on', r.dataset.style === sk));
    $('#sbTrack').hidden = !S.track;
    const av = $('#sbAvro');
    if (av) {
      av.querySelector('.t').textContent = S.bijoy ? 'ক Bijoy' : S.avro ? 'অ Avro' : 'ENG';
      av.classList.toggle('on', !!(S.avro || S.bijoy));
      av.title = S.bijoy ? 'Bijoy keyboard is on. Click or press F12 (or Ctrl+Alt+B) for English.' : S.avro ? 'Avro Phonetic is on: type Bangla in English letters. Click or press F12 for English.' : `Typing English. Click or press F12 to type Bangla (${Prefs.bnKbd === 'bijoy' ? 'Bijoy' : 'Avro Phonetic'}).`;
    }
    $$('.sb-views .sb-item').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === (S.view === 'focus' ? 'print' : S.view) ? 'true' : 'false'));
    const lang = $('#sbLang'); if (lang) lang.textContent = ({ 'en-US': 'English (US)', 'en-GB': 'English (UK)', 'bn-BD': 'বাংলা', 'bn-IN': 'বাংলা (IN)' })[S.doc.lang] || S.doc.lang;
    updateUndoButtons();
  },
};
function fontCombo() {
  const inp = h('input', { id: 'fontName', 'aria-label': 'Font', autocomplete: 'off', spellcheck: 'false' });
  const drop = h('button', { class: 'drop', type: 'button', title: 'Choose a font', 'aria-label': 'Choose a font', html: icon('caret') });
  const box = h('div', { class: 'combo font', title: 'Font (Ctrl+Shift+F)' }, inp, drop);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const v = inp.value.trim(); if (v) { const f = FONTS.find(x => x.n.toLowerCase() === v.toLowerCase()); setFontFamily(f ? f.n : v); } S.editor.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); UI.refreshNow(); focusEditor(); }
  });
  inp.addEventListener('focus', () => inp.select());
  drop.addEventListener('click', () => {
    ensureAllFonts();
    const cur = inp.value.toLowerCase();
    const items = [];
    const rec = (Prefs.recentFonts || []).filter(Boolean);
    if (rec.length) { items.push({ head: 'Recently Used' }); rec.forEach(n => items.push({ label: n, style: `font-family:${fontStack(n)}`, checked: n.toLowerCase() === cur, onClick: () => setFontFamily(n) })); }
    for (const cat of ['Mine', 'Office', 'Web', 'Bangla']) {
      const list = FONTS.filter(f => f.cat === cat);
      if (!list.length) continue;
      items.push({ head: cat === 'Mine' ? 'Your fonts' : cat === 'Office' ? 'Office fonts (with free look-alikes)' : cat === 'Web' ? 'More fonts' : 'বাংলা ফন্ট · Bangla fonts' });
      list.forEach(f => {
        const missing = !fontAvailable(f.n);
        items.push({ label: f.n, style: `font-family:${fontStack(f.n)}`, sc: missing ? 'not on this device' : (f.user ? 'yours' : null), title: missing ? `${f.n} isn’t installed here, so a look-alike is used. Add the font file to use it everywhere.` : null, checked: f.n.toLowerCase() === cur, onClick: () => setFontFamily(f.n) });
      });
    }
    items.push('-', { label: 'Font for Bangla text', sc: docBnFont(), icon: 'bangla', onClick: () => Menus.bnFont(box) }, { label: 'Add a font from a file…', icon: 'plus', onClick: () => UserFonts.pick() });
    const pop = Menu.open(box, items, { cls: 'font-list' });
    pop.style.width = '260px';
    const sel = pop.querySelector('[aria-checked="true"]');
    if (sel) sel.scrollIntoView({ block: 'center' });
  });
  return box;
}
function sizeCombo() {
  const inp = h('input', { id: 'fontSize', 'aria-label': 'Font size', autocomplete: 'off', inputmode: 'decimal' });
  const drop = h('button', { class: 'drop', type: 'button', title: 'Choose a size', 'aria-label': 'Choose a size', html: icon('caret') });
  const box = h('div', { class: 'combo size', title: 'Font Size (Ctrl+Shift+P)' }, inp, drop);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setFontSize(inp.value); S.editor.focus(); } if (e.key === 'Escape') { e.preventDefault(); focusEditor(); } });
  inp.addEventListener('focus', () => inp.select());
  drop.addEventListener('click', () => { const cur = parseFloat(inp.value); const pop = Menu.open(box, FONT_SIZES.map(s => ({ label: String(s), checked: s === cur, onClick: () => setFontSize(s) }))); pop.style.minWidth = '80px'; });
  return box;
}
function styleGallery() {
  // the styles are drawn by Styles.fillGallery (again when a style changes or one is added)
  const items = h('div', { class: 'gallery-items', id: 'styleGalleryItems' });
  setTimeout(() => Styles.fillGallery(), 0);
  const up = h('button', { type: 'button', title: 'Previous styles', 'aria-label': 'Previous styles', html: icon('up') });
  const dn = h('button', { type: 'button', title: 'Next styles', 'aria-label': 'Next styles', html: icon('down') });
  const more = h('button', { type: 'button', title: 'All styles', 'aria-label': 'All styles', html: icon('more') });
  up.addEventListener('click', () => items.scrollBy({ left: -240, behavior: 'smooth' }));
  dn.addEventListener('click', () => items.scrollBy({ left: 240, behavior: 'smooth' }));
  more.addEventListener('click', () => Menus.styles(more));
  return h('div', { class: 'gallery' }, items, h('div', { class: 'gallery-nav' }, up, dn, more));
}
function spinInput(id, label, get, set) {
  const inp = h('input', { id, 'aria-label': label, autocomplete: 'off' });
  inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const obj = S.selImg;
    set(inp.value);
    S.editor.focus();
    // a selected picture or shape stays selected
    if (obj && obj.isConnected && S.selImg === obj) { const r = document.createRange(); r.selectNode(obj); setRange(r); Images.refreshFrame(); }
  });
  inp.addEventListener('change', () => set(inp.value));
  UI.refreshers.push(() => { if (document.activeElement !== inp) inp.value = get(); });
  return h('label', { class: 'spin' }, label, inp);
}
const tSel = () => !!Tables.cellAtCaret() || !!Tables.sel;
const BORDER_PRESETS = [
  { label: 'Single solid line, ½ pt', style: 'solid', width: 0.5, color: '#000000' },
  { label: 'Single solid line, 1 pt', style: 'solid', width: 1, color: '#000000' },
  { label: 'Single solid line, 1½ pt', style: 'solid', width: 1.5, color: '#000000' },
  { label: 'Single solid line, 3 pt', style: 'solid', width: 3, color: '#000000' },
  { label: 'Double solid lines, ½ pt', style: 'double', width: 0.5, color: '#000000' },
  { label: 'Dotted line, ½ pt', style: 'dotted', width: 0.5, color: '#000000' },
  { label: 'Dashed line, ½ pt', style: 'dashed', width: 0.5, color: '#000000' },
  { label: 'Single solid line, ½ pt, gray', style: 'solid', width: 0.5, color: '#808080' },
  { label: 'Single solid line, ½ pt, green', style: 'solid', width: 0.5, color: '#1d6a50' },
  { label: 'Single solid line, ½ pt, blue', style: 'solid', width: 0.5, color: '#2f5597' },
];
function bordersMenuItems() {
  const inT = Borders.inTable();
  const q = k => () => Borders.quick(k);
  const items = [
    { label: 'Bottom Border', icon: 'borderBottom', onClick: q('bottom') }, { label: 'Top Border', icon: 'borderTop', onClick: q('top') },
    { label: 'Left Border', icon: 'borderLeft', onClick: q('left') }, { label: 'Right Border', icon: 'borderRight', onClick: q('right') }, '-',
    { label: 'No Border', icon: 'borderNone', onClick: q('none') }, { label: 'All Borders', icon: 'borderAll', onClick: q('all') },
    { label: 'Outside Borders', icon: 'borderOuter', onClick: q('outside') }, { label: 'Inside Borders', icon: 'borderInside', onClick: q('inside') }, '-',
    { label: inT ? 'Inside Horizontal Border' : 'Border Between Paragraphs', icon: 'borderInsideH', onClick: q('insideH') },
  ];
  if (inT) items.push({ label: 'Inside Vertical Border', icon: 'borderInsideV', onClick: q('insideV') }, { label: 'Diagonal Down Border', icon: 'borderDiagDown', onClick: q('diagDown') }, { label: 'Diagonal Up Border', icon: 'borderDiagUp', onClick: q('diagUp') });
  items.push('-', { label: 'Horizontal Line', icon: 'hr', onClick: () => insertHR() }, { label: 'Draw Table', icon: 'drawTable', onClick: () => CMD.drawTable() }, { label: 'View Gridlines', icon: 'gridlines', checked: Prefs.gridlines !== false, onClick: () => CMD.gridlines() }, { label: 'Borders and Shading…', icon: 'borders', onClick: () => CMD.bordersShading() });
  return items;
}
/* the pen for drawing and painting table lines: style, weight and colour */
function penPicker(kind) {
  const b = h('button', { class: 'rb lbl pen-pick', type: 'button' });
  const tips = { style: 'Line Style', width: 'Line Weight', color: 'Pen Color' };
  b.title = tips[kind]; b.setAttribute('aria-label', tips[kind]);
  b.addEventListener('click', () => Menus[kind === 'style' ? 'lineStyle' : kind === 'width' ? 'lineWeight' : 'penColor'](b));
  UI.refreshers.push(() => {
    const p = Borders.pen();
    b.innerHTML = '';
    if (kind === 'color') b.append(iconEl('penColor'), h('span', { class: 'cap' }, 'Pen Color'), h('span', { class: 'pen-sw', style: { background: p.color } }));
    else if (kind === 'style') b.append(lineSample(p.style), iconEl('caret', 'caret'));
    else b.append(h('span', { class: 'cap pen-w' }, fmtBW(p.width)), iconEl('caret', 'caret'));
  });
  return b;
}
/* as in Word, choosing a pen in a table turns on the Border Painter */
function penAndPaint(o) { Borders.setPen(o); if (Borders.inTable() && !S.readOnly && TDraw.mode !== 'painter' && TDraw.mode !== 'pen') TDraw.set('painter'); }
function applyGridlines() { const p = $('#paper'); if (p) p.classList.toggle('no-gridlines', Prefs.gridlines === false); Tables.gridlines(); }
const RIBBON = [
  { id: 'file', label: 'File' },
  { id: 'home', label: 'Home', groups: [
    { label: 'Clipboard', items: [
      { cmd: 'paste', icon: 'paste', label: 'Paste', big: true, split: true, menu: 'paste', tip: `Paste (${MOD}+V)` },
      { t: 'stack', items: [{ cmd: 'cut', icon: 'cut', label: 'Cut', tip: `Cut (${MOD}+X)` }, { cmd: 'copy', icon: 'copy', label: 'Copy', tip: `Copy (${MOD}+C)` }, { cmd: 'painter', icon: 'painter', label: 'Format Painter', tip: 'Format Painter: copy formatting to other text. Double-click to keep it on.', state: () => !!S.painter, dbl: () => Painter.start(true) }] },
    ] },
    { label: 'Font', launcher: 'fontDialog', items: [{ t: 'rows', rows: [
      [{ t: 'el', build: fontCombo }, { t: 'el', build: sizeCombo }, { cmd: 'grow', icon: 'grow', tip: `Increase Font Size (${MOD}+Shift+>)` }, { cmd: 'shrink', icon: 'shrink', tip: `Decrease Font Size (${MOD}+Shift+<)` }, { menu: 'case', icon: 'case', tip: 'Change Case (Shift+F3)' }, { cmd: 'clearFmt', icon: 'clearfmt', tip: 'Clear All Formatting' }],
      [{ cmd: 'bold', icon: 'bold', tip: `Bold (${MOD}+B)`, state: () => qstate('bold') }, { cmd: 'italic', icon: 'italic', tip: `Italic (${MOD}+I)`, state: () => qstate('italic') },
        { cmd: 'underline', icon: 'underline', tip: `Underline (${MOD}+U)`, split: true, menu: 'underline', state: () => qstate('underline') },
        { cmd: 'strike', icon: 'strike', tip: 'Strikethrough', state: () => qstate('strikeThrough') }, { cmd: 'sub', icon: 'sub', tip: `Subscript (${MOD}+=)`, state: () => qstate('subscript') }, { cmd: 'sup', icon: 'sup', tip: `Superscript (${MOD}+Shift++)`, state: () => qstate('superscript') },
        { t: 'sep' },
        { cmd: 'highlight', icon: 'highlight', tip: 'Text Highlight Color', split: true, menu: 'highlight', color: 'highlight' },
        { cmd: 'fontColor', icon: 'fontcolor', tip: 'Font Color', split: true, menu: 'fontColor', color: 'fontColor' }],
    ] }] },
    { label: 'Paragraph', launcher: 'paragraphDialog', items: [{ t: 'rows', rows: [
      [{ cmd: 'bullets', icon: 'bullets', tip: `Bullets (${MOD}+Shift+L)`, split: true, menu: 'bullets', state: () => curListType() === 'ul' }, { cmd: 'numbering', icon: 'numbering', tip: 'Numbering', split: true, menu: 'numbering', state: () => curListType() === 'ol' },
        { menu: 'multilevel', icon: 'multilevel', tip: 'Multilevel List: 1. / 1.1. / 1.1.1., ১। / (ক) / (১) and more' }, { cmd: 'checklist', icon: 'checklist', tip: 'Checklist', state: () => curListType() === 'check' }, { cmd: 'outdent', icon: 'outdent', tip: `Decrease Indent (${MOD}+Shift+M)` }, { cmd: 'indent', icon: 'indent', tip: `Increase Indent (${MOD}+M)` },
        { menu: 'sort', icon: 'sort', tip: 'Sort' }, { cmd: 'marks', icon: 'pilcrow', tip: `Show/Hide formatting marks (${MOD}+Shift+8)`, state: () => S.marks }],
      [{ cmd: 'alignLeft', icon: 'alignLeft', tip: `Align Left (${MOD}+L)`, state: () => curAlign() === 'left' }, { cmd: 'alignCenter', icon: 'alignCenter', tip: `Center (${MOD}+E)`, state: () => curAlign() === 'center' },
        { cmd: 'alignRight', icon: 'alignRight', tip: `Align Right (${MOD}+R)`, state: () => curAlign() === 'right' }, { cmd: 'justify', icon: 'justify', tip: `Justify (${MOD}+J)`, state: () => curAlign() === 'justify' },
        { t: 'sep' }, { menu: 'lineSpacing', icon: 'lineSpacing', tip: 'Line and Paragraph Spacing' },
        { cmd: 'shading', icon: 'shading', tip: 'Shading', split: true, menu: 'shading', color: 'shade' }, { cmd: 'bordersQuick', icon: 'borders', tip: 'Borders', split: true, menu: 'borders' }],
    ] }] },
    { label: 'Styles', launcher: 'stylesPane', launcherTip: 'Styles pane: change, make and manage styles', items: [{ t: 'el', build: styleGallery }] },
    { label: 'Editing', items: [{ t: 'stack', items: [{ cmd: 'find', icon: 'find', label: 'Find', tip: `Find (${MOD}+F)` }, { cmd: 'replace', icon: 'replace', label: 'Replace', tip: `Replace (${MOD}+H)` }, { cmd: 'selectAll', icon: 'select', label: 'Select All', tip: `Select All (${MOD}+A)` }] }] },
    { label: 'Claude', items: [{ cmd: 'assistant', icon: 'sparkle', label: 'Write with Claude', big: true, tip: 'Draft, rewrite or translate with Claude', state: () => S.pane === 'assistant' }] },
  ] },
  { id: 'insert', label: 'Insert', groups: [
    { label: 'Pages', items: [{ cmd: 'pageBreak', icon: 'pagebreak', label: 'Page Break', big: true, tip: `Page Break (${MOD}+Enter)` }, { t: 'stack', items: [{ cmd: 'blankPage', icon: 'page', label: 'Blank Page' }] }] },
    { label: 'Tables', items: [{ menu: 'table', icon: 'table', label: 'Table', big: true }] },
    { label: 'Illustrations', items: [{ cmd: 'picture', icon: 'image', label: 'Pictures', big: true, tip: 'Insert a picture from this device' }, { menu: 'shapes', icon: 'shapes', label: 'Shapes', big: true, tip: 'Lines, arrows, boxes, circles, callouts: pick one, then drag on the page' }, { menu: 'signature', icon: 'signature', label: 'Signature', big: true, tip: 'Your signatures and office stamps: insert one, draw one or add one from a photo' }, { t: 'stack', items: [{ cmd: 'hr', icon: 'hr', label: 'Horizontal Line' }] }] },
    { label: 'Links', items: [{ cmd: 'link', icon: 'link', label: 'Link', big: true, tip: `Link (${MOD}+K)` }] },
    { label: 'Comments', items: [{ cmd: 'comment', icon: 'commentAdd', label: 'Comment', big: true, tip: `New Comment (${MOD}+Alt+M)` }] },
    { label: 'Header & Footer', items: [{ t: 'stack', items: [{ menu: 'header', icon: 'header', label: 'Header' }, { menu: 'footer', icon: 'footer', label: 'Footer' }, { menu: 'pageNumber', icon: 'pagenum', label: 'Page Number' }] }] },
    { label: 'Office', items: [{ menu: 'officeLetter', icon: 'govLetter', label: 'Office Letter', big: true, tip: 'Government letters from your office profile: স্মারক নম্বর, তারিখ, বিষয়, সূত্র, বিতরণ' }] },
    { label: 'Fields', items: [{ cmd: 'fillFields', icon: 'field', label: 'Fill Fields', big: true, tip: 'Fill every [field] in the document', state: () => S.pane === 'fields' }, { t: 'stack', items: [{ cmd: 'nextField', icon: 'nextField', label: 'Next Field', tip: 'Next Field (F11)' }, { cmd: 'insertField', icon: 'plus', label: 'Insert Field' }] }] },
    { label: 'Text', items: [{ menu: 'textBox', icon: 'textBox', label: 'Text Box', big: true, tip: 'A box of text you can place anywhere on the page' }, { t: 'stack', items: [{ menu: 'quickParts', icon: 'quickparts', label: 'Quick Parts' }, { menu: 'date', icon: 'date', label: 'Date & Time' }, { cmd: 'textFromFile', icon: 'textfile', label: 'Text from File' }] }] },
    { label: 'Symbols', items: [{ menu: 'symbol', icon: 'symbol', label: 'Symbol', big: true }] },
  ] },
  { id: 'layout', label: 'Layout', groups: [
    { label: 'Page Setup', launcher: 'pageSetup', items: [
      { menu: 'margins', icon: 'margins', label: 'Margins', big: true }, { menu: 'orientation', icon: 'orientation', label: 'Orientation', big: true }, { menu: 'size', icon: 'size', label: 'Size', big: true }, { menu: 'columns', icon: 'columns', label: 'Columns', big: true },
      { t: 'stack', items: [{ menu: 'breaks', icon: 'pagebreak', label: 'Breaks' }, { menu: 'hyphenation', icon: 'hyphen', label: 'Hyphenation' }] },
    ] },
    { label: 'Page Background', items: [{ menu: 'watermark', icon: 'watermark', label: 'Watermark', big: true }, { menu: 'pageColor', icon: 'pagecolor', label: 'Page Color', big: true }, { cmd: 'pageBorder', icon: 'pageborder', label: 'Page Borders', big: true, state: () => !!(S.doc && S.doc.page.border) }] },
    { label: 'Paragraph', launcher: 'paragraphDialog', items: [{ t: 'rows', rows: [
      [{ t: 'el', build: () => spinInput('spIndL', 'Indent left', () => { const p = paraInfo(); return p ? fmtLen(p.left) : ''; }, v => { const px = parseLen(v); if (!isNaN(px)) applyParagraph({ left: px }); }) }, { t: 'el', build: () => spinInput('spBefore', 'Spacing before', () => { const p = paraInfo(); return p ? fmtNum(p.before, 1) + ' pt' : ''; }, v => { const n = parseFloat(v); if (!isNaN(n)) applyParagraph({ before: n }); }) }],
      [{ t: 'el', build: () => spinInput('spIndR', 'Indent right', () => { const p = paraInfo(); return p ? fmtLen(p.right) : ''; }, v => { const px = parseLen(v); if (!isNaN(px)) applyParagraph({ right: px }); }) }, { t: 'el', build: () => spinInput('spAfter', 'Spacing after', () => { const p = paraInfo(); return p ? fmtNum(p.after, 1) + ' pt' : ''; }, v => { const n = parseFloat(v); if (!isNaN(n)) applyParagraph({ after: n }); }) }],
    ] }] },
  ] },
  { id: 'references', label: 'References', groups: [
    { label: 'Table of Contents', items: [{ menu: 'toc', icon: 'toc', label: 'Table of Contents', big: true }, { t: 'stack', items: [{ cmd: 'tocUpdate', icon: 'resetSize', label: 'Update Table' }, { cmd: 'tocRemove', icon: 'trash', label: 'Remove Table' }] }] },
    { label: 'Footnotes', launcher: 'noteDialog', launcherTip: 'Footnote and Endnote…', items: [{ cmd: 'footnote', icon: 'footnote', label: 'Insert Footnote', big: true, tip: `Insert Footnote (${MOD}+Alt+F): a numbered note at the bottom of the page` }, { t: 'stack', items: [{ cmd: 'endnote', icon: 'endnote', label: 'Insert Endnote', tip: `Insert Endnote (${MOD}+Alt+D): a note at the end of the document` }, { cmd: 'nextFootnote', icon: 'next', label: 'Next Footnote', split: true, menu: 'nextNote' }, { cmd: 'showNotes', icon: 'notes', label: 'Show Notes', tip: 'Go to the note of the mark at the cursor, or to this page’s notes' }] }] },
    { label: 'Navigation', items: [{ cmd: 'nav', icon: 'nav', label: 'Navigation Pane', big: true, state: () => S.nav }, { t: 'stack', items: [{ cmd: 'goTo', icon: 'next', label: 'Go To Page…', tip: `Go To (${MOD}+G)` }] }] },
  ] },
  { id: 'review', label: 'Review', groups: [
    { label: 'Proofing', items: [{ cmd: 'spelling', icon: 'spell', label: 'Spelling', big: true, tip: 'Check spelling as you type', state: () => Prefs.spell }, { cmd: 'proofread', icon: 'proof', label: 'Proofread', big: true, tip: 'Claude checks spelling, grammar and punctuation, Bangla and English, and marks each fix as a tracked change' }, { t: 'stack', items: [{ cmd: 'wordCount', icon: 'wordcount', label: 'Word Count', tip: `Word Count (${MOD}+Shift+G)` }, { menu: 'language', icon: 'globe', label: 'Language' }] }] },
    { label: 'Bangla', items: [{ cmd: 'avro', icon: 'avro', label: 'Avro Phonetic', big: true, tip: 'Type Bangla in English letters, the Avro way (F12)', state: () => S.avro }, { cmd: 'bijoy', icon: 'bijoy', label: 'Bijoy', big: true, split: true, menu: 'bijoy', tip: 'Type with the Bijoy keyboard layout (Ctrl+Alt+B)', state: () => S.bijoy }, { t: 'stack', items: [{ menu: 'bnConvert', icon: 'bnConvert', label: 'Convert', tip: 'Convert between Bijoy (SutonnyMJ) text and Unicode' }, { cmd: 'bnFont', icon: 'bangla', label: 'Bangla Font' }, { cmd: 'addFont', icon: 'plus', label: 'Add Font File' }] }] },
    { label: 'Speech', items: [{ cmd: 'readAloud', icon: 'speak', label: 'Read Aloud', big: true, state: () => Speech.on }] },
    { label: 'Comments', items: [{ cmd: 'newComment', icon: 'commentAdd', label: 'New Comment', big: true, tip: `New Comment (${MOD}+Alt+M)` }, { t: 'stack', items: [{ menu: 'deleteComment', icon: 'trash', label: 'Delete' }, { cmd: 'prevComment', icon: 'prev', label: 'Previous' }, { cmd: 'nextComment', icon: 'next', label: 'Next' }] }, { cmd: 'showComments', icon: 'comment', label: 'Show Comments', big: true, state: () => S.pane === 'comments' }] },
    { label: 'Tracking', items: [{ cmd: 'track', icon: 'track', label: 'Track Changes', big: true, tip: `Track Changes (${MOD}+Shift+E)`, state: () => S.track }, { t: 'stack', items: [{ menu: 'trackView', icon: 'page', label: 'Markup View' }] }] },
    { label: 'Changes', items: [{ cmd: 'acceptChange', icon: 'accept', label: 'Accept', big: true, split: true, menu: 'accept' }, { cmd: 'rejectChange', icon: 'reject', label: 'Reject', big: true, split: true, menu: 'reject' }, { t: 'stack', items: [{ cmd: 'prevChange', icon: 'prev', label: 'Previous' }, { cmd: 'nextChange', icon: 'next', label: 'Next' }] }] },
    { label: 'Compare', items: [{ menu: 'compare', icon: 'compare', label: 'Compare', big: true, tip: 'See what changed since an earlier version, or between this document and a Word file' }, { cmd: 'versions', icon: 'history', label: 'Version History', big: true, tip: 'Earlier versions of this document: look, compare or restore' }] },
    { label: 'Protect', items: [{ cmd: 'restrict', icon: 'lock', label: 'Restrict Editing', big: true, tip: 'Make this document read-only', state: () => S.readOnly }] },
  ] },
  { id: 'view', label: 'View', groups: [
    { label: 'Views', items: [{ cmd: 'readMode', icon: 'book', label: 'Read Mode', big: true, state: () => S.view === 'read' }, { cmd: 'printLayout', icon: 'page', label: 'Print Layout', big: true, state: () => S.view === 'print' }, { cmd: 'webLayout', icon: 'web', label: 'Web Layout', big: true, state: () => S.view === 'web' }, { cmd: 'focus', icon: 'focus', label: 'Focus', big: true, state: () => S.view === 'focus' }] },
    { label: 'Show', items: [{ t: 'stack', items: [{ cmd: 'ruler', icon: 'ruler', label: 'Ruler', state: () => S.ruler }, { cmd: 'nav', icon: 'nav', label: 'Navigation Pane', state: () => S.nav }, { cmd: 'marks', icon: 'pilcrow', label: 'Formatting Marks', state: () => S.marks }] }] },
    { label: 'Zoom', items: [{ cmd: 'zoomDialog', icon: 'zoom', label: 'Zoom', big: true }, { cmd: 'zoom100', icon: 'page', label: '100%', big: true }, { t: 'stack', items: [{ cmd: 'onePage', icon: 'onepage', label: 'One Page', state: () => S.zoomMode === 'page' }, { cmd: 'multiPage', icon: 'multipage', label: 'Multiple Pages', tip: 'Show pages side by side', state: () => S.zoomMode === 'multi' }, { cmd: 'pageWidth', icon: 'pagewidth', label: 'Page Width', state: () => S.zoomMode === 'width' }] }] },
    { label: 'Appearance', items: [{ t: 'stack', items: [{ menu: 'theme', icon: 'moon', label: 'Theme' }, { menu: 'units', icon: 'ruler', label: 'Units' }] }] },
  ] },
  { id: 'claude', label: 'Claude', groups: [
    { label: 'Write', items: [{ cmd: 'assistant', icon: 'sparkle', label: 'Open Assistant', big: true, state: () => S.pane === 'assistant' }] },
    { label: 'Rewrite selection', items: [{ t: 'el', build: () => { const b = UI.button({ icon: 'edit', label: 'Improve', big: true, tip: 'Improve the selected text' }); b.addEventListener('click', () => runAssistant('improve')); return b; } }, { t: 'el', build: () => { const b = UI.button({ icon: 'spell', label: 'Fix Grammar', big: true }); b.addEventListener('click', () => runAssistant('grammar')); return b; } }, { menu: 'rewrite', icon: 'replace', label: 'Rewrite', big: true }, { menu: 'translate', icon: 'translate', label: 'Translate', big: true }] },
    { label: 'Document', items: [{ cmd: 'proofread', icon: 'proof', label: 'Proofread', big: true, tip: 'Claude checks spelling, grammar and punctuation, Bangla and English, and marks each fix as a tracked change' }, { t: 'el', build: () => { const b = UI.button({ icon: 'summarize', label: 'Summarize', big: true }); b.addEventListener('click', () => runAssistant('summary')); return b; } }, { t: 'el', build: () => { const b = UI.button({ icon: 'next', label: 'Continue Writing', big: true }); b.addEventListener('click', () => runAssistant('continue')); return b; } }] },
  ] },
  /* one contextual tab for tables (the page already has a Layout tab): Word's table Layout tools first, then its Table Design tools */
  { id: 'tdesign', label: 'Table Design', ctx: true, groups: [
    { label: 'Table', collapse: 3, items: [{ t: 'stack', items: [{ menu: 'tableSelect', icon: 'selectTable', label: 'Select' }, { cmd: 'gridlines', icon: 'gridlines', label: 'View Gridlines', state: () => Prefs.gridlines !== false, tip: 'Show dashed lines where a table has no borders' }] }] },
    { label: 'Draw', items: [{ cmd: 'drawTable', icon: 'drawTable', label: 'Draw Table', big: true, state: () => TDraw.mode === 'pen', tip: 'Draw Table: drag to draw a table or draw lines to split cells' }, { cmd: 'eraser', icon: 'eraser', label: 'Eraser', big: true, state: () => TDraw.mode === 'eraser', tip: 'Eraser: click a line to merge cells or remove a border' }] },
    { label: 'Rows & Columns', collapse: 4, launcher: 'insertCells', launcherTip: 'Insert Cells…', items: [{ menu: 'deleteTbl', icon: 'delTable', label: 'Delete', big: true }, { cmd: 'rowAbove', icon: 'rowAbove', label: 'Insert Above', big: true, enabled: tSel }, { cmd: 'rowBelow', icon: 'rowBelow', label: 'Insert Below', big: true, enabled: tSel }, { t: 'stack', items: [{ cmd: 'colLeft', icon: 'colLeft', label: 'Insert Left', enabled: tSel }, { cmd: 'colRight', icon: 'colRight', label: 'Insert Right', enabled: tSel }] }] },
    { label: 'Merge', collapse: 5, items: [{ t: 'stack', items: [{ cmd: 'merge', icon: 'merge', label: 'Merge Cells', tip: 'Drag across cells to select them, then merge' }, { cmd: 'split', icon: 'split', label: 'Split Cells', tip: 'Split the selected cells into more rows or columns' }, { cmd: 'splitTable', icon: 'splitTable', label: 'Split Table', tip: 'Start a new table at the current row' }] }] },
    { label: 'Cell Size', collapse: 1, items: [{ menu: 'autofit', icon: 'autofit', label: 'AutoFit', big: true, tip: 'AutoFit: size the columns to their contents, to the page, or fix their widths' }, { t: 'stack', items: [{ cmd: 'distributeRows', icon: 'distRows', label: 'Distribute Rows' }, { cmd: 'distribute', icon: 'distCols', label: 'Distribute Columns' }] }] },
    { label: 'Alignment', items: [{ t: 'rows', rows: [[{ cmd: 'vTop', icon: 'vTop', tip: 'Align Top' }, { cmd: 'vMid', icon: 'vMid', tip: 'Align Center Vertically' }, { cmd: 'vBottom', icon: 'vBottom', tip: 'Align Bottom' }], [{ cmd: 'alignLeft', icon: 'alignLeft', tip: 'Align Left' }, { cmd: 'alignCenter', icon: 'alignCenter', tip: 'Center' }, { cmd: 'alignRight', icon: 'alignRight', tip: 'Align Right' }, { cmd: 'alignDecimal', icon: 'alignDecimal', tip: 'Line numbers up on the decimal point', state: () => curAlign() === 'decimal' }]] }] },
    { label: 'Table Styles', collapse: 2, items: [{ cmd: 'cellShade', icon: 'shading', label: 'Shading', big: true, split: true, menu: 'cellShade' }, { t: 'stack', items: [{ menu: 'tableStyles', icon: 'table', label: 'Styles' }, { cmd: 'hdrRow', icon: 'hdrRow', label: 'Header Row', state: () => { const t = Tables.tableAtCaret(); return t && t.classList.contains('hdr'); } }, { cmd: 'banded', icon: 'banded', label: 'Banded Rows', state: () => { const t = Tables.tableAtCaret(); return t && t.classList.contains('band'); } }] }] },
    { label: 'Borders', launcher: 'bordersShading', launcherTip: 'Borders and Shading…', items: [
      { menu: 'borderStyles', icon: 'lineStyle', label: 'Border Styles', big: true },
      { t: 'stack', items: [{ t: 'el', build: () => penPicker('style') }, { t: 'el', build: () => penPicker('width') }, { t: 'el', build: () => penPicker('color') }] },
      { cmd: 'bordersQuick', icon: 'borders', label: 'Borders', big: true, split: true, menu: 'tableBorders', tip: 'Borders: apply the last border to the selected cells' },
      { cmd: 'borderPainter', icon: 'painter', label: 'Border Painter', big: true, state: () => TDraw.mode === 'painter', tip: 'Border Painter: click table lines to give them the pen style' },
    ] },
  ] },
  /* while a header or footer is being edited (HF) */
  { id: 'hf', label: 'Header & Footer', ctx: true, groups: [
    { label: 'Header & Footer', items: [{ menu: 'header', icon: 'header', label: 'Header', big: true }, { menu: 'footer', icon: 'footer', label: 'Footer', big: true }, { menu: 'pageNumber', icon: 'pagenum', label: 'Page Number', big: true }] },
    { label: 'Insert', items: [{ cmd: 'hfDate', icon: 'date', label: 'Date', big: true, tip: 'Today’s date, kept up to date' }, { menu: 'hfInfo', icon: 'field', label: 'Document Info', big: true }, { cmd: 'picture', icon: 'image', label: 'Pictures', big: true, tip: 'A logo or a picture from this device' }, { cmd: 'hfLine', icon: 'hr', label: 'Line Below', big: true, tip: 'A line under the paragraph at the cursor' }] },
    { label: 'Navigation', items: [{ cmd: 'hfToHeader', icon: 'header', label: 'Go to Header', big: true, state: () => !!(HF.editing && HF.editing.kind === 'header') }, { cmd: 'hfToFooter', icon: 'footer', label: 'Go to Footer', big: true, state: () => !!(HF.editing && HF.editing.kind === 'footer') }, { t: 'stack', items: [{ cmd: 'hfPrev', icon: 'prev', label: 'Previous' }, { cmd: 'hfNext', icon: 'next', label: 'Next' }, { cmd: 'hfLink', icon: 'linkPrev', label: 'Link to Previous', tip: 'Link to Previous: this section shows the header (or footer) of the section before it. Turn it off to give this section its own.', state: () => !!(HF.editing && HF.linked(HF.editing.kind, HF.editing.sec)), enabled: () => !!(HF.editing && HF.editing.sec > 0) }] }] },
    { label: 'Options', items: [{ t: 'stack', items: [{ cmd: 'hfFirst', icon: 'onepage', label: 'Different First Page', state: () => !!(S.doc && HF.firstOn(HF.curSec())) }, { cmd: 'hfEven', icon: 'multipage', label: 'Different Odd & Even Pages', state: () => !!S.doc.evenDiff }] }] },
    { label: 'Position', items: [{ t: 'rows', rows: [
      [{ t: 'el', build: () => spinInput('hfTop', 'Header from Top', () => fmtLen(HF.curSec().pg.hd), v => { const px = parseLen(v); if (px >= 0) HF.setDistance('header', px); }) }],
      [{ t: 'el', build: () => spinInput('hfBottom', 'Footer from Bottom', () => fmtLen(HF.curSec().pg.fd), v => { const px = parseLen(v); if (px >= 0) HF.setDistance('footer', px); }) }],
    ] }] },
    { label: 'Close', items: [{ cmd: 'hfClose', icon: 'close', label: 'Close', big: true, tip: 'Close Header and Footer: back to the document (Esc)' }] },
  ] },
  { id: 'picture', label: 'Picture', ctx: true, groups: [
    { label: 'Adjust', items: [{ cmd: 'removeBg', icon: 'removeBg', label: 'Remove Background', big: true, tip: 'Make the paper behind a signature or stamp transparent' }, { cmd: 'resetPic', icon: 'resetPic', label: 'Reset Picture', big: true, tip: 'Undo every crop, rotation and background change', enabled: () => PicEdit.edited(S.selImg) }] },
    { label: 'Arrange', items: [{ menu: 'wrap', icon: 'wrapLeft', label: 'Wrap Text', big: true }, { menu: 'rotate', icon: 'rotateRight', label: 'Rotate', big: true }, { t: 'stack', items: [{ cmd: 'alignLeft', icon: 'alignLeft', label: 'Align Left' }, { cmd: 'alignCenter', icon: 'alignCenter', label: 'Center' }, { cmd: 'alignRight', icon: 'alignRight', label: 'Align Right' }] }] },
    { label: 'Size', items: [{ t: 'el', build: () => { const b = UI.button({ icon: 'crop', label: 'Crop', big: true, tip: 'Crop: drag the black handles, then press Enter', state: () => Crop.active() }); b.dataset.crop = '1'; b.addEventListener('click', () => CMD.crop()); return b; } }, { t: 'rows', rows: [
      [{ t: 'el', build: () => spinInput('imgW', 'Width', () => S.selImg ? fmtLen(S.selImg.offsetWidth) : '', v => { const px = parseLen(v); if (S.selImg && px > 4) Images.setSize(px, 0, true); }) }],
      [{ t: 'el', build: () => spinInput('imgH', 'Height', () => S.selImg ? fmtLen(S.selImg.offsetHeight) : '', v => { const px = parseLen(v); if (S.selImg && px > 4) Images.setSize(S.selImg.offsetWidth * (px / S.selImg.offsetHeight), 0, true); }) }],
    ] }, { cmd: 'resetSize', icon: 'resetSize', label: 'Reset Size', big: true }] },
    { label: 'Style', items: [{ cmd: 'imgBorder', icon: 'imgBorder', label: 'Border', big: true, state: () => S.selImg && S.selImg.classList.contains('img-border') }] },
    { label: 'Picture', items: [{ cmd: 'altText', icon: 'alt', label: 'Alt Text', big: true }, { cmd: 'replaceImg', icon: 'replaceImg', label: 'Change', big: true }, { cmd: 'saveSig', icon: 'signature', label: 'Save as Signature', big: true, tip: 'Keep this picture in your signatures and stamps, to put into other documents' }, { cmd: 'deleteImg', icon: 'trash', label: 'Delete', big: true }] },
  ] },
  /* a shape or text box selected, or its text being typed (Shapes) */
  { id: 'shape', label: 'Shape Format', ctx: true, groups: [
    { label: 'Insert Shapes', items: [{ menu: 'shapes', icon: 'shapes', label: 'Shapes', big: true }, { cmd: 'drawTextBox', icon: 'textBox', label: 'Text Box', big: true, tip: 'Draw a text box' }, { cmd: 'shapeEditText', icon: 'edit', label: 'Edit Text', big: true, tip: 'Type in the shape (or double-click it)', enabled: () => !!Shapes.cur() && !Shapes.isLine(Shapes.cur()) }] },
    { label: 'Shape Styles', launcher: 'formatShape', launcherTip: 'Format Shape…', items: [{ menu: 'shapeStyles', icon: 'shapeStyle', label: 'Styles', big: true, tip: 'Ready-made fills and outlines' }, { t: 'stack', items: [{ menu: 'shapeFill', icon: 'shapeFill', label: 'Shape Fill' }, { menu: 'shapeOutline', icon: 'shapeOutline', label: 'Shape Outline' }, { menu: 'shapeVa', icon: 'vMid', label: 'Align Text' }] }] },
    { label: 'Arrange', items: [{ menu: 'shapeWrap', icon: 'wrapFront', label: 'Wrap Text', big: true }, { menu: 'shapeRotate', icon: 'rotateRight', label: 'Rotate', big: true }, { t: 'stack', items: [{ cmd: 'alignLeft', icon: 'alignLeft', label: 'Align Left' }, { cmd: 'alignCenter', icon: 'alignCenter', label: 'Center' }, { cmd: 'alignRight', icon: 'alignRight', label: 'Align Right' }] }] },
    { label: 'Size', items: [{ t: 'rows', rows: [
      [{ t: 'el', build: () => spinInput('shpH', 'Height', () => { const el = Shapes.cur(); return el ? fmtLen(Shapes.size(el).h) : ''; }, v => { const px = parseLen(v); if (Shapes.cur() && px >= 0) Shapes.setSize(null, px); }) }],
      [{ t: 'el', build: () => spinInput('shpW', 'Width', () => { const el = Shapes.cur(); return el ? fmtLen(Shapes.size(el).w) : ''; }, v => { const px = parseLen(v); if (Shapes.cur() && px >= 0) Shapes.setSize(px, null); }) }],
    ] }] },
    { label: 'Shape', items: [{ cmd: 'formatShape', icon: 'shapeStyle', label: 'Format', big: true, tip: 'Format Shape: fill, line, size, rotation, text margins' }, { cmd: 'deleteShape', icon: 'trash', label: 'Delete', big: true }] },
  ] },
];

/* ===================== Keyboard shortcuts ===================== */
function onGlobalKeyDown(e) {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key;
  const inEditor = S.editor && (S.editor.contains(e.target) || e.target === S.editor);
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !inEditor;
  if (k === 'Escape' && Menu.el) { Menu.close(); return; }
  if (k === 'F12' && !mod && !e.altKey && !e.shiftKey) { e.preventDefault(); Bijoy.key(); return; }
  if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && e.code === 'KeyB') { e.preventDefault(); Bijoy.toggle(); return; }
  if (mod && !e.altKey && (k === 's' || k === 'S') && !e.shiftKey) { e.preventDefault(); CMD.save(); return; }
  if (mod && !e.altKey && (k === 'p' || k === 'P') && !e.shiftKey) { e.preventDefault(); Backstage.open('print'); return; }
  if (mod && !e.altKey && (k === 'o' || k === 'O') && !e.shiftKey) { e.preventDefault(); Backstage.open('open'); return; }
  if (mod && !e.altKey && (k === 'f' || k === 'F') && !e.shiftKey) { e.preventDefault(); Find.open(false); return; }
  if (mod && !e.altKey && (k === 'h' || k === 'H') && !e.shiftKey) { e.preventDefault(); Find.open(true); return; }
  if (mod && !e.altKey && (k === 'g' || k === 'G') && !e.shiftKey) { e.preventDefault(); Dialogs.goTo(); return; }
  if (mod && k === 'F1') { e.preventDefault(); UI.toggleRibbon(); return; }
  if (k === 'F7') { e.preventDefault(); CMD.spelling(); return; }
  if (inField || !inEditor) return;
  if (!mod && !(e.shiftKey && k === 'F3')) return;
  const code = e.code;
  const run = (fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
  if (e.shiftKey && k === 'F3') return run(() => cycleCase());
  if (e.altKey && !e.shiftKey) {
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') return run(() => setBlockStyle('h' + code.slice(-1)));
    if (code === 'KeyM') return run(() => Comments.add());
    if (code === 'KeyF') return run(() => Notes.insert('foot'));
    if (code === 'KeyD') return run(() => Notes.insert('end'));
    return;
  }
  if (e.shiftKey) {
    switch (code) {
      case 'KeyN': return run(() => setBlockStyle('normal'));
      case 'KeyL': return run(() => CMD.bullets());
      case 'KeyE': return run(() => Track.toggle());
      case 'KeyG': return run(() => Dialogs.wordCount());
      case 'KeyM': return run(() => setIndent(-1));
      case 'KeyD': return run(() => setUnderlineStyle('double'));
      case 'KeyA': return run(() => applyInline({ textTransform: curComputed().textTransform === 'uppercase' ? null : 'uppercase' }));
      case 'KeyK': return run(() => applyInline({ fontVariant: /small-caps/.test(curComputed().fontVariant) ? null : 'small-caps' }));
      case 'KeyC': return run(() => Painter.start(false));
      case 'KeyV': if (S.painter) return run(() => Painter.apply()); Paste.plainNext = true; return;
      case 'KeyF': return run(() => { $('#fontName').focus(); });
      case 'KeyP': return run(() => { $('#fontSize').focus(); });
      case 'Period': return run(() => growFont(1));
      case 'Comma': return run(() => growFont(-1));
      case 'Equal': return run(() => CMD.sup());
      case 'Digit8': return run(() => CMD.marks());
      case 'KeyZ': return run(() => redo());
    }
    return;
  }
  switch (code) {
    case 'KeyB': return run(() => CMD.bold());
    case 'KeyI': return run(() => CMD.italic());
    case 'KeyU': return run(() => CMD.underline());
    case 'KeyE': return run(() => CMD.alignCenter());
    case 'KeyL': return run(() => CMD.alignLeft());
    case 'KeyR': return run(() => CMD.alignRight());
    case 'KeyJ': return run(() => CMD.justify());
    case 'KeyK': return run(() => Dialogs.link());
    case 'KeyD': return run(() => Dialogs.font());
    case 'KeyM': return run(() => setIndent(1));
    case 'KeyZ': return run(() => undo());
    case 'KeyY': return run(() => redo());
    case 'Equal': return run(() => CMD.sub());
    case 'BracketRight': return run(() => applyInline(null, t => ({ fontSize: fmtNum(Math.round(parseFloat(getComputedStyle(t.parentNode).fontSize) * 0.75) + 1, 1) + 'pt' })));
    case 'BracketLeft': return run(() => applyInline(null, t => ({ fontSize: fmtNum(Math.max(1, Math.round(parseFloat(getComputedStyle(t.parentNode).fontSize) * 0.75) - 1), 1) + 'pt' })));
    case 'Digit1': return run(() => setLineSpacing(1));
    case 'Digit2': return run(() => setLineSpacing(2));
    case 'Digit5': return run(() => setLineSpacing(1.5));
    case 'Digit0': return run(() => setSpacing('before', curSpacing('before') > 0 ? 0 : 12));
    case 'Space': return run(() => applyInline({ fontWeight: null, fontStyle: null, underline: null, strike: null, color: null, backgroundColor: null, fontSize: null, fontFamily: null, verticalAlign: null }));
  }
}
let _caseIdx = 0;
function cycleCase() { const modes = ['upper', 'lower', 'title']; changeCase(modes[_caseIdx++ % 3]); }

/* ===================== Status bar ===================== */
function buildStatusBar() {
  const sb = $('#statusbar');
  const item = (id, txt, title, fn, cls = '') => { const b = h('button', { class: 'sb-item ' + cls, id, title, type: 'button' }, txt); if (fn) b.addEventListener('click', fn); return b; };
  sb.append(
    item('sbPage', 'Page 1 of 1', 'Go to page', () => Dialogs.goTo()),
    item('sbWords', '0 words', 'Word count', () => Dialogs.wordCount()),
    item('sbLang', 'English (US)', 'Proofing language', e => Menus.language(e.currentTarget), 'sb-lang'),
    (() => { const b = item('sbAvro', '', 'Typing English. Click or press F12 to type Bangla.', () => Bijoy.key(), 'sb-avro'); b.append(iconEl('keyboard'), h('span', { class: 't' }, 'ENG')); return b; })(),
    (() => { const b = item('sbKbd', '', 'Choose the keyboard: English, Avro Phonetic or Bijoy', e => Menus.kbd(e.currentTarget), 'sb-kbd'); b.setAttribute('aria-label', 'Choose the keyboard'); b.setAttribute('aria-haspopup', 'menu'); b.innerHTML = icon('caret'); return b; })(),
    item('sbTrack', 'Track Changes: On', 'Turn off Track Changes', () => Track.toggle(), 'on'),
    h('span', { class: 'sb-item', id: 'sbStore', title: '' }),
    h('span', { class: 'grow' }),
  );
  const views = h('div', { class: 'sb-views' });
  for (const [v, ic, t] of [['read', 'book', 'Read Mode'], ['print', 'page', 'Print Layout'], ['web', 'web', 'Web Layout']]) {
    const b = h('button', { class: 'sb-item', type: 'button', 'data-view': v, title: t, 'aria-label': t, html: icon(ic) });
    b.addEventListener('click', () => setView(v));
    views.appendChild(b);
  }
  sb.appendChild(views);
  const zo = h('button', { class: 'sb-item', id: 'zoomOut', type: 'button', title: 'Zoom out', 'aria-label': 'Zoom out', html: icon('minus') });
  const zi = h('button', { class: 'sb-item', id: 'zoomIn', type: 'button', title: 'Zoom in', 'aria-label': 'Zoom in', html: icon('plus') });
  const sl = h('input', { type: 'range', id: 'zoomSlider', min: '25', max: '300', step: '5', value: '100', 'aria-label': 'Zoom level' });
  const lb = h('button', { class: 'sb-item', id: 'zoomLabel', type: 'button', title: 'Zoom' }, '100%');
  zo.addEventListener('click', () => setZoom(Math.max(0.25, Math.round((S.zoom - 0.1) * 10) / 10)));
  zi.addEventListener('click', () => setZoom(Math.min(3, Math.round((S.zoom + 0.1) * 10) / 10)));
  sl.addEventListener('input', () => setZoom(sl.value / 100));
  lb.addEventListener('click', () => Dialogs.zoom());
  sb.appendChild(h('div', { class: 'zoomctl' }, zo, sl, zi, lb));
  for (const b of sb.querySelectorAll('button')) b.addEventListener('mousedown', e => e.preventDefault());
}
