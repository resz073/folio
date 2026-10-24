/* ===================== Stories =====================
   Word's name for text that isn't the document's own: a header or footer (HF) and a footnote or
   endnote (Notes). One can be open at a time, edited in place on its page: S.editor points at its
   live element (so every command, shortcut, Avro and Track Changes work there), the page's text is
   locked (and dimmed for a header), and it has an undo of its own. Closing it stores what was
   typed and records one undo step of the document.
   A story is { type, el, extras, dim, tab, place(), changed(), clean(el), save(html) → changed,
   after(), caret() } given to Story.open. */
const Story = {
  cur: null,
  open(o) {
    if (this.cur) this.close(true);
    if (typeof Crop !== 'undefined' && Crop.img) Crop.finish();
    Images.deselect(true);
    Menu.close(); MiniBar.hide(); LinkBubble.hide(); AutoComplete.hide();
    if (Find.open_) Find.close();
    if (Hist.timer) histRecord();
    const body = S.editor, r = getRange();
    Object.assign(o, { body, hist: { stack: Hist.stack, idx: Hist.idx }, sel: r ? r.cloneRange() : lastRange });
    this.cur = o;
    o.place();
    $('#paper').append(...(o.extras || []), o.el);
    body.contentEditable = 'false';
    if (o.dim) $('#paper').classList.add('hf-editing');
    S.editor = o.el;
    bindEditor(o.el);
    Hist.stack = []; Hist.idx = -1; Hist.before = null;
    histRecord();
    renderSheets();
    o.el.focus({ preventScroll: true });
    if (o.tab) { UI.showContext(o.tab, true); UI.selectTab(o.tab); }
    UI.refresh();
    return o;
  },
  /* back to the text; keepTab when another story of the same kind opens next */
  close(keepTab) {
    const o = this.cur;
    if (!o) return;
    if (typeof Crop !== 'undefined' && Crop.img) Crop.finish();
    Images.deselect(true);
    const html = o.clean(o.el);
    o.el.remove();
    (o.extras || []).forEach(x => x.remove());
    S.editor = o.body;
    o.body.contentEditable = S.view === 'read' ? 'false' : 'true';
    $('#paper').classList.remove('hf-editing');
    clearTimeout(Hist.timer); Hist.timer = 0;
    Hist.stack = o.hist.stack; Hist.idx = o.hist.idx; Hist.before = null;
    this.cur = null;
    if (o.save(html) || o.dirtyBody) { histRecord(); Saver.mark(); }
    if (o.after) o.after();
    if (!keepTab && o.tab) UI.showContext(o.tab, false);
    S.editor.focus({ preventScroll: true });
    const sel = o.caret ? o.caret() : o.sel;
    if (sel && S.editor.contains(sel.startContainer)) { try { setRange(sel); } catch { } }
    updateUndoButtons();
    UI.refresh();
  },
  /* while editing: keep what is typed (the autosave reads it from here) */
  capture() { const o = this.cur; if (o) o.save(o.clean(o.el), true); },
  place() { if (this.cur) this.cur.place(); },
  /* things that belong to the text (as in Word): said so instead */
  refuse(what) {
    const o = this.cur;
    if (!o) return false;
    const where = o.type === 'note' ? (o.kind === 'end' ? 'an endnote' : 'a footnote') : 'a ' + o.kind;
    toast(`${what} can’t go in ${where}. Close it first (Esc).`);
    return true;
  },
};
/* the document's text (the editor, unless a story is open in it) */
function docBody() { return Story.cur ? Story.cur.body : S.editor; }
