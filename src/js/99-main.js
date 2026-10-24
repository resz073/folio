/* ===================== Documents & boot ===================== */
function openDoc(doc, opts = {}) {
  if (Story.cur) Story.close();
  Images.deselect(true);
  Tables.sel = null;
  if (Find.open_) Find.close();
  AutoComplete.hide(); MiniBar.hide(); LinkBubble.hide(); PasteChip.hide();
  if (Speech.on) Speech.stop();
  Proof.reset();
  const d = newDocModel(doc);
  d.comments = Array.isArray(d.comments) ? d.comments : [];
  S.doc = d;
  S.dirty = false;
  S.editor.innerHTML = d.html || '<p><br></p>';
  stripBlockWhitespace(S.editor);
  normalizeFontStacks(S.editor);
  S.editor.querySelectorAll('[data-pgp]').forEach(n => { n.removeAttribute('data-pgp'); n.style.removeProperty('--pgp'); });
  S.editor.querySelectorAll('tr.pg-spacer, span.pg-line, span.qm').forEach(n => n.remove());
  S.editor.querySelectorAll('.toc').forEach(t => t.setAttribute('contenteditable', 'false'));
  S.editor.style.hyphens = d.hyphenate ? 'auto' : '';
  $('#docTitle').value = d.title || 'Untitled document';
  S.track = !!d.track;
  S.readOnly = false;
  showBanner(null);
  S.editor.contentEditable = S.view === 'read' ? 'false' : 'true';
  S.editor.classList.remove('ro', 'tc-final', 'tc-original');
  S.tcView = 'all';
  S.editor.spellcheck = Prefs.spell;
  applyDocSettings();
  ensureDocFonts();
  fixupAfterInput('', null);
  Layout.cache = new WeakMap();
  Layout.full();
  histReset();
  Comments.render();
  Nav.render();
  Stats.update();
  if (S.zoomMode !== 'custom') fitZoom(); else applyZoom();
  $('#canvas').scrollTop = 0;
  const first = S.editor.firstElementChild;
  if (first && !opts.noFocus && S.view !== 'read') { S.editor.focus({ preventScroll: true }); caretAtStart(first); }
  setSaveState(d._damaged ? 'error' : 'saved', d._damaged ? 'Some parts were missing' : undefined);
  if (d._damaged) toast('Part of this document could not be loaded. Check it before you continue.', { error: true, ms: 8000 });
  UI.refresh();
  if (d.id && !d.sample && Prefs.lastDoc !== d.id && opts.remember !== false) { Prefs.lastDoc = d.id; savePrefs(); }
  if (d.track) toast('Track Changes is on for this document.');
}
async function openStored(id) {
  await Saver.flush();
  const b = busy('Opening…');
  try {
    const doc = await Store.impl.load(id);
    if (!doc) { toast('That document could not be found.', { error: true }); return; }
    openDoc(doc, { fresh: true });
  } catch (e) { console.error(e); toast('That document could not be opened. Try again in a moment.', { error: true }); }
  finally { b.close(); }
}
function initPanes() {
  $$('#sidePane .pane-tab').forEach(t => t.addEventListener('click', () => openPane(t.dataset.pane)));
  $('#paneClose').addEventListener('click', () => closePane());
  $('#navClose').addEventListener('click', () => toggleNav());
  $('#navSearch').addEventListener('input', debounce(() => Nav.render(), 200));
  $('#showResolved').addEventListener('change', () => Comments.render());
  $('#newCommentBtn').addEventListener('click', () => Comments.add());
}
function wireChrome() {
  const title = $('#docTitle');
  title.addEventListener('change', () => { const v = title.value.trim() || 'Untitled document'; title.value = v; if (S.doc.title !== v) { S.doc.title = v; Saver.mark(); renderSheetsSig(); } });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); focusEditor(); } if (e.key === 'Escape') { title.value = S.doc.title; title.blur(); focusEditor(); } });
  $('#qatSave').addEventListener('click', () => CMD.save());
  $('#qatUndo').addEventListener('click', () => undo());
  $('#qatRedo').addEventListener('click', () => redo());
  $$('.titlebar .tb-btn').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  $('#btnShortcuts').addEventListener('click', () => Dialogs.shortcuts());
  $('#btnTheme').addEventListener('click', e => Menus.theme(e.currentTarget));
  const ts = $('#titleSearch');
  ts.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = ts.value; ts.value = ''; Find.open(false, v); } if (e.key === 'Escape') { ts.value = ''; ts.blur(); focusEditor(); } });
  $('#focusExit').addEventListener('click', () => setView('print'));
  document.addEventListener('keydown', onGlobalKeyDown);
  window.addEventListener('resize', debounce(() => { if (S.zoomMode !== 'custom') fitZoom(); if (S.view === 'web') Layout.full(); Ruler.drawSoon(); Images.refreshFrame(); UI.fitRibbon(); }, 120));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => UI.fitRibbon());
  const canvas = $('#canvas');
  canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
  canvas.addEventListener('scroll', debounce(() => { updatePageStatus(); MiniBar.hide(); LinkBubble.hide(); }, 60), { passive: true });
  canvas.addEventListener('mousedown', e => { if (e.target === canvas || e.target === $('#zoomBox')) { e.preventDefault(); focusEditor(); const last = S.editor.lastElementChild; if (last && e.clientY > S.editor.getBoundingClientRect().bottom - 20) caretAtEnd(last); } });
  const ws = $('#workspace');
  let veil = null;
  ws.addEventListener('dragover', e => {
    const types = Array.from(e.dataTransfer.types || []);
    if (!types.includes('Files')) return;
    e.preventDefault();
    if (!veil) { veil = h('div', { class: 'drop-veil' }, 'Drop to open documents or insert pictures'); ws.appendChild(veil); }
  });
  ws.addEventListener('dragleave', e => { if (veil && !ws.contains(e.relatedTarget)) { veil.remove(); veil = null; } });
  ws.addEventListener('drop', e => {
    if (veil) { veil.remove(); veil = null; }
    if (S.editor.contains(e.target)) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    e.preventDefault();
    const imgs = files.filter(f => /^image\//.test(f.type));
    const docs = files.filter(f => /\.(docx|dotx|html?|txt|md|markdown)$/i.test(f.name));
    if (imgs.length) { focusEditor(); Images.insertFiles(imgs); }
    if (docs.length) Files.openFiles(docs);
  });
  S.editor.addEventListener('mousemove', e => { Tables.hoverCursor(e); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Saver.flush(); });
  window.addEventListener('pagehide', () => { Saver.flush(); });
  if (document.fonts) document.fonts.addEventListener('loadingdone', debounce(() => { Layout.cache = new WeakMap(); Layout.full(); }, 150));
}
function renderSheetsSig() { $$('#sheets .sheet').forEach(s => s._sig = null); renderSheets(); }
function updateStoreBadge() {
  const el = $('#sbStore');
  if (!el) return;
  el.innerHTML = icon(Store.cloud ? 'cloud' : 'laptop');
  el.appendChild(document.createTextNode(Store.cloud ? 'Your account' : 'This browser'));
  el.title = Store.cloud ? 'Documents are saved to your Claude account' : 'Documents are saved in this browser only';
  el.querySelector('svg').style.width = '15px';
}
/* settings kept in this browser under the app's earlier name move to 'folio.*' once */
function migrateLocalKeys() {
  try {
    for (const k of ['prefs', 'ruler', 'ribbonCollapsed', 'profile']) {
      const old = localStorage.getItem('quire.' + k);
      if (old == null) continue;
      if (localStorage.getItem('folio.' + k) == null) localStorage.setItem('folio.' + k, old);
      localStorage.removeItem('quire.' + k);
    }
  } catch { }
}
async function boot() {
  migrateLocalKeys();
  Object.assign(Prefs, lsGet('folio.prefs', {}));
  applyTheme();
  S.ruler = lsGet('folio.ruler', true);
  $('#rulerWrap').classList.toggle('off', !S.ruler);
  initEditor();
  Shapes.watch();
  Grid.init();
  buildStatusBar();
  // a provisional document right away, so the first frame is a working editor
  const w = welcomeDoc();
  S.doc = newDocModel(Object.assign({ title: w.title, html: w.html, sample: true }, w.over));
  applyDocSettings();
  UI.build();
  Ruler.init();
  TDraw.init();
  applyGridlines();
  initPanes();
  wireChrome();
  if (lsGet('folio.ribbonCollapsed', false)) UI.toggleRibbon(true);
  const c = $('#canvas');
  if (c.clientWidth < geom().w + 40) S.zoomMode = 'width';
  ensureFont('Noto Sans Bengali');
  openDoc(S.doc, { noFocus: true, remember: false });
  updateStoreBadge();
  setSaveState('saved');
  // storage and the person's saved documents
  try {
    await Store.init();
    await loadPrefs();
    S.avro = !!Prefs.avro;
    S.bijoy = !S.avro && !!Prefs.bijoy;
    applyGridlines();
    UserFonts.loadAll();
    setTimeout(() => Sigs.all(), 2500);   // ready for Insert › Signature
    applyTheme();
    S.ruler = Prefs.ruler != null ? Prefs.ruler : S.ruler;
    updateStoreBadge();
    let list = [];
    try { list = await Store.impl.list(); } catch (e) { console.warn(e); }
    const untouched = S.doc.sample && !S.dirty && Hist.idx <= 0;
    if (list.length && untouched) {
      const pick = (Prefs.lastDoc && list.find(x => x.id === Prefs.lastDoc)) || list.sort((a, b) => (b.modified || 0) - (a.modified || 0))[0];
      const doc = await Store.impl.load(pick.id);
      if (doc && S.doc.sample && !S.dirty && Hist.idx <= 0) openDoc(doc, { noFocus: true });
    }
    setSaveState(S.dirty ? 'dirty' : 'saved');
    if (S.dirty) Saver.mark();
  } catch (e) { console.warn('storage init failed', e); }
  UI.refresh();
}
document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') { document.removeEventListener('DOMContentLoaded', boot); boot(); }
